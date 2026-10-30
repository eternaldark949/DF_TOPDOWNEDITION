#!/usr/bin/env node
'use strict';
// The Clothing Dyer (engine/dyer.js): crafted for 1,000 scrap it stands in the bedroom; it recolours an owned
// outfit piece by piece for 20 scrap each (free back to the original), saved per outfit and worn in the world.
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const tests=[];
const value=(e,s)=>structuredClone(e.run(`(()=>{${s}})()`));
function test(name,fn){const e=runtime(join(__dirname,'..','DFAB V8.html'),{affine:true});fn(e);assert.deepEqual(e.errors,[]);tests.push(name);}

test('The dyer is the dearest schematic, and once crafted it stands in the apartment',e=>{
 const r=value(e,`const s=SCHEMATICS.find(s=>s.id==='clothing_dyer');const dearest=Math.max(...SCHEMATICS.map(s=>s.scrapCost));
  game._doLoadMap('apt_949');const before=game.props.some(p=>p.interactionType==='clothing_dyer');
  game.scrap=999;const poor=game.craftSchematic('clothing_dyer');game.scrap=1200;const ok=game.craftSchematic('clothing_dyer');
  const now=game.props.filter(p=>p.interactionType==='clothing_dyer').length;const again=game.craftSchematic('clothing_dyer');
  game._doLoadMap('ollo_test');game._doLoadMap('apt_949');
  return {cost:s.scrapCost,dearest,before,poor,ok,scrap:game.scrap,now,again,after:game.props.filter(p=>p.interactionType==='clothing_dyer').length,
   label:PROP_ACTIONS.clothing_dyer[0],last:game.props[game.props.length-1].interactionType};`);
 assert.equal(r.cost,1000);assert.equal(r.dearest,1000);
 assert.equal(r.before,false);assert.equal(r.poor,false);assert.equal(r.ok,true);assert.equal(r.scrap,200);
 assert.equal(r.now,1);assert.equal(r.again,false);assert.equal(r.after,1);assert.equal(r.label,'Dye');
 assert.equal(r.last,'clothing_dyer',"added after the saved layout's pieces");
});

test('Dyeing charges 20 scrap a changed piece, shows in the world, and saves; the original colours are free',e=>{
 const r=value(e,`const C=game.cosmetics;C.owned.push('outfit_noir');C.equippedOutfit='outfit_noir';game.scrap=100;
  const slots=dyeSlots(COSMETICS_REGISTRY.outfit_noir.data);
  const same=game.applyDyes('outfit_noir',{'top.color':COSMETICS_REGISTRY.outfit_noir.data.top.color});
  const ok=game.applyDyes('outfit_noir',{'top.color':'#DC143C','shoes.color':'#e8c27a','bottom.color':COSMETICS_REGISTRY.outfit_noir.data.bottom.color});
  const scrap=game.scrap;const cfg=C.getRenderConfig().outfit;
  const saved=new CosmeticsSystem();saved.deserialize(JSON.parse(JSON.stringify(C.serialize())));
  const reg=COSMETICS_REGISTRY.outfit_noir.data.top.color;
  game.scrap=10;const poor=game.applyDyes('outfit_noir',{'top.color':'#00b39b'});
  game.scrap=40;game.applyDyes('outfit_noir',{'top.color':reg});const back=C.dyes.outfit_noir;
  game.resetDyes('outfit_noir');
  return {slots,same,ok,scrap,top:cfg.top.color,shoes:cfg.shoes.color,savedTop:saved.getRenderConfig().outfit.top.color,reg,poor,back,after:C.dyes.outfit_noir||null,scrapAfter:game.scrap,
   label:game.dyeSlotLabel('top.inner')};`);
 assert.deepEqual(r.slots,['top.color','top.inner','bottom.color','shoes.color']);
 assert.equal(r.same,false,'nothing changed, nothing to dye');
 assert.equal(r.ok,true);assert.equal(r.scrap,60);
 assert.equal(r.top,'#dc143c');assert.equal(r.shoes,'#e8c27a');assert.equal(r.savedTop,'#dc143c');
 assert.equal(r.reg,'#2a1a3a','the registry itself is untouched');
 assert.equal(r.poor,false);
 assert.deepEqual(r.back,{'shoes.color':'#e8c27a'},'dyed back to its own colour drops the dye');
 assert.equal(r.after,null);assert.equal(r.scrapAfter,20);
 assert.equal(r.label,'Top lining');
});

test('The dye window lists her outfits, the pieces and the palette, and previews without dyeing',e=>{
 const r=value(e,`game.cosmetics.owned.push('outfit_gold');game.cosmetics.equippedOutfit='outfit_gold';game.scrap=50;game.openDyer();
  const html=document.getElementById('dye-shop-grid').innerHTML;game._dye.pending['top.color']='#17dcff';game.renderDyer();
  const html2=document.getElementById('dye-shop-grid').innerHTML;const worn=game.cosmetics.getRenderConfig().outfit.top.color;
  document.getElementById('dye-shop-close').onclick();
  return {gold:html.includes('Gold Standard'),trim:html.includes('Top trim'),swatches:(html.match(/data-hex=/g)||[]).length,cost:html2.includes('20 Scrap'),worn,closed:game._dye};`);
 assert.ok(r.gold&&r.trim);assert.equal(r.swatches,24);assert.ok(r.cost);
 assert.equal(r.worn,'#daa520',"a preview isn't a dye");
 assert.equal(r.closed,null);
});

test('The custom colour picker: hex and hsv round-trip, typed hexes parse, a hue on white is kept, recents cap at 8',e=>{
 const r=value(e,`const P=ColorPicker;const trip=['#dc143c','#00b39b','#7b2cbf','#ffffff','#000000','#e8c27a'].map(h=>P.toHex(P.toHsv(h))===h);
  const parsed=['abc','#AABBCC',' 12ab9f ','#12','zzzzzz'].map(t=>P.parse(t));
  P._last={hex:'#ffffff',hsv:{h:280,s:0,v:1}};const kept=P.hsvOf('#ffffff').h,other=P.hsvOf('#ff0000').h;
  for(let i=0;i<12;i++)P.remember('#0000'+(10+i));P.remember('#000011');const rec=P.recent();
  const html=P.html('#7b2cbf');
  return {trip,parsed,kept,other,n:rec.length,front:rec[0],dupes:new Set(rec).size===rec.length,html:/cp-sv/.test(html)&&/cp-hue/.test(html)&&/value="#7b2cbf"/.test(html)};`);
 assert.ok(r.trip.every(Boolean),String(r.trip));
 assert.deepEqual(r.parsed,['#aabbcc','#aabbcc','#12ab9f',null,null]);
 assert.equal(r.kept,280);assert.equal(r.other,0);
 assert.equal(r.n,8);assert.equal(r.front,'#000011');assert.ok(r.dupes);assert.ok(r.html);
});

test('The dyer and the car Customize tab open the picker in place of the browser colour dialog',e=>{
 const r=value(e,`game.scrap=50;game.openDyer();game._dye.custom=true;game.renderDyer();
  const dye=document.getElementById('dye-shop-grid').innerHTML;document.getElementById('dye-shop-close').onclick();
  const box=document.getElementById('auto-shop-content');let car=null;
  if(box&&game.garage&&game.garage.getActive()){game._autoShopTab='customize';game._customizePicker='paintColor';game._renderCustomizeTab(box);car=box.innerHTML;}
  return {dye:dye.includes('class="cp"')&&!dye.includes('type="color"'),car:car===null?'no car':car.includes('class="cp"')&&car.includes('data-picker="headlightColor"')};`);
 assert.equal(r.dye,true);
 assert.equal(r.car,true);
});

console.log(`test-clothing-dyer: ${tests.length} passed`);
