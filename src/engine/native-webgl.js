/* Experimental apartment renderer. Canvas is an asset baker, not a frame renderer.
   PixiJS 7.4.3 is bundled under MIT; see src/vendor/pixi-LICENSE.txt. */
class NativeWebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.layers={...NATIVE_LAYER_DEFAULTS};this.configurationId=0;
        this.textures = new Set(); this.props = new Map(); this.poses = new Map();
        this.frames = []; this.lastStart = 0; this.uploads = 0; this.bakes = 0;this.warmFrames=10;this.drawCalls=0;this.bufferBytes=0;
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
                void main() {
                    vec4 scene = texture2D(uSampler, vTextureCoord);
                    vec2 screen = outputFrame.xy + vTextureCoord * inputSize.xy;
                    vec3 illumination = texture2D(lightMap,screen/viewport).rgb;
                    float shade=1.0-max(illumination.r,max(illumination.g,illumination.b));
                    vec4 color=vec4(0.0);if(colorGain>0.0)color=texture2D(colorMap,screen/viewport)*colorGain;
                    vec3 shaded=scene.rgb*illumination+vec3(.086,.039,.188)*shade*nightTint*scene.a;
                    gl_FragColor = vec4(shaded*(1.0-color.a)+color.rgb*scene.a,scene.a);
                }`, {viewport:new Float32Array(2),lightMap:PIXI.Texture.EMPTY,colorMap:PIXI.Texture.EMPTY,colorGain:0,nightTint:0});
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
            canvas.addEventListener('webglcontextlost',()=>{this.lost=true;this.message('WebGL context lost. Waiting for restoration…');});
            canvas.addEventListener('webglcontextrestored',()=>{
                this.lost=false;this.contextRestores=(this.contextRestores||0)+1;
                // Render-texture pixels cannot survive context loss. CPU geometry
                // remains valid, but every cached GPU light image must be redrawn.
                for(const r of this.shadowCache.values())r.key=null;
                this.frames=[];this.warmFrames=15;this.lastStart=this.lastEnd=0;this.capture=this.completedCapture=null;this.message('');
            });
            this.initLayers();
        } catch(e) { this.failure=String(e.message||e); }
    }
    message(text) { if(this.notice) {this.notice.textContent=text;this.notice.hidden=!text;} }
    texture(canvas) {
        const texture=PIXI.Texture.from(canvas); this.textures.add(texture); this.bakes++;
        return texture;
    }
    bake(w,h,paint) {
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(w);canvas.height=Math.ceil(h);
        paint(canvas.getContext('2d'));return this.texture(canvas);
    }
    clearMap() {
        this.clearLayers();
        this.floor.removeChildren(); this.objects.removeChildren(); this.walls.clear(); this.effects.clear();
        for(const t of this.textures)t.destroy(true);
        this.textures.clear();this.props.clear();this.poses.clear();this.appearance=null;
        this.frames=[];this.lastStart=0;this.lastEnd=0;this.warmFrames=10;this.lastPanel=0;
        this.capture=this.completedCapture=null;
    }
    propSignature(p) {return JSON.stringify([p.decorType,p.width,p.height,p.color,p._switchState,p._searched,p.interactionType]);}
    syncProps(game) {
        const live=new Set(game.props||[]);
        for(const [p,r] of this.props)if(!live.has(p)){
            r.sprite.destroy();for(const t of r.animation||[r.texture]){this.textures.delete(t);t.destroy(true);}this.props.delete(p);
        }
        for(const p of live) {
            const signature=this.propSignature(p);let r=this.props.get(p);
            if(p.visible===false&&!r)continue;
            if(!r||r.signature!==signature) {
                const pad=48,w=p.width||p.w||24,h=p.height||p.h||24;
                const texture=this.bake(w+pad*2,h+pad*2,c=>{
                    c.translate(pad-p.x,pad-p.y);
                    const angle=p.angle,mode=PropPass.mode,stamp=PropSprites.stamp,seg=PropPass.seg;
                    try {p.angle=0;PropPass.mode=1;PropPass.seg=()=>true;PropSprites.stamp=()=>false;p.draw(c);}
                    finally {p.angle=angle;PropPass.mode=mode;PropSprites.stamp=stamp;PropPass.seg=seg;}
                });
                if(r){for(const t of r.animation||[r.texture]){this.textures.delete(t);t.destroy(true);}r.animation=null;r.sprite.texture=texture;}
                else {r={sprite:new PIXI.Sprite(texture)};r.sprite.anchor.set(.5);this.objects.addChild(r.sprite);}
                Object.assign(r,{texture,signature});this.props.set(p,r);
            }
            r.sprite.position.set(p.x+(p.width||p.w||24)/2,p.y+(p.height||p.h||24)/2);
            r.sprite.rotation=p.angle||0;r.sprite.visible=p.visible!==false;
        }
        // Match the existing renderer: player appears above furniture.
        this.objects.setChildIndex(this.playerSprite,this.objects.children.length-1);
    }
    pose(game) {
        const cosmetics=game.cosmetics.getRenderConfig();const appearance=JSON.stringify(cosmetics);
        if(this.appearance!==appearance) {
            for(const t of this.poses.values()){this.textures.delete(t);t.destroy(true);}
            this.poses.clear();this.appearance=appearance;
        }
        const p=game.player,moving=Math.hypot(p.vx||0,p.vy||0)>.1;
        const phase=moving?Math.floor((((p.walkPhase||0)%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*8):0;
        const armed=!game.weaponHolstered&&['normal','sniper'].includes(game.weaponMode);
        const stance=armed?(game.currentWeapon?stanceForWeapon(game.currentWeapon.id):'pistol'):'idle';
        const pose=game.furniture?.holding?'push':game.sneaking?'sneak':undefined;
        const key=[moving,phase,stance,pose||'idle'].join(':');
        if(!this.poses.has(key)) {
            // Bounded pose cache; appearance and map changes release every texture.
            if(this.poses.size>=64){const [k,t]=this.poses.entries().next().value;this.poses.delete(k);this.textures.delete(t);t.destroy(true);}
            const entity={...p,x:0,y:0,angle:0,walkPhase:phase*Math.PI/4,
                vx:moving?1:0,vy:0,_ipActive:false,_animState:undefined,_pose:undefined,
                _gait:{tick:_simTick,prevX:0,prevY:0,speed:moving?3:0,dirX:1,dirY:0,cmdX:0,cmdY:0,driven:false}};
            const outfit=cosmetics.outfit;
            const texture=this.bake(192,192,c=>{
                c.translate(96,96);
                drawProceduralHumanoid(c,entity,{...cosmetics,...outfit,gender:APPEARANCES['949'].gender,
                    skinColor:cosmetics.skinColor,stance,pose,poseWhileMoving:!!pose,_crowdBake:true,noShadow:true});
            });this.poses.set(key,texture);
        }
        return this.poses.get(key);
    }
    draw(game) {
        if(this.failure||this.lost){this.message(this.failure||'WebGL context lost.');return;}
        if(game.activeMap?.id!=='apt_949'){this.message('This WebGL slice supports the apartment. Use Restart apartment to return.');return;}
        const start=performance.now(),beforeUploads=this.uploads,beforeBakes=this.bakes,beforeDraws=this.drawCalls,beforeBuffers=this.bufferBytes;
        this.settings={resolutionScale:GameSettings.resolutionScale,baseZoom:GameSettings.baseZoom,fpsLimit:GameSettings.fpsLimit};
        if(this.map!==game.activeMap)this.buildMap(game);
        const w=game.canvas.width,h=game.canvas.height;
        if(this.renderer.screen.width!==w||this.renderer.screen.height!==h)this.renderer.resize(w,h);
        this.world.filterArea.width=w;this.world.filterArea.height=h;
        const zoom=game.camera.zoom*(game.finCam?.z||1);
        const target=game.cutscene?.active?game.camera:game.player;
        const c=game._clampView(target.x+(game.scopeLeanX||0),target.y+(game.scopeLeanY||0),zoom);
        const view=game.view={x:c.x,y:c.y,zoom,shakeX:game.camera.shakeX||0,shakeY:game.camera.shakeY||0};
        this.lastView={...view};
        game.camera.x=c.x;game.camera.y=c.y;
        this.world.scale.set(zoom);this.world.position.set(w/2-(view.x-view.shakeX)*zoom,h/2-(view.y-view.shakeY)*zoom);
        _worldMatrix=new DOMMatrix([zoom,0,0,zoom,this.world.x,this.world.y]);_worldCanvas=game.canvas;
        this.syncProps(game);
        this.playerSprite.texture=this.pose(game);this.playerSprite.position.set(game.player.x,game.player.y);
        this.playerSprite.rotation=game.player.angle||0;this.playerSprite.visible=game.player.visible!==false;
        this.playerSprite.alpha=(game.player.isHidden||game.flitState.active) ? .5 : 1;
        this.playerSprite.visible&&=this.layers.player;
        this.syncLayers(game,view);
        this.syncLighting(game,view);
        this.effects.clear();
        for(const p of game.projectiles||[]){this.effects.beginFill(0xffdd88);this.effects.drawCircle(p.x,p.y,3);this.effects.endFill();}
        this.renderer.render(this.stage);
        const end=performance.now();
        const f={at:start,intervalMs:this.lastStart?start-this.lastStart:null,gapMs:this.lastEnd?start-this.lastEnd:null,renderMs:end-start,
            uploads:this.uploads-beforeUploads,bakes:this.bakes-beforeBakes,draws:this.drawCalls-beforeDraws,bufferBytes:this.bufferBytes-beforeBuffers,
            shadows:{...this.shadowStats},stages:{...this.layerStages}};this.lastStart=start;
        this.lastEnd=end;
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
        return {renderer:'native-webgl-apartment',build:'native-webgl-layers-v2',pixiVersion:PIXI.VERSION,device:this.device,map:this.map?.id,view:this.lastView,
            settings:this.settings,resolution:[this.canvas.width,this.canvas.height],lighting:this.lightsOn,warmFramesRemaining:this.warmFrames,frames,
            layers:{...this.layers},configurationId:this.configurationId,sampleDurationMs:sum,
            contextRestores:this.contextRestores||0,
            capture:this.capture?{...this.capture}:null,player:this.playerSprite?{x:this.playerSprite.x,y:this.playerSprite.y}:null,
            fps:sum?intervals.length*1000/sum:0,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]||0,
            stallsOver250Ms:intervals.filter(v=>v>250).length,stallsOver1000Ms:intervals.filter(v=>v>1000).length,
            renderMeanMs:frames.length?frames.reduce((a,f)=>a+f.renderMs,0)/frames.length:0,
            textureBytes:[...this.textures].reduce((a,t)=>a+t.width*t.height*4,0)+(128*128*2+256*256)*4,
            lightingTargetBytes:[this.lightTarget,this.colorTarget].filter(Boolean).reduce((a,t)=>a+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0),
            timing:'CPU render submission and frame cadence; GPU execution is not timed',
            shadowCache:this.shadowStats,layerStages:this.layerStages,
            shadowTextureBytes:this.shadowBytes(),
            limitations:['Apartment slice; static city backdrop','Eight-phase player animation','Geometric shadow footprints approximate detailed silhouettes','NPCs and advanced combat effects not migrated']};
    }
}
