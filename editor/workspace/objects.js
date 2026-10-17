/** Studio / object-tree composition and commands. One hierarchy serves every asset type;
 * shared SVG/number widgets stay in Penthouse and tree/transform math stays in Basement. */
import { Lifetime } from "../../engine/basement/lifetime.js";
import { TextControl } from "../../engine/penthouse/text-control.js";
import { IconControls } from "../../engine/penthouse/icon-controls.js";
import {
  ancestors,
  descendants,
  lockOwner,
} from "../../engine/basement/objects.js";
export class ObjectPanel {
  constructor({ host, fields, session, library, onSelect, onError }) {
    this.life = new Lifetime();
    this.icons = new IconControls(library);
    this.session = session;
    const scene = session.scene,
      selected = scene.entities.find((e) => e.id === session.selected);
    const button = (parent, label, icon, action, compact = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.disabled = !!session.play;
      parent.append(b);
      if (icon) this.icons.set(b, icon, label, { compact });
      this.life.listen(b, "click", () => {
        try {
          session.document.cancel();
          action();
        } catch (e) {
          onError(e);
        }
      });
      return b;
    };
    const path = document.createElement("nav");
    path.className = "object-path";
    path.setAttribute("aria-label", "Object context");
    host.append(path);
    button(path, "Scene", "scene", () => session.enter(null));
    const scope = scene.entities.find((e) => e.id === session.scope);
    for (const e of scope
      ? [...ancestors(scene, scope.id).reverse(), scope]
      : [])
      button(path, e.name, null, () => session.enter(e.id));
    button(host, "New object", "origin", () => session.createObject());
    const rows = document.createElement("div");
    rows.className = "object-tree";
    host.append(rows);
    // Storage only requires parent-before-child. The outliner orders actual branches
    // contiguously, so an indented component can never appear beneath an unrelated root.
    const children = new Map();
    for (const item of [...scene.entities, ...scene.lights]) {
      const parent = item.parent ?? null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    }
    const ordered = [];
    const visit = (parent) => {
      for (const item of children.get(parent) ?? []) {
        ordered.push(item);
        visit(item.id);
      }
    };
    visit(null);
    for (const item of ordered) {
      const row = document.createElement("div");
      row.className = "object-row";
      const object = scene.entities.includes(item),
        owner = object ? lockOwner(scene, item.id) : null;
      row.style.setProperty(
        "--object-depth",
        object ? ancestors(scene, item.id).length : 0,
      );
      const pick = button(
        row,
        item.name ?? "Point light " + (scene.lights.indexOf(item) + 1),
        object ? (item.asset ? "assets" : "origin") : "light",
        () => onSelect(item.id),
      );
      pick.dataset.id = item.id;
      pick.dataset.light = String(!object);
      pick.setAttribute(
        "aria-pressed",
        String(
          session.selectionKind !== "material" && item.id === session.selected,
        ),
      );
      if (object) {
        const state = owner
          ? owner.id === item.id
            ? "locked"
            : "inherited"
          : "unlocked";
        const label =
          state === "inherited"
            ? `Locked by ${owner.name}`
            : `${owner ? "Unlock" : "Lock"} ${item.name}`;
        const lock = button(
          row,
          label,
          state === "inherited" ? "lockInherited" : owner ? "lock" : "unlock",
          () => session.toggleLock(item.id),
          true,
        );
        lock.dataset.lockState = state;
        lock.disabled = !!session.play || state === "inherited";
        lock.title = label;
        lock.setAttribute("aria-pressed", String(!!owner));
      }
      rows.append(row);
    }
    if (!selected || session.selectionKind === "material" || session.play)
      return;
    const owner = lockOwner(scene, selected.id);
    this.nameControl = new TextControl({
      host: fields,
      label: "Object name",
      value: selected.name,
      disabled: !!owner,
      onBegin: () => {
        session.document.cancel();
        session.document.begin("Rename object");
      },
      onPreview: (name) =>
        session.document.preview((p) => {
          p.scenes[session.sceneIndex].entities.find(
            (e) => e.id === selected.id,
          ).name = name;
        }),
      onFinish: (commit) => {
        if (commit) session.document.commit();
        else session.document.cancel();
      },
      onError,
    });
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = owner
      ? `Locked by ${owner.name}. Selection and inspection remain available.`
      : selected.asset
        ? "Geometry instance · local transform relative to its parent."
        : "Empty origin · attach geometry or add child objects.";
    fields.append(note);
    const actions = document.createElement("div");
    actions.className = "object-actions";
    fields.append(actions);
    if (owner && owner.id !== selected.id)
      button(actions, "Select locking parent", "lockInherited", () =>
        onSelect(owner.id),
      );
    const lock = button(
      actions,
      owner ? "Unlock object" : "Lock object",
      owner ? "lock" : "unlock",
      () => session.toggleLock(selected.id),
    );
    lock.disabled = !!owner && owner.id !== selected.id;
    button(actions, "Enter components", "scene", () =>
      session.enter(selected.id),
    );
    const parentLabel = document.createElement("label");
    parentLabel.className = "material-field";
    parentLabel.textContent = "Parent";
    const parent = document.createElement("select");
    parent.setAttribute("aria-label", "Object parent");
    const excluded = descendants(scene, selected.id);
    for (const [id, name] of [
      [null, "Scene origin"],
      ...scene.entities
        .filter((e) => !excluded.has(e.id))
        .map((e) => [e.id, e.name]),
    ]) {
      const o = document.createElement("option");
      o.value = id ?? "";
      o.textContent = name;
      parent.append(o);
    }
    parent.value = selected.parent ?? "";
    parent.disabled = !!owner;
    parentLabel.append(parent);
    fields.append(parentLabel);
    this.life.listen(parent, "change", () => {
      try {
        session.reparent(selected.id, parent.value || null);
      } catch (e) {
        onError(e);
      }
    });
    for (const [key, label] of [
      ["visible", "Visible"],
      ["selectable", "Selectable in viewport"],
    ]) {
      const wrap = document.createElement("label");
      wrap.className = "object-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected[key] !== false;
      input.disabled = !!owner;
      input.setAttribute("aria-label", label);
      wrap.append(input, document.createTextNode(label));
      fields.append(wrap);
      this.life.listen(input, "change", () => {
        try {
          session.setObjectFlag(selected.id, key, input.checked);
        } catch (e) {
          onError(e);
        }
      });
    }
    if (selected.asset) {
      const users = scene.entities.filter(
        (e) => e.asset === selected.asset,
      ).length;
      const info = document.createElement("p");
      info.className = "note";
      info.textContent = `Geometry source: ${selected.asset}. ${users} instances in this scene. Duplicates share the source; transforms and material overrides remain independent.`;
      fields.append(info);
      const unique = button(fields, "Make geometry unique", "copy", () =>
        session.makeGeometryUnique(),
      );
      unique.disabled = !!owner;
    }
  }
  dispose() {
    this.life.dispose();
    this.nameControl?.dispose();
    this.icons.dispose();
  }
}
