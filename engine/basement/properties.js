/**
 * Basement / shared editable-property metadata. These descriptors define validation,
 * labels and units for every inspector instance; controls do not invent field rules.
 * Rotation is stored as a unit quaternion, while the inspector presents XYZ degrees.
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
    label: "Rotation",
    unit: "°",
    components: ["X", "Y", "Z"],
    min: -360,
    max: 360,
    step: 5,
  },
  {
    key: "scale",
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
    label: "Radius",
    unit: "m",
    components: null,
    min: 0.1,
    max: 100,
    step: 0.5,
  },
]);
/** Read a detached display value. Quaternion storage never leaks a mutable reference. */
export function readProperty(target, descriptor) {
  if (descriptor.key === "rotation")
    return rotationEuler(target.rotation).map((n) => (n * 180) / Math.PI);
  const v = target[descriptor.key] ?? descriptor.defaultValue;
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
  target[descriptor.key] =
    descriptor.key === "rotation"
      ? eulerRotation(...values.map((n) => (n * Math.PI) / 180))
      : Array.isArray(value)
        ? [...value]
        : value;
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
    label: "Emission strength",
    unit: "×",
    components: null,
    min: 0,
    max: 32,
    step: 0.1,
  },
]);
