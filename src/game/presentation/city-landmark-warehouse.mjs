import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, circle, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';

/**
 * The Warehouse, the hub's storage hall, as a tiered building (`city-tiered.mjs`): a shed of ribbed steel
 * streaked with rust over a concrete plinth, a band of high windows (some lit sodium), its name stencilled
 * along the front, three loading docks with roll-up doors and the personnel door; a monitor roof with a
 * ribbon of clerestory glass; a steel canopy over the docks and the dock apron in front.
 * The look is the `warehouse` section of `data/city-landmarks.json`; the classic is `legacy/buildings/warehouse-hall.js`.
 */
const LOOK = LANDMARKS.warehouse, C = LOOK.colors, P = LOOK.plan;
const frontOf = t => t.mitre.find(e => e && !e.hidden && e.ny > .99);
const ribs = (x0, x1, y0, y1, step) => { const out = []; for (let x = x0; x < x1; x += step) moveLine(out, [x, y0], [x, y1]); return out; };

function shed(d, l, t, H, L) {
    const r = classicRandom(4471), front = frontOf(t);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.steel_hi], [.15, C.steel], [1, C.steel_lo]]) });
    const dark = [], hi = []; for (let x = 0; x < L; x += 2.6) dark.push(...rect(x, 2, .8, H - 6)); for (let x = 1.2; x < L; x += 2.6) hi.push(...rect(x, 2, .4, H - 6));
    d.fill(dark, 'rgba(0,0,0,.28)'); d.fill(hi, 'rgba(255,255,255,.05)');
    for (let i = 0; i < L / 9; i++) { const x = r() * L, y = 2 + r() * 8, h = 4 + r() * 12, a = .08 + r() * .12; d.fill(rect(x, y, .8 + r() * 1.6, h), `rgba(130,74,40,${a})`); }
    d.fill(rect(0, 0, L, 2), '#1c1d20'); d.fill(rect(0, 0, L, .4), 'rgba(255,255,255,.1)');
    d.fill(rect(0, H - 4, L, 4), C.concrete); d.fill(rect(0, H - 4, L, .5), 'rgba(0,0,0,.25)');
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        for (let x = e.u0 + 12, k = 0; x < e.u0 + e.L - 14; x += 24, k++) {
            const mull = [4, 8].flatMap(m => rect(x + m - .2, 4.2, .4, 3));
            d.fill(rect(x - .6, 3.6, 13.2, 4.2), '#121416'); d.fill(rect(x, 4.2, 12, 3), '#1e2a30'); d.fill(rect(x, 4.2, 12, 1), 'rgba(190,210,220,.16)'); d.fill(mull, '#121416');
            if ((k * 5 + Math.round(e.u0)) % 3) { l.fill(rect(x, 4.2, 12, 3), C.sodium); l.fill(mull, '#000'); }
        }
    }
    if (!front) return;
    const X = px => front.u0 + px, name = (t.name || 'Warehouse').toUpperCase().split('').join(' ');
    d.text(name, X(250), 10.6, { font: { family: LOOK.name_font, size: 4, weight: 700 }, align: 'center', baseline: 'middle' }, { fill: 'rgba(230,226,214,.32)' });
    P.docks.forEach((dx, i) => {
        const x0 = X(dx) - P.dock_w / 2, w = P.dock_w, y0 = H - 4 - P.dock_h, y1 = H - 4;
        d.fill(rect(x0 - 2, y0 - 2, w + 4, y1 - y0 + 2), '#16171a');
        d.paint(rect(x0, y0, w, y1 - y0), { fill: linear([0, y0], [0, y1], [[0, '#70757c'], [1, '#4c5056']]) });
        const slats = []; for (let y = y0 + 1.6; y < y1; y += 1.6) slats.push(...rect(x0, y, w, .35)); d.fill(slats, 'rgba(16,16,18,.5)');
        d.fill([...rect(x0 - 3, y1 - 5, 2.4, 5), ...rect(x0 + w + .6, y1 - 5, 2.4, 5)], '#121214');
        const bands = []; for (let k = 0; k < 3; k++) bands.push(...rect(x0 - 3, y1 - 5 + k * 1.8, 2.4, .8), ...rect(x0 + w + .6, y1 - 5 + k * 1.8, 2.4, .8)); d.fill(bands, C.yellow);
        d.fill(rect(X(dx) - 3, y0 - 6.2, 6, 3.4), C.yellow);
        d.text(String(i + 1), X(dx), y0 - 4.4, { font: { family: LOOK.name_font, size: 3, weight: 700 }, align: 'center', baseline: 'middle' }, { fill: '#16171a' });
        for (const s of [-1, 1]) { const lx = X(dx) + s * (w / 2 - 4); d.fill(rect(lx - 1.4, y0 - 4.4, 2.8, 1.4), '#2a2c30'); l.fill(rect(lx - 1.4, y0 - 3.4, 2.8, .8), 'rgba(255,230,170,1)'); }
        l.fill(rect(x0, y1 - .8, w, .8), 'rgba(255,214,140,.4)');
    });
    const px = X(468);
    d.paint(rect(px - 5, H - 4 - 15, 10, 15), { fill: '#2c3036', stroke: '#16171a', stroke_width: .5 });
    d.fill(rect(px - 2, H - 4 - 13, 4, 4), '#1e2a30'); l.fill(rect(px - 2, H - 4 - 13, 4, 4), C.sodium);
    d.fill(rect(px + 2.6, H - 4 - 7, 1.4, .6), '#c9ccd2');
    d.fill(rect(px - 2, H - 4 - 17.6, 4, 1.2), '#2a2c30'); l.fill(rect(px - 2, H - 4 - 16.6, 4, .6), 'rgba(255,230,170,1)');
}
function monitor(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), C.steel); d.fill(rect(0, 0, L, 1.4), '#1c1d20');
    d.fill(rect(0, 2, L, H - 3), '#1e2a30'); d.fill(rect(0, 2, L, 1.4), 'rgba(190,210,220,.18)'); l.fill(rect(0, 2, L, H - 3), C.sodium);
    const bars = []; for (let x = 0; x < L; x += 6) bars.push(...rect(x - .3, 2, .6, H - 3)); d.fill(bars, '#121416'); l.fill(bars, '#000');
    d.fill(rect(0, H - 1, L, 1), C.steel_lo);
}
function canopy(d, l, t, H, L) { d.fill(rect(0, 0, L, H), '#2c2e33'); d.fill(rect(0, H - .4, L, .4), C.yellow); }

function shedRoof(art, glow, t) {
    const [x, y] = t.box, r = classicRandom(99), sky = [];
    for (let i = 0; i < 4; i++) for (const sy of [40, 300]) sky.push([x + 50 + i * 110, y + sy, 60, 36]);
    if (glow) { art.fill(sky.flatMap(([sx, sy, w, h]) => rect(sx + 2, sy + 2, w - 4, h - 4)), 'rgba(255,226,150,.28)'); return; }
    art.fill(rect(x, y, P.w, P.d), '#34363a');
    art.stroke(ribs(x + 8, x + P.w, y, y + P.d, 8), 'rgba(0,0,0,.3)', 1); art.stroke(ribs(x + 11, x + P.w, y, y + P.d, 8), 'rgba(255,255,255,.04)', 1);
    for (let i = 0; i < 26; i++) { const rx = x + r() * 480, ry = y + r() * 380, rr = 10 + r() * 18; art.paint(rect(rx - 30, ry - 30, 60, 60), { fill: radial([rx, ry], 0, [rx, ry], rr, [[0, 'rgba(130,74,40,.3)'], [1, 'rgba(130,74,40,0)']]) }); }
    for (const [sx, sy, w, h] of sky) {
        art.fill(rect(sx - 1.5, sy - 1.5, w + 3, h + 3), '#1c1d20'); art.fill(rect(sx, sy, w, h), 'rgba(200,214,220,.35)');
        const m = []; for (let k = 1; k < 4; k++) moveLine(m, [sx + k * w / 4, sy], [sx + k * w / 4, sy + h]); art.stroke(m, 'rgba(30,32,36,.6)', .8);
    }
    art.stroke(rect(x + 3, y + 3, 494, 394), '#1c1d20', 6);
    for (const [px, py] of [[x + 30, y + 120], [x + 440, y + 120], [x + 30, y + 250]]) { art.fill(rect(px + 4, py + 4, 34, 26), 'rgba(0,0,0,.35)'); art.fill(rect(px, py, 34, 26), '#6a6e74'); art.fill([circle(px + 17, py + 13, 9)], '#3a3e44'); }
}
function monitorRoof(art, glow, t) {
    if (glow) return;
    const [x0, y0, x1, y1] = t.box;
    art.fill(rect(x0, y0, x1 - x0, y1 - y0), '#3e4044'); art.fill(rect(x0, (y0 + y1) / 2 - 1, x1 - x0, 2), '#2c2e32');
    art.stroke(ribs(x0 + 8, x1, y0, y1, 8), 'rgba(0,0,0,.3)', 1); art.stroke(rect(x0 + 1.5, y0 + 1.5, x1 - x0 - 3, y1 - y0 - 3), '#1c1d20', 3);
}
function canopyRoof(art, glow, t) {
    if (glow) return;
    const [x0, y0, x1, y1] = t.box;
    art.fill(rect(x0, y0, x1 - x0, y1 - y0), '#3a3c42'); art.stroke(ribs(x0 + 10, x1, y0, y1, 10), 'rgba(0,0,0,.35)', 1);
    art.stroke(moveLine([], [x0, y1 - .6], [x1, y1 - .6]), C.yellow, 1.2);
}
/** The dock apron in front: concrete, a yellow guide line to each dock, wheel chocks. */
function ground(scene, b) {
    const N = b.facing === 'N', x = b.x, y = N ? b.y - 46 : b.y + P.d, X = px => N ? x + P.w - px : x + px;
    scene.fill(rect(x, y, P.w, 46), 'rgba(70,68,64,.92)');
    const joints = []; for (let xx = 50; xx < P.w; xx += 50) moveLine(joints, [x + xx, y], [x + xx, y + 46]); scene.stroke(joints, 'rgba(0,0,0,.3)', 1);
    for (const dx of P.docks) {
        scene.stroke([...moveLine([], [X(dx) - 34, y], [X(dx) - 34, y + 46]), ...moveLine([], [X(dx) + 34, y], [X(dx) + 34, y + 46])], 'rgba(224,176,42,.75)', 2);
        scene.fill([...rect(X(dx) - 26, y + (N ? 34 : 6), 8, 6), ...rect(X(dx) + 18, y + (N ? 34 : 6), 8, 6)], C.yellow);
    }
}

/** The Warehouse's tiers, for `tieredBuilding`. */
export function warehouse(record) {
    const ledge = z => ({ z, out: 2, th: 2, top: '#4a4c52', band: [30, 31, 34], lip: 'rgba(255,255,255,.18)' }), name = record?.label || 'Warehouse';
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: record?.facing === 'N' ? 'N' : 'S', ground,
        tiers: [
            { id: 'shed', name, rect: [0, 0, P.w, P.d], z0: 0, z1: P.shed, fill: C.steel, paint: shed, shade: [12, 12, 14], ledges: [ledge(P.shed)], roof_glow: true, roof: shedRoof },
            { id: 'monitor', on: 'shed', solid: false, rect: [60, 140, 380, 120], z0: P.shed, z1: P.shed + P.monitor, fill: C.steel, paint: monitor, shade: [12, 12, 14], ledges: [ledge(P.shed + P.monitor)], roof: monitorRoof },
            { id: 'canopy', solid: false, rect: [40, P.d + 1, 420, 26], z0: P.dock_h + 7, z1: P.dock_h + 8.5, fill: '#2c2e33', paint: canopy, shade: [12, 12, 14], roof: canopyRoof }
        ]
    };
}
