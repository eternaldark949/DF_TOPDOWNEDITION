import { buildMapPackets } from '../../engine/basement/maps/index.mjs';
import { resolveMapLayout, PROP_TYPES } from '../data/game-maps.mjs';

const TEMPLATES = { wall: 'df_apartment:wall', prop: 'df_apartment:furniture', light: 'df_apartment:lamp', trigger: 'df_apartment:transition', room: 'df_apartment:transition', door: 'df_apartment:door', cloth: 'df_apartment:curtain' };

/**
 * GAME_DB geometry + the apartment's layout file (props from the shared catalog) -> a generic
 * Basement map definition. The Basement map builder turns it into packets; `decorate` adds the
 * game data the apartment's artists and interactions read.
 */
export function apartmentMapDefinition(game_db) {
    return interiorMapDefinition({ map_id: 'apt_949', map: game_db.places.maps.apt_949, rooms: game_db.places.rooms.apt_949 });
}

/**
 * Any interior from its GAME_DB map and rooms records and its layout file, the same way. Rooms are
 * optional: a map without them has no doors, room volumes or curtains. Exits are `transition`
 * triggers whose data names the `target` map and its `label`.
 */
export function interiorMapDefinition({ map_id, map, rooms = null }) {
    if (!map) throw new TypeError(`Unknown map: ${map_id}`);
    map = structuredClone(map); rooms = structuredClone(rooms ?? { rooms: {}, doors: [], linens: [] });
    const layout = resolveMapLayout(map_id);
    return {
        map, rooms, layout,
        definition: {
            map_id, kind: 'interior', size: [map.width, map.height], boundary: { thickness: 20 }, spawn: [map.spawn.x, map.spawn.y],
            walls: map.walls ?? [],
            placements: layout.props.map((p, index) => {
                const lamp = layout.lamps.find(l => l.parent_prop === index);
                // A prop's own light is a shadowless pool; a lamp standing on it is a shadowed fixture.
                const light = p.light ? { ...p.light, shadows: p.light.shadows ?? 'none' } : lamp ? { radius: lamp.lightRadius, color: lamp.color, intensity: lamp.intensity } : null;
                return { type: layout.prop_types[index], x: p.x, y: p.y, width: p.width, height: p.height, ...(light ? { light } : {}), source: p };
            }),
            lights: layout.lamps.filter(l => l.parent_prop === undefined).map(l => ({ position: [l.x, l.y], radius: l.lightRadius, color: l.color, intensity: l.intensity, source: l })),
            triggers: (map.transitions ?? []).map((r, index) => ({ ...r, role: 'transition', authored_id: `exit_${index}`, data: { target: r.target, label: r.label ?? null } })),
            rooms: rooms.rooms ?? {},
            doors: (rooms.doors ?? []).map(d => ({ ...d, source: d })),
            cloths: (rooms.linens ?? []).map(l => ({ ...l, role: 'curtain', source: l }))
        }
    };
}

/** The apartment's game data on each generic packet. */
function decorate(packet, { section, source }) {
    const data = packet.data;
    if (section === 'placements') {
        const p = source.source;
        Object.assign(data, { appearance: structuredClone(p), interaction_type: p.interactionType ?? null, room_id: p.roomId ?? null, note_id: p.noteId ?? null });
    }
    if (section === 'lights') data.appearance = structuredClone(source.source);
    if (section === 'doors' || section === 'cloths') data.appearance = source.source;
    return packet;
}

/** How the apartment's map definition becomes packets: its templates and game data. */
export const APARTMENT_MAP_OPTIONS = Object.freeze({ templates: TEMPLATES, decorate, prop_types: PROP_TYPES });

/** Authored data -> native packets, once at scene construction. No runtime collision policy. */
export function resolveApartmentDefinition(library, game_db) {
    const { map, rooms, layout, definition } = apartmentMapDefinition(game_db);
    const built = buildMapPackets(definition, APARTMENT_MAP_OPTIONS);
    const walls = built.entries.filter(e => e.section === 'walls');
    map.walls = walls.slice(0, walls.length - 4).map(e => e.source);   // the cut walls, without the boundary ring
    return { rules: library.getResource('df_apartment:rules').data, map, rooms, definition, entities: built.entries.map(e => e.packet),
        soft_lights: layout.soft_lights, player: { template: 'df_apartment:player', position: built.spawn } };
}

export function resolveApartmentDyer(game_db){
    const p=game_db.places.dyer_station;
    const position=[p.x+p.width/2,p.y+p.height/2];
    return {template:'df_apartment:furniture',position,collision_shape:{shape_type:'box',dimensions:[p.width,p.height]},
        data:{role:'prop',authored_id:'clothing_dyer',movable:false,interaction_type:'clothing_dyer',home_position:position,home_rotation:0,
            appearance:{...p,color:'#3a2430',interactionType:'clothing_dyer',decorType:'apt_dyer',family:'clothing_dyer'}}};
}
