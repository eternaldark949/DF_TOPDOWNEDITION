# Double Nights Hotel — real asset proof, 0.4.0

Open the single **ETRNL9 Foundation.html** file. It defaults to Double Nights Hotel.
The source hotel's wall strips, entrance signs/windows, roofs, pool, dome flat layers,
topiaries, and forecourt are actual original Canvas-generated images. Canopy cresting
and lamp fixtures are static physical trim using their source positions/heights/colors;
banners reuse the source emblem painter. This is not a completed building screenshot
placed in front of the camera, and it ships no original Canvas world renderer.

Use **Fit hotel**, **View left/right**, **Center hotel**, and **Show night artwork**.
WASD/arrows or a held touch destination moves the cream test actor through ordinary
circle/box contacts. Fit view retains the original south/forecourt eye position and
frames its projected bounds independently. Fixed zoom percentages permit close inspection.

## Source and preparation

`tools/prepare-hotel.py` loads original, unchanged game artwork inputs from `src/core/`
and `src/buildings/`. A preparation-only metadata container allows the original factory
and painters to run without constructing the old simulation or frame renderer. The
export callback in `tools/export-hotel-artwork.js` records 112 source/fixture images,
811 explicit local surface definitions, and 19 supported static volumes.

```sh
python rewrite/tools/prepare-hotel.py
node rewrite/tools/build.mjs
```

The generated `src/assets/double-nights.json` records preparation-input SHA-256 values,
local physical corners, image U/V coordinates, source volume dimensions/heights, and
known omissions. Browser/font versions can alter original Canvas rasterization; this
is not claimed to be a cross-platform byte-identical asset compiler. Generated PNG/JSON
payloads are assets, not hand-maintained executable code. New engine/tools/test code
retain descriptive names and English execution comments.

The original painter runs once during this asset preparation. At runtime the standalone
HTML decodes its embedded images, registers them with the artwork cache, and uploads
each used image once. **This release uses prepared images; it does not ship the original
hotel paint functions for procedural runtime rebuilding.** The engine's separate Canvas
generator API still supports explicit changed-asset regeneration and is browser-tested.

`TexturedAssetInstance` installs local surfaces through the generic scene API. Wall quads
are subdivided into retained triangles once at installation, with rows no taller than
14 physical world units. GPU vertex projection handles camera movement. No per-frame
Canvas path/gradient/stroke conversion or source-image reupload is involved.

The source's final rotunda collision band has zero width. It is recorded under
`ignoredDegenerateVolumes` and omitted from physical registration because it has no
area; no replacement rectangle is silently invented. Valid original bands, wings/core,
planters, lamp poles, and plinth use supported ordinary box bodies and source heights.

## Generated data schema

- `images`: stable local image IDs mapped to embedded PNG data URIs.
- `surfaces`: `id`, physical `corners` in `[X,Y,Z,U,V]` order, physical `normal`,
  `material`, and the deliberate `castsShadow` flag. Coordinates are local world
  units; U/V select normalized image columns/rows. Polygon corners use perimeter order.
- `material`: RGB tint, optional base/night image IDs, source RGBA face shade, and
  the explicit unlit/cutout material contract described in `ARTWORK.md`.
- `collisions`: static box centers, full width/depth, and upward height in the same
  physical units as visible geometry. Image pixels are never collision dimensions.
- `sourceSha256`, `preparation`, and `ignoredDegenerateVolumes`: input provenance,
  preparation counts/omissions, and the explicitly recorded zero-area source band.

## Actual verification

`tools/test-hotel-browser.py` exercises desktop and high-density touch/rotation viewports.
It checks original-style projection/inversion, actual visible asset geometry, unchanged
image upload counts through camera/actor movement, static GPU buffer identity, ordinary
curved-front contact through source bands, roof pixels hiding lower emission, actual
GPU loss/restoration without Canvas repaint, offline loading, and complete scene unload.

`test-world-browser.py` separately verifies alpha holes in actual output and actual
source-depth shadows, plus generator invalidation automatically updating a previously
cached world frame. This tests engine behavior independently of the hotel asset.

## Explicit limits

This is an exterior artwork/geometry/contact proof, not a complete hotel/game migration.
Searchlight beams, blurred bloom, moving staff, parked vehicle sprites, detailed live dome
rib strokes, interior transitions, and gameplay are not ported here. No fictional
replacement versions are substituted. Captured dome/foliage layers retain the source's
flat-plane construction; this is not a newly modeled smooth 3D dome or foliage volume.

Night controls show actual source night textures on their own depth-tested surfaces.
Their initial global darkening is test presentation, not the original game's complete
weather, reflection, illumination, and bloom pipeline. Some tiny source contact shadows,
view-dependent line strokes, and antialiasing differ. Full-scene pixel equivalence is
not claimed. Original texture sampling and the original height formula are preserved;
these do not by themselves prove complete visual parity.

Headless Chromium uses software WebGL here. Its observed FPS is not a phone benchmark.
Alpha cutout is supported; blended transparency, atlases, streaming, and general mesh
physics are not. The generic GPU batch cache avoids rebuilding static geometry when
an actor moves, but does not establish unlimited scenes or automatic optimal batching.
