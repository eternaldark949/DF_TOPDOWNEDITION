// The WebGL backend drawn in Chromium beside the Canvas backend: the same frames, compared pixel by pixel.
// Run: node --test tools/test-webgl-pixels.mjs   (needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

async function inBrowser(run, argument) {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/html' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const result = await page.evaluate(run, argument);
        assert.deepEqual(errors, [], 'no page errors');
        return result;
    } finally { await browser.close(); server.close(); }
}

// Draws one scene through renderSystem on Canvas, then switches the same system to WebGL (a fresh canvas
// each switch, like a host's create_surface) and draws it again. Returns both images as RGBA arrays.
const scene = async ({ pixel_ratio = 1, zoom = 1, rotation = 0 } = {}) => {
    const R = await import('/src/engine/basement/rendering/index.mjs'), { physicsSystem } = await import('/src/engine/basement/physics/index.mjs');
    const W = 160 * pixel_ratio, H = 120 * pixel_ratio, surfaces = [];
    const camera = new R.cameraSystem({ position: [80, 60], zoom, rotation, viewport: { width: 160, height: 120, pixel_ratio } });
    const render = new R.renderSystem({ physics_system: new physicsSystem(), camera, create_surface: () => { const c = Object.assign(document.createElement('canvas'), { width: W, height: H }); surfaces.push(c); return c; } });
    render.registerRenderer('canvas', R.canvasRenderer).registerRenderer('webgl', R.webglRenderer);
    await render.setRenderer('canvas');
    const pixels = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pixels.push(...((x + y) % 2 ? [255, 255, 0, 255] : [0, 120, 255, 255]));
    await render.registerResource('checker', { type: 'image', width: 8, height: 8, pixels });
    await render.registerResource('cache', { type: 'target', width: 40, height: 40 });
    await render.registerResource('ring', { type: 'geometry', geometry: { type: 'path', fill_rule: 'evenodd', commands: [['ellipse', 0, 0, 14, 14, 0, 0, Math.PI * 2, 0], ['close'], ['ellipse', 0, 0, 7, 7, 0, 0, Math.PI * 2, 0], ['close']] } });
    const art = new R.artScene();
    art.drawRectangle({ x: 4, y: 4, width: 40, height: 24, radius: 6, fill: { type: 'linear', from: [4, 0], to: [44, 0], stops: [[0, '#ff0000'], [1, '#0000ff']] }, stroke: '#ffffff', line_width: 3 });
    art.drawLine({ points: [[4, 36], [70, 36], [70, 56]], stroke: '#00ff00', line_width: 4, dash: [6, 3], line_cap: 'round', line_join: 'round' });
    art.drawText({ text: 'GL ok', x: 80, y: 20, size: 14, weight: 700, family: 'sans-serif', fill: '#ffeeaa' });
    const looks = art.finish();
    const draw = () => {
        const frame = render.beginFrame(); frame.clear('#202030');
        frame.beginPass({ target_id: 'cache', viewport: { width: 40, height: 40 } });
        frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [18, 18] }, position: [20, 20], material: { fill: { type: 'radial', from: [0, 0], inner_radius: 0, to: [0, 0], outer_radius: 18, stops: [[0, '#ffffff'], [1, 'rgba(255,128,0,0)']] } } });
        frame.endPass();
        for (const p of looks) frame.submit(p);
        frame.submit({ type: 'shape', geometry_id: 'ring', position: [120, 60], material: { fill: '#ff00ff', stroke: null } });
        frame.submit({ type: 'shape', geometry: { type: 'rect', size: [30, 30] }, position: [25, 90], material: { fill: { type: 'pattern', image: 'checker', repeat: 'repeat' } } });
        frame.submit({ type: 'sprite', resource_id: 'cache', position: [75, 90], size: [40, 40], blend: 'add' });
        frame.submit({ type: 'sprite', resource_id: 'checker', position: [145, 15], size: [16, 16], rotation: .4 });
        frame.submit({ type: 'shape', geometry: { type: 'rect', size: [40, 40] }, position: [130, 100], material: { fill: '#00ffff' },
            clips: [{ geometry: { type: 'ellipse', radii: [14, 14] }, transform: [1, 0, 0, 1, -6, -6] }, { geometry: { type: 'rect', size: [24, 24] } }] });
        frame.submit({ type: 'picture', position: [120, 60], picture: { key: 'badge', bounds: [-10, -10, 20, 20], build: () => [
            { type: 'shape', geometry: { type: 'rect', size: [16, 16] }, material: { fill: '#204080' } },
            { type: 'shape', geometry: { type: 'ellipse', radii: [5, 5] }, material: { fill: '#ffffff' }, blend: 'destination-out' }] , layered: true } });
        frame.beginPass({ layer: { scale: 1, blend: 'normal', opacity: .85 }, clear_color: 'rgba(0,0,20,0.6)' });
        frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [30, 30] }, position: [60, 60], blend: 'destination-out', material: { fill: { type: 'radial', from: [0, 0], inner_radius: 0, to: [0, 0], outer_radius: 30, stops: [[0, '#000'], [1, 'rgba(0,0,0,0)']] } } });
        frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [20, 20] }, position: [60, 60], blend: 'add', material: { fill: 'rgba(255,160,60,0.35)' } });
        frame.endPass();
        render.endFrame();
    };
    const grab = () => { const c = surfaces.at(-1), out = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = out.getContext('2d'); ctx.drawImage(c, 0, 0); return [...ctx.getImageData(0, 0, W, H).data]; };
    draw(); const canvas = grab();
    await render.setRenderer('webgl'); const capabilities = render.getCapabilities();
    draw(); const webgl = grab();
    await render.setRenderer('canvas'); draw(); const again = grab();
    render.dispose();
    return { W, H, canvas, webgl, again, capabilities, switches: surfaces.length };
};

test('WebGL draws the same frame as Canvas: shapes, gradients, dashes, text, sprites, patterns, clips, targets, pictures and layers', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const { W, H, canvas, webgl, again, capabilities, switches } = await inBrowser(scene);
    assert.ok(capabilities.includes('layer') && capabilities.includes('blur') && !capabilities.includes('blend:overlay'), 'the WebGL backend is live with its own capabilities');
    assert.equal(switches, 3, 'each switch drew on a fresh surface');
    assert.deepEqual(again, canvas, 'switching back to Canvas draws exactly what it drew before');
    let total = 0, far = 0; const at = (image, x, y) => image.slice((y * W + x) * 4, (y * W + x) * 4 + 4);
    for (let i = 0; i < canvas.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(canvas[i + c] - webgl[i + c])); total += d; if (d > 48) far++; }
    const mean = total / (W * H), share = far / (W * H);
    // Anti-aliased edges and text hinting differ slightly between the two; the paint inside every shape must match.
    assert.ok(mean < 4, `mean channel difference ${mean.toFixed(2)}`); assert.ok(share < .03, `${(share * 100).toFixed(2)}% of pixels differ by more than 48`);
    for (const [x, y, what] of [[24, 16, 'gradient box'], [6, 16, 'its outline'], [10, 36, 'a dash'], [120, 48, 'the even-odd ring'], [120, 60, 'its hole'], [25, 90, 'the pattern'], [75, 90, 'the target sprite'], [124, 94, 'inside both clips'], [146, 116, 'outside the clips'], [60, 60, 'the light layer'], [2, 2, 'the dark']]) {
        const a = at(canvas, x, y), b = at(webgl, x, y);
        assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= 12), `${what} at ${x},${y}: canvas ${a} webgl ${b}`);
    }
});

test('and at twice the pixel density under a turned, zoomed camera', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const { W, H, canvas, webgl } = await inBrowser(scene, { pixel_ratio: 2, zoom: 1.3, rotation: .3 });
    assert.equal(W, 320); let total = 0, far = 0;
    for (let i = 0; i < canvas.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(canvas[i + c] - webgl[i + c])); total += d; if (d > 48) far++; }
    assert.ok(total / (W * H) < 4, `mean channel difference ${(total / (W * H)).toFixed(2)}`); assert.ok(far / (W * H) < .03, `${(far / (W * H) * 100).toFixed(2)}% of pixels differ by more than 48`);
});

// Blur and shadows: the same soft frame on both backends.
const soft = async ({ pixel_ratio = 1, zoom = 1, streaks = true } = {}) => {
    const R = await import('/src/engine/basement/rendering/index.mjs'), { physicsSystem } = await import('/src/engine/basement/physics/index.mjs');
    const W = 160 * pixel_ratio, H = 120 * pixel_ratio, surfaces = [];
    const camera = new R.cameraSystem({ position: [80, 60], zoom, viewport: { width: 160, height: 120, pixel_ratio } });
    const render = new R.renderSystem({ physics_system: new physicsSystem(), camera, create_surface: () => { const c = Object.assign(document.createElement('canvas'), { width: W, height: H }); surfaces.push(c); return c; } });
    render.registerRenderer('canvas', R.canvasRenderer).registerRenderer('webgl', R.webglRenderer);
    await render.setRenderer('canvas');
    const draw = () => {
        const frame = render.beginFrame(); frame.clear('#d8d0c0');
        frame.submit({ type: 'shape', geometry: { type: 'rect', size: [40, 24], radius: 4 }, position: [35, 30], material: { fill: '#3060c0', shadow: { color: 'rgba(0,0,0,0.6)', blur: 8, offset: [4, 5] } } });
        frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [18, 10] }, position: [110, 30], material: { fill: 'rgba(10,0,30,0.7)', blur: 3 } });
        frame.submit({ type: 'shape', geometry: { type: 'path', commands: [['move', -25, 0], ['quadratic', 0, -18, 25, 0]] }, position: [45, 88], material: { fill: null, stroke: 'rgba(0,0,0,0.6)', stroke_width: 6, blur: 1.5 } });
        frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [22, 22] }, position: [115, 85], material: { fill: '#e0a020', blur: 12 }, opacity: .8, clips: [{ geometry: { type: 'rect', size: [36, 60] } }] });
        if (streaks) {
            frame.submit({ type: 'shape', geometry: { type: 'rect', size: [16, 10] }, position: [80, 62], rotation: .5, material: { fill: '#c02040', blur: { spread: [7, 0], angle: 0 } } });
            frame.submit({ type: 'shape', geometry: { type: 'ellipse', radii: [6, 6] }, position: [80, 100], material: { fill: '#103080', blur: { spread: [10, 1.5], angle: 2.4 }, shadow: { color: 'rgba(0,0,0,0.5)', blur: 4, offset: [0, 6] } } });
        }
        render.endFrame();
    };
    const grab = () => { const c = surfaces.at(-1), out = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = out.getContext('2d'); ctx.drawImage(c, 0, 0); return [...ctx.getImageData(0, 0, W, H).data]; };
    draw(); const canvas = grab(); await render.setRenderer('webgl'); draw(); const webgl = grab(); render.dispose();
    return { W, H, canvas, webgl };
};
const compare = ({ W, H, canvas, webgl }) => { let total = 0, far = 0, worst = 0; for (let i = 0; i < canvas.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(canvas[i + c] - webgl[i + c])); total += d; worst = Math.max(worst, d); if (d > 24) far++; } return { mean: total / (W * H), share: far / (W * H), worst }; };

test('WebGL blurs and casts shadows as Canvas does: a soft shadow, a blurred fill, a blurred stroke, a clipped glow and streaks along an angle', { skip: !chromium && 'Playwright is not installed' }, async () => {
    for (const options of [{}, { pixel_ratio: 2, zoom: 1.5 }]) {
        const { mean, share, worst } = compare(await inBrowser(soft, options));
        assert.ok(mean < 2.5, `mean channel difference ${mean.toFixed(2)} (${JSON.stringify(options)})`); assert.ok(share < .02, `${(share * 100).toFixed(2)}% of pixels differ by more than 24, worst ${worst}`);
    }
});
