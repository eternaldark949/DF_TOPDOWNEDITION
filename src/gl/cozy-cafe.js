// GL engine: the Cozy Cafe (buildings/cozy-cafe.js), built once as GPU geometry. The brick
// corner house with its shop windows and flower boxes, the striped awnings and the signboard over
// the door, the shingled hip roof with its skylights, the roof terrace (deck, parapet, planters,
// chairs, parasols, string lights), the hearth's chimney and its smoke, and the pavement dressing
// (step, mat, planter, chalkboard, bistro tables). Every point leans with the landmark kit's true
// perspective (lean mode 1), as _ccP does. The walls and the chimney's sides are faces (shown
// when they face the camera, as _visibleFaces and _ccDrawChimney decide); the roof's planes are
// re-sorted as the camera moves so a plane seen from behind goes first, as _ccDrawRoof sorts them.
const GLCozyCafe = (() => {
    const M = 1;                                                   // true perspective (LandmarkKit.k)
    const P = (x, y, z) => [x, y, z, M];
    const K = GLBuildingModel;
    const SK = GLB_LINE.SCALE_K;
    const rr = (x, y, w, h, r, z) => GLBuildingBuilder.roundRectPts(x, y, w, h, r, z, M);
    /** Canvas's lineCap 'round' on an opaque stroke: a cap disc at each end (its radius as the lean draws it at z) */
    const cap = (B, p, w) => { const C = leanCamHeight(), k = C / (C - Math.min(p[2], C * 0.86)); B.disc(p[0], p[1], w / 2 / k, p[2], M, 10); };

    function build(b) {
        const H = b._ccH();
        const o = { H, base: GLBuildingBuilder.scratch(H, 0), top: GLBuildingBuilder.scratch(H, 1), glow: GLBuildingBuilder.scratch(H, 2) };
        const add = f => { const i = o.top.addFace(f); o.base.addFace(f); o.glow.addFace(f); return i; };
        o.faces = b._leanFaces();
        o.faceIds = o.faces.map(add);
        // the chimney's four sides, each shown when the camera is past it (as _ccDrawChimney tests)
        const c = CAFE_PLAN.CHIM, x0 = b.x + c.x, y0 = b.y + c.y, x1 = x0 + c.w, y1 = y0 + c.h;
        o.chim = { S: add({ nx: 0, ny: 1, x1: x0, y1: y1 }), N: add({ nx: 0, ny: -1, x1: x0, y1: y0 }), E: add({ nx: 1, ny: 0, x1: x1, y1: y0 }), W: add({ nx: -1, ny: 0, x1: x0, y1: y0 }) };
        drawBase(b, o.base);
        drawTop(b, o.top, o);
        drawGlow(b, o.glow, o);
        return o;
    }

    const door = b => { const t = b.attachedTransition; return t ? t.x + t.w / 2 : b.x + CAFE_PLAN.W / 2; };

    // ---------------- the pavement (Canvas's cc_ground sprite) ----------------
    function drawBase(b, B) {
        const x = b.x, y = b.y, T = CAFE_EXTERIOR, wy = y + CAFE_PLAN.D, cx = door(b), G = K.plane(B, 0, 0);
        G.rect(x + 16, y + 16, CAFE_PLAN.W, CAFE_PLAN.D, 'rgba(0,0,0,.42)');
        // Brick step and a coir mat at the door
        B.color('#5a3326').poly(GLBuildingBuilder.roundRectPts(cx - 48, wy, 96, 16, [0, 0, 6, 6]));
        const joints = []; for (let i = 1; i < 6; i++) joints.push([cx - 48 + i * 16, wy, cx - 48 + i * 16, wy + 16]);
        G.segs(joints, 1, 'rgba(232,190,140,.22)');
        G.roundRect(cx - 24, wy + 3, 48, 10, 2, '#8a6a43');
        G.rectLine(cx - 21, wy + 5, 42, 6, 1, 'rgba(40,24,10,.6)');
        // Planter box with flowers by the west corner
        G.rect(x + 10, wy + 2, 52, 13, T.wood);
        G.rectLine(x + 10.5, wy + 2.5, 51, 12, 1, T.woodHi);
        for (let i = 0; i < 14; i++) B.color(i % 3 ? T.leaf : T.leafHi).disc(x + 14 + (i * 37 % 46), wy + 5 + (i * 13 % 8), 3.4, 0, 0, 12);
        for (let i = 0; i < 9; i++) B.color(['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3]).disc(x + 16 + i * 5.2, wy + 6 + (i % 2) * 5, 1.6, 0, 0, 8);
        // Chalkboard A-frame, just east of the door
        G.rect(cx + 66, wy + 22, 20, 14, 'rgba(0,0,0,.3)');
        G.rect(cx + 63, wy + 18, 20, 14, T.woodHi);
        G.rect(cx + 65, wy + 20, 16, 10, '#1f2421');
        G.segs([[cx + 67, wy + 23, cx + 78, wy + 23], [cx + 67, wy + 26, cx + 75, wy + 26]], 0.8, 'rgba(240,235,220,.7)');
        // Two bistro tables with their chairs, cups and a candle
        for (const [tx, ty] of [[x + 252, wy + 30], [x + 308, wy + 30]]) {
            G.ellipse(tx + 3, ty + 4, 13, 11, 0, 'rgba(0,0,0,.32)');
            for (const a of [Math.PI * 0.5, Math.PI * 1.5]) {
                const chx = tx + Math.cos(a) * 15, chy = ty + Math.sin(a) * 13;
                G.roundRect(chx - 6, chy - 5, 12, 10, 3, '#2b1a12').roundRectLine(chx - 6, chy - 5, 12, 10, 3, 1, '#8c6a46');
            }
            G.disc(tx, ty, 9, '#efe4cc').ring(tx, ty, 9, 1.2, '#7a5a38');
            G.disc(tx - 3, ty - 2, 2.4, '#fff').disc(tx - 3, ty - 2, 1.4, '#5b3420').disc(tx + 3, ty + 2, 1.5, T.amberSoft);
        }
    }

    // ---------------- the walls ----------------
    /** One wall's spans: shop windows below (either side of the door on the front), flower-boxed windows above */
    function faceSpans(b, f, H) {
        const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), front = f.side === 'S';
        const du = front ? (door(b) - f.x1) / (f.x2 - f.x1) : -1, dw = 34 / L;
        const lower = [], upper = [];
        if (front) { for (const [a, c] of [[0.05, du - dw - 0.06], [du + dw + 0.06, 0.95]]) if (c > a) lower.push([Math.min(a, c), Math.max(a, c)]); }
        else { const n = Math.max(2, Math.round(L / 90)); for (let i = 0; i < n; i++) lower.push([(i + 0.2) / n, (i + 0.8) / n]); }
        const nu = Math.max(3, Math.round(L / 70));
        for (let i = 0; i < nu; i++) upper.push([(i + 0.3) / nu, (i + 0.7) / nu]);
        return { L, front, du, dw, lower, upper, z0: 3, z1: H * 0.48, z2: H * 0.6, z3: H * 0.86 };
    }
    function wall(b, B, f, id, H, emissive) {
        const T = CAFE_EXTERIOR, S = faceSpans(b, f, H), { L, front, du, dw, lower, upper, z0, z1, z2, z3 } = S;
        const at = (u, z) => P(f.x1 + (f.x2 - f.x1) * u, f.y1 + (f.y2 - f.y1) * u, z);
        const quad = (u0, u1, za, zb) => B.poly([at(u0, za), at(u1, za), at(u1, zb), at(u0, zb)]);
        B.face(id);
        if (!emissive) {
            B.polyColors([at(0, 0), at(1, 0), at(1, H), at(0, H)], [T.brickLo, T.brickLo, front ? T.brickHi : T.brick, front ? T.brickHi : T.brick]);
            B.color(T.mortar); for (let z = 2.5; z < H - 2; z += 2.5) B.seg(at(0, z), at(1, z), 0.7);
            B.color(T.cream); quad(0, 6 / L, 0, H); quad(1 - 6 / L, 1, 0, H);
            const glass = [];
            B.color(T.cream);
            for (const [a, c] of lower) { quad(a, c, z0, z1); glass.push([a + 2 / L, c - 2 / L, z0 + 1, z1 - 1]); }
            for (const [a, c] of upper) { quad(a, c, z2, z3); glass.push([a + 1.5 / L, c - 1.5 / L, z2 + 0.8, z3 - 0.8]); }
            // the glass: a gradient up the wall (from #4a2e1c at the shop windows' foot to the glass at the top windows' head)
            const gcol = z => GLColor.mix('#4a2e1c', T.glass, Math.max(0, Math.min(1, (z - z0) / (z3 - z0))));
            for (const [a, c, za, zb] of glass) B.polyColors([at(a, za), at(c, za), at(c, zb), at(a, zb)], [gcol(za), gcol(za), gcol(zb), gcol(zb)]);
            B.color('rgba(255,200,120,.16)'); for (const [a, c, za, zb] of glass) quad(a, c, za, zb);   // a warm room behind the glass, even by day
            B.color(T.wood);
            for (const [a, c] of lower) {
                const n = Math.max(2, Math.round((c - a) * L / 26));
                for (let i = 1; i < n; i++) quad(a + (c - a) * i / n - 0.6 / L, a + (c - a) * i / n + 0.6 / L, z0, z1);
                quad(a, c, z1 - 3.2, z1 - 2.6);                                       // the transom
            }
            for (const [a, c] of upper) quad((a + c) / 2 - 0.5 / L, (a + c) / 2 + 0.5 / L, z2, z3);
            B.color(T.leaf); for (const [a, c] of upper) quad(a - 2 / L, c + 2 / L, z2 - 1.6, z2 + 0.4);
            // Cornice: a wood band and a cream lip along the top
            B.color(T.wood); quad(0, 1, H - 3.5, H - 1.5);
            B.color(T.cream); quad(0, 1, H - 1.5, H);
            if (front && du > 0) {
                B.color(T.cream); quad(du - dw, du + dw, 0, z1 + 1.5);
                B.color(T.wood); quad(du - dw + 2 / L, du + dw - 2 / L, 0, z1);
                B.color('rgba(255,200,120,.35)'); quad(du - dw + 6 / L, du + dw - 6 / L, z1 * 0.35, z1 - 2);
                B.color(T.wood); quad(du - 0.5 / L, du + 0.5 / L, 0, z1);
            }
        } else {
            B.color('rgba(255,186,96,.55)');
            for (const [a, c] of lower) quad(a + 2 / L, c - 2 / L, z0 + 1, z1 - 1);
            if (front && du > 0) quad(du - dw + 6 / L, du + dw - 6 / L, z1 * 0.35, z1 - 2);
            B.color('rgba(255,214,140,.42)');
            for (let i = 0; i < upper.length; i++) if ((i * 7 + f.side.charCodeAt(0)) % 3) quad(upper[i][0] + 1.5 / L, upper[i][1] - 1.5 / L, z2 + 0.8, z3 - 0.8);
        }
        B.face(-1);
    }

    // ---------------- the awnings and the signboard ----------------
    function awnings(b, B, H, emissive) {
        const T = CAFE_EXTERIOR, wy = b.y + CAFE_PLAN.D, zt = H * 0.52, zf = H * 0.34, out = 20, cx = door(b);
        if (!emissive) for (const [xa, xb] of [[b.x + 14, cx - 46], [cx + 46, b.x + CAFE_PLAN.W - 14]]) {
            const n = Math.max(2, Math.round((xb - xa) / 13)), w = (xb - xa) / n;
            for (const odd of [0, 1]) {
                B.color(odd ? T.stripeB : T.stripeA);
                for (let i = odd; i < n; i += 2) { const a = xa + i * w, c = a + w; B.quad(P(a, wy, zt), P(c, wy, zt), P(c, wy + out, zf), P(a, wy + out, zf)); }
            }
            // The scalloped valance, flat at the awning's front edge
            for (const odd of [0, 1]) {
                B.color(odd ? '#d9c7a2' : '#c2741f');
                for (let i = odd; i < n; i += 2) {
                    const mx = xa + (i + 0.5) * w, pts = [];
                    for (let j = 0; j <= 12; j++) { const a = Math.PI * j / 12; pts.push(P(mx + Math.cos(a) * w / 2, wy + out + Math.sin(a) * w / 2, zf)); }
                    B.poly(pts);
                }
            }
            B.color('rgba(58,33,22,.55)').seg(P(xa, wy + out, zf), P(xb, wy + out, zf), 0.8, SK);
        }
        // The signboard over the door: dark wood, a brass edge, "Cozy Cafe" in amber script, a little steaming cup
        const z = H * 0.62, bx = cx - 74, by = wy + 1, bw = 148, bh = 30, board = rr(bx, by, bw, bh, [2, 2, 9, 9], z);
        if (!emissive) {
            B.color('rgba(0,0,0,.35)').rect(bx + 3, by + bh, bw - 6, 3, z, M);
            K.gradPoly(B, board, bx, by, bx, by + bh, [[0, '#4a2a1a'], [1, '#2a160d']]);
            B.color('#c99a52').line(board, 1.4, true, SK);
            B.color('rgba(232,190,120,.25)').line(rr(bx + 3, by + 3, bw - 6, bh - 6, [1, 1, 7, 7], z), 0.7, true, SK);
        } else B.color('rgba(255,190,90,.55)').line(board, 1, true, SK);
        B.color(emissive ? 'rgba(255,196,96,.95)' : '#ffbf4d');
        GLText.quad(B, GLText.entry('Cozy Cafe', 25, 'Great Vibes', false), cx + 8, by + bh / 2 + 1, z, M);
        // the cup
        const ux = bx + 17, uy = by + bh / 2 + 3;
        B.color(emissive ? 'rgba(255,214,150,.8)' : T.cream).poly(rr(ux - 6, uy - 4, 11, 8, [0, 0, 4, 4], z));
        B.circleLine(ux + 6, uy, 2.4, 1.2, z, M, SK, -Math.PI / 2, Math.PI / 2);
        B.line(GLBuildingBuilder.quadPts([ux - 2, uy - 6, z, M], [ux - 4, uy - 9], [ux - 2, uy - 12], 8), 0.9, false, SK);
        B.line(GLBuildingBuilder.quadPts([ux + 2, uy - 6, z, M], [ux, uy - 9], [ux + 2, uy - 12], 8), 0.9, false, SK);
    }

    // ---------------- the hip roof ----------------
    function skylights(b, g) {
        return CAFE_PLAN.SKY.map(([xa, xb]) => {
            const f0 = 0.16, f1 = 0.5, d0 = g.half * f0, d1 = g.half * f1, z0 = g.H + CAFE_PLAN.RISE * f0, z1 = g.H + CAFE_PLAN.RISE * f1;
            return [P(b.x + xa, g.y1 - d0, z0), P(b.x + xb, g.y1 - d0, z0), P(b.x + xb, g.y1 - d1, z1), P(b.x + xa, g.y1 - d1, z1)];
        });
    }
    function roof(b, B) {
        const g = b._ccRoof(), T = CAFE_EXTERIOR, half = g.half, H = g.H, RISE = CAFE_PLAN.RISE, ry = g.y0 + half, mx = (g.x0 + g.x1) / 2;
        // Canvas paints the planes seen from behind first. A plane turns its back as the camera passes far beyond its
        // eave on the other side, so the plane whose eave normal points most away from the camera goes first: each
        // plane's sort anchor sits far out along its outward normal (distance there ~ D - (normal . camera offset)).
        const D = 1e7, eave = { N: [mx, g.y0, 0, -1], S: [mx, g.y1, 0, 1], W: [g.x0, ry, -1, 0], E: [g.x1, ry, 1, 0] };
        B.sorted(item => {
            for (const pl of g.planes) {
                const e = eave[pl.name];
                item(e[0] + e[2] * D, e[1] + e[3] * D);
                B.color(pl.fill).poly(pl.pts.map(p => P(p[0], p[1], p[2])));
                // shingle courses, parallel to the eave, between the hips, and their staggered joints
                const courses = [], ticks = [];
                for (let i = 1; i < 11; i++) {
                    const fr = i / 11, d = half * fr, z = H + RISE * fr;
                    let a, c;
                    if (pl.name === 'S') { a = [g.x0 + d, g.y1 - d]; c = [g.x1 - d, g.y1 - d]; }
                    else if (pl.name === 'N') { a = [g.x0 + d, g.y0 + d]; c = [g.x1 - d, g.y0 + d]; }
                    else if (pl.name === 'W') { a = [g.x0 + d, g.y0 + d]; c = [g.x0 + d, g.y1 - d]; }
                    else { a = [g.x1 - d, g.y0 + d]; c = [g.x1 - d, g.y1 - d]; }
                    courses.push([P(a[0], a[1], z), P(c[0], c[1], z)]);
                    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.floor(len / 16);
                    for (let j = 1; j < n; j++) {
                        const u = (j + (i % 2) * 0.5) / n; if (u >= 1) continue;
                        const fr2 = (i - 1) / 11, d2 = half * fr2, z2 = H + RISE * fr2;
                        const x = a[0] + (c[0] - a[0]) * u, y = a[1] + (c[1] - a[1]) * u;
                        const ox = pl.name === 'W' ? -(d - d2) : pl.name === 'E' ? (d - d2) : 0, oy = pl.name === 'N' ? -(d - d2) : pl.name === 'S' ? (d - d2) : 0;
                        ticks.push([P(x, y, z), P(x + ox, y + oy, z2)]);
                    }
                }
                B.color('rgba(20,10,6,.38)'); for (const [p, q] of courses) B.seg(p, q, 1);
                B.color('rgba(20,10,6,.22)'); for (const [p, q] of ticks) B.seg(p, q, 0.7);
                B.color(pl.name === 'S' ? 'rgba(255,214,160,.10)' : 'rgba(255,214,160,.05)'); for (const [p, q] of courses) B.seg(p, q, 0.6);
            }
        });
        // Hips, ridge and eaves (round caps)
        const [A, Bp, R1, R0] = g.planes[0].pts.map(p => P(p[0], p[1], p[2])), C = P(...g.planes[2].pts[1].slice(0, 3)), Dp = P(...g.planes[1].pts[0].slice(0, 3));
        const hips = [[A, R0], [Dp, R0], [Bp, R1], [C, R1], [R0, R1]];
        B.color(T.ridge); for (const [p, q] of hips) B.seg(p, q, 3.2); for (const p of [A, Dp, Bp, C, R0, R1]) cap(B, p, 3.2);
        B.color('rgba(214,160,104,.45)'); for (const [p, q] of hips) B.seg(p, q, 1);
        B.color(T.wood); for (const [p, q] of [[A, Bp], [Bp, C], [Dp, A]]) B.seg(p, q, 2.4); for (const p of [A, Bp, C, Dp]) cap(B, p, 2.4);
        // Two skylights on the front slope
        const sky = skylights(b, g);
        B.color('#2b2422'); for (const q of sky) B.poly(q);
        B.color('rgba(160,190,220,.14)'); for (const q of sky) B.poly(q);
        B.color(T.cream); for (const q of sky) B.line(q, 1.3, true);
    }

    // ---------------- the roof terrace (Canvas's cc_terrace and cc_parasols sprites, the string lights) ----------------
    function terrace(b, B, H) {
        const x = b.x, y = b.y + CAFE_PLAN.ROOF_Y1, w = CAFE_PLAN.W, h = CAFE_PLAN.D - CAFE_PLAN.ROOF_Y1, T = CAFE_EXTERIOR, R = K.plane(B, H, M);
        R.rect(x, y, w, h, T.deckLo);
        const lines = []; for (let yy = y + 7; yy < y + h; yy += 7) lines.push([x, yy, x + w, yy]);
        R.segs(lines, 1, 'rgba(30,16,8,.45)');
        B.color('rgba(160,110,70,.20)');
        for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + (r % 3) * 23; xx < x + w; xx += 70) {
            const x1 = Math.min(xx + 44, x + w + 2), y1 = Math.min(yy + 6, y + h + 2);             // (the sprite's edge clipped it)
            B.poly([R.p(xx, yy + 1), R.p(x1, yy + 1), R.p(x1, y1), R.p(xx, y1)]);
        }
        const joints = [];
        for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + 31 + (r % 4) * 17; xx < x + w; xx += 68) joints.push([xx, yy, xx, Math.min(yy + 7, y + h + 2)]);
        R.segs(joints, 1, 'rgba(30,16,8,.35)');
        // parapet on the three open sides
        R.rect(x, y, 7, h, T.brick).rect(x + w - 7, y, 7, h, T.brick).rect(x, y + h - 7, w, 7, T.brick);
        R.polyLine([[x + 3.5, y], [x + 3.5, y + h - 3.5], [x + w - 3.5, y + h - 3.5], [x + w - 3.5, y]], 2, T.cream, false);
        // a step down from the roof's eave and the roof door
        R.rect(x, y, w, 5, 'rgba(0,0,0,.35)').rect(x + 160, y, 32, 6, T.wood);
        // planters in the corners, chairs round each table
        for (const [px, py] of [[x + 16, y + h - 16], [x + w - 16, y + h - 16], [x + 16, y + 16], [x + w - 16, y + 16]]) {
            R.disc(px, py, 9, '#3a2116');
            for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + (i % 3) * 2.2; R.disc(px + Math.cos(a) * r, py + Math.sin(a) * r, 3.2, i % 2 ? T.leaf : T.leafHi); }
        }
        for (const [tx, ty] of CAFE_PLAN.PARASOLS) for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2, chx = b.x + tx + Math.cos(a) * 24, chy = b.y + ty + Math.sin(a) * 20;
            R.roundRect(chx - 5, chy - 5, 10, 10, 3, '#2b1a12').roundRectLine(chx - 5, chy - 5, 10, 10, 3, 1, '#8c6a46');
        }
        // The parasols: eight panels each, amber and cream, a wooden finial
        const PR = CAFE_PLAN.PARASOL_R, Q = K.plane(B, H + CAFE_PLAN.PARASOL_Z, M);
        for (const [tx, ty] of CAFE_PLAN.PARASOLS) {
            const px = b.x + tx, py = b.y + ty;
            Q.disc(px + 4, py + 5, PR, 'rgba(0,0,0,.25)');
            for (let i = 0; i < 8; i++) {
                const a0 = i * Math.PI / 4, a1 = a0 + Math.PI / 4;
                Q.poly([[px, py], [px + Math.cos(a0) * PR, py + Math.sin(a0) * PR], [px + Math.cos(a1) * PR, py + Math.sin(a1) * PR]], i % 2 ? T.stripeB : T.stripeA);
            }
            Q.radial(px, py, PR, px - 6, py - 6, 2, px, py, PR, [[0, 'rgba(255,240,210,.18)'], [1, 'rgba(60,30,10,.25)']]);
            const ribs = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ribs.push([px, py, px + Math.cos(a) * PR, py + Math.sin(a) * PR]); }
            Q.segs(ribs, 0.8, 'rgba(90,50,20,.55)');
            Q.disc(px, py, 2.6, T.woodHi);
        }
    }
    /** The string lights: four sagging runs, a bulb every 13 px (the world path _ccBulbs makes) */
    function bulbRuns(b) {
        const y0 = b.y + CAFE_PLAN.ROOF_Y1 + 6, y1 = b.y + CAFE_PLAN.D - 6, x0 = b.x + 6, x1 = b.x + CAFE_PLAN.W - 6;
        return [[x0, y0, x1, y1], [x1, y0, x0, y1], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]].map(([ax, ay, bx, by]) => {
            const L = Math.hypot(bx - ax, by - ay), n = Math.round(L / 13), mx = (ax + bx) / 2, my = (ay + by) / 2 + 8, bulbs = [];
            for (let i = 1; i < n; i++) { const t = i / n; bulbs.push([(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by]); }
            return { a: [ax, ay], c: [mx, my], b: [bx, by], bulbs };
        });
    }
    function lights(b, B, H, emissive) {
        const z = H + CAFE_PLAN.LIGHTS_Z, runs = bulbRuns(b);
        const wire = r => GLBuildingBuilder.quadPts([r.a[0], r.a[1], z, M], r.c, r.b, 24);
        const bulbs = col => { B.color(col); for (const r of runs) for (const [x, y] of r.bulbs) B.disc(x, y, 1.7, z, M, 10); };
        if (!emissive) {
            B.color('rgba(30,20,14,.7)'); for (const r of runs) B.line(wire(r), 0.8, false, SK);
            bulbs('#f3dfb0');
        } else {
            bulbs('rgba(255,200,110,.95)');
            B.color('rgba(255,170,60,.10)'); for (const r of runs) B.line(wire(r), 5, false, SK);
        }
    }

    // ---------------- the chimney ----------------
    function chimneyGeo(b) {
        const c = CAFE_PLAN.CHIM, x0 = b.x + c.x, y0 = b.y + c.y, x1 = x0 + c.w, y1 = y0 + c.h;
        const zb = b._ccRoofZ(x0 + c.w / 2, y0 + c.h / 2) - 4;
        return { c, x0, y0, x1, y1, zb, zt: zb + c.up, mx: x0 + c.w / 2, my: y0 + c.h / 2 };
    }
    function chimney(b, B, o, emissive) {
        const T = CAFE_EXTERIOR, { x0, y0, x1, y1, zb, zt, mx, my } = chimneyGeo(b);
        if (!emissive) {
            const side = (id, ax, ay, bx, by, fill) => {
                const q = [P(ax, ay, zb), P(bx, by, zb), P(bx, by, zt), P(ax, ay, zt)];
                B.face(id).color(fill).poly(q); B.color('rgba(232,190,140,.18)').line(q, 0.7, true);
            };
            side(o.chim.S, x0, y1, x1, y1, T.brickHi); side(o.chim.N, x0, y0, x1, y0, T.brickLo);
            side(o.chim.E, x1, y0, x1, y1, T.brick); side(o.chim.W, x0, y0, x0, y1, T.brick);
            B.face(-1);
            const top = [P(x0, y0, zt), P(x1, y0, zt), P(x1, y1, zt), P(x0, y1, zt)];
            B.color(T.brick).poly(top); B.color(T.cream).line(top, 2, true);
            B.color('#8a4a32').disc(mx, my, 8, zt, M, 20); B.color('#1a0f0b').disc(mx, my, 5, zt, M, 16);
            // Smoke: five soft puffs rising from the pot and drifting east (GLB_ANIM 25, the Cozy Cafe's smoke)
            B.color('rgb(214,206,198)');
            for (let i = 0; i < 5; i++) {
                const n = 24, base = B.n, p = P(mx, my, zt + 4);
                B.anim(25, i, 0, 0); B.vertex(p);
                for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2; B.anim(25, i, Math.cos(a), Math.sin(a)); B.vertex(p); }
                for (let j = 0; j < n; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % n);
            }
            B.anim();
        } else B.color('rgba(255,120,40,.5)').disc(mx, my, 4.5, zt, M, 16);
    }

    function drawTop(b, B, o) {
        const H = o.H;
        o.faces.forEach((f, i) => wall(b, B, f, o.faceIds[i], H, false));
        awnings(b, B, H, false);
        roof(b, B);
        terrace(b, B, H);
        lights(b, B, H, false);
        chimney(b, B, o, false);
    }

    function drawGlow(b, B, o) {
        const H = o.H;
        B.additive(true);
        o.faces.forEach((f, i) => wall(b, B, f, o.faceIds[i], H, true));
        awnings(b, B, H, true);
        B.color('rgba(255,170,80,.26)'); for (const q of skylights(b, b._ccRoof())) B.poly(q);
        lights(b, B, H, true);
        chimney(b, B, o, true);
        B.additive(false);
    }

    /** Per frame: the glow fades in with the dark as _ccDrawEmissive's (0.12 by day, 0.85 at most) */
    function update(b, r) {
        const dark = game.dayCycle().darkness;
        r.glow.alpha = Math.max(0.12, Math.min(0.85, dark));
    }

    return { build, update };
})();
