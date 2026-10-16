/**
 * Directory / live authored scene instance. Maps stable document IDs to temporary World
 * membership, and updates transforms/collision together. Owns scene runtime materials.
 * Owns no scheduler or game rules.
 * Collider queries remain planar conservative bounds; full 3D physics is future work.
 */
import { MaterialLibrary } from "./material-library.js";
import { rotateVector } from "../basement/rotation.js";
export class SceneInstance {
  /** Synchronous construction is available for the explicitly bounded editor preview. */
  constructor(directory, world, project, scene, { defer = false } = {}) {
    this.disposed = false;
    this.materials = new MaterialLibrary(project.materials);
    this.directory = directory;
    this.world = world;
    this.instances = new Map();
    this.authored = new Map();
    this.colliders = [];
    if (!defer) {
      for (const entity of scene.entities) this.add(directory, project, entity);
      this.apply(scene, project);
    }
  }
  /** Runtime loading yields once per bounded assembly, preserving Lobby's preparation budget. */
  static *prepare(directory, world, project, scene) {
    const instance = new SceneInstance(directory, world, project, scene, {
      defer: true,
    });
    let complete = false;
    try {
      for (const entity of scene.entities) {
        instance.add(directory, project, entity);
        yield;
      }
      instance.apply(scene, project);
      complete = true;
      return instance;
    } finally {
      if (!complete) instance.dispose();
    }
  }
  /** Add one registered asset. The surrounding world owner cleans partial jobs on cancellation. */
  add(directory, project, entity) {
    const asset = project.assets.find((a) => a.id === entity.asset);
    const built = directory.create(asset.generator, {
      world: this.world,
      asset,
      materials: this.materials,
    });
    const colliders = asset.colliders.map((c) => {
      const box = { ...c };
      this.colliders.push(box);
      return box;
    });
    this.instances.set(entity.id, { ...built, asset, colliders });
    for (const part of built.parts) this.authored.set(part.id, entity.id);
  }
  /** Update existing retained geometry; positions never require asset reconstruction. */
  apply(scene, project = null) {
    if (this.disposed) throw new Error("Scene instance is disposed");
    if (project) this.materials.sync(project.materials);
    // Reconcile topology by authored ID, retaining every unaffected runtime tree and collider.
    const ids = new Set(scene.entities.map((e) => e.id));
    for (const id of this.instances.keys()) if (!ids.has(id)) this.remove(id);
    for (const entity of scene.entities) {
      const old = this.instances.get(entity.id);
      if (old && old.asset.id !== entity.asset) this.remove(entity.id);
      if (!this.instances.has(entity.id)) {
        if (!project)
          throw new Error("Project required when adding an instance");
        this.add(this.directory, project, entity);
      }
    }
    const usedMaterials = new Set(),
      v = [0, 0, 0];
    for (const e of scene.entities) {
      const item = this.instances.get(e.id);
      if (!item) throw new Error("Scene topology changed: reopen preview");
      const r = item.root;
      const asset = project?.assets.find((a) => a.id === e.asset) ?? item.asset;
      asset.parts.forEach((part, i) => {
        if (part.shape) {
          const id = Object.hasOwn(e.materialOverrides ?? {}, part.id)
            ? e.materialOverrides[part.id]
            : part.shape.material;
          usedMaterials.add(id);
          item.parts[i].shape.material = this.materials.get(id);
        }
      });
      [r.x, r.y, r.z] = e.position;
      const length = Math.hypot(...e.rotation);
      r.rotation.splice(0, 4, ...e.rotation.map((n) => n / length));
      r.scale = e.scale;
      item.asset.colliders.forEach((c, i) => {
        rotateVector(r.rotation, c.x * r.scale, c.y * r.scale, 0, v);
        const b = item.colliders[i];
        b.x = r.x + v[0];
        b.y = r.y + v[1];
        let w = 0,
          d = 0;
        for (const x of [-1, 1])
          for (const y of [-1, 1]) {
            rotateVector(
              r.rotation,
              (x * c.width * r.scale) / 2,
              (y * c.depth * r.scale) / 2,
              0,
              v,
            );
            w = Math.max(w, Math.abs(v[0]) * 2);
            d = Math.max(d, Math.abs(v[1]) * 2);
          }
        b.width = w;
        b.depth = d;
      });
    }
    this.materials.retain(usedMaterials);
    this.world.snapshot();
    this.world.resolve();
  }
  /** Remove only one tree and its derived mappings; shared asset data remains untouched. */
  remove(id) {
    const item = this.instances.get(id);
    if (!item) return;
    for (const part of item.parts) this.authored.delete(part.id);
    for (const collider of item.colliders) {
      const index = this.colliders.indexOf(collider);
      if (index !== -1) this.colliders.splice(index, 1);
    }
    this.world.remove(item.root);
    this.instances.delete(id);
  }
  /** Resolve a stable placed ID, or a named assembly part, without exposing runtime IDs in JSON. */
  root(id) {
    return this.instances.get(id)?.root;
  }
  part(id, name) {
    const i = this.instances.get(id);
    return i?.parts[i.asset.parts.findIndex((p) => p.id === name)];
  }
  /** Ray hits on assembly children map to their owning authored instance. */
  idFor(entity) {
    return this.authored.get(entity.id);
  }
  /** Release membership; the caller separately releases its world and GPU lease. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const i of this.instances.values()) this.world.remove(i.root);
    this.instances.clear();
    this.authored.clear();
    this.colliders.length = 0;
    this.materials.dispose();
    this.world = this.directory = null;
  }
}
