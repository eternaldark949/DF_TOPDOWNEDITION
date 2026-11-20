// ===== LV2 DIRECTORY =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDrawing,validateMaterial,validateMap} from '../structures.mjs';

test('the Directory checks emits on steps, materials and map floors', () => {
    assert.doesNotThrow(()=>validateDrawing({steps:[{shape:'circle',radius:3,fill:'#fff',emits:{strength:1,reach:40}}]}));
    assert.throws(()=>validateDrawing({steps:[{shape:'circle',radius:3,emits:{shine:1}}]}),/Unknown emits field: shine/);
    assert.doesNotThrow(()=>validateMaterial({kind:'material',fill:'#ff3399',emits:{reach:120}}));
    assert.throws(()=>validateMaterial({kind:'material',fill:'#ff3399',emits:{reach:-1}}));
    assert.throws(()=>validateMaterial({kind:'material',fill:'#ff3399',emits:false}));
    assert.throws(()=>validateMap({size:[100,100],floors:[{shape:'rectangle',x:0,y:0,width:10,height:10,emits:{colour:'#fff'}}]}));
});


test('a map\'s light grid settings and switches are checked', () => {
    assert.doesNotThrow(()=>validateMap({size:[100,100],switches:{light_grid:true},light_grid:{cell:32,regions:{'0,0':{cell:16}}}}));
    assert.throws(()=>validateMap({size:[100,100],light_grid:{cell:24}}),/16 or 32/);
    assert.throws(()=>validateMap({size:[100,100],light_grid:{size:32}}),/Unknown light_grid field/);
    assert.throws(()=>validateMap({size:[100,100],light_grid:{regions:{'0,0':{spread:-1}}}}));
    assert.throws(()=>validateMap({size:[100,100],switches:{light_grid:'yes'}}));
    assert.doesNotThrow(()=>validateMap({size:[100,100],night:{tint:'rgba(24,0,78,.72)',effects:[{type:'grade',tint:'#d0a0ff',tint_amount:.5}],glare:{reach:58}},rain:{density:10,wind:[.2,0]}}));
    assert.throws(()=>validateMap({size:[100,100],night:{glare:{size:3}}}),/Unknown night.glare field/);
    assert.throws(()=>validateMap({size:[100,100],night:{effects:[{type:'sparkle'}]}}),/effects\[0\]/);
    assert.throws(()=>validateMap({size:[100,100],rain:{amount:2}}),/rain.amount/);
});

test('a map\'s height view is an eye above the ground and how far walls lean', () => {
    assert.doesNotThrow(()=>validateMap({size:[100,100],height_view:{eye:280,lean:1.5}}));
    assert.doesNotThrow(()=>validateMap({size:[100,100],height_view:{eye:600}}));
    assert.throws(()=>validateMap({size:[100,100],height_view:{eye:0}}),/height_view/);
    assert.throws(()=>validateMap({size:[100,100],height_view:{eye:280,tilt:1}}),/height_view/);
});
