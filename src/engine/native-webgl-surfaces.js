// Native floor cues, daylight and glass. No live Canvas frame captures.
const NATIVE_DAYLIGHT_GLSL=`
uniform float lightingOn;uniform vec3 sunColor;uniform vec4 sunGrade;uniform vec2 sunDirection;
vec3 softSun(vec3 b,vec3 s){vec3 d=mix(((16.0*b-12.0)*b+4.0)*b,sqrt(max(b,vec3(0.0))),step(vec3(.25),b));
    return mix(b-(1.0-2.0*s)*b*(1.0-b),b+(2.0*s-1.0)*(d-b),step(vec3(.5),s));}
vec3 daylight(vec3 rgb,vec2 screen){float k=sunGrade.x;if(k<=.01)return rgb;
    float light=1.0-.6*sunGrade.y,golden=sunGrade.z;
    rgb=mix(rgb,1.0-(1.0-rgb)*(1.0-sunColor),(.09*light+.03*golden)*k);
    rgb=mix(rgb,softSun(rgb,sunColor),(.42+.1*golden)*k*light);
    vec2 center=viewport*.5-sunDirection*viewport*.7;float radius=max(viewport.x,viewport.y)*1.1;
    if(golden>.02){float a=.12*golden*k*clamp(1.0-distance(screen,center)/radius,0.0,1.0);
        rgb=mix(rgb,1.0-(1.0-rgb)*(1.0-vec3(1.0,160.0/255.0,150.0/255.0)),a);}
    float inner=min(viewport.x,viewport.y)*.35,outer=max(viewport.x,viewport.y)*.75;
    float edge=clamp((distance(screen,viewport*.5)-inner)/(outer-inner),0.0,1.0);
    return rgb*mix(vec3(1.0),mix(vec3(1.0),vec3(150.0,130.0,205.0)/255.0,edge),.3*k*edge);
}`;
const NATIVE_SURFACE_VERTEX=`precision highp float;attribute vec2 aVertexPosition;attribute vec2 aUV;
uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec2 uv;
void main(){uv=aUV;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.)).xy,0.,1.);}`;
function nativeSurfaceGeometry(){return new PIXI.Geometry().addAttribute('aVertexPosition',new Float32Array([0,0,1,0,1,1,0,1]),2)
    .addAttribute('aUV',new Float32Array([0,0,1,0,1,1,0,1]),2).addIndex([0,1,2,0,2,3]);}
// The same monotone-chain hull used by Canvas's sun pass.
function nativeSunHull(points){
    const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[],upper=[];for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
    for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
    lower.pop();upper.pop();return lower.concat(upper);
}
class NativeEntrancePad extends PIXI.Mesh{
    constructor(){super(nativeSurfaceGeometry(),PIXI.Shader.from(NATIVE_SURFACE_VERTEX,`
        precision highp float;varying vec2 uv;uniform vec2 size;uniform float pulse;uniform float zoom;
        vec4 over(vec4 a,vec3 rgb,float alpha){return vec4(a.rgb*(1.-alpha)+rgb*alpha,a.a*(1.-alpha)+alpha);}
        void main(){vec2 p=uv*(size+40.)-20.;vec2 d=abs(p-size*.5)-size*.5;
            float r=length(p-size*.5)/(max(size.x,size.y)*.8),a;
            vec3 c;float mid=.1+pulse*.08;
            if(r<.6){a=mix(.2+pulse*.12,mid,r/.6);c=mix(vec3(180.,170.,255.),vec3(200.,190.,255.),r/.6)/255.;}
            else{a=mid*(1.-clamp((r-.6)/.4,0.,1.));c=vec3(200.,190.,255.)/255.;}
            vec4 outColor=vec4(c*a,a);float edge=abs(max(d.x,d.y)),aa=.6/max(zoom,.1);
            float haze=(.16+pulse*.12)*exp(-edge*edge/(32.+pulse*24.));outColor=over(outColor,vec3(180.,170.,255.)/255.,haze);
            float inside=(1.-step(0.,max(d.x,d.y)));outColor=over(outColor,vec3(200.,190.,255.)/255.,inside*(.08+pulse*.06));
            float border=1.-smoothstep(1.-aa,1.+aa,edge);outColor=over(outColor,vec3(200.,190.,255.)/255.,border*(.5+pulse*.35));
            vec2 corner=min(abs(p),abs(p-size));float tick=1.-step(10.,max(corner.x,corner.y));
            outColor=over(outColor,vec3(210.,200.,255.)/255.,tick*border*(.7+pulse*.3));gl_FragColor=outColor;
        }`,{size:new Float32Array(2),pulse:0,zoom:1}));}
}
class NativeGlassRain extends PIXI.Mesh{
    constructor(){super(nativeSurfaceGeometry(),PIXI.Shader.from(NATIVE_SURFACE_VERTEX,`
        precision highp float;varying vec2 uv;uniform vec2 size;uniform vec2 clipSize;uniform vec2 offset;uniform float clock;uniform float wet;uniform float seed;
        float hash(float n){return fract(sin(n*127.1+seed*311.7)*43758.5453);}
        void main(){vec2 q=uv*clipSize,p=q+offset;float column=floor(p.x/9.),rnd=hash(column+1.);
            float xx=mod(p.x,9.)-(1.5+rnd*6.);float span=max(10.,size.y);
            float yy=mod(p.y+clock*(3.+rnd*8.)+rnd*span,span)-span*.5;
            float body=exp(-xx*xx/1.2-yy*yy/(1.5+rnd*7.));
            float tail=exp(-xx*xx/0.45)*smoothstep(-7.,-1.,yy)*(1.-smoothstep(-1.,.5,yy));
            float shine=(body*.45+tail*.16)*wet;
            float edge=clamp(min(min(q.x,clipSize.x-q.x),min(q.y,clipSize.y-q.y)),0.,1.);
            float a=shine*edge;gl_FragColor=vec4(vec3(.78,.88,1.)*a,a);
        }`,{size:new Float32Array(2),clipSize:new Float32Array(2),offset:new Float32Array(2),clock:0,wet:0,seed:0}));}
}
// A material highlight on the authored roof plane, without a scene capture.
class NativeWetRoof extends PIXI.Mesh{
    constructor(){super(new PIXI.MeshGeometry(new Float32Array(0),new Float32Array(0),new Uint16Array(0)),new PIXI.MeshMaterial(PIXI.Texture.EMPTY));this.key=null;}
    polygon(points,key){if(this.key===key)return;this.key=key;this.geometry.getBuffer('aVertexPosition').update(new Float32Array(points.flat()));
        this.geometry.getBuffer('aTextureCoord').update(new Float32Array(points.flatMap(([x,y])=>[x/64,y/64])));
        const index=[];for(let i=1;i<points.length-1;i++)index.push(0,i,i+1);this.geometry.getIndex().update(new Uint16Array(index));this.size=index.length;}
}
class NativeWorldSurfaces{
    constructor(owner){
        this.owner=owner;this.pads=new Map();this.glass=new Map();this.roofs=new Map();this.doorKeys=new WeakMap();this.sunHulls=new WeakMap();this.labels=new NativeVectorContext(owner);this.labels.label='entrance-labels';
        this.floor=new PIXI.Container();this.padStage=new PIXI.Container();this.glassStage=new PIXI.Container();
        owner.world.addChildAt(this.floor,owner.world.getChildIndex(owner.floorArt)+1);this.floor.addChild(this.padStage,this.labels.root);
        owner.postWorld.addChildAt(this.glassStage,owner.postWorld.getChildIndex(owner.marker));
        this.windowHole=new NativeVectorContext(owner);this.windowColor=new NativeVectorContext(owner);this.windowHole.label='window-daylight-holes';this.windowColor.label='window-daylight-color';owner.lightStage.addChild(this.windowHole.root,this.windowColor.root);
        this.cloudContext=new NativeVectorContext(owner);this.cloudContext.label='cloud-shadows';this.floor.addChildAt(this.cloudContext.root,0);
        this.sunStaticContext=new NativeVectorContext(owner);this.sunStaticContext.label='sun-static';this.sunContext=new NativeVectorContext(owner);this.sunContext.label='sun-cast-shadows';this.sunSprite=new PIXI.Sprite();this.sunSprite.blendMode=PIXI.BLEND_MODES.MULTIPLY;this.floor.addChildAt(this.sunSprite,0);
        this.sunFilter=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;uniform float strength;
            void main(){float a=texture2D(uSampler,vTextureCoord).a*strength;gl_FragColor=vec4(vec3(92.,76.,150.)/255.*a,a);}`,{strength:0});
        this.sunSprite.filters=[this.sunFilter];this.reflections=new NativeWetReflections(owner,this.floor);
    }
    get contexts(){return [this.labels,this.sunStaticContext,this.sunContext,this.cloudContext,this.windowHole,this.windowColor,...this.reflections.contexts];}
    sync(game,view){
        const start=performance.now(),r=this.owner,L=r.layers,W=game.canvas.width,H=game.canvas.height;
        const S=game.sunState(),k=L.daylight?S.k*game._sunReach():0;
        r.lighting.uniforms.sunColor.set((S.col||[255,248,234]).map(v=>v/255));r.lighting.uniforms.sunGrade.set([k,S.overcast||0,S.golden||0,0]);r.lighting.uniforms.sunDirection.set([S.dx||0,S.dy||0]);
        r.daylightState={active:k>.01,k,golden:S.golden||0};
        const hw=W/(2*view.zoom),hh=H/(2*view.zoom),V={left:view.x-hw-40,right:view.x+hw+40,top:view.y-hh-40,bottom:view.y+hh+40};
        const visible=(x,y,w,h)=>x+w>=V.left&&x<=V.right&&y+h>=V.top&&y<=V.bottom;
        const pulse=(Math.sin(_frameTime/200)+1)/2;let pads=0,labelCount=0,glassCount=0;
        for(const rec of this.pads.values())rec.node.visible=false;this.labels.begin();
        for(const t of game.activeMap.transitions||[]){
            if(t.quiet||!(L.entrancePads||L.entranceLabels)||!visible(t.x-20,t.y-20,t.w+40,t.h+40))continue;
            if(L.entrancePads&&pads<128){let rec=this.pads.get(t);if(!rec){rec={node:new NativeEntrancePad()};this.pads.set(t,rec);this.padStage.addChild(rec.node);}const n=rec.node;rec.used=r.frameId;n.visible=true;n.position.set(t.x-20,t.y-20);n.scale.set(t.w+40,t.h+40);n.shader.uniforms.size.set([t.w,t.h]);n.shader.uniforms.pulse=pulse;n.shader.uniforms.zoom=view.zoom;pads++;}
            const cx=t.x+t.w/2,cy=t.y+t.h/2;
            if(L.entranceLabels&&Math.hypot(game.player.x-cx,game.player.y-cy)<150){const c=this.labels,indoor=game.activeMap.type==='indoor';c.font='12px Orbitron';c.fillStyle='#ddd8ff';c.textAlign='center';c.textBaseline=indoor?'bottom':'top';c.fillText('ENTRANCE',cx,indoor?t.y-8:t.y+t.h+8);labelCount++;}
        }
        for(const [key,rec]of this.pads)if(rec.used<r.frameId-120){rec.node.destroy();this.pads.delete(key);}
        for(const rec of this.glass.values())rec.node.visible=false;
        const wet=L.glassRain?Math.min(1,Math.max(game.weather?.wetness||0,game.weather?.isRaining?game.weather.intensity*.8:0)):0;
        const paintGlass=(key,x,y,w,h,originX=x,originY=y,fullW=w,fullH=h)=>{
            if(wet<.01||glassCount>=96||!visible(x,y,w,h))return;
            let rec=this.glass.get(key);if(!rec){rec={node:new NativeGlassRain(),seed:originX*.07+originY*.013};this.glass.set(key,rec);this.glassStage.addChild(rec.node);}
            const n=rec.node;rec.used=r.frameId;n.visible=true;n.position.set(x,y);n.scale.set(w,h);n.shader.uniforms.size.set([fullW,fullH]);n.shader.uniforms.clipSize.set([w,h]);n.shader.uniforms.offset.set([x-originX,y-originY]);n.shader.uniforms.wet=wet;n.shader.uniforms.clock=L.decorAnimation?_gameTimeSec:0;n.shader.uniforms.seed=rec.seed;glassCount++;
        };
        if(L.windows)for(const w of game.roomSystem.windows||[])if(!w.shattered&&!(game.activeMap.id==='apt_949'&&w.y===0))paintGlass(w,w.x,w.y,w.w,w.h);
        if(L.doors)for(const d of game.roomSystem.doors||[])if(d.type==='sliding'){
            let keys=this.doorKeys.get(d);if(!keys)this.doorKeys.set(d,keys=[{},{}]);
            const slide=d.openAmount*((d.orientation==='H'?d.w:d.h)/2+4),leaves=d.leaves();for(let i=0;i<leaves.length;i++){const [ax,ay,bx,by]=leaves[i];
                if(d.orientation==='H')paintGlass(keys[i],Math.min(ax,bx),d.y+(d.jolt||0),Math.abs(bx-ax),d.h,d.x+(i===0?-slide:d.w/2+2+slide),d.y+(d.jolt||0),d.w/2-2,d.h);
                else paintGlass(keys[i],d.x+(d.jolt||0),Math.min(ay,by),d.w,Math.abs(by-ay),d.x+(d.jolt||0),d.y+(i===0?-slide:d.h/2+2+slide),d.w,d.h/2-2);
            }
        }
        for(const [key,rec]of this.glass)if(rec.used<r.frameId-120){rec.node.destroy();this.glass.delete(key);}
        for(const c of [this.windowHole,this.windowColor]){c.begin();c.canvas=game.canvas;c.setTransform(view.zoom,0,0,view.zoom,r.world.x,r.world.y);}
        if(L.windowDaylight){this.windowHole.globalCompositeOperation='screen';this.windowColor.globalCompositeOperation='lighter';game.roomSystem.drawWindowLightProjections(this.windowHole,game.dayCycle().daylight);game.roomSystem.drawWindowColorPass(this.windowColor,game.dayCycle().daylight);}
        this.windowHole.root.visible=true;this.windowColor.root.visible=false;
        this.cloudContext.begin();this.cloudContext.canvas=game.canvas;this.cloudContext.sceneFrame=_worldMatrix;
        if(L.cloudShadows&&game.activeMap.type==='outdoor'&&S.k>.02)game._drawCloudShadows(this.cloudContext,V,S.k*(1-.75*S.overcast),S);
        this.syncSun(game,view,V,S);const roofs=this.syncRoofs(game,view);this.reflections.sync(game,view,V);
        r.surfaceStats={pads,labels:labelCount,glass:glassCount,roofs,windowHoles:this.windowHole.pathsPainted,windowColor:this.windowColor.pathsPainted,cloudPaths:this.cloudContext.pathsPainted,daylight:r.daylightState,sun:this.sunStats,reflections:this.reflections.stats,cpuMs:performance.now()-start};r.layerStages.surfacesMs=r.surfaceStats.cpuMs;
    }
    syncRoofs(game,view){
        const r=this.owner,wet=r.layers.wetRoofs&&r.layers.buildings&&game.activeMap.type==='outdoor'?Math.min(1,game.weather.wetness||0):0;let count=0,dropped=0;
        for(const rec of this.roofs.values())for(const mesh of rec.meshes)mesh.visible=false;
        const shown=wet>.01?r.glBuildings?.visible()||[]:[];
        if(shown.length){
            if(!this.roofTile){this.roofTile=PIXI.RenderTexture.create({width:64,height:64,resolution:1});this.roofTile.baseTexture.wrapMode=PIXI.WRAP_MODES.REPEAT;
                this.roofTileMesh=new PIXI.Mesh(nativeSurfaceGeometry(),PIXI.Shader.from(NATIVE_SURFACE_VERTEX,`precision highp float;varying vec2 uv;uniform float clock;uniform float wet;
                    void main(){float wave=sin(uv.x*6.2831853+uv.y*6.2831853+clock*.7),streak=pow(max(0.,wave),12.);
                        float fleck=pow(max(0.,sin(uv.x*18.849556-uv.y*12.566371+clock*.9)),28.);float a=wet*(.008+.025*streak+.035*fleck);gl_FragColor=vec4(vec3(.68,.77,.94)*a,a);}`,{clock:0,wet:0}));
                this.roofTileMesh.scale.set(64);this.roofTileStage=new PIXI.Container();this.roofTileStage.addChild(this.roofTileMesh);
            }
            const clock=r.layers.decorAnimation?_gameTimeSec:0,key=clock+':'+wet;
            if(this.roofTileKey!==key){this.roofTileMesh.shader.uniforms.clock=clock;this.roofTileMesh.shader.uniforms.wet=wet;r.renderer.render(this.roofTileStage,{renderTexture:this.roofTile,clear:true});this.roofTileKey=key;}
        }
        for(const [b,record]of shown){if(!b._footprint||!b._leanScale)continue;let rec=this.roofs.get(b);if(!rec)this.roofs.set(b,rec={meshes:[]});rec.used=r.frameId;
            const k=1+b._leanScale(),key=[record.key,k].join(':');
            for(let i=0;i<b.sections.length;i++){
                if(count>=48){dropped++;continue;}let mesh=rec.meshes[i];if(!mesh)mesh=rec.meshes[i]=new NativeWetRoof();
                const points=b._footprint(b.sections[i],i).map(([x,y])=>[game.camera.x+(x-game.camera.x)*k,game.camera.y+(y-game.camera.y)*k]);mesh.polygon(points,key+':'+i);
                record.top.addChild(mesh);mesh.visible=true;mesh.shader.texture=this.roofTile;mesh.alpha=record.fade??1;count++;
            }
        }
        for(const [b,rec]of this.roofs)if(!r.glBuildings?.records.has(b)||rec.used<r.frameId-120){for(const mesh of rec.meshes)mesh.destroy();this.roofs.delete(b);}
        return {count,dropped,bytes:this.roofTile?64*64*4:0};
    }
    syncSun(game,view,V,S){
        const r=this.owner,strength=r.layers.sunShadows&&game.activeMap.type==='outdoor'?S.k*(1-.75*S.overcast):0;
        this.sunSprite.visible=strength>.02;
        this.sunStats={active:this.sunSprite.visible,casters:0,rebuilds:0,staticRebuilds:0,staticHits:0,dynamicRebuilds:0,staticCasters:0,movingCasters:0,bytes:0};
        if(!this.sunSprite.visible)return;
        const W=game.canvas.width,H=game.canvas.height,P=128,SW=W+2*P,SH=H+2*P,res=Math.min(.5,1024/Math.max(W,H)),size=W+':'+H+':'+res;
        if(this.sunSize!==size){this.sunTarget?.destroy(true);this.sunTarget=r.target(PIXI.RenderTexture.create({width:W,height:H,resolution:res}),'sun-composite-target');this.sunSize=size;this.sunKey=null;this.sunSprite.texture=this.sunTarget;}
        // An overscanned world mask scrolls with the camera within a 64px cell.
        // Minute-by-minute sun changes are quantized below a world pixel for
        // ordinary building heights; illumination strength remains continuous.
        const q=v=>Math.round(v*512)/512,dx=q(S.dx*S.len),dy=q(S.dy*S.len),ox=Math.floor(r.world.x/64)*64,oy=Math.floor(r.world.y/64)*64;
        const B={left:(-P-ox)/view.zoom,right:(W+P-ox)/view.zoom,top:(-P-oy)/view.zoom,bottom:(H+P-oy)/view.zoom};
        const buildings=game._queryRenderBuildings({left:B.left-360,right:B.right+360,top:B.top-360,bottom:B.bottom+360},this.sunCandidates||(this.sunCandidates=[])).map(e=>e.item).filter(b=>b.isV2&&b.sections&&b.visible!==false);
        const foliage=game._queryRenderFoliage({left:B.left-120,right:B.right+120,top:B.top-120,bottom:B.bottom+120},this.sunFoliage||(this.sunFoliage=[])).map(e=>e.item).filter(f=>!f.dead&&f.visible!==false);
        const signature=[SW,SH,view.zoom,ox,oy,dx,dy];
        for(const b of buildings)signature.push(b.x,b.y,b.w,b.h,b.floors,b.roundR,...b.sections.flatMap(s=>[s.x,s.y,s.w,s.h]));
        for(const f of foliage)signature.push(f.x,f.y,f.size,f.type,foliageCanopyY(f));
        const staticKey=signature.join(':'),sr=Math.min(.5,1024/Math.max(SW,SH)),staticSize=[SW,SH,sr].join(':');
        if(this.sunStaticSize!==staticSize){this.sunStaticTarget?.destroy(true);this.sunStaticTarget=r.target(PIXI.RenderTexture.create({width:SW,height:SH,resolution:sr}),'sun-static-target');this.sunStaticSize=staticSize;this.sunStaticKey=null;}
        if(this.sunStaticKey!==staticKey){
            const c=this.sunStaticContext;c.begin();c.canvas=game.canvas;c.setTransform(view.zoom,0,0,view.zoom,ox+P,oy+P);c.fillStyle='#fff';c.beginPath();let count=0;
            const poly=pts=>{pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();count++;};
            for(const b of buildings){
                if(b.roundR)b._leanFaces();const height=Math.min(b.floors,CONFIG.BUILDINGS.MAX_FLOORS)*CONFIG.BUILDINGS.FLOOR_HEIGHT;
                const key=[b.x,b.y,b.w,b.h,height,dx,dy,b.roundR,...b.sections.flatMap(s=>[s.x,s.y,s.w,s.h])].join(':');let rec=this.sunHulls.get(b);
                if(rec?.key!==key){rec={key,hulls:b.sections.map((s,i)=>{const fp=b._footprint(s,i);return nativeSunHull(fp.concat(fp.map(([x,y])=>[x+dx*height,y+dy*height])));})};this.sunHulls.set(b,rec);}
                for(const hull of rec.hulls)poly(hull);
            }
            for(const f of foliage){
                const size=f.size||1,height=(f.type==='bush'?8:34)*size,rad=(f.type==='bush'?12:f.type==='palm'?17:19)*size,rot=Math.atan2(dy,dx),N=S.len>.6?4:1;
                for(let i=N===1?1:0;i<=N;i++){const t=i/N,cx=f.x+dx*height*t,cy=foliageCanopyY(f)+dy*height*t,rr=rad*(.6+.4*t),rx=rr*(1+S.len*.25*t);c.moveTo(cx+rx*Math.cos(rot),cy+rx*Math.sin(rot));c.ellipse(cx,cy,rx,rr*.8,rot,0,Math.PI*2);}count++;
            }
            c.fill();r.renderer.render(c.root,{renderTexture:this.sunStaticTarget,clear:true});this.sunStaticKey=staticKey;this.sunStaticCasters=count;this.sunRevision=(this.sunRevision||0)+1;this.sunStats.staticRebuilds++;
        }else this.sunStats.staticHits++;
        const cars=[...new Set([...(game.traffic?.vehicles||[]),game.car,game.ownedCar,game.deliveryVehicle].filter(Boolean))].filter(e=>e.visible!==false&&e.length&&e.x>=V.left-80&&e.x<=V.right+80&&e.y>=V.top-80&&e.y<=V.bottom+80);
        const fire=game.projectiles.some(p=>p.isFireball&&p.active!==false)||(game._fireTrail||[]).length;
        const dynamicKey=[this.sunRevision,r.world.x,r.world.y,...cars.flatMap(e=>[e.x,e.y,e.angle,e.length,e.width,e.model]),fire?_frameTime:0].join(':');
        if(this.sunKey!==dynamicKey){
            const c=this.sunContext;c.begin();c.canvas=game.canvas;
            const n=c.node(PIXI.Sprite);n.texture=this.sunStaticTarget;n.alpha=1;n.blendMode=PIXI.BLEND_MODES.NORMAL;n.position.set(r.world.x-ox-P,r.world.y-oy-P);n.width=SW;n.height=SH;
            c.current=null;c.setTransform(view.zoom,0,0,view.zoom,r.world.x,r.world.y);c.fillStyle='#fff';c.beginPath();
            for(const e of cars){
                const ca=Math.cos(e.angle||0),sa=Math.sin(e.angle||0),height=e.model==='truck'||/suv/.test(e.model)?17:13,points=[];
                for(const [a,b]of [[1,1],[1,-1],[-1,-1],[-1,1]]){const x=e.x+a*(e.length/2-3)*ca-b*(e.width/2-2)*sa,y=e.y+a*(e.length/2-3)*sa+b*(e.width/2-2)*ca;points.push([x,y],[x+dx*height,y+dy*height]);}
                nativeSunHull(points).forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();
            }
            c.fill();if(fire){c.globalCompositeOperation='destination-out';game._drawFireLights(c,'hole',(x,y,rad)=>x+rad>V.left&&x-rad<V.right&&y+rad>V.top&&y-rad<V.bottom);}
            r.renderer.render(c.root,{renderTexture:this.sunTarget,clear:true});this.sunKey=dynamicKey;this.sunStats.rebuilds++;this.sunStats.dynamicRebuilds++;
        }
        this.sunStats.staticCasters=this.sunStaticCasters||0;this.sunStats.movingCasters=cars.length;this.sunStats.casters=this.sunStats.staticCasters+cars.length;
        this.sunSprite.position.set(-r.world.x/view.zoom,-r.world.y/view.zoom);this.sunSprite.scale.set(1/view.zoom);this.sunFilter.uniforms.strength=.62*strength;
        this.sunStats.bytes=[this.sunTarget,this.sunStaticTarget].reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0);
    }
    invalidate(){this.sunKey=this.sunStaticKey=this.roofTileKey=null;for(const c of this.contexts)for(const g of c.gradients)g.key=null;this.reflections.invalidate();}
    clear(){for(const rec of this.pads.values())rec.node.destroy();for(const rec of this.glass.values())rec.node.destroy();for(const rec of this.roofs.values())for(const mesh of rec.meshes)mesh.destroy();this.labels.destroy();this.sunStaticContext.destroy();this.sunContext.destroy();this.cloudContext.destroy();this.windowHole.destroy();this.windowColor.destroy();this.roofTile?.destroy(true);this.roofTileMesh?.destroy();this.roofTileStage?.destroy();this.sunStaticTarget?.destroy(true);this.sunTarget?.destroy(true);this.sunSprite.destroy();this.sunFilter.destroy();this.reflections.clear();this.floor.destroy();this.glassStage.destroy();}
}
