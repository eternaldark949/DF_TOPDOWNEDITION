#!/usr/bin/env node
// Phase 4, step 1 of the map plan: the city as data. Runs the classic city generator once (seeded: the same
// city every time) in the built game in Chromium and writes what it made, in plain map terms, to
// src/game/data/game-assets/generated/sdc-city.json. The native city is built from that file; nothing reads
// the generator's objects.
//
//   node tools/export-city.mjs            write the file
//   node tools/export-city.mjs --check    fail if a fresh export differs from the file (the generator moved)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/game/data/game-assets/generated/sdc-city.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try { const path = decodeURIComponent(req.url.split('?')[0]), body = await readFile(join(root, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');

/** In the page: generate the city and read it back as plain data (two decimals, no classes). */
function exportCity() {
    game.story.update = () => {}; game._doLoadMap('sdc');
    const m = game.activeMap, layout = m.cityLayout, r = v => Math.round(v * 100) / 100;
    const point = p => [r(p.x), r(p.y)], rect = o => ({ x: r(o.x), y: r(o.y), w: r(o.w), h: r(o.h) });
    const plain = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined && o[k] !== null).map(k => [k, typeof o[k] === 'number' ? r(o[k]) : o[k]]));
    return {
        map_id: 'sdc', generator: 'CityLayout, seeded 949 (legacy/engine/map-loading.js)', size: [m.width, m.height],
        roads: {
            horizontal: layout.horizontalRoads.map(o => plain(o, ['name', 'lanes', 'centerY', 'roadHeight', 'footprint', 'topPavement', 'bottomPavement'])),
            vertical: layout.verticalRoads.map(o => plain(o, ['name', 'lanes', 'centerX', 'roadWidth', 'footprint', 'leftPavement', 'rightPavement'])),
            angled: layout.angledRoads.map(o => ({ ...plain(o, ['name', 'lanes', 'thickness', 'curved']), points: o.points.map(point) }))
        },
        // The streets as the traffic network lays them out: each road's outline, and its centre line as stops
        // (where a line along it turns), each with the offset of one pixel across it, so any line along the road
        // is the stops moved across by its offset. Intersections are where roads meet.
        streets: {
            roads: game.traffic.network.roads.map(road => {
                const stops = road.path ? [0, ...road.path.bends(), road.length] : [0, road.length];
                return { id: road.id, name: road.name ?? null, lanes: road.numLanes, symmetrical: !!road.symmetrical, lane_width: road.laneWidth, thickness: r(road.thickness), ...rect(road),
                    outline: road.getCorners().map(point), stops: stops.map(t => {
                        const p = road.paramToWorld(t, 0), q = road.paramToWorld(t, 1), far = road.paramToWorld(t, 100);
                        if (Math.abs(far.x - p.x - 100 * (q.x - p.x)) > .05 || Math.abs(far.y - p.y - 100 * (q.y - p.y)) > .05) throw new Error(`Road ${road.id}: a line along it is not its centre moved across`);
                        return [r(p.x), r(p.y), Math.round((q.x - p.x) * 1e4) / 1e4, Math.round((q.y - p.y) * 1e4) / 1e4];
                    }) };
            }),
            intersections: game.traffic.network.intersections.map(i => ({ x: r(i.x), y: r(i.y), w: r(i.width), h: r(i.height), ...(i.poly ? { poly: i.poly.map(point) } : {}) }))
        },
        blocks: layout.blocks.map(b => ({ name: b.name, row: b.row, col: b.col, type: b.type, ...rect(b) })),
        pavements: m.pavements.map(p => ({ ...rect(p), ...(p.poly ? { poly: p.poly.map(point) } : {}), ...(p.road ? { road: p.road } : {}) })),
        crosswalks: m.crosswalks.map(c => ({ ...rect(c), orientation: c.orientation, ...(c.axis ? { poly: c.poly.map(point), axis: Object.fromEntries(['ux', 'uy', 'nx', 'ny', 'ox', 'oy', 'a0', 'a1', 'hT'].map(k => [k, Math.round(c.axis[k] * 1e4) / 1e4])) } : {}) })),
        floor_zones: m.floorZones.map(z => ({ ...rect(z), color: z.color, ...(z.biggs ? { biggs: true } : {}) })),
        pools: m.pools.map(p => plain(p, ['x', 'y', 'r', 'park'])),
        buildings: layout.placedBuildings.map((p, i) => {
            const b = m.buildings[i] ?? {};
            if (Math.abs((b.x ?? p.x) - p.x) > 60 || Math.abs((b.y ?? p.y) - p.y) > 60) throw new Error(`Building ${i} (${p.templateId}) is not where it was placed`);
            return { template: p.templateId, block: p.blockName ?? null, ...rect(p), ...(Object.keys(p.options ?? {}).length ? { options: p.options } : {}),
                ...plain(b, ['id', 'label', 'type', 'style', 'facing', 'floors', '_seed']), kind: b.constructor?.name ?? null };
        }),
        colliders: m.buildingColliders.map(rect).filter(c => c.w > 0 && c.h > 0),   // (the generator leaves one empty strip)
        walls: m.walls.map(w => ({ ...rect(w), ...(w.style ? { style: w.style } : {}) })),
        lamps: m.lamps.map(l => ({ x: r(l.x), y: r(l.y), lampType: l.lampType, color: l.color, lightRadius: l.lightRadius, ...(l.angle ? { angle: r(l.angle) } : {}), ...(l.fixture ? { fixture: l.fixture } : {}) })),
        neon: (game.neonSigns ?? []).map(n => plain(n, ['x', 'y', 'text', 'color', 'fontSize', 'fontFamily', 'flickerOffset'])),
        foliage: m.foliage.map(f => plain(f, ['x', 'y', 'type', 'size', 'phaseOffset', 'swayMultiplier', 'isGlowing', 'glowColor', 'leafColor', 'trunkColor'])),
        props: m.props.filter(p => p.decorType).map(p => ({ decorType: p.decorType, x: r(p.x), y: r(p.y), width: r(p.width), height: r(p.height), color: p.color, mass: p.mass, ...(p.decor?.variant ? { variant: p.decor.variant } : {}) })),
        transitions: m.transitions.map(t => ({ ...rect(t), target: t.target, label: t.label }))
    };
}

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let city;
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/DFAB%20V8.html`, { waitUntil: 'load' });
    await page.waitForFunction("typeof game!=='undefined'");
    city = await page.evaluate(exportCity);
} finally { await browser.close(); server.close(); }
// One record per line: the file diffs readably when the generator changes.
const lines = ['{'], keys = Object.keys(city);
keys.forEach((k, i) => {
    const v = city[k], end = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v)) lines.push(`  ${JSON.stringify(k)}: [`, ...v.map((e, j) => `    ${JSON.stringify(e)}${j < v.length - 1 ? ',' : ''}`), `  ]${end}`);
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(Array.isArray)) {
        lines.push(`  ${JSON.stringify(k)}: {`); const sub = Object.keys(v);
        sub.forEach((s, j) => lines.push(`    ${JSON.stringify(s)}: [`, ...v[s].map((e, n) => `      ${JSON.stringify(e)}${n < v[s].length - 1 ? ',' : ''}`), `    ]${j < sub.length - 1 ? ',' : ''}`));
        lines.push(`  }${end}`);
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${end}`);
});
lines.push('}');
const text = lines.join('\n') + '\n';
if (process.argv.includes('--check')) {
    const now = await readFile(OUT, 'utf8').catch(() => '');
    if (now !== text) { console.error('The city generator no longer makes sdc-city.json: run node tools/export-city.mjs and commit the change.'); process.exitCode = 1; }
    else console.log('sdc-city.json matches the generator.');
} else { await writeFile(OUT, text); console.log(`Wrote ${OUT}: ${Object.entries(city).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${v.length} ${k}`).join(', ')}`); }
