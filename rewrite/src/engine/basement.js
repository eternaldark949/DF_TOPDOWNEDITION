/**
 * BASEMENT — shared definitions and small operations, with no frame scheduling.
 * This is the lowest level: it does not depend on the Directory or on game content.
 * Classes remain ordinary JavaScript classes; the engine exposes their instances
 * through named levels, matching the owner's G7 organization.
 */
class LevelBasement {
    /** Create independent engine settings. Optional overrides use seconds or Hz. */
    constructor(overrides = {}) {
        // Keep settings together; freeze prevents later direct property reassignment.
        this.configuration = Object.freeze({
            // Identify this foundation independently of the existing game's version.
            engineName: 'ETRNL9',
            // Describe the first working foundation, not a migrated full game.
            engineVersion: '0.2.0',
            // Run simulation at sixty fixed steps per second on any display.
            simulationHz: 60,
            // Limit elapsed time accepted after a browser stall, in seconds.
            maximumFrameSeconds: 0.25,
            // Bound catch-up work so a slow device cannot accumulate endless work.
            maximumStepsPerFrame: 5,
            // Limit backing-image density to control memory use on phones.
            maximumPixelRatio: 2,
            // World shading defaults to one physical pixel per CSS pixel; UI can remain sharper.
            maximumWorldPixelRatio: 1,
            // Shared oblique projection: each upward Z unit shifts the image up by this amount.
            heightProjectionScale: 0.75,
            // Downward acceleration in upward-positive world Z, in world units per second squared.
            gravityZ: -240,
            // Bound safety subdivisions rather than silently skipping fast-body contacts.
            maximumPhysicsSubsteps: 64,
            // Repeat generic contact correction for neighboring bodies and simple stacks.
            solverIterations: 4,
            // Ambient reflected surface illumination, separate from surface emission.
            ambientLight: 0.28,
            // Each point light uses six depth faces of this resolution, independent of scene size.
            shadowMapSize: 256,
            // Copy caller overrides after defaults so supplied settings take precedence.
            ...overrides
        });
        // Visit positive numeric setting-name values one at a time and stop after the list.
        // “of” retrieves names from this explicit list, unlike “in”, which reads keys.
        for (const settingName of ['simulationHz', 'maximumFrameSeconds', 'maximumStepsPerFrame', 'maximumPixelRatio', 'maximumWorldPixelRatio', 'heightProjectionScale', 'maximumPhysicsSubsteps', 'solverIterations', 'shadowMapSize']) {
            // Look up this setting's actual supplied value, including invalid strings.
            const settingValue = this.configuration[settingName];
            // Numeric settings must be finite positive numbers; do not coerce strings.
            if (!Number.isFinite(settingValue) || settingValue <= 0) {
                // Fail during setup instead of allowing an invalid timestep or canvas size.
                throw new RangeError(`${settingName} must be a finite positive number.`);
            }
        }
        // The catch-up limit counts whole updates, so fractional limits are invalid.
        if (!Number.isInteger(this.configuration.maximumStepsPerFrame)) {
            // Explain the invalid unit to callers immediately.
            throw new RangeError('maximumStepsPerFrame must be an integer.');
        }
        // A pixel-density cap below one conflicts with the minimum supported density.
        if (this.configuration.maximumPixelRatio < 1) {
            // Reject contradictory bounds instead of allocating surprising dimensions.
            throw new RangeError('maximumPixelRatio must be at least one.');
        }
        // Gravity may be zero or negative; ambient illumination may be zero but never negative.
        if (!Number.isFinite(this.configuration.gravityZ) || !Number.isFinite(this.configuration.ambientLight) || this.configuration.ambientLight < 0) {
            // Explain these distinct numeric rules rather than rejecting valid zero gravity.
            throw new RangeError('Gravity must be finite; ambient light must be finite and nonnegative.');
        }
        // Subdivision/iteration counts represent whole repetitions, not fractional durations.
        if (!Number.isInteger(this.configuration.maximumPhysicsSubsteps) || !Number.isInteger(this.configuration.solverIterations) || !Number.isInteger(this.configuration.shadowMapSize)) {
            // Reject fractional loop budgets before any physics work begins.
            throw new RangeError('Physics substep and solver iteration counts must be integers.');
        }
    }

    /** Return value restricted to the inclusive minimum/maximum range; change no state. */
    clamp(value, minimum, maximum) {
        // First prevent going below minimum, then prevent going above maximum.
        return Math.min(maximum, Math.max(minimum, value));
    }

    /** Blend previous and current numbers by a fraction between zero and one. */
    interpolate(previousValue, currentValue, fraction) {
        // Move a fraction of the distance from the previous value toward the current one.
        return previousValue + (currentValue - previousValue) * fraction;
    }
}

/**
 * NamedLibrary stores elements, assets, tools, or systems under readable IDs.
 * It owns registration only; it does not assume how a registered object behaves.
 */
class NamedLibrary {
    /** Label this library for error messages and start with no registered entries. */
    constructor(libraryName) {
        // Store the human-readable concern this collection represents.
        this.name = libraryName;
        // Map stores explicit keys without inheriting object-property names.
        this.entries = new Map();
    }

    /** Register one value under an unused ID and return it; reject duplicate IDs. */
    register(identifier, value) {
        // Require a nonempty string so entries remain easy to address and diagnose.
        if (typeof identifier !== 'string' || identifier.trim() === '') {
            // Reject an unusable address before modifying the library.
            throw new TypeError(`${this.name} requires a nonempty string ID.`);
        }
        // Never silently replace an existing object's ownership or reference.
        if (this.entries.has(identifier)) {
            // Report which concern and ID collided.
            throw new Error(`${this.name} already contains ${identifier}.`);
        }
        // Keep the actual value reference, not a clone or an automatically linked path.
        this.entries.set(identifier, value);
        // Let callers retain the registered instance for later configuration.
        return value;
    }

    /** Find an entry by ID; Map.get returns undefined when that ID is absent. */
    get(identifier) {
        // Retrieve the currently registered value each time this method is called.
        return this.entries.get(identifier);
    }

    /** Remove an ID and return whether it existed; caller owns any needed cleanup. */
    remove(identifier) {
        // Deleting a registration does not destroy the referenced object automatically.
        return this.entries.delete(identifier);
    }
}
