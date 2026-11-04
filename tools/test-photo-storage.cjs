'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{timers:true,events:true});e.pendingTimers.length=0;
e.run(`phoneSystem.messageHistory={};phoneSystem.isOpen=false;phoneSystem.currentApp='closed';audioSys.sfx=()=>{};phoneSystem._whereAmI=()=>null;
 phoneSystem.renderThread=function(c){this._awaitingThem=!!this.messageHistory[c.name]?.at(-1)?.awaiting;};phoneSystem.refreshNotifications=()=>{};
 game.worldMinutes=200;Date.now=()=>99;`);
const flush=()=>{for(const t of e.pendingTimers.splice(0).sort((a,b)=>a.ms-b.ms))t.f();};
for(let i=0;i<6;i++){e.run(`phoneSystem._awaitingThem=false;phoneSystem.sendSnapshot({name:'${i%2?'Max':'Victoria'}'});`);flush();}
const before=e.run(`JSON.stringify(phoneSystem._activeSnapshots().map(p=>p.rec.data.img))`);
e.run(`phoneSystem._awaitingThem=false;phoneSystem.sendSnapshot({name:'Yenna'});`);
assert.equal(e.run(`phoneSystem.messageHistory.Yenna?.length||0`),0,'A blocked send adds no photo or reply');
assert.equal(e.pendingTimers.length,0);
assert.equal(e.run(`phoneSystem._activeSnapshots().length`),6);
assert.equal(e.run(`JSON.stringify(phoneSystem._activeSnapshots().map(p=>p.rec.data.img))`),before,'The limit never evicts an existing image');
assert.match(e.run(`document.getElementById('contact-photo-storage').textContent`),/limit reached/);
assert.equal(e.run(`!!phoneSystem._photoManagerEl`),true);
// Downloads preserve the exact stored image and do not remove it from the conversation.
e.run(`globalThis.downloads=[];const proto=Object.getPrototypeOf(document.createElement('a'));proto.click=function(){downloads.push({href:this.href,name:this.download});};
 globalThis.first=phoneSystem._activeSnapshots()[0].rec;phoneSystem._downloadSnapshot(first);`);
assert.equal(e.run(`downloads[0].href`),e.run(`first.data.img`));assert.match(e.run(`downloads[0].name`),/\.jpg$/);
const reply=e.run(`phoneSystem.messageHistory.Victoria.find(r=>r.replyTo===first.id)?.text`);
e.run(`first.theirReact='❤️';phoneSystem._deleteSnapshot(first);`);
assert.equal(e.run(`phoneSystem._activeSnapshots().length`),5);
assert.equal(e.run(`first.data.removed`),'deleted');assert.equal(e.run(`first.theirReact`),'❤️');
assert.equal(e.run(`phoneSystem.messageHistory.Victoria.find(r=>r.replyTo===first.id)?.text`),reply);
assert.equal(e.run(`phoneSystem._snapCard({name:'Victoria'},first).textContent`),'📷 Image no longer available');
assert.equal(e.run(`phoneSystem._snapCard({name:'Victoria'},first).children.length`),0,'Unavailable photos have no empty image rectangle');
e.run(`phoneSystem._awaitingThem=false;phoneSystem.sendSnapshot({name:'Yenna'});`);flush();
assert.equal(e.run(`phoneSystem._activeSnapshots().length`),6,'Deleting an image frees a slot across all contacts');
assert.equal(e.run(`phoneSystem._downloadSnapshot(first)`),false);
// In-game expiry is exact and persists through JSON/save data, without removing replies.
e.run(`phoneSystem.messageHistory=JSON.parse(JSON.stringify(phoneSystem.messageHistory));game.worldMinutes=1639;phoneSystem.tickSnapshots();`);
assert.equal(e.run(`phoneSystem._activeSnapshots().length`),6);
e.run(`game.worldMinutes=1640;phoneSystem.tickSnapshots();`);
assert.equal(e.run(`phoneSystem._activeSnapshots().length`),0);
assert.equal(e.run(`Object.values(phoneSystem.messageHistory).flat().filter(r=>r.replyTo).length`),7);
// Legacy sent images acquire expiry from their sent time; received images are unaffected.
e.run(`phoneSystem.messageHistory={Legacy:[{kind:'snap',from:'me',timestamp:300,id:'legacy',data:{img:'legacy-image'}}],Incoming:[{kind:'snap',from:'them',timestamp:300,data:{img:'received-image'}}]};game.worldMinutes=301;phoneSystem._expireSnapshots();`);
assert.equal(e.run(`phoneSystem.messageHistory.Legacy[0].data.expiresAt`),1740);
e.run(`game.worldMinutes=1740;globalThis.saved=game.getSaveSchema();`);
assert.equal(e.run(`saved.phone.messageHistory.Legacy[0].data.img`),null,'Expired image data is swept before saving');
assert.equal(e.run(`phoneSystem.messageHistory.Incoming[0].data.img`),'received-image');
assert.deepEqual(e.errors,[]);
console.log('Photo cap, no silent eviction, image download/delete, compact placeholders, game-time expiry, save cleanup and legacy history passed.');
