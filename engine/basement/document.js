/**
 * Basement / bounded document transactions. One gesture is one command; cancel restores
 * its starting snapshot. Validation precedes adoption. Runtime resources never enter history.
 * Snapshot history is deliberately small (64 commands / 2 MiB), independent of scene size.
 */
import { copyData, validateProject, upgradeProject } from "./project.js";

export class ProjectDocument {
  /** Own a validated data copy. Registry-specific validation is injected by the application. */
  constructor(data, { validate = validateProject } = {}) {
    this.validate = validate;
    this.data = copyData(validate(upgradeProject(data)));
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.active = null;
    this.saved = JSON.stringify(this.data);
    this.revision = 0;
    this.nextAuthoredId = 1;
  }

  /** Allocate authoring IDs in this document, independently of runtime World identities.
   * The counter is not undone: delete/undo/new-command cannot silently reuse an old ID. */
  allocateId(namespace = "instance") {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(namespace))
      throw new Error("Invalid authored namespace");
    const used = new Set([
      ...this.data.assets.map(a=>a.id),
      ...this.data.materials.map((m) => m.id),
      ...(this.data.meshes ?? []).map((m) => m.id),
      ...this.data.scenes.flatMap((scene) =>
        scene.entities.map((entity) => entity.id),
      ),
    ]);
    let id;
    do {
      id = `${namespace}:${this.nextAuthoredId++}`;
    } while (used.has(id));
    return id;
  }

  /** Subscribe once; the owning inspector/workspace must release its subscription. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Publish coherent data; preview events are distinct from committed recovery checkpoints. */
  emit(kind) {
    this.revision++;
    for (const fn of this.listeners) fn(kind, this);
  }

  /** Reserve one gesture. Nested edits would obscure who owns cancellation, so reject them. */
  begin(label) {
    if (this.active) throw new Error("Finish the active edit first");
    this.active = { label, before: JSON.stringify(this.data) };
  }

  /** Validate an isolated candidate before exposing it to live geometry or property consumers. */
  preview(edit) {
    if (!this.active) throw new Error("No active transaction");
    const next = copyData(this.data);
    edit(next);
    this.validate(next);
    this.data = next;
    this.emit("preview");
  }

  /** Commit one changed snapshot; evict oldest commands by both count and string storage. */
  commit() {
    if (!this.active) return;
    const command = { ...this.active, after: JSON.stringify(this.data) };
    this.active = null;
    if (command.before === command.after) return;
    this.undoStack.push(command);
    this.redoStack = [];
    // JS strings use UTF-16 code units; include both snapshots of each retained command.
    while (
      this.undoStack.length > 64 ||
      this.undoStack.reduce(
        (n, c) => n + 2 * (c.before.length + c.after.length),
        0,
      ) > 2097152
    ) {
      this.undoStack.shift();
    }
    this.emit("commit");
  }

  /** Restore authored IDs/references as well as properties; cancellation creates no history. */
  cancel() {
    if (!this.active) return;
    this.data = JSON.parse(this.active.before);
    this.active = null;
    this.emit("cancel");
  }

  /** Atomic convenience for discrete edits; rejected candidates leave the document intact. */
  edit(label, fn) {
    this.begin(label);
    try {
      this.preview(fn);
      this.commit();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  /** Travel through one exact authored snapshot without generating replacement identities. */
  undo() {
    this.cancel();
    const command = this.undoStack.pop();
    if (!command) return;
    this.data = JSON.parse(command.before);
    this.redoStack.push(command);
    this.emit("undo");
  }

  /** Restore the exact authored result, not a recomputation using today's generator state. */
  redo() {
    this.cancel();
    const command = this.redoStack.pop();
    if (!command) return;
    this.data = JSON.parse(command.after);
    this.undoStack.push(command);
    this.emit("redo");
  }

  /** Play/export receive detached data; simulation mutations must not become authored edits. */
  snapshot() {
    return copyData(this.data);
  }

  /** A checkpoint recognizes undo returning to the last exported content, not only a counter. */
  markSaved() {
    this.saved = JSON.stringify(this.data);
    this.emit("saved");
  }
  get dirty() {
    return JSON.stringify(this.data) !== this.saved;
  }
}
