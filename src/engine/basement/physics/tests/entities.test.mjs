// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, gameEntity, gameElements, gameCharacter, gameVehicle, gameProjectile, gameProp, gameStatic, gameTrigger, gameDecoration } from '../index.mjs';

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
test('failed subclass construction rolls back the base and nested children', () => {
    const p = new physicsSystem();
    class Broken extends gameCharacter { constructor(elements, packet) { super(elements, packet); elements.createDecoration(); throw new Error('failed setup'); } }
    p.elements.registerEntityType('broken', Broken);
    assert.throws(() => p.createEntity({ entity_type: 'broken' }), /failed setup/);
    assert.equal(p.getStatistics().bodies, 0); assert.equal(p.getStatistics().entities, 0); assert.equal(p.getStatistics().spatial.instances, 0);
    class Shadow extends gameCharacter { position = [1, 2]; }
    p.elements.registerEntityType('shadow', Shadow); assert.throws(() => p.createEntity({ entity_type: 'shadow' })); assert.equal(p.getStatistics().entities, 0);
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
test('getEntities reads each type\'s own list, kept as entities come and go', () => {
    const p = new physicsSystem();
    class Walker extends gameCharacter {} class Runner extends Walker {}
    p.elements.registerEntityType('walker', Walker); p.elements.registerEntityType('runner', Runner);
    const car = p.createVehicle(), w1 = p.createEntity({ entity_type: 'walker' }), r = p.createEntity({ entity_type: 'runner' }), c = p.createCharacter(), w2 = p.createEntity({ entity_type: 'walker' });
    assert.deepEqual(p.elements.getEntities(), [car, w1, r, c, w2]);
    assert.deepEqual(p.elements.getEntities({ entity_type: 'walker' }), [w1, w2]);
    assert.deepEqual(p.elements.getEntities({ instance_of: Walker }), [w1, w2, r]);
    assert.deepEqual(p.elements.getEntities({ instance_of: gameCharacter }).sort((a, b) => a.entity_id - b.entity_id), [w1, r, c, w2]);
    assert.deepEqual(p.elements.getEntities({ entity_type: 'walker', instance_of: gameVehicle }), []);
    assert.deepEqual(p.elements.getEntities({ instance_of: gameVehicle }), [car]);
    w1.destroy(); step(p);
    assert.deepEqual(p.elements.getEntities({ entity_type: 'walker' }), [w2]); assert.deepEqual(p.elements.getEntities({ instance_of: Walker }), [w2, r]);
    assert.throws(() => p.elements.getEntities({ instance_of: 'walker' }), /instance_of/);
});
test('an object reads and writes properties by key and says when one changes', () => {
    const p = new physicsSystem(), e = p.elements.createProp({ position: [0, 0], data: { health: 10 } }), heard = [];
    e.on('propertyChanged', ({ key, value, previous }) => heard.push([key, value, previous]));
    assert.equal(e.get('health'), 10); assert.equal(e.get('armor', 3), 3); assert.equal(e.has('armor'), false);
    e.set('health', 4).set('on', false).set('health', 4); step(p);
    assert.deepEqual(heard, [['health', 4, 10], ['on', false, undefined]]); assert.equal(e.getState().data.health, 4);
    e.set('on', undefined); assert.equal(e.has('on'), false);
    assert.throws(() => e.set('__proto__', 1), /property key/); assert.throws(() => e.get(''), /property key/);
});
test('an object places itself and converts points between its frame and the world', () => {
    const p = new physicsSystem(), e = p.elements.createProp({ position: [0, 0] }), close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} != ${b}`));
    e.moveTo(10, 20).rotateTo(Math.PI / 2); step(p);
    close(e.position, [10, 20]); close(e.toWorld([5, 0]), [10, 25]); close(e.toLocal([10, 25]), [5, 0]);
    assert.equal(e.distanceTo([13, 24]), 5); close(e.directionTo([13, 24]), [.6, .8]); assert.deepEqual(e.directionTo([10, 20]), [0, 0]);
    const other = p.elements.createProp({ position: [10, 30] }); assert.equal(e.distanceTo(other), 10);
});
test('an object parents children at a local offset and lets them go', () => {
    const p = new physicsSystem(), car = p.elements.createProp({ position: [0, 0], collision_group: 0 }), lamp = p.elements.createProp({ position: [50, 50], collision_group: 0 });
    car.attach(lamp, { at: [5, 0] }); step(p);
    assert.equal(lamp.parent, car); assert.deepEqual(car.children, [lamp]); assert.deepEqual([...lamp.position], [5, 0]);
    car.moveTo(100, 0); step(p); assert.deepEqual([...lamp.position], [105, 0]);
    assert.throws(() => lamp.detach(car), /not attached/);
    assert.equal(car.detach(lamp), true); step(p);
    assert.equal(lamp.parent, null); assert.deepEqual(car.children, []); assert.equal(lamp.detach(), false);
});
