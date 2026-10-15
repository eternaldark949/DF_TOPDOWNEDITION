// GL engine: sun shadows. The shade the sun throws on the ground, cast by the buildings' own 3D
// geometry: every vertex of a building's mesh (walls, roofs, towers, domes, canopies) is moved
// along the sun by its height, z, and filled into one mask, so a landmark's shadow has the
// landmark's shape. Trees and cars, which have no mesh yet, add their swept outlines (the shapes
// Canvas casts, engine/daylight.js); living fire lifts the shade around it. The mask multiplies
// the ground by the lavender shade colour (rgb 92, 76, 150) at 0.62 × the sun's strength.
const GLSunShadows = (() => {
    const VERT = `precision highp float;
        attribute vec3 aPos; attribute vec4 aColor; attribute vec4 aText;
        uniform mat3 projectionMatrix; uniform mat3 translationMatrix; uniform vec2 uSun;
        varying float vZ; varying float vA;
        void main(){
            vZ = aPos.z; vA = aColor.a * step(aText.x, -.5) * step(-1.5, aText.x);   // no glyphs, no blurred drop-shadow strokes
            gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aPos.xy + uSun * aPos.z, 1.)).xy, 0., 1.);
        }`;
    const SOLID_VERT = `precision highp float; attribute vec3 aPos; uniform mat3 projectionMatrix; uniform mat3 translationMatrix;
        void main(){ gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aPos.xy, 1.)).xy, 0., 1.); }`;
    const FRAG = `precision highp float; varying float vZ; varying float vA;
        void main(){ if (vZ < .5 || vA < .35) discard; gl_FragColor = vec4(1.); }`;
    // A fire's light: a soft disc erased out of the shade
    const FIRE_FRAG = `precision highp float; varying vec2 uv; uniform float strength;
        void main(){ float d = length(uv - .5) * 2.; float a = clamp(1. - d, 0., 1.); a = a * a * strength; gl_FragColor = vec4(a); }`;

    class Casters {                                                          // the outline casters: triangles, built on the CPU
        constructor() { this.pos = []; this.index = []; }
        reset() { this.pos.length = this.index.length = 0; }
        fan(points) {                                                        // a convex outline
            const base = this.pos.length / 3;
            for (const [x, y] of points) this.pos.push(x, y, 0);
            for (let i = 1; i + 1 < points.length; i++) this.index.push(base, base + i, base + i + 1);
        }
        ellipse(cx, cy, rx, ry, rot, n = 18) {
            const c = Math.cos(rot), s = Math.sin(rot), pts = [];
            for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
            this.fan(pts);
        }
        geometry() {
            const g = this.geo || (this.geo = new PIXI.Geometry().addAttribute('aPos', new PIXI.Buffer(new Float32Array(3), false, false), 3)
.addIndex(new PIXI.Buffer(new Uint32Array(3), false, true)));
            g.getBuffer('aPos').update(new Float32Array(this.pos)); g.getIndex().update(new Uint32Array(this.index));
            return g;
        }
    }

    // Draws building geometries straight through the renderer (no Mesh per building: the geometry stays the building's own)
    class GeometryDraw extends PIXI.Container {
        constructor(shader) { super(); this.shader = shader; this.list = []; this.state = PIXI.State.for2d(); this.state.blend = true; }
        _render(renderer) {
            if (!this.list.length) return;
            renderer.batch.flush();
            const u = this.shader.uniforms; u.translationMatrix = this.worldTransform.toArray(true);
            renderer.shader.bind(this.shader); renderer.state.set(this.state);
            for (const g of this.list) { if (!g.buffers) continue; renderer.geometry.bind(g, this.shader); renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES); }
        }
    }

    class SunShadows {
        constructor(renderer) {
            this.r = renderer; this.stage = new PIXI.Container(); this.casters = new Casters(); this.key = null;
            this.shader = PIXI.Shader.from(VERT, FRAG, { uSun: new Float32Array(2) });
            this.solidShader = PIXI.Shader.from(SOLID_VERT, `precision highp float; void main(){ gl_FragColor = vec4(1.); }`);
            this.draw = new GeometryDraw(this.shader); this.outline = null; this.fires = [];
            this.stats = { buildings: 0, meshed: 0, outlines: 0, rebuilds: 0 };
        }
        fireMesh(i) {
            let m = this.fires[i];
            if (!m) { m = this.fires[i] = new PIXI.Mesh(nativeSurfaceGeometry(), PIXI.Shader.from(NATIVE_SURFACE_VERTEX, FIRE_FRAG, { strength: 0 })); m.blendMode = PIXI.BLEND_MODES.ERASE; }
            return m;
        }
        /**
         * Render the mask into target (screen sized) for the view: world (the world container's
         * position and scale), the sun's ground offset per px of height (dx, dy), and the casters.
         */
        render(target, world, dx, dy, buildings, foliage, cars, fires, len) {
            const R = this.r, gl = R.glBuildings, C = this.casters, S = this.stats, list = this.draw.list;
            this.stage.removeChildren(); C.reset(); list.length = 0; this.stage.addChild(this.draw); S.buildings = buildings.length; S.meshed = S.outlines = 0;
            this.stage.position.copyFrom(world.position); this.stage.scale.copyFrom(world.scale);
            this.shader.uniforms.uSun[0] = dx; this.shader.uniforms.uSun[1] = dy;
            for (const b of buildings) {
                const rec = gl?.records.get(b);
                if (rec && rec.key) {                                        // its real geometry
                    list.push(rec.base.geometry, rec.top.geometry);
                    S.meshed++; continue;
                }
                // not built yet (it's just outside the view): its sections swept to the roof height, until it is
                if (b.roundR) b._leanFaces();
                const h = Math.min(b.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT;
                b.sections.forEach((s, i) => { const fp = b._footprint(s, i); C.fan(nativeSunHull(fp.concat(fp.map(([x, y]) => [x + dx * h, y + dy * h])))); });
                S.outlines++;
            }
            for (const f of foliage) {                                       // canopies swept from under the tree out along the sun (as daylight.js)
                const size = f.size || 1, height = (f.type === 'bush' ? 8 : 34) * size, rad = (f.type === 'bush' ? 12 : f.type === 'palm' ? 17 : 19) * size;
                const rot = Math.atan2(dy, dx), N = len > .6 ? 4 : 1;
                for (let i = N === 1 ? 1 : 0; i <= N; i++) {
                    const t = i / N, cx = f.x + dx * height * t, cy = foliageCanopyY(f) + dy * height * t, rr = rad * (.6 + .4 * t), rx = rr * (1 + len * .25 * t);
                    C.ellipse(cx, cy, rx, rr * .8, rot);
                }
            }
            for (const e of cars) {                                          // cars, low and long
                const ca = Math.cos(e.angle || 0), sa = Math.sin(e.angle || 0), height = e.model === 'truck' || /suv/.test(e.model) ? 17 : 13, points = [];
                for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
                    const x = e.x + a * (e.length / 2 - 3) * ca - b * (e.width / 2 - 2) * sa, y = e.y + a * (e.length / 2 - 3) * sa + b * (e.width / 2 - 2) * ca;
                    points.push([x, y], [x + dx * height, y + dy * height]);
                }
                C.fan(nativeSunHull(points));
            }
            if (C.index.length) {
                if (!this.outline) { this.outline = new PIXI.Mesh(C.geometry(), this.solidShader); this.outline.state.culling = false; }
                else C.geometry();
                this.stage.addChild(this.outline);
            }
            fires.forEach((f, i) => { const m = this.fireMesh(i); m.shader.uniforms.strength = f.strength; m.position.set(f.x - f.r, f.y - f.r); m.scale.set(f.r * 2); this.stage.addChild(m); });
            R.renderer.render(this.stage, { renderTexture: target, clear: true }); list.length = 0;
            S.rebuilds++;
        }
        destroy() { this.outline?.geometry.destroy(); this.outline?.destroy(); for (const m of this.fires) m.destroy(); this.stage.destroy(); }
    }
    return SunShadows;
})();
