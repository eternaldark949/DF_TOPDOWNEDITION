// Native apartment host: scene lifecycle and game policy, separate from Basement simulation.
const APARTMENT_ROSTER_FIELDS=[...DFNative.ROSTER_FIELDS,'equippedWeaponId','weaponId','hp','maxHp','inventory'];
const apartmentRosterRecord=t=>({name:t.name,...Object.fromEntries(APARTMENT_ROSTER_FIELDS.map(k=>[k,t[k]??null]))});
const characterAttackRecord=actor=>structuredClone(Object.fromEntries(['abilities','attack_state'].filter(key=>actor.data[key]!=null).map(key=>[key,actor.data[key]])));
engineMixin({
    get playerPosition(){return this.player?.physics_system?this.player.position:[this.player?.x??0,this.player?.y??0];},
    get playerRotation(){return this.player?.physics_system?this.player.rotation:this.player?.angle??0;},
    _enterApartment(spawnAt){
        const nativeWeapon=this.weapons?.state,playerAttackRecord=characterAttackRecord(this.player);
        const oldWeaponState={holstered:this.weaponHolstered,cooldown:this.shootCooldown,shield:nativeWeapon?{...nativeWeapon.shield}:this._mirrorShield?{charge:this._mirrorShield.charge,spent:this._mirrorShield.spent,since_hit:Math.max(0,(_simTick-this._mirrorShield.hitTick)/60)}:null,combo:nativeWeapon?.combo??this._punchCombo??0,punch_age:nativeWeapon?nativeWeapon.elapsed-nativeWeapon.last_punch_at:_gameTimeSec-(this._punchAt??-99)};
        const roster=this._pendingApartmentRoster??this.teammates.map(apartmentRosterRecord),buffs=this.player.buffSystem,vitals=this.player.vitals.snapshot();
        const spawn=spawnAt&&Number.isFinite(spawnAt.x)?[spawnAt.x,spawnAt.y]:undefined;
        // Prepare/validate an unstepped replacement before retiring the live scene.
        const candidate=new DFNative.ApartmentLevel({game_db:GAME_DB,spawn,layout:this.questState.aptLayout??{},roster});
        try{if(this._pendingApartmentState)candidate.loadState(this._pendingApartmentState);else Object.assign(candidate.player.data,playerAttackRecord);}
        catch(error){candidate.destroy();throw error;}
        if(this.activeLevel){this.furniture.release();this._disposeNativeCombat();this.apartmentRenderer?.destroy();this.activeLevel.destroy();}
        else{
            this._parkedCar=this.ownedCar?{brand:this.ownedCar.brand,model:this.ownedCar.model,color:this.ownedCar.color,x:this.ownedCar.x,y:this.ownedCar.y,angle:this.ownedCar.angle}:this._parkedCar;
            this._parkedDelivery=this.deliveryVehicle?{x:this.deliveryVehicle.x,y:this.deliveryVehicle.y,angle:this.deliveryVehicle.angle}:this._parkedDelivery;
        }
        this._endDrive();
        for(const entity of GameEntity.registry.all)entity.active=false;
        GameEntity.clearAll();GameEntity.clearQueue();CollisionSystem.clearSpatialGrid();_physicsSpatial.clear();
        this.traffic.reset();this.pedestrians.reset();this.roomSystem.clear();
        this._releaseLightingBase();this._clearRenderSpatial();this._clearMapResidue();
        // Every other map's baked floor is let go on the way home, as _doLoadMap does for any other destination.
        this._releaseMapBakes('apt_949');
        this.projectiles=[];this.enemies=[];this.npcs=[];this.loot=[];this.corpses=[];this.neonSigns=[];
        this.ownedCar=null;this.car=null;this.deliveryVehicle=null;this.isDriving=false;this._transitionGrid=null;
        this.activeLevel=candidate;
        this._pendingApartmentRoster=null;this.physics_system=this.activeLevel.physics;
        this._pendingApartmentState=null;
        this.player=this.activeLevel.player;this.player.vitals.load(vitals);
        this.player.connectGameplay({buff_system:buffs,on_damage:({player})=>{player.vitals.recordDamage(_gameTimeSec);this.updateUI();},on_death:()=>this.respawnPlayer()});
        this.props=this.activeLevel.props;this.lamps=this.activeLevel.lamps;this.teammates=this.activeLevel.companions;
        this.activeMap={...this.activeLevel.definition.map,props:this.props,npcs:[],lamps:this.lamps,buildings:[],foliage:[],softLights:this.activeLevel.definition.soft_lights};
        this.roomSystem=new ApartmentRooms(this.activeLevel,this);this.furniture=new FurnitureSystem(this);this.apartmentRenderer=new ApartmentRenderer(this);
        this._installNativeCombat(oldWeaponState);
        this.ensureDyeStation();this.questState.aptLayout=this.activeLevel.getLayout();this.questState.aptVisited=true;(this.visitedMaps??=new Set()).add('apt_949');this.uiLocation.textContent=this.activeMap.label;
        this.weather.setIndoorSuppressed(!this.roomSystem.isPlayerOutdoor());this.camera.zoom=GameSettings.baseZoom||1;
        this.camera.x=this.player.position[0];this.camera.y=this.player.position[1];this.resize();this._onFootButtons();this.updateUI();
        this.landmarkRegistry=Object.fromEntries(this.activeMap.landmarks.map(l=>[l.id,l]));this._pendingGauntletLoad=null;
        return this.activeLevel;
    },
    _leaveApartment(){
        if(!this.activeLevel)return;
        this.furniture.release();this.questState.aptLayout=this.activeLevel.getLayout();
        const state=this.weapons.state,oldWeaponState={holstered:this.weaponHolstered,cooldown:this.shootCooldown,shield:{...state.shield},combo:state.combo,punch_age:state.elapsed-state.last_punch_at};this._disposeNativeCombat();
        const roster=this.activeLevel.getRoster(),buffs=this.player.buffSystem,vitals=this.player.vitals.snapshot(),playerAttackRecord=characterAttackRecord(this.player);
        this.apartmentRenderer?.destroy();this.activeLevel.destroy();this._releaseMapBakes(null);this.activeLevel=null;this.physics_system=null;this.apartmentRenderer=null;
        this.weaponHolstered=oldWeaponState.holstered;this.shootCooldown=oldWeaponState.cooldown;
        this._mirrorShield={charge:oldWeaponState.shield.charge,spent:oldWeaponState.shield.spent,hitTick:_simTick-oldWeaponState.shield.since_hit*60};this._punchCombo=oldWeaponState.combo;this._punchAt=_gameTimeSec-oldWeaponState.punch_age;
        this.player=new PlayerEntity({x:0,y:0});Object.assign(this.player.data,playerAttackRecord);this.player.setGame(this);this.player.buffSystem=buffs;this.player.vitals.load(vitals);
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
        const releasing=Number.isFinite(this._releaseShot);
        if(!quickLocked&&!blocked&&!this.furniture.holding&&releasing){this.player.setRotation(this._releaseShot);this._apartmentAim={angle:this._releaseShot};aiming=true;}
        else if(!quickLocked&&!blocked&&!this.furniture.holding&&F.active&&(F.dx||F.dy)){this.player.lookInDirection([F.dx,F.dy]);this._apartmentAim={direction:[F.dx,F.dy]};aiming=true;}
        else if(!quickLocked&&!blocked&&!this.furniture.holding&&this.mouseDown){const p=this.viewToWorld(this.mouseX,this.mouseY);this.player.lookAtTarget([p.x,p.y]);this._apartmentAim={target:[p.x,p.y]};aiming=true;}
        else {this._apartmentAim=null;if(this.furniture.holding)this.player.lookAtTarget(this.furniture.target);else this.player.clearFacing();}
        if(this.furniture.state!=='walk'){
            const speed=this.player.buffSystem.getStat('speed',5.2)*60*(this.sneaking?.55:1)*(this.furniture.holding?FURNITURE_GRAB.MOVE_MUL:1);
            this.player.setMovement(direction,{speed,face_movement:!aiming&&!this.furniture.holding});
        }else if(direction[0]||direction[1])this.furniture.release();
        this.encounters.beforePhysics(this._nativeActorContext,world.config.fixed_step);this.actors.beforePhysics(this._nativeActorContext,world.config.fixed_step);this.weapons.beforePhysics(this._nativeActorContext);this.abilities.beforePhysics(this._nativeActorContext);this.attacks.beforePhysics(this._nativeActorContext);this.updateQuickDraw();this.humanoids.beforePhysics();
        if(!blocked&&(releasing||this.mouseDown||F.active&&F.firing)&&this.shootCooldown<=0){const fired=this.fireWeapon();if(releasing&&fired){this._releaseShot=null;this._releaseWait=0;}}
        if(releasing&&this._releaseShot!==null&&(this._releaseWait=(this._releaseWait??0)+1)>30){this._releaseShot=null;this._releaseWait=0;}
        level.updateState();this.actors.afterPhysics(this._nativeActorContext,world.config.fixed_step);this.combat.advance(world.config.fixed_step);this.worldLoot.advance(world.config.fixed_step);world.commitCommands();this.roomSystem.update();this.updateScope();this.updatePlayerRecovery();this.updateFlitRing();this.updateNoiseRipples();if(this.flitVFX.length)this.updateFlitVFX();
        this.weather.setIndoorSuppressed(!this.roomSystem.isPlayerOutdoor());
        this.updateTime();this.updateUI();this.story.update();if(this.activeLevel!==level)return;
        this._apartmentInteraction();this._apartmentBlend=1;
    },
    _apartmentInteraction(){
        const world=this.physics_system;let best=null;
        for(const hit of world.peruseNearbyEntities(this.player,{near_range:FURNITURE_GRAB.INTERACTION_RANGE}))if(hit.entity?.interactionType&&PROP_ACTIONS[hit.entity.interactionType]||hit.entity?.entity_type==='df_npc'&&hit.entity.recruited){best=hit.entity;break;}
        this.activeInteraction=best;
        uiKit.toggle(this.interactBtn,!!best,'flex');if(best){const a=PROP_ACTIONS[best.interactionType]??['Talk',best.name];setActionPill(this.interactBtn,a[0],a[1],'E');}
        const exit=world.queryEntitiesInBounds({bounds:{left:this.player.position[0],right:this.player.position[0],top:this.player.position[1],bottom:this.player.position[1]},include_ghosts:true}).find(h=>h.entity?.data.role==='transition')?.entity;
        this._apartmentExit=exit;uiKit.toggle(this.transitionBtn,!!exit,'flex');if(exit)setActionPill(this.transitionBtn,'Exit','City','F');
    },
    _installNativeCombat(previous){
        const cleanups=[],context={engine:this,api:{physics:this.physics_system,elements:this.physics_system.elements,items:this.items},createEntity:packet=>this.physics_system.createEntity(packet),defer:fn=>cleanups.push(fn)};
        this._nativeCombatCleanups=cleanups;
        this.combat=new DFNative.combatSystem({policy:{incoming_multiplier:target=>target===this.player&&this.weapons?.guarding?.75:1,on_event:(event,detail)=>{
            if(event==='weapon:fired'){audioSys.sfx('shoot');this.triggerShake(this.currentWeapon?.stats.recoil??2);}
            if(event==='loot:picked-up'){this.inventory.render();showMessage('ITEM RECOVERED');}
        }}});
        this.weapons=new DFNative.weaponSystem({items:this.items,combat:this.combat,get_player:()=>this.player,policy:{stat:(name,base)=>this.resonance.stat(name,base),roll_crit:stats=>this.rollCrit(stats),fast_reload:()=>this.augments.isEquipped('fast_reload'),mirror_glass:()=>this.mirrorGlassOn(),flit_active:()=>_gameTimeSec-this.player.vitals.last_flit_at<=this.resonance.flitStrikeWindow(),flit_multiplier:()=>1+this.resonance.value('flit_strike','damage')*this.resonance.rank('flit_strike'),quick_draw_window:()=>this.resonance.value('quick_draw','window'),quick_draw_multiplier:()=>1+this.resonance.value('quick_draw','damage')*this.resonance.rank('quick_draw'),can_fire:()=>!this.paused&&!this.furniture.busy()}});
        this.worldLoot=new DFNative.lootSystem({items:this.items,get_player:()=>this.player,on_event:(event,detail)=>{if(event==='loot:picked-up'){this.inventory.render();showMessage('ITEM RECOVERED');}}});
        const restored=!!this.player.data.weapon_state;this.combat.attach(context);this.weapons.attach(context);this.worldLoot.attach(context);
        this.encounters=new DFNative.encounterSystem({combat:this.combat});this.encounters.attach(context);
        this.abilities=new DFNative.abilitySystem({weapons:this.weapons,combat:this.combat,encounters:this.encounters,get_player:()=>this.player});this.abilities.attach(context);
        this.attacks=new DFNative.attackSystem({weapons:this.weapons,abilities:this.abilities,combat:this.combat,get_player:()=>this.player,items:this.items,definitions:this.physics_system.elements.asset_library.getResource('df:attacks').data});this.attacks.attach(context);
        this._nativeActorContext=context;this.actors=new DFNative.actorSystem({attacks:this.attacks,abilities:this.abilities,encounters:this.encounters,combat:this.combat,get_player:()=>this.player,policy:{stationary:()=>true,on_event:(event,detail)=>{if(event==='npc:downed')showMessage('COMPANION DOWNED');}}});this.actors.attach(context);this.encounters.setActors(this.actors);
        this.humanoids=new DFNative.humanoidSystem({get_appearance:actor=>actor===this.player?this.cosmetics.getRenderConfig():actor.data.appearance,get_stance:actor=>actor===this.player?(this.weaponHolstered?'idle':this.weaponMode==='melee'?'knife':['normal','sniper'].includes(this.weaponMode)?'pistol':this.shootCooldown>0?'punch':'idle'):'idle'});this.humanoids.attach(context);
        if(!restored){this.weapons.setHolstered(previous.holstered);this.weapons.setCooldown(previous.cooldown/60);if(previous.shield)this.weapons.state.shield={...previous.shield};this.weapons.state.combo=previous.combo;this.weapons.state.last_punch_at=this.weapons.state.elapsed-previous.punch_age;}
        for(const key of ['_legacyShootCooldown','_legacyWeaponHolstered','_legacyQuickDraw','_drawnAt','_drawShotUsed','_swing','_slashT','_slashSecs','_slashSide','_slashStyle','_punchDur','_punchCombo','_punchAt','_mirrorShield','_mirrorFlashT'])delete this[key];
    },
    _disposeNativeCombat(){
        this.humanoids?.detach();this.humanoids=null;this.actors?.detach();this.actors=null;this._nativeActorContext=null;this.attacks?.detach();this.attacks=null;this.abilities?.detach();this.abilities=null;this.encounters?.detach();this.encounters=null;this.weapons?.detach();this.combat?.detach();this.worldLoot?.detach();for(const fn of this._nativeCombatCleanups??[])fn();this._nativeCombatCleanups=[];this.weapons=null;this.combat=null;this.worldLoot=null;
    }
});
