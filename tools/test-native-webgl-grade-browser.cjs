#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),{PNG}=require('pngjs');
(async()=>{
 const root=path.join(__dirname,'..'),server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync(path.join(root,q.url==='/canvas'?'DFAB V8.html':'DFAB WebGL.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const pages={},errors=[],results={};
  for(const mode of ['canvas','native']){
   const page=pages[mode]=await browser.newPage({viewport:{width:880,height:411}});page.on('pageerror',e=>errors.push(e.stack));await page.goto('http://127.0.0.1:'+server.address().port+'/'+mode);
   results[mode]=await page.evaluate(()=>{
    game.loop=()=>{};game.resetGameState();game._doLoadMap('apt_949');game.running=true;game.paused=false;
    game.worldMinutes=1260;game.sunState=()=>({k:0});game._sunReach=()=>1;
    // Independently bake the original skyline in each build, rather than compare
    // the fork's renderer against a reference that reuses its own cached art.
    game._cullBounds={view:{left:0,right:880,top:-150,bottom:300}};game._cityView=game._makeAptCityView();const city=game._cityView;city.bakeBase();city.bakeGlow();
    const hash=cv=>{let h=2166136261;for(const v of cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data)h=Math.imul(h^v,16777619)>>>0;return h;};
    const skyline={base:hash(city.base),glow:hash(city.glow)};
    if(game.nativeRenderer)game.nativeRenderer.setLayers(Object.fromEntries(Object.keys(game.nativeRenderer.layers).map(k=>[k,k==='colorGrade'])));
    else RenderLayers.at=()=>false;
    const grades=[],record=()=>{game.draw();grades.push({filter:game.canvas.style.filter,nv:game.nvIntensity,gray:game.visualGrayscale});};
    game.player.visibility=1;game.nvIntensity=game.visualGrayscale=0;
    for(let i=0;i<GAME_GRADE_PRESETS.length;i++){applyGameGradePreset(i);record();}
    setGameGradeValue('exposure',35);setGameGradeValue('brightness',125);setGameGradeValue('contrast',175);setGameGradeValue('saturate',55);record();
    game.sunState=()=>({k:.7});record();game.player.visibility=.2;for(let i=0;i<4;i++)record();
    GameSettings.stealthGray=false;record();game.cineCam={dx:0,dy:0};GameSettings.photoFullColour=true;record();game.cineCam=null;
    game.nightVision=true;for(let i=0;i<55;i++)record();game.player.buffSystem.isActive=name=>name==='jeanSoda';record();
    game.nightVision=false;game.scenes.ui.memK=.65;for(let i=0;i<8;i++)record();game.scenes.running=true;record();game.scenes.running=false;
    restoreGameGrade();record();
    return {skyline,grades,wash:{display:document.getElementById('grade-overlay').style.display,background:document.getElementById('grade-overlay').style.background,opacity:document.getElementById('grade-overlay').style.opacity}};
   });
  }
  assert.deepEqual(results.native.skyline,results.canvas.skyline);assert.deepEqual(results.native.grades,results.canvas.grades);assert.deepEqual(results.native.wash,results.canvas.wash);
  const native=pages.native,lighting=await native.evaluate(()=>{
   const r=game.nativeRenderer;r.setLayers({lighting:true});game.draw();const level=r.lightBase.tint;
   const oldSize=[r.renderer.screen.width,r.renderer.screen.height];r.renderer.resize(8,8);const target=PIXI.RenderTexture.create({width:8,height:8,resolution:1}),map=PIXI.RenderTexture.create({width:8,height:8,resolution:1}),light=new PIXI.Graphics().beginFill(0x0d0d0d).drawRect(0,0,8,8).endFill();r.renderer.render(light,{renderTexture:map,clear:true});
   const shader=r.lighting,saved={...shader.uniforms};Object.assign(shader.uniforms,{viewport:new Float32Array([8,8]),inverseWorld:new Float32Array([0,-4,1]),mapSize:new Float32Array([8,8]),lightMap:map,colorGain:0,veilGain:0,nightTint:0});
   const chart=new PIXI.Container();chart.addChild(new PIXI.Graphics().beginFill(0xcc6633).drawRect(0,0,8,8).endFill());chart.filters=[shader];chart.filterArea=new PIXI.Rectangle(0,0,8,8);r.renderer.render(chart,{renderTexture:target,clear:true});const data=r.renderer.extract.pixels(target),pixel=(x,y)=>[...data.slice((y*8+x)*4,(y*8+x)*4+4)];
   const result={level,outside:pixel(4,1),inside:pixel(4,6)};Object.assign(shader.uniforms,saved);chart.destroy({children:true});light.destroy();target.destroy(true);map.destroy(true);r.renderer.resize(...oldSize);
   r.setLayers({colorGrade:false});game.draw();result.disabled=game.canvas.style.filter;r.setLayers({colorGrade:true});game.draw();result.enabled=game.canvas.style.filter;return result;
  });
  assert.equal(lighting.level,0x0d0d0d);assert.deepEqual(lighting.outside,[204,102,51,255]);assert.ok(lighting.inside[0]<20);assert.equal(lighting.disabled,'none');assert.notEqual(lighting.enabled,'none');
  // Browser-composited pixels: the same chart and original CSS grade on a real
  // Canvas2D surface and a real WebGL surface. GPU extraction omits CSS filters.
  const charts={};
  for(const mode of ['canvas','native']){
   const page=pages[mode];await page.evaluate(({mode,filter})=>{
    document.body.innerHTML='';document.body.style.cssText='margin:0;background:black';const cv=document.createElement('canvas');cv.width=256;cv.height=64;cv.id='grade-chart';cv.style.cssText='display:block;width:256px;height:64px';cv.style.filter=filter;document.body.append(cv);
    const colors=['#b84060','#2466bb','#999999','#e0c090'];
    if(mode==='native'){const r=new PIXI.Renderer({view:cv,width:256,height:64,antialias:false}),g=new PIXI.Graphics();colors.forEach((c,i)=>g.beginFill(PIXI.Color.shared.setValue(c).toNumber()).drawRect(i*64,0,64,64).endFill());r.render(g);window.chartRenderer=r;}
    else{const c=cv.getContext('2d');colors.forEach((v,i)=>{c.fillStyle=v;c.fillRect(i*64,0,64,64);});}
   },{mode,filter:results.canvas.grades.at(-1).filter});
   charts[mode]=PNG.sync.read(await page.locator('#grade-chart').screenshot());
  }
  let error=0;for(let i=0;i<charts.canvas.data.length;i++)error+=Math.abs(charts.canvas.data[i]-charts.native.data[i]);const pixelError=error/charts.canvas.data.length;assert.ok(pixelError<1);
  assert.deepEqual(errors,[]);const evidence={passed:true,environment:'Desktop Chromium SwiftShader; no phone performance claim',skyline:results.native.skyline,gradeCases:results.native.grades.length,lighting,browserChartMeanError:pixelError};
  fs.writeFileSync(path.join(root,'docs/native-webgl-grade-checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
