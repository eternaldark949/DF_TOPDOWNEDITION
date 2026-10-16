/**
 * Basement / rendering diagnostics: per-frame work deltas and requested buffer bytes.
 * Preparation uploads are included even when the later presentation resets legacy stats.
 */
export function renderDiagnostics(renderer,profiler){
  if(!profiler)return()=>{};
  const ids={},baseline={};
  for(const name of ['draws','instances','uploads','uploadedBytes','candidates','culled','shadowDraws','shadowHits']){
    ids[name]=profiler.counter(`renderer.${name}`,name==='uploadedBytes'?'bytes':'count');baseline[name]=0;
  }
  for(const[name,unit]of [['buffers','count'],['programs','count'],['vaos','count'],['cpuBuffers','bytes'],['gpuBuffers','bytes'],['gpuPending','count'],['aoTargets','bytes'],['aoBlockers','count'],['shadowTargets','bytes']])ids[name]=profiler.counter(`renderer.${name}`,unit);
  return profiler.provider('renderer',{
    begin(){for(const name in baseline)baseline[name]=renderer.totals[name];},
    sample(p){
      for(const name in baseline)p.set(ids[name],renderer.totals[name]-baseline[name]);
      let cpu=0,gpu=renderer.stats.buffers?864:0;
      for(const batch of renderer.batches){cpu+=batch.cpuBytes;gpu+=batch.gpuBufferBytes;}
      p.set(ids.buffers,renderer.stats.buffers);p.set(ids.programs,renderer.stats.programs);p.set(ids.vaos,renderer.stats.vaos);
      p.set(ids.cpuBuffers,cpu);p.set(ids.gpuBuffers,gpu);p.set(ids.gpuPending,renderer.gpuTimer.pending);
      const ao=renderer.occlusion,t=ao.targets;
      p.set(ids.aoTargets,t?t.width*t.height*9:0);p.set(ids.aoBlockers,ao.count);
      const maps=renderer.lighting.maps;p.set(ids.shadowTargets,(maps.sun?.bytes??0)+(maps.point?.bytes??0));
    },
    status:()=>renderer.gpuTimer.inspect(),
    configure:p=>renderer.gpuTimer.configure(p.recording&&p.gpuEnabled),
    details:()=>({gpuTimer:renderer.gpuTimer.inspect(),buffers:renderer.stats.buffers,programs:renderer.stats.programs,
      vertexArrays:renderer.stats.vaos,ambientOcclusion:renderer.occlusion.inspect(),lighting:renderer.lighting.inspect(),viewport:{width:renderer.canvas.width,height:renderer.canvas.height},
      accounting:'Requested GL buffer bytes only. Estimated AO and shadow texture bytes are reported separately in ambientOcclusion/aoTargets. Default framebuffer, shader/driver storage and browser heap are excluded.'}),
  });
}
