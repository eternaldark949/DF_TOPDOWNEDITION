/**
 * Basement / rendering diagnostics: per-frame work deltas and requested buffer bytes.
 * Preparation uploads are included even when the later presentation resets legacy stats.
 */
export function renderDiagnostics(renderer,profiler){
  if(!profiler)return()=>{};
  const ids={},baseline={};
  for(const name of ['draws','instances','uploads','uploadedBytes','candidates','culled']){
    ids[name]=profiler.counter(`renderer.${name}`,name==='uploadedBytes'?'bytes':'count');baseline[name]=0;
  }
  for(const[name,unit]of [['buffers','count'],['programs','count'],['vaos','count'],['cpuBuffers','bytes'],['gpuBuffers','bytes'],['gpuPending','count']])ids[name]=profiler.counter(`renderer.${name}`,unit);
  return profiler.provider('renderer',{
    begin(){for(const name in baseline)baseline[name]=renderer.totals[name];},
    sample(p){
      for(const name in baseline)p.set(ids[name],renderer.totals[name]-baseline[name]);
      let cpu=0,gpu=renderer.stats.buffers?864:0;
      for(const batch of renderer.batches){cpu+=batch.cpuBytes;gpu+=batch.gpuBufferBytes;}
      p.set(ids.buffers,renderer.stats.buffers);p.set(ids.programs,renderer.stats.programs);p.set(ids.vaos,renderer.stats.vaos);
      p.set(ids.cpuBuffers,cpu);p.set(ids.gpuBuffers,gpu);p.set(ids.gpuPending,renderer.gpuTimer.pending);
    },
    status:()=>renderer.gpuTimer.inspect(),
    configure:p=>renderer.gpuTimer.configure(p.recording&&p.gpuEnabled),
    details:()=>({gpuTimer:renderer.gpuTimer.inspect(),buffers:renderer.stats.buffers,programs:renderer.stats.programs,
      vertexArrays:renderer.stats.vaos,viewport:{width:renderer.canvas.width,height:renderer.canvas.height},
      accounting:'Requested GL buffer bytes only. Default framebuffer, shader/driver storage and browser heap are excluded.'}),
  });
}
