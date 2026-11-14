import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, polygon, circle, ellipse, linear, radial, glow } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';
import { bayPlan } from './city-tiered.mjs';

/**
 * Moon City, the nightclub, as a tiered building (`city-tiered.mjs`), in black lacquer, violet neon and
 * champagne gold with rose light inside. The hall: arched windows glowing pink between fluted gold pilasters,
 * dancers' shadows in them, black banners with gold crescents, a chevron frieze and a row of bulbs under its
 * gold cornice, the name in a porthole panel. On the hall the drum, a ring of little arched windows under the
 * smoked-glass moon dome (the dance floor's lights pulse up through it on the beat), the eight phases of the
 * moon round it on the roof, the gold crescent and two searchlight turrets. The VIP wing, lower, with its roof
 * terrace (the crescent pool, cabanas, loungers, festoon lights); out of its front, over the door, the glass drum
 * with people at its mezzanine rail and the great crescent in its neon ring; under it the rose canopy and over it
 * the script "Moon City" board. Out front the black marble plaza with its gold sunburst, the red carpet and the
 * ropes, palms in gold planters, the marble terrace and the valet bay.
 * The look is the `moon_city` section of `data/city-landmarks.json`; the classic is `legacy/buildings/moon-city-deco.js`
 * (with the canopy and the board from `legacy/buildings/moon-city.js`).
 */
const LOOK = LANDMARKS.moon_city, P = LOOK.plan, Z = LOOK.z, C = LOOK.colors, TAU = Math.PI * 2;
const pathOf = pts => polygon(pts);
const disc = (x, y, r) => [['move', x + r, y], circle(x, y, r), ['close']];
const ring = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos(-i * TAU / n) * r, cy + Math.sin(-i * TAU / n) * r]);
const centre = poly => { let x = 0, y = 0; for (const p of poly) { x += p[0] / poly.length; y += p[1] / poly.length; } return [x, y]; };
/** A box with its own radius at each corner [top left, top right, bottom right, bottom left], as a canvas roundRect. */
function corners(x, y, w, h, [a, b, c, d]) {
    const q = Math.PI / 2, out = [['move', x + a, y], ['line', x + w - b, y]];
    if (b) out.push(ellipse(x + w - b, y + b, b, b, 0, -q, 0)); out.push(['line', x + w, y + h - c]);
    if (c) out.push(ellipse(x + w - c, y + h - c, c, c, 0, 0, q)); out.push(['line', x + d, y + h]);
    if (d) out.push(ellipse(x + d, y + h - d, d, d, 0, q, 2 * q)); out.push(['line', x, y + a]);
    if (a) out.push(ellipse(x + a, y + a, a, a, 0, 2 * q, 3 * q));
    out.push(['close']); return out;
}
const glow_ = (art, x, y, r, rgb, alpha) => { if (alpha > .003) glow(art, x, y, r, rgb, 0, { alpha: Math.min(1, alpha) }); };
/** The club's beat at `time`: its count, where in the beat, the bar, and the kick (1 on the beat, falling away). */
function beatAt(time) { const n = time * LOOK.bpm / 60, beat = ((n % 1) + 1) % 1; return { n, beat, bar: Math.floor(n / 8), kick: Math.pow(1 - beat, 3) }; }

/* ---------------- moons ---------------- */

/** A crescent at (x, y), radius r, its horns turned by `rot`. */
function crescent(x, y, r, rot = -.5) {
    const a0 = rot + .35, ix = x + Math.cos(rot) * r * .42, iy = y + Math.sin(rot) * r * .42;
    return [['move', x + Math.cos(a0) * r, y + Math.sin(a0) * r], ellipse(x, y, r, r, 0, a0, rot + TAU - .35), ellipse(ix, iy, r * .78, r * .78, 0, rot + TAU - .62, rot + .62, 1), ['close']];
}
/** A clean lune (the crescent pool): a disc less a disc 0.8 r across set 0.45 r toward `rot`. */
function lune(x, y, r, rot) {
    const th = .896, ph = 1.35, d = r * .45;
    return [['move', x + Math.cos(rot + th) * r, y + Math.sin(rot + th) * r], ellipse(x, y, r, r, 0, rot + th, rot + TAU - th), ellipse(x + Math.cos(rot) * d, y + Math.sin(rot) * d, r * .8, r * .8, 0, rot - ph, rot + ph, 1), ['close']];
}
/** The lit part of the moon at phase ph (0 new, 0.5 full) on a disc at (x, y), radius r. */
function phase(x, y, r, ph) {
    const w = Math.cos(ph * TAU) * r, flip = ph > .5 ? -1 : 1, out = [['move', x, y - r], ellipse(x, y, r, r, 0, -Math.PI / 2, Math.PI / 2, flip < 0)];
    if (w >= 0) out.push(ellipse(x, y, Math.max(.01, w), r, 0, Math.PI / 2, -Math.PI / 2, flip > 0)); else out.push(ellipse(x, y, -w, r, 0, Math.PI / 2, Math.PI * 1.5, flip < 0));
    out.push(['close']); return out;
}

/* ---------------- wall strips (x along the plan from its first corner, y down from the tier's top) ---------------- */

const edgesOf = t => t.mitre.map((e, i) => e && !e.hidden ? { ...e, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] } : null).filter(Boolean);
/** Where along the strip the wall facing (roughly) south passes world x, or null. */
function uAt(t, wx, minNy = .5) {
    for (const e of edgesOf(t)) {
        if (e.ny < minNy) continue;
        const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
        if (wx < x0 - .01 || wx > x1 + .01 || x1 - x0 < .5) continue;
        return e.u0 + Math.abs(wx - e.a[0]) / (x1 - x0) * e.L;
    }
    return null;
}

/** Black lacquer with a breath of plum low down, a faint vertical sheen. */
function lacquer(d, H, L, r) {
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, '#0b0810'], [1, '#180d20']]) });
    const sheen = new Map();
    for (let i = 0; i < L / 9; i++) { const a = (Math.round((.015 + r() * .025) * 400) / 400).toFixed(4), key = `rgba(200, 168, 255, ${a})`; if (!sheen.has(key)) sheen.set(key, []); sheen.get(key).push(...rect(r() * L, 0, .6 + r() * 1.4, H)); }
    for (const [colour, list] of sheen) d.fill(list, colour);
}
/** The top: a stepped parapet in gold, a row of bulbs, the chevron frieze (rose at night). 14 deep. */
function crown(d, l, L, bulbs = true) {
    const PAR = 5, BULB = 7.5, FR0 = 9.5, FR1 = 14;
    d.fill(rect(0, 0, L, PAR), '#07050a');
    const gold = [...rect(0, PAR - .8, L, .8)]; for (let x = 18; x < L - 8; x += 46) gold.push(...rect(x - 6, .2, 12, .5), ...rect(x - 3, 1.4, 6, .5)); d.fill(gold, C.gold);
    if (bulbs) {
        const sockets = [], lit = [], halo = [];
        for (let x = 2; x < L - 1; x += 3.2) { sockets.push(...disc(x, BULB, .75)); lit.push(...disc(x, BULB, .8)); halo.push(...disc(x, BULB, 2.2)); }
        d.fill(sockets, '#6a5530'); l.fill(lit, 'rgba(255, 236, 190, 1)'); l.fill(halo, 'rgba(255, 200, 140, 0.3)');
    }
    d.fill(rect(0, FR0, L, FR1 - FR0), C.plum);
    const zig = []; for (let x = 0, k = 0; x <= L; x += 3, k++) zig.push([k ? 'line' : 'move', x, k % 2 ? FR0 + 1 : FR1 - 1]);
    d.stroke(zig, 'rgba(232, 194, 122, 0.75)', .6); l.stroke(zig, 'rgba(255, 90, 160, 0.85)', .8);
    d.fill([...rect(0, FR0, L, .5), ...rect(0, FR1 - .5, L, .5)], C.gold_dk);
}
function plinth(d, L, H) { d.fill(rect(0, H - 4, L, 4), C.marble); d.fill(rect(0, H - 4, L, .6), C.gold_dk); }
/** Dancers' shadows: heads and shoulders, a raised arm here and there; darker by day, cut out of the lit glass by night. */
function crowd(d, l, x0, x1, yb, r, n, scale = 1) {
    const day = [], night = [];
    for (let k = 0; k < n; k++) {
        const x = x0 + (x1 - x0) * (k + .2 + r() * .6) / n, h = (7 + r() * 3) * scale, w = 2.4 * scale, y = yb;
        const fig = () => {
            const out = [...disc(x, y - h, 1.25 * scale), ...polygon([[x - w, y], [x - w * .7, y - h + 1.6 * scale], [x + w * .7, y - h + 1.6 * scale], [x + w, y]])];
            if (r() < .45) { const s = r() < .5 ? -1 : 1; out.push(...polygon([[x + s * w * .6, y - h + 2 * scale], [x + s * (w + 1.6 * scale), y - h - 3 * scale], [x + s * (w + .6 * scale), y - h - 3.4 * scale], [x + s * w * .2, y - h + 2.6 * scale]])); }
            return out;
        };
        day.push(...fig()); night.push(...fig());
    }
    if (!day.length) return;
    d.fill(day, 'rgba(4, 2, 8, 0.55)');
    l.enter({}, { blend: 'destination-out' }).fill(night, 'rgba(0, 0, 0, 0.72)').leave();
}
/** An arched window x0..x1, y0 (the arch's crown)..y1: smoked glass, pink-lit inside, gold frame, mullion and transom. */
function arch(d, l, x0, y0, x1, y1, r, people = true) {
    const w = x1 - x0, rr = w / 2, sp = y0 + rr;
    const shape = [['move', x0, y1], ['line', x0, sp], ellipse(x0 + rr, sp, rr, rr, 0, Math.PI, 0), ['line', x1, y1], ['close']];
    d.paint(shape, { fill: linear([0, y0], [0, y1], [[0, '#120a1c'], [.7, '#1c0c22'], [1, '#2a0e2a']]) });
    d.enter().clip(shape).fill(polygon([[x0, y0], [x0 + w * .6, y0], [x0, y0 + (y1 - y0) * .55]]), 'rgba(214, 200, 240, 0.08)').fill(rect(x0, y1 - (y1 - y0) * .4, w, (y1 - y0) * .4), 'rgba(255, 80, 160, 0.10)').leave();
    l.paint(shape, { fill: linear([0, y0], [0, y1], [[0, 'rgba(190, 80, 255, 0.55)'], [.55, 'rgba(255, 70, 160, 0.78)'], [1, 'rgba(255, 110, 170, 0.95)']]) });
    const lights = []; for (let k = 0; k < 3; k++) lights.push(...disc(x0 + w * (.25 + .25 * k), sp + 1.5 + r() * 2, .55)); l.fill(lights, 'rgba(255, 236, 200, 0.9)');
    if (people) { l.enter().clip(shape); d.enter().clip(shape); crowd(d, l, x0, x1, y1 + 1, r, Math.max(1, Math.round(w / 4.5))); d.leave(); l.leave(); }
    d.stroke(shape, C.gold, .8);
    d.stroke([['move', x0 + rr, y0], ['line', x0 + rr, y1], ['move', x0, sp], ['line', x1, sp]], 'rgba(232, 194, 122, 0.6)', .4);
    l.enter({}, { blend: 'destination-out' }).fill([...rect(x0 + rr - .25, y0, .5, y1 - y0), ...rect(x0, sp - .25, w, .5)], '#000').leave();
    d.fill(rect(x0 - 1, y1, w + 2, .9), C.gold);
}
/** A fluted gold pilaster at x, w wide, y0..y1, its capital and base; at night a warm glow up it and a pink uplight at its foot. */
function pilaster(d, l, x, w, y0, y1) {
    d.fill(rect(x, y0, w, y1 - y0), C.gold_dk);
    const flutes = []; for (let k = 0; k < Math.max(2, Math.floor(w / 1.3)); k++) flutes.push(...rect(x + .6 + k * 1.25, y0 + 3, .4, y1 - y0 - 7)); d.fill(flutes, 'rgba(255, 241, 194, 0.55)');
    d.fill(rect(x + w - .7, y0, .7, y1 - y0), 'rgba(40, 20, 10, 0.35)');
    d.fill([...rect(x - 1, y0, w + 2, 1.5), ...rect(x - .5, y0 + 1.5, w + 1, 1), ...rect(x - 1, y1 - 2, w + 2, 2)], C.gold);
    l.fill(rect(x, y0, w, y1 - y0), 'rgba(255, 214, 150, 0.22)');
    l.paint(polygon([[x + w / 2 - 1.5, y1], [x - 5, y0 + (y1 - y0) * .25], [x + w + 5, y0 + (y1 - y0) * .25], [x + w / 2 + 1.5, y1]]),
        { fill: linear([0, y1], [0, y0], [[0, 'rgba(255, 120, 190, 0.85)'], [.5, 'rgba(255, 90, 170, 0.22)'], [1, 'rgba(255, 90, 170, 0)']]) });
}
/** A black banner hung on a pilaster: gold border, a gold crescent, three gold lines for the name, a swallowtail foot. */
function banner(d, l, cx, y0, h, w = 9) {
    const x0 = cx - w / 2, cloth = polygon([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [cx, y0 + h - 3], [x0, y0 + h]]);
    d.enter({ position: [.8, .8] }).fill(cloth, 'rgba(0, 0, 0, 0.35)').leave();
    d.paint(cloth, { fill: '#0a070e', stroke: C.gold, stroke_width: .5 });
    d.fill(rect(x0 - 1, y0 - .8, w + 2, .8), C.gold);
    const my = y0 + h * .3;
    d.fill(crescent(cx, my, w * .28, -.5), C.gold); l.fill(crescent(cx, my, w * .28, -.5), 'rgba(255, 228, 170, 1)');
    l.fill(disc(cx, my, w * .5), 'rgba(255, 200, 140, 0.25)');
    d.fill([0, 1, 2].flatMap(k => { const lw = k === 2 ? w * .4 : w * .6; return rect(cx - lw / 2, y0 + h * (.52 + k * .1), lw, .45); }), 'rgba(232, 194, 122, 0.8)');
}
/** "MOON CITY" in gold capitals on a lacquer panel, a crescent either side. */
function name(d, l, cx, cy) {
    d.fill(rect(cx - 44, cy - 6, 88, 12), '#0b0810');
    const how = { font: { family: LOOK.name_font, size: 7.5, weight: 700 }, align: 'center', baseline: 'middle' };
    d.text('M O O N   C I T Y', cx, cy + .3, how, { fill: C.gold });
    l.text('M O O N   C I T Y', cx, cy + .3, how, { fill: 'rgba(255, 236, 214, 1)', shadow: { color: 'rgba(255, 100, 170, 1)', blur: 4, offset: [0, 0] } });
    for (const [c, colour] of [[d, C.gold], [l, 'rgba(255, 236, 214, 1)']]) { c.fill(crescent(cx - 38, cy, 3, -.5), colour); c.fill(crescent(cx + 38, cy, 3, Math.PI + .5), colour); }
    d.stroke(rect(cx - 44, cy - 6, 88, 12), C.gold_dk, .5);
}

/** The hall: bays of arched windows between gold pilasters, banners on every third, the name midway along the long walls. */
function hall(d, l, t, H, L) {
    const r = classicRandom(6113), PW = 5, top = 17;
    lacquer(d, H, L, r);
    for (const e of edgesOf(t)) {
        const n = Math.max(1, Math.round(e.L / 44)), bw = e.L / n, mid = e.L > 260 ? Math.floor(n / 2) : -1;
        for (let i = 0; i < n; i++) {
            const X0 = e.u0 + i * bw + PW / 2 + 4, X1 = e.u0 + (i + 1) * bw - PW / 2 - 4;
            if (i === mid) {                                                                         // the name, on a tall lacquer panel with a porthole
                d.fill(rect(X0 - 1, top + 2, X1 - X0 + 2, H - top - 9), '#0d0912'); d.stroke(rect(X0 + 1, top + 4, X1 - X0 - 2, H - top - 13), 'rgba(232, 194, 122, 0.4)', .5);
                const cx = (X0 + X1) / 2, py = top + 16, pr = Math.min(9, (X1 - X0) * .3);
                d.paint(disc(cx, py, pr), { fill: '#0a0610', stroke: C.gold, stroke_width: 1 });
                d.fill(crescent(cx, py, pr * .72, -.5), '#c9a35a'); l.fill(crescent(cx, py, pr * .72, -.5), 'rgba(255, 236, 200, 1)');
                l.fill(disc(cx, py, pr + 3), 'rgba(255, 120, 190, 0.35)');
                continue;
            }
            arch(d, l, X0, top + 3, X1, H - 7, r);
        }
        for (let i = 0; i <= n; i++) {
            const end = i === 0 || i === n, w = end ? 7 : PW, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2));
            pilaster(d, l, x, w, top - 1, H - 4);
            if (!end && i % 3 === 1 && e.L > 120) banner(d, l, x + w / 2, top + 6, Math.min(34, H * .42));
        }
        if (mid >= 0) name(d, l, e.u0 + (mid + .5) * bw, top + 34 > H - 12 ? H - 12 : top + 34);
    }
    crown(d, l, L);
    plinth(d, L, H);
}
/** The VIP wing: lounge windows (people at the tables), pilasters, the door's portal under the glass drum. */
function wing(d, l, t, H, L, b) {
    const r = classicRandom(6229), PW = 4.5, top = 16, doorU = uAt(t, b.x + LOOK.door[0], .99);
    lacquer(d, H, L, r);
    for (const e of edgesOf(t)) {
        const n = Math.max(1, Math.round(e.L / 40)), bw = e.L / n;
        for (let i = 0; i < n; i++) {
            const X0 = e.u0 + i * bw + PW / 2 + 4, X1 = e.u0 + (i + 1) * bw - PW / 2 - 4, cx = (X0 + X1) / 2;
            if (doorU !== null && Math.abs(cx - doorU) < 70) continue;
            arch(d, l, X0, top + 3, X1, H - 6, r);
        }
        for (let i = 0; i <= n; i++) {
            const end = i === 0 || i === n, w = end ? 6 : PW, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2));
            if (doorU !== null && Math.abs(x + w / 2 - doorU) < 62) continue;
            pilaster(d, l, x, w, top - 1, H - 4);
        }
    }
    if (doorU !== null) {                                                                            // the portal: glass doors, gold frames, rose light, a chandelier inside
        const cx = doorU, y0 = H - Z.glass_0 - 1, bot = H - 4;
        d.fill(rect(cx - 62, top, 124, bot - top), '#07050a');
        const doors = [], frames = [], pulls = [];
        for (let k = -2; k <= 2; k++) { const x0 = cx + k * 14 - 6; doors.push(...rect(x0, y0 + 2, 12, bot - y0 - 2)); frames.push(...rect(x0, y0 + 2, 12, bot - y0 - 2)); pulls.push(...rect(x0 + 9.5, y0 + 8, .6, 4)); }
        d.fill(doors, '#1a0a1c');
        l.paint(doors, { fill: linear([0, y0], [0, bot], [[0, 'rgba(255, 120, 190, 0.7)'], [1, 'rgba(255, 70, 140, 0.95)']]) });
        d.stroke(frames, C.gold, .7); d.fill(pulls, C.gold_lt);
        crowd(d, l, cx - 30, cx + 30, bot + .5, r, 4, .9);
        d.fill([...rect(cx - 40, y0, 80, 1.2), ...rect(cx - 62, bot, 124, .8)], C.gold);
        l.fill([-1, 0, 1].flatMap(k => disc(cx + k * 6, y0 + 4, .7)), 'rgba(255, 236, 200, 1)');
    }
    crown(d, l, L);
    plinth(d, L, H);
}
/** The glass drum over the door: curved glass, a mezzanine rail with people at it, gold mullions, the great crescent in its neon ring. */
function glassDrum(d, l, t, H, L, b) {
    const r = classicRandom(6337), F = 6, B = 5, rail = Math.round(H * .56);
    d.fill(rect(0, 0, L, H), '#0c0712');
    d.paint(rect(0, F, L, H - F - B), { fill: linear([0, F], [0, H - B], [[0, '#160a20'], [1, '#2a0d2a']]) });
    l.paint(rect(0, F, L, H - F - B), { fill: linear([0, F], [0, H - B], [[0, 'rgba(200, 80, 255, 0.55)'], [.6, 'rgba(255, 70, 160, 0.8)'], [1, 'rgba(255, 110, 170, 0.9)']]) });
    const gloss = []; for (let x = -20; x < L; x += 34) gloss.push(...polygon([[x, F], [x + 14, F], [x + 4, H - B], [x - 10, H - B]])); d.fill(gloss, 'rgba(214, 200, 240, 0.07)');
    const chand = []; for (let x = 6; x < L; x += 11) chand.push(...disc(x + r() * 3, F + 4 + r() * 3, .6)); l.fill(chand, 'rgba(255, 236, 200, 0.9)');
    crowd(d, l, 0, L, rail - .5, r, Math.round(L / 6), 1.05);
    crowd(d, l, 0, L, H - B + .5, r, Math.round(L / 8), .95);
    d.fill(rect(0, rail, L, 1), C.gold);
    const balusters = [...rect(0, rail - 3.6, L, .4)]; for (let x = 1; x < L; x += 2.4) balusters.push(...rect(x, rail - 3.4, .35, 3.4)); d.fill(balusters, 'rgba(232, 194, 122, 0.5)');
    l.enter({}, { blend: 'destination-out' }).fill(rect(0, rail, L, 1.2), 'rgba(0, 0, 0, 0.6)').leave();
    const mull = [], mullHi = []; for (let x = 0; x < L; x += 12) { mull.push(...rect(x - .5, F, 1, H - F - B)); mullHi.push(...rect(x - .5, F, .35, H - F - B)); }
    d.fill(mull, C.gold_dk); d.fill(mullHi, 'rgba(255, 241, 194, 0.5)');
    l.enter({}, { blend: 'destination-out' }).fill(mull, '#000').leave(); l.fill(mull, 'rgba(255, 214, 150, 0.3)');
    // the fascias: the cornice at the top (bulbs), the band over the canopy at the foot
    d.fill(rect(0, 0, L, F), '#07050a'); d.fill([...rect(0, F - .8, L, .8), ...rect(0, .6, L, .4)], C.gold);
    const sockets = [], bulbs = []; for (let x = 2; x < L - 1; x += 3.2) { sockets.push(...disc(x, 3, .65)); bulbs.push(...disc(x, 3, .75)); } d.fill(sockets, '#6a5530'); l.fill(bulbs, 'rgba(255, 236, 190, 1)');
    d.fill(rect(0, H - B, L, B), '#07050a'); d.fill([...rect(0, H - B, L, .8), ...rect(0, H - .8, L, .8)], C.gold);
    l.fill(rect(0, H - B + 1.6, L, .8), 'rgba(255, 90, 160, 0.9)');
    // the crescent in its ring, on the front
    const uc = uAt(t, b.x + LOOK.door[0], .9); if (uc === null) return;
    const cy = F + (rail - F) * .5 + 2, R = Math.min(rail - F - 4, 30) / 2 + 6;
    d.fill(disc(uc, cy, R), '#0a0610');
    l.enter({}, { blend: 'destination-out' }).fill(disc(uc, cy, R), '#000').leave();
    d.paint(disc(uc + 3, cy, R * .72), { fill: radial([uc + 3, cy - 2], 1, [uc + 3, cy], R * .8, [[0, '#5a2040'], [1, '#2a0c22']]) });
    l.paint(disc(uc + 3, cy, R * .72), { fill: radial([uc + 3, cy - 2], 1, [uc + 3, cy], R * .8, [[0, 'rgba(255, 130, 180, 0.8)'], [1, 'rgba(200, 40, 110, 0.35)']]) });
    d.paint(crescent(uc - 2, cy, R * .82, -.25), { fill: linear([uc - R, cy - R], [uc + R, cy + R], [[0, C.gold_lt], [.5, C.gold], [1, C.gold_dk]]) });
    const craters = []; for (let k = 0; k < 7; k++) { const a = Math.PI * (.6 + r() * .8), rr = R * (.55 + r() * .2); craters.push(...disc(uc - 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr, .6 + r() * 1.1)); } d.fill(craters, 'rgba(120, 80, 30, 0.45)');
    l.fill(crescent(uc - 2, cy, R * .82, -.25), 'rgba(255, 232, 170, 1)');
    d.stroke(disc(uc, cy, R), C.gold, 1.4); d.stroke(disc(uc, cy, R + 2), C.gold_dk, .5);
    l.paint(disc(uc, cy, R + .5), { stroke: 'rgba(255, 170, 215, 1)', stroke_width: 1.3, shadow: { color: 'rgba(255, 90, 170, 1)', blur: 5, offset: [0, 0] } });
    l.stroke(disc(uc, cy, R + 2.4), 'rgba(255, 220, 160, 0.9)', .5);
}
/** The drum under the dome: lacquer, a ring of little arched windows lit violet and rose, gold bands. */
function drum(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#0d0912');
    const glass = [], violet = [], rose = [], posts = [];
    for (let x = 4, k = 0; x < L - 6; x += 12, k++) {
        const x0 = x + 2, x1 = x + 8, w = x1 - x0, sp = 5 + w / 2, win = [['move', x0, H - 4], ['line', x0, sp], ellipse(x0 + w / 2, sp, w / 2, w / 2, 0, Math.PI, 0), ['line', x1, H - 4], ['close']];
        glass.push(...win); (k % 2 ? violet : rose).push(...win); posts.push(...rect(x - .6, 2, 1.2, H - 4));
    }
    d.fill(glass, '#1a0c22'); d.stroke(glass, 'rgba(232, 194, 122, 0.7)', .5);
    if (violet.length) l.fill(violet, 'rgba(200, 140, 255, 0.85)'); if (rose.length) l.fill(rose, 'rgba(255, 90, 170, 0.85)');
    d.fill(posts, C.gold_dk);
    d.fill([...rect(0, 0, L, 1.2), ...rect(0, H - 2, L, 1.2)], C.gold); d.fill(rect(0, H - .8, L, .8), '#07050a');
    l.fill(rect(0, 0, L, 1), 'rgba(255, 220, 160, 0.5)');
}
/** A palm's planter: black lacquer banded in gold. */
function planter(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#0d0912'); d.fill([...rect(0, 0, L, 1), ...rect(0, H - 1.6, L, 1)], C.gold); d.fill(rect(0, H * .45, L, .6), C.gold_dk);
    l.fill(rect(0, 0, L, 1.2), 'rgba(255, 210, 140, 0.35)');
}

/* ---------------- roofs (world coordinates, in each tier's plane) ---------------- */

/** A lacquer deck in its gold parapet, a stepped inner tier. */
function deck(art, t, inner) {
    const [x0, y0, x1, y1] = t.box, I = 14;
    art.paint(pathOf(t.poly), { fill: linear([x0, y0], [x1, y1], [[0, '#171020'], [1, C.lacquer]]) });
    art.fill(rect(x0 + I, y0 + I, x1 - x0 - I * 2, y1 - y0 - I * 2), inner);
    art.stroke([['move', x1 - I, y0 + I], ['line', x1 - I, y1 - I], ['line', x0 + I, y1 - I]], 'rgba(0, 0, 0, 0.55)', 2);
    art.stroke([['move', x0 + I, y1 - I], ['line', x0 + I, y0 + I], ['line', x1 - I, y0 + I]], 'rgba(232, 194, 122, 0.3)', 1);
    art.stroke(rect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4), C.gold_dk, 3);
    art.stroke(rect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12), 'rgba(255, 241, 194, 0.35)', .8);
    art.fill([[x0 + 4, y0 + 4], [x1 - 4, y0 + 4], [x0 + 4, y1 - 4], [x1 - 4, y1 - 4]].flatMap(([x, y]) => rect(x - 3, y - 3, 6, 6)), C.gold);
}
function phasesOf(b) {
    const [dx, dy, dr] = LOOK.drum, R = dr + 24;
    return Array.from({ length: 8 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 4; return { x: b.x + dx + Math.cos(a) * R, y: b.y + dy + Math.sin(a) * R, ph: i / 8 }; });
}
/** The hall's roof: the deck, a fine gold sunburst from the drum, the eight phases round it, the crescent on its plinth, the turrets, the plant. */
function hallRoof(art, glow, t, b) {
    if (glow) return;
    const [dx, dy, dr] = LOOK.drum, D = { x: b.x + dx, y: b.y + dy, r: dr }, [x0, y0, x1, y1] = t.box;
    deck(art, t, '#120c1a');
    const grid = [], rays = [];
    for (let x = x0 + 15; x < x1; x += 30) moveLine(grid, [x, y0], [x, y1]); for (let y = y0 + 15; y < y1; y += 30) moveLine(grid, [x0, y], [x1, y]);
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; moveLine(rays, [D.x + Math.cos(a) * (D.r + 40), D.y + Math.sin(a) * (D.r + 40)], [D.x + Math.cos(a) * 640, D.y + Math.sin(a) * 640]); }
    art.enter().clip(rect(x0 + 15, y0 + 15, x1 - x0 - 30, y1 - y0 - 30)).stroke(grid, 'rgba(232, 194, 122, 0.04)', 1).stroke(rays, 'rgba(232, 194, 122, 0.13)', 1).leave();
    art.stroke([D.r + 40, D.r + 8].flatMap(rr => disc(D.x, D.y, rr)), 'rgba(232, 194, 122, 0.22)', 1);
    for (const p of phasesOf(b)) {
        art.fill(disc(p.x + 1.5, p.y + 2, 9), 'rgba(0, 0, 0, 0.45)'); art.paint(disc(p.x, p.y, 9), { fill: '#100a16', stroke: C.gold_dk, stroke_width: 1 });
        if (p.ph) art.fill(phase(p.x, p.y, 7, p.ph), C.gold);
    }
    const MO = { x: b.x + LOOK.moon[0], y: b.y + LOOK.moon[1] };
    for (const [rr, f] of [[38, '#100a16'], [32, '#171020']]) art.paint(disc(MO.x, MO.y, rr), { fill: f, stroke: C.gold_dk, stroke_width: 1.2 });
    art.fill(crescent(MO.x + 3, MO.y + 4, 26), 'rgba(0, 0, 0, 0.45)');
    art.paint(crescent(MO.x, MO.y, 26), { fill: linear([MO.x - 26, MO.y - 26], [MO.x + 26, MO.y + 26], [[0, C.gold_lt], [.5, C.gold], [1, C.gold_dk]]), stroke: 'rgba(255, 255, 255, 0.35)', stroke_width: .8 });
    for (const [lx, ly] of LOOK.turrets) {
        const x = b.x + lx, y = b.y + ly;
        art.fill(disc(x + 3, y + 4, 14), 'rgba(0, 0, 0, 0.45)'); art.paint(disc(x, y, 14), { fill: '#100a16', stroke: C.gold_dk, stroke_width: 2 });
        art.fill(disc(x, y, 7), C.fin); art.fill(disc(x - 2, y - 2, 2), 'rgba(232, 216, 255, 0.5)');
    }
    for (const [lx, ly, w, h] of [[36, 196, 52, 32], [96, 202, 26, 26], [36, 236, 30, 22]]) {
        const x = b.x + lx, y = b.y + ly, louvres = [];
        art.fill(rect(x + 3, y + 3, w, h), 'rgba(0,0,0,0.4)'); art.fill(rect(x, y, w, h), '#100a16');
        for (let yy = y + 4; yy < y + h - 1; yy += 4) moveLine(louvres, [x + 3, yy], [x + w - 3, yy]); art.stroke(louvres, 'rgba(232, 194, 122, 0.14)', 1);
        art.stroke(rect(x + .5, y + .5, w - 1, h - 1), 'rgba(168, 130, 62, 0.6)', 1);
    }
}
function poolOf(t) { const [x0, y0, x1, y1] = t.box, w = x1 - x0, h = y1 - y0; return { x: x0 + w * .56, y: y0 + h * .5, r: Math.min(w, h) * .29 }; }
/** The wing's roof: the terrace deck, the crescent pool, rose-velvet cabanas, loungers, violet topiary. */
function wingRoof(art, glow, t) {
    if (glow) return;
    const [x0, y0, x1, y1] = t.box, W = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, I = 14;
    deck(art, t, C.plum);
    const lines = []; for (let gy = W.y + I + 8; gy < W.y + W.h - I; gy += 8) moveLine(lines, [W.x + I, gy], [W.x + W.w - I, gy]); art.stroke(lines, 'rgba(232, 194, 122, 0.06)', 1);
    const PL = poolOf(t), pool = lune(PL.x, PL.y, PL.r, -.35);
    art.paint(pool, { fill: radial([PL.x - PL.r * .3, PL.y - PL.r * .3], 4, [PL.x, PL.y], PL.r, [[0, '#3a2470'], [1, C.water]]), stroke: C.gold, stroke_width: 3 });
    art.stroke(pool, 'rgba(232, 216, 255, 0.35)', .8);
    for (const [x, y, w, h] of [[W.x + 20, W.y + 24, 42, 36], [W.x + 20, W.y + W.h - 60, 42, 36]]) {
        art.fill(rect(x + 3, y + 4, w, h), 'rgba(0,0,0,0.45)'); art.fill(rect(x, y, w, h), C.velvet);
        art.fill(polygon([[x, y], [x + w, y], [x + w / 2, y + h / 2]]), C.velvet_lt); art.fill(polygon([[x, y], [x + w / 2, y + h / 2], [x, y + h]]), 'rgba(138, 26, 82, 0.6)');
        art.stroke([...moveLine([], [x, y], [x + w, y + h]), ...moveLine([], [x + w, y], [x, y + h])], 'rgba(255, 241, 194, 0.35)', .8);
        art.stroke(rect(x, y, w, h), C.gold, 1.2); art.fill(disc(x + w / 2, y + h / 2, 2), C.gold_lt);
    }
    for (let i = 0; i < 4; i++) {
        const x = W.x + W.w - 44, y = W.y + 26 + i * 38, w = 26, h = 13;
        art.fill(rect(x + 2, y + 3, w, h), 'rgba(0,0,0,0.4)'); art.fill(rect(x, y, w, h), C.fin); art.fill(rect(x + 2, y + 2, w - 4, h - 4), '#4a3468'); art.fill(rect(x + w - 8, y + 2, 6, h - 4), '#7a5aa8');
        art.fill(disc(x - 6, y + h / 2, 2.4), C.gold);
    }
    for (const [x, y] of [[W.x + W.w - 30, W.y + W.h - 28], [W.x + 82, W.y + 28], [W.x + 82, W.y + W.h - 28]]) {
        art.fill(disc(x + 2, y + 3, 10), 'rgba(0,0,0,0.45)');
        art.paint(disc(x, y, 9), { fill: radial([x - 3, y - 3], 1, [x, y], 10, [[0, '#7a52c8'], [1, '#2a1a50']]), stroke: C.gold_dk, stroke_width: 1 });
    }
}
/** The glass drum's roof: lacquer in a gold rim, an oculus with a crescent; at night a rose neon ring. */
function glassRoof(art, glow, t) {
    const [cx, cy] = centre(t.poly), inner = pathOf(t.poly.map(([x, y]) => [cx + (x - cx) * .86, cy + (y - cy) * .8]));
    if (glow) { art.stroke(inner, 'rgba(255, 110, 180, 0.9)', 1.6); art.fill(crescent(cx, cy + 4, 9), 'rgba(255, 220, 160, 0.6)'); return; }
    const path = pathOf(t.poly);
    art.paint(path, { fill: linear([cx, cy - 30], [cx, cy + 30], [[0, '#1d1328'], [1, C.lacquer]]) });
    art.stroke(path, '#07050a', 5); art.stroke(path, C.gold, 1.2); art.stroke(inner, 'rgba(232, 194, 122, 0.5)', .7);
    art.paint(disc(cx, cy + 4, 13), { fill: '#0a0610', stroke: C.gold_dk, stroke_width: 1.2 });
    art.fill(crescent(cx, cy + 4, 9), C.gold);
}
/** The drum's top: the dome's collar (the dome itself stands live on it). */
function drumRoof(art, glow, t, b) {
    if (glow) return;
    const [dx, dy, dr] = LOOK.drum, x = b.x + dx, y = b.y + dy;
    art.paint(disc(x, y, dr), { fill: '#0d0814', stroke: C.gold, stroke_width: 4 }); art.stroke(disc(x, y, dr - 5), C.gold_dk, 1);
}
const planterRoof = (art, glow, t) => { if (!glow) art.paint(pathOf(t.poly), { fill: '#20160f', stroke: C.gold, stroke_width: 1 }); };
const flat = (art, view, b, z, draw) => { art.enter({ matrix: view.plane(b.k(view, z)) }); draw(); art.leave(); };

/* ---------------- what stands on the roofs, drawn live ---------------- */

/** At night on the hall's roof: the phases lighting one after another a step a beat, violet neon round the deck's step, the crescent's halo, the turrets. */
function hallTop(art, glow, t, b, view, time) {
    if (!glow) return;
    const B = beatAt(time), [x0, y0, x1, y1] = t.box;
    flat(art, view, b, t.z1, () => {
        const lit = ((Math.floor(B.n) % 8) + 8) % 8, ph = phasesOf(b);
        for (let i = 0; i < 8; i++) { const d = (lit - i + 8) % 8, a = d === 0 ? .7 + .3 * B.kick : d === 1 ? .35 : d === 2 ? .15 : .05; glow_(art, ph[i].x, ph[i].y, 22, '200, 168, 255', a); }
        const step = rect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
        art.stroke(step, `rgba(138, 92, 255, ${.45 + .25 * B.kick})`, 2.4); art.stroke(step, 'rgba(232, 216, 255, 0.75)', .9);
        const MO = [b.x + LOOK.moon[0], b.y + LOOK.moon[1]];
        glow_(art, MO[0], MO[1], 70, '200, 168, 255', .55 + .2 * Math.sin(time * .6));
        art.fill(crescent(MO[0], MO[1], 26), 'rgba(255, 241, 194, 0.55)');
        for (const [lx, ly, rgb] of LOOK.turrets) glow_(art, b.x + lx, b.y + ly, 16, rgb, .8);
    });
}
/** The terrace at night: the pool lit violet from beneath, festoon lights over it. */
function wingTop(art, glow, t, b, view, time) {
    if (!glow) return;
    const PL = poolOf(t), [x0, y0, x1] = t.box;
    flat(art, view, b, t.z1, () => { glow_(art, PL.x, PL.y, PL.r * 1.5, '138, 92, 255', .45 + .1 * Math.sin(time * .8)); art.stroke(lune(PL.x, PL.y, PL.r - 2, -.35), 'rgba(200, 168, 255, 0.6)', 1.4); });
    flat(art, view, b, t.z1 + 10, () => {
        for (let row = 0; row < 3; row++) {
            const y = y0 + 40 + row * 60, xa = x0 + 20, xb = x1 - 20;
            for (let u = 0, i = 0; u <= 1.0001; u += 1 / 14, i++) { const x = xa + (xb - xa) * u, sag = 10 * 4 * u * (1 - u); glow_(art, x, y + sag, 5, '255, 220, 180', .7 + .3 * Math.sin(time * 1.7 + i * .9 + row)); }
        }
    });
}
/** The smoked-glass moon dome: rings stacked up its curve, gold ribs to a gold boss, a pale gibbous moon in the glass; at night the dance floor's lights pulsing up through it on the beat. */
function dome(art, glow, t, b, view, time) {
    const [dx, dy, dr] = LOOK.drum, cx = b.x + dx, cy = b.y + dy, R = dr - 6, Hd = Z.dome, z0 = t.z1, N = 10;
    const ringAt = i => { const th = i / N * Math.PI / 2 * .94; return { z: z0 + Hd * Math.sin(th), r: R * Math.cos(th) }; };
    if (glow) {
        const B = beatAt(time), mid = ringAt(4), cell = 20, pat = B.bar % 4;
        flat(art, view, b, mid.z, () => {
            art.enter().clip(disc(cx, cy, mid.r));
            for (let gx = cx - mid.r; gx < cx + mid.r; gx += cell) for (let gy = cy - mid.r; gy < cy + mid.r; gy += cell) {
                const i = Math.round((gx - cx) / cell), j = Math.round((gy - cy) / cell);
                const p = pat === 0 ? Math.hypot(i, j) * .5 - B.n * .5 : pat === 1 ? (i + j) * .35 - B.n : pat === 2 ? ((i + j + Math.floor(B.n)) % 2) * 2 : Math.atan2(j, i) * 2 + B.n;
                const a = Math.max(0, .25 + .25 * Math.sin(p * Math.PI) + .35 * B.kick) * .55; if (a < .003) continue;
                art.enter({}, { opacity: a }).fill(rect(gx + 2, gy + 2, cell - 4, cell - 4), `rgb(${LOOK.club[(Math.abs(i * 3 + j) + B.bar) % 4]})`).leave();
            }
            art.leave();
        });
        flat(art, view, b, z0 + 1, () => art.stroke(disc(cx, cy, R + 2), `rgba(255, 241, 194, ${.5 + .3 * B.kick})`, 2.4));
        return;
    }
    for (let i = 0; i <= N; i++) {
        const q = ringAt(i), s = .5 + .5 * (i / N);
        flat(art, view, b, q.z, () => {
            art.fill(disc(cx, cy, q.r), `rgb(${Math.round(16 + 18 * s)}, ${Math.round(9 + 10 * s)}, ${Math.round(26 + 26 * s)})`);
            art.fill(disc(cx, cy, q.r), `rgba(190, 186, 236, ${(.05 * s).toFixed(3)})`);
            if (i === 0) art.stroke(disc(cx, cy, q.r), C.gold_dk, 2);
        });
    }
    const ribs = [];
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; for (let i = 0; i <= N; i++) { const q = ringAt(i); ribs.push([i ? 'line' : 'move', ...b.at(view, cx + Math.cos(a) * q.r, cy + Math.sin(a) * q.r, q.z)]); } }
    art.stroke(ribs, 'rgba(232, 194, 122, 0.45)', 1);
    flat(art, view, b, ringAt(N).z, () => { art.fill(phase(cx - R * .15, cy - R * .15, R * .55, .32), 'rgba(220, 200, 255, 0.18)'); art.fill(disc(cx, cy, 5), C.gold); });
}
/** A palm out of its planter: a ringed trunk curving up, fronds fanning from its crown; at night lit gold from its foot. */
function palm(art, glow, t, b, view) {
    const [cx, cy] = centre(t.poly), seed = (cx * 7 + cy * 3) | 0, lean = (seed % 2 ? 1 : -1) * 4, ZT = 52, N = 12;
    const at = u => [cx + lean * u * u, cy - 2 * u, t.z1 + (ZT - t.z1) * u];
    if (glow) {
        const m = at(.4), p = b.at(view, ...m), f = at(1), pf = b.at(view, ...f);
        glow_(art, p[0], p[1], 18 * b.k(view, m[2]), '255, 200, 120', .35); glow_(art, pf[0], pf[1], 26 * b.k(view, f[2]), '255, 150, 200', .18);
        return;
    }
    art.enter({}, { line_cap: 'round' });
    for (let i = 0; i < N; i++) {
        const a = at(i / N), q = at((i + 1) / N), p0 = b.at(view, ...a), p1 = b.at(view, ...q), w = (6.4 - 2.4 * i / N) * b.k(view, a[2]);
        art.stroke(moveLine([], p0, p1), i % 2 ? '#4a3426' : '#5e4330', w);
        art.stroke(moveLine([], [p0[0] - w * .2, p0[1]], [p1[0] - w * .2, p1[1]]), 'rgba(230, 190, 140, 0.22)', w * .3);
    }
    art.leave();
    const [fx, fy, fz] = at(1), r = classicRandom(seed);
    for (const [layer, zz, len, colour, rib] of [[0, fz - 2, 30, '#173b25', '#2f6a3c'], [1, fz, 24, '#245a34', '#4c8c52']]) flat(art, view, b, zz, () => {
        const n = layer ? 7 : 9, shade = [], fronds = [], ribs = [];
        for (let i = 0; i < n; i++) {
            const a = (i + (layer ? .5 : 0)) / n * TAU + r() * .3, L = len * (.85 + r() * .3), w = 5.5, ex = fx + Math.cos(a) * L, ey = fy + Math.sin(a) * L + 3, mx = fx + Math.cos(a) * L * .5, my = fy + Math.sin(a) * L * .5, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
            shade.push(['move', fx + 2, fy + 3], ['quadratic', mx + nx + 2, my + ny + 3, ex + 2, ey + 3], ['quadratic', mx - nx + 2, my - ny + 3, fx + 2, fy + 3], ['close']);
            fronds.push(['move', fx, fy], ['quadratic', mx + nx, my + ny, ex, ey], ['quadratic', mx - nx, my - ny, fx, fy], ['close']);
            ribs.push(['move', fx, fy], ['quadratic', mx, my, ex, ey]);
        }
        art.fill(shade, 'rgba(0, 0, 0, 0.18)'); art.fill(fronds, colour); art.stroke(ribs, rib, .7);
        if (layer) art.fill(disc(fx, fy, 2.4), '#5e4330');
    });
}

/* ---------------- the canopy and the marquee board (flat tiers floating in their planes) ---------------- */

const canopyAt = b => [b.x + LOOK.door[0], b.y + LOOK.door[1] + LOOK.glass[2]];
/** The canopy's velvet, ribs and scalloped rim, in its own plane. */
function canopyRoof(art, glow, t, b) {
    if (glow) return;
    const [cx, cy] = canopyAt(b), R = LOOK.canopy_r, N = 14;
    const rim = (r0, bulge) => { const out = [['move', cx + r0, cy]]; for (let i = 0; i < N; i++) { const a1 = Math.PI * (i + 1) / N, am = Math.PI * (i + .5) / N; out.push(['quadratic', cx + Math.cos(am) * (r0 + bulge), cy + Math.sin(am) * (r0 + bulge), cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0]); } out.push(['close']); return out; };
    art.enter({ position: [4, 6] }).fill(rim(R, 8), 'rgba(0,0,0,0.35)').leave();
    art.paint(rim(R, 8), { fill: radial([cx, cy], 6, [cx, cy], R + 6, [[0, C.velvet], [.65, C.velvet_lt], [1, C.velvet]]), stroke: C.gold, stroke_width: 1.4 });
    const ribs = []; for (let i = 1; i < N; i++) { const a = Math.PI * i / N; moveLine(ribs, [cx + Math.cos(a) * 20, cy + Math.sin(a) * 20], [cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)]); }
    art.stroke(ribs, 'rgba(255, 241, 194, 0.3)', .8);
    art.paint([['move', cx + 20, cy], ellipse(cx, cy, 20, 20, 0, 0, Math.PI), ['close']], { fill: '#100a16', stroke: C.gold, stroke_width: 1.2 });
    art.stroke([['move', cx + R - 10, cy], ellipse(cx, cy, R - 10, R - 10, 0, 0, Math.PI)], 'rgba(232, 194, 122, 0.6)', .8);
}
/** The canopy's gold posts from the ground up to it; at night its marquee bulbs round the rim. */
function canopyTop(art, glow, t, b, view, time) {
    const [cx, cy] = canopyAt(b), R = LOOK.canopy_r;
    if (glow) { flat(art, view, b, t.z1, () => { for (let i = 0; i <= 14; i++) { const a = Math.PI * i / 14; glow_(art, cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4), 7, '255, 200, 225', .55 + .45 * Math.sin(time * 3 + i * 1.3)); } }); return; }
    const posts = []; for (const a of [Math.PI / 2 - .8, Math.PI / 2 + .8]) { const x = cx + Math.cos(a) * (R - 6), y = cy + Math.sin(a) * (R - 6); moveLine(posts, [x, y], b.at(view, x, y, t.z1)); }
    art.stroke(posts, C.gold, 2);
}
const signAt = b => [b.x + LOOK.door[0], b.y + LOOK.door[1] + LOOK.glass[2] + 20];
const board = (x, y) => corners(x - 108, y - 22, 216, 46, [6, 6, 14, 14]);
function rules(art, x, y, colour) {
    art.stroke([-1, 1].flatMap(s => moveLine([], [x + s * 38, y + 15], [x + s * 70, y + 15])), colour, .8);
    art.fill([-1, 1].flatMap(s => polygon([[x + s * 74, y + 12.5], [x + s * 76.5, y + 15], [x + s * 74, y + 17.5], [x + s * 71.5, y + 15]])), colour);
}
const script = { font: { family: LOOK.script_font, size: 34 }, align: 'center', baseline: 'middle' }, caps = { font: { family: LOOK.sans_font, size: 6.5, weight: 600 }, align: 'center', baseline: 'middle' };
/** The marquee board over the door: lacquer in a gold frame, "Moon City" in script with the crescent before it, NIGHTCLUB in gold beneath between gold rules. */
function signRoof(art, glow, t, b) {
    if (glow) return;
    const [x, y] = signAt(b), ty = y - 4, cx = x - 78;
    art.enter({ position: [3, 4] }).fill(board(x, y), 'rgba(0,0,0,0.45)').leave();
    art.paint(board(x, y), { fill: linear([0, y - 22], [0, y + 24], [[0, '#1d1328'], [1, C.lacquer]]), stroke: C.gold, stroke_width: 2 });
    art.stroke(corners(x - 104, y - 18, 208, 38, [4, 4, 11, 11]), 'rgba(255, 241, 194, 0.3)', .8);
    art.text('Moon City', x + 7.5, ty + 2, script, { fill: 'rgba(0,0,0,0.55)' }); art.text('Moon City', x + 6, ty, script, { fill: '#d8c8f0' });
    art.fill(crescent(cx, ty - 2, 9), C.gold);
    art.text('N I G H T C L U B', x, y + 15, caps, { fill: C.gold });
    rules(art, x, y, C.gold_dk);
}
/** The board's neon by night, flickering now and then. */
function signTop(art, glow, t, b, view, time) {
    if (!glow) return;
    const [x, y] = signAt(b), ty = y - 4, cx = x - 78, flick = (time % 7.3) < .12 ? .35 : (time % 11.1) < .06 ? .6 : 1;
    flat(art, view, b, t.z1, () => {
        art.enter({}, { opacity: flick });
        glow_(art, x, y, 100, '255, 120, 180', .25);
        art.enter({}, { opacity: .6 }).stroke(board(x, y), C.rose, 1.2).leave();
        art.text('Moon City', x + 6, ty, script, { fill: '#ffb8d4', shadow: { color: C.rose, blur: 14, offset: [0, 0] } });
        art.text('Moon City', x + 6, ty, script, { fill: 'rgba(255, 244, 250, 0.9)' });
        art.fill(crescent(cx, ty - 2, 9), C.gold_lt);
        glow_(art, cx, ty - 2, 20, '232, 194, 122', .6);
        art.enter({}, { opacity: .85 }); art.text('N I G H T C L U B', x, y + 15, caps, { fill: C.gold }); rules(art, x, y, C.gold); art.leave();
        art.leave();
    });
}

/* ---------------- the forecourt: painted once into the ground, its light live ---------------- */

const courtOf = b => ({ x: b.x - 10, y: b.y + LOOK.door[1], w: 300, h: 184 });
function ground(scene, b) { plaza(scene, b); east(scene, b); }
/** The plaza: black marble, a gold sunburst from the door in deco arcs, crescents in rings, the red carpet and the ropes. */
function plaza(c, b) {
    const Q = courtOf(b), dx = b.x + LOOK.door[0], r = classicRandom('mcd-plaza'), outline = corners(Q.x, Q.y, Q.w, Q.h, [0, 0, 26, 26]);
    c.enter().clip(outline);
    c.fill(rect(Q.x, Q.y, Q.w, Q.h), '#1a1222');
    const tiles = [[], []]; for (let y = Q.y; y < Q.y + Q.h; y += 20) for (let x = Q.x; x < Q.x + Q.w; x += 20) tiles[r() < .5 ? 0 : 1].push(...rect(x + .5, y + .5, 19, 19));
    c.fill(tiles[0], 'rgba(62, 40, 78, 0.5)'); c.fill(tiles[1], 'rgba(40, 26, 52, 0.5)');
    const veins = []; for (let i = 0; i < 26; i++) { const x = Q.x + r() * Q.w, y = Q.y + r() * Q.h; veins.push(['move', x, y], ['cubic', x + 20, y + r() * 30, x + 40, y - r() * 20, x + 70, y + r() * 25]); }
    c.stroke(veins, 'rgba(200, 168, 255, 0.08)', .8);
    const polish = []; for (let i = 0; i < 40; i++) polish.push(...rect(Q.x + r() * Q.w, Q.y + r() * Q.h, 6 + r() * 14, .8)); c.fill(polish, 'rgba(255, 255, 255, 0.05)');
    const rays = []; for (let i = 1; i < 24; i++) { const a = Math.PI * i / 24; moveLine(rays, [dx + Math.cos(a) * 28, Q.y + Math.sin(a) * 28], [dx + Math.cos(a) * 240, Q.y + Math.sin(a) * 240]); } c.stroke(rays, 'rgba(232, 194, 122, 0.22)', 1);
    c.stroke([74, 112, 150].flatMap(rr => [['move', dx + rr, Q.y], ellipse(dx, Q.y, rr, rr, 0, 0, Math.PI)]), 'rgba(232, 194, 122, 0.4)', 1);
    for (const sx of [-1, 1]) { const px = dx + sx * 96, py = Q.y + 146; c.stroke(disc(px, py, 17), 'rgba(232, 194, 122, 0.5)', 1); c.fill(crescent(px, py, 11, sx < 0 ? .6 : Math.PI - .6), 'rgba(232, 194, 122, 0.65)'); }
    // the red carpet, door to kerb, gold-edged, and the velvet ropes on gold stanchions either side of it
    const cw = 40; c.fill(rect(dx - cw / 2, Q.y, cw, Q.h), '#6a0a22');
    const pile = []; for (let y = Q.y + 6; y < Q.y + Q.h; y += 8) pile.push(...rect(dx - cw / 2, y, cw, 1)); c.fill(pile, 'rgba(0,0,0,0.18)');
    c.fill([...rect(dx - cw / 2, Q.y, 2, Q.h), ...rect(dx + cw / 2 - 2, Q.y, 2, Q.h)], C.gold);
    for (const sx of [-1, 1]) {
        const xr = dx + sx * 34, ys = [110, 128, 146, 164, 182].map(v => Q.y + v), rope = [];
        for (let i = 0; i < ys.length - 1; i++) rope.push(['move', xr, ys[i]], ['quadratic', xr + sx * 5, (ys[i] + ys[i + 1]) / 2, xr, ys[i + 1]]);
        c.stroke(rope, C.velvet_lt, 2.6);
        c.fill(ys.flatMap(y => disc(xr + 1.5, y + 2, 3.6)), 'rgba(0,0,0,0.4)'); c.fill(ys.flatMap(y => disc(xr, y, 3.4)), C.gold); c.fill(ys.flatMap(y => disc(xr - 1, y - 1, 1.2)), C.gold_lt);
    }
    c.leave();
    c.stroke(corners(Q.x + 4, Q.y + 1, Q.w - 8, Q.h - 5, [0, 0, 22, 22]), 'rgba(168, 130, 62, 0.7)', 1.2);
}
/** East of the wing: a marble terrace along the hall's front, and the valet bay (lacquer paving, a gold kerb, bollards, the podium). */
function east(c, b) {
    const X = b.x, Y = b.y, r = classicRandom('mcd-east'), [bx0, by0, bw, bh] = LOOK.bay, tx = X + 284, ty = Y + 300, tw = 316, th = 70;
    c.fill(corners(tx, ty, tw, th, [0, 0, 16, 16]), C.marble);
    const tiles = [[], []]; for (let y = ty; y < ty + th; y += 18) for (let x = tx; x < tx + tw; x += 18) tiles[r() < .5 ? 0 : 1].push(...rect(x + .5, y + .5, 17, 17));
    c.fill(tiles[0], 'rgba(40, 24, 52, 0.5)'); c.fill(tiles[1], 'rgba(26, 16, 34, 0.5)');
    const polish = []; for (let i = 0; i < 30; i++) polish.push(...rect(tx + r() * tw, ty + r() * th, 6 + r() * 14, .8)); c.fill(polish, 'rgba(255, 255, 255, 0.05)');
    c.stroke(corners(tx + 4, ty + 1, tw - 8, th - 5, [0, 0, 13, 13]), 'rgba(168, 130, 62, 0.7)', 1.2);
    const chevrons = []; for (let x = tx + 22; x < tx + tw - 10; x += 26) chevrons.push(['move', x, ty + th - 14], ['line', x + 6, ty + th - 8], ['line', x + 12, ty + th - 14]); c.stroke(chevrons, 'rgba(232, 194, 122, 0.25)', 1);
    const bx = X + bx0, by = Y + by0, round = (x, y, w, h, rr) => corners(x, y, w, h, [rr, rr, rr, rr]);
    c.fill(round(bx - 3, by - 3, bw + 6, bh + 6, 18), 'rgba(0, 0, 0, 0.35)'); c.fill(round(bx, by, bw, bh, 16), '#120c18');
    const grit = []; for (let i = 0; i < 260; i++) grit.push(...rect(bx + 8 + r() * (bw - 16), by + 8 + r() * (bh - 16), 1, 1)); c.fill(grit, 'rgba(200, 168, 255, 0.04)');
    c.stroke(round(bx, by, bw, bh, 16), C.gold_dk, 3); c.stroke(round(bx + 4, by + 4, bw - 8, bh - 8, 13), 'rgba(255, 241, 194, 0.35)', .8);
    c.enter({}, { dash: [10, 8] }).stroke(moveLine([], [bx + 20, by + bh / 2 + 30], [bx + bw - 20, by + bh / 2 + 30]), 'rgba(232, 194, 122, 0.35)', 1).leave();
    c.text('V A L E T', bx + bw / 2, by + bh - 14, { font: { family: LOOK.sans_font, size: 9, weight: 600 }, align: 'center', baseline: 'middle' }, { fill: 'rgba(232, 194, 122, 0.55)' });
    const bollards = [6, 80, 156, 230].map(lx => [bx + lx, by - 8]);
    c.fill(bollards.flatMap(([x, y]) => disc(x + 1.5, y + 2, 4.5)), 'rgba(0, 0, 0, 0.4)'); c.fill(bollards.flatMap(([x, y]) => disc(x, y, 4.2)), C.gold_dk); c.fill(bollards.flatMap(([x, y]) => disc(x - 1, y - 1, 1.6)), C.gold_lt);
    const vx = bx - 18, vy = by + 10;
    c.fill(rect(vx + 2, vy + 2, 12, 9), 'rgba(0, 0, 0, 0.4)'); c.paint(rect(vx, vy, 12, 9), { fill: '#100a16', stroke: C.gold, stroke_width: 1 });
}

/** Night out front: the crimson pool at the door breathing on the kick, mist curling about it, the valet bay's light; the two searchlights from the turrets. */
function nightGlow(art, b, view, time) {
    const B = beatAt(time), dx = b.x + LOOK.door[0], dy = b.y + LOOK.door[1], Q = courtOf(b), [bx, by, bw] = LOOK.bay;
    glow_(art, dx, dy + 40, 110, '255, 40, 110', .3 + .12 * B.kick);
    for (let i = 0; i < 5; i++) glow_(art, dx + Math.sin(time * .21 + i * 1.7) * 80, Q.y + 50 + Math.cos(time * .17 + i * 2.3) * 30 + i * 11, 46, i % 2 ? '200, 168, 255' : '255, 120, 170', .07);
    glow_(art, b.x + bx + bw / 2, b.y + by + 10, 150, '255, 190, 140', .12);
    for (const lx of [6, 80, 156, 230]) glow_(art, b.x + bx + lx, b.y + by - 8, 14, '255, 214, 150', .6);
    const z0 = Z.hall + 8, eye = view.eye, zTop = eye * .8, k1 = eye / (eye - zTop), [camX, camY] = view.camera;
    for (const [lx, ly, rgb, ph] of LOOK.turrets) {
        const sx = b.x + lx, sy = b.y + ly, az = -Math.PI / 2 + (ph ? .5 : -.5) + Math.sin(time * .22 + ph) * 1, elev = 1.02 + .16 * Math.sin(time * .13 + ph * 1.7);
        const run = (zTop - z0 * b.tier.z_scale) / Math.tan(elev), p0 = b.at(view, sx, sy, z0), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
        const p1 = [camX + (ex - camX) * k1, camY + (ey - camY) * k1], vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
        const beam = (w0, w1, c0, c1) => art.paint(polygon([[p0[0] + nx * w0, p0[1] + ny * w0], [p1[0] + nx * w1, p1[1] + ny * w1], [p1[0] - nx * w1, p1[1] - ny * w1], [p0[0] - nx * w0, p0[1] - ny * w0]]),
            { fill: linear(p0, p1, [[0, c0], [.3, c1], [1, `rgba(${rgb}, 0)`]]) });
        const w1 = Math.max(60, L * .13);
        beam(6, w1, `rgba(${rgb}, 0.2)`, `rgba(${rgb}, 0.07)`); beam(2, w1 * .3, 'rgba(255, 244, 252, 0.3)', `rgba(${rgb}, 0.08)`);
        glow_(art, p0[0], p0[1], 14, '255, 248, 255', .9);
    }
}

/** The glass drum draws right after the wing it stands out from, with the canopy just before it (the drum's foot hides the canopy's back) and the board just after. */
function order(tiers) {
    const byId = id => tiers.find(t => t.id === id), wing = byId('wing'), glass = byId('glass'), canopy = byId('canopy'), sign = byId('sign');
    const rest = tiers.filter(t => t !== glass && t !== canopy && t !== sign);
    rest.splice(rest.indexOf(wing) + 1, 0, canopy, glass, sign);
    return rest;
}

/** Moon City's tiers, for `tieredBuilding`. It fronts south whatever street it is on. */
export function moonCity() {
    const gold = (z, out = 3.5, th = 4) => ({ z, out, th, top: '#1a1022', band: [168, 130, 62], lip: C.gold_lt });
    const foot = { z: 3, out: 1.4, th: 3, top: '#120c18', band: [40, 26, 48] }, wall = [20, 6, 30];
    const [gx0, gx1, gd] = LOOK.glass, [dx, dy, dr] = LOOK.drum, [cx, cy] = [LOOK.door[0], LOOK.door[1] + gd], R = LOOK.canopy_r, [sx, sy] = [cx, cy + 20];
    const palmOf = (id, [lx, ly]) => ({ id, solid: false, poly: ring(lx, ly, 9, 8), z0: 0, z1: 8, fill: '#0d0912', paint: planter, shade: [10, 6, 16], roof: planterRoof, top: palm, rise: 60 });
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', ground, ground_area: [-10, 300, 610, 404], order, glow: nightGlow,
        tiers: [
            { id: 'hall', rect: [0, 0, 600, 300], z0: 0, z1: Z.hall, fill: C.wall, paint: hall, ledges: [foot, gold(Z.hall)], shade: wall, roof: hallRoof, top: hallTop },
            { id: 'wing', rect: [0, 300, 280, 200], z0: 0, z1: Z.wing, fill: C.wall, paint: wing, ledges: [foot, gold(Z.wing)], shade: wall, roof: wingRoof, top: wingTop },
            { id: 'glass', on: 'wing', solid: false, poly: bayPlan(gx0, gx1, 500, 2, gd, 12), z0: Z.glass_0, z1: Z.glass, fill: '#0c0712', paint: glassDrum, shade: [16, 4, 22],
                ledges: [{ z: Z.glass_0 + 2, out: 2, th: 2.5, top: '#1a1022', band: [168, 130, 62] }, gold(Z.glass, 3, 3.5)], roof_glow: true, roof: glassRoof },
            { id: 'drum', on: 'hall', poly: ring(dx, dy, dr, 24), z0: Z.hall, z1: Z.drum, fill: '#0d0912', paint: drum, shade: [16, 4, 22], ledges: [gold(Z.drum, 3, 3.5)], roof: drumRoof, top: dome, rise: Z.dome },
            ...LOOK.palms.map((p, i) => palmOf('palm_' + i, p)),
            { id: 'canopy', solid: false, rect: [cx - R - 10, cy - 4, R * 2 + 24, R + 22], z0: Z.canopy, z1: Z.canopy, roof: canopyRoof, top: canopyTop },
            { id: 'sign', solid: false, rect: [sx - 108, sy - 22, 216, 46], z0: Z.sign, z1: Z.sign, roof: signRoof, top: signTop }
        ]
    };
}
