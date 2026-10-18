# Skeletons and skinned meshes

Implemented 2026-10-17 as stage 1 of the modeling plan the owner asked for ("start with adding the necessary discussed components"). The plan lives in the shared doc *ETRNLNINE modeling, skeletons and animation plan*. This record covers only what stage 1 built.

**Status:** skeletons, the mesh format, the loft builder, GPU skinning in every geometry pass, the Lobby's animate phase, Directory mesh leases and a reusable skinned tube are implemented. Nothing uses them in a game yet. The humanoid is still built from rigid rounded parts (decision 0021); lofting it into one skinned body is stage 2.

## What exists after this stage

| Level | File | Responsibility |
| --- | --- | --- |
| Basement | `engine/basement/skeleton.js` | Immutable `Skeleton` (joints parent-before-child, rest transforms, inverse bind matrices, at most 64 joints). Per-figure `SkeletonPose` (local rotations, resolved world matrices, the skinning palette and a revision that moves only when the palette changes). Allocation-free `update()`. |
| Basement | `engine/basement/mesh.js` | `createMesh()` validates and packs MeshData in the one 32-byte vertex format, computes bounds and the reach bound. `quantiseWeights()`, `computeNormals()` and the `loft()` builder. |
| Basement | `engine/basement/gpu-mesh.js` | `GpuMesh`: one MeshData resident on the renderer's context, rebuilt on context restoration. |
| Basement | `engine/basement/skinning.js` | `SKIN_GLSL` (`placeVertex()`), the per-batch `JointPalette` texture and the reserved texture unit. |
| Basement | `renderer.js`, `shaders.js`, `shadow-shaders.js`, `shadow-maps.js`, `ambient-occlusion.js`, `world.js`, `picking.js` | Mesh streams in every batch, skinning in the lit, shadow and SSAO normal passes, `skin` on world entities, rest-bounds picking. |
| Lobby | `engine/lobby/runtime.js` | The `animate` phase. |
| Directory | `engine/directory/mesh-library.js` | `MeshLibrary`: one owner's leases on shared GPU meshes, keyed by stable IDs. |
| Penthouse | `engine/penthouse/skinned-tube.js` | A bendable tube (limb, hose, tentacle): joint chain, lofted rings, blended weights. |

## Basement: skeletons

A skeleton is shared, immutable rig data. Each joint has a name, a parent index (or `null` for a root), and a rest translation and rotation relative to its parent. Several roots are allowed. Matrices are 3×4 row-major affine transforms, stored as 12 floats.

`SkeletonPose` is one figure's joint state. Each posed figure owns its own pose; every figure of a rig shares the skeleton.

- `setRotation(joint, q)` sets a local rotation outright. `bend(joint, axis, angle)` rotates away from rest about an axis in the joint's rest frame.
- `update()` resolves world transforms in one forward pass and writes `palette = world × inverseBind` per joint. It allocates nothing.
- `revision` increases only when a Float32 palette value changes, so unchanged figures upload nothing and keep shadow caches.

**Limit:** poses rotate joints only. Joint translations stay at rest, and root motion belongs to the entity. That rule is what makes mesh reach bounds conservative (below). Translating joints, joint scale, IK and clips are later stages.

## Basement: the mesh format

Every mesh, rigid or skinned, uses one interleaved 32-byte vertex:

| Bytes | Field | Type |
| --- | --- | --- |
| 0–11 | position | 3 × float32, metres, z-up |
| 12–23 | normal | 3 × float32, unit length |
| 24–27 | joints | 4 × uint8 joint indices |
| 28–31 | weights | 4 × uint8 normalised, summing to exactly 255 |

`createMesh()` validates positions, indices (whole triangles in range), normals (computed when omitted), and that joints, weights and skeleton come together. Weights are normalised and quantised so every vertex sums to 255; the rounding remainder goes to its largest weight. Indices are 16-bit up to 65,535 vertices and 32-bit beyond, with a 262,144-vertex budget.

**Reach:** a rotation-only pose keeps a joint within the sum of the bone lengths above it, and a vertex within its joint's reach plus its rest distance to that joint. Linear blend skinning puts a vertex at a weighted average of such points, so the largest bounds it. `mesh.reach` is that bound and drives culling. A Node test checks it against 40 random poses.

**Loft builder:** `loft({ rings, around })` skins a tube through elliptical cross-section rings. Rings follow the path's tangent and use parallel transport, so the surface does not twist. Normals tilt with the taper. The seam shares vertices, so there is no crease; the end caps use their own vertices for a hard edge. Each ring can carry joints and weights. This is the primitive the lofted body (stage 2) and the profile editor's rings (stage 3) build on. Mirror and subdivide builders are not implemented yet.

## Basement: rendering

Meshes reuse the existing instance records (24 floats lit, 16 shadow) and the `pose.w` lane that already distinguishes boxes (0) from rounded shapes (> 0):

- `pose.w = -1`: a rigid mesh.
- `pose.w = -(row + 2)`: a skinned mesh whose palette is row `row` of the batch's palette texture.
- `size.xyz` scales the mesh frame per axis, so `[1, 1, 1]` means authored metres.

**One placement function:** `placeVertex()` in `SKIN_GLSL` places every primitive. Boxes and rounded shapes go through `shapeVertex()`. Meshes blend up to four joint matrices fetched from the palette texture. The lit pass, the shadow depth pass and the SSAO normal pass all call it, so a bent elbow shades, casts and occludes from the same surface.

**Joint palettes:** each batch owns at most one RGBA32F texture, 192 texels wide (64 joints × 3 rows) with one row per mesh instance it can hold. The texture is read with `texelFetch`, which needs no float-filtering extension, and lives on reserved texture unit 5 (AO owns 0–2, shadows 3–4). It is created when a batch first holds a skinned instance and freed when it holds none. Changed rows upload as one contiguous range, counted with the renderer's other uploads.

**Batches:**

- Each batch keeps one instance stream per mesh it draws, beside the box and rounded streams. Each stream is one instanced submission, so figures sharing a mesh draw together.
- `createBatch(world, capacity, { meshes })` bounds mesh instances separately. The default is 32, which is also the palette's row count.
- A stream whose mesh no longer appears is freed on the next sync. A batch that meets a disposed mesh throws rather than draw freed memory.
- Any palette or record change bumps the batch version, so sun and point shadow caches refresh only when a figure actually moved.

**Accounting:** `batch.paletteBytes` reports the estimated texture storage (98,304 bytes at the default budget). It is separate from `gpuBufferBytes`, which covers instance buffers only. `renderer.stats.jointPalettes` counts live palette textures.

**Context restoration:** meshes rebuild before batches, then streams and palettes rebuild from retained CPU data. The browser test reproduces the same pixels after a loss.

**What still treats meshes approximately:**

- Analytic AO blockers skip meshes, because a posed limb has no fixed box. Screen-space AO still reads their real depth.
- Picking tests a mesh's rest-pose bounding box, so a bent limb is picked where it was authored.

## Lobby: the animate phase

Each frame now runs preparation → input → (boundary → update) × fixed steps → **animate** → render.

`animate(alpha, time)` runs once per frame, paused or not, after the last simulation step and before any render callback. It receives the same interpolation alpha as render (1 while paused). Callers pose skeletons and call `update()` there, so every render callback sees finished palettes. The Lobby remains the only scheduler: there is no second loop. Profiling records it as `lobby.animate`.

## Directory: mesh leases

`new MeshLibrary(directory, renderer, owner)` holds one owner's leases on shared meshes:

- `acquire(key, build)` runs `build()` only when no owner in the Directory holds `key`. Equal keys share one GPU mesh.
- `release(key)` and `dispose()` release leases exactly once. The last release frees the buffers.

Skeletons travel inside their skinned MeshData as immutable data, so they need no lease. Keys are stable strings: a generator plus its parameters (`tubeKey(options)` here; authored recipes use `generator@version:parameters`, see [decision 0023](0023-authored-meshes-and-poses.md)).

## Penthouse: skinned tube

`tubeRecipe({ length, radius, taper, joints, rings, around, blend })` builds a joint chain hanging down −z from the origin, lofted rings along it, and weights that hand each ring from one joint to the next across ±`blend` of a segment with a smoothstep. A tube is a reusable toy (limb, hose, tentacle), and it is the pattern the body loft follows.

## Verification

- **`npm test`:** 112/112 pass, including 8 new tests in `tests/skinning.test.js`:
  - matrix and quaternion conventions agree;
  - skeleton validation, and the rest pose skins to identity;
  - a 90° elbow bend lands the tip at the expected point, and an unchanged pose does not change the revision;
  - reach bounds 40 random poses;
  - mesh validation and weight quantisation;
  - lofted triangles face outward;
  - the animate phase order, including while paused;
  - mesh lease sharing and release.
- **`npm run test:skinning`** (Chromium, SwiftShader, 960×600):
  - a skinned tube and a rigid mesh draw with no GL errors, sun shadows on and screen-space AO;
  - an unchanged pose renders identical pixels and keeps the shadow cache, while a bend moves the silhouette and the shadow and refreshes the map;
  - context loss and restoration reproduce the same pixels;
  - the real frame loop runs animate before every render;
  - three posed figures share one mesh stream and one palette;
  - removing them frees streams and palettes, releasing the leases frees the meshes, and disposal leaves no buffers, VAOs, programs or palettes.
- **Regression suites:** see [the milestone record](../milestones/skinning/README.md).

All of this runs on software WebGL. It does not measure phone performance.

## Not yet implemented

The later stages of the plan:

- **Stage 2:** lofting the humanoid into one continuous skinned body, garments as lofted layers, and auto-weights.
- **Stage 3:** the Studio body profile editor, and skeleton, skin and clip kinds in the project schema. (Mesh recipes and joint poses arrived early, in [decision 0023](0023-authored-meshes-and-poses.md).)
- **Stage 4:** skeleton, weight and pose tools, plus two-bone IK.
- **Stage 5:** animation clips, the timeline, blending, and cloth and hair chains.
- **Stage 6:** general polygon modeling, plus mirror and subdivide builders.

Also not yet implemented: dual-quaternion skinning (linear blend can thin extreme twists), joint translation or scale in poses, morph targets, and mesh-accurate picking and analytic AO.
