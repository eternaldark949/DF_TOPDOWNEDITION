import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, roundRect, polygon, circle, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { moveLine } from './city-building-art.mjs';

/**
 * Torque Auto, Crimson Blvd's garage beside the Cozy Cafe, as a tiered building (`city-tiered.mjs`): the garage
 * hall in graphite corrugated steel with an amber pinstripe, two roll-up doors in hazard frames either side of
 * the glass entry and clerestory windows over them, its sawtooth roof's north lights and the Torque board on top;
 * the showroom wing, its front all glass with Lady, the BlackMark V3, on her plinth (lit rose gold at night), a
 * skylight and her billboard on its roof; the apron in front.
 * The look is the `torque_auto` section of `data/city-landmarks.json`; the classic is `legacy/buildings/torque-auto.js`.
 */
const LOOK = LANDMARKS.torque_auto, C = LOOK.colors, P = LOOK.plan;
const frontOf = t => t.mitre.find(e => e && !e.hidden && e.ny > .99);

function box(art, x, y, w, h, fill, stroke, r = 0, width = 1) { art.paint(r ? roundRect(x, y, w, h, r) : rect(x, y, w, h), { fill: fill ?? null, stroke: stroke ?? null, stroke_width: width }); }
function words(art, s, x, y, size, colour, family = LOOK.font) { art.text(s, x, y, { font: { family, size }, align: 'center', baseline: 'middle' }, { fill: colour }); }

/** Graphite corrugated steel: ribs, a dark cap, the pinstripe under the eave, clerestory windows (lit warm). */
function steel(d, l, t, H, L, { stripe = C.amber, clerestory = false } = {}) {
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.wall_hi], [1, '#141418']]) });
    const ribs = [], hi = []; for (let x = 0; x < L; x += 3) ribs.push(...rect(x, 0, .9, H)); for (let x = 1.4; x < L; x += 3) hi.push(...rect(x, 0, .5, H));
    d.fill(ribs, 'rgba(0,0,0,.3)'); d.fill(hi, 'rgba(255,255,255,.04)');
    d.fill(rect(0, 0, L, 2), '#111115'); d.fill(rect(0, 3.2, L, .9), stripe); d.fill(rect(0, H - 1.6, L, 1.6), '#0c0c10');
    if (!clerestory) return;
    const frames = [], glass = [], sheen = [], bars = [], lit = [], litBars = [];
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const n = Math.floor((e.L - 12) / 16);
        for (let i = 0; i < n; i++) {
            const x = e.u0 + 6 + (e.L - 12) * (i + .5) / n - 5, y = 5.5, b = [2.5, 5, 7.5].flatMap(k => rect(x + k - .2, y, .4, 3));
            frames.push(...rect(x - .6, y - .6, 11.2, 4.2)); glass.push(...rect(x, y, 10, 3)); sheen.push(...rect(x, y, 10, 1)); bars.push(...b);
            if ((i * 7 + Math.round(e.u0)) % 5 !== 1) { lit.push(...rect(x, y, 10, 3)); litBars.push(...b); }
        }
    }
    if (!frames.length) return;
    d.fill(frames, '#0d0f14'); d.fill(glass, C.glass); d.fill(sheen, 'rgba(200,220,240,.18)'); d.fill(bars, '#0d0f14');
    if (lit.length) { l.fill(lit, 'rgba(255,160,60,.75)'); l.fill(litBars, '#000'); }
}

function hall(d, l, t, H, L) {
    steel(d, l, t, H, L, { clerestory: true });
    const e = frontOf(t); if (!e) return;
    const X = px => e.u0 + px, top = H - 21;
    for (const [dx, w] of P.rollups) {
        const x0 = X(dx), x1 = x0 + w;
        d.enter().clip([...rect(x0 - 4, top - 3, w + 8, H - top + 3), ...rect(x0, top, w, H - top)], { rule: 'evenodd' });
        d.fill(rect(x0 - 4, top - 3, w + 8, H - top + 3), '#e0a028');
        const hazard = []; for (let k = x0 - 8; k < x1 + 8; k += 5) hazard.push(...polygon([[k, top - 3], [k + 2.5, top - 3], [k + 2.5 + H - top, H], [k + H - top, H]]));
        d.fill(hazard, '#16161a'); d.leave();
        d.paint(rect(x0, top, w, H - top), { fill: linear([0, top], [0, H], [[0, '#6b727b'], [1, '#4a5058']]) });
        const slats = [], shine = []; for (let y = top + 2; y < H; y += 2) slats.push(...rect(x0, y, w, .45)); for (let y = top + 2.45; y < H; y += 2) shine.push(...rect(x0, y, w, .3));
        d.fill(slats, 'rgba(20,20,24,.55)'); d.fill(shine, 'rgba(255,255,255,.12)');
        d.fill(rect(x0 + w / 2 - 6, H - 3.2, 12, 1.2), '#2a2c31'); d.fill(rect(x0 - 4, top - 6, w + 8, 2.6), '#1b1c20');
        l.fill(rect(x0, H - 1.2, w, 1.2), 'rgba(255,170,70,.5)');
    }
    const [ex, ew] = P.entry, x0 = X(ex), gt = H - 19;
    d.fill(rect(x0 - 1.2, gt - 1.2, ew + 2.4, H - gt + 1.2), C.steel);
    d.paint(rect(x0, gt, ew, H - gt), { fill: linear([0, gt], [0, H], [[0, '#6a5a40'], [1, '#3a3020']]) });
    d.fill(polygon([[x0 + 8, gt], [x0 + 26, gt], [x0 + 12, H], [x0 + 2, H]]), 'rgba(255,220,170,.12)');
    const mull = [...rect(x0, gt + 5, ew, .6)]; for (let k = 1; k < 6; k++) mull.push(...rect(x0 + ew * k / 6 - .4, gt, .8, H - gt));
    d.fill(mull, C.steel);
    d.fill([...rect(x0 + ew / 2 - 3, gt + 10, .8, 4), ...rect(x0 + ew / 2 + 2.2, gt + 10, .8, 4)], '#c9ccd2');
    l.paint(rect(x0, gt, ew, H - gt), { fill: linear([0, gt], [0, H], [[0, 'rgba(255,190,110,.55)'], [1, 'rgba(255,214,150,.9)']]) });
    l.fill(mull, '#000');
    d.fill(rect(x0 - 6, gt - 6, ew + 12, 4.4), '#0d0c10'); d.fill(rect(x0 - 6, gt - 1.8, ew + 12, .6), C.amber);
    words(d, 'T O R Q U E', x0 + ew / 2, gt - 3.8, 3, C.amber_hi); words(l, 'T O R Q U E', x0 + ew / 2, gt - 3.8, 3, 'rgba(255,190,100,1)');
}

const lady = (cx, py) => [['move', cx - 28, py], ['line', cx - 27, py - 4], ['quadratic', cx - 14, py - 6, cx - 8, py - 9.5], ['line', cx + 9, py - 9.5], ['quadratic', cx + 18, py - 6, cx + 28, py - 4.5], ['line', cx + 28.5, py], ['close']];

function wing(d, l, t, H, L) {
    steel(d, l, t, H, L, { stripe: C.rose_gold });
    const e = frontOf(t); if (!e) return;
    const x0 = e.u0 + 12, w = 176, gt = 6.5, cx = x0 + w / 2, py = H - 4.5;
    d.fill(rect(x0 - 1.2, gt - 1.2, w + 2.4, H - gt - .4), C.steel);
    d.paint(rect(x0, gt, w, H - gt - 1.6), { fill: linear([0, gt], [0, H], [[0, '#2c3442'], [1, '#1a1d24']]) });
    d.fill(rect(cx - 34, py, 68, 2.9), '#2a2a30'); d.fill(rect(cx - 34, py, 68, .4), C.rose_gold);
    d.fill(lady(cx, py), '#08080a');
    d.fill(polygon([[cx - 6, py - 8.6], [cx + 8, py - 8.6], [cx + 14, py - 5.4], [cx - 12, py - 5.4]]), '#3a4250');
    d.stroke([['move', cx - 27, py - 3.6], ['quadratic', cx, py - 5.2, cx + 28, py - 3.8]], C.rose_gold, .35);
    for (const wx of [cx - 18, cx + 18]) { d.fill([circle(wx, py - .5, 3.2)], '#111'); d.fill([circle(wx, py - .5, 1.5)], '#9aa3ad'); }
    const mull = []; for (let k = 1; k < 4; k++) mull.push(...rect(x0 + w * k / 4 - .4, gt, .8, H - gt - 1.6));
    d.fill(mull, C.steel);
    d.fill(polygon([[x0 + 4, gt], [x0 + 30, gt], [x0 + 14, H - 2], [x0, H - 2]]), 'rgba(200,225,255,.1)');
    l.paint(rect(x0, gt, w, H - gt - 1.6), { fill: radial([cx, py - 6], 2, [cx, py - 6], 70, [[0, 'rgba(255,214,196,.95)'], [1, 'rgba(248,170,140,.35)']]) });
    l.enter({}, { blend: 'destination-out' }); l.fill(lady(cx, py), 'rgba(0,0,0,.85)'); l.fill(mull, '#000'); l.leave();
}

/** The board along the hall's front, lying on its roof: the Torque script, the trades under it, bulbs round it. */
function torqueBoard(art, x, y, glow) {
    const [bx, by, bw, bh] = P.board;
    if (!glow) { box(art, x + bx, y + by, bw, bh, '#0d0c10', C.steel, 6, 2); box(art, x + bx + 5, y + by + 5, bw - 10, bh - 10, null, 'rgba(255,154,42,.4)', 4, 1); }
    words(art, 'Torque', x + bx + bw / 2, y + by + 26, 40, glow ? '#ff8800' : '#e88a2a', LOOK.script_font);
    words(art, 'A U T O   ·   S E R V I C E   ·   W R A P S', x + bx + bw / 2, y + by + 52, 7, glow ? '#ffd9a0' : '#b8aca2');
    if (glow) for (let xx = bx + 8; xx < bx + bw - 4; xx += 14) for (const yy of [by + 2, by + bh - 2]) art.fill([circle(x + xx, y + yy, 1.6)], '#ffa030');
}

function hallRoof(art, glow, t) {
    const [x, y] = t.box;
    if (glow) { art.fill(Array.from({ length: P.teeth }, (_, i) => rect(x + 8, y + 8 + i * P.teeth_d, 484, 7)).flat(), 'rgba(255,136,0,.85)'); torqueBoard(art, x, y, true); return; }
    box(art, x, y, 500, 350, C.roof_lo, '#45454e', 3, 2);
    for (let i = 0; i < P.teeth; i++) {
        const ty = y + 8 + i * P.teeth_d;
        art.paint(rect(x + 8, ty + 8, 484, P.teeth_d - 8), { fill: linear([0, ty], [0, ty + P.teeth_d], [[0, '#3a3b43'], [1, '#1a1a1f']]) });
        const seams = []; for (let xx = x + 14; xx < x + 492; xx += 7) moveLine(seams, [xx, ty + 9], [xx, ty + P.teeth_d]); art.stroke(seams, 'rgba(0,0,0,.25)', 1);
        art.paint(rect(x + 8, ty, 484, 8), { fill: linear([0, ty], [0, ty + 8], [[0, C.glass_hi], [1, C.glass]]) });
        const bars = []; for (let xx = x + 8; xx < x + 492; xx += 40) bars.push(...rect(xx, ty, 1.2, 8)); art.fill(bars, 'rgba(223,227,234,.35)');
    }
    art.fill(rect(x + 8, y + 8 + P.teeth * P.teeth_d, 484, 350 - 16 - P.teeth * P.teeth_d), '#26262c');
    art.stroke(rect(x + 3, y + 3, 494, 344), C.amber, 1.2);
    torqueBoard(art, x, y, false);
}

/** Lady's billboard, lying on the wing's roof (x, y: the building's corner). */
function ladyBoard(art, x, y, glow) {
    const [lx, ly, lw, lh] = P.bill;
    if (!glow) { box(art, x + lx, y + ly, lw, lh, '#08080a', C.steel_hi, 3, 1.5); art.fill(rect(x + lx + 4, y + ly + 4, lw - 8, lh * .4), 'rgba(223,227,234,.08)'); }
    words(art, 'L A D Y', x + lx + lw / 2, y + ly + 20, 15, glow ? '#ffffff' : C.steel_hi);
    words(art, 'BlackMark V3', x + lx + lw / 2, y + ly + 40, 16, glow ? '#f2f2f6' : '#c9ccd2', LOOK.script_font);
    words(art, 'est. 5930  ·  at Torque', x + lx + lw / 2, y + ly + 58, 6, glow ? '#f8d2c2' : '#8d8178');
}

function wingRoof(art, glow, t) {
    const [x, y] = t.box, [sx, sy, sw, sh] = P.sky, ox = x - 500, oy = y - 50;
    if (glow) { art.fill(rect(ox + sx + 2, oy + sy + 2, sw - 4, sh - 4), 'rgba(248,190,168,.4)'); ladyBoard(art, ox, oy, true); return; }
    box(art, x, y, 200, 300, '#26262c', '#45454e', 3, 2);
    box(art, ox + sx, oy + sy, sw, sh, C.glass, C.steel, 3, 1.5);
    const grid = []; for (let i = 1; i < 4; i++) moveLine(grid, [ox + sx + i * sw / 4, oy + sy], [ox + sx + i * sw / 4, oy + sy + sh]);
    for (let i = 1; i < 3; i++) moveLine(grid, [ox + sx, oy + sy + i * sh / 3], [ox + sx + sw, oy + sy + i * sh / 3]);
    art.stroke(grid, 'rgba(223,227,234,.4)', 1);
    art.fill(polygon([[ox + sx + 6, oy + sy + 6], [ox + sx + 50, oy + sy + 6], [ox + sx + 6, oy + sy + 60]]), 'rgba(200,225,255,.12)');
    art.stroke(rect(x + 3, y + 3, 194, 294), C.rose_gold, 1.2);
    ladyBoard(art, ox, oy, false);
}

/** The apron in front: chevrons before each roll-up, the mat at the entry, the A-frame, tyres, the air station. */
function ground(scene, b) {
    const x = b.x, y = b.y + P.d;
    scene.fill(rect(x, y, 700, 40), 'rgba(40,40,46,.85)');
    const joints = []; for (let xx = 50; xx < 700; xx += 50) moveLine(joints, [x + xx, y], [x + xx, y + 40]); scene.stroke(joints, 'rgba(0,0,0,.35)', 1);
    for (const [dx, w] of P.rollups) {
        const chevrons = []; for (let k = -2; k < w / 14 + 2; k++) chevrons.push(...polygon([[x + dx + k * 14, y + 4], [x + dx + k * 14 + 7, y + 4], [x + dx + k * 14 + 19, y + 36], [x + dx + k * 14 + 12, y + 36]]));
        scene.enter().clip(rect(x + dx, y + 4, w, 32)).fill(chevrons, 'rgba(255,170,40,.55)').leave();
    }
    const [ex, ew] = P.entry;
    box(scene, x + ex + 20, y + 4, ew - 40, 18, '#1c1c20', 'rgba(255,154,42,.6)', 2, 1);
    words(scene, 'TORQUE', x + ex + ew / 2, y + 13, 7, 'rgba(255,170,70,.75)');
    box(scene, x + ex + ew + 4, y + 8, 22, 26, '#2a2a30', C.amber, 2, 1);
    words(scene, 'WRAPS', x + ex + ew + 15, y + 15, 4.5, C.amber_hi); words(scene, 'TINT', x + ex + ew + 15, y + 21, 4.5, '#ffffff'); words(scene, 'TUNES', x + ex + ew + 15, y + 27, 4.5, C.amber_hi);
    for (const [tx, ty] of [[x + ex - 18, y + 22], [x + ex - 32, y + 16]]) { scene.fill([circle(tx, ty, 9)], C.ink); scene.stroke([circle(tx, ty, 4.5)], C.steel_hi, 1); }
    box(scene, x + 6, y + 6, 14, 22, '#b4321e', '#4e120a', 2, 1);
    scene.fill(rect(x + 9, y + 10, 8, 4), C.steel_hi);
    scene.stroke([['move', x + 20, y + 20], ['quadratic', x + 30, y + 34, x + 22, y + 36]], '#111', 1.4);
}

/** Torque Auto's tiers, for `tieredBuilding`. */
export function torqueAuto() {
    const eave = (z, lip) => ({ z, out: 2.4, th: 2.4, top: '#34343c', band: [38, 38, 44], lip }), shade = [10, 10, 14];
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, lamps: LOOK.entrance_lamps, facing: 'S', ground,
        tiers: [
            { id: 'hall', rect: [0, 0, 500, 350], z0: 0, z1: P.hall, fill: C.wall, paint: hall, shade, ledges: [eave(P.hall, C.amber)], roof_glow: true, roof: hallRoof },
            { id: 'wing', rect: [500, 50, 200, 300], z0: 0, z1: P.wing, fill: C.wall, paint: wing, shade, ledges: [eave(P.wing, C.rose_gold)], roof_glow: true, roof: wingRoof }
        ]
    };
}
