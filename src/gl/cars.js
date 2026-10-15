// GL engine: cars. Every TrafficVehicle (traffic, her garage, Zib rides, the delivery van) is GPU
// geometry built once per look from the same painting Canvas bakes into its sprite
// (traffic/car-art.js _paintCar): the soft contact shadow, the tyres, the paint shaded round the
// body's curve, the wheel arches, the brand's hood, the greenhouse and roof, the lamp housings.
// Gradients are exact: each fill is cut into bands at its gradient's stops and coloured per
// vertex; Canvas's clip to the body is a polygon clip. Live on top, as Canvas draws them each
// frame: the steered front tyres, the body riding its springs, the light sliding over the paint,
// the lamps, the underglow, and after dark the lamps' glow.
const GLCars = (() => {
    const V = (x, y, c) => ({ x, y, c });
    const P = (x, y) => [x, y, 0, 0];
    const col = c => GLColor.parse(c);
    const lerpC = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    /** Canvas gradient colour at t (premultiplied interpolation, as Canvas) */
    const stopAt = (stops, t) => {
        t = Math.max(0, Math.min(1, t));
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
            const [t0, a] = stops[i - 1], [t1, b] = stops[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 0, al = a[3] + (b[3] - a[3]) * f;
            return al > 0 ? [0, 1, 2].map(k => (a[k] * a[3] + (b[k] * b[3] - a[k] * a[3]) * f) / al).concat(al) : [0, 0, 0, 0];
        }
        return stops[stops.length - 1][1];
    };
    const parseStops = stops => stops.map(([t, c]) => [t, col(c)]);

    // ---- polygons: [{x, y, c}], clipped and banded, then triangulated into the builder ----
    /** Keep the part of poly where nx * x + ny * y >= d (colours interpolated along cut edges) */
    function clipHalf(poly, nx, ny, d) {
        const out = [], n = poly.length;
        for (let i = 0; i < n; i++) {
            const a = poly[i], b = poly[(i + 1) % n], da = nx * a.x + ny * a.y - d, db = nx * b.x + ny * b.y - d;
            if (da >= 0) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const f = da / (da - db); out.push(V(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.c && b.c ? lerpC(a.c, b.c, f) : a.c)); }
        }
        return out;
    }
    /** Clip to a convex polygon ([[x, y], ...], either winding) */
    function clipConvex(poly, clip) {
        let area = 0; for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
        const s = area > 0 ? 1 : -1;
        for (let i = 0; i < clip.length && poly.length >= 3; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], nx = -(b[1] - a[1]) * s, ny = (b[0] - a[0]) * s;
            poly = clipHalf(poly, nx, ny, nx * a[0] + ny * a[1]);
        }
        return poly;
    }
    function emit(B, poly) {
        if (poly.length < 3) return;
        const flat = []; for (const p of poly) flat.push(p.x, p.y);
        const tris = PIXI.utils.earcut(flat), base = B.n;
        for (const p of poly) B.vertex(P(p.x, p.y), undefined, undefined, 0, 0, 0, p.c || B._c);
        for (const i of tris) B.index.push(base + i);
    }
    const poly = (pts, c) => pts.map(p => V(p[0], p[1], c));
    /** A fill of pts (clipped to clip, if given) in a linear gradient from (x0, y0) to (x1, y1) */
    function linear(B, pts, clip, x0, y0, x1, y1, stops) {
        stops = parseStops(stops);
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, tOf = (x, y) => ((x - x0) * dx + (y - y0) * dy) / L2;
        let shape = poly(pts, null); if (clip) shape = clipConvex(shape, clip);
        if (shape.length < 3) return;
        const cuts = [-Infinity, ...stops.map(s => s[0]), Infinity];
        for (let i = 0; i + 1 < cuts.length; i++) {
            let band = shape;
            if (cuts[i] > -Infinity) band = clipHalf(band, dx / L2, dy / L2, cuts[i] + (x0 * dx + y0 * dy) / L2);
            if (cuts[i + 1] < Infinity) band = clipHalf(band, -dx / L2, -dy / L2, -(cuts[i + 1] + (x0 * dx + y0 * dy) / L2));
            if (band.length < 3) continue;
            emit(B, band.map(p => V(p.x, p.y, stopAt(stops, tOf(p.x, p.y)))));
        }
    }
    /** A disc of radius r round (cx, cy) in a radial gradient (r0 → r about the same centre), clipped to each of clips */
    function radialIn(B, cx, cy, r0, r, stops, clips, rings = 4, segs = 20) {
        stops = parseStops(stops);
        const at = d => stopAt(stops, (d - r0) / (r - r0)), ring = d => Array.from({ length: segs }, (_, j) => { const a = j / segs * Math.PI * 2; return V(cx + Math.cos(a) * d, cy + Math.sin(a) * d, at(d)); });
        const tri = t => { for (const c of clips) t = clipConvex(t, c); emit(B, t); };
        let prev = null;
        for (let i = 1; i <= rings; i++) {
            const R = ring(r * i / rings);
            for (let j = 0; j < segs; j++) {
                const k = (j + 1) % segs;
                if (!prev) tri([V(cx, cy, at(0)), R[j], R[k]]);
                else tri([prev[j], R[j], R[k], prev[k]]);
            }
            prev = R;
        }
    }
    /** Canvas roundRect(x, y, w, h, radii) as points; radii [top-left, top-right, bottom-right, bottom-left] */
    function roundRect(x, y, w, h, radii, n = 4) {
        let r = typeof radii === 'number' ? [radii, radii, radii, radii] : radii.length === 1 ? [radii[0], radii[0], radii[0], radii[0]] : radii;
        r = r.map(v => Math.max(0, v));
        const s = Math.min(1, w / (r[0] + r[1]), h / (r[1] + r[2]), w / (r[2] + r[3]), h / (r[3] + r[0])); r = r.map(v => v * s);
        const pts = [], corner = (cx, cy, rr, a0) => { if (rr <= 0) { pts.push([cx, cy]); return; } for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
        corner(x + w - r[1], y + r[1], r[1], -Math.PI / 2);
        corner(x + w - r[2], y + h - r[2], r[2], 0);
        corner(x + r[3], y + h - r[3], r[3], Math.PI / 2);
        corner(x + r[0], y + r[0], r[0], Math.PI);
        return pts;
    }
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const fill = (B, pts, c, clip) => { let s = poly(pts, col(c)); if (clip) s = clipConvex(s, clip); emit(B, s); };
    const strokePts = (B, pts, c, w, closed = true) => { B.color(c).line(pts.map(p => P(p[0], p[1])), w, closed); };
    /** The rounded rect blurred by Canvas's filter blur(σ): rings of its offset outline, faded by the gaussian's integral */
    function softRoundRect(B, x, y, w, h, r, c, sigma) {
        const erf = z => { const t = 1 / (1 + .3275911 * Math.abs(z)), y2 = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z); return z >= 0 ? y2 : -y2; };
        const cov = d => .5 * (1 - erf(d / (sigma * Math.SQRT2))), base = col(c), offs = [-2.5, -1.5, -.75, 0, .75, 1.5, 2.5].map(k => k * sigma);
        const ring = d => roundRect(x - d, y - d, w + 2 * d, h + 2 * d, Math.max(0, r + d) || .001, 4);
        const C = d => [base[0], base[1], base[2], base[3] * cov(d)];
        const inner = ring(offs[0]); emit(B, poly(inner, C(offs[0])));
        let prev = inner, prevC = C(offs[0]);
        for (let i = 1; i < offs.length; i++) {
            const R = ring(offs[i]), Ci = C(offs[i]), b0 = B.n;
            for (const p of prev) B.vertex(P(p[0], p[1]), undefined, undefined, 0, 0, 0, prevC);
            for (const p of R) B.vertex(P(p[0], p[1]), undefined, undefined, 0, 0, 0, Ci);
            const n = R.length;
            for (let j = 0; j < n; j++) { const k = (j + 1) % n; B.index.push(b0 + j, b0 + n + j, b0 + n + k, b0 + j, b0 + n + k, b0 + k); }
            prev = R; prevC = Ci;
        }
    }
    /** Two circles filled even-odd (Canvas arc + arc ccw, fill('evenodd')): both lunes */
    function xorCircles(B, c, ax, ay, ar, bx, by, br, n = 24) {
        const inside = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) < r;
        const arcWhere = (cx, cy, r, keep) => { const out = []; for (let i = 0; i < n * 4; i++) { const a = i / (n * 4) * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; out.push([x, y, keep(x, y)]); } return out; };
        // each lune: the run of one circle outside the other, then the run of the other inside the first (back the other way)
        const run = list => { const k = list.findIndex((p, i) => p[2] && !list[(i - 1 + list.length) % list.length][2]); if (k < 0) return list.every(p => p[2]) ? list : []; const out = []; for (let i = 0; i < list.length; i++) { const p = list[(k + i) % list.length]; if (!p[2]) break; out.push(p); } return out; };
        const A = run(arcWhere(ax, ay, ar, (x, y) => !inside(x, y, bx, by, br))), Bin = run(arcWhere(bx, by, br, (x, y) => inside(x, y, ax, ay, ar)));
        const Bo = run(arcWhere(bx, by, br, (x, y) => !inside(x, y, ax, ay, ar))), Ain = run(arcWhere(ax, ay, ar, (x, y) => inside(x, y, bx, by, br)));
        const lune = (outer, inner) => { if (outer.length < 2) return; fill(B, outer.concat(inner.slice().reverse()), c); };
        lune(A, Bin); lune(Bo, Ain);
    }

    // ---- the look (car-art.js) ----
    const rim = v => v.visualStyle === 'blackmark' ? CAR_ART.GOLD : v.visualStyle === 'angular' ? (v.glowColor || '#7fe8ff') : '#b9b6c4';
    const bodyPts = g => {
        const L = g.L, W = g.W;
        if (g.st === 'angular') return [[L / 2, -W * 0.26], [L / 2 - 9, -W / 2], [-L / 2 + 6, -W / 2 + 1], [-L / 2, -W / 2 + 7], [-L / 2, W / 2 - 7], [-L / 2 + 6, W / 2 - 1], [L / 2 - 9, W / 2], [L / 2, W * 0.26]];
        return roundRect(-L / 2, -W / 2, L, W, g.st === 'blackmark' ? [6, 11, 11, 6] : [4, 7, 7, 4], 6);
    };
    const scaled = (pts, sx, sy) => pts.map(p => [p[0] * sx, p[1] * sy]);

    function paint(B, v, g) {
        const { L, W, st, si, x0, x1, x2, x3 } = g, c = _carRGB(v.color), cs = `rgb(${c.join(',')})`, body = bodyPts(g);
        const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255, lady = st === 'blackmark', zen = st === 'angular', gel = !lady && !zen, truck = v.model === 'truck';
        softRoundRect(B, -L / 2 - 1, -W / 2 - 1, L + 2, W + 2, 8, 'rgba(8, 4, 16, 0.55)', 3);           // contact shadow, blur(3px)
        const tyreL = Math.max(10, L * 0.16), rc = rim(v);
        for (const s of [-1, 1]) {                                                                    // rear tyres
            const ax = g.axleR;
            fill(B, roundRect(ax - tyreL / 2, s * W / 2 - (s > 0 ? 3.2 : -0.2) - 1.5, tyreL, 4.5, 1.5), '#0b0a0e');
            fill(B, rect(ax - tyreL * 0.28, s * (W / 2 + 0.9) - 0.5, tyreL * 0.56, 1), GLColor.alpha(rc, .85));
        }
        for (const s of [-1, 1]) {                                                                    // mirrors
            fill(B, roundRect(x0 - 3, s > 0 ? W / 2 - 1 : -W / 2 - 2.6, 4.5, 3.6, 1.2), _carMix(c, -0.35));
            fill(B, rect(x0 - 2.4, s > 0 ? W / 2 + 1.6 : -W / 2 - 2.2, 3.2, 0.7), 'rgba(210, 200, 240, 0.35)');
        }
        // paint, shaded round the body's curve (clipped to the body)
        fill(B, body, cs);
        const dk = lum > 0.7 ? 0.24 : 0.4;
        linear(B, body, null, 0, -W / 2, 0, W / 2, [[0, `rgba(0,0,0,${dk})`], [0.16, 'rgba(0,0,0,0.04)'], [0.42, `rgba(255,255,255,${lady ? 0.12 : 0.09})`], [0.58, 'rgba(255,255,255,0.05)'], [0.84, 'rgba(0,0,0,0.06)'], [1, `rgba(0,0,0,${dk + 0.06})`]]);
        linear(B, body, null, -L / 2, 0, L / 2, 0, [[0, 'rgba(0,0,0,0.22)'], [0.1, 'rgba(0,0,0,0)'], [0.9, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.2)']]);
        for (const ax of [g.axleF, g.axleR]) for (const s of [-1, 1])                              // wheel arches
            radialIn(B, ax, s * W / 2, 1, L * 0.11, [[0, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,255,255,0)']], [body, rect(ax - L * 0.12, s > 0 ? W / 2 - L * 0.12 : -W / 2, L * 0.24, L * 0.12)]);
        if (zen) {                                                                                    // facets
            fill(B, [[L / 2, -W * 0.26], [x0, -W / 2 + si], [x0, 0], [L / 2 - 2, 0]], 'rgba(255,255,255,0.13)', body);
            fill(B, [[L / 2, W * 0.26], [x0, W / 2 - si], [x0, 0], [L / 2 - 2, 0]], 'rgba(0,0,0,0.16)', body);
            fill(B, [[x3, -W / 2 + si], [-L / 2, -W / 2 + 7], [-L / 2, 0], [x3, 0]], 'rgba(0,0,0,0.14)', body);
        } else if (!truck) {                                                                          // hood creases
            for (const s of [-1, 1]) strokePts(B, [[L / 2 - 3, s * W * 0.2], [x0 + 1, s * W * 0.24]], 'rgba(0,0,0,0.18)', .8, false);
            for (const s of [-1, 1]) strokePts(B, [[L / 2 - 3, s * W * 0.2 - 0.8], [x0 + 1, s * W * 0.24 - 0.8]], 'rgba(255,255,255,0.10)', .8, false);
        }
        strokePts(B, scaled(body, (L - 3) / L, (W - 3) / W), 'rgba(255,255,255,0.13)', .9 * Math.sqrt((L - 3) / L * (W - 3) / W));   // shoulder light
        if (lady) strokePts(B, scaled(body, (L - 6) / L, (W - 6) / W), GLColor.alpha(CAR_ART.GOLD, .8), .7 * Math.sqrt((L - 6) / L * (W - 6) / W));
        if (zen) for (const s of [-1, 1]) strokePts(B, [[L / 2 - 10, s * (W / 2 - 1.8)], [-L / 2 + 8, s * (W / 2 - 2.6)]], GLColor.alpha(v.glowColor || '#00f3ff', .75), .9, false);
        if (gel) {                                                                                    // bumpers
            fill(B, rect(L / 2 - 2.6, -W / 2, 2.6, W), '#16151b', body); fill(B, rect(-L / 2, -W / 2, 2.4, W), '#16151b', body);
            fill(B, rect(L / 2 - 2.6, -W / 2, 0.6, W), 'rgba(255,255,255,0.08)', body);
            if (v.model === 'sports') for (const s of [-1, 1]) fill(B, rect(-L / 2 + 2, s * 3.2 - 1.2, L - 4.6, 2.4), lum > 0.55 ? 'rgba(20,18,28,0.55)' : 'rgba(245,240,255,0.5)');
        }
        // the greenhouse
        const gw = W / 2 - si, glass = [[x0, -gw], [x1, -gw + 1], [x2, -gw + 1], [x3, -gw + 2.5], [x3, gw - 2.5], [x2, gw - 1], [x1, gw - 1], [x0, gw]];
        linear(B, glass, null, x0, 0, x3, 0, [[0, '#1d1a3a'], [0.2, '#0b0916'], [1, '#100d20']]);
        linear(B, [[x0, -gw], [x1, -gw + 1], [x1, gw - 1], [x0, gw]], null, x0, 0, x1, 0, [[0, 'rgba(170, 160, 230, 0.26)'], [1, 'rgba(170, 160, 230, 0.02)']]);
        B.color('rgba(255, 250, 255, 0.22)').seg(P(x0 - 1, -gw * 0.35), P(x1 + 1, -gw * 0.75), 1.4).seg(P(x0 - 1, -gw * 0.1), P(x1 + 1, -gw * 0.45), .6);
        // the roof
        const rw = gw - 2.6, rx0 = x2, rx1 = x1;
        if (g.hearse) {
            const cap = roundRect(-L / 2 + 4, -rw, x1 - (-L / 2 + 4), rw * 2, [4, 3, 3, 4]);
            linear(B, cap, null, 0, -rw, 0, rw, [[0, '#8d80a6'], [0.45, '#c8bdd6'], [1, '#7c6f98']]);
            strokePts(B, cap, CAR_ART.GOLD, .7);
            const mx = (-L / 2 + 4 + x1) / 2 - 6;
            xorCircles(B, CAR_ART.GOLD, mx, 0, 3.4, mx + 1.6, -0.6, 2.9);
        } else if (lady) {
            const roof = roundRect(rx0, -rw, rx1 - rx0, rw * 2, 3);
            linear(B, roof, null, rx1, -rw, rx0, rw, [[0, '#2a2442'], [0.5, '#0a0812'], [1, '#1a1530']]);
            strokePts(B, roof, CAR_ART.GOLD, .7);
        } else {
            const roof = roundRect(rx0, -rw, rx1 - rx0, rw * 2, zen ? 1.5 : 3);
            linear(B, roof, null, 0, -rw, 0, rw, [[0, _carMix(c, -0.28)], [0.4, _carMix(c, 0.12)], [1, _carMix(c, -0.34)]]);
            strokePts(B, roof, 'rgba(0,0,0,0.3)', .6);
            if (gel && v.model === 'suv') for (const s of [-1, 1]) strokePts(B, [[rx0 + 2, s * (rw - 1.5)], [rx1 - 2, s * (rw - 1.5)]], '#b8b4c6', 1, false);
        }
        if (!truck && !g.hearse) { const bx = (x1 + x2) / 2; for (const s of [-1, 1]) fill(B, rect(bx - 1, s > 0 ? rw - 0.2 : -gw + 0.8, 2, gw - rw + 0.4 - 0.8), _carMix(c, -0.3)); }
        if (truck) {
            const bx0 = x3 - 4, bx1 = -L / 2 + 3, bw = W / 2 - 3.5;
            fill(B, rect(bx1, -bw, bx0 - bx1, bw * 2), '#17141d');
            for (let y = -bw + 4; y < bw - 1; y += 4.5) strokePts(B, [[bx1 + 1, y], [bx0 - 1, y]], 'rgba(255,255,255,0.07)', 1, false);
            strokePts(B, rect(bx1, -bw, bx0 - bx1, bw * 2), _carMix(c, -0.2), 1.6);
        }
        for (const s of [-1, 1]) {                                                                    // lamp housings
            if (zen) fill(B, [[L / 2 - 1, s * W * 0.27], [L / 2 - 8.5, s * (W / 2 - 0.8)], [L / 2 - 10, s * (W / 2 - 3)], [L / 2 - 3, s * W * 0.22]], '#17131f');
            else if (lady) fill(B, rect(L / 2 - 2.6, s > 0 ? W / 2 - 12 : -W / 2 + 2.5, 2.2, 9.5), '#17131f');
            else fill(B, roundRect(L / 2 - 4, s > 0 ? W / 2 - 10.5 : -W / 2 + 2, 3.4, 8.5, 1.5), '#17131f');
        }
        if (lady) fill(B, rect(-L / 2 + 0.5, -W / 2 + 4, 2.2, W - 8), '#2a060e');
        else for (const s of [-1, 1]) fill(B, rect(-L / 2 + 0.4, s > 0 ? W / 2 - 11.5 : -W / 2 + 1.5, 3, 10), '#2a060e');
        strokePts(B, body, 'rgba(6, 3, 12, 0.7)', .9);                                                // the outline
    }
    /** drawGlow(x, y, r, colour, core) as a radial fan into B (glowSprite: 1 at the centre, 0.45 at core, 0 at r) */
    function glow(B, x, y, r, color, alpha, core = 0.35) {
        const rgb = col(color), at = t => [rgb[0], rgb[1], rgb[2], alpha * (core > 0 ? (t < core ? 1 - .55 * t / core : .45 * (1 - (t - core) / (1 - core))) : 1 - t)];
        const ts = core > 0 ? [0, core / 2, core, (1 + core) / 2, 1] : [0, .5, 1], segs = 20, base = B.n;
        B.vertex(P(x, y), undefined, undefined, 0, 0, 0, at(0));
        for (let i = 1; i < ts.length; i++) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; B.vertex(P(x + Math.cos(a) * r * ts[i], y + Math.sin(a) * r * ts[i]), undefined, undefined, 0, 0, 0, at(ts[i])); }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i + 1 < ts.length; i++) for (let j = 0; j < segs; j++) { const a = base + 1 + (i - 1) * segs + j, b = base + 1 + (i - 1) * segs + (j + 1) % segs; B.index.push(a, a + segs, b + segs, a, b + segs, b); }
    }
    /** The lamps (drawCarLamps), in the car's frame */
    function lamps(B, v, g, farLOD) {
        const L = g.L, W = g.W, on = carLampsOn(v);
        if (v.turnSignal && v.turnSignalTimer > 0 && Math.floor(v.turnSignalTimer / 10) % 2 === 0) {
            const s = v.turnSignal === 'left' ? -1 : 1;
            fill(B, rect(L / 2 - 5, s > 0 ? W / 2 - 3.5 : 0.5 - W / 2, 3.5, 3), '#ffb030'); fill(B, rect(-L / 2 + 0.5, s > 0 ? W / 2 - 3.5 : 0.5 - W / 2, 3, 3), '#ffb030');
            if (!farLOD) { glow(B, L / 2 - 3, s * (W / 2 - 2), 9, '#ffaa00', .7); glow(B, -L / 2 + 2, s * (W / 2 - 2), 9, '#ffaa00', .7); }
        }
        const rev = v.state === 'REVERSING', brake = on && (v.speed < 0.5 || rev), tail = rev ? '#f4f0ff' : brake ? '#ff2244' : on ? '#9a1028' : '#4a0a16';
        if (g.st === 'blackmark') fill(B, rect(-L / 2 + 0.6, -W / 2 + 4.5, 1.8, W - 9), tail);
        else for (const s of [-1, 1]) fill(B, rect(-L / 2 + 0.6, s > 0 ? W / 2 - 11 : -W / 2 + 2, 2.4, 9), tail);
        if (brake && !farLOD) for (const s of [-1, 1]) glow(B, -L / 2, s * (W / 2 - 6), 8, rev ? '#ffffff' : '#ff2244', .35);
        const hl = v.headlightColor || '#ffffaa', hc = on ? hl : _carMix(_carRGB(hl), -0.55);
        for (const s of [-1, 1]) {
            if (g.st === 'angular') { const a = s * -0.75, ca = Math.cos(a), sa = Math.sin(a), cx = L / 2 - 5, cy = s * (W / 2 - 4.5); fill(B, rect(-3.5, -0.8, 7, 1.6).map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]), hc); }
            else if (g.st === 'blackmark') fill(B, rect(L / 2 - 2, s > 0 ? W / 2 - 11 : -W / 2 + 3, 1.6, 8), hc);
            else fill(B, roundRect(L / 2 - 3.4, s > 0 ? W / 2 - 9.5 : -W / 2 + 3, 2.4, 6.5, 1), hc);
        }
    }
    /** The light sliding over the paint (drawCarSheen), screen-blended, in the car's frame */
    function sheen(B, v, g) {
        const Lt = sunNow(), gloss = CAR_ART.GLOSS[g.st] || 1, L = g.L, W = g.W, body = bodyPts(g);
        if (Lt.day > 0.03) {
            const ca = Math.cos(v.angle), sa = Math.sin(v.angle), lx = ca * Lt.dx + sa * Lt.dy, ly = -sa * Lt.dx + ca * Lt.dy;
            const R = Math.max(L, W) * 0.55, cx = lx * W * 0.22, cy = ly * W * 0.22, a = Math.min(0.42, 0.24 * Lt.day * gloss), rgb = Lt.rgb;
            if (Math.hypot(lx, ly) > 1e-4) linear(B, body, null, cx - lx * R, cy - ly * R, cx + lx * R, cy + ly * R, [[0, `rgba(${rgb}, 0)`], [0.42, `rgba(${rgb}, ${a * 0.35})`], [0.52, `rgba(${rgb}, ${a})`], [0.6, `rgba(${rgb}, 0)`], [1, `rgba(${rgb}, 0)`]]);
        }
        if (Lt.night > 0.05) {
            const ph = (((v.x * 0.71 + v.y * 0.71) / 110) % 1 + 1) % 1, cx = (0.5 - ph) * L * 1.6, a = 0.2 * Lt.night * gloss;
            linear(B, body, null, cx - 14, 0, cx + 14, 0, [[0, 'rgba(220, 196, 255, 0)'], [0.5, `rgba(220, 196, 255, ${a})`], [1, 'rgba(220, 196, 255, 0)']]);
        }
    }
    /** After dark (drawCarGlow): the lamps glowing, added as light, in the car's frame */
    function nightGlow(B, v, g, dark) {
        if (!carLampsOn(v)) return;
        const L = g.L, W = g.W, a = Math.min(1, dark * 1.6);
        if (a < 0.04) return;
        const rev = v.state === 'REVERSING', brake = v.speed < 0.5 || rev;
        for (const s of [-1, 1]) glow(B, -L / 2 + 1, s * (W / 2 - 6), brake ? 15 : 10, rev ? '#fff4f8' : '#ff2848', a * (brake ? 0.8 : 0.38));
        if (v._lod === 1) return;
        for (const s of [-1, 1]) glow(B, L / 2 - 1, s * (W / 2 - 6), 10, v.headlightColor || '#ffffaa', a * .5);
        if (v.turnSignal && v.turnSignalTimer > 0 && Math.floor(v.turnSignalTimer / 10) % 2 === 0) {
            const s = v.turnSignal === 'left' ? -1 : 1;
            glow(B, L / 2 - 3, s * (W / 2 - 2), 10, '#ffaa00', a * .8); glow(B, -L / 2 + 2, s * (W / 2 - 2), 10, '#ffaa00', a * .8);
        }
    }

    const SCREEN = Object.assign(PIXI.State.for2d(), { blend: true, blendMode: PIXI.BLEND_MODES.SCREEN });
    const ADD = Object.assign(PIXI.State.for2d(), { blend: true, blendMode: PIXI.BLEND_MODES.ADD });

    class Cars {
        constructor() { this.looks = new Map(); this.nodes = new Map(); this.overs = new Map(); this.frame = 0; this.stats = { cars: 0, looks: 0 }; }
        static supports(v) { return v instanceof TrafficVehicle && v.draw === TrafficVehicle.prototype.draw; }
        look(v) {
            const g = carGeo(v), key = g.key + '|' + v.color + '|' + (v.glowColor || '') + '|' + v.brand;
            let k = this.looks.get(key);
            if (!k) {
                const B = new GLBuildingBuilder(0); paint(B, v, g);
                const tyreL = Math.max(10, g.L * 0.16), tyre = s => { const T = new GLBuildingBuilder(0); fill(T, roundRect(-tyreL / 2, -2.4, tyreL, 4.8, 1.6), '#0b0a0e'); fill(T, rect(-tyreL * 0.36, s * 1.7 - 0.6, tyreL * 0.72, 1.2), GLColor.alpha(rim(v), .9)); return GLInstance.geometry(T); };
                k = { body: GLInstance.geometry(B), tyres: [tyre(-1), tyre(1)], under: null };
                if (v.glowColor) { const U = new GLBuildingBuilder(0); glow(U, 0, 0, 1, v.glowColor, 1, .5); k.under = GLInstance.geometry(U); }
                this.looks.set(key, k);
            }
            return k;
        }
        /** The car's node, posed for this frame. part: 'all'; 'under' (the car she drives: only its underglow here);
            'over' (that car's body and lamps, drawn over the people in it) */
        node(v, farLOD, part = 'all') {
            const map = part === 'over' ? this.overs : this.nodes;
            let r = map.get(v);
            if (!r) {
                r = { root: new PIXI.Container(), under: new GLInstance(), tyres: [new GLInstance(), new GLInstance()], lean: new PIXI.Container(), body: new GLInstance(), sheen: new GLDynamic(), lamps: new GLDynamic() };
                r.sheen.state = SCREEN; r.lean.addChild(r.body, r.sheen); r.root.addChild(r.under, ...r.tyres, r.lean, r.lamps); r.root._nativeEntity = v;
                map.set(v, r);
            }
            r.seen = this.frame;
            const k = this.look(v), g = carGeo(v), d = (v.steer || 0) * CAR_ART.WHEEL_LOCK;
            r.root.position.set(v.x, v.y); r.root.rotation = v.angle || 0; r.root.zIndex = v.y || 0; r.root.visible = true; r.root.alpha = v.fade ?? 1;
            r.under.visible = part !== 'over' && !farLOD && !!k.under;
            r.lean.visible = r.lamps.visible = part !== 'under'; for (const t of r.tyres) t.visible = part !== 'under';
            if (part === 'under') return r.root;
            if (r.under.visible) { r.under.geometry = k.under; r.under.alpha = .4 + (Math.sin(_frameTime / 800) + 1) / 2 * .25; r.under.scale.set((g.L + 24) / 2, (g.W + 24) / 2); }
            for (let i = 0; i < 2; i++) { const t = r.tyres[i], s = i ? 1 : -1; t.geometry = k.tyres[i]; t.position.set(g.axleF, s * (g.W / 2 - 0.4)); t.rotation = d; }
            const lx = farLOD ? 0 : Math.max(-1, Math.min(1, v.load || 0)) * CAR_ART.PITCH_PX, ly = farLOD ? 0 : -(v.bodyRoll || 0) * CAR_ART.ROLL_PX;
            r.lean.position.set(Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05 ? lx : 0, Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05 ? ly : 0);
            r.body.geometry = k.body;
            const S = new GLBuildingBuilder(0); if (!farLOD) sheen(S, v, g); r.sheen.set(S);
            const M = new GLBuildingBuilder(0); lamps(M, v, g, farLOD); r.lamps.set(M);
            return r.root;
        }
        /** Every car's glow after dark, into one added geometry in world space */
        glow(cars, dark) {
            if (!this.night) { this.night = new GLDynamic(); this.night.state = ADD; }
            const B = new GLBuildingBuilder(0);
            for (const v of cars) { const g = carGeo(v), c = Math.cos(v.angle), s = Math.sin(v.angle); B.inFrame([c, s, -s, c, v.x, v.y], () => nightGlow(B, v, g, dark)); }
            this.night.set(B);
            return this.night;
        }
        begin() { this.frame++; for (const m of [this.nodes, this.overs]) for (const r of m.values()) r.root.parent?.removeChild(r.root); }
        end() {
            for (const m of [this.nodes, this.overs]) for (const [v, r] of m) if (r.seen < this.frame - 300) { r.sheen.geometry?.destroy(); r.lamps.geometry?.destroy(); r.root.destroy({ children: true }); m.delete(v); }
            if (this.looks.size > 96) for (const [key, k] of this.looks) { if (this.looks.size <= 64) break; let used = false; for (const m of [this.nodes, this.overs]) for (const r of m.values()) if (r.body.geometry === k.body) used = true; if (!used) { k.body.destroy(); k.tyres.forEach(t => t.destroy()); k.under?.destroy(); this.looks.delete(key); } }
            this.stats.looks = this.looks.size;
        }
    }
    return Cars;
})();
