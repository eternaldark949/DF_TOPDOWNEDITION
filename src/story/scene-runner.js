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
                const map = typeof game !== 'undefined' ? game.activeMap : null;
                const nav = map ? NavGrid.for(map) : null;
                this.path = points.map(p => {
                    let x = p.x, y = p.y;
                    // As with Walker.goTo, authored points on scenery resolve to a nearby standing spot.
                    if (nav && !nav.walkable(x, y)) {
                        const f = nav.nearestFree(x, y, 6);
                        if (f !== null && f !== undefined) { x = nav.cx(f); y = nav.cy(f); }
                    }
                    return { x, y };
                });
                if (!this.path.length) this.path = null;
                this._navPath = null; this._walkStalled = 0;
                if (speed) this.speed = speed;
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
                    const p = this.path[0], d = Math.hypot(p.x - this.x, p.y - this.y);
                    const map = typeof game !== 'undefined' ? game.activeMap : null;
                    const v = actorSteer(this, p.x, p.y, this.speed, map);
                    gaitCommand(this, v.x, v.y);
                    this.x += v.x; this.y += v.y;
                    if (Math.hypot(v.x, v.y) > 1e-4) {
                        this._walkStalled = 0;
                        if (d > this.speed) this.angle = Math.atan2(v.y, v.x);
                    } else this._walkStalled = (this._walkStalled || 0) + 1;
                    if (Math.hypot(p.x - this.x, p.y - this.y) < 1e-3) {
                        this.path.shift(); this._navPath = null; this._walkStalled = 0;
                        if (!this.path.length) this.path = null;
                    } else if (this._walkStalled >= 300) {
                        // An unreachable route finishes its wait without teleporting the actor through scenery.
                        this.path = null; this._navPath = null; gaitCommand(this, 0, 0);
                    }
                }
                if (this.facing) {
                    const f = this.facing, diff = normalizeAngle(f.to - this.angle);
                    this.angle += diff / Math.max(1, f.left); if (--f.left <= 0) { this.angle = f.to; this.facing = null; }
                }
            }
            draw(ctx) {
                if (!this.visible) return;
                syncHumanoidGait(this);
                const look = { stance: 'idle', ...this.look, pose: this.path ? undefined : (this.pose || undefined) };
                // Scene movement, facing and script waits tick independently. Only known
                // body/prop paint is skipped; preserve gait, weather, pose and RNG seeds.
                if ((!this.prop || this.prop === 'notepad') && !decorativeBodyInView(this.x, this.y, look)) {
                    tickHiddenDecorativeBody(this, look);
                    return;
                }
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
                drawProceduralHumanoid(ctx, this, look);
                if (this.prop === 'notepad') {                     // a small leather notebook in both hands, open
                    ctx.fillStyle = '#3a2418'; ctx.fillRect(7, -4.5, 6, 9);
                    ctx.fillStyle = '#efe6d2'; ctx.fillRect(7.6, -4, 4.8, 8); ctx.strokeStyle = 'rgba(60,40,30,0.5)'; ctx.lineWidth = 0.4;
                    ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(8.2, -2.8 + k * 1.8); ctx.lineTo(11.8, -2.8 + k * 1.8); } ctx.moveTo(10, -4); ctx.lineTo(10, 4); ctx.stroke();
                }
                ctx.restore();
            }
        }

        /** Something the scene draws that isn't a person (the van at the curb): draw(ctx, prop) in world space. */
        class SceneProp {
            constructor(id, draw, x, y, angle = 0) { this.id = id; this.drawFn = draw; this.x = x; this.y = y; this.angle = angle; this.visible = true; }
            tick() {}
            draw(ctx) { if (this.visible) this.drawFn(ctx, this); }
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
            /** The scene plays the crew itself (meta.hideCrew): the real teammates neither move nor draw. */
            get crewOffstage() { return !!(this.active && this.active.meta.hideCrew); }

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
                this._tickTweens();
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

            /** Quit or a load: drop the scene with nothing after it (no flag, no onSkip, its promise never resolves) */
            abort() {
                const A = this.active;
                if (!A) return;
                A.resolve = () => {}; A.meta = Object.assign({}, A.meta, { flag: null });
                this._finish(true);
            }

            _finish(skipped) {
                const A = this.active;
                if (!A) return;
                this.active = null;
                this.ui.clear(); this.vision.hide(0); this.ui.showSkip(false);
                this.actors = [];
                const g = this.game;
                g.camera.sway = 0; g.fieldMask = null; g.vanMoving = undefined;
                if (g.coach) g.coach.dismiss();
                this.ui.memory(0, 0); this._showHud(false);
                if (typeof phoneSystem !== 'undefined' && phoneSystem.endCall) phoneSystem.endCall();
                g.cutscene.end();
                if (A.meta.flag) g.questState[A.meta.flag] = true;
                this.ui.black(1, 0); this.ui.releaseBlack(A.meta.releaseFrames || 50);   // the next scene/map fades itself in under this
                A.resolve({ skipped });
            }

            _tickTweens() {
                const A = this.active; if (!A || !A.tweens) return;
                A.tweens = A.tweens.filter(tw => {
                    tw.t = Math.min(1, tw.t + 1 / tw.frames);
                    tw.obj[tw.key] = tw.from + (tw.to - tw.from) * (SCENE_EASE[tw.ease] || SCENE_EASE.inOut)(tw.t);
                    return tw.t < 1;
                });
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

            /** The HUD inside a scene (for the playable beats): shown over the letterbox, or hidden again. */
            _showHud(on) {
                const ui = document.getElementById('game-ui'); if (!ui) return;
                ui.style.opacity = on ? 1 : (this.active ? 0 : ui.style.opacity);
                ui.classList.toggle('scene-hud', !!on);
                document.body.classList.toggle('scene-hud-on', !!on);          // the letterbox steps back (styles/coach.css)
                syncHudInput(this.game);
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
                    fade(dir, frames = 45, ease) { ui.black(dir === 'out' ? 1 : 0, frames, ease); return { done: () => !ui.fading() }; },
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
                    /** A thing to draw (not a person): draw(ctx, prop) in world space. */
                    prop(id, draw, x, y, angle) {
                        let p = self.actors.find(q => q.id === id);
                        if (!p) { p = new SceneProp(id, draw, x, y, angle); self.actors.push(p); }
                        return p;
                    },
                    /** Ease obj[key] to a value over some frames. */
                    tween(obj, key, to, frames = 30, ease = 'inOut') {
                        const A = self.active, tw = { obj, key, from: obj[key] || 0, to, frames: Math.max(1, frames), ease, t: 0 };
                        (A.tweens || (A.tweens = [])).push(tw);
                        return { done: () => tw.t >= 1 };
                    },
                    /** A gentle road sway on the camera (px); 0 stops it. */
                    sway(px) { g.camera.sway = px; },
                    /** The van hits a seam: a jolt and a thud. */
                    bump(n = 5) { g.triggerShake && g.triggerShake(n); if (typeof audioSys !== 'undefined') audioSys.sfx('bump'); },
                    /** n knocks on the partition, spaced like a fist would. */
                    knock(n = 5, gap = 13) {
                        let k = 0, f = 0;
                        return { done: () => { if (k < n && f % gap === 0) { k++; if (typeof audioSys !== 'undefined') audioSys.sfx('knock'); g.triggerShake && g.triggerShake(1.2); } f++; return k >= n && f > (n - 1) * gap + 8; } };
                    },
                    /** The flashback's look: cooler, softer, a vignette and grain (0..1 over frames). */
                    memory(on, frames = 40) { ui.memory(on === true ? 1 : on === false ? 0 : +on || 0, frames); return { done: () => !ui.memoryEasing() }; },
                    /** Reveal a part of the HUD (ui/hud-reveal.js); with a title/text the coach points at it. */
                    hud(key, opts = {}) { return g.hud ? g.hud.reveal(key, opts) : null; },
                    /** Point at any element (ui/coach.js). */
                    coach(target, opts = {}) { return g.coach ? g.coach.point(typeof target === 'string' ? document.getElementById(target) : target, opts) : null; },
                    /** Show the revealed HUD during the scene (a playable beat), or hide it again. */
                    showHud(on = true) { self._showHud(on); },
                    /** Force 949's field mask on or off for the scene (null: the map decides). */
                    mask(on) { g.fieldMask = on; },
                    /** Wait for several waitables at once. */
                    all(...ws) { const W = ws.map(w => self._toWait(w)); return { done: () => W.every(w => w.done()) }; }
                };
                return s;
            }
        }
