import rules from '../../directory/game-actor-rules.json' with {type:'json'};
import {nonnegative,jsonCopy} from '../values.mjs';
function validate(data){nonnegative(data.health,'health');nonnegative(data.max_health,'max_health');if(!data.max_health||data.health>data.max_health)throw new TypeError('Invalid actor health');}
/** Shared health operations over the owner's canonical data, with no physical or UI state. */
export class actorVitals{
 #data;
 constructor(data={}, {max_health=rules.health}={}){this.#data=data;data.max_health??=max_health;data.health??=data.max_health;validate(data);}
 get health(){return this.#data.health;}
 get max_health(){return this.#data.max_health;}
 get dead(){return this.health<=0;}
 validate(){validate(this.#data);return this;}
 setHealth(value){this.#data.health=Math.min(nonnegative(value,'health'),this.max_health);return this.health;}
 setMaximumHealth(value){nonnegative(value,'max_health');if(!value)throw new TypeError('Maximum health must be positive');this.#data.max_health=value;this.setHealth(this.health);return value;}
 importHealth(health,maximum=this.max_health){nonnegative(health,'health');nonnegative(maximum,'max_health');if(!maximum)throw new TypeError('Maximum health must be positive');this.#data.max_health=maximum;this.setHealth(health);}
 restoreHealth(){this.#data.health=this.max_health;}
 heal(amount){nonnegative(amount,'healing');if(this.dead)return 0;const applied=Math.min(amount,this.max_health-this.health);this.setHealth(this.health+applied);return applied;}
 damage(amount){nonnegative(amount,'damage');if(this.dead)return 0;const applied=Math.min(amount,this.health);this.setHealth(this.health-applied);return applied;}
 snapshot(){return {health:this.health,max_health:this.max_health};}
 load(snapshot){const copy=jsonCopy(snapshot);if(!copy||Object.keys(copy).some(key=>!['health','max_health'].includes(key)))throw new TypeError('Invalid actor health snapshot');validate(copy);this.#data.health=copy.health;this.#data.max_health=copy.max_health;}
}
