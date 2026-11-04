'use strict';
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { runtime } = require('./test-game-runtime.cjs');
const e = runtime(join(__dirname, '..', 'DFAB V8.html'), { affine: true });
const result = e.run(`(() => {
    const c = game.ctx;
    game.camera = { x: 100, y: 200, zoom: 1 };
    CONFIG.BUILDINGS.LEAN = true;
    const l = new LampEntity({ x: 400, y: 500, lampType: 2 });
    const p = lampProjection(l);
    const indoor = lampProjection(new LampEntity({ x: 400, y: 500, lampType: 3 }));
    const oldSprite = lampSprite, oldPoint = lampPoint, heights = new Set();
    lampSprite = () => { throw new Error('Street model must not stamp the complete lamp sprite'); };
    lampPoint = (lamp,x,y,z) => { heights.add(z); return oldPoint(lamp,x,y,z); };
    for (const lampType of [1,2,6]) {
        const model = new LampEntity({x:400,y:500,lampType});
        model.draw(c, 0); model.draw(c, 1); model.drawEmissive(c, 0);
    }
    lampSprite = oldSprite; lampPoint = oldPoint;
    const matrix = c.getTransform();
    CONFIG.BUILDINGS.LEAN = false;
    const flat = lampProjection(l);
    CONFIG.BUILDINGS.LEAN = true;
    let clips = 0, images = 0;
    const clip = c.clip, image = c.drawImage;
    c.clip = rule => { if (rule === 'evenodd') clips++; };
    c.drawImage = () => images++;
    game.activeMap = { type: 'outdoor', buildings: [] };
    game._cullBounds = { view: { left: -1000, top: -1000, right: 1000, bottom: 1000 } };
    const shop = { isV2: true, variant: {kind:'shop'}, _shopfront: true, x:0, y:0,
      inView: () => true, _glowOccluders: () => [[[0,0],[100,0],[100,100],[0,100]]],
      sections: [{}], _footprint: () => [[0,0],[100,0],[100,100],[0,100]],
      _entrance: () => ({cx:50,cy:100}),
      _frontGeo: () => ({nx:0,ny:1,ux:1,uy:0,cx:50,cy:100,sec:{w:100,h:100}}) };
    game._prepareRenderBuildingLists = () => ({v2:[{item:shop}]});
    game.drawShopfrontLight(c, 1);
    CONFIG.BUILDINGS.LEAN = false;
    game.drawShopfrontLight(c, 1);
    c.clip = clip; c.drawImage = image;
    return { heights: Array.from(heights), p, indoor, flat, clips, images, matrix: [matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f] };
})()`);
assert.ok(result.p.k > 1 && result.p.x > 400 && result.p.y > 500);
assert.equal(result.indoor.k, 1);
assert.ok(result.heights.includes(0) && result.heights.includes(163), 'Independent ground and lantern cap planes');
assert.equal(result.flat.x, 400);
assert.equal(result.flat.y, 500);
assert.deepEqual(Array.from(result.matrix), [1,0,0,1,0,0]);
assert.equal(result.clips, 2, 'The emitting shop also occludes its ground spill');
assert.ok(result.images > 0);
assert.deepEqual(e.errors, []);
console.log('Lamp projection, fixture fallback, canvas restoration and shop roof clipping passed.');
