// ===== LV0 BASEMENT =====
// The UI system: one overlay over the game. Screens (contexts) are data, defined once and opened along a stack;
// the menu actions move focus and press items; items read live values ("{player.money}") and do what their data
// says ({open}, {back}, {close}, {event}, {set}, {focus}). It works without a page (the state alone, for tests and
// servers); given a root element it draws every screen as page elements with CSS through uiView.
import { readScreen, readAction, FOCUSABLE, UI_BINDINGS, UI_ACTIONS } from './values.mjs';
import { uiView } from './ui-view.mjs';

const TEMPLATE = /\{([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)\}/gi;
const WHOLE = /^\{([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)\}$/i;
const walk = (from, path) => { let v = from; for (const k of path) { if (v === null || v === undefined) return undefined; v = v[k]; } return v; };
const shown = v => v === undefined || v === null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : String(v);

export class uiSystem {
    #screens = new Map(); #stack = []; #listeners = new Map(); #providers = new Map(); #store; #controls; #pause; #view = null;
    #base_input = null; #disposed = false; #serial = 0;

    /**
     * `controls` is the engine's controlSystem (menu actions are read from it and its `menu` input context is used
     * while a screen asks for it); `root` is the element the UI draws into (none: no drawing); `pause(reason)` is the
     * engine's pause, called for screens with pauses_game; `values` is the store items read and set.
     */
    constructor({ controls = null, root = null, pause = null, values = {} } = {}) {
        if (pause !== null && typeof pause !== 'function') throw new TypeError('pause is the engine\'s pause(reason)');
        if (!values || typeof values !== 'object') throw new TypeError('values is an object');
        this.#controls = controls; this.#pause = pause; this.#store = values;
        if (controls && !Object.hasOwn(controls.contexts ?? {}, 'menu')) controls.defineContext?.('menu', UI_BINDINGS);
        if (root) this.#view = new uiView(root, {
            hover: (screen, node, on) => { node.hovered = on; if (on) { if (this.#focusable(node) && screen === this.#target()) this.#setFocus(screen, node); this.#runEvent(screen, node, 'on_hover'); this.#view.play(node, 'hover'); } },
            press: (screen, node, on) => { node.pressed = on; },
            click: (screen, node) => { if (screen === this.#target() || !screen.record.modal) this.#activate(screen, node); },
            input: (screen, node, value) => this.#change(screen, node, value),
            wheel: () => {}
        });
    }
    get disposed() { return this.#disposed; }
    /** The element the UI draws into, or null when it only keeps state. */
    get root() { return this.#view?.root ?? null; }

    // ── Screens ─────────────────────────────────────────────────────────
    /** Adds screens from data (each checked by readScreen). A name defined again is replaced. */
    define(...screens) {
        this.#live();
        for (const screen of screens.flat()) { readScreen(screen, `screen ${screen?.name ?? '?'}`); this.#screens.set(screen.name, structuredClone(screen)); }
        return this;
    }
    /** The defined screens' names. */
    list() { return [...this.#screens.keys()]; }
    /** The names of the open screens, bottom to top. */
    get stack() { return this.#stack.map(s => s.name); }
    get top() { return this.#stack.at(-1)?.name ?? null; }
    isOpen(name) { return this.#stack.some(s => s.name === name); }

    /** Opens a screen on top of the stack with its `data` (read as "{data.x}"); an open screen comes back to the top. */
    open(name, data = {}) {
        this.#live();
        const record = this.#screens.get(name); if (!record) throw new TypeError(`Unknown screen ${name} (defined: ${this.list().join(', ') || 'none'})`);
        const already = this.#stack.find(s => s.name === name);
        if (already) { this.#stack.splice(this.#stack.indexOf(already), 1); this.#stack.push(already); already.data = data; this.#sync(); return this; }
        const screen = { name, record, data, serial: ++this.#serial, nodes: new Map(), roots: [], focus: null, resume: null, element: null };
        screen.roots = record.items.map(item => this.#node(screen, item, null));
        this.#stack.push(screen);
        this.#refresh(screen, true);
        this.#view?.openScreen(screen, this.#stack.length);
        const first = record.focus ? screen.nodes.get(record.focus) : null;
        this.#setFocus(screen, first && this.#focusable(first) ? first : this.#order(screen)[0] ?? null, { quiet: true });
        if (record.pauses_game && this.#pause) screen.resume = this.#pause(`ui:${name}`);
        this.#sync(); this.#emit('open', { screen: name, data });
        return this;
    }
    /** Closes a screen and every screen opened above it. */
    close(name) {
        this.#live();
        const index = this.#stack.findIndex(s => s.name === name); if (index < 0) return false;
        for (const screen of this.#stack.splice(index).reverse()) {
            try { screen.resume?.(); } finally { screen.resume = null; this.#view?.closeScreen(screen); }
            this.#emit('close', { screen: screen.name });
        }
        this.#sync(); return true;
    }
    /** Closes the top modal screen (a page goes back to the one beneath). False when there is none to close. */
    back() {
        const screen = [...this.#stack].reverse().find(s => s.record.modal);
        if (!screen || screen.record.closes_on_back === false) return false;
        return this.close(screen.name);
    }

    // ── Items ───────────────────────────────────────────────────────────
    /** Moves focus to an item (on the top screen that has it, or on `screen`). */
    focus(id, screen = null) { const [s, node] = this.#find(id, screen); if (!this.#focusable(node)) return false; this.#setFocus(s, node); this.#sync(); return true; }
    /** An item as it is now: { id, type, text, value, enabled, visible, focused, hovered, pressed }. */
    get(id, screen = null) {
        const [s, node] = this.#find(id, screen);
        return Object.freeze({ id: node.id, type: node.def.type, screen: s.name, text: node.text, value: node.value, enabled: node.enabled, visible: node.visible, focused: s.focus === node, hovered: !!node.hovered, pressed: !!node.pressed, count: node.children.length });
    }
    /** Changes an item live: any of its data fields (text, value, enabled, visible, style, states, on_click, …). */
    set(id, key, value, screen = null) {
        const [s, node] = this.#find(id, screen);
        if (['id', 'type', 'items', 'from', 'template'].includes(key)) throw new TypeError(`An item's ${key} cannot change; define the screen again`);
        if (/^on_/.test(key)) readAction(value, `${id}.${key}`);
        node.def = { ...node.def, [key]: structuredClone(value) };
        this.#refresh(s); this.#sync(); return this;
    }
    /** Presses an item as a click would (for touch screens, tests and scripted UI). */
    press(id, screen = null) { const [s, node] = this.#find(id, screen); return this.#activate(s, node); }

    /** Loads fonts for the screens' CSS: each { family, src, weight?, style? }. Without a page it does nothing. Resolves when all can be drawn. */
    async addFonts(...fonts) {
        this.#live();
        for (const f of fonts.flat()) if (!f || typeof f.family !== 'string' || !f.family || typeof f.src !== 'string' || !f.src) throw new TypeError('A font is { family, src, weight?, style? }');
        if (!this.#view) return false;
        return (await Promise.all(fonts.flat().map(f => this.#view.addFont(f)))).every(Boolean);
    }

    // ── Values ──────────────────────────────────────────────────────────
    /** Reads a value by its path ("options.volume"): a provider's first, then the store. */
    getValue(path) {
        const parts = String(path).split('.'), provider = this.#providers.get(parts[0]);
        if (provider) { const v = typeof provider === 'function' ? provider() : provider; return walk(v, parts.slice(1)); }
        return walk(this.#store, parts);
    }
    /** Writes a value into the store by its path, making the objects on the way; items reading it change. */
    setValue(path, value) {
        const parts = String(path).split('.'); if (this.#providers.has(parts[0])) throw new TypeError(`${parts[0]} is provided by the game; it cannot be set from the UI`);
        let at = this.#store; for (const k of parts.slice(0, -1)) { if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new TypeError('Invalid value path'); if (!at[k] || typeof at[k] !== 'object') at[k] = {}; at = at[k]; }
        at[parts.at(-1)] = value; this.#emit('set', { path, value }); return this;
    }
    /** Hands the UI live game data under a name: `provide('clock', () => engine.time.text())` makes "{clock}" read it. */
    provide(name, source) {
        if (typeof name !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(name)) throw new TypeError('A provider has a plain name');
        if (source === null) { this.#providers.delete(name); return this; }
        this.#providers.set(name, source); return this;
    }
    /** Listens for a UI event: the game's own ({event: "resume"}) and open, close, focus, click, change, set. Returns a call that stops. */
    on(event, fn) {
        if (typeof fn !== 'function') throw new TypeError('A UI listener is a function');
        const set = this.#listeners.get(event) ?? new Set(); set.add(fn); this.#listeners.set(event, set);
        return () => set.delete(fn);
    }

    // ── Each poll (the Lobby calls it in the input phase, paused or not) ──
    updateState() {
        this.#live();
        const c = this.#controls;
        if (c) {
            // The menu actions in the order they came (two quick presses between polls both count), each on the screen on top then.
            const rows = c.queue.filter(row => UI_ACTIONS.includes(row[0])); c.queue = c.queue.filter(row => !UI_ACTIONS.includes(row[0]));
            for (const [action] of rows) {
                const target = this.#target(); if (!target) break;
                if (action === 'ui_up') this.#move(target, -1, 'up');
                else if (action === 'ui_down') this.#move(target, 1, 'down');
                else if (action === 'ui_left') this.#side(target, -1);
                else if (action === 'ui_right') this.#side(target, 1);
                else if (action === 'ui_accept') { if (target.focus) this.#activate(target, target.focus); }
                else if (action === 'ui_back') this.back();
            }
        }
        if (c) for (const record of this.#screens.values()) if (record.open_with && !this.isOpen(record.name) && c.readQueue(record.open_with)) this.open(record.name);
        for (const screen of this.#stack) this.#refresh(screen);
        this.#sync();
    }
    dispose() {
        if (this.#disposed) return;
        try { for (const s of [...this.#stack].reverse()) s.resume?.(); this.#view?.dispose(); }
        finally { this.#stack.length = 0; this.#listeners.clear(); this.#disposed = true; }
    }

    // ── Inside ──────────────────────────────────────────────────────────
    #live() { if (this.#disposed) throw new Error('uiSystem is disposed'); }
    #emit(event, payload) { for (const fn of [...(this.#listeners.get(event) ?? [])]) fn(payload); }
    #find(id, name) {
        const screens = name ? this.#stack.filter(s => s.name === name) : [...this.#stack].reverse();
        for (const s of screens) { const node = s.nodes.get(id); if (node) return [s, node]; }
        throw new TypeError(`No open screen has an item ${id}`);
    }
    #node(screen, def, parent, entry = null, index = 0) {
        const id = entry ? `${parent.id}.${index}` : def.id;
        const node = { id, def, parent, entry, index, children: [], text: '', value: undefined, enabled: true, visible: true, source: undefined, hovered: false, pressed: false, rendered: null, element: null };
        screen.nodes.set(id, node);
        if (def.items) node.children = def.items.map(child => this.#node(screen, child, node));
        return node;
    }
    #drop(screen, node) { for (const child of node.children) this.#drop(screen, child); screen.nodes.delete(node.id); if (screen.focus === node) screen.focus = null; }
    /** What "{x}" means for a node: its list entry (item.*, index), the screen's data (data.*), its own value, then the values. */
    #read(screen, node, path) {
        const [head, ...rest] = path.split('.');
        if (head === 'item') { const e = this.#entry(node); return e ? walk(e.entry, rest) : undefined; }
        if (head === 'index' && !rest.length) return this.#entry(node)?.index;
        if (head === 'data') return walk(screen.data, rest);
        if (head === 'value' && !rest.length) return node.value;
        return this.getValue(path);
    }
    #entry(node) { for (let n = node; n; n = n.parent) if (n.entry) return n; return null; }
    /** A field read: a lone "{x}" gives x itself; text with "{x}" in it gives the text with each filled in. */
    #resolve(screen, node, value) {
        if (typeof value !== 'string') return value;
        const whole = WHOLE.exec(value); if (whole) return this.#read(screen, node, whole[1]);
        return value.replace(TEMPLATE, (_, path) => shown(this.#read(screen, node, path)));
    }
    #data(screen, node, data) { if (!data) return {}; return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, this.#resolve(screen, node, v)])); }
    /** Reads every node's live fields; a filled list rebuilds its entries when its list changes. */
    #refresh(screen, first = false) {
        const visit = (node, shown_above) => {
            const d = node.def;
            node.enabled = d.enabled === undefined ? true : !!this.#resolve(screen, node, d.enabled);
            node.visible = shown_above && (d.visible === undefined ? true : !!this.#resolve(screen, node, d.visible));
            if (d.value !== undefined || node.value === undefined) {
                const bound = typeof d.value === 'string' && WHOLE.test(d.value), v = this.#resolve(screen, node, d.value);
                if (bound || first || node.value === undefined) node.value = v ?? (d.type === 'toggle' ? false : d.type === 'slider' ? (d.choices ? this.#choice(d.choices[0]) : d.min) : d.type === 'input' ? '' : v);
            }
            node.text = d.text === undefined ? '' : shown(this.#resolve(screen, node, d.text));
            if (d.from !== undefined) {
                const list = this.#resolve(screen, node, d.from), entries = Array.isArray(list) ? list : [];
                if (entries !== node.source || entries.length !== node.children.length) {
                    for (const child of node.children) this.#drop(screen, child);
                    node.source = entries; node.children = entries.map((entry, i) => this.#node(screen, d.template, node, entry, i));
                    node.rebuilt = true;
                }
            }
            for (const child of node.children) visit(child, node.visible);
        };
        for (const root of screen.roots) visit(root, true);
        if (screen.focus && !screen.nodes.has(screen.focus.id)) screen.focus = null;
        if (screen.focus && !this.#focusable(screen.focus)) screen.focus = null;
        if (!screen.focus && screen === this.#target()) screen.focus = this.#order(screen)[0] ?? null;
    }
    #choice(c) { return c && typeof c === 'object' ? c.value : c; }
    #focusable(node) { if (!node || !node.visible || !node.enabled) return false; const f = node.def.focusable; return f === undefined ? FOCUSABLE.includes(node.def.type) : !!f; }
    #order(screen) { const out = [], visit = n => { if (!n.visible) return; if (this.#focusable(n)) out.push(n); n.children.forEach(visit); }; screen.roots.forEach(visit); return out; }
    /** The screen the menu actions drive: the top modal screen, else the top one with something to focus. */
    #target() {
        for (let i = this.#stack.length - 1; i >= 0; i--) { const s = this.#stack[i]; if (s.record.modal || this.#order(s).length) return s; }
        return null;
    }
    #setFocus(screen, node, { quiet = false } = {}) {
        if (screen.focus === node) return;
        screen.focus = node;
        if (node && !quiet) { this.#emit('focus', { screen: screen.name, item: node.id }); this.#runEvent(screen, node, 'on_focus'); this.#view?.play(node, 'focus'); }
    }
    #move(screen, step, way) {
        const order = this.#order(screen); if (!order.length) return;
        const at = order.indexOf(screen.focus), layout = screen.focus?.parent?.def.layout ?? (screen.focus?.parent ? null : screen.record.layout);
        let next;
        if (at >= 0 && layout?.kind === 'grid' && (way === 'up' || way === 'down')) {
            const siblings = order.filter(n => n.parent === screen.focus.parent), i = siblings.indexOf(screen.focus), j = i + step * (layout.columns ?? 1);
            next = siblings[j] ?? null; if (!next) return;
        } else next = order[at < 0 ? 0 : (at + step + order.length) % order.length];
        this.#setFocus(screen, next);
    }
    #side(screen, step) {
        const node = screen.focus;
        if (node?.def.type === 'toggle') return this.#change(screen, node, step > 0);
        if (node?.def.type === 'slider') return this.#change(screen, node, this.#stepped(node, step));
        this.#move(screen, step, step > 0 ? 'right' : 'left');
    }
    #stepped(node, step) {
        const d = node.def;
        if (d.choices) { const values = d.choices.map(c => this.#choice(c)), i = Math.max(0, values.indexOf(node.value)); return values[(i + step + values.length) % values.length]; }
        const s = d.step ?? (d.max - d.min) / 10; return Math.min(d.max, Math.max(d.min, Math.round(((node.value ?? d.min) + step * s) / s) * s));
    }
    /** A new value for a toggle, slider or input: written where it is bound ("{options.music}"), then its on_change runs. */
    #change(screen, node, value) {
        if (!node.enabled || value === node.value) return;
        node.value = value;
        const bound = typeof node.def.value === 'string' && WHOLE.exec(node.def.value);
        if (bound && !/^(item|data|index|value)(\.|$)/.test(bound[1])) this.setValue(bound[1], value);
        this.#emit('change', { screen: screen.name, item: node.id, value });
        this.#runEvent(screen, node, 'on_change');
        this.#refresh(screen); this.#sync();
    }
    #activate(screen, node) {
        if (!this.#stack.includes(screen) || !node.enabled || !node.visible) return false;
        if (this.#focusable(node)) this.#setFocus(screen, node, { quiet: true });
        this.#view?.play(node, 'click');
        if (node.def.type === 'toggle') this.#change(screen, node, !node.value);
        else if (node.def.type === 'slider' && node.def.choices) this.#change(screen, node, this.#stepped(node, 1));
        else if (node.def.type === 'input') this.#view?.edit(node);
        this.#emit('click', { screen: screen.name, item: node.id });
        this.#runEvent(screen, node, 'on_click');
        this.#sync(); return true;
    }
    #runEvent(screen, node, key) { const action = node.def[key]; if (action) this.#run(screen, node, action); }
    #run(screen, node, action) {
        if (Array.isArray(action)) { for (const a of action) this.#run(screen, node, a); return; }
        if (action.open) this.open(this.#resolve(screen, node, action.open), this.#data(screen, node, action.data));
        else if (action.back) this.back();
        else if (action.close) this.close(this.#resolve(screen, node, action.close));
        else if (action.focus) this.focus(this.#resolve(screen, node, action.focus), screen.name);
        else if (action.set) this.setValue(this.#resolve(screen, node, action.set), action.value !== undefined ? this.#resolve(screen, node, action.value) : node.value);
        else if (action.event) this.#emit(this.#resolve(screen, node, action.event), { screen: screen.name, item: node.id, value: node.value, data: this.#data(screen, node, action.data), entry: this.#entry(node)?.entry });
    }
    /** After any change: the input context the top screen asks for, then the page. */
    #sync() {
        const c = this.#controls;
        if (c?.useContext) {
            const wants = [...this.#stack].reverse().find(s => s.record.controls)?.record.controls ?? null;
            if (wants && this.#base_input === null) this.#base_input = c.input_context;
            const next = wants ?? this.#base_input;
            if (next && c.input_context !== next) c.useContext(next);
            if (!wants) this.#base_input = null;
        }
        if (this.#view) { const target = this.#target(); this.#view.syncRoot(this.stack); this.#stack.forEach((screen, i) => this.#view.syncScreen(screen, i, screen === target)); }
    }
}
