#!/usr/bin/env node
// Map and lighting bench (phase 0 of the map-loading plan): the same scenes, measured in Chromium through
// the game's own PerformanceBench, give today's numbers so every later phase is judged against them.
//
//   node tools/bench-maps.mjs                 run every scene and print the report
//   node tools/bench-maps.mjs --record        run them and write the baseline (tools/bench-maps-baseline.json)
//   node tools/bench-maps.mjs --check         run them and fail if a scene is over its baseline by more than the margin
//   --scene <id> (repeatable), --duration <ms>, --warmup <ms>
//
// Machines differ, so every time is also kept relative to a fixed calibration workload run in the same page
// (`relative`: scene milliseconds per calibration millisecond). The check compares those, never raw times.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, 'tools', 'bench-maps-baseline.json');
/** How far over its baseline (relative to the calibration) a scene may run before the check fails. */
const MARGIN = 1.6;
/** The measures the check holds: the whole frame's CPU, and the light layer's share. */
const HELD = [['cpu', 'frame CPU'], ['lighting', 'light layer']];

/**
 * The scenes, each set up in a freshly loaded game at 22:00 with the story held. `setup` names the branch of
 * `setupScene` that places the player (or swings a door, or sets her car driving); `hold` (optional) narrows
 * which of HELD the check holds for that scene.
 */
const SCENES = [
    { id: 'cafe-night', title: 'The cafe at night, standing by the counter', map: 'cozy_cafe_interior', setup: 'centre' },
    { id: 'apartment-night', title: 'The apartment at night (the native level)', map: 'apt_949', setup: 'centre' },
    { id: 'apartment-door', title: 'A door swinging open and shut beside the apartment lamps', map: 'apt_949', setup: 'door' },
    { id: 'city-night', title: 'A city street at night, standing', map: 'sdc', setup: 'spawn' },
    // (the drive's light layer is kept but not held: it costs 10 or 25 ms a frame by whether the cached light rebuilds in the window)
    { id: 'city-drive', title: 'Driving across the city at night (autodrive to the clinic)', map: 'sdc', setup: 'drive', hold: ['cpu'] },
    // The native light layer on its own (phase 3's gate): built from the map's definition, drawn each frame as the
    // apartment host draws it (half resolution, tiles and still pictures), with no game around it.
    { id: 'light-cafe', title: 'The native light layer over the cafe at night', light: 'cafe', hold: ['lighting'] },
    { id: 'light-street', title: 'The native light layer over a dense test street: 72 lamps, 8 doors sliding, 12 vending machines, the camera panning', light: 'street', hold: ['lighting'] },
    // Phase 4's gate: the city from its exported map file, streamed round the camera, lit as one outdoor room at night.
    { id: 'light-city', title: 'The native light layer over the city at night, standing on Crimson Blvd', light: 'city', hold: ['lighting'] },
    { id: 'light-city-drive', title: 'The native light layer over the city at night, driving Crimson Blvd at 500 px/s', light: 'city-drive', hold: ['lighting'] },
    // The city's ground tiles under its light layer, both as a native host draws them: `cpu` is the two together.
    { id: 'city-native', title: 'The native city at night, ground and light, standing on Crimson Blvd', light: 'city', ground: true, hold: ['cpu'] },
    { id: 'city-native-drive', title: 'The native city at night, ground and light, driving Crimson Blvd at 500 px/s', light: 'city-drive', ground: true, hold: ['cpu'] }
];

const args = process.argv.slice(2), flag = name => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const only = args.flatMap((a, i) => a === '--scene' ? [args[i + 1]] : []);
const duration = +option('--duration', 8000), warmup = +option('--warmup', 3000);
const chosen = only.length ? SCENES.filter(s => only.includes(s.id)) : SCENES;
if (!chosen.length) { console.error(`No scene named ${only.join(', ')}: ${SCENES.map(s => s.id).join(', ')}`); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0]))); res.writeHead(200, { 'content-type': TYPES[extname(req.url.split('?')[0])] ?? 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');

/** In the page: a fixed workload of canvas fills and arithmetic, the yardstick every scene is measured against. */
function calibrate() {
    const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), ctx = canvas.getContext('2d');
    const once = () => {
        const t0 = performance.now(); let x = 0;
        for (let i = 0; i < 2e6; i++) x += Math.sin(i * 1e-3) * Math.sqrt(i);
        for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(${i % 255},90,140,.3)`; ctx.beginPath(); ctx.arc((i * 37) % 512, (i * 91) % 512, 9, 0, 6.283); ctx.fill(); }
        ctx.getImageData(0, 0, 1, 1);
        return { ms: performance.now() - t0, x };
    };
    once();
    const runs = Array.from({ length: 7 }, () => once().ms).sort((a, b) => a - b);
    return runs[3];
}

/**
 * In the page (a blank one): build a map in a physics world, light it with the game's look and draw the light
 * layer every frame for `duration` ms after `warmup`, as the native apartment host does. Returns the layer's
 * cost a frame (`lighting`, and `cpu` the same), the shadow rebuilds' share, and how many lights stayed live.
 */
async function measureLight({ scene, ground: with_ground = false, duration, warmup }) {
    const { physicsSystem } = await import('/src/engine/basement/physics/index.mjs');
    const { mapInstance } = await import('/src/engine/basement/maps/index.mjs');
    const { canvasRenderer, pictureCache, aheadOf } = await import('/src/engine/basement/rendering/index.mjs');
    const { sceneLighting, levelLights } = await import('/src/game/presentation/lighting.mjs');
    const { PROP_TYPES } = await import('/src/game/data/game-maps.mjs');
    const physics = new physicsSystem(), W = 1280, H = 720, scale = .5;
    let definition, options = { prop_types: PROP_TYPES }, camera, doors = [], kind = 'indoor', rooms = [], sky_darkness = 0, ground = null, ground_ahead = 0;
    if (scene.startsWith('city')) {
        const { cityMapDefinition, cityRooms } = await import('/src/game/levels/city-definition.mjs');
        const places = (await import('/src/game/data/game-db/places.json', { with: { type: 'json' } })).default;
        ({ definition } = cityMapDefinition({ map: places.maps.sdc }));
        kind = 'outdoor'; rooms = cityRooms(places.maps.sdc); sky_darkness = .6;   // (the classic sky at 22:00)
        camera = scene === 'city' ? () => [3300, 2500] : t => [1500 + (t * .5) % 9000, 2500];
        options = { prop_types: PROP_TYPES, focus: camera(0) };
        if (with_ground) { const { cityGround } = await import('/src/game/presentation/city-ground.mjs'); ground_ahead = (await import('/src/game/data/city-ground.json', { with: { type: 'json' } })).default.tile_ahead; ground = new cityGround(cityMapDefinition({ map: places.maps.sdc }).city, { size: definition.size }); }
    } else if (scene === 'cafe') {
        const { interiorMapDefinition, APARTMENT_MAP_OPTIONS } = await import('/src/game/levels/apartment-definition.mjs');
        const places = (await import('/src/game/data/game-db/places.json', { with: { type: 'json' } })).default;
        ({ definition } = interiorMapDefinition({ map_id: 'cozy_cafe_interior', map: places.maps.cozy_cafe_interior, rooms: places.rooms.cozy_cafe_interior }));
        options = { ...APARTMENT_MAP_OPTIONS, templates: {} };
        camera = t => [definition.spawn[0], definition.spawn[1]];
    } else {
        // A street 6000 px long: shopfronts on both sides with a doorway each 500 px, a lamp every 160 px on each kerb,
        // vending machines by every other doorway; eight doors slide open and shut out of step.
        const walls = [], lights = [], placements = [], street = [];
        for (let x = 0; x < 6000; x += 500) for (const y of [300, 900]) { walls.push({ x, y, w: 440, h: 12 }); street.push({ x: x + 440, y, w: 60, h: 12, orientation: 'H', type: 'sliding' }); }
        for (let x = 80; x < 6000; x += 160) for (const y of [380, 820]) lights.push({ position: [x, y], radius: 320, color: '#ffc890' });
        for (let x = 250; x < 6000; x += 1000) for (const y of [330, 870]) placements.push({ type: 'vending_machine', x, y: y - 30, width: 40, height: 60 });
        definition = { map_id: 'bench_street', size: [6000, 1200], walls, lights, placements, doors: street.slice(0, 8) };
        camera = t => [640 + (t * .3) % 4600, 600];
    }
    const map = new mapInstance(physics, definition, options);
    doors = scene === 'street' ? map.entities('door') : [];
    const level = { physics, lamps: map.entities('lamp'), props: map.entities('prop'), definition };
    const lighting = new sceneLighting(physics), pictures = new pictureCache({ max_bytes: 32 * 1048576, budget_ms: 12, densities: [.125, .25, .5, 1, 2] });
    const extent = { left: 0, top: 0, right: definition.size[0], bottom: definition.size[1] };
    // (with the ground, the canvas is full size: the ground at 1:1 and the light layer through drawLayer's half-size surface, as a host draws them)
    const canvas = Object.assign(document.createElement('canvas'), ground ? { width: W, height: H } : { width: W * scale, height: H * scale }), ctx = canvas.getContext('2d');
    const tiles = ground && new pictureCache({ max_bytes: 32 * 1048576, budget_ms: 4, densities: [.25, .5, 1, 2] }), grounds = [];
    const paints = { ground: 0, light: 0 }, held = { ground: 0, light: 0 };   // (tiles painted, and the most baked bytes one frame draws or readies)
    const paint = pictures.draw.bind(pictures); pictures.draw = (...a) => { const how = paint(...a); if (how === 'paint') paints.light++; return how; };
    let shadow_ms = 0; const cast = physics.getVisibilityPolygon.bind(physics);
    physics.getVisibilityPolygon = p => { const t0 = performance.now(), r = cast(p); shadow_ms += performance.now() - t0; return r; };
    const homes = doors.map(d => [...d.position]), frames = [], shadows = [], live = [];
    const start = performance.now();
    await new Promise(done => {
        const frame = () => {
            const now = performance.now(), t = now - start;
            doors.forEach((d, i) => d.updateBody({ position: [homes[i][0] + 30 * (1 + Math.sin(t / 700 + i)), homes[i][1]] }));
            const [cx, cy] = camera(t), [nx, ny] = camera(t + 100), velocity = [(nx - cx) * 10, (ny - cy) * 10];   // (the camera's motion: what is readied ahead leads it by a second)
            map.setFocus([cx, cy]); level.lamps = map.entities('lamp'); level.props = map.entities('prop');   // (the map streams round the camera, outside the light layer's time)
            const view = { left: cx - W / 2, top: cy - H / 2, right: cx + W / 2, bottom: cy + H / 2 };
            let ground_ms = 0; if (t < warmup) { paints.ground = paints.light = 0; held.ground = held.light = 0; }   // (counted over the measured window)
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (ground) {
                const g0 = performance.now(); tiles.beginFrame(); ctx.setTransform(1, 0, 0, 1, -view.left, -view.top);
                let bytes = 0;
                for (const d of ground.createDraws({ view, ahead: aheadOf({ margin: ground_ahead, velocity }) })) { bytes += d.bounds[2] * d.bounds[3] * 4; if (tiles.draw(ctx, { ...d, stamp: !d.prepare }, d.build) === 'paint') paints.ground++; }
                held.ground = Math.max(held.ground, bytes);
                ctx.getImageData(0, 0, 1, 1); ground_ms = performance.now() - g0;
            }
            shadow_ms = 0; const t0 = performance.now();
            pictures.beginFrame();
            const layer = lighting.createLayer({ extent, bounds: view, ahead: aheadOf({ margin: lighting.look.tile_ahead, velocity }), kind, rooms, sky_darkness, lights: levelLights(level), time: t / 1000 });
            held.light = Math.max(held.light, layer.packets.filter(p => p.picture).reduce((n, p) => n + p.picture.bounds[2] * p.picture.bounds[3] * scale * scale * 4, 0));
            if (ground) { ctx.setTransform(1, 0, 0, 1, -view.left, -view.top); canvasRenderer.drawLayer(ctx, layer.packets, { opacity: layer.opacity, pictures, scale }); }
            else { ctx.setTransform(scale, 0, 0, scale, -view.left * scale, -view.top * scale); canvasRenderer.drawLayer(ctx, layer.packets, { opacity: layer.opacity, pictures }); }
            ctx.getImageData(0, 0, 1, 1);
            const ms = performance.now() - t0;
            if (t >= warmup) { frames.push(ms); grounds.push(ground_ms); shadows.push(shadow_ms); live.push(layer.live); }
            if (t < warmup + duration) requestAnimationFrame(frame); else done();
        };
        requestAnimationFrame(frame);
    });
    const stat = list => { const sorted = [...list].sort((a, b) => a - b); return { mean: list.reduce((a, b) => a + b, 0) / list.length, p95: sorted[Math.floor(sorted.length * .95)] }; };
    const lit = stat(frames), both = stat(frames.map((ms, i) => ms + grounds[i]));
    return { frames: frames.length, cpu: ground ? both : lit, lighting: lit, ...(ground && { ground: stat(grounds) }), paints_per_s: { light: +(paints.light / (duration / 1000)).toFixed(1), ground: +(paints.ground / (duration / 1000)).toFixed(1) },
        tiles_mb: { light: +(held.light / 1048576).toFixed(1), ground: +(held.ground / 1048576).toFixed(1) }, shadows: { mean: +stat(shadows).mean.toFixed(3), p95: +stat(shadows).p95.toFixed(3) }, live_lights: +stat(live).mean.toFixed(1), lights: levelLights(level).length, map: definition.map_id };
}

/** In the page: load the scene's map at night and put the player (or her car, or a door) to work. */
function setupScene({ map, setup }) {
    game.story.update = () => {};
    game._doLoadMap(map); game.running = true; game.paused = false; game.worldMinutes = 22 * 60;
    if (typeof uiKit !== 'undefined') { uiKit.hide('ui-layer'); uiKit.show('game-container'); }
    document.getElementById('tap-to-begin')?.remove();
    const place = (x, y) => { if (game.player.teleportTo) game.player.teleportTo([x, y]); else { game.player.x = x; game.player.y = y; } };
    if (setup === 'centre') {
        const at = game.props.map(p => p.position ?? [p.x, p.y]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));   // (a native level's props are bodies)
        const mid = k => at.map(p => p[k]).sort((a, b) => a - b)[at.length >> 1];
        place(mid(0), mid(1));
    } else if (setup === 'door') {
        // The door with the most lamps within 400 px swings fully open and shut every two seconds
        const doors = game.activeLevel.map.getDoors().filter(d => d.leaves[0]), lamps = game.lamps ?? [];
        const near = d => { const [x, y] = d.leaves[0].position; return lamps.filter(l => { const [lx, ly] = l.position ?? [l.x, l.y]; return Math.hypot(lx - x, ly - y) < 400; }).length; };
        const door = doors.sort((a, b) => near(b) - near(a))[0], leaf = door.leaves[0], closed = leaf.rotation;
        const [x, y] = leaf.position; place(x + 40, y + 40);
        let tick = 0; const step = game.stepWorld;
        game.stepWorld = function () { tick++; leaf.updateBody({ rotation: closed + 1.3 * (0.5 - 0.5 * Math.cos(tick * Math.PI / 60)) }); game.benchDoorSwing = Math.max(game.benchDoorSwing ?? 0, Math.abs(leaf.rotation - closed)); return step.apply(this, arguments); };
        return { door_lamps: near(door) };
    } else if (setup === 'drive') {
        // Her car, set down on the nearest long lane that auto-drive can route from to the clinic (her parking bay's
        // own lanes reach only the bay), facing along it; the run measures the drive from there
        const car = game.ownedCar, pin = { ...game.dropOffRegistry.clinic }, say = window.showMessage;
        const lanes = game.traffic.network.allLanes.filter(l => l.length > 300)
            .sort((a, b) => Math.hypot(a.start.x - car.x, a.start.y - car.y) - Math.hypot(b.start.x - car.x, b.start.y - car.y));
        game.player.x = car.x - Math.sin(car.angle) * 45; game.player.y = car.y + Math.cos(car.angle) * 45; game.enterCar(car);
        for (let i = 0; i < 300 && !game.isDriving; i++) game.update();
        window.showMessage = () => {};                    // (the failed tries say so on screen)
        for (const lane of lanes.slice(0, 80)) {
            car.x = car.prevX = lane.start.x + lane.ux * 60; car.y = car.prevY = lane.start.y + lane.uy * 60; car.angle = car.prevAngle = lane.angle; car.speed = 0;
            game.ui.navMarker = { ...pin }; game.navDestination = { ...pin }; game.toggleAutoDrive();
            if (car.controlMode === 'AI') break;
        }
        window.showMessage = say;
        return { driving: game.isDriving, auto_drive: game.car?.controlMode === 'AI' };
    }
    return {};
}

/** In the page: run the game's loop and its whole-game bench; resolves with the bench's report. */
async function measure({ duration, warmup }) {
    const drawn = game._renderDrawId; await new Promise(r => setTimeout(r, 300));
    if (game._renderDrawId === drawn) game.loop();                       // (start the Lobby's frame loop if the page has not)
    await new Promise(r => setTimeout(r, 500));
    const from = game.isDriving ? [game.car.x, game.car.y] : null;
    if (!PerformanceBench.run({ durationMs: duration, warmupMs: warmup })) throw new Error('The bench would not start');
    while (!PerformanceBench.results) await new Promise(r => setTimeout(r, 250));
    const r = PerformanceBench.results, section = label => r.sections.find(s => s.label === label) ?? { mean: 0, p95: 0 };
    const driven = from && Math.round(Math.hypot(game.car.x - from[0], game.car.y - from[1]));
    PerformanceBench.results = null; PerformanceBench.draw?.();
    return { frames: r.sampleCount, fps: +r.fps.toFixed(1), cpu: { mean: r.cpuLoopMs.mean, p95: r.cpuLoopMs.p95 },
        lighting: { mean: section('Render:Lighting').mean, p95: section('Render:Lighting').p95 },
        top: r.sections.slice(0, 6).map(s => ({ label: s.label, mean: +s.mean.toFixed(3) })), map: game.activeMap?.id, ...(game.benchDoorSwing !== undefined && { door_swing: +game.benchDoorSwing.toFixed(2) }), ...(from && { driven_px: driven }), population: { cars: +r.population.cars.mean.toFixed(1), pedestrians: +r.population.pedestrians.mean.toFixed(1) } };
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const out = { createdAt: new Date().toISOString(), duration, warmup, viewport: [1280, 720], scenes: {} };
let failed = false;
try {
    for (const scene of chosen) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        let calibration, set = {}, result;
        if (scene.light) {
            await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
            calibration = await page.evaluate(calibrate);
            result = await page.evaluate(measureLight, { scene: scene.light, ground: !!scene.ground, duration, warmup });
        } else {
            await page.goto(`http://127.0.0.1:${server.address().port}/DFAB%20V8.html`, { waitUntil: 'load' });
            await page.waitForFunction("typeof game!=='undefined' && typeof PerformanceBench!=='undefined'");
            calibration = await page.evaluate(calibrate);
            set = await page.evaluate(setupScene, { map: scene.map, setup: scene.setup });
            result = await page.evaluate(measure, { duration, warmup });
        }
        const relative = Object.fromEntries(HELD.map(([k]) => [k, +(result[k].mean / calibration).toFixed(4)]));
        out.scenes[scene.id] = { title: scene.title, calibration_ms: +calibration.toFixed(2), ...set, ...result, relative, errors: errors.slice(0, 5) };
        if (scene.light) console.log(`${scene.id.padEnd(16)} light layer ${result.lighting.mean.toFixed(2)} ms (p95 ${result.lighting.p95.toFixed(2)}), shadows ${result.shadows.mean} ms, ${result.live_lights} of ${result.lights} lights live, calibration ${calibration.toFixed(1)} ms`); else
        console.log(`${scene.id.padEnd(16)} frame ${result.cpu.mean.toFixed(2)} ms (p95 ${result.cpu.p95.toFixed(2)}), light ${result.lighting.mean.toFixed(2)} ms (p95 ${result.lighting.p95.toFixed(2)}), calibration ${calibration.toFixed(1)} ms${errors.length ? `, ${errors.length} page errors` : ''}`);
        if (errors.length) failed = true;
        await page.close();
    }
} finally { await browser.close(); server.close(); }

if (flag('--record')) {   // (with --scene, only those scenes' entries are replaced)
    const base = only.length ? JSON.parse(await readFile(BASELINE, 'utf8')) : { scenes: {} };
    await writeFile(BASELINE, JSON.stringify({ ...out, scenes: { ...base.scenes, ...out.scenes } }, null, 2) + '\n'); console.log(`Baseline written: ${BASELINE}`);
}
if (flag('--check')) {
    const base = JSON.parse(await readFile(BASELINE, 'utf8'));
    for (const [id, now] of Object.entries(out.scenes)) {
        const then = base.scenes[id]; if (!then) { console.log(`${id}: no baseline yet`); continue; }
        for (const [k, name] of HELD.filter(([k]) => (SCENES.find(s => s.id === id).hold ?? [k]).includes(k))) {
            const limit = Math.max(then.relative[k] * MARGIN, 0.002);   // (a near-zero cost may wobble without meaning anything)
            const ok = now.relative[k] <= limit;
            console.log(`${ok ? 'ok  ' : 'OVER'} ${id} ${name}: ${now.relative[k]} of the calibration (baseline ${then.relative[k]}, limit ${limit.toFixed(4)})`);
            if (!ok) failed = true;
        }
    }
}
if (!flag('--record') && !flag('--check')) console.log(JSON.stringify(out, null, 2));
process.exitCode = failed ? 1 : 0;
