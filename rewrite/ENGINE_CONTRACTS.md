# Shared world contracts

These are reusable engine rules. The neutral World Study exercises them without
implementing a game, copying the old game's physics, or adding type-pair handlers.

## One world position and shape

`scene.createElement(id, definition)` creates one shared element. Its transform and
geometry feed physical contact, visual projection, camera depth, and light obstruction.
There is no separate “render height” that must be kept synchronized with physical Z.

| Declaration | Meaning |
|---|---|
| `positionX`, `positionY` | Footprint center on the ground, in world units. |
| `positionZ` | Bottom elevation of the element, upward-positive world units. |
| `height` | Vertical extent above that bottom. |
| `angle` | Rotation around the vertical axis, in radians. |
| `shape: 'box'` | Oriented rectangular footprint, extruded by height. |
| `shape: 'circle'` | True circular physical footprint, extruded by height. Visual sides use 20 segments. |
| `shape: 'plane'` | Zero-thickness rectangular opaque visual surface; not a physical body. |
| `width`, `depth` | Unrotated rectangular footprint dimensions. |
| `radius` | Circular footprint radius. |
| `body` | Optional physical configuration; volumes receive ordinary static bodies by default. |
| `body: false` | Deliberately visual-only geometry. |
| `visible` | Whether this geometry appears. Hiding does not remove its physical body. |
| `castsShadow` | Whether visible opaque geometry obstructs point-source illumination. Defaults to true. |
| `material.color` | Opaque reflective RGB, written as `#rrggbb`. |
| `material.emission` | Self-emitted RGB on that same visible surface; defaults to black. |
| `topMaterial` | Optional distinct top-surface material. Defaults to the initially declared material. |

Transforms notify the scene when public `positionX/Y/Z` or `angle` properties change.
`transform.setPosition(x, y, z)` validates and changes all coordinates together, sending
one notification. Ordinary position edits, teleports, and geometry replacements update
physical and visual indexes automatically. Callers do not invalidate grids manually.

Geometry and normalized material descriptors are frozen. Replace geometry through
`element.geometry = {...}` or `element.setGeometry({...})`; replace material through
`element.material = {...}` or `element.topMaterial = {...}`. These tracked assignments
validate the replacement and invalidate affected indexes/buffers. Do not edit internal
storage arrays or engine registries directly.

## Ordinary physical contact is the default

Every registered volume gets a body unless explicitly disabled. Body configuration:

| Property | Meaning |
|---|---|
| `motion: 'static'` | Does not integrate velocity or yield to impulses. Default for scene volumes. |
| `motion: 'dynamic'` | Integrates velocity/gravity and yields according to mass. |
| `motion: 'kinematic'` | Integrates caller-controlled velocity but does not yield to impulses. Can push dynamic bodies. |
| `mass` | Positive mass; inverse mass controls dynamic response. Default 1. |
| `velocityX/Y/Z` | World units per second. Zero by default. |
| `gravityScale` | Multiplies configured gravity for this body. Default 1. |
| `restitution` | Bounce fraction from 0 through 1. Default 0. A pair uses the lower value. |
| `friction` | Nonnegative sliding-friction coefficient. Default 0.5. |
| `sensor` | Reports contact without applying physical response. Default false. |
| `category` | Unsigned 32-bit category bits. Default 1. |
| `collisionMask` | Accepted category bits. Default all bits, including new categories. |
| `ignore` | Optional specific element IDs to exclude deliberately. |

Motion type is fixed for a body's lifetime to preserve static/moving index ownership.
Recreate an element to change that ownership. Supported body shapes share contact
algorithms: circle/circle, circle/oriented-box, and oriented-box/oriented-box, combined
with actual Z interval checks. No pedestrian/car, cat/car, or building/character case exists.

Nearby pairs are found through spatial queries. Exact shape tests reject false
positives and use a minimum translation to remove penetration. Dynamic mass distributes
correction; linear impulses handle normal response and friction. Sensors do not push.
Static/static pairs need no simulation query. Moving/static, moving/moving, and moving
sensor overlaps use the same candidate pipeline, including offscreen objects.

Gravity is upward-positive Z acceleration and defaults to -240 world units/s². Floors
and elevated slabs are ordinary static boxes. A body can be below a slab without contact,
or land on its top, according to the same shared shape and Z interval.

`physics.subscribe(callback)` returns an unsubscribe function. Events expose `type`
(`begin`, `stay`, `end`), `first`, `second`, and measured `contact` information. Observe
damage/AI/game reactions here; do not implement ordinary separation in game callbacks.
Removal releases index/registry ownership before notifying end-contact observers, so
editing a retained removed transform cannot resurrect the old physical body.

## Bounded work and honest limits

Fast bodies use adaptive subdivisions based on travel versus minimum body extent.
The configured maximum subdivision budget is explicit. If a step would exceed it,
physics throws before integrating rather than silently capping and permitting tunneling.
This is bounded substepping, not a claim of general continuous collision detection.

The solver currently provides linear 2.5D response, not angular impulses, joint
constraints, full rigid-body rotation dynamics, a general 3D mesh solver, sleeping,
or a guarantee of stable arbitrary stacks. Externally rotating/teleporting geometry
updates indexes, but is not a continuously swept rotation.

## Spatial ownership

The Basement spatial-hash implementation serves separate Directory-owned indexes:

- `physics.static`: retained static footprints.
- `physics.moving`: incrementally updated moving-body footprints.
- `render.geometry`: projected visual bounds including height, for camera visibility.
- `render.shadows`: physical ground bounds for opaque light obstruction candidates.
- `render.lights`: projected source influence, including offscreen-reaching lights.

Each index has its own membership and query stamps. Values returned through different
indexes never overwrite a stamp on the shared scene object. Entries spanning many cells
are returned once. Negative coordinates use floor. Sparse cell keys are coordinate
strings, avoiding the original packed-key range assumptions.

Per-object cell membership is bounded; oversized geometry uses an overflow collection.
Query traversal has a separate budget: a moderately zoomed-out camera must not trigger
a full-registry scan merely because it visits more cells than one object may occupy.
Exceptionally broad queries scan entries when that is cheaper or cell traversal exceeds
its budget. Dense local overlaps can still generate many real pairs. No universal O(1)
or “unlimited objects” claim is made.

Asset definitions remain distinct from placed elements. Directory asset libraries provide
named lookup; spatial indexes apply to placed scene instances, not texture/audio files.
Demand-driven procedural artwork has its own cache; asynchronous asset loading/streaming
and external resource decoding have not been implemented. See `ARTWORK.md`.

## Depth is geometry, not a list of gameplay concerns

The output renderer owns the displayed WebGL2 canvas and its viewport. The shared
world renderer uses that same context and a retained GPU image with a real depth buffer.
GPU framebuffer presentation sends the image to the displayed surface; Canvas 2D never
composites or presents a completed world frame. An opaque
fragment appears only if its physical camera depth is nearer than the existing pixel.
Whole-object Y sorting cannot provide this guarantee for overlapping surfaces.

The current oblique projection is:

- Projected X = world X.
- Projected Y = world Y - world Z × `heightProjectionScale`.
- Camera-facing depth = (world Y - camera Y) × `heightProjectionScale` + world Z.

Camera centering/zoom then converts projected coordinates into CSS pixels. Public
`renderer.worldToScreen(x, y, z)` follows that same formula. Inverting a screen point
requires choosing a physical height: `renderer.screenToWorld(screenX, screenY, z)`.
Its default Z is ground zero; one screen point cannot uniquely specify arbitrary 3D space.

Stable IDs decide only exactly coplanar ties, not ordinary visibility. Authors should
declare a true surface position rather than stack coplanar meshes and depend on a name.

**World features declare scene geometry/materials/lights. They do not stamp arbitrary
world glow onto the completed image.** World drawing callbacks are rejected even when the scene is empty. Both neutral studies
use shared scene geometry and WebGL output. Screen callbacks may prepare content or update
HTML UI; they do not receive a Canvas 2D drawing context. Physical world surfaces must
remain scene declarations. The opaque background is cleared directly by WebGL.

## Emission, illumination, and shadows

Surface emission belongs to the same depth-tested fragment as its base material. Ground
emission cannot brighten a roof pixel just because it is processed later. An opaque
surface in front hides both the underlying color and underlying emission automatically.

A luminous surface and a source casting light are different declarations. `createLight`
defines a point source with world XYZ, positive `radius`, nonnegative `intensity`, and
`color`. Reflective surfaces receive it according to actual distance, normal direction,
and obstruction. A source below a roof cannot directly illuminate its upward-facing top.

Supplying `parent: element` makes source coordinates local offsets. Live getters apply
the parent's current translation, rotation, and Z. The scene updates source influence
automatically when that parent moves. Removing the parent removes its attached sources.
Unattached sources keep fixed world coordinates. Source declarations are frozen;
remove/recreate a source to change its configuration rather than mutate its index data.

The point-light backend produces six nearest-geometry depth images around a source
(a depth cubemap). Those views use the same cached opaque meshes as camera rendering,
including nearby geometry outside the camera view. A receiving surface samples source
visibility and adds reflected light only under the same camera-depth equality test.
There is no fixed small blocker array and no per-shop/per-building occlusion handler.

Depth maps have finite resolution and a shared slope-aware numerical bias. This first
implementation has hard shadows; aliases or small shadow offsets can occur. It does
not implement transparent light transmission, soft area lights, indirect illumination,
reflections, blended transparency, or blurred bloom. Explicit artwork cutouts use
the same sampled base alpha in camera and source-depth views. Unsupported alpha material strings
are rejected instead of silently treated as correctly depth-sorted transparency.

## GPU and cache ownership

World shading requires WebGL2. The displayed canvas acquires a WebGL2 context at construction; world programs/buffers
are created lazily when a scene is drawn. An empty engine still has actual GPU output. Unsupported devices receive an explicit error, not a falsely
equivalent painter-order fallback. The harness displays engine errors on the page.

The renderer owns programs/buffers/framebuffer/cubemap lifetime. Mesh generation/cache,
point-light visibility, and shader definitions live in separate readable modules. The
light helper retains its parent renderer, then reads current resources when called;
it does not snapshot null handles during initialization or stale handles after recovery.

Unchanged element meshes are cached through weak references. Stationary scenes/views
reuse uploaded geometry and the completed world image. A tracked transform, geometry,
material, visibility, shadow flag, light, or view change invalidates the relevant image.
Light fragment work is restricted to projected source reach. World shading defaults to
one pixel per CSS pixel; displayed WebGL backing density can be higher. HTML UI follows
browser layout independently. Configure these quality
budgets explicitly instead of adding object-specific exceptions.

Context-loss events suspend world GPU submission; restoration rebuilds resources from
the preserved scene. Destruction removes listeners and GPU handles without starting an
additional scheduler. Original game source remains unmodified. The hotel proof reuses prepared source artwork;
its game/interior/actor behavior has not been migrated.

## Demand-driven Canvas artwork

The `artwork` Directory system owns CPU image generation and resident texture lifetime.
Canvas 2D runs only for first-use generation or explicit invalidation of a particular
asset. Clean demand does no repaint or upload. GPU loss preserves painted CPU images;
restoration uploads them again without rerunning their generators. See `ARTWORK.md`
for operations, counts, update timing, and upload conventions. Explicit physical surfaces now sample those cached images, including visible night
emission on the same depth-tested fragment. Decoded prepared images can also be
registered without runtime Canvas painting. See `HOTEL_STUDY.md` for the real-asset proof.

## Explicit artwork surfaces

`shape:'surface'` requires `body:false`, complete triangle `vertices` arrays containing
local `[X,Y,Z,U,V]` corners, and a physical `normal`. Local Z must be nonnegative;
the element's shared transform supplies its bottom elevation. Surface height and
spatial bounds come from actual triangle coordinates, not image dimensions. Explicit
meshes are visual geometry, not an implemented arbitrary triangle collision solver.
Prepared solid volumes must use supported box/circle declarations from the same asset data.

`material.artwork` names a registered base image. `material.emissionArtwork` names an
optional night image on that same surface. `alphaCutoff` defaults to 0.5, rejecting base
image alpha below that value from both camera depth and source shadows. There is no
blended transparent ordering claim. `unlit:true` preserves baked painter shading;
source-authored RGBA `artworkShade` overlays only base art, not visible night emission.
`renderer.nightAmount` is a normalized appearance setting used by this first asset proof,
not a completed time/weather/lighting simulation.

GPU geometry is retained by image interface and a retained/mutable bucket. Dynamic and
kinematic bodies start mutable. Tracked transform/geometry/material edits automatically
promote other elements to that bucket, without manual render layers. Static neighbors
need no CPU triangle assembly or GPU buffer replacement when only an actor moves.
Batch membership changes can still require uploads. This is not universal instancing,
constant-time rendering, a texture atlas, or proof of unlimited asset capacity.

## Original-style radial projection

`camera.projection` can be `oblique` (the neutral studies) or `radial` (the hotel proof).
Radial altitude is `camera.altitude * clamp(1 / zoom, 0.7, 3.2)`; default altitude is
700 world units. Its height scale is `1 + (altitude / (altitude - clampedZ) - 1) *
heightExaggeration`, with physical Z clamped to 0..0.86 × altitude. The hotel camera
uses its original height exaggeration of 1.5. Higher physical Z wins top-down depth.

`screenOffsetX/Y` are CSS framing offsets independent from the eye's physical ground
position. They let the asset inspection view include the entire hotel while retaining
the original forecourt vantage. Projection/inversion/GPU uniforms use the same offsets.
Radial culling conservatively includes ground view bounds and the eye point, covering
height-projected surfaces even when the framing offset places that eye outside the
viewport. Light influence bounds use the same projection rather than old oblique radii.
