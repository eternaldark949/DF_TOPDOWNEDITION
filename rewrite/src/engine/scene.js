/**
 * DIRECTORY SCENE SYSTEM — own declared world elements, shared geometry, and indexes.
 * Adding an ordinary element automatically registers its body and visible geometry.
 * No character/vehicle/building identity is inspected. Materials and collision
 * exceptions describe an element; they do not install pair-specific handlers.
 */
class SceneSystem {
    /** Store services during connect(); construction does not create browser resources. */
    constructor(basement) {
        // Shared projection settings belong to the foundational coordinate contract.
        this.basement = basement;
        // Keep only world elements here; Directory.elements can also contain other values.
        this.worldElements = new Map();
        // Lights are scene declarations, separate from luminous surface materials.
        this.lights = new NamedLibrary('scene lights');
        // Parent element IDs map to light IDs for automatic transform updates and cleanup.
        this.attachedLights = new Map();
        // Increment when visual content changes so the renderer can reuse static buffers.
        this.revision = 0;
    }

    /** Connect indexes after Directory construction; no element may be created before this. */
    connect(directory) {
        // Retain the actual Directory for element registration and physics service lookup.
        this.directory = directory;
        // Find the spatial service through its declared Directory address.
        const spatial = directory.systems.get('spatial');
        // Static collision geometry stays indexed until its transform/shape changes.
        this.staticBodies = spatial.createIndex('physics.static');
        // Moving bodies maintain a separate index so static geometry is never rebuilt per tick.
        this.movingBodies = spatial.createIndex('physics.moving');
        // Visual bounds use projected-world coordinates, including Z/height.
        this.visibleGeometry = spatial.createIndex('render.geometry');
        // Shadow rays use actual world-ground geometry, not camera-projected bounds.
        this.shadowGeometry = spatial.createIndex('render.shadows');
        // Light reach is indexed separately from geometry footprints.
        this.lightReach = spatial.createIndex('render.lights');
    }

    /** Create a declarative element; shared position/shape drive both its body and visuals. */
    createElement(identifier, definition = {}) {
        // Duplicate protection is checked before constructing connected resources.
        if (this.directory.elements.entries.has(identifier)) {
            // Prevent collisions with either world or non-world element IDs.
            throw new Error(`elements already contains ${identifier}.`);
        }
        // Validate geometry before any registry receives the element.
        const geometry = WorldGeometry.create(definition);
        // Capture the scene in a descriptive reference for the transform callback.
        const scene = this;
        // Construct the shared element record with explicit ownership.
        const element = {
            // Stable scene/Directory address; physical pairing uses this same identifier.
            identifier,
            // Shared immutable footprint and height descriptor.
            geometry,
            // Null until the notifying transform is installed below.
            transform: null,
            // Null means this element deliberately has no physical body.
            body: null,
            // Visible geometry can be disabled independently from physical solidity.
            visible: definition.visible !== false,
            // Opaque geometry blocks light unless explicitly declared otherwise.
            castsShadow: definition.castsShadow !== false,
            // Default surface appearance; no role-specific rendering rules are present.
            material: WorldGeometry.material(definition.material),
            // A top may have a distinct material, but uses the same physical top elevation.
            topMaterial: WorldGeometry.material(definition.topMaterial ?? definition.material),
            // Previous coordinates support interpolation without changing actual world state.
            previousPosition: [definition.positionX ?? 0, definition.positionY ?? 0, definition.positionZ ?? 0],
            /** Replace dimensions through the tracked path so all affected indexes refresh. */
            setGeometry(nextDefinition) {
                // The geometry property setter validates and synchronizes this replacement.
                this.geometry = nextDefinition;
            }
        };
        // Keep the current immutable geometry behind a tracked public property.
        let currentGeometry = geometry;
        // Accessors allow ordinary property assignment without bypassing automatic index updates.
        Object.defineProperty(element, 'geometry', {
            // Keep the public descriptor visible during ordinary inspection.
            enumerable: true,
            /** Read the geometry currently shared by physics, visibility, and shadows. */
            get() {
                // Return the actual frozen descriptor, not a stale copy.
                return currentGeometry;
            },
            /** Validate a replacement descriptor and notify every dependent scene index. */
            set(nextDefinition) {
                // Build a complete immutable replacement before changing live state.
                const replacement = WorldGeometry.create(nextDefinition);
                // A collision body cannot silently become a zero-thickness visual plane.
                if (element.body && replacement.shape === 'plane') {
                    // Require explicit element recreation without a body for this transition.
                    throw new Error('Recreate the element without a body before changing it into a plane.');
                }
                // Replace the single descriptor used by all geometry consumers.
                currentGeometry = replacement;
                // Update only this object's physical and projected memberships.
                scene.synchronize(element);
            }
        });
        // Visit appearance flag names by value; each accessor captures its own const name.
        // “of” is used instead of property-key enumeration over the array.
        for (const propertyName of ['visible', 'castsShadow']) {
            // Capture this flag's initial declaration inside its accessor closure.
            let currentValue = element[propertyName];
            // Turn direct flag assignments into tracked scene revisions.
            Object.defineProperty(element, propertyName, {
                // Preserve a readable public property during inspection.
                enumerable: true,
                /** Read this element's current appearance flag. */
                get() {
                    // The closure holds the live value for this property only.
                    return currentValue;
                },
                /** Assign the flag and invalidate cached GPU geometry/lighting. */
                set(value) {
                    // Explicit false disables the flag; other values enable it.
                    currentValue = value !== false;
                    // A visibility change must take effect without moving the object.
                    scene.revision += 1;
                }
            });
        }
        // Visit material property names so direct material replacement remains tracked too.
        for (const propertyName of ['material', 'topMaterial']) {
            // Retain this property's already-validated normalized material.
            let currentMaterial = element[propertyName];
            // Expose a setter that accepts the same readable #rrggbb declarations as creation.
            Object.defineProperty(element, propertyName, {
                // Keep materials visible through ordinary property inspection.
                enumerable: true,
                /** Read the current frozen normalized material used by surface generation. */
                get() {
                    // Do not expose a separately copied color/emission state.
                    return currentMaterial;
                },
                /** Validate new base/emission colors and invalidate cached vertex attributes. */
                set(value) {
                    // A failed parse leaves the previous material and revision untouched.
                    currentMaterial = WorldGeometry.material(value);
                    // Rebuild affected rendering buffers on the next normal frame.
                    scene.revision += 1;
                }
            });
        }
        /** Synchronize this element whenever its shared coordinates change. */
        const onTransformChange = () => scene.synchronize(element);
        // Establish one notifying transform, not separate physics and render positions.
        element.transform = new WorldTransform(definition, onTransformChange);
        // Volumes are solid by default; planes are visible surfaces unless explicitly rejected below.
        if (definition.body !== false && geometry.shape !== 'plane') {
            // PhysicsBody validates mass, mode, filtering, and material response centrally.
            element.body = new PhysicsBody(element, definition.body ?? {});
        }
        // A plane is not secretly a volume if a caller explicitly asks for a body.
        if (geometry.shape === 'plane' && definition.body && definition.body !== false) {
            // Ask callers to provide actual slab thickness for collision support.
            throw new Error('Collision surfaces need a box thickness; a plane is visual-only.');
        }
        // Register the element under the standard Directory address.
        this.directory.elements.register(identifier, element);
        // Track world elements without mixing unrelated Directory values into geometry queries.
        this.worldElements.set(identifier, element);
        // Automatically establish physical and visual index membership.
        this.synchronize(element);
        // One engine-owned pass renders every declared surface, without per-feature draw order.
        this.directory.systems.get('worldRenderer').activate();
        // Give callers the same element instance used by every engine service.
        return element;
    }

    /** Update this element's indexes after a tracked change; no full-scene rebuild occurs. */
    synchronize(element) {
        // Removed objects must not reinsert themselves through an old retained reference.
        if (this.worldElements.get(element.identifier) !== element) {
            // A stale reference is harmless to the currently loaded scene.
            return;
        }
        // Compute physical ground bounds from the current shared geometry and transform.
        element.bounds = WorldGeometry.bounds(element);
        // Cache world footprint vertices for rendering until the next tracked change.
        element.footprint = WorldGeometry.footprint(element);
        // Mark this element's cached mesh dirty without invalidating every other static mesh.
        element.geometryRevision = (element.geometryRevision ?? 0) + 1;
        // Read the projection's world-unit vertical displacement scale.
        const heightScale = this.basement.configuration.heightProjectionScale;
        // Visual bounds include the highest corner's projection, not only the ground footprint.
        element.projectedBounds = {
            // This oblique projection preserves horizontal world positions.
            minimumX: element.bounds.minimumX,
            // Top elevation shifts the highest screen extent upward.
            minimumY: element.bounds.minimumY - (element.transform.positionZ + element.geometry.height) * heightScale,
            // The same footprint bounds the visual horizontal extent.
            maximumX: element.bounds.maximumX,
            // Bottom elevation determines the lowest projected screen extent.
            maximumY: element.bounds.maximumY - element.transform.positionZ * heightScale
        };
        // Every element is indexed visually; visibility toggles are checked during rendering.
        this.visibleGeometry.upsert(element.identifier, element, element.projectedBounds);
        // Maintain potential opaque shadow geometry automatically alongside the same footprint.
        this.shadowGeometry.upsert(element.identifier, element, element.bounds);
        // Only elements with bodies participate in physical broad-phase indexes.
        if (element.body) {
            // Motion type determines which collection maintains this body's footprint.
            const index = element.body.motion === 'static' ? this.staticBodies : this.movingBodies;
            // Insert or update only this body, retaining all other static memberships.
            index.upsert(element.identifier, element.body, element.bounds);
            // Physics keeps a separate moving-body collection to avoid scanning every static body.
            this.directory.systems.get('physics').register(element.body);
        }
        // Visit only this owner's attached source IDs; unrelated sources need no scan.
        // “of” supplies each ID value and stops when this owner's Set is exhausted.
        for (const lightIdentifier of this.attachedLights.get(element.identifier) ?? []) {
            // Reindex current parent-relative source coordinates after the transform change.
            this.indexLight(this.lights.get(lightIdentifier));
        }
        // Mark visual buffers dirty; a completely unchanged scene can reuse them.
        this.revision += 1;
    }

    /** Add a point light; coordinates are world units, or local offsets when parent is supplied. */
    createLight(identifier, definition) {
        // An optional parent lets a source follow an element without manual position copying.
        const parent = definition.parent ?? null;
        // Only actual registered elements in this scene may own source attachments.
        if (parent && this.worldElements.get(parent.identifier) !== parent) {
            // Reject foreign or already removed owners before creating source membership.
            throw new Error('A light parent must be an element registered in this scene.');
        }
        // Capture immutable local offsets or fixed world coordinates, depending on parent presence.
        const position = [definition.positionX ?? 0, definition.positionY ?? 0, definition.positionZ ?? 0];
        // Validate required light properties before registering anything.
        if (![...position, definition.radius, definition.intensity ?? 1].every(Number.isFinite) || definition.radius <= 0 || (definition.intensity ?? 1) < 0) {
            // Invalid light data must not reach GPU uniforms or spatial queries.
            throw new RangeError('A point light needs finite coordinates, positive radius, and nonnegative intensity.');
        }
        // Freeze configuration so callers use replaceLight rather than staling light indexes.
        const light = Object.freeze({
            // Stable address for replacement, inspection, or removal.
            identifier,
            // Store ownership metadata for indexed cleanup, or null for an unattached source.
            parentIdentifier: parent?.identifier ?? null,
            /** Read world X from the live parent transform and the stored local offset. */
            get positionX() {
                // Without a parent, this coordinate was declared directly in world space.
                if (!parent) {
                    // Return the fixed source coordinate.
                    return position[0];
                }
                // Rotate the local offset and add the parent's current horizontal position.
                return parent.transform.positionX + position[0] * Math.cos(parent.transform.angle) - position[1] * Math.sin(parent.transform.angle);
            },
            /** Read world Y from the same live parent instead of an initialization-time copy. */
            get positionY() {
                // Unattached sources require no coordinate conversion.
                if (!parent) {
                    // Return the stored world ground-depth coordinate.
                    return position[1];
                }
                // Rotate the local ground offset into the parent's current world frame.
                return parent.transform.positionY + position[0] * Math.sin(parent.transform.angle) + position[1] * Math.cos(parent.transform.angle);
            },
            /** Read world Z using the same physical height convention as attached geometry. */
            get positionZ() {
                // An attached source adds its local elevation to its parent's current bottom Z.
                return parent ? parent.transform.positionZ + position[2] : position[2];
            },
            // Maximum Euclidean distance reached by this light.
            radius: definition.radius,
            // Brightness multiplier before distance and surface-angle attenuation.
            intensity: definition.intensity ?? 1,
            // Shared normalized RGB representation.
            color: Object.freeze(WorldGeometry.color(definition.color ?? '#ffeed8'))
        });
        // Preserve duplicate protection instead of silently leaving an old light registration.
        this.lights.register(identifier, light);
        // Track attached source IDs under their actual owner for incremental updates.
        if (parent) {
            // Create an attachment collection only for an owner that needs one.
            if (!this.attachedLights.has(parent.identifier)) {
                // Set membership prevents duplicate source ownership entries.
                this.attachedLights.set(parent.identifier, new Set());
            }
            // Record this source as one of the parent's attachments.
            this.attachedLights.get(parent.identifier).add(identifier);
        }
        // Establish the source's current projected influence automatically.
        this.indexLight(light);
        // Source changes invalidate lighting without requiring any object to move.
        this.revision += 1;
        // Return the immutable declaration with live computed world-coordinate getters.
        return light;
    }

    /** Refresh one light's influence membership after creation or parent transform changes. */
    indexLight(light) {
        // Account for the projected vertical extent of the light's spherical reach.
        const verticalRadius = light.radius * Math.hypot(1, this.basement.configuration.heightProjectionScale);
        // Project the source center before building the screen-world query bounds.
        const projectedY = light.positionY - light.positionZ * this.basement.configuration.heightProjectionScale;
        // Index light influence, which can extend on screen even when its source is off screen.
        this.lightReach.upsert(light.identifier, light, {
            // Leftmost projected influence of the source sphere.
            minimumX: light.positionX - light.radius,
            // Uppermost projected influence including world height.
            minimumY: projectedY - verticalRadius,
            // Rightmost projected influence of the source sphere.
            maximumX: light.positionX + light.radius,
            // Lowermost projected influence including world height.
            maximumY: projectedY + verticalRadius
        });
    }

    /** Remove a light and its influence bounds, tolerating an already absent name. */
    removeLight(identifier) {
        // Read ownership before forgetting the registered source.
        const light = this.lights.get(identifier);
        // Attached sources must also release their parent ownership link.
        if (light?.parentIdentifier) {
            // Obtain the actual Set maintained for this source's parent.
            const attachments = this.attachedLights.get(light.parentIdentifier);
            // Remove only this source's link.
            attachments.delete(identifier);
            // Empty attachment collections should not accumulate after scene changes.
            if (attachments.size === 0) {
                // Release the now-unused parent entry.
                this.attachedLights.delete(light.parentIdentifier);
            }
        }
        // Release influence membership before forgetting its declaration.
        this.lightReach.remove(identifier);
        // Remove the actual source from the scene library.
        this.lights.remove(identifier);
        // Ensure cached lighting is not reused after removal.
        this.revision += 1;
    }

    /** Capture current moving positions before controls/physics update this fixed step. */
    beginStep() {
        // “of” visits moving body values only; a massive static registry is not scanned.
        for (const body of this.directory.systems.get('physics').movingBodies.values()) {
            // Store this step's starting position for future visual interpolation.
            body.element.previousPosition = [body.element.transform.positionX, body.element.transform.positionY, body.element.transform.positionZ];
        }
    }

    /** Remove an element's body, visual membership, and Directory registration together. */
    removeElement(identifier) {
        // Find the world element owned by this particular scene.
        const element = this.worldElements.get(identifier);
        // Repeated removal must not affect an unrelated Directory entry.
        if (!element) {
            // Nothing remains to clean up for this identifier.
            return;
        }
        // Snapshot owner-linked IDs because removeLight changes the same Set.
        for (const lightIdentifier of Array.from(this.attachedLights.get(identifier) ?? [])) {
            // Removing a parent automatically removes its attached sources and influence bounds.
            this.removeLight(lightIdentifier);
        }
        // Remove ownership before any contact-end observer can mutate a retained transform.
        this.worldElements.delete(identifier);
        // Clear static membership whether or not this was a static body.
        this.staticBodies.remove(identifier);
        // Clear moving membership whether or not this was moving.
        this.movingBodies.remove(identifier);
        // Release the projected visible extent.
        this.visibleGeometry.remove(identifier);
        // Remove physical shadow obstruction independently of whether this element had a body.
        this.shadowGeometry.remove(identifier);
        // Remove the shared public Directory registration.
        this.directory.elements.remove(identifier);
        // Invalidate GPU content before observers can request a render during removal.
        this.revision += 1;
        // Release physical tracking last; end-contact observers now see consistent removed state.
        this.directory.systems.get('physics').remove(identifier);
        // Empty scenes should release their compositor callback, not draw an obsolete image.
        if (this.worldElements.size === 0) {
            // GPU resources can remain reusable, but no world pass should remain registered.
            this.directory.systems.get('worldRenderer').deactivate();
        }
    }

    /** Empty the scene without destroying reusable spatial/physics/rendering services. */
    clear() {
        // Snapshot IDs because removeElement changes the underlying world Map.
        // “of” reads every ID value and finishes when the snapshot is exhausted.
        for (const identifier of Array.from(this.worldElements.keys())) {
            // Use the same complete cleanup path as individual removal.
            this.removeElement(identifier);
        }
        // Snapshot light names because removeLight changes the source library.
        for (const identifier of Array.from(this.lights.entries.keys())) {
            // Remove both declarations and influence bounds.
            this.removeLight(identifier);
        }
    }

    /** Release world declarations during Directory teardown while services are still addressable. */
    dispose() {
        // Reuse complete element/light cleanup instead of leaving index references alive.
        this.clear();
    }
}
