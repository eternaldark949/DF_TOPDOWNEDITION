import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, polygon, circle, ellipse, linear, radial, glow } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';
import { ornament } from './city-ornament.mjs';
import { bayPlan } from './city-tiered.mjs';
import { cypress } from './city-landmark-enni-cole.mjs';

/**
 * The Silver Queen, an Art Deco apartment house in pale silver stone stepping up toward its middle, as a tiered
 * building (`city-tiered.mjs`). The front wings, five storeys either side of the entrance, with curved balconies
 * and black iron railings; out of the middle of the front the taller entrance pavilion: glass doors under a curved
 * marquee (SILVER QUEEN · APARTMENTS, downlights under its rim, a railed terrace on top), a tall glazed bay between
 * silver fins with light strips, a silver fan crest over its cornice. Behind, the tower with balconies over the
 * motor court and down its east side; on it the setback (a roof terrace and a pool), and on that the crown under
 * a big fan crest, searchlights at night from its corners. In the L between tower and wing the motor court (fan-laid
 * setts, the bays, hers 949 in the middle, parterres, the fountain), its drive down to the pavement; in front the
 * forecourt: pale paving and steps, urns of white flowers, lavender in clipped box, lantern piers, cypresses by the
 * door and the monument sign on the lawn.
 * The look is the `silver_queen` section of `data/city-landmarks.json`; the classic is `legacy/buildings/silver-queen-deco.js`
 * (with the court from `legacy/buildings/silver-queen.js`).
 */
const LOOK = LANDMARKS.silver_queen, P = LOOK.plan, Z = LOOK.z, S = LOOK.stone, C = LOOK.colors, T = LOOK.court_colors, G = P.ground, ST = P.storey, TAU = Math.PI * 2;
const O = ornament(S);
const pathOf = pts => polygon(pts);
const disc = (x, y, r) => [['move', x + r, y], circle(x, y, r), ['close']];
const ring = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + Math.cos(-i * TAU / n) * r, cy + Math.sin(-i * TAU / n) * r]);
const glow_ = (art, x, y, r, rgb, alpha) => { if (alpha > .003) glow(art, x, y, r, rgb, 0, { alpha: Math.min(1, alpha) }); };
/** A box with its corners rounded r, as a canvas roundRect. */
function rounded(x, y, w, h, r) {
    const q = Math.PI / 2;
    return [['move', x + r, y], ['line', x + w - r, y], ellipse(x + w - r, y + r, r, r, 0, -q, 0), ['line', x + w, y + h - r], ellipse(x + w - r, y + h - r, r, r, 0, 0, q), ['line', x + r, y + h], ellipse(x + r, y + h - r, r, r, 0, q, 2 * q), ['line', x, y + r], ellipse(x + r, y + r, r, r, 0, 2 * q, 3 * q), ['close']];
}
/** Many specks as a few paths: one path of thousands of crossing shapes fills far slower. */
function specks(art, list, colour) { for (let i = 0; i < list.length; i += 1500) art.fill(list.slice(i, i + 1500), colour); }
const half = (x, y, r) => [['move', x - r, y], ellipse(x, y, r, r, 0, Math.PI, 0), ['close']];

/* ---------------- wall strips (x along the plan from its first corner, y down from the tier's top) ---------------- */

const edgesOf = t => t.mitre.map((m, i) => m && { ...m, i, a: t.poly[i], b: t.poly[(i + 1) % t.poly.length] }).filter(Boolean);
/** The floors of a tier: the z each storey stands on (from the ground floor's top, or the tier's foot). */
function floorsOf(t) { const out = []; for (let f = t.z0 === 0 ? G : t.z0; f + ST <= t.z1 - 4; f += ST) out.push(f); return out; }
/** A bay's middle on an edge, in the building's own frame. */
const localOf = (b, e, along) => [e.a[0] + (e.b[0] - e.a[0]) * along / e.L - b.x, e.a[1] + (e.b[1] - e.a[1]) * along / e.L - b.y];

/** A Deco fan: petals radiating up from (cx, by) to radius R, a half-disc at the hub, a ring round it. */
function fan(c, cx, by, R, fill, line, n = 7) {
    const w = Math.max(.25, R * .05), petals = [];
    for (let i = 0; i < n; i++) {
        const a0 = Math.PI + (i + .12) * Math.PI / n, a1 = Math.PI + (i + .88) * Math.PI / n, am = (a0 + a1) / 2, r0 = R * .34, r1 = R * .9;
        petals.push(...polygon([[cx + Math.cos(a0) * r0, by + Math.sin(a0) * r0], [cx + Math.cos(a0) * r1 * .86, by + Math.sin(a0) * r1 * .86], [cx + Math.cos(am) * r1, by + Math.sin(am) * r1], [cx + Math.cos(a1) * r1 * .86, by + Math.sin(a1) * r1 * .86], [cx + Math.cos(a1) * r0, by + Math.sin(a1) * r0]]));
    }
    c.stroke([['move', cx - R, by], ellipse(cx, by, R, R, 0, Math.PI, 0)], line, w);
    c.paint(petals, { fill, stroke: line, stroke_width: w });
    c.paint(half(cx, by, R * .26), { fill, stroke: line, stroke_width: w });
}
/** A fluted pier from y0 to y1 at x, w wide: a lit edge, a shadowed one, two flutes; a stepped Deco cap. */
function pier(d, x, w, y0, y1) {
    d.fill(rect(x, y0, w, y1 - y0), S.stone_lt);
    d.fill(rect(x, y0, .45, y1 - y0), 'rgba(255, 255, 255, 0.5)'); d.fill(rect(x + w - .55, y0, .55, y1 - y0), 'rgba(70, 60, 100, 0.28)');
    d.fill([.36, .64].flatMap(u => rect(x + w * u - .15, y0 + 2, .3, y1 - y0 - 3)), 'rgba(120, 110, 150, 0.35)');
    d.fill(rect(x - .6, y0, w + 1.2, .9), S.stone_hi); d.fill(rect(x - .3, y0 + .9, w + .6, .7), S.stone_mid);
}
/** Pale ashlar over the whole strip: courses, staggered joints, a little grain; the ground floor rusticated. */
function ashlar(d, t, H, L, r) {
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, S.stone_lt], [1, S.stone]]) });
    const joints = []; for (let y = 3.25, k = 0; y < H; y += 3.25, k++) { moveLine(joints, [0, y], [L, y]); for (let x = (k % 2) * 4.5; x < L; x += 9) moveLine(joints, [x, y], [x, y + 3.25]); }
    specks(d, joints, 'transparent'); d.stroke(joints, 'rgba(96, 86, 130, 0.12)', .3);
    const light = [], dark = []; for (let i = 0; i < L * H / 10; i++) (r() < .5 ? light : dark).push(...rect(r() * L, r() * H, .5 + r(), .5));
    specks(d, light, 'rgba(255, 255, 255, 0.08)'); specks(d, dark, 'rgba(90, 80, 120, 0.06)');
    if (t.z0 === 0) {
        const g0 = t.z1 - G, lo = [], hi = [];
        d.fill(rect(0, g0, L, H - g0), S.stone_mid);
        for (let y = g0 + 3.6; y < H - 2.5; y += 3.6) lo.push(...rect(0, y, L, .55)); for (let y = g0 + 4.15; y < H - 2.5; y += 3.6) hi.push(...rect(0, y, L, .3));
        if (lo.length) d.fill(lo, 'rgba(70, 60, 100, 0.26)'); if (hi.length) d.fill(hi, 'rgba(255, 255, 255, 0.35)');
        d.fill(rect(0, H - 2.4, L, 2.4), S.stone_lo); d.fill(rect(0, H - 2.4, L, .35), 'rgba(255, 255, 255, 0.3)');
    }
}

/**
 * A wall of the Silver Queen: the stone, a window in every bay of every storey (french doors where a balcony stands in
 * front of it), a charcoal spandrel under each, fluted piers between the bays, a charcoal attic panel with a silver fan
 * over each bay, tall lobby windows on the ground floor. opt.balc(e, k, n, f, local) says where the balconies are;
 * opt.skip(e, along) leaves a stretch to a special painter; opt.lobby(e, along) leaves out the lobby window.
 */
function wall(d, l, t, H, L, b, opt = {}) {
    const r = classicRandom(opt.seed || 17), Y = z => t.z1 - z;
    ashlar(d, t, H, L, r);
    const floors = floorsOf(t), top = floors.length ? floors[floors.length - 1] + ST : t.z0 === 0 ? G : t.z0, ground = t.z0 === 0;
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const n = Math.max(1, Math.round(e.L / P.bay)), bw = e.L / n;
        for (let k = 0; k < n; k++) {
            const along = (k + .5) * bw, cx = e.u0 + along;
            if (opt.skip && opt.skip(e, along)) continue;
            const loc = localOf(b, e, along);
            for (const f of floors) {
                if (opt.balc && opt.balc(e, k, n, f, loc)) O.window(d, l, cx - 8.5, Y(f + 11.4), cx + 8.5, Y(f + .5), r() < .62, r, false);   // french doors out to it
                else {
                    O.window(d, l, cx - 9.5, Y(f + 10.6), cx + 9.5, Y(f + 3), r() < .5, r, false);
                    d.fill(rect(cx - 9.5, Y(f + 2.6), 19, 1.8), C.char);
                    d.fill([...rect(cx - 9.5, Y(f + 2.6), 19, .3), ...rect(cx - 1.5, Y(f + 2.2), 3, .3)], C.silver);
                }
            }
            if (ground && !(opt.lobby && opt.lobby(e, along))) O.window(d, l, cx - 11, Y(G - 3.5), cx + 11, Y(4), r() < .75, r, true);   // tall lobby windows
            if (top < t.z1 - 5) {                                                                     // the attic: a fan over each bay
                const y0 = Y(t.z1 - 2.2), y1 = Y(top + 1.2), x0 = cx - bw / 2 + 3, x1 = cx + bw / 2 - 3;
                d.fill(rect(x0, y0, x1 - x0, y1 - y0), C.char); d.fill(rect(x0, y0, x1 - x0, .4), C.char_hi);
                fan(d, cx, y1 - .6, Math.min(y1 - y0 - 1.2, bw * .3), C.silver, C.silver_lo);
                l.fill(rect(x0, y1 - .8, x1 - x0, .8), 'rgba(210, 196, 255, 0.22)');
            }
        }
        for (let k = 0; k <= n; k++) {                                                                // the piers, wider at the corners
            const w = k === 0 || k === n ? 4.5 : 3.2, x = Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + k * bw - w / 2));
            pier(d, x, w, top < t.z1 - 5 ? Y(t.z1 - 2.2) : 0, ground ? Y(G) : H);
            if (ground && opt.uplights) l.paint(polygon([[x + w / 2 - 1.5, Y(G)], [x - 5, Y(G + 26)], [x + w + 5, Y(G + 26)], [x + w / 2 + 1.5, Y(G)]]),
                { fill: linear([0, Y(G)], [0, Y(G + 26)], [[0, 'rgba(255, 226, 180, 0.55)'], [1, 'rgba(255, 226, 180, 0)']]) });
        }
    }
}

/** The pavilion's front: the glass doors with sconces either side, the tall glazed bay between silver fins and their light strips, a fan over it. */
function pavilion(d, l, t, H, L, b) {
    const Y = z => t.z1 - z, front = edgesOf(t).find(e => e.ny > .99), isFront = e => !!front && e.i === front.i;
    wall(d, l, t, H, L, b, { seed: 71, skip: isFront, lobby: isFront });
    if (!front) return;
    const cx = front.u0 + front.L / 2, r = classicRandom(73);
    for (const s of [-1, 1]) for (const f of floorsOf(t)) O.window(d, l, cx + s * 41 - 3.5, Y(f + 10.4), cx + s * 41 + 3.5, Y(f + 2.6), r() < .5, r, false);
    // the bay: a charcoal recess, glass in a grid of mullions, the floors inside lit warm, a chandelier at the top
    const b0 = Y(G + 12), b1 = Y(Z.pavilion - 10), bx0 = cx - 21, bx1 = cx + 21;
    d.fill(rect(bx0 - 2, b1 - 1.5, bx1 - bx0 + 4, b0 - b1 + 3), C.char);
    d.paint(rect(bx0, b1, bx1 - bx0, b0 - b1), { fill: linear([bx0, b1], [bx1, b0], [[0, '#3a3a4e'], [.5, '#4a4458'], [1, '#2a2a38']]) });
    d.fill(polygon([[bx0, b1], [bx0 + 18, b1], [bx0, b1 + 40]]), 'rgba(214, 222, 240, 0.12)');
    l.paint(rect(bx0, b1, bx1 - bx0, b0 - b1), { fill: linear([0, b1], [0, b0], [[0, 'rgba(255, 214, 150, 0.95)'], [1, 'rgba(255, 190, 110, 0.75)']]) });
    const chandelier = (n, rx, ry, y, lit, day, s1, s2) => { const a = [], c = []; for (let k = 0; k < n; k++) { const t2 = k / (n - 1) * Math.PI, px = cx + Math.cos(t2) * rx, py = y + Math.sin(t2) * ry; a.push(...rect(px - s1 / 2, py - s1 / 2, s1, s1)); c.push(...rect(px - s2 / 2, py - s2 / 2, s2, s2)); } l.fill(a, lit); d.fill(c, day); };
    chandelier(14, 9, 3, b1 + 10, '#fff6dc', '#e7cf9e', 1.1, .8);
    const grid = []; for (let k = 1; k < 5; k++) grid.push(...rect(bx0 + (bx1 - bx0) * k / 5 - .35, b1, .7, b0 - b1)); for (let z = G + 12 + ST; z < Z.pavilion - 10; z += ST) grid.push(...rect(bx0, Y(z) - .5, bx1 - bx0, 1));
    d.fill(grid, C.iron); l.fill(grid, 'rgba(40, 24, 10, 0.75)');
    // the fins either side, a light strip down each
    const fy0 = Y(Z.pavilion - 3), fh = Y(G + 10) - fy0, sy0 = Y(Z.pavilion - 4), sh = Y(G + 11) - sy0;
    for (const s of [-1, 1]) {
        const x = cx + s * 26 - 2.5;
        d.fill(rect(x, fy0, 5, fh), C.silver); d.fill(rect(x, fy0, 1, fh), C.silver_hi); d.fill(rect(x + 4.2, fy0, .8, fh), C.silver_lo); d.fill(rect(x + 2, sy0, 1, sh), '#c8c4d6');
        l.fill(rect(x + 1.9, sy0, 1.2, sh), 'rgba(246, 240, 255, 1)');
        l.paint(rect(x - 4, sy0, 13, sh), { fill: linear([x - 4, 0], [x + 9, 0], [[0, 'rgba(200, 180, 255, 0)'], [.5, 'rgba(220, 205, 255, 0.4)'], [1, 'rgba(200, 180, 255, 0)']]) });
    }
    fan(d, cx, Y(Z.pavilion - 9.2), 7.5, C.silver, C.silver_lo, 9);
    l.fill(half(cx, Y(Z.pavilion - 9.2), 7.5), 'rgba(230, 220, 255, 0.35)');
    // the ground floor: piers, the glass doors, the chandelier through them, sconces either side
    const g0 = Y(G), gb = H - 2.4, dx0 = cx - 15, dx1 = cx + 15, dt = Y(G - 3);
    d.fill(rect(dx0 - 2, dt - 2, dx1 - dx0 + 4, gb - dt + 2), C.char);
    d.paint(rect(dx0, dt, dx1 - dx0, gb - dt), { fill: linear([0, dt], [0, gb], [[0, '#4b4250'], [1, '#5c4e46']]) });
    l.paint(rect(dx0, dt, dx1 - dx0, gb - dt), { fill: linear([0, dt], [0, gb], [[0, 'rgba(255, 220, 160, 0.9)'], [1, 'rgba(255, 196, 120, 1)']]) });
    chandelier(12, 6, 2, dt + 4, '#fff8e4', '#e9d6a8', 1, .8);
    const frames = [...rect(cx - .5, dt, 1, gb - dt), ...rect(dx0, dt + 5, dx1 - dx0, .8), ...rect(dx0, dt, .8, gb - dt), ...rect(dx1 - .8, dt, .8, gb - dt)];
    for (const s of [-1, 1]) frames.push(...rect(cx + s * 7.5 - .3, dt + 5, .6, gb - dt - 5), ...rect(cx + s * 11 - .3, dt + 8, .6, 7));
    d.fill(frames, C.iron); l.fill(frames, 'rgba(40, 24, 10, 0.8)');
    for (const s of [-1, 1]) {
        pier(d, cx + s * 21 - 3, 6, g0, gb);
        const x = cx + s * 30 - 1;
        d.fill(rect(x, dt + 3, 2, 9), '#5c4a35'); d.fill(rect(x + .4, dt + 4, 1.2, 7), '#c8bfa9');
        l.paint(rect(x - 8, dt - 1.5, 18, 18), { fill: radial([x + 1, dt + 7.5], 0, [x + 1, dt + 7.5], 9, [[0, 'rgba(255, 238, 205, 1)'], [1, 'rgba(255, 196, 130, 0)']]) });
        l.fill(rect(x + .4, dt + 4, 1.2, 7), 'rgba(255, 250, 236, 1)');
    }
}
/** The crown's walls: one tall storey; on its front a slot window between fins, plain windows round the rest. */
function crown(d, l, t, H, L, b) {
    const Y = z => t.z1 - z, front = edgesOf(t).find(e => e.ny > .99);
    wall(d, l, t, H, L, b, { seed: 91, skip: (e, along) => !!front && e.i === front.i && Math.abs(along - e.L / 2) < 30 });
    if (!front) return;
    const cx = front.u0 + front.L / 2, z0 = t.z0 + 2, z1 = t.z0 + ST + 1;
    d.fill(rect(cx - 12, Y(z1 + 1), 24, Y(z0) - Y(z1 + 1)), C.char);
    l.paint(rect(cx - 10, Y(z1), 20, Y(z0) - Y(z1)), { fill: linear([0, Y(z1)], [0, Y(z0)], [[0, 'rgba(255, 210, 150, 0.85)'], [1, 'rgba(255, 186, 110, 0.7)']]) });
    d.fill(rect(cx - 10, Y(z1), 20, Y(z0) - Y(z1)), '#3d3a4c');
    d.fill([1, 2, 3].flatMap(k => rect(cx - 10 + 5 * k - .3, Y(z1), .6, Y(z0) - Y(z1))), C.iron);
    for (const s of [-1, 1]) {
        const x = cx + s * 16 - 2;
        d.fill(rect(x, 0, 4, Y(t.z0)), C.silver); d.fill(rect(x, 0, .8, Y(t.z0)), C.silver_hi); l.fill(rect(x + 1.6, 1, .9, Y(t.z0) - 2), 'rgba(246, 240, 255, 1)');
    }
}
/** The marquee: a charcoal band round its curve, SILVER QUEEN in silver capitals over APARTMENTS, downlights along its foot. */
function marquee(d, l, t, H, L) {
    const edges = edgesOf(t).filter(e => e.ny > -.9), u0 = edges.length ? Math.min(...edges.map(e => e.u0)) : 0, u1 = edges.length ? Math.max(...edges.map(e => e.u0 + e.L)) : L, cx = (u0 + u1) / 2;
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.char_hi], [.2, C.char], [1, '#1f1d27']]) });
    d.fill([...rect(0, .6, L, .7), ...rect(0, H - 1.6, L, .6)], C.silver); d.fill(rect(0, .6, L, .25), C.silver_hi);
    const big = { font: { family: LOOK.serif, size: 6.4, weight: 600, letter_spacing: .5 }, align: 'center', baseline: 'middle' }, small = { font: { family: LOOK.serif, size: 2.6, weight: 500, letter_spacing: 1.1 }, align: 'center', baseline: 'middle' };
    d.text('SILVER QUEEN', cx + .2, H * .4 + .3, big, { fill: 'rgba(0, 0, 0, 0.5)' });
    d.text('SILVER QUEEN', cx, H * .4, big, { fill: C.silver_hi }); d.text('APARTMENTS', cx, H * .76, small, { fill: C.silver_hi });
    const halo = { color: 'rgba(220, 205, 255, 1)', blur: 3, offset: [0, 0] };
    l.text('SILVER QUEEN', cx, H * .4, big, { fill: 'rgba(250, 247, 255, 0.95)', shadow: halo }); l.text('APARTMENTS', cx, H * .76, small, { fill: 'rgba(250, 247, 255, 0.95)', shadow: halo });
    const lines = [...rect(cx - 17, H * .76 - .15, 8, .3), ...rect(cx + 9, H * .76 - .15, 8, .3)];
    d.fill(lines, C.silver); l.fill(lines, 'rgba(230, 220, 255, 0.7)');
    const fittings = [], lights = []; for (let u = u0 + 4; u < u1 - 2; u += 7) { fittings.push(...rect(u - .5, H - 1, 1, .8)); lights.push(...rect(u - .6, H - 1.1, 1.2, 1)); }
    if (fittings.length) { d.fill(fittings, '#b8b2c4'); l.fill(lights, 'rgba(255, 246, 228, 1)'); }
}
const plain = (fill, band) => (d, l, t, H, L) => { d.fill(rect(0, 0, L, H), fill); if (band) d.fill(rect(0, 0, L, .8), band); };
/** The monument sign on the lawn: a pale stone wall with the name carved and lit. */
function monument(d, l, t, H, L) {
    ashlar(d, { z0: 1, z1: 1 }, H, L, classicRandom(5));
    const front = edgesOf(t).find(e => e.ny > .99); if (!front) return;
    const cx = front.u0 + front.L / 2, w = front.L - 8;
    d.fill(rect(cx - w / 2, 2, w, H - 4), S.stone_mid); d.stroke(rect(cx - w / 2 + 1, 3, w - 2, H - 6), 'rgba(120, 110, 150, 0.6)', .4);
    const big = { font: { family: LOOK.serif, size: 4.2, weight: 600 }, align: 'center', baseline: 'middle' }, small = { font: { family: LOOK.serif, size: 1.9, weight: 500, letter_spacing: .7 }, align: 'center', baseline: 'middle' };
    d.text('SILVER QUEEN', cx, H * .5, big, { fill: '#3a3646' }); d.text('APARTMENTS', cx, H * .78, small, { fill: '#3a3646' });
    const halo = { color: 'rgba(255, 220, 170, 1)', blur: 2, offset: [0, 0] };
    l.text('SILVER QUEEN', cx, H * .5, big, { fill: 'rgba(255, 240, 214, 0.6)', shadow: halo }); l.text('APARTMENTS', cx, H * .78, small, { fill: 'rgba(255, 240, 214, 0.6)', shadow: halo });
    fan(d, cx, H * .32, 2.6, '#4a465a', '#2c2a36', 5);
}

/* ---------------- roofs (world coordinates, in each tier's plane) ---------------- */

/** A terrace roof: pale pavers laid on the diagonal, a silver-capped parapet, planters along it (lit: their little lamps). */
function terrace(art, glow, t, opt = {}) {
    const [x0, y0, x1, y1] = t.box, r = classicRandom(opt.seed || 3), path = pathOf(t.poly), pw = opt.pw || 7;
    if (glow) {
        if (opt.lamps) for (let x = x0 + 26; x < x1 - 20; x += 52) art.paint(rect(x - 14, y1 - 26, 28, 28), { fill: radial([x, y1 - 12], 0, [x, y1 - 12], 14, [[0, 'rgba(255, 226, 170, 0.5)'], [1, 'rgba(255, 210, 150, 0)']]) });
        return;
    }
    art.fill(path, opt.paving || '#6a6479');
    const diag = []; for (let s = -(y1 - y0); s < x1 - x0; s += 12) { moveLine(diag, [x0 + s, y0], [x0 + s + (y1 - y0), y1]); moveLine(diag, [x0 + s + (y1 - y0), y0], [x0 + s, y1]); }
    const light = [], dark = []; for (let i = 0; i < (x1 - x0) * (y1 - y0) / 40; i++) (r() < .5 ? light : dark).push(...rect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1.2, 1.2));
    art.enter().clip(path); art.stroke(diag, 'rgba(40, 30, 70, 0.22)', .7); specks(art, light, 'rgba(255, 255, 255, 0.07)'); specks(art, dark, 'rgba(60, 50, 90, 0.06)'); art.leave();
    if (opt.planters) for (let x = x0 + 14; x < x1 - 22; x += 52) {
        art.fill(rect(x, y1 - 18, 24, 9), '#4e4a5c'); art.fill([...disc(x + 6, y1 - 14, 4.5), ...disc(x + 18, y1 - 14, 4.5)], '#2f4a32');
        art.fill([...disc(x + 5, y1 - 15.5, 1.8), ...disc(x + 17, y1 - 15.5, 1.8)], 'rgba(160, 210, 150, 0.35)');
    }
    art.stroke(path, S.stone_lt, pw);
    art.enter().clip(path).stroke(path, C.silver, pw + 2).stroke(path, S.stone_lt, pw).leave();
    art.stroke(path, 'rgba(40, 30, 60, 0.35)', .8);
}
/** A clipped ball of box: three greens, lit from the upper left. */
const ball = (art, x, y) => { for (const [k, colour] of [[9, '#2f5a36'], [6, '#3f7a4a'], [3, '#5a9a62']]) art.fill(disc(x - (9 - k) * .3, y - (9 - k) * .3, k), colour); };
/** A wing's roof garden: the terrace, a lawn down the middle with clipped balls, a pergola and loungers at the front. */
function wingRoof(seed) {
    return (art, glow, t) => {
        const [x0, y0, x1, y1] = t.box, w = x1 - x0;
        terrace(art, glow, t, { seed, planters: true, lamps: true, paving: '#5f596d' });
        if (glow) { for (let y = y0 + 90; y < y1 - 120; y += 70) art.paint(rect(x0, y - 22, w, 44), { fill: radial([(x0 + x1) / 2, y], 0, [(x0 + x1) / 2, y], 22, [[0, 'rgba(255, 220, 160, 0.4)'], [1, 'rgba(255, 210, 150, 0)']]) }); return; }
        art.paint(rounded(x0 + 24, y0 + 40, w - 48, y1 - y0 - 170, 8), { fill: '#3d5a3c', stroke: '#7c768a', stroke_width: 3 });
        for (let y = y0 + 70; y < y1 - 140; y += 46) for (const x of [x0 + 42, x1 - 42]) { art.fill(disc(x + 1.5, y + 2, 9), 'rgba(0, 0, 0, 0.3)'); ball(art, x, y); }
        art.fill(rect((x0 + x1) / 2 - 5, y0 + 40, 10, y1 - y0 - 170), '#a49eb0');
        const py = y1 - 118;
        art.fill(rect(x0 + 20, py + 3, w - 40, 54), 'rgba(0, 0, 0, 0.25)');
        art.fill([x0 + 20, x1 - 24].flatMap(x => [py, py + 50].flatMap(y => rect(x, y, 4, 4))), '#2c2a36');
        const slats = []; for (let x = x0 + 24; x < x1 - 24; x += 7) slats.push(...rect(x, py, 2.5, 54)); art.fill(slats, '#c4bfcf');
        art.fill([...rect(x0 + 18, py - 1, w - 36, 3), ...rect(x0 + 18, py + 52, w - 36, 3)], '#3a3746');
        const seats = [], backs = []; for (let x = x0 + 30; x < x1 - 40; x += 30) { seats.push(...rect(x, py + 64, 20, 9)); backs.push(...rect(x, py + 64, 20, 1.4)); }
        if (seats.length) { art.fill(seats, '#c4bfcf'); art.fill(backs, C.char); }
    };
}
/** The setback's roof: a terrace with the pool (lit violet at night), loungers, a lawn with a path. */
function setbackRoof(art, glow, t) {
    const [x0, y0] = t.box, px = x0 + 360, py = y0 + 40, pw = 220, ph = 120;
    if (glow) {
        art.paint(rect(px - 40, py - 40, pw + 80, ph + 80), { fill: radial([px + pw / 2, py + ph / 2], 10, [px + pw / 2, py + ph / 2], pw * .7, [[0, 'rgba(160, 140, 255, 0.45)'], [1, 'rgba(120, 100, 255, 0)']]) });
        art.stroke(rect(px + 1, py + 1, pw - 2, ph - 2), 'rgba(230, 220, 255, 0.55)', 1.5);
        return;
    }
    terrace(art, glow, t, { seed: 41, pw: 6 });
    art.fill(rounded(x0 + 30, y0 + 30, 280, 150, 10), '#3d5a3c');
    art.fill(Array.from({ length: 60 }, (_, i) => disc(x0 + 40 + (i * 53 % 260), y0 + 40 + (i * 37 % 130), 2)).flat(), 'rgba(120, 170, 110, 0.18)');
    art.fill(rect(x0 + 160, y0 + 30, 16, 150), '#a29cad');
    art.fill(rect(px - 8, py - 8, pw + 16, ph + 16), '#a49eb0');
    art.paint(rect(px, py, pw, ph), { fill: linear([px, py], [px + pw, py + ph], [[0, '#4a58b0'], [1, '#2b2c7a']]) });
    const lanes = []; for (let y = py + 30; y < py + ph; y += 30) moveLine(lanes, [px + 8, y], [px + pw - 8, y]); art.stroke(lanes, 'rgba(230, 236, 255, 0.35)', 1);
    fan(art, px + pw / 2, py + ph - 2, 26, 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.18)', 9);
    const seats = [], backs = []; for (let x = px + 10; x < px + pw - 20; x += 36) { seats.push(...rect(x, py + ph + 18, 22, 10)); backs.push(...rect(x, py + ph + 18, 22, 1.5)); }
    art.fill(seats, '#c4bfcf'); art.fill(backs, C.char);
}
/** A charcoal roof with a silver rim and a hexagon skylight (the Silver Queen's hexagon), lit from below at night. */
function darkRoof({ hex: R = 0, dy = 0, pw = 5 } = {}) {
    return (art, glow, t) => {
        const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + dy;
        const hex = polygon(Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R * .92]; }));
        if (glow) { if (R) art.paint(hex, { fill: radial([cx, cy], 0, [cx, cy], R, [[0, 'rgba(255, 220, 170, 0.5)'], [1, 'rgba(200, 170, 255, 0.25)']]) }); return; }
        const path = pathOf(t.poly);
        art.paint(path, { fill: linear([x0, y0], [x1, y1], [[0, '#3d3a4b'], [1, '#2a2835']]) });
        const lines = []; for (let x = x0 + 10; x < x1; x += 14) moveLine(lines, [x, y0], [x, y1]);
        art.enter().clip(path).stroke(lines, 'rgba(200, 190, 230, 0.07)', .8).leave();
        art.stroke(path, S.stone_lt, pw); art.stroke(path, C.silver_lo, .8);
        if (R) {
            art.paint(hex, { fill: '#1a1830', stroke: C.silver, stroke_width: 2.5 });
            const spokes = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; moveLine(spokes, [cx, cy], [cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
            art.enter().clip(hex).stroke(spokes, 'rgba(200, 190, 240, 0.4)', .8).fill(rect(cx - R, cy - R, R, R * .8), 'rgba(220, 230, 255, 0.12)').leave();
        }
    };
}
/** The marquee's roof, the sign the street sees from above: SILVER QUEEN in silver capitals over APARTMENTS, lit at night. */
function marqueeRoof(art, glow, t) {
    const [x0, y0, , y1] = t.box, cx = (t.box[0] + t.box[2]) / 2, cy = y0 + 13, path = pathOf(t.poly);
    const big = { font: { family: LOOK.serif, size: 14, weight: 600, letter_spacing: 1.2 }, align: 'center', baseline: 'middle' }, small = { font: { family: LOOK.serif, size: 5.2, weight: 600, letter_spacing: 2.4 }, align: 'center', baseline: 'middle' };
    const words = (dx, dy, fill) => { art.text('SILVER QUEEN', cx + dx, cy + dy, big, fill); art.text('APARTMENTS', cx + dx, cy + 11 + dy, small, fill); };
    if (glow) words(0, 0, { fill: 'rgba(250, 247, 255, 0.95)', shadow: { color: 'rgba(214, 196, 255, 1)', blur: 6, offset: [0, 0] } });
    else {
        art.paint(path, { fill: linear([0, y0], [0, y1], [[0, '#3a3746'], [1, '#2a2834']]), stroke: C.silver, stroke_width: 3 }); art.stroke(path, C.silver_lo, .8);
        words(.6, .8, { fill: 'rgba(0, 0, 0, 0.55)' }); words(0, 0, { fill: C.silver_hi });
    }
    art.fill([...rect(cx - 44, cy + 10.6, 22, .8), ...rect(cx + 22, cy + 10.6, 22, .8)], glow ? 'rgba(230, 220, 255, 0.8)' : C.silver);
}
const darkTop = colour => (art, glow, t) => { if (!glow) art.fill(pathOf(t.poly), colour); };

/* ---------------- what stands on the tiers, drawn live ---------------- */

const BALCONIES = new WeakMap();
/** Where a tier's balconies stand (the rule says), each a curved slab: its outline, floor height, the wall's normal, its middle. */
function balconiesOf(t, b, rule) {
    if (BALCONIES.has(t)) return BALCONIES.get(t);
    const out = [];
    for (const m of edgesOf(t)) {
        if (m.hidden) continue;
        const n = Math.max(1, Math.round(m.L / P.bay)), bw = m.L / n, dx = (m.b[0] - m.a[0]) / m.L, dy = (m.b[1] - m.a[1]) / m.L;
        for (let k = 0; k < n; k++) for (const f of floorsOf(t)) {
            const along = (k + .5) * bw;
            if (!rule(m, k, n, f, localOf(b, m, along))) continue;
            const cx = m.a[0] + dx * along, cy = m.a[1] + dy * along, pts = [];
            for (let j = 0; j <= 8; j++) { const th = Math.PI - j * Math.PI / 8; pts.push([cx + dx * 14 * Math.cos(th) + m.nx * 10 * Math.sin(th), cy + dy * 14 * Math.cos(th) + m.ny * 10 * Math.sin(th)]); }
            out.push({ pts, z: f, nx: m.nx, ny: m.ny, cx, cy });
        }
    }
    BALCONIES.set(t, out);
    return out;
}
/** A tier's balconies: the slabs' fronts, their floors and the railings, each in one fill or stroke; at night the railings cut dark out of the light behind them. */
function balconies(rule) {
    return (art, glow, t, b, view) => {
        const [camX, camY] = view.camera, vis = balconiesOf(t, b, rule).filter(B => (camX - B.cx) * B.nx + (camY - B.cy) * B.ny > 0);
        if (!vis.length) return;
        const at = (x, y, z) => b.at(view, x, y, z), rails = [], tops = [];
        for (const B of vis) {
            const zt = B.z + 4.2;
            B.pts.forEach(([x, y], j) => (glow ? rails : tops).push([j ? 'line' : 'move', ...at(x, y, zt)]));
            B.pts.forEach(([x, y], j) => rails.push([j ? 'line' : 'move', ...at(x, y, B.z + 2.1)]));
            for (let j = 0; j < B.pts.length - 1; j++) {
                const [ax, ay] = B.pts[j], [bx, by] = B.pts[j + 1], nb = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 3.2));
                for (let q = j ? 1 : 0; q <= nb; q++) { const u = q / nb, x = ax + (bx - ax) * u, y = ay + (by - ay) * u; moveLine(rails, at(x, y, B.z), at(x, y, zt)); }
            }
        }
        if (glow) { art.enter({}, { blend: 'destination-out', opacity: .85 }).stroke(rails, '#000', .75).leave(); return; }
        const fronts = [], floors = [];
        for (const B of vis) {
            for (let j = 0; j < B.pts.length - 1; j++) {
                const [ax, ay] = B.pts[j], [bx, by] = B.pts[j + 1], mx = (ax + bx) / 2, my = (ay + by) / 2;
                if ((camX - mx) * (mx - B.cx) + (camY - my) * (my - B.cy) <= 0) continue;
                fronts.push(...pathOf([at(ax, ay, B.z - 1.8), at(bx, by, B.z - 1.8), at(bx, by, B.z), at(ax, ay, B.z)]));
            }
            floors.push(...pathOf(B.pts.map(([x, y]) => at(x, y, B.z))));
        }
        if (fronts.length) art.paint(fronts, { fill: '#a6a2b2', stroke: 'rgba(60, 50, 90, 0.45)', stroke_width: .6 });
        art.fill(floors, '#69637a'); art.stroke(rails, '#26232e', .6); art.stroke(tops, C.silver, .9);
    };
}
/** A fan crest standing on a front edge: silver petals in the wall's plane from z0 up, R high, its middle at (x, wy) in the plan; at night the petals' edges glow. */
function crest(x, wy, z0, R, n = 9) {
    return (art, glow, t, b, view) => {
        const cx = b.x + x, Y = b.y + wy, at = (u, h) => b.at(view, cx + u, Y, z0 + h), petals = [];
        for (let i = 0; i < n; i++) {
            const a0 = Math.PI - (i + .1) * Math.PI / n, a1 = Math.PI - (i + .9) * Math.PI / n, am = (a0 + a1) / 2, r0 = R * .3, r1 = R * (i % 2 ? .84 : 1);
            petals.push(...pathOf([[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a0) * r1 * .84, Math.sin(a0) * r1 * .84], [Math.cos(am) * r1, Math.sin(am) * r1], [Math.cos(a1) * r1 * .84, Math.sin(a1) * r1 * .84], [Math.cos(a1) * r0, Math.sin(a1) * r0]].map(([u, h]) => at(u, h))));
        }
        const hub = pathOf(Array.from({ length: 13 }, (_, j) => { const a = Math.PI - j * Math.PI / 12; return at(Math.cos(a) * R * .24, Math.sin(a) * R * .24); }));
        if (glow) {
            art.stroke(petals, 'rgba(236, 228, 255, 0.85)', .9); art.fill(hub, 'rgba(255, 240, 220, 0.6)');
            const c = at(0, R * .5), k = b.k(view, z0 + R * .5), rr = R * 1.3 * k;
            art.paint(rect(c[0] - rr, c[1] - rr, rr * 2, rr * 2), { fill: radial(c, 0, c, rr, [[0, 'rgba(200, 180, 255, 0.35)'], [1, 'rgba(160, 130, 255, 0)']]) });
            return;
        }
        art.paint(petals, { fill: C.silver, stroke: C.silver_lo, stroke_width: .7 }); art.paint(hub, { fill: C.silver_hi, stroke: C.silver_lo, stroke_width: .7 });
        art.fill(pathOf([at(-R * 1.05, 0), at(R * 1.05, 0), at(R * .95, -1.5), at(-R * .95, -1.5)]), S.stone_lt);
    };
}
/** The marquee's terrace railing, round its curve. */
function marqueeRail(art, glow, t, b, view) {
    if (glow) return;
    const pts = t.poly.slice(0, -1), z0 = t.z1, z1 = t.z1 + 3.6, rail = [];
    pts.forEach(([x, y], j) => rail.push([j ? 'line' : 'move', ...b.at(view, x, y, z1)]));
    for (let j = 0; j < pts.length - 1; j++) {
        const [ax, ay] = pts[j], [bx, by] = pts[j + 1], nb = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2.4));
        for (let q = 0; q <= nb; q++) { const x = ax + (bx - ax) * q / nb, y = ay + (by - ay) * q / nb; moveLine(rail, b.at(view, x, y, z0), b.at(view, x, y, z1)); }
    }
    art.stroke(rail, C.iron, .7);
}
/** A lantern on its stone pier; at night its glow. */
function lantern(art, glow, t, b, view) {
    const [x0, y0, x1, y1] = t.box, x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    if (glow) { const p = b.at(view, x, y, 15.5); glow_(art, p[0], p[1], 12 * b.k(view, 15.5), '255, 226, 176', 1); return; }
    b.prism(art, view, x - 2.6, y - 2.6, x + 2.6, y + 2.6, 13, 18, '#bcb39b', '#2c2a36');
}

/* ---------------- the motor court and the forecourt ---------------- */

/** The court in the L between the tower and the wing (world): its fountain, and its drive down to the pavement. */
function courtOf(b) {
    const x0 = b.x + 350, x1 = b.x + 700, y0 = b.y + 500, y1 = b.y + 896, [dx, dw, dh] = LOOK.court.drive, [fu, fv, fr] = LOOK.court.fountain;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fx: x0 + (x1 - x0) * fu, fy: y0 + (y1 - y0) * fv, fr, drive: { x: x0 + dx, y: y1, w: dw, h: dh } };
}
/** The court: fan-laid granite setts, a plum and gold border, three bays along the wing (hers, 949, in the middle), parterres of violets in clipped box, the fountain's basin. */
function court(c, b) {
    const K = courtOf(b), D = K.drive, H = K.h + D.h, r = classicRandom('sq-court'), X = K.x, Y = K.y, fx = K.fx, fy = K.fy, R = K.fr, dx = D.x - X;
    c.enter().clip([...rect(X, Y, K.w, K.h), ...rect(X + dx, Y + K.h - 1, D.w, D.h + 1)]);
    c.fill(rect(X, Y, K.w, H), '#3c3852');
    const F = 40, tones = ['#57516f', '#4f4967', '#5f5979'], layers = [3, 2, 1].map(() => [[], [], []]), arcs = [], spokes = [];
    for (let j = -1; j * F / 2 < H + F; j++) for (let i = -1; i * F < K.w + F; i++) {
        const cx = X + i * F + (j % 2 ? F / 2 : 0), cy = Y + j * F / 2;
        for (let s = 3; s >= 1; s--) { layers[3 - s][(s + i + j + 300) % 3].push(...half(cx, cy, F * .5 * s / 3 + .5)); arcs.push(['move', cx - F * .5 * s / 3, cy], ellipse(cx, cy, F * .5 * s / 3, F * .5 * s / 3, 0, Math.PI, 0)); }
        for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; moveLine(spokes, [cx + Math.cos(a) * F * .17, cy + Math.sin(a) * F * .17], [cx + Math.cos(a) * F * .5, cy + Math.sin(a) * F * .5]); }
    }
    layers.forEach((layer, n) => { layer.forEach((list, k) => { if (list.length) specks(c, list, tones[k]); }); specks(c, arcs.filter((_, i) => false), '#000'); });
    for (let i = 0; i < arcs.length; i += 1500) c.stroke(arcs.slice(i, i + 1500), 'rgba(30,24,48,0.55)', .7);
    for (let i = 0; i < spokes.length; i += 1500) c.stroke(spokes.slice(i, i + 1500), 'rgba(30,24,48,0.35)', .5);
    const grit = []; for (let i = 0; i < 300; i++) grit.push(...rect(X + r() * K.w, Y + r() * H, 1, 1)); c.fill(grit, 'rgba(255,255,255,0.04)');
    c.leave();
    for (const ex of [dx, dx + D.w - 3]) { c.fill(rect(X + ex, Y + K.h, 3, D.h), T.plum); c.fill(rect(X + ex + 1, Y + K.h, 1, D.h), 'rgba(232, 194, 122, 0.7)'); }
    const bollards = [[dx - 6, K.h + 14], [dx + D.w + 6, K.h + 14], [dx - 6, K.h + D.h - 16], [dx + D.w + 6, K.h + D.h - 16]].map(([x, y]) => [X + x, Y + y]);
    c.fill(bollards.flatMap(([x, y]) => disc(x + 1.5, y + 2, 5)), 'rgba(0,0,0,0.35)'); c.paint(bollards.flatMap(([x, y]) => disc(x, y, 5)), { fill: T.bay, stroke: T.gold, stroke_width: 1.2 }); c.fill(bollards.flatMap(([x, y]) => disc(x, y, 2)), '#f4ecff');
    // the border: plum stone and a gold line, round the open sides
    c.fill([...rect(X, Y, K.w, 9), ...rect(X + K.w - 9, Y, 9, K.h), ...rect(X + dx + D.w, Y + K.h - 7, K.w - dx - D.w, 7), ...rect(X, Y + K.h - 7, dx, 7)], T.plum);
    c.stroke([['move', X, Y + 9.5], ['line', X + K.w - 9.5, Y + 9.5], ['line', X + K.w - 9.5, Y + K.h - 7.5], ['line', X + dx + D.w, Y + K.h - 7.5], ['move', X + dx, Y + K.h - 7.5], ['line', X, Y + K.h - 7.5]], 'rgba(232, 194, 122, 0.7)', 1);
    // the bays along the wing, nose to the wall: guests either side of hers
    [21, 89, 157].forEach((by, i) => {
        const x = X + 6, y = Y + by;
        c.fill(rect(x, y, 108, 68), i === 1 ? 'rgba(45,29,89,0.55)' : 'rgba(45,29,89,0.25)');
        c.stroke([['move', x + 108, y], ['line', x, y], ['line', x, y + 68], ['line', x + 108, y + 68]], T.gold, 2);
        c.enter({ position: [x + 86, y + 34], rotation: -Math.PI / 2 });
        c.text(i === 1 ? '949' : 'GUEST', 0, 0, { font: i === 1 ? { family: 'Georgia, serif', size: 15, weight: 700, style: 'italic' } : { family: 'Georgia, serif', size: 9 }, align: 'center', baseline: 'middle' }, { fill: i === 1 ? 'rgba(232,194,122,0.85)' : 'rgba(207,200,226,0.55)' });
        c.leave();
    });
    // parterres: box hedging round beds of violets and silver leaves
    const bed = (x, y, w, h) => {
        c.fill(rounded(x + 2, y + 3, w, h, 6), 'rgba(0,0,0,0.3)'); c.fill(rounded(x, y, w, h, 6), '#2c4a2e'); c.fill(rounded(x + 5, y + 5, w - 10, h - 10, 3), '#3d2a24');
        const flowers = [[], [], [], []];
        for (let k = 0; k < w * h / 60; k++) { const px = x + 7 + r() * (w - 14), py = y + 7 + r() * (h - 14), v = r(); flowers[v < .45 ? 0 : v < .7 ? 1 : v < .85 ? 2 : 3].push(...disc(px, py, 1.4 + r() * 1.2)); }
        ['#8b5cf6', '#c4b5fd', '#cfd6d0', '#e8c27a'].forEach((colour, k) => { if (flowers[k].length) c.fill(flowers[k], colour); });
        c.stroke(rounded(x + 1, y + 1, w - 2, h - 2, 5), 'rgba(120,170,110,0.45)', 1);
    };
    bed(X + 128, Y + 14, K.w - 150, 20); bed(X + K.w - 40, Y + 46, 26, K.h * .66); bed(X + dx + D.w + 10, Y + K.h - 40, K.w - dx - D.w - 26, 24);
    for (const [tx, ty] of [[X + dx - 16, Y + K.h - 26], [X + K.w - 26, Y + 30]]) { c.fill(disc(tx + 2, ty + 3, 12), 'rgba(0,0,0,0.35)'); c.paint(disc(tx, ty, 12), { fill: T.bay, stroke: T.gold, stroke_width: 1.5 }); ball(c, tx, ty); }
    // the fountain: a travertine rim, a plum mosaic band, the basin
    c.fill(disc(fx + 3, fy + 4, R + 4), 'rgba(0,0,0,0.35)'); c.fill(disc(fx, fy, R + 4), '#d8cfc2');
    const tiles = []; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; moveLine(tiles, [fx + Math.cos(a) * (R - 3), fy + Math.sin(a) * (R - 3)], [fx + Math.cos(a) * (R + 4), fy + Math.sin(a) * (R + 4)]); } c.stroke(tiles, 'rgba(120,100,80,0.5)', .8);
    c.fill(disc(fx, fy, R - 3), T.plum);
    c.paint(disc(fx, fy, R - 7), { fill: radial([fx - 10, fy - 12], 4, [fx, fy], R - 7, [[0, '#6f8fd8'], [1, '#2c2a78']]) });
    c.stroke(disc(fx, fy, R - 3), T.gold, 1);
    c.fill(Array.from({ length: 8 }, (_, k) => disc(fx + Math.cos(k * Math.PI / 4) * (R - 5), fy + Math.sin(k * Math.PI / 4) * (R - 5), 1.6)).flat(), T.gold);
}
/** The fountain's water, live: rings spreading, the tiered bowl, the spill over its lip, the crown finial. */
function fountain(art, glow, t, b, view, time) {
    const K = courtOf(b), fx = K.fx, fy = K.fy;
    if (glow) return;
    art.enter({ matrix: view.plane(b.k(view, t.z1)) });
    const rings = []; for (let k = 0; k < 3; k++) { const ph = (time * .35 + k / 3) % 1, rad = 16 + ph * (K.fr - 24); rings.push(...disc(fx, fy, rad)); }
    art.stroke(rings, 'rgba(220,230,255,0.32)', 1);
    art.fill(disc(fx + 2, fy + 3, 15), 'rgba(0,0,0,0.3)'); art.fill(disc(fx, fy, 15), '#d8cfc2'); art.fill(disc(fx, fy, 12), '#4a5cb0');
    const spill = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + time * .6; spill.push(...disc(fx + Math.cos(a) * 15, fy + Math.sin(a) * 15, 1.1 + .5 * Math.sin(time * 5 + k))); } art.fill(spill, 'rgba(230,240,255,0.55)');
    art.fill(polygon([[fx - 6, fy + 3], [fx - 6, fy - 4], [fx - 3, fy - 1], [fx, fy - 7], [fx + 3, fy - 1], [fx + 6, fy - 4], [fx + 6, fy + 3]]), T.gold); art.fill(disc(fx, fy - 7, 1.4), T.gold_hi);
    art.leave();
}
/** The forecourt: pale polished slabs, the steps to the door, lawns and beds of lavender and white flowers, urns, the lantern piers' footings. */
function forecourt(c, b) {
    const X = x => b.x + x, Y = y => b.y + y, r = classicRandom('sqd-forecourt');
    c.fill(rect(X(60), Y(880), 230, 150), '#6b6578');
    const slabs = [[], []]; for (let y = 880; y < 1030; y += 15) for (let x = 60; x < 290; x += 23) slabs[r() < .5 ? 0 : 1].push(...rect(X(x) + .5, Y(y) + .5, 22, 14));
    c.fill(slabs[0], '#7a748a'); c.fill(slabs[1], '#716b80');
    const sheen = []; for (let i = 0; i < 30; i++) sheen.push(...rect(X(60 + r() * 230), Y(880 + r() * 150), 6 + r() * 12, .8)); c.fill(sheen, 'rgba(255, 255, 255, 0.12)');
    c.stroke(rect(X(64), Y(884), 222, 150), C.silver_lo, 1);
    fan(c, X(175), Y(1000), 26, 'rgba(110, 100, 140, 0.18)', 'rgba(110, 100, 140, 0.4)', 9);
    for (let k = 2; k >= 0; k--) { c.fill(rect(X(118 - k * 8), Y(896), 114 + k * 16, 9 + k * 6), ['#918b9f', '#857f94', '#797388'][k]); c.fill(rect(X(118 - k * 8), Y(905 + k * 6), 114 + k * 16, .8), 'rgba(70, 60, 100, 0.3)'); }
    const bed = (x, y, w, h) => {
        c.fill(rounded(X(x) + 1.5, Y(y) + 2, w, h, 5), 'rgba(0, 0, 0, 0.25)'); c.fill(rounded(X(x), Y(y), w, h, 5), '#2c4a2e'); c.fill(rounded(X(x) + 4, Y(y) + 4, w - 8, h - 8, 3), '#3a2e2c');
        const flowers = [[], [], [], []];
        for (let k = 0; k < w * h / 18; k++) { const v = r(); flowers[v < .55 ? 0 : v < .75 ? 1 : v < .9 ? 2 : 3].push(...disc(X(x + 6 + r() * (w - 12)), Y(y + 6 + r() * (h - 12)), 1.1 + r() * 1.1)); }
        ['#9a7ce0', '#c3b2f2', '#f4f1fa', '#7aa070'].forEach((colour, k) => { if (flowers[k].length) c.fill(flowers[k], colour); });
        c.stroke(rounded(X(x) + 1, Y(y) + 1, w - 2, h - 2, 4), 'rgba(130, 180, 120, 0.4)', 1);
    };
    c.fill([...rect(X(-40), Y(880), 100, 150), ...rect(X(290), Y(880), 100, 150)], '#3f6a3a');
    const grass = []; for (let i = 0; i < 300; i++) { const x = r() < .5 ? -40 + r() * 100 : 290 + r() * 100; grass.push(...rect(X(x), Y(880 + r() * 150), 1, 1.6)); } c.fill(grass, 'rgba(120, 170, 100, 0.25)');
    bed(-34, 886, 92, 24); bed(292, 886, 92, 24); bed(64, 912, 44, 30); bed(242, 912, 44, 30);
    for (const ux of [104, 246]) {
        c.fill(disc(X(ux) + 2, Y(900) + 2.5, 9), 'rgba(0, 0, 0, 0.35)'); c.paint(disc(X(ux), Y(900), 9), { fill: '#2b2830', stroke: C.silver_lo, stroke_width: 1 });
        const white = [], green = []; for (let k = 0; k < 26; k++) { const a = r() * TAU, rr = r() * 7; (r() < .8 ? white : green).push(...disc(X(ux) + Math.cos(a) * rr, Y(900) + Math.sin(a) * rr, 1.3)); }
        if (white.length) c.fill(white, '#f6f3fb'); if (green.length) c.fill(green, '#9dbf8f');
    }
    for (const lx of [-20, 60, 290, 370]) { c.fill(disc(X(lx) + 1.5, Y(1018) + 2, 5), 'rgba(0, 0, 0, 0.3)'); c.fill(rect(X(lx) - 4, Y(1018) - 4, 8, 8), S.stone_mid); }
}
function ground(scene, b) { court(scene, b); forecourt(scene, b); }

/** Night on the ground: the court's fountain and bollards, the lanterns' pools, the plaza under the marquee; the two violet searchlights from the crown's front corners. */
function nightGlow(art, b, view, time) {
    const K = courtOf(b), D = K.drive;
    glow_(art, K.fx, K.fy, K.fr + 40, '150, 130, 255', .3); glow_(art, K.fx, K.fy, 22, '230, 220, 255', .45);
    for (const [x, y] of [[D.x - 6, D.y + 14], [D.x + D.w + 6, D.y + 14], [D.x - 6, D.y + D.h - 16], [D.x + D.w + 6, D.y + D.h - 16]]) { glow_(art, x, y, 26, '220, 200, 255', .4); glow_(art, x, y, 6, '255, 250, 255', .8); }
    for (const [lx, ly] of LOOK.lanterns) glow_(art, b.x + lx, b.y + ly, 30, '255, 220, 170', .3);
    glow_(art, b.x + 175, b.y + 960, 90, '255, 214, 160', .18);
    const z0 = Z.crown + 2, eye = view.eye, zTop = eye * .8, k1 = eye / (eye - zTop), [camX, camY] = view.camera;
    for (const [lx, ly, ph] of LOOK.beams) {
        const sx = b.x + lx, sy = b.y + ly, az = -Math.PI / 2 + (ph ? .45 : -.45) + Math.sin(time * .19 + ph) * .95, elev = 1.02 + .16 * Math.sin(time * .11 + ph * 1.7);
        const run = (zTop - z0 * b.tier.z_scale) / Math.tan(elev), p0 = b.at(view, sx, sy, z0), ex = sx + Math.cos(az) * run, ey = sy + Math.sin(az) * run;
        const p1 = [camX + (ex - camX) * k1, camY + (ey - camY) * k1], vx = p1[0] - p0[0], vy = p1[1] - p0[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
        const beam = (w0, w1, c0, c1) => art.paint(polygon([[p0[0] + nx * w0, p0[1] + ny * w0], [p1[0] + nx * w1, p1[1] + ny * w1], [p1[0] - nx * w1, p1[1] - ny * w1], [p0[0] - nx * w0, p0[1] - ny * w0]]),
            { fill: linear(p0, p1, [[0, c0], [.3, c1], [1, 'rgba(120,70,255,0)']]) });
        const w1 = Math.max(60, L * .13);
        beam(6, w1, 'rgba(200,168,255,0.2)', 'rgba(164,105,255,0.07)'); beam(2, w1 * .3, 'rgba(246,236,255,0.32)', 'rgba(200,168,255,0.08)');
        glow_(art, p0[0], p0[1], 14, '255, 248, 255', .9);
    }
}

/** A tier standing out in front of a wall (the marquee) draws right after the one it's on, or that wall, below its top, would paint over it. */
function order(tiers) {
    const fronts = tiers.filter(t => t.front); if (!fronts.length) return tiers;
    const rest = tiers.filter(t => !t.front);
    for (const f of fronts) rest.splice(rest.indexOf(f.support) + 1, 0, f);
    return rest;
}

/** The Silver Queen's tiers, for `tieredBuilding`. It fronts south whatever street it is on. */
export function silverQueen() {
    const stoneLedges = (z1, belt = true) => [
        { z: 2.4, out: 1.2, th: 2.4, top: S.stone_lo, band: [110, 105, 125] },
        ...(belt ? [{ z: G, out: 2, th: 2.6, top: S.trim, band: [160, 157, 170], lip: S.stone_hi }] : []),
        { z: z1, out: 4, th: 4.5, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }
    ];
    const upper = z1 => [{ z: z1, out: 3.5, th: 4, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }];
    const near = (v, list, tol = 4) => list.some(w => Math.abs(v - w) < tol), shade = [40, 30, 70];
    const towerBalc = (e, k, n, f, [lx]) =>
        (e.ny > .99 && lx > 360 && near(lx, [408, 525, 642], 6) && f >= 35) ||        // the front, over the court
        (e.ny > .99 && lx < 350 && near(lx, [58, 292], 6) && f >= 100) ||              // the front, over the wing
        (e.nx > .99 && (k === 2 || k === 6 || k === 10) && (f - 22) % 26 === 0);       // the east side, every other floor
    const wingBalc = (e, k, n, f) =>
        (e.ny > .99 && k === 1 && f !== G) ||                                           // the front: a stack beside the pavilion
        (e.nx > .99 && (k === 2 || k === 7) && f !== G) ||                              // over the court
        (e.nx < -.99 && (k === 2 || k === 7) && (f - 22) % 26 === 13);                  // the west side
    const walls = opt => (d, l, t, H, L, b) => wall(d, l, t, H, L, b, opt);
    const cypressOf = (id, lx, ly) => ({ id, solid: false, poly: ring(lx, ly, 9, 8), z0: 0, z1: 7, fill: '#2b2830', paint: plain('#2b2830', C.silver), shade: [20, 16, 30], roof: darkTop('#2a2018'), top: cypress, rise: 50 });
    const lanternOf = (id, [lx, ly]) => ({ id, solid: false, rect: [lx - 4, ly - 4, 8, 8], z0: 0, z1: 12, fill: S.stone_mid, shade, roof: darkTop(S.stone_lt), top: lantern, rise: 18 });
    const [fu, fv] = LOOK.court.fountain, fx = 350 + 350 * fu, fy = 500 + 396 * fv;
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', ground, ground_area: [-40, 500, 740, 548], order, glow: nightGlow,
        tiers: [
            { id: 'tower', rect: [0, 0, 700, 500], z0: 0, z1: Z.tower, fill: S.stone_mid, paint: walls({ seed: 11, balc: towerBalc, uplights: true }), ledges: stoneLedges(Z.tower), shade,
                roof_glow: true, roof: (art, glow, t) => terrace(art, glow, t, { seed: 7, planters: true, lamps: true }), top: balconies(towerBalc) },
            { id: 'wing_e', rect: [225, 500, 125, 380], z0: 0, z1: Z.wing, fill: S.stone_mid, paint: walls({ seed: 23, balc: wingBalc, uplights: true }), ledges: stoneLedges(Z.wing), shade,
                roof_glow: true, roof: wingRoof(13), top: balconies(wingBalc) },
            { id: 'wing_w', rect: [0, 500, 125, 380], z0: 0, z1: Z.wing, fill: S.stone_mid, paint: walls({ seed: 29, balc: wingBalc, uplights: true }), ledges: stoneLedges(Z.wing), shade,
                roof_glow: true, roof: wingRoof(19), top: balconies(wingBalc) },
            { id: 'pavilion', rect: [125, 500, 100, 396], z0: 0, z1: Z.pavilion, fill: S.stone_mid, paint: pavilion, ledges: stoneLedges(Z.pavilion), shade,
                roof_glow: true, roof: darkRoof({ hex: 26, dy: 120 }), top: crest(175, 896, Z.pavilion + 1, 24), rise: 26 },
            { id: 'marquee', on: 'pavilion', front: true, solid: false, poly: bayPlan(92, 258, 896, 2, 30, 8), z0: G - 1, z1: G + 9, fill: C.char, paint: marquee, shade: [10, 8, 18],
                ledges: [{ z: G + 9, out: 1.2, th: 1.4, top: C.silver, band: [150, 147, 162], lip: C.silver_hi }], roof_glow: true, roof: marqueeRoof, top: marqueeRail },
            { id: 'setback', on: 'tower', rect: [30, 20, 640, 440], z0: Z.tower, z1: Z.setback, fill: S.stone_mid, paint: walls({ seed: 37 }), ledges: upper(Z.setback), shade, roof_glow: true, roof: setbackRoof },
            { id: 'crown', on: 'setback', rect: [270, 230, 160, 230], z0: Z.setback, z1: Z.crown, fill: S.stone_mid, paint: crown, ledges: upper(Z.crown), shade,
                roof_glow: true, roof: darkRoof({ hex: 40, dy: -10, pw: 6 }), top: crest(350, 460, Z.crown + 1, 34, 11), rise: 36 },
            cypressOf('cypress_w', 84, 926), cypressOf('cypress_e', 266, 926),
            { id: 'monument', solid: false, rect: [300, 960, 80, 8], z0: 0, z1: 12, fill: S.stone_mid, paint: monument, shade,
                ledges: [{ z: 12, out: 1, th: 1.4, top: S.trim, band: [172, 169, 182], lip: '#d8d5e2' }], roof: darkTop(S.stone_lt) },
            { id: 'fountain', solid: false, poly: ring(fx, fy, 15, 16), z0: 0, z1: 1, fill: '#d8cfc2', shade: [40, 30, 50], top: fountain },
            ...LOOK.lanterns.map((p, i) => lanternOf('lantern_' + i, p))
        ]
    };
}
