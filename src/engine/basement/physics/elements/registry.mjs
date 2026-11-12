// ===== LV0 BASEMENT =====
import { clone, freeze } from '../core/values.mjs';
import { assetLibrary } from './asset-library.mjs';
import { gameEntity, entityRecord, restoreEntity } from './entity.mjs';
import { gameCharacter, gameVehicle, gameProjectile, gameProp, gameStatic, gameTrigger, gameDecoration, awarenessMatrix } from './elements.mjs';

const builtins = { entity: gameEntity, character: gameCharacter, vehicle: gameVehicle, projectile: gameProjectile, prop: gameProp, static: gameStatic, trigger: gameTrigger, decoration: gameDecoration };

/** Identity registry, never a physical-state cache or another spatial index. */
export class gameElements {
    #entities = new Map(); #types = new Map(Object.entries(builtins)); #construction = null; #restore = null;
    constructor(world, { asset_library = new assetLibrary() } = {}) {
        if (!world || typeof world._createEntityComponents !== 'function' || typeof world._mutate !== 'function') throw new TypeError('gameElements requires its physicsSystem owner');
        if (world.elements) throw new Error('The world already owns its authoritative gameElements registry');
        if (!(asset_library instanceof assetLibrary)) throw new TypeError('asset_library must be an assetLibrary');
        Object.defineProperties(this, { world: { value: world }, asset_library: { value: asset_library, enumerable: true } });
    }
    #resolve(packet) {
        for (const key of ['body', 'physics_controller', 'entity_id', 'body_id', 'linked_object', 'linked_entity']) {
            if (Object.hasOwn(packet, key)) throw new TypeError(`Entity construction cannot adopt or override ${key}`);
        }
        // Runtime target handles are commands, not serializable asset definitions.
        const { target, ...definition } = packet;
        const resolved = this.asset_library.resolveTemplate(definition.template, definition);
        if (target !== undefined) resolved.target = target;
        return resolved;
    }
    createEntity(packet = {}) {
        const resolved = this.#resolve(packet), type = resolved.entity_type ?? 'entity', Constructor = this.#types.get(type);
        if (!Constructor) throw new Error(`Unknown entity type: ${type}`);
        const previous = this.#construction, context = { entities: [] }; this.#construction = context;
        try {
            const entity = new Constructor(this, { ...resolved, entity_type: type });
            if (!(entity instanceof Constructor) || !context.entities.includes(entity)) throw new TypeError('Entity constructor must initialize its gameEntity base');
            if (previous) previous.entities.push(...context.entities);
            return entity;
        }
        catch (error) {
            for (const entity of context.entities.reverse()) { const record = entityRecord(entity); if (!record.destroyed) this.world.removeBody(record.body); }
            throw error;
        }
        finally { this.#construction = previous; }
    }
    createCharacter(packet = {}) { return this.#createKind('character', packet); }
    createVehicle(packet = {}) { return this.#createKind('vehicle', packet); }
    createProjectile(packet = {}) { return this.#createKind('projectile', packet); }
    createProp(packet = {}) { return this.#createKind('prop', packet); }
    createStatic(packet = {}) { return this.#createKind('static', packet); }
    createTrigger(packet = {}) { return this.#createKind('trigger', packet); }
    createDecoration(packet = {}) { return this.#createKind('decoration', packet); }
    #createKind(role, packet) {
        const resolved = this.#resolve(packet), type = resolved.entity_type ?? role, Constructor = this.#types.get(type);
        if (!Constructor || Constructor.physics_role !== role) throw new TypeError(`Entity type ${type} is not a ${role}`);
        return this.createEntity({ ...packet, entity_type: type });
    }
    registerEntityType(entity_type, Constructor) {
        if (typeof entity_type !== 'string' || !entity_type || typeof Constructor !== 'function' || !(Constructor.prototype instanceof gameEntity)) throw new TypeError('Entity classes must extend gameEntity');
        if (this.#types.has(entity_type)) throw new Error(`Entity type already registered: ${entity_type}`);
        if (!Object.hasOwn(builtins, Constructor.physics_role)) throw new TypeError('Unsupported physics_role');
        this.#types.set(entity_type, Constructor); return this;
    }
    listEntityTypes() { return [...this.#types.keys()]; }
    fetchEntity(entity_id) { return this.#entities.get(entity_id) ?? null; }
    getEntities({ entity_type, active } = {}, results = []) {
        results.length = 0;
        for (const entity of this.#entities.values()) if ((!entity_type || entity.entity_type === entity_type) && (active === undefined || entity.active === active)) results.push(entity);
        return results;
    }
    getEntityForBody(body) { return this.fetchEntity(this.world._record(body).id); }
    peruseNearbyEntities(reference, options = {}, results = []) { return this.world.peruseNearbyEntities(reference, { ...options, spatial_entities: true }, results); }
    getStatistics() { return { entities: this.#entities.size, entity_types: this.#types.size }; }
    _construct(entity, packet, Constructor) {
        const definition = this.#resolve(packet), type = definition.entity_type ?? Constructor.entity_type;
        if (this.#types.get(type) !== Constructor) throw new TypeError('Construct a registered entity class through its declared entity_type');
        // Plain construction and save restoration use the same base, but normal callers cannot adopt a pre-existing body.
        const restored = this.#restore;
        const components = restored ? this.world._restoreEntityComponents(restored.entity_id, Constructor.physics_role) : this.world._createEntityComponents(Constructor.physics_role, definition);
        const bodyState = components.body.getState();
        const record = { elements: this, body: components.body, controller: components.controller, awareness: components.awareness ?? null,
            entity_type: type, template_id: definition.template ?? null, name: bodyState.name, tags: freeze(bodyState.tags),
            assets: freeze(clone(definition.assets ?? {})), data: clone(definition.data ?? {}), registered: false, destroyed: false, subscriptions: new Set() };
        this.#construction?.entities.push(entity);
        this.world._mutate(() => {
            if (record.destroyed) return;
            if (this.#entities.has(record.body.body_id)) throw new Error('Duplicate entity identity');
            record.registered = true; this.#entities.set(record.body.body_id, entity);this.world._emit('entityRegistered',{entity,body:record.body});
        });
        return record;
    }
    _requireLive(entity) {
        const r = entityRecord(entity);
        if (r.elements !== this || r.destroyed) throw new Error('Entity is destroyed or belongs to another owner');
        return r;
    }
    _setAsset(entity, slot, resource_id) {
        if (typeof slot !== 'string' || !slot || ['__proto__', 'constructor', 'prototype'].includes(slot)) throw new TypeError('Invalid asset slot');
        const r = this._requireLive(entity); this.asset_library.getResource(resource_id);
        this.world._mutate(() => { if (!r.destroyed) r.assets = freeze({ ...r.assets, [slot]: resource_id }); });
    }
    _subscribe(entity, event_name, handler) {
        const r = this._requireLive(entity); if (typeof handler !== 'function') throw new TypeError('Entity event handler must be a function');
        const unsubscribe = this.world.on(event_name, event => {
            const id = entity.entity_id;
            if ([event.body?.body_id, event.body_a?.body_id, event.body_b?.body_id, event.target_body?.body_id, event.parent_body?.body_id].includes(id)) handler.call(entity, event);
        });
        const drop = () => { unsubscribe(); r.subscriptions.delete(drop); }; r.subscriptions.add(drop); return drop;
    }
    _bodyRemoved(body_id) {
        const entity = this.#entities.get(body_id); if (!entity) return;
        const r = entityRecord(entity); r.destroyed = true; r.registered = false;
        for (const drop of [...r.subscriptions]) drop();this.world._emit('entityRemoved',{entity,body:r.body}); this.#entities.delete(body_id);
    }
    _bodyUpdated(body_id, config) {
        const entity = this.#entities.get(body_id); if (!entity) return;
        const r = entityRecord(entity); r.name = config.name; r.tags = freeze(clone(config.tags));
    }
    _clear() { for (const id of [...this.#entities.keys()]) this._bodyRemoved(id); }
    _snapshotEntity(entity, result = {}) {
        const r = entityRecord(entity);
        return Object.assign(result, { entity_id: entity.entity_id, entity_type: r.entity_type, template: r.template_id, name: r.name,
            tags: clone(r.tags), assets: clone(r.assets), data: clone(r.data), registered: r.registered, destroyed: r.destroyed,
            body: r.destroyed ? null : r.body.getState() });
    }
    _saveState() { return this.getEntities().map(entity => { const { body, registered, destroyed, ...state } = this._snapshotEntity(entity); return state; }); }
    _restoreState(entries = []) {
        const seen = new Set();
        for (const state of entries) {
            if (!Number.isSafeInteger(state.entity_id) || seen.has(state.entity_id)) throw new TypeError('Invalid saved entity identity');
            seen.add(state.entity_id); this.#restore = state;
            try {
                const Constructor = this.#types.get(state.entity_type);
                if (!Constructor) throw new TypeError(`Register saved entity type before loading: ${state.entity_type}`);
                restoreEntity(this, { entity_type: state.entity_type, template: state.template ?? undefined, name: state.name, tags: state.tags, assets: state.assets, data: state.data }, Constructor);
            } finally { this.#restore = null; }
        }
    }
    _copyTypesTo(elements) { for (const [type, Constructor] of this.#types) if (!Object.hasOwn(builtins, type)) elements.registerEntityType(type, Constructor); }
}
