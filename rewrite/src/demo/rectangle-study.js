/**
 * TEST CONTENT — a small procedural study installed through the Penthouse contract.
 * This exercises brushes, elements, input, fixed updates, interpolation, and render
 * order. It is not game content and is not the original humanoid/building renderer.
 * The engine source contains no references to this class and runs without it.
 */
class RectangleStudy {
    /** Store no engine resources until initialize receives the completed Directory. */
    constructor() {
        // The connection phase supplies a Directory after engine construction.
        this.directory = null;
        // Simulation time drives repeatable motion, independent of display frame rate.
        this.elapsedSeconds = 0;
        // The preceding step's time is used to interpolate smooth rendered motion.
        this.previousSeconds = 0;
        // Keep the controlled element close to the view center initially.
        this.player = {
            // Current horizontal world position.
            positionX: 0,
            // Current vertical world position.
            positionY: 0,
            // Previous step's horizontal world position.
            previousPositionX: 0,
            // Previous step's vertical world position.
            previousPositionY: 0
        };
        // Brushes demonstrate the original rewrite's same-color queued drawing approach.
        this.backgroundBrush = new CanvasBrush('#0d0b18');
        // Background grid tiles use a darker color than the moving shapes.
        this.gridBrush = new CanvasBrush('#242039');
        // Animated rectangles use the owner's periwinkle palette.
        this.tileBrush = new CanvasBrush('#cebbff');
        // The controlled element uses a separate warm color for easy identification.
        this.playerBrush = new CanvasBrush('#ffeed8');
        // HUD refresh is throttled separately from rendering without creating a timer.
        this.nextHudUpdateSeconds = 0;
    }

    /** Register one element and three passes; all service dependencies now exist. */
    initialize(directory) {
        // Retain the Directory reference for live service lookup during execution.
        this.directory = directory;
        // Register this study's controlled object without inventing a game-specific engine field.
        directory.elements.register('study.player', this.player);
        // Obtain the reusable renderer that accepts this feature's drawing callbacks.
        const renderer = directory.systems.get('renderer');
        // The bound method keeps this study as “this” when the renderer calls it later.
        renderer.registerPass('study.background', 0, 'screen', this.drawBackground.bind(this));
        // World content follows camera position and zoom, unlike the background.
        renderer.registerPass('study.world', 10, 'world', this.drawWorld.bind(this));
        // A last pass updates the harness HUD without giving the engine knowledge of HTML IDs.
        renderer.registerPass('study.diagnostics', 100, 'screen', this.updateDiagnostics.bind(this));
    }

    /** Advance the study by fixed seconds; inputs change only this study's element. */
    update(stepSeconds) {
        // Keep the old simulation time before advancing it for this step.
        this.previousSeconds = this.elapsedSeconds;
        // Add the fixed duration rather than counting display frames.
        this.elapsedSeconds += stepSeconds;
        // Remember the old horizontal coordinate for smooth display interpolation.
        this.player.previousPositionX = this.player.positionX;
        // Remember the old vertical coordinate too.
        this.player.previousPositionY = this.player.positionY;
        // Read current input from its owning system instead of copying held state.
        const input = this.directory.systems.get('input');
        // Read the renderer to convert pointer positions from screen to world coordinates.
        const renderer = this.directory.systems.get('renderer');
        // Pointer dragging/touching places the study's marker in the world.
        if (input.pointer.held) {
            // Convert CSS pixels using the current camera and viewport settings.
            const worldPosition = renderer.screenToWorld(input.pointer.positionX, input.pointer.positionY);
            // Assign the marker's current horizontal world position.
            this.player.positionX = worldPosition.positionX;
            // Assign the marker's current vertical world position.
            this.player.positionY = worldPosition.positionY;
            // Finish this update without additionally applying keyboard movement.
            return;
        }
        // Obtain one directional value for left/right input, in the range -1 through 1.
        const horizontalDirection = Number(input.heldKeys.has('KeyD') || input.heldKeys.has('ArrowRight')) - Number(input.heldKeys.has('KeyA') || input.heldKeys.has('ArrowLeft'));
        // Obtain a vertical value; Canvas positive y points down the screen.
        const verticalDirection = Number(input.heldKeys.has('KeyS') || input.heldKeys.has('ArrowDown')) - Number(input.heldKeys.has('KeyW') || input.heldKeys.has('ArrowUp'));
        // Normalize diagonals so two held directions do not produce faster movement.
        const directionLength = Math.max(1, Math.hypot(horizontalDirection, verticalDirection));
        // Move at 150 world units per second horizontally, scaled by the fixed duration.
        this.player.positionX += horizontalDirection / directionLength * 150 * stepSeconds;
        // Apply the same speed and duration to vertical movement.
        this.player.positionY += verticalDirection / directionLength * 150 * stepSeconds;
    }

    /** Fill the screen background once using CSS-pixel dimensions, independent of camera. */
    drawBackground(renderer) {
        // Queue a rectangle starting at the top-left corner and covering the viewport.
        this.backgroundBrush.rectangle(0, 0, renderer.viewportWidth, renderer.viewportHeight);
        // Draw the queued background and empty this brush's queue.
        this.backgroundBrush.flush(renderer);
    }

    /** Draw a world grid, animated rectangles, and the interpolated controlled element. */
    drawWorld(renderer, frame) {
        // Shared interpolation arithmetic belongs to the Basement.
        const basement = this.directory.basement;
        // Blend the previous/current simulation times for this display frame.
        const displaySeconds = basement.interpolate(this.previousSeconds, this.elapsedSeconds, frame.interpolationFraction);
        // Work from column -12 through 12, increasing the column index by one each time.
        // This counting loop needs an index to calculate each tile's world position.
        for (let columnIndex = -12; columnIndex <= 12; columnIndex += 1) {
            // For each column, visit row -9 through 9, increasing the row by one.
            // Restarting this inner loop creates every row in the current column.
            for (let rowIndex = -9; rowIndex <= 9; rowIndex += 1) {
                // Queue a small square at the intersection; spacing is forty world units.
                this.gridBrush.rectangle(columnIndex * 40 - 1, rowIndex * 40 - 1, 2, 2);
            }
        }
        // Fill all grid squares before moving shapes, placing the grid underneath them.
        this.gridBrush.flush(renderer);
        // Draw twelve numbered shapes; start at zero and stop before twelve.
        // Increase tileIndex after each iteration so each shape gets a unique phase.
        for (let tileIndex = 0; tileIndex < 12; tileIndex += 1) {
            // Distribute phases evenly around a full circle, then rotate with time.
            const phaseRadians = tileIndex / 12 * Math.PI * 2 + displaySeconds * 0.35;
            // Use cosine to calculate horizontal motion across a 160-unit radius.
            const positionX = Math.cos(phaseRadians) * 160;
            // Use sine with a narrower radius to produce an elliptical orbit.
            const positionY = Math.sin(phaseRadians) * 95;
            // Queue a 14-unit square centered on this shape's calculated position.
            this.tileBrush.rectangle(positionX - 7, positionY - 7, 14, 14);
        }
        // Fill the orbiting shapes as one same-color drawing batch.
        this.tileBrush.flush(renderer);
        // Blend horizontal position so displays faster than simulation still look smooth.
        const playerPositionX = basement.interpolate(this.player.previousPositionX, this.player.positionX, frame.interpolationFraction);
        // Blend the corresponding vertical positions using the same fraction.
        const playerPositionY = basement.interpolate(this.player.previousPositionY, this.player.positionY, frame.interpolationFraction);
        // Queue the larger cream marker centered on the controlled element.
        this.playerBrush.rectangle(playerPositionX - 10, playerPositionY - 10, 20, 20);
        // Draw it after the orbiting shapes so overlap demonstrates explicit pass order.
        this.playerBrush.flush(renderer);
    }

    /** Update harness text at most five times per second; no engine-side UI assumptions. */
    updateDiagnostics(renderer) {
        // Use wall-clock time so diagnostics still refresh while simulation is paused.
        const currentSeconds = performance.now() / 1000;
        // Avoid repeated DOM writes on every rendered frame.
        if (currentSeconds < this.nextHudUpdateSeconds) {
            // Keep the previously displayed text until the next refresh is due.
            return;
        }
        // Schedule the next text refresh by comparison, without creating another loop.
        this.nextHudUpdateSeconds = currentSeconds + 0.2;
        // Resolve the measurement tool from its owning Directory.
        const profiler = this.directory.tools.get('profiler');
        // Locate the owning Lobby through the connected engine reference.
        const lobby = this.directory.parentEngine.lobby;
        // Present the current completed measurement window, or a warmup label.
        document.getElementById('fps-value').textContent = profiler.framesPerSecond ? profiler.framesPerSecond.toFixed(0) : '…';
        // Show actual fixed updates, demonstrating that rendering and simulation differ.
        document.getElementById('steps-value').textContent = String(profiler.simulationSteps);
        // Show simulated time, which freezes on pause and does not catch up after stop.
        document.getElementById('time-value').textContent = `${lobby.simulationSeconds.toFixed(1)} s`;
        // Report draw submissions tracked by brushes, excluding HTML HUD updates.
        document.getElementById('draws-value').textContent = String(renderer.drawCalls);
        // Report time deliberately dropped by the catch-up protection.
        document.getElementById('dropped-value').textContent = `${profiler.droppedSeconds.toFixed(2)} s`;
        // Show the current high-density backing allocation.
        document.getElementById('resolution-value').textContent = `${renderer.canvas.width} × ${renderer.canvas.height}`;
    }

    /** Remove only this feature's passes and element; Directory services remain reusable. */
    dispose() {
        // Installation can fail before a Directory reference exists.
        if (!this.directory) {
            // No service registrations need cleanup in that case.
            return;
        }
        // Obtain the renderer while the engine still keeps Directory services alive.
        const renderer = this.directory.systems.get('renderer');
        // Visit each owned pass-name value once; finish after all three names.
        // “of” is used because removal needs names, not array index keys.
        for (const passName of ['study.background', 'study.world', 'study.diagnostics']) {
            // Remove this feature's drawing callback without disturbing other features.
            renderer.removePass(passName);
        }
        // Unregister the controlled element owned by this study.
        this.directory.elements.remove('study.player');
    }
}
