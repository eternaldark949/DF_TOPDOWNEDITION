        // GameEngine — Noise: sounds that give 949 (and fights) away. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js). Enemies hear by sound and
        // see by light (calculatePlayerVisibility); there's no radar. See CONFIG.NOISE.
        engineMixin({
            /**
             * A sound at (x, y) that carries `reach` px in the open. Every ganger in earshot
             * (walls and shut doors muffle it) hears roughly where it came from and goes to look.
             * `fromPlayer` sounds leave a faint ripple, so she learns what gives her away.
             */
            emitNoise(x, y, reach, kind, fromPlayer = true, opts = {}) {
                if (!reach || !this.activeMap) return 0;
                const N = CONFIG.NOISE, walls = this.activeMap.walls, cols = getColliders(this.activeMap), rs = this.roomSystem;
                let heard = 0;
                // opts.hear === false: a sound only she can hear (a guard's own footsteps don't alert the others)
                if (opts.hear !== false) for (const e of this.enemies) {
                    if (!e || e.dead || typeof e.hearNoise !== 'function') continue;
                    const d = Math.hypot(e.x - x, e.y - y);
                    if (d > reach) continue;
                    let r = reach;
                    if (isLineBlocked(x, y, e.x, e.y, walls, cols)) r *= N.WALL;
                    if (rs && rs.active && rs.doorBlocks(x, y, e.x, e.y)) r *= N.DOOR;
                    if (d > r) continue;
                    const k = d / r;                                          // 0 close … 1 at the edge of hearing
                    if (e.hearNoise(x, y, 1 - k, N.ERR_NEAR + (N.ERR_FAR - N.ERR_NEAR) * k)) { heard++; if (this.debugMode) (this._dbgHeard || (this._dbgHeard = [])).push(e); }
                }
                // Debug view's Hearing layer: what this sound reached and who heard it
                if (this.debugMode) {
                    const L = this._dbgNoises || (this._dbgNoises = []);
                    if (L.length < 24) L.push({ x, y, reach, kind, t: _gameTimeSec, heard: (this._dbgHeard || []).map(e => ({ x: e.x, y: e.y })) });
                    this._dbgHeard = null;
                }
                const R = this.noiseRipples || (this.noiseRipples = []);
                if (fromPlayer) {
                    if (heard) this._lastContactAt = _gameTimeSec;
                    // opts.ring === false: no ripple (her footsteps; a puddle step keeps one, small)
                    if (opts.ring !== false && R.filter(r => !r.enemy).length < 12) R.push({ x, y, reach, t: 0, seed: Math.random() * 100 });
                } else if (opts.ring !== false && GameSettings.enemyRings !== false && this.player
                           && Math.hypot(this.player.x - x, this.player.y - y) <= reach && R.filter(r => r.enemy).length < 6) {
                    // theirs, in ember, when it reaches her: gunfire, a dash, a guard's hard steps
                    R.push({ x, y, reach: Math.min(reach, 260), t: 0, seed: Math.random() * 100, enemy: true });
                }
                return heard;
            },

            /** Ripples grow to their reach and fade over half a second. */
            updateNoiseRipples() {
                const R = this.noiseRipples; if (!R || !R.length) return;
                for (let i = R.length - 1; i >= 0; i--) if ((R[i].t += 1 / 30) >= 1) R.splice(i, 1);
            },

            /** The ring's progress this frame: blended between ticks so it glides at any refresh rate */
            _ringT(r) {
                const a = typeof RenderInterp !== 'undefined' && CONFIG.LOOP.INTERPOLATE && !this.paused ? (RenderInterp.alpha || 0) : 0;
                return Math.min(1, r.t + a / 30);
            },

            /** Simple rings (Settings → Sound Rings: Simple): thin, tinted, drawn in the world pass */
            drawNoiseRipples(ctx) {
                const R = this.noiseRipples; if (!R || !R.length || GameSettings.soundRings !== 'simple') return;
                ctx.save(); ctx.lineWidth = 1.2;
                for (const r of R) {
                    const t = this._ringT(r), e = 1 - Math.pow(1 - t, 2);   // ease out
                    ctx.globalAlpha = 0.18 * (1 - t) * (1 - t);              // fades early: mostly gone by half its life
                    ctx.strokeStyle = r.enemy ? '#ff8a5c' : '#d8c6ff';
                    ctx.beginPath(); ctx.arc(r.x, r.y, 12 + (r.reach - 12) * e, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
            },

            /**
             * Mirage rings (the default): each sound is a thick band with a jagged, rippling
             * edge that bends the lit scene beneath it, like heat shimmer, with a faint violet
             * tint and no outline. Screen space, after the lighting. The frame is copied once (quarter size) when
             * any ring is alive; each band is a clip of that copy, scaled out from its centre.
             */
            drawMirageRings(ctx) {
                const R = this.noiseRipples; if (!R || !R.length || (GameSettings.soundRings || 'mirage') !== 'mirage') return;
                const W = this.canvas.width, H = this.canvas.height;
                const v = this.view || { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, shakeX: 0, shakeY: 0 };
                const z = v.zoom;
                let cv = this._mirageCv;
                if (!cv) { cv = this._mirageCv = document.createElement('canvas'); this._mirageCtx = cv.getContext('2d'); }
                const sw = Math.max(1, W >> 2), sh = Math.max(1, H >> 2);
                if (cv.width !== sw || cv.height !== sh) { cv.width = sw; cv.height = sh; }
                let copied = false;
                const N = 72, TAU = Math.PI * 2;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                // the newest few bend the light; older, fainter ones keep only the tinted band
                let bends = 0;
                for (let ri = R.length - 1; ri >= 0; ri--) {
                    const r = R[ri];
                    const t = this._ringT(r), e = 1 - Math.pow(1 - t, 2);
                    const rad = (12 + (r.reach - 12) * e) * z;
                    const cx = (r.x - v.x + (v.shakeX || 0)) * z + W / 2, cy = (r.y - v.y + (v.shakeY || 0)) * z + H / 2;
                    const taper = 1 - 0.82 * e;                                // narrow with radial expansion, retaining 18% at full reach
                    const th = Math.max(4, 11 * z) * taper * 1.015 * 2;
                    const amp = th * 0.7, pad = rad + th + amp;
                    // off screen: wholly outside it, or grown past its farthest corner
                    if (rad - th > Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy))) continue;
                    if (pad < 0 || cx + pad < 0 || cx - pad > W || cy + pad < 0 || cy - pad > H) continue;
                    const bend = bends < 4 && t < 0.6; if (bend) bends++;
                    if (bend && !copied) { this._mirageCtx.drawImage(this.canvas, 0, 0, sw, sh); copied = true; }
                    const seed = r.seed ?? (r.seed = Math.random() * 100), ph = _gameTimeSec;
                    // a rolling swell, a ripple, and fine teeth that flicker: the jagged edge
                    const jag = (a, i) => amp * (0.42 * Math.sin(3 * a + seed + ph * 5) + 0.26 * Math.sin(7 * a - seed * 1.7 - ph * 8)
                        + 0.16 * Math.sin(17 * a + seed * 0.6 + ph * 13) + 0.3 * ((i & 1) ? 1 : -1) * (0.6 + 0.4 * Math.sin(ph * 20 + i)));
                    const outer = new Path2D(), inner = [];
                    for (let i = 0; i <= N; i++) {
                        const a = i / N * TAU, j = jag(a, i % N);
                        const ro = Math.max(0, rad + th / 2 + j), ri = Math.max(0, rad - th / 2 + j * 0.55);
                        const c = Math.cos(a), s = Math.sin(a);
                        if (i === 0) outer.moveTo(cx + c * ro, cy + s * ro); else outer.lineTo(cx + c * ro, cy + s * ro);
                        inner.push(cx + c * ri, cy + s * ri);
                    }
                    outer.closePath();
                    const band = new Path2D(outer);
                    band.moveTo(inner[0], inner[1]);
                    for (let i = 2; i < inner.length; i += 2) band.lineTo(inner[i], inner[i + 1]);
                    band.closePath();
                    const k = (1 - t) * (1 - t);                                  // opacity fades independently of the narrowing band
                    const spawn = Math.max(0, 1 - t * 4);
                    const glowK = k * (1 + 0.2 * spawn * spawn);                    // 20% more visible at spawn, original fade from quarter-life
                    if (bend) {
                        // the bend: the scene under the band, pushed outward from the sound and nudged along it.
                        // Only the band's box is copied back (clamped to the screen), not the whole frame.
                        const x0 = Math.max(0, cx - pad), y0 = Math.max(0, cy - pad);
                        const x1 = Math.min(W, cx + pad), y1 = Math.min(H, cy + pad);
                        if (x1 > x0 && y1 > y0) {
                            const sc = 1 + (0.051 + 6.75 / Math.max(40, rad)) * k;
                            // the source box that lands on [x0,x1]×[y0,y1] once scaled about (cx, cy)
                            const u0 = cx + (x0 - cx) / sc, v0 = cy + (y0 - cy) / sc, u1 = cx + (x1 - cx) / sc, v1 = cy + (y1 - cy) / sc;
                            ctx.save();
                            ctx.clip(band, 'evenodd');
                            ctx.globalAlpha = 0.90 * k;
                            ctx.drawImage(cv, u0 / 4, v0 / 4, (u1 - u0) / 4, (v1 - v0) / 4, x0 + 1.8 * k, y0, x1 - x0, y1 - y0);
                            ctx.restore();
                        }
                    }
                    ctx.globalAlpha = 0.04 * glowK;
                    ctx.fillStyle = r.enemy ? '#ffb08a' : '#efe4ff'; ctx.fill(band, 'evenodd');
                    ctx.globalAlpha = 1;
                }
                ctx.restore();
            },
        });
