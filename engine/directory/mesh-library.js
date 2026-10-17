/**
 * Directory / mesh library: one owner's leases on shared GPU meshes.
 *
 * Meshes are registered by stable key (an authored mesh asset ID, or a generator name
 * plus its parameters) and built at most once per Directory: the first lease runs the
 * caller's build() to produce MeshData (basement/mesh.js) and makes it resident through
 * the renderer; later leases share it; releasing the last lease frees its buffers.
 *
 * A scene, review page or game system creates one MeshLibrary, acquires what it draws and
 * disposes the library when it goes, which releases every lease it holds exactly once.
 * Entities must leave the world (or the batch must stop drawing them) before their mesh
 * is released; a batch that meets a disposed mesh throws rather than draw freed memory.
 *
 * Skeletons are immutable CPU data carried by their skinned MeshData, so they need no
 * lease. Each posed figure owns its own SkeletonPose.
 */
export class MeshLibrary {
  /** owner names this library in Directory diagnostics (1–80 characters). */
  constructor(directory, renderer, owner) {
    this.directory = directory; this.renderer = renderer; this.owner = owner;
    this.leases = new Map(); this.disposed = false;
  }

  /**
   * Lease the mesh registered under `key`, building it with build() only if no owner in
   * this Directory holds it yet. Repeated calls from one library share one lease.
   */
  acquire(key, build) {
    if (this.disposed) throw new Error("Mesh library is disposed");
    if (typeof key !== "string" || !key.length || key.length > 200) throw new RangeError("Mesh key must contain 1–200 characters");
    let lease = this.leases.get(key);
    if (!lease) {
      lease = this.directory.acquire(`mesh:${key}`, () => this.renderer.createMesh(build()), { owner: this.owner });
      this.leases.set(key, lease);
    }
    return lease.value;
  }

  /** Release one key's lease; unknown keys are ignored so cleanup can be repeated. */
  release(key) {
    const lease = this.leases.get(key);
    if (!lease) return;
    this.leases.delete(key);
    lease.release();
  }

  /** Release every lease this library holds. Idempotent. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const lease of this.leases.values()) lease.release();
    this.leases.clear();
  }
}
