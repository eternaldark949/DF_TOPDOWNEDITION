/** Studio / material context in the universal inspector. Linked definitions use the same
 * numeric controls/history as transforms and lights. Assignment/private copies are explicit. */
import { Lifetime } from "../../engine/basement/lifetime.js";
import { createMaterial } from "../../engine/basement/material.js";
import {
  partMaterial,
  assignMaterial,
  isolateMaterial,
  materialUsage,
} from "../../engine/basement/material-authoring.js";
import { MATERIAL_PROPERTIES } from "../../engine/basement/properties.js";
import { PropertyInspector } from "../../engine/penthouse/property-inspector.js";
export class MaterialPanel {
  /** Build one object-part or standalone material context; the workspace owns its lifetime. */
  constructor({
    host,
    session,
    entity = null,
    materialId = null,
    partId = null,
    onPart = () => {},
    onError,
  }) {
    this.life = new Lifetime();
    this.doc = session.document;
    this.activeName = false;
    this.inspector = null;
    const doc = this.doc,
      index = session.sceneIndex,
      asset = entity
        ? doc.data.assets.find((a) => a.id === entity.asset)
        : null;
    const parts = asset?.parts.filter((p) => p.shape) ?? [],
      part = parts.find((p) => p.id === partId) ?? parts[0];
    if (entity && !part) return;
    const id = materialId ?? partMaterial(entity, part),
      material = doc.data.materials.find((m) => m.id === id);
    if (!material) return;
    const heading = document.createElement("h3");
    heading.textContent = "Linked material";
    host.append(heading);
    /** All DOM fields are scoped to this panel; rebuilding cannot retain old document references. */
    const select = (label, items, value, change) => {
      const wrap = document.createElement("label");
      wrap.className = "material-field";
      wrap.textContent = label;
      const input = document.createElement("select");
      input.setAttribute("aria-label", label);
      for (const [id, name] of items) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = name;
        input.append(option);
      }
      input.value = value;
      wrap.append(input);
      host.append(wrap);
      this.life.listen(input, "change", () => {
        try {
          change(input.value);
        } catch (error) {
          onError(error);
        }
      });
    };
    const resolveEntity = (data) =>
      data.scenes[index].entities.find((e) => e.id === entity?.id);
    if (entity) {
      select(
        "Surface part",
        parts.map((p) => [p.id, p.id]),
        part.id,
        (value) => {
          doc.cancel();
          onPart(value);
        },
      );
      select(
        "Assigned material",
        doc.data.materials.map((m) => [m.id, m.name]),
        id,
        (value) =>
          doc.edit("Assign material", (data) =>
            assignMaterial(resolveEntity(data), part.id, value),
          ),
      );
    }
    const usage = materialUsage(doc.data, id),
      notice = document.createElement("p");
    notice.className = "note";
    notice.dataset.materialUsers = usage.surfaces;
    notice.textContent = `Shared by ${usage.surfaces} placed surfaces in ${usage.instances} instances. Edits update every linked user, including other scenes.`;
    host.append(notice);
    const label = document.createElement("label");
    label.className = "material-field";
    label.textContent = "Material name";
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 120;
    name.value = material.name;
    name.setAttribute("aria-label", "Material name");
    label.append(name);
    host.append(label);
    this.life.listen(name, "focus", () => {
      doc.cancel();
      doc.begin("Rename material");
      this.activeName = true;
    });
    this.life.listen(name, "input", () => {
      try {
        doc.preview((data) => {
          data.materials.find((m) => m.id === id).name = name.value;
        });
        name.setCustomValidity("");
      } catch (error) {
        name.setCustomValidity(error.message);
      }
    });
    this.life.listen(name, "blur", () => {
      if (!this.activeName) return;
      this.activeName = false;
      if (name.validity.valid) doc.commit();
      else {
        doc.cancel();
        onError(new Error(name.validationMessage));
      }
    });
    this.life.listen(name, "keydown", (e) => {
      if (e.key === "Enter") name.blur();
      if (e.key === "Escape") {
        this.activeName = false;
        doc.cancel();
        name.value = material.name;
        name.blur();
      }
    });
    const response = document.createElement("p");
    response.className = "note";
    response.textContent = "Reflectivity sets direct-light reflectance. Sharpness shapes the highlight; specular colour tints it. Emission stays independent. Scene/mirror reflections and transparency are not enabled.";
    host.append(response);
    const fields = document.createElement("div");
    fields.dataset.material = id;
    host.append(fields);
    this.inspector = new PropertyInspector({
      host: fields,
      focusHost: host,
      document: doc,
      resolve: (data) => data.materials.find((m) => m.id === id),
      properties: MATERIAL_PROPERTIES,
      onError,
    });
    const button = document.createElement("button");
    button.textContent = entity
      ? "Make single user for this instance"
      : "Duplicate material";
    button.dataset.materialAction = entity ? "single-user" : "duplicate";
    button.disabled = !!session.play;
    host.append(button);
    this.life.listen(button, "click", () => {
      try {
        doc.cancel();
        const newId = doc.allocateId("material");
        doc.edit(button.textContent, (data) => {
          if (entity) isolateMaterial(data, resolveEntity(data), id, newId);
          else
            data.materials.push({
              id: newId,
              name: (material.name + " · copy").slice(0, 120),
              ...createMaterial(material),
            });
        });
        if (!entity) session.selectMaterial(newId);
      } catch (error) {
        onError(error);
      }
    });
  }
  /** Cancel unfinished text/numeric transactions before detaching their event listeners. */
  dispose() {
    if (this.activeName) {
      this.activeName = false;
      this.doc.cancel();
    }
    this.inspector?.dispose();
    this.life.dispose();
  }
}
