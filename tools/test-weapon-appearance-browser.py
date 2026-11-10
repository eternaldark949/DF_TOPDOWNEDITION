"""Draw all authored weapon variants through the real renderer and verify cache replay."""
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
  page.goto(f'http://127.0.0.1:{server.server_port}/src/runtime/examples/index.html',wait_until='networkidle')
  page.wait_for_function('!!globalThis.runtimeExample?.engine.active_level')
  report=page.evaluate('''async () => {
   const e=runtimeExample.engine;e.pause('weapon-art');
   const {weaponAppearance}=await import('/src/presentation/weapon-appearance.mjs');
   const {WEAPON_MODELS}=await import('/src/directory/weapon-appearance.mjs');
   const ids=Object.keys(WEAPON_MODELS),a=e.api,art=await new weaponAppearance().prepare(a.render);
   a.render.resize({width:640,height:ids.length*45+20,pixel_ratio:1});e.removeSystem('appearance');
   e.registerSystem('weapon-board',{render(c,blend,frame){frame.clear('#101018');ids.forEach((id,i)=>{for(const laser of [false,true])art.draw(frame,id,{laser,space:'screen',position:[80+(laser?320:0),30+i*45],scale:[3,3]});});}});
   const canvas=document.getElementById('scene'),world=JSON.stringify(a.physics.savePhysicsState());e.render();
   const first=canvas.toDataURL(),bakePasses=a.render.getFrameSnapshot().passes.length;e.render();
   const cached=canvas.toDataURL(),cachedPasses=a.render.getFrameSnapshot().passes.length,cachedPackets=a.render.getStatistics().packets;
   const ctx=canvas.getContext('2d'),rows=ids.map((id,i)=>{const data=ctx.getImageData(0,i*45,640,45).data;let ink=0;for(let p=0;p<data.length;p+=4)if(data[p]!==16||data[p+1]!==16||data[p+2]!==24)ink++;return {id,ink};});
   const replacement=document.createElement('canvas');canvas.replaceWith(replacement);replacement.id='scene';
   await a.render.setRenderer('canvas',{surface:replacement});e.render();const rebuilt=replacement.toDataURL();
   e.render();const warmAgain=a.render.getFrameSnapshot().passes.length;
   const result={same:first===cached,recreated:first===rebuilt,bakePasses,cachedPasses,cachedPackets,warmAgain,rows,worldStable:world===JSON.stringify(a.physics.savePhysicsState())};
   e.removeSystem('weapon-board');art.dispose();e.dispose();return result;
  }''')
  assert report['same'] and report['recreated'] and report['worldStable'],report
  assert report['cachedPasses']==report['warmAgain']==1,report
  assert report['cachedPackets']==len(report['rows'])*2,report
  assert all(row['ink']>50 for row in report['rows']),report
  assert not errors,errors
  print(json.dumps(report,indent=2));browser.close()
finally:server.shutdown();server.server_close()
