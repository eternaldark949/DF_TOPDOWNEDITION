// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsSystem } from '../../physics/index.mjs';
import { streetNetwork } from '../streets.mjs';

// A crossroads: two roads, one lane each way, a junction where they cross, a crosswalk across each of its four
// arms and pavements running along the roads' sides.
const crossroads = {
    streets: {
        roads: [{ id: 'EW', lanes: 1, lane_width: 40, stops: [[0, 500], [1000, 500]] }, { id: 'NS', lanes: 1, lane_width: 40, stops: [[500, 0], [500, 1000]] }],
        intersections: [{ id: 'X', x: 450, y: 450, w: 100, h: 100 }]
    },
    crosswalks: [
        { x: 410, y: 450, w: 40, h: 100, orientation: 'V' }, { x: 550, y: 450, w: 40, h: 100, orientation: 'V' },
        { x: 450, y: 410, w: 100, h: 40, orientation: 'H' }, { x: 450, y: 550, w: 100, h: 40, orientation: 'H' }
    ],
    pavements: [{ x: 0, y: 410, w: 410, h: 40 }, { x: 590, y: 410, w: 410, h: 40 }, { x: 0, y: 550, w: 410, h: 40 }, { x: 590, y: 550, w: 410, h: 40 }]
};

test('roads become lanes each way on the right, joined through the junction by turns under its signals', () => {
    const net = streetNetwork(crossroads), kinds = {};
    for (const l of net.lanes) kinds[l.kind + (l.turn ? ':' + l.turn : '')] = (kinds[l.kind + (l.turn ? ':' + l.turn : '')] ?? 0) + 1;
    assert.equal(kinds.road, 8, 'four arms, a lane each way');
    assert.deepEqual([kinds['turn:straight'], kinds['turn:right'], kinds['turn:left']], [4, 4, 4], 'every arm goes on, right and left, and never back');
    const pos = new Map(net.nodes.map(n => [n.node_id, n.position]));
    const east = net.lanes.find(l => l.kind === 'road' && l.road === 'EW' && l.to_junction === 'X' && pos.get(l.to)[0] > pos.get(l.from)[0]);
    assert.equal(pos.get(east.from)[1], 520, 'eastbound keeps to the right of the centreline (y down)');
    assert.deepEqual(net.junctions.map(j => j.phases.length), [4], 'a phase for each way in');
    assert.ok(east.stops.some(s => s.signal_id) && east.stops.some(s => s.walkway_id), 'a car stops for its light and for the crosswalk');
    const light = east.stops.find(s => s.signal_id), walk = east.stops.find(s => s.walkway_id);
    assert.ok(light.distance <= walk.distance + 1e-9, 'the stop line is before the crosswalk');
});

test('the network drives and walks: a car turns through the junction, someone on foot crosses the road', () => {
    const net = streetNetwork(crossroads), roads = new physicsSystem().navigation.roads;
    for (const n of net.nodes) roads.addNode(n.node_id, n);
    for (const l of net.lanes) roads.addLane(l.lane_id, l);
    const drive = roads.findRoute({ from: [100, 520], to: [520, 900], profile: 'car' });
    assert.ok(drive && drive.lanes.some(id => id.includes('>')), 'west arm to south arm by a turn');
    assert.ok(drive.points.every(p => p[0] <= 541 && p[1] >= 499), 'a right turn, kept to its side');
    const walk = roads.findRoute({ from: [100, 430], to: [100, 570], profile: 'foot', near_range: 30 });
    assert.ok(walk && walk.lanes.some(id => id.startsWith('cross')), 'across by a crosswalk');
    const crossing = net.crossings.find(c => walk.lanes.includes(c.lane_id));
    assert.ok(crossing.waits_for.length > 0, 'and it waits for the lights of the road it crosses');
});
