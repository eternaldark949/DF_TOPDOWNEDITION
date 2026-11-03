/**
 * PENTHOUSE ASSET TOOL — install a prepared asset's explicit surfaces and supported
 * solid volumes through the ordinary scene API. This knows no hotel, shop, or roof
 * names. Image pixels and local physical coordinates come from the asset definition.
 * Triangles are generated once at installation; moving the camera changes GPU uniforms.
 * The owner removes the instance to release its scene registrations, while shared image
 * resources remain in the separate artwork cache for other placed instances.
 */
class TexturedAssetInstance {
    /** Install prepared local surfaces at a world offset; return this owning instance. */
    constructor(directory, identifier, definition, positionX = 0, positionY = 0) {
        // Use the same scene system as all other physical/visual elements.
        this.scene = directory.systems.get('scene');
        // Retain only registrations belonging to this particular placed instance.
        this.identifiers = [];
        // Finally removes partial registrations if one unsupported asset declaration throws.
        try {
            // “of” supplies prepared surface values and stops after every asset surface.
            for (const surface of definition.surfaces) {
                // Actual minimum Z supplies the element's physical bottom elevation.
                const bottom = Math.min(...surface.corners.map((corner) => corner[2]));
                // Build static triangles with normalized image coordinates once, before frame scheduling.
                const vertices = TexturedAssetInstance.triangulate(surface.corners);
                // “of” visits generated corner arrays and ends after all complete triangles.
                for (const vertex of vertices) {
                    // Store local height above the shared transform instead of a second visual Z.
                    vertex[2] -= bottom;
                }
                // Prefix local asset names with the placed instance's unique scene address.
                const elementIdentifier = `${identifier}.${surface.id}`;
                // Register geometry/materials through ordinary engine-owned visibility and depth.
                this.scene.createElement(elementIdentifier, {
                    // Explicit triangle artwork requires an intentional visual-only declaration.
                    shape: 'surface',
                    // The instance's horizontal world placement offsets its local asset coordinates.
                    positionX,
                    // The instance's ground-depth placement uses the same offset convention.
                    positionY,
                    // The lowest actual source corner becomes this surface's physical elevation.
                    positionZ: bottom,
                    // Triangle corners contain local XYZ plus normalized image U/V.
                    vertices,
                    // The asset supplies the real physical face direction for lighting.
                    normal: surface.normal,
                    // Arbitrary triangle meshes do not silently receive approximate box collision.
                    body: false,
                    // Cutout decoration may intentionally omit source-shadow casting.
                    castsShadow: surface.castsShadow,
                    // Source image IDs resolve through the shared artwork resource system.
                    material: surface.material
                });
                // Keep this exact registration for instance-specific cleanup.
                this.identifiers.push(elementIdentifier);
            }
            // “of” supplies supported solid-volume definitions, stopping after this asset's bodies.
            for (const volume of definition.collisions) {
                // Keep body addresses in the same placed-instance namespace as visible surfaces.
                const volumeIdentifier = `${identifier}.${volume.id}`;
                // Original section dimensions/heights feed ordinary box contacts, not type-pair rules.
                this.scene.createElement(volumeIdentifier, {
                    // Copy the prepared source volume dimensions and physical elevation.
                    ...volume,
                    // Apply the same world placement offset as this instance's visible surfaces.
                    positionX: positionX + volume.positionX,
                    // Translate the ground-depth coordinate consistently with the visible asset.
                    positionY: positionY + volume.positionY,
                    // Visible triangles already provide the detailed exterior; this is its solid volume.
                    visible: false,
                    // Default static body response makes new actors collide without new handlers.
                    body: {motion: 'static'}
                });
                // Own body removal just as explicitly as visible-surface removal.
                this.identifiers.push(volumeIdentifier);
            }
        } catch (error) {
            // Release every successful earlier registration before exposing the setup failure.
            this.dispose();
            // Preserve the original declaration error rather than pretending a partial asset is complete.
            throw error;
        }
    }

    /** Interpolate one XYZ/UV corner componentwise; return a new mutable corner array. */
    static interpolate(first, second, fraction) {
        // Build a new coordinate array so interpolation cannot mutate the asset definition.
        const result = [];
        // Start at component zero, stop before five, and advance once per X/Y/Z/U/V component.
        for (let componentIndex = 0; componentIndex < 5; componentIndex += 1) {
            // Blend this named slot by the requested fraction along the source edge.
            result.push(first[componentIndex] + (second[componentIndex] - first[componentIndex]) * fraction);
        }
        // Return a complete spatial/texture corner for triangle construction.
        return result;
    }

    /** Triangulate a convex flat polygon, or statically subdivide a rising artwork quad. */
    static triangulate(corners) {
        // Distinct corner heights identify walls/bands whose radial projection changes with elevation.
        const rising = corners.length === 4 && corners.some((corner) => corner[2] !== corners[0][2]);
        // A flat convex polygon needs only a fan from its first corner.
        if (!rising) {
            // Collect complete corner triplets in source polygon order.
            const vertices = [];
            // Start at corner one, stop before the last corner, and advance one fan sector each time.
            for (let cornerIndex = 1; cornerIndex < corners.length - 1; cornerIndex += 1) {
                // Copy corners because the caller will normalize their local Z coordinates.
                vertices.push(corners[0].slice(), corners[cornerIndex].slice(), corners[cornerIndex + 1].slice());
            }
            // Horizontal roofs stay exact under the radial projection's single-height scale.
            return vertices;
        }
        // Source quads pair one starting edge with the opposite ending edge; either height order is valid.
        const horizontalSpan = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
        // Read actual physical height rather than the image's pixel height.
        const verticalSpan = Math.abs(corners[3][2] - corners[0][2]);
        // Forty-world-unit columns retain the original wall mapping's horizontal resolution.
        const columns = Math.max(1, Math.ceil(horizontalSpan / 40));
        // Fourteen-world-unit rows improve on the original 28-world-unit vertical tile budget.
        const rows = Math.max(1, Math.ceil(verticalSpan / 14));
        // Retain generated geometry once; it is not regenerated for camera changes.
        const vertices = [];
        // Start at row zero, stop before rows, and advance once per vertical strip.
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
            // Interpolate the left edge's lower corner at this row's starting fraction.
            const leftBottom = TexturedAssetInstance.interpolate(corners[0], corners[3], rowIndex / rows);
            // Interpolate the corresponding right-edge lower corner.
            const rightBottom = TexturedAssetInstance.interpolate(corners[1], corners[2], rowIndex / rows);
            // The next row fraction supplies this strip's left upper corner.
            const leftTop = TexturedAssetInstance.interpolate(corners[0], corners[3], (rowIndex + 1) / rows);
            // Obtain the same upper fraction on the right edge.
            const rightTop = TexturedAssetInstance.interpolate(corners[1], corners[2], (rowIndex + 1) / rows);
            // For each row, restart column zero; stop before columns and advance one grid cell.
            for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
                // Cell lower-left corner contains both spatial and image coordinates.
                const first = TexturedAssetInstance.interpolate(leftBottom, rightBottom, columnIndex / columns);
                // Advance one horizontal fraction to obtain the lower-right corner.
                const second = TexturedAssetInstance.interpolate(leftBottom, rightBottom, (columnIndex + 1) / columns);
                // Use the same right fraction on the upper row edge.
                const third = TexturedAssetInstance.interpolate(leftTop, rightTop, (columnIndex + 1) / columns);
                // Complete this cell with its upper-left corner.
                const fourth = TexturedAssetInstance.interpolate(leftTop, rightTop, columnIndex / columns);
                // Two triangles cover the cell without converting Canvas paths or gradients at runtime.
                vertices.push(first.slice(), second.slice(), third.slice(), first.slice(), third.slice(), fourth.slice());
            }
        }
        // Return retained installation-time triangles to the shared scene geometry constructor.
        return vertices;
    }

    /** Remove only this placed instance's elements/bodies; leave shared image resources reusable. */
    dispose() {
        // “of” supplies identifier values and ends after all owned registrations are removed.
        for (const identifier of this.identifiers) {
            // Ordinary removal releases body contacts and visual/physical index membership together.
            this.scene.removeElement(identifier);
        }
        // Release identifier references and make repeated disposal harmless.
        this.identifiers.length = 0;
    }
}
