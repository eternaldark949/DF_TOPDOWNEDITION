// GL engine: the Silver Queen (buildings/silver-queen.js), built once as GPU geometry. Its walls,
// window grid, pilasters, ledges and the grand arched window; the portico with its terrace, sign,
// lantern columns and lamp posts; the lavender roofs with the moon garden, the reflecting pool, the
// eclipse pad, the penthouse tier, the spire and its floating crown; the marble forecourt; and the
// night: lit rooms, uplights, verandas, marquee bulbs, fairy lights, mist, the crown's glow and two
// searchlights. Heights up to the roof lean as its Canvas code leans them (_sqK: linear to the roof,
// lean mode 0), above it in true perspective (mode 1). What Canvas decided per frame (which walls
// face the camera, the zoom detail, the dark, the portico fading over the player, the wind in the
// cabanas, twinkles, chases, drifts, the turning crown) is the shader's (GLB_ANIM.SQ_*, 21-24).
const GLSilverQueen = (() => {
    const A = GLB_ANIM, SK = GLB_LINE.SCALE_K;
    // SQ_LIGHT programs (gl/building-mesh.js sqLight)
    const L = { FACE: 1, FACE_PULSE: 2, FACE_RIM: 3, BAL_SLAB: 4, BAL_WARM: 5, BAL_TOP: 6, BAL_RIM: 7, PORT: 8, PORT_FADE: 9, MARQUEE: 10, LANTERN: 11,
                PORT_REL: 12, POST: 13, ROOF: 14, ROOF_FLICK: 15, CHASE: 16, FAIRY: 17, POOL: 18, CROWN: 19, RING: 20, BEACON: 21, BEAM: 22, VEIL: 23,
                RING_DAY: 24, PORTICO: 25, FACE_DAY: 26 };
    // SQ_MOVE kinds
    const MV = { SPIN: 1, ORIENT: 2, RADIAL: 3, DRIFT: 4, GLINT: 5, CURTAIN: 6, RIPPLE: 7, WOBBLE: 8, BEAM: 9, SWEEP: 10 };
    const FH = () => CONFIG.BUILDINGS.FLOOR_HEIGHT;
    const TAU = Math.PI * 2;
    const flick = (base, rate) => Math.round(base * 100) * 100 + Math.round(rate * 10);   // ROOF_FLICK's c

    // ---------------- helpers ----------------
    let H = 126, C0 = 683, Q = (x, y, z) => [x, y, z, 0];
    /** the lean scale at height z, as _sqK (at build time: for the few pieces Canvas sized in screen px) */
    const kz = z => z <= H ? 1 + z / (C0 - H) : C0 / (C0 - Math.min(z, C0 * 0.86));
    const rgba = (r, g, b, a) => [r / 255, g / 255, b / 255, a];
    const stopColor = (stops, t) => {
        if (t <= stops[0][0]) return GLColor.parse(stops[0][1]);
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [ta, ca] = stops[i - 1], [tb, cb] = stops[i]; return GLColor.mix(ca, cb, tb > ta ? (t - ta) / (tb - ta) : 1); }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** A convex polygon with a gradient: T(point) → t along it, stops [[t, colour]]; cut into bands so each is linear */
    function grad(B, pts, T, stops) {
        const clip = (poly, t, above) => {
            const out = [];
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length], ta = T(a) - t, tb = T(b) - t, ia = above ? ta >= 0 : ta <= 0, ib = above ? tb >= 0 : tb <= 0;
                if (ia) out.push(a);
                if (ia !== ib) { const s = ta / (ta - tb); out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3]]); }
            }
            return out;
        };
        const cuts = [-Infinity, ...stops.map(s => s[0]), Infinity];
        for (let i = 0; i < cuts.length - 1; i++) {
            let band = pts;
            if (cuts[i] > -Infinity) band = clip(band, cuts[i], true);
            if (cuts[i + 1] < Infinity && band.length) band = clip(band, cuts[i + 1], false);
            if (band.length >= 3) B.polyColors(band, band.map(q => stopColor(stops, T(q))));
        }
    }
    /** A convex fill whose vertices carry params in the stroke attributes (SQ_MOVE) */
    function fillP(B, pts, p1, p2, concave = false) {
        const base = B.n;
        for (const p of pts) B.vertex(p, p1 || p, p2 || p);
        if (!concave) { for (let i = 1; i < pts.length - 1; i++) B.index.push(base, base + i, base + i + 1); return; }
        const flat = []; for (const p of pts) flat.push(p[0], p[1]);
        for (const i of GLEarcut(flat)) B.index.push(base + i);
    }
    /** Canvas's glow sprite (drawGlow, core 0): colour rgb at alpha a in the middle, nothing at r; linear */
    function glow(B, x, y, z, mode, r, rgb, a, p1, p2, segs = 24) {
        const base = B.vertex([x, y, z, mode], p1, p2, 0, 0, 0, rgba(rgb[0], rgb[1], rgb[2], a)), e = rgba(rgb[0], rgb[1], rgb[2], 0);
        for (let i = 0; i < segs; i++) { const t = i / segs * TAU; B.vertex([x + Math.cos(t) * r, y + Math.sin(t) * r, z, mode], p1, p2, 0, 0, 0, e); }
        for (let i = 0; i < segs; i++) B.index.push(base, base + 1 + i, base + 1 + (i + 1) % segs);
    }
    /** A disc (or an annulus from radii[0]) coloured per vertex by col(dx, dy) → straight rgba, rings at radii */
    function field(B, x, y, z, mode, radii, col, segs = 24, hole = false) {
        const base = B.n;
        if (!hole) B.vertex([x, y, z, mode], undefined, undefined, 0, 0, 0, col(0, 0));
        for (const r of radii) for (let j = 0; j < segs; j++) { const t = j / segs * TAU, dx = Math.cos(t) * r, dy = Math.sin(t) * r; B.vertex([x + dx, y + dy, z, mode], undefined, undefined, 0, 0, 0, col(dx, dy)); }
        const r0 = hole ? base : base + 1;
        if (!hole) for (let j = 0; j < segs; j++) B.index.push(base, r0 + j, r0 + (j + 1) % segs);
        for (let i = 1; i < radii.length; i++) for (let j = 0; j < segs; j++) {
            const a = r0 + (i - 1) * segs + j, b = r0 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
            B.index.push(a, c, d, a, d, b);
        }
    }
    const hexPts = (x, y, r, rot = 0, sy = 1) => { const p = []; for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r * sy]); } return p; };
    const arcPts = (x, y, r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return p; };
    const at3 = (pts, z, mode) => pts.map(q => [q[0], q[1], z, mode]);
    /** sqCrescent's outline: radius R, horns along rot, body thick × R */
    function crescentPts(cx, cy, R, rot, thick = 0.5, a = 0.9, n = 24) {
        const m = R * (1 - thick), d = (R * R - m * m) / (2 * (m + R * Math.cos(a))), r2 = d + m, h = Math.atan2(R * Math.sin(a), R * Math.cos(a) - d);
        const pts = arcPts(cx, cy, R, rot + a, rot + TAU - a, n), ix = cx + Math.cos(rot) * d, iy = cy + Math.sin(rot) * d;
        for (let i = 1; i < n; i++) { const t = rot - h - (TAU - 2 * h) * i / n; pts.push([ix + Math.cos(t) * r2, iy + Math.sin(t) * r2]); }
        return pts;
    }
    /** Closed outline stroked as quads in its own plane (half width hw, world): for shapes that turn with SQ_MOVE */
    function outlineQuads(B, pts, hw, z, mode, p1) {
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * hw, ny = (b[0] - a[0]) / L * hw;
            fillP(B, [[a[0] - nx, a[1] - ny, z, mode], [b[0] - nx, b[1] - ny, z, mode], [b[0] + nx, b[1] + ny, z, mode], [a[0] + nx, a[1] + ny, z, mode]], p1);
        }
    }
    /** A segment with a colour at each end (Canvas's linear gradient along a stroke), mid vertices for its straight-colour lerp */
    function gradSeg(B, a, b, width, ca, cb, n = 4, flags = 0) {
        const P = [], Cs = [];
        for (let i = 0; i <= n; i++) { const s = i / n; P.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3]]); Cs.push(GLColor.mix(ca, cb, s)); }
        const hw = width / 2;
        for (let i = 0; i < n; i++) {
            const p = P[i], q = P[i + 1], pp = i ? P[i - 1] : p, nq = i + 2 <= n ? P[i + 2] : q;
            const v0 = B.vertex(p, pp, q, -1, hw, flags, Cs[i]), v1 = B.vertex(p, pp, q, 1, hw, flags, Cs[i]);
            const v2 = B.vertex(q, p, nq, 1, hw, flags, Cs[i + 1]), v3 = B.vertex(q, p, nq, -1, hw, flags, Cs[i + 1]);
            B.index.push(v0, v1, v2, v0, v2, v3);
        }
    }
    /** A segment clipped to a rect (Liang–Barsky); null when outside */
    function clipSeg(x0, y0, x1, y1, rx, ry, rw, rh) {
        let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
        for (const [p, q] of [[-dx, x0 - rx], [dx, rx + rw - x0], [-dy, y0 - ry], [dy, ry + rh - y0]]) {
            if (p === 0) { if (q < 0) return null; continue; }
            const r = q / p;
            if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
        return [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
    }
    /** Convex polygon clipped by a convex polygon (Sutherland–Hodgman) */
    function clipConvex(subj, clipPoly) {
        let area = 0; for (let i = 0, j = clipPoly.length - 1; i < clipPoly.length; j = i++) area += (clipPoly[j][0] - clipPoly[i][0]) * (clipPoly[j][1] + clipPoly[i][1]);
        const sgn = area > 0 ? 1 : -1;
        let out = subj;
        for (let i = 0; i < clipPoly.length && out.length; i++) {
            const a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length], inp = out; out = [];
            const side = p => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * sgn;
            for (let j = 0; j < inp.length; j++) {
                const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
                if (sp <= 0) out.push(p);
                if ((sp <= 0) !== (sq <= 0)) { const s = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]); }
            }
        }
        return out;
    }
    /** A section's roof outline (its rounded corners), inset */
    function roofPts(b, si, inset = 0) {
        const s = b.sections[si], r = (b._roundSec && b._roundSec[si]) || [0, 0, 0, 0];
        return GLBuildingBuilder.roundRectPts(b.x + s.x + inset, b.y + s.y + inset, s.w - inset * 2, s.h - inset * 2, r.map(v => Math.max(0, v - inset))).map(p => [p[0], p[1]]);
    }
    /** Clip rect of a roof (pen text state: the shader's vClip), keep = true keeps inside it */
    const clipRect = (B, x, y, w, h, keep) => B.text(-1, x, y, (keep ? -1 : 1) * (Math.round(w) * 4096 + Math.round(h)));

    // ---------------- the building ----------------
    function build(b) {
        H = b._sqH(); C0 = leanCamHeight(); Q = (x, y, z) => [x, y, z, z <= H + 1e-6 ? 0 : 1];
        const o = { H, base: GLBuildingBuilder.scratch(H, 0), top: GLBuildingBuilder.scratch(H, 1), glow: GLBuildingBuilder.scratch(H, 2) };
        const addFace = f => { const i = o.top.addFace(f); o.base.addFace(f); o.glow.addFace(f); return i; };
        const faces = b._leanFaces();
        o.faces = faces; o.faceIds = faces.map(addFace);
        const g = b._sqPortico();
        if (g) o.pf = { front: addFace({ nx: 0, ny: 1, x1: g.x0, y1: g.yb }), west: addFace({ nx: -1, ny: 0, x1: g.x0, y1: g.yf }), east: addFace({ nx: 1, ny: 0, x1: g.x1, y1: g.yf }),
                        marquee: addFace({ nx: 0, ny: 1, x1: g.x0, y1: g.yb - 2 }) };
        const ph = penthouse(b);
        o.phFaces = ph.sides.map(([a, c, nx, ny]) => ({ a, c, id: addFace({ nx, ny, x1: a[0], y1: a[1] }) }));
        drawBase(b, o);
        drawTop(b, o);
        drawGlow(b, o);
        return o;
    }

    // ---------------- base: the shadow, and the forecourt (_sqDrawGround) ----------------
    function drawBase(b, o) {
        const B = o.base, Z = (x, y) => [x, y, 0, 0];
        B.color('rgba(0, 0, 0, 0.5)');
        b.sections.forEach((s, si) => B.poly(roofPts(b, si).map(p => Z(p[0] + b.facadeDepth, p[1] + b.facadeDepth))));
        B.color('rgba(10, 10, 15, 0.3)');
        b.sections.forEach(s => B.rect(b.x + s.x - 5, b.y + s.y - 5, s.w + 10, s.h + 10));
        const g = b._sqPortico();
        if (!g) return;
        const w = g.x1 - g.x0, d = SQ_PORTICO.colLine + 8, T = SQ_THEME, E = SQ_ENTRY;
        B.color('#231a44').rect(g.x0, g.yf, w, d);
        B.color('rgba(205,190,245,0.12)');
        for (let x = g.x0 + 17; x < g.x1; x += 17) B.seg(Z(x, g.yf), Z(x, g.yf + d), 1);
        for (let y = g.yf + 17; y < g.yf + d; y += 17) B.seg(Z(g.x0, y), Z(g.x1, y), 1);
        const yb = g.yb + 6;
        grad(B, [Z(g.x0, g.yf), Z(g.x1, g.yf), Z(g.x1, yb), Z(g.x0, yb)], p => (p[1] - g.yf) / (yb - g.yf),
             [[0, 'rgba(6, 2, 16, 0.55)'], [0.85, 'rgba(6, 2, 16, 0.35)'], [1, 'rgba(6, 2, 16, 0)']]);
        B.color('rgba(6, 2, 16, 0.45)'); for (const c of g.cols) B.ellipse(c.x + 1.5, c.y + 2, 7.5, 4, 0);
        const ys = g.yf + d;                                                            // steps
        B.color('#3b3452').rect(g.x0 - 3, ys, w + 6, 5);
        B.color('#2f2943').rect(g.x0 - 6, ys + 5, w + 12, 5);
        B.color('rgba(220,210,245,0.28)').rect(g.x0 - 3, ys, w + 6, 1).rect(g.x0 - 6, ys + 5, w + 12, 1);
        const rw = 40, rx = g.dx - rw / 2, rl = 132;                                    // carpet
        B.color('#3a1d63').rect(rx, g.yf, rw, rl);
        B.color('#56309a').rect(rx + 3, g.yf, rw - 6, rl);
        B.color('rgba(217,191,134,0.6)').seg(Z(rx + 5, g.yf), Z(rx + 5, g.yf + rl), 1).seg(Z(rx + rw - 5, g.yf), Z(rx + rw - 5, g.yf + rl), 1);
        for (const s of [-1, 1]) {                                                      // velvet rope on gold stanchions
            const xs = g.dx + s * E.ropeX, ropes = [];
            for (let i = 0; i < E.ropeY.length - 1; i++) { const y0 = g.yf + E.ropeY[i], y1 = g.yf + E.ropeY[i + 1]; ropes.push(GLBuildingBuilder.quadPts(Z(xs, y0), [xs + s * 3, (y0 + y1) / 2], Z(xs, y1), 10)); }
            B.color('#5a1fa8'); for (const r of ropes) B.line(r, 1.8);
            B.color('rgba(200,160,255,0.5)'); for (const r of ropes) B.line(r, 0.6);
            for (const yo of E.ropeY) {
                const y = g.yf + yo;
                B.color('#6b5023').disc(xs, y, 3.4, 0, 0, 16); B.color(T.gold).disc(xs, y, 2.3, 0, 0, 14); B.color(T.goldHi).disc(xs - 0.7, y - 0.7, 0.9, 0, 0, 10);
            }
        }
        const px = g.dx + E.podium[0], py = g.yf + E.podium[1];                         // podium and guest book
        B.color(T.bay).rect(px - 7, py - 5, 14, 10);
        B.color(T.gold).rectLine(px - 7, py - 5, 14, 10, 1, 0, 0, 0);
        B.color(T.trim).rect(px - 4, py - 3, 8, 3);
        for (const [ox, oy] of E.posts) {                                               // lamp post footings
            B.color('rgba(0,0,0,0.35)').ellipse(g.dx + ox + 2, g.yf + oy + 2, 6, 4, 0);
            B.color(T.bay).disc(g.dx + ox, g.yf + oy, 4, 0, 0, 16);
            B.color(T.gold).circleLine(g.dx + ox, g.yf + oy, 4, 1, 0, 0, 0);
        }
    }

    // ---------------- top: walls, the portico, the sign, columns, roofs, the crown ----------------
    function drawTop(b, o) {
        const B = o.top, wall = b.colors.wall;
        o.faces.forEach((f, i) => {
            const F = new GLFace(f, H);
            B.face(o.faceIds[i]);
            const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : f.side === 'C' ? Math.round(6 + (f.ny > 0 ? 12 : 14) * f.ny) : 6;
            const c0 = darkenHex(wall, 6), c1 = shade >= 0 ? lightenHex(wall, shade) : darkenHex(wall, -shade);
            B.polyColors([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], [c0, c0, c1, c1]);
            B.color('rgba(0,0,0,0.35)').line([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], 1, true);
            windows(b, B, f, F, false);
            face(b, B, f, F, false);
            B.reset();
        });
        portico(b, B, o);
        sign(b, B);
        columns(b, B);
        roof(b, B, o);
        crown(b, B, false);
    }

    /** The window grid (Canvas _drawFaceWindows, Silver Queen: 30 px bays, lavender rooms, the entrance mask) */
    function windows(b, B, f, F, emissive) {
        if (f.side === 'C') return;
        const floors = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS), cols = Math.max(1, Math.floor(F.L / 30)), mask = b._sqWindowMask(f), list = [];
        for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) {
            if (mask && mask(fl, (c + 0.5) / cols)) continue;
            list.push({ fl, c, u0: (c + 0.25) / cols, u1: (c + 0.75) / cols, v0: (fl + 0.28) / floors, v1: (fl + 0.78) / floors });
        }
        const q = w => B.poly([F.at(w.u0, w.v0), F.at(w.u1, w.v0), F.at(w.u1, w.v1), F.at(w.u0, w.v1)]);
        const sill = (w, vv, width) => { const a = F.at(w.u0 - 0.06 / cols, vv), c = F.at(w.u1 + 0.06 / cols, vv);
            B.seg([a[0] + f.nx * 1.6, a[1] + f.ny * 1.6, a[2], 0], [c[0] + f.nx * 1.6, c[1] + f.ny * 1.6, c[2], 0], width); };
        if (!emissive) {
            B.gate(floors * 1.6);
            B.color('rgba(23,0,92,0.9)'); for (const w of list) q(w);
            B.color('rgb(176, 158, 236)').anim(A.SKY); for (const w of list) q(w);
            for (const w of list) { B.anim(A.SHEEN, (w.u0 + w.u1) / 2, 0.7 + 0.3 * (w.fl % 2)); q(w); }
            B.anim();
            B.gate(floors * 2.4, 1);
            B.color(b.sills.shade); for (const w of list) sill(w, w.v0 - 0.5 / floors, 1.2);
            B.color(b.sills.lip); for (const w of list) sill(w, w.v0 - 0.2 / floors, 1);
            B.gate();
            return;
        }
        const seed = b._seed || Math.round(b.x + b.y), sSeed = seed + f.section * 31 + f.side.charCodeAt(0);
        B.gate(floors * 1.6);
        const lit = [], lav = [], tv = [], changing = [];
        for (const w of list) {
            const idx = w.fl * 57 + w.c * 13;
            if (_bldHash(seed, w.fl + w.c) > 0.93) { changing.push({ w, idx }); continue; }
            const h = _bldHash(sSeed, idx);
            if (!(h < 0.5)) continue;
            (h < 0.06 ? tv : h > 0.36 ? lav : lit).push(w);
        }
        B.color(b.colors.windowLit || '#ffe2a8'); for (const w of lit) q(w);
        B.color('#d9c2ff'); for (const w of lav) q(w);
        B.color(b.colors.windowLit || '#ffe2a8'); for (const { w, idx } of changing) { B.anim(A.SQ_WINDOW, sSeed, idx); q(w); }
        B.color('#9ec8ff');
        for (const w of tv) { B.anim(A.TV, 0, 0, w.c); q(w); }
        for (const { w, idx } of changing) { B.anim(A.WINDOW_TV, sSeed, idx, w.c); q(w); }
        B.anim();
        B.gate(floors * 2.4, 1).additive().anim(A.RIM).color(GLColor.alpha(b.colors.accent, 0.5));
        for (const w of list) sill(w, w.v0 - 0.2 / floors, 1);
        B.additive(false).anim().gate();
    }

    /** LandmarkKit.ledge on one face edge, under the Silver Queen's lean; returns its lip */
    function ledge(B, e, z, out, th, top, band, lip) {
        const zb = Math.max(0, z - th), ax = e.a[0] + e.nx * out, ay = e.a[1] + e.ny * out, bx = e.b[0] + e.nx * out, by = e.b[1] + e.ny * out;
        B.color(band).quad(Q(ax, ay, zb), Q(bx, by, zb), Q(bx, by, z), Q(ax, ay, z));
        B.color(top).quad(Q(e.a[0], e.a[1], z), Q(e.b[0], e.b[1], z), Q(bx, by, z), Q(ax, ay, z));
        if (lip) B.color(lip).seg(Q(ax, ay, z), Q(bx, by, z), 0.9);
        return [Q(ax, ay, z), Q(bx, by, z)];
    }
    const LEDGES = h => [[0.025 * h, 2.5, 0.025 * h, '#3a2f5c', SQ_THEME.ground, 'rgba(217, 191, 134, 0.35)'],
                         [(SQ_PORTICO.floors * FH() / h + 0.012) * h, 3, 0.022 * h, '#6b5cae', SQ_THEME.roof, 'rgba(236, 226, 255, 0.55)'],
                         [h, 4, 0.045 * h, '#ddd8ee', '#9d95bd', 'rgba(255, 250, 255, 0.7)']];

    /** _sqFace: pilasters, ledges, caps, dentils, the arch; at night the uplights, the crown's downwash, the rims */
    function face(b, B, f, F, emissive) {
        const corner = f.side === 'C', pil = corner ? { us: [], w: 0, len: F.L } : b._sqPilasters(f), T = SQ_THEME, lod0 = 0;
        const vBelt = SQ_PORTICO.floors * FH() / H, edge = { a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny };
        const ex = f.x2 - f.x1, ey = f.y2 - f.y1, sub = (u0, u1, v0, v1) => [F.at(u0, v0), F.at(u1, v0), F.at(u1, v1), F.at(u0, v1)];
        const [lBase, lBelt, lCrown] = LEDGES(H);
        B.gate(4);
        if (!emissive) {
            B.anim(A.SQ_LIGHT, L.FACE_DAY);
            ledge(B, edge, ...lBase);
            const anchors = pil.us.map(u => ({ x: f.x1 + ex * u, y: f.y1 + ey * u }));
            const z0 = 0.02 * H, z1 = 0.95 * H, tx = -f.ny * 4, ty = f.nx * 4;
            B.color(T.silver);
            for (const a of anchors) { const fx = a.x + f.nx * 3, fy = a.y + f.ny * 3; B.quad(Q(fx - tx, fy - ty, z0), Q(fx + tx, fy + ty, z0), Q(fx + tx, fy + ty, z1), Q(fx - tx, fy - ty, z1)); }
            B.color(T.silverHi);
            for (const a of anchors) { const fx = a.x + f.nx * 3, fy = a.y + f.ny * 3; B.seg(Q(fx + tx, fy + ty, z0), Q(fx + tx, fy + ty, z1), 0.8); }
            B.gate(4, lod0).color('rgba(40,30,62,0.4)');
            for (const u of pil.us) { const [u0, u1] = b._sqSpan(pil, u); for (const tt of [0.28, 0.72]) { const uu = u0 + (u1 - u0) * tt; B.seg(F.at(uu, 0.05), F.at(uu, 0.92), 0.6); } }
            B.gate(4);
            const cw = pil.w * 0.3;
            B.color(T.silverHi); for (const u of pil.us) { const [u0, u1] = b._sqSpan(pil, u); B.poly(sub(Math.max(0, u0 - cw), Math.min(1, u1 + cw), 0.92, 0.955)); }
            B.color('#8a82a8'); for (const u of pil.us) { const [u0, u1] = b._sqSpan(pil, u); B.poly(sub(Math.max(0, u0 - cw), Math.min(1, u1 + cw), 0, 0.03)); }
            ledge(B, edge, ...lBelt);
            ledge(B, edge, ...lCrown);
            if (!corner) {
                const n = Math.floor(pil.len / 6);
                B.gate(4, lod0).color('rgba(38,28,58,0.55)');
                for (let i = 0; i < n; i++) { const u = (i + 0.3) / n; B.poly(sub(u, u + 0.4 / n, 0.935, 0.952)); }
                B.gate(4);
            }
            if (f._sqEntrance) arch(b, B, f, F, false);
            B.anim().gate();
            return;
        }
        B.additive(true);
        // the ledges' lips catch the lamps' violet
        B.anim(A.SQ_LIGHT, L.FACE_RIM).color(GLColor.alpha(b.colors.accent, 0.6));
        for (const l of [lBase, lBelt, lCrown]) { const z = l[0], o = l[1]; B.seg(Q(f.x1 + f.nx * o, f.y1 + f.ny * o, z), Q(f.x2 + f.nx * o, f.y2 + f.ny * o, z), 1.2); }
        if (!corner) {
            const v0 = f._sqEntrance ? vBelt : 0, v1 = Math.min(1, v0 + 0.62), vT = p => (p[2] / H - v0) / (v1 - v0);
            if (f._sqEntrance) {                                                        // violet wash rising from the portico
                const g = b._sqPortico(), rr = Math.max(60, pil.len * 0.55);
                B.anim(A.SQ_MOVE, MV.RADIAL, rr, L.FACE).color('rgba(164,105,255,0.42)');
                fillP(B, sub(0, 1, vBelt, 1), [g.dx, f.y1 + (f.y2 - f.y1) * ((g.dx - f.x1) / (f.x2 - f.x1 || 1)), vBelt * H]);
            }
            B.anim(A.SQ_LIGHT, L.FACE);
            for (const u of pil.us) {                                                   // uplight cones and their hot stripes
                const [u0, u1] = b._sqSpan(pil, u), um = (u0 + u1) / 2, w = u1 - u0;
                grad(B, [F.at(um - w * 0.7, v0), F.at(um + w * 0.7, v0), F.at(Math.min(1, um + w * 2.8), v1), F.at(Math.max(0, um - w * 2.8), v1)], vT,
                     [[0, 'rgba(196,160,255,0.6)'], [0.35, 'rgba(164,105,255,0.24)'], [1, 'rgba(164,105,255,0)']]);
            }
            for (const u of pil.us) {
                const [u0, u1] = b._sqSpan(pil, u), um = (u0 + u1) / 2, w = u1 - u0;
                grad(B, sub(um - w * 0.2, um + w * 0.2, v0, v1), vT, [[0, 'rgba(255,240,255,0.55)'], [0.5, 'rgba(255,240,255,0)']]);
            }
            B.anim(A.SQ_LIGHT, L.FACE_PULSE, b._seed || 0);                             // the crown: a downwash under the cornice
            grad(B, sub(0, 1, 0.84, 1), p => (1 - p[2] / H) / 0.16, [[0, 'rgba(200,168,255,0.5)'], [1, 'rgba(164,105,255,0)']]);
            B.color('rgba(236,226,255,0.95)').seg(F.at(0, 0.99), F.at(1, 0.99), 1.4);
            B.anim(A.SQ_LIGHT, L.FACE);
            if (f._sqEntrance) arch(b, B, f, F, true);
        }
        B.anim().additive(false).gate();
    }

    /** The grand arched window over the portico: sunburst fanlight, hexagon keystone */
    function arch(b, B, f, F, emissive) {
        const g = b._sqPortico(), L0 = f.x2 - f.x1, um = (g.dx - f.x1) / L0, hw = 54 / L0;
        const v0 = (SQ_PORTICO.floors * FH() + 4) / H, vs = 7.2 * FH() / H, v1 = 9.1 * FH() / H;
        const arc = a => F.at(um + hw * Math.cos(a), vs + (v1 - vs) * Math.sin(a));
        const outline = [F.at(um - hw, v0), F.at(um + hw, v0)]; for (let i = 0; i <= 12; i++) outline.push(arc(i / 12 * Math.PI));
        const spring = F.at(um, vs), key = F.at(um, v1), kk = kz(key[2]);
        const hex = hexPts(key[0], key[1], 4.5 / kk, Math.PI / 6, 0.8).map(p => [p[0], p[1], key[2], 0]);
        const rays = () => { for (let i = 1; i < 8; i++) B.seg(spring, arc(i / 8 * Math.PI), B._w); };
        if (!emissive) {
            B.color('#16122a').poly(outline);
            B.color(SQ_THEME.silver).line(outline, 1.6, true);
            B.color('rgba(190,182,220,0.7)'); B._w = 0.8;
            B.seg(F.at(um - hw, vs), F.at(um + hw, vs), 0.8);
            for (const t of [-1 / 3, 1 / 3]) B.seg(F.at(um + hw * t, v0), F.at(um + hw * t, vs), 0.8);
            rays();
            B.color(SQ_THEME.silverHi).poly(hex);
        } else {
            grad(B, outline, p => (p[2] / H - v0) / (v1 - v0), [[0, 'rgba(255,205,160,0.28)'], [0.55, 'rgba(190,150,255,0.34)'], [1, 'rgba(164,105,255,0.5)']]);
            B.color('rgba(226,210,255,0.85)'); B._w = 1; rays();
            B.seg(F.at(um - hw, vs), F.at(um + hw, vs), 1);
            B.color('rgba(214,190,255,0.9)').line(outline, 1.4, true);
            B.color('rgba(240,228,255,0.95)').poly(hex);
        }
    }

    /** _sqWingedHex's shapes in a plane: the two wings and the hexagon */
    function wingPts(x, y, r, s) {
        const p = [[x + s * r * 0.7, y - r * 0.55], [x + s * r * 2.5, y - r * 0.55]];
        const c = GLBuildingBuilder.quadPts([x + s * r * 2.5, y - r * 0.55, 0, 0], [x + s * r * 1.4, y - r * 0.2], [x + s * r * 0.8, y + r * 0.62], 10);
        for (let i = 1; i < c.length; i++) p.push([c[i][0], c[i][1]]);
        return p;
    }

    /** The portico: fascia toward the camera and its roof terrace, faded while the player stands under it */
    function portico(b, B, o) {
        const g = b._sqPortico();
        if (!g) return;
        const T = SQ_THEME, zc = g.z, zf = zc - 4, z = zc, P = (x, y) => [x, y, z, 0], w = g.x1 - g.x0, d = SQ_PORTICO.depth;
        B.anim(A.FADE).color('#a79fc8');
        B.face(o.pf.front).quad(Q(g.x0, g.yb, zf), Q(g.x1, g.yb, zf), Q(g.x1, g.yb, zc), Q(g.x0, g.yb, zc));
        B.face(o.pf.west).quad(Q(g.x0, g.yf, zf), Q(g.x0, g.yb, zf), Q(g.x0, g.yb, zc), Q(g.x0, g.yf, zc));
        B.face(o.pf.east).quad(Q(g.x1, g.yf, zf), Q(g.x1, g.yb, zf), Q(g.x1, g.yb, zc), Q(g.x1, g.yf, zc));
        B.face(-1);
        const pl = GLBuildingModel.plane(B, z, 0);
        pl.rect(g.x0, g.yf, w, d, T.plum);
        pl.rect(g.x0 + 5, g.yf + 4, w - 10, d - 9, T.terrace);
        B.gate(0, 0).color('rgba(210,195,250,0.08)');                                  // marble inlay
        for (let x = g.x0 - d; x < g.x1 + d; x += 14) for (const s of [[x, g.yf, x + d, g.yf + d], [x + d, g.yf, x, g.yf + d]]) {
            const c = clipSeg(...s, g.x0 + 5, g.yf + 4, w - 10, d - 9);
            if (c && Math.hypot(c[2] - c[0], c[3] - c[1]) > 0.01) B.line([P(c[0], c[1]), P(c[2], c[3])], 1, false, SK);
        }
        B.gate();
        pl.rectLine(g.x0 + 1, g.yf + 1, w - 2, d - 2, 2, '#9d95bd');
        pl.segs([[g.x0 + 3, g.yb - 3, g.x1 - 3, g.yb - 3], [g.x0 + 3, g.yf + 3, g.x0 + 3, g.yb - 3], [g.x1 - 3, g.yf + 3, g.x1 - 3, g.yb - 3]], 1.1, '#d8d2ea');
        B.gate(0, 0); for (let x = g.x0 + 7; x < g.x1 - 5; x += 5) pl.rect(x - 0.6, g.yb - 4.6, 1.2, 3.2, '#bdb6d6'); B.gate();
        for (const s of [-1, 1]) {                                                      // winged hexagon lanterns either side of the sign
            const x = g.dx + s * SQ_ENTRY.hexX, y = g.yf + d * 0.5, r = 9;
            B.color(T.trim).poly(at3(wingPts(x, y, r, -1), z, 0), true).poly(at3(wingPts(x, y, r, 1), z, 0), true).poly(at3(hexPts(x, y, r + 1.5), z, 0));
            B.color(T.glass).poly(at3(hexPts(x, y, r - 1.5), z, 0));
        }
        for (const o2 of SQ_PORTICO.pilasters) pl.rect(g.dx + o2 - 5, g.yf + 1, 10, 3, '#7d75a0');
        B.anim();
    }

    /** The script sign on the portico's roof (_paintSign): the backdrop and bloom when close, flickering, faded with the portico */
    function sign(b, B) {
        const g = b._sqPortico(), E = b._entrance();
        if (!g || !E || !b.attachedSign) return;
        const text = b.attachedSign.text, size = b.attachedSign.fontSize || 45, x = E.cx, y = g.yf + SQ_PORTICO.depth * 0.5, z = g.z;
        const e = GLText.entry(text, size, 'Great Vibes', true), seed = (b.x + b.y) * 7, lamp = b.colors.accent, rgb = GLColor.parse(lamp);
        const S = (mask, fl) => B.anim(A.SQ_SIGN, seed, mask, fl);
        S(1, 0).color('#000'); GLText.quad(B, e, x, y, z, 0, 1, 1, 3);                   // close: the baked layers
        S(1, 1).color(lamp); GLText.quad(B, e, x, y, z, 0, 2, 1);
        S(2, 1).color(lamp); GLText.quad(B, e, x, y, z, 0, 2, 0.6);                      // mid: the core glow (blur 15)
        S(2, 1).color([rgb[0], rgb[1], rgb[2], 1]); GLText.quad(B, e, x, y, z, 0);
        S(3, 1).color('rgba(255, 255, 255, 0.6)'); GLText.quad(B, e, x, y, z, 0);        // the white-hot core
        S(4, 1).color([rgb[0], rgb[1], rgb[2], 1]); GLText.quad(B, e, x, y, z, 0);       // far: flat
        B.anim();
    }

    /** Lantern columns and the triple-globe lamp posts (_sqDrawColumns) */
    function columns(b, B) {
        const g = b._sqPortico();
        if (!g) return;
        const T = SQ_THEME, r = SQ_PORTICO.colR, zT = g.zCol, zC = zT * 0.8, kC = kz(zC);
        B.color('#4c4468'); for (const c of g.cols) B.poly(at3(hexPts(c.x, c.y, r + 2.8), 0, 0));
        B.color('#a49cc6'); for (const c of g.cols) B.line(at3(hexPts(c.x, c.y, r + 2.8), 0, 0), 1, true);
        const band = (c, y0, y1, za, zb, col) => { B.anim(A.SQ_MOVE, MV.ORIENT, 0, 0).color(col); fillP(B, [Q(c.x, c.y + y0, za), Q(c.x, c.y + y0, zb), Q(c.x, c.y + y1, zb), Q(c.x, c.y + y1, za)], [c.x, c.y, 0]); };
        for (const c of g.cols) { band(c, -r, r, 0, zT, T.silver); B.anim().disc(c.x, c.y, r, 0, 0, 16); }
        for (const c of g.cols) band(c, -0.55 * r, 0.15 * r, 0, zT, T.silverHi);
        for (const c of g.cols) band(c, 0.525 * r, 0.975 * r, 0, zT, T.silverDk);
        B.anim(A.SQ_MOVE, MV.ORIENT, 0, 0).color('#d9bf86');
        for (const c of g.cols) fillP(B, [Q(c.x - 0.8 / kC, c.y - 1.15 * r, zC), Q(c.x + 0.8 / kC, c.y - 1.15 * r, zC), Q(c.x + 0.8 / kC, c.y + 1.15 * r, zC), Q(c.x - 0.8 / kC, c.y + 1.15 * r, zC)], [c.x, c.y, 0]);
        B.anim();
        B.color('#e4e0f2'); for (const c of g.cols) B.poly(at3(hexPts(c.x, c.y, r + 1.8), zT, 0));
        B.color('#5b4d86'); for (const c of g.cols) B.poly(at3(hexPts(c.x, c.y, r + 0.2), zT, 0));
        // lamp posts, LAMP_POST_SCALE about each foot: a point d from the foot at z draws as one d' from it at 1.5 z
        const S = LAMP_POST_SCALE, D = C0 - H, dp = (d, zz) => S * d * (1 + zz / D) / (1 + S * zz / D);
        const posts = SQ_ENTRY.posts.map(([ox, oy]) => [g.dx + ox, g.yf + oy]);
        B.color('#3a2a6e'); for (const [x, y] of posts) B.seg(Q(x, y, 0), Q(x, y, S * 26), 2.2 * S);
        B.color(T.gold); for (const [x, y] of posts) B.seg(Q(x + dp(-9, 26), y, S * 26), Q(x + dp(9, 26), y, S * 26), 1.2 * S);
        const globes = []; for (const [x, y] of posts) for (const gx of [-9, 0, 9]) { const zz = gx ? 26 : 30; globes.push([x + dp(gx, zz), y, S * zz, 3.3 * kz(26) * S / kz(S * zz)]); }
        B.color('#f4ecff'); for (const [x, y, zz, rr] of globes) B.disc(x, y, rr, zz, 0, 16);
        B.color('rgba(189,168,238,0.9)'); for (const [x, y, zz, rr] of globes) B.circleLine(x, y, rr, 0.7 * S, zz, 0, 0);
    }

    /** The roofs: lavender slabs, sheen, seams, parapets; fairy lights; garden, pool and pad; the penthouse tier */
    function roof(b, B, o) {
        const T = SQ_THEME, pl = GLBuildingModel.plane(B, H, 0), P = (x, y) => [x, y, H, 0];
        b.sections.forEach((s, si) => {
            const sx = b.x + s.x, sy = b.y + s.y, out = roofPts(b, si), R = (b._roundSec && b._roundSec[si]) || [0, 0, 0, 0];
            grad(B, out.map(p => P(p[0], p[1])), p => ((p[0] - sx) * s.w + (p[1] - sy) * s.h) / (s.w * s.w + s.h * s.h), [[0, T.roof], [1, T.roofLo]]);
            const r1 = Math.max(s.w, s.h) * 0.8;
            B.anim(A.RADIAL, sx + s.w * 0.25, sy + s.h * 0.2, r1).color(`rgba(214,200,255,${0.18 * r1 / (r1 - 10)})`).poly(out.map(p => P(p[0], p[1]))).anim();
            const seams = [];
            for (let gx = 36; gx < s.w; gx += 36) {
                const x = sx + gx, cy = (cx, rr, top) => { const dx = Math.abs(x - cx); return dx < rr ? (top ? -1 : 1) * Math.sqrt(rr * rr - dx * dx) : 0; };
                let y0 = sy, y1 = sy + s.h;
                if (R[0] && x < sx + R[0]) y0 = sy + R[0] + cy(sx + R[0], R[0], true); if (R[1] && x > sx + s.w - R[1]) y0 = sy + R[1] + cy(sx + s.w - R[1], R[1], true);
                if (R[3] && x < sx + R[3]) y1 = sy + s.h - R[3] + cy(sx + R[3], R[3], false); if (R[2] && x > sx + s.w - R[2]) y1 = sy + s.h - R[2] + cy(sx + s.w - R[2], R[2], false);
                seams.push([x, y0, x, y1]);
            }
            pl.segs(seams, 1, 'rgba(217,191,134,0.08)');
            pl.polyLine(roofPts(b, si, 2.5), 4, T.trim, true);
            pl.polyLine(roofPts(b, si, 6), 1, 'rgba(45,29,89,0.45)', true);
        });
        B.gate(0, 1).color('#e9e4fb'); for (const [x, y] of bulbs(b)) B.disc(x, y, 1.6, H, 0, 10); B.gate();
        const main = b.sections[0], box = s => [b.x + main.x + s[0] * main.w, b.y + main.y + s[1] * main.h, s[2] * main.w, s[3] * main.h];
        garden(b, B, box(SQ_ROOF.garden), false);
        pool(b, B, box(SQ_ROOF.pool), false);
        const wing = b.sections[1];
        if (wing) pad(b, B, b.x + wing.x, b.y + wing.y, wing.w, wing.h, false);
        penthouseDraw(b, B, o, false);
    }

    /** _sqRoofEdgeLights' bulbs */
    function bulbs(b) {
        const out = [], inset = 10, step = 22;
        for (const f of b._leanFaces()) {
            if (f.side === 'C') { out.push([(f.x1 + f.x2) / 2 - f.nx * inset, (f.y1 + f.y2) / 2 - f.ny * inset]); continue; }
            const horiz = f.y1 === f.y2, lo = horiz ? f.x1 : f.y1, hi = horiz ? f.x2 : f.y2, inward = f.side === 'S' || f.side === 'E' ? -inset : inset;
            const n = Math.max(1, Math.round((hi - lo - 2 * inset) / step));
            for (let i = 0; i <= n; i++) { const u = lo + inset + (hi - lo - 2 * inset) * i / n; out.push(horiz ? [u, f.y1 + inward] : [f.x1 + inward, u]); }
        }
        return out;
    }

    /** Moon garden: wisteria, the pergola walk, two cabanas stirring in the wind */
    function garden(b, B, [x, y, w, h], emissive) {
        const T = SQ_THEME, r = i => _bldHash(777, i), z = H, P = (px, py) => [px, py, z, 0], pl = GLBuildingModel.plane(B, z, 0);
        const y0 = y + h * 0.43, y1 = y + h * 0.57, ribs = 7, ribX = i => x + w * (0.08 + i * 0.66 / (ribs - 1));
        const cabs = [[x + w * 0.86, y + h * 0.22], [x + w * 0.86, y + h * 0.78]];
        if (!emissive) {
            const rr = GLBuildingBuilder.roundRectPts(x, y, w, h, 10, z, 0);
            B.color('#2e2266').poly(rr); B.color('rgba(217,191,134,0.55)').line(rr, 1.2, true, SK);
            pl.rect(x + w * 0.05, y0, w * 0.9, y1 - y0, 'rgba(214,202,240,0.22)');
            for (let i = 0; i < 8; i++) {
                const cx = x + w * (0.1 + (i >> 1) * 0.17), cy = (i & 1) ? y + h * 0.8 : y + h * 0.2, rd = 11 + r(i) * 6, wist = r(i + 40) < 0.5;
                pl.disc(cx + 3, cy + 3, rd, 'rgba(16,0,51,0.35)').disc(cx, cy, rd, wist ? '#6a4fb8' : '#2c6a4f').disc(cx - rd * 0.25, cy - rd * 0.25, rd * 0.6, wist ? '#9d7de6' : '#3f8a62');
                if (wist) { B.gate(0, 0); for (let j = 0; j < 5; j++) { const a = j * 1.26 + i; pl.disc(cx + Math.cos(a) * rd * 0.55, cy + Math.sin(a) * rd * 0.55, 1.3, '#e2d4ff'); } B.gate(); }
            }
            pl.segs([[ribX(0) - 6, y0 - 4, ribX(ribs - 1) + 6, y0 - 4], [ribX(0) - 6, y1 + 4, ribX(ribs - 1) + 6, y1 + 4]], 1.4, T.trim);
            B.color(T.trim); for (let i = 0; i < ribs; i++) { const rx = ribX(i); B.line(GLBuildingBuilder.quadPts(P(rx, y0 - 8), [rx + 6, (y0 + y1) / 2], P(rx, y1 + 8), 12), 2.2, false, SK); }
            const cols = ['#b79cf0', '#9d7de6', '#d8c6ff'], span = ribX(ribs - 1) - ribX(0);
            for (let i = 0; i < 34; i++) { B.gate(0, i < 16 ? 1 : 0); pl.disc(ribX(0) + span * r(i + 60), y0 - 6 + (y1 - y0 + 12) * r(i + 90), 1.5 + r(i + 120) * 2, cols[i % 3]); }
            B.gate();
            cabs.forEach(([cx, cy], i) => cabana(B, cx, cy, 15, i, z));
            return;
        }
        // night: gold lanterns on the pergola, the wisteria breathing, candlelight in the cabanas
        B.additive(true);
        for (let i = 0; i < ribs; i++) for (const py of [y0 - 4, y1 + 4]) {
            B.anim(A.SQ_LIGHT, L.ROOF_FLICK, i * 1.3 + py, flick(0.8, 2.1)).color('rgba(255,240,210,0.95)').disc(ribX(i), py, 1.5, z, 0, 12);
            B.gate(0, 0); glow(B, ribX(i), py, z, 0, 10, [255, 214, 150], 0.5); B.gate();
        }
        B.anim(A.SQ_LIGHT, L.ROOF_FLICK, 0, flick(0.7, 0.6));
        const rx0 = ribX(0) - 8, rx1 = ribX(ribs - 1) + 8, ya = y0 - 10, yb = y1 + 10;
        grad(B, [P(rx0, ya), P(rx1, ya), P(rx1, yb), P(rx0, yb)], p => (p[1] - ya) / (yb - ya), [[0, 'rgba(180,150,255,0)'], [0.5, 'rgba(180,150,255,0.24)'], [1, 'rgba(180,150,255,0)']]);
        B.anim(A.SQ_LIGHT, L.ROOF);
        for (const [cx, cy] of cabs) glow(B, cx, cy, z, 0, 28, [255, 186, 214], 0.4);
        B.anim().additive(false);
    }

    /** A cabana from above: the canopy, its sheer curtains billowing out downwind (SQ_MOVE curtain) */
    function cabana(B, cx, cy, s, seed, z) {
        B.color('rgba(185,162,245,0.55)');
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([nx, ny], k) => {
            const tx = -ny, ty = nx, ex = cx + nx * s, ey = cy + ny * s;
            B.anim(A.SQ_MOVE, MV.CURTAIN, k, 0);
            const base = B.vertex([ex, ey, z, 0]);
            for (let j = 0; j <= 6; j++) {
                const u = j / 3 - 1;
                B.anim(A.SQ_MOVE, MV.CURTAIN, k, Math.sin(j / 6 * Math.PI));
                B.vertex([ex + tx * s * u, ey + ty * s * u, z, 0], [seed * 2 + k + j * 0.9, 0, 0]);
            }
            for (let j = 0; j < 6; j++) B.index.push(base, base + 1 + j, base + 2 + j);
        });
        B.anim();
        const pl = GLBuildingModel.plane(B, z, 0);
        pl.rect(cx - s, cy - s, s * 2, s * 2, '#efe9ff');
        pl.segs([[cx - s, cy - s, cx + s, cy + s], [cx + s, cy - s, cx - s, cy + s]], 0.8, '#c9bdf2');
        pl.disc(cx, cy, 1.8, SQ_THEME.gold);
    }

    /** The reflecting pool: the deck, dark water, ripples, lotus, loungers, parasols; at night stars, the moon, mist */
    function pool(b, B, [x, y, w, h], emissive) {
        const T = SQ_THEME, r = i => _bldHash(911, i), z = H, P = (px, py) => [px, py, z, 0], pl = GLBuildingModel.plane(B, z, 0);
        const lotus = []; for (let i = 0; i < 9; i++) lotus.push([x + w * (0.08 + r(i) * 0.84), y + h * (0.14 + r(i + 20) * 0.72), 5 + r(i + 40) * 3, r(i + 60) * 6.28]);
        if (!emissive) {
            const deck = GLBuildingBuilder.roundRectPts(x - 9, y - 9, w + 18, h + 18, 6, z, 0);
            B.color('#b8acdc').poly(deck); B.color('rgba(217,191,134,0.6)').line(deck, 1, true, SK);
            pl.rectLine(x - 4.5, y - 4.5, w + 9, h + 9, 1, 'rgba(118,100,206,0.4)');
            grad(B, [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], p => ((p[0] - x) * w + (p[1] - y) * h) / (w * w + h * h), [[0, '#3b2c9e'], [0.55, '#1f0f70'], [1, T.glass]]);
            B.color('rgba(210,200,255,0.16)');                                         // slow ripples (SQ_MOVE ripple)
            for (let i = 0; i < 3; i++) {
                const yy = y + h * (0.25 + i * 0.25), n = 12, pts = [];
                for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; pts.push({ p: P(u * u * (x + 8) + 2 * u * t * (x + w / 2) + t * t * (x + w - 8), yy), wgt: 2 * u * t }); }
                for (let k = 0; k < n; k++) {
                    const a = pts[k], c = pts[k + 1], pa = pts[k - 1] || a, nc = pts[k + 2] || c;
                    B.anim(A.SQ_MOVE, MV.RIPPLE, i, a.wgt); const v0 = B.vertex(a.p, pa.p, c.p, -1, 0.5, SK), v1 = B.vertex(a.p, pa.p, c.p, 1, 0.5, SK);
                    B.anim(A.SQ_MOVE, MV.RIPPLE, i, c.wgt); const v2 = B.vertex(c.p, a.p, nc.p, 1, 0.5, SK), v3 = B.vertex(c.p, a.p, nc.p, -1, 0.5, SK);
                    B.index.push(v0, v1, v2, v0, v2, v3);
                }
            }
            B.anim();
            lotus.forEach(([lx, ly, lr, rot], i) => {
                B.color('#2e6b5c').poly(at3([[lx, ly], ...arcPts(lx, ly, lr, rot + 0.35, rot + TAU - 0.35, 20)], z, 0));
                if (i % 2 === 0) {
                    B.gate(0, 1);
                    const rr = lr * 0.8;
                    for (let j = 0; j < 6; j++) { const a = rot + j * Math.PI / 3; B.color(j % 2 ? '#ffc6e0' : '#fbeeff').ellipse(lx + Math.cos(a) * rr * 0.45, ly + Math.sin(a) * rr * 0.45, rr * 0.5, rr * 0.24, a, z, 0); }
                    pl.disc(lx, ly, rr * 0.22, '#ffd36e');
                    B.gate();
                }
            });
            for (let i = 0; i < 4; i++) {
                const lx = x + w * (0.1 + i * 0.25) + (i % 2 ? -4 : 4), ly = y - 34;
                pl.roundRect(lx - 4.5, ly - 10, 9, 20, 3, '#f4f1fc').roundRect(lx - 3.5, ly - 9, 7, 11, 2, '#b8a6ee');
            }
            for (const u of [0.225, 0.725]) {
                const cx = x + w * u, cy = y - 36;
                for (let j = 0; j < 8; j++) B.color(j % 2 ? '#b8a6ee' : '#f7f4ff').poly(at3([[cx, cy], ...arcPts(cx, cy, 12, j * Math.PI / 4, (j + 1) * Math.PI / 4, 6)], z, 0));
                pl.disc(cx, cy, 1.8, T.gold);
            }
            return;
        }
        B.additive(true); clipRect(B, x, y, w, h, true);
        for (let i = 0; i < 22; i++) glint(B, x + w * r(i + 200), y + h * r(i + 230), z, 0, 1, [i * 2.1, 0, 0], rgba(240, 232, 255, 1));
        const mx = x + w * 0.72, my = y + h * 0.36;
        B.anim(A.SQ_LIGHT, L.POOL); glow(B, mx, my, z, 0, 36, [200, 180, 255], 0.3);
        B.anim(A.SQ_MOVE, MV.WOBBLE, 1.2, L.POOL).color('rgba(244,238,255,0.85)').poly(at3(crescentPts(mx, my, 11, -2.4, 0.42), z, 0), true);
        lotus.forEach(([lx, ly], i) => { if (i % 2) return; B.anim(A.SQ_LIGHT, L.ROOF_FLICK, i, flick(0.75, 1.6)); glow(B, lx, ly, z, 0, 14, [255, 190, 225], 0.5); });
        clipRect(B, x, y, w, h, true);
        for (let i = 0; i < 3; i++) {
            B.anim(A.SQ_MOVE, MV.DRIFT, w, L.POOL);
            glow(B, x, y + h * 0.3, z, 0, 60, [190, 170, 255], 0.16, [0.3 * h, 0.1, i * 2.1], [0.02, i / 3, 0]);
        }
        B.anim().text().additive(false);
    }

    /** sqGlint as two arms that grow with its twinkle (SQ_MOVE glint, kind type) */
    function glint(B, x, y, z, mode, type, prm, col, thin = 0.5) {
        B.color(col);
        const v = (px, py, arm) => { B.anim(A.SQ_MOVE, MV.GLINT, arm, type); return B.vertex([px, py, z, mode], prm, prm); };
        let a = v(x, y - thin, 1), b2 = v(x, y - thin, 0), c = v(x, y + thin, 0), d = v(x, y + thin, 1);
        B.index.push(a, b2, c, a, c, d);
        a = v(x - thin, y, 3); b2 = v(x + thin, y, 3); c = v(x + thin, y, 2); d = v(x - thin, y, 2);
        B.index.push(a, b2, c, a, c, d);
        B.anim();
    }

    /** The south wing's eclipse pad: wisteria planters, a hexagon pad, the eclipse; at night its corona and landing lights */
    function pad(b, B, sx, sy, sw, sh, emissive) {
        const cx = sx + sw / 2, cy = sy + sh / 2, R = Math.min(sw, sh) * 0.34, E = R * 0.52, T = SQ_THEME, z = H, rot = -0.8, pl = GLBuildingModel.plane(B, z, 0);
        const corners = [[sx + 34, sy + 34], [sx + sw - 34, sy + 34], [sx + 34, sy + sh - 34], [sx + sw - 34, sy + sh - 34]];
        const cres = at3(crescentPts(cx, cy, E - 2, rot + Math.PI, 0.16, 1.2), z, 0);
        if (!emissive) {
            for (const [px, py] of corners) pl.disc(px, py, 16, '#8f86b0').disc(px, py, 13, '#6a4fb8').disc(px - 3, py - 3, 8, '#9d7de6');
            pl.poly(hexPts(cx, cy, R), T.bay).polyLine(hexPts(cx, cy, R), 2, T.trim, true);
            pl.polyLine(hexPts(cx, cy, R - 8), 1, 'rgba(217,191,134,0.3)', true);
            const rr = R * 0.74, circ = TAU * rr;                                        // a dashed ring, 5 on 7 off
            B.color('rgba(217,191,134,0.4)');
            for (let s = 0; s < circ; s += 12) { const a0 = s / rr, a1 = Math.min(s + 5, circ) / rr; B.line(at3(arcPts(cx, cy, rr, a0, a1, 3), z, 0), 1, false, SK); }
            pl.disc(cx, cy, E, T.ground).ring(cx, cy, E, 3, T.gold);
            B.color('#d9d2f5').poly(cres, true);
            return;
        }
        B.additive(true).anim(A.SQ_LIGHT, L.ROOF_FLICK, 0, flick(0.85, 0.9));
        const stops = [[0.5, 'rgba(255,214,150,0)'], [0.54, 'rgba(255,214,150,0.5)'], [0.68, 'rgba(180,140,255,0.28)'], [1, 'rgba(164,105,255,0)']], RC = E * 1.9;
        field(B, cx, cy, z, 0, [0.5, 0.52, 0.54, 0.58, 0.63, 0.68, 0.76, 0.84, 0.92, 1].map(t => t * RC), (dx, dy) => stopColor(stops, Math.hypot(dx, dy) / RC), 64, true);
        B.color('rgba(255,248,255,0.9)').poly(cres, true);
        const dx = cx + Math.cos(rot) * (E - 3), dy = cy + Math.sin(rot) * (E - 3);
        B.anim(A.SQ_LIGHT, L.ROOF); glow(B, dx, dy, z, 0, 18, [255, 250, 240], 0.9);
        glint(B, dx, dy, z, 0, 2, [0, 0, 0], rgba(255, 255, 255, 0.95));
        for (let i = 0; i < 24; i++) {
            const s = i / 4, k = Math.floor(s), f = s - k, a0 = k * Math.PI / 3, a1 = a0 + Math.PI / 3;
            const px = cx + (Math.cos(a0) * (1 - f) + Math.cos(a1) * f) * R, py = cy + (Math.sin(a0) * (1 - f) + Math.sin(a1) * f) * R;
            B.anim(A.SQ_LIGHT, L.CHASE, i * 0.26).color(i % 4 ? 'rgb(214,190,255)' : 'rgb(255,226,170)').disc(px, py, 1.7, z, 0, 10);
        }
        B.anim(A.SQ_LIGHT, L.ROOF);
        for (const [px, py] of corners) glow(B, px, py, z, 0, 22, [190, 160, 255], 0.28);
        B.anim().additive(false);
    }

    /** The penthouse tier's footprint and its walls (S/N, then W/E as Canvas pushed them) */
    function penthouse(b) {
        const main = b.sections[0], mx = b.x + main.x, my = b.y + main.y, px = mx + main.w * 0.1, py = my + main.h * 0.55, pw = main.w * 0.5, ph = main.h * 0.34;
        return { px, py, pw, ph, sides: [[[px, py + ph], [px + pw, py + ph], 0, 1], [[px + pw, py], [px, py], 0, -1], [[px, py], [px, py + ph], -1, 0], [[px + pw, py + ph], [px + pw, py], 1, 0]] };
    }
    function penthouseDraw(b, B, o, emissive) {
        const { px, py, pw, ph } = penthouse(b), zt = (Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) + 4) * FH(), T = SQ_THEME;
        const kB = kz(H), kT = kz(zt), minD = 2 * (kB - 1) / Math.max(1e-3, kT / kB - 1);
        for (const s of o.phFaces) {
            const [a, c] = [s.a, s.c], q = [Q(a[0], a[1], H), Q(c[0], c[1], H), Q(c[0], c[1], zt), Q(a[0], a[1], zt)];
            B.face(s.id).gate(minD);
            if (!emissive) {
                B.polyColors(q, ['#1a0d52', '#1a0d52', '#3b2c86', '#3b2c86']);
                const n = Math.max(2, Math.floor(Math.hypot(c[0] - a[0], c[1] - a[1]) / 14));
                B.color('#b3a6ea');
                for (let i = 1; i < n; i++) { const u = i / n, x = a[0] + (c[0] - a[0]) * u, y = a[1] + (c[1] - a[1]) * u; B.line([Q(x, y, H), Q(x, y, zt)], 0.8, false, SK); }
            } else B.additive(true).polyColors(q, ['rgba(255,205,160,0.3)', 'rgba(255,205,160,0.3)', 'rgba(190,150,255,0.45)', 'rgba(190,150,255,0.45)']).additive(false);
            B.face(-1).gate();
        }
        const pl = GLBuildingModel.plane(B, zt, 1), hexAt = (i, rr) => hexPts(px + pw * (0.2 + i * 0.3), py + ph / 2, rr, Math.PI / 6);
        if (!emissive) {
            pl.rect(px, py, pw, ph, T.bay).rectLine(px + 1.5, py + 1.5, pw - 3, ph - 3, 3, T.trim);
            for (let i = 0; i < 3; i++) {
                pl.poly(hexAt(i, ph * 0.26), T.glass).polyLine(hexAt(i, ph * 0.26), 1.5, '#cfc6f5', true);
                if (i !== 1) pl.polyLine(hexAt(i, ph * 0.13), 1, 'rgba(207,198,245,0.35)', true);
            }
            pl.disc(px + pw / 2, py + ph / 2, 8, T.silver).ring(px + pw / 2, py + ph / 2, 8, 1.5, T.gold);
            return;
        }
        for (let i = 0; i < 3; i++) {                                                  // hexagon skylights, their glow (shadowBlur 10)
            const pts = at3(hexAt(i, ph * 0.26), zt, 1);
            B.color('rgba(200,168,255,0.35)').poly(pts);
            B.color('rgba(180,140,255,0.35)').poly(pts);
            B.softLine(pts, 1.5, 10, true, SK, GLColor.parse('#c8a8ff'));
            B.color('#c8a8ff').line(pts, 1.5, true, SK);
        }
        const font = 'Great Vibes', e = GLText.entry('SQ', 22, font, false, 'italic');
        let mid = 22 * 0.3;
        try { const c = document.createElement('canvas').getContext('2d'); c.font = `italic 22px "${font}", cursive`; const m = c.measureText('SQ'); if (m.emHeightAscent != null) mid = (m.emHeightAscent - m.emHeightDescent) / 2; } catch (err) { /* keep the estimate */ }
        B.color('#e8dcff'); GLText.quad(B, e, px + pw / 2, py + ph + 22 - mid, zt, 1);
    }

    /** The spire, the crescent finial and the floating crown ring (_sqDrawCrown / _sqCrownRing) */
    function crown(b, B, emissive) {
        const main = b.sections[0], T = SQ_THEME, bx = b.x + main.x + main.w * 0.35, by = b.y + main.y + main.h * 0.72;
        const z0 = (Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) + 4) * FH(), z1 = SQ_ROOF.spireZ, zr = SQ_ROOF.ringZ, k0 = kz(z0), k1 = kz(z1), kr = kz(zr);
        const anc = [bx, by, 0], ring = [bx, by, 0];
        if (!emissive) {
            // the needle, turned to lean away from the camera, its silver shaded across
            const st = [[0, T.silverLo], [0.4, T.silverHi], [0.7, T.silver], [1, T.silverDk]], ss = [-1, -0.2, 0.4, 1];
            B.anim(A.SQ_MOVE, MV.ORIENT, 0, 0);
            const topT = s => 0.5 + s * 0.9 * k1 / (2 * 4.5 * k0);
            for (let i = 0; i < 3; i++) {
                const s0 = ss[i], s1 = ss[i + 1], base = B.n;
                B.vertex(Q(bx, by + s0 * 4.5, z0), anc, anc, 0, 0, 0, stopColor(st, (s0 + 1) / 2));
                B.vertex(Q(bx, by + s1 * 4.5, z0), anc, anc, 0, 0, 0, stopColor(st, (s1 + 1) / 2));
                B.vertex(Q(bx, by + s1 * 0.9, z1), anc, anc, 0, 0, 0, stopColor(st, topT(s1)));
                B.vertex(Q(bx, by + s0 * 0.9, z1), anc, anc, 0, 0, 0, stopColor(st, topT(s0)));
                B.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            B.color(T.gold);                                                            // gold collars
            for (const f of [0.2, 0.42, 0.62]) {
                const kf = k0 + (k1 - k0) * f, zf = C0 * (1 - 1 / kf), w = (4.5 * k0 + (0.9 * k1 - 4.5 * k0) * f) * 1.7 / kf, hw = 0.6 / kf;
                fillP(B, [Q(bx - hw, by - w, zf), Q(bx + hw, by - w, zf), Q(bx + hw, by + w, zf), Q(bx - hw, by + w, zf)], anc);
            }
            const cres = crescentPts(bx, by, 7, 0, 0.42);
            B.color(T.goldHi); fillP(B, at3(cres, z1, 1), anc, null, true);
            B.color(T.gold); outlineQuads(B, cres, 0.4 / k1, z1, 1, anc);
            ringDay(B, bx, by, zr, kr, ring);
            B.anim();
            return;
        }
        // night (absolute alpha): light running up the needle, the moon's halo, the finial, the beacon, the ring aglow
        B.additive(true).anim(A.SQ_LIGHT, L.CROWN);
        gradSeg(B, Q(bx, by, z0), Q(bx, by, z1), 1.6, 'rgba(200,168,255,0.1)', 'rgba(240,226,255,0.7)');
        glow(B, bx, by, z1, 1, 28, [220, 200, 255], 0.5);
        B.anim(A.SQ_MOVE, MV.ORIENT, 0, L.CROWN).color('rgba(255,244,220,0.85)'); fillP(B, at3(crescentPts(bx, by, 7, 0, 0.42), z1, 1), anc, null, true);
        B.anim(A.SQ_MOVE, MV.ORIENT, 0, L.BEACON); glow(B, bx - 3 / k1, by, z1, 1, 9 / k1, [255, 60, 80], 0.9, anc, anc);
        B.anim(A.SQ_LIGHT, L.RING);
        B.color('rgba(180,140,255,0.35)').circleLine(bx, by, 40, 40 * 0.22, zr, 1, SK);
        B.color('rgba(255,236,200,0.75)').circleLine(bx, by, 40 * 0.93, 1.2, zr, 1, 0);
        B.anim(A.SQ_MOVE, MV.SPIN, 0.12, L.RING);
        for (let i = 0; i < 8; i++) { const an = i * TAU / 8, hh = 40 * (i % 2 ? 0.16 : 0.27); glow(B, bx + Math.cos(an) * (40 + hh), by + Math.sin(an) * (40 + hh), zr, 1, 7 / kr, i % 2 ? [200, 170, 255] : [255, 220, 160], 0.8, ring, ring); }
        for (let j = 0; j < 10; j++) glint(B, bx, by, zr, 1, 3, [j * 0.628, j * 1.7, 0], rgba(255, 250, 255, 0.9), 0.5 / kr);
        B.anim().additive(false);
    }
    /** The crown ring by day: eight points turning, the silver and gold rings, the jewels (faded near the camera) */
    function ringDay(B, bx, by, zr, kr, ring) {
        const T = SQ_THEME, n = 8, R = 40, dr = (1 + R * kr * 0.035) / kr;
        const tip = i => { const an = i * TAU / n, hh = R * (i % 2 ? 0.16 : 0.27); return [an, bx + Math.cos(an) * (R + hh), by + Math.sin(an) * (R + hh)]; };
        B.anim(A.SQ_MOVE, MV.SPIN, 0.12, L.RING_DAY).color(T.silverHi);
        for (let i = 0; i < n; i++) { const [an, tx, ty] = tip(i); fillP(B, [Q(bx + Math.cos(an - 0.14) * R, by + Math.sin(an - 0.14) * R, zr), Q(tx, ty, zr), Q(bx + Math.cos(an + 0.14) * R, by + Math.sin(an + 0.14) * R, zr)], ring); }
        B.anim(A.SQ_LIGHT, L.RING_DAY);
        B.color(T.silverHi).circleLine(bx, by, R, Math.max(1.5, R * kr * 0.07) / kr, zr, 1, SK);
        B.color(T.gold).circleLine(bx, by, R * 0.93, Math.max(0.8, R * kr * 0.03) / kr, zr, 1, SK);
        B.anim(A.SQ_MOVE, MV.SPIN, 0.12, L.RING_DAY);
        for (const odd of [0, 1]) {
            B.color(odd ? '#b89cff' : T.gold);
            for (let i = odd; i < n; i += 2) { const [, tx, ty] = tip(i), pts = []; for (let j = 0; j < 10; j++) pts.push(Q(tx + Math.cos(j / 10 * TAU) * dr, ty + Math.sin(j / 10 * TAU) * dr, zr)); fillP(B, pts, ring); }
        }
        B.anim();
    }

    // ---------------- glow: after the darkness ----------------
    function drawGlow(b, o) {
        const B = o.glow;
        o.faces.forEach((f, i) => {
            const F = new GLFace(f, H);
            B.face(o.faceIds[i]);
            windows(b, B, f, F, true);
            face(b, B, f, F, true);
            B.reset();
        });
        o.faces.forEach((f, i) => { B.face(o.faceIds[i]); balconies(b, B, f, new GLFace(f, H)); B.reset(); });
        porticoGlow(b, B, o);
        // the roof: a rim along the parapets, the fairy lights, the garden, pool and pad, the penthouse
        const R = GLBuildingModel.plane(B, H, 0), rim = b.colors.accent;
        b.sections.forEach(s => {
            const pts = [[b.x + s.x + 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + s.h - 1], [b.x + s.x + 1, b.y + s.y + s.h - 1]].map(q => R.p(q[0], q[1]));
            B.softLine(pts, 1.6, 8, true, SK, GLColor.alpha(rim, 0.55));
            B.color(GLColor.alpha(rim, 0.55)).line(pts, 1.6, true, SK);
        });
        B.additive(true);
        bulbs(b).forEach(([x, y], i) => {
            const h = _bldHash(5151, i), warm = i % 2 === 0;
            B.gate(0, 0).anim(A.SQ_LIGHT, L.FAIRY, h, 0); glow(B, x, y, H, 0, 7, warm ? [255, 217, 160] : [217, 194, 255], 0.45);
            B.gate(0, 1).anim(A.SQ_LIGHT, L.FAIRY, h, 1).color(warm ? 'rgb(255,236,205)' : 'rgb(236,224,255)').disc(x, y, 1.5, H, 0, 10);
        });
        B.gate().anim().additive(false);
        const main = b.sections[0], box = s => [b.x + main.x + s[0] * main.w, b.y + main.y + s[1] * main.h, s[2] * main.w, s[3] * main.h];
        garden(b, B, box(SQ_ROOF.garden), true);
        pool(b, B, box(SQ_ROOF.pool), true);
        const wing = b.sections[1];
        if (wing) pad(b, B, b.x + wing.x, b.y + wing.y, wing.w, wing.h, true);
        penthouseDraw(b, B, o, true);
        veil(b, B);
        crown(b, B, true);
        beams(b, B);
    }

    /** Verandas (_sqDrawBalconies): opaque slabs shaded with the dark, glass fronts, rails; lit ones glow. Cut by the other sections' roofs */
    function balconies(b, B, f, F) {
        const bals = b._sqBalconies(f);
        if (!bals.length) return;
        const n = f.side === 'S' ? [0, 1] : f.side === 'N' ? [0, -1] : f.side === 'E' ? [1, 0] : [-1, 0], D = 6, RH = 3.5;
        const other = b.sections.find((s, i) => i !== f.section);
        if (other) clipRect(B, b.x + other.x, b.y + other.y, other.w, other.h, false);
        const E = (u, off, z) => Q(f.x1 + (f.x2 - f.x1) * u + n[0] * off, f.y1 + (f.y2 - f.y1) * u + n[1] * off, z);
        const geo = bals.map(bl => { const z = (bl.fl + 0.1) * FH(), zr = z + RH; return { bl, A: E(bl.u0, 0, z), B: E(bl.u1, 0, z), C: E(bl.u1, D, z), D: E(bl.u0, D, z), At: E(bl.u0, 0, zr), Bt: E(bl.u1, 0, zr), Ct: E(bl.u1, D, zr), Dt: E(bl.u0, D, zr) }; });
        B.gate(6, 1).anim(A.SQ_LIGHT, L.BAL_SLAB);
        B.color('rgb(60,50,88)'); for (const q of geo) B.poly([q.A, q.B, q.C, q.D]);
        B.color('rgba(150,140,190,0.3)'); for (const q of geo) B.poly([q.D, q.C, q.Ct, q.Dt]);
        B.color('rgb(228,224,244)'); for (const q of geo) B.line([q.At, q.Dt, q.Ct, q.Bt], 0.9);
        B.additive(true);
        B.anim(A.SQ_LIGHT, L.BAL_WARM).color('rgba(255,196,140,0.22)'); for (const q of geo) if (q.bl.lit) B.poly([q.A, q.B, q.C, q.D]);
        B.anim(A.SQ_LIGHT, L.BAL_TOP).color('rgba(200,168,255,0.9)'); for (const q of geo) B.seg(q.Dt, q.Ct, 1.1);
        B.anim(A.SQ_LIGHT, L.BAL_RIM).color(GLColor.alpha(b.colors.accent, 0.45)); for (const q of geo) B.line([q.At, q.Dt, q.Ct, q.Bt], 0.9);
        B.additive(false).anim().gate().text();
    }

    /** The portico by night (_sqDrawPorticoGlow): shaft uplights, glitter, mist, the marquee, slots, winged hexes, lanterns, the post globes */
    function porticoGlow(b, B, o) {
        const g = b._sqPortico();
        if (!g) return;
        const r = SQ_PORTICO.colR, d = SQ_PORTICO.depth;
        B.additive(true).anim(A.SQ_LIGHT, L.PORT);
        for (const c of g.cols) gradSeg(B, Q(c.x, c.y + 2, 0), Q(c.x, c.y, g.zCol), 2.2, 'rgba(240,222,255,0.85)', 'rgba(164,105,255,0)');
        B.color('rgba(236,220,255,0.9)'); for (const c of g.cols) B.disc(c.x, c.y + r + 3.5, 1.5, 0, 0, 10);
        B.gate(0, 0);                                                                   // glitter on the marble and carpet
        for (let i = 0; i < 34; i++) {
            const gx = g.x0 - 20 + (g.x1 - g.x0 + 40) * _bldHash(4242, i), gy = g.yf + 58 + 76 * _bldHash(4243, i);
            glint(B, gx, gy, 0, 0, 0, [i * 2.3, 1.6 + _bldHash(4244, i), 0], i % 4 ? rgba(236, 224, 255, 1) : rgba(255, 226, 180, 1));
        }
        B.gate();
        for (let i = 0; i < 5; i++) {                                                   // low mist rolling off the steps
            B.anim(A.SQ_MOVE, MV.DRIFT, g.x1 - g.x0 + 60, L.PORT);
            glow(B, g.x0 - 30, g.yf + 92, 0, 0, 70, [170, 140, 255], 0.1, [14, 0.3, i * 1.7], [0.015, i / 5, 0]);
        }
        // the marquee bulbs chasing along the fascia (when it faces the camera; a finer string close up)
        B.face(o.pf.marquee);
        for (const lodSet of [0, 1]) {
            const n = Math.floor((g.x1 - g.x0 - 8) / (lodSet ? 14 : 9)), kb = kz(g.z - 2);
            for (let i = 0; i <= n; i++) {
                const x = g.x0 + 4 + (g.x1 - g.x0 - 8) * i / n;
                B.anim(A.SQ_LIGHT, L.MARQUEE, i * 0.55, lodSet).color(i % 2 ? 'rgb(214,186,255)' : 'rgb(255,238,214)').disc(x, g.yb, 1.5 / kb, g.z - 2, 0, 10);
                if (!lodSet) B.color('rgba(200,168,255,0.22)').disc(x, g.yb, 4.5 / kb, g.z - 2, 0, 16);
            }
        }
        B.anim(A.SQ_LIGHT, L.PORT_FADE).color('rgba(190,150,255,0.75)').seg(Q(g.x0, g.yb, g.z - 4.5), Q(g.x1, g.yb, g.z - 4.5), 1.2);
        B.face(-1);
        const pl = GLBuildingModel.plane(B, g.z, 0);
        for (const off of SQ_PORTICO.pilasters) pl.rect(g.dx + off - 4, g.yf + 1.5, 8, 1.8, 'rgba(244,232,255,0.95)');
        for (const s of [-1, 1]) {
            const x = g.dx + s * SQ_ENTRY.hexX, y = g.yf + d * 0.5, rr = 9;
            glow(B, x, y, g.z, 0, rr * 3.4, [214, 190, 255], 0.55);
            pl.poly(hexPts(x, y, rr - 1.5), 'rgba(236,224,255,0.9)');
            pl.polyLine(wingPts(x, y, rr, -1), 0.8, 'rgba(214,190,255,0.8)', true).polyLine(wingPts(x, y, rr, 1), 0.8, 'rgba(214,190,255,0.8)', true);
        }
        for (const c of g.cols) {                                                       // hexagon lanterns crowning the columns
            const near = Math.abs(c.x - g.dx) < 100, rr = near ? 20 : 15;
            B.anim(A.SQ_LIGHT, L.LANTERN, c.x);
            glow(B, c.x, c.y, g.zCol, 0, rr, [180, 130, 255], 0.3);
            glow(B, c.x, c.y, g.zCol, 0, rr * 0.4, near ? [255, 236, 220] : [214, 186, 255], near ? 0.75 : 0.6);
        }
        B.anim(A.SQ_LIGHT, L.PORT_REL);
        for (const near of [false, true]) {
            B.color(near ? 'rgba(255,244,236,0.95)' : 'rgba(232,218,255,0.9)');
            for (const c of g.cols) if ((Math.abs(c.x - g.dx) < 100) === near) B.poly(at3(hexPts(c.x, c.y, 5.6), g.zCol, 0));
        }
        // the triple-globe posts: the lamp's baked bulb (corona, bloom, face), LAMP_POST_SCALE about each foot
        const S = LAMP_POST_SCALE, Dd = C0 - H, dp = (dd, zz) => S * dd * (1 + zz / Dd) / (1 + S * zz / Dd), col = postBulb();
        for (const [ox, oy] of SQ_ENTRY.posts) for (const gx of [-9, 0, 9]) {
            const x = g.dx + ox, y = g.yf + oy, zz = gx ? 26 : 30, sc = kz(26) * S / kz(S * zz);
            B.anim(A.SQ_LIGHT, L.POST, gx + oy);
            field(B, x + dp(gx, zz), y, S * zz, 0, [0.6, 1.2, 1.92, 2.6, 3.1, 3.3, 4, 4.7, 5.2, 5.4, 6.5, 8, 10, 12.5, 15, 18].map(v => v * sc), (dx, dy) => col(dx / sc, dy / sc), 20);
        }
        B.anim().additive(false);
    }

    /** _lampBulbEmissionSprite('#ffdcaa', 3.2, 'globe') as a colour at (x, y) from its middle: face over bloom over halo */
    function postBulb() {
        const rgb = [255, 220, 170], st = (stops, t) => stopColor(stops, t), radius = 3.2;
        const halo = [[0, `rgba(${rgb},0.30)`], [0.25, `rgba(${rgb},0.20)`], [0.6, `rgba(${rgb},0.07)`], [1, `rgba(${rgb},0)`]];
        const bloom = [[0, 'rgba(255,249,230,0.40)'], [0.48, `rgba(${rgb},0.26)`], [1, `rgba(${rgb},0)`]];
        const face = [[0, '#ffffff'], [0.55, '#fffdf4'], [0.85, '#fff1ce'], [1, '#ffdcaa']];
        const two = (x, y, gx0, gy0, r0, gx1, gy1, r1) => {
            const cdx = gx1 - gx0, cdy = gy1 - gy0, dr = r1 - r0, px = x - gx0, py = y - gy0, a = cdx * cdx + cdy * cdy - dr * dr, bb = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
            if (Math.abs(a) < 1e-9) return c / (2 * bb); const dd = bb * bb - a * c; return dd < 0 ? 0 : (bb + Math.sqrt(dd)) / a;
        };
        const over = (top, under) => { const a = top[3] + under[3] * (1 - top[3]); if (a <= 0) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat([a]); };
        return (x, y) => {
            const d = Math.hypot(x, y);
            let c = st(halo, (d - radius * 0.6) / (18 - radius * 0.6));
            if (d <= radius * 1.65 + 1e-6) c = over(st(bloom, (d - radius * 0.45) / (radius * 1.65 - radius * 0.45)), c);
            if (d <= radius + 1e-6) c = over(st(face, two(x, y, -radius * 0.12, -radius * 0.15, 0, 0, 0, radius)), c);
            return c;
        };
    }

    /** The night veil (_sqVeil): mist hugging the footprint, moonlight sliding over the roofs */
    function veil(b, B) {
        B.additive(true);
        B.gate(0, 0);
        for (const s of b.sections) for (let i = 0; i < 2; i++) {
            B.anim(A.SQ_MOVE, MV.DRIFT, s.w, L.VEIL);
            glow(B, b.x + s.x, b.y + s.y + s.h + 10, 0, 0, 70, [190, 170, 255], 0.1, [6, 0.3, i], [0.015, i * 0.5 + s.x * 0.001, 0]);
        }
        B.gate();
        const bd = b.getBounds(), cell = 20;
        B.anim(A.SQ_MOVE, MV.SWEEP, bd.x, bd.w).color('rgba(220,210,255,0.07)');
        b.sections.forEach((s, si) => {
            const out = roofPts(b, si), sx = b.x + s.x, sy = b.y + s.y;
            for (let y = sy; y < sy + s.h; y += cell) for (let x = sx; x < sx + s.w; x += cell) {
                const c = clipConvex([[x, y], [Math.min(x + cell, sx + s.w), y], [Math.min(x + cell, sx + s.w), Math.min(y + cell, sy + s.h)], [x, Math.min(y + cell, sy + s.h)]], out);
                if (c.length >= 3) fillP(B, c.map(p => [p[0], p[1], H, 0]), [bd.y, 0, 0]);
            }
        });
        B.anim().additive(false);
    }

    /** Two violet searchlights sweeping the sky from the tower's front corners (_sqDrawBeams), placed on the GPU */
    function beams(b, B) {
        const main = b.sections[0], kH = kz(H);
        const srcs = [[b.x + main.x + 34, b.y + main.y + main.h - 34, 0], [b.x + main.x + main.w - 34, b.y + main.y + main.h - 34, 2.3]];
        B.gate(0, 1).additive(true);
        for (const [sx, sy, ph] of srcs) {
            for (const nb of [0, 1]) {
                const cs = nb ? ['rgba(246,236,255,0.32)', 'rgba(200,168,255,0.08)', 'rgba(120,70,255,0)'] : ['rgba(200,168,255,0.2)', 'rgba(164,105,255,0.07)', 'rgba(120,70,255,0)'];
                const v = [];
                for (let ti = 0; ti < 3; ti++) for (const side of [0, 1]) { B.anim(A.SQ_MOVE, MV.BEAM, ph, ti + 3 * side + 6 * nb); v.push(B.vertex(Q(sx, sy, H), undefined, undefined, 0, 0, 0, GLColor.parse(cs[ti]))); }
                for (let ti = 0; ti < 2; ti++) { const a = v[ti * 2], c = v[ti * 2 + 1], d = v[ti * 2 + 2], e = v[ti * 2 + 3]; B.index.push(a, c, e, a, e, d); }
            }
            B.anim(A.SQ_LIGHT, L.BEAM);
            const R = 16 / kH, stops = [[0, 'rgba(255,248,255,0.9)'], [1, 'rgba(200,168,255,0)']];
            field(B, sx, sy, H, 0, [0.25, 0.5, 0.75, 1].map(t => t * R), (dx, dy) => stopColor(stops, Math.hypot(dx, dy) / R), 24);
        }
        B.anim().gate().additive(false);
    }

    /** Per frame: the portico fades over the player; the crown ring fades near the camera; the wind in the cabanas; rain on the marble; the lamps' rim */
    function update(b, r) {
        const g = b._sqPortico(), pl = game.player, cam = game.camera;
        if (g) {
            const under = !game.isDriving && pl && pl.x > g.x0 - 8 && pl.x < g.x1 + 8 && pl.y > g.yf - 8 && pl.y < g.yb + 12;
            const f0 = b._sqFade == null ? 1 : b._sqFade;
            b._sqFade = f0 + ((under ? 0.3 : 1) - f0) * 0.15;
        }
        const main = b.sections[0], bx = b.x + main.x + main.w * 0.35, by = b.y + main.y + main.h * 0.72, C = leanCamHeight();
        const kr = C / (C - Math.min(SQ_ROOF.ringZ, C * 0.86)), R = SQ_ROOF.ringR * kr;
        const ringFade = Math.max(0.12, Math.min(1, (Math.hypot(bx - cam.x, by - cam.y) * kr - R * 0.4) / 160));
        const wind = game.weather && game.weather.windVec ? game.weather.windVec : { x: 1, y: 0.5 }, wet = game.weather && game.weather.isRaining ? 1 : 0.6;
        const dc = game.dayCycle(), rim = (dc.lampsOn ? 1 : 0) * Math.max(0, Math.min(1, (dc.darkness - 0.15) * 1.6));
        if (!r.sqTop) { r.sqTop = new Float32Array(4); r.sqGlow = new Float32Array(4); }
        r.sqTop[0] = wind.x; r.sqTop[1] = wind.y; r.sqTop[2] = ringFade;
        r.sqGlow[0] = wet; r.sqGlow[2] = ringFade; r.sqGlow[3] = rim;
        r.top.rim = r.sqTop; r.glow.rim = r.sqGlow;
        r.top.fade = r.glow.fade = b._sqFade == null ? 1 : b._sqFade;
    }

    return { build, update };
})();
