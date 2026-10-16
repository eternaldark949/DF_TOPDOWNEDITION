/** Directory / scene-owned runtime material library. Authored IDs resolve once to shared
 * mutable numeric objects. Play never borrows authoring objects; updates retain link identity. */
import { createMaterial, updateMaterial } from "../basement/material.js";
export class MaterialLibrary {
  /** Definitions are indexed cheaply; numerical runtime copies are created only for users. */
  constructor(materials) {
    this.values = new Map();
    this.sources = new Map();
    this.sync(materials);
  }
  /** Reconcile authored values without reconstructing geometry or breaking existing links. */
  sync(materials) {
    this.sources = new Map(materials.map((m) => [m.id, m]));
    for (const [id, value] of this.values) {
      const source = this.sources.get(id);
      if (source) updateMaterial(value, source);
      else this.values.delete(id);
    }
  }
  /** Resolve a stable authored ID to this scene's shared, independently mutable material. */
  get(id) {
    if (!this.sources.has(id)) throw new Error(`Unresolved material ${id}`);
    if (!this.values.has(id))
      this.values.set(id, createMaterial(this.sources.get(id)));
    return this.values.get(id);
  }

  /** Drop compiled values with no users in this scene; authored metadata remains available lazily. */
  retain(ids) {
    for (const id of this.values.keys())
      if (!ids.has(id)) this.values.delete(id);
  }
  /** Release both compiled values and source references when the scene lease closes. */
  dispose() {
    this.values.clear();
    this.sources.clear();
  }
}
