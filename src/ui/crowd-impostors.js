        // ═══ CROWD QUALITY — how the crowd is drawn (Settings → Graphics → Crowd Quality) ═══
        // The crowd: pedestrians, the lobby's and club's guests and staff, and a map's standing
        // NPCs. Never Stella, the crew, enemies or the fallen (they're always drawn live).
        //   high   — fully live (the default)
        //   medium — live, but flat-shaded, with hair and cloth at rest (no physics), no lamp rim
        //   low    — baked: each crowd member's look is drawn once into a strip of frames (an idle
        //            frame and an 8-step walk cycle) and replayed: the contact shadow is drawn live,
        //            then one drawImage. Bakes are lazy (one look a frame), kept for up to
        //            CROWD_BAKE.MAX members (least recently seen go first); anyone not baked yet,
        //            or in a pose that keeps moving (dancing), is drawn as on medium.
        // drawCrowdHumanoid(ctx, entity, config) is the one entry point; the caller has already
        // translated and rotated ctx to the body, as for drawProceduralHumanoid.

        const CROWD_BAKE = { FRAMES: 8, R: 40, Q: 1.25, MAX: 64, PER_FRAME: 1 };

        /** Medium detail for the body being drawn (read by humanShade, hairGeometry, clothGeometry) */
        let _crowdLite = false;

        const CrowdImpostors = {
            cache: new Map(),          // entity → { sig, cv, used }
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

            /** Bake the strip: frame 0 standing, 1..FRAMES the walk cycle, in the body's own frame (facing +x) */
            _bake(e, c, sig) {
                const F = CROWD_BAKE.FRAMES, R = CROWD_BAKE.R, Q = CROWD_BAKE.Q, cell = Math.ceil(R * 2 * Q);
                const cv = document.createElement('canvas'); cv.width = cell * (F + 1); cv.height = cell;
                const g = cv.getContext('2d'); if (!g) return null;
                const parts = sig.split('|'), sp = +parts[4] || 0;
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
                let b = this.cache.get(owner);
                const sig = this._sig(e, c, b);
                if (!b || b.sig !== sig && !(anyStride && b.stride > 0 && this._sameButStride(b, sig))) {
                    if (this._bakedFrame !== _frameTime) { this._bakedFrame = _frameTime; this._bakes = 0; }
                    if (this._bakes >= CROWD_BAKE.PER_FRAME) return false;          // one look a frame; live until then
                    if (!this.cache.has(owner) && this.cache.size >= CROWD_BAKE.MAX) {                   // full: make room from whoever was seen longest ago —
                        let oldK = null, oldT = Infinity;                              // never someone on screen this frame (no thrash)
                        for (const [k, v] of this.cache) if (v.used < oldT) { oldT = v.used; oldK = k; }
                        if (oldK === null || oldT >= _frameTime) return false;
                        this.cache.delete(oldK);
                    }
                    this._bakes++;
                    b = this._bake(e, c, sig);
                    if (!b) return false;
                    this.cache.set(owner, b);
                }
                b.used = _frameTime;
                const g = e._gait, F = CROWD_BAKE.FRAMES, R = CROWD_BAKE.R;
                const walking = g && g.speed > CONFIG.GAIT.STOP_SPEED && b.stride > 0;
                const ph = ((e.walkPhase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                const f = walking ? 1 + (Math.round(ph / (Math.PI * 2) * F) % F) : 0;
                // Contact and sun casts stay live, outside the rotating body sprite.
                if (!c.noShadow && !c.isDriving && _zoomLOD < 2) { const t = ctx.getTransform(); _bodyRot = Math.atan2(t.b, t.a); drawHumanContactShadow(ctx, e); }
                ctx.drawImage(b.cv, b.cell * f, 0, b.cell, b.cell, -R, -R, R * 2, R * 2);
                RenderStats.bodies++; RenderStats.cachedBodies++;
                return true;
            },

            clear() { this.cache.clear(); if (typeof CrowdHybrid !== 'undefined') CrowdHybrid.clear(); }
        };

        /* ═══ HYBRID CROWD (Crowd Quality High) ═══
           A walking passer-by beyond HYBRID.NEAR of her keeps everything that moves on its own live — hair
           and its strand physics, cloth panels (trains, coat tails), the lamp rim, the head's shade, the
           contact shadow, held items — and takes the rest from a bake: the legs and hips (under the cloth
           panels) and the arms, torso and head (over them), each a 16-step walk cycle in the body's own
           frame. The live draw runs as usual and stamps the two layers in place of drawing them
           (_drawHumanoidBody's HY), so hair and cloth sit exactly where the body is. Baked parts are flat
           shaded (they turn with the body; the light doesn't). Cells are baked as they're first needed, a
           few a frame; until a cell exists that body is drawn fully live. Standing, posing, armed, driving,
           hurt or near her: always live. Off: GameSettings.crowdHybrid. */
        const HYBRID = { FRAMES: 16, R: 32, Q: 1.25, MAX: 40, CELLS_PER_FRAME: 3, NEAR: 240, MAX_ZOOM: 1.3 };   // R: body reach (world px) the bake holds; ~0.65 MB of strips each
        const CrowdHybrid = {
            cache: new Map(),          // owner → { sig, stride, under, over, have: Uint8Array, cell, used }
            _frame: -1, _cells: 0,
            /** Is this body drawn hybrid right now? */
            eligible(ctx, e, c) {
                if (GameSettings.crowdHybrid === false || c.isDriving || c._crowdBake || c._hybrid || e._reflectionProxy) return false;
                if (c.pose === 'dance' || c.pose === 'die' || c.poseWhileMoving || (c.stance && c.stance !== 'idle') || (c.weapon && c.weapon.id) ||
                    typeof c.punchTicks === 'number' || c.scopeK) return false;
                if (e._pose && e._pose.w > 0.001) return false;                 // a pose (standing about) moves on its own
                if (e._hitT !== undefined && _gameTimeSec - e._hitT < 0.2) return false;
                const g = e._gait;
                if (!g || !(g.speed > CONFIG.GAIT.STOP_SPEED)) return false;
                const v = typeof game !== 'undefined' && game.view;
                if (v && v.zoom > HYBRID.MAX_ZOOM) return false;                 // zoomed in (a finisher, a photo): sharp, live
                const p = typeof game !== 'undefined' && game.player;
                if (p) { const dx = e.x - p.x, dy = e.y - p.y; if (dx * dx + dy * dy < HYBRID.NEAR * HYBRID.NEAR) return false; }
                return true;
            },
            /** Bake walk frame f (1..FRAMES) of both layers into the strips */
            _bakeCell(e, c, b, f) {
                const F = HYBRID.FRAMES, R = HYBRID.R, Q = HYBRID.Q, cell = b.cell;
                const B = { x: e.x, y: e.y, angle: 0, look: e.look, walkPhase: (f - 1) / F * Math.PI * 2 };
                syncHumanoidGait(B);
                const G = B._gait;
                G.speed = b.stride; G.dirX = 1; G.dirY = 0; G.tick = _simTick; G.prevX = B.x; G.prevY = B.y; G.phasePrev = B.walkPhase;
                const wm = _worldMatrix, wc = _worldCanvas, lite = _crowdLite;
                _crowdLite = true;                                              // flat: the bake turns with the body, the light doesn't
                try {
                    for (const [pass, cv] of [['under', b.under], ['over', b.over]]) {
                        const g = cv.getContext('2d'); if (!g) return false;
                        B._animState = null;
                        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(cell * (f - 1), 0, cell, cell);
                        g.setTransform(Q, 0, 0, Q, cell * (f - 1) + R * Q, R * Q);
                        const cfg = Object.assign({}, c, { lerpSpeed: 1, noShadow: true, poseInstant: true, pose: 'none', _crowdBake: true, _hybrid: { pass } });
                        drawProceduralHumanoid(g, B, cfg);
                    }
                } catch (err) { return false; }
                finally { _crowdLite = lite; _worldMatrix = wm; _worldCanvas = wc; }
                b.have[f] = 1;
                return true;
            },
            /** Draw this body hybrid (true), or false: the caller draws it live */
            draw(ctx, e, c) {
                if (!this.eligible(ctx, e, c)) return false;
                syncHumanoidGait(e);
                const sig = CrowdImpostors._sig(e, c, null), F = HYBRID.FRAMES;
                let b = this.cache.get(e);
                // A change of pace keeps the bake: only the baked legs' stride differs a little, and nothing live
                // hangs from them (rebaking on every easing step would cost more than it saves)
                if (!b || (b.sig !== sig && !CrowdImpostors._sameButStride(b, sig))) {
                    if (!b && this.cache.size >= HYBRID.MAX) {                 // full: the one seen longest ago goes (never one seen this frame)
                        let oldK = null, oldT = Infinity;
                        for (const [k, v] of this.cache) if (v.used < oldT) { oldT = v.used; oldK = k; }
                        if (oldK === null || oldT >= _frameTime) return false;
                        this.cache.delete(oldK);
                    }
                    const parts = sig.split('|'), stride = +parts[4] || 0;
                    if (!(stride > 0)) return false;
                    const cell = Math.ceil(HYBRID.R * 2 * HYBRID.Q);
                    const mk = () => { const cv = document.createElement('canvas'); cv.width = cell * F; cv.height = cell; return cv; };
                    if (b) { b.have.fill(0); b.sig = sig; b.parts = parts; b.stride = stride; }
                    else { b = { sig, parts, stride, under: mk(), over: mk(), have: new Uint8Array(F + 1), cell, used: _frameTime }; this.cache.set(e, b); }
                }
                b.used = _frameTime;
                const ph = ((e.walkPhase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                const f = 1 + (Math.round(ph / (Math.PI * 2) * F) % F);
                if (!b.have[f]) {
                    if (this._frame !== _frameTime) { this._frame = _frameTime; this._cells = 0; }
                    if (this._cells >= HYBRID.CELLS_PER_FRAME) return false;     // a few cells a frame; live until then
                    this._cells++;
                    if (!this._bakeCell(e, c, b, f)) return false;
                }
                const R = HYBRID.R, cell = b.cell, x = cell * (f - 1);
                const cfg = c; const prev = cfg._hybrid;
                cfg._hybrid = { pass: 'stamp', stamp: (g, layer, S) => {
                    // The bake already holds the build's scale: undo the live one round the stamp
                    if (S && (S.x !== 1 || S.y !== 1)) { g.save(); g.scale(1 / S.x, 1 / S.y); }
                    g.drawImage(layer === 'under' ? b.under : b.over, x, 0, cell, cell, -R, -R, R * 2, R * 2);
                    if (S && (S.x !== 1 || S.y !== 1)) g.restore();
                } };
                try { drawProceduralHumanoid(ctx, e, cfg); }
                finally { if (prev === undefined) delete cfg._hybrid; else cfg._hybrid = prev; }
                RenderStats.cachedBodies++;
                return true;
            },
            clear() { this.cache.clear(); }
        };

        /** The crowd's draw: by Crowd Quality (high live, medium lighter, low baked) */
        function drawCrowdHumanoid(ctx, entity, config) {
            const q = GameSettings.crowdQuality || 'high';
            if (q === 'high') {
                if (CrowdHybrid.draw(ctx, entity, config)) return;
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
