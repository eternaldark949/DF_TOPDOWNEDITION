        // GameEngine — the parks' moon pools as water (world/parks.js paints them; engine/map-loading.js lists them in
        // map.pools). Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // A pool is shallow: she wades through it at POOL.WADE pace; her steps splash (materialAt
        // → 'water', engine/footsteps.js: the puddle sound and noise, hushed when she sneaks) and each one rings
        // the water round her feet; walking leaves a wake. Its surface stirs on its own, a slow ring now and
        // then. Cars stop at the rim: each pool adds a square collider for driving only (carColliders).

        const POOL = {
            WADE: 0.7,               // pace in the water
            RIM: 10,                 // px of stone round the water (parks.js)
            WAKE_SECS: 0.22,         // a wake ring at most this often while she moves
            RING_LIFE: 1.4, RING_MAX: 24,
            IDLE_SECS: 1.6,          // about this often, a ring stirs on each pool in view
            GLOW_FROM: 0.25, GLOW_FULL: 0.55,   // ambient darkness where the night glow starts, and where it's full
            MOONS: 4                 // little moons drifting on each pool at night, beside the big reflected crescent
        };

        /** A moon on the water: a lit disc cut by a shadow disc offset `cut` radii (0 = full, ~1 = thin crescent) */
        function poolMoon(ctx, x, y, r, cut, tilt, a, inner = 0.92) {
            const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.2);
            g.addColorStop(0, `rgba(200, 210, 255, ${0.32 * a})`); g.addColorStop(1, 'rgba(120, 120, 255, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();         // its halo on the water
            ctx.save();
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            if (cut > 0.02) ctx.arc(x + Math.cos(tilt) * r * cut, y + Math.sin(tilt) * r * cut, r * inner, 0, Math.PI * 2, true);
            ctx.fillStyle = `rgba(246, 240, 255, ${0.85 * a})`; ctx.fill('evenodd');
            ctx.restore();
        }

        engineMixin({
            /** The pool (x, y, r) this point is in the water of, or null */
            poolAt(x, y) {
                const L = this.activeMap && this.activeMap.pools; if (!L) return null;
                for (const p of L) { const dx = x - p.x, dy = y - p.y; if (dx * dx + dy * dy < p.r * p.r) return p; }
                return null;
            },

            /** Pace for a walker standing here: slower in a pool */
            wadeMul(e) { return e && this.poolAt(e.x, e.y) ? POOL.WADE : 1; },

            /** The map's colliders plus a square at each pool, for cars (built once per collider list) */
            carColliders() {
                const map = this.activeMap, base = getColliders(map);
                if (!map.pools || !map.pools.length) return base;
                const C = map._carCols;
                if (C && C.base === base && C.n === base.length) return C.list;
                const list = base.slice();
                for (const p of map.pools) { const h = (p.r + POOL.RIM) * 0.86; list.push({ x: p.x - h, y: p.y - h, w: h * 2, h: h * 2, pool: true }); }
                map._carCols = { base, n: base.length, list };
                return list;
            },

            /** A ring on the water (a step, a wake, the surface stirring) */
            poolRipple(x, y, size = 1) {
                const L = this.poolRings || (this.poolRings = []);
                L.push({ x, y, t0: _gameTimeSec, size });
                if (L.length > POOL.RING_MAX) L.shift();
            },

            /** Once a tick: her wake while she moves in the water, and the pools stirring on their own */
            updatePools() {
                const map = this.activeMap; if (!map || !map.pools || !map.pools.length) return;
                const now = _gameTimeSec, pl = this.player;
                if (pl && !this.isDriving && this.poolAt(pl.x, pl.y)) {
                    const g = pl._gait, moving = g ? g.speed > 0.4 : false;
                    if (moving && now - (this._wakeAt || -9) > POOL.WAKE_SECS) { this._wakeAt = now; this.poolRipple(pl.x, pl.y, this.sneaking ? 0.6 : 0.9); }
                }
                if (now - (this._poolStirAt || -9) > POOL.IDLE_SECS * (0.6 + Math.random() * 0.8)) {
                    this._poolStirAt = now;
                    const v = this.view;
                    for (const p of map.pools) {
                        if (v && (p.x + p.r < v.left || p.x - p.r > v.right || p.y + p.r < v.top || p.y - p.r > v.bottom)) continue;
                        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * p.r * 0.7;
                        this.poolRipple(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0.55);
                    }
                }
            },

            /**
             * After dark, the pools shine (the emissive pass, above the darkness, engine/world-state.js): a soft
             * violet sheen, light wavering across the water, the big reflected crescent glowing, little moons of
             * every phase drifting and bobbing, and the rings lit as they spread.
             */
            drawPoolGlow(ctx, dark) {
                const map = this.activeMap, L = map && map.pools; if (!L || !L.length) return;
                const night = Math.max(0, Math.min(1, (dark - POOL.GLOW_FROM) / (POOL.GLOW_FULL - POOL.GLOW_FROM)));
                if (night < 0.01) return;
                const v = this._cullBounds && this._cullBounds.view, t = _frameTime / 1000, TAU = Math.PI * 2;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (const p of L) {
                    if (v && (p.x + p.r < v.left || p.x - p.r > v.right || p.y + p.r < v.top || p.y - p.r > v.bottom)) continue;
                    const R = p.r, seed = (p.x * 0.013 + p.y * 0.007) % TAU;
                    ctx.save();
                    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.clip();
                    // the sheen: deep violet water catching the sky, brightest up and to the left
                    const sh = ctx.createRadialGradient(p.x - R * 0.3, p.y - R * 0.35, R * 0.05, p.x, p.y, R);
                    sh.addColorStop(0, `rgba(110, 96, 255, ${0.38 * night})`); sh.addColorStop(0.6, `rgba(60, 52, 190, ${0.22 * night})`); sh.addColorStop(1, `rgba(40, 90, 200, ${0.3 * night})`);
                    ctx.fillStyle = sh; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
                    // light wavering across it: thin bands that drift and bend
                    ctx.lineWidth = 1.4;
                    for (let k = 0; k < 7; k++) {
                        const y0 = p.y - R + (k + 0.5) * (R * 2 / 7) + Math.sin(t * 0.6 + k * 1.7 + seed) * 4;
                        ctx.strokeStyle = `rgba(170, 190, 255, ${(0.08 + 0.07 * Math.sin(t * 1.3 + k * 2.1)) * night})`;
                        ctx.beginPath();
                        for (let x = -R; x <= R; x += 8) { const y = y0 + Math.sin(x * 0.07 + t * 1.1 + k) * 2.4; x === -R ? ctx.moveTo(p.x + x, y) : ctx.lineTo(p.x + x, y); }
                        ctx.stroke();
                    }
                    // the big crescent, where the ground paints its reflection (world/parks.js)
                    const pulse = 0.85 + 0.15 * Math.sin(t * 0.8 + seed);
                    poolMoon(ctx, p.x + R * 0.25, p.y - R * 0.2, R * 0.28, 0.357, -0.64, 0.7 * night * pulse, 0.857);   // (the ground already paints it pale)
                    // little moons drifting on slow circles, each its own phase
                    for (let m = 0; m < POOL.MOONS; m++) {
                        const ang = -0.67 + Math.PI / 3 + m * (4 * Math.PI / 3) / (POOL.MOONS - 1) + 0.18 * Math.sin(t * 0.07 + m * 1.9), d = R * [0.66, 0.58, 0.72, 0.6][m % 4];   // round the far side, clear of the big crescent
                        const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d * 0.9 + Math.sin(t * 1.4 + m) * 1.5;
                        const cut = [0, 0.45, 0.8, 1.15][m % 4], a = night * (0.55 + 0.25 * Math.sin(t * 1.1 + m * 2.3 + seed));
                        poolMoon(ctx, x, y, R * (0.06 + 0.015 * (m % 3)), cut, seed + m, a);
                    }
                    ctx.restore();
                }
                // the rings, lit
                const rings = this.poolRings || [], now = _gameTimeSec;
                ctx.lineWidth = 1.2;
                for (const f of rings) {
                    const p = this.poolAt(f.x, f.y) || L.find(q => Math.hypot(f.x - q.x, f.y - q.y) < q.r + 4); if (!p) continue;
                    if (v && (f.x < v.left - 40 || f.x > v.right + 40 || f.y < v.top - 40 || f.y > v.bottom + 40)) continue;
                    const u = (now - f.t0) / POOL.RING_LIFE; if (u < 0 || u > 1) continue;
                    const r = (4 + u * 26) * f.size;
                    ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.clip();
                    ctx.strokeStyle = `rgba(190, 200, 255, ${(1 - u) * (1 - u) * 0.6 * night})`;
                    ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.86, 0, 0, TAU); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
            },

            /** The rings, on the water only (after the decals) */
            drawPoolRipples(ctx, cull) {
                const L = this.poolRings; if (!L || !L.length) return;
                const map = this.activeMap, now = _gameTimeSec;
                for (let i = L.length - 1; i >= 0; i--) if (now - L[i].t0 > POOL.RING_LIFE) L.splice(i, 1);
                ctx.save();
                ctx.lineWidth = 1.1;
                for (const f of L) {
                    if (cull && (f.x < cull.left - 40 || f.x > cull.right + 40 || f.y < cull.top - 40 || f.y > cull.bottom + 40)) continue;
                    const p = this.poolAt(f.x, f.y) || (map.pools || []).find(q => Math.hypot(f.x - q.x, f.y - q.y) < q.r + 4);
                    if (!p) continue;
                    const u = (now - f.t0) / POOL.RING_LIFE, r = (4 + u * 26) * f.size, a = (1 - u) * (1 - u) * 0.7;
                    ctx.save();
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.clip();       // never over the rim
                    ctx.strokeStyle = `rgba(214, 206, 255, ${a})`;
                    ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.86, 0, 0, Math.PI * 2); ctx.stroke();
                    if (u < 0.6) { ctx.strokeStyle = `rgba(255, 236, 200, ${a * 0.5})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 0.55, r * 0.47, 0, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.restore();
                }
                ctx.restore();
            }
        });
