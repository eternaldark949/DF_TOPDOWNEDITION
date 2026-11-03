/**
 * BASEMENT GEOMETRY — one position/height/shape vocabulary for physics and visuals.
 * X and Y locate an element on the ground; Z is its bottom elevation. Height extends
 * upward from Z. Box width/depth and circle radius are world units, not image pixels.
 * Angles use radians. Geometry is immutable so changing it cannot silently stale an index.
 */
class WorldGeometry {
    /** Validate a footprint and vertical extent; return a frozen, explicit descriptor. */
    static create(definition = {}) {
        // Default geometry is a box rather than a game-specific character or vehicle.
        const shape = definition.shape ?? 'box';
        // Only implemented shapes may enter the shared physics/rendering contract.
        if (!['box', 'circle', 'plane', 'surface'].includes(shape)) {
            // Reject unsupported geometry instead of quietly drawing/colliding it differently.
            throw new Error(`Unsupported geometry shape: ${shape}`);
        }
        // A surface is an explicit triangle mesh for artwork, not an implied collision volume.
        if (shape === 'surface') {
            // Validate immutable local XYZ/UV corners through the dedicated surface contract.
            return WorldGeometry.surface(definition);
        }
        // A plane is a flat rectangular surface with no vertical thickness.
        const height = shape === 'plane' ? 0 : (definition.height ?? 24);
        // Store all dimensions explicitly; radius is used only for circular footprints.
        const geometry = {
            // Shared shape identifier understood by both physics and surface generation.
            shape,
            // Horizontal size of a rectangular footprint before rotation.
            width: definition.width ?? 24,
            // Ground-plane depth of a rectangular footprint before rotation.
            depth: definition.depth ?? 24,
            // Circular footprint radius; the physics test uses a true circle.
            radius: definition.radius ?? 12,
            // Vertical extent above the transform's bottom Z elevation.
            height
        };
        // Inspect each positive dimension by name; “of” reads name values, not array keys.
        for (const name of ['width', 'depth', 'radius']) {
            // Every stored dimension must be finite and strictly positive.
            if (!Number.isFinite(geometry[name]) || geometry[name] <= 0) {
                // A degenerate footprint would undermine both contact tests and rendering.
                throw new RangeError(`${name} must be a finite positive world dimension.`);
            }
        }
        // Volumes need positive height; only explicitly declared planes may have zero height.
        if (!Number.isFinite(height) || height < 0 || (shape !== 'plane' && height === 0)) {
            // Explain the supported surface/volume distinction to callers.
            throw new RangeError('Volume height must be positive; a plane has zero height.');
        }
        // Freeze prevents direct dimension edits from bypassing geometry-change notifications.
        return Object.freeze(geometry);
    }

    /** Validate visual-only local triangle corners [X,Y,Z,U,V] and return a frozen descriptor. */
    static surface(definition) {
        // Each consecutive three corners describes one triangle, with normalized artwork U/V.
        const suppliedVertices = definition.vertices;
        // Reject missing/incomplete geometry before it reaches indexes or GPU uploads.
        if (!Array.isArray(suppliedVertices) || suppliedVertices.length < 3 || suppliedVertices.length % 3 !== 0) {
            // No fan triangulation or approximate collision fallback is inferred for arbitrary meshes.
            throw new TypeError('Surface vertices must contain complete triangles.');
        }
        // Own copied corner arrays so external mutation cannot stale physical/visual bounds.
        const vertices = [];
        // Local Z starts at zero; the element transform supplies its actual bottom elevation.
        let height = 0;
        // “of” supplies corner values in triangle order, stopping after the input array.
        for (const vertex of suppliedVertices) {
            // Every corner must explicitly provide three spatial and two texture coordinates.
            if (!Array.isArray(vertex) || vertex.length !== 5 || !vertex.every(Number.isFinite) || vertex[2] < 0) {
                // Reject invalid geometry instead of letting NaN or negative local height enter bounds.
                throw new TypeError('Surface corners require finite X,Y,nonnegative Z,U,V.');
            }
            // Retain the greatest actual local elevation for the shared scene height bounds.
            height = Math.max(height, vertex[2]);
            // Copy and freeze this corner; const alone would not freeze an array object.
            vertices.push(Object.freeze(vertex.slice()));
        }
        // A face normal expresses which side receives physical direct illumination.
        const normal = definition.normal ?? [0, 0, 1];
        // Normals must contain a real finite direction rather than zero length.
        if (!Array.isArray(normal) || normal.length !== 3 || !normal.every(Number.isFinite) || Math.hypot(...normal) < 0.000001) {
            // Report unsupported direction data at declaration time.
            throw new TypeError('A surface normal needs three finite nonzero direction components.');
        }
        // Return the same immutable geometry vocabulary used by scene transforms and visibility.
        return Object.freeze({
            // Explicit visual triangles intentionally have no generic physical-volume solver.
            shape: 'surface',
            // Width is unused for this mesh; actual extents come from its supplied vertices.
            width: 1,
            // Depth is likewise measured from actual corners by bounds().
            depth: 1,
            // Radius is unused but remains explicit for the shared descriptor interface.
            radius: 1,
            // Highest local corner above the transform's physical bottom elevation.
            height,
            // Immutable triangle corners include normalized image coordinates.
            vertices: Object.freeze(vertices),
            // Retain a copied direction so later external edits cannot alter shading silently.
            normal: Object.freeze(normal.slice())
        });
    }

    /** Generate a counterclockwise world footprint; circles use 20 visual segments only. */
    static footprint(element) {
        // Read the same geometry object that physical contact tests use.
        const geometry = element.geometry;
        // Cache the actual transform, not a separately maintained visual position.
        const transform = element.transform;
        // Accumulate world X/Y coordinates for sides and top triangulation.
        const points = [];
        // Explicit triangle surfaces use their real local XY corners for world-ground bounds.
        if (geometry.shape === 'surface') {
            // “of” visits each corner value and stops after all triangle corners, including repeats.
            for (const vertex of geometry.vertices) {
                // Rotate local X/Y, then translate through the same shared world transform.
                points.push([
                    // Horizontal world coordinate of this actual surface corner.
                    transform.positionX + vertex[0] * Math.cos(transform.angle) - vertex[1] * Math.sin(transform.angle),
                    // Ground-depth world coordinate of the same corner.
                    transform.positionY + vertex[0] * Math.sin(transform.angle) + vertex[1] * Math.cos(transform.angle)
                ]);
            }
            // The mesh is already triangulated; do not replace it with a rectangle or circle.
            return points;
        }
        // Circle visuals approximate a circle; physical circle tests remain analytical.
        if (geometry.shape === 'circle') {
            // Visit segment indices zero through nineteen, advancing once per corner.
            // The count divides one complete revolution into equal angular steps.
            for (let segmentIndex = 0; segmentIndex < 20; segmentIndex += 1) {
                // Add orientation so an attached material rotates with the element.
                const angle = segmentIndex / 20 * Math.PI * 2 + transform.angle;
                // Append the current circumference point in world coordinates.
                points.push([transform.positionX + Math.cos(angle) * geometry.radius, transform.positionY + Math.sin(angle) * geometry.radius]);
            }
        } else {
            // Visit four local corners in counterclockwise mathematical X/Y order.
            // “of” retrieves each [xSign, ySign] pair; destructuring names its two values.
            for (const [horizontalSign, verticalSign] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                // Half-extents place the element origin at the center of its footprint.
                const localX = horizontalSign * geometry.width / 2;
                // The second local axis lies on the ground, not vertically up the wall.
                const localY = verticalSign * geometry.depth / 2;
                // Rotate the corner around the element's origin, then translate into world space.
                points.push([
                    // Rotation preserves the footprint's true oriented width.
                    transform.positionX + localX * Math.cos(transform.angle) - localY * Math.sin(transform.angle),
                    // Apply the corresponding rotation to the ground-depth coordinate.
                    transform.positionY + localX * Math.sin(transform.angle) + localY * Math.cos(transform.angle)
                ]);
            }
        }
        // Return generated coordinates; scene caches this until geometry/transform changes.
        return points;
    }

    /** Return physical ground bounds, independent of camera projection and emission. */
    static bounds(element) {
        // A circle's bounds can be obtained exactly without polygon approximation.
        if (element.geometry.shape === 'circle') {
            // Use the true radius around the shared transform's center.
            return {
                // Leftmost possible physical point.
                minimumX: element.transform.positionX - element.geometry.radius,
                // Farthest-back possible physical point.
                minimumY: element.transform.positionY - element.geometry.radius,
                // Rightmost possible physical point.
                maximumX: element.transform.positionX + element.geometry.radius,
                // Farthest-forward possible physical point.
                maximumY: element.transform.positionY + element.geometry.radius
            };
        }
        // Start bounds at infinities so the first actual corner establishes each limit.
        const bounds = { minimumX: Infinity, minimumY: Infinity, maximumX: -Infinity, maximumY: -Infinity };
        // “of” visits each rotated footprint point, stopping after all corners are measured.
        for (const point of WorldGeometry.footprint(element)) {
            // Extend the minimum horizontal extent.
            bounds.minimumX = Math.min(bounds.minimumX, point[0]);
            // Extend the minimum ground-depth extent.
            bounds.minimumY = Math.min(bounds.minimumY, point[1]);
            // Extend the maximum horizontal extent.
            bounds.maximumX = Math.max(bounds.maximumX, point[0]);
            // Extend the maximum ground-depth extent.
            bounds.maximumY = Math.max(bounds.maximumY, point[1]);
        }
        // Return one bounds vocabulary shared by every spatial-index caller.
        return bounds;
    }

    /** Parse #rrggbb into normalized RGB channels; reject unsupported transparency explicitly. */
    static color(value) {
        // This first opaque-surface renderer intentionally accepts only six-digit colors.
        if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
            // Do not silently flatten transparent materials into opaque geometry.
            throw new TypeError('Surface colors use opaque #rrggbb strings in this foundation.');
        }
        // Collect red, green, and blue in the order the GPU expects.
        const channels = [];
        // “of” visits the three channel-start positions, stopping after offsets 1, 3, and 5.
        // Offset zero is the # marker; each following pair contains one hexadecimal channel.
        for (const offset of [1, 3, 5]) {
            // Read exactly two characters for the current red/green/blue channel.
            const channelText = value.slice(offset, offset + 2);
            // Parse base sixteen, converting 00..ff into an integer from zero through 255.
            const channelValue = parseInt(channelText, 16);
            // Normalize that integer into the GPU's zero-to-one color range.
            channels.push(channelValue / 255);
        }
        // Return the ordered normalized RGB values without changing caller state.
        return channels;
    }

    /** Validate a surface material; emission remains attached to geometry, never a late overlay. */
    static material(definition = {}) {
        // Validate optional artwork shade RGBA before freezing its copied channels.
        const artworkShade = definition.artworkShade ?? [0, 0, 0, 0];
        // Shade overlays are normalized color plus coverage, not a separate emission source.
        if (!Array.isArray(artworkShade) || artworkShade.length !== 4 || !artworkShade.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)) {
            // Keep unsupported shade input out of GPU attributes and shared scene caches.
            throw new TypeError('Artwork shade requires four normalized RGBA channels.');
        }
        // Explicit image addresses must remain strings; alpha cutoff counts normalized coverage.
        if ((definition.artwork != null && typeof definition.artwork !== 'string') || (definition.emissionArtwork != null && typeof definition.emissionArtwork !== 'string') || !Number.isFinite(definition.alphaCutoff ?? 0.5) || (definition.alphaCutoff ?? 0.5) < 0 || (definition.alphaCutoff ?? 0.5) > 1) {
            // Reject malformed material interfaces before any asset or GPU resource lookup.
            throw new TypeError('Artwork IDs must be strings and alpha cutoff must be between zero and one.');
        }
        // Freeze the descriptor and its channel arrays to prevent untracked visual edits.
        return Object.freeze({
            // Reflective base color participates in ambient and direct surface lighting.
            color: Object.freeze(WorldGeometry.color(definition.color ?? (definition.artwork ? '#ffffff' : '#cebbff'))),
            // Emission is added only for fragments that pass the same surface depth test.
            emission: Object.freeze(WorldGeometry.color(definition.emission ?? '#000000')),
            // Original painted face tint, stored per vertex so different wall normals can batch.
            artworkShade: Object.freeze(artworkShade.slice()),
            // Optional named cached image, looked up in the Directory artwork system at draw time.
            artwork: definition.artwork ?? null,
            // Optional light image sampled on this same depth-tested surface at night.
            emissionArtwork: definition.emissionArtwork ?? null,
            // Original painted art can preserve its authored RGB without extra ambient shading.
            unlit: definition.unlit === true,
            // Image alpha below this threshold rejects a fragment; this is cutout, not transparency.
            alphaCutoff: definition.alphaCutoff ?? 0.5
        });
    }
}

/** A shared transform notifies the scene when position or rotation changes. */
class WorldTransform {
    /** Store initial finite coordinates and a callback; setup itself sends no notifications. */
    constructor(definition, onChange) {
        // Keep mutable values private so public assignments can maintain spatial membership.
        this.values = [definition.positionX ?? 0, definition.positionY ?? 0, definition.positionZ ?? 0, definition.angle ?? 0];
        // Validate all supplied coordinates before they enter the scene.
        if (!this.values.every(Number.isFinite)) {
            // Prevent NaN geometry from reaching collision or GPU buffers.
            throw new RangeError('World transform coordinates and angle must be finite.');
        }
        // The owner receives one notification for each completed transform change.
        this.onChange = onChange;
    }

    /** Read the current horizontal world coordinate, with no copied visual state. */
    get positionX() {
        // Return the first stored coordinate.
        return this.values[0];
    }

    /** Assign X through the notifying path, preserving the current Y/Z coordinates. */
    set positionX(value) {
        // Reuse atomic position validation and spatial synchronization.
        this.setPosition(value, this.positionY, this.positionZ);
    }

    /** Read the current ground-depth coordinate. */
    get positionY() {
        // Return the second stored coordinate.
        return this.values[1];
    }

    /** Assign Y and automatically update scene indexes. */
    set positionY(value) {
        // Keep the other world coordinates unchanged.
        this.setPosition(this.positionX, value, this.positionZ);
    }

    /** Read the bottom elevation above the world origin. */
    get positionZ() {
        // Return the third stored coordinate.
        return this.values[2];
    }

    /** Assign bottom elevation and notify both physical and visual indexing. */
    set positionZ(value) {
        // Use one shared Z value instead of separate physical/rendering heights.
        this.setPosition(this.positionX, this.positionY, value);
    }

    /** Read orientation around the world's vertical axis, in radians. */
    get angle() {
        // Return the fourth stored value.
        return this.values[3];
    }

    /** Assign orientation and refresh rotated shape bounds. */
    set angle(value) {
        // Reject invalid rotation before changing existing valid geometry.
        if (!Number.isFinite(value)) {
            // Report invalid public input at its source.
            throw new RangeError('World angle must be finite.');
        }
        // Save the new orientation used by contact shapes and render meshes.
        this.values[3] = value;
        // Notify the scene that footprint and projected bounds may have changed.
        this.onChange();
    }

    /** Change all coordinates atomically and notify once; return this transform for callers. */
    setPosition(positionX, positionY, positionZ) {
        // Validate the complete update before assigning any coordinate.
        if (![positionX, positionY, positionZ].every(Number.isFinite)) {
            // Keep prior position and index membership intact on invalid input.
            throw new RangeError('World position must contain finite numbers.');
        }
        // Store the horizontal coordinate.
        this.values[0] = positionX;
        // Store the ground-depth coordinate.
        this.values[1] = positionY;
        // Store the shared bottom elevation.
        this.values[2] = positionZ;
        // Notify once after all three coordinates describe a complete position.
        this.onChange();
        // Return the live transform rather than a position snapshot.
        return this;
    }
}
