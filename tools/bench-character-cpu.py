#!/usr/bin/env python3
"""Controlled main-world-canvas character, particle and city probes. Requires Playwright and Chromium.

Example: python tools/bench-character-cpu.py --baseline /tmp/baseline.html \
  --candidate 'DFAB V8.html' --output /tmp/characters.json
Reports desktop synchronous draw/submission timings; does not emulate phone hardware.
"""
import argparse, base64, hashlib, json, statistics, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

SETUP = r'''({scenario})=>{
 let seed=72841;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
 Object.assign(GameSettings,{resolutionScale:1,fpsLimit:60,baseZoom:1,
  lightingQuality:'high',adaptiveLighting:false,softShadows:true,bloom:false,reflections:'off',
  trafficDensity:'high',pedestrianDensity:'high',crowdQuality:'high',lampShadows:'off',
  foliageDensity:'high',rainDensity:'high',filmGrain:false,devicePreset:false});
 game.story.update=()=>{};game._doLoadMap('sdc');
 game.worldMinutes=scenario.endsWith('day')?12*60:21*60;
 game.weather.isRaining=true;game.weather.condition='rain';
 game.canvas.width=880;game.canvas.height=411;
 if(scenario.startsWith('city')){
  GameSettings.trafficDensity='high';GameSettings.pedestrianDensity='high';
  game.running=true;game.paused=false;
  // Anchor the camera on a sidewalk junction, rather than the middle of a block
  // where the narrow viewport can contain no pedestrians at all.
  const anchor=game.pedestrians.network.nodes.reduce((a,n)=>
   (n.x-2650)**2+(n.y-1100)**2<(a.x-2650)**2+(a.y-1100)**2?n:a);
  game.player.x=anchor.x;game.player.y=anchor.y;game.camera.zoom=1;
  game.player.invincibleTimer=1000000;
  let tick=0,drawn=0,frames=0;
  globalThis.charProbe={scenario,get people(){return game.pedestrians.pedestrians;},frame(){
   tick++;_frameTime=1700000000000+tick*1000/30;_frameTimeSec=_frameTime/1000;
   game.update();_gameTimeSec=_simTick/60;game.draw();drawn+=RenderStats.bodies;frames++;
  },evidence(){const people=this.people,hair=people.map(e=>e._hairSim),cloth=people.flatMap(e=>Object.values(e._cloth||{}));
   return {bodies:people.length,meanDrawnBodies:drawn/frames,cars:game.traffic.vehicles.length,running:game.running,paused:game.paused,playerDead:!!game.player.dead,
    hairOwners:hair.filter(Boolean).length,strandOwners:hair.filter(s=>s&&s.strands.length).length,
    clothPanels:cloth.length,hairCap:HAIR_SIM.MAX_STEPS,clothCap:CLOTH_SIM.MAX_STEPS};}};
  return;
 }
 if(scenario.startsWith('particles')){
  const ctx=game.ctx,stress=scenario.endsWith('effects');
  game.weather.particles=Array.from({length:240},(_,i)=>({
   type:i%19===0?'ghost':i%4===0?'spark':'dust',x:20+(i*31)%840,y:20+(i*17)%370,
   vx:i%7-3,vy:i%5-2,size:2+i%4,angle:i*.3,life:.2+(i%8)/10,
   color:['rgba(220, 120, 60, 1)','rgba(100, 160, 230, 0.5)','#36a','invalid-color','rgb(20, 50, 80)'][i%5]}));
  globalThis.charProbe={scenario,people:[],frame(t){
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,880,411);
   _worldCanvas=game.canvas;_worldMatrix=ctx.getTransform();
   ctx.save();
   ctx.fillStyle='#795134';ctx.strokeStyle='#357951';ctx.lineWidth=7;ctx.globalAlpha=.67;
   if(stress){ctx.shadowColor='#406080';ctx.shadowBlur=3;ctx.shadowOffsetX=2;ctx.globalCompositeOperation='lighter';ctx.filter='blur(0.25px)';ctx.beginPath();ctx.rect(10,10,850,390);ctx.clip();}
   game.weather.draw(ctx,{left:0,top:0,right:880,bottom:411},1);
   this.contextState=[ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth,ctx.globalAlpha,ctx.shadowColor,ctx.shadowBlur,ctx.shadowOffsetX,ctx.globalCompositeOperation,ctx.filter,Array.from(ctx.getTransform().toFloat64Array())];
   ctx.restore();
  },evidence(){return {particles:game.weather.particles.length};}};
  return;
 }
 const ctx=game.ctx,N=24,people=Array.from({length:N},(_,i)=>new Pedestrian(3040+i%8*100,3040+Math.floor(i/8)*120,null));
 const heavy=scenario==='hair-heavy'||scenario.includes('catch-up')||scenario.startsWith('physics');
 for(let i=0;i<N;i++){
  const e=people[i];e.look={...e.look};
  if(heavy){e.look.hair={type:['long','dreadlocks','demon_dancer','ponytail','braids'][i%5],color:'#382045'};
   e.look.top={type:'coat',color:'#485078'};e.look.bottom={type:'skirt',color:'#684070'};e.look.umbrella=null;}
 }
 const dt=scenario.includes('catch-up')?.05:1/60;
 const spec={segs:4,stiffness:.1,damping:.88,keepOut:7,chains:Array.from({length:6},(_,i)=>({a:{x:-5,y:(i-2.5)*3},t:{x:-24,y:(i-2.5)*4}}))};
 globalThis.charProbe={ctx,people,scenario,frame(t){
  _gameTimeSec=t*dt;_simTick=Math.floor(_gameTimeSec*60);_frameTime=1700000000000+t*dt*2000;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,880,411);
  ctx.setTransform(1,0,0,1,-3000,-3000);_worldMatrix=ctx.getTransform();_worldCanvas=game.canvas;
  for(let i=0;i<N;i++){
   const e=people[i];
   const moving=scenario!=='idle'&&(heavy||i%3!==0),phase=t*.09+i*.3;
   e.x=3040+i%8*100+(moving?Math.sin(t*.015+i)*20:0);
   e.y=3040+Math.floor(i/8)*120+(moving?Math.cos(t*.015+i)*12:0);
   e.facingAngle=moving?Math.atan2(-Math.sin(t*.015+i)*12,Math.cos(t*.015+i)*20):i*.2;
   e.walkPhase=phase;
   if(scenario.startsWith('physics')){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.facingAngle);
    hairGeometry(ctx,3,e.look.hair,{owner:e,sway:.1*Math.sin(phase),wind:{x:.2,y:.1}});
    clothGeometry(ctx,e,'cpu-panel',spec,{wind:{x:.2,y:.1}});ctx.restore();
   }else e.draw(ctx);
  }
 },evidence(){
  const hair=people.map(e=>e._hairSim),cloth=people.flatMap(e=>Object.values(e._cloth||{}));
  return {bodies:N,hairOwners:hair.filter(Boolean).length,strandOwners:hair.filter(s=>s&&s.strands.length).length,
   hairPoints:hair.reduce((n,s)=>n+(s?s.strands.reduce((a,p)=>a+p.length,0):0),0),clothPanels:cloth.length,
   hairCap:HAIR_SIM.MAX_STEPS,clothCap:CLOTH_SIM.MAX_STEPS};
 }};
}'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] in self.server.files:
            data=self.server.files[self.path.split('?')[0]].read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        else:
            self.send_error(404)
    def log_message(self,*args): pass

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline',required=True,type=Path);ap.add_argument('--candidate',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path);ap.add_argument('--scenarios',default='mixed,idle,day,hair-heavy,catch-up')
    ap.add_argument('--runs',type=int,default=4);ap.add_argument('--frames',type=int,default=360)
    ap.add_argument('--images',action='store_true');ap.add_argument('--profile',action='store_true');ap.add_argument('--chromium',default='/usr/bin/chromium')
    args=ap.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
    for path in [args.baseline,args.candidate]:
        if not path.is_file():ap.error(f'Build not found: {path}')
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    server.files={'/before.html':args.baseline.resolve(),'/after.html':args.candidate.resolve()}
    threading.Thread(target=server.serve_forever,daemon=True).start()
    result={'method':{'engine':'Headless Chromium in local container; no phone CPU/GPU emulation','canvas':'actual main world canvas; live hair and cloth','warmupFrames':240,'framesPerRun':args.frames,'runsPerBuild':args.runs,'profileTimers':False,'baselineSha256':hashlib.sha256(args.baseline.read_bytes()).hexdigest(),'candidateSha256':hashlib.sha256(args.candidate.read_bytes()).hexdigest(),'viewport':[880,411],'quality':'high','rngSeed':72841,'clock':'explicit fixed game-time increments; timings exclude state hashing and image export'},'scenarios':{},'errors':[]}
    try:
      with sync_playwright() as p:
       browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
       for scenario in args.scenarios.split(','):
        page=browser.new_page(viewport={'width':880,'height':411})
        page.on('pageerror',lambda e:result['errors'].append(str(e)))
        # One fresh page per variant, kept alive for alternating warm intervals.
        pages={}
        for build in ['before','after']:
         tab=page if build=='before' else browser.new_page(viewport={'width':880,'height':411})
         tab.on('pageerror',lambda e:result['errors'].append(str(e)))
         tab.add_init_script('Date.now=()=>1700000000000;let seed=291;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;')
         tab.goto(f'http://127.0.0.1:{server.server_port}/{build}.html',wait_until='load')
         tab.evaluate(SETUP,{'scenario':scenario})
         tab.evaluate('()=>{charProbe.frame(0);return document.fonts.ready;}')
         assert tab.evaluate('_worldCanvas===game.canvas'),'Fixture bypasses the main world canvas'
         assert tab.evaluate('!PeopleProfiler.active&&!TrafficProfiler.active&&!WorldRenderProfiler.active&&!SignProfiler.active&&!RenderStats.timed'),'Detailed timers are enabled'
         settings=tab.evaluate("Object.fromEntries(['resolutionScale','fpsLimit','baseZoom','lightingQuality','adaptiveLighting','softShadows','bloom','reflections','trafficDensity','pedestrianDensity','crowdQuality','lampShadows','foliageDensity','rainDensity','filmGrain','devicePreset'].map(k=>[k,GameSettings[k]]))")
         assert settings['bloom'] is False and settings['reflections']=='off','Fixture effects differ from phone report'
         if 'settings' not in result['method']:result['method']['settings']=settings
         assert settings==result['method']['settings'],'Fixture settings changed'
         pages[build]=tab
        runs=[];evidence={}
        for i in range(args.runs):
         for build in (['before','after'] if i%2==0 else ['after','before']):
          tab=pages[build]
          r=tab.evaluate('''frames=>{
           for(let t=0;t<240;t++)charProbe.frame(t);
           const start=performance.now();for(let t=240;t<240+frames;t++)charProbe.frame(t);
           return {ms:performance.now()-start,evidence:charProbe.evidence()};
          }''',args.frames)
          state=tab.evaluate('''async()=>{
           const data={people:charProbe.people.map(e=>({x:e.x,y:e.y,hair:e._hairSim,cloth:e._cloth,anim:e._animState})),particles:charProbe.scenario.startsWith('particles')?game.weather.particles:null,contextState:charProbe.contextState,cars:charProbe.scenario.startsWith('city')?game.traffic.vehicles.map(v=>[v.x,v.y,v.vx,v.vy,v.angle,v.currentLane?.id,v.isWaiting]):null};
           const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
           return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
          }''')
          runs.append({'build':build,'ms':r['ms'],'stateHash':state});evidence[build]=r['evidence']
          if scenario.startswith('city'):assert r['evidence']['running'] and not r['evidence']['paused'] and not r['evidence']['playerDead'],'City simulation stopped'
         assert runs[-1]['stateHash']==runs[-2]['stateHash'], 'Animation/physics state diverged'
        assert scenario.startswith('particles') or all(v['hairOwners']>0 for v in evidence.values()),f'Hair simulation is bypassed: {evidence}'
        if scenario in ['hair-heavy','catch-up','physics','physics-catch-up']:
         assert all(v['strandOwners']==24 and v['clothPanels']>0 for v in evidence.values()),'Expected live strand/cloth stress scene'
        shots={k:tab.evaluate('game.canvas.toDataURL()') for k,tab in pages.items()}
        assert shots['before']==shots['after'], 'Rendered pixels diverged'
        if args.images:
         for build,data in shots.items():args.output.with_name(args.output.stem+'-'+scenario+'-'+build+'.png').write_bytes(base64.b64decode(data.split(',')[1]))
        scheduling={}
        for build,tab in pages.items():
         scheduling[build]=tab.evaluate('''()=>{
          const original=_simSteps;let slices=0,calls=0;
          _simSteps=function(...a){const n=original(...a);slices+=n;calls++;return n;};
          try{charProbe.frame(1000);slices=calls=0;charProbe.frame(1001);
           const once={slices,calls};slices=calls=0;if(charProbe.scenario.startsWith('city'))game.draw();else charProbe.frame(1001);
           return {once,repeated:{slices,calls}};
          }finally{_simSteps=original;}
         }''')
         assert (scenario.startswith('particles') or scheduling[build]['once']['slices']>0) and scheduling[build]['repeated']['slices']==0, 'Repeated draws advanced physics'
        assert scheduling['before']==scheduling['after'],'Physics cadence changed'
        entry={'runs':runs,'medianMs':{k:statistics.median(r['ms'] for r in runs if r['build']==k) for k in pages},'evidence':evidence,'scheduling':scheduling,'stateIdentical':True,'pixelsIdentical':True}
        if args.profile:
         tab=pages['before'];cdp=tab.context.new_cdp_session(tab)
         cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':100});cdp.send('Profiler.start')
         tab.evaluate('frames=>{for(let t=1000;t<1000+frames;t++)charProbe.frame(t);}',args.frames)
         prof=cdp.send('Profiler.stop')['profile'];args.output.with_name(args.output.stem+'-'+scenario+'.cpuprofile').write_text(json.dumps(prof))
         weights={};nodes={n['id']:n for n in prof['nodes']}
         for sid,dt in zip(prof.get('samples',[]),prof.get('timeDeltas',[])):
          f=nodes[sid]['callFrame'];key=f['functionName'] or '(anonymous)';weights[key]=weights.get(key,0)+dt
         entry['sampledSelfMs']=dict(sorted(((k,round(v/1000,2)) for k,v in weights.items()),key=lambda kv:-kv[1])[:20])
        result['scenarios'][scenario]=entry
        summary={k:entry[k] for k in ['medianMs','stateIdentical','pixelsIdentical','evidence']}
        summary['savedPercent']=round(100*(1-entry['medianMs']['after']/entry['medianMs']['before']),2)
        print(json.dumps({scenario:summary}),flush=True)
        for tab in pages.values():tab.close()
       browser.close()
      assert not result['errors'],result['errors']
      args.output.write_text(json.dumps(result,indent=2)+'\n')
    finally:server.shutdown();server.server_close()

if __name__=='__main__':main()
