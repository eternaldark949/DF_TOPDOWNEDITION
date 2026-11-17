// ===== LV0 BASEMENT =====
import {clone,number} from '../core/values.mjs';
import {rigDefinition,definitionRecord} from './rig-definition.mjs';
import {name,transform,fields,matrix,multiply,describe,blendTransform,CHANNELS} from './values.mjs';
/** Mutable local pose with cached hierarchy resolution; all public reads are detached. */
export class rigPose{
 #definition;#local;#rest;#resolved=[];#heights=[];#pitches=[];#dirty=true;#revision=0;
 constructor(definition){this.#definition=definition instanceof rigDefinition?definition:new rigDefinition(definition);this.#local=definitionRecord(this.#definition).joints.map(joint=>transform({position:joint.position,rotation:joint.rotation,scale:joint.scale,height:joint.height,pitch:joint.pitch}));this.#rest=this.#local;}
 get definition(){return this.#definition;}
 get revision(){return this.#revision;}
 #index(id){const i=definitionRecord(this.#definition).index.get(name(id));if(i===undefined)throw new TypeError('Unknown rig joint');return i;}
 resetPose(){this.#install(this.#rest);return this;}
 #install(next){if(next.every((t,i)=>{const p=this.#local[i];return t.rotation===p.rotation&&t.position[0]===p.position[0]&&t.position[1]===p.position[1]&&t.scale[0]===p.scale[0]&&t.scale[1]===p.scale[1]&&t.height===p.height&&t.pitch===p.pitch;}))return;this.#local=next;this.#dirty=true;this.#revision++;}
 setJoint(id,packet){return this.setPose({[name(id)]:packet});}
 setPose(packet,{weight=1,additive=false,mask=null}={}){
  fields(packet,Object.keys(packet));number(weight,'pose weight',0,1);if(typeof additive!=='boolean'||mask!==null&&(!Array.isArray(mask)||new Set(mask).size!==mask.length))throw new TypeError('Invalid pose blend');if(mask)for(const id of mask)this.#index(id);
  const record=definitionRecord(this.#definition),next=[...this.#local];
  for(const [id,changes] of Object.entries(packet)){const i=this.#index(id);fields(changes,CHANNELS);const base=additive?{position:[0,0],rotation:0,scale:[1,1],height:0,pitch:0}:next[i],valid=transform(changes,base),partial=Object.fromEntries(Object.keys(changes).map(key=>[key,valid[key]]));if(mask&&!mask.includes(id))continue;let result=blendTransform(next[i],partial,weight,additive),limits=record.joints[i].limits;if(limits)result.rotation=Math.max(limits.min_rotation,Math.min(limits.max_rotation,result.rotation));next[i]=result;
  }
  this.#install(next);return this;
 }
 getLocalJoint(id){return clone(this.#local[this.#index(id)]);}
 getLocalPose(){return Object.fromEntries(this.#definition.getJointNames().map((id,i)=>[id,clone(this.#local[i])]));}
 // A joint's frame on the ground is its parent's, carried along the parent's bone: [x, y] with x shortened
 // by the cosine of the parent's pitch (a tilted bone looks shorter from above) and the rest of x rising
 // as height. Heights count in the parent's length along x, so a bigger rig is taller too. Pitch adds up
 // down the chain; the ground matrix keeps the turn and scale (it never folds flat), and drawing shortens
 // a joint's own x by the cosine of its pitch.
 #resolve(){if(!this.#dirty)return;const r=definitionRecord(this.#definition);for(const i of r.order){const joint=r.joints[i],t=this.#local[i];
  if(joint.parent===null){this.#resolved[i]=matrix(t);this.#heights[i]=t.height;this.#pitches[i]=t.pitch;continue;}
  const p=r.index.get(joint.parent);this.#place(i,t,this.#resolved[p],this.#heights[p],this.#pitches[p]);}this.#dirty=false;}
 #place(i,t,m,z,pitch){const out=carry(t,m,z,pitch);this.#resolved[i]=out.matrix;this.#heights[i]=out.height;this.#pitches[i]=out.pitch;}
 /** A joint in rig space: {position, rotation, scale, matrix, height, pitch}. With `root` ({position, rotation, scale}), in the world:
  *  `elevation` is the root's height above the ground and `height_scale` stretches the rig's heights (the entity's height scale). */
 getJoint(id,{root,elevation=0,height_scale=1}={}){this.#resolve();const i=this.#index(id);return world(this.#resolved[i],this.#heights[i],this.#pitches[i],root,elevation,height_scale);}
 getAnchor(id,{root,elevation=0,height_scale=1}={}){name(id);const anchors=definitionRecord(this.#definition).anchors,anchor=Object.hasOwn(anchors,id)?anchors[id]:null;if(!anchor)throw new TypeError('Unknown rig anchor');this.#resolve();const j=this.#index(anchor.joint),out=carry(anchor,this.#resolved[j],this.#heights[j],this.#pitches[j]);return world(out.matrix,out.height,out.pitch,root,elevation,height_scale);}
 getSnapshot(){return {format_version:1,rig_id:this.#definition.rig_id,locals:this.getLocalPose()};}
 load(snapshot){fields(snapshot,['format_version','rig_id','locals']);if(snapshot.format_version!==1||snapshot.rig_id!==this.#definition.rig_id||Object.keys(snapshot.locals??{}).length!==this.#local.length)throw new TypeError('Invalid rig pose snapshot');const r=definitionRecord(this.#definition),next=r.joints.map(joint=>{if(!Object.hasOwn(snapshot.locals,joint.name))throw new TypeError('Missing joint pose');const value=transform(snapshot.locals[joint.name]);if(joint.limits&&(value.rotation<joint.limits.min_rotation||value.rotation>joint.limits.max_rotation))throw new TypeError('Saved pose exceeds joint limits');return value;});for(const id of Object.keys(snapshot.locals))this.#index(id);this.#install(next);return this;}
}
/** A child's frame from its parent's ground matrix `m`, height `z` and pitch. */
function carry(t,m,z,pitch){const c=Math.cos(pitch),s=Math.sin(pitch),[x,y]=t.position,reach=Math.hypot(m[0],m[1]);
 return {matrix:multiply(m,matrix({...t,position:[x*c,y]})),height:z+(x*s+(t.height??0))*reach,pitch:pitch+(t.pitch??0)};}
function world(m,z,pitch,root,elevation,height_scale){if(root)m=multiply(matrix(transform(root)),m);return {...describe(m),height:root?elevation+z*height_scale:z,pitch};}
