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

test('people on foot steer round posts on the pavement and round each other, instead of walking into them', () => {
    const contacts = avoid => {
        const { physics, agents, run } = world({ people: { network: 'foot', count: 24, speed: 70, avoid } }, { seed: 7 });
        // A post in the middle of every pavement between junctions, and one more a third of the way along.
        const posts = [];
        for (const c of [400, 1200, 2000, 2800]) for (const m of [800, 1600, 2400, 640, 1440, 2240]) for (const at of [[m, c - 70], [m, c + 70], [c - 70, m], [c + 70, m]])
            posts.push(physics.elements.createEntity({ kind: 'static', position: at, collision_shape: { shape_type: 'circle', radius: 6 } }));
        agents.populate({ focus: [1600, 1600] });
        let touching = 0;
        const step = () => { for (const a of agents.agents) for (const p of posts) if (Math.hypot(a.entity.position[0] - p.position[0], a.entity.position[1] - p.position[1]) < 14.5) touching++; };
        for (let t = 0; t < 30; t += 1 / 30) { run(1 / 30); step(); }
        const people = agents.agents.map(a => a.entity.position); let close = 0;
        for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) if (Math.hypot(people[i][0] - people[j][0], people[i][1] - people[j][1]) < 15) close++;
        const trips = agents.getStatistics().trips; agents.dispose();
        return { touching, close, trips };
    };
    const blind = contacts(false), aware = contacts(true); if (process.env.SHOW) console.log(JSON.stringify({ blind, aware }));
    assert.ok(blind.touching > 30, `without avoidance they walk into the posts (${blind.touching} steps touching)`);
    assert.ok(aware.touching < blind.touching / 8, `with it they go round (${aware.touching} steps touching, ${blind.touching} without)`);
    assert.ok(aware.trips >= blind.trips * .8, `and still get where they are going (${aware.trips} trips, ${blind.trips} without)`);
});

test('cars go into a junction only on their own green (a crosswalk on the stop line does not hide the light)', () => {
    const { agents, run } = world({ cars: { network: 'car', count: 14, speed: 160 } });
    const net = town(), boxes = net.junctions.map(j => ({ j, a: j.area })), signals = net.signals;
    agents.populate({ focus: [1600, 1600] });
    const was = new Map(), bad = []; let entered = 0;
    for (let t = 0; t < 40; t += 1 / 30) {
        run(1 / 30);
        for (const a of agents.agents) {
            const [x, y] = a.entity.position, box = boxes.find(b => x > b.a.left && x < b.a.right && y > b.a.top && y < b.a.bottom);
            if (box && !was.get(a.entity)) {
                // its way in: the light of this junction that faces the way it drives
                const heading = Math.atan2(a.entity.linear_velocity[1], a.entity.linear_velocity[0]), turn = s => Math.abs(Math.atan2(Math.sin(s.rotation - heading), Math.cos(s.rotation - heading)));
                const way = signals.filter(s => s.junction_id === box.j.junction_id).sort((p, q) => turn(p) - turn(q))[0];
                if (way && turn(way) < .5) { entered++; if (agents.getLight(way.signal_id) === 'stop') bad.push({ t: +t.toFixed(2), sig: way.signal_id, at: [x, y].map(Math.round), v: a.entity.linear_velocity.map(Math.round) }); }
            }
            was.set(a.entity, !!box);
        }
    }
    // (one already over its line when the light changed may still roll in slowly behind the car ahead, to clear the crossing)
    assert.deepEqual(bad.filter(b => Math.hypot(...b.v) > 60), [], 'no car drives in on its red'); assert.ok(entered > 10, `cars went through junctions (${entered})`);
});

test('the all-red holds while a car is still in the junction, and the walk waits for it', () => {
    const { physics, agents } = world({}, { signals: { green: 2, clear: 1, walk: 3, hold: 2, flash: 1 } });
    const j = town().junctions.find(x => x.junction_id === 'X1200_1200'), ids = j.phases.map(p => p[0]);
    // run to a clear, then park a car in the middle of the box
    let t = 0; while (!ids.some(id => agents.getLight(id) === 'amber') && t < 30) { agents.updateState(.1, {}); t += .1; }
    const car = physics.elements.createEntity({ kind: 'vehicle', position: [1200, 1200], mass: 1000, collision_shape: { shape_type: 'box', dimensions: [56, 28] } });
    physics.updateState(1 / 30);
    for (let s = 0; s < 20; s += .1) { agents.updateState(.1, {}); assert.ok(ids.every(id => agents.getSignal(id) === 'stop'), 'nobody gets a green while a car is in the box'); }
    car.destroy(); physics.updateState(1 / 30);
    let green = false; for (let s = 0; s < 3; s += .1) { agents.updateState(.1, {}); green ||= ids.some(id => agents.getSignal(id) === 'go') || agents.getWalk('cross0') !== 'wait'; }
    assert.ok(green, 'once it is out the lights move on');
});

test('the lights look as they are: a head and a stop bar for each way in and walk strips at each crossing, round the focus', () => {
    const placed = [];
    const { agents } = world({}, { looks: { head: 'head', bar: 'bar', strip: 'strip' } });
    agents.dispose();
    const physics = new physicsSystem();
    const looks = new agentSystem(physics, { network: town(), profiles: {}, spawn: () => null, near: 300, far: 600, gone: 900, looks: { head: 'head', bar: 'bar', strip: 'strip' },
        place: (template, { position, rotation, values }) => { const e = physics.elements.createEntity({ kind: 'decoration', position, rotation }); placed.push({ template, e, values }); return e; } });
    looks.updateState(1 / 30, { focus: [1200, 1200] });
    const count = k => placed.filter(p => p.template === k && !p.e.destroyed).length;
    assert.ok(count('head') >= 4 && count('head') === count('bar'), `heads and bars (${count('head')}, ${count('bar')})`);
    assert.ok(count('strip') >= 8, `strips (${count('strip')})`);
    const bar = placed.find(p => p.template === 'bar'); assert.ok(bar.values.right > 10 && bar.values.left === -bar.values.right);
    // each look shows its light: one of go, amber and red set on a head; walk, flash or wait on a strip
    for (let s = 0; s < 30; s += .5) {
        looks.updateState(.5, { focus: [1200, 1200] });
        for (const p of placed) if (!p.e.destroyed) {
            const on = (p.template === 'strip' ? ['walk', 'flash', 'wait'] : ['go', 'amber', 'red']).filter(k => p.e.get(k));
            assert.equal(on.length, 1, `${p.template} shows one light (${on})`);
        }
    }
    looks.updateState(1 / 30, { focus: [3200 * 4, 3200 * 4] }); for (let i = 0; i < 40; i++) looks.updateState(1 / 30, { focus: [3200 * 4, 3200 * 4] });
    assert.equal(placed.filter(p => !p.e.destroyed).length, 0, 'taken away far behind the focus');
    looks.dispose();
});
