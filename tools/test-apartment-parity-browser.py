"""Generated apartment: veranda art, Flit effects and real keyboard/mouse/touch firing."""
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
  page.evaluate("""()=>{game.hud.revealAll();game.furniture.release();Screens.close();game._parityShots=0;const emit=game.combat.emit;game.combat.emit=function(event,data){if(event==='weapon:fired')game._parityShots++;return emit.call(this,event,data);};game.items.equipItem(game.items.findItem('pistol_fpx').instance_id);game.attacks.useDefaultAttack(game.player);game.setWeaponHolstered(false);game.shootCooldown=0;}""")
  page.keyboard.press('Space')
  keyboard_shots=page.evaluate('game._parityShots')
  assert keyboard_shots==1,{'keyboardShots':keyboard_shots,'errors':errors}
  aim=page.evaluate("()=>{game.shootCooldown=0;const r=game.canvas.getBoundingClientRect();return {x:r.x+r.width*.6,y:r.y+r.height*.5};}")
  page.mouse.move(aim['x'],aim['y']);page.mouse.down();page.evaluate('game.update()');page.mouse.up()
  mouse_fired=page.evaluate('game._parityShots');assert mouse_fired==2,{'mouseShots':mouse_fired,'errors':errors}
  touch=page.evaluate("""()=>{
   game.items.equipItem(game.items.findItem('sniper_sara').instance_id);game.attacks.useDefaultAttack(game.player);game.setWeaponHolstered(false);game.shootCooldown=0;
   const el=document.getElementById('btn-fire'),r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   const send=(type,dx)=>{const t=new Touch({identifier:77,target:el,clientX:x+dx,clientY:y});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}));};
   send('touchstart',0);send('touchmove',110);const armed=game.fireJoystick.armed;game.update();const before=game._parityShots;send('touchend',110);const requested=game._releaseShot;game.update();game.update();return {armed,before,after:game._parityShots,requested,cleared:game._releaseShot===null};
  }""")
  assert touch=={'armed':True,'before':2,'after':3,'requested':0,'cleared':True},touch
  veranda=page.evaluate("""()=>{game.player.teleportTo([210,80]);game.camera.x=210;game.camera.y=80;game._cullBounds={view:{left:9000,right:9100,top:9000,bottom:9100}};let stamps=0;const draw=game.ctx.drawImage;game.ctx.drawImage=function(image,...args){if(image===game._cityView?.base)stamps++;return draw.call(this,image,...args);};try{game.draw();return {stamps,visible:viewHasRect(0,-394,1400,400)};}finally{game.ctx.drawImage=draw;}}""")
  assert veranda['stamps']>0 and veranda['visible'],veranda
  page.screenshot(path='/workspace/scratch/apartment-veranda-parity.png')
  flit=page.evaluate("""()=>{game.player.vitals.reset();game.flitVFX=[];const moved=game.triggerFlit(0);game.draw();const snapshot=JSON.stringify(game.physics_system.savePhysicsState());game.draw();game.draw();const result={moved,bolts:game.flitVFX[0]?.trails.length,renderStable:snapshot===JSON.stringify(game.physics_system.savePhysicsState()),life:game.flitVFX[0]?.trailLife};game.update();result.decayed=game.flitVFX[0]?.trailLife<result.life;game.draw();return result;}""")
  assert flit['moved'] and flit['bolts']==3 and flit['renderStable'] and flit['decayed'],flit
  page.screenshot(path='/workspace/scratch/apartment-flit-parity.png')
  page.evaluate('game.running=false');assert not errors,errors
  print(json.dumps({'keyboardShots':keyboard_shots,'keyboardAndMouseShots':mouse_fired,'touchRelease':touch,'veranda':veranda,'flit':flit,'errors':errors},indent=2));browser.close()
finally:server.shutdown();server.server_close()
