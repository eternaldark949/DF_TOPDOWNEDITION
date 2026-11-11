"""Real DOM keyboard/mouse/multi-touch input plus injected standard Gamepad API samples."""
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
  page=browser.new_page(viewport={'width':1000,'height':1000},has_touch=True);errors=[]
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.on('pageerror',lambda error:(errors.append(str(error)),print(str(error),flush=True)))
  page.on('console',lambda message:(errors.append(message.text),print(message.text,flush=True)) if message.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/src/runtime/examples/',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  page.keyboard.down('d');page.wait_for_function('runtimeExample.engine.api.controls.active("move")');
  keyboard=page.evaluate('runtimeExample.engine.api.controls.direction("move")');page.keyboard.up('d');assert keyboard==[1,0],keyboard
  page.evaluate('''() => {globalThis.fireIntents=0;runtimeExample.engine.api.session.on('player:fire',()=>fireIntents++);}''')
  canvas=page.locator('#scene').bounding_box();page.mouse.move(canvas['x']+30,canvas['y']+30);page.mouse.down()
  assert page.evaluate('runtimeExample.engine.api.controls.active("fire")')
  assert page.evaluate('runtimeExample.engine.api.controls.pointer().known')
  page.wait_for_function('fireIntents>0')
  page.mouse.up();assert not page.evaluate('runtimeExample.engine.api.controls.active("fire")')
  page.evaluate('''() => {const c=runtimeExample.engine.api.controls;c.bind('tap_fire',['touchFire',0]);}''')
  cdp=page.context.new_cdp_session(page)
  def center(selector):
   r=page.locator(selector).bounding_box();return {'x':r['x']+r['width']/2,'y':r['y']+r['height']/2}
  move={**center('#touch-move'),'id':1};aim={**center('#touch-aim'),'id':2};fire={**center('#touch-fire'),'id':3}
  def touch(kind,points):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
  touch('touchStart',[move]);move={**move,'x':move['x']+40};touch('touchMove',[move])
  touch('touchStart',[move,aim]);aim={**aim,'y':aim['y']+40};touch('touchMove',[move,aim]);touch('touchStart',[move,aim,fire])
  page.wait_for_function('''() => {const c=runtimeExample.engine.api.controls;return c.active('move')&&c.active('aim')&&c.active('fire');}''')
  multi=page.evaluate('''() => {const c=runtimeExample.engine.api.controls;return {move:c.direction('move'),aim:c.direction('aim'),fire:c.active('fire')};}''')
  touch('touchEnd',[move])
  page.wait_for_function('!runtimeExample.engine.api.controls.active("move")')
  assert page.evaluate('runtimeExample.engine.api.controls.active("aim")&&runtimeExample.engine.api.controls.active("fire")')
  touch('touchCancel',[])
  page.wait_for_function('!runtimeExample.engine.api.controls.active("aim")&&!runtimeExample.engine.api.controls.active("fire")')
  assert not page.evaluate('runtimeExample.engine.api.controls.readQueue("tap_fire")')
  page.evaluate('''() => {const c=runtimeExample.engine.api.controls;globalThis.testPad={index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};c.read_gamepads=()=>[testPad];}''')
  page.wait_for_function('runtimeExample.engine.api.controls.gamepad.connected')
  page.evaluate('''() => {testPad.axes=[.6,0,0,-.7];testPad.buttons[0]={pressed:true,value:1};}''')
  page.wait_for_function('runtimeExample.engine.api.controls.active("interact")')
  gamepad=page.evaluate('''() => {const c=runtimeExample.engine.api.controls;return {move:c.direction('move'),aim:c.direction('aim'),device:c.active_device};}''')
  assert gamepad['move'][0]>.5 and gamepad['aim'][1]<-.6 and gamepad['device']=='gamepad',gamepad
  page.evaluate('''() => {runtimeExample.engine.api.controls.read_gamepads=()=>[];}''')
  page.wait_for_function('!runtimeExample.engine.api.controls.active("interact")&&!runtimeExample.engine.api.controls.active("move")')
  disposed=page.evaluate('''() => {const c=runtimeExample.engine.api.controls;runtimeExample.engine.dispose();return c.disposed;}''')
  page.keyboard.down('d');page.keyboard.up('d');assert not page.evaluate('runtimeExample.engine.api.controls.active("move")');assert disposed
  assert not errors,errors
  print(json.dumps({'keyboard':keyboard,'multi_touch':multi,'gamepad_sample':gamepad,'disposed':disposed,'errors':errors},indent=2))
  browser.close()
finally:server.shutdown();server.server_close()
