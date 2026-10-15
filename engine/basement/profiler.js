/**
 * Basement / profiler: bounded CPU scopes, numeric counters, frame history and captures.
 * This mechanism knows no scheduler, renderer, game, DOM element, or GPU API.
 * Milliseconds everywhere. Recording reuses typed storage; summaries/captures allocate
 * only when explicitly requested. Disabled scope calls do not read the clock.
 */
import { boundedCopy, percentile, freezeData, diagnosticError } from './profile-data.js';

export class Profiler {
  /** Capacities are hard budgets. Choose them at engine creation, not during a frame. */
  constructor({ enabled = false, gpu = false, capacity = 120, maxScopes = 32, maxCounters = 48,
    maxSpans = 96, maxDepth = 16, maxCaptures = 2, now = () => performance.now() } = {}) {
    for (const value of [capacity,maxScopes,maxCounters,maxSpans,maxDepth,maxCaptures]) {
      if (!Number.isInteger(value) || value < 1) throw new RangeError('Profiler capacities must be positive integers');
    }
    this.enabled = enabled; this.frozen = false; this.gpuEnabled = Boolean(gpu); this.disposed = false;
    this.capacity=capacity;this.maxScopes=maxScopes;this.maxCounters=maxCounters;
    this.maxSpans=maxSpans;this.maxDepth=maxDepth;this.maxCaptures=maxCaptures;this.now=now;
    this.scopes=[];this.counters=[];this.scopeNames=new Map();this.counterNames=new Map();
    this.providers=new Map();this.captures=[];this.frames=[];this.sequence=0;this.captureSequence=0;this.count=0;this.current=null;
    this.depth=0;this.nextToken=0;this.arm=null;
    this.stackIds=new Int32Array(maxDepth);this.stackStarts=new Float64Array(maxDepth);
    this.stackChildren=new Float64Array(maxDepth);this.stackTokens=new Float64Array(maxDepth);
    this.stackSpans=new Int32Array(maxDepth);
    this.stats={droppedSpans:0,depthOverflows:0,providerErrors:0,unbalancedFrames:0,expiredGpuSamples:0,lastCaptureMs:0,lastExportMs:0,lastProviderError:''};
    for(let i=0;i<capacity;i++)this.frames.push({id:0,intervalMs:null,cpuMs:0,collectionMs:0,gpuMs:null,
      paused:false,failed:false,simulationTime:0,started:0,spanCount:0,droppedSpans:0,coveredMs:0,
      inclusive:new Float64Array(maxScopes),self:new Float64Array(maxScopes),calls:new Uint32Array(maxScopes),
      values:new Float64Array(maxCounters),spans:new Float64Array(maxSpans*4)});
    this.collectionScope=this.scope('diagnostics.collect');
  }

  /** True only when scope/counter/frame mutation is allowed. Freeze preserves existing history. */
  get recording(){return this.enabled&&!this.frozen&&!this.disposed;}

  /** Return an existing numeric handle or register a bounded static name once. */
  register(list,names,name,limit,unit){
    if(this.disposed)throw new Error('Profiler is disposed');
    if(typeof name!=='string'||!name.length||name.length>80)throw new RangeError('Profiler names must contain 1–80 characters');
    if(unit!==undefined&&(typeof unit!=='string'||!unit.length||unit.length>24))throw new RangeError('Counter units must contain 1–24 characters');
    if(names.has(name)){
      const id=names.get(name);
      if(unit!==undefined&&list[id].unit!==unit)throw new Error(`Counter unit changed: ${name}`);
      return id;
    }
    if(list.length>=limit)throw new Error('Profiler metric registry budget exceeded');
    const id=list.length;list.push({name,...(unit===undefined?{}:{unit})});names.set(name,id);return id;
  }

  /** Register static subsystem names, not per-entity names; handles remain stable across scenes. */
  scope(name){return this.register(this.scopes,this.scopeNames,name,this.maxScopes);}
  /** Register a scalar counter/gauge. Units are display metadata, not conversion rules. */
  counter(name,unit='count'){return this.register(this.counters,this.counterNames,name,this.maxCounters,unit);}

  /** Register at most eight providers; removal is owned by the reporting subsystem. */
  provider(name,{begin,sample,details,status,configure}={}){
    if(this.disposed)throw new Error('Profiler is disposed');
    if(typeof name!=='string'||name.length>80||!name.length)throw new RangeError('Invalid provider name');
    if(this.providers.has(name))throw new Error(`Duplicate profiler provider: ${name}`);
    if(this.providers.size>=8)throw new Error('Profiler provider budget exceeded');
    const record={name,begin,sample,details,status,configure};this.providers.set(name,record);
    return()=>{if(this.providers.get(name)===record)this.providers.delete(name);};
  }

  /** Request a bounded lightweight provider status, only when a viewer asks for it. */
  status(name){
    try{return boundedCopy(this.providers.get(name)?.status?.()??null,{remaining:64});}
    catch(error){return{error:diagnosticError(error)};}
  }

  /** Isolate reporting failures: a broken diagnostic provider cannot stop the game. */
  collect(method){
    for(const provider of this.providers.values()){
      try{provider[method]?.(this);}catch(error){
        this.stats.providerErrors++;this.stats.lastProviderError=`${provider.name}.${method}: ${diagnosticError(error)}`;
      }
    }
  }

  /** Begin one frame. intervalMs is the raw rAF gap, or null after start/pause/resume. */
  beginFrame(intervalMs,paused=false){
    if(!this.recording)return 0;
    if(this.current)throw new Error('Profiler frame already active');
    const id=++this.sequence,frame=this.frames[(id-1)%this.capacity];
    frame.id=id;frame.intervalMs=Number.isFinite(intervalMs)?Math.max(0,intervalMs):null;
    frame.cpuMs=frame.collectionMs=0;frame.gpuMs=null;frame.paused=paused;frame.failed=false;
    frame.spanCount=frame.droppedSpans=frame.coveredMs=0;frame.inclusive.fill(0);frame.self.fill(0);frame.calls.fill(0);frame.values.fill(0);
    frame.started=this.now();this.current=frame;this.depth=0;
    // Providers baseline cumulative counters before preparation/uploads begin.
    this.collect('begin');return id;
  }

  /** Enter a nested synchronous scope. Tokens are frame-specific and consumed LIFO. */
  begin(id){
    if(!this.recording||!this.current)return -1;
    if(!Number.isInteger(id)||id<0||id>=this.scopes.length)throw new Error('Unknown profiler scope');
    if(this.depth===this.maxDepth){this.stats.depthOverflows++;return -1;}
    const frame=this.current,d=this.depth++,start=this.now(),token=++this.nextToken;
    this.stackIds[d]=id;this.stackStarts[d]=start;this.stackChildren[d]=0;this.stackTokens[d]=token;
    const span=frame.spanCount<this.maxSpans?frame.spanCount++:-1;this.stackSpans[d]=span;
    if(span>=0){const i=span*4;frame.spans[i]=id;frame.spans[i+1]=start-frame.started;frame.spans[i+3]=d;}
    else{frame.droppedSpans++;this.stats.droppedSpans++;}
    return token;
  }

  /** Close a scope in finally. Inclusive time includes children; self time subtracts them. */
  end(token){
    if(token<0||!this.current)return;
    const d=this.depth-1;
    if(d<0||this.stackTokens[d]!==token)throw new Error('Profiler scopes must close in LIFO order');
    const duration=Math.max(0,this.now()-this.stackStarts[d]),id=this.stackIds[d],frame=this.current;
    frame.inclusive[id]+=duration;frame.self[id]+=Math.max(0,duration-this.stackChildren[d]);frame.calls[id]++;
    const span=this.stackSpans[d];if(span>=0)frame.spans[span*4+2]=duration;
    this.depth--;if(this.depth)this.stackChildren[this.depth-1]+=duration;else frame.coveredMs+=duration;
  }

  /** Set one registered numeric frame value. Disabled mode avoids validation and storage work. */
  set(id,value){
    if(!this.recording||!this.current)return;
    if(!Number.isInteger(id)||id<0||id>=this.counters.length||!Number.isFinite(value))throw new Error('Invalid profiler counter');
    this.current.values[id]=value;
  }

  /** Finalize even a failed runtime frame. Diagnostic collection time is explicitly identified. */
  endFrame(simulationTime=0,failed=false){
    const frame=this.current;if(!frame)return;
    if(this.depth){this.stats.unbalancedFrames++;while(this.depth)this.end(this.stackTokens[this.depth-1]);}
    const collection=this.begin(this.collectionScope),before=this.now();
    this.collect('sample');frame.collectionMs=Math.max(0,this.now()-before);this.end(collection);
    frame.cpuMs=Math.max(0,this.now()-frame.started);frame.simulationTime=simulationTime;frame.failed=failed;
    this.current=null;this.count=Math.min(this.capacity,this.count+1);
    if(this.arm&&((frame.intervalMs??0)>=this.arm.intervalMs||frame.cpuMs>=this.arm.cpuMs)){
      this.arm=null;this.capture(frame.id,'armed spike');
    }
  }

  /** GPU results can arrive later. Attach only to their original still-retained frame. */
  recordGpu(id,milliseconds){
    if(!this.recording||!Number.isFinite(milliseconds)||milliseconds<0)return;
    const frame=this.frames[(id-1)%this.capacity];
    if(!frame||frame.id!==id){this.stats.expiredGpuSamples++;return;}
    frame.gpuMs=milliseconds;
  }

  /** Internal slot lookup; public summary/capture methods return owned data instead. */
  #retainedFrame(id=this.sequence){
    const frame=this.frames[(id-1)%this.capacity];
    if(!frame||frame.id!==id||frame===this.current)throw new Error('Profiler frame expired or incomplete');
    return frame;
  }

  /** On-demand bounded summary for a viewer/export; never called by the hot recorder itself. */
  summary(){
    const frames=this.frames.filter(frame=>frame.id&&frame!==this.current).sort((a,b)=>a.id-b.id);
    const intervals=frames.map(f=>f.intervalMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const cpu=frames.map(f=>f.cpuMs).sort((a,b)=>a-b);
    const gpu=frames.map(f=>f.gpuMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const latest=frames.at(-1),worst=frames.reduce((a,b)=>!a||Math.max(b.intervalMs??0,b.cpuMs)>Math.max(a.intervalMs??0,a.cpuMs)?b:a,null);
    return {enabled:this.enabled,frozen:this.frozen,capacity:this.capacity,count:frames.length,
      latestId:latest?.id??null,worstId:worst?.id??null,
      interval:{p50:percentile(intervals,0.5),p95:percentile(intervals,0.95),worst:intervals.at(-1)??null},
      cpu:{p50:percentile(cpu,0.5),p95:percentile(cpu,0.95),worst:cpu.at(-1)??null},
      gpu:{p50:percentile(gpu,0.5),p95:percentile(gpu,0.95),worst:gpu.at(-1)??null,samples:gpu.length},
      latest:latest?{id:latest.id,cpuMs:latest.cpuMs,intervalMs:latest.intervalMs,gpuMs:latest.gpuMs,
        collectionMs:latest.collectionMs,unscopedMs:Math.max(0,latest.cpuMs-latest.coveredMs),paused:latest.paused,failed:latest.failed}:null,
      scopes:latest?this.scopes.map((scope,id)=>({...scope,inclusiveMs:latest.inclusive[id],selfMs:latest.self[id],calls:latest.calls[id]})).filter(s=>s.calls).sort((a,b)=>b.inclusiveMs-a.inclusiveMs):[],
      counters:latest?this.counters.map((counter,id)=>({...counter,value:latest.values[id]})):[],
      chart:frames.map(frame=>({id:frame.id,intervalMs:frame.intervalMs,cpuMs:frame.cpuMs,gpuMs:frame.gpuMs})),
      captures:this.captures.map(c=>({id:c.frame.id,label:c.label})),stats:{...this.stats}};
  }

  /** Capture copied frame facts and CURRENT provider details, labeled separately for historical frames. */
  capture(id=this.sequence,label='manual'){
    const before=this.now(),frame=this.#retainedFrame(id),budget={remaining:1024},details=Object.create(null);
    for(const[name,provider]of this.providers){
      if(budget.remaining<=0)break;
      try{details[name]=boundedCopy(provider.details?.()??null,budget);}catch(error){details[name]={error:diagnosticError(error)};}
    }
    const capture={version:1,id:++this.captureSequence,label:String(label).slice(0,80),frame:{id:frame.id,intervalMs:frame.intervalMs,cpuMs:frame.cpuMs,
      gpuMs:frame.gpuMs,collectionMs:frame.collectionMs,unscopedMs:Math.max(0,frame.cpuMs-frame.coveredMs),simulationTime:frame.simulationTime,paused:frame.paused,failed:frame.failed,
      droppedSpans:frame.droppedSpans,
      scopes:this.scopes.map((scope,i)=>({...scope,inclusiveMs:frame.inclusive[i],selfMs:frame.self[i],calls:frame.calls[i]})).filter(s=>s.calls),
      counters:this.counters.map((counter,i)=>({...counter,value:frame.values[i]})),
      spans:Array.from({length:frame.spanCount},(_,i)=>({scope:this.scopes[frame.spans[i*4]].name,startMs:frame.spans[i*4+1],durationMs:frame.spans[i*4+2],depth:frame.spans[i*4+3]}))},
      providerDetails:{timing:'current state at capture time; frame counters belong to the recorded frame',data:details}};
    if(this.captures.length===this.maxCaptures)this.captures.shift();this.captures.push(freezeData(capture));this.stats.lastCaptureMs=Math.max(0,this.now()-before);return capture;
  }

  /** Arm one automatic spike capture; disarm immediately after it fires to bound capture overhead. */
  armSpike({intervalMs=50,cpuMs=16.67}={}){
    if(this.disposed)throw new Error('Profiler is disposed');
    if(!(intervalMs>0)||!(cpuMs>0)||!Number.isFinite(intervalMs)||!Number.isFinite(cpuMs))throw new RangeError('Spike thresholds must be positive finite milliseconds');
    this.arm={intervalMs,cpuMs};
  }

  /** Export owned copies/metadata as JSON; no callbacks, world instances or device input are serialized. */
  exportJSON(){
    const before=this.now(),json=JSON.stringify({version:1,units:'milliseconds',summary:this.summary(),captures:this.captures},null,2);
    this.stats.lastExportMs=Math.max(0,this.now()-before);return json;
  }

  /** Stop/freeze between frames. Recording state never pauses or changes the game simulation. */
  configure({enabled=this.enabled,frozen=this.frozen,gpu=this.gpuEnabled}={}){
    if(this.disposed)throw new Error('Profiler is disposed');
    if(this.current)throw new Error('Change profiler recording between frames');
    this.enabled=Boolean(enabled);this.frozen=Boolean(frozen);this.gpuEnabled=Boolean(gpu);this.collect('configure');
  }

  /** Total owned typed storage, excluding JS/driver overhead; useful for profiler's own budget. */
  get storageBytes(){
    let bytes=this.stackIds.byteLength+this.stackStarts.byteLength+this.stackChildren.byteLength+this.stackTokens.byteLength+this.stackSpans.byteLength;
    for(const frame of this.frames)bytes+=frame.inclusive.byteLength+frame.self.byteLength+frame.calls.byteLength+frame.values.byteLength+frame.spans.byteLength;
    return bytes;
  }

  /** Drop history/captures and reporting callbacks so no disposed subsystem is retained. */
  dispose(){
    if(this.disposed)return;
    this.enabled=false;this.current=null;this.arm=null;this.collect('configure');this.providers.clear();this.captures.length=0;this.frames.length=0;
    this.stackIds=new Int32Array(0);this.stackStarts=new Float64Array(0);this.stackChildren=new Float64Array(0);
    this.stackTokens=new Float64Array(0);this.stackSpans=new Int32Array(0);
    this.scopes.length=this.counters.length=0;this.scopeNames.clear();this.counterNames.clear();this.count=0;this.disposed=true;
  }
}
