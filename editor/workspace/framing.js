/** Studio / selection semantics for framing. Bounds/camera maths stay in Basement;
 * the application resolves authored selection to a runtime assembly or light influence. */
import { worldBounds } from "../../engine/basement/asset-bounds.js";
/** Frame the complete placed hierarchy, or the point light's actual influence radius. */
export function selectedBounds(session) {
  if(session.selectionKind==='material')return null;
  const item = session.preview?.instance.instances.get(session.selected);
  if (item)
    return worldBounds(
      session.preview.world,
      new Set(item.parts.map((p) => p.id)),
    );
  const light = session.scene.lights.find((l) => l.id === session.selected);
  return light
    ? {
        min: light.position.map((n) => n - light.radius),
        max: light.position.map((n) => n + light.radius),
      }
    : null;
}
/** Full scene includes authored ground and every asset, excluding transient editor guides. */
export function sceneBounds(session) {
  return session.preview ? worldBounds(session.preview.world) : null;
}
