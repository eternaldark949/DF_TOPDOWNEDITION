import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, polygon, circle, ellipse, linear, radial, glow } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';
import { bayPlan } from './city-tiered.mjs';

/**
 * The Double Nights Hotel, the city's grand hotel, as a tiered building (`city-tiered.mjs`): warm limestone,
 * black iron and champagne gold. Out of the middle of its front the rotunda, iron balconies with planters up
 * every floor, the tall glazed entrance at its foot (the chandelier and the lobby's fountain behind the glass),
 * the DOUBLE NIGHTS HOTEL sign and the gold double crescent over the door; on it the lantern under a slate dome.
 * Behind it the core, the penthouse terrace and pool on its attic; either side the lower wings under slate
 * mansards; out of the wings the two curved canopies, ONE NIGHT and ANOTHER NIGHT, clipped topiaries at each.
 * Out front the forecourt: a marble terrace, the basalt drop-off lane, granite paving with the emblem inlaid in
 * brass, lamp posts with crescent banners, the SAME SKY / DIFFERENT STORIES plinth, lawns; at night light pools
 * on the wet stone with long gold reflections, and two searchlights sweep from the rotunda.
 * The look is the `double_nights` section of `data/city-landmarks.json`; the classic is `legacy/buildings/double-nights.js`.
 */
const LOOK = LANDMARKS.double_nights, P = LOOK.plan, Z = LOOK.z, C = LOOK.colors, G = P.ground, ST = P.storey, TAU = Math.PI * 2;
const pathOf = pts => polygon(pts);
const disc = (x, y, r) => [['move', x + r, y], circle(x, y, r), ['close']];
/** Many specks as a few paths: one path of thousands of crossing shapes fills far slower. */
function specks(art, list, colour) { for (let i = 0; i < list.length; i += 1500) art.fill(list.slice(i, i + 1500), colour); }
const centre = poly => { let x = 0, y = 0; for (const p of poly) { x += p[0] / poly.length; y += p[1] / poly.length; } return [x, y]; };
const ring = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos(-i * TAU / n) * r, cy + Math.sin(-i * TAU / n) * r]);

/* ---------------- the emblem and the lettering ---------------- */

/** A crescent at (x, y), radius r, its horns turned by `rot` (the classic Moon City's). */
function crescent(x, y, r, rot = -.5) {
    const a0 = rot + .35, ix = x + Math.cos(rot) * r * .42, iy = y + Math.sin(rot) * r * .42;
    return [['move', x + Math.cos(a0) * r, y + Math.sin(a0) * r], ellipse(x, y, r, r, 0, a0, rot + TAU - .35), ellipse(ix, iy, r * .78, r * .78, 0, rot + TAU - .62, rot + .62, 1), ['close']];
}
function star(x, y, r) { return polygon(Array.from({ length: 8 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * .22 : r; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; })); }
/** The double crescent: two crescents opening on each other, a four-point star between. */
function emblem(c, cx, cy, R, colour) {
    c.fill(crescent(cx - R * .42, cy, R * .62, 0), colour); c.fill(crescent(cx + R * .42, cy, R * .62, Math.PI), colour); c.fill(star(cx, cy, R * .34), colour);
}
/** Spaced serif capitals centred at x. */
function words(c, text, x, y, px, colour, { weight = 600, spacing = .18, shadow } = {}) {
    c.text(text, x, y, { font: { family: LOOK.serif, size: px, weight, letter_spacing: px * spacing }, align: 'center', baseline: 'middle' }, { fill: colour, ...(shadow ? { shadow: { color: shadow[0], blur: shadow[1], offset: [0, 0] } } : {}) });
}

/* ---------------- wall strips (x along the plan from its first corner, y down from the tier's top) ---------------- */

/** A tier's walls in runs: neighbouring edges that turn less than ~30° (a curve's facets) run on as one wall. */
function runsOf(t) {
    const es = [];
    t.mitre.forEach((m, i) => { if (m) es.push({ ...m, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] }); });
    es.sort((p, q) => p.u0 - q.u0);
    const runs = [];
    for (const e of es) {
        const last = runs[runs.length - 1], prev = last && last.edges[last.edges.length - 1];
        if (prev && Math.abs(prev.u0 + prev.L - e.u0) < .01 && prev.nx * e.nx + prev.ny * e.ny > .85 && !prev.hidden === !e.hidden) { last.edges.push(e); last.len += e.L; }
        else runs.push({ u0: e.u0, len: e.L, edges: [e], hidden: e.hidden });
    }
    for (const r of runs) { let nx = 0, ny = 0; for (const e of r.edges) { nx += e.nx * e.L; ny += e.ny * e.L; } const m = Math.hypot(nx, ny) || 1; r.nx = nx / m; r.ny = ny / m; }
    return runs;
}
/** Where along a run u falls (a world point). */
function pointAt(run, u) {
    for (const e of run.edges) if (u <= e.u0 + e.L + 1e-6) { const s = Math.max(0, (u - e.u0) / e.L); return [e.a[0] + (e.b[0] - e.a[0]) * s, e.a[1] + (e.b[1] - e.a[1]) * s]; }
    return run.edges[run.edges.length - 1].b;
}
/** Where along the strip the wall facing (roughly) south passes world x, or null. */
function uAt(t, wx, minNy = .8) {
    for (const r of runsOf(t)) for (const e of r.edges) {
        if (e.hidden || e.ny < minNy) continue;
        const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
        if (wx < x0 - .01 || wx > x1 + .01 || x1 - x0 < .5) continue;
        return e.u0 + Math.abs(wx - e.a[0]) / (x1 - x0) * e.L;
    }
    return null;
}

/** Limestone: a warm wash, fine coursing, rusticated below the ground floor's cornice. */
function limestone(d, t, H, L, r) {
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.stone_hi], [.55, C.stone], [1, C.stone_lo]]) });
    const marks = new Map();
    for (let i = 0; i < L / 6; i++) {
        const warm = r() < .5, a = .03 + r() * .04, key = `rgba(${warm ? '255, 245, 225' : '70, 55, 40'}, ${(Math.round(a * 200) / 200).toFixed(3)})`;
        if (!marks.has(key)) marks.set(key, []); marks.get(key).push(...rect(r() * L, r() * H, 3 + r() * 10, 1 + r() * 2.5));
    }
    for (const [colour, list] of marks) specks(d, list, colour);
    const courses = []; for (let y = H - 4.5; y > 0; y -= 4.5) courses.push(...rect(0, y, L, .35)); d.fill(courses, 'rgba(80, 64, 48, 0.16)');
    if (t.z0 === 0) {
        const top = H - G, rust = [];
        for (let y = H - 3.6, k = 0; y > top; y -= 3.6, k++) { rust.push(...rect(0, y, L, .6)); for (let x = (k % 2) * 6; x < L; x += 12) rust.push(...rect(x, y - 3.6, .5, 3.6)); }
        specks(d, rust, 'rgba(60, 46, 34, 0.35)');
    }
}
/** A window from y (its top) h tall: the reveal, glass, curtains, mullion; lit warm at night (most of them). */
function window_(d, l, x, y, w, h, r, arch, litP = .62) {
    const rr = w / 2, sp = y + (arch ? rr : 0);
    const shape = (i = 0) => arch ? [['move', x + i, y + h - i], ['line', x + i, sp], ellipse(x + rr, sp, rr - i, rr - i, 0, Math.PI, 0), ['line', x + w - i, y + h - i], ['close']] : rect(x + i, y + i, w - i * 2, h - i * 2);
    const curtains = [...rect(x + .4, sp, w * .2, y + h - sp - .4), ...rect(x + w * .8 - .4, sp, w * .2, y + h - sp - .4)], bars = [...rect(x + rr - .25, y + (arch ? 0 : .5), .5, h - .5), ...rect(x, y + h * (arch ? .42 : .3), w, .45)];
    d.fill(shape(-.8), 'rgba(52, 40, 30, 0.6)'); d.fill(shape(), '#242733');
    d.fill(rect(x, sp, w * .5, (y + h - sp) * .45), 'rgba(205, 214, 232, 0.14)');
    d.fill(curtains, 'rgba(232, 214, 184, 0.5)'); d.fill(bars, C.iron);
    d.fill(rect(x - 1, y + h, w + 2, .9), C.stone_hi);
    if (!arch) d.fill(rect(x + rr - 1.2, y - 1.6, 2.4, 1.6), C.cream);
    const v = r();
    if (v < litP) {
        l.paint(shape(), { fill: linear([0, y], [0, y + h], [[0, 'rgba(255, 222, 160, 0.95)'], [1, 'rgba(255, 168, 90, 0.92)']]) });
        l.fill(curtains, 'rgba(255, 240, 210, 1)');
        l.enter({}, { blend: 'destination-out' }).fill([...rect(x + rr - .25, y, .5, h), ...rect(x, y + h * (arch ? .42 : .3), w, .45)], '#000').leave();
    } else if (v < litP + .14) l.fill(shape(), 'rgba(255, 190, 120, 0.28)');
}
/** An iron balcony rail whose foot is at y: the top bar, balusters, a scroll in each panel; planters spilling over it, ivy hanging under. */
function rail(d, l, x0, x1, y, r, plants) {
    const top = y - 3.6, iron = [...rect(x0, top, x1 - x0, .6), ...rect(x0, y - .6, x1 - x0, .6)], scrolls = [];
    d.fill(rect(x0, y, x1 - x0, 1.1), 'rgba(30, 22, 18, 0.35)');
    for (let x = x0; x <= x1 + .01; x += .9) iron.push(...rect(x, top, .22, 3.6));
    d.fill(iron, C.iron);
    for (let x = x0 + 2; x < x1 - 1; x += 4) scrolls.push(['move', x + .9, y - 1.8], ellipse(x, y - 1.8, .9, .9, 0, 0, Math.PI * 1.6));
    if (scrolls.length) d.stroke(scrolls, C.iron, .3);
    l.fill(rect(x0, top, x1 - x0, .5), 'rgba(255, 214, 150, 0.35)');
    if (!plants) return;
    const leaf = [], leafHi = [], white = [], pink = [];
    for (let x = x0 + .8; x < x1 - .6; x += 1.3 + r() * 1.2) {
        const into = r() < .5 ? leaf : leafHi, yy = top - .4 + r() * .8; into.push(...disc(x, yy, .9 + r() * .8));
        if (r() < .25) (r() < .5 ? white : pink).push(...disc(x + .3, top - .8, .45));
    }
    if (r() < .45) { const x = x0 + r() * (x1 - x0), n = 3 + r() * 6; for (let k = 0; k < n; k++) leaf.push(...disc(x + Math.sin(k) * .6, y + .6 + k * .9, .6)); }
    for (const [list, colour] of [[leaf, C.leaf], [leafHi, C.leaf_hi], [white, '#f2e6ef'], [pink, '#e98ab0']]) if (list.length) d.fill(list, colour);
}
/** Warm uplights washing up the wall from the pavement. */
function uplight(l, x, H, h) {
    l.paint(polygon([[x - 1.5, H], [x - 9, H - h], [x + 9, H - h], [x + 1.5, H]]), { fill: linear([0, H], [0, H - h], [[0, 'rgba(255, 196, 120, 0.55)'], [1, 'rgba(255, 196, 120, 0)']]) });
}
/** A pair of glass doors up to the foot, a fanlight over them, gold frames, the lobby's light. */
function doorway(d, l, cx, H, w, h) {
    const y0 = H - h, rr = w / 2, arch = q => [['move', cx - q, H], ['line', cx - q, y0 + rr], ellipse(cx, y0 + rr, q, q, 0, Math.PI, 0), ['line', cx + q, H], ['close']];
    d.fill(arch(rr + 1.2), C.stone_dk); d.fill(arch(rr), '#2a1f1a');
    l.paint(arch(rr), { fill: linear([0, y0], [0, H], [[0, 'rgba(255, 214, 150, 0.85)'], [1, 'rgba(255, 186, 110, 1)']]) });
    const spokes = []; for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; moveLine(spokes, [cx, y0 + rr], [cx + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr]); }
    d.stroke([...spokes, ...rect(cx - rr + .8, y0 + rr + 1.2, w / 2 - 1.6, h - rr - 2), ...rect(cx + .8, y0 + rr + 1.2, w / 2 - 1.6, h - rr - 2)], C.gold, .45);
    d.fill([...rect(cx - rr, y0 + rr, w, .6), ...rect(cx - .3, y0 + rr, .6, h - rr), ...rect(cx - rr, H - .8, w, .8)], C.gold);
    l.enter({}, { blend: 'destination-out' }).fill([...rect(cx - .3, y0 + rr, .6, h - rr), ...rect(cx - rr, y0 + rr, w, .6)], 'rgba(0, 0, 0, 0.7)').leave();
    l.fill([-1, 1].flatMap(s => disc(cx + s * (rr + 2.4), y0 + rr + 3, .8)), 'rgba(255, 245, 220, 1)');
    d.fill([-1, 1].flatMap(s => rect(cx + s * (rr + 2.4) - .7, y0 + rr + 2, 1.4, 2.4)), C.gold_dk);
}

/**
 * A tier's limestone walls: a bay of windows every o.bay along each run, a storey every ST up from the ground floor's
 * cornice; balconies where o.balc says (1 rail, 2 rail and planters, 3 planters on some); in the base arched windows,
 * doors at o.doors (plan x, on the front); o.skip(lx, z, u) leaves a window out; o.after paints over the lot.
 */
function facade(d, l, t, H, L, b, o) {
    const r = classicRandom(o.seed), z1 = t.z1;
    limestone(d, t, H, L, r);
    for (const run of runsOf(t)) {
        if (run.hidden) continue;
        const n = Math.max(1, Math.round(run.len / o.bay)), bw = run.len / n, w = Math.min(bw * .46, o.win || 10.5);
        for (let i = 0; i < n; i++) {
            const uc = run.u0 + (i + .5) * bw, lx = pointAt(run, uc)[0] - b.x, front = run.ny > .75;
            if (t.z0 === 0) {
                const door = front && o.doors && o.doors.some(dx => Math.abs(dx - lx) < bw * .55);
                if (door) doorway(d, l, uc, H, Math.min(bw * .62, 16), G - 2.5);
                else if (!o.skip || !o.skip(lx, G / 2, uc)) window_(d, l, uc - w * .55, H - G + 3, w * 1.1, G - 5.5, r, true, .7);
                if (front && i % 3 === 1) uplight(l, run.u0 + i * bw, H, Math.min(H * .7, 70));
            }
            for (let f = t.z0 === 0 ? G : t.z0 + 2, k = 0; f + ST <= z1 - 3; f += ST, k++) {
                if (o.skip && o.skip(lx, f + ST / 2, uc)) continue;
                const top = z1 - (f + ST - 2.2), bot = z1 - (f + 1.8);
                window_(d, l, uc - w / 2, top, w, bot - top, r, k === 0 && t.z0 === 0);
                const bal = o.balc ? o.balc(f, k, i) : 0;
                if (bal) rail(d, l, uc - w / 2 - 2.2, uc + w / 2 + 2.2, z1 - f, r, bal === 2 || (bal === 3 && r() < .55));
            }
            if (i > 0) d.fill(rect(run.u0 + i * bw - .8, 0, 1.6, H - (t.z0 === 0 ? G : 0)), 'rgba(255, 246, 228, 0.12)');
        }
    }
    o.after?.(d, l, t, H, L, r);
}

/** The rotunda: balconies with planters on every floor; at its front the glazed entrance, the sign and the emblem over it. */
function rotunda(d, l, t, H, L, b) {
    const uc = uAt(t, b.x + 400, .9), FRONT = 32;
    facade(d, l, t, H, L, b, {
        seed: 7313, bay: 22, win: 9.5,
        skip: (lx, z, u) => uc !== null && Math.abs(u - uc) < FRONT && z < 66,
        balc: f => f >= 77 ? 3 : f === 33 || f === 44 || f === 55 || f === 66 ? 1 : 0,
        after: (d, l, t, H, L, r) => { if (uc !== null) entrance(d, l, uc, H, r); }
    });
}
/** The tall glazed entrance (two storeys), the chandelier and the fountain inside; the sign over it; the emblem over that. */
function entrance(d, l, uc, H, r) {
    const ew = 34, eh = 36, x0 = uc - ew / 2, y0 = H - eh;
    d.fill(rect(x0 - 3, y0 - 3, ew + 6, eh + 3), C.iron); d.fill(rect(x0, y0, ew, eh), '#2b2018');
    l.paint(rect(x0, y0, ew, eh), { fill: linear([0, y0], [0, H], [[0, 'rgba(255, 210, 140, 0.8)'], [.6, 'rgba(255, 196, 120, 0.95)'], [1, 'rgba(255, 176, 96, 1)']]) });
    d.fill(rect(x0, y0, ew, eh), 'rgba(255, 220, 170, 0.18)');
    // the curtains drawn back in swags
    const swags = [['move', x0, y0], ['quadratic', x0 + 6, y0 + 12, x0 + 2, H], ['line', x0, H], ['close'], ['move', x0 + ew, y0], ['quadratic', x0 + ew - 6, y0 + 12, x0 + ew - 2, H], ['line', x0 + ew, H], ['close']];
    d.fill(swags, 'rgba(236, 220, 192, 0.55)'); l.fill(swags, 'rgba(255, 238, 205, 1)');
    // the chandelier: tiers of lights round a gold drop
    d.fill(rect(uc - .3, y0, .6, 7), C.gold_dk);
    const arms = [], bulbs = [];
    for (let k = 0; k < 3; k++) { const yy = y0 + 7 + k * 2.6, w = 7 - k * 1.8; arms.push(...rect(uc - w, yy, w * 2, .5)); for (let x = -w; x <= w + .01; x += 1.4) bulbs.push(...disc(uc + x, yy - .3, .45)); }
    d.fill(arms, C.gold); l.fill(bulbs, 'rgba(255, 252, 235, 1)');
    l.fill(disc(uc, y0 + 10, 7), 'rgba(255, 240, 200, 0.6)');
    // the lobby's fountain
    d.fill([...rect(uc - 7, H - 4, 14, 2.4), ...rect(uc - 1, H - 10, 2, 6), ...rect(uc - 4, H - 10.6, 8, 1.2), ...rect(uc - .6, H - 14, 1.2, 3.4)], 'rgba(70, 52, 40, 0.75)');
    l.fill([...rect(uc - 6, H - 4.4, 12, .6), ...rect(uc - 3.6, H - 11, 7.2, .5)], 'rgba(210, 230, 255, 0.7)');
    // figures inside: a couple on the mezzanine, a guest crossing
    const figures = [];
    for (const [fx, fy, s] of [[uc - 3, y0 + 21, .9], [uc + 2.4, y0 + 21, 1], [uc + 10, H - 1, 1.2]]) figures.push(...disc(fx, fy - 7 * s, .9 * s), ...rect(fx - 1.1 * s, fy - 6 * s, 2.2 * s, 6 * s));
    d.fill(figures, 'rgba(30, 20, 14, 0.75)');
    l.enter({}, { blend: 'destination-out' }).fill(figures, 'rgba(0, 0, 0, 0.7)').leave();
    // the mezzanine rail and the frame's mullions
    d.fill([...rect(x0, y0 + 21, ew, .6), ...rect(x0, H - 13, ew, .5), ...[x0 + ew / 4, uc, x0 + ew * 3 / 4].flatMap(x => rect(x - .3, H - 13, .6, 13)),
        ...rect(x0 - 3, y0 - 3, ew + 6, .8), ...rect(x0 - 3, y0 - 3, .8, eh + 3), ...rect(x0 + ew + 2.2, y0 - 3, .8, eh + 3)], C.gold);
    l.enter({}, { blend: 'destination-out' }).fill([...rect(x0, y0 + 21, ew, .6), ...rect(x0, H - 13, ew, .5)], 'rgba(0, 0, 0, 0.6)').leave();
    // the sign: a black band, DOUBLE NIGHTS in gold capitals, HOTEL under it
    const sy = H - 50, sw = 70;
    d.fill(rect(uc - sw / 2, sy, sw, 12), C.lacquer); d.fill([...rect(uc - sw / 2, sy, sw, .5), ...rect(uc - sw / 2, sy + 11.5, sw, .5)], C.gold_dk);
    words(d, 'DOUBLE NIGHTS', uc, sy + 4.6, 6.2, C.gold, { spacing: .08 }); words(d, 'HOTEL', uc, sy + 9.4, 3, C.gold, { spacing: .6 });
    const halo = ['rgba(255, 196, 110, 1)', 4];
    words(l, 'DOUBLE NIGHTS', uc, sy + 4.6, 6.2, 'rgba(255, 238, 200, 1)', { spacing: .08, shadow: halo }); words(l, 'HOTEL', uc, sy + 9.4, 3, 'rgba(255, 238, 200, 1)', { spacing: .6, shadow: halo });
    // the emblem over it, in a ring, ivy round the band
    const ey = H - 59, R = 7.5;
    d.paint(disc(uc, ey, R + 1.6), { fill: C.lacquer, stroke: C.gold_dk, stroke_width: .5 });
    emblem(d, uc, ey, R, C.gold); emblem(l, uc, ey, R, 'rgba(255, 236, 190, 1)');
    l.fill(disc(uc, ey, R + 5), 'rgba(255, 210, 140, 0.35)');
    const ivy = [], ivyHi = [];
    for (let k = 0; k < 70; k++) { const side = r() < .5 ? -1 : 1, x = uc + side * (sw / 2 + r() * 8), y = sy - 2 + r() * 18; (r() < .5 ? ivy : ivyHi).push(...disc(x, y, .6 + r() * .8)); }
    d.fill(ivy, C.leaf); d.fill(ivyHi, C.leaf_hi);
}
/** The lantern on the rotunda: tall arched windows lit gold between pilasters, a gold band. */
function lantern(d, l, t, H, L) {
    const r = classicRandom(7411);
    d.fill(rect(0, 0, L, H), C.stone); d.fill(rect(0, 0, L, 2), 'rgba(255, 246, 228, 0.1)');
    for (let x = 3; x < L - 6; x += 13) { const w = 6, y0 = 3.5, y1 = H - 2.5; window_(d, l, x + 1, y0, w, y1 - y0, r, true, 1); d.fill(rect(x + w + 2.4, 1, 2, H - 2), C.stone_hi); }
    d.fill([...rect(0, .6, L, .6), ...rect(0, H - 1.4, L, .6)], C.gold);
}
/** A slate mansard: the slope's light, standing seams, dormers with stone frames and pediments, a zinc cap. */
function mansard(d, l, t, H, L) {
    const r = classicRandom(7519 + t.i);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.slate_dk], [1, C.slate_hi]]) });
    const seams = []; for (let x = 0; x < L; x += 2.2) seams.push(...rect(x, 0, .3, H)); d.fill(seams, 'rgba(0, 0, 0, 0.18)');
    for (const run of runsOf(t)) {
        if (run.hidden) continue;
        const n = Math.max(1, Math.round(run.len / 28)), bw = run.len / n;
        for (let i = 0; i < n; i++) {
            const uc = run.u0 + (i + .5) * bw, w = 6, y0 = H - 11;
            d.fill(rect(uc - w / 2 - 1.4, y0 - 1, w + 2.8, 10), C.stone_hi);
            d.fill(polygon([[uc - w / 2 - 2, y0 - .6], [uc, y0 - 4], [uc + w / 2 + 2, y0 - .6]]), C.cream);
            window_(d, l, uc - w / 2, y0 + .6, w, 7, r, true, .5);
        }
    }
    d.fill(rect(0, 0, L, 1.2), '#7a7c86');
}
/** A canopy's fascia: black lacquer between gold lines, its name over the door, bulbs along its foot. */
function canopyArt(text) {
    return (d, l, t, H, L, b) => {
        const uc = uAt(t, b.x + t.cx, .9);
        d.fill(rect(0, 0, L, H), C.lacquer);
        d.fill([...rect(0, .4, L, .7), ...rect(0, H - 1.6, L, .7)], C.gold);
        const ticks = [], sockets = [], bulbs = [];
        for (let x = 4; x < L; x += 8) ticks.push(...rect(x, 1.6, .4, H - 3.6));
        for (let x = 1.5; x < L - 1; x += 2.6) { sockets.push(...disc(x, H - .5, .4)); bulbs.push(...disc(x, H - .5, .5)); }
        d.fill(ticks, 'rgba(232, 194, 122, 0.35)'); d.fill(sockets, '#6a5530'); l.fill(bulbs, 'rgba(255, 236, 190, 1)');
        if (uc === null) return;
        d.fill(rect(uc - text.length * 2.3, 1.4, text.length * 4.6, H - 3.2), C.lacquer);
        words(d, text, uc, H / 2 - .2, 3.6, C.gold, { spacing: .22 });
        words(l, text, uc, H / 2 - .2, 3.6, 'rgba(255, 240, 205, 1)', { spacing: .22, shadow: ['rgba(255, 190, 110, 1)', 3] });
    };
}
/** The plinth's front: dark stone, SAME SKY / DIFFERENT STORIES in gold, the emblem under it. */
function plinthArt(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#26222a'); d.fill(rect(0, 0, L, 1.2), 'rgba(255, 255, 255, 0.05)');
    const e = runsOf(t).find(q => q.ny > .9); if (!e) return;
    const cx = e.u0 + e.len / 2;
    d.stroke(rect(e.u0 + 3, 2.5, e.len - 6, H - 6), C.gold_dk, .4);
    for (const [c, colour] of [[d, C.gold], [l, 'rgba(255, 236, 196, 0.9)']]) {
        ['SAME', 'SKY', 'DIFFERENT', 'STORIES'].forEach((w, i) => words(c, w, cx, 6.5 + i * 4.2, 2.6, colour, { spacing: .12 }));
        emblem(c, cx, H - 7.5, 2.4, colour);
    }
}
/** A planter: black, a gold band at its rim. */
function pot(d, l, t, H, L) { d.fill(rect(0, 0, L, H), C.lacquer); d.fill(rect(0, .4, L, .7), C.gold); d.fill(rect(0, 1.2, L, 1.2), 'rgba(255, 255, 255, 0.06)'); }

/* ---------------- roofs (world coordinates, in each tier's plane) ---------------- */

/** Lead flats round a setback, a stone gutter. */
function leadRoof(art, glow, t) {
    if (glow) return;
    const path = pathOf(t.poly); art.fill(path, '#45434c'); art.stroke(path, C.stone_hi, 3); art.stroke(path, 'rgba(0, 0, 0, 0.3)', 1);
}
/** A mansard's top: four zinc slopes up to a deck (seams down each, hips at the corners), skylights, chimney stacks with their pots. */
function zincRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box, r = classicRandom('dn-zinc' + t.i), w = x1 - x0, h = y1 - y0, I = 24;
    const sky = [.22, .5, .78].map(v => [x0 + w / 2 - 12, y0 + I + 8 + (h - I * 2 - 16) * v - 16, 24, 32]);
    if (glow) { art.fill(sky.flatMap(([x, y, sw, sh]) => rect(x + 2, y + 2, sw - 4, sh - 4)), 'rgba(255, 210, 150, 0.6)'); return; }
    const O = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], N = [[x0 + I, y0 + I], [x1 - I, y0 + I], [x1 - I, y1 - I], [x0 + I, y1 - I]];
    const shade = ['#6a6e7c', '#4c4f5c', '#5c606d', '#777b89'];
    for (let q = 0; q < 4; q++) {
        const slope = pathOf([O[q], O[(q + 1) % 4], N[(q + 1) % 4], N[q]]), seams = [];
        art.fill(slope, shade[q]);
        if (q % 2 === 0) for (let x = x0 + 3; x < x1; x += 5) moveLine(seams, [x, y0], [x, y1]); else for (let y = y0 + 3; y < y1; y += 5) moveLine(seams, [x0, y], [x1, y]);
        art.enter().clip(slope).stroke(seams, 'rgba(0, 0, 0, 0.2)', .8).leave();
    }
    art.fill(rect(N[0][0], N[0][1], w - I * 2, h - I * 2), '#5e6270');
    const deck = []; for (let x = N[0][0] + 4; x < N[1][0]; x += 6) moveLine(deck, [x, N[0][1]], [x, N[3][1]]); art.stroke(deck, 'rgba(255, 255, 255, 0.06)', .8);
    const hips = []; for (let q = 0; q < 4; q++) moveLine(hips, O[q], N[q]); art.stroke([...hips, ...rect(N[0][0], N[0][1], w - I * 2, h - I * 2)], '#9a9ca6', 1.4);
    art.stroke(rect(x0 + 1, y0 + 1, w - 2, h - 2), '#8a8c96', 2);
    for (const [x, y, sw, sh] of sky) {
        art.fill(rect(x + 2, y + 3, sw, sh), 'rgba(0, 0, 0, 0.3)'); art.paint(rect(x, y, sw, sh), { fill: '#1e2330', stroke: C.gold_dk, stroke_width: 1.2 });
        art.stroke(moveLine([], [x + sw / 2, y], [x + sw / 2, y + sh]), 'rgba(232, 194, 122, 0.4)', .6); art.fill(rect(x + 2, y + 2, sw * .4, sh - 4), 'rgba(190, 205, 230, 0.15)');
    }
    // chimney stacks astride the slopes, east and west, each with a row of pots
    for (let k = 0; k < 6; k++) {
        const side = k % 2, y = y0 + 30 + Math.floor(k / 2) * (h - 70) / 2 + r() * 8, x = side ? x1 - I - 6 : x0 + I - 22;
        art.fill(rect(x + 4, y + 5, 28, 12), 'rgba(0, 0, 0, 0.35)'); art.fill(rect(x, y, 28, 12), '#a08c70'); art.fill(rect(x, y, 28, 2.5), '#c0ad8c'); art.fill(rect(x, y + 10, 28, 2), '#7d6b54');
        art.fill([0, 1, 2, 3].flatMap(p => disc(x + 4 + p * 6.6, y + 6, 2.2)), '#a5583b'); art.fill([0, 1, 2, 3].flatMap(p => disc(x + 4 + p * 6.6, y + 6, 1)), '#2a1a14');
    }
}
/** The attic's top: the penthouse terrace, a teak deck, the pool, loungers, planters, the glass pavilion. */
function penthouseRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, pool = [cx - 34, y0 + 70, 68, 150], pav = [x0 + 18, y0 + 14, x1 - x0 - 36, 36];
    if (glow) {
        art.fill(rect(...pool), 'rgba(90, 140, 255, 0.45)');
        art.fill(rect(pav[0] + 3, pav[1] + 3, pav[2] - 6, pav[3] - 6), 'rgba(255, 214, 160, 0.5)');
        const lights = []; for (let y = y0 + 64; y < y1 - 20; y += 26) for (const x of [x0 + 12, x1 - 12]) lights.push(...disc(x, y, 2));
        art.fill(lights, 'rgba(255, 220, 160, 0.8)');
        return;
    }
    const path = pathOf(t.poly); art.fill(path, '#5b3f2c');
    const boards = []; for (let y = y0 + 3; y < y1; y += 4) moveLine(boards, [x0, y], [x1, y]); art.stroke(boards, 'rgba(30, 18, 10, 0.35)', .8);
    art.stroke(path, C.stone_hi, 4);
    // the pool: a gold rim, deep blue, a crescent mosaic at its foot
    art.fill(rect(pool[0] - 5, pool[1] - 5, pool[2] + 10, pool[3] + 10), C.stone_hi);
    art.paint(rect(...pool), { fill: linear([pool[0], pool[1]], [pool[0] + pool[2], pool[1] + pool[3]], [[0, '#1b2f62'], [1, '#2d5a94']]), stroke: C.gold, stroke_width: 1.5 });
    const ripples = []; for (let y = pool[1] + 14; y < pool[1] + pool[3]; y += 18) ripples.push(['move', pool[0] + 4, y], ['quadratic', cx, y + 5, pool[0] + pool[2] - 4, y]);
    art.stroke(ripples, 'rgba(200, 225, 255, 0.25)', .8);
    emblem(art, cx, pool[1] + pool[3] - 22, 14, 'rgba(232, 194, 122, 0.55)');
    // loungers both sides, planters at the corners
    const under = [], lounge = [], head = [];
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const x = cx + s * 64 - 9, y = pool[1] + 10 + k * 36; under.push(...rect(x + 2, y + 2, 18, 26)); lounge.push(...rect(x, y, 18, 26)); head.push(...rect(x, y, 18, 7)); }
    art.fill(under, 'rgba(0, 0, 0, 0.35)'); art.fill(lounge, '#efe6d6'); art.fill(head, '#d8c8b0');
    for (const [x, y] of [[x0 + 14, y1 - 14], [x1 - 14, y1 - 14], [x0 + 14, y0 + 64], [x1 - 14, y0 + 64]]) {
        art.fill(disc(x + 2, y + 3, 9), 'rgba(0, 0, 0, 0.35)'); art.fill(disc(x, y, 9), C.lacquer);
        art.paint(disc(x, y, 7), { fill: radial([x - 2, y - 2], 1, [x, y], 8, [[0, C.leaf_hi], [1, '#173a1e']]) });
    }
    // the pavilion: the suite's glass room on the north side
    art.fill(rect(pav[0] + 3, pav[1] + 4, pav[2], pav[3]), 'rgba(0, 0, 0, 0.35)');
    art.paint(rect(...pav), { fill: '#1f1c26', stroke: C.gold, stroke_width: 1.4 });
    const mullions = []; for (let x = pav[0] + 12; x < pav[0] + pav[2]; x += 12) moveLine(mullions, [x, pav[1]], [x, pav[1] + pav[3]]); art.stroke(mullions, 'rgba(232, 194, 122, 0.35)', .8);
}
/** The rotunda's top round the lantern: lead, a stone parapet, planters spilling greenery all round its curve. */
function rotundaRoof(art, glow, t, b) {
    if (glow) return;
    const r = classicRandom('dn-rot-roof'), path = pathOf(t.poly), [cx, cy] = LOOK.crown, X = b.x + cx, Y = b.y + cy;
    art.paint(path, { fill: '#4a4650', stroke: C.stone_hi, stroke_width: 4 });
    art.enter().clip(path).stroke(path, 'rgba(232, 194, 122, 0.3)', 1).leave();
    const pts = t.poly, leaf = [], leafHi = [], white = [], pink = [];
    for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if (Math.abs(ay - by) < .5 && Math.abs(ay - (b.y + LOOK.rotunda[2])) < 1) continue;           // (not along the core)
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 3));
        for (let k = 0; k < n; k++) {
            const u = (k + .5) / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, ix = x + (X - x) * .05, iy = y + (Y - y) * .05;
            (r() < .5 ? leaf : leafHi).push(...disc(ix, iy, 2.6 + r() * 2));
            if (r() < .2) (r() < .5 ? white : pink).push(...disc(ix + 1, iy - 1, 1));
        }
    }
    for (const [list, colour] of [[leaf, C.leaf], [leafHi, C.leaf_hi], [white, '#f3e8f0'], [pink, '#e78db2']]) if (list.length) specks(art, list, colour);
}
/** The lantern's top under the dome. */
function crownRoof(art, glow, t) { if (!glow) art.paint(pathOf(t.poly), { fill: C.slate_dk, stroke: C.gold, stroke_width: 2 }); }
/** The canopy's top: dark glass in iron ribs fanning from the wall, a gold rim; lit from under at night. */
function canopyRoof(art, glow, t, b) {
    const pts = t.poly, path = pathOf(pts), wy = b.y + LOOK.rotunda[2], [cx] = centre(pts);
    if (glow) { art.fill(path, 'rgba(255, 210, 150, 0.22)'); return; }
    art.paint(path, { fill: linear([0, wy], [0, wy + 66], [[0, '#1e1a22'], [1, '#2c2630']]) });
    const ribs = []; for (const [x, y] of pts) if (Math.abs(y - wy) >= 1) moveLine(ribs, [cx, wy], [x, y]);
    art.stroke(ribs, 'rgba(232, 194, 122, 0.4)', .8);
    art.stroke(path, C.gold, 1.8); art.fill(path, 'rgba(255, 255, 255, 0.06)');
}
const darkRoof = colour => (art, glow, t) => { if (!glow) art.fill(pathOf(t.poly), colour); };

/* ---------------- what stands on the roofs and the forecourt, drawn live ---------------- */

/** The canopy's iron cresting: a rail round its curve, posts, gold finials at the ends. */
function cresting(art, glow, t, b, view) {
    if (glow) return;
    const wy = b.y + LOOK.rotunda[2], pts = t.poly.filter(([, y]) => Math.abs(y - wy) > .5), z0 = t.z1, z1 = t.z1 + 4, rail = [];
    pts.forEach(([x, y], j) => rail.push([j ? 'line' : 'move', ...b.at(view, x, y, z1)]));
    pts.forEach(([x, y], j) => moveLine(rail, b.at(view, x, y, z0), b.at(view, x, y, z1 + (j % 2 ? 0 : 1.6))));
    art.stroke(rail, C.iron, .9);
    art.fill([0, pts.length - 1].flatMap(j => { const p = b.at(view, pts[j][0], pts[j][1], z1 + 2.4); return disc(p[0], p[1], 1.4 * b.k(view, z1)); }), C.gold);
}
/** The lantern's dome: slate rings up its curve, gold ribs, the gold emblem on its crown; lit gold at night. */
function dome(art, glow, t, b, view) {
    const [cx, cy] = centre(t.poly), R = LOOK.crown[2] - 3, Hd = Z.dome, z0 = t.z1, N = 8;
    const ringAt = i => { const th = i / N * Math.PI / 2 * .92; return { z: z0 + Hd * Math.sin(th), r: R * Math.cos(th) }; };
    const flat = (z, draw) => { art.enter({ matrix: view.plane(b.k(view, z)) }); draw(); art.leave(); };
    if (glow) {
        flat(ringAt(N).z, () => { glow_(art, cx, cy, 34, '255, 200, 120', .5); emblem(art, cx, cy, 13, 'rgba(255, 236, 190, 0.9)'); });
        flat(z0 + 1, () => art.stroke(disc(cx, cy, R + 2), 'rgba(255, 220, 160, 0.6)', 2));
        return;
    }
    for (let i = 0; i <= N; i++) {
        const q = ringAt(i), s = .5 + .5 * (i / N);
        flat(q.z, () => {
            art.fill(disc(cx, cy, q.r), `rgb(${Math.round(40 + 40 * s)}, ${Math.round(42 + 42 * s)}, ${Math.round(54 + 46 * s)})`);
            if (i === 0) art.stroke(disc(cx, cy, q.r), C.gold_dk, 2);
            if (i === N) { emblem(art, cx, cy, 13, C.gold); art.stroke(disc(cx, cy, q.r), C.gold_dk, 1.2); }
        });
    }
    const ribs = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; for (let i = 0; i < N; i++) { const q = ringAt(i); ribs.push([i ? 'line' : 'move', ...b.at(view, cx + Math.cos(a) * q.r, cy + Math.sin(a) * q.r, q.z)]); } }
    art.stroke(ribs, 'rgba(232, 194, 122, 0.55)', 1);
}
const glow_ = (art, x, y, r, rgb, alpha) => { if (alpha > .003) glow(art, x, y, r, rgb, 0, { alpha: Math.min(1, alpha) }); };
/** A clipped cone of box out of its planter. */
function topiary(art, glow, t, b, view) {
    if (glow) return;
    const [cx, cy] = centre(t.poly), N = 6, R = 7.5, Hc = 26;
    for (let i = 0; i <= N; i++) {
        const u = i / N, rr = R * (1 - u) + .8, s = .55 + .45 * u;
        art.enter({ matrix: view.plane(b.k(view, t.z1 + Hc * u)) });
        art.fill(disc(cx, cy, rr), `rgb(${Math.round(30 * s + 10)}, ${Math.round(74 * s + 16)}, ${Math.round(44 * s + 12)})`);
        art.fill(disc(cx - rr * .3, cy - rr * .3, rr * .45), 'rgba(150, 200, 120, 0.16)');
        art.leave();
    }
}
/** A lamp post on its footing: an iron column, a lantern on top, a black banner with the gold emblem on an arm (turned outward). */
function post(art, glow, t, b, view) {
    const [x, y] = centre(t.poly), s = x - b.x < 400 ? -1 : 1, at = (dx, z) => b.at(view, x + dx, y, z), kL = b.k(view, 38);
    if (glow) { const q = at(0, 38); glow_(art, q[0], q[1], 24 * kL, '255, 210, 140', .9); return; }
    art.enter({}, { line_cap: 'round' });
    art.stroke(moveLine([], at(0, t.z1), at(0, 34)), C.iron, 1.8 * b.k(view, 20));
    art.stroke(moveLine([], at(0, 30), at(s * 9, 30)), C.iron, .8 * kL);
    art.leave();
    art.paint(pathOf([at(s * 2, 29.5), at(s * 9, 29.5), at(s * 9, 15), at(s * 5.5, 17.5), at(s * 2, 15)]), { fill: '#121016', stroke: C.gold_dk, stroke_width: .6 });
    const m = at(s * 5.5, 24.5), k = b.k(view, 24);
    art.enter({ matrix: [k, 0, 0, k, m[0], m[1]] }); emblem(art, 0, 0, 2.6, C.gold); art.leave();
    const g0 = at(0, 34), g1 = at(0, 42), w = 2.6 * kL, box = rect(Math.min(g0[0], g1[0]) - w, Math.min(g0[1], g1[1]), w * 2, Math.abs(g1[1] - g0[1]) + .5);
    art.paint(box, { fill: '#efe0b0', stroke: C.iron, stroke_width: .7 });
    const cap = at(0, 44); art.fill(disc(cap[0], cap[1], w * 1.1), C.iron);
}

/** Night on the forecourt: light pooled under the canopies, at the entrance, round the plinth and the lamps; their long reflections on the wet stone; the searchlights. */
function nightGlow(art, b, view, time) {
    const X = b.x, Y = b.y, [px, py] = LOOK.plinth, wet = .65;
    for (const [x0, x1] of LOOK.canopies) glow_(art, X + (x0 + x1) / 2, Y + 380, 120, '255, 200, 130', .32);
    glow_(art, X + 400, Y + 460, 130, '255, 206, 140', .38);
    glow_(art, X + px + 22, Y + py + 22, 34, '255, 210, 150', .4);
    for (const [lx, ly] of LOOK.lamps) glow_(art, X + lx, Y + ly, 80, '255, 200, 130', .22);
    const [fx, fy, fw, fh] = LOOK.forecourt;
    art.enter().clip(rect(X + fx, Y + fy + 12, fw, fh - 12));
    for (const [x0, x1] of LOOK.canopies) streak(art, view, time, X + (x0 + x1) / 2, Y + 392, 30, 34, .32 * wet);
    streak(art, view, time, X + 400, Y + 436, 44, 30, .4 * wet);
    for (const [lx, ly] of LOOK.lamps) streak(art, view, time, X + lx, Y + ly + 4, 26, 22, .42 * wet);
    art.leave();
    beams(art, b, view, time);
}
/** A light's reflection on wet ground: a gold streak from under it toward the camera, longer the higher the light, glints breaking it up. */
function streak(art, view, time, x, y, h, w, a) {
    const [camX, camY] = view.camera; let dx = camX - x, dy = camY - y; const D = Math.hypot(dx, dy) || 1; dx /= D; dy /= D;
    const len = Math.min(D + 40, 70 + h * 3.4), ex = x + dx * len, ey = y + dy * len, nx = -dy, ny = dx, w0 = w * .5, w1 = w * .8;
    art.enter({}, { opacity: Math.min(1, a) });
    art.paint(polygon([[x + nx * w0, y + ny * w0], [ex + nx * w1, ey + ny * w1], [ex - nx * w1, ey - ny * w1], [x - nx * w0, y - ny * w0]]),
        { fill: linear([x, y], [ex, ey], [[0, 'rgba(255, 206, 130, 1)'], [.3, 'rgba(255, 190, 110, 0.45)'], [1, 'rgba(255, 180, 100, 0)']]) });
    art.leave();
    for (let i = 0; i < 7; i++) {
        const u = .08 + i * .12, wob = Math.sin(time * 2.2 + i * 1.9 + x * .01) * w * .25, px = x + dx * len * u + nx * wob, py = y + dy * len * u + ny * wob;
        const o = Math.min(1, a * (1 - u) * (.6 + .4 * Math.sin(time * 3.1 + i))); if (o <= 0) continue;
        const rx = w * .22 * (1 - u * .5), rot = Math.atan2(ny, nx);
        art.enter({}, { opacity: o }).fill([['move', px + Math.cos(rot) * rx, py + Math.sin(rot) * rx], ellipse(px, py, rx, 1, rot), ['close']], 'rgba(255, 236, 190, 1)').leave();
    }
}
/** Two gold searchlights from the rotunda's roof, sweeping and crossing over it. */
function beams(art, b, view, time) {
    const z0 = Z.rotunda + 4, eye = view.eye, zTop = eye * .8, k1 = eye / (eye - zTop), [camX, camY] = view.camera;
    LOOK.beams.forEach(([lx, ly], i) => {
        const ph = i * 2.4, sx = b.x + lx, sy = b.y + ly;
        const az = -Math.PI / 2 + (i ? .45 : -.45) + Math.sin(time * .2 + ph) * .9, elev = 1.02 + .16 * Math.sin(time * .12 + ph * 1.7);
        const run = (zTop - z0 * b.tier.z_scale) / Math.tan(elev), p0 = b.at(view, sx, sy, z0), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
        const p1 = [camX + (ex - camX) * k1, camY + (ey - camY) * k1], vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
        const beam = (w0, w1, c0, c1) => art.paint(polygon([[p0[0] + nx * w0, p0[1] + ny * w0], [p1[0] + nx * w1, p1[1] + ny * w1], [p1[0] - nx * w1, p1[1] - ny * w1], [p0[0] - nx * w0, p0[1] - ny * w0]]),
            { fill: linear(p0, p1, [[0, c0], [.3, c1], [1, 'rgba(255, 210, 140, 0)']]) });
        const w1 = Math.max(60, L * .13);
        beam(6, w1, 'rgba(255, 214, 150, 0.18)', 'rgba(255, 196, 120, 0.06)');
        beam(2, w1 * .3, 'rgba(255, 246, 225, 0.28)', 'rgba(255, 214, 150, 0.07)');
        glow_(art, p0[0], p0[1], 14, '255, 248, 230', .9);
    });
}

/* ---------------- the forecourt (painted once into the ground) ---------------- */

function ground(scene, b) {
    const X = x => b.x + x, Y = y => b.y + y, r = classicRandom('dn-court');
    const two = (list, a, c) => { specks(scene, list[0], a); specks(scene, list[1], c); };
    // the terrace along the front: pale marble slabs, a brass line, three steps down
    const slabs = [[], []]; for (let y = 320; y < 470; y += 16) for (let x = 10, k = 0; x < 790; x += 24, k++) slabs[(k + (y / 16 | 0)) % 2].push(...rect(X(x) + .5, Y(y) + .5, 23, 15));
    two(slabs, '#857e73', '#8d867b');
    const glints = []; for (let i = 0; i < 60; i++) glints.push(...rect(X(10 + r() * 780), Y(322 + r() * 146), 6 + r() * 14, .8)); scene.fill(glints, 'rgba(255, 255, 255, 0.07)');
    scene.stroke(rect(X(14), Y(322), 772, 144), C.gold_dk, 1.2);
    for (let k = 0; k < 3; k++) { scene.fill(rect(X(10), Y(470 + k * 5), 780, 5), ['#7b756b', '#716b62', '#68625a'][k]); scene.fill(rect(X(10), Y(474.4 + k * 5), 780, .6), 'rgba(0, 0, 0, 0.25)'); }
    // the drop-off lane: basalt setts between kerbs
    scene.fill(rect(X(-10), Y(486), 820, 104), '#34313a');
    const setts = [[], [], []];
    for (let y = 488; y < 588; y += 6) for (let x = -10 + ((y / 6 | 0) % 2) * 4; x < 810; x += 8) { const v = r(); setts[v < .33 ? 0 : v < .66 ? 1 : 2].push(...rect(X(x) + .5, Y(y) + .5, 7, 5)); }
    specks(scene, setts[0], '#3e3a44'); specks(scene, setts[1], '#38353f'); specks(scene, setts[2], '#423e48');
    for (const y of [486, 588]) { scene.fill(rect(X(-10), Y(y), 820, 3), '#6e675d'); scene.fill(rect(X(-10), Y(y), 820, .8), 'rgba(255, 240, 210, 0.15)'); }
    const dashes = []; for (let x = -10; x < 810; x += 22) moveLine(dashes, [X(x), Y(538)], [X(Math.min(810, x + 12)), Y(538)]); scene.stroke(dashes, 'rgba(232, 194, 122, 0.25)', 1);
    // the plaza: granite slabs, a marble walk down the middle
    const granite = [[], []]; for (let y = 591; y < 860; y += 30) for (let x = -10; x < 810; x += 30) granite[r() < .5 ? 0 : 1].push(...rect(X(x) + .6, Y(y) + .6, 29, 29));
    two(granite, '#4f4b55', '#55515b');
    const walk = [[], []]; for (let y = 591; y < 860; y += 20) for (let x = 340; x < 460; x += 30) walk[((x + y) / 10 | 0) % 2].push(...rect(X(x) + .5, Y(y) + .5, 29, 19));
    two(walk, '#837d73', '#7a746b');
    scene.stroke(rect(X(340), Y(591), 120, 270), C.gold_dk, 1);
    // the medallion: brass rings, rays, the double crescent inlaid in gold
    const [mx, my, mr] = LOOK.medal, MX = X(mx), MY = Y(my);
    scene.fill(disc(MX, MY, mr), '#2c2930');
    const rays = []; for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; moveLine(rays, [MX + Math.cos(a) * 34, MY + Math.sin(a) * 34], [MX + Math.cos(a) * (mr - 6), MY + Math.sin(a) * (mr - 6)]); }
    scene.stroke(rays, 'rgba(232, 194, 122, 0.3)', 1);
    for (const [rr, w] of [[mr, 3], [mr - 6, 1], [32, 1.5]]) scene.stroke(disc(MX, MY, rr), C.gold_dk, w);
    emblem(scene, MX, MY, 26, C.gold);
    // the lawns either side: a box hedge round them, flowers, a clipped ball or two
    for (const [x0, x1] of [[-10, 170], [630, 810]]) {
        scene.fill(rect(X(x0), Y(640), x1 - x0, 220), '#1f3d22'); scene.fill(rect(X(x0) + 7, Y(647), x1 - x0 - 14, 213), '#2f5230');
        const grass = [[], []]; for (let i = 0; i < 260; i++) { const k = r() < .5 ? 0 : 1; grass[k].push(...rect(X(x0 + 8 + r() * (x1 - x0 - 16)), Y(648 + r() * 210), 2, 2)); }
        two(grass, '#3a6338', 'rgba(10, 30, 14, 0.5)');
        const flowers = [[], [], []]; for (let i = 0; i < 120; i++) { const v = r(), k = v < .4 ? 0 : v < .75 ? 1 : 2; flowers[k].push(...disc(X(x0 + 12 + r() * (x1 - x0 - 24)), Y(652 + r() * 40), 1.2 + r())); }
        scene.fill(flowers[0], '#f2eaf3'); scene.fill(flowers[1], '#c79bff'); scene.fill(flowers[2], '#ff9ccf');
        for (const [bx, by] of [[x0 + 50, 740], [x1 - 50, 800]]) {
            scene.fill(disc(X(bx) + 3, Y(by) + 4, 15), 'rgba(0, 0, 0, 0.35)');
            scene.paint(disc(X(bx), Y(by), 14), { fill: radial([X(bx) - 4, Y(by) - 4], 2, [X(bx), Y(by)], 15, [[0, '#4d8650'], [1, '#173a1e']]) });
        }
    }
    // wet: puddles holding the sky, a dark sheen
    for (let i = 0; i < 18; i++) {
        const x = r() * 800, y = 492 + r() * 360;
        if (y > 640 && (x < 175 || x > 625)) continue;
        const w = 14 + r() * 34, h = 4 + r() * 8, oval = (cx, cy, rx, ry) => [['move', cx + rx, cy], ellipse(cx, cy, rx, ry), ['close']];
        scene.fill(oval(X(x), Y(y), w, h), 'rgba(18, 18, 34, 0.32)'); scene.fill(oval(X(x) - w * .2, Y(y) - h * .2, w * .5, h * .3), 'rgba(190, 200, 230, 0.12)');
    }
}

/** Seen from in front, a canopy draws right after the wing it stands out from, or that wall, below its top, would paint over it. */
function order(tiers) {
    const fronts = tiers.filter(t => t.front); if (!fronts.length) return tiers;
    const rest = tiers.filter(t => !t.front);
    for (const f of fronts) rest.splice(rest.indexOf(f.support) + 1, 0, f);
    return rest;
}

/** The Double Nights Hotel's tiers, for `tieredBuilding`. It fronts south whatever street it is on. */
export function doubleNights() {
    const cornice = (z, out = 4, th = 4.5) => ({ z, out, th, top: C.stone_hi, band: [200, 186, 160], lip: C.cream });
    const stone = z1 => [{ z: 2.4, out: 1.2, th: 2.4, top: C.stone_lo, band: [120, 108, 94] }, cornice(G, 2.2, 2.6), cornice(z1)];
    const iron = z => ({ z, out: 3.2, th: 1.3, top: '#4a4048', band: [52, 44, 46], lip: 'rgba(232, 194, 122, 0.8)' });
    const [rx0, rx1, ry, rch, rdp] = LOOK.rotunda, [cx, cy, cr] = LOOK.crown, [px, py, pw, ph] = LOOK.plinth, slate = [14, 16, 24], warm = [40, 30, 24], dark = [10, 8, 14];
    const wing = (id, x0, doorX) => ({ id, rect: [x0, 40, 250, 280], z0: 0, z1: Z.wing, fill: C.stone, shade: warm, ledges: stone(Z.wing), roof: leadRoof,
        paint: (d, l, t, H, L, b) => facade(d, l, t, H, L, b, { seed: 7100 + x0, bay: 26, doors: [doorX], balc: (f, k, i) => f === 33 ? (i % 2 ? 2 : 0) : f === 66 ? 1 : 0 }) });
    const mansardOf = (id, on, x0) => ({ id, on, rect: [x0 + 10, 50, 230, 260], z0: Z.wing, z1: Z.mansard, fill: C.slate, paint: mansard, shade: slate,
        ledges: [{ z: Z.mansard, out: 1.5, th: 1.8, top: '#8a8c96', band: [110, 112, 122] }], roof_glow: true, roof: zincRoof });
    const canopy = (id, on, x0, x1, text) => ({ id, on, front: true, solid: false, cx: (x0 + x1) / 2, poly: bayPlan(x0, x1, ry, 2, 64, 12), z0: Z.canopy_0, z1: Z.canopy_1, fill: C.lacquer,
        paint: canopyArt(text), shade: dark, ledges: [{ z: Z.canopy_1, out: 1.2, th: 1.4, top: C.gold_dk, band: [154, 122, 62], lip: C.gold_hi }], roof_glow: true, roof: canopyRoof, top: cresting });
    const topiaryOf = (id, [lx, ly]) => ({ id, solid: false, poly: ring(lx, ly, 7, 8), z0: 0, z1: 7, fill: C.lacquer, paint: pot, shade: dark, roof: darkRoof('#2a1e16'), top: topiary, rise: 28 });
    const postOf = (id, [lx, ly]) => ({ id, solid: false, poly: [[lx - 5, ly - 5], [lx - 5, ly + 5], [lx + 5, ly + 5], [lx + 5, ly - 5]], z0: 0, z1: 3, fill: '#26222a', shade: dark, roof: darkRoof('#26222a'), top: post, rise: 44 });
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', origin: P.origin, ground, ground_area: LOOK.forecourt, shade: { offset: [4, 5], color: 'rgba(6, 3, 8, 0.45)' }, order, glow: nightGlow,
        tiers: [
            wing('wing_w', 20, 170), wing('wing_e', 530, 630),
            { id: 'core', rect: [270, 0, 260, 320], z0: 0, z1: Z.core, fill: C.stone, shade: warm, ledges: stone(Z.core), roof: leadRoof,
                paint: (d, l, t, H, L, b) => facade(d, l, t, H, L, b, { seed: 7207, bay: 26, balc: f => f >= 99 ? 1 : 0 }) },
            { id: 'rotunda', solid: false, poly: bayPlan(rx0, rx1, ry, rch, rdp, 16), z0: 0, z1: Z.rotunda, fill: C.stone, paint: rotunda, shade: warm,
                ledges: [...stone(Z.rotunda), iron(37), iron(77), iron(88), iron(99), iron(110), iron(121)], roof: rotundaRoof },
            mansardOf('mansard_w', 'wing_w', 20), mansardOf('mansard_e', 'wing_e', 530),
            { id: 'attic', on: 'core', rect: [284, 12, 232, 296], z0: Z.core, z1: Z.attic, fill: C.slate, paint: mansard, shade: slate,
                ledges: [{ z: Z.attic, out: 1.5, th: 1.8, top: '#8a8c96', band: [110, 112, 122] }], roof_glow: true, roof: penthouseRoof },
            { id: 'crown', on: 'rotunda', poly: ring(cx, cy, cr, 24), z0: Z.rotunda, z1: Z.crown, fill: C.stone, paint: lantern, shade: warm,
                ledges: [cornice(Z.crown, 2.5, 3)], roof: crownRoof, top: dome, rise: Z.dome + 4 },
            canopy('canopy_w', 'wing_w', ...LOOK.canopies[0]), canopy('canopy_e', 'wing_e', ...LOOK.canopies[1]),
            { id: 'plinth', solid: false, rect: [px, py, pw, ph], z0: 0, z1: Z.plinth, fill: '#26222a', paint: plinthArt, shade: dark,
                ledges: [{ z: Z.plinth, out: 1.2, th: 1.6, top: '#3a3540', band: [70, 62, 72], lip: C.gold }], roof: darkRoof('#3a3540') },
            ...LOOK.topiaries.map((p, i) => topiaryOf('topiary_' + i, p)),
            ...LOOK.lamps.map((p, i) => postOf('lamp_' + i, p))
        ]
    };
}
