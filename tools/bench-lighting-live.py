#!/usr/bin/env python3
"""Randomized same-renderer lighting CPU comparison in a normally loaded private save.
Only the lighting render method switches; candidate module helpers are shared.
Requires Python Playwright and Chromium. Does not emulate phone hardware.
"""
import argparse,hashlib,json,statistics,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright

class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path!='/game.html':self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(self.server.build.read_bytes())
 def log_message(self,*a):pass

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 for name in ['baseline','lighting-source','save','output']:ap.add_argument('--'+name,required=True,type=Path)
 ap.add_argument('--duration',type=int,default=30000);ap.add_argument('--warmup',type=int,default=6000)
 ap.add_argument('--walking',action='store_true');ap.add_argument('--chromium',default='/usr/bin/chromium')
 args=ap.parse_args()
 if args.duration<1000 or args.warmup<0:ap.error('Duration must be at least 1000 ms; warmup must be nonnegative')
 for name in ['baseline','lighting_source','save']:
  if not getattr(args,name).is_file():ap.error(f'File not found: {getattr(args,name)}')
 saved=json.loads(args.save.read_text());slot=str(saved['activeSlot']);data=saved['slots'][slot]
 density={k:data['settings'][k] for k in ['trafficDensity','pedestrianDensity','foliageDensity','rainDensity']};density.update(crowdQuality='high',lampShadows='off')
 args.output.parent.mkdir(parents=True,exist_ok=True)
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.build=args.baseline
 threading.Thread(target=server.serve_forever,daemon=True).start()
 results={'method':{'engine':'One headless Chromium renderer; no phone hardware emulation','assignment':'Randomized accepted frames; identical-code control; only the lighting render method switches; candidate helpers shared','durationMs':args.duration,'warmupMs':args.warmup,'walking':args.walking,'viewport':[1280,576],'baselineSha256':hashlib.sha256(args.baseline.read_bytes()).hexdigest(),'lightingSourceSha256':hashlib.sha256(args.lighting_source.read_bytes()).hexdigest(),'saveSha256':hashlib.sha256(args.save.read_bytes()).hexdigest(),'density':density},'cases':{},'errors':[]}
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':1280,'height':576})
   page.on('pageerror',lambda e:results['errors'].append(str(e)))
   page.add_init_script('localStorage.setItem("dfab_density",'+json.dumps(json.dumps(density))+');')
   page.goto(f'http://127.0.0.1:{server.server_port}/game.html',wait_until='load')
   page.locator('#tap-to-begin').click();page.wait_for_function('!document.getElementById("tap-to-begin")')
   page.evaluate("saveSlotManager.open('load')");page.locator('#save-slot-overlay input[type=file]').set_input_files(args.save)
   page.wait_for_function('(s)=>!!saveSlotManager.getSlotData(s)',arg=int(slot))
   page.evaluate('saveSlotManager.close()');page.locator('#save-slot-overlay').wait_for(state='hidden')
   page.locator('#btn-load-game').click();page.locator(f'.save-slot-card[data-slot="{slot}"]').click();page.wait_for_function('game.running&&!game.paused')
   page.evaluate('()=>document.fonts.ready')
   page.evaluate('''source=>{
    globalThis.originalLighting=game._renderLightingSystem;(new Function(source))();globalThis.prototypeLighting=game._renderLightingSystem;
    globalThis.nativeLoop=game.loop;globalThis.switchProbe={mode:'control',samples:[],record:false,seed:78123};
    game.loop=function(){const p=switchProbe;p.seed=(p.seed*16807)%2147483647;const label=p.seed%2?'before':'after';
     this._renderLightingSystem=p.mode==='candidate'&&label==='after'?prototypeLighting:originalLighting;
     const frame=this._renderDrawId,start=performance.now();try{return nativeLoop.apply(this,arguments);}finally{
      if(p.record&&this._renderDrawId!==frame)p.samples.push({label,ms:performance.now()-start});}};
   }''',args.lighting_source.read_text())
   assert page.evaluate('!PeopleProfiler.active&&!TrafficProfiler.active&&!WorldRenderProfiler.active&&!SignProfiler.active')
   cases=[('control','control'),('candidate','candidate')]+([] if args.walking else [('candidate-repeat','candidate')])
   try:
    for name,mode in cases:
     page.evaluate('m=>{switchProbe.mode=m;switchProbe.record=false;switchProbe.samples=[];}',mode);page.wait_for_timeout(args.warmup)
     page.evaluate('switchProbe.record=true')
     remaining=args.duration;keys=['d','a','a','d'];i=0
     while remaining:
      span=min(2500,remaining)
      if args.walking:page.keyboard.down(keys[i%4])
      page.wait_for_timeout(span)
      if args.walking:page.keyboard.up(keys[i%4])
      remaining-=span;i+=1
     page.evaluate('switchProbe.record=false');samples=page.evaluate('switchProbe.samples')
     groups={k:[s['ms'] for s in samples if s['label']==k] for k in ['before','after']};assert all(groups.values())
     summary={k:{'n':len(v),'meanMs':statistics.mean(v),'medianMs':statistics.median(v)} for k,v in groups.items()}
     summary['meanSavedPercent']=100*(1-summary['after']['meanMs']/summary['before']['meanMs'])
     assert page.evaluate('game.running&&!game.paused&&!game.player.dead'),'Gameplay stopped'
     results['cases'][name]={'summary':summary,'samples':samples,'context':page.evaluate('PerformanceBench._context()')}
     args.output.write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({name:summary}),flush=True)
   finally:page.evaluate('game.loop=nativeLoop;game._renderLightingSystem=originalLighting;game._releaseLightingBase?.()')
   assert not results['errors'],results['errors'];args.output.write_text(json.dumps(results,indent=2)+'\n');browser.close()
 finally:server.shutdown();server.server_close()
if __name__=='__main__':main()
