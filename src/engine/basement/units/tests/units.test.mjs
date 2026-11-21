// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS_PER_METRE, metres, centimetres, toMetres, isLength, readLength, readLengths } from '../index.mjs';

test('one world unit everywhere: metres and centimetres turn into world units and back', () => {
    assert.equal(metres(1), UNITS_PER_METRE); assert.equal(centimetres(100), UNITS_PER_METRE); assert.equal(toMetres(metres(1.75)), 1.75);
    assert.throws(() => metres('3'), /finite/); assert.throws(() => toMetres(NaN), /finite/);
});
test('data writes lengths as "3 m" or "24 cm", and numbers stay world units', () => {
    assert.equal(readLength('3 m'), metres(3)); assert.equal(readLength('1.75m'), metres(1.75)); assert.equal(readLength('24 cm'), centimetres(24)); assert.equal(readLength('-2 m'), -metres(2));
    assert.equal(readLength(12), 12); assert.ok(isLength('3 m')); assert.ok(!isLength('3 metres')); assert.ok(!isLength('Room 3 m north'));
    assert.throws(() => readLength('three metres'), /world units/); assert.throws(() => readLength(null), /world units/);
    assert.deepEqual(readLengths({ height: '1.75 m', parts: [{ at: ['10 cm', 0] }], name: 'tall 3 m', layers: 3 }), { height: metres(1.75), parts: [{ at: [centimetres(10), 0] }], name: 'tall 3 m', layers: 3 });
});
