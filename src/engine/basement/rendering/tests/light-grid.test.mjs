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

test('two regions baked with a margin meet without a seam: each matches one bake over both', () => {
    const lamp=neon(990,300,40,'#33ccff'),whole=bakeLightGrid({bounds:{left:0,top:0,right:2048,bottom:1024},cell:16,emitters:[lamp]});
    const left=bakeLightGrid({bounds:{left:0,top:0,right:1024,bottom:1024},cell:16,emitters:[lamp],margin:3}),right=bakeLightGrid({bounds:{left:1024,top:0,right:2048,bottom:1024},cell:16,emitters:[lamp],margin:3});
    for(const x of [960,1000,1016,1032,1060])assert.ok(Math.abs((x<1024?left:right).sample(x,300)[2]-whole.sample(x,300)[2])<1e-4,`at ${x}`);
    const bare=bakeLightGrid({bounds:{left:0,top:0,right:1024,bottom:1024},cell:16,emitters:[lamp]});
    assert.ok(Math.abs(bare.sample(1016,300)[2]-whole.sample(1016,300)[2])>.01,'without the margin the edge would differ');
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
    const keys=list=>list.filter(p=>p.picture).map(p=>p.picture.key);
    assert.deepEqual(keys(withGrid),keys(again),'a still frame keeps every key: nothing repaints');
    const tile=withGrid.find(p=>p.picture&&p.blend==='destination-out'&&p.picture.bounds[0]===0&&p.picture.bounds[1]===0);
    assert.ok(tile&&tile.picture.build().length,'the grid cuts the dark: a tile it lights holds a picture of what it cuts');
    assert.equal(keys(without).length,0,'with nothing cut, the dark is one plain fill and no tile is painted');
    const moved=parts([bakeLightGrid({bounds:region,emitters:[neon(300,200)]})]);
    assert.notDeepEqual(keys(moved),keys(withGrid));
});

test('a tile the grid leaves dark gets no pictures: only the tiles its light reaches are painted', () => {
    const big={left:0,top:0,right:1024,bottom:1024},grid=bakeLightGrid({bounds:big,emitters:[neon(100,100)]});
    const parts=createLightLayerParts({extent:big,tint:'rgba(5,5,20,.9)',grids:[grid],tile_size:256,view:big});
    const tiles=parts.filter(p=>p.picture).map(p=>p.picture.bounds);
    assert.ok(tiles.length>=2&&tiles.length<=8,`the light near a corner is in a few tiles, not all 16 (${tiles.length / 2})`);
    assert.ok(tiles.every(([x,y])=>x<512&&y<512),'the far tiles stay the plain dark');
    assert.ok(grid.peakIn([0,0,256,256])>.004&&grid.peakIn([768,768,256,256])<.004,'peakIn: the brightest light over a box');
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
    grids.setMovers(car(760));const step=grids.getStatistics().patches;grids.updateState({budget_ms:Infinity});
    assert.ok(grids.getStatistics().patches>step,'a mover re-bakes only the cells round it');
    for(const g of grids.grids()){const key=`${g.left/512},${g.top/512}`,whole=grids.bakeRegion(key);let worst=0;for(let i=0;i<g.light.length;i++)worst=Math.max(worst,Math.abs(g.light[i]-whole.light[i]));
        for(let i=0;i<g.rim.length;i++)worst=Math.max(worst,Math.abs(g.rim[i]-whole.rim[i]));
        assert.ok(worst<1e-5,`and gets what a whole bake of ${key} gets, its rim too (${worst})`);assert.equal(g.key,whole.key);}
    {const [a,b]=['0,1','1,1'].map(k=>grids.grids().find(g=>`${g.left/512},${g.top/512}`===k)),w=a.cols+2;let worst=0;
        for(let j=0;j<a.rows;j++)for(let c=0;c<3;c++)worst=Math.max(worst,Math.abs(a.rim[((j+1)*w+w-1)*3+c]-b.light[j*b.cols*3+c]));
        assert.ok(worst<1e-5,`a grid's rim is the first cells of the grid beside it, so the two draw without a seam (${worst})`);}
    grids.setMovers([]);grids.updateState({budget_ms:Infinity});
    let t=0;grids.setMovers(car(1500));const one=grids.updateState({budget_ms:0,now:()=>t++});assert.equal(one.baked,1,'a spent budget still bakes one a call');
});

test('a light group turned off: its things\' glowing steps stop lighting the grid, re-baked within the budget', () => {
    const packet={kind:'static',position:[100,100],rotation:0,light_group:'street_lights',components:[{layers:[{height:0,steps:[{shape:'rectangle',x:-20,y:-5,width:40,height:10,fill:'#ff3399',emits:{reach:140}}]}]}]};
    const map={region_size:512,packets:()=>[packet],addTier:(name,{load})=>load('0,0')};
    const grids=new lightGridSystem({settings:{cell:32}}).attach(map);grids.updateState({budget_ms:Infinity});
    const lit=grids.sample(100,140)[0];assert.ok(lit>.1,'on, it lights');
    assert.equal(grids.setLightGroup('street_lights',false),true);assert.equal(grids.setLightGroup('street_lights',false),false,'no change, nothing to do');
    assert.ok(grids.sample(100,140)[0]>.1,'the old grid shows until the new one is baked');
    grids.updateState({budget_ms:Infinity});assert.ok(grids.sample(100,140)[0]<lit*.05,'off, it does not');
    grids.setLightGroup('street_lights',true);grids.updateState({budget_ms:Infinity});assert.ok(Math.abs(grids.sample(100,140)[0]-lit)<1e-6,'and on again');
    assert.throws(()=>grids.setLightGroup('',true),/named/);
});

test('a mover whose layers read its look values is probed with them: a person in a shirt colour walks a lit map', () => {
    const grids=new lightGridSystem({settings:{cell:32}});
    const person={physics_type:'character',position:[50,50],rotation:0,get:k=>k==='look'?{values:{shirt:'#3d6b8f',sign:'#ff3399'}}:k==='components'?person.components:undefined,
        components:[{layers:[{height:20,steps:[{shape:'circle',radius:8,fill:'$shirt'}]}]},{layers:[{height:30,steps:[{shape:'rectangle',x:-4,y:-2,width:8,height:4,fill:'$sign',emits:{reach:60}}]}]}]};
    const movers=grids.moversOf([person]);
    assert.equal(movers.length,1,'its glowing badge makes it a mover, and reading $shirt does not throw');
    assert.ok(movers[0].emitters.length>=1);
});
