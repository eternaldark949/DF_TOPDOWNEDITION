# Game presentation

Presentation reads gameplay/entity state and submits renderer-neutral packets. Basement owns the actual Canvas backend, device resources, transforms and draw execution. Directory owns authored assets. Presentation does not allocate physical bodies or resolve collisions.

## weaponAppearance

Authored weapon materials, parts, muzzle/rail metadata and visual signatures live in `src/game/data/weapon-models.mjs`. The classic artist reads these exact shared, immutable definitions. Gameplay stats stay in `src/game/data/game-db/items.json`.

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

## Combat presentation

`combatPresentation({weapon_art,owns_art=false})` uses `render(context,blend,frame)` to read visible official projectiles, loot and status records, plus the player and registered actors' held weapon poses. It submits shape/text/sprite packets; `detach()` disposes owned art. `await installCombatPresentation(engine)` prepares assets and installs the lifecycle system with ownership cleanup. The shared runtime example uses it now. Collision, damage, projectile motion and item ownership remain in the documented native services.

`actorPresentation` submits visible NPC names/speech and Ganger detection/telegraph labels. It uses the renderer’s shared visible-entity query and native interpolated anchor points. The example’s separate generic body artist remains responsible for unconverted actor shapes; Drone and VelvetCat use the packet artists below. Full procedural humanoid animation is still pending. Rendering never advances actor or weapon policy.

`abilityPresentation` submits spell color/shape/glow packets from visible official projectiles. It is installed in the native runtime example; combatPresentation skips those bodies to prevent duplicate drawing. Authored definitions remain in Directory, and entity/ability classes contain no Canvas instructions. Full classic casting animation, fire trails and audio remain presentation work.

Shared held-weapon presentation now reads inventory through `api.attacks.getItems(entity)`. Plain native characters and custom subclasses need no items-property wrapper to use the same artist. The runtime example’s Attack menu routes ordinary player fire through the selected registered attack, including learned abilities.

For seated characters, held-weapon packets use `api.attacks.getMountedAttackPose(actor,{blend})`: interpolated native grip/heading plus shared-clock lean opacity. The body remains in its authoritative seat. Full humanoid/cabin/window art is still pending; these packets add no physical transforms or simulation clock.

`door.mjs` draws doors natively. `doorPresentation(door,{blend})` takes one entry of the map's `getDoors()` and reads each leaf's interpolated pose and box; `createDoorPackets(packet,{appearance})` turns it into frame packets on the art toolkit. A hinged leaf is a panel with shadow, sheen, outline, brass handles and pin, with a faint floor sweep once it is open; sliding leaves are panes over a track along the opening; a door with no leaves is an arch. Any kind works, so `double` and `saloon` draw both their leaves, and a door hinged on the right swings from its right end. The look is `data/game-door-appearance.json`, replaceable part by part; each door's authored `color` colours its leaves. The native apartment renderer draws each door once per frame when any of its leaves is in view, and arches by their opening. The classic city's own door objects still use the classic `indoor-door.js`.

## Props by family (`props/`)

A prop type in the catalog (`data/game-assets/props.json`) that names a `family` is a preset of it. A family is a kind of piece one artist draws (a bentwood chair, a round table, a fireplace), and its `look` in the catalog is a schema of the fields a type or a placement may set: colours, counts, choices and text. A piece's look is the family's defaults, then its type's `look`, then its placement's `look`, field by field, and the Directory refuses a field the family does not declare or a value of the wrong kind (`resolvePropLook`, `validateMapLayout(..., families)`). So a map places a chair and may recolour its seat with `"look": {"seats": ["#3e5a6e"]}`; the plant by the cafe's fire is `"look": {"fern": true}` and the cocoa crate `"look": {"label": "COCOA"}`.

`props/index.mjs`: `propArtPacket({appearance, position, rotation, width, height})` gathers what one piece shows (its whole look, its face, whether it runs vertical, and the seed of its detail, which is where it was placed, so every piece keeps the look the classic art gave it). `createPropDraws(packet, {time})` lists its draws in order: a ground shadow, then the family's still runs, each a picture with a key naming everything it shows, and its live parts (the espresso gauge, the embers, the turning record), built each frame. A family with a `loop` (the plant's sway) is painted as phase frames of its period. `drawPropArt(context, packet, {pictures, time})` draws them on a host Canvas pass through a Basement `pictureCache`, so a still piece costs one stamp a frame. `hasPropArt(family)` says whether a family has an artist.

`props/cafe.mjs` holds the cafe's 23 families, which draw all 25 of its `cc_` types. They match the classic artwork in Chromium for every piece placed in the cafe (`tools/test-prop-art.mjs`), within a few antialiased edge pixels. Both renderers use them: the native apartment renderer for a prop entity whose family has art, and the classic `drawPropAppearance` for a classic prop whose family has art (its pictures are `PropSprites.pictures`). The classic cafe drawers stay in `legacy/entities/props-decor.js` as the parity reference until the classic cafe retires. Every other prop still draws classic art; the next families come venue by venue.

`marionette.js` extracts the existing Canvas strings/body/blade-glint artwork from the classic physical entity. `drawMarionetteAppearance(ctx,packet,lights=false)` consumes pose, phase age, appearance seed/cloth and render time only; native actor classes contain no drawing calls. The native apartment renderer builds these records from actual interpolated native state. The classic preview uses the same artist without acquiring a second body. A portable frame-packet/WebGL version remains future work.

`gatling-gunner.js` owns retained ordinary gunner and Warden Canvas artwork. `drawGunnerAppearance(ctx,packet,heat=false)` consumes interpolated pose, telegraph/cycle fields and simulation-owned barrel phase/heat. The classic `_drawGunnerBody` hook still delegates to this artist, preserving silhouette capture callers. The native host draws barrel glow after room dimming without moving bodies or advancing visual clocks. Its inventory/held rotary model is separately defined as portable paths/materials in Directory. No native Warden encounter or portable whole-body artist is claimed.

## Drone and VelvetCat packet artists

These two artists now produce ordinary render packets. Their former direct Canvas methods, `Path2D` objects, baked legacy glow/shadow calls and draw-time eye writes have been removed. They work without a Canvas, DOM, native entity handle or callback in the output. Gameplay, fixed-step animation and presentation remain distinct.

| API | Result |
| --- | --- |
| `dronePresentation(entity,blend=1)` | Detached plain view record from the real native pose/action. |
| `createDronePackets(state,{pass:'body'})` | Ordered shadow, landing tell, tendril, arm, shell and eye geometry/material packets. |
| `createDronePackets(state,{pass:'lights'})` | Additive eye/lance glow, attack tells, tether and beam packets. |
| `velvetPresentation(entity,blend=1)` | Detached plain pose/cosmetic record. |
| `createVelvetCatArt(state)` | `{body,eyes}`: ordered silhouette, gait/pose, coat, clipped shading, head/paw/tail packets and world-space eye anchors. |
| `createVelvetEyePackets(state,{eyes,darkness})` | Later eyeshine packets; reuse the body's returned eye anchors to avoid rebuilding its geometry. |
| `createVelvetCatPackets(state,{pass:'body'|'eyes',darkness})` | Convenience API for a single pass; the eye-only call can derive its own anchors without requiring an earlier draw. |

```js
const state=velvetPresentation(cat,blend);
const art=createVelvetCatArt(state);
for(const packet of art.body)frame.submit({...packet,layer:20,depth:cat.position[1]});
// Submit after the scene's darkness pass, using the same view record and anchors.
for(const packet of createVelvetEyePackets(state,{eyes:art.eyes,darkness:.8}))
    frame.submit({...packet,layer:60,depth:cat.position[1]});
```

The art toolkit (`artScene`, shapes, `glow`, `groundShadow`, colour and seeded-random helpers) now lives in the engine: `engine/basement/rendering/art.mjs`. It is a data builder, not a virtual Canvas context. Artists directly construct portable path arrays and material descriptors. Groups compose affine packet transforms; clip geometry keeps its creation frame relative to each emitted shape. No Canvas operation is recorded for later replay. Geometry never changes simulation state.

`velvet-cat-animation.mjs` owns the existing `velvetCatAnimation`, `createVelvetAnimation` and `advanceVelvetAnimation` cosmetic APIs. The entity imports that module independently of drawing. Animation still advances on the fixed step using actual native travel and its separate cosmetic RNG. Drawing neither advances animation nor adds `_eyeWorld` fields to entities.

`actorPresentation` now submits Drone/Velvet body and light packets in addition to NPC/enemy HUD text. It accepts `{get_darkness:(entity,context)=>number}` for scene lighting policy (default .8 in the dark runtime example). The runtime example's generic body painter skips these two concrete types, avoiding duplicate circle bodies. Its “Velvet & Drone” button creates actual registered actors to demonstrate the normal frame/backend path.

The playable apartment host submits the same data at its existing body and lighting boundaries. Its other artwork remains classic. The remaining classic Drone/Velvet callers use `classic-actor-packets.js`, a thin host adapter that passes packets to `canvasRenderer.drawPackets`. Its weak eye-anchor cache belongs to presentation, not an actor or physics world. The adapter does not retain the former artists. No new physics system, renderer clock or per-actor Canvas is introduced.

Eleven pre-conversion Chromium captures in `tools/fixtures/actor-art` cover five feline poses and six Drone/effect states. The browser acceptance test compares pixels to these originals, checks classic callers without the old glow/shadow helpers, and exercises native frame rendering with the Canvas migration adapter deliberately disabled. Unit tests also run the packet stream through a separate backend and verify frozen inputs, clip transforms, deterministic geometry and unchanged physics snapshots. This establishes the converted artists' coverage; it does not claim full scene parity or an FPS improvement.

Marionette, gunners/Wardens, Demoness, humanoids and the broader world/UI artists still need renderer-neutral artwork conversion. A WebGL backend remains future work.

The former `droneAppearance.draw/drawLights` and `velvetCatAppearance.draw/drawEyeShine` Canvas artists are no longer exported. Use the packet APIs above. Numeric Drone helpers are `droneLift(state)` and `droneArmPose(diving,stuck,side)`; the classic public `Drone.armPose` hook delegates to the same helper. Cosmetic animation now uses the explicitly named `velvetCatAnimation` object.

`lighting.mjs` is the game's lighting look over the Basement light layer, restoring the classic indoor lighting to native scenes. `levelLights(level,{blend,lightAt})` lists a native level's lights: its lamps (shadowed by walls), the props that carry a light and the layout's soft and strip lights, each with its room's switch. `new sceneLighting(world).createLayer({bounds,kind,sky_darkness,rooms,lights,time})` returns the layer's packets and the opacity to draw them at, and keeps each lamp's visibility polygon until the lamp moves. Rooms thin the dark: an outdoor room shows the sky's darkness, and a lit room with a `fill` is no darker than that. The look (tint, darkness, cut and glow profiles, flicker) is `data/game-lighting.json`. The native apartment renderer draws it with `canvasRenderer.drawLayer` where it used to lay a flat dim over each room.
