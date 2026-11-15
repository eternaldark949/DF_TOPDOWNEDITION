import { mapLevel } from '../../engine/lobby/runtime/map-level.mjs';
import { gameCharacter } from '../../engine/basement/physics/index.mjs';
import { mapDefinition, lightingRooms, MAP_OPTIONS } from './map-definition.mjs';
import { MAP_IDS } from '../data/game-maps.mjs';

import { mapScene } from '../presentation/map-scene.mjs';
import { streetLife } from '../mechanics/street-life.mjs';
import { Pedestrian } from '../entities/pedestrians.mjs';

/**
 * Any map of the game as a runtime level, the same for every map: its level_id is the map id, its map is
 * built from the map's data (`mapDefinition`) and streams round the people in it, and its doors open for
 * characters as they come near. What else runs on it is the map's switches (`mapSwitches`): `traffic` and
 * `walkers` start its street life (`streetLife`, as `street`) round the player each step, and `ground`,
 * `buildings`, `plants` and `lighting` draw it (`mapScene`, as `scene`). A map with every switch off is
 * only its bodies. Exits lead to the levels they name; one whose target is not registered is offered as
 * unavailable. `prepare(context, {street: false})` keeps the street empty whatever the switches say. The
 * bodies on the map are drawn by `drawBodies(context, blend, frame)`, plain shapes by default, for a host
 * to replace with its artists.
 */
export class GameMapLevel extends mapLevel {
    street = null; scene = null;
    mapDefinition({ assets }) {
        const map = assets.getResource('df:map_definitions').data[this.level_id], rooms = assets.getResource('df:room_definitions').data[this.level_id];
        this.rules = assets.getResource('df_apartment:rules').data;
        const built = mapDefinition({ map_id: this.level_id, map, rooms });
        this.record = built.map; this.sections = built.sections; this.switches = built.switches; this.soft_lights = built.layout.soft_lights ?? [];
        return { definition: built.definition, map_options: MAP_OPTIONS };
    }
    async prepare(context, options = {}) { return { ...await super.prepare(context, options), street: options.street ?? true }; }
    enter(context, prepared) {
        super.enter(context, prepared);
        const [width, height] = this.definition.size, s = this.switches, world = context.api.physics;
        context.api.camera.setBounds({ left: 0, top: 0, right: width, bottom: height });
        if (s.ground || s.buildings || s.plants || s.lighting)
            this.scene = new mapScene({ sections: this.sections, definition: this.definition, physics: world, rooms: lightingRooms(this.definition), switches: s, soft_lights: this.soft_lights });
        if (prepared.street !== false && (s.traffic || s.walkers))
            this.street = new streetLife(world, { navigation: this.sections.navigation ?? undefined, sidewalks: this.sections.sidewalks, intersections: this.sections.streets.intersections, traffic: s.traffic, walkers: s.walkers });
    }
    mapUpdateOptions() { return { near_range: door => door.data.appearance?.triggerRadius ?? 90, duration: this.rules.DOOR_DURATION, include_groups: 2 }; }
    /** Every character but the street's walkers (they come and go round the player; the map need not build round them). */
    mapFocuses(context) {
        const focuses = context.api.physics.elements.getEntities({ instance_of: gameCharacter }).filter(e => e.active !== false && !e.destroyed && !(e instanceof Pedestrian)).map(e => ({ position: e.position, velocity: e.linear_velocity }));
        return focuses.length ? focuses : [this.definition.spawn];
    }
    afterPhysics(context, seconds) {
        super.afterPhysics(context, seconds);
        if (!this.street) return;
        const world = context.api.physics, focus = context.api.session?.player?.position ?? this.mapFocuses(context)[0].position ?? this.definition.spawn;
        this.street.updateState(seconds, { focus, time: world.simulation_tick * world.config.fixed_step });
    }
    render(context, blend, frame) {
        if (!this.scene) return;
        const view = context.api.camera.getView(blend), world = context.api.physics;
        this.scene.render(frame, { view: view.bounds, zoom: view.zoom, time: world.simulation_tick * world.config.fixed_step,
            lamps: [...this.map.entities('lamp'), ...this.map.entities('neon')], props: this.map.entities('prop'), bodies: f => this.drawBodies(context, blend, f) });
    }
    /** Each vehicle in view, then each character on foot or at a wheel, as its collision shape. */
    drawBodies(context, blend, frame) {
        const hits = context.api.render.getVisibleEntities({ blend }).map(hit => hit.entity).filter(e => e.visible !== false);
        const cars = hits.filter(e => typeof e.getVehicleState === 'function'), people = hits.filter(e => e instanceof gameCharacter);
        for (const entity of [...cars, ...people]) {
            const pose = entity.getRenderState(blend), shape = entity.collision_shape, car = cars.includes(entity);
            frame.submit({ type: 'shape', position: pose.position, rotation: pose.rotation,
                geometry: shape.shape_type === 'circle' ? { type: 'ellipse', radii: [shape.radius, shape.radius] } : { type: 'rect', size: shape.dimensions, radius: car ? 8 : 0 },
                material: { fill: car ? entity.data.color ?? '#3a3348' : entity.entity_type === 'df_player' ? '#f4d8ff' : '#c9f6ef', stroke: car ? '#8a80a8' : '#1b1424', stroke_width: 2 } });
        }
    }
    leave(context) { this.street?.clearStreet(); this.street = null; this.scene = null; super.leave(context); }
}

/** Registers each map as a level (default: every map with a layout file). */
export function registerMapLevels(engine, map_ids = MAP_IDS) {
    for (const id of map_ids) if (!engine.listLevels().includes(id)) engine.registerLevel(id, GameMapLevel);
    return engine;
}
