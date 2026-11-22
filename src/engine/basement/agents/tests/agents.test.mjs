// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../physics/index.mjs';
import { streetNetwork } from '../../maps/index.mjs';
import { agentSystem, readAgents } from '../index.mjs';

// A town of three by three blocks: four roads each way, lights at every crossing, crosswalks on every arm.
function town() {
    const roads = [], intersections = [], crosswalks = [], pavements = [], at = [400, 1200, 2000, 2800];
    at.forEach((c, i) => { roads.push({ id: `H${i}`, lanes: 1, lane_width: 40, stops: [[0, c], [3200, c]] }, { id: `V${i}`, lanes: 1, lane_width: 40, stops: [[c, 0], [c, 3200]] }); });
    for (const x of at) for (const y of at) {
        intersections.push({ id: `X${x}_${y}`, x: x - 50, y: y - 50, w: 100, h: 100 });
        crosswalks.push({ x: x - 90, y: y - 50, w: 40, h: 100, orientation: 'V' }, { x: x + 50, y: y - 50, w: 40, h: 100, orientation: 'V' }, { x: x - 50, y: y - 90, w: 100, h: 40, orientation: 'H' }, { x: x - 50, y: y + 50, w: 100, h: 40, orientation: 'H' });
    }
    for (const y of at) for (let i = 0; i < at.length - 1; i++) pavements.push({ x: at[i] + 90, y: y - 90, w: at[i + 1] - at[i] - 180, h: 40 }, { x: at[i] + 90, y: y + 50, w: at[i + 1] - at[i] - 180, h: 40 });
    for (const x of at) for (let i = 0; i < at.length - 1; i++) pavements.push({ x: x - 90, y: at[i] + 90, w: 40, h: at[i + 1] - at[i] - 180 }, { x: x + 50, y: at[i] + 90, w: 40, h: at[i + 1] - at[i] - 180 });
    return streetNetwork({ streets: { roads, intersections }, crosswalks, pavements });
}
function world(profiles, settings = {}) {
    const physics = new physicsSystem(), made = [];
    const spawn = (name, profile, { position, rotation }) => {
        const e = profile.network === 'car'
            ? physics.elements.createEntity({ kind: 'vehicle', position, rotation, mass: 1000, collision_shape: { shape_type: 'box', dimensions: [56, 28] }, vehicle_template: { max_speed: 200, wheel_base: 36 } })
            : physics.elements.createEntity({ kind: 'character', position, rotation, collision_shape: { shape_type: 'circle', radius: 8 }, movement: { max_speed: 90 } });
        made.push(e); return e;
    };
    const agents = new agentSystem(physics, { network: town(), profiles, spawn, near: 300, far: 1400, gone: 2000, trip: [400, 1800], ...settings });
    const run = (seconds, focus = [1600, 1600]) => { for (let t = 0; t < seconds; t += 1 / 30) { agents.updateState(1 / 30, { focus }); physics.updateState(1 / 30); } };
    return { physics, agents, run, made };
}

test('the lights cycle: one way into a junction is green at a time, with all red between', () => {
    const { agents } = world({});
    const ids = [0, 1, 2, 3].map(n => `X1200_1200/${n}`);
    const seen = new Set();
    for (let t = 0; t < 40; t += .5) {
        agents.updateState(.5, {});
        const green = ids.filter(id => agents.getSignal(id) === 'go');
        assert.ok(green.length <= 1); seen.add(green.join() || 'red');
    }
    assert.deepEqual([...seen].sort(), ['red', ...ids].sort(), 'every phase, and the clear');
});

test('cars and walkers appear round the focus, make their trips and never sit in each other', () => {
    const { physics, agents, run } = world({ cars: { network: 'car', count: 8, speed: 160 }, people: { network: 'foot', count: 10, speed: 70 } });
    agents.populate({ focus: [1600, 1600] });
    assert.deepEqual(agents.getStatistics().by_profile, { cars: 8, people: 10 });
    const start = new Map(agents.agents.map(a => [a.entity, [...a.entity.position]]));
    run(20);
    const moved = agents.agents.filter(a => start.has(a.entity) && Math.hypot(a.entity.position[0] - start.get(a.entity)[0], a.entity.position[1] - start.get(a.entity)[1]) > 100);
    assert.ok(moved.length >= 10, `most went somewhere (${moved.length})`);
    const cars = agents.agents.filter(a => a.name === 'cars').map(a => a.entity.position);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i][0] - cars[j][0], cars[i][1] - cars[j][1]) > 20, 'no two cars in one place');
    const s = agents.getStatistics(); assert.ok(s.trips >= 18 && s.agents === 18, JSON.stringify(s));
    assert.ok(physics.navigation.roads.getStatistics().lanes > 0);
    agents.dispose();
    assert.equal(physics.navigation.roads.getStatistics().lanes, 0); assert.equal(physics.navigation.roads.getStatistics().nodes, 0); assert.equal(agents.getStatistics().agents, 0);
    // A street brought to life again (the map entered again) lays the same lanes anew.
    const again = new agentSystem(physics, { network: town(), profiles: { cars: { network: 'car', count: 2 } }, spawn: (n, p, pose) => physics.elements.createEntity({ kind: 'vehicle', ...pose, mass: 1000, collision_shape: { shape_type: 'box', dimensions: [56, 28] }, vehicle_template: { max_speed: 200, wheel_base: 36 } }) });
    again.populate({ focus: [1600, 1600] }); assert.equal(again.getStatistics().agents, 2); again.dispose();
});

test('far behind the focus they go, and new ones come out of sight round it', () => {
    const { agents, run } = world({ cars: { network: 'car', count: 6 } });
    agents.populate({ focus: [600, 600] });
    run(2, [2700, 2700]);
    for (const a of agents.agents) assert.ok(Math.hypot(a.entity.position[0] - 2700, a.entity.position[1] - 2700) <= 2000 + 400);
    assert.ok(agents.getStatistics().gone >= 1);
});

test('an agents record is checked: unknown fields and bad numbers are refused', () => {
    assert.ok(readAgents({ settings: { signals: { green: 5 } }, profiles: { cars: { network: 'car', count: 4 } } }));
    assert.throws(() => readAgents({ profiles: { cars: { colour: 'red' } } }), /unknown field colour/);
    assert.throws(() => readAgents({ settings: { radius: 3 }, profiles: {} }), /unknown setting radius/);
    assert.throws(() => readAgents({ profiles: { cars: { count: -1 } } }), /count is a number/);
});
