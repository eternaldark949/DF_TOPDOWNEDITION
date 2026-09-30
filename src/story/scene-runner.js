        /* =====================================================================
           SCENES — the story's director
           ---------------------------------------------------------------------
           A scene is a generator function: a screenplay the engine plays one sim
           tick at a time. Each `yield` waits on something — frames, a line being
           read, a camera move, a choice — and the script reads top to bottom:

               defineScene('prologue', { startMap: {...}, onSkip(game) {...} }, function* (s) {
                   yield s.card(POEM, { sign: '~ Unknown' });
                   s.cam.to('keeper_house', { zoom: 0.8, frames: 900 });
                   yield s.say('traveler', 'So, tell me what happened.');
                   const pick = yield s.choose(['Yes', 'No']);
               });

           Scripts live in story/scenes/; the look lives in ui/cinematic-dialogue.js.
           Running on sim ticks (not setTimeout) means a scene pauses with the game,
           plays the same every time, and can be tested headless.

           What a script may yield:
             nothing          wait one tick
             a number         wait that many ticks
             a waitable       { done(): bool, value?(): any } — what the verbs return
           ===================================================================== */
        const SCENES = {};
        function defineScene(name, meta, script) { SCENES[name] = { meta: meta || {}, script }; }

        const SCENE_EASE = {
            linear: t => t,
            smooth: t => t * t * (3 - 2 * t),
            inOut: t => 0.5 - Math.cos(Math.PI * t) / 2,
            out: t => 1 - (1 - t) * (1 - t)
        };

        /** Someone the scene moves and poses: drawn as a procedural humanoid in the world. */
        class SceneActor {
            constructor(id, look, x, y, angle = 0) {
                this.id = id; this.look = look; this.x = x; this.y = y; this.angle = angle;
                this.pose = null; this.path = null; this.speed = 1.6; this.visible = true;
                this.prop = null;          // something in their hands the scene draws (e.g. 'notepad')
                this.facing = null;        // eased turning target (radians)
            }
            /** Walk a list of points at `speed` px/tick; done when they arrive. */
            walk(points, speed) {
                this.path = points.map(p => ({ x: p.x, y: p.y })); if (speed) this.speed = speed;
                return { done: () => !this.path };
            }
            face(target, frames = 20) {
                const t = typeof target === 'number' ? target : Math.atan2(target.y - this.y, target.x - this.x);
                this.facing = { to: t, left: frames };
                return { done: () => !this.facing };
            }
            /** Hold a pose from ui/poses.js. Seeded as already settled, so a seated actor starts seated. */
            setPose(name) {
                this.pose = name;
                if (!this._pose) this._pose = { still: 5, t: 0, name, w: 1, last: _gameTimeSec, seed: 7 };
                return this;
            }
            tick() {
                if (this.path) {
                    const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
                    if (d <= this.speed) { this.x = p.x; this.y = p.y; this.path.shift(); if (!this.path.length) this.path = null; }
                    else { this.x += dx / d * this.speed; this.y += dy / d * this.speed; this.angle = Math.atan2(dy, dx); }
                }
                if (this.facing) {
                    const f = this.facing, diff = normalizeAngle(f.to - this.angle);
                    this.angle += diff / Math.max(1, f.left); if (--f.left <= 0) { this.angle = f.to; this.facing = null; }
                }
            }
            draw(ctx) {
                if (!this.visible) return;
                syncHumanoidGait(this);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
                drawProceduralHumanoid(ctx, this, { stance: 'idle', ...this.look, pose: this.path ? undefined : (this.pose || undefined) });
                if (this.prop === 'notepad') {                     // a small leather notebook in both hands, open
                    ctx.fillStyle = '#3a2418'; ctx.fillRect(7, -4.5, 6, 9);
                    ctx.fillStyle = '#efe6d2'; ctx.fillRect(7.6, -4, 4.8, 8); ctx.strokeStyle = 'rgba(60,40,30,0.5)'; ctx.lineWidth = 0.4;
                    ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(8.2, -2.8 + k * 1.8); ctx.lineTo(11.8, -2.8 + k * 1.8); } ctx.moveTo(10, -4); ctx.lineTo(10, 4); ctx.stroke();
                }
                ctx.restore();
            }
        }

        class ScenePlayer {
            constructor(game) {
                this.game = game;
                this.active = null;           // the running scene
                this.actors = [];
                this.ui = new CinematicDialogue(game);
                this.vision = new SceneVision();
            }
            get running() { return !!this.active; }

            /** Play a scene by name. Resolves when it ends (or is skipped). */
            play(name, opts = {}) {
                const def = SCENES[name];
                if (!def) { console.warn('No scene', name); return Promise.resolve(); }
                if (this.active) this._finish(true);
                const g = this.game, meta = def.meta;
                return new Promise(resolve => {
                    const A = this.active = { name, meta, opts, resolve, frame: 0, wait: null, value: undefined, cam: null, skipHold: 0 };
                    this.actors = [];
                    this.ui.black(1, 0);                                    // scenes open on black
                    if (meta.startMap) this._loadMap(meta.startMap.id, meta.startMap.at);
                    g.cutscene.start();
                    if (g.player) g.player.visible = meta.showPlayer !== false ? g.player.visible : false;
                    this.ui.showSkip(!meta.noSkip, () => this.skip());
                    A.gen = def.script(this._verbs());
                });
            }

            /** One sim tick (from update.js). */
            update() {
                const A = this.active;
                if (!A) return;
                this._lockInput();
                A.frame++;
                this._tickCam();
                for (const a of this.actors) a.tick();
                this.ui.tick();
                this.vision.tick();
                // Run the script until it waits on something that isn't done
                for (let guard = 0; guard < 64 && this.active === A; guard++) {
                    if (A.wait) {
                        if (!A.wait.done()) return;
                        A.value = A.wait.value ? A.wait.value() : undefined; A.wait = null;
                    }
                    let r;
                    try { r = A.gen.next(A.value); }
                    catch (e) { console.error('Scene', A.name, e); this._finish(false); return; }
                    A.value = undefined;
                    if (r.done) { this._finish(false); return; }
                    A.wait = this._toWait(r.value);
                }
            }

            /** Actors, in the world pass (under the lighting, like any NPC). */
            drawActors(ctx) { for (const a of this.actors) a.draw(ctx); }

            skip() {
                const A = this.active;
                if (!A) return;
                try { if (A.meta.onSkip) A.meta.onSkip(this.game); } catch (e) { console.error(e); }
                this._finish(true);
            }

            _finish(skipped) {
                const A = this.active;
                if (!A) return;
                this.active = null;
                this.ui.clear(); this.vision.hide(0); this.ui.showSkip(false);
                this.actors = [];
                const g = this.game;
                g.cutscene.end();
                if (A.meta.flag) g.questState[A.meta.flag] = true;
                this.ui.black(1, 0); this.ui.releaseBlack(A.meta.releaseFrames || 50);   // the next scene/map fades itself in under this
                A.resolve({ skipped });
            }

            _toWait(v) {
                if (v === undefined || v === null) return { done: () => true };
                if (typeof v === 'number') { let n = v; return { done: () => --n <= 0 }; }
                if (typeof v.done === 'function') return v;
                return { done: () => true };
            }

            _lockInput() {
                const g = this.game;
                if (g.joystick) { g.joystick.active = false; g.joystick.dx = 0; g.joystick.dy = 0; }
                if (g.fireJoystick) { g.fireJoystick.active = false; g.fireJoystick.firing = false; }
                g.mouseDown = false;
                if (g.keys) for (const k in g.keys) g.keys[k] = false;
            }

            _loadMap(id, at) {
                const g = this.game;
                g._doLoadMap(id, at || null);
                g.bakeStaticLighting();
                g.player.visible = false;                   // she isn't in the story's frame yet
                g.player.x = at ? at.x : g.player.x; g.player.y = at ? at.y : g.player.y;
            }

            _landmark(t) {
                if (typeof t === 'string') { const L = this.game.getLandmark(t); return { x: L.x, y: L.y }; }
                if (t instanceof SceneActor) return { x: t.x, y: t.y };
                return t;
            }

            _tickCam() {
                const A = this.active, g = this.game, C = A.cam, cs = g.cutscene;
                if (C) {
                    C.t = Math.min(1, C.t + 1 / C.frames);
                    const k = (SCENE_EASE[C.ease] || SCENE_EASE.inOut)(C.t);
                    g.camera.x = C.x0 + (C.x1 - C.x0) * k; g.camera.y = C.y0 + (C.y1 - C.y0) * k;
                    g.camera.zoom = C.z0 + (C.z1 - C.z0) * k;
                    if (C.t >= 1) A.cam = null;
                }
                cs.camTargetX = g.camera.x; cs.camTargetY = g.camera.y; cs.camZoomTarget = g.camera.zoom;   // hold still between moves
            }

            /** The verbs a script is handed. */
            _verbs() {
                const self = this, g = this.game, ui = this.ui;
                const s = {
                    game: g,
                    frame: () => self.active ? self.active.frame : 0,
                    wait: n => n,
                    waitTap: () => ui.waitTap(),
                    fade(dir, frames = 45) { ui.black(dir === 'out' ? 1 : 0, frames); return { done: () => !ui.fading() }; },
                    card(lines, opts = {}) { return ui.card(lines, opts); },
                    marker(place, time, opts) { ui.marker(place, time, opts); },
                    map(id, opts = {}) {
                        if (g.activeMap && g.activeMap.id !== id) self.actors = [];
                        if (!g.activeMap || g.activeMap.id !== id) self._loadMap(id, opts.at);
                        const L = opts.cam ? self._landmark(opts.cam) : { x: g.player.x, y: g.player.y };
                        g.camera.x = L.x; g.camera.y = L.y; g.camera.zoom = opts.zoom || 1; self.active.cam = null;
                        return null;
                    },
                    /** Fade out, change map, fade in. */
                    cut(id, opts = {}) {
                        let stage = 0;
                        ui.black(1, opts.out ?? 30);
                        return { done: () => {
                            if (stage === 0 && !ui.fading()) { s.map(id, opts); if (opts.then) opts.then(); ui.black(0, opts.in ?? 40); stage = 1; }
                            return stage === 1 && !ui.fading();
                        } };
                    },
                    cam: {
                        to(target, opts = {}) {
                            const L = self._landmark(target);
                            self.active.cam = { x0: g.camera.x, y0: g.camera.y, z0: g.camera.zoom, x1: L.x + (opts.dx || 0), y1: L.y + (opts.dy || 0),
                                                z1: opts.zoom ?? g.camera.zoom, frames: Math.max(1, opts.frames || 90), ease: opts.ease || 'inOut', t: 0 };
                            const me = self.active.cam;
                            return { done: () => !self.active || self.active.cam !== me };
                        },
                        cut(target, zoom) { const L = self._landmark(target); g.camera.x = L.x; g.camera.y = L.y; if (zoom) g.camera.zoom = zoom; self.active.cam = null; },
                        shake(n = 4) { g.triggerShake && g.triggerShake(n); }
                    },
                    actor(id, look, x, y, angle) {
                        let a = self.actors.find(q => q.id === id);
                        if (!a) { a = new SceneActor(id, typeof look === 'string' ? APPEARANCES[look] : look, x, y, angle); self.actors.push(a); }
                        return a;
                    },
                    /** A line. Waits until it's been read (tap) or, with auto, for its reading time. */
                    say(speaker, text, opts = {}) { return ui.say(speaker, text, opts); },
                    /** The novel's narration, in italics, no name. */
                    narrate(text, opts = {}) { return ui.say(null, text, opts); },
                    clearLine() { ui.hideLine(); },
                    choose(options, opts = {}) { return ui.choose(options, opts); },
                    music(track, vol) { if (typeof audioSys !== 'undefined' && audioSys.playTrack) audioSys.playTrack(track, vol); },
                    sfx(name) { if (typeof audioSys !== 'undefined') audioSys.sfx(name); },
                    flag(key, v = true) { g.questState[key] = v; },
                    vision: self.vision,
                    /** Wait for several waitables at once. */
                    all(...ws) { const W = ws.map(w => self._toWait(w)); return { done: () => W.every(w => w.done()) }; }
                };
                return s;
            }
        }
