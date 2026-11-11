/** Normalize existing Hunter authoring once; gameplay and Basement receive engine units. */
export function createHunterRules(kind,{authoring_hz=60}={}){
 return {dash_max:kind.dashes,dash_cooldown:kind.dash_cd/authoring_hz,dash_initial:90/authoring_hz,dash_chain_delay:22/authoring_hz,dash_retry:30/authoring_hz,dash_min_range:150,dash_max_range:420,dash_stop_distance:70,evade_min_cooldown:40/authoring_hz,evade_distance:90,evade_speed:540,evade_chance:.5,evade_cooldown:120/authoring_hz,minimum_visibility:.55,claw_range:kind.claw_reach};
}
/** A learned close-contact capability, using the shared native projectile sweep, not a target-position hit. */
export function createHunterAbilities(kind){
 const radius=18,lifetime=.05;
 return {hunter_claw:{name:'Hunter claw',description:'A short forward claw strike.',cooldown_seconds:.75,damage:kind.claw,speed:(kind.claw_reach-radius)/lifetime,lifetime,spread:0,range:kind.claw_reach,color:'rgba(0,0,0,0)',flash_color:'rgba(0,0,0,0)',flash_radius:0,local_position:[0,0],radius,impact_strength:0,damage_type:'melee',allow_mounted:false}};
}

/** Shared appearance authoring; rendering consumes the resulting record separately. */
export function createHunterAppearance({alpha=false,random=Math.random}={}){
 return {gender:random()<.5?'female':'male',skinColor:['#3a1a1a','#5a2a24','#2a1414','#6a3a30'][Math.floor(random()*4)],eyeColor:'#ff5a1a',blood:'ink',build:alpha?'broad':random()<.5?'athletic':'slim',height:alpha?1.08:.98+random()*.06,top:{type:'coat',color:alpha?'#2a0610':'#120a0e',inner:'#2a0a12',trim:alpha?'#e3a64a':'#7a0618'},bottom:{type:'leggings',color:'#0c0608'},shoes:{type:'boots',color:'#0a0406'},hat:{type:'hood_up',color:alpha?'#3a0614':'#1a0a10'}};
}
