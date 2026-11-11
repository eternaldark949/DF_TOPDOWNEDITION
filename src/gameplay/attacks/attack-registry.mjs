import {identifier,jsonCopy} from '../values.mjs';
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

const synchronous=callback=>(...args)=>{const result=callback(...args);if(result&&typeof result.then==='function')throw new TypeError('Attack callbacks must be synchronous');return result;};

/** Definition/type registration only. Actor ownership and execution belong to attackSystem. */
export class attackRegistry{
 #types=new Map();#definitions=new Map();#boundary;
 constructor({assert_boundary=()=>{}}={}){this.#boundary=assert_boundary;}
 registerAttackType(type_id,{canUse=()=>true,execute,validateDefinition=()=>{}}={}){
  this.#boundary();identifier(type_id);if(this.#types.has(type_id))throw new Error(`Attack type already registered: ${type_id}`);
  if(typeof canUse!=='function'||typeof execute!=='function'||typeof validateDefinition!=='function')throw new TypeError('Attack types require canUse/execute functions');
  if([canUse,execute,validateDefinition].some(callback=>callback.constructor.name==='AsyncFunction'))throw new TypeError('Attack callbacks must be synchronous');
  this.#types.set(type_id,Object.freeze({type_id,canUse:synchronous(canUse),execute:synchronous(execute),validateDefinition:synchronous(validateDefinition)}));return this;
 }
 registerAttack(definition){
  this.#boundary();const copy=jsonCopy(definition);identifier(copy.attack_id);identifier(copy.attack_type);
  if(!this.#types.has(copy.attack_type))throw new Error(`Register attack type first: ${copy.attack_type}`);
  if(this.#definitions.has(copy.attack_id))throw new Error(`Attack already registered: ${copy.attack_id}`);
  if(!Number.isFinite(copy.range)||copy.range<0)throw new TypeError('Attack range must be finite and nonnegative');
  if(this.#types.get(copy.attack_type).validateDefinition(copy)===false)throw new TypeError('Invalid attack definition');
  this.#definitions.set(copy.attack_id,freeze(copy));return this;
 }
 hasAttack(id){return this.#definitions.has(id);}
 getAttack(id){identifier(id);const definition=this.#definitions.get(id);if(!definition)throw new Error(`Unknown attack: ${id}`);return definition;}
 getAttackType(id){const type=this.#types.get(id);if(!type)throw new Error(`Unknown attack type: ${id}`);return type;}
 listAttackTypes(){return [...this.#types.keys()];}
 listAttacks(){return [...this.#definitions.values()];}
}
export function validateAttackState(state,hasAttack){
 jsonCopy(state);if(!state||state.format_version!==1||Object.keys(state).some(key=>!['format_version','selected_id'].includes(key)))throw new TypeError('Invalid attack selection');
 if(state.selected_id!==null){identifier(state.selected_id);if(!hasAttack(state.selected_id))throw new TypeError(`Unknown selected attack: ${state.selected_id}`);}return state;
}
