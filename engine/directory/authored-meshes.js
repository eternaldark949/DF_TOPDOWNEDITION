/**
 * Directory / authored meshes: a scene's view of the project's mesh assets.
 *
 * The counterpart of MaterialLibrary for geometry: authored mesh IDs (project schema v4,
 * `project.meshes`) resolve to resident GpuMeshes on demand. Each definition is built by
 * the Directory library its `generator` names (Penthouse mesh-generators.js) and leased
 * through a MeshLibrary under a content key, generator@version:parameters. Two scenes,
 * or two assets, that author identical recipes therefore share one GPU mesh; editing a
 * recipe's parameters changes its key, so the next get() builds the new shape while the
 * old lease is released once nothing in this scene uses it (retain()).
 *
 * Ownership: one instance per SceneInstance. It borrows the renderer and Directory and
 * owns only its leases. Callers remove the entities drawing a mesh before releasing it.
 * Without a renderer (headless tools and Node tests) definitions still validate and sync,
 * but resolving a mesh throws, because there is nothing to make it resident on.
 */
import { MeshLibrary } from "./mesh-library.js";

export class AuthoredMeshes {
  constructor(directory, renderer, definitions, owner) {
    this.directory = directory; this.renderer = renderer;
    this.library = renderer ? new MeshLibrary(directory, renderer, owner) : null;
    this.sources = new Map(); this.keys = new Map(); this.disposed = false;
    this.sync(definitions);
  }

  /** Content key of one definition: equal recipes share one lease. */
  static key(definition) {
    const parameters = Object.keys(definition.parameters).sort().map((k) => [k, definition.parameters[k]]);
    return `${definition.generator}@${definition.generatorVersion}:${JSON.stringify(parameters)}`;
  }

  /** Adopt the project's current definitions. Live meshes swap on their next get(). */
  sync(definitions) {
    if (this.disposed) throw new Error("Authored meshes are disposed");
    this.sources = new Map(definitions.map((d) => [d.id, d]));
  }

  /** Whether an authored mesh ID exists in the synced project. */
  has(id) { return this.sources.has(id); }

  /** Resolve an authored mesh ID to its resident GpuMesh, building it at most once. */
  get(id) {
    if (this.disposed) throw new Error("Authored meshes are disposed");
    const definition = this.sources.get(id);
    if (!definition) throw new Error(`Unresolved mesh ${id}`);
    if (!this.library) throw new Error(`Mesh ${id} needs a renderer to become resident`);
    const key = AuthoredMeshes.key(definition);
    this.keys.set(id, key);
    return this.library.acquire(key, () => this.directory.create(definition.generator, definition.parameters));
  }

  /**
   * Release leases no authored ID in `ids` still uses. Call after reconciling a scene, once
   * entities that drew a replaced or deleted mesh have been updated or removed.
   */
  retain(ids) {
    for (const id of [...this.keys.keys()]) if (!ids.has(id) || !this.sources.has(id)) this.keys.delete(id);
    // A key stays leased while any retained ID resolves to it (shared recipes).
    for (const [id, key] of [...this.keys]) if (AuthoredMeshes.key(this.sources.get(id)) !== key) this.keys.delete(id);
    const live = new Set(this.keys.values());
    for (const key of [...(this.library?.leases.keys() ?? [])]) if (!live.has(key)) this.library.release(key);
  }

  /** Release every lease. Idempotent; entities must already have left the world. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.library?.dispose();
    this.sources.clear(); this.keys.clear();
  }
}
