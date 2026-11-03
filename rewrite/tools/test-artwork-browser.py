"""Verify direct WebGL output and demand-driven Canvas artwork against real Chromium.

Read GPU texture pixels to check actual uploads. Instrument canvas context creation
before boot so an accidental final Canvas 2D compositor fails immediately. No mocked
GPU result, external runtime asset, or phone performance claim is involved.
"""
# Locate the exact standalone artifact relative to this runner.
from pathlib import Path
# Respect an explicitly selected browser in other development environments.
import os
# Otherwise prefer an installed system browser, then Playwright's managed Chromium.
import shutil
# Use actual browser canvas contexts, texture storage, and GPU lifecycle events.
from playwright.sync_api import sync_playwright

# Resolve the deliverable emitted by the production build tool.
artifact_path = Path(__file__).resolve().parent.parent / 'ETRNL9 Foundation.html'


def texture_pixel(page):
    """Prepare the test asset and read its GPU pixels, restoring the prior framebuffer."""
    # Execute production cache preparation, then inspect the actual resulting texture.
    return page.evaluate("""() => {
        // Resolve the same output context used by the running engine.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Read its GPU API owner for texture/framebuffer operations.
        const graphics = renderer.graphics;
        // Demand this asset through the production resource cache.
        const texture = foundationEngine.directory.systems.get('artwork').prepare('probe');
        // Allocate only a diagnostic attachment; this does not generate or repaint artwork.
        const framebuffer = graphics.createFramebuffer();
        // Preserve independent read/draw bindings so this probe cannot disturb the engine.
        const previousRead = graphics.getParameter(graphics.READ_FRAMEBUFFER_BINDING);
        // DRAW may differ from READ during a GPU presentation operation.
        const previousDraw = graphics.getParameter(graphics.DRAW_FRAMEBUFFER_BINDING);
        // Bind the diagnostic attachment for reading actual texture storage.
        graphics.bindFramebuffer(graphics.FRAMEBUFFER, framebuffer);
        // Attach the resident image; no intermediate Canvas or CPU image conversion is used.
        graphics.framebufferTexture2D(graphics.FRAMEBUFFER, graphics.COLOR_ATTACHMENT0, graphics.TEXTURE_2D, texture, 0);
        // One RGBA pixel is enough to distinguish the requested solid test colors.
        const pixel = new Uint8Array(4);
        // Read the image actually uploaded by ArtworkSystem.
        graphics.readPixels(0, 0, 1, 1, graphics.RGBA, graphics.UNSIGNED_BYTE, pixel);
        // Restore the original framebuffer read binding.
        graphics.bindFramebuffer(graphics.READ_FRAMEBUFFER, previousRead);
        // Restore the original framebuffer write binding separately.
        graphics.bindFramebuffer(graphics.DRAW_FRAMEBUFFER, previousDraw);
        // The diagnostic attachment no longer owns any useful state.
        graphics.deleteFramebuffer(framebuffer);
        // GPU API errors must fail rather than returning plausible but invalid black pixels.
        if (graphics.getError() !== graphics.NO_ERROR) {
            // Keep the test's evidence distinct from successful texture readback.
            throw new Error('Artwork GPU upload/readback failed');
        }
        // Convert typed-array channels into ordinary numbers for Python assertions.
        return Array.from(pixel);
    }""")


def check_artwork(browser):
    """Verify caching, invalidation, failed paints, restoration, and asset unloading."""
    # No development server or network asset is needed by the exact delivered HTML.
    context = browser.new_context(offline=True)
    # Start a fresh page before installing context-creation instrumentation.
    page = context.new_page()
    # Patch the prototype before set_content executes the engine's inline scripts.
    page.evaluate("""() => {
        // Preserve the actual browser implementation; instrumentation only records access.
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        // Count Canvas 2D image-making surfaces separately from the displayed GPU canvas.
        window.artworkCanvasRequests = 0;
        /** Track image-generation contexts and reject Canvas 2D on the displayed surface. */
        HTMLCanvasElement.prototype.getContext = function(kind, ...options) {
            // A final 2D compositor would violate the output contract immediately.
            if (kind === '2d' && this.id === 'foundation-canvas') {
                // Fail boot instead of allowing a hidden fallback output path.
                throw new Error('Displayed output requested Canvas 2D');
            }
            // Other 2D contexts are allowed only as explicitly requested artwork generation.
            if (kind === '2d') {
                // Count actual context requests, not guessed work based on source structure.
                window.artworkCanvasRequests += 1;
            }
            // apply preserves the current canvas as JavaScript's method receiver (“this”).
            return originalGetContext.apply(this, [kind, ...options]);
        };
    }""")
    # Load the production single-file artifact with instrumentation already installed.
    page.set_content(artifact_path.read_text())
    # Require real geometry submission so a boot error cannot count as no Canvas work.
    page.wait_for_function('foundationEngine.directory.systems.get("worldRenderer").statistics.vertices > 0')
    # Freeze simulation/render scheduling for exact cache-operation counts.
    page.evaluate('foundationEngine.stop()')
    # Both actual output and the world backend must refer to the same displayed canvas/context.
    assert page.evaluate("""() => {
        // Resolve the output owner, not an internal test renderer.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Resolve the world shader backend independently through the Directory.
        const world = foundationEngine.directory.systems.get('worldRenderer');
        // The displayed context must permit discarded backbuffers and have no Canvas compositor.
        return renderer.canvas === world.canvas && renderer.graphics === world.graphics &&
            renderer.graphics.getContextAttributes().preserveDrawingBuffer === false &&
            renderer.drawingContext === undefined;
    }""")
    # Rendering the default world must never create a Canvas 2D world image.
    assert page.evaluate('window.artworkCanvasRequests') == 0
    # Register one reusable generator whose color can intentionally change later.
    page.evaluate("""() => {
        // Store content inputs in the test feature, outside the reusable engine system.
        window.artworkProbeColor = '#ff0000';
        // A deliberate failing generator will test that the previous image remains usable.
        window.artworkProbeFailure = false;
        // Registration alone must not allocate or paint an image.
        foundationEngine.directory.systems.get('artwork').create('probe', 4, 4,
            /** Paint one four-pixel-square image when production explicitly demands it. */
            (drawingContext) => {
                // Simulate failed generation before publishing a replacement image.
                if (window.artworkProbeFailure) {
                    // This failure must leave the previous successful cache entry intact.
                    throw new Error('intentional paint failure');
                }
                // Select the current content input, which only matters during regeneration.
                drawingContext.fillStyle = window.artworkProbeColor;
                // Origin (0,0), width four, and height four cover this one artwork image.
                drawingContext.fillRect(0, 0, 4, 4);
            });
    }""")
    # Registration must remain inert until an asset is actually prepared.
    assert page.evaluate('window.artworkCanvasRequests') == 0
    # Read real GPU storage after the production cache performs its first paint and upload.
    assert texture_pixel(page) == [255, 0, 0, 255]
    # First use must produce exactly one successful paint and upload.
    assert page.evaluate('[foundationEngine.directory.systems.get("artwork").paintCount, foundationEngine.directory.systems.get("artwork").uploadCount]') == [1, 1]
    # Many display frames and prepare calls must reuse exactly the same resident texture.
    page.evaluate("""() => {
        // Resolve the live cache once for this feature's repeated demand.
        const artwork = foundationEngine.directory.systems.get('artwork');
        // Remember the first handle to check sharing rather than only counting paints.
        const firstTexture = artwork.prepare('probe');
        // Count twenty uses from zero, increasing by one and stopping before twenty.
        for (let useIndex = 0; useIndex < 20; useIndex += 1) {
            // Clean repeated demand must not allocate another texture handle.
            if (artwork.prepare('probe') !== firstTexture) {
                // A fresh handle here would violate resident-image sharing.
                throw new Error('Clean artwork replaced its resident texture');
            }
            // Run the actual world output frame as well, not just repeated cache lookups.
            foundationEngine.directory.systems.get('renderer').render({interpolationFraction: 1});
        }
    }""")
    # Frame rendering must add no CPU paints and no texture uploads for unchanged artwork.
    assert page.evaluate('[foundationEngine.directory.systems.get("artwork").paintCount, foundationEngine.directory.systems.get("artwork").uploadCount]') == [1, 1]
    # Change source content and coalesce two invalidation requests into one later repaint.
    page.evaluate("""() => {
        // This new input cannot affect the already uploaded image by itself.
        window.artworkProbeColor = '#0000ff';
        // Mark this asset as needing a new image on its next use.
        foundationEngine.directory.systems.get('artwork').invalidate('probe');
        // A second mark must not schedule an additional paint or recurring timer.
        foundationEngine.directory.systems.get('artwork').invalidate('probe');
    }""")
    # The requested replacement must appear in the actual uploaded GPU image.
    assert texture_pixel(page) == [0, 0, 255, 255]
    # Exactly one new paint and upload are required for that changed asset.
    assert page.evaluate('[foundationEngine.directory.systems.get("artwork").paintCount, foundationEngine.directory.systems.get("artwork").uploadCount]') == [2, 2]
    # Exercise the same real output context-loss event that invalidates world resources.
    page.evaluate("""() => {
        // Keep the browser extension available across asynchronous loss/restoration events.
        window.artworkLossExtension = foundationEngine.directory.systems.get('renderer').graphics.getExtension('WEBGL_lose_context');
        // Trigger actual GPU loss rather than manually changing engine flags.
        window.artworkLossExtension.loseContext();
    }""")
    # Wait for the actual production listener, not a timeout assumption.
    page.wait_for_function('foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # Demand during loss explicitly reports temporary unavailability.
    assert page.evaluate('foundationEngine.directory.systems.get("artwork").prepare("probe")') is None
    # Restore the displayed context through the browser's supported lifecycle extension.
    page.evaluate('window.artworkLossExtension.restoreContext()')
    # Require the production restoration listener to complete before preparing artwork.
    page.wait_for_function('!foundationEngine.directory.systems.get("worldRenderer").contextLost')
    # Preserved CPU artwork must repopulate the restored GPU with the correct image.
    assert texture_pixel(page) == [0, 0, 255, 255]
    # Restoration performs one upload and zero new paints.
    assert page.evaluate('[foundationEngine.directory.systems.get("artwork").paintCount, foundationEngine.directory.systems.get("artwork").uploadCount]') == [2, 3]
    # A failing replacement must preserve previous image/texture and remain dirty for retry.
    assert page.evaluate("""() => {
        // Resolve the cache whose ownership is being tested.
        const artwork = foundationEngine.directory.systems.get('artwork');
        // Keep the previous successful image reference for an identity check.
        const previousCanvas = artwork.require('probe').canvas;
        // Retain the previous resident GPU texture as well.
        const previousTexture = artwork.prepare('probe');
        // Make the next explicit repaint fail deliberately.
        window.artworkProbeFailure = true;
        // Request replacement using the production invalidation API.
        artwork.invalidate('probe');
        // Catch only the expected generator failure so the browser page remains inspectable.
        try {
            // A dirty asset invokes the generator and propagates its error.
            artwork.prepare('probe');
            // Reaching this return would mean the injected failure was ignored.
            return false;
        } catch (error) {
            // Both cached resources must still represent the previous complete image.
            return error.message === 'intentional paint failure' &&
                artwork.require('probe').canvas === previousCanvas &&
                artwork.require('probe').texture === previousTexture && artwork.require('probe').dirty;
        }
    }""")
    # Allow retry through the same generator without manufacturing a new cache entry.
    page.evaluate('window.artworkProbeFailure = false')
    # The next demand succeeds and uploads the intended complete image.
    assert texture_pixel(page) == [0, 0, 255, 255]
    # Unloading must delete the resident GPU handle as well as its CPU registration.
    assert page.evaluate("""() => {
        // Resolve both resource owner and actual GPU for lifecycle evidence.
        const artwork = foundationEngine.directory.systems.get('artwork');
        // Remember the handle before ordinary asset unloading releases it.
        const texture = artwork.prepare('probe');
        // Remove this one asset without destroying the engine or unrelated scene geometry.
        artwork.remove('probe');
        // A removed handle must no longer represent live GPU texture storage.
        return !artwork.entries.has('probe') && !foundationEngine.directory.systems.get('renderer').graphics.isTexture(texture);
    }""")
    # Exercise both studies under context instrumentation before releasing the page.
    page.locator('#study-control').select_option('loop')
    # Run the same output frame after switching to the interpolation study.
    page.evaluate('foundationEngine.directory.systems.get("renderer").render({interpolationFraction: 1})')
    # The same GPU context must still own the displayed canvas after feature switching.
    assert page.evaluate('foundationEngine.directory.systems.get("renderer").graphics === document.getElementById("foundation-canvas").getContext("webgl2")')
    # Release the production engine and all its asset/scene ownership.
    page.evaluate('foundationEngine.destroy()')
    # Close the independent offline browser context.
    context.close()
    # Report the concrete contract verified with actual CPU canvases and GPU texture pixels.
    print('PASS direct WebGL output / demand-driven artwork / GPU upload cache / restoration / unload')


# Start the driver through a context manager so failures still close browser infrastructure.
with sync_playwright() as playwright:
    # Prefer a selected/system executable; None requests Playwright's managed browser.
    browser_path = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    # Software WebGL makes GPU pixel checks possible without claiming real phone performance.
    browser = playwright.chromium.launch(executable_path=browser_path, headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    # Exercise the production cache and final output path in an independent offline page.
    check_artwork(browser)
    # Release Chromium after all actual texture/lifecycle assertions pass.
    browser.close()
