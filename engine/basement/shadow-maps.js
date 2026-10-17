/**
 * Basement / shadow maps: bounded renderer-owned targets, caster storage and update caches.
 * One directional map updates on change; at most one selected point cube refreshes as
 * an atomic six-face group. Point geometry changes are rate-limited; travel/light moves
 * invalidate immediately. No queue, second loop or partial six-face image is exposed.
 */
import { createProgram } from './gl-program.js';
import { directionalShadowMatrix, pointShadowMatrix } from './shadow-math.js';
import { SHADOW_VERTEX, SHADOW_FRAGMENT } from './shadow-shaders.js';
import { ShadowTarget } from './shadow-target.js';
import { configurePaletteSampler } from './skinning.js';

export class ShadowMaps {
  /** Retain matrices/keys; GPU allocations remain lazy until an enabled world is drawn. */
  constructor(renderer,lighting) {
    this.renderer=renderer;this.lighting=lighting;this.gl=renderer.gl;
    this.sun=null;this.point=null;this.program=null;this.casters=null;this.sourceBatch=null;
    this.sunMatrix=new Float32Array(16);this.previousSunMatrix=new Float32Array(16);this.faceMatrix=new Float32Array(16);
    this.pointPosition=new Float32Array(3);this.pointKey=new Float32Array(4);
    this.sunVersion=this.pointVersion=-1;this.pointAt=-Infinity;this.pointIndex=-1;
    this.sunReady=this.pointReady=false;this.sunFailure=this.pointFailure=null;
    this.frameDraws=0;this.sunUpdates=this.pointUpdates=0;this.disposed=false;
  }

  /** Release resources that are no longer allowed; retry failures only after explicit change. */
  reconfigure(previous,next) {
    this.sunFailure=this.pointFailure=null;
    if(next.mode==='off'){this.release();return;}
    if(previous.mode!==next.mode){this.sun?.dispose();this.sun=null;this.sunReady=false;}
    if(previous.pointIndex!==next.pointIndex||previous.pointResolution!==next.pointResolution){this.point?.dispose();this.point=null;this.pointReady=false;}
  }

  /** Create the shared depth program once; failed allocation leaves usable unshadowed lights. */
  ensureProgram() {
    if(!this.program){this.program=createProgram(this.gl,SHADOW_VERTEX,SHADOW_FRAGMENT);this.renderer.stats.programs++;this.matrixUniform=this.gl.getUniformLocation(this.program,'uLightMatrix');configurePaletteSampler(this.gl,this.program);}
  }

  /**
   * Borrow only the active world. Camera-visible instances cannot serve as shadow casters:
   * an offscreen building can cast onto visible ground. The separate bounded batch packs
   * all eligible resident-world shapes, with unchanged records retained between frames.
   */
  prepare(batch) {
    const r=this.renderer,l=this.lighting,s=l.settings,gl=this.gl;
    this.frameDraws=0;
    if(s.mode==='off'){this.clearWorld();return;}
    if(this.sunFailure&&(s.pointIndex<0||this.pointFailure)){this.clearWorld();return;}
    if(!this.casters||this.casters.world!==batch.world||this.casters.disposed){
      this.clearWorld();this.casters=r.createBatch(batch.world,batch.capacity,{visibility:'shadow'});
    }
    this.sourceBatch=batch;
    this.casters.sync();
    try {
      this.ensureProgram();gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);
      this.prepareSun();this.preparePoint();
    } catch(error) {
      // Program errors disable both paths until reconfiguration/restoration. Target
      // errors are handled independently below so the other light can still work.
      this.sunFailure=this.pointFailure=error.message;this.sunReady=this.pointReady=false;
    } finally {
      gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,r.canvas.width,r.canvas.height);gl.enable(gl.DEPTH_TEST);
    }
  }

  /** Depth draw contributes actual submissions/instances to the renderer's existing totals. */
  submit(target,matrix,face=0) {
    const gl=this.gl,r=this.renderer;target.face(face);gl.viewport(0,0,target.resolution,target.resolution);
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.matrixUniform,false,matrix);
    // One submission per primitive stream (boxes, rounded shapes) present in the casters.
    const submissions=this.casters.draw();
    this.frameDraws+=submissions;r.stats.draws+=submissions;r.stats.instances+=this.casters.count;
    r.totals.draws+=submissions;r.totals.shadowDraws+=submissions;r.totals.instances+=this.casters.count;
  }

  /** Sun cache includes the packed caster version and the complete snapped light transform. */
  prepareSun() {
    if(!this.lighting.directionColor.some(n=>n>0)){this.sun?.dispose();this.sun=null;this.sunReady=false;return;}
    if(this.sunFailure)return;
    const s=this.lighting.settings,resolution=s.mode==='high'?1024:512;
    try {
      if(!this.sun)this.sun=new ShadowTarget(this.gl,resolution);
      directionalShadowMatrix(this.lighting.direction,this.renderer.camera,s.extent,resolution,this.sunMatrix);
      let changed=this.sunVersion!==this.casters.version||!this.sunReady;
      for(let i=0;i<16;i++)if(this.sunMatrix[i]!==this.previousSunMatrix[i])changed=true;
      if(!changed){this.renderer.totals.shadowHits++;return;}
      this.submit(this.sun,this.sunMatrix);this.previousSunMatrix.set(this.sunMatrix);
      this.sunVersion=this.casters.version;this.sunReady=true;this.sunUpdates++;
    } catch(error) {this.sunFailure=error.message;this.sun?.dispose();this.sun=null;this.sunReady=false;}
  }

  /**
   * At most one point slot can own a cube. Light moves/radius changes and a new world
   * refresh immediately; moving casters refresh at most pointRefreshHz times/second.
   * All six faces use the same retained pose snapshot and complete in one submission group.
   */
  preparePoint() {
    const l=this.lighting,s=l.settings,index=s.pointIndex,offset=index*4,far=l.positions[offset+3],near=0.05;
    if(index<0||!Number.isFinite(far)||far<=near){this.point?.dispose();this.point=null;this.pointReady=false;this.pointIndex=-1;return;}
    if(this.pointFailure)return;
    const now=performance.now();
    let lightChanged=this.pointIndex!==index||!this.pointReady;
    for(let i=0;i<4;i++)if(this.pointKey[i]!==l.positions[offset+i])lightChanged=true;
    const dirty=this.pointVersion!==this.casters.version;
    if(!lightChanged&&(!dirty||now-this.pointAt<1000/s.pointRefreshHz)){this.renderer.totals.shadowHits++;return;}
    try {
      if(!this.point)this.point=new ShadowTarget(this.gl,s.pointResolution,true);
      for(let i=0;i<3;i++)this.pointPosition[i]=l.positions[offset+i];
      for(let face=0;face<6;face++){
        pointShadowMatrix(this.pointPosition,face,near,far,this.faceMatrix);this.submit(this.point,this.faceMatrix,face);
      }
      for(let i=0;i<4;i++)this.pointKey[i]=l.positions[offset+i];
      this.pointIndex=index;this.pointVersion=this.casters.version;this.pointAt=now;this.pointReady=true;this.pointUpdates++;
    } catch(error) {this.pointFailure=error.message;this.point?.dispose();this.point=null;this.pointReady=false;}
  }

  /** Bind raw depth samplers on reserved units 3/4; AO owns units 0..2. */
  bind(uniforms) {
    const gl=this.gl,s=this.lighting.settings,enabled=s.mode!=='off';
    gl.uniform1i(uniforms.uSunShadowEnabled,enabled&&this.sunReady?1:0);
    gl.uniformMatrix4fv(uniforms.uSunMatrix,false,this.sunMatrix);
    gl.uniform4f(uniforms.uShadowParameters,s.bias,s.normalBias,s.softness,s.extent);
    gl.uniform1i(uniforms.uSunShadow,3);gl.uniform1i(uniforms.uPointShadow,4);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.sunReady?this.sun.texture:null);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_CUBE_MAP,this.pointReady?this.point.texture:null);
    gl.uniform1i(uniforms.uPointShadowIndex,enabled&&this.pointReady?this.pointIndex:-1);
    gl.uniform3fv(uniforms.uPointShadowPosition,this.pointPosition);
    gl.uniform1f(uniforms.uPointShadowResolution,this.point?.resolution??128);
    gl.uniform4f(uniforms.uPointShadowParameters,0.05,this.pointKey[3]||1,s.bias,s.softness*0.5);
  }

  /** Scalar/copyable ownership and freshness data, never borrowed World/GL references. */
  inspect() {
    const s=this.lighting.settings;
    return {mode:s.mode,sunReady:this.sunReady,pointReady:this.pointReady,pointIndex:this.pointReady?this.pointIndex:-1,
      sunResolution:this.sun?.resolution??0,pointResolution:this.point?.resolution??0,
      targetBytes:(this.sun?.bytes??0)+(this.point?.bytes??0),textures:Number(!!this.sun)+Number(!!this.point),
      framebuffers:Number(!!this.sun)+Number(!!this.point),casterOwner:this.casters?`lighting.shadowCasters/${this.casters.world.id}`:null,
      casters:this.casters?.count??0,casterCapacity:this.casters?.capacity??0,casterCpuBytes:this.casters?.cpuBytes??0,casterGpuBytes:this.casters?.gpuBufferBytes??0,frameDraws:this.frameDraws,
      sunUpdates:this.sunUpdates,pointUpdates:this.pointUpdates,pointRefreshHz:s.pointRefreshHz,
      pointAgeMs:this.pointReady?Math.max(0,performance.now()-this.pointAt):null,
      sunFailure:this.sunFailure,pointFailure:this.pointFailure,
      accounting:'Estimated depth24 storage budgeted at four bytes/texel; default framebuffer and driver overhead excluded. Caster buffers are included in renderer buffer totals.'};
  }

  /** No borrowed world survives a clear, travel, disposal or last active scene removal. */
  clearWorld() {
    this.sourceBatch=null;const casters=this.casters;this.casters=null;casters?.dispose();
    this.sunVersion=this.pointVersion=-1;this.sunReady=this.pointReady=false;
  }

  /** Source disposal must remove its borrowed caster copy even if no further frame runs. */
  releaseSource(batch) {if(this.sourceBatch===batch)this.clearWorld();}

  /** Lost handles are browser-owned; retained caster CPU data is restored with other batches. */
  invalidate() {this.sun=this.point=this.program=this.matrixUniform=null;this.sunFailure=this.pointFailure=null;this.sunReady=this.pointReady=false;}

  /** Release all optional resources, including the bounded caster batch. */
  release() {
    this.clearWorld();this.sun?.dispose();this.point?.dispose();this.sun=this.point=null;
    if(this.program){this.gl.deleteProgram(this.program);this.renderer.stats.programs--;}
    this.program=this.matrixUniform=null;
  }

  /** Idempotent renderer-owned cleanup; no game world or resource lease is disposed here. */
  dispose() {if(this.disposed)return;this.disposed=true;this.release();}
}
