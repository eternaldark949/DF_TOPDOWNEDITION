/**
 * Basement / renderer: WebGL 2 instancing with owned GPU batches and retained storage.
 * Cube geometry/program belong to the renderer; each world batch belongs to a lease.
 * 16 float instance record: position/pad, dimensions/emission, color/highlight, quaternion.
 * Only changed contiguous instance ranges are uploaded after the initial allocation.
 */
import { VERTEX, FRAGMENT } from './shaders.js';
import { Lifetime } from './lifetime.js';
import { renderDiagnostics } from './render-diagnostics.js';
import { GpuTimer } from './gpu-timer.js';
import { createProgram } from './gl-program.js';
import { AmbientOcclusion } from './ambient-occlusion.js';
import { Lighting } from './lighting.js';
import { LineRendering } from './lines.js';
import { Camera } from './camera.js';

/** Generate one unit cube with flat normals; uploaded once per WebGL context lifetime. */
function cubeGeometry() {
  const result = [];
  // Each face is a normal plus four counter-clockwise corners. Culling is disabled
  // initially, so normal/light correctness does not depend on the camera hemisphere.
  const faces = [
    [[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[0,0,-1],[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]],
    [[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],
    [[0,1,0],[1,1,-1],[-1,1,-1],[-1,1,1],[1,1,1]],
    [[-1,0,0],[-1,1,-1],[-1,-1,-1],[-1,-1,1],[-1,1,1]],
    [[1,0,0],[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]],
  ];
  for (const [normal, ...corners] of faces) {
    for (const index of [0,1,2,0,2,3]) result.push(...corners[index].map(n => n * 0.5), ...normal);
  }
  return new Float32Array(result);
}

export class Renderer {
  /** Own the supplied surface's WebGL context. pixelRatio caps mobile fill cost. */
  constructor(canvas, { pixelRatio = 1.5, profiler = null, occlusion = {}, lighting = {} } = {}) {
    this.profiler=profiler; this.canvas = canvas; this.pixelRatio = pixelRatio; this.life = new Lifetime();
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('ETRNLNINE requires WebGL 2 on this device.');
    this.gl = gl; this.batches = new Set(); this.disposed = false; this.lost = false;
    this.camera = new Camera();
    this.stats = { draws: 0, instances: 0, uploads: 0, uploadedBytes: 0, buffers: 0, programs: 0, vaos: 0, contextRestores: 0 };
    this.totals={draws:0,instances:0,uploads:0,uploadedBytes:0,candidates:0,culled:0,shadowDraws:0,shadowHits:0};
    try {
      this.initialize();
      this.lines=new LineRendering(this);
      this.lighting=new Lighting(this,lighting);
      this.shadowScope=profiler?.scope('renderer.shadows');
      this.lineScope=profiler?.scope('renderer.lines');
      this.occlusion=new AmbientOcclusion(this,occlusion);
      this.occlusionScope=profiler?.scope('renderer.ambientOcclusion');
      this.gpuTimer=new GpuTimer(gl,(id,ms)=>this.profiler?.recordGpu(id,ms));
      this.life.own(renderDiagnostics(this,profiler));
      this.life.listen(canvas, 'webglcontextlost', event => {
        event.preventDefault(); this.lost = true; this.gpuTimer.invalidate(); this.lines.invalidate(); this.occlusion.invalidate(); this.lighting.invalidate();
      });
      this.life.listen(canvas, 'webglcontextrestored', () => {
        // Browser invalidates all old handles on loss. Recreate from retained CPU data,
        // not by restarting the game or adding a second scheduler.
        this.stats.buffers = this.stats.programs = this.stats.vaos = 0;
        this.initialize();
        for (const batch of this.batches) batch.initialize();
        this.lines.restore();
        this.gpuTimer.restore(); this.stats.contextRestores++; this.lost = false;
      });
    } catch(error) {
      // Metric-budget/capability failure may occur after GL creation. Constructor
      // failure must release real handles even though no caller received this renderer.
      this.life.dispose();this.lines?.dispose();this.gpuTimer?.dispose();this.occlusion?.dispose();this.lighting?.dispose();
      if(this.cube)gl.deleteBuffer(this.cube);if(this.program)gl.deleteProgram(this.program);
      throw error;
    }
  }

  /** Allocate renderer-owned program/cube. Shaders are freed after linking. */
  initialize() {
    const gl = this.gl;
    const program=createProgram(gl,VERTEX,FRAGMENT);
    this.program = program; this.stats.programs++;
    this.uniforms = Object.fromEntries(['uViewProjection','uInverseViewProjection','uBlockerRotation[0]', 'uAmbient', 'uLights[0]', 'uLightColors[0]',
      'uAOMode','uAOStrength','uAORadius','uBlockerCount','uBlockerPose[0]','uBlockerSize[0]',
      'uAOScreen','uAODepth','uAONormals','uAOSize','uSunDirection','uSunColor','uSunShadowEnabled','uSunMatrix',
      'uSunShadow','uShadowParameters','uPointShadowIndex','uPointShadow','uPointShadowParameters','uPointShadowPosition','uPointShadowResolution']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    this.cube = gl.createBuffer(); this.stats.buffers++;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube); gl.bufferData(gl.ARRAY_BUFFER, cubeGeometry(), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  /** Allocate a batch with an explicit maximum. Capacity is a budget, not silent growth. */
  createBatch(world, capacity = 2048, {visibility='camera'} = {}) {
    if (this.disposed) throw new Error('Renderer is disposed');
    const batch = new InstanceBatch(this, world, capacity, visibility); this.batches.add(batch); return batch;
  }

  /**
   * Prepare a world's retained GPU data before it becomes an active destination.
   * Content loaders use this public contract rather than manipulating GL buffers.
   * Camera-specific culling is refreshed again on render; the underlying geometry is resident.
   */
  prepare(batch) {
    if (this.disposed || this.lost) throw new Error('GPU is not ready for world preparation');
    if (batch.renderer !== this || batch.disposed) throw new Error('Invalid preparation batch');
    this.resize(); batch.world.resolve();
    this.view(); batch.sync();
  }

  /** Resize backing pixels only when necessary. CSS layout belongs to the application. */
  resize() {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, this.pixelRatio);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
  }

  /** Compute view dimensions in world units; the same projection is exposed to mouse aiming. */
  view() {
    this.camera.update(this.canvas.width/this.canvas.height);
    const halfHeight = this.camera.focusHalfHeight;
    return { halfWidth: halfHeight * this.canvas.width / this.canvas.height, halfHeight };
  }

  /** Convert surface CSS coordinates to the ground plane (z=0), without hidden game state. */
  groundPoint(x, y, target = {}) {
    const point=this.camera.ground(x,y,this.canvas.clientWidth,this.canvas.clientHeight);
    if(point)Object.assign(target,point);
    return target;
  }

  /** Clear even an empty engine; present a batch only if supplied and its context is valid. */
  render(batch = null, layers = []) {
    if(this.disposed||this.lost)return;
    this.gpuTimer.configure(this.profiler?.recording&&this.profiler.gpuEnabled);
    this.gpuTimer.poll();this.gpuTimer.begin(this.profiler?.current?.id??0);
    try {
      this.draw(batch);
      const token=layers.length?this.profiler?.begin(this.lineScope):null;
      try{for(const layer of layers){if(layer.renderer!==this)throw new Error('Guide belongs to another renderer');layer.draw();}}
      finally{if(layers.length)this.profiler?.end(token);}
    } finally { this.gpuTimer.end(); }
  }

  /** Submit a frame; all worlds use the same retained renderer and accounting path. */
  draw(batch = null) {
    if (this.disposed || this.lost) return;
    this.resize();
    const gl = this.gl; this.view();
    this.stats.draws = this.stats.instances = this.stats.uploads = this.stats.uploadedBytes = 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.018, 0.019, 0.037, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!batch || batch.disposed) {this.occlusion.count=this.occlusion.candidates=0;this.lighting.clearWorld();return;}
    if (batch.renderer !== this) throw new Error('Batch belongs to another renderer');
    batch.sync();
    const shadowToken=this.profiler?.begin(this.shadowScope);
    try {this.lighting.prepare(batch);}finally {this.profiler?.end(shadowToken);}
    const aoToken=this.profiler?.begin(this.occlusionScope);
    let screenReady;
    try {screenReady=this.occlusion.prepare(batch);}
    finally {this.profiler?.end(aoToken);}
    gl.useProgram(this.program);
    this.occlusion.bind(this.uniforms,screenReady);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,this.camera.matrix);
    this.lighting.bind(this.uniforms);
    gl.bindVertexArray(batch.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, batch.count);
    gl.bindVertexArray(null);
    this.stats.draws++; this.stats.instances += batch.count;
    this.totals.draws++;this.totals.instances+=batch.count;
  }

  /** Release renderer and outstanding batches, with listeners removed before late restoration. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.life.dispose(); this.lines.dispose(); this.gpuTimer.dispose(); this.occlusion.dispose(); this.lighting.dispose();
    for (const batch of [...this.batches]) batch.dispose();
    this.gl.deleteBuffer(this.cube); this.gl.deleteProgram(this.program);
    this.stats.buffers = this.stats.programs = this.stats.vaos = 0;
  }
}

/**
 * One world batch, independently owned/disposable through Directory.acquire().
 * This first renderer performs conservative view culling, not a full spatial grid.
 * Future spatial query output can replace this small-world scan through the same contract.
 */
class InstanceBatch {
  /** Retain bounded CPU records so context restoration never depends on Canvas assets. */
  constructor(renderer, world, capacity, visibility) {
    if(!['camera','shadow'].includes(visibility))throw new RangeError('Invalid instance visibility policy');
    this.visibility=visibility;this.version=0;
    this.renderer = renderer; this.world = world; this.capacity = capacity;
    this.data = new Float32Array(capacity * 16);
    this.kind=visibility==='shadow'?'shadow-instance-buffer':'instance-buffer';this.cpuBytes=this.data.byteLength;this.gpuBufferBytes=this.data.byteLength;
    this.count = 0; this.disposed = false;
    this.initialize();
  }

  /** Configure one VAO and dynamic instance buffer; allocate storage once per context. */
  initialize() {
    const { gl, stats, cube } = this.renderer;
    this.vao = gl.createVertexArray(); stats.vaos++;
    this.buffer = gl.createBuffer(); stats.buffers++;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cube);
    for (let i = 0; i < 2; i++) {
      gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 24, i * 12);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      const location = i + 2;
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 64, i * 16);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null); this.forceUpload = true;
  }

  /** Append one float to the retained record, tracking dirty bounds without allocating a closure. */
  write(value) {
    const f = Math.fround(value), index = this.cursor++;
    if (this.data[index] !== f || this.forceUpload) {
      this.data[index] = f;
      this.firstDirty = Math.min(this.firstDirty, index); this.lastDirty = index;
    }
  }

  /**
   * Pack visible transforms/materials into retained records; compare Float32 values to
   * avoid treating harmless double-to-float rounding as a perpetual dirty upload.
   */
  sync() {
    const r = this.renderer, gl = r.gl;
    this.cursor = 0; this.firstDirty = Infinity; this.lastDirty = -1;
    for (const entity of this.world.entities.values()) {
      const s = entity.shape, p = entity.pose;
      if (!s || (this.visibility==='shadow'&&s.castShadow===false)) continue;
      r.totals.candidates++;
      // Sphere is conservative under any orientation. Shadow membership ignores the lens.
      const radius = Math.hypot(...s.size)*p.scale;
      if (this.visibility==='camera'&&!r.camera.sphereVisible(p.x,p.y,p.z,radius)) {r.totals.culled++;continue;}
      if (this.cursor / 16 >= this.capacity) throw new Error(`World ${this.world.id} exceeds ${this.capacity} ${this.visibility} instances`);
      this.write(p.x); this.write(p.y); this.write(p.z); this.write(0);
      this.write(s.size[0]*p.scale); this.write(s.size[1]*p.scale); this.write(s.size[2]*p.scale);
      // Depth-only records ignore material changes, so recoloring does not invalidate maps.
      this.write(this.visibility==='camera'?(s.emission??0):0);
      for(let i=0;i<3;i++)this.write(this.visibility==='camera'?s.color[i]:0);
      this.write(this.visibility==='camera'?(entity.highlight??0):0);for(let i=0;i<4;i++)this.write(p.rotation[i]);
    }
    if(this.count!==this.cursor/16||this.lastDirty>=this.firstDirty)this.version++;
    this.count = this.cursor / 16;
    if (this.lastDirty >= this.firstDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      // WebGL 2 source-offset/length overload uploads a range without a new typed-array view.
      gl.bufferSubData(gl.ARRAY_BUFFER, this.firstDirty * 4, this.data, this.firstDirty, this.lastDirty - this.firstDirty + 1);
      r.stats.uploads++; r.stats.uploadedBytes += (this.lastDirty - this.firstDirty + 1) * 4;
      r.totals.uploads++;r.totals.uploadedBytes+=(this.lastDirty-this.firstDirty+1)*4;
    }
    this.forceUpload = false;
  }

  /** Remove the batch from its renderer and release actual GL handles exactly once. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const { gl, stats } = this.renderer;
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao);
    stats.buffers--; stats.vaos--; this.renderer.batches.delete(this);
    this.renderer.lighting?.releaseBatch(this);
    // Disposal releases CPU storage too, even if a caller retains the old handle.
    this.data = null; this.world = null; this.cpuBytes=this.gpuBufferBytes=0;
  }
}
