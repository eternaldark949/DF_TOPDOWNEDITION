/** Penthouse / geometric capitals for architectural lettering. No font rasterization or atlas.
 * Baked strokes are real thin box beams and use the ordinary assembly batching/culling path.
 * This small signage alphabet is not a general text shaping/localization or world-label system. */
const GLYPHS = {
  A: [
    [0, 0, 0.5, 1],
    [0.5, 1, 1, 0],
    [0.23, 0.45, 0.77, 0.45],
  ],
  B: [
    [0, 0, 0, 1],
    [0, 1, 0.7, 1],
    [0.7, 1, 1, 0.75],
    [1, 0.75, 0.7, 0.5],
    [0.7, 0.5, 0, 0.5],
    [0.7, 0.5, 1, 0.25],
    [1, 0.25, 0.7, 0],
    [0.7, 0, 0, 0],
  ],
  C: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  D: [
    [0, 0, 0, 1],
    [0, 1, 0.65, 1],
    [0.65, 1, 1, 0.75],
    [1, 0.75, 1, 0.25],
    [1, 0.25, 0.65, 0],
    [0.65, 0, 0, 0],
  ],
  E: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0.5, 0.8, 0.5],
  ],
  F: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0.5, 0.8, 0.5],
  ],
  G: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0.5],
    [1, 0.5, 0.55, 0.5],
  ],
  H: [
    [0, 0, 0, 1],
    [1, 0, 1, 1],
    [0, 0.5, 1, 0.5],
  ],
  I: [
    [0, 1, 1, 1],
    [0.5, 1, 0.5, 0],
    [0, 0, 1, 0],
  ],
  J: [
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0.2],
  ],
  K: [
    [0, 0, 0, 1],
    [0, 0.5, 1, 1],
    [0, 0.5, 1, 0],
  ],
  L: [
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  M: [
    [0, 0, 0, 1],
    [0, 1, 0.5, 0.4],
    [0.5, 0.4, 1, 1],
    [1, 1, 1, 0],
  ],
  N: [
    [0, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 1, 1],
  ],
  O: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  P: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0, 0.5],
  ],
  Q: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0.6, 0.3, 1.15, -0.15],
  ],
  R: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0, 0.5],
    [0.5, 0.5, 1, 0],
  ],
  S: [
    [1, 1, 0, 1],
    [0, 1, 0, 0.5],
    [0, 0.5, 1, 0.5],
    [1, 0.5, 1, 0],
    [1, 0, 0, 0],
  ],
  T: [
    [0, 1, 1, 1],
    [0.5, 1, 0.5, 0],
  ],
  U: [
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 1],
  ],
  V: [
    [0, 1, 0.5, 0],
    [0.5, 0, 1, 1],
  ],
  W: [
    [0, 1, 0.25, 0],
    [0.25, 0, 0.5, 0.6],
    [0.5, 0.6, 0.75, 0],
    [0.75, 0, 1, 1],
  ],
  X: [
    [0, 1, 1, 0],
    [0, 0, 1, 1],
  ],
  Y: [
    [0, 1, 0.5, 0.5],
    [1, 1, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0],
  ],
  Z: [
    [0, 1, 1, 1],
    [1, 1, 0, 0],
    [0, 0, 1, 0],
  ],
};
/** Append centered XZ lettering to a builder. Fixed budgets are checked before writing. */
export function strokeLettering(
  builder,
  text,
  {
    height = 1,
    spacing = 0.22,
    width = 0.6,
    y = 0,
    z = 0,
    color = [1, 0.7, 0.3],
    emission = 0.5,
    thickness = 0.035,
  } = {},
) {
  const letters = [...text.toUpperCase()],
    total = (letters.length * (width + spacing) - spacing) * height;
  if (letters.length > 32 || letters.some((c) => c !== " " && !GLYPHS[c]))
    throw new Error("Sign supports at most 32 Latin capitals/spaces");
  const count = letters.reduce((n, c) => n + (GLYPHS[c]?.length ?? 0), 0);
  if (builder.asset.parts.length + count > 128)
    throw new Error("Sign exceeds assembly budget");
  letters.forEach((c, index) => {
    const start = -total / 2 + index * (width + spacing) * height;
    for (const [i, s] of (GLYPHS[c] ?? []).entries())
      builder.beam(
        "letter-" + index + "-" + i,
        [start + s[0] * height * width, y, z + s[1] * height],
        [start + s[2] * height * width, y, z + s[3] * height],
        height * thickness,
        height * 0.045,
        color,
        emission,
      );
  });
  return builder;
}
