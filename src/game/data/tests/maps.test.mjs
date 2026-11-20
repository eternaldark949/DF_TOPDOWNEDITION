// ===== GAME DATA =====
// Every map is a data file: each one validates, builds with the engine's map builder and draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { physicsSystem } from '../../../engine/basement/physics/index.mjs';
import { mapInstance } from '../../../engine/basement/maps/index.mjs';
import { renderSystem, cameraSystem, recordingRenderer } from '../../../engine/basement/rendering/index.mjs';
import { createEngineRegistry, validateLibrary, mapDefinition, doorKindsOf } from '../../../engine/directory/index.mjs';
import { objectPacket } from '../../../engine/penthouse/index.mjs';

const read = url => JSON.parse(readFileSync(url, 'utf8'));
const folder = name => readdirSync(new URL(`../${name}/`, import.meta.url)).filter(f => f.endsWith('.json')).map(f => read(new URL(`../${name}/${f}`, import.meta.url)));
const maps = folder('maps'), libraries = [...folder('libraries'), ...maps, read(new URL('../../../engine/penthouse/examples/bar-cart.json', import.meta.url))];
const classic = read(new URL('../../../../reference/classic/game-db/places.json', import.meta.url));
const world = () => { const p = new physicsSystem({ asset_library: createEngineRegistry({ libraries }) }); return p; };
const build = (p, id) => new mapInstance(p, mapDefinition(p.elements.asset_library, id), { door_kinds: doorKindsOf(p.elements.asset_library), make_object: (record, at, overrides) => objectPacket(p.elements.asset_library, record, at, overrides) });

test('one file per map: every classic map is here, its library named for it, and every file validates', () => {
    assert.deepEqual(maps.map(m => m.library_id).sort(), Object.keys(classic.maps).sort());
    for (const library of libraries) validateLibrary(library);
    for (const m of maps) assert.equal(m.resources.map.kind, 'map', `${m.library_id} holds its map`);
});

test('every map builds: its size, walls, rooms, exits and landmarks are the classic ones', () => {
    for (const { library_id } of maps) {
        const p = world(), source = classic.maps[library_id], map = build(p, `${library_id}:map`), definition = mapDefinition(p.elements.asset_library, `${library_id}:map`);
        assert.deepEqual(definition.size, [source.width, source.height], library_id);
        assert.equal(definition.kind, source.type === 'outdoor' ? 'exterior' : 'interior');
        assert.equal(map.packets().filter(packet => packet.data.role === 'transition').length, (source.transitions ?? []).length, `${library_id}: one exit per classic transition`);
        assert.ok(map.packets().filter(packet => packet.data.role === 'wall').length >= (source.walls ?? []).length, `${library_id}: every wall, some cut by doors`);
        assert.equal(map.rooms.rooms.length, Object.keys(classic.rooms[library_id]?.rooms ?? {}).length, `${library_id}: rooms`);
        assert.equal(Object.keys(definition.landmarks ?? {}).length, (source.landmarks ?? []).length, `${library_id}: landmarks`);
        assert.equal(map.packets().filter(packet => packet.data.role === 'floor').length, definition.floors.length, `${library_id}: floors (a big map streams them by region)`);
        map.destroy();
    }
});

test('the apartment draws from its files: floors textured and anchored to the map, rugs and the cart placed as objects', async () => {
    const p = world(), map = build(p, 'apt_949:map');
    const cart = map.entities('prop').find(e => e.get('object') === 'examples:bar_cart');
    assert.deepEqual(cart.position, [619, 781]); assert.equal(cart.get('behaviour'), 'refill_drink', 'a placed object is the catalog record');
    assert.ok(map.entities('wall').every(w => w.components[0].layers[0].thickness === 120), 'walls 2.4 m tall');
    const camera = new cameraSystem({ position: [700, 450], viewport: { width: 1400, height: 900 } }), render = new renderSystem({ physics_system: p, camera });
    render.registerRenderer('recording', recordingRenderer); await render.setRenderer('recording', { surface: null }); render.setStillPictures(false);   // (these read each shape's packets)
    p.updateState(1 / 60);
    const draw = () => { render.beginFrame(); render.drawLooks(); render.endFrame(); return render.getFrameSnapshot(); };
    draw(); await render.texturesReady();
    const frame = draw(), tiles = frame.passes.filter(pass => pass.target_id !== null), fills = frame.passes.flatMap(pass => pass.target_id === null ? pass.packets : []).map(packet => packet.material.fill);
    assert.equal(tiles.length, 7, 'six floor textures and the bed rug\'s lattice, each painted once');
    assert.ok(fills.find(fill => fill?.type === 'pattern' && fill.matrix[4] === 8 && fill.matrix[5] === 8), 'the teak starts at the veranda\'s corner: its offset is in map space');
    render.dispose();
});
