/**
 * Basement / world: identity, transforms, attachments, and spatial membership.
 * Coordinates: x/y are horizontal world units; z is elevation; yaw is radians.
 * A world owns its entities. Identity is immutable and independent of array position.
 * This first representation supports yaw/local translation, not a skeletal solver.
 */
export class Identities {
  /** Engine-local monotonically increasing IDs; caller chooses the namespace. */
  constructor() { this.next = 1; }
  /** IDs are never reused during this engine's lifetime, even after scene disposal. */
  create(namespace) { return `${namespace}:${this.next++}`; }
}

export class World {
  /** Construct an empty world with an explicitly shared identity allocator. */
  constructor(id, identities) {
    this.id = id;
    this.identities = identities;
    this.entities = new Map();
    this.revision = 0;
    this.disposed = false;
  }

  /**
   * Add one entity. Shape is optional; invisible anchors allocate no GPU geometry.
   * Parent must already exist in this world: this prevents cycles and foreign links.
   * Shape size is full width/depth/height; its origin is its center.
   */
  create({ x = 0, y = 0, z = 0, yaw = 0, parent = null, shape = null } = {}) {
    if (this.disposed) throw new Error('Cannot create in a disposed world');
    if (parent && this.entities.get(parent.id) !== parent) throw new Error('Parent belongs to another world');
    const entity = {
      id: this.identities.create('entity'), worldId: this.id, parent,
      x, y, z, yaw, previous: { x, y, z, yaw },
      pose: { x, y, z, yaw }, shape,
    };
    this.entities.set(entity.id, entity);
    this.revision++;
    return entity;
  }

  /** Capture local transforms before a fixed update, for smooth render interpolation. */
  snapshot() {
    for (const e of this.entities.values()) {
      e.previous.x = e.x; e.previous.y = e.y;
      e.previous.z = e.z; e.previous.yaw = e.yaw;
    }
  }

  /**
   * Resolve interpolated world transforms in insertion order, without per-frame objects.
   * Parent-before-child is guaranteed by create(); shortest-arc yaw avoids full spins.
   */
  resolve(alpha = 1) {
    for (const e of this.entities.values()) {
      const a = e.previous, p = e.pose;
      const x = a.x + (e.x - a.x) * alpha;
      const y = a.y + (e.y - a.y) * alpha;
      const z = a.z + (e.z - a.z) * alpha;
      const turn = Math.atan2(Math.sin(e.yaw - a.yaw), Math.cos(e.yaw - a.yaw));
      const yaw = a.yaw + turn * alpha;
      if (e.parent) {
        const b = e.parent.pose, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        p.x = b.x + x * c - y * s; p.y = b.y + x * s + y * c;
        p.z = b.z + z; p.yaw = b.yaw + yaw;
      } else { p.x = x; p.y = y; p.z = z; p.yaw = yaw; }
    }
  }

  /** Remove an entity and descendants; snapshot the map so recursive removal is safe. */
  remove(entity) {
    if (this.entities.get(entity.id) !== entity) return;
    for (const child of [...this.entities.values()]) if (child.parent === entity) this.remove(child);
    this.entities.delete(entity.id);
    this.revision++;
  }

  /** Release CPU membership; Directory separately owns GPU/resource leases. */
  dispose() {
    if (this.disposed) return;
    this.entities.clear(); this.revision++; this.disposed = true;
  }
}
