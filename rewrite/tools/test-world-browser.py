"""Verify actual GPU pixels, shared projection, shadows, and neutral scene controls.

Playwright/Chromium are development-only tools. Exact generated HTML bytes run offline.
The test uses software WebGL when hardware acceleration is unavailable; timings are
not presented as performance on the owner's phone. file:// opening remains unverified.
"""
# Resolve the built artifact and optional local screenshot directory.
from pathlib import Path
# Read an optional evidence path without adding a CLI parsing dependency.
import sys
# Allow an explicitly configured browser executable in other development environments.
import os
# Fall back to Playwright's downloaded browser when system Chromium is absent.
import shutil
# Use real Chromium events and real WebGL fragment results.
from playwright.sync_api import sync_playwright

# Locate the one-file deliverable relative to this test runner.
rewrite_root = Path(__file__).resolve().parent.parent
# Test the exact downloadable artifact, not a specially modified engine bundle.
artifact_html = (rewrite_root / 'ETRNL9 Foundation.html').read_text()
# Optional screenshots are evidence, not required runtime assets.
evidence_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def sample(page, world_x, world_y, world_z=0):
    """Read final Canvas RGB at the engine-projected physical world point."""
    # Use the engine's shared coordinate conversion instead of duplicating projection formulas.
    return page.evaluate("""([worldX, worldY, worldZ]) => {
        // Obtain the final compositor and its actual high-density canvas.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Project the supplied physical XYZ through the public engine API.
        const point = renderer.worldToScreen(worldX, worldY, worldZ);
        // Convert CSS pixels into backing pixels for actual image readback.
        const pixel = renderer.drawingContext.getImageData(Math.floor(point.positionX * renderer.pixelRatio), Math.floor(point.positionY * renderer.pixelRatio), 1, 1).data;
        // Return ordinary numbers that Python can assert against.
        return Array.from(pixel);
    }""", [world_x, world_y, world_z])


def render(page):
    """Draw the current stopped scene once through the production compositor."""
    # Manual execution isolates pixel assertions from gravity/motion between samples.
    page.evaluate("""() => {
        // Use the exact production render path, not a test-specific shader.
        foundationEngine.directory.systems.get('renderer').render({interpolationFraction: 1});
        // Query the actual WebGL error state after submission.
        const world = foundationEngine.directory.systems.get('worldRenderer');
        // Throw if a GPU API error would otherwise leave misleading image pixels.
        if (world.graphics.getError() !== world.graphics.NO_ERROR) throw new Error('WebGL reported an error');
    }""")


def check_world(browser, mobile):
    """Exercise real world controls, then deterministic depth/light pixel scenarios."""
    # Phone and desktop use independent device contexts with networking disabled.
    context = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1100, 'height': 800}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2, offline=True)
    # Begin a clean page so GPU resources and scene registries cannot leak between tests.
    page = context.new_page()
    # Collect actual browser-side errors, including animation/shader failures.
    errors = []

    def record_error(error):
        """Record a page exception for the final no-errors assertion."""
        # Wrap the built-in list method because Playwright annotates Python handlers.
        errors.append(str(error))

    # Subscribe before loading so initialization failures are included.
    page.on('pageerror', record_error)
    # Load exact standalone HTML without network or a development server.
    page.set_content(artifact_html)
    # Wait for the default world renderer to execute actual geometry.
    page.wait_for_function('foundationEngine.directory.systems.get("worldRenderer").statistics.vertices > 0')
    # A missing GPU capability must not quietly count as a successful world test.
    assert page.evaluate('!!foundationEngine.directory.systems.get("worldRenderer").graphics')
    # Verify support behavior through real scheduled physics, not only a direct test call.
    page.wait_for_function('Math.abs(foundationEngine.directory.elements.get("world-study.above-slab").transform.positionZ - 77) < 0.01')
    # Use a visible control to hide the slab's geometry automatically.
    page.get_by_role('button', name='Hide slab visually', exact=True).click()
    # Hiding a surface must preserve its ordinary physical body.
    assert page.evaluate('foundationEngine.directory.elements.get("world-study.elevated-slab").body.motion') == 'static'
    # Show it again using the same control without moving it or supplying an occlusion repair.
    page.get_by_role('button', name='Show slab visually', exact=True).click()
    # Zoom out so the whole neutral scene is inspectable on a phone too.
    page.locator('#zoom-control').select_option('0.5')
    # Resize the actual browser to exercise world backing reallocation.
    page.set_viewport_size({'width': 844, 'height': 390} if mobile else {'width': 1000, 'height': 760})
    # Wait for the engine to observe the new CSS canvas bounds.
    page.wait_for_function('Math.abs(foundationEngine.directory.systems.get("renderer").viewportWidth - document.querySelector("canvas").getBoundingClientRect().width) < 1')
    # Pause before evidence capture to keep the neutral scene stable.
    page.get_by_role('button', name='Pause', exact=True).click()
    # Pausing must continue rendering the same geometric world.
    page.wait_for_function('foundationEngine.lobby.paused && foundationEngine.directory.systems.get("worldRenderer").statistics.vertices > 0')
    # Save optional screenshots without committing generated image dependencies.
    if evidence_directory:
        # Create the caller-selected evidence folder if it does not exist.
        evidence_directory.mkdir(parents=True, exist_ok=True)
        # Record the actual neutral default study, not only an artificial pixel test.
        page.screenshot(path=str(evidence_directory / ('world-mobile.png' if mobile else 'world-desktop.png')), full_page=True)
    # Desktop also exercises actual large-scene registration through the visible stress control.
    if not mobile:
        # Install ten thousand real distant bodies while preserving the user's paused state.
        page.get_by_role('button', name='Add 10,000 distant bodies', exact=True).click()
        # Wait for real scene registration and an actual rendered view afterward.
        page.wait_for_function('foundationEngine.directory.systems.get("physics").bodies.size === 10010 && foundationEngine.directory.systems.get("worldRenderer").statistics.vertices > 0')
        # View culling should keep remote population out of the visible mesh submission.
        assert page.evaluate('foundationEngine.directory.systems.get("worldRenderer").statistics.visibleElements') <= 11
        # This moderate zoomed-out view should visit cells rather than scan every remote object.
        assert not page.evaluate('foundationEngine.directory.systems.get("scene").visibleGeometry.statistics.usedFullScan')
    # Freeze recurring work before constructing deterministic pixel scenes.
    page.evaluate('foundationEngine.stop()')
    # Uninstall the entire test feature through its normal cleanup contract.
    page.evaluate('foundationEngine.penthouse.uninstall("world-study")')
    # Return the camera to unit zoom for easily inspectable world-to-pixel assertions.
    page.evaluate('foundationEngine.directory.systems.get("renderer").camera.zoom = 1')
    # Build a depth test where a red emitting ground plane overlaps a green elevated slab.
    page.evaluate("""() => {
        // Resolve the shared scene API, which handles visibility automatically.
        const scene = foundationEngine.directory.systems.get('scene');
        // Register the nearer opaque slab first so later red emission cannot rely on painter order.
        scene.createElement('a-slab', {width:100, depth:100, height:10, positionZ:70, body:false, material:{color:'#00ff00'}});
        // This luminous ground surface is geometrically behind the slab where they overlap.
        scene.createElement('z-ground', {shape:'plane', width:180, depth:180, positionZ:0.02, body:false, material:{color:'#000000', emission:'#ff0000'}});
    }""")
    # Draw through production depth and material shaders.
    render(page)
    # The slab's top center projects over emitting ground but must remain green.
    roof_pixel = sample(page, 0, 0, 80)
    # No red emission may leak through the opaque roof pixel.
    assert roof_pixel[1] > 50 and roof_pixel[0] < 5, roof_pixel
    # A ground sample outside the slab still emits red normally.
    ground_pixel = sample(page, 70, -60, 0.02)
    # Visibility must not suppress the entire source just because part is covered.
    assert ground_pixel[0] > 240 and ground_pixel[1] < 5, ground_pixel
    # An unchanged scene should reuse its complete preserved world image, including visibility.
    render(page)
    # No internal GPU geometry should be resubmitted on this identical frame.
    assert page.evaluate('foundationEngine.directory.systems.get("worldRenderer").statistics.drawCalls') == 0
    # Image reuse must preserve the same depth-correct output rather than a cleared buffer.
    assert sample(page, 0, 0, 80) == roof_pixel
    # Replace material without moving the slab to check automatic cache invalidation.
    page.evaluate('foundationEngine.directory.elements.get("a-slab").topMaterial = {color:"#000000", emission:"#0000ff"}')
    # A normal render must pick up the new tracked material.
    render(page)
    # Blue surface emission still belongs to the visible roof surface.
    blue_pixel = sample(page, 0, 0, 80)
    # Ground red must not leak through the newly emissive roof either.
    assert blue_pixel[2] > 240 and blue_pixel[0] < 5, blue_pixel
    # Direct visibility assignment is an engine-tracked change, not a per-building repair.
    page.evaluate('foundationEngine.directory.elements.get("a-slab").visible = false')
    # The next ordinary frame should expose the previously hidden ground surface.
    render(page)
    # Sample the same screen point using the slab's old top projection.
    uncovered_pixel = sample(page, 0, 0, 80)
    # It should now show red emission from the physically visible ground behind it.
    assert uncovered_pixel[0] > 240 and uncovered_pixel[2] < 5, uncovered_pixel
    # Replace the complete scene to test actual point-light obstruction independently.
    page.evaluate("""() => {
        // Clear every element/light/index registration through normal scene ownership.
        const scene = foundationEngine.directory.systems.get('scene');
        // Unload the depth test before installing the lighting test.
        scene.clear();
        // One receiving floor uses a neutral reflective material.
        scene.createElement('floor', {shape:'plane', width:500, depth:400, body:false, material:{color:'#888888'}});
        // A plain upright blocker lies between the source and a visible ground sample.
        scene.createElement('blocker', {width:40, depth:20, height:80, body:false, material:{color:'#555555'}});
        // Position a white source above and behind that wall.
        scene.createLight('source', {positionX:0, positionY:-100, positionZ:40, radius:300, intensity:8, color:'#ffffff'});
    }""")
    # Capture the geometrically shadowed receiving surface.
    render(page)
    # This ground point is visible to the camera but obstructed from the light.
    shadowed = sample(page, 0, 70)
    # This ground point lies to the side of the physical obstruction.
    side_lit = sample(page, 100, 70)
    # Move the blocking volume through its shared transform; all indexes update automatically.
    page.evaluate('foundationEngine.directory.elements.get("blocker").transform.positionX = 200')
    # Render again without calling any manual light-mask invalidation method.
    render(page)
    # The formerly shadowed point should now receive the same declared source.
    unshadowed = sample(page, 0, 70)
    # Removing the geometric obstruction must produce a measurable brighter pixel.
    assert unshadowed[0] > shadowed[0] + 20, (shadowed, unshadowed)
    # The already unobstructed side sample should have received direct illumination.
    assert side_lit[0] > shadowed[0] + 5, (shadowed, side_lit)
    # Exercise more blockers than a small fixed shader uniform array would permit.
    page.evaluate("""() => {
        // Use ordinary scene declarations, not a separate special shadow-object API.
        const scene = foundationEngine.directory.systems.get('scene');
        // Count forty metadata entries, increasing by one until all are registered.
        for (let index = 0; index < 40; index += 1) {
            // Put low small prisms inside source reach but away from the sampled center ray.
            scene.createElement('extra-' + index, {positionX:120 + index, positionY:-30, width:1, depth:1, height:2, body:false});
        }
    }""")
    # The same geometry-driven shadow depth views must render without truncation or GPU errors.
    render(page)
    # Assert that the engine actually supplied more than 32 shadow candidates.
    assert page.evaluate('foundationEngine.directory.systems.get("worldRenderer").statistics.shadowCandidates') > 32
    # Project and invert a nonzero world-height point through the public coordinate contract.
    assert page.evaluate("""() => {
        // Obtain the same projection helper used by browser pixel sampling.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Project a point above the ground plane.
        const screen = renderer.worldToScreen(35, 48, 90);
        // Choose that same Z plane when reconstructing world coordinates.
        const world = renderer.screenToWorld(screen.positionX, screen.positionY, 90);
        // Both original ground coordinates must survive the round trip.
        return Math.abs(world.positionX - 35) < 1e-8 && Math.abs(world.positionY - 48) < 1e-8;
    }""")
    # Context restoration is part of real GPU lifecycle, not a new scheduling loop.
    page.evaluate("""() => {
        // Read the real optional browser extension for deterministic loss injection.
        const extension = foundationEngine.directory.systems.get('worldRenderer').graphics.getExtension('WEBGL_lose_context');
        // Keep the extension reachable until the browser permits restoration.
        window.contextLossProbe = extension;
        // Ask the GPU to lose this context through its supported lifecycle API.
        extension.loseContext();
    }""")
    # Wait for the actual context-loss event handler to execute.
    page.wait_for_function('foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # Ask the browser to restore the same context after its loss event has completed.
    page.evaluate('window.contextLossProbe.restoreContext()')
    # Wait for the engine's normal restoration handler to mark drawing available again.
    page.wait_for_function('!foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # Draw must rebuild GPU resources from the same preserved scene declarations.
    render(page)
    # Restored output must still receive point lighting correctly.
    restored = sample(page, 0, 70)
    # Pixel equality allows small device conversion roundoff, not a missing restored scene.
    assert abs(restored[0] - unshadowed[0]) <= 3, (restored, unshadowed)
    # Destroy every world surface, buffer, subscription, and pending frame.
    page.evaluate('foundationEngine.destroy()')
    # Shader errors, lifecycle exceptions, or invalid callbacks must fail the scenario.
    assert not errors, errors
    # Release this independent browser context.
    context.close()
    # Identify which real viewport/input configuration passed.
    print('PASS world Chromium pixels / shadows / GPU restoration: ' + ('touch viewport' if mobile else 'desktop viewport'))


# Start Playwright and guarantee its driver is released when checks finish.
with sync_playwright() as playwright:
    # Use a configured/system browser locally or Playwright's managed Chromium in CI.
    browser_path = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    # Software WebGL is a development fallback, not a claim about real phone GPU performance.
    browser = playwright.chromium.launch(executable_path=browser_path, headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    # Verify the default world at desktop dimensions first.
    check_world(browser, mobile=False)
    # Verify the same depth/shadow contract under a high-density phone/touch viewport.
    check_world(browser, mobile=True)
    # Release Chromium after both complete checks.
    browser.close()
