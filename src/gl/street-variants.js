// GL engine: the street variants (the city's shops and apartments) as geometry. Same art as
// buildings/street-variants.js: wall materials, shopfronts, ledges and pilasters on the walls,
// awnings, canopies and signboards on the front, each variant's roof and pavement dressing,
// and their night lights. Roofs and pavements are authored in the variant's front frame
// (x along the front, y in from the back) and mapped onto the footprint by the frame matrix.
const GLStreetVariants = (() => {
    const FH = () => CONFIG.BUILDINGS.FLOOR_HEIGHT, K = () => GLBuildingModel, FINE = 1;

    /** The frame matrix: front frame → world */
    const frameM = b => { const F = b._vFrame(), m = F.m; return [m[0], m[1], m[2], m[3], m[4] + F.ox, m[5] + F.oy]; };
    /** Clip segment a→b to a convex polygon (Cyrus-Beck); null when outside */
    function clipSeg(poly, a, b) {
        let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
        let area = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
        const sgn = area > 0 ? 1 : -1;
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length], nx = -(q[1] - p[1]) * sgn, ny = (q[0] - p[0]) * sgn;   // inward normal
            const num = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny, den = dx * nx + dy * ny;
            if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
            const t = -num / den;
            if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
            if (t0 > t1) return null;
        }
        return [a[0] + dx * t0, a[1] + dy * t0, a[0] + dx * t1, a[1] + dy * t1];
    }

    // ---------------- walls ----------------
    function faceUnder(b, B, f, F, H) {
        if (f.side === 'C') return;
        const v = b.variant, S = v.spec, front = f.side === b.facing;
        const mat = v.kind === 'shop' ? S.material : v.id === 'brownstone' ? 'brick' : null;
        const L = F.L;
        B.gate(3);
        if (mat === 'stone') {
            const hi = Math.min(1, FH() * 1.15 / H);
            B.color(S.stoneLo); F.quad(B, 0, 1, 0, hi * 0.5);
            B.color(S.stone); F.quad(B, 0, 1, hi * 0.5, hi);
            if (hi < 1) { B.color(S.steel); F.quad(B, 0, 1, hi, 1); }
            B.gate(8, FINE).color('rgba(211,166,112,.22)'); for (let u = 0.08; u < 1; u += 30 / L) F.line(B, u, 0, u, hi, 0.7);
        } else if (mat === 'brick') {
            B.gate(8, FINE).color(v.kind === 'shop' ? 'rgba(232,190,140,.16)' : 'rgba(232,200,160,.08)');
            for (let z = 2.5; z < H - 1; z += 2.5) F.line(B, 0, z / H, 1, z / H, 0.7);
        } else if (mat === 'timber' && front) {
            const top = Math.min(1, FH() * 1.05 / H);
            B.color('#25402e'); F.quad(B, 0, 1, 0, top);
            B.gate(8, FINE).color('rgba(0,0,0,.18)'); for (let u = 0; u < 1; u += 7 / L) F.line(B, u, 0, u, top, 0.6);
        } else if (mat === 'lacquer') {
            const zf = Math.max(0.6, 1 - 3.2 / H), n = Math.max(4, Math.round(L / 9));
            B.gate(8, FINE).color(GLColor.alpha(S.gold, 0.75));
            for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 0.5) / n, u2 = (i + 1) / n; F.line(B, u0, zf, u1, zf + 1.8 / H, 0.8); F.line(B, u1, zf + 1.8 / H, u2, zf, 0.8); }
        }
        if (mat === 'brick' || (v.kind === 'apt' && v.id === 'deco')) {
            const floors = Math.round(H / FH());
            B.gate(8, FINE).color(v.kind === 'shop' ? S.trim : lightenHex(b.colors.wall, 30));
            for (let i = 0; i < floors * 2; i++) {
                const z0 = i * FH() / 2 + 0.4, z1 = (i + 1) * FH() / 2 - 0.4, w = (i % 2 ? 5 : 8) / L;
                F.quad(B, 0, w, z0 / H, z1 / H); F.quad(B, 1 - w, 1, z0 / H, z1 / H);
            }
        }
        B.gate();
    }

    function shopfront(b, B, f, F, H, emissive) {
        const S = b.variant.spec, du = b._vDoorU(f), L = F.L, dw = 15 / L;
        const z0 = 1 / H, z1 = Math.min(0.96, FH() * 0.86 / H), zt = Math.min(0.98, FH() * 0.94 / H);
        const spans = du > 0 ? [[0.05, du - dw - 0.03], [du + dw + 0.03, 0.95]] : [[0.05, 0.95]];
        const frames = [], glass = [], bars = [];
        for (const [a, c] of spans) {
            if (c - a < 0.04) continue;
            frames.push([a, c, z0 * 0.4, zt]); glass.push([a + 1.6 / L, c - 1.6 / L, z0, z1]);
            const n = Math.max(1, Math.round((c - a) * L / (S.id === 'boutique' ? 30 : 20)));
            for (let i = 1; i < n; i++) { const u = a + (c - a) * i / n; bars.push([u - 0.6 / L, u + 0.6 / L, z0, z1]); }
            if (S.id !== 'lounge') bars.push([a + 1.6 / L, c - 1.6 / L, z1 - 1.6 / H, z1 - 1 / H]);
        }
        const fill = (list, col) => { B.color(col); for (const q of list) F.quad(B, ...q); };
        if (emissive) {
            if (du > 0) glass.push([du - dw + 4 / L, du + dw - 4 / L, z1 * 0.3, z1 * 0.95]);
            fill(glass, S.id === 'lounge' ? hexToRgba(b.variant.neon, 0.45) : S.id === 'florist' ? 'rgba(255,236,190,.5)' : 'rgba(255,190,110,.55)');
            return;
        }
        fill(frames, S.frame); fill(glass, S.glass); fill(glass, S.id === 'lounge' ? 'rgba(180,140,255,.14)' : 'rgba(255,200,120,.14)'); fill(bars, S.mull);
        if (du > 0) {
            fill([[du - dw, du + dw, 0, zt]], S.frame);
            fill([[du - dw + 2 / L, du + dw - 2 / L, 0, z1]], S.id === 'lounge' ? S.velvetLo : S.mull);
            fill([[du - dw + 4 / L, du + dw - 4 / L, z1 * 0.3, z1 * 0.95]], 'rgba(255,200,120,.3)');
        }
    }

    function faceOver(b, B, faces, ids, H) {
        const v = b.variant, S = v.spec, floors = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS);
        const edges = [], finList = [];
        faces.forEach((f, i) => {
            if (f.side === 'C') return;
            const id = ids[i], F = new GLFace(f, H), L = F.L, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
            edges.push({ a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny, face: id });
            const cols = Math.max(1, Math.floor(L / 26));
            B.face(id).gate(3);
            if (v.kind === 'shop' && f.side === b.facing) shopfront(b, B, f, F, H, false);
            if (v.kind === 'apt') {
                B.gate(floors * 2.4, FINE);
                if (v.id === 'brownstone') {
                    B.color('rgba(232,214,180,0.55)');
                    for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) F.line(B, (c + 0.2) / cols, (fl + 0.84) / floors, (c + 0.8) / cols, (fl + 0.84) / floors, 1.1);
                } else if (v.id === 'loft') {
                    const sp = [], mu = [];
                    for (let fl = 1; fl <= floors; fl++) sp.push([0, 1, (fl - 0.16) / floors, Math.min(1, (fl + 0.06) / floors)]);
                    for (let c = 0; c <= cols; c++) mu.push([Math.max(0, c / cols - 0.9 / L), Math.min(1, c / cols + 0.9 / L), 0, 1]);
                    B.color('rgba(18,20,26,0.82)'); for (const q of sp) F.quad(B, ...q); for (const q of mu) F.quad(B, ...q);
                    B.color('rgba(214,190,150,0.22)'); for (const q of sp) B.line([F.at(q[0], q[2]), F.at(q[1], q[2]), F.at(q[1], q[3]), F.at(q[0], q[3])], 0.6, true);
                    B.color(lightenHex(b.colors.wall, 26)); F.quad(B, 0, 1, 0, 0.3 / floors);
                }
            }
            B.gate();
            if ((v.kind === 'shop' && v.id === 'lounge') || (v.kind === 'apt' && v.id === 'deco'))
                for (let c = 0; c <= cols; c++) finList.push({ x: f.x1 + (f.x2 - f.x1) * c / cols, y: f.y1 + (f.y2 - f.y1) * c / cols, nx: f.nx, ny: f.ny, face: id, gated: true });
        });
        B.face(-1);
        const G = K(), FHv = FH();
        // fins only where their face shows 3 px of wall (as Canvas skipped those faces)
        const finsGated = (list, ...args) => { B.gate(3); G.fins(B, list, ...args); B.gate(); };
        if (v.kind === 'shop') {
            if (finList.length) finsGated(finList, 0, H - 2, 3, 2, '#2a1e33', hexToRgba(v.neon, 0.55));
            const lipC = S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#e8e2cc' : S.gold;
            if (S.id !== 'florist') G.ledge(B, edges, FHv * 1.02, 1.6, 1.2, darkenHex(S.wall, -18), darkenHex(S.wall, 10), hexToRgba(lipC, 0.6));
            G.ledge(B, edges, H, 2.6, 2.2, S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#d9d2b8' : S.id === 'boutique' ? '#5d303e' : '#2a2030',
                    S.id === 'bakery' ? '#3a2116' : S.id === 'florist' ? '#1f2a22' : '#24161e', hexToRgba(lipC, 0.85));
        } else {
            const wall = b.colors.wall, top = lightenHex(wall, 24), band = darkenHex(wall, 4);
            if (v.id === 'deco') {
                if (finList.length) finsGated(finList, 0, H, 3.5, 2.2, lightenHex(wall, 14), 'rgba(226,198,146,0.55)');
                for (let fl = 3; fl < floors; fl += 3) G.ledge(B, edges, fl * FHv, 2.2, 1.4, 'rgba(216,183,122,0.85)', darkenHex(wall, 2), 'rgba(243,221,176,0.6)');
                G.ledge(B, edges, H, 3.4, 3, top, band, 'rgba(243,221,176,0.75)');
            } else if (v.id === 'brownstone') {
                G.ledge(B, edges, FHv, 1.8, 1.4, top, band, 'rgba(239,220,182,0.5)');
                G.ledge(B, edges, H, 4, 3.2, lightenHex(wall, 30), darkenHex(wall, 6), 'rgba(239,220,182,0.75)');
            } else if (v.id === 'terrace') {
                G.ledge(B, edges, FHv * 0.35, 1.6, FHv * 0.35, top, lightenHex(wall, 10), null);
                const ve = [];
                faces.forEach((f, i) => { if (f.side !== b.facing || f.side === 'C') return; const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
                    ve.push({ a: [f.x1 + ux * 10, f.y1 + uy * 10], b: [f.x2 - ux * 10, f.y2 - uy * 10], nx: f.nx, ny: f.ny, face: ids[i] }); });
                if (ve.length) { B.gate(0, FINE); for (let fl = 1; fl < floors; fl += 2) G.veranda(B, ve, fl * FHv + 0.6, 6, 6, 3.4, lightenHex(wall, 34), darkenHex(wall, 2), 'rgba(236,230,244,0.75)'); B.gate(); }
                G.ledge(B, edges, H, 3, 2.4, top, band, 'rgba(240,236,228,0.6)');
            } else G.ledge(B, edges, H, 2.4, 2, '#2a2e36', '#14171d', 'rgba(214,190,150,0.55)');
        }
    }

    // ---------------- the street front: awnings, canopies, signboards ----------------
    function front(b, B, emissive) {
        const v = b.variant, S = v.spec, FHv = FH(), g = b._frontGeo(), G = K();
        const F = b._vFrame(), half = F.fw / 2, door = F.door - half, side = b.facing === 'N' || b.facing === 'E' ? -1 : 1;
        const size = S.id === 'bakery' || S.id === 'florist' ? 15 : 17;
        const tw = Math.min(F.fw - 40, GLText.measure(v.name, size, 'Great Vibes') + 26);
        const fp = (s, o, z) => [g.cx + g.ux * s + g.nx * o, g.cy + g.uy * s + g.ny * o, z, 1];
        const E = b._entrance() || g, os = E.ny > 0 ? 1 : -1;
        /** a flat board at height z, o out from the wall at the door, x along the front */
        const board = (z, o, fn) => {
            const c = E.nx ? Math.cos(E.nx * Math.PI / 2) : 1, s = E.nx ? Math.sin(E.nx * Math.PI / 2) : 0;
            B.inFrame([c, s, -s, c, E.cx + E.nx * o, E.cy + E.ny * o], () => fn(G.plane(B, z, 1)));
        };
        const addText = (z, o, x, y, color) => {
            const c = E.nx ? Math.cos(E.nx * Math.PI / 2) : 1, s = E.nx ? Math.sin(E.nx * Math.PI / 2) : 0;
            const e = GLText.entry(v.name, size, 'Great Vibes');
            B.inFrame([c, s, -s, c, E.cx + E.nx * o, E.cy + E.ny * o], () => { B.color(color); GLText.quad(B, e, x, y, z, 1); });
        };
        if (S.id === 'bakery' || S.id === 'florist') {
            const zt = FHv * 0.98, zf = FHv * 0.56, out = 13, [ca, cb] = v.awning;
            if (!emissive) {
                const A = [], Bq = [], sa = [];
                for (const [s0, s1] of [[-half + 8, door * side - tw / 2 - 2], [door * side + tw / 2 + 2, half - 8]]) {
                    if (s1 - s0 < 16) continue;
                    const n = Math.max(2, Math.round((s1 - s0) / 11)), w = (s1 - s0) / n;
                    for (let i = 0; i < n; i++) { const a = s0 + i * w, c = a + w; (i % 2 ? Bq : A).push([fp(a, 0, zt), fp(c, 0, zt), fp(c, out, zf), fp(a, out, zf)]); }
                    sa.push([s0, s1, n, w]);
                }
                B.color(ca); for (const q of A) B.poly(q);
                B.color(cb); for (const q of Bq) B.poly(q);
                if (sa.length) {
                    B.gate(0, FINE);
                    const half0 = [], half1 = [], a0 = Math.atan2(g.ny, g.nx) - Math.PI / 2;
                    for (const [s0, , n, w] of sa) for (let i = 0; i < n; i++) {
                        const m = s0 + (i + 0.5) * w, x = g.cx + g.ux * m + g.nx * out, y = g.cy + g.uy * m + g.ny * out, pts = [];
                        for (let k = 0; k <= 10; k++) { const a = a0 + Math.PI * k / 10; pts.push([x + Math.cos(a) * w / 2, y + Math.sin(a) * w / 2, zf, 1]); }
                        (i % 2 ? half1 : half0).push(pts);
                    }
                    B.color(darkenHex(ca, 22)); for (const p of half0) B.poly(p);
                    B.color(darkenHex(cb, 26)); for (const p of half1) B.poly(p);
                    B.gate();
                }
            }
            board(FHv * 1.12, 1, P => {
                const bh = 17, y0 = os > 0 ? 0 : -bh, r = os > 0 ? [2, 2, 7, 7] : [7, 7, 2, 2];
                if (!emissive) {
                    P.rect(-tw / 2 + 3, y0 + (os > 0 ? bh : -3), tw - 6, 3, 'rgba(0,0,0,.32)');
                    P.roundRect(-tw / 2, y0, tw, bh, r, S.board[0]); P.roundRectLine(-tw / 2, y0, tw, bh, r, 1.2, S.edge);
                } else P.roundRectLine(-tw / 2, y0, tw, bh, r, 1, 'rgba(255,200,120,.4)');
            });
            { const bh = 17, y0 = os > 0 ? 0 : -bh; addText(FHv * 1.12, 1, 0, y0 + bh / 2 + 1, emissive ? S.glow : S.ink); }
        } else {
            const z = FHv * 1.04, out = S.id === 'lounge' ? 20 : 17, cw = Math.max(64, tw + 6), s = door * side;
            const a = b._frontPt0(s - cw / 2), c = b._frontPt0(s + cw / 2);
            if (!emissive) G.ledge(B, [{ a, b: c, nx: g.nx, ny: g.ny }], z, out, 2.6, S.id === 'lounge' ? S.velvet : '#171a21', S.id === 'lounge' ? S.velvetLo : '#0e1116', S.gold);
            else if (S.id === 'lounge') {
                const n = Math.round(cw / 7);
                B.color('rgba(255,226,170,.95)');
                for (let i = 0; i <= n; i++) { const ss = s - cw / 2 + cw * i / n; B.disc(g.cx + g.ux * ss + g.nx * out, g.cy + g.uy * ss + g.ny * out, 1.2, z, 1, 10); }
            }
            addText(z, 0, 0, os * out / 2 + 1, emissive ? S.glow : S.ink);
        }
    }

    // ---------------- roofs (in the front frame) ----------------
    function shopRoof(b, B, H) {
        const v = b.variant, S = v.spec, F = b._vFrame(), fw = F.fw, fd = F.fd;
        B.inFrame(frameM(b), () => {
            const c = K().plane(B, H);
            if (S.id === 'bakery') {
                const long = fw >= fd, half = Math.min(fw, fd) / 2, A = [0, 0], Bp = [fw, 0], C = [fw, fd], D = [0, fd];
                const R0 = long ? [half, fd / 2] : [fw / 2, half], R1 = long ? [fw - half, fd / 2] : [fw / 2, fd - half];
                const planes = long ? [[[A, Bp, R1, R0], '#3f251c', [0, 1]], [[D, A, R0], '#4e2c1f', [1, 0]], [[Bp, C, R1], '#5c3424', [-1, 0]], [[C, D, R0, R1], '#7a4432', [0, -1]]]
                                    : [[[A, Bp, R0], '#3f251c', [0, 1]], [[D, A, R0, R1], '#4e2c1f', [1, 0]], [[Bp, C, R1, R0], '#5c3424', [-1, 0]], [[C, D, R1], '#7a4432', [0, -1]]];
                for (const [pts, col, n] of planes) {
                    c.poly(pts, col);
                    const e0 = pts[0], e1 = pts[1], L = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), ux = (e1[0] - e0[0]) / L, uy = (e1[1] - e0[1]) / L;
                    const clipped = list => list.map(([ax, ay, bx, by]) => clipSeg(pts, [ax, ay], [bx, by])).filter(Boolean);
                    const courses = [], joints = [], hi = [];
                    for (let d = 6; d < half; d += 6) courses.push([e0[0] + n[0] * d - ux * 400, e0[1] + n[1] * d - uy * 400, e0[0] + n[0] * d + ux * 400, e0[1] + n[1] * d + uy * 400]);
                    for (let d = 0, r = 0; d < half; d += 6, r++) for (let t = -400 + (r % 2) * 6; t < 400; t += 12) {
                        const x = e0[0] + n[0] * d + ux * t, y = e0[1] + n[1] * d + uy * t; joints.push([x, y, x + n[0] * 6, y + n[1] * 6]);
                    }
                    for (let d = 7; d < half; d += 6) hi.push([e0[0] + n[0] * d - ux * 400, e0[1] + n[1] * d - uy * 400, e0[0] + n[0] * d + ux * 400, e0[1] + n[1] * d + uy * 400]);
                    c.segs(clipped(courses), 1, 'rgba(20,10,6,.38)');
                    c.segs(clipped(joints), 0.7, 'rgba(20,10,6,.22)');
                    c.segs(clipped(hi), 0.6, 'rgba(255,214,160,.07)');
                }
                const ridge = [];
                for (const P of [A, Bp, C, D]) { const R = Math.hypot(P[0] - R0[0], P[1] - R0[1]) < Math.hypot(P[0] - R1[0], P[1] - R1[1]) ? R0 : R1; ridge.push([P[0], P[1], R[0], R[1]]); }
                ridge.push([R0[0], R0[1], R1[0], R1[1]]);
                c.segs(ridge, 3.2, '#2a1711', GLB_LINE.SQUARE); c.segs(ridge, 1, 'rgba(214,160,104,.42)', GLB_LINE.SQUARE);
                c.rectLine(1.2, 1.2, fw - 2.4, fd - 2.4, 2.4, '#3a2116');
                const cx = fw * 0.24, cy = Math.min(fd * 0.24, half * 0.55);
                c.rect(cx + 4, cy + 5, 18, 18, 'rgba(0,0,0,.35)'); c.rect(cx - 9, cy - 9, 18, 18, '#6a3426');
                c.rectLine(cx - 9, cy - 9, 18, 18, 1.6, S.trim);
                const rows = []; for (let y = cy - 6; y < cy + 9; y += 3) rows.push([cx - 9, y, cx + 9, y]);
                c.segs(rows, 0.6, 'rgba(232,190,140,.25)');
                c.disc(cx, cy, 5, '#8a4a32'); c.disc(cx, cy, 3, '#1a0f0b');
                for (const [x, y, w, h] of b._vSkylights(S, fw, fd)) {
                    c.rect(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); c.rect(x, y, w, h, '#2b2422'); c.rect(x, y, w, h, 'rgba(160,190,220,.16)');
                    c.rectLine(x, y, w, h, 1.4, S.trim); c.segs([[x + w / 2, y, x + w / 2, y + h]], 0.8, S.trim);
                }
            } else if (S.id === 'florist') {
                c.rect(0, 0, fw, fd, '#6a4a3c');
                for (let y = 0, r = 0; y < fd; y += 14, r++) for (let x = (r % 2) * 14; x < fw; x += 28) c.rect(x, y, Math.min(14, fw - x), Math.min(14, fd - y), 'rgba(255,220,190,.06)');
                const grid = []; for (let x = 14; x < fw; x += 14) grid.push([x, 0, x, fd]); for (let y = 14; y < fd; y += 14) grid.push([0, y, fw, y]);
                c.segs(grid, 0.8, 'rgba(30,16,10,.3)');
                const bed = (x, y, w, h) => {
                    c.rect(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); c.rect(x, y, w, h, '#4a2e1c'); c.rectLine(x + 0.5, y + 0.5, w - 1, h - 1, 1, '#6b4a2e');
                    const n = Math.round(w * h / 40);
                    for (let i = 0; i < n; i++) c.disc(x + 3 + (i * 37 % Math.max(1, w - 6)), y + 3 + (i * 17 % Math.max(1, h - 6)), 3.2, ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]);
                    for (let i = 0; i < n / 3; i++) c.disc(x + 4 + (i * 53 % Math.max(1, w - 8)), y + 4 + (i * 23 % Math.max(1, h - 8)), 1.5, ['#f2c14e', '#e86a8c', '#f6ecd8', '#b58cff'][i % 4]);
                };
                bed(8, 8, fw - 96, 18); bed(8, 30, 18, fd - 70); bed(fw - 26, fd - 92, 18, 60);
                const gx = fw - 82, gy = 8, gw = 74, gh = 56;
                c.rect(gx + 3, gy + 4, gw, gh, 'rgba(0,0,0,.3)'); c.rect(gx, gy, gw, gh, 'rgba(176,214,200,.45)');
                for (let i = 0; i < 9; i++) c.disc(gx + 9 + (i * 23 % (gw - 16)), gy + 10 + (i * 13 % (gh - 18)), 4, i % 2 ? '#3c7d44' : '#5c9a4c');
                c.rect(gx, gy, gw, gh / 2, 'rgba(230,245,240,.18)');
                c.rectLine(gx, gy, gw, gh, 1.4, '#eef0e6');
                const mull = []; for (let x = gx + gw / 4; x < gx + gw - 1; x += gw / 4) mull.push([x, gy, x, gy + gh]); mull.push([gx, gy + gh / 2, gx + gw, gy + gh / 2]);
                c.segs(mull, 0.8, '#eef0e6');
                c.rect(fw / 2 - 20, fd - 24, 40, 8, '#6b4a2e'); c.rectLine(fw / 2 - 20, fd - 24, 40, 8, 0.8, 'rgba(0,0,0,.35)');
                for (const x of [fw / 2 - 34, fw / 2 + 34]) { c.disc(x, fd - 20, 6, '#9a5a3a'); c.disc(x, fd - 21, 4.5, '#4f8a46'); }
                c.rectLine(2.5, 2.5, fw - 5, fd - 5, 5, '#3a4a3c');
                c.rectLine(5.5, 5.5, fw - 11, fd - 11, 1, 'rgba(232,226,204,.6)');
            } else if (S.id === 'boutique') {
                c.grad([[0, 0], [fw, 0], [fw, fd], [0, fd]], 0, 0, fw, fd, [[0, '#382934'], [0.5, '#2d242c'], [1, '#201e27']]);
                const lines = []; for (let y = 18; y < fd; y += 30) lines.push([8, y, fw - 8, y]);
                c.segs(lines, 1, 'rgba(143,86,107,.22)');
                const [lx, ly, lw, lh] = b._vLantern(fw, fd);
                const lpts = GLBuildingBuilder.roundRectPts(lx, ly, lw, lh, 14).map(p => [p[0], p[1]]);
                c.grad(lpts, lx, ly, lx + lw, ly + lh, [[0, '#3b3439'], [0.52, '#514034'], [1, '#23282d']]);
                c.rect(lx + 6, ly + 6, lw - 12, lh - 12, 'rgba(195,145,91,.12)');
                const cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40));
                for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
                    const cx = lx + lw * (i + 0.5) / cols, cy = ly + lh * (j + 0.5) / rows;
                    c.ring(cx, cy, 7, 1, 'rgba(181,136,83,.65)');
                    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.disc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1, '#ceaa73'); }
                }
                c.poly([[lx, ly], [lx + lw * 0.45, ly], [lx + lw, ly + lh * 0.8], [lx + lw, ly + lh], [lx + lw * 0.75, ly + lh]], 'rgba(183,193,211,.08)');
                const bars = [];
                for (let i = 1; i < cols * 2; i++) { const x = lx + lw * i / (cols * 2); bars.push([x, ly, x, ly + lh]); }
                for (let j = 1; j < rows * 2; j++) { const y = ly + lh * j / (rows * 2); bars.push([lx, y, lx + lw, y]); }
                c.segs(bars, 4, '#1d2028'); c.segs(bars, 0.8, 'rgba(221,197,153,.2)');
                c.roundRectLine(lx, ly, lw, lh, 14, 3, S.steel);
                c.roundRectLine(lx + 3, ly + 3, lw - 6, lh - 6, 11, 1, 'rgba(208,172,114,.62)');
                for (const x of [16, fw - 34]) { c.rect(x + 2, 14, 18, 12, 'rgba(0,0,0,.35)'); c.rect(x, 12, 18, 12, '#2a2e36'); c.rectLine(x + 0.5, 12.5, 17, 11, 0.8, 'rgba(208,172,114,.35)'); }
                c.rectLine(3, 3, fw - 6, fd - 6, 6, S.stone);
                c.rectLine(6.5, 6.5, fw - 13, fd - 13, 1.2, 'rgba(230,199,153,.7)');
            } else {
                c.grad([[0, 0], [fw, 0], [fw, fd], [0, fd]], 0, 0, fw, fd, [[0, '#221829'], [1, '#130e18']]);
                const lines = []; for (let x = 12; x < fw; x += 12) lines.push([x, 6, x, fd - 6]);
                c.segs(lines, 1, 'rgba(217,178,106,.08)');
                const [dx, dy, r] = b._vDome(fw, fd), rays = [];
                for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; rays.push([dx + Math.cos(a) * r * 1.12, dy + Math.sin(a) * r * 1.12, dx + Math.cos(a) * r * (i % 2 ? 1.36 : 1.55), dy + Math.sin(a) * r * (i % 2 ? 1.36 : 1.55)]); }
                c.segs(rays, 1, 'rgba(217,178,106,.5)');
                c.disc(dx + 3, dy + 4, r, 'rgba(0,0,0,.4)');
                c.radial(dx, dy, r, dx - r * 0.35, dy - r * 0.35, r * 0.1, dx, dy, r, [[0, '#4a3a66'], [0.6, '#2a1f3a'], [1, '#120c19']]);
                const spokes = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; spokes.push([dx + Math.cos(a) * r * 0.2, dy + Math.sin(a) * r * 0.2, dx + Math.cos(a) * r, dy + Math.sin(a) * r]); }
                c.segs(spokes, 0.8, 'rgba(217,178,106,.45)'); c.ring(dx, dy, r * 0.55, 0.8, 'rgba(217,178,106,.45)');
                c.ring(dx, dy, r, 2.6, S.gold);
                c.disc(dx, dy, r * 0.18, S.gold); c.disc(dx + r * 0.08, dy - r * 0.05, r * 0.16, '#2a1f3a');
                for (const x of [18, fw - 18]) { c.disc(x, 18, 7, '#0d0a11'); c.ring(x, 18, 7, 1, 'rgba(217,178,106,.5)'); }
                c.rectLine(3, 3, fw - 6, fd - 6, 6, '#2a2030');
                c.rectLine(6.5, 6.5, fw - 13, fd - 13, 1.4, S.gold);
            }
        });
    }

    function aptRoof(b, B, H) {
        const S = b.variant.spec, F = b._vFrame(), fw = F.fw, fd = F.fd;
        B.inFrame(frameM(b), () => {
            const c = K().plane(B, H);
            if (S.id === 'brownstone') {
                const col = 'rgba(255,232,200,.10)';
                c.rect(0, 0, fw, 7, col); c.rect(0, fd - 7, fw, 7, col); c.rect(0, 7, 7, fd - 14, col); c.rect(fw - 7, 7, 7, fd - 14, col);
                const ticks = [];
                for (let x = 12; x < fw; x += 12) ticks.push([x, 0, x, 7], [x, fd - 7, x, fd]);
                for (let y = 12; y < fd; y += 12) ticks.push([0, y, 7, y], [fw - 7, y, fw, y]);
                c.segs(ticks, 0.8, 'rgba(0,0,0,.28)');
                for (const x of [fw * 0.36, fw * 0.6]) {
                    c.rect(x + 3, 6, 22, 12, 'rgba(0,0,0,.35)'); c.rect(x, 3, 22, 11, '#5a2e24'); c.rectLine(x + 0.5, 3.5, 21, 10, 1, 'rgba(239,220,182,.6)');
                    for (let i = 0; i < 3; i++) { c.disc(x + 4.5 + i * 6.5, 8.5, 2.4, '#8a4a32'); c.disc(x + 4.5 + i * 6.5, 8.5, 1.2, '#1a0f0b'); }
                }
            } else if (S.id === 'deco') {
                const col = 'rgba(255,240,215,.09)';
                for (const [x, y, sx, sy] of [[0, 0, 1, 1], [fw, 0, -1, 1], [fw, fd, -1, -1], [0, fd, 1, -1]]) {
                    c.rect(Math.min(x, x + sx * 34), Math.min(y, y + sy * 12), 34, 12, col); c.rect(Math.min(x, x + sx * 12), Math.min(y, y + sy * 34), 12, 34, col);
                    c.rect(Math.min(x, x + sx * 20), Math.min(y, y + sy * 20), 20, 20, col);
                }
                c.rectLine(9.5, 9.5, fw - 19, fd - 19, 1, 'rgba(216,183,122,.55)');
                c.rectLine(13.5, 13.5, fw - 27, fd - 27, 1, 'rgba(216,183,122,.3)');
                for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) c.disc(x, y, 2, STREET_GOLD);
            } else if (S.id === 'terrace') {
                const trough = (x, y, w, h) => {
                    c.rect(x + 2, y + 2, w, h, 'rgba(0,0,0,.3)'); c.rect(x, y, w, h, '#4a2e1c');
                    const n = Math.round(w * h / 36);
                    for (let i = 0; i < n; i++) c.disc(x + 3 + (i * 29 % Math.max(1, w - 6)), y + 3 + (i * 11 % Math.max(1, h - 6)), 2.8, ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]);
                    for (let i = 0; i < n / 4; i++) c.disc(x + 4 + (i * 41 % Math.max(1, w - 8)), y + 3 + (i * 7 % Math.max(1, h - 6)), 1.3, ['#f2c14e', '#e86a8c', '#f6ecd8'][i % 3]);
                };
                c.rect(8, fd - 34, fw - 16, 22, 'rgba(166,118,78,.22)');
                const deck = []; for (let x = 14; x < fw - 8; x += 6) deck.push([x, fd - 34, x, fd - 12]);
                c.segs(deck, 0.8, 'rgba(40,24,12,.3)');
                trough(6, fd - 12, fw - 12, 7); trough(6, fd * 0.45, 7, fd * 0.45 - 14); trough(fw - 13, fd * 0.45, 7, fd * 0.45 - 14);
            } else {
                const grid = []; for (let x = 20; x < fw; x += 20) grid.push([x, 8, x, fd - 8]); for (let y = 20; y < fd; y += 20) grid.push([8, y, fw - 8, y]);
                c.segs(grid, 1, 'rgba(255,255,255,.04)');
                for (let x = fw * 0.32; x < fw * 0.84; x += 24) {
                    c.rect(x + 2, 5, 18, 10, 'rgba(0,0,0,.35)'); c.rect(x, 3, 18, 10, '#3a4250'); c.rect(x + 1.5, 4.5, 15, 4, 'rgba(176,196,220,.25)');
                    c.rectLine(x + 0.5, 3.5, 17, 9, 1, '#1c2028');
                }
                c.rectLine(2.5, 2.5, fw - 5, fd - 5, 5, 'rgba(16,18,24,.55)');
                c.rectLine(5.5, 5.5, fw - 11, fd - 11, 0.8, 'rgba(214,190,150,.35)');
            }
        });
    }

    // ---------------- the pavement in front ----------------
    function base(b, B) {
        const v = b.variant, S = v.spec, F = b._vFrame(), fw = F.fw, fd = F.fd, door = Math.round(F.door);
        B.inFrame(frameM(b), () => {
            const c = K().plane(B, 0), dot = (x, y, r, col) => c.disc(x, y, r, col);
            let y = fd;
            if (v.kind === 'apt') {
                c.rect(door - 20, y + 2, 44, 14, 'rgba(0,0,0,.3)');
                c.rect(door - 22, y, 44, 13, S.id === 'loft' ? '#3a3e46' : S.id === 'deco' ? '#4a4038' : '#5a4a44');
                c.segs([[door - 22, y + 4.5, door + 22, y + 4.5], [door - 22, y + 8.5, door + 22, y + 8.5]], 1, 'rgba(232,214,180,.35)');
                for (const x of [door - 34, door + 34]) { c.rect(x - 6, y + 3, 14, 12, 'rgba(0,0,0,.3)'); c.rect(x - 7, y + 1, 14, 11, '#3a2a22'); dot(x, y + 6, 5, '#3c7d44'); dot(x - 2, y + 5, 2.4, '#5c9a4c'); }
                return;
            }
            y += 16;
            if (S.id === 'bakery') {
                c.rect(12, y + 4, 44, 12, 'rgba(0,0,0,.3)'); c.rect(10, y + 2, 44, 12, '#3a2116'); c.rectLine(10.5, y + 2.5, 43, 11, 1, '#5d3a24');
                for (let i = 0; i < 13; i++) dot(14 + (i * 37 % 38), y + 5 + (i * 13 % 7), 3.2, i % 3 ? '#4f7d43' : '#77a25d');
                for (let i = 0; i < 7; i++) dot(15 + i * 6, y + 6 + (i % 2) * 4, 1.5, ['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3]);
                const bx = door + 62;
                c.rect(bx + 2, y + 9, 16, 12, 'rgba(0,0,0,.3)'); c.rect(bx, y + 6, 16, 12, '#5d3a24'); c.rect(bx + 2, y + 8, 12, 8, '#1f2421');
                c.segs([[bx + 3.5, y + 10.5, bx + 12, y + 10.5], [bx + 3.5, y + 13.5, bx + 10, y + 13.5]], 0.8, 'rgba(240,235,220,.75)');
                const tx = fw - 24, ty = y + 15;
                c.ellipse(tx + 2, ty + 3, 11, 9, 0, 'rgba(0,0,0,.3)');
                for (const dx of [-13, 13]) { c.roundRect(tx + dx - 4.5, ty - 4.5, 9, 9, 2.5, '#2b1a12'); c.roundRectLine(tx + dx - 4.5, ty - 4.5, 9, 9, 2.5, 0.8, '#8c6a46'); }
                dot(tx, ty, 8, '#efe4cc'); c.ring(tx, ty, 8, 1.2, '#7a5a38');
                dot(tx - 2.5, ty - 1.5, 2.2, '#fff'); dot(tx - 2.5, ty - 1.5, 1.3, '#5b3420'); dot(tx + 3, ty + 2, 1.4, '#ffc66a');
            } else if (S.id === 'florist') {
                for (const [x0, x1] of [[10, door - 34], [door + 34, fw - 10]]) {
                    if (x1 - x0 < 20) continue;
                    c.rect(x0 + 2, y + 4, x1 - x0, 16, 'rgba(0,0,0,.3)'); c.rect(x0, y + 2, x1 - x0, 15, '#6b4a2e'); c.rectLine(x0 + 0.5, y + 2.5, x1 - x0 - 1, 14, 0.8, '#8c6a46');
                    for (let x = x0 + 7, i = 0; x < x1 - 4; x += 11, i++) {
                        dot(x, y + 9.5, 5.2, '#5a6a72');
                        const col = ['#e86a8c', '#f2c14e', '#f6ecd8', '#b58cff', '#ff8a5c', '#d94a6a'][(i * 5 + x0) % 6];
                        for (let k = 0; k < 6; k++) dot(x + Math.cos(k * 1.1) * 3, y + 9.5 + Math.sin(k * 1.1) * 3, 2.1, k % 3 ? col : '#4f8a46');
                    }
                }
            } else if (S.id === 'boutique') {
                for (const x of [door - 62, door + 62]) {
                    dot(x + 3, y + 14, 10, 'rgba(0,0,0,.35)');
                    const pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; pts.push([x + Math.cos(a) * 9.5, y + 12 + Math.sin(a) * 7.5]); }
                    c.grad(pts, x - 9, 0, x + 9, 0, [[0, '#58432c'], [0.45, S.gold], [1, '#755539']]);
                    c.polyLine(pts, 0.8, S.goldHi, true);
                    dot(x, y + 10, 8, '#294b36'); dot(x - 2.5, y + 7.5, 4.2, '#547654');
                    for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + i % 3 * 1.8; dot(x + Math.cos(a) * r, y + 10 + Math.sin(a) * r, 1.6, 'rgba(124,159,103,.45)'); }
                }
            } else {
                c.rect(door - 10, fd + 2, 24, y + 30 - fd, 'rgba(0,0,0,.3)');
                c.rect(door - 12, fd, 24, y + 31 - fd, '#8e1a34');
                c.segs([[door - 11.5, fd, door - 11.5, y + 31], [door + 11.5, fd, door + 11.5, y + 31]], 1, S.gold);
                for (const s of [-1, 1]) {
                    const posts = [[door + s * 44, y + 6], [door + s * 60, y + 6], [door + s * 76, y + 6], [door + s * 44, y + 26]];
                    for (let i = 0; i < 2; i++) { const [ax, ay] = posts[i], [bx, by] = posts[i + 1]; c.polyLine(GLBuildingBuilder.quadPts([ax, ay], [(ax + bx) / 2, ay + 5], [bx, by], 10), 2, '#b0204a'); }
                    c.polyLine(GLBuildingBuilder.quadPts(posts[0], [posts[0][0] + s * 4, y + 16], posts[3], 10), 2, '#b0204a');
                    for (const [x, yy] of posts) { dot(x + 1, yy + 1.5, 3, 'rgba(0,0,0,.35)'); dot(x, yy, 2.8, S.gold); dot(x - 0.7, yy - 0.7, 1.1, '#fff2cf'); }
                }
            }
        });
    }

    // ---------------- the night ----------------
    function glow(b, B, faces, ids, H) {
        const v = b.variant, S = v.spec, G = K();
        B.additive();
        if (v.kind === 'shop') {
            faces.forEach((f, i) => { if (f.side === b.facing && f.side !== 'C') { B.face(ids[i]).gate(3); shopfront(b, B, f, new GLFace(f, H), H, true); B.gate(); } });
            B.face(-1);
            if (S.id === 'lounge') {
                const list = [];
                faces.forEach((f, i) => { if (f.side === 'C') return; const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), cols = Math.max(1, Math.floor(L / 26));
                    for (let c = 0; c <= cols; c++) list.push({ x: f.x1 + (f.x2 - f.x1) * c / cols, y: f.y1 + (f.y2 - f.y1) * c / cols, nx: f.nx, ny: f.ny, face: ids[i] }); });
                G.fins(B, list, 1, H - 2, 1.4, 2.4, hexToRgba(v.neon, 0.85), null);
            }
            front(b, B, true);
        } else if (v.id === 'deco' || v.id === 'terrace') {
            const edges = []; faces.forEach((f, i) => { if (f.side !== 'C') edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny, face: ids[i] }); });
            const out = v.id === 'deco' ? 3.4 : 3;
            B.anim(GLB_ANIM.RIM).color(GLColor.alpha(b.colors.accent || '#ffcf8a', 0.6));
            for (const e of edges) B.face(e.face).seg([e.a[0] + e.nx * out, e.a[1] + e.ny * out, H, 1], [e.b[0] + e.nx * out, e.b[1] + e.ny * out, H, 1], 0.9);
            B.anim().face(-1);
        }
        B.additive(false);
    }

    function roofGlow(b, B, H) {
        const v = b.variant, S = v.spec, F = b._vFrame(), fw = F.fw, fd = F.fd;
        B.inFrame(frameM(b), () => {
            const c = K().plane(B, H);
            const col = v.kind === 'apt' ? 'rgba(255,214,150,.75)' : v.id === 'lounge' ? hexToRgba(v.neon, 0.55) : v.id === 'florist' ? 'rgba(220,255,210,.4)' : 'rgba(255,196,110,.55)';
            if (v.kind === 'apt') { if (S.id === 'loft') for (let x = fw * 0.32; x < fw * 0.84; x += 24) c.rect(x + 1.5, 4.5, 15, 7, col); }
            else if (S.id === 'bakery') for (const [x, y, w, h] of b._vSkylights(S, fw, fd)) c.rect(x + 1, y + 1, w - 2, h - 2, col);
            else if (S.id === 'florist') c.rect(fw - 81, 9, 72, 54, col);
            else if (S.id === 'boutique') { const [lx, ly, lw, lh] = b._vLantern(fw, fd); c.roundRect(lx + 2, ly + 2, lw - 4, lh - 4, 12, col); }
            else { const [dx, dy, r] = b._vDome(fw, fd); c.disc(dx, dy, r, col); }
            const bulb = v.id === 'lounge' ? 'rgba(255,226,170,.95)' : 'rgba(255,224,160,.95)';
            if (v.kind === 'apt') { if (S.id === 'deco') for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) c.disc(x, y, 2.2, bulb); return; }
            if (S.id === 'florist') {
                for (const [ax, ay, bx, by] of [[10, fd * 0.45, fw - 10, fd - 30], [10, fd - 30, fw - 10, fd * 0.45]]) {
                    const n = Math.round(Math.hypot(bx - ax, by - ay) / 12);
                    for (let i = 1; i < n; i++) { const t = i / n; c.disc(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * Math.PI) * 8, 1.6, bulb); }
                }
            } else if (S.id === 'boutique') {
                const [lx, ly, lw, lh] = b._vLantern(fw, fd), cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40));
                for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const cx = lx + lw * (i + 0.5) / cols, cy = ly + lh * (j + 0.5) / rows; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.disc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.3, bulb); } }
            } else if (S.id === 'lounge') {
                const [dx, dy, r] = b._vDome(fw, fd);
                for (let i = 0; i < 24; i += 2) { const a = i * Math.PI / 12; c.disc(dx + Math.cos(a) * r * 1.55, dy + Math.sin(a) * r * 1.55, 1.5, bulb); }
            }
        });
    }

    return { faceUnder, faceOver, front, shopRoof, aptRoof, base, glow, roofGlow, clipSeg };
})();
