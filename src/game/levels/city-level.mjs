import { mapLevel } from '../../engine/lobby/runtime/map-level.mjs';
import { cityMapDefinition, cityRooms } from './city-definition.mjs';
import { PROP_TYPES } from '../data/game-maps.mjs';
import { cityScene } from '../presentation/city-scene.mjs';

/**
 * The city as a runtime level: its map is built from the exported city (`cityMapDefinition`) and streams
 * round the people in it, and it draws itself through `cityScene` at night. Its level_id is the city's
 * map id (`sdc`). The bodies on the street are drawn by `drawBodies(context, blend, frame)`, plain shapes
 * by default, for a host to replace with its artists.
 */
export class CityLevel extends mapLevel {
    mapDefinition({ assets }) {
        const record = assets.getResource('df:map_definitions').data[this.level_id], { definition, city } = cityMapDefinition({ map: record });
        this.city = city; this.record = record;
        return { definition, map_options: { prop_types: PROP_TYPES } };
    }
    enter(context, prepared) {
        super.enter(context, prepared);
        const [width, height] = this.definition.size;
        this.scene = new cityScene({ city: this.city, definition: this.definition, physics: context.api.physics, rooms: cityRooms(this.record) });
        context.api.camera.setBounds({ left: 0, top: 0, right: width, bottom: height });
    }
    render(context, blend, frame) {
        const view = context.api.camera.getView(blend), world = context.api.physics;
        this.scene.render(frame, { view: view.bounds, zoom: view.zoom, time: world.simulation_tick * world.config.fixed_step,
            lamps: [...this.map.entities('lamp'), ...this.map.entities('neon')], props: this.map.entities('prop'), bodies: f => this.drawBodies(context, blend, f) });
    }
    /** Each vehicle in view, then each character on foot or at a wheel, as its collision shape. */
    drawBodies(context, blend, frame) {
        const hits = context.api.render.getVisibleEntities({ blend }).map(hit => hit.entity).filter(e => e.visible !== false);
        const cars = hits.filter(e => typeof e.getVehicleState === 'function'), people = hits.filter(e => e.body?.getState().physics_type === 'character');
        for (const entity of [...cars, ...people]) {
            const pose = entity.getRenderState(blend), shape = entity.collision_shape, car = cars.includes(entity);
            frame.submit({ type: 'shape', position: pose.position, rotation: pose.rotation,
                geometry: shape.shape_type === 'circle' ? { type: 'ellipse', radii: [shape.radius, shape.radius] } : { type: 'rect', size: shape.dimensions, radius: car ? 8 : 0 },
                material: { fill: car ? entity.data.color ?? '#3a3348' : entity.entity_type === 'df_player' ? '#f4d8ff' : '#c9f6ef', stroke: car ? '#8a80a8' : '#1b1424', stroke_width: 2 } });
        }
    }
    leave(context) { this.scene = null; super.leave(context); }
}
