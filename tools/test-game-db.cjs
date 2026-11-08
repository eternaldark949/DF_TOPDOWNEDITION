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

test('Enemies: kinds, bosses and gauntlet maps hang together, and enemies spawn with the data\'s numbers',()=>{
 const en=load('enemies.json'), K=en.kinds;
 for(const [id,k] of Object.entries(K)) for(const [f,v] of Object.entries(k)) if(typeof v==='number') assert.ok(Number.isFinite(v)&&v>=0,`kinds.${id}.${f}`);
 assert.deepEqual(en.triumvirate.map(t=>t[3]).sort(),Object.keys(en.wardens).sort(),'triumvirate: one place per warden');
 for(const t of en.triumvirate) assert.ok(Number.isFinite(t[0])&&Number.isFinite(t[1])&&Number.isInteger(t[2]),`triumvirate ${t}`);
 for(const id of en.drone_kinds) assert.ok(en.drone.KEEP[id],`drone kind ${id}: no KEEP distance`);
 const ids=en.gauntlet_maps.map(g=>g.id); assert.equal(new Set(ids).size,ids.length,'a gauntlet id is used twice');
 for(const g of en.gauntlet_maps.filter(g=>!g.locked)){
  assert.ok(g.spawns.length>0&&g.spawns.every(p=>p.length===2&&p.every(Number.isFinite)),`gauntlet ${g.id}: spawns`);
  assert.ok(g.gunnerSpawns.every(p=>p.length===2&&p.every(Number.isFinite)),`gauntlet ${g.id}: gunnerSpawns`);
 }
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify({maps:Object.keys(MAP_DATA),weapons:Object.keys(typeof WEAPON_MODELS!=='undefined'?WEAPON_MODELS:{}),
  hooks:GAUNTLET_MAPS.filter(g=>g.hooks).map(g=>typeof g.waves),
  ganger:(g=>[g.hp,g.speed,g.visionRange,g.radius])(new Ganger(0,0)), hunter:(h=>[h.hp,h.clawDmg,h.huntSpeed])(new Hunter(0,0)),
  demoness:(d=>[d.hp,d.whipDmg])(new Demoness(0,0)), gunner:(g=>[g.hp,g.reloadTime])(new GatlingGunner(0,0,0)), warden:new GatlingGunner(0,0,0,{persona:'matins'}).hp,
  drone:(d=>[d.hp,d.radius])(new Drone(0,0,'seer')),
  same:DRONE===GAME_DB.enemies.drone&&DUEL===GAME_DB.enemies.duel&&HAZARD===GAME_DB.enemies.hazards&&GAUNTLET_SCALE===GAME_DB.enemies.gauntlet.scale})`));
 const maps=new Set(got.maps);
 for(const g of en.gauntlet_maps.filter(g=>!g.locked)) assert.ok(maps.has(g.mapId),`gauntlet ${g.id}: no map '${g.mapId}'`);
 if(got.weapons.length) assert.ok(got.weapons.includes(K.hunter.weapon),`kinds.hunter.weapon '${K.hunter.weapon}' has no weapon model`);
 assert.ok(got.hooks.length>0&&got.hooks.every(t=>t==='function'),'a gauntlet map names wave hooks that did not attach');
 assert.deepEqual(got.ganger,[K.ganger.hp,K.ganger.speed,K.ganger.vision_range,K.ganger.radius]);
 assert.deepEqual(got.hunter,[K.hunter.hp,K.hunter.claw,K.hunter.hunt_speed]);
 assert.deepEqual(got.demoness,[K.demoness.hp,K.demoness.whip_dmg]);
 assert.deepEqual(got.gunner,[K.gatling_gunner.hp,K.gatling_gunner.reload]);
 assert.equal(got.warden,en.warden.HP);
 assert.deepEqual(got.drone,[en.drone.HP,K.drone.radius]);
 assert.equal(got.same,true);
 assert.deepEqual(e.errors,[]);
});

test('Vehicles: every car is whole, the Zib and BlackMark are real cars, each tuning field is explained, and the game reads them',()=>{
 const v=load('vehicles.json'), hex=c=>/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c), F=v._about.fields;
 const car=(b,m)=>v.brands[b]&&v.brands[b].models[m];
 for(const [b,B] of Object.entries(v.brands)){
  for(const k of ['maxSpeed','acceleration','handling','friction','mass','seats','brake']) assert.ok(B.baseStats[k]>0,`${b}.baseStats.${k}`);
  assert.deepEqual(Object.keys(B.drive).sort(),Object.keys(F.drive_feel).sort(),`${b}.drive: fields differ from _about.fields.drive_feel`);
  for(const c of [...B.colors,B.headlightColor,...(B.glowColor===null?[]:[B.glowColor])]) assert.ok(hex(c),`${b} colour ${c}`);
  for(const [m,M] of Object.entries(B.models)){
   assert.ok(typeof M.name==='string'&&M.length>0&&M.width>0&&M.speedMod>0,`${b}.${m}: name, length, width, speedMod`);
   assert.ok(M.driven.top>0&&M.driven.accel>0,`${b}.${m}.driven`);
   assert.equal(M.spec.length,v.spec_labels.length,`${b}.${m}.spec: one rating per spec label`);
   assert.ok(M.spec.every(n=>n>=0&&n<=100),`${b}.${m}.spec: ratings are out of 100`);
  }
 }
 assert.ok(car(v.blackmark_defaults.brand,v.blackmark_defaults.model),'blackmark_defaults: no such car');
 assert.ok(car(v.zib.brand,v.zib.model),'zib: no such car');
 assert.ok(v.zib.fareBase>0&&v.zib.farePerUnit>0&&v.zib.maxActive>0&&v.zib.spawnChance>0&&v.zib.spawnChance<1,'zib: fare and spawning');
 unique(v.zib_destinations,'zib_destinations');
 for(const d of v.zib_destinations) assert.ok(d.label&&d.landmark,`zib destination ${d.id}: label and landmark`);
 for(const t of ['calm','normal','pushy']) assert.ok(v.traffic_tempers[t],`traffic_tempers.${t}: traffic-people.js reads it`);
 for(const [t,T] of Object.entries(v.traffic_tempers)) assert.deepEqual(Object.keys(T).sort(),Object.keys(F.traffic_tempers).sort(),`traffic_tempers.${t}: fields differ from _about.fields`);
 for(const k of ['traffic_ai','drive']) assert.deepEqual(Object.keys(v[k]).sort(),Object.keys(F[k]).sort(),`${k}: every field is explained in _about.fields, and only those`);
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify({same:VEHICLE_BRANDS===GAME_DB.vehicles.brands&&CAR_SPEC_LABELS===GAME_DB.vehicles.spec_labels&&ZIB_DESTINATIONS===GAME_DB.vehicles.zib_destinations
   &&TRAFFIC_TEMPERS===GAME_DB.vehicles.traffic_tempers&&CONFIG.VEHICLE_AI===GAME_DB.vehicles.traffic_ai&&CONFIG.VEHICLE_DRIVE===GAME_DB.vehicles.drive
   &&BLACKMARK_DEFAULTS===GAME_DB.vehicles.blackmark_defaults&&ZIB_CONFIG===GAME_DB.vehicles.zib,
  frozen:Object.isFrozen(BLACKMARK_DEFAULTS)&&Object.isFrozen(ZIB_CONFIG),
  fare:ZibSystem.prototype.calculateFare(0,0,3000,4000),
  car:(c=>[c.brand,c.model,c.length,c.width])(new TrafficVehicle(null,'Zenxera','sports','AI')),
  spec:carSpec('LADY','suv')})`));
 assert.equal(got.same,true,'an old name no longer reads the chapter');
 assert.equal(got.frozen,true);
 assert.equal(got.fare,Math.round(v.zib.fareBase+5000*v.zib.farePerUnit));
 assert.deepEqual(got.car,['Zenxera','sports',v.brands.Zenxera.models.sports.length,v.brands.Zenxera.models.sports.width]);
 assert.deepEqual(got.spec,v.spec_labels.map((label,i)=>({label,v:v.brands.LADY.models.suv.spec[i]})));
 assert.deepEqual(e.errors,[]);
});

test('Places: maps, rooms, doors, fireplaces and notes point at things that exist, and the game reads them',()=>{
 const pl=load('places.json'), maps=new Set(Object.keys(pl.maps)), areas=new Set(['hub_graveyard']);
 const at=(o,path)=>path.replace(/\[(\d+)\]/g,'.$1').split('.').reduce((a,k)=>a==null?a:a[k],o);
 for(const [id,m] of Object.entries(pl.maps)){
  assert.equal(m.id,id,`maps.${id}: its id differs from its key`);
  assert.ok(m.width>0&&m.height>0&&m.label,`maps.${id}: width, height, label`);
  if(m.spawn) assert.ok(m.spawn.x>=0&&m.spawn.y>=0&&m.spawn.x<=m.width&&m.spawn.y<=m.height,`maps.${id}: spawn is off the map`);
  for(const t of m.transitions||[]) assert.ok(maps.has(t.target),`maps.${id}: a transition goes to '${t.target}', which is no map`);
  for(const z of m.floorZones||[]) if('area' in z) assert.ok(areas.has(z.area),`maps.${id}: floor zone area '${z.area}' (MAP_AREAS, world/maps.js)`);
 }
 for(const [id,r] of Object.entries(pl.rooms)){
  assert.ok(maps.has(id),`rooms.${id}: no such map`);
  for(const d of r.doors||[]) for(const room of d.rooms||[]) assert.ok(r.rooms[room],`rooms.${id}: a door opens on '${room}', which is no room there`);
 }
 for(const id of Object.keys(pl.hearths)) assert.ok(maps.has(id),`hearths.${id}: no such map`);
 for(const b of Object.values(pl.hub.blocks)) assert.match(b,/^block_\d+_\d+$/);
 const S=pl.dyer_station, apt=pl.maps.apt_949;
 assert.ok(S.x>=0&&S.y>=0&&S.x+S.width<=apt.width&&S.y+S.height<=apt.height,'dyer_station is outside apt_949');
 for(const path of Object.keys(pl._about.notes)) assert.notEqual(at(pl,path),undefined,`_about.notes: '${path}' is nothing in the chapter`);
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify({same:MAP_DATA===GAME_DB.places.maps&&ROOM_DEFS===GAME_DB.places.rooms&&HEARTHS===GAME_DB.places.hearths
   &&HUB_BLOCKS===GAME_DB.places.hub.blocks&&HUB_NPC_ANCHORS===GAME_DB.places.hub.npc_anchors&&HUB_OLLO_DOOR===GAME_DB.places.hub.ollo_door
   &&HUB_GRAVEYARD===GAME_DB.places.hub.graveyard&&DYER.STATION===GAME_DB.places.dyer_station,
  clearance:HUB_NPC_CLEARANCE, frozen:Object.isFrozen(HUB_GRAVEYARD),
  grave:MAP_DATA.sdc.floorZones.find(z=>z.x===HUB_GRAVEYARD.x&&z.y===HUB_GRAVEYARD.y&&z.w===HUB_GRAVEYARD.w&&z.h===HUB_GRAVEYARD.h)||null,
  named:MAP_DATA.sdc.floorZones.filter(z=>'area' in z).length})`));
 assert.equal(got.same,true,'an old name no longer reads the chapter');
 assert.deepEqual([got.clearance,got.frozen,got.named],[pl.hub.npc_clearance,true,0]);
 const named=pl.maps.sdc.floorZones.find(z=>z.area==='hub_graveyard');
 assert.deepEqual(got.grave,{...pl.hub.graveyard,color:named.color},'the graveyard floor zone takes the graveyard\'s rectangle');
 assert.deepEqual(e.errors,[]);
});

test('Story: steps are named once, point at real maps and checks, crew nights at real places, and step code attaches',()=>{
 const st=load('story.json'), maps=new Set(Object.keys(load('places.json').maps));
 const checker=fs.readFileSync(join(ROOT,'src','story','narrative-cutscenes.js'),'utf8');
 const checks=new Set([...checker.slice(checker.indexOf('checkCondition(')).matchAll(/case "([A-Z_0-9]+)"/g)].map(m=>m[1]));
 const known=c=>c===null||checks.has(c)||/^TIMER_\d+$/.test(c)||(c.startsWith('LOC_')&&maps.has(c.slice(4).toLowerCase()));
 const steps=[];
 for(const [pn,part] of Object.entries(st.parts)) for(const [cn,ch] of Object.entries(part.chapters)) for(const [mn,m] of Object.entries(ch.missions)){
  steps.push(...Object.values(m.steps));
  unique(m.optional||[],`parts.${pn}.chapters.${cn}.missions.${mn}.optional`);
  for(const o of m.optional||[]){ assert.ok(known(o.trigger),`optional ${o.id}: trigger '${o.trigger}' is no check`); steps.push(...Object.values(o.steps)); }
 }
 const names=steps.map(s=>s.name); assert.equal(new Set(names).size,names.length,'a step name is used twice (the story moves by name)');
 for(const s of steps){
  if(s.targetMap!==null) assert.ok(maps.has(s.targetMap),`step ${s.name}: targetMap '${s.targetMap}' is no map`);
  if('condition' in s) assert.ok(known(s.condition),`step ${s.name}: condition '${s.condition}' is no check (StoryManager.checkCondition)`);
  else assert.ok(s.hooks,`step ${s.name}: no condition, and no hooks to give it one`);
 }
 const ids=new Set(Object.keys(st.crew.ids));
 for(const [id,v] of Object.entries(st.crew.venues)){
  assert.ok(maps.has(v.map),`crew venue ${id}: map '${v.map}' is no map`);
  assert.ok(ids.has(v.host),`crew venue ${id}: host '${v.host}' is not in crew.ids`);
  assert.ok(v.solo&&v.solo.me&&v.solo.them,`crew venue ${id}: solo needs me and them`);
  for(const night of [v.group,v.solo].filter(Boolean)) for(const spot of [night.me,night.them,...(night.seats||[])].filter(Boolean))
   assert.ok(typeof spot.deg==='number'&&!('a' in spot),`crew venue ${id}: a spot faces by deg (degrees), not a`);
 }
 for(const [who,venue] of Object.entries(st.crew.home_venue)){ assert.ok(ids.has(who),`home_venue: '${who}' is not in crew.ids`); assert.ok(st.crew.venues[venue],`home_venue.${who}: no venue '${venue}'`); }
 const kinds=Object.values(st.mission_types); assert.equal(new Set(kinds).size,kinds.length,'mission_types: a value is used twice');
 for(const who of Object.keys(st.van.poses)) assert.ok(st.van.drop[who],`van.drop: nowhere for ${who}`);
 const e=runtime(join(ROOT,'DFAB V8.html'),{affine:true});
 const got=JSON.parse(e.run(`JSON.stringify((()=>{const steps=[];for(const p of Object.values(STORY_DB))for(const c of Object.values(p.chapters))for(const m of Object.values(c.missions)){steps.push(...Object.values(m.steps));for(const o of m.optional||[])steps.push(...Object.values(o.steps));}
  return {same:STORY_DB===GAME_DB.story.parts&&MISSION_TYPES===GAME_DB.story.mission_types&&CREW_VENUES===GAME_DB.story.crew.venues&&CREW_IDS===GAME_DB.story.crew.ids
    &&CREW_HOME_VENUE===GAME_DB.story.crew.home_venue&&VAN_DROP===GAME_DB.story.van.drop&&VAN_POSES===GAME_DB.story.van.poses&&MIRABEL_DEPOSIT===GAME_DB.story.van.deposit,
   hooked:steps.filter(s=>s.hooks).map(s=>[s.name,Object.keys(STORY_STEP_HOOKS[s.hooks]).every(k=>typeof s[k]==='function')]),
   used:Object.keys(STORY_STEP_HOOKS).filter(k=>!steps.some(s=>s.hooks===k)),
   seat:CREW_VENUES.moon_city.group.seats.map(s=>[s.a,'deg' in s]), turn:[angleKit.toRad(90)===Math.PI/2,angleKit.toRad(-90)===-Math.PI/2,angleKit.toRad(180)===Math.PI,angleKit.toDeg(Math.PI)]};})())`));
 assert.equal(got.same,true,'an old name no longer reads the chapter');
 for(const [name,ok] of got.hooked) assert.ok(ok,`step ${name}: its hooks did not attach`);
 assert.deepEqual(got.used,[],'STORY_STEP_HOOKS has code no step names');
 assert.deepEqual(got.seat,st.crew.venues.moon_city.group.seats.map(s=>[s.deg*Math.PI/180,false]),'the crew seats read radians from the data\'s degrees');
 assert.deepEqual(got.turn,[true,true,true,180],'angleKit: right angles convert exactly');
 assert.deepEqual(e.errors,[]);
});

console.log(`test-game-db: ${tests.length} passed`);
