// Native door art against the classic door artwork, pixel by pixel in Chromium, for every classic
// look (sliding, hinged both ways and swung, arch), plus kinds the classic art never knew.
// Run: node --test tools/test-door-art.mjs   (the pixel test needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { physicsSystem } from '../src/engine/basement/physics/index.mjs';
import { mapInstance } from '../src/engine/basement/maps/index.mjs';
import { createEngineRegistry } from '../src/engine/directory/index.mjs';
import { doorKindsOf } from '../src/engine/directory/index.mjs';
import { doorPresentation, createDoorPackets } from '../src/game/presentation/door.mjs';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

// Each door sits alone in its own 160×160 cell, so each is compared on its own canvas.
const DOORS = [
    { x: 20, y: 76, w: 120, h: 8, type: 'sliding', orientation: 'H', color: 'rgba(150, 200, 220, 0.25)' },
    { x: 45, y: 76, w: 70, h: 8, type: 'hinged', orientation: 'H', color: '#4a3a30' },
    { x: 76, y: 45, w: 8, h: 70, type: 'hinged', orientation: 'V', color: '#4a3a30', swing: 0.9 },
    { x: 45, y: 74, w: 70, h: 12, type: 'hinged', orientation: 'H', color: '#5d3a1a', swing: -1.3 },
    { x: 70, y: 20, w: 20, h: 120, type: 'arch', orientation: 'V' },
    { x: 20, y: 72, w: 120, h: 16, type: 'arch', orientation: 'H' }
];
function build(doors, door_kinds = {}) {
    const physics = new physicsSystem();
    const definition = { map_id: 'doors', size: [160 * doors.length, 160], doors: doors.map((d, i) => ({ ...d, x: d.x + 160 * i, data: { appearance: d } })) };
    const map = new mapInstance(physics, definition, { door_kinds, decorate: (packet, { section, source }) => section === 'doors' ? { ...packet, data: { ...packet.data, appearance: source } } : packet });
    const found = map.getDoors();
    found.forEach((door, i) => { if (doors[i].swing) door.leaves[0].updateBody({ rotation: doors[i].swing }); });
    return { physics, map, doors: map.getDoors() };
}
/** The classic artwork's input, exactly as the old apartment renderer built it. */
function classicInput(door, d, i) {
    const a = { ...d, x: d.x + 160 * i }, leaf = door.leaves[0];
    if (!leaf) return a;
    const pose = leaf.getRenderState(1), shape = leaf.collision_shape;
    const packet = { ...a, hx: pose.position[0], hy: pose.position[1], length: a.orientation === 'H' ? a.w : a.h, baseAngle: a.orientation === 'H' ? 0 : Math.PI / 2, angle: pose.rotation, thickness: a.orientation === 'H' ? shape.dimensions[1] : shape.dimensions[0] };
    if (a.type === 'sliding') packet.panels = door.leaves.map(panel => ({ ...panel.getRenderState(1), dimensions: panel.collision_shape.dimensions, local_position: panel.collision_shape.local_position ?? [0, 0] }));
    return packet;
}

test('every door, arches too, becomes frame packets from its leaves', () => {
    const { doors } = build(DOORS);
    assert.equal(doors.length, DOORS.length);
    const kinds = doors.map(d => doorPresentation(d)).map(p => [p.type, p.arch, p.leaves.map(l => l.motion).join('+')]);
    assert.deepEqual(kinds, [['sliding', false, 'slide+slide'], ['hinged', false, 'hinge'], ['hinged', false, 'hinge'], ['hinged', false, 'hinge'], ['arch', true, ''], ['arch', true, '']]);
    for (const door of doors) for (const packet of createDoorPackets(doorPresentation(door))) assert.equal(packet.type, 'shape');
    const swung = doorPresentation(doors[2]); assert.ok(Math.abs(swung.leaves[0].rotation - 0.9) < 1e-12, 'a leaf is drawn where its body is');
    const look = createDoorPackets(doorPresentation(doors[1]), { appearance: { hinge: { handle: '#ff0000' } } });
    assert.ok(look.some(p => p.material.fill === '#ff0000'), 'the look can be replaced part by part');
});

test('a double door, which the classic art drew as one leaf, draws both its leaves', () => {
    const { doors } = build([{ x: 20, y: 76, w: 120, h: 8, type: 'double', orientation: 'H', color: '#4a3a30' }], doorKindsOf(createEngineRegistry()));
    const packet = doorPresentation(doors[0]);
    assert.deepEqual(packet.leaves.map(l => l.motion), ['hinge', 'hinge']);
    const pins = createDoorPackets(packet).filter(p => p.material.fill === '#8a7048').map(p => p.matrix[4]);
    assert.equal(pins.length, 2); assert.ok(Math.abs(pins[0] - 20) < 1e-9 && Math.abs(pins[1] - 140) < 1e-9, `one pin at each end of the opening (${pins})`);
});

test('native door art matches the classic artwork pixel for pixel', { skip: !chromium && 'Playwright is not installed' }, async () => {
    const { doors } = build(DOORS);
    const cells = doors.map((door, i) => ({ native: createDoorPackets(doorPresentation(door)), classic: classicInput(door, DOORS[i], i) }));
    const server = createServer(async (req, res) => {
        try { const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
            res.writeHead(200, { 'content-type': extname(req.url) === '.mjs' ? 'text/javascript' : extname(req.url) === '.json' ? 'application/json' : 'text/plain' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
    }).listen(0);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/tools/fixtures/blank.html`).catch(() => {});
        const results = await page.evaluate(async cells => {
            const { canvasRenderer } = await import('/src/engine/basement/rendering/index.mjs');
            const classic = (0, eval)(await (await fetch('/src/legacy/presentation/indoor-door.js')).text() + ';drawIndoorDoorAppearance');
            const draw = (i, paint) => { const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 160 }), ctx = canvas.getContext('2d');
                ctx.fillStyle = '#20202a'; ctx.fillRect(0, 0, 160, 160); ctx.translate(-160 * i, 0); paint(ctx); return ctx.getImageData(0, 0, 160, 160).data; };
            return cells.map((cell, i) => {
                const a = draw(i, ctx => classic(ctx, cell.classic)), b = draw(i, ctx => canvasRenderer.drawPackets(ctx, cell.native));
                let worst = 0, off = 0, inked = 0; for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); worst = Math.max(worst, d); if (d > 3) off++; }
                for (let k = 0; k < a.length; k += 4) if (a[k] !== 0x20 || a[k + 1] !== 0x20 || a[k + 2] !== 0x2a) inked++;
                return { worst, off, inked };
            });
        }, cells);
                results.forEach((r, i) => {
            assert.ok(r.inked > 200, `door ${i} draws something (${r.inked} pixels)`);
            // A canvas strokeRect and a closed rectangle path antialias their corners a shade apart (3/255 at most).
            assert.ok(r.off === 0 && r.worst <= 3, `door ${i} (${DOORS[i].type}) matches the classic art: ${r.off} channels off, worst ${r.worst}`);
        });
    } finally { await browser.close(); server.close(); }
});

test('a door hinged on the right swings from its right end, inside the opening', () => {
    const { doors } = build([{ x: 20, y: 76, w: 70, h: 8, type: 'hinged', orientation: 'H', hingeSide: 'right', color: '#4a3a30' }]);
    const packets = createDoorPackets(doorPresentation(doors[0])), leaf = packets.find(p => p.material.fill === '#4a3a30'), pin = packets.find(p => p.material.fill === '#8a7048');
    assert.ok(Math.abs(pin.matrix[4] - 90) < 1e-9, 'the pin is at the right end');
    assert.ok(leaf.matrix[0] < -0.999, 'and the leaf runs back to the left from it');
});
