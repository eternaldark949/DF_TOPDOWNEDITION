/**
 * Exercise spatial, shared-height, and generic physics behavior against actual source.
 * The existing seven lifecycle/renderer scenarios run first through the reused fixture.
 * These tests add no gameplay-specific pair handlers and need no browser packages.
 */
const assert = require('node:assert/strict');
// Reuse the source-loading fixture; requiring it also executes the existing baseline checks.
const { environment } = require('./test-foundation.cjs');
// Count only additional world scenarios in this report.
let completedScenarios = 0;

/** Run one scenario, failing immediately if its assertions or actual engine code throw. */
function test(name, callback) {
    // Each callback owns its fixture lifecycle.
    callback();
    // Count only a completely successful scenario.
    completedScenarios += 1;
    // Print concrete behavior as readable CI evidence.
    console.log(`PASS ${name}`);
}

/** Build an engine fixture and return direct service addresses for concise test setup. */
function world(configuration = {}) {
    // Zero gravity isolates horizontal tests unless a scenario explicitly enables it.
    const fixture = environment({ gravityZ: 0, ...configuration });
    // Expose the same actual services a feature uses through the Directory.
    return {
        // Preserve fixture classes, input targets, and teardown access.
        ...fixture,
        // Scene owns shared declarations and spatial membership.
        scene: fixture.engine.directory.systems.get('scene'),
        // Physics owns contacts and integration.
        physics: fixture.engine.directory.systems.get('physics')
    };
}

/** Verify index queries against brute force with negative coordinates and multi-cell bounds. */
test('spatial query equivalence, overflow, movement, removal, and safe coordinates', () => {
    // Obtain the actual Basement implementation without reproducing it in the test.
    const fixture = world();
    // Use small cells and a low overflow threshold to exercise both index paths.
    const index = new fixture.classes.SpatialHashIndex(16, 25);
    // Keep independent source bounds for the brute-force oracle.
    const entries = [];
    // Use a fixed seed so failures are reproducible across machines.
    let randomState = 123456;
    /** Generate a repeatable value from zero up to, but excluding, one. */
    function random() {
        // This integer recurrence intentionally wraps to unsigned 32-bit state.
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        // Normalize the unsigned integer range.
        return randomState / 4294967296;
    }
    // Create 400 entries, counting upward from zero and excluding 400.
    for (let entryIndex = 0; entryIndex < 400; entryIndex += 1) {
        // Spread initial bounds across negative and positive world coordinates.
        const minimumX = random() * 1000 - 500;
        // Choose an independent ground-depth coordinate.
        const minimumY = random() * 1000 - 500;
        // Deliberately vary sizes so some entries span many cells.
        const bounds = { minimumX, minimumY, maximumX: minimumX + random() * 150, maximumY: minimumY + random() * 150 };
        // Keep ID and independent bounds together in the oracle collection.
        const entry = { identifier: `entry-${entryIndex}`, bounds };
        // Register the actual object under its stable ID.
        index.upsert(entry.identifier, entry, bounds);
        // Retain the expected entry for full-list comparisons.
        entries.push(entry);
    }
    // Compare 100 reproducible random queries, increasing queryIndex once per query.
    for (let queryIndex = 0; queryIndex < 100; queryIndex += 1) {
        // Choose a rectangular query whose origin can fall outside the populated region.
        const minimumX = random() * 1400 - 700;
        // Choose an independent vertical origin for the query.
        const minimumY = random() * 1400 - 700;
        // Give every query the same measurable 90-unit reach in each axis.
        const query = { minimumX, minimumY, maximumX: minimumX + 90, maximumY: minimumY + 90 };
        // Brute force uses only source bounds, not index internals.
        const expected = entries.filter((entry) => entry.bounds.maximumX >= query.minimumX && entry.bounds.minimumX <= query.maximumX && entry.bounds.maximumY >= query.minimumY && entry.bounds.minimumY <= query.maximumY).map((entry) => entry.identifier).sort();
        // Convert the VM-created result to a local array before comparing prototypes.
        const actual = Array.from(index.query(query), (entry) => entry.identifier).sort();
        // Indexing must produce exactly the same unique candidates as the full scan.
        assert.deepEqual(actual, expected);
    }
    // A giant object must remain queryable without filling millions of cells.
    index.upsert('huge', 'huge', { minimumX: -100000, minimumY: -100000, maximumX: 100000, maximumY: 100000 });
    // The overflow path stores that object once.
    assert.ok(index.overflow.size > 0);
    // A tiny query still discovers the huge overlapping object.
    assert.ok(index.query({ minimumX: 0, minimumY: 0, maximumX: 1, maximumY: 1 }).includes('huge'));
    // Updating an entry must remove its obsolete memberships.
    index.upsert('huge', 'huge', { minimumX: 200000, minimumY: 200000, maximumX: 200001, maximumY: 200001 });
    // Its former location must no longer return the moved value.
    assert.equal(index.query({ minimumX: 0, minimumY: 0, maximumX: 1, maximumY: 1 }).includes('huge'), false);
    // Removing the ID must release the new location too.
    index.remove('huge');
    // Unsafe integer grid addresses must fail before attempting a non-advancing loop.
    assert.throws(() => index.upsert('unsafe', {}, { minimumX: 1e30, minimumY: 0, maximumX: 1e30, maximumY: 1 }), /safe grid/);
    // Clear must release both normal and oversized entries.
    index.clear();
    // No occupied cells may remain after a scene unload.
    assert.equal(index.cells.size, 0);
    // No overflow references may remain either.
    assert.equal(index.overflow.size, 0);
    // Release the fixture's ordinary engine resources.
    fixture.engine.destroy();
});

/** Verify automatic membership updates follow the same transform/geometry used by rendering. */
test('shared transform, geometry replacement, height bounds, and removal', () => {
    // Start with independent empty registries.
    const fixture = world();
    // Declare one ordinary static box through the public scene API.
    const element = fixture.scene.createElement('solid', { width: 20, depth: 40, height: 30 });
    // Creation automatically exposes its body and standard Directory element address.
    assert.equal(fixture.physics.bodies.get('solid'), element.body);
    // Direct X assignment must maintain spatial membership without manual invalidation.
    element.transform.positionX = 1000;
    // The old location must no longer include this body.
    assert.equal(fixture.scene.staticBodies.query({ minimumX: -20, minimumY: -20, maximumX: 20, maximumY: 20 }).length, 0);
    // The new location must contain it.
    assert.equal(fixture.scene.staticBodies.query({ minimumX: 990, minimumY: -20, maximumX: 1010, maximumY: 20 })[0], element.body);
    // Changing Z updates projected bounds even though ground footprint is unchanged.
    element.transform.positionZ = 50;
    // The top projection includes bottom elevation plus physical height.
    assert.equal(element.projectedBounds.minimumY, -20 - 80 * 0.75);
    // Replacing geometry automatically changes broad-phase footprint bounds.
    element.setGeometry({ shape: 'circle', radius: 5, height: 10 });
    // Physical width is now a circle diameter rather than the old box width.
    assert.equal(element.bounds.maximumX - element.bounds.minimumX, 10);
    // Appearance changes must invalidate cached geometry without requiring movement.
    const revisionBeforeVisibility = fixture.scene.revision;
    // Hide this surface; physical solidity remains an independent declaration.
    element.visible = false;
    // Rendering must observe the change on its next ordinary frame.
    assert.ok(fixture.scene.revision > revisionBeforeVisibility);
    // Attach a source using local coordinates, rather than a copied absolute position.
    const light = fixture.scene.createLight('attached-source', { parent: element, positionX: 10, positionY: 0, positionZ: 5, radius: 20 });
    // Parent movement must update source coordinates and influence membership automatically.
    element.transform.setPosition(2000, 100, 80);
    // Parent rotation turns the local positive X offset into world positive Y.
    element.transform.angle = Math.PI / 2;
    // The source follows the owner's current X coordinate.
    assert.ok(Math.abs(light.positionX - 2000) < 1e-8);
    // The rotated source offset is applied to the owner's current Y coordinate.
    assert.ok(Math.abs(light.positionY - 110) < 1e-8);
    // Shared physical Z also follows without an explicit reference-refresh method.
    assert.equal(light.positionZ, 85);
    // Hiding a surface must not remove its physical body.
    assert.equal(fixture.physics.bodies.has('solid'), true);
    // Scene removal must clear all references consistently.
    fixture.scene.removeElement('solid');
    // Moving a retained stale reference must not resurrect the unloaded object.
    element.transform.positionX = -100;
    // The removed body must remain absent.
    assert.equal(fixture.physics.bodies.size, 0);
    // Contact history must not keep unloaded body references alive while simulation is stopped.
    assert.equal(fixture.physics.previousContacts.size, 0);
    // Shadow membership must be removed too.
    assert.equal(fixture.scene.shadowGeometry.entries.size, 0);
    // Removing the owner must remove actual source declarations too.
    assert.equal(fixture.scene.lights.entries.size, 0);
    // No orphan influence registration may survive the owner's removal.
    assert.equal(fixture.scene.lightReach.entries.size, 0);
    // Removing the last world element must remove the engine-owned world pass.
    assert.equal(fixture.engine.directory.systems.get('worldRenderer').active, false);
    // Release the fixture.
    fixture.engine.destroy();
});

/** Reject low-level world drawing that would bypass shared depth and recreate glow-overlay bugs. */
test('world rendering contracts reject unstructured Canvas world overlays', () => {
    // Begin with an empty source-loaded engine whose output is already WebGL2.
    const fixture = world();
    // Resolve the actual output renderer through its normal Directory address.
    const renderer = fixture.engine.directory.systems.get('renderer');
    // An empty scene must reject world Canvas callbacks before any feature is installed.
    assert.throws(() => renderer.registerPass('legacy', 0, 'world', () => {}), /scene elements/);
    // Ordinary scene registration activates the same central physical rendering rules.
    fixture.scene.createElement('ordinary', {});
    // A populated scene must reject the same bypass rather than relying on feature identity.
    assert.throws(() => renderer.registerPass('incorrect-overlay', 999, 'world', () => {}), /scene elements/);
    // Unloading a scene must not reopen an incompatible legacy rendering path.
    fixture.scene.clear();
    // The requirement is an output foundation, not a condition of current scene population.
    assert.throws(() => renderer.registerPass('after-unload', 0, 'world', () => {}), /scene elements/);
    // Release ordinary scene/Directory resources after the contract check.
    fixture.engine.destroy();
});

/** Verify newly registered circles collide with rotated boxes without identity-specific code. */
test('generic circle/box, box/box, and circle/circle resolution', () => {
    // Visit supported shape-pair definitions by value and stop after three combinations.
    for (const shapes of [['circle', 'box'], ['box', 'box'], ['circle', 'circle']]) {
        // Isolate each shape pair in its own scene.
        const fixture = world();
        // Place the first dynamic body partly inside the second body's footprint.
        const first = fixture.scene.createElement('first', { shape: shapes[0], width: 24, depth: 24, radius: 12, height: 100, positionX: -8, body: { motion: 'dynamic', friction: 0 } });
        // The static shape uses an arbitrary rotation to exercise oriented contact geometry.
        const second = fixture.scene.createElement('second', { shape: shapes[1], width: 32, depth: 30, radius: 16, height: 100, angle: 0.4 });
        // Record the first body's original coordinate for an actual response assertion.
        const originalX = first.transform.positionX;
        // Run the same shared solver for every declared shape pair.
        fixture.physics.update(1 / 60);
        // The dynamic body must have physically moved out of its original overlap.
        assert.notEqual(first.transform.positionX, originalX);
        // Exact resting touch may remain, but material penetration must be gone.
        const contact = fixture.classes.ContactGeometry.intersect(first.body, second.body);
        // Accept only floating-point correction tolerance, not visible overlap.
        assert.ok(!contact || contact.penetration < 1e-7);
        // The static body's actual transform must stay fixed.
        assert.equal(second.transform.positionX, 0);
        // Release this pair's instance before moving to the next combination.
        fixture.engine.destroy();
    }
});

/** Verify gravity and vertical collision let a body land on an elevated support. */
test('Z separation, elevated landing, and underpass collisions', () => {
    // Enable ordinary downward gravity only for this test.
    const fixture = world({ gravityZ: -240 });
    // A static slab occupies Z 50 through 60.
    const slab = fixture.scene.createElement('slab', { width: 120, depth: 120, positionZ: 50, height: 10 });
    // A body below that slab shares XY but has no overlapping vertical range.
    const below = fixture.scene.createElement('below', { shape: 'circle', radius: 10, height: 20, body: { motion: 'dynamic', gravityScale: 0 } });
    // Shared ground position alone must not produce a collision.
    assert.equal(fixture.classes.ContactGeometry.intersect(below.body, slab.body), null);
    // A second body starts above the support and falls under the same physical rules.
    const falling = fixture.scene.createElement('falling', { positionZ: 110, height: 20, width: 20, depth: 20, body: { motion: 'dynamic' } });
    // Advance 120 fixed steps, increasing the counter after each completed update.
    for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
        // A normal fixed timestep supplies both gravity and contact response.
        fixture.physics.update(1 / 60);
    }
    // The falling body's bottom must settle on the slab's top, not pass through it.
    assert.ok(Math.abs(falling.transform.positionZ - 60) < 1e-6);
    // Its vertical closing speed must be canceled by the support contact.
    assert.ok(Math.abs(falling.body.velocityZ) < 1e-6);
    // The body underneath remains unaffected by an object on the elevated slab.
    assert.equal(below.transform.positionZ, 0);
    // Release the scene.
    fixture.engine.destroy();
});

/** Verify ordinary moving bodies exchange momentum according to mass. */
test('mass response, restitution, and kinematic pushing', () => {
    // Use zero gravity to isolate a head-on contact.
    const fixture = world();
    // A lightweight circle moves into a heavier stationary circle.
    const first = fixture.scene.createElement('light', { shape: 'circle', radius: 10, height: 30, positionX: -21, body: { motion: 'dynamic', velocityX: 120, mass: 1, restitution: 1, friction: 0 } });
    // Both restitution values are one, yielding an elastic one-dimensional response.
    const second = fixture.scene.createElement('heavy', { shape: 'circle', radius: 10, height: 30, body: { motion: 'dynamic', mass: 3, restitution: 1, friction: 0 } });
    // Integrate enough movement for the circles to contact.
    fixture.physics.update(1 / 60);
    // Standard elastic masses 1 and 3 produce velocities -60 and +60.
    assert.ok(Math.abs(first.body.velocityX + 60) < 1e-6);
    // The heavier object still receives momentum through the same generic solver.
    assert.ok(Math.abs(second.body.velocityX - 60) < 1e-6);
    // Clear ordinary bodies before checking a caller-driven immovable body.
    fixture.scene.clear();
    // The kinematic block advances independently of impulses.
    const pusher = fixture.scene.createElement('pusher', { width: 20, depth: 20, height: 30, positionX: -19, body: { motion: 'kinematic', velocityX: 60 } });
    // A dynamic object yields without a custom pusher/character contact handler.
    const pushed = fixture.scene.createElement('pushed', { width: 20, depth: 20, height: 30, body: { motion: 'dynamic' } });
    // Run one normal shared physics step.
    fixture.physics.update(1 / 60);
    // Kinematic velocity remains controlled by its declaration.
    assert.equal(pusher.body.velocityX, 60);
    // The dynamic body receives the pusher's normal speed.
    assert.ok(pushed.body.velocityX > 0);
    // Release the fixture.
    fixture.engine.destroy();
});

/** Verify contact notifications are independent from solid response and filtering. */
test('sensor lifecycle, explicit filters, and default all-category contacts', () => {
    // Construct a fresh scene with no gravity.
    const fixture = world();
    // A static sensor reports overlap but must not physically move another body.
    fixture.scene.createElement('sensor', { width: 100, depth: 100, height: 30, body: { sensor: true, category: 8 } });
    // A newly introduced category requires no modification of engine defaults.
    const moving = fixture.scene.createElement('new-kind', { width: 20, depth: 20, height: 20, body: { motion: 'dynamic', category: 16 } });
    // Capture actual lifecycle event types.
    const events = [];
    /** Record only event lifecycle so physical object identities remain irrelevant. */
    const unsubscribe = fixture.physics.subscribe((event) => events.push(event.type));
    // First overlap begins contact.
    fixture.physics.update(1 / 60);
    // Continuing overlap produces a stay notification.
    fixture.physics.update(1 / 60);
    // Sensor overlap must not push the body out of the volume.
    assert.equal(moving.transform.positionX, 0);
    // Move outside the sensor through the automatically indexed transform setter.
    moving.transform.positionX = 200;
    // The next normal update ends contact.
    fixture.physics.update(1 / 60);
    // Lifecycle must reflect actual entry, continued overlap, and exit.
    assert.deepEqual(events, ['begin', 'stay', 'end']);
    // Disable all interactions through an explicit mask rather than missing handlers.
    moving.body.collisionMask = 0;
    // Return inside the sensor after setting the intentional exclusion.
    moving.transform.positionX = 0;
    // Filtering must suppress both physical response and contact delivery.
    fixture.physics.update(1 / 60);
    // No new event should have been generated.
    assert.equal(events.length, 3);
    // Release this listener independently from engine disposal.
    unsubscribe();
    // Release the fixture.
    fixture.engine.destroy();
});

/** Ensure removal callbacks cannot resurrect an object through its retained transform. */
test('contact-end removal is atomic across registry and spatial ownership', () => {
    // Use ordinary zero-gravity bodies so this scenario isolates lifecycle behavior.
    const fixture = world();
    // Create a passive static sensor to establish one continuing contact.
    fixture.scene.createElement('sensor', { width: 100, depth: 100, height: 30, body: { sensor: true } });
    // The dynamic body will be removed after contact is established.
    const element = fixture.scene.createElement('removed', { body: { motion: 'dynamic' } });
    // Run a normal step to populate real contact history.
    fixture.physics.update(1 / 60);
    /** Simulate an observer retaining and editing an element after it is removed. */
    fixture.physics.subscribe((event) => {
        // Only the lifecycle end should exercise the stale-reference path.
        if (event.type === 'end') {
            // This must not re-register the removed body through its transform notification.
            element.transform.positionX = 1000;
        }
    });
    // Removing the body must make every scene registry consistent before notifying observers.
    fixture.scene.removeElement('removed');
    // No retained callback should resurrect a body registration.
    assert.equal(fixture.physics.bodies.has('removed'), false);
    // No moving spatial entry may survive the same removal.
    assert.equal(fixture.scene.movingBodies.entries.has('removed'), false);
    // End-contact delivery must also release the retained contact history.
    assert.equal(fixture.physics.previousContacts.size, 0);
    // Release remaining sensor and system resources.
    fixture.engine.destroy();
});

/** Verify safety subdivisions catch fast contacts and excessive work fails explicitly. */
test('fast body versus thin wall and explicit excessive-speed rejection', () => {
    // Use a new scene so no previous contact influences the fast impact.
    const fixture = world();
    // A wall only two world units thick must still stop an ordinary fast body.
    fixture.scene.createElement('wall', { width: 2, depth: 100, height: 100 });
    // Start far enough left that a full unsplit step would cross the wall completely.
    const fast = fixture.scene.createElement('fast', { shape: 'circle', radius: 5, height: 10, positionX: -50, body: { motion: 'dynamic', velocityX: 6000 } });
    // One fixed step should subdivide and resolve the actual contact.
    fixture.physics.update(1 / 60);
    // The body must remain on the wall's left side.
    assert.ok(fast.transform.positionX <= -6 + 1e-6);
    // A perfectly inelastic wall cancels its closing X velocity.
    assert.ok(Math.abs(fast.body.velocityX) < 1e-6);
    // Actual substep work must be visible in diagnostics.
    assert.ok(fixture.physics.statistics.substeps > 1);
    // An absurd speed exceeds the deliberately bounded safety budget.
    fast.body.velocityX = 1e9;
    // Reject instead of silently claiming collision correctness under an impossible work budget.
    assert.throws(() => fixture.physics.update(1 / 60), /safety budget/);
    // Release the fixture.
    fixture.engine.destroy();
});

/** Verify a large static registry does not imply a full registry scan for local contacts. */
test('ten thousand static bodies, local candidates, automatic unload', () => {
    // Start with an empty scene and independent spatial statistics.
    const fixture = world();
    // Populate a sparse 100-by-100 scene using one loop over stable object indices.
    for (let objectIndex = 0; objectIndex < 10000; objectIndex += 1) {
        // Convert the linear index into a regular grid of distant static bodies.
        const positionX = (objectIndex % 100) * 100;
        // Integer division selects each row's ground-depth position.
        const positionY = Math.floor(objectIndex / 100) * 100;
        // Every ordinary solid registers through the same public scene declaration.
        fixture.scene.createElement(`static-${objectIndex}`, { width: 16, depth: 16, height: 30, positionX, positionY });
    }
    // Introduce one moving body near only the first local static object.
    fixture.scene.createElement('moving', { width: 12, depth: 12, height: 20, positionX: 8, body: { motion: 'dynamic' } });
    // Actual registry size must match all declarations, including the new moving body.
    assert.equal(fixture.physics.bodies.size, 10001);
    // Advance one shared step and inspect measured narrow-phase work.
    fixture.physics.update(1 / 60);
    // The solver should examine local contacts, not all ten thousand static bodies.
    assert.ok(fixture.physics.statistics.narrowChecks < 20);
    // Only moving integration references should enter the active-body scan.
    assert.equal(fixture.physics.movingBodies.size, 1);
    // A zoomed-out viewport spans more than the per-object membership budget.
    fixture.scene.visibleGeometry.query({ minimumX: -1000, minimumY: -500, maximumX: 1000, maximumY: 500 });
    // Query traversal has its own budget and must not scan ten thousand remote entries here.
    assert.equal(fixture.scene.visibleGeometry.statistics.usedFullScan, false);
    // Exact visible candidates should remain a small fraction of the whole scene.
    assert.ok(fixture.scene.visibleGeometry.statistics.examinedEntries < 200);
    // Clear the complete scene through the ordinary unload API.
    fixture.scene.clear();
    // No static index entry may survive unload.
    assert.equal(fixture.scene.staticBodies.entries.size, 0);
    // No projected geometry entry may survive either.
    assert.equal(fixture.scene.visibleGeometry.entries.size, 0);
    // No bodies may remain in physics after scene teardown.
    assert.equal(fixture.physics.bodies.size, 0);
    // Stopped-scene unload must not retain old body references through contact history.
    assert.equal(fixture.physics.previousContacts.size, 0);
    // Temporary spatial query buffers must release removed neighboring bodies too.
    assert.equal(fixture.physics.staticQueryOutput.length, 0);
    // The independently reused moving buffer must also be empty after unload.
    assert.equal(fixture.physics.movingQueryOutput.length, 0);
    // Release remaining reusable services.
    fixture.engine.destroy();
});

/** Verify explicit artwork surfaces use tracked world bounds and reject unsupported physical fallback. */
test('explicit textured surfaces retain actual XYZ bounds and immutable image material data', () => {
    // Create a real source-loaded scene without needing mocked shader or image behavior.
    const fixture = world();
    // Define one vertical triangle in local physical coordinates with normalized image U/V.
    const vertices = [[-10,0,0,0,1],[10,0,0,1,1],[10,0,30,1,0]];
    // An arbitrary triangle surface must not silently acquire a box collision approximation.
    assert.throws(() => fixture.scene.createElement('unsupported-body',{shape:'surface',vertices}),/body:false/);
    // Install that same surface as an explicit visual face at a real elevation.
    const surface = fixture.scene.createElement('art-surface',{shape:'surface',vertices,positionZ:20,normal:[0,1,0],body:false,material:{artwork:'original-art',unlit:true}});
    // Geometry height must come from actual triangle corners, not image pixels or a second visual Z.
    assert.equal(surface.geometry.height,30);
    // Physical ground bounds include the actual triangle's leftmost local position.
    assert.equal(surface.bounds.minimumX,-10);
    // Source artwork addresses remain explicit material data.
    assert.equal(surface.material.artwork,'original-art');
    // External mutation of the original corner arrays must not alter the retained geometry.
    vertices[0][0]=-999;
    // The normalized immutable geometry owns its own coordinate copies.
    assert.equal(surface.geometry.vertices[0][0],-10);
    // A tracked transform edit updates the same visual/ground index membership automatically.
    surface.transform.positionX=100;
    // Actual triangle bounds move with that shared transform.
    assert.equal(surface.bounds.minimumX,90);
    // A high source can illuminate a radial-view surface near its physical ground footprint.
    const highLight = fixture.scene.createLight('high-source',{positionX:100,positionY:0,positionZ:300,radius:20});
    // Height-aware light indexing must preserve that physical reach alongside oblique projected bounds.
    assert.ok(fixture.scene.lightReach.query({minimumX:90,minimumY:-10,maximumX:110,maximumY:10}).includes(highLight));
    // Invalid material coverage must fail at declaration instead of corrupting GPU sampling later.
    assert.throws(()=>fixture.classes.WorldGeometry.material({alphaCutoff:2}),/alpha cutoff/);
    // Clean up all surface/index registrations and Directory listeners.
    fixture.engine.destroy();
});

// Report additional world checks separately from the earlier seven baseline scenarios.
console.log(`${completedScenarios} world scenarios passed.`);
