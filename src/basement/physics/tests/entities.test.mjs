import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, gameEntity, gameElements, gameCharacter, gameVehicle, gameProjectile, gameProp, gameStatic, gameTrigger, gameDecoration, assetLibrary } from '../index.mjs';

const definition = () => ({ library_id: 'test', resources: { image: { kind: 'image', url: 'hero.png' } }, templates: {
    actor: { entity_type: 'character', collision_shape: { shape_type: 'circle', radius: 3 }, mass: 10, movement: { max_speed: 60 }, assets: { portrait: 'image' }, data: { health: 100, inventory: [] } },
    guard: { extends: 'actor', name: 'Guard', tags: ['guard'], movement: { acceleration: 200 }, data: { health: 80 } },
    car: { entity_type: 'vehicle', mass: 1000 },
} });
const library = () => new assetLibrary({ libraries: [definition()] });
const step = p => p.updateState();

test('every game element inherits the official base and registers once by construction', () => {
    const p = new physicsSystem(), factories = [
        ['createEntity', gameEntity], ['createCharacter', gameCharacter], ['createVehicle', gameVehicle], ['createProjectile', gameProjectile],
        ['createProp', gameProp], ['createStatic', gameStatic], ['createTrigger', gameTrigger], ['createDecoration', gameDecoration],
    ];
    for (const [method, Constructor] of factories) {
        const entity = p.elements[method]({ position: [100, 100] });
        assert.ok(entity instanceof gameEntity); assert.ok(entity instanceof Constructor); assert.ok(entity.active && entity.registered && !entity.pending);
        assert.equal(p.elements.fetchEntity(entity.entity_id), entity); assert.equal(p.fetchBody(entity.body_id), entity.body);
        assert.equal(p.elements.getEntityForBody(entity.body), entity);
    }
    assert.equal(p.getStatistics().entities, factories.length); assert.equal(p.getStatistics().spatial.instances, factories.length);
});
test('direct base/subclass construction also uses automatic registration', () => {
    const p = new physicsSystem(), e = new gameEntity(p.elements), c = new gameCharacter(p.elements);
    assert.equal(p.elements.fetchEntity(e.entity_id), e); assert.equal(p.elements.fetchEntity(c.entity_id), c);
    assert.throws(() => new gameElements(p), /already owns/);
});
test('identity, controllers and transforms cannot be shadowed by gameplay fields', () => {
    const p = new physicsSystem(), e = p.createCharacter();
    for (const key of ['entity_id', 'body_id', 'body', 'physics_controller', 'position', 'rotation', 'mass', 'linear_velocity', 'collision_shape']) {
        assert.throws(() => e[key] = 123); assert.throws(() => Object.defineProperty(e, key, { value: 123 }));
    }
    for (const key of ['x', 'y', 'vx', 'vy', 'velX', 'velY', 'angularVel', 'collisionMask']) assert.throws(() => e[key] = 10);
    assert.throws(() => e.position[0] = 10); e.data.health = 10; assert.equal(e.getState().data.health, 10);
});
test('deactivation and activation update the same body, controller, registry and spatial entry', () => {
    const p = new physicsSystem(), e = p.createCharacter({ position: [100, 0] }), body = e.body, controller = e.physics_controller;
    e.deactivate(); assert.equal(e.active, false); assert.equal(p.getStatistics().spatial.instances, 0); assert.equal(p.elements.fetchEntity(e.entity_id), e);
    e.activate(); assert.equal(e.active, true); assert.equal(e.body, body); assert.equal(e.physics_controller, controller); assert.equal(p.getStatistics().spatial.instances, 1);
});
test('destruction removes constraints and scoped subscriptions; it is idempotent', () => {
    const p = new physicsSystem(), e = p.createEntity({ entity_type: 'prop', position: [0, 0] });
    e.createConstraint({ world_target: [10, 0] }); let heard = 0; e.on('probe', () => heard++);
    const body = e.body; e.destroy(); e.destroy(); p._emit('probe', { body }); step(p);
    assert.equal(heard, 0); assert.equal(e.destroyed, true); assert.equal(e.registered, false); assert.equal(e.active, false);
    assert.equal(e.getState().body, null); assert.equal(p.elements.fetchEntity(e.entity_id), null); assert.equal(p.getStatistics().constraints, 0);
    assert.throws(() => e.activate()); assert.throws(() => e.on('probe', () => {}));
});
test('body removal, clear and projectile expiry cannot leave orphan entities', () => {
    const p = new physicsSystem(), e = p.createCharacter(); p.removeBody(e.body); assert.equal(e.destroyed, true);
    const shot = p.createProjectile({ lifetime: 0.001 }); step(p); step(p); assert.equal(shot.destroyed, true); assert.equal(p.elements.fetchEntity(shot.entity_id), null);
    const prop = p.elements.createProp(); p.clearWorld(); assert.equal(prop.destroyed, true); assert.equal(p.getStatistics().entities, 0);
});
test('event-created entities stay pending until the command boundary', () => {
    const p = new physicsSystem(), trigger = p.elements.createTrigger(); p.createCharacter(); let child;
    trigger.on('contactBegin', () => { child = p.elements.createDecoration({ position: [100, 100] }); assert.ok(child.pending && !child.active); });
    step(p); assert.ok(child.pending); assert.equal(p.elements.fetchEntity(child.entity_id), null); step(p); assert.ok(child.registered && child.active && !child.pending);
});
test('entity subscriptions filter ownership, expose the official entities and unsubscribe', () => {
    const p = new physicsSystem(), trigger = p.elements.createTrigger(), actor = p.createCharacter(); let contacts = 0;
    const off = trigger.on('contactBegin', function (e) { assert.equal(this, trigger); assert.ok([e.entity_a, e.entity_b].includes(actor)); contacts++; });
    step(p); assert.equal(contacts, 1); off(); actor.setPosition([100, 0]); step(p); actor.setPosition([0, 0]); step(p); assert.equal(contacts, 1);
});
test('decorations have ordinary lifecycle and one shared spatial membership without contacts', () => {
    const p = new physicsSystem(), a = p.createCharacter({ position: [0, 0] }), d = p.elements.createDecoration({ position: [5, 0] });
    assert.equal(p.raycast({ from: [3, 0], to: [10, 0] }), null);
    const hit = p.elements.peruseNearbyEntities(a, { near_range: 10 }).find(h => h.entity === d); assert.ok(hit);
    assert.equal(p.getStatistics().spatial.instances, 2); d.deactivate(); assert.equal(p.elements.peruseNearbyEntities(a).length, 0);
});
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
test('failed subclass construction rolls back the base and nested children', () => {
    const p = new physicsSystem();
    class Broken extends gameCharacter { constructor(elements, packet) { super(elements, packet); elements.createDecoration(); throw new Error('failed setup'); } }
    p.elements.registerEntityType('broken', Broken);
    assert.throws(() => p.createEntity({ entity_type: 'broken' }), /failed setup/);
    assert.equal(p.getStatistics().bodies, 0); assert.equal(p.getStatistics().entities, 0); assert.equal(p.getStatistics().spatial.instances, 0);
    class Shadow extends gameCharacter { position = [1, 2]; }
    p.elements.registerEntityType('shadow', Shadow); assert.throws(() => p.createEntity({ entity_type: 'shadow' })); assert.equal(p.getStatistics().entities, 0);
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
test('construction rejects manual adoption and ignores overridden destroy during rollback', () => {
    const p = new physicsSystem(), body = p.createBody();
    assert.throws(() => p.createEntity({ body })); assert.throws(() => p.createEntity({ linked_object: {} }));
    assert.equal(p.getStatistics().bodies, 1); assert.equal(p.getStatistics().entities, 0);
    class Broken extends gameCharacter { constructor(e, packet) { super(e, packet); throw new Error('failed'); } destroy() {} }
    p.elements.registerEntityType('broken', Broken); assert.throws(() => p.createEntity({ entity_type: 'broken' })); assert.equal(p.getStatistics().bodies, 1);
    class SelfDestroyed extends gameCharacter { constructor(e, packet) { super(e, packet); this.destroy(); throw new Error('original failure'); } }
    p.elements.registerEntityType('self_destroyed', SelfDestroyed); assert.throws(() => p.createEntity({ entity_type: 'self_destroyed' }), /original failure/);
    assert.equal(p.getStatistics().bodies, 1);
});
test('end events retain an official destroyed identity rather than an orphan replacement', () => {
    const p = new physicsSystem(), trigger = p.elements.createTrigger(), character = p.createCharacter(); let ended;
    p.on('contactEnd', e => ended = e); step(p); character.destroy(); step(p);
    assert.ok([ended.entity_a, ended.entity_b].includes(character)); assert.equal(character.destroyed, true);
});
