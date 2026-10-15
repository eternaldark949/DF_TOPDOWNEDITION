/**
 * Directory: named libraries, lazy shared resources, and explicit world ownership.
 * Factories come from callers. Nothing here imports a named toy or game asset.
 * A lease pins one resource; releasing the last lease destroys it immediately.
 */
import { WorldResidency } from './residency.js';
import { directoryDiagnostics } from './diagnostics.js';

export class Directory {
  /** Registration is inert: no world or GPU asset is allocated until requested. */
  constructor({profiler=null}={}) { this.residency = new WorldResidency(); this.libraries = new Map(); this.resources = new Map(); this.worlds = new Map(); this.disposed = false; this.removeDiagnostics=directoryDiagnostics(this,profiler); }

  /** Register a unique library factory; duplicate names are an error, not a silent override. */
  register(name, factory) {
    if (this.disposed) throw new Error('Directory is disposed');
    if (this.libraries.has(name)) throw new Error(`Duplicate library: ${name}`);
    this.libraries.set(name, factory);
  }

  /** Instantiate registered content with explicit arguments; caller owns its instance. */
  create(name, options) {
    if (this.disposed) throw new Error('Directory is disposed');
    const factory = this.libraries.get(name);
    if (!factory) throw new Error(`Unknown library: ${name}`);
    return factory(options);
  }

  /** Acquire a shared disposable resource. The factory runs only for the first owner. */
  acquire(key, factory, {owner='anonymous'}={}) {
    if (this.disposed) throw new Error('Directory is disposed');
    if(typeof owner!=='string'||!owner.length||owner.length>80)throw new RangeError('Resource owner must contain 1–80 characters');
    let record = this.resources.get(key);
    if (!record) { record = { value: factory(), owners: 0, ownerNames: new Map() }; this.resources.set(key, record); }
    record.owners++;record.ownerNames.set(owner,(record.ownerNames.get(owner)??0)+1);
    let released = false;
    return {
      value: record.value, owner,
      // Every lease may release once; delayed scene cleanup cannot underflow ownership.
      release: () => {
        if (released) return;
        released = true;
        const left=(record.ownerNames.get(owner)??0)-1;
        if(left>0)record.ownerNames.set(owner,left);else record.ownerNames.delete(owner);
        if (--record.owners === 0 && this.resources.get(key) === record) {
          this.resources.delete(key); record.value.dispose();
        }
      },
    };
  }

  /** Adopt a world using its immutable ID. Its caller must release it on scene replacement. */
  adopt(world) {
    if (this.disposed) throw new Error('Directory is disposed');
    if (this.worlds.has(world.id)) throw new Error(`Duplicate world: ${world.id}`);
    this.worlds.set(world.id, world);
    return world;
  }

  /**
   * Release an adopted world. Async loaders pass expected to prevent a stale cleanup
   * from deleting a newer reconstruction that intentionally reuses the same world ID.
   */
  releaseWorld(id, expected) {
    const world = this.worlds.get(id);
    if (!world || (expected && world !== expected)) return;
    this.worlds.delete(id); world.dispose();
  }

  /** Final owner cleanup also invalidates outstanding leases; release closures remain harmless. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.removeDiagnostics(); this.residency.dispose();
    for (const world of this.worlds.values()) world.dispose();
    for (const resource of this.resources.values()) resource.value.dispose();
    this.worlds.clear(); this.resources.clear(); this.libraries.clear();
  }
}
