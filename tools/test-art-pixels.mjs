// The art toolkit drawn by the real Canvas backend in Chromium, checked pixel by pixel.
// Run: node --test tools/test-art-pixels.mjs   (needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

test('shapes, glows, shadows and the new blends draw as specified on a real canvas', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/html' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const pixels = await page.evaluate(async () => {
            const { canvasRenderer, artScene, roundRect, capsule, circle, rect, glow, groundShadow, shade } = await import('/src/engine/basement/rendering/index.mjs');
            const canvas = Object.assign(document.createElement('canvas'), { width: 120, height: 60 }), ctx = canvas.getContext('2d');
            const art = new artScene();
            art.outlined(roundRect(4, 4, 30, 20, 8), '#ff0000', '#00ff00', 2);
            art.fill(capsule([45, 14], [75, 14], 6), '#0000ff');
            art.enter({}, { blend: 'add' }); glow(art, 100, 14, 12, '255,255,0', 0); art.leave();
            groundShadow(art, 20, 45, 14, 6, { strength: 3 });
            art.fill(rect(50, 34, 20, 20), '#808080');
            art.enter({}, { blend: 'source-atop' }); art.fill([circle(70, 44, 8)], shade('#ffffff', 0)); art.leave();
            canvasRenderer.drawPackets(ctx, art.finish());
            const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
            return { box: at(19, 14), corner: at(4, 4), edge: at(19, 4), capsule_mid: at(60, 14), capsule_end: at(80, 14), capsule_out: at(84, 14),
                glow_core: at(100, 14), glow_out: at(100, 28), shadow: at(20, 45), atop_inside: at(68, 44), atop_outside: at(75, 44) };
        });
        assert.deepEqual(pixels.box, [255, 0, 0, 255], 'the box is filled');
        assert.ok(pixels.corner[3] < 60, `the corner is rounded off (${pixels.corner})`);
        assert.ok(pixels.edge[1] > 150, `the outline is drawn (${pixels.edge})`);
        assert.deepEqual(pixels.capsule_mid, [0, 0, 255, 255]); assert.ok(pixels.capsule_end[2] > 200, 'the capsule has a round end past its point');
        assert.ok(pixels.capsule_out[3] < 10, 'and stops at its radius');
        assert.ok(pixels.glow_core[0] > 200 && pixels.glow_core[1] > 200 && pixels.glow_core[2] < 10, `the glow is bright at its core (${pixels.glow_core})`); assert.ok(pixels.glow_out[3] < 5, 'and gone past its radius');
        assert.ok(pixels.shadow[0] === 0 && pixels.shadow[3] > 100, `the shadow darkens (${pixels.shadow})`);
        assert.deepEqual(pixels.atop_inside, [255, 255, 255, 255], 'source-atop paints over what is there');
        assert.deepEqual(pixels.atop_outside, [0, 0, 0, 0], 'and nowhere else');
    } finally { await browser.close(); server.close(); }
});

test('the light layer cuts lights out of the dark, shadows them by polygon, adds their colour and lays over the scene', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/html' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const px = await page.evaluate(async () => {
            const { canvasRenderer, createLightLayer } = await import('/src/engine/basement/rendering/index.mjs');
            const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 100 }), ctx = canvas.getContext('2d');
            const layer = createLightLayer({ bounds: { left: 0, top: 0, right: 200, bottom: 100 }, tint: 'rgb(0,0,40)', areas: [{ rects: [{ x: 150, y: 0, w: 50, h: 20 }], cut: 0.5 }],
                lights: [{ position: [50, 50], radius: 40, inner_radius: 10, polygon: [[50, 50], [90, 10], [90, 90]], color: '#ff0000', glow: 0.5, glow_stops: [[0, '#ff0000'], [1, 'rgba(0,0,0,0)']] },
                    { shape: 'area', position: [150, 70], size: [60, 20], round: 10, intensity: 1 }] });
            const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
            canvasRenderer.drawPackets(ctx, layer);
            const raw = { far: at(5, 95), lit: at(55, 50), shadowed: at(40, 50), glow_in_shadow: at(40, 50)[0], area: at(150, 70), area_edge: at(150, 79), thinned: at(175, 10) };
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, 200, 100); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 200, 100);
            canvasRenderer.drawLayer(ctx, layer, { opacity: 0.5 });
            return { ...raw, composite_far: at(5, 95) };
        });
        assert.deepEqual(px.far, [0, 0, 40, 255], 'the dark covers the bounds');
        assert.ok(px.lit[3] < 130 && px.lit[0] > 100 && px.lit[2] < 10, `the light cuts the dark and adds its colour (${px.lit})`);
        assert.ok(px.shadowed[3] > 200, `outside the polygon the dark stays (${px.shadowed})`);
        assert.ok(px.area[3] < 20, `an area light cuts its middle (${px.area})`); assert.ok(px.area_edge[3] > 100, `and fades at its edge (${px.area_edge})`);
        assert.ok(Math.abs(px.thinned[3] - 128) < 3, `an area thins the dark by its cut (${px.thinned})`);
        assert.ok(Math.abs(px.composite_far[0] - 128) < 3 && Math.abs(px.composite_far[2] - 147) < 3, `the layer lays over the scene at its opacity (${px.composite_far})`);
    } finally { await browser.close(); server.close(); }
});

test('a light layer split into still pictures and live lights draws the same layer, at any zoom', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/html' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const result = await page.evaluate(async () => {
            const { canvasRenderer, pictureCache, createLightLayer, createLightLayerParts } = await import('/src/engine/basement/rendering/index.mjs');
            const extent = { left: 0, top: 0, right: 200, bottom: 100 }, tint = 'rgb(20,8,40)', areas = [{ rects: [{ x: 150, y: 0, w: 50, h: 20 }], cut: 0.4 }];
            const lights = [{ still: true, position: [50, 50], radius: 40, inner_radius: 10, polygon: [[50, 50], [90, 10], [90, 90]], color: '#ff8800', glow: 0.5 },
                { still: true, shape: 'area', position: [150, 70], size: [60, 20], round: 10, intensity: .8, color: '#88ccff', glow: .3 },
                { position: [100, 40], radius: 30, intensity: .7, color: '#ffffff', glow: .4 }];   // (the live one: a flickering candle)
            const pictures = new pictureCache({ densities: [1, 2] }), worst = [], tile_worst = [];
            for (const [zoom, ox, oy] of [[1, 0, 0], [2, -60, -30]]) {
                const draw = packets => { const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 100 }), ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, 0, 200, 100); ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
                    canvasRenderer.drawLayer(ctx, packets, { opacity: .9, pictures }); return ctx.getImageData(0, 0, 200, 100).data; };
                const whole = draw(createLightLayer({ bounds: extent, tint, areas, lights })), split = draw(createLightLayerParts({ extent, tint, areas, lights })), tiled = draw(createLightLayerParts({ extent, tint, areas, lights, tile_size: 64 })), halfStill = draw(createLightLayerParts({ extent, tint, areas, tile_size: 64, lights: lights.map((l, i) => i ? l : { ...l, still: 'glow' }) }));
                let max = 0, tiles = 0; for (let i = 0; i < whole.length; i++) { max = Math.max(max, Math.abs(whole[i] - split[i])); tiles = Math.max(tiles, Math.abs(whole[i] - tiled[i]), Math.abs(whole[i] - halfStill[i])); } worst.push(max); tile_worst.push(tiles);
            }
            const parts = createLightLayerParts({ extent, tint, areas, lights }), again = createLightLayerParts({ extent, tint, areas, lights: lights.map(l => l.still ? l : { ...l, intensity: .2 }) });
            const moved = createLightLayerParts({ extent, tint, areas, lights: lights.map((l, i) => i ? l : { ...l, position: [52, 50] }) });
            const keys = p => p.filter(e => e.picture).map(e => e.picture.key);
            const tiled = createLightLayerParts({ extent, tint, areas, lights, tile_size: 64 }), view = createLightLayerParts({ extent, tint, areas, lights, tile_size: 64, view: { left: 0, top: 0, right: 60, bottom: 60 } });
            const nudged = createLightLayerParts({ extent, tint, areas, tile_size: 64, lights: lights.map((l, i) => i === 1 ? { ...l, position: [151, 70] } : l) });
            const kept = keys(nudged).filter(k => keys(tiled).includes(k)).length;
            return { worst, tile_worst, tiles: keys(tiled).filter(k => k.endsWith(':dark')).length, view: keys(view).filter(k => k.endsWith(':dark')).length, kept, pictures: keys(parts).length, live_only: keys(again).join() === keys(parts).join(), moved: keys(moved).every((k, i) => k !== keys(parts)[i]) };
        });
        assert.equal(result.pictures, 2, 'the still lights become two pictures: the dark with their cuts, and their colour');
        assert.ok(result.worst.every(d => d <= 3), `the split layer matches the whole one within rounding (${result.worst})`);
        assert.ok(result.tile_worst.every(d => d <= 3), `tiled, and with a lamp cutting live over its baked colour, it matches too, with no seams (${result.tile_worst})`);
        assert.equal(result.tiles, 8, 'a 200 × 100 extent is eight 64 px tiles'); assert.equal(result.view, 1, 'and a view in one tile asks for that one');
        assert.ok(result.kept >= 3, `a strip light moving repaints only the tiles it reaches (${result.kept} kept)`);
        assert.ok(result.live_only, 'a live light changing keeps the pictures');
        assert.ok(result.moved, 'a still light moving repaints them');
    } finally { await browser.close(); server.close(); }
});
