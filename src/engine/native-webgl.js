/* Experimental apartment renderer. Canvas is an asset baker, not a frame renderer.
   PixiJS 7.4.3 is bundled under MIT; see src/vendor/pixi-LICENSE.txt. */
class NativeWebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.textures = new Set(); this.props = new Map(); this.poses = new Map();
        this.frames = []; this.lastStart = 0; this.uploads = 0; this.bakes = 0;this.warmFrames=10;this.drawCalls=0;
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
            for(let i=0;i<24;i++){const s=new PIXI.Sprite(this.lightGradient);s.anchor.set(.5);s.blendMode=PIXI.BLEND_MODES.ADD;this.lightSprites.addChild(s);}
            this.lighting = new PIXI.Filter(undefined, `
                precision highp float;
                varying vec2 vTextureCoord;
                uniform sampler2D uSampler;
                uniform vec4 outputFrame;
                uniform vec4 inputSize;
                uniform vec2 viewport;
                uniform sampler2D lightMap;
                void main() {
                    vec4 scene = texture2D(uSampler, vTextureCoord);
                    vec2 screen = outputFrame.xy + vTextureCoord * inputSize.xy;
                    vec3 illumination = texture2D(lightMap,screen/viewport).rgb;
                    gl_FragColor = vec4(scene.rgb*illumination,scene.a);
                }`, {viewport:new Float32Array(2),lightMap:PIXI.Texture.EMPTY});
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
            canvas.addEventListener('webglcontextlost',()=>{this.lost=true;this.message('WebGL context lost. Waiting for restoration…');});
            canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.lastStart=0;this.message('');});
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
        this.floor.removeChildren(); this.objects.removeChildren(); this.walls.clear(); this.effects.clear();
        for(const t of this.textures)t.destroy(true);
        this.textures.clear();this.props.clear();this.poses.clear();this.appearance=null;
        this.frames=[];this.lastStart=0;this.lastEnd=0;this.warmFrames=10;this.lastPanel=0;
    }
    buildMap(game) {
        this.clearMap();this.map=game.activeMap;
        const map=this.map, top=map.cameraBounds?.top||0;
        const background=this.bake(map.width,map.height-top,c=>{
            c.translate(0,-top);c.fillStyle=map.floorColor;c.fillRect(0,top,map.width,map.height-top);
            for(const z of map.zones||[]){c.fillStyle=z.color;c.fillRect(z.x,z.y,z.w,z.h);}
            game.drawApartmentBackdrop(c);game.drawApartmentInterior(c);
        });
        const sprite=new PIXI.Sprite(background);sprite.y=top;this.floor.addChild(sprite);
        this.walls.beginFill(0x222222);
        for(const w of map.walls||[])this.walls.drawRect(w.x,w.y,w.w,w.h);
        this.walls.endFill();
        this.playerSprite=new PIXI.Sprite();this.playerSprite.anchor.set(.5);this.objects.addChild(this.playerSprite);
        this.message('');
    }
    propSignature(p) {return JSON.stringify([p.decorType,p.width,p.height,p.color,p._switchState,p._searched,p.interactionType]);}
    syncProps(game) {
        const live=new Set(game.props||[]);
        for(const [p,r] of this.props)if(!live.has(p)){
            r.sprite.destroy();this.textures.delete(r.texture);r.texture.destroy(true);this.props.delete(p);
        }
        for(const p of live) {
            const signature=this.propSignature(p);let r=this.props.get(p);
            if(p.visible===false&&!r)continue;
            if(!r||r.signature!==signature) {
                const pad=48,w=p.width||p.w||24,h=p.height||p.h||24;
                const texture=this.bake(w+pad*2,h+pad*2,c=>{
                    c.translate(pad-p.x,pad-p.y);
                    const angle=p.angle,mode=PropPass.mode,stamp=PropSprites.stamp;
                    try {p.angle=0;PropPass.mode=0;PropSprites.stamp=()=>false;p.draw(c);}
                    finally {p.angle=angle;PropPass.mode=mode;PropSprites.stamp=stamp;}
                });
                if(r){this.textures.delete(r.texture);r.texture.destroy(true);r.sprite.texture=texture;}
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
                    skinColor:cosmetics.skinColor,stance,pose,poseWhileMoving:!!pose,_crowdBake:true});
            });this.poses.set(key,texture);
        }
        return this.poses.get(key);
    }
    syncLighting(game,view) {
        this.world.filters=this.lightsOn?[this.lighting]:null;
        if(!this.lightsOn)return;
        const w=game.canvas.width,h=game.canvas.height;
        // Half-resolution targets round odd logical dimensions to whole pixels.
        // Compare requested sizes, not the rounded texture frame, to avoid reallocating.
        if(!this.lightTarget||this.lightSize!==w+':'+h){
            if(this.lightTarget)this.lightTarget.destroy(true);
            this.lightTarget=PIXI.RenderTexture.create({width:w,height:h,resolution:.5,scaleMode:PIXI.SCALE_MODES.LINEAR});
            this.lightSize=w+':'+h;
            this.lightBase.clear().beginFill(0xffffff).drawRect(0,0,w,h).endFill();
            this.lighting.uniforms.lightMap=this.lightTarget;
        }
        const ambient=Math.min(.85,Math.max(0,game.getAmbientDarkness())),level=Math.round((1-ambient)*255);
        this.lightBase.tint=(level<<16)|(level<<8)|level;
        this.lightSprites.scale.set(view.zoom);this.lightSprites.position.copyFrom(this.world.position);
        const lamps=(game.lamps||[]).filter(l=>l.visible!==false&&!l._forcedOff)
            .sort((a,b)=>Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y)).slice(0,24);
        for(let i=0;i<24;i++) {
            const s=this.lightSprites.children[i],l=lamps[i];s.visible=!!l;if(!l)continue;
            s.position.set(l.x,l.y);s.width=s.height=2*(l.lightRadius||l.radius||200);
            s.tint=PIXI.utils.string2hex(l.color||'#ffeebb');s.alpha=Math.min(1,Math.max(0,l._lightK??1));
        }
        this.lighting.uniforms.viewport.set([this.lightTarget.width,this.lightTarget.height]);
        this.renderer.render(this.lightStage,{renderTexture:this.lightTarget,clear:true});
    }
    draw(game) {
        if(this.failure||this.lost){this.message(this.failure||'WebGL context lost.');return;}
        if(game.activeMap?.id!=='apt_949'){this.message('This WebGL slice supports the apartment. Use Restart apartment to return.');return;}
        const start=performance.now(),beforeUploads=this.uploads,beforeBakes=this.bakes,beforeDraws=this.drawCalls;
        this.settings={resolutionScale:GameSettings.resolutionScale,baseZoom:GameSettings.baseZoom,fpsLimit:GameSettings.fpsLimit};
        if(this.map!==game.activeMap)this.buildMap(game);
        const w=game.canvas.width,h=game.canvas.height;
        if(this.renderer.screen.width!==w||this.renderer.screen.height!==h)this.renderer.resize(w,h);
        this.world.filterArea.width=w;this.world.filterArea.height=h;
        const zoom=game.camera.zoom*(game.finCam?.z||1);
        const target=game.cutscene?.active?game.camera:game.player;
        const c=game._clampView(target.x+(game.scopeLeanX||0),target.y+(game.scopeLeanY||0),zoom);
        const view=game.view={x:c.x,y:c.y,zoom,shakeX:game.camera.shakeX||0,shakeY:game.camera.shakeY||0};
        game.camera.x=c.x;game.camera.y=c.y;
        this.world.scale.set(zoom);this.world.position.set(w/2-(view.x-view.shakeX)*zoom,h/2-(view.y-view.shakeY)*zoom);
        _worldMatrix=new DOMMatrix([zoom,0,0,zoom,this.world.x,this.world.y]);_worldCanvas=game.canvas;
        this.syncProps(game);
        this.playerSprite.texture=this.pose(game);this.playerSprite.position.set(game.player.x,game.player.y);
        this.playerSprite.rotation=game.player.angle||0;this.playerSprite.visible=game.player.visible!==false;
        this.playerSprite.alpha=(game.player.isHidden||game.flitState.active) ? .5 : 1;
        this.syncLighting(game,view);
        this.effects.clear();
        for(const p of game.projectiles||[]){this.effects.beginFill(0xffdd88);this.effects.drawCircle(p.x,p.y,3);this.effects.endFill();}
        this.renderer.render(this.stage);
        const end=performance.now();
        const f={at:start,intervalMs:this.lastStart?start-this.lastStart:null,gapMs:this.lastEnd?start-this.lastEnd:null,renderMs:end-start,
            uploads:this.uploads-beforeUploads,bakes:this.bakes-beforeBakes,draws:this.drawCalls-beforeDraws};this.lastStart=start;
        this.lastEnd=end;
        if(this.warmFrames>0)this.warmFrames--;
        else {if(!this.frames.length)f.intervalMs=f.gapMs=null;this.frames.push(f);if(this.frames.length>120)this.frames.shift();}
        if(this.panel&&start-(this.lastPanel||0)>1000){this.lastPanel=start;const r=this.report();
            this.panel.textContent=`Native WebGL · ${r.fps.toFixed(1)} FPS · CPU ${r.renderMeanMs.toFixed(1)} ms · uploads ${f.uploads}`;}
    }
    report() {
        const frames=this.frames.slice(),intervals=frames.map(f=>f.intervalMs).filter(v=>v>0),sum=intervals.reduce((a,b)=>a+b,0);
        const sorted=intervals.slice().sort((a,b)=>a-b);
        return {renderer:'native-webgl-apartment',pixiVersion:PIXI.VERSION,device:this.device,map:this.map?.id,
            settings:this.settings,resolution:[this.canvas.width,this.canvas.height],lighting:this.lightsOn,warmFramesRemaining:this.warmFrames,frames,
            fps:sum?intervals.length*1000/sum:0,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]||0,
            stallsOver250Ms:intervals.filter(v=>v>250).length,stallsOver1000Ms:intervals.filter(v=>v>1000).length,
            renderMeanMs:frames.length?frames.reduce((a,f)=>a+f.renderMs,0)/frames.length:0,
            textureBytes:[...this.textures].reduce((a,t)=>a+t.width*t.height*4,0)+128*128*4,
            lightingTargetBytes:this.lightTarget?this.lightTarget.baseTexture.realWidth*this.lightTarget.baseTexture.realHeight*4:0,
            timing:'CPU render submission and frame cadence; GPU execution is not timed',
            limitations:['Apartment slice; static backdrop and decor animations','Eight-phase player animation','Lighting has no occlusion yet','NPCs and advanced effects not migrated']};
    }
}
