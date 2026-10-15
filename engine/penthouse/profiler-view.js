/**
 * Penthouse / profiler viewer: accessible HTML/SVG, bounded tables and capture export.
 * Receives a generic subscription function; it never imports Lobby or starts a loop.
 * Closed viewers unsubscribe. Open viewers refresh at most twice a second by default.
 */
import { Lifetime } from '../basement/lifetime.js';
import { diagnosticError } from '../basement/profile-data.js';
import { PROFILER_STYLE } from './profiler-style.js';

/** Format measured values without turning unavailable measurements into zero. */
function ms(value){return Number.isFinite(value)?value.toFixed(2):'—';}

/** Populate bounded text-only rows. Authored scope/owner names never enter HTML markup. */
function rows(table,values){
  table.replaceChildren();
  for(const cells of values){
    const row=document.createElement('tr');
    for(const text of cells){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    table.append(row);
  }
}

export class ProfilerView {
  /** subscribe(callback) must return a remover; supply it from the caller's existing scheduler. */
  constructor({profiler,host,subscribe,intervalMs=500}){
    if(!(intervalMs>0)||!Number.isFinite(intervalMs))throw new RangeError('Profiler view interval must be positive');
    this.profiler=profiler;this.subscribe=subscribe;this.intervalMs=intervalMs;this.lastRefresh=-Infinity;
    this.life=new Lifetime();this.removeSubscription=null;this.downloadURL=null;this.lastCaptureId=0;
    this.element=document.createElement('details');this.element.className='etrnl-profiler';
    // Static component markup only. Dynamic names, values and JSON use textContent below.
    this.element.innerHTML=`<style>${PROFILER_STYLE}</style><summary>Engine profiler</summary><div class="profile-body">
      <div class="profile-state" aria-live="polite">Waiting for frames</div>
      <div class="profile-controls"><label><input type="checkbox" name="record">Record</label><label><input type="checkbox" name="freeze">Freeze history</label><label><input type="checkbox" name="gpu">GPU timing</label></div>
      <div class="profile-hint profile-gpu"></div>
      <svg viewBox="0 0 300 80" role="img" aria-label="Recent CPU and frame interval history"><line x1="0" y1="64" x2="300" y2="64" stroke="#6b5d4555"/><polyline class="profile-interval" fill="none" stroke="#ab8edb" stroke-width="1.4"/><polyline class="profile-cpu" fill="none" stroke="#e3bc78" stroke-width="1.5"/><polyline class="profile-gpu-line" fill="none" stroke="#6ec7d7" stroke-width="1.2"/></svg>
      <div class="profile-legend">Gold: CPU · Violet: frame interval · Cyan: GPU · <span class="profile-scale"></span></div>
      <table class="profile-grid"><thead><tr><th>Milliseconds</th><th>p50</th><th>p95</th><th>Worst</th></tr></thead><tbody class="profile-summary"></tbody></table>
      <h3>Latest CPU scopes · inclusive / self</h3><table class="profile-grid"><tbody class="profile-scopes"></tbody></table>
      <details class="profile-counter-details"><summary>Frame counters</summary><table class="profile-grid"><tbody class="profile-counters"></tbody></table></details>
      <div class="profile-hint profile-cost"></div>
      <div class="profile-actions"><button type="button" data-action="latest">Capture latest</button><button type="button" data-action="worst">Capture worst</button><button type="button" data-action="arm">Arm next spike</button><button type="button" data-action="export">Export JSON</button></div>
      <div class="profile-hint profile-capture-state"></div><details><summary>Latest capture details</summary><pre class="profile-capture">No capture yet.</pre></details>
      <div class="profile-hint">CPU is measured frame work, not GPU completion. Counters cover registered systems; buffer bytes exclude driver/browser heaps. Captures label current owner details separately from historical frame data.</div>
      <div class="profile-error" role="status"></div></div>`;
    host.append(this.element);
    this.find=selector=>this.element.querySelector(selector);
    this.checkboxes={record:this.find('[name=record]'),freeze:this.find('[name=freeze]'),gpu:this.find('[name=gpu]')};
    this.life.listen(this.element,'toggle',()=>{
      // Nested capture details also emit toggle events; only the root controls scheduling.
      if(this.element.open&&!this.removeSubscription)this.removeSubscription=this.subscribe?.((a,t,wallMs)=>this.refresh(wallMs));
      if(!this.element.open&&this.removeSubscription){this.removeSubscription();this.removeSubscription=null;}
      if(this.element.open)this.refresh(performance.now(),true);
    });
    for(const checkbox of Object.values(this.checkboxes))this.life.listen(checkbox,'change',()=>this.action(()=>{
      profiler.configure({enabled:this.checkboxes.record.checked,frozen:this.checkboxes.freeze.checked,gpu:this.checkboxes.gpu.checked});
    }));
    this.life.listen(this.element,'click',event=>{
      const button=event.target.closest('button[data-action]');if(!button||!this.element.contains(button))return;
      this.action(()=>{
        if(button.dataset.action==='latest')profiler.capture(profiler.summary().latestId,'manual latest');
        if(button.dataset.action==='worst')profiler.capture(profiler.summary().worstId,'manual worst retained');
        if(button.dataset.action==='arm')profiler.armSpike();
        if(button.dataset.action==='export')this.download();
      });
    });
    this.life.own(()=>{this.removeSubscription?.();if(this.downloadURL)URL.revokeObjectURL(this.downloadURL);this.element.remove();});
  }

  /** UI failures are visible inside the inspector and never thrown into simulation. */
  action(callback){
    try{callback();this.find('.profile-error').textContent='';}
    catch(error){this.find('.profile-error').textContent=diagnosticError(error);}
    this.refresh(performance.now(),true);
  }

  /** Refresh only while open, using wall time so inspecting a paused world remains useful. */
  refresh(wallMs,force=false){
    if(this.life.disposed||(!this.element.open&&!force)||(!force&&wallMs-this.lastRefresh<this.intervalMs))return;
    this.lastRefresh=wallMs;
    const p=this.profiler,s=p.summary(),gpu=p.status('renderer');
    this.checkboxes.record.checked=p.enabled;this.checkboxes.freeze.checked=p.frozen;
    this.checkboxes.gpu.checked=p.gpuEnabled;this.checkboxes.gpu.disabled=!gpu?.supported;
    this.find('.profile-state').textContent=`${p.enabled?(p.frozen?'History frozen; game continues':'Recording'):'Recording off'} · ${s.count}/${s.capacity} frames`;
    this.element.dataset.frame=s.latestId??0;this.element.dataset.count=s.count;this.element.dataset.captures=s.captures.length;
    this.find('.profile-gpu').textContent=gpu?.supported?`Asynchronous GPU timer · ${gpu.pending} pending · ${gpu.skipped} skipped · ${gpu.disjoint} disjoint resets`:'GPU timing unavailable on this context; CPU profiling remains available.';
    rows(this.find('.profile-summary'),[['CPU',ms(s.cpu.p50),ms(s.cpu.p95),ms(s.cpu.worst)],['Interval',ms(s.interval.p50),ms(s.interval.p95),ms(s.interval.worst)],[`GPU (${s.gpu.samples})`,ms(s.gpu.p50),ms(s.gpu.p95),ms(s.gpu.worst)]]);
    rows(this.find('.profile-scopes'),s.scopes.slice(0,8).map(scope=>[`${scope.name} ×${scope.calls}`,ms(scope.inclusiveMs),ms(scope.selfMs)]));
    if(force||this.find('.profile-counter-details').open){
      rows(this.find('.profile-counters'),s.counters.map(counter=>[counter.name,`${Number(counter.value.toFixed(2))} ${counter.unit}`]));
    }
    const scale=Math.max(33.34,...s.chart.map(frame=>Math.max(frame.cpuMs,frame.intervalMs??0,frame.gpuMs??0)));
    for(const[property,selector]of [['intervalMs','.profile-interval'],['cpuMs','.profile-cpu'],['gpuMs','.profile-gpu-line']]){
      const points=[];
      for(let index=0;index<s.chart.length;index++){
        const value=s.chart[index][property];if(!Number.isFinite(value))continue;
        const x=s.chart.length>1?index/(s.chart.length-1)*300:0;
        points.push(`${x.toFixed(1)},${(78-Math.min(1,value/scale)*76).toFixed(1)}`);
      }
      this.find(selector).setAttribute('points',points.join(' '));
    }
    this.find('.profile-scale').textContent=`0–${scale.toFixed(0)} ms`;
    this.find('.profile-cost').textContent=`Collection ${ms(s.latest?.collectionMs)} ms · unscoped ${ms(s.latest?.unscopedMs)} ms · typed history ${(p.storageBytes/1024).toFixed(1)} KiB · last capture ${ms(s.stats.lastCaptureMs)} ms`;
    this.find('.profile-capture-state').textContent=`${s.captures.length}/${p.maxCaptures} captures retained${p.arm?' · next spike armed':''} · ${s.stats.providerErrors} provider errors`;
    const capture=p.captures.at(-1);
    // Formatting a large capture is an explicit capture cost, not recurring viewer work.
    if((capture?.id??0)!==this.lastCaptureId){
      this.lastCaptureId=capture?.id??0;
      this.find('.profile-capture').textContent=capture?JSON.stringify(capture,null,2):'No capture yet.';
    }
    for(const name of ['latest','worst'])this.find(`[data-action=${name}]`).disabled=!s.count;
  }

  /** Keep at most one download URL alive. The browser owns the downloaded file, not engine memory. */
  download(){
    if(this.downloadURL)URL.revokeObjectURL(this.downloadURL);
    this.downloadURL=URL.createObjectURL(new Blob([this.profiler.exportJSON()],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=this.downloadURL;anchor.download='ETRNLNINE-profile.json';
    this.element.append(anchor);anchor.click();anchor.remove();
  }

  /** Remove subscriptions, listeners, DOM and the last download URL through the same lifetime. */
  dispose(){this.life.dispose();}
}
