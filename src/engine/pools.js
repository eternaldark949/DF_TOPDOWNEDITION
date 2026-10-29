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
            IDLE_SECS: 1.6           // about this often, a ring stirs on each pool in view
        };

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
