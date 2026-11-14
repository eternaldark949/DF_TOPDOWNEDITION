"""Real input, shared native combat, world loot and renderer-neutral presentation."""
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
  page.goto(f'http://127.0.0.1:{server.server_port}/src/game/examples/index.html',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  page.select_option('#weapon','pistol_fpx')
  point=page.evaluate('''() => {
   const e=runtimeExample.engine,a=e.api,p=a.session.player;globalThis.combatTarget=e.createEntity({template:'df:character',position:[190,180],data:{health:5000,alliance:'hostile',color:'#f88'}});
   return a.camera.worldToClient(combatTarget.position,a.render.getSurfaceBounds());
  }''')
  page.mouse.move(*point);page.mouse.down()
  page.wait_for_function('combatTarget.data.health<5000')
  page.mouse.up()
  fired=page.evaluate('''() => ({health:combatTarget.data.health,source:combatTarget.data.last_hit?.source_id,player:runtimeExample.player.entity_id,draws:runtimeExample.engine.api.render.getStatistics().packets})''')
  assert fired['source']==fired['player'] and fired['health']<5000,fired
  drop=page.evaluate('''() => {const a=runtimeExample.engine.api,item=a.items.getEquippedWeapon();a.items.setItemState(item.instance_id,{ammo:7});const loot=a.loot.dropItem(item.instance_id);return {instance:item.instance_id,entity:loot.entity_id,body:loot.body_id};}''')
  assert drop['entity']==drop['body'],drop
  page.wait_for_function('id=>runtimeExample.engine.api.items.hasInstance(id)',arg=drop['instance'])
  loot=page.evaluate('''id=>{const a=runtimeExample.engine.api;return {ammo:a.items.getItem(id).state.ammo,remaining:a.loot.getEntities().length,bodyGone:a.elements.fetchEntity('''+str(drop['entity'])+''')===null};}''',drop['instance'])
  assert loot=={'ammo':7,'remaining':0,'bodyGone':True},loot
  page.evaluate('''() => {const e=runtimeExample.engine,a=e.api;combatTarget.destroy();a.weapons.setCooldown(0);a.items.equipItem(a.items.findItem('pistol_fpx').instance_id);globalThis.releasePause=e.pause('verification');e.render();}''')
  rendering=page.evaluate('''() => {const e=runtimeExample.engine,before=JSON.stringify(e.api.physics.savePhysicsState());for(let i=0;i<10;i++)e.render(.5);const frame=e.api.render.getFrameSnapshot();return {stable:before===JSON.stringify(e.api.physics.savePhysicsState()),sprites:frame.passes.flatMap(p=>p.packets).filter(p=>p.type==='sprite').length};}''')
  assert rendering['stable'] and rendering['sprites']>=1,rendering
  page.screenshot(path='/workspace/scratch/native-combat.png')
  page.evaluate('runtimeExample.engine.dispose()')
  assert not errors,errors
  print(json.dumps({'firing':fired,'drop':drop,'loot':loot,'rendering':rendering,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
