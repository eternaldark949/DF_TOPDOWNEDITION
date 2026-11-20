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
// map            { size: [w, h], setting?: 'interior'|'exterior', spawn?, floors?, wall_look?, walls?, placements?, rooms?, doors?, switches?, light_grid?, ... }
//                A whole map as data: the Basement map builder's definition, found by its id like any
//                resource. `setting` is the builder's `kind` (the resource's own `kind` is 'map'). Fields
//                the builder does not read (a label, landmarks, windows) are the game's, kept as data.
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
import { plain } from './values.mjs';
import { DRAWING, MATERIAL, readEmits, readReflect, readLightGrid, validateEffectsPreset } from '../basement/rendering/index.mjs';

export const STRUCTURES = Object.freeze({
    prop_catalog: 'A catalog of prop types and the families they are presets of: { types: { <type>: { defaults, movable?, blocks_light?, light? } }, families?: { <family>: { look: { <field>: { kind, default } } } } }.',
    map_layout: 'A map\'s placements over a prop catalog: { props: [{ type, x, y, ...fields }], ... }.',
    map: 'A whole map as data, the map builder\'s definition: { size: [w, h], setting?: "interior" | "exterior", spawn?, floors? (drawing steps in map space), wall_look?, walls?, wall_openings?, placements?, lights?, triggers?, rooms?, doors?, room_links?, cloths?, regions?, ...game data }. Built with mapDefinition(registry, id).',
    skeleton: 'A rig hierarchy: { rig_id, joints: [{ name, parent?, position?, rotation?, scale?, limits? }], anchors? }.',
    clip_set: 'Animation clips for one skeleton: { clips: [{ clip_id, duration, tracks, markers? }] }.',
    locomotion: 'Which clips stand and walk: { idle, walk, stride (px per cycle), moving_speed (px/s) }.',
    door_kind: 'The leaves that fill a door\'s opening: { name, leaves: [{ from, to, motion, travel?, pivot?, hinge?, suffix? }] }.',
    drawing: 'An object\'s art in its own space, back to front: { steps: [{ shape, material?, solid?, ...fields }] }; shape is a drawing shape or group ({ shape: "group", x?, y?, rotation?, scale?, steps }). "$name" values are read from the object\'s look.',
    material: 'How a substance looks and behaves: { fill?, stroke?, line_width?, line_cap?, line_join?, dash?, alpha?, blend?, shadow?, surface?: { friction?, restitution?, hit_sound?, hit_effect?, footstep? }, emits?, reflect?: true | { strength? (0..1), wet?, plane? } }; fill may be a colour, a gradient or a pattern { type: "pattern", image, repeat? }.',
    texture: 'A surface that repeats, drawn once per set of values and tiled: { size: [w, h] (world units), steps (drawing steps, "$name" read from values), values (the default colours), base (the colour shown until the tile is ready), pixels_per_unit? (default 4) }. A material repeats it with fill: { type: "pattern", texture, values?, scale?, rotation?, offset? }.',
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

/** A drawing resource: a list of steps, each a known shape or a group of steps. */
export function validateDrawing(drawing, where = 'drawing') {
    if (!plain(drawing) || !Array.isArray(drawing.steps)) fail(where, 'a drawing is { steps: [...] }');
    const walk = (steps, at) => steps.forEach((step, i) => {
        const here = `${at}[${i}]`;
        if (!plain(step) || typeof step.shape !== 'string') fail(here, 'a step is { shape, ... }');
        if (step.shape === 'group') { if (!Array.isArray(step.steps)) fail(here, 'a group holds steps'); walk(step.steps, `${here}.steps`); }
        else if (!Object.hasOwn(DRAWING, step.shape)) fail(here, `unknown shape ${step.shape} (one of ${Object.keys(DRAWING).join(', ')}, group)`);
        if (step.solid !== undefined && typeof step.solid !== 'boolean') fail(here, 'solid is true or false');
        if (step.material !== undefined && (typeof step.material !== 'string' || !step.material)) fail(here, 'material names a material resource');
        if (step.emits !== undefined) emitsOf(step.emits, here);
        if (step.reflect !== undefined) reflectOf(step.reflect, here);
    });
    walk(drawing.steps, `${where}.steps`); return drawing;
}
/** Checks a step's or a material's `emits` (true, false, or {strength, reach, color, height}: see the Basement's EMITS). */
function emitsOf(emits, where) { try { readEmits(emits); } catch (error) { fail(where, error.message); } }
/** Checks a step's or a material's `reflect` (true, false, or {strength, wet, plane}: see the Basement's REFLECT). */
function reflectOf(reflect, where) { try { readReflect(reflect); } catch (error) { fail(where, error.message); } }
const SURFACE_FIELDS = ['friction', 'restitution', 'hit_sound', 'hit_effect', 'footstep'];
/** A material resource: paint fields and an optional physical surface, nothing else. */
/** Throws unless `texture` is a texture: a tile size, its drawing steps, default values and a base colour. Returns it. */
export function validateTexture(texture, where = 'texture') {
    if (!plain(texture)) fail(where, 'a texture is { size, steps, values, base }');
    for (const key of Object.keys(texture)) if (!['kind', 'size', 'steps', 'values', 'base', 'pixels_per_unit'].includes(key)) fail(where, `unknown field ${key} (a texture holds size, steps, values, base, pixels_per_unit)`);
    if (!Array.isArray(texture.size) || texture.size.length !== 2 || !texture.size.every(v => Number.isFinite(v) && v > 0)) fail(where, 'size is [width, height] in world units');
    if (texture.pixels_per_unit !== undefined && !(Number.isFinite(texture.pixels_per_unit) && texture.pixels_per_unit > 0 && texture.pixels_per_unit <= 16)) fail(where, 'pixels_per_unit is in (0, 16]');
    if (typeof texture.base !== 'string' || !COLOR.test(texture.base.trim())) fail(where, 'base is the colour shown until the tile is painted');
    if (texture.values !== undefined && !plain(texture.values)) fail(where, 'values are { name: colour }');
    const [w, h] = texture.size, px = (texture.pixels_per_unit ?? 4) ** 2 * w * h;
    if (px > 4096 * 4096) fail(where, 'the tile is too big: keep size × pixels_per_unit within 4096 pixels a side');
    validateDrawing({ steps: texture.steps }, where);
    return texture;
}
export function validateMaterial(material, where = 'material') {
    if (!plain(material)) fail(where, 'a material is an object');
    for (const key of Object.keys(material)) if (!MATERIAL.paint.includes(key) && !MATERIAL.other.includes(key)) fail(where, `unknown field ${key} (a material holds ${[...MATERIAL.paint, ...MATERIAL.other].join(', ')})`);
    if (material.reflect !== undefined) reflectOf(material.reflect, where);
    if (material.emits !== undefined) { if (material.emits === false || material.emits === null) fail(where, 'emits on a material is true or {strength, reach, color, height}'); emitsOf(material.emits, where); }
    if (material.surface !== undefined) {
        if (!plain(material.surface)) fail(where, 'surface is an object');
        for (const [key, value] of Object.entries(material.surface)) {
            if (!SURFACE_FIELDS.includes(key)) fail(where, `unknown surface field ${key} (one of ${SURFACE_FIELDS.join(', ')})`);
            if (['friction', 'restitution'].includes(key) && !(Number.isFinite(value) && value >= 0 && (key !== 'restitution' || value <= 1))) fail(where, `${key} is a number${key === 'restitution' ? ' in [0, 1]' : ' of 0 or more'}`);
        }
    }
    return material;
}
const MAP_LISTS = ['floors', 'walls', 'wall_openings', 'placements', 'lights', 'triggers', 'doors', 'room_links', 'cloths'];
const point = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
/** Throws unless `map` is a map: a positive size, its sections the right shapes, a floor step a drawing step. Returns it. */
export function validateMap(map, where = 'map') {
    if (!plain(map)) fail(where, 'a map is { size, ...sections }');
    if (!Array.isArray(map.size) || map.size.length !== 2 || !map.size.every(v => Number.isFinite(v) && v > 0)) fail(where, 'size is [width, height] in world units');
    if (map.setting !== undefined && !['interior', 'exterior'].includes(map.setting)) fail(where, 'setting is interior or exterior');
    if (map.spawn !== undefined && map.spawn !== null && !point(map.spawn)) fail(where, 'spawn is [x, y]');
    for (const key of MAP_LISTS) if (map[key] !== undefined && !(Array.isArray(map[key]) && map[key].every(plain))) fail(where, `${key} is a list of objects`);
    if (map.rooms !== undefined && !(plain(map.rooms) && Object.values(map.rooms).every(plain))) fail(where, 'rooms are { id: room }');
    if (map.wall_look !== undefined && !(plain(map.wall_look) && typeof map.wall_look.material === 'string')) fail(where, 'wall_look is { material, sides?, height?, layer? }');
    if (map.switches !== undefined && !(plain(map.switches) && Object.values(map.switches).every(v => typeof v === 'boolean'))) fail(where, 'switches are { system: true | false }');
    if (map.light_grid !== undefined) { try { readLightGrid(map.light_grid); } catch (error) { fail(where, error.message); } }
    if (map.floors?.length) validateDrawing({ steps: map.floors.map(({ elevation, thickness, sides, ...step }) => step) }, `${where}.floors`);
    return map;
}
/** The map builder's definition of the map resource `id`: a detached copy, its `setting` as the builder's `kind` and its id as `map_id`. */
export function mapDefinition(registry, id) {
    const map = registry.getResource(id);
    if (map?.kind !== 'map') throw new TypeError(`${id} is not a map`);
    const { kind, setting = 'interior', ...definition } = structuredClone(map);
    return { map_id: id, kind: setting, ...definition };
}
const VALIDATORS = { drawing: validateDrawing, material: validateMaterial, texture: validateTexture, prop_catalog: validatePropCatalog, skeleton: validateSkeleton, clip_set: validateClipSet, locomotion: validateLocomotion, door_kind: validateDoorKind, effects: validateEffectsPreset, map: validateMap };
/** Validates every resource of a library whose kind has a structure here; other kinds pass through. Returns the library. */
export function validateLibrary(library) {
    for (const [id, resource] of Object.entries(library?.resources ?? {})) VALIDATORS[resource?.kind]?.(resource, `${library.library_id}:${id}`);
    return library;
}

/** A registry's door kinds by name, ready for the map builder's `door_kinds` option. */
export function doorKindsOf(registry) {
    return Object.fromEntries(registry.listResources({ kind: 'door_kind' }).map(id => { const { kind, name: kind_name, ...door } = registry.getResource(id); return [kind_name, structuredClone(door)]; }));
}
