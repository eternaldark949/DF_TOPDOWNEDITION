/* Experimental apartment renderer. Canvas is an asset baker, not a frame renderer.
   PixiJS 7.4.3 is bundled under MIT; see src/vendor/pixi-LICENSE.txt. */
class NativeWebGLRenderer {
    constructor(canvas) {
        const initStart=performance.now();
        this.canvas = canvas;
        this.layers={...NATIVE_LAYER_DEFAULTS};this.configurationId=0;
        this.imageRefs=new Map();this.textures = new Set(); this.props = new Map();
        this.frames = []; this.lastStart = 0; this.uploads = 0; this.bakes = 0;this.warmFrames=10;this.drawCalls=0;this.bufferBytes=0;
        this.textureQuality=NativeWebGLStorage.getItem('textureQuality')||'standard';this.qualityReductions=0;
        this.map = null; this.failure = null; this.lightsOn = true;
        try {
            this.renderer = new PIXI.Renderer({view:canvas, width:canvas.width, height:canvas.height,
                resolution:1, antialias:false, backgroundColor:0x08070c, powerPreference:'high-performance'});
            this.stage = new PIXI.Container(); this.world = new PIXI.Container(); this.stage.addChild(this.world);
            this.floor = new PIXI.Container(); this.objects = new PIXI.Container(); this.walls = new PIXI.Graphics();
            this.effects = new PIXI.Graphics(); this.world.addChild(this.floor, this.walls, this.objects, this.effects);
            // The lighting filter operates entirely on the renderer's GPU target.
            this.lightStage=new PIXI.Container();this.lightBase=new PIXI.Graphics();this.lightSprites=new PIXI.Container();
            this.lightStage.addChild(this.lightBase,this.lightSprites);
            const gradient=document.createElement('canvas');gradient.width=gradient.height=128;
            const gc=gradient.getContext('2d'),radial=gc.createRadialGradient(64,64,0,64,64,64);
            radial.addColorStop(0,'rgba(255,255,255,1)');radial.addColorStop(.5,'rgba(255,255,255,.25)');radial.addColorStop(1,'rgba(255,255,255,0)');
            gc.fillStyle=radial;gc.fillRect(0,0,128,128);this.lightGradient=PIXI.Texture.from(gradient);
            for(let i=0;i<40;i++){const s=new PIXI.Sprite(this.lightGradient);s.anchor.set(.5);s.blendMode=PIXI.BLEND_MODES.ADD;this.lightSprites.addChild(s);}
            this.lighting = new PIXI.Filter(undefined, `
                precision highp float;
                varying vec2 vTextureCoord;
                uniform sampler2D uSampler;
                uniform vec4 outputFrame;
                uniform vec4 inputSize;
                uniform vec2 viewport;
                uniform sampler2D lightMap;
                uniform sampler2D colorMap;
                uniform float colorGain;
                uniform float nightTint;
                uniform sampler2D veilMap;uniform float veilGain;uniform vec3 inverseWorld;uniform vec2 veilSize;
                void main() {
                    vec4 scene = texture2D(uSampler, vTextureCoord);
                    vec2 screen = outputFrame.xy + vTextureCoord * inputSize.xy;
                    vec3 illumination = texture2D(lightMap,screen/viewport).rgb;
                    float shade=1.0-max(illumination.r,max(illumination.g,illumination.b));
                    vec4 color=vec4(0.0);if(colorGain>0.0)color=texture2D(colorMap,screen/viewport)*colorGain;
                    vec4 veil=vec4(0.0);if(veilGain>0.0)veil=texture2D(veilMap,(screen*inverseWorld.z+inverseWorld.xy+vec2(24.0))/veilSize);
                    float darkAlpha=shade*(1.0-veil.a)+veil.a;
                    vec3 darkRGB=vec3(.086,.039,.188)*shade*nightTint*(1.0-veil.a)+veil.rgb;
                    vec3 shaded=scene.rgb*max(0.0,1.0-darkAlpha-color.a)+darkRGB*scene.a;
                    gl_FragColor = vec4(shaded+color.rgb*scene.a,scene.a);
                }`, {viewport:new Float32Array(2),lightMap:PIXI.Texture.EMPTY,colorMap:PIXI.Texture.EMPTY,colorGain:0,nightTint:0,veilMap:PIXI.Texture.EMPTY,veilGain:0,inverseWorld:new Float32Array(3),veilSize:new Float32Array([1,1])});
            this.lighting.padding = 0;
            this.world.filters = [this.lighting];
            this.world.filterArea = new PIXI.Rectangle(0,0,canvas.width,canvas.height);
            // Compile without binding: FilterSystem owns the projection and input
            // texture uniforms when the first real filter pass is applied.
            this.renderer.shader.generateProgram(this.lighting);
            const program=this.lighting.program.glPrograms[this.renderer.CONTEXT_UID];
            if(!program||!this.renderer.gl.getProgramParameter(program.program,this.renderer.gl.LINK_STATUS))
                throw new Error('Native lighting shader failed to link');
            // Count actual upload calls, including deferred Pixi uploads, without GPU checkpoints.
            const gl=this.renderer.gl;
            this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
            const info=gl.getExtension('WEBGL_debug_renderer_info');
            this.device={version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
            for(const name of ['texImage2D','texSubImage2D']) {
                const original=gl[name].bind(gl);
                gl[name]=(...args)=>{this.uploads++;return original(...args);};
            }
            for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced'])if(gl[name]){
                const original=gl[name].bind(gl);gl[name]=(...args)=>{this.drawCalls++;return original(...args);};
            }
            for(const name of ['bufferData','bufferSubData']){const original=gl[name].bind(gl);gl[name]=(...args)=>{
                const data=args[name==='bufferData'?1:2];this.bufferBytes+=typeof data==='number'?data:data?.byteLength||0;return original(...args);};}
            canvas.addEventListener('webglcontextlost',()=>{this.lost=true;this.gpuTimer.clear();this.message('WebGL context lost. Waiting for restoration…');});
            canvas.addEventListener('webglcontextrestored',()=>{
                this.lost=false;this.gpuTimer.extension=this.renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2');this.contextRestores=(this.contextRestores||0)+1;
                // Render-texture pixels cannot survive context loss. CPU geometry
                // remains valid, but every cached GPU light image must be redrawn.
                for(const r of this.shadowCache.values()){r.key=null;r.dynamicKey=null;}this.actorHash=null;this.veilKey=null;for(const r of this.nativeBuildings?.values()||[])r.key=null;for(const ctx of [this.actorContext,this.linenContext,this.glassContext,this.glowContext,this.fixtureContext,this.groundDetailContext,this.projectileContext,this.postEffectContext,this.cueContext,this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.worldCueContext,this.rainContext,this.roofDetailContext,...[...(this.nativeBuildings?.values()||[])].flatMap(r=>[r.base,r.top]),...[...this.props.values()].map(r=>r.liveContext)])for(const r of ctx?.gradients||[])r.key=null;
                this.frames=[];this.warmFrames=15;this.lastStart=this.lastEnd=0;this.capture=this.completedCapture=null;this.message('');
            });
            this.gpuTimer=new NativeGpuTimer(gl);this.frameId=0;this.initLayers();this.initDetails();this.initWorld();
        } catch(e) { this.failure=String(e.message||e); }
        this.initializationMs=performance.now()-initStart;
    }
    message(text) { if(this.notice) {this.notice.textContent=text;this.notice.hidden=!text;} }
    texture(canvas,resolution=1) {
        const texture=PIXI.Texture.from(canvas,{resolution});if(!this.textures.has(texture)){this.textures.add(texture);this.bakes++;}
        return texture;
    }
    retainImage(image){const t=this.texture(image);this.imageRefs.set(t,(this.imageRefs.get(t)||0)+1);return t;}
    releaseImage(t){const count=(this.imageRefs.get(t)||1)-1;if(count>0)this.imageRefs.set(t,count);else {this.imageRefs.delete(t);this.textures.delete(t);t.destroy(true);}}
    bake(w,h,paint,kind='art') {
        const density=this.bakeDensity(w,h,kind);
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*density);canvas.height=Math.ceil(h*density);
        const c=canvas.getContext('2d');c.scale(density,density);paint(c);return this.texture(canvas,density);
    }
    clearMap() {
        if(this.actorContext){this.actorContext.destroy();this.actorContext=null;this.actorTexture.destroy(true);this.actorTexture=null;this.actorHash=null;}
        for(const r of this.props.values())if(r.liveContext)r.liveContext.destroy();
        this.clearWorld();this.clearDetails();this.clearLayers();
        this.floor.removeChildren(); this.objects.removeChildren(); this.walls.clear(); this.effects.clear();
        for(const t of this.textures)t.destroy(true);
        this.textures.clear();this.props.clear();
        this.frames=[];this.lastStart=0;this.lastEnd=0;this.warmFrames=Math.max(10,this.warmFrames);this.lastPanel=0;
        this.capture=this.completedCapture=null;
    }
    propSignature(p) {return JSON.stringify([p.decorType,p.width,p.height,p.color,p._switchState,p._searched,p.interactionType]);}
    pose(game) {
        const start=performance.now();
        if(this.actorTexture&&!this.layers.characterAnimation){this.actorStats={...this.actorStats,frozen:true,changed:false,geometryMs:0,rasterSubmitMs:0,position:{x:game.player.x,y:game.player.y,angle:game.player.angle||0}};return this.actorTexture;}
        if(!this.actorContext){this.actorContext=new NativeVectorContext(this);
            this.actorTexture=PIXI.RenderTexture.create({width:192,height:192,resolution:2,scaleMode:PIXI.SCALE_MODES.LINEAR});this.actorRevision=0;}
        this.gpuTimer.begin('character',this.frameId);const ctx=this.actorContext,p=game.player;
        ctx.begin();ctx.translate(96,96);
        const ca=Math.cos(p.angle||0),sa=Math.sin(p.angle||0);
        ctx.worldFrame=_worldMatrix.multiply(new DOMMatrix([ca,sa,-sa,ca,p.x,p.y]));
        // Existing hair/cloth helpers see the real world transform, while their
        // vertices are rasterized in the local GPU target. No simulation clone.
        ctx.canvas=this.canvas;
        drawProceduralHumanoid(ctx,p,{...game.playerRenderConfig(),_crowdBake:true,noShadow:true});
        this.actorBounds=ctx.root.getLocalBounds();const prepared=performance.now();
        const changed=this.actorHash!==ctx.hash;
        if(changed){this.renderer.render(ctx.root,{renderTexture:this.actorTexture,clear:true});this.actorHash=ctx.hash;this.actorRevision++;}
        this.gpuTimer.end();this.actorStats={revision:this.actorRevision,frozen:false,changed,paths:ctx.pathsPainted,geometryMs:prepared-start,rasterSubmitMs:performance.now()-prepared,
            position:{x:p.x,y:p.y,angle:p.angle||0},phase:p.walkPhase||0,stance:game.playerRenderConfig().stance};
        return this.actorTexture;
    }
    draw(game) {
        if(this.failure||this.lost){this.message(this.failure||'WebGL context lost.');return;}
        if(!game.activeMap)return;
        const start=performance.now(),beforeUploads=this.uploads,beforeBakes=this.bakes,beforeDraws=this.drawCalls,beforeBuffers=this.bufferBytes;
        this.settings={resolutionScale:GameSettings.resolutionScale,baseZoom:GameSettings.baseZoom,fpsLimit:GameSettings.fpsLimit};
        this.frameId++;this.gpuTimer.poll();
        if(this.map!==game.activeMap){const mapStart=performance.now();this.buildMap(game);this.startup={mapBuildMs:performance.now()-mapStart,firstFrames:[],ready:false};}
        const w=game.canvas.width,h=game.canvas.height;
        if(this.renderer.screen.width!==w||this.renderer.screen.height!==h)this.renderer.resize(w,h);
        this.world.filterArea.width=w;this.world.filterArea.height=h;
        const zoom=game.camera.zoom*(game.finCam?.z||1);
        const target=game.cutscene?.active?game.camera:game.isDriving&&game.car?game.car:game.player;
        const c=game._clampView(target.x+(game.scopeLeanX||0),target.y+(game.scopeLeanY||0),zoom);
        const view=game.view={x:c.x,y:c.y,zoom,shakeX:game.camera.shakeX||0,shakeY:game.camera.shakeY||0};
        this.lastView={...view};
        game.camera.x=c.x;game.camera.y=c.y;
        this.world.scale.set(zoom);this.world.position.set(w/2-(view.x-view.shakeX)*zoom,h/2-(view.y-view.shakeY)*zoom);
        _worldMatrix=new DOMMatrix([zoom,0,0,zoom,this.world.x,this.world.y]);_worldCanvas=game.canvas;
        const LZ=CONFIG.LOD_ZOOM,lodZoom=game.camera.zoom/(GameSettings.baseZoom||1);let lod=game._zoomLOD||0;
        while(lod<2&&lodZoom<LZ[lod].in)lod++;while(lod>0&&lodZoom>LZ[lod-1].out)lod--;game._zoomLOD=_zoomLOD=lod;
        this.syncProps(game);
        this.playerSprite.texture=this.pose(game);this.playerSprite.position.set(game.player.x,game.player.y);
        this.playerSprite.rotation=game.player.angle||0;this.playerSprite.visible=game.player.visible!==false;
        this.playerSprite.alpha=(game.player.isHidden||game.flitState.active) ? .5 : 1;
        this.playerSprite.visible&&=this.layers.player;
        this.syncLayers(game,view);
        this.syncDetails(game,view);this.syncWorld(game,view);
        this.gpuTimer.begin('lighting',this.frameId);this.syncLighting(game,view);this.gpuTimer.end();
        this.gpuTimer.begin('scene',this.frameId);this.renderer.render(this.stage);this.gpuTimer.end();
        const end=performance.now();
        const f={frame:this.frameId,at:start,intervalMs:this.lastStart?start-this.lastStart:null,gapMs:this.lastEnd?start-this.lastEnd:null,renderMs:end-start,
            uploads:this.uploads-beforeUploads,bakes:this.bakes-beforeBakes,draws:this.drawCalls-beforeDraws,bufferBytes:this.bufferBytes-beforeBuffers,
            rain:{...this.rainStats},world:{...this.worldStats},details:structuredClone(this.detailStats),animation:{...this.actorStats},shadows:{...this.shadowStats},stages:{...this.layerStages}};this.lastStart=start;
        this.lastEnd=end;
        if(this.startup&&!this.startup.ready){this.startup.firstFrames.push({...f});if(this.startup.firstFrames.length>=15)this.startup.ready=true;}
        if(this.warmFrames>0)this.warmFrames--;
        else {if(!this.frames.length)f.intervalMs=f.gapMs=null;this.frames.push(f);if(this.frames.length>6000)this.frames.shift();}
        if(this.capture&&!this.warmFrames&&this.frames.length&&!this.capture.finished){
            this.capture.startedAt??=start;
            if(start-this.capture.startedAt>=this.capture.durationMs){this.capture.finished=true;this.completedCapture=this.report();if(this.onCaptureComplete)this.onCaptureComplete();}
        }
        if(this.panel&&start-(this.lastPanel||0)>1000){this.lastPanel=start;const r=this.report();
            const recording=this.capture&&!this.capture.finished?' · recording':'';
            this.panel.textContent=`Native WebGL · ${r.fps.toFixed(1)} FPS · CPU ${r.renderMeanMs.toFixed(1)} ms · uploads ${f.uploads}${recording}`;}
    }
    report() {
        const frames=this.frames.slice(),intervals=frames.map(f=>f.intervalMs).filter(v=>v>0),sum=intervals.reduce((a,b)=>a+b,0);
        const sorted=intervals.slice().sort((a,b)=>a-b);
        return {renderer:'native-webgl-apartment',build:'native-webgl-city-v5',pixiVersion:PIXI.VERSION,device:this.device,map:this.map?.id,view:this.lastView,
            settings:this.settings,resolution:[this.canvas.width,this.canvas.height],lighting:this.lightsOn,warmFramesRemaining:this.warmFrames,frames,
            animationSummary:{changedFrames:frames.filter(f=>f.animation?.changed).length,geometryMeanMs:frames.length?frames.reduce((n,f)=>n+(f.animation?.geometryMs||0),0)/frames.length:0,
                shadowRefreshFrames:frames.filter(f=>f.shadows.dynamicRebuilds>0).length,dynamicRebuilds:frames.reduce((n,f)=>n+(f.shadows.dynamicRebuilds||0),0),staticRebuilds:frames.reduce((n,f)=>n+(f.shadows.staticRebuilds||0),0)},
            rain:this.rainStats,world:this.worldStats,textureQuality:this.textureQuality,assetDensities:[...new Set([...this.textures].map(t=>t.baseTexture.resolution))],glyphAtlasBytes:Object.values(PIXI.BitmapFont.available.NativeDetailFont.pageTextures).reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0),qualityReductions:this.qualityReductions,details:this.detailStats,layers:{...this.layers},configurationId:this.configurationId,sampleDurationMs:sum,
            contextRestores:this.contextRestores||0,
            capture:this.capture?{...this.capture}:null,player:this.playerSprite?{x:this.playerSprite.x,y:this.playerSprite.y}:null,
            fps:sum?intervals.length*1000/sum:0,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]||0,
            stallsOver250Ms:intervals.filter(v=>v>250).length,stallsOver1000Ms:intervals.filter(v=>v>1000).length,
            renderMeanMs:frames.length?frames.reduce((a,f)=>a+f.renderMs,0)/frames.length:0,
            textureBytes:[...this.textures].reduce((a,t)=>a+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0)+(128*128*2+256*256)*4,
            lightingTargetBytes:[this.lightTarget,this.colorTarget].filter(Boolean).reduce((a,t)=>a+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0),
            timing:this.gpuTimer.extension?'CPU submission, actual frame cadence, and optional asynchronous GPU samples':'CPU render submission and frame cadence; GPU timer unavailable',
            shadowCache:this.shadowStats,layerStages:this.layerStages,animation:this.actorStats,startup:this.startup,entryTiming:this.entryTiming,initializationMs:this.initializationMs,
            gpu:{status:this.gpuTimer.status,pending:this.gpuTimer.pending.length,samples:this.gpuTimer.samples.filter(s=>s.frame>=(frames[0]?.frame??Infinity))},
            gradientTargetBytes:[this.actorContext,this.linenContext,this.glassContext,this.glowContext,this.fixtureContext,this.groundDetailContext,this.projectileContext,this.postEffectContext,this.cueContext,this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.worldCueContext,this.rainContext,this.roofDetailContext,...[...(this.nativeBuildings?.values()||[])].flatMap(r=>[r.base,r.top]),...[...this.props.values()].map(r=>r.liveContext)].filter(Boolean).reduce((n,c)=>n+c.gradients.length*128*128*4,0),
            veilTargetBytes:this.veilTarget?this.veilTarget.baseTexture.realWidth*this.veilTarget.baseTexture.realHeight*4:0,
            characterTargetBytes:this.actorTexture?this.actorTexture.baseTexture.realWidth*this.actorTexture.baseTexture.realHeight*4:0,
            shadowTextureBytes:this.shadowBytes(),
            limitations:['City/interior migration; some cinematic passes remain approximate','Procedural character paths use GPU tessellation; tiny Canvas shadowBlur accents remain approximate','Furniture shadows use the original geometric footprints','NPC silhouette casts, window droplets and wet reflections are not migrated; small blur/dash accents remain approximate']};
    }
}
