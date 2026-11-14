// ===== LV0 BASEMENT =====
// Height: points lean away from the camera as they rise, walls are the quads between foot and top, and the
// architecture parts come back as shapes the frame accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFrame,cameraSystem,artScene,heightScale,heightView,boxFaces} from '../index.mjs';

const accepted=packets=>{const frame=new renderFrame();frame.begin(new cameraSystem({position:[0,0],viewport:{width:100,height:100}}).getView());for(const p of packets)frame.submit(p);return frame.finish().passes[0].packets;};
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9,`${a} is ${b}`));

test('a point leans away from the camera as it rises, and the plane matrix agrees', () => {
    assert.equal(heightScale(0,700),1);assert.equal(heightScale(350,700),2);assert.equal(heightScale(5000,700),heightScale(602,700),'held below the eye');
    const view=new heightView({camera:[100,100],eye:700}),k=view.k(70);
    close(view.at(200,100,70),[100+100*k,100]);close(view.at(100,100,70),[100,100],'under the camera nothing leans');
    const m=view.plane(k);close([m[0]*200+m[4],m[3]*50+m[5]],view.scaled(200,50,k));
    assert.equal(view.leaning(2).k(70)-1,(k-1)*2,'a bolder lean doubles it');
});

test('a block of rectangles has no inner walls, and the camera sees the faces turned to it', () => {
    const faces=boxFaces([{x:0,y:0,w:100,h:50},{x:0,y:50,w:40,h:50}]);
    assert.equal(faces.length,7,'an L has six outside edges, its long west wall in two sections');
    assert.ok(!faces.some(f=>f.side==='S'&&f.section===0&&f.x1<40),'where the leg stands against it there is no wall');
    const view=new heightView({camera:[50,300],eye:700});
    assert.deepEqual(faces.filter(f=>view.sees(f)).map(f=>f.side).sort(),['E','S','S'],'both south walls, and the leg\'s east wall');
});

test('a wall runs from its foot to its leaned top, and the parts are shapes the frame takes', () => {
    const view=new heightView({camera:[0,300],eye:700}),face={x1:-50,y1:100,x2:50,y2:100,nx:0,ny:1},k=view.k(60),wall=view.wall(face,k);
    close(wall.at(0,0),[-50,100]);close(wall.at(1,1),view.scaled(50,100,k));assert.equal(wall.length,100);assert.ok(wall.depth>0);
    const edges=[{a:[-50,100],b:[50,100],nx:0,ny:1}],ledge=view.ledge(edges,30,3,2),fins=view.fins([{x:0,y:100,nx:0,ny:1}],0,60,3,2),cols=view.columns([[0,120]],3,0,40),sills=view.sills([{x0:-10,y0:100,x1:10,y1:100,nx:0,ny:1,z:20}],1.5),ver=view.veranda(edges,20,8,10,6);
    const art=new artScene();
    for(const s of [wall.outline(),wall.quad(.2,.4,.1,.3),ledge.top,ledge.band,fins.front,cols.shafts,cols.caps,ver.top])art.fill(s,'#888');
    for(const s of [ledge.lip,fins.edge,sills.lip,sills.shade,ver.posts,ver.rail])art.stroke(s,'#fff',1);
    assert.equal(accepted(art.finish()).length,14);
    assert.equal(view.fins([],0,10,1,1).front,null,'nothing to draw is null');
    const hull=view.silhouette([[0,0],[10,0],[10,10],[0,10]],1.5);assert.ok(hull.length>=4&&hull.length<=8);assert.ok(hull.some(([,y])=>y<-100),'it reaches the leaned roof, away from the camera');
});

test('depth batches paint lowest first and group a look across things that do not cross', async () => {
    const { depthBatches } = await import('../index.mjs');
    const quad = (x, y) => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
    const item = (name, z, key, x, y) => ({ name, z, key, box: [x, y, x + 10, y + 10], convex: quad(x, y) });
    const groups = depthBatches([item('a2', 5, 'bark', 0, 0), item('b1', 1, 'leaf', 100, 0), item('a1', 1, 'bark', 10, 0), item('c', 9, 'bark', 5, 0), item('p', 7, null, 0, 0), item('d', 8, 'bark', 300, 0)]);
    // a1 and a2 touch along an edge and join; d passes the picture p it misses; c lands on p, so it waits.
    assert.deepEqual(groups.map(g => g.map(i => i.name)), [['b1'], ['a1', 'a2', 'd'], ['p'], ['c']]);
});

test('a strip laid on a wall in tiles lands within the error of where the wall leans', async () => {
    const { heightView } = await import('../index.mjs');
    const view = new heightView({ camera: [0, 0], eye: 700 }), face = { x1: -200, y1: 300, x2: 220, y2: 300 }, z0 = 0, z1 = 160;
    const tiles = view.tiles(face, z0, z1, { error: .75 });
    assert.ok(tiles.length > 1 && tiles.length <= Math.ceil(420 / 40) * Math.ceil(160 / 14));
    let worst = 0;
    for (const t of tiles) for (const [fu, fz] of [[.1, .1], [.5, .5], [.9, .9], [.1, .9]]) {
        const u = t.u0 + (t.u1 - t.u0) * fu, z = t.z0 + (t.z1 - t.z0) * fz, y = z1 - z, m = t.matrix;
        const got = [m[0] * u + m[2] * y + m[4], m[1] * u + m[3] * y + m[5]], want = view.at(face.x1 + u, 300, z);
        worst = Math.max(worst, Math.hypot(got[0] - want[0], got[1] - want[1]));
    }
    assert.ok(worst < 1.5, `off by ${worst}`);
    assert.ok(view.tiles(face, z0, z1, { error: 3 }).length < tiles.length, 'a looser error takes fewer tiles');
});
