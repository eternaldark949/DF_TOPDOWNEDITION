// ===== LV2 DIRECTORY =====
// The registry, and the Basement using it as its data source (moved from the physics tests when the
// registry moved into the Directory).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { physicsSystem, gameEntity, gameCharacter } from '../../basement/physics/index.mjs';
import { assetLibrary } from '../index.mjs';

const definition = () => ({ library_id: 'test', resources: { image: { kind: 'image', url: 'hero.png' } }, templates: {
    actor: { entity_type: 'character', collision_shape: { shape_type: 'circle', radius: 3 }, mass: 10, movement: { max_speed: 60 }, assets: { portrait: 'image' }, data: { health: 100, inventory: [] } },
    guard: { extends: 'actor', name: 'Guard', tags: ['guard'], movement: { acceleration: 200 }, data: { health: 80 } },
    car: { entity_type: 'vehicle', mass: 1000 },
} });
const library = () => new assetLibrary({ libraries: [definition()] });
const step = p => p.updateState();

test('template inheritance merges object fields, replaces arrays and never mutates shared definitions', () => {
    const assets = library(), p = new physicsSystem({ asset_library: assets });
    const a = p.createCharacter({ template: 'test:guard', position: [10, 0], movement: { braking: 300 }, data: { inventory: ['key'] } });
    const b = p.createCharacter({ template: 'test:guard', position: [20, 0] });
    assert.equal(a.body.getState().mass, 10); assert.equal(a.physics_controller.config.max_speed, 60); assert.equal(a.physics_controller.config.acceleration, 200);
    assert.equal(a.physics_controller.config.braking, 300); assert.deepEqual(a.tags, ['guard']); assert.equal(a.data.health, 80);
    assert.deepEqual(a.data.inventory, ['key']); assert.deepEqual(b.data.inventory, []); assert.throws(() => assets.getTemplate('test:guard').mass = 0);
    assert.equal(a.getAsset('portrait'), assets.getResource('test:image'));
});
test('asset binding changes validate resources and remain immutable', () => {
    const p = new physicsSystem({ asset_library: library() }), a = p.createCharacter({ template: 'test:actor' });
    assert.throws(() => a.setAsset('portrait', 'missing')); assert.throws(() => a.assets.portrait = 'missing');
    a.setAsset('icon', 'test:image'); assert.equal(a.getAsset('icon').url, 'hero.png');
    a.updateBody({ name: 'Renamed', tags: ['updated'] }); assert.equal(a.name, 'Renamed'); assert.deepEqual(a.tags, ['updated']);
});
test('invalid/cyclic libraries fail atomically with no partial resources or templates', () => {
    const a = library(), before = a.listTemplates();
    assert.throws(() => a.registerLibrary({ library_id: 'bad', resources: { okay: { kind: 'image' } }, templates: { a: { extends: 'b' }, b: { extends: 'a' } } }));
    assert.deepEqual(a.listTemplates(), before); assert.throws(() => a.getResource('bad:okay'));
    assert.throws(() => a.registerLibrary({ library_id: 'missing', templates: { one: { entity_type: 'entity', assets: { image: 'nothing' } } } }));
    assert.throws(() => a.registerLibrary(JSON.parse('{"library_id":"unsafe","templates":{"a":{"entity_type":"entity","__proto__":{}}}}')));
});
test('unknown/mismatched entity templates fail before allocating bodies', () => {
    const p = new physicsSystem({ asset_library: library() });
    assert.throws(() => p.createEntity({ template: 'missing' })); assert.throws(() => p.createCharacter({ template: 'test:car' }));
    assert.throws(() => p.elements.registerEntityType('fake', class {})); assert.equal(p.getStatistics().bodies, 0);
});
test('save/load restores official subclass identities, gameplay data and controller ownership without constructor side effects', () => {
    let constructions = 0;
    class Guard extends gameCharacter { constructor(elements, packet) { super(elements, packet); constructions++; this.data.health = 100; } takeHit() { this.data.health--; } }
    const p = new physicsSystem({ asset_library: library() }); p.elements.registerEntityType('guard', Guard);
    const a = p.createEntity({ entity_type: 'guard', template: 'test:guard' }); a.takeHit(); a.setMovement([1, 0]); step(p);
    const saved = p.savePhysicsState(); p.loadPhysicsState(saved); const restored = p.elements.fetchEntity(a.entity_id);
    assert.ok(restored instanceof Guard && restored instanceof gameEntity); assert.equal(restored.data.health, 99); assert.equal(constructions, 1);
    assert.equal(restored.physics_controller.body, p.fetchBody(restored.body_id)); assert.equal(a.destroyed, true);
    step(p); assert.ok(restored.position[0] > 0);
});
test('missing saved templates fail before replacing the destination world', () => {
    const source = new physicsSystem({ asset_library: library() }); source.createCharacter({ template: 'test:guard' });
    const destination = new physicsSystem(), existing = destination.createEntity();
    assert.throws(() => destination.loadPhysicsState(source.savePhysicsState())); assert.equal(existing.destroyed, false); assert.equal(destination.elements.fetchEntity(existing.entity_id), existing);
});
test('plain JSON libraries from another realm are accepted while class instances remain rejected',()=>{
 const data=vm.runInNewContext('({library_id:"foreign",templates:{prop:{entity_type:"prop",mass:1}}})');assert.ok(new assetLibrary({libraries:[data]}));
 assert.throws(()=>new assetLibrary({libraries:[{library_id:'bad',resources:{date:{kind:'bad',data:new Date()}}}]}),/plain JSON/);
});
