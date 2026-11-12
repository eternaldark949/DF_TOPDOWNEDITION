// ===== LV0 BASEMENT =====
import {clone,number} from '../core/values.mjs';
import {rigDefinition,definitionRecord} from './rig-definition.mjs';
import {name,transform,fields,matrix,multiply,describe,blendTransform} from './values.mjs';
/** Mutable local pose with cached hierarchy resolution; all public reads are detached. */
export class rigPose{
 #definition;#local;#rest;#resolved=[];#dirty=true;#revision=0;
 constructor(definition){this.#definition=definition instanceof rigDefinition?definition:new rigDefinition(definition);this.#local=definitionRecord(this.#definition).joints.map(joint=>transform({position:joint.position,rotation:joint.rotation,scale:joint.scale}));this.#rest=this.#local;}
 get definition(){return this.#definition;}
 get revision(){return this.#revision;}
 #index(id){const i=definitionRecord(this.#definition).index.get(name(id));if(i===undefined)throw new TypeError('Unknown rig joint');return i;}
 resetPose(){this.#install(this.#rest);return this;}
 #install(next){if(next.every((t,i)=>{const p=this.#local[i];return t.rotation===p.rotation&&t.position[0]===p.position[0]&&t.position[1]===p.position[1]&&t.scale[0]===p.scale[0]&&t.scale[1]===p.scale[1];}))return;this.#local=next;this.#dirty=true;this.#revision++;}
 setJoint(id,packet){return this.setPose({[name(id)]:packet});}
 setPose(packet,{weight=1,additive=false,mask=null}={}){
  fields(packet,Object.keys(packet));number(weight,'pose weight',0,1);if(typeof additive!=='boolean'||mask!==null&&(!Array.isArray(mask)||new Set(mask).size!==mask.length))throw new TypeError('Invalid pose blend');if(mask)for(const id of mask)this.#index(id);
  const record=definitionRecord(this.#definition),next=[...this.#local];
  for(const [id,changes] of Object.entries(packet)){const i=this.#index(id);fields(changes,['position','rotation','scale']);const base=additive?{position:[0,0],rotation:0,scale:[1,1]}:next[i],valid=transform(changes,base),partial=Object.fromEntries(Object.keys(changes).map(key=>[key,valid[key]]));if(mask&&!mask.includes(id))continue;let result=blendTransform(next[i],partial,weight,additive),limits=record.joints[i].limits;if(limits)result.rotation=Math.max(limits.min_rotation,Math.min(limits.max_rotation,result.rotation));next[i]=result;
  }
  this.#install(next);return this;
 }
 getLocalPose(){return Object.fromEntries(this.#definition.getJointNames().map((id,i)=>[id,clone(this.#local[i])]));}
 #resolve(){if(!this.#dirty)return;const r=definitionRecord(this.#definition);for(const i of r.order){const joint=r.joints[i],local=matrix(this.#local[i]);this.#resolved[i]=joint.parent===null?local:multiply(this.#resolved[r.index.get(joint.parent)],local);}this.#dirty=false;}
 getJoint(id,{root}={}){this.#resolve();let m=this.#resolved[this.#index(id)];if(root)m=multiply(matrix(transform(root)),m);return describe(m);}
 getAnchor(id,{root}={}){name(id);const anchors=definitionRecord(this.#definition).anchors,anchor=Object.hasOwn(anchors,id)?anchors[id]:null;if(!anchor)throw new TypeError('Unknown rig anchor');this.#resolve();let m=multiply(this.#resolved[this.#index(anchor.joint)],matrix(anchor));if(root)m=multiply(matrix(transform(root)),m);return describe(m);}
 getSnapshot(){return {format_version:1,rig_id:this.#definition.rig_id,locals:this.getLocalPose()};}
 load(snapshot){fields(snapshot,['format_version','rig_id','locals']);if(snapshot.format_version!==1||snapshot.rig_id!==this.#definition.rig_id||Object.keys(snapshot.locals??{}).length!==this.#local.length)throw new TypeError('Invalid rig pose snapshot');const r=definitionRecord(this.#definition),next=r.joints.map(joint=>{if(!Object.hasOwn(snapshot.locals,joint.name))throw new TypeError('Missing joint pose');const value=transform(snapshot.locals[joint.name]);if(joint.limits&&(value.rotation<joint.limits.min_rotation||value.rotation>joint.limits.max_rotation))throw new TypeError('Saved pose exceeds joint limits');return value;});for(const id of Object.keys(snapshot.locals))this.#index(id);this.#install(next);return this;}
}
