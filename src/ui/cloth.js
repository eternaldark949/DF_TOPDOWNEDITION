        /* =====================================================================
           CLOTH — swinging coat hems, skirts and trains
           ---------------------------------------------------------------------
           Same approach as the hair (hairGeometry in ui/humanoid-render.js):
           points live in world space and are stepped in fixed slices of game
           time, so cloth trails when you walk, swings out on a turn and
           settles when you stop, at any frame rate.

           A panel is a row of chains hanging off an edge of the body. Each
           chain is given in the frame it's drawn in (e.g. the hips) as
             { a: {x, y},   where it's sewn on
               t: {x, y} }  where its hem hangs when standing still
           and the spec adds:
             segs       points per chain after the anchor (default 3)
             stiffness  pull back toward the rest shape per slice (0..1)
             damping    how much speed is kept per slice (0..1; higher = floatier)
             keepOut    radius around the frame origin the cloth can't enter
             drift      gentle idle flutter (silk)
           dyn.wind = {x, y} pushes the hem (world px per slice; weather wires this later).
           Off the world canvas (portraits, previews) it returns the rest shape.
           ===================================================================== */

        const CLOTH_SIM = { STEP: 1 / 120, MAX_STEPS: 12, SNAP: 80 };
        const _CL_ROOT = { x: 0, y: 0 }, _CL_HEM = { x: 0, y: 0 };   // clothGeometry's per-slice points, reused

        /* The frame → world transform for a simulation drawn in the current ctx frame. One shared object
           (its helpers read _stM), filled by each _simTransform call: a caller uses it before the next call.
           The world matrix's inverse is worked out once a frame, not once per hair and cloth panel. */
        let _stM = null, _stDet = 1, _stInv = null, _stInvSrc = null;
        const _simT = {
            M: null, sc: 1, ang: 0,
            toW: (x, y) => ({ x: _stM.a * x + _stM.c * y + _stM.e, y: _stM.b * x + _stM.d * y + _stM.f }),
            toL: (x, y) => { const M = _stM, dx = x - M.e, dy = y - M.f; return { x: (M.d * dx - M.c * dy) / _stDet, y: (-M.b * dx + M.a * dy) / _stDet }; },
            /** toL into an existing point (no new object) */
            toLInto: (o, x, y) => { const M = _stM, dx = x - M.e, dy = y - M.f; o.x = (M.d * dx - M.c * dy) / _stDet; o.y = (-M.b * dx + M.a * dy) / _stDet; return o; }
        };
        /** Frame → world helpers for simulations drawn in the current ctx frame, or null off the world canvas. */
        function _simTransform(ctx) {
            if (!_worldMatrix || ctx.canvas !== _worldCanvas) return null;
            if (_stInvSrc !== _worldMatrix) { _stInv = _worldMatrix.inverse(); _stInvSrc = _worldMatrix; }   // (a new matrix each frame)
            const M = _stInv.multiply(ctx.getTransform());                   // camera and shake cancel out
            _stM = M; _stDet = M.a * M.d - M.b * M.c;
            _simT.M = M; _simT.sc = Math.hypot(M.a, M.b) || 1; _simT.ang = Math.atan2(M.b, M.a);   // the frame's +x in world
            return _simT;
        }

        /** The sim's points in the ctx frame, written into arrays kept on the sim (the draw reads them at once) */
        function _simOut(sim, chains, toLInto) {
            const out = sim._out || (sim._out = []);
            out.length = chains.length;
            for (let i = 0; i < chains.length; i++) {
                const pts = chains[i], o = out[i] || (out[i] = []);
                if (o.length !== pts.length) { o.length = 0; for (let j = 0; j < pts.length; j++) o.push({ x: 0, y: 0 }); }
                for (let j = 0; j < pts.length; j++) toLInto(o[j], pts[j].x, pts[j].y);
            }
            return out;
        }

        /** How many fixed slices of game time a simulation should run this frame. */
        function _simSteps(sim, step, maxSteps) {
            sim.acc += Math.max(0, _gameTimeSec - sim.t) / step;
            sim.t = _gameTimeSec;
            let steps = Math.floor(sim.acc);
            sim.acc -= steps;
            if (steps > maxSteps) { steps = maxSteps; sim.acc = 0; }
            return steps;
        }

        // Specs can be rebuilt by clothing pieces or edited in place. Keep exact copies
        // of the geometric inputs per owner/panel, and only rebuild their immutable
        // lengths and rest spacing when one of those inputs changes.
        const _clothOwnerShapes = new WeakMap(), _clothPreviewShapes = new WeakMap();
        function _clothShape(owner, key, spec) {
            let store;
            if (owner) {
                store = _clothOwnerShapes.get(owner);
                if (!store) _clothOwnerShapes.set(owner, store = new Map());
            }
            const old = owner ? store.get(key) : _clothPreviewShapes.get(spec);
            const n = spec.segs || 3, chains = spec.chains, m = chains.length;
            let same = old && old.n === n && old.closed === !!spec.closed && old.coords.length === m * 4;
            if (same) for (let ci = 0; ci < m; ci++) {
                const ch = chains[ci], j = ci * 4, v = old.coords;
                if (!Object.is(v[j], ch.a.x) || !Object.is(v[j + 1], ch.a.y) ||
                    !Object.is(v[j + 2], ch.t.x) || !Object.is(v[j + 3], ch.t.y)) { same = false; break; }
            }
            if (same) return old;
            const shape = { n, closed: !!spec.closed, coords: [], lengths: [], spacing: [], rest: [] };
            for (let ci = 0; ci < m; ci++) {
                const ch = chains[ci], pts = [];
                shape.coords.push(ch.a.x, ch.a.y, ch.t.x, ch.t.y);
                shape.lengths.push(Math.hypot(ch.t.x - ch.a.x, ch.t.y - ch.a.y) / n);
                // Keep the original rest-pose evaluation order: delta * i / n.
                for (let i = 0; i <= n; i++) pts.push({ x: ch.a.x + (ch.t.x - ch.a.x) * i / n, y: ch.a.y + (ch.t.y - ch.a.y) * i / n });
                shape.rest.push(pts);
                if (ci || spec.closed) {
                    const ra = chains[(ci + m - 1) % m], rb = ch, spacing = [];
                    for (let i = 1; i <= n; i++) {
                        const u = i / n;
                        spacing[i] = Math.hypot((ra.a.x + (ra.t.x - ra.a.x) * u) - (rb.a.x + (rb.t.x - rb.a.x) * u),
                                               (ra.a.y + (ra.t.y - ra.a.y) * u) - (rb.a.y + (rb.t.y - rb.a.y) * u));
                    }
                    shape.spacing[ci] = spacing;
                }
            }
            if (owner) store.set(key, shape); else _clothPreviewShapes.set(spec, shape);
            return shape;
        }

        function _clothRest(spec, shape) { return (shape || _clothShape(null, null, spec)).rest; }

        /**
         * Simulate one cloth panel for `owner` and return its chains as points in the
         * current ctx frame: [[anchor, ..., hem], ...]. `key` names the panel on the owner.
         */
        function clothGeometry(ctx, owner, key, spec, dyn) {
            const shape = _clothShape(owner, key, spec);
            const T = owner && !_crowdLite && (typeof _zoomLOD === 'undefined' || _zoomLOD < 2) ? _simTransform(ctx) : null;
            if (!T) return _clothRest(spec, shape);
            const { toLInto, sc, ang: baseAngle, M } = T;
            const n = spec.segs || 3, chains = spec.chains;
            const store = owner._cloth || (owner._cloth = {});
            let sim = store[key];
            const originX = M.e, originY = M.f;
            if (!sim || sim.shape !== shape || sim.count !== chains.length * (n + 1) || Math.hypot(sim.ox - originX, sim.oy - originY) > CLOTH_SIM.SNAP * sc) {
                sim = store[key] = { shape, t: _gameTimeSec, acc: 0, ox: originX, oy: originY, ang: baseAngle, count: chains.length * (n + 1),
                                     chains: _clothRest(spec, shape).map(pts => pts.map(p => {
                                         const x = M.a * p.x + M.c * p.y + M.e, y = M.b * p.x + M.d * p.y + M.f;
                                         return { x, y, px: x, py: y };
                                     })) };
            }

            const steps = _simSteps(sim, CLOTH_SIM.STEP, CLOTH_SIM.MAX_STEPS);
            const ox0 = sim.ox, oy0 = sim.oy, a0 = sim.ang;
            let dA = baseAngle - a0; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
            const stiff = spec.stiffness != null ? spec.stiffness : 0.12, damp = spec.damping != null ? spec.damping : 0.86;
            const wind = (dyn && dyn.wind) || null, keepOut = (spec.keepOut || 0) * sc;

            if (steps === 0) {
                // Between slices: carry the cloth rigidly with the body so it stays attached
                for (let ci = 0; ci < chains.length; ci++) {
                    const pts = sim.chains[ci], a = chains[ci].a, root = _CL_ROOT;
                    root.x = M.a * a.x + M.c * a.y + M.e; root.y = M.b * a.x + M.d * a.y + M.f;
                    const rx = root.x - pts[0].x, ry = root.y - pts[0].y;
                    for (const p of pts) { p.x += rx; p.y += ry; p.px += rx; p.py += ry; }
                }
            }
            for (let k = 1; k <= steps; k++) {
                const f = k / steps;
                // Body pose for this slice, interpolated from last frame's
                const ang = a0 + dA * f, c = Math.cos(ang), s = Math.sin(ang);
                const fx = ox0 + (originX - ox0) * f, fy = oy0 + (originY - oy0) * f;
                const time = sim.t + (k - steps) * CLOTH_SIM.STEP;

                for (let ci = 0; ci < chains.length; ci++) {
                    const ch = chains[ci], pts = sim.chains[ci];
                    // the seam and hem points for this slice, in the world (as sliceW(lx, ly) was, without its objects)
                    const root = _CL_ROOT, hem = _CL_HEM;
                    root.x = fx + (c * ch.a.x - s * ch.a.y) * sc; root.y = fy + (s * ch.a.x + c * ch.a.y) * sc;
                    pts[0].px = pts[0].x; pts[0].py = pts[0].y; pts[0].x = root.x; pts[0].y = root.y;
                    hem.x = fx + (c * ch.t.x - s * ch.t.y) * sc; hem.y = fy + (s * ch.t.x + c * ch.t.y) * sc;
                    const L = shape.lengths[ci] * sc;
                    for (let i = 1; i <= n; i++) {
                        const p = pts[i], u = i / n;
                        const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
                        const k0 = stiff * (1 - 0.55 * u);                   // firm at the seam, loose at the hem
                        let ax = (root.x + (hem.x - root.x) * u - p.x) * k0, ay = (root.y + (hem.y - root.y) * u - p.y) * k0;
                        if (spec.drift) {                                    // silk never quite hangs still
                            const w = Math.sin(time * 1.7 + ci * 1.3 + i * 0.6) * spec.drift * sc * u;
                            ax += -s * w; ay += c * w;
                        }
                        if (wind) { ax += wind.x * sc * u; ay += wind.y * sc * u; }
                        p.px = p.x; p.py = p.y;
                        p.x += vx + ax; p.y += vy + ay;
                    }
                    // Exact segment lengths (follow the leader), kept off the body, with the
                    // dynamic-FTL velocity correction the hair uses so chains don't zigzag
                    const cx = sim._cx || (sim._cx = []), cy = sim._cy || (sim._cy = []);
                    for (let i = 1; i <= n; i++) {
                        const a = pts[i - 1], p = pts[i], bx = p.x, by = p.y;
                        if (keepOut) {
                            const dx0 = p.x - fx, dy0 = p.y - fy, d0 = Math.hypot(dx0, dy0);
                            if (d0 < keepOut && d0 > 0.001) { p.x = fx + dx0 / d0 * keepOut; p.y = fy + dy0 / d0 * keepOut; }
                        }
                        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
                        p.x = a.x + dx / d * L; p.y = a.y + dy / d * L;
                        cx[i] = p.x - bx; cy[i] = p.y - by;
                    }
                    for (let i = 1; i < n; i++) { pts[i].px += 0.9 * cx[i + 1]; pts[i].py += 0.9 * cy[i + 1]; }
                }
                // Neighbouring chains hold the panel together: their hems can't drift
                // further apart than 1.4x or closer than 0.5x their rest spacing
                for (let ci = spec.closed ? 0 : 1; ci < chains.length; ci++) {
                    const A = sim.chains[(ci + chains.length - 1) % chains.length], B = sim.chains[ci];
                    const spacing = shape.spacing[ci];
                    for (let i = 1; i <= n; i++) {
                        const rest = spacing[i] * sc;
                        const p = A[i], q = B[i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
                        const target = Math.max(rest * 0.5, Math.min(rest * 1.4, d));
                        if (target !== d) {
                            const h = (d - target) / d * 0.5;
                            p.x += dx * h; p.y += dy * h; q.x -= dx * h; q.y -= dy * h;
                        }
                    }
                }
            }
            sim.ox = originX; sim.oy = originY; sim.ang = baseAngle;
            return _simOut(sim, sim.chains, toLInto);
        }

        /**
         * Fill a panel: down the first chain, along the hem through every chain's tip,
         * back up the last chain and along the seam. `edge` strokes the hem.
         */
        function drawClothPanel(ctx, chains, fill, edge, edgeWidth = 0.6) {
            const m = chains.length, first = chains[0], last = chains[m - 1], tip = ch => ch[ch.length - 1];
            ctx.beginPath();
            ctx.moveTo(first[0].x, first[0].y);
            for (let i = 1; i < first.length; i++) ctx.lineTo(first[i].x, first[i].y);
            const hem = () => {
                for (let j = 1; j < m; j++) {
                    const p = tip(chains[j - 1]), q = tip(chains[j]);
                    if (j < m - 1) ctx.quadraticCurveTo(q.x, q.y, (q.x + tip(chains[j + 1]).x) / 2, (q.y + tip(chains[j + 1]).y) / 2);
                    else if (m > 2) ctx.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2, q.x, q.y);
                    else ctx.lineTo(q.x, q.y);
                }
            };
            hem();
            for (let i = last.length - 2; i >= 0; i--) ctx.lineTo(last[i].x, last[i].y);
            for (let j = m - 2; j > 0; j--) ctx.lineTo(chains[j][0].x, chains[j][0].y);
            ctx.closePath();
            ctx.fillStyle = fill; ctx.fill();
            if (edge) {
                ctx.strokeStyle = edge; ctx.lineWidth = edgeWidth;
                ctx.beginPath(); ctx.moveTo(tip(first).x, tip(first).y); hem(); ctx.stroke();
            }
        }
