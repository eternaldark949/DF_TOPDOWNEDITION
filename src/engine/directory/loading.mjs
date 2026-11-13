// ===== LV2 DIRECTORY =====
// LOADING: turning authored library data into ready-to-use data, once, at load time. Every result
// is a detached copy; nothing here keeps state or touches a world.


import { plain } from './values.mjs';
import { checkLook } from './structures.mjs';
/** A placement's full options: its type's defaults, then its own fields (null removes a default). */
export function resolvePlacement(placement, types) {
    const { type, ...fields } = placement, entry = types?.[type];
    if (!entry) throw new Error(`Unknown prop type: ${type}`);
    const options = structuredClone(entry.defaults);
    for (const [key, value] of Object.entries(fields)) {
        if (value === null) delete options[key];
        else if (key === 'look' && plain(value) && plain(options.look)) {           // a look is set field by field
            for (const [field, v] of Object.entries(value)) if (v === null) delete options.look[field]; else options.look[field] = structuredClone(v);
        } else options[key] = structuredClone(value);
    }
    return options;
}

/** A piece's whole look: its family's defaults with `look` over them, checked against the family's schema. */
export function resolvePropLook(families, family, look = {}) {
    const entry = families?.[family];
    if (!entry) throw new TypeError(`Unknown prop family: ${family}`);
    checkLook(entry, look, `family ${family}`);
    return { ...Object.fromEntries(Object.entries(entry.look).map(([field, spec]) => [field, structuredClone(spec.default)])), ...structuredClone(look) };
}

/** Whether props of this catalog type can be pushed (the catalog's `movable` flag). */
export const isMovable = (type, types) => !!types?.[type]?.movable;

/**
 * A map_layout with every placement resolved over `types`: { props, prop_types, ...other fields }.
 * `prop_types[i]` names the type of `props[i]`. Every other field of the layout is copied as data,
 * in its authored order, except the ones named in `omit`.
 */
export function resolveLayout(layout, types, { omit = [] } = {}) {
    const result = { props: layout.props.map(p => resolvePlacement(p, types)), prop_types: layout.props.map(p => p.type) };
    for (const [key, value] of Object.entries(layout)) if (key !== 'props' && !omit.includes(key)) result[key] = structuredClone(value);
    return result;
}
