// GL engine: the rings rain and footsteps make on puddles (engine/reflections.js _drawRipples). Each ring
// is one quad whose shader draws the 1-unit stroke of its ellipse, antialiased at the current zoom, instead
// of a stroked polygon of dozens of segments: a downpour of 70 rings is a few kilobytes a frame.
class GLRipples extends PIXI.Mesh {
    constructor() {
        const geometry = new PIXI.Geometry()
            .addAttribute('aVertexPosition', new PIXI.Buffer(new Float32Array(0), false, false), 2)
            .addAttribute('aLocal', new PIXI.Buffer(new Float32Array(0), false, false), 2)
            .addAttribute('aRing', new PIXI.Buffer(new Float32Array(0), false, false), 2)
            .addIndex(new PIXI.Buffer(new Uint16Array(0), false, true));
        const shader = PIXI.Shader.from(`precision highp float;
            attribute vec2 aVertexPosition; attribute vec2 aLocal; attribute vec2 aRing;
            uniform mat3 translationMatrix; uniform mat3 projectionMatrix;
            varying vec2 vLocal; varying vec2 vRing;
            void main() { vLocal = aLocal; vRing = aRing; gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.)).xy, 0., 1.); }`,
        `precision highp float;
            varying vec2 vLocal; varying vec2 vRing; uniform vec3 uColor; uniform float uPx; uniform float uAlpha;
            void main() {
                float off = abs(length(vLocal) - 1.) * vRing.x;                 // world units from the ring's line
                float a = clamp((.5 - off) * uPx + .5, 0., 1.) * vRing.y * uAlpha;   // a 1-unit stroke, its edge a pixel soft
                gl_FragColor = vec4(uColor * a, a);
            }`, { uColor: new Float32Array([1, 1, 1]), uPx: 1, uAlpha: 1 });
        super(geometry, shader);
        this.cap = 0; this.count = 0;
    }
    /** This frame's ripples ([{ x, y, t, life, r, big }]), at night or not, at px screen pixels per world unit */
    sync(list, night, px) {
        const rings = [];
        for (const r of list) {
            const f = r.t / r.life, a = (1 - f) * (r.big ? 0.55 : 0.4);
            rings.push([r.x, r.y, 1 + f * r.r, a]);
            if (r.big && f < 0.6) rings.push([r.x, r.y, 1 + f * r.r * 0.55, a]);
        }
        const n = rings.length;
        if (n > this.cap) {
            this.cap = Math.max(64, n * 2);
            const idx = new Uint16Array(this.cap * 6);
            for (let i = 0; i < this.cap; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
            this.geometry.getIndex().update(idx);
            this.pos = new Float32Array(this.cap * 8); this.loc = new Float32Array(this.cap * 8); this.ring = new Float32Array(this.cap * 8);
        }
        const P = this.pos, L = this.loc, G = this.ring;
        for (let i = 0; i < n; i++) {
            const [x, y, rx, a] = rings[i], ry = rx * 0.8, mx = (rx + 1.5) / rx, my = (ry + 1.5) / ry;
            P.set([x - rx * mx, y - ry * my, x + rx * mx, y - ry * my, x + rx * mx, y + ry * my, x - rx * mx, y + ry * my], i * 8);
            L.set([-mx, -my, mx, -my, mx, my, -mx, my], i * 8);
            for (let k = 0; k < 4; k++) { G[i * 8 + k * 2] = (rx + ry) / 2; G[i * 8 + k * 2 + 1] = a; }
        }
        this.geometry.getBuffer('aVertexPosition').update(P); this.geometry.getBuffer('aLocal').update(L); this.geometry.getBuffer('aRing').update(G);
        this.size = n * 6; this.visible = n > 0;
        const u = this.shader.uniforms; u.uColor.set(night ? [0xd8 / 255, 0xc6 / 255, 1] : [1, 1, 1]); u.uPx = px;
        this.blendMode = PIXI.BLEND_MODES.NORMAL;
    }
}
