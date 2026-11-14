import CITY from '../data/game-assets/generated/sdc-city.json' with { type: 'json' };

/**
 * The city as a map definition, from the file its seeded generator was exported to once
 * (tools/export-city.mjs): building footprints and yard walls are walls, street lamps are lights, the
 * doors into buildings are `transition` triggers. It streams by region like every map. The ground,
 * the buildings' looks, neon, foliage and decor stay as the city's game data for its artists.
 * The bodies load 3072 px round the camera: past the light layer's reach (the view, the tiles readied
 * ahead of it and a lamp's radius), so a wall streaming in never recasts a shadow on a tile already painted.
 */
export function cityMapDefinition({ map, regions = { size: 1024, radius: 3072 } }) {
    if (!map) throw new TypeError('Unknown map: sdc');
    const city = structuredClone(CITY);
    if (city.size[0] !== map.width || city.size[1] !== map.height) throw new Error(`The exported city is ${city.size.join('×')} px, the map record ${map.width}×${map.height}: run node tools/export-city.mjs`);
    const { roads, blocks, pavements, crosswalks, floor_zones, pools, buildings, neon, foliage, props } = city;
    return {
        map, city: { roads, blocks, pavements, crosswalks, floor_zones, pools, buildings, neon, foliage, props },
        definition: {
            map_id: 'sdc', kind: 'exterior', size: [map.width, map.height], boundary: { thickness: 20 }, spawn: [map.spawn.x, map.spawn.y], regions,
            walls: [...city.colliders, ...city.walls],
            lights: city.lamps.map(l => ({ position: [l.x, l.y], radius: l.lightRadius, color: l.color, data: { lamp_type: l.lampType, fixture: l.fixture ?? null, angle: l.angle ?? null } })),
            triggers: city.transitions.map((t, index) => ({ x: t.x, y: t.y, w: t.w, h: t.h, role: 'transition', authored_id: `exit_${index}`, data: { target: t.target, label: t.label ?? null } }))
        }
    };
}

/** The city at night is one outdoor room over the whole map: the sky's darkness, cut by the lamps. */
export const cityRooms = map => [{ type: 'outdoor', rects: [{ x: 0, y: 0, w: map.width, h: map.height }] }];
