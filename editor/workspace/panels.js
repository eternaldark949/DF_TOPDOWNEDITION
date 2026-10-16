/** Studio / contextual panels. One inspector and asset browser serve every placed asset. */
import { MaterialPanel } from "./materials.js";
import { createMaterial } from "../../engine/basement/material.js";
import {
  TRANSFORM_PROPERTIES,
  LIGHT_PROPERTIES,
} from "../../engine/basement/properties.js";
import { PropertyInspector } from "../../engine/penthouse/property-inspector.js";
export class WorkspacePanels {
  /** Element references and callbacks are supplied by the application shell. */
  constructor(elements, { onSelect, onSelectMaterial, onPlace, onError }) {
    this.elements = elements;
    this.onSelectMaterial = onSelectMaterial;
    this.materialPanel = null;
    this.partId = null;
    this.partEntity = null;
    this.onSelect = onSelect;
    this.onPlace = onPlace;
    this.onError = onError;
    this.inspector = null;
    this.refreshing = false;
    this.filter = "";
  }
  /** Commit/cancel/context changes rebuild controls, never a high-rate pointer preview. */
  refresh(session) {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      this.materialPanel?.dispose();
      this.materialPanel = null;
      this.inspector?.dispose();
      this.inspector = null;
      const e = this.elements,
        scene = session.scene,
        doc = session.document;
      e.fields.replaceChildren();
      e.hierarchy.replaceChildren();
      e.scene.replaceChildren(
        ...doc.data.scenes.map((scene, i) => {
          const option = document.createElement("option");
          option.value = i;
          option.textContent = scene.name;
          return option;
        }),
      );
      e.scene.value = session.sceneIndex;
      const isMaterial = session.selectionKind === "material",
        material = isMaterial
          ? doc.data.materials.find((m) => m.id === session.selected)
          : null;
      const light = isMaterial
          ? null
          : scene.lights.find((l) => l.id === session.selected),
        entity = isMaterial
          ? null
          : scene.entities.find((e) => e.id === session.selected),
        target = material ?? light ?? entity;
      e.name.textContent = material
        ? material.name
        : light
          ? "Point light " + (scene.lights.indexOf(light) + 1)
          : (entity?.name ?? "Select an instance");
      e.id.textContent = target?.id ?? "";
      for (const item of [
        ...scene.entities.filter((e) => !e.locked),
        ...scene.lights,
      ]) {
        const button = document.createElement("button");
        button.textContent =
          item.name ?? "◈ Point light " + (scene.lights.indexOf(item) + 1);
        button.dataset.id = item.id;
        button.dataset.light = String(!item.name);
        button.setAttribute(
          "aria-pressed",
          String(!isMaterial && item.id === session.selected),
        );
        button.addEventListener("click", () => this.onSelect(item.id));
        e.hierarchy.append(button);
      }
      if (target && !material && !entity?.locked && !session.play) {
        const id = target.id,
          index = session.sceneIndex,
          resolve = (data) =>
            (light
              ? data.scenes[index].lights
              : data.scenes[index].entities
            ).find((e) => e.id === id);
        this.inspector = new PropertyInspector({
          host: e.fields,
          document: doc,
          resolve,
          properties: light ? LIGHT_PROPERTIES : TRANSFORM_PROPERTIES,
          onError: this.onError,
        });
      }
      if (!session.play && (material || (entity && !entity.locked))) {
        if (this.partEntity !== entity?.id) {
          this.partEntity = entity?.id;
          this.partId = null;
        }
        this.materialPanel = new MaterialPanel({
          host: e.fields,
          session,
          entity,
          materialId: material?.id,
          partId: this.partId,
          onPart: (id) => {
            this.partId = id;
            this.refresh(session);
          },
          onError: this.onError,
        });
      }
      this.renderMaterials(session);
      if (session.preview)
        for (const [id, item] of session.preview.instance.instances)
          for (const part of item.parts)
            part.highlight = !isMaterial && id === session.selected ? 1 : 0;
      this.renderAssets(session);
    } finally {
      this.refreshing = false;
    }
  }
  /** All packaged assets can be placed; source identity disambiguates similar palettes. */
  renderAssets(session) {
    const host = this.elements.assets;
    host.replaceChildren();
    const query = this.filter.trim().toLowerCase();
    for (const asset of session.document.data.assets.filter((a) =>
      (a.name + " " + a.id).toLowerCase().includes(query),
    )) {
      const button = document.createElement("button");
      button.className = "asset-card";
      button.dataset.asset = asset.id;
      button.setAttribute("aria-label", "Place " + asset.name);
      button.disabled = !!session.play;
      const swatch = document.createElement("span");
      swatch.className = "asset-swatch";
      const materialId = asset.parts.find((p) => p.shape)?.shape.material;
      const color = session.document.data.materials.find(
        (m) => m.id === materialId,
      )?.baseColor ?? [0.6, 0.4, 0.2];
      swatch.style.background = `rgb(${color.map((n) => Math.round(255 * Math.min(1, n ** (1 / 2.2)))).join(",")})`;
      const label = document.createElement("span"),
        name = document.createElement("strong"),
        detail = document.createElement("small");
      name.textContent = asset.name;
      detail.textContent = asset.id;
      label.append(name, detail);
      button.append(swatch, label);
      button.addEventListener("click", () => this.onPlace(asset.id));
      host.append(button);
    }
  }
  /** Material data blocks share this same contextual inspector, independently of object selection. */
  renderMaterials(session) {
    const host = this.elements.materials;
    if (!host) return;
    host.replaceChildren();
    const add = document.createElement("button");
    add.textContent = "New material";
    add.dataset.materialAction = "new";
    add.disabled = !!session.play;
    add.addEventListener("click", () => {
      try {
        session.document.cancel();
        const id = session.document.allocateId("material");
        session.document.edit("New material", (p) =>
          p.materials.push({
            id,
            name: "Material " + id.split(":").at(-1),
            ...createMaterial(),
          }),
        );
        this.onSelectMaterial(id);
      } catch (error) {
        this.onError(error);
      }
    });
    host.append(add);
    for (const material of session.document.data.materials) {
      const b = document.createElement("button");
      b.className = "asset-card";
      b.dataset.materialId = material.id;
      b.disabled = !!session.play;
      const swatch = document.createElement("span");
      swatch.className = "asset-swatch";
      swatch.style.background = `rgb(${material.baseColor.map((n) => Math.round(255 * Math.min(1, n ** (1 / 2.2)))).join(",")})`;
      const name = document.createElement("span");
      name.textContent =
        material.name + (material.emissionStrength > 0 ? " ✧" : "");
      b.append(swatch, name);
      b.addEventListener("click", () => this.onSelectMaterial(material.id));
      host.append(b);
    }
  }
  /** Cancelled properties cannot spawn replacement controls during application disposal. */
  dispose() {
    this.materialPanel?.dispose();
    this.materialPanel = null;
    this.inspector?.dispose();
    this.inspector = null;
  }
}
