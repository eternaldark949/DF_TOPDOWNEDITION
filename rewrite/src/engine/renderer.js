/**
 * DIRECTORY SYSTEM — the renderer owns canvas sizing, camera coordinates, brushes,
 * and ordered rendering passes. It never schedules frames and knows no game content.
 * Canvas uses a 2D drawing context; world coordinates are transformed into CSS pixels,
 * then into the backing image's physical pixels for sharp high-density displays.
 */
class RendererSystem {
    /** Connect a canvas and Basement settings; throw if a 2D context is unavailable. */
    constructor(canvas, basement) {
        // Retain the existing canvas object, so resizing it needs no reference refresh.
        this.canvas = canvas;
        // Keep shared settings and arithmetic available without copying their state.
        this.basement = basement;
        // Ask the browser for the surface used by Canvas drawing commands.
        this.drawingContext = canvas.getContext('2d');
        // Stop initialization if this browser cannot supply a usable drawing surface.
        if (!this.drawingContext) {
            // Report an actionable initialization error rather than failing on the first draw.
            throw new Error('This foundation requires a Canvas 2D drawing context.');
        }
        // Store callbacks in explicit drawing order instead of relying on property order.
        this.renderPasses = [];
        // Store a camera in world units; zoom is CSS pixels per world unit.
        this.camera = {
            // Center of the view along the world's horizontal axis.
            positionX: 0,
            // Center of the view along the world's vertical axis.
            positionY: 0,
            // A zoom of one maps one world unit to one CSS pixel.
            zoom: 1
        };
        // Dimensions are CSS pixels, independent of device pixel density.
        this.viewportWidth = 1;
        // Start with a nonzero height so early coordinate conversions remain defined.
        this.viewportHeight = 1;
        // Backing-image pixels per CSS pixel; resize selects the actual capped density.
        this.pixelRatio = 1;
        // Reset draw accounting once per rendered frame.
        this.drawCalls = 0;
    }

    /** Resolve the shared scene after construction; legacy Canvas-only studies remain supported. */
    connect(directory) {
        // The actual scene object exists even before its own index connection phase runs.
        this.scene = directory.systems.get('scene');
    }

    /** Resize backing pixels from CSS dimensions; do not replace the canvas object. */
    resize(widthCssPixels, heightCssPixels, devicePixelRatio = 1) {
        // Reject invalid public inputs before they can poison transforms or allocation.
        if (![widthCssPixels, heightCssPixels, devicePixelRatio].every(Number.isFinite)) {
            // NaN and infinity cannot describe a drawing surface.
            throw new RangeError('Canvas dimensions and pixel ratio must be finite.');
        }
        // Avoid a zero-size canvas while its parent is briefly hidden or collapsed.
        this.viewportWidth = Math.max(1, widthCssPixels);
        // Keep the CSS height nonzero for input conversion and rendering.
        this.viewportHeight = Math.max(1, heightCssPixels);
        // Respect the Basement's phone-friendly density limit.
        this.pixelRatio = this.basement.clamp(devicePixelRatio, 1, this.basement.configuration.maximumPixelRatio);
        // Allocate the horizontal backing resolution in physical pixels.
        this.canvas.width = Math.round(this.viewportWidth * this.pixelRatio);
        // Allocate vertical backing pixels; canvas resizing also resets context state.
        this.canvas.height = Math.round(this.viewportHeight * this.pixelRatio);
    }

    /** Add an ordered pass: its ID, coordinate space, order, and drawing callback. */
    registerPass(identifier, order, coordinateSpace, draw) {
        // Unstructured world Canvas calls cannot participate in the shared GPU depth buffer.
        if (coordinateSpace === 'world' && this.scene?.worldElements.size > 0) {
            // Require physical world surfaces to use the declarative scene API instead.
            throw new Error('Depth-aware world content must use scene elements/materials, not Canvas world passes.');
        }
        // Reject ambiguous coordinates rather than silently choosing the wrong transform.
        if (!['world', 'screen'].includes(coordinateSpace)) {
            // Name the two supported spaces explicitly.
            throw new Error('Render passes use world or screen coordinates.');
        }
        // A pass needs a callable implementation and a finite sorting priority.
        if (typeof draw !== 'function' || !Number.isFinite(order)) {
            // Avoid deferred failures inside the running animation callback.
            throw new TypeError('A render pass needs a function and finite order.');
        }
        // Check each existing pass; “some” stops as soon as it finds a matching ID.
        if (this.renderPasses.some((renderPass) => renderPass.identifier === identifier)) {
            // Keep pass removal and toggles unambiguous.
            throw new Error(`Render pass ${identifier} is already registered.`);
        }
        // Store all pass properties explicitly so callers can inspect and toggle them.
        const renderPass = {
            // Unique name used to find or remove this pass.
            identifier,
            // Lower values draw first, underneath later passes.
            order,
            // Choose camera-relative world drawing or fixed screen drawing.
            coordinateSpace,
            // Callback receives the renderer and the current frame information.
            draw,
            // A disabled pass remains registered but contributes no drawing.
            enabled: true
        };
        // Append the pass before ordering the complete list.
        this.renderPasses.push(renderPass);
        // Compare priorities; modern JavaScript's stable sort preserves equal-order registration.
        this.renderPasses.sort((firstPass, secondPass) => firstPass.order - secondPass.order);
        // Return the actual pass object so its owner can toggle enabled directly.
        return renderPass;
    }

    /** Remove a pass by ID; other registered passes keep their order. */
    removePass(identifier) {
        // Keep each pass whose identifier does not match the removed one.
        this.renderPasses = this.renderPasses.filter((renderPass) => renderPass.identifier !== identifier);
    }

    /** Project actual world XYZ into canvas-relative CSS pixels using the shared height model. */
    worldToScreen(positionX, positionY, positionZ = 0) {
        // Return both visible coordinates and physical camera depth for tools/inspection.
        return {
            // Oblique projection preserves world X before ordinary centering and zoom.
            positionX: (positionX - this.camera.positionX) * this.camera.zoom + this.viewportWidth / 2,
            // Physical height shifts projected Y upward using the same shader/index scale.
            positionY: (positionY - positionZ * this.basement.configuration.heightProjectionScale - this.camera.positionY) * this.camera.zoom + this.viewportHeight / 2,
            // This perpendicular depth determines visibility, not arbitrary drawing priority.
            cameraDepth: (positionY - this.camera.positionY) * this.basement.configuration.heightProjectionScale + positionZ
        };
    }

    /** Convert canvas-relative CSS pixels to world XY on a chosen Z plane (ground by default). */
    screenToWorld(screenPositionX, screenPositionY, positionZ = 0) {
        // Return a fresh coordinate object; no camera or input state is changed.
        return {
            // Undo centering and zoom, then restore the camera's world position.
            positionX: (screenPositionX - this.viewportWidth / 2) / this.camera.zoom + this.camera.positionX,
            // Undo projected height as well as centering/zoom for the selected physical plane.
            positionY: (screenPositionY - this.viewportHeight / 2) / this.camera.zoom + this.camera.positionY + positionZ * this.basement.configuration.heightProjectionScale,
            // One screen point has many possible world heights; the caller explicitly chooses one.
            positionZ
        };
    }

    /** Draw all enabled passes once; clear first and isolate every pass's Canvas state. */
    render(frame) {
        // Cache the context reference under a name that describes what it is.
        const drawingContext = this.drawingContext;
        // Begin draw-call accounting for this frame.
        this.drawCalls = 0;
        // Clear using backing pixels, without any camera or density transformation.
        drawingContext.setTransform(1, 0, 0, 1, 0, 0);
        // Erase the prior frame, including transparent parts of the scene.
        drawingContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Visit pass values in their sorted order; stop after the list is exhausted.
        // “of” is used because we need each pass object, not array property keys.
        for (const renderPass of this.renderPasses) {
            // Skip this pass when its owner has disabled it.
            if (!renderPass.enabled) {
                // Continue advances to the next pass without leaving the render method.
                continue;
            }
            // Preserve context state so one pass cannot leak ordinary style/transform changes.
            drawingContext.save();
            // Finally restores that state even when a drawing callback throws.
            try {
                // A legacy pass may have been registered before a depth-aware scene was added.
                if (renderPass.coordinateSpace === 'world' && this.scene?.worldElements.size > 0) {
                    // Reject the incompatible mix instead of silently drawing through roofs.
                    throw new Error('Canvas world passes cannot bypass a depth-aware scene. Use scene elements/materials.');
                }
                // Establish CSS-pixel coordinates for this pass.
                drawingContext.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
                // World-space passes follow the camera; screen-space UI stays fixed.
                if (renderPass.coordinateSpace === 'world') {
                    // Move the coordinate origin to the middle of the visible canvas.
                    drawingContext.translate(this.viewportWidth / 2, this.viewportHeight / 2);
                    // Scale world units by camera zoom on both axes.
                    drawingContext.scale(this.camera.zoom, this.camera.zoom);
                    // Move the world so the camera's position lands at the view center.
                    drawingContext.translate(-this.camera.positionX, -this.camera.positionY);
                }
                // Clear paths too: Canvas paths are not included in save/restore state.
                drawingContext.beginPath();
                // Let this pass's owner supply content using the established coordinates.
                renderPass.draw(this, frame);
            } finally {
                // Restore the previous styles, transform, clipping, and compositing state.
                drawingContext.restore();
                // Prevent an unfinished path from becoming the next pass's path.
                drawingContext.beginPath();
            }
        }
    }
}

/**
 * CanvasBrush collects same-color rectangles, then fills their shared path once.
 * One brush owns one color. Callers control brush order; the registry does not
 * regroup different colors, which could change overlap and transparency behavior.
 */
class CanvasBrush {
    /** Create a reusable brush with a fixed fill color and an empty instruction queue. */
    constructor(color) {
        // Keep the Canvas-compatible color string visible to the brush owner.
        this.color = color;
        // Store rectangles in the order the caller requests them.
        this.instructions = [];
    }

    /** Queue a rectangle in the current pass's units without drawing it yet. */
    rectangle(positionX, positionY, width, height) {
        // Retain all four rectangle arguments together for the later drawing stage.
        this.instructions.push({
            // Horizontal position of the rectangle's starting corner.
            positionX,
            // Vertical position of the rectangle's starting corner.
            positionY,
            // Horizontal extent from that corner.
            width,
            // Vertical extent from that corner.
            height
        });
    }

    /** Fill all queued rectangles on the supplied renderer and always empty the queue. */
    flush(renderer) {
        // An empty queue requires no Canvas work.
        if (this.instructions.length === 0) {
            // Return without increasing the renderer's draw-call counter.
            return;
        }
        // Use the renderer's context without taking over its coordinate transform.
        const drawingContext = renderer.drawingContext;
        // Release queued work even if the browser rejects a drawing operation.
        try {
            // Apply this brush's color to the next filled path.
            drawingContext.fillStyle = this.color;
            // Start one path containing all rectangles queued for this brush.
            drawingContext.beginPath();
            // Visit instruction values in order; “of” retrieves objects, not their keys.
            // Finish when every queued rectangle has been added to the path.
            for (const instruction of this.instructions) {
                // Add a rectangle using its corner and dimensions; rect does not fill yet.
                drawingContext.rect(instruction.positionX, instruction.positionY, instruction.width, instruction.height);
            }
            // Fill the collected rectangles together with the brush color.
            drawingContext.fill();
            // Record this one fill call in the renderer's current frame statistics.
            renderer.drawCalls += 1;
        } finally {
            // Reuse the array while discarding instructions already submitted this frame.
            this.instructions.length = 0;
        }
    }
}
