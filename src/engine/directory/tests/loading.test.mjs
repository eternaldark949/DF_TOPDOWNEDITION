// ===== LV2 DIRECTORY =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlacement, resolveLayout, resolvePropLook, isMovable, validatePropCatalog, validateMapLayout } from '../index.mjs';

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

test('a family declares a look schema; types are presets of it and placements set its fields one by one', () => {
    const families = { round_table: { look: { top: { kind: 'color', default: '#4a2c1a' }, cups: { kind: 'integer', default: 2, min: 0, max: 4 }, setting: { kind: 'choice', values: ['candle', 'books'], default: 'candle' }, cloths: { kind: 'colors', default: ['#fff'] } } } };
    const props = { families, types: { cafe_table: { defaults: { width: 40, height: 40, family: 'round_table', look: { top: '#6e4529', cups: 3 } } } } };
    assert.equal(validatePropCatalog(props), props);
    const placed = resolvePlacement({ type: 'cafe_table', x: 0, y: 0, look: { cups: 1, setting: 'books' } }, props.types);
    assert.deepEqual(placed.look, { top: '#6e4529', cups: 1, setting: 'books' }, 'a placement look merges over the preset field by field');
    assert.deepEqual(resolvePlacement({ type: 'cafe_table', x: 0, y: 0, look: { cups: null } }, props.types).look, { top: '#6e4529' }, 'null hands a field back to the family default');
    assert.deepEqual(resolvePropLook(families, 'round_table', placed.look), { top: '#6e4529', cups: 1, setting: 'books', cloths: ['#fff'] });
    assert.equal(props.types.cafe_table.defaults.look.cups, 3, 'the catalog is never changed');
    assert.throws(() => resolvePropLook(families, 'round_table', { legs: 4 }), /unknown look field legs/);
    assert.throws(() => resolvePropLook(families, 'round_table', { cups: 9 }), /cups must be an integer in 0..4/);
    assert.throws(() => resolvePropLook(families, 'round_table', { setting: 'cake' }), /one of candle, books/);
    assert.throws(() => resolvePropLook(families, 'round_table', { top: 'walnut' }), /top must be a color/);
    assert.throws(() => resolvePropLook(families, 'stool'), /Unknown prop family/);
    assert.throws(() => validatePropCatalog({ families, types: { t: { defaults: { family: 'stool' } } } }), /unknown family stool/);
    assert.throws(() => validatePropCatalog({ families, types: { t: { defaults: { family: 'round_table', look: { cups: 'two' } } } } }), /cups/);
    assert.throws(() => validatePropCatalog({ families: { f: { look: { a: { kind: 'shade', default: 1 } } } }, types: {} }), /needs a kind/);
    assert.throws(() => validatePropCatalog({ families: { f: { look: { a: { kind: 'number', default: 'x' } } } }, types: {} }), /default is not a number/);
    assert.throws(() => validateMapLayout({ props: [{ type: 'cafe_table', x: 1, y: 1, look: { glaze: '#fff' } }] }, props.types, 'cafe', families), /cafe: placement 0 \(cafe_table\): unknown look field glaze/);
    assert.doesNotThrow(() => validateMapLayout({ props: [{ type: 'cafe_table', x: 1, y: 1, look: { cups: null, top: '#000' } }] }, props.types, 'cafe', families));
});
