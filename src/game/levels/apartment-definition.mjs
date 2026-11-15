import { buildMapPackets } from '../../engine/basement/maps/index.mjs';
import { mapDefinition, MAP_OPTIONS } from './map-definition.mjs';

/** The apartment's map definition: the shared map loader on its records. */
export function apartmentMapDefinition(game_db) {
    return mapDefinition({ map_id: 'apt_949', map: game_db.places.maps.apt_949, rooms: game_db.places.rooms.apt_949 });
}

/** Authored data -> native packets, once at scene construction. No runtime collision policy. */
export function resolveApartmentDefinition(library, game_db) {
    const { map, rooms, layout, definition } = apartmentMapDefinition(game_db);
    const built = buildMapPackets(definition, MAP_OPTIONS);
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
