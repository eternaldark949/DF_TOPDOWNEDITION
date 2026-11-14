import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, roundRect, circle, ellipse, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, dotPath, polyPath, moveLine } from './city-building-art.mjs';
import { TIER } from './city-tiered.mjs';

/**
 * The Cozy Cafe, the hub's corner cafe on Crimson Blvd, as a tiered building (`city-tiered.mjs`): a brick
 * house with cream quoins, multi-pane shop windows, flower boxes and a signboard over the door; two striped
 * awnings; a shingled hip roof with the hearth's chimney over the back, a roof terrace with parasols and
 * string lights over the front; on the pavement a step, a planter, a chalkboard and two bistro tables.
 * The look is the `cozy_cafe` section of `data/city-landmarks.json`; the classic is `legacy/buildings/cozy-cafe.js`.
 */
const LOOK = LANDMARKS.cozy_cafe, T = LOOK.colors, P = LOOK.plan, Z = TIER.z_scale;
const pathOf = pts => [...pts.map(([x, y], i) => [i ? 'line' : 'move', x, y]), ['close']];

/** The house's walls: brick, quoins, the shop windows and the windows above, the cornice; the door and signboard on the front. */
function wall(d, l, t, H, L) {
    const front = t.mitre.find(e => e && !e.hidden && e.ny > .99), r = classicRandom(5150);
    d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [0, H], [[0, T.brick], [1, T.brick_lo]]) });
    const odd = { a: [], b: [] };
    for (let i = 0; i < L * H / 30; i++) { const key = r() < .5 ? 'a' : 'b'; odd[key].push(...rect(r() * L, r() * H, 2.4, .6)); }
    d.fill(odd.a, 'rgba(125,65,48,.5)'); d.fill(odd.b, 'rgba(52,24,18,.35)');
    const mortar = []; for (let y = 1.25; y < H; y += 1.25) mortar.push(...rect(0, y, L, .25)); d.fill(mortar, T.mortar);
    const cx = front ? front.u0 + P.door : -1e4, gl = H - 1.5, gt = H - 13, ut = H - 26, ub = H - 18;
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        d.fill([...rect(e.u0, 0, 5, H), ...rect(e.u0 + e.L - 5, 0, 5, H)], T.cream);
        const q = []; for (let y = 2; y < H; y += 2.5) q.push(...rect(e.u0, y, 5, .3), ...rect(e.u0 + e.L - 5, y, 5, .3)); d.fill(q, 'rgba(120,90,60,.35)');
        const spans = [];
        if (e === front) spans.push([e.u0 + 16, cx - 30], [cx + 30, e.u0 + e.L - 16]);
        else { const n = Math.max(2, Math.round(e.L / 90)); for (let i = 0; i < n; i++) spans.push([e.u0 + e.L * (i + .18) / n, e.u0 + e.L * (i + .82) / n]); }
        for (const [a, b] of spans) {
            d.fill(rect(a - 1.6, gt - .8, b - a + 3.2, gl - gt + .8), T.cream);
            d.paint(rect(a, gt, b - a, gl - gt - .6), { fill: linear([0, gt], [0, gl], [[0, '#4a2e1c'], [1, T.glass]]) });
            d.fill(rect(a, gt, b - a, gl - gt - .6), 'rgba(255,200,120,.2)'); l.fill(rect(a, gt, b - a, gl - gt - .6), 'rgba(255,186,96,.8)');
            const n = Math.max(2, Math.round((b - a) / 22)), bars = [];
            for (let i = 1; i < n; i++) { const x = a + (b - a) * i / n; bars.push(...rect(x - .6, gt, 1.2, gl - gt)); }
            bars.push(...rect(a, gt + 2.6, b - a, .5));
            d.fill(bars, T.wood); l.fill(bars, '#000');
            d.fill(rect(a - 1.6, gl - .8, b - a + 3.2, .8), T.wood);
            for (let x = a + 8; x < b - 6; x += 18) { d.fill([...rect(x, gl - 4.6, 9, .6), ...rect(x + 4, gl - 4.6, 1, 3.6)], 'rgba(40,20,10,.35)'); l.fill([circle(x + 4.5, gt + 4.6, 1.2)], 'rgba(255,230,170,.9)'); }
        }
        const nu = Math.max(3, Math.round(e.L / 70));
        for (let i = 0; i < nu; i++) {
            const a = e.u0 + e.L * (i + .3) / nu, b = e.u0 + e.L * (i + .7) / nu;
            if (e === front && b > cx - 58 && a < cx + 58) continue;
            const cross = [...rect((a + b) / 2 - .5, ut, 1, ub - ut), ...rect(a, (ut + ub) / 2 - .3, b - a, .6)];
            d.fill(rect(a - 1.2, ut - .8, b - a + 2.4, ub - ut + 1.6), T.cream);
            d.fill(rect(a, ut, b - a, ub - ut), T.glass); d.fill(rect(a, ut, b - a, ub - ut), 'rgba(255,200,120,.14)'); d.fill(cross, T.cream);
            if ((i * 7 + Math.round(e.u0)) % 3) { l.fill(rect(a, ut, b - a, ub - ut), 'rgba(255,214,140,.6)'); l.fill(cross, '#000'); }
            d.fill(rect(a - 2, ub + .8, b - a + 4, 1.4), T.wood);
            for (let x = a - 1.4; x < b + 2; x += 2.2) {
                d.fill([circle(x, ub + .6, 1)], r() < .6 ? T.leaf : T.leaf_hi);
                if (r() < .4) d.fill(rect(x - .4, ub, .8, .6), ['#f2c14e', '#e86a5c', '#f6ecd8'][Math.floor(r() * 3)]);
            }
        }
    }
    d.fill(rect(0, 0, L, .9), T.cream); d.fill(rect(0, .9, L, 1.4), T.wood); d.fill(rect(0, 2.3, L, .4), 'rgba(0,0,0,.25)');
    if (!front) return;
    const dt = H - 14, panes = [...rect(cx - 10, dt + 2, 8.5, 6), ...rect(cx + 1.5, dt + 2, 8.5, 6)];
    d.fill(rect(cx - 14, dt - 1, 28, H - dt + 1), T.cream); d.fill(rect(cx - 12, dt, 24, H - dt), T.wood);
    d.fill(panes, 'rgba(255,200,120,.35)'); l.fill(panes, 'rgba(255,200,120,.95)');
    d.fill(rect(cx - .4, dt, .8, H - dt), T.wood_hi); d.fill([...rect(cx - 2.6, dt + 9, 1, 1.6), ...rect(cx + 1.6, dt + 9, 1, 1.6)], '#d8b26a');
    const bx = cx - 52, by = H - 22.6, bw = 104, bh = 7.4;
    d.fill(rect(bx + 1, by + bh, bw - 2, .8), 'rgba(0,0,0,.35)');
    d.paint(rect(bx, by, bw, bh), { fill: linear([0, by], [0, by + bh], [[0, '#4a2a1a'], [1, '#2a160d']]) });
    d.stroke(rect(bx + .25, by + .25, bw - .5, bh - .5), '#c99a52', .5); l.stroke(rect(bx + .25, by + .25, bw - .5, bh - .5), 'rgba(255,190,90,.55)', .4);
    for (const [c, col, cup] of [[d, '#ffbf4d', T.cream], [l, 'rgba(255,196,96,1)', 'rgba(255,214,150,.8)']]) {
        c.enter({ matrix: [1, 0, 0, .5, cx + 6, by + bh / 2 + .4] });                        // (the strip's y is design units, twice the world's)
        c.text(LOOK.sign.text, 0, 0, { font: { family: LOOK.sign.font, size: LOOK.sign.size }, align: 'center', baseline: 'middle' }, { fill: col });
        c.leave();
        const ux = bx + 11, uy = by + bh / 2 + 1;
        c.fill([...rect(ux - 3, uy - 1.6, 5.5, 3), ...rect(ux + 2.5, uy - 1, 1, 1.6), ...rect(ux - 1.4, uy - 3.2, .5, 1.2), ...rect(ux + .8, uy - 3.4, .5, 1.2)], cup);
    }
    for (const s of [-1, 1]) { const lx = cx + s * 20; d.fill(rect(lx - 1.4, dt + 1, 2.8, 3.2), '#1e1410'); d.fill(rect(lx - .9, dt + 1.6, 1.8, 2), '#ffd690'); l.fill(rect(lx - .9, dt + 1.6, 1.8, 2), 'rgba(255,200,110,1)'); }
}

/** An awning's edges: amber and cream stripes, a scalloped valance, warm light under it at night. */
function awningWall(d, l, t, H, L) {
    const w = 6.5;
    for (let x = 0, i = 0; x < L; x += w, i++) d.fill(rect(x, 0, w, H), i % 2 ? T.stripe_b : T.stripe_a);
    d.fill(rect(0, 0, L, .5), 'rgba(0,0,0,.18)');
    for (let x = 0, i = 0; x < L; x += w, i++) d.fill([['move', x + w, H - .9], ellipse(x + w / 2, H - .9, w / 2, .9, 0, 0, Math.PI)], i % 2 ? '#d9c7a2' : '#c2741f');
    l.fill(rect(0, H - .6, L, .6), 'rgba(255,190,110,.35)');
}
function houseRoof(art, glow, t) { if (!glow) art.fill(rect(t.box[0], t.box[1], P.w, P.d), T.ridge); }
function awningRoof(art, glow, t) {
    if (glow) return;
    const [x0, y0, x1, y1] = t.box, w = 13;
    for (let x = x0, i = 0; x < x1; x += w, i++) art.fill(rect(x, y0, Math.min(w, x1 - x), y1 - y0), i % 2 ? T.stripe_b : T.stripe_a);
    art.paint(rect(x0, y0, x1 - x0, y1 - y0), { fill: linear([0, y0], [0, y1], [[0, 'rgba(60,30,10,.28)'], [1, 'rgba(255,240,210,.12)']]) });
    art.stroke(moveLine([], [x0, y1 - .4], [x1, y1 - .4]), 'rgba(58,33,22,.55)', .8);
}

/** The hip roof's planes as world points with heights (eave corners, ridge ends). */
function roofGeometry(b) {
    const H = P.house * Z, e = P.eave, x0 = b.x - e, x1 = b.x + P.w + e, y0 = b.y - e, y1 = b.y + P.roof_y1, half = (y1 - y0) / 2, zr = H + P.rise, ry = y0 + half;
    const A = [x0, y0, H], B = [x1, y0, H], C = [x1, y1, H], D = [x0, y1, H], R0 = [x0 + half, ry, zr], R1 = [x1 - half, ry, zr];
    return { x0, x1, y0, y1, half, zr, H, A, B, C, D, R0, R1, planes: [
        { name: 'N', pts: [A, B, R1, R0], fill: T.roof_n }, { name: 'W', pts: [D, A, R0], fill: T.roof_w },
        { name: 'E', pts: [B, C, R1], fill: T.roof_e }, { name: 'S', pts: [C, D, R0, R1], fill: T.roof_s }] };
}
const roofZ = (g, x, y) => g.H + P.rise * Math.max(0, Math.min(1, Math.min(x - g.x0, g.x1 - x, y - g.y0, g.y1 - y) / g.half));

/** Over the house, with its lean: the hip roof, the terrace, the chimney. */
function top(art, emissive, t, b, view, time) {
    const g = b.cafeRoof ??= roofGeometry(b), at = p => view.at(p[0], p[1], p[2]);
    // the hip roof: planes turned away first, shingle courses between the hips, then hips, ridge and eaves
    if (!emissive) {
        const area = q => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], c = q[(i + 1) % q.length]; s += a[0] * c[1] - c[0] * a[1]; } return s; };
        const planes = g.planes.map(pl => ({ pl, q: pl.pts.map(at) })).sort((a, c) => (area(a.q) > 0) - (area(c.q) > 0));
        for (const { pl, q } of planes) {
            art.fill(pathOf(q), pl.fill);
            const courses = [], ticks = [];
            for (let i = 1; i < 11; i++) {
                const fr = i / 11, dd = g.half * fr, z = g.H + P.rise * fr;
                const [a, c] = pl.name === 'S' ? [[g.x0 + dd, g.y1 - dd], [g.x1 - dd, g.y1 - dd]] : pl.name === 'N' ? [[g.x0 + dd, g.y0 + dd], [g.x1 - dd, g.y0 + dd]] : pl.name === 'W' ? [[g.x0 + dd, g.y0 + dd], [g.x0 + dd, g.y1 - dd]] : [[g.x1 - dd, g.y0 + dd], [g.x1 - dd, g.y1 - dd]];
                moveLine(courses, view.at(a[0], a[1], z), view.at(c[0], c[1], z));
                const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.floor(len / 16), fr2 = (i - 1) / 11, d2 = g.half * fr2, z2 = g.H + P.rise * fr2;
                for (let j = 1; j < n; j++) {
                    const u = (j + (i % 2) * .5) / n; if (u >= 1) continue;
                    const x = a[0] + (c[0] - a[0]) * u, y = a[1] + (c[1] - a[1]) * u;
                    const ox = pl.name === 'W' ? -(dd - d2) : pl.name === 'E' ? dd - d2 : 0, oy = pl.name === 'N' ? -(dd - d2) : pl.name === 'S' ? dd - d2 : 0;
                    moveLine(ticks, view.at(x, y, z), view.at(x + ox, y + oy, z2));
                }
            }
            art.stroke(courses, 'rgba(20,10,6,.38)', 1); art.stroke(ticks, 'rgba(20,10,6,.22)', .7);
            art.stroke(courses, pl.name === 'S' ? 'rgba(255,214,160,.10)' : 'rgba(255,214,160,.05)', .6);
        }
        const hips = []; for (const [p, q] of [[g.A, g.R0], [g.D, g.R0], [g.B, g.R1], [g.C, g.R1], [g.R0, g.R1]]) moveLine(hips, at(p), at(q));
        art.enter({}, { line_cap: 'round' }); art.stroke(hips, T.ridge, 3.2); art.stroke(hips, 'rgba(214,160,104,.45)', 1); art.leave();
        const eave = []; for (const [p, q] of [[g.A, g.B], [g.B, g.C], [g.D, g.A]]) moveLine(eave, at(p), at(q));
        art.stroke(eave, T.wood, 2.4);
    }
    const sky = [];
    for (const [xa, xb] of P.skylights) {
        const d0 = g.half * .16, d1 = g.half * .5, z0 = g.H + P.rise * .16, z1 = g.H + P.rise * .5;
        polyPath(sky, [[b.x + xa, g.y1 - d0, z0], [b.x + xb, g.y1 - d0, z0], [b.x + xb, g.y1 - d1, z1], [b.x + xa, g.y1 - d1, z1]].map(at));
    }
    if (!emissive) { art.fill(sky, '#2b2422'); art.fill(sky, 'rgba(160,190,220,.14)'); art.stroke(sky, T.cream, 1.3); }
    else art.fill(sky, 'rgba(255,170,80,.26)');
    terrace(art, emissive, b, view);
    chimney(art, emissive, b, g, view, time);
}

/** The roof terrace: its deck and parapet, the parasols, the string lights (flat things, each in the plane of its height). */
function terrace(art, emissive, b, view) {
    const H = P.house * Z, x = b.x, y = b.y + P.roof_y1, w = P.w, h = P.d - P.roof_y1;
    if (!emissive) {
        art.enter({ matrix: view.plane(view.k(H)) });
        art.fill(rect(x, y, w, h), T.deck_lo);
        const planks = [], light = [], joints = [];
        for (let yy = y + 7; yy < y + h; yy += 7) moveLine(planks, [x, yy], [x + w, yy]);
        for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + (r % 3) * 23; xx < x + w; xx += 70) light.push(...rect(xx, yy + 1, 44, 5));
        for (let r = 0, yy = y; yy < y + h; yy += 7, r++) for (let xx = x + 31 + (r % 4) * 17; xx < x + w; xx += 68) moveLine(joints, [xx, yy], [xx, yy + 7]);
        art.stroke(planks, 'rgba(30,16,8,.45)', 1); art.fill(light, 'rgba(160,110,70,.20)'); art.stroke(joints, 'rgba(30,16,8,.35)', 1);
        art.fill([...rect(x, y, 7, h), ...rect(x + w - 7, y, 7, h), ...rect(x, y + h - 7, w, 7)], T.brick);
        art.stroke([['move', x + 3.5, y], ['line', x + 3.5, y + h - 3.5], ['line', x + w - 3.5, y + h - 3.5], ['line', x + w - 3.5, y]], T.cream, 2);
        art.fill(rect(x, y, w, 5), 'rgba(0,0,0,.35)'); art.fill(rect(x + 160, y, 32, 6), T.wood);
        for (const [px, py] of [[x + 16, y + h - 16], [x + w - 16, y + h - 16], [x + 16, y + 16], [x + w - 16, y + 16]]) {
            art.fill([circle(px, py, 9)], '#3a2116');
            for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + (i % 3) * 2.2; art.fill([circle(px + Math.cos(a) * r, py + Math.sin(a) * r, 3.2)], i % 2 ? T.leaf : T.leaf_hi); }
        }
        for (const [tx, ty] of P.parasols) for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2, chx = b.x + tx + Math.cos(a) * 24, chy = b.y + ty + Math.sin(a) * 20;
            art.paint(roundRect(chx - 5, chy - 5, 10, 10, 3), { fill: '#2b1a12', stroke: '#8c6a46', stroke_width: 1 });
        }
        art.leave();
        art.enter({ matrix: view.plane(view.k(H + P.parasol_z)) });
        const R = P.parasol_r;
        for (const [tx, ty] of P.parasols) {
            const px = b.x + tx, py = b.y + ty;
            art.fill([circle(px + 4, py + 5, R)], 'rgba(0,0,0,.25)');
            for (let i = 0; i < 8; i++) { const a0 = i * Math.PI / 4, a1 = a0 + Math.PI / 4; art.fill(pathOf([[px, py], [px + Math.cos(a0) * R, py + Math.sin(a0) * R], [px + Math.cos(a1) * R, py + Math.sin(a1) * R]]), i % 2 ? T.stripe_b : T.stripe_a); }
            art.paint([circle(px, py, R)], { fill: radial([px - 6, py - 6], 2, [px, py], R, [[0, 'rgba(255,240,210,.18)'], [1, 'rgba(60,30,10,.25)']]) });
            const ribs = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; moveLine(ribs, [px, py], [px + Math.cos(a) * R, py + Math.sin(a) * R]); }
            art.stroke(ribs, 'rgba(90,50,20,.55)', .8); art.fill([circle(px, py, 2.6)], T.wood_hi);
        }
        art.leave();
    }
    const y0 = b.y + P.roof_y1 + 6, y1 = b.y + P.d - 6, x0 = b.x + 6, x1 = b.x + P.w - 6, wire = [], bulbs = [];
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y0, x0, y1], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]]) {
        const L = Math.hypot(bx - ax, by - ay), n = Math.round(L / 13), mx = (ax + bx) / 2, my = (ay + by) / 2 + 8;
        wire.push(['move', ax, ay], ['quadratic', mx, my, bx, by]);
        for (let i = 1; i < n; i++) { const s = i / n, px = (1 - s) * (1 - s) * ax + 2 * (1 - s) * s * mx + s * s * bx, py = (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * my + s * s * by; dotPath(bulbs, px, py, 1.7); }
    }
    art.enter({ matrix: view.plane(view.k(H + P.lights_z)) });
    if (!emissive) { art.stroke(wire, 'rgba(30,20,14,.7)', .8); art.fill(bulbs, '#f3dfb0'); }
    else { art.fill(bulbs, 'rgba(255,200,110,.95)'); art.stroke(wire, 'rgba(255,170,60,.10)', 5); }
    art.leave();
}

/** The hearth's brick chimney on the west slope, its pot and a little smoke. */
function chimney(art, emissive, b, g, view, time) {
    const c = P.chimney, x0 = b.x + c.x, y0 = b.y + c.y, x1 = x0 + c.w, y1 = y0 + c.h, zb = roofZ(g, x0 + c.w / 2, y0 + c.h / 2) - 4, zt = zb + c.up, [cx, cy] = view.camera;
    if (!emissive) {
        const side = (ax, ay, bx, by, fill) => art.paint(pathOf([view.at(ax, ay, zb), view.at(bx, by, zb), view.at(bx, by, zt), view.at(ax, ay, zt)]), { fill, stroke: 'rgba(232,190,140,.18)', stroke_width: .7 });
        if (cy > y1) side(x0, y1, x1, y1, T.brick_hi); if (cy < y0) side(x0, y0, x1, y0, T.brick_lo);
        if (cx > x1) side(x1, y0, x1, y1, T.brick); if (cx < x0) side(x0, y0, x0, y1, T.brick);
        art.paint(pathOf([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => view.at(x, y, zt))), { fill: T.brick, stroke: T.cream, stroke_width: 2 });
    }
    const mx = x0 + c.w / 2, my = y0 + c.h / 2;
    art.enter({ matrix: view.plane(view.k(zt)) });
    if (!emissive) { art.fill([circle(mx, my, 8)], '#8a4a32'); art.fill([circle(mx, my, 5)], '#1a0f0b'); }
    else art.fill([circle(mx, my, 4.5)], 'rgba(255,120,40,.5)');
    art.leave();
    if (emissive) return;
    for (let i = 0; i < 5; i++) {
        const ph = (time * .22 + i / 5) % 1, z = zt + 4 + ph * 46, p = view.at(mx + ph * 26 + Math.sin(time + i * 2) * 3, my - ph * 10, z);
        art.fill([circle(p[0], p[1], 5 + ph * 11)], `rgba(214,206,198,${(.22 * (1 - ph)).toFixed(3)})`);
    }
}

/** Down on the pavement: the step and mat, a planter, the chalkboard and two bistro tables. */
function ground(scene, b) {
    const x = b.x, y = b.y, wy = y + P.d, cx = x + P.door;
    scene.fill(roundRect(cx - 48, wy, 96, 16, 6), '#5a3326');
    const lines = []; for (let i = 1; i < 6; i++) moveLine(lines, [cx - 48 + i * 16, wy], [cx - 48 + i * 16, wy + 16]); scene.stroke(lines, 'rgba(232,190,140,.22)', 1);
    scene.fill(roundRect(cx - 24, wy + 3, 48, 10, 2), '#8a6a43'); scene.stroke(rect(cx - 21, wy + 5, 42, 6), 'rgba(40,24,10,.6)', 1);
    scene.fill(rect(x + 10, wy + 2, 52, 13), T.wood); scene.stroke(rect(x + 10.5, wy + 2.5, 51, 12), T.wood_hi, 1);
    for (let i = 0; i < 14; i++) scene.fill([circle(x + 14 + (i * 37 % 46), wy + 5 + (i * 13 % 8), 3.4)], i % 3 ? T.leaf : T.leaf_hi);
    for (let i = 0; i < 9; i++) scene.fill([circle(x + 16 + i * 5.2, wy + 6 + (i % 2) * 5, 1.6)], ['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3]);
    scene.fill(rect(cx + 66, wy + 22, 20, 14), 'rgba(0,0,0,.3)'); scene.fill(rect(cx + 63, wy + 18, 20, 14), T.wood_hi); scene.fill(rect(cx + 65, wy + 20, 16, 10), '#1f2421');
    scene.stroke([['move', cx + 67, wy + 23], ['line', cx + 78, wy + 23], ['move', cx + 67, wy + 26], ['line', cx + 75, wy + 26]], 'rgba(240,235,220,.7)', .8);
    for (const [tx, ty] of [[x + 252, wy + 30], [x + 308, wy + 30]]) {
        scene.fill([ellipse(tx + 3, ty + 4, 13, 11)], 'rgba(0,0,0,.32)');
        for (const a of [Math.PI * .5, Math.PI * 1.5]) { const chx = tx + Math.cos(a) * 15, chy = ty + Math.sin(a) * 13; scene.paint(roundRect(chx - 6, chy - 5, 12, 10, 3), { fill: '#2b1a12', stroke: '#8c6a46', stroke_width: 1 }); }
        scene.paint([circle(tx, ty, 9)], { fill: '#efe4cc', stroke: '#7a5a38', stroke_width: 1.2 });
        scene.fill([circle(tx - 3, ty - 2, 2.4)], '#fff'); scene.fill([circle(tx - 3, ty - 2, 1.4)], '#5b3420'); scene.fill([circle(tx + 3, ty + 2, 1.5)], T.amber_soft);
    }
}

/** The Cozy Cafe's tiers, for `tieredBuilding`. */
export function cozyCafe() {
    const [za, zb] = P.awning_z;
    const awning = i => ({ id: 'awning' + i, solid: false, rect: [P.awnings[i][0], P.d + 1, P.awnings[i][1], 20], z0: za, z1: zb, fill: T.stripe_a, paint: awningWall, shade: [30, 14, 8], roof: awningRoof });
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', ground,
        tiers: [
            { id: 'house', rect: [0, 0, P.w, P.d], z0: 0, z1: P.house, fill: T.brick, paint: wall, shade: [30, 14, 8],
              ledges: [{ z: P.house, out: 2, th: 1.6, top: T.wood, band: [58, 33, 22], lip: 'rgba(239,220,182,.7)' }], roof: houseRoof, top },
            awning(0), awning(1)
        ]
    };
}
