        // ===== LV0 BASEMENT =====
        // The shape kit: collision geometry, and nothing about any game. Points, segments, circles,
        // boxes (axis-aligned rects { x, y, w, h }) and oriented boxes (OBBs: centre x, y, `length` along
        // `angle`, `width` across). Overlap tests return a contact packet or null.
        //
        // CONTACT PACKET: { nx, ny, depth }   the normal points from the second shape to the first; move the
        //                                     first by depth along it (or share it out by mass) to separate them
        // RIGID BODY (impulseAt): { invM, invI, x, y, vx, vy, w }   w = turn rate; invM 0 = immovable
        //
        //   const hit = shapeKit.sat(obb_a, obb_b);           // { nx, ny, depth } or null
        //   const t = shapeKit.sweepCircle(ax, ay, bx, by, cx, cy, r);   // 0..1 along a->b where it first touches, or null
        //   if (shapeKit.overlaps(entity_a, entity_b)) ...    // any two GameEntity shapes
        // narrow_checks counts the narrow-phase tests that touched (for a profiler; reset it when you like).
        const shapeKit = {
            narrow_checks: 0,

            // Math helper: distance from a point (circle center) to a line segment (bullet path)
            segmentDistanceSq (px, py, l1x, l1y, l2x, l2y) {
                const l2 = (l1x - l2x) ** 2 + (l1y - l2y) ** 2;
                if (l2 === 0) return (px - l1x) ** 2 + (py - l1y) ** 2;
                let t = ((px - l1x) * (l2x - l1x) + (py - l1y) * (l2y - l1y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return (px - (l1x + t * (l2x - l1x))) ** 2 + (py - (l1y + t * (l2y - l1y))) ** 2;
            },

            sweepCircle (ax, ay, bx, by, cx, cy, radius) {
                if (Math.max(ax, bx) < cx - radius || Math.min(ax, bx) > cx + radius ||
                    Math.max(ay, by) < cy - radius || Math.min(ay, by) > cy + radius) return null;
                const ox = ax - cx, oy = ay - cy, dx = bx - ax, dy = by - ay;
                const c = ox * ox + oy * oy - radius * radius;
                if (c <= 0) return 0;
                const a = dx * dx + dy * dy;
                if (!a) return null;
                const b = ox * dx + oy * dy, disc = b * b - a * c;
                if (disc < 0) return null;
                const t = (-b - Math.sqrt(disc)) / a;
                return t >= 0 && t <= 1 ? t : null;
            },

            sweepRect (ax, ay, bx, by, left, top, right, bottom) {
                let lo = 0, hi = 1;
                for (const [v, step, min, max] of [[ax, bx - ax, left, right], [ay, by - ay, top, bottom]]) {
                    if (!step) { if (v < min || v > max) return null; continue; }
                    const a = (min - v) / step, b = (max - v) / step;
                    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
                    if (lo > hi) return null;
                }
                return lo;
            },

            // Exact circle-vs-box sweep: two strips plus round corners, avoiding false corner hits.
            sweepRoundedBox (ax, ay, bx, by, hw, hh, radius) {
                if (Math.max(ax, bx) < -hw - radius || Math.min(ax, bx) > hw + radius ||
                    Math.max(ay, by) < -hh - radius || Math.min(ay, by) > hh + radius) return null;
                let best = null;
                const keep = t => { if (t !== null && (best === null || t < best)) best = t; };
                keep(shapeKit.sweepRect(ax, ay, bx, by, -hw - radius, -hh, hw + radius, hh));
                keep(shapeKit.sweepRect(ax, ay, bx, by, -hw, -hh - radius, hw, hh + radius));
                for (const x of [-hw, hw]) for (const y of [-hh, hh]) keep(shapeKit.sweepCircle(ax, ay, bx, by, x, y, radius));
                return best;
            },

            /**
             * Point-in-AABB test (for UI/triggers).
             */
            // --- SEGMENTS vs RECTS (sight lines, rays, vision cones, shots: thousands a frame, nothing allocated) ---
            /** Where segment 1→2 crosses edge e1→e2, as uA along the segment (0..1), or -1 when it doesn't */
            segEdgeT (x1, y1, x2, y2, ex1, ey1, ex2, ey2) {
                const denom = (ey2 - ey1) * (x2 - x1) - (ex2 - ex1) * (y2 - y1);
                if (denom === 0) return -1;
                const uA = ((ex2 - ex1) * (y1 - ey1) - (ey2 - ey1) * (x1 - ex1)) / denom;
                const uB = ((x2 - x1) * (y1 - ey1) - (y2 - y1) * (x1 - ex1)) / denom;
                return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) ? uA : -1;
            },
            /** True when the segment crosses any edge of the rect (rx, ry, rw, rh) */
            segCrossesRect (x1, y1, x2, y2, rx, ry, rw, rh) {
                if ((x1 > x2 ? x1 : x2) < rx || (x1 < x2 ? x1 : x2) > rx + rw || (y1 > y2 ? y1 : y2) < ry || (y1 < y2 ? y1 : y2) > ry + rh) return false;
                const T = shapeKit.segEdgeT;
                return T(x1, y1, x2, y2, rx, ry, rx + rw, ry) >= 0 || T(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh) >= 0
                    || T(x1, y1, x2, y2, rx, ry, rx, ry + rh) >= 0 || T(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) >= 0;
            },
            /** Every point where the segment crosses the rect's edges (top, bottom, left, right), as { x, y } */
            segRectPoints (x1, y1, x2, y2, rx, ry, rw, rh) {
                const pts = [], T = shapeKit.segEdgeT;
                for (const [ex1, ey1, ex2, ey2] of [[rx, ry, rx + rw, ry], [rx, ry + rh, rx + rw, ry + rh], [rx, ry, rx, ry + rh], [rx + rw, ry, rx + rw, ry + rh]]) {
                    const t = T(x1, y1, x2, y2, ex1, ey1, ex2, ey2);
                    if (t >= 0) pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
                }
                return pts;
            },
            /** The nearest crossing's distance from (x1, y1) that's at least minD, if under `best`; else `best` */
            segRectNearest (x1, y1, x2, y2, rx, ry, rw, rh, best, minD) {
                if ((x1 > x2 ? x1 : x2) < rx || (x1 < x2 ? x1 : x2) > rx + rw || (y1 > y2 ? y1 : y2) < ry || (y1 < y2 ? y1 : y2) > ry + rh) return best;
                const T = shapeKit.segEdgeT;
                for (let e = 0; e < 4; e++) {
                    const t = e === 0 ? T(x1, y1, x2, y2, rx, ry, rx + rw, ry)
                            : e === 1 ? T(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)
                            : e === 2 ? T(x1, y1, x2, y2, rx, ry, rx, ry + rh)
                            : T(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh);
                    if (t < 0) continue;
                    const d = Math.hypot(x1 + t * (x2 - x1) - x1, y1 + t * (y2 - y1) - y1);
                    if (d < best && d >= minD) best = d;
                }
                return best;
            },
            /** Does the segment touch the rect [L, R] × [T, B], inside included? (slab clip) */
            segmentHitsRect (x1, y1, x2, y2, L, T, R, B) {
                let t0 = 0, t1 = 1;
                const dx = x2 - x1, dy = y2 - y1;
                for (const [p, q] of [[-dx, x1 - L], [dx, R - x1], [-dy, y1 - T], [dy, B - y1]]) {
                    if (p === 0) { if (q < 0) return false; continue; }
                    const r = q / p;
                    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
                    else { if (r < t0) return false; if (r < t1) t1 = r; }
                }
                return true;
            },
            /** The same for a turned rect { x, y, width, height, angle } (x, y its corner; it turns about its centre) */
            segmentHitsTurnedRect (x1, y1, x2, y2, p) {
                const hw = p.width / 2, hh = p.height / 2;
                const cx = p.x + hw, cy = p.y + hh;
                const a = -(p.angle || 0), c = Math.cos(a), s = Math.sin(a);
                const ax = (x1 - cx) * c - (y1 - cy) * s, ay = (x1 - cx) * s + (y1 - cy) * c;
                const bx = (x2 - cx) * c - (y2 - cy) * s, by = (x2 - cx) * s + (y2 - cy) * c;
                return shapeKit.segmentHitsRect(ax, ay, bx, by, -hw, -hh, hw, hh);
            },

            // --- POINTS, SQUARES AND QUADS vs RECTS ---
            /** [dx, dy] from the rect's nearest point to (x, y) (0, 0 inside it) */
            rectGap (x, y, r) { return [x - Math.max(r.x, Math.min(r.x + r.w, x)), y - Math.max(r.y, Math.min(r.y + r.h, y))]; },
            /** (x, y) strictly inside the rect (its edge doesn't count) */
            pointInsideRect (x, y, r) { return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; },
            /** A square of half-size h at (x, y) overlapping the rect (touching doesn't count): the cheap body test */
            squareHitsRect (x, y, h, r) { return x + h > r.x && x - h < r.x + r.w && y + h > r.y && y - h < r.y + r.h; },
            /** The same with two half-sizes (an axis-aligned box centred at x, y): which way out is shortest, or null.
             *  -> { side: 'left' | 'right' | 'top' | 'bottom', overlap } */
            boxOutOfRect (x, y, hw, hh, r) {
                if (!(x + hw > r.x && x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h)) return null;
                const L = (x + hw) - r.x, R = (r.x + r.w) - (x - hw), T = (y + hh) - r.y, B = (r.y + r.h) - (y - hh);
                const m = Math.min(L, R, T, B);
                return { side: m === L ? 'left' : m === R ? 'right' : m === T ? 'top' : 'bottom', overlap: m };
            },
            /** The convex hull of points (monotone chain), from the lowest x round. Sorts pts in place. Points are
             *  [x, y] pairs, or { x, y } with xy = true. Fewer than three come back as they are, sorted. */
            hull (pts, xy) {
                const X = xy ? p => p.x : p => p[0], Y = xy ? p => p.y : p => p[1];
                pts.sort((a, b) => X(a) - X(b) || Y(a) - Y(b));
                if (pts.length < 3) return pts;
                const cr = (o, a, b) => (X(a) - X(o)) * (Y(b) - Y(o)) - (Y(a) - Y(o)) * (X(b) - X(o));
                const lo = [], up = [];
                for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
                for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
                return lo.slice(0, -1).concat(up.slice(0, -1));
            },
            /** A turned rect's four corners as [x, y] pairs (centred at cx, cy) */
            quadCorners (cx, cy, w, h, a) {
                const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hh = h / 2;
                return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
            },
            /** Two quads (four [x, y] corners each) overlap, touching doesn't count (separating axes) */
            quadsOverlap (A, B) {
                for (const P of [A, B]) for (let i = 0; i < 4; i++) {
                    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], nx = y1 - y2, ny = x2 - x1;
                    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
                    for (const [x, y] of A) { const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
                    for (const [x, y] of B) { const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
                    if (a1 <= b0 || b1 <= a0) return false;
                }
                return true;
            },
            /** A rect's four corners as a quad */
            rectQuad (r) { return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]; },

            pointInRect (px, py, rect) {
                return (px >= rect.x && px <= rect.x + rect.w && 
                        py >= rect.y && py <= rect.y + rect.h);
            },

            /** The four corners of a box: centre x, y; `length` along `angle`, `width` across. */
            boxCorners (b) {
                const a = b.angle || 0, fx = Math.cos(a), fy = Math.sin(a), hl = (b.length || 0) / 2, hw = (b.width || 0) / 2;
                return [[b.x + fx * hl - fy * hw, b.y + fy * hl + fx * hw], [b.x + fx * hl + fy * hw, b.y + fy * hl - fx * hw],
                        [b.x - fx * hl + fy * hw, b.y - fy * hl - fx * hw], [b.x - fx * hl - fy * hw, b.y - fy * hl + fx * hw]];
            },

            insideBox (b, px, py, pad = 0.5) {
                const a = b.angle || 0, dx = px - b.x, dy = py - b.y;
                return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) <= (b.length || 0) / 2 + pad
                    && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= (b.width || 0) / 2 + pad;
            },

            /**
             * Where two overlapping boxes touch, with the normal (nx, ny) pointing from b to a: the
             * corners of each that are inside the other (a corner into a flat side, the usual
             * crash); averaged when several are, so a flat-on hit lands mid-face and twists nothing.
             */
            boxContactPoint (a, b, nx, ny) {
                // Each with how deep it went (a's corners against the normal, b's along it): a fast car is
                // well in by the time it's caught, so only the deepest (the corner that struck first) counts
                const pts = [];
                if (b.length) for (const [x, y] of shapeKit.boxCorners(a)) if (shapeKit.insideBox(b, x, y)) pts.push([x, y, -(x * nx + y * ny)]);
                if (a.length) for (const [x, y] of shapeKit.boxCorners(b)) if (shapeKit.insideBox(a, x, y)) pts.push([x, y, x * nx + y * ny]);
                if (pts.length > 1) {
                    let deepest = -Infinity;
                    for (const p of pts) if (p[2] > deepest) deepest = p[2];
                    for (let i = pts.length - 1; i >= 0; i--) if (pts[i][2] < deepest - 2) pts.splice(i, 1);
                }
                if (!pts.length) {       // edge to edge: a's deepest corner along the normal
                    let best = null, bd = Infinity;
                    for (const c of shapeKit.boxCorners(a)) { const d = c[0] * nx + c[1] * ny; if (d < bd) { bd = d; best = c; } }
                    return best || [(a.x + b.x) / 2, (a.y + b.y) / 2];
                }
                let x = 0, y = 0;
                for (const p of pts) { x += p[0]; y += p[1]; }
                return [x / pts.length, y / pts.length];
            },

            /**
             * One rigid-body impulse at a contact point P between bodies a and b (b may be
             * immovable: invM 0), normal n from b to a. Each body is { invM, invI, x, y, vx, vy, w }
             * (w = turn rate, rad/tick); velocities are changed in place. Bounce e along the normal,
             * Coulomb friction mu along the face. Because the push lands at P, not at the centre,
             * it turns the body as well as moving it: a front corner into a wall swings the tail
             * round to meet it, a shove on a rear quarter sends that end away.
             * Returns the closing speed it took out (0 when they were already parting).
             */
            impulseAt (a, b, px, py, nx, ny, e, mu) {
                const r1x = px - a.x, r1y = py - a.y, r2x = px - b.x, r2y = py - b.y;
                const vpx = (a.vx - a.w * r1y) - (b.vx - b.w * r2y), vpy = (a.vy + a.w * r1x) - (b.vy + b.w * r2x);
                const vn = vpx * nx + vpy * ny;
                if (vn >= 0) return 0;
                const c1n = r1x * ny - r1y * nx, c2n = r2x * ny - r2y * nx;
                const kn = a.invM + b.invM + a.invI * c1n * c1n + b.invI * c2n * c2n;
                if (!(kn > 0)) return 0;
                const jn = -(1 + e) * vn / kn;
                const tx = -ny, ty = nx, vt = vpx * tx + vpy * ty;
                const c1t = r1x * ty - r1y * tx, c2t = r2x * ty - r2y * tx;
                const kt = a.invM + b.invM + a.invI * c1t * c1t + b.invI * c2t * c2t;
                const jt = Math.max(-mu * jn, Math.min(mu * jn, kt > 0 ? -vt / kt : 0));
                const Jx = jn * nx + jt * tx, Jy = jn * ny + jt * ty;
                a.vx += Jx * a.invM; a.vy += Jy * a.invM; a.w += a.invI * (r1x * Jy - r1y * Jx);
                b.vx -= Jx * b.invM; b.vy -= Jy * b.invM; b.w -= b.invI * (r2x * Jy - r2y * Jx);
                return -(1 + e) * vn;
            },

            obbCorners (obb) {
                const cos = Math.cos(obb.angle || 0);
                const sin = Math.sin(obb.angle || 0);
                const hw = (obb.length || obb.width || 20) / 2;
                const hh = (obb.width || obb.height || 20) / 2;
                
                return [
                    { x: obb.x + (hw * cos - (-hh) * sin), y: obb.y + (hw * sin + (-hh) * cos) },
                    { x: obb.x + (hw * cos - hh * sin),    y: obb.y + (hw * sin + hh * cos) },
                    { x: obb.x + ((-hw) * cos - hh * sin), y: obb.y + ((-hw) * sin + hh * cos) },
                    { x: obb.x + ((-hw) * cos - (-hh) * sin), y: obb.y + ((-hw) * sin + (-hh) * cos) }
                ];
            },

            obbAxes (obb) {
                const cos = Math.cos(obb.angle || 0);
                const sin = Math.sin(obb.angle || 0);
                return [
                    { x: cos, y: sin },
                    { x: -sin, y: cos }
                ];
            },

            projectOnAxis (corners, axis) {
                let min = Infinity;
                let max = -Infinity;
                for (let c of corners) {
                    const dot = c.x * axis.x + c.y * axis.y;
                    if (dot < min) min = dot;
                    if (dot > max) max = dot;
                }
                return { min, max };
            },

            entityToObb (entity) {
                const center = entity.getCenter ? entity.getCenter() : { x: entity.x, y: entity.y };
                return {
                    x: center.x, 
                    y: center.y,
                    length: entity.width || 20, 
                    width: entity.height || 20,
                    angle: entity.angle || 0,
                    mass: entity.mass || 1,
                    vx: entity.vx || 0,
                    vy: entity.vy || 0
                };
            },

            rectToObb (aabb) {
                return {
                    x: aabb.x + (aabb.width || aabb.w) / 2,
                    y: aabb.y + (aabb.height || aabb.h) / 2,
                    length: aabb.width || aabb.w,
                    width: aabb.height || aabb.h,
                    angle: 0,
                    mass: aabb.mass || 1
                };
            },

            /** Is point p inside the OBB (a little tolerance)? */
            insideObb (p, o, tol = 0.6) {
                const c = Math.cos(-(o.angle || 0)), s = Math.sin(-(o.angle || 0)), dx = p.x - o.x, dy = p.y - o.y;
                const lx = dx * c - dy * s, ly = dx * s + dy * c;
                return Math.abs(lx) <= (o.length || o.width || 20) / 2 + tol && Math.abs(ly) <= (o.width || o.height || 20) / 2 + tol;
            },

            /**
             * Where two OBBs touch (n from o2 to o1): the deepest corner(s) of each into the other, averaging
             * corners that tie (face to face, so a flush push doesn't twist), preferring the one that's inside.
             */
            obbContactPoint (o1, o2, nx, ny) {
                const pick = (corners, sign) => {
                    let best = Infinity; for (const c of corners) best = Math.min(best, sign * (c.x * nx + c.y * ny));
                    let x = 0, y = 0, k = 0;
                    for (const c of corners) if (sign * (c.x * nx + c.y * ny) <= best + 0.5) { x += c.x; y += c.y; k++; }
                    return { x: x / k, y: y / k };
                };
                const p1 = pick(shapeKit.obbCorners(o1), 1), p2 = pick(shapeKit.obbCorners(o2), -1);
                const in1 = shapeKit.insideObb(p1, o2), in2 = shapeKit.insideObb(p2, o1);
                if (in1 && !in2) return p1;
                if (in2 && !in1) return p2;
                return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            },

            /**
             * SAT collision detection with MTV (Minimum Translation Vector).
             * Returns collision packet or null if no collision.
             */
            sat (obb1, obb2) {
                const corners1 = shapeKit.obbCorners(obb1);
                const corners2 = shapeKit.obbCorners(obb2);
                const axes = [...shapeKit.obbAxes(obb1), ...shapeKit.obbAxes(obb2)];
                
                let minOverlap = Infinity;
                let mtv = null;
                
                for (let axis of axes) {
                    const p1 = shapeKit.projectOnAxis(corners1, axis);
                    const p2 = shapeKit.projectOnAxis(corners2, axis);
                    
                    if (p1.max < p2.min || p2.max < p1.min) {
                        return null; // Gap found, no collision
                    }
                    
                    const overlap = Math.min(p1.max, p2.max) - Math.max(p1.min, p2.min);
                    if (overlap < minOverlap) {
                        minOverlap = overlap;
                        mtv = { x: axis.x, y: axis.y };
                    }
                }
                
                // Ensure MTV points from obb2 to obb1
                const dx = obb1.x - obb2.x;
                const dy = obb1.y - obb2.y;
                if (dx * mtv.x + dy * mtv.y < 0) {
                    mtv.x = -mtv.x;
                    mtv.y = -mtv.y;
                }
                
                shapeKit.narrow_checks++;
                return { nx: mtv.x, ny: mtv.y, depth: minOverlap };
            },

            /**
             * Circle vs Circle collision.
             * Returns collision packet with normal pointing from b to a.
             */
            circleVsCircle (a, b) {
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.hypot(dx, dy);
                const minDist = a.radius + b.radius;
                
                if (dist >= minDist) return null;
                
                shapeKit.narrow_checks++;
                
                if (dist > 0) {
                    return { 
                        nx: dx / dist, 
                        ny: dy / dist, 
                        depth: minDist - dist 
                    };
                }
                
                // Circles perfectly overlapping - push in arbitrary direction
                return { nx: 1, ny: 0, depth: minDist };
            },

            /**
             * Circle vs AABB collision.
             */
            circleVsRect (circle, rect, mapBounds) {
                const bb = rect.getBoundingBox();
                const closestX = Math.max(bb.x, Math.min(bb.x + bb.w, circle.x));
                const closestY = Math.max(bb.y, Math.min(bb.y + bb.h, circle.y));
                
                const dx = circle.x - closestX;
                const dy = circle.y - closestY;
                const dist = Math.hypot(dx, dy);
                
                if (dist >= circle.radius) return null;
                
                shapeKit.narrow_checks++;
                
                if (dist > 0) {
                    return { nx: dx / dist, ny: dy / dist, depth: circle.radius - dist };
                }
                
                // Circle center is inside the AABB. Evaluate pushout to each of the four
                // faces and pick the smallest valid one. "Valid" = the resulting position
                // stays inside the playable map area (when mapBounds is supplied).
                //
                // This is critical for thick perimeter walls (e.g. the gauntlet's 80px
                // outer ring): the geometric shortest face on the LEFT wall is west, but
                // pushing west goes off the map and the bound-clamp yanks the actor back
                // into the wall — wobble loop. Filtering to in-bounds candidates first
                // makes the resolver pick "east" for the left wall, "south" for the top
                // wall, etc., automatically.
                const r = circle.radius;
                const candidates = [
                    { nx: -1, ny:  0, depth: (circle.x - bb.x) + r,        outX: bb.x - r,        outY: circle.y },
                    { nx:  1, ny:  0, depth: (bb.x + bb.w - circle.x) + r, outX: bb.x + bb.w + r, outY: circle.y },
                    { nx:  0, ny: -1, depth: (circle.y - bb.y) + r,        outX: circle.x,        outY: bb.y - r },
                    { nx:  0, ny:  1, depth: (bb.y + bb.h - circle.y) + r, outX: circle.x,        outY: bb.y + bb.h + r }
                ];
                candidates.sort((a, b) => a.depth - b.depth);
                
                if (mapBounds) {
                    const m = mapBounds.margin || 0;
                    for (const c of candidates) {
                        if (c.outX >= m && c.outX <= mapBounds.w - m
                         && c.outY >= m && c.outY <= mapBounds.h - m) {
                            return { nx: c.nx, ny: c.ny, depth: c.depth };
                        }
                    }
                }
                
                // No bounds info, or every face's pushout exits the map — fall back to
                // the geometrically smallest pushout (degenerate case).
                const c0 = candidates[0];
                return { nx: c0.nx, ny: c0.ny, depth: c0.depth };
            },

            /**
             * Circle vs OBB collision.
             * Transforms circle to OBB local space for accurate collision.
             */
            circleVsObb (circle, obbEntity) {
                const obb = obbEntity.getOBB ? obbEntity.getOBB() : shapeKit.entityToObb(obbEntity);
                
                // Transform circle center to OBB local space
                const cos = Math.cos(-obb.angle);
                const sin = Math.sin(-obb.angle);
                const dx = circle.x - obb.x;
                const dy = circle.y - obb.y;
                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;
                
                // Find closest point on local AABB
                const hw = obb.length / 2;
                const hh = obb.width / 2;
                const closestX = Math.max(-hw, Math.min(hw, localX));
                const closestY = Math.max(-hh, Math.min(hh, localY));
                
                const distX = localX - closestX;
                const distY = localY - closestY;
                const dist = Math.hypot(distX, distY);
                
                if (dist >= circle.radius) return null;
                
                shapeKit.narrow_checks++;
                
                // Transform normal back to world space
                let nx, ny;
                if (dist > 0) {
                    const localNx = distX / dist;
                    const localNy = distY / dist;
                    const cosBack = Math.cos(obb.angle);
                    const sinBack = Math.sin(obb.angle);
                    nx = localNx * cosBack - localNy * sinBack;
                    ny = localNx * sinBack + localNy * cosBack;
                } else {
                    // Circle centre inside the box: out through the nearest face, the whole way
                    const cosBack = Math.cos(obb.angle);
                    const sinBack = Math.sin(obb.angle);
                    const ex = hw - Math.abs(localX), ey = hh - Math.abs(localY);
                    const lnx = ex < ey ? Math.sign(localX) || 1 : 0, lny = ex < ey ? 0 : Math.sign(localY) || 1;
                    nx = lnx * cosBack - lny * sinBack;
                    ny = lnx * sinBack + lny * cosBack;
                    return { nx, ny, depth: Math.min(ex, ey) + circle.radius };
                }
                
                return { nx, ny, depth: circle.radius - dist };
            },

            /** Do two GameEntity shapes (CIRCLE, AABB, OBB) overlap? */
            overlaps (a, b) {
                // Quick AABB early-out before expensive shape checks
                const aBox = a.getBoundingBox();
                const bBox = b.getBoundingBox();
                if (aBox.x + aBox.w < bBox.x || bBox.x + bBox.w < aBox.x ||
                    aBox.y + aBox.h < bBox.y || bBox.y + bBox.h < aBox.y) {
                    return false;
                }

                const shapeA = a.collisionShape;
                const shapeB = b.collisionShape;
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.CIRCLE) {
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    return dist < a.radius + b.radius;
                }
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.AABB) {
                    return shapeKit.circleVsRect(a, b) !== null;
                }
                if (shapeA === GameEntity.SHAPE.AABB && shapeB === GameEntity.SHAPE.CIRCLE) {
                    return shapeKit.circleVsRect(b, a) !== null;
                }
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.OBB) {
                    return shapeKit.circleVsObb(a, b) !== null;
                }
                if (shapeA === GameEntity.SHAPE.OBB && shapeB === GameEntity.SHAPE.CIRCLE) {
                    return shapeKit.circleVsObb(b, a) !== null;
                }
                
                // Treat everything else as OBB
                const obbA = a.getOBB ? a.getOBB() : shapeKit.entityToObb(a);
                const obbB = b.getOBB ? b.getOBB() : shapeKit.entityToObb(b);
                return shapeKit.sat(obbA, obbB) !== null;
            }
        };
