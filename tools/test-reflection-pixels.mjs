// Reflections drawn in Chromium: a lamp's light shines in a wet street and not on a matte rug, a pillar shows
// in a marble floor, and the WebGL march adds what the light sprites alone do not.
// Run: node --test tools/test-reflection-pixels.mjs   (needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

// Draws each job ({scene, options}) with reflections on and off and returns, per job, the brightness of the
// points asked for in both, and the summed change over the rectangle asked for.
async function draw(jobs) {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/html' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const result = await page.evaluate(async jobs => {
            const S = await import('/tools/fixtures/reflection-scene.mjs'), out = [];
            for (const job of jobs) {
                const shots = {};
                for (const on of [true, false]) shots[on] = await S.drawScene(S[job.scene](), { frames: 2, dark: false, lean: false, ...job.options, reflections: on });
                const { width } = shots.true, light = (p, x, y) => { const i = (y * width + x) * 4; return (p[i] + p[i + 1] + p[i + 2]) / 3; };
                const points = job.points.map(([x, y]) => [light(shots.true.pixels, x, y), light(shots.false.pixels, x, y)]);
                let change = 0; const [l, t, r, b] = job.area ?? [0, 0, 0, 0];
                for (let y = t; y < b; y++) for (let x = l; x < r; x++) change += Math.abs(light(shots.true.pixels, x, y) - light(shots.false.pixels, x, y));
                out.push({ points, change: change / Math.max(1, (r - l) * (b - t)), stats: shots.true.stats });
            }
            return out;
        }, jobs);
        assert.deepEqual(errors, [], 'no page errors');
        return result;
    } finally { await browser.close(); server.close(); }
}

// The street is seen at [800,450] through 800×450: world (x,y) is at screen (x−400, y−225). The lobby is seen
// whole through 1000×700: world is screen.
const street = { width: 800, height: 450, center: [800, 450] }, lobby = { width: 1000, height: 700, center: [500, 350] };

test('Canvas: a lamp shines in the wet road under it, the matte rug shows nothing and the pillars stand in the marble', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const [road, hall] = await draw([
        { scene: 'street', options: { ...street, renderer: 'canvas', quality: 'medium' }, points: [[200, 255], [300, 151]] },
        { scene: 'lobby', options: { ...lobby, renderer: 'canvas', quality: 'medium' }, points: [[500, 500], [350, 520], [200, 600]] },
    ]);
    const [lamp, matte] = road.points;
    assert.ok(lamp[0] - lamp[1] > 20, `the lamp at (600,360), 160 up, falls 120 down the road: ${lamp}`);
    assert.ok(Math.abs(matte[0] - matte[1]) < 3, `the dry kerb between the lamps shines not at all: ${matte}`);
    const [rug, marble, pillar] = hall.points;
    assert.ok(Math.abs(rug[0] - rug[1]) < 3, `the rug does not shine: ${rug}`);
    assert.ok(marble[0] - marble[1] > 10, `the marble shows the light above it: ${marble}`);
    assert.ok(pillar[1] - pillar[0] > 10, `the pillar at (200,520) stands darker in the marble below it: ${pillar}`);
});

test('WebGL: the reflection march adds the street\'s things to the road, beyond the lights alone', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const area = [0, 160, 800, 450];
    const [medium, high] = await draw([
        { scene: 'street', options: { ...street, renderer: 'webgl', quality: 'medium' }, points: [[200, 255]], area },
        { scene: 'street', options: { ...street, renderer: 'webgl', quality: 'high' }, points: [[200, 255]], area },
    ]);
    assert.ok(medium.points[0][0] - medium.points[0][1] > 20, `the lamp shines on WebGL too: ${medium.points[0]}`);
    assert.ok(high.change > medium.change * 1.05, `the march reflects more of the road: ${high.change} against ${medium.change}`);
});
