// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem, gameEntity, gameElements, KINDS } from '../index.mjs';

const step = p => p.updateState();
test('every kind makes one gameEntity, registered once by construction', () => {
    const p = new physicsSystem(), kinds = Object.keys(KINDS);
    for (const kind of kinds) {
        const entity = p.elements.createEntity({ kind, position: [100, 100] });
        assert.equal(Object.getPrototypeOf(entity), gameEntity.prototype); assert.equal(entity.kind, kind); assert.ok(entity.active && entity.registered && !entity.pending);
        assert.equal(p.elements.fetchEntity(entity.entity_id), entity); assert.equal(p.fetchBody(entity.body_id), entity.body);
        assert.equal(p.elements.getEntityForBody(entity.body), entity);
        assert.equal(entity.motor === null, KINDS[kind].motor === null, `${kind} motor`); assert.equal(entity.awareness !== null, KINDS[kind].awareness, `${kind} awareness`);
    }
    assert.equal(p.getStatistics().entities, kinds.length); assert.equal(p.getStatistics().spatial.instances, kinds.length);
});
test('direct construction registers too, and there are no entity subclasses', () => {
    const p = new physicsSystem(), e = new gameEntity(p.elements), c = new gameEntity(p.elements, { kind: 'character' });
    assert.equal(p.elements.fetchEntity(e.entity_id), e); assert.equal(p.elements.fetchEntity(c.entity_id), c); assert.ok(c.motor);
    class Guard extends gameEntity {}
    assert.throws(() => new Guard(p.elements), /no entity subclasses/); assert.equal(p.getStatistics().entities, 2);
    assert.throws(() => new gameElements(p), /already owns/);
});
test('a kind is a preset: a record overrides its body defaults and switches parts on or off', () => {
    const p = new physicsSystem();
    const crate = p.createEntity({ kind: 'prop', physics_type: 'static' }); assert.equal(crate.physics_type, 'static'); assert.equal(crate.motor, null);
    const rider = p.createEntity({ kind: 'prop', motor: 'character', awareness: true }); assert.ok(rider.motor.setMovement); assert.ok(rider.awareness);
    const statue = p.createEntity({ kind: 'character', motor: null, awareness: false }); assert.equal(statue.motor, null); assert.equal(statue.awareness, null);
    p.elements.defineKind('turret', { body: { physics_type: 'static' }, motor: null, awareness: true });
    const turret = p.createEntity({ kind: 'turret' }); assert.equal(turret.kind, 'turret'); assert.equal(turret.physics_type, 'static'); assert.ok(turret.awareness);
    assert.ok(p.elements.listKinds().includes('turret'));
    assert.throws(() => p.elements.defineKind('turret', {}), /already defined/); assert.throws(() => p.elements.defineKind('bad', { motor: 'hover' }), /motor/);
    assert.throws(() => p.elements.defineKind('bad', { colour: 'red' }), /Unknown kind field/); assert.throws(() => p.createEntity({ kind: 'nothing' }), /Unknown kind/);
    assert.throws(() => p.createEntity({ motor: 'hover' }), /motor/);
});
test('identity, controllers and transforms cannot be shadowed by gameplay fields', () => {
    const p = new physicsSystem(), e = p.createEntity({ kind: 'character' });
    for (const key of ['entity_id', 'body_id', 'body', 'motor', 'position', 'rotation', 'mass', 'linear_velocity', 'collision_shape']) {
        assert.throws(() => e[key] = 123); assert.throws(() => Object.defineProperty(e, key, { value: 123 }));
    }
    for (const key of ['x', 'y', 'vx', 'vy', 'velX', 'velY', 'angularVel', 'collisionMask']) assert.throws(() => e[key] = 10);
    assert.throws(() => e.position[0] = 10); e.data.health = 10; assert.equal(e.getState().data.health, 10);
});
test('deactivation and activation update the same body, controller, registry and spatial entry', () => {
    const p = new physicsSystem(), e = p.createEntity({ kind: 'character',  position: [100, 0] }), body = e.body, controller = e.motor;
    e.deactivate(); assert.equal(e.active, false); assert.equal(p.getStatistics().spatial.instances, 0); assert.equal(p.elements.fetchEntity(e.entity_id), e);
    e.activate(); assert.equal(e.active, true); assert.equal(e.body, body); assert.equal(e.motor, controller); assert.equal(p.getStatistics().spatial.instances, 1);
});
test('destruction removes constraints and scoped subscriptions; it is idempotent', () => {
    const p = new physicsSystem(), e = p.createEntity({ kind: 'prop', position: [0, 0] });
    e.createConstraint({ world_target: [10, 0] }); let heard = 0; e.on('probe', () => heard++);
    const body = e.body; e.destroy(); e.destroy(); p._emit('probe', { body }); step(p);
    assert.equal(heard, 0); assert.equal(e.destroyed, true); assert.equal(e.registered, false); assert.equal(e.active, false);
    assert.equal(e.getState().body, null); assert.equal(p.elements.fetchEntity(e.entity_id), null); assert.equal(p.getStatistics().constraints, 0);
    assert.throws(() => e.activate()); assert.throws(() => e.on('probe', () => {}));
});
test('body removal, clear and projectile expiry cannot leave orphan entities', () => {
    const p = new physicsSystem(), e = p.createEntity({ kind: 'character' }); p.removeBody(e.body); assert.equal(e.destroyed, true);
    const shot = p.createEntity({ kind: 'projectile',  lifetime: 0.001 }); step(p); step(p); assert.equal(shot.destroyed, true); assert.equal(p.elements.fetchEntity(shot.entity_id), null);
    const prop = p.elements.createEntity({ kind: 'prop' }); p.clearWorld(); assert.equal(prop.destroyed, true); assert.equal(p.getStatistics().entities, 0);
});
test('event-created entities stay pending until the command boundary', () => {
    const p = new physicsSystem(), trigger = p.elements.createEntity({ kind: 'trigger' }); p.createEntity({ kind: 'character' }); let child;
    trigger.on('contactBegin', () => { child = p.elements.createEntity({ kind: 'decoration',  position: [100, 100] }); assert.ok(child.pending && !child.active); });
    step(p); assert.ok(child.pending); assert.equal(p.elements.fetchEntity(child.entity_id), null); step(p); assert.ok(child.registered && child.active && !child.pending);
});
test('entity subscriptions filter ownership, expose the official entities and unsubscribe', () => {
    const p = new physicsSystem(), trigger = p.elements.createEntity({ kind: 'trigger' }), actor = p.createEntity({ kind: 'character' }); let contacts = 0;
    const off = trigger.on('contactBegin', function (e) { assert.equal(this, trigger); assert.ok([e.entity_a, e.entity_b].includes(actor)); contacts++; });
    step(p); assert.equal(contacts, 1); off(); actor.setPosition([100, 0]); step(p); actor.setPosition([0, 0]); step(p); assert.equal(contacts, 1);
});
test('decorations have ordinary lifecycle and one shared spatial membership without contacts', () => {
    const p = new physicsSystem(), a = p.createEntity({ kind: 'character',  position: [0, 0] }), d = p.elements.createEntity({ kind: 'decoration',  position: [5, 0] });
    assert.equal(p.raycast({ from: [3, 0], to: [10, 0] }), null);
    const hit = p.elements.peruseNearbyEntities(a, { near_range: 10 }).find(h => h.entity === d); assert.ok(hit);
    assert.equal(p.getStatistics().spatial.instances, 2); d.deactivate(); assert.equal(p.elements.peruseNearbyEntities(a).length, 0);
});
test('failed construction rolls back its body and refuses manual adoption', () => {
    const p = new physicsSystem();
    assert.throws(() => p.createEntity({ kind: 'character', motion: { motion_type: 'wander' } }), /motion_type/);
    assert.equal(p.getStatistics().bodies, 0); assert.equal(p.getStatistics().entities, 0); assert.equal(p.getStatistics().spatial.instances, 0);
    const body = p.createBody();
    assert.throws(() => p.createEntity({ body })); assert.throws(() => p.createEntity({ linked_object: {} }));
    assert.equal(p.getStatistics().bodies, 1); assert.equal(p.getStatistics().entities, 0);
});
test('end events retain an official destroyed identity rather than an orphan replacement', () => {
    const p = new physicsSystem(), trigger = p.elements.createEntity({ kind: 'trigger' }), character = p.createEntity({ kind: 'character' }); let ended;
    p.on('contactEnd', e => ended = e); step(p); character.destroy(); step(p);
    assert.ok([ended.entity_a, ended.entity_b].includes(character)); assert.equal(character.destroyed, true);
});
test('getEntities reads each kind\'s and each tag\'s own list, kept as entities come and go', () => {
    const p = new physicsSystem();
    const car = p.createEntity({ kind: 'vehicle' }), w1 = p.createEntity({ kind: 'character', tags: ['walker'] }), lamp = p.createEntity({ kind: 'prop', tags: ['lamp', 'walker'] }), c = p.createEntity({ kind: 'character' }), w2 = p.createEntity({ kind: 'character', tags: ['walker'] });
    assert.deepEqual(p.elements.getEntities(), [car, w1, lamp, c, w2]);
    assert.deepEqual(p.elements.getEntities({ kind: 'character' }), [w1, c, w2]);
    assert.deepEqual(p.elements.getEntities({ tag: 'walker' }), [w1, lamp, w2]);
    assert.deepEqual(p.elements.getEntities({ kind: 'character', tag: 'walker' }), [w1, w2]);
    assert.deepEqual(p.elements.getEntities({ tag: 'none' }), []);
    w1.destroy(); step(p); assert.deepEqual(p.elements.getEntities({ tag: 'walker' }), [lamp, w2]);
    c.updateBody({ tags: ['walker'] }); assert.deepEqual(p.elements.getEntities({ tag: 'walker' }).length, 3);
    lamp.updateBody({ tags: [] }); assert.deepEqual(p.elements.getEntities({ tag: 'walker' }).sort((a, b) => a.entity_id - b.entity_id), [c, w2]);
});
test('an object reads and writes properties by key and says when one changes', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ kind: 'prop',  position: [0, 0], data: { health: 10 } }), heard = [];
    e.on('propertyChanged', ({ key, value, previous }) => heard.push([key, value, previous]));
    assert.equal(e.get('health'), 10); assert.equal(e.get('armor', 3), 3); assert.equal(e.has('armor'), false);
    e.set('health', 4).set('on', false).set('health', 4); step(p);
    assert.deepEqual(heard, [['health', 4, 10], ['on', false, undefined]]); assert.equal(e.getState().data.health, 4);
    e.set('on', undefined); assert.equal(e.has('on'), false);
    assert.throws(() => e.set('__proto__', 1), /property key/); assert.throws(() => e.get(''), /property key/);
});
test('an object places itself and converts points between its frame and the world', () => {
    const p = new physicsSystem(), e = p.elements.createEntity({ kind: 'prop',  position: [0, 0] }), close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} != ${b}`));
    e.moveTo(10, 20).rotateTo(Math.PI / 2); step(p);
    close(e.position, [10, 20]); close(e.toWorld([5, 0]), [10, 25]); close(e.toLocal([10, 25]), [5, 0]);
    assert.equal(e.distanceTo([13, 24]), 5); close(e.directionTo([13, 24]), [.6, .8]); assert.deepEqual(e.directionTo([10, 20]), [0, 0]);
    const other = p.elements.createEntity({ kind: 'prop',  position: [10, 30] }); assert.equal(e.distanceTo(other), 10);
});
test('an object parents children at a local offset and lets them go', () => {
    const p = new physicsSystem(), car = p.elements.createEntity({ kind: 'prop',  position: [0, 0], collision_group: 0 }), lamp = p.elements.createEntity({ kind: 'prop',  position: [50, 50], collision_group: 0 });
    car.attach(lamp, { at: [5, 0] }); step(p);
    assert.equal(lamp.parent, car); assert.deepEqual(car.children, [lamp]); assert.deepEqual([...lamp.position], [5, 0]);
    car.moveTo(100, 0); step(p); assert.deepEqual([...lamp.position], [105, 0]);
    assert.throws(() => lamp.detach(car), /not attached/);
    assert.equal(car.detach(lamp), true); step(p);
    assert.equal(lamp.parent, null); assert.deepEqual(car.children, []); assert.equal(lamp.detach(), false);
});
