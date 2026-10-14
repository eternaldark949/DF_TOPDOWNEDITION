// Apartment detail migration. Static art stays in resident textures; authored
// live segments retain their original order and continuous clock on the GPU.
const NATIVE_LIVE_DECOR=new Set(['apt_craft','apt_fireplace','apt_tub','apt_console','apt_plant','apt_telescope']);
Object.assign(NativeWebGLRenderer.prototype,{
    resetSample(){this.capture=this.completedCapture=null;this.configurationId++;this.frames=[];this.warmFrames=15;this.lastStart=this.lastEnd=this.lastPanel=0;},
    setTextureQuality(value){
        if(!['standard','auto','high'].includes(value)||value===this.textureQuality)return;
        this.textureQuality=value;NativeWebGLStorage.setItem('textureQuality',value);
        this.map=null;this.qualityRebuildPending=true;this.resetSample();if(this.onQualityChanged)this.onQualityChanged();
    },
    bakeDensity(w,h,kind){
        let density=this.textureQuality==='high'?2:this.textureQuality==='auto'&&['prop','fixture'].includes(kind)?2:1;
        if(kind==='light')density=1;
        density=Math.min(density,this.maxTextureSize/Math.max(w,h));
        const used=[...this.textures].reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0),estimate=Math.ceil(w*density)*Math.ceil(h*density)*4;
        if(density>1&&used+estimate>128*1048576){density=1;this.qualityReductions++;}
        return density;
    },
    releaseProp(record){
        record.sprite.destroy();if(record.liveContext)record.liveContext.destroy();
        for(const t of new Set([record.texture,...(record.runs||[])])){this.textures.delete(t);t.destroy(true);}
    },
    propCanvas(p,time,run=null){
        const pad=48,w=p.width||p.w||24,h=p.height||p.h||24;
        return this.bake(w+pad*2,h+pad*2,c=>{
            c.translate(pad-p.x,pad-p.y);const angle=p.angle,clock=_frameTime,pass={...PropPass},stamp=PropSprites.stamp;
            try{p.angle=0;_frameTime=time;PropSprites.stamp=()=>false;
                if(run===null){PropPass.mode=1;PropPass.seg=()=>true;}else PropPass._begin(1,run);
                p.draw(c);this.propPlan={live:PropPass.live,runs:PropPass.idx+1};
            }finally{p.angle=angle;_frameTime=clock;Object.assign(PropPass,pass);PropSprites.stamp=stamp;}
        },'prop');
    },
    syncProps(game){
        const live=new Set(game.props||[]);
        for(const [p,r]of this.props)if(!live.has(p)){this.releaseProp(r);this.props.delete(p);}
        for(const p of live){
            if(game.activeMap.id==='hub_949'&&game.view){const v=game.view,pad=180;
                const out=Math.abs(p.x-v.x)>game.canvas.width/(2*v.zoom)+(p.width||24)+pad||Math.abs(p.y-v.y)>game.canvas.height/(2*v.zoom)+(p.height||24)+pad;
                if(out){const old=this.props.get(p);if(old){this.releaseProp(old);this.props.delete(p);}continue;}}
            const signature=this.propSignature(p);let r=this.props.get(p);if(p.visible===false&&!r)continue;
            if(!r||r.signature!==signature){
                const texture=this.propCanvas(p,0);if(r)this.releaseProp(r);
                r={texture,signature,sprite:new PIXI.Sprite(texture)};r.sprite.anchor.set(.5);this.objects.addChild(r.sprite);
                if(NATIVE_LIVE_DECOR.has(p.decorType)){
                    const first=this.propCanvas(p,0,0),plan={...this.propPlan};
                    if(plan.live){r.runs=[first];for(let i=1;i<plan.runs;i++)r.runs.push(this.propCanvas(p,0,i));}
                    else {this.textures.delete(first);first.destroy(true);r.runs=[];}
                    r.liveContext=new NativeVectorContext(this);this.objects.addChild(r.liveContext.root);
                }
                this.props.set(p,r);
            }
            const x=p.x+(p.width||p.w||24)/2,y=p.y+(p.height||p.h||24)/2;
            r.sprite.position.set(x,y);r.sprite.rotation=p.angle||0;r.sprite.visible=this.layers.furniture&&p.visible!==false;
            if(r.liveContext){r.liveContext.root.position.set(x,y);r.liveContext.root.rotation=p.angle||0;}
        }
        this.objects.setChildIndex(this.playerSprite,this.objects.children.length-1);
    },
    syncDecor(game,view){
        const start=performance.now();let count=0,paths=0;
        for(const [p,r]of this.props){
            r.sprite.visible=this.layers.furniture&&p.visible!==false;
            if(!r.liveContext)continue;
            const ctx=r.liveContext,c=p.getCenter(),pad=48,visible=r.sprite.visible&&this.layers.decorAnimation;
            ctx.root.visible=visible;r.sprite.visible&&=!visible;if(!visible)continue;
            // Cull the whole prop, retaining its padded painting extent.
            if(Math.abs(c.x-view.x)>game.canvas.width/(2*view.zoom)+p.width/2+pad||Math.abs(c.y-view.y)>game.canvas.height/(2*view.zoom)+p.height/2+pad){ctx.root.visible=false;continue;}
            ctx.begin();ctx.translate(-c.x,-c.y);
            const angle=p.angle,pass={...PropPass},stamp=PropSprites.stamp;
            try{p.angle=0;PropSprites.stamp=()=>false;PropPass.mode=1;let index=-1,still=false;
                PropPass.seg=live=>{
                    if(live){still=false;return true;}
                    if(!still){still=true;index++;const texture=r.runs[index];if(texture){ctx.current=null;const s=ctx.node(PIXI.Sprite);s.texture=texture;s.alpha=1;s.blendMode=PIXI.BLEND_MODES.NORMAL;
                        s.transform.setFromMatrix(new PIXI.Matrix(1,0,0,1,-texture.width/2,-texture.height/2));ctx.current=null;}}
                    return false;
                };
                p.draw(ctx);
            }finally{p.angle=angle;Object.assign(PropPass,pass);PropSprites.stamp=stamp;}
            count++;paths+=ctx.pathsPainted;
        }
        this.detailStats={decor:{visible:count,paths,cpuMs:performance.now()-start}};
    }
});

Object.assign(NativeWebGLRenderer.prototype,{
    initDetails(){
        if(!PIXI.BitmapFont.available.NativeDetailFont){
            const font=PIXI.BitmapFont.from('NativeDetailFont',{fontFamily:'Orbitron, sans-serif',fontSize:32,fontWeight:'bold',fill:'#ffffff',stroke:'#000000',strokeThickness:5},
                {chars:[[' ','~'],'◈'],resolution:2,padding:2});
            for(const texture of Object.values(font.pageTextures))this.renderer.texture.bind(texture);
        }
        this.groundDetailContext=new NativeVectorContext(this);this.world.addChildAt(this.groundDetailContext.root,this.world.getChildIndex(this.contacts)+1);
        this.projectileContext=new NativeVectorContext(this);this.world.addChild(this.projectileContext.root);
        this.postEffectContext=new NativeVectorContext(this);this.postWorld.addChildAt(this.postEffectContext.root,this.postWorld.getChildIndex(this.marker));
        this.cueContext=new NativeVectorContext(this);this.postWorld.addChild(this.cueContext.root);
        this.fxGlowFilter=new NativeFxGlowFilter();
        this.transientOwners=Array.from({length:10},()=>({nativeTransient:true}));
    },
    clearDetails(){
        for(const key of ['groundDetailContext','projectileContext','postEffectContext','cueContext']){this[key].destroy();this[key]=new NativeVectorContext(this);}
        this.world.addChildAt(this.groundDetailContext.root,this.world.getChildIndex(this.contacts)+1);this.world.addChild(this.projectileContext.root);
        this.postWorld.addChildAt(this.postEffectContext.root,this.postWorld.getChildIndex(this.marker));this.postWorld.addChild(this.cueContext.root);
        this.transientSources=[];
    },
    syncDetails(game,view){
        const start=performance.now(),L=this.layers,w=game.canvas.width/view.zoom/2,h=game.canvas.height/view.zoom/2;
        const bounds={left:view.x-w-80,right:view.x+w+80,top:view.y-h-80,bottom:view.y+h+80};
        const ground=this.groundDetailContext;ground.begin();
        if(L.decals)game.decals?.draw(ground,bounds);if(L.casings)game.drawCasings(ground,bounds);
        const ctx=this.projectileContext;ctx.begin();const live=(game.projectiles||[]).filter(p=>p.visible!==false&&p.active!==false);
        const inView=p=>Math.abs(p.x-view.x)<w+(p.isSniper?320:100)&&Math.abs(p.y-view.y)<h+(p.isSniper?320:100);
        if(L.projectiles)for(const p of live)if(!p.isFireball&&inView(p))p.draw(ctx);
        if(L.weaponFx){game.drawMuzzleStars(ctx);game.drawShotFx(ctx,bounds);game.drawSlashes(ctx);
            const laser=(game.scopeK||0)<.5?game.getLaserSight():null;
            if(laser){ctx.save();ctx.strokeStyle='rgba(255,20,0,.35)';ctx.lineWidth=1.5;
                // Native dashes are explicit segments, retaining the exact muzzle
                // and wall-hit endpoints rather than a screen-space approximation.
                const dx=laser.x1-laser.x0,dy=laser.y1-laser.y0,length=Math.hypot(dx,dy);
                ctx.beginPath();for(let d=0;d<length;d+=10){const end=Math.min(length,d+6);ctx.moveTo(laser.x0+dx*d/length,laser.y0+dy*d/length);ctx.lineTo(laser.x0+dx*end/length,laser.y0+dy*end/length);}ctx.stroke();
                ctx.fillStyle='rgba(255,0,0,'+(.6+.35*Math.sin(_frameTime/200))+')';ctx.beginPath();ctx.arc(laser.x1,laser.y1,2.5,0,Math.PI*2);ctx.fill();ctx.restore();}
        }
        if(L.impactParticles)game.weather.draw(ctx,bounds,view.zoom);
        ctx.root.visible=ctx.pool.some(n=>n.visible&&n.parent===ctx.root);
        ctx.root.filters=L.fxGlow&&ctx.root.visible?[this.fxGlowFilter]:null;ctx.root.filterArea=this.world.filterArea;
        const post=this.postEffectContext;post.begin();
        if(L.projectiles){for(const p of live)if(p.isFireball&&inView(p))p.draw(post);game.drawFireTrail(post,bounds);}
        const cues=this.cueContext;cues.begin();if(L.overlays){game.drawCombatOverlays(cues,bounds);game.drawStatusMarks(cues,bounds);}
        this.transientSources=[];
        if(L.transientLights){
            const visible=o=>Math.abs(o.x-view.x)<w+180&&Math.abs(o.y-view.y)<h+180;
            const flashes=(game.muzzleFlashes||[]).filter(visible).slice(0,4),shots=live.filter(p=>!p.isFireball&&visible(p)).slice(0,4),fire=live.filter(p=>p.isFireball&&visible(p)).slice(0,2);
            flashes.forEach((f,i)=>this.transientSources.push({owner:this.transientOwners[i],x:f.x,y:f.y,radius:(f.radius||50)*1.6,color:f.color||'#ffcc88',wash:.45,alpha:Math.min(1,(f.life||0)/3),elevation:12}));
            shots.forEach((p,i)=>this.transientSources.push({owner:this.transientOwners[4+i],x:p.x,y:p.y,radius:50,color:p.color||'#ffd9a0',wash:.3,alpha:1,elevation:12}));
            fire.forEach((p,i)=>this.transientSources.push({owner:this.transientOwners[8+i],x:p.x,y:p.y,radius:180,color:'#ff7014',wash:.35,alpha:.85,elevation:36}));
        }
        this.detailStats.effects={projectiles:live.length,muzzleFlashes:game.muzzleFlashes?.length||0,particles:game.weather.particles.length,
            casings:game.casings?.length||0,paths:ctx.pathsPainted+post.pathsPainted+ground.pathsPainted,transientSources:this.transientSources.length,cpuMs:performance.now()-start};
        this.layerStages.effectsMs=this.detailStats.effects.cpuMs;this.layerStages.decorMs=this.detailStats.decor.cpuMs;
    }
});

class NativeFxGlowFilter extends PIXI.Filter{
    constructor(){
        super(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;uniform sampler2D glow;
            void main(){vec4 c=texture2D(uSampler,vTextureCoord),g=texture2D(glow,vTextureCoord)*.5;
                gl_FragColor=vec4(c.rgb+g.rgb*(1.0-c.a),c.a+g.a*(1.0-c.a));}`,{glow:PIXI.Texture.EMPTY});
        this.blur=new PIXI.BlurFilter(4,1,.5);this.padding=16;
    }
    apply(manager,input,output,clear){const target=manager.getFilterTexture(input,.5);
        try{this.blur.apply(manager,input,target,PIXI.CLEAR_MODES.CLEAR);this.uniforms.glow=target;manager.applyFilter(this,input,output,clear);}
        finally{manager.returnFilterTexture(target);}
    }
}
