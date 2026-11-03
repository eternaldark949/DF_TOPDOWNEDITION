/**
 * DIRECTORY ARTWORK SYSTEM — Canvas 2D is an image-making tool, never the world
 * frame renderer. Each named asset has fixed pixel dimensions and a synchronous
 * paint callback. create() records it; prepare() paints/uploads it on first use.
 * invalidate() requests a later repaint, so a sign changing text can update without
 * repainting unchanged walls. No timer, render callback, or automatic periodic bake
 * is installed here. Callers choose when changed information requires fresh artwork.
 * “Bake” means drawing into a reusable image. The CPU image survives GPU loss;
 * restoring a texture uploads that image again without rerunning the paint callback.
 * These texture handles are a resource foundation, not yet world material mapping:
 * textured world surfaces, alpha cutouts, atlases, and streaming remain future work.
 */
class ArtworkSystem {
    /** Retain the output canvas for document/context lookup; allocate no artwork yet. */
    constructor(outputCanvas) {
        // Use the displayed canvas's document to create independent artwork canvases.
        this.outputCanvas = outputCanvas;
        // Map uses explicit asset IDs, without inherited object properties.
        this.entries = new Map();
        // Count successful CPU paints across the lifetime of this system.
        this.paintCount = 0;
        // Count successful image uploads, including uploads after GPU restoration.
        this.uploadCount = 0;
    }

    /** Resolve the output context only after all Directory systems have been constructed. */
    connect(directory) {
        // Reuse the actual output GPU instead of creating an unrelated artwork GPU context.
        this.renderer = directory.systems.get('renderer');
        // Query loss status through the backend's current state, not a copied boolean.
        this.worldRenderer = directory.systems.get('worldRenderer');
    }

    /** Record fixed image-pixel dimensions and paint(context); return its unique string ID. */
    create(identifier, widthPixels, heightPixels, paint) {
        // Named assets require a readable unique address and a callable generator.
        if (typeof identifier !== 'string' || identifier.trim() === '' || this.entries.has(identifier) || typeof paint !== 'function') {
            // Reject invalid registration before acquiring any CPU/GPU storage.
            throw new TypeError('Artwork requires a unique nonempty ID and a synchronous paint function.');
        }
        // Pixel extents count whole positive pixels, not CSS or world coordinates.
        if (!Number.isInteger(widthPixels) || !Number.isInteger(heightPixels) || widthPixels < 1 || heightPixels < 1) {
            // Fractional/zero extents would silently change artwork placement and resolution.
            throw new RangeError('Artwork dimensions must be positive integer pixels.');
        }
        // Keep owned state private to this system; callers address assets by identifier.
        this.entries.set(identifier, {
            // Horizontal resolution of the reusable image in pixels.
            widthPixels,
            // Vertical resolution of the reusable image in pixels.
            heightPixels,
            // Callback paints only this asset and must finish synchronously.
            paint,
            // No CPU artwork exists until prepare is first called.
            canvas: null,
            // Null means no current GPU texture has been uploaded.
            texture: null,
            // New assets need exactly one initial paint before they can be used.
            dirty: true
        });
        // Return the stable asset address rather than exposing mutable cache internals.
        return identifier;
    }

    /** Find a registered asset; throw for typos instead of silently manufacturing an image. */
    require(identifier) {
        // Read the exact registration belonging to this identifier.
        const entry = this.entries.get(identifier);
        // A missing address cannot safely provide either dimensions or a GPU texture.
        if (!entry) {
            // Include the requested name in the error to locate incorrect references.
            throw new Error(`Artwork ${identifier} is not registered.`);
        }
        // Return the owned entry for this system's own cache operations.
        return entry;
    }

    /** Mark changed artwork for repaint on its next use; repeated marks coalesce. */
    invalidate(identifier) {
        // Set the dirty flag on the actual cached asset, not a copied status value.
        this.require(identifier).dirty = true;
    }

    /** Return a resident GPU texture, painting/uploading only when its cached state requires it. */
    prepare(identifier) {
        // Resolve registration before any side effects so invalid IDs fail consistently.
        const entry = this.require(identifier);
        // Context loss invalidates texture use; leave dirty work queued until restoration.
        if (this.worldRenderer.contextLost) {
            // Explicit null means temporarily unavailable, not a valid texture handle.
            return null;
        }
        // Read the displayed context through its owner rather than creating another context.
        const graphics = this.renderer.graphics;
        // Reject oversize artwork before allocating its CPU canvas.
        const maximumSize = graphics.getParameter(graphics.MAX_TEXTURE_SIZE);
        // Both image dimensions must fit this GPU's real texture capability.
        if (entry.widthPixels > maximumSize || entry.heightPixels > maximumSize) {
            // Do not silently shrink authored artwork or hide allocation failure.
            throw new RangeError(`Artwork ${identifier} exceeds this GPU texture capacity.`);
        }
        // A clean asset with a resident texture needs neither CPU paint nor GPU upload.
        if (!entry.dirty && entry.texture) {
            // Return the same handle so many instances can share this one image.
            return entry.texture;
        }
        // Only explicit dirtiness or first use authorizes a paint callback.
        if (entry.dirty) {
            // Paint into a new image so a failed generator cannot corrupt the previous image.
            const artworkCanvas = this.outputCanvas.ownerDocument.createElement('canvas');
            // Set horizontal image pixels independently of the displayed canvas dimensions.
            artworkCanvas.width = entry.widthPixels;
            // Set vertical image pixels; no CSS layout is involved.
            artworkCanvas.height = entry.heightPixels;
            // Canvas 2D exists only on this separate image-generation surface.
            const drawingContext = artworkCanvas.getContext('2d');
            // A browser that lacks image-generation support receives an explicit error.
            if (!drawingContext) {
                // Preserve the old asset and dirty flag so later retry remains possible.
                throw new Error('Canvas 2D is unavailable for artwork generation.');
            }
            // Ask the owner to paint this one image now, not inside a recurring engine schedule.
            const result = entry.paint(drawingContext);
            // Promise-like returns indicate asynchronous work that would escape cache ownership.
            if (result && typeof result.then === 'function') {
                // Require decoding/loading to finish before registering a synchronous generator.
                throw new TypeError('Artwork paint callbacks must finish synchronously.');
            }
            // Publish the newly completed CPU image only after its callback succeeds.
            entry.canvas = artworkCanvas;
            // Delete the superseded resident texture before uploading this asset's new revision.
            if (entry.texture) {
                // Only this system owns the texture's lifetime; placed instances share its address.
                graphics.deleteTexture(entry.texture);
            }
            // Force upload of the newly painted image instead of reusing the previous revision.
            entry.texture = null;
            // Clear dirtiness after a successful CPU paint; a later upload can retry without repaint.
            entry.dirty = false;
            // Count actual successful generator calls, not invalidation requests.
            this.paintCount += 1;
        }
        // A new or restored asset needs one GPU upload of its preserved CPU image.
        const texture = graphics.createTexture();
        // Allocation failure cannot provide a usable resident image handle.
        if (!texture) {
            // Leave the completed CPU image available for an explicit later retry.
            throw new Error(`GPU texture allocation failed for artwork ${identifier}.`);
        }
        // Remember the caller's current texture binding to avoid disturbing another GPU pass.
        const previousTexture = graphics.getParameter(graphics.TEXTURE_BINDING_2D);
        // Remember row orientation; artwork origin is top-left and is preserved in the stored image.
        const previousFlip = graphics.getParameter(graphics.UNPACK_FLIP_Y_WEBGL);
        // Remember whether the caller expected premultiplied image RGB during upload.
        const previousPremultiply = graphics.getParameter(graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        // Remember browser color conversion so generation cannot leak upload settings.
        const previousConversion = graphics.getParameter(graphics.UNPACK_COLORSPACE_CONVERSION_WEBGL);
        // Finally restores upload state even if the browser rejects the image source.
        try {
            // Select this asset's new texture as the upload destination.
            graphics.bindTexture(graphics.TEXTURE_2D, texture);
            // Store source rows in top-left image order; future UV mapping must follow that contract.
            graphics.pixelStorei(graphics.UNPACK_FLIP_Y_WEBGL, false);
            // Keep straight-alpha artwork pixels; compositing must choose the matching blend rule.
            graphics.pixelStorei(graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            // Preserve authored RGB values rather than applying browser-dependent upload conversion.
            graphics.pixelStorei(graphics.UNPACK_COLORSPACE_CONVERSION_WEBGL, graphics.NONE);
            // Upload this reusable image once; there is no upload of the completed world frame.
            graphics.texImage2D(graphics.TEXTURE_2D, 0, graphics.RGBA, graphics.RGBA, graphics.UNSIGNED_BYTE, entry.canvas);
            // Linear minification needs no generated mipmap chain for this initial resource contract.
            graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_MIN_FILTER, graphics.LINEAR);
            // Use the same smooth sampling when a future surface enlarges this artwork.
            graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_MAG_FILTER, graphics.LINEAR);
            // Clamp horizontal image edges instead of accidentally repeating unrelated border pixels.
            graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_WRAP_S, graphics.CLAMP_TO_EDGE);
            // Clamp the vertical image boundary under the same sampling rule.
            graphics.texParameteri(graphics.TEXTURE_2D, graphics.TEXTURE_WRAP_T, graphics.CLAMP_TO_EDGE);
            // GPU API failures may set an error code instead of throwing a JavaScript exception.
            const uploadError = graphics.getError();
            // Reject failed uploads rather than caching a handle with missing image pixels.
            if (uploadError !== graphics.NO_ERROR) {
                // Preserve the concrete numeric GPU error for diagnosis.
                throw new Error(`Artwork ${identifier} upload failed with WebGL error ${uploadError}.`);
            }
            // Publish the handle only after all upload/configuration commands have been submitted.
            entry.texture = texture;
            // Count actual uploads, including restoration of previously painted assets.
            this.uploadCount += 1;
        } catch (error) {
            // An unsuccessful handle must not leak or masquerade as a valid cached texture.
            graphics.deleteTexture(texture);
            // Retain the CPU image and propagate the concrete browser exception to the caller.
            throw error;
        } finally {
            // Restore row orientation for the caller's subsequent uploads.
            graphics.pixelStorei(graphics.UNPACK_FLIP_Y_WEBGL, previousFlip);
            // Restore the caller's original alpha upload rule.
            graphics.pixelStorei(graphics.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply);
            // Restore browser color conversion policy.
            graphics.pixelStorei(graphics.UNPACK_COLORSPACE_CONVERSION_WEBGL, previousConversion);
            // Restore the texture bound before this asset was prepared.
            graphics.bindTexture(graphics.TEXTURE_2D, previousTexture);
        }
        // Return the one resident texture shared by every caller using this asset address.
        return entry.texture;
    }

    /** Forget invalid GPU handles after restoration without repainting preserved CPU images. */
    restoreContext() {
        // “of” visits Map values like Python value iteration and stops after the last asset.
        for (const entry of this.entries.values()) {
            // A restored context needs new uploads, but a clean CPU image remains clean.
            entry.texture = null;
        }
    }

    /** Release a named asset's resident GPU resource and CPU image; absent IDs are harmless. */
    remove(identifier) {
        // Read the current entry before deleting its registration.
        const entry = this.entries.get(identifier);
        // A removed/missing asset has no resources left to release.
        if (!entry) {
            // Repeated cleanup intentionally does nothing.
            return;
        }
        // Lost contexts already invalidate GPU handles, so skip deletion in that state.
        if (entry.texture && !this.worldRenderer.contextLost) {
            // Free the texture owned by this asset rather than waiting for browser collection.
            this.renderer.graphics.deleteTexture(entry.texture);
        }
        // Removing the entry releases the generator and CPU canvas references too.
        this.entries.delete(identifier);
    }

    /** Release every asset during Directory teardown without adding another scheduler. */
    dispose() {
        // “of” visits identifier values; deleting the current Map entry permits the next value.
        // Stop when all registered asset keys have been visited and removed.
        for (const identifier of this.entries.keys()) {
            // Use the same resource-release path as ordinary asset unloading.
            this.remove(identifier);
        }
    }
}
