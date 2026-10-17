# Origins, components and precise number surfaces

Implemented 2026-10-17 following the owner's approval of origin-first objects,
component navigation, selectable locked surfaces and shared slider/number controls.
Extends [Studio](0007-studio-first-workspace.md), [authoring tools](0008-studio-authoring-tools.md),
[materials](0013-presentation-and-materials.md), [iconography](0016-viewport-panel-and-iconography.md)
and [surface controls](0018-surface-response-and-colour.md).

## Objects begin with an origin

Creating **New object** creates an identity and empty transform origin: no asset,
shape, material or collider. A native WebGL editor cross represents its position;
that guide is not game geometry, a shadow caster or an AO blocker. Empty origins
can be framed and selected through the hierarchy or their editor marker. The bounded
foreground guide buffer accommodates all 256 allowed origins together with the existing
light markers, rotation dial and selection box; a maximum-count regression covers this.

Every object can contain child objects. An object's optional `asset` links its
geometry source; an origin-only object has `asset: null`. Enter an object's
components, choose an asset in Directory, and place it in the viewport to attach a
new geometry-bearing child. Rename, position, rotate, scale, reparent, duplicate
and delete use the same contextual workspace and bounded document history.

Enni's starter street now has a named **Enni Cole** origin. The shell, entrance,
sign, crown, display bays and upper bays are children. Existing IDs, local values
and initial world appearance remain intact. Imported old projects retain their
own content; the engine migration never guesses which objects form a building.
The explicit Freelancer recipe emits the same grouping when intentionally run.

The runtime origin is distinct from its generated geometry branch. Geometry
replacement and **Make geometry unique** retain the origin's runtime identity and
child attachments. Each object owns the generated branch, picking mappings and
collider rows; the scene owns its material library and the world/batch lease.
Shared sources remain authored data, not mutable runtime geometry storage.

## Canonical project version 3

`scene.entities` now contains object nodes. Each has `parent: null | '<object-id>'`
and `asset: null | '<asset-id>'`, plus its existing name, local position, unit
quaternion, positive uniform scale and lock state. `visible` and `selectable` are
optional booleans, defaulting true. Parents precede children in storage; cycles,
missing parents and invalid geometry bindings fail validation before adoption.
Origins cannot carry material overrides. Projects may have no geometry assets or
materials at all; installed games still enforce their own required content.

Version 2 ingress copies flat objects into version 3 with null parents. Version 1
first performs the existing material migration, then the object migration. Current
validation never mutates input. Source packages and export are version 3; recovery
keeps its existing key and upgrades old data at ingress. Project IDs are unchanged.

Local limits remain unchanged. Derived world positions are bounded to ±1,000,000
metres and world scale to 0.000001–10,000 to prevent nested valid local scales from
overflowing or collapsing GPU transforms. A reparent keeps world position,
orientation and scale, then stores the new local transform and canonical order.
An operation that violates a local/world bound fails atomically rather than clamps.

World traversal remains parent-before-child. Reparenting retains IDs and only
reorders the world map when necessary; ordinary frame resolution does not build a
new graph. Geometry, selection bounds, rotation rings, movement, planar collider
projections and portal offsets resolve the same inherited transforms. Group bounds
aggregate child geometry; culling and instanced submission still operate per part.
Single-anchor gameplay queries resolve only their ancestry path, rather than allocating
a pose map for every unrelated scene object.
Hiding geometry excludes it from drawing, shadows, AO and mesh picking. Visibility
is independent of collision: hiding a visual does not remove its authored collider.

## Selection and restrictions

At **Scene** context a surface selects its top-level object. Enter **Enni Cole**
and the same hit selects its immediate component. Breadcrumb controls enter/leave
contexts on touch without requiring double-clicks. The outliner displays contiguous
branches independently of serialization order. Hierarchy selection can inspect any
node, including hidden or viewport-unselectable objects.

A surface hit resolves to authored object ID, geometry-source ID and named part ID.
When the selected component owns that surface, its material inspector opens on the
actual hit part. Runtime IDs and array indices do not become saved selection IDs.

Locked geometry participates in nearest-surface picking. It no longer disappears
from the outliner or permits accidental click-through. Object edits and tools
respect the nearest effective lock owner:

- **Closed padlock:** this object's own lock.
- **Open padlock:** editable object.
- **Inherited padlock:** a parent supplies the restriction; the label identifies it.

The outliner and inspector use the shared SVG catalog and native 44px buttons.
Toggling a lock is one undoable authored command. A parent lock cannot be bypassed
by unlocking a child; **Select locking parent** navigates to the responsible node.
Locked fields remain visible but disabled, and selection highlighting still works.

A lock protects direct object edits, not its dependencies. Editing a shared material
through the material library still updates all users. A child lock preserves its
local values; moving an unlocked parent naturally moves the complete assembly.
`selectable: false` affects viewport picking only. `visible: false` affects rendering.
Neither flag is interchangeable with locking or game-specific removal protection.
Deleting a branch checks every descendant and the injected game policy, so grouping
cannot bypass a protected portal anchor or discard a locked component.

## Linked geometry and modeling boundary

**Copy** duplicates a complete object branch with new authored IDs and remapped
parent links. Geometry sources remain linked; transforms and material overrides
are independent. **Make geometry unique** copies the source definition and relinks
only the selected component. Materials remain linked unless separately made single
user. Source IDs participate in the document's monotonic identity allocation.

The current geometry backend is still procedural **box assemblies** sharing the
renderer-owned unit-cube vertex buffer. This milestone does not implement arbitrary
triangle meshes, vertex/edge/face modeling, topology editing, mesh modifiers or a
mesh importer. Those must introduce explicit geometry resources and lifetimes,
stable material slots and a deliberate mesh-editing context, building on this origin
and surface identity contract rather than replacing it with mesh-owning game objects.

Point-light slots remain the existing scene lighting table in world coordinates;
parented light/audio/collider components and scalable light storage remain follow-on
work. Moving a building currently moves its geometry, colliders and authored portal
anchors; it does not automatically move separately authored scene lights. This limit
must be resolved through the component/lighting design, not a named Enni exception.
Generic project creation and arbitrary game installation remain outside this change;
Studio still opens its explicitly installed Atrium and Freelancer packages.

## One number control

Penthouse **NumberControl** combines a native range track and a directly editable
number in one surface. Both represent one value. Basement descriptors choose useful
slider domains separately from hard numeric limits:

- Reflectivity and sharpness use linear 0–1 tracks.
- Scale, radius, exposure and HDR intensity use positive logarithmic tracks where useful.
- Zero-based intensity controls use a power curve for finer low-end travel.
- Rotation uses a useful ±180° track while retaining its existing numeric bounds.
- Position stays a precise number; its large validation bounds are not a useful slider.

The inspector, color dialog, shared Studio/game appearance controls and FOV reuse
the same widget. Typed numbers retain precision and are not snapped to slider steps. Compact displays
reveal the full stored value when focused for precise typing.
Slider fill clamps to its useful domain; valid precise values remain authoritative.
Invalid values are rejected and restored on completion. FOV now rejects out-of-range
manual values instead of silently clamping them.

A pointer drag commits on release. Keyboard range editing stays open until blur or
Enter; Escape and pointer cancellation restore the starting value. One gesture is
one history entry; returning to the opening value restores omitted optional fields
without an unnecessary entry. Color-dialog numeric sessions remain inside the one
outer color transaction; Escape closes/cancels the color dialog. Appearance and
camera controls preserve their existing separation from authored project history.

A shared **TextControl** handles object/material renaming with the same focus-session
validation and cancellation principles. PropertyInspector composes owned controls
through Lifetime rather than retaining the replaced numeric/text implementations.
No widget allocates a frame loop, reaches into game DOM IDs or owns a global singleton.

## Ownership and verification

| Home | Responsibility |
| --- | --- |
| Basement | Object hierarchy/pose/reparent math, range curves, schema/migration, stable World ordering and visibility |
| Directory | Stable runtime origins, generated geometry branches, material/picking/collider ownership |
| Penthouse | Shared number/text/color widgets, vectors and origin/transform guides |
| Studio | Object context, branch commands, outliner, inspector composition and game policy injection |
| Freelancer | Named Enni grouping, portal queries, source recipe and game protection rules |

[Previews and recorded checks](../milestones/origins-and-controls/README.md). Run
`npm test`, `npm run build`, `test:objects` and the applicable runtime, Studio,
authoring, camera, Viewport, materials, surface, bloom and Freelancer acceptance.
Software GL and emulated touch do not establish physical-phone performance.
