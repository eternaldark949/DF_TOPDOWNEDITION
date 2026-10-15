// GL engine: the junction lights (traffic/traffic-signals.js), drawn as Canvas draws them: on the
// ground, each way in's stop bar in its light, the demand gauge, the signal head and turn arrow on
// the kerb, the crosswalks' walk strips; after dark, the same parts again, added as light, with the
// glow round each lit lamp. Their state changes every frame, so each frame's geometry is written
// into one reused buffer for the ground and one for the glow.

/** A GLInstance whose geometry is rewritten from a GLBuildingBuilder each frame (its buffers reused) */
class GLDynamic extends GLInstance {
    set(B) {
        const built = B.finish();
        if (!built.vertices) { this.visible = false; return; }
        this.visible = true;
        if (!this.geometry || built.index instanceof Uint32Array !== this.geometry.indexBuffer.data instanceof Uint32Array) {
            this.geometry?.destroy(); this.geometry = GLInstance.geometry(B);
        } else { this.geometry.buffers[0].update(built.data); this.geometry.indexBuffer.update(built.index); }
    }
}

const GLSignals = (() => {
    let RGB = null;   // SIGNAL_RGB as 0..1 (the game's scripts load after this one)
    const P = (x, y) => [x, y, 0, 0];
    const rgba = (k, a) => { if (!RGB) { RGB = {}; for (const c in SIGNAL_RGB) RGB[c] = SIGNAL_RGB[c].split(',').map(v => +v / 255); } return [RGB[k][0], RGB[k][1], RGB[k][2], a]; };
    /** Canvas roundRect(x, y, w, h, r) as points */
    const roundRect = (x, y, w, h, r) => {
        const pts = [], c = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
        for (const [cx, cy, a0] of c) for (let i = 0; i <= 4; i++) { const a = a0 + i / 4 * Math.PI / 2; pts.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
        return pts;
    };
    /** drawGlow(x, y, r, rgb, core) as a radial fan: alpha 1 at the centre, `core` at 0.45 (none: linear) */
    const glow = (B, x, y, r, k, a, core = 0) => {
        const col = t => rgba(k, a * (core ? (t < core ? 1 - (1 - .45) * t / core : .45 * (1 - (t - core) / (1 - core))) : 1 - t));
        const rings = core ? 2 : 1, ts = core ? [0, core, 1] : [0, 1], segs = 24, base = B.n;
        B.vertex(P(x, y), undefined, undefined, 0, 0, 0, col(0));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) { const an = j / segs * Math.PI * 2; B.vertex(P(x + Math.cos(an) * r * ts[i], y + Math.sin(an) * r * ts[i]), undefined, undefined, 0, 0, 0, col(ts[i])); }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) { const a0 = base + 1 + (i - 1) * segs + j, b0 = base + 1 + (i - 1) * segs + (j + 1) % segs; B.index.push(a0, a0 + segs, b0 + segs, a0, b0 + segs, b0); }
    };

    function ground(B, sig, crosswalks, time) {
        for (const g of sig._looks()) {
            const light = sig.lightFor(g.lane), arrow = light === 'arrow', k = arrow ? 'red' : light;
            B.color('rgba(8, 4, 16, 0.55)').seg(P(g.a.x, g.a.y), P(g.b.x, g.b.y), 8);               // the stop bar
            B._c = rgba(k, .92); B.seg(P(g.a.x, g.a.y), P(g.b.x, g.b.y), 4);
            const lit = Math.min(SIGNAL_GAUGE, Math.round(sig.load[g.idx])), gl = arrow ? 'green' : light;   // the gauge
            for (let i = 0; i < SIGNAL_GAUGE; i++) {
                const x0 = g.gauge.x - g.ux * i * 18, y0 = g.gauge.y - g.uy * i * 18;
                if (i < lit) B._c = rgba(gl, sig._segA(gl, i, time)); else B.color('rgba(255, 255, 255, 0.07)');
                B.seg(P(x0, y0), P(x0 - g.ux * 11, y0 - g.uy * 11), 3.5);
            }
            const an = Math.atan2(g.uy, g.ux), c = Math.cos(an), s = Math.sin(an);            // the head on the kerb
            B.inFrame([c, s, -s, c, g.head.x, g.head.y], () => {
                const box = roundRect(-16, -6, 32, 12, 5);
                B.color('#120a1e').poly(box); B.color('rgba(202, 176, 250, 0.35)').line(box, 1, true);
                const lamps = ['green', 'amber', 'red'];
                for (let i = 0; i < 3; i++) { B._c = rgba(lamps[i], lamps[i] === k ? 1 : .16); B.disc(-9.5 + i * 9.5, 0, 3.4, 0, 0, 14); }
                const tb = roundRect(-6, 7, 12, 12, 4);
                B.color('#120a1e').poly(tb); B.color('rgba(202, 176, 250, 0.35)').line(tb, 1, true);
                B._c = rgba('green', arrow ? 1 : .16);
                B.poly([P(0, 8.6), P(3.8, 12.6), P(-3.8, 12.6)]); B.poly([P(1.3, 12.6), P(1.3, 17.4), P(-1.3, 17.4), P(-1.3, 12.6)]);
            });
        }
        for (const w of sig._walkStrips(crosswalks)) {                                            // the walk strips
            const wl = sig.walkLight(w.p), on = wl !== 'flash' || ((time / 280) | 0) % 2 === 0;
            B._c = rgba(wl === 'walk' ? 'walk' : 'wait', on ? .9 : .2);
            for (const s of w.s) B.seg(P(s[0], s[1]), P(s[2], s[3]), 3);
        }
    }
    function lit(B, sig, dark, crosswalks, time) {
        const a = Math.min(1, dark * 1.4);
        if (a < .04) return;
        for (const g of sig._looks()) {
            const light = sig.lightFor(g.lane), arrow = light === 'arrow', k = arrow ? 'red' : light;
            const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
            glow(B, mx, my, 70, k, a * .22);
            B._c = rgba(k, a * .35); B.seg(P(g.a.x, g.a.y), P(g.b.x, g.b.y), 10);
            const n = Math.min(SIGNAL_GAUGE, Math.round(sig.load[g.idx])), gl = arrow ? 'green' : light;
            for (let i = 0; i < n; i++) {
                const x0 = g.gauge.x - g.ux * i * 18, y0 = g.gauge.y - g.uy * i * 18;
                B._c = rgba(gl, a * .3 * sig._segA(gl, i, time)); B.seg(P(x0, y0), P(x0 - g.ux * 11, y0 - g.uy * 11), 7);
            }
            const li = light === 'green' ? 0 : light === 'amber' ? 1 : 2, an = Math.atan2(g.uy, g.ux), c = Math.cos(an), sn = Math.sin(an);
            glow(B, g.head.x + c * (-9.5 + li * 9.5), g.head.y + sn * (-9.5 + li * 9.5), 16, k, a * .9, .3);
            if (arrow) glow(B, g.head.x - sn * 13, g.head.y + c * 13, 14, 'green', a * .9, .3);
        }
        for (const w of sig._walkStrips(crosswalks)) {
            const wl = sig.walkLight(w.p);
            if (wl === 'flash' && ((time / 280) | 0) % 2) continue;
            B._c = rgba(wl === 'walk' ? 'walk' : 'wait', a * .3);
            for (const s of w.s) B.seg(P(s[0], s[1]), P(s[2], s[3]), 9);
        }
    }

    class Signals {
        constructor() {
            this.ground = new GLDynamic(); this.glow = new GLDynamic();
            this.glow.state = Object.assign(PIXI.State.for2d(), { blend: true, blendMode: PIXI.BLEND_MODES.ADD });
            this.stats = { junctions: 0 };
        }
        /** This frame's lights in view (null: none), and the dark (0..1) */
        sync(traffic, view, crosswalks, dark, time) {
            const G = new GLBuildingBuilder(0), L = new GLBuildingBuilder(0); let n = 0;
            if (traffic) for (const ix of traffic.network.intersections) {
                if (!ix.signal || !ix.signal.inView(view)) continue;
                ground(G, ix.signal, crosswalks, time); lit(L, ix.signal, dark, crosswalks, time); n++;
            }
            this.ground.set(G); this.glow.set(L); this.stats.junctions = n;
        }
        hide() { this.ground.visible = this.glow.visible = false; }
        destroy() { this.ground.geometry?.destroy(); this.glow.geometry?.destroy(); this.ground.destroy(); this.glow.destroy(); }
    }
    return Signals;
})();
