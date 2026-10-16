// GL engine: the buildings system. Owns every building's GPU geometry (built once from the
// building model, gl/building-model.js), shows the ones in view, and feeds the shader its
// per-frame uniforms: the camera, the lean height, the zoom detail, the clock, the sun and the
// night. Nothing about a building is redrawn while the camera moves.
class GLBuildingsSystem {
    constructor(renderer) {
        this.renderer = renderer; this.records = new Map(); this.frame = 0;
        this.stats = { builds: 0, buildMs: 0, shown: 0, vertices: 0, resident: 0 };
        this.fontRevision = -1;
    }
    /** The buildings drawn natively: the city's generic buildings, shops and apartments, and the landmarks ported so far */
    supports(b) { return !!(b && b.isV2 && (!b.style || b.style === 'apartment' || GLBuildingsSystem.landmarks[b.style]) && b.sections && b.sections.length && CONFIG.BUILDINGS.LEAN); }
    model(b) { return GLBuildingsSystem.landmarks[b.style] || GLBuildingModel; }
    key(b) { return [b.x, b.y, b.floors, b.facing, b.style, b.variant && b.variant.id, ...b.sections.flatMap(s => [s.x, s.y, s.w, s.h])].join(':'); }

    begin(game, view) {
        const R = this.renderer, cam = game.camera, sun = sunNow(), dc = game.dayCycle(), dark = dc.darkness;
        GLText.frame();
        if (this.textEpoch !== GLText.epoch()) { this.textEpoch = GLText.epoch(); for (const r of this.records.values()) r.key = null; }
        if (this.fontRevision !== (R.fontRevision || 0)) { this.fontRevision = R.fontRevision || 0; GLText.invalidate(); for (const r of this.records.values()) r.key = null; }
        const rgb = String(sun.rgb).split(',').map(v => +v / 255);
        GLBuildingMesh.frame = {
            cam: [cam.x, cam.y], C: leanCamHeight(), lod: _zoomLOD, time: _gameTimeSec, px: 1 / (R.world.scale.x || 1),
            sun: new Float32Array([sun.dx, sun.dy, sun.day, 0]), sunRGB: new Float32Array(rgb),
            night: new Float32Array([Math.max(0.15, Math.min(1, dark * 1.1)), dark, Math.floor(_gameTimeSec / 7), _frameTime % 3769911]),
            font: GLText.texture()
        };
        this.rimA = (dc.lampsOn ? 1 : 0) * Math.max(0, Math.min(1, (dark - 0.15) * 1.6));
        this.glowA = Math.max(0.15, Math.min(1, dark * 1.1));
        this.frame++; this.stats.shown = 0;
    }
    /** b's geometry, built now if it has none or it changed */
    record(b) {
        let r = this.records.get(b);
        const key = this.key(b);
        if (r && r.key === key) return r;
        const start = performance.now();
        if (r) this.destroy(r);
        const model = this.model(b), m = model.build(b);
        r = { key, H: m.H, seen: this.frame, update: model.update || null, base: new GLBuildingMesh(m.base.finish(), m.H), top: new GLBuildingMesh(m.top.finish(), m.H), glow: new GLBuildingMesh(m.glow.finish(), m.H) };
        r.rim = new Float32Array([...GLColor.parse(b.colors.accent || '#ffcf8a').slice(0, 3), 0]);
        for (const mesh of [r.base, r.top, r.glow]) { mesh.rim = r.rim; mesh.visible = false; }
        this.records.set(b, r);
        this.stats.builds++; this.stats.buildMs += performance.now() - start;
        return r;
    }
    /** Build the buildings just outside the view ahead of time, a few milliseconds a frame */
    prefetch(map, bounds, budgetMs = 3) {
        const start = performance.now(), pad = 700, F = this.renderer.frames, last = F && F[F.length - 1];
        if (last && last.renderMs > 28) return;                        // a slow frame already: building ahead can wait
        for (const b of map.buildings || []) {
            if (performance.now() - start > budgetMs) break;
            if (!this.supports(b) || this.records.has(b)) continue;
            if (b.x > bounds.right + pad || b.x + (b.w || 0) < bounds.left - pad || b.y > bounds.bottom + pad || b.y + (b.h || 0) < bounds.top - pad) continue;
            this.record(b).seen = this.frame - 1;
            this.stats.prefetched = (this.stats.prefetched || 0) + 1;
            break;                                                     // one a frame: a first sign's text can take a while
        }
    }
    /** Show b this frame */
    show(b, game) {
        const R = this.renderer, r = this.record(b);
        r.seen = this.frame;
        const z = b.y + (b.h || 0);
        r.base.zIndex = r.top.zIndex = z;
        if (r.base.parent !== R.buildingBaseStage) R.buildingBaseStage.addChild(r.base);
        if (r.top.parent !== R.roofStage) R.roofStage.addChild(r.top);
        if (r.glow.parent !== R.emissive) R.emissive.addChild(r.glow);
        r.base.visible = r.top.visible = true;
        r.glow.visible = !!R.layers.glows;
        r.glow.alpha = this.glowA;
        if (r.update) r.update(b, r);
        r.rim[3] = this.rimA;
        this.stats.shown++;
    }
    /** The buildings shown this frame: [[building, record], ...] (record: base, top, glow meshes, key, fade) */
    visible() { return [...this.records].filter(([, r]) => r.seen === this.frame); }
    /** Hide what wasn't shown; drop geometry long out of view */
    end() {
        let vertices = 0;
        // keep the most recently seen 64 buildings resident (about the view and its surroundings)
        const lru = this.records.size > 64 ? [...this.records].sort((x, y) => x[1].seen - y[1].seen) : null;
        if (lru) for (let i = 0; i < lru.length - 64; i++) { if (lru[i][1].seen === this.frame) break; this.destroy(lru[i][1]); this.records.delete(lru[i][0]); }
        for (const r of this.records.values()) {
            if (r.seen !== this.frame) r.base.visible = r.top.visible = r.glow.visible = false;
            vertices += r.base.vertexCount + r.top.vertexCount + r.glow.vertexCount;
        }
        this.stats.vertices = vertices; this.stats.resident = this.records.size;
        GLText.flush();
    }
    destroy(r) { for (const m of [r.base, r.top, r.glow]) { const g = m.geometry; m.parent?.removeChild(m); m.destroy(); g.destroy(); } }
    clear() { for (const r of this.records.values()) this.destroy(r); this.records.clear(); }
}
/** Landmarks with their own GL model (style → { build(b), update?(b, record) }) */
GLBuildingsSystem.landmarks = { double_nights: GLDoubleNights, enni_cole: GLEnniCole, cozy_cafe: GLCozyCafe, moon_city: GLMoonCity, silver_queen: GLSilverQueen };
