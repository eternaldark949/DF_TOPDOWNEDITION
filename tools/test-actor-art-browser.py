"""Pre-conversion artwork parity plus native packet renderer and classic adapter acceptance."""
from pathlib import Path
from shutil import which
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops,ImageStat
import base64,json,io
root=Path(__file__).resolve().parents[1]
fixtures=root/'tools/fixtures/actor-art'
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=which('chromium') or None,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1100,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.goto(f'http://127.0.0.1:{server.server_port}/DFAB%20V8.html',wait_until='networkidle')
  page.wait_for_function("typeof DFNative!=='undefined' && (!document.getElementById('loading-screen')||getComputedStyle(document.getElementById('loading-screen')).display==='none')")
  images=page.evaluate('''poses=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d'),out={};
   for(const [name,state] of Object.entries(poses)){
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#282331';ctx.fillRect(0,0,320,320);
    const before=JSON.stringify(state);
    if(name.startsWith('drone-')){DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDronePackets(state));DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDronePackets(state,{pass:'lights'}));}
    else{const art=DFNative.createVelvetCatArt(state);DFNative.canvasRenderer.drawPackets(ctx,art.body);DFNative.canvasRenderer.drawPackets(ctx,DFNative.createVelvetEyePackets(state,{eyes:art.eyes,darkness:.8}));}
    if(before!==JSON.stringify(state))throw Error('Artist mutated its state');out[name]=canvas.toDataURL().split(',')[1];
   }return out;
  }''',json.loads((fixtures/'poses.json').read_text()))
  metrics={}
  for name,data in images.items():
   before=Image.open(fixtures/'before'/(name+'.png')).convert('RGB')
   after=Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')
   difference=ImageChops.difference(before,after);mae=sum(ImageStat.Stat(difference).mean)/3
   changed=sum(1 for pixel in difference.get_flattened_data() if max(pixel)>16)
   assert mae<.15 and changed<103,(name,mae,changed)
   metrics[name]={'mean_channel_difference':round(mae,5),'pixels_over_16':changed}
  classic=page.evaluate('''()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d'),d=new Drone(160,160,'seer'),c=new VelvetCat(160,160),glow=drawGlow,shadow=drawGroundContactShadow;d.alt=0;d.state='hover';
   drawGlow=drawGroundContactShadow=()=>{throw Error('Legacy art helper entered');};
   const before={x:c.x,y:c.y,walkPhase:c.walkPhase,tailPhase:c.tailPhase};
   try{d.draw(ctx);d.drawLights(ctx);c.draw(ctx);c.drawEyeShine(ctx,.8);return {stable:JSON.stringify(before)===JSON.stringify({x:c.x,y:c.y,walkPhase:c.walkPhase,tailPhase:c.tailPhase}),noEyeWrite:c._eyeWorld===undefined};}
   finally{drawGlow=glow;drawGroundContactShadow=shadow;d.destroy();c.destroy();}
  }''')
  assert classic=={'stable':True,'noEyeWrite':True},classic
  page.goto(f'http://127.0.0.1:{server.server_port}/src/runtime/examples/index.html',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  page.click('#actor-art')
  native=page.evaluate('''async()=>{
   const {canvasRenderer}=await import('/src/basement/rendering/index.mjs'),e=runtimeExample.engine;e.pause('acceptance');e.api.physics.commitCommands();
   const original=canvasRenderer.drawPackets;canvasRenderer.drawPackets=()=>{throw Error('Native renderer entered the migration adapter');};
   try{const before=JSON.stringify(e.api.physics.savePhysicsState());e.render(.5);e.render(.5);const frame=e.api.render.getFrameSnapshot();return {stable:before===JSON.stringify(e.api.physics.savePhysicsState()),packets:frame.packet_count,body:frame.passes.some(p=>p.packets.some(d=>d.layer===20)),lights:frame.passes.some(p=>p.packets.some(d=>d.layer===60)),types:e.api.actors.getActors().map(a=>a.entity_type)};}
   finally{canvasRenderer.drawPackets=original;}
  }''')
  assert native['stable'] and native['body'] and native['lights'] and native['packets']>60,native
  assert native['types']==['df_velvet_cat','df_drone'],native
  page.screenshot(path='/workspace/scratch/native-actor-packet-rendering.png')
  assert errors==[],errors
  print(json.dumps({'parity':metrics,'classic':classic,'native':native,'errors':errors}));browser.close()
finally:server.shutdown()
