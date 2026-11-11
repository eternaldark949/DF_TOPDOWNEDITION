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

export function validateModifiers(modifiers) {
    const copy=jsonCopy(modifiers);
    if(!copy || typeof copy!=='object' || Array.isArray(copy))throw new TypeError('Buff modifiers must be a record');
    for(const modifier of Object.values(copy)) {
        if(!modifier || typeof modifier!=='object' || Array.isArray(modifier) || Object.keys(modifier).some(key=>!['add','multiply'].includes(key)))throw new TypeError('Buff modifiers require add and/or multiply');
        if(modifier.add!==undefined&&!Number.isFinite(modifier.add))throw new TypeError('Buff addition must be finite');
        if(modifier.multiply!==undefined)nonnegative(modifier.multiply,'buff multiplier');
    }
    return copy;
}
