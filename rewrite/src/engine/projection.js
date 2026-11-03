/**
 * BASEMENT PROJECTION — one camera calculation shared by GPU drawing and public
 * coordinate tools. Oblique mode preserves the primitive studies. Radial mode
 * preserves the original game's top-down height lean: elevated points move away
 * from the camera center in both ground axes. All surfaces use the same rule.
 * Heights remain physical world Z; this module never changes collision geometry.
 */
class WorldProjection {
    /** Return the zoom-dependent camera altitude used by the original game's lean. */
    static altitude(camera) {
        // Zooming out raises the camera, with the original 0.7-to-3.2 altitude bounds.
        const zoomFactor = Math.max(0.7, Math.min(3.2, 1 / camera.zoom));
        // Camera height is world units at zoom one, not a CSS-pixel screen displacement.
        return camera.altitude * zoomFactor;
    }

    /** Return radial enlargement at physical Z; below-ground positions use the ground scale. */
    static scale(camera, height) {
        // Obtain the same altitude that the GPU receives for this frame.
        const altitude = WorldProjection.altitude(camera);
        // The original upper clamp keeps surfaces away from the projection singularity.
        const clampedHeight = Math.min(Math.max(0, height), altitude * 0.86);
        // Optional camera-wide style emphasis leaves the shared physical geometry unchanged.
        return 1 + (altitude / (altitude - clampedHeight) - 1) * camera.heightExaggeration;
    }

    /** Project world XYZ into CSS pixels and report the depth ordering used by this camera. */
    static project(renderer, positionX, positionY, positionZ) {
        // Read the actual camera, not a copied position that could become stale.
        const camera = renderer.camera;
        // Radial mode projects from a camera looking vertically toward the ground plane.
        if (camera.projection === 'radial') {
            // One physical height has one scale everywhere in this view.
            const scale = WorldProjection.scale(camera, positionZ);
            // Return a fresh screen point without mutating the world transform.
            return {
                // Enlarge the ground offset from the camera before converting to CSS pixels.
                positionX: (positionX - camera.positionX) * scale * camera.zoom + renderer.viewportWidth / 2 + camera.screenOffsetX,
                // Height expands the vertical offset too, matching the existing game's lean.
                positionY: (positionY - camera.positionY) * scale * camera.zoom + renderer.viewportHeight / 2 + camera.screenOffsetY,
                // Higher surfaces face a top-down camera; physical Z resolves their depth.
                cameraDepth: positionZ
            };
        }
        // The original foundation's oblique mode shifts physical height upward on screen.
        return {
            // Oblique projection leaves the world X axis unchanged before view centering.
            positionX: (positionX - camera.positionX) * camera.zoom + renderer.viewportWidth / 2 + camera.screenOffsetX,
            // Apply the shared upward displacement per physical world Z unit.
            positionY: (positionY - positionZ * renderer.basement.configuration.heightProjectionScale - camera.positionY) * camera.zoom + renderer.viewportHeight / 2 + camera.screenOffsetY,
            // Physical Y and Z together provide this oblique camera's perpendicular depth.
            cameraDepth: (positionY - camera.positionY) * renderer.basement.configuration.heightProjectionScale + positionZ
        };
    }

    /** Return conservative CSS bounds of a point source's world-space influence cube. */
    static lightBounds(renderer, light) {
        // Start beyond every finite coordinate so the first projected corner establishes each extent.
        const bounds = {minimumX: Infinity, minimumY: Infinity, maximumX: -Infinity, maximumY: -Infinity};
        // “of” supplies the lower and upper X extremes, stopping after both influence sides.
        for (const positionX of [light.positionX - light.radius, light.positionX + light.radius]) {
            // For each X, visit both ground-depth extremes of the physical influence cube.
            for (const positionY of [light.positionY - light.radius, light.positionY + light.radius]) {
                // Each ground corner has two elevation extremes, so eight total corners are projected.
                for (const positionZ of [light.positionZ - light.radius, light.positionZ + light.radius]) {
                    // Both camera modes use monotone height displacement/scale within these bounds.
                    const point = WorldProjection.project(renderer, positionX, positionY, positionZ);
                    // Extend the leftmost source influence visible in CSS coordinates.
                    bounds.minimumX = Math.min(bounds.minimumX, point.positionX);
                    // Extend the uppermost influence under this camera's actual projection.
                    bounds.minimumY = Math.min(bounds.minimumY, point.positionY);
                    // Extend the rightmost influence consistently.
                    bounds.maximumX = Math.max(bounds.maximumX, point.positionX);
                    // Extend the lowest influence, including radial height enlargement.
                    bounds.maximumY = Math.max(bounds.maximumY, point.positionY);
                }
            }
        }
        // Return a conservative cube bound; the shader still rejects points outside the true sphere.
        return bounds;
    }

    /** Reconstruct ground XY from CSS pixels on an explicitly chosen physical Z plane. */
    static unproject(renderer, screenX, screenY, height) {
        // Undo CSS centering/zoom before applying the selected height model.
        const relativeX = (screenX - renderer.viewportWidth / 2 - renderer.camera.screenOffsetX) / renderer.camera.zoom;
        // Obtain the corresponding vertical offset in projected world units.
        const relativeY = (screenY - renderer.viewportHeight / 2 - renderer.camera.screenOffsetY) / renderer.camera.zoom;
        // Radial projection enlarges both axes, so inversion divides both by the same scale.
        if (renderer.camera.projection === 'radial') {
            // Use the requested physical plane, because one screen point alone has no unique Z.
            const scale = WorldProjection.scale(renderer.camera, height);
            // Return the reconstructed coordinates without changing input/camera state.
            return {
                // Restore the horizontal offset before adding the camera's ground position.
                positionX: renderer.camera.positionX + relativeX / scale,
                // Restore the corresponding vertical ground offset.
                positionY: renderer.camera.positionY + relativeY / scale,
                // Preserve the caller's explicitly selected physical elevation.
                positionZ: height
            };
        }
        // Oblique inversion reverses the vertical height displacement only.
        return {
            // Restore horizontal ground position directly from the projected offset.
            positionX: renderer.camera.positionX + relativeX,
            // Put back the physical height removed by oblique projection.
            positionY: renderer.camera.positionY + relativeY + height * renderer.basement.configuration.heightProjectionScale,
            // Keep the chosen physical plane explicit in the result.
            positionZ: height
        };
    }
}
