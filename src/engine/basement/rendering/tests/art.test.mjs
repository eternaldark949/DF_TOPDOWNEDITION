// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFrame,cameraSystem,artScene,circle,polyline,polygon,rect,roundRect,capsule,smoothShape,glow,groundShadow,hexToRgb,rgbToHex,rgba,mix,shade,seededRandom,hash2} from '../index.mjs';

const view=()=>new cameraSystem({position:[50,50],viewport:{width:100,height:100}}).getView();
/** Every packet the toolkit makes must pass the frame's own validation. */
const accepted=packets=>{const frame=new renderFrame();frame.begin(view());for(const p of packets)frame.submit(p);return frame.finish().passes[0].packets;};
const ends=commands=>commands.filter(c=>c[0]==='move'||c[0]==='line'||c[0]==='quadratic').map(c=>c.slice(-2));

test('shapes are plain path commands that the frame accepts', () => {
    assert.deepEqual(ends(rect(1,2,3,4)),[[1,2],[4,2],[4,6],[1,6]]);
    assert.equal(polygon([[0,0],[1,0],[0,1]]).at(-1)[0],'close');assert.notEqual(polyline([[0,0],[1,1]]).at(-1)[0],'close');
    assert.throws(()=>polyline([[0,0]]));assert.throws(()=>polygon([[0,0],[1,1]]));
    const box=roundRect(0,0,10,4,9);assert.deepEqual(box[0],['move',2,0],'the radius is clamped to half the short side');
    assert.deepEqual(roundRect(0,0,10,4,0),rect(0,0,10,4));
    const limb=capsule([0,0],[10,0],2);assert.equal(limb.filter(c=>c[0]==='ellipse').length,2);
    const s=new artScene();s.fill(rect(0,0,5,5),'#f00').outlined(box,'#fff','#000',2).stroke(polyline([[0,0],[4,4]]),'#0f0').fill(limb,'#00f').fill(smoothShape([[0,0],[4,0],[4,4],[0,4]]),'#123');
    const packets=accepted(s.finish());assert.equal(packets.length,5);
    assert.deepEqual([packets[1].material.fill,packets[1].material.stroke,packets[1].material.stroke_width],['#fff','#000',2]);
});

test('groups nest transforms and style like canvas save and restore', () => {
    const s=new artScene();s.enter({position:[10,0]},{opacity:.5,blend:'add'}).enter({rotation:Math.PI/2}).fill([circle(0,0,1)],'#fff').leave().leave().fill([circle(0,0,1)],'#fff');
    const [inner,outer]=s.finish();
    assert.deepEqual(inner.matrix.map(v=>+v.toFixed(9)),[0,1,-1,0,10,0]);assert.equal(inner.opacity,.5);assert.equal(inner.blend,'add');
    assert.deepEqual(outer.matrix,[1,0,0,1,0,0]);assert.equal(outer.blend,'normal');
    assert.throws(()=>new artScene().leave());assert.throws(()=>new artScene().enter().finish());
});

test('glows and ground shadows are radial fades the frame accepts, in the group blend unless told', () => {
    const s=new artScene();glow(s,0,0,10,'255,200,0');s.enter({},{blend:'add'});glow(s,0,0,10,'255,200,0',0);s.leave();glow(s,0,0,10,'0,0,255',.3,{blend:'screen',alpha:.5});groundShadow(s,0,0,8,3,{strength:2});
    const [plain,added,screened,shadow]=accepted(s.finish());
    assert.deepEqual([plain.blend,added.blend,screened.blend],['normal','add','screen']);
    assert.equal(plain.material.fill.stops.length,3);assert.equal(added.material.fill.stops.length,2);assert.equal(screened.material.fill.stops[0][1],'rgba(0,0,255,0.5)');
    assert.equal(shadow.material.fill.stops[0][1],'rgba(0,0,0,0.6)');
});

test('the backend takes the masking and lighting blends the classic art uses', () => {
    for(const blend of ['source-atop','destination-over','overlay','soft-light','lighten','darken'])accepted(new artScene().enter({},{blend}).fill([circle(0,0,1)],'#fff').leave().finish());
    assert.throws(()=>accepted(new artScene().enter({},{blend:'copy'}).fill([circle(0,0,1)],'#fff').leave().finish()),'copy would wipe everything under the layer, so it is not a packet blend');
});

test('colour helpers convert, mix and shade hex colours', () => {
    assert.deepEqual(hexToRgb('#f80'),[255,136,0]);assert.equal(rgbToHex([255,136,0]),'#ff8800');assert.throws(()=>hexToRgb('red'));
    assert.equal(rgba('#ff8800',.5),'rgba(255,136,0,0.5)');assert.equal(rgba([1.4,2,3]),'rgba(1,2,3,1)');
    assert.equal(mix('#000000','#ffffff',.5),'#808080');assert.equal(shade('#808080',-1),'#000000');assert.equal(shade('#808080',1),'#ffffff');assert.equal(shade('#808080',0),'#808080');
});

test('seeded randomness repeats for the same seed and cell', () => {
    const a=seededRandom(7),b=seededRandom(7),c=seededRandom(8),run=f=>Array.from({length:5},f);
    const first=run(a);assert.deepEqual(first,run(b));assert.notDeepEqual(first,run(c));assert.ok(first.every(v=>v>=0&&v<1));
    assert.equal(hash2(3,4,1),hash2(3,4,1));assert.notEqual(hash2(3,4,1),hash2(4,3,1));
    const values=Array.from({length:1000},(_,i)=>hash2(i,i*7,2)),mean=values.reduce((s,v)=>s+v,0)/values.length;assert.ok(Math.abs(mean-.5)<.05,`spread evenly (${mean})`);
});
