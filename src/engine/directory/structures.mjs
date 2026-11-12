// ===== LV2 DIRECTORY =====
// DATA STRUCTURES: what each kind of library resource looks like, and the checks that an entry is
// well formed. A structure names fields, units and defaults; it never says what the data does.
//
// prop_catalog   { types: { <type>: { defaults: {...authored options}, movable?: boolean } } }
//                One entry per prop type. A placement names its type and lists only what differs.
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
// figure         { parts: [{ part, shape: 'circle'|'ellipse'|'capsule', joint, to?, radius?, radii? }] }
//                How a rigged body is drawn, back to front: a circle or ellipse at a joint, or a
//                capsule from `joint` to `to`. Sizes in px before the rig's own scale.
import { plain } from './values.mjs';

export const STRUCTURES = Object.freeze({
    prop_catalog: 'A catalog of prop types: { types: { <type>: { defaults, movable? } } }.',
    map_layout: 'A map\'s placements over a prop catalog: { props: [{ type, x, y, ...fields }], ... }.',
    skeleton: 'A rig hierarchy: { rig_id, joints: [{ name, parent?, position?, rotation?, scale?, limits? }], anchors? }.',
    clip_set: 'Animation clips for one skeleton: { clips: [{ clip_id, duration, tracks, markers? }] }.',
    locomotion: 'Which clips stand and walk: { idle, walk, stride (px per cycle), moving_speed (px/s) }.',
    figure: 'How a rigged body is drawn, back to front: { parts: [{ part, shape, joint, to?, radius?, radii? }] }.'
});

const fail = (where, message) => { throw new TypeError(`${where}: ${message}`); };

/** Throws unless `data` is a prop_catalog. Returns it. */
export function validatePropCatalog(data, where = 'prop_catalog') {
    if (!plain(data) || !plain(data.types)) fail(where, 'requires a types object');
    for (const [type, entry] of Object.entries(data.types)) {
        if (!plain(entry) || !plain(entry.defaults)) fail(where, `type ${type} requires a defaults object`);
        if (entry.movable !== undefined && typeof entry.movable !== 'boolean') fail(where, `type ${type}: movable must be a boolean`);
    }
    return data;
}

/** Throws unless `layout` is a map_layout whose placements name types in `types`. Returns it. */
export function validateMapLayout(layout, types, where = 'map_layout') {
    if (!plain(layout) || !Array.isArray(layout.props)) fail(where, 'requires a props array');
    layout.props.forEach((p, i) => {
        if (!plain(p) || typeof p.type !== 'string') fail(where, `placement ${i} requires a type`);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(where, `placement ${i} (${p.type}) requires a finite x and y`);
        if (types && !Object.hasOwn(types, p.type)) fail(where, `placement ${i}: unknown prop type ${p.type}`);
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

const VALIDATORS = { prop_catalog: validatePropCatalog, skeleton: validateSkeleton, clip_set: validateClipSet, locomotion: validateLocomotion, figure: validateFigure };
/** Validates every resource of a library whose kind has a structure here; other kinds pass through. Returns the library. */
export function validateLibrary(library) {
    for (const [id, resource] of Object.entries(library?.resources ?? {})) VALIDATORS[resource?.kind]?.(resource, `${library.library_id}:${id}`);
    return library;
}
