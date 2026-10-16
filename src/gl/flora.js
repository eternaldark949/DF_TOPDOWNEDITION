// GL engine: the city's trees, bushes and palms. Each kind of plant (kind, size bucket, one of
// four variants) is built once as GPU geometry, the same canopy Canvas paints into a sprite
// (entities/street-objects.js floraSprite): the dark underside, the overlapping clusters, the
// light from the upper left and the shade to the lower right, the leaf grain and the blossom.
// Every plant in view is then one draw of its kind's geometry, placed and carried by the wind
// (the sway is the Canvas formula); at night a soft pool of shade lies under each.
const GLFlora = (() => {
    const P = (x, y) => [x, y, 0, 0];
    const stopColor = (stops, t) => {
        t = Math.max(0, Math.min(1, t));
        for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
            const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 0, a = GLColor.parse(c0), b = GLColor.parse(c1);
            // Canvas interpolates gradients in premultiplied colour
            const pa = a[3], pb = b[3], al = pa + (pb - pa) * f;
            return al > 0 ? [0, 1, 2].map(k => (a[k] * pa + (b[k] * pb - a[k] * pa) * f) / al).concat(al) : [0, 0, 0, 0];
        }
        return GLColor.parse(stops[stops.length - 1][1]);
    };
    /** A disc of radius r filled with Canvas's two-circle radial gradient (focus x0, y0, r0 → x1, y1, r1), as a coloured fan */
    function radial(B, cx, cy, r, x0, y0, r0, x1, y1, r1, stops, rings = 4, segs = 20, alpha = 1) {
        const tAt = (x, y) => {
            const cdx = x1 - x0, cdy = y1 - y0, dr = r1 - r0, px = x - x0, py = y - y0;
            const a = cdx * cdx + cdy * cdy - dr * dr, b = px * cdx + py * cdy + r0 * dr, c = px * px + py * py - r0 * r0;
            if (Math.abs(a) < 1e-6) return c / (2 * b);
            const d = b * b - a * c; if (d < 0) return 1;
            const q = Math.sqrt(d), hi = Math.max((b + q) / a, (b - q) / a), lo = Math.min((b + q) / a, (b - q) / a);
            return r0 + hi * dr >= 0 ? hi : lo;
        };
        const col = (x, y) => { const c = stopColor(stops, tAt(x, y)); return [c[0], c[1], c[2], c[3] * alpha]; }, base = B.n;
        B.vertex(P(cx, cy), undefined, undefined, 0, 0, 0, col(cx, cy));
        for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
            const rr = r * i / rings, a = j / segs * Math.PI * 2, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            B.vertex(P(x, y), undefined, undefined, 0, 0, 0, col(x, y));
        }
        for (let j = 0; j < segs; j++) B.index.push(base, base + 1 + j, base + 1 + (j + 1) % segs);
        for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
            const a = base + 1 + (i - 1) * segs + j, b = base + 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
            B.index.push(a, c, d, a, d, b);
        }
    }
    const geometry = B => {
        const built = B.finish(), buf = new PIXI.Buffer(built.data, true, false), S = GLB_STRIDE * 4, g = new PIXI.Geometry();
        let o = 0; const attr = (name, size) => { g.addAttribute(name, buf, size, false, PIXI.TYPES.FLOAT, S, o * 4); o += size; };
        attr('aPos', 3); attr('aPrev', 3); attr('aNext', 3); attr('aLine', 4); attr('aColor', 4); attr('aMeta', 4); attr('aAnim', 4); attr('aText', 4); attr('aFace', 4);
        g.addIndex(built.index); g.vertices = built.vertices;
        return g;
    };

    /** A plant kind's canopy, centred on (0, 0): the floraSprite painting as geometry */
    function canopy(type, sz, variant) {
        const K = FLORA_KINDS[type] || FLORA_KINDS.tree, rnd = seededRandom(variant * 977 + Math.round(sz * 100) + type.length * 31);
        const palm = type === 'palm', bush = type === 'bush', R = (palm ? 24 : bush ? 13 : 21) * sz, B = new GLBuildingBuilder(0);
        if (palm) {
            const n = 8 + (variant % 2);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2 + rnd() * .3, len = R * (.85 + rnd() * .3), c = Math.cos(a), s = Math.sin(a);
                B.inFrame([c, s, -s, c, 0, 0], () => {
                    const top = GLBuildingBuilder.quadPts(P(0, 0), P(len * .45, -len * .22), P(len, 0), 10), bottom = GLBuildingBuilder.quadPts(P(len, 0), P(len * .45, len * .22), P(0, 0), 10);
                    B.color(i % 2 ? K.mid : K.base).poly(top.concat(bottom.slice(1, -1)), true);
                    B.color(K.hi, .5).seg(P(2, 0), P(len * .95, 0), .8);
                    B.color(K.dark);
                    for (let t = .2; t < .9; t += .12) { B.seg(P(len * t, 0), P(len * (t + .06), len * .12 * (1 - t)), .6); B.seg(P(len * t, 0), P(len * (t + .06), -len * .12 * (1 - t)), .6); }
                });
            }
            B.color('#4a3420').disc(0, 0, R * .16);
            return geometry(B);
        }
        // Canopy: overlapping clusters, dark underneath; light from the upper left, shade to the lower right
        const lumps = bush ? 5 : 8;
        B.color(K.dark).disc(1, 1, R * 1.02);
        for (let i = 0; i < lumps; i++) {
            const a = i / lumps * Math.PI * 2 + rnd() * .5, d = R * (.45 + rnd() * .15), r = R * (.48 + rnd() * .12);
            B.color(K.base).disc(Math.cos(a) * d, Math.sin(a) * d, r);
        }
        B.color(K.base).disc(0, 0, R * .62);
        for (let i = 0; i < lumps; i++) {
            const a = i / lumps * Math.PI * 2 + .4, d = R * .38, r = R * .36, x = Math.cos(a) * d, y = Math.sin(a) * d;
            radial(B, x, y, r, x - r * .35, y - r * .35, 1, x, y, r, [[0, K.mid], [1, 'rgba(0,0,0,0)']], 3, 16);
        }
        radial(B, 0, 0, R, -R * .4, -R * .45, 1, -R * .2, -R * .2, R * .9, [[0, K.hi], [1, 'rgba(0,0,0,0)']], 8, 36, .55);
        radial(B, 0, 0, R, R * .5, R * .55, 1, R * .4, R * .45, R * .9, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']], 8, 36);
        for (let i = 0; i < R * 4; i++) {                                                     // leaf grain
            const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * .95;
            B.color(rnd() < .5 ? K.hi : K.dark, .35).rect(Math.cos(a) * d, Math.sin(a) * d, 1.4, 1.4);
        }
        if (K.petals) for (let i = 0; i < R * 2; i++) {                                         // blossom, heavier toward the light
            const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * .92, x = Math.cos(a) * d, y = Math.sin(a) * d;
            if (x + y > R * .5 && rnd() < .6) continue;
            const alpha = .55 + rnd() * .4, col = K.petals[Math.floor(rnd() * K.petals.length)];
            B.color(col, alpha).disc(x, y, .7 + rnd() * .9, 0, 0, 8);
        }
        return geometry(B);
    }
    /** The night's soft pool of shade under a plant, relative to its canopy centre */
    function pool(type, s) {
        const r = (type === 'bush' ? 13 : type === 'palm' ? 16 : 19) * s, B = new GLBuildingBuilder(0);
        B.color('rgba(0,0,0,0.22)').ellipse(3 * s, 4 * s, r, r * .82, 0);
        return geometry(B);
    }

    // Draws every plant in view in one pass: the building shader is bound once; each plant is its
    // kind's geometry under its own transform.
    class Layer extends PIXI.Container {
        constructor() {
            super(); this.kinds = new Map(); this.pools = new Map(); this.list = []; this.state = PIXI.State.for2d(); this.state.blend = true;
            this.stats = { plants: 0, kinds: 0 };
        }
        kind(type, size, variant) {
            const sz = Math.round(size * 5) / 5, key = type + '|' + sz + '|' + variant;
            let g = this.kinds.get(key);
            if (!g) { g = canopy(type, sz, variant); this.kinds.set(key, g); }
            return g;
        }
        poolOf(type, size) {
            const key = type + '|' + size;
            let g = this.pools.get(key);
            if (!g) { g = pool(type, size); this.pools.set(key, g); }
            return g;
        }
        /** This frame's plants: [foliage, ...], the wind, its direction, the clock (s), whether the sun throws their shadows */
        sync(plants, wind, dir, time, sunOn) {
            this.list.length = 0;
            for (const f of plants) {
                if (!FLORA_KINDS[f.type]) continue;
                const sway = Math.sin(time * 2 + f.phaseOffset) * wind * 8 * f.swayMultiplier * dir, s = f.size, palm = f.type === 'palm', bush = f.type === 'bush';
                const cx = f.x + sway * (bush ? .6 : palm ? .3 : 1), cy = foliageCanopyY(f);
                if (f._variant === undefined) f._variant = Math.floor(f.phaseOffset * .637) % 4;
                if (!sunOn) this.list.push({ g: this.poolOf(f.type, s), x: cx, y: cy, r: 0 });
                this.list.push({ g: this.kind(f.type, s, f._variant), x: cx, y: cy, r: palm ? sway * .012 : 0 });
            }
            this.stats.plants = plants.length; this.stats.kinds = this.kinds.size;
        }
        _render(renderer) {
            if (!this.list.length) return;
            renderer.batch.flush();
            const shader = GLBuildingMesh.shader(), u = shader.uniforms, F = GLBuildingMesh.frame, wt = this.worldTransform;
            u.uH = 0;
            if (F) { u.uCam[0] = F.cam[0]; u.uCam[1] = F.cam[1]; u.uC = F.C; u.uLod = F.lod; u.uTime = F.time; u.uPx = F.px; u.uSun = F.sun; u.uSunRGB = F.sunRGB; u.uNight = F.night; u.uFont = F.font || PIXI.Texture.WHITE; }
            u.uRim = GLBuildingMesh.noRim; u.uAlpha = this.worldAlpha; u.uFade = 1;
            renderer.state.set(this.state);
            const m = this.m || (this.m = new Float32Array(9));
            for (const it of this.list) {
                const c = Math.cos(it.r), s = Math.sin(it.r);
                m[0] = wt.a * c + wt.c * s; m[1] = wt.b * c + wt.d * s; m[2] = 0;
                m[3] = -wt.a * s + wt.c * c; m[4] = -wt.b * s + wt.d * c; m[5] = 0;
                m[6] = wt.a * it.x + wt.c * it.y + wt.tx; m[7] = wt.b * it.x + wt.d * it.y + wt.ty; m[8] = 1;
                u.translationMatrix = m;
                renderer.shader.bind(shader); renderer.geometry.bind(it.g, shader); renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES);
            }
        }
        destroy() { for (const g of this.kinds.values()) g.destroy(); for (const g of this.pools.values()) g.destroy(); this.kinds.clear(); this.pools.clear(); super.destroy(); }
    }
    return Layer;
})();
