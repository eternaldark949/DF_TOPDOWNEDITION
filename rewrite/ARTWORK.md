# Cached artwork and actual frame output

`renderer.canvas` is the displayed WebGL2 surface. `worldRenderer` uses that same
canvas and context. Opaque world shading happens in a retained GPU color/depth target;
`blitFramebuffer` presents it to the displayed GPU surface. There is no final Canvas
2D context, frame-sized Canvas copy, or CPU readback in production rendering.
The browser may discard its displayed backbuffer; the engine retains its own GPU image.

`directory.systems.get('artwork')` owns named reusable artwork. It is deliberately
separate from the scene registry: one generated asset can serve many future instances.

| Operation | Effect |
|---|---|
| `create(id, widthPixels, heightPixels, paint)` | Register fixed image resolution and a synchronous Canvas 2D generator; return the ID. No painting/upload occurs yet. |
| `registerImage(id, decodedImage)` | Register an already decoded image for resident upload/restoration; no Canvas repaint is needed. |
| `prepare(id)` | First demand paints one independent canvas and uploads one GPU texture. Clean demand returns the existing handle. Returns null during context loss. |
| `invalidate(id)` | Mark just this asset dirty. Repeated marks before demand coalesce into one repaint. |
| `remove(id)` | Release its resident texture, image, and generator. Repeated removal is harmless. |
| `paintCount`, `uploadCount` | Cumulative successful paints/uploads, not attempted invalidations or draws. |

A feature can prepare required artwork during installation, or demand it when first
needed. A clock/sign/weather display can invalidate its particular image when its
information changes. The artwork system starts no recurring schedule. Registration
and invalidation alone never paint. Reading the same texture for each display frame
is safe: clean demand does no painting or uploading.

A paint callback receives a fresh Canvas 2D context with its image's pixel dimensions.
It must finish synchronously. Complete asynchronous loading/decoding before registering
or invalidating a generator. Failed painting preserves the previous successful image
and texture and leaves the entry dirty for retry. Upload failure preserves the new CPU
image for retry. Images must fit real GPU limits; there is no silent resize fallback.

The owner controls generator inputs. Changing those inputs alone does not magically
refresh cached artwork: call `invalidate(id)` when a different image is required.
This explicit boundary prevents camera movement or unrelated world changes from
repainting all windows, doors, wall patterns, and text.

Call `prepare(id)` when acquiring a texture for use, rather than retaining its raw GPU
handle across invalidation, removal, or context restoration. This system owns handle
replacement. On GPU restoration the cache reuploads the preserved CPU image without
repainting it. Directory destruction releases all registered assets automatically.

Uploads retain source top-left row order, straight alpha, and authored RGB values.
Future material UV mapping and blending must follow those conventions. Texture filtering
currently uses linear samples and clamped edges, with no mipmaps. Original game artwork,
its projection, and its lighting must be checked when actual assets are migrated.

Explicit `shape:'surface'` geometry samples `material.artwork` and optional
`material.emissionArtwork` through the same physical camera/source-depth pipeline.
Coordinates are local `[X,Y,Z,U,V]` triangle corners. `alphaCutoff` rejects holes in
both camera and source visibility; this is cutout geometry, not blended transparency.
`unlit` preserves the source painter's colors rather than adding primitive shading.
`artworkShade` optionally preserves a source RGBA face tint in per-vertex attributes.

Generated-image invalidation increments the artwork revision, so cached world frames
resample changed information automatically. Decoded prefab images have no painter;
replace them explicitly with remove/registerImage instead of invalidating a null callback.

**Current boundary:** atlases, streaming, blended transparency, animated sprite rigs,
and bloom remain unsupported. The hotel is a prepared exterior asset with original
source images; this does not establish complete game visual parity or phone performance.
