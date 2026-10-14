// View-bounded GPU snapshots for static emissives, with authored moving features
// outside the snapshot. No Canvas scene captures or GPU readbacks.
class NativeBuildingGlowMesh extends PIXI.Mesh {
    constructor(){
        const g=new PIXI.Geometry().addAttribute('aVertexPosition',new Float32Array([0,0,1,0,1,1,0,1]),2)
            .addAttribute('aUV',new Float32Array([0,0,1,0,1,1,0,1]),2).addIndex([0,1,2,0,2,3]);
        super(g,PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;attribute vec2 aUV;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec2 uv;
            void main(){uv=aUV;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.)).xy,0.,1.);}`,
            `precision highp float;varying vec2 uv;uniform sampler2D image;uniform float clock;uniform float animate;
            void main(){vec4 c=texture2D(image,uv);float pulse=1.-animate*.03*(.5+.5*sin(clock*2.7+uv.x*31.));gl_FragColor=c*pulse;}`,
            {image:PIXI.Texture.EMPTY,clock:0,animate:1}));
    }
}
Object.assign(NativeWebGLRenderer.prototype,{
    trimBuildingImages(ctx){
        const used=new Set([...(ctx.patternTextures||[]),...ctx.pool.filter(n=>n.visible&&n instanceof PIXI.Sprite).map(n=>n.texture.baseTexture)]);
        for(const [image,t]of ctx.images)if(!used.has(t.baseTexture)){ctx.images.delete(image);this.releaseImage(t);}
    },
    buildingRecordBytes(r){
        const textures=new Set();for(const c of [r.base,r.top,r.glowContext,r.glowLive])if(c){for(const t of c.images.values())textures.add(t.baseTexture);for(const g of c.gradients)textures.add(g.texture.baseTexture);}
        if(r.glowTarget)textures.add(r.glowTarget.baseTexture);
        return [...textures].reduce((n,t)=>n+t.realWidth*t.realHeight*4,0);
    },
    hideBuilding(r){r.active=false;r.base.root.visible=r.top.root.visible=false;if(r.glowMesh)r.glowMesh.visible=false;if(r.glowLive)r.glowLive.root.visible=false;},
    evictBuilding(b,r){this.clearBuildingGlow(r,true);r.base.destroy();r.top.destroy();this.nativeBuildings.delete(b);this.buildingStats.evictions++;},
    trimBuildingRecords(now=performance.now()){
        const hidden=[...this.nativeBuildings].filter(([,r])=>!r.active).sort((a,b)=>a[1].seen-b[1].seen);
        let bytes=hidden.reduce((n,[,r])=>n+this.buildingRecordBytes(r),0),nodes=hidden.reduce((n,[,r])=>n+[r.base,r.top,r.glowContext,r.glowLive].reduce((v,c)=>v+(c?.pool.length||0),0),0),count=hidden.length;
        for(const [b,r]of hidden){if(now-r.seen<30000&&count<=12&&nodes<=12000)continue;
            bytes-=this.buildingRecordBytes(r);nodes-=[r.base,r.top,r.glowContext,r.glowLive].reduce((v,c)=>v+(c?.pool.length||0),0);count--;this.evictBuilding(b,r);
        }
        // Prefer dropping a reconstructible glow snapshot to discarding the
        // building's imported artwork and tessellation pools under pressure.
        for(const [b,r]of hidden){if(bytes<=24*1048576)break;if(!this.nativeBuildings.has(b)||!r.glowTarget)continue;
            const old=this.buildingRecordBytes(r);this.dropBuildingTarget(r);bytes-=old-this.buildingRecordBytes(r);
        }
        for(const [b,r]of hidden){if(bytes<=24*1048576)break;if(!this.nativeBuildings.has(b))continue;
            bytes-=this.buildingRecordBytes(r);nodes-=[r.base,r.top,r.glowContext,r.glowLive].reduce((v,c)=>v+(c?.pool.length||0),0);count--;this.evictBuilding(b,r);
        }
        Object.assign(this.buildingStats,{visible:[...this.nativeBuildings.values()].filter(r=>r.active).length,retained:count,retainedBytes:bytes,retainedNodes:nodes,poolBytes:this.buildingPoolBytes()});
    },
    buildingPoolBytes(){return (this.buildingGlowPool||[]).reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0);},
    releaseBuildingPool(){for(const t of this.buildingGlowPool||[])t.destroy(true);this.buildingGlowPool=[];},
    recycleBuildingTarget(t){
        const pool=this.buildingGlowPool||(this.buildingGlowPool=[]);pool.push(t);
        while(pool.length>2||this.buildingPoolBytes()>4*1048576)pool.shift().destroy(true);
    },
    dropBuildingTarget(r,recycle=true){
        const target=r.glowTarget;if(!target)return null;r.glowTarget=null;r.glowKey=null;
        if(r.glowMesh){r.glowMesh.visible=false;r.glowMesh.shader.uniforms.image=PIXI.Texture.EMPTY;}
        if(recycle)this.recycleBuildingTarget(target);return target;
    },
    takeBuildingTarget(w,h,density){
        const size=w+':'+h+':'+density,matches=t=>t._nativeBuildingSize===size,pool=this.buildingGlowPool||(this.buildingGlowPool=[]),i=pool.findIndex(matches);
        if(i>=0){this.buildingStats.targetReuses++;return pool.splice(i,1)[0];}
        // Preserve useful snapshots while the allocation fits. Borrowing is
        // for pressure, otherwise every return would repaint the donor.
        if(this.buildingGlowBytes()+this.buildingPoolBytes()+Math.ceil(w*density)*Math.ceil(h*density)*4<=24*1048576)return null;
        const donor=[...this.nativeBuildings.values()].filter(r=>!r.active&&r.glowTarget&&matches(r.glowTarget)).sort((a,b)=>a.seen-b.seen)[0];
        if(donor){this.buildingStats.targetBorrows++;return this.dropBuildingTarget(donor,false);}return null;
    },
    reserveBuildingGlow(bytes){
        // Active targets plus the small free pool share the original 24MiB cap.
        if(this.buildingGlowBytes()+this.buildingPoolBytes()+bytes<=24*1048576)return true;
        this.releaseBuildingPool();
        for(const [b,r]of [...this.nativeBuildings].filter(([,r])=>!r.active).sort((a,b)=>a[1].seen-b[1].seen)){
            if(this.buildingGlowBytes()+bytes<=24*1048576)break;this.evictBuilding(b,r);this.releaseBuildingPool();
        }
        return this.buildingGlowBytes()+bytes<=24*1048576;
    },
    clearBuildingGlow(r,recycle=false){
        if(r.glowContext)r.glowContext.destroy();if(r.glowLive)r.glowLive.destroy();
        if(r.glowMesh)r.glowMesh.destroy();if(r.glowTarget){if(recycle)this.recycleBuildingTarget(r.glowTarget);else r.glowTarget.destroy(true);}
        r.glowContext=r.glowLive=r.glowMesh=r.glowTarget=null;r.glowKey=null;
    },
    syncBuildingGlow(b,r,game,view,key){
        if(!b.drawEmissive)return true;
        const dark=game.dayCycle().darkness,w=game.canvas.width/view.zoom+128,h=game.canvas.height/view.zoom+128;
        const left=view.x-w/2,top=view.y-h/2,density=Math.min(view.zoom,1536/Math.max(w,h));
        if(!r.glowContext){r.glowContext=new NativeVectorContext(this);r.glowContext.label='building-emissive';r.glowLive=new NativeVectorContext(this);r.glowLive.label='building-live';
            r.glowMesh=new NativeBuildingGlowMesh();this.emissive.addChild(r.glowMesh,r.glowLive.root);}
        r.glowContext.sceneFrame=r.glowLive.sceneFrame=_worldMatrix;
        r.glowMesh.visible=r.glowLive.root.visible=this.layers.glows;
        if(!this.layers.glows)return true;
        const cacheKey=[key,view.zoom,game.canvas.width,game.canvas.height,Math.round(dark*64)].join(':');
        if(r.glowKey!==cacheKey){
            if(!r.glowTarget||r.glowSize!==w+':'+h+':'+density){
                if(r.glowTarget){r.glowTarget.destroy(true);r.glowTarget=null;}
                r.glowTarget=this.takeBuildingTarget(w,h,density);
                if(!r.glowTarget){
                    if(!this.reserveBuildingGlow(Math.ceil(w*density)*Math.ceil(h*density)*4)){this.clearBuildingGlow(r);this.buildingStats.fallbacks++;return false;}
                    // A pressure eviction may have made a matching target free.
                    r.glowTarget=this.takeBuildingTarget(w,h,density);
                    if(!r.glowTarget){r.glowTarget=this.target(PIXI.RenderTexture.create({width:w,height:h,resolution:density,scaleMode:PIXI.SCALE_MODES.LINEAR}),'building-glow-target');this.buildingStats.targetCreates++;}
                }
                r.glowSize=r.glowTarget._nativeBuildingSize=w+':'+h+':'+density;
            }
            const start=performance.now(),ctx=r.glowContext;ctx.begin();ctx.root.position.set(-left,-top);ctx.canvas=game.canvas;
            const methods=['_sqDrawCrown','_sqDrawBeams','_sqVeil','_mcBeams'],saved=[];r.glowCalls=[];
            try{
                for(const name of methods)if(typeof b[name]==='function'){
                    saved.push({name,own:Object.hasOwn(b,name),method:b[name]});b[name]=(...args)=>r.glowCalls.push({name,args:args.slice(1)});
                }
                b.drawEmissive(ctx,dark);
            }finally{for(const s of saved){if(s.own)b[s.name]=s.method;else delete b[s.name];}}
            // Store source-over coverage independently of additive RGB. This
            // makes the snapshot an affine composition over the lit scene:
            // output = cachedRGB + sceneRGB * (1 - cachedCoverage).
            const state=this.renderer.state,modes=state.blendModes,add=modes[PIXI.BLEND_MODES.ADD],gl=this.renderer.gl;
            try{modes[PIXI.BLEND_MODES.ADD]=[gl.ONE,gl.ONE,gl.ZERO,gl.ONE];state.blendMode=-1;
                this.renderer.render(ctx.root,{renderTexture:r.glowTarget,clear:true});
            }finally{modes[PIXI.BLEND_MODES.ADD]=add;state.blendMode=-1;}
            r.glowMesh.shader.uniforms.image=r.glowTarget;r.glowMesh.position.set(left,top);r.glowMesh.scale.set(w,h);r.glowKey=cacheKey;this.trimBuildingImages(ctx);
            this.buildingStats.rasterizations++;this.buildingStats.rasterMs+=performance.now()-start;
        }else this.buildingStats.hits++;
        const ctx=r.glowLive;ctx.begin();ctx.canvas=game.canvas;b._sqDark=dark;
        for(const call of r.glowCalls){const args=call.args.map(v=>typeof v==='number'?dark:v);b[call.name](ctx,...args);}
        const u=r.glowMesh.shader.uniforms;u.clock=_gameTimeSec;u.animate=this.layers.decorAnimation?1:0;
        this.trimBuildingImages(ctx);this.buildingStats.livePaths+=ctx.pathsPainted;return true;
    },
    buildingGlowBytes(){return [...(this.nativeBuildings?.values()||[])].reduce((n,r)=>n+(r.glowTarget?r.glowTarget.baseTexture.realWidth*r.glowTarget.baseTexture.realHeight*4:0),0);}
});
