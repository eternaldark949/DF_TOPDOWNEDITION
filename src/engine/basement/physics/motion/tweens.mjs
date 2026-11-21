// ===== LV0 BASEMENT =====
// Tweens: any value on an entity eased from where it is to where it is going over a time, as data. A tween
// names a property path ('scale', 'elevation', or a key of the entity's data such as 'look.values.shirt'),
// where it goes (a number, a list of numbers, or a colour), how long it takes, its easing, a delay, and
// whether it repeats or goes back and forth. Tweens run at the start of each fixed step, save and load
// with the world, and say `tweenFinished` when done.
import { clone, number } from '../core/values.mjs';
import { readEasing, ease } from './easing.mjs';

const BODY_PATHS = Object.freeze(['position', 'rotation']);
// Colours a tween can travel between: #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Kept as [r, g, b, a].
function readColour(text) {
    const s = text.trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m && [3, 6, 8].includes(m[1].length)) {
        const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
        return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
    }
    m = /^rgba?\(([^)]*)\)$/i.exec(s);
    if (m) { const p = m[1].split(',').map(Number); if ((p.length === 3 || p.length === 4) && p.every(Number.isFinite)) return [p[0], p[1], p[2], p[3] ?? 1]; }
    return null;
}
const hex = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
const writeColour = ([r, g, b, a]) => a >= 1 ? `#${hex(r)}${hex(g)}${hex(b)}` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(4)})`;
// What kind of value travels: a number, a list of numbers, or a colour; and the same kind at both ends.
function kindOf(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (Array.isArray(value) && value.length && value.every(Number.isFinite)) return 'vector';
    if (typeof value === 'string' && readColour(value)) return 'colour';
    return null;
}
function between(kind, from, to, k, angle) {
    if (kind === 'number') return angle ? from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k : from + (to - from) * k;
    if (kind === 'vector') return from.map((v, i) => v + (to[i] - v) * k);
    const a = readColour(from), b = readColour(to); return writeColour(a.map((v, i) => v + (b[i] - v) * k));
}

export class tweenSystem {
    #tweens = new Map(); #nextId = 1;
    constructor(world) {
        if (!world || typeof world._mutate !== 'function') throw new TypeError('Tweens require their physicsSystem owner');
        Object.defineProperty(this, 'world', { value: world }); Object.freeze(this);
    }
    #entity(value) {
        const entity = typeof value === 'number' ? this.world.elements.fetchEntity(value) : value;
        if (!entity || entity.destroyed || this.world.elements.fetchEntity(entity.entity_id) !== entity) throw new TypeError('Tween a live entity of this world');
        return entity;
    }
    // The value at a path: a body path, scale, elevation, or a key of the entity's data, read down its objects.
    #read(entity, path) {
        if (path === 'scale') return [...entity.scale];
        if (path === 'elevation') return entity.elevation;
        const [head, ...rest] = path.split('.'); let v = entity.get(head);
        for (const key of rest) { if (v == null || typeof v !== 'object') return undefined; v = v[key]; }
        return v;
    }
    #write(entity, path, value) {
        if (path === 'scale') return entity.scaleTo(value);
        if (path === 'elevation') return this.world._setLiveElevation(entity.body, value);
        const [head, ...rest] = path.split('.');
        if (!rest.length) return entity.set(head, value);
        const root = clone(entity.get(head) ?? {}); let at = root;
        for (const key of rest.slice(0, -1)) { if (at[key] == null || typeof at[key] !== 'object') at[key] = {}; at = at[key]; }
        at[rest.at(-1)] = value; entity.set(head, root);
    }
    /**
     * Eases `property` of `entity` to `to` over `duration` seconds. Options: `from` (default: its value now),
     * `easing` (a name, a bezier or {steps}; default 'smooth'), `delay` seconds, `repeat` (extra runs; -1 for
     * ever), `yoyo` (every other run goes back), `angle` (a number that turns the short way). A new tween on the
     * same property replaces the old. Returns the tween's id.
     */
    start(entity, property, to, { duration = .5, from, easing = 'smooth', delay = 0, repeat = 0, yoyo = false, angle = false } = {}) {
        entity = this.#entity(entity);
        if (typeof property !== 'string' || !property || property.split('.').some(k => !k)) throw new TypeError('A tween property is a path such as "scale" or "look.values.shirt"');
        if (BODY_PATHS.includes(property)) throw new TypeError(`Move ${property} with motion.moveBodyTo (it travels through collisions)`);
        const start = from === undefined ? this.#read(entity, property) : clone(from), kind = kindOf(to);
        if (!kind || kindOf(start) !== kind || (kind === 'vector' && start.length !== to.length)) throw new TypeError(`Tween ${property}: ${JSON.stringify(start)} and ${JSON.stringify(to)} are not two numbers, two lists of numbers the same length, or two colours`);
        number(duration, 'tween duration', 1e-6); number(delay, 'tween delay', 0); number(repeat, 'tween repeat', -1);
        if (!Number.isInteger(repeat)) throw new TypeError('Tween repeat is a whole number, or -1 for ever');
        const tween = { tween_id: this.#nextId++, entity_id: entity.entity_id, property, kind, from: start, to: clone(to), duration, delay, repeat, yoyo: !!yoyo, angle: !!angle && kind === 'number', easing: readEasing(easing), elapsed: 0 };
        for (const [id, t] of this.#tweens) if (t.entity_id === tween.entity_id && t.property === property) this.#tweens.delete(id);
        this.#tweens.set(tween.tween_id, tween); return tween.tween_id;
    }
    /** Stops a tween by id, or every tween on an entity (or only on one of its properties). It stays where it got to. */
    stop(entity_or_id, property) {
        if (typeof entity_or_id === 'number' && property === undefined) return this.#tweens.delete(entity_or_id);
        const id = this.#entity(entity_or_id).entity_id; let any = false;
        for (const [key, t] of this.#tweens) if (t.entity_id === id && (property === undefined || t.property === property)) { this.#tweens.delete(key); any = true; }
        return any;
    }
    /** A copy of a tween's state, or null. */
    getTween(tween_id) { const t = this.#tweens.get(tween_id); return t ? clone(t) : null; }
    /** The ids of the tweens running on an entity. */
    listTweens(entity) { const id = this.#entity(entity).entity_id; return [...this.#tweens.values()].filter(t => t.entity_id === id).map(t => t.tween_id); }
    _update(step) {
        for (const [id, t] of [...this.#tweens]) {
            const entity = this.world.elements.fetchEntity(t.entity_id);
            if (!entity || entity.destroyed) { this.#tweens.delete(id); continue; }
            t.elapsed += step; const run = t.elapsed - t.delay; if (run < 0) continue;
            const runs = t.repeat < 0 ? Infinity : t.repeat + 1, index = Math.min(Math.floor(run / t.duration), runs - 1), done = run >= runs * t.duration;
            let k = done ? 1 : (run - index * t.duration) / t.duration;
            if (t.yoyo && index % 2) k = 1 - k;
            this.#write(entity, t.property, between(t.kind, t.from, t.to, ease(t.easing, k), t.angle));
            if (done) { this.#tweens.delete(id); this.world._emit('tweenFinished', { body: entity.body, tween_id: id, property: t.property }); }
        }
    }
    _clear() { this.#tweens.clear(); }
    _saveState() { return { next_id: this.#nextId, tweens: [...this.#tweens.values()].map(clone) }; }
    _loadState(packet) {
        if (!packet) return;
        for (const t of packet.tweens) { readEasing(t.easing); number(t.elapsed, 'tween elapsed', 0); this.#tweens.set(t.tween_id, clone(t)); }
        this.#nextId = Math.max(this.#nextId, packet.next_id ?? 1);
    }
}
