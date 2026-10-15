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
// flags, lean mode), colour rgba, meta (face, min depth, max LOD, -), anim (type, a, b, c),
// text (u, v, edge, softness).
const GLB_STRIDE = 3 + 3 + 3 + 4 + 4 + 4 + 4 + 4;
const GLB_MAX_FACES = 32;
// anim types (vertex shader)
const GLB_ANIM = { NONE: 0, SPIN: 1, CAUSTIC: 2, SWAY: 3, SHIMMER: 4, BLINK_ON: 5, BLINK_OFF: 6, WINDOW: 7, SKY: 8, SHEEN: 9, RIM: 10, RADIAL: 11, FLICKER: 12, GLOW: 13, TV: 14, WINDOW_TV: 15 };
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
        this.H = H; this.data = new Float32Array(4096); this.n = 0; this.index = []; this.faces = []; this.anchors = [];
        this._c = [1, 1, 1, 1]; this._face = -1; this._minDepth = 0; this._maxLod = 9; this._anim = [0, 0, 0, 0]; this._text = [-1, 0, 0, 0];
    }
    // ---- pen state ----
    color(c, a = 1) { const v = GLColor.parse(c); this._c = a === 1 ? v : [v[0], v[1], v[2], v[3] * a]; return this; }
    /** Faces register a plane (visible when dot(n, cam) > c) and an anchor (its depth gauge) */
    addFace(f) { this.faces.push([f.nx, f.ny, f.nx * (f.side === 'C' ? (f.x1 + f.x2) / 2 : f.x1) + f.ny * (f.side === 'C' ? (f.y1 + f.y2) / 2 : f.y1)]); this.anchors.push([f.x1, f.y1]); return this.faces.length - 1; }
    face(id) { this._face = id; return this; }
    gate(minDepth = 0, maxLod = 9) { this._minDepth = minDepth; this._maxLod = maxLod; return this; }
    anim(type = 0, a = 0, b = 0, c = 0) { this._anim = [type, a, b, c]; return this; }
    text(u = -1, v = 0, edge = 0, soft = 0) { this._text = [u, v, edge, soft]; return this; }
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
        d[o + 17] = this._face; d[o + 18] = this._minDepth; d[o + 19] = this._maxLod; d[o + 20] = this._add || 0;
        d[o + 21] = a[0]; d[o + 22] = a[1]; d[o + 23] = a[2]; d[o + 24] = a[3];
        d[o + 25] = t[0]; d[o + 26] = t[1]; d[o + 27] = t[2]; d[o + 28] = t[3];
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
    /** The finished geometry: interleaved vertices, indices, face planes and anchors */
    finish() {
        return { data: this.data.slice(0, this.n * GLB_STRIDE), index: this.n > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index),
                 vertices: this.n, faces: this.faces, anchors: this.anchors };
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
            attribute vec4 aMeta; attribute vec4 aAnim; attribute vec4 aText;
            uniform mat3 projectionMatrix; uniform mat3 translationMatrix;
            uniform vec2 uCam; uniform float uC; uniform float uH; uniform float uLod; uniform float uTime; uniform float uPx;
            uniform vec4 uFaces[${GLB_MAX_FACES}]; uniform vec4 uAnchors[${GLB_MAX_FACES}];
            uniform vec4 uSun; uniform vec3 uSunRGB; uniform vec4 uRim; uniform vec4 uNight;
            varying vec4 vColor; varying vec3 vLine; varying vec4 vText; varying vec2 vWorld; varying vec4 vRadial;
            float kOf(vec3 p, float mode){ return mode < .5 ? 1. + p.z / (uC - uH) : uC / (uC - min(p.z, uC * .86)); }
            vec2 lean(vec3 p, float mode){ return uCam + (p.xy - uCam) * kOf(p, mode); }
            float hash(float s, float i){ return fract(sin(s * 12.9898 + i * 78.233) * 43758.5453); }
            void main(){
                vec3 P = aPos; float mode = aLine.w; vec4 col = aColor; float hide = 0.;
                vRadial = vec4(0.);
                // the face this belongs to: hidden when it turns away; detail gated by how much of the wall shows
                if (aMeta.x > -.5) {
                    int fi = int(aMeta.x + .5);
                    vec4 pl = uFaces[fi];
                    if (dot(pl.xy, uCam) - pl.z <= 0.) hide = 1.;
                    if (aMeta.y > 0.) { float depth = length(uAnchors[fi].xy - uCam) * uH / (uC - uH); if (depth < aMeta.y) hide = 1.; }
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
                    else if (ty < 8.5) { float facing = max(0., dot(uFaces[int(aMeta.x + .5)].xy, uSun.xy)); col.a *= uSun.z * (.3 + .34 * facing); if (uSun.z <= .03) hide = 1.; }
                    else if (ty < 9.5) {
                        vec2 n = uFaces[int(aMeta.x + .5)].xy; float facing = max(0., dot(n, uSun.xy));
                        float sheenA = uSun.z * (.18 + .6 * facing), uc = .5 + .55 * (abs(n.y) > .5 ? uSun.x : uSun.y);
                        float sh = sheenA * max(0., 1. - abs(aAnim.y - uc) / .16) * aAnim.z;
                        col = vec4(uSunRGB, sh); if (!(sh > .01) || uSun.z <= .03) hide = 1.;
                    }
                    else if (ty < 10.5) { col.a *= uRim.w; if (uRim.w <= .01) hide = 1.; }
                    else if (ty < 11.5) { vRadial = vec4(aAnim.yz, aAnim.w, 1.); }
                    else if (ty < 12.5) {                                  // neon flicker (Canvas _paintSign): breathing, hum, filament, rare brownouts
                        float ms = uNight.w, sd = aAnim.y;
                        float f = (.85 + sin((ms + sd) / 1200.) * .1) * (1. + sin((ms + sd * 1.3) / 80.) * .04) * (1. + sin((ms + sd * 2.7) / 30.) * .03);
                        if (sin((ms + sd * .5) / 4000.) > .92) f *= .4 + hash(sd, floor(ms / 50.)) * .3;
                        col.a *= clamp(f, .3, 1.);
                    }
                    else if (ty < 13.5) { col.a *= uNight.x; }
                    else if (ty < 14.5) { if (!(sin(t * 9. + aAnim.w) > 0.)) col.rgb = vec3(.435, .624, .91); }   // a TV: #9ec8ff / #6f9fe8
                    else if (ty < 15.5) { float h = hash(aAnim.y, aAnim.z + uNight.z); if (!(h < .06)) hide = 1.; if (!(sin(t * 9. + aAnim.w) > 0.)) col.rgb = vec3(.435, .624, .91); }
                }
                vec2 S = lean(P, mode);
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
                else if (aText.x >= 0. && aText.z < 9.) vText.w = max(.02, .7 * uPx / (12. * kOf(P, mode)));   // edge softness: about a screen pixel
                gl_Position = hide > .5 ? vec4(2., 2., 2., 1.) : vec4((projectionMatrix * translationMatrix * vec3(S, 1.)).xy, 0., 1.);
            }`;
        const fs = `precision mediump float;
            varying vec4 vColor; varying vec3 vLine; varying vec4 vText; varying vec2 vWorld; varying vec4 vRadial;
            uniform sampler2D uFont; uniform float uAlpha;
            void main(){
                float a = 1.;
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
            uFaces: new Float32Array(GLB_MAX_FACES * 4), uAnchors: new Float32Array(GLB_MAX_FACES * 4),
            uSun: new Float32Array(4), uSunRGB: new Float32Array(3), uRim: new Float32Array(4), uNight: new Float32Array(4), uFont: PIXI.Texture.WHITE, uAlpha: 1
        }));
    }
    constructor(built, H, blend = PIXI.BLEND_MODES.NORMAL) {
        const buf = new PIXI.Buffer(built.data, true, false), S = GLB_STRIDE * 4, g = new PIXI.Geometry();
        let o = 0; const attr = (name, size) => { g.addAttribute(name, buf, size, false, PIXI.TYPES.FLOAT, S, o * 4); o += size; };
        attr('aPos', 3); attr('aPrev', 3); attr('aNext', 3); attr('aLine', 4); attr('aColor', 4); attr('aMeta', 4); attr('aAnim', 4); attr('aText', 4);
        g.addIndex(built.index);
        super(g, GLBuildingMesh.shader());
        this.blendMode = blend; this.H = H; this.vertexCount = built.vertices;
        this.faceData = new Float32Array(GLB_MAX_FACES * 4); this.anchorData = new Float32Array(GLB_MAX_FACES * 4);
        built.faces.slice(0, GLB_MAX_FACES).forEach((f, i) => this.faceData.set([f[0], f[1], f[2], 0], i * 4));
        built.anchors.slice(0, GLB_MAX_FACES).forEach((a, i) => this.anchorData.set([a[0], a[1], 0, 0], i * 4));
        this.alphaScale = 1;
    }
    _render(renderer) {
        const u = this.shader.uniforms, F = GLBuildingMesh.frame;
        u.uH = this.H; u.uFaces = this.faceData; u.uAnchors = this.anchorData;
        if (F) { u.uCam[0] = F.cam[0]; u.uCam[1] = F.cam[1]; u.uC = F.C; u.uLod = F.lod; u.uTime = F.time; u.uPx = F.px; u.uSun = F.sun; u.uSunRGB = F.sunRGB; u.uNight = F.night; u.uFont = F.font || PIXI.Texture.WHITE; }
        u.uRim = this.rim || GLBuildingMesh.noRim; u.uAlpha = this.worldAlpha;
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
