/** Basement / geometry: pure horizontal collision helpers, with no world or game dependency. */

/** Does a horizontal circle overlap an axis-aligned box? Touching is permitted. */
export function circleOverlapsBox(x, y, radius, box) {
  const nearX = Math.max(box.x - box.width / 2, Math.min(x, box.x + box.width / 2));
  const nearY = Math.max(box.y - box.depth / 2, Math.min(y, box.y + box.depth / 2));
  return (x - nearX) ** 2 + (y - nearY) ** 2 < radius ** 2;
}
