/** Basement / material binding commands over plain project data. UI/history and runtime
 * objects stay outside these functions. IDs are injected by the document allocator. */
import { createMaterial } from "./material.js";
/** Resolve a placement's part binding, including an explicit single-instance override. */
export function partMaterial(entity, part) {
  return Object.hasOwn(entity.materialOverrides ?? {}, part.id)
    ? entity.materialOverrides[part.id]
    : part.shape.material;
}
/** Use an own data property even for IDs such as __proto__; authored IDs are never object prototypes. */
export function assignMaterial(entity, partId, materialId) {
  entity.materialOverrides ??= {};
  Object.defineProperty(entity.materialOverrides, partId, {
    value: materialId,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
/** Report placed surface users across scenes, rather than counting unused source definitions. */
export function materialUsage(project, id) {
  let surfaces = 0,
    instances = 0;
  for (const scene of project.scenes)
    for (const entity of scene.entities) {
      const asset = project.assets.find((a) => a.id === entity.asset);
      let used = false;
      for (const part of asset.parts)
        if (part.shape && partMaterial(entity, part) === id) {
          surfaces++;
          used = true;
        }
      if (used) instances++;
    }
  return { surfaces, instances };
}
/** Duplicate the definition; only this placement's currently matching parts become private users. */
export function isolateMaterial(project, entity, sourceId, newId) {
  const source = project.materials.find((m) => m.id === sourceId);
  if (!source) throw new Error("Missing source material");
  const m = {
    id: newId,
    name: (source.name + " · copy").slice(0, 120),
    ...createMaterial(source),
  };
  project.materials.push(m);
  const asset = project.assets.find((a) => a.id === entity.asset);
  for (const part of asset.parts)
    if (part.shape && partMaterial(entity, part) === sourceId)
      assignMaterial(entity, part.id, newId);
  return m;
}
