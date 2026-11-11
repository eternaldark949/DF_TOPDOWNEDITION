/** Native scene presentation. Packets below are drawing inputs, never entities or body owners. */
class ApartmentRenderer {
    constructor(game){this.game=game;this.people=new Map();this.props=new Map();}
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
        Object.assign(packet,{punchSide:entity.data.weapon_state?.punch_side,punchHay:!!entity.data.weapon_state?.haymaker,x:pose.position[0],y:pose.position[1],angle:pose.rotation,velX:velocity[0]/60,velY:velocity[1]/60,vx:velocity[0]/60,vy:velocity[1]/60,radius:12,visible:entity.visible!==false&&entity.active,isHidden:!!entity.isHidden,dead:!!entity.dead,walkPhase:packet.walkPhase??0});
        return packet;
    }
    destroy(){PropSprites.clear([...this.props.values()]);this.props.clear();this.people.clear();}
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
        const visible=world.queryEntitiesInBounds({bounds}),props=[],marionettes=[],gunners=[],drones=[],cats=[],drawnDoors=new Set();PropSprites.frame(zoom);
        for(const{entity:e}of visible){
            if(!e)continue;
            if(e.data.role==='wall'){const p=e.getRenderState(blend),[w,h]=e.collision_shape.dimensions;ctx.fillStyle='#291d2d';ctx.fillRect(p.position[0]-w/2,p.position[1]-h/2,w,h);}
            if(e.data.role==='prop'){const p=this.propPacket(e,blend);props.push(p);p.draw(ctx);}
            if(e.data.role==='door'||e.data.role==='door_panel'){
                const door=e.data.role==='door'?e:level.doorByKey.get(e.data.door_key);if(drawnDoors.has(door.entity_id))continue;drawnDoors.add(door.entity_id);
                const a=door.data.appearance,pose=door.getRenderState(blend),shape=door.collision_shape;
                const packet={...a,hx:pose.position[0],hy:pose.position[1],length:a.orientation==='H'?a.w:a.h,baseAngle:a.orientation==='H'?0:Math.PI/2,angle:pose.rotation,thickness:a.orientation==='H'?shape.dimensions[1]:shape.dimensions[0]};
                if(a.type==='sliding')packet.panels=level.doorPanels.get(door.entity_id).map(panel=>({...panel.getRenderState(blend),dimensions:panel.collision_shape.dimensions,local_position:panel.collision_shape.local_position??[0,0]}));
                drawIndoorDoorAppearance(ctx,packet);
            }
        }
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
        for(const {entity}of visible)if(entity?.active&&entity.entity_type==='df_drone'){const packet=DFNative.dronePresentation(entity,blend);packet.draw(ctx);drones.push(packet);}
        for(const {entity}of visible)if(entity?.active&&entity.entity_type==='df_velvet_cat'){const packet=DFNative.velvetPresentation(entity,blend);packet.draw(ctx);cats.push(packet);}
        for(const {entity}of visible)if(entity?.entity_type==='df_marionette'&&entity.active){
            const pose=entity.getRenderState(blend),action=entity.data.ability_action_state,clock=entity.data.weapon_state?.elapsed??0;
            const packet={x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,invincibleTimer:Math.round((entity.data.actor_state?.invulnerable_remaining??0)*60),state:entity.state,phase_age:action?clock-action.phase_started_at:0,render_time:_frameTime/1000,_seed:entity.data.appearance_seed,cloth:entity.data.cloth,_yank:entity.marionette_state.yank_remaining>.4?1:0};
            drawMarionetteAppearance(ctx,packet);marionettes.push(packet);
        }
        for(const {entity}of visible)if(entity?.entity_type==='df_gatling_gunner'&&entity.active){
            const pose=entity.getRenderState(blend),state=entity.gunner_state,action=entity.data.ability_action_state,clock=entity.data.weapon_state?.elapsed??0,rules=entity.getAsset('actor_rules').data.gunner;
            const cooldown=action?.phase==='tell'?Math.max(0,rules.tell_seconds-(clock-action.phase_started_at)):action?.phase==='reload'?Math.max(0,action.reload_seconds-(clock-action.phase_started_at)):0;
            const packet={x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,visible:entity.visible,persona:null,invincibleTimer:Math.round((entity.data.actor_state?.invulnerable_remaining??0)*60),_barrelPhase:state.barrel_phase,_barrelHeat:state.barrel_heat,burstCount:action?.phase==='burst'?action.shots_fired:0,burstCooldown:cooldown*60,burstTimer:(entity.data.weapon_state?.cooldown??0)*60,isTelegraphing:entity.isTelegraphing,telegraphAngle:action?.heading??pose.rotation,telegraphThreshold:rules.tell_seconds*60};
            drawGunnerAppearance(ctx,packet);gunners.push(packet);
        }
        for(const owner of level.curtains){
            const state=world.getClothState(owner.data.cloth_id),left=[],right=[];
            state.forEach((point,i)=>{const p=world.fetchBody(point.body_id).getRenderState(blend).position;(i%2?right:left).push(p);});
            const points=[...left,...right.reverse()];ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
            ctx.fillStyle=owner.data.appearance.color;ctx.fill();ctx.strokeStyle=owner.data.appearance.lightColor;ctx.stroke();
        }
        // Room dimming is presentation only; queries use the world's room volumes.
        for(const r of Object.values(game.roomSystem.rooms))if(r.type!=='outdoor'){
            ctx.fillStyle=`rgba(7,5,14,${r.lightsOff ? 0.85 : 0.18})`;ctx.fillRect(r.x,r.y,r.w,r.h);
        }
        game.drawNoiseRipples(ctx);
        if(game.flitVFX.length)game.drawFlitVFX(ctx);
        for(const packet of drones)packet.drawLights(ctx);for(const packet of cats){const room=game.roomSystem.getRoomAt(packet.x,packet.y);packet.drawEyeShine(ctx,room?.type==='outdoor'?game.getAmbientDarkness():(room?.lightsOff ? .85 : .18));}game.drawPlayerGlow(ctx);game.drawApartmentGlow(ctx,props);for(const packet of marionettes)drawMarionetteAppearance(ctx,packet,true);for(const packet of gunners)drawGunnerAppearance(ctx,packet,true);
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
