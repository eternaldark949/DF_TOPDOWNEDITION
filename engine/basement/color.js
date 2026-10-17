/** Basement / colour-space math. Authored RGB is linear radiance; wheel/hex use sRGB.
 * HDR hue editing separates a normalized display colour from a linear gain >= 1.
 * These pure functions own no DOM, GL resources or mutable shared state. */
export function linearToSrgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
export function srgbToLinear(x) {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
/** HSV components are hue degrees and saturation/value fractions. Hue wraps at 360. */
export function hsvToRgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60;
  const c = v * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = v - c;
  const rgb =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return rgb.map((n) => n + m);
}
/** Retain the caller's hue for greys/black, so lowering brightness never loses hue. */
export function rgbToHsv(rgb, fallbackHue = 0) {
  const [r, g, b] = rgb,
    max = Math.max(...rgb),
    min = Math.min(...rgb),
    d = max - min;
  let h = fallbackHue;
  if (d > 1e-10)
    h =
      60 *
      (max === r
        ? ((g - b) / d + 6) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4);
  return [h, max === 0 ? 0 : d / max, max];
}
/** A display swatch cannot represent HDR energy; return both hex and explicit gain. */
export function colorDisplay(linear) {
  const gain = Math.max(1, ...linear),
    rgb = linear.map((n) => linearToSrgb(n / gain));
  const hex =
    "#" +
    rgb
      .map((n) =>
        Math.round(Math.max(0, Math.min(1, n)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return { gain, rgb, hex };
}
