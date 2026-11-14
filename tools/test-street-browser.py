"""Optional street-client browser check: Python Playwright and Chromium."""
from pathlib import Path
from shutil import which
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
import json
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=which('chromium') or None,args=['--no-sandbox'])
  page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/src/legacy/directory/examples/street-population.html',wait_until='networkidle')
  page.wait_for_timeout(1000)
  before=json.loads(page.locator('#stats').inner_text())
  page.locator('#combine-mass').check()
  page.locator('#ride').click();page.wait_for_timeout(300)
  mounted=json.loads(page.locator('#stats').inner_text());assert mounted['pedestrians'][0]['parent_body_id'] is not None,mounted
  assert mounted['vehicles'][0]['mass']['mass']>before['vehicles'][0]['mass']['mass'],mounted
  assert mounted['physics']['spatial']['instances']==5,mounted
  mounted_position=mounted['pedestrians'][0]['position']
  page.wait_for_timeout(400)
  moving=json.loads(page.locator('#stats').inner_text());assert moving['pedestrians'][0]['position']!=mounted_position,moving
  page.locator('#ride').click();page.wait_for_timeout(300)
  released=json.loads(page.locator('#stats').inner_text());assert released['pedestrians'][0]['parent_body_id'] is None,released
  assert released['vehicles'][0]['mass']['mass']==before['vehicles'][0]['mass']['mass'],released
  page.locator('#signal').click();page.wait_for_timeout(6000)
  after=json.loads(page.locator('#stats').inner_text())
  assert after['physics']['steps']>before['physics']['steps']
  assert after['physics']['entities']==5,after
  assert after['physics']['spatial']['instances']==5,after
  page.locator('#reset').click();page.wait_for_timeout(100)
  screenshot=Path('/workspace/scratch/street-population.png')
  if screenshot.parent.exists(): page.screenshot(path=str(screenshot))
  assert not errors,errors
  print(json.dumps({'passed':True,'errors':errors,'statistics':after},indent=2))
  browser.close()
finally:server.shutdown();server.server_close()
