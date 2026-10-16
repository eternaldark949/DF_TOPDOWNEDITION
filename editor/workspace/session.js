/**
 * Studio / edit and Play lifetimes. The application selects context; the existing Lobby
 * remains the sole frame owner. Editing has one preview; Play releases it and owns the
 * game's bounded residency. Stop reconstructs only the selected authored scene.
 */
import { SceneInstance } from '../../engine/directory/scene-instance.js';
import { ProjectDocument } from '../../engine/basement/document.js';
import { assetBounds } from '../../engine/basement/asset-bounds.js';
import { copyData } from '../../engine/basement/project.js';
import { Lifetime } from '../../engine/basement/lifetime.js';

export class StudioSession {
 /** Inject game behavior, schema resolution and initial selection at the application boundary. */
 constructor(engine,{
  project,validate,selectInitial=scene=>scene.entities.find(e=>!e.locked)?.id,
  playFactory,controlsHost,onChange,onStatus,canRemove=entity=>!entity.locked,cloneEntity=entity=>entity,guideLayers=()=>[],
 }){
  this.engine=engine;this.canRemove=canRemove;this.cloneEntity=cloneEntity;this.guideLayers=guideLayers;
  this.validate=validate;
  this.selectInitial=selectInitial;
  this.playFactory=playFactory;
  this.controlsHost=controlsHost;
  this.onChange=onChange;
  this.onStatus=onStatus;
  this.life=new Lifetime();
  this.play=null;
  this.preview=null;
  this.document=null;
  this.sceneIndex=0;
  this.selected=null;
  this.lightingDirty=true;

  // The editor submits through the same renderer and host frame as the game.
  // Static lighting/poses need no repeated configuration between authored changes.
  this.life.own(engine.lobby.on('render',()=>{
   if(this.play||!this.preview)return;
   const renderer=engine.basement.renderer,scene=this.scene;
   if(this.lightingDirty){
    renderer.lighting.configureDirectional(scene.sun);
    renderer.lighting.ambient.set(scene.ambient);
    scene.lights.forEach((light,i)=>renderer.lighting.setPoint(i,light));
    this.lightingDirty=false;
   }
   renderer.render(this.preview.batch,this.guideLayers());
  },'studio.viewport'));
  this.replace(project);
 }

 /** Selection is application state; the scene itself always comes from the current document. */
 get scene(){return this.document.data.scenes[this.sceneIndex];}

 /** Build a candidate completely before replacing an existing preview or dirty document. */
 makePreview(project,index){
  const {directory,basement}=this.engine;
  const world=directory.adopt(basement.createWorld());
  let instance,batch,lease;
  try{
   instance=new SceneInstance(directory,world,project,project.scenes[index]);
   lease=directory.acquire(`studio:${world.id}`,()=>basement.renderer.createBatch(world),{owner:'studio.preview'});
   batch=lease.value;
   return {world,instance,batch,dispose(){
    lease.release();
    directory.releaseWorld(world.id,world);
   }};
  }catch(error){
   lease?.release();
   directory.releaseWorld(world.id,world);
   throw error;
  }
 }

 /** Invalid input/construction leaves the old project intact; adoption is synchronous. */
 replace(project){
  if(this.play)throw new Error('Stop Play before opening a project');
  const doc=new ProjectDocument(project,{validate:this.validate});
  const candidate=this.makePreview(doc.data,0);
  this.releaseDocument?.();
  this.preview?.dispose();
  this.preview=candidate;
  this.document=doc;
  this.sceneIndex=0;
  this.selected=this.selectInitial(doc.data.scenes[0]);
  this.lightingDirty=true;
  this.releaseDocument=doc.onChange(kind=>{
   this.lightingDirty=true;
   if(!this.play)this.preview.instance.apply(this.scene,doc.data);
   this.onChange(kind);
  });
  this.onChange('open');
 }

 /** Navigation replaces one owned preview, while preserving project history and other scenes. */
 setScene(index){
  if(this.play)return;
  this.document.cancel();
  const candidate=this.makePreview(this.document.data,index);
  this.preview.dispose();
  this.preview=candidate;
  this.sceneIndex=index;
  this.lightingDirty=true;
  this.selected=this.selectInitial(this.scene);
  this.onChange('scene');
 }

 /** A selection change cannot strand an unfinished property transaction. */
 select(id){
  if(this.play)return;
  this.document.cancel();
  this.selected=id;
  this.onChange('selection');
 }

 /** Place one source asset with its true bottom on the construction plane. */
 place(assetId,point){
  if(this.play)return;const asset=this.document.data.assets.find(a=>a.id===assetId);
  if(!asset)throw new Error('Unknown source asset');const id=this.document.allocateId(),bounds=assetBounds(asset);
  this.document.edit('Place asset',data=>data.scenes[this.sceneIndex].entities.push({id,name:asset.name,asset:assetId,tag:null,locked:false,position:[point.x,point.y,(point.z??0)-bounds.min[2]],rotation:[0,0,0,1],scale:1}));
  this.select(id);return id;
 }
 /** Clone placement while sharing its source asset; application policy handles unique game roles. */
 duplicate(){
  if(this.play)return;const original=this.scene.entities.find(e=>e.id===this.selected);
  if(!original||original.locked)throw new Error('Select an unlocked instance');
  const entity=this.cloneEntity(copyData(original));entity.id=this.document.allocateId();entity.name+=' copy';entity.position[0]+=1;
  this.document.edit('Duplicate instance',data=>data.scenes[this.sceneIndex].entities.push(entity));this.select(entity.id);return entity.id;
 }
 /** Delete through history, preserving protected application roles and every unaffected instance. */
 remove(){
  if(this.play)return;const entity=this.scene.entities.find(e=>e.id===this.selected);
  if(!entity||!this.canRemove(entity))throw new Error('This instance is protected');
  this.document.edit('Delete instance',data=>{const list=data.scenes[this.sceneIndex].entities;list.splice(list.findIndex(e=>e.id===entity.id),1);});
  this.select(this.selectInitial(this.scene));
 }
 /** Release the preview before Play; pass only detached authored data to the game factory. */
 startPlay(){
  if(this.play)return;
  this.document.cancel();
  const renderer=this.engine.basement.renderer;
  this.camera=Object.fromEntries(['x','y','z','halfHeight','azimuth','elevation'].map(key=>[key,renderer.camera[key]]));
  this.preview.dispose();
  this.preview=null;
  this.engine.basement.input.clear();
  renderer.camera.preset('oblique');
  renderer.camera.z=0;
  try{
   this.play=this.playFactory(this.engine,{
    project:this.document.snapshot(),controlsHost:this.controlsHost,
    onStatus:this.onStatus,onError:error=>this.onStatus({name:error.message}),
   });
  }catch(error){
   Object.assign(renderer.camera,this.camera);
   this.lightingDirty=true;
   this.preview=this.makePreview(this.document.data,this.sceneIndex);
   throw error;
  }
  this.onChange('play');
 }

 /** Dispose every play registration before restoring editing, its camera, and authored data. */
 stopPlay(){
  if(!this.play)return;
  this.play.dispose();
  this.play=null;
  this.engine.basement.input.bind({});
  this.engine.directory.residency.trim();
  Object.assign(this.engine.basement.renderer.camera,this.camera);
  this.preview=this.makePreview(this.document.data,this.sceneIndex);
  this.lightingDirty=true;
  this.onChange('stop');
 }

 /** Unsubscribe first, then release the active context and viewport callback. */
 dispose(){
  this.releaseDocument?.();
  this.play?.dispose();
  this.preview?.dispose();
  this.life.dispose();
 }
}
