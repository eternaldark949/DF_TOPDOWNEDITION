// ===== LV0 BASEMENT =====
// The UI's data: what a screen (a context) and its items may hold, checked once when a screen is defined, the
// menu bindings every game starts from, and the named animations items and screens can play.

/** The item types. Focusable ones take focus and the menu actions; the rest show things. */
export const ITEM_TYPES = Object.freeze(['button', 'label', 'list', 'slider', 'toggle', 'image', 'bar', 'panel', 'input']);
export const FOCUSABLE = Object.freeze(['button', 'slider', 'toggle', 'input']);
/** The states an item's style can change in, in the order they are laid over its own style. */
export const ITEM_STATES = Object.freeze(['inactive', 'active', 'focus', 'hover', 'pressed']);
export const ANCHORS = Object.freeze(['top_left', 'top', 'top_right', 'left', 'centre', 'right', 'bottom_left', 'bottom', 'bottom_right']);
export const LAYOUTS = Object.freeze(['list', 'grid', 'free']);
export const TRANSITIONS = Object.freeze(['none', 'fade', 'slide']);
/** What an `on_click`, `on_hover`, `on_focus` or `on_change` may do: one of these verbs, or a list of them. */
export const VERBS = Object.freeze(['open', 'back', 'close', 'event', 'set', 'focus']);
const EVENTS = ['on_click', 'on_hover', 'on_focus', 'on_change'];

/** The menu actions, live in the `menu` input context. A game may bind its own; these are where it starts. */
export const UI_BINDINGS = Object.freeze({
    ui_up: [['ArrowUp', 'repeat'], ['w', 'repeat'], 'gamepadDUp'],
    ui_down: [['ArrowDown', 'repeat'], ['s', 'repeat'], 'gamepadDDown'],
    ui_left: [['ArrowLeft', 'repeat'], ['a', 'repeat'], 'gamepadDLeft'],
    ui_right: [['ArrowRight', 'repeat'], ['d', 'repeat'], 'gamepadDRight'],
    ui_accept: ['Enter', 'space', 'e', 'gamepadA'],
    ui_back: ['Escape', 'Backspace', 'gamepadB', 'gamepadStart']
});
export const UI_ACTIONS = Object.freeze(Object.keys(UI_BINDINGS));

/** Named animations: keyframes for the Web Animations API, played for `seconds` (with `delay` and `stagger`). */
export const ANIMATIONS = Object.freeze({
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide_left: [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }],
    slide_right: [{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
    slide_up: [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }],
    slide_down: [{ opacity: 0, transform: 'translateY(-22px)' }, { opacity: 1, transform: 'none' }],
    pop: [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1.03)', offset: .7 }, { opacity: 1, transform: 'none' }],
    pulse: [{ transform: 'none' }, { transform: 'scale(1.06)' }, { transform: 'none' }],
    press: [{ transform: 'none' }, { transform: 'scale(.95)' }, { transform: 'none' }],
    glow: [{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }],
    shake: [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }]
});

const fail = (where, message) => { throw new TypeError(`${where}: ${message}`); };
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string';
const seconds = v => Number.isFinite(v) && v >= 0;
const NAME = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const ID = /^[a-z0-9_][a-z0-9_.-]*$/i;

function readStyle(style, where) {
    if (style === undefined) return;
    if (!plain(style)) fail(where, 'a style is an object of CSS properties');
    for (const [k, v] of Object.entries(style)) if (!/^-?-?[a-z][a-z0-9-]*$/i.test(k) || !(text(v) || Number.isFinite(v))) fail(where, `style ${k} must be a CSS property with a text or number value`);
}
function readAnimation(a, where) {
    if (!plain(a) || !Object.hasOwn(ANIMATIONS, a.name)) fail(where, `an animation is { name, seconds?, delay?, stagger? }, name one of ${Object.keys(ANIMATIONS).join(', ')}`);
    for (const k of ['seconds', 'delay', 'stagger']) if (a[k] !== undefined && !seconds(a[k])) fail(where, `${k} is seconds`);
    for (const k of Object.keys(a)) if (!['name', 'seconds', 'delay', 'stagger', 'easing'].includes(k)) fail(where, `unknown animation field ${k}`);
}
/** Throws unless `action` is one verb, or a list of them. */
export function readAction(action, where = 'action') {
    if (Array.isArray(action)) { action.forEach((a, i) => readAction(a, `${where}[${i}]`)); return action; }
    if (!plain(action)) fail(where, `an action is an object with one of ${VERBS.join(', ')}`);
    const verbs = Object.keys(action).filter(k => VERBS.includes(k));
    if (verbs.length !== 1) fail(where, `an action has exactly one of ${VERBS.join(', ')}`);
    const [verb] = verbs;
    if (verb === 'back' && action.back !== true) fail(where, 'back is true');
    if (verb !== 'back' && !text(action[verb])) fail(where, `${verb} names a ${verb === 'event' ? 'game event' : verb === 'set' ? 'value path' : verb === 'focus' ? 'item' : 'screen'}`);
    for (const k of Object.keys(action)) if (k !== verb && !(['event', 'open'].includes(verb) && k === 'data') && !(verb === 'set' && k === 'value')) fail(where, `unknown action field ${k}`);
    return action;
}
const LAYOUT_FIELDS = ['kind', 'direction', 'spacing', 'align', 'justify', 'columns', 'wrap'];
function readLayout(layout, where) {
    if (layout === undefined) return;
    if (!plain(layout) || !LAYOUTS.includes(layout.kind ?? 'list')) fail(where, `a layout is { kind: ${LAYOUTS.join(' | ')}, direction?, spacing?, align?, columns? }`);
    for (const k of Object.keys(layout)) if (!LAYOUT_FIELDS.includes(k)) fail(where, `unknown layout field ${k}`);
    if (layout.direction !== undefined && !['column', 'row'].includes(layout.direction)) fail(where, 'direction is column or row');
    if (layout.spacing !== undefined && layout.spacing !== 'auto' && !(Number.isFinite(layout.spacing) && layout.spacing >= 0)) fail(where, 'spacing is "auto" or pixels');
    if (layout.align !== undefined && !['start', 'centre', 'end', 'stretch'].includes(layout.align)) fail(where, 'align is start, centre, end or stretch');
    if (layout.justify !== undefined && !['start', 'centre', 'end'].includes(layout.justify)) fail(where, 'justify is start, centre or end');
    if (layout.columns !== undefined && !(Number.isInteger(layout.columns) && layout.columns > 0)) fail(where, 'columns is a whole number');
    if (layout.wrap !== undefined && typeof layout.wrap !== 'boolean') fail(where, 'wrap is true or false');
}
function readPosition(position, where) {
    if (position === undefined) return;
    if (!plain(position) || !ANCHORS.includes(position.anchor)) fail(where, `a position is { anchor: ${ANCHORS.join(' | ')}, offset?: [x, y] }`);
    if (position.offset !== undefined && !(Array.isArray(position.offset) && position.offset.length === 2 && position.offset.every(Number.isFinite))) fail(where, 'offset is [x, y] in pixels');
    for (const k of Object.keys(position)) if (!['anchor', 'offset'].includes(k)) fail(where, `unknown position field ${k}`);
}
const ITEM_FIELDS = ['id', 'type', 'text', 'value', 'value_text', 'position', 'style', 'class', 'states', 'animations', 'enabled', 'visible', 'focusable', 'items', 'layout', 'from', 'template', 'empty', 'min', 'max', 'step', 'choices', 'src', 'placeholder', 'on_text', 'off_text', ...EVENTS];
const TEMPLATE_FIELDS = ITEM_FIELDS.filter(k => !['id', 'from', 'template', 'empty'].includes(k));
function readItem(item, where, ids, template = false) {
    if (!plain(item)) fail(where, 'an item is an object');
    if (!template) { if (!text(item.id) || !ID.test(item.id)) fail(where, 'an item needs an id (letters, digits, _ . -)'); if (ids.has(item.id)) fail(where, `item id ${item.id} is used twice`); ids.add(item.id); }
    if (!ITEM_TYPES.includes(item.type)) fail(where, `type is one of ${ITEM_TYPES.join(', ')}`);
    for (const k of Object.keys(item)) if (!(template ? TEMPLATE_FIELDS : ITEM_FIELDS).includes(k)) fail(where, `unknown item field ${k}`);
    for (const k of ['text', 'value_text', 'class', 'src', 'placeholder', 'on_text', 'off_text', 'from']) if (item[k] !== undefined && !text(item[k])) fail(where, `${k} is text`);
    for (const k of ['enabled', 'visible', 'focusable']) if (item[k] !== undefined && typeof item[k] !== 'boolean' && !text(item[k])) fail(where, `${k} is true, false or a "{value}" it reads`);
    for (const k of ['min', 'max', 'step']) if (item[k] !== undefined && !Number.isFinite(item[k])) fail(where, `${k} is a number`);
    if (item.choices !== undefined && (!Array.isArray(item.choices) || !item.choices.length || !item.choices.every(c => text(c) || Number.isFinite(c) || typeof c === 'boolean' || plain(c) && Object.hasOwn(c, 'value') && (c.text === undefined || text(c.text))))) fail(where, 'choices is a list of values or { value, text }');
    readPosition(item.position, `${where}.position`); readStyle(item.style, `${where}.style`); readLayout(item.layout, `${where}.layout`);
    if (item.states !== undefined) { if (!plain(item.states)) fail(where, 'states is { state: style }'); for (const [s, style] of Object.entries(item.states)) { if (!ITEM_STATES.includes(s)) fail(where, `state ${s} is not one of ${ITEM_STATES.join(', ')}`); readStyle(style, `${where}.states.${s}`); } }
    if (item.animations !== undefined) { if (!plain(item.animations)) fail(where, 'animations is { enter?, leave?, hover?, click? }'); for (const [k, a] of Object.entries(item.animations)) { if (!['enter', 'leave', 'hover', 'click', 'focus'].includes(k)) fail(where, `unknown animation moment ${k}`); readAnimation(a, `${where}.animations.${k}`); } }
    for (const k of EVENTS) if (item[k] !== undefined) readAction(item[k], `${where}.${k}`);
    if (item.items !== undefined) {
        if (!['panel', 'list'].includes(item.type)) fail(where, 'only a panel or a list holds items');
        if (!Array.isArray(item.items)) fail(where, 'items is a list');
        item.items.forEach((child, i) => readItem(child, `${where}.items[${i}]`, ids));
    }
    if (item.from !== undefined || item.template !== undefined) {
        if (item.type !== 'list') fail(where, 'only a list is filled from a value');
        if (!text(item.from) || !plain(item.template)) fail(where, 'a filled list has from ("{value}" naming a list) and a template item');
        readItem(item.template, `${where}.template`, ids, true);
        if (item.empty !== undefined && !text(item.empty)) fail(where, 'empty is the text shown when the list has nothing');
    }
    if (item.type === 'slider' && item.choices === undefined && (item.min === undefined || item.max === undefined)) fail(where, 'a slider has min and max, or choices');
}
const SCREEN_FIELDS = ['kind', 'name', 'items', 'layout', 'focus', 'transition', 'pauses_game', 'controls', 'modal', 'closes_on_back', 'open_with', 'style', 'class', 'css', 'layer'];
/**
 * Throws unless `screen` is a UI context: { name, items, layout?, focus?, transition?: {in?, out?}, pauses_game?, controls?,
 * modal?, closes_on_back?, open_with?, style?, class?, css?, layer? }. Returns it.
 */
export function readScreen(screen, where = 'screen') {
    if (!plain(screen)) fail(where, 'a screen is an object');
    if (!text(screen.name) || !NAME.test(screen.name)) fail(where, 'a screen needs a name (lower case words joined by _, pages by .: pause.settings)');
    for (const k of Object.keys(screen)) if (!SCREEN_FIELDS.includes(k)) fail(where, `unknown screen field ${k}`);
    if (!Array.isArray(screen.items)) fail(where, 'items is a list');
    const ids = new Set(); screen.items.forEach((item, i) => readItem(item, `${where}.items[${i}]`, ids));
    readLayout(screen.layout, `${where}.layout`); readStyle(screen.style, `${where}.style`);
    if (screen.focus !== undefined && (!text(screen.focus) || !ids.has(screen.focus))) fail(where, `focus names one of its items`);
    if (screen.transition !== undefined) {
        if (!plain(screen.transition)) fail(where, 'transition is { in?, out? }');
        for (const [k, t] of Object.entries(screen.transition)) {
            if (!['in', 'out'].includes(k)) fail(where, `unknown transition ${k}`);
            if (!plain(t) || !TRANSITIONS.includes(t.kind) || t.seconds !== undefined && !seconds(t.seconds) || t.from !== undefined && !['left', 'right', 'top', 'bottom'].includes(t.from)) fail(where, `transition.${k} is { kind: ${TRANSITIONS.join(' | ')}, seconds?, from?: left | right | top | bottom }`);
        }
    }
    for (const k of ['pauses_game', 'modal', 'closes_on_back']) if (screen[k] !== undefined && typeof screen[k] !== 'boolean') fail(where, `${k} is true or false`);
    for (const k of ['controls', 'open_with', 'class']) if (screen[k] !== undefined && !text(screen[k])) fail(where, `${k} is text`);
    if (screen.css !== undefined && !text(screen.css) && !(Array.isArray(screen.css) && screen.css.every(text))) fail(where, 'css is text, or a list of rules');
    if (screen.layer !== undefined && !Number.isInteger(screen.layer)) fail(where, 'layer is a whole number (higher draws over lower)');
    return screen;
}
