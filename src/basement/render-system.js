        // ===== LV0 BASEMENT =====
        // The render system: a queue of shapes that sorts itself by depth and draws in as few canvas calls as it
        // can. Canvas 2D pays per call, so shapes that share a style (fill colour, or stroke colour and width;
        // alpha, blend, clip) are drawn together: one beginPath, every shape's outline, one fill() or stroke().
        // It knows nothing about any game.
        //
        //   const q = new renderQueue();
        //   q.begin();                                         // every frame (keeps its items' arrays: no garbage)
        //   q.poly(z, '#32293f', [x0, y0, x1, y1, x2, y2]);    // a filled shape through the points
        //   q.line(z, 2, '#9b9b5c', [x0, y0, x1, y1]);          // a stroked line through the points
        //   q.ellipse(z, x, y, rx, ry, rot, '#957653', 1);      // a ring (width 1); width 0 fills it
        //   q.image(z, sprite, x, y, w, h);                     // a sprite, drawn in its place in the order
        //   q.custom(z, () => { ... });                         // anything else: drawn as given, never moved past
        //   q.flush(ctx);                                       // sorted by z (lowest first), batched, drawn
        //
        // Each shape may take a STATE { alpha, op, cap, clip }: alpha 0..1, op the blend, cap the line ends, clip a
        // list of polygons ([[x, y], ...]) the shape is drawn outside of. Shapes with the same style and state are
        // one batch.
        //
        // WHY IT LOOKS THE SAME: after the depth sort, a shape joins an earlier batch only when nothing drawn
        // between them overlaps it, and only when it overlaps no shape already in that batch. So nothing that was
        // drawn over it, or under it, changes, and shapes in one path never cross (no winding holes, no doubled
        // alpha). Overlap is exact for small convex polygons (a separating-axis test: faces that only share an
        // edge don't count, so a faceted post's faces can batch; the shared edge is then drawn once, without the
        // faint seam two fills leave) and by bounding box, a pixel to spare, for everything else.
        // A shape's clip keeps only the polygons that reach its box (the rest can't change a pixel of it), so a face no
        // roof leans over is unclipped and batches with the rest. `batch: false, trim: false` draws every shape on
        // its own with its whole clip, in the same order: the reference the pixel check compares against.
        class renderQueue {
            constructor(opts = {}) {
                this.sort = opts.sort !== false;      // sort by z (stable)
                this.batch = opts.batch !== false;    // merge same-style shapes
                this.trim = opts.trim !== false;      // drop clip polygons that miss the shape (false: every shape takes its whole clip, the reference)
                this.lookback = opts.lookback || 64;  // how many batches back a shape may look for its own
                this.items = []; this.n = 0;
                this.stats = { shapes: 0, batches: 0 };
                this._clipIds = new WeakMap(); this._clipN = 0;
                this._batches = []; this._order = [];
            }

            begin() { this.n = 0; }
            get length() { return this.n; }

            _item(z, kind, state) {
                let it = this.items[this.n];
                if (!it) it = this.items[this.n] = { pts: [] };
                it.seq = this.n++; it.z = z; it.kind = kind;
                it.alpha = state && state.alpha !== undefined ? state.alpha : 1;
                it.op = (state && state.op) || 'source-over';
                it.cap = (state && state.cap) || 'butt';
                it.clip = it.clipAll = (state && state.clip && state.clip.length) ? state.clip : null;
                it.pts.length = 0; it.paint = null; it.img = null; it.width = 0; it.color = null; it.closed = false; it.convex = false;
                return it;
            }
            /** Keep only the clip polygons that reach the shape (a polygon clear of its box can't change a pixel of it),
             *  and name what's left: '' (no clip), or the kept polygons' ids. Shapes clipped by the same polygons batch. */
            _clipKey(it) {
                const clip = it.clip; if (!clip) return '';
                let kept = null, key = '';
                for (let i = 0; i < clip.length; i++) {
                    const poly = clip[i]; let c = this._clipIds.get(poly);
                    if (!c) {
                        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                        for (const q of poly) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
                        this._clipIds.set(poly, c = { id: ++this._clipN, x0, y0, x1, y1 });
                    }
                    if (c.x0 >= it.x1 || c.x1 <= it.x0 || c.y0 >= it.y1 || c.y1 <= it.y0) { if (!kept) kept = clip.slice(0, i); continue; }
                    if (kept) kept.push(poly);
                    key += (key ? ',' : '') + c.id;
                }
                if (kept) it.clip = kept.length ? kept : null;
                return key;
            }
            _box(it, pad) {
                const p = it.pts; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (let i = 0; i < p.length; i += 2) { const x = p[i], y = p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
                it.x0 = x0 - pad; it.y0 = y0 - pad; it.x1 = x1 + pad; it.y1 = y1 + pad;
            }

            /** A filled polygon through flat points [x0, y0, x1, y1, ...]. */
            poly(z, color, pts, state) {
                const it = this._item(z, 'fill', state); it.color = color;
                for (let i = 0; i < pts.length; i++) it.pts.push(pts[i]);
                it.closed = true; this._box(it, 1);
                it.convex = renderQueue._isConvex(it.pts);
                it.key = 'f|' + color + '|' + it.alpha + '|' + it.op + '|' + this._clipKey(it);
                return it;
            }
            /** A stroked line through flat points (closed: back to the first). */
            line(z, width, color, pts, state, closed = false) {
                const it = this._item(z, 'stroke', state); it.color = color; it.width = width; it.closed = closed;
                for (let i = 0; i < pts.length; i++) it.pts.push(pts[i]);
                this._box(it, width / 2 + 1);
                it.key = 's|' + color + '|' + width + '|' + it.cap + '|' + it.alpha + '|' + it.op + '|' + this._clipKey(it);
                return it;
            }
            /** An ellipse: stroked at `width`, or filled when width is 0. */
            ellipse(z, x, y, rx, ry, rot, color, width, state) {
                const it = this._item(z, width ? 'oring' : 'oval', state); it.color = color; it.width = width;
                it.pts.push(x, y, rx, ry, rot);
                const r = Math.max(rx, ry) + (width ? width / 2 : 0) + 1;
                it.x0 = x - r; it.y0 = y - r; it.x1 = x + r; it.y1 = y + r;
                it.key = (width ? 's|' + color + '|' + width + '|' + it.cap : 'f|' + color) + '|' + it.alpha + '|' + it.op + '|' + this._clipKey(it);
                return it;
            }
            /** A sprite (an image or canvas) into a rect. Drawn on its own, but shapes may batch past it if they miss it. */
            image(z, img, x, y, w, h, state) {
                const it = this._item(z, 'image', state); it.img = img; it.pts.push(x, y, w, h);
                it.x0 = Math.min(x, x + w) - 1; it.y0 = Math.min(y, y + h) - 1; it.x1 = Math.max(x, x + w) + 1; it.y1 = Math.max(y, y + h) + 1;
                it.key = null; this._clipKey(it);
                return it;
            }
            /** Anything else: paint() is called in its place, with the state set. Nothing batches past it. */
            custom(z, paint, state) {
                const it = this._item(z, 'custom', state); it.paint = paint;
                it.x0 = -Infinity; it.y0 = -Infinity; it.x1 = Infinity; it.y1 = Infinity; it.key = null;
                return it;
            }

            static _hit(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }

            /** A small convex polygon (flat points, up to 12 corners, turning one way)? */
            static _isConvex(p) {
                const n = p.length / 2; if (n < 3 || n > 12) return false;
                let sign = 0;
                for (let i = 0; i < n; i++) {
                    const ax = p[2 * i], ay = p[2 * i + 1], bx = p[(2 * i + 2) % p.length], by = p[(2 * i + 3) % p.length];
                    const cx = p[(2 * i + 4) % p.length], cy = p[(2 * i + 5) % p.length];
                    const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
                    if (Math.abs(c) < 1e-9) continue;
                    if (!sign) sign = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sign) return false;
                }
                return true;
            }
            /** Do two shapes overlap? Two convex polygons: by separating axes, sharing an edge doesn't count (they
             *  must cross by more than a quarter pixel). Anything else: by box. */
            static _overlap(a, b) {
                if (!renderQueue._hit(a, b)) return false;
                if (!a.convex || !b.convex) return true;
                return !renderQueue._separated(a.pts, b.pts) && !renderQueue._separated(b.pts, a.pts);
            }
            static _separated(p, q) {
                const EPS = 0.25;
                for (let i = 0; i < p.length; i += 2) {
                    const j = (i + 2) % p.length, nx = p[j + 1] - p[i + 1], ny = p[i] - p[j];
                    const len = Math.hypot(nx, ny); if (len < 1e-9) continue;
                    let pmin = Infinity, pmax = -Infinity, qmin = Infinity, qmax = -Infinity;
                    for (let k = 0; k < p.length; k += 2) { const d = (p[k] * nx + p[k + 1] * ny) / len; if (d < pmin) pmin = d; if (d > pmax) pmax = d; }
                    for (let k = 0; k < q.length; k += 2) { const d = (q[k] * nx + q[k + 1] * ny) / len; if (d < qmin) qmin = d; if (d > qmax) qmax = d; }
                    if (pmax - EPS <= qmin || qmax - EPS <= pmin) return true;
                }
                return false;
            }
            /** Does this shape cross any shape in the batch? (its members, found through the batch's grid) */
            static _crossesBatch(b, it) {
                if (!renderQueue._hit(b, it)) return false;
                const S = renderQueue.CELL, g = b.grid;
                const cx0 = Math.floor(it.x0 / S), cx1 = Math.floor(it.x1 / S), cy0 = Math.floor(it.y0 / S), cy1 = Math.floor(it.y1 / S);
                if (!isFinite(cx0) || !isFinite(cx1) || !isFinite(cy0) || !isFinite(cy1) || (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 256) {
                    for (const m of b.items) if (renderQueue._overlap(m, it)) return true;
                    return false;
                }
                const stamp = ++renderQueue._stamp;
                for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
                    const cell = g.get(cx * 65536 + cy); if (!cell) continue;
                    for (const m of cell) { if (m._stamp === stamp) continue; m._stamp = stamp; if (renderQueue._overlap(m, it)) return true; }
                }
                for (const m of b.wide) if (m._stamp !== stamp && renderQueue._overlap(m, it)) return true;
                return false;
            }
            static _addToBatch(b, it) {
                b.items.push(it);
                if (it.x0 < b.x0) b.x0 = it.x0; if (it.y0 < b.y0) b.y0 = it.y0;
                if (it.x1 > b.x1) b.x1 = it.x1; if (it.y1 > b.y1) b.y1 = it.y1;
                const S = renderQueue.CELL;
                const cx0 = Math.floor(it.x0 / S), cx1 = Math.floor(it.x1 / S), cy0 = Math.floor(it.y0 / S), cy1 = Math.floor(it.y1 / S);
                if (!isFinite(cx0) || !isFinite(cx1) || !isFinite(cy0) || !isFinite(cy1) || (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 256) { b.wide.push(it); return; }
                for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
                    const k = cx * 65536 + cy; let cell = b.grid.get(k); if (!cell) b.grid.set(k, cell = []); cell.push(it);
                }
            }

            /** Sort, batch and draw onto ctx (in its current transform), then empty the queue. */
            flush(ctx) {
                const n = this.n; if (!n) return;
                const order = this._order; order.length = 0;
                for (let i = 0; i < n; i++) order.push(this.items[i]);
                if (this.sort) order.sort((a, b) => (a.z - b.z) || (a.seq - b.seq));
                // Batches: { key, items, x0, y0, x1, y1 (a union box, for a quick miss), grid (members by cell), wide }
                const B = this._batches; let nb = 0;
                for (const it of order) {
                    let target = null;
                    if (this.batch && it.key) {
                        for (let k = nb - 1, steps = 0; k >= 0 && steps < this.lookback; k--, steps++) {
                            const b = B[k], crosses = renderQueue._crossesBatch(b, it);
                            if (b.key === it.key && !crosses) { target = b; break; }
                            if (crosses) break;                            // drawn over something it can't pass
                        }
                    }
                    if (!target) {
                        target = B[nb]; if (!target) target = B[nb] = { items: [], grid: new Map(), wide: [] };
                        nb++; target.key = it.key; target.items.length = 0; target.grid.clear(); target.wide.length = 0;
                        target.x0 = it.x0; target.y0 = it.y0; target.x1 = it.x1; target.y1 = it.y1;
                    }
                    renderQueue._addToBatch(target, it);
                }
                this.stats.shapes = n; this.stats.batches = nb;
                ctx.save();
                try { for (let k = 0; k < nb; k++) this._draw(ctx, B[k].items); }
                finally { ctx.restore(); this.n = 0; for (let k = 0; k < nb; k++) { B[k].items.length = 0; B[k].grid.clear(); B[k].wide.length = 0; } order.length = 0; }
            }

            _draw(ctx, items) {
                const f = items[0];
                ctx.globalAlpha = f.alpha; ctx.globalCompositeOperation = f.op;
                if (f.kind === 'custom') { f.paint(); return; }
                if (f.kind === 'image') { const p = f.pts; this._clip(ctx, this.trim ? f.clip : f.clipAll, () => ctx.drawImage(f.img, p[0], p[1], p[2], p[3])); return; }
                const stroke = f.kind === 'stroke' || f.kind === 'oring';
                this._clip(ctx, this.trim ? f.clip : f.clipAll, () => {
                    if (stroke) { ctx.strokeStyle = f.color; ctx.lineWidth = f.width; ctx.lineCap = f.cap; } else ctx.fillStyle = f.color;
                    ctx.beginPath();
                    for (const it of items) {
                        const p = it.pts;
                        if (it.kind === 'oval' || it.kind === 'oring') {
                            ctx.moveTo(p[0] + p[2] * Math.cos(p[4]), p[1] + p[2] * Math.sin(p[4]));
                            ctx.ellipse(p[0], p[1], p[2], p[3], p[4], 0, Math.PI * 2);
                            continue;
                        }
                        ctx.moveTo(p[0], p[1]);
                        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
                        if (it.closed) ctx.closePath();
                    }
                    if (stroke) ctx.stroke(); else ctx.fill();
                });
            }

            /** Draw inside the clip: outside every polygon of it (each cut out of a huge rect, even-odd). */
            _clip(ctx, clip, paint) {
                if (!clip) { paint(); return; }
                ctx.save();
                try {
                    for (const poly of clip) {
                        ctx.beginPath(); ctx.rect(-1e7, -1e7, 2e7, 2e7);
                        poly.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
                        ctx.closePath(); ctx.clip('evenodd');
                    }
                    paint();
                } finally { ctx.restore(); }
            }
        }
        renderQueue.CELL = 48;     // world px per cell of a batch's member grid
        renderQueue._stamp = 0;
