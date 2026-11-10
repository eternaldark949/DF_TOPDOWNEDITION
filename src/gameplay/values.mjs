// Gameplay validation, deliberately unrelated to physical vectors or integration.
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
