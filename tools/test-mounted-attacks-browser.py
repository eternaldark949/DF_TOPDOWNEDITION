"""Actual mounted passenger AI, player input, renderer poses, pause and native exit."""
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
  page.select_option('#weapon','pistol_fpx');page.click('#mounted-demo')
  initial=page.evaluate('''()=>{const {engine,player}=runtimeExample,api=engine.api,car=api.elements.getEntities({entity_type:'df_traffic_vehicle'})[0],npc=api.actors.getActors().find(actor=>actor.entity_type==='df_npc'),target=api.actors.getActors().find(actor=>actor.name==='Practice target');globalThis.mountedCheck={car,npc,target,body:player.body,grid:api.physics.spatial_grid,shots:0};api.session.on('attack:executed',event=>{if(event.entity_id===player.entity_id)mountedCheck.shots++;});return {mounted:api.physics.getAttachmentState(player).parent_body_id===car.entity_id,npcMounted:npc.inCar,combined:api.physics.getAttachmentState(npc).combine_mass};}''')
  assert initial=={'mounted':True,'npcMounted':True,'combined':True},initial
  page.wait_for_function('mountedCheck.target.hp<1000')
  page.evaluate('''()=>{runtimeExample.engine.api.controls.clear();document.activeElement.blur();}''');page.keyboard.down('Space');page.wait_for_function('mountedCheck.shots===1');page.keyboard.up('Space')
  frozen=page.evaluate('''()=>{const {engine,player}=runtimeExample;globalThis.resumeMounted=engine.pause('mounted-test');const before=JSON.stringify(engine.api.physics.savePhysicsState());for(let i=0;i<3;i++)engine.render(.5);return {stable:before===JSON.stringify(engine.api.physics.savePhysicsState()),sameBody:player.body===mountedCheck.body,sameGrid:engine.api.physics.spatial_grid===mountedCheck.grid,source:engine.api.physics.getAttachmentState(player).parent_body_id===mountedCheck.car.entity_id,lean:engine.api.attacks.getMountedAttackState(mountedCheck.npc).lean};}''')
  assert frozen['stable'] and frozen['sameBody'] and frozen['sameGrid'] and frozen['source'] and frozen['lean']>0,frozen
  page.evaluate('resumeMounted()');page.click('#leave-seat');page.wait_for_function('!runtimeExample.engine.api.physics.getAttachmentState(runtimeExample.player)')
  exit_report=page.evaluate('''()=>({sameBody:runtimeExample.player.body===mountedCheck.body,attached:!!runtimeExample.engine.api.physics.getAttachmentState(runtimeExample.player),shots:mountedCheck.shots,damage:1000-mountedCheck.target.hp})''')
  assert exit_report['sameBody'] and not exit_report['attached'] and exit_report['shots']==1 and exit_report['damage']>=35,exit_report
  page.evaluate('runtimeExample.engine.dispose()');assert not errors,errors
  print(json.dumps({'initial':initial,'paused':frozen,'exit':exit_report,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
