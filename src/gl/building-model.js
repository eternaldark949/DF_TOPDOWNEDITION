// GL engine: the building model. Turns a building's description (sections, floors, colours,
// facing, style, street variant, roof features) into GPU geometry, once. Three layers:
//   base  on the ground under people: the shadow, the footprint, the pavement dressing
//   top   over people: walls, windows, ledges, shopfronts, awnings, the roof and its features
//   glow  after the lighting: lit windows, neon, rims, roof lights (faded by the night)
// Every piece keeps the Canvas building's look: the same colours, proportions and draw order.
// What Canvas decided per frame (which walls face the camera, whether a wall shows enough for
// windows or sills, the zoom detail, the sun on the glass, lit windows, flicker) is decided in
// the vertex shader from the face table and per-frame uniforms (gl/building-mesh.js).
const GLBuildingModel = (() => {
    const FH = () => CONFIG.BUILDINGS.FLOOR_HEIGHT;
    const hashB = (seed, i) => { const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return s - Math.floor(s); };
    const LOD_FINE = 1;                                   // Canvas's `_zoomLOD < 2`

    /** A plane at height z (mode 0: the wall lean, 1: perspective) for flat art: fills and strokes that
        widen with the plane's scale, as Canvas drew them under ctx.scale(k) */
    function plane(B, z, mode = 0) {
        const p = (x, y) => [x, y, z, mode];
        const P = {
            p,
            rect(x, y, w, h, col) { B.color(col).poly([p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)]); return P; },
            rectLine(x, y, w, h, width, col) { B.color(col).line([p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)], width, true, GLB_LINE.SCALE_K); return P; },
            poly(pts, col, concave = false) { B.color(col).poly(pts.map(q => p(q[0], q[1])), concave); return P; },
            polyLine(pts, width, col, closed = false, flags = 0) { B.color(col).line(pts.map(q => p(q[0], q[1])), width, closed, GLB_LINE.SCALE_K | flags); return P; },
            disc(x, y, r, col) { B.color(col).disc(x, y, r, z, mode); return P; },
            ring(x, y, r, width, col, a0 = 0, a1 = Math.PI * 2) { B.color(col).circleLine(x, y, r, width, z, mode, GLB_LINE.SCALE_K, a0, a1); return P; },
            ellipse(x, y, rx, ry, rot, col) { B.color(col).ellipse(x, y, rx, ry, rot, z, mode); return P; },
            /** separate segments [[x0, y0, x1, y1], ...], one stroke */
            segs(list, width, col, flags = 0) { B.color(col); for (const s of list) B.line([p(s[0], s[1]), p(s[2], s[3])], width, false, GLB_LINE.SCALE_K | flags); return P; },
            roundRect(x, y, w, h, r, col) { B.color(col).poly(GLBuildingBuilder.roundRectPts(x, y, w, h, r, z, mode)); return P; },
            roundRectLine(x, y, w, h, r, width, col) { B.color(col).line(GLBuildingBuilder.roundRectPts(x, y, w, h, r, z, mode), width, true, GLB_LINE.SCALE_K); return P; },
            /** a linear gradient fill over a convex polygon: stops [[t, colour], ...] along (x0, y0) → (x1, y1) */
            grad(pts, x0, y0, x1, y1, stops) { gradPoly(B, pts.map(q => p(q[0], q[1])), x0, y0, x1, y1, stops); return P; },
            /** a radial gradient disc (Canvas's two-circle gradient) */
            radial(cx, cy, r, gx0, gy0, r0, gx1, gy1, r1, stops) { radialDisc(B, cx, cy, r, z, mode, gx0, gy0, r0, gx1, gy1, r1, stops); return P; }
        };
        return P;
    }

    const stopColor = (stops, t) => {
        if (t <= stops[0][0]) return GLColor.parse(stops[0][1]);
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [ta, ca] = stops[i - 1], [tb, cb] = stops[i]; return GLColor.mix(ca, cb, tb > ta ? (t - ta) / (tb - ta) : 1); }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** Clip a convex polygon to t >= lo and t <= hi (t along the gradient axis), colour each vertex by its t */
    function gradPoly(B, pts, x0, y0, x1, y1, stops) {
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, T = q => ((q[0] - x0) * dx + (q[1] - y0) * dy) / L2;
        const cuts = [-Infinity, ...stops.map(s => s[0]), Infinity];
        const clip = (poly, t, keepAbove) => {
            const out = [];
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length], ta = T(a) - t, tb = T(b) - t, ina = keepAbove ? ta >= 0 : ta <= 0, inb = keepAbove ? tb >= 0 : tb <= 0;
                if (ina) out.push(a);
                if (ina !== inb) { const s = ta / (ta - tb); out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2], a[3]]); }
            }
            return out;
        };
        for (let i = 0; i < cuts.length - 1; i++) {
            let band = pts;
            if (cuts[i] > -Infinity) band = clip(band, cuts[i], true);
            if (cuts[i + 1] < Infinity && band.length) band = clip(band, cuts[i + 1], false);
            if (band.length < 3) continue;
            B.polyColors(band, band.map(q => stopColor(stops, T(q))));
        }
    }
    function radialDisc(B, cx, cy, r, z, mode, gx0, gy0, r0, gx1, gy1, r1, stops) {
        // Canvas two-circle gradient: the t whose circle (centre lerp, radius lerp) passes through the point
        const tAt = (x, y) => {
            const cdx = gx1 - gx0, cdy = gy1 - gy0, dr = r1 - r0, px = x - gx0, py = y - gy0;
            const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
            let t;
            if (Math.abs(a) < 1e-6) t = c / (2 * b); else { const d = b * b - a * c; t = d < 0 ? 0 : (b + Math.sqrt(d)) / a; }
            return t;
        };
        const rings = 8, segs = 36, base = B.n, col = (x, y) => stopColor(stops, tAt(x, y));
        B.vertex([cx, cy, z, mode], undefined, undefined, 0, 0, 0, col(cx, cy));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
            const rr = r * i / rings, a = j / segs * Math.PI * 2, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            B.vertex([x, y, z, mode], undefined, undefined, 0, 0, 0, col(x, y));
        }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
            const a = base + 1 + (i - 1) * segs + j, b = base + 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
            B.index.push(a, c, d, a, d, b);
        }
    }

    // ---------------- the landmark kit's depth vocabulary (true perspective) ----------------
    /** Slabs along wall edges at height z: bands, then tops, then lips. edges [{a, b, nx, ny, face}] */
    function ledge(B, edges, z, out, th, top, band, lip, lipWidth = 0.9) {
        if (!edges.length) return;
        const zb = Math.max(0, z - th), P = (x, y, zz) => [x, y, zz, 1];
        const geo = edges.map(e => ({ e, ax: e.a[0] + e.nx * out, ay: e.a[1] + e.ny * out, bx: e.b[0] + e.nx * out, by: e.b[1] + e.ny * out }));
        for (const g of geo) { B.face(g.e.face ?? -1).color(band).quad(P(g.ax, g.ay, zb), P(g.bx, g.by, zb), P(g.bx, g.by, z), P(g.ax, g.ay, z)); }
        for (const g of geo) { B.face(g.e.face ?? -1).color(top).quad(P(g.e.a[0], g.e.a[1], z), P(g.e.b[0], g.e.b[1], z), P(g.bx, g.by, z), P(g.ax, g.ay, z)); }
        if (lip) for (const g of geo) { B.face(g.e.face ?? -1).color(lip).seg(P(g.ax, g.ay, z), P(g.bx, g.by, z), lipWidth); }
        B.face(-1);
    }
    function fins(B, anchors, z0, z1, w, out, face, edge) {
        if (!anchors.length) return;
        for (const a of anchors) {
            const tx = -a.ny * w / 2, ty = a.nx * w / 2, fx = a.x + a.nx * out, fy = a.y + a.ny * out;
            B.face(a.face ?? -1).color(face).quad([fx - tx, fy - ty, z0, 1], [fx + tx, fy + ty, z0, 1], [fx + tx, fy + ty, z1, 1], [fx - tx, fy - ty, z1, 1]);
        }
        if (edge) for (const a of anchors) {
            const tx = -a.ny * w / 2, ty = a.nx * w / 2, fx = a.x + a.nx * out, fy = a.y + a.ny * out;
            B.face(a.face ?? -1).color(edge).seg([fx + tx, fy + ty, z0, 1], [fx + tx, fy + ty, z1, 1], 0.8);
        }
        B.face(-1);
    }
    function veranda(B, edges, z, out, step, rh, slabTop, slabBand, rail) {
        ledge(B, edges, z, out, 2, slabTop, slabBand, null);
        const posts = [], rails = [];
        for (const e of edges) {
            const ax = e.a[0] + e.nx * (out - 1), ay = e.a[1] + e.ny * (out - 1), bx = e.b[0] + e.nx * (out - 1), by = e.b[1] + e.ny * (out - 1);
            const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step));
            rails.push([e.face, [ax, ay, z + rh, 1], [bx, by, z + rh, 1]]);
            for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; posts.push([e.face, [x, y, z, 1], [x, y, z + rh, 1]]); }
        }
        B.color(rail);
        for (const [f, a, b] of posts) B.face(f ?? -1).seg(a, b, 0.7);
        for (const [f, a, b] of rails) B.face(f ?? -1).seg(a, b, 1.2);
        B.face(-1);
    }

    // ---------------- the building ----------------
    function build(b) {
        const H = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) * FH();
        const out = { H, base: new GLBuildingBuilder(H), top: new GLBuildingBuilder(H), glow: new GLBuildingBuilder(H) };
        const faces = b._leanFaces();
        // the three layers share one face table, in the Canvas face order
        out.faceIds = faces.map(f => { const i = out.top.addFace(f); out.base.addFace(f); out.glow.addFace(f); return i; });
        drawBase(b, out);
        drawTop(b, out, faces);
        drawGlow(b, out, faces);
        return out;
    }

    function drawBase(b, o) {
        const B = o.base, G = plane(B, 0);
        b.sections.forEach(s => G.rect(b.x + s.x + b.facadeDepth, b.y + s.y + b.facadeDepth, s.w, s.h, 'rgba(0, 0, 0, 0.5)'));
        b.sections.forEach(s => G.rect(b.x + s.x - 5, b.y + s.y - 5, s.w + 10, s.h + 10, 'rgba(10, 10, 15, 0.3)'));
        if (b.variant) GLStreetVariants.base(b, B);
    }

    function drawTop(b, o, faces) {
        const B = o.top, H = o.H, V = !!b.variant;
        const wall = b.colors.wall;
        faces.forEach((f, i) => {
            const id = o.faceIds[i], F = new GLFace(f, H);
            B.face(id);
            const shade = f.side === 'S' ? 18 : f.side === 'N' ? -8 : f.side === 'C' ? Math.round(6 + (f.ny > 0 ? 12 : 14) * f.ny) : 6;
            const c0 = darkenHex(wall, 6), c1 = shade >= 0 ? lightenHex(wall, shade) : darkenHex(wall, -shade);
            B.polyColors([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], [c0, c0, c1, c1]);
            B.color('rgba(0,0,0,0.35)').line([F.at(0, 0), F.at(1, 0), F.at(1, 1), F.at(0, 1)], 1, true);
            if (V) GLStreetVariants.faceUnder(b, B, f, F, H);
            windows(b, B, f, F, H, false);
            faceFeature(b, B, f, F, H, false);
            B.reset();
        });
        if (V) GLStreetVariants.faceOver(b, B, faces, o.faceIds, H);
        sign(b, B, H, false);
        // --- the roof plane ---
        const R = plane(B, H);
        if (V && b.variant.kind === 'shop') GLStreetVariants.shopRoof(b, B, H);
        else {
            b.sections.forEach(s => {
                const sx = b.x + s.x, sy = b.y + s.y;
                R.rect(sx, sy, s.w, s.h, b.colors.roof);
                const seams = []; for (let gx = 36; gx < s.w; gx += 36) seams.push([sx + gx, sy, sx + gx, sy + s.h]);
                R.segs(seams, 1, 'rgba(255,255,255,0.05)');
                R.rectLine(sx + 2.5, sy + 2.5, s.w - 5, s.h - 5, 5, lightenHex(b.colors.roof, 22));
            });
            if (V) GLStreetVariants.aptRoof(b, B, H);
            if (b.style) roofFeatures(b, B, H, false); else roofProps(b, B, H);
        }
    }

    /** The window grid of a face (Canvas _drawFaceWindows): glass, the sky and sun by day, sills */
    function windows(b, B, f, F, H, emissive) {
        if (f.side === 'C') return;
        const floors = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS), cols = Math.max(1, Math.floor(F.L / 26));
        const mask = b.variant && b.variant.kind === 'shop' && f.side === b.facing ? (fl => fl === 0) : null;
        const list = [];
        for (let fl = 0; fl < floors; fl++) for (let c = 0; c < cols; c++) {
            if (mask && mask(fl)) continue;
            list.push({ fl, c, u0: (c + 0.25) / cols, u1: (c + 0.75) / cols, v0: (fl + 0.28) / floors, v1: (fl + 0.78) / floors });
        }
        const q = w => B.poly([F.at(w.u0, w.v0), F.at(w.u1, w.v0), F.at(w.u1, w.v1), F.at(w.u0, w.v1)]);
        const sills = b.sills, sOut = 1.6, nx = f.nx, ny = f.ny;
        const sill = (w, vv) => { const w0 = w.u0 - 0.06 / cols, w1 = w.u1 + 0.06 / cols, a = F.at(w0, vv), c = F.at(w1, vv);
            B.seg([a[0] + nx * sOut, a[1] + ny * sOut, a[2], 0], [c[0] + nx * sOut, c[1] + ny * sOut, c[2], 0], B._sillW); };
        if (!emissive) {
            B.gate(floors * 1.6);
            B.color('rgba(20,28,48,0.9)'); for (const w of list) q(w);
            B.color('rgb(168, 172, 226)').anim(GLB_ANIM.SKY); for (const w of list) q(w);
            for (const w of list) { B.anim(GLB_ANIM.SHEEN, (w.u0 + w.u1) / 2, 0.7 + 0.3 * (w.fl % 2)); q(w); }
            B.anim();
            if (sills) {
                B.gate(floors * 2.4, LOD_FINE);
                B._sillW = 1.2; B.color(sills.shade); for (const w of list) sill(w, w.v0 - 0.5 / floors);
                B._sillW = 1; B.color(sills.lip); for (const w of list) sill(w, w.v0 - 0.2 / floors);
            }
            B.gate();
            return;
        }
        // night: lit rooms (most fixed, the few that change every 7 s hashed on the GPU), TVs, sill rims
        const seed = b._seed || Math.round(b.x + b.y), sSeed = seed + f.section * 31 + f.side.charCodeAt(0), thr = b.style ? 0.5 : 0.3;
        const lit = b.colors.windowLit || '#ffe2a8';
        B.gate(floors * 1.6);
        const fixed = [], tv = [], changing = [];
        for (const w of list) {
            const idx = w.fl * 57 + w.c * 13;
            if (hashB(seed, w.fl + w.c) > 0.93) { changing.push({ w, idx }); continue; }
            const h = hashB(sSeed, idx);
            if (!(h < thr)) continue;
            (h < 0.06 ? tv : fixed).push(w);
        }
        B.color(lit); for (const w of fixed) q(w);
        for (const { w, idx } of changing) { B.anim(GLB_ANIM.WINDOW, sSeed, idx, thr); q(w); }
        B.color('#9ec8ff');
        for (const w of tv) { B.anim(GLB_ANIM.TV, 0, 0, w.c); q(w); }
        for (const { w, idx } of changing) { B.anim(GLB_ANIM.WINDOW_TV, sSeed, idx, w.c); q(w); }
        B.anim();
        if (sills) {
            B.gate(floors * 2.4, LOD_FINE).additive().anim(GLB_ANIM.RIM).color(GLColor.alpha(b.colors.accent || '#ffcf8a', 0.5));
            B._sillW = 1; for (const w of list) sill(w, w.v0 - 0.2 / floors);
            B.additive(false).anim();
        }
        B.gate();
    }

    /** Balconies and fire escapes (apartments) */
    function faceFeature(b, B, f, F, H, emissive) {
        const ff = b.facadeFeature;
        if (!ff || ff === 'silver_queen' || ff === 'moon_city') return;
        const floors = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS);
        B.gate(6);
        if (ff === 'balconies' && f.side === b.facing) {
            if (!emissive) { B.color('rgba(200,210,225,0.55)'); for (let fl = 1; fl < floors; fl += 2) F.line(B, 0.08, fl / floors, 0.92, fl / floors, 1.4); }
            else {
                B.color(b.colors.accent);
                for (let fl = 1; fl < floors; fl += 2) for (let u = 0.12; u < 0.9; u += 0.19) { const p = F.at(u, fl / floors); B.disc(p[0], p[1], 1.1, p[2], 0, 10); }
            }
        } else if (ff === 'fire_escape' && (f.side === 'E' || f.side === 'W') && !emissive) {
            B.color('rgba(150,120,110,0.7)');
            for (let fl = 1; fl < floors; fl++) F.line(B, 0.25, fl / floors, 0.65, fl / floors, 1);
            for (let fl = 1; fl < floors; fl += 2) F.line(B, 0.3, fl / floors, 0.6, (fl + 1) / floors, 1);
            for (let fl = 2; fl < floors; fl += 2) F.line(B, 0.6, fl / floors, 0.3, (fl + 1) / floors, 1);
        }
        B.gate();
    }

    /** The procedural roof props of the unstyled buildings (AC, tanks, vents, turning fans) */
    function roofProps(b, B, H) {
        const R = plane(B, H);
        let lw = 5;                                                    // Canvas's stroke width carries over from the parapet
        for (const p of b.roofProps) {
            const sec = b.sections[p.section] || b.sections[0], x = b.x + sec.x + p.x, y = b.y + sec.y + p.y;
            if (p.type === 'ac_unit') { R.rect(x, y, p.w, p.h, '#3a3f48'); R.rectLine(x + 3, y + 3, p.w - 6, p.h - 6, lw, '#555c66'); }
            else if (p.type === 'water_tank') { R.disc(x, y, p.r, '#4a4238'); lw = 2; R.ring(x, y, p.r * 0.7, 2, '#6a5e50'); }
            else if (p.type === 'vent') R.rect(x, y, p.w, p.h, '#2e333a');
            else if (p.type === 'roof_fan') {
                R.disc(x, y, p.r, '#333841'); lw = 1;
                B.anim(GLB_ANIM.SPIN, x, y, 2).color('#4b525c');
                for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.line([R.p(x, y), R.p(x + Math.cos(a) * p.r * 0.8, y + Math.sin(a) * p.r * 0.8)], 1, false, GLB_LINE.SCALE_K); }
                B.anim();
            }
        }
    }

    /** Styled rooftops (apartments): stair hut, pool, garden, laundry, tank, solar, lights, antenna, dish */
    function roofFeatures(b, B, H, emissive) {
        const R = plane(B, H), main = b.sections[0], mx = b.x + main.x, my = b.y + main.y, mw = main.w, mh = main.h;
        const r = i => hashB(b._seed || 1, 100 + i), acc = b.colors.accent;
        const slots = { stair: [0.08, 0.1, 0.18, 0.2], pool: [0.4, 0.14, 0.42, 0.34], garden: [0.38, 0.12, 0.46, 0.36], laundry: [0.12, 0.56, 0.5, 0.3],
                        tank: [0.76, 0.6, 0.14, 0.18], solar: [0.56, 0.56, 0.34, 0.32], lights: [0.06, 0.08, 0.88, 0.84], antenna: [0.88, 0.1, 0.05, 0.05], dish: [0.74, 0.12, 0.1, 0.1] };
        for (const f of b.roofFeatures || []) {
            if (!slots[f]) continue;
            const s = slots[f], x = mx + s[0] * mw, y = my + s[1] * mh, w = s[2] * mw, h = s[3] * mh;
            switch (f) {
                case 'stair':
                    if (!emissive) { R.rect(x, y, w, h, lightenHex(b.colors.roof, 18)); R.rect(x + w, y + 4, 4, h, 'rgba(0,0,0,0.35)'); }
                    else R.rect(x + w * 0.35, y + h - 3, w * 0.3, 3, '#ffd9a0');
                    break;
                case 'pool':
                    if (!emissive) { R.rect(x - 5, y - 5, w + 10, h + 10, '#d9d2c4'); R.grad([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], x, y, x + w, y + h, [[0, '#4fc3e0'], [1, '#1f6fa8']]); }
                    else {
                        R.grad([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], x, y, x + w, y + h, [[0, GLColor.alpha('#2bb8d8', 0.8)], [1, GLColor.alpha('#0f4f8a', 0.8)]]);
                        B.color('rgba(255,255,255,0.45)');
                        for (let i = 0; i < 4; i++) {
                            const yy = y + h * (0.2 + i * 0.2), n = 12, pts = [];
                            for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; pts.push({ p: R.p(u * u * (x + 4) + 2 * u * t * (x + w / 2) + t * t * (x + w - 4), yy), wgt: 2 * u * t }); }
                            // each point sways with the curve's two sines (GPU)
                            for (let k = 0; k < n; k++) {
                                const a = pts[k], c = pts[k + 1];
                                B.anim(GLB_ANIM.CAUSTIC, i, a.wgt); const v0 = B.vertex(a.p, a.p, c.p, -1, 0.5, GLB_LINE.SCALE_K), v1 = B.vertex(a.p, a.p, c.p, 1, 0.5, GLB_LINE.SCALE_K);
                                B.anim(GLB_ANIM.CAUSTIC, i, c.wgt); const v2 = B.vertex(c.p, a.p, c.p, 1, 0.5, GLB_LINE.SCALE_K), v3 = B.vertex(c.p, a.p, c.p, -1, 0.5, GLB_LINE.SCALE_K);
                                B.index.push(v0, v1, v2, v0, v2, v3);
                            }
                        }
                        B.anim();
                    }
                    break;
                case 'garden':
                    if (!emissive) {
                        R.rect(x, y, w, h, '#3b2e24');
                        const greens = ['#2f7d3a', '#3c9b47', '#27643a'], rr = Math.min(w, h) * 0.14;
                        for (let k = 0; k < 3; k++) for (let i = k; i < 9; i += 3) R.disc(x + w * (0.12 + (i % 3) * 0.38), y + h * (0.2 + Math.floor(i / 3) * 0.3), rr, greens[k]);
                    } else for (let i = 0; i < 4; i++) R.disc(x + w * (0.3 + (i % 2) * 0.4), y + h * (0.35 + Math.floor(i / 2) * 0.3), 1.6, '#ffcf7a');
                    break;
                case 'laundry': {
                    if (emissive) break;
                    const cloth = ['#ff6b8a', '#6bc6ff', '#ffe066', '#b58cff', '#ffffff', '#7dffb3'];
                    for (let row = 0; row < 3; row++) {
                        const yy = y + h * (0.2 + row * 0.3);
                        R.segs([[x, yy, x + w, yy]], 0.7, 'rgba(220,220,220,0.5)');
                        for (let i = 0; i < 5; i++) { B.anim(GLB_ANIM.SWAY, i + row); R.rect(x + w * (0.08 + i * 0.18), yy, w * 0.1, h * 0.14, cloth[(i + row * 2 + Math.floor(r(row) * 6)) % cloth.length]); }
                        B.anim();
                    }
                    break;
                }
                case 'tank': {
                    if (emissive) break;
                    const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                    R.disc(cx, cy, rr, '#5a4a3a'); R.ring(cx, cy, rr * 0.65, 2, '#7a6650'); R.disc(cx, cy, rr * 0.25, '#3e3328');
                    break;
                }
                case 'solar': {
                    if (emissive) break;
                    const cells = [];
                    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cells.push([x + i * w / 3 + 2, y + j * h / 2 + 2, w / 3 - 4, h / 2 - 4]);
                    for (const c of cells) R.rect(...c, '#1c2a4a');
                    for (const c of cells) R.rectLine(...c, 0.6, 'rgba(120,160,255,0.35)');
                    break;
                }
                case 'lights': {
                    if (!emissive) break;
                    const cols = ['#ffd27a', acc, '#ffd27a', '#ff9ecf'], rows = [];
                    for (let z = 0; z < 3; z++) {
                        const y0 = y + h * (0.15 + z * 0.35), y1 = y0 + h * 0.18;
                        for (let i = 0; i <= 12; i++) (rows[i + z] || (rows[i + z] = [])).push([x + w * i / 12, (i % 2 ? y1 : y0) + Math.sin(i * 0.9) * 2]);
                    }
                    rows.forEach((pts, s) => { B.anim(GLB_ANIM.SHIMMER, s); for (const [px, py] of pts) R.disc(px, py, 1.5, cols[s % cols.length]); });
                    B.anim();
                    break;
                }
                case 'antenna': {
                    const cx = x + w / 2, cy = y + h / 2;
                    if (!emissive) R.segs([[cx - 6, cy, cx + 6, cy], [cx, cy - 6, cx, cy + 6]], 1.5, '#8a8f99');
                    else { B.anim(GLB_ANIM.BLINK_ON, b._seed || 0, 3, 0.3); R.disc(cx, cy, 6, 'rgba(255,48,64,0.25)'); R.disc(cx, cy, 2.2, '#ff3040'); B.anim(); }
                    break;
                }
                case 'dish': {
                    if (emissive) break;
                    const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) / 2;
                    R.ellipse(cx, cy, rr, rr * 0.8, 0.6, '#c9ced6'); R.disc(cx, cy, 1.8, '#8a9099');
                    break;
                }
            }
        }
    }

    /** The entrance sign's awning (apartments with a sign); the shops' fronts are their variant's */
    function sign(b, B, H, emissive) {
        if (b.variant && b.variant.kind === 'shop') { GLStreetVariants.front(b, B, emissive); return; }
        const E = b.attachedSign && b._entrance();
        if (!E || emissive) return;
        const size = b.attachedSign.fontSize || 45, tw = Math.min((E.nx ? b.h : b.w) - 20, GLText.measure(b.attachedSign.text, size, 'Great Vibes') + 34), d = Math.round(size * 0.95);
        const z = 2 * FH(), a = [E.cx - E.ux * tw / 2, E.cy - E.uy * tw / 2], c = [E.cx + E.ux * tw / 2, E.cy + E.uy * tw / 2];
        ledge(B, [{ a, b: c, nx: E.nx, ny: E.ny }], z, d, 3, darkenHex(b.colors.wall || '#2a2436', 8), darkenHex(b.colors.wall || '#2a2436', 22), `rgba(${hexToRgb(b.colors.accent || '#a469ff')}, 0.55)`);
        // the neon sign lying on it: a dark backdrop, the bloom and the white-hot core, flickering on the GPU
        const e = GLText.entry(b.attachedSign.text, size, 'Great Vibes', true), rot = E.nx ? E.nx * Math.PI / 2 : 0, cs = Math.cos(rot), sn = Math.sin(rot);
        const seed = (b.x + b.y) * 7, lamp = b.colors.accent || '#a469ff';
        B.inFrame([cs, sn, -sn, cs, E.cx + E.nx * d / 2, E.cy + E.ny * d / 2], () => {
            B.color('#000'); GLText.quad(B, e, 0, 0, z + 0.5, 1, 1, 1, 3);
            B.anim(GLB_ANIM.FLICKER, seed).color(lamp); GLText.quad(B, e, 0, 0, z + 0.5, 1, 2, 1);
            B.color('rgba(255,255,255,0.6)'); GLText.quad(B, e, 0, 0, z + 0.5, 1, 0);
            B.anim();
        });
    }

    function drawGlow(b, o, faces) {
        const B = o.glow, H = o.H;
        faces.forEach((f, i) => {
            B.face(o.faceIds[i]);
            const F = new GLFace(f, H);
            if (b.style && f.side === b.facing && b._entrance()) frontWash(b, B, f, F);
            windows(b, B, f, F, H, true);
            faceFeature(b, B, f, F, H, true);
            B.reset();
        });
        if (b.variant) GLStreetVariants.glow(b, B, faces, o.faceIds, H);
        // the roof: a rim along the parapets reads the silhouette at night, then the roof lights
        const R = plane(B, H), rim = b.style ? b.colors.accent : '#8fa0c8', ra = b.style ? 0.55 : 0.18, lw = b.style ? 1.6 : 1;
        b.sections.forEach(s => {
            const pts = [[b.x + s.x + 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + 1], [b.x + s.x + s.w - 1, b.y + s.y + s.h - 1], [b.x + s.x + 1, b.y + s.y + s.h - 1]].map(q => R.p(q[0], q[1]));
            if (b.style) B.softLine(pts, lw, 8, true, GLB_LINE.SCALE_K, GLColor.alpha(rim, ra));
            B.color(GLColor.alpha(rim, ra)).line(pts, lw, true, GLB_LINE.SCALE_K);
        });
        if (b.variant) GLStreetVariants.roofGlow(b, B, H);
        if (b.style) roofFeatures(b, B, H, true);
    }

    /** Floodlight wash up the front from the entrance lamps (additive, a radial fade on the GPU) */
    function frontWash(b, B, f, F) {
        const E = b._entrance(), vert = !!E.nx, door = vert ? E.cy : E.cx;
        const lo = vert ? Math.min(f.y1, f.y2) : Math.min(f.x1, f.x2), hi = vert ? Math.max(f.y1, f.y2) : Math.max(f.x1, f.x2);
        if (door < lo - 40 || door > hi + 40) return;
        const gx = vert ? f.x1 : door, gy = vert ? door : f.y1;
        B.gate(6).additive().anim(GLB_ANIM.RADIAL, gx, gy, 120).color(GLColor.alpha(b.colors.accent, 0.35));
        F.quad(B, 0, 1, 0, 1);
        B.additive(false).anim().gate();
    }

    return { build, plane, ledge, fins, veranda, gradPoly, radialDisc, hashB, LOD_FINE };
})();
