// Independently testable apartment passes. Light masks are GPU render textures;
// CPU work updates small geometry buffers, never a per-frame Canvas light image.
const NATIVE_LAYER_LABELS={floor:'Floor art',backdrop:'City backdrop',windows:'Window glass',walls:'Walls',doors:'Doors',fixtures:'Lamp fixtures',furniture:'Furniture',player:'Player',
    lighting:'Lighting',colorWash:'Colored light wash',decorLights:'Decor light sources',wallOcclusion:'Wall occlusion',propShadows:'Furniture shadows',
    playerShadows:'Player shadows',indicators:'Player marker',furnitureHints:'Grab hints',contactShadows:'Contact shadows',roomVeil:'Room veil',nightTint:'Night tint',
    glows:'Emissive glows',softShadows:'Soft edges',bloom:'Bloom',atmosphere:'Atmosphere',decorAnimation:'Decor animation',characterAnimation:'Character animation',shapeShadows:'Shape-accurate shadows',linens:'Curtains',shadowDetail:'High-resolution shadows',projectiles:'Bullet / fireball FX',weaponFx:'Muzzle / weapon FX',casings:'Spent casings',impactParticles:'Impact particles',decals:'Ground decals',overlays:'Combat cues',transientLights:'Shot lighting',fxGlow:'FX glow',buildings:'City buildings / roofs',people:'People / enemies',vehicles:'Vehicles',streetDetails:'Street details',worldMarkers:'World markers',rainDrops:'Rain drops',rainSplashes:'Rain splashes',crowdSprites:'GPU crowd animation cache',buildingCache:'GPU building glow cache',rainQuads:'GPU rain quads',depthSort:'Scene depth sorting',npcShadows:'NPC shape shadows',vehicleShadows:'Vehicle shadows',liveBackdrop:'Live veranda city'};
const NATIVE_LAYER_BASELINE={floor:true,backdrop:true,walls:true,furniture:true,player:true,lighting:true,characterAnimation:true};
const NATIVE_LAYER_DEFAULTS=Object.fromEntries(Object.keys(NATIVE_LAYER_LABELS).map(k=>[k,true]));
Object.assign(NativeWebGLRenderer.prototype,{
    setLayers(values){
        let changed=false;for(const [k,v] of Object.entries(values))if(k in this.layers&&this.layers[k]!==!!v){this.layers[k]=!!v;changed=true;}
        if(!changed)return;
        this.resetSample();
        if(this.onLayersChanged)this.onLayersChanged();
    },
    preset(name){
        const shadows=new Set(['colorWash','decorLights','wallOcclusion','propShadows','playerShadows','contactShadows','indicators','furnitureHints','roomVeil','nightTint','glows','doors','windows','fixtures','shapeShadows','linens','shadowDetail','npcShadows','vehicleShadows']);
        this.setLayers(Object.fromEntries(Object.keys(this.layers).map(k=>[k,name==='canvas'||!!NATIVE_LAYER_BASELINE[k]||(name==='shadows'&&shadows.has(k))])));
    },
    initLayers(){
        this.shadowCache=new Map();this.shadowStats={};this.layerStages={};
        this.backdrop=new PIXI.Container();this.floorArt=new PIXI.Container();this.contacts=new PIXI.Container();
        this.veil=new PIXI.Container();this.emissive=new PIXI.Container();
        this.world.addChildAt(this.backdrop,1);this.world.addChildAt(this.floorArt,2);this.world.addChildAt(this.contacts,3);
        this.windows=new PIXI.Container();this.doors=new PIXI.Container();this.world.addChildAt(this.windows,4);
        this.world.addChildAt(this.doors,this.world.getChildIndex(this.objects));this.doorNodes=new Map();
        this.fixtures=new PIXI.Container();this.world.addChildAt(this.fixtures,this.world.getChildIndex(this.objects));this.fixtureNodes=new Map();this.fixtureAssets=new Map();
        // Emissive passes follow scene lighting; they must not be multiplied by
        // the darkness filter. The room veil sits between lighting and glows.
        this.postWorld=new PIXI.Container();this.veilDisplay=new PIXI.Sprite();this.postWorld.addChild(this.veilDisplay,this.emissive);this.stage.addChild(this.postWorld);
        this.marker=new PIXI.Graphics();this.marker.lineStyle(1,0x08080c,.9).beginFill(0xffffff,.95).drawPolygon([0,-3,3,0,0,3,-3,0]).endFill();this.postWorld.addChild(this.marker);
        this.hints=new PIXI.Container();this.hintOutline=new PIXI.Graphics();this.hints.addChild(this.hintOutline);this.postWorld.addChild(this.hints);
        this.chevrons=Array.from({length:4},()=>{const g=new PIXI.Graphics();g.lineStyle(.8,0x28140a,.6).beginFill(0xffe2a0).drawPolygon([-5,-7,4,0,-5,7,-2,0]).endFill();this.hints.addChild(g);return g;});
        this.contactSprites=new Map();this.roomSprites=new Map();this.areaCookies=new Map();
        const hole=document.createElement('canvas');hole.width=hole.height=256;const hc=hole.getContext('2d'),hg=hc.createRadialGradient(128,128,0,128,128,128);
        for(const [p,a] of [[0,1],[.04,1],[1,0]])hg.addColorStop(p,'rgba(255,255,255,'+a+')');
        hc.fillStyle=hg;hc.fillRect(0,0,256,256);this.holeGradient=PIXI.Texture.from(hole);
        const decor=document.createElement('canvas');decor.width=decor.height=128;const dc=decor.getContext('2d'),dg=dc.createRadialGradient(64,64,0,64,64,64);
        for(const [p,a]of [[0,1],[.45,.45],[1,0]])dg.addColorStop(p,'rgba(255,255,255,'+a+')');dc.fillStyle=dg;dc.fillRect(0,0,128,128);this.decorGradient=PIXI.Texture.from(decor);
        this.linenContext=new NativeVectorContext(this);this.linenStage=this.linenContext.root;this.world.addChild(this.linenStage);
        this.glassContext=new NativeVectorContext(this);this.windows.addChild(this.glassContext.root);
        this.glowContext=new NativeVectorContext(this);this.emissive.addChild(this.glowContext.root);
        this.fixtureContext=new NativeVectorContext(this);this.fixtures.addChild(this.fixtureContext.root);
        this.actorHalo=new NativeActorHaloMesh();this.postWorld.addChild(this.actorHalo);
        this.softFilter=new PIXI.BlurFilter(1.2,1,.5);this.softFilter.padding=0;
        this.sceneBloom=new NativeSceneBloomFilter();
        this.atmosphereFilter=new PIXI.Filter(undefined,`
            precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            uniform vec4 inputSize;uniform vec4 outputFrame;uniform vec2 viewport;uniform float clock;uniform vec4 tint;
            void main(){vec4 c=texture2D(uSampler,vTextureCoord);vec2 p=(outputFrame.xy+vTextureCoord*inputSize.xy)/viewport;
                gl_FragColor=vec4(mix(c.rgb,tint.rgb*c.a,tint.a),c.a);}`,{viewport:new Float32Array(2),clock:0,tint:new Float32Array([1,.627,.196,.04])});
        this.atmosphereFilter.padding=0;
    },
    clearLayers(){
        for(const r of this.shadowCache.values()){r.stage.destroy({children:true});r.texture.destroy(true);if(r.dynamicStage){r.dynamicStage.destroy({children:true});r.dynamicTexture.destroy(true);}}
        this.shadowCache.clear();if(this.veilTarget){this.veilTarget.destroy(true);this.veilTarget=null;}this.veilDisplay.texture=PIXI.Texture.EMPTY;this.lighting.uniforms.veilMap=PIXI.Texture.EMPTY;this.veilKey=null;
        for(const ctx of [this.linenContext,this.glassContext,this.glowContext,this.fixtureContext]){ctx.destroy();}
        this.linenContext=new NativeVectorContext(this);this.linenStage=this.linenContext.root;this.world.addChild(this.linenStage);
        this.glassContext=new NativeVectorContext(this);this.glowContext=new NativeVectorContext(this);this.fixtureContext=new NativeVectorContext(this);
        for(const c of [this.backdrop,this.floorArt,this.windows,this.doors,this.fixtures,this.contacts,this.veil,this.emissive]){
            for(const child of c.removeChildren())child.destroy({children:true});
        }
        for(const r of this.fixtureNodes.values())if(!r.node.destroyed)r.node.destroy({children:true});
        this.contactSprites.clear();this.roomSprites.clear();this.doorNodes.clear();this.fixtureNodes.clear();this.fixtureAssets.clear();this.areaCookies.clear();
    },
    shadowBytes(){let bytes=0;for(const r of this.shadowCache.values())for(const t of [r.texture,r.dynamicTexture].filter(Boolean))bytes+=t.baseTexture.realWidth*t.baseTexture.realHeight*4;return bytes;},
    areaCookie(game,source){
        const key=[source.w,source.h,source.round,source.soft].join(':');let r=this.areaCookies.get(source);
        if(r&&r.key===key)return r.texture;
        if(r){this.textures.delete(r.texture);r.texture.destroy(true);}
        const scale=.35,texture=this.bake(source.w*scale,source.h*scale,c=>{
            c.scale(scale,scale);game._paintSoftLight(c,{src:source,x:source.w/2,y:source.h/2,r:Math.hypot(source.w,source.h)/2},'hole');
        },'light');this.areaCookies.set(source,{key,texture});return texture;
    },
    // Split the original floor painting into GPU-resident, independently visible assets.
    buildMap(game){
        const capture=this.qualityRebuildPending?this.capture:null;this.clearMap();this.capture=capture;this.qualityRebuildPending=false;this.map=game.activeMap;const map=this.map,top=map.cameraBounds?.top||0;
        if(map.id!=='hub_949')this.floor.addChild(new PIXI.Sprite(this.bake(map.width,map.height,c=>{
            c.fillStyle=map.floorColor;c.fillRect(0,0,map.width,map.height);
            for(const z of map.zones||[]){c.fillStyle=z.color;c.fillRect(z.x,z.y,z.w,z.h);
                if(z.texture==='wood'){c.fillStyle='rgba(0,0,0,.15)';for(let py=z.y;py<z.y+z.h;py+=24)c.fillRect(z.x,py,z.w,1);c.fillStyle='rgba(255,255,255,.03)';c.fillRect(z.x,z.y,z.w,z.h);}
                else if(z.texture==='carpet'){c.fillStyle='rgba(0,0,0,.06)';c.fillRect(z.x,z.y,z.w,4);c.fillRect(z.x,z.y+z.h-4,z.w,4);c.fillRect(z.x,z.y,4,z.h);c.fillRect(z.x+z.w-4,z.y,4,z.h);}}
        })));
        if(map.id==='apt_949'){
            if(!game._cityView)game._cityView=game._makeAptCityView();const city=game._cityView;
            city.bakeBase();city.dx=city.dy=0;
            const backdrop=new PIXI.Sprite(this.bake(city.w,city.h,c=>{c.translate(-city.x,-city.y);city._stampLayer(c,city.base,city.res);}));
            backdrop.position.set(city.x,city.y);this.backdrop.addChild(backdrop);
        }
        if(map.id!=='hub_949')this.floorArt.addChild(new PIXI.Sprite(this.bake(map.width,map.height,c=>{if(map.id==='apt_949')game.drawApartmentInterior(c);else INTERIOR_ART[map.id]?.floor?.(game,c);game.roomSystem.drawFloors(c);})));
        this.initWorld();
        this.windows.addChild(this.glassContext.root);
        this.walls.beginFill(0x222222).lineStyle(1,0x00f3ff,.3);
        for(const w of map.walls||[])this.walls.drawRect(w.x,w.y,w.w,w.h);this.walls.endFill();
        this.playerSprite=new PIXI.Sprite();this.playerSprite.anchor.set(.5);this.objects.addChild(this.playerSprite);
        this.emissive.addChild(this.glowContext.root);this.fixtures.addChild(this.fixtureContext.root);const roofIndex=this.world.getChildIndex(this.roofStage),effectIndex=this.world.getChildIndex(this.projectileContext.root);this.world.setChildIndex(this.projectileContext.root,roofIndex-(effectIndex<roofIndex?1:0));this.message('');
    },
    syncLayers(game,view){
        const start=performance.now(),L=this.layers;
        this.postWorld.position.copyFrom(this.world.position);this.postWorld.scale.copyFrom(this.world.scale);
        this.syncBackdrop(game);
        this.floor.visible=this.floorArt.visible=L.floor;this.backdrop.visible=L.backdrop;this.walls.visible=L.walls;
        this.windows.visible=L.windows;this.doors.visible=L.doors;
        if(L.windows){const ctx=this.glassContext;ctx.begin();for(const win of game.roomSystem.windows||[])win.draw(ctx,game.dayCycle().daylight);}
        this.linenStage.visible=L.linens;
        if(L.linens){const ctx=this.linenContext;ctx.begin();for(const linen of game.roomSystem.linens||[])linen.draw(ctx,game.weather?.wind??.3,game.weather?.windDirection??1,L.decorAnimation?_gameTimeSec:0);}
        if(L.doors)this.syncDoors(game);
        this.fixtures.visible=L.fixtures;if(L.fixtures)this.syncFixtures(game);
        this.syncDecor(game,view);
        this.contacts.visible=L.contactShadows;
        if(L.contactShadows){
            for(const p of [game.player,...(game.props||[])]){
                let s=this.contactSprites.get(p);if(!s){s=new PIXI.Sprite(this.lightGradient);s.anchor.set(.5);s.tint=0;s.alpha=.35;this.contacts.addChild(s);this.contactSprites.set(p,s);}
                const player=p===game.player;s.position.set(p.x+(player?0:p.width/2),p.y+(player?0:p.height/2));
                s.width=player?26:p.width+10;s.height=player?18:p.height+10;s.rotation=p.angle||0;
                s.visible=p.visible!==false&&(player?L.player:L.furniture)&&Math.abs(s.x-view.x)<game.canvas.width/(2*view.zoom)+(p.width||24)+80&&Math.abs(s.y-view.y)<game.canvas.height/(2*view.zoom)+(p.height||24)+80;
            }
            for(const [p,s] of this.contactSprites)if(p!==game.player&&!this.props.has(p)){s.destroy();this.contactSprites.delete(p);}
        }
        this.veil.visible=true;this.veilDisplay.visible=L.roomVeil&&game.roomSystem.active&&(!L.lighting||game.getAmbientDarkness()<.5);
        if(L.roomVeil&&game.roomSystem.active)for(const [id,r] of Object.entries(game.roomSystem.rooms)){
            let g=this.roomSprites.get(id);if(!g){g=new PIXI.Graphics();g.beginFill(0x100822);
                for(const q of r.rects)g.drawRect(q.x,q.y,q.w,q.h);g.endFill();this.veil.addChild(g);this.roomSprites.set(id,g);}
            g.alpha=Math.min(1,(1-r.vis)*ROOM_LOOK.VEIL_MAX);
        }
        if(L.roomVeil&&game.roomSystem.active){
            if(!this.veilTarget){this.veilTarget=PIXI.RenderTexture.create({width:game.activeMap.width+48,height:game.activeMap.height+48,resolution:1/ROOM_LOOK.FEATHER,scaleMode:PIXI.SCALE_MODES.LINEAR});
                this.veilDisplay.texture=this.veilTarget;this.veilDisplay.position.set(-24,-24);this.veil.position.set(24,24);this.lighting.uniforms.veilMap=this.veilTarget;}
            const key=[...this.roomSprites.values()].map(g=>g.alpha.toFixed(3)).join(':');if(key!==this.veilKey){this.renderer.render(this.veil,{renderTexture:this.veilTarget,clear:true});this.veilKey=key;}
        }
        this.lighting.uniforms.veilGain=L.roomVeil&&game.roomSystem.active&&L.lighting&&game.getAmbientDarkness()>=.5?1:0;
        this.lighting.uniforms.inverseWorld.set([-this.world.x/view.zoom,-this.world.y/view.zoom,1/view.zoom]);
        if(this.veilTarget)this.lighting.uniforms.veilSize.set([this.veilTarget.width,this.veilTarget.height]);
        this.emissive.visible=L.glows;
        if(L.glows){const ctx=this.glowContext,city=game._cityView,clock=_frameTime;ctx.begin();
            try{if(!L.liveBackdrop||!L.backdrop)game._cityView=null;if(!L.decorAnimation)_frameTime=0;INTERIOR_ART[game.activeMap.id]?.glow?.(game,ctx);}finally{game._cityView=city;_frameTime=clock;}}
        this.actorHalo.visible=L.glows&&L.player&&game._playerGlowOn();
        if(this.actorHalo.visible){this.actorHalo.shader.uniforms.body=this.actorTexture;this.actorHalo.shader.uniforms.blur=9*(game._renderScale||1)/view.zoom/192;
            this.actorHalo.position.set(game.player.x,game.player.y);this.actorHalo.rotation=game.player.angle||0;}
        const markerOffset=(Math.max(16*view.zoom,10*(game._renderScale||1))+5*(game._renderScale||1))/view.zoom;
        this.marker.visible=L.indicators&&L.player&&game.player.visible!==false;
        this.marker.position.set(game.player.x,game.player.y+markerOffset);this.marker.scale.set(1/view.zoom);
        const F=game.furniture,p=F.target||F.cand;this.hints.visible=L.furnitureHints&&L.furniture&&!!p;
        if(p){const c=F._c(p),key=p.width+':'+p.height;
            if(this.hintKey!==key){this.hintOutline.clear().lineStyle(1.4,0xe8c27a,.7).drawRect(-p.width/2-3,-p.height/2-3,p.width+6,p.height+6);this.hintKey=key;}
            this.hintOutline.position.set(c.x,c.y);this.hintOutline.rotation=p.angle||0;this.hintOutline.alpha=F.state==='idle' ? .65 : 1;
            for(let i=0;i<4;i++){const g=this.chevrons[i];g.visible=F.state==='choose'||F.state==='walk';const h=F._handle(p,i);
                g.position.set(h.x,h.y);g.rotation=(p.angle||0)+i*Math.PI/2+Math.PI;g.alpha=i===F.side?1:.75;g.scale.set(i===F.side?1.35:1);}
        }
        const t=_frameTime/1000;
        const filters=[];if(L.bloom)filters.push(this.sceneBloom);if(L.atmosphere)filters.push(this.atmosphereFilter);
        this.stage.filters=filters.length?filters:null;
        this.stage.filterArea=this.world.filterArea;this.atmosphereFilter.uniforms.viewport.set([game.canvas.width,game.canvas.height]);
        const tint={amber:[1,.627,.196,.04],violet:[.471,.235,.784,.04],crimson:[.784,.196,.275,.03],teal:[.196,.706,.784,.03]}[GameSettings.atmosphereTint]||[0,0,0,0];
        this.atmosphereFilter.uniforms.tint.set(tint);
        this.atmosphereFilter.uniforms.clock=Math.floor(t*30)/30;
        this.layerStages={sceneLayersMs:performance.now()-start};
    },
    casters(game){
        const out=[];
        if(this.layers.wallOcclusion)for(const d of game.roomSystem.doors||[])for(const leaf of d.leaves()){
            const [ax,ay,bx,by]=leaf.map(v=>Math.round(v/2)*2),len=Math.hypot(bx-ax,by-ay);if(len<2)continue;
            const nx=-(by-ay)/len*d.halfThick,ny=(bx-ax)/len*d.halfThick;
            out.push({owner:d,x:(ax+bx)/2,y:(ay+by)/2,w:Math.abs(bx-ax)+2*d.halfThick,h:Math.abs(by-ay)+2*d.halfThick,
                points:[[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]],elevation:200,full:true,key:'door:'+[ax,ay,bx,by].join(',')});
        }
        if(this.layers.propShadows)for(const p of game.props||[])if(p.visible!==false&&p.hasCollision&&!p.noNav){
            const angle=Math.round((p.angle||0)/.02)*.02,c=Math.cos(angle),s=Math.sin(angle);
            const x=Math.round((p.x+p.width/2)/2)*2,y=Math.round((p.y+p.height/2)/2)*2,w=p.width,h=p.height;
            const points=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([a,b])=>[x+a*c-b*s,y+a*s+b*c]);
            out.push({owner:p,x,y,w,h,points,elevation:Math.min(24,Math.max(6,Math.min(w,h)*.5)),key:[x,y,w,h,angle].join(',')});
        }
        if(this.layers.playerShadows&&!this.layers.shapeShadows&&game.player.visible!==false){const p=game.player,x=p.x,y=p.y;
            out.push({owner:p,x,y,w:18,h:18,elevation:24,key:x+','+y,points:Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*9,y+Math.sin(i*Math.PI/6)*9])});}
        return out;
    },
    shadowTexture(source,casters,walls,wallKey){
        const start=performance.now(),radius=source.radius,density=Math.min(this.layers.shadowDetail ? .5 : .25,(this.layers.shadowDetail?256:128)/(radius*2));
        const nearby=casters.filter(c=>c.owner!==source.owner&&Math.hypot(c.x-source.x,c.y-source.y)<radius+Math.max(c.w,c.h));
        const key=[source.x,source.y,radius,source.elevation??84,density,source.w||0,source.h||0,source.cookie?.baseTexture.uid||0,this.layers.wallOcclusion?wallKey:'open',...nearby.map(c=>c.key)].join('|');
        let r=this.shadowCache.get(source.owner);
        if(r&&r.key===key){this.shadowStats.hits++;return r.texture;}
        if(!r||r.radius!==radius||r.density!==density){
            if(r){r.stage.destroy({children:true});r.texture.destroy(true);if(r.dynamicStage){r.dynamicStage.destroy({children:true});r.dynamicTexture.destroy(true);}}
            const stage=new PIXI.Container(),sprite=new PIXI.Sprite(this.lightGradient),mask=new PIXI.Graphics(),shadow=new PIXI.Graphics();
            sprite.position.set(radius,radius);sprite.anchor.set(.5);sprite.width=sprite.height=radius*2;
            shadow.blendMode=PIXI.BLEND_MODES.ERASE;stage.addChild(sprite,mask,shadow);
            const texture=PIXI.RenderTexture.create({width:radius*2,height:radius*2,resolution:density,scaleMode:PIXI.SCALE_MODES.LINEAR});
            r={stage,sprite,mask,shadow,texture,radius,density};this.shadowCache.set(source.owner,r);
        }
        r.sprite.texture=source.cookie||((source.wash??.08)===.08?this.holeGradient:this.decorGradient);
        r.sprite.width=source.w||radius*2;r.sprite.height=source.h||radius*2;
        const staticKey=[source.x,source.y,radius,this.layers.wallOcclusion?wallKey:'open'].join('|');
        if(r.staticKey!==staticKey){
            r.mask.clear();r.sprite.mask=null;r.mask.visible=false;
            if(this.layers.wallOcclusion){
                const poly=computeVisibilityPoly(source.x,source.y,radius,walls,{aMin:0,aMax:Math.PI*2,arcStep:.18});
                r.mask.visible=true;r.mask.beginFill(0xffffff).drawPolygon(poly.flatMap(p=>[p.x-source.x+radius,p.y-source.y+radius])).endFill();r.sprite.mask=r.mask;
            }
            r.staticKey=staticKey;
        }
        r.shadow.clear();
        for(const c of nearby){
            const d=Math.hypot(c.x-source.x,c.y-source.y);if(d<.01||d>=radius)continue;
            const crosses=c.points.map(([x,y],i)=>{const [nx,ny]=c.points[(i+1)%c.points.length];return (nx-x)*(source.y-y)-(ny-y)*(source.x-x);});
            if(crosses.every(v=>v>=0)||crosses.every(v=>v<=0))continue;
            const len=c.full?radius-d:Math.min(120,radius-d,d*c.elevation/Math.max(1,(source.elevation??84)-c.elevation)),scale=1+len/d;
            const hull=DynamicShadows._hull(c.points.flatMap(([x,y])=>[[x,y],[source.x+(x-source.x)*scale,source.y+(y-source.y)*scale]]));
            const local=points=>points.flatMap(([x,y])=>[x-source.x+radius,y-source.y+radius]);
            r.shadow.beginFill(0xffffff,c.full?1:.85).drawPolygon(local(hull));
            r.shadow.beginHole().drawPolygon(local(c.points.map(([x,y])=>[c.x+(x-c.x)*.98,c.y+(y-c.y)*.98]))).endHole().endFill();
            this.shadowStats.pairs++;
        }
        this.renderer.render(r.stage,{renderTexture:r.texture,clear:true});r.key=key;
        this.shadowStats.rebuilds++;this.shadowStats.staticRebuilds++;this.layerStages.shadowRefreshMs=(this.layerStages.shadowRefreshMs||0)+performance.now()-start;
        return r.texture;
    },
    animatedShadowTexture(source,base,actor,walls=[]){
        const dx=actor.x-source.x,dy=actor.y-source.y,d=Math.hypot(dx,dy);
        if(d<1||d>=source.radius||!this.actorTexture)return base;
        if(this.layers.wallOcclusion&&(walls.some(w=>segCrossesRect(source.x,source.y,actor.x,actor.y,w.x,w.y,w.w,w.h))||
            (this.map&&game.roomSystem.doors.some(door=>door.leaves().some(([ax,ay,bx,by])=>segmentsCross(source.x,source.y,actor.x,actor.y,ax,ay,bx,by))))))return base;
        const start=performance.now(),r=this.shadowCache.get(source.owner);
        if(!r)return base;
        const key=[r.key,this.actorRevision,actor.x,actor.y,actor.angle||0].join('|');
        this.shadowStats.silhouettePairs++;
        if(r.dynamicKey===key){this.shadowStats.dynamicHits++;return r.dynamicTexture;}
        if(!r.dynamicStage){
            r.dynamicStage=new PIXI.Container();r.dynamicBase=new PIXI.Sprite(base);r.dynamicStage.addChild(r.dynamicBase);
            r.actorShadow=new NativeActorShadowMesh();r.dynamicStage.addChild(r.actorShadow);
            r.dynamicTexture=PIXI.RenderTexture.create({width:source.radius*2,height:source.radius*2,resolution:r.density,scaleMode:PIXI.SCALE_MODES.LINEAR});
        }
        r.dynamicBase.texture=base;r.dynamicBase.width=r.dynamicBase.height=source.radius*2;
        const len=Math.min(120,source.radius-d,d*24/Math.max(1,(source.elevation??84)-24)),u=r.actorShadow.shader.uniforms;
        u.body=this.actorTexture;u.direction.set([dx/d,dy/d]);u.rotation.set([Math.cos(actor.angle||0),Math.sin(actor.angle||0)]);
        u.stretch=1+len/CONFIG.HUMAN_SHADE.LAMP_SHADOW_DEPTH;u.offset=len/2;
        // Project the body's CPU geometry bounds, not its 192px padded texture
        // square. The fragment shader then touches only the useful silhouette.
        const b=this.actorBounds||{x:0,y:0,width:192,height:192},coords=[];
        for(const x of [b.x-96,b.x+b.width-96])for(const y of [b.y-96,b.y+b.height-96]){
            const wx=x*u.rotation[0]-y*u.rotation[1],wy=x*u.rotation[1]+y*u.rotation[0],along=wx*u.direction[0]+wy*u.direction[1],shift=along*(u.stretch-1)+u.offset;
            coords.push([wx+u.direction[0]*shift,wy+u.direction[1]*shift]);}
        const x0=Math.min(...coords.map(p=>p[0]))-2,y0=Math.min(...coords.map(p=>p[1]))-2,x1=Math.max(...coords.map(p=>p[0]))+2,y1=Math.max(...coords.map(p=>p[1]))+2;
        u.bounds.set([x0,y0,x1-x0,y1-y0]);r.actorShadow.position.set(dx+source.radius,dy+source.radius);
        this.renderer.render(r.dynamicStage,{renderTexture:r.dynamicTexture,clear:true});r.dynamicKey=key;
        this.shadowStats.rebuilds++;this.shadowStats.dynamicRebuilds++;
        this.layerStages.animatedShadowMs=(this.layerStages.animatedShadowMs||0)+performance.now()-start;
        return r.dynamicTexture;
    },
    syncDoors(game){
        for(const d of game.roomSystem.doors||[]){
            let record=this.doorNodes.get(d);
            if(!record){
                const node=d.type==='arch'?new PIXI.Sprite(this.bake(d.w+64,d.h+64,c=>{c.translate(32-d.x,32-d.y);d.draw(c);})):new PIXI.Graphics();
                if(d.type==='arch')node.position.set(d.x-32,d.y-32);this.doors.addChild(node);record={node,key:null};this.doorNodes.set(d,record);
            }
            if(d.type==='arch')continue;
            const g=record.node,key=[d.type,d.color,d.length,d.thickness,Math.round(d.openAmount*300),Math.round((d.jolt||0)*10)].join(':');
            if(key!==record.key){g.clear();const color=PIXI.Color.shared.setValue(d.color).toNumber();
                if(d.type==='sliding'){
                    const horizontal=d.orientation==='H',off=d.openAmount*((horizontal?d.w:d.h)/2+4),j=d.jolt||0;
                    g.beginFill(color);
                    if(horizontal){g.drawRect(d.x-off,d.y+j,d.w/2-2,d.h);g.drawRect(d.x+d.w/2+2+off,d.y+j,d.w/2-2,d.h);}
                    else {g.drawRect(d.x+j,d.y-off,d.w,d.h/2-2);g.drawRect(d.x+j,d.y+d.h/2+2+off,d.w,d.h/2-2);}g.endFill();
                    g.beginFill(0xffffff,.08);
                    if(horizontal){g.drawRect(d.x-d.w/2,d.y-1,d.w*2,1);g.drawRect(d.x-d.w/2,d.y+d.h,d.w*2,1);}
                    else {g.drawRect(d.x-1,d.y-d.h/2,1,d.h*2);g.drawRect(d.x+d.w,d.y-d.h/2,1,d.h*2);}g.endFill();
                }else {
                    g.beginFill(color).lineStyle(.8,0,.35).drawRect(0,-d.thickness/2,d.length,d.thickness).endFill();
                    g.lineStyle(0).beginFill(0xc9a46a).drawRect(d.length*.82,-d.thickness/2-2,5,2).drawRect(d.length*.82,d.thickness/2,5,2).endFill();
                    g.beginFill(0x8a7048).drawCircle(0,0,2.4).endFill();
                }record.key=key;
            }
            if(d.type==='hinged'){g.position.set(d.hx,d.hy);g.rotation=d.baseAngle+d.angle;}
        }
    },
    syncFixtures(game){
        const day=game.dayCycle(),v=game.view,particles=this.fixtureContext;particles.begin();
        const live=new Set(game.lamps||[]);
        for(const [lamp,r]of this.fixtureNodes)if(!live.has(lamp)){r.node.destroy({children:true});this.fixtureNodes.delete(lamp);}
        for(const lamp of live){
            const inView=lamp.visible!==false&&Math.abs(lamp.x-v.x)<=game.canvas.width/(2*v.zoom)+160&&Math.abs(lamp.y-v.y)<=game.canvas.height/(2*v.zoom)+160;
            let r=this.fixtureNodes.get(lamp);if(!inView){if(r)r.node.visible=false;continue;}
            const key=lamp.lampType+':'+lamp.color;let assets=this.fixtureAssets.get(key);
            if(!assets){assets=[];
                for(const on of [false,true])assets.push(this.bake(192,192,c=>{
                    const saved={angle:lamp.angle,k:lamp._lightK,forced:lamp._forcedOff,visible:lamp.visible,lod:_zoomLOD};
                    try{lamp.angle=0;lamp._lightK=1;lamp._forcedOff=false;lamp.visible=true;_zoomLOD=1;c.translate(96-lamp.x,96-lamp.y);lamp.draw(c,on?0:1);}
                    finally{lamp.angle=saved.angle;lamp._lightK=saved.k;lamp._forcedOff=saved.forced;lamp.visible=saved.visible;_zoomLOD=saved.lod;}
                },'fixture'));this.fixtureAssets.set(key,assets);}
            if(!r){r={node:new PIXI.Container(),off:new PIXI.Sprite(),on:new PIXI.Sprite(),particles:new PIXI.Graphics()};for(const s of [r.off,r.on]){s.anchor.set(.5);r.node.addChild(s);}r.node.addChild(r.particles);this.fixtures.addChild(r.node);this.fixtureNodes.set(lamp,r);}
            r.node.visible=true;r.node.zIndex=lamp.y;r.particles.clear();const dots=r.particles;
            lamp._lightK=game.roomSystem.lampLight(lamp)*lampFlicker(lamp);lamp._forcedOff=lamp._lightK<.02;
            const room=game.roomSystem.rooms[lamp._roomId],on=!lamp._forcedOff&&(room?.type!=='outdoor'||day.lampsOn),k=on?Math.min(1,lamp._lightK):0;
            r.off.texture=assets[0];r.on.texture=assets[1];r.off.visible=k<1;r.on.visible=k>0;r.on.alpha=k;
            for(const s of [r.off,r.on]){s.position.set(lamp.x,lamp.y);s.rotation=lamp.angle||0;}
            if(on&&_zoomLOD<1){
                const style=LAMP_TYPE_STYLE[lamp.lampType],bulbs=style?LAMP_STYLES[style].bulbs:[{x:0,y:0}];
                const time=((this.layers.decorAnimation?_frameTime:0)+lamp.animOffset)/1000;
                const c=Math.cos(lamp.angle||0),s=Math.sin(lamp.angle||0),scale=style?LAMP_POST_SCALE:1;
                for(const bulb of bulbs)for(let i=0;i<4;i++){
                    const angle=time*(.8+i*.2)+i*2,dist=12+Math.sin(time*2+i)*6,alpha=.4+Math.sin(time*5+i)*.4;
                    if(alpha>0){const x=(bulb.x+Math.cos(angle)*dist)*scale,y=(bulb.y+Math.sin(angle)*dist)*scale;
                        dots.beginFill(0xffffff,alpha).drawCircle(lamp.x+x*c-y*s,lamp.y+x*s+y*c,1.2*scale).endFill();}}

            }
        }
        this.fixtures.setChildIndex(particles.root,this.fixtures.children.length-1);
    },
    syncLighting(game,view){
        const start=performance.now(),L=this.layers;this.shadowStats={hits:0,rebuilds:0,staticRebuilds:0,dynamicRebuilds:0,dynamicHits:0,silhouettePairs:0,sources:0,pairs:0};
        this.world.filters=L.lighting?[this.lighting]:null;if(!L.lighting)return;
        const w=game.canvas.width,h=game.canvas.height;
        if(!this.lightTarget||this.lightSize!==w+':'+h){
            if(this.lightTarget)this.lightTarget.destroy(true);
            if(this.colorTarget)this.colorTarget.destroy(true);
            this.lightTarget=PIXI.RenderTexture.create({width:w,height:h,resolution:.5,scaleMode:PIXI.SCALE_MODES.LINEAR});this.lightSize=w+':'+h;
            this.colorTarget=PIXI.RenderTexture.create({width:w,height:h,resolution:.5,scaleMode:PIXI.SCALE_MODES.LINEAR});
            this.lightBase.clear().beginFill(0xffffff).drawRect(0,0,w,h).endFill();this.lighting.uniforms.lightMap=this.lightTarget;
            this.lighting.uniforms.colorMap=this.colorTarget;
        }
        const level=Math.round((1-Math.min(.85,Math.max(0,game.getAmbientDarkness())))*255);this.lightBase.tint=(level<<16)|(level<<8)|level;
        if(!this.skyLight){this.skyLight=new PIXI.Graphics();this.skyLight.blendMode=PIXI.BLEND_MODES.SCREEN;this.lightStage.addChildAt(this.skyLight,1);}
        const ambient=game.getAmbientDarkness(),sky=game.dayCycle().darkness,skyKey=[this.map.id,ambient,sky].join(':');
        if(this.skyKey!==skyKey){this.skyLight.clear();const a=ambient>0?1-Math.min(1,sky/ambient):0;
            this.skyLight.beginFill(0xffffff,a);for(const room of Object.values(game.roomSystem.rooms))if(room.type==='outdoor')for(const q of room.rects)this.skyLight.drawRect(q.x,q.y,q.w,q.h);this.skyLight.endFill();this.skyKey=skyKey;}
        this.skyLight.visible=true;this.skyLight.scale.set(view.zoom);this.skyLight.position.copyFrom(this.world.position);
        this.lightSprites.scale.set(view.zoom);this.lightSprites.position.copyFrom(this.world.position);
        const sources=(game.lamps||[]).filter(l=>l.visible!==false).map(l=>({owner:l,x:l.x,y:l.y,radius:l.lightRadius||l.radius||200,
            color:l.color||'#ffeebb',elevation:l.elevation??84,wash:.08,alpha:(game.activeMap.type==='outdoor'&&!game.dayCycle().lampsOn?0:1)*game.roomSystem.lampLight(l)*lampFlicker(l)*lampWake(l)*(l.intensity??1)}));
        if(L.decorLights){
            for(const p of game.props||[])if(p.visible!==false&&p.light){const c=p.getCenter(),q=p.light;
                sources.push({owner:p,x:c.x+(q.dx||0),y:c.y+(q.dy||0),radius:q.radius||Math.max(q.w||0,q.h||0)/2||180,
                    color:q.rgb?'rgb('+q.rgb+')':q.color||'#ffd2a0',elevation:q.elevation??44,wash:.22,flicker:q.flicker||0,alpha:(q.intensity??.8)*game.roomSystem.lightAt(c.x,c.y)});}
            for(const q of game.activeMap.softLights||[])sources.push({owner:q,x:q.x,y:q.y,radius:q.w?Math.hypot(q.w,q.h)/2:q.radius||180,
                w:q.w,h:q.h,cookie:q.w?this.areaCookie(game,q):null,
                color:q.rgb?'rgb('+q.rgb+')':q.color||'#ffd2a0',elevation:q.elevation??44,wash:.22,flicker:q.flicker||0,alpha:(q.intensity??.8)*game.roomSystem.lightAt(q.x,q.y)});
        }
        if(L.transientLights)sources.push(...this.transientSources);
        for(let i=sources.length-1;i>=0;i--){const q=sources[i];if(q.alpha<.005||Math.abs(q.x-view.x)>w/(2*view.zoom)+q.radius||Math.abs(q.y-view.y)>h/(2*view.zoom)+q.radius)sources.splice(i,1);}
        sources.sort((a,b)=>Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y));sources.length=Math.min(sources.length,L.decorLights?40:24);
        const occlusion=L.wallOcclusion||L.propShadows||L.playerShadows||L.npcShadows||L.vehicleShadows,casters=occlusion?this.casters(game):[],walls=getOccluders(game.activeMap);
        const wallKey=walls.map(w=>[w.x,w.y,w.w,w.h].join(',')).join(';');
        for(let i=0;i<this.lightSprites.children.length;i++){
            const s=this.lightSprites.children[i],source=sources[i];s.visible=!!source;if(!source)continue;
            s.texture=occlusion?this.shadowTexture(source,casters,walls,wallKey):source.cookie||((source.wash??.08)===.08?this.holeGradient:this.decorGradient);
            s.texture=this.multiShadowTexture(source,s.texture,game,walls);
            s.position.set(source.x,source.y);s.width=occlusion?source.radius*2:source.w||source.radius*2;s.height=occlusion?source.radius*2:source.h||source.radius*2;
            s.blendMode=PIXI.BLEND_MODES.SCREEN;const t=_frameTime/1000,pulse=(L.decorAnimation&&source.flicker) ? .82+.18*Math.sin(t*source.flicker+source.x*.7)*Math.sin(t*source.flicker*.37+source.y) : 1;
            s.tint=0xffffff;s.alpha=Math.min(1,Math.max(0,source.alpha*pulse));
        }
        // Visible lights touch the LRU; travelling across the city must not
        // retain every street lamp's targets for the rest of the session.
        for(const source of sources){const r=this.shadowCache.get(source.owner);if(r){this.shadowCache.delete(source.owner);this.shadowCache.set(source.owner,r);}}
        while(this.shadowCache.size>64||this.shadowBytes()>24*1048576){const owner=this.shadowCache.keys().next().value,r=this.shadowCache.get(owner);r.stage.destroy({children:true});r.texture.destroy(true);if(r.dynamicStage){r.dynamicStage.destroy({children:true});r.dynamicTexture.destroy(true);}this.shadowCache.delete(owner);}
        this.shadowStats.sources=sources.length;this.worldStats.casters=this.nativeCasters.report();
        this.lightStage.filters=L.softShadows?[this.softFilter]:null;
        this.lighting.uniforms.nightTint=L.nightTint?1:0;
        this.lighting.uniforms.viewport.set([this.lightTarget.width,this.lightTarget.height]);
        this.renderer.render(this.lightStage,{renderTexture:this.lightTarget,clear:true});
        this.lighting.uniforms.colorGain=L.colorWash ? game.getAmbientDarkness() : 0;
        if(L.colorWash){
            this.lightBase.visible=false;this.skyLight.visible=false;
            for(let i=0;i<sources.length;i++){const s=this.lightSprites.children[i];s.tint=PIXI.Color.shared.setValue(sources[i].color).toNumber();s.alpha*=sources[i].wash;s.blendMode=PIXI.BLEND_MODES.ADD;}
            this.renderer.render(this.lightStage,{renderTexture:this.colorTarget,clear:true});this.lightBase.visible=true;this.skyLight.visible=true;
        }
        this.layerStages.lightingMs=performance.now()-start;
    }
});
Object.defineProperty(NativeWebGLRenderer.prototype,'lightsOn',{get(){return this.layers.lighting;},set(v){this.setLayers({lighting:!!v});}});

// Match Canvas light bleed with GPU downscales at one third, sixth and twelfth
// resolution, then combine with the untouched full-resolution scene. Changing an effect never rasterizes the
// complete scene through Canvas. FilterPool retains temporary GPU allocations.
class NativeSceneBloomFilter extends PIXI.Filter{
    constructor(){
        super();this.padding=0;
        this.bright=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            void main(){vec4 c=texture2D(uSampler,vTextureCoord);gl_FragColor=vec4(min(vec3(1.0),c.rgb*1.5),c.a);}`);
        this.downsample=new PIXI.Filter();
        this.combine=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            uniform sampler2D scene;uniform sampler2D wide;uniform vec2 sceneScale;uniform vec2 wideScale;
            void main(){vec4 c=texture2D(scene,vTextureCoord*sceneScale);gl_FragColor=vec4(c.rgb+texture2D(uSampler,vTextureCoord).rgb*.15+texture2D(wide,vTextureCoord*wideScale).rgb*.08,c.a);}`,
            {scene:PIXI.Texture.EMPTY,wide:PIXI.Texture.EMPTY,sceneScale:new Float32Array(2),wideScale:new Float32Array(2)});
    }
    apply(manager,input,output,clearMode){
        const targets=[manager.getFilterTexture(input,1/3),manager.getFilterTexture(input,1/6),manager.getFilterTexture(input,1/12)];
        const u=manager.globalUniforms.uniforms,saved={};
        for(const key of ['inputSize','inputPixel','inputClamp'])saved[key]=u[key].slice();
        const frame=input.filterFrame||u.outputFrame;
        const configure=t=>{
            const w=t.width,h=t.height,pw=t.baseTexture.realWidth,ph=t.baseTexture.realHeight;
            u.inputSize.set([w,h,1/w,1/h]);u.inputPixel.set([pw,ph,1/pw,1/ph]);
            u.inputClamp.set([.5/pw,.5/ph,frame.width/w-.5/pw,frame.height/h-.5/ph]);manager.globalUniforms.update();
        };
        try{
            configure(input);manager.applyFilter(this.bright,input,targets[0],PIXI.CLEAR_MODES.CLEAR);
            configure(targets[0]);manager.applyFilter(this.downsample,targets[0],targets[1],PIXI.CLEAR_MODES.CLEAR);
            configure(targets[1]);manager.applyFilter(this.downsample,targets[1],targets[2],PIXI.CLEAR_MODES.CLEAR);
            configure(targets[1]);this.combine.uniforms.scene=input;this.combine.uniforms.wide=targets[2];
            this.combine.uniforms.sceneScale.set([targets[1].width/input.width,targets[1].height/input.height]);
            this.combine.uniforms.wideScale.set([targets[1].width/targets[2].width,targets[1].height/targets[2].height]);
            manager.applyFilter(this.combine,targets[1],output,clearMode);
        }finally{
            for(const [key,value] of Object.entries(saved))u[key].set(value);manager.globalUniforms.update();
            for(const target of targets)manager.returnFilterTexture(target);
        }
    }
}

// Same affine silhouette stretch and body subtraction as DynamicShadows High,
// evaluated directly from the live GPU character target for each light.
class NativeActorShadowMesh extends PIXI.Mesh {
    constructor(){
        const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[-1,-1,1,-1,1,1,-1,1],2).addIndex([0,1,2,0,2,3]);
        const shader=PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;uniform vec4 bounds;varying vec2 q;
            void main(){q=(aVertexPosition+1.0)*.5*bounds.zw+bounds.xy;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(q,1.0)).xy,0.0,1.0);}`,
            `precision highp float;varying vec2 q;uniform sampler2D body;uniform vec2 direction;uniform vec2 rotation;uniform float stretch;uniform float offset;uniform float bodySize;uniform vec4 frameA;uniform vec4 frameB;uniform float blend;uniform float opacity;
            float sampleBody(vec2 world){vec2 local=vec2(world.x*rotation.x+world.y*rotation.y,-world.x*rotation.y+world.y*rotation.x);vec2 uv=(local+bodySize*.5)/bodySize;
                if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)return 0.0;return mix(texture2D(body,frameA.xy+uv*frameA.zw).a,texture2D(body,frameB.xy+uv*frameB.zw).a,blend);}
            void main(){float along=dot(q,direction);vec2 original=q+direction*((along-offset)/stretch-along);
                float alpha=sampleBody(original)*(1.0-sampleBody(q))*opacity;gl_FragColor=vec4(0.0,0.0,0.0,alpha);}`,
            {body:PIXI.Texture.EMPTY,bodySize:192,frameA:new Float32Array([0,0,1,1]),frameB:new Float32Array([0,0,1,1]),blend:0,opacity:.85,direction:new Float32Array(2),rotation:new Float32Array(2),stretch:1,offset:0,bounds:new Float32Array([-96,-96,192,192])});
        super(geometry,shader);this.blendMode=PIXI.BLEND_MODES.ERASE;
    }
}

class NativeActorHaloMesh extends PIXI.Mesh {
    constructor(){
        const geometry=new PIXI.Geometry().addAttribute('aVertexPosition',[-96,-96,96,-96,96,96,-96,96],2).addIndex([0,1,2,0,2,3]);
        const shader=PIXI.Shader.from(`precision highp float;attribute vec2 aVertexPosition;uniform mat3 projectionMatrix;uniform mat3 translationMatrix;varying vec2 uv;
            void main(){uv=(aVertexPosition+96.0)/192.0;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}`,
            `precision highp float;varying vec2 uv;uniform sampler2D body;uniform float blur;
            void main(){float a=0.0;for(int i=0;i<16;i++){float angle=float(i)*2.39996323;float r=sqrt((float(i)+.5)/16.0)*blur;
                a+=texture2D(body,uv+vec2(cos(angle),sin(angle))*r).a/16.0;}
                a=(1.0-(1.0-a)*(1.0-a))*(1.0-texture2D(body,uv).a)*.85;gl_FragColor=vec4(vec3(.886,.808,1.0)*a,a);}`,
            {body:PIXI.Texture.EMPTY,blur:.03});
        super(geometry,shader);
    }
}
