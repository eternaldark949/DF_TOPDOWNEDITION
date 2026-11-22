// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { controlSystem } from '../../controls/index.mjs';
import { uiSystem, readScreen } from '../index.mjs';

const PAUSE = {
    name: 'pause', modal: true, pauses_game: true, controls: 'menu', open_with: 'pause', focus: 'resume',
    items: [
        { id: 'title', type: 'label', text: 'Paused' },
        { id: 'resume', type: 'button', text: 'Resume', on_click: { close: 'pause' } },
        { id: 'save', type: 'button', text: 'Save', enabled: '{can_save}', on_click: { event: 'save' } },
        { id: 'settings', type: 'button', text: 'Settings', on_click: { open: 'pause.settings' } },
        { id: 'quit', type: 'button', text: 'Quit', on_click: [{ event: 'quit', data: { from: '{data.place}' } }, { close: 'pause' }] }
    ]
};
const SETTINGS = {
    name: 'pause.settings', modal: true, controls: 'menu',
    items: [
        { id: 'music', type: 'toggle', text: 'Music', value: '{options.music}' },
        { id: 'volume', type: 'slider', text: 'Volume', min: 0, max: 1, step: .25, value: '{options.volume}' },
        { id: 'speed', type: 'slider', text: 'Speed', choices: [{ value: 1, text: 'Normal' }, { value: 4, text: 'Fast' }], value: '{options.speed}' },
        { id: 'back', type: 'button', text: 'Back', on_click: { back: true } }
    ]
};
const HUD = { name: 'hud', items: [{ id: 'money', type: 'label', text: '${player.money}' }, { id: 'clock', type: 'label', text: '{clock}' }] };

function setup() {
    const controls = new controlSystem({ keymap: { pause: ['Escape'], interact: ['e'] }, event_target: null, document: null });
    const pauses = [];
    const ui = new uiSystem({ controls, pause: reason => { pauses.push(reason); return () => pauses.splice(pauses.indexOf(reason), 1); }, values: { options: { music: true, volume: .5, speed: 1 }, can_save: false } });
    ui.define(PAUSE, SETTINGS, HUD);
    const key = (k, held = false) => { controls.setInput('keyboard', k, true); if (!held) controls.setInput('keyboard', k, false); ui.updateState(); controls.generateGhostImage(); };
    return { controls, ui, pauses, key };
}

test('a screen opens from its open_with action, pauses the game and switches to the menu controls', () => {
    const { ui, controls, pauses, key } = setup();
    assert.equal(controls.input_context, 'gameplay');
    key('Escape');
    assert.deepEqual(ui.stack, ['pause']);
    assert.deepEqual(pauses, ['ui:pause']);
    assert.equal(controls.input_context, 'menu');
    assert.equal(ui.get('resume').focused, true);
    key('Escape');                                   // ui_back in the menu context
    assert.deepEqual(ui.stack, []); assert.deepEqual(pauses, []); assert.equal(controls.input_context, 'gameplay');
});

test('up and down move focus, skip what is inactive and wrap; accept presses', () => {
    const { ui, key } = setup();
    ui.open('pause');
    key('ArrowDown'); assert.equal(ui.get('settings').focused, true, 'save is inactive, so it is skipped');
    key('ArrowDown'); assert.equal(ui.get('quit').focused, true);
    key('ArrowDown'); assert.equal(ui.get('resume').focused, true, 'focus wraps');
    key('ArrowUp'); assert.equal(ui.get('quit').focused, true);
    ui.setValue('can_save', true); ui.updateState();
    key('ArrowUp'); key('ArrowUp'); assert.equal(ui.get('save').focused, true, 'save is live once can_save is true');
    let saved = 0; ui.on('save', () => saved++);
    key('Enter'); assert.equal(saved, 1);
});

test('pages open on the stack and Back returns along it, with focus kept', () => {
    const { ui, key } = setup();
    ui.open('pause'); ui.focus('settings'); key('Enter');
    assert.deepEqual(ui.stack, ['pause', 'pause.settings']);
    assert.equal(ui.get('music').focused, true);
    key('Escape'); assert.deepEqual(ui.stack, ['pause']); assert.equal(ui.get('settings').focused, true);
    ui.open('pause.settings'); ui.close('pause'); assert.deepEqual(ui.stack, [], 'closing a screen closes the pages above it');
});

test('toggles and sliders change with left, right and accept, writing their bound values', () => {
    const { ui, key } = setup();
    const sets = []; ui.on('set', s => sets.push(s));
    ui.open('pause.settings');
    key('Enter'); assert.equal(ui.getValue('options.music'), false);
    key('ArrowDown'); key('ArrowRight'); assert.equal(ui.getValue('options.volume'), .75);
    key('ArrowRight'); key('ArrowRight'); assert.equal(ui.getValue('options.volume'), 1, 'a slider stops at its max');
    key('ArrowDown'); key('ArrowRight'); assert.equal(ui.getValue('options.speed'), 4);
    key('ArrowRight'); assert.equal(ui.getValue('options.speed'), 1, 'choices go round');
    assert.deepEqual(sets.map(s => s.path), ['options.music', 'options.volume', 'options.volume', 'options.speed', 'options.speed']);
    ui.setValue('options.music', true); ui.updateState(); assert.equal(ui.get('music').value, true, 'a bound item follows its value');
});

test('text reads live values, providers and the data a screen was opened with', () => {
    const { ui } = setup();
    let money = 40; ui.provide('player', () => ({ money })); ui.provide('clock', () => '21:30');
    ui.open('hud'); assert.equal(ui.get('money').text, '$40'); assert.equal(ui.get('clock').text, '21:30');
    money = 55; ui.updateState(); assert.equal(ui.get('money').text, '$55');
    const quits = []; ui.on('quit', e => quits.push(e.data.from));
    ui.open('pause', { place: 'Silver Queen' }); ui.press('quit');
    assert.deepEqual(quits, ['Silver Queen']); assert.deepEqual(ui.stack, ['hud'], 'a list of actions runs in order');
    assert.equal(ui.back(), false, 'the HUD is not modal: Back leaves it');
});

test('a list is filled from a value, one item per entry, and rebuilt when it changes', () => {
    const { ui, key } = setup();
    ui.define({ name: 'saves', modal: true, controls: 'menu', items: [{ id: 'slots', type: 'list', from: '{saves}', empty: 'No saves', template: { type: 'button', text: '{item.label} ({index})', on_click: { event: 'load', data: { slot: '{item.slot}' } } } }] });
    ui.setValue('saves', [{ slot: 1, label: 'Night one' }, { slot: 2, label: 'Docks' }]);
    ui.open('saves');
    assert.equal(ui.get('slots').count, 2); assert.equal(ui.get('slots.1').text, 'Docks (1)');
    const loads = []; ui.on('load', e => loads.push(e.data.slot));
    key('ArrowDown'); key('Enter'); assert.deepEqual(loads, [2]);
    ui.setValue('saves', [{ slot: 3, label: 'New' }]); ui.updateState();
    assert.equal(ui.get('slots').count, 1); assert.equal(ui.get('slots.0').focused, true, 'focus moves off an entry that went away');
});

test('items change live through set; hidden items take no focus', () => {
    const { ui, key } = setup();
    ui.open('pause');
    ui.set('resume', 'text', 'Continue'); assert.equal(ui.get('resume').text, 'Continue');
    ui.set('settings', 'visible', false); key('ArrowDown'); assert.equal(ui.get('quit').focused, true);
    assert.throws(() => ui.set('resume', 'type', 'label'), /cannot change/);
});

test('readScreen refuses what a screen cannot hold, and says why', () => {
    assert.throws(() => readScreen({ name: 'Pause', items: [] }), /needs a name/);
    assert.throws(() => readScreen({ name: 'p', items: [{ id: 'a', type: 'knob' }] }), /type is one of/);
    assert.throws(() => readScreen({ name: 'p', items: [{ id: 'a', type: 'button', on_click: { open: 'x', back: true } }] }), /exactly one/);
    assert.throws(() => readScreen({ name: 'p', items: [{ id: 'a', type: 'label' }, { id: 'a', type: 'label' }] }), /used twice/);
    assert.throws(() => readScreen({ name: 'p', focus: 'b', items: [{ id: 'a', type: 'button' }] }), /focus names/);
    assert.throws(() => readScreen({ name: 'p', items: [{ id: 's', type: 'slider' }] }), /min and max/);
    assert.throws(() => readScreen({ name: 'p', items: [{ id: 'a', type: 'button', animations: { enter: { name: 'spin' } } }] }), /animation/);
    assert.doesNotThrow(() => readScreen(PAUSE));
});

test('dispose releases the pauses it holds', () => {
    const { ui, pauses } = setup();
    ui.open('pause'); assert.equal(pauses.length, 1);
    ui.dispose(); assert.equal(pauses.length, 0); assert.throws(() => ui.open('pause'), /disposed/);
});
