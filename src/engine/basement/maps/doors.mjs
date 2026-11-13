// ===== LV0 BASEMENT =====
import { BODY_GROUP } from '../physics/index.mjs';

/**
 * DOOR KINDS: a door is an opening in a wall plus the leaves that fill it, and a kind is data that
 * says what those leaves are. Nothing here names a particular door; the builder reads the kind.
 *
 * Positions run along the opening, from its start (left for an 'H' door, top for a 'V' one), as
 * `[fraction, px]` = fraction × the opening's length + px. Each leaf:
 *   from, to   where the leaf starts and ends
 *   motion     'slide': a kinematic leaf the map instance moves by proximity, by `travel` ([fraction, px],
 *              signed along the opening); 'hinge': a rigid leaf on a hinge joint at `pivot` (0 = the
 *              leaf's start, 1 its end) that bodies push open and a return spring swings shut, with
 *              `hinge` overriding HINGE
 *   side       which side of the door this leaf is on (-1 or 1); defaults to -1 for the first leaf, 1 after
 *   suffix     the leaf's id suffix; the first leaf takes the door's id, later ones `<id>_<suffix>`
 * A door with `hingeSide: 'right'` mirrors its kind end to end. An arch has no leaves: it is only
 * the opening, which still cuts the wall and links its rooms.
 */
export const DOOR_KINDS = Object.freeze({
    plain: { leaves: [{ from: [0, 0], to: [1, 0], motion: 'slide', travel: [1, 0] }] },
    sliding: { leaves: [
        { from: [0, 0], to: [0.5, -2], motion: 'slide', travel: [-0.5, -4], side: -1 },
        { from: [0.5, 2], to: [1, 0], motion: 'slide', travel: [0.5, 4], side: 1, suffix: 'right' }] },
    hinged: { leaves: [{ from: [0, 0], to: [1, 0], motion: 'hinge', pivot: 0 }] },
    arch: { leaves: [] }
});
/**
 * A hinged leaf's defaults (a kind's leaf, then the door's `hinge` field, override any of them):
 * mass, angular damping (1/s), the closing spring (1/s², as angular acceleration per radian open)
 * and the swing limit either side of shut (radians). They match the classic doors: a spring of
 * 0.018 and damping of 0.88 per 60 Hz tick, stopping 0.25 rad short of folding back against the wall.
 */
export const HINGE = Object.freeze({ mass: 12, damping: 7.7, closing_stiffness: 64.8, swing_limit: Math.PI - 0.25 });
export const DOOR_MASK = BODY_GROUP.CHARACTER | BODY_GROUP.PROP | BODY_GROUP.PROJECTILE;

const pair = (value, name) => { if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new TypeError(`A door leaf's ${name} is [fraction, px]`); return value; };
const HINGE_FIELDS = Object.keys(HINGE);
/** Throws unless `kind` is a door kind (see above). Returns it. */
export function validateDoorKind(kind, name = 'door kind') {
    if (!kind || !Array.isArray(kind.leaves)) throw new TypeError(`${name} requires a leaves list`);
    const suffixes = new Set();
    kind.leaves.forEach((leaf, i) => {
        pair(leaf.from, 'from'); pair(leaf.to, 'to');
        if (leaf.motion === 'slide') pair(leaf.travel, 'travel');
        else if (leaf.motion === 'hinge') {
            if (!(leaf.pivot >= 0 && leaf.pivot <= 1)) throw new TypeError(`${name}: a hinge leaf's pivot is 0..1 along it`);
            for (const key of Object.keys(leaf.hinge ?? {})) if (!HINGE_FIELDS.includes(key)) throw new TypeError(`${name}: unknown hinge field ${key}`);
        } else throw new TypeError(`${name}: a leaf's motion is slide or hinge`);
        if (leaf.side !== undefined && leaf.side !== -1 && leaf.side !== 1) throw new TypeError(`${name}: a leaf's side is -1 or 1`);
        if (i && (typeof leaf.suffix !== 'string' || !leaf.suffix || suffixes.has(leaf.suffix))) throw new TypeError(`${name}: every leaf after the first needs its own suffix`);
        if (leaf.suffix) suffixes.add(leaf.suffix);
    });
    return kind;
}
for (const [name, kind] of Object.entries(DOOR_KINDS)) validateDoorKind(kind, name);

/** The built-in kinds with `door_kinds` added over them, each validated. */
export function resolveDoorKinds(door_kinds = {}) {
    return Object.freeze({ ...DOOR_KINDS, ...Object.fromEntries(Object.entries(door_kinds).map(([name, kind]) => [name, validateDoorKind(kind, name)])) });
}
/** The kind a door names (`type`, default 'plain'); an unknown name throws. */
export function doorKind(kinds, d, key) {
    const name = d.type ?? 'plain';
    if (!Object.hasOwn(kinds, name)) throw new TypeError(`Unknown door kind ${name} (${key})`);
    return kinds[name];
}
/** The authored ids of a door's leaves, in kind order. */
export const leafIds = (key, kind) => kind.leaves.map((leaf, i) => i ? `${key}_${leaf.suffix}` : key);

/**
 * A door's opening in its own frame: centre `position`, `length` along the opening, `across` it (the
 * wall's thickness) and the `rotation` that turns the frame's +x along the opening. Arches have it too.
 */
export function doorOpening(d) {
    const horizontal = d.orientation === 'H';
    return { position: [d.x + d.w / 2, d.y + d.h / 2], length: horizontal ? d.w : d.h, across: horizontal ? d.h : d.w, rotation: horizontal ? 0 : Math.PI / 2 };
}

/**
 * One door's leaves as `{packet, joints?}` pairs, in kind order. `base` is the door's entity kind
 * (template or engine type); the packet's data carries the door's opening and open/closed poses.
 * `data.opening` is the door's opening (see doorOpening).
 */
export function doorLeaves(d, key, kind, base) {
    const horizontal = d.orientation === 'H', length = horizontal ? d.w : d.h, across = horizontal ? d.h : d.w;
    const mirror = d.hingeSide === 'right', single = kind.leaves.length === 1;
    const at = ([fraction, px]) => { const u = fraction * length + px; return mirror ? length - u : u; };
    const point = u => horizontal ? [d.x + u, d.y + d.h / 2] : [d.x + d.w / 2, d.y + u];
    const along = offset => horizontal ? [offset, 0] : [0, offset];
    const trigger_position = [d.x + d.w / 2, d.y + d.h / 2];
    return kind.leaves.map((leaf, i) => {
        const a = at(leaf.from), b = at(leaf.to), size = Math.abs(b - a), centre = (a + b) / 2, hinge = leaf.motion === 'hinge';
        const pivot = hinge ? a + (b - a) * leaf.pivot : centre, position = point(pivot);
        const travel = hinge ? 0 : (mirror ? -1 : 1) * (leaf.travel[0] * length + leaf.travel[1]);
        const joint = hinge ? { ...HINGE, ...(leaf.hinge ?? {}), ...(d.hinge ?? {}) } : null;
        const data = { role: i ? 'door_panel' : 'door', authored_id: leafIds(key, kind)[i], opening: doorOpening(d),
            ...(single ? {} : { door_key: key, panel_version: 2, panel_side: leaf.side ?? (i ? 1 : -1), trigger_position }),
            ...(single || hinge ? { hinged: hinge } : {}),
            closed_position: position, open_position: hinge ? position : [position[0] + along(travel)[0], position[1] + along(travel)[1]],
            closed_rotation: 0, open_rotation: hinge ? Math.PI / 2 : 0, open: false };
        const packet = { ...base, position,
            ...(hinge ? { physics_type: 'rigid', mass: joint.mass, angular_damping: joint.damping, linear_damping: 0 } : {}),
            collision_shape: { shape_type: 'box', dimensions: horizontal ? [size, across] : [across, size], local_position: along(centre - pivot) }, collision_mask: DOOR_MASK, data };
        return { packet, joints: hinge ? [{ constraint_type: 'hinge', world_target: [...position], local_anchor_a: [0, 0], target_rotation: 0, min_rotation: -joint.swing_limit, max_rotation: joint.swing_limit, spring_stiffness: joint.closing_stiffness, spring_damping: 0 }] : undefined };
    });
}
