// GL engine: everything the game draws through a vector context (props, cats, markers, the map's
// edge, labels' plates, roofs, billboards, rain, interiors) fills and strokes on the GPU path
// builder (gl/pen.js), as people do: each run of paths between two images or texts is one vertex
// buffer and one draw, in the place and order the paths were drawn. Gradients are exact per
// vertex (no gradient textures), Canvas's shadowBlur is the soft edge it is in Canvas, and the
// procedural sprites (glows, contact shadows, weapons) are their own geometry. Clips stay stencil
// masks; images and text stay textured quads.
(() => {
    const V = NativeVectorContext.prototype, STATES = {};
    const MODES = { lighter: 'ADD', 'destination-out': 'ERASE', screen: 'SCREEN', multiply: 'MULTIPLY' };
    const stateFor = op => {
        const mode = MODES[op];
        if (!mode) return null;
        return STATES[mode] || (STATES[mode] = Object.assign(PIXI.State.for2d(), { blend: true, blendMode: PIXI.BLEND_MODES[mode] }));
    };
    /** Device pixels per unit of this context's space (curve, gradient and blur detail) */
    const detail = ctx => ctx.penK || (((typeof game !== 'undefined' && game.camera?.zoom) || 1) * ((typeof game !== 'undefined' && game._renderScale) || 1));

    // A run is flushed into its buffers when it is first drawn or measured, so a run of many paths is built once
    const render = GLDynamic.prototype._render, bounds = GLDynamic.prototype._calculateBounds;
    GLDynamic.prototype.flush = function () { if (this._dirty) { this._dirty = false; this.set(this._B); } };
    GLDynamic.prototype._render = function (r) { this.flush(); if (this.visible) render.call(this, r); };
    GLDynamic.prototype._calculateBounds = function () { this.flush(); bounds.call(this); };

    /** The pen for the next paint: the current run, if it is still the top of this container in the same blend */
    V.pen = function () {
        const op = this.globalCompositeOperation || 'source-over';
        let r = this.current;
        if (!r || !r._penRun || r.parent !== this.container || r._op !== op || r._faceTag !== this.faceTag) {
            r = this.current = this.node(GLDynamic);
            r._penRun = true; r._hasText = false; r._op = op; r.state = stateFor(op); r.alpha = 1;
            r._B = new GLBuildingBuilder(0); r._pen = new GLPen(r._B, detail(this));
        }
        r._dirty = true;
        const P = r._pen, m = this.matrix;
        P.m = [m.a, m.b, m.c, m.d, m.tx, m.ty]; P.clipPieces = null;
        P.globalAlpha = this.globalAlpha; P.globalCompositeOperation = 'source-over';
        P.fillStyle = this.fillStyle; P.strokeStyle = this.strokeStyle;
        P.lineWidth = this.lineWidth; P.lineCap = this.lineCap || 'butt'; P.lineJoin = this.lineJoin || 'miter'; P.dash = this.dash || [];
        P.shadowBlur = this.shadowBlur || 0; P.shadowColor = this.shadowColor || 'transparent'; P.shadowOffsetX = this.shadowOffsetX || 0; P.shadowOffsetY = this.shadowOffsetY || 0;
        return P;
    };
    /** The context's flattened path (already in its space) as the pen's current path */
    const load = (P, paths) => {
        const path = P.path = new GLPen.Path();
        for (const p of paths) {
            const a = p.points; if (a.length < 4) continue;
            path.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) path.lineTo(a[i], a[i + 1]);
            if (p.closed) path.closePath();
        }
    };
    const styleKey = (ctx, s) => s?.nativeGradient ? JSON.stringify([s.args, s.stops, ctx.matrix.a, ctx.matrix.b, ctx.matrix.c, ctx.matrix.d, ctx.matrix.tx, ctx.matrix.ty]) : s;

    const fill = V.fill, stroke = V.stroke, drawImage = V.drawImage;
    V.fill = function (path, rule) {
        if (this.fillStyle?.nativePattern) return fill.call(this, path, rule);       // a tiled image: a textured fill
        this.withPath(path, (paths, r) => {
            if (this.globalAlpha <= 0) return;
            this.hashPath(paths, styleKey(this, this.fillStyle)); this.hashValue(this.shadowBlur || 0);
            const P = this.pen(); load(P, paths); P.fill(rule === 'evenodd' || r === 'evenodd' ? 'evenodd' : 'nonzero'); this.pathsPainted++;
        });
    };
    V.stroke = function (path) {
        if (this.strokeStyle?.nativePattern) return stroke.call(this, path);
        this.withPath(path, paths => {
            if (this.globalAlpha <= 0) return;
            this.hashPath(paths, styleKey(this, this.strokeStyle)); this.hashValue(this.lineWidth); this.hashValue(this.shadowBlur || 0);
            const P = this.pen(); load(P, paths); P.stroke(); this.pathsPainted++;
        });
    };
    V.drawImage = function (image, ...args) {
        if (!(image && (image._glRadial || image._glPaint))) return drawImage.call(this, image, ...args);
        if (this.globalAlpha <= 0) return;
        this.hashValue(image._glRadial ? JSON.stringify(image._glRadial) : 'paint'); this.hashValue(this.globalAlpha);
        for (const v of args) this.hashValue(v);
        const m = this.matrix; this.hashValue(m.a); this.hashValue(m.b); this.hashValue(m.c); this.hashValue(m.d); this.hashValue(m.tx); this.hashValue(m.ty);
        this.pen().drawImage(image, ...args);
    };
})();

// Text: every string a vector context writes is set by the browser's font engine once, kept as a distance
// field in GLText's atlas, and drawn as a quad in the same run as the paths round it. The shader cuts the
// letter edge one screen pixel wide at whatever scale it is drawn (crisp at any zoom, no re-rasterising);
// an outline is the same field cut further out, and a text shadow its soft edge.
(() => {
    const V = NativeVectorContext.prototype, middles = new Map();
    let mc = null;
    /** How far below the given baseline (y) the em box's middle sits, for a font */
    const middle = (font, baseline) => {
        const key = font + '|' + baseline; let v = middles.get(key);
        if (v !== undefined) return v;
        if (!mc) mc = document.createElement('canvas').getContext('2d');
        mc.font = font; mc.textBaseline = 'middle'; const am = mc.measureText('Hg').fontBoundingBoxAscent;
        mc.textBaseline = baseline; const ab = mc.measureText('Hg').fontBoundingBoxAscent;
        v = (am - ab) || 0; middles.set(key, v); return v;
    };
    const ink = s => typeof s === 'string' ? GLColor.parse(s) : s && s.stops && s.stops[0] ? GLColor.parse(s.stops[0][1]) : [0, 0, 0, 1];
    const detail = ctx => ctx.penK || (((typeof game !== 'undefined' && game.camera?.zoom) || 1) * ((typeof game !== 'undefined' && game._renderScale) || 1));
    function quad(B, e, cx, cy, sx, edge, soft, c) {
        const hw = e.ww / 2 * sx, hh = e.wh / 2, base = B.n, t = (u, v) => [u, v, edge, -soft];
        B.vertex([cx - hw, cy - hh, 0, 0], undefined, undefined, 0, 0, 0, c, t(e.u0, e.v0));
        B.vertex([cx + hw, cy - hh, 0, 0], undefined, undefined, 0, 0, 0, c, t(e.u1, e.v0));
        B.vertex([cx + hw, cy + hh, 0, 0], undefined, undefined, 0, 0, 0, c, t(e.u1, e.v1));
        B.vertex([cx - hw, cy + hh, 0, 0], undefined, undefined, 0, 0, 0, c, t(e.u0, e.v1));
        B.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    function write(ctx, text, x, y, maxWidth, stroke) {
        text = String(text);
        if (!text || ctx.globalAlpha <= 0) return;
        const font = ctx.font || '10px sans-serif', e = GLText.css(text, font);
        if (!e) return;
        const style = stroke ? ctx.strokeStyle : ctx.fillStyle, c = ink(style), a = c[3] * ctx.globalAlpha;
        if (a <= 0) return;
        ctx.hashValue(text); ctx.hashValue(font); ctx.hashValue(typeof style === 'string' ? style : JSON.stringify(style?.stops || '')); ctx.hashValue(ctx.globalAlpha);
        ctx.hashValue(x); ctx.hashValue(y); ctx.hashValue(ctx.textAlign || ''); ctx.hashValue(ctx.textBaseline || ''); ctx.hashValue(GLText.live.gen);
        const m = ctx.matrix; for (const v of [m.a, m.b, m.c, m.d, m.tx, m.ty]) ctx.hashValue(v);
        if (stroke) ctx.hashValue(ctx.lineWidth);
        const sx = maxWidth > 0 && e.tw > maxWidth ? maxWidth / e.tw : 1, w = e.tw * sx, align = ctx.textAlign || 'start';
        const cx = align === 'center' ? x : align === 'right' || align === 'end' ? x - w / 2 : x + w / 2;
        const cy = y + middle(font, ctx.textBaseline || 'alphabetic');
        const P = ctx.pen(), B = P.B, r = ctx.current, k = detail(ctx) * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
        r._hasText = true;
        const soft = .6 / (12 * k), edge = stroke ? Math.max(.02, .5 - (ctx.lineWidth || 1) / 24) : .5;
        B.inFrame([m.a, m.b, m.c, m.d, m.tx, m.ty], () => {
            const sc = ctx.shadowBlur > 0 || ctx.shadowOffsetX || ctx.shadowOffsetY ? GLColor.parse(ctx.shadowColor || 'transparent') : null;
            if (sc && sc[3] > 0) {
                // Canvas's text shadow: the glyphs' soft edge, spread by the blur (the field reaches 6 px past the glyph)
                const b = (ctx.shadowBlur || 0) / k;
                quad(B, e, cx + (ctx.shadowOffsetX || 0) / k, cy + (ctx.shadowOffsetY || 0) / k, sx, Math.max(.05, edge - b / 48), Math.max(soft, Math.min(.45, b / 24)), [sc[0], sc[1], sc[2], sc[3] * ctx.globalAlpha]);
            }
            quad(B, e, cx, cy, sx, edge, soft, [c[0], c[1], c[2], a]);
        });
    }
    // Measured by the font engine that sets the glyphs (plates and bubbles fit their text as in Canvas)
    V.measureText = function (text) {
        if (!mc) mc = document.createElement('canvas').getContext('2d');
        mc.font = this.font || '10px sans-serif'; mc.textBaseline = this.textBaseline || 'alphabetic'; mc.textAlign = this.textAlign || 'start';
        return mc.measureText(String(text));
    };
    V.fillText = function (text, x, y, maxWidth) { write(this, text, x, y, maxWidth, false); };
    V.strokeText = function (text, x, y, maxWidth) { write(this, text, x, y, maxWidth, true); };
    const render = GLDynamic.prototype._render;
    GLDynamic.prototype._render = function (r) {
        if (this._hasText) { GLText.flush(); const F = GLBuildingMesh.frame; if (F) F.font = GLText.texture(); }
        render.call(this, r);
    };
})();
