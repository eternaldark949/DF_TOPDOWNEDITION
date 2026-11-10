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
        Object.assign(packet,{x:pose.position[0],y:pose.position[1],angle:pose.rotation,velX:velocity[0]/60,velY:velocity[1]/60,vx:velocity[0]/60,vy:velocity[1]/60,radius:12,visible:entity.visible!==false&&entity.active,isHidden:!!entity.isHidden,dead:!!entity.dead,walkPhase:packet.walkPhase??0});
        return packet;
    }
    destroy(){PropSprites.clear([...this.props.values()]);this.props.clear();this.people.clear();}
    draw(game,blend=1){
        this.game=game;const level=game.activeLevel,world=level.physics,ctx=game.ctx,canvas=game.canvas;
        const player=this.personPacket(level.player,blend),zoom=game.camera.zoom;
        if(!game._cityView)game._cityView=game._makeAptCityView();
        const cam=game.resolveCameraView(zoom,player);game.view=cam;
        ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0a0810';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(zoom,zoom);ctx.translate(-cam.x,-cam.y);
        game.drawApartmentBackdrop(ctx);game.drawApartmentInterior(ctx);
        const bounds={left:cam.x-canvas.width/(2*zoom)-180,right:cam.x+canvas.width/(2*zoom)+180,top:cam.y-canvas.height/(2*zoom)-180,bottom:cam.y+canvas.height/(2*zoom)+180};
        const visible=world.queryEntitiesInBounds({bounds}),props=[];PropSprites.frame(zoom);
        for(const{entity:e}of visible){
            if(!e)continue;
            if(e.data.role==='wall'){const p=e.getRenderState(blend),[w,h]=e.collision_shape.dimensions;ctx.fillStyle='#291d2d';ctx.fillRect(p.position[0]-w/2,p.position[1]-h/2,w,h);}
            if(e.data.role==='prop'){const p=this.propPacket(e,blend);props.push(p);p.draw(ctx);}
            if(e.data.role==='door'){
                const pose=e.getRenderState(blend),shape=e.collision_shape;ctx.save();ctx.translate(...pose.position);ctx.rotate(pose.rotation);ctx.fillStyle=e.data.appearance.color;
                ctx.fillRect(shape.local_position[0]-shape.dimensions[0]/2,shape.local_position[1]-shape.dimensions[1]/2,...shape.dimensions);ctx.strokeStyle='#9f92a8';ctx.strokeRect(shape.local_position[0]-shape.dimensions[0]/2,shape.local_position[1]-shape.dimensions[1]/2,...shape.dimensions);ctx.restore();
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
            if(entity.data.quip&&world.simulation_tick>=entity.data.quip_start&&world.simulation_tick<entity.data.quip_end)drawSpeechBubble(ctx,packet.x,packet.y-34,entity.data.quip,1);
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
        game.drawPlayerGlow(ctx);game.drawApartmentGlow(ctx,props);
        for(const{entity:e}of visible)if(e?.data.role==='lamp'){
            const a=e.data.appearance,p=e.getRenderState(blend);if(a.visible!==false)drawLampFixtureLit(ctx,a.fixture??'shade_rose',...p.position,a.color,game.roomSystem.lightAt(...p.position),{angle:a.angle??0});
        }
        for(const p of game.projectiles)if(!p.destroyed){const s=p.getRenderState(blend);ctx.fillStyle='#ffd891';ctx.beginPath();ctx.arc(...s.position,2,0,Math.PI*2);ctx.fill();}
        const target=game.furniture.target??game.furniture.cand;
        if(target){const p=target.getRenderState(blend),[w,h]=target.collision_shape.dimensions;ctx.save();ctx.translate(...p.position);ctx.rotate(p.rotation);ctx.strokeStyle='#ead49c';ctx.lineWidth=1.5;ctx.strokeRect(-w/2-3,-h/2-3,w+6,h+6);ctx.restore();}
        if(game.playerEmote.text&&game.playerEmote.age<game.playerEmote.duration)drawSpeechBubble(ctx,player.x,player.y-34,game.playerEmote.text,1);
        game.drawScopeView(ctx);
        ctx.restore();game.drawPlayerMarker(ctx,player);
    }
}
