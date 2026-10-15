// Remaining gameplay and cinematic passes. World cues, lit cues and screen HUD
// have separate homes, so a scope/radar never becomes part of the wet floor.
function nativeGameContext(game,ctx,paint){const saved=game.ctx;game.ctx=ctx;try{return paint();}finally{game.ctx=saved;}}
function nativeCameraView(game,r){
    const fx=r.layers.cameraEffects,fc=fx?game.finCam:null,zoom=game.camera.zoom*(fc?.z||1);let c;
    if(game.cutscene?.active)c=game._clampView(game.camera.x,game.camera.y,zoom);
    else{
        const dt=Math.min(100,Math.max(0,_frameTime-(game._nativeLeanT||_frameTime)));game._nativeLeanT=_frameTime;
        const car=game.isDriving&&game.car,LA=CONFIG.VEHICLE_DRIVE.CAM_LOOK_AHEAD,k=1-Math.exp(-dt/LA.TAU_MS);
        game.driveLeanX=fx?(game.driveLeanX||0)+((car?(car.vx||0)*LA.PER_SPEED:0)-(game.driveLeanX||0))*k:0;
        game.driveLeanY=fx?(game.driveLeanY||0)+((car?(car.vy||0)*LA.PER_SPEED:0)-(game.driveLeanY||0))*k:0;
        const city=r.layers.liveBackdrop&&r.layers.backdrop?game._cityView:null,look=city&&!car?city.lookoutLean(game.player,zoom):0;
        game.lookLeanY=city?(game.lookLeanY||0)+(look-(game.lookLeanY||0))*(1-Math.exp(-dt/450)):0;
        const p=car||game.player;c=game._clampView(p.x+(game.scopeLeanX||0)+game.driveLeanX,p.y+(game.scopeLeanY||0)+game.driveLeanY+game.lookLeanY,zoom);
    }
    game.camera.x=c.x;game.camera.y=c.y;
    const cine=fx?game.cineCam:null;
    if(cine||fc)c=game._clampView(c.x+(cine?.dx||0)+(fc?.dx||0),c.y+(cine?.dy||0)+(fc?.dy||0),zoom);
    return {...c,zoom,shakeX:game.camera.shakeX||0,shakeY:game.camera.shakeY||0};
}
class NativeScopeVeil extends PIXI.Mesh{
    constructor(){super(nativeSurfaceGeometry(),PIXI.Shader.from(NATIVE_SURFACE_VERTEX,`
        precision highp float;varying vec2 uv;uniform vec2 viewport;uniform vec4 lane;uniform vec3 state;
        void main(){vec2 d=uv*viewport-lane.xy;vec2 q=vec2(d.x*state.x+d.y*state.y,-d.x*state.y+d.y*state.x);
            float u=q.x/max(1.,lane.z),v=q.y/max(1.,lane.w)*2.;float along=u<.06?u/.06:u>.72?(1.-u)/.28:1.;
            float cut=step(0.,u)*step(u,1.)*max(0.,1.-v*v)*clamp(along,0.,1.);
            float a=.55*state.z*(1.-cut);gl_FragColor=vec4(vec3(10.,6.,20.)/255.*a,a);
        }`,{viewport:new Float32Array(2),lane:new Float32Array(4),state:new Float32Array(3)}));}
}
class NativeOpticsFilter extends PIXI.Filter{
    constructor(){super(undefined,`
        precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;uniform vec4 inputSize;uniform vec4 outputFrame;
        uniform vec2 viewport;uniform vec4 rings[8];uniform vec4 ringStyle[8];uniform float ringCount;uniform float clock;
        uniform vec4 glass[24];uniform float glassCount;uniform float wet;
        void main(){vec2 p=outputFrame.xy+vTextureCoord*inputSize.xy,offset=vec2(0.);vec3 tint=vec3(0.);float tintA=0.;
            for(int i=0;i<8;i++){if(float(i)>=ringCount)break;vec4 r=rings[i],s=ringStyle[i];vec2 d=p-r.xy;float dist=length(d);
                if(abs(dist-r.z)>r.w*2.)continue;float angle=atan(d.y,d.x);
                float jag=r.w*.7*(.42*sin(angle*3.+s.z+clock*5.)+.26*sin(angle*7.-s.z*1.7-clock*8.)+.16*sin(angle*17.+s.z*.6+clock*13.));
                float band=1.-smoothstep(r.w*.4,r.w*.6,abs(dist-r.z-jag));float k=s.x;
                float scale=1.+(.051+6.75/max(40.,r.z))*k;
                if(s.w>.5)offset+=((d/scale-d)-vec2(1.8*k,0.))*band*min(1.,.90*k);
                float a=(s.y>.5?.09:.04)*k*band;tint+=mix(vec3(.937,.894,1.),vec3(1.,.604,.384),s.y)*a;tintA+=a;
            }
            for(int i=0;i<24;i++){if(float(i)>=glassCount)break;vec4 g=glass[i];vec2 q=p-g.xy;
                if(q.x<0.||q.y<0.||q.x>g.z||q.y>g.w)continue;
                float edge=clamp(min(min(q.x,g.z-q.x),min(q.y,g.w-q.y)),0.,1.);
                offset+=vec2(sin(q.y*.6+clock*.4),cos(q.x*.4-clock*.3))*(.25+wet*.85)*edge;
            }
            vec2 at=clamp(vTextureCoord+offset*inputSize.zw,vec2(0.),viewport*inputSize.zw);
            vec4 c=texture2D(uSampler,at);gl_FragColor=vec4(c.rgb*(1.-min(.35,tintA))+tint*c.a,c.a);
        }`,{viewport:new Float32Array(2),rings:new Float32Array(32),ringStyle:new Float32Array(32),ringCount:0,clock:0,glass:new Float32Array(96),glassCount:0,wet:0});this.padding=0;}
}
class NativePresentation{
    constructor(owner){
        this.owner=owner;this.texts=new Map();this.textBytes=0;
        if(!owner.scene){owner.scene=new PIXI.Container();owner.stage.addChildAt(owner.scene,0);owner.scene.addChild(owner.world,owner.postWorld);}
        owner.scene.addChild(owner.rainContext.root);
        this.ground=new NativeVectorContext(owner);this.abilities=new NativeVectorContext(owner);this.lit=new NativeVectorContext(owner);this.bubbles=new NativeVectorContext(owner);this.screen=new NativeVectorContext(owner);
        [this.ground,this.abilities,this.lit,this.bubbles,this.screen].forEach((c,i)=>c.label=['ground-cues','ability-art','lit-cues','speech','screen-hud'][i]);
        owner.world.addChildAt(this.ground.root,owner.world.getChildIndex(owner.objects));owner.world.addChildAt(this.abilities.root,owner.world.getChildIndex(owner.roofStage));
        owner.postWorld.addChildAt(this.lit.root,owner.postWorld.getChildIndex(owner.marker));owner.postWorld.addChildAt(this.bubbles.root,owner.postWorld.getChildIndex(owner.marker));
        this.scope=new NativeScopeVeil();this.scopeCue=new NativeVectorContext(owner);this.scopeCue.label='scope-cue';owner.scene.addChildAt(this.scope,2);owner.scene.addChildAt(this.scopeCue.root,3);
        this.bokeh=new PIXI.Container();owner.stage.addChildAt(this.bokeh,owner.stage.getChildIndex(owner.worldCueContext.root));owner.stage.addChild(this.screen.root);
        this.bokehNodes=[];this.optics=new NativeOpticsFilter();
    }
    get contexts(){return [this.ground,this.abilities,this.lit,this.bubbles,this.screen,this.scopeCue];}
    text(ctx,value,x,y){
        const text=String(value),ink=ctx.color(ctx.fillStyle),key=[this.owner.fontRevision||0,text,ctx.font,ink.color].join('|');let rec=this.texts.get(key);
        if(!rec){const size=Number(/([0-9.]+)px/.exec(ctx.font)?.[1]||12),pad=8,probe=document.createElement('canvas').getContext('2d');probe.font=ctx.font;const W=Math.min(1024,Math.ceil(probe.measureText(text).width+pad*2)),H=Math.ceil(size*2+pad*2),density=this.owner.bakeDensity(W,H,'authored-label'),bytes=Math.ceil(W*density)*Math.ceil(H*density)*4;
            while(this.texts.size>=64||this.textBytes+bytes>4*1048576){const old=[...this.texts].find(([,v])=>v.used!==this.owner.frameId&&!v.contexts.size)?.[0];if(old===undefined)return false;const r=this.texts.get(old);this.texts.delete(old);this.textBytes-=r.bytes;this.owner.textures.delete(r.texture);r.texture.destroy(true);}
            const texture=this.owner.bake(W,H,c=>{c.font=ctx.font;c.textBaseline='middle';c.fillStyle='#'+ink.color.toString(16).padStart(6,'0');c.fillText(text,pad,H/2);},'authored-label');rec={texture,bytes,W,H,pad,contexts:new Set()};this.texts.set(key,rec);this.textBytes+=bytes;
        }
        rec.used=this.owner.frameId;rec.contexts.add(ctx);ctx.textRecords??=new Set();ctx.textRecords.add(rec);
        const dx=ctx.textAlign==='center'?-rec.W/2:ctx.textAlign==='right'||ctx.textAlign==='end'?-rec.W: -rec.pad;
        const dy=ctx.textBaseline==='middle'?-rec.H/2:ctx.textBaseline==='top'?-rec.pad:-rec.H*.7;
        ctx.current=null;const n=ctx.node(PIXI.Sprite);n.texture=rec.texture;n.alpha=ctx.globalAlpha*ink.alpha;n.blendMode=ctx.globalCompositeOperation==='lighter'?PIXI.BLEND_MODES.ADD:PIXI.BLEND_MODES.NORMAL;n.transform.setFromMatrix(ctx.matrix.clone().append(new PIXI.Matrix(1,0,0,1,x+dx,y+dy)));ctx.hashValue(key);ctx.hashValue(ink.alpha);for(const v of [x,y,ctx.globalAlpha,ctx.matrix.a,ctx.matrix.b,ctx.matrix.c,ctx.matrix.d,ctx.matrix.tx,ctx.matrix.ty])ctx.hashValue(v);
    }
    syncScope(game,view){
        const r=this.owner,k=r.layers.scopeView?game.scopeK||0:0,c=this.scopeCue;c.begin();c.canvas=game.canvas;c.setTransform(view.zoom,0,0,view.zoom,r.world.x,r.world.y);this.scope.visible=k>0;if(k<=0)return;
        const p=game.player,t=_gameTimeSec,steady=Math.min(1,(game._scopeHeld||0)/SCOPE.STEADY),shot=p._muzzleLocal&&p._muzzleReady?aimFromMuzzle(p,p.angle):{x:p.x+Math.cos(p.angle)*6,y:p.y+Math.sin(p.angle)*6,angle:p.angle};
        const a=shot.angle+(Math.sin(t*1.7)*.7+Math.sin(t*3.1)*.3)*SCOPE.SWAY*(1-steady);
        const far=raycastNearest(shot.x,shot.y,shot.x+Math.cos(a)*SCOPE.RANGE,shot.y+Math.sin(a)*SCOPE.RANGE,[...(game.activeMap.walls||[]),...getColliders(game.activeMap)],SCOPE.RANGE);
        this.scope.scale.set(game.canvas.width,game.canvas.height);const u=this.scope.shader.uniforms;u.viewport.set([game.canvas.width,game.canvas.height]);u.lane.set([shot.x*view.zoom+r.world.x,shot.y*view.zoom+r.world.y,(far+40)*view.zoom,SCOPE.WIDTH*view.zoom]);u.state.set([Math.cos(a),Math.sin(a),k]);
        c.save();c.translate(shot.x,shot.y);c.rotate(a);c.globalAlpha=.1*k;c.globalCompositeOperation='lighter';c.drawImage(game._scopeLaneSprite(),0,-SCOPE.WIDTH/2,far+40,SCOPE.WIDTH);c.globalCompositeOperation='source-over';c.globalAlpha=(.35+.35*steady)*k;c.strokeStyle=steady>=1?'#ffd9a0':'#ff6a7a';c.lineWidth=.8;c.beginPath();c.moveTo(4,0);c.lineTo(far,0);c.stroke();c.restore();game._drawFocusArc(c,k);this.stats.scope={active:true,far,steady};
    }
    syncBokeh(game){
        const r=this.owner,L=r.layers;for(const n of this.bokehNodes)n.visible=false;if(!game.bokeh)return;
        game.bokeh.update(game.deltaTime||16);if(!L.bokeh)return;
        if(!this.bokehTexture){this.bokehTexture=PIXI.RenderTexture.create({width:128,height:128});const c=new NativeVectorContext(r);c.fillStyle=c.createRadialGradient(64,64,0,64,64,64);for(const [p,a]of [[0,.8],[.5,.4],[1,0]])c.fillStyle.addColorStop(p,'rgba(255,255,255,'+a+')');c.fillRect(0,0,128,128);r.renderer.render(c.root,{renderTexture:this.bokehTexture,clear:true});c.destroy();}
        let i=0;for(const c of game.bokeh.circles){const fade=Math.min(1,c.age/2000)*Math.min(1,(c.life-c.age)/2000),pulse=.7+.3*Math.sin(_frameTime*c.pulseSpeed+c.pulseOffset),alpha=c.alpha*fade*pulse;if(alpha<.005)continue;
            let n=this.bokehNodes[i++];if(!n){n=new PIXI.Sprite(this.bokehTexture);n.anchor.set(.5);n.blendMode=PIXI.BLEND_MODES.SCREEN;this.bokeh.addChild(n);this.bokehNodes.push(n);}n.visible=true;n.tint=new PIXI.Color(c.colorBase+'1)').toNumber();n.alpha=alpha;n.position.set(c.nx*game.canvas.width,c.ny*game.canvas.height);n.width=n.height=c.radius*(.9+pulse*.1)*2;
        }this.stats.bokeh=i;
    }
    syncOptics(game,view){
        const r=this.owner,L=r.layers,u=this.optics.uniforms;u.ringCount=0;u.glassCount=0;u.clock=L.decorAnimation?_gameTimeSec:0;u.viewport.set([game.canvas.width,game.canvas.height]);u.wet=game.weather.wetness||0;
        if(L.mirage&&(GameSettings.soundRings||'mirage')==='mirage'){
            const rings=(game.noiseRipples||[]).slice().reverse().filter(x=>game._ringT(x)<1);rings.sort((a,b)=>(a.enemy?1e7+Math.hypot(a.x-game.player.x,a.y-game.player.y):0)-(b.enemy?1e7+Math.hypot(b.x-game.player.x,b.y-game.player.y):0));
            for(const ring of rings.slice(0,8)){const t=game._ringT(ring),e=1-Math.pow(1-t,2),rad=(12+(ring.reach-12)*e)*view.zoom,th=Math.max(4,11*view.zoom)*(1-.82*e)*1.015*2,i=u.ringCount++;
                u.rings.set([ring.x*view.zoom+r.world.x,ring.y*view.zoom+r.world.y,rad,th],i*4);u.ringStyle.set([(1-t)*(1-t)*(1+(ring.boost||0)),ring.enemy?1:0,ring.seed??ring.x*.013+ring.y*.017,i<4&&t<.6?1:0],i*4);
            }this.stats.ringsDropped=Math.max(0,rings.length-8);
        }
        const glass=(x,y,w,h)=>{if(u.glassCount>=24)return;const sx=x*view.zoom+r.world.x,sy=y*view.zoom+r.world.y;if(sx+w*view.zoom<0||sx>game.canvas.width||sy+h*view.zoom<0||sy>game.canvas.height)return;u.glass.set([sx,sy,w*view.zoom,h*view.zoom],u.glassCount++*4);};
        if(L.glassRefraction){if(L.windows)for(const w of game.roomSystem.windows||[])if(!w.shattered&&!(game.activeMap.id==='apt_949'&&w.y===0))glass(w.x,w.y,w.w,w.h);
            if(L.doors)for(const d of game.roomSystem.doors||[])if(d.type==='sliding')for(const [ax,ay,bx,by]of d.leaves())d.orientation==='H'?glass(Math.min(ax,bx),d.y,Math.abs(bx-ax),d.h):glass(d.x,Math.min(ay,by),d.w,Math.abs(by-ay));}
        if(typeof GameSettings!=='undefined'&&L.bloom!==!!GameSettings.bloom)r.setLayers({bloom:!!GameSettings.bloom});   // follow Settings → Bloom
        const filters=[];if(u.ringCount||u.glassCount)filters.push(this.optics);if(L.bloom&&game.getAmbientDarkness()>.2)filters.push(r.sceneBloom);if(L.atmosphere)filters.push(r.atmosphereFilter);r.scene.filters=filters.length?filters:null;r.scene.filterArea=new PIXI.Rectangle(0,0,game.canvas.width,game.canvas.height);r.stage.filters=null;
        this.stats.rings=u.ringCount;this.stats.glass=u.glassCount;
    }
    sync(game,view){
        const start=performance.now(),r=this.owner,L=r.layers;this.stats={scope:{active:false},bokeh:0,speech:0,radar:false};for(const c of this.contexts){c.begin();c.canvas=game.canvas;}
        for(const c of [this.ground,this.abilities,this.lit,this.bubbles])c.sceneFrame=_worldMatrix;
        const bounds=game._cullBounds.entities;
        if(L.noiseRings)game.drawNoiseRipples(this.ground);if(L.executionCues)game.drawExecuteCue(this.ground);
        if(L.enemyEffects){game.drawHunterDashes(this.ground);game.drawGunnerHeat(this.lit,bounds);game.drawHunterEyes(this.lit);}
        if(L.flitEffects)game.drawFlitVFX(this.abilities);if(L.ghosts)game.drawGraveyardGhosts(this.abilities);
        if(L.fireGlow)game.drawFireLightGlow(this.lit);if(L.mapEdges)game.drawMapEdge(this.lit);
        if(L.playerEmotes)nativeGameContext(game,this.bubbles,()=>game.drawPlayerEmote());
        if(L.speech){const list=[...(game.npcs||[]),...(game.teammates||[]),...(game.pedestrians?.pedestrians||[])].filter(n=>n.quipText&&!n.dead);
            if(list.length){const buildings=game._prepareRenderBuildingLists(game._cullBounds);for(const n of list){if(n.x<bounds.left||n.x>bounds.right||n.y<bounds.top||n.y>bounds.bottom||game._speakerHidden(n.x,n.y,buildings,L.buildings,L.streetDetails))continue;if(this.stats.speech>=32)break;n.drawQuipBubble?.(this.bubbles);this.stats.speech++;}}
        }
        this.syncScope(game,view);this.syncBokeh(game);this.syncOptics(game,view);
        if(L.radar&&game.augments?.isEquipped('radar_ext')&&!game.paused){nativeGameContext(game,this.screen,()=>nativeRadar.call(game));this.stats.radar=true;}
        if(L.debugOverlay&&game.debugMode)nativeGameContext(game,this.lit,()=>{if(game.dbg('lights'))game.drawDebugLighting(this.lit);game.drawDebugLayers(this.lit);if(game.dbg('nav')||game.navDebug)game.drawNavDebug(this.lit);});
        if(L.missionHud){if(this.hudOn!==true){game._objKey=null;if(game._rideState)game._rideState.on=null;}game._objectiveHud();game._rideHud();}else if(this.hudOn!==false){document.getElementById('ui-objective')?.classList.remove('show');document.getElementById('ui-ride')?.classList.remove('show');document.body.classList.remove('objective-hud');}this.hudOn=L.missionHud;
        for(const c of this.contexts)r.trimBuildingImages(c);
        this.stats.paths=this.contexts.reduce((n,c)=>n+c.pathsPainted,0);this.stats.textBytes=this.textBytes;this.stats.cpuMs=performance.now()-start;r.presentationStats=this.stats;r.layerStages.presentationMs=this.stats.cpuMs;
    }
    invalidate(){for(const c of this.contexts)for(const g of c.gradients)g.key=null;this.bokehTexture?.destroy(true);this.bokehTexture=null;for(const n of this.bokehNodes)n.texture=PIXI.Texture.EMPTY;this.bokehNodes.forEach(n=>n.destroy());this.bokehNodes=[];}
    clear(){for(const c of this.contexts)c.destroy();this.scope.destroy();this.optics.destroy();for(const n of this.bokehNodes)n.destroy();this.bokehTexture?.destroy(true);this.bokeh.destroy();for(const rec of this.texts.values()){this.owner.textures.delete(rec.texture);rec.texture.destroy(true);}this.texts.clear();}
}

// Original radar painter; conic-gradient fallback becomes native wedges.
function nativeRadar(){
    if (this.augments && this.augments.isEquipped('radar_ext') && !this.paused) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        const RADAR_RADIUS = 60;
        const RADAR_RANGE = 600;  // world-px detection radius
        // Landscape: top-left under the bars, clear of the fire cluster
        const cx = this.isLandscape ? RADAR_RADIUS + 16 : this.canvas.width - RADAR_RADIUS - 16;
        const cy = this.isLandscape ? RADAR_RADIUS + 150 : this.canvas.height - RADAR_RADIUS - 60;
        const playerX = this.isDriving && this.car ? this.car.x : this.player.x;
        const playerY = this.isDriving && this.car ? this.car.y : this.player.y;
        const scale = RADAR_RADIUS / RADAR_RANGE;

        // Background disc
        this.ctx.globalAlpha = 0.35;
        this.ctx.fillStyle = '#0a0a18';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
        this.ctx.fill();

        // Concentric rings
        this.ctx.globalAlpha = 0.2;
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 0.5;
        for (let r = 1; r <= 3; r++) {
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, RADAR_RADIUS * r / 3, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // Sweep line
        this.ctx.globalAlpha = 0.25;
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 1;
        const sweepAngle = (_frameTime / 1200) % (Math.PI * 2);
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(cx + Math.cos(sweepAngle) * RADAR_RADIUS, cy + Math.sin(sweepAngle) * RADAR_RADIUS);
        this.ctx.stroke();

        // Sweep trail (fading arc behind sweep line)
        this.ctx.globalAlpha = 1.0;
        if (this.ctx.createConicGradient) {
            const sweepGrad = this.ctx.createConicGradient(sweepAngle - 0.8, cx, cy);
            sweepGrad.addColorStop(0, 'rgba(0, 243, 255, 0)');
            sweepGrad.addColorStop(0.12, 'rgba(0, 243, 255, 0.08)');
            sweepGrad.addColorStop(0.13, 'rgba(0, 243, 255, 0)');
            this.ctx.fillStyle = sweepGrad;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
            this.ctx.fill();
        } else {                                                      // no conic gradients (Safari < 16.4): a fan of thin wedges
            for (let k = 0; k < 6; k++) {
                this.ctx.fillStyle = `rgba(0, 243, 255, ${(0.08 * (k + 1) / 6).toFixed(3)})`;
                const a0 = sweepAngle - 0.8 + k * 0.13;
                this.ctx.beginPath(); this.ctx.moveTo(cx, cy); this.ctx.arc(cx, cy, RADAR_RADIUS, a0, a0 + 0.13); this.ctx.closePath(); this.ctx.fill();
            }
        }

        // Enemy blips (crimson)
        this.ctx.globalAlpha = 0.9;
        for (const e of this.enemies) {
            if (e.dead || !e.active) continue;
            const dx = (e.x - playerX) * scale;
            const dy = (e.y - playerY) * scale;
            if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
            this.ctx.fillStyle = '#ff2244';
            this.ctx.shadowColor = '#ff2244';
            this.ctx.shadowBlur = 4;
            this.ctx.beginPath();
            this.ctx.arc(cx + dx, cy + dy, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Friendly NPC blips (teal) — teammates
        for (const n of this.npcs) {
            if (!n.active || n.dead || n.alliance === 'hostile') continue;
            if (!n.isRecruited) continue;
            const dx = (n.x - playerX) * scale;
            const dy = (n.y - playerY) * scale;
            if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
            this.ctx.fillStyle = '#00f3ff';
            this.ctx.shadowColor = '#00f3ff';
            this.ctx.shadowBlur = 3;
            this.ctx.beginPath();
            this.ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.shadowBlur = 0;

        // Player dot (gold center)
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = '#ffd700';
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 5;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Border ring
        this.ctx.globalAlpha = 0.5;
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
        this.ctx.stroke();

        // Label
        this.ctx.globalAlpha = 0.4;
        this.ctx.fillStyle = '#00f3ff';
        this.ctx.font = 'bold 7px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('ECHO PULSE', cx, cy - RADAR_RADIUS - 4);

        this.ctx.restore();
    }

}
