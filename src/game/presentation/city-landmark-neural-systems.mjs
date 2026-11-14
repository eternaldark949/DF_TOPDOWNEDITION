import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, roundRect, polygon, circle, linear } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';

/**
 * Neural Systems, a luxury department store carved from dark sapphire, as a tiered building (`city-tiered.mjs`):
 * the atrium, the tall back block, faceted sapphire glass over pale stone vitrines with the great crystal on its
 * roof; the salon, the lower front block, with the vitrines along the street (mannequins and crystals), the
 * portal under NEURAL SYSTEMS and the engraved lettering on its roof; a slim glass canopy over the portal, and
 * the stone forecourt with the seal in front.
 * The look is the `neural_systems` section of `data/city-landmarks.json`; the classic is `legacy/buildings/neural-systems.js`.
 */
const LOOK = LANDMARKS.neural_systems, C = LOOK.colors, P = LOOK.plan;
const frontOf = t => t.mitre.find(e => e && !e.hidden && e.ny > .99);
const tri = pts => polygon(pts);
/** Paths gathered by colour, filled one packet per colour. */
const byColour = () => { const m = new Map(); return { add(colour, path) { if (!m.has(colour)) m.set(colour, []); m.get(colour).push(...path); }, fill(art) { for (const [colour, path] of m) art.fill(path, colour); } }; };

function box(art, x, y, w, h, fill, stroke, r = 3, width = 1) { art.paint(roundRect(x, y, w, h, r), { fill: fill ?? null, stroke: stroke ?? null, stroke_width: width }); }
function words(art, s, x, y, size, colour = C.ice) { art.text(s, x, y, { font: { family: LOOK.font, size }, align: 'center', baseline: 'middle' }, { fill: colour }); }
function crystal(art, x, y, w, h, base = '#102d59') {
    const pts = [[x + w * .18, y], [x + w * .82, y], [x + w, y + h * .24], [x + w * .82, y + h], [x + w * .18, y + h], [x, y + h * .24]], cx = x + w * .5, cy = y + h * .48;
    const colours = [base, '#28588a', '#15345b', '#0b1b3c', '#1b4374', '#456d9b'];
    for (let i = 0; i < 6; i++) art.fill(tri([pts[i], pts[(i + 1) % 6], [cx, cy]]), colours[i]);
    art.stroke(polygon(pts), 'rgba(181,216,243,.6)', .8);
    art.stroke([['move', x + w * .18, y + 1], ['line', cx, cy], ['line', x + w * .82, y + h - 1]], 'rgba(232,245,255,.3)', .8);
}
function seal(art, x, y, r, colour = C.ice, sy = 1) {
    const ring = polygon([[0, -r], [r * .7, -r * .35], [r * .52, r * .55], [0, r], [-r * .52, r * .55], [-r * .7, -r * .35]]);
    const heart = [...polygon([[0, -r], [r * .3, 0], [0, r], [-r * .3, 0]]), ['move', -r * .7, -r * .35], ['line', r * .7, -r * .35], ['move', -r * .52, r * .55], ['line', r * .52, r * .55]];
    art.enter({ position: [x, y], scale: [1, sy] }); const w = Math.max(.7, r * .022); art.stroke(ring, colour, w); art.stroke(heart, colour, w); art.leave();
}

/** Sapphire facets from y0 down to y1 on every visible edge: columns cut on alternating diagonals, a few lit at night. */
function facets(d, l, t, y0, y1, seed) {
    const r = classicRandom(seed), cw = 22, dark = byColour(), lit = byColour(), cuts = [], mull = [], sky = [];
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const n = Math.max(1, Math.round(e.L / cw)), w = e.L / n;
        for (let i = 0; i < n; i++) {
            const x0 = e.u0 + i * w, x1 = x0 + w, mid = y0 + (y1 - y0) * (.3 + r() * .4), flip = i % 2 === 0;
            const tris = flip ? [[[x0, y0], [x1, y0], [x0, mid]], [[x1, y0], [x1, y1], [x0, mid]], [[x0, mid], [x1, y1], [x0, y1]]]
                : [[[x0, y0], [x1, y0], [x1, mid]], [[x0, y0], [x1, mid], [x0, y1]], [[x0, y1], [x1, mid], [x1, y1]]];
            for (const p of tris) {
                dark.add(C.facets[Math.floor(r() * C.facets.length)], tri(p));
                const k = r(); if (k < .3) lit.add(`rgba(120,176,240,${(.18 + k).toFixed(2)})`, tri(p));
            }
            if (flip) cuts.push(['move', x1, y0], ['line', x0, mid], ['line', x1, y1]); else cuts.push(['move', x0, y0], ['line', x1, mid], ['line', x0, y1]);
            mull.push(...rect(x0 - .3, y0, .6, y1 - y0));
        }
        sky.push(...rect(e.u0, y0, e.L, (y1 - y0) * .25));
    }
    dark.fill(d); lit.fill(l);
    if (cuts.length) d.stroke(cuts, 'rgba(190,216,238,.42)', .35);
    if (mull.length) { d.fill(mull, 'rgba(155,174,190,.7)'); d.fill(sky, 'rgba(232,245,255,.08)'); }
}

/** Pale stone vitrines from y0 to the plinth on every visible edge (gapped for the portal on the salon's front). */
function vitrines(d, l, t, y0, H, gap) {
    const r = classicRandom(t.i * 31 + 7), plinth = H - 2.2;
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        d.fill(rect(e.u0, y0, e.L, H - y0), '#d9d8cf'); d.fill(rect(e.u0, plinth, e.L, H - plinth), '#b9b8ae');
        d.fill(rect(e.u0, plinth, e.L, .3), 'rgba(0,0,0,.18)'); d.fill(rect(e.u0, y0, e.L, .6), C.gold);
        const n = Math.max(1, Math.floor((e.L - 8) / 40)), w = (e.L - 8) / n;
        for (let i = 0; i < n; i++) {
            const a = e.u0 + 4 + i * w + 3, b = a + w - 6, top = y0 + 2.4, bot = plinth - .8;
            if (gap && b > gap[0] && a < gap[1]) continue;
            d.fill(rect(a, top, b - a, bot - top), '#0a1628');
            d.paint(rect(a, top, b - a, bot - top), { fill: linear([0, top], [0, bot], [[0, 'rgba(120,170,220,.25)'], [1, 'rgba(20,40,70,.1)']]) });
            l.fill(rect(a, top, b - a, bot - top), 'rgba(206,226,255,.62)');
            const m = (a + b) / 2, kind = Math.floor(r() * 3);
            const shape = kind === 0 ? [circle(m, top + 2.2, .9), ['close'], ...rect(m - 1.2, top + 3.2, 2.4, 5), ...rect(m - .3, top + 8.2, .6, bot - top - 8.4)]
                : kind === 1 ? [-5, 5].flatMap(dx => [['move', m + dx + .8, top + 2.4], circle(m + dx, top + 2.4, .8), ['close'], ...rect(m + dx - 1, top + 3.3, 2, 4.6)])
                    : polygon([[m, top + 1.6], [m + 3, top + 4.4], [m, bot - 2.4], [m - 3, top + 4.4]]);
            if (kind === 0) shape.unshift(['move', m + .9, top + 2.2]);
            d.fill(shape, '#cfd6de'); l.fill(shape, 'rgba(0,0,0,.55)');
            d.fill([...rect(a - .6, top - .6, b - a + 1.2, .6), ...rect(a - .6, bot, b - a + 1.2, .5)], '#9baebe');
            d.fill(rect(a + 1, top, 1.2, bot - top), 'rgba(255,255,255,.08)');
        }
    }
}

/** The coping along the top: brushed metal, a cobalt LED line under it. */
function coping(d, l, L) {
    d.fill(rect(0, 0, L, 1.6), C.metal); d.fill(rect(0, 0, L, .35), 'rgba(255,255,255,.35)');
    d.fill(rect(0, 1.6, L, .8), '#0b1830'); d.fill(rect(0, 2, L, .3), '#5b8fd0'); l.fill(rect(0, 1.9, L, .5), 'rgba(80,150,255,1)');
}

function atrium(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), C.ink);
    facets(d, l, t, 2.4, H - P.vitrine, 811); vitrines(d, l, t, H - P.vitrine, H, null); coping(d, l, L);
}

function salon(d, l, t, H, L) {
    const front = frontOf(t), V = P.vitrine, fy = H - V - 4.6, cx = front ? front.u0 + 125 : -999, pw = 24;
    d.fill(rect(0, 0, L, H), C.ink);
    facets(d, l, t, 2.4, fy, 377);
    vitrines(d, l, t, H - V, H, front ? [cx - pw - 4, cx + pw + 4] : null);
    d.fill(rect(0, fy, L, 4.6), '#0b1a32'); d.fill([...rect(0, fy, L, .4), ...rect(0, fy + 4.2, L, .4)], C.gold);
    if (front) {
        const how = { font: { family: LOOK.font, size: 3.4, letter_spacing: 1.6 }, align: 'center', baseline: 'middle' };
        d.text('NEURAL  SYSTEMS', cx, fy + 2.4, how, { fill: C.pale }); l.text('NEURAL  SYSTEMS', cx, fy + 2.4, how, { fill: 'rgba(170,205,245,1)' });
        const top = H - V + 1.2, bot = H - 2.2, glass = rect(cx - pw, top + 3.4, pw * 2, bot - top - 3.4);
        d.fill(rect(cx - pw - 3, H - V, (pw + 3) * 2, V - 2.2), '#e8e7df');
        d.fill([...rect(cx - pw - 3, H - V, .6, V - 2.2), ...rect(cx + pw + 2.4, H - V, .6, V - 2.2)], '#b9b8ae');
        d.fill(glass, '#0c1a2e'); d.paint(glass, { fill: linear([0, top], [0, bot], [[0, 'rgba(150,196,236,.38)'], [1, 'rgba(60,100,150,.18)']]) });
        l.fill(glass, 'rgba(214,232,255,.85)');
        d.fill([cx - pw, cx - pw / 2, cx, cx + pw / 2, cx + pw - .5].flatMap(x => rect(x, top + 3.4, .5, bot - top - 3.4)), '#9baebe');
        d.fill([...rect(cx - 2.6, top + 7, .5, 3), ...rect(cx + 2.1, top + 7, .5, 3)], C.gold);
        seal(d, cx, top + 1.7, 2.6, '#3a5a84', .55); seal(l, cx, top + 1.7, 2.6, 'rgba(140,190,250,1)', .55);
        for (const s of [-1, 1]) { const px = cx + s * (pw + 9), gem = polygon([[px, top + 1], [px + 2.6, top + 4], [px, bot - 1], [px - 2.6, top + 4]]); d.fill(gem, '#41648c'); l.fill(gem, 'rgba(120,180,250,.7)'); }
    }
    coping(d, l, L);
}

function canopy(d, l, t, H, L) { d.fill(rect(0, 0, L, H), C.metal); d.fill(rect(0, H - .4, L, .4), '#5b8fd0'); l.fill(rect(0, H - .4, L, .4), 'rgba(80,150,255,1)'); }

const sapphire = (x, y, w, h) => linear([x, y], [x + w, y + h], [[0, '#264363'], [.45, '#11233c'], [1, '#0a1427']]);

function atriumRoof(art, glow, t) {
    const [x, y] = t.box;
    if (glow) { seal(art, x + 200, y + 96, 30, '#668db8'); art.stroke(rect(x + 8, y + 8, 384, 184), '#2b548a', 2); return; }
    box(art, x, y, 400, 200, sapphire(x, y, 400, 200), C.metal, 2, 1.5); box(art, x + 7, y + 7, 386, 186, null, '#43638a', 3);
    crystal(art, x + 13, y + 12, 374, 175, '#183d6d'); crystal(art, x + 123, y + 34, 154, 122, '#315d8b');
    art.fill(polygon([[x + 49, y + 16], [x + 75, y + 16], [x + 289, y + 180], [x + 252, y + 180]]), 'rgba(192,218,240,.24)');
}

function salonRoof(art, glow, t) {
    const [x0, y0] = t.box, x = x0 - 75, y = y0 - 200;        // (the old plan's frame: the lettering keeps its place)
    if (glow) {
        words(art, 'NEURAL', x + 200, y + 278, 29, '#a7cdf4'); words(art, 'S Y S T E M S', x + 200, y + 307, 12, '#82aed8');
        art.stroke(rect(x0 + 8, y0 + 8, 234, 184), '#2b548a', 2); return;
    }
    box(art, x0, y0, 250, 200, sapphire(x0, y0, 250, 200), C.metal, 2, 1.5); box(art, x0 + 7, y0 + 7, 236, 186, null, '#43638a', 3);
    crystal(art, x + 87, y + 210, 226, 178, '#183963');
    words(art, 'NEURAL', x + 200, y + 278, 29, C.pale); words(art, 'S Y S T E M S', x + 200, y + 307, 12, C.ice);
    art.fill(rect(x + 158, y + 326, 84, .7), '#b4c7d7');
    words(art, 'THE ART OF BECOMING', x + 200, y + 348, 7, C.pale);
}

function canopyRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box;
    if (glow) { art.stroke(rect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2), 'rgba(80,150,255,.8)', 1.6); return; }
    art.fill(rect(x0, y0, x1 - x0, y1 - y0), 'rgba(70,110,150,.85)');
    const bars = []; for (let x = x0 + 12; x < x1; x += 12) moveLine(bars, [x, y0], [x, y1]); art.stroke(bars, 'rgba(210,232,250,.4)', .8);
    art.stroke(rect(x0 + .6, y0 + .6, x1 - x0 - 1.2, y1 - y0 - 1.2), C.metal, 1.2);
}

/** The forecourt at the portal: a stone mat, the seal, the crystals' footings. */
function ground(scene, b) {
    const e = b.record.look?.entrance; if (!e) return;
    scene.enter({ matrix: [e.ny, -e.nx, e.nx, e.ny, e.cx, e.cy] });
    box(scene, -82, 0, 164, 34, '#172840', C.metal, 3);
    scene.stroke([8, 17, 26].flatMap(y => moveLine([], [-80, y], [80, y])), '#526275', .6);
    box(scene, -41, 0, 82, 33, 'rgba(111,161,205,.24)', '#afc8dc', 1);
    scene.stroke(moveLine([], [0, 1], [0, 31]), '#b0c7d8', .8);
    seal(scene, 0, 16, 9, C.pale);
    for (const x of [-101, 85]) { scene.fill(rect(x + 1, 5, 16, 26), 'rgba(0,0,0,.35)'); box(scene, x + 1, 5, 14, 24, '#1d2b3e', '#526275', 2); }
    scene.leave();
}

/** Neural Systems' tiers, for `tieredBuilding`. */
export function neuralSystems(record) {
    const ledge = (z, lip) => ({ z, out: 2.2, th: 2, top: '#9baebe', band: [26, 44, 70], lip }), shade = [6, 12, 26], gold = 'rgba(193,169,128,.9)', ice = 'rgba(190,216,238,.8)';
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, lamps: LOOK.entrance_lamps, facing: record?.facing === 'N' ? 'N' : 'S', ground,
        tiers: [
            { id: 'atrium', rect: [0, 0, 400, 200], z0: 0, z1: P.atrium, fill: C.ink, paint: atrium, shade, ledges: [ledge(P.vitrine, gold), ledge(P.atrium, ice)], roof_glow: true, roof: atriumRoof },
            { id: 'salon', rect: [75, 200, 250, 200], z0: 0, z1: P.salon, fill: C.ink, paint: salon, shade, ledges: [ledge(P.vitrine, gold), ledge(P.salon, ice)], roof_glow: true, roof: salonRoof },
            // a px off the wall: a tier back to back with a wall hides it below its top
            { id: 'canopy', solid: false, rect: [160, 401, 80, 18], z0: P.vitrine - 1.4, z1: P.vitrine, fill: C.metal, paint: canopy, shade, roof_glow: true, roof: canopyRoof }
        ]
    };
}
