/**
 * NEUTRAL ENGINE STUDY — declare primitives, bodies, one elevated slab, emission, and
 * a point light. No feature-specific collision handlers or per-object draw layers exist.
 * Controls assign intended velocity; physics decides actual contact. The scene exercises
 * world rules only and contains no characters, quests, shops, or migrated game assets.
 */
class WorldStudy {
    /** Keep test-owned resources separate from engine implementation and scene lifecycle. */
    constructor() {
        // Retain owned IDs so uninstall removes this study without clearing other features.
        this.elementIdentifiers = [];
        // Contacts are observed for diagnostics, not used to repair physical response.
        this.contactBegins = 0;
        // No Directory or scene exists until the optional feature is initialized.
        this.directory = null;
        // Start HUD sampling immediately on the first rendered frame.
        this.nextHudUpdateSeconds = 0;
        // No remote stress population has been created for this fresh study.
        this.distantPopulationAdded = false;
        // Use one brush for the harness background only; world surfaces draw through the engine.
        this.backgroundBrush = new CanvasBrush('#0d0b18');
    }

    /** Create one owned element using only the public scene declaration API. */
    create(identifier, definition) {
        // Prefix test IDs so another optional feature can own a separate namespace.
        const fullIdentifier = `world-study.${identifier}`;
        // Register the scene element; indexes, bodies, and rendering are automatic.
        const element = this.scene.createElement(fullIdentifier, definition);
        // Remember the registration for later feature-specific cleanup.
        this.elementIdentifiers.push(fullIdentifier);
        // Return the actual element so controls can refer to its body or transform.
        return element;
    }

    /** Install primitives and test-only UI passes after Directory services are connected. */
    initialize(directory) {
        // Keep the actual service Directory for live input/statistics lookup.
        this.directory = directory;
        // Obtain the generic scene declaration interface.
        this.scene = directory.systems.get('scene');
        // The foundation renderer still composites world output and HTML diagnostics.
        const renderer = directory.systems.get('renderer');
        // Add a screen background beneath the engine-owned world pass.
        renderer.registerPass('world-study.background', 0, 'screen', this.drawBackground.bind(this));
        // Add a harness diagnostic callback without making the engine query any HTML IDs.
        renderer.registerPass('world-study.diagnostics', 100, 'screen', this.updateDiagnostics.bind(this));
        // A floor is a regular solid box whose top lies at Z zero.
        this.create('floor', {
            // Ground width along the world's X axis.
            width: 640,
            // Ground depth along the world's Y axis.
            depth: 360,
            // Put the bottom below zero so its top is the walking surface.
            positionZ: -10,
            // Ten units of thickness make this an ordinary volume, not a special floor type.
            height: 10,
            // Dark reflective material receives the point light normally.
            material: { color: '#383041' },
            // Frictionless support keeps the test block moving until a wall/body contact.
            body: { motion: 'static', friction: 0 }
        });
        // Visit left/right boundary centers by value; both share ordinary static body rules.
        for (const positionX of [-320, 320]) {
            // Declare a narrow upright wall at the current horizontal boundary.
            this.create(`side-${positionX}`, {
                // X coordinate selects this wall's side of the scene.
                positionX,
                // Wall thickness is physical geometry, not an arbitrary collision radius.
                width: 12,
                // Span the entire ground depth.
                depth: 360,
                // Rise above the moving primitives.
                height: 45,
                // Lavender stone-like color remains a plain opaque material.
                material: { color: '#78648f' },
                // Bounce is shared material response, not a wall-specific update method.
                body: { restitution: 1, friction: 0 }
            });
        }
        // Add rear/front boundaries through the same declaration path.
        for (const positionY of [-180, 180]) {
            // Only dimensions/position change; no collision layer needs adjustment.
            this.create(`edge-${positionY}`, {
                // Ground depth position for the current edge.
                positionY,
                // Span the complete ground width.
                width: 640,
                // Keep the boundary thin along its inward normal.
                depth: 12,
                // Low walls still stop bodies at the same elevation.
                height: 35,
                // Use the same opaque boundary material.
                material: { color: '#78648f' },
                // Reuse the ordinary restitution/friction response.
                body: { restitution: 1, friction: 0 }
            });
        }
        // This ground surface emits light visibly but is not itself a physical obstacle.
        this.create('emitting-ground', {
            // A plane declares actual surface geometry, not a screen overlay.
            shape: 'plane',
            // Position its center under and around the elevated slab.
            positionX: 100,
            // Put the patch beneath the slab in ground depth too.
            positionY: 65,
            // A small geometric separation places it above the floor's surface.
            positionZ: 0.03,
            // Let its visible extent extend past the slab so occlusion can be compared.
            width: 270,
            // This footprint determines exactly which ground pixels emit.
            depth: 145,
            // Planes are nonphysical by declaration.
            body: false,
            // Purple emission remains attached to this surface under the central depth test.
            material: { color: '#381444', emission: '#581469' }
        });
        // The elevated slab shares one Z interval between physics and GPU geometry.
        this.roof = this.create('elevated-slab', {
            // Ground position overlaps the emitting surface intentionally.
            positionX: 100,
            // Align with the emission patch's ground center.
            positionY: 65,
            // Bodies below this elevation can pass underneath.
            positionZ: 65,
            // A narrower surface leaves emission visible around its edges.
            width: 145,
            // Ground depth of the actual slab footprint.
            depth: 115,
            // The slab top is Z 77 and is a normal support surface.
            height: 12,
            // Opaque teal shows whether purple ground emission incorrectly paints over it.
            material: { color: '#3d8b80' },
            // Static support has no custom ground/roof collision handler.
            body: { friction: 0.4 }
        });
        // The controlled primitive is a normal dynamic circular body.
        this.player = this.create('controlled-circle', {
            // Circle footprint is handled analytically by physics.
            shape: 'circle',
            // Start clearly to the left of the moving box.
            positionX: -160,
            // Use the rear lane so bodies approach each other in the same height range.
            positionY: -85,
            // Physical circle radius in world units.
            radius: 13,
            // This volume stands on the floor; visuals use exactly the same height.
            height: 28,
            // Cream distinguishes the controlled object without assigning a gameplay class.
            material: { color: '#ffeed8' },
            // A small finite mass receives generic pushes from heavier bodies.
            body: { motion: 'dynamic', mass: 2, friction: 0 }
        });
        // A heavier moving box participates through the identical body registry.
        this.create('moving-box', {
            // Start to the right and move toward the controlled circle.
            positionX: 150,
            // Share the rear lane's ground-depth coordinate.
            positionY: -85,
            // Width sets the actual front/side collision extent.
            width: 75,
            // Depth sets the second physical footprint extent.
            depth: 44,
            // A taller box still uses generic overlapping Z intervals.
            height: 38,
            // Distinguish its opaque surface from the controlled circle.
            material: { color: '#cebbff' },
            // Mass, velocity, bounce, and friction describe behavior without type-pair code.
            body: { motion: 'dynamic', mass: 30, velocityX: -70, restitution: 1, friction: 0 }
        });
        // This ordinary body starts under the elevated slab with a disjoint Z interval.
        this.create('under-slab', {
            // Use a second primitive shape to demonstrate common collision rules.
            shape: 'circle',
            // Place it under the slab's left side.
            positionX: 65,
            // Share the slab's ground-depth position.
            positionY: 65,
            // A small radius makes it easy to distinguish from the object above.
            radius: 10,
            // Top Z 20 is below slab bottom Z 65.
            height: 20,
            // Warm orange makes its ground-level location visible when unobstructed.
            material: { color: '#f6961e' },
            // The generic solver moves it without inventing an “under bridge” exception.
            body: { motion: 'dynamic', velocityX: 24, friction: 0 }
        });
        // A body above the slab falls onto its top through normal gravity and contact.
        this.create('above-slab', {
            // Use a circle so visual segmentation and analytical circle collision are exercised.
            shape: 'circle',
            // Start near the slab center.
            positionX: 105,
            // Use the same ground-depth coordinate as the object below.
            positionY: 65,
            // Gravity will lower this bottom elevation until it meets the slab top.
            positionZ: 110,
            // A small footprint fits wholly on the support surface.
            radius: 12,
            // Its visible and physical height are both twenty units.
            height: 20,
            // Pink separates it visually from the orange object underneath.
            material: { color: '#f971ce' },
            // Dynamic mode enables shared gravity and support resolution.
            body: { motion: 'dynamic' }
        });
        // Direct illumination is a source declaration, independent of surface self-emission.
        this.scene.createLight('world-study.light', {
            // Place the source to the left of the elevated structure.
            positionX: -30,
            // Keep its ground position near the scene center.
            positionY: 0,
            // This source is below the slab top and cannot directly light its upward surface.
            positionZ: 48,
            // Finite physical reach determines both culling and attenuation.
            radius: 240,
            // Warm color reflects through each receiving surface's material.
            color: '#ffd29a',
            // Brightness is a source setting, not a special-case additive overlay alpha.
            intensity: 2.4
        });
        /** Count contact beginnings for observation only; no response is implemented here. */
        this.unsubscribe = directory.systems.get('physics').subscribe((event) => {
            // Resting/staying contacts should not inflate the first-contact count.
            if (event.type === 'begin') {
                // This counter has no effect on positions, velocity, or collision filtering.
                this.contactBegins += 1;
            }
        });
    }

    /** Assign test-control velocity before the engine's physics step; never repair collisions. */
    update(stepSeconds) {
        // Read current input from its own reusable system.
        const input = this.directory.systems.get('input');
        // Compute keyboard intent without making input depend on object identity.
        let directionX = Number(input.heldKeys.has('KeyD') || input.heldKeys.has('ArrowRight')) - Number(input.heldKeys.has('KeyA') || input.heldKeys.has('ArrowLeft'));
        // Positive Y means toward the bottom of the ground-plane view.
        let directionY = Number(input.heldKeys.has('KeyS') || input.heldKeys.has('ArrowDown')) - Number(input.heldKeys.has('KeyW') || input.heldKeys.has('ArrowUp'));
        // A held pointer supplies a ground-level destination, not a teleport through walls.
        if (input.pointer.held) {
            // Input coordinates are CSS pixels; renderer converts them to projected-world units.
            const target = this.directory.systems.get('renderer').screenToWorld(input.pointer.positionX, input.pointer.positionY);
            // Aim toward the clicked ground X coordinate.
            directionX = target.positionX - this.player.transform.positionX;
            // The controlled body's base is ground level, so projected Y gives a ground target.
            directionY = target.positionY - this.player.transform.positionY;
        }
        // Normalize diagonals/targets so movement speed has one consistent world-unit meaning.
        const length = Math.hypot(directionX, directionY);
        // Pointer destinations closer than one step should not be overshot by intended velocity.
        const speed = input.pointer.held ? Math.min(150, length / stepSeconds) : 150;
        // Assign horizontal intent; the common solver may subsequently stop or redirect it.
        this.player.body.velocityX = length > 0 ? directionX / length * speed : 0;
        // Assign ground-depth intent without resetting physical vertical velocity or gravity.
        this.player.body.velocityY = length > 0 ? directionY / length * speed : 0;
    }

    /** Fill the harness backdrop independently from all world geometry/depth decisions. */
    drawBackground(renderer) {
        // Queue one screen-space rectangle covering the entire visible drawing surface.
        this.backgroundBrush.rectangle(0, 0, renderer.viewportWidth, renderer.viewportHeight);
        // Submit and clear the background brush queue.
        this.backgroundBrush.flush(renderer);
    }

    /** Refresh engine measurements through harness-owned HTML, with no extra scheduling loop. */
    updateDiagnostics(renderer) {
        // Wall-clock sampling continues while physical simulation is paused.
        const nowSeconds = performance.now() / 1000;
        // Limit text updates to five times per second.
        if (nowSeconds < this.nextHudUpdateSeconds) {
            // Keep prior diagnostic text until another sample is due.
            return;
        }
        // Set the next sample threshold without creating a timer or animation callback.
        this.nextHudUpdateSeconds = nowSeconds + 0.2;
        // Read measurements from their owning services.
        const profiler = this.directory.tools.get('profiler');
        // Physics reports actual spatial candidate/narrow-phase work.
        const physics = this.directory.systems.get('physics');
        // World rendering reports culled geometry and real GPU draw submissions.
        const worldRenderer = this.directory.systems.get('worldRenderer');
        // Display measured FPS only after a complete sample window.
        document.getElementById('fps-value').textContent = profiler.framesPerSecond ? profiler.framesPerSecond.toFixed(0) : '…';
        // Show completed fixed updates separately from display frames.
        document.getElementById('steps-value').textContent = String(profiler.simulationSteps);
        // Simulation time freezes during pause, irrespective of HUD sampling.
        document.getElementById('time-value').textContent = `${this.directory.parentEngine.lobby.simulationSeconds.toFixed(1)} s`;
        // Count final Canvas submissions plus internal world GPU submissions.
        document.getElementById('draws-value').textContent = String(renderer.drawCalls + worldRenderer.statistics.drawCalls);
        // Report intentionally dropped time rather than hiding slow simulation.
        document.getElementById('dropped-value').textContent = `${profiler.droppedSeconds.toFixed(2)} s`;
        // Preserve the existing backing-resolution display for orientation tests.
        document.getElementById('resolution-value').textContent = `${renderer.canvas.width} × ${renderer.canvas.height}`;
        // Show how many actual bodies are registered, including distant static objects.
        document.getElementById('bodies-value').textContent = String(physics.bodies.size);
        // Show how many geometry tests were needed in the latest fixed step.
        document.getElementById('checks-value').textContent = String(physics.statistics.narrowChecks);
        // Compare the rendered population with the whole scene registry.
        document.getElementById('visible-value').textContent = String(worldRenderer.statistics.visibleElements);
        // Report events observed through the generic contact subscription.
        document.getElementById('contacts-value').textContent = String(this.contactBegins);
    }

    /** Add a large distant static population; ordinary registration performs all index work. */
    addDistantPopulation() {
        // Run this deliberate stress setup once per study instance.
        if (this.distantPopulationAdded) {
            // Repeated button clicks must not duplicate object IDs or population.
            return;
        }
        // Count ten thousand ordinary objects, starting at zero and excluding ten thousand.
        for (let objectIndex = 0; objectIndex < 10000; objectIndex += 1) {
            // Place them outside the current scene's view and collision neighborhood.
            this.create(`remote-${objectIndex}`, {
                // Sparse columns keep nearby-query work proportional to local density.
                positionX: 2000 + (objectIndex % 100) * 80,
                // Integer division creates one hundred separate rows.
                positionY: 2000 + Math.floor(objectIndex / 100) * 80,
                // Each object has a real small footprint, not a fake count-only placeholder.
                width: 20,
                // Ordinary depth participates in actual spatial membership.
                depth: 20,
                // A positive height makes each registration a genuine solid volume.
                height: 30,
                // Plain material means these could be rendered if the camera visited them.
                material: { color: '#78648f' }
            });
        }
        // Remember that this actual population is already installed.
        this.distantPopulationAdded = true;
    }

    /** Remove all owned declarations and callbacks, leaving reusable engine services intact. */
    dispose() {
        // A failed initialization can occur before Directory assignment.
        if (!this.directory) {
            // No registrations exist in that case.
            return;
        }
        // A subscription may not exist if setup failed before that stage.
        if (this.unsubscribe) {
            // Release the test's contact callback before its bodies are removed.
            this.unsubscribe();
        }
        // “of” visits each owned element ID and ends after every declaration is removed.
        for (const identifier of this.elementIdentifiers) {
            // One API removes physical, visual, shadow, and Directory membership together.
            this.scene.removeElement(identifier);
        }
        // Forget owned IDs after cleanup completes.
        this.elementIdentifiers.length = 0;
        // Remove the source and its indexed influence, even if setup failed before creation.
        this.scene.removeLight('world-study.light');
        // Resolve the final compositor while Directory services remain alive.
        const renderer = this.directory.systems.get('renderer');
        // Remove this study's background callback only.
        renderer.removePass('world-study.background');
        // Remove its diagnostics callback independently from engine-owned passes.
        renderer.removePass('world-study.diagnostics');
    }
}
