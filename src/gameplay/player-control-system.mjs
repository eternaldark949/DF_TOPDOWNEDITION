/** Turns input terminology into native motor requests and gameplay intents. No physical math. */
export class PlayerControlSystem {
    #session; #state; #blocked = new Set(); #placement; #context = null;
    constructor({session, player_state, placement_bounds} = {}) { this.#session=session; this.#state=player_state; this.#placement=placement_bounds; }
    attach(context) { this.#context=context; }
    block(reason) {
        if(typeof reason!=='string'||!reason)throw new TypeError('Control block requires a reason');
        if(!this.#context)throw new Error('Player controls are not attached');
        this.#context.api.controls.clear();
        const token=Symbol(reason);this.#blocked.add(token);
        this.#session.player?.cancelMovement();this.#session.emit('player:controls-blocked',{reason});
        return ()=>{const released=this.#blocked.delete(token);if(released&&this.#context&&!this.#blocked.size)this.#context.api.controls.clear();return released;};
    }
    beforePhysics(context) {
        const player=this.#session.player, input=context.api.controls;
        if(!player)return;
        if(player.dead || player.isHidden || this.#blocked.size || context.api.physics.getAttachmentState(player.body)) {player.cancelMovement();return;}
        if(input.justActivated('sneak'))player.sneaking=!player.sneaking;
        const aim=input.direction('aim');
        let facing=false,shotAim={};
        if(aim[0] || aim[1]) {player.lookInDirection(aim);shotAim={direction:aim};facing=true;}
        else if(input.active_device==='mouse' && input.pointer().known) {
            const bounds=context.api.render.getSurfaceBounds();
            if(bounds) {const target=context.api.camera.clientToWorld(input.pointer().position,bounds);player.lookAtTarget(target);shotAim={target};facing=true;}
        }
        if(!facing)player.clearFacing();
        player.setMovement(input.direction('move'),{speed:this.#state.movement_speed,face_movement:!facing});
        if(input.justActivated('flit'))this.#state.tryFlit({placement_bounds:this.#placement?.(context)});
        for(const action of ['fire','interact'])if(action==='fire'?input.active(action):input.justActivated(action))this.#session.emit(`player:${action}`,{entity_id:player.entity_id,...(action==='fire'?{aim:shotAim}:{})});
        if(input.justReleased('fire'))this.#session.emit('player:fire-released',{entity_id:player.entity_id,aim:shotAim});
    }
    levelLeaving(context) { this.#session.player?.cancelMovement(); context.api.controls.clear(); }
    detach() { this.#context=null;this.#blocked.clear();this.#session.player?.cancelMovement(); }
}
