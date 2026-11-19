// ===== LV0 BASEMENT =====
import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeLightGrid,readLightGrid,LIGHT_GRID,createLightLayerParts,lightGridPackets,lightGridSystem,drawingEmitters} from '../index.mjs';
import {physicsSystem} from '../../physics/index.mjs';
import {mapInstance} from '../../maps/index.mjs';

const neon=(x,y,w=60,color='#ff3399',extra={})=>drawingEmitters([{shape:'rectangle',x,y,width:w,height:8,fill:color,emits:{reach:120,...extra}}])[0];
const region={left:0,top:0,right:512,bottom:512};

test('settings: cell 16 or 32, a region may override, unknown fields refused', () => {
    const s=readLightGrid({cell:32,spread:2,regions:{'1,0':{cell:16}}});
    assert.equal(s.cell,32);assert.equal(s.regions['1,0'].cell,16);assert.equal(s.regions['1,0'].spread,2,'a region keeps the map\'s other settings');
    assert.deepEqual(readLightGrid({}).cell,LIGHT_GRID.cell);
    assert.throws(()=>readLightGrid({cell:8}));assert.throws(()=>readLightGrid({blur:2}));assert.throws(()=>readLightGrid({regions:{'0,0':{size:1}}}));
});

test('a neon bar beside a wall lights its own side only', () => {
    for(const cell of [16,32]){
        const grid=bakeLightGrid({bounds:region,cell,emitters:[neon(200,200)],blockers:[[180,212,300,224]]});
        const near=grid.sample(230,170),far=grid.sample(230,260),off=grid.sample(480,480);
        assert.ok(near[0]>.3&&near[0]>near[1],`the near side is lit pink (${near})`);
        assert.ok(far[0]<near[0]*.2,`the far side, behind the wall, is not (${far} vs ${near})`);
        assert.equal(off[0],0,'past its reach nothing');
        const open=bakeLightGrid({bounds:region,cell,emitters:[neon(200,200)]});
        assert.ok(open.sample(230,260)[0]>far[0]*3,'without the wall the far side is lit');
    }
});

test('a high emitter reaches farther and softer; strength scales it', () => {
    const low=bakeLightGrid({bounds:region,emitters:[neon(200,200)]}),high=bakeLightGrid({bounds:region,emitters:[neon(200,200,60,'#ff3399',{height:120})]});
    assert.ok(high.sample(230,204)[0]<low.sample(230,204)[0],'softer under it');
    assert.ok(high.sample(230,360)[0]>low.sample(230,360)[0],'and reaching farther');
    const strong=bakeLightGrid({bounds:region,emitters:[neon(200,200)],strength:2});
    assert.ok(Math.abs(strong.sample(230,190)[0]-2*low.sample(230,190)[0])<1e-4);
});

test('the same light bakes the same key; a change gives a new one', () => {
    const a=bakeLightGrid({bounds:region,emitters:[neon(200,200)]}),b=bakeLightGrid({bounds:region,emitters:[neon(200,200)]}),c=bakeLightGrid({bounds:region,emitters:[neon(210,200)]});
    assert.equal(a.key,b.key);assert.notEqual(a.key,c.key);
    const [glow]=lightGridPackets(a),[cut]=lightGridPackets(a,'cut');
    assert.equal(glow.type,'sprite');assert.equal(glow.blend,'add');assert.equal(cut.blend,'destination-out');
    assert.deepEqual([glow.pixels.width,glow.pixels.height],[a.cols,a.rows],'the grid draws as one small image, a pixel a cell');
    assert.deepEqual(glow.size,[a.cols*a.cell,a.rows*a.cell],'scaled up over the region');
    assert.equal(lightGridPackets(a)[0].pixels,glow.pixels,'made once per grid');
    const lit=(a.cols*Math.floor(190/32)+Math.floor(230/32))*4;assert.ok(glow.pixels.data[lit]>200&&glow.pixels.data[lit+3]>0,'its colour where the light is');
});

test('the light layer\'s tiles carry the grid: a cut in the dark and its colour, keyed by what it shows', () => {
    const grid=bakeLightGrid({bounds:region,emitters:[neon(200,200)]});
    const parts=(grids)=>createLightLayerParts({extent:region,tint:'rgba(5,5,20,.9)',grids,tile_size:256,view:region});
    const without=parts([]),withGrid=parts([grid]),again=parts([grid]);
    assert.equal(without.filter(p=>p.blend==='add').length,0);
    const glows=withGrid.filter(p=>p.blend==='add');assert.ok(glows.length>=1&&glows.length<=4,'a colour picture in the tiles the light reaches');
    assert.deepEqual(withGrid.map(p=>p.picture.key),again.map(p=>p.picture.key),'a still frame keeps every key: nothing repaints');
    const dark=withGrid.find(p=>p.picture.bounds[0]===0&&p.picture.bounds[1]===0).picture.build();
    assert.ok(dark.some(p=>p.blend==='destination-out'),'the grid cuts the dark');
    const moved=parts([bakeLightGrid({bounds:region,emitters:[neon(300,200)]})]);
    assert.notDeepEqual(moved.map(p=>p.picture.key),withGrid.map(p=>p.picture.key));
});

test('a map\'s light grid: still emitters bake per region, a mover re-bakes what it reaches, within the budget', () => {
    const p=new physicsSystem();
    const map=new mapInstance(p,{size:[2048,1024],regions:{size:512,radius:4096},
        floors:[{shape:'rectangle',x:100,y:100,width:80,height:10,fill:'#ff3399',emits:{reach:140}}],walls:[{x:80,y:120,w:140,h:12}]});
    const grids=new lightGridSystem({settings:{cell:32,regions:{'1,0':{cell:16}}}}).attach(map);
    map.setFocus([256,256],{budget_ms:Infinity});
    assert.equal(grids.getStatistics().still_emitters,1);assert.equal(grids.getStatistics().walls,1);
    grids.updateState({budget_ms:Infinity});
    assert.equal(grids.getStatistics().grids,8);assert.equal(grids.pending,0);
    assert.equal(grids.grids({left:512,top:0,right:1024,bottom:512})[0].cell,16,'region 1,0 bakes at its own cell size');
    assert.ok(grids.sample(140,80)[0]>.3&&grids.sample(140,160)[0]<grids.sample(140,80)[0]*.25,'the wall keeps the light on the sign\'s side');
    const before=grids.getStatistics().bakes;
    grids.updateState();assert.equal(grids.getStatistics().bakes,before,'a still frame bakes nothing');
    const car=x=>[{id:7,emitters:drawingEmitters([{shape:'ellipse',x,y:700,radius_x:30,radius_y:12,fill:'#33ccff',emits:{reach:80}}])}];
    grids.setMovers(car(300));assert.ok(grids.pending>=1);grids.updateState({budget_ms:Infinity});
    assert.ok(grids.sample(300,700)[2]>.3,'the car lights the ground under it');
    const n=grids.getStatistics().bakes;grids.setMovers(car(303));grids.updateState();assert.equal(grids.getStatistics().bakes,n,'a move under half a cell bakes nothing');
    grids.setMovers(car(700));const r=grids.updateState({budget_ms:Infinity});assert.ok(r.baked>=2,'the regions it left and entered re-bake');
    assert.ok(grids.sample(300,700)[2]<.01&&grids.sample(700,700)[2]>.3,'its light went with it');
    assert.equal(grids.liveLights().length,1,'and it keeps a small live light of its own');
    grids.setMovers([]);grids.updateState({budget_ms:Infinity});assert.ok(grids.sample(700,700)[2]<.01,'gone when it goes');
    let t=0;grids.setMovers(car(1500));const one=grids.updateState({budget_ms:0,now:()=>t++});assert.equal(one.baked,1,'a spent budget still bakes one a call');
});
