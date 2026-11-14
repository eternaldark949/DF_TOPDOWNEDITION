import { rect, polygon, ellipse, circle, linear, radial } from '../../engine/basement/rendering/index.mjs';

/**
 * Carved stone and windows for the landmarks' wall strips (`city-tiered.mjs`): relief (a cast shadow, the face,
 * a lit upper-left rim), acanthus leaves, spiral scrolls, rosettes, a lion's mask, volute consoles, and mullioned
 * windows with a room inside that glows warm at night. `ornament(palette)` gives the carver for one palette
 * (`{stone, stone_mid, stone_lo, stone_dk, stone_hi, stone_lt, trim, trim_lo, trim_dk, frame}`), so the same carving
 * comes out in teal stone, cream limestone or brick trim. Each draws into a day artScene (d) and, where it lights
 * up, a lit one (l). The classic is `legacy/buildings/ornament-kit.js`.
 */
export function ornament(C) {
    const oval = (x, y, rx, ry, rot = 0) => [['move', x + rx * Math.cos(rot), y + rx * Math.sin(rot)], ellipse(x, y, rx, ry, rot), ['close']];

    /** Relief: a cast shadow down-right, the face, and a lit rim along its upper-left inside edge. */
    function carve(c, path, fill, hi = C.stone_hi, lo = C.stone_dk, o = .45) {
        c.enter({ position: [o * .8, o] }).fill(path, lo).leave();
        c.fill(path, fill);
        c.enter().clip(path).enter({ position: [o, o * 1.1] }).stroke(path, hi, o * 2).leave().leave();
    }

    /** An acanthus leaf from (x, y), `len` long toward `ang`: three rounded lobes down each edge, the tip curling over, a midrib. */
    function leaf(c, x, y, len, ang, w = .32, curl = 1) {
        const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
        const pt = (t, s) => [x + ca * len * t + px * len * w * s, y + sa * len * t + py * len * w * s];
        const q = (a, b) => ['quadratic', ...a, ...b], path = [['move', x, y]];
        for (let i = 0; i < 3; i++) { const t0 = i / 3, t1 = (i + 1) / 3, a = 1.5 * (1 - t0 * .45); path.push(q(pt((t0 + t1) / 2, a), pt(t1, .35 * (1 - t1) + .12))); }
        path.push(q(pt(1.18, .5 * curl), pt(1.02, .85 * curl)), q(pt(.98, .2 * curl), pt(.94, -.1)));
        for (let i = 2; i >= 0; i--) { const t0 = i / 3, t1 = (i + 1) / 3, a = -1.3 * (1 - t0 * .45); path.push(q(pt((t0 + t1) / 2, a), pt(t0, i ? -.35 * (1 - t0) - .12 : 0))); }
        path.push(['close']);
        carve(c, path, C.stone, C.stone_hi, C.stone_dk, Math.min(.5, len * .05));
        c.stroke([['move', x, y], q(pt(.5, .1), pt(.92, .25 * curl))], C.stone_lo, Math.max(.25, len * .03));
    }

    /** A spiral scroll round (x, y): outer radius r, turning `dir` (1 clockwise), opening toward `ang`; leaves on its outer turn. */
    function scroll(c, x, y, r, dir, ang) {
        const pts = [];
        for (let t = 0; t <= 2.6 * Math.PI; t += .12) { const rr = r * (1 - t / (3.1 * Math.PI)), a = ang + dir * t; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
        const tube = (w, col, dx = 0, dy = 0) => c.stroke(pts.map(([px, py], i) => [i ? 'line' : 'move', px + dx, py + dy]), col, w);
        c.enter({}, { line_cap: 'round' }); tube(r * .3, C.stone_dk, .4, .5); tube(r * .26, C.stone); tube(r * .08, C.stone_hi, -.3, -.35); c.leave();
        for (let i = 0; i < 4; i++) { const t = .3 + i * .42, a = ang + dir * t, rr = r * (1 - t / (3.1 * Math.PI)); leaf(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * .55, a + dir * 1.1, .3); }
    }

    /** A rosette: a moulded ring, eight petals, a boss. */
    function rosette(c, x, y, r) {
        carve(c, oval(x, y, r, r), C.stone_mid);
        carve(c, oval(x, y, r * .78, r * .78), C.stone_lo, C.stone_lt);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; carve(c, oval(x + Math.cos(a) * r * .45, y + Math.sin(a) * r * .45, r * .3, r * .17, a), C.stone, C.stone_hi, C.stone_dk, .3); }
        carve(c, oval(x, y, r * .22, r * .22), C.stone_lt, '#c8eadf', C.stone_dk, .3);
    }

    /** The lion's mask: a flame-lobed mane, a furrowed brow, deep eyes, broad nose and muzzle, the mouth a shadow. */
    function lion(c, x, y, R) {
        c.fill(oval(x + .6, y + .9, R * 1.08, R * 1.02), 'rgba(8, 18, 18, 0.55)');
        for (const [n, rr, sz, off] of [[18, .82, .3, 0], [14, .62, .24, .2]]) for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k + off) * Math.PI * 2 / n, sw = Math.sin(k * 1.7) * .25;
            carve(c, oval(x + Math.cos(a) * R * rr, y + Math.sin(a) * R * rr * .96, R * sz, R * sz * .5, a + sw), k % 2 ? C.stone : C.stone_mid, C.stone_hi, C.stone_dk, .35);
        }
        carve(c, oval(x, y + R * .06, R * .52, R * .6), C.stone_mid);
        carve(c, [['move', x - R * .52, y - R * .1], ['quadratic', x - R * .26, y - R * .42, x, y - R * .2], ['quadratic', x + R * .26, y - R * .42, x + R * .52, y - R * .1], ['line', x + R * .46, y - R * .01],
            ['quadratic', x + R * .24, y - R * .24, x, y - R * .08], ['quadratic', x - R * .24, y - R * .24, x - R * .46, y - R * .01], ['close']], C.stone_lt);
        for (const s of [-1, 1]) { c.fill(oval(x + s * R * .23, y - R * .02, R * .12, R * .055, s * .32), C.stone_dk); c.fill([circle(x + s * R * .2, y - R * .03, R * .022)], 'rgba(190, 230, 215, 0.55)'); }
        carve(c, [['move', x - R * .08, y - R * .16], ['line', x + R * .08, y - R * .16], ['line', x + R * .2, y + R * .2], ['quadratic', x, y + R * .3, x - R * .2, y + R * .2], ['close']], C.stone_lt);
        c.fill([-1, 1].flatMap(s => oval(x + s * R * .09, y + R * .2, R * .05, R * .03)), C.stone_dk);
        for (const s of [-1, 1]) carve(c, oval(x + s * R * .15, y + R * .34, R * .19, R * .14), C.stone);
        c.fill([['move', x + R * .2, y + R * .47], ellipse(x, y + R * .47, R * .2, R * .06, 0, 0, Math.PI), ['close']], C.stone_dk);
        c.fill([-1, 1].flatMap(s => polygon([[x + s * R * .12, y + R * .46], [x + s * R * .09, y + R * .53], [x + s * R * .06, y + R * .46]])), C.stone_lt);
        carve(c, oval(x, y + R * .6, R * .14, R * .08), C.stone_mid);
        const pits = []; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) pits.push(...oval(x + s * R * (.2 + i * .05), y + R * (.3 + i * .03), R * .015, R * .015));
        c.fill(pits, C.stone_dk);
    }

    /** A volute console down a pier: a scroll at the top, a smaller one at the foot, a leafed band between. */
    function console_(c, x, y0, y1, s) {
        const h = y1 - y0, path = [['move', x - 1.6, y0 + 2], ['cubic', x + s * 3, y0 + h * .3, x - s * 2, y0 + h * .7, x - .8, y1 - 1.5], ['line', x + .8, y1 - 1.5], ['cubic', x - s * .6, y0 + h * .7, x + s * 4.6, y0 + h * .3, x + 1.6, y0 + 2], ['close']];
        carve(c, path, C.stone);
        scroll(c, x, y0 + 2.6, 2.8, s, Math.PI / 2); scroll(c, x, y1 - 2, 1.7, -s, -Math.PI / 2);
        leaf(c, x + s * .6, y0 + h * .42, h * .28, Math.PI / 2 + s * .3, .38);
    }

    /** A mullioned window into the day (d) and lit (l) scenes: a stone reveal, dark frames in 2 x 3 lights with a transom, the room inside in silhouette; lit, the glass glows warm round it. */
    function window_(d, l, x0, y0, x1, y1, lit, r, stone) {
        const W = x1 - x0, H = y1 - y0;
        d.fill(rect(x0 - 1.1, y0 - 1.1, W + 2.2, H + 2.2), stone ? C.stone_dk : C.trim_dk);
        d.fill([...rect(x0 - 1.5, y0 - 1.5, W + 3, .5), ...rect(x0 - 1.5, y0 - 1.5, .5, H + 3)], stone ? C.stone_hi : '#fffaf0');
        d.fill([...rect(x0 - 1.5, y1 + 1, W + 3, .5), ...rect(x1 + 1, y0 - 1.5, .5, H + 3)], stone ? C.stone_lo : C.trim_lo);
        d.paint(rect(x0, y0, W, H), { fill: linear([x0, y0], [x1, y1], [[0, '#2a3a42'], [1, '#1b262c']]) });
        d.fill(polygon([[x0, y0], [x0 + W * .55, y0], [x0, y0 + H * .75]]), 'rgba(190, 220, 230, 0.13)');
        const lampX = x0 + W * (r() < .5 ? .22 : .78), bedY = y0 + H * .68;
        const room = () => {
            const out = [...rect(x0 + W * .15, bedY, W * .7, H * .32), ...polygon([[lampX - W * .08, y0 + H * .5], [lampX + W * .08, y0 + H * .5], [lampX + W * .05, y0 + H * .38], [lampX - W * .05, y0 + H * .38]]), ...rect(lampX - .25, y0 + H * .5, .5, H * .18)];
            if (r() < .6) out.push(...rect(x0 + W * (lampX < x0 + W / 2 ? .6 : .08), y0 + H * .2, W * .32, .6));
            return out;
        };
        d.fill(room(), 'rgba(12, 16, 18, 0.45)');
        if (lit) {
            l.paint(rect(x0, y0, W, H), { fill: linear([0, y0], [0, y1], [[0, 'rgba(255, 168, 92, 0.6)'], [1, 'rgba(255, 206, 130, 0.95)']]) });
            l.paint(rect(x0, y0, W, H), { fill: radial([lampX, y0 + H * .45], 0, [lampX, y0 + H * .45], W * .6, [[0, 'rgba(255, 244, 210, 0.95)'], [1, 'rgba(255, 220, 160, 0)']]) });
            l.enter({}, { blend: 'destination-out' }).fill(room(), 'rgba(0, 0, 0, 0.55)').leave();
            l.paint(rect(x0 - 1, y1, W + 2, 3), { fill: linear([0, y1], [0, y1 + 3], [[0, 'rgba(255, 200, 130, 0.45)'], [1, 'rgba(255, 200, 130, 0)']]) });
        }
        const bars = [...rect(x0, y0, W, .8), ...rect(x0, y1 - .8, W, .8), ...rect(x0, y0, .8, H), ...rect(x1 - .8, y0, .8, H), ...rect(x0 + W / 2 - .4, y0 + H * .24, .8, H * .76),
            ...rect(x0, y0 + H * .24 - .45, W, .9), ...rect(x0, y0 + H * .62 - .3, W, .6), ...[1 / 3, 2 / 3].flatMap(u => rect(x0 + W * u - .25, y0, .5, H * .24))];
        d.fill(bars, C.frame);
        if (lit) l.enter({}, { blend: 'destination-out' }).fill(bars, '#000').leave();
    }

    return { C, carve, oval, leaf, scroll, rosette, lion, console: console_, window: window_ };
}
