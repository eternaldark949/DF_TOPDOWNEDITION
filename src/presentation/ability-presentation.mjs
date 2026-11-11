/** Spell artwork is disposable renderer data. No launch, damage or timer work happens here. */
export class abilityPresentation{
 render(context,blend,frame){
  for(const {entity} of context.api.render.getVisibleEntities({blend})){
   const data=entity?.data;if(!data?.ability_id||data.role!=='projectile')continue;
   const pose=entity.getRenderState(blend),radius=data.visual_radius??5;
   frame.submit({type:'shape',position:pose.position,rotation:pose.rotation,geometry:{type:'ellipse',radii:[radius,radius]},material:{fill:data.color,shadow:{color:data.flash_color??data.color,blur:data.flash_radius/4}},layer:30});
  }
 }
}
