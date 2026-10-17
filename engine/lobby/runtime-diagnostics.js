/**
 * Lobby / runtime diagnostics: measurement handles and counters, not scheduling logic.
 * Providers are removed with their runtime. Disabled profiling performs no timer reads.
 */
export function runtimeDiagnostics(runtime,profiler){
  if(!profiler)return null;
  const scopes={};for(const name of ['preparation','input','boundary','update','animate','render'])scopes[name]=profiler.scope(`lobby.${name}`);
  const counters={steps:profiler.counter('runtime.steps'),dropped:profiler.counter('runtime.dropped','ms'),
    paused:profiler.counter('runtime.paused','flag'),chunks:profiler.counter('preparation.chunks'),pending:profiler.counter('preparation.pending')};
  let steps=0,dropped=0,chunks=0;
  const remove=profiler.provider('runtime',{
    begin(){steps=runtime.stats.steps;dropped=runtime.stats.droppedSeconds;chunks=runtime.preparation.stats.steps;},
    sample(p){p.set(counters.steps,runtime.stats.steps-steps);p.set(counters.dropped,(runtime.stats.droppedSeconds-dropped)*1000);
      p.set(counters.paused,Number(runtime.reasons.size>0));p.set(counters.chunks,runtime.preparation.stats.steps-chunks);p.set(counters.pending,runtime.preparation.jobs.size);},
    details:()=>({stepSeconds:runtime.step,maxSteps:runtime.maxSteps,simulationTime:runtime.time,
      pausedReasons:[...runtime.reasons].slice(0,64),preparation:{pending:runtime.preparation.jobs.size,
        budgetMs:runtime.preparation.budgetMs,maxSteps:runtime.preparation.maxSteps,...runtime.preparation.stats}}),
  });
  return{scopes,remove};
}
