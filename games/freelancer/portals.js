/** Freelancer / authored doors and planar walking rules. No renderer or asynchronous mutation.
 * Portal positions follow their placed anchor, so Studio edits move the interaction too. */
import { objectPose } from "../../engine/basement/objects.js";
import { rotateVector } from "../../engine/basement/rotation.js";
/** Resolve a local portal offset through its anchor's quaternion and uniform scale. */
export function portalPosition(scene, portal) {
  const anchor = objectPose(scene, portal.anchor),
    out = [0, 0, 0],
    q = anchor.rotation.map((n) => n / Math.hypot(...anchor.rotation));
  rotateVector(q, ...portal.offset.map((n) => n * anchor.scale), out);
  return out.map((n, i) => n + anchor.position[i]);
}
/** Nearest reachable interaction in ground distance; triggers require a fresh explicit action. */
export function nearbyPortal(scene, root) {
  let best = null,
    distance = Infinity;
  for (const portal of scene.portals) {
    const p = portalPosition(scene, portal),
      d = Math.hypot(root.x - p[0], root.y - p[1]);
    if (d <= portal.radius && d < distance) {
      best = portal;
      distance = d;
    }
  }
  return best;
}
/** Shared movement/commit legality, using the destination world's indexed collision data. */
export function legalPosition(resource, pose) {
  const b = resource.scene.navigation,
    r = 0.38;
  return (
    Number.isFinite(pose.x) &&
    Number.isFinite(pose.y) &&
    Number.isFinite(pose.z) &&
    pose.z >= 0 &&
    pose.z < 0.5 &&
    pose.x > b.minX + r &&
    pose.x < b.maxX - r &&
    pose.y > b.minY + r &&
    pose.y < b.maxY - r &&
    !resource.grid.overlaps(pose.x, pose.y, r)
  );
}
/** Destination coordinates are evaluated at the boundary, using current authored anchors. */
export function portalLanding(scene, id) {
  const portal = scene.portals.find((p) => p.id === id),
    p = portalPosition(scene, portal);
  return {
    x: p[0] + portal.arrivalOffset[0],
    y: p[1] + portal.arrivalOffset[1],
    z: 0.1,
    yaw: portal.arrivalOffset[1] > 0 ? Math.PI : 0,
  };
}
