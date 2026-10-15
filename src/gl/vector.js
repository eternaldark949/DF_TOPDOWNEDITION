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
            r._penRun = true; r._op = op; r.state = stateFor(op); r.alpha = 1;
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
