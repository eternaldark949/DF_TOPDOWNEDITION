// A rainy night street and a marble lobby drawn through the reflection pass, on any backend: the scene the
// reflection pixel tests and pictures use. Runs in the browser (it imports the engine by its served paths).
import * as R from '/src/engine/basement/rendering/index.mjs';
import { physicsSystem } from '/src/engine/basement/physics/index.mjs';
import { createEngineRegistry } from '/src/engine/directory/index.mjs';

const MATERIALS = {
    asphalt: { fill: '#16181d', reflect: { strength: .45, wet: true } },
    pavers: { fill: '#2a2a30', reflect: { strength: .28, wet: true } },
    kerb: { fill: '#3a3a40' },
    marble: { fill: '#c9c2b6', reflect: { strength: .55, plane: true } },
    rug: { fill: '#5a1f2a' },
    neon: { fill: '#ff3fa8', emits: { strength: 1.2, reach: 140, height: 90 } },
    window: { fill: '#ffd98a', emits: { strength: .7, reach: 90, height: 120 } },
};
const materials = name => MATERIALS[name.replace(/^demo:/, '')] ?? null;
const box = (w, h, z, fill, extra = {}) => ({ layer: 0, height: z[0], thickness: z[1] - z[0], sides: extra.sides ?? null, steps: [{ shape: 'rectangle', x: -w / 2, y: -h / 2, width: w, height: h, fill, ...extra.step }] });
const layers = list => list.map((l, i) => { const o = { ...l, layer: i }; if (o.sides === null) delete o.sides; return o; });

/** The street: { floors, extent, view, build(world) → {lights, emitters, blockers} }. `walkers` and `cars` say how many. */
export function street({ walkers = 12, cars = 3, seed = 7 } = {}) {
    const W = 1600, H = 900, rand = R.seededRandom(seed);
    const floors = [
        { shape: 'rectangle', x: 0, y: 0, width: W, height: H, material: 'demo:pavers' },
        { shape: 'rectangle', x: 0, y: 380, width: W, height: 300, material: 'demo:asphalt' },
        { shape: 'rectangle', x: 0, y: 372, width: W, height: 8, material: 'demo:kerb' },
        { shape: 'rectangle', x: 0, y: 680, width: W, height: 8, material: 'demo:kerb' },
        { shape: 'group', x: 0, y: 520, steps: Array.from({ length: 16 }, (_, i) => ({ shape: 'rectangle', x: i * 100 + 20, y: -3, width: 50, height: 6, fill: '#bfb89a', alpha: .6 })) },
    ];
    function build(world) {
        const E = world.elements, lights = [], emitters = [], blockers = [];
        E.createEntity({ kind: 'decoration', position: [0, 0], components: [{ name: 'floor', layers: [{ layer: 0, height: 0, thickness: 0, solid: false, steps: floors }] }], data: { look: { layer: -100 } } });
        // Buildings along the top, their windows glowing; a neon sign on one.
        for (let i = 0; i < 5; i++) {
            const x = 160 + i * 320, w = 260, y = 150;
            const windows = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) if (rand() > .35) windows.push({ shape: 'rectangle', x: -w / 2 + 18 + c * 48, y: -70 + r * 44, width: 26, height: 18, material: 'demo:window' });
            E.createEntity({ kind: 'static', position: [x, y], collision_shape: { shape_type: 'box', dimensions: [w, 180] }, components: [{ name: 'block', layers: layers([box(w, 180, [0, 200], '#23222b', { sides: '#1a1920' }), { layer: 1, height: 200, thickness: 2, steps: windows }]) }] });
            blockers.push([x - w / 2, y - 90, x + w / 2, y + 90]);
            for (const s of windows) emitters.push(...R.drawingEmitters([s], { at: [x, y], materials, elevation: 120 }).map(e => ({ ...e, still: true })));
        }
        const sign = [{ shape: 'line', points: [[-60, 0], [-30, -16], [0, 0], [30, -16], [60, 0]], stroke: '#ff3fa8', line_width: 5, material: 'neon' }];
        E.createEntity({ kind: 'decoration', position: [500, 250], assets: { drawing: 'demo:sign' }, data: { look: { layer: 2 } } });
        emitters.push(...R.drawingEmitters(sign, { at: [500, 250], materials }).map(e => ({ ...e, still: true })));
        // Lamp posts, their heads 160 up.
        for (const x of [200, 600, 1000, 1400]) {
            E.createEntity({ kind: 'static', position: [x, 360], collision_shape: { shape_type: 'circle', radius: 5 }, components: [{ name: 'post', layers: layers([box(6, 6, [0, 160], '#444', { sides: '#333' }), { height: 160, thickness: 6, steps: [{ shape: 'circle', radius: 9, fill: '#ffe9b0' }] }]) }] });
            lights.push({ position: [x, 360], height: 160, radius: 300, color: '#ffc77a', intensity: .95, glow: .35 });
        }
        // People on the pavement and cars on the road.
        for (let i = 0; i < walkers; i++) {
            const x = 60 + rand() * (W - 120), y = rand() < .5 ? 300 + rand() * 60 : 700 + rand() * 120, coat = ['#3b4a6b', '#6b3b3b', '#4a6b3b', '#6b5a3b'][i % 4];
            E.createEntity({ kind: 'decoration', position: [x, y], components: [{ name: 'body', layers: [
                { layer: 0, height: 0, thickness: 45, steps: [{ shape: 'ellipse', radius_x: 9, radius_y: 6, fill: '#222' }] },
                { layer: 1, height: 45, thickness: 30, steps: [{ shape: 'ellipse', radius_x: 11, radius_y: 7, fill: coat }] },
                { layer: 2, height: 75, thickness: 12, steps: [{ shape: 'circle', radius: 6, fill: '#c9a27e' }] }] }] });
        }
        for (let i = 0; i < cars; i++) {
            const x = 200 + i * 480 + rand() * 100, y = i % 2 ? 450 : 610, dir = i % 2 ? 1 : -1, paint = ['#a02828', '#2858a0', '#c0c0c8'][i % 3];
            E.createEntity({ kind: 'decoration', position: [x, y], components: [{ name: 'car', layers: layers([box(110, 48, [0, 32], paint, { sides: R.shade(paint, -.4) }), box(60, 40, [32, 52], R.shade(paint, -.2), { sides: '#111' })]) }] });
            lights.push({ shape: 'beam', position: [x + dir * 56, y], rotation: dir > 0 ? 0 : Math.PI, length: 260, width: 90, near_width: 14, height: 22, color: '#fff4d8', intensity: .8, glow: .25 });
            lights.push({ position: [x - dir * 56, y], height: 20, radius: 60, color: '#ff2a2a', intensity: .5, glow: .5 });
        }
        return { lights, emitters, blockers };
    }
    return { floors, extent: { left: 0, top: 0, right: W, bottom: H }, build, size: [W, H], drawings: { 'demo:sign': { kind: 'drawing', steps: sign() } } };
    function sign() { return [{ shape: 'line', points: [[-60, 0], [-30, -16], [0, 0], [30, -16], [60, 0]], stroke: '#ff3fa8', line_width: 5 }]; }
}

/** The lobby: a marble floor (a reflection plane) with a rug, pillars, a bar and a few people standing on it. */
export function lobby() {
    const W = 1000, H = 700;
    const floors = [
        { shape: 'rectangle', x: 0, y: 0, width: W, height: H, material: 'demo:marble' },
        { shape: 'rectangle', x: 380, y: 420, width: 240, height: 160, material: 'demo:rug' },
    ];
    function build(world) {
        const E = world.elements, lights = [];
        E.createEntity({ kind: 'decoration', position: [0, 0], components: [{ name: 'floor', layers: [{ layer: 0, height: 0, thickness: 0, solid: false, steps: floors }] }], data: { look: { layer: -100 } } });
        for (const [x, y] of [[200, 200], [800, 200], [200, 520], [800, 520]]) E.createEntity({ kind: 'static', position: [x, y], components: [{ name: 'pillar', layers: [{ layer: 0, height: 0, thickness: 220, sides: '#7d6a4a', steps: [{ shape: 'circle', radius: 24, fill: '#b8a27a' }] }] }] });
        E.createEntity({ kind: 'static', position: [500, 160], components: [{ name: 'bar', layers: [box(300, 50, [0, 55], '#3a2416', { sides: '#2a180e' }), box(300, 50, [55, 58], '#d8c8a0')].map((l, i) => { const o = { ...l, layer: i }; if (o.sides === null) delete o.sides; return o; }) }] });
        for (const [x, y, c] of [[420, 330, '#2a3a6a'], [600, 300, '#6a2a3a'], [330, 600, '#2a5a3a']]) E.createEntity({ kind: 'decoration', position: [x, y], components: [{ name: 'body', layers: [
            { layer: 0, height: 0, thickness: 45, steps: [{ shape: 'ellipse', radius_x: 9, radius_y: 6, fill: '#222' }] },
            { layer: 1, height: 45, thickness: 30, steps: [{ shape: 'ellipse', radius_x: 11, radius_y: 7, fill: c }] },
            { layer: 2, height: 75, thickness: 12, steps: [{ shape: 'circle', radius: 6, fill: '#c9a27e' }] }] }] });
        for (const [x, y] of [[350, 330], [650, 330]]) lights.push({ position: [x, y], height: 240, radius: 380, color: '#ffe2b0', intensity: .9, glow: .25 });
        return { lights, emitters: [], blockers: [] };
    }
    return { floors, extent: { left: 0, top: 0, right: W, bottom: H }, build, size: [W, H], drawings: {} };
}

/**
 * Draws `scene` (street() or lobby()) on `renderer` ('canvas' or 'webgl') at `quality`, `frames` times, and
 * returns {pixels, width, height, times}: times are per-frame milliseconds for the whole frame and for the
 * reflection pass's own submission. `reflections: false` draws it without them.
 */
export async function drawScene(scene, { renderer = 'canvas', quality = 'high', reflections = true, wetness = 1, frames = 3, width = 800, height = 450, center, zoom = 1, pixel_ratio = 1, dark = true, grid = true, lean = true, show = null } = {}) {
    const surfaces = [], resources = Object.fromEntries([...Object.entries(MATERIALS).map(([k, v]) => [k, { kind: 'material', ...v }]), ...Object.entries(scene.drawings).map(([k, v]) => [k.replace(/^demo:/, ''), v])]);
    const world = new physicsSystem({ asset_library: createEngineRegistry({ libraries: [{ library_id: 'demo', resources }] }) });
    const built = scene.build(world);
    const camera = new R.cameraSystem({ position: center ?? [scene.size[0] / 2, scene.size[1] / 2], zoom, viewport: { width, height, pixel_ratio } });
    const render = new R.renderSystem({ physics_system: world, camera, create_surface: () => { const c = Object.assign(document.createElement('canvas'), { width: width * pixel_ratio, height: height * pixel_ratio }); surfaces.push(c); return c; } });
    render.registerRenderer('canvas', R.canvasRenderer).registerRenderer('webgl', R.webglRenderer);
    await render.setRenderer(renderer);
    if (lean) render.setHeightView({ eye: 1400 });
    const pass = new R.reflectionPass(render, { quality, budget_ms: null });
    await pass.prepare();
    world.updateState(1 / 60);
    const lightGrid = grid && built.emitters.length ? R.bakeLightGrid({ bounds: scene.extent, cell: 32, emitters: built.emitters, blockers: built.blockers }) : null;
    const times = [], passTimes = [];
    let gl = null;
    for (let f = 0; f < frames; f++) {
        const t0 = performance.now();
        const frame = render.beginFrame();
        frame.clear('#000');
        render.drawLooks();
        if (reflections) pass.draw(frame, { extent: scene.extent, floors: scene.floors, materials, wetness, lights: built.lights, emitters: built.emitters, grid: lightGrid, time: f / 60 });
        if (dark) {
            const v = render.getVisibleBounds(1, 40);
            frame.beginPass({ layer: { scale: .5, blend: 'normal', opacity: 1 }, clear_color: 'transparent' });
            const cuts = reflections ? [{ ...pass.darknessCut(), layer: 0 }] : [];
            for (const p of R.createLightLayer({ bounds: v, tint: 'rgba(4,6,16,0.9)', lights: built.lights, cuts })) frame.submit(p);
            if (lightGrid) for (const p of R.lightGridPackets(lightGrid, 'cut')) frame.submit(p);
            if (lightGrid) for (const p of R.lightGridPackets(lightGrid, 'glow')) frame.submit(p);
            frame.endPass();
        }
        if (show) frame.submit({ type: 'sprite', space: 'screen', resource_id: pass.target(show), position: [width / 2, height / 2], size: [width, height], layer: 1e6 });
        render.endFrame();
        if (renderer === 'webgl') { gl ??= surfaces.at(-1).getContext('webgl2'); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
        else surfaces.at(-1).getContext('2d').getImageData(0, 0, 1, 1);   // Canvas draws lazily: wait for the pixels
        times.push(performance.now() - t0); passTimes.push(reflections ? pass.statistics.ms : 0);
        await render.texturesReady();
    }
    const c = surfaces.at(-1), out = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), ctx = out.getContext('2d'); ctx.drawImage(c, 0, 0);
    const result = { width: c.width, height: c.height, png: out.toDataURL('image/png'), pixels: [...ctx.getImageData(0, 0, c.width, c.height).data], times, pass_times: passTimes, stats: pass.statistics };
    render.dispose();
    return result;
}
