/**
 * Basement / GPU mesh: one MeshData resident on the renderer's context.
 *
 * Ownership: Renderer.createMesh() makes a GpuMesh; whoever called it owns it and must
 * dispose it. Shared meshes go through a Directory lease (directory/mesh-library.js), so
 * the last scene to let go frees the buffers. The renderer keeps a registry only so that
 * context restoration can rebuild live meshes from their retained CPU data, and so its own
 * disposal can free anything a careless owner left behind.
 *
 * The mesh holds its vertex and index buffers. Batches pair them with their own instance
 * records in per-mesh VAOs (renderer.js InstanceStream), exactly as boxes pair the cube.
 */
export class GpuMesh {
  constructor(renderer, data) {
    if (!data?.vertices || !data.indices) throw new TypeError("GpuMesh needs MeshData from createMesh()");
    this.renderer = renderer;
    this.data = data;
    this.count = data.indices.length;
    this.skinned = data.skinned;
    this.skeleton = data.skeleton;
    this.reach = data.reach;
    this.disposed = false;
    this.initialize();
  }

  /** Bytes of retained GPU buffers (vertices + indices), for diagnostics. */
  get bytes() { return this.data.vertices.byteLength + this.data.indices.byteLength; }

  /** (Re)create buffers from retained data: first use and after context restoration. */
  initialize() {
    const { gl, stats } = this.renderer;
    this.vertexBuffer = gl.createBuffer(); this.indexBuffer = gl.createBuffer();
    if (!this.vertexBuffer || !this.indexBuffer) throw new Error("Mesh buffer allocation failed");
    stats.buffers += 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.vertices, gl.STATIC_DRAW);
    // Element bindings are VAO state: upload with no VAO bound, then bind per stream VAO.
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.data.indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.indexType = this.data.indexType === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }

  /** Free buffers once. Batches drop their per-mesh streams on their next sync. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const { gl, stats, meshes } = this.renderer;
    // Deleting handles from a lost context is a harmless no-op, so one path serves both.
    gl.deleteBuffer(this.vertexBuffer); gl.deleteBuffer(this.indexBuffer);
    stats.buffers -= 2;
    this.vertexBuffer = this.indexBuffer = null;
    meshes.delete(this);
  }
}
