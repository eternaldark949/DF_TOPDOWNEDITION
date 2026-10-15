/**
 * Atrium example / browser entry point. Owns page UI, engine startup and scene replacement.
 * Follow createScene -> layout -> Penthouse toys to understand or change the example.
 * The engine receives elements as parameters; it never looks up these page IDs.
 */
import { ETRNLNINE } from '../../engine/etrnlnine.js';
import { Lifetime } from '../../engine/basement/lifetime.js';
import { createScene } from './scene.js';

const canvas=document.querySelector('#world'), controlsHost=document.querySelector('#controls');
const status=document.querySelector('#status'), errorBox=document.querySelector('#error');
const pauseButton=document.querySelector('#pause'), restartButton=document.querySelector('#restart');
const directoryStatus=document.querySelector('#directory-status'), travelStatus=document.querySelector('#travel-status');
const releaseButton=document.querySelector('#release-inactive'), cancelButton=document.querySelector('#cancel-flit');
const aoSelect=document.querySelector('#ambient-occlusion');
const heading=document.querySelector('h1');
const life=new Lifetime();
let engine, scene;

/** Report readable failures while preserving the error for developer tools. */
function report(error) {
  errorBox.hidden=false; errorBox.textContent=error.message; console.error(error);
}

/** Replace the scene through its public lifetime; no game state is stored inside engine/. */
function replaceScene() {
  scene?.dispose(); scene=null;
  scene=createScene(engine,{ controlsHost, onError:report, onStatus: state => {
    const renderer=engine.basement.renderer,r=renderer.stats,ao=renderer.occlusion.inspect();
    aoSelect.dataset.effective=ao.effectiveMode;
    document.querySelector('#ao-status').textContent=ao.failure?'Screen AO unavailable; geometry fallback.':ao.effectiveMode==='screen'?`${ao.width} × ${ao.height} screen contacts · ambient light only`:'Ambient light only · no screen targets';
    status.textContent=`${state.loaded?'Weighted':'Light'} pack · ${state.entities} forms · ${r.draws} draws · ${r.uploadedBytes} B updated`;
    // Small DOM diagnostics aid accessibility and automated verification; no engine globals.
    status.dataset.world=state.worldId; status.dataset.x=state.x.toFixed(3); status.dataset.y=state.y.toFixed(3);
    status.dataset.buffers=r.buffers; status.dataset.vaos=r.vaos;
    status.dataset.time=state.time.toFixed(2); status.dataset.cool=String(state.cool);
    status.dataset.actor=state.actorId;status.dataset.prop=state.propX;status.dataset.entities=state.entities;
    status.dataset.resident=state.residency.resident;status.dataset.snapshotBytes=state.residency.snapshotBytes;
    status.dataset.evictions=state.residency.evictions;status.dataset.committed=state.travel?.committed??0;
    status.dataset.cancelled=state.travel?.cancelled??0;status.dataset.failed=state.travel?.failed??0;
    heading.textContent=state.name;
    directoryStatus.textContent=`${state.residency.resident}/${state.residency.capacity} worlds resident · ${state.residency.snapshotBytes} B saved state`;
    travelStatus.textContent=state.travel?.status==='preparing'||state.travel?.status==='ready'||state.travel?.status==='failed'||state.travel?.status==='cancelled'
      ? state.travel.message : state.message;
    document.querySelector('#transfer-time').textContent=state.travel?.committed
      ? `Last transfer ${state.travel.transferMs.toFixed(2)} ms · preparation/wait ${state.travel.waitMs.toFixed(1)} ms` : 'Destination preparation runs in bounded chunks';
    const slots=state.residency.worlds.map(world=>`${world.key.endsWith('amber')?'Amber':'Violet'}: ${world.status} / ${world.owners} owner${world.owners===1?'':'s'}${world.key===scene?.journey.travel?.current.key?' / active':''}`);
    document.querySelector('#world-slots').textContent=slots.join(' · ');
    document.querySelector('#gpu-status').textContent=`${r.buffers} GPU buffers · ${r.vaos} world batches`;
    cancelButton.disabled=!scene?.journey.travel?.pending;
  }});
}

try {
  engine=new ETRNLNINE(canvas,{ pixelRatio:1.5,profiling:{enabled:true} });
  // Example policy only: phone-sized layouts start with the target-free geometry tier.
  // Resizing never silently changes a user's explicit selection.
  const aoMode=window.matchMedia('(max-width:650px)').matches?'geometry':'screen';
  engine.basement.renderer.occlusion.configure({mode:aoMode});aoSelect.value=aoMode;
  life.listen(aoSelect,'change',()=>engine.basement.renderer.occlusion.configure({mode:aoSelect.value}));
  replaceScene();
  const profilerView=engine.directory.create('tool.profiler',{profiler:engine.basement.profiler,host:document.body,
    subscribe:callback=>engine.lobby.on('render',callback,'profiler.viewer')});
  life.own(()=>profilerView.dispose());engine.start();
  life.listen(pauseButton,'click',() => {
    const paused=!engine.lobby.reasons.has('example-menu');
    engine.lobby.pause('example-menu',paused);
    pauseButton.textContent=paused?'Resume':'Pause'; pauseButton.setAttribute('aria-pressed',String(paused));
  });
  life.listen(releaseButton,'click',()=>{
    try { scene.journey.releaseInactive(); } catch(error) { report(error); }
  });
  life.listen(cancelButton,'click',()=>scene.journey.cancel());
  life.listen(restartButton,'click',() => {
    try { replaceScene(); } catch(error) { report(error); }
  });
  life.listen(window,'pagehide',event => {
    // bfcache retains a page intact; unload it only when it will not be restored.
    if (!event.persisted) dispose();
  });
} catch(error) { scene?.dispose(); engine?.dispose(); report(error); }

/** Tear down the game before its engine. The listener owner is itself idempotent. */
function dispose() { life.dispose(); scene?.dispose(); engine?.dispose(); }
