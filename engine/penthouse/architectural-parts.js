/** Penthouse / pure architectural assembly authoring helpers. Output is portable part data;
 * no World, DOM, rendering, timers or game-specific palette is allocated here.
 * Segment and arch pieces become ordinary instanced boxes through toy.assembly. */
export class ArchitecturalParts {
  /** Caller supplies a stable asset ID/name and uses its own palette and placements. */
  constructor(id, name) {
    this.asset = {
      id,
      name,
      generator: "toy.assembly",
      generatorVersion: 1,
      parts: [],
      colliders: [],
    };
  }
  /** Full dimensions in metres; rotation is a quaternion in the assembly's local space. */
  box(
    id,
    position,
    size,
    color,
    emission = 0,
    rotation = [0, 0, 0, 1],
    decorative = false,
  ) {
    this.asset.parts.push({
      id,
      parent: null,
      position,
      rotation,
      shape: {
        size,
        color,
        emission,
        castShadow: !decorative,
        ambientBlocker: !decorative,
      },
    });
    return this;
  }
  /** A solid beam between endpoints in the local XZ plane; depth is along Y. */
  beam(id, a, b, width, depth, color, emission = 0) {
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      angle = -Math.atan2(dz, dx);
    return this.box(
      id,
      a.map((n, i) => (n + b[i]) / 2),
      [Math.hypot(dx, dz), depth, width],
      color,
      emission,
      [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
      true,
    );
  }
  /** Faceted semicircular trim; choose segment count explicitly to control detail cost. */
  arch(
    id,
    {
      x = 0,
      y = 0,
      z = 0,
      radius = 2,
      width = 0.12,
      depth = 0.2,
      segments = 20,
      color,
      emission = 0,
    },
  ) {
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI) / segments,
        b = ((i + 1) * Math.PI) / segments;
      this.beam(
        id + "-" + i,
        [x + radius * Math.cos(a), y, z + radius * Math.sin(a)],
        [x + radius * Math.cos(b), y, z + radius * Math.sin(b)],
        width,
        depth,
        color,
        emission,
      );
    }
    return this;
  }
  /** Planar circle/box movement collider, deliberately separate from decorative detail. */
  collider(x, y, width, depth) {
    this.asset.colliders.push({ x, y, width, depth });
    return this;
  }
}
