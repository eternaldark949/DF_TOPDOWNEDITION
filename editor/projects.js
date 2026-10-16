/** Studio / installed application catalog. This is the only place the workspace chooses games.
 * Shared tools/session/renderer never import these games, names or interaction conventions.
 * Imported data resolves by explicit package identity before behavior or recovery is adopted. */
import {
  ATRIUM_PROJECT,
  validateAtriumProject,
  cloneAtriumEntity,
  canRemoveAtriumEntity,
} from "../examples/atrium/project.js";
import { createScene } from "../examples/atrium/scene.js";
import {
  FREELANCER_PROJECT,
  validateFreelancerProject,
  canRemoveFreelancerEntity,
} from "../games/freelancer/project.js";
import { createFreelancerScene } from "../games/freelancer/scene.js";
export const STUDIO_PROJECTS = Object.freeze([
  {
    project: ATRIUM_PROJECT,
    label: "Atrium",
    validate: validateAtriumProject,
    play: createScene,
    clone: cloneAtriumEntity,
    canRemove: canRemoveAtriumEntity,
    select: (scene) => scene.entities.find((e) => e.tag === "planter")?.id,
    help: "WASD / stick walk · F flit · E light",
  },
  {
    project: FREELANCER_PROJECT,
    label: "Freelancer",
    validate: validateFreelancerProject,
    play: createFreelancerScene,
    clone: (entity) => entity,
    canRemove: canRemoveFreelancerEntity,
    select: (scene) =>
      scene.entities.find((e) => e.asset === "street.cypress")?.id,
    help: "WASD / stick walk · E / A enter or return",
  },
]);
/** Stable package identity chooses explicit validation/behavior; arbitrary JS is never imported. */
export function studioProject(project) {
  const entry = STUDIO_PROJECTS.find((e) => e.project.id === project.id);
  if (!entry)
    throw new Error("This project has no installed Studio application");
  return entry;
}
export function validateStudioProject(project) {
  return studioProject(project).validate(project);
}
