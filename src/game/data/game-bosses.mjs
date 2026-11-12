import enemies from './game-db/enemies.json' with {type:'json'};
export function createBossRules(source=enemies){return {demoness:structuredClone(source.kinds.demoness),duel:structuredClone(source.duel),warden:structuredClone(source.warden),wardens:structuredClone(source.wardens),hazards:structuredClone(source.hazards),rite_limit_radius:1800};}
export function createDemonessAppearance({decoy=false}={}){return {gender:'female',skinColor:'#8a0707',eyeColor:decoy?'#2a0508':'#ff5a1a',blood:'ink',build:'curvy',height:1.14,hair:{type:'demon_dancer',color:'#0a0000'},hat:{type:'demon_horns',color:'#160406',trim:'#e3a64a'},top:{type:'sleeved_crop',color:'#0a0406',trim:'#e3a64a'},bottom:{type:'long_skirt',color:'#0a0406',trim:'#b0122e'},train:{type:'dress_train',color:'#2a0610'},shoes:{type:'heels',color:'#0a0406'}};}
export function createBossAbilities(source=enemies){
 const D=source.duel,W=source.warden,H=source.hazards,K=source.kinds.demoness;
 const pattern=(name,effect,range,cooldown_seconds,tell_seconds=0,extra={})=>({name,delivery:'pattern',effect,range,speed:0,cooldown_seconds,tell_seconds,allow_mounted:false,...extra});
 const claw=(name,damage,range,cooldown_seconds)=>({name,delivery:'projectile',damage,range,cooldown_seconds,speed:(range-18)/.05,lifetime:.05,radius:18,local_position:[0,0],spread:0,impact_strength:0,color:'rgba(0,0,0,0)',flash_color:'rgba(0,0,0,0)',flash_radius:0,damage_type:'melee',allow_mounted:false});
 return {
 demoness_decoy_claw:claw('Decoy claw',K.decoy.claw,K.claw_reach,.75),demoness_decoy_whip:pattern('Decoy whip','whip',120,1.25,0,{damage:K.decoy.whip_dmg}),
 demoness_claw:claw('Demoness claw',K.claw,K.claw_reach,.75),demoness_whip:pattern('Whip claw','whip',120,1.25,0,{damage:K.whip_dmg,repeat_delay:D.WHIP2_DELAY}),
 demoness_whip_double:pattern('Double whip claw','whip',130,1.25,0,{damage:K.whip_dmg,repetitions:2,repeat_delay:D.WHIP2_DELAY}),
 demoness_bolts:pattern('Ember fan','fan',560,D.BOLT_EVERY,D.BOLT_TELL,{count:D.BOLT_FAN,spread:D.BOLT_SPREAD,damage:D.BOLT_DMG,speed:D.BOLT_SPEED*60,lifetime:70/60,radius:6}),
 demoness_sigils:pattern('Ember sigils','sigils',700,D.SIGIL_EVERY[1],0,{count:1,spread:D.SIGIL_SPREAD}),
 demoness_step:pattern('Shadow step','step',520,D.STEP_EVERY,D.STEP_TELL,{distance:D.STEP_BEHIND,damage:Math.round(K.claw*1.2),hit_range:90}),
 demoness_gale:pattern('Wing gale','gale',D.GALE_REACH,D.GALE_EVERY,D.GALE_TELL,{half_angle:D.GALE_SPREAD,damage:D.GALE_HIT,impact_strength:D.GALE_PUSH,guard_seconds:D.GUARD_BREAK}),
 demoness_mirror:pattern('Blood mirror','mirror',D.MIRROR_SPREAD,D.MIRROR_EVERY,0,{distance:D.MIRROR_SPREAD,lifetime:D.MIRROR_SECS}),
 demoness_rite:pattern('Infernal rite','rite',D.RITE_R0,D.RITE_EVERY),
 warden_burst:{name:'Warden rotary burst',delivery:'burst',required_weapon_id:'gatling_gunner',range:900,speed:1440,cooldown_seconds:W.RELOAD/60,tell_seconds:.5,reload_seconds:W.RELOAD/60,burst_count:source.kinds.gatling_gunner.burst_count,allow_mounted:false,require_sight:true},
 warden_censer:pattern('Vesper censer','censer',W.CENSER_RANGE,W.CENSER_EVERY,W.CENSER_WIND,{allow_secondary:true,locks_movement:false}),
 warden_hymn:pattern('Matins hymn','hymn',H.HYMN_RANGE,W.HYMN_EVERY,W.HYMN_CHARGE,{allow_secondary:true,locks_movement:false}),
 warden_hook:{name:'Compline hook',delivery:'grapple',range:W.HOOK_RANGE,speed:H.HOOK_SPEED*60,lifetime:H.HOOK_RANGE/(H.HOOK_SPEED*60),radius:9,local_position:[45,0],cooldown_seconds:W.HOOK_EVERY,tell_seconds:W.HOOK_TELL,lock_seconds:0,damage:H.HOOK_HIT,damage_type:'energy',color:'#cfc6b8',hold_seconds:H.HOOK_PULL_SECS,tick_seconds:1,tick_damage:0,rest_length:H.HOOK_STOP,stiffness:15,damping:8,max_force:24000,stop_when_close:true,allow_mounted:false}
 };
}
