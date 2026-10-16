/** Basement / bloom settings and predictable target budgets. No GL or application policy.
 * Sizes are backing pixels; radii are pyramid texels, exposure/strength dimensionless. */
const DEFAULTS = Object.freeze({
  mode: "off",
  strength: 0.65,
  threshold: 1,
  knee: 0.6,
  radius: 1.25,
  scatter: 0.8,
  exposure: 1.25,
});
/** Validate an entire candidate before adopting it: bad UI/API input cannot half-configure a frame. */
export function bloomSettings(patch = {}, previous = DEFAULTS) {
  const s = { ...previous, ...patch };
  for (const key of Object.keys(patch))
    if (!(key in DEFAULTS))
      throw new RangeError(`Unknown bloom setting: ${key}`);
  if (!["off", "low", "high"].includes(s.mode))
    throw new RangeError("Bloom mode must be off, low or high");
  for (const [key, min, max] of [
    ["strength", 0, 3],
    ["threshold", 0, 16],
    ["knee", 0, 1],
    ["radius", 0.5, 3],
    ["scatter", 0, 1],
    ["exposure", 0.05, 8],
  ])
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
/** Requested storage estimate: RGBA16F=8, depth24 padded=4 bytes. Driver padding is excluded. */
export function bloomStorage(width, height, dimensions, samples) {
  const pyramid = dimensions.reduce(
    (n, d, i) =>
      n + d.width * d.height * 8 * (i === dimensions.length - 1 ? 1 : 2),
    0,
  );
  return width * height * 12 * (samples + 1) + pyramid;
}

/** Scene-linear clear radiance matching the historical display backdrop at exposure 1.25. */
export const BLOOM_BACKGROUND = Object.freeze([
  0.00011607027229163823, 0.00013073244809242254, 0.0005666143501070634,
]);
