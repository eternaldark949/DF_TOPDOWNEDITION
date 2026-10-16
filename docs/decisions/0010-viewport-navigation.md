# Studio viewport navigation and current light parameters

**Perspective update:** [decision 0011](0011-perspective-camera.md) adds the shared perspective lens, depth-correct AO/picking/guides and complete pose restoration. Camera limitations below describe the earlier milestone.

Implemented 2026-10-16 following the owner's request for proper viewport camera controls. This extends the universal workspace, keeping authored document edits separate from the editor's camera. It does not change either standalone game's camera or renderer.

## Navigation

| Device/action | Result |
| --- | --- |
| Middle drag, or Alt + left drag | Orbit about the current focus |
| Right drag, or Shift + middle drag | Pan in the camera's view plane |
| Wheel/trackpad scroll | Zoom toward the pointer |
| Orbit / Pan toolbar mode | One-finger or left-button camera drag |
| Two fingers in any tool | Pan with the midpoint and pinch to zoom |
| F / Frame selected | Frame the selected assembly's full bounds, or a point light's influence radius |
| Home / Frame all | Frame authored geometry, including the ground; exclude editor guides |
| Reset view | Restore the scene's initial authored framing, or the default Atrium view |
| Escape / pointer cancellation / focus loss | Restore the current camera gesture's starting pose |

The camera remains **orthographic**. Azimuth wraps and elevation stops just short of either pole; you can inspect the sides and underside without inverting the control basis. Pan uses the focus plane, so front/side views work without a ground-plane intersection. Orthographic half-height is bounded to 0.25–200 m. Frame operations preserve orientation and add a margin within that zoom limit. The existing ±200 m camera depth span is unchanged. Perspective, fly navigation and camera animation are future work.

Camera controls do not edit project JSON or enter undo history. They are temporary view state, restored after Play/Stop and reset when opening a scene/project. Existing grid/light-marker preferences remain independently stored; the new camera pose is not a new browser-persisted preference or an automatic change to the game's authored camera.

## Gesture ownership and house placement

- **Basement:** `camera-navigation.js` supplies view-plane pan, pointer-anchored zoom, bounded orbit, framing and copied camera poses. `asset-bounds.js` adds resolved world bounds, optionally restricted to supplied runtime IDs.
- **Penthouse:** `viewport-navigation.js` is the reusable device/control adapter. The caller injects enabled/mode queries, edit interruption and an input-phase subscription. It has no game names, DOM IDs, GPU resources or animation loop.
- **Lobby:** the existing input phase consumes the latest pointer positions. Pointerup flushes the final endpoint; high-rate moves do not queue separate frame jobs.
- **Studio:** `workspace/framing.js` resolves authored selection to runtime assembly parts or a light's radius. `viewport.js` coordinates object gestures with camera ownership; `main.js` composes toolbar buttons, shortcuts and framing.

A first touch is deferred until it is a tap or an actual transform drag. A second finger cancels any unfinished object edit and claims navigation. This prevents two-finger movement from placing an asset or committing an accidental transform. After lifting one finger, the remaining touch cannot silently become an object-edit gesture. Extra fingers cannot replace the owning pair. Mouse shortcuts similarly interrupt object previews before moving the camera. Play, tool changes and disposal release gestures and captures. Ctrl/Cmd+F retains its browser meaning; plain F frames selection.

No renderer path, instance layout or lighting algorithm changed. Game-only HTML outputs remain byte-identical to the prior milestone. The shared widget is imported by Studio only. Camera navigation adds no GPU buffers, programs or textures.

## Light objects available today

These are the **current shared Studio inspector/authored-project fields**, not a promise that all renderer API settings are per-object controls:

| Parameter | Meaning and authored range |
| --- | --- |
| Position XYZ | World metres, −10,000 to +10,000 on each axis |
| Linear irradiance RGB | Colour and relative strength together; 0–16 per channel, including values above 1 |
| Radius | Influence reach, 0.1–100 m |

There is no separate intensity slider, enabled checkbox, colour-temperature field, emitter-size setting, direction or cone angle on these point-light objects. Multiplying all three RGB channels changes strength while preserving their proportions. Zero RGB contributes no illumination. Hiding a light marker only hides an editor guide.

The current schema contains eight point-light slots per scene. Ambient RGB and one directional sun's direction/colour are authored scene data, not editable point-light fields. There is no general Add/Delete light workflow yet. Point lights have no meaningful orientation; their rotation tool remains disabled.

The engine's Lighting API additionally supports one shadowed sun and at most one selected shadowed point slot. Engine-level options include Off/Low/High sun quality (512²/1024² maps), sun coverage extent, world-unit depth/normal bias, filter softness, selected point index, point cube resolution (128/256/512) and refresh budget (1–60 Hz). These are engine configuration, not serialized per-light inspector options. Runtime `setPoint` permits radius zero to disable a slot and a wider RGB/radius domain than the authored format; Studio uses the narrower bounds above. See [the lighting API](0005-lighting-and-shadows.md).

Spot/area lights, photometric units, temperature controls, multiple shadowed point lights, clustered lighting and volumetric scattering remain future work. Bloom and fog have not been added by this camera milestone.

[Current screenshots and verification](../milestones/viewport-navigation/README.md) record actual mouse/touch checks and known limits. Emulated touch/software WebGL does not establish physical-phone performance.
