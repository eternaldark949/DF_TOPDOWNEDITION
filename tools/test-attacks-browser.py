"""Ordinary player input uses selected registry attacks; custom characters use the same API."""
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
  page.select_option('#weapon','pistol_fpx');page.click('#learn-abilities');page.select_option('#attack','ability:fireball')
  page.evaluate('''()=>{const {engine,player}=runtimeExample,api=engine.api;globalThis.attackCheck={count:0,guns:0,body:player.body,grid:api.physics.spatial_grid,target:api.actors.spawn({kind:'actor',position:[260,180],data:{health:1000,max_health:1000,alliance:'hostile'}})};api.session.on('attack:executed',event=>{if(event.entity_id===player.entity_id)attackCheck.count++;});api.session.on('weapon:fired',event=>{if(event.entity_id===player.entity_id)attackCheck.guns++;});player.lookInDirection([1,0]);}''')
  page.evaluate('document.activeElement.blur()')
  page.keyboard.down('Space')
  try:page.wait_for_function('attackCheck.target.hp===950',timeout=5000)
  except Exception:
   print(page.evaluate('''()=>{const a=runtimeExample.engine.api;return {count:attackCheck.count,guns:attackCheck.guns,hp:attackCheck.target.hp,selected:a.attacks.getSelectedAttack(runtimeExample.player).attack_id,keys:a.controls.keyboard.getActiveInputs(),fire:a.controls.active('fire'),pose:runtimeExample.player.position,rotation:runtimeExample.player.rotation,weapon:a.weapons.state,errors:undefined};}'''));print(errors);raise
  page.keyboard.up('Space')
  report=page.evaluate('''()=>{const {engine,player}=runtimeExample;return {count:attackCheck.count,guns:attackCheck.guns,health:attackCheck.target.hp,selected:engine.api.attacks.getSelectedAttack(player).attack_id,held:engine.api.items.getEquippedWeapon().definition_id};}''')
  assert report=={'count':1,'guns':0,'health':950,'selected':'ability:fireball','held':'pistol_fpx'},report
  transition=page.evaluate('''async()=>{const {engine,player}=runtimeExample;await engine.loadLevel('room_b');const resume=engine.pause('attack-check'),before=JSON.stringify(engine.api.physics.savePhysicsState());for(let i=0;i<3;i++)engine.render(.5);const result={sameBody:player.body===attackCheck.body,sameGrid:engine.api.physics.spatial_grid===attackCheck.grid,selected:engine.api.attacks.getSelectedAttack(player).attack_id,stable:before===JSON.stringify(engine.api.physics.savePhysicsState())};resume();return result;}''')
  assert transition=={'sameBody':True,'sameGrid':True,'selected':'ability:fireball','stable':True},transition
  page.evaluate('runtimeExample.engine.dispose()');assert not errors,errors
  print(json.dumps({'playerInput':report,'transition':transition,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
