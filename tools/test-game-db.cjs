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

test('Shops: car prices name real cars, colours are hex, and the game reads them',()=>{
 const sh=load('shops.json'), A=sh.auto_shop, hex=c=>/^#[0-9a-f]{6}$/i.test(c);
 assert.ok(A.sell_rate>0&&A.sell_rate<1,'auto_shop.sell_rate is a share of the price');
 for(const k of ['paint','underglow','headlights']) assert.ok(A.custom_prices[k]>0,`custom_prices.${k}`);
 for(const c of [...A.paint_colors,...A.headlight_colors,...A.glow_colors.filter(c=>c!==null)]) assert.ok(hex(c),`auto_shop colour ${c}`);
 assert.ok(sh.dyer.fee>0);
 for(const p of sh.dyer.palette) assert.ok(Array.isArray(p)&&p.length===2&&hex(p[0])&&typeof p[1]==='string',`dyer palette ${p}`);
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify({brands:Object.fromEntries(Object.entries(VEHICLE_BRANDS).map(([b,v])=>[b,Object.keys(v.models)])),
  car:CAR_PRICES===GAME_DB.shops.auto_shop.car_prices, custom:CUSTOM_PRICES===GAME_DB.shops.auto_shop.custom_prices&&Object.isFrozen(CUSTOM_PRICES),
  fee:DYER.FEE, palette:DYER.PALETTE===GAME_DB.shops.dyer.palette})`));
 for(const [b,models] of Object.entries(A.car_prices)) for(const m of Object.keys(models))
  assert.ok(got.brands[b]&&got.brands[b].includes(m),`car_prices.${b}.${m}: no such car in VEHICLE_BRANDS`);
 assert.deepEqual([got.car,got.custom,got.fee,got.palette],[true,true,sh.dyer.fee,true]);
 assert.deepEqual(e.errors,[]);
});

test('Progression: trees, kill awards and abilities are whole, and the game builds its tuning screen from them',()=>{
 const pg=load('progression.json'), R=pg.resonance;
 assert.ok(R.CAP>0&&R.level_cost.base>0&&R.level_cost.per_level>=0);
 assert.equal(pg.trees.length,3);
 const ids=pg.trees.flatMap(t=>t.nodes.map(n=>n.id));
 assert.equal(new Set(ids).size,ids.length,'a node id is used twice');
 for(const t of pg.trees){
  assert.equal(t.nodes.length,6,`tree ${t.id}: six nodes`);
  for(const n of t.nodes){
   assert.ok(n.per_rank&&Object.keys(n.per_rank).length,`node ${n.id}: per_rank`);
   assert.ok(!n.unlockLevel||n.unlockLevel<=R.CAP,`node ${n.id}: unlockLevel past the cap`);
   for(const [k,x] of Object.entries(n.per_rank)) assert.ok(Array.isArray(x)?x.every(Number.isFinite):Number.isFinite(x),`node ${n.id}.${k}`);
  }
 }
 assert.equal(pg.trees.find(t=>t.id==='frame').nodes.find(n=>n.id==='last_stand').per_rank.cooldown_secs.length,4,'last_stand: a cooldown per rank, from 0');
 for(const [id,a] of Object.entries(pg.abilities)) assert.ok(a.name&&a.stats&&a.stats.damage>0&&a.stats.fireRate>0,`ability ${id}`);
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify((()=>{const R=new ResonanceSystem();R.ranks={reach:3,long_echo:2};
  return {classes:Object.keys(RESONANCE.BASE).map(k=>typeof globalThis[k]==='function'||eval('typeof '+k)==='function'),
   same:RESONANCE===GAME_DB.progression.resonance&&RESONANCE_TREES===GAME_DB.progression.trees&&ABILITY_REGISTRY===GAME_DB.progression.abilities&&TALK_PERKS===GAME_DB.progression.talk_perks,
   texts:RESONANCE_TREES.flatMap(t=>t.nodes.map(n=>n.desc(3,R))), next:RESONANCE.nextLevel(2), reach:R.stat('flitDistance',100), window:R.flitStrikeWindow()};})())`));
 assert.ok(got.classes.every(Boolean),'RESONANCE.BASE names an enemy class that does not exist');
 assert.equal(got.same,true);
 assert.ok(got.texts.every(t=>typeof t==='string'&&t.length>0&&!/undefined|NaN/.test(t)),'a node text is broken');
 assert.equal(got.next,R.level_cost.base+R.level_cost.per_level*2);
 assert.equal(got.reach,100*(1+0.1*3));
 assert.equal(got.window,1+0.25*2);
 assert.deepEqual(e.errors,[]);
});

test('Audio: every track is a file, every map, room, brand and floor exists, and the game reads them',()=>{
 const au=load('audio.json');
 const files=new Set(fs.readdirSync(join(ROOT,'assets','audio')).map(f=>f.replace(/\.[^.]+$/,'')));
 const specs=Object.entries(au.map_music).flatMap(([map,e])=>[].concat(e).map(s=>[map,s]));
 for(const [map,s] of specs){
  assert.ok(files.has(s.track),`map_music.${map}: no assets/audio file '${s.track}'`);
  assert.ok(s.volume>0&&s.volume<=1,`map_music.${map}: volume`);
 }
 for(const [map,room] of Object.entries(au.map_reverb)) assert.ok(au.reverb[room],`map_reverb.${map}: no reverb '${room}'`);
 for(const [kind,room] of Object.entries(au.room_reverb)) assert.ok(au.reverb[room],`room_reverb.${kind}: no reverb '${room}'`);
 for(const [name,p] of Object.entries(au.reverb)) assert.ok((p.length===4||p.length===7)&&p.every(Number.isFinite),`reverb.${name}: a ROOM PACKET is 4 or 7 numbers`);
 for(const k of Object.keys(au.sfx_voices)) assert.ok(k in au.sfx_length,`sfx_voices.${k}: no such sound in sfx_length`);
 const MATS=new Set(['marble','wood','carpet','stone','concrete','asphalt','grass','metal','water']);
 for(const [map,f] of Object.entries(au.floors)){
  assert.ok(MATS.has(f.def),`floors.${map}.def`);
  for(const r of f.rects||[]) assert.ok(r.length===5&&r.slice(0,4).every(Number.isFinite)&&MATS.has(r[4]),`floors.${map}: rect ${r}`);
 }
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify({maps:Object.keys(MAP_DATA),brands:Object.keys(VEHICLE_BRANDS),
  same:MAP_MUSIC===GAME_DB.audio.map_music&&REVERB===GAME_DB.audio.reverb&&FLOOR_MATERIALS===GAME_DB.audio.floors&&SFX_CAP===GAME_DB.audio.sfx_voices&&ENGINE_HUM===GAME_DB.audio.engine_hum,
  areas:Object.values(MAP_MUSIC).flatMap(e=>[].concat(e)).filter(s=>s.area).map(s=>typeof s.area==='object'&&Number.isFinite(s.area.w)),
  graveyard:MAP_MUSIC.sdc[0].area===HUB_GRAVEYARD})`));
 const maps=new Set(got.maps);
 for(const t of ['map_music','map_reverb','floors']) for(const map of Object.keys(au[t])) assert.ok(maps.has(map),`${t}.${map}: no such map in MAP_DATA`);
 for(const b of Object.keys(au.engine_hum)) assert.ok(got.brands.includes(b),`engine_hum.${b}: no such brand`);
 assert.equal(got.same,true);
 assert.ok(got.areas.length>0&&got.areas.every(Boolean),'a music area did not resolve to a place');
 assert.equal(got.graveyard,true);
 assert.deepEqual(e.errors,[]);
});

console.log(`test-game-db: ${tests.length} passed`);
