/**
 * Deterministic foundation checks using only Node built-ins. A fake scheduler lets
 * tests supply exact timestamps and count outstanding callbacks. A minimal GPU recorder
 * verifies callback order and output commands; real Chromium is tested separately for pixels,
 * input, offline loading, and browser behavior. These mocks do not measure GPU work.
 */
const assert = require('node:assert/strict');
// Read actual source files rather than reproducing engine implementation in tests.
const { readFileSync } = require('node:fs');
// Construct portable paths relative to this runner.
const { join } = require('node:path');
// Run the engine's classic scripts in their own JavaScript global scope.
const vm = require('node:vm');

/** Build an event target that records listeners and can dispatch deterministic events. */
function eventTarget() {
    // Keep listeners grouped by event names, preserving function identity.
    const listeners = new Map();
    // Return an interface matching the browser methods the engine actually needs.
    return {
        // Expose listener accounting so destruction can be checked.
        listeners,
        /** Add one function for this event name, without duplicating identical functions. */
        addEventListener(name, callback) {
            // Allocate a Set only when this event has not been seen before.
            if (!listeners.has(name)) {
                // Store functions separately for each event name.
                listeners.set(name, new Set());
            }
            // Retain this callback for later dispatch or removal.
            listeners.get(name).add(callback);
        },
        /** Remove the exact callback reference, tolerating an absent event name. */
        removeEventListener(name, callback) {
            // Optional chaining skips deletion if no listener Set exists.
            listeners.get(name)?.delete(callback);
        },
        /** Deliver an event synchronously to every current listener for its type. */
        dispatch(name, event = {}) {
            // Visit each callback value in this event's listener Set and stop when exhausted.
            // “of” reads functions, not collection property names.
            for (const callback of listeners.get(name) || []) {
                // Supply a browser-like event type along with caller-provided details.
                callback({ type: name, ...event });
            }
        }
    };
}

/** Create fresh source-loaded classes, browser fakes, and a manually advanced clock. */
function environment(configuration = {}) {
    // Record GPU output operations for assertions about clearing and execution order.
    const drawingCalls = [];
    // Emulate only GPU output clearing used by empty-world scheduler tests.
    const graphics = {};
    // Visit GPU method-name values once; “of” supplies names and stops after the list.
    for (const methodName of ['bindFramebuffer', 'viewport', 'disable', 'depthMask', 'clearColor', 'clear']) {
        /** Record output commands; real browser tests independently verify GPU pixels. */
        graphics[methodName] = (...argumentsList) => drawingCalls.push([methodName, ...argumentsList]);
    }
    // Combine an event target with a controllable canvas rectangle.
    const canvas = Object.assign(eventTarget(), {
        // Start with a normal desktop-sized CSS canvas.
        bounds: { left: 10, top: 20, width: 800, height: 500 },
        /** Permit only WebGL2 on the displayed surface; fail if production requests Canvas 2D. */
        getContext(kind) {
            // The actual output contract permits exactly the GPU context type.
            assert.equal(kind, 'webgl2');
            // Return the minimal recorder rather than pretending to rasterize GPU geometry.
            return graphics;
        },
        /** Return current CSS bounds, which tests can replace before resize. */
        getBoundingClientRect() { return this.bounds; },
        /** Accept capture requests without needing an operating-system pointer. */
        setPointerCapture() {}
    });
    // Keep a Map of outstanding callbacks so duplicate scheduling can be detected.
    const pendingCallbacks = new Map();
    // Generate valid IDs starting at zero, verifying the engine does not treat zero as absent.
    let nextRequestId = 0;
    // A manually controlled monotonic timestamp is expressed in milliseconds.
    let currentMilliseconds = 0;
    // Supply the exact scheduler contract used by the Lobby.
    const scheduler = {
        /** Store a callback and return its cancellable ID. */
        request(callback) {
            // Take the next unused numeric ID, including zero on the first request.
            const requestId = nextRequestId;
            // Advance the counter for the next request.
            nextRequestId += 1;
            // Keep the callback until fire or cancellation consumes it.
            pendingCallbacks.set(requestId, callback);
            // Return the ID whose lifecycle the engine must track.
            return requestId;
        },
        /** Cancel exactly the requested callback. */
        cancel(requestId) { pendingCallbacks.delete(requestId); },
        /** Return the current deterministic time for synchronous profiling. */
        now() { return currentMilliseconds; }
    };
    // Create independent page event sources for visibility and window resize/key events.
    const browserWindow = Object.assign(eventTarget(), { devicePixelRatio: 3 });
    // The fake page begins visible.
    const browserDocument = Object.assign(eventTarget(), { hidden: false });
    // Provide a separate classic-script context, mirroring the browser build's class scope.
    const context = vm.createContext({ console });
    // Load dependencies before classes that instantiate them.
    // “of” reads each filename value and stops after all foundational source files.
    for (const sourceName of ['basement', 'spatial', 'world-geometry', 'physics', 'scene', 'world-shaders', 'world-mesh', 'point-light-renderer', 'world-renderer', 'artwork', 'renderer', 'input', 'profiler', 'directory', 'penthouse', 'lobby', 'engine']) {
        // Read the current implementation, including changes made since the prior run.
        const sourceCode = readFileSync(join(__dirname, '../src/engine', `${sourceName}.js`), 'utf8');
        // Execute that file as a separate script, preserving real load-order constraints.
        vm.runInContext(sourceCode, context, { filename: `${sourceName}.js` });
    }
    // Retrieve class references from their lexical global bindings.
    const classes = vm.runInContext('({Etrnl9Engine, LevelBasement, SpatialHashIndex, WorldGeometry, ContactGeometry})', context);
    // Create a complete but stopped engine, injecting the deterministic browser and scheduler.
    const engine = new classes.Etrnl9Engine(canvas, configuration, browserWindow, browserDocument, scheduler);
    // Return references needed to drive behavior and inspect its effects.
    return {
        // Expose the source-loaded engine instance.
        engine,
        // Expose the source-loaded classes for independent validation checks.
        classes,
        // Expose resizing and pointer event inputs.
        canvas,
        // Expose page keyboard and resize inputs.
        browserWindow,
        // Expose page visibility input.
        browserDocument,
        // Expose GPU operation accounting.
        drawingCalls,
        // Expose outstanding callback accounting.
        pendingCallbacks,
        /** Deliver the one pending callback at an exact absolute timestamp. */
        fire(timestampMilliseconds) {
            // A healthy running loop should always have exactly one outstanding callback.
            assert.equal(pendingCallbacks.size, 1);
            // Read the first [ID, callback] pair using array destructuring.
            const [requestId, callback] = pendingCallbacks.entries().next().value;
            // Consume this request before calling the engine, just as a browser does.
            pendingCallbacks.delete(requestId);
            // Advance the profiling clock to the supplied timestamp.
            currentMilliseconds = timestampMilliseconds;
            // Run the actual Lobby callback synchronously.
            callback(timestampMilliseconds);
        }
    };
}

// Count complete scenarios so the final report states what actually ran.
let passedScenarios = 0;

/** Run one isolated behavior check and stop the process on its first assertion failure. */
function test(name, callback) {
    // Each scenario constructs and cleans up its own engine environment.
    callback();
    // Record a scenario only after its callback returns successfully.
    passedScenarios += 1;
    // Print its concrete behavior for readable local and CI evidence.
    console.log(`PASS ${name}`);
}

/** Verify construction, duplicate-safe start, cancellable ID zero, and restart baseline. */
test('inert construction, one scheduler, stop and restart', () => {
    // Create a fresh engine with no installed features.
    const fixture = environment();
    // Construction must not schedule hidden work.
    assert.equal(fixture.pendingCallbacks.size, 0);
    // Start once and then repeat to check idempotency.
    fixture.engine.start();
    // Starting an active engine must leave only one request.
    fixture.engine.start();
    // The first ID is zero and must still be treated as an outstanding request.
    assert.equal(fixture.pendingCallbacks.has(0), true);
    // Stop must cancel that zero-ID request too.
    fixture.engine.stop();
    // No background callback should remain after stop.
    assert.equal(fixture.pendingCallbacks.size, 0);
    // Restart the same instance without rebuilding its levels.
    fixture.engine.start();
    // A large first timestamp must establish a baseline rather than fast-forward.
    fixture.fire(50000);
    // No simulation time has passed relative to that fresh baseline.
    assert.equal(fixture.engine.lobby.simulationSeconds, 0);
    // Release the fixture's listeners and callback.
    fixture.engine.destroy();
});

/** Verify exactly one simulation second at several display refresh rates. */
test('fixed simulation at 30, 60, 120 and 144 display Hz', () => {
    // Visit refresh-rate values once each; “of” reads values and stops after four rates.
    for (const refreshHz of [30, 60, 120, 144]) {
        // Create a separate engine so accumulator state cannot leak between rates.
        const fixture = environment();
        // Begin the one scheduler.
        fixture.engine.start();
        // Establish an exact zero-time baseline.
        fixture.fire(0);
        // Start frameIndex at one, include the final one-second frame, and advance by one.
        // A counted loop lets us compute exact timestamps without accumulating interval error.
        for (let frameIndex = 1; frameIndex <= refreshHz; frameIndex += 1) {
            // Deliver a display callback at this fraction of a second.
            fixture.fire(frameIndex * 1000 / refreshHz);
        }
        // Every refresh rate must execute sixty fixed updates over one elapsed second.
        assert.equal(fixture.engine.directory.tools.get('profiler').simulationSteps, 60);
        // Allow only floating-point accumulation error in simulated seconds.
        assert.ok(Math.abs(fixture.engine.lobby.simulationSeconds - 1) < 1e-9);
        // Release this rate's instance before testing the next one.
        fixture.engine.destroy();
    }
});

/** Verify independent pause ownership, continued rendering, and hidden-page recovery. */
test('pause owners, visibility, and no hidden-time catch-up', () => {
    // Create an isolated engine and profiler reference.
    const fixture = environment();
    // Read the actual measurement tool.
    const profiler = fixture.engine.directory.tools.get('profiler');
    // Start simulation and establish a baseline.
    fixture.engine.start();
    // The baseline renders without advancing simulation.
    fixture.fire(0);
    // Acquire one pause owner.
    fixture.engine.lobby.setPaused('menu', true);
    // Acquire an independent owner.
    fixture.engine.lobby.setPaused('dialogue', true);
    // Releasing the menu must not release the dialogue's pause.
    fixture.engine.lobby.setPaused('menu', false);
    // Supply two paused callbacks to prove frames continue.
    fixture.fire(100);
    // A second callback establishes a positive paused interval.
    fixture.fire(200);
    // Simulation must remain frozen while any pause reason remains.
    assert.equal(profiler.simulationSteps, 0);
    // The initial frame plus two paused frames were actually rendered.
    assert.equal(profiler.frameCount, 3);
    // Release the remaining owner.
    fixture.engine.lobby.setPaused('dialogue', false);
    // Set the fake document hidden before dispatching its event.
    fixture.browserDocument.hidden = true;
    // Deliver the same lifecycle event a browser would send.
    fixture.browserDocument.dispatch('visibilitychange');
    // The pending animation callback must be canceled while hidden.
    assert.equal(fixture.pendingCallbacks.size, 0);
    // Restore visibility after an arbitrarily long wall-clock interval.
    fixture.browserDocument.hidden = false;
    // Visibility restoration requests only one new frame.
    fixture.browserDocument.dispatch('visibilitychange');
    // The first restored frame establishes a fresh baseline.
    fixture.fire(60000);
    // No hidden duration may be simulated.
    assert.equal(profiler.simulationSteps, 0);
    // One normal interval after restoration resumes fixed updates.
    fixture.fire(60000 + 1000 / 60);
    // Exactly one simulation step must now have completed.
    assert.equal(profiler.simulationSteps, 1);
    // Release the fixture.
    fixture.engine.destroy();
});

/** Verify a long frame cannot produce unbounded catch-up work. */
test('stall work limit and discarded-time accounting', () => {
    // Create an isolated engine with the default five-step catch-up cap.
    const fixture = environment();
    // Begin and establish the baseline.
    fixture.engine.start();
    // The initial callback has zero elapsed time.
    fixture.fire(0);
    // Simulate a two-second stall without sleeping in the test runner.
    fixture.fire(2000);
    // Read the resulting measurements.
    const profiler = fixture.engine.directory.tools.get('profiler');
    // Catch-up must not exceed the configured five updates in one callback.
    assert.equal(profiler.simulationSteps, 5);
    // Most of the two seconds must be reported as deliberately discarded time.
    assert.ok(profiler.droppedSeconds > 1.9);
    // A full timestep of backlog must not remain for an endless catch-up spiral.
    assert.ok(fixture.engine.lobby.accumulatedSeconds < 1 / 60);
    // Raw elapsed time gives one FPS here, rather than a simulation-clamped estimate.
    assert.equal(profiler.framesPerSecond, 1);
    // Release the fixture.
    fixture.engine.destroy();
});

/** Verify screen callback order, camera conversion, density limits, and output clearing. */
test('WebGL output, callback order, camera, and resize', () => {
    // Create an empty engine whose displayed canvas rejects Canvas 2D requests.
    const fixture = environment();
    // Resolve actual output ownership from the Directory.
    const renderer = fixture.engine.directory.systems.get('renderer');
    // Device density three is capped at two: 800 CSS pixels become 1600 output pixels.
    assert.equal(fixture.canvas.width, 1600);
    // Put the camera at a known horizontal world coordinate.
    renderer.camera.positionX = 100;
    // Set its vertical projected-world center independently.
    renderer.camera.positionY = 200;
    // Double world scale while CSS input positions retain their own units.
    renderer.camera.zoom = 2;
    // The CSS viewport center must reconstruct the horizontal camera coordinate.
    assert.equal(renderer.screenToWorld(400, 250).positionX, 100);
    // The same center must reconstruct the vertical camera coordinate.
    assert.equal(renderer.screenToWorld(400, 250).positionY, 200);
    // Record callback order independently from GPU command recording.
    const passOrder = [];
    /** Record the later screen callback when production invokes it. */
    renderer.registerPass('later', 10, 'screen', () => passOrder.push('later'));
    /** Record the earlier callback despite its later registration. */
    renderer.registerPass('earlier', 0, 'screen', () => passOrder.push('earlier'));
    // Run production output with no mocked world geometry or shading.
    renderer.render({ interpolationFraction: 0 });
    // Sorting must determine callback execution order.
    assert.deepEqual(passOrder, ['earlier', 'later']);
    // Empty worlds must clear output through the GPU, without a Canvas composition stage.
    assert.equal(fixture.drawingCalls.filter((call) => call[0] === 'clear').length, 1);
    // There is no final Canvas drawing context exposed by this renderer.
    assert.equal(renderer.drawingContext, undefined);
    // Update the CSS host size through the same data the real resize listener reads.
    fixture.canvas.bounds.width = 320;
    // Deliver the production resize event, preserving ordinary engine lifecycle behavior.
    fixture.browserWindow.dispatch('resize');
    // Backing pixels must match the new width and capped density.
    assert.equal(fixture.canvas.width, 640);
    // Remove every registered listener and pending callback.
    fixture.engine.destroy();
});

/** Verify live object references, extension cleanup, and keyboard/pointer lifecycle. */
test('Directory references, Penthouse lifecycle, input, and destruction', () => {
    // Create a fresh connected engine with no scheduled work.
    const fixture = environment();
    // The Directory must point to the same engine instance, not an earlier snapshot.
    assert.equal(fixture.engine.directory.parentEngine, fixture.engine);
    // Resolve the input implementation for observation.
    const input = fixture.engine.directory.systems.get('input');
    // Simulate a physical key press outside any form controls.
    fixture.browserWindow.dispatch('keydown', { code: 'KeyW' });
    // The exact physical key code must be held.
    assert.equal(input.heldKeys.has('KeyW'), true);
    // Losing focus must clear the held key even without receiving keyup.
    fixture.browserWindow.dispatch('blur');
    // A missing release event must not leave movement stuck.
    assert.equal(input.heldKeys.size, 0);
    // Deliver a primary press with known page coordinates and canvas offsets.
    fixture.canvas.dispatch('pointerdown', { clientX: 60, clientY: 80, pointerId: 1, isPrimary: true });
    // Canvas starts ten CSS pixels from the page's left edge.
    assert.equal(input.pointer.positionX, 50);
    // Canvas starts twenty CSS pixels below the page's top edge.
    assert.equal(input.pointer.positionY, 60);
    // The press begins a held gesture.
    assert.equal(input.pointer.held, true);
    // Track extension lifecycle calls without adding test-specific engine methods.
    const lifecycle = [];
    // Install a feature using the same contract later procedural toys will use.
    fixture.engine.penthouse.install('probe', {
        /** Observe the fully assembled owner during the connection phase. */
        initialize(directory) { lifecycle.push(directory.parentEngine === fixture.engine ? 'connected' : 'broken'); },
        /** Record one actual fixed update. */
        update() { lifecycle.push('updated'); },
        /** Record resource cleanup when the feature is uninstalled. */
        dispose() { lifecycle.push('disposed'); }
    });
    // Duplicate IDs must fail rather than silently leaking an installed feature.
    assert.throws(() => fixture.engine.penthouse.install('probe', {}), /already contains/);
    // Drive one fixed update through the real Lobby.
    fixture.engine.start();
    // Establish the time baseline.
    fixture.fire(0);
    // Advance exactly one simulation step.
    fixture.fire(1000 / 60);
    // Explicitly remove the optional feature before destroying the engine.
    fixture.engine.penthouse.uninstall('probe');
    // Connection must precede updates, and cleanup must run once.
    assert.deepEqual(lifecycle, ['connected', 'updated', 'disposed']);
    // Destroy all remaining callbacks and listeners.
    fixture.engine.destroy();
    // Repeated destruction must be harmless.
    fixture.engine.destroy();
    // A redundant public stop must also tolerate already disposed services.
    fixture.engine.stop();
    // A destroyed engine cannot be restarted with missing systems.
    assert.throws(() => fixture.engine.start(), /destroyed/);
    // No future animation callback may remain.
    assert.equal(fixture.pendingCallbacks.size, 0);
    // Check every event target that the engine subscribed to.
    // “of” reads target objects and stops after window, document, and canvas.
    for (const target of [fixture.browserWindow, fixture.browserDocument, fixture.canvas]) {
        // Visit listener Sets by value; each one must be empty after destruction.
        for (const callbacks of target.listeners.values()) {
            // Exact function references must have been successfully unsubscribed.
            assert.equal(callbacks.size, 0);
        }
    }
});

/** Verify invalid settings fail early and render failures stop rather than multiply loops. */
test('validation and failure cleanup', () => {
    // Load fresh classes and engine state.
    const fixture = environment();
    // Reject string-valued simulation rates instead of allowing implicit coercion.
    assert.throws(() => new fixture.classes.LevelBasement({ simulationHz: '60' }), /positive number/);
    // A negative simulation rate cannot describe a timestep.
    assert.throws(() => new fixture.classes.LevelBasement({ simulationHz: -1 }), /positive number/);
    // Resolve the real renderer for an injected failure.
    const renderer = fixture.engine.directory.systems.get('renderer');
    /** Fail inside a pass to check the actual renderer/Lobby error boundary. */
    renderer.registerPass('broken', 0, 'screen', () => { throw new Error('intentional failure'); });
    // Begin the loop so a real scheduled callback exercises the failure.
    fixture.engine.start();
    // The original failure must remain visible to the caller.
    assert.throws(() => fixture.fire(0), /intentional failure/);
    // The Lobby must stop instead of repeatedly invoking a broken frame.
    assert.equal(fixture.engine.lobby.running, false);
    // No callback may remain scheduled after failure.
    assert.equal(fixture.pendingCallbacks.size, 0);
    // Release remaining listeners after the failed run.
    fixture.engine.destroy();
});

// Report the number of completed behavior scenarios rather than an invented coverage percentage.
console.log(`${passedScenarios} foundation scenarios passed.`);

// Reuse the real source-loaded fixture in world tests instead of copying engine behavior.
module.exports = { environment };
