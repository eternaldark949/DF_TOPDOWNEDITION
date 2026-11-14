// ===== LV2 DIRECTORY =====
// DATA STRUCTURES: what each kind of library resource looks like, and the checks that an entry is
// well formed. A structure names fields, units and defaults; it never says what the data does.
//
// prop_catalog   { types: { <type>: { defaults: {...authored options}, movable?: boolean, blocks_light?: boolean, light?: {radius, ...} } }, families?: { <family>: { look } } }
//                One entry per prop type. A placement names its type and lists only what differs.
//                A family is a kind of piece drawn by one artist (a bentwood chair, a round table);
//                its `look` is a schema, { <field>: { kind, default, min?, max?, values?, note? } },
//                kind color | colors | number | integer | boolean | text | choice (one of `values`).
//                A type that names a `family` in its defaults is a preset of it: its defaults' `look`
//                sets some of the family's fields, and a placement's `look` sets more, field by field.
// map_layout     { map_id?, props: [placement], ...any other per-map lists (copied as data) }
//                placement = { type, x, y, ...fields }: fields override the type's defaults, and a
//                field set to null removes that default.
// skeleton       { rig_id, joints: [{ name, parent?, position?, rotation?, scale?, limits? }], anchors? }
//                A rig hierarchy in px and radians, +x forward, -y left. The Basement's rigDefinition
//                packet, so a prefab compiles it as it is.
// clip_set       { clips: [{ clip_id, duration, loop?, tracks, markers?, root_motion? }] }
//                Animation clips for one skeleton: the Basement's animationClip packets.
// locomotion     { idle, walk, stride, moving_speed }
//                Which clips stand and walk, the px travelled per walk cycle, and the px/s above
//                which a body counts as moving.
// door_kind      { name, leaves: [{ from, to, motion: 'slide'|'hinge', travel?, pivot?, hinge?, side?, suffix? }] }
//                The leaves that fill a door's opening, positions as [fraction of the opening, px]
//                from its start. A map door names the kind in its `type`. The Basement map builder
//                has the full rules and the built-in kinds (plain, sliding, hinged, arch).
// figure         { parts: [{ part, shape: 'circle'|'ellipse'|'capsule', joint, to?, radius?, radii? }] }
//                How a rigged body is drawn, back to front: a circle or ellipse at a joint, or a
//                capsule from `joint` to `to`. Sizes in px before the rig's own scale.
import { plain } from './values.mjs';

export const STRUCTURES = Object.freeze({
    prop_catalog: 'A catalog of prop types and the families they are presets of: { types: { <type>: { defaults, movable?, blocks_light?, light? } }, families?: { <family>: { look: { <field>: { kind, default } } } } }.',
    map_layout: 'A map\'s placements over a prop catalog: { props: [{ type, x, y, ...fields }], ... }.',
    skeleton: 'A rig hierarchy: { rig_id, joints: [{ name, parent?, position?, rotation?, scale?, limits? }], anchors? }.',
    clip_set: 'Animation clips for one skeleton: { clips: [{ clip_id, duration, tracks, markers? }] }.',
    locomotion: 'Which clips stand and walk: { idle, walk, stride (px per cycle), moving_speed (px/s) }.',
    door_kind: 'The leaves that fill a door\'s opening: { name, leaves: [{ from, to, motion, travel?, pivot?, hinge?, suffix? }] }.',
    figure: 'How a rigged body is drawn, back to front: { parts: [{ part, shape, joint, to?, radius?, radii? }] }.'
});

const fail = (where, message) => { throw new TypeError(`${where}: ${message}`); };

const COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^()]*\)|hsla?\([^()]*\)|transparent)$/i;
const LOOK_KINDS = Object.freeze({
    color: () => v => typeof v === 'string' && COLOR.test(v.trim()),
    colors: () => v => Array.isArray(v) && v.length > 0 && v.every(c => typeof c === 'string' && COLOR.test(c.trim())),
    number: f => v => Number.isFinite(v) && !(v < f.min) && !(v > f.max),
    integer: f => v => Number.isInteger(v) && !(v < f.min) && !(v > f.max),
    boolean: () => v => typeof v === 'boolean',
    text: () => v => typeof v === 'string',
    choice: f => v => f.values.includes(v)
});
/** Throws unless every field of `look` is one the family declares, with a value of its kind. Returns `look`. */
export function checkLook(family, look, where = 'look') {
    if (!plain(look)) fail(where, 'a look is an object of fields');
    for (const [field, value] of Object.entries(look)) {
        const spec = family.look[field];
        if (!spec) fail(where, `unknown look field ${field} (the family has ${Object.keys(family.look).join(', ')})`);
        if (!LOOK_KINDS[spec.kind](spec)(value)) fail(where, `look field ${field} must be ${spec.kind === 'choice' ? `one of ${spec.values.join(', ')}` : `${spec.kind === 'integer' ? 'an' : 'a'} ${spec.kind}`}${spec.min !== undefined || spec.max !== undefined ? ` in ${spec.min ?? '-inf'}..${spec.max ?? 'inf'}` : ''}`);
    }
    return look;
}
function validateFamily(family, where) {
    if (!plain(family) || !plain(family.look)) fail(where, 'requires a look schema');
    for (const [field, spec] of Object.entries(family.look)) {
        if (!plain(spec) || !Object.hasOwn(LOOK_KINDS, spec.kind)) fail(where, `look field ${field} needs a kind: ${Object.keys(LOOK_KINDS).join(', ')}`);
        if (spec.kind === 'choice' && (!Array.isArray(spec.values) || !spec.values.length)) fail(where, `look field ${field}: a choice needs values`);
        if (!LOOK_KINDS[spec.kind](spec)(spec.default)) fail(where, `look field ${field}: its default is not a ${spec.kind}`);
    }
}

/** Throws unless `data` is a prop_catalog, with every preset's look checked against its family. Returns it. */
export function validatePropCatalog(data, where = 'prop_catalog') {
    if (!plain(data) || !plain(data.types)) fail(where, 'requires a types object');
    if (data.families !== undefined && !plain(data.families)) fail(where, 'families must be an object');
    for (const [id, family] of Object.entries(data.families ?? {})) validateFamily(family, `${where}: family ${id}`);
    for (const [type, entry] of Object.entries(data.types)) {
        if (!plain(entry) || !plain(entry.defaults)) fail(where, `type ${type} requires a defaults object`);
        if (entry.movable !== undefined && typeof entry.movable !== 'boolean') fail(where, `type ${type}: movable must be a boolean`);
        if (entry.blocks_light !== undefined && typeof entry.blocks_light !== 'boolean') fail(where, `type ${type}: blocks_light must be a boolean`);
        if (entry.light !== undefined && (!plain(entry.light) || !(Number.isFinite(entry.light.radius) || Array.isArray(entry.light.size)))) fail(where, `type ${type}: a light needs a radius or a size`);
        const { family, look } = entry.defaults;
        if (family !== undefined && !Object.hasOwn(data.families ?? {}, family)) fail(where, `type ${type}: unknown family ${family}`);
        if (look !== undefined) { if (family === undefined) fail(where, `type ${type}: a look needs a family`); checkLook(data.families[family], look, `${where}: type ${type}`); }
    }
    return data;
}

/** Throws unless `layout` is a map_layout whose placements name types in `types`, and whose looks fit
 *  their families in `families` (when given). Returns it. */
export function validateMapLayout(layout, types, where = 'map_layout', families = null) {
    if (!plain(layout) || !Array.isArray(layout.props)) fail(where, 'requires a props array');
    layout.props.forEach((p, i) => {
        if (!plain(p) || typeof p.type !== 'string') fail(where, `placement ${i} requires a type`);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(where, `placement ${i} (${p.type}) requires a finite x and y`);
        if (types && !Object.hasOwn(types, p.type)) fail(where, `placement ${i}: unknown prop type ${p.type}`);
        if (families && (p.look !== undefined || p.family !== undefined)) {
            const family = p.family ?? types?.[p.type]?.defaults.family;
            if (!Object.hasOwn(families, family ?? '')) fail(where, `placement ${i} (${p.type}): unknown family ${family}`);
            if (p.look != null) checkLook(families[family], Object.fromEntries(Object.entries(p.look).filter(([, v]) => v !== null)), `${where}: placement ${i} (${p.type})`);
        }
    });
    return layout;
}

const name = value => typeof value === 'string' && value.length > 0;

/** Throws unless `data` is a skeleton whose joints have unique names and known parents. Returns it. */
export function validateSkeleton(data, where = 'skeleton') {
    if (!plain(data) || !name(data.rig_id) || !Array.isArray(data.joints) || !data.joints.length) fail(where, 'requires a rig_id and a joints list');
    const names = new Set();
    for (const joint of data.joints) { if (!plain(joint) || !name(joint.name) || names.has(joint.name)) fail(where, `joint ${joint?.name} needs a unique name`); names.add(joint.name); }
    for (const joint of data.joints) if (joint.parent != null && !names.has(joint.parent)) fail(where, `joint ${joint.name}: unknown parent ${joint.parent}`);
    for (const [id, anchor] of Object.entries(data.anchors ?? {})) if (!plain(anchor) || !names.has(anchor.joint)) fail(where, `anchor ${id}: unknown joint`);
    return data;
}

/** Throws unless `data` is a clip_set of uniquely named clips with positive durations. Returns it. */
export function validateClipSet(data, where = 'clip_set') {
    if (!plain(data) || !Array.isArray(data.clips)) fail(where, 'requires a clips list');
    const ids = new Set();
    for (const clip of data.clips) {
        if (!plain(clip) || !name(clip.clip_id) || ids.has(clip.clip_id)) fail(where, `clip ${clip?.clip_id} needs a unique clip_id`);
        if (!(clip.duration > 0) || !Array.isArray(clip.tracks)) fail(where, `clip ${clip.clip_id} needs a positive duration and tracks`);
        ids.add(clip.clip_id);
    }
    return data;
}

/** Throws unless `data` is locomotion naming its clips, with a positive stride. Returns it. */
export function validateLocomotion(data, where = 'locomotion') {
    if (!plain(data) || !name(data.idle) || !name(data.walk)) fail(where, 'requires idle and walk clip ids');
    if (!(data.stride > 0) || !(data.moving_speed >= 0)) fail(where, 'requires a positive stride and a moving_speed of zero or more');
    return data;
}

/** Throws unless `data` is a figure: named parts of a known shape, with the sizes that shape needs. Returns it. */
export function validateFigure(data, where = 'figure') {
    if (!plain(data) || !Array.isArray(data.parts)) fail(where, 'requires a parts list');
    for (const p of data.parts) {
        if (!plain(p) || !name(p.part) || !name(p.joint)) fail(where, `part ${p?.part} needs a name and a joint`);
        if (p.shape === 'capsule' ? !name(p.to) || !(p.radius > 0) : p.shape === 'circle' ? !(p.radius > 0) : p.shape === 'ellipse' ? !Array.isArray(p.radii) || !p.radii.every(r => r > 0) : true) fail(where, `part ${p.part}: a ${p.shape} needs its sizes`);
    }
    return data;
}

/** Throws unless `data` is a door_kind: a name and leaves that each span the opening and slide or hinge. Returns it. */
export function validateDoorKind(data, where = 'door_kind') {
    if (!plain(data) || !name(data.name) || !Array.isArray(data.leaves)) fail(where, 'requires a name and a leaves list');
    const span = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
    data.leaves.forEach((leaf, i) => {
        if (!plain(leaf) || !span(leaf.from) || !span(leaf.to)) fail(where, `leaf ${i} needs from and to as [fraction, px]`);
        if (leaf.motion === 'slide' ? !span(leaf.travel) : leaf.motion === 'hinge' ? !(leaf.pivot >= 0 && leaf.pivot <= 1) : true) fail(where, `leaf ${i}: slide needs travel, hinge needs a pivot 0..1`);
        if (i && !name(leaf.suffix)) fail(where, `leaf ${i} needs a suffix`);
    });
    return data;
}

const VALIDATORS = { prop_catalog: validatePropCatalog, skeleton: validateSkeleton, clip_set: validateClipSet, locomotion: validateLocomotion, figure: validateFigure, door_kind: validateDoorKind };
/** Validates every resource of a library whose kind has a structure here; other kinds pass through. Returns the library. */
export function validateLibrary(library) {
    for (const [id, resource] of Object.entries(library?.resources ?? {})) VALIDATORS[resource?.kind]?.(resource, `${library.library_id}:${id}`);
    return library;
}

/** A registry's door kinds by name, ready for the map builder's `door_kinds` option. */
export function doorKindsOf(registry) {
    return Object.fromEntries(registry.listResources({ kind: 'door_kind' }).map(id => { const { kind, name: kind_name, ...door } = registry.getResource(id); return [kind_name, structuredClone(door)]; }));
}
