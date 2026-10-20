#!/usr/bin/env python3
"""Compare generated builds using a private save imported through the normal UI.
Requires Python Playwright and Chromium. Save files are never copied into the repo.
Separate-renderer timing can vary substantially even on identical code; run an
identical-build control before interpreting differences. Measured intervals use
deterministic updates/draws after normal save loading;
no automatic rAF loop, detailed profiler hooks, or overlapping regression tests.
"""
import argparse,base64,hashlib,json,statistics,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright

class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  path=self.server.files.get(self.path.split('?')[0])
  if not path:self.send_error(404);return
  data=path.read_bytes();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data)
 def log_message(self,*a):pass

SETUP=r'''scenario=>{
 if(scenario==='driving')game.enterCar(game.ownedCar);
 if(scenario==='indoor')game._doLoadMap('apt_949');
 if(scenario==='day')game.worldMinutes=12*60;
 const realNow=performance.now.bind(performance);let tick=0,hits=0,moved=0,previous=null;
 globalThis.lightingProbe={frame(){
  tick++;_frameTime=1700000000000+tick*1000/30;_frameTimeSec=_frameTime/1000;
  const phase=tick%240;
  game.keys.d=scenario==='walking'&&phase<80;game.keys.a=scenario==='walking'&&phase>=80&&phase<160;
  game.keys.w=scenario==='driving'&&phase<80;game.keys.s=false;game.keys[' ']=scenario==='driving'&&phase>=80&&phase<120;
  performance.now=()=>17000+tick*1000/30;try{game.update();_gameTimeSec=_simTick/60;game.draw();}finally{performance.now=realNow;}
  const c=game._lightingBase;if(c&&c.valid&&c.hit)hits++;
  const v=game.view;if(previous&&(previous[0]!==v.x||previous[1]!==v.y||previous[2]!==v.zoom))moved++;previous=[v.x,v.y,v.zoom];
 },evidence(){return {ticks:tick,cacheHits:hits,movingCameraFrames:moved,cachePixels:game._lightingBase?.canvas?game._lightingBase.canvas.width*game._lightingBase.canvas.height:0,
  map:game.activeMap.id,running:game.running,paused:game.paused,dead:!!game.player.dead,pedestrians:game.pedestrians.pedestrians.length,cars:game.traffic.vehicles.length};},
 async hash(){const data={save:game.getSaveSchema(),people:game.pedestrians.pedestrians.map(p=>[p.x,p.y,p.state,p._hairSim,p._cloth,p._animState]),cars:game.traffic.vehicles.map(v=>[v.x,v.y,v.vx,v.vy,v.angle,v.currentLane?.id,v.isWaiting])};
 delete data.save.timestamp;const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}};
}'''

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 for k in ['baseline','candidate','save','output']:ap.add_argument('--'+k,required=True,type=Path)
 ap.add_argument('--scenarios',default='held,walking,driving');ap.add_argument('--runs',type=int,default=4);ap.add_argument('--frames',type=int,default=180);ap.add_argument('--warmup',type=int,default=240)
 ap.add_argument('--chromium',default='/usr/bin/chromium');ap.add_argument('--images',action='store_true');ap.add_argument('--visual-checks',action='store_true')
 args=ap.parse_args()
 if args.runs<=0 or args.frames<=0 or args.warmup<0:ap.error('Runs/frames must be positive and warmup nonnegative')
 for name in ['baseline','candidate','save']:
  if not getattr(args,name).is_file():ap.error(f'File not found: {getattr(args,name)}')
 if any(s not in ['held','walking','driving','indoor','day'] for s in args.scenarios.split(',')):ap.error('Unknown scenario')
 payload=json.loads(args.save.read_text());slot=str(payload['activeSlot']);saved=payload['slots'][slot]
 density={k:saved['settings'][k] for k in ['trafficDensity','pedestrianDensity','foliageDensity','rainDensity']}
 density.update(crowdQuality='high',lampShadows='off')
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.files={'/before.html':args.baseline,'/after.html':args.candidate}
 threading.Thread(target=server.serve_forever,daemon=True).start();args.output.parent.mkdir(parents=True,exist_ok=True)
 results={'method':{'engine':'Headless Chromium in local container; no phone CPU/GPU emulation','viewport':[1280,576],'dpr':1,'framesPerRun':args.frames,'warmupFrames':args.warmup,'runsPerBuild':args.runs,'saveSha256':hashlib.sha256(args.save.read_bytes()).hexdigest(),'baselineSha256':hashlib.sha256(args.baseline.read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256(args.candidate.read_bytes()).hexdigest(),'density':density,'unsavedDeviceOptions':'crowdQuality high, lampShadows off, scale1, device preset off from prior phone report','clock':'fixed Date clock and scoped render/update performance.now animation clock; native performance.now retained for interval timing; seeded random inputs; explicit update/draw loops after normal UI import/load; browser loop scheduling disabled; storage geometry memoization disabled equally','timing':'warm alternating intervals, no detailed timers; state hashing/screenshots excluded'},'scenarios':{},'errors':[],'limits':['Separate renderer contexts can differ substantially in timing even with identical builds. Use identical-build controls; these data alone cannot establish small performance gains.']}
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
   for scenario in args.scenarios.split(','):
    pages={}
    for build in ['before','after']:
     page=browser.new_page(viewport={'width':1280,'height':576});page.on('pageerror',lambda e:results['errors'].append(str(e)))
     page.add_init_script('Date.now=()=>1700000000000;let seed=291;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;localStorage.setItem("dfab_density",'+json.dumps(json.dumps(density))+');')
     page.goto(f'http://127.0.0.1:{server.server_port}/{build}.html',wait_until='load')
     page.evaluate('()=>{game.loop=()=>{};CacheDB.get=()=>null;CacheDB.put=()=>{};}')
     page.locator('#tap-to-begin').click();page.wait_for_function('!document.getElementById("tap-to-begin")')
     page.evaluate("saveSlotManager.open('load')");page.locator('#save-slot-overlay input[type=file]').set_input_files(args.save)
     page.wait_for_function('(slot)=>!!saveSlotManager.getSlotData(slot)',arg=int(slot))
     page.evaluate('saveSlotManager.close()');page.locator('#save-slot-overlay').wait_for(state='hidden')
     page.locator('#btn-load-game').click();page.locator(f'.save-slot-card[data-slot="{slot}"]').click()
     page.wait_for_function('game.running&&!game.paused',timeout=30000)
     page.evaluate(SETUP,scenario);page.evaluate('()=>{lightingProbe.frame();return document.fonts.ready;}')
     assert page.evaluate('!PeopleProfiler.active&&!TrafficProfiler.active&&!WorldRenderProfiler.active&&!SignProfiler.active&&!RenderStats.timed')
     settings=page.evaluate('PerformanceBench._context().settings')
     if 'settings' not in results['method']:results['method']['settings']=settings
     assert settings==results['method']['settings'],settings
     pages[build]=page
    runs=[];evidence={}
    for i in range(args.runs):
     for build in (['before','after'] if i%2==0 else ['after','before']):
      page=pages[build];r=page.evaluate('''o=>{for(let t=0;t<o.warm;t++)lightingProbe.frame();const start=performance.now();for(let t=0;t<o.frames;t++)lightingProbe.frame();return {ms:performance.now()-start,evidence:lightingProbe.evidence()};}''',{'warm':args.warmup,'frames':args.frames})
      evidence[build]=r['evidence'];assert r['evidence']['running'] and not r['evidence']['paused'] and not r['evidence']['dead'],r
      runs.append({'build':build,'ms':r['ms'],'stateHash':page.evaluate('lightingProbe.hash()')})
     assert runs[-1]['stateHash']==runs[-2]['stateHash'],f'State diverged: {scenario}'
    shots={k:page.evaluate('game.canvas.toDataURL()') for k,page in pages.items()}
    if args.images:
     for k,data in shots.items():args.output.with_name(args.output.stem+'-'+scenario+'-'+k+'.png').write_bytes(base64.b64decode(data.split(',')[1]))
    pixels_match=shots['before']==shots['after']
    medians={k:statistics.median(v['ms'] for v in runs if v['build']==k) for k in pages}
    results['scenarios'][scenario]={'runs':runs,'medianMs':medians,'evidence':evidence,'stateIdentical':True,'pixelsIdentical':pixels_match}
    args.output.write_text(json.dumps(results,indent=2)+'\n')
    assert pixels_match,f'Pixels diverged: {scenario}'
    print(json.dumps({scenario:{'medianMs':medians,'savedPercent':round(100*(1-medians['after']/medians['before']),2),'evidence':evidence,'stateIdentical':True,'pixelsIdentical':True}}),flush=True)
    if args.visual_checks:
     mutations={
      'lamp-intensity':"const l=game.lamps.find(l=>l._holeGrad&&l._litK>0);if(l)l.intensity=.45;",
      'lamp-shadow-geometry':"const l=game.lamps.find(l=>l._holeGrad&&l._shadowPoly?.length);if(l){l._shadowPoly=l._shadowPoly.map((p,i)=>({...p,x:p.x+(i===0?5:0)}));}",
      'night-vision':"game.nightVision=true;game.nvIntensity=.9;",
      'lightning':"game.weather.lightningFlash=.7;",
      'hard-shadows':"GameSettings.softShadows=false;game.resize();",
      'low-lighting':"game.lightingScale=.5;GameSettings.lightingQuality='low';game.resize();",
      'half-resolution':"GameSettings.resolutionScale=.5;game.resize();",
      'fire-light':"game.projectiles.push(new ProjectileEntity({x:game.player.x+70,y:game.player.y+20,angle:0,color:'#ff3300',speed:2,owner:game.player}));",
     }
     visual={};results['scenarios'][scenario]['visualChecks']=visual
     for name,code in mutations.items():
      shots={}
      for build,page in pages.items():
       shots[build]=page.evaluate("()=>{const realNow=performance.now.bind(performance);performance.now=()=>17000+lightingProbe.evidence().ticks*1000/30;try{"+code+"for(let i=0;i<6;i++)game.draw();return game.canvas.toDataURL();}finally{performance.now=realNow;}}")
       if args.images:args.output.with_name(args.output.stem+'-'+scenario+'-'+name+'-'+build+'.png').write_bytes(base64.b64decode(shots[build].split(',')[1]))
      visual[name]=shots['before']==shots['after'];args.output.write_text(json.dumps(results,indent=2)+'\n');assert visual[name],f'Visual check diverged: {scenario}/{name}'
     results['scenarios'][scenario]['visualChecks']=visual
    for page in pages.values():page.close()
   browser.close()
  assert not results['errors'],results['errors'];args.output.write_text(json.dumps(results,indent=2)+'\n')
 finally:server.shutdown();server.server_close()
if __name__=='__main__':main()
