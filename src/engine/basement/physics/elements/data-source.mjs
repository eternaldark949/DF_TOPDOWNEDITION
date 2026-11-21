// ===== LV0 BASEMENT =====
// THE DATA SOURCE CONTRACT: what the Basement needs from wherever its data lives. The Directory's
// registry (engine/directory/registry.mjs) provides it; the Basement never imports the Directory,
// it is handed a source as `new physicsSystem({ asset_library })`. Two calls:
//   resolveTemplate(template_id, packet) -> the packet resolved over its template, a detached copy
//   getResource(resource_id)             -> a frozen typed resource {kind, ...}, or throws
// With no source, a world has no templates and no resources: packets are used as they are.

const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
const UNSAFE = ['__proto__', 'prototype', 'constructor'];

export function isDataSource(source) { return !!source && typeof source.resolveTemplate === 'function' && typeof source.getResource === 'function'; }

/** The source of a world given none: no templates, no resources. */
export const EMPTY_DATA_SOURCE = Object.freeze({
    resolveTemplate(template_id, packet = {}) {
        if (template_id) throw new Error(`Unknown entity template: ${template_id}`);
        const value = {};
        for (const [key, entry] of Object.entries(packet)) {
            if (UNSAFE.includes(key)) throw new TypeError(`Unsafe asset key: ${key}`);
            value[key] = structuredClone(entry);
        }
        if (!plain(value.assets ?? {})) throw new TypeError('Entity assets must be a slot-to-resource object');
        if (!plain(value.data ?? {})) throw new TypeError('Entity data must be an object');
        for (const id of Object.values(value.assets ?? {})) this.getResource(id);
        return value;
    },
    getResource(resource_id) { throw new Error(`Unknown asset resource: ${resource_id}`); }
});
