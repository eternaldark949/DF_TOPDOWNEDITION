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
   globalThis.nativeDemoness=game.actors.spawn({kind:'demoness',position:[780,610],rotation:Math.PI,data:{solo:true}});nativeDemoness.updateBehavior=()=>{};
   globalThis.nativeWardens=['vesper','matins','compline'].map((kind,i)=>game.actors.spawn({kind,position:[740,700+i*90],rotation:Math.PI}));for(const actor of nativeWardens){actor.updateBehavior=()=>{};actor.warden_state.target_id=game.player.entity_id;}
   for(let i=0;i<2;i++)game.update();game.abilities.cast(nativeDemoness,'demoness_bolts',{target:game.player.entity_id});game.abilities.cast(nativeWardens[0],'warden_burst',{target:game.player.entity_id});game.abilities.cast(nativeWardens[0],'warden_censer',{target:game.player.entity_id},{channel:'secondary'});for(let i=0;i<10;i++)game.update();game.draw();const before=JSON.stringify(game.physics_system.savePhysicsState());game.draw();return {types:[nativeDemoness,...nativeWardens].map(a=>a.entity_type),tell:nativeDemoness.data.ability_action_state.phase,secondary:nativeWardens[0].data.ability_secondary_state.phase,stable:before===JSON.stringify(game.physics_system.savePhysicsState()),legacy:GameEntity.registry.all.length};
  }""")
  assert report=={'types':['df_demoness','df_vesper','df_matins','df_compline'],'tell':'tell','secondary':'tell','stable':True,'legacy':0},report
  page.screenshot(path='/workspace/scratch/native-specialized-bosses-tell.png')
  active=page.evaluate("""()=>{for(let i=0;i<25;i++)game.update();game.draw();return {burst:nativeWardens[0].data.ability_action_state.phase,censer:game.encounters.getEffects().some(e=>e.data.kind==='censer'),secondary:nativeWardens[0].data.ability_secondary_state};}""")
  assert active=={'burst':'burst','censer':True,'secondary':None},active
  page.screenshot(path='/workspace/scratch/native-wardens-burst-censer.png')
  mirror=page.evaluate("""()=>{game.attacks.getController(nativeDemoness).setCooldown(0);game.abilities.cast(nativeDemoness,'demoness_mirror',{target:game.player.entity_id});game.update();const decoys=game.actors.getActors().filter(a=>a.data.mirror_owner_id===nativeDemoness.entity_id);for(const actor of decoys)actor.updateBehavior=()=>{};game.encounters.addEffect(nativeDemoness,'rite',game.player.position);game.encounters.addEffect(nativeWardens[1],'hymn',nativeWardens[1].position);game.draw();const before=JSON.stringify(game.physics_system.savePhysicsState());game.draw();return {count:decoys.length,native:decoys.every(d=>d instanceof DFNative.Demoness),oneHit:decoys.every(d=>d.hp===1),stable:before===JSON.stringify(game.physics_system.savePhysicsState())};}""")
  assert mirror=={'count':2,'native':True,'oneHit':True,'stable':True},mirror
  page.screenshot(path='/workspace/scratch/native-demoness-mirror-rite.png')
  assert errors==[],errors
  print(json.dumps({'report':report,'active':active,'mirror':mirror,'errors':errors}))
  browser.close()
finally:server.shutdown()
