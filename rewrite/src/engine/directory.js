/**
 * DIRECTORY — named systems, tools, elements, and reusable asset libraries.
 * Components are constructed here, connected before execution, and updated through
 * one system contract. This level does not start timers or animation callbacks.
 */
class LevelDirectory {
    /** Create the selected renderer/input systems and the profiler tool, without starting. */
    constructor(basement, canvas, browserWindow) {
        // Retain the Basement instance rather than copying its settings.
        this.basement = basement;
        // Systems implement reusable concerns and may provide update/dispose methods.
        this.systems = new NamedLibrary('systems');
        // Tools hold utilities that do not need a simulation update every step.
        this.tools = new NamedLibrary('tools');
        // Elements are the actual objects used by installed game or procedural features.
        this.elements = new NamedLibrary('elements');
        // Assets can be images, audio, configuration, or other caller-owned references.
        this.assets = new NamedLibrary('assets');
        // Register the renderer without making the engine coordinate its internals.
        this.systems.register('renderer', new RendererSystem(canvas, basement));
        // Register input; its constructor stores references and installs no listeners yet.
        this.systems.register('input', new InputSystem(canvas, browserWindow));
        // Register per-frame measurements independently of any particular on-screen HUD.
        this.tools.register('profiler', new FrameProfiler());
    }

    /** Connect optional systems after every Directory component has been constructed. */
    connect(engine) {
        // Keep the actual owning engine reference available to directory users.
        this.parentEngine = engine;
        // Visit system values, not their string IDs, once each in registration order.
        // “of” iterates Map.values(); it finishes when no system values remain.
        for (const system of this.systems.entries.values()) {
            // Only systems that need a connection phase implement this method.
            if (typeof system.connect === 'function') {
                // Supply the finished Directory so dependencies can be looked up now.
                system.connect(this);
            }
        }
    }

    /** Advance reusable systems by one fixed timestep, expressed in seconds. */
    update(stepSeconds) {
        // Visit a snapshot of system values so registration changes take effect next step.
        // “of” supplies each system object; iteration ends after the snapshot is exhausted.
        for (const system of Array.from(this.systems.entries.values())) {
            // A rendering-only or event-driven system may not need simulation updates.
            if (typeof system.update === 'function') {
                // Give this system the same fixed duration as every other updated system.
                system.update(stepSeconds);
            }
        }
    }

    /** Dispose components in reverse registration order, then release owned registries. */
    dispose() {
        // Convert values to an array so reverse order can undo later dependencies first.
        const systemsInReverseOrder = Array.from(this.systems.entries.values()).reverse();
        // Visit each system once; “of” reads values rather than array index keys.
        for (const system of systemsInReverseOrder) {
            // Only systems that allocate resources need a dispose implementation.
            if (typeof system.dispose === 'function') {
                // Remove that system's listeners or other external resources.
                system.dispose();
            }
        }
        // Forget registered systems now that their resources have been released.
        this.systems.entries.clear();
        // Release the Directory's references to tools.
        this.tools.entries.clear();
        // Release element references; element resource cleanup belongs to their owners.
        this.elements.entries.clear();
        // Release asset references; asset-specific cleanup belongs to their owners.
        this.assets.entries.clear();
    }
}
