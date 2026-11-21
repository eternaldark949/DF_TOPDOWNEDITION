// ===== LV2 DIRECTORY =====
// Plain-data helpers shared by the Directory's registry, structures and loading.

/** A plain JSON object: an object literal or a null-prototype object, from any realm. */
export const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
export const clone = value => structuredClone(value);
/** Deep-freeze in place and return the value. */
export function freeze(value) {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
}

// Data checks shared by every library and every game: a safe id, a finite non-negative number, and a
// copy that refuses anything JSON would silently drop or change (so it survives a save file).
export function nonnegative(value, name) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be finite and nonnegative`);
    return value;
}
export function identifier(value) {
    if (typeof value !== 'string' || !value.trim() || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new TypeError('Expected a safe nonempty identifier');
    return value;
}
export function jsonCopy(value) {
    // Reject values that JSON would silently discard or change in a save file.
    const visit = (v, seen = new Set()) => {
        if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return;
        if (!v || typeof v !== 'object' || seen.has(v) || !Array.isArray(v) && Object.getPrototypeOf(v) !== null && Object.getPrototypeOf(Object.getPrototypeOf(v)) !== null) throw new TypeError('Session data must contain only finite JSON values');
        if(Array.isArray(v) && Object.keys(v).length!==v.length)throw new TypeError('Session arrays must be dense');
        seen.add(v);
        for (const [key, item] of Object.entries(v)) { identifier(key); visit(item, seen); }
        seen.delete(v);
    };
    visit(value); return structuredClone(value);
}
