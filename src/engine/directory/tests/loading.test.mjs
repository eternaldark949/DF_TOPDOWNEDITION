// ===== LV2 DIRECTORY =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlacement, resolveLayout, isMovable, validatePropCatalog, validateMapLayout } from '../index.mjs';

const catalog = { types: { crate: { defaults: { width: 20, height: 20, color: '#863' }, movable: true }, wall_lamp: { defaults: { width: 6, height: 6, light: { radius: 80 } } } } };

test('a placement resolves over its type defaults, and null removes a default', () => {
    assert.deepEqual(resolvePlacement({ type: 'crate', x: 4, y: 5, color: null, label: 'A' }, catalog.types), { width: 20, height: 20, x: 4, y: 5, label: 'A' });
    assert.throws(() => resolvePlacement({ type: 'nope', x: 0, y: 0 }, catalog.types), /Unknown prop type: nope/);
    const placed = resolvePlacement({ type: 'wall_lamp', x: 0, y: 0 }, catalog.types); placed.light.radius = 1;
    assert.equal(catalog.types.wall_lamp.defaults.light.radius, 80, 'results are detached from the catalog');
});

test('a layout resolves every placement and copies its other fields in authored order', () => {
    const layout = { map_id: 'm', props: [{ type: 'crate', x: 1, y: 2 }, { type: 'wall_lamp', x: 3, y: 4 }], spawns: [[0, 0]], notes: { a: 1 } };
    const out = resolveLayout(layout, catalog.types, { omit: ['map_id'] });
    assert.deepEqual(Object.keys(out), ['props', 'prop_types', 'spawns', 'notes']);
    assert.deepEqual(out.prop_types, ['crate', 'wall_lamp']);
    out.spawns[0][0] = 9; assert.equal(layout.spawns[0][0], 0);
    assert.equal(isMovable('crate', catalog.types), true); assert.equal(isMovable('wall_lamp', catalog.types), false); assert.equal(isMovable('nope', catalog.types), false);
});

test('structures reject malformed catalogs and layouts', () => {
    assert.equal(validatePropCatalog(catalog), catalog);
    assert.throws(() => validatePropCatalog({ types: { a: {} } }), /defaults/);
    assert.throws(() => validatePropCatalog({ types: { a: { defaults: {}, movable: 'yes' } } }), /movable/);
    assert.throws(() => validateMapLayout({ props: [{ type: 'crate', x: 1 }] }, catalog.types), /finite x and y/);
    assert.throws(() => validateMapLayout({ props: [{ type: 'nope', x: 1, y: 1 }] }, catalog.types), /unknown prop type/);
    assert.doesNotThrow(() => validateMapLayout({ props: [{ type: 'crate', x: 1, y: 1 }] }, catalog.types));
});
