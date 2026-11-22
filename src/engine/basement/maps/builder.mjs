// ===== LV0 BASEMENT =====
import { rowPlacements } from './rows.mjs';
import { layoutGeometry } from '../physics/index.mjs';
import { resolveDoorKinds, doorKind, doorLeaves, doorOpening, leafIds } from './doors.mjs';
import { markerComponent, readMarker } from './markers.mjs';
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
export const LIGHT_ANIMATIONS = Object.freeze(['steady', 'flicker', 'pulse', 'stutter']);
/**
 * A declared light, as a lamp, a placement or a catalog type gives it, in its one runtime form:
 * `{shape: 'point' | 'strip', radius | size + round + soft + rotation, position, color, intensity, glow, height, look, shadows, animation}`.
 *  position   offset from its body's centre ([dx, dy], or the authored `dx` / `dy`)
 *  intensity  how much of the dark it lifts; `glow` how strong its colour is (a neon sign colours the
 *             street without lifting the dark much)
 *  shadows    'dynamic' (default): walls and every body that blocks light, kept until one in reach moves;
 *             'static': walls only; 'none': a pool with no shadow
 *  animation  {kind: 'steady' | 'flicker' | 'pulse' | 'stutter', ...}: flicker and pulse at `rate` (rad/s),
 *             a pulse swinging by `depth` (0..1); a stutter (a faulty lamp) holds steady but for `burst` s
 *             every `period` s, when it drops by `depth` on and off. The older `flicker: rate` is a flicker.
 *  height     how high it hangs, world units (default 0): its reflection falls that far times the reflection pass's `fall`
 *  look       the name of a profile the game's look gives it (a street lamp's pool), or null
 *  inner_radius, cut, glow_stops  how its light falls off, kept only when given (the light layer's fields: a point
 *             light's cut starts at `inner_radius`; `cut` [[offset, alpha]] and `glow_stops` [[offset, colour]])
 * `color`, `intensity` and `glow` stay null when unset, for the look to choose.
 */
export function declaredLight(light, { shadows = 'dynamic' } = {}) {
    const a = light.animation ?? (light.flicker ? { kind: 'flicker', rate: light.flicker } : { kind: 'steady' });
    if (!LIGHT_ANIMATIONS.includes(a.kind)) throw new TypeError(`Unknown light animation: ${a.kind}`);
    const shade = light.shadows ?? shadows;
    if (!LIGHT_SHADOWS.includes(shade)) throw new TypeError(`Unknown light shadows: ${shade}`);
    const animation = a.kind === 'steady' ? { kind: 'steady' }
        : a.kind === 'stutter' ? { kind: 'stutter', period: finite(a.period ?? 8, 'light period'), burst: finite(a.burst ?? .9, 'light burst'), depth: finite(a.depth ?? .7, 'light depth'), offset: finite(a.offset ?? 0, 'light offset') }
        : { kind: a.kind, rate: finite(a.rate ?? 1, 'light rate'), ...(a.kind === 'pulse' ? { depth: finite(a.depth ?? .1, 'light depth') } : {}) };
    const shape = light.size ? { shape: 'strip', size: [finite(light.size[0], 'light width'), finite(light.size[1], 'light height')], round: light.round ?? null, soft: !!light.soft, rotation: finite(light.rotation ?? 0, 'light rotation') }
        : { shape: 'point', radius: finite(light.radius, 'light radius') };
    const out = { ...shape, position: light.position ? [...light.position] : [light.dx ?? 0, light.dy ?? 0], color: light.color ?? null, intensity: light.intensity ?? null, glow: light.glow ?? null, height: finite(light.height ?? 0, 'light height'), look: light.look ?? null, shadows: shade, animation };
    // How its light falls off, when it says (the light layer's own fields): a point light's `inner_radius`, and the
    // `cut` ([[offset, alpha]]: how much of the dark it lifts out from its middle) and `glow_stops` ([[offset, colour]]).
    if (light.inner_radius !== undefined && light.inner_radius !== null) out.inner_radius = finite(light.inner_radius, 'light inner_radius');
    for (const [key, ok] of [['cut', v => Number.isFinite(v)], ['glow_stops', v => typeof v === 'string' && v.length > 0]]) {
        const stops = light[key]; if (stops === undefined || stops === null) continue;
        if (!Array.isArray(stops) || stops.length < 2 || !stops.every(s => Array.isArray(s) && s.length === 2 && Number.isFinite(s[0]) && s[0] >= 0 && s[0] <= 1 && ok(s[1]))) throw new TypeError(`A light's ${key} is a list of [offset 0..1, ${key === 'cut' ? 'alpha' : 'colour'}], two or more`);
        out[key] = stops.map(s => [...s]);
    }
    return out;
}
const lightShape = l => l.shape === 'strip' ? { shape_type: 'box', dimensions: l.size, local_position: l.position } : { shape_type: 'circle', radius: l.radius, local_position: l.position };

// The corners of the box round one floor step, in map space.
function floorPoints(step, i) {
    const n = (v, what) => finite(v, `floor ${i} ${what}`), x = step.x ?? 0, y = step.y ?? 0, pad = (step.line_width ?? 0) / 2;
    const around = (cx, cy, rx, ry) => [[cx - rx - pad, cy - ry - pad], [cx + rx + pad, cy + ry + pad]];
    switch (step.shape) {
        case 'rectangle': return around(n(x, 'x') + n(step.width, 'width') / 2, n(y, 'y') + n(step.height, 'height') / 2, step.width / 2, step.height / 2);
        case 'circle': return around(n(x, 'x'), n(y, 'y'), n(step.radius, 'radius'), step.radius);
        case 'ellipse': { const r = Math.max(n(step.radius_x, 'radius_x'), n(step.radius_y, 'radius_y')); return around(n(x, 'x'), n(y, 'y'), r, r); }
        case 'polygon': case 'curve': case 'line': if (!Array.isArray(step.points) || !step.points.length) break; return step.points.flatMap(([px, py]) => around(n(px, 'point'), n(py, 'point'), 0, 0));
        case 'capsule': return [step.from, step.to].flatMap(([px, py]) => around(n(px, 'point'), n(py, 'point'), n(step.radius, 'radius'), step.radius));
        // Text: a box as wide as its characters at most and as tall as its size, round its anchor.
        case 'text': { const size = n(step.size ?? 12, 'size'), w = String(step.text ?? '').length * size * .7; return around(n(x, 'x'), n(y, 'y'), w, size); }
        // A group (one entity for many small steps): its children's corners, through its place, turn and scale.
        case 'group': {
            if (!Array.isArray(step.steps) || !step.steps.length) break;
            const a = step.rotation ?? 0, [sx, sy] = Array.isArray(step.scale) ? step.scale : [step.scale ?? 1, step.scale ?? 1], c = Math.cos(a), s = Math.sin(a);
            return step.steps.flatMap(child => { const box = floorPoints(child, i), [[x0, y0], [x1, y1]] = [[Math.min(...box.map(q => q[0])), Math.min(...box.map(q => q[1]))], [Math.max(...box.map(q => q[0])), Math.max(...box.map(q => q[1]))]];
                return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([px, py]) => [n(x, 'x') + (px * sx) * c - (py * sy) * s, n(y, 'y') + (px * sx) * s + (py * sy) * c]); });
        }
    }
    throw new TypeError(`Map floor ${i} is a rectangle, circle, ellipse, polygon, curve, line, capsule, text or group`);
}
export const MAP_KINDS = Object.freeze(['interior', 'exterior']);
/** Without a template, each section uses one of the engine's own entity types. */
export const DEFAULT_KINDS = Object.freeze({ wall: { kind: 'static' }, prop: { kind: 'prop', physics_type: 'static' }, light: { kind: 'decoration' },
    trigger: { kind: 'trigger', ghost: true }, floor: { kind: 'decoration' }, room: { kind: 'trigger', ghost: true, collision_mask: 0 }, door: { kind: 'prop', physics_type: 'kinematic' }, cloth: { kind: 'decoration' } });

/**
 * Returns `{ entries, spawn }`. Each entry is `{ section, index, source, packet }`, in build order:
 * floors, walls (cut by door openings), boundary, placements, lights, triggers, rooms (one entry per
 * rectangle), doors (a sliding door is two leaves, an arch none), cloths. `decorate(packet, entry)` may add game data; it must not change ids or roles.
 * `make_object(record, at, overrides)` makes the packet of a placement that names a catalog `object` (the
 * Penthouse's `objectPacket` on the world's data); a map with such placements needs it.
 */
export function buildMapPackets(definition, { templates = {}, decorate = null, prop_types = {}, door_kinds = {}, make_object = null } = {}) {
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

    // Floors: drawing steps in the map's own space, drawn in order under everything (look layer `floor_layer`,
    // default -100), each its own flat decoration so it streams with its region. A step's bounds come from its
    // shape (a rectangle, circle, ellipse, polygon, curve, line or capsule); it is placed at their centre and drawn back by that much, so a texture stays anchored to the map.
    const floor_layer = definition.floor_layer ?? -100;
    (definition.floors ?? []).forEach((step, i) => {
        const { elevation = 0, thickness = 0, sides, ...art } = step, points = floorPoints(art, i);
        const xs = points.map(q => q[0]), ys = points.map(q => q[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], at = [(x0 + x1) / 2, (y0 + y1) / 2];
        push('floors', i, step, { ...kind_of('floor'), position: at, elevation, render_shape: { shape_type: 'box', dimensions: [Math.max(x1 - x0, 1e-3), Math.max(y1 - y0, 1e-3)] },
            components: [{ name: 'floor', layers: [{ layer: 0, height: 0, thickness: finite(thickness, `floor ${i} thickness`), solid: false, ...(sides === undefined ? {} : { sides }), steps: [{ shape: 'group', x: -at[0], y: -at[1], steps: [art] }] }] }],
            data: { role: 'floor', authored_id: `floor_${i}`, look: { layer: floor_layer, depth: i * 1e-6 } } });
    });

    // Walls, with every door (and any extra opening) cut out, then the boundary ring. With `wall_look`
    // ({material, sides, height, layer}), or a wall's own `material` / `sides` / `height`, a wall is drawn: its
    // top in `material`, its faces in `sides` when heights lean. The look never changes what a wall stops.
    const walls = layoutGeometry.cutWallOpenings(definition.walls ?? [], [...doors, ...(definition.wall_openings ?? [])]);
    const thickness = definition.boundary === false ? 0 : definition.boundary?.thickness ?? 0;
    const ring = thickness > 0 ? [{ x: -thickness, y: -thickness, w: width + 2 * thickness, h: thickness }, { x: -thickness, y: height, w: width + 2 * thickness, h: thickness },
        { x: -thickness, y: 0, w: thickness, h: height }, { x: width, y: 0, w: thickness, h: height }] : [];
    const wall_look = definition.wall_look ?? null;
    [...walls, ...ring].forEach((r, i) => {
        const packet = { ...kind_of('wall'), ...box(r.x, r.y, r.w, r.h), data: { role: 'wall', authored_id: `wall_${i}` } };
        const material = r.material ?? wall_look?.material;
        if (material) {
            const sides = r.sides ?? wall_look?.sides ?? material, height = r.height ?? wall_look?.height ?? 0;
            packet.components = [{ name: 'wall', layers: [{ layer: 0, height: 0, thickness: finite(height, 'wall height'), solid: false, sides: { material: sides }, steps: [{ shape: 'rectangle', x: -r.w / 2, y: -r.h / 2, width: r.w, height: r.h, material }] }] }];
            packet.data.look = { layer: wall_look?.layer ?? 0 };
        }
        push('walls', i, r, packet);
    });

    // Placements: catalog props at their authored rectangles.
    // A placement that names a catalog `object` is made from that record at its centre (or `at`), its size and
    // shape the record's own; `width` and `height` may be left out. Its `look` is laid over the object's own (its
    // `values` merged), so one template stands in many colourways, names on its sign and all.
    // A map's `rows` (rows.mjs) line its streets with buildings: each becomes one more object placement after its own.
    [...(definition.placements ?? []), ...rowPlacements(definition)].forEach((p, i) => {
        if (p.object !== undefined) {
            if (typeof make_object !== 'function') throw new TypeError(`Map placement ${i} names the object ${p.object}: give the builder make_object`);
            const at = p.at ?? [finite(p.x, 'x') + (p.width ?? 0) / 2, finite(p.y, 'y') + (p.height ?? 0) / 2];
            if (p.look !== undefined && !(p.look && typeof p.look === 'object' && !Array.isArray(p.look))) throw new TypeError(`Map placement ${i}'s look is {values, ...}: laid over its object's own`);
            const packet = make_object(p.object, at, { rotation: p.rotation ?? 0, ...(p.look ? { look: p.look } : {}), data: { role: p.role ?? 'prop', authored_id: p.authored_id ?? `prop_${i}`, layout_index: i, object: p.object, home_position: [...at], home_rotation: p.rotation ?? 0, ...p.data } });
            push('placements', i, p, packet); return;
        }
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

    // Triggers: exits, rooms, zones. Each names its role. A role the map's `markers` give a look to is drawn on the
    // floor with it (markers.mjs), fitted to its rectangle, unless the trigger is `quiet`.
    const markers = Object.fromEntries(Object.entries(definition.markers ?? {}).filter(([, m]) => m !== false && m !== null).map(([role, m]) => [role, readMarker(m, `markers.${role}`)]));
    (definition.triggers ?? []).forEach((r, i) => {
        const role = r.role ?? 'trigger', packet = { ...kind_of('trigger', r.template), ...box(r.x, r.y, r.w, r.h), data: { role, ...(r.authored_id ? { authored_id: r.authored_id } : {}), ...r.data } };
        const marker = markers[role];
        if (marker && !r.data?.quiet) { packet.components = [markerComponent(marker, r.w, r.h, { label: r.data?.label ?? null, side: kind === 'interior' ? 'above' : 'below' })]; packet.data.look = { layer: marker.layer }; }
        push('triggers', i, r, packet);
    });

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
