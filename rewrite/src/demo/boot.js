/**
 * HARNESS ENTRY — construct the engine, install optional test content, wire controls,
 * then start. This is deliberately separate from engine assembly and reusable systems.
 * It replaces no existing game's entry point and requires no external runtime files.
 */

// Obtain the drawing surface after its HTML element has been parsed.
const foundationCanvas = document.getElementById('foundation-canvas');

// Construct and connect the four levels without starting any recurring callbacks.
const foundationEngine = new Etrnl9Engine(foundationCanvas);

// Install the optional study after the Directory and its parent-engine reference exist.
foundationEngine.penthouse.install('rectangle-study', new RectangleStudy());

// Expose the instance for inspection, learning, and browser verification.
window.foundationEngine = foundationEngine;

/** Refresh button states and the status label after a lifecycle command. */
function refreshFoundationControls() {
    // Read actual Lobby state instead of maintaining another running/paused copy.
    const lobby = foundationEngine.lobby;
    // Disable start while already running; start itself is also duplicate-safe.
    document.getElementById('start-button').disabled = lobby.running;
    // Stop is meaningful only while the Lobby is logically running.
    document.getElementById('stop-button').disabled = !lobby.running;
    // Pause can be set only while the harness is running.
    document.getElementById('pause-button').disabled = !lobby.running;
    // Name the action this button will perform for its own pause reason.
    document.getElementById('pause-button').textContent = lobby.pauseReasons.has('harness') ? 'Resume' : 'Pause';
    // Reflect this toggle to assistive technologies as well as visible text.
    document.getElementById('pause-button').setAttribute('aria-pressed', String(lobby.pauseReasons.has('harness')));
    // Compute a descriptive label without nested conditional expressions.
    let statusLabel = 'Stopped';
    // A running Lobby may be manually paused or advancing normally.
    if (lobby.running) {
        // Select the current status from the actual pause registry.
        statusLabel = lobby.paused ? 'Paused · rendering continues' : 'Running';
    }
    // Update only the harness's status text; the engine owns no presentation labels.
    document.getElementById('status-value').textContent = statusLabel;
}

/** Start the existing engine instance without creating a replacement scene or loop. */
function startFoundation() {
    // Delegate to the engine's idempotent start operation.
    foundationEngine.start();
    // Refresh controls immediately after the state change.
    refreshFoundationControls();
}

/** Stop scheduling and retain the current scene for a later restart. */
function stopFoundation() {
    // Cancel the Lobby's outstanding frame request.
    foundationEngine.stop();
    // Show stopped status even though no new render callback will run.
    refreshFoundationControls();
}

/** Toggle only the test harness's pause reason; leave other pause owners untouched. */
function toggleFoundationPause() {
    // Read whether this harness already owns a pause reason.
    const harnessIsPaused = foundationEngine.lobby.pauseReasons.has('harness');
    // Acquire or release that reason without starting a second scheduler.
    foundationEngine.lobby.setPaused('harness', !harnessIsPaused);
    // Update the visible action and status immediately.
    refreshFoundationControls();
}

/** Apply the selected camera zoom; the renderer owns world/screen conversion. */
function updateFoundationZoom(event) {
    // Find the camera through its owning renderer system.
    const renderer = foundationEngine.directory.systems.get('renderer');
    // Input values are strings; Number converts the selected numeric value explicitly.
    renderer.camera.zoom = Number(event.target.value);
}

// Connect the start control to the existing engine, without an anonymous inline loop.
document.getElementById('start-button').addEventListener('click', startFoundation);
// Connect stop to scheduling cancellation.
document.getElementById('stop-button').addEventListener('click', stopFoundation);
// Connect pause to the independent named pause registry.
document.getElementById('pause-button').addEventListener('click', toggleFoundationPause);
// Let the camera demonstrate world scaling while the screen background stays fixed.
document.getElementById('zoom-control').addEventListener('change', updateFoundationZoom);
// All construction, feature installation, and event wiring are complete; begin frames now.
startFoundation();
