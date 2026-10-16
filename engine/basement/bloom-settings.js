/** Basement / bloom settings and predictable target budgets. No GL or application policy.
 * Sizes are backing pixels; radii are pyramid texels, strength dimensionless. */
/** One parameter catalog supplies both API validation and shared Studio/game controls.
 * Radius stays explicitly measured in pyramid texels; haze adds broad radiance, not volume fog. */
export const BLOOM_PARAMETERS = Object.freeze(
  [
    {
      key: "strength",
      label: "Bloom strength",
      min: 0,
      max: 16,
      step: 0.1,
      hint: "Glow intensity, independent of scene exposure.",
    },
    {
      key: "radius",
      label: "Bloom spread",
      min: 0.5,
      max: 8,
      step: 0.1,
      hint: "Halo reach in coarse pyramid texels.",
    },
    {
      key: "scatter",
      label: "Bloom scatter",
      min: 0,
      max: 1,
      step: 0.05,
      hint: "More weight on broad scales; 1 uses the broadest reconstruction.",
    },
    {
      key: "haze",
      label: "Bloom haze",
      min: 0,
      max: 4,
      step: 0.05,
      hint: "Extra broad glow from the smallest scale; this is screen-space bloom.",
    },
    {
      key: "threshold",
      label: "Bloom threshold",
      min: 0,
      max: 16,
      step: 0.05,
      hint: "Lower values let more of the lit scene glow; 0 includes all radiance.",
    },
    {
      key: "knee",
      label: "Bloom soft knee",
      min: 0,
      max: 1,
      step: 0.05,
      hint: "Softens the transition around the brightness threshold.",
    },
  ].map((p) => Object.freeze(p)),
);
const DEFAULTS = Object.freeze({
  mode: "off",
  strength: 0.65,
  threshold: 1,
  knee: 0.6,
  radius: 1.25,
  scatter: 0.8,
  haze: 0,
});
/** Validate an entire candidate before adopting it: bad UI/API input cannot half-configure a frame. */
export function bloomSettings(patch = {}, previous = DEFAULTS) {
  const s = { ...previous, ...patch };
  for (const key of Object.keys(patch))
    if (!Object.hasOwn(DEFAULTS, key))
      throw new RangeError(`Unknown bloom setting: ${key}`);
  if (!["off", "low", "high"].includes(s.mode))
    throw new RangeError("Bloom mode must be off, low or high");
  for (const { key, min, max } of BLOOM_PARAMETERS)
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new RangeError(`Bloom ${key} must be ${min}–${max}`);
  return Object.freeze(s);
}
/** Keep aspect ratio at the first half-size level, then halve to bounded broad-halo scales. */
export function bloomDimensions(width, height, mode) {
  if (mode === "off") return [];
  const cap = mode === "high" ? 1024 : 512,
    levels = mode === "high" ? 7 : 6,
    scale = Math.min(0.5, cap / Math.max(width, height));
  let w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  const result = [];
  for (let i = 0; i < levels; i++) {
    result.push({ width: w, height: h });
    if (w === 1 && h === 1) break;
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  return result;
}
/** Filter storage estimate: each RGBA16F texel is 8 bytes; no scene/depth/MSAA ownership. Driver padding is excluded. */
export function bloomStorage(dimensions) {
  return dimensions.reduce(
    (n, d, i) =>
      n + d.width * d.height * 8 * (i === dimensions.length - 1 ? 1 : 2),
    0,
  );
}
