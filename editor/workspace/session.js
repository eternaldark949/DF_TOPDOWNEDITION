/**
 * Studio / edit and Play lifetimes. The application selects context; the existing Lobby
 * remains the sole frame owner. Editing has one preview; Play releases it and owns the
 * game's bounded residency. Stop reconstructs only the selected authored scene.
 */
import {
  ancestors,
  descendants,
  lockOwner,
  reparentObject,
  localPoint,
  objectPoses,
} from "../../engine/basement/objects.js";
import { SceneInstance } from "../../engine/directory/scene-instance.js";
import { ProjectDocument } from "../../engine/basement/document.js";
import { assetBounds } from "../../engine/basement/asset-bounds.js";
import { copyData } from "../../engine/basement/project.js";
import { createMaterial } from "../../engine/basement/material.js";
import { ASSEMBLY_GENERATORS } from "../../engine/penthouse/assembly.js";
import { Lifetime } from "../../engine/basement/lifetime.js";

export class StudioSession {
  /** Inject game behavior, schema resolution and initial selection at the application boundary. */
  constructor(
    engine,
    {
      project,
      validate,
      selectInitial = (scene) => scene.entities.find((e) => !e.locked)?.id,
      playFactory,
      controlsHost,
      onChange,
      onStatus,
      canRemove = (entity) => !entity.locked,
      cloneEntity = (entity) => entity,
      guideLayers = () => [],
    },
  ) {
    this.engine = engine;
    this.canRemove = canRemove;
    this.cloneEntity = cloneEntity;
    this.guideLayers = guideLayers;
    this.validate = validate;
    this.selectInitial = selectInitial;
    this.playFactory = playFactory;
    this.controlsHost = controlsHost;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.life = new Lifetime();
    this.play = null;
    this.preview = null;
    this.document = null;
    this.sceneIndex = 0;
    this.scope = null;
    this.surfacePart = null;
    this.selected = null;
    this.selectionKind = "instance";
    this.lightingDirty = true;

    // The editor submits through the same renderer and host frame as the game.
    // Static lighting/poses need no repeated configuration between authored changes.
    this.life.own(
      engine.lobby.on(
        "render",
        () => {
          if (this.play || !this.preview) return;
          const renderer = engine.basement.renderer,
            scene = this.scene;
          if (this.lightingDirty) {
            renderer.lighting.configureDirectional(scene.sun);
            renderer.lighting.ambient.set(scene.ambient);
            scene.lights.forEach((light, i) =>
              renderer.lighting.setPoint(i, light),
            );
            this.lightingDirty = false;
          }
          renderer.render(this.preview.batch, this.guideLayers());
        },
        "studio.viewport",
      ),
    );
    this.replace(project);
  }

  /** Selection is application state; the scene itself always comes from the current document. */
  get scene() {
    return this.document.data.scenes[this.sceneIndex];
  }

  /** Cached display poses let guides and gestures share world coordinates without changing
   * the local authored transform fields. Invalidate only when document/scene changes. */
  get viewScene() {
    if (
      this.viewData !== this.document.data ||
      this.viewIndex !== this.sceneIndex
    ) {
      this.viewData = this.document.data;
      this.viewIndex = this.sceneIndex;
      const poses = objectPoses(this.scene);
      this.view = {
        ...this.scene,
        entities: this.scene.entities.map((e) => ({
          ...e,
          ...poses.get(e.id),
          locked: !!lockOwner(this.scene, e.id),
        })),
      };
    }
    return this.view;
  }
  /** Build a candidate completely before replacing an existing preview or dirty document. */
  makePreview(project, index) {
    const { directory, basement } = this.engine;
    const world = directory.adopt(basement.createWorld());
    let instance, batch, lease;
    try {
      instance = new SceneInstance(
        directory,
        world,
        project,
        project.scenes[index],
        { renderer: basement.renderer },
      );
      lease = directory.acquire(
        `studio:${world.id}`,
        () => basement.renderer.createBatch(world),
        { owner: "studio.preview" },
      );
      batch = lease.value;
      return {
        world,
        instance,
        batch,
        dispose() {
          lease.release();
          instance.dispose();
          directory.releaseWorld(world.id, world);
        },
      };
    } catch (error) {
      lease?.release();
      instance?.dispose();
      directory.releaseWorld(world.id, world);
      throw error;
    }
  }

  /** Invalid input/construction leaves the old project intact; adoption is synchronous. */
  replace(project) {
    if (this.play) throw new Error("Stop Play before opening a project");
    const doc = new ProjectDocument(project, { validate: this.validate });
    const candidate = this.makePreview(doc.data, 0);
    this.releaseDocument?.();
    this.preview?.dispose();
    this.preview = candidate;
    this.document = doc;
    this.sceneIndex = 0;
    this.scope = null;
    this.surfacePart = null;
    this.selectionKind = "instance";
    this.selected = this.selectInitial(doc.data.scenes[0]);
    this.lightingDirty = true;
    this.releaseDocument = doc.onChange((kind) => {
      this.lightingDirty = true;
      if (this.scope && !this.scene.entities.some((e) => e.id === this.scope))
        this.scope = null;
      if (!this.play) this.preview.instance.apply(this.scene, doc.data);
      this.onChange(kind);
    });
    this.onChange("open");
  }

  /** Navigation replaces one owned preview, while preserving project history and other scenes. */
  setScene(index) {
    if (this.play) return;
    this.document.cancel();
    const candidate = this.makePreview(this.document.data, index);
    this.preview.dispose();
    this.preview = candidate;
    this.sceneIndex = index;
    this.scope = null;
    this.surfacePart = null;
    this.lightingDirty = true;
    this.selectionKind = "instance";
    this.selected = this.selectInitial(this.scene);
    this.onChange("scene");
  }

  /** A selection change cannot strand an unfinished property transaction. */
  select(id, surface = null) {
    if (this.play) return;
    this.document.cancel();
    if (this.selected !== id) this.surfacePart = null;
    if (surface?.objectId === id) this.surfacePart = surface.partId;
    this.selectionKind = "instance";
    this.selected = id;
    this.onChange("selection");
  }

  /** A material data-block selection changes inspector context, never document content. */
  selectMaterial(id) {
    if (this.play) return;
    if (!this.document.data.materials.some((m) => m.id === id))
      throw new Error("Unknown material");
    this.document.cancel();
    this.surfacePart = null;
    this.selectionKind = "material";
    this.selected = id;
    this.onChange("selection");
  }

  /** Place one source asset with its true bottom on the construction plane. */
  place(assetId, point) {
    if (this.play) return;
    const asset = this.document.data.assets.find((a) => a.id === assetId);
    if (this.scope && lockOwner(this.scene, this.scope))
      throw new Error("Parent is locked");
    if (!asset) throw new Error("Unknown source asset");
    const id = this.document.allocateId(),
      // Mesh parts measure from their resident mesh's rest bounds (the preview leases it).
      bounds = assetBounds(asset, (mesh) => this.preview.instance.meshes.get(mesh).data.bounds);
    this.document.edit("Place asset", (data) =>
      data.scenes[this.sceneIndex].entities.push({
        id,
        name: asset.name,
        asset: assetId,
        tag: null,
        locked: false,
        parent: this.scope,
        position: localPoint(this.scene, this.scope, [
          point.x,
          point.y,
          (point.z ?? 0) - bounds.min[2],
        ]),
        rotation: [0, 0, 0, 1],
        scale: 1,
      }),
    );
    this.select(id);
    return id;
  }
  /** The active context chooses which immediate child a surface represents. */
  pickId(id) {
    let node = this.scene.entities.find((e) => e.id === id);
    // Point-light slots are currently scene-level leaves. Context picking follows
    // that same ownership instead of allowing global markers to intercept child edits.
    if (!node)
      return this.scope === null && this.scene.lights.some((l) => l.id === id)
        ? id
        : null;
    if (
      !node ||
      [node, ...ancestors(this.scene, id)].some((e) => e.selectable === false)
    )
      return null;
    while (node.parent !== this.scope) {
      if (!node.parent) return this.scope === null ? node.id : null;
      node = this.scene.entities.find((e) => e.id === node.parent);
      if (node.selectable === false) return null;
    }
    return node.id;
  }
  enter(id) {
    if (this.play) return;
    if (id !== null && !this.scene.entities.some((e) => e.id === id))
      throw new Error("Unknown object context");
    this.document.cancel();
    this.scope = id;
    this.onChange("context");
  }
  createObject() {
    if (this.play) return;
    const id = this.document.allocateId("object");
    if (this.scope && lockOwner(this.scene, this.scope))
      throw new Error("Parent is locked");
    this.document.edit("New object", (p) =>
      p.scenes[this.sceneIndex].entities.push({
        id,
        name: "Object",
        asset: null,
        parent: this.scope,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: 1,
        locked: false,
      }),
    );
    this.select(id);
    return id;
  }
  toggleLock(id) {
    if (this.play) return;
    const owner = lockOwner(this.scene, id);
    if (owner && owner.id !== id) throw new Error(`Locked by ${owner.name}`);
    this.document.edit("Toggle object lock", (p) => {
      const e = p.scenes[this.sceneIndex].entities.find((e) => e.id === id);
      e.locked = !e.locked;
    });
  }
  setObjectFlag(id, key, value) {
    if (!["visible", "selectable"].includes(key) || typeof value !== "boolean")
      throw new Error("Invalid object flag");
    if (this.play || lockOwner(this.scene, id))
      throw new Error("Object is locked");
    this.document.edit(
      key === "visible" ? "Object visibility" : "Object selectability",
      (p) =>
        (p.scenes[this.sceneIndex].entities.find((e) => e.id === id)[key] =
          value),
    );
  }
  reparent(id, parent) {
    if (
      this.play ||
      lockOwner(this.scene, id) ||
      (parent && lockOwner(this.scene, parent))
    )
      throw new Error("Object or parent is locked");
    this.document.edit("Reparent object", (p) =>
      reparentObject(p.scenes[this.sceneIndex], id, parent),
    );
  }
  makeGeometryUnique() {
    if (this.play) return;
    const e = this.scene.entities.find((e) => e.id === this.selected);
    if (!e?.asset || lockOwner(this.scene, e.id))
      throw new Error("Select editable geometry");
    const id = this.document.allocateId("asset");
    this.document.edit("Make geometry unique", (p) => {
      const e = p.scenes[this.sceneIndex].entities.find(
          (e) => e.id === this.selected,
        ),
        source = p.assets.find((a) => a.id === e.asset),
        copy = copyData(source);
      copy.id = id;
      copy.name += " copy";
      p.assets.push(copy);
      e.asset = id;
    });
  }
  /**
   * Add a mesh recipe at its generator's defaults (empty `parameters`) and a one-part
   * geometry source that draws it, as one undoable command, and return the source's ID
   * for placement. `generator` is a mesh generator name and `descriptor` its catalog entry
   * (label, version), injected by the application so the session knows no generator.
   * The part borrows the project's first material, or adds a default one when there is
   * none. Mesh and geometry stay separate data blocks: further sources may share the mesh.
   */
  createMeshAsset(generator, descriptor) {
    if (this.play) return null;
    this.document.cancel();
    const meshId = this.document.allocateId("mesh"),
      assetId = this.document.allocateId("asset"),
      materialId =
        this.document.data.materials[0]?.id ?? this.document.allocateId("material");
    this.document.edit(`New ${descriptor.label.toLowerCase()} mesh`, (p) => {
      if (!p.materials.length)
        p.materials.push({ id: materialId, name: "Material", ...createMaterial() });
      p.meshes.push({
        id: meshId,
        name: descriptor.label,
        generator,
        generatorVersion: descriptor.version,
        parameters: {},
      });
      p.assets.push({
        id: assetId,
        name: descriptor.label,
        generator: "toy.assembly",
        generatorVersion: ASSEMBLY_GENERATORS["toy.assembly"],
        parts: [
          {
            id: "part:0",
            parent: null,
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            // size scales the mesh's own frame per axis; 1 keeps the recipe's metres.
            shape: { mesh: meshId, size: [1, 1, 1], material: materialId, castShadow: true, ambientBlocker: false },
          },
        ],
        colliders: [],
      });
    });
    return assetId;
  }
  /** Duplicate a complete branch with new stable IDs, retaining linked geometry resources. */
  duplicate() {
    if (this.play) return;
    const original =
      this.selectionKind === "material"
        ? null
        : this.scene.entities.find((e) => e.id === this.selected);
    if (!original || lockOwner(this.scene, original.id))
      throw new Error("Select an unlocked object");
    const branch = descendants(this.scene, original.id),
      copies = this.scene.entities
        .filter((e) => branch.has(e.id))
        .map((e) => this.cloneEntity(copyData(e))),
      ids = new Map(copies.map((e) => [e.id, this.document.allocateId()]));
    for (const e of copies) {
      const old = e.id;
      e.id = ids.get(old);
      e.parent = ids.get(e.parent) ?? e.parent;
      if (old === original.id) {
        e.name += " copy";
        e.position[0] += 1;
      }
    }
    this.document.edit("Duplicate object", (p) =>
      p.scenes[this.sceneIndex].entities.push(...copies),
    );
    const id = ids.get(original.id);
    this.select(id);
    return id;
  }
  /** Deletion protects every child and application role, not just the selected root. */
  remove() {
    if (this.play) return;
    const original =
      this.selectionKind === "material"
        ? null
        : this.scene.entities.find((e) => e.id === this.selected);
    if (!original) throw new Error("Select an object");
    const ids = descendants(this.scene, original.id);
    if (
      this.scene.entities.some(
        (e) =>
          ids.has(e.id) && (lockOwner(this.scene, e.id) || !this.canRemove(e)),
      )
    )
      throw new Error("Object contains locked or protected components");
    this.document.edit("Delete object", (p) => {
      const scene = p.scenes[this.sceneIndex];
      scene.entities = scene.entities.filter((e) => !ids.has(e.id));
    });
    if (ids.has(this.scope)) this.scope = null;
    this.select(this.selectInitial(this.scene));
  }
  /** Release the preview before Play; pass only detached authored data to the game factory. */
  startPlay() {
    if (this.play) return;
    this.document.cancel();
    const renderer = this.engine.basement.renderer;
    this.camera = renderer.camera.snapshot();
    this.preview.dispose();
    this.preview = null;
    this.engine.basement.input.clear();
    renderer.camera.setProjection("orthographic");
    renderer.camera.preset("oblique");
    renderer.camera.z = 0;
    try {
      this.play = this.playFactory(this.engine, {
        project: this.document.snapshot(),
        controlsHost: this.controlsHost,
        onStatus: this.onStatus,
        onError: (error) => this.onStatus({ name: error.message }),
      });
    } catch (error) {
      Object.assign(renderer.camera, this.camera);
      this.lightingDirty = true;
      this.preview = this.makePreview(this.document.data, this.sceneIndex);
      throw error;
    }
    this.onChange("play");
  }

  /** Dispose every play registration before restoring editing, its camera, and authored data. */
  stopPlay() {
    if (!this.play) return;
    this.play.dispose();
    this.play = null;
    this.engine.basement.input.bind({});
    this.engine.directory.residency.trim();
    Object.assign(this.engine.basement.renderer.camera, this.camera);
    this.preview = this.makePreview(this.document.data, this.sceneIndex);
    this.lightingDirty = true;
    this.onChange("stop");
  }

  /** Unsubscribe first, then release the active context and viewport callback. */
  dispose() {
    this.releaseDocument?.();
    this.play?.dispose();
    this.preview?.dispose();
    this.life.dispose();
  }
}
