/** Lighting contracts: finite authoring, projection correctness, bounded lazy GPU ownership. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lighting, shadowSettings } from '../engine/basement/lighting.js';
import { lightDirection, directionalShadowMatrix, pointShadowMatrix } from '../engine/basement/shadow-math.js';
import { ShadowTarget } from '../engine/basement/shadow-target.js';

/** Transform and divide one point; independent arithmetic checks the GPU matrix convention. */
function project(m,p){const q=[0,0,0,0];for(let row=0;row<4;row++)q[row]=m[row]*p[0]+m[row+4]*p[1]+m[row+8]*p[2]+m[row+12];return q.slice(0,3).map(v=>v/q[3]);}

test('sun basis is finite, depth orders toward the source, and light-plane translation snaps to texels',()=>{
  for(const d of [[0,0,1],[0,0,-1],[-0.4,-0.5,1]]){
    const direction=lightDirection(d),m=directionalShadowMatrix(direction,{x:0,y:0},16,512);
    assert.ok(Array.from(m).every(Number.isFinite));
    assert.ok(project(m,direction)[2]<project(m,[0,0,0])[2]);
  }
  const a=directionalShadowMatrix([0,0,1],{x:0,y:0},16,512),b=directionalShadowMatrix([0,0,1],{x:0.001,y:0.001},16,512);
  assert.deepEqual(a,b);assert.throws(()=>lightDirection([0,0,0]),RangeError);assert.throws(()=>lightDirection([Infinity,0,1]),RangeError);
});

test('all cube faces project their forward near/far planes to the GL depth interval',()=>{
  const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],origin=[2,3,4];
  for(let face=0;face<6;face++){
    const m=pointShadowMatrix(origin,face,0.05,12);
    for(const [distance,expected]of [[0.05,-1],[12,1]]){
      const point=origin.map((n,i)=>n+directions[face][i]*distance),p=project(m,point);
      assert.ok(Math.abs(p[0])<1e-4&&Math.abs(p[1])<1e-4&&Math.abs(p[2]-expected)<1e-4);
    }
  }
  assert.throws(()=>pointShadowMatrix(origin,6,1,12),RangeError);
});

test('lighting configuration validates atomically, copies data and never allocates a GL target until rendering',()=>{
  const renderer={gl:{},stats:{programs:0}},l=new Lighting(renderer),before=l.direction.slice();
  assert.throws(()=>l.configureDirectional({direction:[1,0,0],color:[-1,0,0]}),RangeError);assert.deepEqual(l.direction,before);
  const direction=[1,1,1],color=[1,2,3];l.configureDirectional({direction,color});direction[0]=99;color[0]=99;
  assert.ok(l.direction[0]<1);assert.equal(l.directionColor[0],1);
  l.setPoint(7,{position:[1,2,3],color:[3,2,1],radius:12});const positions=l.positions.slice();
  assert.throws(()=>l.setPoint(8,{position:[0,0,0],color:[1,1,1],radius:12}),RangeError);
  assert.throws(()=>l.setPoint(7,{position:[NaN,0,0],color:[1,1,1],radius:12}),RangeError);assert.deepEqual(l.positions,positions);
  const settings=l.settings;
  for(const patch of [{mode:'ultra'},{pointIndex:8},{pointResolution:1024},{extent:NaN},{softness:-1},{pointRefreshHz:0}]){
    assert.throws(()=>l.configureShadows(patch),RangeError);assert.equal(l.settings,settings);
  }
  l.configureShadows({mode:'high',pointIndex:7});assert.equal(l.maps.inspect().targetBytes,0);
  assert.equal(shadowSettings(settings,{mode:'low'}).mode,'low');l.dispose();l.dispose();
  assert.throws(()=>l.configureShadows({mode:'low'}),/disposed/);
});

test('shadow targets release partial allocations after framebuffer refusal and dispose exactly once',()=>{
  let textures=0,fbos=0,complete=false;
  const gl={FRAMEBUFFER_COMPLETE:1,createTexture:()=>{textures++;return{};},createFramebuffer:()=>{fbos++;return{};},
    deleteTexture:()=>textures--,deleteFramebuffer:()=>fbos--,activeTexture(){},bindTexture(){},texStorage2D(){},texParameteri(){},
    bindFramebuffer(){},drawBuffers(){},readBuffer(){},framebufferTexture2D(){},checkFramebufferStatus:()=>complete?1:0};
  assert.throws(()=>new ShadowTarget(gl,128,true),/unavailable/);assert.equal(textures,0);assert.equal(fbos,0);
  complete=true;const target=new ShadowTarget(gl,256,true);assert.equal(target.bytes,256*256*6*4);
  target.dispose();target.dispose();assert.equal(textures,0);assert.equal(fbos,0);
});
