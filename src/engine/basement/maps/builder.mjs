// ===== LV0 BASEMENT =====
import { layoutGeometry } from '../physics/index.mjs';
import { resolveDoorKinds, doorKind, doorLeaves } from './doors.mjs';
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
        if (p.light) packet.light_shape = { shape_type: 'circle', radius: finite(p.light.radius, 'light radius'), local_position: p.light.position ?? [0, 0] };
        push('placements', i, p, packet);
    });

    // Free-standing lights (a light carried by a prop is that placement's `light`).
    (definition.lights ?? []).forEach((l, i) => push('lights', i, l, { ...kind_of('light', l.template), position: [finite(l.position[0], 'x'), finite(l.position[1], 'y')],
        render_shape: { shape_type: 'circle', radius: l.render_radius ?? 20 }, light_shape: { shape_type: 'circle', radius: finite(l.radius, 'light radius') },
        data: { role: l.role ?? 'lamp', authored_id: l.authored_id ?? `lamp_${i}`, ...l.data } }));

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
    doors.forEach((d, index) => {
        const key = `door_${index}`;
        for (const { packet, joints } of doorLeaves(d, key, doorKind(kinds, d, key), kind_of('door', d.template))) push('doors', index, d, packet, joints);
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

    return { kind, entries, spawn: definition.spawn ? [...definition.spawn] : null, door_kinds: kinds };
}
