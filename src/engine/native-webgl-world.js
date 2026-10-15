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
        this.rainContext=new NativeVectorContext(this);this.stage.addChild(this.rainContext.root);this.rainBatch=new NativeRainBatch();this.emptyRain=[];this.crowdAtlas=new NativeCrowdAtlas(this);this.worldStats={heat:this.nightHeat.report(),};for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','roofDetailContext','rainContext','occupantContext','backdropContext','foliageContext'])this[key].label=key;this.presentation=new NativePresentation(this);this.glBuildings=new GLBuildingsSystem(this);
    },
    clearWorld(){
        if(!this.glBuildings)return;
        this.glBuildings?.clear();if(this.glGround&&!this.glGround.root.destroyed)this.glGround.clear();
        this.surfaces.clear();
        if(this.playerSprite)this.objects.addChild(this.playerSprite);for(const r of this.fixtureNodes.values())this.fixtures.addChild(r.node);
        this.presentation.clear();this.nightHeat.clear();this.nativeCasters.clear();
        for(const [d,r]of this.doorNodes)this.doors.addChild(r.node);for(const r of this.props.values())if(r.group)this.objects.addChild(r.group);
        this.crowdAtlas.clear();this.rainBatch.clear();
        for(const key of ['groundContext','peopleContext','trafficContext','streetContext','cityGlowContext','worldCueContext','rainContext','roofDetailContext','occupantContext','backdropContext','foliageContext'])this[key].destroy();
        this.drivenCarStage.destroy();
        this.roofStage.destroy();this.buildingBaseStage.destroy();this.glBuildings=null;
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
        if(GLCars.supports(car))stage.addChild(this.glCars.node(car,false,'over'));else car.drawOccupantOverlay(ctx);
        stage.zIndex=car.y;
        const parent=this.peopleContext.root.sortableChildren?this.peopleContext.root:this.objects;
        parent.addChild(stage);if(parent.sortableChildren)parent.sortChildren();
    },
    syncWorld(game,view){
        // A late web font must replace its fallback in retained sign geometry.
        // Release all old label pins before any new sign can enter the cache.
        const start=performance.now();let lap=start;const timings={};this.nightHeat.begin(game);this.nativeCasters.begin(game);this.crowdAtlas.begin();const L=this.layers,map=game.activeMap;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.worldCueContext,this.roofDetailContext,this.rainContext,this.occupantContext,this.foliageContext])ctx.canvas=game.canvas;
        for(const ctx of [this.groundContext,this.peopleContext,this.trafficContext,this.streetContext,this.cityGlowContext,this.roofDetailContext,this.occupantContext,this.foliageContext])ctx.sceneFrame=_worldMatrix;
        const vw=game.canvas.width/(2*view.zoom),vh=game.canvas.height/(2*view.zoom);
        const bounds={left:view.x-vw-100,right:view.x+vw+100,top:view.y-vh-100,bottom:view.y+vh+100};
        const visible=(o,pad=60)=>o.visible!==false&&o.x>=bounds.left-pad&&o.x<=bounds.right+pad&&o.y>=bounds.top-pad&&o.y<=bounds.bottom+pad;
        let people=0,vehicles=0,buildings=0;
        const ground=this.groundContext;ground.begin();
        // The city's ground is native GPU geometry (gl/ground.js), built once for the map
        if(!this.glGround||this.glGround.root.destroyed)this.glGround=new GLGround(this,this.floorArt,this.floorArt.getChildIndex(ground.root));   // (the floor art is emptied with each map)
        if(game.groundBaker?.activeFor(map)&&L.floor)this.glGround.sync(game,bounds);else this.glGround.hide();
        timings.groundMs=performance.now()-lap;lap=performance.now();
        const foliage=this.foliageContext;foliage.begin();if(this.flora)this.flora.list.length=0;
        const street=this.streetContext;street.begin();if(this.neonSigns&&!this.neonSigns.destroyed)this.neonSigns.visible=!!L.streetDetails;if(this.glSignals&&!L.streetDetails)this.glSignals.hide();if(L.streetDetails){
            if(map.foliage){
                // Same spatial query and density stride as Canvas's foliage pass (engine/draw.js).
                const scale=GameSettings.getFoliageScale(),stride=scale<1?Math.round(1/scale):1,wind=game.weather?game.weather.wind:.3,dir=game.weather?game.weather.windDirection:1;
                // Each plant is its kind's GPU geometry, swayed by the wind (gl/flora.js)
                const plants=[];for(const {item:f,index}of game._queryRenderFoliage({left:bounds.left-140,right:bounds.right+140,top:bounds.top-140,bottom:bounds.bottom+140},this.foliageCandidates||(this.foliageCandidates=[]))){
                    if(stride>1&&index%stride!==0)continue;if(visible(f,140))plants.push(f);
                }
                if(!this.flora||this.flora.destroyed)this.flora=new GLFlora();
                if(this.flora.parent!==this.world||this.world.getChildIndex(this.flora)!==this.world.getChildIndex(foliage.root)-1){this.flora.parent?.removeChild(this.flora);this.world.addChildAt(this.flora,this.world.getChildIndex(foliage.root));}
                this.flora.sync(plants,wind,dir,_gameTimeSec,_sunShadow.on);
            }
            if(game.leafParticles)game.leafParticles.draw(foliage);   // drifting leaves and petals, with or without trees
            // neon signs: their lettering as distance-field text on the GPU (gl/signs.js)
            if(!this.neonSigns||this.neonSigns.destroyed)this.neonSigns=new GLNeonSigns();
            if(this.neonSigns.parent!==this.world||this.world.getChildIndex(this.neonSigns)!==this.world.getChildIndex(street.root)+1){this.neonSigns.parent?.removeChild(this.neonSigns);this.world.addChildAt(this.neonSigns,this.world.getChildIndex(street.root)+1);}
            this.neonSigns.sync((game.neonSigns||[]).filter(s=>visible(s,150)),_frameTime);
            // the junction lights: ground and glow, GPU geometry rewritten each frame (gl/signals.js)
            if(!this.glSignals||this.glSignals.ground.destroyed)this.glSignals=new GLSignals();
            {const sg=this.glSignals.ground;if(sg.parent!==this.world||this.world.getChildIndex(sg)!==this.world.getChildIndex(this.neonSigns)+1){sg.parent?.removeChild(sg);this.world.addChildAt(sg,this.world.getChildIndex(this.neonSigns)+1);}}
            if(map.type==='outdoor')this.glSignals.sync(game.traffic,bounds,map.crosswalks,L.glows?game.getAmbientDarkness():0,_frameTime);else this.glSignals.hide();
            game.drawDeliveryPackage(street,bounds);game.drawDropZone(street,bounds);
        }
        timings.streetMs=performance.now()-lap;lap=performance.now();
        const traffic=this.trafficContext;traffic.begin();if(!this.glCars)this.glCars=new GLCars();this.glCars.begin();if(L.vehicles){
            const cars=new Set([...(game.traffic?.vehicles||[]),...(game.cars||[]),game.car,game.ownedCar,game.van,game.deliveryVehicle].filter(Boolean));
            // TrafficVehicles are GPU geometry (gl/cars.js); anything else still paints through the vector context
            for(const car of cars)if(visible(car,180)){
                {const dx=car.x-view.x,dy=car.y-view.y,far=Math.pow(300/Math.max(.35,view.zoom),2);car._lod=car===game.deliveryVehicle?0:dx*dx+dy*dy>far?1:_zoomLOD>=2?1:0;}   // Canvas's distance LOD (engine/draw.js)
                if(GLCars.supports(car)){
                    if(!car.visible){this.nativeCasters.vehicle(car);vehicles++;continue;}
                    const node=this.glCars.node(car,car._lod===1,game.isDriving&&game.car===car&&car.hasDriver?'under':'all');
                    if(L.depthSort)traffic.withDepth(car,()=>traffic.container.addChild(node));else traffic.container.addChild(node);
                }else{traffic.save();traffic.globalAlpha=car.fade??1;if(L.depthSort)traffic.withDepth(car,()=>car.draw(traffic));else car.draw(traffic);traffic.restore();}
                this.nativeCasters.vehicle(car);vehicles++;}
        }
        timings.vehiclesMs=performance.now()-lap;lap=performance.now();
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
        this.nativeCasters.flush();   // all captured bodies, one atlas pass
        this.syncSceneDepth(game);
        timings.peopleMs=performance.now()-lap;lap=performance.now();
        this.syncDrivenCar(game);this.glCars.end();timings.drivenCarMs=performance.now()-lap;lap=performance.now();
        const glow=this.cityGlowContext;glow.begin();
        const topBounds={left:view.x-vw,right:view.x+vw,top:view.y-vh,bottom:view.y+vh};
        const visibleBuildings=(map.buildings||[]).filter(b=>L.buildings&&(b.inView?b.inView(topBounds,game.camera):b.x<bounds.right&&b.y<bounds.bottom&&b.x+(b.width||500)>bounds.left&&b.y+(b.height||500)>bounds.top));
        // Every building is native GPU geometry (gl/): built once, leaned, lit and animated in the shader.
        const gl=this.glBuildings;gl.begin(game,view);
        for(const b of visibleBuildings){buildings++;if(gl.supports(b))gl.show(b,game);else gl.stats.unsupported=(gl.stats.unsupported||0)+1;}
        gl.end();if(L.buildings)gl.prefetch(map,bounds);
        const roofs=this.roofDetailContext;roofs.begin();this.roofStage.addChild(roofs.root);
        if(L.buildings){
            for(const bb of map.billboards||[])if(!bb.inView||bb.inView(bounds))bb.drawTop(roofs);
            for(const b of map._v3Buildings||[]){b.drawGround?.(street,_frameTime);b.draw(roofs,_frameTime);}
            if(map.ferrisWheel&&ferrisPaintInView(map.ferrisWheel,roofs,topBounds,view.zoom,true)){map.ferrisWheel.drawBase(street);map.ferrisWheel.drawTop(foliage);}
        }
        this.buildingBaseStage.sortableChildren=this.roofStage.sortableChildren=!!L.depthSort;
        this.roofDetailContext.root.zIndex=Infinity;
        if(L.depthSort){this.buildingBaseStage.sortChildren();this.roofStage.sortChildren();}
        // the lamps' luminous panes and bloom, above the dark: GPU geometry (gl/lamps.js)
        if(!this.lampEmission||this.lampEmission.destroyed){this.lampEmission=new PIXI.Container();this.lampEmissionParts=[];}
        if(this.lampEmission.parent!==this.emissive||this.emissive.getChildIndex(this.lampEmission)!==this.emissive.getChildIndex(glow.root)+1){this.emissive.removeChild(this.lampEmission);this.emissive.addChildAt(this.lampEmission,this.emissive.getChildIndex(glow.root)+1);}
        {let n=0;const daylight=game.dayCycle().daylight,parts=this.lampEmissionParts;
            if(L.glows&&L.fixtures&&daylight<.2)for(const lamp of game.lamps||[]){
                const k=Math.max(0,Math.min(1,lamp._lightK??1));
                if(!lamp.visible||lamp._forcedOff||k<.02||!visible(lamp,180))continue;
                if(!this.glLamps)this.glLamps=new GLLamps();
                const g=this.glLamps.emission(lamp);if(!g)continue;
                let part=parts[n];if(!part){part=parts[n]=new GLInstance();this.lampEmission.addChild(part);}n++;
                part.geometry=g;part.alpha=k;part.visible=true;part.position.set(lamp.x,lamp.y);part.rotation=lamp.angle||0;part.scale.set(LAMP_POST_SCALE);
            }
            for(let i=n;i<parts.length;i++)parts[i].visible=false;}
        {const dark=game.getAmbientDarkness(),night=[];
            if(L.glows&&L.vehicles&&dark>.04){const cars=new Set(game.traffic?.vehicles||[]);for(const v of [game.car,game.ownedCar,game.deliveryVehicle])if(v)cars.add(v);for(const v of cars)if(GLCars.supports(v)&&v.visible&&!v.dead&&visible(v,60))night.push(v);}
            const ng=this.glCars.glow(night,dark);if(ng.parent!==this.emissive)this.emissive.addChild(ng);ng.visible=night.length>0;}
        if(this.glSignals&&!this.glSignals.glow.destroyed){const sg=this.glSignals.glow;if(sg.parent!==this.emissive||this.emissive.getChildIndex(sg)!==this.emissive.getChildIndex(this.lampEmission)+1){sg.parent?.removeChild(sg);this.emissive.addChildAt(sg,this.emissive.getChildIndex(this.lampEmission)+1);}}
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
        this.worldStats={heat:this.nightHeat.report(),glBuildings:{...this.glBuildings.stats},timings,crowd:{...this.crowdAtlas.stats,entries:this.crowdAtlas.entries.size,bytes:this.crowdAtlas.bytes},buildings,people,vehicles,groundPending:game.groundBaker?.stats?.flat||0,groundTiles:game.groundBaker?.cache.size||0,
            paths:actors.pathsPainted+traffic.pathsPainted+street.pathsPainted,cpuMs:performance.now()-start};
        this.nativeCasters.trim();this.worldStats.casters=this.nativeCasters.report();
        this.layerStages.worldMs=this.worldStats.cpuMs;
    }
});
