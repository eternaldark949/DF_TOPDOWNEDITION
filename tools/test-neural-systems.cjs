#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');const {join}=require('node:path');const {runtime}=require('./test-game-runtime.cjs');const tests=[];
function test(name,source,check){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});const r=structuredClone(e.run(`(()=>{${source}})()`));check(r);assert.deepEqual(e.errors,[]);tests.push(name);}
test('Entry, front counter, display bays, private suite and archive remain connected around fixtures',`
 game._doLoadMap('neural_sys_interior');const nav=NavGrid.for(game.activeMap),points=[[500,285],[215,180],[785,180],[230,400],[770,400],[330,650],[625,650],[500,710]];
 return {points:points.map(p=>({p,clear:nav.walkable(...p),route:!!nav.findPath(500,700,...p)})),prisma:game.npcs.some(n=>n.name==='Prisma'),exit:game.activeMap.transitions[0].target};`,r=>{
 assert.ok(r.points.every(p=>p.clear&&p.route),JSON.stringify(r.points));assert.equal(r.prisma,true);assert.equal(r.exit,'sdc');});
test('Still furniture paints through the existing sprite system and remains stationary',`
 game._doLoadMap('neural_sys_interior');const props=game.props.filter(p=>p.decorType?.startsWith('ns_'));
 const before=props.map(p=>[p.x,p.y,p.angle]);for(const p of props)p.draw(game.ctx);
 return {count:props.length,cacheable:props.every(p=>PropSprites.kindOf(p)==='still'),fixed:props.every(p=>p.fixedRotation),before,after:props.map(p=>[p.x,p.y,p.angle])};`,r=>{
 assert.equal(r.count,22);assert.equal(r.cacheable,true);assert.equal(r.fixed,true);assert.deepEqual(r.after,r.before);});
test('Interior floor is retained while visiting and released on exit',`
 game._doLoadMap('neural_sys_interior');game.drawNeuralInterior(game.ctx);const first=game._neuralFloor;game.drawNeuralInterior(game.ctx);const retained=game._neuralFloor===first;
 game._doLoadMap('apt_949');const released=!game._neuralFloor;game._doLoadMap('neural_sys_interior');game.drawNeuralInterior(game.ctx);
 return {retained,released,replaced:first!==game._neuralFloor,size:[game._neuralFloor.width,game._neuralFloor.height]};`,r=>assert.deepEqual(r,{retained:true,released:true,replaced:true,size:[1000,800]}));
test('Neural exterior preserves its sections and door and retains painted planes at day and night',`
 game._doLoadMap('sdc');const b=game.activeMap.buildings.find(b=>b.attachedTransition?.target==='neural_sys_interior');
 game.camera.x=b.x+200;game.camera.y=b.y+380;b.drawBase(game.ctx);b.drawTop(game.ctx);b.drawEmissive(game.ctx,.6);const roof=b._lkSprites.neural_roof;
 b.drawTop(game.ctx);const same=b._lkSprites.neural_roof===roof;
 return {type:b.constructor.name,sections:b.sections.map(s=>[s.w,s.h]),door:b.attachedTransition.target,same};`,r=>{
 assert.equal(r.type,'NeuralSystemsBuilding');assert.deepEqual(r.sections,[[400,200],[250,200]]);assert.equal(r.door,'neural_sys_interior');assert.equal(r.same,true);});
test('The front of the counter can reach Prisma through the normal dialogue action',`
 game._doLoadMap('neural_sys_interior');let target=null;game.startDialogue=n=>target=n.name;game.activeInteraction=game.props.find(p=>p.interactionType==='neural_counter');game.interact();
 return {target,action:PROP_ACTIONS.neural_counter};`,r=>assert.deepEqual(r,{target:'Prisma',action:['Consult','Prisma']}));
console.log(JSON.stringify({passed:tests.length,tests},null,2));
