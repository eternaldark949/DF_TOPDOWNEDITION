// GL engine: the city's ground, as GPU geometry. The lots, lawns, parks, roads, intersections,
// pavements and crossings are built once from the map (the same shapes and colours the Canvas
// ground baker paints into tiles, world/ground-baker.js) and drawn by the building shader at
// height 0. The fine texture Canvas scatters by hand (grain on the lots and the tarmac, the
// lawn's blades, the pavement's tiles and seams) is computed per pixel on the GPU (GLB_ANIM.GROUND).
//
// Geometry is grouped by layer (lots under lawns under roads under pavements under crossings)
// and, within a layer, into 1024 px chunks: a chunk is built when it first nears the view, and only
// the chunks in view are submitted.
const GLGround = (() => {
    const CHUNK = 1024, L = () => GROUND_LOOK;
    const P = (x, y) => [x, y, 0, 0];
    const LAYERS = ['lot', 'zone', 'park', 'road', 'junction', 'pavement', 'crossing'];
    // GROUND anim kinds (building-mesh.js): 1 grain (coverage, seed), 2 pavement tiles
    const grain = (B, pts, color, coverage, seed, concave = false) => { B.anim(GLB_ANIM.GROUND, 1, coverage, seed % 997).color(color).poly(pts, concave); B.anim(); };
    const rectPts = (x, y, w, h) => [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)];
    const ptsOf = poly => poly.map(p => P(p.x, p.y));
    /** A polyline as dashes (Canvas setLineDash [on, off], from its start) */
    function dashes(B, pts, width, on, off) {
        let carry = 0, drawing = true, cur = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            let a = pts[i - 1]; const b = pts[i];
            let segLen = Math.hypot(b[0] - a[0], b[1] - a[1]), t0 = 0;
            while (segLen - t0 > 1e-6) {
                const left = (drawing ? on : off) - carry, step = Math.min(left, segLen - t0), t1 = t0 + step, f = t1 / segLen;
                const p = P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
                if (drawing) cur.push(p);
                carry += step; t0 = t1;
                if (carry >= (drawing ? on : off) - 1e-6) { if (drawing && cur.length > 1) B.line(cur, width); drawing = !drawing; carry = 0; cur = [p]; }
            }
            if (drawing && cur[cur.length - 1] !== b) cur.push(P(b[0], b[1]));
        }
        if (drawing && cur.length > 1) B.line(cur, width);
    }
    const ellipsePts = (cx, cy, rx, ry, n = 64) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); });

    // ---- the painters (world/ground-baker.js, world/parks.js) ----
    function lawn(B, z, rnd) {
        const G = L();
        B.color(G.lawn).rect(z.x, z.y, z.w, z.h);
        grain(B, rectPts(z.x, z.y, z.w, z.h), G.lawnHi, .012, z.x + z.y);                       // bright blades
        grain(B, rectPts(z.x, z.y, z.w, z.h), G.lawnLo, .01, z.x * 3 + z.y);                     // dark blades
        for (let k = 0; k < (z.w * z.h) / 9000; k++) {                                            // soft darker hollows
            const cx = z.x + rnd() * z.w, cy = z.y + rnd() * z.h, r = 20 + rnd() * 50;
            B.anim(GLB_ANIM.RADIAL, cx, cy, r).color('rgba(4, 14, 8, 0.35)').disc(cx, cy, r); B.anim();
        }
    }
    function road(B, road, rnd) {
        const G = L(), halfT = road.thickness / 2, corners = ptsOf(road.getCorners());
        B.color(G.asphalt).poly(corners, true);
        grain(B, corners, 'rgba(255,240,255,0.03)', .016, road.x + road.y, true);
        grain(B, corners, 'rgba(0,0,0,0.18)', .016, road.x * 7 + road.y, true);
        const lanes = road.symmetrical ? road.numLanes * 2 : road.numLanes;
        const stops = road.path ? [0, ...road.path.bends(), road.length] : [0, road.length];
        const trace = lat => stops.map(s => { const p = road.paramToWorld(s, lat); return P(p.x, p.y); });
        // repairs: patches of fresher tar, laid in the road's own frame
        for (let k = 0; k < (road.length * road.thickness) / 40000; k++) {
            const s = rnd() * road.length, w = 30 + rnd() * 70, h = 16 + rnd() * 30, lat = (rnd() - .5) * Math.max(0, road.thickness - h);
            const f = road.frameAt(Math.min(road.length, s)), c = Math.cos(f.angle), sn = Math.sin(f.angle), o = road.paramToWorld(s, lat);
            B.color(G.asphaltHi).inFrame([c, sn, -sn, c, o.x, o.y], () => B.rect(-w / 2, -h / 2, w, h));
        }
        B.color('rgba(0, 0, 0, 0.16)');                                                          // wheel paths, darker down each lane
        for (let l = 0; l < lanes; l++) for (const off of [-13, 13]) B.line(trace(-halfT + road.laneWidth * (l + .5) + off), 9);
        for (let l = 1; l < lanes; l++) {                                                         // lane markings
            const lat = l * road.laneWidth - halfT;
            if (road.symmetrical && l === road.numLanes) { B.color(G.centre); B.line(trace(lat - 3), 1.6); B.line(trace(lat + 3), 1.6); }
            else { B.color(G.dash); dashes(B, trace(lat), 2, 22, 18); }
        }
        B.color(G.edge); B.line(trace(-halfT + 5), 1.5); B.line(trace(halfT - 5), 1.5);
        if (road.name) {                                                                          // its name on the tarmac every 600 px, one per carriageway
            const e = GLText.entry(road.name.toUpperCase(), 11, 'Montserrat', false, '600'), n = Math.max(1, Math.round(road.length / 600)), lat = Math.min(13, road.laneWidth * .35) + 8;
            B.color('rgba(232, 214, 190, 0.22)');
            for (let k = 0; k < n; k++) {
                const along = road.length * (k + .5) / n;
                for (const s of road.symmetrical ? [-1, 1] : [1]) {
                    const p = road.paramToWorld(along, s * lat), a = road.frameAt(along).angle + (s > 0 ? Math.PI : 0), c = Math.cos(a), sn = Math.sin(a);
                    B.inFrame([c, sn, -sn, c, p.x, p.y], () => GLText.quad(B, e, 0, 0, 0, 0));
                }
            }
        }
    }
    function junction(B, ix) {
        const G = L();
        if (ix.poly) B.color(G.asphalt).poly(ptsOf(ix.poly), true);
        else { B.color(G.asphalt).rect(ix.x, ix.y, ix.width, ix.height); B.color('rgba(0,0,0,0.25)').rectLine(ix.x + .5, ix.y + .5, ix.width - 1, ix.height - 1, 1, 0, 0, 0); }
        const mx = ix.x + ix.width / 2 + 22, my = ix.y + ix.height / 2 - 18;                    // a manhole, off-centre
        B.color('#1d1a22').disc(mx, my, 11); B.color('rgba(232, 200, 140, 0.18)').circleLine(mx, my, 11, 1, 0, 0, 0);
        B.color('rgba(0,0,0,0.4)'); for (let k = -6; k <= 6; k += 4) B.seg(P(mx - 7, my + k), P(mx + 7, my + k), 1);
    }
    function pavement(B, p) {
        const G = L(), shape = p.poly ? ptsOf(p.poly) : rectPts(p.x, p.y, p.w, p.h);
        B.anim(GLB_ANIM.GROUND, 2, 0, 0).color(G.paveA).poly(shape, !!p.poly); B.anim();        // tiles and seams, per pixel
        if (p.poly) { B.color(G.kerbLit).line(shape, 2, true); return; }                        // (the kerb's inner half: Canvas clips its 8 px stroke)
        B.color(G.kerb).rectLine(p.x + 2, p.y + 2, p.w - 4, p.h - 4, 4, 0, 0, 0);
        B.color(G.kerbLit).rectLine(p.x + .5, p.y + .5, p.w - 1, p.h - 1, 1, 0, 0, 0);
        const long = p.w > p.h;                                                                   // a drain every so often
        for (let s = 180; s < (long ? p.w : p.h) - 40; s += 260) {
            const dx = long ? p.x + s : p.x + 6, dy = long ? p.y + 6 : p.y + s;
            B.color('#141218').rect(dx, dy, long ? 22 : 8, long ? 8 : 22);
            B.color('rgba(120, 110, 130, 0.35)');
            for (let k = 2; k < 22; k += 4) long ? B.seg(P(dx + k, dy + 1), P(dx + k, dy + 7), 1) : B.seg(P(dx + 1, dy + k), P(dx + 7, dy + k), 1);
        }
    }
    function crossing(B, cw, rnd) {
        const G = L();
        const stripe = (x, y, w, h) => {                                                          // worn: a few gaps
            B.color(G.stripe).rect(x, y, w, h);
            B.color('rgba(22, 20, 27, 0.55)'); for (let k = 0; k < 5; k++) B.rect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 4, 1 + rnd() * 3);
        };
        if (cw.axis) {
            const A = cw.axis, len = A.a1 - A.a0 - 16;
            B.color(G.asphalt).poly(ptsOf(cw.poly), true);
            B.inFrame([A.ux, A.uy, A.nx, A.ny, A.ox, A.oy], () => { for (let l = -A.hT + 8; l < A.hT - 8; l += 18) stripe(A.a0 + 8, l, len, 11); });
            return;
        }
        B.color(G.asphalt).rect(cw.x, cw.y, cw.w, cw.h);
        if (cw.orientation === 'H') for (let sy = cw.y + 8; sy < cw.y + cw.h - 8; sy += 18) stripe(cw.x + 8, sy, cw.w - 16, 11);
        else for (let sx = cw.x + 8; sx < cw.x + cw.w - 8; sx += 18) stripe(sx, cw.y + 8, 11, cw.h - 16);
    }
    function park(B, b) {
        const Q = parkLayout(b), rnd = seededRandom(b.x * 3 + b.y * 7);
        B.color('#15291c').rect(b.x, b.y, b.w, b.h);                                              // lawn with grain
        grain(B, rectPts(b.x, b.y, b.w, b.h), '#1f3f29', .016, b.x + 1);
        grain(B, rectPts(b.x, b.y, b.w, b.h), 'rgba(5, 16, 9, 0.7)', .013, b.y + 2);
        B.color('#0f2416').rectLine(b.x + 9, b.y + 9, b.w - 18, b.h - 18, 18, 0, 0, 0);          // the hedge, a gap at each gate
        B.color('rgba(70, 120, 80, 0.35)').rectLine(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 2, 0, 0, 0);
        const gravel = '#4a4054', edge = 'rgba(214, 200, 240, 0.22)';
        for (const [gx, gy] of Q.gates) {
            B.color('#15291c').rect(gx - 26, gy - 26, 52, 52);
            const ex = Q.cx + (gx - Q.cx) * .2, ey = Q.cy + (gy - Q.cy) * .2;
            B.color(gravel).seg(P(gx, gy), P(ex, ey), 30).disc(gx, gy, 15).disc(ex, ey, 15);    // (round caps)
        }
        B.color(gravel).line(ellipsePts(Q.cx, Q.cy, Q.rx, Q.ry, 96), 30, true);
        B.color(edge); for (const k of [-15, 15]) B.line(ellipsePts(Q.cx, Q.cy, Q.rx + k, Q.ry + k, 96), 1.2, true);
        for (let k = 0; k < 900; k++) {                                                           // gravel grain along the walk
            const a = rnd() * Math.PI * 2, d = (rnd() - .5) * 28;
            B.color(rnd() < .5 ? 'rgba(255, 240, 255, 0.08)' : 'rgba(0, 0, 0, 0.18)').rect(Q.cx + Math.cos(a) * (Q.rx + d), Q.cy + Math.sin(a) * (Q.ry + d), 1.5, 1.5);
        }
        // the moon pool: stone rim, dark water holding a crescent, lily pads
        B.color('#3a3240').disc(Q.cx, Q.cy, Q.pondR + 10);
        GLBuildingModel.radialDisc(B, Q.cx, Q.cy, Q.pondR, 0, 0, Q.cx - Q.pondR * .3, Q.cy - Q.pondR * .3, 4, Q.cx, Q.cy, Q.pondR, [[0, '#2c2560'], [1, '#100c26']]);
        B.color('rgba(232, 194, 122, 0.45)').circleLine(Q.cx, Q.cy, Q.pondR + 5, 1.5, 0, 0, 0);
        {   // the crescent: the outer disc less the offset one
            const ax = Q.cx + Q.pondR * .25, ay = Q.cy - Q.pondR * .2, ar = Q.pondR * .28, bx = Q.cx + Q.pondR * .33, by = Q.cy - Q.pondR * .26, br = Q.pondR * .24, pts = [], n = 48;
            for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, x = ax + Math.cos(t) * ar, y = ay + Math.sin(t) * ar; if (Math.hypot(x - bx, y - by) >= br) pts.push(P(x, y)); }
            for (let i = n; i >= 0; i--) { const t = i / n * Math.PI * 2, x = bx + Math.cos(t) * br, y = by + Math.sin(t) * br; if (Math.hypot(x - ax, y - ay) <= ar) pts.push(P(x, y)); }
            if (pts.length > 2) B.color('rgba(240, 232, 255, 0.55)').poly(pts, true);
        }
        for (let k = 0; k < 9; k++) {
            const a = rnd() * Math.PI * 2, d = Q.pondR * (.4 + rnd() * .45), x = Q.cx + Math.cos(a) * d, y = Q.cy + Math.sin(a) * d, r = 5 + rnd() * 4, pts = [P(x, y)];
            for (let i = 0; i <= 12; i++) { const t = a + .4 + (Math.PI * 2 - .8) * i / 12; pts.push(P(x + Math.cos(t) * r, y + Math.sin(t) * r)); }
            B.color('#2e6b5c').poly(pts);
            if (k % 3 === 0) B.color('#ffc6e0').disc(x, y, 2.2);
        }
        for (const bd of Q.beds) {                                                                // flower beds: dark soil, drifts of blooms
            B.color('#1e1418').ellipse(bd.x, bd.y, bd.r, bd.r * .62, bd.rot);
            for (let k = 0; k < bd.r * 2.4; k++) {
                const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * .9, lx = Math.cos(a) * bd.r * d, ly = Math.sin(a) * bd.r * .62 * d;
                const x = bd.x + lx * Math.cos(bd.rot) - ly * Math.sin(bd.rot), y = bd.y + lx * Math.sin(bd.rot) + ly * Math.cos(bd.rot);
                B.color(rnd() < .3 ? '#2a5234' : bd.cols[Math.floor(rnd() * bd.cols.length)]).disc(x, y, 1.3 + rnd() * 1.3, 0, 0, 8);
            }
        }
        for (const bn of Q.benches) {                                                             // benches facing the water
            const c = Math.cos(bn.a), s = Math.sin(bn.a);
            B.inFrame([c, s, -s, c, bn.x, bn.y], () => {
                B.color('rgba(0,0,0,0.3)').rect(-15, -4, 32, 11); B.color('#3a2a24').rect(-16, -5, 32, 9);
                B.color('#4e3a30'); for (let k = 0; k < 3; k++) B.rect(-15, -4 + k * 3, 30, 1.6);
                B.color('rgba(232, 194, 122, 0.6)').rect(-16, -5, 2, 9).rect(14, -5, 2, 9);
            });
        }
        if (Q.name) { B.color('rgba(232, 214, 190, 0.35)'); GLText.quad(B, GLText.entry(Q.name.toUpperCase(), 12, 'Montserrat', false, '600'), Q.gates[0][0], Q.gates[0][1] + 34, 0, 0); }
    }

    class Ground {
        constructor(renderer, parent, index) {
            this.r = renderer; this.root = new PIXI.Container(); parent.addChildAt(this.root, index);
            this.map = null; this.chunks = []; this.stats = { chunks: 0, shown: 0, vertices: 0, buildMs: 0 };
        }
        /** Sort the map's ground into chunks (cheap); each chunk's geometry is built when it first comes near the view */
        plan(map, net) {
            this.clear(); this.map = map; this.root.sortableChildren = true;
            const chunks = new Map(), add = (layer, x, y, w, h, fn) => {
                const i = Math.max(0, Math.floor((x + w / 2) / CHUNK)), j = Math.max(0, Math.floor((y + h / 2) / CHUNK)), key = layer + ':' + i + ':' + j;
                let c = chunks.get(key);
                if (!c) chunks.set(key, c = { key, layer: LAYERS.indexOf(layer), box: [Infinity, Infinity, -Infinity, -Infinity], paint: [], mesh: null });
                c.box[0] = Math.min(c.box[0], x); c.box[1] = Math.min(c.box[1], y); c.box[2] = Math.max(c.box[2], x + w); c.box[3] = Math.max(c.box[3], y + h);
                c.paint.push(fn);
            };
            // 1. The lots: a dark violet ground with a fine grain
            for (let y = 0; y < map.height; y += CHUNK) for (let x = 0; x < map.width; x += CHUNK) {
                const w = Math.min(CHUNK, map.width - x), h = Math.min(CHUNK, map.height - y);
                add('lot', x, y, w, h, B => { B.color(L().lot).rect(x, y, w, h); grain(B, rectPts(x, y, w, h), 'rgba(255, 240, 255, 0.022)', .004, x + y); grain(B, rectPts(x, y, w, h), 'rgba(0, 0, 0, 0.14)', .004, x * 3 + y); });
            }
            // 2. Floor zones: green ones are lawns, the rest tint the ground
            const green = col => game.groundBaker._isGreen(col);
            for (const z of map.floorZones || []) add('zone', z.x, z.y, z.w, z.h, (B, rnd) => { if (green(z.color)) lawn(B, z, rnd); else B.color(z.color, .45).rect(z.x, z.y, z.w, z.h); });
            // 3. Parks and plazas
            for (const b of map.cityLayout?.blocks || []) if (b.type === 'PARK' || b.type === 'PLAZA') add('park', b.x, b.y, b.w, b.h, B => park(B, b));
            // 4. Roads, then intersections over them
            for (const r of net.roads) add('road', r.x, r.y, r.w, r.h, (B, rnd) => road(B, r, rnd));
            for (const ix of net.intersections) add('junction', ix.x, ix.y, ix.width, ix.height, B => junction(B, ix));
            // 5. Pavements and crossings
            for (const p of map.pavements || []) add('pavement', p.x, p.y, p.w, p.h, B => pavement(B, p));
            for (const cw of map.crosswalks || []) add('crossing', cw.x, cw.y, cw.w, cw.h, (B, rnd) => crossing(B, cw, rnd));
            this.chunks = [...chunks.values()];
            this.stats = { chunks: this.chunks.length, built: 0, shown: 0, vertices: 0, buildMs: 0 };
        }
        buildChunk(c) {
            const start = performance.now(), B = new GLBuildingBuilder(0), rnd = seededRandom(c.key + ':949');
            const uses = GLText.uses();
            for (const paint of c.paint) paint(B, rnd);
            c.epoch = GLText.uses() !== uses ? GLText.epoch() : -1;          // a chunk with text in it remembers which atlas it used
            c.mesh = new GLBuildingMesh(B.finish(), 0); c.mesh.zIndex = c.layer; c.mesh.visible = false; this.root.addChild(c.mesh);
            this.stats.built++; this.stats.vertices += B.n; this.stats.buildMs += performance.now() - start;
        }
        /** Show the chunks in view (world bounds); build those in view now, and those just outside a few ms a frame */
        sync(game, bounds) {
            const map = game.activeMap, net = game.traffic?.network;
            if (!net) return;
            if (this.map !== map) this.plan(map, net);
            const pad = 600, start = performance.now(), hit = (b, p) => b[0] < bounds.right + p && b[2] > bounds.left - p && b[1] < bounds.bottom + p && b[3] > bounds.top - p;
            let shown = 0;
            GLText.frame();
            for (const c of this.chunks) {
                const v = hit(c.box, 0);
                if (c.mesh && c.epoch >= 0 && c.epoch !== GLText.epoch()) { const g = c.mesh.geometry; c.mesh.destroy(); g.destroy(); c.mesh = null; }   // its text was repacked
                if (!c.mesh && (v || (performance.now() - start < 3 && hit(c.box, pad)))) this.buildChunk(c);
                if (c.mesh) c.mesh.visible = v;
                shown += v;
            }
            this.stats.shown = shown; this.root.visible = true;
        }
        hide() { this.root.visible = false; }
        clear() { for (const c of this.chunks) if (c.mesh) { const g = c.mesh.geometry; c.mesh.destroy(); g.destroy(); } this.chunks = []; this.map = null; }
        destroy() { this.clear(); this.root.destroy(); }
    }
    return Ground;
})();
