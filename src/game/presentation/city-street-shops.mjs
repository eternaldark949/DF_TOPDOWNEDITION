import { artScene, rect, roundRect, circle, ellipse, linear, radial } from '../../engine/basement/rendering/index.mjs';
import { darken, alpha, boxPath, dotPath, moveLine, quadPath, polyPath, fillIf, strokeIf, wallTools } from './city-building-art.mjs';

/**
 * The city's small shops (the street variants bakery, florist, boutique and lounge): their walls' material,
 * the shopfront along the ground floor, awnings, canopies and signboards with the shop's name, the
 * variant's roof (a shingled hip roof, a roof garden, a glass lantern, a moon dome) and the pavement in
 * front. The plain window grid goes over the floors above the shopfront. The classic artist is
 * `legacy/buildings/street-variants.js`; the look is `shops` in `data/city-buildings.json` and the shop's
 * own picks (its name, awning and neon colours).
 */
const SCRIPT = '"Great Vibes", "URW Chancery L", "Z003", cursive';
const ledge = (art, view, edges, z, out, th, top, band, lip) => { const L = view.ledge(edges, z, out, th); fillIf(art, L.band, band); fillIf(art, L.top, top); if (lip) strokeIf(art, L.lip, lip, .9); };
const skylightsOf = (fw, fd) => { const half = Math.min(fw, fd) / 2, y = fd - half * .62, w = 22, h = 15; return (fw >= fd ? [fw * .34, fw * .66] : [fw * .5]).map(x => [x - w / 2, y, w, h]); };
const lanternOf = (fw, fd) => { const lw = Math.round(fw * .5), lh = Math.round(fd * .42); return [(fw - lw) / 2, fd * .2, lw, lh]; };
const domeOf = (fw, fd) => [fw / 2, fd * .46, Math.min(fw, fd) * .22];

export const streetShop = {
    groundReach: 50,

    /** A shop's ground floor front is its shopfront: no plain windows there. */
    windowMask(h, f) { return f.side === h.facing ? fl => fl === 0 : null; },

    /** Under the windows: the face's material (stone and steel, brick courses and quoins, timber, lacquer). */
    faceUnder(h, ctx, art, f, G) {
        if (G.depth < 3) return;
        const v = h.variant, S = v.spec, H = h.H, FH = h.look.floor_height, fine = G.depth > 8, front = f.side === h.facing, mat = S.material;
        if (mat === 'stone') {
            const hi = Math.min(1, FH * 1.15 / H);
            art.fill(G.quad(0, 1, 0, hi * .5), S.stone_lo); art.fill(G.quad(0, 1, hi * .5, hi), S.stone);
            if (hi < 1) art.fill(G.quad(0, 1, hi, 1), S.steel);
            if (fine) { const j = []; for (let u = .08; u < 1; u += 30 / G.length) G.line(u, 0, u, hi, j); strokeIf(art, j, 'rgba(211,166,112,.22)', .7); }
        } else if (mat === 'brick' && fine) {
            const c = []; for (let z = 2.5; z < H - 1; z += 2.5) G.line(0, z / H, 1, z / H, c);
            strokeIf(art, c, 'rgba(232,190,140,.16)', .7);
        } else if (mat === 'timber' && front) {
            const top = Math.min(1, FH * 1.05 / H);
            art.fill(G.quad(0, 1, 0, top), '#25402e');
            if (fine) { const b = []; for (let u = 0; u < 1; u += 7 / G.length) G.line(u, 0, u, top, b); strokeIf(art, b, 'rgba(0,0,0,.18)', .6); }
        } else if (mat === 'lacquer' && fine) {
            const zf = Math.max(.6, 1 - 3.2 / H), ch = [], n = Math.max(4, Math.round(G.length / 9));
            for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + .5) / n, u2 = (i + 1) / n; G.line(u0, zf, u1, zf + 1.8 / H, ch); G.line(u1, zf + 1.8 / H, u2, zf, ch); }
            art.enter({}, { opacity: art.style.opacity * .75 }); strokeIf(art, ch, S.gold, .8); art.leave();
        }
        if (mat === 'brick' && fine) {
            const q = [], floors = Math.round(H / FH);
            for (let i = 0; i < floors * 2; i++) { const z0 = i * FH / 2 + .4, z1 = (i + 1) * FH / 2 - .4, w = (i % 2 ? 5 : 8) / G.length; G.quad(0, w, z0 / H, z1 / H, q); G.quad(1 - w, 1, z0 / H, z1 / H, q); }
            fillIf(art, q, S.trim);
        }
    },

    /** Over the windows: the shopfront, the lounge's pilasters, the ledge over the shop floor and the cornice. */
    faceOver(h, ctx, art) {
        const { view, k, faces } = ctx, v = h.variant, S = v.spec, H = h.H, FH = h.look.floor_height, edges = [], fins = [];
        for (const f of faces) {
            const G = view.wall(f, k), L = G.length, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
            edges.push({ a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny });
            if (G.depth < 3) continue;
            const cols = Math.max(1, Math.floor(L / 26));
            if (f.side === h.facing) shopfront(h, art, f, G, false);
            if (v.id === 'lounge') for (let c = 0; c <= cols; c++) fins.push({ x: f.x1 + (f.x2 - f.x1) * c / cols, y: f.y1 + (f.y2 - f.y1) * c / cols, nx: f.nx, ny: f.ny });
        }
        if (fins.length) { const F = view.fins(fins, 0, H - 2, 3, 2); fillIf(art, F.front, '#2a1e33'); strokeIf(art, F.edge, alpha(v.neon, .55), .8); }
        const lipC = S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#e8e2cc' : S.gold;
        if (S.id !== 'florist') ledge(art, view, edges, FH * 1.02, 1.6, 1.2, darken(S.wall, -18), darken(S.wall, 10), alpha(lipC, .6));
        ledge(art, view, edges, H, 2.6, 2.2, S.id === 'bakery' ? S.trim : S.id === 'florist' ? '#d9d2b8' : S.id === 'boutique' ? '#5d303e' : '#2a2030',
              S.id === 'bakery' ? '#3a2116' : S.id === 'florist' ? '#1f2a22' : '#24161e', alpha(lipC, .85));
    },

    /** The street front: striped awnings and a signboard (bakery, florist) or a canopy (boutique, lounge), with the name. */
    front(h, ctx, art, emissive) {
        const { view } = ctx, v = h.variant, S = v.spec, FH = h.look.floor_height, g = h.front, F = h.frame;
        const half = F.fw / 2, door = F.door - half, side = F.side, size = S.id === 'bakery' || S.id === 'florist' ? 15 : 17;
        const tw = Math.min(F.fw - 40, h.measure(v.name, { family: SCRIPT, size }) + 26), font = { family: SCRIPT, size };
        if (S.id === 'bakery' || S.id === 'florist') {
            const zt = FH * .98, zf = FH * .56, out = 13, [ca, cb] = v.awning;
            if (!emissive) {
                const A = [], B = [], sa = [];
                for (const [s0, s1] of [[-half + 8, door * side - tw / 2 - 2], [door * side + tw / 2 + 2, half - 8]]) {
                    if (s1 - s0 < 16) continue;
                    const n = Math.max(2, Math.round((s1 - s0) / 11)), w = (s1 - s0) / n;
                    for (let i = 0; i < n; i++) { const a = s0 + i * w, b = a + w; quadPath(i % 2 ? B : A, h.frontPoint(view, a, 0, zt), h.frontPoint(view, b, 0, zt), h.frontPoint(view, b, out, zf), h.frontPoint(view, a, out, zf)); }
                    sa.push([s0, s1, n, w]);
                }
                fillIf(art, A, ca); fillIf(art, B, cb);
                if (sa.length) {
                    art.enter({ matrix: view.plane(view.k(zf)) });
                    const pa = [], pb = [];
                    for (const [s0, , n, w] of sa) for (let i = 0; i < n; i++) {
                        const m = s0 + (i + .5) * w, x = g.cx + g.ux * m + g.nx * out, y = g.cy + g.uy * m + g.ny * out, a0 = Math.atan2(g.ny, g.nx) - Math.PI / 2, p = i % 2 ? pb : pa;
                        p.push(['move', x + Math.cos(a0) * w / 2, y + Math.sin(a0) * w / 2], ['ellipse', x, y, w / 2, w / 2, 0, a0, a0 + Math.PI, 0]);
                    }
                    fillIf(art, pa, darken(ca, 22)); fillIf(art, pb, darken(cb, 26));
                    art.leave();
                }
            }
            h.board(ctx, art, FH * 1.12, 1, (a, os) => {
                const bh = 17, y0 = os > 0 ? 0 : -bh, board = roundRectCorners(-tw / 2, y0, tw, bh, os > 0 ? [2, 2, 7, 7] : [7, 7, 2, 2]);
                if (!emissive) { a.fill(rect(-tw / 2 + 3, y0 + (os > 0 ? bh : -3), tw - 6, 3), 'rgba(0,0,0,.32)'); a.paint(board, { fill: S.board[0], stroke: S.edge, stroke_width: 1.2 }); }
                else a.stroke(board, 'rgba(255,200,120,.4)', 1);
                a.text(v.name, 0, y0 + bh / 2 + 1, { font, align: 'center', baseline: 'middle' }, { fill: emissive ? S.glow : S.ink });
            });
        } else {
            const z = FH * 1.04, out = S.id === 'lounge' ? 20 : 17, cw = Math.max(64, tw + 6), s = door * side;
            if (!emissive) ledge(art, view, [{ a: h.frontFoot(s - cw / 2), b: h.frontFoot(s + cw / 2), nx: g.nx, ny: g.ny }], z, out, 2.6, S.id === 'lounge' ? S.velvet : '#171a21', S.id === 'lounge' ? S.velvet_lo : '#0e1116', S.gold);
            else if (S.id === 'lounge') {
                const kz = view.k(z), p = [], n = Math.round(cw / 7);
                for (let i = 0; i <= n; i++) { const ss = s - cw / 2 + cw * i / n, q = view.scaled(g.cx + g.ux * ss + g.nx * out, g.cy + g.uy * ss + g.ny * out, kz); dotPath(p, q[0], q[1], 1.2); }
                art.enter({}, { blend: 'add' }); art.fill(p, 'rgba(255,226,170,.95)'); art.leave();
            }
            h.board(ctx, art, z, 0, (a, os) => a.text(v.name, 0, os * out / 2 + 1, { font, align: 'center', baseline: 'middle' }, { fill: emissive ? S.glow : S.ink }));
        }
    },

    /** The roof (frame units), shared by every shop of its variant and size. */
    roof(h) {
        const F = h.frame, S = h.variant.spec;
        return { key: `shop|${S.id}|${F.fw}x${F.fd}`, build: () => { const art = new artScene(); paintRoof(art, S, F.fw, F.fd); return art.finish(); } };
    },

    /** The roof's night lights: skylights, the glasshouse, the lantern, the dome, and their bulbs. */
    roofGlow(h, art) {
        const v = h.variant, S = v.spec, { fw, fd } = h.frame, p = [], bulbs = [];
        if (S.id === 'bakery') for (const [x, y, w, hh] of skylightsOf(fw, fd)) boxPath(p, x + 1, y + 1, w - 2, hh - 2);
        else if (S.id === 'florist') boxPath(p, fw - 81, 9, 72, 54);
        else if (S.id === 'boutique') { const [lx, ly, lw, lh] = lanternOf(fw, fd); p.push(...roundRect(lx + 2, ly + 2, lw - 4, lh - 4, 12)); }
        else { const [dx, dy, r] = domeOf(fw, fd); dotPath(p, dx, dy, r); }
        if (S.id === 'florist') for (const [ax, ay, bx, by] of [[10, fd * .45, fw - 10, fd - 30], [10, fd - 30, fw - 10, fd * .45]]) { const n = Math.round(Math.hypot(bx - ax, by - ay) / 12); for (let i = 1; i < n; i++) { const t = i / n; dotPath(bulbs, ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * Math.PI) * 8, 1.6); } }
        else if (S.id === 'boutique') { const [lx, ly, lw, lh] = lanternOf(fw, fd), cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40)); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const cx = lx + lw * (i + .5) / cols, cy = ly + lh * (j + .5) / rows; for (let kk = 0; kk < 6; kk++) { const a = kk * Math.PI / 3; dotPath(bulbs, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.3); } } }
        else if (S.id === 'lounge') { const [dx, dy, r] = domeOf(fw, fd); for (let i = 0; i < 24; i += 2) { const a = i * Math.PI / 12; dotPath(bulbs, dx + Math.cos(a) * r * 1.55, dy + Math.sin(a) * r * 1.55, 1.5); } }
        fillIf(art, p, v.id === 'lounge' ? alpha(v.neon, .55) : v.id === 'florist' ? 'rgba(220,255,210,.4)' : 'rgba(255,196,110,.55)');
        fillIf(art, bulbs, v.id === 'lounge' ? 'rgba(255,226,170,.95)' : 'rgba(255,224,160,.95)');
    },

    /** The pavement in front, past the awning's stride: planters and a chalkboard, flower buckets, topiaries, the red carpet. */
    base(h, c, fw, fd, door) {
        const S = h.variant.spec, dot = (x, yy, r, col) => c.fill([circle(x, yy, r)], col), y = fd + 16;
        if (S.id === 'bakery') {
            c.fill(rect(12, y + 4, 44, 12), 'rgba(0,0,0,.3)'); c.fill(rect(10, y + 2, 44, 12), '#3a2116'); c.stroke(rect(10.5, y + 2.5, 43, 11), '#5d3a24', 1);
            for (let i = 0; i < 13; i++) dot(14 + (i * 37 % 38), y + 5 + (i * 13 % 7), 3.2, i % 3 ? '#4f7d43' : '#77a25d');
            for (let i = 0; i < 7; i++) dot(15 + i * 6, y + 6 + (i % 2) * 4, 1.5, ['#f2c14e', '#e86a5c', '#f6ecd8'][i % 3]);
            const bx = door + 62;
            c.fill(rect(bx + 2, y + 9, 16, 12), 'rgba(0,0,0,.3)'); c.fill(rect(bx, y + 6, 16, 12), '#5d3a24'); c.fill(rect(bx + 2, y + 8, 12, 8), '#1f2421');
            c.stroke([...moveLine([], [bx + 3.5, y + 10.5], [bx + 12, y + 10.5]), ...moveLine([], [bx + 3.5, y + 13.5], [bx + 10, y + 13.5])], 'rgba(240,235,220,.75)', .8);
            const tx = fw - 24, ty = y + 15;
            c.fill([ellipse(tx + 2, ty + 3, 11, 9)], 'rgba(0,0,0,.3)');
            for (const dx of [-13, 13]) c.paint(roundRect(tx + dx - 4.5, ty - 4.5, 9, 9, 2.5), { fill: '#2b1a12', stroke: '#8c6a46', stroke_width: .8 });
            dot(tx, ty, 8, '#efe4cc'); c.stroke([circle(tx, ty, 8)], '#7a5a38', 1.2);
            dot(tx - 2.5, ty - 1.5, 2.2, '#fff'); dot(tx - 2.5, ty - 1.5, 1.3, '#5b3420'); dot(tx + 3, ty + 2, 1.4, '#ffc66a');
        } else if (S.id === 'florist') {
            for (const [x0, x1] of [[10, door - 34], [door + 34, fw - 10]]) {
                if (x1 - x0 < 20) continue;
                c.fill(rect(x0 + 2, y + 4, x1 - x0, 16), 'rgba(0,0,0,.3)'); c.fill(rect(x0, y + 2, x1 - x0, 15), '#6b4a2e'); c.stroke(rect(x0 + .5, y + 2.5, x1 - x0 - 1, 14), '#8c6a46', .8);
                for (let x = x0 + 7, i = 0; x < x1 - 4; x += 11, i++) {
                    dot(x, y + 9.5, 5.2, '#5a6a72');
                    const col = ['#e86a8c', '#f2c14e', '#f6ecd8', '#b58cff', '#ff8a5c', '#d94a6a'][(i * 5 + x0) % 6];
                    for (let kk = 0; kk < 6; kk++) dot(x + Math.cos(kk * 1.1) * 3, y + 9.5 + Math.sin(kk * 1.1) * 3, 2.1, kk % 3 ? col : '#4f8a46');
                }
            }
        } else if (S.id === 'boutique') {
            for (const x of [door - 62, door + 62]) {
                dot(x + 3, y + 14, 10, 'rgba(0,0,0,.35)');
                c.paint([ellipse(x, y + 12, 9.5, 7.5)], { fill: linear([x - 9, 0], [x + 9, 0], [[0, '#58432c'], [.45, S.gold], [1, '#755539']]), stroke: S.gold_hi, stroke_width: .8 });
                dot(x, y + 10, 8, '#294b36'); dot(x - 2.5, y + 7.5, 4.2, '#547654');
                for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 2 + i % 3 * 1.8; dot(x + Math.cos(a) * r, y + 10 + Math.sin(a) * r, 1.6, 'rgba(124,159,103,.45)'); }
            }
        } else {
            c.fill(rect(door - 10, fd + 2, 24, y + 30 - fd), 'rgba(0,0,0,.3)'); c.fill(rect(door - 12, fd, 24, y + 31 - fd), '#8e1a34');
            c.stroke([...moveLine([], [door - 11.5, fd], [door - 11.5, y + 31]), ...moveLine([], [door + 11.5, fd], [door + 11.5, y + 31])], S.gold, 1);
            for (const s of [-1, 1]) {
                const posts = [[door + s * 44, y + 6], [door + s * 60, y + 6], [door + s * 76, y + 6], [door + s * 44, y + 26]], rope = [];
                for (let i = 0; i < 2; i++) { const [ax, ay] = posts[i], [bx, by] = posts[i + 1]; rope.push(['move', ax, ay], ['quadratic', (ax + bx) / 2, ay + 5, bx, by]); }
                rope.push(['move', posts[0][0], posts[0][1]], ['quadratic', posts[0][0] + s * 4, y + 16, posts[3][0], posts[3][1]]);
                c.stroke(rope, '#b0204a', 2);
                for (const [x, yy] of posts) { dot(x + 1, yy + 1.5, 3, 'rgba(0,0,0,.35)'); dot(x, yy, 2.8, S.gold); dot(x - .7, yy - .7, 1.1, '#fff2cf'); }
            }
        }
    },

    /** The night: the shopfront and the sign lit, the lounge's neon fins and marquee bulbs. */
    glow(h, ctx, art) {
        const { view, k, faces } = ctx, v = h.variant, H = h.H;
        art.enter({}, { blend: 'add' });
        for (const f of faces) if (f.side === h.facing) { const G = view.wall(f, k); if (G.depth >= 3) shopfront(h, art, f, G, true); }
        if (v.id === 'lounge') {
            const fins = [];
            for (const f of faces) { const L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), cols = Math.max(1, Math.floor(L / 26)); for (let c = 0; c <= cols; c++) fins.push({ x: f.x1 + (f.x2 - f.x1) * c / cols, y: f.y1 + (f.y2 - f.y1) * c / cols, nx: f.nx, ny: f.ny }); }
            if (fins.length) fillIf(art, view.fins(fins, 1, H - 2, 1.4, 2.4).front, alpha(v.neon, .85));
        }
        streetShop.front(h, ctx, art, true);
        art.leave();
    }
};

/** A shop's ground floor along its front: display windows either side of the door, the door. */
function shopfront(h, art, f, G, emissive) {
    const S = h.variant.spec, FH = h.look.floor_height, H = h.H, du = h.doorU(f), L = G.length, dw = 15 / L;
    const z0 = 1 / H, z1 = Math.min(.96, FH * .86 / H), zt = Math.min(.98, FH * .94 / H);
    const spans = du > 0 ? [[.05, du - dw - .03], [du + dw + .03, .95]] : [[.05, .95]], glass = [], frames = [], bars = [];
    for (const [a, b] of spans) {
        if (b - a < .04) continue;
        G.quad(a, b, z0 * .4, zt, frames); G.quad(a + 1.6 / L, b - 1.6 / L, z0, z1, glass);
        const n = Math.max(1, Math.round((b - a) * L / (S.id === 'boutique' ? 30 : 20)));
        for (let i = 1; i < n; i++) { const u = a + (b - a) * i / n; G.quad(u - .6 / L, u + .6 / L, z0, z1, bars); }
        if (S.id !== 'lounge') G.quad(a + 1.6 / L, b - 1.6 / L, z1 - 1.6 / H, z1 - 1 / H, bars);
    }
    if (emissive) {
        if (du > 0) G.quad(du - dw + 4 / L, du + dw - 4 / L, z1 * .3, z1 * .95, glass);
        fillIf(art, glass, S.id === 'lounge' ? alpha(h.variant.neon, .45) : S.id === 'florist' ? 'rgba(255,236,190,.5)' : 'rgba(255,190,110,.55)');
        return;
    }
    fillIf(art, frames, S.frame); fillIf(art, glass, S.glass); fillIf(art, glass, S.id === 'lounge' ? 'rgba(180,140,255,.14)' : 'rgba(255,200,120,.14)'); fillIf(art, bars, S.mull);
    if (du > 0) {
        art.fill(G.quad(du - dw, du + dw, 0, zt), S.frame);
        art.fill(G.quad(du - dw + 2 / L, du + dw - 2 / L, 0, z1), S.id === 'lounge' ? S.velvet_lo : S.mull);
        art.fill(G.quad(du - dw + 4 / L, du + dw - 4 / L, z1 * .3, z1 * .95), 'rgba(255,200,120,.3)');
    }
}

/** A box with its own radius at each corner (top-left, top-right, bottom-right, bottom-left), as a canvas roundRect. */
function roundRectCorners(x, y, w, h, [a, b, c, d]) {
    const q = Math.PI / 2;
    return [['move', x + a, y], ['line', x + w - b, y], ellipse(x + w - b, y + b, b, b, 0, -q, 0), ['line', x + w, y + h - c], ellipse(x + w - c, y + h - c, c, c, 0, 0, q), ['line', x + d, y + h], ellipse(x + d, y + h - d, d, d, 0, q, 2 * q), ['line', x, y + a], ellipse(x + a, y + a, a, a, 0, 2 * q, 3 * q), ['close']];
}

/** A shop's roof in its frame (fw along the front, fd deep). */
function paintRoof(c, S, fw, fd) {
    const box = (x, y, w, h, col) => c.fill(rect(x, y, w, h), col);
    if (S.id === 'bakery') {
        const long = fw >= fd, half = Math.min(fw, fd) / 2, A = [0, 0], B = [fw, 0], C = [fw, fd], D = [0, fd];
        const R0 = long ? [half, fd / 2] : [fw / 2, half], R1 = long ? [fw - half, fd / 2] : [fw / 2, fd - half];
        const planes = long ? [[[A, B, R1, R0], '#3f251c', [0, 1]], [[D, A, R0], '#4e2c1f', [1, 0]], [[B, C, R1], '#5c3424', [-1, 0]], [[C, D, R0, R1], '#7a4432', [0, -1]]]
                            : [[[A, B, R0], '#3f251c', [0, 1]], [[D, A, R0, R1], '#4e2c1f', [1, 0]], [[B, C, R1, R0], '#5c3424', [-1, 0]], [[C, D, R1], '#7a4432', [0, -1]]];
        for (const [pts, col, n] of planes) {
            const shape = polyPath([], pts); c.fill(shape, col); c.enter(); c.clip(shape);
            const e0 = pts[0], e1 = pts[1], len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), ux = (e1[0] - e0[0]) / len, uy = (e1[1] - e0[1]) / len, ext = Math.max(fw, fd) + 20;
            const courses = [], tabs = [], hi = [];
            for (let d = 6; d < half; d += 6) moveLine(courses, [e0[0] + n[0] * d - ux * ext, e0[1] + n[1] * d - uy * ext], [e0[0] + n[0] * d + ux * ext, e0[1] + n[1] * d + uy * ext]);
            for (let d = 0, r = 0; d < half; d += 6, r++) for (let t = -ext + (r % 2) * 6; t < ext; t += 12) { const x = e0[0] + n[0] * d + ux * t, y = e0[1] + n[1] * d + uy * t; if (x < -8 || x > fw + 8 || y < -8 || y > fd + 8) continue; moveLine(tabs, [x, y], [x + n[0] * 6, y + n[1] * 6]); }
            for (let d = 7; d < half; d += 6) moveLine(hi, [e0[0] + n[0] * d - ux * ext, e0[1] + n[1] * d - uy * ext], [e0[0] + n[0] * d + ux * ext, e0[1] + n[1] * d + uy * ext]);
            strokeIf(c, courses, 'rgba(20,10,6,.38)', 1); strokeIf(c, tabs, 'rgba(20,10,6,.22)', .7); strokeIf(c, hi, 'rgba(255,214,160,.07)', .6);
            c.leave();
        }
        const hips = []; for (const P of [A, B, C, D]) { const R = Math.hypot(P[0] - R0[0], P[1] - R0[1]) < Math.hypot(P[0] - R1[0], P[1] - R1[1]) ? R0 : R1; moveLine(hips, P, R); } moveLine(hips, R0, R1);
        c.enter({}, { line_cap: 'round' }); c.stroke(hips, '#2a1711', 3.2); c.stroke(hips, 'rgba(214,160,104,.42)', 1); c.leave();
        c.stroke(rect(1.2, 1.2, fw - 2.4, fd - 2.4), '#3a2116', 2.4);
        const cx = fw * .24, cy = Math.min(fd * .24, half * .55);
        box(cx + 4, cy + 5, 18, 18, 'rgba(0,0,0,.35)'); box(cx - 9, cy - 9, 18, 18, '#6a3426'); c.stroke(rect(cx - 9, cy - 9, 18, 18), S.trim, 1.6);
        const brick = []; for (let y = cy - 6; y < cy + 9; y += 3) moveLine(brick, [cx - 9, y], [cx + 9, y]); c.stroke(brick, 'rgba(232,190,140,.25)', .6);
        c.fill([circle(cx, cy, 5)], '#8a4a32'); c.fill([circle(cx, cy, 3)], '#1a0f0b');
        for (const [x, y, w, h] of skylightsOf(fw, fd)) {
            box(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); box(x, y, w, h, '#2b2422'); box(x, y, w, h, 'rgba(160,190,220,.16)');
            c.stroke(rect(x, y, w, h), S.trim, 1.4); c.stroke(moveLine([], [x + w / 2, y], [x + w / 2, y + h]), S.trim, .8);
        }
    } else if (S.id === 'florist') {
        box(0, 0, fw, fd, '#6a4a3c');
        const pav = []; for (let y = 0, r = 0; y < fd; y += 14, r++) for (let x = (r % 2) * 14; x < fw; x += 28) boxPath(pav, x, y, Math.min(14, fw - x), Math.min(14, fd - y));
        c.fill(pav, 'rgba(255,220,190,.06)');
        const joints = []; for (let x = 14; x < fw; x += 14) moveLine(joints, [x, 0], [x, fd]); for (let y = 14; y < fd; y += 14) moveLine(joints, [0, y], [fw, y]); c.stroke(joints, 'rgba(30,16,10,.3)', .8);
        const bed = (x, y, w, h) => {
            box(x + 2, y + 3, w, h, 'rgba(0,0,0,.3)'); box(x, y, w, h, '#4a2e1c'); c.stroke(rect(x + .5, y + .5, w - 1, h - 1), '#6b4a2e', 1);
            const n = Math.round(w * h / 40);
            for (let i = 0; i < n; i++) c.fill([circle(x + 3 + (i * 37 % Math.max(1, w - 6)), y + 3 + (i * 17 % Math.max(1, h - 6)), 3.2)], ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]);
            for (let i = 0; i < n / 3; i++) c.fill([circle(x + 4 + (i * 53 % Math.max(1, w - 8)), y + 4 + (i * 23 % Math.max(1, h - 8)), 1.5)], ['#f2c14e', '#e86a8c', '#f6ecd8', '#b58cff'][i % 4]);
        };
        bed(8, 8, fw - 96, 18); bed(8, 30, 18, fd - 70); bed(fw - 26, fd - 92, 18, 60);
        const gx = fw - 82, gy = 8, gw = 74, gh = 56;
        box(gx + 3, gy + 4, gw, gh, 'rgba(0,0,0,.3)'); box(gx, gy, gw, gh, 'rgba(176,214,200,.45)');
        for (let i = 0; i < 9; i++) c.fill([circle(gx + 9 + (i * 23 % (gw - 16)), gy + 10 + (i * 13 % (gh - 18)), 4)], i % 2 ? '#3c7d44' : '#5c9a4c');
        box(gx, gy, gw, gh / 2, 'rgba(230,245,240,.18)'); c.stroke(rect(gx, gy, gw, gh), '#eef0e6', 1.4);
        const mull = []; for (let x = gx + gw / 4; x < gx + gw - 1; x += gw / 4) moveLine(mull, [x, gy], [x, gy + gh]); moveLine(mull, [gx, gy + gh / 2], [gx + gw, gy + gh / 2]); c.stroke(mull, '#eef0e6', .8);
        box(fw / 2 - 20, fd - 24, 40, 8, '#6b4a2e'); c.stroke(rect(fw / 2 - 20, fd - 24, 40, 8), 'rgba(0,0,0,.35)', .8);
        for (const x of [fw / 2 - 34, fw / 2 + 34]) { c.fill([circle(x, fd - 20, 6)], '#9a5a3a'); c.fill([circle(x, fd - 21, 4.5)], '#4f8a46'); }
        c.stroke(rect(2.5, 2.5, fw - 5, fd - 5), '#3a4a3c', 5); c.stroke(rect(5.5, 5.5, fw - 11, fd - 11), 'rgba(232,226,204,.6)', 1);
    } else if (S.id === 'boutique') {
        c.fill(rect(0, 0, fw, fd), linear([0, 0], [fw, fd], [[0, '#382934'], [.5, '#2d242c'], [1, '#201e27']]));
        const lines = []; for (let y = 18; y < fd; y += 30) moveLine(lines, [8, y], [fw - 8, y]); strokeIf(c, lines, 'rgba(143,86,107,.22)', 1);
        const [lx, ly, lw, lh] = lanternOf(fw, fd), frame = roundRect(lx, ly, lw, lh, 14);
        c.enter(); c.clip(frame);
        c.fill(rect(lx, ly, lw, lh), linear([lx, ly], [lx + lw, ly + lh], [[0, '#3b3439'], [.52, '#514034'], [1, '#23282d']]));
        c.fill(rect(lx + 6, ly + 6, lw - 12, lh - 12), 'rgba(195,145,91,.12)');
        const cols = Math.max(2, Math.round(lw / 40)), rows = Math.max(2, Math.round(lh / 40)), rings = [], drops = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const cx = lx + lw * (i + .5) / cols, cy = ly + lh * (j + .5) / rows; dotPath(rings, cx, cy, 7); for (let kk = 0; kk < 6; kk++) { const a = kk * Math.PI / 3; dotPath(drops, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1); } }
        c.stroke(rings, 'rgba(181,136,83,.65)', 1); c.fill(drops, '#ceaa73');
        c.fill(polyPath([], [[lx, ly], [lx + lw * .45, ly], [lx + lw, ly + lh * .8], [lx + lw, ly + lh], [lx + lw * .75, ly + lh]]), 'rgba(183,193,211,.08)');
        const grid = []; for (let i = 1; i < cols * 2; i++) { const x = lx + lw * i / (cols * 2); moveLine(grid, [x, ly], [x, ly + lh]); } for (let j = 1; j < rows * 2; j++) { const y = ly + lh * j / (rows * 2); moveLine(grid, [lx, y], [lx + lw, y]); }
        c.stroke(grid, '#1d2028', 4); c.stroke(grid, 'rgba(221,197,153,.2)', .8);
        c.leave();
        c.stroke(frame, S.steel, 3); c.stroke(roundRect(lx + 3, ly + 3, lw - 6, lh - 6, 11), 'rgba(208,172,114,.62)', 1);
        for (const x of [16, fw - 34]) { box(x + 2, 14, 18, 12, 'rgba(0,0,0,.35)'); box(x, 12, 18, 12, '#2a2e36'); c.stroke(rect(x + .5, 12.5, 17, 11), 'rgba(208,172,114,.35)', .8); }
        c.stroke(rect(3, 3, fw - 6, fd - 6), S.stone, 6); c.stroke(rect(6.5, 6.5, fw - 13, fd - 13), 'rgba(230,199,153,.7)', 1.2);
    } else {
        c.fill(rect(0, 0, fw, fd), linear([0, 0], [fw, fd], [[0, '#221829'], [1, '#130e18']]));
        const lines = []; for (let x = 12; x < fw; x += 12) moveLine(lines, [x, 6], [x, fd - 6]); strokeIf(c, lines, 'rgba(217,178,106,.08)', 1);
        const [dx, dy, r] = domeOf(fw, fd), burst = [];
        for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; moveLine(burst, [dx + Math.cos(a) * r * 1.12, dy + Math.sin(a) * r * 1.12], [dx + Math.cos(a) * r * (i % 2 ? 1.36 : 1.55), dy + Math.sin(a) * r * (i % 2 ? 1.36 : 1.55)]); }
        c.stroke(burst, 'rgba(217,178,106,.5)', 1);
        c.fill([circle(dx + 3, dy + 4, r)], 'rgba(0,0,0,.4)');
        c.fill([circle(dx, dy, r)], radial([dx - r * .35, dy - r * .35], r * .1, [dx, dy], r, [[0, '#4a3a66'], [.6, '#2a1f3a'], [1, '#120c19']]));
        const ribs = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; moveLine(ribs, [dx + Math.cos(a) * r * .2, dy + Math.sin(a) * r * .2], [dx + Math.cos(a) * r, dy + Math.sin(a) * r]); }
        c.stroke(ribs, 'rgba(217,178,106,.45)', .8); c.stroke([circle(dx, dy, r * .55)], 'rgba(217,178,106,.45)', .8);
        c.stroke([circle(dx, dy, r)], S.gold, 2.6); c.fill([circle(dx, dy, r * .18)], S.gold); c.fill([circle(dx + r * .08, dy - r * .05, r * .16)], '#2a1f3a');
        for (const x of [18, fw - 18]) c.paint([circle(x, 18, 7)], { fill: '#0d0a11', stroke: 'rgba(217,178,106,.5)', stroke_width: 1 });
        c.stroke(rect(3, 3, fw - 6, fd - 6), '#2a2030', 6); c.stroke(rect(6.5, 6.5, fw - 13, fd - 13), S.gold, 1.4);
    }
}
