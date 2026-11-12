// ===== LV2 DIRECTORY =====
// DATA STRUCTURES: what each kind of library resource looks like, and the checks that an entry is
// well formed. A structure names fields, units and defaults; it never says what the data does.
//
// prop_catalog   { types: { <type>: { defaults: {...authored options}, movable?: boolean } } }
//                One entry per prop type. A placement names its type and lists only what differs.
// map_layout     { map_id?, props: [placement], ...any other per-map lists (copied as data) }
//                placement = { type, x, y, ...fields }: fields override the type's defaults, and a
//                field set to null removes that default.
import { plain } from './values.mjs';

export const STRUCTURES = Object.freeze({
    prop_catalog: 'A catalog of prop types: { types: { <type>: { defaults, movable? } } }.',
    map_layout: 'A map\'s placements over a prop catalog: { props: [{ type, x, y, ...fields }], ... }.'
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
