/**
 * Basement / renderer: WebGL 2 instancing with owned GPU batches and retained storage.
 * Cube geometry/program belong to the renderer; each world batch belongs to a lease.
 * Lit record: 24 floats (96 bytes): pose, dimensions, base colour/highlight, quaternion, emission RGB/sharpness, specular RGB/reflectivity. Shadow records remain 16 floats (64 bytes), independent of materials.
 * Only changed contiguous instance ranges are uploaded after the initial allocation.
 * Three kinds of geometry share those records: unit boxes (pose.w = 0), rounded tapered
 * capsules (pose.w > 0, rounded-shapes.js) and meshes (pose.w < 0, skinning.js). Each batch
 * keeps one stream per primitive and one per mesh it draws; the rounded stream, the
 * renderer's rounded mesh, mesh streams and the joint palette are allocated only when a
 * world first contains one, and mesh streams/palettes are freed when it no longer does.
 */
import { VERTEX, FRAGMENT } from './shaders.js';
import { Lifetime } from './lifetime.js';
import { renderDiagnostics } from './render-diagnostics.js';
import { GpuTimer } from './gpu-timer.js';
import { createProgram } from './gl-program.js';
import { AmbientOcclusion } from './ambient-occlusion.js';
import { Lighting } from './lighting.js';
import { LineRendering } from './lines.js';
import { Presentation } from './presentation.js';
import { Bloom } from './bloom.js';
import { Camera } from './camera.js';
import { roundedGeometry, packRoundedLane, packTaperLane, roundedReach } from './rounded-shapes.js';
import { GpuMesh } from './gpu-mesh.js';
import { MESH_STRIDE } from './mesh.js';
import { JointPalette, configurePaletteSampler } from './skinning.js';

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
  constructor(canvas, { pixelRatio = 1.5, profiler = null, occlusion = {}, lighting = {}, bloom = {}, presentation = {} } = {}) {
    this.profiler=profiler; this.canvas = canvas; this.pixelRatio = pixelRatio; this.life = new Lifetime();
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('ETRNLNINE requires WebGL 2 on this device.');
    this.gl = gl; this.batches = new Set(); this.meshes = new Set(); this.disposed = false; this.lost = false;
    this.camera = new Camera();
    // jointPalettes counts live joint-palette textures (skinning.js); other passes report
    // their own textures through inspect().
    this.stats = { draws: 0, instances: 0, uploads: 0, uploadedBytes: 0, buffers: 0, programs: 0, vaos: 0, jointPalettes: 0, contextRestores: 0 };
    this.totals={draws:0,instances:0,uploads:0,uploadedBytes:0,candidates:0,culled:0,shadowDraws:0,shadowHits:0};
    try {
      this.initialize();
      this.lines=new LineRendering(this);
      this.lighting=new Lighting(this,lighting);
      this.shadowScope=profiler?.scope('renderer.shadows');
      this.lineScope=profiler?.scope('renderer.lines');
      this.occlusion=new AmbientOcclusion(this,occlusion);
      this.occlusionScope=profiler?.scope('renderer.ambientOcclusion');
      this.presentation=new Presentation(this,presentation);this.presentationScope=profiler?.scope('renderer.presentation');
      this.bloom=new Bloom(this,bloom);this.bloomScope=profiler?.scope('renderer.bloom');
      this.gpuTimer=new GpuTimer(gl,(id,ms)=>this.profiler?.recordGpu(id,ms));
      this.life.own(renderDiagnostics(this,profiler));
      this.life.listen(canvas, 'webglcontextlost', event => {
        event.preventDefault(); this.lost = true; this.gpuTimer.invalidate(); this.lines.invalidate(); this.occlusion.invalidate(); this.lighting.invalidate();this.bloom.invalidate();this.presentation.invalidate();
      });
      this.life.listen(canvas, 'webglcontextrestored', () => {
        // Browser invalidates all old handles on loss. Recreate from retained CPU data,
        // not by restarting the game or adding a second scheduler.
        this.stats.buffers = this.stats.programs = this.stats.vaos = this.stats.jointPalettes = 0;
        this.initialize();
        // Meshes before batches: per-mesh VAOs bind the meshes' new buffers.
        for (const mesh of this.meshes) mesh.initialize();
        for (const batch of this.batches) batch.initialize();
        this.lines.restore();
        this.gpuTimer.restore(); this.stats.contextRestores++; this.lost = false;
      });
    } catch(error) {
      // Metric-budget/capability failure may occur after GL creation. Constructor
      // failure must release real handles even though no caller received this renderer.
      this.life.dispose();this.lines?.dispose();this.gpuTimer?.dispose();this.occlusion?.dispose();this.lighting?.dispose();this.bloom?.dispose();this.presentation?.dispose();
      if(this.cube)gl.deleteBuffer(this.cube);if(this.program)gl.deleteProgram(this.program);
      throw error;
    }
  }

  /** Allocate renderer-owned program/cube. Shaders are freed after linking. */
  initialize() {
    const gl = this.gl;
    const program=createProgram(gl,VERTEX,FRAGMENT);
    this.program = program; this.stats.programs++;
    configurePaletteSampler(gl, program);
    this.uniforms = Object.fromEntries(['uCameraEye','uCameraBack','uPerspective','uLinearOutput','uExposure','uViewProjection','uInverseViewProjection','uBlockerRotation[0]', 'uAmbient', 'uLights[0]', 'uLightColors[0]',
      'uAOMode','uAOStrength','uAORadius','uBlockerCount','uBlockerPose[0]','uBlockerSize[0]',
      'uAOScreen','uAODepth','uAONormals','uAOSize','uSunDirection','uSunColor','uSunShadowEnabled','uSunMatrix',
      'uSunShadow','uShadowParameters','uPointShadowIndex','uPointShadow','uPointShadowParameters','uPointShadowPosition','uPointShadowResolution']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    this.cube = gl.createBuffer(); this.stats.buffers++;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube); gl.bufferData(gl.ARRAY_BUFFER, cubeGeometry(), gl.STATIC_DRAW);
    // Handles from a lost context are already invalid; the mesh is rebuilt on next use.
    this.rounded = null;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  /**
   * Renderer-owned rounded mesh (vertex + index buffer), created the first time any batch
   * holds a rounded shape and kept until disposal or context loss. Worlds made only of
   * boxes never allocate it.
   */
  roundedMesh() {
    if (this.rounded) return this.rounded;
    const gl = this.gl, { vertices, indices } = roundedGeometry();
    const vertexBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    // Element bindings are VAO state, so upload with no VAO bound and bind per stream VAO.
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.stats.buffers += 2;
    return (this.rounded = { vertexBuffer, indexBuffer, count: indices.length });
  }

  /**
   * Allocate a batch with explicit maximums. Capacity is a budget, not silent growth:
   * `capacity` bounds every instance, `meshes` bounds mesh instances (rigid or skinned),
   * which is also the joint-palette row budget.
   */
  createBatch(world, capacity = 2048, {visibility='camera', meshes=32} = {}) {
    if (this.disposed) throw new Error('Renderer is disposed');
    const batch = new InstanceBatch(this, world, capacity, visibility, meshes); this.batches.add(batch); return batch;
  }

  /**
   * Make MeshData (mesh.js) resident on this context. The caller owns the returned mesh
   * and must dispose it; shared meshes are leased through the Directory's MeshLibrary.
   */
  createMesh(data) {
    if (this.disposed) throw new Error('Renderer is disposed');
    const mesh = new GpuMesh(this, data); this.meshes.add(mesh); return mesh;
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
    } finally { if(this.presentation.ready)this.presentation.reset();this.gpuTimer.end(); }
  }

  /** Submit a frame; all worlds use the same retained renderer and accounting path. */
  draw(batch = null) {
    if (this.disposed || this.lost) return;
    this.resize();
    const gl = this.gl; this.view();
    this.stats.draws = this.stats.instances = this.stats.uploads = this.stats.uploadedBytes = 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.presentation.background[0],this.presentation.background[1],this.presentation.background[2],1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!batch || batch.disposed) {this.bloom.ready=false;this.bloom.passes=0;this.presentation.ready=false;this.presentation.passes=0;this.occlusion.count=this.occlusion.candidates=0;this.lighting.clearWorld();return;}
    if (batch.renderer !== this) throw new Error('Batch belongs to another renderer');
    batch.sync();
    const shadowToken=this.profiler?.begin(this.shadowScope);
    try {this.lighting.prepare(batch);}finally {this.profiler?.end(shadowToken);}
    const aoToken=this.profiler?.begin(this.occlusionScope);
    let screenReady;
    try {screenReady=this.occlusion.prepare(batch);}
    finally {this.profiler?.end(aoToken);}
    const presentationToken=this.profiler?.begin(this.presentationScope);
    let hdr;
    try{hdr=this.presentation.prepare(this.bloom.settings.mode!=='off');this.presentation.begin();if(!hdr)this.bloom.deactivate();}finally{this.profiler?.end(presentationToken);}
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.uLinearOutput,hdr?1:0);gl.uniform1f(this.uniforms.uExposure,this.presentation.settings.exposure);
    this.occlusion.bind(this.uniforms,screenReady);
    gl.uniformMatrix4fv(this.uniforms.uViewProjection,false,this.camera.matrix);
    // Perspective uses fragment-to-eye; orthographic rays share the camera back direction.
    gl.uniform3fv(this.uniforms.uCameraEye,this.camera.eye);
    gl.uniform3fv(this.uniforms.uCameraBack,this.camera.back);
    gl.uniform1i(this.uniforms.uPerspective,this.camera.projection==='perspective'?1:0);
    this.lighting.bind(this.uniforms);
    const submissions = batch.draw();
    this.stats.draws += submissions; this.stats.instances += batch.count;
    this.totals.draws += submissions;this.totals.instances+=batch.count;
    if(hdr){
      const resolveToken=this.profiler?.begin(this.presentationScope);try{this.presentation.resolve();}finally{this.profiler?.end(resolveToken);}
      const filterToken=this.profiler?.begin(this.bloomScope);let additive;try{additive=this.bloom.render(this.presentation.targets.scene.texture);}finally{this.profiler?.end(filterToken);}
      const composeToken=this.profiler?.begin(this.presentationScope);try{this.presentation.compose(additive,this.bloom.settings.strength);}finally{this.profiler?.end(composeToken);}
    }
  }

  /** Release renderer and outstanding batches, with listeners removed before late restoration. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.life.dispose(); this.lines.dispose(); this.gpuTimer.dispose(); this.occlusion.dispose(); this.lighting.dispose();this.bloom.dispose();this.presentation.dispose();
    for (const batch of [...this.batches]) batch.dispose();
    // Owners should have released their meshes; free any that remain rather than leak them.
    for (const mesh of [...this.meshes]) mesh.dispose();
    this.gl.deleteBuffer(this.cube); this.gl.deleteProgram(this.program);
    if (this.rounded) { this.gl.deleteBuffer(this.rounded.vertexBuffer); this.gl.deleteBuffer(this.rounded.indexBuffer); this.rounded = null; }
    this.stats.buffers = this.stats.programs = this.stats.vaos = this.stats.jointPalettes = 0;
  }
}

/**
 * One primitive's records inside a batch: retained CPU floats, one dynamic GPU buffer and
 * the VAO that pairs them with the primitive's mesh. Dirty bounds are per stream, so a
 * walking figure re-uploads only its rounded range while static boxes stay untouched.
 * primitive is 'box', 'rounded' or 'mesh'; a mesh stream draws one GpuMesh and holds up
 * to the batch's mesh budget of records.
 */
class InstanceStream {
  constructor(batch, primitive, mesh = null) {
    this.batch = batch; this.primitive = primitive; this.mesh = mesh;
    this.data = new Float32Array((mesh ? batch.meshCapacity : batch.capacity) * batch.recordFloats);
    this.count = 0; this.cursor = 0; this.firstDirty = Infinity; this.lastDirty = -1;
    this.initialize();
  }

  /** Configure the VAO for this primitive's mesh and allocate instance storage once per context. */
  initialize() {
    const r = this.batch.renderer, { gl, stats } = r;
    const mesh = this.primitive === 'rounded' ? r.roundedMesh() : this.mesh;
    this.vao = gl.createVertexArray(); stats.vaos++;
    this.buffer = gl.createBuffer(); stats.buffers++;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh ? mesh.vertexBuffer : r.cube);
    // Boxes and rounded meshes: 6 floats (position/parameters, normal/parameters).
    // Meshes: the 32-byte skinned format of mesh.js, with joints and weights as bytes.
    const stride = this.primitive === 'mesh' ? MESH_STRIDE : 24;
    for (let i = 0; i < 2; i++) {
      gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, stride, i * 12);
    }
    if (this.primitive === 'mesh') {
      gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.UNSIGNED_BYTE, false, stride, 24);
      gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 4, gl.UNSIGNED_BYTE, true, stride, 28);
    }
    if (mesh) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const floats = this.batch.recordFloats;
    for (let i = 0; i < floats / 4; i++) {
      const location = i + 2;
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, floats*4, i * 16);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null); this.forceUpload = true;
  }

  /** Start a packing pass; previous contents stay for exact-value comparison. */
  begin() { this.cursor = 0; this.firstDirty = Infinity; this.lastDirty = -1; }

  /** Append one float, tracking dirty bounds without allocating a closure. */
  write(value) {
    const f = Math.fround(value), index = this.cursor++;
    if (this.data[index] !== f || this.forceUpload) {
      this.data[index] = f;
      this.firstDirty = Math.min(this.firstDirty, index); this.lastDirty = index;
    }
  }

  /** Upload the changed range; returns whether the packed contents changed at all. */
  finish() {
    const r = this.batch.renderer, gl = r.gl, count = this.cursor / this.batch.recordFloats;
    const changed = count !== this.count || this.lastDirty >= this.firstDirty;
    this.count = count;
    if (this.lastDirty >= this.firstDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      // WebGL 2 source-offset/length overload uploads a range without a new typed-array view.
      gl.bufferSubData(gl.ARRAY_BUFFER, this.firstDirty * 4, this.data, this.firstDirty, this.lastDirty - this.firstDirty + 1);
      const bytes = (this.lastDirty - this.firstDirty + 1) * 4;
      r.stats.uploads++; r.stats.uploadedBytes += bytes; r.totals.uploads++; r.totals.uploadedBytes += bytes;
    }
    this.forceUpload = false;
    return changed;
  }

  /** Issue this stream's instanced draw with whatever program the caller bound. */
  draw() {
    if (!this.count) return 0;
    const r = this.batch.renderer, gl = r.gl;
    gl.bindVertexArray(this.vao);
    if (this.primitive === 'rounded') gl.drawElementsInstanced(gl.TRIANGLES, r.rounded.count, gl.UNSIGNED_SHORT, 0, this.count);
    else if (this.primitive === 'mesh') gl.drawElementsInstanced(gl.TRIANGLES, this.mesh.count, this.mesh.indexType, 0, this.count);
    else gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.count);
    return 1;
  }

  /** Release GL handles and CPU storage exactly once. */
  dispose() {
    const { gl, stats } = this.batch.renderer;
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao);
    stats.buffers--; stats.vaos--; this.data = null;
  }
}

/**
 * One world batch, independently owned/disposable through Directory.acquire().
 * This first renderer performs conservative view culling, not a full spatial grid.
 * Future spatial query output can replace this small-world scan through the same contract.
 * Capacity bounds boxes, rounded shapes and meshes together: it is the world's instance
 * budget. `meshCapacity` separately bounds mesh instances and joint-palette rows.
 *
 * Mesh entities carry `shape.mesh` (a GpuMesh this renderer made) and, when the mesh is
 * skinned, `entity.skin` (a SkeletonPose of the mesh's skeleton). The batch borrows both
 * only for the frame: a stream whose mesh no longer appears is freed on the next sync.
 */
class InstanceBatch {
  /** Retain bounded CPU records so context restoration never depends on Canvas assets. */
  constructor(renderer, world, capacity, visibility, meshCapacity) {
    if(!['camera','shadow'].includes(visibility))throw new RangeError('Invalid instance visibility policy');
    if(!Number.isInteger(meshCapacity)||meshCapacity<1||meshCapacity>256)throw new RangeError('Mesh budget must be 1–256 instances');
    this.visibility=visibility;this.version=0;
    this.renderer = renderer; this.world = world; this.capacity = capacity; this.meshCapacity = meshCapacity;
    this.kind=visibility==='shadow'?'shadow-instance-buffer':'instance-buffer';
    this.recordFloats=visibility==='camera'?24:16;
    this.count = 0; this.meshCount = 0; this.disposed = false;
    this.box = null; this.rounded = null; this.meshes = new Map(); this.palette = null;
    this.initialize();
  }

  /** Byte budgets: each stream reserves its whole capacity, since the mix can change. */
  get cpuBytes() {
    let bytes = (this.box?.data.byteLength ?? 0) + (this.rounded?.data.byteLength ?? 0);
    for (const stream of this.meshes.values()) bytes += stream.data.byteLength;
    return bytes + (this.palette?.bytes ?? 0);
  }
  /** Instance buffers only; the palette is a texture (paletteBytes), not a buffer. */
  get gpuBufferBytes() { return this.cpuBytes - this.paletteBytes; }
  /** Estimated RGBA32F joint-palette texture storage. */
  get paletteBytes() { return this.palette?.bytes ?? 0; }
  /** The box stream's VAO and retained records, kept for diagnostics and tests that
   * predate rounded shapes. Rounded records live in `rounded.data` when present. */
  get vao() { return this.box?.vao ?? null; }
  get data() { return this.box?.data ?? null; }

  /** (Re)create GPU state for the streams this batch already uses, e.g. after context restore. */
  initialize() {
    if (this.box) this.box.initialize(); else this.box = new InstanceStream(this, 'box');
    this.rounded?.initialize();
    // A mesh disposed since the last sync has no buffers to bind; its stream's old handles
    // died with the lost context, so forgetting it releases everything it held.
    for (const [mesh, stream] of this.meshes) {
      if (mesh.disposed) { this.meshes.delete(mesh); stream.data = null; }
      else stream.initialize();
    }
    this.palette?.initialize();
  }

  /**
   * Pack visible transforms/materials into retained records; compare Float32 values to
   * avoid treating harmless double-to-float rounding as a perpetual dirty upload.
   */
  sync() {
    const r = this.renderer, camera = this.visibility === 'camera';
    this.box.begin(); this.rounded?.begin();
    for (const stream of this.meshes.values()) stream.begin();
    let total = 0, meshes = 0, rows = 0, paletteChanged = false;
    for (const entity of this.world.entities.values()) {
      const s = entity.shape, p = entity.pose;
      if (!s || p.visible===false || (this.visibility==='shadow'&&s.castShadow===false)) continue;
      r.totals.candidates++;
      const profile = s.rounded ?? null, mesh = s.mesh ?? null;
      if (mesh && (mesh.disposed || mesh.renderer !== r)) throw new Error(`World ${this.world.id} draws a mesh that is disposed or belongs to another renderer`);
      // Sphere is conservative under any orientation and any pose (mesh.reach bounds every
      // rotation-only pose). Shadow membership ignores the lens.
      const radius = mesh ? mesh.reach*Math.max(...s.size)*p.scale : Math.hypot(...s.size)*p.scale*(profile ? roundedReach(profile) : 1);
      if (camera&&!r.camera.sphereVisible(p.x,p.y,p.z,radius)) {r.totals.culled++;continue;}
      if (++total > this.capacity) throw new Error(`World ${this.world.id} exceeds ${this.capacity} ${this.visibility} instances`);
      let out, lane = 0, profileLane = 0;
      if (mesh) {
        if (++meshes > this.meshCapacity) throw new Error(`World ${this.world.id} exceeds ${this.meshCapacity} ${this.visibility} mesh instances`);
        out = this.meshes.get(mesh);
        if (!out) { out = new InstanceStream(this, 'mesh', mesh); out.begin(); this.meshes.set(mesh, out); }
        lane = -1;
        if (mesh.skinned) {
          const skin = entity.skin;
          if (!skin || skin.skeleton !== mesh.skeleton) throw new Error(`Entity ${entity.id} needs a SkeletonPose of its mesh's skeleton`);
          this.palette ??= new JointPalette(this, this.meshCapacity);
          if (this.palette.write(rows, skin.palette)) paletteChanged = true;
          lane = -(rows++ + 2);
        }
      } else if (profile) {
        out = (this.rounded ??= new InstanceStream(this, 'rounded'));
        lane = packTaperLane(profile); profileLane = packRoundedLane(profile);
      } else out = this.box;
      // pose.w selects the primitive (0 box, > 0 rounded profile, < 0 mesh/palette row) and
      // size.w carries the rounded profile; see rounded-shapes.js and skinning.js.
      out.write(p.x); out.write(p.y); out.write(p.z); out.write(lane);
      out.write(s.size[0]*p.scale); out.write(s.size[1]*p.scale); out.write(s.size[2]*p.scale);
      out.write(profileLane);
      // Depth-only records ignore material changes, so recoloring does not invalidate maps.
      for(let i=0;i<3;i++)out.write(camera?s.material.baseColor[i]:0);
      out.write(camera?(entity.highlight??0):0);for(let i=0;i<4;i++)out.write(p.rotation[i]);
      if(camera){for(let i=0;i<3;i++)out.write(s.material.emissionColor[i]*s.material.emissionStrength);out.write(s.material.specularSharpness);for(let i=0;i<3;i++)out.write(s.material.specularColor[i]);out.write(s.material.reflectivity);}
    }
    let changed = this.box.finish();
    if (this.rounded?.finish()) changed = true;
    for (const [mesh, stream] of this.meshes) {
      if (stream.finish()) changed = true;
      // Drop streams for meshes this world no longer draws, so no disposed mesh is borrowed.
      if (!stream.count) { stream.dispose(); this.meshes.delete(mesh); }
    }
    if (rows) this.palette.upload();
    else if (this.palette) { this.palette.dispose(); this.palette = null; }
    if (changed || paletteChanged || this.count !== total) this.version++;
    this.count = total; this.meshCount = meshes;
  }

  /**
   * Draw every non-empty stream with the program the caller bound (lit, depth or normals).
   * Returns the number of submissions so passes can account for them honestly.
   */
  draw() {
    const gl = this.renderer.gl;
    let submissions = this.box.draw() + (this.rounded ? this.rounded.draw() : 0);
    if (this.meshes.size) {
      this.palette?.bind();
      for (const stream of this.meshes.values()) submissions += stream.draw();
    }
    gl.bindVertexArray(null);
    return submissions;
  }

  /** Remove the batch from its renderer and release actual GL handles exactly once. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.box.dispose(); this.rounded?.dispose();
    for (const stream of this.meshes.values()) stream.dispose();
    this.palette?.dispose();
    this.renderer.batches.delete(this);
    this.renderer.lighting?.releaseBatch(this);
    // Disposal releases CPU storage too, even if a caller retains the old handle.
    this.box = this.rounded = this.palette = null; this.meshes.clear(); this.world = null;
  }
}
