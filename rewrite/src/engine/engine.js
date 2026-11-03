/**
 * ETRNL9 ENGINE — assemble the four levels, connect them, and expose lifecycle.
 * Implementations live under the levels, not inside this coordinator. Construction
 * is inert: the caller installs any optional content and explicitly calls start().
 */
class Etrnl9Engine {
    /** Assemble an engine around one canvas; browser/scheduler injection supports testing. */
    constructor(canvas, configuration = {}, browserWindow = window, browserDocument = document, scheduler = null) {
        // Keep the browser objects used for resize/visibility, so disposal can unsubscribe.
        this.browserWindow = browserWindow;
        // Visibility belongs to the page document, which is distinct from its window.
        this.browserDocument = browserDocument;
        // Do not permit restarting an engine whose listeners and services were destroyed.
        this.destroyed = false;
        // Build shared configuration and helpers before components that depend on them.
        this.basement = new LevelBasement(configuration);
        // Build the service Directory without starting listeners or frames.
        this.directory = new LevelDirectory(this.basement, canvas, browserWindow);
        // Build an empty Penthouse that can use the now-created service Directory.
        this.penthouse = new LevelPenthouse(this.directory);
        // Use an injected clock in tests, otherwise wrap browser methods with their owners.
        const frameScheduler = scheduler ?? {
            // Keep the browser window as requestAnimationFrame's receiver.
            request: browserWindow.requestAnimationFrame.bind(browserWindow),
            // Keep the same receiver for cancellation and preserve callback IDs.
            cancel: browserWindow.cancelAnimationFrame.bind(browserWindow),
            // Bind the high-resolution clock to its performance object.
            now: browserWindow.performance.now.bind(browserWindow.performance)
        };
        // Create the Lobby last so it can coordinate all completed levels.
        this.lobby = new LevelLobby(this.basement, this.directory, this.penthouse, frameScheduler);
        // Establish parent/dependency connections only after all levels exist.
        this.directory.connect(this);
        // Bind resize to this engine and retain that function for later unsubscription.
        this.handleResize = this.resize.bind(this);
        // Bind page visibility handling to the same engine instance.
        this.handleVisibility = this.onVisibilityChange.bind(this);
        // Keep the drawing surface matched to its host's visible size.
        this.browserWindow.addEventListener('resize', this.handleResize);
        // Suspend the Lobby when the page becomes hidden.
        this.browserDocument.addEventListener('visibilitychange', this.handleVisibility);
        // Allocate initial backing pixels before the first possible draw.
        this.resize();
        // Honor an already hidden page without starting any frame callbacks.
        this.onVisibilityChange();
    }

    /** Size the renderer from its canvas's CSS bounds and the browser's pixel density. */
    resize() {
        // Find the current renderer through its service address.
        const renderer = this.directory.systems.get('renderer');
        // Read actual canvas layout so embedded and full-page hosts both work.
        const bounds = renderer.canvas.getBoundingClientRect();
        // Update backing pixels; devicePixelRatio defaults to one when unavailable.
        renderer.resize(bounds.width, bounds.height, this.browserWindow.devicePixelRatio || 1);
    }

    /** Translate document visibility into scheduling suspension, preserving manual pauses. */
    onVisibilityChange() {
        // Document.hidden reflects current visibility; the Lobby handles timing cleanup.
        this.lobby.setSuspended(this.browserDocument.hidden);
    }

    /** Start the existing Lobby after optional features have been installed. */
    start() {
        // A destroyed engine no longer has usable Directory services or event listeners.
        if (this.destroyed) {
            // Require constructing a new instance instead of partially reviving old resources.
            throw new Error('Cannot start a destroyed engine.');
        }
        // Delegate scheduling rather than implementing a second loop here.
        this.lobby.start();
    }

    /** Stop recurring work without discarding the scene or disconnecting components. */
    stop() {
        // Destruction already canceled frames and removed input services.
        if (this.destroyed) {
            // A later redundant stop must not look up disposed Directory entries.
            return;
        }
        // The Lobby is the sole scheduler, so stopping it cancels engine frames.
        this.lobby.stop();
    }

    /** Release feature resources and listeners once; safe to call more than once. */
    destroy() {
        // Avoid trying to dispose services that have already been removed.
        if (this.destroyed) {
            // Repeated destruction is intentionally harmless.
            return;
        }
        // Cancel frames before disposing anything those frames could access.
        this.stop();
        // Unsubscribe this engine's resize callback.
        this.browserWindow.removeEventListener('resize', this.handleResize);
        // Unsubscribe its document visibility callback.
        this.browserDocument.removeEventListener('visibilitychange', this.handleVisibility);
        // Features remove their passes/elements while Directory services still exist.
        this.penthouse.dispose();
        // Services then remove listeners and release registry references.
        this.directory.dispose();
        // Prevent future starts after teardown is complete.
        this.destroyed = true;
    }
}
