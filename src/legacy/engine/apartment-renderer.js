/** Native scene presentation. Packets below are drawing inputs, never entities or body owners. */
class ApartmentRenderer {
    constructor(game){this.game=game;this.people=new Map();this.props=new Map();this.pictures=new DFNative.pictureCache();}
    propPacket(entity,blend){
        const pose=entity.getRenderState(blend),a=entity.data.appearance,[width,height]=entity.collision_shape.dimensions;
        let packet=this.props.get(entity.entity_id);
        if(!packet){packet={draw(ctx){drawPropAppearance(ctx,this);}};this.props.set(entity.entity_id,packet);}
        return Object.assign(packet,{...a,x:pose.position[0]-width/2,y:pose.position[1]-height/2,width,height,w:width,h:height,angle:pose.rotation,visible:true,_switchState:!entity.data.room_id||!this.game.roomSystem.rooms[entity.data.room_id]?.lightsOff,
            decor:{face:a.face,vertical:!!a.vertical,candles:!!a.candles,variant:a.variant??0,...a.decor}});
    }
    personPacket(entity,blend){
        let packet=this.people.get(entity.entity_id);if(!packet){packet={enginePresentation:true,entity_id:entity.entity_id,type:entity===this.game.player?'player':'npc',_game:this.game};this.people.set(entity.entity_id,packet);}
        const pose=entity.getRenderState(blend),velocity=entity.linear_velocity;
        Object.assign(packet,{rigPose:DFNative.humanoidPresentation(entity,blend),punchSide:entity.data.weapon_state?.punch_side,punchHay:!!entity.data.weapon_state?.haymaker,x:pose.position[0],y:pose.position[1],angle:pose.rotation,velX:velocity[0]/60,velY:velocity[1]/60,vx:velocity[0]/60,vy:velocity[1]/60,radius:12,visible:entity.visible!==false&&entity.active,isHidden:!!entity.isHidden,dead:!!entity.dead,walkPhase:packet.walkPhase??0});
        return packet;
    }
    /** A prop whose family has native art: drawn from its body's pose, its still runs from pictures. */
    drawNativeProp(ctx,entity,blend){
        const pose=entity.getRenderState(blend),[width,height]=entity.collision_shape.dimensions,a=entity.data.appearance;
        // its play state: a lost thing lies open once searched today, a switch shows its room lit
        const state=a.interactionType==='lost_luggage'?{searched:this.game.lostThingSearched(a)}:a.interactionType==='light_switch'?{lit:!entity.data.room_id||!this.game.roomSystem.rooms[entity.data.room_id]?.lightsOff}:null;
        DFNative.drawPropArt(ctx,DFNative.propArtPacket({appearance:a,state,position:pose.position,rotation:pose.rotation,width,height}),{pictures:this.pictures,time:_frameTime/1000,beat:clubBeatN()});
    }
    destroy(){this.lighting=null;this.pictures.clear();PropSprites.clear([...this.props.values()]);this.props.clear();this.people.clear();}
    draw(game,blend=1){
        this.game=game;const level=game.activeLevel,world=level.physics,ctx=game.ctx,canvas=game.canvas;
        const player=this.personPacket(level.player,blend),zoom=game.camera.zoom;
        if(!game._cityView)game._cityView=game._makeAptCityView();
        const cam=game.resolveCameraView(zoom,player);game.view=cam;
        const view={left:cam.x-canvas.width/(2*zoom),right:cam.x+canvas.width/(2*zoom),top:cam.y-canvas.height/(2*zoom),bottom:cam.y+canvas.height/(2*zoom)};
        game._cullBounds={view,props:view,lamps:view,lampGlow:view};
        ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0a0810';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(zoom,zoom);ctx.translate(-cam.x,-cam.y);
        game.drawApartmentBackdrop(ctx);game.drawApartmentInterior(ctx);
        const bounds={left:cam.x-canvas.width/(2*zoom)-180,right:cam.x+canvas.width/(2*zoom)+180,top:cam.y-canvas.height/(2*zoom)-180,bottom:cam.y+canvas.height/(2*zoom)+180};
        const visible=world.queryEntitiesInBounds({bounds}),props=[],marionettes=[],gunners=[],drones=[],cats=[],demonesses=[],drawnDoors=new Set(),doors=level.map.getDoors(),doorOf=new Map(doors.flatMap(door=>door.leaves.filter(Boolean).map(leaf=>[leaf.entity_id,door])));PropSprites.frame(zoom);this.pictures.beginFrame();
        for(const{entity:e}of visible){
            if(!e)continue;
            if(e.data.role==='wall'){const p=e.getRenderState(blend),[w,h]=e.collision_shape.dimensions;ctx.fillStyle='#291d2d';ctx.fillRect(p.position[0]-w/2,p.position[1]-h/2,w,h);}
            if(e.data.role==='prop'){const p=this.propPacket(e,blend);props.push(p);if(DFNative.hasPropArt(e.data.appearance?.family))this.drawNativeProp(ctx,e,blend);else p.draw(ctx);}
            if(e.data.role==='door'||e.data.role==='door_panel'){
                // Doors are drawn natively from their leaves' bodies, once per door, whatever their kind.
                const door=doorOf.get(e.entity_id);if(!door||drawnDoors.has(door.door_key))continue;drawnDoors.add(door.door_key);
                DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDoorPackets(DFNative.doorPresentation(door,{blend})));
            }
        }
        for(const door of doors)if(!door.leaves.length){const [x,y]=door.opening.position,r=door.opening.length/2+10;
            if(x+r>=bounds.left&&x-r<=bounds.right&&y+r>=bounds.top&&y-r<=bounds.bottom)DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDoorPackets(DFNative.doorPresentation(door,{blend})));}
        for(const{entity:e}of visible)if(e?.data.role==='lamp'){
            const a=e.data.appearance,p=e.getRenderState(blend);if(a.visible!==false)drawLampFixture(ctx,a.fixture??'shade_rose',...p.position,{color:a.color,angle:a.angle??0,lit:!!game.roomSystem.lightAt(...p.position)});
        }
        // Draw the original humanoid artwork from presentation state. Legacy render-time
        // hair/wardrobe solvers are bypassed; native cosmetic fitting is a later migration group.
        for(const entity of [...level.companions,level.player])if(entity.active&&entity.visible!==false&&!entity.isHidden){
            const packet=this.personPacket(entity,blend);
            if(entity===level.player)game.drawPlayer(packet);
            else{
                const appearance=entity.data.appearance,outfit=appearance.outfit??{};ctx.save();ctx.translate(packet.x,packet.y);ctx.rotate(packet.angle);
                drawProceduralHumanoid(ctx,packet,{...appearance,stance:'idle',top:outfit.top,bottom:outfit.bottom,shoes:outfit.shoes,pose:entity.data.pose??null});ctx.restore();
            }
            if(entity.npc_state?.quip&&entity.npc_state.quip_delay<=0&&entity.npc_state.quip_remaining>0)drawSpeechBubble(ctx,packet.x,packet.y-34,entity.npc_state.quip,1);
        }
        for(const {entity}of visible)if(entity?.active&&entity.entity_type==='df_demoness'){
            const packet=DFNative.demonessPresentation(entity,blend);packet.rigPose=DFNative.humanoidPresentation(entity,blend);DFNative.demonessAppearance.draw.call(packet,ctx,ctx=>{ctx.save();ctx.translate(packet.x,packet.y);ctx.rotate(packet.angle);drawProceduralHumanoid(ctx,packet,{...packet.look,stance:'idle'});ctx.restore();});demonesses.push(packet);
        }
        for(const {entity}of visible)if(entity?.active&&entity.entity_type==='df_drone'){const packet=DFNative.dronePresentation(entity,blend);DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDronePackets(packet));drones.push(packet);}
        for(const {entity}of visible)if(entity?.active&&entity.entity_type==='df_velvet_cat'){const packet=DFNative.velvetPresentation(entity,blend);const art=DFNative.createVelvetCatArt(packet);DFNative.canvasRenderer.drawPackets(ctx,art.body);cats.push({packet,eyes:art.eyes});}
        for(const {entity}of visible)if(entity?.entity_type==='df_marionette'&&entity.active){
            const pose=entity.getRenderState(blend),action=entity.data.ability_action_state,clock=entity.data.weapon_state?.elapsed??0;
            const packet={x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,invincibleTimer:Math.round((entity.data.actor_state?.invulnerable_remaining??0)*60),state:entity.state,phase_age:action?clock-action.phase_started_at:0,render_time:_frameTime/1000,_seed:entity.data.appearance_seed,cloth:entity.data.cloth,_yank:entity.marionette_state.yank_remaining>.4?1:0};
            drawMarionetteAppearance(ctx,packet);marionettes.push(packet);
        }
        for(const {entity}of visible)if(['df_gatling_gunner','df_warden','df_vesper','df_matins','df_compline'].includes(entity?.entity_type)&&entity.active){
            const pose=entity.getRenderState(blend),state=entity.gunner_state,action=entity.data.ability_action_state,clock=entity.data.weapon_state?.elapsed??0,rules=entity.getAsset('actor_rules').data.gunner;
            const cooldown=action?.phase==='tell'?Math.max(0,rules.tell_seconds-(clock-action.phase_started_at)):action?.phase==='reload'?Math.max(0,action.reload_seconds-(clock-action.phase_started_at)):0;
            const packet={x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,visible:entity.visible,persona:entity.data.persona??null,artScale:entity.data.persona?1.7:1,_eyeK:entity.warden_state?.eye??1,_riseK:entity.warden_state?.rise??1,_heat:entity.gunner_state.barrel_heat,invincibleTimer:Math.round((entity.data.actor_state?.invulnerable_remaining??0)*60),_barrelPhase:state.barrel_phase,_barrelHeat:state.barrel_heat,burstCount:action?.phase==='burst'?action.shots_fired:0,burstCooldown:cooldown*60,burstTimer:(entity.data.weapon_state?.cooldown??0)*60,isTelegraphing:entity.isTelegraphing,telegraphAngle:action?.heading??pose.rotation,telegraphThreshold:rules.tell_seconds*60};
            drawGunnerAppearance(ctx,packet);gunners.push(packet);
        }
        for(const owner of level.curtains){
            const state=world.getClothState(owner.data.cloth_id),left=[],right=[];
            state.forEach((point,i)=>{const p=world.fetchBody(point.body_id).getRenderState(blend).position;(i%2?right:left).push(p);});
            const points=[...left,...right.reverse()];ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
            ctx.fillStyle=owner.data.appearance.color;ctx.fill();ctx.strokeStyle=owner.data.appearance.lightColor;ctx.stroke();
        }
        // Room dimming is presentation only; queries use the world's room volumes.
        // The light layer: the dark, each room's light and every lamp, drawn natively over the scene.
        game.profiler.start('Render:Lighting');   // (as the classic draw times its light layer: the bench compares the two)
        this.lighting??=new DFNative.sceneLighting(world);
        const lightAt=(x,y)=>game.roomSystem.lightAt(x,y),rooms=Object.values(game.roomSystem.rooms).map(r=>({rects:r.rects??[{x:r.x,y:r.y,w:r.w,h:r.h}],type:r.type,fill:r.fill,lit:r.lightsOff?0:1}));
        const light=this.lighting.createLayer({bounds:{left:Math.max(0,view.left-200),top:Math.max(0,view.top-200),right:Math.min(level.definition.map.width,view.right+200),bottom:Math.min(level.definition.map.height,view.bottom+200)},
            kind:'indoor',sky_darkness:game.dayCycle().darkness,rooms,lights:DFNative.levelLights(level,{blend,lightAt}),time:_frameTime/1000});
        DFNative.canvasRenderer.drawLayer(ctx,light.packets,{opacity:light.opacity,scale:game.lightLayerScale()});   // (the player's Lighting Quality and soft shadows, as the classic layer)
        game.profiler.stop('Render:Lighting');
        game.drawNoiseRipples(ctx);
        if(game.flitVFX.length)game.drawFlitVFX(ctx);
        for(const packet of demonesses)DFNative.demonessAppearance.drawDuelTells.call(packet,ctx);DFNative.bossEffectAppearance.draw.call({render_clock:level.player.data.weapon_state?.elapsed??0,render_time:_frameTime/1000,_hazards:DFNative.bossEffectPresentation(game.encounters.getEffects(),level.player.data.weapon_state?.elapsed??0),_playerBurn:null,player:null,_smokeK:DFNative.bossEffectAppearance._smokeK},ctx);for(const packet of drones)DFNative.canvasRenderer.drawPackets(ctx,DFNative.createDronePackets(packet,{pass:'lights'}));for(const {packet,eyes} of cats){const room=game.roomSystem.getRoomAt(packet.x,packet.y);DFNative.canvasRenderer.drawPackets(ctx,DFNative.createVelvetEyePackets(packet,{eyes,darkness:room?.type==='outdoor'?game.getAmbientDarkness():(room?.lightsOff ? .85 : .18)}));}game.drawPlayerGlow(ctx);game.drawApartmentGlow(ctx,props);for(const packet of marionettes)drawMarionetteAppearance(ctx,packet,true);for(const packet of gunners)drawGunnerAppearance(ctx,packet,true);
        for(const{entity:e}of visible)if(e?.data.role==='lamp'){
            const a=e.data.appearance,p=e.getRenderState(blend);if(a.visible!==false)drawLampFixtureLit(ctx,a.fixture??'shade_rose',...p.position,a.color,game.roomSystem.lightAt(...p.position),{angle:a.angle??0});
        }
        for(const {entity:p}of visible)if(p?.data.role==='projectile'&&!p.destroyed&&!p.data.melee){const s=p.getRenderState(blend);ctx.fillStyle=p.data.color??'#ffd891';ctx.beginPath();ctx.arc(...s.position,p.data.visual_radius??2,0,Math.PI*2);ctx.fill();}
        for(const {entity:loot}of visible)if(loot?.entity_type==='df_world_loot'){const p=loot.getRenderState(blend),definition=game.items.getDefinition(loot.definition_id);if(definition.type==='weapon')drawWeapon(ctx,loot.definition_id,...p.position,p.rotation,.8);else{ctx.fillStyle=definition.type==='consumable'?'#78e4bd':'#b594ff';ctx.fillRect(p.position[0]-5,p.position[1]-5,10,10);}}
        const target=game.furniture.target??game.furniture.cand;
        if(target){const p=target.getRenderState(blend),[w,h]=target.collision_shape.dimensions;ctx.save();ctx.translate(...p.position);ctx.rotate(p.rotation);ctx.strokeStyle='#ead49c';ctx.lineWidth=1.5;ctx.strokeRect(-w/2-3,-h/2-3,w+6,h+6);ctx.restore();}
        if(game.playerEmote.text&&game.playerEmote.age<game.playerEmote.duration)drawSpeechBubble(ctx,player.x,player.y-34,game.playerEmote.text,1);
        game.drawFlitFeedback(ctx);game.drawScopeView(ctx);
        ctx.restore();game.drawPlayerMarker(ctx,player);
    }
}
