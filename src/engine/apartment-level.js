// Native apartment host: scene lifecycle and game policy, separate from Basement simulation.
const APARTMENT_ROSTER_FIELDS=['recruited','downed','equippedWeaponId','weaponId','hp','maxHp','teammateStims','maxTeammateStims','relationship','hireType','hireDuration','hireTime','hireCost','hired','role','bio','alliance'];
const apartmentRosterRecord=t=>({name:t.name,...Object.fromEntries(APARTMENT_ROSTER_FIELDS.map(k=>[k,t[k]??null]))});
engineMixin({
    get playerPosition(){return this.player?.physics_system?this.player.position:[this.player?.x??0,this.player?.y??0];},
    get playerRotation(){return this.player?.physics_system?this.player.rotation:this.player?.angle??0;},
    _enterApartment(spawnAt){
        const roster=this._pendingApartmentRoster??this.teammates.map(apartmentRosterRecord),buffs=this.player.buffSystem,vitals=this.player.vitals.snapshot();
        const spawn=spawnAt&&Number.isFinite(spawnAt.x)?[spawnAt.x,spawnAt.y]:undefined;
        // Prepare/validate an unstepped replacement before retiring the live scene.
        const candidate=new DFNative.ApartmentLevel({game_db:GAME_DB,spawn,layout:this.questState.aptLayout??{},roster});
        try{if(this._pendingApartmentState)candidate.loadState(this._pendingApartmentState);}
        catch(error){candidate.destroy();throw error;}
        if(this.activeLevel){this.furniture.release();this.apartmentRenderer?.destroy();this.activeLevel.destroy();}
        else{
            this._parkedCar=this.ownedCar?{brand:this.ownedCar.brand,model:this.ownedCar.model,color:this.ownedCar.color,x:this.ownedCar.x,y:this.ownedCar.y,angle:this.ownedCar.angle}:this._parkedCar;
            this._parkedDelivery=this.deliveryVehicle?{x:this.deliveryVehicle.x,y:this.deliveryVehicle.y,angle:this.deliveryVehicle.angle}:this._parkedDelivery;
        }
        this._endDrive();
        for(const entity of GameEntity.registry.all)entity.active=false;
        GameEntity.clearAll();GameEntity.clearQueue();CollisionSystem.clearSpatialGrid();_physicsSpatial.clear();
        this.traffic.reset();this.pedestrians.reset();this.roomSystem.clear();
        this._releaseLightingBase();this._clearRenderSpatial();this._clearMapResidue();
        this.projectiles=[];this.enemies=[];this.npcs=[];this.loot=[];this.corpses=[];this.neonSigns=[];
        this.ownedCar=null;this.car=null;this.deliveryVehicle=null;this.isDriving=false;this._transitionGrid=null;
        this.activeLevel=candidate;
        this._pendingApartmentRoster=null;this.physics_system=this.activeLevel.physics;
        this._pendingApartmentState=null;
        this.player=this.activeLevel.player;this.player.vitals.load(vitals);
        this.player.connectGameplay({buff_system:buffs,on_damage:({player})=>{player.vitals.recordDamage(_gameTimeSec);this.updateUI();},on_death:()=>this.respawnPlayer()});
        this.projectiles=this.activeLevel.projectiles;this.props=this.activeLevel.props;this.lamps=this.activeLevel.lamps;this.teammates=this.activeLevel.companions;
        this.activeMap={...this.activeLevel.definition.map,props:this.props,npcs:[],lamps:this.lamps,buildings:[],foliage:[],softLights:this.activeLevel.definition.soft_lights};
        this.roomSystem=new ApartmentRooms(this.activeLevel,this);this.furniture=new FurnitureSystem(this);this.apartmentRenderer=new ApartmentRenderer(this);
        this.ensureDyeStation();this.questState.aptLayout=this.activeLevel.getLayout();this.questState.aptVisited=true;(this.visitedMaps??=new Set()).add('apt_949');this.uiLocation.textContent=this.activeMap.label;
        this.weather.setIndoorSuppressed(!this.roomSystem.isPlayerOutdoor());this.camera.zoom=GameSettings.baseZoom||1;
        this.camera.x=this.player.position[0];this.camera.y=this.player.position[1];this.resize();this._onFootButtons();this.updateUI();
        this.landmarkRegistry=Object.fromEntries(this.activeMap.landmarks.map(l=>[l.id,l]));this._pendingGauntletLoad=null;
        return this.activeLevel;
    },
    _leaveApartment(){
        if(!this.activeLevel)return;
        this.furniture.release();this.questState.aptLayout=this.activeLevel.getLayout();
        const roster=this.activeLevel.getRoster(),buffs=this.player.buffSystem,vitals=this.player.vitals.snapshot();
        this.apartmentRenderer?.destroy();this.activeLevel.destroy();this._releaseMapBakes(null);this.activeLevel=null;this.physics_system=null;this.apartmentRenderer=null;
        this.player=new PlayerEntity({x:0,y:0});this.player.setGame(this);this.player.buffSystem=buffs;this.player.vitals.load(vitals);
        this.teammates=roster.map(r=>{const t=new NPC(0,0,r.name,r.role||'teammate',{weaponId:r.weaponId||r.equippedWeaponId});for(const k of APARTMENT_ROSTER_FIELDS)if(r[k]!=null)t[k]=r[k];return t;});
        this.ownedCar=gameVehicles.create({purpose:'owned',control_mode:'PLAYER',brand:this._parkedCar?.brand,model:this._parkedCar?.model,position:this._parkedCar?[this._parkedCar.x,this._parkedCar.y]:[CAR_START.x,CAR_START.y],rotation:this._parkedCar?.angle??CAR_START.angle});
        this.garage.applyToVehicle(this.ownedCar);this.car=this.ownedCar;
        if(this._parkedDelivery)this.deliveryVehicle=gameVehicles.create({purpose:'mission',mission_id:'amber_delivery',position:[this._parkedDelivery.x,this._parkedDelivery.y],rotation:this._parkedDelivery.angle});
        this.roomSystem=new RoomSystem();this.furniture=new FurnitureSystem(this);this._transitionGrid=new TransitionGrid(100);
    },
    _stepApartment(){
        const level=this.activeLevel,world=this.physics_system;
        this.simStep=(this.simStep+1)|0;this.tickPlayerEmote();this.furniture.update();
        let direction=controls.direction('move');if(this.joystick.active)direction=[this.joystick.dx,this.joystick.dy];
        const blocked=hudInputBlocked()||this.scenes?.running||this.furniture.state==='choose';
        if(blocked)direction=[0,0];
        const F=this.fireJoystick,quickLocked=this._quickDraw&&this._quickDraw.phase!=='ready';let aiming=!!quickLocked;
        if(!quickLocked&&!blocked&&!this.furniture.holding&&F.active&&(F.dx||F.dy)){this.player.lookInDirection([F.dx,F.dy]);this._apartmentAim={direction:[F.dx,F.dy]};aiming=true;}
        else if(!quickLocked&&!blocked&&!this.furniture.holding&&this.mouseDown){const p=this.viewToWorld(this.mouseX,this.mouseY);this.player.lookAtTarget([p.x,p.y]);this._apartmentAim={target:[p.x,p.y]};aiming=true;}
        else {this._apartmentAim=null;if(this.furniture.holding)this.player.lookAtTarget(this.furniture.target);else this.player.clearFacing();}
        if(this.furniture.state!=='walk'){
            const speed=this.player.buffSystem.getStat('speed',5.2)*60*(this.sneaking?.55:1)*(this.furniture.holding?FURNITURE_GRAB.MOVE_MUL:1);
            this.player.setMovement(direction,{speed,face_movement:!aiming&&!this.furniture.holding});
        }else if(direction[0]||direction[1])this.furniture.release();
        if(this.shootCooldown>0)this.shootCooldown--;this.updateQuickDraw();
        if(!blocked&&(this.mouseDown||F.active&&F.firing)&&this.shootCooldown<=0)this._fireApartmentWeapon();
        level.updateState();this.roomSystem.update();this.updateScope();this.updatePlayerRecovery();this.updateFlitRing();
        this.weather.setIndoorSuppressed(!this.roomSystem.isPlayerOutdoor());
        this.projectiles=this.projectiles.filter(p=>!p.destroyed);
        this.updateTime();this.updateUI();this.story.update();if(this.activeLevel!==level)return;
        this._apartmentInteraction();this._apartmentBlend=1;
    },
    _apartmentInteraction(){
        const world=this.physics_system;let best=null;
        for(const hit of world.peruseNearbyEntities(this.player,{near_range:FURNITURE_GRAB.INTERACTION_RANGE}))if(hit.entity?.interactionType&&PROP_ACTIONS[hit.entity.interactionType]||hit.entity?.entity_type==='df_apartment_companion'&&hit.entity.recruited){best=hit.entity;break;}
        this.activeInteraction=best;
        uiKit.toggle(this.interactBtn,!!best,'flex');if(best){const a=PROP_ACTIONS[best.interactionType]??['Talk',best.name];setActionPill(this.interactBtn,a[0],a[1],'E');}
        const exit=world.queryEntitiesInBounds({bounds:{left:this.player.position[0],right:this.player.position[0],top:this.player.position[1],bottom:this.player.position[1]},include_ghosts:true}).find(h=>h.entity?.data.role==='transition')?.entity;
        this._apartmentExit=exit;uiKit.toggle(this.transitionBtn,!!exit,'flex');if(exit)setActionPill(this.transitionBtn,'Exit','City','F');
    },
    _fireApartmentWeapon(){
        if(this.paused||this.furniture.busy()||this.weaponHolstered||this.shootCooldown>0||!this.player.visible||this.player.dead||(this._quickDraw&&!this._quickDrawFiring))return;
        if(!this.currentWeapon){this.shootCooldown=20;return;}
        const stats=this.currentWeapon.stats??{};
        this.shootCooldown=Math.max(2,Math.round(this.resonance.stat('fireCooldown',stats.fireRate||20)));
        const projectile=this.physics_system.createProjectileFrom(this.player,{template:'df:projectile',local_position:[15,5],...this._apartmentAim,
            speed:(stats.projectileSpeed||25)*60,lifetime:2,collision_mask:DFNative.BODY_GROUP.STATIC|DFNative.BODY_GROUP.PROP,
            data:{role:'projectile',damage:this.resonance.stat('gunDamage',stats.damage||35)}});
        this.projectiles.push(projectile);audioSys.sfx('shoot');
    },
    _flitApartment(angle){
        if(this.paused||this.player.dead||this.isDriving||this.furniture.busy()||this.hud&&!this.hud.has('flit'))return false;
        const cost=this.flitCost();
        if(this.player.vitals.attunement<cost)return false;
        const result=this.player.teleportInDirection(undefined,{angle,distance:this.flitDistance(),placement_bounds:{left:8,top:8,right:this.activeMap.width-8,bottom:this.activeMap.height-8},placement_mode:'clear',min_distance:this.player.vitals.flit_minimum_distance});
        if(!result)return false;this.player.vitals.beginFlit(cost,undefined,_gameTimeSec);showMessage('FLIT!');return true;
    }
});
