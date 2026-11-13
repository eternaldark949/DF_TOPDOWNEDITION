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
 * One loaded map in one physics world. Interiors build every entity at load. Exteriors split
 * entries into square regions and build only the regions near the focus (`setFocus`); entries
 * larger than a region (boundaries, long walls, big buildings) stay loaded. A streamed movable
 * entity that was moved keeps its pose in the map's region memory while its region is unloaded.
 */
export class mapInstance {
    #physics; #entries; #openings; #byId = new Map(); #regions = new Map(); #loaded = new Set(); #memory = new Map(); #region_size; #stats = { region_loads: 0, region_unloads: 0, created: 0, destroyed: 0 };
    constructor(physics, definition, options = {}) {
        this.#physics = physics; this.map_id = definition.map_id ?? null;
        const built = buildMapPackets(definition, options);
        this.kind = built.kind; this.spawn = built.spawn; this.#entries = built.entries; this.#openings = built.openings;
        this.#region_size = definition.regions?.size ?? 1024;
        if (!(this.#region_size > 0)) throw new TypeError('Map region size must be positive');
        for (const entry of this.#entries) {
            const id = entry.packet.data?.authored_id;
            if (id !== undefined) { if (this.#byId.has(id)) throw new Error(`Duplicate map id: ${id}`); }
            entry.id = id ?? null; entry.entity = null;
            entry.region = this.kind === 'exterior' && extentOf(entry.packet) <= this.#region_size ? this.#regionKey(entry.packet.position) : null;
            if (entry.region !== null) { if (!this.#regions.has(entry.region)) this.#regions.set(entry.region, []); this.#regions.get(entry.region).push(entry); }
            if (id !== undefined) this.#byId.set(id, entry);
        }
        for (const entry of this.#entries) if (entry.region === null) this.#create(entry);
        /** Rooms, their links and who is in which (an empty graph when the map has no rooms). */
        this.rooms = new roomGraph(physics, this, definition, built.door_kinds);
    }
    #regionKey([x, y]) { return `${Math.floor(x / this.#region_size)},${Math.floor(y / this.#region_size)}`; }
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
     * Exteriors: build regions within `radius` of `point`, release regions beyond `radius + keep`
     * (hysteresis, default one region). Interiors ignore focus. Returns counts for this call.
     */
    setFocus(point, { radius = this.#region_size * 1.5, keep = this.#region_size } = {}) {
        if (this.kind !== 'exterior') return { loaded: 0, unloaded: 0 };
        const s = this.#region_size, [px, py] = point; let loaded = 0, unloaded = 0;
        const distance = key => { const [rx, ry] = key.split(',').map(Number); const dx = Math.max(rx * s - px, 0, px - (rx + 1) * s), dy = Math.max(ry * s - py, 0, py - (ry + 1) * s); return Math.hypot(dx, dy); };
        for (const key of [...this.#loaded]) if (distance(key) > radius + keep) { for (const entry of this.#regions.get(key)) this.#release(entry); this.#loaded.delete(key); unloaded++; this.#stats.region_unloads++; }
        for (const key of this.#regions.keys()) if (!this.#loaded.has(key) && distance(key) <= radius) { for (const entry of this.#regions.get(key)) this.#create(entry); this.#loaded.add(key); loaded++; this.#stats.region_loads++; }
        return { loaded, unloaded };
    }
    get loaded_regions() { return [...this.#loaded]; }

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
     * (interiors keep every entity in the snapshot), and creates any authored joint the snapshot
     * lacks (a save made before the entry had one). Unmatched entries are left unbuilt.
     */
    reconnect() {
        const live = new Map();
        for (const e of this.#physics.elements.getEntities()) if (e.data?.authored_id !== undefined) live.set(e.data.authored_id, e);
        for (const entry of this.#entries) { entry.entity = entry.id !== null ? live.get(entry.id) ?? null : null; this.#join(entry); }
    }

    /** Region memory and loaded regions, as plain data. Interiors save their bodies with the physics snapshot. */
    saveState() { return { map_id: this.map_id, rooms: this.rooms.saveState(), memory: Object.fromEntries([...this.#memory].map(([id, pose]) => [id, structuredClone(pose)])), loaded_regions: [...this.#loaded] }; }
    loadState(state) {
        this.rooms.loadState(state?.rooms);
        this.#memory = new Map(Object.entries(state?.memory ?? {}).filter(([id]) => this.#byId.has(id)).map(([id, pose]) => [id, structuredClone(pose)]));
        return this;
    }
    getStatistics() { return { ...this.#stats, entries: this.#entries.length, regions: this.#regions.size, loaded_regions: this.#loaded.size, remembered: this.#memory.size }; }

    /** Releases every entity this map built (exterior memory is kept for a later instance via saveState). */
    destroy() { for (const key of this.#loaded) for (const entry of this.#regions.get(key)) this.#release(entry); this.#loaded.clear(); for (const entry of this.#entries) if (entry.entity) this.#release(entry); }
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
