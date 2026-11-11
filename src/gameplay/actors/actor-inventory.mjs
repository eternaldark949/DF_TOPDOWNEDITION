import {itemSystem} from '../items/item-system.mjs';
import itemRules from '../../directory/game-item-rules.json' with {type:'json'};
import {jsonCopy} from '../values.mjs';
const components=new WeakMap();
export function actorItems(data,owner_id,catalog){
 const prior=components.get(data);if(prior&&prior.root===data.inventory)return prior.items;
 data.inventory??={};const items=new itemSystem({data:data.inventory,catalog,rules:{...itemRules,owner_id:data.inventory.owner_id??owner_id}});components.set(data,{root:data.inventory,items});return items;
}
export function restoreActorItems(data,snapshot,catalog){
 const copy=jsonCopy(snapshot),items=new itemSystem({data:copy,catalog,rules:{...itemRules,owner_id:copy.owner_id}});data.inventory=copy;components.set(data,{root:copy,items});return items;
}
