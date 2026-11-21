// ===== ENGINE =====
// The game engine: every level plugged in through one jack each. `engine.basement` (systems and operations),
// `engine.lobby` (the game loop), `engine.directory` (the data), `engine.penthouse` (prefabs) and
// `engine.game` (the services a game plugs in). Lifecycle contexts carry the same jacks.
import { physicsSystem } from './basement/physics/index.mjs';
import { controlSystem } from './basement/controls/index.mjs';
import { cameraSystem, renderSystem, canvasRenderer, recordingRenderer, webglRenderer } from './basement/rendering/index.mjs';
import { gameLoop } from './lobby/game-loop.mjs';
import { UNITS_PER_METRE, metres, centimetres, toMetres, isLength, readLength, readLengths } from './basement/units/index.mjs';
import { assetLibrary, mergeDefinition, identifier, nonnegative, jsonCopy, STRUCTURES, validatePropCatalog, validateMapLayout, checkLook, validateSkeleton, validateClipSet, validateLocomotion, validateDoorKind, validateDrawing, validateMaterial, validateTexture, validateMap, mapDefinition, validateLibrary, doorKindsOf, ENGINE_LIBRARIES, createEngineRegistry, resolvePlacement, resolveLayout, resolvePropLook, isMovable } from './directory/index.mjs';
import { humanoid, objectPacket, createObject } from './penthouse/index.mjs';

/** What each jack carries besides the running systems: the Directory's functions and the Penthouse's prefabs. */
const DIRECTORY = Object.freeze({ assetLibrary, mergeDefinition, identifier, nonnegative, jsonCopy, STRUCTURES, validatePropCatalog, validateMapLayout, checkLook, validateSkeleton, validateClipSet, validateLocomotion, validateDoorKind, validateDrawing, validateMaterial, validateTexture, validateMap, mapDefinition, validateLibrary, doorKindsOf, ENGINE_LIBRARIES, createEngineRegistry, resolvePlacement, resolveLayout, resolvePropLook, isMovable });
const UNITS = Object.freeze({ UNITS_PER_METRE, metres, centimetres, toMetres, isLength, readLength, readLengths });
const PENTHOUSE = Object.freeze({ humanoid, objectPacket, createObject });

/**
 * The game engine: builds the Basement's running systems and plugs every level in through its jack. The
 * Lobby's game loop runs them; the engine's own calls (`loadLevel`, `start`, `pause`, …) are the loop's.
 */
export class gameEngine {
    #authority = Symbol('runtime simulation clock'); #basement; #directory; #penthouse; #game; #loop;

    constructor({ asset_library, physics = {}, controls = {}, camera = {}, clock = {}, time = {}, frame_clock, schedule_frame, cancel_frame, render = {}, render_target, services = {} } = {}) {
        if (!services || typeof services !== 'object' || Array.isArray(services) || Object.keys(services).some(key => ['__proto__','constructor','prototype'].includes(key))) throw new TypeError('Game services are a plain object of named services');
        if (render_target !== undefined) throw new TypeError('Mount a renderer surface through basement.render.setRenderer; render hooks receive a frame');
        if (Object.hasOwn(physics, 'step_authority') || Object.hasOwn(physics, 'asset_library')) throw new TypeError('The runtime owns physics authority and its asset library');
        if (controls.auto_update) throw new TypeError('The runtime owns control polling');
        const world = new physicsSystem({ ...physics, asset_library, step_authority: this.#authority });
        const view = new cameraSystem(camera), input = new controlSystem({ ...controls, auto_update: false });
        const draw = new renderSystem({ physics_system: world, camera: view, create_surface: render.create_surface ?? null })
            .registerRenderer('canvas', canvasRenderer).registerRenderer('webgl', webglRenderer).registerRenderer('recording', recordingRenderer);
        // A click or tap becomes a hit through the camera and the render system's pick, and entities hear it.
        input.setPicker((client, options) => draw.pickAt(view.clientToWorld(client, draw.getSurfaceBounds()), options));
        input.on_fire.push((action, type, ev) => { const hit = ev.position ? ev.hit : null; if (hit) world._emit('pointerHit', { body: hit.body, entity: hit.entity, action, input_type: type, position: hit.position }); });
        input.onHover(({ hit, previous }) => {
            if (previous && !previous.destroyed) world._emit('pointerLeave', { body: previous.body, entity: previous });
            if (hit) world._emit('pointerEnter', { body: hit.body, entity: hit.entity, position: hit.position });
        });
        this.#basement = Object.freeze({ physics: world, elements: world.elements, rigs: world.rigs, motion: world.motion,
            traffic: world.traffic, controls: input, camera: view, render: draw, units: UNITS });
        this.#directory = Object.freeze({ ...DIRECTORY, assets: world.elements.asset_library });
        this.#penthouse = Object.freeze({ ...PENTHOUSE });
        this.#game = Object.freeze({ ...services });
        const authority = this.#authority;
        this.#loop = new gameLoop({ engine: this, jacks: { basement: this.#basement, directory: this.#directory, penthouse: this.#penthouse, game: this.#game },
            step_world: seconds => world.updateState(seconds, authority), clock, time, frame_clock,
            ...(schedule_frame !== undefined ? { schedule_frame } : {}), ...(cancel_frame !== undefined ? { cancel_frame } : {}) });
    }
    /** LV0: the running systems (physics, elements, rigs, motion, traffic, controls, camera, render) and the units. */
    get basement() { return this.#basement; }
    /** LV1: the game loop (its clock is `lobby.clock`). */
    get lobby() { return this.#loop; }
    /** The world's clock (`lobby.time`): the date and time of day, the day's phase and how dark it is. */
    get time() { return this.#loop.time; }
    /** LV2: the data layer's functions, plus `assets`, this runtime's registry. */
    get directory() { return this.#directory; }
    /** LV3: the prefabs. */
    get penthouse() { return this.#penthouse; }
    /** The services the game plugged in. */
    get game() { return this.#game; }
    get active_level() { return this.#loop.active_level; }
    get running() { return this.#loop.running; }
    get loading() { return this.#loop.loading; }
    get paused() { return this.#loop.paused; }
    get pause_reasons() { return this.#loop.pause_reasons; }
    get phase() { return this.#loop.phase; }
    get destroyed() { return this.#loop.destroyed; }
    registerLevel(...args) { const result = this.#loop.registerLevel(...args); return result === this.#loop ? this : result; }
    registerSystem(...args) { const result = this.#loop.registerSystem(...args); return result === this.#loop ? this : result; }
    removeSystem(...args) { const result = this.#loop.removeSystem(...args); return result === this.#loop ? this : result; }
    /** Makes any object from a catalog record (a template id or a record) at `at`; `lifetime` is level (default) or session. */
    createObject(record, at = [0, 0], overrides = {}, options) { return this.#loop.createEntity(objectPacket(this.#basement.elements.asset_library, record, at, overrides), options); }
    createEntity(...args) { const result = this.#loop.createEntity(...args); return result === this.#loop ? this : result; }
    retainEntity(...args) { const result = this.#loop.retainEntity(...args); return result === this.#loop ? this : result; }
    releaseEntity(...args) { const result = this.#loop.releaseEntity(...args); return result === this.#loop ? this : result; }
    loadLevel(...args) { const result = this.#loop.loadLevel(...args); return result === this.#loop ? this : result; }
    unloadLevel(...args) { const result = this.#loop.unloadLevel(...args); return result === this.#loop ? this : result; }
    pause(...args) { const result = this.#loop.pause(...args); return result === this.#loop ? this : result; }
    updateState(...args) { const result = this.#loop.updateState(...args); return result === this.#loop ? this : result; }
    render(...args) { const result = this.#loop.render(...args); return result === this.#loop ? this : result; }
    start(...args) { const result = this.#loop.start(...args); return result === this.#loop ? this : result; }
    stop(...args) { const result = this.#loop.stop(...args); return result === this.#loop ? this : result; }
    listLevels(...args) { const result = this.#loop.listLevels(...args); return result === this.#loop ? this : result; }
    listSystems(...args) { const result = this.#loop.listSystems(...args); return result === this.#loop ? this : result; }
    dispose() { return this.#loop.dispose(); }
}
