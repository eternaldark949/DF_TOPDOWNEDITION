// The Directory's prop library and map layouts. Any map, native or classic, places props from
// the one catalog (game-assets/props.json); each map file (game-assets/maps/<map_id>.json) lists
// only placements, lamps, NPC spawns and soft lights. Geometry (walls, exits, rooms, doors) stays
// in GAME_DB.places.
import props from './game-assets/props.json' with { type: 'json' };
import apt_949 from './game-assets/maps/apt_949.json' with { type: 'json' };
import auto_shop from './game-assets/maps/auto_shop.json' with { type: 'json' };
import biggs_arena from './game-assets/maps/biggs_arena.json' with { type: 'json' };
import church_boss from './game-assets/maps/church_boss.json' with { type: 'json' };
import cozy_cafe_interior from './game-assets/maps/cozy_cafe_interior.json' with { type: 'json' };
import demoness_palace from './game-assets/maps/demoness_palace.json' with { type: 'json' };
import enni_cole_interior from './game-assets/maps/enni_cole_interior.json' with { type: 'json' };
import enni_cole_upper from './game-assets/maps/enni_cole_upper.json' with { type: 'json' };
import ethereal_plane from './game-assets/maps/ethereal_plane.json' with { type: 'json' };
import hotel_lobby from './game-assets/maps/hotel_lobby.json' with { type: 'json' };
import hotel_suite from './game-assets/maps/hotel_suite.json' with { type: 'json' };
import house_of_death from './game-assets/maps/house_of_death.json' with { type: 'json' };
import keepers_hill from './game-assets/maps/keepers_hill.json' with { type: 'json' };
import keepers_parlor from './game-assets/maps/keepers_parlor.json' with { type: 'json' };
import medbay_sw from './game-assets/maps/medbay_sw.json' with { type: 'json' };
import moon_city_nightclub from './game-assets/maps/moon_city_nightclub.json' with { type: 'json' };
import neural_sys_interior from './game-assets/maps/neural_sys_interior.json' with { type: 'json' };
import ollo_interior from './game-assets/maps/ollo_interior.json' with { type: 'json' };
import ollo_test from './game-assets/maps/ollo_test.json' with { type: 'json' };
import sdc from './game-assets/maps/sdc.json' with { type: 'json' };
import van_interior from './game-assets/maps/van_interior.json' with { type: 'json' };

const LAYOUTS = { apt_949, auto_shop, biggs_arena, church_boss, cozy_cafe_interior, demoness_palace, enni_cole_interior, enni_cole_upper, ethereal_plane, hotel_lobby, hotel_suite, house_of_death, keepers_hill, keepers_parlor, medbay_sw, moon_city_nightclub, neural_sys_interior, ollo_interior, ollo_test, sdc, van_interior };

export const PROP_TYPES = props.resources.catalog.data.types;
export const MAP_IDS = Object.freeze(Object.keys(LAYOUTS));

/** The `df_props` library (catalog) and the `df_maps` library (one map_layout resource per map). */
export function createMapLibraries() {
    return [props, { library_id: 'df_maps', description: 'Placements, lamps, NPC spawns and soft lights per map.', templates: {},
        resources: Object.fromEntries(Object.entries(LAYOUTS).map(([id, data]) => [id, { kind: 'map_layout', data }])) }];
}

/** A placement's full authored options: its type's defaults, then its own fields (null removes a default). */
export function resolvePlacement(placement, types = PROP_TYPES) {
    const { type, ...fields } = placement, entry = types[type];
    if (!entry) throw new Error(`Unknown prop type: ${type}`);
    const options = structuredClone(entry.defaults);
    for (const [key, value] of Object.entries(fields)) {
        if (value === null) delete options[key]; else options[key] = structuredClone(value);
    }
    return options;
}

/** Whether the player can grab and push props of this type. */
export const isMovableProp = (type, types = PROP_TYPES) => !!types[type]?.movable;

/** 'native' when a Basement scene owns the map, otherwise 'classic'. A map file's `host` field is its migration switch. */
export const mapHost = (map_id, layouts = LAYOUTS) => layouts[map_id]?.host ?? 'classic';

/**
 * A map's layout with every placement resolved: { props, prop_types, lamps, npcs, soft_lights? }.
 * `prop_types[i]` names the type of `props[i]`. Every value is a detached copy.
 */
export function resolveMapLayout(map_id, { layouts = LAYOUTS, types = PROP_TYPES } = {}) {
    const layout = layouts[map_id];
    if (!layout) return { props: [], prop_types: [], lamps: [], npcs: [] };
    const result = { props: layout.props.map(p => resolvePlacement(p, types)), prop_types: layout.props.map(p => p.type),
        lamps: structuredClone(layout.lamps), npcs: structuredClone(layout.npcs) };
    if (layout.soft_lights) result.soft_lights = structuredClone(layout.soft_lights);
    return result;
}
