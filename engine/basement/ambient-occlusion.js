/**
 * Basement / ambient occlusion: owns bounded proxies, optional GPU targets and settings.
 * No scheduling, world ownership or game policy lives here. Renderer invokes the passes
 * with its existing retained batch. Screen targets are lazy and freed when leaving screen.
 */
import { FULLSCREEN_VERTEX } from './fullscreen-shaders.js';
import { createProgram } from './gl-program.js';
import { VERTEX } from './shaders.js';
import { NORMAL_FRAGMENT,  SSAO_FRAGMENT } from './occlusion-shaders.js';

/** Validate atomically; world lengths and strengths must never become NaN shader uniforms. */
export function occlusionSettings(previous, patch = {}) {
  const next={...previous,...patch};
  if(!['off','geometry','screen'].includes(next.mode))throw new RangeError('AO mode must be off, geometry or screen');
  for(const [key,min,max] of [['strength',0,1],['radius',0.1,4],['resolutionScale',0.25,1],['maxDimension',64,1024]]) {
    if(!Number.isFinite(next[key])||next[key]<min||next[key]>max)throw new RangeError(`AO ${key} must be between ${min} and ${max}`);
  }
  if(!Number.isInteger(next.maxDimension))throw new RangeError('AO maxDimension must be an integer');
  return Object.freeze(next);
}

/** Bound both dimensions together, retaining aspect ratio and a positive backing size. */
export function occlusionDimensions(width,height,settings) {
  const scale=Math.min(settings.resolutionScale,settings.maxDimension/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export class AmbientOcclusion {
  /** Default geometry tier uses no render targets; caller explicitly chooses screen cost. */
  constructor(renderer,settings={}) {
    this.renderer=renderer;this.gl=renderer.gl;
    this.settings=occlusionSettings({mode:'geometry',strength:0.7,radius:1.25,resolutionScale:0.5,maxDimension:768},settings);
    this.rotations=new Float32Array(48);this.poses=new Float32Array(12*4);this.sizes=new Float32Array(12*4);this.scores=new Float64Array(12);
    this.count=0;this.candidates=0;this.targets=null;this.normalProgram=null;this.screenProgram=null;
    this.failure=null;this.disposed=false;
  }

  /** Configuration is independent of world lifetime. Invalid patches leave current state intact. */
  configure(patch) {
    if(this.disposed)throw new Error('Ambient occlusion is disposed');
    const next=occlusionSettings(this.settings,patch);
    if(next.mode!=='screen'||next.strength===0)this.release();
    this.settings=next;this.failure=null;
  }

  /**
   * Select at most twelve solid OBBs from the active world, including offscreen geometry.
   * Rank by projected footprint and proximity to view center; ties retain insertion order.
   * This bounded scan is a small-world policy. Future shared spatial queries replace the
   * candidate enumeration; it is explicitly not an unbounded per-pixel scene traversal.
   */
  select(world) {
    this.count=this.candidates=0;this.scores.fill(-Infinity);
    if(this.settings.mode==='off'||this.settings.strength===0)return;
    const camera=this.renderer.camera;
    for(const entity of world.entities.values()) {
      const shape=entity.shape,p=entity.pose;
      if(!shape||shape.ambientBlocker===false||Math.min(...shape.size)<0.15)continue;
      const [sx,sy,sz]=shape.size.map(n=>n*p.scale);
      if(p.z+sz/2<=0.05)continue; // The ground slab must not consume the blocker budget.
      this.candidates++;
      const distance=Math.hypot(Math.max(0,Math.abs(p.x-camera.x)-sx/2),Math.max(0,Math.abs(p.y-camera.y)-sy/2));
      const score=Math.sqrt(sx*sy+sx*sz+sy*sz)/(1+distance);
      let slot=this.count;
      while(slot>0&&score>this.scores[slot-1])slot--;
      if(slot>=12)continue;
      const end=Math.min(this.count,11);
      for(let i=end;i>slot;i--){
        this.scores[i]=this.scores[i-1];this.rotations.copyWithin(i*4,(i-1)*4,i*4);
        this.poses.copyWithin(i*4,(i-1)*4,i*4);this.sizes.copyWithin(i*4,(i-1)*4,i*4);
      }
      this.scores[slot]=score;this.rotations.set(p.rotation,slot*4);
      this.poses[slot*4]=p.x;this.poses[slot*4+1]=p.y;this.poses[slot*4+2]=p.z;this.poses[slot*4+3]=0;
      this.sizes[slot*4]=sx/2;this.sizes[slot*4+1]=sy/2;this.sizes[slot*4+2]=sz/2;this.sizes[slot*4+3]=0;
      this.count=Math.min(12,this.count+1);
    }
  }

  /** Allocate standard WebGL2 formats only; no float-color or external extension required. */
  ensure(width,height) {
    if(this.failure)return false; // Retry only after explicit configuration or context restoration.
    const gl=this.gl,dimensions=occlusionDimensions(width,height,this.settings);
    if(this.targets?.width===dimensions.width&&this.targets?.height===dimensions.height)return true;
    this.releaseTargets();
    const target={...dimensions,textures:[],framebuffers:[]};this.targets=target;
    try {
      if(!this.normalProgram){this.normalProgram=createProgram(gl,VERTEX,NORMAL_FRAGMENT);this.renderer.stats.programs++;}
      if(!this.screenProgram){this.screenProgram=createProgram(gl,FULLSCREEN_VERTEX,SSAO_FRAGMENT);this.renderer.stats.programs++;}
      this.normalCamera=gl.getUniformLocation(this.normalProgram,'uViewProjection');
      this.screenUniforms=Object.fromEntries(['uRadius','uDepth','uNormals','uInverseViewProjection','uViewProjection','uProjectionScale'].map(n=>[n,gl.getUniformLocation(this.screenProgram,n)]));
      /** Create immutable single-level storage; nearest sampling avoids depth interpolation. */
      const texture=(format)=>{
        const handle=gl.createTexture();if(!handle)throw new Error('AO texture allocation failed');
        target.textures.push(handle);gl.bindTexture(gl.TEXTURE_2D,handle);
        gl.texStorage2D(gl.TEXTURE_2D,1,format,target.width,target.height);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        return handle;
      };
      target.normal=texture(gl.RGBA8);target.depth=texture(gl.DEPTH_COMPONENT24);target.ao=texture(gl.R8);
      for(const [color,depth]of [[target.normal,target.depth],[target.ao,null]]) {
        const fbo=gl.createFramebuffer();if(!fbo)throw new Error('AO framebuffer allocation failed');
        target.framebuffers.push(fbo);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
        if(depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('AO framebuffer unavailable');
      }
      this.failure=null;return true;
    } catch(error) {
      this.failure=error.message;this.release();return false; // Preserve usable geometry tier.
    } finally {gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);}
  }

  /** Bind a sampler without retaining borrowed framebuffer state between renderer passes. */
  texture(unit,handle) {const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,handle);}

  /** Render normal/depth and AO using the already-synchronized instance batch. */
  prepare(batch) {
    this.select(batch.world);
    if(this.settings.mode!=='screen'||this.settings.strength===0||!this.ensure(this.renderer.canvas.width,this.renderer.canvas.height))return false;
    const gl=this.gl,t=this.targets,r=this.renderer;
    gl.viewport(0,0,t.width,t.height);gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffers[0]);
    gl.enable(gl.DEPTH_TEST);gl.clearColor(0.5,0.5,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.normalProgram);gl.uniformMatrix4fv(this.normalCamera,false,r.camera.matrix);
    gl.bindVertexArray(batch.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,36,batch.count);gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffers[1]);gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.screenProgram);this.texture(0,t.depth);this.texture(1,t.normal);
    gl.uniform1i(this.screenUniforms.uDepth,0);gl.uniform1i(this.screenUniforms.uNormals,1);
    gl.uniformMatrix4fv(this.screenUniforms.uInverseViewProjection,false,r.camera.inverse);
    gl.uniformMatrix4fv(this.screenUniforms.uViewProjection,false,r.camera.matrix);
    gl.uniform2fv(this.screenUniforms.uProjectionScale,r.camera.projectionScale);
    gl.uniform1f(this.screenUniforms.uRadius,this.settings.radius);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DEPTH_TEST);
    gl.viewport(0,0,r.canvas.width,r.canvas.height);
    // Count both submissions, but only the geometry pass submits world instances.
    r.stats.draws+=2;r.totals.draws+=2;r.stats.instances+=batch.count;r.totals.instances+=batch.count;
    return true;
  }

  /** Supply ambient-only material parameters; direct and emissive terms never sample AO. */
  bind(uniforms,screenReady) {
    const gl=this.gl,s=this.settings;
    gl.uniform1i(uniforms.uAOMode,s.mode==='off'?0:screenReady?2:1);
    gl.uniform1f(uniforms.uAOStrength,s.strength);gl.uniform1f(uniforms.uAORadius,s.radius);
    gl.uniformMatrix4fv(uniforms.uInverseViewProjection,false,this.renderer.camera.inverse);
    gl.uniform4fv(uniforms['uBlockerRotation[0]'],this.rotations);
    gl.uniform1i(uniforms.uBlockerCount,this.count);gl.uniform4fv(uniforms['uBlockerPose[0]'],this.poses);gl.uniform4fv(uniforms['uBlockerSize[0]'],this.sizes);
    if(screenReady){
      this.texture(0,this.targets.ao);this.texture(1,this.targets.depth);this.texture(2,this.targets.normal);
      gl.uniform1i(uniforms.uAOScreen,0);gl.uniform1i(uniforms.uAODepth,1);gl.uniform1i(uniforms.uAONormals,2);
      gl.uniform2f(uniforms.uAOSize,this.renderer.canvas.width,this.renderer.canvas.height);
    }
  }

  /** Estimated target bytes use a four-byte depth budget; actual driver allocation is unknown. */
  inspect() {
    return {requestedMode:this.settings.mode,effectiveMode:this.settings.strength===0||this.settings.mode==='off'?'off':this.targets?'screen':'geometry',
      strength:this.settings.strength,radius:this.settings.radius,blockers:this.count,candidates:this.candidates,blockerBudget:12,
      width:this.targets?.width??0,height:this.targets?.height??0,textures:this.targets?.textures.length??0,
      framebuffers:this.targets?.framebuffers.length??0,targetBytes:(this.targets?.width??0)*(this.targets?.height??0)*9,
      failure:this.failure,accounting:'Estimated target storage: normal RGBA8 (4), depth24 budgeted at 4, AO R8 (1) bytes per pixel. Actual depth padding and driver overhead are unknown.'};
  }

  /** Invalidate lost handles without deleting them; the browser owns lost-context reclamation. */
  invalidate() {this.targets=null;this.normalProgram=this.screenProgram=null;this.failure=null;}

  /** Reallocate only viewport-dependent targets on resize; retain compiled shader programs. */
  releaseTargets() {
    const gl=this.gl;
    if(this.targets){for(const fbo of this.targets.framebuffers)gl.deleteFramebuffer(fbo);for(const texture of this.targets.textures)gl.deleteTexture(texture);}
    this.targets=null;
  }

  /** Delete in dependency order. No live target or program remains after disabling screen AO. */
  release() {
    const gl=this.gl;
    this.releaseTargets();
    for(const program of [this.normalProgram,this.screenProgram])if(program){gl.deleteProgram(program);this.renderer.stats.programs--;}
    this.normalProgram=this.screenProgram=null;
  }

  /** Release all owned GPU and CPU storage; caller may keep a harmless disposed handle. */
  dispose() {if(this.disposed)return;this.disposed=true;this.release();this.poses=this.sizes=this.scores=this.rotations=null;this.count=this.candidates=0;}
}
