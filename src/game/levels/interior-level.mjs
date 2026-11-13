import { mapLevel } from '../../engine/lobby/runtime/map-level.mjs';
import { interiorMapDefinition, APARTMENT_MAP_OPTIONS } from './apartment-definition.mjs';
import { MAP_IDS } from '../data/game-maps.mjs';

/**
 * An interior of the game as a runtime level: its level_id is the map id, its map is built from the
 * Directory's map and room records and its layout file. Doors open for characters as they come near.
 * Exits lead to the levels they name; one whose target is not registered is offered as unavailable.
 */
export class InteriorLevel extends mapLevel {
    mapDefinition({ assets }) {
        const map = assets.getResource('df:map_definitions').data[this.level_id], rooms = assets.getResource('df:room_definitions').data[this.level_id];
        this.rules = assets.getResource('df_apartment:rules').data;
        return { definition: interiorMapDefinition({ map_id: this.level_id, map, rooms }).definition, map_options: APARTMENT_MAP_OPTIONS };
    }
    mapUpdateOptions() { return { near_range: door => door.data.appearance?.triggerRadius ?? 90, duration: this.rules.DOOR_DURATION, include_groups: 2 }; }
}
/** Registers each interior map as a level (default: every map with a layout file whose record is an indoor map). */
export function registerInteriorLevels(engine, map_ids) {
    const records = engine.api.assets.getResource('df:map_definitions').data;
    for (const id of map_ids ?? MAP_IDS.filter(id => records[id]?.type === 'indoor')) if (!engine.listLevels().includes(id)) engine.registerLevel(id, InteriorLevel);
    return engine;
}
