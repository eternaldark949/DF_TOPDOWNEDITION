/**
 * Basement / transfer: validated, synchronous movement of one attachment tree.
 * No loading, scheduling, game rules, callbacks during mutation, or resource ownership.
 * Lobby calls this at a simulation boundary after Directory prepares the destination.
 */

/**
 * Move a root and all descendants without changing object references or entity IDs.
 * landing uses destination world units/radians. Omitted z/yaw preserve current values.
 * validate is a pure destination query: return true or a human-readable refusal string.
 * All fallible validation happens before membership changes; failures leave both worlds intact.
 */
export function transferTree({ source, destination, root, landing, validate = () => true }) {
  if (source.disposed || destination.disposed) throw new Error('Transfer world is disposed');
  if (source === destination) throw new Error('Transfer requires distinct worlds');
  if (source.identities !== destination.identities) throw new Error('Worlds use different identity domains');
  if (source.entities.get(root.id) !== root || root.parent) throw new Error('Transfer requires a source-owned root');
  const pose = { x: landing.x, y: landing.y, z: landing.z ?? root.z, yaw: landing.yaw ?? root.yaw };
  if (!Object.values(pose).every(Number.isFinite)) throw new Error('Landing must contain finite coordinates');

  // World insertion order is parent-before-child. One pass gathers the entire tree,
  // preserving that order for destination transform resolution. Unrelated actors stay put.
  const members = [], ids = new Set([root.id]);
  for (const entity of source.entities.values()) {
    if (entity !== root && !ids.has(entity.parent?.id)) continue;
    if (entity.worldId !== source.id) throw new Error('Inconsistent source membership');
    if (destination.entities.has(entity.id)) throw new Error('Destination identity collision');
    members.push(entity); ids.add(entity.id);
  }
  const result = validate(destination, pose, root);
  if (result !== true) throw new Error(typeof result === 'string' ? result : 'Destination landing is blocked');

  // No user callbacks run in this mutation block. JavaScript executes it synchronously;
  // simulation/render observers can see only the fully committed destination membership.
  for (const entity of members) source.entities.delete(entity.id);
  Object.assign(root, pose);
  for (const entity of members) {
    entity.worldId = destination.id; destination.entities.set(entity.id, entity);
    // Reset interpolation history: never draw a streak through the old world/anchor.
    Object.assign(entity.previous, { x: entity.x, y: entity.y, z: entity.z, yaw: entity.yaw });
  }
  source.revision++; destination.revision++;
  return Object.freeze({ sourceId: source.id, destinationId: destination.id,
    rootId: root.id, entityIds: Object.freeze(members.map(entity => entity.id)) });
}
