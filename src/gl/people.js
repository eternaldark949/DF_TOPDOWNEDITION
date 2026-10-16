// GL engine: people. Each body (the player, her crew, NPCs, gangers, pedestrians, the people in her
// car) is drawn by the game's own character code onto the GPU path builder (gl/pen.js): its
// triangles go into one vertex buffer per body, posed afresh each frame, and the body is one draw,
// placed where the vector context would have put it (so it depth-sorts and fades the same).
// The hair and cloth physics run exactly as before: they read the world transform the pen reports.
const GLPeople = (() => {
    const ADD = Object.assign(PIXI.State.for2d(), { blend: true, blendMode: PIXI.BLEND_MODES.ADD });
    class People {
        constructor() { this.nodes = new Map(); this.frame = 0; this.stats = { bodies: 0, vertices: 0, ms: 0 }; }
        /** Once a frame: the stats restart, and bodies not drawn for a while are freed */
        begin() {
            this.frame++; this.stats.bodies = this.stats.vertices = this.stats.ms = 0;
            if (this.frame % 60 === 0) for (const [k, r] of this.nodes) if (r.used < this.frame - 120 && !r.node.parent) { r.node.geometry?.destroy(); r.node.destroy(); this.nodes.delete(k); }
        }
        /** Draw draw(pen) as a body into vector context ctx at its current matrix (key: one node per entity and use) */
        body(ctx, key, draw) {
            const t0 = performance.now();
            let r = this.nodes.get(key), n = 1;
            while (r && r.node.parent && r.drawn === ctx.begun) r = this.nodes.get(key + '#' + ++n);   // drawn twice in one pass (a reflection, a snapshot)
            if (n > 1) key += '#' + n;
            if (!r) { r = { node: new GLDynamic() }; this.nodes.set(key, r); }
            r.used = this.frame; r.drawn = ctx.begun;
            const m = ctx.matrix, scale = Math.hypot(m.a, m.b) || 1, zoom = (typeof game !== 'undefined' && game.camera?.zoom) || 1;
            const B = (r.B || (r.B = new GLBuildingBuilder(0))).clear(), pen = new GLPen(B, zoom * scale * (ctx.worldFrame ? 1 : 1));
            pen.base = ctx.getTransform(); pen.canvas = ctx.canvas;
            const wants = _lampShadowWants; _lampShadowWants = () => false;     // the lamp shadows are the GL engine's (no Canvas captures)
            let result;
            try { result = draw(pen); } finally { _lampShadowWants = wants; }
            r.node.set(B);
            r.node.transform.setFromMatrix(m); r.node.alpha = ctx.globalAlpha; r.node.state = ctx.globalCompositeOperation === 'lighter' ? ADD : null;
            ctx.current = null; ctx.container.addChild(r.node); (ctx._glNodes || (ctx._glNodes = new Set())).add(r.node);
            ctx.hash = ((ctx.hash || 0) * 31 + this.frame) >>> 0;                // a captured body redraws its atlas slot
            this.stats.bodies++; this.stats.vertices += B.n; this.stats.ms += performance.now() - t0;
            return result;
        }
    }
    return People;
})();

// A vector context starting a new pass lets go of the bodies placed in it last pass (its pooled groups are reused)
(() => {
    const begin = NativeVectorContext.prototype.begin;
    NativeVectorContext.prototype.begin = function (...a) {
        if (this._glNodes) { for (const n of this._glNodes) n.parent?.removeChild(n); this._glNodes.clear(); }
        this.begun = (this.begun || 0) + 1;
        return begin.apply(this, a);
    };
})();

// The game's radial sprites carry their gradient, so the pen draws them as geometry
(() => {
    const live = glowSprite;
    glowSprite = function (color, core = 0.35) {
        const cv = live(color, core);
        if (!cv._glRadial) { const rgb = color[0] === '#' ? hexToRgb(color) : color; cv._glRadial = [[0, `rgba(${rgb}, 1)`], ...(core > 0 ? [[core, `rgba(${rgb}, 0.45)`]] : []), [1, `rgba(${rgb}, 0)`]]; }
        return cv;
    };
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const c = cv.getContext('2d'), g = c.createRadialGradient(48, 48, 0, 48, 48, 48);
    const stops = [[0, 'rgba(0,0,0,.58)'], [.55, 'rgba(0,0,0,.40)'], [.8, 'rgba(0,0,0,.18)'], [1, 'rgba(0,0,0,0)']];
    for (const [t, col] of stops) g.addColorStop(t, col);
    c.fillStyle = g; c.fillRect(0, 0, 96, 96); cv._glRadial = stops;
    _humanContactSprite = cv;                                  // (humanoid-render.js paints the same sprite lazily)
})();

// Weapons are baked from their model's parts (ui/weapon-models.js): the bake keeps how to repaint itself
(() => {
    const live = bakeWeapon;
    bakeWeapon = function (model, laser) {
        const out = live(model, laser);
        if (!out.cv._glPaint) {
            let parts = model.parts;
            if (laser && model.rail) parts = parts.concat(LASER_MODULE.map(p => { const q = { ...p };
                if (p.rr) q.rr = [p.rr[0] + model.rail[0], p.rr[1] + model.rail[1], p.rr[2], p.rr[3], p.rr[4]];
                if (p.dot) q.dot = [p.dot[0] + model.rail[0], p.dot[1] + model.rail[1], p.dot[2]]; return q; }));
            const K = out.cv.width / out.w;
            out.cv._glPaint = c => { c.scale(K, K); c.translate(-out.x, -out.y); c.lineJoin = 'round'; for (const p of parts) _paintGunPart(c, p); };
        }
        return out;
    };
})();
