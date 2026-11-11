import {identifier,jsonCopy} from '../values.mjs';
const components=new WeakMap();
/** Learned capabilities, separate from carried items and physical/attack state. */
export class abilityLoadout{
 #data;#catalog;
 constructor(data={},catalog){this.#data=data;this.#catalog=catalog;if(!Object.keys(data).length)Object.assign(data,{format_version:1,known_ids:[],equipped_id:null});this.validate();}
 get equipped_id(){return this.#data.equipped_id;}
 getDefinition(id){identifier(id);const definition=this.#catalog[id];if(!definition)throw new Error(`Unknown ability: ${id}`);return definition;}
 hasAbility(id){return this.#data.known_ids.includes(id);}
 learnAbility(id){this.getDefinition(id);if(this.hasAbility(id))return false;this.#data.known_ids.push(id);return true;}
 equipAbility(id){if(id!==null){this.getDefinition(id);if(!this.hasAbility(id))throw new Error('Learn an ability before equipping it');}this.#data.equipped_id=id;return this.getEquippedAbility();}
 forgetAbility(id){const index=this.#data.known_ids.indexOf(id);if(index<0)return false;this.#data.known_ids.splice(index,1);if(this.equipped_id===id)this.equipAbility(null);return true;}
 getEquippedAbility(){return this.equipped_id===null?null:this.getDefinition(this.equipped_id);}
 validate(){const data=this.#data;jsonCopy(data);if(data.format_version!==1||Object.keys(data).some(key=>!['format_version','known_ids','equipped_id'].includes(key))||!Array.isArray(data.known_ids)||new Set(data.known_ids).size!==data.known_ids.length)throw new TypeError('Invalid ability loadout');for(const id of data.known_ids)this.getDefinition(id);if(data.equipped_id!==null&&!this.hasAbility(data.equipped_id))throw new TypeError('Equipped ability must be learned');return this;}
 snapshot(){return jsonCopy(this.#data);}
 load(snapshot){const copy=jsonCopy(snapshot);if(copy?.format_version!==1)throw new TypeError('Invalid ability loadout');new abilityLoadout(copy,this.#catalog);for(const key of Object.keys(this.#data))delete this.#data[key];Object.assign(this.#data,copy);}
}
export function actorAbilities(data,catalog){const previous=components.get(data);if(previous&&previous.root===data.abilities)return previous.component;data.abilities??={};const component=new abilityLoadout(data.abilities,catalog);components.set(data,{root:data.abilities,component});return component;}
