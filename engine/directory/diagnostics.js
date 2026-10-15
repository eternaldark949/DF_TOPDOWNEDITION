/**
 * Directory / diagnostics: report resource ownership through Basement's provider contract.
 * Frame samples are scalar sums. Detailed rows are copied only on capture, capped at 64.
 * Requested buffer sizes are accounting data, not total JS heap or driver memory.
 */
export function directoryDiagnostics(directory,profiler){
  if(!profiler)return()=>{};
  const ids={};
  for(const[name,unit]of [['worlds','count'],['entities','count'],['resources','count'],['leases','count'],
    ['ownedCpuBuffers','bytes'],['ownedGpuBuffers','bytes'],['savedState','bytes'],['resident','count']]){
    ids[name]=profiler.counter(`directory.${name}`,unit);
  }
  return profiler.provider('directory',{
    sample(p){
      let entities=0,leases=0,cpu=0,gpu=0;
      for(const world of directory.worlds.values())entities+=world.entities.size;
      for(const record of directory.resources.values()){
        leases+=record.owners;cpu+=record.value.cpuBytes??0;gpu+=record.value.gpuBufferBytes??0;
      }
      p.set(ids.worlds,directory.worlds.size);p.set(ids.entities,entities);p.set(ids.resources,directory.resources.size);
      p.set(ids.leases,leases);p.set(ids.ownedCpuBuffers,cpu);p.set(ids.ownedGpuBuffers,gpu);
      p.set(ids.savedState,directory.residency.stats.snapshotBytes);p.set(ids.resident,directory.residency.records.size);
    },
    details(){
      const worlds=[],resources=[],residency=[];
      for(const world of directory.worlds.values()){
        if(worlds.length===64)break;worlds.push({id:world.id,entities:world.entities.size});
      }
      for(const[key,record]of directory.resources){
        if(resources.length===64)break;
        const owners=[];for(const[owner,count]of record.ownerNames){if(owners.length===64)break;owners.push({owner,count});}
        resources.push({key,leases:record.owners,owners,
          kind:record.value.kind??'unclassified',cpuBufferBytes:record.value.cpuBytes??0,gpuBufferBytes:record.value.gpuBufferBytes??0});
      }
      for(const record of directory.residency.records.values()){
        if(residency.length===64)break;residency.push({key:record.key,worldId:record.value?.world.id??null,status:record.status,owners:record.owners.size});
      }
      return{worlds,resources,residency,limits:{rows:64,worldCapacity:directory.residency.capacity,snapshotBytes:directory.residency.maxStateBytes},
        snapshotBytes:directory.residency.stats.snapshotBytes,note:'Owned buffer accounting overlaps renderer totals; do not add them twice. Driver/JS heap excluded.'};
    },
  });
}
