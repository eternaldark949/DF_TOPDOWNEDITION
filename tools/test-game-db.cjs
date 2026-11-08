#!/usr/bin/env node
'use strict';
// The game database (src/directory/game-db/): each chapter is plain JSON that tools/build.mjs inlines as
// GAME_DB.<chapter>. Checks every chapter is valid, in the build, documented in its _about, that its ids
// point at things that exist, and that the running game reads the same data under the old names.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const ROOT=join(__dirname,'..'), DIR=join(ROOT,'src','directory','game-db');
const tests=[];
function test(name,fn){fn();tests.push(name);}
const chapters=fs.readdirSync(DIR).filter(f=>f.endsWith('.json')).sort();
const load=f=>JSON.parse(fs.readFileSync(join(DIR,f),'utf8'));
const unique=(list,what)=>{const ids=list.map(e=>e.id);assert.equal(new Set(ids).size,ids.length,`${what}: an id is used twice`);return new Set(ids);};

test('Every chapter is valid JSON, listed in the build, and says what each of its tables holds',()=>{
 const build=fs.readFileSync(join(ROOT,'tools','build.mjs'),'utf8');
 assert.ok(chapters.length>0);
 for(const f of chapters){
  const db=load(f);
  assert.ok(build.includes(`'directory/game-db/${f}'`),`${f} is not in tools/build.mjs SCRIPTS`);
  assert.ok(/^[a-z][a-z0-9_]*\.json$/.test(f),`${f}: chapter files are snake_case`);
  assert.ok(db._about&&db._about.tables,`${f} has no _about.tables`);
  const tables=Object.keys(db).filter(k=>k!=='_about');
  assert.deepEqual(Object.keys(db._about.tables).sort(),tables.sort(),`${f}: _about.tables and the tables differ`);
 }
});

test('Items: the loadout, schematics and consumable hooks point at things that exist',()=>{
 const it=load('items.json');
 const registries=fs.readFileSync(join(ROOT,'src','core','registries.js'),'utf8');
 const cosmetic=id=>registries.includes(`'${id}':`);
 for(const id of it.default_loadout) assert.ok(it.gear[id],`default_loadout: no gear '${id}'`);
 unique(it.augments,'augments');unique(it.furniture,'furniture');unique(it.schematics,'schematics');
 for(const s of it.schematics){
  if(s.cosmetic) assert.ok(cosmetic(s.id),`schematic ${s.id}: no such cosmetic`);
  else if(!s.furniture) assert.ok(it.gear[s.id],`schematic ${s.id}: no such gear`);
  if(s.requires) assert.ok(cosmetic(s.requires),`schematic ${s.id} requires '${s.requires}', which is no cosmetic`);
  assert.ok(Number.isFinite(s.scrapCost)&&s.scrapCost>0,`schematic ${s.id}: scrapCost`);
 }
 for(const [id,n] of Object.entries(it.notes)) assert.equal(n.id,id,`note ${id}: its id field differs from its key`);
 const hooks=registries.slice(registries.indexOf('const CONSUMABLE_HOOKS'),registries.indexOf('const CONSUMABLES ='));
 for(const [id,c] of Object.entries(it.consumables)) if(c.hooks) assert.ok(hooks.includes(`${c.hooks}:`),`consumable ${id}: no hooks '${c.hooks}'`);
});

test('The running game reads the JSON under the old names, hooks attached',()=>{
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const it=load('items.json');
 const got=JSON.parse(e.run(`JSON.stringify((()=>({gear:ITEM_REGISTRY,default_loadout:DEFAULT_LOADOUT,augments:AUGMENT_CATALOG,
  furniture:APARTMENT_FURNITURE_REGISTRY,consumables:CONSUMABLES,drinks:GLASS_DRINKS,notes:NOTE_REGISTRY,schematics:SCHEMATICS,
  same:ITEM_REGISTRY===GAME_DB.items.gear&&CONSUMABLES===GAME_DB.items.consumables,
  hooks:['unlockCheck','onActivate','onExpire'].map(k=>typeof CONSUMABLES.stellarLemonade[k]),
  frozen:Object.isFrozen(APARTMENT_FURNITURE_REGISTRY)&&APARTMENT_FURNITURE_REGISTRY.every(Object.isFrozen),
  pistol:createItemFromRegistry('pistol_fpx',null).stats.damage}))())`));
 assert.equal(got.same,true);
 assert.deepEqual(got.hooks,['function','function','function']);
 assert.equal(got.frozen,true);
 assert.equal(got.pistol,it.gear.pistol_fpx.stats.damage);
 for(const k of Object.keys(it).filter(k=>k!=='_about')) assert.deepEqual(got[k],it[k],`${k} differs in the game`);
 assert.deepEqual(e.errors,[]);
});

console.log(`test-game-db: ${tests.length} passed`);
