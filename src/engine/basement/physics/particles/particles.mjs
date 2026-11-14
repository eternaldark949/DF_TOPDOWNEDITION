// ===== LV0 BASEMENT =====
import { number, vector, clone, length, sub, add, rotate, BODY_GROUP } from '../core/values.mjs';

/** Particle bodies use the world's ONLY grid and common contact solver. */
export class particlePhysics {
    constructor(world) { this.world = world; this.pools = new Map(); this.chains = new Map(); this.cloths = new Map(); this.cloth_vertices = new Map(); this.owner_cloths = new Map(); this.next_id = 1; }
    createParticlePool(packet = {}) {
        const id = this.next_id++, capacity = number(packet.capacity ?? 256, 'capacity', 1, 100000);
        if (!Number.isInteger(capacity)) throw new TypeError('capacity must be integral');
        this.pools.set(id, { capacity, config: clone(packet), particles: new Map() }); return id;
    }
    emitParticles(pool_id, packet = {}) {
        const p = this.pools.get(pool_id); if (!p) throw new Error('Unknown particle pool');
        const count = number(packet.count ?? 1, 'count', 0, p.capacity), ids = [];
        if (!Number.isInteger(count)) throw new TypeError('count must be integral');
        for (let i = 0; i < count && p.particles.size < p.capacity; i++) {
            const cfg = { ...p.config, ...clone(packet) };
            const body = this.world.createBody({ ...cfg, physics_type: cfg.collide ? 'rigid' : 'no_collision', collision_shape: { shape_type: 'circle', radius: cfg.radius ?? 0.5 } });
            p.particles.set(body.body_id, { body, remaining: number(cfg.lifetime ?? 1, 'lifetime', 0) }); ids.push(body.body_id);
        }
        return ids;
    }
    getParticleState(pool_id, results = []) {
        const p = this.pools.get(pool_id); if (!p) throw new Error('Unknown particle pool');
        results.length = 0; for (const v of p.particles.values()) results.push({ ...v.body.getState(), remaining: v.remaining }); return results;
    }
    clearParticles(pool_id) {
        const p = this.pools.get(pool_id); if (!p) return;
        for (const v of p.particles.values()) this.world.removeBody(v.body); p.particles.clear();
    }
    createChain(packet) {
        const points = packet.points?.map(v => vector(v)); if (!points || points.length < 2) throw new TypeError('Chain needs at least two points');
        const anchors = [...(packet.anchors ?? [0])];
        if (anchors.some(i => !Number.isInteger(i) || i < 0 || i >= points.length)) throw new TypeError('Invalid anchor index');
        const id = this.next_id++, constraints = [];
        const bodies = points.map((position, i) => this.world.createBody({ position, mass: packet.mass ?? 1, physics_type: anchors.includes(i) ? 'static' : 'no_collision', linear_damping: packet.damping ?? 3, collision_shape: { shape_type: 'circle', radius: packet.radius ?? 0.2 } }));
        for (let i = 1; i < bodies.length; i++) constraints.push(this.world.createConstraint({ constraint_type: 'distance', body_a: bodies[i - 1], body_b: bodies[i], rest_length: length(sub(points[i], points[i - 1])), stiffness: packet.stiffness ?? 20 }));
        this.chains.set(id, { bodies, constraints, anchors }); return id;
    }
    setChainAnchors(chain_id, positions) {
        const c = this.chains.get(chain_id); if (!c) throw new Error('Unknown chain');
        if (positions.length !== c.anchors.length) throw new TypeError('One position per anchor required');
        positions.forEach((p, i) => c.bodies[c.anchors[i]].setPosition(vector(p)));
    }
    getChainState(chain_id, results = []) {
        const c = this.chains.get(chain_id); if (!c) throw new Error('Unknown chain');
        results.length = 0; for (const b of c.bodies) results.push(b.getState()); return results;
    }
    removeChain(chain_id) {
        const c = this.chains.get(chain_id); if (!c) return;
        for (const v of c.constraints) this.world.removeConstraint(v.constraint_id);
        for (const b of c.bodies) this.world.removeBody(b); this.chains.delete(chain_id);
    }
    createCloth(packet) {
        const points = packet.points?.map(p => vector(p)), edges = clone(packet.edges ?? []), anchors = [...(packet.anchors ?? [])];
        if (!points?.length || points.length > 10000) throw new TypeError('Cloth requires 1..10000 points');
        const index = i => { if (!Number.isInteger(i) || i < 0 || i >= points.length) throw new TypeError('Invalid cloth vertex'); };
        for (const i of anchors) index(i);
        if (new Set(anchors).size !== anchors.length) throw new TypeError('Duplicate cloth anchor');
        if (edges.length > 60000) throw new TypeError('Too many cloth edges');
        for (const edge of edges) { if (!Array.isArray(edge) || edge.length !== 2 || edge[0] === edge[1]) throw new TypeError('Invalid cloth edge'); edge.forEach(index); }
        const anchor_set = new Set(anchors);
        const mass = number(packet.mass ?? 0.1, 'mass', 1e-7), radius = number(packet.radius ?? 0.2, 'radius', 1e-7);
        const stiffness = number(packet.stiffness ?? 30, 'stiffness', 0), damping = number(packet.damping ?? 3, 'damping', 0), wind = vector(packet.wind ?? [0, 0]);
        const owner = packet.owner ? this.world._record(packet.owner.body ?? packet.owner) : null;
        const local_points = clone(points), bodies = [], constraints = [], id = this.next_id++;
        try {
            for (let i = 0; i < points.length; i++) bodies.push(this.world.createBody({
                position: owner ? add(owner.position, rotate(points[i], owner.rotation)) : points[i], mass,
                physics_type: anchor_set.has(i) ? 'static' : packet.collide ? 'rigid' : 'no_collision',
                collision_shape: { shape_type: 'circle', radius }, collision_group: BODY_GROUP.PARTICLE,
                collision_mask: packet.collide ? packet.collision_mask ?? (BODY_GROUP.ALL & ~BODY_GROUP.PARTICLE) : 0, query_mask: packet.collide ? BODY_GROUP.ALL : 0, collision_exclusions: owner ? [owner.id] : [],
                axis_lock: { rotation: true }, linear_damping: damping,
            }));
            for (const [a, b] of edges) constraints.push(this.world.createConstraint({ constraint_type: 'distance', body_a: bodies[a], body_b: bodies[b], rest_length: length(sub(points[a], points[b])), stiffness }));
            const cloth = { bodies, constraints, anchors, local_points, owner_id: owner?.id ?? null, wind };
            this.cloths.set(id, cloth); this._indexCloth(id, cloth); return id;
        } catch (error) { for (const c of constraints) this.world.removeConstraint(c); for (const b of bodies) this.world.removeBody(b); throw error; }
    }
    setClothAnchors(cloth_id, positions) {
        const c = this.cloths.get(cloth_id); if (!c) throw new Error('Unknown cloth');
        if (positions.length !== c.anchors.length) throw new TypeError('One position per anchor required');
        const validated = positions.map(p => vector(p));
        this.world._mutate(() => {
            const owner = c.owner_id === null ? null : this.world._record(c.owner_id);
            validated.forEach((p, i) => { c.local_points[c.anchors[i]] = p; c.bodies[c.anchors[i]].setPosition(owner ? add(owner.position, rotate(p, owner.rotation)) : p); });
        });
    }
    setClothWind(cloth_id, wind) {
        const c = this.cloths.get(cloth_id); if (!c) throw new Error('Unknown cloth');
        const value = vector(wind); this.world._mutate(() => { c.wind = value; });
    }
    getClothState(cloth_id, results = []) {
        const c = this.cloths.get(cloth_id); if (!c) throw new Error('Unknown cloth');
        results.length = 0; for (const b of c.bodies) results.push(b.getState()); return results;
    }
    removeCloth(cloth_id) {
        const c = this.cloths.get(cloth_id); if (!c) return;
        this.world._mutate(() => { this.cloths.delete(cloth_id);
            for (const b of c.bodies) this.cloth_vertices.delete(b.body_id);
            if (c.owner_id !== null) { const list = this.owner_cloths.get(c.owner_id); list?.delete(cloth_id); if (!list?.size) this.owner_cloths.delete(c.owner_id); }
            for (const joint of c.constraints) this.world.removeConstraint(joint); for (const b of c.bodies) if (this.world.fetchBody(b.body_id)) this.world.removeBody(b); this.cloths.delete(cloth_id); });
    }
    _indexCloth(id, c) {
        for (const b of c.bodies) this.cloth_vertices.set(b.body_id, id);
        if (c.owner_id !== null) { let set = this.owner_cloths.get(c.owner_id); if (!set) this.owner_cloths.set(c.owner_id, set = new Set()); set.add(id); }
    }
    _bodyRemoved(body_id) {
        for (const pool of this.pools.values()) pool.particles.delete(body_id);
        const own = this.cloth_vertices.get(body_id); if (own !== undefined) this.removeCloth(own);
        for (const id of [...(this.owner_cloths.get(body_id) ?? [])]) this.removeCloth(id);
    }
    _beforeStep() {
        for (const [id, c] of this.cloths) {
            const owner = c.owner_id === null ? null : this.world.fetchBody(c.owner_id);
            if (c.owner_id !== null && !owner) { this.removeCloth(id); continue; }
            for (const b of c.bodies) {
                const r = this.world._record(b);
                if (r.config.physics_type === 'static') continue;
                r.force = add(r.force, c.wind);
                if (length(c.wind)) { r.sleeping = false; r.sleep_time = 0; }
            }
        }
    }
    _syncAnchors() {
        for (const c of this.cloths.values()) {
            const owner = c.owner_id === null ? null : this.world.fetchBody(c.owner_id);
            if (owner) {
                const r = this.world._record(owner);
                // Anchor updates are internal to the engine step, before constraint solving.
                for (const i of c.anchors) {
                    const anchor = this.world._record(c.bodies[i]);
                    if (anchor.anchor_tick !== this.world.simulation_tick) { anchor.previous_position = [...anchor.position]; anchor.previous_rotation = anchor.rotation; anchor.anchor_tick = this.world.simulation_tick; }
                    anchor.position = add(r.position, rotate(c.local_points[i], r.rotation)); this.world._syncBody(anchor.handle);
                }
            }
        }
    }
    _update(dt) {
        for (const p of this.pools.values()) for (const [id, v] of p.particles) {
            v.remaining -= dt;
            if (v.remaining <= 0) { this.world.removeBody(v.body); p.particles.delete(id); }
        }
    }
    _clear() { this.pools.clear(); this.chains.clear(); this.cloths.clear(); this.cloth_vertices.clear(); this.owner_cloths.clear(); this.next_id = 1; }
    _saveState() {
        return { next_id: this.next_id,
            cloths: [...this.cloths].map(([id, c]) => ({ id, ...clone({ ...c, bodies: c.bodies.map(b => b.body_id), constraints: c.constraints.map(v => v.constraint_id) }) })),
            pools: [...this.pools].map(([id, p]) => ({ id, capacity: p.capacity, config: clone(p.config), particles: [...p.particles].map(([body_id, v]) => ({ body_id, remaining: v.remaining })) })),
            chains: [...this.chains].map(([id, c]) => ({ id, bodies: c.bodies.map(b => b.body_id), constraints: c.constraints.map(v => v.constraint_id), anchors: [...c.anchors] })) };
    }
    _loadState(packet) {
        if (!packet) return;
        this.next_id = number(packet.next_id, 'particle next_id', 1);
        for (const p of packet.pools) this.pools.set(p.id, { capacity: number(p.capacity, 'capacity', 1), config: clone(p.config), particles: new Map(p.particles.map(v => {
            const body = this.world.fetchBody(v.body_id); if (!body) throw new TypeError('Missing particle body');
            return [v.body_id, { body, remaining: number(v.remaining, 'remaining') }];
        })) });
        for (const c of packet.cloths ?? []) {
            const bodies = c.bodies.map(id => { const b = this.world.fetchBody(id); if (!b) throw new TypeError('Missing cloth body'); return b; });
            if (c.owner_id !== null) this.world._record(c.owner_id);
            if (c.anchors.some(i => !Number.isInteger(i) || !bodies[i])) throw new TypeError('Invalid cloth anchor');
            const cloth = { ...clone(c), wind: vector(c.wind), bodies, constraints: c.constraints.map(constraint_id => ({ constraint_id })) };
            this.cloths.set(c.id, cloth); this._indexCloth(c.id, cloth);
        }
        for (const c of packet.chains) this.chains.set(c.id, { bodies: c.bodies.map(id => { const body = this.world.fetchBody(id); if (!body) throw new TypeError('Missing chain body'); return body; }),
            constraints: c.constraints.map(constraint_id => ({ constraint_id })), anchors: [...c.anchors] });
    }
}
