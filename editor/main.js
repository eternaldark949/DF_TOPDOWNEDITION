/**
 * Studio composition: assemble the universal workspace, files, properties and tools.
 * This bootstrap installs explicit game packages; reusable mechanisms never import its data.
 * The game-only build does not import this application or its document history/UI.
 */
import { ETRNLNINE } from '../engine/etrnlnine.js';
import { Lifetime } from '../engine/basement/lifetime.js';
import { PanelDock } from '../engine/penthouse/panel-dock.js';
import { AppearanceControls } from '../engine/penthouse/appearance-controls.js';
import { AuthoringGuides } from '../engine/penthouse/authoring-guides.js';
import { WorkspacePanels } from './workspace/panels.js';
import { StudioPreferences } from './workspace/preferences.js';
import { STUDIO_PROJECTS, studioProject, validateStudioProject } from './projects.js';
import { StudioSession } from './workspace/session.js';
import { selectedBounds, sceneBounds } from './workspace/framing.js';
import { StudioViewport } from './workspace/viewport.js';
import { ProjectFiles } from './documents/files.js';

const $=id=>document.getElementById(id),life=new Lifetime(),files=new ProjectFiles(validateStudioProject);
const preferences=new StudioPreferences();
// Query chooses an installed starter only; opening data always revalidates its own identity.
const starter=STUDIO_PROJECTS.find(e=>e.label.toLowerCase()===new URLSearchParams(location.search).get('project'))??STUDIO_PROJECTS[0];
let activeProject=starter;
let session,panels,viewport,engine,profiler,guides,dock;
/** Keep errors readable and dismissible, while the current document remains available. */
function report(error){$('error').hidden=false;$('error').textContent=error.message;}
/** Refresh command availability and status without replacing focused controls during previews. */
function state(kind){if(!session||life.disposed)return;const doc=session.document;
 if(kind==='play')guides?.clear();dock?.suspend(!!session.play);
 activeProject=studioProject(doc.data);$('project').value=doc.data.id;$('project').disabled=!!session.play||doc.dirty;$('project').title=doc.dirty?'Export your changes or undo them before changing starter projects':'Choose a starter project';
 const selected=session.selectionKind==='material'?null:session.scene.entities.find(e=>e.id===session.selected);
 if(viewport){const dial=viewport.mode==='rotate'&&selected&&!selected.locked;$('rotate').disabled=!!session.play||!selected||selected.locked;document.body.classList.toggle('rotate-mode',!!dial);$('rotate').setAttribute('aria-pressed',String(!!dial));if(viewport.mode==='rotate')$('tool-readout').textContent=dial?'ROTATE':session.selectionKind==='material'?'MATERIAL':'SELECT LIGHT';}
 $('duplicate').disabled=!!session.play||!selected||selected.locked;$('delete').disabled=!!session.play||!selected||!session.canRemove(selected);
 $('undo').disabled=!!session.play||!doc.undoStack.length;$('redo').disabled=!!session.play||!doc.redoStack.length;
 $('play').textContent=session.play?'■ Stop':'▶ Play';document.body.classList.toggle('playing',!!session.play);
 $('project-name').textContent=doc.data.name+(doc.dirty?' •':'');$('status').textContent=session.play?'Play · '+activeProject.help:`${doc.dirty?'Unsaved changes':'Project ready'} · ${session.scene.name}`;
 for(const id of ['scene','save','open','recover'])$(id).disabled=!!session.play;
 $('status').dataset.mode=session.play?'play':'edit';$('status').dataset.revision=doc.revision;$('status').dataset.selected=session.selected;
 if(['commit','undo','redo'].includes(kind)){const stored=files.store(doc.data);$('status').dataset.recovery=stored?'stored':'unavailable';}
 if(kind==='preview')return;
 // Commit may run from blur; rebuild only after the owning event handler returns.
 if(kind==='commit'||kind==='saved'){queueMicrotask(()=>{if(!doc.active)panels?.refresh(session);});return;}panels?.refresh(session);
}
/** Safe UI action boundary; failed validation reports without destroying the open project. */
function action(id,fn){life.listen($(id),'click',()=>{try{viewport?.cancel();fn();}catch(error){report(error);}});}
try{
 engine=new ETRNLNINE($('world'),{pixelRatio:1.25,occlusion:{mode:'geometry'},lighting:{shadows:{mode:'low'}}});life.own(()=>engine.dispose());
 guides=new AuthoringGuides(engine.basement.renderer);life.own(()=>guides.dispose());
 session=new StudioSession(engine,{guideLayers:()=>guides.layersFor({scene:session.scene,selected:session.selectionKind==='material'?null:session.selected,revision:session.document.revision,mode:viewport.mode,axis:viewport.axis,space:viewport.space,grid:preferences.value.grid,lights:preferences.value.lights}),canRemove:entity=>activeProject.canRemove(entity,session.document.data),cloneEntity:entity=>activeProject.clone(entity),project:starter.project,validate:validateStudioProject,selectInitial:scene=>activeProject.select(scene)??scene.entities.find(e=>!e.locked)?.id,playFactory:(engine,options)=>studioProject(options.project).play(engine,options),controlsHost:$('controls'),onChange:state,onStatus:s=>{$('status').textContent=`Play · ${s.name} · ${s.prompt??activeProject.help}`;$('status').dataset.x=s.x??0;$('status').dataset.y=s.y??0;}});life.own(()=>session.dispose());
 viewport=new StudioViewport($('world'),session,report,guides);Object.assign(viewport,{axis:preferences.value.axis,space:preferences.value.space,angleSnap:preferences.value.angleSnap,showLights:preferences.value.lights});life.own(()=>viewport.dispose());
 dock=new PanelDock({root:$('workspace'),entries:[{key:'directory',panel:$('library'),label:'Directory',side:'left'},{key:'properties',panel:$('properties'),label:'Properties',side:'right'}],compact:matchMedia('(max-width:760px)'),defaults:{wide:['directory','properties'],compact:[]},onBeforeChange:()=>{const active=document.activeElement;if(active?.closest('#library,#properties'))active.blur();viewport.cancel();}});life.own(()=>dock.dispose());
 panels=new WorkspacePanels({fields:$('fields'),hierarchy:$('hierarchy'),assets:$('asset-list'),materials:$('material-list'),scene:$('scene'),name:$('selection-name'),id:$('selection-id')},{onError:report,onSelect:id=>{viewport.cancel();session.select(id);dock.setOpen('properties',true);},onSelectMaterial:id=>{viewport.cancel();session.selectMaterial(id);dock.setOpen('properties',true);},onPlace:id=>{viewport.cancel();viewport.placementAsset=id;setTool('place');dock.closeAll();}});life.own(()=>panels.dispose());life.own(()=>files.dispose());
 const renderer=engine.basement.renderer;
 const appearanceControls=new AppearanceControls({renderer,host:document.querySelector('.view-options'),subscribe:fn=>engine.lobby.on('render',fn,'studio.appearance-controls'),onError:report});life.own(()=>appearanceControls.dispose());
 for(const entry of STUDIO_PROJECTS){const option=document.createElement('option');option.value=entry.project.id;option.textContent=entry.label;$('project').append(option);}
 /** Authored per-scene framing is application metadata, not a viewport rule keyed by a game name. */
 function frameScene(){const mode=renderer.camera.projection;renderer.camera.setProjection('orthographic');Object.assign(renderer.camera,{x:0,y:0,z:0,halfHeight:24});renderer.camera.preset('oblique');if(session.scene.camera){for(const key of ['x','y','z','azimuth','elevation','halfHeight'])renderer.camera[key]=session.scene.camera[key];renderer.camera.halfHeight=Math.max(renderer.camera.halfHeight,21/($('world').clientWidth/$('world').clientHeight));}renderer.camera.setProjection(mode);}
 life.listen($('project'),'change',()=>{try{viewport.cancel();activeProject=STUDIO_PROJECTS.find(e=>e.project.id===$('project').value);session.replace(activeProject.project);setTool('select');guides.clear();frameScene();}catch(error){activeProject=studioProject(session.document.data);$('project').value=session.document.data.id;report(error);}});
 frameScene();state('open');
 for(const [id,assets]of [['show-hierarchy',false],['show-assets',true]])action(id,()=>{document.body.classList.remove('materials-open');$('show-materials').setAttribute('aria-pressed','false');document.body.classList.toggle('assets-open',assets);$('show-assets').setAttribute('aria-pressed',String(assets));$('show-hierarchy').setAttribute('aria-pressed',String(!assets));});
 action('show-materials',()=>{document.body.classList.add('materials-open');document.body.classList.remove('assets-open');$('show-materials').setAttribute('aria-pressed','true');$('show-assets').setAttribute('aria-pressed','false');$('show-hierarchy').setAttribute('aria-pressed','false');});
 action('undo',()=>session.document.undo());action('redo',()=>session.document.redo());
 action('play',()=>{document.activeElement?.blur();if(session.play)session.stopPlay();else session.startPlay();});
 action('save',()=>{document.activeElement?.blur();files.download(session.document.snapshot());session.document.markSaved();});
 action('open',()=>$('file').click());life.listen($('file'),'change',async()=>{try{const file=$('file').files[0];if(file){session.replace(await files.read(file));setTool('select');frameScene();}}catch(error){report(error);}finally{$('file').value='';}});
 action('recover',()=>{const data=files.recover();if(!data)throw new Error('No valid local recovery is available');session.replace(data);setTool('select');frameScene();});
 life.listen($('scene'),'change',()=>{viewport.cancel();session.setScene(Number($('scene').value));frameScene();});
 /** The active tool is shared by the viewport, its overlay and this one toolbar. */
 function setTool(mode){viewport.cancel();viewport.mode=mode;document.body.dataset.navigation=mode;document.body.classList.toggle('rotate-mode',mode==='rotate');for(const id of ['select','move','rotate','orbit','pan'])$(id).setAttribute('aria-pressed',String(id===mode));$('tool-readout').textContent=mode==='place'?'PLACE · '+session.document.data.assets.find(a=>a.id===viewport.placementAsset)?.name:mode.toUpperCase();}
 for(const mode of ['select','move','rotate','orbit','pan'])action(mode,()=>setTool(mode));
 action('duplicate',()=>session.duplicate());action('delete',()=>session.remove());
 for(const key of ['grid','lights']){const button=$(key);button.setAttribute('aria-pressed',String(preferences.value[key]));action(key,()=>{preferences.set(key,!preferences.value[key]);viewport.showLights=preferences.value.lights;button.setAttribute('aria-pressed',String(preferences.value[key]));});}
 for(const [id,key]of [['rotation-axis','axis'],['rotation-space','space'],['angle-snap','angleSnap']]){$(id).value=preferences.value[key];life.listen($(id),'change',()=>{viewport.cancel();const value=key==='angleSnap'?Number($(id).value):$(id).value;preferences.set(key,value);viewport[key]=value;});}
 life.listen($('asset-search'),'input',()=>{panels.filter=$('asset-search').value;panels.renderAssets(session);});
 life.listen($('snap'),'change',()=>{viewport.cancel();viewport.snap=Number($('snap').value);});
 // Lens controls change viewport state only; they never dirty the authored document.
 $('projection').value=renderer.camera.projection;
 life.listen($('projection'),'change',()=>{viewport.cancel();renderer.camera.setProjection($('projection').value);});
 life.listen($('fov'),'change',()=>{viewport.cancel();const value=Number($('fov').value);if(Number.isFinite(value)){renderer.camera.fov=Math.max(15,Math.min(110,value))*Math.PI/180;$('fov').value=renderer.camera.fov*180/Math.PI;}});
 life.listen($('view'),'change',()=>{viewport.cancel();renderer.camera.preset($('view').value);});
 action('orbit-left',()=>viewport.navigation.motion.orbit(15,0));action('orbit-right',()=>viewport.navigation.motion.orbit(-15,0));
 function zoom(factor){viewport.navigation.motion.zoom(factor,$('world').clientWidth/2,$('world').clientHeight/2,$('world').clientWidth,$('world').clientHeight);}
 action('zoom-in',()=>zoom(1/1.2));action('zoom-out',()=>zoom(1.2));
 function frame(selected){viewport.cancel();viewport.navigation.motion.frame(selected?selectedBounds(session):sceneBounds(session),$('world').clientWidth,$('world').clientHeight);}
 action('frame-selected',()=>frame(true));action('frame-all',()=>frame(false));action('reset-view',frameScene);

 profiler=engine.directory.create('tool.profiler',{profiler:engine.basement.profiler,host:document.body,subscribe:callback=>engine.lobby.on('render',callback,'studio.profiler')});life.own(()=>profiler.dispose());action('profiler',()=>profiler.element.open=!profiler.element.open);
 life.listen(window,'keydown',e=>{if(session.play||e.target.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();frame(true);}if(e.key==='Home'){e.preventDefault();frame(false);}if(e.key==='Escape'){viewport.cancel();session.document.cancel();if(viewport.mode==='place')setTool('select');}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();viewport.cancel();try{session.remove();}catch(error){report(error);}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();viewport.cancel();try{session.duplicate();}catch(error){report(error);}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();viewport.cancel();if(e.shiftKey)session.document.redo();else session.document.undo();}});
 life.listen($('error'),'click',()=>$('error').hidden=true);
 let metricsAt=-Infinity;
 // DOM diagnostics update at 4 Hz; the viewport retains the host's normal frame rate.
 life.own(engine.lobby.on('render',(_alpha,_time,wallMs)=>{if(wallMs-metricsAt<250)return;metricsAt=wallMs;const stats=renderer.stats;$('projection').value=renderer.camera.projection;$('projection').disabled=!!session.play;$('fov').disabled=!!session.play||renderer.camera.projection!=='perspective';$('metrics').textContent=`${stats.draws} draws · ${stats.buffers} buffers`;$('status').dataset.worlds=engine.directory.worlds.size;$('status').dataset.buffers=stats.buffers;$('status').dataset.guides=renderer.lines.layers.size;$('status').dataset.camera=JSON.stringify(viewport.navigation.motion.snapshot());},'studio.status'));
 life.listen(window,'pagehide',()=>life.dispose());engine.start();
}catch(error){report(error);life.dispose();}
