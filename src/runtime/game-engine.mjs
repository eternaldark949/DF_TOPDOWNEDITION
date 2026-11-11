import { physicsSystem, assetLibrary } from '../basement/physics/index.mjs';
import { levelLobby } from '../lobby/level-lobby.mjs';
import { gameLevel } from './game-level.mjs';
import { controlSystem } from '../basement/controls/index.mjs';
import { cameraSystem, renderSystem } from '../basement/rendering/index.mjs';

const hooks = ['attach', 'detach', 'beforePhysics', 'afterPhysics', 'render', 'levelEntered', 'levelLeaving','gameplayPaused'];
function synchronous(fn, receiver, args) {
    if (fn && ['AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction'].includes(fn.constructor.name)) throw new TypeError('Runtime hooks must be synchronous; load assets in level.prepare');
    const result = fn?.apply(receiver, args);
    if (result && typeof result.then === 'function') {
        // Reject the contract while observing a returned rejection; do not leak an
        // unhandled asynchronous error after the caller's synchronous cleanup.
        Promise.resolve(result).catch(() => {});
        throw new TypeError('Runtime hooks must be synchronous; load assets in level.prepare');
    }
    return result;
}
function attempt(errors, fn) { try { fn(); } catch (error) { errors.push(error); } }
function failures(errors, message) { if (errors.length) throw new AggregateError(errors, message); }

/** Application coordinator. Basement supplies all physical behavior; the Lobby supplies time. */
export class gameEngine {
    #world; #authority = Symbol('runtime simulation clock'); #api; #lobby; #controls; #camera; #render;
    #levels = new Map(); #systems = new Map(); #active = null; #persistent = new Set();
    #running = false; #destroyed = false; #phase = 'idle'; #loading = false; #pauses = new Map();
    #schedule; #cancel; #frame = null; #generation = 0;

    constructor({ asset_library = new assetLibrary(), physics = {}, controls = {}, camera = {}, clock = {}, frame_clock,
        schedule_frame = typeof requestAnimationFrame === 'function' ? callback => requestAnimationFrame(callback) : null,
        cancel_frame = typeof cancelAnimationFrame === 'function' ? handle => cancelAnimationFrame(handle) : null,
        render_target, services = {} } = {}) {
        if (!services || typeof services !== 'object' || Array.isArray(services) || Object.keys(services).some(key => ['rigs','physics','elements','assets','motion','traffic','controls','camera','render','__proto__','constructor','prototype'].includes(key))) throw new TypeError('Game services must not replace runtime APIs');
        if(render_target!==undefined)throw new TypeError('Mount a renderer surface through api.render.setRenderer; render hooks receive a frame');
        if (Object.hasOwn(physics, 'step_authority') || Object.hasOwn(physics, 'asset_library')) throw new TypeError('The runtime owns physics authority and its asset library');
        if (schedule_frame !== null && typeof schedule_frame !== 'function' || cancel_frame !== null && typeof cancel_frame !== 'function') throw new TypeError('Frame scheduling requires functions');
        this.#world = new physicsSystem({ ...physics, asset_library, step_authority: this.#authority });
        this.#world.rigs._setGuard(()=>{if(this.#phase==='render')throw new Error('Render hooks cannot change animation');});
        const config = { STEP_MS: this.#world.config.fixed_step * 1000, MAX_FRAME_MS: 100, MAX_STEPS: 6, GAME_SPEED: 1, ...clock };
        if (config.STEP_MS !== this.#world.config.fixed_step * 1000) throw new TypeError('Lobby and physics fixed steps must match');
        if (![config.MAX_FRAME_MS, config.MAX_STEPS, config.GAME_SPEED].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(config.MAX_STEPS)) throw new TypeError('Invalid Lobby clock configuration');
        if(controls.auto_update)throw new TypeError('The runtime owns control polling');
        this.#camera = new cameraSystem(camera);
        this.#controls = new controlSystem({ ...controls, auto_update:false });
        this.#render = new renderSystem({physics_system:this.#world,camera:this.#camera});
        this.#api = Object.freeze({ ...services, physics: this.#world, elements: this.#world.elements, assets: asset_library,
            rigs:this.#world.rigs, motion: this.#world.motion, traffic: this.#world.traffic, controls:this.#controls, camera:this.#camera, render:this.#render });
        this.#schedule = schedule_frame; this.#cancel = cancel_frame;
        this.#lobby = new levelLobby(Object.freeze(config), frame_clock);
        this.#lobby.plugIn({ isRunning: () => this.running, isPaused: () => this.paused || !this.active_level,
            beginFrame: () => { if(this.paused || !this.active_level)this.#pollControls(); },
            simulateStep: () => this.updateState(), renderFrame: blend => this.render(blend),
            scheduleNextFrame: () => this.#queueFrame() });
    }
    get api() { return this.#api; }
    get physics_system() { return this.#world; }
    get lobby() { return this.#lobby; }
    get active_level() { return this.#active?.level ?? null; }
    get running() { return this.#running; }
    get loading() { return this.#loading; }
    get paused() { return this.#pauses.size > 0; }
    get pause_reasons() { return [...this.#pauses.values()]; }
    get phase() { return this.#phase; }
    get destroyed() { return this.#destroyed; }
    listLevels() { return [...this.#levels.keys()]; }
    listSystems() { return [...this.#systems.keys()]; }
    #live() { if (this.#destroyed) throw new Error('Runtime is disposed'); }
    #idle() { this.#live(); if (this.#phase !== 'idle') throw new Error(`Operation requires a runtime boundary; current phase: ${this.#phase}`); }
    #context(cleanups) {
        let live = true;
        cleanups.push(() => { live = false; });
        const requireLive = () => { this.#live(); if (!live) throw new Error('Lifecycle context has been retired'); };
        return Object.freeze({ engine: this, api: this.api,
            createEntity: (packet, options) => { requireLive(); return this.createEntity(packet, options); },
            on: (event, handler) => {
                requireLive();
                const unsubscribe = this.#world.on(event, handler); cleanups.push(unsubscribe); return unsubscribe;
            },
            defer: cleanup => { requireLive(); if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function'); cleanups.push(cleanup); }
        });
    }
    #clean(cleanups, errors) { for (const cleanup of cleanups.splice(0).reverse()) attempt(errors, cleanup); }
    #callSystems(hook, ...args) {
        for (const entry of this.#systems.values()) synchronous(entry.system[hook], entry.system, [entry.context, ...args]);
    }
    registerLevel(level_id, Level) {
        this.#idle();
        if (typeof level_id !== 'string' || !level_id.trim() || typeof Level !== 'function' || !(Level.prototype instanceof gameLevel) && Level !== gameLevel) throw new TypeError('Register a level_id and gameLevel class');
        if (this.#levels.has(level_id)) throw new Error(`Level already registered: ${level_id}`);
        this.#levels.set(level_id, Level); return this;
    }
    registerSystem(system_id, system) {
        this.#idle();
        if (typeof system_id !== 'string' || !system_id.trim() || !system || typeof system !== 'object') throw new TypeError('Register a system_id and system instance');
        if (this.#systems.has(system_id)) throw new Error(`System already registered: ${system_id}`);
        for (const name of hooks) if (system[name] !== undefined && typeof system[name] !== 'function') throw new TypeError(`Invalid system hook: ${name}`);
        const cleanups = [], entry = { system, cleanups, context: this.#context(cleanups) };
        this.#phase = 'registration';
        try {
            synchronous(system.attach, system, [entry.context]);
            if (this.active_level) synchronous(system.levelEntered, system, [entry.context, this.active_level]);
            this.#systems.set(system_id, entry);
        } catch (error) {
            const errors = [error]; attempt(errors, () => synchronous(system.detach, system, [entry.context])); this.#clean(cleanups, errors);
            failures(errors, `Failed to attach system: ${system_id}`);
        } finally { this.#phase = 'idle'; }
        return this;
    }
    removeSystem(system_id) {
        this.#idle(); const entry = this.#systems.get(system_id); if (!entry) return false;
        this.#phase = 'registration'; const errors = []; this.#systems.delete(system_id);
        try {
            if (this.active_level) attempt(errors, () => synchronous(entry.system.levelLeaving, entry.system, [entry.context, this.active_level]));
            attempt(errors, () => synchronous(entry.system.detach, entry.system, [entry.context])); this.#clean(entry.cleanups, errors);
            failures(errors, `Failed to remove system: ${system_id}`);
        } finally { this.#phase = 'idle'; }
        return true;
    }
    createEntity(packet = {}, { lifetime = 'level' } = {}) {
        this.#live();
        if (this.#phase === 'render') throw new Error('Render hooks cannot create entities');
        if (!['level', 'session'].includes(lifetime)) throw new TypeError('lifetime must be level or session');
        if (lifetime === 'level' && !this.active_level) throw new Error('Level entities require an active level; use session lifetime for persistent actors');
        const entity = this.#world.createEntity(packet);
        if (lifetime === 'session') this.#persistent.add(entity);
        return entity;
    }
    retainEntity(entity) {
        this.#live();
        if(!['idle','registration','input','beforePhysics','afterPhysics','transition'].includes(this.#phase))throw new Error('Retain entities at a runtime or registration boundary');
        if (!entity || this.api.elements.fetchEntity(entity.entity_id) !== entity) throw new Error('Retain an official entity belonging to this runtime');
        this.#persistent.add(entity); return entity;
    }
    releaseEntity(entity) {
        this.#live();
        if(!['idle','registration','input','beforePhysics','afterPhysics','transition'].includes(this.#phase))throw new Error('Release entities at a runtime or registration boundary');
        return this.#persistent.delete(entity);
    }
    async loadLevel(level_id, options = {}) {
        this.#live();
        if (!['idle', 'input', 'beforePhysics', 'physics', 'afterPhysics'].includes(this.#phase)) throw new Error('Level loading is not allowed during rendering or lifecycle hooks');
        if (this.#loading) throw new Error('A level load is already in progress');
        const Level = this.#levels.get(level_id); if (!Level) throw new Error(`Unknown level: ${level_id}`);
        this.#loading = true; let candidate, prepared, entered = false;
        try {
            candidate = new Level({ level_id });
            if (candidate.level_id !== level_id) throw new Error('Level identity does not match registration');
            prepared = await candidate.prepare(Object.freeze({ assets: this.api.assets }), options);
            this.#idle(); this.#phase = 'transition';
            this.#controls.clear();
            this.#world.commitCommands();
            this.#unload();
            const cleanups = [], context = this.#context(cleanups);
            this.#active = { level: candidate, context, cleanups, prepared }; entered = true;
            synchronous(candidate.enter, candidate, [context, prepared]);
            this.#world.commitCommands();
            this.#callSystems('levelEntered', candidate);
            return candidate;
        } catch (error) {
            const errors = [error];
            if (entered) attempt(errors, () => this.#unload());
            else if (candidate) attempt(errors, () => synchronous(candidate.disposePrepared, candidate, [prepared]));
            failures(errors, `Failed to load level: ${level_id}`);
        } finally { if (this.#phase === 'transition') this.#phase = 'idle'; this.#loading = false; }
    }
    #unload() {
        const active = this.#active; if (!active) return;
        const errors = [];
        for (const entry of [...this.#systems.values()].reverse()) attempt(errors, () => synchronous(entry.system.levelLeaving, entry.system, [entry.context, active.level]));
        attempt(errors, () => synchronous(active.level.leave, active.level, [active.context]));
        this.#clean(active.cleanups, errors);
        // The official registry is the source of truth, including entities spawned by raw
        // native factories. This is lifecycle filtering, not another entity/spatial registry.
        for (const entity of this.api.elements.getEntities()) if (!this.#persistent.has(entity)) attempt(errors, () => entity.destroy());
        for (const entity of this.#persistent) if (entity.destroyed) this.#persistent.delete(entity);
        this.#active = null;
        attempt(errors, () => this.#world.commitCommands());
        attempt(errors, () => synchronous(active.level.disposePrepared, active.level, [active.prepared]));
        failures(errors, 'Failed to unload level');
    }
    unloadLevel() {
        this.#idle(); if (this.#loading) throw new Error('A level load is in progress');
        this.#phase = 'transition'; try { this.#unload(); } finally { this.#phase = 'idle'; }
    }
    pause(reason = 'manual') {
        this.#live(); if (typeof reason !== 'string' || !reason) throw new TypeError('Pause requires a reason');
        const token = Symbol(reason); this.#pauses.set(token, reason);
        try { this.#controls.clear();this.#callSystems('gameplayPaused'); } catch(error) { this.#pauses.delete(token); throw error; }
        return () => { const released=this.#pauses.delete(token);if(released&&!this.paused)this.#controls.clear();return released; };
    }
    updateState() {
        this.#idle(); if (!this.running) return false;
        this.#pollControls();
        if (this.paused || !this.#active) return false;
        const { level, context } = this.#active, seconds = this.#world.config.fixed_step;
        try {
            this.#phase = 'beforePhysics';
            this.#callSystems('beforePhysics', seconds); synchronous(level.beforePhysics, level, [context, seconds]);
            this.#phase = 'physics'; this.#world.updateState(seconds, this.#authority);
            this.#phase = 'afterPhysics';
            synchronous(level.afterPhysics, level, [context, seconds]); this.#callSystems('afterPhysics', seconds);this.#world.commitCommands();
            this.#camera.updateState(seconds);
            return true;
        } catch (error) { this.stop(); throw error; }
        finally { this.#controls.generateGhostImage();this.#phase = 'idle'; }
    }
    #pollControls() {
        this.#phase='input';
        try { this.#controls.updateState(); }
        catch(error){this.stop();throw error;}
        finally{this.#phase='idle';}
    }
    render(blend = 1) {
        this.#idle(); if (!Number.isFinite(blend) || blend < 0 || blend > 1) throw new TypeError('Render blend must be between 0 and 1');
        if (!this.#active) return false;
        const { level, context } = this.#active;
        try {
            this.#phase = 'render'; const alpha = this.paused ? 1 : blend;
            const frame=this.#render.beginFrame(alpha);
            synchronous(level.render, level, [context, alpha, frame]); this.#callSystems('render', alpha, frame);
            this.#render.endFrame();
            return true;
        } catch (error) { this.#render.abortFrame();this.stop(); throw error; }
        finally { this.#phase = 'idle'; }
    }
    #queueFrame() {
        if (!this.#schedule || !this.running || this.#frame !== null) return;
        const generation = this.#generation;
        this.#frame = this.#schedule(() => { if (generation !== this.#generation) return; this.#frame = null; if (this.running) this.#lobby.runEngine(); });
    }
    start() {
        this.#idle(); if (this.running) return false;
        this.#running = true; this.#lobby.last_frame_time = undefined; this.#lobby.accumulator = 0; this.#lobby.next_draw_due = undefined;
        this.#queueFrame(); return true;
    }
    stop() {
        this.#running = false; this.#generation++;
        try { this.#controls.clear(); }
        finally { try { if (this.#frame !== null && this.#cancel) this.#cancel(this.#frame); } finally { this.#frame = null; } }
    }
    dispose() {
        this.#idle(); const errors = []; attempt(errors,()=>this.stop());this.#phase = 'disposal';
        try {
            attempt(errors, () => this.#unload());
            for (const entry of [...this.#systems.values()].reverse()) {
                attempt(errors, () => synchronous(entry.system.detach, entry.system, [entry.context])); this.#clean(entry.cleanups, errors);
            }
            this.#systems.clear(); this.#persistent.clear(); this.#pauses.clear();
            attempt(errors, () => this.#controls.dispose());
            attempt(errors, () => this.#render.dispose());
            attempt(errors, () => this.#camera.stopFollowing());
            attempt(errors, () => this.#world.clearWorld()); this.#levels.clear();
        } finally { this.#destroyed = true; this.#phase = 'disposed'; }
        failures(errors, 'Runtime disposal failed');
    }
}
