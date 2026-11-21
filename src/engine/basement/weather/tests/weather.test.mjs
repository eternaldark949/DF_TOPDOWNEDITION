// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldWeather, readWorldWeather, WORLD_WEATHER } from '../index.mjs';

const RECORD = { states: { clear: {}, rain: { particles: [{ system: 'weather:rain', area: 'view' }] }, snow: { particles: [{ system: { density: 4, look: { shape: 'dot' } }, area: 'view' }] } },
    start: { state: 'rain', intensity: 'normal' }, fade: 4 };

test('a weather record is read, and what it does not know is refused', () => {
    const r = readWorldWeather(RECORD);
    assert.deepEqual(Object.keys(r.states), ['clear', 'rain', 'snow']); assert.equal(r.intensities.hellish, 3, 'the Python four by default');
    assert.equal(WORLD_WEATHER.start.state, 'clear');
    assert.throws(() => readWorldWeather({ storms: 1 }), /unknown field storms/);
    assert.throws(() => readWorldWeather({ ...RECORD, start: { state: 'hail' } }), /start/);
    assert.throws(() => readWorldWeather({ states: { rain: { particles: [{ system: 3 }] } }, start: { state: 'rain' } }), /system/);
    assert.throws(() => readWorldWeather({ ...RECORD, intensities: { normal: -1 } }), /intensities/);
});

test('changing the weather fades the old state out and the new one in, and the intensity across', () => {
    const w = new worldWeather(RECORD), changes = [];
    w.on('change', c => changes.push(`${c.previous.state}/${c.previous.intensity}>${c.state}/${c.intensity}`));
    assert.deepEqual(w.amounts(), { clear: 0, rain: 1, snow: 0 });
    w.set('snow', 'hellish'); assert.equal(w.state, 'snow'); assert.ok(w.changing);
    w.updateState(2); assert.ok(Math.abs(w.amount('rain') - .5 * 2) < 1e-9, 'half gone, at a scale halfway to hellish'); assert.ok(Math.abs(w.amount('snow') - .5 * 2) < 1e-9);
    w.updateState(2); assert.deepEqual(w.amounts(), { clear: 0, rain: 0, snow: 3 }); assert.equal(w.changing, false);
    w.set('clear', 'light', { fade: 0 }); assert.deepEqual(w.amounts(), { clear: .35, rain: 0, snow: 0 }, 'a fade of 0 changes at once');
    w.set('clear', 'light'); assert.deepEqual(changes, ['rain/normal>snow/hellish', 'snow/hellish>clear/light'], 'told of changes only');
    assert.throws(() => w.set('hail'), /Unknown weather: hail/); assert.throws(() => w.set('rain', 'biblical'), /intensity/);
    const saved = w.save(); w.set('rain', 'heavy', { fade: 0 }); w.restore(saved); assert.deepEqual(w.save(), { state: 'clear', intensity: 'light' }); assert.equal(w.changing, false);
});
