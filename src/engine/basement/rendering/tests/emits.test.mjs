// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {artScene,readEmits,EMITS,drawingEmitters} from '../index.mjs';

test('emits reads in one form and refuses what it does not know', () => {
    assert.deepEqual(readEmits(true),{...EMITS});
    assert.equal(readEmits(false),null);
    assert.deepEqual(readEmits({strength:2,color:'#f0a'}),{strength:2,reach:96,color:'#f0a',height:0});
    for(const bad of [{brightness:1},{strength:-1},{reach:0},{color:'pink'},{height:-2},'yes',[1]])assert.throws(()=>readEmits(bad));
});

test('an emitting step draws as it would without, and a bad emits is refused when drawn', () => {
    const plain=new artScene().draw([{shape:'rectangle',width:4,height:2,fill:'#f0f'}]).finish();
    const lit=new artScene().draw([{shape:'rectangle',width:4,height:2,fill:'#f0f',emits:{strength:3}}]).finish();
    assert.deepEqual(lit,plain);
    assert.throws(()=>new artScene().draw([{shape:'circle',radius:2,emits:{glow:1}}]));
});

test('drawingEmitters lists glowing shapes in world space, from steps and materials', () => {
    const materials=name=>({neon:{kind:'material',fill:'#ff3399',emits:{reach:50}},plain:{kind:'material',fill:'#333'}})[name];
    const list=drawingEmitters([
        {shape:'rectangle',x:0,y:0,width:10,height:4,fill:'#00ffcc',emits:{strength:2,height:30}},
        {shape:'group',x:100,steps:[{shape:'line',points:[[0,0],[20,0]],stroke:'#0ff',line_width:3,emits:true}]},
        {shape:'circle',radius:5,material:'neon'},
        {shape:'circle',radius:5,material:'neon',emits:false},
        {shape:'circle',radius:5,material:'plain'}],{at:[10,20],scale:2,materials,elevation:5});
    assert.equal(list.length,3);
    assert.deepEqual(list[0].bounds,[10,20,30,28]);assert.equal(list[0].color,'#00ffcc');assert.equal(list[0].strength,2);assert.equal(list[0].height,35);assert.equal(list[0].reach,192);
    assert.equal(list[1].open,true);assert.equal(list[1].width,6);assert.equal(list[1].color,'#00ffff');
    assert.equal(list[2].color,'#ff3399');assert.equal(list[2].reach,100);
});
