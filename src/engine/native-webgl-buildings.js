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
    clearBuildingGlow(r){
        if(r.glowContext)r.glowContext.destroy();if(r.glowLive)r.glowLive.destroy();
        if(r.glowMesh)r.glowMesh.destroy();if(r.glowTarget)r.glowTarget.destroy(true);
        r.glowContext=r.glowLive=r.glowMesh=r.glowTarget=null;r.glowKey=null;
    },
    syncBuildingGlow(b,r,game,view,key){
        if(!b.drawEmissive)return true;
        const dark=game.dayCycle().darkness,w=game.canvas.width/view.zoom+128,h=game.canvas.height/view.zoom+128;
        const left=view.x-w/2,top=view.y-h/2,density=Math.min(view.zoom,1536/Math.max(w,h));
        const oldBytes=r.glowTarget?r.glowTarget.baseTexture.realWidth*r.glowTarget.baseTexture.realHeight*4:0;
        if(this.buildingGlowBytes()-oldBytes+Math.ceil(w*density)*Math.ceil(h*density)*4>24*1048576){this.clearBuildingGlow(r);this.buildingStats.fallbacks++;return false;}
        if(!r.glowContext){r.glowContext=new NativeVectorContext(this);r.glowContext.label='building-emissive';r.glowLive=new NativeVectorContext(this);r.glowLive.label='building-live';
            r.glowMesh=new NativeBuildingGlowMesh();this.emissive.addChild(r.glowMesh,r.glowLive.root);}
        r.glowContext.sceneFrame=r.glowLive.sceneFrame=_worldMatrix;
        r.glowMesh.visible=r.glowLive.root.visible=this.layers.glows;
        if(!this.layers.glows)return true;
        const cacheKey=[key,view.zoom,game.canvas.width,game.canvas.height,Math.round(dark*64)].join(':');
        if(r.glowKey!==cacheKey){
            const start=performance.now(),ctx=r.glowContext;ctx.begin();ctx.root.position.set(-left,-top);ctx.canvas=game.canvas;
            const methods=['_sqDrawCrown','_sqDrawBeams','_sqVeil','_mcBeams'],saved=[];r.glowCalls=[];
            try{
                for(const name of methods)if(typeof b[name]==='function'){
                    saved.push({name,own:Object.hasOwn(b,name),method:b[name]});b[name]=(...args)=>r.glowCalls.push({name,args:args.slice(1)});
                }
                b.drawEmissive(ctx,dark);
            }finally{for(const s of saved){if(s.own)b[s.name]=s.method;else delete b[s.name];}}
            if(!r.glowTarget||r.glowSize!==w+':'+h+':'+density){
                if(r.glowTarget)r.glowTarget.destroy(true);
                r.glowTarget=PIXI.RenderTexture.create({width:w,height:h,resolution:density,scaleMode:PIXI.SCALE_MODES.LINEAR});r.glowSize=w+':'+h+':'+density;
            }
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
