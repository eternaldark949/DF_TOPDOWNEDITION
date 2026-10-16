/** Basement / standard opaque diffuse material. Base colour and emission are independent
 * linear RGB values; emission strength is dimensionless radiance gain, not a light object.
 * There is one material model today. No inert roughness/metallic controls or fake PBR type. */
export function createMaterial({
  baseColor = [0.3, 0.3, 0.4],
  emissionColor = [1, 1, 1],
  emissionStrength = 0,
} = {}) {
  const m = {
    baseColor: [...baseColor],
    emissionColor: [...emissionColor],
    emissionStrength,
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
  return m;
}
/** Copy numeric values into a retained object, preserving links held by every live shape. */
export function updateMaterial(target, source) {
  validateMaterial(source);
  for (const key of ["baseColor", "emissionColor"])
    for (let i = 0; i < 3; i++) target[key][i] = source[key][i];
  target.emissionStrength = source.emissionStrength;
  return target;
}
