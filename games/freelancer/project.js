/** Freelancer / package identity, game conventions and Studio policies. JSON is authoritative. */
import data from "./content/project.json" with { type: "json" };
import { validateProject } from "../../engine/basement/project.js";
import { ASSEMBLY_GENERATORS } from "../../engine/penthouse/assembly.js";
import { portalPosition } from "./portals.js";
/** Validate the game extension before loading, importing or packaging any world. */
export function validateFreelancerProject(project) {
  validateProject(project, { generators: ASSEMBLY_GENERATORS });
  if (project.id !== "freelancer.enni-slice.v1" || project.scenes.length !== 2)
    throw new Error("Expected the two-scene Freelancer slice");
  const vector = (v, n) =>
    Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  for (const scene of project.scenes) {
    const b = scene.navigation,
      c = scene.camera;
    if (
      !b ||
      ![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) ||
      b.maxX <= b.minX ||
      b.maxY <= b.minY
    )
      throw new Error(scene.id + ": invalid navigation bounds");
    if (!vector(scene.spawn, 3) || scene.spawn[2] < 0 || scene.spawn[2] >= 0.5)
      throw new Error(scene.id + ": invalid spawn");
    if (
      !c ||
      ![c.x, c.y, c.z, c.azimuth, c.elevation, c.halfHeight].every(
        Number.isFinite,
      ) ||
      c.halfHeight < 5 ||
      c.halfHeight > 50 ||
      c.elevation <= 0.1 ||
      c.elevation > Math.PI / 2
    )
      throw new Error(scene.id + ": invalid camera");
    if (!Array.isArray(scene.portals) || scene.portals.length !== 1)
      throw new Error(scene.id + ": expected one linked doorway");
    const p = scene.portals[0];
    if (
      typeof p.id !== "string" ||
      !scene.entities.some((e) => e.id === p.anchor) ||
      !vector(p.offset, 3) ||
      !vector(p.arrivalOffset, 3) ||
      !Number.isFinite(p.radius) ||
      p.radius <= 0 ||
      p.radius > 4 ||
      typeof p.label !== "string" ||
      !p.label.length ||
      p.label.length > 80
    )
      throw new Error(scene.id + ": invalid doorway");
    const target = project.scenes.find((s) => s.id === p.targetScene),
      back = target?.portals?.find((other) => other.id === p.targetPortal);
    if (!back || back.targetScene !== scene.id || back.targetPortal !== p.id)
      throw new Error(scene.id + ": unresolved reciprocal doorway");
    const pos = portalPosition(scene, p);
    if (
      pos[0] < b.minX ||
      pos[0] > b.maxX ||
      pos[1] < b.minY ||
      pos[1] > b.maxY
    )
      throw new Error(scene.id + ": doorway outside navigation bounds");
  }
  return project;
}
export const FREELANCER_PROJECT = validateFreelancerProject(data);
/** Portal anchors are required content; this policy stays outside generic engine/editor tools. */
export function canRemoveFreelancerEntity(
  entity,
  project = FREELANCER_PROJECT,
) {
  return (
    !entity.locked &&
    !project.scenes.some((s) => s.portals.some((p) => p.anchor === entity.id))
  );
}
