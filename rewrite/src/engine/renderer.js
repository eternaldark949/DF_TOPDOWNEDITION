/**
 * DIRECTORY OUTPUT SYSTEM — owns the actual displayed WebGL2 canvas, its pixel
 * dimensions, camera, and ordered preparation/UI callbacks. WorldRenderer owns
 * physical surface shading; no completed world frame passes through Canvas 2D.
 * Canvas artwork is produced separately by ArtworkSystem, only on demand.
 * This system never schedules frames and contains no game content.
 */
class RendererSystem {
    /** Connect the displayed canvas and settings; fail explicitly without WebGL2. */
    constructor(canvas, basement) {
        // Retain the actual HTML canvas; this is the surface the player sees.
        this.canvas = canvas;
        // Retain shared configuration by reference rather than copying settings.
        this.basement = basement;
        // Request GPU output directly. The browser may discard its backbuffer after
        // presentation; WorldRenderer retains an unchanged image in GPU-owned storage.
        this.graphics = canvas.getContext('webgl2', {
            // The output is opaque; world shading clears to the configured background.
            alpha: false,
            // All currently supported world materials are opaque, not premultiplied images.
            premultipliedAlpha: false,
            // Keep the existing deterministic sampling policy; antialiasing is future work.
            antialias: false,
            // Avoid requiring the browser to preserve the displayed backbuffer across frames.
            preserveDrawingBuffer: false
        });
        // A missing GPU context cannot provide equivalent physical visibility through Canvas.
        if (!this.graphics) {
            // Report the required capability before any feature is installed.
            throw new Error('ETRNL9 output requires WebGL2. Canvas 2D is only an artwork generator.');
        }
        // Screen callbacks prepare content or update UI; they are not Canvas drawing callbacks.
        this.renderPasses = [];
        // Camera coordinates use projected world units; zoom is CSS pixels per world unit.
        this.camera = {
            // Horizontal world coordinate at the center of the viewport.
            positionX: 0,
            // Projected vertical world coordinate at the center of the viewport.
            positionY: 0,
            // One CSS pixel per world unit at the default zoom.
            zoom: 1,
            // Oblique mode retains the primitive studies; radial mode matches original top-down lean.
            projection: 'oblique',
            // CSS view framing can shift independently of the eye point that controls height lean.
            screenOffsetX: 0,
            // A positive value frames content lower without changing physical camera/actor positions.
            screenOffsetY: 0,
            // Original virtual-camera world altitude at zoom one.
            altitude: 700,
            // Default radial height is unexaggerated; an asset study may choose a documented style setting.
            heightExaggeration: 1
        };
        // Nonzero initial CSS dimensions keep coordinate conversions defined before resize.
        this.viewportWidth = 1;
        // CSS height is independent of the GPU's backing-image resolution.
        this.viewportHeight = 1;
        // Backing pixels per CSS pixel, selected by resize from the density cap.
        this.pixelRatio = 1;
        // Opaque output background; normalized RGB is shared with the world target's clear.
        this.backgroundColor = [13 / 255, 11 / 255, 24 / 255];
        // Zero is daylight; one reveals the cached night emission on textured surfaces.
        this.nightAmount = 0;
        // Count final-output submissions separately from world/shadow submissions.
        this.drawCalls = 0;
    }

    /** Resolve the world backend after all Directory components exist. */
    connect(directory) {
        // Keep a live backend reference for context-loss status and empty-world clearing.
        this.worldRenderer = directory.systems.get('worldRenderer');
    }

    /** Validate CSS dimensions and change backing storage only when its size changes. */
    resize(widthCssPixels, heightCssPixels, devicePixelRatio = 1) {
        // Reject nonnumeric dimensions before they enter camera calculations or allocations.
        if (![widthCssPixels, heightCssPixels, devicePixelRatio].every(Number.isFinite)) {
            // Infinity and NaN cannot describe finite GPU image dimensions.
            throw new RangeError('Canvas dimensions and pixel ratio must be finite.');
        }
        // Avoid zero-size views while the host is collapsed or briefly hidden.
        this.viewportWidth = Math.max(1, widthCssPixels);
        // Apply the same minimum to CSS height.
        this.viewportHeight = Math.max(1, heightCssPixels);
        // Bound output density independently from the world's shading-density budget.
        this.pixelRatio = this.basement.clamp(devicePixelRatio, 1, this.basement.configuration.maximumPixelRatio);
        // Convert horizontal CSS extent into whole backing pixels.
        const backingWidth = Math.round(this.viewportWidth * this.pixelRatio);
        // Convert vertical CSS extent using the same output density.
        const backingHeight = Math.round(this.viewportHeight * this.pixelRatio);
        // Reassigning width discards storage, so skip it when the allocation already matches.
        if (this.canvas.width !== backingWidth) {
            // Resize the displayed GPU surface without replacing its object reference.
            this.canvas.width = backingWidth;
        }
        // Height also resets storage when assigned, even if its number is unchanged.
        if (this.canvas.height !== backingHeight) {
            // Allocate only when the actual requested height differs.
            this.canvas.height = backingHeight;
        }
    }

    /** Register a screen preparation/UI callback; world surfaces must use the scene API. */
    registerPass(identifier, order, coordinateSpace, draw) {
        // No arbitrary world callback can participate in the engine's shared surface depth.
        if (coordinateSpace !== 'screen') {
            // This rule applies even before the scene contains any elements.
            throw new Error('World content must use scene elements/materials; only screen callbacks are supported.');
        }
        // A callback must be callable and its sorting priority must be a finite number.
        if (typeof draw !== 'function' || !Number.isFinite(order)) {
            // Report the invalid registration immediately, before a running frame encounters it.
            throw new TypeError('A render pass needs a function and finite order.');
        }
        // some visits pass values and stops on the first matching unique identifier.
        if (this.renderPasses.some((renderPass) => renderPass.identifier === identifier)) {
            // Preserve unambiguous removal and ownership.
            throw new Error(`Render pass ${identifier} is already registered.`);
        }
        // Expose the actual registration so its owner can deliberately toggle enabled.
        const renderPass = {
            // Unique address for removal or inspection.
            identifier,
            // Lower values run first; this orders callbacks, not physical world visibility.
            order,
            // Screen coordinates use CSS pixels; no automatic Canvas transform exists.
            coordinateSpace,
            // Callable receives this renderer and the current Lobby frame information.
            draw,
            // Disabled registrations remain stored but do not execute.
            enabled: true
        };
        // Store the callback before sorting all registrations by priority.
        this.renderPasses.push(renderPass);
        // The comparator returns negative/positive for earlier/later priorities.
        this.renderPasses.sort((firstPass, secondPass) => firstPass.order - secondPass.order);
        // Return the live registration object, not a snapshot of its properties.
        return renderPass;
    }

    /** Remove one callback by identifier while preserving the remaining callback order. */
    removePass(identifier) {
        // filter retains each pass whose identifier differs from the removed one.
        this.renderPasses = this.renderPasses.filter((renderPass) => renderPass.identifier !== identifier);
    }

    /** Project actual world XYZ into canvas-relative CSS pixels using the shared height model. */
    worldToScreen(positionX, positionY, positionZ = 0) {
        // Delegate to the same projection contract used to configure the GPU camera.
        return WorldProjection.project(this, positionX, positionY, positionZ);
    }

    /** Reconstruct world XY from CSS pixels on an explicitly chosen physical Z plane. */
    screenToWorld(screenPositionX, screenPositionY, positionZ = 0) {
        // Projection inversion belongs to one shared helper rather than duplicated formulas.
        return WorldProjection.unproject(this, screenPositionX, screenPositionY, positionZ);
    }

    /** Clear the GPU output and run preparation, world presentation, and UI callbacks once. */
    render(frame) {
        // Begin final-output accounting for this display frame.
        this.drawCalls = 0;
        // Do not submit GPU work while the browser has lost the displayed context.
        if (this.worldRenderer.contextLost) {
            // Scene data and cached CPU artwork remain available for restoration.
            return;
        }
        // Explicitly select the displayed framebuffer, not a previous shadow/artwork target.
        this.graphics.bindFramebuffer(this.graphics.FRAMEBUFFER, null);
        // Cover the actual output allocation, which may be denser than world shading.
        this.graphics.viewport(0, 0, this.canvas.width, this.canvas.height);
        // A preceding light's scissor restriction must not leave old screen pixels uncleared.
        this.graphics.disable(this.graphics.SCISSOR_TEST);
        // Restore depth writes before clearing an empty scene's depth buffer.
        this.graphics.depthMask(true);
        // Clear to the same opaque background used by the retained world image.
        this.graphics.clearColor(...this.backgroundColor, 1);
        // Clear both displayed color and depth; an unloaded scene must leave no stale image.
        this.graphics.clear(this.graphics.COLOR_BUFFER_BIT | this.graphics.DEPTH_BUFFER_BIT);
        // Visit pass values in priority order, stopping after all registrations.
        // JavaScript “of” reads values like Python's “for pass in passes”, not property keys.
        for (const renderPass of this.renderPasses) {
            // A disabled callback contributes neither preparation nor drawing.
            if (!renderPass.enabled) {
                // Continue with the next value instead of leaving the entire render method.
                continue;
            }
            // Let the owning system/feature perform its specific frame-stage work.
            renderPass.draw(this, frame);
        }
    }
}
