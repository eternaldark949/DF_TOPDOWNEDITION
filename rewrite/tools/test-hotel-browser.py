"""Verify the real hotel's WebGL surfaces, static resources, contacts, and recovery.

The standalone HTML runs offline in actual Chromium. Software GPU pixels establish
behavior here, not FPS or browser support on the owner's phone. This asset proof is
not a full game, staff animation, bloom, or searchlight migration.
"""
# Locate the production artifact and optional screenshot evidence directory.
from pathlib import Path
# Read the optional evidence destination from the command line.
import sys
# Respect an explicitly configured development browser executable.
import os
# Prefer an installed Chromium before Playwright's managed browser.
import shutil
# Exercise real GPU output and browser lifecycle events.
from playwright.sync_api import sync_playwright

# Read the same complete HTML that the owner can download as one offline file.
artifact_html = (Path(__file__).resolve().parent.parent / 'ETRNL9 Foundation.html').read_text()
# Screenshots are optional evidence and are not additional runtime dependencies.
evidence_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def check_hotel(browser, mobile):
    """Exercise one actual desktop/touch viewport, then deterministic GPU/contact scenarios."""
    # Disable external networking and use a real high-density backing canvas.
    context = browser.new_context(offline=True, viewport={'width': 390, 'height': 844} if mobile else {'width': 1200, 'height': 950}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
    # Start an independent page so asset and GPU lifetime cannot leak between scenarios.
    page = context.new_page()
    # Record page exceptions before any engine or asset code executes.
    errors = []
    # External requests would violate the single-file offline contract.
    external_requests = []

    def record_error(error):
        """Keep the concrete browser exception for the final failure assertion."""
        # A Python wrapper is compatible with Playwright's callback annotations.
        errors.append(str(error))

    # Subscribe before loading the actual artifact.
    page.on('pageerror', record_error)
    # Count only external traffic; embedded data-image decoding remains permitted.
    page.on('request', lambda request: external_requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
    # Instrument Canvas access before the original hotel images are decoded.
    page.evaluate("""() => {
        // Preserve the browser's real implementation rather than mocking its pixels.
        const original = HTMLCanvasElement.prototype.getContext;
        // Count actual Canvas 2D requests during this real asset's runtime.
        window.hotelCanvasPaintRequests = 0;
        /** Permit Canvas image generation if requested, while recording every 2D context request. */
        HTMLCanvasElement.prototype.getContext = function(kind, ...options) {
            // A prepared image must never force a Canvas world frame or a repeated repaint.
            if (kind === '2d') {
                // Count real requests rather than inferring behavior from source names.
                window.hotelCanvasPaintRequests += 1;
            }
            // Preserve the actual canvas receiver and requested browser options.
            return original.apply(this, [kind, ...options]);
        };
    }""")
    # Load exact delivered bytes without a server or external assets.
    page.set_content(artifact_html)
    # Image decoding and actual asset installation complete before the one Lobby begins.
    page.wait_for_function('window.foundationReady === true && foundationEngine.directory.systems.get("worldRenderer").statistics.vertices > 0')
    # The delivered file should open on the requested real asset, not a placeholder primitive scene.
    assert page.locator('#study-control').input_value() == 'hotel'
    # Both source wall/roof surfaces and prepared detail layers must actually be present.
    assert page.evaluate('foundationEngine.directory.systems.get("worldRenderer").statistics.visibleElements') > 700
    # Source images were prepared with Canvas once during authoring, never repainted at runtime.
    assert page.evaluate('window.hotelCanvasPaintRequests') == 0
    # Give the hardware-presentation surface one screenshot as evidence of the real default study.
    if evidence_directory:
        # Create the selected development evidence folder without adding runtime file dependencies.
        evidence_directory.mkdir(parents=True, exist_ok=True)
        # Preserve an actual presented browser frame, not a synthetic artist's reconstruction.
        page.screenshot(path=str(evidence_directory / ('hotel-phone-day.png' if mobile else 'hotel-desktop-day.png')), full_page=True)
    # Freeze recurring work so actor movement cannot race deterministic resource/pixel assertions.
    page.evaluate('foundationEngine.stop()')
    # Actual camera-only movement and ordinary actor motion must retain static hotel buffers/images.
    assert page.evaluate("""() => {
        // Resolve the same world backend used by normal scheduled rendering.
        const world = foundationEngine.directory.systems.get('worldRenderer');
        // Obtain the displayed renderer and its public camera contract.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Keep image upload accounting separate from geometry-buffer accounting.
        const artwork = foundationEngine.directory.systems.get('artwork');
        // Draw once after stopping to establish the current complete output and active batch set.
        renderer.render({interpolationFraction: 1});
        // Retain initial successful image upload count for every subsequent movement check.
        const uploads = artwork.uploadCount;
        // Retain actual static GPU buffer identities, excluding the independently moving actor batch.
        const staticBuffers = new Map();
        // “of” supplies [interface key,batch] pairs and stops after all current retained batches.
        for (const [key, batch] of world.cameraBatches.entries) {
            // Every source member must belong to the placed hotel for this to be a static hotel batch.
            if (batch.sources.every((source) => source.element.identifier.startsWith('hotel.'))) {
                // Save the actual GPU handle rather than merely its vertex count.
                staticBuffers.set(key, batch.buffer);
            }
        }
        // Count twelve camera adjustments from zero, increasing once and stopping before twelve.
        for (let frameIndex = 0; frameIndex < 12; frameIndex += 1) {
            // Alternate eye positions without changing source images, geometry, or object state.
            renderer.camera.positionX = 400 + (frameIndex % 2 ? 30 : -30);
            // Production output updates only camera uniforms for retained asset buffers.
            renderer.render({interpolationFraction: 1});
            // A camera change alone must neither rebuild nor upload any vertex buffer.
            if (world.statistics.bufferUploads !== 0) return false;
        }
        // Resolve the ordinary physical test actor through the normal scene registry.
        const actor = foundationEngine.directory.elements.get('hotel-study.actor');
        // Count twelve actor position edits, stopping before twelve and advancing by one.
        for (let moveIndex = 0; moveIndex < 12; moveIndex += 1) {
            // A tracked actor edit invalidates its own mesh, not the hotel's source triangles.
            actor.transform.positionX += 0.5;
            // Draw actual production output with that one moved dynamic element.
            renderer.render({interpolationFraction: 1});
            // Exactly its independent material batch should require a vertex-buffer replacement.
            if (world.statistics.bufferUploads !== 1) return false;
            // Every static hotel interface must retain the same actual GPU allocation.
            for (const [key, buffer] of staticBuffers) {
                // Static elements must not get silently folded into the actor's changing batch.
                if (world.cameraBatches.entries.get(key)?.buffer !== buffer) return false;
            }
        }
        // Recenter the eye before later projection/pixel/contact assertions.
        renderer.camera.positionX = 400;
        // Texture demands during those frames must have added no CPU paint or GPU image upload.
        return artwork.paintCount === 0 && artwork.uploadCount === uploads;
    }""")
    # Compare the new radial helper with the original hotel's documented lean formula.
    assert page.evaluate("""() => {
        // Resolve the physical camera and the helper used by pointer input and GPU uniforms.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Original altitude changes with zoom, preserving the same bounded range.
        const altitude = 700 * Math.max(0.7, Math.min(3.2, 1 / renderer.camera.zoom));
        // Source design height 132 corresponds to 264 physical world units.
        const height = 264;
        // Preserve the source hotel's original 1.5 height emphasis exactly.
        const scale = 1 + (altitude / (altitude - Math.min(height, altitude * 0.86)) - 1) * 1.5;
        // Project a real rotunda/front point, not only the world origin.
        const point = renderer.worldToScreen(400, 430, height);
        // Independent expected vertical position follows the original source equation plus view framing.
        const expectedY = (430 - renderer.camera.positionY) * scale * renderer.camera.zoom + renderer.viewportHeight / 2 + renderer.camera.screenOffsetY;
        // Invert that point on the same explicitly chosen physical plane.
        const restored = renderer.screenToWorld(point.positionX, point.positionY, height);
        // Shader setup uses the same camera values; this checks the independently stated CPU formula.
        return Math.abs(point.positionY - expectedY) < 1e-8 && Math.abs(restored.positionY - 430) < 1e-8;
    }""")
    # Exercise real cached night images through the visible control, without repainting source windows.
    page.get_by_role('button', name='Show night artwork', exact=True).click()
    # Render one stopped frame with the changed time-of-day uniform.
    page.evaluate('foundationEngine.directory.systems.get("renderer").render({interpolationFraction: 1})')
    # Night state must change without a Canvas generation request.
    assert page.evaluate('foundationEngine.directory.systems.get("renderer").nightAmount') == 1
    # Record actual night output, including visible window emission on physical surfaces.
    if evidence_directory:
        # Capture the same real browser/viewport used for the daytime evidence.
        page.screenshot(path=str(evidence_directory / ('hotel-phone-night.png' if mobile else 'hotel-desktop-night.png')), full_page=True)
    # Restore daytime before deterministic source-art sampling.
    page.get_by_role('button', name='Show day artwork', exact=True).click()
    # Actual roof pixels must hide a lower luminous surface, with no roof-specific draw order handler.
    assert page.evaluate("""() => {
        // Resolve the shared scene and output owner.
        const scene = foundationEngine.directory.systems.get('scene');
        // Use the same displayed WebGL context for final-output readback.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Choose a real painted mansard roof center at its authored physical elevation.
        const point = renderer.worldToScreen(145, 180, 212);
        /** Read one actual displayed GPU pixel immediately after production rendering. */
        const read = () => {
            // The browser may discard its backbuffer later, so draw/read within this same task.
            renderer.render({interpolationFraction: 1});
            // Allocate one output RGBA pixel for readback.
            const pixel = new Uint8Array(4);
            // Convert top-left CSS coordinates to bottom-left GPU backing coordinates.
            renderer.graphics.readPixels(Math.floor(point.positionX * renderer.pixelRatio), renderer.canvas.height - 1 - Math.floor(point.positionY * renderer.pixelRatio), 1, 1, renderer.graphics.RGBA, renderer.graphics.UNSIGNED_BYTE, pixel);
            // Ordinary channel values are sufficient for exact before/after comparison.
            return Array.from(pixel);
        };
        // Capture the real source roof artwork before adding a lower luminous plane.
        const before = read();
        // Choose the ground point that projects onto exactly this roof pixel.
        const ground = renderer.screenToWorld(point.positionX, point.positionY, 0);
        // Register a plain lower light-emitting surface through the ordinary scene API.
        scene.createElement('hotel-depth-probe', {shape:'plane', positionX:ground.positionX, positionY:ground.positionY, width:40, depth:40, body:false, material:{color:'#000000', emission:'#ff00ff'}});
        // The same roof pixel must retain source artwork because physical Z hides the lower emission.
        const after = read();
        // Remove this test-owned element before ordinary feature cleanup is exercised.
        scene.removeElement('hotel-depth-probe');
        // Preserve one real source roof sample for checking GPU restoration later.
        window.hotelRoofPixelBeforeLoss = before;
        // A meaningful source color and exact pixel equality rule out a blank-output false pass.
        return before[3] === 255 && before[0] + before[1] + before[2] > 40 && before.every((channel,index) => channel === after[index]);
    }""")
    # Ordinary generic physics must block approach to the original curved-front collision bands.
    assert page.evaluate("""() => {
        // Read the same controlled test actor that was visible beside the actual hotel.
        const actor = foundationEngine.directory.elements.get('hotel-study.actor');
        // Physics sees all original supported solid sections, independent from camera visibility.
        const physics = foundationEngine.directory.systems.get('physics');
        // Start out in front of the rotunda without any initial penetration.
        actor.transform.setPosition(400, 480, 0);
        // Count sixty fixed steps from zero, increasing once and excluding sixty.
        for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
            // Controls continually request forward movement; contacts own separation/response.
            actor.body.velocityY = -130;
            // Advance one ordinary sixtieth of a second, with no hotel/actor-specific handler.
            physics.update(1 / 60);
        }
        // Original valid bands stop this ten-unit-radius actor near ground Y 430.
        return actor.transform.positionY >= 429 && actor.transform.positionY < 445;
    }""")
    # Preserve cache measurements before losing the real displayed GPU context.
    page.evaluate('window.hotelUploadsBeforeLoss = foundationEngine.directory.systems.get("artwork").uploadCount')
    # Trigger actual browser context loss through the supported extension.
    page.evaluate("""() => {
        // Retain the real extension across asynchronous loss/restoration events.
        window.hotelLossExtension = foundationEngine.directory.systems.get('renderer').graphics.getExtension('WEBGL_lose_context');
        // Ask the browser to invalidate the actual context that owns all hotel textures/buffers.
        window.hotelLossExtension.loseContext();
    }""")
    # Require the production handler to observe loss before requesting restoration.
    page.wait_for_function('foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # Restore the same actual GPU context without constructing another engine or scheduler.
    page.evaluate('window.hotelLossExtension.restoreContext()')
    # Wait for production to forget lost handles and permit normal resource reconstruction.
    page.wait_for_function('!foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # One ordinary render must reupload preserved images and rebuild retained geometry correctly.
    page.evaluate('foundationEngine.directory.systems.get("renderer").render({interpolationFraction: 1})')
    # Restored textures must reproduce actual source roof pixels, not merely increment upload counters.
    assert page.evaluate("""() => {
        // Sample the same real roof location used before loss.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Physical camera framing remains unchanged across context recovery.
        const point = renderer.worldToScreen(145,180,212);
        // Render/read in this task because the displayed backbuffer need not persist after presentation.
        renderer.render({interpolationFraction:1});
        // Allocate one real output RGBA pixel.
        const pixel = new Uint8Array(4);
        // Convert source world projection to the displayed backing-image coordinate.
        renderer.graphics.readPixels(Math.floor(point.positionX*renderer.pixelRatio),renderer.canvas.height-1-Math.floor(point.positionY*renderer.pixelRatio),1,1,renderer.graphics.RGBA,renderer.graphics.UNSIGNED_BYTE,pixel);
        // A small rounding tolerance permits device conversion, not a missing source texture.
        return Array.from(pixel).every((channel,index)=>Math.abs(channel-window.hotelRoofPixelBeforeLoss[index])<=3) && renderer.graphics.getError()===renderer.graphics.NO_ERROR;
    }""")
    # Restoring source images must require zero Canvas repaint callbacks.
    assert page.evaluate('foundationEngine.directory.systems.get("artwork").paintCount') == 0
    # Actual new image uploads prove restoration did not simply reuse invalid old handles.
    assert page.evaluate('foundationEngine.directory.systems.get("artwork").uploadCount > window.hotelUploadsBeforeLoss')
    # No Canvas 2D world fallback or original procedural repaint may occur during recovery.
    assert page.evaluate('window.hotelCanvasPaintRequests') == 0
    # Verify a phone rotation still uses real fit-view/camera/viewport ownership.
    if mobile:
        # Change the actual browser layout rather than pretending the renderer resized.
        page.set_viewport_size({'width': 844, 'height': 390})
        # Wait for the normal engine resize listener to match the displayed CSS canvas.
        page.wait_for_function('Math.abs(foundationEngine.directory.systems.get("renderer").viewportWidth - document.querySelector("canvas").getBoundingClientRect().width) < 1')
        # Production framing and camera uniforms must still draw a complete valid world.
        page.evaluate('foundationEngine.directory.systems.get("renderer").render({interpolationFraction: 1})')
    # Ordinary feature removal must release every visible surface, supported body, and callback.
    page.evaluate('foundationEngine.penthouse.uninstall("hotel-study")')
    # The instance owns no residual scene elements after uninstall.
    assert page.evaluate('foundationEngine.directory.systems.get("scene").worldElements.size') == 0
    # Contacts/bodies are released through the same scene ownership path.
    assert page.evaluate('foundationEngine.directory.systems.get("physics").bodies.size') == 0
    # The renderer must remain usable after the complete real asset is unloaded.
    page.evaluate('foundationEngine.directory.systems.get("renderer").render({interpolationFraction: 1})')
    # Teardown removes GPU buffers, resident images, event handlers, and scene/tool references.
    page.evaluate('foundationEngine.destroy()')
    # No shader/lifecycle failure or external runtime dependency can count as a successful proof.
    assert not errors, errors
    # Actual offline operation includes no attempted HTTP/HTTPS resource requests.
    assert not external_requests, external_requests
    # Close this independent browser viewport/context.
    context.close()
    # Report concrete verified behavior without claiming original-game visual parity or phone FPS.
    print('PASS real hotel / original images / radial projection / retained meshes / collision / depth / GPU restore: ' + ('phone' if mobile else 'desktop'))


# Ensure browser infrastructure is released even if an assertion fails.
with sync_playwright() as playwright:
    # Prefer explicitly configured/system Chromium, otherwise use the managed browser.
    browser_path = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    # Software rendering supports actual pixel checks without claiming hardware performance.
    browser = playwright.chromium.launch(executable_path=browser_path, headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    # Verify the asset and engine contracts in a desktop viewport.
    check_hotel(browser, mobile=False)
    # Verify the same source asset in a real touch/high-density phone viewport and rotation.
    check_hotel(browser, mobile=True)
    # Release Chromium after both viewport scenarios complete.
    browser.close()
