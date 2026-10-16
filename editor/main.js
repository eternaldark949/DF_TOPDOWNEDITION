/**
 * Studio composition: assemble the universal workspace, files, properties and tools.
 * This bootstrap chooses the Atrium fixture; reusable mechanisms never import its data.
 * The game-only build does not import this application or its document history/UI.
 */
import { ETRNLNINE } from '../engine/etrnlnine.js';
import { Lifetime } from '../engine/basement/lifetime.js';
import { TRANSFORM_PROPERTIES, LIGHT_PROPERTIES } from '../engine/basement/properties.js';
import { PropertyInspector } from '../engine/penthouse/property-inspector.js';
import { ATRIUM_PROJECT, validateAtriumProject } from '../examples/atrium/project.js';
import { createScene } from '../examples/atrium/scene.js';
import { StudioSession } from './workspace/session.js';
import { StudioViewport } from './workspace/viewport.js';
import { ProjectFiles } from './documents/files.js';

const $=id=>document.getElementById(id),life=new Lifetime(),files=new ProjectFiles(validateAtriumProject);
let session,inspector,viewport,engine,profiler;
/** Keep errors readable and dismissible, while the current document remains available. */
function report(error){$('error').hidden=false;$('error').textContent=error.message;}
/** Refresh command availability and status without replacing focused controls during previews. */
function state(kind){if(!session||life.disposed)return;const doc=session.document;
 $('undo').disabled=!!session.play||!doc.undoStack.length;$('redo').disabled=!!session.play||!doc.redoStack.length;
 $('play').textContent=session.play?'■ Stop':'▶ Play';document.body.classList.toggle('playing',!!session.play);
 $('project-name').textContent=doc.data.name+(doc.dirty?' •':'');$('status').textContent=session.play?'Play · WASD / stick walk · F flit · E light':`${doc.dirty?'Unsaved changes':'Project ready'} · ${session.scene.name}`;
 for(const id of ['scene','save','open','recover'])$(id).disabled=!!session.play;
 $('status').dataset.mode=session.play?'play':'edit';$('status').dataset.revision=doc.revision;$('status').dataset.selected=session.selected;
 if(['commit','undo','redo'].includes(kind)){const stored=files.store(doc.data);$('status').dataset.recovery=stored?'stored':'unavailable';}
 if(kind==='preview')return;
 // Commit may run from blur; rebuild only after the owning event handler returns.
 if(kind==='commit'||kind==='saved'){queueMicrotask(()=>{if(!doc.active)panels();});return;}panels();
}
/** One hierarchy and inspector renderer handles both entity and light selection contexts. */
function panels(){if(!session||life.disposed)return;inspector?.dispose();inspector=null;const scene=session.scene,doc=session.document;$('fields').replaceChildren();$('hierarchy').replaceChildren();$('asset-list').replaceChildren();
 $('scene').replaceChildren(...doc.data.scenes.map((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;return o;}));$('scene').value=session.sceneIndex;
 const light=scene.lights.find(l=>l.id===session.selected),entity=scene.entities.find(e=>e.id===session.selected),target=light??entity;
 $('selection-name').textContent=light?'Point light '+(scene.lights.indexOf(light)+1):entity?.name??'Select an instance';$('selection-id').textContent=target?.id??'';
 for(const item of [...scene.entities.filter(e=>!e.locked),...scene.lights]){const button=document.createElement('button');button.textContent=item.name??'◈ Point light '+(scene.lights.indexOf(item)+1);button.dataset.id=item.id;button.dataset.light=String(!item.name);button.setAttribute('aria-pressed',String(item.id===session.selected));button.addEventListener('click',()=>{viewport.cancel();session.select(item.id);document.body.classList.remove('library-open');document.body.classList.add('properties-open');});$('hierarchy').append(button);}
 if(target&&!entity?.locked&&!session.play){const id=target.id,index=session.sceneIndex;const resolve=data=>(light?data.scenes[index].lights:data.scenes[index].entities).find(e=>e.id===id);inspector=new PropertyInspector({host:$('fields'),document:doc,resolve,properties:light?LIGHT_PROPERTIES:TRANSFORM_PROPERTIES,onError:report});}
 const used=new Set(scene.entities.map(e=>e.asset));for(const asset of doc.data.assets.filter(a=>used.has(a.id))){const p=document.createElement('p');p.textContent=`${asset.name} · ${asset.parts.length} parts · v${asset.generatorVersion}`;$('asset-list').append(p);}
 if(session.preview)for(const [id,item]of session.preview.instance.instances)for(const part of item.parts)part.highlight=id===session.selected?1:0;
}
/** Safe UI action boundary; failed validation reports without destroying the open project. */
function action(id,fn){life.listen($(id),'click',()=>{try{viewport?.cancel();fn();}catch(error){report(error);}});}
try{
 engine=new ETRNLNINE($('world'),{pixelRatio:1.25,occlusion:{mode:'geometry'},lighting:{shadows:{mode:'low'}}});life.own(()=>engine.dispose());
 session=new StudioSession(engine,{project:ATRIUM_PROJECT,validate:validateAtriumProject,selectInitial:scene=>scene.entities.find(e=>e.tag==='planter')?.id,playFactory:createScene,controlsHost:$('controls'),onChange:state,onStatus:s=>{$('status').textContent=`Play · ${s.name} · WASD / stick walk · F flit`;$('status').dataset.x=s.x??0;$('status').dataset.y=s.y??0;}});life.own(()=>session.dispose());
 viewport=new StudioViewport($('world'),session,report);life.own(()=>viewport.dispose());life.own(()=>inspector?.dispose());life.own(()=>files.dispose());
 const renderer=engine.basement.renderer;renderer.camera.halfHeight=24;state('open');
 action('undo',()=>session.document.undo());action('redo',()=>session.document.redo());
 action('play',()=>{document.activeElement?.blur();if(session.play)session.stopPlay();else session.startPlay();});
 action('save',()=>{document.activeElement?.blur();files.download(session.document.snapshot());session.document.markSaved();});
 action('open',()=>$('file').click());life.listen($('file'),'change',async()=>{try{const file=$('file').files[0];if(file)session.replace(await files.read(file));}catch(error){report(error);}finally{$('file').value='';}});
 action('recover',()=>{const data=files.recover();if(!data)throw new Error('No valid local recovery is available');session.replace(data);});
 life.listen($('scene'),'change',()=>{viewport.cancel();session.setScene(Number($('scene').value));});
 for(const mode of ['select','move'])action(mode,()=>{viewport.mode=mode;for(const id of ['select','move'])$(id).setAttribute('aria-pressed',String(id===mode));});
 life.listen($('snap'),'change',()=>{viewport.cancel();viewport.snap=Number($('snap').value);});
 life.listen($('view'),'change',()=>{viewport.cancel();renderer.camera.preset($('view').value);});
 action('orbit-left',()=>renderer.camera.azimuth-=Math.PI/12);action('orbit-right',()=>renderer.camera.azimuth+=Math.PI/12);
 action('zoom-in',()=>renderer.camera.halfHeight=Math.max(5,renderer.camera.halfHeight/1.2));action('zoom-out',()=>renderer.camera.halfHeight=Math.min(50,renderer.camera.halfHeight*1.2));
 action('mobile-library',()=>{document.body.classList.toggle('library-open');document.body.classList.remove('properties-open');});action('mobile-properties',()=>{document.body.classList.toggle('properties-open');document.body.classList.remove('library-open');});
 profiler=engine.directory.create('tool.profiler',{profiler:engine.basement.profiler,host:document.body,subscribe:callback=>engine.lobby.on('render',callback,'studio.profiler')});life.own(()=>profiler.dispose());action('profiler',()=>profiler.element.open=!profiler.element.open);
 life.listen(window,'keydown',e=>{if(session.play||e.target.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='Escape'){viewport.cancel();session.document.cancel();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();viewport.cancel();if(e.shiftKey)session.document.redo();else session.document.undo();}});
 life.listen($('error'),'click',()=>$('error').hidden=true);
 let metricsAt=-Infinity;
 // DOM diagnostics update at 4 Hz; the viewport retains the host's normal frame rate.
 life.own(engine.lobby.on('render',(_alpha,_time,wallMs)=>{if(wallMs-metricsAt<250)return;metricsAt=wallMs;const stats=renderer.stats;$('metrics').textContent=`${stats.draws} draws · ${stats.buffers} buffers`;$('status').dataset.worlds=engine.directory.worlds.size;$('status').dataset.buffers=stats.buffers;},'studio.status'));
 life.listen(window,'pagehide',()=>life.dispose());engine.start();
}catch(error){report(error);life.dispose();}
