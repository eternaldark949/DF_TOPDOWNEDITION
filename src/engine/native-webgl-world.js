// Native world migration: bounded street tiles, camera-dependent buildings and
// live actors. Original simulation/save schema remain the source of truth.
Object.assign(NativeWebGLRenderer.prototype,{
    initWorld(){
        this.groundContext=new NativeVectorContext(this);this.floorArt.addChild(this.groundContext.root);
        this.buildingBaseStage=new PIXI.Container();this.world.addChildAt(this.buildingBaseStage,this.world.getChildIndex(this.objects));
        this.peopleContext=new NativeVectorContext(this);this.objects.addChild(this.peopleContext.root);
        this.trafficContext=new NativeVectorContext(this);this.world.addChildAt(this.trafficContext.root,this.world.getChildIndex(this.objects));
        this.streetContext=new NativeVectorContext(this);this.world.addChildAt(this.streetContext.root,this.world.getChildIndex(this.objects));
        this.roofStage=new PIXI.Container();this.world.addChild(this.roofStage);this.roofDetailContext=new NativeVectorContext(this);this.roofStage.addChild(this.roofDetailContext.root);
        this.cityGlowContext=new NativeVectorContext(this);this.emissive.addChild(this.cityGlowContext.root);
        this.worldCueContext=new NativeVectorContext(this);this.stage.addChild(this.worldCueContext.root);
        this.rainContext=new NativeVectorContext(this);this.stage.addChild(this.rainContext.root);this.rainBatch=new NativeRainBatch();this.emptyRain=[];this.nativeBuildings=new Map();this.crowdAtlas=new NativeCrowdAtlas(this);this.worldStats={};for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','roofDetailContext','rainContext'])this[key].label=key;
    },
    clearWorld(){
        if(!this.nativeBuildings)return;
        if(this.playerSprite)this.objects.addChild(this.playerSprite);for(const r of this.fixtureNodes.values())this.fixtures.addChild(r.node);
        this.crowdAtlas.clear();this.rainBatch.clear();
        for(const r of this.nativeBuildings.values()){this.clearBuildingGlow(r);r.base.destroy();r.top.destroy();}this.nativeBuildings.clear();
        for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','rainContext','roofDetailContext'])this[key].destroy();
        this.roofStage.destroy();this.buildingBaseStage.destroy();this.nativeBuildings=null;
    },
    syncWorld(game,view){
        const start=performance.now();let lap=start;const timings={};this.crowdAtlas.begin();this.buildingStats={hits:0,rasterizations:0,rasterMs:0,livePaths:0,fallbacks:0};const L=this.layers,map=game.activeMap;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.worldCueContext,this.roofDetailContext,this.rainContext])ctx.canvas=game.canvas;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.roofDetailContext])ctx.sceneFrame=_worldMatrix;
        const vw=game.canvas.width/(2*view.zoom),vh=game.canvas.height/(2*view.zoom);
        const bounds={left:view.x-vw-100,right:view.x+vw+100,top:view.y-vh-100,bottom:view.y+vh+100};
        const visible=(o,pad=60)=>o.visible!==false&&o.x>=bounds.left-pad&&o.x<=bounds.right+pad&&o.y>=bounds.top-pad&&o.y<=bounds.bottom+pad;
        let people=0,vehicles=0,buildings=0;
        const ground=this.groundContext;ground.begin();
        if(map.id==='hub_949'&&L.floor){game.groundBaker.draw(ground,bounds);
            // GroundBaker's CPU LRU owns tile lifetime. Retire matching GPU
            // textures when those tiles leave it, including views at other LODs.
            const keep=new Set(game.groundBaker.cache.values());for(const [image,t]of ground.images)if(!keep.has(image)){ground.images.delete(image);this.releaseImage(t);}
        }
        timings.groundMs=performance.now()-lap;lap=performance.now();
        const street=this.streetContext;street.begin();if(L.streetDetails){
            for(const f of game.foliage||[])if(visible(f,140))f.draw(street,game.weather.wind,game.weather.windDirection,_gameTimeSec);
            for(const s of game.neonSigns||[])if(visible(s,150))s.draw(street,_frameTime);
            if(map.type==='outdoor')game.traffic?.drawSignals(street,bounds,map.crosswalks);
            game.drawDeliveryPackage(street,bounds);game.drawDropZone(street,bounds);
        }
        timings.streetMs=performance.now()-lap;lap=performance.now();
        const traffic=this.trafficContext;traffic.begin();if(L.vehicles){
            const cars=new Set([...(game.traffic?.vehicles||[]),...(game.cars||[]),game.car,game.ownedCar,game.van,game.deliveryVehicle].filter(Boolean));
            for(const car of cars)if(visible(car,180)){traffic.save();traffic.globalAlpha=car.fade??1;car._lod=_zoomLOD>0?1:0;car.draw(traffic);traffic.restore();vehicles++;}
        }
        timings.vehiclesMs=performance.now()-lap;lap=performance.now();
        const actors=this.peopleContext;actors.begin();this.objects.addChild(actors.root);this.objects.addChild(this.playerSprite);
        if(L.people){
            // Native actors use live geometry even when the Canvas setting chooses
            // baked crowd poses. Restore the user's setting after drawing.
            const crowd=GameSettings.crowdQuality;GameSettings.crowdQuality='high';
            try{
                for(const a of new Set([...(game.npcs||[]),...(game.teammates||[]),...(game.enemies||[])])){
                    if(!visible(a)){a.tickHidden?.();continue;}a.draw(actors,game.player);people++;
                }
                for(const life of [game.pedestrians,game.lobbyLife,game.clubLife,game.cafeLife]){life?.draw(actors,bounds);people+=(life?.pedestrians||life?.people||[]).filter(a=>visible(a)).length;}
                if(game.velvetCat?.visible&&!game.velvetCat.inCar&&visible(game.velvetCat))game.velvetCat.draw(actors);
                game.drawCorpses(actors,bounds);game.scenes?.drawActors(actors);
            }finally{GameSettings.crowdQuality=crowd;}
        }
        actors.root.sortableChildren=!!(L.depthSort&&map.type==='outdoor');
        for(const r of this.fixtureNodes.values()){
            const parent=actors.root.sortableChildren&&L.fixtures?actors.root:this.fixtures;
            parent.addChild(r.node);
        }
        if(actors.root.sortableChildren){this.playerSprite.zIndex=game.player.y;actors.root.addChild(this.playerSprite);actors.root.sortChildren();}
        timings.peopleMs=performance.now()-lap;lap=performance.now();
        const glow=this.cityGlowContext;glow.begin();const keep=new Set();
        const topBounds={left:view.x-vw,right:view.x+vw,top:view.y-vh,bottom:view.y+vh};
        for(const b of map.buildings||[]){
            const inView=b.inView?b.inView(topBounds,game.camera):b.x<bounds.right&&b.y<bounds.bottom&&b.x+(b.width||500)>bounds.left&&b.y+(b.height||500)>bounds.top;
            if(!L.buildings||!inView)continue;keep.add(b);buildings++;
            let r=this.nativeBuildings.get(b);if(!r){r={base:new NativeVectorContext(this),top:new NativeVectorContext(this)};r.base.label='building-base';r.top.label='building-top';this.nativeBuildings.set(b,r);this.buildingBaseStage.addChild(r.base.root);this.roofStage.addChild(r.top.root);}
            this.buildingBaseStage.addChild(r.base.root);this.roofStage.addChild(r.top.root);
            r.base.sceneFrame=r.top.sceneFrame=_worldMatrix;
            const key=[game.camera.x,game.camera.y,_zoomLOD,game.dayCycle().lampsOn,L.decorAnimation].join(':');
            if(r.key!==key){r.base.begin();b.drawBase?b.drawBase(r.base):b.draw(r.base);r.top.begin();b.drawTop?.(r.top,game.worldMinutes);b.drawSign?.(r.top);r.key=key;}
            if(L.buildingCache){if(!this.syncBuildingGlow(b,r,game,view,key)&&L.glows)b.drawEmissive?.(glow,game.dayCycle().darkness);}
            else {if(r.glowMesh)r.glowMesh.visible=r.glowLive.root.visible=false;if(L.glows)b.drawEmissive?.(glow,game.dayCycle().darkness);}
        }
        for(const [b,r]of this.nativeBuildings)if(!keep.has(b)){this.clearBuildingGlow(r);r.base.destroy();r.top.destroy();this.nativeBuildings.delete(b);}
        const roofs=this.roofDetailContext;roofs.begin();this.roofStage.addChild(roofs.root);
        if(L.buildings){
            for(const bb of map.billboards||[])if(!bb.inView||bb.inView(bounds))bb.drawTop(roofs);
            for(const b of map._v3Buildings||[]){b.drawGround?.(street,_frameTime);b.draw(roofs,_frameTime);}
            if(map.ferrisWheel&&ferrisPaintInView(map.ferrisWheel,roofs,topBounds,view.zoom,true)){map.ferrisWheel.drawBase(street);map.ferrisWheel.drawTop(roofs);}
        }
        this.roofStage.visible=this.buildingBaseStage.visible=L.buildings;
        for(const ctx of [street,traffic,actors,glow,roofs]){
            const used=new Set(ctx.pool.filter(n=>n.visible&&n instanceof PIXI.Sprite).map(n=>n.texture.baseTexture));
            for(const [image,t]of ctx.images)if(!used.has(t.baseTexture)){ctx.images.delete(image);this.releaseImage(t);}
        }
        timings.buildingsMs=performance.now()-lap;lap=performance.now();
        // Markers include door destinations, pickups and mission navigation.
        const cues=this.worldCueContext;cues.begin();if(L.worldMarkers)game.drawMarkers(cues);
        timings.markersMs=performance.now()-lap;
        const rainStart=performance.now(),rain=this.rainContext;rain.begin();const weather=game.weather;this.rainBatch.begin();
        const rainK=map.type==='outdoor'?1:game.roomSystem.active?game.roomSystem.outdoorness:0;
        if((L.rainDrops||L.rainSplashes)&&rainK>.01&&weather.isRaining){
            rain.globalAlpha=rainK;
            if(map.type!=='outdoor'){
                rain.setTransform(view.zoom,0,0,view.zoom,this.world.x,this.world.y);rain.beginPath();
                for(const room of Object.values(game.roomSystem.rooms))if(room.type==='outdoor')for(const q of room.rects)rain.rect(q.x,q.y,q.w,q.h);
                rain.clip();rain.resetTransform();
            }
            if(L.rainQuads)this.rainBatch.draw(rain,game,view);else {const drops=weather.drops,splashes=weather.splashes;
            try{if(!L.rainDrops)weather.drops=this.emptyRain;if(!L.rainSplashes)weather.splashes=this.emptyRain;
                weather.drawRainOverlay(rain,view,game.lamps);
            }finally{weather.drops=drops;weather.splashes=splashes;}}
        }
        this.rainStats={mode:L.rainQuads?'quads':'paths',...this.rainBatch.stats,drops:L.rainDrops&&rainK>.01?weather.drops.length:0,splashes:L.rainSplashes&&rainK>.01?weather.splashes.length:0,paths:rain.pathsPainted,cpuMs:performance.now()-rainStart};
        // Bound per-map imported bitmap residency to images still referenced by
        // live contexts (ground, authored sprites and fixtures have own owners).
        this.worldStats={buildingCache:{...this.buildingStats,bytes:this.buildingGlowBytes()},timings,crowd:{...this.crowdAtlas.stats,entries:this.crowdAtlas.entries.size,bytes:this.crowdAtlas.bytes},buildings,people,vehicles,groundPending:game.groundBaker?.stats?.flat||0,groundTiles:game.groundBaker?.cache.size||0,
            paths:actors.pathsPainted+traffic.pathsPainted+street.pathsPainted,cpuMs:performance.now()-start};
        this.layerStages.worldMs=this.worldStats.cpuMs;
    }
});
