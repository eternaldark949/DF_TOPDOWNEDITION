/** Basement / useful slider domains, distinct from hard numeric validation limits.
 * A power curve gives zero-based intensity controls more travel near dark values;
 * logarithmic tracks represent positive ratios such as exposure and scale. */
export function validateRange(range) {
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.max <= range.min ||
    !["linear", "log", "power", undefined].includes(range.curve) ||
    (range.curve === "log" && range.min <= 0)
  )
    throw new RangeError("Invalid slider domain");
  return range;
}
export function rangeValue(range, t) {
  const { min, max, curve } = range;
  t = Math.max(0, Math.min(1, t));
  return curve === "log"
    ? min * Math.pow(max / min, t)
    : min + (max - min) * (curve === "power" ? t * t : t);
}
export function rangeUnit(range, value) {
  const { min, max, curve } = range;
  const t =
    curve === "log"
      ? Math.log(Math.max(min, value) / min) / Math.log(max / min)
      : (value - min) / (max - min);
  return Math.max(
    0,
    Math.min(1, curve === "power" ? Math.sqrt(Math.max(0, t)) : t),
  );
}
