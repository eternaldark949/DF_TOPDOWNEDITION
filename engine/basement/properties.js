/**
 * Basement / shared editable-property metadata. These descriptors define validation,
 * labels and units for every inspector instance; controls do not invent field rules.
 * Rotation is stored as a unit quaternion, while the inspector presents XYZ degrees.
 *
 * Descriptor fields (all optional except key/label/unit/min/max/step):
 *   key          the stored field name, and the control's identity in the inspector
 *   path         where the value lives when it is nested, e.g. ["poses", partId, joint];
 *                defaults to [key]. Reads tolerate missing containers; writes create them.
 *   quaternion   stored as a unit quaternion, presented and written as XYZ degrees
 *   defaultValue shown when the stored value is absent
 *   omitDefault  writing the default removes the stored value (and containers it empties),
 *                so authored JSON records only what differs from rest (joint poses)
 *   keepContainers  with omitDefault: how many leading path containers always stay even
 *                when emptied (1 keeps a required `parameters` object); default 0
 *   components   axis labels for vector values; null for a scalar
 *   slider       optional display range/curve for NumberControl
 */
import { SURFACE_DEFAULTS } from "./material.js";
import { eulerRotation, rotationEuler } from "./rotation.js";
export const TRANSFORM_PROPERTIES = Object.freeze([
  {
    key: "position",
    label: "Position",
    unit: "m",
    components: ["X", "Y", "Z"],
    min: -10000,
    max: 10000,
    step: 0.5,
  },
  {
    key: "rotation",
    quaternion: true,
    slider:{min:-180,max:180},
    label: "Rotation",
    unit: "°",
    components: ["X", "Y", "Z"],
    min: -360,
    max: 360,
    step: 5,
  },
  {
    key: "scale",
    slider: {min:0.05,max:20,curve:"log"},
    label: "Uniform scale",
    unit: "×",
    components: null,
    min: 0.05,
    max: 20,
    step: 0.05,
  },
]);
export const LIGHT_PROPERTIES = Object.freeze([
  {
    key: "position",
    label: "Position",
    unit: "m",
    components: ["X", "Y", "Z"],
    min: -10000,
    max: 10000,
    step: 0.5,
  },
  {
    key: "color",
    color: true,
    label: "Linear irradiance",
    unit: "RGB",
    components: ["R", "G", "B"],
    min: 0,
    max: 16,
    step: 0.1,
  },
  {
    key: "radius",
    slider: {min:0.1,max:100,curve:"log"},
    label: "Radius",
    unit: "m",
    components: null,
    min: 0.1,
    max: 100,
    step: 0.5,
  },
]);
/** Stored location of a descriptor's value: its explicit path, or its key at the top level. */
const pathOf = (descriptor) => descriptor.path ?? [descriptor.key];

/** Read a detached display value. Quaternion storage never leaks a mutable reference. */
export function readProperty(target, descriptor) {
  let v = target;
  for (const key of pathOf(descriptor)) v = v?.[key];
  v ??= descriptor.defaultValue;
  if (descriptor.quaternion)
    return rotationEuler(v).map((n) => (n * 180) / Math.PI);
  return Array.isArray(v) ? [...v] : v;
}
/** Write only a declared numeric field, rejecting nonfinite/out-of-domain values atomically. */
export function writeProperty(target, descriptor, value) {
  const values = Array.isArray(value) ? value : [value];
  if (
    values.length !== (descriptor.components?.length ?? 1) ||
    !values.every(
      (n) => Number.isFinite(n) && n >= descriptor.min && n <= descriptor.max,
    )
  )
    throw new Error(`${descriptor.label}: value out of range`);
  const stored = descriptor.quaternion
      ? eulerRotation(...values.map((n) => (n * Math.PI) / 180))
      : Array.isArray(value)
        ? [...value]
        : value,
    path = pathOf(descriptor),
    leaf = path.at(-1);
  if (descriptor.omitDefault && sameValue(stored, descriptor.defaultValue)) {
    // Remove the leaf, then every container the removal left empty (deepest first).
    const chain = [target];
    for (const key of path.slice(0, -1)) {
      const next = chain.at(-1)[key];
      if (next === undefined) return;
      chain.push(next);
    }
    delete chain.at(-1)[leaf];
    const keep = descriptor.keepContainers ?? 0;
    for (let i = chain.length - 1; i > keep && !Object.keys(chain[i]).length; i--)
      delete chain[i - 1][path[i - 1]];
    return;
  }
  let container = target;
  for (const key of path.slice(0, -1)) container = container[key] ??= {};
  container[leaf] = stored;
}
/** Equal within float noise: degrees round-trip through quaternions inexactly. */
function sameValue(a, b) {
  if (b === undefined) return false;
  const x = Array.isArray(a) ? a : [a], y = Array.isArray(b) ? b : [b];
  return x.length === y.length && x.every((n, i) => Math.abs(n - y[i]) < 1e-9);
}

/**
 * Joint pose controls for one mesh part of a placed object: one quaternion property per
 * joint, stored at entity.poses[partId][joint] as an offset from the joint's rest rotation
 * (schema v4). Rest is the default and is omitted from JSON, so an unposed figure stores
 * nothing. Joint names come from the part's skeleton; nothing here knows any generator.
 */
export function poseProperties(partId, joints) {
  return Object.freeze(
    joints.map((joint) =>
      Object.freeze({
        key: `pose:${partId}:${joint}`,
        path: ["poses", partId, joint],
        quaternion: true,
        omitDefault: true,
        defaultValue: [0, 0, 0, 1],
        slider: { min: -180, max: 180 },
        label: joint,
        unit: "°",
        components: ["X", "Y", "Z"],
        min: -360,
        max: 360,
        step: 5,
      }),
    ),
  );
}

/**
 * Parameter controls for one authored mesh recipe, derived from its generator's parameter
 * catalog (Penthouse mesh-generators.js). Values live at mesh.parameters[key]; defaults
 * are omitted from JSON like joint rest rotations, so recipes record only their choices.
 */
export function meshParameterProperties(catalog) {
  return Object.freeze(
    catalog.map((p) =>
      Object.freeze({
        key: `parameter:${p.key}`,
        path: ["parameters", p.key],
        omitDefault: true,
        keepContainers: 1, // the schema requires `parameters`, even when empty
        defaultValue: p.value,
        label: p.label,
        unit: p.unit || "count",
        components: null,
        min: p.min,
        max: p.max,
        step: p.step,
        slider: { min: p.min, max: p.max },
      }),
    ),
  );
}

/** Every standard material can emit; colour is independent of the diffuse base colour. */
export const MATERIAL_PROPERTIES = Object.freeze([
  {
    key: "baseColor",
    color: true,
    label: "Base colour",
    unit: "linear RGB",
    components: ["R", "G", "B"],
    min: 0,
    max: 16,
    step: 0.05,
  },
  {
    key: "emissionColor",
    color: true,
    label: "Emission colour",
    unit: "linear RGB",
    components: ["R", "G", "B"],
    min: 0,
    max: 16,
    step: 0.05,
  },
  {
    key: "specularColor",
    label: "Specular colour",
    color: true,
    unit: "linear RGB",
    components: ["R", "G", "B"],
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SURFACE_DEFAULTS.specularColor,
  },
  {
    key: "specularSharpness",
    slider: {min:0,max:1},
    label: "Specular sharpness",
    unit: "0 soft · 1 polished",
    components: null,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SURFACE_DEFAULTS.specularSharpness,
  },
  {
    key: "reflectivity",
    slider: {min:0,max:1},
    label: "Reflectivity",
    unit: "F₀ · 0–1",
    components: null,
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SURFACE_DEFAULTS.reflectivity,
  },
  {
    key: "emissionStrength",
    slider: {min:0,max:32,curve:"power"},
    label: "Emission strength",
    unit: "×",
    components: null,
    min: 0,
    max: 32,
    step: 0.1,
  },
]);
