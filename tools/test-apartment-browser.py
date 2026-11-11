"""Actual generated game: native apartment controls, rendering and lifecycle."""
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
  page.wait_for_function("typeof game!=='undefined' && typeof DFNative!=='undefined'")
  page.evaluate("""() => {game.story.update=()=>{};game.loadMap('apt_949');game.running=true;game.paused=false;uiKit.hide('ui-layer');uiKit.show('game-container');document.getElementById('tap-to-begin')?.remove();for(let i=0;i<3;i++)game.update();game.draw();}""")
  # Exercise the public transition, including its lighting and asynchronous sprite warmup.
  page.evaluate("game.loadMap('hotel_lobby')")
  page.wait_for_function("game.activeMap?.id==='hotel_lobby' && !game.paused && !document.getElementById('fade-overlay').classList.contains('active')")
  page.evaluate("game.loadMap('apt_949', {linkFrom:'hotel_lobby'})")
  page.wait_for_function("game.activeMap?.id==='apt_949' && !game.paused && !document.getElementById('fade-overlay').classList.contains('active')")
  transition=page.evaluate("""() => ({native:game.player.physics_system===game.physics_system,warmed:game.props.some(p=>game.apartmentRenderer.propPacket(p,1)._spr),legacy:GameEntity.registry.all.length,pending:GameEntity.registrationQueue.length})""")
  assert transition=={'native':True,'warmed':True,'legacy':0,'pending':0},transition
  report=page.evaluate("""() => {
   const oldOwners=[CollisionSystem.update,collisionWorld.carry,collisionWorld.integrate];
   CollisionSystem.update=collisionWorld.carry=collisionWorld.integrate=()=>{throw Error('Legacy physics called in native apartment')};
   const start=game.physics_system.simulation_tick;
   for(let i=0;i<30;i++){game.update();game.draw();}
   const state=game.physics_system.savePhysicsState();
   for(let i=0;i<4;i++)game.draw();
   const result={native:game.player.physics_system===game.physics_system,steps:game.physics_system.simulation_tick-start,statistics:game.physics_system.getStatistics(),render_unchanged:JSON.stringify(state)===JSON.stringify(game.physics_system.savePhysicsState())};
   [CollisionSystem.update,collisionWorld.carry,collisionWorld.integrate]=oldOwners;
   return result;
  }""")
  ui=page.evaluate("""() => {
   game.inventory.toggleMenu();const inventory=Screens.menuOpen();Screens.close();
   game.ui.toggleMap(true);const map=Screens.mapOpen();game.ui.centerOnPlayer();game.ui.toggleMap(false);
   game.hud.revealAll();game.player.vitals.reset();game.player.takeDamage(40);game.boosterCount=4;game.useBooster();
   const stim={health:game.player.hp,boosters:game.boosterCount};
   game.player.takeDamage(25);game.player.vitals.beginFlit(40,.25,_gameTimeSec);game.updateUI();
   const expected=JSON.stringify(game.player.vitals.snapshot()),healthWidth=game.healthBar.style.width;
   const old=game.physics_system;game.saveGame({auto:true});game.player.vitals.reset();const loaded=game.loadGame(AUTOSAVE_KEY);
   return {inventory,map,loaded,retired:old.getStatistics().bodies,native:game.player.physics_system===game.physics_system,
    stim,healthWidth,vitalsRestored:JSON.stringify(game.player.vitals.snapshot())===expected,
    retiredLedgers:['playerHealth','maxPlayerHealth','flitState','healthRegenTimer'].filter(key=>key in game)};
  }""")
  # The public session entry runs the real Lobby/ambience/render callbacks, not only manual ticks.
  start=page.evaluate("""() => {game.running=false;game.enterWorld();return {x:game.player.position[0],tick:game.physics_system.simulation_tick};}""")
  page.keyboard.down('a')
  try:
   page.wait_for_function('start => game.player.position[0]<start.x-5 && game.physics_system.simulation_tick>start.tick+45',arg=start)
  except Exception:
   print(json.dumps({'start':start,'errors':errors,'state':page.evaluate('() => ({position:game.player.position,tick:game.physics_system.simulation_tick,running:game.running,paused:game.paused})')},indent=2))
   raise
  page.keyboard.up('a')
  page.wait_for_function('!!ambience._mus?.name')
  page.wait_for_function('tick => game.physics_system.simulation_tick>tick',arg=page.evaluate('game.physics_system.simulation_tick'))
  page.evaluate('game.running=false')
  page.screenshot(path='/workspace/scratch/native-apartment.png')
  print(json.dumps({'transition':transition,'report':report,'ui':ui,'errors':errors},indent=2))
  assert report['native'] and report['steps']==30 and report['render_unchanged'],report
  assert not errors,errors
  assert ui=={'inventory':True,'map':True,'loaded':True,'retired':0,'native':True,'stim':{'health':100,'boosters':3},'healthWidth':'75%','vitalsRestored':True,'retiredLedgers':[]},ui
  browser.close()
finally:server.shutdown();server.server_close()
