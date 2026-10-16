// GL engine: the Double Nights Hotel (buildings/double-nights.js), built once as GPU geometry.
// Two crescent towers round a glass atrium lens, the porte-cochère and its script sign, the
// crowns, the helipad and the penthouse pool, and the night: lit rooms, uplights, halos, the
// rims and two searchlights. Every wall is a face (its normal rides on its vertices), so the
// shader shows exactly the walls that face the camera, and the walls of each curved piece are
// re-sorted far-first as the camera moves, the way Canvas painted them. All heights use the
// landmark kit's true perspective (lean mode 1).
const GLDoubleNights = (() => {
    const M = 1;                                                   // true perspective
    const FH = () => CONFIG.BUILDINGS.FLOOR_HEIGHT;
    const P = (x, y, z) => [x, y, z, M];
    const lit = e => (0.5 + 0.5 * Math.max(0, e.ny * 0.6 - e.nx * 0.4)) > 0.7;
    const faceLit = e => e.ny * 0.6 - e.nx * 0.4 > 0.2;

    /** Each edge of a shape as a face of every layer (same ids in base, top and glow) */
    function faces(o, sh) {
        for (const e of sh.edges) {
            const f = { nx: e.nx, ny: e.ny, x1: e.a[0], y1: e.a[1] };
            e.face = o.top.addFace(f); o.base.addFace(f); o.glow.addFace(f);
        }
    }
    /** Flat-shaded walls z0..z1, far first as the camera moves */
    function walls(B, sh, z0, z1, base, litCol) {
        B.sorted(item => {
            for (const e of sh.edges) {
                item(e.mx, e.my);
                B.face(e.face).color(litCol && lit(e) ? litCol : base).quad(P(e.a[0], e.a[1], z0), P(e.b[0], e.b[1], z0), P(e.b[0], e.b[1], z1), P(e.a[0], e.a[1], z1));
            }
        });
        B.face(-1);
    }
    /** Each edge stroked at height z (screen width, as the kit's rings) */
    function edgeRings(B, edges, zs, width, col) {
        B.color(col);
        for (const z of zs) for (const e of edges) B.face(e.face).seg(P(e.a[0], e.a[1], z), P(e.b[0], e.b[1], z), width);
        B.face(-1);
    }
    const loop = (pts, z) => pts.map(([x, y]) => P(x, y, z));
    /** A radial gradient fill as Canvas's (from the centre colour out to the edge colour over r), on any polygon */
    function radialFill(B, pts, z, cx, cy, r, inner, outer, concave = true) {
        B.color(outer).poly(loop(pts, z), concave);
        B.anim(GLB_ANIM.RADIAL, cx, cy, r).color(inner).poly(loop(pts, z), concave).anim();
    }

    function build(b) {
        const G = b._dnGeo(), C = DN.C, H = DN.FLOORS * FH();
        const o = { H, base: GLBuildingBuilder.scratch(H, 0), top: GLBuildingBuilder.scratch(H, 1), glow: GLBuildingBuilder.scratch(H, 2) };
        for (const sh of [G.west, G.east, G.lens]) faces(o, sh);
        drawBase(b, o.base, G);
        drawTop(b, o.top, G, H, C);
        drawGlow(b, o.glow, G, H);
        return o;
    }

    /** Polyline points kept inside the rect (x0, y0, x1, y1): runs split where they leave it */
    function clipRuns(pts, x0, y0, x1, y1) {
        const runs = []; let run = [];
        for (const q of pts) { if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) run.push(q); else { if (run.length > 1) runs.push(run); run = []; } }
        if (run.length > 1) runs.push(run);
        return runs;
    }
    /** Circle (c1, r1) minus circle (c2, r2), on a horizontal offset: a crescent polygon (each arc stops short of
        the shared corner, so no point repeats) */
    function lune(x1, y, r1, x2, r2) {
        const d = Math.abs(x2 - x1), dir = x2 > x1 ? 0 : Math.PI, pts = [];
        const t1 = Math.acos(Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))));
        const t2 = Math.acos(Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))));
        for (let i = 0; i < 24; i++) { const a = dir + t1 + (2 * Math.PI - 2 * t1) * i / 24; pts.push([x1 + Math.cos(a) * r1, y + Math.sin(a) * r1, 0, 0]); }
        for (let i = 0; i < 16; i++) { const a = dir + Math.PI + t2 - 2 * t2 * i / 16; pts.push([x2 + Math.cos(a) * r2, y + Math.sin(a) * r2, 0, 0]); }
        return pts;
    }
    /** The forecourt and the courtyards (Canvas painted them once into a sprite), local coordinates */
    function ground(b, B) {
        const g = [0, 0, 0, 0], Q = (x, y) => [x, y, 0, 0], rnd = seededRandom(6012);
        const h = 450 + DN.FORECOURT_H, Cr = DN.COURT, Cn = DN.CANOPY, C = DN.C, X0 = -20, X1 = 820, Y1 = h;
        const ell = (cx, cy, rx, ry, n = 72) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push(Q(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)); } return p; };
        const rect = (x, y, w, hh) => B.poly([Q(x, y), Q(x + w, y), Q(x + w, y + hh), Q(x, y + hh)]);
        // Rose-grey stone paving, laid in a fan from the door
        B.color(C.stone); rect(-20, 380, 840, h - 380);
        B.color('rgba(0,0,0,0.28)');
        for (let rr = 40; rr < 520; rr += 26) {
            const arc = []; for (let i = 0; i <= 96; i++) { const a = 0.05 + (Math.PI - 0.1) * i / 96; arc.push(Q(400 + Math.cos(a) * rr, 400 + Math.sin(a) * rr)); }
            for (const run of clipRuns(arc, X0, 0, X1, Y1)) B.line(run, 1);
        }
        B.color('rgba(255,230,210,0.05)');
        for (let a = 0.1; a < Math.PI; a += 0.09) {
            const ray = []; for (let i = 0; i <= 48; i++) { const r = 40 + 480 * i / 48; ray.push(Q(400 + Math.cos(a) * r, 400 + Math.sin(a) * r)); }
            for (const run of clipRuns(ray, X0, 0, X1, Y1)) B.line(run, 1);
        }
        for (let i = 0; i < 260; i++) { B.color(`rgba(${rnd() < 0.5 ? '0,0,0' : '255,220,230'},${0.03 + rnd() * 0.04})`); rect(-20 + rnd() * 840, 380 + rnd() * (h - 380), 2 + rnd() * 6, 1 + rnd() * 3); }
        // The circular drive: dark asphalt ring, gold kerbs, a dashed centre line
        const L = Cr.lane / 2;
        B.color('#17131a').poly(ell(Cr.cx, Cr.cy, Cr.rx + L, Cr.ry + L));
        B.color(C.stone).poly(ell(Cr.cx, Cr.cy, Cr.rx - L, Cr.ry - L));
        B.color('rgba(232,194,122,0.55)').line(ell(Cr.cx, Cr.cy, Cr.rx + L, Cr.ry + L), 2, true).line(ell(Cr.cx, Cr.cy, Cr.rx - L, Cr.ry - L), 2, true);
        {   const ring = ell(Cr.cx, Cr.cy, Cr.rx, Cr.ry, 360); ring.push(ring[0]);
            let run = [], dist = 0; B.color('rgba(232,194,122,0.3)');
            for (let i = 0; i < ring.length; i++) {
                if (i) dist += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
                if (dist % 22 < 10) run.push(ring[i]); else { if (run.length > 1) B.line(run, 1.2); run = []; }
            }
            if (run.length > 1) B.line(run, 1.2);
        }
        // Two spurs out to the avenue
        B.color('#17131a');
        for (const s of [-1, 1]) B.poly(GLBuildingBuilder.roundRectPts(Cr.cx + s * 150 - 23, Cr.cy + Cr.ry - 4, 46, h - (Cr.cy + Cr.ry) + 4, 6));
        // The island: a lawn, pink and violet flower beds round the fountain
        B.color(C.lawn).poly(ell(Cr.cx, Cr.cy, Cr.rx - L - 10, Cr.ry - L - 10));
        for (let i = 0; i < 380; i++) { const a = rnd() * Math.PI * 2, k = Math.sqrt(rnd()); B.color(rnd() < 0.5 ? C.lawnHi : 'rgba(8,24,14,0.7)'); rect(Cr.cx + Math.cos(a) * (Cr.rx - 40) * k, Cr.cy + Math.sin(a) * (Cr.ry - 40) * k, 2, 2); }
        for (let i = 0; i < 140; i++) {
            const a = rnd() * Math.PI * 2, rr = Cr.fountain + 10 + rnd() * 26;
            B.color(['#ff8fc8', '#ffb3dc', '#c79bff', '#fff0f8'][Math.floor(rnd() * 4)]).disc(Cr.cx + Math.cos(a) * rr * 1.5, Cr.cy + Math.sin(a) * rr * 0.9, 1.4 + rnd() * 1.4, 0, 0, 8);
        }
        // The fountain: a stone basin, the water, two gilt crescents rising from it, ripples
        const F = Cr.fountain;
        B.color('#3a2f33').disc(Cr.cx, Cr.cy, F + 6, 0, 0, 48);
        GLBuildingModel.radialDisc(B, Cr.cx, Cr.cy, F, 0, 0, Cr.cx, Cr.cy, 4, Cr.cx, Cr.cy, F, [[0, '#3a2c5a'], [1, '#150f28']]);
        B.color(C.gold).circleLine(Cr.cx, Cr.cy, F + 3, 2, 0, 0, 0);
        B.color('rgba(200, 230, 255, 0.35)');
        for (let i = 0; i < 3; i++) {
            const base = B.n, n = 40;
            B.anim(GLB_ANIM.RIPPLE, i / 3, 0, F - 16);
            for (let j = 0; j < n; j++) { B.anim(GLB_ANIM.RIPPLE, i / 3, j / n * Math.PI * 2, F - 16); B.vertex(Q(Cr.cx, Cr.cy), undefined, undefined, 0, -0.5); B.vertex(Q(Cr.cx, Cr.cy), undefined, undefined, 0, 0.5); }
            for (let j = 0; j < n; j++) { const a = base + j * 2, c = base + ((j + 1) % n) * 2; B.index.push(a, a + 1, c + 1, a, c + 1, c); }
        }
        B.color('rgba(255, 245, 220, 0.8)');
        for (let i = 0; i < 6; i++) { const a = i * 1.05, rr = 18 + (i * 7) % 30; B.anim(GLB_ANIM.BLINK_ON, i * 2, 5, 0.6); rect(Cr.cx + Math.cos(a) * rr, Cr.cy + Math.sin(a) * rr * 0.9, 1.5, 1.5); }
        B.anim();
        B.color(C.gold).poly(lune(Cr.cx - 8, Cr.cy, 22, Cr.cx + 1, 22 * 0.86), true).poly(lune(Cr.cx + 1, Cr.cy, 22 * 0.86, Cr.cx - 8, 22), true);
        B.color(C.goldHi).poly(lune(Cr.cx + 8, Cr.cy, 22, Cr.cx - 1, 22 * 0.86), true).poly(lune(Cr.cx - 1, Cr.cy, 22 * 0.86, Cr.cx + 8, 22), true);
        // The porte-cochère floor: marble, the carpet from the drive to the door, nosings, stanchions and rope
        B.color('#3a3034'); rect(Cn.x0, 400, Cn.x1 - Cn.x0, Cn.y1 - 400 + 8);
        B.color('rgba(255,240,230,0.07)'); for (let x = Cn.x0; x < Cn.x1; x += 24) B.line([Q(x, 400), Q(x, Cn.y1 + 8)], 1);
        B.color(C.carpet); rect(372, 404, 56, Cn.y1 - 404 + 26);
        B.color(C.gold).line([Q(374, 404), Q(426, 404), Q(426, Cn.y1 + 20), Q(374, Cn.y1 + 20)], 1.5, true);
        B.color('rgba(232,194,122,0.5)'); for (let i = 0; i < 3; i++) rect(344, 404 + i * 6, 112, 1.5);
        B.color(C.gold); for (let y = 470; y < Cn.y1 + 20; y += 22) for (const x of [364, 436]) B.disc(x, y, 2.4, 0, 0, 10);
        B.color('rgba(160,20,50,0.9)'); for (const x of [364, 436]) for (let y = 470; y < Cn.y1 + 20; y += 22) B.line([Q(x, y), Q(x, y + 22)], 1.6);
        // Planters with clipped topiary spheres along the frontage
        for (const x of [70, 170, 630, 730]) {
            B.color('#3a2f33').disc(x, 484, 17, 0, 0, 28); B.color('rgba(232,194,122,0.55)').circleLine(x, 484, 17, 1.2, 0, 0, 0);
            GLBuildingModel.radialDisc(B, x, 484, 13, 0, 0, x - 4, 480, 2, x, 484, 14, [[0, '#4d8a58'], [1, '#14331d']]);
            for (let i = 0; i < 7; i++) { const a = i * 0.9; B.color(i % 2 ? '#ff9ccf' : '#d7a8ff').disc(x + Math.cos(a) * 9, 484 + Math.sin(a) * 9, 1.6, 0, 0, 8); }
        }
        // The courtyards between the crescents and the atrium: reflecting pools in a lawn (inside the inner circles)
        const [ix, iy, ir] = DN.IN, inside = (x, y) => Math.hypot(x - ix, y - iy) < ir || Math.hypot(x - (800 - ix), y - iy) < ir;
        B.color(C.lawn).disc(ix, iy, ir, 0, 0, 72).disc(800 - ix, iy, ir, 0, 0, 72);
        for (let i = 0; i < 400; i++) { const c = rnd() < 0.5 ? C.lawnHi : 'rgba(8,24,14,0.7)', x = 160 + rnd() * 480, y = 30 + rnd() * 390; if (inside(x + 1, y + 1)) { B.color(c); rect(x, y, 2, 2); } }
        for (const s of [-1, 1]) { const x = 400 + s * 162; B.color('#18103a').poly(ell(x, 225, 22, 120, 48)); B.color('rgba(232,194,122,0.6)').line(ell(x, 225, 22, 120, 48), 1.5, true); }
    }

    function drawBase(b, B, G) {
        B.inFrame([1, 0, 0, 1, b.x, b.y], () => ground(b, B));
        B.color('rgba(6, 2, 8, 0.55)');                            // contact shadow, a little offset
        for (const s of [G.west, G.east, G.lens]) B.poly(s.pts.map(([x, y]) => [x + 7, y + 9, 0, 0]), true);
    }

    function drawTop(b, B, G, H, C) {
        // The atrium first (low), then the canopy and its sign, then the towers over them
        walls(B, G.lens, 0, DN.ATRIUM_Z, '#1b1017', null);
        edgeRings(B, G.lens.edges, [DN.ATRIUM_Z], 0.8, 'rgba(232,194,122,0.35)');
        atriumRoof(B, G, false);
        canopy(B, G, false);
        sign(B, G);
        for (const [sh, key] of [[G.west, 'w'], [G.east, 'e']]) {
            towerWalls(B, sh, key, H, C);
            roof(B, G, sh, key, H, C);
            crown(B, G, sh, key, H, false);
        }
    }

    function towerWalls(B, sh, key, H, C) {
        const K = GLBuildingModel, fh = FH();
        K.ledge(B, sh.edges, 2 * fh, 6, 2 * fh, C.stone, '#221b1e', 'rgba(232, 194, 122, 0.45)');      // the plinth
        walls(B, sh, 2 * fh, H, '#1a0c14', C.lacquerHi);
        const zs = []; for (let f = 3; f < DN.FLOORS; f++) if (f % 3) zs.push(f * fh);
        edgeRings(B, sh.edges, zs, 1.1, 'rgba(160, 24, 58, 0.55)');                                  // spandrels
        // Fins at every other facet corner, gilt-edged where they face the light
        const anchors = sh.edges.filter((e, i) => i % 2 === 0).map(e => ({ x: e.a[0], y: e.a[1], nx: e.nx, ny: e.ny, face: e.face }));
        K.fins(B, anchors, 2 * fh, H, 2.2, 2.5, C.lacquerHi, null);
        B.color('rgba(232, 194, 122, 0.35)');
        for (const a of anchors) if (faceLit(a)) {
            const fx = a.x + a.nx * 2.5 - a.ny * 1.1, fy = a.y + a.ny * 2.5 + a.nx * 1.1;
            B.face(a.face).seg(P(fx, fy, 2 * fh), P(fx, fy, H), 0.8);
        }
        B.face(-1);
        for (let f = 3; f < DN.FLOORS; f += 3) K.ledge(B, sh.edges, f * fh, 3.5, 1.6, '#241019', '#4a0a1c', 'rgba(232, 194, 122, 0.3)');
        if (key === 'e') K.veranda(B, sh.edges.filter(e => e.ny > 0.35), (DN.FLOORS - 2) * fh, 7, 5, 4, '#3a1a2c', '#1c0c16', 'rgba(232, 194, 122, 0.75)');
    }

    function roof(B, G, sh, key, H, C) {
        const pl = GLBuildingModel.plane(B, H, M);
        radialFill(B, sh.pts, H, sh.cx, sh.cy, 220, '#3a1a2c', '#12080e');
        pl.polyLine(sh.pts, 2.2, C.gold, true);
        const n = sh.outer.length, inner = sh.pts.slice(n).reverse(), fins = [];
        for (let i = 2; i < n - 2; i += 2) {
            const q0 = sh.outer[i], j = Math.round(i / (n - 1) * (inner.length - 1)), q = inner[Math.max(0, Math.min(inner.length - 1, j))];
            fins.push([q0[0], q0[1], q0[0] + (q[0] - q0[0]) * 0.8, q0[1] + (q[1] - q0[1]) * 0.8]);
        }
        pl.segs(fins, 1, 'rgba(232, 194, 122, 0.28)');
        pl.polyLine(sh.outer.map(q => [sh.cx + (q[0] - sh.cx) * 0.95, sh.cy + (q[1] - sh.cy) * 0.95]), 2, 'rgba(160, 20, 56, 0.6)');
        if (key === 'w') {                                          // the helipad
            const [hx, hy] = G.helipad;
            pl.disc(hx, hy, 40, '#1d1419').ring(hx, hy, 40, 2, C.gold);
            B.color('rgba(232,194,122,0.85)');
            GLText.quad(B, GLText.entry('H', 26, 'Montserrat', false, '600'), hx, hy + 1, H, M);
        }
    }

    function atriumRoof(B, G, isLit) {
        const L = G.lens, z = DN.ATRIUM_Z, pl = GLBuildingModel.plane(B, z, M);
        if (!isLit) radialFill(B, L.pts, z, L.cx, L.cy, 190, '#3a2530', DN.C.glass, false);
        else B.additive(true).anim(GLB_ANIM.RADIAL, L.cx, L.cy, 170).color('rgba(255, 206, 140, 0.3)').poly(loop(L.pts, z)).anim();
        if (!isLit) pl.polyLine(L.pts, 1.6, DN.C.gold, true);
        const ribs = []; for (let i = 0; i < L.pts.length; i += 2) ribs.push([L.cx, L.cy, L.pts[i][0], L.pts[i][1]]);
        pl.segs(ribs, 0.8, isLit ? 'rgba(255,225,170,0.22)' : 'rgba(232,194,122,0.3)');
        for (const s of [-1, 1]) {                                  // the emblem: two crescent arcs
            const a0 = s < 0 ? Math.PI * 0.35 : -Math.PI * 0.65, a1 = s < 0 ? Math.PI * 1.65 : Math.PI * 0.65;
            B.color(isLit ? 'rgba(255,236,190,0.9)' : DN.C.gold).circleLine(L.cx + s * 8, L.cy, 26, 2, z, M, GLB_LINE.SCALE_K, a0, a1);
        }
    }

    /** The porte-cochère: four gilt columns and the lacquer slab; it thins to a veil over whoever stands under it */
    function canopy(B, G, emissive) {
        const z = DN.CANOPY_Z, Cn = G.canopy, C = DN.C, mx = (Cn.x0 + Cn.x1) / 2;
        B.anim(GLB_ANIM.FADE);
        if (!emissive) {
            const r = 2.6;
            B.color(C.gold); for (const [x, y] of G.cols) B.seg(P(x, y, 0), P(x, y, z), r * 2, GLB_LINE.SCALE_K);
            B.color(C.goldHi); for (const [x, y] of G.cols) B.disc(x, y, r * 1.4, z, M);
            const pl = GLBuildingModel.plane(B, z, M), w = Cn.x1 - Cn.x0, h = Cn.y1 - Cn.y0, rad = 46;
            const slab = GLBuildingBuilder.roundRectPts(Cn.x0, Cn.y0, w, h, [6, 6, rad, rad], z, M);
            GLBuildingModel.gradPoly(B, slab, Cn.x0, Cn.y0, Cn.x0, Cn.y1, [[0, '#1d0c16'], [1, '#2c1220']]);
            B.anim(GLB_ANIM.FADE);
            B.color(C.gold).line(slab, 2, true, GLB_LINE.SCALE_K);
            pl.roundRectLine(Cn.x0 + 5, Cn.y0 + 5, w - 10, h - 10, [4, 4, rad - 5, rad - 5], 1.2, 'rgba(160, 20, 56, 0.7)');
            pl.rect(mx - 12, Cn.y0 + 14, 24, h - 28, '#2a1a24');
        } else {
            GLBuildingModel.plane(B, z, M).rect(mx - 12, Cn.y0 + 14, 24, Cn.y1 - Cn.y0 - 28, 'rgba(255, 214, 150, 0.22)');
        }
        B.anim();
    }

    /** "Double Nights" in script on the canopy's fascia: a crimson neon glow (fine zoom), the tube, its white core */
    function sign(B, G) {
        const z = DN.CANOPY_Z, x = (G.canopy.x0 + G.canopy.x1) / 2, y = G.canopy.y1 - 16, t = 'Double Nights';
        const neon = GLText.entry(t, 30, 'Great Vibes', true), body = GLText.entry(t, 30, 'Great Vibes', false);
        B.anim(GLB_ANIM.SIGN);
        B.gate(0, 0).color('#ff1a55'); GLText.quad(B, neon, x, y, z, M, 1, 1);
        B.gate().color('rgb(255, 40, 90)'); GLText.quad(B, body, x, y, z, M);
        B.color('rgba(255, 236, 240, 0.55)'); GLText.quad(B, body, x, y, z, M);
        B.anim();
    }

    /** A tower's crown: the crimson halo, the helipad lights, the penthouse pavilion and its pool */
    function crown(B, G, sh, key, H, emissive) {
        const C = DN.C, zc = H + DN.CROWN_Z, halo = sh.outer.map(q => P(sh.cx + (q[0] - sh.cx) * 0.9, sh.cy + (q[1] - sh.cy) * 0.9, zc));
        if (emissive) {
            const ph = key === 'w' ? 0 : 1.7;
            B.additive(true).anim(GLB_ANIM.BREATHE, ph);
            B.color('rgba(209, 30, 76, 0.35)').line(halo, 9);
            B.color('rgba(255, 90, 130, 0.8)').line(halo, 2.5);
            B.anim();
        } else B.color('#3a0c1c').line(halo, 3);
        if (key === 'w') {
            if (!emissive) return;
            const [hx, hy] = G.helipad;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, x = hx + Math.cos(a) * 40, y = hy + Math.sin(a) * 40;
                B.anim(GLB_ANIM.BLINK_ON, -i * 0.8, 3, 0.2).color('rgba(255,220,150,0.9)').disc(x, y, 1.8, H + 1, M, 10);
                B.anim(GLB_ANIM.BLINK_OFF, -i * 0.8, 3, 0.2).color('rgba(255,220,150,0.25)').disc(x, y, 1.8, H + 1, M, 10);
            }
            B.anim();
            return;
        }
        const [px, py] = G.penthouse;
        const pool = GLBuildingBuilder.roundRectPts(px + 6 - 11, py - 58, 22, 116, 11, H + 1, M);
        const pav = GLBuildingBuilder.roundRectPts(px - 26 - 12, py - 38, 24, 76, 12, H + 10, M);
        if (!emissive) {
            GLBuildingModel.gradPoly(B, pool, px - 5, py - 58, px + 17, py + 58, [[0, '#1a2250'], [1, '#34215e']]);
            B.color(C.gold).line(pool, 1.5, true);
            B.color('rgba(190, 210, 255, 0.35)');
            for (let i = 1; i < 5; i++) {
                const yy = py - 58 + 116 * i / 5;
                B.anim(GLB_ANIM.CAUSTIC, i * 1.6 / 1.5, 0).line(GLBuildingBuilder.quadPts([px - 5 + 3, yy, H + 1, M], [px + 6, yy + 3], [px + 17 - 3, yy], 8), 0.8);
            }
            B.anim();
            B.color('#1b1220').poly(pav).color('rgba(232,194,122,0.7)').line(pav, 1.5, true);
        } else {
            B.additive(true).color('rgba(255, 214, 160, 0.35)').poly(pav);
            B.anim(GLB_ANIM.SHIMMER, 0).color('rgba(90, 130, 255, 0.14)').poly(pool).anim();
        }
    }

    function drawGlow(b, B, G, H) {
        const fh = FH(), seed = b._seed || 7;
        B.additive(true);
        atriumRoof(B, G, true);
        B.additive(true);
        canopy(B, G, true);
        const accent = GLColor.parse(b.colors && b.colors.accent || '#ffcf8a');
        for (const [sh, key] of [[G.west, 'w'], [G.east, 'e']]) {
            // Lit rooms: a curated scatter, the east tower's top floors always on
            B.color('rgba(255, 214, 150, 0.85)');
            sh.edges.forEach((e, idx) => {
                const A = [e.a[0] + (e.b[0] - e.a[0]) * 0.18, e.a[1] + (e.b[1] - e.a[1]) * 0.18], Bp = [e.a[0] + (e.b[0] - e.a[0]) * 0.82, e.a[1] + (e.b[1] - e.a[1]) * 0.82];
                for (let f = 0; f < DN.FLOORS; f++) {
                    if (!((key === 'e' && f >= DN.FLOORS - 2) || _bldHash(seed, idx * 31 + f * 7 + (key === 'e' ? 500 : 0)) < 0.34)) continue;
                    const z0 = f * fh + 2, z1 = f * fh + fh - 2;
                    B.face(e.face).quad(P(A[0], A[1], z0), P(Bp[0], Bp[1], z0), P(Bp[0], Bp[1], z1), P(A[0], A[1], z1));
                }
            });
            // Gold uplights climbing the faces from the ground
            const zU = H * 0.55, up = 'rgba(255, 196, 110, 0.32)', none = 'rgba(255, 196, 110, 0)';
            for (const e of sh.edges) B.face(e.face).polyColors([P(e.a[0], e.a[1], 0), P(e.b[0], e.b[1], 0), P(e.b[0], e.b[1], zU), P(e.a[0], e.a[1], zU)], [up, up, none, none]);
            B.face(-1);
            // The parapet glints
            B.color('rgba(255, 220, 160, 0.35)').line(loop(sh.pts, H), 1.5, true);
            // The ledge lips and veranda rails catch the lamp colour
            B.anim(GLB_ANIM.RIM).color([accent[0], accent[1], accent[2], 0.55]);
            for (let f = 3; f < DN.FLOORS; f += 3) for (const e of sh.edges) {
                B.face(e.face).seg(P(e.a[0] + e.nx * 3.5, e.a[1] + e.ny * 3.5, f * fh), P(e.b[0] + e.nx * 3.5, e.b[1] + e.ny * 3.5, f * fh), 1.1);
            }
            if (key === 'e') for (const e of sh.edges) if (e.ny > 0.35) {
                const z = (DN.FLOORS - 2) * fh + 4;
                B.face(e.face).seg(P(e.a[0] + e.nx * 6, e.a[1] + e.ny * 6, z), P(e.b[0] + e.nx * 6, e.b[1] + e.ny * 6, z), 1.1);
            }
            B.face(-1).anim();
            crown(B, G, sh, key, H, true);
        }
        // Ground: the fountain's gold, the lanterns round the drive
        const Cr = G.court, glow = (x, y, r, rgb, a) => B.anim(GLB_ANIM.RADIAL, x, y, r).color(`rgba(${rgb}, ${a})`).disc(x, y, r, 0, 0, 24).anim();
        glow(Cr.cx, Cr.cy, 90, '255, 200, 120', 0.14);
        for (const a of [0.35, 0.8, 1.25, 1.9, 2.35, 2.8]) {
            const x = Cr.cx + Math.cos(a) * (Cr.rx + 26), y = Cr.cy + Math.sin(a) * (Cr.ry + 22);
            glow(x, y, 26, '255, 214, 150', 0.5);
            B.color('rgba(255, 240, 210, 0.45)').disc(x, y, 2.2, 0, 0, 10);
        }
        // Two gold searchlights crossing over the roofs (at night, not when zoomed far out)
        B.gate(0, GLBuildingModel.LOD_FINE);
        for (const [sh, ph, side] of [[G.west, 0, 0.35], [G.east, 2.4, -0.35]]) {
            const o = P(sh.cx, sh.cy, H + 20);
            B.anim(GLB_ANIM.BEAM, ph, side, 0).color('rgba(255, 224, 160, 0.34)');
            const v0 = B.vertex(o);
            B.anim(GLB_ANIM.BEAM, ph, side, -1).color('rgba(255, 224, 160, 0)'); const v1 = B.vertex(o);
            B.anim(GLB_ANIM.BEAM, ph, side, 1); const v2 = B.vertex(o);
            B.index.push(v0, v1, v2);
        }
        B.gate().anim().additive(false);
    }

    /** Per frame: the canopy thins while someone stands under it */
    function update(b, r) {
        const Cn = b._dnGeo().canopy, p = game.player, cam = game.camera, fx = p && p.visible ? p.x : cam.x, fy = p && p.visible ? p.y : cam.y;
        const under = fx > Cn.x0 - 20 && fx < Cn.x1 + 20 && fy > Cn.y0 - 10 && fy < Cn.y1 + 40;
        r.fade = (r.fade == null ? 1 : r.fade) + ((under ? 0.3 : 1) - (r.fade == null ? 1 : r.fade)) * 0.12;
        r.top.fade = r.glow.fade = r.fade;
    }

    return { build, update };
})();
