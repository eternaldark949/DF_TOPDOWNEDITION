/**
 * Penthouse / reusable native WebGL authoring guides. No DOM IDs, scheduler or game
 * names. The application supplies scene/selection/preferences and owns this lifetime.
 * Grid is depth-tested; markers and the dial are foreground guides, never world entities.
 */
import { rotationAxis, planeBasis, rayPlane } from '../basement/rotation-gesture.js';

/** World-space rotation ring: fixed CSS size, actual axis plane, shared hit/draw geometry. */
export function rotationRing(camera,entity,axis,space,height){
 const normal=rotationAxis(entity.rotation,axis,space),basis=planeBasis(normal);
 return {center:entity.position,normal,basis,radius:camera.halfHeight*2/height*48};
}
/** Angular coordinate in the ring's plane; null when the view is nearly edge-on. */
export function ringAngle(ring,ray){
 const hit=rayPlane(ray,ring.center,ring.normal);if(!hit)return null;
 const delta=hit.map((n,i)=>n-ring.center[i]);
 return {angle:Math.atan2(delta.reduce((n,v,i)=>n+v*ring.basis[1][i],0),delta.reduce((n,v,i)=>n+v*ring.basis[0][i],0)),radius:Math.hypot(...delta)};
}
export class AuthoringGuides {
 /** Preference data stays with Studio; these resources only represent the current view. */
 constructor(renderer){this.renderer=renderer;this.grid=null;this.widgets=null;this.key='';}
 /** Return explicit passes for Renderer.render; no work or resource allocation in Play. */
 layersFor({scene,selected,revision,mode,axis,space,grid,lights}){
  const r=this.renderer;if(r.lost)return[];
  if(!grid&&this.grid){this.grid.dispose();this.grid=null;}
  if(grid&&!this.grid){
   this.grid=r.lines.create(1024);this.grid.begin();
   for(let n=-30;n<=30;n++){
    const color=n===0?[.72,.5,.25,.75]:n%5===0?[.72,.56,.34,.3]:[.72,.56,.34,.12];
    this.grid.segment([n,-30,.065],[n,30,.065],color);this.grid.segment([-30,n,.065],[30,n,.065],color);
   }
   this.grid.end();
  }
  const target=scene.entities.find(e=>e.id===selected),dial=mode==='rotate'&&target&&!target.locked;
  if(!lights&&!dial){if(this.widgets)this.widgets.dispose();this.widgets=null;this.key='';return this.grid?[this.grid]:[];}
  const camera=r.camera,h=r.canvas.clientHeight;
  const key=[scene.id,revision,selected,mode,axis,space,lights,camera.x,camera.y,camera.z,camera.azimuth,camera.elevation,camera.halfHeight,r.canvas.clientWidth,h].join('/');
  if(!this.widgets){this.widgets=r.lines.create(1024,{depthTest:false});this.key='';}
  if(key!==this.key){
   camera.update(r.canvas.clientWidth/h);this.widgets.begin();const pixel=camera.halfHeight*2/h;
   if(lights)for(const light of scene.lights){
    const color=light.id===selected?[1,.92,.63,1]:[.91,.68,.32,.95],center=light.position;
    const p=(x,y)=>center.map((v,i)=>v+pixel*(camera.right[i]*x+camera.up[i]*y));
    for(const [a,b]of [[[0,8],[7,0]],[[7,0],[0,-8]],[[0,-8],[-7,0]],[[-7,0],[0,8]],[[-3,0],[3,0]],[[0,-3],[0,3]]])this.widgets.segment(p(...a),p(...b),color);
   }
   if(dial){
    const ring=rotationRing(camera,target,axis,space,h),color=axis==='x'?[1,.42,.36,1]:axis==='y'?[.45,.9,.67,1]:[.87,.7,1,1];
    const p=angle=>ring.center.map((v,i)=>v+ring.radius*(Math.cos(angle)*ring.basis[0][i]+Math.sin(angle)*ring.basis[1][i]));
    for(let i=0;i<72;i++)this.widgets.segment(p(i*Math.PI/36),p((i+1)*Math.PI/36),color);
    for(let i=0;i<12;i++){const angle=i*Math.PI/6,a=p(angle),b=a.map((v,j)=>v+(a[j]-ring.center[j])*.12);this.widgets.segment(a,b,color);}
   }
   this.widgets.end();this.key=key;
  }
  return [this.grid,this.widgets].filter(Boolean);
 }
 /** Pick readable light icons in CSS pixels, independently of physical geometry/collision. */
 pickLight(scene,x,y,width,height){
  const camera=this.renderer.camera;let closest=null,distance=22*22;
  for(const light of scene.lights){const [px,py,pz]=light.position,p=camera.project({x:px,y:py,z:pz},width,height),d=(p.x-x)**2+(p.y-y)**2;if(d<distance){distance=d;closest=light;}}
  return closest;
 }
 /** Hidden guides release all buffers/VAOs and their shared program ownership immediately. */
 clear(){this.grid?.dispose();this.widgets?.dispose();this.grid=this.widgets=null;this.key='';}
 dispose(){this.clear();}
}
