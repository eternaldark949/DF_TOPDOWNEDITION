        // =====================================================================
        //  NAV GRID — walkability grid + A* / Dijkstra for companions
        // =====================================================================
        // One map grid, with exact swept-body checks for smoothing and movement.
        // Solid props stay live (including rotation); changed footprints update only
        // their occupied cells. Geometry is checked once per simulation tick, using
        // persistent membership buffers rather than rebuilding duplicate sets each tick.
        class NavGrid {
            static _empty = Object.freeze([]);
            static for(map) {
                if (!map) return null;
                const c = NavGrid._cache;
                if (!c || c.map !== map || c.grid.width !== map.width || c.grid.height !== map.height) {
                    NavGrid._cache = { map, grid: new NavGrid(map) };
                }
                const grid = NavGrid._cache.grid;
                grid._refresh();
                return grid;
            }

            constructor(map) {
                this.map = map; this.width = map.width; this.height = map.height;
                this.cell = CONFIG.NAV.CELL; this.radius = CONFIG.NAV.AGENT_RADIUS;
                this.cols = Math.max(1, Math.ceil((map.width || 1) / this.cell));
                this.rows = Math.max(1, Math.ceil((map.height || 1) / this.cell));
                const n = this.cols * this.rows;
                this.blocked = new Uint8Array(n); this._occupancy = new Uint16Array(n);
                this._near = new Uint16Array(n);   // geometry within radius + half a cell diagonal: only there can a step between neighbours be blocked
                this.g = new Float32Array(n); this.parent = new Int32Array(n);
                this.seen = new Uint32Array(n); this.closed = new Uint32Array(n);
                this.gen = 0; this.revision = 0;
                this._changes = []; this._dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };   // where recent revisions changed (pathTouched)
                this._heapIdx = []; this._heapF = [];
                this._geometry = new Map(); this._buckets = new Map();
                this._tracked = new Map(); this._present = new Set(); this._records = [];
                this._sources = [null, null, null, null]; this._sourceSlots = [[], [], [], []];
                this._bucketSize = 128; this._queryStamp = 0; this._epoch = -1;
                for (let i = 0; i < n; i++) {
                    const x = this.cx(i), y = this.cy(i), r = this.radius;
                    if (x < r || y < r || x > this.width - r || y > this.height - r) this._occupancy[i] = this.blocked[i] = 1;
                }
                this._refresh();
            }

            _refresh() {
                const map = this.map, empty = NavGrid._empty;
                const walls = map.walls || empty, cols = map.buildingColliders || map.buildings || empty;
                const nav = map.navObstacles || empty;
                const live = typeof game !== 'undefined' && game.activeMap === map ? game.props || empty : empty;
                const sources = this._sources, slots = this._sourceSlots;
                const newTick = this._epoch !== _simTick;
                // Missing sources previously created a fresh fallback array on every
                // lookup. Preserve their same-tick live edits while sharing one empty
                // source and reusing the membership records instead of allocating.
                let membership = this._epoch < 0;
                if (sources[0] !== walls) { sources[0] = walls; membership = true; }
                if (sources[1] !== cols) { sources[1] = cols; membership = true; }
                if (sources[2] !== nav) { sources[2] = nav; membership = true; }
                if (sources[3] !== live) { sources[3] = live; membership = true; }
                for (let s = 0; s < 4; s++) {
                    const items = sources[s], prior = slots[s];
                    if (prior.length !== items.length) membership = true;
                    if (newTick || membership) for (let i = 0; i < items.length; i++) if (prior[i] !== items[i]) {
                        membership = true; prior[i] = items[i];
                    }
                    prior.length = items.length;
                }
                if (!newTick && !membership) return;                               // geometry is checked once per simulation tick
                this._epoch = _simTick;
                let changed = false;
                if (membership) {
                    const present = this._present; present.clear(); this._records.length = 0;
                    for (let s = 0; s < 4; s++) for (const p of sources[s]) {
                        if (!p || present.has(p)) continue;
                        present.add(p);
                        let entry = this._tracked.get(p);
                        if (!entry) this._tracked.set(p, entry = { p, geometry: null });
                        this._records.push(entry);
                    }
                    for (const [p, entry] of this._tracked) if (!present.has(p)) {
                        if (entry.geometry) { this._note(entry.geometry); this._removeGeometry(entry.geometry); this._geometry.delete(p); changed = true; }
                        this._tracked.delete(p);
                    }
                    present.clear();
                }
                const records = this._records;
                for (let index = 0; index < records.length; index++) {
                    const entry = records[index], p = entry.p;
                    let o = entry.geometry;
                    if (p.active === false || p.hasCollision === false || p.noNav) {
                        if (o) { this._note(o); this._removeGeometry(o); this._geometry.delete(p); entry.geometry = null; changed = true; }
                        continue;
                    }
                    const w = p.width ?? p.w, h = p.height ?? p.h, angle = p.angle || 0;
                    const x = p.x, y = p.y;
                    if (!(w > 0 && h > 0) || !Number.isFinite(x + y + w + h + angle)) {
                        if (o) { this._note(o); this._removeGeometry(o); this._geometry.delete(p); entry.geometry = null; changed = true; }
                        continue;
                    }
                    if (o && o.x === x && o.y === y && o.w === w && o.h === h && o.angle === angle) continue;
                    if (o) { this._note(o); this._removeGeometry(o); }
                    o = { x, y, w, h, angle, hw: w / 2, hh: h / 2, cx: x + w / 2, cy: y + h / 2, c: Math.cos(angle), s: Math.sin(angle), cells: [], near: [], keys: [], stamp: 0 };
                    entry.geometry = o; this._geometry.set(p, o); this._addGeometry(o); this._note(o); changed = true;
                }
                if (changed) {
                    // A new revision, and where it changed: only paths passing near it need re-planning
                    const D = this._dirty;
                    this._changes.push({ rev: ++this.revision, x0: D.x0, y0: D.y0, x1: D.x1, y1: D.y1 });
                    if (this._changes.length > 32) this._changes.shift();
                    D.x0 = D.y0 = Infinity; D.x1 = D.y1 = -Infinity;
                }
            }

            /** Widen this refresh's changed area by a geometry's footprint */
            _note(o) {
                const D = this._dirty, ex = Math.abs(o.c) * o.hw + Math.abs(o.s) * o.hh, ey = Math.abs(o.s) * o.hw + Math.abs(o.c) * o.hh;
                if (o.cx - ex < D.x0) D.x0 = o.cx - ex; if (o.cx + ex > D.x1) D.x1 = o.cx + ex;
                if (o.cy - ey < D.y0) D.y0 = o.cy - ey; if (o.cy + ey > D.y1) D.y1 = o.cy + ey;
            }

            /** Has anything changed near this cached path (its box) since it was planned? */
            pathTouched(st) {
                const C = this._changes;
                if (!st.box || !C.length || C[0].rev > st.revision + 1) return true;     // (history no longer reaches back that far)
                const b = st.box, pad = this.radius + this.cell;
                for (let i = C.length - 1; i >= 0 && C[i].rev > st.revision; i--) {
                    const c = C[i];
                    if (c.x1 + pad >= b.x0 && c.x0 - pad <= b.x1 && c.y1 + pad >= b.y0 && c.y0 - pad <= b.y1) return true;
                }
                return false;
            }

            _removeGeometry(o) {
                for (const i of o.cells) this.blocked[i] = --this._occupancy[i] ? 1 : 0;
                for (const i of o.near) this._near[i]--;
                for (const key of o.keys) { const b = this._buckets.get(key); b.delete(o); if (!b.size) this._buckets.delete(key); }
            }

            _addGeometry(o) {
                const r = this.radius, ex = Math.abs(o.c) * o.hw + Math.abs(o.s) * o.hh + r;
                const ey = Math.abs(o.s) * o.hw + Math.abs(o.c) * o.hh + r;
                const left = o.cx - ex, right = o.cx + ex, top = o.cy - ey, bottom = o.cy + ey, bs = this._bucketSize;
                for (let bx = Math.floor(left / bs); bx <= Math.floor(right / bs); bx++) for (let by = Math.floor(top / bs); by <= Math.floor(bottom / bs); by++) {
                    const key = bx + ',' + by; let b = this._buckets.get(key);
                    if (!b) this._buckets.set(key, b = new Set());
                    b.add(o); o.keys.push(key);
                }
                // Blocked cells (centre within the radius) and near cells (within radius + half a cell diagonal):
                // a step between two neighbouring cells, neither of them near, can't touch this geometry
                const rn = r + this.cell * 0.7072 + 1, gx = rn - r;
                for (let row = Math.max(0, Math.floor((top - gx) / this.cell)); row <= Math.min(this.rows - 1, Math.floor((bottom + gx) / this.cell)); row++) {
                    for (let col = Math.max(0, Math.floor((left - gx) / this.cell)); col <= Math.min(this.cols - 1, Math.floor((right + gx) / this.cell)); col++) {
                        const i = row * this.cols + col, d2 = this._pointDistance2(o, this.cx(i), this.cy(i));
                        if (d2 < rn * rn) { o.near.push(i); this._near[i]++; }
                        if (d2 < r * r - 1e-6) { o.cells.push(i); this._occupancy[i]++; this.blocked[i] = 1; }
                    }
                }
            }

            _pointDistance2(o, x, y) {
                const dx = x - o.cx, dy = y - o.cy;
                const lx = dx * o.c + dy * o.s, ly = -dx * o.s + dy * o.c;
                const ax = Math.max(0, Math.abs(lx) - o.hw), ay = Math.max(0, Math.abs(ly) - o.hh);
                return ax * ax + ay * ay;
            }

            _segmentDistance2(o, x1, y1, x2, y2) {
                const ax = (x1 - o.cx) * o.c + (y1 - o.cy) * o.s, ay = -(x1 - o.cx) * o.s + (y1 - o.cy) * o.c;
                const bx = (x2 - o.cx) * o.c + (y2 - o.cy) * o.s, by = -(x2 - o.cx) * o.s + (y2 - o.cy) * o.c;
                const dx = bx - ax, dy = by - ay;
                let t0 = 0, t1 = 1;
                const clip = (p, q) => {
                    if (Math.abs(p) < 1e-12) return q >= 0;
                    const t = q / p;
                    if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); }
                    else { if (t < t0) return false; t1 = Math.min(t1, t); }
                    return true;
                };
                if (clip(-dx, ax + o.hw) && clip(dx, o.hw - ax) && clip(-dy, ay + o.hh) && clip(dy, o.hh - ay)) return 0;
                const point = (x, y) => { const px = Math.max(0, Math.abs(x) - o.hw), py = Math.max(0, Math.abs(y) - o.hh); return px * px + py * py; };
                let best = Math.min(point(ax, ay), point(bx, by));
                const len2 = dx * dx + dy * dy;
                if (len2 > 1e-12) for (const x of [-o.hw, o.hw]) for (const y of [-o.hh, o.hh]) {
                    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
                    const px = ax + dx * t - x, py = ay + dy * t - y;
                    best = Math.min(best, px * px + py * py);
                }
                return best;
            }

            colOf(x) { return Math.floor(x / this.cell); }
            rowOf(y) { return Math.floor(y / this.cell); }
            cx(i) { return (i % this.cols + 0.5) * this.cell; }
            cy(i) { return (Math.floor(i / this.cols) + 0.5) * this.cell; }
            freeCell(col, row) {
                return col >= 0 && row >= 0 && col < this.cols && row < this.rows && !this.blocked[row * this.cols + col];
            }
            walkable(x, y) {
                const r = this.radius;
                if (!Number.isFinite(x + y) || x < r || y < r || x > this.width - r || y > this.height - r) return false;
                return this.lineWalkable(x, y, x, y);
            }

            /** Nearest free cell, optionally with a safe connector to the actual point. */
            nearestFree(x, y, maxRings = 8, connected = false) {
                const col = this.colOf(x), row = this.rowOf(y);
                for (let ring = 0; ring <= maxRings; ring++) {
                    let best = null, bestD = Infinity;
                    for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
                        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                        const cc = col + dc, rr = row + dr;
                        if (!this.freeCell(cc, rr)) continue;
                        const i = rr * this.cols + cc, px = this.cx(i), py = this.cy(i);
                        if (connected && !this.lineWalkable(x, y, px, py)) continue;
                        const d = (px - x) ** 2 + (py - y) ** 2;
                        if (d < bestD) { bestD = d; best = i; }
                    }
                    if (best !== null) return best;
                }
                return null;
            }

            /** Continuous circle sweep, including rotated prop bounds and rounded corners.
             * A body already inside a safety margin may move out, never deeper into it. */
            lineWalkable(x1, y1, x2, y2) {
                if (!Number.isFinite(x1 + y1 + x2 + y2)) return false;
                const r = this.radius;
                if ((x2 < r && x2 <= x1) || (y2 < r && y2 <= y1) || (x2 > this.width - r && x2 >= x1) || (y2 > this.height - r && y2 >= y1)) return false;
                const bs = this._bucketSize, stamp = ++this._queryStamp, rr = r * r - 1e-6;
                for (let bx = Math.floor(Math.min(x1, x2) / bs); bx <= Math.floor(Math.max(x1, x2) / bs); bx++) {
                    for (let by = Math.floor(Math.min(y1, y2) / bs); by <= Math.floor(Math.max(y1, y2) / bs); by++) {
                        const b = this._buckets.get(bx + ',' + by); if (!b) continue;
                        for (const o of b) {
                            if (o.stamp === stamp) continue; o.stamp = stamp;
                            const d = this._segmentDistance2(o, x1, y1, x2, y2);
                            if (d >= rr) continue;
                            const start = this._pointDistance2(o, x1, y1);
                            if (start > 1e-6 && d >= start - 1e-6 && this._pointDistance2(o, x2, y2) > start + 1e-6) continue;
                            return false;
                        }
                    }
                }
                return true;
            }


            // --- binary heap keyed by f ---
            _push(i, f) {
                const H = this._heapIdx, F = this._heapF;
                let k = H.length; H.push(i); F.push(f);
                while (k > 0) {
                    const p = (k - 1) >> 1;
                    if (F[p] <= F[k]) break;
                    const th = H[p]; H[p] = H[k]; H[k] = th; const tf = F[p]; F[p] = F[k]; F[k] = tf; k = p;   // (swaps without a temporary array)
                }
            }
            _pop() {
                const H = this._heapIdx, F = this._heapF;
                const top = H[0], last = H.pop(), lastF = F.pop();
                if (H.length) {
                    H[0] = last; F[0] = lastF;
                    let k = 0;
                    for (;;) {
                        const l = 2 * k + 1, r = l + 1; let m = k;
                        if (l < H.length && F[l] < F[m]) m = l;
                        if (r < H.length && F[r] < F[m]) m = r;
                        if (m === k) break;
                        const th = H[m]; H[m] = H[k]; H[k] = th; const tf = F[m]; F[m] = F[k]; F[k] = tf; k = m;
                    }
                }
                return top;
            }

            /** Shared search: A* when goal >= 0, bounded Dijkstra when goal < 0. */
            _search(start, goal, maxCost) {
                const gen = ++this.gen, cols = this.cols, c = this.cell, D = c * Math.SQRT2;
                const G = this.g, P = this.parent, S = this.seen, CL = this.closed, B = this.blocked, NR = this._near;
                this._heapIdx.length = 0; this._heapF.length = 0;
                const gc = goal >= 0 ? goal % cols : 0, gr = goal >= 0 ? Math.floor(goal / cols) : 0;
                const h = (i) => {
                    if (goal < 0) return 0;
                    const dc = Math.abs(i % cols - gc), dr = Math.abs(Math.floor(i / cols) - gr);
                    return c * (dc + dr) + (D - 2 * c) * Math.min(dc, dr);   // octile
                };
                G[start] = 0; P[start] = -1; S[start] = gen;
                this._push(start, h(start));
                const reached = [];
                let expansions = 0;
                while (this._heapIdx.length) {
                    const cur = this._pop();
                    if (CL[cur] === gen) continue;
                    CL[cur] = gen;
                    if (goal < 0) reached.push(cur);
                    if (cur === goal) return true;
                    if (++expansions > CONFIG.NAV.MAX_EXPANSIONS) break;
                    const col = cur % cols, row = (cur - col) / cols;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (!dr && !dc) continue;
                            const nc = col + dc, nr = row + dr;
                            if (!this.freeCell(nc, nr)) continue;
                            if (dr && dc && (B[row * cols + nc] || B[nr * cols + col])) continue;  // no corner cutting
                            const ni = nr * cols + nc;
                            if (CL[ni] === gen) continue;
                            if ((NR[cur] || NR[ni]) && !this.lineWalkable(this.cx(cur), this.cy(cur), this.cx(ni), this.cy(ni))) continue;   // (exact sweep only near geometry)
                            const ng = G[cur] + (dr && dc ? D : c);
                            if (ng > maxCost) continue;
                            if (S[ni] !== gen || ng < G[ni]) {
                                S[ni] = gen; G[ni] = ng; P[ni] = cur;
                                this._push(ni, ng + h(ni));
                            }
                        }
                    }
                }
                this._reached = reached;
                return false;
            }

            /** Walk parents back from idx and return smoothed waypoints from (sx, sy). */
            _buildPath(idx, sx, sy, endX, endY) {
                const cells = [];
                for (let i = idx; i >= 0; i = this.parent[i]) cells.push(i);
                cells.reverse();
                const pts = cells.map(i => ({ x: this.cx(i), y: this.cy(i) }));
                if (endX !== undefined) pts.push({ x: endX, y: endY });
                // String-pulling: keep only waypoints we can't skip in a straight line
                const out = [];
                let fromX = sx, fromY = sy, i = 0;
                while (i < pts.length) {
                    let j = pts.length - 1;
                    while (j >= i && !this.lineWalkable(fromX, fromY, pts[j].x, pts[j].y)) j--;
                    if (j < i) return null;
                    out.push(pts[j]);
                    fromX = pts[j].x; fromY = pts[j].y; i = j + 1;
                }
                return out;
            }

            /** Smoothed waypoint list from (sx, sy) toward (tx, ty), or null if unreachable. */
            findPath(sx, sy, tx, ty) {
                if (this.lineWalkable(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
                const exact = this.walkable(tx, ty);
                const start = this.nearestFree(sx, sy, 8, true), goal = this.nearestFree(tx, ty, 8, exact);
                if (start === null || goal === null) return null;
                if (!this._search(start, goal, Infinity)) return null;
                return this._buildPath(goal, sx, sy, exact ? tx : undefined, exact ? ty : undefined);
            }

            /** Bounded Dijkstra from (sx, sy). Returns reached cell indices (cost in this.g). */
            flood(sx, sy, maxCost) {
                const start = this.nearestFree(sx, sy, 8, true);
                if (start === null) return [];
                this._search(start, -1, maxCost);
                return this._reached || [];
            }
        }

        // ---------------------------------------------------------------------
        //  Companion eyeline tactics
        // ---------------------------------------------------------------------

        /** Does segment (x1,y1)→(x2,y2) touch prop p? Props are rotated boxes positioned
         *  by their top-left corner (see PropEntity.getOBB). Liang–Barsky in the prop's frame. */
        function segmentHitsProp(x1, y1, x2, y2, p) {
            const hw = p.width / 2, hh = p.height / 2;
            const cx = p.x + hw, cy = p.y + hh;
            const a = -(p.angle || 0), c = Math.cos(a), s = Math.sin(a);
            const ax = (x1 - cx) * c - (y1 - cy) * s, ay = (x1 - cx) * s + (y1 - cy) * c;
            const bx = (x2 - cx) * c - (y2 - cy) * s, by = (x2 - cx) * s + (y2 - cy) * c;
            const dx = bx - ax, dy = by - ay;
            let t0 = 0, t1 = 1;
            const edges = [[-dx, ax + hw], [dx, hw - ax], [-dy, ay + hh], [dy, hh - ay]];
            for (let i = 0; i < 4; i++) {
                const pp = edges[i][0], qq = edges[i][1];
                if (pp === 0) { if (qq < 0) return false; continue; }
                const r = qq / pp;
                if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
                else        { if (r < t0) return false; if (r < t1) t1 = r; }
            }
            return true;
        }

        /** Clear shot for a projectile? Walls and buildings (same test the enemies use),
         *  plus props, which stop bullets too (they get knocked around when hit).
         *  Lamps are light sources with no collision, so they never block. */
        function hasShotLine(x1, y1, x2, y2, map) {
            if (isLineBlocked(x1, y1, x2, y2, map.walls, getColliders(map))) return false;
            if (typeof game !== 'undefined' && game.activeMap === map && game.roomSystem.doorBlocks(x1, y1, x2, y2)) return false;   // a shut door
            const props = (typeof game !== 'undefined' && game.activeMap === map) ? game.props : null;
            if (props && props.length) {
                const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
                for (let i = 0; i < props.length; i++) {
                    const p = props[i];
                    if (!p || p.active === false || !(p.width > 0) || !(p.height > 0)) continue;
                    const r = 0.71 * Math.max(p.width, p.height) + 1;             // bounding circle
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
                    if (cx < minX - r || cx > maxX + r || cy < minY - r || cy > maxY + r) continue;
                    if (segmentHitsProp(x1, y1, x2, y2, p)) return false;
                }
            }
            return true;
        }

        /**
         * Clear shot allowing for what a bullet really is: 5px wide, leaving the muzzle, and
         * scattered by spread. Tests the centre line plus both edges of the narrow cone that
         * still lands on the target. Used when CHOOSING firing spots, so shooters don't pick
         * spots whose line only just grazes past a building corner. (Firing itself still
         * uses the plain centre-line test.)
         * o: { muzzle {x, y} in the shooter's frame (facing the target), halfSpread (rad),
         *      bulletR, targetR }
         */
        function hasFatShotLine(sx, sy, tx, ty, map, o) {
            const a = Math.atan2(ty - sy, tx - sx), c = Math.cos(a), s = Math.sin(a);
            let mx = sx, my = sy;
            if (o.muzzle) {
                mx = sx + o.muzzle.x * c - o.muzzle.y * s;
                my = sy + o.muzzle.x * s + o.muzzle.y * c;
                if (!hasShotLine(sx, sy, mx, my, map)) return false;     // barrel would poke through
            }
            const d = Math.hypot(tx - mx, ty - my);
            const b = Math.atan2(ty - my, tx - mx), px = -Math.sin(b), py = Math.cos(b);
            const w0 = o.bulletR || 5;
            const w1 = Math.min(o.targetR || 12, d * (o.halfSpread || 0)) + w0;
            return hasShotLine(mx, my, tx, ty, map)
                && hasShotLine(mx + px * w0, my + py * w0, tx + px * w1, ty + py * w1, map)
                && hasShotLine(mx - px * w0, my - py * w0, tx - px * w1, ty - py * w1, map);
        }

        /** Typical muzzle offset in the shooter's frame when aiming a weapon (measured from
         *  the drawn models; used before the shooter has actually drawn that pose). */
        function aimedMuzzleLocal(weaponId) {
            const st = stanceForWeapon(weaponId);
            if (st === 'sniper') return { x: 59, y: 14.5 };
            if (st === 'rifle') return { x: 32, y: 13 };
            return { x: 25, y: 3 };
        }

        /** Shot-margin settings for a companion (spread from its weapon and accuracy). */
        function companionShotMargin(tm, target) {
            const w = tm.equippedWeaponId && ITEM_REGISTRY[tm.equippedWeaponId];
            const spread = w ? ((w.stats && w.stats.spread) || 0.12) * (tm.accuracyMod || 1) : 0.1;
            return { muzzle: w ? aimedMuzzleLocal(tm.equippedWeaponId) : null, halfSpread: spread / 2,
                     bulletR: 5, targetR: (target && target.radius) || 12 };
        }

        /** True if this companion's shots are stopped by walls (so eyeline matters). */
        function companionNeedsEyeline(tm) {
            if (!CONFIG.NAV.EYELINE_ENABLED) return false;
            const w = tm.equippedWeaponId && ITEM_REGISTRY[tm.equippedWeaponId];
            if (w) return !(w.stats && w.stats.penetrating);
            return !!(tm.equippedAbilityId && ABILITY_REGISTRY[tm.equippedAbilityId]);  // abilities never penetrate
        }

        /** Weapon / ability range — mirrors NPC.updateCombat. */
        function companionRange(tm) {
            if (tm.equippedWeaponId && ITEM_REGISTRY[tm.equippedWeaponId]) return 400;
            const a = tm.equippedAbilityId && ABILITY_REGISTRY[tm.equippedAbilityId];
            return a ? (a.stats.range || 400) : 400;
        }

        /**
         * Decide where a companion should stand this tick. Returns a firing spot
         * {x, y} when it needs to reposition for a clear shot, or null to stay in
         * formation. Heavy work (the flood search) runs at most every REPLAN_TICKS.
         */
        function updateCompanionTactics(tm, game) {
            const N = CONFIG.NAV, map = game.activeMap, player = game.player;
            const tac = tm._tac || (tm._tac = { target: null, spot: null, path: null, setAt: 0, nextEval: 0, phase: Math.floor(Math.random() * N.REPLAN_TICKS) });
            const drop = () => { tac.spot = null; tac.path = null; tac.target = null; };

            if (!map || map.id === 'apt_949' || !companionNeedsEyeline(tm)) { drop(); return null; }

            // Invalidate the current spot every tick (cheap checks)
            if (tac.spot) {
                if (!tac.target || tac.target.dead || tac.target.active === false) drop();
                else if (Math.hypot(tac.spot.x - player.x, tac.spot.y - player.y) > N.LEASH_BREAK) drop();
                else if (_simTick - tac.setAt > N.GIVE_UP_TICKS && Math.hypot(tac.spot.x - tm.x, tac.spot.y - tm.y) > 24) {
                    drop(); tac.nextEval = _simTick + N.REPLAN_TICKS;
                }
            }
            if (_simTick < tac.nextEval) return tac.spot;
            tac.nextEval = _simTick + N.REPLAN_TICKS + (tac.phase % 3);

            // The threat: nearest living enemy we could engage
            const range = companionRange(tm);
            let target = null, best = range + N.ENGAGE_RANGE_BONUS;
            for (const e of game.enemies) {
                if (e.dead || (game.crewMayEngage && !game.crewMayEngage(e))) continue;   // sneaking: no flanking the unaware
                const d = Math.hypot(e.x - tm.x, e.y - tm.y);
                if (d < best) { best = d; target = e; }
            }
            if (!target) { drop(); return null; }

            const margin = companionShotMargin(tm, target);
            // Already have a clean shot from here? Hold this position (stop if en route).
            if (best <= range && hasFatShotLine(tm.x, tm.y, target.x, target.y, map, margin)) {
                if (tac.spot) { tac.spot = { x: tm.x, y: tm.y }; tac.path = null; tac.target = target; tac.setAt = _simTick; }
                return tac.spot;
            }
            // Current spot still gives a shot on this target? Keep it.
            if (tac.spot && tac.target === target && Math.hypot(target.x - tac.spot.x, target.y - tac.spot.y) <= range &&
                hasFatShotLine(tac.spot.x, tac.spot.y, target.x, target.y, map, margin)) return tac.spot;

            const found = findEyelineSpot(tm, target, range, game);
            if (found) {
                tac.spot = { x: found.x, y: found.y }; tac.path = found.path;
                tac.target = target; tac.setAt = _simTick;
                tm._navPath = found.path ? { pts: found.path, idx: 0, goalX: found.x, goalY: found.y, repathAt: _simTick + N.REPATH_TICKS } : null;
            } else {
                drop();
            }
            return tac.spot;
        }

        /**
         * Cheapest reachable spot near (fromX, fromY) with a clear shot at (tx, ty).
         * opts: searchDist, minDist, maxDist, leash {x, y, r}?, prefer {x, y, w}?,
         *       avoid [{x, y}], spacing, maxChecks, stride.
         * Returns {x, y, path} (path = smoothed waypoints from the start) or null.
         */
        function findShotSpot(map, fromX, fromY, tx, ty, opts) {
            const nav = NavGrid.for(map);
            if (!nav) return null;
            const reached = nav.flood(fromX, fromY, opts.searchDist);
            const stride = Math.max(1, opts.stride | 0);
            const avoid = opts.avoid || [], spacing = opts.spacing || 0;
            const cands = [];
            for (const idx of reached) {
                const col = idx % nav.cols, row = (idx - col) / nav.cols;
                if (col % stride || row % stride) continue;
                const x = nav.cx(idx), y = nav.cy(idx);
                if (opts.leash && Math.hypot(x - opts.leash.x, y - opts.leash.y) > opts.leash.r) continue;
                const dT = Math.hypot(tx - x, ty - y);
                if (dT > opts.maxDist || dT < opts.minDist) continue;
                let crowded = false;
                for (const o of avoid) { if (Math.hypot(o.x - x, o.y - y) < spacing) { crowded = true; break; } }
                if (crowded) continue;
                const pref = opts.prefer ? opts.prefer.w * Math.hypot(x - opts.prefer.x, y - opts.prefer.y) : 0;
                cands.push([nav.g[idx] + pref, idx, x, y]);
            }
            cands.sort((a, b) => a[0] - b[0]);
            const limit = Math.min(cands.length, opts.maxChecks || 90);
            for (let i = 0; i < limit; i++) {
                const [, idx, x, y] = cands[i];
                const clear = opts.margin ? hasFatShotLine(x, y, tx, ty, map, opts.margin) : hasShotLine(x, y, tx, ty, map);
                if (clear) return { x, y, path: nav._buildPath(idx, fromX, fromY) };
            }
            return null;
        }

        /** Companion flavour: stay leashed to the player, prefer the formation slot, spread out. */
        function findEyelineSpot(tm, target, range, game) {
            const N = CONFIG.NAV, player = game.player;
            const slot = tm._formationSlot || player;
            const avoid = [];
            for (const o of game.teammates) {
                if (o !== tm && o._tac && o._tac.spot) avoid.push(o._tac.spot);
            }
            return findShotSpot(game.activeMap, tm.x, tm.y, target.x, target.y, {
                searchDist: N.SEARCH_PATH_DIST, minDist: N.MIN_ENEMY_DIST, maxDist: range - 10,
                leash: { x: player.x, y: player.y, r: N.LEASH },
                prefer: { x: slot.x, y: slot.y, w: 0.35 },
                avoid, spacing: N.SPOT_SPACING, maxChecks: N.MAX_LOS_CHECKS, stride: N.SAMPLE_STRIDE,
                margin: companionShotMargin(tm, target)
            });
        }

        /** A cached path's box: where it runs, so a change elsewhere on the map leaves it alone */
        function _navBox(x, y, pts) {
            let x0 = x, y0 = y, x1 = x, y1 = y;
            for (const q of pts) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
            return { x0, y0, x1, y1 };
        }

        /**
         * Cached routing. A path is re-planned when the map changes near it, its goal moves
         * more than 32 px (a smaller move re-aims its last leg when that's clear), it's lost,
         * or REPATH_TICKS pass. A failed search waits FAIL_RETRY_TICKS before trying again,
         * wherever the goal goes, instead of searching the whole grid every tick.
         */
        function navWaypoint(ent, gx, gy, map) {
            const N = CONFIG.NAV, nav = map ? NavGrid.for(map) : null;
            if (!nav || nav.lineWalkable(ent.x, ent.y, gx, gy)) {
                ent._navPath = null;
                return { x: gx, y: gy, finalLeg: true, remaining: Math.hypot(gx - ent.x, gy - ent.y) };
            }
            let st = ent._navPath;
            let replan = !st || st.nav !== nav;
            if (!replan && st.revision !== nav.revision) {
                if (nav.pathTouched(st)) replan = true; else st.revision = nav.revision;
            }
            if (!replan) {
                const moved = Math.hypot(st.goalX - gx, st.goalY - gy);
                if (st.failed) replan = _simTick >= st.repathAt;
                else if (moved > 32) replan = true;
                else if (moved > 0.5) {
                    const n = st.pts.length, prev = n > 1 ? st.pts[n - 2] : null;
                    if (prev && nav.lineWalkable(prev.x, prev.y, gx, gy)) {
                        st.pts[n - 1] = { x: gx, y: gy }; st.goalX = gx; st.goalY = gy;
                        const b = st.box; if (gx < b.x0) b.x0 = gx; if (gx > b.x1) b.x1 = gx; if (gy < b.y0) b.y0 = gy; if (gy > b.y1) b.y1 = gy;
                    } else replan = true;
                }
                if (!replan && !st.failed && (_simTick >= st.repathAt || st.idx >= st.pts.length || !nav.lineWalkable(ent.x, ent.y, st.pts[st.idx].x, st.pts[st.idx].y))) replan = true;
            }
            if (replan) {
                const pts = nav.findPath(ent.x, ent.y, gx, gy), failed = !(pts && pts.length);
                st = ent._navPath = { nav, revision: nav.revision, pts: pts || [], idx: 0, failed, goalX: gx, goalY: gy,
                                      repathAt: _simTick + (failed ? (N.FAIL_RETRY_TICKS || 30) : N.REPATH_TICKS), box: _navBox(ent.x, ent.y, pts || []) };
            }
            if (st.failed) return { x: ent.x, y: ent.y, finalLeg: false, blocked: true, remaining: Infinity };
            while (st.idx < st.pts.length - 1 && nav.lineWalkable(ent.x, ent.y, st.pts[st.idx + 1].x, st.pts[st.idx + 1].y)) st.idx++;
            const wp = st.pts[st.idx];
            let remaining = Math.hypot(wp.x - ent.x, wp.y - ent.y);
            for (let i = st.idx + 1; i < st.pts.length; i++) remaining += Math.hypot(st.pts[i].x - st.pts[i - 1].x, st.pts[i].y - st.pts[i - 1].y);
            return { x: wp.x, y: wp.y, finalLeg: st.idx === st.pts.length - 1, remaining };
        }

        /**
         * If the straight line from a companion to its waypoint passes through the player,
         * return a detour point beside the player (on the companion's side of the line);
         * otherwise the waypoint unchanged. Keeps teammates from walking into you.
         */
        function detourAroundPlayer(ent, wx, wy, player) {
            if (!player) return { x: wx, y: wy };
            const R = (player.radius || 12) + (ent.radius || 14) + 6;
            const dx = wx - ent.x, dy = wy - ent.y, L2 = dx * dx + dy * dy;
            if (L2 < 1) return { x: wx, y: wy };
            const t = ((player.x - ent.x) * dx + (player.y - ent.y) * dy) / L2;
            if (t <= 0 || t >= 1) return { x: wx, y: wy };                   // player isn't between us
            const cx = ent.x + dx * t, cy = ent.y + dy * t;
            const off = Math.hypot(cx - player.x, cy - player.y);
            if (off >= R) return { x: wx, y: wy };
            // Step out to the side of the player we're already on (or pick one if dead-centre)
            const L = Math.sqrt(L2);
            let px = -dy / L, py = dx / L;
            const side = (ent.x - player.x) * px + (ent.y - player.y) * py;
            if (side < 0 || (side === 0 && (ent._detourSide || (ent._detourSide = Math.random() < 0.5 ? -1 : 1)) < 0)) { px = -px; py = -py; }
            return { x: player.x + px * (R + 4), y: player.y + py * (R + 4) };
        }

        /** One step (px) of up to `speed` toward (gx, gy), routed around obstacles. */
        function actorSteer(ent, gx, gy, speed, map) {
            let wp = navWaypoint(ent, gx, gy, map);
            // `remaining`: route distance left this tick (straight distance when there's no route yet), for stuck checks
            const remaining = wp.blocked ? Math.hypot(gx - ent.x, gy - ent.y) : wp.remaining;
            if (wp.blocked) wp = { x: gx, y: gy };   // no route found (yet): edge straight on where a step is clear, never into a wall
            const dx = wp.x - ent.x, dy = wp.y - ent.y, d = Math.hypot(dx, dy);
            if (d < 1e-3) return { x: 0, y: 0, remaining };
            const step = Math.min(Math.max(0, speed), d), vx = (dx / d) * step, vy = (dy / d) * step;
            const nav = map ? NavGrid.for(map) : null;
            if (nav && !nav.lineWalkable(ent.x, ent.y, ent.x + vx, ent.y + vy)) return { x: 0, y: 0, remaining };
            return { x: vx, y: vy, remaining };
        }

        /**
         * One companion movement step toward (gx, gy): straight when clear,
         * otherwise along a grid path. Arrives softly on the final leg using
         * FORMATION_ARRIVE_GAIN, like the old direct follow.
         */
        function companionNavStep(tm, gx, gy, topSpeed, game) {
            const C = CONFIG.COMPANION, map = game && game.activeMap;
            const nav = map ? NavGrid.for(map) : null;
            const wp0 = navWaypoint(tm, gx, gy, map);
            const stop = () => { tm.velX = tm.velY = 0; gaitCommand(tm, 0, 0); };
            if (wp0.blocked) { stop(); return; }
            const det = detourAroundPlayer(tm, wp0.x, wp0.y, game && game.player);
            const detoured = det.x !== wp0.x || det.y !== wp0.y;
            // A detour beside the player must also clear furniture/walls; do not replace the final-goal path cache.
            const useDetour = detoured && (!nav || (nav.walkable(det.x, det.y) && nav.lineWalkable(tm.x, tm.y, det.x, det.y)));
            const wp = useDetour ? { x: det.x, y: det.y, finalLeg: false } : wp0;
            const dx = wp.x - tm.x, dy = wp.y - tm.y, d = Math.hypot(dx, dy);
            if (d <= (wp.finalLeg ? C.FORMATION_DEADZONE : 0.5)) { stop(); return; }
            const step = wp.finalLeg ? Math.min(topSpeed, d * C.FORMATION_ARRIVE_GAIN) : Math.min(topSpeed, d);
            const vx = (dx / d) * step, vy = (dy / d) * step;
            if (nav && !nav.lineWalkable(tm.x, tm.y, tm.x + vx, tm.y + vy)) {
                tm._navPath = null; stop(); return;
            }
            tm.velX = vx; tm.velY = vy;
            gaitCommand(tm, vx, vy);
            tm.x += vx; tm.y += vy;
        }

