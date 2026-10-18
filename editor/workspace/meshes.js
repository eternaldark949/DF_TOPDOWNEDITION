/**
 * Studio / mesh context in the universal inspector (project schema v4, decision 0023).
 *
 * Shown beneath a selected object whose geometry source has mesh parts. It composes the
 * same shared PropertyInspector used for transforms, lights and materials, so joint poses
 * and recipe parameters get the same numeric controls, previews, one-command focus
 * sessions, Escape cancellation and undo history:
 *   - Joint pose: per-object offsets from rest, stored at entity.poses[partId][joint].
 *     Joint names come from the part's resident skeleton in the editor preview, so this
 *     panel knows no generator. Rest is omitted from JSON (descriptor omitDefault).
 *   - Mesh recipe: the linked mesh asset's generator parameters, drawn from the injected
 *     generator catalog. Like a linked material, edits update every part that uses it.
 *
 * Ownership: the workspace builds one MeshPanel per refresh and disposes it before the
 * next; the panel owns only its DOM listeners and inspectors. It never touches runtime
 * poses directly: the document change is applied by the preview's SceneInstance, and Play
 * builds its own instance from a detached copy, so animation there cannot edit the file.
 */
import { Lifetime } from "../../engine/basement/lifetime.js";
import { lockOwner } from "../../engine/basement/objects.js";
import {
  poseProperties,
  meshParameterProperties,
} from "../../engine/basement/properties.js";
import { PropertyInspector } from "../../engine/penthouse/property-inspector.js";

export class MeshPanel {
  /** `meshGenerators` is the application's generator catalog (name → descriptor). */
  constructor({ host, session, entity, meshGenerators, onPart, onError }) {
    this.life = new Lifetime();
    this.inspectors = [];
    const doc = session.document,
      index = session.sceneIndex,
      asset = doc.data.assets.find((a) => a.id === entity.asset),
      parts = asset?.parts.filter((p) => p.shape?.mesh !== undefined) ?? [];
    if (!parts.length || !session.preview) return;
    // One part selection serves materials and meshes; fall back to the first mesh part.
    const part = parts.find((p) => p.id === session.surfacePart) ?? parts[0],
      mesh = doc.data.meshes.find((m) => m.id === part.shape.mesh),
      readOnly = !!lockOwner(session.scene, entity.id) || !!session.play,
      resolveEntity = (data) =>
        data.scenes[index].entities.find((e) => e.id === entity.id);

    const heading = document.createElement("h3");
    heading.textContent = "Mesh";
    host.append(heading);
    const section = document.createElement("div");
    section.dataset.meshPart = part.id;
    section.dataset.mesh = mesh.id;
    host.append(section);
    if (parts.length > 1) {
      const wrap = document.createElement("label"),
        select = document.createElement("select");
      wrap.className = "material-field";
      wrap.textContent = "Mesh part";
      select.setAttribute("aria-label", "Mesh part");
      for (const p of parts) {
        const option = document.createElement("option");
        option.value = option.textContent = p.id;
        select.append(option);
      }
      select.value = part.id;
      wrap.append(select);
      section.append(wrap);
      this.life.listen(select, "change", () => {
        doc.cancel();
        onPart(select.value);
      });
    }

    // Joint pose: present only for skinned meshes (a rigid mesh has no skeleton).
    const joints =
      session.preview.instance.part(entity.id, part.id)?.skin?.skeleton.jointNames ?? [];
    if (joints.length) {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent =
        "Joint rotations are offsets from rest for this object only. Zero is the rest pose and is not stored.";
      section.append(note);
      const fields = document.createElement("div");
      fields.dataset.jointPose = part.id;
      section.append(fields);
      this.inspectors.push(
        new PropertyInspector({
          host: fields,
          focusHost: host,
          document: doc,
          resolve: resolveEntity,
          properties: poseProperties(part.id, joints),
          disabled: readOnly,
          onError,
        }),
      );
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Reset pose";
      reset.dataset.meshAction = "reset-pose";
      reset.disabled = readOnly || !entity.poses?.[part.id];
      section.append(reset);
      this.life.listen(reset, "click", () => {
        try {
          doc.cancel();
          doc.edit("Reset pose", (data) => {
            const e = resolveEntity(data);
            delete e.poses[part.id];
            if (!Object.keys(e.poses).length) delete e.poses;
          });
        } catch (error) {
          onError(error);
        }
      });
    }

    // Mesh recipe: the linked data block, shared by every part that names it.
    const generator = Object.hasOwn(meshGenerators, mesh.generator)
      ? meshGenerators[mesh.generator]
      : null;
    if (!generator?.parameters) return;
    const users = doc.data.assets.reduce(
        (n, a) => n + a.parts.filter((p) => p.shape?.mesh === mesh.id).length,
        0,
      ),
      recipe = document.createElement("p");
    recipe.className = "note";
    recipe.dataset.meshUsers = users;
    recipe.textContent = `${mesh.name} · ${generator.label ?? mesh.generator} recipe, used by ${users} geometry parts. Edits rebuild every linked user. Removing joints is refused while a pose still uses them.`;
    section.append(recipe);
    const fields = document.createElement("div");
    fields.dataset.meshRecipe = mesh.id;
    section.append(fields);
    this.inspectors.push(
      new PropertyInspector({
        host: fields,
        focusHost: host,
        document: doc,
        resolve: (data) => data.meshes.find((m) => m.id === mesh.id),
        properties: meshParameterProperties(generator.parameters),
        // Recipes are project data, not this object's: an object lock does not guard them.
        disabled: !!session.play,
        onError,
      }),
    );
  }

  /** Cancel unfinished numeric transactions before detaching listeners. */
  dispose() {
    for (const inspector of this.inspectors) inspector.dispose();
    this.inspectors.length = 0;
    this.life.dispose();
  }
}
