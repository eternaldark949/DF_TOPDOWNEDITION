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

            /** Draw from the bake if there is one (true), else false (the caller draws it live) */
            draw(ctx, e, c) {
                if (c.pose === 'dance' || c.pose === 'die') return false;          // poses that keep moving: live
                syncHumanoidGait(e);                                                // the walk (and its footsteps) as the live draw would
                let b = this.cache.get(e);
                const sig = this._sig(e, c, b);
                if (!b || b.sig !== sig) {
                    if (this._bakedFrame !== _frameTime) { this._bakedFrame = _frameTime; this._bakes = 0; }
                    if (this._bakes >= CROWD_BAKE.PER_FRAME) return false;          // one look a frame; live until then
                    if (!b && this.cache.size >= CROWD_BAKE.MAX) {                   // full: make room from whoever was seen longest ago —
                        let oldK = null, oldT = Infinity;                              // never someone on screen this frame (no thrash)
                        for (const [k, v] of this.cache) if (v.used < oldT) { oldT = v.used; oldK = k; }
                        if (oldK === null || oldT >= _frameTime) return false;
                        this.cache.delete(oldK);
                    }
                    this._bakes++;
                    b = this._bake(e, c, sig);
                    if (!b) return false;
                    this.cache.set(e, b);
                }
                b.used = _frameTime;
                const g = e._gait, F = CROWD_BAKE.FRAMES, R = CROWD_BAKE.R;
                const walking = g && g.speed > CONFIG.GAIT.STOP_SPEED && b.stride > 0;
                const ph = ((e.walkPhase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                const f = walking ? 1 + (Math.round(ph / (Math.PI * 2) * F) % F) : 0;
                // the contact shadow, live (it follows the sun and their facing)
                if (!c.noShadow && !c.isDriving && _zoomLOD < 2) { const t = ctx.getTransform(); _bodyRot = Math.atan2(t.b, t.a); drawHumanContactShadow(ctx, e); }
                ctx.drawImage(b.cv, b.cell * f, 0, b.cell, b.cell, -R, -R, R * 2, R * 2);
                RenderStats.bodies++; RenderStats.cachedBodies++;
                return true;
            },

            clear() { this.cache.clear(); }
        };

        /** The crowd's draw: by Crowd Quality (high live, medium lighter, low baked) */
        function drawCrowdHumanoid(ctx, entity, config) {
            const q = GameSettings.crowdQuality || 'high';
            if (q === 'high') return drawProceduralHumanoid(ctx, entity, config);
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
