// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldClock, readWorldClock, readTimeOfDay, WORLD_CLOCK } from '../index.mjs';

const PHASES = [{ name: 'dawn', from: '05:00', dark: 1 }, { name: 'day', from: '07:00', dark: 0, colors: { sky: '#1e8eff' } },
    { name: 'dusk', from: '17:30', dark: 0, colors: { sky: '#1e8eff' } }, { name: 'evening', from: '19:30', dark: .6, colors: { sky: '#1b2350' } }, { name: 'night', from: '21:00', dark: 1 }];

test('a clock reads its record and refuses what it does not know', () => {
    const c = new worldClock({ start: { year: 2087, month: 3, day: 9, time: '20:15:30' }, speed: 60 });
    assert.deepEqual([c.year, c.month, c.month_name, c.day, c.hour, c.minute, c.second], [2087, 3, 'March', 9, 20, 15, 30]);
    assert.equal(c.text(), '20:15'); assert.equal(c.text({ seconds: true }), '20:15:30'); assert.equal(c.date(), '3.9.2087');
    assert.equal(readTimeOfDay('05:30'), 19800); assert.equal(readTimeOfDay([1, 2, 3]), 3723);
    assert.throws(() => readTimeOfDay('25:00'), /time of day/); assert.throws(() => readWorldClock({ speeed: 1 }), /unknown field speeed/);
    assert.throws(() => readWorldClock({ start: { month: 2, day: 30 } }), /names a day/);
    assert.throws(() => readWorldClock({ phases: [{ name: 'a', from: '05:00' }, { name: 'b', from: '05:00' }] }), /same time/);
    assert.throws(() => readWorldClock({ phases: [{ name: 'a', from: '05:00', dark: 2 }] }), /dark is 0/);
    assert.equal(WORLD_CLOCK.months.length, 12);
});

test('time carries into days, months and years, with leap years', () => {
    const c = new worldClock({ start: { year: 2024, month: 2, day: 28, time: '23:59' }, speed: 60 });
    const days = []; c.on('day', d => days.push(`${d.month}.${d.day}`));
    c.updateState(1); assert.equal(c.text(), '00:00'); assert.deepEqual([c.month, c.day], [2, 29]);
    c.setTime({ time: '23:59' }); c.updateState(1); assert.deepEqual([c.month, c.day], [3, 1]);
    assert.deepEqual(days, ['2.29', '3.1']);
    c.setTime({ year: 2100, month: 2, day: 28, time: '23:00' }); c.updateState(60); assert.deepEqual([c.month, c.day], [3, 1]);   // (2100 is no leap year)
    c.setTime({ year: 2000, month: 2, day: 28, time: '23:00' }); c.updateState(60); assert.deepEqual([c.month, c.day], [2, 29]);  // (2000 is)
    c.setTime({ year: 1999, month: 12, day: 31, time: '23:30' }); c.updateState(30); assert.deepEqual([c.year, c.month, c.day], [2000, 1, 1]);
    c.setTime({ hour: 22, minute: 125 }); assert.equal(c.text(), '00:05'); assert.equal(c.day, 2);   // (minutes carry like the Python setTime)
});

test('phases come round the day, blend their darkness and colours, and are told as they pass', () => {
    const c = new worldClock({ start: { time: '04:00' }, speed: 3600, phases: PHASES });
    assert.equal(c.phase.name, 'night'); assert.equal(c.darkness, 1); assert.equal(c.phase.next, 'dawn');
    const seen = [], hours = []; c.on('phase', p => seen.push(`${p.previous}>${p.name}`)); c.on('hour', h => hours.push(h.hour));
    c.updateState(2); assert.equal(c.text(), '06:00'); assert.equal(c.phase.name, 'dawn'); assert.equal(c.darkness, .5);
    c.updateState(14); assert.equal(c.text(), '20:00'); assert.ok(c.is('evening'));
    assert.ok(Math.abs(c.darkness - (.6 + .4 / 3)) < 1e-9);
    assert.equal(c.color('sky'), '#1b2350');
    assert.deepEqual(seen, ['night>dawn', 'dawn>day', 'day>dusk', 'dusk>evening']);
    assert.deepEqual(hours, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    c.setTime({ time: '18:30' }); assert.equal(c.color('sky'), '#1d59a8'); assert.equal(c.darkness, .3);
    c.setTime({ time: '12:00' }); assert.equal(c.darkness, 0);
    assert.equal(new worldClock().phase.name, 'day'); assert.equal(new worldClock().darkness, 0);
});

test('a clock saves and restores, and a speed of 0 stops it', () => {
    const c = new worldClock({ start: { year: 5, month: 6, day: 7, time: '08:09:10' }, speed: 12, phases: PHASES }), saved = c.state();
    c.updateState(1000); assert.notEqual(c.text(), '08:09');
    c.restore(saved); assert.deepEqual(c.state(), saved); assert.ok(c.is('day'));
    c.setSpeed(0); assert.equal(c.updateState(10), 0); assert.equal(c.text({ seconds: true }), '08:09:10');
});
