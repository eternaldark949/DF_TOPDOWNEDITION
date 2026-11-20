// ===== LV0 BASEMENT =====
// PARTICLE SYSTEMS: many small things that are born, move and die, as data: rain, snow, sparks, smoke, spray,
// leaves, embers. A system is one record (PARTICLE_SYSTEM): where its particles start and how many a second,
// how they move (velocity, gravity, wind, drag, in three axes: z is height), how long they live and what
// happens when they reach the ground (die, stop or bounce, and burst into another system: a raindrop's splash).
// The physics world steps every system inside its own step, so the Lobby's clock moves them like everything
// else: they pause, slow down and step with the game.
//
// Two ways to move, one switch: `collide: false` (the default) keeps particles as plain numbers in packed
// arrays, thousands for well under a millisecond, touching nothing but the ground; `collide: true` makes each
// particle a body in the world's one grid, so it hits walls and lands on roofs and cars like any body (each
// costs a body: keep these to tens or a few hundred). The drawing is the render system's (drawParticles), from
// the record's `look`, which physics carries but never reads.
import { number, vector, BODY_GROUP } from '../core/values.mjs';

/**
 * A particle system's fields and their defaults. Lengths are world units, times seconds, z is height.
 * - capacity: the most alive at once (more are not born).
 * - rate: particles born a second; density: more born a second per 100 x 100 world units of `area`.
 * - area: [x, y, width, height]: where they are born (anywhere in it, evenly), or null for `at`.
 *   A level can keep it on what the camera sees (setParticleArea), so rain falls wherever you look.
 * - at: [x, y] and radius: born in a disc there, when there is no area.
 * - height: [lowest, highest]: the height they are born at.
 * - velocity: [[vx lo, vx hi], [vy lo, vy hi], [vz lo, vz hi]]: each picked between its two.
 * - gravity: [x, y, z] acceleration (rain: z below zero); wind: [x, y] world units a second they drift with;
 *   drag: how fast their own speed fades (per second; wind stays).
 * - life: [shortest, longest] seconds; land: what reaching the ground (z 0) does: 'die', 'stop', 'bounce'
 *   (`bounce` keeps that share of the fall's speed) or 'none' (they pass through).
 * - on_land: {system, count}: a burst of `count` particles of another system (a record or its id) where one lands.
 * - collide: false: plain numbers; true: each particle a physics body (radius `radius`) that hits what is there.
 * - seed: which particles (the same seed and steps give the same particles).
 * - look: how it is drawn (the render system's; physics keeps it as data).
 */
export const PARTICLE_SYSTEM = Object.freeze({ capacity: 2000, rate: 0, density: 0, area: null, at: [0, 0], radius: 0, height: [0, 0],
    velocity: [[0, 0], [0, 0], [0, 0]], gravity: [0, 0, 0], wind: [0, 0], drag: 0, life: [1, 1], land: 'die', bounce: 0.3, on_land: null,
    collide: false, seed: 0, look: null });
const LANDS = ['die', 'stop', 'bounce', 'none'];
const range = (v, name, lo = -Infinity) => { if (!Array.isArray(v) || v.length !== 2) throw new TypeError(`${name} is [lowest, highest]`); const out = [number(v[0], name, lo), number(v[1], name, lo)]; if (out[1] < out[0]) throw new RangeError(`${name}: the highest is under the lowest`); return out; };
/** A particle system record checked and filled in from the defaults. Unknown fields are refused. */
export function readParticleSystem(record, where = 'particle system') {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`${where} is {${Object.keys(PARTICLE_SYSTEM).join(', ')}}`);
    for (const key of Object.keys(record)) if (key !== 'kind' && !Object.hasOwn(PARTICLE_SYSTEM, key)) throw new TypeError(`Unknown ${where} field: ${key} (one of ${Object.keys(PARTICLE_SYSTEM).join(', ')})`);
    const r = { ...PARTICLE_SYSTEM, ...record }, out = {};
    const named = (name, fn) => { try { return fn(); } catch (error) { error.message = `${where}.${name}: ${error.message}`; throw error; } };
    out.capacity = named('capacity', () => number(r.capacity, 'capacity', 1, 100000)); if (!Number.isInteger(out.capacity)) throw new TypeError(`${where}.capacity is a whole number`);
    out.rate = named('rate', () => number(r.rate, 'rate', 0)); out.density = named('density', () => number(r.density, 'density', 0));
    out.area = r.area === null ? null : named('area', () => { if (!Array.isArray(r.area) || r.area.length !== 4) throw new TypeError('area is [x, y, width, height]'); return r.area.map((v, i) => number(v, 'area', i > 1 ? 0 : -Infinity)); });
    out.at = named('at', () => vector(r.at)); out.radius = named('radius', () => number(r.radius, 'radius', 0));
    out.height = named('height', () => range(r.height, 'height'));
    out.velocity = named('velocity', () => { if (!Array.isArray(r.velocity) || r.velocity.length !== 3) throw new TypeError('velocity is [[vx lo, hi], [vy lo, hi], [vz lo, hi]]'); return r.velocity.map((v, i) => range(v, ['vx', 'vy', 'vz'][i])); });
    out.gravity = named('gravity', () => { if (!Array.isArray(r.gravity) || r.gravity.length !== 3) throw new TypeError('gravity is [x, y, z]'); return r.gravity.map(v => number(v, 'gravity')); });
    out.wind = named('wind', () => vector(r.wind)); out.drag = named('drag', () => number(r.drag, 'drag', 0));
    out.life = named('life', () => range(r.life, 'life', 0));
    if (!LANDS.includes(r.land)) throw new TypeError(`${where}.land is ${LANDS.join(', ')}`); out.land = r.land;
    out.bounce = named('bounce', () => number(r.bounce, 'bounce', 0, 1));
    if (r.on_land !== null && !(r.on_land && typeof r.on_land === 'object' && (typeof r.on_land.system === 'string' || (r.on_land.system && typeof r.on_land.system === 'object')))) throw new TypeError(`${where}.on_land is {system, count} or null`);
    out.on_land = r.on_land === null ? null : { system: r.on_land.system, count: named('on_land.count', () => number(r.on_land.count ?? 1, 'count', 0, 64)) };
    if (typeof r.collide !== 'boolean') throw new TypeError(`${where}.collide is true or false`); out.collide = r.collide;
    out.seed = named('seed', () => number(r.seed, 'seed'));
    if (r.look !== null && (typeof r.look !== 'object' || Array.isArray(r.look))) throw new TypeError(`${where}.look is an object or null`); out.look = r.look;
    return Object.freeze(out);
}

const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'px', 'py', 'pz'];
const lerp = ([a, b], t) => a + (b - a) * t;
/** One system's particles, in packed arrays (or bodies when it collides). */
class particleSystem {
    constructor(id, record, source, owner) {
        this.id = id; this.record = record; this.source = source; this.owner = owner; this.area = record.area; this.count = 0; this.carry = 0;
        this.state = (record.seed >>> 0) || 0x9e3779b9; this.bodies = record.collide ? [] : null;
        for (const f of FIELDS) this[f] = new Float32Array(record.collide ? 0 : record.capacity);
    }
    random() { let t = (this.state = (this.state + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    /** Where one is born: in the area, or in the disc round `at`. */
    birthplace() {
        const r = this.record;
        if (this.area) return [this.area[0] + this.random() * this.area[2], this.area[1] + this.random() * this.area[3]];
        const a = this.random() * Math.PI * 2, d = r.radius * Math.sqrt(this.random()); return [r.at[0] + Math.cos(a) * d, r.at[1] + Math.sin(a) * d];
    }
    alive() { return this.bodies ? this.bodies.length : this.count; }
}

/** The world's particle systems: created, stepped inside the physics step, read for drawing. */
export class particleSystems {
    constructor(world) { this.world = world; this.systems = new Map(); this.next_id = 1; }
    #resolve(record) {
        if (typeof record === 'string') { const res = this.world.elements?.asset_library?.getResource?.(record); if (res?.kind !== 'particle_system') throw new TypeError(`${record} is not a particle system`); return { record: readParticleSystem(res, record), source: record }; }
        return { record: readParticleSystem(record), source: null };
    }
    /** Makes a system from a record or a `particle_system` resource id; `area` and `at` override the record's. Returns its id. */
    create(record, { area, at } = {}) {
        const { record: r, source } = this.#resolve(record), id = this.next_id++, s = new particleSystem(id, r, source, null);
        if (area !== undefined) this.setArea(s, area); if (at !== undefined) s.record = Object.freeze({ ...s.record, at: vector(at) });
        this.systems.set(id, s); return id;
    }
    #get(id) { const s = this.systems.get(id); if (!s) throw new Error('Unknown particle system'); return s; }
    setArea(id, area) { const s = typeof id === 'object' ? id : this.#get(id); if (area === null) { s.area = null; return; } if (!Array.isArray(area) || area.length !== 4) throw new TypeError('area is [x, y, width, height]'); s.area = area.map((v, i) => number(v, 'area', i > 1 ? 0 : -Infinity)); }
    setRate(id, { rate, density } = {}) { const s = this.#get(id); s.record = Object.freeze({ ...s.record, ...(rate !== undefined ? { rate: number(rate, 'rate', 0) } : {}), ...(density !== undefined ? { density: number(density, 'density', 0) } : {}) }); }
    remove(id) { const s = this.systems.get(id); if (!s) return; if (s.bodies) for (const p of s.bodies) this.world.removeBody(p.body); this.systems.delete(id); for (const o of this.systems.values()) if (o.owner === id) this.remove(o.id); }
    /** Births `count` particles now, at `at` (else where the system says) with `height`. */
    burst(id, count, { at = null, height = null } = {}) { const s = this.#get(id); for (let i = 0; i < count; i++) this.#birth(s, at, height); }
    // The system a landing bursts into: one per record, made the first time it is needed and owned by its maker.
    #child(s) {
        const target = s.record.on_land.system, key = typeof target === 'string' ? target : JSON.stringify(target);
        if (!s.children) s.children = new Map();
        let id = s.children.get(key); if (id !== undefined && this.systems.has(id)) return this.systems.get(id);
        id = this.create(target); const child = this.systems.get(id); child.owner = s.id; s.children.set(key, id); return child;
    }
    #birth(s, at = null, height = null) {
        const r = s.record; if (s.alive() >= r.capacity) return;
        const [x, y] = at ?? s.birthplace(), z = height ?? lerp(r.height, s.random()), v = r.velocity.map(span => lerp(span, s.random())), life = lerp(r.life, s.random());
        if (s.bodies) {
            const body = this.world.createBody({ position: [x, y], elevation: z, vertical_velocity: v[2], linear_velocity: [v[0] + r.wind[0], v[1] + r.wind[1]], mass: 0.01,
                collision_shape: { shape_type: 'circle', radius: Math.max(0.05, r.radius || 0.5) }, collision_group: BODY_GROUP.PARTICLE, collision_mask: BODY_GROUP.ALL & ~BODY_GROUP.PARTICLE, query_mask: 0,
                gravity_scale: 0, axis_lock: { rotation: true }, sleep_enabled: false, height_span: [0, Math.max(0.1, r.radius || 0.5)] });
            s.bodies.push({ body, age: 0, life, z, landed: false }); return;
        }
        const i = s.count++;
        s.x[i] = s.px[i] = x; s.y[i] = s.py[i] = y; s.z[i] = s.pz[i] = z; s.vx[i] = v[0]; s.vy[i] = v[1]; s.vz[i] = v[2]; s.age[i] = 0; s.life[i] = life;
    }
    #kill(s, i) { const j = --s.count; if (i !== j) for (const f of FIELDS) s[f][i] = s[f][j]; }
    #land(s, x, y, z = 0) { if (s.record.on_land && s.record.on_land.count) { const child = this.#child(s); for (let k = 0; k < s.record.on_land.count; k++) this.#birth(child, [x, y], z); } }
    /** One step: births, then motion, gravity, wind and drag, the ground, deaths. */
    _update(dt) {
        for (const s of [...this.systems.values()]) {
            const r = s.record, area = s.area ? s.area[2] * s.area[3] / 10000 : 0, want = (r.rate + r.density * area) * dt + s.carry;
            const n = Math.floor(want); s.carry = want - n; for (let k = 0; k < n; k++) this.#birth(s);
            const fade = Math.exp(-r.drag * dt), [gx, gy, gz] = r.gravity, [wx, wy] = r.wind;
            if (s.bodies) { this.#stepBodies(s, dt, gz); continue; }
            for (let i = s.count - 1; i >= 0; i--) {
                s.px[i] = s.x[i]; s.py[i] = s.y[i]; s.pz[i] = s.z[i];
                s.vx[i] = (s.vx[i] + gx * dt) * fade; s.vy[i] = (s.vy[i] + gy * dt) * fade; s.vz[i] = (s.vz[i] + gz * dt) * fade;
                s.x[i] += (s.vx[i] + wx) * dt; s.y[i] += (s.vy[i] + wy) * dt; s.z[i] += s.vz[i] * dt; s.age[i] += dt;
                if (s.z[i] <= 0 && r.land !== 'none') {
                    const arriving = s.pz[i] > 0;   // it reached the ground this step (one resting there does not land again)
                    if (arriving) { this.#land(s, s.x[i], s.y[i]); if (r.land === 'die') { this.#kill(s, i); continue; } }
                    s.z[i] = 0; s.vz[i] = arriving && r.land === 'bounce' ? -s.vz[i] * r.bounce : Math.max(0, s.vz[i]); if (r.land === 'stop') { s.vx[i] = s.vy[i] = 0; }
                }
                if (s.age[i] >= s.life[i]) this.#kill(s, i);
            }
        }
    }
    #stepBodies(s, dt, gz) {
        const r = s.record;
        for (let i = s.bodies.length - 1; i >= 0; i--) {
            const p = s.bodies[i], rec = this.world._record(p.body); p.age += dt;
            if (rec.removed) { s.bodies.splice(i, 1); continue; }
            if (!rec.grounded) rec.vertical_velocity += gz * dt;
            // Landed on the ground or on whatever stands under it (a roof, a car): the world's own vertical step decides.
            if (rec.grounded && !p.landed) { p.landed = true; this.#land(s, rec.position[0], rec.position[1], rec.elevation); if (r.land === 'die') p.age = Infinity; }
            if (p.age >= p.life) { this.world.removeBody(p.body); s.bodies.splice(i, 1); }
        }
    }
    _bodyRemoved(body_id) { for (const s of this.systems.values()) if (s.bodies) { const i = s.bodies.findIndex(p => p.body.body_id === body_id); if (i >= 0) s.bodies.splice(i, 1); } }
    /**
     * What drawing reads: each system's look, source and live particles, each one where the last step left it
     * and where it was before (drawing blends between them): `{id, source, look, wind, top, count, x, y, z, px, py,
     * pz, vx, vy, vz, age, life}` (packed arrays to `count`; `top` the highest a particle is born at). The arrays are the system's own: read them, don't keep them.
     */
    read() {
        const out = [];
        for (const s of this.systems.values()) {
            if (!s.bodies) { out.push({ id: s.id, source: s.source, look: s.record.look, wind: s.record.wind, top: s.record.height[1], count: s.count, x: s.x, y: s.y, z: s.z, px: s.px, py: s.py, pz: s.pz, vx: s.vx, vy: s.vy, vz: s.vz, age: s.age, life: s.life }); continue; }
            const n = s.bodies.length, a = Object.fromEntries(FIELDS.map(f => [f, new Float32Array(n)]));
            s.bodies.forEach((p, i) => { const r = this.world._record(p.body); a.x[i] = r.position[0]; a.y[i] = r.position[1]; a.z[i] = r.elevation; a.px[i] = r.previous_position?.[0] ?? r.position[0]; a.py[i] = r.previous_position?.[1] ?? r.position[1]; a.pz[i] = r.previous_elevation ?? r.elevation; a.vx[i] = r.velocity[0]; a.vy[i] = r.velocity[1]; a.vz[i] = r.vertical_velocity; a.age[i] = p.age; a.life[i] = p.life; });
            out.push({ id: s.id, source: s.source, look: s.record.look, wind: [0, 0], top: s.record.height[1], count: n, ...a });
        }
        return out;
    }
    _clear() { this.systems.clear(); this.next_id = 1; }
}
