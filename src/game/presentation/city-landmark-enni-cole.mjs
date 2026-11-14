import LANDMARKS from '../data/city-landmarks.json' with { type: 'json' };
import { rect, roundRect, polygon, circle, ellipse, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { classicRandom, moveLine } from './city-building-art.mjs';

/**
 * Enni Cole, the luxury department store on Clinic Way, as a tiered building (`city-tiered.mjs`): a two-storey
 * podium in rose stone (rusticated ashlar, pilasters with a pink uplight at each foot, bronze-framed display
 * windows, a recessed panel with the name in script near each end of every face); out of its front the
 * entrance pavilion with the name over a tall arch; over the podium, set back, the glass floor between black
 * steel piers with the lanterns and the plant on its roof; on the pavilion the curved-glass showroom with the
 * name on its roof; clipped cypresses in brass planters either side of the steps.
 * The look is the `enni_cole` section of `data/city-landmarks.json`; the classic is `legacy/buildings/enni-cole.js`.
 */
const LOOK = LANDMARKS.enni_cole, C = LOOK.colors, P = LOOK.plan;
const pathOf = pts => polygon(pts);
const dots = (list, r) => list.flatMap(([x, y]) => [['move', x + r, y], circle(x, y, r), ['close']]);

/** The name in script: champagne on the day layer, a neon core with its glow on the lit one. */
function script(d, l, s, x, y, size) {
    const how = { font: { family: LOOK.script_font, size }, align: 'center', baseline: 'middle' };
    d.text(s, x + size * .04, y + size * .05, how, { fill: 'rgba(70, 20, 40, 0.55)' }); d.text(s, x, y, how, { fill: C.gold_hi });
    l.text(s, x, y, how, { fill: C.neon, shadow: { color: 'rgba(255, 196, 120, 1)', blur: size * .5, offset: [0, 0] } }); l.text(s, x, y, how, { fill: C.neon });
}

/** Rose ashlar over the whole strip: courses, staggered joints, a little grain. */
function ashlar(d, H, L, r, y0 = 0, course = 4.4) {
    d.paint(rect(0, y0, L, H - y0), { fill: linear([0, y0], [0, H], [[0, C.stone_lt], [.5, C.stone], [1, C.stone_mid]]) });
    const joints = [];
    for (let y = y0 + course, k = 0; y < H - 2; y += course, k++) { moveLine(joints, [0, y], [L, y]); for (let x = (k % 2) * 6; x < L; x += 12) moveLine(joints, [x, y], [x, y + course]); }
    d.stroke(joints, 'rgba(80, 20, 48, 0.24)', .35);
    const light = [], dark = [];
    for (let i = 0; i < L * (H - y0) / 9; i++) { const list = r() < .5 ? light : dark; list.push(...rect(r() * L, y0 + r() * (H - y0), .6 + r(), .6)); }
    // in runs of a few hundred specks: one path of thousands of crossing rects fills far slower
    for (let i = 0; i < light.length; i += 1500) d.fill(light.slice(i, i + 1500), 'rgba(255, 225, 238, 0.07)');
    for (let i = 0; i < dark.length; i += 1500) d.fill(dark.slice(i, i + 1500), 'rgba(70, 18, 44, 0.07)');
}

/** A cornice band at y (moulding, dentils, a brass fillet), h deep. */
function cornice(d, l, L, y, h) {
    d.fill(rect(0, y, L, h), C.stone_lt); d.fill(rect(0, y, L, .8), C.stone_hi);
    const dentils = []; for (let x = 1; x < L; x += 2.6) dentils.push(...rect(x, y + h * .55, 1.3, h * .25)); d.fill(dentils, C.stone_dk);
    d.fill(rect(0, y + h - .7, L, .5), C.gold); d.fill(rect(0, y + h, L, 1.6), 'rgba(50, 10, 30, 0.35)');
    l.fill(rect(0, y, L, h), 'rgba(255, 150, 200, 0.22)');
}

/** Piers from y0 to y1 ([x, w] each): lit edge, shadowed edge, a capital and a base; their pink uplights on the lit layer. */
function piers(d, l, list, y0, y1) {
    if (!list.length) return;
    const all = f => list.flatMap(([x, w]) => f(x, w));
    d.fill(all((x, w) => rect(x, y0, w, y1 - y0)), C.stone_lt);
    d.fill(all(x => rect(x + .6, y0, .9, y1 - y0)), 'rgba(255, 236, 244, 0.18)');
    d.fill(all((x, w) => rect(x + w - 1, y0, 1, y1 - y0)), 'rgba(70, 14, 40, 0.3)');
    d.fill(all((x, w) => rect(x - 1, y0, w + 2, 2)), C.stone_hi);
    d.fill(all((x, w) => [...rect(x - 1, y0 + 2, w + 2, .6), ...rect(x - 1, y1 - 3, w + 2, 3)]), C.stone_lo);
    l.paint(all((x, w) => polygon([[x + w / 2 - 2, y1], [x - 7, y0], [x + w + 7, y0], [x + w / 2 + 2, y1]])), { fill: linear([0, y1], [0, y0], [[0, 'rgba(255, 110, 175, 0.95)'], [.55, 'rgba(240, 80, 150, 0.3)'], [1, 'rgba(240, 80, 150, 0)']]) });
    l.fill(all((x, w) => rect(x + w / 2 - 1.2, y1 - 2, 2.4, 1.2)), 'rgba(255, 250, 240, 0.95)');
}

/** A shop window x0..x1, y0..y1: bronze frame, glass, what's inside (forms on stands, a lamp), lit warm at night. */
function shopWindow(d, l, x0, y0, x1, y1, r, forms = 2, mull = 1) {
    const w = x1 - x0, h = y1 - y0;
    d.fill(rect(x0 - 1.2, y0 - 1.2, w + 2.4, h + 2.4), C.bronze);
    d.paint(rect(x0, y0, w, h), { fill: linear([x0, y0], [x1, y1], [[0, '#3a3034'], [.6, '#4c3b31'], [1, '#2e2a2f']]) });
    d.fill(rect(x0, y0 + h * .55, w, h * .45), 'rgba(214, 160, 104, 0.18)');
    l.paint(rect(x0, y0, w, h), { fill: linear([0, y0], [0, y1], [[0, 'rgba(255, 200, 128, 0.7)'], [1, 'rgba(255, 176, 96, 0.95)']]) });
    for (let k = 0; k < forms; k++) {
        const mx = x0 + w * (k + .5) / forms + (r() - .5) * 2, fh = Math.min(h * .62, 15), my = y1 - 1;
        const col = ['#e9d3a6', '#1c1a1f', '#b0475f', '#f3ece0', '#2f5a4d', '#7b3fa0'][Math.floor(r() * 6)];
        const form = polygon([[mx - .9, my - fh], [mx + .9, my - fh], [mx + fh * .22, my - 1.5], [mx - fh * .22, my - 1.5]]), head = [circle(mx, my - fh - 1.4, 1.3)];
        d.fill(form, col); d.fill(head, '#efe4d6');
        l.enter({}, { blend: 'destination-out' }).fill(form, 'rgba(0, 0, 0, 0.6)').fill(head, 'rgba(0, 0, 0, 0.6)').leave();
    }
    const lamps = [], glints = []; for (let k = 0; k < 4; k++) { const px = x0 + 1 + r() * (w - 2), py = y0 + 1 + r() * h * .3; lamps.push(...rect(px, py, .8, .8)); glints.push(...rect(px, py, .6, .6)); }
    l.fill(lamps, 'rgba(255, 244, 214, 1)'); d.fill(glints, 'rgba(232, 206, 150, 0.6)');
    d.fill(polygon([[x0, y0], [x0 + w * .4, y0], [x0, y0 + h * .6]]), 'rgba(214, 228, 240, 0.12)');
    const bars = []; for (let k = 1; k <= mull; k++) bars.push(...rect(x0 + w * k / (mull + 1) - .4, y0, .8, h));
    d.fill(bars, '#2a2018'); l.enter({}, { blend: 'destination-out' }).fill(bars, '#000').leave();
    d.fill(rect(x0 - 1.2, y0 - 1.2, w + 2.4, .4), C.gold);
}

function podium(d, l, t, H, L) {
    const r = classicRandom(5101), top = 8, list = [];
    ashlar(d, H, L, r);
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const n = Math.max(1, Math.round(e.L / 60)), bw = e.L / n, pier = 6.5;
        for (let i = 0; i < n; i++) {
            const X0 = e.u0 + i * bw + pier + 2.5, X1 = e.u0 + (i + 1) * bw - pier - 2.5;
            if (n >= 6 && (i === 1 || i === n - 2)) {
                d.fill(rect(X0, top + 4, X1 - X0, H - top - 9), C.stone_lo); d.fill(rect(X0 + 1.2, top + 5.2, X1 - X0 - 2.4, H - top - 11.4), C.stone_mid);
                d.stroke(rect(X0 + 2.5, top + 6.5, X1 - X0 - 5, H - top - 14), 'rgba(245, 200, 220, 0.5)', .5);
                const cx = (X0 + X1) / 2, cy = (top + H - 5) / 2 + 2;
                l.fill(rect(X0 + 1.2, top + 5.2, X1 - X0 - 2.4, H - top - 11.4), 'rgba(255, 120, 180, 0.3)');
                script(d, l, 'Enni', cx - 1, cy - 6, 11); script(d, l, 'Cole', cx + 1, cy + 6, 11);
                continue;
            }
            const up0 = top + 4, up1 = 26, sp1 = 30, dn1 = H - 5;
            shopWindow(d, l, X0, up0, X1, up1, r, 0, 2);
            d.fill(rect(X0 - 1.2, up1 + 1.2, X1 - X0 + 2.4, sp1 - up1 - 1.2), C.bronze);
            const grille = []; for (let x = X0 + 1.5; x < X1 - 1; x += 3) grille.push(...rect(x, up1 + 2, 1, sp1 - up1 - 3)); d.fill(grille, 'rgba(214, 178, 119, 0.55)');
            shopWindow(d, l, X0, sp1 + 1.2, X1, dn1, r, 2, 1);
            d.fill(rect(X0 - 2, up0 - 3.4, X1 - X0 + 4, 2.2), C.stone_lt); d.fill(rect(X0 - 2, up0 - 1.4, X1 - X0 + 4, .4), C.gold);
        }
        for (let i = 0; i <= n; i++) { const end = i === 0 || i === n, w = end ? 9 : pier * 2; list.push([Math.max(e.u0, Math.min(e.u0 + e.L - w, e.u0 + i * bw - w / 2)), w]); }
    }
    piers(d, l, list, top, H - 3);
    cornice(d, l, L, 0, top);
    d.fill(rect(0, H - 3, L, 3), C.stone_dk); d.fill(rect(0, H - 3, L, .4), 'rgba(214, 178, 119, 0.6)');
}

function pavilion(d, l, t, H, L) {
    const r = classicRandom(7207), top0 = 7;
    ashlar(d, H, L, r, 0, 5.2);
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        piers(d, l, [[e.u0, 12], [e.u0 + e.L - 12, 12]], top0, H - 3);
        if (e.ny <= .99) {
            if (e.L < 30) continue;
            d.fill(rect(e.u0 + 17, top0 + 8, e.L - 34, H - top0 - 16), C.stone_lo); d.fill(rect(e.u0 + 18.5, top0 + 9.5, e.L - 37, H - top0 - 19), C.stone_mid);
            continue;
        }
        const cx = e.u0 + e.L / 2, aw = 32, top = 30, spring = top + aw, bot = H - 3;
        for (const s of [-1, 1]) {
            const x0 = s < 0 ? e.u0 + 18 : cx + aw + 16, x1 = s < 0 ? cx - aw - 16 : e.u0 + e.L - 18;
            d.fill(rect(x0, top, x1 - x0, bot - top - 6), C.stone_lo); d.fill(rect(x0 + 1.4, top + 1.4, x1 - x0 - 2.8, bot - top - 8.8), C.stone_mid);
            d.stroke(rect(x0 + 3, top + 3, x1 - x0 - 6, bot - top - 12), 'rgba(245, 200, 220, 0.45)', .5);
        }
        const arch = (a = aw) => [['move', cx - a, bot], ['line', cx - a, spring], ellipse(cx, spring, a, a, 0, Math.PI, 0), ['line', cx + a, bot], ['close']];
        d.fill(arch(aw + 5), C.stone_lt); d.fill(arch(aw + 1.5), C.stone_lo);
        const vous = []; for (let k = 1; k < 15; k++) { const a = Math.PI + k * Math.PI / 15; moveLine(vous, [cx + Math.cos(a) * (aw + 1.5), spring + Math.sin(a) * (aw + 1.5)], [cx + Math.cos(a) * (aw + 5), spring + Math.sin(a) * (aw + 5)]); }
        d.stroke(vous, 'rgba(80, 20, 48, 0.4)', .4);
        d.fill(polygon([[cx - 3.5, spring - aw - 6.5], [cx + 3.5, spring - aw - 6.5], [cx + 2.4, spring - aw + .5], [cx - 2.4, spring - aw + .5]]), C.stone_hi);
        d.paint(arch(), { fill: linear([0, top], [0, bot], [[0, '#4a3a33'], [1, '#5a4434']]) });
        l.paint(arch(), { fill: linear([0, top], [0, bot], [[0, 'rgba(255, 214, 140, 0.85)'], [1, 'rgba(255, 186, 104, 1)']]) });
        const lit = [], gilt = []; for (let k = 0; k < 13; k++) { const a = k / 12 * Math.PI, px = cx + Math.cos(a) * 11, py = spring - 8 + Math.sin(a) * 3.5; lit.push(...rect(px - .5, py - .5, 1.1, 1.1)); gilt.push(...rect(px - .4, py - .4, .8, .8)); }
        l.fill(lit, '#fff6dc'); d.fill(gilt, '#e7c98e');
        const bars = [];
        for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; moveLine(bars, [cx, spring], [cx + Math.cos(a) * aw, spring + Math.sin(a) * aw]); }
        bars.push(['move', cx + aw * .45, spring], ellipse(cx, spring, aw * .45, aw * .45, 0, 0, Math.PI, 1));
        for (let k = -3; k <= 3; k++) moveLine(bars, [cx + k * aw / 4, spring + 8], [cx + k * aw / 4, bot]);
        moveLine(bars, [cx - aw, spring + 18], [cx + aw, spring + 18]);
        d.enter().clip(arch()).stroke(bars, '#1d1a1e', .9).leave(); l.enter().clip(arch()).stroke(bars, 'rgba(60, 30, 18, 0.7)', .9).leave();
        d.fill(roundRect(cx - aw - 2, spring - 1, aw * 2 + 4, 8, 1.5), '#1b1c22'); d.fill(rect(cx - aw - 2, spring - 1, aw * 2 + 4, .6), C.gold);
        l.enter({}, { blend: 'destination-out' }).fill(rect(cx - aw - 2, spring - .4, aw * 2 + 4, 7.4), '#000').leave();
        l.fill([...rect(cx - aw - 2, spring - 1, aw * 2 + 4, .7), ...rect(cx - aw, spring + 6.4, aw * 2, .6)], 'rgba(255, 220, 160, 0.9)');
        for (const s of [-1, 1]) {
            const x = cx + s * (aw + 10) - 1;
            d.fill(rect(x, spring - 6, 2, 18), C.bronze); d.fill(rect(x + .5, spring - 5, 1, 16), '#e9d3a6');
            l.paint(rect(x - 11, spring - 9, 24, 24), { fill: radial([x + 1, spring + 3], 0, [x + 1, spring + 3], 12, [[0, 'rgba(255, 236, 200, 1)'], [1, 'rgba(255, 190, 120, 0)']]) });
        }
        script(d, l, 'Enni Cole', cx, 18, 17);
    }
    cornice(d, l, L, 0, top0);
    d.fill(rect(0, H - 3, L, 3), C.stone_dk);
}

/** Glass between black steel: piers every bay, mullions and a transom, the floor inside lit amber with tiny lights and forms. */
function glass(d, l, t, H, L, { seed = 3301, fascia: F = 6, bay = 66, panes = 3, pier = 4.5 } = {}) {
    const r = classicRandom(seed), tr = F + (H - F) * .28, warm = [], ceiling = [], halos = [], specks = [], forms = [];
    d.fill(rect(0, 0, L, H), C.steel);
    const pane = (X, W, y0, y1, big) => {
        d.paint(rect(X, y0, W, y1 - y0), { fill: linear([X, y0], [X + W, y1], [[0, '#2f2b33'], [.55, '#463830'], [1, '#27262e']]) });
        warm.push(...rect(X, y0 + (y1 - y0) * .5, W, (y1 - y0) * .5));
        d.fill(polygon([[X, y0], [X + W * .5, y0], [X, y0 + (y1 - y0) * .7]]), 'rgba(205, 222, 236, 0.09)');
        l.paint(rect(X, y0, W, y1 - y0), { fill: linear([0, y0], [0, y1], [[0, 'rgba(255, 196, 118, 0.5)'], [1, 'rgba(255, 172, 92, 0.8)']]) });
        for (let k = 0; k < (big ? 6 : 2); k++) {
            const px = X + .6 + r() * (W - 1.2), py = y0 + .6 + r() * (y1 - y0) * .4;
            ceiling.push(...rect(px, py, .7, .7)); halos.push([px + .35, py + .35]); specks.push(...rect(px, py, .5, .5));
        }
        if (big && r() < .75) for (let k = 0; k < 2; k++) {
            if (r() < .4) continue;
            const mx = X + W * (.3 + k * .4), my = y1 - 1, fh = Math.min(10, (y1 - y0) * .5);
            forms.push(...polygon([[mx - .7, my - fh], [mx + .7, my - fh], [mx + fh * .2, my], [mx - fh * .2, my]]), ['move', mx + 1.1, my - fh - 1.1], circle(mx, my - fh - 1.1, 1.1), ['close']);
        }
    };
    const steelPiers = [], edges = [], gilt = [];
    for (const e of t.mitre) {
        if (!e || e.hidden) continue;
        const n = Math.max(1, Math.round(e.L / bay)), bw = e.L / n;
        for (let i = 0; i < n; i++) {
            const X0 = e.u0 + i * bw + pier / 2, W = bw - pier, pw = W / panes;
            for (let k = 0; k < panes; k++) { const X = X0 + k * pw + .6; pane(X, pw - 1.2, F + 1, tr - .6, false); pane(X, pw - 1.2, tr + .6, H - 2, true); }
        }
        for (let i = 0; i <= n; i++) { const X = Math.max(e.u0, Math.min(e.u0 + e.L - pier, e.u0 + i * bw - pier / 2)); steelPiers.push(...rect(X, 0, pier, H)); edges.push(...rect(X + .5, 0, 1, H)); gilt.push(...rect(X, 0, .5, H)); }
    }
    if (warm.length) d.fill(warm, 'rgba(214, 160, 104, 0.16)');
    if (ceiling.length) { l.fill(ceiling, 'rgba(255, 244, 214, 1)'); l.fill(dots(halos, 1.6), 'rgba(255, 220, 160, 0.3)'); d.fill(specks, 'rgba(230, 200, 150, 0.45)'); }
    if (forms.length) { d.fill(forms, 'rgba(22, 16, 20, 0.75)'); l.enter({}, { blend: 'destination-out' }).fill(forms, 'rgba(0, 0, 0, 0.55)').leave(); }
    if (steelPiers.length) { d.fill(steelPiers, '#0d0e12'); d.fill(edges, C.steel_hi); d.fill(gilt, 'rgba(214, 178, 119, 0.45)'); }
    d.fill([...rect(0, tr - .6, L, 1.2), ...rect(0, H - 2, L, 2)], '#0d0e12');
    d.fill(rect(0, 0, L, F), C.steel); d.fill(rect(0, F * .35, L, .6), C.steel_hi); d.fill(rect(0, F - .6, L, .5), C.gold);
}

/** A plan polygon of a rectangle with its front (+y) corners rounded, radius R in n facets each. */
function roundFront(x, y, w, h, R, n) {
    const pts = [[x, y]];
    for (let i = 0; i <= n; i++) { const a = Math.PI - i * Math.PI / 2 / n; pts.push([x + R + R * Math.cos(a), y + h - R + R * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = Math.PI / 2 - i * Math.PI / 2 / n; pts.push([x + w - R + R * Math.cos(a), y + h - R + R * Math.sin(a)]); }
    pts.push([x + w, y]);
    return pts;
}

/** A stone tier's roof: dark membrane, a rose parapet with a brass line inside it. */
function stoneRoof(art, glow, t) {
    if (glow) return;
    const poly = pathOf(t.poly), [x0, y0, x1, y1] = t.box;
    art.fill(poly, '#2e252b');
    art.enter().clip(poly).stroke(poly, C.stone_lt, 9).stroke(rect(x0 + 5, y0 + 5, x1 - x0 - 10, y1 - y0 - 10), 'rgba(214, 178, 119, 0.7)', 1).leave();
}

/** The glass floor's roof: black membrane, steel edge, lantern skylights glowing at night. */
function glassRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box, poly = pathOf(t.poly);
    if (!glow) {
        art.paint(poly, { fill: linear([x0, y0], [x1, y1], [[0, '#2a2530'], [1, '#1d1c23']]) });
        const seams = []; for (let x = x0 + 24; x < x1 - 10; x += 32) moveLine(seams, [x, y0 + 8], [x, y1 - 8]); art.stroke(seams, 'rgba(120, 90, 110, 0.18)', .8);
        art.stroke(poly, C.steel, 6); art.stroke(poly, 'rgba(214, 178, 119, 0.65)', 1);
    }
    const gap = 18, m = 24, aw = (x1 - x0 - m * 2 - gap * 2) * .38, ww = (x1 - x0 - m * 2 - gap * 2 - aw) / 2, ly = y0 + m, lh = y1 - y0 - m - 64;
    for (const [lx, lw] of [[x0 + m, ww], [x0 + m + ww + gap, aw], [x1 - m - ww, ww]]) {
        const cols = Math.max(2, Math.round(lw / 60)), rows = Math.max(2, Math.round(lh / 64)), frame = roundRect(lx, ly, lw, lh, 16);
        art.enter().clip(frame);
        if (!glow) {
            art.paint(rect(lx, ly, lw, lh), { fill: linear([lx, ly], [lx + lw, ly + lh], [[0, '#3b3439'], [.52, '#514034'], [1, '#23282d']]) });
            art.fill(rect(lx + 8, ly + 8, lw - 16, lh - 16), 'rgba(195, 145, 91, 0.10)');
            art.fill(polygon([[lx, ly], [lx + lw * .45, ly], [lx + lw, ly + lh * .82], [lx + lw, ly + lh], [lx + lw * .77, ly + lh]]), 'rgba(183, 193, 211, 0.07)');
        } else art.paint(rect(lx, ly, lw, lh), { fill: linear([lx, ly], [lx, ly + lh], [[0, 'rgba(236, 164, 83, 0.10)'], [.5, 'rgba(255, 197, 113, 0.2)'], [1, 'rgba(255, 190, 98, 0.10)']]) });
        const rings = [], bulbs = [], hearts = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const px = lx + lw * (i + .5) / cols, py = ly + lh * (j + .5) / rows;
            if (glow) art.paint(rect(px - 28, py - 28, 56, 56), { fill: radial([px, py], 0, [px, py], 28, [[0, 'rgba(255, 214, 145, 0.32)'], [1, 'rgba(255, 192, 105, 0)']]) });
            rings.push(['move', px + 9, py], circle(px, py, 9));
            for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; bulbs.push([px + Math.cos(a) * 8, py + Math.sin(a) * 8]); }
            hearts.push([px, py]);
        }
        art.stroke(rings, glow ? 'rgba(255, 221, 164, 0.8)' : 'rgba(181, 136, 83, 0.65)', 1);
        art.fill(dots(bulbs, glow ? 1.5 : 1.1), glow ? '#fff0c4' : '#ceaa73');
        if (glow) art.fill(dots(hearts, 1.6), 'rgba(255, 246, 220, 0.9)');
        if (!glow) {
            const bars = [];
            for (let i = 1; i < cols * 2; i++) { const x = lx + lw * i / (cols * 2); moveLine(bars, [x, ly], [x, ly + lh]); }
            for (let j = 1; j < rows * 2; j++) { const y = ly + lh * j / (rows * 2); moveLine(bars, [lx, y], [lx + lw, y]); }
            art.stroke(bars, '#1d2028', 4); art.stroke(bars, 'rgba(221, 197, 153, 0.2)', .8);
        }
        art.leave();
        art.stroke(frame, glow ? 'rgba(237, 187, 123, 0.35)' : C.steel, glow ? 1 : 4);
        if (!glow) art.stroke(roundRect(lx + 3, ly + 3, lw - 6, lh - 6, 13), 'rgba(208, 172, 114, 0.62)', 1);
    }
}

/** The showroom's roof: dark, its curved steel edge with a brass line, and the name on it in gilt script, lit at night. */
function showRoof(art, glow, t) {
    const [x0, y0, x1, y1] = t.box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 3, poly = pathOf(t.poly);
    const how = { font: { family: LOOK.script_font, size: 34 }, align: 'center', baseline: 'middle' };
    if (glow) { art.text('Enni Cole', cx, cy, how, { fill: C.neon, shadow: { color: 'rgba(255, 190, 110, 1)', blur: 10, offset: [0, 0] } }); art.text('Enni Cole', cx, cy, how, { fill: C.neon }); return; }
    art.paint(poly, { fill: linear([x0, y0], [x0, y1], [[0, '#26232b'], [1, '#1b1a20']]) });
    art.stroke(poly, C.steel, 6); art.stroke(poly, 'rgba(214, 178, 119, 0.75)', 1);
    art.stroke(pathOf(t.poly.map(([x, y]) => [cx + (x - cx) * .86, cy + (y - cy) * .8])), 'rgba(214, 178, 119, 0.45)', .7);
    art.text('Enni Cole', cx + 1, cy + 1.5, how, { fill: 'rgba(0, 0, 0, 0.45)' }); art.text('Enni Cole', cx, cy, how, { fill: C.gold_hi });
}

/** A clipped cypress out of its planter: rings of foliage stacked up a cone, darker at the foot. */
function cypress(art, glow, t, b, view) {
    if (glow) return;
    let cx = 0, cy = 0; for (const [x, y] of t.poly) { cx += x / t.poly.length; cy += y / t.poly.length; }
    const N = 12, R = 11, Hc = 50;
    for (let i = 0; i <= N; i++) {
        const z = t.z1 + Hc * i / N, rr = R * Math.sin(Math.PI * Math.min(1, .18 + .82 * i / N)) * (1 - .35 * i / N) + .8, s = .55 + .45 * i / N;
        art.enter({ matrix: view.plane(b.k(view, z)) });
        art.fill([circle(cx, cy, rr)], `rgb(${Math.round(34 * s + 8)}, ${Math.round(80 * s + 14)}, ${Math.round(52 * s + 10)})`);
        art.fill([circle(cx - rr * .3, cy - rr * .3, rr * .45)], 'rgba(150, 190, 120, 0.18)');
        art.leave();
    }
}

/** The plant on the glass floor's roof. */
function plant(art, glow, t, b, view) {
    if (glow) return;
    const [x0, , x1, y1] = t.box;
    for (const [px, py] of [[x0 + 60, y1 - 50], [x1 - 100, y1 - 50]]) b.prism(art, view, px, py, px + 40, py + 24, t.z1, t.z1 + 7, '#3a3940', '#4c4b52');
}

/** A rounded-bottom rectangle (the steps). */
function stepPath(x, y, w, h, r) { return [['move', x, y], ['line', x + w, y], ['line', x + w, y + h - r], ellipse(x + w - r, y + h - r, r, r, 0, 0, Math.PI / 2), ['line', x + r, y + h], ellipse(x + r, y + h - r, r, r, 0, Math.PI / 2, Math.PI), ['close']]; }

/** The entry steps down to the pavement, the carpet up the middle. */
function ground(scene, b) {
    const cx = b.x + 450, y = b.y + 700;
    for (let k = 2; k >= 0; k--) {
        scene.fill(stepPath(cx - 74 - k * 10, y - 4, 148 + k * 20, 12 + k * 9, 6), ['#7a5a68', '#6c4e5c', '#5e4350'][k]);
        scene.stroke(moveLine([], [cx - 74 - k * 10, y + 8 + k * 9], [cx + 74 + k * 10, y + 8 + k * 9]), 'rgba(214, 178, 119, 0.5)', .8);
    }
    scene.fill(rect(cx - 34, y - 4, 68, 30), 'rgba(70, 18, 40, 0.75)');
    scene.fill([...rect(cx - 34, y - 4, 1, 30), ...rect(cx + 33, y - 4, 1, 30)], C.gold);
}

/** Seen from in front of the podium's middle, the pavilion, what stands on it and the cypresses draw last. */
function order(tiers, view, b) {
    if (view.camera[1] < b.y + 400) return tiers;
    const front = t => t.root.id !== 'podium';
    return tiers.filter(t => !front(t)).concat(tiers.filter(front));
}

/** Enni Cole's tiers, for `tieredBuilding`. */
export function enniCole() {
    const stoneLedges = z1 => [{ z: 3, out: 1.6, th: 3, top: C.stone_lo, band: [120, 50, 86] }, { z: z1, out: 4, th: 5, top: C.stone_lt, band: [214, 128, 166], lip: C.stone_hi }];
    const planter = (id, [lx, ly]) => ({
        id, solid: false, poly: Array.from({ length: 8 }, (_, i) => [lx + Math.cos(-i * Math.PI / 4) * 11, ly + Math.sin(-i * Math.PI / 4) * 11]), z0: 0, z1: 8, fill: C.bronze,
        paint: (d, l, t, H, L) => { d.paint(rect(0, 0, L, H), { fill: linear([0, 0], [L, 0], Array.from({ length: 9 }, (_, i) => [i / 8, i % 2 ? '#5d432b' : C.gold])) }); d.fill(rect(0, 0, L, .8), C.gold_hi); },
        shade: [30, 18, 8], roof: (art, glow, t) => { if (!glow) art.fill(pathOf(t.poly), '#2a2018'); }, top: cypress, rise: 50
    });
    const dark = { top: '#24252d', band: [30, 31, 38] };
    return {
        plan: { W: P.w, D: P.d }, hero: P.hero, facing: 'S', ground, order,
        tiers: [
            { id: 'podium', rect: [0, 0, 900, 640], z0: 0, z1: P.podium, fill: C.stone_mid, paint: podium, ledges: stoneLedges(P.podium), shade: [40, 8, 26], roof: stoneRoof },
            { id: 'pavilion', rect: [340, 640, 220, 60], z0: 0, z1: P.pavilion, fill: C.stone_mid, paint: pavilion, ledges: stoneLedges(P.pavilion), shade: [40, 8, 26], roof: stoneRoof },
            { id: 'glass', on: 'podium', rect: [22, 22, 856, 600], z0: P.podium, z1: P.glass, fill: C.steel, paint: (d, l, t, H, L) => glass(d, l, t, H, L), shade: [8, 6, 12],
                ledges: [{ z: P.glass, out: 2.5, th: 3, ...dark, lip: 'rgba(214, 178, 119, 0.8)' }], roof_glow: true, roof: glassRoof, top: plant },
            { id: 'showroom', on: 'pavilion', solid: false, poly: roundFront(352, 622, 196, 72, 30, 5), z0: P.pavilion, z1: P.showroom, fill: C.steel,
                paint: (d, l, t, H, L) => glass(d, l, t, H, L, { seed: 4409, fascia: 5, bay: 30, panes: 2, pier: 2.5 }), shade: [8, 6, 12],
                ledges: [{ z: P.pavilion + 1, out: 2, th: 2.5, ...dark }, { z: P.showroom, out: 3, th: 3.5, ...dark, lip: 'rgba(214, 178, 119, 0.85)' }], roof_glow: true, roof: showRoof },
            planter('cyp_w', P.cypresses[0]), planter('cyp_e', P.cypresses[1])
        ]
    };
}
