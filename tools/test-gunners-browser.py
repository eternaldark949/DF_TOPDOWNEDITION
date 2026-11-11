"""Actual native gunner tell/burst/heat, owned weapon identity and saved action restoration."""
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
  page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/DFAB%20V8.html',wait_until='networkidle')
  page.wait_for_function("typeof game!=='undefined' && typeof DFNative!=='undefined' && typeof Screens!=='undefined'")
  page.wait_for_function("!document.getElementById('loading-screen') || getComputedStyle(document.getElementById('loading-screen')).display==='none'")
  page.evaluate("""() => {game.story.update=()=>{};game.loadMap('apt_949');game.running=true;game.paused=false;uiKit.hide('ui-layer');uiKit.show('game-container');document.getElementById('tap-to-begin')?.remove();for(let i=0;i<3;i++)game.update();game.draw();}""")
  page.wait_for_function("game.activeMap?.id==='apt_949' && !game.paused && !document.getElementById('fade-overlay').classList.contains('active')")
  report=page.evaluate("""()=>{
   game.hud.revealAll();game.furniture.release();game.player.teleportTo([700,700]);game.player.maxHp=10000;game.player.hp=10000;
   globalThis.nativeGunner=game.actors.spawn({kind:'gatling_gunner',name:'Native GatlingGunner',position:[740,700],rotation:Math.PI});globalThis.gunnerShots=0;
   const emit=game.combat.emit;game.combat.emit=function(event,data){if(event==='weapon:fired'&&data.entity_id===nativeGunner.entity_id)gunnerShots++;return emit.call(this,event,data);};
   globalThis.oldGunnerUpdate=GatlingGunner.prototype.update;GatlingGunner.prototype.update=()=>{throw Error('Legacy gunner physical owner entered');};
   for(let i=0;i<6;i++)game.update();game.camera.x=700;game.camera.y=700;game.draw();return {native:nativeGunner instanceof DFNative.GatlingGunner,state:nativeGunner.state,shots:gunnerShots,legacy:GameEntity.registry.all.length};
  }""")
  assert report=={'native':True,'state':'tell','shots':0,'legacy':0},report
  page.screenshot(path='/workspace/scratch/native-gunner-tell.png')
  burst=page.evaluate("""()=>{for(let i=0;i<30;i++)game.update();game.draw();const saved=JSON.stringify(game.physics_system.savePhysicsState());game.draw();game.draw();return {state:nativeGunner.state,shots:gunnerShots,heat:nativeGunner.gunner_state.barrel_heat,stable:saved===JSON.stringify(game.physics_system.savePhysicsState())};}""")
  assert burst['state']=='burst' and 0<burst['shots']<10 and burst['heat']>0 and burst['stable'],burst
  page.screenshot(path='/workspace/scratch/native-gunner-burst.png')
  restored=page.evaluate("""()=>{const id=nativeGunner.entity_id,item=nativeGunner.items.equipped_weapon_id,action=JSON.stringify(nativeGunner.data.ability_action_state);game.saveGame({auto:true});const loaded=game.loadGame(AUTOSAVE_KEY);nativeGunner=game.physics_system.elements.fetchEntity(id);return {loaded,native:nativeGunner instanceof DFNative.GatlingGunner,sameItem:nativeGunner.items.equipped_weapon_id===item,sameAction:JSON.stringify(nativeGunner.data.ability_action_state)===action};}""")
  assert restored=={'loaded':True,'native':True,'sameItem':True,'sameAction':True},restored
  reload=page.evaluate("""()=>{for(let i=0;i<60;i++)game.update();game.draw();return {state:nativeGunner.state,shots:nativeGunner.data.ability_action_state.shots_fired,cooldown:game.attacks.getCooldown(nativeGunner)};}""")
  assert reload['state']=='reload' and reload['shots']==10 and reload['cooldown']>0,reload
  page.evaluate('GatlingGunner.prototype.update=oldGunnerUpdate;game.running=false');assert not errors,errors
  print(json.dumps({'tell':report,'burst':burst,'restored':restored,'reload':reload,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
