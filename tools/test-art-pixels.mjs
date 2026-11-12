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
