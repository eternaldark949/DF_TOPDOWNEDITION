// GL engine: Enni Cole (buildings/factories.js, the _ec* methods), built once as GPU geometry.
// Rose stone and dark glass round three glass lanterns on the roof, the arched entrance bay
// stepping out of the front with its curved-glass showroom on top, the script wordmark, the
// canopy over the door, the steps and the clipped cypresses either side. What Canvas baked into
// sprites (the ground, the roof) is geometry here; every wall is a face, so the shader shows the
// walls that face the camera, in the order Canvas drew them (the building's face list). Walls,
// roof and canopy use the landmark kit's true perspective (lean mode 1), as _ecP / _ecK do.
const GLEnniCole = (() => {
    const M = 1;                                                   // true perspective
    const T = {
        stone: '#71354d', stoneLo: '#422031', steel: '#1c2028', gold: '#d0ac72',
        goldHi: '#f3ddb0', glass: '#352d30', warm: '#ffd392', rose: '#d96896'
    };
    const RR = (x, y, w, h, r, z, mode = M) => GLBuildingBuilder.roundRectPts(x, y, w, h, r, z, mode);
    const ell = (cx, cy, rx, ry, z = 0, mode = 0, n = 40) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z, mode]); } return p; };

    /** Convex polygon `pts` clipped to the convex polygon `clip` (Sutherland–Hodgman) */
    function clipConvex(pts, clip) {
        let area = 0; for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
        const s = area > 0 ? 1 : -1;
        let out = pts;
        for (let i = 0; i < clip.length && out.length; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], inp = out; out = [];
            const side = q => s * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
            for (let j = 0; j < inp.length; j++) {
                const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
                if (sp >= 0) out.push(p);
                if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2], p[3]]); }
            }
        }
        return out;
    }
    const stopColor = (stops, t) => {
        if (t <= stops[0][0]) return GLColor.parse(stops[0][1]);
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [ta, ca] = stops[i - 1], [tb, cb] = stops[i]; return GLColor.mix(ca, cb, tb > ta ? (t - ta) / (tb - ta) : 1); }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** Canvas's two-circle radial gradient over an ellipse (rings of per-vertex colour) */
    function radialEllipse(B, cx, cy, rx, ry, z, mode, gx0, gy0, r0, gx1, gy1, r1, stops) {
        const tAt = (x, y) => {
            const cdx = gx1 - gx0, cdy = gy1 - gy0, dr = r1 - r0, px = x - gx0, py = y - gy0;
            const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
            if (Math.abs(a) < 1e-6) return c / (2 * b);
            const d = b * b - a * c; if (d < 0) return 0;
            // the larger root whose circle has a radius >= 0 (as Canvas picks it)
            const t1 = (b + Math.sqrt(d)) / a, t2 = (b - Math.sqrt(d)) / a, ok = t => r0 + t * dr >= 0;
            const hi = Math.max(t1, t2), lo = Math.min(t1, t2);
            return ok(hi) ? hi : ok(lo) ? lo : 0;
        };
        const rings = 10, segs = 36, base = B.n, col = (x, y) => stopColor(stops, tAt(x, y));
        B.vertex([cx, cy, z, mode], undefined, undefined, 0, 0, 0, col(cx, cy));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
            const f = i / rings, a = j / segs * Math.PI * 2, x = cx + Math.cos(a) * rx * f, y = cy + Math.sin(a) * ry * f;
            B.vertex([x, y, z, mode], undefined, undefined, 0, 0, 0, col(x, y));
        }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
            const a = base + 1 + (i - 1) * segs + j, b2 = base + 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b2 + segs;
            B.index.push(a, c, d, a, d, b2);
        }
    }

    function build(b) {
        const H = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT;
        const o = { H, base: new GLBuildingBuilder(H), top: new GLBuildingBuilder(H), glow: new GLBuildingBuilder(H) };
        const faces = b._leanFaces().map(f => {
            const g = { nx: f.nx, ny: f.ny, x1: f.x1, y1: f.y1 };
            return { f, id: o.top.addFace(g), b: o.base.addFace(g), g: o.glow.addFace(g) };
        });
        ground(b, o.base);
        for (const fc of faces) { o.top.face(fc.id); face(b, o.top, fc.f, H, false); }
        o.top.face(-1);
        roof(b, o.top, H, false);
        wordmark(b, o.top, H, false);
        canopy(b, o.top, H, false);
        const G = o.glow;
        G.additive(true);
        for (const fc of faces) { G.face(fc.g); face(b, G, fc.f, H, true); }
        G.face(-1);
        roof(b, G, H, true);
        wordmark(b, G, H, true);
        canopy(b, G, H, true);
        G.additive(false);
        return o;
    }

    /** The ground sprite: contact shadows, the entry steps and the two clipped cypresses in gilt pots */
    function ground(b, B) {
        const x = b.x, y = b.y, Q = (px, py) => [px, py, 0, 0];
        B.color('rgba(0,0,0,.43)');
        for (const s of b.sections) B.rect(x + s.x + 18, y + s.y + 18, s.w, s.h);
        const t = b.attachedTransition, cx = t.x + t.w / 2, yy = t.y - 10;
        const steps = RR(cx - 116, yy - 5, 232, 54, [5, 5, 16, 16], 0, 0);
        B.color('#61515a').poly(steps);
        B.color('rgba(208,172,114,.55)').line(steps, 1, true);
        B.color('rgba(211,185,151,.28)');
        for (const sy of [13, 29, 45]) B.seg(Q(cx - 112, yy + sy), Q(cx + 112, yy + sy), 1);
        for (const dx of [-128, 128]) {
            const px = cx + dx, py = yy + 24;
            B.color('rgba(0,0,0,.35)').poly(ell(px + 4, py + 5, 19, 15));
            const pot = ell(px, py, 16, 12);
            GLBuildingModel.gradPoly(B, pot, px - 15, py, px + 15, py, [[0, '#58432c'], [.45, T.gold], [1, '#755539']]);
            B.color(T.goldHi).line(pot, 1, true);
            radialEllipse(B, px, py - 3, 14, 17, 0, 0, px - 5, py - 5, 2, px, py, 18, [[0, '#547654'], [.65, '#294b36'], [1, '#152b23']]);
            B.color('rgba(124,159,103,.24)');
            for (let j = 0; j < 11; j++) { const a = j * 2.4, rr = 3 + j % 4 * 2; B.disc(px + Math.cos(a) * rr, py - 3 + Math.sin(a) * rr, 2, 0, 0, 10); }
        }
    }

    /** One face of the curtain wall (_ecFace): stone and steel, the bays of framed glass, piers, cornice, cap;
        at night the warm glass, its dots and the rose uplight on the piers. Strokes keep their screen width */
    function face(b, B, f, H, emissive) {
        const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
        const P = (u, z) => [f.x1 + (f.x2 - f.x1) * u, f.y1 + (f.y2 - f.y1) * u, z, M];
        const quadPts = (u0, u1, z0, z1) => [P(u0, z0), P(u1, z0), P(u1, z1), P(u0, z1)];
        const fill = (list, col) => { B.color(col); for (const q of list) B.poly(quadPts(...q)); };
        const stroke = (list, col, w) => { B.color(col); for (const q of list) B.line(quadPts(...q), w, true); };
        const entrance = f.side === 'S' && Math.abs(f.y1 - (b.y + 700)) < 1;
        const n = Math.max(2, Math.round(L / 77)), pad = 8 / L, bands = [[4, H * .48], [H * .59, H - 4]];
        if (!emissive) {
            fill([[0, 1, 0, H * .55]], T.stoneLo); fill([[0, 1, H * .55, H]], T.steel);
            const frames = [], inner = [], mull = [], tran = [], glint = [], pierLo = [], pierHi = [];
            for (let i = 0; i < n; i++) {
                const u0 = i / n + pad, u1 = (i + 1) / n - pad;
                for (const [z0, z1] of bands) {
                    frames.push([u0, u1, z0, z1]); inner.push([u0 + .018, u1 - .018, z0 + 1, z1 - 1]);
                    mull.push([(u0 + u1) / 2 - .002, (u0 + u1) / 2 + .002, z0, z1]);
                    tran.push([u0, u1, z0 + (z1 - z0) * .44, z0 + (z1 - z0) * .44 + .65]);
                    glint.push([u0 + .025, u0 + .039, z0 + 2, z1 - 1]);
                }
                pierLo.push([i / n, i / n + pad * .58, 0, H * .54]); pierHi.push([i / n, i / n + pad * .35, H * .56, H]);
            }
            fill(frames, '#6b4733'); stroke(frames, 'rgba(204,158,101,.62)', 1.4); fill(inner, 'rgba(244,179,96,.12)');
            fill(mull, T.steel); fill(tran, '#252127'); fill(glint, 'rgba(221,231,237,.19)');
            fill(pierLo, T.stone); fill(pierHi, '#24272f');
            const cornice = [[0, 1, H * .51, H * .57]]; fill(cornice, '#5d303e'); stroke(cornice, 'rgba(211,166,112,.45)', 1);
            const cap = [[0, 1, H - 2, H]]; fill(cap, '#303039'); stroke(cap, 'rgba(211,175,118,.55)', .9);
            if (entrance) {
                // The arched transom, in the wall's own u/z
                const mid = .5, wide = .3, zbase = 5, zspring = H * .26, zpeak = H * .48;
                const arch = [P(mid - wide, zbase), P(mid + wide, zbase), P(mid + wide, zspring)];
                for (let i = 0; i <= 16; i++) { const a = i * Math.PI / 16; arch.push(P(mid + Math.cos(a) * wide, zspring + Math.sin(a) * (zpeak - zspring))); }
                arch.splice(3, 1);                                    // (the arc's first point is the spring point again)
                B.color('#8b5737').poly(arch);
                B.color(T.gold).line(arch, 2, true);
                B.color('#201c22').seg(P(.5, zbase), P(.5, zpeak), 2);
            }
        } else {
            const glow = [], up = [];
            const dots = [];
            for (let i = 0; i < n; i++) {
                const u0 = i / n + pad, u1 = (i + 1) / n - pad;
                for (const [z0, z1] of bands) { glow.push([u0 + .006, u1 - .006, z0 + 1, z1 - 1]); dots.push(P((u0 + u1) / 2, z0 + (z1 - z0) * .57)); }
            }
            fill(glow, 'rgba(255,192,108,.32)');
            B.color('rgba(255,237,180,.85)'); for (const d of dots) B.disc(d[0], d[1], 1.35, d[2], M, 8);
            for (let i = 0; i <= n; i++) { const u = i / n; up.push([Math.max(0, u - .012), Math.min(1, u + .012), 1, H * .50]); }
            fill(up, 'rgba(225,75,129,.16)');
        }
    }

    /** The roof (Canvas's ec_roof / ec_roof_lit sprites) in the plane of the roof */
    function roof(b, B, H, emissive) {
        const x = b.x, y = b.y, pl = GLBuildingModel.plane(B, H, M), p = pl.p, K = GLB_LINE.SCALE_K;
        const seg = (x0, y0, x1, y1, w) => B.line([p(x0, y0), p(x1, y1)], w, false, K);
        const glass = (gx, gy, w, h, rows, cols) => {
            const box = RR(gx, gy, w, h, 22, H);
            if (!emissive) {
                GLBuildingModel.gradPoly(B, box, gx, gy, gx + w, gy + h, [[0, '#3b3439'], [.52, '#514034'], [1, '#23282d']]);
                pl.rect(gx + 8, gy + 8, w - 16, h - 16, 'rgba(195,145,91,.10)');
                B.color('rgba(220,188,132,.10)');
                for (let i = 1; i < cols; i++) { const xx = gx + w * i / cols; seg(xx, gy, xx, gy + h, 1); }
                for (let j = 1; j < rows; j++) { const yy = gy + h * j / rows; seg(gx, yy, gx + w, yy, 1); }
                B.color('rgba(221,186,137,.20)');
                for (let i = 0; i < cols; i++) {
                    B.rect(gx + w * (i + .18) / cols, gy + h * .23, w * .56 / cols, h * .12, H, M);
                    B.rect(gx + w * (i + .18) / cols, gy + h * .67, w * .56 / cols, h * .10, H, M);
                }
                const sheen = clipConvex([p(gx, gy), p(gx + w * .45, gy), p(gx + w, gy + h * .82), p(gx + w, gy + h), p(gx + w * .77, gy + h)], box);
                B.color('rgba(183,193,211,.07)').poly(sheen);
            } else {
                GLBuildingModel.gradPoly(B, box, gx, gy, gx, gy + h, [[0, 'rgba(236,164,83,.08)'], [.5, 'rgba(255,197,113,.17)'], [1, 'rgba(255,190,98,.07)']]);
            }
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
                const cx = gx + w * (i + .5) / cols, cy = gy + h * (j + .5) / rows;
                if (emissive) radialEllipse(B, cx, cy, 24, 24, H, M, cx, cy, 0, cx, cy, 24, [[0, 'rgba(255,210,139,.20)'], [1, 'rgba(255,192,105,0)']]);
                B.color(emissive ? 'rgba(255,221,164,.75)' : 'rgba(181,136,83,.65)').circleLine(cx, cy, 9, 1, H, M, K);
                B.color(emissive ? '#ffe9b8' : '#ceaa73');
                for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; B.disc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, emissive ? 1.35 : 1.1, H, M, 8); }
            }
            if (!emissive) {
                const lines = [];
                for (let i = 1; i < cols * 2; i++) { const xx = gx + w * i / (cols * 2); lines.push([xx, gy, xx, gy + h]); }
                for (let j = 1; j < rows * 2; j++) { const yy = gy + h * j / (rows * 2); lines.push([gx, yy, gx + w, yy]); }
                B.color('#1d2028'); for (const l of lines) seg(...l, 5);
                B.color('rgba(221,197,153,.20)'); for (const l of lines) seg(...l, .8);
            }
            B.color(emissive ? 'rgba(237,187,123,.30)' : T.steel).line(box, emissive ? 1 : 4, true, K);
            if (!emissive) B.color('rgba(208,172,114,.62)').line(RR(gx + 3, gy + 3, w - 6, h - 6, 19, H), 1, true, K);
        };
        if (!emissive) {
            for (const s of b.sections) {
                const sx = x + s.x, sy = y + s.y;
                GLBuildingModel.gradPoly(B, [p(sx, sy), p(sx + s.w, sy), p(sx + s.w, sy + s.h), p(sx, sy + s.h)], sx, sy, sx + s.w, sy + s.h, [[0, '#382934'], [.45, '#2d242c'], [1, '#201e27']]);
                B.color('rgba(143,86,107,.24)');
                for (let k = 28; k < s.h; k += 45) seg(sx + 7, sy + k, sx + s.w - 7, sy + k, 1);
            }
            B.color(T.stone); for (const f of b._leanFaces()) seg(f.x1, f.y1, f.x2, f.y2, 8);
            B.color('rgba(230,199,153,.70)'); for (const f of b._leanFaces()) seg(f.x1, f.y1, f.x2, f.y2, 1.4);
        }
        // The atrium's glass over the lobby, lanterns over the two wings
        glass(x + 300, y + 40, 300, 490, 3, 2);
        glass(x + 40, y + 50, 220, 470, 3, 2); glass(x + 640, y + 50, 220, 470, 3, 2);
        // The curved-glass showroom over the entrance bay: gowns lit inside, tiny lights overhead
        const bx = x + 332, by = y + 606, bw = 236, bh = 86, R = [0, 0, 40, 40], box = RR(bx, by, bw, bh, R, H);
        const inBox = (px, py) => {                                   // inside the rounded clip?
            if (px < bx || px > bx + bw || py < by || py > by + bh) return false;
            if (py > by + bh - 40) { const cx = px < bx + 40 ? bx + 40 : px > bx + bw - 40 ? bx + bw - 40 : px; return Math.hypot(px - cx, py - (by + bh - 40)) <= 40; }
            return true;
        };
        if (!emissive) GLBuildingModel.gradPoly(B, box, bx, by, bx, by + bh, [[0, '#2b2730'], [1, '#4a3a33']]);
        else B.color('rgba(255,196,120,.22)').poly(box);
        for (let i = 0; i < 7; i++) {
            const mx = bx + 24 + i * 31, my = by + 50 + Math.sin(i / 6 * Math.PI) * 12;
            B.color(emissive ? 'rgba(255,214,150,.55)' : ['#e9d3a6', '#1c1a1f', '#b0475f', '#f3ece0', '#2f5a4d', '#7b3fa0', '#e9d3a6'][i]).disc(mx, my, 7, H, M, 20);
            if (!emissive) B.color('#efe4d6').disc(mx, my - 2, 2.4, H, M, 10);
        }
        B.color(emissive ? '#fff2cf' : '#d9b77a');
        for (let i = 0; i < 34; i++) {
            const px = bx + 8 + (i * 53 % 220), py = by + 6 + (i * 29 % 70), s = emissive ? 1.6 : 1;
            const q = clipConvex([p(px, py), p(px + s, py), p(px + s, py + s), p(px, py + s)], box);
            if (q.length >= 3 && (inBox(px, py) || inBox(px + s, py + s))) B.poly(q);
        }
        if (!emissive) {
            B.color('rgba(29,32,40,.9)');
            for (let i = 1; i < 8; i++) {
                const xx = bx + bw * i / 8, r = 40, cxr = xx < bx + r ? bx + r : xx > bx + bw - r ? bx + bw - r : xx;
                const yb = by + bh - r + Math.sqrt(Math.max(0, r * r - (xx - cxr) * (xx - cxr)));
                seg(xx, by, xx, yb, 2);
            }
        }
        B.color(emissive ? 'rgba(237,187,123,.4)' : T.steel).line(box, emissive ? 1 : 3, true, K);
        if (!emissive) {
            B.color('rgba(208,172,114,.7)').line(RR(bx + 3, by + 3, bw - 6, bh - 6, [0, 0, 37, 37], H), 1, true, K);
            // brass rules either side of the roof's wordmark
            B.color('rgba(208,172,114,.40)'); seg(x + 250, y + 566, x + 349, y + 566, .8); seg(x + 551, y + 566, x + 650, y + 566, .8);
        }
    }

    /** "Enni Cole" in script on the roof, between the brass rules */
    function wordmark(b, B, H, emissive) {
        B.color(emissive ? 'rgba(255,230,173,.88)' : T.goldHi);
        GLText.quad(B, GLText.entry('Enni Cole', 35, 'Great Vibes'), b.x + 450, b.y + 566, H, M);
    }

    /** The canopy over the door: dark steel, a gold edge, the script name and the departments under it */
    function canopy(b, B, H, emissive) {
        const t = b.attachedTransition, cx = t.x + t.w / 2, sy = t.y - 22, z = H * .30;
        const outline = RR(cx - 99, sy - 10, 198, 54, [8, 8, 27, 27], z);
        if (!emissive) {
            GLBuildingModel.gradPoly(B, outline, cx, sy - 10, cx, sy + 44, [[0, '#20242b'], [1, '#0f131b']]);
            B.color(T.gold).line(outline, 1.7, true, GLB_LINE.SCALE_K);
            B.color('rgba(221,192,143,.28)').line(RR(cx - 94, sy - 5, 188, 43, [5, 5, 23, 23], z), .8, true, GLB_LINE.SCALE_K);
        } else B.color('rgba(245,205,143,.70)').line(outline, 1, true, GLB_LINE.SCALE_K);
        B.color(emissive ? 'rgba(255,230,173,.96)' : T.goldHi);
        GLText.quad(B, GLText.entry('Enni Cole', 38, 'Great Vibes'), cx, sy + 12, z, M);
        if (!emissive) {
            B.color('#bba889');
            GLText.quad(B, GLText.entry('F A S H I O N  ·  F O O D  ·  H O M E  ·  T E C H', 6.2, 'Montserrat'), cx, sy + 33, z, M);
        }
    }

    /** Per frame: the night glow follows Canvas's own curve (clamp(dark * 0.95, 0.12, 0.78)) */
    function update(b, r) {
        const dark = typeof game.getAmbientDarkness === 'function' ? game.getAmbientDarkness() : game.dayCycle().darkness;
        r.glow.alpha = Math.max(0.12, Math.min(0.78, dark * 0.95));
    }

    return { build, update };
})();
