/** Basement / axis-constrained quaternion gestures and ray/plane mathematics. Radians, Z up. */
import { rotateVector, multiplyRotation } from './rotation.js';

/** Resolve an axis in world coordinates; a local axis follows the starting orientation. */
export function rotationAxis(rotation,axis,space){
 if(!['x','y','z'].includes(axis)||!['world','local'].includes(space))throw new Error('Invalid rotation axis/space');
 const v=[0,0,0];v['xyz'.indexOf(axis)]=1;
 if(space==='local'){const length=Math.hypot(...rotation),q=rotation.map(n=>n/length);rotateVector(q,...v,v);}return v;
}
/** Ray intersection with a plane, refusing nearly edge-on gestures and intersections behind us. */
export function rayPlane(ray,center,normal){
 const denominator=ray.direction.reduce((n,v,i)=>n+v*normal[i],0);
 if(Math.abs(denominator)<.04)return null;
 const t=normal.reduce((n,v,i)=>n+(center[i]-ray.origin[i])*v,0)/denominator;
 return t<0||t>(ray.maxDistance??Infinity)?null:ray.origin.map((v,i)=>v+ray.direction[i]*t);
}
/** Stable in-plane basis, shared by visible rings and their angular picking. */
export function planeBasis(normal){
 const ref=Math.abs(normal[2])<.9?[0,0,1]:[0,1,0];
 const u=[normal[1]*ref[2]-normal[2]*ref[1],normal[2]*ref[0]-normal[0]*ref[2],normal[0]*ref[1]-normal[1]*ref[0]],length=Math.hypot(...u);
 for(let i=0;i<3;i++)u[i]/=length;
 return [u,[normal[1]*u[2]-normal[2]*u[1],normal[2]*u[0]-normal[0]*u[2],normal[0]*u[1]-normal[1]*u[0]]];
}
export class RotationGesture {
 /** Store starting orientation and angle; previews always derive from that starting state. */
 constructor(rotation,axis,space,angle){const length=Math.hypot(...rotation);this.rotation=rotation.map(n=>n/length);this.normal=rotationAxis(this.rotation,axis,space);this.last=angle;this.total=0;}
 /** Unwrap across ±π; snap accumulated angle rather than rounding quaternion components. */
 update(angle,snapDegrees=0){
  this.total+=Math.atan2(Math.sin(angle-this.last),Math.cos(angle-this.last));this.last=angle;
  const step=snapDegrees*Math.PI/180,turn=step?Math.round(this.total/step)*step:this.total;
  const s=Math.sin(turn/2),delta=[...this.normal.map(n=>n*s),Math.cos(turn/2)],out=[0,0,0,1];multiplyRotation(delta,this.rotation,out);return out;
 }
}
