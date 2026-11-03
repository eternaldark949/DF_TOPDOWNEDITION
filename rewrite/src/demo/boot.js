/**
 * HARNESS ENTRY — construct the engine, install optional test content, wire controls,
 * then start. This is deliberately separate from engine assembly and reusable systems.
 * It replaces no existing game's entry point and requires no external runtime files.
 */

// Obtain the drawing surface after its HTML element has been parsed.
const foundationCanvas = document.getElementById('foundation-canvas');

/** Construct the connected engine; expose setup/capability failures directly in the phone-readable host. */
function constructFoundationEngine(canvas) {
    // A capability error can occur before the Lobby exists, so handle this construction boundary explicitly.
    try {
        // This constructor finishes before its returned engine object is assigned by the caller.
        return new Etrnl9Engine(canvas);
    } catch (error) {
        // The host status label remains usable even if this device could not create WebGL2 output.
        document.getElementById('status-value').textContent = error.message;
        // Preserve the actual browser exception rather than hiding an unsupported renderer behind fallback.
        throw error;
    }
}

// Construct and connect the four levels without starting any recurring callbacks.
const foundationEngine = constructFoundationEngine(foundationCanvas);

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
    // The adaptive hotel view depends on current viewport dimensions rather than a fixed percentage.
    if (event.target.value === 'fit') {
        // Resolve the installed test feature; optional chaining tolerates a different active study.
        foundationEngine.penthouse.features.get('hotel-study')?.fitView();
        // Do not convert the word fit into NaN or poison future camera calculations.
        return;
    }
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
    // A real asset study uses the same scene/renderer as the neutral exercises.
    const isHotelStudy = studyName === 'hotel';
    // Reset reusable camera settings when leaving the asset's radial view.
    if (!isHotelStudy) {
        // Neutral studies retain their original oblique camera model.
        foundationEngine.directory.systems.get('renderer').camera.projection = 'oblique';
        // Reset the world X center after viewing the hotel's 800-unit plan.
        foundationEngine.directory.systems.get('renderer').camera.positionX = 0;
        // Reset the world ground-depth center under the same explicit camera ownership.
        foundationEngine.directory.systems.get('renderer').camera.positionY = 0;
        // Neutral scenes use ordinary centered framing rather than the asset inspection window.
        foundationEngine.directory.systems.get('renderer').camera.screenOffsetX = 0;
        // Reset vertical framing under the same explicit camera ownership.
        foundationEngine.directory.systems.get('renderer').camera.screenOffsetY = 0;
        // Hotel night artwork must not silently darken another independent study.
        foundationEngine.directory.systems.get('renderer').nightAmount = 0;
        // Adaptive hotel fitting is not a valid numeric zoom for the other exercises.
        if (document.getElementById('zoom-control').value === 'fit') {
            // Restore the neutral studies' default one CSS pixel per world unit.
            foundationEngine.directory.systems.get('renderer').camera.zoom = 1;
            // Keep the visible control consistent with the actual camera scale.
            document.getElementById('zoom-control').value = '1';
        }
    }
    // Select the neutral shared-world scene or the scheduling/interpolation study.
    selectedStudy = isWorldStudy ? 'world-study' : 'rectangle-study';
    // Keep the real asset feature under its own removable Penthouse address.
    if (isHotelStudy) {
        // The feature owns test controls/content; the engine receives no hotel-specific methods.
        selectedStudy = 'hotel-study';
    }
    // Default to the small scheduling exercise before selecting a different test feature.
    let feature = new RectangleStudy();
    // The shared-world option exercises generic primitive contacts and lighting.
    if (isWorldStudy) {
        // Construct this optional test feature without starting another engine or scheduler.
        feature = new WorldStudy();
    }
    // The asset option uses actual prepared game artwork and ordinary scene geometry.
    if (isHotelStudy) {
        // Construct only test content; image resources have already been decoded separately.
        feature = new HotelStudy();
    }
    // Install through the same optional Penthouse contract as future procedural features.
    foundationEngine.penthouse.install(selectedStudy, feature);
    // Set the selector to reflect programmatic selection as well as user input.
    document.getElementById('study-control').value = studyName;
    // Hide stress/roof controls in the Loop study.
    document.getElementById('world-controls').hidden = !isWorldStudy;
    // Hotel-specific view/artwork controls belong to this harness rather than the engine.
    document.getElementById('hotel-controls').hidden = !isHotelStudy;
    // Show image/buffer reuse accounting only while the real asset is being inspected.
    document.getElementById('hotel-cache-value').hidden = !isHotelStudy;
    // Hide physical measurements when the selected study has no matching diagnostic fields.
    document.getElementById('world-measurements').hidden = !isWorldStudy;
    // Explain what pointer input means for the selected study.
    document.getElementById('study-instructions').textContent = isWorldStudy
        ? 'Move the cream circle with WASD/arrows or hold a touch destination. Physics handles all contacts. Pink rests above the slab; orange moves below. Purple ground emission stays behind opaque geometry.'
        : 'Drag or touch to place the cream marker. WASD/arrows move it. This WebGL study checks scheduling and interpolation.';
    // Explain that this scene is a neutral engine test rather than migrated gameplay.
    document.getElementById('scene-caption').textContent = isWorldStudy ? 'One world: bodies, height, visibility, and light.' : 'A small study, running on four levels.';
    // Real-asset instructions explain supported interaction without claiming migrated gameplay.
    if (isHotelStudy) {
        // Camera controls and cached night artwork let the owner inspect the same real asset.
        document.getElementById('study-instructions').textContent = 'Double Nights Hotel: original artwork on WebGL surfaces. WASD/arrows or held touch moves the cream test actor; walls use ordinary collision. Use Fit hotel, view controls, and night artwork to inspect it.';
        // Keep the caption readable over the actual rendered hotel.
        document.getElementById('scene-caption').textContent = 'Double Nights Hotel · original artwork, shared world depth';
    }
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
/** Disable host controls while asynchronous image decoding prevents a complete real-asset scene. */
function setFoundationLoading(loading) {
    // querySelectorAll returns this page's actual lifecycle/view controls, not engine components.
    const controls = document.querySelectorAll('.controls button, .controls select');
    // “of” supplies DOM control values and stops after every selected button/dropdown.
    for (const control of controls) {
        // Ignore user input until all initialization dependencies have been connected.
        control.disabled = loading;
    }
    // Loading status belongs to the host harness rather than a second engine state machine.
    if (loading) {
        // Keep the first-open state understandable on a phone while embedded PNGs decode.
        document.getElementById('status-value').textContent = 'Preparing hotel artwork…';
    }
}

/** Decode embedded images once before installing the real asset; no runtime network is used. */
async function prepareHotelAsset() {
    // Parse generated asset data separately from reusable engine implementation.
    const definition = JSON.parse(document.getElementById('hotel-asset-data').textContent);
    // Resolve the image resource owner that retains CPU sources across GPU restoration.
    const artwork = foundationEngine.directory.systems.get('artwork');
    // Object.entries provides own-property [image ID,data URI] pairs, unlike for...in inheritance.
    const imageEntries = Object.entries(definition.images);
    // Decode independent images concurrently; Promise.all resolves only after every image is ready.
    await Promise.all(imageEntries.map(
        /** Decode one embedded image and register its stable prefixed artwork address. */
        async ([identifier, source]) => {
            // A browser image decodes the original PNG; no Canvas drawing is needed at runtime.
            const image = new Image();
            // A data URI is embedded in this HTML and makes no external network request.
            image.src = source;
            // Await preserves initialization order; the engine is still stopped during decoding.
            await image.decode();
            // Use a source namespace so another building can reuse the same local asset names safely.
            artwork.registerImage(`double-nights.${identifier}`, image);
        }
    ));
    // “of” supplies surface values and stops after each material's image addresses are connected.
    for (const surface of definition.surfaces) {
        // A colored geometric surface needs no source image address.
        if (surface.material.artwork) {
            // Match the address used when registering the decoded image above.
            surface.material.artwork = `double-nights.${surface.material.artwork}`;
        }
        // Emission is optional and remains a separate image on this same physical surface.
        if (surface.material.emissionArtwork) {
            // Connect the cached night image without creating a late glow overlay pass.
            surface.material.emissionArtwork = `double-nights.${surface.material.emissionArtwork}`;
        }
    }
    // Store reusable asset data separately from this scene's placed instance.
    foundationEngine.directory.assets.register('double-nights', definition);
    // Default to the actual game asset so the owner can inspect it immediately after opening one file.
    installFoundationStudy('hotel');
    // Reenable host controls only after source images and scene dependencies exist.
    setFoundationLoading(false);
    // Tests and future embedding can wait for completed decode/scene initialization explicitly.
    window.foundationReady = true;
    // All dependencies and actual asset images now exist; start the sole Lobby scheduler.
    startFoundation();
}

/** Toggle cached night artwork through one renderer setting without repainting source images. */
function toggleHotelNight() {
    // Resolve the same output renderer used by every study.
    const renderer = foundationEngine.directory.systems.get('renderer');
    // Switch the normalized time-of-day amount between daytime and full visible night emission.
    renderer.nightAmount = renderer.nightAmount === 0 ? 1 : 0;
    // Describe the next action without claiming bloom/searchlights are already implemented.
    document.getElementById('hotel-night-button').textContent = renderer.nightAmount ? 'Show day artwork' : 'Show night artwork';
}

/** Move the camera horizontally to inspect the source height lean; geometry remains retained. */
function panHotel(amount) {
    // Only camera position changes; image cache and physical geometry need no invalidation calls.
    foundationEngine.directory.systems.get('renderer').camera.positionX += amount;
}

/** Return to the authored hotel center and adapt its scale to the current viewport. */
function centerHotel() {
    // Restore the horizontal center of the 800-world-unit plan.
    foundationEngine.directory.systems.get('renderer').camera.positionX = 400;
    // Restore the same vertical center used at asset installation.
    foundationEngine.directory.systems.get('renderer').camera.positionY = 900;
    // Fit through the current feature, without adding asset-specific behavior to the engine.
    foundationEngine.penthouse.features.get('hotel-study')?.fitView();
}

// Connect the optional art/view controls to actual camera/material settings.
document.getElementById('hotel-night-button').addEventListener('click', toggleHotelNight);
/** Move left when this harness button is clicked; the callback starts no frame loop. */
document.getElementById('hotel-left-button').addEventListener('click', () => panHotel(-100));
/** Move right using the same camera operation and opposite world-unit displacement. */
document.getElementById('hotel-right-button').addEventListener('click', () => panHotel(100));
// Centering changes only this feature's view configuration.
document.getElementById('hotel-center-button').addEventListener('click', centerHotel);
// Expose loading state before asynchronous decoding starts.
window.foundationReady = false;
// Block premature lifecycle/study changes while embedded source images are still decoding.
setFoundationLoading(true);
// Make startup failures visible on a phone instead of silently leaving a blank scene.
prepareHotelAsset().catch(
    /** Present the concrete asset/decode/setup failure and keep the engine stopped. */
    (error) => {
        // Stop through the existing lifecycle boundary if initialization reached a running state.
        foundationEngine.stop();
        // Keep alternative neutral studies accessible after a source-image preparation failure.
        setFoundationLoading(false);
        // The status label belongs to this test harness, not reusable engine code.
        document.getElementById('status-value').textContent = error.message;
        // Preserve the original browser exception for automated checks and developer tools.
        console.error(error);
    }
);
