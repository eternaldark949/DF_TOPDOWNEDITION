// ===== LV1 LOBBY =====
import { gameLevel } from './game-level.mjs';
import { mapInstance } from '../../basement/maps/index.mjs';

/**
 * A level that is one Basement map. A subclass says which map with `mapDefinition`; the level builds
 * it on entry, keeps its doors and rooms current each step, and releases it on exit. Its exits are
 * the map's triggers whose data names a `target` level (with an optional `label`, and `auto` to travel
 * on contact). Arriving travellers are placed just inside the exit that leads back where they came
 * from, stepping in from the map edge the exit sits on, or at the map's spawn.
 */
export class mapLevel extends gameLevel {
    map = null;
    /** Returns `{definition, map_options}` for this level; `assets` is the Directory data source. */
    mapDefinition({ assets }, options) { throw new Error(`${this.constructor.name} must give its map definition`); }
    async prepare(context, options = {}) {
        const { definition, map_options = {} } = await this.mapDefinition(context, options);
        if (!definition?.size) throw new TypeError('A map level needs a map definition with a size');
        return { definition, map_options, arrival: options.arrival ?? null, travellers: [...(options.travellers ?? [])] };
    }
    enter(context, prepared) {
        this.map = new mapInstance(context.api.physics, prepared.definition, prepared.map_options);
        this.definition = prepared.definition;
        const travellers = prepared.travellers.map(id => context.api.elements.fetchEntity(id)).filter(e => e && !e.destroyed);
        if (travellers.length) this.placeTravellers(context, travellers, this.arrivalPose(context, prepared.arrival?.from ?? null, travellers[0]));
        this.map.setFocus(this.mapFocuses(context), { budget_ms: Infinity });   // (the arriving regions, whole, behind the level change)
    }
    afterPhysics(context, seconds) { this.map.setFocus(this.mapFocuses(context), { budget_ms: this.mapStreamBudget(context) }); this.map.updateState(this.mapUpdateOptions(context)); }
    /**
     * What the map streams round: `[x, y]` points or `{position, velocity}`. By default every active
     * character body (so no one walks where walls are not built), or the map's spawn when there is none.
     * A level overrides it to stream round fewer (the player, companions, a pinned mission point).
     */
    mapFocuses(context) {
        const focuses = context.api.physics.elements.getEntities().filter(e => e.active !== false && !e.destroyed && e.body?.getState().physics_type === 'character').map(e => ({ position: e.position, velocity: e.linear_velocity }));
        return focuses.length ? focuses : [this.map.spawn ?? this.definition.size.map(v => v / 2)];
    }
    /** Milliseconds a step may spend building regions (the rest wait for the next step). */
    mapStreamBudget(context) { return 3; }
    /** What `map.updateState` is given each step (door ranges, who opens doors). */
    mapUpdateOptions(context) { return {}; }
    leave(context) { this.map?.destroy(); this.map = null; }
    /** Every exit: `{entity, target, label, auto, bounds}`. */
    getExits() {
        if (!this.map) return [];
        return this.map.entities().filter(e => typeof e.data?.target === 'string').map(entity => {
            const b = entity.physics_system.getBodyBounds(entity); return { entity, target: entity.data.target, label: entity.data.label ?? null, auto: !!entity.data.auto, bounds: b };
        });
    }
    /** The exit a body stands in, or null. */
    exitAt(body) {
        for (const exit of this.getExits()) if (exit.entity.physics_system.containsPoint(exit.entity, body.position)) return exit;
        return null;
    }
    /** Where someone arriving from `from` stands: inside the exit leading back there, else the map's spawn. */
    arrivalPose(context, from, body) {
        const world = context.api.physics, [width, height] = this.definition.size, spawn = this.definition.spawn ?? [width / 2, height / 2];
        const gate = from === null ? null : this.getExits().find(exit => exit.target === from);
        if (!gate) return { position: [...spawn], rotation: -Math.PI / 2 };
        const b = gate.bounds, cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
        const edges = { S: height - b.bottom, N: b.top, W: b.left, E: width - b.right }, side = Object.keys(edges).reduce((a, k) => edges[a] <= edges[k] ? a : k);
        const dir = { S: [0, -1], N: [0, 1], W: [1, 0], E: [-1, 0] }[side];
        const inExit = p => this.getExits().some(exit => world.containsPoint(exit.entity, p));
        for (let step = 20; step <= 200; step += 10) {
            const position = [side === 'S' || side === 'N' ? cx : (dir[0] > 0 ? b.right : b.left) + dir[0] * step, side === 'W' || side === 'E' ? cy : (dir[1] > 0 ? b.bottom : b.top) + dir[1] * step];
            if (!inExit(position) && world.isPlacementClear(body, position, { ignore_body: body, include_ghosts: false })) return { position, rotation: Math.atan2(dir[1], dir[0]) };
        }
        return { position: [...spawn], rotation: -Math.PI / 2 };
    }
    /** The leader at the pose; each follower in the nearest clear spot beside it or further in, never in an exit. */
    placeTravellers(context, [leader, ...followers], pose) {
        const world = context.api.physics, ahead = [Math.cos(pose.rotation), Math.sin(pose.rotation)], side = [-ahead[1], ahead[0]];
        const put = (body, position) => world.updateBody(body, { position, rotation: pose.rotation, linear_velocity: [0, 0], angular_velocity: 0 });
        const inExit = p => this.getExits().some(exit => world.containsPoint(exit.entity, p));
        put(leader, pose.position);
        const spots = [];
        for (let ring = 0; ring <= 6; ring++) for (const lateral of ring ? [0, 1, -1, 2, -2] : [1, -1, 2, -2]) spots.push([pose.position[0] + ahead[0] * 26 * ring + side[0] * 24 * lateral, pose.position[1] + ahead[1] * 26 * ring + side[1] * 24 * lateral]);
        for (const body of followers) put(body, spots.find(p => !inExit(p) && world.isPlacementClear(body, p, { ignore_body: body, include_ghosts: false })) ?? pose.position);
    }
}
