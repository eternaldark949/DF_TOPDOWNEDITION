/**
 * REAL ASSET STUDY — Double Nights Hotel uses its original prepared Canvas artwork
 * on actual depth-tested surfaces, rather than a screenshot billboard or a rewrite
 * of its procedural paint instructions into per-frame GPU triangles. The generic
 * engine and TexturedAssetInstance know no hotel-specific rendering priorities.
 * This study owns input, camera setup, and an ordinary physical test actor only.
 */
class HotelStudy {
    /** Store no scene registrations before the completed Directory is supplied. */
    constructor() {
        // The connection phase supplies services before scene installation.
        this.directory = null;
        // Throttle HTML diagnostics without adding a timer or a second frame scheduler.
        this.nextHudUpdateSeconds = 0;
    }

    /** Place the already decoded asset, a support floor, and an ordinary solid test actor. */
    initialize(directory) {
        // Retain the actual Directory for live system and lifecycle access.
        this.directory = directory;
        // Obtain the same scene declaration service used by the neutral studies.
        this.scene = directory.systems.get('scene');
        // Resolve the output owner for camera configuration and HTML-only diagnostics.
        this.renderer = directory.systems.get('renderer');
        // Install the prepared game's asset using a reusable Penthouse asset tool.
        this.instance = new TexturedAssetInstance(directory, 'hotel', directory.assets.get('double-nights'));
        // Declare support as an ordinary static box whose actual upper surface is ground zero.
        this.scene.createElement('hotel-study.floor', {
            // Cover the complete test courtyard and the hotel's ground footprint.
            width: 1800,
            // Leave room to approach the landmark from each ground direction.
            depth: 2000,
            // Center this support under the asset and forecourt.
            positionX: 400,
            // Center its ground-depth extent under the same test area.
            positionY: 420,
            // Start ten world units below the walking surface.
            positionZ: -10,
            // Ten units of thickness put the physical top at world Z zero.
            height: 10,
            // The source forecourt already supplies visible ground artwork.
            visible: false
        });
        // This actor uses the existing generic circle/box and height contact algorithms.
        this.actor = this.scene.createElement('hotel-study.actor', {
            // Analytical circle collision is shared with other ordinary scene bodies.
            shape: 'circle',
            // Start near the courtyard's lower medallion.
            positionX: 400,
            // Leave a clear approach toward the hotel's curved front.
            positionY: 790,
            // Ten-world-unit radius makes the test actor visible beside real-sized doors.
            radius: 10,
            // Height participates in the same physical Z and visual depth calculation.
            height: 30,
            // A clear cream material distinguishes the test actor from the source building art.
            material: {color: '#ffeed8'},
            // Dynamic motion receives ordinary gravity/support and yields at walls by default.
            body: {motion: 'dynamic', friction: 0}
        });
        // Select the original game's radial height projection, with no object-name shader branch.
        this.renderer.camera.projection = 'radial';
        // Read source-authored height emphasis from asset data instead of baking a game default into the engine.
        this.renderer.camera.heightExaggeration = directory.assets.get('double-nights').heightExaggeration;
        // Center the horizontal view on the asset's authored 800-unit plan.
        this.renderer.camera.positionX = 400;
        // Center vertically between the building and its forecourt.
        this.renderer.camera.positionY = 900;
        // Start with original daytime artwork before enabling its cached night image.
        this.renderer.nightAmount = 0;
        // Reset this visible action when the asset is reinstalled after a prior night-view session.
        document.getElementById('hotel-night-button').textContent = 'Show night artwork';
        // Choose a readable complete-asset view for the current phone/desktop viewport.
        this.fitView();
        // Bind keeps this study as “this” when the browser later sends resize events.
        this.handleResize = this.onResize.bind(this);
        // The engine's earlier resize listener updates viewport dimensions before this callback.
        directory.parentEngine.browserWindow.addEventListener('resize', this.handleResize);
        // Diagnostics run after WebGL presentation and never paint onto the output canvas.
        this.renderer.registerPass('hotel-study.diagnostics', 100, 'screen', this.updateDiagnostics.bind(this));
    }

    /** Fit the whole authored hotel/forecourt into the current viewport, with a small margin. */
    fitView() {
        // Start with a complete-asset estimate before measuring the radial projection's actual bounds.
        this.renderer.camera.zoom = Math.min(this.renderer.viewportWidth / 1100, this.renderer.viewportHeight / 1100);
        // Remove earlier framing while measuring this view's actual projected artwork.
        this.renderer.camera.screenOffsetX = 0;
        // The eye remains south of the hotel while the framing window can show the whole landmark.
        this.renderer.camera.screenOffsetY = 0;
        // Read prepared corner definitions; this setup operation never repaints or uploads artwork.
        const definition = this.directory.assets.get('double-nights');
        // Retain bounds across refinement passes so final centering uses the final projected extent.
        let bounds = null;
        // Refine three times from index zero, increasing by one and excluding three.
        // Zoom also changes the original camera altitude, so one linear size estimate is insufficient.
        for (let refinementIndex = 0; refinementIndex < 3; refinementIndex += 1) {
            // Establish each pass's projected CSS bounds beyond all finite corner positions.
            bounds = {minimumX: Infinity, minimumY: Infinity, maximumX: -Infinity, maximumY: -Infinity};
            // “of” visits source surfaces and stops after every prepared asset surface.
            for (const surface of definition.surfaces) {
                // Visit actual spatial corners; their UV components do not affect camera framing.
                for (const corner of surface.corners) {
                    // Use the exact shared projection also used by physical actor input and GPU setup.
                    const point = this.renderer.worldToScreen(corner[0], corner[1], corner[2]);
                    // Extend the left projected artwork extent.
                    bounds.minimumX = Math.min(bounds.minimumX, point.positionX);
                    // Extend the upper projected artwork extent.
                    bounds.minimumY = Math.min(bounds.minimumY, point.positionY);
                    // Extend the right projected artwork extent.
                    bounds.maximumX = Math.max(bounds.maximumX, point.positionX);
                    // Extend the lower projected artwork extent.
                    bounds.maximumY = Math.max(bounds.maximumY, point.positionY);
                }
            }
            // The last pass measures/centers the final zoom instead of changing it again afterward.
            if (refinementIndex < 2) {
                // Retain readable margins without assuming the viewport's aspect ratio.
                const fitFactor = Math.min(Math.max(1, this.renderer.viewportWidth - 36) / (bounds.maximumX - bounds.minimumX), Math.max(1, this.renderer.viewportHeight - 55) / (bounds.maximumY - bounds.minimumY));
                // Apply the fit correction before measuring the next altitude-dependent projection.
                this.renderer.camera.zoom *= fitFactor;
            }
        }
        // Frame the projected asset center while keeping the physical eye out in the forecourt.
        this.renderer.camera.screenOffsetX = this.renderer.viewportWidth / 2 - (bounds.minimumX + bounds.maximumX) / 2;
        // Vertical framing displays the front walls and roofs together in a complete-asset view.
        this.renderer.camera.screenOffsetY = this.renderer.viewportHeight / 2 - (bounds.minimumY + bounds.maximumY) / 2;
        // Expose the adaptive view choice instead of falsely showing a fixed percentage.
        document.getElementById('zoom-control').value = 'fit';
    }

    /** Refit after resize only while the user has explicitly selected the adaptive fit view. */
    onResize() {
        // A user-selected fixed zoom must survive phone rotation as a deliberate camera choice.
        if (document.getElementById('zoom-control').value === 'fit') {
            // Read the engine's newly updated viewport dimensions through the retained renderer.
            this.fitView();
        }
    }

    /** Set movement intentions each fixed step; ordinary engine physics resolves actual contacts. */
    update(stepSeconds) {
        // Read current keyboard/pointer state from its owning system.
        const input = this.directory.systems.get('input');
        // Keyboard horizontal direction is a signed value, without display-frame dependence.
        let directionX = Number(input.heldKeys.has('KeyD') || input.heldKeys.has('ArrowRight')) - Number(input.heldKeys.has('KeyA') || input.heldKeys.has('ArrowLeft'));
        // Positive ground Y approaches the bottom of this top-down view.
        let directionY = Number(input.heldKeys.has('KeyS') || input.heldKeys.has('ArrowDown')) - Number(input.heldKeys.has('KeyW') || input.heldKeys.has('ArrowUp'));
        // A held touch/mouse destination overrides keyboard intentions.
        if (input.pointer.held) {
            // Ground-zero inversion follows the same radial camera as the visible courtyard.
            const destination = this.renderer.screenToWorld(input.pointer.positionX, input.pointer.positionY, 0);
            // Aim toward the target from the actor's authoritative physical position.
            directionX = destination.positionX - this.actor.transform.positionX;
            // Include the corresponding ground-depth distance.
            directionY = destination.positionY - this.actor.transform.positionY;
        }
        // Normalize diagonals and pointer distances so movement speed remains 130 world units/second.
        const magnitude = Math.max(1, Math.hypot(directionX, directionY));
        // Physics owns integration; controls specify velocity rather than moving through walls directly.
        this.actor.body.velocityX = directionX / magnitude * 130;
        // Apply the same bounded speed on the ground-depth axis.
        this.actor.body.velocityY = directionY / magnitude * 130;
    }

    /** Present actual engine statistics and asset-cache counts without creating a UI draw pass. */
    updateDiagnostics(renderer) {
        // Use wall time so pause still permits a readable live diagnostic display.
        const nowSeconds = performance.now() / 1000;
        // Limit DOM writes to five samples each second.
        if (nowSeconds < this.nextHudUpdateSeconds) {
            // Keep the existing labels until the next sample is due.
            return;
        }
        // Record the next permitted sample time without starting a timer.
        this.nextHudUpdateSeconds = nowSeconds + 0.2;
        // Resolve measurements from their reusable Directory-owned tool.
        const profiler = this.directory.tools.get('profiler');
        // Read actual backend submissions and buffer replacements.
        const world = this.directory.systems.get('worldRenderer');
        // Read image generation/upload accounting separately from draw-call accounting.
        const artwork = this.directory.systems.get('artwork');
        // Present a warmup indicator until an FPS sampling window completes.
        document.getElementById('fps-value').textContent = profiler.framesPerSecond ? profiler.framesPerSecond.toFixed(0) : '…';
        // Show actual fixed updates, not estimated elapsed display frames.
        document.getElementById('steps-value').textContent = String(profiler.simulationSteps);
        // The Lobby owns accumulated simulation seconds and pause state.
        document.getElementById('time-value').textContent = `${this.directory.parentEngine.lobby.simulationSeconds.toFixed(1)} s`;
        // Sum actual world GPU submissions and final GPU presentation.
        document.getElementById('draws-value').textContent = String(world.statistics.drawCalls + renderer.drawCalls);
        // Keep deliberate catch-up losses visible rather than disguising a slow test environment.
        document.getElementById('dropped-value').textContent = `${profiler.droppedSeconds.toFixed(2)} s`;
        // Backing resolution describes the actual displayed WebGL canvas.
        document.getElementById('resolution-value').textContent = `${renderer.canvas.width} × ${renderer.canvas.height}`;
        // Uploads should stabilize after each asset's first use, even as the camera/actor moves.
        document.getElementById('hotel-cache-value').textContent = `${artwork.paintCount} runtime paints · ${artwork.uploadCount} image uploads · ${world.statistics.bufferUploads ?? 0} mesh uploads this frame`;
    }

    /** Remove this test feature's scene resources while leaving shared images available for reuse. */
    dispose() {
        // Failed installation may leave no connected Directory to clean up.
        if (!this.directory) {
            // No engine resources can exist before connection.
            return;
        }
        // Remove this feature's HTML diagnostic callback before scene teardown.
        this.renderer.removePass('hotel-study.diagnostics');
        // Stop the feature's resize callback without touching the engine's own resize listener.
        this.directory.parentEngine.browserWindow.removeEventListener('resize', this.handleResize);
        // Optional chaining tolerates a failure before the asset instance finished construction.
        this.instance?.dispose();
        // Remove the ordinary actor and its physical contact/index ownership.
        this.scene.removeElement('hotel-study.actor');
        // Remove the test support volume through the same shared ownership path.
        this.scene.removeElement('hotel-study.floor');
    }
}
