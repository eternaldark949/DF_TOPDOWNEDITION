"""Real Canvas acceptance for the native humanoid rig client."""
from pathlib import Path
from shutil import which
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path=which('chromium') or None,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1100,'height':900});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  page.goto(f'http://127.0.0.1:{server.server_port}/DFAB%20V8.html',wait_until='networkidle')
  page.wait_for_function("typeof game!=='undefined' && typeof DFNative!=='undefined' && (!document.getElementById('loading-screen')||getComputedStyle(document.getElementById('loading-screen')).display==='none')")
  page.evaluate("""()=>{game.story.update=()=>{};game.loadMap('apt_949');game.running=true;game.paused=false;uiKit.hide('ui-layer');uiKit.show('game-container');document.getElementById('tap-to-begin')?.remove();for(let i=0;i<3;i++)game.update();game.draw();}""")
  page.wait_for_function("game.activeMap?.id==='apt_949' && !game.paused && !document.getElementById('fade-overlay').classList.contains('active')")
  report=page.evaluate("""()=>{
   game.hud.revealAll();game.furniture.release();
   const world=game.physics_system,actor=game.player,rig=world.rigs.getRig(actor),stats=world.getStatistics(),before=JSON.stringify(world.savePhysicsState());
   const old={};for(const name of ['stride','strikePose','placeHands','settle']){old[name]=proceduralHumanoid.prototype[name];proceduralHumanoid.prototype[name]=function(...args){if(this.entity.enginePresentation)throw Error('Native entered legacy '+name);return old[name].apply(this,args);};}
   try{
    for(let i=0;i<5;i++)game.draw();
    const packet=game.apartmentRenderer.personPacket(actor,.5),pose=packet.rigPose,canvas=document.createElement('canvas');canvas.width=canvas.height=180;
    const ctx=canvas.getContext('2d');ctx.translate(90,90);ctx.scale(3,3);drawProceduralHumanoid(ctx,packet,{gender:'female',stance:'idle',skin:'#bda487'});
    const pixels=ctx.getImageData(0,0,180,180).data;let colored=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])colored++;
    return {native:!!rig,joints:Object.keys(pose.joints).length,stable:JSON.stringify(world.savePhysicsState())===before,bodies:world.getStatistics().bodies===stats.bodies,colored,anchor:world.rigs.getAnchor(actor,'hand_r').position.every(Number.isFinite)};
   }finally{for(const [name,fn]of Object.entries(old))proceduralHumanoid.prototype[name]=fn;}
  }""")
  assert report['native'] and report['joints']==16 and report['stable'] and report['bodies'] and report['anchor'] and report['colored']>500,report
  (Path('/workspace/scratch')).mkdir(exist_ok=True)
  page.screenshot(path='/workspace/scratch/native-humanoid-rig.png')
  assert not errors,errors
  browser.close();print('Passed: native humanoid Canvas appearance, resolved joints/anchors, no legacy pose stages, no render-time simulation.',report)
finally:
 server.shutdown();server.server_close()
