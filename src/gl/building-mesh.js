// GL engine: building geometry. A building is built once into one vertex buffer (its walls,
// windows, ledges, roof and night lights as data) and the GPU does everything else each frame:
// the lean, which faces show, which details are fine enough for the zoom, the window lights,
// the sun on the glass, the neon flicker. Nothing is redrawn when the camera moves.
//
// The lean (as the Canvas building code draws it): a point at height z draws at
// cam + (p - cam) * k. Walls lean linearly up to the roof, k = 1 + z / (C - H) (H the
// building's height), the way the Canvas walls lerp from footprint to roof; landmark-kit
// pieces (ledges, fins, awnings) use the true perspective k = C / (C - z). Both agree at the
// footprint and at the roof. C is leanCamHeight(), a uniform.
//
// Vertex layout (floats): pos xyz, prev xyz, next xyz (strokes only), line (side, half width,
// flags, lean mode), colour rgba, meta (on a face, min depth, max LOD, additive), anim (type, a, b, c),
// text (u, v, edge, softness), face (the wall it belongs to: outward normal xy, a point on it xy).
// The face rides on every vertex, so a building can have any number of walls (a curved tower has hundreds).
const GLB_STRIDE = 3 + 3 + 3 + 4 + 4 + 4 + 4 + 4 + 4;
// anim types (vertex shader)
const GLB_ANIM = { NONE: 0, SPIN: 1, CAUSTIC: 2, SWAY: 3, SHIMMER: 4, BLINK_ON: 5, BLINK_OFF: 6, WINDOW: 7, SKY: 8, SHEEN: 9, RIM: 10, RADIAL: 11, FLICKER: 12, GLOW: 13, TV: 14, WINDOW_TV: 15, BEAM: 16, BREATHE: 17, FADE: 18, SIGN: 19, RIPPLE: 20,
                   SQ_LIGHT: 21, SQ_MOVE: 22, SQ_WINDOW: 23, SQ_SIGN: 24,   // 21-24: the Silver Queen (gl/silver-queen.js)
                   GROUND: 34 };   // the city ground's per-pixel texture (gl/ground.js): (kind, a, b)
// line flags
const GLB_LINE = { SCALE_K: 1, SQUARE: 2 };

const GLColor = {
    cache: new Map(),
    /** CSS colour → [r, g, b, a] (0..1) */
    parse(c) {
        if (Array.isArray(c)) return c;
        let v = this.cache.get(c);
        if (v) return v;
        const s = String(c).trim();
        if (s[0] === '#') {
            let h = s.slice(1);
            if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
            const n = parseInt(h.slice(0, 6), 16);
            v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
        } else {
            const m = s.match(/rgba?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(x => parseFloat(x)); v = [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1]; }
            else v = [1, 0, 1, 1];
        }
        this.cache.set(c, v);
        return v;
    },
    alpha(c, a) { const v = this.parse(c); return [v[0], v[1], v[2], v[3] * a]; },
    mix(a, b, t) { a = this.parse(a); b = this.parse(b); return a.map((x, i) => x + (b[i] - x) * t); }
};

/**
 * Builds one building's vertex data. Points are [x, y, z, mode]: z in world px up, mode 0 for
 * the wall lean (linear to the roof), 1 for true perspective. State (colour, face, gate,
 * animation, text) applies to every vertex emitted until changed, like a pen.
 */
class GLBuildingBuilder {
    constructor(H) {
        this.H = H; this.data = new Float32Array(4096); this.n = 0; this.index = []; this.faces = [];
        this._c = [1, 1, 1, 1]; this._face = -1; this._minDepth = 0; this._maxLod = 9; this._anim = [0, 0, 0, 0]; this._text = [-1, 0, 0, 0];
    }
    // ---- pen state ----
    color(c, a = 1) { const v = GLColor.parse(c); this._c = a === 1 ? v : [v[0], v[1], v[2], v[3] * a]; return this; }
    /** Faces register their plane: outward normal and its start point (visible when the camera is in front;
        the start point is also the depth gauge). Chord faces ('C') have the chord's normal, so any point of it will do */
    addFace(f) { this.faces.push([f.nx, f.ny, f.x1, f.y1]); return this.faces.length - 1; }
    face(id) { this._face = id; return this; }
    gate(minDepth = 0, maxLod = 9) { this._minDepth = minDepth; this._maxLod = maxLod; return this; }
    anim(type = 0, a = 0, b = 0, c = 0) { this._anim = [type, a, b, c]; return this; }
    text(u = -1, v = 0, edge = 0, soft = 0) { this._text = [u, v, edge, soft]; return this; }
    /** Pieces drawn far-first, re-sorted as the camera moves (Canvas sorted a curved tower's walls each frame):
        fn(item) — call item(x, y) before each piece's geometry, (x, y) its distance anchor */
    sorted(fn) {
        const g = { i0: this.index.length, items: [] };
        fn((x, y) => g.items.push({ x, y, i0: this.index.length }));
        g.i1 = this.index.length;
        g.items.forEach((it, i) => { it.i1 = i + 1 < g.items.length ? g.items[i + 1].i0 : g.i1; });
        g.items = g.items.filter(it => it.i1 > it.i0);
        if (g.items.length > 1) (this.groups || (this.groups = [])).push(g);
        return this;
    }
    reset() { this._face = -1; this._minDepth = 0; this._maxLod = 9; this._anim = [0, 0, 0, 0]; this._text = [-1, 0, 0, 0]; return this; }

    _grow(n) {
        if ((this.n + n) * GLB_STRIDE <= this.data.length) return;
        let len = this.data.length; while ((this.n + n) * GLB_STRIDE > len) len *= 2;
        const d = new Float32Array(len); d.set(this.data); this.data = d;
    }
    /** Draw fn() with points mapped by the affine m = [a, b, c, d, e, f] (a frame onto the footprint) */
    inFrame(m, fn) { const old = this.m; this.m = old ? GLBuildingBuilder.mul(old, m) : m; try { fn(); } finally { this.m = old; } return this; }
    static mul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
    _map(p) { const m = this.m; return m ? [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5], p[2], p[3]] : p; }
    /** Additive ('lighter') for what follows: premultiplied colour with zero alpha adds */
    additive(on = true) { this._add = on ? 1 : 0; return this; }
    /** One vertex; returns its index */
    vertex(p, prev = p, next = p, side = 0, hw = 0, flags = 0, color = this._c, uvText = null) {
        this._grow(1);
        if (this.m) { p = this._map(p); prev = this._map(prev); next = this._map(next); }
        const d = this.data, o = this.n * GLB_STRIDE, t = uvText || this._text, a = this._anim;
        d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2] || 0;
        d[o + 3] = prev[0]; d[o + 4] = prev[1]; d[o + 5] = prev[2] || 0;
        d[o + 6] = next[0]; d[o + 7] = next[1]; d[o + 8] = next[2] || 0;
        d[o + 9] = side; d[o + 10] = hw; d[o + 11] = flags; d[o + 12] = p[3] || 0;
        d[o + 13] = color[0]; d[o + 14] = color[1]; d[o + 15] = color[2]; d[o + 16] = color[3];
        const fc = this._face >= 0 ? this.faces[this._face] : null;
        d[o + 17] = fc ? 1 : 0; d[o + 18] = this._minDepth; d[o + 19] = this._maxLod; d[o + 20] = this._add || 0;
        d[o + 21] = a[0]; d[o + 22] = a[1]; d[o + 23] = a[2]; d[o + 24] = a[3];
        d[o + 25] = t[0]; d[o + 26] = t[1]; d[o + 27] = t[2]; d[o + 28] = t[3];
        if (fc) { d[o + 29] = fc[0]; d[o + 30] = fc[1]; d[o + 31] = fc[2]; d[o + 32] = fc[3]; } else d[o + 29] = d[o + 30] = d[o + 31] = d[o + 32] = 0;
        return this.n++;
    }
    // ---- fills ----
    /** A convex polygon (or any simple polygon with concave: true) */
    poly(pts, concave = false) {
        if (pts.length < 3) return this;
        const base = this.n;
        for (const p of pts) this.vertex(p);
        if (!concave) { for (let i = 1; i < pts.length - 1; i++) this.index.push(base, base + i, base + i + 1); return this; }
        const flat = []; for (const p of pts) flat.push(p[0], p[1]);
        for (const i of GLEarcut(flat)) this.index.push(base + i);
        return this;
    }
    /** A polygon with per-vertex colours */
    polyColors(pts, cols) {
        const base = this.n;
        pts.forEach((p, i) => this.vertex(p, p, p, 0, 0, 0, GLColor.parse(cols[i])));
        for (let i = 1; i < pts.length - 1; i++) this.index.push(base, base + i, base + i + 1);
        return this;
    }
    quad(a, b, c, d) { return this.poly([a, b, c, d]); }
    /** A rect in a plane at height z (roof, ground): x, y, w, h */
    rect(x, y, w, h, z = 0, mode = 0) { return this.poly([[x, y, z, mode], [x + w, y, z, mode], [x + w, y + h, z, mode], [x, y + h, z, mode]]); }
    /** A disc in a plane at height z */
    disc(cx, cy, r, z = 0, mode = 0, seg = 0) {
        const n = seg || Math.max(10, Math.min(48, Math.ceil(r * 1.4))), pts = [];
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, mode]); }
        return this.poly(pts);
    }
    ellipse(cx, cy, rx, ry, rot, z = 0, mode = 0) {
        const n = Math.max(12, Math.min(48, Math.ceil(Math.max(rx, ry) * 1.4))), pts = [], c = Math.cos(rot), s = Math.sin(rot);
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * c - y * s, cy + x * s + y * c, z, mode]); }
        return this.poly(pts);
    }
    /** A rounded rect in a plane (radius r or [tl, tr, br, bl]) as points */
    static roundRectPts(x, y, w, h, r, z = 0, mode = 0) {
        const R = Array.isArray(r) ? r : [r, r, r, r], pts = [];
        const corner = (cx, cy, rr, a0) => { if (rr <= 0) { pts.push([cx, cy, z, mode]); return; } const n = Math.max(3, Math.ceil(rr)); for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z, mode]); } };
        if (R[0] > 0) corner(x + R[0], y + R[0], R[0], Math.PI); else pts.push([x, y, z, mode]);
        if (R[1] > 0) corner(x + w - R[1], y + R[1], R[1], -Math.PI / 2); else pts.push([x + w, y, z, mode]);
        if (R[2] > 0) corner(x + w - R[2], y + h - R[2], R[2], 0); else pts.push([x + w, y + h, z, mode]);
        if (R[3] > 0) corner(x + R[3], y + h - R[3], R[3], Math.PI / 2); else pts.push([x, y + h, z, mode]);
        return pts;
    }
    // ---- strokes ----
    /** A polyline (or closed loop) stroked `width` wide. flags: GLB_LINE.SCALE_K widens it with the lean
        (strokes Canvas drew under a plane's scale), SQUARE squares its open ends (rect corners) */
    line(pts, width, closed = false, flags = 0) {
        if (pts.length < 2 || !(width > 0)) return this;
        const hw = width / 2, n = pts.length, segs = closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            const pa = closed ? pts[(i - 1 + n) % n] : (i > 0 ? pts[i - 1] : a);
            const nb = closed ? pts[(i + 2) % n] : (i + 2 < n ? pts[i + 2] : b);
            const fA = flags & ~(i > 0 || closed ? GLB_LINE.SQUARE : 0), fB = flags & ~(i + 2 < n || closed ? GLB_LINE.SQUARE : 0);
            const v0 = this.vertex(a, pa, b, -1, hw, fA), v1 = this.vertex(a, pa, b, 1, hw, fA);
            const v2 = this.vertex(b, a, nb, 1, hw, fB), v3 = this.vertex(b, a, nb, -1, hw, fB);
            this.index.push(v0, v1, v2, v0, v2, v3);
        }
        return this;
    }
    /** A stroke with Canvas's shadowBlur glow under it (blur px, the shadow's alpha scale) */
    softLine(pts, width, blur, closed = false, flags = 0, color = this._c) {
        const t = this._text, c = this._c; this._text = [-2, blur, 0, 0]; this._c = color;
        this.line(pts, width, closed, flags); this._text = t; this._c = c; return this;
    }
    seg(a, b, width, flags = 0) { return this.line([a, b], width, false, flags); }
    rectLine(x, y, w, h, width, z = 0, mode = 0, flags = GLB_LINE.SCALE_K) {
        return this.line([[x, y, z, mode], [x + w, y, z, mode], [x + w, y + h, z, mode], [x, y + h, z, mode]], width, true, flags);
    }
    circleLine(cx, cy, r, width, z = 0, mode = 0, flags = GLB_LINE.SCALE_K, a0 = 0, a1 = Math.PI * 2) {
        const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6, n = Math.max(12, Math.min(64, Math.ceil(r * 1.2 * Math.abs(a1 - a0) / (Math.PI * 2)))), pts = [];
        for (let i = 0; i < (full ? n : n + 1); i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, mode]); }
        return this.line(pts, width, full, flags);
    }
    /** Quadratic curve points */
    static quadPts(a, c, b, n = 12) {
        const out = [];
        for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], a[2] || 0, a[3] || 0]); }
        return out;
    }
    /** The finished geometry: interleaved vertices and indices */
    finish() {
        return { data: this.data.slice(0, this.n * GLB_STRIDE), index: this.n > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index),
                 vertices: this.n, groups: this.groups || null };
    }
}

/** A wall face as a frame: at(u, v) → a point u along the face, v (0..1) up the wall */
class GLFace {
    constructor(f, H) { this.f = f; this.H = H; this.L = Math.hypot(f.x2 - f.x1, f.y2 - f.y1); }
    at(u, v) { const f = this.f; return [f.x1 + (f.x2 - f.x1) * u, f.y1 + (f.y2 - f.y1) * u, v * this.H, 0]; }
    quad(B, u0, u1, v0, v1) { return B.poly([this.at(u0, v0), this.at(u1, v0), this.at(u1, v1), this.at(u0, v1)]); }
    line(B, u0, v0, u1, v1, width) { return B.seg(this.at(u0, v0), this.at(u1, v1), width); }
    /** A point `out` px in front of the face at (u, z px), true perspective */
    out(u, z, o) { const f = this.f; return [f.x1 + (f.x2 - f.x1) * u + f.nx * o, f.y1 + (f.y2 - f.y1) * u + f.ny * o, z, 1]; }
}

/** The mesh: one building layer, its own face table, the shared shader */
class GLBuildingMesh extends PIXI.Mesh {
    containsPoint() { return false; }                                   // scenery, never a pointer target
    static shader() {
        if (GLBuildingMesh._shader) return GLBuildingMesh._shader;
        const vs = `precision highp float;
            attribute vec3 aPos; attribute vec3 aPrev; attribute vec3 aNext; attribute vec4 aLine; attribute vec4 aColor;
            attribute vec4 aMeta; attribute vec4 aAnim; attribute vec4 aText; attribute vec4 aFace;
            uniform mat3 projectionMatrix; uniform mat3 translationMatrix;
            uniform vec2 uCam; uniform float uC; uniform float uH; uniform float uLod; uniform float uTime; uniform float uPx;
            uniform vec4 uSun; uniform vec3 uSunRGB; uniform vec4 uRim; uniform vec4 uNight; uniform float uFade;
            varying vec4 vColor; varying vec3 vLine; varying vec4 vText; varying vec2 vWorld; varying vec4 vRadial; varying vec4 vClip; varying vec4 vGround;
            float kOf(vec3 p, float mode){ return mode < .5 ? 1. + p.z / (uC - uH) : uC / (uC - min(p.z, uC * .86)); }
            vec2 lean(vec3 p, float mode){ return uCam + (p.xy - uCam) * kOf(p, mode); }
            float hash(float s, float i){ return fract(sin(s * 12.9898 + i * 78.233) * 43758.5453); }
            // ---- Silver Queen (gl/silver-queen.js): its night factors, one program per kind of light (pr), params b, c.
            // g is the glow layer's alpha (uNight.x): Canvas drew some of its glow at an absolute alpha, so those divide by it.
            // Its meshes' uRim: top (wind x, wind y, crown ring fade, 0), glow (wet, 0, crown ring fade, rim); uFade: the portico's fade.
            float sqFade(float d0, float span){ return clamp((length(aFace.zw - uCam) * uH / (uC - uH) - d0) / span, 0., 1.); }
            float sqLight(float pr, float b, float c, inout vec4 col, inout float hide){
                float g = uNight.x, dk = uNight.y, t = uTime, pa = min(1., g * 1.4), f = 1.;
                if (pr < .5) return 1.;
                if (pr < 3.5) {                                            // 1 face detail, 2 with the crown's pulse, 3 ledge rims (face fade 4..18 px)
                    f = sqFade(4., 14.);
                    if (pr < 2.5 && dk <= .05) hide = 1.;
                    if (pr > 1.5 && pr < 2.5) f *= .82 + .18 * sin(t * .7 + b);
                    if (pr > 2.5) { f *= uRim.w; if (uRim.w <= .01) hide = 1.; }
                } else if (pr < 7.5) {                                     // 4 balcony slab (shaded by the dark), 5 warm, 6 top rail, 7 rail rim
                    f = sqFade(6., 16.);
                    if (pr < 4.5) { col.rgb *= 1. - min(1., dk) * .78; f /= g; }
                    else {
                        if (dk <= .05) hide = 1.;
                        if (pr > 5.5 && pr < 6.5) f *= pa / g;
                        if (pr > 6.5) { f *= uRim.w / g; if (uRim.w <= .01) hide = 1.; }
                    }
                } else if (pr < 13.5) {                                    // the portico: 8, 9 faded, 10 marquee chase (c: its zoom set), 11 lanterns, 12, 13 post globes
                    if (dk < .05) hide = 1.;
                    f = pa;
                    if (pr < 10.5 || pr > 12.5) f /= g;
                    if (pr > 8.5 && pr < 10.5) f *= uFade;
                    if (pr > 9.5 && pr < 10.5) { f *= .35 + .65 * pow(max(0., cos(b - t * 4.2)), 3.); if ((c < .5) != (uLod < .5)) hide = 1.; }
                    if (pr > 10.5 && pr < 11.5) f *= .92 + .08 * sin(t * 2.7 + b);
                    if (pr > 12.5) f *= .96 + .04 * sin(t * 3.1 + b);
                } else if (pr < 18.5) {                                    // the roof: 14, 15 breathing (c = base% * 100 + rate * 10), 16 pad chase, 17 fairy lights (c: banded), 18 pool
                    if (dk <= .05) hide = 1.;
                    if (pr > 14.5 && pr < 15.5) { float base = floor(c / 100.) / 100.; f = base + (1. - base) * sin(t * mod(c, 100.) / 10. + b); }
                    if (pr > 15.5 && pr < 16.5) f = .25 + .75 * pow(max(0., cos(b - t * 2.4)), 4.);
                    if (pr > 16.5 && pr < 17.5) {
                        float on = .55 + .45 * pow(max(0., sin(t * (1.1 + b) + b * 20.)), 4.);
                        if (c > .5) on = .55 + .45 * (min(3., floor((on - .55) / .45 * 4.)) + .5) / 4.;
                        f = on;
                    }
                } else if (pr < 23.5) {                                    // 19 crown, 20 its ring (uRim.z), 21 beacon, 22 searchlights, 23 night veil
                    if (pr < 21.5) { f = min(1., dk * 1.3) / g; if (dk <= .05) hide = 1.; }
                    if (pr > 19.5 && pr < 20.5) f *= uRim.z;
                    if (pr > 20.5 && pr < 21.5 && !(sin(t * 3.2) > .45)) hide = 1.;
                    if (pr > 21.5 && pr < 22.5) { f = min(1., (dk - .2) / .3) / g; if (dk < .2) hide = 1.; }
                    if (pr > 22.5) { f = min(1., (dk - .2) * 1.6) / g; if (dk < .2) hide = 1.; }
                } else if (pr < 24.5) f = uRim.z;                          // 24 the crown ring by day
                else if (pr < 25.5) f = uFade;                             // 25 the portico by day
                else f = sqFade(4., 14.);                                  // 26 face detail by day
                return f;
            }
            void main(){
                vec3 P = aPos; float mode = aLine.w; vec4 col = aColor; float hide = 0.;
                vRadial = vec4(0.); vClip = vec4(0.); vGround = vec4(0.);
                // the face this belongs to: hidden when it turns away; detail gated by how much of the wall shows
                if (aMeta.x > .5) {
                    if (dot(aFace.xy, uCam - aFace.zw) <= 0.) hide = 1.;
                    if (aMeta.y > 0.) { float depth = length(aFace.zw - uCam) * uH / (uC - uH); if (depth < aMeta.y) hide = 1.; }
                }
                if (uLod > aMeta.z) hide = 1.;
                float t = uTime, ty = aAnim.x;
                if (ty > .5) {
                    if (ty < 1.5) { float a = t * aAnim.w; vec2 d = P.xy - aAnim.yz; P.xy = aAnim.yz + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)); }
                    else if (ty < 2.5) { P.y += sin(t * 1.5 + aAnim.y) * 2. + aAnim.z * sin(t * 2. + aAnim.y) * 3.; }
                    else if (ty < 3.5) { P.x += sin(t * 1.3 + aAnim.y) * 1.2; }
                    else if (ty < 4.5) { col.a *= .75 + .25 * sin(t * 3. + aAnim.y); }
                    else if (ty < 5.5) { if (!(sin(t * aAnim.z + aAnim.y) > aAnim.w)) hide = 1.; }
                    else if (ty < 6.5) { if (sin(t * aAnim.z + aAnim.y) > aAnim.w) hide = 1.; }
                    else if (ty < 7.5) {
                        // a window that changes every 7 s: lit when its hash (with the 7 s bucket) is under the threshold
                        float h = hash(aAnim.y, aAnim.z + uNight.z);
                        if (!(h < aAnim.w) || h < .06) hide = 1.;
                    }
                    else if (ty < 8.5) { float facing = max(0., dot(aFace.xy, uSun.xy)); col.a *= uSun.z * (.3 + .34 * facing); if (uSun.z <= .03) hide = 1.; }
                    else if (ty < 9.5) {
                        vec2 n = aFace.xy; float facing = max(0., dot(n, uSun.xy));
                        float sheenA = uSun.z * (.18 + .6 * facing), uc = .5 + .55 * (abs(n.y) > .5 ? uSun.x : uSun.y);
                        float sh = sheenA * max(0., 1. - abs(aAnim.y - uc) / .16) * aAnim.z;
                        col = vec4(uSunRGB, sh); if (!(sh > .01) || uSun.z <= .03) hide = 1.;
                    }
                    else if (ty < 10.5) { col.a *= uRim.w; if (uRim.w <= .01) hide = 1.; }
                    else if (ty < 11.5) { float kr = kOf(P, mode); vRadial = vec4(lean(vec3(aAnim.yz, P.z), mode), aAnim.w * kr, 1.); }
                    else if (ty < 12.5) {                                  // neon flicker (Canvas _paintSign): breathing, hum, filament, rare brownouts
                        float ms = uNight.w, sd = aAnim.y;
                        float f = (.85 + sin((ms + sd) / 1200.) * .1) * (1. + sin((ms + sd * 1.3) / 80.) * .04) * (1. + sin((ms + sd * 2.7) / 30.) * .03);
                        if (sin((ms + sd * .5) / 4000.) > .92) f *= .4 + hash(sd, floor(ms / 50.)) * .3;
                        col.a *= clamp(f, .3, 1.);
                    }
                    else if (ty < 13.5) { col.a *= uNight.x; }
                    else if (ty < 14.5) { if (!(sin(t * 9. + aAnim.w) > 0.)) col.rgb = vec3(.435, .624, .91); }   // a TV: #9ec8ff / #6f9fe8
                    else if (ty > 15.5 && ty < 16.5) { }                    // BEAM: placed after the lean
                    else if (ty > 16.5 && ty < 17.5) { col.a *= .65 + .35 * sin(t * 1.3 + aAnim.y); }
                    else if (ty > 17.5 && ty < 18.5) { col.a *= uFade; }
                    else if (ty > 19.5 && ty < 20.5) {                     // a ripple ring spreading on water: aAnim (phase, angle, span); half width in aLine.y
                        float k = fract(t * .45 + aAnim.y), rr = 10. + k * aAnim.w + aLine.y;
                        P.xy += vec2(cos(aAnim.z), sin(aAnim.z) * .92) * rr; col.a *= .5 * (1. - k);
                    }
                    else if (ty > 18.5 && ty < 19.5) {                     // a landmark's script sign: its own flicker, brighter with the dark
                        float ms = uNight.w, f = .9 + sin(ms / 1300.) * .08 + (sin(ms / 4100.) > .95 ? -.35 : 0.);
                        col.a *= clamp(f, .55, 1.) * (.35 + .65 * min(1., uNight.y * 1.4)) * max(.45, uFade);
                    }
                    else if (ty > 28.5 && ty < 32.5) {
                        // ---- Moon City (gl/moon-city.js): anims 29-32. uRim = (the club's beat count mod 32, lamps on, -, -) ----
                        float bn = uRim.x, kick = pow(1. - fract(bn), 3.), ft = uNight.w / 1000.;
                        if (ty < 29.5) {                                   // 29 PULSE: a × max(0, a0 + gain·kick + wave); aAnim (a0, flags·10 + gain, wave·100 + phase)
                            float fl = floor(aAnim.z / 10.), gain = aAnim.z - fl * 10., wv = floor(aAnim.w / 100.), ph = aAnim.w - wv * 100.;
                            float s = wv < .5 ? 0. : wv < 1.5 ? .22 * sin(t * .9 + ph) : wv < 2.5 ? .1 * sin(t * .8 + ph) : wv < 3.5 ? .2 * sin(t * .6 + ph)
                                    : wv < 4.5 ? .3 * sin(ft * 1.7 + ph) : .45 * sin(ft * 3. + ph);
                            float a = max(0., aAnim.y + gain * kick + s);
                            if (mod(fl, 2.) > .5) a /= max(uNight.x, .01);                         // 1: absolute alpha (undo the glow layer's fade)
                            if (mod(floor(fl / 2.), 2.) > .5 && uRim.y < .5) hide = 1.;              // 2: only while the lamps are on
                            if (mod(floor(fl / 4.), 2.) > .5) {                                     // 4: the marquee's flicker, brighter with the dark
                                float fk = mod(ft, 7.3) < .12 ? .35 : mod(ft, 11.1) < .06 ? .6 : 1.;
                                a *= max(.15, min(1., uNight.y * 1.3)) * fk;
                            }
                            if (mod(floor(fl / 8.), 2.) > .5) { a *= uNight.y; if (uNight.y < .25) hide = 1.; }   // 8: the searchlights, with the dark
                            if (mod(floor(fl / 16.), 2.) > .5) { a *= uSun.z; if (uSun.z <= .05) hide = 1.; }   // 16: the sky, by day
                            col.a *= a;
                        } else if (ty < 30.5) {                            // 30 DOME: a dance-floor cell (i, j): this bar's pattern and colour
                            float bar = floor(bn / 8.), pat = mod(bar, 4.), i = aAnim.y, j = aAnim.z, ph;
                            if (pat < .5) ph = length(vec2(i, j)) * .5 - bn * .5;
                            else if (pat < 1.5) ph = (i + j) * .35 - bn;
                            else if (pat < 2.5) ph = 0.;                    // (Canvas: 0 or 2, whose sine is 0)
                            else ph = (abs(i) + abs(j) > .5 ? atan(j, i) : 0.) * 2. + bn;
                            col.a *= max(0., .25 + .25 * sin(ph * 3.14159265) + .35 * kick) * .55;
                            float ci = mod(abs(i * 3. + j) + bar, 4.);   // CLUB_PAL: violet, lavender, rose, gold
                            col.rgb = ci < .5 ? vec3(.690, .471, 1.) : ci < 1.5 ? vec3(.863, .745, 1.) : ci < 2.5 ? vec3(1., .353, .588) : vec3(.910, .761, .478);
                        } else if (ty < 31.5) {                            // 31 PHASE: phase i lights in turn round the dome, a step a beat
                            float d = mod(mod(floor(bn), 8.) - aAnim.y + 8., 8.);
                            col.a *= d < .5 ? .7 + .3 * kick : d < 1.5 ? .35 : d < 2.5 ? .15 : .05;
                        } else {                                           // 32 MOVE: mist i < 10 drifting at the door (lamps on); 10 + phase: a searchlight about (b, c)
                            if (aAnim.y < 9.5) { float i = aAnim.y; P.xy += vec2(sin(t * .21 + i * 1.7) * 70., cos(t * .17 + i * 2.3) * 24.); if (uRim.y < .5) hide = 1.; }
                            else {
                                float ph = aAnim.y - 10., a = sin(t * .22 + ph) * 1.1 + ph; vec2 d = P.xy - aAnim.zw;
                                P.xy = aAnim.zw + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
                                col.a *= uNight.y / max(uNight.x, .01); if (uNight.y < .25) hide = 1.;
                            }
                        }
                    }
                    else if (ty > 20.5 && ty < 24.5) {                     // ---- Silver Queen (gl/silver-queen.js) ----
                        if (ty < 21.5) col.a *= sqLight(aAnim.y, aAnim.z, aAnim.w, col, hide);   // SQ_LIGHT (program, b, c)
                        else if (ty < 22.5) {                              // SQ_MOVE (kind, b, c); a fill's (unused) stroke attributes carry its anchor / params
                            float kd = aAnim.y, b = aAnim.z, c = aAnim.w;
                            if (kd < 2.5) {                                // 1 spin about aPrev at rate b; 2 turned to point away from the camera
                                float a = kd < 1.5 ? t * b : atan(aPrev.y - uCam.y, aPrev.x - uCam.x); vec2 d = P.xy - aPrev.xy;
                                P.xy = aPrev.xy + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
                                col.a *= sqLight(c, 0., 0., col, hide);
                            } else if (kd < 3.5) {                         // 3 a radial wash about aPrev (wall lean), radius b screen px
                                vRadial = vec4(lean(aPrev, 0.), b, 1.); col.a *= sqLight(c, 0., 0., col, hide);
                            } else if (kd < 4.5) {                         // 4 mist drifting b px across: aNext (rate, phase), aPrev (sway, rate, phase)
                                float u = fract(t * aNext.x + aNext.y);
                                P.x += b * u; P.y += aPrev.x * sin(t * aPrev.y + aPrev.z);
                                col.a *= sin(u * 3.14159) * sqLight(c, 0., 0., col, hide);
                            } else if (kd < 5.5) {                         // 5 a twinkling glint's arm (b: +x -x +y -y), c its kind; aPrev its params
                                float s = 1., tw = 0.;
                                if (c < .5) { tw = pow(max(0., sin(t * aPrev.y + aPrev.x)), 10.); if (tw < .04) hide = 1.; s = 1. + tw * 3.5; col.a *= tw * uRim.x * sqLight(8., 0., 0., col, hide); }
                                else if (c < 1.5) { tw = pow(max(0., sin(t * 1.3 + aPrev.x)), 3.); s = 1. + tw * 2.2; col.a *= (.25 + .6 * tw) * sqLight(18., 0., 0., col, hide); }
                                else if (c < 2.5) { s = 10. + 3. * sin(t * 2.2); col.a *= sqLight(14., 0., 0., col, hide); }
                                else {                                     // a mote orbiting the crown ring, screen sized
                                    float an = -t * .35 + aPrev.x; P.xy += vec2(cos(an), sin(an)) * 44.8;
                                    tw = .5 + .5 * sin(t * 3. + aPrev.y); s = (.8 + tw * 2.2) / kOf(P, mode); col.a *= sqLight(20., 0., 0., col, hide);
                                }
                                P.xy += (b < 1.5 ? vec2(b < .5 ? 1. : -1., 0.) : vec2(0., b < 2.5 ? 1. : -1.)) * s;
                            } else if (kd < 6.5) {                         // 6 a cabana curtain billowing downwind: side b, weight c, phase aPrev.x
                                vec2 n = b < .5 ? vec2(0., -1.) : b < 1.5 ? vec2(1., 0.) : b < 2.5 ? vec2(0., 1.) : vec2(-1., 0.);
                                float wl = length(uRim.xy); vec2 w = uRim.xy / (wl > 0. ? wl : 1.);
                                P.xy += n * (1.5 + max(0., dot(n, w)) * min(1., wl / 4.) * (3. + 2.5 * sin(t * 1.8 + aPrev.x))) * c;
                            } else if (kd < 7.5) { P.y += sin(t * .8 + b) * 2. + c * sin(t + b) * 3.; }    // 7 a pool ripple (stroke): row b, weight c
                            else if (kd < 8.5) { P.x += sin(t * 1.7) * b; col.a *= sqLight(c, 0., 0., col, hide); }   // 8 the moon's wobble on the water
                            else if (kd < 9.5) col.a *= sqLight(22., 0., 0., col, hide);                       // 9 a searchlight: placed after the lean
                            else {                                         // 10 moonlight sweeping the roofs: x from b, c wide, aPrev.x its top
                                float sx = b + c * (mod(t * .012, 1.6) - .3), tt = ((P.x - sx + 140.) * 280. + (P.y - aPrev.x) * 90.) / 86500.;
                                col.a *= max(0., 1. - abs(2. * tt - 1.)) * sqLight(23., 0., 0., col, hide);
                            }
                        }
                        else if (ty < 23.5) {                              // SQ_WINDOW (seed, index): a window that changes every 7 s, lit warm or lavender
                            float h = hash(aAnim.y, aAnim.z + uNight.z);
                            if (!(h < .5) || h < .06) hide = 1.;
                            if (h > .36) col.rgb = vec3(.851, .761, 1.);
                        } else {                                           // SQ_SIGN (seed, zoom bits lod 0/1/2, flickers): _paintSign's neon, faded with the portico
                            float lb = uLod < .5 ? 1. : uLod < 1.5 ? 2. : 4., f = 1.;
                            if (mod(floor(aAnim.z / lb), 2.) < .5) hide = 1.;
                            if (aAnim.w > .5) {
                                float ms = uNight.w, sd = aAnim.y;
                                f = (.85 + sin((ms + sd) / 1200.) * .1) * (1. + sin((ms + sd * 1.3) / 80.) * .04) * (1. + sin((ms + sd * 2.7) / 30.) * .03);
                                if (sin((ms + sd * .5) / 4000.) > .92) f *= .4 + hash(sd, floor(ms / 50.)) * .3;
                                f = clamp(f, .3, 1.);
                            }
                            col.a *= f * max(.45, uFade);
                        }
                        if (aText.x > -1.5 && aText.x < -.5 && aText.w != 0.) {   // cut by a roof rect at the roof's lean: (x, y, w * 4096 + h); negative keeps inside it
                            float k = 1. + uH / (uC - uH), w = abs(aText.w);
                            vec2 lo = uCam + (aText.yz - uCam) * k, hi = uCam + (aText.yz + vec2(floor(w / 4096.), mod(w, 4096.)) - uCam) * k;
                            vClip = aText.w > 0. ? vec4(lo, hi) : vec4(hi.x, lo.y, lo.x, hi.y);
                        }
                    }
                    else if (ty < 15.5) { float h = hash(aAnim.y, aAnim.z + uNight.z); if (!(h < .06)) hide = 1.; if (!(sin(t * 9. + aAnim.w) > 0.)) col.rgb = vec3(.435, .624, .91); }
                    // ---- Cozy Cafe (gl/cozy-cafe.js) ----
                    else if (ty > 24.5 && ty < 25.5) {                     // a chimney smoke puff: aAnim (puff 0..4, its rim offset xy); rises 46 px, drifts east, fades
                        float ph = fract(t * .22 + aAnim.y / 5.);
                        P += vec3(ph * 26. + sin(t + aAnim.y * 2.) * 3., -ph * 10., ph * 46.);
                        col.a *= .22 * (1. - ph);
                    }
                }
                if (ty > 33.5 && ty < 34.5) vGround = vec4(aAnim.yzw, 1.);
                vec2 S = lean(P, mode);
                if (ty > 15.5 && ty < 16.5) {                              // a searchlight: from its lamp (leaned), sweeping; aAnim (phase, heading, side)
                    float ang = -1.5708 + sin(t * .22 + aAnim.y) * .85 + aAnim.z;
                    if (aAnim.w != 0.) S += vec2(cos(ang + aAnim.w * .07), sin(ang + aAnim.w * .07)) * 900.;
                    col.a *= uNight.y; if (uNight.y <= .25) hide = 1.;
                }
                if (ty > 24.5 && ty < 25.5) S += aAnim.zw * (5. + fract(t * .22 + aAnim.y / 5.) * 11.);   // Cozy Cafe: the puff's screen radius, 5 to 16 px
                if (ty > 21.5 && ty < 22.5 && aAnim.y > 8.5 && aAnim.y < 9.5) {   // Silver Queen searchlight (SQ_MOVE 9): phase b, c = step + 3 side + 6 narrow
                    float ph = aAnim.z, cd = aAnim.w, ti = mod(cd, 3.), sd = mod(floor(cd / 3.), 2.) * 2. - 1., nb = floor(cd / 6.);
                    float az = -1.5708 + (ph > 0. ? .45 : -.45) + sin(t * .19 + ph) * .95, el = 1.02 + .16 * sin(t * .11 + ph * 1.7), zT = uC * .8;
                    vec2 p1 = uCam + (P.xy + vec2(cos(az), sin(az)) * ((zT - uH) / tan(el)) - uCam) * (uC / (uC - min(zT, uC * .86)));
                    vec2 v = p1 - S; float L = length(v); if (L < 1e-3) L = 1.; vec2 n = vec2(-v.y, v.x) / L;
                    float w0 = nb > .5 ? 2.5 : 8., w1 = max(60., L * .13) * (nb > .5 ? .3 : 1.), tt = ti < .5 ? 0. : ti < 1.5 ? .3 : 1.;
                    S += v * tt + n * sd * (w0 + (w1 - w0) * tt);
                }
                vLine = vec3(0.);
                if (aLine.x != 0.) {
                    vec2 A = lean(aPrev, mode), B = lean(aNext, mode);
                    vec2 d0 = S - A, d1 = B - S;
                    bool s0 = dot(d0, d0) < 1e-10, s1 = dot(d1, d1) < 1e-10;
                    vec2 t0 = normalize(s0 ? d1 : d0), t1 = normalize(s1 ? d0 : d1);
                    vec2 n0 = vec2(-t0.y, t0.x), n1 = vec2(-t1.y, t1.x), m = normalize(n0 + n1);
                    float hw = aLine.y; if (mod(aLine.z, 2.) > .5) hw *= kOf(P, mode);
                    float hwPx = hw / uPx, W = max(hwPx, .5) + .75 + (aText.x < -1.5 ? aText.y * 1.5 / uPx : 0.);                          // the quad reaches past the line for its antialiased edge
                    float len = W * uPx / max(dot(m, n0), .3);
                    S += m * len * aLine.x;
                    if (mod(floor(aLine.z / 2.), 2.) > .5) { if (s0) S -= t1 * hw; if (s1) S += t0 * hw; }
                    vLine = vec3(aLine.x * W, hwPx, 1.);
                }
                vWorld = S;
                vColor = vec4(col.rgb * col.a, aMeta.w > .5 ? 0. : col.a);              // additive: premultiplied colour, no coverage
                vText = aText; if (aText.x < -1.5) vText.y = aText.y / uPx;              // a soft (shadow-blurred) stroke: its blur in px
                else if (aText.x >= 0. && aText.z < 9.) vText.w = aText.w < 0. ? -aText.w : max(.02, .7 * uPx / (12. * kOf(P, mode)));   // edge softness: about a screen pixel (negative: given)
                gl_Position = hide > .5 ? vec4(2., 2., 2., 1.) : vec4((projectionMatrix * translationMatrix * vec3(S, 1.)).xy, 0., 1.);
            }`;
        const fs = `precision mediump float;
            varying vec4 vColor; varying vec3 vLine; varying vec4 vText; varying highp vec2 vWorld; varying vec4 vRadial; varying vec4 vClip; varying vec4 vGround;
            uniform sampler2D uFont; uniform float uAlpha;
            void main(){
                float a = 1.;
                if (vGround.w > .5) {                                     // the city ground (gl/ground.js)
                    if (vGround.x < 1.5) {                                // 1 grain: a speck in this 2 x 1.5 px cell, with chance a (b: seed)
                        highp vec2 c = mod(floor(vWorld / vec2(2., 1.5)), 4096.);
                        if (fract(sin(dot(c, vec2(12.9898, 78.233)) + vGround.z) * 43758.5453) >= vGround.y) discard;
                    } else {                                              // 2 pavement: 25 px tiles, a third darker, the odd one lighter, dark seams
                        highp vec2 g = floor(vWorld / 25.), f = vWorld - g * 25.; g = mod(g, 4096.);
                        float h = fract(sin(dot(g, vec2(1.6877, 9.2285)) + 234.7) * 43758.5453);
                        vec3 col = vColor.rgb / max(vColor.a, .001);
                        if (h < .35) col = vec3(39., 35., 45.) / 255.; else if (h > .93) col = mix(col, vec3(1., .925, .98), .035);
                        if (f.x < 1. || f.y < 1.) col = mix(col, vec3(8., 6., 12.) / 255., .55);
                        gl_FragColor = vec4(col, 1.) * (vColor.a * uAlpha); return;
                    }
                }
                if (vClip.x != vClip.z) {                                 // Silver Queen: cut by a roof rect (x0 > x1: kept inside it)
                    vec2 lo = min(vClip.xy, vClip.zw), hi = max(vClip.xy, vClip.zw);
                    bool inR = vWorld.x > lo.x && vWorld.x < hi.x && vWorld.y > lo.y && vWorld.y < hi.y;
                    if (inR == (vClip.x < vClip.z)) discard;
                }
                if (vText.x < -1.5) {                                     // a shadow-blurred stroke: a gaussian falloff past its core
                    float d = abs(vLine.x), s = max(.5, vText.y * .5);   // the stroke's coverage spread by a gaussian of sigma blur / 2
                    a = min(1., 2. * vLine.y / (2.5066 * s)) * exp(-d * d / (2. * s * s));
                } else if (vLine.z > .5) {                                // stroke coverage across the line (thin lines fade like Canvas hairlines)
                    float d = abs(vLine.x), w = vLine.y;
                    a = w >= .5 ? clamp(w + .5 - d, 0., 1.) : clamp(1. - d, 0., 1.) * 2. * w;
                }
                if (vRadial.w > .5) a *= max(0., 1. - length(vWorld - vRadial.xy) / vRadial.z);
                if (vText.x >= 0.) {                                      // text (gl/text.js): distance field, or a blurred glow channel
                    vec4 tx = texture2D(uFont, vText.xy);
                    if (vText.z < 9.) a *= smoothstep(vText.z - vText.w, vText.z + vText.w, tx.r);
                    else if (vText.z < 19.) a *= tx.g * (vText.z - 10.);
                    else a *= tx.b * (vText.z - 20.);
                }
                gl_FragColor = vColor * (a * uAlpha);
            }`;
        return (GLBuildingMesh._shader = PIXI.Shader.from(vs, fs, {
            uCam: new Float32Array(2), uC: 1000, uH: 50, uLod: 0, uTime: 0, uPx: 1,
            uSun: new Float32Array(4), uSunRGB: new Float32Array(3), uRim: new Float32Array(4), uNight: new Float32Array(4), uFont: PIXI.Texture.WHITE, uAlpha: 1, uFade: 1
        }));
    }
    constructor(built, H, blend = PIXI.BLEND_MODES.NORMAL) {
        const buf = new PIXI.Buffer(built.data, true, false), S = GLB_STRIDE * 4, g = new PIXI.Geometry();
        let o = 0; const attr = (name, size) => { g.addAttribute(name, buf, size, false, PIXI.TYPES.FLOAT, S, o * 4); o += size; };
        attr('aPos', 3); attr('aPrev', 3); attr('aNext', 3); attr('aLine', 4); attr('aColor', 4); attr('aMeta', 4); attr('aAnim', 4); attr('aText', 4); attr('aFace', 4);
        g.addIndex(built.index);
        super(g, GLBuildingMesh.shader());
        this.blendMode = blend; this.H = H; this.vertexCount = built.vertices;
        this.alphaScale = 1; this.fade = 1;
        if (built.groups) { this.groups = built.groups; this.indexSrc = built.index.slice(); this.sortCam = [NaN, NaN]; }
    }
    /** Re-order the far-first pieces for the camera (only when it has moved) */
    sortFor(cx, cy) {
        if (Math.abs(cx - this.sortCam[0]) < 0.5 && Math.abs(cy - this.sortCam[1]) < 0.5) return;
        this.sortCam[0] = cx; this.sortCam[1] = cy;
        const buf = this.geometry.getIndex(), dst = buf.data, src = this.indexSrc;
        for (const g of this.groups) {
            for (const it of g.items) it.d = (it.x - cx) * (it.x - cx) + (it.y - cy) * (it.y - cy);
            const order = g.items.slice().sort((a, b) => b.d - a.d);
            let o = g.i0;
            for (const it of order) { dst.set(src.subarray(it.i0, it.i1), o); o += it.i1 - it.i0; }
        }
        buf.update();
    }
    _render(renderer) {
        const u = this.shader.uniforms, F = GLBuildingMesh.frame;
        u.uH = this.H;
        if (F) { u.uCam[0] = F.cam[0]; u.uCam[1] = F.cam[1]; u.uC = F.C; u.uLod = F.lod; u.uTime = F.time; u.uPx = F.px; u.uSun = F.sun; u.uSunRGB = F.sunRGB; u.uNight = F.night; u.uFont = F.font || PIXI.Texture.WHITE; }
        u.uRim = this.rim || GLBuildingMesh.noRim; u.uAlpha = this.worldAlpha; u.uFade = this.fade;
        if (this.groups && F) this.sortFor(F.cam[0], F.cam[1]);
        super._render(renderer);
    }
}
GLBuildingMesh.frame = null;
GLBuildingMesh.noRim = new Float32Array(4);

/** Earcut (polygon triangulation, after mapbox/earcut, ISC): flat [x, y, ...] → triangle indices */
function GLEarcut(data) {
    const n = data.length / 2, out = [];
    if (n < 3) return out;
    let area = 0; for (let i = 0, j = n - 1; i < n; j = i++) area += (data[j * 2] - data[i * 2]) * (data[i * 2 + 1] + data[j * 2 + 1]);
    const idx = []; for (let i = 0; i < n; i++) idx.push(area > 0 ? i : n - 1 - i);
    const X = i => data[i * 2], Y = i => data[i * 2 + 1];
    const cross = (a, b, c) => (X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a));
    const inside = (a, b, c, p) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = 0;
    while (idx.length > 3 && guard++ < n * n) {
        let cut = false;
        for (let i = 0; i < idx.length; i++) {
            const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
            if (cross(a, b, c) <= 0) continue;
            let ok = true;
            for (const p of idx) if (p !== a && p !== b && p !== c && inside(a, b, c, p)) { ok = false; break; }
            if (!ok) continue;
            out.push(a, b, c); idx.splice(i, 1); cut = true; break;
        }
        if (!cut) break;
    }
    if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
    return out;
}
