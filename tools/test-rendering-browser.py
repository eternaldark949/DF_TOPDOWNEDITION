"""Pixel and lifecycle acceptance for the engine-owned Canvas backend and neutral frame contract."""
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
  page=browser.new_page(viewport={'width':1000,'height':900},device_scale_factor=2);errors=[]
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.on('pageerror',lambda error:errors.append(str(error)));page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/src/game/examples/rendering.html',wait_until='networkidle')
  page.wait_for_function('!!globalThis.renderingExample?.engine.active_level')
  pixels=page.evaluate('''() => {
   const e=renderingExample.engine;e.pause('verification');e.render();
   const canvas=document.getElementById('scene'),ctx=canvas.getContext('2d');
   const sample=(x,y)=>Array.from(ctx.getImageData(x*2,y*2,1,1).data);
   return {dimensions:[canvas.width,canvas.height],blue:sample(30,30),red:sample(22,22),imageRed:sample(70,30),imageGreen:sample(100,30),target:sample(120,30),world:sample(160,60),gradientLeft:sample(21,80),gradientRight:sample(38,80),radialCenter:sample(220,160),radialEdge:sample(231,160),path:sample(220,60),shadow:sample(285,160)};
  }''')
  assert pixels['dimensions']==[640,480],pixels
  for key,color in [('blue',[0,0,255,255]),('red',[255,0,0,255]),('imageRed',[255,0,0,255]),('imageGreen',[0,255,0,255]),('target',[0,255,0,255]),('world',[0,255,255,255]),('path',[255,204,0,255])]:assert pixels[key]==color,(key,pixels)
  assert pixels['gradientLeft'][0]>200 and pixels['gradientRight'][2]>200,pixels
  assert pixels['radialCenter'][0]>200 and pixels['radialEdge'][0]<70,pixels
  assert pixels['shadow'][0]>pixels['shadow'][1],pixels
  point=page.evaluate('renderingExample.engine.api.camera.worldToClient([30,0],renderingExample.engine.api.render.getSurfaceBounds())')
  page.mouse.move(*point)
  world=page.evaluate('''() => {const a=renderingExample.engine.api;return a.camera.clientToWorld(a.controls.pointer().position,a.render.getSurfaceBounds());}''')
  assert abs(world[0]-30)<.51 and abs(world[1])<.51,world
  report=page.evaluate('''async () => {
   const e=renderingExample.engine,a=e.api,before=JSON.stringify(a.physics.savePhysicsState());for(let i=0;i<10;i++)e.render(.4);
   const frame=a.render.getFrameSnapshot(),stable=before===JSON.stringify(a.physics.savePhysicsState()),old=document.getElementById('scene');
   const module=await import('/src/engine/basement/rendering/index.mjs');a.render.registerRenderer('alternate-canvas',module.canvasRenderer);
   let rejected=false;try{await a.render.setRenderer('alternate-canvas',{surface:old});}catch{rejected=true;}
   const replacement=document.createElement('canvas');replacement.id='scene';old.replaceWith(replacement);
   await a.render.setRenderer('alternate-canvas',{surface:replacement});e.render();
   const blue=Array.from(replacement.getContext('2d').getImageData(60,60,1,1).data);
   const resources=a.render.listResources().length;return {stable,passes:frame.passes.length,cloneable:!!structuredClone(frame),rejected,blue,resources};
  }''')
  replacement_point=page.evaluate('renderingExample.engine.api.camera.worldToClient([30,0],renderingExample.engine.api.render.getSurfaceBounds())')
  page.mouse.move(*replacement_point)
  report.update(page.evaluate('''() => {const e=renderingExample.engine,retargeted=e.api.controls.pointer().known;e.dispose();return {retargeted,disposed:e.api.render.disposed,bodies:e.api.physics.getStatistics().bodies};}'''))
  assert report=={'stable':True,'passes':3,'cloneable':True,'rejected':True,'blue':[0,0,255,255],'resources':5,'retargeted':True,'disposed':True,'bodies':0},report
  page.screenshot(path='/workspace/scratch/rendering-contract.png')
  assert not errors,errors
  print(json.dumps({'pixels':pixels,'pointer_world':world,'report':report,'errors':errors},indent=2))
  browser.close()
finally:server.shutdown();server.server_close()
