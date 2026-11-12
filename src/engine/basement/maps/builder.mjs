// ===== LV0 BASEMENT =====
import { layoutGeometry, BODY_GROUP } from '../physics/index.mjs';

/**
 * Map definition -> entity packets. Pure: no world, no game names. Every section is optional.
 *
 * Rectangles are authored as top-left `{x, y, w, h}` (walls, triggers, doors) or `{x, y, width, height}`
 * (placements); packets are centred. Ids default to `<prefix>_<index>` per section, so the same
 * definition always yields the same `authored_id`s (saves and layout memory rely on that).
 */
const DOOR_MASK = BODY_GROUP.CHARACTER | BODY_GROUP.PROP | BODY_GROUP.PROJECTILE;
/**
 * A hinged leaf's defaults (a door's `hinge` field overrides any of them): mass, angular damping
 * (1/s), the closing spring (1/s², as angular acceleration per radian open) and the swing limit
 * either side of shut (radians). They match the classic doors: a spring of 0.018 and damping of
 * 0.88 per 60 Hz tick, stopping 0.25 rad short of folding back against the wall.
 */
export const HINGE = Object.freeze({ mass: 12, damping: 7.7, closing_stiffness: 64.8, swing_limit: Math.PI - 0.25 });
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
export function buildMapPackets(definition, { templates = {}, decorate = null, prop_types = {} } = {}) {
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

    // Doors. A hinged door is a physical leaf on a hinge joint: bodies push it open, a return spring
    // swings it shut, and it stops just short of folding flat against the wall. Sliding and plain
    // doors are kinematic leaves the map instance opens by proximity (a sliding door is two leaves).
    // An arch is an opening with no leaf (it still cuts the wall and links its rooms).
    doors.forEach((d, index) => {
        if (d.type === 'arch') return;
        const horizontal = d.orientation === 'H', key = `door_${index}`, trigger_position = [d.x + d.w / 2, d.y + d.h / 2];
        if (d.type === 'sliding') {
            const length = (horizontal ? d.w : d.h) / 2 - 2, travel = (horizontal ? d.w : d.h) / 2 + 4;
            for (const side of [-1, 1]) {
                const position = horizontal ? [d.x + d.w / 2 + side * (length / 2 + 2), d.y + d.h / 2] : [d.x + d.w / 2, d.y + d.h / 2 + side * (length / 2 + 2)];
                push('doors', index, d, { ...kind_of('door', d.template), position, collision_shape: { shape_type: 'box', dimensions: horizontal ? [length, d.h] : [d.w, length] }, collision_mask: DOOR_MASK,
                    data: { role: side === -1 ? 'door' : 'door_panel', authored_id: side === -1 ? key : `${key}_right`, door_key: key, panel_version: 2, panel_side: side, trigger_position,
                        closed_position: position, open_position: [position[0] + (horizontal ? side * travel : 0), position[1] + (horizontal ? 0 : side * travel)], closed_rotation: 0, open_rotation: 0, open: false } });
            }
            return;
        }
        const hinged = d.type === 'hinged', far = d.hingeSide === 'right' ? -1 : 1;
        const position = hinged ? (horizontal ? [far > 0 ? d.x : d.x + d.w, d.y + d.h / 2] : [d.x + d.w / 2, far > 0 ? d.y : d.y + d.h]) : trigger_position;
        const hinge = hinged ? { ...HINGE, ...(d.hinge ?? {}) } : null;
        push('doors', index, d, { ...kind_of('door', d.template), position,
            ...(hinged ? { physics_type: 'rigid', mass: hinge.mass, angular_damping: hinge.damping, linear_damping: 0 } : {}),
            collision_shape: { shape_type: 'box', dimensions: [d.w, d.h], local_position: hinged ? (horizontal ? [far * d.w / 2, 0] : [0, far * d.h / 2]) : [0, 0] }, collision_mask: DOOR_MASK,
            data: { role: 'door', authored_id: key, hinged, closed_position: position, open_position: hinged ? position : [position[0] + (horizontal ? d.w : 0), position[1] + (horizontal ? 0 : d.h)],
                closed_rotation: 0, open_rotation: hinged ? Math.PI / 2 : 0, open: false } },
            hinged ? [{ constraint_type: 'hinge', world_target: [...position], local_anchor_a: [0, 0], target_rotation: 0, min_rotation: -hinge.swing_limit, max_rotation: hinge.swing_limit, spring_stiffness: hinge.closing_stiffness, spring_damping: 0 }] : undefined);
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

    return { kind, entries, spawn: definition.spawn ? [...definition.spawn] : null };
}
