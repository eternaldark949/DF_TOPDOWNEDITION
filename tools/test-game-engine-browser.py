"""Exercise the actual new runtime, its Lobby and two Directory-authored levels."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from shutil import which
from playwright.sync_api import sync_playwright
import json
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1])))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=which('chromium') or None,args=['--no-sandbox'])
  page=browser.new_page();errors=[]
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/src/runtime/examples/',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  initial=page.evaluate('''() => {const {engine,player}=runtimeExample;globalThis.runtimeBefore={world:engine.api.physics,grid:engine.api.physics.spatial_grid,body:player.body};return {x:player.position[0],id:player.entity_id,bodies:engine.api.physics.getStatistics().bodies};}''')
  page.evaluate('''() => {const {session}=runtimeExample.engine.api;session.player.takeDamage(20);session.setRecord('equipment','weapon','test');session.addItem('stims',2);}''')
  page.keyboard.down('d')
  page.wait_for_function('start=>runtimeExample.player.position[0]>start+20',arg=initial['x'])
  page.keyboard.up('d')
  page.click('#switch');page.wait_for_function("runtimeExample.engine.active_level.level_id==='room_b'")
  transition=page.evaluate('''() => {const {engine,player}=runtimeExample;return {sameWorld:runtimeBefore.world===engine.api.physics,sameGrid:runtimeBefore.grid===engine.api.physics.spatial_grid,sameBody:runtimeBefore.body===player.body,id:player.entity_id,bodies:engine.api.physics.getStatistics().bodies};}''')
  gameplay=page.evaluate('''() => {const s=runtimeExample.engine.api.session;return {health:s.player.hp,weapon:s.getRecord('equipment','weapon'),stims:s.getRecord('inventory','stims')};}''')
  assert gameplay=={'health':80,'weapon':'test','stims':2},gameplay
  assert transition=={'sameWorld':True,'sameGrid':True,'sameBody':True,'id':initial['id'],'bodies':4},transition
  frozen=page.evaluate('''() => {document.getElementById('pause').click();return JSON.stringify(runtimeExample.engine.api.physics.savePhysicsState());}''')
  page.evaluate('''() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))''')
  assert page.evaluate('JSON.stringify(runtimeExample.engine.api.physics.savePhysicsState())')==frozen
  report=page.evaluate('''() => {
   const {engine,player}=runtimeExample;let rejected=false;try{engine.api.physics.updateState();}catch{rejected=true;}
   const tick=engine.api.physics.simulation_tick;
   for(let i=0;i<5;i++)engine.render(.3);
   const stable=tick===engine.api.physics.simulation_tick;
   engine.dispose();return {rejected,renderStable:stable,disposed:engine.destroyed,bodies:engine.api.physics.getStatistics().bodies,legacy:typeof GameEngine};
  }''')
  assert report=={'rejected':True,'renderStable':True,'disposed':True,'bodies':0,'legacy':'undefined'},report
  assert not errors,errors
  print(json.dumps({'initial':initial,'transition':transition,'gameplay':gameplay,'report':report,'errors':errors},indent=2))
  browser.close()
finally:server.shutdown();server.server_close()
