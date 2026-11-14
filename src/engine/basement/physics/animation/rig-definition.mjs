// ===== LV0 BASEMENT =====
import {clone,freeze,number} from '../core/values.mjs';
import {name,fields,transform} from './values.mjs';
const internals=new WeakMap();
/** Immutable authored hierarchy. Joints/anchors do not create physical bodies. */
export class rigDefinition{
 constructor(packet){fields(packet,['rig_id','joints','anchors']);const rig_id=name(packet.rig_id??'rig');if(!Array.isArray(packet.joints)||!packet.joints.length||packet.joints.length>4096)throw new TypeError('A rig requires 1..4096 joints');
  const index=new Map(),joints=packet.joints.map((joint,i)=>{fields(joint,['name','parent','position','rotation','scale','limits']);const id=name(joint.name);if(index.has(id))throw new TypeError('Duplicate rig joint');index.set(id,i);let limits=null;if(joint.limits!==undefined&&joint.limits!==null){fields(joint.limits,['min_rotation','max_rotation']);limits={min_rotation:number(joint.limits.min_rotation,'minimum rotation'),max_rotation:number(joint.limits.max_rotation,'maximum rotation')};if(limits.min_rotation>limits.max_rotation)throw new TypeError('Reversed joint limits');}const rest=transform(Object.fromEntries(['position','rotation','scale'].filter(key=>joint[key]!==undefined).map(key=>[key,joint[key]])));if(limits&&(rest.rotation<limits.min_rotation||rest.rotation>limits.max_rotation))throw new TypeError('Rest pose exceeds joint limits');return {name:id,parent:joint.parent==null?null:name(joint.parent),...rest,limits};});
  const depths=[],order=[],visited=new Set(),visiting=new Set();const visit=(i,depth=0)=>{if(visited.has(i))return depths[i];if(depth>256||visiting.has(i))throw new TypeError('Cyclic or excessively deep rig');visiting.add(i);const parent=joints[i].parent;let ancestry=0;if(parent!==null){if(!index.has(parent))throw new TypeError('Unknown joint parent');ancestry=visit(index.get(parent),depth+1)+1;}if(ancestry>256)throw new TypeError('Rig exceeds 256 joint ancestors');depths[i]=ancestry;visiting.delete(i);visited.add(i);order.push(i);return ancestry;};for(let i=0;i<joints.length;i++)visit(i);
  const anchors={};for(const [id,anchor] of Object.entries(packet.anchors??{})){name(id);fields(anchor,['joint','position','rotation','scale']);if(!index.has(name(anchor.joint)))throw new TypeError('Unknown anchor joint');anchors[id]={joint:anchor.joint,...transform(Object.fromEntries(['position','rotation','scale'].filter(key=>anchor[key]!==undefined).map(key=>[key,anchor[key]])))};}
  internals.set(this,{rig_id,joints:freeze(joints),anchors:freeze(anchors),index,order});Object.freeze(this);
 }
 get rig_id(){return internals.get(this).rig_id;}
 getJointNames(){return internals.get(this).joints.map(joint=>joint.name);}
 getAnchorNames(){return Object.keys(internals.get(this).anchors);}
 toJSON(){const r=internals.get(this);return clone({rig_id:r.rig_id,joints:r.joints.map(({limits,...joint})=>({...joint,...(limits?{limits}:{})})),anchors:r.anchors});}
}
export const definitionRecord=definition=>{const record=internals.get(definition);if(!record)throw new TypeError('Expected a rigDefinition');return record;};
