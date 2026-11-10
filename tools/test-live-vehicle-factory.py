"""Optional: verify the actual generated classic client in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import which
from threading import Thread
from playwright.sync_api import sync_playwright
import json
root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=which('chromium') or None, args=['--no-sandbox'])
        page = browser.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/DFAB%20V8.html', wait_until='load')
        page.wait_for_function("typeof game !== 'undefined' && !!game.ownedCar", timeout=90000)
        result = page.evaluate('''() => {
            const van = gameVehicles.create({purpose:'mission',mission_id:'amber_delivery',anchor:{position:[1000,1000]}});
            const manager = new TrafficManager();
            manager.network = {allLanes:[{start:{x:0,y:0},end:{x:400,y:0},angle:0,length:400,ux:1,uy:0}],laneHasExit:()=>true};
            const service = new ZibSystem(), request = service.summonNearest(manager,[200,20]);
            return {owned:game.ownedCar.data.purpose,mission:[van.x,van.y,van.color],taxi:[request.vehicle.x,request.vehicle.y],registered:manager.vehicles.length};
        }''')
        assert result == {'owned':'owned','mission':[920,1020,'#58391C'],'taxi':[200,0],'registered':1}, result
        assert not errors, errors
        print(json.dumps({'passed':True,'browser_errors':errors,'result':result},indent=2)); browser.close()
finally:
    server.shutdown(); server.server_close()
