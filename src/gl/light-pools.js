// GL engine: light pools. The night's lights that aren't lamps, as Canvas lights them
// (engine/lighting.js steps 5-6): each neon sign's coloured pool, car headlight beams with their
// haze and the glow at each headlamp, and underglow under the cars that have it. Every pool is a
// quad whose falloff the fragment shader computes: no baked gradient images. Holes lift the dark
// (white, screen-blended into the light target, as Canvas's destination-out); colours add the
// light's colour into the colour wash (additive, as Canvas's 'lighter').
const GLLightPools = (() => {
    // kind 0: a radial glow (1 at the centre, through `core` at 0.45, to 0 at the rim; core 0 is a plain linear falloff)
    // kind 1: a headlight beam, along u from the lamp, a trapezoid 15 px wide at the lamp widening to the full width,
    //         fading along its length and to 0.3 at its sides (lighting.js _beamSprite)
    const FRAG = `precision highp float; varying vec2 uv; uniform vec3 rgb; uniform float alpha; uniform float kind; uniform float core; uniform float W;
        void main(){
            float a;
            if (kind < .5) {
                float d = length(uv - .5) * 2.;
                if (core > 0.) a = d < core ? mix(1., .45, d / core) : mix(.45, 0., (d - core) / (1. - core));
                else a = 1. - d;
            } else {
                float v = abs(uv.y * 2. - 1.), edge = (15. + (W - 15.) * uv.x) / W;
                a = (v <= edge ? 1. : 0.) * (1. - uv.x) * mix(1., .3, v);
            }
            a = clamp(a, 0., 1.) * alpha;
            gl_FragColor = vec4(rgb * a, a);
        }`;
    const rgbOf = (c, fallback) => { try { return new PIXI.Color(c).toArray().slice(0, 3); } catch (e) { return fallback; } };

    class Pools {
        constructor(stage) {
            this.holes = new PIXI.Container(); this.colors = new PIXI.Container(); stage.addChild(this.holes, this.colors);
            this.geometry = nativeSurfaceGeometry(); this.pool = { holes: [], colors: [] }; this.used = { holes: 0, colors: 0 };
            this.stats = { neon: 0, beams: 0, underglow: 0 }; this.signs = new Map();
        }
        quad(layer, rgb, alpha, kind, core = 0, W = 1) {
            const list = this.pool[layer], i = this.used[layer]++;
            let m = list[i];
            if (!m) {
                m = list[i] = new PIXI.Mesh(this.geometry, PIXI.Shader.from(NATIVE_SURFACE_VERTEX, FRAG, { rgb: new Float32Array(3), alpha: 0, kind: 0, core: 0, W: 1 }));
                m.blendMode = layer === 'holes' ? PIXI.BLEND_MODES.SCREEN : PIXI.BLEND_MODES.ADD; this[layer].addChild(m);
            }
            const u = m.shader.uniforms; u.rgb.set(rgb); u.alpha = Math.min(1, alpha); u.kind = kind; u.core = core; u.W = W;
            m.visible = true; m.rotation = 0; m.pivot.set(0, 0);
            return m;
        }
        /** A radial glow of radius r at x, y; sx, sy stretch it (an ellipse), angle turns it */
        disc(layer, x, y, r, rgb, alpha, core = 0, sx = 1, sy = 1, angle = 0) {
            const m = this.quad(layer, rgb, alpha, 0, core);
            m.position.set(x, y); m.rotation = angle; m.pivot.set(.5, .5); m.scale.set(2 * r * sx, 2 * r * sy);
        }
        beam(layer, b, rgb, alpha) {
            const m = this.quad(layer, rgb, alpha, 1, 0, b.W);
            m.position.set(b.cx, b.cy); m.rotation = b.owner.angle || 0; m.pivot.set(0, .5); m.scale.set(b.L, 2 * b.W);
        }
        /** A radial pool at source s (radius r) cut to what it can see past the walls: a fan, built once */
        lit(s, r, walls) {
            const key = [s.x, s.y, r, walls.length].join(':');
            let rec = this.signs.get(s);
            if (!rec || rec.key !== key) {
                if (rec) { rec.mesh.geometry.destroy(); rec.mesh.destroy(); }
                const poly = computeVisibilityPoly(s.x, s.y, r, walls, { aMin: 0, aMax: Math.PI * 2, arcStep: .18 }), pos = [s.x, s.y], uv = [.5, .5], index = [];
                for (const p of poly) { pos.push(p.x, p.y); uv.push((p.x - s.x) / (2 * r) + .5, (p.y - s.y) / (2 * r) + .5); }
                for (let i = 1; i <= poly.length; i++) index.push(0, i, i % poly.length + 1);
                const g = new PIXI.Geometry().addAttribute('aVertexPosition', new Float32Array(pos), 2).addAttribute('aUV', new Float32Array(uv), 2).addIndex(new Uint16Array(index));
                const mesh = new PIXI.Mesh(g, PIXI.Shader.from(NATIVE_SURFACE_VERTEX, FRAG, { rgb: new Float32Array(3), alpha: 0, kind: 0, core: 0, W: 1 }));
                mesh.blendMode = PIXI.BLEND_MODES.ADD; this.colors.addChild(mesh);
                rec = { key, mesh }; this.signs.set(s, rec);
            }
            rec.seen = this.frame;
            return rec.mesh;
        }
        sync(game, view, transform) {
            this.frame = (this.frame || 0) + 1;
            for (const layer of ['holes', 'colors']) { this.used[layer] = 0; this[layer].position.copyFrom(transform.position); this[layer].scale.copyFrom(transform.scale); }
            const hw = game.canvas.width / (2 * view.zoom), hh = game.canvas.height / (2 * view.zoom);
            const inView = (x, y, r) => Math.abs(x - view.x) < hw + r && Math.abs(y - view.y) < hh + r;
            const base = game.activeMap.type === 'indoor' ? .08 : .22, S = this.stats; S.neon = S.beams = S.underglow = 0;
            // Neon signs: a coloured pool, radius 150 (the odd one buzzes)
            // (cut by the walls and buildings round it, as Canvas shadows it: the pool falls on the street, not over the roof)
            const walls = getOccluders(game.activeMap), live = new Set();
            for (const s of game.neonSigns || []) {
                if (!inView(s.x, s.y, 150)) continue;
                const m = this.lit(s, 150, walls); live.add(s);
                const u = m.shader.uniforms; u.rgb.set(rgbOf(s.color, [1, .4, .8])); u.alpha = Math.min(1, base * 1.5 * lampFlicker(s)); m.visible = true; S.neon++;
            }
            for (const [s, rec] of this.signs) { if (live.has(s)) continue; rec.mesh.visible = false; if (rec.seen < this.frame - 600) { rec.mesh.geometry.destroy(); rec.mesh.destroy(); this.signs.delete(s); } }
            // Headlights: the car she drives, parked cars with their lamps on, up to six in traffic, bumper cars
            const beams = [], beamOf = (owner, stat, color, haze) => {
                const off = owner.length / 2;
                beams.push({ owner, cx: owner.x + Math.cos(owner.angle) * off, cy: owner.y + Math.sin(owner.angle) * off, L: stat * 6, W: stat * 1.5, color, haze });
            };
            if (game.isDriving || (game.car && game.car.forceLights)) beamOf(game.car, game.car.lightRange || 60, game.car.headlightColor || '#ffffdd', game.isDriving ? 1 : 0);
            for (const v of game.parkedCars ? game.parkedCars([]) : []) {
                if ((v === game.car && v.forceLights) || !carLampsOn(v) || !inView(v.x, v.y, 260)) continue;
                beamOf(v, 40, v.headlightColor || '#ffffee', .7);
            }
            let n = 0;
            for (const v of game.traffic?.vehicles || []) {
                if (n >= 6) break;
                if (!v.visible || v.dead || v === game.car || !inView(v.x, v.y, 260)) continue;
                n++; beamOf(v, 40, v.headlightColor || '#ffffee', .7);
            }
            if (game.bumperMinigame?.active) for (const car of game.bumperMinigame.cars) if (car !== game.bumperMinigame.playerCar) beamOf(car, car.lightRange || 60, car.headlightColor || car.bodyColor || '#ffffdd', 1);
            for (const b of beams) {
                const rgb = rgbOf(/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#ffffdc', [1, 1, .86]);
                this.beam('holes', b, [1, 1, 1], 1); S.beams++;
                if (!b.haze) continue;
                this.beam('colors', b, rgb, base * b.haze);
                const nx = -Math.sin(b.owner.angle), ny = Math.cos(b.owner.angle), side = (b.owner.width || 22) * .35;
                for (const sgn of [-1, 1]) this.disc('colors', b.cx + nx * side * sgn, b.cy + ny * side * sgn, 22, rgb, base * 2.2 * b.haze, .2);
            }
            // Underglow: each pool lights its own patch of street
            const cars = new Set(game.traffic?.vehicles || []);
            for (const v of [game.car, game.ownedCar, game.deliveryVehicle]) if (v) cars.add(v);
            for (const v of cars) {
                if (!v.glowColor || !v.visible || v.dead || !v.length || !inView(v.x, v.y, 80)) continue;
                this.disc('holes', v.x, v.y, .5, [1, 1, 1], .55, .5, v.length + 32, v.width + 32, v.angle || 0); S.underglow++;
            }
            for (const layer of ['holes', 'colors']) { const list = this.pool[layer]; for (let i = this.used[layer]; i < list.length; i++) list[i].visible = false; }
        }
        show(colorPass) { this.holes.visible = !colorPass; this.colors.visible = colorPass; }
        destroy() { for (const rec of this.signs.values()) rec.mesh.geometry.destroy(); this.signs.clear(); this.holes.destroy({ children: true }); this.colors.destroy({ children: true }); this.geometry.destroy(); }
    }
    return Pools;
})();
