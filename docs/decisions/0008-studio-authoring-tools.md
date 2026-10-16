# Studio authoring tools and DFAB presentation

Implemented 2026-10-16 under the owner's green light. This extends decision [0007](0007-studio-first-workspace.md); its first-workspace limits are historical where this record explicitly replaces them. The representative Freelancer street block and new articulated humanoid remain the next content stages.

## Delivered workspace

Studio now has charcoal panels, warm gold and violet accents, compact tools, Scene/Assets tabs, a searchable project-wide asset library and responsive contextual properties. Typography is offline. HTML supplies interface controls; the viewport, grid, rotation dial and light markers are native WebGL2. No Canvas2D or additional frame scheduler was introduced.

Choose an asset, then tap the horizontal construction plane to place it. Placement accounts for the asset's nested transformed bounds so its lowest point rests on Z=0. Duplicate shares the asset definition while assigning a fresh persistent placement ID; Delete removes that placement. Both are undoable. Numeric transforms and the ring use the same document history and properties.

The rotation ring uses an explicit X/Y/Z axis and World/Local space, with free, 5°, 15° or 45° snapping. One drag is one command. Pointer cancellation, focus/context changes and Escape restore the starting snapshot. The ring is a real plane in world space with a 48 CSS-pixel radius; use a suitable camera view when an axis is edge-on, or use numeric rotation. Point lights have position/radius/color properties and cannot use the entity rotation tool.

Grid visibility and point-light markers are independent of snapping and lighting. Markers select the existing light inspector and support Move. Grid, marker and rotation geometry never enter the authored world, collider list, shadow caster list or AO blockers. Play releases the guides; Stop reconstructs them. View preferences are best-effort local browser settings, separate from project JSON, undo and recovery.

## House ownership and source guide

| Home | Responsibility |
| --- | --- |
| `engine/basement/lines.js` | Renderer-owned, bounded retained GL_LINES layers; uploads, context restoration and disposal |
| `engine/basement/rotation-gesture.js` | Ray/plane intersection, world/local axes, shared plane basis, angle unwrapping and quaternion composition |
| `engine/basement/asset-bounds.js` | Nested assembly bounds without allocating a temporary World |
| `engine/basement/document.js` | Monotonic authored-ID allocation and existing atomic history |
| `engine/directory/scene-instance.js` | Reconcile additions/removals/asset replacements by authored identity, preserve unaffected runtime roots and refresh collider/picking membership |
| `engine/penthouse/authoring-guides.js` | Reusable grid, camera-readable light markers and rotation-ring presentation/picking |
| `engine/lobby/` | Existing scheduler; pointer previews still coalesce in its input phase |
| `editor/workspace/` | Session commands, viewport gestures, panels and separately stored view preferences |
| `examples/atrium/project.js` | Atrium-specific anchor protection and clone-role policy, injected into the editor |

The editor does not encode named game tags in its generic command classes. Atrium protects its required interaction anchors from deletion and clears unique interaction roles from copies. Other applications supply their own policy. Imported/project data still validates before adoption. Asset-definition geometry changes require reopen; live topology reconciliation is for placed entities, not a claim of an asset geometry editor.

Each guide layer owns a fixed-capacity CPU array and GPU buffer. A vertex requests 28 bytes (XYZ plus RGBA floats); the Studio uses two 1,024-vertex layers at most, with one shared lazy shader program. The grid uses depth testing; foreground widgets remain readable. Dirty guide geometry uploads once; hidden grid work stops. The last layer releases the shared program. Resource diagnostics count requested CPU/GPU buffer bytes, draw/upload counts and active layers; `renderer.lines` is a bounded CPU profiler scope and the existing GPU timer covers the full render submission. No line GPU resources are allocated in the game-only path unless requested.

## Verification and remaining work

See [current screenshots and results](../milestones/studio-tools/README.md). Checks cover touch placement/rotation/cancellation, topology identity/collider cleanup, history, light picking/movement, repeat Play/Stop and live line-resource context restoration/disposal. The broader rendering suite continues to exercise AO, shadows, input, flitting and scene lifetimes.

The next content milestone is Enni Cole's exterior, pavement, streetlights, planters and player, then approach → interact → enter → return. The new procedural humanoid still requires front/side/three-quarter/gameplay-camera solid-silhouette review before detailed surfacing, followed by walking/turning and backpack readability. Neither content milestone is claimed by these editor tools.

Perspective/free-flight cameras, arbitrary mesh/skinning, reparenting, source-part editing, specialist tool registration, full 3D contact physics and general dependency streaming remain future work. Software Chromium/emulated touch establishes behavior, not physical-phone performance.
