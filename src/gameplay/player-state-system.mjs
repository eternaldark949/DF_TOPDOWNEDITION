import { nonnegative, jsonCopy } from './values.mjs';

/** Game rules only. The native entity/body remains the sole owner of physical state. */
export class PlayerStateSystem {
    #session; #rules; #context = null;
    constructor({ session, rules }) {
        this.#session=session; this.#rules=jsonCopy(rules);
        for(const key of ['max_health','movement_speed','sneak_speed_factor'])nonnegative(this.#rules[key],key);
        if(this.#rules.max_health===0)throw new TypeError('max_health must be positive');
        for(const key of ['delay_seconds','interval_seconds','amount'])nonnegative(this.#rules.regeneration?.[key],key);
        for(const key of ['capacity','cost','recharge_per_second','distance','invulnerability_seconds','minimum_distance'])nonnegative(this.#rules.flit?.[key],key);
        if(!(this.#rules.regeneration.interval_seconds>0))throw new TypeError('Regeneration interval must be positive');
    }
    get player() { return this.#session.player; }
    attach(context) {
        const player=this.player;
        if(!player)throw new Error('Attach the session before player state');
        player.initializeState(this.#rules);
        this.#context=context;
        player.connectGameplay({emit:(event,detail)=>this.#session.emit(event,detail)});
        context.defer(()=>{this.#context=null;player.disconnectGameplay();});
    }
    beforePhysics(context, seconds) { this.player?.advanceState(seconds, this.#rules); }
    get movement_speed() { return this.player.getStat('speed',this.#rules.movement_speed) * (this.player.sneaking ? this.#rules.sneak_speed_factor : 1); }
    #actionBoundary() {
        if(!this.#context)throw new Error('Player state is not attached');
        if(!['idle','beforePhysics','afterPhysics'].includes(this.#context.engine.phase))throw new Error('Request abilities at a gameplay boundary, outside physics callbacks and rendering');
        return !this.#context.engine.paused && !!this.#context.engine.active_level;
    }
    tryFlit({ direction, placement_bounds } = {}) {
        if(!this.#actionBoundary())return false;
        const player=this.player, rules=this.#rules.flit;
        if (!player || player.dead || player.isHidden || player.flitting || player.physics_system.getAttachmentState(player.body)) return false;
        const cost=player.getStat('flitCooldown',rules.cost);
        if(player.attunement < cost)return false;
        // Placement, direction normalization and collision queries are entirely Basement's job.
        const landed=player.teleportInDirection(direction,{distance:player.getStat('flitDistance',rules.distance),placement_mode:'clear',min_distance:rules.minimum_distance,...(placement_bounds ? {placement_bounds} : {})});
        if(!landed)return false;
        player.beginFlit(cost,rules.invulnerability_seconds);
        return true;
    }
    respawn({position, ...placement} = {}) {
        if(!this.#actionBoundary())return false;
        const player=this.player;
        if(!player || !player.dead) return false;
        if(player.physics_system.getAttachmentState(player.body))return false;
        if(!player.teleportTo(position,{...placement,placement_mode:'clear'}))return false;
        player.resetState(this.#rules);
        this.#session.emit('player:respawned',{entity_id:player.entity_id});return true;
    }
}
