import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, circle, ellipse, polygon, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { moveLine } from './city-building-art.mjs';

/**
 * Dr. Yin's, the clinic on the hub's south-west corner, as a tiered building (`city-tiered.mjs`), in dark teal
 * and medical cyan: the ward, the tall west block, with ribbon windows behind slim fins over cyan-lined
 * spandrels and the glass lobby on the street under DR. YIN'S CLINIC; the treatment wing, lower, east, in
 * frosted glass with the pharmacy's window and cross; a glass canopy over the door. On the ward's roof the
 * medical cross and the plant, on the wing's the healing garden.
 * The look is the `dr_yins` section of `data/city-landmarks.json`; the classic is `legacy/buildings/dr-yins.js`.
 */
const LOOK = LANDMARKS.dr_yins, C = LOOK.colors, P = LOOK.plan;
const frontOf = t => t.mitre.find(e => e && !e.hidden && e.ny > .99);

/** Cyan letters on the strip, and lit cyan on the light layer. */
function letters(d, l, s, x, y, size, colour, spacing) {
    const font = { family: LOOK.font, size, weight: 600, letter_spacing: spacing }, how = { font, align: 'center', baseline: 'middle' };
    d.text(s, x, y, how, { fill: colour }); l.text(s, x, y, how, { fill: C.cyan });
}

function ward(d, l, t, H, L) {
    const lobby = P.lobby, top = 4, rows = 4, rh = (H - lobby - 3 - top) / rows, front = frontOf(t);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, C.teal], [1, C.teal_lo]]) });
    d.fill(rect(0, 0, L, 2.6), C.teal_hi); d.fill(rect(0, 0, L, .5), 'rgba(255,255,255,.12)');
    d.fill(rect(0, 3, L, .4), C.cyan); l.fill(rect(0, 2.9, L, .6), C.cyan);
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const x0 = e.u0 + 3, x1 = e.u0 + e.L - 3, fins = [], bright = [], soft = [];
        for (let r = 0; r < rows; r++) {
            const y0 = top + r * rh + 2, y1 = top + (r + 1) * rh - 1.6;
            d.fill(rect(x0, y0, x1 - x0, y1 - y0), C.glass);
            d.fill(rect(x0, y0, x1 - x0, (y1 - y0) * .35), 'rgba(160,220,230,.14)');
            d.fill(rect(x0, y0, x1 - x0, y1 - y0), 'rgba(0,243,255,.05)');
            for (let x = x0, k = 0; x < x1; x += 10, k++) {
                const w = Math.min(10, x1 - x), on = (k * 7 + r * 3 + Math.round(e.u0)) % 9;
                if (on < 6) (on < 4 ? bright : soft).push(...rect(x, y0, w, y1 - y0));
                fins.push(...rect(x - .3, y0, .6, y1 - y0));
            }
            d.enter({}, { opacity: .5 }).fill(rect(x0, y1 + .6, x1 - x0, .3), C.cyan).leave();
            l.fill(rect(x0, y1 + .5, x1 - x0, .5), 'rgba(0,243,255,.8)');
        }
        if (bright.length) l.fill(bright, 'rgba(222,250,255,.8)'); if (soft.length) l.fill(soft, 'rgba(0,243,255,.55)');
        d.fill(fins, C.fin);
        const posts = [], edge = [];
        for (let x = e.u0 + 12.5; x < e.u0 + e.L - 2; x += 25) { posts.push(...rect(x - .7, top, 1.4, H - lobby - 3 - top)); edge.push(...rect(x - .7, top, .3, H - lobby - 3 - top)); }
        if (posts.length) { d.fill(posts, C.fin); d.fill(edge, 'rgba(122,255,216,.15)'); }
        const gy = H - lobby;
        if (e === front) {
            d.fill(rect(e.u0, gy - 3, e.L, 3), '#081416');
            letters(d, l, "DR. YIN'S CLINIC", e.u0 + e.L / 2, gy - 1.4, 2.4, '#5fe6ee', .6);
            d.fill(rect(e.u0 + 2, gy, e.L - 4, lobby - 1), '#0f2a2e');
            d.fill(polygon([[e.u0 + 20, gy], [e.u0 + 44, gy], [e.u0 + 30, H - 1], [e.u0 + 6, H - 1]]), 'rgba(180,240,245,.12)');
            l.paint(rect(e.u0 + 2, gy, e.L - 4, lobby - 1), { fill: linear([0, gy], [0, H], [[0, 'rgba(200,250,255,.55)'], [1, 'rgba(230,255,255,.85)']]) });
            const dc = e.u0 + 125;
            d.fill([...rect(dc - 11, gy + 1, 22, .6), ...rect(dc - .3, gy + 1, .6, lobby - 2)], '#c8d6d8');
            d.fill(rect(dc - 11, gy + .4, 22, .4), 'rgba(0,243,255,.6)');
            const mull = []; for (let x = e.u0 + 2; x < e.u0 + e.L - 2; x += 12) if (Math.abs(x - dc) >= 12) mull.push(...rect(x - .3, gy, .6, lobby - 1));
            d.fill(mull, '#8fb6b8'); l.fill(mull, '#000');
            d.fill([dc - 40, dc + 40].flatMap(px => rect(px - 5, H - 4, 10, 3)), 'rgba(20,40,40,.8)');
        } else {
            d.fill(rect(e.u0, gy - 3, e.L, lobby + 3), '#132626');
            for (let x = e.u0 + 15; x < e.u0 + e.L - 10; x += 30) { d.fill(rect(x, gy + 2, 12, 7), C.glass); if ((x | 0) % 3) l.fill(rect(x, gy + 2, 12, 7), 'rgba(222,250,255,.6)'); }
        }
        d.fill(rect(e.u0, H - 1, e.L, 1), '#081010');
    }
}

function wing(d, l, t, H, L) {
    const front = frontOf(t), gy = H - P.lobby;
    d.fill(rect(0, 0, L, H), C.teal_lo);
    d.fill(rect(0, 0, L, 2.2), 'rgba(200,240,240,.35)'); d.fill(rect(0, 2.2, L, 1.4), C.teal_hi);
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const pw = 9, n = Math.floor(e.L / pw), x0 = e.u0 + (e.L - n * pw) / 2, clear = [], frost = [], sheen = [], litClear = [], litFrost = [];
        for (let i = 0; i < n; i++) for (let y = 4.6; y + 6 <= (e === front ? gy - 1 : H - 2); y += 6.4) {
            const x = x0 + i * pw, k = (i * 5 + Math.round(y) * 3 + Math.round(e.u0)) % 7, pane = rect(x + .4, y, pw - .8, 5.8);
            (k === 0 ? clear : frost).push(...pane); (k === 0 ? litClear : litFrost).push(...pane);
            if (k) sheen.push(...rect(x + .4, y, pw - .8, 2));
        }
        if (clear.length) { d.fill(clear, C.glass); l.fill(litClear, 'rgba(222,250,255,.7)'); }
        if (frost.length) { d.fill(frost, C.frost); d.fill(sheen, 'rgba(255,255,255,.08)'); l.fill(litFrost, 'rgba(122,255,216,.32)'); }
        if (e !== front) continue;
        d.fill(rect(e.u0, gy - 1, e.L, 1.4), '#081416');
        d.fill(rect(e.u0 + 6, gy + 1, e.L - 12, P.lobby - 2), '#0f2a2e'); l.fill(rect(e.u0 + 6, gy + 1, e.L - 12, P.lobby - 2), 'rgba(210,255,250,.7)');
        const mull = []; for (let x = e.u0 + 6; x <= e.u0 + e.L - 6; x += 16) mull.push(...rect(x - .3, gy + 1, .6, P.lobby - 2));
        d.fill(mull, '#8fb6b8'); l.fill(mull, '#000');
        const cx = e.u0 + e.L - 30, cy = gy - 6, cross = [...rect(cx - 1.4, cy - 4, 2.8, 8), ...rect(cx - 4, cy - 1.4, 8, 2.8)];
        d.fill(cross, '#2fd6a8'); l.fill(cross, C.cyan_soft);
        letters(d, l, 'P H A R M A C Y', e.u0 + 70, gy - 6, 2.6, '#5fe6ee', .4);
    }
}

function canopy(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#2a4a4e'); d.fill(rect(0, 0, L, .4), 'rgba(200,250,255,.5)');
    d.fill(rect(0, H - .5, L, .5), C.cyan); l.fill(rect(0, 0, L, H), C.cyan);
}

function crossOf(cx, cy, a, b) { return [...rect(cx - a, cy - b, a * 2, b * 2), ...rect(cx - b, cy - a, b * 2, a * 2)]; }

function wardRoof(art, glow, t) {
    const [x, y] = t.box, cx = x + 125, cy = y + 210;
    if (glow) { art.fill(crossOf(cx, cy, 10, 32), 'rgba(0,243,255,.5)'); art.stroke(rect(x + 6, y + 6, 238, 388), C.cyan, 2); return; }
    art.fill(rect(x, y, 250, 400), '#1a2c2c');
    const seams = []; for (let xx = x + 20; xx < x + 250; xx += 20) moveLine(seams, [xx, y + 8], [xx, y + 392]); art.stroke(seams, 'rgba(0,0,0,.25)', 1);
    art.stroke(rect(x + 4, y + 4, 242, 392), C.teal_hi, 8); art.stroke(rect(x + 9, y + 9, 232, 382), 'rgba(0,243,255,.5)', 1);
    art.fill(crossOf(cx, cy, 12, 34), '#cfe4e4'); art.fill(crossOf(cx, cy, 10, 32), '#0f9aa6');
    for (const [px, py, w, h] of [[x + 24, y + 24, 56, 38], [x + 170, y + 24, 50, 34], [x + 24, y + 320, 40, 40]]) {
        art.fill(rect(px + 4, py + 4, w, h), 'rgba(0,0,0,.35)');
        art.paint(rect(px, py, w, h), { fill: '#9aa6a6' }); art.stroke(rect(px + .5, py + .5, w - 1, h - 1), '#5a6666', 1);
        art.fill([circle(px + w / 2, py + h / 2, Math.min(w, h) * .32)], '#4a5656');
        const fan = []; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4, ox = Math.cos(a) * h * .3, oy = Math.sin(a) * h * .3; moveLine(fan, [px + w / 2 - ox, py + h / 2 - oy], [px + w / 2 + ox, py + h / 2 + oy]); }
        art.stroke(fan, '#2a3434', 1);
    }
}

/** The healing garden: a timber deck, raked gravel round its stones, bamboo, benches, path lights (lit at night). */
function gardenRoof(art, glow, t) {
    const [x, y] = t.box, lights = [[x + 30, y + 30], [x + 220, y + 30], [x + 30, y + 220], [x + 220, y + 220], [x + 125, y + 125]];
    if (glow) { for (const [px, py] of lights) art.paint(rect(px - 14, py - 14, 28, 28), { fill: radial([px, py], 0, [px, py], 14, [[0, 'rgba(200,255,240,.8)'], [1, 'rgba(122,255,216,0)']]) }); return; }
    art.fill(rect(x, y, 250, 250), '#2a3a34');
    art.fill(rect(x + 10, y + 10, 230, 60), '#7a5a40');
    const boards = []; for (let xx = x + 16; xx < x + 240; xx += 6) moveLine(boards, [xx, y + 10], [xx, y + 70]); art.stroke(boards, 'rgba(40,24,12,.35)', .8);
    art.fill(rect(x + 10, y + 80, 230, 160), '#9e9a8e');
    const rake = 'rgba(70,66,56,.45)', rows = []; for (let yy = y + 86; yy < y + 236; yy += 5) moveLine(rows, [x + 12, yy], [x + 238, yy]); art.stroke(rows, rake, .8);
    for (const [sx, sy, r] of [[x + 90, y + 140, 14], [x + 170, y + 190, 10], [x + 60, y + 205, 8]]) {
        art.fill([circle(sx, sy, r * 2.4)], '#9e9a8e');
        for (let k = 1; k <= 3; k++) art.stroke([circle(sx, sy, r + k * 4)], rake, .8);
        art.fill([ellipse(sx, sy, r, r * .8, .4)], '#5a5c58'); art.fill([ellipse(sx - r * .3, sy - r * .3, r * .4, r * .3, .4)], 'rgba(255,255,255,.15)');
    }
    for (const [bx, by] of [[x + 225, y + 95], [x + 225, y + 130], [x + 25, y + 95]]) for (let k = 0; k < 9; k++) art.fill([circle(bx + Math.cos(k * 2.4) * 6, by + Math.sin(k * 2.4) * 6, 4)], k % 2 ? '#4f8a46' : '#77a25d');
    art.fill([x + 60, x + 150].flatMap(bx => rect(bx, y + 30, 40, 9)), '#5a4030');
    for (const [px, py] of lights) art.fill([circle(px, py, 2.5)], '#2a3434');
    art.stroke(rect(x + 2.5, y + 2.5, 245, 245), 'rgba(200,240,240,.6)', 3);
}

function canopyRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box;
    if (glow) { art.stroke(rect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2), 'rgba(0,243,255,.8)', 2); return; }
    art.fill(rect(x0, y0, x1 - x0, y1 - y0), 'rgba(58,106,112,.85)');
    const bars = []; for (let x = x0 + 13; x < x1; x += 13) moveLine(bars, [x, y0], [x, y1]); art.stroke(bars, 'rgba(200,250,255,.35)', .8);
    art.stroke(rect(x0 + .5, y0 + .5, x1 - x0 - 1, y1 - y0 - 1), C.cyan, 1);
}

/** Dr. Yin's tiers, for `tieredBuilding`. */
export function drYins(record) {
    const ledge = (z, lip) => ({ z, out: 2.4, th: 2.4, top: C.teal_hi, band: [24, 44, 44], lip }), shade = [6, 16, 18];
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, lamps: LOOK.entrance_lamps, facing: record?.facing === 'N' ? 'N' : 'S',
        tiers: [
            { id: 'ward', rect: [0, 0, 250, 400], z0: 0, z1: P.ward, fill: C.teal, paint: ward, shade, ledges: [ledge(P.lobby, 'rgba(0,243,255,.8)'), ledge(P.ward, 'rgba(122,255,216,.7)')], roof_glow: true, roof: wardRoof },
            { id: 'wing', rect: [250, 150, 250, 250], z0: 0, z1: P.wing, fill: C.teal_lo, paint: wing, shade, ledges: [ledge(P.wing, 'rgba(200,240,240,.7)')], roof_glow: true, roof: gardenRoof },
            // a px off the wall: a tier back to back with a wall hides it below its top
            { id: 'canopy', solid: false, rect: [60, 401, 130, 22], z0: P.lobby - 1.5, z1: P.lobby, fill: '#2a4a4e', paint: canopy, shade, roof_glow: true, roof: canopyRoof }
        ]
    };
}
