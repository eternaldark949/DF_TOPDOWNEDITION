// ===== LV0 BASEMENT =====
import { readComponents, solidSpan } from './components.mjs';
import { readScale, multiplyScale, massFactor, scaleShape, scaleSpan } from './scale.mjs';
import { clone, freeze } from '../core/values.mjs';
import { EMPTY_DATA_SOURCE, isDataSource } from './data-source.mjs';
import { gameEntity, entityRecord, restoreEntity } from './entity.mjs';
import { KINDS, MOTORS } from './elements.mjs';

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const SPAN_STEP = .5;   // world units a posed span moves before the body is told: breathing does not churn the broadphase
function checkKind(kind, preset) {
    if (typeof kind !== 'string' || !kind || UNSAFE.includes(kind)) throw new TypeError('A kind is named by a non-empty string');
    const { body = {}, motor = null, awareness = false, ...rest } = preset ?? {};
    if (Object.keys(rest).length) throw new TypeError(`Unknown kind field: ${Object.keys(rest).join(', ')} (a kind is {body, motor, awareness})`);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('A kind\'s body is an object of body defaults');
    if (motor !== null && !MOTORS.includes(motor)) throw new TypeError(`A motor is ${MOTORS.join(', ')} or null`);
    if (typeof awareness !== 'boolean') throw new TypeError('awareness is true or false');
    return freeze(clone({ body, motor, awareness }));
}

/** Identity registry, never a physical-state cache or another spatial index. Every object is one gameEntity; its kind is data. */
export class gameElements {
    #entities = new Map(); #byKind = new Map(); #byTag = new Map(); #kinds = new Map(Object.entries(KINDS).map(([k, v]) => [k, checkKind(k, v)])); #construction = null; #restore = null;
    constructor(world, { asset_library = EMPTY_DATA_SOURCE } = {}) {
        if (!world || typeof world._createEntityComponents !== 'function' || typeof world._mutate !== 'function') throw new TypeError('gameElements requires its physicsSystem owner');
        if (world.elements) throw new Error('The world already owns its authoritative gameElements registry');
        if (!isDataSource(asset_library)) throw new TypeError('asset_library must provide resolveTemplate() and getResource() (the Directory registry does)');
        Object.defineProperties(this, { world: { value: world }, asset_library: { value: asset_library, enumerable: true } });
    }
    #resolve(packet) {
        for (const key of ['body', 'motor_instance', 'entity_id', 'body_id', 'linked_object', 'linked_entity']) {
            if (Object.hasOwn(packet, key)) throw new TypeError(`Entity construction cannot adopt or override ${key}`);
        }
        // Runtime target handles are commands, not serializable asset definitions.
        const { target, ...definition } = packet;
        const resolved = this.asset_library.resolveTemplate(definition.template, definition);
        if (target !== undefined) resolved.target = target;
        return resolved;
    }
    /** Makes any object: `kind` (default 'entity') presets its body and parts; every other field is the record's. */
    createEntity(packet = {}) {
        const previous = this.#construction, context = { entities: [] }; this.#construction = context;
        try {
            const entity = new gameEntity(this, packet);
            if (previous) previous.entities.push(...context.entities);
            return entity;
        }
        catch (error) {
            for (const entity of context.entities.reverse()) { const record = entityRecord(entity); if (!record.destroyed) this.world.removeBody(record.body); }
            throw error;
        }
        finally { this.#construction = previous; }
    }
    /** Adds a kind: `{body, motor, awareness}` — body defaults, the motor it switches on (or null), and whether it is aware of its surroundings. */
    defineKind(kind, preset) { if (this.#kinds.has(kind)) throw new Error(`Kind already defined: ${kind}`); this.#kinds.set(kind, checkKind(kind, preset)); return this; }
    getKind(kind) { const preset = this.#kinds.get(kind); if (!preset) throw new Error(`Unknown kind: ${kind} (one of ${[...this.#kinds.keys()].join(', ')})`); return preset; }
    listKinds() { return [...this.#kinds.keys()]; }
    fetchEntity(entity_id) { return this.#entities.get(entity_id) ?? null; }
    /**
     * Live entities, in registration order: all of them, one `kind`, or those carrying `tag`. Each reads
     * its own list, kept as entities come and go, so it costs what it returns and not the world's count.
     */
    getEntities({ kind, tag, active } = {}, results = []) {
        results.length = 0;
        if (kind !== undefined && tag !== undefined) { for (const entity of this.#byKind.get(kind)?.values() ?? []) if (entity.tags.includes(tag) && (active === undefined || entity.active === active)) results.push(entity); return results; }
        this.#push(kind !== undefined ? this.#byKind.get(kind) : tag !== undefined ? this.#byTag.get(tag) : this.#entities, active, results);
        return results;
    }
    #push(list, active, results) {
        if (list) for (const entity of list.values()) if (active === undefined || entity.active === active) results.push(entity);
    }
    getEntityForBody(body) { return this.fetchEntity(this.world._record(body).id); }
    peruseNearbyEntities(reference, options = {}, results = []) { return this.world.peruseNearbyEntities(reference, { ...options, spatial_entities: true }, results); }
    getStatistics() { return { entities: this.#entities.size, kinds: this.#kinds.size }; }
    _construct(entity, packet) {
        const { components: parts, look, lights, scale: own_scale, mass_scales, ...definition } = this.#resolve(packet), kind = definition.kind ?? 'entity', preset = this.getKind(kind);
        const restored = this.#restore;
        let auto_span = false;
        // A record's look is its starting `look` property, as its components are its `components`.
        if (look !== undefined && definition.data?.look === undefined) definition.data = { ...(definition.data ?? {}), look };
        // Its `lights` (lamps, signs, searchlights in its own frame, placed and turned with it) are its data's lights.
        if (lights !== undefined) { if (!Array.isArray(lights) || !lights.every(l => l && typeof l === 'object' && !Array.isArray(l))) throw new TypeError('An object\'s lights are a list of light records'); definition.data = { ...(definition.data ?? {}), lights: clone(lights) }; }
        if (parts !== undefined) {
            const components = readComponents(parts); definition.data = { ...(definition.data ?? {}), components };
            // The body reaches as high as its solid layers, unless the packet says otherwise.
            if (definition.height_span === undefined) { definition.height_span = solidSpan(components); auto_span = true; }
        }
        const motor = definition.motor === undefined ? preset.motor : definition.motor, awareness = definition.awareness ?? preset.awareness;
        if (motor !== null && !MOTORS.includes(motor)) throw new TypeError(`A motor is ${MOTORS.join(', ')} or null`);
        // The rest size: the body as the record makes it. The body itself is that times the scale.
        const body = { ...clone(preset.body), ...definition }, scale = readScale(own_scale ?? 1), rule = mass_scales ?? false;
        massFactor(scale, rule);
        const rest = restored?.rest ?? { collision_shape: body.collision_shape ?? { shape_type: 'circle', radius: 1 }, render_shape: body.render_shape ?? null, light_shape: body.light_shape ?? null, mass: body.mass ?? 1, height_span: body.height_span ?? null };
        Object.assign(body, sizedBody(rest, scale, rule));
        // Plain construction and save restoration use the same base, but normal callers cannot adopt a pre-existing body.
        const components = restored ? this.world._restoreEntityComponents(restored.entity_id, { motor, awareness }) : this.world._createEntityComponents({ ...body, motor, awareness });
        const bodyState = components.body.getState();
        if (restored) auto_span = restored.auto_span ?? false;
        const record = { elements: this, body: components.body, motor: components.motor, awareness: components.awareness ?? null,
            kind, motor_name: motor, aware: awareness, template_id: definition.template ?? null, name: bodyState.name, tags: freeze(bodyState.tags),
            assets: freeze(clone(definition.assets ?? {})), data: clone(definition.data ?? {}), registered: false, destroyed: false, subscriptions: new Set(), auto_span,
            scale: restored?.scale ?? scale, mass_scales: restored?.mass_scales ?? rule, rest: clone(rest), world_scale: restored?.world_scale ?? scale };
        this.#construction?.entities.push(entity);
        this.world._mutate(() => {
            if (record.destroyed) return;
            if (this.#entities.has(record.body.body_id)) throw new Error('Duplicate entity identity');
            record.registered = true; this.#entities.set(record.body.body_id, entity);
            this.#index(this.#byKind, kind, record.body.body_id, entity); for (const tag of record.tags) this.#index(this.#byTag, tag, record.body.body_id, entity);
            this.world._emit('entityRegistered',{entity,body:record.body});
        });

        return record;
    }
    /** Its solid layers' span, each component on a rig joint standing at the joint's posed height. */
    #posedSpan(r) { const heights = this.world.rigs._jointHeights(r.body), span = solidSpan(r.data.components ?? [], heights ?? undefined); return span && span.map(v => Math.round(v * 1e6) / 1e6); }   // a bone's sine leaves dust
    /** After its rig moves: an entity whose span comes from its components follows its pose (a crouch is shorter). */
    _rigPosed(entity) {
        const r = entityRecord(entity); if (!r.auto_span || !(r.data.components ?? []).some(c => c.joint)) return;
        const next = scaleSpan(this.#posedSpan(r), r.world_scale[2]), now = r.body.getState().height_span;
        if (!next !== !now || next && (Math.abs(next[0] - now[0]) > SPAN_STEP || Math.abs(next[1] - now[1]) > SPAN_STEP)) this.world.updateBody(r.body, { height_span: next });
    }
    /**
     * Fits an entity's body to its world scale (its own times `parent_scale`): the rest shapes, mass
     * and height span, scaled. Its attached children follow, their offsets stretched by the change.
     */
    _refit(entity, parent_scale = null) {
        const r = entityRecord(entity), parent = parent_scale ?? (entity.parent ? entityRecord(entity.parent).world_scale : [1, 1, 1]);
        const previous = r.world_scale, next = multiplyScale(r.scale, parent);
        const span = r.auto_span ? this.#posedSpan(r) : r.rest.height_span;
        r.world_scale = next;
        this.world.updateBody(r.body, sizedBody({ ...r.rest, height_span: span }, next, r.mass_scales));
        if (previous.some((v, i) => v !== next[i])) this.world.rigs._rescale(r.body);   // physical chains are rebuilt at the new size
        for (const child of entity.children) {
            const mount = this.world.getAttachmentState(child.body);
            if (mount) this.world.setAttachmentPose(child.body, { local_position: [mount.local_position[0] * next[0] / previous[0], mount.local_position[1] * next[1] / previous[1]] });
            this._refit(child, next);
        }
        if (previous.some((v, i) => v !== next[i])) this.world._emit('entityScaled', { body: r.body, entity, scale: [...next], previous: [...previous] });
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
        for (const drop of [...r.subscriptions]) drop();this.world._emit('entityRemoved',{entity,body:r.body}); this.#entities.delete(body_id); this.#byKind.get(r.kind)?.delete(body_id); for (const tag of r.tags) this.#byTag.get(tag)?.delete(body_id);
    }
    _bodyUpdated(body_id, config) {
        const entity = this.#entities.get(body_id); if (!entity) return;
        const r = entityRecord(entity); r.name = config.name;
        if (r.registered) for (const tag of r.tags) this.#byTag.get(tag)?.delete(body_id);
        r.tags = freeze(clone(config.tags)); if (r.registered) for (const tag of r.tags) this.#index(this.#byTag, tag, body_id, entity);
    }
    _clear() { for (const id of [...this.#entities.keys()]) this._bodyRemoved(id); }
    _snapshotEntity(entity, result = {}) {
        const r = entityRecord(entity);
        return Object.assign(result, { entity_id: entity.entity_id, kind: r.kind, motor: r.motor_name, awareness: r.aware, template: r.template_id, name: r.name,
            tags: clone(r.tags), assets: clone(r.assets), data: clone(r.data), registered: r.registered, destroyed: r.destroyed,
            scale: [...r.scale], world_scale: [...r.world_scale], mass_scales: r.mass_scales, rest: clone(r.rest), auto_span: r.auto_span,
            body: r.destroyed ? null : r.body.getState() });
    }
    _saveState() { return this.getEntities().map(entity => { const { body, registered, destroyed, ...state } = this._snapshotEntity(entity); return state; }); }
    _restoreState(entries = []) {
        const seen = new Set();
        for (const state of entries) {
            if (!Number.isSafeInteger(state.entity_id) || seen.has(state.entity_id)) throw new TypeError('Invalid saved entity identity');
            seen.add(state.entity_id); this.#restore = state;
            try {
                this.getKind(state.kind);
                restoreEntity(this, { kind: state.kind, template: state.template ?? undefined, name: state.name, tags: state.tags, assets: state.assets, data: state.data, ...(state.motor !== undefined ? { motor: state.motor } : {}), ...(state.awareness !== undefined ? { awareness: state.awareness } : {}) });
            } finally { this.#restore = null; }
        }
    }
    _copyKindsTo(elements) { for (const [kind, preset] of this.#kinds) if (!Object.hasOwn(KINDS, kind)) elements.defineKind(kind, preset); }
    #index(map, key, id, entity) { let list = map.get(key); if (!list) map.set(key, list = new Map()); list.set(id, entity); }
}

/** The body fields a rest size gives at a world scale. */
function sizedBody(rest, scale, rule) {
    const flat = [scale[0], scale[1]];
    return { collision_shape: scaleShape(rest.collision_shape, flat), render_shape: rest.render_shape ? scaleShape(rest.render_shape, flat) : null,
        light_shape: rest.light_shape ? scaleShape(rest.light_shape, flat) : null, mass: rest.mass * massFactor(scale, rule), height_span: scaleSpan(rest.height_span, scale[2]) };
}
