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

