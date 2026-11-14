import { rect, circle, roundRect } from '../../engine/basement/rendering/index.mjs';
import { buildingHash, lighten, darken, alpha, boxPath, dotPath, moveLine, polyPath, fillIf, strokeIf, wallTools } from './city-building-art.mjs';

/**
 * The city's apartment houses (the street variants brownstone, deco, terrace and loft), built like the
 * arcades: a ground floor with its own door, storeys of windows sized to a person, and a crown, at the
 * arcades' lean. Each is drawn a few projected fills a face; ledges, piers, columns and verandas come from
 * the Basement's height view. The classic artist is `legacy/buildings/street-apartments.js`; the look is
 * `apt_kit` in `data/city-buildings.json` and the house's own picks (its tone, its door's colour).
 */
const FH = 9;

/** The bays along a face (u along it): the front's from the door, or evenly spaced on the other faces. */
function bays(h, f, G) {
    const B = h.variant.st, F = h.frame;
    if (f.side === h.facing) {
        const g = h.front, ex = f.x2 - f.x1, ey = f.y2 - f.y1, L2 = ex * ex + ey * ey, out = [];
        for (let k = -12; k <= 12; k++) {
            const x = F.door + k * B.bay; if (!(x - B.bay / 2 >= 2 && x + B.bay / 2 <= F.fw - 2)) continue;
            const s = (x - F.fw / 2) * F.side, px = g.cx + g.ux * s, py = g.cy + g.uy * s, u = ((px - f.x1) * ex + (py - f.y1) * ey) / L2;
            if (u > 0 && u < 1) out.push({ u, door: Math.abs(x - F.door) < 1 });
        }
        return out;
    }
    const n = Math.max(1, Math.floor(G.length / B.bay));
    return Array.from({ length: n }, (_, i) => ({ u: (i + .5) / n, door: false }));
}
/** The storeys between the ground floor and the frieze: [z0, z1] each. */
function storeys(h) {
    const B = h.variant.st, z0 = B.p + 1, top = h.H - B.corn, n = Math.max(1, Math.round((top - z0) / B.storey)), sh = (top - z0) / n;
    return Array.from({ length: n }, (_, i) => [z0 + i * sh, z0 + (i + 1) * sh]);
}
const litOf = (h, f) => { const seed = h.variant.seed, c = f.side.charCodeAt(0) * 3; return (i, p) => buildingHash(seed, 560 + i * 7 + c) < p; };
/** A face's panes: the glass, the sky in it, a room behind. */
const glass = (art, dark, pane) => { fillIf(art, dark, pane); fillIf(art, dark, 'rgba(176,190,214,.15)'); fillIf(art, dark, 'rgba(255,196,120,.12)'); };
/** The door's place along the front (from its middle). */
const doorS = h => (h.frame.door - h.frame.fw / 2) * h.frame.side;
/** The door's hood (marquee, portico, canopy): a ledge along the front either side of the door. */
const hoodEdge = h => { const g = h.front, s = doorS(h), w = h.variant.st.hood.w; return { a: h.frontFoot(s - w), b: h.frontFoot(s + w), nx: g.nx, ny: g.ny }; };
const ledge = (art, view, edges, z, out, th, top, band, lip) => {
    const L = view.ledge(edges, z, out, th);
    fillIf(art, L.band, band); fillIf(art, L.top, top); if (lip) strokeIf(art, L.lip, lip, .9);
};
const fins = (art, view, anchors, z0, z1, w, out, face, edge) => { const F = view.fins(anchors, z0, z1, w, out); fillIf(art, F.front, face); if (edge) strokeIf(art, F.edge, edge, .8); };
const veranda = (art, view, edges, z, out, step, rh, slabTop, slabBand, rail) => {
    const V = view.veranda(edges, z, out, step, rh);
    fillIf(art, V.band, slabBand); fillIf(art, V.top, slabTop); strokeIf(art, V.posts, rail, .7); strokeIf(art, V.rail, rail, 1.2);
};

export const streetApartment = {
    windows: false,
    groundReach: 40,

    /** Under the openings: the ground floor's material and the plinth, the frieze, the courses. */
    faceUnder(h, ctx, art, f, G) {
        if (G.depth < 3) return;
        const v = h.variant, B = v.st, T = v.tone, id = v.id, H = h.H, fine = G.depth > 8;
        const band = (z0, z1, col) => art.fill(G.quad(0, 1, z0 / H, z1 / H), col);
        band(0, B.p, T.base); band(0, B.g, T.base_lo);
        band(H - B.corn, H, id === 'brownstone' ? alpha(B.cornice, .9) : id === 'deco' ? B.spandrel : id === 'terrace' ? B.trim : T.lo);
        if (!fine) return;
        const lines = (z0, z1, step, col, w = .6) => { const p = []; for (let z = z0 + step; z < z1; z += step) G.line(0, z / H, 1, z / H, p); strokeIf(art, p, col, w); };
        if (id === 'brownstone') { lines(0, B.p, 2.2, 'rgba(20,12,8,.4)'); lines(B.p, H - B.corn, 2.4, 'rgba(232,200,160,.09)'); }
        else if (id === 'deco') {
            lines(B.g, B.p, 4, 'rgba(40,30,20,.16)'); lines(B.p, H - B.corn, 4.5, 'rgba(40,30,20,.08)');
            band(B.g - .5, B.g, 'rgba(255,240,210,.35)'); band(B.g, B.g + .7, alpha(B.gold, .8));
            if (H - B.corn > B.p) {
                const p = [], n = Math.max(4, Math.round(G.length / 8)), z0 = (H - B.corn + 1.6) / H, z1 = (H - 1.6) / H;
                for (let i = 0; i < n; i++) { G.line(i / n, z0, (i + .5) / n, z1, p); G.line((i + .5) / n, z1, (i + 1) / n, z0, p); }
                strokeIf(art, p, alpha(B.gold, .7), .7);
            }
        } else if (id === 'terrace') lines(0, B.p - 1, 3, 'rgba(60,50,40,.22)', .8);
        else { lines(B.p, H - B.corn, 2.4, 'rgba(232,200,160,.08)'); lines(H - B.corn, H, 1.6, 'rgba(0,0,0,.18)'); band(B.p - 1.2, B.p + .6, B.steel); }
    },

    /** Over the walls on all faces: the openings, then the style's ledges, piers, portico, balconies, the door's hood, the cornice; the door's lamps. */
    faceOver(h, ctx, art) {
        const { view, k, faces } = ctx, v = h.variant, B = v.st, T = v.tone, id = v.id, H = h.H;
        const edges = [], fronts = [], sides = [], brackets = [], piers = [], balc = [];
        const at = (f, t) => ({ x: f.x1 + (f.x2 - f.x1) * t, y: f.y1 + (f.y2 - f.y1) * t, nx: f.nx, ny: f.ny });
        for (const f of faces) {
            const G = view.wall(f, k), L = G.length, ux = (f.x2 - f.x1) / L, uy = (f.y2 - f.y1) / L;
            const e = { a: [f.x1 - ux * 2, f.y1 - uy * 2], b: [f.x2 + ux * 2, f.y2 + uy * 2], nx: f.nx, ny: f.ny };
            edges.push(e); if (f.side !== h.facing) sides.push(e);
            if (f.side === h.facing) fronts.push({ a: [f.x1 + ux * 3, f.y1 + uy * 3], b: [f.x2 - ux * 3, f.y2 - uy * 3], nx: f.nx, ny: f.ny });
            if (G.depth >= 3) face(h, art, f, G, false);
            const bs = bays(h, f, G);
            if (id === 'brownstone' || id === 'terrace') for (const b of bs) for (const o of [-B.bay / 2 + 2, B.bay / 2 - 2]) { const t = b.u + o / L; if (t > .01 && t < .99) brackets.push(at(f, t)); }
            if (id === 'deco') bs.forEach((b, i) => { for (const s of i === bs.length - 1 ? [-1, 1] : [-1]) { const t = b.u + s * B.bay / 2 / L; if (t > .01 && t < .99) piers.push(at(f, t)); } });
            if (id === 'terrace' && f.side === h.facing) {
                const hw = (B.ww / 2 + 1.6) / L;
                for (const b of bs) if (b.u - hw > 0 && b.u + hw < 1) { const a = at(f, b.u - hw), c = at(f, b.u + hw); balc.push({ a: [a.x, a.y], b: [c.x, c.y], nx: f.nx, ny: f.ny }); }
            }
        }
        const hood = hoodEdge(h), Hd = B.hood;
        if (id === 'brownstone') {
            ledge(art, view, edges, B.p, 1.6, 1.4, B.trim, B.trim_lo, alpha(B.trim_hi, .7));
            ledge(art, view, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);
            if (brackets.length) fins(art, view, brackets, H - B.corn, H - .5, 1.6, 3.6, B.cornice, 'rgba(214,190,150,.35)');
            ledge(art, view, edges, H, 4.5, 2.6, B.cornice, B.cornice_lo, 'rgba(214,190,150,.55)');
        } else if (id === 'deco') {
            if (piers.length) fins(art, view, piers, B.g, H, 4, 1.8, lighten(T.wall, 10), alpha(B.gold, .55));
            ledge(art, view, edges, B.p, 1.2, 1, alpha(B.gold, .9), darken(T.wall, 20), null);
            ledge(art, view, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);
            ledge(art, view, edges, H, 2.6, 2.4, lighten(T.wall, 16), T.lo, alpha(B.gold, .8));
        } else if (id === 'terrace') {
            const s = doorS(h), g = h.front, cols = [-12, 12].map(d => { const p = h.frontFoot(s + d); return [p[0] + g.nx * (Hd.out - 2.5), p[1] + g.ny * (Hd.out - 2.5)]; });
            if (fronts.length) veranda(art, view, fronts, B.p + .4, 6, 4, 4.4, B.trim, B.trim_lo, B.iron);
            const C = view.columns(cols, 1.8, .4, Hd.z - Hd.th); fillIf(art, C.shafts, B.trim); fillIf(art, C.caps, B.trim_lo);
            ledge(art, view, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);
            if (sides.length) ledge(art, view, sides, B.p + .4, 1.4, 1.2, B.trim, B.trim_lo, null);
            if (balc.length) storeys(h).slice(1).forEach(([s0]) => veranda(art, view, balc, s0 + 1.4, 2.8, 2.6, 4, B.iron, B.iron, B.iron));
            if (brackets.length) fins(art, view, brackets, H - B.corn + 1, H - .5, 1.6, 3.4, B.trim, 'rgba(120,110,96,.5)');
            ledge(art, view, edges, H, 4.2, 3, B.trim, B.trim_lo, 'rgba(255,255,255,.8)');
        } else {
            ledge(art, view, [hood], Hd.z, Hd.out, Hd.th, Hd.top, Hd.band, Hd.lip);
            ledge(art, view, edges, H, 1.6, 2.2, B.conc, '#6a665f', null);
        }
        lanterns(h, ctx, art, false);
    },

    /** Its name lying on the door's hood. */
    front(h, ctx, art, emissive) {
        const v = h.variant, N = v.st.name, Hd = v.st.hood, name = v.name ?? h.record.look.sign?.text ?? '';
        if (!name) return;
        const text = N.caps ? name.toUpperCase() : name, sp = N.spacing || 0, max = Hd.w * 2 - 6, weight = parseInt(N.weight) || 400;
        let px = N.px; const w = h.measure(text, { family: N.font, size: px, weight, letter_spacing: sp });
        if (w > max) px = Math.max(5, Math.floor(px * max / w * 10) / 10);
        h.board(ctx, art, Hd.z, 0, (a, os) => a.text(text, sp / 2, os * Hd.out / 2 + .5, { font: { family: N.font, size: px, weight, letter_spacing: sp }, align: 'center', baseline: 'middle' }, { fill: emissive ? N.glow : N.ink }));
    },

    /** The trim an apartment's roof gets (frame units), over its own roof colour, kept to the edges. */
    roofTrim(h, art, fw, fd) {
        const id = h.variant.id;
        if (id === 'brownstone') {
            const band = [...rect(0, 0, fw, 7), ...rect(0, fd - 7, fw, 7), ...rect(0, 7, 7, fd - 14), ...rect(fw - 7, 7, 7, fd - 14)];
            art.fill(band, 'rgba(255,232,200,.10)');
            const p = []; for (let x = 12; x < fw; x += 12) { moveLine(p, [x, 0], [x, 7]); moveLine(p, [x, fd - 7], [x, fd]); } for (let y = 12; y < fd; y += 12) { moveLine(p, [0, y], [7, y]); moveLine(p, [fw - 7, y], [fw, y]); }
            strokeIf(art, p, 'rgba(0,0,0,.28)', .8);
            for (const x of [fw * .36, fw * .6]) {
                art.fill(rect(x + 3, 6, 22, 12), 'rgba(0,0,0,.35)'); art.fill(rect(x, 3, 22, 11), '#5a2e24'); art.stroke(rect(x + .5, 3.5, 21, 10), 'rgba(239,220,182,.6)', 1);
                for (let i = 0; i < 3; i++) { art.fill([circle(x + 4.5 + i * 6.5, 8.5, 2.4)], '#8a4a32'); art.fill([circle(x + 4.5 + i * 6.5, 8.5, 1.2)], '#1a0f0b'); }
            }
        } else if (id === 'deco') {
            const p = [];
            for (const [x, y, sx, sy] of [[0, 0, 1, 1], [fw, 0, -1, 1], [fw, fd, -1, -1], [0, fd, 1, -1]]) {
                boxPath(p, Math.min(x, x + sx * 34), Math.min(y, y + sy * 12), 34, 12); boxPath(p, Math.min(x, x + sx * 12), Math.min(y, y + sy * 34), 12, 34); boxPath(p, Math.min(x, x + sx * 20), Math.min(y, y + sy * 20), 20, 20);
            }
            for (let i = 0; i < p.length; i += 5) art.fill(p.slice(i, i + 5), 'rgba(255,240,215,.09)');   // (each its own fill, as overlapping rects were)
            art.stroke(rect(9.5, 9.5, fw - 19, fd - 19), 'rgba(216,183,122,.55)', 1); art.stroke(rect(13.5, 13.5, fw - 27, fd - 27), 'rgba(216,183,122,.3)', 1);
            for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) art.fill([circle(x, y, 2)], h.look.gold);
        } else if (id === 'terrace') {
            const trough = (x, y, w, hh) => {
                art.fill(rect(x + 2, y + 2, w, hh), 'rgba(0,0,0,.3)'); art.fill(rect(x, y, w, hh), '#4a2e1c');
                const n = Math.round(w * hh / 36);
                for (let i = 0; i < n; i++) art.fill([circle(x + 3 + (i * 29 % Math.max(1, w - 6)), y + 3 + (i * 11 % Math.max(1, hh - 6)), 2.8)], ['#3c7d44', '#2f6a3a', '#5c9a4c'][i % 3]);
                for (let i = 0; i < n / 4; i++) art.fill([circle(x + 4 + (i * 41 % Math.max(1, w - 8)), y + 3 + (i * 7 % Math.max(1, hh - 6)), 1.3)], ['#f2c14e', '#e86a8c', '#f6ecd8'][i % 3]);
            };
            art.fill(rect(8, fd - 34, fw - 16, 22), 'rgba(166,118,78,.22)');
            const p = []; for (let x = 14; x < fw - 8; x += 6) moveLine(p, [x, fd - 34], [x, fd - 12]); strokeIf(art, p, 'rgba(40,24,12,.3)', .8);
            trough(6, fd - 12, fw - 12, 7); trough(6, fd * .45, 7, fd * .45 - 14); trough(fw - 13, fd * .45, 7, fd * .45 - 14);
        } else {
            const p = []; for (let x = 20; x < fw; x += 20) moveLine(p, [x, 8], [x, fd - 8]); for (let y = 20; y < fd; y += 20) moveLine(p, [8, y], [fw - 8, y]);
            strokeIf(art, p, 'rgba(255,255,255,.04)', 1);
            for (let x = fw * .32; x < fw * .84; x += 24) {
                art.fill(rect(x + 2, 5, 18, 10), 'rgba(0,0,0,.35)'); art.fill(rect(x, 3, 18, 10), '#3a4250'); art.fill(rect(x + 1.5, 4.5, 15, 4), 'rgba(176,196,220,.25)');
                art.stroke(rect(x + .5, 3.5, 17, 9), '#1c2028', 1);
            }
            art.stroke(rect(2.5, 2.5, fw - 5, fd - 5), 'rgba(16,18,24,.55)', 5); art.stroke(rect(5.5, 5.5, fw - 11, fd - 11), 'rgba(214,190,150,.35)', .8);
        }
    },

    /** What glows on the roof at night (frame units): the loft's skylights, the deco corners. */
    roofGlow(h, art) {
        const { fw, fd } = h.frame, id = h.variant.id;
        if (id === 'loft') { const p = []; for (let x = fw * .32; x < fw * .84; x += 24) boxPath(p, x + 1.5, 4.5, 15, 7); fillIf(art, p, 'rgba(255,214,150,.75)'); }
        if (id === 'deco') { const p = []; for (const [x, y] of [[9.5, 9.5], [fw - 9.5, 9.5], [fw - 9.5, fd - 9.5], [9.5, fd - 9.5]]) dotPath(p, x, y, 2.2); art.fill(p, 'rgba(255,224,160,.95)'); }
    },

    /** The pavement in front (frame units: x along the front, y out from the wall at fd). */
    base(h, c, fw, fd, door) {
        const v = h.variant, B = v.st, T = v.tone, y = fd, dot = (x, yy, r, col) => c.fill([circle(x, yy, r)], col), ok = (x, w) => x - w / 2 > 4 && x + w / 2 < fw - 4;
        if (v.id === 'deco') {
            c.fill([['move', door - 26, y + 8], ['ellipse', door, y + 8, 26, 26, 0, 0, Math.PI, 0], ['close']], '#2a2730');
            const rays = []; for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8; moveLine(rays, [door + Math.cos(a) * 7, y + 8 + Math.sin(a) * 7], [door + Math.cos(a) * 25, y + 8 + Math.sin(a) * 25]); }
            c.stroke(rays, alpha(B.gold, .75), .9); c.stroke([['ellipse', door, y + 8, 25.5, 25.5, 0, 0, Math.PI, 0]], alpha(B.gold, .75), .9); c.stroke([['ellipse', door, y + 8, 7, 7, 0, 0, Math.PI, 0]], alpha(B.gold, .75), .9);
            c.fill(rect(door - 20 + 2, y + 2, 40, 8), 'rgba(0,0,0,.3)'); c.fill(rect(door - 20, y, 40, 8), '#1d1b22'); c.fill(rect(door - 20, y + 7.2, 40, .9), alpha(B.gold, .85));
            for (const x of [door - 38, door + 38]) {
                if (!ok(x, 16)) continue;
                c.fill(rect(x - 6, y + 9, 15, 15), 'rgba(0,0,0,.35)'); c.fill(rect(x - 7.5, y + 7, 15, 15), '#16151a'); c.stroke(rect(x - 7, y + 7.5, 14, 14), B.gold, 1);
                const fr = []; for (let k = 0; k < 7; k++) { const a = k * .9 + .3; moveLine(fr, [x, y + 14.5], [x + Math.cos(a) * 10, y + 14.5 + Math.sin(a) * 10]); }
                c.enter({}, { line_cap: 'round' }); c.stroke(fr, '#2f6a3a', 2.2); c.leave(); dot(x, y + 14.5, 2.4, '#4f8a46');
            }
            return;
        }
        if (v.id === 'terrace') {
            const pw = 24, pd = 28, t = 4;
            c.fill(rect(door - pw / 2 + 2, y + 2, pw, pd), 'rgba(0,0,0,.25)');
            const dark = [], light = []; for (let j = 0; j * t < pd; j++) for (let i = 0; i * t < pw; i++) boxPath((i + j) % 2 ? dark : light, door - pw / 2 + i * t, y + j * t, t, t);
            c.fill(dark, '#1c1d22'); c.fill(light, '#ece8de');
            c.fill(rect(door - pw / 2 - 2, y, pw + 4, 5), B.trim); c.fill(rect(door - pw / 2 - 2, y + 4.2, pw + 4, .8), 'rgba(0,0,0,.18)');
            for (const [x0, x1] of [[4, door - pw / 2 - 4], [door + pw / 2 + 4, fw - 4]]) {
                if (x1 - x0 < 8) continue;
                c.fill(rect(x0 + 1, y + 2, x1 - x0, 9), 'rgba(0,0,0,.3)'); c.fill(roundRect(x0, y + .5, x1 - x0, 8, 3), '#2f5a34'); c.fill(rect(x0 + 1, y + 1, x1 - x0 - 2, 2), 'rgba(140,190,120,.25)');
                const r = moveLine([], [x0, y + 11], [x1, y + 11]); for (let x = x0; x <= x1; x += 3.5) moveLine(r, [x, y + 11], [x, y + 9.4]); c.stroke(r, B.iron, 1.4);
            }
            for (const x of [door - pw / 2 - 11, door + pw / 2 + 11]) {
                if (!ok(x, 12)) continue;
                c.fill(rect(x - 4, y + 16, 11, 11), 'rgba(0,0,0,.3)'); c.fill(rect(x - 5.5, y + 14, 11, 11), B.trim); c.stroke(rect(x - 5, y + 14.5, 10, 10), B.trim_lo, .8);
                dot(x, y + 19.5, 6, '#2f6a3a'); dot(x - 1.8, y + 17.8, 3, '#4f8a46');
            }
            return;
        }
        if (v.id === 'loft') {
            const dw = 58, dd = 12;
            c.fill(rect(door - dw / 2 + 2, y + 2, dw, dd + 2), 'rgba(0,0,0,.3)'); c.fill(rect(door - dw / 2, y, dw, dd), '#77736c'); c.fill(rect(door - dw / 2, y + dd - 2.4, dw, 2.4), '#f2c14e');
            const hz = []; for (let x = door - dw / 2; x < door + dw / 2 - 3; x += 6) polyPath(hz, [[x, y + dd], [x + 3, y + dd], [x + 5, y + dd - 2.4], [x + 2, y + dd - 2.4]]); c.fill(hz, '#1b1c20');
            const j = []; for (let x = door - dw / 2 + 14; x < door + dw / 2; x += 14) moveLine(j, [x, y], [x, y + dd - 2.4]); strokeIf(c, j, 'rgba(0,0,0,.18)', .6);
            const rx = door + dw / 2 + 14;
            if (ok(rx + 8, 20)) { const hp = []; for (let i = 0; i < 3; i++) moveLine(hp, [rx + i * 7, y + 8], [rx + i * 7, y + 22]); c.stroke(hp, B.steel_hi, 1.6); for (let i = 0; i < 3; i++) dot(rx + i * 7, y + 8, 1.2, '#8a909a'); }
            const px = door - dw / 2 - 16;
            if (ok(px, 22)) {
                c.fill(rect(px - 9, y + 6, 22, 11), 'rgba(0,0,0,.3)'); c.fill(rect(px - 11, y + 4, 22, 11), '#7a4a2a');
                const gr = []; for (let i = 0; i < 9; i++) { const x = px - 9 + i * 2.2; moveLine(gr, [x, y + 13], [x + (i % 3 - 1) * 2, y + 5.5]); } c.stroke(gr, '#8a9a5a', 1);
            }
            return;
        }
        // brownstone: the stoop between iron rails, the areaway's railing, a planter at each end
        const sw = 26, sd = 24, n = 6;
        c.fill(rect(door - sw / 2 + 3, y + 2, sw, sd + 3), 'rgba(0,0,0,.32)');
        for (let i = 0; i < n; i++) { const t = i / (n - 1), yy = y + sd * (1 - (i + 1) / n); c.fill(rect(door - sw / 2, yy, sw, sd / n + .5), i % 2 ? T.base : T.base_lo); c.fill(rect(door - sw / 2, yy, sw, 1), `rgba(241,226,196,${.12 + .18 * t})`); }
        const rail = x => { c.fill(rect(x - 1.2, y, 2.4, sd), B.iron); dot(x, y + sd, 2.6, B.iron); dot(x - .6, y + sd - .6, .9, '#5a5c64'); };
        rail(door - sw / 2 - 1.5); rail(door + sw / 2 + 1.5);
        const r = []; for (const [x0, x1] of [[3, door - sw / 2 - 3], [door + sw / 2 + 3, fw - 3]]) { if (x1 - x0 < 6) continue; moveLine(r, [x0, y + 9], [x1, y + 9]); for (let x = x0; x <= x1; x += 4) moveLine(r, [x, y + 9], [x, y + 7.2]); }
        strokeIf(c, r, B.iron, 1.6);
        c.fill(rect(3, y, door - sw / 2 - 6, 8), 'rgba(0,0,0,.28)'); c.fill(rect(door + sw / 2 + 3, y, fw - door - sw / 2 - 6, 8), 'rgba(0,0,0,.28)');
        for (const x of [door - sw / 2 - 16, door + sw / 2 + 16]) {
            c.fill(rect(x - 5, y + 13, 13, 11), 'rgba(0,0,0,.3)'); c.fill(rect(x - 6.5, y + 11, 13, 11), '#2b1e17');
            dot(x, y + 16.5, 5, '#3c7d44'); dot(x - 2, y + 15, 2.4, '#5c9a4c'); dot(x + 1.5, y + 17.5, 1.2, '#e8b8c8');
        }
    },

    /** The night: windows and the door lit, the lamps, the cornice's lip in the lamps' colour, the name. */
    glow(h, ctx, art) {
        const { view, k, faces } = ctx, B = h.variant.st, edges = [];
        art.enter({}, { blend: 'add' });
        for (const f of faces) { const G = view.wall(f, k); if (G.depth >= 3) face(h, art, f, G, true); edges.push({ a: [f.x1, f.y1], b: [f.x2, f.y2], nx: f.nx, ny: f.ny }); }
        const rim = h.rim(ctx.dark);
        if (rim.a > .01 && edges.length) strokeIf(art, view.ledge(edges, h.H, B.rim, .01).lip, `rgba(${rim.rgb}, ${.5 * rim.a})`, .9);
        lanterns(h, ctx, art, true);
        streetApartment.front(h, ctx, art, true);
        art.leave();
    }
};

/** The door's lamps (lanterns, sconces, the portico's lantern, goosenecks). */
function lanterns(h, ctx, art, emissive) {
    const B = h.variant.st, Lm = B.lamps, s = doorS(h), lamps = [], halo = [];
    for (const d of Lm.d) { const p = h.frontPoint(ctx.view, s + d, Lm.out, Lm.z); dotPath(lamps, p[0], p[1], Lm.r); dotPath(halo, p[0], p[1], Lm.r * 4); }
    if (emissive) { art.fill(halo, 'rgba(255,190,110,.22)'); art.fill(lamps, 'rgba(255,232,180,.95)'); }
    else art.fill(lamps, h.variant.id === 'deco' ? B.gold : B.iron);
}

/** A face's openings, in the style's way. emissive: just what's lit. */
function face(h, art, f, G, emissive) {
    const id = h.variant.id;
    if (id === 'deco') return faceDeco(h, art, f, G, emissive);
    if (id === 'terrace') return faceTerrace(h, art, f, G, emissive);
    if (id === 'loft') return faceLoft(h, art, f, G, emissive);
    return faceBrown(h, art, f, G, emissive);
}

function faceBrown(h, art, f, G, emissive) {
    const B = h.variant.st, front = f.side === h.facing, { L, rect: R, poly } = wallTools(G, h.H), bs = bays(h, f, G), st = storeys(h), fine = G.depth > 6;
    const hw = B.ww / 2 / L, dw = B.door_w / L, lit = litOf(h, f), gw = [1.6, B.g - 1.8], pw = [B.g + 2.4, B.p - 4], dz = [.6, B.p - 2.2];
    if (emissive) {
        const gl = [], warm = [];
        bs.forEach((b, i) => {
            if (b.door && front) { R(warm, b.u - dw + .8 / L, b.u + dw - .8 / L, dz[1] - 4, dz[1] - .6); return; }
            if (lit(i, .5)) R(gl, b.u - hw, b.u + hw, pw[0], pw[1]);
            if (lit(i + 20, .3)) R(gl, b.u - hw * .8, b.u + hw * .8, gw[0], gw[1]);
            st.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, .55)) R(gl, b.u - hw, b.u + hw, s0 + 2, s1 - 2.4); });
        });
        fillIf(art, gl, B.lit); fillIf(art, warm, 'rgba(255,214,150,.9)');
        return;
    }
    const stone = [], dark = [], bars = [], door = [], panel = [], base = [];
    for (const b of bs) {
        const u = b.u;
        if (b.door && front) {
            R(stone, u - dw - 1.6 / L, u + dw + 1.6 / L, dz[0], dz[1] + 1.2); R(door, u - dw, u + dw, dz[0], dz[1] - 4.4); R(dark, u - dw + .6 / L, u + dw - .6 / L, dz[1] - 4, dz[1] - .6);
            if (fine) { R(bars, u - .3 / L, u + .3 / L, dz[0], dz[1] - 4.4); for (const s of [-1, 1]) for (const [z0, z1] of [[2.5, 9], [11, dz[1] - 6]]) R(panel, u + s * 1.2 / L, u + s * (dw - 1.1 / L), z0, z1); }
        } else {
            R(base, u - hw * .8 - .8 / L, u + hw * .8 + .8 / L, gw[0] - .5, gw[1] + .5); R(dark, u - hw * .8, u + hw * .8, gw[0], gw[1]);
            if (fine) for (const m of [-.5, 0, .5]) R(bars, u + hw * .8 * m - .3 / L, u + hw * .8 * m + .3 / L, gw[0], gw[1]);
            R(stone, u - hw - 1.1 / L, u + hw + 1.1 / L, pw[0] - .9, pw[1] + .5);
            poly(stone, [[u - hw - 2.2 / L, pw[1] + .6], [u + hw + 2.2 / L, pw[1] + .6], [u, pw[1] + 3.5]]);
            R(dark, u - hw, u + hw, pw[0], pw[1]);
            if (fine) { R(bars, u - .3 / L, u + .3 / L, pw[0], pw[1]); R(bars, u - hw, u + hw, (pw[0] + pw[1]) / 2 - .25, (pw[0] + pw[1]) / 2 + .25); }
        }
        for (const [s0, s1] of st) {
            const w0 = s0 + 2, w1 = s1 - 2.4;
            R(stone, u - hw - 1.8 / L, u + hw + 1.8 / L, w1, w1 + 1.8); R(stone, u - hw - .9 / L, u + hw + .9 / L, w0 - .9, w0); R(dark, u - hw, u + hw, w0, w1);
            if (fine) { R(bars, u - .3 / L, u + .3 / L, w0, w1); R(bars, u - hw, u + hw, (w0 + w1) / 2 - .25, (w0 + w1) / 2 + .25); }
        }
    }
    fillIf(art, stone, B.trim); fillIf(art, base, h.variant.tone.base_lo); glass(art, dark, B.pane); fillIf(art, door, B.door); fillIf(art, panel, 'rgba(255,230,190,.08)'); fillIf(art, bars, B.iron);
    if (fine) strokeIf(art, stone, 'rgba(80,60,40,.45)', .5);
}

function faceDeco(h, art, f, G, emissive) {
    const B = h.variant.st, T = h.variant.tone, front = f.side === h.facing, H = h.H, { L, rect: R, poly } = wallTools(G, H), bs = bays(h, f, G), st = storeys(h), fine = G.depth > 6;
    const hw = B.ww / 2 / L, dw = B.door_w / L, lit = litOf(h, f), gw = [B.g + 1.5, B.p - 3], dz = [.4, B.p - 10], tz = [B.p - 9.4, B.p - 5.6], win = (s0, s1) => [s0 + 1.4, s1 - 1.4];
    if (emissive) {
        const gl = [], warm = [];
        bs.forEach((b, i) => {
            if (b.door && front) { R(warm, b.u - dw, b.u + dw, tz[0], tz[1]); return; }
            if (lit(i, .6)) R(gl, b.u - hw, b.u + hw, gw[0], gw[1]);
            st.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, .55)) { const [w0, w1] = win(s0, s1); R(gl, b.u - hw, b.u + hw, w0, w1); } });
        });
        fillIf(art, gl, B.lit); fillIf(art, warm, 'rgba(255,214,140,.9)');
        return;
    }
    const surround = [], inner = [], bronze = [], dark = [], spand = [], gold = [], bars = [];
    for (const b of bs) {
        const u = b.u;
        if (b.door && front) {
            const o = dw + 4 / L, m = dw + 2 / L;
            poly(surround, [[u - o, 0], [u - o, B.p - 6], [u - m, B.p - 6], [u - m, B.p - 4.4], [u + m, B.p - 4.4], [u + m, B.p - 6], [u + o, B.p - 6], [u + o, 0]]);
            R(inner, u - dw - 1 / L, u + dw + 1 / L, 0, tz[1] + .6); R(bronze, u - dw, u + dw, dz[0], dz[1]); R(dark, u - dw, u + dw, tz[0], tz[1]);
            for (const s of [-1, 1]) R(dark, u + s * 1.2 / L, u + s * (dw - 1.2 / L), 3, dz[1] - 2);
            if (fine) { for (let kk = -3; kk <= 3; kk++) G.line(u, tz[0] / H, u + kk / 3 * dw, tz[1] / H, gold); G.line(u - dw, tz[0] / H, u + dw, tz[0] / H, gold); R(bars, u - .35 / L, u + .35 / L, dz[0], dz[1]); }
        } else {
            R(bronze, u - hw - .9 / L, u + hw + .9 / L, gw[0] - .9, gw[1] + .9); R(dark, u - hw, u + hw, gw[0], gw[1]);
            if (fine) { for (const m of [-1 / 3, 1 / 3]) R(bars, u + hw * m * 2 - .3 / L, u + hw * m * 2 + .3 / L, gw[0], gw[1]); G.line(u - hw, (gw[1] - 4) / H, u + hw, (gw[1] - 4) / H, gold); }
        }
        st.forEach(([s0, s1], j) => {
            const [w0, w1] = win(s0, s1);
            R(bronze, u - hw - .7 / L, u + hw + .7 / L, w0 - .4, w1 + .4); R(dark, u - hw, u + hw, w0, w1);
            if (fine) R(bars, u - .3 / L, u + .3 / L, w0, w1);
            if (j < st.length - 1) {
                const z0 = w1 + .4, z1 = s1 + 1;
                R(spand, u - hw - .7 / L, u + hw + .7 / L, z0, z1);
                if (fine) { const zm = (z0 + z1) / 2; G.line(u - hw, (zm - .6) / H, u, (zm + .6) / H, gold); G.line(u, (zm + .6) / H, u + hw, (zm - .6) / H, gold); }
            }
        });
    }
    fillIf(art, surround, T.lo); fillIf(art, inner, lighten(T.wall, 14)); fillIf(art, bronze, B.bronze); fillIf(art, spand, B.spandrel); glass(art, dark, B.pane); fillIf(art, bars, B.bronze);
    if (fine) { strokeIf(art, gold, alpha(B.gold, .75), .55); strokeIf(art, surround, 'rgba(60,40,24,.5)', .55); }
}

function faceTerrace(h, art, f, G, emissive) {
    const B = h.variant.st, front = f.side === h.facing, H = h.H, { L, rect: R, poly } = wallTools(G, H), bs = bays(h, f, G), st = storeys(h), fine = G.depth > 6;
    const hw = B.ww / 2 / L, dw = B.door_w / L, lit = litOf(h, f), gw = [B.g + 2, B.p - 5], dz = [.4, B.p - 9.5], win = (s0, s1, j) => [s0 + (j ? 1.6 : .6), s1 - 2.8];
    const fan = (p, u, z, r) => poly(p, Array.from({ length: 9 }, (_, kk) => { const a = Math.PI * kk / 8; return [u - Math.cos(a) * r / L, z + Math.sin(a) * r * .55]; }));
    if (emissive) {
        const gl = [], warm = [];
        bs.forEach((b, i) => {
            if (b.door && front) { fan(warm, b.u, dz[1] + .4, B.door_w - .6); return; }
            if (lit(i, .5)) R(gl, b.u - hw, b.u + hw, gw[0], gw[1]);
            st.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, .55)) { const [w0, w1] = win(s0, s1, j); R(gl, b.u - hw, b.u + hw, w0, w1); } });
        });
        fillIf(art, gl, B.lit); fillIf(art, warm, 'rgba(255,220,160,.9)');
        return;
    }
    const stone = [], dark = [], bars = [], door = [], fanP = [], lines = [];
    for (const b of bs) {
        const u = b.u;
        if (b.door && front) {
            R(stone, u - dw - 1.6 / L, u + dw + 1.6 / L, 0, dz[1] + B.door_w * .55 + 1.6); R(door, u - dw, u + dw, dz[0], dz[1]); fan(fanP, u, dz[1] + .4, B.door_w - .6);
            if (fine) {
                for (let kk = 1; kk < 4; kk++) { const a = Math.PI * kk / 4; G.line(u, (dz[1] + .4) / H, u - Math.cos(a) * (B.door_w - .6) / L, (dz[1] + .4 + Math.sin(a) * (B.door_w - .6) * .55) / H, lines); }
                for (const [z0, z1] of [[2.5, 7.5], [9, dz[1] - 1.6]]) { R(bars, u - dw + 1.4 / L, u + dw - 1.4 / L, z0, z0 + .5); R(bars, u - dw + 1.4 / L, u + dw - 1.4 / L, z1 - .5, z1); }
            }
        } else {
            R(stone, u - hw - 1.3 / L, u + hw + 1.3 / L, gw[0] - 1.3, gw[1] + 1.3); R(stone, u - 1.3 / L, u + 1.3 / L, gw[1] + 1.3, gw[1] + 3.2); R(dark, u - hw, u + hw, gw[0], gw[1]);
            if (fine) { R(bars, u - .3 / L, u + .3 / L, gw[0], gw[1]); for (const t of [1 / 3, 2 / 3]) { const z = gw[0] + (gw[1] - gw[0]) * t; R(bars, u - hw, u + hw, z - .25, z + .25); } }
        }
        st.forEach(([s0, s1], j) => {
            const [w0, w1] = win(s0, s1, j);
            R(stone, u - hw - 1.1 / L, u + hw + 1.1 / L, w0, w1 + 1.1);
            if (j === 0) R(stone, u - hw - 2.6 / L, u + hw + 2.6 / L, w1 + 1.4, w1 + 2.7);
            R(dark, u - hw, u + hw, w0, w1);
            if (fine) { const z = w0 + (w1 - w0) * .62; R(bars, u - .3 / L, u + .3 / L, w0, w1); R(bars, u - hw, u + hw, z - .25, z + .25); }
        });
    }
    fillIf(art, stone, B.trim); glass(art, dark, B.pane); glass(art, fanP, B.pane); fillIf(art, door, h.variant.door || B.doors[0]); fillIf(art, bars, B.trim);
    if (fine) { strokeIf(art, lines, B.trim, .5); strokeIf(art, stone, 'rgba(120,110,96,.4)', .5); }
}

function faceLoft(h, art, f, G, emissive) {
    const B = h.variant.st, T = h.variant.tone, front = f.side === h.facing, { L, rect: R } = wallTools(G, h.H), bs = bays(h, f, G), st = storeys(h), fine = G.depth > 6;
    const hw = B.ww / 2 / L, dw = B.door_w / L, lit = litOf(h, f), gw = [B.g + 1.4, B.p - 3.4], win = (s0, s1) => [s0 + 1.8, s1 - 2.6];
    const grid = (p, u0, u1, z0, z1, cols, rows) => { for (let c = 1; c < cols; c++) { const u = u0 + (u1 - u0) * c / cols; R(p, u - .3 / L, u + .3 / L, z0, z1); } for (let r = 1; r < rows; r++) { const z = z0 + (z1 - z0) * r / rows; R(p, u0, u1, z - .3, z + .3); } };
    if (emissive) {
        const warm = [], cool = [], door = [];
        bs.forEach((b, i) => {
            if (b.door && front) { R(door, b.u - dw - 4 / L, b.u + dw + 4 / L, .8, gw[1]); return; }
            if (lit(i, .35)) R(lit(i + 9, .6) ? warm : cool, b.u - hw, b.u + hw, gw[0], gw[1]);
            st.forEach(([s0, s1], j) => { if (lit(i * 5 + j + 40, .55)) { const [w0, w1] = win(s0, s1); R(lit(i * 3 + j + 70, .65) ? warm : cool, b.u - hw, b.u + hw, w0, w1); } });
        });
        fillIf(art, warm, B.lit); fillIf(art, door, 'rgba(255,214,160,.28)'); fillIf(art, cool, B.lit2);
        return;
    }
    const steel = [], dark = [], bars = [], arch = [], sill = [], plates = [], push = [];
    for (const b of bs) {
        const u = b.u;
        if (b.door && front) {
            const o = dw + 5 / L;
            R(steel, u - o - 1 / L, u + o + 1 / L, 0, gw[1] + 1); R(dark, u - o, u + o, .8, gw[1]);
            if (fine) { for (const x of [-dw, 0, dw]) R(bars, u + x - .5 / L, u + x + .5 / L, .8, gw[1]); R(bars, u - o, u + o, gw[1] - 5, gw[1] - 4.3); for (const s of [-1, 1]) R(push, u + s * 2 / L - .4 / L, u + s * 2 / L + .4 / L, 6, 13); }
        } else { R(steel, u - hw - 1 / L, u + hw + 1 / L, gw[0] - 1, gw[1] + 1); R(dark, u - hw, u + hw, gw[0], gw[1]); if (fine) grid(bars, u - hw, u + hw, gw[0], gw[1], 4, 3); }
        for (const [s0, s1] of st) {
            const [w0, w1] = win(s0, s1);
            R(arch, u - hw - 1.6 / L, u + hw + 1.6 / L, w1, w1 + 2.2); R(sill, u - hw - 1.2 / L, u + hw + 1.2 / L, w0 - 1.2, w0); R(steel, u - hw, u + hw, w0, w1); R(dark, u - hw + .8 / L, u + hw - .8 / L, w0 + .6, w1 - .6);
            if (fine) { grid(bars, u - hw + .8 / L, u + hw - .8 / L, w0 + .6, w1 - .6, 5, 3); for (const s of [-1, 1]) { const x = u + s * B.bay / 2 / L; if (x > .02 && x < .98) R(plates, x - 1.2 / L, x + 1.2 / L, s0 - 1.2, s0 + 1.2); } }
        }
    }
    fillIf(art, arch, T.lo); fillIf(art, sill, B.conc); fillIf(art, steel, B.steel); glass(art, dark, B.pane); fillIf(art, dark, 'rgba(160,200,190,.06)'); fillIf(art, bars, B.steel); fillIf(art, plates, B.iron); fillIf(art, push, B.steel_hi);
    if (fine) strokeIf(art, arch, 'rgba(0,0,0,.35)', .5);
}

