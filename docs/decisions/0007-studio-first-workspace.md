# First Studio workspace and portable Atrium

**Perspective update:** [decision 0011](0011-perspective-camera.md) adds the shared perspective lens, depth-correct AO/picking/guides and complete pose restoration. Camera limitations below describe the earlier milestone.

Implemented 2026-10-16 following the owner's green light. This record supersedes the implementation-status statements in decision 0006; its broader universal-tool and 3D-engine ambitions remain the roadmap.

**Implementation update:** [decision 0008](0008-studio-authoring-tools.md) adds project-wide asset placement, duplicate/delete, rotation, grid/light guides and DFAB-inspired styling. Descriptions below record the initial milestone.

## Delivered contracts

- **Basement:** unit-quaternion transforms, inherited uniform scale, orthographic camera/projection/inverse rays, oriented-box picking, a bounded portable-project schema, shared numeric property descriptors, and atomic preview/commit/cancel/undo/redo document history.
- **Directory:** scene instantiation through registered generators, authored/runtime identity mapping, and transform/collider invalidation together. Preview batches use named Directory leases. Asset IDs resolve before adoption; registered generator versions resolve before opening/building.
- **Penthouse:** data-driven box assemblies, shared contextual numeric inspector controls, and the existing profiler viewer. There is no game content or Studio DOM lookup in engine source.
- **Lobby:** still the only frame owner. Pointer move previews coalesce through its input phase; the existing preparation/residency pipeline owns Play worlds. Edit and Play are mutually exclusive application contexts, with held input cleared at their boundary. A general engine input-context stack is not claimed.
- **Studio application:** one hierarchy, asset inventory, contextual inspector, selection/move tools, camera presets/orbit/zoom, snapping, file import/export, best-effort recovery, and isolated Play/Stop. HTML supplies accessible panels; the actual viewport and selection material highlighting are WebGL.
- **Example/build:** Atrium content now comes from `examples/atrium/project.json`, including grouped planters, galleries, lamps, and light data. Game behavior stays JavaScript. JSON imports embed into separate game and Studio HTML builds. GitHub Actions runs source tests/build and uploads both artifacts without deploying or writing to the repository.

See [the field and editing guide](../../examples/atrium/DOCUMENTS.md) for schema, coordinate conventions, ownership, budgets and current editing limits. `editor/main.js` is the application entry, while `editor/workspace/session.js`, `viewport.js`, and `editor/documents/files.js` own separate lifetimes and responsibilities. ETRNLNINE's composition root did not acquire editor/game policy.

## Architectural choices

The initial project is one portable package containing asset and scene tables. This is a deliberate phone-friendly first schema, not a claim that general multi-file manifests, arbitrary generators or dependency streaming have shipped. Source JSON is authoritative; the old layout/palette literals were removed. Explicitly imported dependencies are embedded and escaped as data, including HTML closing-tag text. Only the selected build graph is packaged. Studio source is absent from the game-only graph.

Full orientation is `[x,y,z,w]`, with Z up and local XYZ Euler controls in degrees. A positive **uniform** instance scale composes cleanly through parent trees without shear. Render geometry, cast-shadow geometry, culling, analytic AO and SSAO reconstruction share the expanded transforms/camera. Instance records now occupy 64 bytes, including quaternion orientation and a transient presentation highlight. Depth records exclude material/highlight changes to preserve shadow caching. AO's twelve retained proxies now include quaternions (672 bytes of typed storage).

The first procedural asset representation is a versioned box assembly. Shapes have independent width/depth/height; the engine does not claim mesh import, nonuniform hierarchy transforms, skinning or full 3D contact simulation. Collision remains conservative horizontal bounds; Studio's ground-plane Move tool and the game's planar controller use that declared limit.

A transaction snapshots bounded authored data, validates candidates before preview, and groups a focus session or drag into one history entry. Snapshot history is capped at 64 commands / 2 MiB of UTF-16 strings. Invalid imports validate and construct a candidate before replacing the current preview. Editing holds one world; Play releases it, uses the existing two-world residency, and recreates the authored preview on Stop. Simulation receives a detached package, never the editor's mutable document.

The asset browser currently lists used assets; geometry editing and specialist workspaces are not implemented. Selection and horizontal Move are the first tools; numeric controls cover all position/rotation axes and uniform scale. Dedicated axis gizmos, general tool registration, duplicate/reparent operations, free-flight/perspective cameras, animation editing and large-scene authoring jobs remain follow-on work. Editor construction is bounded but synchronous per scene. Runtime reconstruction yields once per bounded assembly through the existing Lobby preparation queue.

## Agreed next work: street block, Studio presentation and humanoid review

**Status: agreed follow-on requirements; not implemented by the first Studio milestone.** These additions preserve the existing universal workspace and shared document/tool lifetimes.

The next content exercise is one representative Freelancer street block: Enni Cole's exterior, pavement, streetlights, planters and player, followed by approach → interact → enter → return. Author reusable assets through Studio and extend placement, duplicate/delete and transform tools as that exercise requires. Missing general capabilities belong in their proper engine level; named building content and game rules remain outside engine/.

The owner also requested the visual character and useful small tools of the [DFAB Editor Suite reference](../references/DFAB-Editor-Suite-15.html):

- **Presentation:** develop the charcoal panels, warm gold and restrained violet accents, clear hierarchy, compact icon tools and contextual property sections into a coherent Studio design. Carry over DFAB's visual identity while keeping the shared layout, generous touch hit areas and offline typography. Phone panels must preserve a useful viewport.
- **Grid visibility:** add an explicit editor grid toggle. The construction grid is an editor guide, separate from authored paving/materials; hiding it must not alter scene geometry, collision or snapping. Store view preferences separately from authored game content, and stop grid work when hidden.
- **Rotation dial:** add an interactive rotation control using the same transform properties and quaternion representation as numeric editing. Make the active axis and coordinate space explicit, support configurable angle snapping and numeric alternatives, and group a drag into one undoable transaction. Escape, pointer cancellation and context changes restore the starting rotation. Reuse the control across asset types.
- **Light-object icons:** show camera-readable markers at light positions in edit mode, linked to stable authored selection and the shared light inspector. Hiding markers must not disable actual lighting. Markers and other editor guides must not become collision geometry, shadow casters, AO blockers or game content; game-only builds and Play views exclude them. Keep viewport guides Canvas-free and release their owned resources/subscriptions when disabled or closed.

Reusable dial/marker/grid tools belong in Penthouse, their shared math, picking and property/transaction mechanisms in Basement, and scheduling in Lobby. Studio owns panel arrangement, preferences, tool composition and selection context. Use the existing renderer and resource contracts; no separate editor render loop or per-asset histories.

When work reaches the new 3D procedural humanoid, show front, side, three-quarter and gameplay-camera previews, including solid silhouette views, before investing in surface detail. Review proportions, posture, limb spacing and the backpack outline first, then readability while walking and turning. This preview commitment is distinct from claiming that the current diagnostic box actor is the finished procedural humanoid.

## Verification and next step

Current evidence belongs in [the Studio milestone](../milestones/studio/README.md). Node tests cover invalid references/versions, identity-preserving history, cancellation, budget eviction, isolated snapshots, grouped foliage/collider transforms and camera-ray agreement on rotated boxes. Browser checks exercise the actual offline artifact, mobile-sized property workflow, imports/recovery, touch cancellation and repeated Play disposal. The existing rendering/lifecycle suite additionally guards AO, shadows, input, flits and context restoration.

Next: use the workspace to author one representative Freelancer street block, adding missing reusable engine capabilities in the correct house level. Extend specialist asset editors through shared document/property/transaction contracts. Physical-phone performance remains to be measured; software Chromium and emulated touch establish behavior, not a device frame-rate guarantee.
