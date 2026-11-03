/**
 * RENDER GEOMETRY LIBRARY — convert shared element footprints/heights into triangles.
 * This helper owns reusable mesh data only. GPU context, visibility, lighting, and
 * scene registration remain in their respective systems. Weak keys permit unloading.
 */
class WorldSurfaceMesh {
    /** Create a cache that does not keep removed scene elements alive. */
    constructor() {
        // Cache entries use tracked geometry revisions and immutable material references.
        this.meshCache = new WeakMap();
    }

    /** Add one triangle's attributes to a flat GPU buffer, using an actual world-space normal. */
    appendTriangle(output, first, second, third, normal, material) {
        // “of” visits the three vertex coordinate arrays in triangle order, then stops.
        for (const point of [first, second, third]) {
            // Store eighteen float attributes in the shader's explicitly documented layout.
            output.push(...point, ...normal, ...material.color, ...material.emission, 0, 0, ...material.artworkShade);
        }
    }

    /** Generate reusable world triangles for one extruded footprint or plane; no role branches. */
    build(element) {
        // Retrieve only this element's previously generated world triangles.
        const cached = this.meshCache.get(element);
        // Position/shape changes or either material replacement require regeneration.
        if (cached && cached.revision === element.geometryRevision && cached.material === element.material && cached.topMaterial === element.topMaterial) {
            // Reuse unchanged static geometry for camera and light views alike.
            return cached.vertices;
        }
        // Artwork meshes retain their explicit local triangle geometry rather than box approximation.
        if (element.geometry.shape === 'surface') {
            // Accumulate the same interleaved XYZ/normal/color/emission/UV format as ordinary meshes.
            const vertices = [];
            // Read orientation once to transform both coordinates and the face's normal.
            const cosine = Math.cos(element.transform.angle);
            // The corresponding sine supplies the other planar rotation term.
            const sine = Math.sin(element.transform.angle);
            // Read the declared local direction without copying changing parent state.
            const localNormal = element.geometry.normal;
            // Rotate the normal with its owning surface so direct light remains physically oriented.
            const normal = [localNormal[0] * cosine - localNormal[1] * sine, localNormal[0] * sine + localNormal[1] * cosine, localNormal[2]];
            // “of” supplies triangle corner values in order and stops after every explicit corner.
            for (const vertex of element.geometry.vertices) {
                // Put this actual corner into world XYZ through the shared element transform.
                vertices.push(
                    // Rotated horizontal coordinate plus the element's world X.
                    element.transform.positionX + vertex[0] * cosine - vertex[1] * sine,
                    // Rotated ground-depth coordinate plus the element's world Y.
                    element.transform.positionY + vertex[0] * sine + vertex[1] * cosine,
                    // Shared physical elevation; there is no separate visual height.
                    element.transform.positionZ + vertex[2],
                    // Surface direction for illumination, followed by material RGB values.
                    ...normal, ...element.material.color, ...element.material.emission,
                    // Normalized image coordinates choose pixels from the cached artwork.
                    vertex[3], vertex[4],
                    // Preserve source face shading without allocating another texture per normal.
                    ...element.material.artworkShade
                );
            }
            // Weak caching releases removed surfaces once no feature retains their element objects.
            this.meshCache.set(element, {revision: element.geometryRevision, material: element.material, topMaterial: element.topMaterial, vertices});
            // Return retained world triangles for camera and source visibility alike.
            return vertices;
        }
        // Shared transforms define the lower elevation for every side face.
        const bottom = element.transform.positionZ;
        // Geometry height defines the upper surface used by both rendering and collision.
        const top = bottom + element.geometry.height;
        // Start the interleaved vertex list for this element.
        const output = [];
        // Cache footprint corners in their already computed world order.
        const footprint = element.footprint;
        // Triangulate a convex top as a fan: vertex zero, current corner, next corner.
        // Begin at corner one, stop before the final corner, and advance one corner each time.
        for (let cornerIndex = 1; cornerIndex < footprint.length - 1; cornerIndex += 1) {
            // Every top vertex lies at the same actual world Z elevation.
            this.appendTriangle(output, [...footprint[0], top], [...footprint[cornerIndex], top], [...footprint[cornerIndex + 1], top], [0, 0, 1], element.topMaterial);
        }
        // A plane intentionally has no side walls or hidden thickness.
        if (element.geometry.shape === 'plane') {
            // Keep the same plane triangles available to both world and shadow submission.
            this.meshCache.set(element, { revision: element.geometryRevision, material: element.material, topMaterial: element.topMaterial, vertices: output });
            // Return only its top-surface triangles.
            return output;
        }
        // Visit every footprint edge, increasing the index once per side face.
        // Modulo below wraps the final edge back to corner zero.
        for (let edgeIndex = 0; edgeIndex < footprint.length; edgeIndex += 1) {
            // Obtain this edge's first world-space corner.
            const first = footprint[edgeIndex];
            // Obtain the next corner, wrapping at the end of the polygon.
            const second = footprint[(edgeIndex + 1) % footprint.length];
            // Edge length normalizes the outward face direction.
            const length = Math.hypot(second[0] - first[0], second[1] - first[1]);
            // Counterclockwise footprints have outward normals on each edge's right side.
            const normal = [(second[1] - first[1]) / length, -(second[0] - first[0]) / length, 0];
            // Split the rectangular wall into its first triangle.
            this.appendTriangle(output, [...first, bottom], [...second, bottom], [...second, top], normal, element.material);
            // Complete the same wall rectangle with a second triangle.
            this.appendTriangle(output, [...first, bottom], [...second, top], [...first, top], normal, element.material);
        }
        // Retain completed surface triangles without retaining removed scene elements strongly.
        this.meshCache.set(element, { revision: element.geometryRevision, material: element.material, topMaterial: element.topMaterial, vertices: output });
        // Return world geometry; projection and visibility belong to the GPU stage.
        return output;
    }

}
