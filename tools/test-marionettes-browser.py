"""Actual native Marionette behavior, retained artwork, snapshots and actor lifetime."""
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
   game.hud.revealAll();game.furniture.release();game.player.teleportTo([700,700]);game.player.vitals.reset();
   globalThis.doll=game.actors.spawn({kind:'marionette',name:'Native Marionette',position:[740,700],rotation:Math.PI,data:{appearance_seed:42,cloth:'#5b2340'}});doll.marionette_state.initial_delay=0;
   globalThis.oldMarionetteUpdate=Marionette.prototype.update;Marionette.prototype.update=()=>{throw Error('Legacy physical actor entered');};
   for(let i=0;i<10;i++)game.update();game.camera.x=700;game.camera.y=700;game.draw();
   const saved=JSON.stringify(game.physics_system.savePhysicsState());game.draw();game.draw();return {phase:doll.state,native:doll instanceof DFNative.Marionette,hp:game.player.hp,stable:saved===JSON.stringify(game.physics_system.savePhysicsState()),legacy:GameEntity.registry.all.length};
  }""")
  assert report=={'phase':'tell','native':True,'hp':100,'stable':True,'legacy':0},report
  page.screenshot(path='/workspace/scratch/native-marionette-tell.png')
  hit=page.evaluate("""()=>{doll.marionette_state.initial_delay=100;for(let i=0;i<24;i++)game.update();game.draw();return {phase:doll.state,hp:game.player.hp,hits:doll.data.ability_action_state.hit_ids.length,bodies:game.physics_system.getStatistics().bodies};}""")
  assert hit['phase']=='lunge' and hit['hp']==91 and hit['hits']==1,hit
  page.screenshot(path='/workspace/scratch/native-marionette-lunge.png')
  restored=page.evaluate("""()=>{const id=doll.entity_id,state=JSON.stringify(doll.data.ability_action_state);game.saveGame({auto:true});const loaded=game.loadGame(AUTOSAVE_KEY),actor=game.physics_system.elements.fetchEntity(id);globalThis.doll=actor;return {loaded,native:actor instanceof DFNative.Marionette,sameId:actor.entity_id===id,sameState:state===JSON.stringify(actor.data.ability_action_state)};}""")
  assert restored=={'loaded':True,'native':True,'sameId':True,'sameState':True},restored
  page.evaluate('Marionette.prototype.update=oldMarionetteUpdate;game.running=false');assert not errors,errors
  print(json.dumps({'tell':report,'lunge':hit,'restored':restored,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
