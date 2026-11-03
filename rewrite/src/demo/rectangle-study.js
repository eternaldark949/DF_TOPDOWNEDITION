/**
 * TEST CONTENT — a small procedural study installed through the Penthouse contract.
 * This exercises scene elements, input, fixed updates, interpolation, and render
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
        // Own every scene declaration so uninstall releases only this study's content.
        this.sceneIdentifiers = [];
        // Keep the orbiting scene elements available without searching the scene each frame.
        this.orbitElements = [];
        // HUD refresh is throttled separately from rendering without creating a timer.
        this.nextHudUpdateSeconds = 0;
    }

    /** Install decorative planes and frame preparation; all output uses shared WebGL depth. */
    initialize(directory) {
        // Retain the completed Directory, whose scene and renderer already exist.
        this.directory = directory;
        // Register the controlled simulation state separately from its interpolated visual plane.
        directory.elements.register('study.player', this.player);
        // Resolve the shared scene service once during installation.
        this.scene = directory.systems.get('scene');
        // Resolve output callbacks for interpolation before the engine's world stage.
        const renderer = directory.systems.get('renderer');
        // Visit columns -12 through 12 inclusive, increasing by one after each column.
        // A counting loop provides the column number needed for horizontal world placement.
        for (let columnIndex = -12; columnIndex <= 12; columnIndex += 1) {
            // Restart rows at -9 for each column; include row 9, advancing one row at a time.
            // This nested loop supplies every row/column intersection of the stationary grid.
            for (let rowIndex = -9; rowIndex <= 9; rowIndex += 1) {
                // Create a two-unit ground plane centered on the original grid intersection.
                this.createPlane(`grid-${columnIndex}-${rowIndex}`, columnIndex * 40, rowIndex * 40, 0, 2, '#242039');
            }
        }
        // Create twelve orbiting shapes, counting from zero and excluding twelve.
        // The index supplies a stable ID and later determines that shape's animation phase.
        for (let tileIndex = 0; tileIndex < 12; tileIndex += 1) {
            // A slight physical separation keeps moving decorative planes above ground dots.
            const element = this.createPlane(`orbit-${tileIndex}`, 0, 0, 0.02, 14, '#cebbff');
            // Retain the actual scene element for tracked position updates before rendering.
            this.orbitElements.push(element);
        }
        // The marker is another opaque scene surface, slightly above the decorative orbit planes.
        this.markerElement = this.createPlane('marker', 0, 0, 0.04, 20, '#ffeed8');
        // Bind preserves this study as JavaScript's “this” when the renderer invokes the callback.
        renderer.registerPass('study.prepare', 10, 'screen', this.prepareWorld.bind(this));
        // HTML diagnostics run after presentation and do not draw into a Canvas context.
        renderer.registerPass('study.diagnostics', 100, 'screen', this.updateDiagnostics.bind(this));
    }

    /** Declare one unlit decorative plane, keeping its original palette independent of ambient light. */
    createPlane(identifier, positionX, positionY, positionZ, size, color) {
        // Prefix this study's addresses so cleanup cannot remove unrelated features.
        const fullIdentifier = `study.${identifier}`;
        // Use shared geometry/material declarations rather than a custom world drawing callback.
        const element = this.scene.createElement(fullIdentifier, {
            // A flat rectangle has no side faces or physical thickness.
            shape: 'plane',
            // Horizontal world coordinate of the rectangle center.
            positionX,
            // Ground-depth world coordinate of the rectangle center.
            positionY,
            // Actual elevation participates in the same visibility rule as every world surface.
            positionZ,
            // Horizontal world extent; unlike Canvas rect(), scene planes use a center origin.
            width: size,
            // Ground-depth world extent uses the same size for a square.
            depth: size,
            // These diagnostic decorations intentionally have no collision bodies.
            body: false,
            // Black reflection plus the original emitted color preserves this unlit study's palette.
            material: {
                // No reflected ambient/direct lighting is added to these flat test colors.
                color: '#000000',
                // Visible RGB belongs to the same depth-tested plane, never a late overlay.
                emission: color
            }
        });
        // Record this exact registration for feature-specific resource cleanup.
        this.sceneIdentifiers.push(fullIdentifier);
        // Return the live scene element for animation through its tracked transform.
        return element;
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
        // Obtain a vertical value; public screen positive Y points down.
        const verticalDirection = Number(input.heldKeys.has('KeyS') || input.heldKeys.has('ArrowDown')) - Number(input.heldKeys.has('KeyW') || input.heldKeys.has('ArrowUp'));
        // Normalize diagonals so two held directions do not produce faster movement.
        const directionLength = Math.max(1, Math.hypot(horizontalDirection, verticalDirection));
        // Move at 150 world units per second horizontally, scaled by the fixed duration.
        this.player.positionX += horizontalDirection / directionLength * 150 * stepSeconds;
        // Apply the same speed and duration to vertical movement.
        this.player.positionY += verticalDirection / directionLength * 150 * stepSeconds;
    }

    /** Interpolate visual planes before the engine world stage; execute no Canvas drawing. */
    prepareWorld(renderer, frame) {
        // Shared interpolation arithmetic belongs to the Basement.
        const basement = this.directory.basement;
        // Blend the preceding/current fixed times for this particular display callback.
        const displaySeconds = basement.interpolate(this.previousSeconds, this.elapsedSeconds, frame.interpolationFraction);
        // Count each retained orbit element from zero, stopping before the array length.
        // An index is needed because each element's numbered slot selects its orbit phase.
        for (let tileIndex = 0; tileIndex < this.orbitElements.length; tileIndex += 1) {
            // Spread phases evenly around a full circle and advance them with simulation time.
            const phaseRadians = tileIndex / 12 * Math.PI * 2 + displaySeconds * 0.35;
            // Cosine sets horizontal position on the original 160-unit orbit radius.
            const positionX = Math.cos(phaseRadians) * 160;
            // Sine sets vertical position on the original narrower 95-unit radius.
            const positionY = Math.sin(phaseRadians) * 95;
            // Update shared XYZ atomically; scene indexes and visibility follow automatically.
            this.orbitElements[tileIndex].transform.setPosition(positionX, positionY, 0.02);
        }
        // Interpolate horizontal simulation state without modifying that authoritative state.
        const playerPositionX = basement.interpolate(this.player.previousPositionX, this.player.positionX, frame.interpolationFraction);
        // Use the same fraction for the controlled marker's vertical ground coordinate.
        const playerPositionY = basement.interpolate(this.player.previousPositionY, this.player.positionY, frame.interpolationFraction);
        // Update the real decorative surface; the shared world stage performs its GPU drawing.
        this.markerElement.transform.setPosition(playerPositionX, playerPositionY, 0.04);
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
        // Count world GPU drawing and final GPU presentation, excluding HTML HUD writes.
        document.getElementById('draws-value').textContent = String(renderer.drawCalls + this.directory.systems.get('worldRenderer').statistics.drawCalls);
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
        // Visit each owned pass-name value once; finish after both callback names.
        // “of” is used because removal needs names, not array index keys.
        for (const passName of ['study.prepare', 'study.diagnostics']) {
            // Remove this feature's drawing callback without disturbing other features.
            renderer.removePass(passName);
        }
        // “of” supplies scene identifier values, stopping after every owned plane is removed.
        for (const identifier of this.sceneIdentifiers) {
            // Scene removal releases visual-index membership and Directory element ownership.
            this.scene.removeElement(identifier);
        }
        // Drop retained plane references so removed geometry can be garbage-collected.
        this.orbitElements.length = 0;
        // Release the marker's direct reference as part of this feature's ownership cleanup.
        this.markerElement = null;
        // Unregister the controlled element owned by this study.
        this.directory.elements.remove('study.player');
    }
}
