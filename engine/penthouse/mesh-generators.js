/**
 * Penthouse / mesh generators: the catalog of procedural meshes a project may reference.
 *
 * An authored mesh asset (project schema v4, `project.meshes`) names a generator, its
 * version and its parameters, exactly as assembly assets name `toy.assembly`. This file is
 * the single list of what exists:
 *   - MESH_GENERATORS describes each generator to validation (no allocation): its
 *     version, a parameter check, and the joint names its skeleton will have, so authored
 *     poses are checked before a project is adopted rather than when it is drawn.
 *   - meshLibraries() supplies the matching Directory factories, which build MeshData
 *     (CPU only). Directory/authored-meshes.js leases the GPU copy.
 * Adding a generator means one entry in each, with the same name and version. Changing a
 * generator's output for the same parameters means bumping its version.
 *
 * Generated meshes are the first mesh source; explicit vertex meshes (polygon modeling)
 * join this contract later as another generator-shaped source.
 */
import { TUBE_PARAMETERS, tubeOptions, tubeRecipe } from "./skinned-tube.js";

/**
 * Generator descriptors, one per name:
 *   version     bump when the same parameters would build different geometry
 *   parameters  the parameter catalog (key, label, default value, limits, step, unit) that
 *               editors draw controls from
 *   validate    throws on unknown or out-of-range parameters
 *   joints      the skeleton's joint names for valid parameters (empty for rigid meshes)
 */
export const MESH_GENERATORS = Object.freeze({
  "mesh.tube": Object.freeze({
    version: 1,
    label: "Tube",
    parameters: TUBE_PARAMETERS,
    validate: (parameters) => tubeOptions(parameters),
    joints: (parameters) => Array.from({ length: tubeOptions(parameters).joints }, (_, i) => `joint${i}`),
  }),
});

/** Directory factories keyed like MESH_GENERATORS: parameters in, MeshData out. */
export function meshLibraries() {
  return {
    "mesh.tube": (parameters) => tubeRecipe(parameters).mesh,
  };
}
