// Native prop art against the classic prop artwork, pixel by pixel in Chromium, for every piece in the
// cafe as it is placed there; the families and presets in the catalog; and the picture cache's
// stamps against the vector art.
// Run: node --test tools/test-prop-art.mjs   (the pixel tests need Playwright with Chromium; skip without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validatePropCatalog, validateMapLayout, resolvePlacement } from '../src/engine/directory/index.mjs';
import { PROP_FAMILIES, hasPropArt, propArtPacket, createPropDraws } from '../src/game/presentation/props/index.mjs';
import PROPS from '../src/game/data/game-assets/props.json' with { type: 'json' };
import CAFE from '../src/game/data/game-assets/maps/cozy_cafe_interior.json' with { type: 'json' };
import { MAP_IDS, createMapLibraries } from '../src/game/data/game-maps.mjs';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}
const CATALOG = PROPS.resources.catalog.data, TYPES = CATALOG.types;
// A time on one of the plant's phase frames (frame 3 of 10 of its sway), so the classic clock and the native loop agree.
const TIME = 3 * (2 * Math.PI / 0.8) / 10;
const PIECES = CAFE.props.filter(p => hasPropArt(resolvePlacement(p, TYPES).family)).map(p => ({ placement: p, ...resolvePlacement(p, TYPES) }));

test('every family has an artist, every preset and every map placement fits its family', () => {
    assert.doesNotThrow(() => validatePropCatalog(CATALOG));
    for (const family of Object.keys(CATALOG.families)) assert.ok(hasPropArt(family), `${family} has a native artist`);
    for (const [type, { defaults }] of Object.entries(TYPES)) if (type.startsWith('cc_')) assert.ok(hasPropArt(defaults.family), `${type} is a preset of a drawn family`);
    const maps = createMapLibraries()[1].resources;
    for (const id of MAP_IDS) assert.doesNotThrow(() => validateMapLayout(maps[id].data, TYPES, id, CATALOG.families));
    assert.equal(PIECES.length, CAFE.props.length - 2, 'every cafe piece but the vending machine and the tote is native');
});

test('a placement tweaks its preset through the look, and a wrong field is refused', () => {
    const plant = PIECES.find(p => p.placement.look?.fern), crate = PIECES.find(p => p.placement.look?.label);
    assert.deepEqual(propArtPacket({ appearance: plant, position: [0, 0], width: 36, height: 36 }).look.fern, true);
    assert.equal(propArtPacket({ appearance: crate, position: [0, 0], width: 56, height: 40 }).look.label, 'COCOA');
    const red = propArtPacket({ appearance: { ...resolvePlacement({ type: 'cc_chair', x: 1, y: 2, look: { seats: ['#ff0000'] } }, TYPES) }, position: [0, 0], width: 22, height: 22 });
    assert.ok(createPropDraws(red).flatMap(d => d.build()).some(p => p.material.fill === '#ff0000'), 'a map can recolour one chair');
    assert.throws(() => propArtPacket({ appearance: { ...resolvePlacement({ type: 'cc_chair', x: 1, y: 2, look: { legs: 4 } }, TYPES) }, position: [0, 0], width: 22, height: 22 }), /unknown look field legs/);
    assert.throws(() => validateMapLayout({ props: [{ type: 'cc_chair', x: 1, y: 1, look: { seats: 'red' } }] }, TYPES, 'cafe', PROP_FAMILIES), /seats must be a colors/);
});

test('still runs are pictures with stable keys; moving parts are live; the plant sways in phase frames', () => {
    const at = type => PIECES.find(p => p.placement.type === type);
    const draws = (type, time) => { const p = at(type); return createPropDraws(propArtPacket({ appearance: p, position: [0, 0], width: p.width, height: p.height }), { time }); };
    assert.deepEqual(draws('cc_espresso', 1).map(d => !!d.key), [false, true, false, true], 'shadow, machine, needle, cups');
    assert.deepEqual(draws('cc_fireplace', 1).map(d => !!d.key), [false, true, false, true]);
    assert.deepEqual(draws('cc_record', 1).map(d => !!d.key), [false, true, false, true]);
    assert.deepEqual(draws('cc_chair', 1).map(d => d.key), [undefined, draws('cc_chair', 9)[1].key], 'a still piece keeps its picture as time passes');
    assert.notEqual(draws('cc_plant', 0)[1].key, draws('cc_plant', TIME)[1].key, 'each phase frame is its own picture');
    assert.equal(draws('cc_plant', TIME)[1].key, draws('cc_plant', TIME + 0.05)[1].key, 'and the time between frames shows the nearest');
    const chairs = PIECES.filter(p => p.placement.type === 'cc_chair').map(p => createPropDraws(propArtPacket({ appearance: p, position: [0, 0], width: 22, height: 22 }))[1].key);
    assert.equal(new Set(chairs).size, chairs.length, 'each chair, seeded from where it stands, is its own picture');
});

/** Serves the checkout, opens a blank page and runs `fn(args)` there. */
async function inChromium(fn, args) {
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/plain' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try { const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {}); return await page.evaluate(fn, args); }
    finally { await browser.close(); server.close(); }
}

test('native prop art matches the classic artwork pixel for pixel, for every piece in the cafe', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const cells = PIECES.map(p => ({ type: p.placement.type, x: p.x, y: p.y, w: p.width, h: p.height,
        // The classic art read the fern and the cocoa crate from `variant`; their placements now set the look.
        classic: { x: p.x, y: p.y, width: p.width, height: p.height, decorType: p.decorType, decor: { face: p.face, vertical: !!p.vertical, variant: p.look?.fern || p.look?.label === 'COCOA' ? 1 : p.variant | 0 } },
        native: propArtPacket({ appearance: p, position: [p.x + p.width / 2, p.y + p.height / 2], width: p.width, height: p.height }) }));
    const results = await inChromium(async ({ cells, time }) => {
        const { createPropDraws } = await import('/src/game/presentation/props/index.mjs'), { canvasRenderer } = await import('/src/engine/basement/rendering/index.mjs');
        const source = await (await fetch('/src/legacy/entities/props-decor.js')).text(), from = source.indexOf('        const CC = {'), to = source.indexOf('        // Enni Cole\'s display furniture');
        const classic = (0, eval)(`(()=>{let _frameTime=${time * 1000};${source.slice(from, to)};return drawCafeDecorProp;})()`);
        const PAD = 16, draw = (cell, paint) => { const W = Math.ceil(cell.w + 2 * PAD), H = Math.ceil(cell.h + 2 * PAD), canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = canvas.getContext('2d');
            ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, W, H); ctx.translate(PAD - cell.x, PAD - cell.y); paint(ctx); return ctx.getImageData(0, 0, W, H).data; };
        return cells.map(cell => {
            const a = draw(cell, ctx => classic(ctx, cell.classic));
            const b = draw(cell, ctx => { for (const d of createPropDraws(cell.native, { time }).slice(1)) { ctx.save(); ctx.transform(...d.matrix); canvasRenderer.drawPackets(ctx, d.build()); ctx.restore(); } });
            let worst = 0, off = 0, inked = 0; for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); worst = Math.max(worst, d); if (d > 3) off++; }
            for (let k = 0; k < a.length; k += 4) if (a[k] !== 0x20 || a[k + 1] !== 0x20 || a[k + 2] !== 0x2a) inked++;
            let at = null; for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) === worst && worst) { const i = k >> 2, W = Math.ceil(cell.w + 2 * PAD); at = [i % W - PAD, (i / W | 0) - PAD, [...a.slice(i * 4, i * 4 + 4)], [...b.slice(i * 4, i * 4 + 4)]]; break; }
            return { type: cell.type, worst, off, inked, at };
        });
    }, { cells, time: TIME });
    if (process.env.PROP_ART_REPORT) console.log(results.map(r => `${r.type} off ${r.off} worst ${r.worst} ${JSON.stringify(r.at)}`).join('\n'));
    for (const r of results) {
        assert.ok(r.inked > 100, `${r.type} draws something (${r.inked} pixels)`);
        // A canvas antialiases a few edge pixels a shade apart between a fillRect and a path, and along a curve
        // drawn under a transform instead of in world coordinates: every channel within 5/255, or a handful
        // of edge channels (under 1% of the piece's) within 32/255. Each was checked by eye side by side.
        assert.ok(r.worst <= 5 || (r.off < r.inked * 4 * .01 && r.worst <= 32), `${r.type} matches the classic art: ${r.off} channels off of ${r.inked * 4}, worst ${r.worst}`);
    }
});

test('a stamped picture looks like the vector art it was painted from', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const cells = ['cc_counter', 'cc_armchair', 'cc_bookshelf', 'cc_fireplace'].map(type => { const p = PIECES.find(q => q.placement.type === type);
        return { type, w: p.width, h: p.height, native: propArtPacket({ appearance: p, position: [p.width / 2 + 16, p.height / 2 + 16], rotation: 0, width: p.width, height: p.height }) }; });
    const results = await inChromium(async ({ cells, time }) => {
        const { drawPropArt, createPropDraws } = await import('/src/game/presentation/props/index.mjs'), { canvasRenderer, pictureCache } = await import('/src/engine/basement/rendering/index.mjs');
        const pictures = new pictureCache();
        const draw = (cell, scale, paint) => { const W = Math.ceil((cell.w + 32) * scale), H = Math.ceil((cell.h + 32) * scale), canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), ctx = canvas.getContext('2d');
            ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, W, H); ctx.scale(scale, scale); paint(ctx); return ctx.getImageData(0, 0, W, H).data; };
        return cells.flatMap(cell => [1, 2].map(scale => {
            const a = draw(cell, scale, ctx => { for (const d of createPropDraws(cell.native, { time })) { ctx.save(); ctx.transform(...d.matrix); canvasRenderer.drawPackets(ctx, d.build()); ctx.restore(); } });
            pictures.beginFrame(); draw(cell, scale, ctx => drawPropArt(ctx, cell.native, { pictures, time }));
            const b = draw(cell, scale, ctx => drawPropArt(ctx, cell.native, { pictures, time }));
            let total = 0; for (let k = 0; k < a.length; k++) total += Math.abs(a[k] - b[k]);
            return { type: cell.type, scale, mean: total / a.length, pictures: pictures.statistics.pictures };
        }));
    }, { cells, time: TIME });
    for (const r of results) assert.ok(r.mean < 1.5, `${r.type} at ${r.scale}x: stamped within ${r.mean.toFixed(2)}/255 of its vector art on average`);
    assert.ok(results.at(-1).pictures >= 8, 'the pictures were kept');
});
