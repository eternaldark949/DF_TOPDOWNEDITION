// ===== LV0 BASEMENT =====
import { layoutGeometry } from '../physics/index.mjs';
import { resolveDoorKinds, doorKind, doorLeaves, doorOpening, leafIds } from './doors.mjs';
export { DOOR_KINDS, HINGE, validateDoorKind } from './doors.mjs';

/**
 * Map definition -> entity packets. Pure: no world, no game names. Every section is optional.
 *
 * Rectangles are authored as top-left `{x, y, w, h}` (walls, triggers, doors) or `{x, y, width, height}`
 * (placements); packets are centred. Ids default to `<prefix>_<index>` per section, so the same
 * definition always yields the same `authored_id`s (saves and layout memory rely on that).
 */
const finite = (value, name) => { if (!Number.isFinite(value)) throw new TypeError(`Map ${name} must be a finite number`); return value; };
const box = (x, y, w, h) => ({ position: [finite(x, 'x') + finite(w, 'width') / 2, finite(y, 'y') + finite(h, 'height') / 2], collision_shape: { shape_type: 'box', dimensions: [w, h] } });

export const LIGHT_SHADOWS = Object.freeze(['static', 'dynamic', 'none']);
export const LIGHT_ANIMATIONS = Object.freeze(['steady', 'flicker', 'pulse']);
/**
 * A declared light, as a lamp, a placement or a catalog type gives it, in its one runtime form:
 * `{shape: 'point' | 'strip', radius | size + round + soft, position, color, intensity, shadows, animation}`.
 *  position   offset from its body's centre ([dx, dy], or the authored `dx` / `dy`)
 *  shadows    'dynamic' (default): walls and every body that blocks light, kept until one in reach moves;
 *             'static': walls only; 'none': a pool with no shadow
 *  animation  {kind: 'steady' | 'flicker' | 'pulse', rate (rad/s), depth (pulse: the swing, 0..1)};
 *             the older `flicker: rate` is a flicker
 * `color` and `intensity` stay null when unset, for the look to choose.
 */
export function declaredLight(light, { shadows = 'dynamic' } = {}) {
    const a = light.animation ?? (light.flicker ? { kind: 'flicker', rate: light.flicker } : { kind: 'steady' });
    if (!LIGHT_ANIMATIONS.includes(a.kind)) throw new TypeError(`Unknown light animation: ${a.kind}`);
    const shade = light.shadows ?? shadows;
    if (!LIGHT_SHADOWS.includes(shade)) throw new TypeError(`Unknown light shadows: ${shade}`);
    const animation = a.kind === 'steady' ? { kind: 'steady' } : { kind: a.kind, rate: finite(a.rate ?? 1, 'light rate'), ...(a.kind === 'pulse' ? { depth: finite(a.depth ?? .1, 'light depth') } : {}) };
    const shape = light.size ? { shape: 'strip', size: [finite(light.size[0], 'light width'), finite(light.size[1], 'light height')], round: light.round ?? null, soft: !!light.soft }
        : { shape: 'point', radius: finite(light.radius, 'light radius') };
    return { ...shape, position: light.position ? [...light.position] : [light.dx ?? 0, light.dy ?? 0], color: light.color ?? null, intensity: light.intensity ?? null, shadows: shade, animation };
}
const lightShape = l => l.shape === 'strip' ? { shape_type: 'box', dimensions: l.size, local_position: l.position } : { shape_type: 'circle', radius: l.radius, local_position: l.position };

export const MAP_KINDS = Object.freeze(['interior', 'exterior']);
/** Without a template, each section uses one of the engine's own entity types. */
export const DEFAULT_KINDS = Object.freeze({ wall: { entity_type: 'static' }, prop: { entity_type: 'prop', physics_type: 'static' }, light: { entity_type: 'decoration' },
    trigger: { entity_type: 'trigger', ghost: true }, room: { entity_type: 'trigger', ghost: true, collision_mask: 0 }, door: { entity_type: 'prop', physics_type: 'kinematic' }, cloth: { entity_type: 'decoration' } });

/**
 * Returns `{ entries, spawn }`. Each entry is `{ section, index, source, packet }`, in build order:
 * walls (cut by door openings), boundary, placements, lights, triggers, rooms (one entry per
 * rectangle), doors (a sliding door is two leaves, an arch none), cloths. `decorate(packet, entry)` may add game data; it must not change ids or roles.
 */
export function buildMapPackets(definition, { templates = {}, decorate = null, prop_types = {}, door_kinds = {} } = {}) {
    const kinds = resolveDoorKinds(door_kinds);
    const kind = definition.kind ?? 'interior';
    if (!MAP_KINDS.includes(kind)) throw new TypeError(`Unknown map kind: ${kind}`);
    const entries = [];
    const kind_of = (section, template = templates[section]) => template ? { template } : structuredClone(DEFAULT_KINDS[section]);
    const push = (section, index, source, packet, joints) => {
        if (decorate) packet = decorate(packet, { section, index, source, kind }) ?? packet;
        entries.push(joints ? { section, index, source, packet, joints } : { section, index, source, packet });
    };
    const [width, height] = definition.size ?? [0, 0];
    const doors = definition.doors ?? [];

    // Walls, with every door (and any extra opening) cut out, then the boundary ring.
    const walls = layoutGeometry.cutWallOpenings(definition.walls ?? [], [...doors, ...(definition.wall_openings ?? [])]);
    const thickness = definition.boundary === false ? 0 : definition.boundary?.thickness ?? 0;
    const ring = thickness > 0 ? [{ x: -thickness, y: -thickness, w: width + 2 * thickness, h: thickness }, { x: -thickness, y: height, w: width + 2 * thickness, h: thickness },
        { x: -thickness, y: 0, w: thickness, h: height }, { x: width, y: 0, w: thickness, h: height }] : [];
    [...walls, ...ring].forEach((r, i) => push('walls', i, r, { ...kind_of('wall'), ...box(r.x, r.y, r.w, r.h), data: { role: 'wall', authored_id: `wall_${i}` } }));

    // Placements: catalog props at their authored rectangles.
    (definition.placements ?? []).forEach((p, i) => {
        const packet = { ...kind_of('prop', p.template), ...box(p.x, p.y, p.width, p.height),
            data: { role: p.role ?? 'prop', authored_id: p.authored_id ?? `prop_${i}`, layout_index: i, prop_type: p.type ?? null,
                movable: !!(p.movable ?? prop_types[p.type]?.movable), home_position: null, home_rotation: p.rotation ?? 0, ...p.data } };
        packet.data.home_position = [...packet.position];
        if (p.rotation) packet.rotation = p.rotation;
        const light = p.light ?? prop_types[p.type]?.light, blocks = p.blocks_light ?? prop_types[p.type]?.blocks_light;
        if (light) { packet.data.emission = declaredLight(light); packet.light_shape = lightShape(packet.data.emission); }
        if (blocks !== undefined) packet.blocks_light = !!blocks;
        push('placements', i, p, packet);
    });

    // Free-standing lights (a light carried by a prop is that placement's `light`).
    (definition.lights ?? []).forEach((l, i) => { const emission = declaredLight({ ...l, position: null });
        push('lights', i, l, { ...kind_of('light', l.template), position: [finite(l.position[0], 'x'), finite(l.position[1], 'y')],
            render_shape: { shape_type: 'circle', radius: l.render_radius ?? 20 }, light_shape: lightShape(emission),
            data: { role: l.role ?? 'lamp', authored_id: l.authored_id ?? `lamp_${i}`, emission, ...l.data } }); });

    // Triggers: exits, rooms, zones. Each names its role.
    (definition.triggers ?? []).forEach((r, i) => push('triggers', i, r, { ...kind_of('trigger', r.template), ...box(r.x, r.y, r.w, r.h),
        data: { role: r.role ?? 'trigger', ...(r.authored_id ? { authored_id: r.authored_id } : {}), ...r.data } }));

    // Rooms: one ghost volume per rectangle in the world's spatial grid (an L-shaped hall is two).
    for (const [room_id, room] of Object.entries(definition.rooms ?? {})) {
        const { template, ...fields } = room, rects = room.rects ?? [{ x: room.x, y: room.y, w: room.w, h: room.h }];
        rects.forEach((r, k) => push('rooms', k, { room_id, room, rect: r }, { ...kind_of('room', template), ...box(r.x, r.y, r.w, r.h),
            data: { role: 'room', room_id, ...(rects.length > 1 ? { rect_index: k } : {}), ...fields } }));
    }

    // Doors. Each door's `type` names a door kind (default 'plain'): data saying what its leaves are and
    // how each moves. See doors.mjs. `door_kinds` adds kinds or replaces built-in ones.
    // `openings` lists every door, arches included, with its kind name, opening and leaf ids.
    const openings = doors.map((d, index) => {
        const key = `door_${index}`, door_kind = doorKind(kinds, d, key);
        for (const { packet, joints } of doorLeaves(d, key, door_kind, kind_of('door', d.template))) push('doors', index, d, packet, joints);
        return { door_key: key, index, type: d.type ?? 'plain', opening: doorOpening(d), leaf_ids: leafIds(key, door_kind) };
    });

    // Cloths: a hanging strip mesh anchored at its top edge (curtains, banners, laundry).
    (definition.cloths ?? []).forEach((c, i) => {
        const n = c.segments ?? 5, points = [], edges = [];
        for (let row = 0; row <= n; row++) {
            points.push([0, c.length * row / n], [c.width, c.length * row / n]); edges.push([row * 2, row * 2 + 1]);
            if (row) edges.push([row * 2 - 2, row * 2], [row * 2 - 1, row * 2 + 1], [row * 2 - 2, row * 2 + 1], [row * 2 - 1, row * 2]);
        }
        push('cloths', i, c, { ...kind_of('cloth', c.template), position: [c.x, c.y], render_shape: { shape_type: 'circle', radius: c.length + c.width },
            data: { role: c.role ?? 'cloth', authored_id: c.authored_id ?? `${c.role ?? 'cloth'}_${i}`, ...c.data, mesh: { points, edges, anchors: [0, 1] } } });
    });

    return { kind, entries, openings, spawn: definition.spawn ? [...definition.spawn] : null, door_kinds: kinds };
}
