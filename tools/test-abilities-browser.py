"""Native spells, renderer packets, damage, pause and retained loadouts in real Chromium."""
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
   const {engine}=runtimeExample,api=engine.api;
   const {abilityPresentation}=await import('/src/game/presentation/ability-presentation.mjs');
   const ally=api.actors.spawn({kind:'npc',name:'Scarlet',role:'red_demon_dancer',position:[150,180],data:{recruited:true,hireType:'permanent',alliance:'friendly'}});
   const target=api.actors.spawn({kind:'actor',position:[270,180],data:{health:1000,max_health:1000,alliance:'hostile'}});
   ally.abilities.learnAbility('shadow_bolt');const shot=api.abilities.cast(ally,'fireball',{direction:[1,0]});
   const packets=[];new abilityPresentation().render({api},1,{submit:packet=>packets.push(packet)});
   const saved=JSON.stringify(api.physics.savePhysicsState());engine.render(1);
   const pixel=Array.from(document.getElementById('scene').getContext('2d').getImageData(shot.position[0],shot.position[1],1,1).data);
   globalThis.abilityCheck={ally,target,body:ally.body,grid:api.physics.spatial_grid};
   return {native:shot.physics_system===api.physics,spell:shot.data.ability_id,packets:packets.length,radius:packets[0].geometry.radii[0],pixel,stable:saved===JSON.stringify(api.physics.savePhysicsState())};
  }''')
  assert report['native'] and report['spell']=='fireball' and report['packets']==1 and report['radius']==8 and report['stable'],report
  assert report['pixel'][0]>report['pixel'][1]+100,report
  page.wait_for_function('abilityCheck.target.hp===950')
  result=page.evaluate('''async()=>{
   const e=runtimeExample.engine,api=e.api,resume=e.pause('ability-test'),saved=JSON.stringify(api.physics.savePhysicsState());for(let i=0;i<3;i++)e.render(.5);const stable=saved===JSON.stringify(api.physics.savePhysicsState());resume();
   await e.loadLevel('room_b');return {stable,sameBody:abilityCheck.ally.body===abilityCheck.body,sameGrid:api.physics.spatial_grid===abilityCheck.grid,known:abilityCheck.ally.abilities.snapshot().known_ids,equipped:abilityCheck.ally.equippedAbilityId,legacy:typeof GameEngine};
  }''')
  assert result=={'stable':True,'sameBody':True,'sameGrid':True,'known':['fireball','shadow_bolt'],'equipped':'fireball','legacy':'undefined'},result
  page.evaluate('runtimeExample.engine.dispose()');assert not errors,errors
  print(json.dumps({'cast':report,'transition':result,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
