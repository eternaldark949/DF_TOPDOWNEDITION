"""Actual native actor policies, presentation and retained bodies in shared Chrome runtime."""
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
  page.goto(f'http://127.0.0.1:{server.server_port}/src/game/examples/',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  report=page.evaluate('''async()=>{
   const {engine,player}=runtimeExample,api=engine.api;player.maxHp=10000;player.hp=10000;
   const ally=api.actors.spawn({kind:'npc',name:'Victoria',role:'teammate',position:[150,180],data:{recruited:true,hireType:'permanent',weapon_definition_id:'pistol_fpx'}});
   const enemy=api.actors.spawn({kind:'ganger',position:[270,180],rotation:Math.PI,data:{health:10000,max_health:10000}});
   globalThis.actorCheck={ally,enemy,body:ally.body,grid:api.physics.spatial_grid};ally.say('Ready.');
   return {actors:api.actors.getActors().length,body:api.elements.fetchEntity(ally.entity_id)===ally,weapon:ally.items.getEquippedWeapon().definition_id};
  }''')
  assert report=={'actors':2,'body':True,'weapon':'pistol_fpx'},report
  page.wait_for_function("actorCheck.enemy.hp<10000 && actorCheck.enemy.state==='ALERT'")
  page.evaluate('''()=>{const api=runtimeExample.engine.api,p=runtimeExample.player;const hunter=api.actors.spawn({kind:'hunter',name:'Hunter Alpha',position:[p.position[0],p.position[1]+250],rotation:-Math.PI/2,data:{alpha:true,health:10000,max_health:10000}});hunter.setBehavior('ALERT');hunter.hunter_state.dash_remaining=0;actorCheck.hunter=hunter;actorCheck.hunterDashes=0;api.session.on('hunter:dashed',()=>actorCheck.hunterDashes++);}''')
  page.wait_for_function('actorCheck.hunterDashes>0')
  stable=page.evaluate('''()=>{const e=runtimeExample.engine;globalThis.resumeActors=e.pause('actor-test');const before=JSON.stringify(e.api.physics.savePhysicsState());for(let i=0;i<4;i++)e.render(.5);return before===JSON.stringify(e.api.physics.savePhysicsState());}''')
  assert stable
  result=page.evaluate('''async()=>{resumeActors();const e=runtimeExample.engine;await e.loadLevel('room_b');return {retained:e.api.elements.fetchEntity(actorCheck.ally.entity_id)===actorCheck.ally,sameBody:actorCheck.ally.body===actorCheck.body,sameGrid:e.api.physics.spatial_grid===actorCheck.grid,enemyRetired:actorCheck.enemy.destroyed,hunterRetired:actorCheck.hunter.destroyed,controllers:e.api.actors.getActors().length};}''')
  assert result=={'retained':True,'sameBody':True,'sameGrid':True,'enemyRetired':True,'hunterRetired':True,'controllers':1},result
  page.evaluate('runtimeExample.engine.dispose()');assert not errors,errors
  print(json.dumps({'initial':report,'renderStable':stable,'transition':result,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
