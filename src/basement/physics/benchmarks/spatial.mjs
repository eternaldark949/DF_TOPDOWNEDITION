import { performance } from 'node:perf_hooks';
import { physicsSystem, spatialGrid } from '../index.mjs';
const difference=(a,b,key,steps=1)=>a[key]===undefined?null:(a[key]-b[key])/steps;
function measure(world,steps=10,warm=1){
    for(let i=0;i<warm;i++)world.updateState();
    const before=world.getStatistics(),start=performance.now();
    for(let i=0;i<steps;i++)world.updateState();
    const elapsed=performance.now()-start,after=world.getStatistics();
    return {mean_ms:elapsed/steps,candidate_pairs_per_step:difference(after,before,'candidate_pairs',steps),
        candidate_visits_per_step:difference(after.spatial,before.spatial,'candidate_visits',steps),
        body_bounds_per_step:difference(after,before,'bounds_calculations',steps),
        swept_bounds_per_step:difference(after,before,'swept_bounds_calculations',steps),
        grid_updates_per_step:difference(after.spatial,before.spatial,'updates',steps),
        cell_additions_per_step:difference(after.spatial,before.spatial,'cell_additions',steps),
        cell_removals_per_step:difference(after.spatial,before.spatial,'cell_removals',steps),
        broadphase_builds_per_step:difference(after,before,'broadphase_builds',steps)};
}
const rows=[];
for(const count of [100,1000,5000]){
    const p=new physicsSystem({cell_size:32});
    for(let i=0;i<count;i++)p.createBody({position:[i*100,0],continuous_collision:false});
    rows.push({bodies:count,...measure(p),hypothetical_all_pairs:count*(count-1)/2});
}
const scenarios=[];
for(const mode of ['awake_idle','sleeping_idle','moving_sparse']){
    const p=new physicsSystem({cell_size:32});
    for(let i=0;i<1000;i++){
        const body=p.createBody({position:[i*100+8,8],sleep_enabled:false,continuous_collision:false,linear_velocity:mode==='moving_sparse'?[30,0]:[0,0]});
        if(mode==='sleeping_idle')body.sleepBody();
    }
    scenarios.push({scenario:mode,bodies:1000,...measure(p,30,30)});
}
{
    const p=new physicsSystem({cell_size:32});
    for(let i=0;i<5000;i++)p.createBody({physics_type:'static',position:[i*100,1000]});
    p.createBody({position:[8,8],linear_velocity:[30,0],sleep_enabled:false,continuous_collision:false});
    scenarios.push({scenario:'static_scenery_one_mover',bodies:5001,...measure(p,30,30)});
}
{
    const p=new physicsSystem(),parent=p.createBody({physics_type:'static',collision_group:0});
    for(let i=0;i<300;i++){const child=p.createBody({collision_group:0});p.attachBody(child,{parent_body:parent,local_position:[i*3,0]});}
    const before=p.getStatistics();scenarios.push({scenario:'stationary_mounts',bodies:301,...measure(p,30,30),
        attachment_placements:p.getStatistics().attachment_placements===undefined?null:p.getStatistics().attachment_placements-before.attachment_placements});
}
const grid=new spatialGrid({cell_size:32});grid.registerInstance(1,{left:1,top:1,right:3199,bottom:3199},{body_id:1});
const before=grid.getStatistics(),start=performance.now(),updates=50;
for(let i=0;i<updates;i++){const dx=i%2===0?32:0;grid.updateInstance(1,{left:1+dx,top:1,right:3199+dx,bottom:3199});}
const after=grid.getStatistics(),large_entry={occupied_cells:after.cells,mean_ms_per_update:(performance.now()-start)/updates,
    cell_additions_per_update:difference(after,before,'cell_additions',updates),cell_removals_per_update:difference(after,before,'cell_removals',updates)};
console.log(JSON.stringify({note:'Standalone deterministic workloads. Timings depend on the machine/JIT/GC; compare the same script on the same machine. Null means an older engine lacks that diagnostic. These are not full-game FPS measurements.',rows,scenarios,large_entry},null,2));
