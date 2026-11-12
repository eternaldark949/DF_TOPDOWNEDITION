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
