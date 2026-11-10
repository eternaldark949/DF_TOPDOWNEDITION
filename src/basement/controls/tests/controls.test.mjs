import test from 'node:test';
import assert from 'node:assert/strict';
import { controlSystem, controlsSystem, TAP, DOUBLETAP, HELD, REPEAT } from '../index.mjs';

class Element extends EventTarget {
 constructor(rect={left:0,top:0,width:100,height:100}){super();this.rect=rect;const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x)};this.style={setProperty(){}};}
 getBoundingClientRect(){return this.rect;}
 setPointerCapture(){}
 closest(){return null;}
}
const emit=(target,type,properties={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);};
function fixture(options={}){
 let now=0;const window=new EventTarget(),document=new EventTarget();document.hidden=false;
 const input=new controlSystem({event_target:window,document,now:()=>now,...options});
 return {input,window,document,time:value=>{now=value;},emit:(type,p)=>emit(window,type,p)};
}
const mapping={move_up:['w'],move_down:['s'],move_left:['a'],move_right:['d']};
const vectors={move:{touch:'move',gamepad:'left',dead_zone:.15},aim:{touch:'aim',gamepad:'right',dead_zone:.15}};
const pad=()=>({index:0,connected:true,axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))});

test('canonical controlSystem retains the Python terminology and the classic name is the same class',()=>{
 assert.equal(controlsSystem,controlSystem);const {input}=fixture({keymap:{fire:['space']}});
 input.setInput('keyboard','space',true);assert.equal(input.keyboard.input_active.has('space'),true);assert.equal(input.keyboard.input_just_activated.has('space'),true);
 assert.deepEqual(input.getActiveInputs(),['space']);assert.deepEqual(input.getActiveActions(),['fire']);
 input.generateGhostImage();assert.equal(input.keyboard.ghost_image.has('space'),true);assert.equal(input.justActivated('fire'),false);assert.equal(input.active('fire'),true);input.dispose();
});

test('aggregate action edges survive arbitrary queries and releasing one binding does not release another',()=>{
 const {input}=fixture({keymap:{fire:['space','mouseLeft']}});
 input.setInput('keyboard','space',true);assert.equal(input.justActivated('fire'),true);assert.equal(input.justActivated('fire'),true);input.generateGhostImage();
 input.setInput('mouse','mouseLeft',true);assert.equal(input.justActivated('fire'),false);
 input.setInput('keyboard','space',false);assert.equal(input.active('fire'),true);assert.equal(input.justReleased('fire'),false);
 input.setInput('mouse','mouseLeft',false);assert.equal(input.active('fire'),false);assert.equal(input.justReleased('fire'),true);
 assert.ok(Object.isFrozen(input.getState('fire')));input.dispose();
});

test('a tap between simulation ticks preserves both edges and buffered actions expire at read time',()=>{
 const {input,time}=fixture({keymap:{interact:[['e',TAP]]}});
 input.setInput('keyboard','e',true);time(.05);input.setInput('keyboard','e',false);input.updateState();
 assert.deepEqual(input.getState('interact'),{active:false,just_activated:true,just_released:true,value:0,held:0});
 assert.equal(input.readQueue('interact',TAP),true);assert.equal(input.readQueue('interact'),false);
 input.setInput('keyboard','e',true);time(.1);input.setInput('keyboard','e',false);time(2);assert.equal(input.readQueue('interact'),false);input.dispose();
});

test('held and double-tap recognition is centralized and a hold never becomes a tap',()=>{
 const {input,time}=fixture({keymap:{tap:[['e',TAP]],hold:[['e',HELD,.3]],double:[['e',DOUBLETAP]]}});
 input.setInput('keyboard','e',true);time(.4);input.updateState();assert.equal(input.readQueue('hold',HELD),true);input.updateState();assert.equal(input.readQueue('hold'),false);
 time(.45);input.setInput('keyboard','e',false);assert.equal(input.readQueue('tap'),false);
 time(1);input.setInput('keyboard','e',true);time(1.05);input.setInput('keyboard','e',false);assert.equal(input.readQueue('tap'),false);
 time(1.1);input.setInput('keyboard','e',true);time(1.14);input.setInput('keyboard','e',false);assert.equal(input.readQueue('double',DOUBLETAP),true);
 time(1.5);input.updateState();assert.equal(input.readQueue('tap'),false);input.dispose();
});

test('focus loss cancels taps and OS key repeats cannot resurrect held gameplay input',()=>{
 const {input,time,emit}=fixture({keymap:{use:[['e',TAP]],fire:[['space',REPEAT]]}});
 emit('keydown',{key:'e'});time(.05);emit('blur');emit('keyup',{key:'e'});assert.equal(input.readQueue('use'),false);
 emit('keydown',{key:' ',repeat:true});assert.equal(input.active('fire'),false);
 emit('keydown',{key:' '});assert.equal(input.active('fire'),true);input.clear();emit('keydown',{key:' ',repeat:true});assert.equal(input.readQueue('fire'),false);
 emit('keyup',{key:' '});emit('keydown',{key:' '});assert.equal(input.readQueue('fire'),true);input.dispose();
});

test('typing does not activate movement, while explicitly allowed callback actions can still handle Escape',()=>{
 let escaped=0;const {input,emit}=fixture({keymap:{move_up:['w'],back:['Escape']},actions:[['back',null,()=>escaped++]]});
 const field=new Element();field.closest=()=>field;const event={key:'w',target:field};input.keyboard.event(event,true);assert.equal(input.active('move_up'),false);
 input.keyboard.event({key:'Escape',target:field},true);assert.equal(escaped,1);input.dispose();
});

test('digital and analog directions share dead zones and bounded magnitude without adding device speeds',()=>{
 const controller=pad();const {input}=fixture({keymap:mapping,vectors,read_gamepads:()=>[controller]});
 controller.axes=[.575,0,0,0];input.updateState();assert.ok(Math.abs(input.direction('move')[0]-.5)<1e-9);assert.equal(input.active('move'),true);assert.equal(input.justActivated('move'),true);
 input.setInput('keyboard','w',true);input.setInput('keyboard','d',true);const diagonal=input.direction('move');assert.ok(Math.abs(Math.hypot(...diagonal)-1)<1e-9);assert.ok(diagonal[1]<0);
 assert.ok(Object.isFrozen(input.getState('move').direction));input.keyboard.setInputs([]);controller.axes=[0,0,0,0];input.updateState();assert.equal(input.active('move'),false);assert.equal(input.justReleased('move'),true);
 assert.deepEqual(input.gamepad.stick('left',0),{x:0,y:0,m:0});assert.throws(()=>input.gamepad.stick('left',1),/dead_zone/);input.dispose();
});

test('trigger values and held gamepad inputs remain suppressed through clear until neutral',()=>{
 const controller=pad();const {input}=fixture({keymap:{fire:['gamepadRTrigger']},vectors,read_gamepads:()=>[controller]});
 controller.axes[0]=1;controller.buttons[7]={pressed:true,value:.7};input.updateState();assert.equal(input.value('fire'),.7);assert.equal(input.active('fire'),true);
 input.clear();input.updateState();assert.equal(input.value('fire'),0);assert.equal(input.active('fire'),false);assert.deepEqual(input.direction('move'),[0,0]);
 controller.axes[0]=0;controller.buttons[7]={pressed:false,value:0};input.updateState();controller.axes[0]=1;controller.buttons[7]={pressed:true,value:.8};input.updateState();
 assert.equal(input.value('fire'),.8);assert.equal(input.active('fire'),true);assert.deepEqual(input.direction('move'),[1,0]);input.dispose();
});

test('gamepad disconnection cancels gestures rather than firing a tap or keeping a stick active',()=>{
 const controller=pad();let connected=true;const {input,time}=fixture({keymap:{use:[['gamepadA',TAP]]},vectors,read_gamepads:()=>connected?[controller]:[]});
 controller.buttons[0]={pressed:true,value:1};controller.axes[0]=1;input.updateState();time(.05);connected=false;input.updateState();
 assert.equal(input.readQueue('use'),false);assert.equal(input.gamepad.connected,false);assert.deepEqual(input.direction('move'),[0,0]);input.dispose();
});

test('two touch sticks and a fire button keep separate fingers, and cancel releases only the owned control',()=>{
 const {input}=fixture({keymap:{fire:['touchFire']},vectors});const move=new Element(),aim=new Element({left:200,top:0,width:100,height:100}),button=new Element();
 input.touch.stick('move',{zone:move,travel:40});input.touch.stick('aim',{zone:aim,travel:40});input.touch.button(button,'touchFire');
 emit(move,'touchstart',{changedTouches:[{identifier:1,clientX:50,clientY:50}]});emit(aim,'touchstart',{changedTouches:[{identifier:2,clientX:250,clientY:50}]});
 emit(move,'touchmove',{changedTouches:[{identifier:1,clientX:90,clientY:50}]});emit(aim,'touchmove',{changedTouches:[{identifier:2,clientX:250,clientY:90}]});emit(button,'pointerdown',{pointerId:3,button:0});
 assert.deepEqual(input.direction('move'),[1,0]);assert.deepEqual(input.direction('aim'),[0,1]);assert.equal(input.active('fire'),true);
 emit(move,'touchmove',{changedTouches:[{identifier:99,clientX:10,clientY:10}]});assert.deepEqual(input.direction('move'),[1,0]);
 emit(move,'touchcancel',{changedTouches:[{identifier:1}]});assert.deepEqual(input.direction('move'),[0,0]);assert.deepEqual(input.direction('aim'),[0,1]);assert.equal(input.active('fire'),true);input.dispose();
});

test('multiple fingers on one touch button produce one press and cancel never completes a tap',()=>{
 let presses=0;const {input}=fixture({keymap:{press:['touchUse'],tap:[['touchUse',TAP]]},actions:[['press',null,()=>presses++]]});const el=new Element();input.touch.button(el,'touchUse');
 emit(el,'pointerdown',{pointerId:1,button:0});emit(el,'pointerdown',{pointerId:2,button:0});assert.equal(presses,1);
 emit(el,'pointerup',{pointerId:1});assert.equal(input.active('press'),true);emit(el,'pointercancel',{pointerId:2});assert.equal(input.active('press'),false);assert.equal(input.readQueue('tap'),false);input.dispose();
});

test('pointer snapshots are detached, wheel units normalize to pixels, and disposal removes all DOM handlers',()=>{
 const {input,emit}=fixture();emit('mousemove',{clientX:10,clientY:20});emit('mousemove',{clientX:14,clientY:28});emit('wheel',{deltaX:0,deltaY:2,deltaMode:1});
 assert.deepEqual(input.pointer(),{position:[14,28],delta:[4,8],wheel:[0,32],known:true});assert.ok(Object.isFrozen(input.pointer().position));input.generateGhostImage();assert.deepEqual(input.pointer().delta,[0,0]);
 input.dispose();emit('mousemove',{clientX:100,clientY:100});assert.deepEqual(input.pointer().position,[14,28]);assert.throws(()=>input.updateState(),/disposed/);input.dispose();
});

test('rebinding validates before mutation, clears held gestures and does not resurrect an old key',()=>{
 const {input}=fixture({keymap:{use:['e']}});input.setInput('keyboard','e',true);assert.throws(()=>input.setKeymap({bad:[null]}),/binding/);assert.equal(input.active('use'),true);
 input.setKeymap({new_use:['e']});assert.equal(input.active('new_use'),false);input.setInput('keyboard','e',false);input.setInput('keyboard','e',true);assert.equal(input.active('new_use'),true);input.dispose();
});

test('retired touch bindings are idempotent and cannot delete replacements or retain old listeners',()=>{
 const {input}=fixture({keymap:{use:['touchUse']}}),old=new Element(),next=new Element();old.style.touchAction='pan-y';
 const release=input.touch.button(old,'touchUse');input.touch.button(next,'touchUse');release();
 emit(old,'pointerdown',{pointerId:1,button:0});assert.equal(input.active('use'),false);
 emit(next,'pointerdown',{pointerId:2,button:0});assert.equal(input.active('use'),true);assert.equal(old.style.touchAction,'pan-y');
 input.dispose();emit(next,'pointerdown',{pointerId:3,button:0});assert.equal(input.active('use'),false);assert.equal(next.style.touchAction,'');
});

test('canceled sticks notify frontend cleanup once without completing a release gesture',()=>{
 const {input}=fixture({keymap:{released:[['touchRing',5]]}}),zone=new Element(),events=[];
 const stick=input.touch.stick('aim',{zone,travel:40,ring:[20,10],input:'touchRing',onEnd:(sample,event)=>events.push([sample.active,event.type,!!event.cancelled])});
 emit(zone,'touchstart',{changedTouches:[{identifier:1,clientX:50,clientY:50}]});emit(zone,'touchmove',{changedTouches:[{identifier:1,clientX:90,clientY:50}]});input.cancel();
 assert.deepEqual(events,[[true,'touchcancel',true]]);assert.equal(input.readQueue('released'),false);assert.equal(stick.s.active,false);input.dispose();assert.equal(events.length,1);
});

test('frontend callback failures cannot prevent other touch cleanup or retain device listeners',()=>{
 const {input,emit:windowEmit}=fixture({keymap:{move_right:['d']}});let other=0;
 for(const [name,onEnd]of [['bad',()=>{throw Error('frontend error');}],['good',()=>{other++;}]]){
  const zone=new Element();input.touch.stick(name,{zone,onEnd});emit(zone,'touchstart',{changedTouches:[{identifier:name,clientX:50,clientY:50}]});
 }
 assert.throws(()=>input.dispose(),/disposal failed/);assert.equal(input.disposed,true);assert.equal(other,1);windowEmit('keydown',{key:'d'});assert.equal(input.active('move_right'),false);
});
