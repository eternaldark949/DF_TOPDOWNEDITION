/**
 * PENTHOUSE — optional high-level features built from Directory services.
 * Procedural humanoids and tiered buildings will belong here; they are not migrated
 * in this foundation. Extensions are supplied by callers, not hard-coded in the engine.
 */
class LevelPenthouse {
    /** Retain the service Directory and create an empty optional-feature library. */
    constructor(directory) {
        // Refer to the actual Directory instance so services can be looked up when needed.
        this.directory = directory;
        // Store installed features by unique names for later access and removal.
        this.features = new NamedLibrary('penthouse features');
    }

    /** Install a feature with initialize(directory), update(seconds), and dispose() hooks. */
    install(identifier, feature) {
        // Prevent replacement from leaking the old feature's elements or render passes.
        this.features.register(identifier, feature);
        // Roll back the registration if initialization fails.
        try {
            // A feature can be purely computational and need no initialization hook.
            if (typeof feature.initialize === 'function') {
                // Supply reusable services only after the engine's components are connected.
                feature.initialize(this.directory);
            }
        } catch (error) {
            // Release partial registrations when the feature supports cleanup.
            if (typeof feature.dispose === 'function') {
                // Let the feature undo work completed before its failure.
                feature.dispose();
            }
            // Remove the failed feature's name from the installed collection.
            this.features.remove(identifier);
            // Preserve the original initialization failure for the caller.
            throw error;
        }
        // Return the same feature instance for explicit configuration by its owner.
        return feature;
    }

    /** Advance installed features once per fixed simulation step. */
    update(stepSeconds) {
        // Snapshot feature values so installation/removal during a step affects the next one.
        // “of” visits each feature object; iteration stops after this snapshot is exhausted.
        for (const feature of Array.from(this.features.entries.values())) {
            // Some features provide only render passes and need no update hook.
            if (typeof feature.update === 'function') {
                // Pass the same duration used by Directory systems.
                feature.update(stepSeconds);
            }
        }
    }

    /** Uninstall a feature and its owned resources; an absent name is a harmless no-op. */
    uninstall(identifier) {
        // Resolve the currently installed object rather than keeping a duplicate reference.
        const feature = this.features.get(identifier);
        // There is nothing to release when this name is not registered.
        if (!feature) {
            // Leave the remaining feature collection unchanged.
            return;
        }
        // Give the feature an opportunity to remove its passes and elements.
        if (typeof feature.dispose === 'function') {
            // Cleanup runs while Directory services still exist.
            feature.dispose();
        }
        // Forget the feature only after its owned resources are released.
        this.features.remove(identifier);
    }

    /** Uninstall all features before the engine disposes Directory services. */
    dispose() {
        // Visit a reversed snapshot of keys because uninstall mutates the underlying Map.
        // “of” provides each ID value from the snapshot, ending after all IDs are visited.
        for (const identifier of Array.from(this.features.entries.keys()).reverse()) {
            // Reuse the same cleanup path as an individual feature removal.
            this.uninstall(identifier);
        }
    }
}
