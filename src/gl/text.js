// GL engine: text. Each distinct string (a shop's name, an apartment's sign) is laid out by the
// browser's font engine once, exactly as Canvas would set it (kerning, script joins), and kept in
// one atlas texture as a signed distance field (crisp at any zoom) plus pre-blurred glow
// channels for neon. Text is then just textured quads in a building's geometry; the GPU draws
// it, fades and flickers it. Rasterising a glyph run once is the only CPU font work.
//   R: distance field (0.5 at the glyph edge)   G: soft shadow (blur 18)   B: neon bloom (40/20/8)
const GLText = (() => {
    const SIZE = 2048, RES = 3, SPREAD = 6;
    let canvas = null, ctx2d = null, data = null, base = null, texture = null;
    let shelfX = 0, shelfY = 0, shelfH = 0, revision = 0, dirty = false;
    const entries = new Map();
    const fontOf = (size, family, weight = '') => `${weight ? weight + ' ' : ''}${size}px "${family}", "URW Chancery L", "Z003", cursive`;
    const measurer = () => ctx2d || (canvas = document.createElement('canvas'), canvas.width = canvas.height = 8, ctx2d = canvas.getContext('2d', { willReadFrequently: true }));

    function measure(text, size, family = 'Great Vibes') {
        const c = measurer(); c.font = fontOf(size, family);
        return c.measureText(text).width;
    }
    function tex() {
        if (texture) return texture;
        data = new Uint8Array(SIZE * SIZE * 4);
        base = PIXI.BaseTexture.fromBuffer(data, SIZE, SIZE, { alphaMode: PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA, scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.OFF });
        return (texture = new PIXI.Texture(base));
    }
    // The distance field and glow channels, from the glyph run's coverage: pure arithmetic, run in a worker
    // (gl/text.js COMPUTE) so a new sign never stalls a frame. Returns RGBA bytes, w × h.
    const COMPUTE = function (cov, w, hgt, R, SPREAD, neon) {
        // 1D squared distance transform (Felzenszwalb)
        function edt1(f, n, d, v, z) {
            let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
            for (let q = 1; q < n; q++) {
                let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
                while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
                k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
            }
            k = 0;
            for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
        }
        function edt(grid, w, h) {
            const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
            for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = grid[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) grid[y * w + x] = d[y]; }
            for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = grid[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]); }
        }
        function blur(src, w, h, r) {                                    // three box passes ≈ gaussian (sigma ≈ r)
            const a = Float32Array.from(src), b = new Float32Array(w * h), win = 2 * r + 1;
            const pass = (from, to, len, lines, step, lineStep) => {
                for (let l = 0; l < lines; l++) {
                    const o0 = l * lineStep; let acc = 0;
                    for (let i = 0; i <= r && i < len; i++) acc += from[o0 + i * step];
                    for (let i = 0; i < len; i++) {
                        to[o0 + i * step] = acc / win;
                        const o = i - r, n = i + r + 1;
                        if (o >= 0) acc -= from[o0 + o * step];
                        if (n < len) acc += from[o0 + n * step];
                    }
                }
            };
            for (let k = 0; k < 3; k++) { pass(a, b, w, h, 1, w); pass(b, a, h, w, w, 1); }
            return a;
        }

        const outside = new Float64Array(w * hgt), inside = new Float64Array(w * hgt);
        for (let i = 0; i < w * hgt; i++) { outside[i] = cov[i] > 0.5 ? 0 : 1e20; inside[i] = cov[i] > 0.5 ? 1e20 : 0; }
        edt(outside, w, hgt); edt(inside, w, hgt);
        const sp = SPREAD * R;
        // Canvas shadowBlur b is a gaussian of sigma b / 2 (three box passes of radius r ≈ sigma r); each layer also fills the text
        const gauss = sb => blur(cov, w, hgt, Math.max(1, Math.round(sb / 2 * R)));
        const over = (...layers) => { const o = new Float32Array(cov.length); for (let i = 0; i < cov.length; i++) { let t = 1; for (const [a, m] of layers) t *= 1 - a * Math.max(cov[i], m[i]); o[i] = 1 - t; } return o; };
        const shadow = neon ? over([0.85, gauss(18)], [0.6, gauss(8)]) : null;
        const bloom = neon ? over([0.3, gauss(40)], [0.7, gauss(20)], [1, gauss(8)]) : null;
        const out = new Uint8Array(w * hgt * 4);
        for (let i = 0; i < w * hgt; i++) {
            const sd = (outside[i] > 0 ? outside[i] - 0.5 : 0.5 - inside[i]);
            out[i * 4] = Math.max(0, Math.min(255, Math.round((0.5 - sd / (2 * sp)) * 255)));
            out[i * 4 + 1] = shadow ? Math.round(shadow[i] * 255) : 0;
            out[i * 4 + 2] = bloom ? Math.round(bloom[i] * 255) : 0;
            out[i * 4 + 3] = 255;
        }
        return out;
    };
    let worker = null, jobs = 0;
    const pending = new Map();
    function startWorker() {
        if (worker !== null) return worker;
        try {
            const src = `const COMPUTE = ${COMPUTE.toString()};
                onmessage = e => { const m = e.data, out = COMPUTE(m.cov, m.w, m.h, m.R, m.SPREAD, m.neon); postMessage({ id: m.id, out }, [out.buffer]); };`;
            worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
            worker.onmessage = e => { const job = pending.get(e.data.id); pending.delete(e.data.id); if (job) put(job.e, job.w, job.h, e.data.out, job.revision); };
            worker.onerror = () => { worker = false; for (const job of pending.values()) put(job.e, job.w, job.h, COMPUTE(job.cov, job.w, job.h, job.R, SPREAD, job.neon), job.revision); pending.clear(); };
        } catch (err) { worker = false; }
        return worker;
    }
    /** Copy a computed entry into the atlas (unless the fonts changed since) */
    function put(e, w, hgt, out, rev) {
        if (rev !== revision || !data || e.dead) return;
        for (let y = 0; y < hgt; y++) data.set(out.subarray(y * w * 4, (y + 1) * w * 4), ((e.y + y) * SIZE + e.x) * 4);
        e.ready = true; dirty = true;
    }
    /** An atlas entry for text at size (world px): uv rect and its world size, centred on the text's middle */
    function entry(text, size, family = 'Great Vibes', neon = false, weight = '') {
        return place(text + '|' + size + '|' + family + '|' + (neon ? 1 : 0) + '|' + weight, text, size, fontOf(size, family, weight), neon);
    }
    /** An atlas entry for text in a CSS font (a vector context's font), at its px size */
    // Live text (labels, markers, numbers that change as you play) has the atlas's bottom quarter to itself:
    // when that fills, it is wiped and refilled by what is still on screen (gen counts the wipes)
    const LIVE_Y = SIZE * 3 / 4, live = { entries: new Map(), x: 0, y: LIVE_Y, h: 0, gen: 0 };
    function css(text, font) {
        const size = Number(/([0-9.]+)px/.exec(font)?.[1] || 10);
        return place(text + '|' + font, text, size, font, false, true);
    }
    function place(key, text, size, font, neon, isLive = false) {
        const map = isLive ? live.entries : entries;
        let e = map.get(key);
        if (e && e.revision === revision) return e;
        const c = measurer(), R = neon ? 1.5 : RES, pad = neon ? 60 : SPREAD + 2;
        c.font = font;
        const adv = c.measureText(text).width, tw = Math.ceil(adv), w = Math.ceil((tw + pad * 2) * R), hgt = Math.ceil((size * 1.6 + pad * 2) * R);
        if (w > SIZE || hgt > SIZE / 4) return null;                   // larger than the atlas allows: left out
        if (!e && isLive) {
            if (live.x + w > SIZE) { live.x = 0; live.y += live.h + 2; live.h = 0; }
            if (live.y + hgt > SIZE) { for (const old of live.entries.values()) old.dead = true; live.entries.clear(); live.x = 0; live.y = LIVE_Y; live.h = 0; live.gen++; }
            e = { x: live.x, y: live.y, w, h: hgt, gen: live.gen }; live.x += w + 2; live.h = Math.max(live.h, hgt);
            map.set(key, e);
        } else if (!e) {
            if (shelfX + w > SIZE) { shelfX = 0; shelfY += shelfH + 2; shelfH = 0; }
            if (shelfY + hgt > LIVE_Y) return null;                    // atlas full: the text is left out
            e = { x: shelfX, y: shelfY, w, h: hgt }; shelfX += w + 2; shelfH = Math.max(shelfH, hgt);
            map.set(key, e);
        }
        e.revision = revision;
        canvas.width = w; canvas.height = hgt;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.setTransform(R, 0, 0, R, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
        g.fillText(text, w / R / 2, hgt / R / 2);
        const px = g.getImageData(0, 0, w, hgt).data, cov = new Float32Array(w * hgt);
        for (let i = 0; i < w * hgt; i++) cov[i] = px[i * 4 + 3] / 255;
        tex();
        const w0 = w, h0 = hgt, rev = revision;
        if (!neon && w * hgt < 80000) put(e, w0, h0, COMPUTE(cov, w0, h0, R, SPREAD, neon), rev);    // small: ready this frame
        else if (startWorker()) { const id = ++jobs; pending.set(id, { e, w: w0, h: h0, cov, R, neon, revision: rev }); worker.postMessage({ id, cov, w: w0, h: h0, R, SPREAD, neon }); }
        else put(e, w0, h0, COMPUTE(cov, w0, h0, R, SPREAD, neon), rev);
        e.u0 = e.x / SIZE; e.v0 = e.y / SIZE; e.u1 = (e.x + w) / SIZE; e.v1 = (e.y + hgt) / SIZE;
        e.ww = w / R; e.wh = hgt / R; e.tw = adv;                       // world size at the given font size (tw: the text's advance)
        return e;
    }
    /** Emit text as a quad into builder B, centred at (x, y) in the current frame, at height z (mode).
        channel: 0 distance field (edge/softness), 1 shadow, 2 bloom; gain scales the blurred channels */
    function quad(B, e, x, y, z, mode, channel = 0, gain = 1, dy = 0) {
        if (!e) return;
        const x0 = x - e.ww / 2, y0 = y - e.wh / 2 + dy, x1 = x0 + e.ww, y1 = y0 + e.wh;
        const t = (u, v) => [u, v, channel === 0 ? 0.5 : channel * 10 + gain, channel === 0 ? 0.08 : 0];
        const base = B.n;
        B.vertex([x0, y0, z, mode], undefined, undefined, 0, 0, 0, B._c, t(e.u0, e.v0));
        B.vertex([x1, y0, z, mode], undefined, undefined, 0, 0, 0, B._c, t(e.u1, e.v0));
        B.vertex([x1, y1, z, mode], undefined, undefined, 0, 0, 0, B._c, t(e.u1, e.v1));
        B.vertex([x0, y1, z, mode], undefined, undefined, 0, 0, 0, B._c, t(e.u0, e.v1));
        B.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    /** Upload new atlas entries (once a frame, if any) */
    function flush() { if (dirty && base) { base.update(); dirty = false; } return texture; }
    /** Fonts arrived: every entry re-renders on its next use */
    function invalidate() { revision++; }
    return { measure, entry, css, quad, live, flush, invalidate, texture: () => tex() };
})();
