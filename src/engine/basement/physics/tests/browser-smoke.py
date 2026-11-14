"""Optional: Python Playwright + Chromium. Starts/stops its own local HTTP server."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from shutil import which
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=which("chromium") or None, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1000, "height": 850})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"http://127.0.0.1:{server.server_port}/examples/", wait_until="networkidle")
        canvas = page.locator("canvas")
        before = canvas.screenshot()
        page.keyboard.down("KeyD")
        page.wait_for_timeout(350)
        page.keyboard.up("KeyD")
        page.wait_for_timeout(100)
        assert canvas.screenshot() != before, "Keyboard request should move the rendered character"
        canvas.click(position={"x": 540, "y": 150})
        page.wait_for_timeout(900)
        import json
        stats = json.loads(page.locator("#stats").inner_text())
        assert stats["narrow_checks"] > 0, stats
        page.locator("#reset").click()
        page.wait_for_timeout(100)
        assert not errors, errors
        screenshot = Path("/workspace/scratch/physics-sandbox.png")
        if screenshot.parent.exists():
            page.screenshot(path=str(screenshot))
        print(json.dumps({"passed": True, "browser_errors": errors, "statistics": stats}, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
