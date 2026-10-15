// Native world migration: bounded street tiles, camera-dependent buildings and
// live actors. Original simulation/save schema remain the source of truth.
Object.assign(NativeWebGLRenderer.prototype,{
    initWorld(){
        this.nightHeat=new NativeNightHeat(this);this.surfaces=new NativeWorldSurfaces(this);this.backdropPrepared=false;this.nativeCasters=new NativeCasterBodies(this);this.backdropContext=new NativeVectorContext(this);this.backdrop.addChild(this.backdropContext.root);
        this.groundContext=new NativeVectorContext(this);this.floorArt.addChild(this.groundContext.root);
        this.buildingBaseStage=new PIXI.Container();this.world.addChildAt(this.buildingBaseStage,this.world.getChildIndex(this.objects));
        this.peopleContext=new NativeVectorContext(this);this.objects.addChild(this.peopleContext.root);
        this.drivenCarStage=new PIXI.Container();this.occupantContext=new NativeVectorContext(this);this.objects.addChild(this.drivenCarStage);
        this.trafficContext=new NativeVectorContext(this);this.world.addChildAt(this.trafficContext.root,this.world.getChildIndex(this.objects));
        this.streetContext=new NativeVectorContext(this);this.world.addChildAt(this.streetContext.root,this.world.getChildIndex(this.objects));
        this.roofStage=new PIXI.Container();this.world.addChild(this.roofStage);this.roofDetailContext=new NativeVectorContext(this);this.roofStage.addChild(this.roofDetailContext.root);
        this.foliageContext=new NativeVectorContext(this);this.world.addChild(this.foliageContext.root);
        this.cityGlowContext=new NativeVectorContext(this);this.emissive.addChild(this.cityGlowContext.root);
        this.worldCueContext=new NativeVectorContext(this);this.stage.addChild(this.worldCueContext.root);
        this.rainContext=new NativeVectorContext(this);this.stage.addChild(this.rainContext.root);this.rainBatch=new NativeRainBatch();this.emptyRain=[];this.nativeBuildings=new Map();this.crowdAtlas=new NativeCrowdAtlas(this);this.worldStats={heat:this.nightHeat.report(),};for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','roofDetailContext','rainContext','occupantContext','backdropContext','foliageContext'])this[key].label=key;this.presentation=new NativePresentation(this);
    },
    clearWorld(){
        if(!this.nativeBuildings)return;
        this.surfaces.clear();
        if(this.playerSprite)this.objects.addChild(this.playerSprite);for(const r of this.fixtureNodes.values())this.fixtures.addChild(r.node);
        this.presentation.clear();this.nightHeat.clear();this.nativeCasters.clear();
        for(const [d,r]of this.doorNodes)this.doors.addChild(r.node);for(const r of this.props.values())if(r.group)this.objects.addChild(r.group);
        this.crowdAtlas.clear();this.rainBatch.clear();
        for(const r of this.nativeBuildings.values()){this.clearBuildingGlow(r);r.base.destroy();r.top.destroy();}this.nativeBuildings.clear();this.releaseBuildingPool();
        for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','rainContext','roofDetailContext','occupantContext','backdropContext','foliageContext'])this[key].destroy();
        this.drivenCarStage.destroy();
        this.roofStage.destroy();this.buildingBaseStage.destroy();this.nativeBuildings=null;
    },
    syncDrivenCar(game){
        const ctx=this.occupantContext,stage=this.drivenCarStage,car=game.car;ctx.begin();stage.removeChildren();
        stage.visible=!!(this.layers.vehicles&&game.isDriving&&car?.visible&&car.drawOccupantOverlay);
        if(!stage.visible){this.objects.addChild(stage);return;}
        // The authored car draw deliberately omits its body while driving.
        // Seated bodies precede the door/roof pass, so lean-out poses stay inside.
        stage.addChild(this.playerSprite,ctx.root);
        if(this.layers.people)for(let i=1;i<(car.seatLayout?.length||0);i++){
            const occ=car.seatOccupants[i];if(!occ||occ===true||!occ.inCar)continue;
            const seat=car.getSeatWorldPos(i),shooting=occ.cooldown!==undefined&&occ.cooldown>0;
            const {pose,idleAngle,...look}=lookFor(occ)||{};
            const angle=occ.combatTargetTimer>0&&occ.combatTargetAngle!==undefined?occ.combatTargetAngle:car.angle;
            ctx.save();ctx.translate(seat.x,seat.y);ctx.rotate(angle);
            drawProceduralHumanoid(ctx,occ,{...look,gender:look.gender||occ.gender||'female',isDriving:true,
                isShootingFromCar:shooting,carAngle:car.angle,recoil:shooting?.5:0,stance:shooting?'pistol':'idle',held:null});
            ctx.restore();
        }
        car.drawOccupantOverlay(ctx);
        stage.zIndex=car.y;
        const parent=this.peopleContext.root.sortableChildren?this.peopleContext.root:this.objects;
        parent.addChild(stage);if(parent.sortableChildren)parent.sortChildren();
    },
    syncWorld(game,view){
        // A late web font must replace its fallback in retained sign geometry.
        // Release all old label pins before any new sign can enter the cache.
        if(this._fontSeen!==(this.fontRevision||0)){for(const rec of this.nativeBuildings.values()){rec.key=rec.glowKey=null;for(const c of [rec.base,rec.top,rec.glowContext,rec.glowLive])c?.releaseText();}this._fontSeen=this.fontRevision||0;}
        const start=performance.now();let lap=start;const timings={};this.nightHeat.begin(game);this.nativeCasters.begin(game);this.crowdAtlas.begin();this.buildingStats={hits:0,rasterizations:0,rasterMs:0,livePaths:0,fallbacks:0,evictions:0,returns:0,targetReuses:0,targetBorrows:0,targetCreates:0,baseRebuilds:0,topRebuilds:0};const L=this.layers,map=game.activeMap;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.worldCueContext,this.roofDetailContext,this.rainContext,this.occupantContext,this.foliageContext])ctx.canvas=game.canvas;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.roofDetailContext,this.occupantContext,this.foliageContext])ctx.sceneFrame=_worldMatrix;
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
        const foliage=this.foliageContext;foliage.begin();
        const street=this.streetContext;street.begin();if(L.streetDetails){
            if(map.foliage){
                // Same spatial query and density stride as Canvas's foliage pass (engine/draw.js).
                const scale=GameSettings.getFoliageScale(),stride=scale<1?Math.round(1/scale):1,wind=game.weather?game.weather.wind:.3,dir=game.weather?game.weather.windDirection:1;
                for(const {item:f,index}of game._queryRenderFoliage({left:bounds.left-140,right:bounds.right+140,top:bounds.top-140,bottom:bounds.bottom+140},this.foliageCandidates||(this.foliageCandidates=[]))){
                    if(stride>1&&index%stride!==0)continue;if(visible(f,140))f.draw(foliage,wind,dir,_gameTimeSec);
                }
            }
            if(game.leafParticles)game.leafParticles.draw(foliage);   // drifting leaves and petals, with or without trees
            for(const s of game.neonSigns||[])if(visible(s,150))s.draw(street,_frameTime);
            if(map.type==='outdoor')game.traffic?.drawSignals(street,bounds,map.crosswalks);
            game.drawDeliveryPackage(street,bounds);game.drawDropZone(street,bounds);
        }
        timings.streetMs=performance.now()-lap;lap=performance.now();
        const traffic=this.trafficContext;traffic.begin();if(L.vehicles){
            const cars=new Set([...(game.traffic?.vehicles||[]),...(game.cars||[]),game.car,game.ownedCar,game.van,game.deliveryVehicle].filter(Boolean));
            for(const car of cars)if(visible(car,180)){traffic.save();traffic.globalAlpha=car.fade??1;car._lod=_zoomLOD>0?1:0;if(L.depthSort)traffic.withDepth(car,()=>car.draw(traffic));else car.draw(traffic);this.nativeCasters.vehicle(car);traffic.restore();vehicles++;}
        }
        timings.vehiclesMs=performance.now()-lap;lap=performance.now();
        // Frame pacing for actor re-posing (NativeCasterBodies.capture): every frame at 30+ fps, every 2nd/3rd when slower.
        const tNow=performance.now(),dt=this.lastWorldAt?Math.min(250,tNow-this.lastWorldAt):16;this.lastWorldAt=tNow;this.frameMsAvg=(this.frameMsAvg||16)*.9+dt*.1;
        this.bodyInterval=L.characterAnimation?(this.frameMsAvg>66?3:this.frameMsAvg>36?2:1):1;
        const actors=this.peopleContext;actors.begin();this.objects.addChild(actors.root);this.objects.addChild(this.playerSprite);
        if(L.people){
            // Native actors use live geometry even when the Canvas setting chooses
            // baked crowd poses. Restore the user's setting after drawing.
            const crowd=GameSettings.crowdQuality;GameSettings.crowdQuality='high';
            try{
                for(const a of new Set([...(game.npcs||[]),...(game.teammates||[]),...(game.enemies||[])])){
                    if(!visible(a)){a.tickHidden?.();continue;}if(a.role==='teammate'&&game.scenes?.crewOffstage)continue;a.draw(actors,game.player);people++;
                }
                for(const life of [game.pedestrians,game.lobbyLife,game.clubLife,game.cafeLife]){life?.draw(actors,bounds);people+=(life?.pedestrians||life?.people||life?.walkers||[]).filter(a=>visible(a)).length;}
                if(game.velvetCat?.visible&&!game.velvetCat.inCar&&visible(game.velvetCat))game.velvetCat.draw(actors);
                game.drawCorpses(actors,bounds);game.scenes?.drawActors(actors);
            }finally{GameSettings.crowdQuality=crowd;}
        }
        this.syncSceneDepth(game);
        timings.peopleMs=performance.now()-lap;lap=performance.now();
        this.syncDrivenCar(game);timings.drivenCarMs=performance.now()-lap;lap=performance.now();
        const glow=this.cityGlowContext;glow.begin();
        const topBounds={left:view.x-vw,right:view.x+vw,top:view.y-vh,bottom:view.y+vh};
        const visibleBuildings=(map.buildings||[]).filter(b=>L.buildings&&(b.inView?b.inView(topBounds,game.camera):b.x<bounds.right&&b.y<bounds.bottom&&b.x+(b.width||500)>bounds.left&&b.y+(b.height||500)>bounds.top));
        const active=new Set(visibleBuildings),now=performance.now();
        for(const [b,r]of this.nativeBuildings)if(!active.has(b))this.hideBuilding(r);else {r.returning=!r.active;r.active=true;}
        this.trimBuildingRecords(now);
        for(const b of visibleBuildings){
            buildings++;
            let r=this.nativeBuildings.get(b);if(!r){r={base:new NativeVectorContext(this),top:new NativeVectorContext(this),active:true};r.base.label='building-base';r.top.label='building-top';this.nativeBuildings.set(b,r);}
            else if(r.returning)this.buildingStats.returns++;
            r.active=true;r.seen=now;r.base.root.visible=r.top.root.visible=true;
            this.buildingBaseStage.addChild(r.base.root);this.roofStage.addChild(r.top.root);
            r.base.sceneFrame=r.top.sceneFrame=_worldMatrix;
            const geometry=[b.x,b.y,b.w,b.h,b.floors,b.roundR,...(b.sections||[]).flatMap(s=>[s.x,s.y,s.w,s.h])].join(':'),
                common=[geometry,_zoomLOD,game.dayCycle().lampsOn,L.decorAnimation,this.fontRevision||0].join(':'),
                key=[game.camera.x,game.camera.y,common].join(':'),baseKey=b.isV2&&b.drawBase&&b.drawTop?common:key;
            // Ground-plane art has no camera lean. Reproject facades and roofs
            // exactly, while their imported artwork/gradient storage stays resident.
            if(r.baseKey!==baseKey){r.base.begin();b.drawBase?b.drawBase(r.base):b.draw(r.base);r.baseKey=baseKey;this.trimBuildingImages(r.base);this.buildingStats.baseRebuilds++;}
            if(r.key!==key){r.top.begin();b.drawTop?.(r.top,game.worldMinutes);b.drawSign?.(r.top);r.key=key;this.trimBuildingImages(r.top);this.buildingStats.topRebuilds++;}
            if(L.buildingCache){if(!this.syncBuildingGlow(b,r,game,view,key)&&L.glows)b.drawEmissive?.(glow,game.dayCycle().darkness);}
            else {if(r.glowMesh)r.glowMesh.visible=r.glowLive.root.visible=false;if(L.glows)b.drawEmissive?.(glow,game.dayCycle().darkness);}
        }
        this.trimBuildingRecords(now);
        const roofs=this.roofDetailContext;roofs.begin();this.roofStage.addChild(roofs.root);
        if(L.buildings){
            for(const bb of map.billboards||[])if(!bb.inView||bb.inView(bounds))bb.drawTop(roofs);
            for(const b of map._v3Buildings||[]){b.drawGround?.(street,_frameTime);b.draw(roofs,_frameTime);}
            if(map.ferrisWheel&&ferrisPaintInView(map.ferrisWheel,roofs,topBounds,view.zoom,true)){map.ferrisWheel.drawBase(street);map.ferrisWheel.drawTop(foliage);}
        }
        this.buildingBaseStage.sortableChildren=this.roofStage.sortableChildren=!!L.depthSort;
        for(const [b,r]of this.nativeBuildings)r.base.root.zIndex=r.top.root.zIndex=b.y+(b.h||b.height||0);this.roofDetailContext.root.zIndex=Infinity;
        if(L.depthSort){this.buildingBaseStage.sortChildren();this.roofStage.sortChildren();}
        if(L.glows&&L.fixtures)for(const lamp of game.lamps||[])if(visible(lamp,180))lamp.drawEmissive?.(glow,game.dayCycle().daylight);
        this.roofStage.visible=this.buildingBaseStage.visible=L.buildings;
        for(const ctx of [street,traffic,actors,glow,roofs,foliage,this.occupantContext]){
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
        this.worldStats={heat:this.nightHeat.report(),buildingCache:{...this.buildingStats,bytes:this.buildingGlowBytes()},timings,crowd:{...this.crowdAtlas.stats,entries:this.crowdAtlas.entries.size,bytes:this.crowdAtlas.bytes},buildings,people,vehicles,groundPending:game.groundBaker?.stats?.flat||0,groundTiles:game.groundBaker?.cache.size||0,
            paths:actors.pathsPainted+traffic.pathsPainted+street.pathsPainted,cpuMs:performance.now()-start};
        this.nativeCasters.trim();this.worldStats.casters=this.nativeCasters.report();
        this.layerStages.worldMs=this.worldStats.cpuMs;
    }
});
