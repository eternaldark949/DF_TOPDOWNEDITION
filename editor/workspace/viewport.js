/**
 * Studio / select and move tools. Shared rays and oriented-box queries live in Basement.
 * One captured pointer owns a drag. Pause/cancel restores the complete transaction.
 * Pointer traffic is coalesced through Lobby, never a second animation-frame loop.
 */
import { Lifetime } from '../../engine/basement/lifetime.js';
import { pickWorld } from '../../engine/basement/picking.js';
export class StudioViewport {
 /** Own listeners, gesture state and the one existing-scheduler preview subscription. */
 constructor(canvas,session,onError){
  this.life=new Lifetime();this.canvas=canvas;this.session=session;this.onError=onError;
  this.mode='select';this.snap=.5;this.drag=null;this.pending=null;
  const point=e=>{const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top,width:rect.width,height:rect.height};};
  this.life.listen(canvas,'pointerdown',e=>{
   if(session.play||e.button!==0||this.drag)return;
   const p=point(e),preview=session.preview,camera=session.engine.basement.renderer.camera;
   const hit=pickWorld(preview.world,camera.ray(p.x,p.y,p.width,p.height),entity=>{
    const id=preview.instance.idFor(entity);return session.scene.entities.some(e=>e.id===id&&!e.locked);
   });
   if(!hit)return;
   const id=preview.instance.idFor(hit);session.select(id);
   if(this.mode!=='move')return;
   const entity=session.scene.entities.find(e=>e.id===id),origin=camera.ground(p.x,p.y,p.width,p.height,entity.position[2]);
   if(!origin){onError(new Error('Use Top or Oblique view for ground-plane movement'));return;}
   // Capture first: a failed capture must not leave a document transaction open.
   canvas.setPointerCapture(e.pointerId);session.document.begin('Move instance');
   this.drag={pointer:e.pointerId,id,origin,position:[...entity.position]};e.preventDefault();
  });
  this.life.listen(canvas,'pointermove',e=>{if(this.drag?.pointer===e.pointerId)this.pending=point(e);});
  this.life.own(session.engine.lobby.on('input',()=>this.flush(),'studio.move-preview'));
  this.life.listen(canvas,'pointerup',e=>{
   if(this.drag?.pointer!==e.pointerId)return;
   this.pending=point(e);this.flush();if(!this.drag)return;
   this.drag=null;session.document.commit();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  });
  for(const event of ['pointercancel','lostpointercapture'])this.life.listen(canvas,event,()=>this.cancel());
  this.life.listen(window,'blur',()=>this.cancel());
  this.life.own(session.engine.lobby.on('pause',paused=>{if(paused)this.cancel();}));
  this.life.listen(canvas,'wheel',e=>{
   if(session.play)return;e.preventDefault();const c=session.engine.basement.renderer.camera;
   c.halfHeight=Math.max(5,Math.min(50,c.halfHeight*Math.exp(e.deltaY*.001)));
  },{passive:false});
 }
 /** At most one validated document preview per host frame; the final pointerup flushes too. */
 flush(){
  const d=this.drag,p=this.pending;this.pending=null;if(!d||!p)return;
  const session=this.session,camera=session.engine.basement.renderer.camera;
  const hit=camera.ground(p.x,p.y,p.width,p.height,d.position[2]);if(!hit)return;
  try{session.document.preview(data=>{
   const entity=data.scenes[session.sceneIndex].entities.find(e=>e.id===d.id);
   const quantize=v=>this.snap?Math.round(v/this.snap)*this.snap:v;
   entity.position=[quantize(d.position[0]+hit.x-d.origin.x),quantize(d.position[1]+hit.y-d.origin.y),d.position[2]];
  });}catch(error){this.cancel();this.onError(error);}
 }
 /** Modes and context switches cancel before replacing document/selection or input bindings. */
 cancel(){
  this.pending=null;if(!this.drag)return;
  const pointer=this.drag.pointer;this.drag=null;this.session.document.cancel();
  if(this.canvas.hasPointerCapture(pointer))this.canvas.releasePointerCapture(pointer);
 }
 /** No captured pointers, pending transactions or Lobby subscribers survive this tool. */
 dispose(){this.cancel();this.life.dispose();}
}
