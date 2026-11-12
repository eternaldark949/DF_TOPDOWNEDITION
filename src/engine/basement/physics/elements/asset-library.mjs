// ===== LV0 BASEMENT =====
import { clone, freeze } from '../core/values.mjs';

const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
function validateData(value) {
    if (Array.isArray(value)) { for (const entry of value) validateData(entry); return; }
    if (plain(value)) {
        for (const [key, entry] of Object.entries(value)) {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError(`Unsafe asset key: ${key}`);
            validateData(entry);
        }
        return;
    }
    if (typeof value === 'object' && value !== null) throw new TypeError('Asset libraries contain plain JSON data only');
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError('Asset libraries contain data only');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Asset numbers must be finite');
}
export function mergeDefinition(base, changes) {
    const result = clone(base);
    for (const [key, value] of Object.entries(changes)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError(`Unsafe asset key: ${key}`);
        result[key] = plain(value) && plain(result[key]) ? mergeDefinition(result[key], value) : clone(value);
    }
    return result;
}
function identifier(value, name) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new TypeError(`Invalid ${name}: ${value}`);
    return value;
}
const qualified = (library, id) => id.includes(':') ? id : `${library}:${id}`;

/** Generic, immutable data definitions. Concrete game libraries belong to the Directory. */
export class assetLibrary {
    #libraries = new Map(); #templates = new Map(); #resources = new Map();
    constructor({ libraries = [] } = {}) { for (const library of libraries) this.registerLibrary(library); }
    registerLibrary(definition) {
        const library = clone(definition); validateData(library);
        if (!plain(library) || !plain(library.templates ?? {}) || !plain(library.resources ?? {})) throw new TypeError('A library requires object definitions/resources');
        const id = identifier(library.library_id, 'library_id');
        if (this.#libraries.has(id)) throw new Error(`Library already registered: ${id}`);
        const templates = new Map(this.#templates), resources = new Map(this.#resources);
        for (const [key, resource] of Object.entries(library.resources ?? {})) {
            identifier(key, 'resource_id');
            if (!plain(resource) || typeof resource.kind !== 'string') throw new TypeError(`Resource ${key} requires a kind`);
            resources.set(`${id}:${key}`, freeze(clone(resource)));
        }
        const definitions = new Map(Object.entries(library.templates ?? {}));
        const resolving = new Set();
        const resolveTemplate = key => {
            const full = qualified(id, key);
            if (templates.has(full)) return templates.get(full);
            const [owner, local] = full.split(':');
            const entry = owner === id ? definitions.get(local) : null;
            if (!entry || !plain(entry)) throw new Error(`Unknown parent template: ${full}`);
            if (resolving.has(full)) throw new Error(`Template inheritance cycle: ${full}`);
            identifier(local, 'template_id'); resolving.add(full);
            const { extends: parent, ...fields } = entry;
            const value = parent ? mergeDefinition(resolveTemplate(parent), fields) : clone(fields);
            if (typeof value.entity_type !== 'string') throw new TypeError(`Template ${full} requires entity_type`);
            if (!plain(value.assets ?? {})) throw new TypeError(`Template ${full} assets must be an object`);
            for (const [slot, resource] of Object.entries(value.assets ?? {})) {
                if (typeof resource !== 'string') throw new TypeError(`Asset slot ${slot} requires a resource ID`);
                const ref = qualified(id, resource);
                if (!resources.has(ref)) throw new Error(`Unknown resource ${ref} in ${full}`);
                value.assets[slot] = ref;
            }
            resolving.delete(full); templates.set(full, freeze(value)); return templates.get(full);
        };
        for (const key of definitions.keys()) resolveTemplate(key);
        // Commit only after every parent/resource is resolved; failed libraries leave no partial entries.
        this.#templates = templates; this.#resources = resources; this.#libraries.set(id, freeze(library));
        return this;
    }
    hasTemplate(template_id) { return this.#templates.has(template_id); }
    getTemplate(template_id) {
        const value = this.#templates.get(template_id);
        if (!value) throw new Error(`Unknown entity template: ${template_id}`);
        return value;
    }
    resolveTemplate(template_id, overrides = {}) {
        const value = mergeDefinition(template_id ? this.getTemplate(template_id) : {}, overrides);
        if (!plain(value.assets ?? {})) throw new TypeError('Entity assets must be a slot-to-resource object');
        if (!plain(value.data ?? {})) throw new TypeError('Entity data must be an object');
        for (const id of Object.values(value.assets ?? {})) this.getResource(id);
        return value;
    }
    listTemplates({ entity_type } = {}) { return [...this.#templates].filter(([, value]) => !entity_type || value.entity_type === entity_type).map(([id]) => id); }
    getResource(resource_id) {
        const value = this.#resources.get(resource_id);
        if (!value) throw new Error(`Unknown asset resource: ${resource_id}`);
        return value;
    }
    listResources({ kind } = {}) { return [...this.#resources].filter(([, value]) => !kind || value.kind === kind).map(([id]) => id); }
    exportLibraries() { return clone([...this.#libraries.values()]); }
}
