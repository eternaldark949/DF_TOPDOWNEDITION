import enemies from './game-db/enemies.json' with {type:'json'};
/** Authored Drone balance is converted once to seconds and pixels per second. */
export function createDroneRules(def=enemies.drone,kind=enemies.kinds.drone){return {flight:def,health:def.HP,mass:kind.mass,radius:kind.radius,speed:kind.speed*60,damage_grace_seconds:kind.invincible_frames/60};}
export function createDroneAbilities(d=enemies.drone){
 const base={speed:0,spread:0,local_position:[d.EYE_FWD,0],radius:5,color:'#a469ff',flash_color:'#b98aff',flash_radius:32,impact_strength:40,damage_type:'energy',allow_mounted:false};
 return {
 drone_bolt:{...base,name:'Violet bolt',delivery:'bolt',tell_seconds:d.BOLT_TELL,lock_seconds:0,cooldown_seconds:d.BOLT_EVERY,damage:10,speed:900,lifetime:1,range:500},
 drone_lance:{...base,name:'Lance dive',delivery:'lunge',cooldown_seconds:d.LANCE.EVERY,range:d.LANCE.RANGE,tell_seconds:d.LANCE.TELL,lock_seconds:d.LANCE.LOCK,speed:d.LANCE.SPEED*60,acceleration:90000,drive_seconds:d.LANCE.DIST/(d.LANCE.SPEED*60),lunge_seconds:d.LANCE.DIST/(d.LANCE.SPEED*60),recover_seconds:d.LANCE.RECOVER,damage:d.LANCE.HIT,hit_shape:{shape_type:'circle',radius:34},burn:{damage:d.LANCE.BURN_DPS*.5,interval_seconds:.5,ticks:d.LANCE.BURN_SECS/.5,max_orbs:1}},
 drone_beam:{...base,name:'Sensor beam',delivery:'beam',cooldown_seconds:d.BEAM.EVERY,range:d.BEAM.RANGE,tell_seconds:d.BEAM.CHARGE,lock_seconds:d.BEAM.LOCK,fire_seconds:d.BEAM.FIRE,width:d.BEAM.WIDTH,penetrating:true,damage:d.BEAM.HIT,burn:{damage:2,interval_seconds:.5,ticks:3,max_orbs:1}},
 drone_grapple:{...base,name:'Lance grapple',delivery:'grapple',cooldown_seconds:d.GRAPPLE.EVERY,range:d.GRAPPLE.RANGE,tell_seconds:d.GRAPPLE.TELL,lock_seconds:.1,speed:d.GRAPPLE.SPEED*60,lifetime:(d.GRAPPLE.RANGE+40)/(d.GRAPPLE.SPEED*60),damage:d.GRAPPLE.HIT,hold_seconds:d.GRAPPLE.SECS,tick_seconds:d.GRAPPLE.TICK,tick_damage:d.GRAPPLE.TICK_DMG,rest_length:d.GRAPPLE.HOLD,stiffness:8,damping:8,max_force:18000},
 drone_landing:{...base,name:'Landing shock',delivery:'area',cooldown_seconds:0,range:d.LAND_R,damage:d.LAND_HIT}
 };}
