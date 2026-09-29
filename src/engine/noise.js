        // GameEngine — Noise: sounds that give 949 (and fights) away. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js). Enemies hear by sound and
        // see by light (calculatePlayerVisibility); there's no radar. See CONFIG.NOISE.
        engineMixin({
            /**
             * A sound at (x, y) that carries `reach` px in the open. Every ganger in earshot
             * (walls and shut doors muffle it) hears roughly where it came from and goes to look.
             * `fromPlayer` sounds leave a faint ripple, so she learns what gives her away.
             */
            emitNoise(x, y, reach, kind, fromPlayer = true) {
                if (!reach || !this.activeMap) return 0;
                const N = CONFIG.NOISE, walls = this.activeMap.walls, cols = getColliders(this.activeMap), rs = this.roomSystem;
                let heard = 0;
                for (const e of this.enemies) {
                    if (!e || e.dead || typeof e.hearNoise !== 'function') continue;
                    const d = Math.hypot(e.x - x, e.y - y);
                    if (d > reach) continue;
                    let r = reach;
                    if (isLineBlocked(x, y, e.x, e.y, walls, cols)) r *= N.WALL;
                    if (rs && rs.active && rs.doorBlocks(x, y, e.x, e.y)) r *= N.DOOR;
                    if (d > r) continue;
                    const k = d / r;                                          // 0 close … 1 at the edge of hearing
                    if (e.hearNoise(x, y, 1 - k, N.ERR_NEAR + (N.ERR_FAR - N.ERR_NEAR) * k)) heard++;
                }
                if (fromPlayer) {
                    if (heard) this._lastContactAt = _gameTimeSec;
                    const R = this.noiseRipples || (this.noiseRipples = []);
                    if (R.length < 12) R.push({ x, y, reach, t: 0 });
                }
                return heard;
            },

            /** Ripples grow to their reach and fade over half a second. */
            updateNoiseRipples() {
                const R = this.noiseRipples; if (!R || !R.length) return;
                for (let i = R.length - 1; i >= 0; i--) if ((R[i].t += 1 / 30) >= 1) R.splice(i, 1);
            },

            drawNoiseRipples(ctx) {
                const R = this.noiseRipples; if (!R || !R.length) return;
                ctx.save(); ctx.lineWidth = 1.6;
                for (const r of R) {
                    const e = 1 - Math.pow(1 - r.t, 2);                       // ease out
                    ctx.globalAlpha = 0.38 * (1 - r.t);
                    ctx.strokeStyle = '#f2ecff';
                    ctx.beginPath(); ctx.arc(r.x, r.y, 12 + (r.reach - 12) * e, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();
            },
        });
