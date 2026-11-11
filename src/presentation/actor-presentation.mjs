/** Optional actor HUD packets. Humanoid artwork is a separate artist; no simulation runs here. */
export class actorPresentation{
 render(context,blend,frame){
  for(const {entity} of context.api.render.getVisibleEntities({blend})){
   if(!['df_npc','df_ganger','df_hunter'].includes(entity?.entity_type)||!entity.visible)continue;
   const pose=context.api.physics.getBodyPoint(entity,[0,-25],{blend}),state=entity.data;
   const text=state.npc_state?.quip_delay?null:state.npc_state?.quip;
   if(text||entity.name)frame.submit({type:'text',text:text??entity.name,position:pose.position,font:{size:11},align:'center',material:{fill:text?'#fff':'#b9d9ee'},layer:45});
   if(['df_ganger','df_hunter'].includes(entity.entity_type))frame.submit({type:'text',text:`${entity.state} ${Math.round(entity.suspicion)}`,position:context.api.physics.getBodyPoint(entity,[0,-39],{blend}).position,font:{size:10},align:'center',material:{fill:entity.isTelegraphing?'#ff624d':'#efb56d'},layer:45});
  }
 }
}
