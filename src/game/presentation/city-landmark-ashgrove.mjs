import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, polygon, circle, ellipse, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';
import { ornament } from './city-ornament.mjs';
import { bayPlan } from './city-tiered.mjs';

/**
 * The Ashgrove, a mansion block across Ashgrove St from Biggs Park, as a tiered building (`city-tiered.mjs`):
 * two pale brick wings with a limestone ground floor and a slate mansard (dormers, chimneys) on each, roof
 * terraces festoon-lit after dark; between them the tower with its arched ground floor, the name in its frieze
 * and the door under the bay; out of the tower's front the ornate teal bay with its carved crown (a lion's mask,
 * rosettes in acanthus scrolls, volute consoles), rising into a turret with an open loggia and a ribbed copper
 * dome; a small teal oriel on each wing; the plant and the water tank on the tower's roof.
 * The look is the `ashgrove` section of `data/city-landmarks.json`; the classic is `legacy/buildings/ashgrove.js`.
 */
const LOOK = LANDMARKS.ashgrove, P = LOOK.plan, TEAL = LOOK.teal, LIME = LOOK.lime, BRICK = LOOK.brick, SLATE = LOOK.slate;
const pathOf = pts => polygon(pts);
/** Many specks as a few paths: one path of thousands of crossing rects fills far slower. */
function specks(art, list, colour) { for (let i = 0; i < list.length; i += 1500) art.fill(list.slice(i, i + 1500), colour); }
const edgesOf = t => t.mitre.filter(Boolean);
const archPath = (xc, w, spring, bot) => [['move', xc - w / 2, bot], ['line', xc - w / 2, spring], ellipse(xc, spring, w / 2, w / 2, 0, Math.PI, 0), ['line', xc + w / 2, bot], ['close']];

/** Pale brick: courses, quoins, string courses every other floor, stone-framed windows with hoods and sills; a limestone ground floor (plinth: its height). */
function brick(d, l, t, H, L, { seed = 11, plinth = 0, lime = {} } = {}) {
    const O = ornament(LIME), C = LIME, r = classicRandom(seed), top = 7;
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, BRICK.brick], [1, BRICK.brick_lo]]) });
    const dark = [], light = [];
    for (let y = top, k = 0; y < H - plinth; y += 2.4, k++) for (let x = (k % 2) * -2.6; x < L; x += 5.2) if (r() < .25) (r() < .5 ? dark : light).push(...rect(x, y, 5.2, 2.4));
    specks(d, dark, 'rgba(120, 104, 84, 0.12)'); specks(d, light, 'rgba(255, 250, 238, 0.12)');
    const mortar = []; for (let y = top, k = 0; y < H - plinth; y += 2.4, k++) { moveLine(mortar, [0, y], [L, y]); for (let x = (k % 2) * 2.6; x < L; x += 5.2) moveLine(mortar, [x, y], [x, y + 2.4]); }
    d.stroke(mortar, BRICK.mortar, .3);
    const rows = []; for (let y = top; y + P.storey <= H - plinth + .5; y += P.storey) rows.push(y);
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const quoin = [], quoinLo = [];
        for (const X of [e.u0, e.u0 + e.L]) for (let y = top, k = 0; y < H - plinth - 4; y += 4.6, k++) { const w = k % 2 ? 4 : 5.5, x = X === e.u0 ? X : X - w; quoin.push(...rect(x, y, w, 4.2)); quoinLo.push(...rect(x, y + 3.8, w, .4)); }
        d.fill(quoin, C.trim); d.fill(quoinLo, C.trim_lo);
        const n = Math.max(1, Math.floor((e.L - 10) / 30)), ww = Math.min(15, e.L / n * .55);
        for (let i = 0; i < n; i++) {
            const xc = e.u0 + (i + .5) * e.L / n, x0 = xc - ww / 2, x1 = xc + ww / 2;
            for (const y of rows) {
                const y0 = y + 4.5, y1 = y + P.storey - 2.5;
                d.fill(rect(x0 - 1.8, y0 - 1.8, ww + 3.6, y1 - y0 + 3.6), C.trim);
                O.window(d, l, x0, y0, x1, y1, r() < .55, r, false);
                d.fill(rect(x0 - 3, y0 - 4.2, ww + 6, 2.2), C.trim); d.fill(rect(x0 - 3, y0 - 4.2, ww + 6, .5), '#fffaf0');
                d.fill(rect(x0 - 3, y0 - 2, ww + 6, .5), 'rgba(60, 56, 46, 0.4)');
                d.fill(rect(x0 - 2.4, y1 + 1.8, ww + 4.8, 1.3), C.trim); d.fill(rect(x0 - 2.4, y1 + 3.1, ww + 4.8, .7), 'rgba(60, 56, 46, 0.45)');
            }
        }
    }
    rows.forEach((y, i) => { if (i % 2 || !i) return; d.fill(rect(0, y - .6, L, 2.2), C.trim); d.fill(rect(0, y - .6, L, .5), '#fffaf0'); d.fill(rect(0, y + 1.6, L, .8), 'rgba(60, 56, 46, 0.3)'); });
    d.fill(rect(0, 0, L, 6), C.trim); d.fill(rect(0, 0, L, .8), '#fffaf0'); d.fill(rect(0, 3.2, L, .4), C.trim_lo);
    const dent = [], dentLo = []; for (let x = 1; x < L; x += 3.4) { dent.push(...rect(x, 6, 1.6, 1.4)); dentLo.push(...rect(x, 7.4, 1.6, .5)); }
    d.fill(dent, C.trim); d.fill(dentLo, 'rgba(60, 56, 46, 0.4)');
    if (plinth) limestone(d, l, t, H, L, { y0: H - plinth, seed: seed + 3, ...lime });
}

/** Limestone: rusticated ashlar, arched windows with voussoirs and keystones (or a door), a frieze with the name. */
function limestone(d, l, t, H, L, { seed = 23, y0 = 0, frieze = false, door = null, names = [.5] } = {}) {
    const O = ornament(LIME), C = LIME, r = classicRandom(seed);
    d.paint(rect(0, y0, L, H - y0), { fill: linear([0, y0], [0, H], [[0, C.stone_lt], [1, C.stone_mid]]) });
    const joints = []; for (let y = y0 + (frieze ? 9 : 2), k = 0; y < H - 2; y += 4.4, k++) { moveLine(joints, [0, y], [L, y]); for (let x = (k % 2) * 6; x < L; x += 12) moveLine(joints, [x, y], [x, y + 4.4]); }
    d.stroke(joints, 'rgba(90, 78, 56, 0.35)', .45);
    d.fill(rect(0, H - 2.5, L, 2.5), C.stone_lo);
    const front = door?.(t);
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const top = y0 + (frieze ? 11 : 3), bot = H - 3, n = Math.max(1, Math.floor(e.L / 40)), aw = Math.min(24, e.L / n * .6), doorAt = front && e === front ? Math.floor(n / 2) : -1;
        for (let i = 0; i < n; i++) {
            const xc = e.u0 + (i + .5) * e.L / n, isDoor = i === doorAt, w = isDoor ? aw * 1.3 : aw, spring = top + w / 2 + 1, arch = archPath(xc, w, spring, bot);
            d.stroke(arch, C.stone_lt, 2.6);
            const ticks = []; for (let k = 1; k < 9; k++) { const a = Math.PI + k * Math.PI / 9; moveLine(ticks, [xc + Math.cos(a) * w / 2, spring + Math.sin(a) * w / 2], [xc + Math.cos(a) * (w / 2 + 2.6), spring + Math.sin(a) * (w / 2 + 2.6)]); }
            d.stroke(ticks, 'rgba(90, 78, 56, 0.6)', .35);
            d.paint(arch, { fill: linear([0, top], [0, bot], [[0, '#26323a'], [1, '#3a3530']]) });
            d.enter().clip(arch).fill(rect(xc - w / 2, top, w * .35, bot - top), 'rgba(200, 225, 235, 0.12)').leave();
            if (isDoor) {
                d.fill(rect(xc - w / 2 + 1, spring + 1, w - 2, bot - spring - 1), '#2c1d16');
                d.fill([...rect(xc - .3, spring + 1, .6, bot - spring - 1), ...rect(xc - 2.5, (spring + bot) / 2, 1, 1), ...rect(xc + 1.5, (spring + bot) / 2, 1, 1)], LOOK.gold);
                l.enter().clip(arch).paint(rect(xc - w, top, w * 2, spring - top + 1), { fill: radial([xc, spring], 0, [xc, spring], w, [[0, 'rgba(255, 220, 160, 1)'], [1, 'rgba(255, 180, 100, 0.2)']]) }).leave();
            } else {
                d.fill(rect(xc - w / 2 + 2, bot - 6, w - 4, 3), 'rgba(14, 16, 18, 0.5)');
                d.stroke([...arch, ['move', xc, spring - w / 2], ['line', xc, bot], ['move', xc - w / 2, spring], ['line', xc + w / 2, spring]], C.frame, .6);
                if (r() < .8) {
                    l.enter().clip(arch);
                    l.paint(rect(xc - w / 2, top, w, bot - top), { fill: linear([0, top], [0, bot], [[0, 'rgba(255, 176, 100, 0.65)'], [1, 'rgba(255, 210, 140, 0.95)']]) });
                    l.enter({}, { blend: 'destination-out' }).fill(rect(xc - w / 2 + 2, bot - 6, w - 4, 3), 'rgba(0, 0, 0, 0.6)').fill([...rect(xc - .3, top, .6, bot - top), ...rect(xc - w / 2, spring - .3, w, .6)], '#000').leave();
                    l.leave();
                }
            }
            O.carve(d, polygon([[xc - 2, spring - w / 2 - 3.2], [xc + 2, spring - w / 2 - 3.2], [xc + 1.3, spring - w / 2 + .6], [xc - 1.3, spring - w / 2 + .6]]), C.stone_lt, C.stone_hi, C.stone_dk, .3);
        }
    }
    if (frieze) {
        d.fill(rect(0, y0, L, 9), C.stone); d.fill(rect(0, y0, L, .8), C.stone_hi); d.fill(rect(0, y0 + 8.4, L, .6), C.stone_lo);
        const dent = []; for (let x = 1; x < L; x += 2.6) dent.push(...rect(x, y0 + 1.2, 1.3, 1.2)); d.fill(dent, C.stone_lt);
        if (front) for (const [c, colour] of [[d, '#9a7a3c'], [l, 'rgba(255, 220, 160, 1)']]) for (const at of names)
            c.text('T H E  A S H G R O V E', front.u0 + front.L * at, y0 + 5.2, { font: { family: LOOK.name_font, size: 5, weight: 700 }, align: 'center', baseline: 'middle' }, { fill: colour });
    }
}

/** The teal bay: a window a floor in each facet, cornice bands between, panels on the cheeks; the carved crown at the top. */
function bay(d, l, t, H, L) {
    const O = ornament(TEAL), C = TEAL, r = classicRandom(9491), crown = 28, cap = 4, storeys = [[31, 46], [53, 68], [75, 87]], bands = [48, 70];
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.stone], [1, C.stone_mid]]) });
    const courses = []; for (let y = crown + 3; y < H; y += 4.5) moveLine(courses, [0, y], [L, y]); d.stroke(courses, 'rgba(16, 36, 36, 0.22)', .3);
    const dark = [], light = []; for (let i = 0; i < L * H / 6; i++) (r() < .5 ? dark : light).push(...rect(r() * L, r() * H, .5 + r() * .8, .5 + r() * 1.6));
    specks(d, dark, 'rgba(10, 30, 30, 0.08)'); specks(d, light, 'rgba(190, 230, 220, 0.06)');
    const edges = edgesOf(t), hid = edges.findIndex(e => e.hidden), ring = edges.slice(hid + 1).concat(edges.slice(0, hid));
    const cheeks = [ring[0], ring[ring.length - 1]], facets = ring.slice(1, -1), mid = Math.floor(facets.length / 2);
    for (const e of cheeks) for (const [y0, y1] of storeys) {
        const x0 = e.u0 + 2.5, x1 = e.u0 + e.L - 2.5;
        d.fill(rect(x0, y0, x1 - x0, y1 - y0), C.stone_lo); d.fill([...rect(x0, y1 - .4, x1 - x0, .4), ...rect(x1 - .4, y0, .4, y1 - y0)], C.stone_hi); d.fill([...rect(x0, y0, x1 - x0, .5), ...rect(x0, y0, .5, y1 - y0)], C.stone_dk);
    }
    facets.forEach((e, i) => {
        const pier = Math.max(4, e.L * .15), x0 = e.u0 + pier, x1 = e.u0 + e.L - pier;
        storeys.forEach(([y0, y1], s) => O.window(d, l, x0, y0, x1, y1, !(s === 2 && i === 0) && r() < .9, r, true));
        for (const X of [e.u0 + pier / 2, e.u0 + e.L - pier / 2]) { d.fill(rect(X - .35, crown + 2, .7, H - crown - 4), 'rgba(14, 32, 32, 0.4)'); d.fill(rect(X + .35, crown + 2, .35, H - crown - 4), 'rgba(170, 220, 205, 0.18)'); }
        const xc = (x0 + x1) / 2;
        for (const [y0] of storeys.slice(1)) O.carve(d, polygon([[xc - 1.6, y0 - 2.2], [xc + 1.6, y0 - 2.2], [xc + 1.1, y0 + 1], [xc - 1.1, y0 + 1]]), C.stone_lt, C.stone_hi, C.stone_dk, .3);
    });
    const band = (y, h) => { d.fill(rect(0, y, L, h * .35), C.stone_lt); d.fill(rect(0, y + h * .35, L, h * .35), C.stone); d.fill(rect(0, y + h * .7, L, h * .3), C.stone_lo); d.fill(rect(0, y + h, L, 1.2), 'rgba(8, 20, 20, 0.45)'); };
    for (const y of bands) band(y, 5);
    band(crown, 2.5);
    d.fill(rect(0, cap, L, crown - cap), 'rgba(10, 26, 26, 0.35)');
    const fm = facets[mid], lx = fm.u0 + fm.L / 2, ly = (cap + crown) / 2 + .5;
    for (let x = 3; x < L; x += 9) { const dn = Math.round(x / 9) % 2; if (Math.abs(x - lx) < 18) continue; O.leaf(d, x, crown - 2, 9, dn ? -.3 : Math.PI + .3, .3, dn ? -1 : 1); }
    facets.forEach((e, i) => {
        if (i === mid) return;
        const xc = e.u0 + e.L / 2, s = i < mid ? 1 : -1, rr = Math.abs(i - mid) === 1 ? 9 : 7.5;
        O.scroll(d, xc, ly, rr * 1.15, s, s > 0 ? 0 : Math.PI); O.rosette(d, xc, ly, rr * .62);
        O.leaf(d, xc + s * rr * 1.1, ly + 2, rr * 1.4, s > 0 ? -.35 : Math.PI + .35, .3);
        O.leaf(d, xc - s * rr * 1.05, ly - 3, rr * 1.1, s > 0 ? Math.PI + .6 : -.6, .28);
    });
    for (const s of [-1, 1]) { O.leaf(d, lx + s * 11, ly + 6, 12, s > 0 ? -.45 : Math.PI + .45, .32, -s); O.leaf(d, lx + s * 10, ly - 6, 11, s > 0 ? .35 : Math.PI - .35, .3, s); }
    O.lion(d, lx, ly + 1, 12.5);
    facets.forEach(e => { const pier = Math.max(4, e.L * .15); O.console(d, e.u0 + pier * .55, crown + 1, storeys[0][1] - 2, 1); O.console(d, e.u0 + e.L - pier * .55, crown + 1, storeys[0][1] - 2, -1); });
    d.fill(rect(0, 0, L, 1.6), C.stone_lt); d.fill(rect(0, 1.6, L, 1.2), C.stone); d.fill(rect(0, 2.8, L, cap - 2.8), C.stone_lo);
    const dent = []; for (let x = .6; x < L; x += 2.2) dent.push(...rect(x, 2.9, 1.1, 1)); d.fill(dent, C.stone_lt);
    l.paint(rect(lx - 20, cap, 40, 28), { fill: radial([lx, storeys[0][0]], 0, [lx, storeys[0][0]], 18, [[0, 'rgba(255, 190, 120, 0.2)'], [1, 'rgba(255, 190, 120, 0)']]) });
}

/** A small teal oriel: a window a floor, bands, a rosette in each facet's frieze. */
function oriel(d, l, t, H, L) {
    const O = ornament(TEAL), C = TEAL, r = classicRandom(313);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.stone], [1, C.stone_mid]]) });
    const rows = []; for (let y = 12; y + P.storey <= H + .5; y += P.storey) rows.push(y);
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const pier = Math.max(3, e.L * .16), x0 = e.u0 + pier, x1 = e.u0 + e.L - pier;
        if (x1 - x0 > 5) for (const y of rows) O.window(d, l, x0, y + 3, x1, y + P.storey - 3, r() < .7, r, true);
        if (e.L > 18) O.rosette(d, e.u0 + e.L / 2, 6.5, 3.6);
    }
    d.fill(rect(0, 0, L, 1.4), C.stone_lt); d.fill(rect(0, 10.5, L, 1), C.stone_lo);
    for (const y of rows.slice(1)) { d.fill(rect(0, y, L, 1.2), C.stone_lt); d.fill(rect(0, y + 1.2, L, .8), 'rgba(8, 20, 20, 0.4)'); }
}

/** The turret over the bay: an open loggia, an arch in each facet with a lantern hanging in it, a cap. */
function turret(d, l, t, H, L) {
    const O = ornament(TEAL), C = TEAL;
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.stone_lt], [1, C.stone]]) });
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const w = Math.min(e.L * .6, 18), xc = e.u0 + e.L / 2, top = 7, bot = H - 3, spring = top + w / 2;
        if (w < 6) continue;
        const arch = archPath(xc, w, spring, bot);
        d.paint(arch, { fill: '#0b1716', stroke: C.stone_hi, stroke_width: 1.2 });
        const rail = [...rect(xc - w / 2, bot - 3, w, 3)]; for (let x = xc - w / 2 + 1.5; x < xc + w / 2; x += 2.4) rail.push(...rect(x, bot - 5.5, .9, 2.5)); d.fill(rail, C.stone_dk);
        d.fill(rect(xc - .2, top + 2, .4, w / 2), '#3a2a1a'); d.fill(rect(xc - 1.2, spring + 1, 2.4, 3), '#7a5a2a');
        l.enter().clip(arch).paint(rect(xc - w, top, w * 2, bot - top), { fill: radial([xc, spring + 2.5], 0, [xc, spring + 2.5], w * .7, [[0, 'rgba(255, 236, 190, 1)'], [.25, 'rgba(255, 196, 120, 0.7)'], [1, 'rgba(255, 170, 90, 0)']]) }).leave();
        O.carve(d, O.oval(e.u0 + 1.5, H / 2, 1.2, H / 2 - 2), C.stone_lt, C.stone_hi, C.stone_dk, .3);
    }
    d.fill(rect(0, 0, L, 1), C.stone_hi); d.fill(rect(0, 4.5, L, 1.5), C.stone_lo);
    const dent = []; for (let x = .6; x < L; x += 2.2) dent.push(...rect(x, 3, 1.1, 1.2)); d.fill(dent, C.stone_lt);
}

/** The mansard: slate in fish-scale rows, dormers with little pediments (some lit), copper cresting along the top. */
function mansard(d, l, t, H, L) {
    const O = ornament(LIME), C = LIME, r = classicRandom(707);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, SLATE.slate_lo], [1, SLATE.slate]]) });
    const hi = [], lo = [];
    for (let y = 2, k = 0; y < H; y += 2.2, k++) for (let x = (k % 2) * 1.6; x < L; x += 3.2) (r() < .5 ? hi : lo).push(['move', x + 1.5, y], ellipse(x, y, 1.5, 1.5, 0, 0, Math.PI), ['close']);
    d.enter({}, { opacity: .35 }); specks(d, hi, SLATE.slate_hi); specks(d, lo, SLATE.slate_lo); d.leave();
    for (const e of edgesOf(t)) {
        if (e.hidden) continue;
        const n = Math.max(1, Math.floor((e.L - 10) / 30));
        for (let i = 0; i < n; i++) {
            const xc = e.u0 + (i + .5) * e.L / n, w = 7, y0 = 4, y1 = H - 2;
            d.fill([...polygon([[xc - w / 2 - 2, y0 + 1], [xc, y0 - 3], [xc + w / 2 + 2, y0 + 1]]), ...rect(xc - w / 2 - 1.2, y0 + 1, w + 2.4, y1 - y0 - 1)], C.trim);
            O.window(d, l, xc - w / 2, y0 + 2, xc + w / 2, y1 - 1, r() < .45, r, false);
        }
    }
    const crest = [...rect(0, 0, L, 1.2)]; for (let x = 1; x < L; x += 3) crest.push(...rect(x, -.5, .6, 1.6)); d.fill(crest, SLATE.copper);
    d.fill(rect(0, H - 1, L, 1), 'rgba(0, 0, 0, 0.35)');
}

function tank(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#6a4a32');
    const a = [], b = []; for (let x = 0; x < L; x += 2.6) ((x / 2.6) % 2 < 1 ? a : b).push(...rect(x, 0, 2.6, H));
    d.fill(a, 'rgba(255, 220, 180, 0.08)'); d.fill(b, 'rgba(0, 0, 0, 0.15)');
    d.fill([2, H * .4, H * .75].flatMap(y => rect(0, y, L, .9)), '#2a2420');
}

/* ---------------- roofs (world coordinates, in each tier's plane) ---------------- */

function flatRoof(art, t, { seed = 5, a = '#8a8478', b = '#6c675e', parapet = '#e6e1d2', pw = 8 } = {}) {
    const r = classicRandom(seed), path = pathOf(t.poly), [x0, y0, x1, y1] = t.box;
    art.paint(path, { fill: linear([x0, y0], [x1, y1], [[0, a], [1, b]]) });
    const light = [], dark = []; for (let i = 0; i < (x1 - x0) * (y1 - y0) / 30; i++) (r() < .5 ? light : dark).push(...rect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 1, 1));
    art.enter().clip(path); specks(art, light, 'rgba(255, 255, 255, 0.05)'); specks(art, dark, 'rgba(0, 0, 0, 0.12)'); art.leave();
    art.enter({}, { line_join: 'miter' }).stroke(path, parapet, pw).leave();
    art.stroke(path, 'rgba(0, 0, 0, 0.3)', 1);
}

/** A roof terrace in box [x0, y0, x1, y1]: tiles, planters, festoon strings (by night their bulbs). */
function terrace(art, [x0, y0, x1, y1], glow) {
    const rows = 3, row = i => y0 + 24 + i * (y1 - y0 - 48) / (rows - 1);
    if (glow) {
        for (let i = 0; i < rows; i++) { const y = row(i); for (let x = x0 + 20; x < x1 - 20; x += 21) { const yy = y + Math.sin(x * .2) * 3; art.paint(rect(x - 4, yy - 4, 8, 8), { fill: radial([x, yy], 0, [x, yy], 3.5, [[0, 'rgba(255, 236, 190, 0.85)'], [.35, 'rgba(255, 200, 120, 0.35)'], [1, 'rgba(255, 200, 120, 0)']]) }); } }
        return;
    }
    art.fill(rect(x0, y0, x1 - x0, y1 - y0), '#b9ab90');
    const tiles = []; for (let y = y0; y < y1; y += 10) for (let x = x0 + ((y - y0) / 10 % 2) * 10; x < x1; x += 20) tiles.push(...rect(x, y, 10, 10)); art.fill(tiles, '#a99b80');
    for (const [px, py] of [[x0 + 18, y0 + 18], [x1 - 18, y0 + 18], [x0 + 18, y1 - 18], [x1 - 18, y1 - 18], [(x0 + x1) / 2, y1 - 18]]) {
        art.fill(rect(px - 9, py - 9, 18, 18), '#5a4636'); art.fill([circle(px, py, 8)], '#2f5a34');
        for (let k = 0; k < 6; k++) art.fill([circle(px - 3 + (k * 37 % 7), py - 3 + (k * 23 % 7), 2)], 'rgba(140, 200, 120, 0.4)');
    }
    const strings = []; for (let i = 0; i < rows; i++) { const y = row(i); let first = true; for (let x = x0 + 20; x <= x1 - 20; x += 7) { strings.push([first ? 'move' : 'line', x, y + Math.sin(x * .2) * 3]); first = false; } }
    art.stroke(strings, 'rgba(40, 30, 20, 0.5)', .6);
    art.stroke(rect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4), '#ece5d2', 4);
    const benches = []; for (let x = x0 + 40; x < x1 - 30; x += 46) benches.push(...rect(x, y0 + 8, 14, 5), ...rect(x + 2, y0 + 14, 10, 1.5)); art.fill(benches, '#7a5a40');
}

/** Skylights: glazed panes in a frame (by night lit from below). */
function skylights(art, x0, y0, n, w, h, gap, glow) {
    for (let i = 0; i < n; i++) {
        const x = x0 + i * (w + gap), bars = [1, 2].flatMap(k => rect(x + 2, y0 + 2 + k * (h - 4) / 3, w - 4, .8));
        if (glow) { art.paint(rect(x + 2, y0 + 2, w - 4, h - 4), { fill: linear([x, y0], [x, y0 + h], [[0, 'rgba(255, 196, 120, 0.12)'], [1, 'rgba(255, 206, 140, 0.32)']]) }); art.fill(bars, 'rgba(0, 0, 0, 1)'); continue; }
        art.fill(rect(x, y0, w, h), '#d8d2c2');
        art.paint(rect(x + 2, y0 + 2, w - 4, h - 4), { fill: linear([x, y0], [x + w, y0 + h], [[0, '#5d7a88'], [1, '#2c3c46']]) });
        art.fill(bars, 'rgba(0, 0, 0, 0.35)'); art.fill(rect(x + 3, y0 + 3, (w - 6) * .4, 1.2), 'rgba(220, 240, 255, 0.25)');
    }
}

function wingRoof(seed) { return (art, glow, t) => { if (!glow) flatRoof(art, t, { seed }); terrace(art, [t.box[0] + 16, t.box[1] + 268, t.box[2] - 16, t.box[3] - 14], glow); }; }
function mansardRoof(x0) {
    return (art, glow, t) => {
        const [a, b, c, d] = t.box;
        if (!glow) {
            flatRoof(art, t, { a: '#56626f', b: '#3e4853', parapet: SLATE.copper, pw: 3, seed: x0 });
            const courses = []; for (let y = b + 6; y < d - 4; y += 5) moveLine(courses, [a + 4, y], [c - 4, y]); art.stroke(courses, 'rgba(20, 26, 32, 0.35)', .6);
            art.stroke(moveLine([], [(a + c) / 2, b + 10], [(a + c) / 2, d - 10]), SLATE.copper, 3);
        }
        for (const sx of [a + 22, (a + c) / 2 + 12]) skylights(art, sx, b + 100, 2, 26, 34, 10, glow);
    };
}
function towerRoof(art, glow, t) {
    const [a, b, c] = t.box;
    if (!glow) {
        flatRoof(art, t, { seed: 9 });
        art.paint(rect(a + 30, b + 150, 26, 20), { fill: '#2a2c30', stroke: '#8a8070', stroke_width: 1.5 });
        const seams = []; for (let x = a + 20; x < c - 10; x += 24) moveLine(seams, [x, b + 10], [x, b + 380]); art.stroke(seams, 'rgba(30, 28, 24, 0.25)', .7);
        art.fill([...rect(a + 90, b + 30, 200, 6), ...rect(a + 90, b + 30, 6, 330)], '#9a8f78');
    }
    skylights(art, a + 110, b + 200, 4, 34, 46, 12, glow);
}
function tankRoof(art, glow, t) {
    if (glow) return;
    const [a, b, c, d] = t.box, cx = (a + c) / 2, cy = (b + d) / 2;
    art.fill([circle(cx, cy, 19)], '#4a3a2c');
    const spokes = []; for (let i = 0; i < 12; i++) { const a2 = i * Math.PI / 6; moveLine(spokes, [cx, cy], [cx + Math.cos(a2) * 19, cy + Math.sin(a2) * 19]); } art.stroke(spokes, 'rgba(0, 0, 0, 0.4)', .8);
    art.fill([circle(cx, cy, 2.5)], '#2a2420');
}
function orielRoof(art, glow, t) { if (!glow) art.paint(pathOf(t.poly), { fill: '#2f4a46', stroke: TEAL.stone_lt, stroke_width: 5 }); }

/* ---------------- what stands on the roofs, drawn live ---------------- */

function chimneys(art, glow, t, b, view) {
    if (glow) return;
    const [a, y0, c] = t.box;
    for (const [cx, cy] of [[a + 40, y0 + 50], [c - 40, y0 + 190]]) b.prism(art, view, cx - 9, cy - 6, cx + 9, cy + 6, t.z1, t.z1 + 14, '#c9bfa8', '#7a5a46');
}
function plant(art, glow, t, b, view) {
    if (glow) return;
    const [a, y0] = t.box;
    b.prism(art, view, a + 30, y0 + 150, a + 56, y0 + 170, t.z1, t.z1 + 7, '#bdb3a0', '#55504a');
    for (const [px, py] of [[a + 120, y0 + 60], [a + 200, y0 + 60], [a + 30, y0 + 270]]) b.prism(art, view, px, py, px + 50, py + 34, t.z1, t.z1 + 10, '#b7b9b4', '#8e918c');
    const [lx, ly] = b.local(300, 70), X = b.x + lx, Y = b.y + ly, legs = [];
    for (const [dx, dy] of [[-12, -12], [12, -12], [12, 12], [-12, 12]]) moveLine(legs, b.at(view, X + dx, Y + dy, 126), b.at(view, X + dx, Y + dy, 132));
    art.stroke(legs, '#2a2420', 1.4);
}
/** The dome over the turret: rings stacked up its curve, ribs to the lantern, a finial (by night the lantern's glow). */
function dome(art, glow, t, b, view) {
    const base = t.poly, n = base.length, R = 15, N = 9;
    let cx = 0, cy = 0; for (const [x, y] of base) { cx += x; cy += y; } cx /= n; cy /= n;
    if (glow) {
        const p = b.at(view, cx, cy, t.z1 + R + 4), k = b.k(view, t.z1 + R);
        art.paint(rect(p[0] - 14 * k, p[1] - 14 * k, 28 * k, 28 * k), { fill: radial(p, 0, p, 14 * k, [[0, 'rgba(255, 230, 170, 0.9)'], [1, 'rgba(255, 190, 110, 0)']]) });
        return;
    }
    for (let i = 0; i <= N; i++) {
        const th = i / N * Math.PI / 2 * .92, s = Math.cos(th), z = t.z1 + R * Math.sin(th), shade = .45 + .55 * (i / N);
        const ring = pathOf(base.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]));
        art.enter({ matrix: view.plane(b.k(view, z)) });
        art.fill(ring, `rgb(${Math.round(60 * shade + 20)}, ${Math.round(130 * shade + 22)}, ${Math.round(112 * shade + 20)})`);
        if (i === 0) art.stroke(ring, '#1c3a33', 2);
        art.leave();
    }
    const ribs = [];
    for (const [x, y] of base) for (let i = 0; i <= N; i++) { const th = i / N * Math.PI / 2 * .92, s = Math.cos(th), p = b.at(view, cx + (x - cx) * s, cy + (y - cy) * s, t.z1 + R * Math.sin(th)); ribs.push([i ? 'line' : 'move', ...p]); }
    art.stroke(ribs, 'rgba(14, 40, 34, 0.7)', 1.2);
    const top = b.at(view, cx, cy, t.z1 + R * .98), f0 = b.at(view, cx, cy, t.z1 + R), f1 = b.at(view, cx, cy, t.z1 + R + 9), k = b.k(view, t.z1 + R + 6);
    art.stroke(moveLine([], top, f1), '#c9a457', 1.6);
    art.fill([circle(f0[0] + (f1[0] - f0[0]) * .55, f0[1] + (f1[1] - f0[1]) * .55, 2.2 * k)], '#e8c97a');
}

/** The Ashgrove's tiers, for `tieredBuilding`. */
export function ashgrove(record) {
    const facing = record?.facing === 'N' ? 'N' : 'S', front = facing === 'N' ? [0, -1] : [0, 1];
    const frontEdge = t => edgesOf(t).find(e => Math.abs(e.nx - front[0]) < .01 && Math.abs(e.ny - front[1]) < .01);
    const brickLedges = (z1, plinth) => [{ z: plinth, out: 2.2, th: 3, top: LIME.trim, band: [205, 196, 176], lip: '#fffaf0' }, { z: z1, out: 5, th: 6, top: '#efe8d6', band: [222, 214, 196], lip: '#ffffff' }];
    const tealLedge = (z, out, th, band = [82, 138, 120]) => ({ z, out, th, top: TEAL.stone_lt, band, lip: TEAL.stone_hi });
    const wing = (id, x0, seed) => ({ id, rect: [x0, 0, 240, 420], z0: 0, z1: 72, fill: BRICK.brick_lo, paint: (d, l, t, H, L) => brick(d, l, t, H, L, { plinth: 18, seed }), ledges: brickLedges(72, 18), shade: [20, 22, 28], roof_glow: true, roof: wingRoof(seed) });
    const roofOf = (id, x0, on) => ({ id, on, rect: [x0 + 10, 10, 220, 250], z0: 72, z1: 86, fill: SLATE.slate, paint: mansard, shade: [10, 14, 20], roof_glow: true, roof: mansardRoof(x0), top: chimneys });
    const orielOf = (id, x0, on) => ({ id, on, solid: false, poly: bayPlan(x0, x0 + 120, 420, 8, 30, 4), z0: 18, z1: 72, fill: TEAL.stone_mid, paint: oriel, lit_under: .18,
        ledges: [tealLedge(19, 2.5, 4, [70, 128, 110]), tealLedge(72, 4, 4)], roof: orielRoof });
    const bayPoly = bayPlan(330, 490, 420, 14, 46, 5);
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing,
        tiers: [
            wing('wing_w', 0, 31), wing('wing_e', 580, 47),
            roofOf('mansard_w', 0, 'wing_w'), roofOf('mansard_e', 580, 'wing_e'),
            { id: 'tower', rect: [240, 20, 340, 400], z0: 0, z1: 126, fill: BRICK.brick_lo, paint: (d, l, t, H, L) => brick(d, l, t, H, L, { plinth: 36, seed: 59, lime: { frieze: true, door: frontEdge, names: [.13, .87] } }), shade: [20, 22, 28],
                ledges: [{ z: 36, out: 4, th: 4, top: '#efe8d6', band: [226, 216, 194], lip: '#ffffff' }, { z: 90, out: 2, th: 3, top: LIME.trim, band: [205, 196, 176], lip: '#fffaf0' }, { z: 126, out: 6, th: 7, top: '#efe8d6', band: [222, 214, 196], lip: '#ffffff' }],
                roof_glow: true, roof: towerRoof, top: plant },
            { id: 'tank', on: 'tower', solid: false, poly: Array.from({ length: 12 }, (_, i) => [300 + Math.cos(-i * Math.PI / 6) * 18, 70 + Math.sin(-i * Math.PI / 6) * 18]), z0: 132, z1: 150, fill: '#5a3e2a', paint: tank, shade: [20, 12, 8], roof: tankRoof },
            { id: 'bay', on: 'tower', solid: false, poly: bayPoly, z0: 36, z1: 126, fill: TEAL.stone_mid, paint: bay, shade: [6, 18, 20], lit_under: .2,
                ledges: [tealLedge(37, 2, 3, [70, 128, 110]), tealLedge(126 - 48 - .5, 3.2, 5), tealLedge(126 - 70 - .5, 3.2, 5), tealLedge(126 - 28, 1.4, 2.5), tealLedge(126, 6, 4)] },
            { id: 'turret', on: 'bay', solid: false, poly: bayPoly, z0: 126, z1: 150, fill: TEAL.stone, paint: turret, shade: [6, 18, 20], lit_under: .2, ledges: [tealLedge(150, 4, 3)], top: dome, rise: 24 },
            orielOf('oriel_w', 60, 'wing_w'), orielOf('oriel_e', 640, 'wing_e')
        ]
    };
}
