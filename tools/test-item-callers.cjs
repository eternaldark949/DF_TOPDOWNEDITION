'use strict';
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const env=runtime(resolve(__dirname,'../DFAB V8.html'),{affine:true});
const run=source=>structuredClone(env.run(`(()=>{${source}})()`));let passed=0;
const check=(name,source,verify)=>{verify(run(source));passed++;console.log('Passed: '+name);};
env.run("game.story.update=()=>{};game._doLoadMap('ollo_test');game.running=true;game.paused=false;game.items.clear();");
check('production equipment is derived from the shared model with no mutable inventory ledger',`
 const a=game.items.grantItem('pistol_fpx'),b=game.items.grantItem('pistol_fpx');game.items.setItemState(a.instance_id,{ammo:2});game.items.setItemState(b.instance_id,{ammo:7});game.inventory.equipItem(b.instance_id);
 return {a:a.instance_id,b:b.instance_id,active:game.currentWeapon.instance_id,ammo:game.currentWeapon.state.ammo,shared:game.items instanceof DFNative.itemSystem,
 retired:['items','equippedWeaponId','equippedAttachments','capacity'].filter(key=>Object.hasOwn(game.inventory,key)),entryIds:game.inventory.getEntries().filter(e=>e.source==='carried').map(e=>e.id)};`,r=>{assert.notEqual(r.a,r.b);assert.equal(r.active,r.b);assert.equal(r.ammo,7);assert.equal(r.shared,true);assert.deepEqual(r.retired,[]);assert.deepEqual(r.entryIds,[r.a,r.b]);});
check('drop and pickup transfer the exact weapon and mounted attachments once',`
 const gun=game.currentWeapon,laser=game.items.grantItem('laser_sight');game.items.attachToWeapon(gun.instance_id,laser.instance_id);game.inventory._dropCarriedItem(game.items.getItem(gun.instance_id));
 const loot=game.loot.at(-1),removed=!game.items.hasInstance(gun.instance_id)&&!game.items.hasInstance(laser.instance_id),picked=game.inventory.receiveItem(loot.item);game.items.equipItem(gun.instance_id);
 return {removed,picked,identity:game.currentWeapon.instance_id===gun.instance_id,ammo:game.currentWeapon.state.ammo,mounted:game.items.getEquippedAttachments().map(i=>i.instance_id),laser:laser.instance_id};`,r=>{assert.equal(r.removed,true);assert.equal(r.picked,true);assert.equal(r.identity,true);assert.equal(r.ammo,7);assert.deepEqual(r.mounted,[r.laser]);});
check('typed saves retain independent instances, equipment, mounts and per-instance state',`
 const expected=game.items.snapshot(),save=game.getSaveSchema();localStorage.setItem('item-roundtrip',JSON.stringify(save));game.items.clear();const loaded=game.loadGame('item-roundtrip');
 return {loaded,expected,actual:game.items.snapshot(),mirrors:['currentWeapon','weaponMode'].filter(key=>Object.hasOwn(game,key))};`,r=>{assert.equal(r.loaded,true);assert.deepEqual(r.actual,r.expected);assert.deepEqual(r.mirrors,[]);});
check('old catalog-only saves migrate duplicate copies and equipment to instance references',`
 const save=game.getSaveSchema();save.inventory={items:['pistol_fpx','pistol_fpx','laser_sight'],equippedWeaponId:'pistol_fpx',equippedAttachments:['laser_sight']};localStorage.setItem('legacy-items',JSON.stringify(save));const loaded=game.loadGame('legacy-items');
 return {loaded,copies:game.items.listItems().filter(i=>i.definition_id==='pistol_fpx').map(i=>i.instance_id),mode:game.weaponMode,laser:game.items.hasAttachment('laser_sight')};`,r=>{assert.equal(r.loaded,true);assert.equal(r.copies.length,2);assert.notEqual(...r.copies);assert.equal(r.mode,'normal');assert.equal(r.laser,true);});
check('an explicitly empty typed inventory stays empty on reload',`
 game.items.clear();localStorage.setItem('empty-items',JSON.stringify(game.getSaveSchema()));game.items.grantItem('pistol_fpx');const loaded=game.loadGame('empty-items');return {loaded,count:game.items.listItems().length};`,r=>assert.deepEqual(r,{loaded:true,count:0}));
check('owned consumables apply once, consume the shared stack and do not charge a vending price',`
 game.player.buffSystem.active={};game.currency=1000;const item=game.items.grantItem('consumable:bubbleTea',{quantity:2}),before=game.currency;
 const used=game.inventory.useItem(item.instance_id);return {used,before,after:game.currency,quantity:game.items.getItem(item.instance_id).quantity,active:game.player.buffSystem.active.bubbleTea.active};`,r=>{assert.equal(r.used,true);assert.equal(r.after,r.before);assert.equal(r.quantity,1);assert.equal(r.active,true);});
const errorsBefore=env.errors.length;
check('invalid instance references reject before altering live items, currency or level',`
 const before={items:game.items.snapshot(),currency:game.currency,map:game.activeMap.id},save=game.getSaveSchema();save.inventory.model.equipment.weapon='missing:item:1';save.player.currency=999999;localStorage.setItem('invalid-items',JSON.stringify(save));
 const loaded=game.loadGame('invalid-items');return {loaded,before,after:{items:game.items.snapshot(),currency:game.currency,map:game.activeMap.id}};`,r=>{assert.equal(r.loaded,false);assert.deepEqual(r.after,r.before);});
assert.equal(env.errors.splice(errorsBefore).length,1);assert.deepEqual(env.errors,[]);console.log(JSON.stringify({passed}));
