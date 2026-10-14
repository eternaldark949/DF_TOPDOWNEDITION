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
    begin(){this.built=0;this.stats={hits:0,misses:0,atlasesBuilt:0,spriteBodies:0,liveBodies:0};}
    draw(ctx,e,c){
        if(c.pose==='dance'||c.pose==='die'||c.isDriving||c.stance&&c.stance!=='idle')return false;
        syncHumanoidGait(e);
        const key=(typeof weatherAt==='function'&&weatherAt(e)?.rain>.05?'wet:':'dry:')+JSON.stringify(c),owner=this.owner;let r=this.entries.get(key);
        if(!r){this.stats.misses++;
            if(this.built>=1){this.stats.liveBodies++;return false;}
            if(this.entries.size>=64){const old=[...this.entries].find(([,v])=>v.used<owner.frameId-60);if(!old){this.stats.liveBodies++;return false;}this.dispose(old[1]);this.entries.delete(old[0]);}
            r=this.build(e,c);this.entries.set(key,r);this.built++;this.stats.atlasesBuilt++;
        }else this.stats.hits++;
        r.used=owner.frameId;const tau=Math.PI*2,walking=(e._gait?.speed||0)>CONFIG.GAIT.STOP_SPEED;
        const phase=walking?((e.walkPhase||0)%tau+tau)%tau/tau*16:0;
        const a=walking?1+Math.floor(phase):0,b=walking?1+(Math.floor(phase)+1)%16:0,mix=walking?phase%1:0;
        if(owner.layers.contactShadows&&!c.noShadow&&_zoomLOD<2){const t=ctx.getTransform();_bodyRot=Math.atan2(t.b,t.a);drawHumanContactShadow(ctx,e);}
        ctx.current=null;const mesh=ctx.node(NativeCrowdPoseMesh),u=mesh.shader.uniforms;
        u.atlas=r.target;u.frames.set([a,b]);u.blend=mix;u.opacity=ctx.globalAlpha;
        owner.nativeCasters.note(ctx,e,{texture:r.target,size:112,bounds:r.bounds||{x:0,y:0,width:112,height:112},frames:[a,b],blend:mix,key:r.target.baseTexture.uid+':'+a+':'+b+':'+mix});
        mesh.transform.setFromMatrix(ctx.matrix.clone().append(new PIXI.Matrix(1,0,0,1,-56,-56)));ctx.current=null;
        RenderStats.bodies++;RenderStats.cachedBodies++;this.stats.spriteBodies++;return true;
    }
    build(e,c){
        const target=PIXI.RenderTexture.create({width:112*17,height:112,resolution:1.25,scaleMode:PIXI.SCALE_MODES.LINEAR}),ctx=new NativeVectorContext(this.owner);
        const B={x:e.x,y:e.y,angle:0,look:e.look,walkPhase:0};syncHumanoidGait(B);const G=B._gait;
        const cfg={...c,lerpSpeed:1,noShadow:true,poseInstant:true,_crowdBake:true},saved={lite:_crowdLite,wm:_worldMatrix,wc:_worldCanvas};
        let x0=112,y0=112,x1=0,y1=0;
        try{_crowdLite=true;
            for(let f=0;f<17;f++){
                G.speed=f?2:0;G.dirX=1;G.dirY=0;G.tick=_simTick;G.prevX=B.x;G.prevY=B.y;
                B.walkPhase=f?(f-1)/16*Math.PI*2:0;G.phasePrev=B.walkPhase;B._animState=null;
                ctx.begin();ctx.translate(f*112+56,56);drawProceduralHumanoid(ctx,B,cfg);
                this.owner.renderer.render(ctx.root,{renderTexture:target,clear:f===0});
                const bounds=ctx.root.getLocalBounds();x0=Math.min(x0,bounds.x-f*112);y0=Math.min(y0,bounds.y);x1=Math.max(x1,bounds.x-f*112+bounds.width);y1=Math.max(y1,bounds.y+bounds.height);
            }
        }catch(error){target.destroy(true);throw error;}
        finally{_crowdLite=saved.lite;_worldMatrix=saved.wm;_worldCanvas=saved.wc;ctx.destroy();}
        return {target,used:this.owner.frameId,bounds:{x:x0-1,y:y0-1,width:x1-x0+2,height:y1-y0+2}};
    }
    dispose(r){r.target.destroy(true);}
    clear(){for(const r of this.entries.values())this.dispose(r);this.entries.clear();}
    get bytes(){return [...this.entries.values()].reduce((n,r)=>n+r.target.baseTexture.realWidth*r.target.baseTexture.realHeight*4,0);}
}
