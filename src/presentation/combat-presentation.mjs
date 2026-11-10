import {weaponAppearance} from './weapon-appearance.mjs';

/** Reads the existing visible-entity query; all output is disposable renderer data. */
export class combatPresentation{
 #art;#owns;
 constructor({weapon_art,owns_art=false}={}){if(!weapon_art)throw new TypeError('Prepared weapon art is required');this.#art=weapon_art;this.#owns=owns_art;}
 render(context,blend,frame){
  const api=context.api;
  for(const {entity}of api.render.getVisibleEntities({blend})){
   if(!entity)continue;const data=entity.data,pose=entity.getRenderState(blend);
   if(data.role==='projectile'&&!data.melee&&!data.ability_id){
    frame.submit({type:'shape',position:pose.position,rotation:pose.rotation,geometry:{type:'ellipse',radii:[5,2]},material:{fill:data.color??'#ffd891'},layer:30});
   }else if(entity.entity_type==='df_world_loot'){
    const definition=api.items.getDefinition(entity.definition_id);
    if(definition.type==='weapon')this.#art.draw(frame,entity.definition_id,{position:pose.position,rotation:pose.rotation,layer:20});
    else frame.submit({type:'shape',position:pose.position,rotation:pose.rotation,geometry:{type:'rect',size:[10,10],radius:2},material:{fill:definition.type==='consumable'?'#78e4bd':'#b594ff'},layer:20});
   }
   const controller=api.weapons.getActorController(entity);
   if(controller)this.#held(frame,api,entity,api.attacks.getItems(entity),controller,blend);
   const state=data.combat_state;
   if(state?.bleed)frame.submit({type:'text',text:'●'.repeat(state.bleed.stacks),position:pose.position,font:{size:10},align:'center',baseline:'bottom',matrix:[1,0,0,1,pose.position[0],pose.position[1]-22],material:{fill:'#ff2a4a'},layer:40});
   if(state?.orbs.length)frame.submit({type:'text',text:'✦'.repeat(state.orbs.length),matrix:[1,0,0,1,pose.position[0],pose.position[1]-12],font:{size:10},align:'center',material:{fill:'#ffd76a'},layer:40});
  }
  const player=api.session.player;if(player)this.#held(frame,api,player,api.items,api.weapons,blend);
 }
 #held(frame,api,actor,items,weapons,blend){
  const weapon=items.getEquippedWeapon();
  if(actor.visible!==false&&weapon&&!weapons.holstered&&['normal','sniper','melee'].includes(weapon.weaponMode)){
   const swing=weapons.getSwingPose(),pose=api.physics.getBodyPoint(actor,swing?[swing.handX,swing.handY]:[8,9],{blend,local_rotation:swing?.a??0});
   this.#art.draw(frame,weapon.definition_id,{position:pose.position,rotation:pose.rotation,laser:items.hasAttachment('laser_sight'),layer:25});
  }
 }
 detach(){if(this.#owns)this.#art.dispose();}
}
export async function installCombatPresentation(engine){
 const art=await new weaponAppearance().prepare(engine.api.render);
 try{engine.registerSystem('combat-presentation',new combatPresentation({weapon_art:art,owns_art:true}));return art;}catch(error){art.dispose();throw error;}
}
