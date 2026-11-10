# Shared rendering and camera API

`renderSystem` owns the active backend and rendering resources. `cameraSystem` owns the view and coordinate conversions. `renderFrame` collects data packets. `canvasRenderer` is the first real backend. These live in Basement and are exposed as `engine.api.render` and `engine.api.camera`.

The new runtime and its appearance example use this contract now. The classic playable game and its existing procedural artists still draw through their old Canvas paths; their class conversions remain to be done. This batch establishes and verifies the destination. It does not claim all game drawing has migrated or that a WebGL backend exists.

## Decisions and boundaries

- Only the backend obtains Canvas contexts or creates device-specific drawing handles. Game appearance classes submit geometry, materials, resource IDs and transforms. No Canvas callback, Canvas context, Path2D, native entity or image handle is carried through a frame packet.
- One renderer is active. A replacement prepares on a new surface while the old one remains usable, then commits between synchronous calls. Switching backend IDs on the current surface rejects before initialization: browsers cannot give one canvas both a 2D and WebGL context. Disposing a context does not remove that browser restriction.
- Backends declare features. Unsupported geometry, gradients, clips, dashes, blend operations or targets reject before a frame is drawn. There is no automatic Canvas fallback disguised as another backend.
- Directory asset definitions remain the authoring source. The render service stores normalized descriptors; each backend owns decoded images, compiled geometry and offscreen/GPU handles. Backend replacement reconstructs resources from descriptors, not from a screenshot of the old renderer.
- Packets are copied into reused storage. Geometry/material resources can be registered once. Layers and depth sort stably within a pass; passes are ordering barriers. No style-based reordering crosses transparency or offscreen dependencies.
- Visibility queries use the native world's existing `spatial_grid` and `render` bounds. There is no renderer-owned obstacle/culling grid.
- Camera following reads native poses and advances on the existing fixed step. Drawing and coordinate queries do not move bodies or advance physics.
- Canvas drawing parity and performance for the existing rich artists still need class-by-class conversion and profiling. The new contract's pixel checks do not prove full-game artwork parity or an FPS improvement.

## Runtime setup

```js
const engine = createGameRuntime({surface}); // Directory composition; no getContext call
engine.api.render.resize({width:800,height:600,pixel_ratio:devicePixelRatio});
await engine.api.render.setRenderer('canvas',{surface});
await engine.loadLevel('some_registered_level');
engine.start();
```

`surface` in the Directory factory selects the initial mouse input target. Successful surface changes retarget that shared mouse adapter automatically; a custom `controls.mouse_target` can instead be a stable viewport container. No game drawing class handles DOM listeners. The host measures/resizes its viewport and calls `api.render.resize`; the service does not install its own animation clock or resize observer.

The earlier `render_target` constructor option was removed from the new runtime. Render hooks now receive `(context, blend, frame)`, with a packet builder as the third argument. They never receive the Canvas. This intentional new-runtime API change does not switch the classic playable boot.

## Frame submission

```js
render(context, blend, frame) {
    frame.clear('#101018'); // before any packets in this pass
    for (const {entity} of context.api.render.getVisibleEntities({blend})) {
        const pose = entity.getRenderState(blend);
        frame.submit({
            type:'shape', geometry_id:'character:silhouette',
            material_id:'character:coat',
            position:pose.position, rotation:pose.rotation,
            layer:10, depth:pose.position[1]
        });
    }
}
```

Common packet fields:

| Field | Contract |
|---|---|
| `type` | `shape`, `sprite`, or `text`. |
| `space` | `world` (default) or viewport-relative `screen`. |
| `layer`, `depth` | Finite numbers; lower first, then stable submission order. |
| `position`, `rotation`, `scale` | Local-to-world/screen transform; centers, radians, `[1,1]` default scale. |
| `matrix` | Optional six-number affine transform overriding position/rotation/scale. |
| `opacity` | 0..1; default 1. |
| `blend` | `normal`, `add`, `multiply`, `screen`, `source-in`, `source-out`, `destination-in`, `destination-out`. |
| `material_id` / `material` | Resource reference or inline paint/stroke settings; reference takes precedence. |
| `clips` | Intersecting local clip geometries/resource IDs, optional affine transforms, `nonzero`/`evenodd` rules. |

`shape` supplies `geometry_id` or inline `geometry`. Rectangles use `{type:'rect',size:[w,h],radius:0}` centered on the packet origin. Ellipses use `{type:'ellipse',radii:[rx,ry]}`. Paths contain data arrays:

```js
{type:'path', fill_rule:'nonzero', commands:[
    ['move',x,y], ['line',x,y],
    ['quadratic',cx,cy,x,y], ['cubic',c1x,c1y,c2x,c2y,x,y],
    ['ellipse',cx,cy,rx,ry,rotation,start_angle,end_angle,anticlockwise_0_or_1],
    ['close']
]}
```

A `sprite` supplies `resource_id`, `size:[w,h]`, optional atlas `source:[sx,sy,sw,sh]`, and normalized `origin:[.5,.5]` (default center; `[0,0]` is top-left). Resource IDs reference an image or an offscreen target. A `text` packet supplies a string, `font:{family,size,weight,style}`, `align:left|center|right`, and `baseline:top|middle|bottom|alphabetic`. Font families are resolved by the platform's loaded fonts; glyph atlases/font resource loading for WebGL remain backend implementation work.

Materials accept `fill`/`stroke` color strings or gradient data; `null` disables that paint. Other fields are `stroke_width`, `line_cap`, `line_join`, `dash`, `dash_offset`, and `shadow:{color,blur,offset:[x,y]}`. Shadow blur/offset use pass-logical screen units, independent of camera zoom, scaled for the actual target resolution. Colors use CSS color notation; a future backend must parse/implement the supported color contract.

```js
{fill:{type:'linear',from:[-10,0],to:[10,0],stops:[[0,'#f00'],[1,'#00f']]}}
{fill:{type:'radial',from:[0,0],to:[0,0],inner_radius:0,outer_radius:12,
       stops:[[0,'#fff'],[1,'#000']]}}
{clips:[{geometry_id:'mask:hair',transform:[1,0,0,1,2,0],rule:'evenodd'}]}
```

### Passes and offscreen targets

```js
frame.beginPass({target_id:'lighting:buffer',viewport:{width:800,height:600}});
// submit lighting packets; the backend draws to its private target
frame.endPass();
frame.submit({type:'sprite',space:'screen',resource_id:'lighting:buffer',
              position:[400,300],size:[800,600],blend:'add'});
```

`endPass` creates a continuation of the previous pass without clearing it. Default pass viewport dimensions inherit from the enclosing pass; supply dimensions explicitly when using a cache-sized coordinate system. Targets have fixed physical pixel dimensions, while pass viewport dimensions define logical coordinates. Scaling is handled by the backend. A pass cannot sample the target it is currently writing.

`beginFrame`/`endFrame`/`abortFrame` belong to the runtime's render lifecycle. Producers only clear/submit/open/close passes on the supplied frame. A producer failure aborts the partial frame and stops scheduling. Rendering is synchronous once resources are prepared.

## Rendering resources

```js
await api.render.registerResource('coat:mesh',{
    type:'geometry',geometry:{type:'path',commands:[/* ... */]}
});
await api.render.registerResource('coat:paint',{
    type:'material',material:{fill:'#9c64cc'}
});
await api.render.registerResource('coat:atlas',{type:'image',url:'data:image/png;base64,...'});
await api.render.registerResource('icon:pixel',{
    type:'image',width:1,height:1,pixels:[255,0,0,255]
});
await api.render.registerResource('lighting:buffer',{type:'target',width:400,height:300});
context.defer(()=>api.render.releaseResource('lighting:buffer'));
```

Preparation/upload is asynchronous and awaited at a resource boundary. Lifecycle hooks remain synchronous; prepare graphics in an application preload stage, then let level/system entry reference those prepared IDs. Resources used across levels can live for the session. The service rejects overlapping resource/backend mutations instead of guessing ownership/order; await registrations sequentially. Resource definitions are copied, and image decoding/upload completes before replacement. A failed image replacement retains the previous image. Disposing during preparation prevents a late install and releases late decoded resources.

The service does not implicitly adopt raw canvases, HTML images or old sprite caches as portable resources. Their class conversions must publish authored URLs, RGBA data, geometry/materials or render-target passes. Canvas owns its compiled Path2D caches and image/target surfaces. Those handles never leave the backend.

## Camera API

```js
api.camera.setView({position:[320,180],zoom:1,rotation:0});
api.camera.setBounds({left:0,top:0,right:1400,bottom:900}); // or null
api.camera.follow(player,{offset:[0,-20],smoothing:0.15,snap:true});
api.camera.stopFollowing();
api.camera.worldToScreen([x,y],blend);
api.camera.screenToWorld([x,y],blend);
api.camera.clientToWorld(api.controls.pointer().position,api.render.getSurfaceBounds(),blend);
api.camera.worldToClient([x,y],api.render.getSurfaceBounds(),blend);
api.camera.getView(blend);
api.camera.getVisibleBounds({blend,margin:100});
```

`cameraSystem({position,zoom,rotation,viewport,bounds})` can be used independently. Its `viewport` getter is immutable; `setViewport(packet)` updates a standalone camera. When a backend is mounted, use `api.render.resize` to keep camera and backing dimensions together.

Screen coordinates are logical viewport units; client conversions account for the surface's CSS bounds and scaling. DPR changes backing pixels, not gameplay coordinates. Camera rotation and zoom are included in both directions. Native mouse events may quantize client positions to whole CSS pixels.

`getView` returns a detached frozen packet with position, rotation, zoom, logical viewport dimensions, DPR, forward/inverse affine matrices and the conservative world AABB. Bounds clamp the rotated view; a map smaller than the view centers. Following uses world-space offsets and optional exponential smoothing. `updateState(seconds)` belongs to the runtime's fixed step; consumers read interpolated views. These are camera poses, not writable mirrors of an entity's physical state.

## Public renderSystem API

| Method/member | Purpose |
|---|---|
| `registerRenderer(id, Constructor)`, `listRenderers()` | Register backend classes without constructing a surface/context. |
| `setRenderer(id,{surface})` | Prepare and install a backend; returns a Promise. |
| `renderer_id`, `getCapabilities()` | Currently installed backend ID and a frozen feature-name snapshot. |
| `registerResource(id,descriptor)`, `releaseResource(id)`, `listResources()` | Backend-owned graphics resource lifecycle. |
| `resize({width,height,pixel_ratio})` | Update the camera viewport and active backend dimensions. |
| `getSurfaceBounds()` | Data-only CSS bounds for pointer conversion. |
| `onSurfaceChanged(handler)` | Platform composition notification; returns unsubscribe. The notification contains the host-supplied surface, never its context. |
| `getVisibleEntities({blend,margin,...filters})` | Native shared-index query using render extents. |
| `beginFrame(blend)`, `endFrame()`, `abortFrame()` | Runtime orchestration; one flush per render call. |
| `getFrameSnapshot()` | Explicit detached/frozen copy of the current packet buffer for inspection/export. No copy is made for every production frame. |
| `getStatistics()` | Packet/pass counts and storage capacity, resource count and renderer ID. |
| `dispose()`, `disposed` | Release backend resources/subscriptions and prevent resurrection. |

Frames declare `format_version:1`; the Canvas backend rejects unknown versions. Backends borrow completed frame buffers for their synchronous render call. They must not retain/mutate pooled packets across frames; inspection tools use `getFrameSnapshot`. For standalone producers, `new renderFrame()` supplies `begin(view,options)`, `clear`, `submit`, `beginPass`, `endPass`, `finish`, `abort`, `snapshot` and `getStatistics`. `finish` borrows pooled data; `snapshot` explicitly copies it. A frame rejects submission after completion. Offscreen passes preserve submission dependencies; sorting happens only within each pass.

## Backend contract and WebGL work

A registered backend class supplies `capabilities` (an array), `initialize(surface,{viewport})`, `resize(viewport)`, `getSurfaceBounds()`, `registerResource(id,descriptor)`, `releaseResource(id)`, synchronous `render(frame)` and `dispose()`. Initialization/upload may be asynchronous. Native resources belong to the backend and must be rebuilt when it is installed on another surface.

`canvasRenderer({create_surface,decode_image,create_path})` optionally accepts platform adapters for headless/embedded use. Decoded images are backend-owned and their `close()` method is invoked on release when available. Defaults use browser Canvas, Image and Path2D APIs.

Canvas implements the supported packet/material/target contract. A future WebGL renderer must implement buffer/texture upload, path tessellation, clips/masks, fonts/glyphs, gradients, blending, shadows and framebuffer targets for the capabilities it declares. It can start with a declared subset; unsupported frames fail explicitly. No WebGL renderer or Canvas-to-texture compatibility wrapper is included in this batch.

Surface notifications are for platform wiring/queries; await the mount Promise before another resource/backend mutation.

A committed replacement is not rolled back if an old-backend disposer or surface notification fails: the new backend is installed and the error is reported. Initialization/resource preparation failures before commit retain the old backend. The caller must discard a failed fresh surface if its browser context type was already selected.

## Verification and remaining migration

`tests/rendering.test.mjs` checks camera transforms, interpolation, bounds, packet reuse/sorting, data-only validation, native culling, passes, capabilities, replacement/disposal, image atomicity and Canvas state balance. The tests use the sibling physics package as a fixture; runtime rendering modules import only this folder. `tools/test-rendering-browser.py` checks actual pixels at DPR 2, curved paths, gradients, masks, sprites, text, shadows, offscreen composition, camera pointer conversion and fresh-surface replacement/input retargeting. It verifies unchanged physics and no page/console errors.

The Directory fixture is `src/directory/game-assets/rendering-example.json` and its composition module. Open `src/runtime/examples/rendering.html` over HTTP to inspect it. `src/directory/runtime-example.mjs` now submits packets and contains no Canvas calls.

Next convert shared appearance/animation and game drawing classes to this contract, including the player, humanoids, props/buildings, lighting/reflection passes and effects. The old `drawList`/`renderQueue`/Canvas artists remain until their callers are converted and visual/performance parity is checked. Session/player gameplay and persistence conversions remain separate pending work.

Verified batch: **217 combined engine/controls/rendering/Directory/runtime tests**, including 14 rendering contracts, 17 controls contracts and 19 runtime contracts. The three Basement packages pass **165 tests** together after copying them outside the checkout. Existing game regressions and four Chromium acceptance scripts remain separate gates.
