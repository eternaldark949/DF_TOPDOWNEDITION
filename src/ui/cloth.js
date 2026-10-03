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

        /** Frame → world helpers for simulations drawn in the current ctx frame, or null off the world canvas. */
        function _simTransform(ctx) {
            if (!_worldMatrix || ctx.canvas !== _worldCanvas) return null;
            const M = _worldMatrix.inverse().multiply(ctx.getTransform());   // camera and shake cancel out
            const det = M.a * M.d - M.b * M.c;
            return {
                M,
                toW: (x, y) => ({ x: M.a * x + M.c * y + M.e, y: M.b * x + M.d * y + M.f }),
                toL: (x, y) => { const dx = x - M.e, dy = y - M.f; return { x: (M.d * dx - M.c * dy) / det, y: (-M.b * dx + M.a * dy) / det }; },
                sc: Math.hypot(M.a, M.b) || 1,
                ang: Math.atan2(M.b, M.a)                                     // the frame's +x in world
            };
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

        function _clothRest(spec) {
            const n = spec.segs || 3;
            return spec.chains.map(ch => {
                const pts = [];
                for (let i = 0; i <= n; i++) pts.push({ x: ch.a.x + (ch.t.x - ch.a.x) * i / n, y: ch.a.y + (ch.t.y - ch.a.y) * i / n });
                return pts;
            });
        }

        /**
         * Simulate one cloth panel for `owner` and return its chains as points in the
         * current ctx frame: [[anchor, ..., hem], ...]. `key` names the panel on the owner.
         */
        function clothGeometry(ctx, owner, key, spec, dyn) {
            const T = owner && !_crowdLite && (typeof _zoomLOD === 'undefined' || _zoomLOD < 2) ? _simTransform(ctx) : null;
            if (!T) return _clothRest(spec);
            const { toW, toL, sc, ang: baseAngle, M } = T;
            const n = spec.segs || 3, chains = spec.chains;
            const store = owner._cloth || (owner._cloth = {});
            let sim = store[key];
            const origin = { x: M.e, y: M.f };
            if (!sim || sim.count !== chains.length * (n + 1) || Math.hypot(sim.ox - origin.x, sim.oy - origin.y) > CLOTH_SIM.SNAP * sc) {
                sim = store[key] = { t: _gameTimeSec, acc: 0, ox: origin.x, oy: origin.y, ang: baseAngle, count: chains.length * (n + 1),
                                     chains: _clothRest(spec).map(pts => pts.map(p => { const w = toW(p.x, p.y); return { x: w.x, y: w.y, px: w.x, py: w.y }; })) };
            }

            const steps = _simSteps(sim, CLOTH_SIM.STEP, CLOTH_SIM.MAX_STEPS);
            const ox0 = sim.ox, oy0 = sim.oy, a0 = sim.ang;
            let dA = baseAngle - a0; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
            const stiff = spec.stiffness != null ? spec.stiffness : 0.12, damp = spec.damping != null ? spec.damping : 0.86;
            const wind = (dyn && dyn.wind) || null, keepOut = (spec.keepOut || 0) * sc;

            if (steps === 0) {
                // Between slices: carry the cloth rigidly with the body so it stays attached
                for (let ci = 0; ci < chains.length; ci++) {
                    const pts = sim.chains[ci], root = toW(chains[ci].a.x, chains[ci].a.y);
                    const rx = root.x - pts[0].x, ry = root.y - pts[0].y;
                    for (const p of pts) { p.x += rx; p.y += ry; p.px += rx; p.py += ry; }
                }
            }
            for (let k = 1; k <= steps; k++) {
                const f = k / steps;
                // Body pose for this slice, interpolated from last frame's
                const ang = a0 + dA * f, c = Math.cos(ang), s = Math.sin(ang);
                const fx = ox0 + (origin.x - ox0) * f, fy = oy0 + (origin.y - oy0) * f;
                const sliceW = (lx, ly) => ({ x: fx + (c * lx - s * ly) * sc, y: fy + (s * lx + c * ly) * sc });
                const time = sim.t + (k - steps) * CLOTH_SIM.STEP;

                for (let ci = 0; ci < chains.length; ci++) {
                    const ch = chains[ci], pts = sim.chains[ci];
                    const root = sliceW(ch.a.x, ch.a.y);
                    pts[0].px = pts[0].x; pts[0].py = pts[0].y; pts[0].x = root.x; pts[0].y = root.y;
                    const hem = sliceW(ch.t.x, ch.t.y);
                    const L = Math.hypot(ch.t.x - ch.a.x, ch.t.y - ch.a.y) / n * sc;
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
                for (let ci = 1; ci < chains.length; ci++) {
                    const A = sim.chains[ci - 1], B = sim.chains[ci];
                    const ra = chains[ci - 1], rb = chains[ci];
                    for (let i = 1; i <= n; i++) {
                        const u = i / n;
                        const rest = Math.hypot((ra.a.x + (ra.t.x - ra.a.x) * u) - (rb.a.x + (rb.t.x - rb.a.x) * u),
                                                (ra.a.y + (ra.t.y - ra.a.y) * u) - (rb.a.y + (rb.t.y - rb.a.y) * u)) * sc;
                        const p = A[i], q = B[i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
                        const target = Math.max(rest * 0.5, Math.min(rest * 1.4, d));
                        if (target !== d) {
                            const h = (d - target) / d * 0.5;
                            p.x += dx * h; p.y += dy * h; q.x -= dx * h; q.y -= dy * h;
                        }
                    }
                }
            }
            sim.ox = origin.x; sim.oy = origin.y; sim.ang = baseAngle;
            return sim.chains.map(pts => pts.map(p => toL(p.x, p.y)));
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
