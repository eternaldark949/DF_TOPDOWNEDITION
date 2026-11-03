/**
 * HARNESS ENTRY — construct the engine, install optional test content, wire controls,
 * then start. This is deliberately separate from engine assembly and reusable systems.
 * It replaces no existing game's entry point and requires no external runtime files.
 */

// Obtain the drawing surface after its HTML element has been parsed.
const foundationCanvas = document.getElementById('foundation-canvas');

// Construct and connect the four levels without starting any recurring callbacks.
const foundationEngine = new Etrnl9Engine(foundationCanvas);

// Remember the selected optional study without mixing it into engine implementation.
let selectedStudy = null;

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

/** Replace only harness-owned test content; the same connected engine and Lobby remain. */
function installFoundationStudy(studyName) {
    // Remember whether this same engine should resume after replacing test content.
    const wasRunning = foundationEngine.lobby.running;
    // Prevent a half-installed scene from rendering between lifecycle operations.
    foundationEngine.stop();
    // Uninstall only a previously installed harness feature.
    if (selectedStudy) {
        // Feature cleanup removes its scene declarations, passes, and callbacks.
        foundationEngine.penthouse.uninstall(selectedStudy);
    }
    // Keep scene-specific controls visible only when they have meaningful targets.
    const isWorldStudy = studyName === 'world';
    // Select the neutral shared-world scene or the scheduling/interpolation study.
    selectedStudy = isWorldStudy ? 'world-study' : 'rectangle-study';
    // Install through the same optional Penthouse contract as future procedural features.
    foundationEngine.penthouse.install(selectedStudy, isWorldStudy ? new WorldStudy() : new RectangleStudy());
    // Set the selector to reflect programmatic selection as well as user input.
    document.getElementById('study-control').value = studyName;
    // Hide stress/roof controls in the Loop study.
    document.getElementById('world-controls').hidden = !isWorldStudy;
    // Hide physical measurements when no world bodies exist.
    document.getElementById('world-measurements').hidden = !isWorldStudy;
    // Explain what pointer input means for the selected study.
    document.getElementById('study-instructions').textContent = isWorldStudy
        ? 'Move the cream circle with WASD/arrows or hold a touch destination. Physics handles all contacts. Pink rests above the slab; orange moves below. Purple ground emission stays behind opaque geometry.'
        : 'Drag or touch to place the cream marker. WASD/arrows move it. This WebGL study checks scheduling and interpolation.';
    // Explain that this scene is a neutral engine test rather than migrated gameplay.
    document.getElementById('scene-caption').textContent = isWorldStudy ? 'One world: bodies, height, visibility, and light.' : 'A small study, running on four levels.';
    // Reset the scene-specific roof toggle label.
    document.getElementById('roof-button').textContent = 'Hide slab visually';
    // Re-enable population setup for a newly constructed world study.
    document.getElementById('population-button').disabled = false;
    // Resume the single scheduler only if it was running before this replacement.
    if (wasRunning) {
        // The Lobby resets timing, so scene setup duration never becomes physics catch-up.
        foundationEngine.start();
    }
    // Reflect the current lifecycle state in visible controls.
    refreshFoundationControls();
}

/** Select a test scene from the harness dropdown; never construct a second engine. */
function changeFoundationStudy(event) {
    // The select value names only test content, not a renderer-specific layer repair.
    installFoundationStudy(event.target.value);
}

/** Recreate the selected neutral scene while retaining all foundational services. */
function resetFoundationStudy() {
    // Choose the current study from its visible selector.
    installFoundationStudy(document.getElementById('study-control').value);
}

/** Demonstrate that visibility and collision share geometry but are independent declarations. */
function toggleFoundationRoof() {
    // Find the installed world study through the optional feature library.
    const study = foundationEngine.penthouse.features.get('world-study');
    // The button has no target in another study.
    if (!study) {
        // Leave the current test scene unchanged.
        return;
    }
    // The tracked visibility setter automatically invalidates cached GPU geometry.
    study.roof.visible = !study.roof.visible;
    // Explain the opposite action while retaining the slab's physical support body.
    document.getElementById('roof-button').textContent = study.roof.visible ? 'Hide slab visually' : 'Show slab visually';
}

/** Populate real distant bodies to compare registry size against local query/render work. */
function addFoundationPopulation() {
    // Resolve the current test content, not a hard-coded engine population field.
    const study = foundationEngine.penthouse.features.get('world-study');
    // Other studies have no stress-population setup.
    if (!study) {
        // Avoid changing an unrelated test scene.
        return;
    }
    // Prevent repeated setup requests and make this one-time ingestion operation explicit.
    document.getElementById('population-button').disabled = true;
    // Pause scheduling so deliberate registration time is not misreported as simulation catch-up.
    const wasRunning = foundationEngine.lobby.running;
    // Stop the single Lobby before the synchronous bulk-registration operation.
    foundationEngine.stop();
    // Create actual indexed static elements, not an artificial population counter.
    study.addDistantPopulation();
    // Resume only if the user had the engine running before setup.
    if (wasRunning) {
        // A fresh timing baseline excludes the one-time ingestion duration.
        foundationEngine.start();
    }
    // Keep controls consistent if population setup was requested while stopped.
    refreshFoundationControls();
}

/** Display actual engine failures in the phone-readable harness without suppressing console errors. */
function reportFoundationError() {
    // An unrelated page error does not necessarily describe an engine execution failure.
    if (!foundationEngine.lobby.lastError) {
        // Leave ordinary browser error reporting unchanged.
        return;
    }
    // Refresh stopped-state controls so a supported alternative study can still be selected.
    refreshFoundationControls();
    // Replace a stale Running label with the actual capability/execution failure.
    document.getElementById('status-value').textContent = foundationEngine.lobby.lastError.message;
}

// Connect the start control to the existing engine, without an anonymous inline loop.
document.getElementById('start-button').addEventListener('click', startFoundation);
// Connect stop to scheduling cancellation.
document.getElementById('stop-button').addEventListener('click', stopFoundation);
// Connect pause to the independent named pause registry.
document.getElementById('pause-button').addEventListener('click', toggleFoundationPause);
// Let the camera demonstrate world scaling while the screen background stays fixed.
document.getElementById('zoom-control').addEventListener('change', updateFoundationZoom);
// Let users revisit the original loop study without downloading another file.
document.getElementById('study-control').addEventListener('change', changeFoundationStudy);
// Reset primitives through their normal optional-feature lifecycle.
document.getElementById('reset-button').addEventListener('click', resetFoundationStudy);
// Hide/show only the slab's visual declaration to reveal automatic emission occlusion.
document.getElementById('roof-button').addEventListener('click', toggleFoundationRoof);
// Add a genuine remote population using ordinary scene registration.
document.getElementById('population-button').addEventListener('click', addFoundationPopulation);
// Keep execution failures visible without requiring a phone user to open developer tools.
window.addEventListener('error', reportFoundationError);
// Derive the visible version from shared configuration instead of maintaining two version values.
document.getElementById('version-value').textContent = foundationEngine.basement.configuration.engineVersion;
// Install the neutral shared-world study after every level and service exists.
installFoundationStudy('world');
// All construction, feature installation, and event wiring are complete; begin frames now.
startFoundation();
