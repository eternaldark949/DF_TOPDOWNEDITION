// GL engine: lamps. Every lamp (the antique street posts, wall lamps, floor lamps, wall strips)
// is GPU geometry built once per style, colour and lit state from the same painting Canvas
// bakes into its sprites (entities/lamps.js): the fluted cast-iron foot, the scrolled arms, the
// hexagonal lanterns, and the soft glow behind each bulb. The luminous panes and their bloom,
// drawn above the night's darkness, are geometry too. A lamp is a few instances of these pieces,
// each faded with the room's light the way Canvas fades its sprites.

/** One draw of a shared GPU geometry under this object's transform and alpha, with the building shader */
class GLInstance extends PIXI.Container {
    constructor(geometry = null) { super(); this.geometry = geometry; }
    _render(renderer) {
        const g = this.geometry;
        if (!g || !g.buffers || this.worldAlpha <= 0.002) return;
        renderer.batch.flush();
        const shader = GLBuildingMesh.shader(), u = shader.uniforms, F = GLBuildingMesh.frame;
        u.uH = 0;
        if (F) { u.uCam[0] = F.cam[0]; u.uCam[1] = F.cam[1]; u.uC = F.C; u.uLod = F.lod; u.uTime = F.time; u.uPx = F.px; u.uSun = F.sun; u.uSunRGB = F.sunRGB; u.uNight = F.night; u.uFont = F.font || PIXI.Texture.WHITE; }
        u.uRim = GLBuildingMesh.noRim; u.uAlpha = this.worldAlpha; u.uFade = 1;
        u.translationMatrix = this.worldTransform.toArray(true);
        renderer.state.set(this.state || GLInstance.state); renderer.shader.bind(shader); renderer.geometry.bind(g, shader); renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES);
    }
}
GLInstance.state = Object.assign(PIXI.State.for2d(), { blend: true });
/** A finished GLBuildingBuilder as a PIXI geometry with the building shader's attributes */
GLInstance.geometry = B => {
    const built = B.finish(), buf = new PIXI.Buffer(built.data, true, false), S = GLB_STRIDE * 4, g = new PIXI.Geometry();
    let o = 0; const attr = (name, size) => { g.addAttribute(name, buf, size, false, PIXI.TYPES.FLOAT, S, o * 4); o += size; };
    attr('aPos', 3); attr('aPrev', 3); attr('aNext', 3); attr('aLine', 4); attr('aColor', 4); attr('aMeta', 4); attr('aAnim', 4); attr('aText', 4); attr('aFace', 4);
    g.addIndex(built.index); g.vertices = built.vertices;
    return g;
};

const GLLamps = (() => {
    const P = (x, y) => [x, y, 0, 0];
    const stopColor = (stops, t) => {
        t = Math.max(0, Math.min(1, t));
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
            const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 0, a = GLColor.parse(c0), b = GLColor.parse(c1);
            const al = a[3] + (b[3] - a[3]) * f;                               // (Canvas interpolates premultiplied)
            return al > 0 ? [0, 1, 2].map(k => (a[k] * a[3] + (b[k] * b[3] - a[k] * a[3]) * f) / al).concat(al) : [0, 0, 0, 0];
        }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** A disc filled with Canvas's two-circle radial gradient, as a coloured fan (sx, sy stretch it) */
    function radial(B, cx, cy, r, x0, y0, r0, x1, y1, r1, stops, rings = 6, segs = 28, sx = 1, sy = 1) {
        const tAt = (x, y) => {
            const cdx = x1 - x0, cdy = y1 - y0, dr = r1 - r0, px = x - x0, py = y - y0;
            const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
            if (Math.abs(a) < 1e-6) return c / (2 * b);
            const d = b * b - a * c; if (d < 0) return 1;
            const q = Math.sqrt(d), hi = Math.max((b + q) / a, (b - q) / a), lo = Math.min((b + q) / a, (b - q) / a);
            return r0 + hi * dr >= 0 ? hi : lo;
        };
        const at = (x, y) => P(cx + (x - cx) * sx, cy + (y - cy) * sy), base = B.n;
        B.vertex(at(cx, cy), undefined, undefined, 0, 0, 0, stopColor(stops, tAt(cx, cy)));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
            const rr = r * i / rings, a = j / segs * Math.PI * 2, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            B.vertex(at(x, y), undefined, undefined, 0, 0, 0, stopColor(stops, tAt(x, y)));
        }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
            const a = base + 1 + (i - 1) * segs + j, b = base + 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
            B.index.push(a, c, d, a, d, b);
        }
    }
    const rgbOf = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(',');
    const bezier = (p0, p1, p2, p3, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return P(u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]); });
    const quadratic = (p0, p1, p2, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return P(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]); });
    /** Canvas arc(cx, cy, r, a0, a1, ccw) as points */
    const arc = (cx, cy, r, a0, a1, ccw = false, n = 10) => {
        let d = a1 - a0;
        if (!ccw && d < 0) d += Math.PI * 2; if (ccw && d > 0) d -= Math.PI * 2;
        return Array.from({ length: n + 1 }, (_, i) => P(cx + Math.cos(a0 + d * i / n) * r, cy + Math.sin(a0 + d * i / n) * r));
    };
    /** A stroked path with round caps */
    const stroke = (B, pts, w) => { B.line(pts, w); B.disc(pts[0][0], pts[0][1], w / 2, 0, 0, 10); const e = pts[pts.length - 1]; B.disc(e[0], e[1], w / 2, 0, 0, 10); };

    // ---- the painters (entities/lamps.js) ----
    function base(B, x, y, r) {                                         // the fluted cast-iron foot, ringed in brass
        radial(B, x, y, r, x - r * .35, y - r * .35, r * .1, x, y, r, [[0, '#3a3046'], [.55, '#1c1624'], [1, '#0b080f']], 5, 24);
        B.color('rgba(0, 0, 0, 0.55)');
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.seg(P(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55), P(x + Math.cos(a) * r * .92, y + Math.sin(a) * r * .92), .8); }
        B.color(LAMP_BRASS).circleLine(x, y, r * .5, 1, 0, 0, 0);
        B.color(LAMP_IRON_HI).line(arc(x, y, r - .6, Math.PI * 1.05, Math.PI * 1.6), .7);
    }
    function lantern(B, x, y, r, lit, color) {                          // a hexagonal lantern from above: lit glass round its iron cap
        const hex = (rr, rot = Math.PI / 6) => Array.from({ length: 6 }, (_, i) => { const a = rot + i * Math.PI / 3; return P(x + Math.cos(a) * rr, y + Math.sin(a) * rr); });
        if (lit) {                                                      // the glass: white-hot at the centre, the lamp's colour from 0.55 out
            const inner = hex(r * .55), outer = hex(r), c0 = GLColor.parse('#fffaf0'), c1 = GLColor.parse(color), b0 = B.n;
            B.vertex(P(x, y), undefined, undefined, 0, 0, 0, c0);
            for (const p of inner) B.vertex(p, undefined, undefined, 0, 0, 0, c1);
            for (const p of outer) B.vertex(p, undefined, undefined, 0, 0, 0, c1);
            for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; B.index.push(b0, b0 + 1 + i, b0 + 1 + j, b0 + 1 + i, b0 + 7 + i, b0 + 7 + j, b0 + 1 + i, b0 + 7 + j, b0 + 1 + j); }
        } else B.color('#2a2433').poly(hex(r));
        B.color(LAMP_IRON).line(hex(r), 1.2, true);
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; B.seg(P(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .62), P(x + Math.cos(a) * r, y + Math.sin(a) * r), .8); }
        B.color(LAMP_IRON).poly(hex(r * .5));                           // the cap
        B.color('rgba(176, 138, 74, 0.8)').line(hex(r * .5), .7, true);
        B.color(LAMP_IRON_HI).seg(P(x - r * .45, y - r * .2), P(x - r * .1, y - r * .45), .6);
        B.color(LAMP_BRASS).disc(x, y, r * .17, 0, 0, 10);
    }
    const STYLE = {
        antique_twin(B, lit, color) {                                   // twin lanterns on a scrolled crossarm over a fluted post
            base(B, 0, 0, 8);
            B.color(LAMP_IRON); stroke(B, [P(0, -17), P(0, 17)], 3.4);
            for (const s of [-1, 1]) for (const side of [-1, 1]) {
                const curl = bezier([0, s * 9], [side * 6, s * 9], [side * 7, s * 14], [side * 3.5, s * 14.5]);
                const cx = side * 3.5 + side * -1.4, a0 = side > 0 ? 0 : Math.PI, a1 = side > 0 ? Math.PI * 1.6 : Math.PI * .4;
                stroke(B, curl.concat(arc(cx, s * 13.6, 1.4, a0, a1, side < 0, 8)), 1.6);
            }
            B.color(LAMP_IRON_HI).seg(P(-.9, -16), P(-.9, 16), .8);
            B.color(LAMP_BRASS).disc(0, 0, 2.2, 0, 0, 12);
            for (const b of LAMP_STYLES.antique_twin.bulbs) lantern(B, b.x, b.y, 7, lit, color);
        },
        antique_crook(B, lit, color) {                                  // a shepherd's crook curling out to one lantern
            base(B, 0, 0, 6.5);
            B.color(LAMP_IRON); stroke(B, bezier([0, 0], [8, -10], [20, -11], [24, -6]).concat(quadratic([24, -6], [26, -3], [22, -1]).slice(1)), 3);
            stroke(B, quadratic([5, -4], [10, -3], [11, -7]).concat(arc(9.8, -7, 1.2, 0, Math.PI * 1.5, true, 8)), 1.4);
            B.color(LAMP_IRON_HI).line(bezier([1, -1.5], [8, -11], [19, -12], [23, -7.5]), .7);
            for (const b of LAMP_STYLES.antique_crook.bulbs) lantern(B, b.x, b.y, 6.5, lit, color);
        }
    };
    /** glowSprite(color, core) as geometry: a disc of radius r (sx, sy stretch it) */
    const glow = (B, x, y, r, color, core = .3, sx = 1, sy = 1) => {
        const rgb = hexToRgb(color);
        radial(B, x, y, r, x, y, 0, x, y, r, [[0, `rgba(${rgb}, 1)`], [core, `rgba(${rgb}, 0.45)`], [1, `rgba(${rgb}, 0)`]], 6, 28, sx, sy);
    };

    class Lamps {
        constructor() { this.pieces = new Map(); }
        piece(key, paint) {
            let g = this.pieces.get(key);
            if (!g) { const B = new GLBuildingBuilder(0); paint(B); g = GLInstance.geometry(B); this.pieces.set(key, g); }
            return g;
        }
        /**
         * The pieces of lamp's body, in Canvas's order, each with its alpha: [[geometry, alpha], ...]
         * on: whether it burns; k: the room's light on it (0..1)
         */
        body(lamp, on, k) {
            const style = LAMP_TYPE_STYLE[lamp.lampType], col = /^#[0-9a-f]{6}$/i.test(lamp.color) ? lamp.color : '#ffeebb', out = [];
            if (style) {
                if (on) out.push([this.piece('glow:' + style + col, B => { for (const b of LAMP_STYLES[style].bulbs) glow(B, b.x, b.y, 24, col); }), .85 * k]);
                if (!on || k < 1) out.push([this.piece(style + ':0:' + col, B => STYLE[style](B, false, col)), 1]);
                if (on) out.push([this.piece(style + ':1:' + col, B => STYLE[style](B, true, col)), k]);
                return out;
            }
            const t = lamp.lampType, big = t === 4, r = big ? 12 : 8, gr = big ? 34 : 24;
            if (t === 3) out.push([this.piece('wall', B => B.color('#111').disc(0, 0, 8)), 1]);
            if (t === 5) {
                out.push([this.piece('strip', B => B.color('#1a1a1a').rect(-3, -12, 6, 24)), 1]);
                if (on) { out.push([this.piece('stripGlow:' + col, B => glow(B, 0, 0, 1, col, .3, 12, 22)), .7 * k]); out.push([this.piece('stripLit:' + col, B => B.color(col).rect(-2, -10, 4, 20)), k]); }
                else out.push([this.piece('stripOff', B => B.color('#333').rect(-2, -10, 4, 20)), 1]);
            }
            if (t === 3 || t === 4 || t === 5) {
                if (on) {
                    out.push([this.piece('bulbGlow:' + gr + col, B => glow(B, 0, 0, gr, col)), .85 * k]);
                    if (k < 1) out.push([this.piece('bulbOff:' + r, B => B.color('#444444').disc(0, 0, r)), 1]);
                    out.push([this.piece('bulb:' + r + col, B => B.color(col).disc(0, 0, r)), k]);
                } else out.push([this.piece('bulbOff:' + r, B => B.color('#444444').disc(0, 0, r)), 1]);
            }
            return out;
        }
        /** The luminous panes and their bloom (drawn above the darkness; street posts only) */
        emission(lamp) {
            const style = LAMP_TYPE_STYLE[lamp.lampType];
            if (!style) return null;
            const color = /^#[0-9a-f]{6}$/i.test(lamp.color) ? lamp.color : '#ffeebb', radius = style === 'antique_twin' ? 7 : 6.5;
            return this.piece('emit:' + style + color, B => {
                const rgb = rgbOf(color);
                for (const b of LAMP_STYLES[style].bulbs) {
                    const x = b.x, y = b.y;
                    radial(B, x, y, 24, x, y, radius * .6, x, y, 24, [[0, `rgba(${rgb},0.30)`], [.25, `rgba(${rgb},0.20)`], [.6, `rgba(${rgb},0.07)`], [1, `rgba(${rgb},0)`]], 8, 32);
                    radial(B, x, y, radius * 1.65, x, y, radius * .45, x, y, radius * 1.65, [[0, 'rgba(255,249,230,0.40)'], [.48, `rgba(${rgb},0.26)`], [1, `rgba(${rgb},0)`]], 5, 28);
                    // light between the corner ribs: six panes, the face gradient from 0.45 r out
                    const face = [[0, '#fff8e2'], [.32, '#fffef9'], [.70, '#fff5d9'], [1, color]], at = d => stopColor(face, (d - .45) / .55);
                    const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; });
                    for (let i = 0; i < 6; i++) {
                        const p = pts[i], q = pts[(i + 1) % 6], inset = .12;
                        const a = [p[0] + (q[0] - p[0]) * inset, p[1] + (q[1] - p[1]) * inset], c = [q[0] + (p[0] - q[0]) * inset, q[1] + (p[1] - q[1]) * inset];
                        const v = (u, s) => B.vertex(P(x + u[0] * radius * s, y + u[1] * radius * s), undefined, undefined, 0, 0, 0, at(s * Math.hypot(u[0], u[1])));
                        const i0 = v(a, .91), i1 = v(c, .91), i2 = v(c, .59), i3 = v(a, .59);
                        B.index.push(i0, i1, i2, i0, i2, i3);
                    }
                }
            });
        }
        destroy() { for (const g of this.pieces.values()) g.destroy(); this.pieces.clear(); }
    }
    return Lamps;
})();
