import {createDronePackets,dronePresentation} from './drone.mjs';
import {createVelvetCatArt,createVelvetEyePackets} from './velvet-cat.mjs';
import {velvetPresentation} from './velvet-cat-animation.mjs';
/** Portable Drone/Velvet art and actor HUD. Other body artists remain separate. */
export class actorPresentation{
 constructor({get_darkness=()=>.8}={}){this.get_darkness=get_darkness;}
 render(context,blend,frame){
  for(const {entity} of context.api.render.getVisibleEntities({blend})){
   if(entity?.entity_type==='df_drone'&&entity.active){const state=dronePresentation(entity,blend),depth=entity.position[1];for(const packet of createDronePackets(state))frame.submit({...packet,layer:20,depth});for(const packet of createDronePackets(state,{pass:'lights'}))frame.submit({...packet,layer:60,depth});continue;}
   if(entity?.entity_type==='df_velvet_cat'&&entity.visible){const state=velvetPresentation(entity,blend),art=createVelvetCatArt(state),depth=entity.position[1];for(const packet of art.body)frame.submit({...packet,layer:20,depth});for(const packet of createVelvetEyePackets(state,{eyes:art.eyes,darkness:this.get_darkness(entity,context)}))frame.submit({...packet,layer:60,depth});continue;}

   if(!['df_npc','df_ganger','df_hunter'].includes(entity?.entity_type)||!entity.visible)continue;
   const pose=context.api.physics.getBodyPoint(entity,[0,-25],{blend}),state=entity.data;
   const text=state.npc_state?.quip_delay?null:state.npc_state?.quip;
   if(text||entity.name)frame.submit({type:'text',text:text??entity.name,position:pose.position,font:{size:11},align:'center',material:{fill:text?'#fff':'#b9d9ee'},layer:45});
   if(['df_ganger','df_hunter'].includes(entity.entity_type))frame.submit({type:'text',text:`${entity.state} ${Math.round(entity.suspicion)}`,position:context.api.physics.getBodyPoint(entity,[0,-39],{blend}).position,font:{size:10},align:'center',material:{fill:entity.isTelegraphing?'#ff624d':'#efb56d'},layer:45});
  }
 }
}
