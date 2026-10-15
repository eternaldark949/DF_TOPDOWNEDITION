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
const life=new Lifetime();
let engine, scene;

/** Report readable failures while preserving the error for developer tools. */
function report(error) {
  errorBox.hidden=false; errorBox.textContent=error.message; console.error(error);
}

/** Replace the scene through its public lifetime; no game state is stored inside engine/. */
function replaceScene() {
  scene?.dispose(); scene=null;
  scene=createScene(engine,{ controlsHost, onStatus: state => {
    const r=engine.basement.renderer.stats;
    status.textContent=`${state.loaded?'Weighted':'Light'} pack · ${state.entities} forms · ${r.draws} draw · ${r.uploadedBytes} B updated`;
    // Small DOM diagnostics aid accessibility and automated verification; no engine globals.
    status.dataset.world=state.worldId; status.dataset.x=state.x.toFixed(3); status.dataset.y=state.y.toFixed(3);
    status.dataset.buffers=r.buffers; status.dataset.vaos=r.vaos;
    status.dataset.time=state.time.toFixed(2); status.dataset.cool=String(state.cool);
  }});
}

try {
  engine=new ETRNLNINE(canvas,{ pixelRatio:1.5 });
  replaceScene(); engine.start();
  life.listen(pauseButton,'click',() => {
    const paused=!engine.lobby.reasons.has('example-menu');
    engine.lobby.pause('example-menu',paused);
    pauseButton.textContent=paused?'Resume':'Pause'; pauseButton.setAttribute('aria-pressed',String(paused));
  });
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
