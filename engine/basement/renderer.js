/**
 * Basement / renderer: WebGL 2 instancing with owned GPU batches and retained storage.
 * Cube geometry/program belong to the renderer; each world batch belongs to a lease.
 * 12 float instance record: [x,y,z,yaw, sizeX,sizeY,sizeZ,emission, red,green,blue,0].
 * Only changed contiguous instance ranges are uploaded after the initial allocation.
 */
import { VERTEX, FRAGMENT } from './shaders.js';
import { Lifetime } from './lifetime.js';

/** Compile one stage; include the driver log and delete failed handles immediately. */
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation: ${message}`);
  }
  return shader;
}

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
  constructor(canvas, { pixelRatio = 1.5 } = {}) {
    this.canvas = canvas; this.pixelRatio = pixelRatio; this.life = new Lifetime();
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('ETRNLNINE requires WebGL 2 on this device.');
    this.gl = gl; this.batches = new Set(); this.disposed = false; this.lost = false;
    this.camera = { x: 0, y: 0, halfHeight: 21 };
    this.ambient = new Float32Array([0.13, 0.13, 0.23]);
    this.lights = new Float32Array(8 * 4); this.lightColors = new Float32Array(8 * 3);
    this.stats = { draws: 0, instances: 0, uploads: 0, uploadedBytes: 0, buffers: 0, programs: 0, vaos: 0, contextRestores: 0 };
    this.initialize();
    this.life.listen(canvas, 'webglcontextlost', event => {
      event.preventDefault(); this.lost = true;
    });
    this.life.listen(canvas, 'webglcontextrestored', () => {
      // Browser invalidates all old handles on loss. Recreate from retained CPU data,
      // not by restarting the game or adding a second scheduler.
      this.stats.buffers = this.stats.programs = this.stats.vaos = 0;
      this.initialize();
      for (const batch of this.batches) batch.initialize();
      this.stats.contextRestores++; this.lost = false;
    });
  }

  /** Allocate renderer-owned program/cube. Shaders are freed after linking. */
  initialize() {
    const gl = this.gl;
    let vertex, fragment, program;
    try {
      vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (error) {
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    }
    this.program = program; this.stats.programs++;
    this.uniforms = Object.fromEntries(['uCamera', 'uAmbient', 'uLights[0]', 'uLightColors[0]']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    this.cube = gl.createBuffer(); this.stats.buffers++;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube); gl.bufferData(gl.ARRAY_BUFFER, cubeGeometry(), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  /** Allocate a batch with an explicit maximum. Capacity is a budget, not silent growth. */
  createBatch(world, capacity = 2048) {
    if (this.disposed) throw new Error('Renderer is disposed');
    const batch = new InstanceBatch(this, world, capacity); this.batches.add(batch); return batch;
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
    const view = this.view(); batch.sync(view.halfWidth, view.halfHeight);
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
    const halfHeight = this.camera.halfHeight;
    return { halfWidth: halfHeight * this.canvas.width / this.canvas.height, halfHeight };
  }

  /** Convert surface CSS coordinates to the ground plane (z=0), without hidden game state. */
  groundPoint(x, y, target = {}) {
    const { halfWidth, halfHeight } = this.view();
    target.x = this.camera.x + (x / this.canvas.clientWidth * 2 - 1) * halfWidth;
    target.y = this.camera.y + (1 - y / this.canvas.clientHeight * 2) * halfHeight / 0.65;
    return target;
  }

  /** Clear even an empty engine; present a batch only if supplied and its context is valid. */
  render(batch = null) {
    if (this.disposed || this.lost) return;
    this.resize();
    const gl = this.gl, { halfWidth, halfHeight } = this.view();
    this.stats.draws = this.stats.instances = this.stats.uploads = this.stats.uploadedBytes = 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.018, 0.019, 0.037, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!batch || batch.disposed) return;
    if (batch.renderer !== this) throw new Error('Batch belongs to another renderer');
    gl.useProgram(this.program);
    gl.uniform4f(this.uniforms.uCamera, this.camera.x, this.camera.y, halfWidth, halfHeight);
    gl.uniform3fv(this.uniforms.uAmbient, this.ambient);
    gl.uniform4fv(this.uniforms['uLights[0]'], this.lights);
    gl.uniform3fv(this.uniforms['uLightColors[0]'], this.lightColors);
    batch.sync(halfWidth, halfHeight);
    gl.bindVertexArray(batch.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, batch.count);
    gl.bindVertexArray(null);
    this.stats.draws = 1; this.stats.instances = batch.count;
  }

  /** Release renderer and outstanding batches, with listeners removed before late restoration. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.life.dispose();
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
  constructor(renderer, world, capacity) {
    this.renderer = renderer; this.world = world; this.capacity = capacity;
    this.data = new Float32Array(capacity * 12); this.count = 0; this.disposed = false;
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
    for (let i = 0; i < 3; i++) {
      const location = i + 2;
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 48, i * 16);
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
  sync(halfWidth, halfHeight) {
    const r = this.renderer, gl = r.gl;
    this.cursor = 0; this.firstDirty = Infinity; this.lastDirty = -1;
    for (const entity of this.world.entities.values()) {
      const s = entity.shape, p = entity.pose;
      if (!s) continue;
      const radius = Math.hypot(s.size[0], s.size[1], s.size[2]);
      const screenY = (p.y - r.camera.y) * 0.65 + p.z * 0.76;
      if (Math.abs(p.x - r.camera.x) > halfWidth + radius || Math.abs(screenY) > halfHeight + radius) continue;
      if (this.cursor / 12 >= this.capacity) throw new Error(`World ${this.world.id} exceeds ${this.capacity} visible instances`);
      this.write(p.x); this.write(p.y); this.write(p.z); this.write(p.yaw);
      this.write(s.size[0]); this.write(s.size[1]); this.write(s.size[2]); this.write(s.emission ?? 0);
      this.write(s.color[0]); this.write(s.color[1]); this.write(s.color[2]); this.write(0);
    }
    this.count = this.cursor / 12;
    if (this.lastDirty >= this.firstDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      // WebGL 2 source-offset/length overload uploads a range without a new typed-array view.
      gl.bufferSubData(gl.ARRAY_BUFFER, this.firstDirty * 4, this.data, this.firstDirty, this.lastDirty - this.firstDirty + 1);
      r.stats.uploads++; r.stats.uploadedBytes += (this.lastDirty - this.firstDirty + 1) * 4;
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
    // Disposal releases CPU storage too, even if a caller retains the old handle.
    this.data = null; this.world = null;
  }
}
