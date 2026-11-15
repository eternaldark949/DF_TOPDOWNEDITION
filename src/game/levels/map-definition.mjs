import { resolveMapLayout, mapSwitches, mapGenerated, PROP_TYPES } from '../data/game-maps.mjs';
import SDC_CITY from '../data/game-assets/generated/sdc-city.json' with { type: 'json' };

/** The game's templates for each map section. */
const TEMPLATES = { wall: 'df_apartment:wall', prop: 'df_apartment:furniture', light: 'df_apartment:lamp', trigger: 'df_apartment:transition', room: 'df_apartment:transition', door: 'df_apartment:door', cloth: 'df_apartment:curtain' };

/** Files a seeded generator exported once (tools/export-city.mjs), by the name a layout file gives in `generated`. */
const GENERATED = { 'sdc-city': SDC_CITY };

/**
 * Any map as a Basement map definition, the same way for every map: its GAME_DB map and rooms records, its
 * layout file (props from the shared catalog, lamps, soft lights, `switches`, `regions`) and, when the layout
 * names one, the file its generator exported (building footprints and yard walls are walls, street lamps and
 * neon are lights, the doors into buildings are exits). Rooms are optional: a map without a rooms record has
 * no doors or curtains, and an outdoor one is one outdoor room over the whole map. Exits are `transition`
 * triggers whose data names the `target` map and its `label`.
 *
 * Returns `{map, rooms, layout, switches, sections, definition}`: `switches` say which systems run on the
 * map (`mapSwitches`), and `sections` are the map's data those systems read (roads, sidewalks, ground,
 * buildings, plants: empty for a map that has none).
 */
export function mapDefinition({ map_id, map, rooms = null }) {
    if (!map) throw new TypeError(`Unknown map: ${map_id}`);
    map = structuredClone(map); rooms = structuredClone(rooms ?? { rooms: {}, doors: [], linens: [] });
    const layout = resolveMapLayout(map_id), switches = mapSwitches(map_id), source = mapGenerated(map_id);
    const exported = source ? structuredClone(GENERATED[source] ?? null) : null;
    if (source && !exported) throw new TypeError(`Unknown generated map file: ${source}`);
    if (exported && (exported.size[0] !== map.width || exported.size[1] !== map.height)) throw new Error(`The exported ${source} is ${exported.size.join('×')} px, the map record ${map.width}×${map.height}: run node tools/export-city.mjs`);
    const outdoor = map.type === 'outdoor', room_list = rooms.rooms ?? {};
    if (outdoor && !Object.keys(room_list).length) room_list.outdoor = { x: 0, y: 0, w: map.width, h: map.height, type: 'outdoor', label: map.label ?? map_id };
    const transitions = [...(map.transitions ?? []), ...(exported?.transitions ?? [])];
    return {
        map, rooms, layout, switches, sections: mapSections(exported),
        definition: {
            map_id, kind: outdoor ? 'exterior' : 'interior', size: [map.width, map.height], boundary: { thickness: 20 }, spawn: [map.spawn.x, map.spawn.y],
            ...(layout.regions ? { regions: layout.regions } : {}),
            walls: [...(map.walls ?? []), ...(exported?.colliders ?? []), ...(exported?.walls ?? [])],
            placements: layout.props.map((p, index) => {
                const lamp = layout.lamps.find(l => l.parent_prop === index);
                // A prop's own light is a shadowless pool; a lamp standing on it is a shadowed fixture.
                const light = p.light ? { ...p.light, shadows: p.light.shadows ?? 'none' } : lamp ? { radius: lamp.lightRadius, color: lamp.color, intensity: lamp.intensity } : null;
                return { type: layout.prop_types[index], x: p.x, y: p.y, width: p.width, height: p.height, ...(light ? { light } : {}), source: p };
            }),
            lights: [
                ...layout.lamps.filter(l => l.parent_prop === undefined).map(l => ({ position: [l.x, l.y], radius: l.lightRadius, color: l.color, intensity: l.intensity, source: l })),
                ...(exported?.lamps ?? []).map(l => ({ position: [l.x, l.y], radius: l.lightRadius, color: l.color, ...(STREET_LAMPS.has(l.lampType) ? { look: 'street' } : {}), ...faulty(l),
                    data: { lamp_type: l.lampType, fixture: l.fixture ?? null, angle: l.angle ?? null } })),
                // A neon sign colours the street round it without lifting the dark.
                ...(exported?.neon ?? []).map((n, i) => ({ position: [n.x, n.y], radius: NEON.radius, color: n.color, intensity: 0, glow: NEON.glow, shadows: 'none', ...faulty(n),
                    role: 'neon', authored_id: `neon_${i}`, render_radius: 4, data: { text: n.text, font_size: n.fontSize, font_family: n.fontFamily } }))
            ],
            triggers: transitions.map((r, index) => ({ x: r.x, y: r.y, w: r.w, h: r.h, role: 'transition', authored_id: `exit_${index}`, data: { target: r.target, label: r.label ?? null } })),
            rooms: room_list,
            doors: (rooms.doors ?? []).map(d => ({ ...d, source: d })),
            cloths: (rooms.linens ?? []).map(l => ({ ...l, role: 'curtain', source: l }))
        }
    };
}

/** The sections systems other than the map builder read; each is empty on a map without it. */
function mapSections(exported) {
    const e = exported ?? {};
    return {
        roads: e.roads ?? null, streets: e.streets ?? { roads: [], intersections: [] }, navigation: e.navigation ?? null, sidewalks: e.sidewalks ?? [],
        blocks: e.blocks ?? [], pavements: e.pavements ?? [], crosswalks: e.crosswalks ?? [], floor_zones: e.floor_zones ?? [], pools: e.pools ?? [],
        buildings: e.buildings ?? [], neon: e.neon ?? [], foliage: e.foliage ?? [], props: e.props ?? []
    };
}

/** The lamp types that stand on a street and light a pool round their foot (the classic lamps' styled posts). */
const STREET_LAMPS = new Set([1, 2, 6]);
/** A neon sign's light: how far its colour reaches and how strong it is against the look's lamp colour. */
const NEON = { radius: 150, glow: 1.5 };
/**
 * About one lamp or sign in ten is faulty and stutters now and then, chosen by where it stands (as the
 * classic city chose them, so the same ones stutter).
 */
function faulty({ x, y }) {
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    if (h >= .1) return {};
    const k = h * 10;
    return { animation: { kind: 'stutter', period: 6 + k * 7, burst: .9, depth: .7, offset: k * 37 } };
}

/** A map definition's rooms as the light layer reads them: `[{type, rects}]`. */
export function lightingRooms(definition) {
    return Object.values(definition.rooms ?? {}).map(r => ({ type: r.type ?? 'indoor', rects: r.rects ?? [{ x: r.x, y: r.y, w: r.w, h: r.h }] }));
}

/** Each map's game data on its generic packets: what its artists and interactions read. */
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

/** How any map's definition becomes packets: the game's templates and game data. */
export const MAP_OPTIONS = Object.freeze({ templates: TEMPLATES, decorate, prop_types: PROP_TYPES });
