import { artScene, rect, circle, radial, linear } from '../../engine/basement/rendering/index.mjs';
import { buildingHash, alpha, boxPath, dotPath, moveLine, quadPath, polyPath, fillIf, strokeIf, wallTools } from './city-building-art.mjs';

/**
 * The city's shopping arcades in limestone (the street variant most shops take): tall arched shopfronts
 * the width of the front, laid out from the door, a canopy with the shop's name over the door, a cornice,
 * wrought-iron balconies and French windows, the main cornice and a slate mansard with dormers; on the
 * roof the mansard's slopes, dormers, chimney stacks and a zinc flat; on the pavement a step at each arch
 * and cone topiaries. It leans `hero` times as hard as the street. The classic artist is
 * `legacy/buildings/street-arcade.js`; the look is `arcade` in `data/city-buildings.json` and the shop's
 * own picks (its stone's tone, its awning colours).
 */
const SCRIPT = '"Great Vibes", "URW Chancery L", "Z003", cursive';

/** The front's bays (frame x of each arch's middle), laid out from the door. */
function frontBays(h) {
    const A = h.look.arcade, F = h.frame, xs = [];
    for (let k = -12; k <= 12; k++) { const x = F.door + k * A.bay; if (x - A.bay / 2 >= 2 && x + A.bay / 2 <= F.fw - 2) xs.push(x); }
    return xs;
}
/** Bays on a face as u (0..1 along it): the front's arches, or evenly spaced on the other faces. */
function bays(h, f, G) {
    const A = h.look.arcade, F = h.frame;
    if (f.side === h.facing) {
        const g = h.front, ex = f.x2 - f.x1, ey = f.y2 - f.y1, L2 = ex * ex + ey * ey;
        return frontBays(h).map(x => { const s = (x - F.fw / 2) * F.side, px = g.cx + g.ux * s, py = g.cy + g.uy * s; return { u: ((px - f.x1) * ex + (py - f.y1) * ey) / L2, door: Math.abs(x - F.door) < 1 }; }).filter(b => b.u > 0 && b.u < 1);
    }
    const n = Math.max(1, Math.floor(G.length / A.bay));
    return Array.from({ length: n }, (_, i) => ({ u: (i + .5) / n, door: false }));
}
/** The storeys between the arcade and the mansard: [z0, z1] each. */
function storeys(h) {
    const A = h.look.arcade, z0 = A.a + 2, top = h.H - A.m, n = Math.max(1, Math.round((top - z0) / 10)), sh = (top - z0) / n;
    return Array.from({ length: n }, (_, i) => [z0 + i * sh, z0 + (i + 1) * sh]);
}
const ledge = (art, view, edges, z, out, th, top, band, lip) => { const L = view.ledge(edges, z, out, th); fillIf(art, L.band, band); fillIf(art, L.top, top); if (lip) strokeIf(art, L.lip, lip, .9); };
const veranda = (art, view, edges, z, out, step, rh, slabTop, slabBand, rail) => { const V = view.veranda(edges, z, out, step, rh); fillIf(art, V.band, slabBand); fillIf(art, V.top, slabTop); strokeIf(art, V.posts, rail, .7); strokeIf(art, V.rail, rail, 1.2); };
const skylights = (fw, fd) => { const w = 30, h = 14; return [[fw * .36 - w / 2, fd * .5 - h / 2, w, h], [fw * .64 - w / 2, fd * .5 - h / 2, w, h]]; };

export const streetArcade = {
    windows: false,
    groundReach: 20,

    /** Under everything on a face: the plinth, the arcade's rusticated joints, ashlar courses, the slate mansard. */
    faceUnder(h, ctx, art, f, G) {
        if (G.depth < 3) return;
        const A = h.look.arcade, T = h.variant.tone, H = h.H, top = H - A.m;
        art.fill(G.quad(0, 1, 0, .9 / H), T.lo); art.fill(G.quad(0, 1, top / H, 1), A.slate.slate);
        if (G.depth <= 8) return;
        const rj = [], aj = [], sj = [];
        for (let z = 2.3; z < A.a; z += 2.3) G.line(0, z / H, 1, z / H, rj);
        for (let z = A.a + 4; z < top - 1; z += 3.6) G.line(0, z / H, 1, z / H, aj);
        for (let z = top + 1.8; z < H - .5; z += 1.8) G.line(0, z / H, 1, z / H, sj);
        strokeIf(art, rj, alpha(T.dk, .45), .6); strokeIf(art, aj, alpha(T.dk, .18), .6); strokeIf(art, sj, 'rgba(14,18,24,.45)', .6);
    },

    /** Over the windows on all faces: the openings, then the cornices, the balcony and balconettes, the zinc cap. */
    faceOver(h, ctx, art) {
        const { view, k, faces } = ctx, A = h.look.arcade, T = h.variant.tone, H = h.H, top = H - A.m, st = storeys(h), last = st.length - 1;
        const edges = [], fronts = [], ettes = [];
        for (const f of faces) {
            const G = view.wall(f, k), L = G.length, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
            edges.push({ a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny });
            if (f.side === h.facing) {
                fronts.push({ a: [f.x1 + ux * 6, f.y1 + uy * 6], b: [f.x2 - ux * 6, f.y2 - uy * 6], nx: f.nx, ny: f.ny });
                for (const b of bays(h, f, G)) { const x = f.x1 + (f.x2 - f.x1) * b.u, y = f.y1 + (f.y2 - f.y1) * b.u; ettes.push({ a: [x - ux * 8, y - uy * 8], b: [x + ux * 8, y + uy * 8], nx: f.nx, ny: f.ny }); }
            }
            if (G.depth >= 3) face(h, art, f, G, false);
        }
        const lip = alpha(T.hi, .85);
        ledge(art, view, edges, A.a + 2, 1.8, 2, T.hi, T.lo, lip);
        st.forEach(([z0], i) => {
            if (i === 0 || (i === last && last > 1)) { if (fronts.length) veranda(art, view, fronts, z0 + .6, 4.5, 2.4, 3.2, T.stone, T.lo, A.iron); }
            else if (i % 2 && ettes.length) veranda(art, view, ettes, z0 + .6, 2.4, 2, 2.6, T.stone, T.lo, A.iron);
        });
        ledge(art, view, edges, top, 3, 2.4, T.hi, T.lo, lip);
        ledge(art, view, edges, H, 1.2, 1, A.slate.hi, A.slate.lo, null);
    },

    /** The street front: an awning over each arch, the canopy over the door with the name, a lantern on each pier. */
    front(h, ctx, art, emissive) {
        const { view } = ctx, A = h.look.arcade, v = h.variant, S = v.spec, g = h.front, F = h.frame, xs = frontBays(h);
        const sOf = x => (x - F.fw / 2) * F.side, sd = sOf(F.door), cw = A.bay * 3 - 4, [ca, cb] = v.awning, zc = A.a + .4, oc = 15;
        let size = 17; const tw = h.measure(v.name, { family: SCRIPT, size: 17 });
        if (tw > cw - 14) size = Math.max(10, Math.floor(17 * (cw - 14) / tw));
        const lamps = [], halo = [];
        for (const x of xs) for (const px of [x - A.bay / 2, x + A.bay / 2]) {
            if (Math.abs(px - F.door) < A.bay * 1.4 || px < 4 || px > F.fw - 4) continue;
            const p = h.frontPoint(view, sOf(px), 1.6, A.a * .62); dotPath(lamps, p[0], p[1], 1.3); dotPath(halo, p[0], p[1], 5);
        }
        if (emissive) { fillIf(art, halo, 'rgba(255,190,110,.22)'); fillIf(art, lamps, 'rgba(255,232,180,.95)'); }
        else {
            const aw = [], val = [], edge = [], zt = A.a - .6, zf = A.a - 6.5, zv = zf - 2, out = 13, half = A.aw / 2 + 1.5;
            for (const x of xs) {
                if (Math.abs(x - F.door) < A.bay * 1.2) continue;
                const s = sOf(x), s0 = s - half, s1 = s + half, t0 = h.frontPoint(view, s0, 0, zt), t1 = h.frontPoint(view, s1, 0, zt), f1 = h.frontPoint(view, s1, out, zf), f0 = h.frontPoint(view, s0, out, zf);
                quadPath(aw, t0, t1, f1, f0); quadPath(val, f0, f1, h.frontPoint(view, s1, out, zv), h.frontPoint(view, s0, out, zv)); moveLine(edge, f0, f1);
            }
            fillIf(art, aw, ca); fillIf(art, val, cb); strokeIf(art, edge, alpha(A.gold, .55), .7); fillIf(art, lamps, A.iron);
            ledge(art, view, [{ a: h.frontFoot(sd - cw / 2), b: h.frontFoot(sd + cw / 2), nx: g.nx, ny: g.ny }], zc, oc, 2.6, ca, cb, A.gold);
        }
        h.board(ctx, art, zc, 0, (a, os) => a.text(v.name, 0, os * oc / 2 + 1, { font: { family: SCRIPT, size }, align: 'center', baseline: 'middle' }, { fill: emissive ? S.glow : S.ink }));
    },

    /** The roof (frame units), shared by every arcade of its tone, size and door place. */
    roof(h) {
        const F = h.frame, T = h.variant.tone;
        return { key: `arcade|${T.id}|${Math.round(F.door)}|${F.fw}x${F.fd}`, build: () => { const art = new artScene(); paintRoof(h, art, F.fw, F.fd); return art.finish(); } };
    },

    /** The roof's night light: some dormers lit, the roof lights. */
    roofGlow(h, art) {
        const { fw, fd } = h.frame, p = [], r0 = 3;
        frontBays(h).forEach((x, i) => { if (buildingHash(h.variant.seed, 600 + i) < .45) boxPath(p, x - 3, fd - r0 - 1.4, 6, 1.4); if (buildingHash(h.variant.seed, 640 + i) < .3) boxPath(p, x - 3, r0, 6, 1.4); });
        for (const [x, y, w, hh] of skylights(fw, fd)) boxPath(p, x + 1, y + 1, w - 2, hh - 2);
        fillIf(art, p, 'rgba(255,214,150,.75)');
    },

    /** The pavement in front: a stone step at each arch, cone topiaries in iron planters at the piers. */
    base(h, c, fw, fd, door) {
        const A = h.look.arcade, T = h.variant.tone, B = A.bay, xs = frontBays(h), y = fd;
        c.fill(rect(0, y, fw, 2), 'rgba(0,0,0,.2)');
        const steps = []; for (const x of xs) boxPath(steps, x - A.aw / 2 - 1, y, A.aw + 2, Math.abs(x - door) < 1 ? 5 : 2.6);
        for (let i = 0; i < steps.length; i += 5) c.fill(steps.slice(i, i + 5), alpha(T.hi, .7));
        const piers = [];
        for (const x of xs) for (const px of [x - B / 2, x + B / 2]) if (px > 6 && px < fw - 6 && Math.abs(px - door) > B * 1.4 && !piers.some(q => Math.abs(q - px) < 1)) piers.push(px);
        piers.push(door - B * 1.5, door + B * 1.5);
        for (const x of piers) {
            if (x < 6 || x > fw - 6) continue;
            const yy = y + 7;
            c.fill(rect(x - 4, yy - 3, 10, 10), 'rgba(0,0,0,.35)'); c.fill(rect(x - 5, yy - 5, 10, 10), '#1c1d21'); c.stroke(rect(x - 4.5, yy - 4.5, 9, 9), '#4a4b52', .9);
            c.fill([circle(x, yy, 4.4)], radial([x - 1.2, yy - 1.4], .4, [x, yy], 4.6, [[0, '#6f9a62'], [.45, '#2f5a38'], [1, '#173222']]));
            c.stroke([circle(x, yy, 2.6)], 'rgba(10,26,16,.5)', .5); c.fill([circle(x - .4, yy - .5, .8)], '#a9c98e');
        }
    },

    /** The night: arches, windows and dormers lit, lanterns, the name, the cornices in the lamps' colour. */
    glow(h, ctx, art) {
        const { view, k, faces } = ctx, A = h.look.arcade, H = h.H, edges = [];
        art.enter({}, { blend: 'add' });
        for (const f of faces) { const G = view.wall(f, k); if (G.depth >= 3) face(h, art, f, G, true); edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny }); }
        const rim = h.rim(ctx.dark);
        if (rim.a > .01 && edges.length) for (const [z, out] of [[A.a + 2, 1.8], [H - A.m, 3]]) strokeIf(art, view.ledge(edges, z, out, .01).lip, `rgba(${rim.rgb}, ${.55 * rim.a})`, .9);
        streetArcade.front(h, ctx, art, true);
        art.leave();
    }
};

/** A face's openings: on the front the arches; on every face the French windows and the dormers. emissive: just what's lit. */
function face(h, art, f, G, emissive) {
    const A = h.look.arcade, T = h.variant.tone, H = h.H, { L, rect: R, poly } = wallTools(G, H), front = f.side === h.facing, seed = h.variant.seed;
    const bs = bays(h, f, G), st = storeys(h), top = H - A.m, fine = G.depth > 6, Rr = 4.2, zs = A.a - 1.6 - Rr, z0 = 2.2;
    const arch = (p, u, a, r, zb) => { const pts = [[u - a, zb], [u - a, zs]]; for (let i = 1; i < 8; i++) { const t = Math.PI - i * Math.PI / 8; pts.push([u + a * Math.cos(t), zs + r * Math.sin(t)]); } pts.push([u + a, zs], [u + a, zb]); return poly(p, pts); };
    const lit = (i, p) => buildingHash(seed, 520 + i * 7 + f.side.charCodeAt(0) * 3) < p;
    const hw = 6.5 / L, glass = [], warm = [], dorm = [];
    if (emissive) {
        if (front) for (const b of bs) arch(b.door ? warm : glass, b.u, A.aw / 2 / L, Rr, b.door ? .6 : z0);
        bs.forEach((b, i) => st.forEach(([s0, s1], j) => { if (lit(i * 5 + j, .6)) R(glass, b.u - hw, b.u + hw, s0 + 1.4, s1 - 1.6); }));
        bs.forEach((b, i) => { if (lit(i + 40, .35)) R(dorm, b.u - 3.2 / L, b.u + 3.2 / L, top + 1.8, H - 2.2); });
        fillIf(art, glass, 'rgba(255,186,104,.62)'); fillIf(art, warm, 'rgba(255,214,150,.9)'); fillIf(art, dorm, 'rgba(255,200,130,.55)');
        return;
    }
    const stone = [], dark = [], bars = [], keys = [], riser = [], leaves = [];
    if (front) for (const b of bs) {
        const a = A.aw / 2 / L, u = b.u;
        arch(stone, u, a + 1.7 / L, Rr + 1.6, .4);
        if (b.door) { arch(glass, u, a, Rr, .6); R(leaves, u - a + .8 / L, u + a - .8 / L, .6, zs - .5); }
        else { arch(glass, u, a, Rr, z0); R(riser, u - a, u + a, .6, z0); if (fine) for (const m of [-1 / 3, 1 / 3]) R(bars, u + a * m - .35 / L, u + a * m + .35 / L, z0, zs); }
        R(bars, u - a, u + a, zs - .3, zs + .4);
        if (fine) R(bars, u - .35 / L, u + .35 / L, b.door ? zs : z0, zs + Rr);
        poly(keys, [[u - 1.4 / L, A.a + .2], [u + 1.4 / L, A.a + .2], [u + .8 / L, zs + Rr - .6], [u - .8 / L, zs + Rr - .6]]);
    }
    for (const b of bs) {
        for (const [s0, s1] of st) {
            const w0 = s0 + 1.4, w1 = s1 - 1.6;
            R(stone, b.u - hw - 1.1 / L, b.u + hw + 1.1 / L, w0 - .8, w1 + .6); R(stone, b.u - hw - 2 / L, b.u + hw + 2 / L, w1 + .9, w1 + 1.7); R(dark, b.u - hw, b.u + hw, w0, w1);
            if (fine) { R(bars, b.u - .3 / L, b.u + .3 / L, w0, w1); R(bars, b.u - hw, b.u + hw, w1 - 2.2, w1 - 1.7); }
        }
        const d0 = top + 1.8, d1 = H - 2.2, dw = 3.2 / L;
        R(stone, b.u - dw - 1.1 / L, b.u + dw + 1.1 / L, d0 - .6, d1 + .4); poly(stone, [[b.u - dw - 1.9 / L, d1 + .4], [b.u + dw + 1.9 / L, d1 + .4], [b.u, H - .2]]); R(dorm, b.u - dw, b.u + dw, d0, d1);
    }
    fillIf(art, stone, T.hi); fillIf(art, riser, T.lo); fillIf(art, glass, A.glass); fillIf(art, glass, 'rgba(255,196,120,.2)');
    fillIf(art, dark, A.pane); fillIf(art, dorm, A.pane); fillIf(art, dark, 'rgba(176,190,214,.16)'); fillIf(art, leaves, A.bronze); fillIf(art, bars, A.iron); fillIf(art, keys, T.stone);
    if (fine) strokeIf(art, keys, alpha(T.dk, .6), .5);
}

/** The roof: a cornice rim, the mansard's four slate slopes with their hips, dormers front and back, chimney stacks, a zinc flat. */
function paintRoof(h, c, fw, fd) {
    const A = h.look.arcade, T = h.variant.tone, Sl = A.slate, r0 = 3, m = 30, i0 = r0 + m, xs = frontBays(h);
    c.fill(rect(0, 0, fw, fd), T.stone); c.stroke(rect(.5, .5, fw - 1, fd - 1), T.hi, 1);
    const o = [[r0, r0], [fw - r0, r0], [fw - r0, fd - r0], [r0, fd - r0]], n = [[i0, i0], [fw - i0, i0], [fw - i0, fd - i0], [i0, fd - i0]];
    const slopes = [[[o[0], o[1], n[1], n[0]], '#232933', [0, 1]], [[o[1], o[2], n[2], n[1]], '#2f3742', [-1, 0]], [[o[2], o[3], n[3], n[2]], '#3d4652', [0, -1]], [[o[3], o[0], n[0], n[3]], '#29303a', [1, 0]]];
    for (const [pts, col, nn] of slopes) {
        const shape = polyPath([], pts); c.fill(shape, col); c.enter(); c.clip(shape);
        const e0 = pts[0], ux = nn[1] ? 1 : 0, uy = nn[0] ? 1 : 0, courses = [], joints = [];
        for (let d = 2.4; d < m; d += 2.4) moveLine(courses, [e0[0] + nn[0] * d - ux * 999, e0[1] + nn[1] * d - uy * 999], [e0[0] + nn[0] * d + ux * 999, e0[1] + nn[1] * d + uy * 999]);
        strokeIf(c, courses, 'rgba(12,16,22,.5)', .6);
        for (let d = 0, kk = 0; d < m; d += 2.4, kk++) for (let t = (kk % 2) * 1.8 - 999; t < 999; t += 3.6) { const x = e0[0] + nn[0] * d + ux * t, y = e0[1] + nn[1] * d + uy * t; if (x < -3 || x > fw + 3 || y < -3 || y > fd + 3) continue; moveLine(joints, [x, y], [x + nn[0] * 2.4, y + nn[1] * 2.4]); }
        strokeIf(c, joints, 'rgba(12,16,22,.28)', .6);
        c.leave();
    }
    const hips = []; for (let i = 0; i < 4; i++) moveLine(hips, o[i], n[i]); c.stroke(hips, Sl.hi, 1.2);
    c.fill(rect(i0, i0, fw - 2 * i0, fd - 2 * i0), linear([i0, i0], [fw - i0, fd - i0], [[0, Sl.zinc], [1, Sl.zinc_lo]]));
    const s1 = [], s2 = []; for (let x = i0 + 6; x < fw - i0; x += 6) moveLine(s1, [x, i0], [x, fd - i0]); for (let x = i0 + 7; x < fw - i0; x += 6) moveLine(s2, [x, i0], [x, fd - i0]);
    strokeIf(c, s1, 'rgba(255,255,255,.1)', .7); strokeIf(c, s2, 'rgba(0,0,0,.22)', .7); c.stroke(rect(i0, i0, fw - 2 * i0, fd - 2 * i0), Sl.hi, 1.4);
    for (const x of xs) for (const [ye, dir] of [[fd - r0, -1], [r0, 1]]) {
        const yi = ye + dir * 14, y0 = Math.min(ye, yi), hh = Math.abs(yi - ye);
        c.fill(rect(x - 5 + 1.5, y0 + 1.5, 10, hh), 'rgba(0,0,0,.3)'); c.fill(rect(x - 5, y0, 5, hh), '#414b57'); c.fill(rect(x, y0, 5, hh), '#5a6572');
        c.stroke(rect(x - 5, y0, 10, hh), T.hi, .9); c.stroke(moveLine([], [x, y0], [x, y0 + hh]), T.hi, .7);
        c.fill(polyPath([], [[x - 5.6, ye], [x + 5.6, ye], [x, ye + dir * 3.2]]), T.hi);
        c.fill(rect(x - 3, ye + (dir > 0 ? 0 : -1.4), 6, 1.4), A.pane);
    }
    for (const x of [0, fw - 12]) for (const y of [fd * .3, fd * .62]) {
        c.fill(rect(x + 2.5, y + 3, 12, 22), 'rgba(0,0,0,.35)'); c.fill(rect(x, y, 12, 22), T.dk); c.stroke(rect(x + .5, y + .5, 11, 21), T.lo, 1);
        for (let i = 0; i < 3; i++) { c.fill([circle(x + 6, y + 4.5 + i * 6.5, 2.5)], '#9a5a3a'); c.fill([circle(x + 6, y + 4.5 + i * 6.5, 1.3)], '#1a0f0b'); }
    }
    for (const [x, y, w, hh] of skylights(fw, fd)) {
        c.fill(rect(x + 2, y + 2, w, hh), 'rgba(0,0,0,.3)'); c.fill(rect(x, y, w, hh), '#2b2f36'); c.fill(rect(x, y, w, hh / 2), 'rgba(170,196,226,.2)');
        c.stroke(rect(x, y, w, hh), Sl.hi, 1.2); const p = []; for (let kk = 1; kk < 3; kk++) moveLine(p, [x + w * kk / 3, y], [x + w * kk / 3, y + hh]); c.stroke(p, Sl.hi, .7);
    }
}
