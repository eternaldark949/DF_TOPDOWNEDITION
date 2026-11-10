import { gameCharacter } from '../basement/physics/index.mjs';
import { identifier, jsonCopy, nonnegative } from '../gameplay/values.mjs';
const services = new WeakMap();
function emitPlayer(player,event,detail = {}) { services.get(player)?.emit?.(event,{entity_id:player.entity_id,...detail}); }
function playerState(player) {
    if(!player.data.player_state)throw new Error('Initialize Player gameplay state before using player rules');
    return player.data.player_state;
}
function validateModifiers(modifiers) {
    const copy=jsonCopy(modifiers);
    if(!copy || typeof copy!=='object' || Array.isArray(copy))throw new TypeError('Buff modifiers must be a record');
    for(const modifier of Object.values(copy)) {
        if(!modifier || typeof modifier!=='object' || Array.isArray(modifier) || Object.keys(modifier).some(key=>!['add','multiply'].includes(key)))throw new TypeError('Buff modifiers require add and/or multiply');
        if(modifier.add!==undefined&&!Number.isFinite(modifier.add))throw new TypeError('Buff addition must be finite');
        if(modifier.multiply!==undefined)nonnegative(modifier.multiply,'buff multiplier');
    }
    return copy;
}


/** Official gameplay identity; native body/controller own all physical state. */
export class Player extends gameCharacter {
    static entity_type = 'df_player';
    connectGameplay({ emit, is_invulnerable, on_damage, buff_system } = {}) {
        for(const callback of [emit,is_invulnerable,on_damage])if(callback!==undefined&&typeof callback!=='function')throw new TypeError('Gameplay callbacks must be functions');
        services.set(this,{emit,is_invulnerable,on_damage,buff_system}); return this;
    }
    disconnectGameplay() { services.delete(this); }
    get buffSystem() { return services.get(this)?.buff_system; }
    get visible() { return this.data.visible !== false; }
    set visible(value) { this.data.visible = !!value; }
    get hp() { return this.data.health ?? 0; }
    set hp(value) { this.data.health = Math.min(nonnegative(value,'health'),this.maxHp); }
    get maxHp() { return this.data.max_health ?? 0; }
    set maxHp(value) { nonnegative(value,'max_health');if(value===0)throw new TypeError('max_health must be positive');this.data.max_health=value;this.hp=this.hp; }
    get dead() { return this.hp <= 0; }
    get alliance() { return 'friendly'; }
    get radius() { return this.collision_shape.radius; }
    get isHidden() { return !!this.data.hidden; }
    set isHidden(value) { this.data.hidden = !!value; }
    get sneaking() { return !!this.data.player_state?.sneaking; }
    set sneaking(value) { playerState(this).sneaking=!!value; }
    get flitting() { return (this.data.player_state?.flit_remaining ?? 0)>0; }
    get attunement() { return this.data.player_state?.attunement ?? 0; }
    initializeState(rules) {
        if(this.data.player_state){
            const state=jsonCopy(this.data.player_state);
            if(state.format_version!==1 || typeof state.sneaking!=='boolean' || !state.buffs || Array.isArray(state.buffs) || typeof state.buffs!=='object')throw new TypeError('Invalid saved Player state');
            for(const key of ['attunement','flit_remaining','invulnerable_remaining','seconds_since_damage','regeneration_elapsed'])nonnegative(state[key],key);
            nonnegative(this.data.health,'health');nonnegative(this.data.max_health,'max_health');
            if(this.maxHp<=0 || this.hp>this.maxHp || state.attunement>rules.flit.capacity)throw new TypeError('Invalid saved Player health or attunement');
            for(const [id,buff] of Object.entries(state.buffs)){identifier(id);nonnegative(buff.remaining,'buff duration');validateModifiers(buff.modifiers);}
            return this;
        }
        this.syncHealth(this.data.health ?? rules.max_health,this.data.max_health ?? rules.max_health);
        this.data.player_state={format_version:1,attunement:rules.flit.capacity,flit_remaining:0,invulnerable_remaining:0,seconds_since_damage:0,regeneration_elapsed:0,sneaking:false,buffs:{}};
        return this;
    }
    syncHealth(health, maximum=this.maxHp) {
        nonnegative(health,'health');nonnegative(maximum,'max_health');if(maximum===0)throw new TypeError('max_health must be positive');
        this.data.max_health=maximum;this.data.health=Math.min(health,maximum);
    }
    takeDamage(amount, { impulse, bypass_invulnerability=false, source=null } = {}) {
        nonnegative(amount,'damage'); const state=this.data.player_state;
        if(this.dead || amount===0 || this.flitting || services.get(this)?.is_invulnerable?.() || !bypass_invulnerability && state?.invulnerable_remaining>0)return false;
        // A supplied impulse is already a physical command, never reconstructed from damage here.
        if(impulse)this.body.applyImpulse(impulse);
        const applied=Math.min(this.hp,amount);this.hp-=applied;
        if(state){state.seconds_since_damage=0;state.regeneration_elapsed=0;}
        services.get(this)?.on_damage?.({player:this,amount:applied});
        emitPlayer(this,'player:damaged',{amount:applied,health:this.hp,source});
        if(this.dead){this.cancelMovement();emitPlayer(this,'player:died',{source});}
        return true;
    }
    heal(amount) {
        nonnegative(amount,'healing');if(this.dead || amount===0)return 0;
        const applied=Math.min(this.maxHp-this.hp,amount);this.hp+=applied;
        if(applied)emitPlayer(this,'player:healed',{amount:applied,health:this.hp});return applied;
    }
    makeInvulnerable(seconds) { playerState(this).invulnerable_remaining=nonnegative(seconds,'invulnerability'); }
    beginFlit(cost,seconds) {
        nonnegative(cost,'Flit cost');nonnegative(seconds,'Flit duration');const state=playerState(this);
        if(state.attunement<cost)throw new Error('Insufficient attunement');
        state.attunement-=cost;state.flit_remaining=seconds;emitPlayer(this,'player:flitted',{attunement:state.attunement});
    }
    addBuff(buff_id,{duration_seconds,modifiers={}}) {
        identifier(buff_id);nonnegative(duration_seconds,'buff duration');
        const copy=validateModifiers(modifiers);
        playerState(this).buffs[buff_id]={remaining:duration_seconds,modifiers:copy};
        emitPlayer(this,'player:buff-added',{buff_id});return this;
    }
    getStat(stat,base) {
        nonnegative(base,'base stat');let add=0,multiply=1;
        for(const buff of Object.values(this.data.player_state?.buffs ?? {})) {
            if(buff.remaining<=0)continue;
            const modifier=buff.modifiers[stat];if(modifier){add+=modifier.add??0;multiply*=modifier.multiply??1;}
        }
        return Math.max(0,(base+add)*multiply);
    }
    advanceState(seconds,rules) {
        nonnegative(seconds,'elapsed seconds');const state=playerState(this);
        state.flit_remaining=state.flit_remaining<=seconds+1e-9?0:state.flit_remaining-seconds;
        state.invulnerable_remaining=state.invulnerable_remaining<=seconds+1e-9?0:state.invulnerable_remaining-seconds;
        for(const [buff_id,buff] of Object.entries(state.buffs)) {
            buff.remaining=buff.remaining<=seconds+1e-9?0:buff.remaining-seconds;
            if(buff.remaining===0){delete state.buffs[buff_id];emitPlayer(this,'player:buff-expired',{buff_id});}
        }
        if(this.dead)return;
        state.attunement=Math.min(rules.flit.capacity,state.attunement+rules.flit.recharge_per_second*seconds);
        const previous=state.seconds_since_damage;state.seconds_since_damage+=seconds;
        const regeneration=rules.regeneration;
        state.regeneration_elapsed+=Math.max(0,state.seconds_since_damage-Math.max(previous,regeneration.delay_seconds));
        const intervals=Math.floor((state.regeneration_elapsed+1e-9)/regeneration.interval_seconds);
        if(intervals){state.regeneration_elapsed=Math.max(0,state.regeneration_elapsed-intervals*regeneration.interval_seconds);this.heal(intervals*this.getStat('regeneration',regeneration.amount));}
    }
    resetState(rules) {
        this.data.player_state=null;this.syncHealth(rules.max_health,rules.max_health);this.initializeState(rules);
    }
}
