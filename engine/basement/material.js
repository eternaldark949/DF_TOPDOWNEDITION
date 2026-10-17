/** Basement / standard opaque surface material. Base colour and emission are independent
 * linear RGB values; emission strength is dimensionless radiance gain, not a light object.
 * Specular response is direct-light GGX; reflectivity is normal-incidence reflectance,
 * not a mirror/scene-reflection texture. Omitted optional fields preserve legacy diffuse output. */
/** Stable defaults are shared read-only data; every live material copies its own arrays. */
export const SURFACE_DEFAULTS = Object.freeze({
  specularColor: Object.freeze([1, 1, 1]),
  specularSharpness: 0.5,
  reflectivity: 0,
});
export function createMaterial({
  baseColor = [0.3, 0.3, 0.4],
  emissionColor = [1, 1, 1],
  emissionStrength = 0,
  specularColor = SURFACE_DEFAULTS.specularColor,
  specularSharpness = SURFACE_DEFAULTS.specularSharpness,
  reflectivity = SURFACE_DEFAULTS.reflectivity,
} = {}) {
  const m = {
    baseColor: [...baseColor],
    emissionColor: [...emissionColor],
    emissionStrength,
    specularColor: [...specularColor],
    specularSharpness,
    reflectivity,
  };
  validateMaterial(m);
  return m;
}
/** Validate authored/runtime material data before adoption; no partial mutation on failure. */
export function validateMaterial(m) {
  for (const key of ["baseColor", "emissionColor"])
    if (
      !Array.isArray(m?.[key]) ||
      m[key].length !== 3 ||
      !m[key].every((n) => Number.isFinite(n) && n >= 0 && n <= 16)
    )
      throw new RangeError(
        `Material ${key} needs three linear RGB components in 0–16`,
      );
  if (
    !Number.isFinite(m.emissionStrength) ||
    m.emissionStrength < 0 ||
    m.emissionStrength > 32
  )
    throw new RangeError("Material emission strength must be 0–32");
  // Optional version-two extension: missing fields use runtime defaults, present invalid
  // fields are rejected. Validation never fills or mutates authored JSON.
  if (
    m.specularColor !== undefined &&
    (!Array.isArray(m.specularColor) ||
      m.specularColor.length !== 3 ||
      !m.specularColor.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
  )
    throw new RangeError(
      "Material specularColor needs three linear RGB components in 0–1",
    );
  for (const key of ["specularSharpness", "reflectivity"])
    if (
      m[key] !== undefined &&
      (!Number.isFinite(m[key]) || m[key] < 0 || m[key] > 1)
    )
      throw new RangeError(`Material ${key} must be 0–1`);
  return m;
}
/** Copy numeric values into a retained object, preserving links held by every live shape. */
export function updateMaterial(target, source) {
  validateMaterial(source);
  for (const key of ["baseColor", "emissionColor", "specularColor"])
    for (let i = 0; i < 3; i++)
      target[key][i] = (source[key] ?? SURFACE_DEFAULTS[key])[i];
  target.emissionStrength = source.emissionStrength;
  target.specularSharpness =
    source.specularSharpness ?? SURFACE_DEFAULTS.specularSharpness;
  target.reflectivity = source.reflectivity ?? SURFACE_DEFAULTS.reflectivity;
  return target;
}
