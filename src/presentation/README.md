# Game presentation

Presentation reads gameplay/entity state and submits renderer-neutral packets. Basement owns the actual Canvas backend, device resources, transforms and draw execution. Directory owns authored assets. Presentation does not allocate physical bodies or resolve collisions.

## weaponAppearance

Authored weapon materials, parts, muzzle/rail metadata and visual signatures live in `src/directory/weapon-appearance.mjs`. The classic artist reads these exact shared, immutable definitions. Gameplay stats stay in `src/directory/game-db/items.json`.

`weaponAppearance` compiles those parts to paths, gradients, clips and glow materials. It prepares offscreen target descriptors through `renderSystem`, then bakes a model/laser variant on first use. Warm frames submit one sprite per weapon. A successful renderer frame marks only targets actually drawn as complete. Aborted/failed frames retry; switching renderers invalidates the caches and reconstructs art from the definitions. It never creates a Canvas, context, Path2D, image handle or private graphics device.

```js
import {weaponAppearance} from './weapon-appearance.mjs';
const art = await new weaponAppearance().prepare(engine.api.render);
engine.registerSystem('held-weapon', {
    render(context, blend, frame) {
        const weapon=context.api.items.getEquippedWeapon();
        if (!weapon) return;
        const pose=context.api.session.player.getRenderState(blend);
        art.draw(frame,weapon.definition_id,{
            position:pose.position,rotation:pose.rotation,scale:[1,1],
            laser:context.api.items.hasAttachment('laser_sight'),layer:20
        });
    }
});
// At an idle resource boundary, before disposing the renderer:
engine.removeSystem('held-weapon');
art.dispose();
```

This example anchors art to the body origin. A character artist supplies its hand/grip pose separately; art does not reposition a body or choose a projectile trajectory.

| API | Contract |
|---|---|
| `new weaponAppearance({resource_prefix='weapon-art'}={})` | Dedicated target namespace; resource collisions reject. |
| `await prepare(render)` | Prepare all authored model/laser targets at an idle boundary; no rendering clock or DOM listener. |
| `draw(frame,definition_id,{laser=false,...pose}={})` | Static weapon sprite using packet position/rotation/scale/matrix/space/layer/depth/opacity. Unknown visual IDs use the existing catalog fallback. |
| `invalidate()` | Request rebake at next use. |
| `dispose()` | Unsubscribe and release owned targets. Wait for preparation before disposal. |

This is the portable **static weapon art**, including faceting, glass, emitters and laser-module appearance. Live breathing lights, moving glints, humanoid animation, attack trails, world loot artists and the classic `drawWeapon` callers still need conversion. The classic playable artist continues its cached Canvas drawing with the same Directory models. No WebGL backend or full-game art parity is claimed.

`render.onFrameRendered(handler)` returns an unsubscribe. After a synchronous backend successfully draws a frame, its event contains immutable `targets` (IDs written by the frame). Headless packet collection and failed/aborted frames do not notify. Resource mutation remains forbidden during notification; presentation only updates its cache bookkeeping. Backend changes are reported separately by `onSurfaceChanged`.

Verification: `node --test tools/test-weapon-appearance.mjs` and `python tools/test-weapon-appearance-browser.py`. The browser draws all models with/without the laser module and compares warm-cache and replacement-backend pixels while verifying unchanged physical state.
