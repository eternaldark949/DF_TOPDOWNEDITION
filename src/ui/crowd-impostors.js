        // ═══ CROWD QUALITY — how the crowd is drawn (Settings → Graphics → Crowd Quality) ═══
        // The crowd: pedestrians, the lobby's and club's guests and staff, and a map's standing
        // NPCs. Never Stella, the crew, enemies or the fallen (they're always drawn live).
        //   ultra  — fully live
        //   high   — the walking crowd from shaded bakes with hair and cloth in motion (CrowdBakes below; the default)
        //   medium — live, but flat-shaded, with hair and cloth at rest (no physics), no lamp rim
        //   low    — baked: each crowd member's look is drawn once into a strip of frames (an idle
        //            frame and an 8-step walk cycle) and replayed: the contact shadow is drawn live,
        //            then one drawImage. Bakes are lazy (one look a frame); each member keeps up to
        //            CROWD_BAKE.PER_OWNER of them (a pace that wobbles between two strides finds both
        //            already baked), CROWD_BAKE.MAX in all (least recently seen go first). A walking stride is
        //            baked once they've held it STEADY_S (easing in or out of a stroll they're drawn live). Someone
        //            standing is drawn from the idle frame of any bake of their look (it is the same
        //            frame whatever the stride), and a look first baked standing is only that frame.
        //            Anyone not baked yet, or in a pose that keeps moving (dancing), is drawn as on medium.
        // drawCrowdHumanoid(ctx, entity, config) is the one entry point; the caller has already
        // translated and rotated ctx to the body, as for drawProceduralHumanoid.

        const CROWD_BAKE = { FRAMES: 8, R: 40, Q: 1.25, MAX: 64, PER_OWNER: 3, PER_FRAME: 1, STEADY_S: 0.4 };

        /** Medium detail for the body being drawn (read by humanShade, hairGeometry, clothGeometry) */
        let _crowdLite = false;

        const CrowdImpostors = {
            cache: new Map(),          // entity → [{ sig, parts, stride, cv, cell, used }, ...] (newest first)
            count: 0,                  // bakes kept, all owners
            _bakedFrame: -1, _bakes: 0,

            /** What a bake depends on: the look as drawn, the pose, the stride, rain on them */
            _sig(e, c, baked) {
                const g = e._gait, sp = g ? Math.round(Math.min(3, g.speed) * 2) / 2 : 0;
                const held = c.held ? c.held.type + (c.held.open ?? '') : '';
                const hat = c.hat ? c.hat.type : '', hair = c.hair ? c.hair.type : '';
                const W = typeof weatherAt === 'function' ? weatherAt(e) : null, wet = W && W.rain > 0.05 ? 'r' : '';
                const stride = sp > 0.3 ? Math.max(1, sp) : 0, parts = baked && baked.parts;
                // Reuse the existing key while its components match. Configs are often rebuilt
                // by their callers, so compare values rather than the config object's identity.
                // An unusual component containing "|" keeps the original concatenation rules.
                if (parts && parts.length === 6 && parts[0] === String(c.pose || '') &&
                    parts[1] === String(held) && parts[2] === String(hat) &&
                    parts[3] === String(hair) && parts[4] === String(stride) && parts[5] === wet) return baked.sig;
                return (c.pose || '') + '|' + held + '|' + hat + '|' + hair + '|' + stride + '|' + wet;
            },

            /** The same look as bake `b` in every part but the stride */
            _sameButStride(b, sig) {
                const p = sig.split('|');
                return !!b.parts && p.length === 6 && p.every((v, i) => i === 4 || v === b.parts[i]);
            },
            /** The bake to draw from for `sig`, from this owner's list: [bake, idle only], or null.
                The idle frame doesn't depend on the stride, so anyone standing can use any bake of their look. */
            _find(list, sig, anyStride) {
                if (!list) return null;
                for (const b of list) if (b.sig === sig) return [b, b.stride === 0];
                const standing = sig.split('|')[4] === '0';
                if (standing) { for (const b of list) if (this._sameButStride(b, sig)) return [b, true]; }
                else if (anyStride) { for (const b of list) if (b.stride > 0 && this._sameButStride(b, sig)) return [b, false]; }
                return null;
            },
            /** Keep a new bake (newest first); over PER_OWNER or MAX, drop the least recently seen (never one seen this frame) */
            _store(owner, b) {
                let list = this.cache.get(owner);
                if (!list) this.cache.set(owner, list = []);
                list.unshift(b); this.count++;
                if (list.length > CROWD_BAKE.PER_OWNER) {
                    let oi = -1, oT = Infinity;
                    for (let i = 1; i < list.length; i++) if (list[i].used < oT) { oT = list[i].used; oi = i; }
                    list.splice(oi, 1); this.count--;
                }
                while (this.count > CROWD_BAKE.MAX) {
                    let oldK = null, oldI = -1, oldT = Infinity;
                    for (const [k, l] of this.cache) for (let i = 0; i < l.length; i++) if (l[i].used < oldT) { oldT = l[i].used; oldK = k; oldI = i; }
                    if (oldK === null || oldT >= _frameTime) break;
                    const l = this.cache.get(oldK); l.splice(oldI, 1); this.count--;
                    if (!l.length) this.cache.delete(oldK);
                }
            },

            /** Bake the strip: frame 0 standing, 1..FRAMES the walk cycle, in the body's own frame (facing +x).
                A standing look (stride 0) is only frame 0: its walk frames would never be drawn. */
            _bake(e, c, sig) {
                const R = CROWD_BAKE.R, Q = CROWD_BAKE.Q, cell = Math.ceil(R * 2 * Q);
                const parts = sig.split('|'), sp = +parts[4] || 0, F = sp > 0 ? CROWD_BAKE.FRAMES : 0;
                const { canvas: cv, ctx: g } = canvasKit.createLayer([cell * (F + 1), cell]); if (!g) return null;
                // a stand-in body: same look and place, its gait pinned (no ticks pass, so syncHumanoidGait keeps it)
                const B = { x: e.x, y: e.y, angle: 0, look: e.look, walkPhase: 0 };
                syncHumanoidGait(B);
                const G = B._gait;
                const cfg = Object.assign({}, c, { lerpSpeed: 1, noShadow: true, poseInstant: true, _crowdBake: true });
                const wm = _worldMatrix, wc = _worldCanvas, lite = _crowdLite;
                _crowdLite = true;                                              // at rest, flat: the bake is lit the same whichever way they turn
                try {
                    for (let f = 0; f <= F; f++) {
                        G.speed = f === 0 ? 0 : sp; G.dirX = 1; G.dirY = 0; G.tick = _simTick; G.prevX = B.x; G.prevY = B.y;
                        B.walkPhase = f === 0 ? 0 : (f - 1) / F * Math.PI * 2; G.phasePrev = B.walkPhase;
                        B._animState = null;
                        g.setTransform(Q, 0, 0, Q, cell * f + R * Q, R * Q);
                        drawProceduralHumanoid(g, B, cfg);
                    }
                } catch (err) { return null; }
                finally { _crowdLite = lite; _worldMatrix = wm; _worldCanvas = wc; }
                return { sig, parts, stride: sp, cv, cell, used: _frameTime };
            },

            /** Draw from the bake if there is one (true), else false (the caller draws it live).
                `owner`: whose bake it is (a reflection draws a stand-in of `owner`, and shares its bake).
                `anyStride`: a walking bake does for any pace (reflections: faint and rippling, a stride a little
                long or short can't be seen, and a pedestrian easing in and out of a stroll doesn't rebake). */
            draw(ctx, e, c, owner = e, anyStride = false) {
                if (c.pose === 'dance' || c.pose === 'die') return false;          // poses that keep moving: live
                syncHumanoidGait(e);                                                // the walk (and its footsteps) as the live draw would
                const list = this.cache.get(owner);
                const sig = this._sig(e, c, list && list[0]);
                let hit = this._find(list, sig, anyStride);
                if (!hit) {
                    // easing in or out of a stroll, the pace passes through a stride a moment at a time: they're drawn
                    // live meanwhile, as anyone not baked yet is, rather than a strip baked for each pace on the way
                    const sp = sig.split('|')[4];
                    if (owner._lowSp !== sp) { owner._lowSp = sp; owner._lowSpT = _gameTimeSec; }
                    if (sp !== '0' && _gameTimeSec - owner._lowSpT < CROWD_BAKE.STEADY_S) return false;
                    if (this._bakedFrame !== _frameTime) { this._bakedFrame = _frameTime; this._bakes = 0; }
                    if (this._bakes >= CROWD_BAKE.PER_FRAME) return false;          // one look a frame; live until then
                    if (this.count >= CROWD_BAKE.MAX) {                               // full: there must be room from whoever was seen longest ago —
                        let oldT = Infinity;                                           // never someone on screen this frame (no thrash)
                        for (const l of this.cache.values()) for (const v of l) if (v.used < oldT) oldT = v.used;
                        if (oldT >= _frameTime) return false;
                    }
                    this._bakes++;
                    const nb = this._bake(e, c, sig);
                    if (!nb) return false;
                    this._store(owner, nb);
                    hit = [nb, nb.stride === 0];
                }
                const b = hit[0];
                b.used = _frameTime;
                const g = e._gait, F = CROWD_BAKE.FRAMES, R = CROWD_BAKE.R;
                const walking = !hit[1] && g && g.speed > CONFIG.GAIT.STOP_SPEED && b.stride > 0;
                const ph = ((e.walkPhase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                const f = walking ? 1 + (Math.round(ph / (Math.PI * 2) * F) % F) : 0;
                // Contact and sun casts stay live, outside the rotating body sprite.
                if (!c.noShadow && !c.isDriving && _zoomLOD < 2) { const t = ctx.getTransform(); _bodyRot = Math.atan2(t.b, t.a); drawHumanContactShadow(ctx, e); }
                ctx.drawImage(b.cv, b.cell * f, 0, b.cell, b.cell, -R, -R, R * 2, R * 2);
                RenderStats.bodies++; RenderStats.cachedBodies++;
                return true;
            },

            clear() { this.cache.clear(); this.count = 0; if (typeof CrowdBakes !== 'undefined') CrowdBakes.clear(); }
        };

        // ═══ HIGH: shaded walk bakes, hair and cloth swinging ═══
        // On High the walking crowd is drawn from a bake too, but a full one: shaded as on Ultra (the sun's
        // side for the way they face, rain on them), hair and cloth run through their physics in step with
        // the walk (a few warm-up steps, then a 12-step cycle, so it swings and trails as they stride), and a
        // street lamp's rim painted live over the bake. Each bake is spread over a few frames (BAKE_DRAWS
        // bodies' worth a frame for the whole crowd), so a new look costs about what a few live bodies would;
        // until it's ready they're drawn live. Anyone standing or seated (from IDLE_FROM s after they stop, once
        // their hair has settled) is drawn from POSE FRAMES: the pose they strike this frame (ui/poses.js:
        // breathing, a shift of weight, a glance round, a sip) is rounded to a fine grid (POSE_GRID), and each
        // rounded pose they reach is baked once, into a strip of up to POSE_CELLS frames of their own (the
        // least recently seen frame makes way). A pose they've struck before costs a drawImage; a new one costs
        // one live body (from the same BAKE_DRAWS budget). Anyone dancing, dying, hovering, lit by
        // lightning, in night vision's heat or casting a High lamp silhouette, and anyone seen up close
        // (zoomed past LIVE_SCALE), is drawn live, as on Ultra. Ultra is fully live everywhere.
        const CROWD_HQ = { FRAMES: 12, WARM: 6, R: 40, Q: 1.25, MAX: 40, PER_OWNER: 3, BAKE_DRAWS: 5, LIGHT_STEPS: 8, LIVE_SCALE: 1.6, STRIDE_SLACK: 0.5, IDLE_FROM: 0.6,
                           POSE_CELLS: 16, POSE_MAX: 48, POSE_GRID: { at: 0.5, turn: 0.04, bounce: 0.25, w: 0.25 } };

        const CrowdBakes = {
            bakes: new Map(),          // owner → [bake, ...] (newest first)
            count: 0,
            poses: new Map(),          // owner → their pose frames: { look, env, cv, g, cell, frames: Map(key → { i, rim, used }) }
            job: null,                 // the bake under way: { owner, ... }
            _budgetFrame: -1, _budget: 0,
            _scratch: null,

            /** Facing-dependent light: which of LIGHT_STEPS directions the sun comes from (relative to the body), or -1 (none) */
            _lightStep(rot) {
                if (typeof sunNow !== 'function') return -1;
                const sun = sunNow();
                if (!(sun.day > 0.05) || !(sun.dx || sun.dy)) return -1;
                const N = CROWD_HQ.LIGHT_STEPS, rel = Math.atan2(sun.dy, sun.dx) - rot;
                return ((Math.round(rel / (Math.PI * 2) * N) % N) + N) % N;
            },
            /** Everything a bake's paint depends on besides the look and pace */
            _env(e, light) {
                const sun = typeof sunNow === 'function' ? sunNow() : null;
                const d = sun && sun.day > 0.05 ? Math.round(Math.min(1, sun.day * 1.4) * 5) : 0;
                const W = typeof weatherAt === 'function' ? weatherAt(e) : null, rain = W ? Math.round(W.rain * 4) : 0;
                return light + ':' + d + ':' + (d ? sun.rgb : '') + ':' + rain + ':' + (typeof _zoomLOD !== 'undefined' ? _zoomLOD : 0);
            },
            _look(c) {
                const held = c.held ? c.held.type + (c.held.open ?? '') : '';
                return (c.pose || '') + '|' + held + '|' + (c.hat ? c.hat.type : '') + '|' + (c.hair ? c.hair.type : '');
            },
            /** Should this body be drawn live, as on Ultra? */
            _live(ctx, e, c) {
                if (c.pose === 'dance' || c.pose === 'die' || c.isDriving || c.poseWhileMoving) return true;
                if (c.body && c.body.kind === 'android' && c.body.hover) return true;
                if (typeof SilhouetteFX !== 'undefined' && (SilhouetteFX.glow || SilhouetteFX.heat > 0.01)) return true;
                if (e._hitT !== undefined && _gameTimeSec - e._hitT < 0.2) return true;
                const t = ctx.getTransform();
                if (Math.hypot(t.a, t.b) > CROWD_HQ.LIVE_SCALE) return true;
                if (_lampShadowLevel() >= 2 && !c.noShadow && e.x !== undefined && (typeof _zoomLOD === 'undefined' || _zoomLOD < 2) &&
                    sunNow().night > 0.3 && _lampsNear2(e.x, e.y, CONFIG.HUMAN_SHADE.LAMP_SHADOW_R)) return true;
                return false;
            },
            _find(owner, look, env, sp) {
                const list = this.bakes.get(owner);
                if (!list) return null;
                let best = null, bd = Infinity;
                for (const b of list) {
                    if (b.look !== look || b.env !== env) continue;
                    const dd = Math.abs(b.stride - sp);
                    if (dd < bd) { bd = dd; best = b; }
                }
                return best && bd <= Math.max(CROWD_HQ.STRIDE_SLACK, sp * 0.12) ? best : null;    // a stride a touch long or short can't be seen
            },
            /** A near-enough bake while the right one is made: same look, another light step or pace */
            _near(owner, look) {
                const list = this.bakes.get(owner);
                if (!list) return null;
                for (const b of list) if (b.look === look) return b;
                return null;
            },
            _store(owner, b) {
                let list = this.bakes.get(owner);
                if (!list) this.bakes.set(owner, list = []);
                list.unshift(b); this.count++;
                if (list.length > CROWD_HQ.PER_OWNER) { list.pop(); this.count--; }
                while (this.count > CROWD_HQ.MAX) {                            // full: drop the bake seen longest ago (never one in use this frame)
                    let oldK = null, oldI = -1, oldT = Infinity;
                    for (const [k, l] of this.bakes) for (let i = 0; i < l.length; i++) if (l[i].used < oldT) { oldT = l[i].used; oldK = k; oldI = i; }
                    if (oldK === null || oldT >= _frameTime) break;
                    const l = this.bakes.get(oldK); l.splice(oldI, 1); this.count--;
                    if (!l.length) this.bakes.delete(oldK);
                }
            },

            _startJob(owner, e, c, look, env, light, sp, rot) {
                const F = CROWD_HQ.FRAMES, cell = this._cell();
                const { canvas: cv, ctx: g } = canvasKit.createLayer([cell * F, cell]); if (!g) return null;
                const B = this._standIn(e, light, rot);
                const cfg = Object.assign({}, c, { lerpSpeed: 1, noShadow: true, poseInstant: true, _crowdBake: true });
                return this.job = { owner, look, env, stride: sp, cv, g, cell, B, cfg, step: 0, t0: _gameTimeSec, cadence: humanoidCadence(sp), used: _frameTime };
            },
            _cell() { return Math.ceil(CROWD_HQ.R * 2 * CROWD_HQ.Q); },
            /** A stand-in for them: their look, at the origin of its own little world, lit from the light step's side as they face now */
            _standIn(e, light, rot) {
                const B = { x: 0, y: 0, angle: 0, look: e.look, walkPhase: 0, _bakePed: typeof Pedestrian !== 'undefined' && e instanceof Pedestrian, _wxSeed: 0 };
                syncHumanoidGait(B);
                if (light >= 0) { const sun = sunNow(); B._bakeRot = Math.atan2(sun.dy, sun.dx) - light / CROWD_HQ.LIGHT_STEPS * Math.PI * 2; }
                else B._bakeRot = rot;
                return B;
            },
            /** Paint the stand-in, as it stands now, into the scratch cell (its world: the cell, Q px a unit). Throws if the body does. */
            _paint(B, cfg, cell) {
                const R = CROWD_HQ.R, Q = CROWD_HQ.Q;
                const sc = canvasKit.scratch(this, '_scratch', cell, cell), g = sc.getContext('2d');
                const wm = _worldMatrix, wc = _worldCanvas, lite = _crowdLite, rot = _bodyRot;
                _crowdLite = false;
                try {
                    _worldCanvas = sc;
                    _worldMatrix = new DOMMatrix([Q, 0, 0, Q, R * Q - Q * B.x, R * Q - Q * B.y]);
                    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cell, cell);
                    g.setTransform(Q, 0, 0, Q, R * Q, R * Q);
                    drawProceduralHumanoid(g, B, cfg);
                } finally { _crowdLite = lite; _worldMatrix = wm; _worldCanvas = wc; _bodyRot = rot; }
                return sc;
            },

            /** Run up to `n` steps of the bake under way. Returns the finished bake, or null. */
            _bakeSteps(n) {
                const J = this.job; if (!J) return null;
                const F = CROWD_HQ.FRAMES, W = CROWD_HQ.WARM, cell = J.cell, B = J.B, G = B._gait;
                const gt = _gameTimeSec;
                try {
                    for (let k = 0; k < n && J.step < W + F; k++, J.step++) {
                        const ph = (J.step - W) / F * Math.PI * 2, ticks = ph / J.cadence;
                        _gameTimeSec = J.t0 + ticks / 60;
                        B.x = ticks * J.stride; B.y = 0; B.walkPhase = ph;
                        G.speed = J.stride; G.dirX = 1; G.dirY = 0; G.tick = _simTick; G.prevX = B.x; G.prevY = B.y; G.phasePrev = ph;
                        const sc = this._paint(B, J.cfg, cell);
                        if (J.step >= W) J.g.drawImage(sc, cell * (J.step - W), 0);
                    }
                } catch (err) { this.job = null; return null; }
                finally { _gameTimeSec = gt; }
                if (J.step < W + F) return null;
                this.job = null;
                return { look: J.look, env: J.env, stride: J.stride, cv: J.cv, cell, rim: B._rimGeo || null, used: _frameTime };
            },

            /** Bake work for this frame, from whoever asks first (the bake under way, else theirs) */
            /** This frame's bake budget left (BAKE_DRAWS bodies' worth) */
            _left() {
                if (this._budgetFrame !== _frameTime) { this._budgetFrame = _frameTime; this._budget = CROWD_HQ.BAKE_DRAWS; }
                return this._budget;
            },
            _work(owner, e, c, look, env, light, sp, rot) {
                if (this._left() <= 0) return;
                if (this.job && (this.job.used < _frameTime - 1000)) this.job = null;     // its walker went away
                if (!this.job) { if (!this._startJob(owner, e, c, look, env, light, sp, rot)) return; }
                else if (this.job.owner === owner) this.job.used = _frameTime;
                const J = this.job, n = this._budget;
                this._budget = 0;
                const b = this._bakeSteps(n);
                if (b) this._store(J.owner, b);
            },

            /** The pose struck (humanoidPose's { pose, w }), rounded to POSE_GRID: [its key, the rounded pose (null: none)] */
            _poseKey(P) {
                const G = CROWD_HQ.POSE_GRID, w = P ? Math.round(P.w / G.w) * G.w : 0;
                if (!w || !P.pose) return ['-', null];
                const q = {}; let key = String(w);
                for (const f in P.pose) {
                    const v = P.pose[f];
                    if (Array.isArray(v)) { const a = [Math.round(v[0] / G.at) * G.at, Math.round(v[1] / G.at) * G.at]; q[f] = a; key += '|' + f + a[0] + ',' + a[1]; }
                    else if (typeof v === 'number') { const st = f === 'bounce' ? G.bounce : G.turn, r = Math.round(v / st) * st; q[f] = r; key += '|' + f + r.toFixed(2); }
                    else { q[f] = v; key += '|' + f + v; }
                }
                return [key, { pose: q, w }];
            },
            /** Their pose frames for this look and light (new, empty, when either changed) */
            _poseStrip(e, look, env) {
                let A = this.poses.get(e);
                if (A && A.look === look && A.env === env) return A;
                if (!A) {
                    while (this.poses.size >= CROWD_HQ.POSE_MAX) {             // full: drop whoever was seen longest ago (never one seen this frame)
                        let oldK = null, oldT = Infinity;
                        for (const [k, s] of this.poses) if (s.used < oldT) { oldT = s.used; oldK = k; }
                        if (oldK === null || oldT >= _frameTime) break;
                        this.poses.delete(oldK);
                    }
                    const cell = this._cell(), { canvas: cv, ctx: g } = canvasKit.createLayer([cell * CROWD_HQ.POSE_CELLS, cell]);
                    if (!g) return null;
                    A = { cv, g, cell, look, env, frames: new Map(), used: _frameTime };
                    this.poses.set(e, A);
                }
                A.look = look; A.env = env; A.frames.clear();
                return A;
            },
            /** Bake one pose frame into the strip (into a free cell, else the one seen longest ago). Returns it, or null. */
            _bakePose(A, e, c, key, qp, light, rot) {
                let i = A.frames.size;
                if (i >= CROWD_HQ.POSE_CELLS) {
                    let oldK = null, oldT = Infinity;
                    for (const [k, f] of A.frames) if (f.used < oldT) { oldT = f.used; oldK = k; }
                    i = A.frames.get(oldK).i; A.frames.delete(oldK);
                }
                const B = this._standIn(e, light, rot), G = B._gait;
                G.speed = 0; G.dirX = 1; G.dirY = 0; G.tick = _simTick; G.prevX = 0; G.prevY = 0; G.phasePrev = 0;
                const cfg = Object.assign({}, c, { lerpSpeed: 1, noShadow: true, poseInstant: true, _crowdBake: true, _pose: qp });
                let sc;
                try { sc = this._paint(B, cfg, A.cell); } catch (err) { return null; }
                A.g.clearRect(A.cell * i, 0, A.cell, A.cell);
                A.g.drawImage(sc, A.cell * i, 0);
                const f = { i, rim: B._rimGeo || null, used: _frameTime };
                A.frames.set(key, f);
                return f;
            },
            /** A standing or seated body, from its pose frames (true), else false (the caller draws live) */
            _drawPose(ctx, e, c, g, rot) {
                const light = this._lightStep(rot), look = this._look(c), env = this._env(e, light);
                const [key, qp] = this._poseKey(humanoidPose(e, c, g ? g.speed : 0, c.gender || 'androgynous'));
                const A = this._poseStrip(e, look, env); if (!A) return false;
                A.used = _frameTime;
                let f = A.frames.get(key);
                if (!f) {
                    if (this._left() <= 0) return false;
                    this._budget--;
                    f = this._bakePose(A, e, c, key, qp, light, rot);
                    if (!f) return false;
                }
                f.used = _frameTime;
                this._stamp(ctx, e, c, A.cv, A.cell, f.i, f.rim, rot);
                return true;
            },
            /** Draw cell `i` of a bake: the contact shadow, the body, a street lamp's rim (live as they pass it) */
            _stamp(ctx, e, c, cv, cell, i, rim, rot) {
                const R = CROWD_HQ.R;
                if (!c.noShadow && _zoomLOD < 2) { _bodyRot = rot; drawHumanContactShadow(ctx, e); }
                ctx.drawImage(cv, cell * i, 0, cell, cell, -R, -R, R * 2, R * 2);
                if (rim) {
                    _bodyRot = rot;
                    const SH = humanShade(ctx, e, { _wet: 0 });
                    if (SH && SH.rim) {
                        const S = bodyScale(c);
                        if (S) { ctx.save(); ctx.scale(S.x, S.y); }
                        drawHumanRim(ctx, SH.rim, rim.rimY, rim.hcx, rim.hr);
                        if (S) ctx.restore();
                    }
                }
                RenderStats.bodies++; RenderStats.cachedBodies++;
            },

            /** Draw from a bake (true), else false (the caller draws live). */
            draw(ctx, e, c) {
                if (this._live(ctx, e, c)) return false;
                const g = syncHumanoidGait(e);
                const sp = g ? Math.round(g.speed * 2) / 2 : 0;
                const t = ctx.getTransform(), rot = Math.atan2(t.b, t.a);
                if (!(g && g.speed > CONFIG.GAIT.STOP_SPEED) || sp < 0.5) {                        // standing (or seated): pose frames, once their hair has settled
                    if (e._crowdStopT == null) e._crowdStopT = _gameTimeSec;
                    if (_gameTimeSec - e._crowdStopT < CROWD_HQ.IDLE_FROM) return false;
                    return this._drawPose(ctx, e, c, g, rot);
                }
                e._crowdStopT = null;
                const light = this._lightStep(rot), look = this._look(c), env = this._env(e, light);
                let b = this._find(e, look, env, sp);
                if (!b) {
                    const steady = e._crowdHQsp === sp; e._crowdHQsp = sp;           // easing in or out of a stroll: don't bake every pace on the way
                    if (steady) this._work(e, e, c, look, env, light, sp, rot);
                    b = this._find(e, look, env, sp);
                    if (!b) { b = this._near(e, look); if (!b || light < 0 && b.env !== env) return false; }
                } else e._crowdHQsp = sp;
                if (this.job && this.job.owner === e) this.job.used = _frameTime;
                b.used = _frameTime;
                const F = CROWD_HQ.FRAMES;
                const ph = ((e.walkPhase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                this._stamp(ctx, e, c, b.cv, b.cell, Math.round(ph / (Math.PI * 2) * F) % F, b.rim, rot);
                return true;
            },

            clear() { this.bakes.clear(); this.count = 0; this.job = null; this.poses.clear(); }
        };

        /** The crowd's draw: by Crowd Quality (ultra live, high shaded walk bakes, medium lighter, low baked) */
        function drawCrowdHumanoid(ctx, entity, config) {
            const q = GameSettings.crowdQuality || 'high';
            if (q === 'ultra') return drawProceduralHumanoid(ctx, entity, config);
            if (q === 'high') {
                if (!RenderStats.timed) { if (CrowdBakes.draw(ctx, entity, config)) return; }
                else {
                    const t0 = performance.now(), pm = RenderStats.peopleMs;
                    const ok = CrowdBakes.draw(ctx, entity, config);
                    RenderStats.peopleMs = pm + (performance.now() - t0);
                    if (ok) return;
                }
                return drawProceduralHumanoid(ctx, entity, config);
            }
            if (q === 'low') {
                if (!RenderStats.timed) { if (CrowdImpostors.draw(ctx, entity, config)) return; }
                else {                                                              // a baked body is still a body: Entities: People
                    const t0 = performance.now(), pm = RenderStats.peopleMs;
                    const ok = CrowdImpostors.draw(ctx, entity, config);
                    RenderStats.peopleMs = pm + (performance.now() - t0);
                    if (ok) return;
                }
            }
            _crowdLite = true;
            try { drawProceduralHumanoid(ctx, entity, config); } finally { _crowdLite = false; }
        }
