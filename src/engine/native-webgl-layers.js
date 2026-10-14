// Independently testable apartment passes. Light masks are GPU render textures;
// CPU work updates small geometry buffers, never a per-frame Canvas light image.
const NATIVE_LAYER_LABELS={floor:'Floor art',backdrop:'City backdrop',windows:'Window glass',walls:'Walls',doors:'Doors',fixtures:'Lamp fixtures',furniture:'Furniture',player:'Player',
    lighting:'Lighting',colorWash:'Colored light wash',decorLights:'Decor light sources',wallOcclusion:'Wall occlusion',propShadows:'Furniture shadows',
    playerShadows:'Player shadows',indicators:'Player marker',furnitureHints:'Grab hints',contactShadows:'Contact shadows',roomVeil:'Room veil',nightTint:'Night tint',
    glows:'Emissive glows',softShadows:'Soft edges',bloom:'Bloom',atmosphere:'Atmosphere',decorAnimation:'Decor animation'};
const NATIVE_LAYER_BASELINE={floor:true,backdrop:true,walls:true,furniture:true,player:true,lighting:true};
const NATIVE_LAYER_DEFAULTS=Object.fromEntries(Object.keys(NATIVE_LAYER_LABELS).map(k=>[k,true]));
Object.assign(NativeWebGLRenderer.prototype,{
    setLayers(values){
        let changed=false;for(const [k,v] of Object.entries(values))if(k in this.layers&&this.layers[k]!==!!v){this.layers[k]=!!v;changed=true;}
        if(!changed)return;
        this.capture=this.completedCapture=null;
        this.configurationId++;this.frames=[];this.warmFrames=15;this.lastStart=this.lastEnd=this.lastPanel=0;
        if(this.onLayersChanged)this.onLayersChanged();
    },
    preset(name){
        const shadows=new Set(['colorWash','decorLights','wallOcclusion','propShadows','playerShadows','contactShadows','indicators','furnitureHints','roomVeil','nightTint','glows','doors','windows','fixtures']);
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
        this.postWorld=new PIXI.Container();this.postWorld.addChild(this.veil,this.emissive);this.stage.addChild(this.postWorld);
        this.marker=new PIXI.Graphics();this.marker.lineStyle(1,0x08080c,.9).beginFill(0xffffff,.95).drawPolygon([0,-3,3,0,0,3,-3,0]).endFill();this.postWorld.addChild(this.marker);
        this.hints=new PIXI.Container();this.hintOutline=new PIXI.Graphics();this.hints.addChild(this.hintOutline);this.postWorld.addChild(this.hints);
        this.chevrons=Array.from({length:4},()=>{const g=new PIXI.Graphics();g.lineStyle(.8,0x28140a,.6).beginFill(0xffe2a0).drawPolygon([-5,-7,4,0,-5,7,-2,0]).endFill();this.hints.addChild(g);return g;});
        this.contactSprites=new Map();this.roomSprites=new Map();this.areaCookies=new Map();this.glowSprites=[];
        const hole=document.createElement('canvas');hole.width=hole.height=256;const hc=hole.getContext('2d'),hg=hc.createRadialGradient(128,128,0,128,128,128);
        for(const [p,a] of [[0,1],[.3,.85],[.7,.35],[1,0]])hg.addColorStop(p,'rgba(255,255,255,'+a+')');
        hc.fillStyle=hg;hc.fillRect(0,0,256,256);this.holeGradient=PIXI.Texture.from(hole);
        const halo=document.createElement('canvas');halo.width=halo.height=128;const ac=halo.getContext('2d'),ag=ac.createRadialGradient(64,64,0,64,64,64);
        for(const [p,a] of [[0,0],[.32,0],[.42,.8],[1,0]])ag.addColorStop(p,'rgba(255,255,255,'+a+')');
        ac.fillStyle=ag;ac.fillRect(0,0,128,128);this.haloGradient=PIXI.Texture.from(halo);
        this.softFilter=new PIXI.BlurFilter(1.2,1,.5);this.softFilter.padding=0;
        this.sceneBloom=new NativeSceneBloomFilter();
        this.atmosphereFilter=new PIXI.Filter(undefined,`
            precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            uniform vec4 inputSize;uniform vec4 outputFrame;uniform vec2 viewport;uniform float clock;
            void main(){vec4 c=texture2D(uSampler,vTextureCoord);vec2 p=(outputFrame.xy+vTextureCoord*inputSize.xy)/viewport;
                vec2 q=(p-.5)*1.5;float vignette=clamp(1.0-dot(q,q)*.25,.72,1.0);
                float grain=fract(52.9829189*fract(dot(p*viewport,vec2(.06711,.00583))+clock*.07))-.5;
                gl_FragColor=vec4(mix(c.rgb,vec3(1.0,.627,.196)*c.a,.04)*vignette+grain*.012*c.a,c.a);}`,{viewport:new Float32Array(2),clock:0});
        this.atmosphereFilter.padding=0;
    },
    clearLayers(){
        for(const r of this.shadowCache.values()){r.stage.destroy({children:true});r.texture.destroy(true);}
        this.shadowCache.clear();
        for(const c of [this.backdrop,this.floorArt,this.windows,this.doors,this.fixtures,this.contacts,this.veil,this.emissive]){
            for(const child of c.removeChildren())child.destroy({children:true});
        }
        this.contactSprites.clear();this.roomSprites.clear();this.doorNodes.clear();this.fixtureNodes.clear();this.fixtureAssets.clear();this.areaCookies.clear();this.glowSprites=[];
    },
    shadowBytes(){let bytes=0;for(const r of this.shadowCache.values())bytes+=r.texture.baseTexture.realWidth*r.texture.baseTexture.realHeight*4;return bytes;},
    areaCookie(game,source){
        const key=[source.w,source.h,source.round,source.soft].join(':');let r=this.areaCookies.get(source);
        if(r&&r.key===key)return r.texture;
        if(r){this.textures.delete(r.texture);r.texture.destroy(true);}
        const scale=.35,texture=this.bake(source.w*scale,source.h*scale,c=>{
            c.scale(scale,scale);game._paintSoftLight(c,{src:source,x:source.w/2,y:source.h/2,r:Math.hypot(source.w,source.h)/2},'hole');
        });this.areaCookies.set(source,{key,texture});return texture;
    },
    // Split the original floor painting into GPU-resident, independently visible assets.
    buildMap(game){
        this.clearMap();this.map=game.activeMap;const map=this.map,top=map.cameraBounds?.top||0;
        this.floor.addChild(new PIXI.Sprite(this.bake(map.width,map.height,c=>{
            c.fillStyle=map.floorColor;c.fillRect(0,0,map.width,map.height);
            for(const z of map.zones||[]){c.fillStyle=z.color;c.fillRect(z.x,z.y,z.w,z.h);}
        })));
        const backdrop=new PIXI.Sprite(this.bake(map.width,map.height-top,c=>{c.translate(0,-top);game.drawApartmentBackdrop(c);}));
        backdrop.y=top;this.backdrop.addChild(backdrop);
        this.floorArt.addChild(new PIXI.Sprite(this.bake(map.width,map.height,c=>game.drawApartmentInterior(c))));
        if(game.roomSystem.active)this.windows.addChild(new PIXI.Sprite(this.bake(map.width,map.height,c=>game.roomSystem.drawWindows(c,game.dayCycle().darkness))));
        this.walls.beginFill(0x222222).lineStyle(1,0x00f3ff,.3);
        for(const w of map.walls||[])this.walls.drawRect(w.x,w.y,w.w,w.h);this.walls.endFill();
        this.playerSprite=new PIXI.Sprite();this.playerSprite.anchor.set(.5);this.objects.addChild(this.playerSprite);
        this.buildGlows(game);this.message('');
    },
    glow(x,y,r,color,alpha=1,owner=null){
        const sprite=new PIXI.Sprite(this.lightGradient);sprite.anchor.set(.5);sprite.position.set(x,y);sprite.width=sprite.height=r*2;
        sprite.tint=color;sprite.blendMode=PIXI.BLEND_MODES.ADD;this.emissive.addChild(sprite);
        const record={sprite,x,y,r,alpha,owner};this.glowSprites.push(record);return record;
    },
    buildGlows(game){
        for(const [x,y,r] of [[991,232,28],[1115,232,28],[307,439,34],[700,700,34],[109,463,34],[231,759,22],[350,759,22],[469,759,22]]){
            this.glow(x,y,r,0xffd2a0,.45);this.glow(x,y,2.5,0xffecd2,.95);
        }
        const hearth=HEARTHS.apt_949;this.fireGlow=this.glow(hearth.x,hearth.y,60,0xff8c3c,.5);
        for(const [x,y] of [[433,864],[460,877]])this.glow(x,y,12,0xff4628,.55);
        for(const [x,y] of [[312,859],[329,873]])this.glow(x,y,12,0x5a96ff,.5);
        for(const [x,y] of [[1248,619],[1256,612],[1368,619]])this.glow(x,y,12,0xffc882,.6);
        for(let s=0;s<8;s++)for(let i=0;i<=8;i++){const u=i/8;this.glow(20+s*170+170*u,14+Math.sin(u*Math.PI)*12,9,0xffd6a0,.5);}
        for(const p of game.props||[])if(p.decorType==='apt_side'&&p.light){const c=p.getCenter();this.glow(c.x-2,c.y-1,30,0xffd2a0,.5,p);}
        this.halo=this.glow(0,0,26,0xe2ceff,.6);this.halo.sprite.texture=this.haloGradient;
        this.halo.sprite.width=this.halo.sprite.height=52;
    },
    propCanvas(p,time){
        const pad=48,w=p.width||p.w||24,h=p.height||p.h||24;
        return this.bake(w+pad*2,h+pad*2,c=>{
            c.translate(pad-p.x,pad-p.y);const angle=p.angle,mode=PropPass.mode,stamp=PropSprites.stamp,seg=PropPass.seg,clock=_frameTime;
            try{p.angle=0;PropPass.mode=1;PropPass.seg=()=>true;PropSprites.stamp=()=>false;_frameTime=time;p.draw(c);}
            finally{p.angle=angle;PropPass.mode=mode;PropSprites.stamp=stamp;PropPass.seg=seg;_frameTime=clock;}
        });
    },
    syncLayers(game,view){
        const start=performance.now(),L=this.layers;
        this.postWorld.position.copyFrom(this.world.position);this.postWorld.scale.copyFrom(this.world.scale);
        this.floor.visible=this.floorArt.visible=L.floor;this.backdrop.visible=L.backdrop;this.walls.visible=L.walls;
        this.windows.visible=L.windows;this.doors.visible=L.doors;
        if(L.doors)this.syncDoors(game);
        this.fixtures.visible=L.fixtures;if(L.fixtures)this.syncFixtures(game);
        const animated=new Set(['apt_fireplace','apt_stove','apt_craft','apt_tub','apt_plant','apt_telescope']);
        for(const [p,r] of this.props){
            r.sprite.visible=L.furniture&&p.visible!==false;
            if(L.decorAnimation&&animated.has(p.decorType)){
                if(!r.animation){r.animation=[r.texture];const period=PROP_LOOP[p.decorType]?.period||Math.PI*2/2.1;
                    for(let i=1;i<8;i++)r.animation.push(this.propCanvas(p,period*1000*i/8));r.period=period;
                    // Pixi normally uploads on first use. Prewarm all phase images
                    // so later animation frames never trigger deferred bitmap uploads.
                    for(const texture of r.animation)this.renderer.texture.bind(texture);}
                const phase=Math.floor((_frameTime/1000%r.period)/r.period*8);r.sprite.texture=r.animation[Math.max(0,phase)];
            }else r.sprite.texture=r.texture;
        }
        this.contacts.visible=L.contactShadows;
        if(L.contactShadows){
            for(const p of [game.player,...(game.props||[])]){
                let s=this.contactSprites.get(p);if(!s){s=new PIXI.Sprite(this.lightGradient);s.anchor.set(.5);s.tint=0;s.alpha=.35;this.contacts.addChild(s);this.contactSprites.set(p,s);}
                const player=p===game.player;s.position.set(p.x+(player?0:p.width/2),p.y+(player?0:p.height/2));
                s.width=player?26:p.width+10;s.height=player?18:p.height+10;s.rotation=p.angle||0;
                s.visible=p.visible!==false&&(player?L.player:L.furniture);
            }
            for(const [p,s] of this.contactSprites)if(p!==game.player&&!this.props.has(p)){s.destroy();this.contactSprites.delete(p);}
        }
        this.veil.visible=L.roomVeil;
        if(L.roomVeil&&game.roomSystem.active)for(const [id,r] of Object.entries(game.roomSystem.rooms)){
            let g=this.roomSprites.get(id);if(!g){g=new PIXI.Graphics();g.beginFill(0x080513);
                for(const q of r.rects)g.drawRect(q.x,q.y,q.w,q.h);g.endFill();this.veil.addChild(g);this.roomSprites.set(id,g);}
            g.alpha=Math.min(1,(1-r.vis)*ROOM_LOOK.VEIL_MAX);
        }
        this.emissive.visible=L.glows;
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
        for(const g of this.glowSprites){
            let x=g.x,y=g.y;if(g.owner){const c=g.owner.getCenter();x=c.x-2;y=c.y-1;}
            const k=g===this.halo?(game._playerGlowOn()&&L.player?1:0):game.roomSystem.lightAt(x,y);
            const pulse=L.decorAnimation ? .85+.15*Math.sin(t*2.1+x*.01) : 1;
            g.sprite.alpha=g.alpha*k*pulse;
            if(g===this.halo){x=game.player.x;y=game.player.y;}
            g.sprite.position.set(x,y);
        }
        const filters=[];if(L.bloom)filters.push(this.sceneBloom);if(L.atmosphere)filters.push(this.atmosphereFilter);
        this.stage.filters=filters.length?filters:null;
        this.stage.filterArea=this.world.filterArea;this.atmosphereFilter.uniforms.viewport.set([game.canvas.width,game.canvas.height]);
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
        if(this.layers.playerShadows&&game.player.visible!==false){const p=game.player,x=Math.round(p.x/2)*2,y=Math.round(p.y/2)*2;
            out.push({owner:p,x,y,w:18,h:18,elevation:24,key:x+','+y,points:Array.from({length:12},(_,i)=>[x+Math.cos(i*Math.PI/6)*9,y+Math.sin(i*Math.PI/6)*9])});}
        return out;
    },
    shadowTexture(source,casters,walls,wallKey){
        const start=performance.now(),radius=source.radius;
        const nearby=casters.filter(c=>c.owner!==source.owner&&Math.hypot(c.x-source.x,c.y-source.y)<radius+Math.max(c.w,c.h));
        const key=[source.x,source.y,radius,source.w||0,source.h||0,source.cookie?.baseTexture.uid||0,this.layers.colorWash?'wide':'baseline',this.layers.wallOcclusion?wallKey:'open',...nearby.map(c=>c.key)].join('|');
        let r=this.shadowCache.get(source.owner);
        if(r&&r.key===key){this.shadowStats.hits++;return r.texture;}
        if(!r||r.radius!==radius){
            if(r){r.stage.destroy({children:true});r.texture.destroy(true);}
            const stage=new PIXI.Container(),sprite=new PIXI.Sprite(this.lightGradient),mask=new PIXI.Graphics(),shadow=new PIXI.Graphics();
            sprite.position.set(radius,radius);sprite.anchor.set(.5);sprite.width=sprite.height=radius*2;
            shadow.blendMode=PIXI.BLEND_MODES.ERASE;stage.addChild(sprite,mask,shadow);
            const texture=PIXI.RenderTexture.create({width:radius*2,height:radius*2,resolution:.35,scaleMode:PIXI.SCALE_MODES.LINEAR});
            r={stage,sprite,mask,shadow,texture,radius};this.shadowCache.set(source.owner,r);
        }
        r.sprite.texture=source.cookie||(this.layers.colorWash?this.holeGradient:this.lightGradient);
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
            const len=c.full?radius-d:Math.min(120,radius-d,d*c.elevation/Math.max(1,84-c.elevation)),scale=1+len/d;
            const hull=DynamicShadows._hull(c.points.flatMap(([x,y])=>[[x,y],[source.x+(x-source.x)*scale,source.y+(y-source.y)*scale]]));
            const local=points=>points.flatMap(([x,y])=>[x-source.x+radius,y-source.y+radius]);
            r.shadow.beginFill(0xffffff,c.full?1:.85).drawPolygon(local(hull));
            r.shadow.beginHole().drawPolygon(local(c.points.map(([x,y])=>[c.x+(x-c.x)*.98,c.y+(y-c.y)*.98]))).endHole().endFill();
            this.shadowStats.pairs++;
        }
        this.renderer.render(r.stage,{renderTexture:r.texture,clear:true});r.key=key;
        this.shadowStats.rebuilds++;this.layerStages.shadowRefreshMs=(this.layerStages.shadowRefreshMs||0)+performance.now()-start;
        return r.texture;
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
        for(const l of game.lamps||[]){
            const key=l.lampType+':'+l.color;let asset=this.fixtureAssets.get(key);
            if(!asset){asset=this.bake(192,192,c=>{
                c.translate(96-l.x,96-l.y);const a=l.angle;
                try{l.angle=0;l.draw(c,game.dayCycle().darkness);}finally{l.angle=a;}
            });this.fixtureAssets.set(key,asset);}
            let s=this.fixtureNodes.get(l);if(!s){s=new PIXI.Sprite(asset);s.anchor.set(.5);this.fixtures.addChild(s);this.fixtureNodes.set(l,s);}
            s.texture=asset;s.position.set(l.x,l.y);s.rotation=l.angle||0;s.visible=l.visible!==false;
        }
    },
    syncLighting(game,view){
        const start=performance.now(),L=this.layers;this.shadowStats={hits:0,rebuilds:0,sources:0,pairs:0};
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
        this.lightSprites.scale.set(view.zoom);this.lightSprites.position.copyFrom(this.world.position);
        const sources=(game.lamps||[]).filter(l=>l.visible!==false&&!l._forcedOff).map(l=>({owner:l,x:l.x,y:l.y,radius:l.lightRadius||l.radius||200,
            color:l.color||'#ffeebb',wash:.08,alpha:game.roomSystem.lampLight(l)*(l.intensity??1)}));
        if(L.decorLights){
            for(const p of game.props||[])if(p.visible!==false&&p.light){const c=p.getCenter(),q=p.light;
                sources.push({owner:p,x:c.x+(q.dx||0),y:c.y+(q.dy||0),radius:q.radius||Math.max(q.w||0,q.h||0)/2||180,
                    color:q.rgb?'rgb('+q.rgb+')':q.color||'#ffd2a0',wash:.22,flicker:q.flicker||0,alpha:(q.intensity??.8)*game.roomSystem.lightAt(c.x,c.y)});}
            for(const q of game.activeMap.softLights||[])sources.push({owner:q,x:q.x,y:q.y,radius:q.w?Math.hypot(q.w,q.h)/2:q.radius||180,
                w:q.w,h:q.h,cookie:q.w?this.areaCookie(game,q):null,
                color:q.rgb?'rgb('+q.rgb+')':q.color||'#ffd2a0',wash:.22,flicker:q.flicker||0,alpha:(q.intensity??.8)*game.roomSystem.lightAt(q.x,q.y)});
        }
        sources.sort((a,b)=>Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y));sources.length=Math.min(sources.length,L.decorLights?40:24);
        const occlusion=L.wallOcclusion||L.propShadows||L.playerShadows,casters=occlusion?this.casters(game):[],walls=getOccluders(game.activeMap);
        const wallKey=walls.map(w=>[w.x,w.y,w.w,w.h].join(',')).join(';');
        for(let i=0;i<this.lightSprites.children.length;i++){
            const s=this.lightSprites.children[i],source=sources[i];s.visible=!!source;if(!source)continue;
            s.texture=occlusion?this.shadowTexture(source,casters,walls,wallKey):source.cookie||(L.colorWash?this.holeGradient:this.lightGradient);
            s.position.set(source.x,source.y);s.width=occlusion?source.radius*2:source.w||source.radius*2;s.height=occlusion?source.radius*2:source.h||source.radius*2;
            const t=_frameTime/1000,pulse=(L.decorAnimation&&source.flicker) ? .82+.18*Math.sin(t*source.flicker+source.x*.7)*Math.sin(t*source.flicker*.37+source.y) : 1;
            s.tint=L.colorWash?0xffffff:PIXI.Color.shared.setValue(source.color).toNumber();s.alpha=Math.min(1,Math.max(0,source.alpha*pulse));
        }
        this.shadowStats.sources=sources.length;
        this.lightStage.filters=L.softShadows?[this.softFilter]:null;
        this.lighting.uniforms.nightTint=L.nightTint?1:0;
        this.lighting.uniforms.viewport.set([this.lightTarget.width,this.lightTarget.height]);
        this.renderer.render(this.lightStage,{renderTexture:this.lightTarget,clear:true});
        this.lighting.uniforms.colorGain=L.colorWash ? game.getAmbientDarkness() : 0;
        if(L.colorWash){
            this.lightBase.visible=false;
            for(let i=0;i<sources.length;i++){const s=this.lightSprites.children[i];s.tint=PIXI.Color.shared.setValue(sources[i].color).toNumber();s.alpha*=sources[i].wash;}
            this.renderer.render(this.lightStage,{renderTexture:this.colorTarget,clear:true});this.lightBase.visible=true;
        }
        this.layerStages.lightingMs=performance.now()-start;
    }
});
Object.defineProperty(NativeWebGLRenderer.prototype,'lightsOn',{get(){return this.layers.lighting;},set(v){this.setLayers({lighting:!!v});}});

// Extract highlights at quarter resolution, blur on the GPU, then combine with
// the untouched full-resolution scene. Changing an effect never rasterizes the
// complete scene through Canvas. FilterPool retains temporary GPU allocations.
class NativeSceneBloomFilter extends PIXI.Filter{
    constructor(){
        super();this.padding=0;
        this.bright=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            void main(){vec4 c=texture2D(uSampler,vTextureCoord);float l=max(c.r,max(c.g,c.b));gl_FragColor=c*clamp((l-.3)*2.0,0.0,1.0);}`);
        this.blur=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;uniform vec2 stepUV;
            void main(){gl_FragColor=(texture2D(uSampler,vTextureCoord-stepUV)+texture2D(uSampler,vTextureCoord)*2.0+texture2D(uSampler,vTextureCoord+stepUV))*.25;}`,
            {stepUV:new Float32Array(2)});
        this.combine=new PIXI.Filter(undefined,`precision highp float;varying vec2 vTextureCoord;uniform sampler2D uSampler;
            uniform sampler2D scene;uniform vec2 sceneScale;
            void main(){vec4 c=texture2D(scene,vTextureCoord*sceneScale);gl_FragColor=vec4(c.rgb+texture2D(uSampler,vTextureCoord).rgb*.25,c.a);}`,
            {scene:PIXI.Texture.EMPTY,sceneScale:new Float32Array(2)});
    }
    apply(manager,input,output,clearMode){
        const targets=[manager.getFilterTexture(input,.25),manager.getFilterTexture(input,.25),manager.getFilterTexture(input,.25)];
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
            configure(targets[0]);this.blur.uniforms.stepUV.set([1.5/targets[0].baseTexture.realWidth,0]);
            manager.applyFilter(this.blur,targets[0],targets[1],PIXI.CLEAR_MODES.CLEAR);
            configure(targets[1]);this.blur.uniforms.stepUV.set([0,1.5/targets[1].baseTexture.realHeight]);
            manager.applyFilter(this.blur,targets[1],targets[2],PIXI.CLEAR_MODES.CLEAR);
            configure(targets[2]);this.combine.uniforms.scene=input;
            this.combine.uniforms.sceneScale.set([targets[2].width/input.width,targets[2].height/input.height]);
            manager.applyFilter(this.combine,targets[2],output,clearMode);
        }finally{
            for(const [key,value] of Object.entries(saved))u[key].set(value);manager.globalUniforms.update();
            for(const target of targets)manager.returnFilterTexture(target);
        }
    }
}
