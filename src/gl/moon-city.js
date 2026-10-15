// GL engine: Moon City, the nightclub on the hub (buildings/moon-city.js), built once as GPU geometry.
// Its walls go the generic way (the wall gradient and outline) with the club's own face art on them
// (_mcFace: smoked-glass panes, violet fins, gold pilasters, the chevron frieze) and no windows; the
// rising-moon canopy on gold posts and the marquee board over the door; the roof (stepped lacquer decks,
// the moon dome in its ring of phases on a gold sunburst, the gold crescent, the turrets, the plant, the
// VIP terrace with its crescent pool, cabanas and loungers); the forecourt (marble, sunburst inlay, the
// red carpet, ropes, planters) on the ground. The night keeps time with the club: the beat count rides
// on each mesh's rim uniform (update(); Moon City lights nothing with the RIM anim), and anims 29-32
// (gl/building-mesh.js, the "Moon City" block) turn it into the fins' pulse, the dance floor through the
// dome, the phases lighting one by one, the searchlights and the mist.
const GLMoonCity = (() => {
    const FH = () => CONFIG.BUILDINGS.FLOOR_HEIGHT;
    // anims (gl/building-mesh.js, the Moon City block)
    const A = { PULSE: 29, DOME: 30, PHASE: 31, MOVE: 32 };
    // PULSE: alpha × max(0, a0 + kickGain·kick + wave), aAnim (a0, flags·10 + kickGain, wave·100 + phase)
    const F = { UNGLOW: 1, LAMPS: 2, SIGN: 4, BEAM: 8, DAY: 16 };
    const W = { NONE: 0, FIN: 1, POOL: 2, MOON: 3, FESTOON: 4, BULB: 5 };
    const pulse = (B, a0, kick = 0, flags = 0, wave = 0, ph = 0) => B.anim(A.PULSE, a0, flags * 10 + kick, wave * 100 + ph);
    const TAU = Math.PI * 2;

    // ---------------- shapes ----------------
    const rgbaOf = (rgb, a) => { const c = GLColor.parse(`rgba(${rgb}, 1)`); return [c[0], c[1], c[2], a]; };
    const stopColor = (stops, t) => {
        if (t <= stops[0][0]) return GLColor.parse(stops[0][1]);
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [ta, ca] = stops[i - 1], [tb, cb] = stops[i]; return GLColor.mix(ca, cb, tb > ta ? (t - ta) / (tb - ta) : 1); }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** A soft round glow (glowSprite with core 0, a linear falloff): colour at alpha a in the middle, nothing at r */
    function fan(B, cx, cy, r, z, mode, rgb, a, n = 36) {
        const base = B.n, c = rgbaOf(rgb, a), o = [c[0], c[1], c[2], 0];
        B.vertex([cx, cy, z, mode], undefined, undefined, 0, 0, 0, c);
        for (let i = 0; i < n; i++) { const t = i / n * TAU; B.vertex([cx + Math.cos(t) * r, cy + Math.sin(t) * r, z, mode], undefined, undefined, 0, 0, 0, o); }
        for (let i = 0; i < n; i++) B.index.push(base, base + 1 + i, base + 1 + (i + 1) % n);
    }
    /** Rows of matching points (each row the same length) filled as a grid of quads, coloured by colorAt(x, y) or the pen */
    function grid(B, rows, colorAt = null, closed = false) {
        const base = B.n, n = rows[0].length;
        for (const row of rows) for (const p of row) B.vertex(p, p, p, 0, 0, 0, colorAt ? colorAt(p[0], p[1]) : B._c);
        const segs = closed ? n : n - 1;
        for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < segs; i++) {
            const a = base + r * n + i, b = base + r * n + (i + 1) % n, c = b + n, d = a + n;
            B.index.push(a, b, c, a, c, d);
        }
    }
    /** Two matching runs (an outer and an inner edge) filled between, `sub` rows across */
    function strip(B, outer, inner, colorAt = null, sub = 1) {
        const rows = [];
        for (let k = 0; k <= sub; k++) rows.push(outer.map((p, i) => { const q = inner[i], t = k / sub; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2], p[3]]; }));
        grid(B, rows, colorAt);
    }
    /** A shape star-shaped about (cx, cy) (outline points in order), filled in `rings` rings out from it */
    function starFill(B, cx, cy, outline, colorAt = null, rings = 1) {
        const rows = [];
        for (let k = 0; k <= rings; k++) { const f = k / rings; rows.push(outline.map(p => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f, p[2], p[3]])); }
        grid(B, rows, colorAt, true);
    }
    const arcPts = (cx, cy, r, a0, a1, n, z, mode) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, mode]); } return o; };
    /** _mcCrescent: the outer arc and the inner arc (matched, both running round the far side); outline = outer + inner reversed */
    function crescent(x, y, r, rot, z, mode, n = 32) {
        const outer = arcPts(x, y, r, rot + 0.35, rot + TAU - 0.35, n, z, mode);
        const inner = arcPts(x + Math.cos(rot) * r * 0.42, y + Math.sin(rot) * r * 0.42, r * 0.78, rot + 0.62, rot + TAU - 0.62, n, z, mode);
        return { outer, inner, outline: outer.concat(inner.slice().reverse()) };
    }
    /** _mcLune: a disc less a disc 0.8 r across set 0.45 r toward rot */
    function lune(x, y, r, rot, z, mode, n = 40) {
        const th = 0.896, ph = 1.35, d = r * 0.45;
        const outer = arcPts(x, y, r, rot + th, rot + TAU - th, n, z, mode);
        const inner = arcPts(x + Math.cos(rot) * d, y + Math.sin(rot) * d, r * 0.8, rot + ph, rot + TAU - ph, n, z, mode);
        return { outer, inner, outline: outer.concat(inner.slice().reverse()) };
    }
    /** _mcPhase: the lit part of the moon at phase ph: the limb and the terminator, matched row by row */
    function phase(x, y, r, ph, z, mode, n = 16) {
        const w = Math.cos(ph * TAU) * r, s = ph > 0.5 ? -1 : 1, outer = [], inner = [];
        for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + Math.PI * i / n, c = Math.cos(t), yy = y + r * Math.sin(t); outer.push([x + s * r * c, yy, z, mode]); inner.push([x + s * (w >= 0 ? Math.max(0.01, w) : w) * c, yy, z, mode]); }
        return { outer, inner };
    }
    const circle = (cx, cy, r, z, mode, n = 48) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, mode]); } return o; };
    /** A segment clipped to the rect (Liang–Barsky), or null */
    function clipSeg(ax, ay, bx, by, x0, y0, x1, y1) {
        let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
        for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
            if (p === 0) { if (q < 0) return null; continue; }
            const t = q / p;
            if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
        }
        return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1, t0, t1];
    }
    /** A polyline cut to the rect: the runs inside it */
    function clipRuns(pts, x0, y0, x1, y1) {
        const runs = []; let run = null;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], c = clipSeg(a[0], a[1], b[0], b[1], x0, y0, x1, y1);
            if (!c) { if (run) runs.push(run); run = null; continue; }
            if (!run || c[4] > 0) { if (run) runs.push(run); run = [[c[0], c[1], a[2], a[3]]]; }
            run.push([c[2], c[3], a[2], a[3]]);
            if (c[5] < 1) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        return runs;
    }
    /** A convex polygon clipped to a convex polygon (Sutherland–Hodgman), the clip running with increasing angle (as circle() makes it) */
    function clipConvex(poly, clip) {
        let out = poly;
        for (let i = 0; i < clip.length && out.length; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
            const src = out; out = [];
            for (let j = 0; j < src.length; j++) {
                const p = src[j], q = src[(j + 1) % src.length], sp = side(p), sq = side(q);
                if (sp >= 0) out.push(p);
                if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2], p[3]]); }
            }
        }
        return out;
    }

    // ---------------- the building ----------------
    function build(b) {
        const G = b._mcGeo(), H = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) * FH();
        const o = { H, base: new GLBuildingBuilder(H), top: new GLBuildingBuilder(H), glow: new GLBuildingBuilder(H) };
        const faces = b._leanFaces();
        const ids = faces.map(f => { const i = o.top.addFace(f); o.base.addFace(f); o.glow.addFace(f); return i; });
        drawBase(b, o.base, G);
        drawTop(b, o.top, G, H, faces, ids);
        drawGlow(b, o.glow, G, H, faces, ids);
        return o;
    }

    // ---------------- base: the forecourt (Canvas's sprite, as geometry), its night glows, the shadows ----------------
    function drawBase(b, B, G) {
        ground(B, G);
        // the crimson pool at the door, breathing on the kick, and a little low mist (lamps on)
        B.additive(true);
        pulse(B, 0.32, 0.12, F.LAMPS); fan(B, G.door.x, G.door.y + 30, 90, 0, 0, '255, 40, 90', 1);
        B.gate(0, 0);
        for (let i = 0; i < 5; i++) { B.anim(A.MOVE, i); fan(B, G.door.x, G.court.y + 30 + i * 9, 46, 0, 0, i % 2 ? '200, 168, 255' : '255, 120, 170', 0.07); }
        B.gate().anim().additive(false);
        // the building's own base pass (building-v2 drawBase): the shadow, the footprint
        for (const s of b.sections) B.color('rgba(0, 0, 0, 0.5)').rect(b.x + s.x + b.facadeDepth, b.y + s.y + b.facadeDepth, s.w, s.h);
        for (const s of b.sections) B.color('rgba(10, 10, 15, 0.3)').rect(b.x + s.x - 5, b.y + s.y - 5, s.w + 10, s.h + 10);
    }

    function ground(B, G) {
        const Q = G.court, C = MCX.C, dx = G.door.x, p = (x, y) => [x, y, 0, 0];
        const X0 = Q.x, Y0 = Q.y, X1 = Q.x + Q.w, Y1 = Q.y + Q.h;           // the sprite's bounds
        B.color(C.marble).rect(Q.x, Q.y, Q.w, Q.h);
        const r = seededRandom('mccourt');
        B.color('rgba(200, 168, 255, 0.07)');                               // veining
        for (let i = 0; i < 14; i++) {
            const x = Q.x + r() * Q.w, y = Q.y + r() * Q.h, c1 = [x + 20, y + r() * 30], c2 = [x + 40, y - r() * 20], e = [x + 70, y + r() * 25], pts = [];
            for (let k = 0; k <= 24; k++) { const t = k / 24, u = 1 - t; pts.push(p(u * u * u * x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1])); }
            for (const run of clipRuns(pts, X0, Y0, X1, Y1)) B.line(run, 0.8);
        }
        // the sunburst inlaid in gold, fanning from the door, stepped by two deco arcs (clipped to the inlay)
        const cx0 = Q.x + 6, cy0 = Q.y + 3, cx1 = Q.x + Q.w - 6, cy1 = Q.y + Q.h - 5;
        B.color('rgba(232, 194, 122, 0.2)');
        for (let i = 1; i < 18; i++) {
            const a = Math.PI * i / 18, c = clipSeg(dx + Math.cos(a) * 24, Q.y + Math.sin(a) * 24, dx + Math.cos(a) * 160, Q.y + Math.sin(a) * 160, cx0, cy0, cx1, cy1);
            if (c) B.seg(p(c[0], c[1]), p(c[2], c[3]), 1);
        }
        B.color('rgba(232, 194, 122, 0.35)');
        for (const rr of [66, 94]) for (const run of clipRuns(arcPts(dx, Q.y, rr, 0, Math.PI, 64, 0, 0), cx0, cy0, cx1, cy1)) B.line(run, 1);
        B.color('rgba(168, 130, 62, 0.55)').line([p(cx0, cy0), p(cx1, cy0), p(cx1, cy1), p(cx0, cy1)], 1, true);   // the gold inlay border
        for (const sx of [-1, 1]) {                                          // a gold crescent in a gold ring either side
            B.color('rgba(232, 194, 122, 0.45)').circleLine(dx + sx * 82, Q.y + 50, 17, 1, 0, 0, 0);
            const cr = crescent(dx + sx * 82, Q.y + 50, 11, sx < 0 ? 0.6 : Math.PI - 0.6, 0, 0);
            B.color('rgba(232, 194, 122, 0.6)'); strip(B, cr.outer, cr.inner);
        }
        // the red carpet, door to kerb, gold-edged
        const cw = 40;
        B.color('#6a0a22').rect(dx - cw / 2, Q.y, cw, Q.h);
        B.color('rgba(0,0,0,0.18)'); for (let y = Q.y + 6; y < Q.y + Q.h; y += 8) B.rect(dx - cw / 2, y, cw, Math.min(1, Y1 - y));
        B.color(C.gold).rect(dx - cw / 2, Q.y, 2, Q.h).rect(dx + cw / 2 - 2, Q.y, 2, Q.h);
        // velvet ropes on gold stanchions either side of the carpet
        for (const sx of [-1, 1]) {
            const xr = dx + sx * 36, ys = [Q.y + 14, Q.y + 42, Q.y + 70, Q.y + 96];
            B.color(C.velvetLt);
            for (let i = 0; i < ys.length - 1; i++) B.line(GLBuildingBuilder.quadPts(p(xr, ys[i]), [xr + sx * 5, (ys[i] + ys[i + 1]) / 2], p(xr, ys[i + 1]), 12), 2.6);
            for (const y of ys) { B.color('rgba(0,0,0,0.4)').disc(xr + 1.5, y + 2, 3.6, 0, 0, 16); B.color(C.gold).disc(xr, y, 3.4, 0, 0, 16); B.color(C.goldLt).disc(xr - 1, y - 1, 1.2, 0, 0, 10); }
        }
        // lacquer planters at the front corners, a violet topiary ball in each
        for (const sx of [-1, 1]) {
            const px = dx + sx * 92, py = Q.y + Q.h - 18;
            B.color('rgba(0,0,0,0.45)').rect(px - 9, py - 8, 22, 22);
            B.color('#100a16').rect(px - 11, py - 11, 22, 22);
            B.color(C.goldDk).line([p(px - 11, py - 11), p(px + 11, py - 11), p(px + 11, py + 11), p(px - 11, py + 11)], 1.2, true);
            radialDisc(B, px, py, 9, 0, 0, px - 3, py - 3, 1, px, py, 10, [[0, '#7a52c8'], [1, '#2a1a50']]);
        }
    }

    // ---------------- top: walls, the canopy and the board, the roof ----------------
    function drawTop(b, B, G, H, faces, ids) {
        const wall = b.colors.wall;
        faces.forEach((f, i) => {                                            // (building-v2 _drawLeanTop, in its face order)
            const F = new GLFace(f, H);
            B.face(ids[i]);
            const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : f.side === 'C' ? Math.round(6 + (f.ny > 0 ? 12 : 14) * f.ny) : 6;
            const c0 = darkenHex(wall, 6), c1 = shade >= 0 ? lightenHex(wall, shade) : darkenHex(wall, -shade);
            B.polyColors([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], [c0, c0, c1, c1]);
            B.color('rgba(0,0,0,0.35)').line([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], 1, true);
            if (f.side !== 'C') face(B, F, false);
            B.reset();
        });
        canopy(B, G, false);
        sign(B, G, false);
        roof(B, G, H);
    }

    /** _mcFace: lacquer between violet fins, gold pilasters every third, smoked-glass panes, the chevron frieze under the cornice */
    function face(B, F, emissive) {
        const n = Math.max(2, Math.round(F.L / MCX.FIN)), C = MCX.C, at = (u, v) => F.at(u, v);
        const panes = []; for (let i = 0; i < n; i++) { const u0 = (i + 0.18) / n, u1 = (i + 0.82) / n; panes.push([at(u0, 0.3), at(u1, 0.3), at(u1, 0.74), at(u0, 0.74)]); }
        const frieze = []; for (let j = 0, m = n * 3; j <= m; j++) frieze.push(at(j / m, j % 2 ? 0.83 : 0.91));
        const pil = []; for (let i = 0; i <= n; i += 3) pil.push([at(i / n, 0.04), at(i / n, 0.98)]);
        if (n % 3) pil.push([at(1, 0.04), at(1, 0.98)]);
        B.gate(4);                                                           // (Canvas: nothing while the wall shows under 4 px)
        if (!emissive) {
            B.color('rgba(12, 6, 20, 0.92)'); for (const q of panes) B.poly(q);
            pulse(B, 1, 0, F.DAY).color('rgba(168, 160, 220, 0.22)'); for (const q of panes) B.poly(q);   // the sky in the glass by day
            B.anim().color('rgba(232, 194, 122, 0.3)'); for (const q of panes) B.line(q, 0.8, true);
            B.color(C.fin); for (let i = 0; i <= n; i++) if (i % 3) B.seg(at(i / n, 0.06), at(i / n, 0.96), 2.2);
            B.color(C.goldDk); for (const s of pil) B.seg(s[0], s[1], 3.4);
            B.color('rgba(255, 241, 194, 0.35)'); for (const s of pil) B.seg(s[0], s[1], 1);
            B.color(C.goldDk).seg(at(0, 0.97), at(1, 0.97), 1.4).seg(at(0, 0.06), at(1, 0.06), 0.8);
            B.color('rgba(232, 194, 122, 0.25)').seg(at(0, 0.8), at(1, 0.8), 0.8);
            B.color('rgba(232, 194, 122, 0.55)').line(frieze, 1);
        } else {
            B.additive(true);
            pulse(B, 0.07, 0.05).color('rgb(200, 168, 255)'); for (const q of panes) B.poly(q);
            for (let i = 0; i <= n; i++) {
                if (!(i % 3) || (i === n && n % 3)) continue;
                pulse(B, 0.32, 0.35, 0, W.FIN, i * 0.8);
                B.color('rgba(138, 92, 255, 0.7)').seg(at(i / n, 0.08), at(i / n, 0.94), 2.6);
                B.color('rgb(232, 216, 255)').seg(at(i / n, 0.08), at(i / n, 0.94), 1);
            }
            B.anim().color('rgba(255, 241, 194, 0.4)'); for (const s of pil) B.seg(s[0], s[1], 1);
            pulse(B, 0.3, 0.3).color('rgb(255, 90, 138)').line(frieze, 1.6);
            B.anim().color('rgba(255, 241, 194, 0.55)').seg(at(0, 0.97), at(1, 0.97), 1);
        }
        B.gate();
    }

    /** The canopy over the door: a rising moon in rose velvet on gold posts (marquee bulbs round its rim at night) */
    function canopy(B, G, emissive) {
        const C = MCX.C, z = MCX.CANOPY_Z, R = MCX.CANOPY_R, M = 1, cx = G.door.x, cy = G.door.y - 4, N = 14, S = GLB_LINE.SCALE_K;
        const pl = GLBuildingModel.plane(B, z, M);
        if (emissive) {                                                      // marquee bulbs (absolute alpha: they burn by day too)
            B.additive(true);
            for (let i = 0; i <= 14; i++) {
                const a = Math.PI * i / 14, x = cx + Math.cos(a) * (R - 4), y = cy + Math.sin(a) * (R - 4);
                pulse(B, 0.55, 0, F.UNGLOW, W.BULB, i * 1.3);
                B.color('rgb(255, 232, 240)').disc(x, y, 1.6, z, M, 10);
                B.gate(0, 0); fan(B, x, y, 7, z, M, '255, 180, 210', 0.35, 16); B.gate();
            }
            B.anim().additive(false);
            return;
        }
        B.color(C.gold);                                                     // posts, ground to canopy
        for (const a of [Math.PI / 2 - 0.8, Math.PI / 2 + 0.8]) { const x = cx + Math.cos(a) * (R - 6), y = cy + Math.sin(a) * (R - 6); B.seg([x, y, 0, M], [x, y, z, M], 2); }
        const rim = (ox, oy, r0, bulge) => {
            const pts = [[cx + ox + r0, cy + oy, z, M]];
            for (let i = 0; i < N; i++) {
                const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, am = (a0 + a1) / 2;
                const q = GLBuildingBuilder.quadPts([cx + ox + Math.cos(a0) * r0, cy + oy + Math.sin(a0) * r0, z, M], [cx + ox + Math.cos(am) * (r0 + bulge), cy + oy + Math.sin(am) * (r0 + bulge)], [cx + ox + Math.cos(a1) * r0, cy + oy + Math.sin(a1) * r0, z, M], 6);
                pts.push(...q.slice(1));
            }
            return pts;
        };
        B.color('rgba(0,0,0,0.35)'); starFill(B, cx + 4, cy + 6, rim(4, 6, R, 8));
        const stops = [[0, C.velvet], [0.65, C.velvetLt], [1, C.velvet]], outline = rim(0, 0, R, 8);
        starFill(B, cx, cy, outline, (x, y) => stopColor(stops, (Math.hypot(x - cx, y - cy) - 6) / R), 14);
        B.color(C.gold).line(outline, 1.4, true, S);
        const ribs = []; for (let i = 1; i < N; i++) { const a = Math.PI * i / N; ribs.push([cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)]); }
        pl.segs(ribs, 0.8, 'rgba(255, 241, 194, 0.3)');
        const half = arcPts(cx, cy, 20, 0, Math.PI, 24, z, M);
        B.color('#100a16').poly(half); B.color(C.gold).line(half, 1.2, true, S);
        pl.ring(cx, cy, R - 10, 0.8, 'rgba(232, 194, 122, 0.6)', 0, Math.PI);
    }

    /** The marquee board over the door: lacquer in gold, "Moon City" in script with the crescent, NIGHTCLUB between gold rules */
    function sign(B, G, emissive) {
        const C = MCX.C, z = MCX.SIGN_Z, M = 1, x = G.sign.x, y = G.sign.y, Wd = 108, ty = y - 4, cx = x - 78, S = GLB_LINE.SCALE_K;
        const board = (ox = 0, oy = 0) => GLBuildingBuilder.roundRectPts(x - Wd + ox, y - 22 + oy, Wd * 2, 46, [6, 6, 14, 14], z, M);
        const p = (xx, yy) => [xx, yy, z, M];
        const rules = (col) => {
            B.color(col); for (const s of [-1, 1]) B.seg(p(x + s * 38, y + 15), p(x + s * 70, y + 15), 0.8, S);
            for (const s of [-1, 1]) B.poly([p(x + s * 74, y + 12.5), p(x + s * 76.5, y + 15), p(x + s * 74, y + 17.5), p(x + s * 71.5, y + 15)]);
        };
        const script = GLText.entry('Moon City', 34, 'Great Vibes', false), small = GLText.entry('N I G H T C L U B', 6.5, 'Montserrat', false, '600');
        const moon = crescent(cx, ty - 2, 9, -0.5, z, M);
        if (!emissive) {
            B.color('rgba(0,0,0,0.45)').poly(board(3, 4));
            GLBuildingModel.gradPoly(B, board(), 0, y - 22, 0, y + 24, [[0, '#1d1328'], [1, C.lacquer]]);
            B.color(C.gold).line(board(), 2, true, S);
            B.color('rgba(255, 241, 194, 0.3)').line(GLBuildingBuilder.roundRectPts(x - Wd + 4, y - 18, Wd * 2 - 8, 38, [4, 4, 11, 11], z, M), 0.8, true, S);
            B.color('rgba(0,0,0,0.55)'); GLText.quad(B, script, x + 6 + 1.5, ty + 2, z, M);
            B.color('#d8c8f0'); GLText.quad(B, script, x + 6, ty, z, M);
            B.color(C.gold); strip(B, moon.outer, moon.inner);
            B.color(C.gold); GLText.quad(B, small, x, y + 15, z, M);
            rules(C.goldDk);
            return;
        }
        // the neon: its own flicker, brighter with the dark (absolute alpha, as Canvas sets it)
        B.additive(true); pulse(B, 1, 0, F.UNGLOW | F.SIGN);
        B.gate(0, 0); fan(B, x, y, 100, z, M, '255, 120, 180', 0.25, 48); B.gate();
        B.color(GLColor.alpha(C.rose, 0.6)).line(board(), 1.2, true, S);   // the frame's neon edge
        B.gate(0, 0).color(C.rose); GLText.quad(B, GLText.entry('Moon City', 34, 'Great Vibes', true), x + 6, ty, z, M, 1, 1); B.gate();
        B.color('#ffb8d4'); GLText.quad(B, script, x + 6, ty, z, M);
        B.color('rgba(255, 244, 250, 0.9)'); GLText.quad(B, script, x + 6, ty, z, M);
        B.color(C.goldLt); strip(B, moon.outer, moon.inner);
        B.gate(0, 0); fan(B, cx, ty - 2, 20, z, M, '232, 194, 122', 0.6, 24); B.gate();
        B.color(GLColor.alpha(C.gold, 0.85)); GLText.quad(B, small, x, y + 15, z, M);
        rules(GLColor.alpha(C.gold, 0.85));
        B.anim().additive(false);
    }

    /** The roof plane (_mcDrawRoof, painted): decks, sunburst, the dome, the phases, the crescent, turrets, plant, the terrace */
    function roof(B, G, H) {
        const C = MCX.C, D = G.dome, PL = G.pool, R = GLBuildingModel.plane(B, H, 0), S = GLB_LINE.SCALE_K, p = R.p;
        const rectPts = (x, y, w, h) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
        for (const s of [G.hall, G.wing]) {
            const wing = s === G.wing, I = 16;
            GLBuildingModel.gradPoly(B, rectPts(s.x, s.y, s.w, s.h), s.x, s.y, s.x + s.w, s.y + s.h, [[0, '#171020'], [1, C.lacquer]]);
            R.rect(s.x + I, s.y + I, s.w - I * 2, s.h - I * 2, wing ? C.plum : '#0d0912');
            R.polyLine([[s.x + s.w - I, s.y + I], [s.x + s.w - I, s.y + s.h - I], [s.x + I, s.y + s.h - I]], 2, 'rgba(0, 0, 0, 0.55)');
            R.polyLine([[s.x + I, s.y + s.h - I], [s.x + I, s.y + I], [s.x + s.w - I, s.y + I]], 1, 'rgba(232, 194, 122, 0.3)');
            if (wing) { const l = []; for (let gy = s.y + I + 8; gy < s.y + s.h - I; gy += 8) l.push([s.x + I, gy, s.x + s.w - I, gy]); R.segs(l, 1, 'rgba(232, 194, 122, 0.06)'); }
            R.rectLine(s.x + 2, s.y + 2, s.w - 4, s.h - 4, 3, C.goldDk);
            R.rectLine(s.x + 6, s.y + 6, s.w - 12, s.h - 12, 0.8, 'rgba(255, 241, 194, 0.35)');
            for (const [x, y] of [[s.x + 4, s.y + 4], [s.x + s.w - 4, s.y + 4], [s.x + 4, s.y + s.h - 4], [s.x + s.w - 4, s.y + s.h - 4]]) R.rect(x - 3, y - 3, 6, 6, C.gold);
        }
        // the sunburst across the hall's deck (clipped to the inner deck) and two deco rings
        const Hh = G.hall, rays = [];
        for (let i = 0; i < 48; i++) {
            const a = i / 48 * TAU, c = clipSeg(D.x + Math.cos(a) * (D.r + 34), D.y + Math.sin(a) * (D.r + 34), D.x + Math.cos(a) * 640, D.y + Math.sin(a) * 640, Hh.x + 17, Hh.y + 17, Hh.x + Hh.w - 17, Hh.y + Hh.h - 17);
            if (c) rays.push(c.slice(0, 4));
        }
        R.segs(rays, 1, 'rgba(232, 194, 122, 0.08)');
        for (const r of [D.r + 34, D.r + 10]) R.ring(D.x, D.y, r, 1, 'rgba(232, 194, 122, 0.22)');
        R.disc(D.x, D.y, D.r, '#0d0814');                                    // the dome: smoked glass
        const pool = lune(PL.x, PL.y, PL.r, -0.35, H, 0);
        const gx0 = PL.x - PL.r * 0.3, gy0 = PL.y - PL.r * 0.3, pstops = [[0, '#3a2470'], [1, C.water]];
        strip(B, pool.outer, pool.inner, (x, y) => stopColor(pstops, radialT(x, y, gx0, gy0, 4, PL.x, PL.y, PL.r)), 6);
        // by day the glass and the water hold the sky
        pulse(B, 1, 0, F.DAY);
        GLBuildingModel.gradPoly(B, circle(D.x, D.y, D.r, H, 0, 64), D.x - D.r, D.y - D.r, D.x + D.r, D.y + D.r, [[0, 'rgba(190, 186, 236, 0.35)'], [0.5, 'rgba(120, 110, 180, 0.35)'], [1, 'rgba(60, 40, 100, 0.35)']]);
        B.color('rgba(190, 186, 236, 0.18)'); strip(B, pool.outer, pool.inner);
        B.anim();
        // the dome's leading, its gold collar, the boss
        const ribs = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ribs.push([D.x + Math.cos(a) * D.r * 0.34, D.y + Math.sin(a) * D.r * 0.34, D.x + Math.cos(a) * D.r, D.y + Math.sin(a) * D.r]); }
        R.segs(ribs, 1, 'rgba(232, 194, 122, 0.35)');
        for (const u of [0.34, 0.67]) R.ring(D.x, D.y, D.r * u, 1, 'rgba(232, 194, 122, 0.35)');
        { const g = phase(D.x, D.y, D.r, 0.32, H, 0, 32); B.color('rgba(200, 168, 255, 0.05)'); strip(B, g.outer, g.inner); }
        R.ring(D.x, D.y, D.r, 4, C.gold).ring(D.x, D.y, D.r + 5, 1, C.goldDk).disc(D.x, D.y, 5, C.gold);
        // the eight phases of the moon round it
        for (const q of G.phases) {
            R.disc(q.x + 1.5, q.y + 2, 9, 'rgba(0, 0, 0, 0.45)').disc(q.x, q.y, 9, '#100a16').ring(q.x, q.y, 9, 1, C.goldDk);
            if (q.ph) { const g = phase(q.x, q.y, 7, q.ph, H, 0); B.color(C.gold); strip(B, g.outer, g.inner); }
        }
        // the gold crescent on its stepped plinth
        const MO = G.moon;
        for (const [r, f] of [[38, '#100a16'], [32, '#171020']]) R.disc(MO.x, MO.y, r, f).ring(MO.x, MO.y, r, 1.2, C.goldDk);
        { const sh = crescent(MO.x + 3, MO.y + 4, 26, -0.5, H, 0, 40); B.color('rgba(0, 0, 0, 0.45)'); strip(B, sh.outer, sh.inner); }
        const cr = crescent(MO.x, MO.y, 26, -0.5, H, 0, 40), mstops = [[0, C.goldLt], [0.5, C.gold], [1, C.goldDk]];
        strip(B, cr.outer, cr.inner, (x, y) => stopColor(mstops, ((x - (MO.x - 26)) + (y - (MO.y - 26))) / 104), 3);
        B.color('rgba(255, 255, 255, 0.35)').line(cr.outline, 0.8, true, S);
        // the searchlight turrets
        for (const [x, y] of G.turrets) {
            R.disc(x + 3, y + 4, 14, 'rgba(0, 0, 0, 0.45)').disc(x, y, 14, '#100a16').ring(x, y, 14, 2, C.goldDk);
            R.disc(x, y, 7, C.fin).disc(x - 2, y - 2, 2, 'rgba(232, 216, 255, 0.5)');
        }
        // discreet plant: louvred lacquer units edged in gold
        for (const [x, y, w, h] of G.plant) {
            R.rect(x + 3, y + 3, w, h, 'rgba(0,0,0,0.4)').rect(x, y, w, h, '#100a16');
            const l = []; for (let ly = y + 4; ly < y + h - 1; ly += 4) l.push([x + 3, ly, x + w - 3, ly]);
            R.segs(l, 1, 'rgba(232, 194, 122, 0.14)');
            R.rectLine(x + 0.5, y + 0.5, w - 1, h - 1, 1, 'rgba(168, 130, 62, 0.6)');
        }
        // the terrace: the pool's coping, cabanas, loungers, topiary
        B.color(C.gold).line(pool.outline, 3, true, S);
        B.color('rgba(232, 216, 255, 0.35)').line(pool.outline, 0.8, true, S);
        for (const [x, y, w, h] of G.cabanas) {
            R.rect(x + 3, y + 4, w, h, 'rgba(0,0,0,0.45)').rect(x, y, w, h, C.velvet);
            R.poly([[x, y], [x + w, y], [x + w / 2, y + h / 2]], C.velvetLt).poly([[x, y], [x + w / 2, y + h / 2], [x, y + h]], 'rgba(138, 26, 82, 0.6)');
            R.segs([[x, y, x + w, y + h], [x + w, y, x, y + h]], 0.8, 'rgba(255, 241, 194, 0.35)');
            R.rectLine(x, y, w, h, 1.2, C.gold).disc(x + w / 2, y + h / 2, 2, C.goldLt);
        }
        for (const [x, y, w, h] of G.loungers) {
            R.rect(x + 2, y + 3, w, h, 'rgba(0,0,0,0.4)').rect(x, y, w, h, C.fin).rect(x + 2, y + 2, w - 4, h - 4, '#4a3468').rect(x + w - 8, y + 2, 6, h - 4, '#7a5aa8');
            R.disc(x - 6, y + h / 2, 2.4, C.gold);
        }
        const Wg = G.wing;
        for (const [x, y] of [[Wg.x + Wg.w - 30, Wg.y + Wg.h - 30], [Wg.x + 82, Wg.y + 30], [Wg.x + 82, Wg.y + Wg.h - 30]]) {
            R.disc(x + 2, y + 3, 10, 'rgba(0,0,0,0.45)');
            radialDisc(B, x, y, 9, H, 0, x - 3, y - 3, 1, x, y, 10, [[0, '#7a52c8'], [1, '#2a1a50']]);
            R.ring(x, y, 9, 1, C.goldDk);
        }
    }
    /** Canvas's two-circle radial gradient: the t of (x, y), the largest whose circle (radius ≥ 0) passes through it
        (the second circle holding the first, a < 0, takes the other root) */
    function radialT(x, y, x0, y0, r0, x1, y1, r1) {
        const cdx = x1 - x0, cdy = y1 - y0, dr = r1 - r0, px = x - x0, py = y - y0;
        const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
        if (Math.abs(a) < 1e-6) return c / (2 * b);
        const d = b * b - a * c; if (d < 0) return 0;
        const s = Math.sqrt(d), t = Math.max((b + s) / a, (b - s) / a);
        return r0 + t * dr >= 0 ? t : Math.min((b + s) / a, (b - s) / a);
    }
    /** A disc filled with Canvas's two-circle radial gradient (GLBuildingModel.radialDisc's mesh, with radialT) */
    function radialDisc(B, cx, cy, r, z, mode, gx0, gy0, r0, gx1, gy1, r1, stops) {
        const rings = 8, segs = 36, base = B.n, col = (x, y) => stopColor(stops, radialT(x, y, gx0, gy0, r0, gx1, gy1, r1));
        B.vertex([cx, cy, z, mode], undefined, undefined, 0, 0, 0, col(cx, cy));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
            const rr = r * i / rings, a = j / segs * TAU, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            B.vertex([x, y, z, mode], undefined, undefined, 0, 0, 0, col(x, y));
        }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
            const a = base + 1 + (i - 1) * segs + j, b = base + 1 + (i - 1) * segs + (j + 1) % segs;
            B.index.push(a, a + segs, b + segs, a, b + segs, b);
        }
    }

    // ---------------- glow: after the darkness ----------------
    function drawGlow(b, B, G, H, faces, ids) {
        const C = MCX.C, D = G.dome, PL = G.pool, S = GLB_LINE.SCALE_K, E = b._entrance();
        faces.forEach((f, i) => {
            B.face(ids[i]);
            const Fc = new GLFace(f, H);
            if (E && f.side === b.facing) frontWash(b, B, f, Fc, E);
            if (f.side !== 'C') face(B, Fc, true);
            B.reset();
        });
        canopy(B, G, true);
        sign(B, G, true);
        // the parapet rim (source-over, with Canvas's shadowBlur under it)
        const R = GLBuildingModel.plane(B, H, 0), rim = GLColor.alpha(b.colors.accent, 0.55);
        b.sections.forEach(s => {
            const pts = [[b.x + s.x + 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + s.h - 1], [b.x + s.x + 1, b.y + s.y + s.h - 1]].map(q => R.p(q[0], q[1]));
            B.softLine(pts, 1.6, 8, true, S, rim);
            B.color(rim).line(pts, 1.6, true, S);
        });
        B.additive(true);
        // the dance floor glows up through the dome, in the club's colours, on the beat (cells clipped to the glass)
        const disc = circle(D.x, D.y, D.r - 2, H, 0, 96), cell = 22;
        B.color('#fff');
        for (let gx = D.x - D.r; gx < D.x + D.r; gx += cell) for (let gy = D.y - D.r; gy < D.y + D.r; gy += cell) {
            const i = Math.round((gx - D.x) / cell), j = Math.round((gy - D.y) / cell);
            const q = clipConvex([R.p(gx + 2, gy + 2), R.p(gx + cell - 2, gy + 2), R.p(gx + cell - 2, gy + cell - 2), R.p(gx + 2, gy + cell - 2)], disc);
            if (q.length >= 3) B.anim(A.DOME, i, j).poly(q);
        }
        pulse(B, 0.5, 0.3).color('rgb(255, 241, 194)').circleLine(D.x, D.y, D.r, 2.4, H, 0, S);
        // the phases light one after another round the dome, a step a beat
        G.phases.forEach((q, i) => { B.anim(A.PHASE, i); fan(B, q.x, q.y, 22, H, 0, '200, 168, 255', 1, 24); });
        // violet neon round each deck's step
        pulse(B, 0.45, 0.25).color('rgb(138, 92, 255)');
        for (const s of [G.hall, G.wing]) B.rectLine(s.x + 16, s.y + 16, s.w - 32, s.h - 32, 2.4, H, 0, S);
        B.anim().color('rgba(232, 216, 255, 0.75)');
        for (const s of [G.hall, G.wing]) B.rectLine(s.x + 16, s.y + 16, s.w - 32, s.h - 32, 0.9, H, 0, S);
        // the pool lit violet from beneath, its coping in lavender
        pulse(B, 0.45, 0, 0, W.POOL); fan(B, PL.x, PL.y, PL.r * 1.5, H, 0, '138, 92, 255', 1, 48);
        B.anim().color('rgba(200, 168, 255, 0.6)').line(lune(PL.x, PL.y, PL.r - 2, -0.35, H, 0).outline, 1.4, true, S);
        // festoon lights across the terrace
        B.gate(0, 1);
        const Wg = G.wing;
        for (let row = 0; row < 3; row++) {
            const y = Wg.y + 40 + row * 60, x0 = Wg.x + 20, x1 = Wg.x + Wg.w - 20;
            for (let u = 0, i = 0; u <= 1.0001; u += 1 / 14, i++) {
                const x = x0 + (x1 - x0) * u, sag = 10 * 4 * u * (1 - u);
                pulse(B, 0.7, 0, 0, W.FESTOON, i * 0.9 + row);
                B.color('rgb(255, 232, 200)').disc(x, y + sag, 1.4, H, 0, 10);
                fan(B, x, y + sag, 5, H, 0, '255, 200, 150', 0.3, 14);
            }
        }
        B.gate();
        // the crescent's lavender halo
        pulse(B, 0.55, 0, 0, W.MOON); fan(B, G.moon.x, G.moon.y, 70, H, 0, '200, 168, 255', 1, 48);
        { const cr = crescent(G.moon.x, G.moon.y, 26, -0.5, H, 0, 40); B.anim().color('rgba(255, 241, 194, 0.55)'); strip(B, cr.outer, cr.inner); }
        // two slow searchlights from the turrets, violet and rose (at night, not when zoomed far out)
        B.gate(0, 1);
        for (const [x, y, rgb, ph] of G.turrets) {
            B.anim(A.MOVE, 10 + ph, x, y);
            const c = rgbaOf(rgb, 0.22), o = [c[0], c[1], c[2], 0], base = B.n, L = 560, w = 0.08, n = 8;
            B.vertex([x, y, H, 0], undefined, undefined, 0, 0, 0, c);
            for (let k = 0; k <= n; k++) { const a = -w + 2 * w * k / n; B.vertex([x + Math.cos(a) * L, y + Math.sin(a) * L, H, 0], undefined, undefined, 0, 0, 0, o); }
            for (let k = 0; k < n; k++) B.index.push(base, base + 1 + k, base + 2 + k);
            pulse(B, 0.8, 0, F.UNGLOW | F.BEAM); fan(B, x, y, 16, H, 0, rgb, 1, 24);
        }
        B.gate().anim().additive(false);
    }

    /** Floodlight wash up the front from the entrance (building-v2 _drawFrontWash) */
    function frontWash(b, B, f, Fc, E) {
        const vert = !!E.nx, door = vert ? E.cy : E.cx;
        const lo = vert ? Math.min(f.y1, f.y2) : Math.min(f.x1, f.x2), hi = vert ? Math.max(f.y1, f.y2) : Math.max(f.x1, f.x2);
        if (door < lo - 40 || door > hi + 40) return;
        const gx = vert ? f.x1 : door, gy = vert ? door : f.y1;
        B.gate(6).additive().anim(GLB_ANIM.RADIAL, gx, gy, 120).color(GLColor.alpha(b.colors.accent, 0.35));
        Fc.quad(B, 0, 1, 0, 1);
        B.additive(false).anim().gate();
    }

    /** Per frame: the club's beat and whether the lamps are on, on each layer's rim uniform (anims 29-32 read it) */
    function update(b, r) {
        const m = r.mc || (r.mc = new Float32Array(4)), n = b._mcBeat().n;
        m[0] = ((n % 32) + 32) % 32; m[1] = game.dayCycle().lampsOn ? 1 : 0;
        r.base.rim = r.top.rim = r.glow.rim = m;
    }

    return { build, update };
})();
