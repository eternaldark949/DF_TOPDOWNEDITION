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
   globalThis.baseJoints=game.physics_system.getStatistics().constraints;game.camera.x=700;game.camera.y=700;game.camera.zoom=1;
   globalThis.nativeDrone=game.actors.spawn({kind:'drone',position:[890,700],rotation:Math.PI,data:{drone_kind:'seer'}});
   globalThis.nativeCat=game.actors.spawn({kind:'velvet_cat',position:[500,720]});nativeCat.adopt();
   for(let i=0;i<58;i++)game.update();
   nativeDrone.updateBehavior=()=>{};game.abilities.cast(nativeDrone,'drone_beam',{target:game.player.entity_id});for(let i=0;i<30;i++)game.update();game.draw();
   const before=JSON.stringify(game.physics_system.savePhysicsState());game.draw();
   return {drone:nativeDrone instanceof DFNative.Drone,cat:nativeCat instanceof DFNative.VelvetCat,phase:nativeDrone.data.ability_action_state.phase,walk:nativeCat.data.velvet_animation.walkPhase>0,stable:before===JSON.stringify(game.physics_system.savePhysicsState()),legacy:GameEntity.registry.all.length};
  }""")
  assert report=={'drone':True,'cat':True,'phase':'tell','walk':True,'stable':True,'legacy':0},report
  page.screenshot(path='/workspace/scratch/native-drone-cat-tell.png')
  beam=page.evaluate("""()=>{for(let i=0;i<44;i++)game.update();game.draw();const state=nativeDrone.data.ability_action_state;return {phase:state.phase,from:state.beam.from,to:state.beam.to,hp:game.player.hp};}""")
  assert beam['phase']=='flash' and beam['hp']<10000,beam
  page.screenshot(path='/workspace/scratch/native-drone-cat-beam.png')
  grapple=page.evaluate("""()=>{
   for(let i=0;i<30;i++)game.update();game.attacks.getController(nativeDrone).setCooldown(0);game.player.teleportTo([700,700]);nativeDrone.teleportTo([880,700]);game.abilities.cast(nativeDrone,'drone_grapple',{target:game.player.entity_id});for(let i=0;i<50;i++)game.update();game.draw();const state=nativeDrone.data.ability_action_state;return {phase:state?.phase,joints:game.physics_system.getStatistics().constraints-baseJoints};
  }""")
  assert grapple=={'phase':'held','joints':1},grapple
  page.screenshot(path='/workspace/scratch/native-drone-cat-grapple.png')
  released=page.evaluate("""()=>{game.player.data.player_state.last_flit_at+=1;game.update();game.draw();return {action:nativeDrone.data.ability_action_state,joints:game.physics_system.getStatistics().constraints-baseJoints};}""")
  assert released=={'action':None,'joints':0},released
  page.evaluate("""()=>{nativeCat.teleportTo([760,640]);nativeCat.setRestPose('sitting');for(let i=0;i<30;i++)game.update();game.draw();}""")
  page.screenshot(path='/workspace/scratch/native-velvet-cat-rest.png')
  assert errors==[],errors
  print(json.dumps({'report':report,'beam':beam,'grapple':grapple,'released':released,'errors':errors}))
  browser.close()
finally:server.shutdown()
