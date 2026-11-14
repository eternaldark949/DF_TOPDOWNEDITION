import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, roundRect, polygon, circle, ellipse, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { moveLine } from './city-building-art.mjs';

/**
 * Biggs Park, a lacquer-and-brass fairground pavilion, as a tiered building (`city-tiered.mjs`): the pavilion
 * three floors high in wine lacquer, brass pilasters between arched windows lit warm and a bulb row under the
 * eave, its striped canvas roof and the glazed lantern rising out of it under the brass star; the entrance block
 * in front, lower, with the grand arch ringed with marquee bulbs, mirror panels under stars either side and the
 * Biggs marquee on its roof; the plaza with the ticket booths in front.
 * The look is the `biggs_park` section of `data/city-landmarks.json`; the classic is `legacy/buildings/biggs-park.js`.
 */
const LOOK = LANDMARKS.biggs_park, C = LOOK.colors, P = LOOK.plan;
const frontOf = t => t.mitre.find(e => e && !e.hidden && e.ny > .99);

function box(art, x, y, w, h, fill, stroke, r = 0, width = 1.2) { art.paint(r ? roundRect(x, y, w, h, r) : rect(x, y, w, h), { fill: fill ?? null, stroke: stroke ?? null, stroke_width: width }); }
function star(x, y, r) { const pts = []; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, d = i % 2 ? r * .42 : r; pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); } return polygon(pts); }
function title(art, s, x, y, size, colour, script = false) { art.text(s, x, y, { font: { family: script ? LOOK.script_font : LOOK.font, size }, align: 'center', baseline: 'middle' }, { fill: colour }); }
/** Many dots as one path. */
const dots = (list, r) => list.flatMap(([x, y]) => [['move', x + r, y], circle(x, y, r), ['close']]);
/** An arch x0..x1 wide, from its foot yb up to the top of its round head at yt. */
function arch(x0, x1, yt, yb) { const r = (x1 - x0) / 2, xc = x0 + r; return [['move', x0, yb], ['line', x0, yt + r], ellipse(xc, yt + r, r, r, 0, Math.PI, 0), ['line', x1, yb], ['close']]; }
/** A bar from (cx, cy) out to `len` at angle a, .4 thick. */
function spoke(cx, cy, a, len) { const c = Math.cos(a), s = Math.sin(a), p = (u, v) => [cx + u * c - v * s, cy + u * s + v * c]; return polygon([p(0, -.2), p(len, -.2), p(len, .2), p(0, .2)]); }

/** Wine lacquer: a brass cornice with a bulb row under it, brass pilasters, arched windows, a cream dado and a dark plinth. */
function lacquer(d, l, t, H, L, { skip } = {}) {
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, '#7a3a44'], [1, '#3a1d27']]) });
    d.fill(rect(0, 0, L, 2.2), C.brass); d.fill(rect(0, 0, L, .5), '#f0d39a'); d.fill(rect(0, 2.2, L, .5), '#6a4a2a');
    const bulbs = []; for (let x = 2; x < L; x += 5) bulbs.push([x, 4]);
    d.fill(dots(bulbs, .75), '#c7a377'); l.fill(dots(bulbs, .9), '#ffe4ac');
    d.fill(rect(0, H - 5.2, L, 1.2), C.cream); d.fill(rect(0, H - 4, L, 4), '#2a141d'); d.fill(rect(0, H - 4, L, .4), 'rgba(188,148,91,.5)');
    const pil = [], pilHi = [], courses = [], courseHi = [], frames = [], panes = [], sheen = [], bars = [], stars = [], lit = new Map(), litBars = [];
    for (const e of t.mitre) {
        if (!e || e.hidden || skip?.(e)) continue;
        const n = Math.max(1, Math.round(e.L / 24));
        for (let i = 0; i <= n; i++) { const x = e.u0 + e.L * i / n; pil.push(...rect(x - .7, 5.5, 1.4, H - 11)); pilHi.push(...rect(x - .7, 5.5, .4, H - 11)); }
        const rows = Math.max(1, Math.round((H - 14.5) / 20)), rh = (H - 14.5) / rows;
        for (let r = 1; r < rows; r++) { const y = 7 + r * rh - 1.6; courses.push(...rect(e.u0, y, e.L, .9)); courseHi.push(...rect(e.u0, y, e.L, .3)); }
        for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
            const xc = e.u0 + e.L * (i + .5) / n, w = Math.min(11, e.L / n * .5), x0 = xc - w / 2, x1 = xc + w / 2, yt = 7 + r * rh + (r ? 1.6 : 0), yb = 7 + (r + 1) * rh - (r < rows - 1 ? 3.2 : .5);
            if (yb - yt < w) continue;
            frames.push(...arch(x0 - 1, x1 + 1, yt - 1, yb + .6)); panes.push(...arch(x0, x1, yt, yb)); sheen.push(...rect(x0, yt, w * .35, yb - yt));
            bars.push(['move', xc, yt], ['line', xc, yb], ['move', x0, yt + w / 2], ['line', x1, yt + w / 2]); stars.push(...star(xc, yt - 2.6, 1.3));
            if ((i * 5 + r * 3 + Math.round(e.u0)) % 4 !== 0) {
                const key = `${yt},${yb}`; if (!lit.has(key)) lit.set(key, { yt, yb, clip: [], fill: [] });
                const g = lit.get(key); g.clip.push(...arch(x0, x1, yt, yb)); g.fill.push(...rect(x0, yt, w, yb - yt));
                litBars.push(...rect(xc - .2, yt, .4, yb - yt), ...rect(x0, yt + w / 2 - .2, w, .4));
            }
        }
    }
    if (pil.length) { d.fill(pil, C.brass); d.fill(pilHi, 'rgba(255,236,190,.35)'); }
    if (courses.length) { d.fill(courses, C.brass); d.fill(courseHi, 'rgba(255,236,190,.4)'); }
    if (!panes.length) return;
    d.fill(frames, C.cream); d.fill(panes, '#13232b');
    d.enter().clip(panes); d.fill(sheen, 'rgba(200,235,230,.12)'); d.fill(panes, 'rgba(255,200,130,.12)'); d.leave();
    d.stroke(bars, C.brass, .4); d.fill(stars, C.brass);
    for (const g of lit.values()) { l.enter().clip(g.clip); l.paint(g.fill, { fill: linear([0, g.yt], [0, g.yb], [[0, 'rgba(255,190,120,.7)'], [1, 'rgba(255,220,160,.95)']]) }); l.leave(); }
    if (litBars.length) { l.enter().clip([...lit.values()].flatMap(g => g.clip)); l.fill(litBars, '#000'); l.leave(); }
}

const pavilion = (d, l, t, H, L) => lacquer(d, l, t, H, L);

function entrance(d, l, t, H, L) {
    const e = frontOf(t);
    lacquer(d, l, t, H, L, { skip: m => m === e });
    if (!e) return;
    const X = px => e.u0 + (px - 50), cx = X(225);
    const pil = []; for (let i = 0; i <= 7; i++) { const x = e.u0 + e.L * i / 7; if (Math.abs(x - cx) >= 30) pil.push(...rect(x - .7, 5.5, 1.4, H - 11)); } d.fill(pil, C.brass);
    for (const s of [-1, 1]) for (const px of [110, 165]) {
        const x0 = X(s < 0 ? px : 450 - px) - 9, x1 = x0 + 18, yt = 7, yb = H - 6;
        d.fill(rect(x0 - .8, yt - .8, 19.6, yb - yt + 1.6), C.cream);
        d.paint(rect(x0, yt, 18, yb - yt), { fill: linear([x0, yt], [x1, yb], [[0, '#5a6a72'], [.5, '#2a3a44'], [1, '#46525a']]) });
        d.fill(polygon([[x0 + 2, yt], [x0 + 7, yt], [x0 + 2, yt + 6]]), 'rgba(255,255,255,.18)');
        d.fill(star(x0 + 9, (yt + yb) / 2, 3.2), C.brass);
        l.fill(rect(x0, yt, 18, yb - yt), 'rgba(255,200,140,.25)');
    }
    const aw = 44, x0 = cx - aw / 2, x1 = cx + aw / 2, yt = 1.2, yb = H, spring = yt + 1.6 + aw / 2;
    d.fill(arch(x0 - 3, x1 + 3, yt - 1, yb), C.brass); d.fill(arch(x0 - 1.4, x1 + 1.4, yt + .2, yb), '#2a141d');
    d.paint(arch(x0, x1, yt + 1.6, yb), { fill: linear([0, yt], [0, yb], [[0, '#31424a'], [1, '#13232b']]) });
    const leaves = [...rect(x0 + 2, spring, aw / 2 - 2.4, yb - spring), ...rect(cx + .4, spring, aw / 2 - 2.4, yb - spring)];
    d.fill(leaves, C.wine); d.stroke(leaves, C.brass, .5);
    d.fill([cx - aw / 4, cx + aw / 4].flatMap(sx => star(sx, spring + (yb - spring) * .45, 3)), C.brass);
    const fan = []; for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; moveLine(fan, [cx, spring], [cx + Math.cos(a) * aw / 2, spring + Math.sin(a) * aw / 2]); }
    d.stroke(fan, C.brass, .4);
    l.enter().clip(arch(x0, x1, yt + 1.6, spring + .4));
    l.paint(rect(x0, yt, aw, spring - yt + 1), { fill: radial([cx, spring], 0, [cx, spring], aw / 2, [[0, 'rgba(255,230,180,1)'], [1, 'rgba(255,180,120,.5)']]) });
    const spokes = []; for (let k = 1; k < 8; k++) spokes.push(...spoke(cx, spring, Math.PI + k * Math.PI / 8, aw / 2)); l.fill(spokes, '#000'); l.leave();
    const ring = [];
    for (let k = 0; k <= 16; k++) { const a = Math.PI + k * Math.PI / 16, r = aw / 2 + 2.2; ring.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]); }
    for (const s of [-1, 1]) for (let y = spring + 2; y < yb - 1; y += 3.2) ring.push([cx + s * (aw / 2 + 2.2), y]);
    d.fill(dots(ring, .75), '#f0d39a'); l.fill(dots(ring, 1), '#ffe4ac');
}

function lantern(d, l, t, H, L) {
    d.fill(rect(0, 0, L, H), '#314952'); d.fill(rect(0, 0, L, H * .4), 'rgba(223,244,234,.14)'); l.fill(rect(0, 0, L, H), 'rgba(255,214,150,.85)');
    const bars = [...rect(0, 0, L, 1.4), ...rect(0, H - 1.4, L, 1.4)]; for (let x = 0; x < L; x += 6) bars.push(...rect(x - .5, 0, 1, H));
    d.fill(bars, C.brass); l.fill(bars, '#000');
}

/** Bulbs round the pavilion's canvas. */
function rimBulbs(x, y) {
    const list = [];
    for (let xx = 16; xx < 450; xx += 19) list.push([x + xx, y + 10], [x + xx, y + 239]);
    for (let yy = 29; yy < 235; yy += 19) for (const xx of [10, 440]) list.push([x + xx, y + yy]);
    return dots(list, 1.8);
}

function pavilionRoof(art, glow, t) {
    const [x, y] = t.box;
    if (!glow) {
        box(art, x, y, 450, 250, C.wine, C.brass, 7);
        art.enter().clip(roundRect(x + 6, y + 6, 438, 238, 4));
        const edges = [];
        for (let xx = 0; xx <= 450; xx += 37.5) edges.push([xx, 0]);
        for (let yy = 31.25; yy <= 250; yy += 31.25) edges.push([450, yy]);
        for (let xx = 412.5; xx >= 0; xx -= 37.5) edges.push([xx, 250]);
        for (let yy = 218.75; yy >= 0; yy -= 31.25) edges.push([0, yy]);
        const cream = [], wine = [];
        edges.forEach((a, i) => { const b = edges[(i + 1) % edges.length]; (i % 2 ? wine : cream).push(...polygon([[x + 225, y + 125], [x + a[0], y + a[1]], [x + b[0], y + b[1]]])); });
        art.fill(cream, C.cream); art.fill(wine, C.wine);
        art.paint(rect(x, y, 450, 250), { fill: radial([x + 208, y + 108], 12, [x + 225, y + 125], 235, [[0, 'rgba(255,238,206,.24)'], [.45, 'rgba(36,10,20,.12)'], [1, 'rgba(20,7,18,.64)']]) });
        art.leave();
    }
    art.fill(rimBulbs(x, y), glow ? '#ffe4ac' : '#c7a377');
}

function lanternRoof(art, glow, t) {
    const [x, y, x1, y1] = t.box, w = x1 - x, h = y1 - y;
    if (glow) { art.fill(roundRect(x + 9, y + 7, w - 18, h - 24, 18), 'rgba(255,214,150,.35)'); return; }
    box(art, x, y, w, h, '#311d29', C.brass, 20);
    box(art, x + 9, y + 7, w - 18, h - 24, '#314952', '#d1ad75', 18);
    art.stroke([['move', x + 18, y + 18], ['line', x + 79, y + 18], ['line', x + 91, y + 39]], 'rgba(223,244,234,.25)', 1);
    art.fill(star(x + w / 2, y + 42, 24), C.brass);
}

function entranceRoof(art, glow, t) {
    const x = t.box[0] - 50, y = t.box[1] - 250;
    if (!glow) {
        box(art, x + 51, y + 250, 348, 149, '#3e2530', C.brass, 5);
        const a = [], b = []; for (let yy = 266; yy < 390; yy += 13) (yy % 2 ? a : b).push(...rect(x + 58, y + yy, 334, 5));
        art.fill(a, '#502733'); art.fill(b, '#47232e');
        box(art, x + 85, y + 289, 280, 84, '#1f1821', C.brass, 13);
        box(art, x + 91, y + 295, 268, 72, null, '#8e5b59', 10);
    }
    title(art, 'Biggs', x + 225, y + 324, 46, glow ? '#ffe2ad' : C.cream, true);
    title(art, 'A M U S E M E N T   P A R K', x + 225, y + 354, 8, glow ? '#eec8ac' : C.brass);
    art.fill([110, 340].flatMap(dx => star(x + dx, y + 326, 8)), glow ? '#f5c381' : C.brass);
}

/** The plaza in front: the pavilion's shadow, the striped forecourt, the star mat, the ticket booths. */
function ground(scene, b) {
    const x = b.x, y = b.y;
    scene.fill([...rect(x + 12, y + 15, 450, 250), ...rect(x + 62, y + 265, 350, 150)], 'rgba(0,0,0,.36)');
    box(scene, x + 65, y + 400, 320, 84, '#29242b', C.brass, 4);
    const joints = []; for (let xx = 80; xx < 385; xx += 24) moveLine(joints, [x + xx, y + 401], [x + xx, y + 483]); scene.stroke(joints, 'rgba(220,192,151,.14)', 1);
    box(scene, x + 172, y + 400, 106, 80, C.wine, C.brass, 2);
    scene.stroke(rect(x + 179, y + 408, 92, 64), '#9e6f5c', 1);
    scene.fill(star(x + 225, y + 443, 16), C.brass);
    for (const dx of [89, 305]) {
        box(scene, x + dx + 3, y + 421, 59, 39, 'rgba(0,0,0,.3)', null, 4);
        box(scene, x + dx, y + 416, 56, 36, '#4a2730', C.brass, 3);
        box(scene, x + dx + 5, y + 421, 46, 20, '#13232b', '#82795e', 2);
        scene.fill(rect(x + dx + 4, y + 444, 48, 4), C.cream);
        title(scene, 'TICKETS', x + dx + 28, y + 432, 7, C.gold);
    }
    title(scene, 'AMUSEMENTS  •  AFTER DARK', x + 225, y + 477, 7, C.cream);
}

/** Biggs Park's tiers, for `tieredBuilding`. */
export function biggsPark() {
    const brass = (z, out) => ({ z, out, th: 2.4, top: '#c7a377', band: [120, 90, 56], lip: '#f0d39a' }), shade = [24, 8, 14];
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', ground,
        tiers: [
            { id: 'pavilion', rect: [0, 0, 450, 250], z0: 0, z1: P.pavilion, fill: C.wine, paint: pavilion, shade, ledges: [brass(P.pavilion, 3)], roof_glow: true, roof: pavilionRoof },
            { id: 'lantern', on: 'pavilion', solid: false, rect: P.lantern, z0: P.pavilion, z1: P.pavilion + P.lantern_h, fill: '#314952', paint: lantern, shade, ledges: [brass(P.pavilion + P.lantern_h, 2)], roof_glow: true, roof: lanternRoof },
            { id: 'entrance', rect: [50, 250, 350, 150], z0: 0, z1: P.entrance, fill: C.wine, paint: entrance, shade, ledges: [brass(P.entrance, 3)], roof_glow: true, roof: entranceRoof }
        ]
    };
}
