// ===== LV0 BASEMENT =====
import { BODY_GROUP } from '../physics/index.mjs';
import { buildMapPackets } from './builder.mjs';
import { roomGraph } from './rooms.mjs';

const extentOf = packet => {
    const s = packet.collision_shape ?? packet.render_shape;
    if (!s) return 0;
    return s.shape_type === 'circle' ? 2 * s.radius : Math.max(...(s.dimensions ?? [0]));
};
const moved = (entity, packet) => Math.hypot(entity.position[0] - packet.position[0], entity.position[1] - packet.position[1]) > 1e-6 || Math.abs((entity.rotation ?? 0) - (packet.rotation ?? 0)) > 1e-6;

/**
 * One loaded map in one physics world. Every map streams the same way, whatever its size: entries are
 * bucketed into square regions by their centre (`regions.size`, 1024 px by default), entries larger
 * than a region (boundaries, long walls, big buildings) stay loaded, and regions are built within
 * `regions.radius` of the map's focuses and released past `radius + keep`. A map smaller than its radius
 * therefore loads whole at construction, round its spawn. A streamed entity that was moved keeps its
 * pose in the map's region memory while its region is unloaded. Other per-region work (ground tiles,
 * baked light, navigation) joins through `addTier`, each tier with its own radius.
 */
export class mapInstance {
    #physics; #entries; #openings; #byId = new Map(); #regions = new Map(); #memory = new Map(); #region_size; #tiers = new Map(); #queue = [];
    #stats = { region_loads: 0, region_unloads: 0, created: 0, destroyed: 0 };
    constructor(physics, definition, options = {}) {
        this.#physics = physics; this.map_id = definition.map_id ?? null;
        const built = buildMapPackets(definition, options);
        this.kind = built.kind; this.spawn = built.spawn; this.#entries = built.entries; this.#openings = built.openings;
        const regions = definition.regions ?? {}, size = regions.size ?? 1024;
        if (!(size > 0)) throw new TypeError('Map region size must be positive');
        this.#region_size = size;
        this.#entries.forEach((entry, order) => {
            const id = entry.packet.data?.authored_id;
            if (id !== undefined) { if (this.#byId.has(id)) throw new Error(`Duplicate map id: ${id}`); }
            entry.id = id ?? null; entry.entity = null; entry.order = order;
            entry.region = extentOf(entry.packet) <= size ? this.#regionKey(entry.packet.position) : null;
            if (entry.region !== null) { if (!this.#regions.has(entry.region)) this.#regions.set(entry.region, []); this.#regions.get(entry.region).push(entry); }
            if (id !== undefined) this.#byId.set(id, entry);
        });
        for (const entry of this.#entries) if (entry.region === null) this.#create(entry);
        // The entities tier: the bodies themselves, the one tier every map has.
        this.#tiers.set('entities', { radius: regions.radius ?? 4096, keep: regions.keep ?? size, loaded: new Set(),
            load: key => this.#build(this.#regions.get(key)), release: key => { for (const entry of this.#regions.get(key)) this.#release(entry); } });
        const [w, h] = definition.size ?? [0, 0];
        this.setFocus(options.focus ?? this.spawn ?? [w / 2, h / 2], { budget_ms: Infinity });
        /** Rooms, their links and who is in which (an empty graph when the map has no rooms). */
        this.rooms = new roomGraph(physics, this, definition, built.door_kinds);
    }
    #regionKey([x, y]) { return `${Math.floor(x / this.#region_size)},${Math.floor(y / this.#region_size)}`; }
    #regionBounds(key) { const [rx, ry] = key.split(',').map(Number), s = this.#region_size; return { left: rx * s, top: ry * s, right: (rx + 1) * s, bottom: (ry + 1) * s }; }
    /** Builds entries in their authored order, so a region set built at once matches a whole build. */
    #build(entries) { for (const entry of [...entries].sort((a, b) => a.order - b.order)) if (!entry.entity) this.#create(entry); }
    #create(entry) {
        const pose = entry.id !== null ? this.#memory.get(entry.id) : null;
        entry.entity = this.#physics.createEntity(pose ? { ...entry.packet, position: [...pose.position], rotation: pose.rotation } : entry.packet);
        this.#join(entry);
        this.#stats.created++;
    }
    /** The joints the map authored for this entry (a hinged door's hinge), created on its live entity. */
    #join(entry) {
        if (!entry.joints || !entry.entity || this.#physics.getBodyConstraints(entry.entity).length) return;
        for (const joint of entry.joints) this.#physics.createConstraint({ ...structuredClone(joint), body_a: entry.entity });
    }
    #release(entry) {
        const e = entry.entity; if (!e) return;
        if (entry.id !== null && !e.destroyed) { if (moved(e, entry.packet)) this.#memory.set(entry.id, { position: [...e.position], rotation: e.rotation ?? 0 }); else this.#memory.delete(entry.id); }
        if (!e.destroyed) e.destroy();
        entry.entity = null; this.#stats.destroyed++;
    }

    /** The live entity built for an authored id, or null (unloaded region, destroyed). */
    entity(authored_id) { const e = this.#byId.get(authored_id)?.entity; return e && !e.destroyed ? e : null; }
    /** Live entities with this data role ('wall', 'prop', 'lamp', 'door', ...), in build order. */
    entities(role) { const out = []; for (const entry of this.#entries) if (entry.entity && !entry.entity.destroyed && (role === undefined || entry.packet.data?.role === role)) out.push(entry.entity); return out; }
    /**
     * Every door, arches included, in authored order: `{door_key, index, type, opening, leaves}`, where
     * `leaves` holds each leaf's live entity (null while unloaded) in kind order. For artists and tools.
     */
    getDoors() { return this.#openings.map(({ leaf_ids, opening, ...door }) => ({ ...door, opening: structuredClone(opening), leaves: leaf_ids.map(id => this.entity(id)) })); }
    /** Authored packets, for tools and tests. */
    packets() { return this.#entries.map(e => e.packet); }

    /**
     * Streams the map round its focuses: each a point `[x, y]` or `{position, velocity}` (a moving focus
     * also pulls in what lies `lead` seconds ahead of it). For every tier, regions within its radius of
     * the nearest focus are built, nearest first, and regions past its radius + keep are released
     * (hysteresis, so walking along a border does not thrash). Building stops once `budget_ms` is spent;
     * what is left waits for the next call. `radius` and `keep` override the entities tier's.
     * Returns `{loaded, unloaded, pending}` for this call.
     */
    setFocus(focuses, { radius, keep, budget_ms = 3, lead = 1, now = () => performance.now() } = {}) {
        const points = (Array.isArray(focuses) && typeof focuses[0] === 'number' ? [focuses] : focuses).flatMap(f => {
            const p = Array.isArray(f) ? f : f.position, v = Array.isArray(f) ? null : f.velocity;
            if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new TypeError('A map focus is a point or {position, velocity}');
            return v && (v[0] || v[1]) ? [p, [p[0] + v[0] * lead, p[1] + v[1] * lead]] : [p];
        });
        const distance = key => { const b = this.#regionBounds(key); let d = Infinity;
            for (const [px, py] of points) d = Math.min(d, Math.hypot(Math.max(b.left - px, 0, px - b.right), Math.max(b.top - py, 0, py - b.bottom))); return d; };
        let loaded = 0, unloaded = 0;
        const t0 = now(), work = [];
        for (const [name, tier] of this.#tiers) {
            const r = name === 'entities' && radius !== undefined ? radius : tier.radius, k = name === 'entities' && keep !== undefined ? keep : tier.keep;
            for (const key of [...tier.loaded]) if (distance(key) > r + k) { tier.release(key, this.#regionBounds(key)); tier.loaded.delete(key); unloaded++; if (name === 'entities') this.#stats.region_unloads++; }
            for (const key of this.#regions.keys()) if (!tier.loaded.has(key) && distance(key) <= r) work.push({ name, tier, key, d: distance(key) });
        }
        work.sort((x, y) => x.d - y.d || (x.name === 'entities' ? -1 : 0) - (y.name === 'entities' ? -1 : 0));
        let done = 0;
        if (budget_ms === Infinity) {            // (all at once: the bodies in authored order, as a whole build)
            this.#build(work.filter(w => w.name === 'entities').flatMap(w => this.#regions.get(w.key)));
            for (const w of work) { if (w.name !== 'entities') w.tier.load(w.key, this.#regionBounds(w.key)); w.tier.loaded.add(w.key); loaded++; if (w.name === 'entities') this.#stats.region_loads++; }
            done = work.length;
        } else for (const w of work) {
            if (done && now() - t0 >= budget_ms) break;
            w.tier.load(w.key, this.#regionBounds(w.key)); w.tier.loaded.add(w.key); loaded++; done++; if (w.name === 'entities') this.#stats.region_loads++;
        }
        return { loaded, unloaded, pending: work.length - done };
    }
    /**
     * Adds per-region work beside the bodies: `load(key, bounds)` when a region comes within `radius` of a
     * focus, `release(key, bounds)` past `radius + keep`. Regions already in reach load on the next setFocus.
     */
    addTier(name, { radius, keep = this.#region_size, load, release }) {
        if (typeof name !== 'string' || !name || this.#tiers.has(name)) throw new TypeError(`A map tier needs a new name (${name})`);
        if (!(radius >= 0) || !(keep >= 0) || typeof load !== 'function' || typeof release !== 'function') throw new TypeError('A map tier needs a radius, a keep, load and release');
        this.#tiers.set(name, { radius, keep, load, release, loaded: new Set() });
        return this;
    }
    get region_size() { return this.#region_size; }
    get loaded_regions() { return [...this.#tiers.get('entities').loaded]; }

    /**
     * The map's work for one fixed step, called by the Lobby's runtime (through the level that owns
     * the map): opens each kinematic door while a body of `include_groups` is within its range, by a
     * timed move of all its sliding leaves (`near_range(door)` gives the range, default 90), then
     * updates room occupancy. Hinged leaves need nothing here: physics swings them and their spring
     * closes them.
     */
    updateState({ near_range = () => 90, duration = 0.35, easing = 'smooth', include_groups = BODY_GROUP.CHARACTER } = {}) {
        const panels = new Map();
        for (const leaf of this.entities('door_panel')) panels.set(leaf.data.door_key, [...(panels.get(leaf.data.door_key) ?? []), leaf]);
        for (const door of this.entities('door')) {
            const sliding = [door, ...(panels.get(door.data.authored_id) ?? [])].filter(leaf => !leaf.data.hinged);
            if (!sliding.length) continue;
            const near = this.#physics.peruseNearbyEntities(door.data.trigger_position ?? door, { near_range: near_range(door), include_groups, include_ghosts: false }).length > 0;
            if (near === sliding[0].data.open) continue;
            for (const leaf of sliding) {
                leaf.data.open = near;
                this.#physics.motion.moveBodyTo(leaf, { position: near ? leaf.data.open_position : leaf.data.closed_position, rotation: near ? leaf.data.open_rotation : leaf.data.closed_rotation, duration, easing });
            }
        }
        this.rooms.updateState();
    }

    /**
     * Re-links authored ids to entities after the world was restored from a physics snapshot
     * (regions the snapshot holds count as loaded; the rest build as a focus reaches them), and creates any authored joint the snapshot
     * lacks (a save made before the entry had one). Unmatched entries are left unbuilt.
     */
    reconnect() {
        const live = new Map();
        for (const e of this.#physics.elements.getEntities()) if (e.data?.authored_id !== undefined) live.set(e.data.authored_id, e);
        for (const entry of this.#entries) { entry.entity = entry.id !== null ? live.get(entry.id) ?? null : null; this.#join(entry); }
        const loaded = this.#tiers.get('entities').loaded; loaded.clear();
        for (const [key, entries] of this.#regions) if (entries.some(entry => entry.entity)) loaded.add(key);   // (a region the snapshot held is loaded; the rest build as focus reaches them)
    }

    /** Region memory and loaded regions, as plain data. The loaded regions' bodies save with the physics snapshot. */
    saveState() { return { map_id: this.map_id, rooms: this.rooms.saveState(), memory: Object.fromEntries([...this.#memory].map(([id, pose]) => [id, structuredClone(pose)])), loaded_regions: this.loaded_regions }; }
    loadState(state) {
        this.rooms.loadState(state?.rooms);
        this.#memory = new Map(Object.entries(state?.memory ?? {}).filter(([id]) => this.#byId.has(id)).map(([id, pose]) => [id, structuredClone(pose)]));
        for (const [id, pose] of this.#memory) { const e = this.entity(id); if (e) e.updateBody({ position: [...pose.position], rotation: pose.rotation }); }   // (already built round the spawn: put it where it was left)
        return this;
    }
    getStatistics() { return { ...this.#stats, entries: this.#entries.length, regions: this.#regions.size, loaded_regions: this.#tiers.get('entities').loaded.size, remembered: this.#memory.size }; }

    /** Releases every entity this map built and every tier's regions (region memory is kept for a later instance via saveState). */
    destroy() { for (const tier of this.#tiers.values()) { for (const key of tier.loaded) tier.release(key, this.#regionBounds(key)); tier.loaded.clear(); } for (const entry of this.#entries) if (entry.entity) this.#release(entry); }
}

/** One active map per physics world. */
export class mapSystem {
    #physics; #current = null;
    constructor(physics) { if (!physics?.createEntity) throw new TypeError('mapSystem requires a physicsSystem'); this.#physics = physics; }
    get current() { return this.#current; }
    /** Replaces the active map. The previous map's entities are released first. */
    load(definition, options = {}) {
        this.unload();
        this.#current = new mapInstance(this.#physics, definition, options);
        return this.#current;
    }
    unload() { this.#current?.destroy(); this.#current = null; }
}
