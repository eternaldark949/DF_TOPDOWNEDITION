import {gameActor} from './game-actor.mjs';
import { playerVitals } from '../mechanics/player-vitals.mjs';
import { identifier, nonnegative } from '../../engine/directory/index.mjs';
import { validateModifiers } from '../mechanics/values.mjs';
const services = new WeakMap();
const components = new WeakMap();
function vitalsFor(player,rules) {
    let vitals=components.get(player);
    if(!vitals){vitals=new playerVitals(player.data,rules);components.set(player,vitals);}
    return vitals;
}
function emitPlayer(player,event,detail = {}) { services.get(player)?.emit?.(event,{entity_id:player.entity_id,...detail}); }
function playerState(player) {
    if(!player.data.player_state)throw new Error('Initialize Player gameplay state before using player rules');
    return player.data.player_state;
}
/** Official gameplay identity; native body/controller own all physical state. */
export class Player extends gameActor {
    static entity_type = 'df_player';
    connectGameplay({ emit, is_invulnerable, on_damage, on_death, buff_system } = {}) {
        for(const callback of [emit,is_invulnerable,on_damage,on_death])if(callback!==undefined&&typeof callback!=='function')throw new TypeError('Gameplay callbacks must be functions');
        services.set(this,{emit,is_invulnerable,on_damage,on_death,buff_system}); return this;
    }
    disconnectGameplay() { services.delete(this); }
    get buffSystem() { return services.get(this)?.buff_system; }
    get visible() { return this.data.visible !== false; }
    set visible(value) { this.data.visible = !!value; }
    get vitals() { return vitalsFor(this); }
    get dead() { return this.vitals.dead; }
    get alliance() { return 'friendly'; }
    get radius() { return this.collision_shape.radius; }
    get isHidden() { return !!this.data.hidden; }
    set isHidden(value) { this.data.hidden = !!value; }
    get sneaking() { return !!this.data.player_state?.sneaking; }
    set sneaking(value) { playerState(this).sneaking=!!value; }
    get flitting() { return this.vitals.flitting; }
    get attunement() { return this.vitals.attunement; }
    initializeState(rules) {
        vitalsFor(this,rules).configureRules(rules);
        return this;
    }
    takeDamage(amount, { impulse, bypass_invulnerability=false, source=null } = {}) {
        nonnegative(amount,'damage'); const state=this.data.player_state;
        if(this.dead || amount===0 || this.flitting || services.get(this)?.is_invulnerable?.() || !bypass_invulnerability && state?.invulnerable_remaining>0)return false;
        // A supplied impulse is already a physical command, never reconstructed from damage here.
        if(impulse)this.body.applyImpulse(impulse);
        const applied=this.vitals.damage(amount);
        services.get(this)?.on_damage?.({player:this,amount:applied});
        emitPlayer(this,'player:damaged',{amount:applied,health:this.hp,source});
        if(this.dead){this.cancelMovement();emitPlayer(this,'player:died',{source});services.get(this)?.on_death?.(this);}
        return true;
    }
    heal(amount) {
        nonnegative(amount,'healing');if(this.dead || amount===0)return 0;
        const applied=this.vitals.heal(amount);
        if(applied)emitPlayer(this,'player:healed',{amount:applied,health:this.hp});return applied;
    }
    makeInvulnerable(seconds) { this.vitals.makeInvulnerable(seconds); }
    beginFlit(cost,seconds) {
        this.vitals.beginFlit(cost,seconds);emitPlayer(this,'player:flitted',{attunement:this.attunement});
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
        for(const [buff_id,buff] of Object.entries(state.buffs)) {
            buff.remaining=buff.remaining<=seconds+1e-9?0:buff.remaining-seconds;
            if(buff.remaining===0){delete state.buffs[buff_id];emitPlayer(this,'player:buff-expired',{buff_id});}
        }
        const healed=this.vitals.advance(seconds,{regeneration_delay:rules.regeneration.delay_seconds,regeneration_interval:rules.regeneration.interval_seconds,regeneration_amount:this.getStat('regeneration',rules.regeneration.amount)});
        if(healed)emitPlayer(this,'player:healed',{amount:healed,health:this.hp});
    }
    resetState(rules) {
        this.vitals.configureRules(rules).reset();
    }
}
