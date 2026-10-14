// Wet material masks and reflected light/detail remain in GPU render targets.
class NativeReflectionImage extends PIXI.Mesh{
    constructor(){super(nativeSurfaceGeometry(),PIXI.Shader.from(NATIVE_SURFACE_VERTEX,`
        precision highp float;varying vec2 uv;uniform sampler2D image;uniform float opacity;
        void main(){vec4 c=texture2D(image,uv);float a=max(c.a,max(c.r,max(c.g,c.b)));gl_FragColor=vec4(c.rgb,a)*opacity;}`,{image:PIXI.Texture.EMPTY,opacity:1}));}
}
class NativeWetReflections{
    constructor(owner,floor){
        this.owner=owner;this.root=new PIXI.Container();floor.addChildAt(this.root,0);
        this.puddle=new NativeVectorContext(owner);this.mask=new NativeVectorContext(owner);this.light=new NativeVectorContext(owner);this.detail=new NativeVectorContext(owner);this.ripple=new NativeVectorContext(owner);
        [this.puddle,this.mask,this.light,this.detail].forEach((c,i)=>c.label=['wet-ground','wet-mask','reflected-lights','reflected-detail'][i]);
        this.screen=new PIXI.Container();this.lightSprite=new PIXI.Sprite();this.lightSprite.blendMode=PIXI.BLEND_MODES.ADD;this.detailSprite=new PIXI.Sprite();
        this.root.addChild(this.puddle.root,this.ripple.root,this.screen);this.screen.addChild(this.detailSprite,this.lightSprite);
        this.targets=[];this.captures=new Map();this.stats={};
        const makeFilter=()=>new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            uniform vec4 inputSize;uniform vec4 outputFrame;uniform vec2 viewport;uniform sampler2D wetMask;uniform float clock;uniform float rain;uniform float shimmer;
            void main(){vec2 screen=outputFrame.xy+vTextureCoord*inputSize.xy;float band=floor(screen.y/viewport.y*30.);
                float dx=(sin(clock*2.1+band*.9)*(1.2+rain*3.2)+sin(clock*5.3+band*2.7)*(1.2+rain*3.2)*.35*rain)*shimmer;
                vec2 point=screen-vec2(dx,0.);vec4 c=texture2D(uSampler,vTextureCoord-vec2(dx*inputSize.z,0.));
                float inside=step(0.,point.x)*(1.-step(viewport.x,point.x));
                gl_FragColor=c*texture2D(wetMask,point/viewport).a*.95*inside;
            }`,{viewport:new Float32Array(2),wetMask:PIXI.Texture.EMPTY,clock:0,rain:0,shimmer:1});
        this.lightFilter=makeFilter();this.detailFilter=makeFilter();this.light.root.filters=[this.lightFilter];this.detail.root.filters=[this.detailFilter];
    }
    get contexts(){return [this.puddle,this.mask,this.light,this.detail,this.ripple];}
    invalidate(){this.maskKey=null;for(const rec of this.captures.values())rec.last=-Infinity;}
    bytes(){return this.targets.reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0)+this.captures.size*192*192*4+[this.roomGlow,this.liveTarget].filter(Boolean).reduce((n,t)=>n+t.baseTexture.realWidth*t.baseTexture.realHeight*4,0);}
    allocate(W,H,q){
        const res=Math.min(q==='medium'?.25:.5,1024/Math.max(W,H)),detailRes=q==='ultra'?Math.min(1,1536/Math.max(W,H)):res,key=[W,H,res,detailRes].join(':');if(this.size===key)return;
        this.releaseTargets();this.size=key;this.targets=[res,res,detailRes].map(resolution=>PIXI.RenderTexture.create({width:W,height:H,resolution,scaleMode:PIXI.SCALE_MODES.LINEAR}));
        [this.maskTarget,this.lightTarget,this.detailTarget]=this.targets;this.lightSprite.texture=this.lightTarget;this.detailSprite.texture=this.detailTarget;this.maskKey=null;
    }
    releaseTargets(){this.lightSprite.texture=this.detailSprite.texture=PIXI.Texture.EMPTY;for(const t of this.targets)t.destroy(true);this.targets=[];this.size=null;this.maskKey=null;this.owner.lighting.uniforms.reflectionMap=PIXI.Texture.EMPTY;}
    sync(game,view,V){
        const start=performance.now(),r=this.owner,L=r.layers,q=game.reflectQuality(),wet=game._wetHere(),surf=game._surfaces();
        const wants=L.wetSurfaces||L.reflectionLights||L.reflectionDetail||L.puddleRipples||L.reflectionProps||L.reflectionFoliage;
        this.stats={active:false,quality:q,wet,puddles:0,lights:0,buildings:0,detail:0,sharedBodies:0,bodyCaptures:0,dropped:0,maskRefreshes:0,props:0,foliage:0,liveBuildings:0,bytes:this.bytes()};
        this.root.visible=!!(wants&&q&&(wet>=.02||surf));r.lighting.uniforms.reflectionGain=0;this.puddle.begin();this.ripple.begin();this.ripple.root.visible=false;
        if(!this.root.visible){this.releaseTargets();this.trim(true);this.roomGlow?.destroy(true);this.roomGlow=null;this.liveTarget?.destroy(true);this.liveTarget=null;this.stats.bytes=0;this.stats.cpuMs=performance.now()-start;return;}
        const W=game.canvas.width,H=game.canvas.height;
        const near=(x,y,pad=0)=>x>V.left-pad&&x<V.right+pad&&y>V.top-160-pad&&y<V.bottom+pad;
        this.screen.position.set(-r.world.x/view.zoom,-r.world.y/view.zoom);this.screen.scale.set(1/view.zoom);
        const setup=c=>{c.begin();c.canvas=game.canvas;c.setTransform(view.zoom,0,0,view.zoom,r.world.x,r.world.y);};
        setup(this.mask);const mask=this.mask,puddle=this.puddle,boxes=[];
        const rect=(x,y,w,h,k)=>{if(!near(x+w/2,y+h/2,Math.max(w,h)))return;mask.fillStyle='rgba(255,255,255,'+k+')';mask.fillRect(x,y,w,h);boxes.push([x,y,x+w,y+h]);};
        if(wet>=.02){
            if(game.activeMap.id==='hub_949')for(const road of game.traffic?.network?.roads||[]){if(!near(road.x+road.w/2,road.y+road.h/2,Math.max(road.w,road.h)))continue;mask.fillStyle='rgba(255,255,255,'+(REFLECT.ROAD*Math.min(1,wet*1.3)).toFixed(3)+')';mask.beginPath();Poly.trace(mask,road.getCorners());mask.fill();boxes.push([road.x,road.y,road.x+road.w,road.y+road.h]);}
            for(const p of game.activeMap.pavements||[]){if(!near(p.x+p.w/2,p.y+p.h/2,Math.max(p.w,p.h)))continue;mask.fillStyle='rgba(255,255,255,'+(REFLECT.PAVE*Math.min(1,wet*1.3)).toFixed(3)+')';if(p.poly){mask.beginPath();Poly.trace(mask,p.poly);mask.fill();}else mask.fillRect(p.x,p.y,p.w,p.h);boxes.push([p.x,p.y,p.x+p.w,p.y+p.h]);}
        }
        if(surf){for(const [x,y,w,h,k]of surf.rects)rect(x,y,w,h,k);
            mask.globalCompositeOperation='destination-out';mask.fillStyle='#fff';for(const [x,y,w,h]of surf.cuts||[])mask.fillRect(x,y,w,h);for(const [x,y,rad]of surf.cutCircles||[]){mask.beginPath();mask.arc(x,y,rad,0,Math.PI*2);mask.fill();}
            mask.globalCompositeOperation='source-over';mask.fillStyle='rgba(255,255,255,.95)';for(const [x,y,rad]of surf.water||[]){mask.beginPath();mask.arc(x,y,rad,0,Math.PI*2);mask.fill();boxes.push([x-rad,y-rad,x+rad,y+rad]);}}
        const night=Math.min(1,Math.max(0,(game.getAmbientDarkness()-.15)/.35)),day=1-night;
        for(const {item:p}of wet>=.02?game._queryPuddleCandidates({...V,top:V.top-160},'nativePuddles'):[]){
            if(!near(p.x,p.y,p.r))continue;const k=game._puddleK(p,wet);if(k<=0)continue;const growth=.65+.35*k;
            _paintPuddleLobes(mask,p,growth,_puddleEdgeSprite('mask'),k);boxes.push([p.x-p.r,p.y-p.r,p.x+p.r,p.y+p.r]);this.stats.puddles++;
            if(L.wetSurfaces){_paintPuddleLobes(puddle,p,growth,_puddleEdgeSprite('night'),.55*k*night);_paintPuddleLobes(puddle,p,growth,_puddleEdgeSprite('day'),.3*k*day);_paintPuddleLobes(puddle,p,growth,_puddleEdgeSprite('rim'),.045*k*Math.min(1,wet*1.5));}
        }
        if(!boxes.length){this.root.visible=false;this.releaseTargets();this.trim(true);this.stats.bytes=0;this.stats.cpuMs=performance.now()-start;return;}
        this.allocate(W,H,q);
        this.boxes=boxes;this.stats.active=true;
        if(this.maskKey!==mask.hash){r.renderer.render(mask.root,{renderTexture:this.maskTarget,clear:true});this.maskKey=mask.hash;this.stats.maskRefreshes++;}
        setup(this.light);setup(this.detail);this.light.globalCompositeOperation='lighter';
        const onWet=(x,y,pad)=>boxes.some(b=>x+pad>b[0]&&x-pad<b[2]&&y+pad>b[1]&&y-pad<b[3]);
        const glow=(x,y,col,w,h,a)=>{if(this.stats.lights>=192){this.stats.dropped++;return;}if(a<.01||!near(x,y,h)||!onWet(x,y,Math.max(w,h)/2))return;this.light.globalAlpha=Math.min(1,a);this.light.drawImage(puffSprite(col),x-w/2,y-h/2,w,h);this.stats.lights++;};
        if(L.reflectionLights){
            if(night>.01){
                for(const {item:l}of game._queryLampCandidates({...V,left:V.left-220,right:V.right+220,top:V.top-380,bottom:V.bottom+220},'nativeReflectedLamps')){
                    if(this.stats.lights>=192){this.stats.dropped++;continue;}const scale=LAMP_TYPE_STYLE[l.lampType]?LAMP_POST_SCALE:1,height=REFLECT.LAMP_H*scale;
                    const k=game.roomSystem.lampLight(l)*lampFlicker(l)*night;if(k<.02)continue;const col=l.color||'#ffeebb';
                    glow(l.x,l.y+height*1.05,col,54*scale,70*scale,k);glow(l.x,l.y+height*1.05,'#ffffff',16*scale,22*scale,.8*k);glow(l.x,l.y+height*.95,col,24*scale,height*2.6,.7*k);
                    this.light.globalAlpha=.18*k;this.light.strokeStyle=col;this.light.lineWidth=2*scale;this.light.beginPath();this.light.moveTo(l.x,l.y+4*scale);this.light.lineTo(l.x,l.y+height*.9);this.light.stroke();
                }
                for(const car of new Set([...(game.traffic?.vehicles||[]),...(game.cars||[]),game.car,game.ownedCar,game.van,game.deliveryVehicle].filter(Boolean))){
                    if(car.dead||car.visible===false||!near(car.x,car.y,60))continue;const ca=Math.cos(car.angle||0),sa=Math.sin(car.angle||0),h=(car.length||40)/2,wd=(car.width||20)/3,f=(car.fade??1)*night;
                    for(const sign of [-1,1]){const px=-sa*wd*sign,py=ca*wd*sign;glow(car.x+ca*h+px,car.y+sa*h+py+14,car.headlightColor||'#fff2d6',12,44,.9*f);glow(car.x-ca*h+px,car.y-sa*h+py+12,'#ff3048',10,34,.75*f);}
                }
                if(q!=='medium'&&L.buildings)for(const [b,record]of r.nativeBuildings){
                    const gy=b.y+b.h;if(!record.glowTarget||!record.glowMesh?.visible||!near(b.x+b.w/2,gy,Math.max(200,b.w/2))||!onWet(b.x+b.w/2,gy+100,b.w))continue;
                    if(this.stats.buildings>=8){this.stats.dropped++;continue;}
                    const c=this.light;c.save();c.translate(0,gy);c.scale(1,-.75);c.translate(0,-gy);const node=c.node(NativeReflectionImage);node.shader.uniforms.image=record.glowTarget;node.shader.uniforms.opacity=.45;node.blendMode=PIXI.BLEND_MODES.ADD;
                    record.glowMesh.transform.updateLocalTransform();node.transform.setFromMatrix(c.matrix.clone().append(record.glowMesh.transform.localTransform));c.restore();this.stats.buildings++;
                }
            }
            if(surf?.glowShift&&L.glows){const c=this.light;c.current=null;const node=c.node(NativeReflectionImage);
                // One resident GPU snapshot of the already prepared room glow,
                // reused for its reflected pass; no second procedural art paint.
                if(!this.roomGlow||this.roomGlowSize!==W+':'+H){this.roomGlow?.destroy(true);this.roomGlow=PIXI.RenderTexture.create({width:W,height:H,resolution:Math.min(.5,1024/Math.max(W,H))});this.roomGlowSize=W+':'+H;}
                r.renderer.render(r.emissive,{renderTexture:this.roomGlow,clear:true,transform:new PIXI.Matrix(view.zoom,0,0,view.zoom,r.world.x,r.world.y)});
                node.shader.uniforms.image=this.roomGlow;node.shader.uniforms.opacity=2;node.blendMode=PIXI.BLEND_MODES.ADD;node.position.set(0,surf.glowShift*view.zoom);node.scale.set(W,H);c.current=null;
            }
            for(const f of game.muzzleFlashes||[])glow(f.x,f.y+16,f.color||'#fff1d0',40,60,.8);
            for(const p of game.projectiles||[])if(p.active!==false)glow(p.x,p.y+12,p.color||'#ffffff',12,26,.6);
        }
        if(L.reflectionLights&&L.reflectionLive&&L.glows&&night>.01&&q!=='medium'){
            const records=[...r.nativeBuildings].filter(([b,record])=>record.glowLive?.root.visible&&record.glowLive.root.children.length&&near(b.x+b.w/2,b.y+b.h,Math.max(200,b.w/2))&&onWet(b.x+b.w/2,b.y+b.h+100,b.w)).slice(0,4);
            if(records.length){const res=Math.min(.5,512/Math.max(W,H)),needed=Math.ceil(W*res)*Math.ceil(H*res)*4,old=this.liveTarget?this.liveTarget.baseTexture.realWidth*this.liveTarget.baseTexture.realHeight*4:0;
                if(this.bytes()-old+needed<=24*1048576){if(!this.liveTarget||this.liveSize!==[W,H,res].join(':')){this.liveTarget?.destroy(true);this.liveTarget=PIXI.RenderTexture.create({width:W,height:H,resolution:res});this.liveSize=[W,H,res].join(':');}
                    for(let i=0;i<records.length;i++){const [b,record]=records[i],gy=b.y+b.h,transform=new PIXI.Matrix(view.zoom,0,0,view.zoom,r.world.x,r.world.y).append(new PIXI.Matrix(1,0,0,-.75,0,gy*1.75));r.renderer.render(record.glowLive.root,{renderTexture:this.liveTarget,clear:i===0,transform});this.stats.liveBuildings++;}
                    const node=this.light.node(NativeReflectionImage);node.shader.uniforms.image=this.liveTarget;node.shader.uniforms.opacity=.45;node.blendMode=PIXI.BLEND_MODES.ADD;node.position.set(0,0);node.scale.set(W,H);
                }else this.stats.dropped+=records.length;
            }
        }
        if(L.reflectionProps&&L.furniture&&surf?.mirror)for(const [p,record]of r.props){
            const w=p.width||p.w||24,h=p.height||p.h||24,x=p.x+w/2,y=p.y+h;
            if(p.visible===false||!near(x,y,Math.max(w,h))||!onWet(x,y,Math.max(w,h)))continue;if(this.stats.props>=8){this.stats.dropped++;continue;}
            const c=this.detail;c.save();c.translate(0,y);c.scale(1,-.75);c.translate(x,-h/2);c.rotate(p.angle||0);const node=c.node(PIXI.Sprite);node.texture=record.texture;node.alpha=.42;node.transform.setFromMatrix(c.matrix.clone().append(new PIXI.Matrix(1,0,0,1,-record.texture.width/2,-record.texture.height/2)));c.restore();this.stats.props++;
        }
        if(L.reflectionFoliage&&L.streetDetails)for(const {item:f}of game._queryRenderFoliage({...V,top:V.top-360,bottom:V.bottom+260},this.foliageCandidates||(this.foliageCandidates=[]))){
            if(f.visible===false||f.dead||!Number.isFinite(f.size))continue;const bush=f.type==='bush',palm=f.type==='palm',sway=Math.sin(_gameTimeSec*2+(f.phaseOffset||0))*(game.weather.wind||.3)*8*(f.swayMultiplier??1)*(game.weather.windDirection||1),cx=f.x+sway*(bush?.6:palm?.3:1),cy=foliageCanopyY(f),refY=f.y-.8*(cy-f.y);
            if(!near(cx,refY,100)||!onWet(cx,refY,100))continue;if(this.stats.foliage>=12){this.stats.dropped++;continue;}
            const art=floraSprite(f.type,f.size,f._variant??Math.floor((f.phaseOffset||0)*.637)%4),c=this.detail;c.save();c.globalAlpha=.52;c.translate(0,f.y);c.scale(1,-.8);
            if(palm){c.translate(cx,cy-f.y);c.rotate(sway*.012);c.drawImage(art.cv,-art.w/2,-art.w/2);}else{c.translate(0,-f.y);c.drawImage(art.cv,cx-art.w/2,cy-art.w/2);}c.restore();this.stats.foliage++;
        }
        const movers=game._ultraReflectionMovers(near),groups=new Map();
        const visit=node=>{if(node._nativeEntity)groups.set(node._nativeEntity,node);for(const child of node.children||[])visit(child);};visit(r.peopleContext.root);
        if(L.reflectionDetail)for(const m of movers){
            if(this.stats.detail>=12){this.stats.dropped++;continue;}if(!onWet(m.x,m.y+20,100))continue;
            if(m.e===game.player&&!L.player||m.kind==='car'&&!L.vehicles||m.e!==game.player&&m.kind!=='car'&&!L.people)continue;
            if(m.kind==='car'){const c=this.detail,car=m.e;c.save();c.globalAlpha=.58*(car.fade??1);c.translate(0,car.y+(car.width||20)*.55);c.scale(1,-.8);c.translate(car.x,-(car.width||20)*.55);c.rotate(-(car.angle||0));c.scale(1,-1);
                const art=carSprite(car),P=CAR_ART.PAD;c.drawImage(art.cv,-art.L/2-P,-art.W/2-P,art.L+P*2,art.W+P*2);c.restore();this.stats.detail++;continue;}
            const group=groups.get(m.e),body=r.nativeCasters.bodies.get(m.e),crowd=group?.children.find(n=>n instanceof NativeCrowdPoseMesh&&n.visible);
            let texture=m.e===game.player?r.actorTexture:body?.texture,frames=body?.frames,blend=body?.blend||0,size=body?.size||192,angle=body?.angle??m.e.angle??0;
            if(crowd){texture=crowd.shader.uniforms.atlas;frames=[...crowd.shader.uniforms.frames];blend=crowd.shader.uniforms.blend;size=112;crowd.transform.updateLocalTransform();angle=Math.atan2(crowd.transform.localTransform.b,crowd.transform.localTransform.a);}
            if(!texture&&group){let rec=this.captures.get(m.e);if(!rec&&this.captures.size<16){rec={target:PIXI.RenderTexture.create({width:192,height:192,resolution:1}),last:-Infinity};this.captures.set(m.e,rec);}
                if(rec){rec.used=r.frameId;if(_frameTime-rec.last>=45&&this.stats.bodyCaptures<6){const transform=new PIXI.Matrix().append(new PIXI.Matrix(1,0,0,1,96,96)).append(new PIXI.Matrix(Math.cos(angle),-Math.sin(angle),Math.sin(angle),Math.cos(angle),0,0)).append(new PIXI.Matrix(1,0,0,1,-m.e.x,-m.e.y));
                        r.renderer.render(group,{renderTexture:rec.target,clear:true,transform});rec.last=_frameTime;this.stats.bodyCaptures++;}if(Number.isFinite(rec.last))texture=rec.target;}
            }
            const c=this.detail;c.save();const gy=m.e.y+12;c.translate(m.e.x,gy);c.scale(1,-.8);c.translate(0,-12);c.rotate(-angle);c.scale(1,-1);
            if(texture){let node;if(frames){node=c.node(NativeCrowdPoseMesh);node.shader.uniforms.atlas=texture;node.shader.uniforms.frames.set(frames);node.shader.uniforms.blend=blend;node.shader.uniforms.opacity=.58;}else{node=c.node(PIXI.Sprite);node.texture=texture;node.alpha=.58*(m.e===game.player?r.playerSprite.alpha:1);}
                node.transform.setFromMatrix(c.matrix.clone().append(new PIXI.Matrix(1,0,0,1,-size/2,-size/2)));this.stats.sharedBodies++;this.stats.detail++;
            }else{c.fillStyle=m.col||'#b48cff';c.globalAlpha=.25;c.beginPath();c.ellipse(0,0,6,18,0,0,Math.PI*2);c.fill();this.stats.dropped++;}
            c.restore();
        }
        if(L.reflectionLights){
            if(L.reflectionDetail||L.reflectionProps||L.reflectionFoliage){
                // Reuse the exact reflected art alpha to interrupt emitted light.
                // Independent nodes share textures, never display-object parents.
                for(const source of this.detail.pool){if(!source.visible||source.parent!==this.detail.root)continue;let node;
                    if(source instanceof NativeCrowdPoseMesh){node=this.light.node(NativeCrowdPoseMesh);const a=source.shader.uniforms,b=node.shader.uniforms;b.atlas=a.atlas;b.frames.set(a.frames);b.blend=a.blend;b.opacity=a.opacity*.85;}
                    else if(source instanceof PIXI.Sprite){node=this.light.node(PIXI.Sprite);node.texture=source.texture;node.alpha=source.alpha*.85;}
                    else continue;
                    source.transform.updateLocalTransform();node.transform.setFromMatrix(source.transform.localTransform);node.blendMode=PIXI.BLEND_MODES.ERASE;
                }
            }else{this.light.globalCompositeOperation='destination-out';this.light.fillStyle='#000';for(const m of movers)game._reflShape(this.light,m,.85);}
        }
        if(L.puddleRipples&&game._ripples?.length){const ripple=this.ripple;ripple.root.visible=true;game._drawRipples(ripple,night>.5);
            if(!this.rippleFilter){this.rippleFilter=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;uniform vec4 inputSize;uniform vec4 outputFrame;uniform sampler2D wetMask;uniform vec2 viewport;
                void main(){vec2 p=(outputFrame.xy+vTextureCoord*inputSize.xy)/viewport;gl_FragColor=texture2D(uSampler,vTextureCoord)*texture2D(wetMask,p).a;}`,{wetMask:this.maskTarget,viewport:new Float32Array([W,H])});this.rippleFilter.resolution=.5;}
            this.rippleFilter.uniforms.wetMask=this.maskTarget;this.rippleFilter.uniforms.viewport.set([W,H]);ripple.root.filters=[this.rippleFilter];ripple.root.filterArea=new PIXI.Rectangle(0,0,W,H);
        }
        for(const f of [this.lightFilter,this.detailFilter]){f.uniforms.viewport.set([W,H]);f.uniforms.wetMask=this.maskTarget;f.uniforms.clock=L.decorAnimation?_gameTimeSec:0;f.uniforms.rain=game.weather.isRaining?game.weather.intensity:0;f.uniforms.shimmer=q==='medium'?0:1;}
        const area=new PIXI.Rectangle(0,0,W,H);this.light.root.filterArea=this.detail.root.filterArea=area;
        this.lightSprite.visible=L.reflectionLights;this.detailSprite.visible=L.reflectionDetail||L.reflectionProps||L.reflectionFoliage;
        if(L.reflectionLights)r.renderer.render(this.light.root,{renderTexture:this.lightTarget,clear:true});if(this.detailSprite.visible)r.renderer.render(this.detail.root,{renderTexture:this.detailTarget,clear:true});
        r.lighting.uniforms.reflectionMap=this.lightTarget;r.lighting.uniforms.reflectionGain=L.reflectionLights?.85:0;r.trimBuildingImages(this.light);r.trimBuildingImages(this.detail);this.trim();
        this.stats.bytes=this.bytes();this.stats.cpuMs=performance.now()-start;
    }
    trim(all=false){for(const [key,rec]of this.captures)if(all||rec.used<this.owner.frameId-120){rec.target.destroy(true);this.captures.delete(key);}}
    clear(){this.releaseTargets();this.trim(true);this.roomGlow?.destroy(true);this.liveTarget?.destroy(true);for(const c of this.contexts)c.destroy();this.lightSprite.destroy();this.detailSprite.destroy();this.lightFilter.destroy();this.detailFilter.destroy();this.rippleFilter?.destroy();this.screen.destroy();this.root.destroy();}
}
