# Perspective · the second lens

**Bloom update:** [decision 0012](0012-hdr-bloom.md) implements HDR multiscale bloom. Bloom limitations/plans below describe this earlier milestone.

Adopted and implemented 2026-10-16. Supersedes the orthographic-only camera limitation in [0010](0010-viewport-navigation.md). The engine supports 3D geometry through either lens; games still choose their presentation. This milestone adds perspective to the shared camera and Studio, without introducing a separate renderer or an editor-only projection.

## Using it

In Studio, open **View & guides → Perspective**. Vertical FOV is adjustable from **15° to 110°**, initially **50°**. Mouse/touch orbit, pan, cursor-anchored wheel/pinch zoom, F/Home framing, named views and rotation tools keep their existing controls. Zoom dollies the perspective eye; changing FOV changes the lens from that eye. Switching projection preserves apparent scale on the pivot plane. Objects at other depths naturally change apparent size.

Scene/project changes and Reset view retain the current lens and FOV, restoring authored scene focus/orientation/scale. The legacy JSON camera remains an initial framing hint, not a serialized editor lens. Navigation and lens changes do not dirty JSON, add undo commands or persist as game settings. Play starts with the game's orthographic presentation; Stop or failed Play construction restores the complete editor pose, including lens and clip settings.

## Ownership and source guide

- **Basement / `camera.js`:** focus XYZ, azimuth/elevation, orthographic half-height, perspective distance, vertical FOV, clip range, shared orthonormal basis, view/projection and inverse, CSS projection, clipped rays and normalized frustum planes. `snapshot()` is the single complete pose contract used by cancellation and Session. CPU queries use double-precision basis math; GPU matrices remain Float32.
- **Basement / `camera-navigation.js`:** both lenses share view-plane pan, anchored zoom and orbit. Perspective framing tests all eight bounds corners at their actual depth rather than fitting a flattened rectangle.
- **Basement / renderer:** conservative six-plane sphere culling replaces the orthographic XY test. Resident geometry remains CPU-resident; camera visibility determines the retained draw batch. Shadow caster membership remains independent of camera clipping. No new geometry layout or lens-dependent GPU targets.
- **Basement / AO:** shared depth reconstruction divides by homogeneous W. SSAO sample reach uses projection scale and per-pixel view depth, preserving its world-unit radius through either lens. Ambient-only attenuation, bounded targets and geometry fallback remain unchanged.
- **Penthouse / authoring guides:** billboard markers and ring radius use world units per CSS pixel at the object's depth. Tilted rings still foreshorten naturally in their actual axis plane. Light marker drawing/picking excludes clipped centers. Ring picking and ray-box/ground queries honor the ray clip interval.
- **Studio:** viewport lens controls remain application UI. The shared engine camera/navigation owns the math; StudioSession owns edit/Play restoration. Lobby remains the only scheduler.

### Engine API

```js
const c = engine.basement.renderer.camera;
c.setProjection('perspective'); // or 'orthographic'; preserves pivot-plane scale
c.fov = 50 * Math.PI / 180;     // vertical radians; use a finite angle strictly inside (0, PI)
c.near = 0.1; c.far = 1000;     // metres; finite 0 < near < far
c.distance = 40;               // positive eye-to-pivot distance in metres
// c.x/y/z remain the focus, and the eye is focus + back * distance.
```

Engine callers own valid numeric camera settings, as with focus and orientation. Studio bounds its lens input. `update(aspect)` refreshes matrices/basis/frustum; Renderer calls it before culling. `ray()`/`project()` also refresh using their surface dimensions. Low-level `unproject()`, `sphereVisible()` and depth pixel sizing consume the most recently updated basis. A ray begins on the near plane, has normalized direction and `maxDistance` to its far intersection. Picking helpers accept unbounded externally supplied rays too.

Orthographic preserves its historical ±200 m focus-relative depth span. Perspective defaults to 0.1–1000 m. Camera collision, free-flight navigation, reversed depth, adaptive clip planes and camera animation are future work. Framing cannot make a scene deeper than its configured clip interval visible. Directional shadows retain bounded focus-centered coverage, not a cascade covering an entire perspective frustum. The current mobile draw and light budgets are unchanged.

## Next: luxe bloom, then lighting scale

The owner explicitly wants a premium, ethereal Enni Cole aesthetic. Preserve this priority: **perspective → HDR multiscale bloom comparison → expanded realtime lighting**. Bloom is planned, not implemented here.

The next rendering milestone should:

1. Establish linear HDR scene colour, with capability detection and a deliberate fallback for unsupported render targets. Preserve antialiased architectural silhouettes and existing depth/shadow/AO ownership.
2. Extract bright energy with a soft threshold/knee, then downsample/upsample a bounded mip-style pyramid. Blend a broad low-frequency halo with a restrained bright core. Reuse targets across frames; release them on disable/resize/dispose and restore after context loss.
3. Composite bloom in linear light before exposure/tone mapping and final output encoding. Expose a small coherent set of artist controls and bounded phone/desktop quality tiers. Avoid crushed highlights, visible coarse blur tiles and indiscriminate glow on every surface.
4. Compare bloom off/on from identical cameras and exposures: Enni Cole gold lettering and interior highlights, rose uplights and fine facade details. Show real WebGL screenshots and report target bytes/pass costs. A foggy halo is an aesthetic goal; participating-media fog remains a distinct feature, not a claim made by bloom.

After that, design scalable light storage/selection for the requested **60–100 realtime contributing lights** and approximately **1,900 authored city lamps**. Proposed direction is clustered forward lighting, spatial queries by light influence, and independent distance/importance/resolution/update budgets for shadow maps. A light whose source is offscreen can still illuminate visible geometry; cull its influence volume, not merely its source point. Authored, resident, visible/contributing and shadowed counts must remain separate. These are goals for the next design/implementation work, not current capabilities: the current eight-point schema and one-sun/one-point shadow budget remain.

[Evidence and known verification limits](../milestones/perspective/README.md).
