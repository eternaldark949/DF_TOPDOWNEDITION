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

**Current boundary:** this release provides image generation and resident GPU texture
resources. Mapping artwork onto world walls/roofs/sprites is not yet implemented.
Neither are atlases, streaming, alpha cutouts, transparent sorting, or bloom. A texture
resource handle does not imply any of those material/rendering features already work.
The neutral studies use ordinary colored geometry through the shared depth pipeline.
