/**
 * Directory / live authored scene instance. Maps stable document IDs to temporary World
 * membership, and updates transforms/collision together. Owns scene runtime materials.
 * Owns no scheduler or game rules. Also owns the scene's mesh leases (AuthoredMeshes) and
 * applies each object's authored joint `poses` to the SkeletonPoses of its skinned parts.
 * Collider queries remain planar conservative bounds; full 3D physics is future work.
 */
import { MaterialLibrary } from "./material-library.js";
import { AuthoredMeshes } from "./authored-meshes.js";
import { rotateVector } from "../basement/rotation.js";
import { SkeletonPose } from "../basement/skeleton.js";
export class SceneInstance {
  /**
   * Synchronous construction is available for the explicitly bounded editor preview.
   * `renderer` makes mesh parts resident; scenes without mesh parts may omit it.
   */
  constructor(directory, world, project, scene, { defer = false, renderer = null } = {}) {
    this.disposed = false;
    this.materials = new MaterialLibrary(project.materials);
    this.meshes = new AuthoredMeshes(directory, renderer, project.meshes ?? [], `scene:${scene.id}`.slice(0, 80));
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
  static *prepare(directory, world, project, scene, { renderer = null } = {}) {
    const instance = new SceneInstance(directory, world, project, scene, {
      defer: true,
      renderer,
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
  /** The authored origin is independent of its geometry generator. Replacing a linked
   * geometry source must not replace the origin's runtime identity or attachments. */
  add(directory, project, entity) {
    const item = {
      root: this.world.create(),
      geometryRoot: null,
      parts: [],
      asset: null,
      colliders: [],
    };
    this.instances.set(entity.id, item);
    this.bindGeometry(
      entity.id,
      project.assets.find((a) => a.id === entity.asset) ?? null,
    );
  }
  /** Own one generated geometry branch beneath a stable object origin. Source data and
   * materials remain linked; only this component's old generated membership is released. */
  bindGeometry(id, asset) {
    const item = this.instances.get(id);
    for (const part of item.parts) this.authored.delete(part.id);
    for (const collider of item.colliders) {
      const i = this.colliders.indexOf(collider);
      if (i !== -1) this.colliders.splice(i, 1);
    }
    if (item.geometryRoot) this.world.remove(item.geometryRoot);
    item.asset = asset;
    item.parts = [];
    item.geometryRoot = null;
    item.colliders = [];
    if (!asset) return;
    const built = this.directory.create(asset.generator, {
      world: this.world,
      asset,
      materials: this.materials,
      meshes: this.meshes,
    });
    item.geometryRoot = built.root;
    item.parts = built.parts;
    this.world.reparent(built.root, item.root);
    for (const part of item.parts) this.authored.set(part.id, id);
    item.colliders = asset.colliders.map((c) => ({ ...c }));
    this.colliders.push(...item.colliders);
  }
  /** Update existing retained geometry; positions never require asset reconstruction. */
  apply(scene, project = null) {
    if (this.disposed) throw new Error("Scene instance is disposed");
    if (project) {
      this.materials.sync(project.materials);
      this.meshes.sync(project.meshes ?? []);
    }
    // Reconcile topology by authored ID, retaining every unaffected runtime tree and collider.
    const ids = new Set(scene.entities.map((e) => e.id));
    for (const id of this.instances.keys()) if (!ids.has(id)) this.remove(id);
    for (const entity of scene.entities) {
      const old = this.instances.get(entity.id);
      if (
        old &&
        (old.asset?.id ?? null) !== entity.asset &&
        entity.asset !== null &&
        !project
      )
        throw new Error("Project required when binding geometry");
      if (old && (old.asset?.id ?? null) !== entity.asset)
        this.bindGeometry(
          entity.id,
          project?.assets.find((a) => a.id === entity.asset) ?? null,
        );
      if (!this.instances.has(entity.id)) {
        if (!project)
          throw new Error("Project required when adding an instance");
        this.add(this.directory, project, entity);
      }
    }
    const usedMaterials = new Set(),
      usedMeshes = new Set(),
      v = [0, 0, 0];
    for (const e of scene.entities) {
      const item = this.instances.get(e.id);
      if (!item) throw new Error("Scene topology changed: reopen preview");
      const r = item.root;
      const asset = project?.assets.find((a) => a.id === e.asset) ?? item.asset;
      (asset?.parts ?? []).forEach((part, i) => {
        if (part.shape) {
          const id = Object.hasOwn(e.materialOverrides ?? {}, part.id)
            ? e.materialOverrides[part.id]
            : part.shape.material;
          usedMaterials.add(id);
          item.parts[i].shape.material = this.materials.get(id);
        }
        if (part.shape?.mesh !== undefined) this.applyMesh(item.parts[i], part, e.poses?.[part.id], usedMeshes);
      });
      [r.x, r.y, r.z] = e.position;
      const length = Math.hypot(...e.rotation);
      r.rotation.splice(0, 4, ...e.rotation.map((n) => n / length));
      r.scale = e.scale;
      r.visible = e.visible !== false;
      this.world.reparent(
        r,
        e.parent ? this.instances.get(e.parent).root : null,
      );
    }
    // Resolve full inherited poses before deriving planar collision bounds. A child
    // keeps its local values while collision follows the same world pose as drawing.
    this.world.snapshot();
    this.world.resolve();
    for (const e of scene.entities) {
      const item = this.instances.get(e.id),
        r = item.root.pose;
      (item.asset?.colliders ?? []).forEach((c, i) => {
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
    // Entities now draw their current meshes, so replaced recipes can be released.
    this.meshes.retain(usedMeshes);
  }
  /**
   * Keep one mesh part current: swap in the resident mesh when its recipe changed (a new
   * skeleton gets a fresh pose), then pose its joints from the object's authored offsets.
   * Joints absent from `offsets` sit at rest, so removing an entry restores the rest pose.
   */
  applyMesh(entity, part, offsets = {}, used) {
    const mesh = this.meshes.get(part.shape.mesh);
    used.add(part.shape.mesh);
    if (entity.shape.mesh !== mesh) {
      if (entity.shape.mesh?.skeleton !== mesh.skeleton) entity.skin = mesh.skinned ? new SkeletonPose(mesh.skeleton) : null;
      entity.shape.mesh = mesh;
    }
    if (!entity.skin) return;
    entity.skin.reset();
    for (const [joint, q] of Object.entries(offsets)) entity.skin.offset(entity.skin.joint(joint), q);
    entity.skin.update();
  }
  /** Remove only one tree and its derived mappings; shared asset data remains untouched. */
  remove(id) {
    const item = this.instances.get(id);
    if (!item) return;
    // Authored children have independent ownership. Detach them before removing only
    // this component's generated geometry, retaining their live IDs during reconciliation.
    for (const other of this.instances.values())
      if (other.root.parent === item.root)
        this.world.reparent(other.root, null);
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
    return i?.parts[i.asset?.parts.findIndex((p) => p.id === name)];
  }
  /** Ray hits on assembly children map to their owning authored instance. */
  idFor(entity) {
    return this.authored.get(entity.id);
  }
  /** A picked surface carries authored component/source/part identity. Runtime IDs and
   * array positions stay private; future mesh picking can extend this with face identity. */
  surfaceFor(entity) {
    if (!entity?.shape) return null;
    const objectId = this.idFor(entity),
      item = this.instances.get(objectId);
    if (!item?.asset) return null;
    const i = item.parts.indexOf(entity);
    return i < 0
      ? null
      : { objectId, geometryId: item.asset.id, partId: item.asset.parts[i].id };
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
    // Entities left the world above, so no batch will draw these meshes again.
    this.meshes.dispose();
    this.world = this.directory = null;
  }
}
