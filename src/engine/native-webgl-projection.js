// GPU building projection. Buildings lean toward the camera: a point at height z is drawn at
// cam + (p - cam) * C / (C - z), C being the lean camera height (config.js leanCamHeight). The
// authored building routines compute that on the CPU and emit flat 2D paths, so every camera
// move used to re-run them in full. Here a building's layer is captured once into projected
// meshes and the vertex shader does the lean from then on: moving the camera changes two
// uniforms, nothing is redrawn or re-tessellated.
//
// Capture recovers each vertex's ground point and height without touching building code: the
// layer is drawn twice, the second time with the camera nudged by D. A vertex at lean factor k
// moves by D*(1-k) between the two, which gives k, hence its height and ground position.
// Anything the method can't represent (clip masks, bitmap text, custom-shader meshes, shapes
// that don't follow the lean) makes that layer fall back to the live path.
class NativeProjectedMesh extends PIXI.Mesh {
    containsPoint(){return false;}   // never a pointer target (its geometry has no aVertexPosition)
    static shader(){
        return NativeProjectedMesh._shader||(NativeProjectedMesh._shader=PIXI.Shader.from(`precision highp float;
            attribute vec2 aGround;attribute vec2 aZ;attribute vec4 aColor;attribute vec2 aUV;attribute vec4 aFace;
            uniform mat3 projectionMatrix;uniform mat3 translationMatrix;uniform vec2 cam;uniform float camH;uniform float uCull;
            varying vec4 vColor;varying vec2 vUV;
            void main(){vec2 k=camH/max(vec2(1.),camH-aZ);vec2 p=cam+(aGround-cam)*k;vColor=aColor;vUV=aUV;
                gl_Position=vec4((projectionMatrix*translationMatrix*vec3(p,1.)).xy,0.,1.);
                // Facade faces are back-face culled here, with the building code's own facing test.
                if(aFace.w*uCull>.5&&dot(cam,aFace.xy)<=aFace.z)gl_Position=vec4(2.,2.,2.,1.);}`,
            `precision mediump float;varying vec4 vColor;varying vec2 vUV;uniform sampler2D uSampler;uniform vec3 uPulse;
            void main(){gl_FragColor=texture2D(uSampler,vUV)*vColor*(1.-uPulse.x*(.5+.5*sin(uPulse.y*2.7+gl_FragCoord.x*uPulse.z)));}`,
            {uSampler:PIXI.Texture.WHITE,cam:new Float32Array(2),camH:1,uCull:0,uPulse:new Float32Array(3)}));
    }
    constructor(run){
        const n=run.z.length/2,g=new PIXI.Geometry()
            .addAttribute('aGround',new Float32Array(run.ground),2).addAttribute('aZ',new Float32Array(run.z),2)
            .addAttribute('aColor',new Float32Array(run.color),4).addAttribute('aUV',new Float32Array(run.uv),2).addAttribute('aFace',new Float32Array(run.face),4)
            .addIndex(n>65535?new Uint32Array(run.index):new Uint16Array(run.index));
        super(g,NativeProjectedMesh.shader());this.projTexture=run.texture;this.blendMode=run.blend;this.vertexCount=n;
    }
    // The shader is shared, so the texture lives on the mesh (Mesh.texture would write the shared shader).
    _render(renderer){
        // Emissive boxes carry the glow shimmer (amplitude, clock, phase per pixel); others none.
        const u=this.shader.uniforms,p=this.parent?.pulse||this.parent?.parent?.pulse;u.uSampler=this.projTexture;
        if(p)u.uPulse.set(p);else u.uPulse.fill(0);super._render(renderer);}
}

(() => {
    const PROJECTION_VARIANTS=6;   // resident captures per building layer (lamps x zoom detail x darkness steps)
    const NUDGE=.5;   // camera nudge (world px) between the two capture passes: small, so sort order and face choice don't flip
    // Visible nodes of a vector context in draw order, with their transform relative to its root.
    // A clip group becomes {clip, items}: its mask is projected too and clips its own items.
    function collect(ctx){
        const pool=new Set(ctx.pool);let why=null;
        const walk=(node,m,alpha,out)=>{
            for(const c of node.children){
                if(why)return out;
                if(!c.visible||!pool.has(c)||c.isMask||node.mask===c)continue;
                if(c.filters?.length||c instanceof PIXI.BitmapText||(c instanceof PIXI.Mesh&&!(c instanceof PIXI.Graphics))){why=c instanceof PIXI.BitmapText?'text':c.filters?.length?'filter':'mesh:'+c.constructor.name;return out;}
                c.transform.updateLocalTransform();const cm=m.clone().append(c.localTransform),a=alpha*c.alpha;
                if(c instanceof PIXI.Graphics||c instanceof PIXI.Sprite)out.push({node:c,m:cm,alpha:a});
                else if(c.mask){
                    const k=c.mask;if(!(k instanceof PIXI.Graphics)||!pool.has(k)){why='mask';return out;}
                    k.transform.updateLocalTransform();
                    out.push({clip:{node:k,m:k.parent===c?cm.clone().append(k.localTransform):m.clone().append(k.localTransform),alpha:1},items:walk(c,cm,a,[])});
                }
                else walk(c,cm,a,out);
            }
            return out;
        };
        const items=walk(ctx.root,new PIXI.Matrix(),1,[]);collect.why=why;return why?null:items;
    }
    // Authored points of a Graphics node in world space (its paths before fill/stroke
    // tessellation). Both capture passes author the same points in the same order, so lean is
    // measured on these; tessellated vertices, whose count can change with the nudge (a stroke
    // join flipping between mitre and bevel), take the lean of their nearest authored point.
    // Both passes' anchors, shape for shape. A shape present in only one pass (detail a routine
    // skips when it is nearly edge-on to the camera) is left out; its vertices take the lean of
    // the nearest paired point. Shapes are aligned by a longest-common-subsequence over their
    // signatures (point count, fill or stroke, colour, width).
    function pairedAnchors(a,b){
        const A=a.node.geometry.graphicsData,B=b.node.geometry.graphicsData;
        if(A.length===B.length){const la=anchors(a),lb=anchors(b);if(!la||!lb||la.length===lb.length)return [la,lb];}
        const sig=d=>(d.shape.points?.length??d.shape.type)+(d.lineStyle?.visible?'L'+d.lineStyle.width.toFixed(2)+':'+d.lineStyle.color:'F'+d.fillStyle.color)+':'+(d.holes?.length||0);
        const sa=A.map(sig),sb=B.map(sig),n=sa.length,m=sb.length;if(n*m>4e6)return [null,null];
        const L=new Uint16Array((n+1)*(m+1));
        for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*(m+1)+j]=sa[i]===sb[j]?L[(i+1)*(m+1)+j+1]+1:Math.max(L[(i+1)*(m+1)+j],L[i*(m+1)+j+1]);
        const ka=[],kb=[];for(let i=0,j=0;i<n&&j<m;){if(sa[i]===sb[j]){ka.push(A[i]);kb.push(B[j]);i++;j++;}else if(L[(i+1)*(m+1)+j]>=L[i*(m+1)+j+1])i++;else j++;}
        return [anchors(a,ka),anchors(b,kb)];
    }
    function anchors(item,list=item.node.geometry.graphicsData){
        const m=item.m,out=[];
        for(const d of list){
            const s=d.shape,pts=s.points||(s.type===PIXI.SHAPES.RECT?[s.x,s.y,s.x+s.width,s.y,s.x+s.width,s.y+s.height,s.x,s.y+s.height]:null);
            if(!pts)return null;const t=d.matrix;
            for(let i=0;i<pts.length;i+=2){let x=pts[i],y=pts[i+1];if(t){const X=t.a*x+t.c*y+t.tx;y=t.b*x+t.d*y+t.ty;x=X;}out.push(m.a*x+m.c*y+m.tx,m.b*x+m.d*y+m.ty);}
            for(const h of d.holes||[]){const hp=h.shape.points;if(!hp)return null;for(let i=0;i<hp.length;i+=2){let x=hp[i],y=hp[i+1];if(t){const X=t.a*x+t.c*y+t.tx;y=t.b*x+t.d*y+t.ty;x=X;}out.push(m.a*x+m.c*y+m.tx,m.b*x+m.d*y+m.ty);}}
        }
        return out;
    }
    // Nearest-point lookup over a flat [x,y,...] list (uniform grid; captures are one-off).
    function nearest(list){
        const S=16,grid=new Map();
        for(let i=0;i<list.length;i+=2){const k=Math.floor(list[i]/S)+','+Math.floor(list[i+1]/S);let c=grid.get(k);if(!c)grid.set(k,c=[]);c.push(i);}
        return (x,y)=>{
            const gx=Math.floor(x/S),gy=Math.floor(y/S);let best=-1,bd=Infinity;
            for(let r=0;r<64&&(best<0||(r-1)*S<=Math.sqrt(bd));r++)for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++){
                if(Math.max(Math.abs(i),Math.abs(j))!==r)continue;const c=grid.get((gx+i)+','+(gy+j));if(!c)continue;
                for(const p of c){const dx=list[p]-x,dy=list[p+1]-y,d=dx*dx+dy*dy;if(d<bd){bd=d;best=p;}}
            }
            return best;
        };
    }
    // Facing plane of a building face as (nx, ny, c, 1): visible while dot(cam, n) > c, the same
    // test as building-v2 _visibleFaces. Untagged geometry gets (0,0,0,0) and is always drawn.
    function facePlane(f){
        if(!f)return [0,0,0,0];
        switch(f.side){case 'S':return [0,1,f.y1,1];case 'N':return [0,-1,-f.y1,1];case 'E':return [1,0,f.x1,1];case 'W':return [-1,0,-f.x1,1];
            default:return [f.nx,f.ny,f.nx*(f.x1+f.x2)/2+f.ny*(f.y1+f.y2)/2,1];}
    }
    // During a capture a building's faces are all drawn, as a list whose iteration tags what each
    // face draws with that face (ctx.faceTag); the shader then culls back faces per camera, so the
    // capture holds for every camera position. Derived lists (filter/map) tag the same way.
    let tagging=null;
    class FaceList extends Array{
        static get [Symbol.species](){return FaceList;}
        [Symbol.iterator](){
            const list=this,ctx=tagging,prev=ctx?.faceTag;let i=0;
            return {next(){if(i<list.length){const f=list[i++];if(ctx)ctx.faceTag=f&&typeof f==='object'&&f.side&&Number.isFinite(f.x1)?f:prev;return {value:f,done:false};}
                    if(ctx)ctx.faceTag=prev;return {value:undefined,done:true};},
                return(){if(ctx)ctx.faceTag=prev;return {value:undefined,done:true};},[Symbol.iterator](){return this;}};
        }
    }
    function withAllFaces(b,ctx,fn){
        if(!b||typeof b._leanFaces!=='function'||typeof b._visibleFaces!=='function')return fn();
        const own=Object.hasOwn(b,'_visibleFaces'),method=b._visibleFaces;
        b._visibleFaces=()=>FaceList.from(b._leanFaces());tagging=ctx;
        try{return fn();}finally{tagging=null;ctx.faceTag=undefined;if(own)b._visibleFaces=method;else delete b._visibleFaces;}
    }
    // Flattened triangles of one node: world positions, premultiplied colours, uvs, indices, texture.
    function triangles(item){
        const n=item.node,m=item.m,tint=n.tint??0xffffff,tr=(tint>>16&255)/255,tg=(tint>>8&255)/255,tb=(tint&255)/255,al=item.alpha;
        if(n instanceof PIXI.Graphics){
            const g=n.geometry;g.updateBatches();if(!g.batches.length)return [];
            const pts=g.points,uvs=g.uvs,idx=g.indices,out=[];
            for(const b of g.batches){
                // One style per batch. Its colour is taken from the style: small (batchable) geometries
                // never fill GraphicsGeometry.colors, Pixi tints them per batch at draw time.
                const tex=b.style.texture,base=tex.baseTexture,piece={base,tex,pos:[],color:[],uv:[],index:[]},map=new Map();
                const [sr,sg,sb]=PIXI.Color.shared.setValue(b.style.color).toRgbArray(),sa=b.style.alpha*al;
                for(let i=b.start;i<b.start+b.size;i++){
                    const v=idx[i];let j=map.get(v);
                    if(j===undefined){j=piece.pos.length/2;map.set(v,j);const x=pts[v*2],y=pts[v*2+1];
                        piece.pos.push(m.a*x+m.c*y+m.tx,m.b*x+m.d*y+m.ty);
                        piece.color.push(sr*tr*sa,sg*tg*sa,sb*tb*sa,sa);piece.uv.push(uvs[v*2],uvs[v*2+1]);}
                    piece.index.push(j);
                }
                out.push(piece);
            }
            return out;
        }
        const t=n.texture;if(!t?.valid)return [];
        const w=t.orig.width,h=t.orig.height,ax=n.anchor.x*w,ay=n.anchor.y*h,u=t._uvs,a=al;
        const pos=[];for(const [x,y]of [[-ax,-ay],[w-ax,-ay],[w-ax,h-ay],[-ax,h-ay]])pos.push(m.a*x+m.c*y+m.tx,m.b*x+m.d*y+m.ty);
        const c=[tr*a,tg*a,tb*a,a];
        return [{base:t.baseTexture,tex:t,pos,color:[...c,...c,...c,...c],uv:[u.x0,u.y0,u.x1,u.y1,u.x2,u.y2,u.x3,u.y3],index:[0,1,2,0,2,3]}];
    }

    Object.assign(NativeWebGLRenderer.prototype,{
        /** Draw `draw` into ctxA (and ctxB at a nudged camera); returns a container of projected meshes, or null. */
        captureProjected(ctxA,ctxB,draw,D=NUDGE,b=null){
            const cam=game.camera,cx=cam.x,cy=cam.y,C=leanCamHeight();
            // Captures take text through the real-font sprite path, which the projector can lean.
            ctxA.retainedOff=ctxB.retainedOff=ctxA.textSprites=ctxB.textSprites=true;
            // Captured unculled: the meshes serve every camera position in this region, so a
            // camera move never forces a recapture (building routines cull to game._cullBounds.view).
            const cull=game._cullBounds;if(cull)game._cullBounds={...cull,view:{left:-Infinity,top:-Infinity,right:Infinity,bottom:Infinity}};
            try{
                const tape={record:true,list:[],i:0};ctxA.segTape=tape;ctxA.begin();draw(ctxA);
                tape.record=false;ctxB.segTape=tape;cam.x=cx+D;cam.y=cy+D;try{ctxB.begin();draw(ctxB);}finally{cam.x=cx;cam.y=cy;}
                if(tape.i!==tape.list.length)this.projectionFail='tape';
            }finally{ctxA.retainedOff=ctxB.retainedOff=ctxA.textSprites=ctxB.textSprites=false;ctxA.segTape=ctxB.segTape=null;game._cullBounds=cull;}
            const fail=why=>{this.projectionFail=why;return null;};
            const A=collect(ctxA);if(!A)return fail(collect.why);const B=collect(ctxB);if(!B)return fail(collect.why);
            let vertices=0,deviation=0;
            // Pair the two captures node for node, turning each pair into projected vertices.
            const build=(A,B,box)=>{
                if(A.length!==B.length)return 'nodes '+A.length+'/'+B.length;
                let run=null;const runs=[];
                const flush=()=>{for(const r of runs)if(r.index.length){const mesh=new NativeProjectedMesh(r);box.addChild(mesh);vertices+=mesh.vertexCount;}runs.length=0;run=null;};
                const project=(a,b,into)=>{
                    if(a.node.constructor!==b.node.constructor)return 'type';
                    const pa=triangles(a),plane=facePlane(a.node._faceTag);let lean;
                    if(a.node instanceof PIXI.Graphics){
                        const [la,lb]=pairedAnchors(a,b);if(!la||!lb)return 'shape';if(la.length!==lb.length)return 'anchors '+la.length+'/'+lb.length;
                        const near=nearest(la);lean=(x,y)=>{const p=near(x,y);return p<0?null:[1-(lb[p]-la[p])/D,1-(lb[p+1]-la[p+1])/D];};
                    }else{
                        const pb=triangles(b);if(pa.length!==pb.length)return 'batches';
                        lean=(x,y,p,v)=>[1-(pb[p].pos[v]-x)/D,1-(pb[p].pos[v+1]-y)/D];
                    }
                    for(let p=0;p<pa.length;p++){
                        const qa=pa[p],blend=a.node.blendMode;
                        if(!into.run||into.run.base!==qa.base||into.run.blend!==blend){into.run={base:qa.base,texture:qa.base===PIXI.Texture.WHITE.baseTexture?PIXI.Texture.WHITE:new PIXI.Texture(qa.base),blend,ground:[],z:[],color:[],uv:[],face:[],index:[]};into.runs.push(into.run);}
                        const r=into.run,offset=r.z.length/2;
                        for(let v=0;v<qa.pos.length;v+=2){
                            const ax=qa.pos[v],ay=qa.pos[v+1],k=lean(ax,ay,p,v);if(!k)return 'anchor';const [kx,ky]=k;
                            // Ground-level points (k=1) and anything leaning with the camera; reject what doesn't.
                            // Each axis leans as C/(C-z) for its own height: fixed 3D points have zx==zy,
                            // features with an axis-specific lean (landmark crowns, facade foreshortening) don't.
                            if(kx<.25||kx>8||ky<.25||ky>8)return 'lean '+kx.toFixed(3)+','+ky.toFixed(3);
                            const dev=Math.abs(kx-ky);if(dev>deviation)deviation=dev;
                            r.ground.push(cx+(ax-cx)/kx,cy+(ay-cy)/ky);r.z.push(C*(1-1/kx),C*(1-1/ky));r.face.push(...plane);
                        }
                        r.color.push(...qa.color);r.uv.push(...qa.uv);for(const j of qa.index)r.index.push(j+offset);
                    }
                    return null;
                };
                const into={get run(){return run;},set run(v){run=v;},runs};
                for(let i=0;i<A.length;i++){
                    const a=A[i],b=B[i];
                    if(a.clip||b.clip){
                        if(!a.clip||!b.clip)return 'clip';
                        flush();const group=new PIXI.Container(),maskInto={run:null,runs:[]};
                        const err=project(a.clip,b.clip,maskInto);if(err)return err;
                        const mask=maskInto.runs[0]?new NativeProjectedMesh(maskInto.runs[0]):null;
                        if(mask){group.addChild(mask);group.mask=mask;}
                        box.addChild(group);const inner=build(a.items,b.items,group);if(inner)return inner;
                        continue;
                    }
                    const err=project(a,b,into);if(err)return err;
                }
                flush();return null;
            };
            const box=new PIXI.Container(),err=build(A,B,box);
            if(err){box.destroy({children:true});return fail(err);}
            box.vertexCount=vertices;box.deviation=deviation;
            // The captured nodes are no longer drawn. ctxA keeps its text records: the sprites'
            // textures stay resident while the projected meshes use them.
            for(const n of ctxA.pool)n.visible=false;ctxA.root.removeChildren();ctxB.begin();
            return box;
        },
        // Which faces a camera can see changes the drawing itself; recapture when it changes.
        projectionRegion(b,cam){
            const x0=b.x,y0=b.y,x1=b.x+(b.w||b.width||0),y1=b.y+(b.h||b.height||0);
            return (cam.x<x0?0:cam.x>x1?2:1)+':'+(cam.y<y0?0:cam.y>y1?2:1);
        },
        /** One building layer through the projector. Returns false to make the caller draw it live. */
        syncProjectedLayer(r,slot,ctx,common,b,draw,game,view){
            const L=this.layers;if(L.gpuProjection===false||!CONFIG.BUILDINGS.LEAN){this.dropProjected(r,slot);return false;}
            // Faced buildings are captured with every face and culled in the shader, so the camera's
            // side doesn't matter; other buildings still key on it (their art may branch on it).
            const cam=game.camera,p=r[slot]||(r[slot]={boxes:new Map()}),key=common+'|'+this.projectionRegion(b,cam);
            // Every variant (lamps on/off, zoom detail, darkness step) is captured once and kept, so
            // switching between them is a GPU swap, not a rebuild.
            const hit=p.boxes.get(key);
            if(hit){this.projectionStats.hits++;if(p.box!==hit){if(p.box?.parent)p.box.parent.removeChild(p.box);p.box=hit;}p.boxes.delete(key);p.boxes.set(key,hit);return this.showProjected(p,ctx,cam);}
            const reach=Math.min(game.canvas.width,game.canvas.height)/(3*view.zoom),far=Math.hypot(cam.x-(p.cx??1e9),cam.y-(p.cy??1e9))>reach;
            if(p.fail===key&&!far)return false;
            const start=performance.now();
            p.ctxB||(p.ctxB=new NativeVectorContext(this));p.ctxB.sceneFrame=ctx.sceneFrame;p.ctxB.canvas=ctx.canvas;
            if(p.box?.parent)p.box.parent.removeChild(p.box);p.box=null;
            let box=this.captureProjected(ctx,p.ctxB,draw,NUDGE,b);if(!box&&/^lean|^nodes|^type|^batches|^anchors|^clip/.test(this.projectionFail||''))box=this.captureProjected(ctx,p.ctxB,draw,-NUDGE,b);this.projectionStats.captureMs+=performance.now()-start;
            p.cx=cam.x;p.cy=cam.y;
            if(!box){p.fail=key;this.projectionStats.fallbacks++;return false;}
            p.boxes.set(key,box);while(p.boxes.size>PROJECTION_VARIANTS){const [k,old]=p.boxes.entries().next().value;p.boxes.delete(k);old.destroy({children:true});}
            p.box=box;p.fail=null;this.projectionStats.captures++;return this.showProjected(p,ctx,cam);
        },
        showProjected(p,ctx,cam){
            const u=NativeProjectedMesh.shader().uniforms;u.cam[0]=cam.x;u.cam[1]=cam.y;u.camH=leanCamHeight();
            if(p.box.parent!==ctx.root)ctx.root.addChild(p.box);p.box.visible=true;this.projectionStats.vertices+=p.box.vertexCount;return true;
        },
        dropProjected(r,slot){const p=r[slot];if(!p)return;for(const box of p.boxes?.values()||[])box.destroy({children:true});if(p.box&&!p.box.destroyed)p.box.destroy({children:true});p.box=null;p.ctxB?.destroy();r[slot]=null;}
    });
})();
