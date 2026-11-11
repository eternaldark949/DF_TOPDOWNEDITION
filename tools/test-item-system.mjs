import test from 'node:test';
import assert from 'node:assert/strict';
import { itemSystem } from '../src/gameplay/items/item-system.mjs';
import { createItemCatalog } from '../src/directory/game-items.mjs';
import { gameSession } from '../src/gameplay/game-session.mjs';
const catalog=createItemCatalog();
const make=options=>new itemSystem({catalog,...options});

test('two copies of a definition have stable independent instance identity and state',()=>{
 const s=make(),a=s.grantItem('pistol_fpx'),b=s.grantItem('pistol_fpx');assert.notEqual(a.instance_id,b.instance_id);assert.equal(a.definition_id,b.definition_id);
 s.setItemState(a.instance_id,{ammo:3});s.setItemState(b.instance_id,{ammo:9});s.equipItem(b.instance_id);assert.equal(s.getEquippedWeapon().state.ammo,9);assert.equal(s.getItem(a.instance_id).state.ammo,3);
 assert.throws(()=>{a.stats.damage=999;},TypeError);assert.throws(()=>{s.getItem(a.instance_id).state.ammo=99;},TypeError);assert.equal(s.getItem(a.instance_id),s.getItem(a.instance_id));
});
test('equipment points to owned instances and duplicate definitions do not confuse removal',()=>{
 const s=make(),a=s.grantItem('pistol_fpx'),b=s.grantItem('pistol_fpx');s.equipItem(b.instance_id);s.removeItem(a.instance_id);assert.equal(s.getEquippedWeapon().instance_id,b.instance_id);
 s.removeItem(b.instance_id);assert.equal(s.getEquippedWeapon(),null);assert.equal(s.getWeaponMode(),'none');assert.throws(()=>s.equipItem('pistol_fpx'),/Unknown owned/);
});
test('capacity counts carried stacks and weapons; attachment storage is separate from worn slot limits',()=>{
 const s=make({rules:{capacity:1,max_attachments:2,owner_id:'player'}}),gun=s.grantItem('pistol_fpx'),before=s.snapshot();assert.equal(s.grantItem('sniper_sara'),null);assert.deepEqual(s.snapshot(),before);
 const a=s.grantItem('laser_sight'),b=s.grantItem('blood_muzzle'),c=s.grantItem('mirror_blade');s.equipItem(gun.instance_id);assert.ok(s.equipItem(a.instance_id));assert.ok(s.equipItem(b.instance_id));assert.equal(s.equipItem(c.instance_id),false);assert.equal(s.getEquippedAttachments().length,2);assert.ok(s.hasAttachment('laser_sight'));
});
test('mounted attachments have one owner and travel with their weapon without changing identity',()=>{
 const a=make(),gun=a.grantItem('pistol_fpx'),laser=a.grantItem('laser_sight');assert.ok(a.attachToWeapon(gun.instance_id,laser.instance_id));a.equipItem(gun.instance_id);assert.ok(a.hasAttachment('laser_sight'));assert.throws(()=>a.removeItem(laser.instance_id),/Detach/);
 a.setItemState(gun.instance_id,{ammo:7});const bundle=a.extractItem(gun.instance_id);assert.equal(a.listItems().length,0);assert.equal(a.getEquippedWeapon(),null);
 const b=make({rules:{capacity:10,max_attachments:2,owner_id:'npc:42'}});const restored=b.receiveBundle(bundle);assert.equal(restored.instance_id,gun.instance_id);assert.equal(restored.state.ammo,7);b.equipItem(restored.instance_id);assert.equal(b.getEquippedAttachments()[0].instance_id,laser.instance_id);
 assert.throws(()=>b.receiveBundle(bundle),/already owned/);
});
test('mounted and worn attachments share the active slot limit',()=>{
 const s=make(),gun=s.grantItem('pistol_fpx'),a=s.grantItem('laser_sight'),b=s.grantItem('blood_muzzle'),c=s.grantItem('mirror_blade');s.attachToWeapon(gun.instance_id,a.instance_id);s.equipItem(gun.instance_id);s.equipItem(b.instance_id);
 assert.equal(s.equipItem(c.instance_id),false);assert.equal(s.attachToWeapon(gun.instance_id,c.instance_id),false);s.unequipItem(b.instance_id);assert.ok(s.attachToWeapon(gun.instance_id,c.instance_id));
});
test('consumable stacks retain quantity and emit declarative effects once per consumption',()=>{
 const s=make(),a=s.grantItem('consumable:bubbleTea',{quantity:2}),b=s.grantItem('consumable:bubbleTea',{quantity:3});assert.equal(a.instance_id,b.instance_id);assert.equal(b.quantity,5);const events=[];s.on('items:consumed',event=>events.push(event));
 assert.equal(s.consumeItem(a.instance_id,2),true);assert.equal(s.getItem(a.instance_id).quantity,3);assert.equal(events[0].effect.buff_id,'bubbleTea');assert.equal(s.consumeItem(a.instance_id,4),false);s.consumeItem(a.instance_id,3);assert.equal(s.hasInstance(a.instance_id),false);
});
test('per-instance catalog upgrades round trip independently of their definition and other copies',()=>{
 const defs=structuredClone(catalog);defs.pistol_fpx.upgrades={power:{max_rank:3,modifiers:{damage:{add:5}}}};const s=new itemSystem({catalog:defs}),a=s.grantItem('pistol_fpx'),b=s.grantItem('pistol_fpx');s.setUpgrade(a.instance_id,'power',2);assert.equal(s.getItem(a.instance_id).stats.damage,45);assert.equal(s.getItem(b.instance_id).stats.damage,35);assert.equal(defs.pistol_fpx.stats.damage,35);
 const copy=new itemSystem({catalog:defs});copy.load(JSON.parse(JSON.stringify(s.snapshot())));assert.equal(copy.getItem(a.instance_id).stats.damage,45);assert.throws(()=>copy.setUpgrade(a.instance_id,'power',4));
});
test('snapshots are detached and invalid references/counters reject before replacing live inventory',()=>{
 const s=make(),a=s.grantItem('pistol_fpx');s.equipItem(a.instance_id);const before=s.snapshot(),bad=structuredClone(before);bad.equipment.weapon='missing';assert.throws(()=>s.load(bad));assert.deepEqual(s.snapshot(),before);
 const invalid=structuredClone(before);invalid.next_instance_id=1;assert.throws(()=>s.load(invalid));assert.deepEqual(s.snapshot(),before);const copy=s.snapshot();copy.records[a.instance_id].state.ammo=99;assert.equal(s.getItem(a.instance_id).state.ammo,undefined);
 assert.throws(()=>s.receiveItem({...s.createItem('pistol_fpx'),stats:{damage:999}}),/record fields/);
});
test('dropped instances preserve identity and the allocation counter never reuses a reserved ID',()=>{
 const s=make(),a=s.grantItem('pistol_fpx'),packet=s.removeItem(a.instance_id),b=s.grantItem('pistol_fpx');assert.notEqual(a.instance_id,b.instance_id);s.receiveItem(packet);assert.equal(s.getItem(a.instance_id).definition_id,'pistol_fpx');
 const copy=make();copy.load(s.snapshot());const c=copy.grantItem('pistol_fpx');assert.ok(![a.instance_id,b.instance_id].includes(c.instance_id));
});
test('legacy catalog-only saves migrate duplicates and equipment to instance references',()=>{
 const s=make();s.importLegacy({items:['pistol_fpx','pistol_fpx','laser_sight'],equippedWeaponId:'pistol_fpx',equippedAttachmentId:'laser_sight'});assert.equal(s.listItems().length,3);assert.equal(new Set(s.listItems().map(item=>item.instance_id)).size,3);assert.equal(s.getEquippedWeapon().instance_id,s.listItems()[0].instance_id);assert.equal(s.getEquippedAttachments()[0].definition_id,'laser_sight');
 s.clear();assert.equal(s.listItems().length,0);const saved=s.snapshot();const copy=make();copy.load(saved);assert.equal(copy.listItems().length,0);
});
test('the session serializes the same canonical item model and upgrades known version-one records',()=>{
 const session=new gameSession(),item=session.items.grantItem('pistol_fpx');session.items.equipItem(item.instance_id);session.items.setItemState(item.instance_id,{ammo:4});const save=session.snapshot();assert.equal(save.format_version,2);assert.equal(save.inventory.records[item.instance_id].state.ammo,4);assert.ok(!('equipment' in save));
 const copy=new gameSession({state:save});assert.equal(copy.items.getEquippedWeapon().instance_id,item.instance_id);assert.equal(copy.items.getEquippedWeapon().state.ammo,4);
 const old=new gameSession({state:{format_version:1,player_entity_id:null,currency:10,inventory:{pistol_fpx:2},equipment:{weapon:'pistol_fpx'},quests:{},roster:{},progression:{}}});assert.equal(old.items.listItems().length,2);assert.equal(old.items.getEquippedWeapon().definition_id,'pistol_fpx');
});

test('attachment parent lookup and slot unequip stay consistent through mounts, transfers and reloads',()=>{
 const s=make(),gun=s.grantItem('pistol_fpx'),a=s.grantItem('laser_sight'),b=s.grantItem('blood_muzzle');s.attachToWeapon(gun.instance_id,a.instance_id);s.equipItem(gun.instance_id);s.equipItem(b.instance_id);
 assert.equal(s.getParentWeapon(a.instance_id).instance_id,gun.instance_id);s.unequipSlot('attachment');assert.equal(s.getEquippedAttachments().length,0);assert.equal(s.getParentWeapon(a.instance_id),null);
 s.attachToWeapon(gun.instance_id,a.instance_id);const snapshot=s.snapshot();s.clear();s.load(snapshot);assert.equal(s.getParentWeapon(a.instance_id).instance_id,gun.instance_id);s.extractItem(gun.instance_id);assert.equal(s.getParentWeapon(a.instance_id),null);
});
test('invalid effective upgrade stats reject before mutating live records or allocating an item',()=>{
 const defs=structuredClone(catalog);defs.pistol_fpx.upgrades={broken:{max_rank:2,modifiers:{damage:{multiply:Number.MAX_VALUE}}}};const s=new itemSystem({catalog:defs}),gun=s.grantItem('pistol_fpx'),before=s.snapshot();
 assert.throws(()=>s.setUpgrade(gun.instance_id,'broken',2),/finite/);assert.deepEqual(s.snapshot(),before);assert.throws(()=>s.createItem('pistol_fpx',{upgrades:{broken:2}}),/finite/);assert.deepEqual(s.snapshot(),before);
});
