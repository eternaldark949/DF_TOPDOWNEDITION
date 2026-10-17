/** Basement / authored object tree. Origin-only nodes and geometry-bearing components
 * share identity, local transforms and inherited editor restrictions. No game/DOM policy.
 * Parent-before-child storage is validated at the project boundary, not repaired per frame. */
import { rotateVector, multiplyRotation } from "./rotation.js";
/** Ordered ancestors, closest first; callers can explain exactly where a lock originates. */
export function ancestors(scene, id) {
  const list = [];
  let node = scene.entities.find((e) => e.id === id);
  while (node?.parent) {
    node = scene.entities.find((e) => e.id === node.parent);
    if (!node) break;
    list.push(node);
  }
  return list;
}
/** Nearest effective lock, retaining its identity for inherited-lock explanations. */
export function lockOwner(scene, id) {
  const node = scene.entities.find((e) => e.id === id);
  return [node, ...ancestors(scene, id)].find((e) => e?.locked) ?? null;
}
/** Branch membership never treats null selection as the implicit scene root. */
export function descendants(scene, id) {
  if (!scene.entities.some((e) => e.id === id)) return new Set();
  const ids = new Set([id]);
  for (const e of scene.entities) if (ids.has(e.parent)) ids.add(e.id);
  return ids;
}
/** Compose one local origin with an optional resolved parent. Shared by bulk and path
 * queries so gameplay does not need a complete scene pose map for a single anchor. */
function composePose(e, p) {
  const length = Math.hypot(...e.rotation),
    q = e.rotation.map((n) => n / length),
    position = [...e.position];
  let rotation = q,
    scale = e.scale;
  if (p) {
    rotateVector(p.rotation, ...position.map((n) => n * p.scale), position);
    for (let i = 0; i < 3; i++) position[i] += p.position[i];
    rotation = [0, 0, 0, 1];
    multiplyRotation(p.rotation, q, rotation);
    scale *= p.scale;
  }
  return {
    position,
    rotation,
    scale,
    visible: e.visible !== false && (p?.visible ?? true),
  };
}
/** Resolved poses are derived data. Bulk editor display resolves each object once. */
export function objectPoses(scene) {
  const poses = new Map();
  for (const e of scene.entities)
    poses.set(e.id, composePose(e, poses.get(e.parent)));
  return poses;
}
/** Resolve only one ancestry path for occasional/gameplay anchor queries. No full-scene
 * map or per-object pose arrays are allocated for unrelated geometry. Missing IDs return null. */
export function objectPose(scene, id) {
  const node = scene.entities.find((e) => e.id === id);
  if (!node) return null;
  const path = [node, ...ancestors(scene, id)];
  let pose;
  for (let i = path.length - 1; i >= 0; i--) pose = composePose(path[i], pose);
  return pose;
}
/** Convert a world-space point or orientation into the selected parent's local space. */
export function localPoint(scene, parent, world) {
  const p = objectPoses(scene).get(parent);
  if (!p) return [...world];
  const v = world.map((n, i) => (n - p.position[i]) / p.scale);
  rotateVector(p.rotation, ...v, v, true);
  return v;
}
/** Parent-conjugate conversion for world-space rotation gestures. Uniform scale adds no shear. */
export function localRotation(scene, parent, world) {
  const p = objectPoses(scene).get(parent);
  if (!p) return [...world];
  const out = [0, 0, 0, 1],
    inv = p.rotation.map((n, i) => (i < 3 ? -n : n));
  multiplyRotation(inv, world, out);
  return out;
}
/** Reparent in world space, keeping every descendant's pose stable. IDs survive reorder. */
export function reparentObject(scene, id, parent) {
  const node = scene.entities.find((e) => e.id === id);
  if (!node) throw new Error("Missing object");
  const branch = descendants(scene, id);
  if (
    parent &&
    (branch.has(parent) || !scene.entities.some((e) => e.id === parent))
  )
    throw new Error("Invalid parent");
  const poses = objectPoses(scene),
    pose = poses.get(id);
  node.position = localPoint(scene, parent, pose.position);
  node.rotation = localRotation(scene, parent, pose.rotation);
  node.scale = pose.scale / (poses.get(parent)?.scale ?? 1);
  node.parent = parent;
  const ordered = [],
    pending = new Set(scene.entities);
  while (pending.size) {
    let changed = false;
    for (const e of pending)
      if (!e.parent || ordered.some((p) => p.id === e.parent)) {
        ordered.push(e);
        pending.delete(e);
        changed = true;
      }
    if (!changed) throw new Error("Object cycle");
  }
  scene.entities = ordered;
}
