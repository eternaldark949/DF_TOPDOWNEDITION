"""Run the generated offline artifact in real Chromium, on desktop and touch viewports.

Requires development-only Python Playwright and a Chromium executable. The playable
HTML has no such dependency. These checks load the exact HTML bytes with networking disabled;
they verify visible pixels and real browser events, not performance on the owner's phone.
"""
# Resolve the built artifact and optional screenshot output relative to this runner.
from pathlib import Path
# Read optional command-line arguments without introducing a third-party CLI parser.
import sys
# Permit an explicit CI browser path without depending on one workspace filesystem layout.
import os
# Prefer an installed system Chromium when available; otherwise use Playwright's managed browser.
import shutil
# Playwright drives the real installed Chromium browser for event and pixel checks.
from playwright.sync_api import sync_playwright

# Locate the rewrite folder above tools/.
rewrite_root = Path(__file__).resolve().parent.parent
# Read the same one-file artifact the owner will download.
artifact_html = (rewrite_root / 'ETRNL9 Foundation.html').read_text()
# Screenshots are optional local evidence, excluded from the committed source tree.
screenshot_directory = Path(sys.argv[1]) if len(sys.argv) > 1 else None


def check_browser(browser, mobile):
    """Exercise one fresh desktop or touch context; close it after all assertions pass."""
    # Choose an actual phone-like layout without requiring a physical device.
    viewport = {'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}
    # Disable network access, enable touch on the phone run, and use a high-density screen.
    context = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=3, offline=True)
    # Begin with a fresh page so globals and listeners cannot leak from another test.
    page = context.new_page()
    # Collect real unhandled JavaScript errors, including animation callback failures.
    page_errors = []
    def record_page_error(error):
        """Keep the actual browser exception for the final no-errors assertion."""
        # Playwright needs a Python function wrapper rather than the built-in list method.
        page_errors.append(error)

    # Preserve each page error for the final assertion.
    page.on('pageerror', record_page_error)
    # Collect attempted network URLs to detect accidental external assets.
    external_requests = []
    # Record only network requests; the top-level local file is expected.
    page.on('request', lambda request: external_requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
    # Load the artifact's exact bytes with networking disabled and no development server.
    # Managed Chromium blocks file:// navigation, so this checks standalone content
    # without claiming to test the owner's phone file-opening application.
    page.set_content(artifact_html)
    # Preserve the original Canvas-only test contract within the same new deliverable.
    page.locator('#study-control').select_option('loop')
    # Wait for the real engine to render enough frames to establish it is running.
    page.wait_for_function('window.foundationEngine?.directory.tools.get("profiler").frameCount > 5')
    # Verify the canvas actually contains the cream player marker, not just a working counter.
    assert page.evaluate("""() => {
        // Read the actual renderer and its backing image.
        const renderer = foundationEngine.directory.systems.get('renderer');
        // Sample the center, where the study places the cream marker initially.
        const pixel = renderer.drawingContext.getImageData(Math.floor(renderer.canvas.width / 2), Math.floor(renderer.canvas.height / 2), 1, 1).data;
        // Cream has high red and green channels; a blank dark canvas cannot pass.
        return pixel[0] > 230 && pixel[1] > 200 && pixel[3] === 255;
    }""")
    # Check that the density cap is effective in the actual browser.
    assert page.evaluate('foundationEngine.directory.systems.get("renderer").pixelRatio') == 2
    # A touch-sized page must not require horizontal scrolling.
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    # Use the visible control to freeze simulation while allowing rendering to continue.
    page.get_by_role('button', name='Pause', exact=True).click()
    # Record actual simulation and render counts after the click has been processed.
    paused_counts = page.evaluate('({steps: foundationEngine.directory.tools.get("profiler").simulationSteps, frames: foundationEngine.directory.tools.get("profiler").frameCount})')
    # Wait on observed frame progression rather than sleeping for a guessed duration.
    page.wait_for_function('(before) => foundationEngine.directory.tools.get("profiler").frameCount > before + 3', arg=paused_counts['frames'])
    # Pause must leave simulation exactly where the click stopped it.
    assert page.evaluate('foundationEngine.directory.tools.get("profiler").simulationSteps') == paused_counts['steps']
    # Resume through the same visible control.
    page.get_by_role('button', name='Resume', exact=True).click()
    # Stop should cancel actual requestAnimationFrame delivery.
    page.get_by_role('button', name='Stop', exact=True).click()
    # Capture the stopped count before waiting for several browser repaint opportunities.
    stopped_frames = page.evaluate('foundationEngine.directory.tools.get("profiler").frameCount')
    # Three independent browser frame callbacks allow a leaked engine loop to reveal itself.
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))')
    # No engine frame should have been executed during those repaint opportunities.
    assert page.evaluate('foundationEngine.directory.tools.get("profiler").frameCount') == stopped_frames
    # Restart the same engine and scene.
    page.get_by_role('button', name='Start', exact=True).click()
    # Wait until the restarted engine has really rendered again.
    page.wait_for_function('(before) => foundationEngine.directory.tools.get("profiler").frameCount > before + 2', arg=stopped_frames)
    # Change zoom through the harness rather than mutating the renderer in test code.
    page.get_by_label('Zoom').select_option('1.5')
    # Confirm the control reached the actual camera.
    assert page.evaluate('foundationEngine.directory.systems.get("renderer").camera.zoom') == 1.5
    # Read the canvas's actual on-page layout for a pointer gesture.
    canvas_bounds = page.locator('canvas').bounding_box()
    # Pick a target sixty CSS pixels to the right of the view center.
    pointer_x = canvas_bounds['x'] + canvas_bounds['width'] / 2 + 60
    # Keep the vertical target at the center of the canvas.
    pointer_y = canvas_bounds['y'] + canvas_bounds['height'] / 2
    # Use actual touch input in the mobile run, mouse drag on desktop.
    if mobile:
        # CDP delivers a held touch gesture; a tap could finish between simulation steps.
        touch_session = context.new_cdp_session(page)
        # Hold the primary touch at the chosen CSS-pixel target.
        touch_session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pointer_x, 'y': pointer_y}]})
    else:
        # Move the desktop mouse to the target before pressing.
        page.mouse.move(pointer_x, pointer_y)
        # Keep the pointer held until a real simulation step consumes it.
        page.mouse.down()
    # The target should map to 40 world units at zoom 1.5, within layout roundoff.
    page.wait_for_function('Math.abs(foundationEngine.directory.elements.get("study.player").positionX - 40) < 1')
    # End the gesture using the same device type that started it.
    if mobile:
        # Release the held primary touch.
        touch_session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    else:
        # Release the desktop pointer.
        page.mouse.up()
        # Focus the canvas so physical keyboard input is intended for the scene.
        page.locator('canvas').focus()
        # Hold one key to move the marker through real browser events.
        page.keyboard.down('KeyD')
        # Observe movement rather than waiting an arbitrary duration.
        page.wait_for_function('foundationEngine.directory.elements.get("study.player").positionX > 45')
        # Release movement to avoid leaking held controls into later checks.
        page.keyboard.up('KeyD')
    # Resize/rotate to check the renderer reacts to the host layout.
    page.set_viewport_size({'width': 844, 'height': 390} if mobile else {'width': 960, 'height': 720})
    # Wait for the new viewport and the renderer's CSS width, not an old matching pair.
    page.wait_for_function('(width) => window.innerWidth === width && Math.abs(foundationEngine.directory.systems.get("renderer").viewportWidth - document.querySelector("canvas").getBoundingClientRect().width) < 1', arg=844 if mobile else 960)
    # Wait until backing allocation agrees with the current rendered CSS width.
    page.wait_for_function('Math.abs(foundationEngine.directory.systems.get("renderer").canvas.width - Math.round(document.querySelector("canvas").getBoundingClientRect().width * 2)) <= 1')
    # Save optional visual evidence before removing the test content.
    if screenshot_directory:
        # Create the caller-selected evidence folder if needed.
        screenshot_directory.mkdir(parents=True, exist_ok=True)
        # Wait for the sampled HUD dimensions to catch up with the actual renderer.
        page.wait_for_function('document.getElementById("resolution-value").textContent === `${foundationEngine.directory.systems.get("renderer").canvas.width} × ${foundationEngine.directory.systems.get("renderer").canvas.height}`')
        # Label screenshots by viewport type so desktop and touch evidence remain distinct.
        page.screenshot(path=str(screenshot_directory / ('mobile.png' if mobile else 'desktop.png')), full_page=True)
        # Preserve phone portrait evidence as well as the rotated layout.
        if mobile:
            # Restore the original phone viewport after checking landscape resize.
            page.set_viewport_size(viewport)
            # Require the actual phone width and its new renderer size before capturing.
            page.wait_for_function('(width) => window.innerWidth === width && Math.abs(foundationEngine.directory.systems.get("renderer").viewportWidth - document.querySelector("canvas").getBoundingClientRect().width) < 1', arg=viewport['width'])
            # Wait until actual allocation and the diagnostic label agree again.
            page.wait_for_function('document.getElementById("resolution-value").textContent === `${foundationEngine.directory.systems.get("renderer").canvas.width} × ${foundationEngine.directory.systems.get("renderer").canvas.height}`')
            # Capture the full readable portrait page before cleanup.
            page.screenshot(path=str(screenshot_directory / 'mobile-portrait.png'), full_page=True)
    # Uninstall the toy while the engine is running to verify optionality in the real browser.
    page.evaluate('foundationEngine.penthouse.uninstall("rectangle-study")')
    # No renderer pass should retain a reference to the removed toy.
    assert page.evaluate('foundationEngine.directory.systems.get("renderer").renderPasses.length') == 0
    # No element registration should remain from the removed toy.
    assert page.evaluate('foundationEngine.directory.elements.entries.size') == 0
    # Destroy the now-empty engine and cancel scheduling.
    page.evaluate('foundationEngine.destroy()')
    # No callback ID should remain outstanding after destruction.
    assert page.evaluate('foundationEngine.lobby.animationRequestId') is None
    # All browser-side JavaScript must have executed without unhandled errors.
    assert not page_errors, page_errors
    # Offline means no attempted external runtime asset requests, not merely cached assets.
    assert not external_requests, external_requests
    # Close the page and its independent device context.
    context.close()
    # Report which real-browser input/layout path passed.
    print('PASS offline Chromium: ' + ('touch / phone / rotation' if mobile else 'desktop / keyboard / mouse'))


# Start and close Playwright's driver through its managed context.
with sync_playwright() as playwright:
    # Local work uses system Chromium; CI can install Playwright's matching managed browser.
    browser_path = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    # Software WebGL also permits the default shared-world scene to initialize before selection.
    browser = playwright.chromium.launch(executable_path=browser_path, headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    # Exercise desktop lifecycle and actual keyboard/mouse input.
    check_browser(browser, mobile=False)
    # Exercise phone layout, actual touch events, and landscape resize.
    check_browser(browser, mobile=True)
    # Release Chromium after both independent contexts pass.
    browser.close()
