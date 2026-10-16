/**
 * Studio / shared selection, placement, translation and rotation tools. One captured
 * pointer owns a transaction. High-rate movement coalesces through Lobby's input phase.
 * Guides and gestures share their actual ring geometry; scene policy stays in Session.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { pickWorld } from '../../engine/basement/picking.js';
import { RotationGesture } from '../../engine/basement/rotation-gesture.js';
import { rotationRing, ringAngle } from '../../engine/penthouse/authoring-guides.js';

export class StudioViewport {
 /** All mutable gesture/tool state belongs to this viewport and releases with it. */
 constructor(canvas,session,onError,guides){
  this.life=new Lifetime();this.canvas=canvas;this.session=session;this.onError=onError;this.guides=guides;
  this.mode='select';this.snap=.5;this.angleSnap=15;this.axis='z';this.space='world';this.showLights=true;this.placementAsset=null;
  this.drag=null;this.pending=null;
  this.life.listen(canvas,'pointerdown',event=>{try{this.begin(event);}catch(error){this.cancel();onError(error);}});
  this.life.listen(canvas,'pointermove',event=>{if(this.drag?.pointer===event.pointerId)this.pending=this.point(event);});
  this.life.own(session.engine.lobby.on('input',()=>this.flush(),'studio.move-preview'));
  this.life.listen(canvas,'pointerup',event=>{
   if(this.drag?.pointer!==event.pointerId)return;
   this.pending=this.point(event);this.flush();if(!this.drag)return;
   this.drag=null;session.document.commit();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  });
  for(const event of ['pointercancel','lostpointercapture'])this.life.listen(canvas,event,()=>this.cancel());
  this.life.listen(window,'blur',()=>this.cancel());
  this.life.own(session.engine.lobby.on('pause',paused=>{if(paused)this.cancel();}));
  this.life.listen(canvas,'wheel',event=>{
   if(session.play)return;this.cancel();event.preventDefault();const camera=session.engine.basement.renderer.camera;
   camera.halfHeight=Math.max(5,Math.min(50,camera.halfHeight*Math.exp(event.deltaY*.001)));
  },{passive:false});
 }
 /** CSS-space picking stays independent of backing pixel ratio and responsive panel resizing. */
 point(event){const r=this.canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top,width:r.width,height:r.height};}
 /** Capture and begin only after a usable target/plane has been found. */
 begin(event){
  const session=this.session;if(session.play||event.button!==0||this.drag)return;
  const p=this.point(event),camera=session.engine.basement.renderer.camera,ray=camera.ray(p.x,p.y,p.width,p.height);
  session.document.cancel();
  if(this.mode==='place'&&this.placementAsset){
   const hit=camera.ground(p.x,p.y,p.width,p.height);if(!hit)throw new Error('Use Top or Oblique view for placement');
   const quantize=n=>this.snap?Math.round(n/this.snap)*this.snap:n;
   session.place(this.placementAsset,{x:quantize(hit.x),y:quantize(hit.y),z:0});event.preventDefault();return;
  }
  const selected=session.scene.entities.find(e=>e.id===session.selected);
  if(this.mode==='rotate'&&selected&&!selected.locked){
   const ring=rotationRing(camera,selected,this.axis,this.space,p.height),hit=ringAngle(ring,ray);
   if(hit&&Math.abs(hit.radius-ring.radius)<camera.halfHeight*2/p.height*12){
    this.canvas.setPointerCapture(event.pointerId);session.document.begin('Rotate instance');
    this.drag={pointer:event.pointerId,id:selected.id,kind:'rotation',ring,gesture:new RotationGesture(selected.rotation,this.axis,this.space,hit.angle)};
    event.preventDefault();return;
   }
  }
  const light=this.showLights?this.guides?.pickLight(session.scene,p.x,p.y,p.width,p.height):null;
  const hit=light?null:pickWorld(session.preview.world,ray,entity=>{
   const id=session.preview.instance.idFor(entity);return session.scene.entities.some(e=>e.id===id&&!e.locked);
  });
  if(!light&&!hit)return;
  const id=light?.id??session.preview.instance.idFor(hit);session.select(id);
  if(this.mode!=='move')return;
  const entity=light??session.scene.entities.find(e=>e.id===id),origin=camera.ground(p.x,p.y,p.width,p.height,entity.position[2]);
  if(!origin)throw new Error('Use Top or Oblique view for ground-plane movement');
  this.canvas.setPointerCapture(event.pointerId);session.document.begin(light?'Move light':'Move instance');
  this.drag={pointer:event.pointerId,id,kind:light?'light':'entity',origin,position:[...entity.position]};event.preventDefault();
 }
 /** At most one preview per frame; final pointerup flushes the exact endpoint as well. */
 flush(){
  const d=this.drag,p=this.pending;this.pending=null;if(!d||!p)return;
  const session=this.session,camera=session.engine.basement.renderer.camera;
  try{
   if(d.kind==='rotation'){
    const hit=ringAngle(d.ring,camera.ray(p.x,p.y,p.width,p.height));if(!hit)return;
    const rotation=d.gesture.update(hit.angle,this.angleSnap);
    session.document.preview(data=>{data.scenes[session.sceneIndex].entities.find(e=>e.id===d.id).rotation=rotation;});
   }else{
    const hit=camera.ground(p.x,p.y,p.width,p.height,d.position[2]);if(!hit)return;
    session.document.preview(data=>{
     const list=d.kind==='light'?data.scenes[session.sceneIndex].lights:data.scenes[session.sceneIndex].entities;
     const target=list.find(e=>e.id===d.id),quantize=n=>this.snap?Math.round(n/this.snap)*this.snap:n;
     target.position=[quantize(d.position[0]+hit.x-d.origin.x),quantize(d.position[1]+hit.y-d.origin.y),d.position[2]];
    });
   }
  }catch(error){this.cancel();this.onError(error);}
 }
 /** Context/mode/view changes must restore the starting data and release pointer ownership. */
 cancel(){this.pending=null;if(!this.drag)return;const id=this.drag.pointer;this.drag=null;this.session.document.cancel();if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}
 dispose(){this.cancel();this.life.dispose();}
}
