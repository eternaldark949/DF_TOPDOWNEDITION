import {WorldLoot} from '../../entities/world-loot.mjs';
import rules from '../../directory/game-combat-rules.json' with {type:'json'};
import {BODY_GROUP} from '../../basement/physics/index.mjs';
import {jsonCopy,nonnegative} from '../values.mjs';

/** World ownership and pickup policy. Placement, motion, bounds and proximity use the existing engine. */
export class lootSystem{
 #context=null;#items;#player;#rules;#ids=new Set();#instances=new Map();#contents=new Map();#emit;
 constructor({items,get_player,rules:settings=rules.loot,on_event}={}){if(!items||typeof get_player!=='function')throw new TypeError('Loot requires items and a player lookup');this.#items=items;this.#player=get_player;this.#rules=jsonCopy(settings);this.#emit=on_event;}
 attach(context){if(this.#context)throw new Error('Loot is already attached');this.#context=context;if(!context.api.elements.listEntityTypes().includes(WorldLoot.entity_type))context.api.elements.registerEntityType(WorldLoot.entity_type,WorldLoot);this.reconnectGameplay();}
 detach(){this.#ids.clear();this.#instances.clear();this.#contents.clear();this.#context=null;}
 getEntities(){return [...this.#ids].map(id=>this.#context.api.elements.fetchEntity(id)).filter(entity=>entity&&!entity.destroyed);}
 #spawnBundle(bundle,{position,rotation,source=this.#player(),delay_seconds=this.#rules.pickup_delay_seconds}={}){
  nonnegative(delay_seconds,'pickup delay');const data=jsonCopy(bundle);
  // Validate the transfer independently without acquiring it in a second inventory.
  this.#items.validateBundle(data);for(const record of data.records)if(this.#instances.has(record.instance_id))throw new Error('Item instance is already present in world loot');
  const world=this.#context.api.physics,pose=source?world.getBodyPoint(source,this.#rules.drop_local_position):null,at=position??pose?.position;
  const entity=this.#context.createEntity({template:'df:world_loot',entity_type:WorldLoot.entity_type,position:at,rotation:rotation??pose?.rotation??0,data:{role:'world_loot',item_bundle:data,pickup_remaining:delay_seconds}});
  this.#ids.add(entity.entity_id);for(const record of data.records)this.#instances.set(record.instance_id,entity.entity_id);this.#contents.set(entity.entity_id,data.records.map(record=>record.instance_id));
  try{if(source){const path=world.getPathClearance({body:entity,from:source.position,to:at,ignore_body:[source,entity],include_ghosts:false});if(!path.clear)entity.setPosition(source.position);}}catch(error){this.#forget(entity);entity.destroy();throw error;}
  return entity;
 }
 spawnBundle(bundle,options={}){this.#items.validateBundle(bundle);if(bundle.records.some(record=>this.#items.hasInstance(record.instance_id)))throw new Error('Extract owned items with dropItem');const entity=this.#spawnBundle(bundle,options);this.#emit?.('loot:spawned',{entity_id:entity.entity_id,instance_id:bundle.root_instance_id});return entity;}
 #forgetId(id){this.#ids.delete(id);for(const instance_id of this.#contents.get(id)??[])this.#instances.delete(instance_id);this.#contents.delete(id);}
 #forget(entity){this.#forgetId(entity.entity_id);}
 dropItem(instance_id,options={}){
  const snapshot=this.#items.snapshot(),root=snapshot.records[instance_id];if(!root)throw new Error('Cannot drop an unowned item');if(this.#items.getParentWeapon(instance_id))throw new Error('Detach the attachment before dropping it');
  const bundle={format_version:1,root_instance_id:instance_id,records:[root,...root.attachments.map(id=>snapshot.records[id])]},entity=this.#spawnBundle(bundle,options);
  try{this.#items.extractItem(instance_id);}catch(error){if(this.#items.hasInstance(instance_id)){this.#forget(entity);entity.destroy();}throw error;}
  entity.body.applyImpulse(this.#rules.drop_impulse,{space:'local'});this.#emit?.('loot:spawned',{entity_id:entity.entity_id,instance_id});return entity;
 }
 spawnItem(definition_id,options={}){const record=this.#items.createItem(definition_id,options.item_options);return this.spawnBundle({format_version:1,root_instance_id:record.instance_id,records:[record]},options);}
 pickup(entity_id){
  const context=this.#context,player=this.#player(),entity=context.api.elements.fetchEntity(entity_id);if(!player||player.dead||!this.#ids.has(entity_id)||!entity||entity.data.pickup_remaining>1e-9)return false;
  const nearby=context.api.physics.peruseNearbyEntities(player,{near_range:this.#rules.pickup_range,include_groups:BODY_GROUP.PROP}).some(hit=>hit.entity===entity);if(!nearby)return false;
  if(context.api.physics.raycast({from:player.position,to:entity.position,include_groups:BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE,ignore_body:[player,entity],include_ghosts:false}))return false;
  let received;try{received=this.#items.receiveBundle(entity.bundle);}finally{
   if(this.#items.hasInstance(entity.bundle.root_instance_id)){this.#forget(entity);entity.destroy();}
  }
  if(!received)return false;this.#emit?.('loot:picked-up',{entity_id,instance_id:received.instance_id});return true;
 }
 afterPhysics(context){this.advance(context.api.physics.config.fixed_step);}
 advance(seconds){nonnegative(seconds,'loot step');if(this.#context?.engine?.phase==='render')throw new Error('Rendering cannot advance loot');if(this.#context?.engine?.paused)return;for(const id of this.#ids){const entity=this.#context.api.elements.fetchEntity(id);if(!entity){this.#forgetId(id);continue;}entity.data.pickup_remaining=Math.max(0,entity.data.pickup_remaining-seconds);}
  if(!this.#ids.size)return;const player=this.#player();if(!player||player.dead)return;for(const hit of this.#context.api.physics.peruseNearbyEntities(player,{near_range:this.#rules.pickup_range,include_groups:BODY_GROUP.PROP}))if(this.#ids.has(hit.entity?.entity_id))this.pickup(hit.entity.entity_id);
 }
 reconnectGameplay(){this.#ids.clear();this.#instances.clear();this.#contents.clear();for(const entity of this.#context.api.elements.getEntities({entity_type:WorldLoot.entity_type})){this.#items.validateBundle(entity.bundle);nonnegative(entity.data.pickup_remaining,'pickup delay');this.#ids.add(entity.entity_id);this.#contents.set(entity.entity_id,entity.bundle.records.map(record=>record.instance_id));for(const record of entity.bundle.records){if(this.#instances.has(record.instance_id))throw new Error('Duplicate world item instance');this.#instances.set(record.instance_id,entity.entity_id);}}}
 levelEntered(){this.reconnectGameplay();}
 levelLeaving(){for(const entity of this.getEntities())entity.destroy();this.#ids.clear();this.#instances.clear();this.#contents.clear();}
}
