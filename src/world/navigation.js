        // =====================================================================
        //  NAV GRID — walkability grid + A* / Dijkstra for companions
        // =====================================================================
        //  One grid per map, built lazily from walls + building colliders, each
        //  inflated by CONFIG.NAV.AGENT_RADIUS so a cell is "free" only if an
        //  actor centered in it clears every obstacle. Rebuilt automatically if
        //  the map object or its obstacle count changes.
        class NavGrid {
            static for(map) {
                if (!map) return null;
                const sig = (map.walls ? map.walls.length : 0) + ':' + getColliders(map).length + ':' + (map.navObstacles ? map.navObstacles.length : 0) + ':' + map.width + 'x' + map.height;
                if (!NavGrid._cache || NavGrid._cache.map !== map || NavGrid._cache.sig !== sig) {
                    NavGrid._cache = { map, sig, grid: new NavGrid(map) };
                }
                return NavGrid._cache.grid;
            }

            constructor(map) {
                const N = CONFIG.NAV;
                this.cell = N.CELL;
                this.cols = Math.max(1, Math.ceil((map.width || 1) / this.cell));
                this.rows = Math.max(1, Math.ceil((map.height || 1) / this.cell));
                const n = this.cols * this.rows;
                this.blocked = new Uint8Array(n);
                this.g = new Float32Array(n);
                this.parent = new Int32Array(n);
                this.seen = new Uint32Array(n);    // generation stamps (avoid clearing arrays)
                this.closed = new Uint32Array(n);
                this.gen = 0;
                this._heapIdx = [];
                this._heapF = [];
                this._rasterize(map);
            }

            _rasterize(map) {
                const c = this.cell, r = CONFIG.NAV.AGENT_RADIUS, cols = this.cols, rows = this.rows;
                const mark = (x0, y0, x1, y1) => {
                    const c0 = Math.max(0, Math.floor(x0 / c)), c1 = Math.min(cols - 1, Math.floor(x1 / c));
                    const r0 = Math.max(0, Math.floor(y0 / c)), r1 = Math.min(rows - 1, Math.floor(y1 / c));
                    for (let row = r0; row <= r1; row++) {
                        const cy = (row + 0.5) * c;
                        if (cy < y0 || cy > y1) continue;
                        for (let col = c0; col <= c1; col++) {
                            const cx = (col + 0.5) * c;
                            if (cx >= x0 && cx <= x1) this.blocked[row * cols + col] = 1;
                        }
                    }
                };
                const W = cols * c, H = rows * c;
                mark(-c, -c, W + c, r); mark(-c, (map.height || H) - r, W + c, H + c);       // map edges
                mark(-c, -c, r, H + c); mark((map.width || W) - r, -c, W + c, H + c);
                const obstacles = [...(map.walls || []), ...getColliders(map), ...(map.navObstacles || [])];
                for (const o of obstacles) {
                    if (!o || !(o.w > 0) || !(o.h > 0)) continue;
                    mark(o.x - r, o.y - r, o.x + o.w + r, o.y + o.h + r);
                }
            }

            colOf(x) { return Math.floor(x / this.cell); }
            rowOf(y) { return Math.floor(y / this.cell); }
            cx(i) { return (i % this.cols + 0.5) * this.cell; }
            cy(i) { return (Math.floor(i / this.cols) + 0.5) * this.cell; }
            freeCell(col, row) {
                return col >= 0 && row >= 0 && col < this.cols && row < this.rows && !this.blocked[row * this.cols + col];
            }
            walkable(x, y) { return this.freeCell(this.colOf(x), this.rowOf(y)); }

            /** Center of the nearest free cell (ring search), or null. */
            nearestFree(x, y, maxRings = 8) {
                const col = this.colOf(x), row = this.rowOf(y);
                if (this.freeCell(col, row)) return row * this.cols + col;
                let best = -1, bestD = Infinity;
                for (let ring = 1; ring <= maxRings && best < 0; ring++) {
                    for (let dr = -ring; dr <= ring; dr++) {
                        for (let dc = -ring; dc <= ring; dc++) {
                            if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
                            const cc = col + dc, rr = row + dr;
                            if (!this.freeCell(cc, rr)) continue;
                            const d = dc * dc + dr * dr;
                            if (d < bestD) { bestD = d; best = rr * this.cols + cc; }
                        }
                    }
                }
                return best >= 0 ? best : null;
            }

            /** True if an actor can walk the straight segment (start cell is forgiven:
             *  actors pressed against a wall often stand inside the inflated margin). */
            lineWalkable(x1, y1, x2, y2) {
                const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
                const step = this.cell * 0.5;
                const n = Math.max(1, Math.ceil(dist / step));
                const startCol = this.colOf(x1), startRow = this.rowOf(y1);
                for (let i = 1; i <= n; i++) {
                    const t = i / n;
                    const col = this.colOf(x1 + dx * t), row = this.rowOf(y1 + dy * t);
                    if (col === startCol && row === startRow) continue;
                    if (!this.freeCell(col, row)) return false;
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
                    [H[p], H[k]] = [H[k], H[p]]; [F[p], F[k]] = [F[k], F[p]]; k = p;
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
                        [H[m], H[k]] = [H[k], H[m]]; [F[m], F[k]] = [F[k], F[m]]; k = m;
                    }
                }
                return top;
            }

            /** Shared search: A* when goal >= 0, bounded Dijkstra when goal < 0. */
            _search(start, goal, maxCost) {
                const gen = ++this.gen, cols = this.cols, c = this.cell, D = c * Math.SQRT2;
                const G = this.g, P = this.parent, S = this.seen, CL = this.closed, B = this.blocked;
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
                if (endX !== undefined) pts[pts.length - 1] = { x: endX, y: endY };
                // String-pulling: keep only waypoints we can't skip in a straight line
                const out = [];
                let fromX = sx, fromY = sy, i = 0;
                while (i < pts.length) {
                    let j = pts.length - 1;
                    while (j > i && !this.lineWalkable(fromX, fromY, pts[j].x, pts[j].y)) j--;
                    out.push(pts[j]);
                    fromX = pts[j].x; fromY = pts[j].y; i = j + 1;
                }
                return out;
            }

            /** Smoothed waypoint list from (sx, sy) toward (tx, ty), or null if unreachable. */
            findPath(sx, sy, tx, ty) {
                const start = this.nearestFree(sx, sy), goal = this.nearestFree(tx, ty);
                if (start === null || goal === null) return null;
                if (!this._search(start, goal, Infinity)) return null;
                const exact = this.walkable(tx, ty);
                return this._buildPath(goal, sx, sy, exact ? tx : undefined, exact ? ty : undefined);
            }

            /** Bounded Dijkstra from (sx, sy). Returns reached cell indices (cost in this.g). */
            flood(sx, sy, maxCost) {
                const start = this.nearestFree(sx, sy);
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

        /**
         * The point an actor should walk toward on its way to (gx, gy): the goal
         * itself when the straight line is walkable, otherwise the current waypoint
         * of a grid path (cached on ent._navPath, re-planned when the goal moves by
         * more than 32px or every REPATH_TICKS). Unreachable goals fall back to
         * heading straight, which is the old behavior.
         */
        function navWaypoint(ent, gx, gy, map) {
            const N = CONFIG.NAV;
            const nav = map ? NavGrid.for(map) : null;
            if (!nav || nav.lineWalkable(ent.x, ent.y, gx, gy)) {
                ent._navPath = null;
                return { x: gx, y: gy, finalLeg: true };
            }
            let st = ent._navPath;
            if (!st || Math.hypot(st.goalX - gx, st.goalY - gy) > 32 || _simTick >= st.repathAt || st.idx >= st.pts.length) {
                const pts = nav.findPath(ent.x, ent.y, gx, gy);
                st = ent._navPath = pts && pts.length ? { pts, idx: 0, goalX: gx, goalY: gy, repathAt: _simTick + N.REPATH_TICKS } : null;
            }
            if (!st) return { x: gx, y: gy, finalLeg: true };
            while (st.idx < st.pts.length - 1 &&
                   (Math.hypot(st.pts[st.idx].x - ent.x, st.pts[st.idx].y - ent.y) < N.WAYPOINT_REACHED ||
                    nav.lineWalkable(ent.x, ent.y, st.pts[st.idx + 1].x, st.pts[st.idx + 1].y))) st.idx++;
            const wp = st.pts[st.idx];
            return { x: wp.x, y: wp.y, finalLeg: st.idx === st.pts.length - 1 };
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
            const wp = navWaypoint(ent, gx, gy, map);
            const dx = wp.x - ent.x, dy = wp.y - ent.y, d = Math.hypot(dx, dy);
            if (d < 1e-3) return { x: 0, y: 0 };
            const step = Math.min(speed, d);
            return { x: (dx / d) * step, y: (dy / d) * step };
        }

        /**
         * One companion movement step toward (gx, gy): straight when clear,
         * otherwise along a grid path. Arrives softly on the final leg using
         * FORMATION_ARRIVE_GAIN, like the old direct follow.
         */
        function companionNavStep(tm, gx, gy, topSpeed, game) {
            const C = CONFIG.COMPANION;
            const wp0 = navWaypoint(tm, gx, gy, game && game.activeMap);
            const det = detourAroundPlayer(tm, wp0.x, wp0.y, game && game.player);
            const wp = (det.x === wp0.x && det.y === wp0.y) ? wp0 : { x: det.x, y: det.y, finalLeg: false };
            const dx = wp.x - tm.x, dy = wp.y - tm.y, d = Math.hypot(dx, dy);
            if (d <= (wp.finalLeg ? C.FORMATION_DEADZONE : 0.5)) return;
            const step = wp.finalLeg ? Math.min(topSpeed, d * C.FORMATION_ARRIVE_GAIN) : Math.min(topSpeed, d);
            gaitCommand(tm, (dx / d) * step, (dy / d) * step);
            tm.x += (dx / d) * step;
            tm.y += (dy / d) * step;
        }
        
