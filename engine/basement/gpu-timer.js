/**
 * Basement / GPU timer: optional EXT_disjoint_timer_query_webgl2 measurements.
 * At most four reusable queries. Results are polled for availability, never forced
 * with finish/readback or a blocking result fetch. Measurements retain original frame IDs.
 */
export class GpuTimer {
  /** report(frameId,ms) is a data callback, never a renderer/game dependency. */
  constructor(gl,report,{capacity=4}={}){
    if(!Number.isInteger(capacity)||capacity<1)throw new RangeError('GPU query capacity must be positive');
    this.gl=gl;this.report=report;this.capacity=capacity;this.slots=[];this.active=null;
    this.enabled=false;this.lost=false;this.disposed=false;
    this.stats={completed:0,skipped:0,disjoint:0,reportErrors:0};this.restore();
  }
  /** Reacquire capability after restoration; old context handles must not be reused. */
  restore(){if(!this.lost)this.clear();this.slots.length=0;this.active=null;this.lost=false;this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');}
  /** Context loss invalidates handles without issuing GL operations against the lost context. */
  invalidate(){this.slots.length=0;this.active=null;this.lost=true;}
  /** Disabling discards pending timings and deletes query handles, without waiting for completion. */
  configure(enabled){
    const next=Boolean(enabled&&!this.disposed&&!this.lost&&this.extension);
    if(this.enabled&&!next)this.clear();this.enabled=next;
  }
  /** Count queued results; no GPU call or allocation. */
  get pending(){let count=0;for(const slot of this.slots)if(slot.pending)count++;return count;}
  /** Poll only previously ended queries. A disjoint event invalidates all pending results. */
  poll(){
    if(!this.enabled||!this.pending)return;
    const gl=this.gl,ext=this.extension;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
      this.stats.disjoint++;for(const slot of this.slots)slot.pending=false;return;
    }
    for(const slot of this.slots){
      if(!slot.pending||!gl.getQueryParameter(slot.query,gl.QUERY_RESULT_AVAILABLE))continue;
      const nanoseconds=gl.getQueryParameter(slot.query,gl.QUERY_RESULT);
      slot.pending=false;this.stats.completed++;
      try{this.report(slot.frameId,nanoseconds/1e6);}catch{this.stats.reportErrors++;}
    }
  }
  /** Begin one render query if a free slot exists. Saturation skips timing, never stalls drawing. */
  begin(frameId){
    if(!this.enabled||!frameId||this.active)return;
    let slot=null;for(const candidate of this.slots)if(!candidate.pending){slot=candidate;break;}
    if(!slot&&this.slots.length<this.capacity){
      const query=this.gl.createQuery();if(!query){this.stats.skipped++;return;}
      slot={query,pending:false,frameId:0};this.slots.push(slot);
    }
    if(!slot){this.stats.skipped++;return;}
    slot.frameId=frameId;this.active=slot;this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,slot.query);
  }
  /** End in finally, preserving the measured frame association until its result becomes available. */
  end(){if(!this.active)return;this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.active.pending=true;this.active=null;}
  /** Release query objects once; a lost context already invalidated those handles. */
  clear(){
    if(!this.lost){if(this.active)this.end();for(const slot of this.slots)this.gl.deleteQuery(slot.query);}
    this.slots.length=0;this.active=null;
  }
  /** Bounded capability/status data for provider captures. */
  inspect(){return{supported:Boolean(this.extension),enabled:this.enabled,pending:this.pending,capacity:this.capacity,...this.stats};}
  /** Dispose cannot outlive the renderer's context owner. */
  dispose(){if(this.disposed)return;this.clear();this.enabled=false;this.disposed=true;}
}
