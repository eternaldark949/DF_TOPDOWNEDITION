'use strict';
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {runtime}=require('./test-game-runtime.cjs');
const e=runtime(join(__dirname,'..','DFAB V8.html'),{timers:true});
e.pendingTimers.length=0;
e.run(`
 phoneSystem.messageHistory={};phoneSystem.unread={};phoneSystem.contactOverrides={};
 phoneSystem.isOpen=true;phoneSystem.currentApp='details';phoneSystem.currentContact='Victoria';
 phoneSystem.renderThread=function(c){const h=this.messageHistory[c.name]||[];this._awaitingThem=!!h.at(-1)?.awaiting;};
 phoneSystem.renderContacts=()=>{};phoneSystem.refreshNotifications=()=>{};phoneSystem._whereAmI=()=>null;
 audioSys.sfx=()=>{};Date.now=()=>1234;
`);
const flush=()=>{const timers=e.pendingTimers.splice(0).sort((a,b)=>a.ms-b.ms);for(const t of timers)t.f();};
const get=source=>structuredClone(e.run(source));
for(let i=0;i<7;i++){
 e.run(`phoneSystem.sendSnapshot({name:'Victoria'});`);
 const scheduled=e.pendingTimers.slice();assert.equal(scheduled.length,2);
 if(i===0){e.run(`phoneSystem.sendSnapshot({name:'Victoria'});`);assert.equal(e.pendingTimers.length,2,'Another photo waits for the current reply');}
 scheduled[0].f();assert.equal(e.run(`phoneSystem.typingState.Victoria`),true);
 scheduled[1].f();e.pendingTimers.length=0;
 assert.equal(e.run(`phoneSystem.typingState.Victoria`),false);
 assert.equal(e.run(`phoneSystem._awaitingThem`),false);
 assert.equal(e.run(`phoneSystem.messageHistory.Victoria.filter(r=>r.from==='them').length`),i+1);
}
const records=get(`phoneSystem.messageHistory.Victoria`),photos=records.filter(r=>r.kind==='snap'),replies=records.filter(r=>r.from==='them');
assert.equal(new Set(photos.map(p=>p.id)).size,7,'Same-millisecond sends still receive unique identities');
assert.equal(new Set(replies.map(p=>p.id)).size,7);
assert.equal(replies[0].text,replies[3].text,'Reused wording still produces a real reply');
assert.equal(new Set(replies.slice(0,3).map(r=>r.text)).size,3);
assert.ok(replies.every((r,i)=>r.replyTo===photos[i].id));
assert.equal(photos.filter(p=>p.data.img).length,6,'Photo storage limit is preserved');
e.run(`phoneSystem.messageHistory=JSON.parse(JSON.stringify(phoneSystem.messageHistory));phoneSystem.sendSnapshot({name:'Victoria'});`);flush();
assert.equal(e.run(`phoneSystem.messageHistory.Victoria.at(-1).text`),replies[1].text,'Response rotation survives saved history');
// Existing saves can contain the original untagged response.
e.run(`phoneSystem.messageHistory.Max=[{text:MSG_SNAP_REPLIES.Max[0],from:'them'}];phoneSystem.currentContact='Max';phoneSystem.renderThread({name:'Max'});phoneSystem.sendSnapshot({name:'Max'});`);flush();
assert.equal(e.run(`phoneSystem.messageHistory.Max.at(-1).text`),e.run(`MSG_SNAP_REPLIES.Max[1]`));
// Group replies retain their speaker; a closed thread receives a genuine unread message.
e.run(`phoneSystem._someCrew=()=> 'Yenna';phoneSystem.currentContact=MSG_GROUP;phoneSystem.renderThread({name:MSG_GROUP});phoneSystem.sendSnapshot({name:MSG_GROUP,group:true});phoneSystem.currentApp='contacts';`);flush();
const group=get(`phoneSystem.messageHistory[MSG_GROUP].at(-1)`);
assert.equal(group.who,'Yenna');assert.ok(group.replyTo);assert.equal(e.run(`phoneSystem.unread[MSG_GROUP]`),1);
// A replayed delivery must neither duplicate the reply nor create a phantom notification.
e.run(`phoneSystem._answer({name:MSG_GROUP,group:true},phoneSystem.messageHistory[MSG_GROUP][0],{text:MSG_SNAP_REPLIES.Yenna[0],who:'Yenna'});`);flush();
assert.equal(e.run(`phoneSystem.messageHistory[MSG_GROUP].filter(r=>r.from==='them').length`),1);
assert.equal(e.run(`phoneSystem.unread[MSG_GROUP]`),1);
assert.equal(e.run(`phoneSystem.typingState[MSG_GROUP]`),false);
// Normal story-message deduplication remains unchanged.
assert.equal(e.run(`!!phoneSystem.addMessage('Mirabel','Story beat')`),true);
assert.equal(e.run(`phoneSystem.addMessage('Mirabel','Story beat')`),null);
assert.deepEqual(e.errors,[]);
console.log('Repeated photo replies, typing completion, varied responses, saved history, groups, unread counts and story deduplication passed.');
