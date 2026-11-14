// ===== LV0 BASEMENT =====
import { resolveDoorKinds, doorKind, leafIds } from './doors.mjs';
/**
 * Rooms of one map: which rooms exist, how they connect, how open each connection is right now,
 * and which room each tracked body is in. Room volumes live in the world's one spatial grid (the
 * map builder makes one ghost per rectangle); this keeps only the room definitions and the graph.
 *
 * A link joins two rooms: a door (its openness follows the door's leaf from closed to open), an
 * arch (always open), or an authored `room_links` entry with a fixed openness.
 */
const inside = (rect, x, y) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

export class roomGraph {
    #physics; #map; #rooms = new Map(); #links = []; #adjacent = new Map(); #tracked = new Map(); #listeners = new Set(); #last = null;
    #stats = { lookups: 0, grid_lookups: 0, changes: 0 };
    constructor(physics, map, definition, door_kinds = resolveDoorKinds()) {
        this.#physics = physics; this.#map = map;
        for (const [id, room] of Object.entries(definition.rooms ?? {})) {
            const rects = (room.rects ?? [{ x: room.x, y: room.y, w: room.w, h: room.h }]).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
            const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y)), x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h));
            this.#rooms.set(id, { id, type: room.type ?? 'indoor', label: room.label ?? id, rects, bounds: { left: x0, top: y0, right: x1, bottom: y1 }, flags: {} });
            this.#adjacent.set(id, []);
        }
        const add = (rooms, link) => {
            const [a, b] = rooms ?? [];
            if (!this.#rooms.has(a) || !this.#rooms.has(b) || a === b) throw new Error(`A room link must join two different known rooms: ${rooms}`);
            const entry = { ...link, rooms: [a, b] };
            this.#links.push(entry); this.#adjacent.get(a).push(entry); this.#adjacent.get(b).push(entry);
        };
        // A door whose kind has no leaves (an arch) is always open; otherwise the link is as open as its most open leaf.
        (definition.doors ?? []).forEach((d, i) => {
            if (!d.rooms) return;
            const key = `door_${i}`, kind = doorKind(door_kinds, d, key);
            add(d.rooms, kind.leaves.length ? { link_id: key, kind: 'door', door_id: key, leaf_ids: leafIds(key, kind) } : { link_id: key, kind: 'arch', openness: 1 });
        });
        (definition.room_links ?? []).forEach((l, i) => add(l.rooms, { link_id: l.link_id ?? `link_${i}`, kind: 'opening', openness: clamp01(l.openness ?? 1) }));
    }

    /** Room records `{id, type, label, rects, bounds, flags}` (read-only views; use setFlag to change flags). */
    get rooms() { return [...this.#rooms.values()]; }
    room(id) { return this.#rooms.get(id) ?? null; }
    contains(id, [x, y]) { const r = this.#rooms.get(id); return !!r && r.rects.some(rect => inside(rect, x, y)); }

    /** The room at a point, or null. Checks the last answer first, then the world's spatial grid. */
    roomAt(point) {
        this.#stats.lookups++;
        if (this.#last && this.contains(this.#last, point)) return this.#rooms.get(this.#last);
        this.#stats.grid_lookups++;
        const [x, y] = point;
        for (const handle of this.#physics.queryEntitiesInBounds({ bounds: { left: x, right: x, top: y, bottom: y }, include_ghosts: true })) {
            const data = handle.entity?.data;
            if (data?.role === 'room' && this.#rooms.has(data.room_id) && this.contains(data.room_id, point)) { this.#last = data.room_id; return this.#rooms.get(data.room_id); }
        }
        return null;
    }

    /** 0 (shut) … 1 (wide open) for one link: the most open of its door's leaves, each read from its current pose. */
    linkOpenness(link) {
        if (link.kind !== 'door') return link.openness;
        let best = 0;
        for (const id of link.leaf_ids) {
            const leaf = this.#map.entity(id);
            if (!leaf) continue;
            const d = leaf.data, travel = Math.hypot(d.open_position[0] - d.closed_position[0], d.open_position[1] - d.closed_position[1]), turn = Math.abs(d.open_rotation - d.closed_rotation);
            const open = travel > 1e-9 ? clamp01(Math.hypot(leaf.position[0] - d.closed_position[0], leaf.position[1] - d.closed_position[1]) / travel)
                : turn > 1e-9 ? clamp01(Math.abs((leaf.rotation ?? 0) - d.closed_rotation) / turn) : (d.open ? 1 : 0);
            best = Math.max(best, open);
        }
        return best;
    }

    /** Rooms joined to `id`: `[{room, link_id, kind, openness}]`. */
    connections(id) { return (this.#adjacent.get(id) ?? []).map(l => ({ room: l.rooms[0] === id ? l.rooms[1] : l.rooms[0], link_id: l.link_id, kind: l.kind, openness: this.linkOpenness(l) })); }
    /** The most open direct link between two rooms (0 if none). */
    openness(a, b) { let best = 0; for (const c of this.connections(a)) if (c.room === b && c.openness > best) best = c.openness; return best; }

    /** The fewest-rooms route from `a` to `b` through links at least `min_openness` open, or null. */
    route(a, b, { min_openness = 1e-3 } = {}) {
        if (!this.#rooms.has(a) || !this.#rooms.has(b)) return null;
        const previous = new Map([[a, null]]), queue = [a];
        for (let i = 0; i < queue.length; i++) {
            const id = queue[i]; if (id === b) break;
            for (const c of this.connections(id)) if (c.openness >= min_openness && !previous.has(c.room)) { previous.set(c.room, id); queue.push(c.room); }
        }
        if (!previous.has(b)) return null;
        const path = []; for (let id = b; id !== null; id = previous.get(id)) path.unshift(id);
        return path;
    }
    reachable(a, b, options) { return this.route(a, b, options) !== null; }

    /**
     * How much of `from` reaches every room: the best product of link openness along any route,
     * each step also scaled by `falloff` (1 = no loss). For light spill, sound and awareness.
     */
    exposure(from, { falloff = 1 } = {}) {
        const result = new Map([...this.#rooms.keys()].map(id => [id, 0]));
        if (!this.#rooms.has(from)) return result;
        result.set(from, 1);
        const open = this.#links.map(l => this.linkOpenness(l));
        for (let pass = 0; pass < this.#rooms.size; pass++) {
            let changed = false;
            this.#links.forEach((l, i) => {
                const [a, b] = l.rooms, k = open[i] * falloff;
                if (result.get(a) * k > result.get(b) + 1e-12) { result.set(b, result.get(a) * k); changed = true; }
                if (result.get(b) * k > result.get(a) + 1e-12) { result.set(a, result.get(b) * k); changed = true; }
            });
            if (!changed) break;
        }
        return result;
    }

    /**
     * Track a body's room. `keep_in_gaps` (default true) leaves a body in its last room while it
     * stands in a wall gap or doorway that belongs to no room.
     */
    track(entity, { keep_in_gaps = true } = {}) {
        if (!this.#tracked.has(entity)) this.#tracked.set(entity, { room: this.roomAt(entity.position)?.id ?? null, keep_in_gaps });
        return this.roomOf(entity);
    }
    untrack(entity) { this.#tracked.delete(entity); }
    roomOf(entity) { const t = this.#tracked.get(entity); return t?.room ? this.#rooms.get(t.room) : null; }
    /** Tracked bodies currently in a room. */
    occupants(id) { const out = []; for (const [entity, t] of this.#tracked) if (t.room === id) out.push(entity); return out; }
    /** `fn({entity, from, to})` on every room change; returns an unsubscribe function. */
    onRoomChange(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }

    /** Re-reads each tracked body's room. A body that stays inside its room costs one rectangle test. */
    updateState() {
        for (const [entity, t] of this.#tracked) {
            if (entity.destroyed) { this.#tracked.delete(entity); continue; }
            if (t.room && this.contains(t.room, entity.position)) continue;
            const next = this.roomAt(entity.position)?.id ?? (t.keep_in_gaps ? t.room : null);
            if (next === t.room) continue;
            const from = t.room; t.room = next; this.#stats.changes++;
            for (const fn of this.#listeners) fn({ entity, from, to: next });
        }
    }

    /** Per-room game flags (lights off, alarm, locked, ...). Saved with the map. */
    setFlag(id, key, value) { const r = this.#rooms.get(id); if (!r) throw new Error(`Unknown room: ${id}`); if (value === undefined) delete r.flags[key]; else r.flags[key] = structuredClone(value); }
    getFlag(id, key) { return this.#rooms.get(id)?.flags[key]; }
    saveState() { return Object.fromEntries([...this.#rooms].filter(([, r]) => Object.keys(r.flags).length).map(([id, r]) => [id, structuredClone(r.flags)])); }
    loadState(flags = {}) { for (const [id, r] of this.#rooms) r.flags = structuredClone(flags[id] ?? {}); }
    getStatistics() { return { ...this.#stats, rooms: this.#rooms.size, links: this.#links.length, tracked: this.#tracked.size }; }
}
