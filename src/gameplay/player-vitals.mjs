import defaults from '../directory/game-player-rules.json' with { type:'json' };
import { nonnegative, jsonCopy, identifier, validateModifiers } from './values.mjs';

/** Shared gameplay component. It references its owner's data; it never owns or mirrors a body. */
export class playerVitals {
    #data; #rules;
    constructor(data = {}, rules = defaults) { this.#data=data; this.configureRules(rules); }
    configureRules(rules) {
        const copy=jsonCopy(rules);
        nonnegative(copy.max_health,'max_health');if(!copy.max_health)throw new TypeError('max_health must be positive');
        for(const key of ['capacity','cost','distance','recharge_per_second','invulnerability_seconds','minimum_distance'])nonnegative(copy.flit?.[key],key);
        for(const key of ['delay_seconds','interval_seconds','amount'])nonnegative(copy.regeneration?.[key],key);
        if(!copy.regeneration.interval_seconds)throw new TypeError('Regeneration interval must be positive');
        this.#rules=copy;
        const data=this.#data;
        data.health ??= copy.max_health;data.max_health ??=copy.max_health;
        data.player_state ??= {format_version:1,attunement:copy.flit.capacity,flit_remaining:0,invulnerable_remaining:0,seconds_since_damage:0,regeneration_elapsed:0,sneaking:false,buffs:{}};
        // Additive version-1 fields: older native saves retain all existing values.
        const state=data.player_state;
        state.max_attunement ??=copy.flit.capacity;state.last_flit_at ??=-99;state.last_hurt_at ??=-99;state.elapsed_seconds ??=0;
        this.validate();return this;
    }
    validate() {
        const data=jsonCopy(this.#data), state=data.player_state;
        nonnegative(data.health,'health');nonnegative(data.max_health,'max_health');
        if(!data.max_health || data.health>data.max_health || state?.format_version!==1 || typeof state.sneaking!=='boolean' || !state.buffs || typeof state.buffs!=='object' || Array.isArray(state.buffs))throw new TypeError('Invalid saved Player state');
        for(const key of ['attunement','max_attunement','flit_remaining','invulnerable_remaining','seconds_since_damage','regeneration_elapsed','elapsed_seconds'])nonnegative(state[key],key);
        if(state.attunement>state.max_attunement || !Number.isFinite(state.last_flit_at) || !Number.isFinite(state.last_hurt_at))throw new TypeError('Invalid saved Player attunement or timestamps');
        for(const [id,buff] of Object.entries(state.buffs)){identifier(id);nonnegative(buff?.remaining,'buff duration');validateModifiers(buff.modifiers);}
        return this;
    }
    get health() { return this.#data.health; }
    get max_health() { return this.#data.max_health; }
    get dead() { return this.health<=0; }
    get state() { return this.#data.player_state; }
    get flitting() { return this.state.flit_remaining>0; }
    get attunement() { return this.state.attunement; }
    get max_attunement() { return this.state.max_attunement; }
    get flit_cost() { return this.#rules.flit.cost; }
    get flit_duration() { return this.#rules.flit.invulnerability_seconds; }
    get flit_distance() { return this.#rules.flit.distance; }
    get flit_minimum_distance() { return this.#rules.flit.minimum_distance; }
    get last_flit_at() { return this.state.last_flit_at; }
    get last_hurt_at() { return this.state.last_hurt_at; }
    setHealth(health) { this.#data.health=Math.min(nonnegative(health,'health'),this.max_health);return this.health; }
    setMaximumHealth(maximum) {
        nonnegative(maximum,'max_health');if(!maximum)throw new TypeError('max_health must be positive');
        this.#data.max_health=maximum;this.setHealth(this.health);return maximum;
    }
    setMaximumAttunement(maximum) { this.state.max_attunement=nonnegative(maximum,'max_attunement');this.setAttunement(this.attunement);return maximum; }
    setAttunement(value) { this.state.attunement=Math.min(nonnegative(value,'attunement'),this.max_attunement);return this.attunement; }
    restoreHealth() { this.#data.health=this.max_health;this.state.seconds_since_damage=0;this.state.regeneration_elapsed=0; }
    importHealth(health, maximum=this.max_health) {
        nonnegative(health,'health');nonnegative(maximum,'max_health');if(!maximum)throw new TypeError('max_health must be positive');
        this.#data.max_health=maximum;this.setHealth(health);
    }
    heal(amount) { nonnegative(amount,'healing');if(this.dead)return 0;const applied=Math.min(this.max_health-this.health,amount);this.setHealth(this.health+applied);return applied; }
    damage(amount, time=this.state.elapsed_seconds) {
        nonnegative(amount,'damage');if(!Number.isFinite(time))throw new TypeError('Damage time must be finite');
        if(this.dead || amount===0)return 0;
        const applied=Math.min(this.health,amount);this.setHealth(this.health-applied);this.recordDamage(time);return applied;
    }
    recordDamage(time=this.state.elapsed_seconds) {
        if(!Number.isFinite(time))throw new TypeError('Damage time must be finite');
        this.state.last_hurt_at=time;this.state.seconds_since_damage=0;this.state.regeneration_elapsed=0;
    }
    makeInvulnerable(seconds) { this.state.invulnerable_remaining=nonnegative(seconds,'invulnerability'); }
    beginFlit(cost,seconds=this.flit_duration,time=this.state.elapsed_seconds) {
        nonnegative(cost,'Flit cost');nonnegative(seconds,'Flit duration');if(!Number.isFinite(time))throw new TypeError('Flit time must be finite');
        if(this.attunement<cost)throw new Error('Insufficient attunement');
        this.state.attunement-=cost;this.state.flit_remaining=seconds;this.state.last_flit_at=time;
    }
    advance(seconds,{regeneration_delay=this.#rules.regeneration.delay_seconds,regeneration_interval=this.#rules.regeneration.interval_seconds,regeneration_amount=this.#rules.regeneration.amount}={}) {
        nonnegative(seconds,'elapsed seconds');nonnegative(regeneration_delay,'regeneration delay');nonnegative(regeneration_interval,'regeneration interval');nonnegative(regeneration_amount,'regeneration amount');
        if(!regeneration_interval)throw new TypeError('Regeneration interval must be positive');
        if(seconds===0)return 0;
        const state=this.state;state.elapsed_seconds+=seconds;
        for(const key of ['flit_remaining','invulnerable_remaining'])state[key]=state[key]<=seconds+1e-9?0:state[key]-seconds;
        if(this.dead)return 0;
        this.setAttunement(this.attunement+this.#rules.flit.recharge_per_second*seconds);
        const previous=state.seconds_since_damage;state.seconds_since_damage+=seconds;
        // Existing game cadence: first heal at the delay, then once per interval.
        const count=time=>time+1e-9<regeneration_delay?0:1+Math.floor((time-regeneration_delay+1e-9)/regeneration_interval);
        return this.heal(Math.max(0,count(state.seconds_since_damage)-(previous===0?0:count(previous)))*regeneration_amount);
    }
    reset() { delete this.#data.player_state;this.#data.health=this.#rules.max_health;this.#data.max_health=this.#rules.max_health;this.configureRules(this.#rules); }
    snapshot() { return jsonCopy({health:this.health,max_health:this.max_health,player_state:this.state}); }
    load(snapshot) {
        const copy=jsonCopy(snapshot);
        if(!copy || typeof copy!=='object' || Array.isArray(copy) || !['health','max_health','player_state'].every(key=>Object.hasOwn(copy,key)) || !copy.player_state || Object.keys(copy).some(key=>!['health','max_health','player_state'].includes(key)))throw new TypeError('Invalid vitals snapshot');
        new playerVitals(copy,this.#rules); // Validate before replacing the live record.
        this.#data.health=copy.health;this.#data.max_health=copy.max_health;this.#data.player_state=copy.player_state;
    }
}
