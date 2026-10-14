// One GPU-resident idle + 16-phase walk strip per appearance, shared by civilians.
// World positions/facing and gait stay live; the player's body remains procedural.
class NativeCrowdPoseMesh extends PIXI.Mesh {
    constructor(){
        const g=new PIXI.Geometry().addAttribute('aVertexPosition',new Float32Array([0,0,112,0,112,112,0,112]),2)
            .addAttribute('aUV',new Float32Array([0,0,1,0,1,1,0,1]),2).addIndex([0,1,2,0,2,3]);
        const shader=PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;attribute vec2 aUV;
            uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec2 uv;
            void main(){uv=aUV;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.,1.);}`,
            `precision highp float;varying vec2 uv;uniform sampler2D atlas;uniform vec2 frames;uniform float blend;uniform float opacity;
            void main(){vec4 a=texture2D(atlas,vec2((uv.x+frames.x)/17.,uv.y));vec4 b=texture2D(atlas,vec2((uv.x+frames.y)/17.,uv.y));gl_FragColor=mix(a,b,blend)*opacity;}`,
            {atlas:PIXI.Texture.EMPTY,frames:new Float32Array(2),blend:0,opacity:1});
        super(g,shader);
    }
}
class NativeCrowdAtlas {
    constructor(owner){this.owner=owner;this.entries=new Map();this.built=0;this.stats={};}
    begin(){this.built=0;this.painted=0;this.stats={hits:0,misses:0,atlasesBuilt:0,spriteBodies:0,liveBodies:0,liveLiteBodies:0,liveMs:0,posesRasterized:0,poseMs:0,deferredPoses:0,partialBodies:0};}
    draw(ctx,e,c){
        if(c.pose==='dance'||c.pose==='die'||c.isDriving||c.stance&&c.stance!=='idle')return false;
        syncHumanoidGait(e);
        const key=(typeof weatherAt==='function'&&weatherAt(e)?.rain>.05?'wet:':'dry:')+JSON.stringify(c),owner=this.owner;let r=this.entries.get(key);
        if(!r){this.stats.misses++;
            if(this.built>=1||!this.canPaint()){this.stats.liveBodies++;return false;}
            if(this.entries.size>=64){const old=[...this.entries].find(([,v])=>v.used<owner.frameId-60);if(!old){this.stats.liveBodies++;return false;}this.dispose(old[1]);this.entries.delete(old[0]);}
            r=this.build(e,c);this.entries.set(key,r);this.built++;this.stats.atlasesBuilt++;
        }else this.stats.hits++;
        r.used=owner.frameId;const tau=Math.PI*2,walking=(e._gait?.speed||0)>CONFIG.GAIT.STOP_SPEED;
        const phase=walking?((e.walkPhase||0)%tau+tau)%tau/tau*16:0;
        let a=walking?1+Math.floor(phase):0,b=walking?1+(Math.floor(phase)+1)%16:0,mix=walking?phase%1:0;
        for(const f of new Set([a,b]))if(!r.ready.has(f)){
            if(this.canPaint())this.paint(r,e,c,f);else this.stats.deferredPoses++;
        }
        if(!r.ready.size){this.stats.liveBodies++;return false;}
        if(!r.ready.has(a)||!r.ready.has(b)){
            const wanted=phase,closest=[...r.ready].sort((a,b)=>{const d=f=>f?Math.min(Math.abs(f-1-wanted),16-Math.abs(f-1-wanted)):walking?16:0;return d(a)-d(b);})[0];
            if(r.ready.has(a)){b=a;mix=0;}else if(r.ready.has(b)){a=b;mix=0;}else {a=b=closest;mix=0;}this.stats.partialBodies++;
        }
        if(owner.layers.contactShadows&&!c.noShadow&&_zoomLOD<2){const t=ctx.getTransform();_bodyRot=Math.atan2(t.b,t.a);drawHumanContactShadow(ctx,e);}
        ctx.current=null;const mesh=ctx.node(NativeCrowdPoseMesh),u=mesh.shader.uniforms;
        u.atlas=r.target;u.frames.set([a,b]);u.blend=mix;u.opacity=ctx.globalAlpha;
        owner.nativeCasters.note(ctx,e,{texture:r.target,size:112,bounds:r.bounds||{x:0,y:0,width:112,height:112},frames:[a,b],blend:mix,key:r.target.baseTexture.uid+':'+a+':'+b+':'+mix});
        owner.nightHeat.paint(ctx,e,{texture:r.target,size:112,frames:[a,b],blend:mix});
        mesh.transform.setFromMatrix(ctx.matrix.clone().append(new PIXI.Matrix(1,0,0,1,-56,-56)));ctx.current=null;
        RenderStats.bodies++;RenderStats.cachedBodies++;this.stats.spriteBodies++;return true;
    }
    canPaint(){return this.painted<2&&(!this.painted||this.stats.poseMs<2);}
    build(e,c){
        // Reserve the strip once; paint only requested poses under the per-frame
        // budget. Idle arrivals no longer render 17 procedural bodies at once.
        const target=this.owner.target(PIXI.RenderTexture.create({width:112*17,height:112,resolution:1.25,scaleMode:PIXI.SCALE_MODES.LINEAR}),'crowd-pose-atlas');
        return {target,ready:new Set(),used:this.owner.frameId,bounds:null};
    }
    paint(r,e,c,f){
        const start=performance.now(),ctx=this.worker||(this.worker=new NativeVectorContext(this.owner));ctx.label='crowd-pose';ctx.canvas=this.owner.canvas;
        const B={x:e.x,y:e.y,angle:0,look:e.look,walkPhase:f?(f-1)/16*Math.PI*2:0};syncHumanoidGait(B);const G=B._gait;
        const cfg={...c,lerpSpeed:1,noShadow:true,poseInstant:true,_crowdBake:true},saved={lite:_crowdLite,wm:_worldMatrix,wc:_worldCanvas};
        try{_crowdLite=true;G.speed=f?2:0;G.dirX=1;G.dirY=0;G.tick=_simTick;G.prevX=B.x;G.prevY=B.y;G.phasePrev=B.walkPhase;
            ctx.begin();ctx.translate(f*112+56,56);drawProceduralHumanoid(ctx,B,cfg);
            this.owner.renderer.render(ctx.root,{renderTexture:r.target,clear:!r.ready.size});r.ready.add(f);
            const b=ctx.root.getLocalBounds(),x=b.x-f*112-1,y=b.y-1,right=x+b.width+2,bottom=y+b.height+2,old=r.bounds;
            const left=old?Math.min(old.x,x):x,top=old?Math.min(old.y,y):y;r.bounds={x:left,y:top,width:(old?Math.max(old.x+old.width,right):right)-left,height:(old?Math.max(old.y+old.height,bottom):bottom)-top};
        }finally{_crowdLite=saved.lite;_worldMatrix=saved.wm;_worldCanvas=saved.wc;this.owner.trimBuildingImages(ctx);}
        this.painted++;this.stats.posesRasterized++;this.stats.poseMs+=performance.now()-start;
    }
    dispose(r){r.target.destroy(true);}
    clear(){for(const r of this.entries.values())this.dispose(r);this.entries.clear();this.worker?.destroy();this.worker=null;}
    get bytes(){return [...this.entries.values()].reduce((n,r)=>n+r.target.baseTexture.realWidth*r.target.baseTexture.realHeight*4,0);}
}
