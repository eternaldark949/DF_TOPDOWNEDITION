// GL engine: the vector pen. The GPU path builder that the people, their clothes, hair, held things
// and weapons are drawn with (gl/people/). Paths are flattened, triangulated (earcut) and written
// straight into a GLBuildingBuilder vertex buffer: a fill's gradient is coloured per vertex (cut
// into bands at a linear gradient's stops, finely subdivided under a radial one), a clip is a
// polygon intersection, a stroke is the builder's antialiased line, and 'lighter' is the builder's
// additive flag. Nothing is rasterised on the CPU. A whole body, everything it wears and holds,
// is one buffer and one draw.
const GLPen = (() => {
    const TAU = Math.PI * 2;
    /** A path in its own (user) coordinates: commands, flattened on use under the matrix it's drawn with */
    class Path {
        constructor() { this.cmds = []; }
        moveTo(x, y) { this.cmds.push(['M', x, y]); return this; }
        lineTo(x, y) { this.cmds.push(['L', x, y]); return this; }
        quadraticCurveTo(cx, cy, x, y) { this.cmds.push(['Q', cx, cy, x, y]); return this; }
        bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { this.cmds.push(['C', c1x, c1y, c2x, c2y, x, y]); return this; }
        arc(x, y, r, a0, a1, ccw = false) { this.cmds.push(['A', x, y, r, r, 0, a0, a1, !!ccw]); return this; }
        ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) { this.cmds.push(['A', x, y, rx, ry, rot, a0, a1, !!ccw]); return this; }
        rect(x, y, w, h) { this.cmds.push(['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']); return this; }
        roundRect(x, y, w, h, radii = 0) {
            if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
            let r = typeof radii === 'number' ? [radii, radii, radii, radii] : radii.length === 1 ? [radii[0], radii[0], radii[0], radii[0]] : radii.length === 2 ? [radii[0], radii[1], radii[0], radii[1]] : radii.length === 3 ? [radii[0], radii[1], radii[2], radii[1]] : radii;
            r = r.map(v => Math.max(0, +v || 0));
            const s = Math.min(1, w / (r[0] + r[1] || 1), h / (r[1] + r[2] || 1), w / (r[2] + r[3] || 1), h / (r[3] + r[0] || 1)); r = r.map(v => v * s);
            this.moveTo(x + r[0], y); this.lineTo(x + w - r[1], y); if (r[1]) this.arc(x + w - r[1], y + r[1], r[1], -Math.PI / 2, 0);
            this.lineTo(x + w, y + h - r[2]); if (r[2]) this.arc(x + w - r[2], y + h - r[2], r[2], 0, Math.PI / 2);
            this.lineTo(x + r[3], y + h); if (r[3]) this.arc(x + r[3], y + h - r[3], r[3], Math.PI / 2, Math.PI);
            this.lineTo(x, y + r[0]); if (r[0]) this.arc(x + r[0], y + r[0], r[0], Math.PI, Math.PI * 1.5);
            return this.closePath();
        }
        closePath() { this.cmds.push(['Z']); return this; }
        addPath(p) { for (const c of p.cmds) this.cmds.push(c); return this; }
        /** Flattened subpaths under matrix m (scale k: device px per unit, for curve detail): [{pts: [[x, y]...], closed}] */
        flatten(m, k) {
            const out = []; let cur = null, sx = 0, sy = 0, px = 0, py = 0, reopen = false;
            const T = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
            const start = (x, y) => { cur = { pts: [T(x, y)], closed: false }; out.push(cur); sx = px = x; sy = py = y; };
            const to = (x, y) => { if (!cur) { if (reopen) { start(sx, sy); reopen = false; cur.pts.push(T(x, y)); px = x; py = y; } else start(x, y); } else { cur.pts.push(T(x, y)); px = x; py = y; } };
            const segs = len => Math.max(2, Math.min(48, Math.ceil(len * k / 2.5)));
            for (const c of this.cmds) {
                switch (c[0]) {
                    case 'M': reopen = false; start(c[1], c[2]); break;
                    case 'L': to(c[1], c[2]); break;
                    case 'Q': { if (!cur) { if (reopen) { start(sx, sy); reopen = false; } else start(c[1], c[2]); } const x0 = px, y0 = py, n = segs(Math.hypot(c[1] - x0, c[2] - y0) + Math.hypot(c[3] - c[1], c[4] - c[2]));
                        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; to(u * u * x0 + 2 * u * t * c[1] + t * t * c[3], u * u * y0 + 2 * u * t * c[2] + t * t * c[4]); } break; }
                    case 'C': { if (!cur) { if (reopen) { start(sx, sy); reopen = false; } else start(c[1], c[2]); } const x0 = px, y0 = py, n = segs(Math.hypot(c[1] - x0, c[2] - y0) + Math.hypot(c[3] - c[1], c[4] - c[2]) + Math.hypot(c[5] - c[3], c[6] - c[4]));
                        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; to(u * u * u * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]); } break; }
                    case 'A': {
                        const [, x, y, rx, ry, rot, a0, a1, ccw] = c;
                        let d = a1 - a0;
                        if (!ccw && d >= TAU || ccw && -d >= TAU) d = ccw ? -TAU : TAU;
                        else { if (!ccw) { d %= TAU; if (d < 0) d += TAU; } else { d %= TAU; if (d > 0) d -= TAU; } if (d === 0 && a1 !== a0) d = ccw ? -TAU : TAU; }
                        const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(d) * Math.max(rx, ry) * k / 2.5))), cr = Math.cos(rot), sr = Math.sin(rot);
                        const at = a => { const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry; return [x + ex * cr - ey * sr, y + ex * sr + ey * cr]; };
                        const p0 = at(a0);
                        if (!cur && !reopen) start(p0[0], p0[1]); else to(p0[0], p0[1]);
                        for (let i = 1; i <= n; i++) { const p = at(a0 + d * i / n); to(p[0], p[1]); }
                        break;
                    }
                    case 'P': { const q = c[1], mm = q._m, M = [m[0] * mm[0] + m[2] * mm[1], m[1] * mm[0] + m[3] * mm[1], m[0] * mm[2] + m[2] * mm[3], m[1] * mm[2] + m[3] * mm[3], m[0] * mm[4] + m[2] * mm[5] + m[4], m[1] * mm[4] + m[3] * mm[5] + m[5]]; for (const s2 of q.flatten(M, k)) out.push(s2); cur = null; break; }
                    case 'Z': if (cur) { cur.closed = true; px = sx; py = sy; cur = null; reopen = true; } break;
                }
            }
            return out;
        }
    }

    /** Canvas gradients: colour at a point (straight rgba, 0..1), Canvas's premultiplied interpolation between stops */
    class Gradient {
        constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
        addColorStop(t, c) { this.stops.push([t, GLColor.parse(c)]); this.stops.sort((a, b) => a[0] - b[0]); }
        at(t) {
            const s = this.stops; if (!s.length) return [0, 0, 0, 0];
            if (t <= s[0][0]) return s[0][1]; if (t >= s[s.length - 1][0]) return s[s.length - 1][1];
            for (let i = 1; i < s.length; i++) if (t <= s[i][0]) {
                const [t0, a] = s[i - 1], [t1, b] = s[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 0, al = a[3] + (b[3] - a[3]) * f;
                return al > 0 ? [(a[0] * a[3] + (b[0] * b[3] - a[0] * a[3]) * f) / al, (a[1] * a[3] + (b[1] * b[3] - a[1] * a[3]) * f) / al, (a[2] * a[3] + (b[2] * b[3] - a[2] * a[3]) * f) / al, al] : [0, 0, 0, 0];
            }
            return s[s.length - 1][1];
        }
        /** Bound to the matrix of the fill: t at a builder-space point */
        bind(m) {
            const det = m[0] * m[3] - m[1] * m[2] || 1e-9, inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
            const user = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
            if (this.kind === 'linear') {
                const [x0, y0, x1, y1] = this.args, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
                return { linear: true, t: (X, Y) => { const [x, y] = user(X, Y); return ((x - x0) * dx + (y - y0) * dy) / L2; },
                         // the cut lines at the stops, in builder space: a point where t = s, and the gradient direction
                         line: s => { const ux = x0 + dx * s, uy = y0 + dy * s, P = [m[0] * ux + m[2] * uy + m[4], m[1] * ux + m[3] * uy + m[5]], D = [m[0] * dx + m[2] * dy, m[1] * dx + m[3] * dy];
                                      // the normal of the cut in builder space is inv^T * (dx, dy)
                                      const nx = inv[0] * dx + inv[1] * dy, ny = inv[2] * dx + inv[3] * dy; void D; return [nx, ny, nx * P[0] + ny * P[1]]; } };
            }
            const [x0, y0, r0, x1, y1, r1] = this.args;
            return { linear: false, t: (X, Y) => {
                const [x, y] = user(X, Y), cdx = x1 - x0, cdy = y1 - y0, dr = r1 - r0, px = x - x0, py = y - y0;
                const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
                if (Math.abs(a) < 1e-9) { const t = c / (2 * b); return r0 + t * dr >= 0 ? t : NaN; }
                const d = b * b - a * c; if (d < 0) return NaN;
                const q = Math.sqrt(d), hi = (b + q) / a, lo = (b - q) / a;
                return r0 + Math.max(hi, lo) * dr >= 0 ? Math.max(hi, lo) : r0 + Math.min(hi, lo) * dr >= 0 ? Math.min(hi, lo) : NaN;
            } };
        }
    }

    // ---- polygon tools (builder space; vertices [x, y]) ----
    function clipHalf(poly, nx, ny, d) {
        const out = [], n = poly.length;
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n], da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
            if (da >= 0) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const f = da / (da - db); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
        }
        return out;
    }
    function clipConvex(poly, clip) {
        let area = 0; for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
        const s = area > 0 ? 1 : -1;
        for (let i = 0; i < clip.length && poly.length >= 3; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], nx = -(b[1] - a[1]) * s, ny = (b[0] - a[0]) * s;
            if (nx === 0 && ny === 0) continue;
            poly = clipHalf(poly, nx, ny, nx * a[0] + ny * a[1]);
        }
        return poly;
    }
    const area2 = p => { let a = 0; for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u[0] * v[1] - v[0] * u[1]; } return a; };
    const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    /** Triangles of the subpaths: each on its own (nonzero, as the bodies are drawn); even-odd cuts a subpath inside another as its hole */
    function triangulate(subs, evenodd) {
        const polys = subs.map(s => s.pts).filter(p => p.length >= 3 && Math.abs(area2(p)) > 1e-6), tris = [];
        const holeOf = new Map();
        if (evenodd) polys.forEach((p, i) => { for (let j = 0; j < polys.length; j++) if (j !== i && !holeOf.has(j) && Math.abs(area2(polys[j])) > Math.abs(area2(p)) && inside(p[0], polys[j]) && inside(p[(p.length / 2) | 0], polys[j])) { holeOf.set(i, j); break; } });
        polys.forEach((p, i) => {
            if (holeOf.has(i)) return;
            const flat = [], holes = [];
            for (const q of p) flat.push(q[0], q[1]);
            polys.forEach((h, j) => { if (holeOf.get(j) === i) { holes.push(flat.length / 2); for (const q of h) flat.push(q[0], q[1]); } });
            const idx = PIXI.utils.earcut(flat, holes.length ? holes : null);
            for (let k = 0; k < idx.length; k += 3) tris.push([[flat[idx[k] * 2], flat[idx[k] * 2 + 1]], [flat[idx[k + 1] * 2], flat[idx[k + 1] * 2 + 1]], [flat[idx[k + 2] * 2], flat[idx[k + 2] * 2 + 1]]]);
        });
        return tris;
    }
    /** Split a convex polygon into pieces no longer than maxLen along any edge (for radial gradients) */
    function subdivide(poly, maxLen, out) {
        const tris = []; for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
        const split = (t, depth) => {
            const [a, b, c] = t, ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]), L = Math.max(ab, bc, ca);
            if (L <= maxLen || depth > 6) { out.push(t); return; }
            const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            if (L === ab) { const m = mid(a, b); split([a, m, c], depth + 1); split([m, b, c], depth + 1); }
            else if (L === bc) { const m = mid(b, c); split([a, b, m], depth + 1); split([a, m, c], depth + 1); }
            else { const m = mid(c, a); split([a, b, m], depth + 1); split([m, b, c], depth + 1); }
        };
        for (const t of tris) split(t, 0);
    }

    class Pen {
        /** B: the builder; k: device pixels per builder unit (curve and gradient detail) */
        constructor(B, k = 1) {
            this.B = B; this.k = k; this.m = [1, 0, 0, 1, 0, 0]; this.stack = []; this.path = new Path(); this.clipPieces = null;
            this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
            this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.shadowBlur = 0; this.shadowColor = 'transparent';
            this.shadowOffsetX = 0; this.shadowOffsetY = 0; this.dash = []; this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
            this.filter = 'none'; this.imageSmoothingEnabled = true; this.isGLPen = true;
        }
        // ---- state ----
        save() { this.stack.push([this.m.slice(), this.clipPieces, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.globalCompositeOperation, this.shadowBlur, this.shadowColor, this.dash, this.font, this.textAlign, this.textBaseline, this.filter, this.shadowOffsetX, this.shadowOffsetY]); }
        restore() {
            const s = this.stack.pop(); if (!s) return;
            [this.m, this.clipPieces, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.globalCompositeOperation, this.shadowBlur, this.shadowColor, this.dash, this.font, this.textAlign, this.textBaseline, this.filter, this.shadowOffsetX, this.shadowOffsetY] = s;
        }
        transform(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
        translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
        rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
        scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
        setTransform(a, b, c, d, e, f) { if (typeof a === 'object') ({ a, b, c, d, e, f } = a); this.m = [a, b, c, d, e, f]; }
        resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
        /** The full transform, as the context the pen stands in for would report it (hair and cloth simulate in world space) */
        getTransform() { const m = this.m, L = new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]); return this.base ? this.base.multiply(L) : L; }
        setLineDash(d) { this.dash = d && d.length ? d.slice() : []; }
        getLineDash() { return this.dash.slice(); }
        get scaleK() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1e-6; }
        // ---- the current path ----
        beginPath() { this.path = new Path(); }
        // The current path is kept in builder space: each command is mapped through the matrix of its moment (as Canvas does);
        // arcs and ellipses are flattened as they're added, since a turned or squashed arc is no longer one
        _T(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
        moveTo(x, y) { const p = this._T(x, y); this.path.moveTo(p[0], p[1]); }
        lineTo(x, y) { const p = this._T(x, y); this.path.lineTo(p[0], p[1]); }
        quadraticCurveTo(a, b, x, y) { const c = this._T(a, b), p = this._T(x, y); this.path.quadraticCurveTo(c[0], c[1], p[0], p[1]); }
        bezierCurveTo(a, b, c, d, x, y) { const c1 = this._T(a, b), c2 = this._T(c, d), p = this._T(x, y); this.path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]); }
        arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
        ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
            const tmp = new Path().ellipse(x, y, rx, ry, rot, a0, a1, ccw), subs = tmp.flatten(this.m, this.k * this.scaleK);
            const pts = subs[0]?.pts || []; if (!pts.length) return;
            const hasCur = this.path.cmds.length && this.path.cmds[this.path.cmds.length - 1][0] !== 'Z';
            pts.forEach((p, i) => i === 0 && !hasCur ? this.path.moveTo(p[0], p[1]) : this.path.lineTo(p[0], p[1]));
        }
        rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
        roundRect(x, y, w, h, r) { const tmp = new Path().roundRect(x, y, w, h, r); for (const s of tmp.flatten(this.m, this.k * this.scaleK)) { s.pts.forEach((p, i) => i ? this.path.lineTo(p[0], p[1]) : this.path.moveTo(p[0], p[1])); this.path.closePath(); } }
        closePath() { this.path.closePath(); }
        _subs(path) { return path ? path.flatten(this.m, this.k * this.scaleK) : this.path.flatten([1, 0, 0, 1, 0, 0], this.k); }
        createLinearGradient(x0, y0, x1, y1) { return new Gradient('linear', [x0, y0, x1, y1]); }
        createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient('radial', [x0, y0, r0, x1, y1, r1]); }
        createPattern() { return null; }
        // ---- painting ----
        _alpha() { return this.globalAlpha; }
        _paint(style, fn) {
            const B = this.B, add = this.globalCompositeOperation === 'lighter';
            B.additive(add);
            try { fn(); } finally { B.additive(false); }
        }
        /** Triangles (builder space) emitted with style, clipped to the clip region */
        _emitTris(tris, style, alphaK = 1) {
            const B = this.B, a = this._alpha() * alphaK;
            if (a <= 0) return;
            let pieces = [];
            if (this.clipPieces) { for (const t of tris) for (const c of this.clipPieces) { const p = clipConvex(t, c); if (p.length >= 3) pieces.push(p); } }
            else pieces = tris;
            if (style instanceof Gradient) {
                const G = style.bind(this.m);
                if (G.linear) {
                    const cuts = style.stops.map(s => G.line(s[0]));
                    for (let p of pieces) {
                        // band the convex piece at every stop line, then colour each vertex exactly
                        const bands = [p];
                        for (const [nx, ny, d] of cuts) { const next = []; for (const q of bands) { const A = clipHalf(q, nx, ny, d), C = clipHalf(q, -nx, -ny, -d); if (A.length >= 3) next.push(A); if (C.length >= 3) next.push(C); } bands.length = 0; bands.push(...next); }
                        for (const q of bands) this._poly(q, v => style.at(G.t(v[0], v[1])), a);
                    }
                } else {
                    // pieces small against the gradient's radius (the colour is linear across each piece)
                    const rr = Math.max(style.args[2], style.args[5]) * this.scaleK, maxLen = Math.max(2.5 / (this.k || 1), rr / 7);
                    for (const p of pieces) { const tris2 = []; subdivide(p, maxLen, tris2); for (const t of tris2) this._poly(t, v => { const t2 = G.t(v[0], v[1]); return t2 !== t2 ? [0, 0, 0, 0] : style.at(t2); }, a); }
                }
            } else {
                const c = GLColor.parse(style == null ? '#000' : style);
                for (const p of pieces) this._poly(p, () => c, a);
            }
        }
        _poly(p, colorOf, a) {
            const B = this.B, base = B.n;
            for (const v of p) { const c = colorOf(v); B.vertex([v[0], v[1], 0, 0], undefined, undefined, 0, 0, 0, [c[0], c[1], c[2], c[3] * a]); }
            for (let i = 1; i + 1 < p.length; i++) B.index.push(base, base + i, base + i + 1);
        }
        fill(a, b) {
            const path = a instanceof Path ? a : a && a._gl ? a._gl : null, rule = typeof a === 'string' ? a : b;
            const subs = this._subs(path);
            this._paint(this.fillStyle, () => {
                const tris = triangulate(subs, rule === 'evenodd');
                if (this.shadowBlur > 0 && GLColor.parse(this.shadowColor)[3] > 0) this._shadow(subs, tris);
                this._emitTris(tris, this.fillStyle);
            });
        }
        /** Canvas's shadowBlur under a fill: the shape in the shadow colour, and its edge blurred out by the soft stroke */
        _shadow(subs, tris) {
            const B = this.B, c = GLColor.parse(this.shadowColor), blur = this.shadowBlur, a = this._alpha();
            const fs = this.fillStyle, fc = fs instanceof Gradient ? fs.stops[0]?.[1] || [1, 1, 1, 1] : GLColor.parse(fs);
            const col = [c[0], c[1], c[2], c[3] * a * fc[3]];
            for (const s of subs) if (s.pts.length >= 2) B.softLine(s.pts.map(p => [p[0] + this.shadowOffsetX, p[1] + this.shadowOffsetY, 0, 0]), .01, blur, s.closed || true, 0, col);
            void tris;
        }
        stroke(path) {
            const subs = this._subs(path instanceof Path ? path : path && path._gl ? path._gl : null), w = this.lineWidth * this.scaleK, B = this.B;
            if (!(w > 0)) return;
            this._paint(this.strokeStyle, () => {
                const st = this.strokeStyle, a = this._alpha();
                let c = st instanceof Gradient ? st.at(.5) : GLColor.parse(st == null ? '#000' : st);
                c = [c[0], c[1], c[2], c[3] * a];
                if (c[3] <= 0) return;
                for (const s of subs) {
                    let runs = [s.pts.map(p => [p[0], p[1], 0, 0])], closed = s.closed;
                    if (this.dash.length) { runs = this._dashed(runs[0], closed); closed = false; }
                    for (const pts of runs) {
                        if (pts.length < 2) continue;
                        if (this.clipPieces) { this._clippedStroke(pts, closed, w, c); continue; }
                        if (this.shadowBlur > 0 && GLColor.parse(this.shadowColor)[3] > 0) { const sc = GLColor.parse(this.shadowColor); B.softLine(pts, w, this.shadowBlur / (this.k || 1), closed, 0, [sc[0], sc[1], sc[2], sc[3] * a]); }
                        B._c = c; B.line(pts, w, closed, this.lineCap === 'square' ? GLB_LINE.SQUARE : 0);
                        if (this.lineCap === 'round' && !closed) for (const e of [pts[0], pts[pts.length - 1]]) this._disc(e[0], e[1], w / 2, c);
                        if (this.lineJoin === 'round' && pts.length > 2 && w > 1.5) for (let i = 1; i < pts.length - 1; i++) this._disc(pts[i][0], pts[i][1], w / 2, c);
                    }
                }
            });
        }
        /** A stroke under a clip: its outline as polygons, clipped like a fill */
        _clippedStroke(pts, closed, w, c) {
            const tris = [], hw = w / 2, n = pts.length, segs = closed ? n : n - 1;
            for (let i = 0; i < segs; i++) {
                const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L * hw, ny = dx / L * hw;
                tris.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
            }
            const saved = this.globalAlpha; this.globalAlpha = 1;
            this._emitTris(tris, `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})`);
            this.globalAlpha = saved;
        }
        _dashed(pts, closed) {
            const d = this.dash.map(v => v * this.scaleK), total = d.reduce((s, v) => s + v, 0);
            if (!(total > 0)) return [pts];
            const all = closed ? pts.concat([pts[0]]) : pts, out = [];
            let i = 0, rem = d[0], on = true, cur = [all[0]];
            for (let k = 1; k < all.length; k++) {
                let a = all[k - 1]; const b = all[k];
                let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
                while (L > rem) {
                    const f = rem / L, p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0, 0];
                    if (on) { cur.push(p); out.push(cur); } cur = [p];
                    L -= rem; a = p; on = !on; i = (i + 1) % d.length; rem = d[i];
                }
                rem -= L; if (on) cur.push(b); else cur = [b];
            }
            if (on && cur.length > 1) out.push(cur);
            return out;
        }
        _disc(x, y, r, c) {
            const B = this.B, n = Math.max(8, Math.min(24, Math.ceil(r * this.k * 2))), base = B.n;
            B.vertex([x, y, 0, 0], undefined, undefined, 0, 0, 0, c);
            for (let i = 0; i < n; i++) B.vertex([x + Math.cos(i / n * TAU) * r, y + Math.sin(i / n * TAU) * r, 0, 0], undefined, undefined, 0, 0, 0, c);
            for (let i = 0; i < n; i++) B.index.push(base, base + 1 + i, base + 1 + (i + 1) % n);
        }
        clip(a, b) {
            const path = a instanceof Path ? a : a && a._gl ? a._gl : null, rule = typeof a === 'string' ? a : b;
            const tris = triangulate(this._subs(path), rule === 'evenodd');
            if (!this.clipPieces) { this.clipPieces = tris; return; }
            const next = []; for (const t of tris) for (const c of this.clipPieces) { const p = clipConvex(t, c); if (p.length >= 3) next.push(p); }
            this.clipPieces = next;
        }
        fillRect(x, y, w, h) { const p = new Path().rect(x, y, w, h); this.fill(p); }
        strokeRect(x, y, w, h) { const p = new Path().rect(x, y, w, h); this.stroke(p); }
        clearRect() { }
        /** Images the game paints procedurally (a radial sprite: glowSprite, the contact shadow) are drawn as what they are, a
            radial gradient over the image's square; anything else is counted (gl/people.js lists what still bakes) */
        drawImage(img, ...a) {
            if (img && img._glPaint) {                                   // a baked image that can repaint itself: paint it here, in its pixel frame
                let x, y, w, h;
                if (a.length === 2) [x, y, w, h] = [a[0], a[1], img.width, img.height]; else if (a.length === 4) [x, y, w, h] = a;
                else { const [sx, sy, sw, sh, dx, dy, dw, dh] = a, kx = dw / sw, ky = dh / sh; x = dx - sx * kx; y = dy - sy * ky; w = img.width * kx; h = img.height * ky; }
                this.save(); this.translate(x, y); this.scale(w / img.width, h / img.height); this.lineJoin = 'miter'; this.lineCap = 'butt'; this.globalCompositeOperation = this.globalCompositeOperation;
                try { img._glPaint(this); } finally { this.restore(); }
                return;
            }
            const R = img && img._glRadial;
            if (!R) { Pen.stats.images++; (Pen.stats.kinds || (Pen.stats.kinds = {}))[img && img._glKind || (img && img.width + 'x' + img.height)] = 1; return; }
            let x, y, w, h;
            if (a.length === 2) [x, y, w, h] = [a[0], a[1], img.width, img.height];
            else if (a.length === 4) [x, y, w, h] = a;
            else { const [sx, sy, sw, sh, dx, dy, dw, dh] = a, kx = dw / sw, ky = dh / sh; x = dx - sx * kx; y = dy - sy * ky; w = img.width * kx; h = img.height * ky; }
            if (!R.grad) { R.grad = new Gradient('radial', [0, 0, 0, 0, 0, 1]); for (const [t, c] of R) R.grad.addColorStop(t, c); }
            this.save(); this.translate(x + w / 2, y + h / 2); this.scale(w / 2, h / 2);
            const fs = this.fillStyle; this.fillStyle = R.grad; this.fill(new Path().arc(0, 0, 1, 0, TAU)); this.fillStyle = fs;
            this.restore();
        }
        fillText() { Pen.stats.text++; } strokeText() { Pen.stats.text++; }
        measureText(t) { return { width: String(t).length * parseFloat(this.font) * .55 }; }
        isPointInPath() { return false; }
        /** drawGlow (core/draw-helpers.js) as geometry: a radial fan, 1 at the centre, through 0.45 at core (0: linear), to 0 at r */
        glow(x, y, r, color, core = .35) {
            const c = GLColor.parse(typeof color === 'string' && color[0] !== '#' && !/^rgb|^hsl/.test(color) ? `rgb(${color})` : color), a = this._alpha();
            if (a <= 0) return;
            const ts = core > 0 ? [0, core * .5, core, core + (1 - core) * .5, 1] : [0, .5, 1], f = t => core > 0 ? (t <= core ? 1 - .55 * t / core : .45 * (1 - (t - core) / (1 - core))) : 1 - t;
            const m = this.m, T = (px, py) => [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]], segs = 20, B = this.B, base = B.n;
            this._paint(null, () => {
                const ctr = T(x, y); B.vertex([ctr[0], ctr[1], 0, 0], undefined, undefined, 0, 0, 0, [c[0], c[1], c[2], c[3] * a]);
                for (let i = 1; i < ts.length; i++) for (let j = 0; j < segs; j++) { const an = j / segs * TAU, p = T(x + Math.cos(an) * r * ts[i], y + Math.sin(an) * r * ts[i]); B.vertex([p[0], p[1], 0, 0], undefined, undefined, 0, 0, 0, [c[0], c[1], c[2], c[3] * a * f(ts[i])]); }
                for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
                for (let i = 1; i + 1 < ts.length; i++) for (let j = 0; j < segs; j++) { const p = base + 1 + (i - 1) * segs + j, q = base + 1 + (i - 1) * segs + (j + 1) % segs; B.index.push(p, p + segs, q + segs, p, q + segs, q); }
            });
        }
    }
    Pen.Path = Path; Pen.Gradient = Gradient; Pen.stats = { images: 0, text: 0 };
    return Pen;
})();
const GLPath = GLPen.Path;

// Path2D, recording: the game builds its bodies' outlines as Path2D (ui/bodies.js). A browser Path2D
// can't be read back, so in the GL build every Path2D also keeps its commands as a GLPath: Canvas
// still fills it as before, and the pen fills its recording.
(() => {
    if (typeof Path2D === 'undefined' || Path2D.prototype._glRec) return;
    const Native = Path2D;
    class RecordingPath2D extends Native {
        constructor(src) { super(src); this._gl = new GLPath(); if (src && src._gl) this._gl.addPath(src._gl); }
    }
    for (const k of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'rect', 'roundRect', 'closePath']) {
        const native = Native.prototype[k];
        if (!native) continue;
        RecordingPath2D.prototype[k] = function (...a) { native.apply(this, a); this._gl[k](...a); };
    }
    const addPath = Native.prototype.addPath;
    RecordingPath2D.prototype.addPath = function (p, m) { addPath.call(this, p, m); if (p && p._gl) { if (m) { const q = new GLPath(); q.cmds = p._gl.cmds; q._m = [m.a, m.b, m.c, m.d, m.e, m.f]; this._gl.cmds.push(['P', q]); } else this._gl.addPath(p._gl); } };
    RecordingPath2D.prototype._glRec = true;
    window.Path2D = RecordingPath2D;
})();
