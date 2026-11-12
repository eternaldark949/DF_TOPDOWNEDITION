import {weaponModel} from './weapon-models.mjs';
/** Shape authoring belongs with the visual assets. Runtime collision calculations stay in Basement. */
export function getCombatProfile(definition_id){
 const model=weaponModel(definition_id),edge=model.edge??[19.4,2.6];
 return {local_muzzle:model.muzzle??[15,5],swing_style:model.swing??'knife',blade_shape:{shape_type:'capsule',points:[[0,0],edge.map(value=>value*.95)],radius:2}};
}
