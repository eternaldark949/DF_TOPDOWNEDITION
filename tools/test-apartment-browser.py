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
  page.goto(f'http://127.0.0.1:{server.server_port}/DFAB%20V8.html',wait_until='networkidle')
  page.wait_for_function("typeof game!=='undefined' && typeof DFNative!=='undefined'")
  page.evaluate("""() => {game.story.update=()=>{};game._doLoadMap('apt_949');game.running=true;game.paused=false;uiKit.hide('ui-layer');uiKit.show('game-container');document.getElementById('tap-to-begin')?.remove();for(let i=0;i<3;i++)game.update();game.draw();}""")
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
   const old=game.physics_system;game.saveGame({auto:true});const loaded=game.loadGame(AUTOSAVE_KEY);
   return {inventory,map,loaded,retired:old.getStatistics().bodies,native:game.player.physics_system===game.physics_system};
  }""")
  page.screenshot(path='/workspace/scratch/native-apartment.png')
  print(json.dumps({'report':report,'ui':ui,'errors':errors},indent=2))
  assert report['native'] and report['steps']==30 and report['render_unchanged'],report
  assert not errors,errors
  assert ui=={'inventory':True,'map':True,'loaded':True,'retired':0,'native':True},ui
  browser.close()
finally:server.shutdown();server.server_close()
