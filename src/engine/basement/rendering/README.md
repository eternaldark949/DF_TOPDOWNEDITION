# Shared rendering and camera API

`renderSystem` owns the active backend and rendering resources. `cameraSystem` owns the view and coordinate conversions. `renderFrame` collects data packets. `canvasRenderer` and `webglRenderer` are the drawing backends and `recordingRenderer` the headless one. These live in Basement and are exposed as `engine.basement.render` and `engine.basement.camera`.

The new runtime and its appearance example use this contract now. The classic playable game still draws most procedural artwork through old Canvas paths. Drone and VelvetCat have now moved to portable packets through this backend; other artist conversions remain. It does not claim all game drawing has migrated.

## Decisions and boundaries

- Only the backend obtains Canvas contexts or creates device-specific drawing handles. Game appearance classes submit geometry, materials, resource IDs and transforms. No Canvas callback, Canvas context, Path2D, native entity or image handle is carried through a frame packet.
- Switching backends is a light switch: `setRenderer(id)` between frames. Nothing upstream knows which backend draws: callers submit packets, ask `measureText` of the render system and read `getCapabilities()`. Blend names (`BLENDS`) and capability names (`CAPABILITIES`) are the engine's own; each backend maps them to its operations (Canvas's composite operations live inside `canvas.mjs`).
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
engine.basement.render.resize({width:800,height:600,pixel_ratio:devicePixelRatio});
await engine.basement.render.setRenderer('canvas',{surface});
// later, between frames: await engine.basement.render.setRenderer('webgl',{surface: freshCanvas});
await engine.loadLevel('some_registered_level');
engine.start();
```

The engine registers `canvas` and `recording`. A host that passes `new gameEngine({render: {create_surface}})` (a function of the renderer id that makes a fresh canvas and puts it on screen) switches with `setRenderer(id)` alone; `onSurfaceChanged` tells it which surface is live. Resources move to the new backend from their descriptors.

`surface` in the Directory factory selects the initial mouse input target. Successful surface changes retarget that shared mouse adapter automatically; a custom `controls.mouse_target` can instead be a stable viewport container. No game drawing class handles DOM listeners. The host measures/resizes its viewport and calls `basement.render.resize`; the service does not install its own animation clock or resize observer.

The earlier `render_target` constructor option was removed from the new runtime. Render hooks now receive `(context, blend, frame)`, with a packet builder as the third argument. They never receive the Canvas. This intentional new-runtime API change does not switch the classic playable boot.

## Frame submission

```js
render(context, blend, frame) {
    frame.clear('#101018'); // before any packets in this pass
    for (const {entity} of context.basement.render.getVisibleEntities({blend})) {
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
| `type` | `shape`, `sprite`, `text`, or `picture`. |
| `space` | `world` (default) or viewport-relative `screen`. |
| `layer`, `depth` | Finite numbers; lower first, then stable submission order. |
| `position`, `rotation`, `scale` | Local-to-world/screen transform; centers, radians, `[1,1]` default scale. |
| `matrix` | Optional six-number affine transform overriding position/rotation/scale. |
| `opacity` | 0..1; default 1. |
| `blend` | `normal`, `add`, `multiply`, `screen`, `overlay`, `soft-light`, `lighten`, `darken`, `source-in`, `source-out`, `source-atop`, `destination-in`, `destination-out`, `destination-over`. Canvas `copy` is not a packet blend: it would wipe everything under the layer; clear a pass or target instead. |
| `material_id` / `material` | Resource reference or inline paint/stroke settings; reference takes precedence. |
| `clips` | Intersecting local clip geometries/resource IDs, optional affine transforms, `nonzero`/`evenodd` rules. |

`shape` supplies `geometry_id` or inline `geometry`. Rectangles use `{type:'rect',size:[w,h],radius:0}` centered on the packet origin. Ellipses use `{type:'ellipse',radii:[rx,ry]}`. Paths contain data arrays:

```js
{type:'path', fill_rule:'nonzero', commands:[
    ['move',x,y], ['line',x,y],
    ['quadratic',cx,cy,x,y], ['cubic',c1x,c1y,c2x,c2y,x,y],
    ['ellipse',cx,cy,rx,ry,rotation,start_angle,end_angle,anticlockwise_0_or_1],
    ['rect',x,y,w,h],   // a closed box from its top-left corner, a subpath of its own
    ['close']
]}
```

A `sprite` supplies `resource_id`, `size:[w,h]`, optional atlas `source:[sx,sy,sw,sh]`, and normalized `origin:[.5,.5]` (default center; `[0,0]` is top-left). Resource IDs reference an image or an offscreen target. A `text` packet supplies a string, `font:{family,size,weight,style}`, `align:left|center|right`, and `baseline:top|middle|bottom|alphabetic`. Font families are resolved by the platform's loaded fonts; WebGL draws each line as a texture the platform rasterized.

Materials accept `fill`/`stroke` color strings or gradient data; `null` disables that paint. Other fields are `stroke_width`, `line_cap`, `line_join`, `dash`, `dash_offset`, `blur` (the packet is drawn blurred by this spread, Canvas's `blur()` filter, in pass-logical screen units like a shadow's; or `{spread: along | [along, across], angle}` for a directional blur, a streak along `angle` in the packet's own frame, which Canvas draws by stamping a scratch surface along the angle with the same Gaussian weights WebGL's passes take), and `shadow:{color,blur,offset:[x,y]}`. Shadow blur/offset use pass-logical screen units, independent of camera zoom, scaled for the actual target resolution. Colors use CSS color notation; a future backend must parse/implement the supported color contract.

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

A `picture` packet is art painted once and stamped every frame: `{type:'picture', picture:{key, bounds:[x,y,w,h], matrix, source, layered, build}, prepare}` with the common fields (no `material`). `build()` returns the packets the picture shows, in local units inside `bounds`; it is the one function a frame accepts, kept off the packet's data (a snapshot or a clone leaves it behind). The backend stamps it from its own picture cache (see `pictureCache`) under the packet's transform times `matrix`, only the part inside `source` when given (a tile of a strip), at the packet's `opacity` and `blend`; `prepare: true` only paints it ahead of need and draws nothing. The Canvas backend takes `new canvasRenderer({pictures})`, a `pictureCache` or the options for one, and starts its painting budget afresh each frame. The key must name everything the picture shows. A backend declares the `picture` capability.

```js
frame.beginPass({layer:{scale:.5, blend:'multiply', opacity:1}, clear_color:'#0a0c18'});
// submit the light layer: the dark, its cuts (destination-out), its colour (add)
frame.endPass();
```

A layer pass (`beginPass({layer:{scale = 1, blend = 'normal', opacity = 1}, clear_color})`) draws into a fresh off-screen surface the size of its enclosing pass (times `scale`, for a cheaper softer layer), cleared to `clear_color`, and `endPass` lays it over that pass at `opacity` with `blend`. Its packets' blends act only on the layer, and its pictures paint their own base (`layered`), so a light layer's dark with its cuts can be cached. A layer pass takes no target or viewport and cannot open another pass. A backend declares the `layer` capability.

### Effects (`effects.mjs`)

Effects are done to a finished image: a stack is a list of `{type, ...fields}` applied in order. `EFFECTS` lists each type with its defaults, `effect(spec)` checks one (unknown types, fields or values out of range throw), `effectStack(value, resolve)` reads a list or a preset, and `validateEffectsPreset` checks an `effects` resource for the Directory.

| Type | Fields (defaults) | What it does |
|---|---|---|
| `grade` | `exposure` 0, `contrast` 1, `saturation` 1, `tint` `#ffffff`, `tint_amount` 0 | Exposure in stops, then contrast and saturation (CSS's brightness, contrast, saturate on straight colour), then the tint multiplied in. |
| `vignette` | `strength` .5, `radius` .55, `softness` .45, `color` `#000000` | The edges drawn toward `color`: none inside `radius`, `strength` at `radius + softness` (fractions of the centre-to-corner distance). |
| `grain` | `amount` .08, `size` 1, `animated` true | Film noise laid over by overlay, each grain `size` pass units; animated grain jumps every frame. |
| `bloom` | `threshold` .65, `strength` 1.2, `radius` 8, `color` `#ffffff` | What is brighter than `threshold` (each channel) spread at `radius`, twice and four times it (weights .5, .3, .2) and added back at `strength`, times `color`: a tight core with a wide skirt. |
| `fog_glow` | `threshold` .45, `strength` 2, `radius` 40, `color` `#ffffff` | The same, spread once and wide: a haze around lights. |
| `star_glow` | `threshold` .75, `strength` 1.5, `length` 60, `rays` 4, `angle` π/4, `color` `#ffffff` | The bright part streaked along `rays` (2, 4, 6 or 8) rays `length` long, the first at `angle` radians. |
| `bokeh` | `radius` 12, `blades` 6, `rotation` 0, `threshold` .6, `highlights` 1 | A lens out of focus: each light brighter than `threshold` becomes a sharp disc `radius` across in the shape of an aperture with `blades` sides (an even number, 4 to 12) turned by `rotation`, at `highlights` times its light, over the rest of the picture blurred soft. |

Stacks go three places:

```js
render.setEffects({preset:'engine:film', grain:{amount:.12}});   // the whole frame, every frame, until changed (null removes)
render.setLayerEffects(3, [{type:'grade', saturation:0}]);       // the packets of layer 3 alone
frame.beginPass({layer:{effects:[{type:'vignette', strength:.8}]}, clear_color:'transparent'});   // one layer pass
```

A preset is `{preset: id, ...changes}`: the `effects` resource `id` read from the world's data (`asset_library`), each of its effects taking the changes under its type; changing a type the preset lacks throws. The engine library ships `engine:film` (grade, vignette, grain), `engine:neon_night` (bloom, grade, vignette) and `engine:foggy_dawn` (fog glow, grade, vignette). The frame's stack is done last, over everything. A layer number's stack splits each frame pass where that layer's packets are (packets are sorted by layer first): they are drawn on a transparent layer pass of their own, the effects are done to it alone, and it is laid over what is under it; the packets above it carry on over the result. A layer pass's stack is done before it is laid over its pass. `frame.setEffects` and `frame.setLayerEffects` set them for one frame on a bare `renderFrame`; the finished frame carries `effects`.

A backend declares `effect:<type>` for each type it draws; the render system refuses a frame needing another. Canvas and WebGL draw them all alike (the grain is one texture, `grainPixels`, at the same offsets, `grainOffset`, on both). Canvas grades through its `filter`, tints with `multiply`, rings the vignette with a radial gradient and lays the grain with `overlay`, keeping the image's shape; WebGL does each in one full-surface shader pass between two kept surfaces, the last written straight to the screen.

The light effects follow one plan on both backends (`glowPlan`): the bright part is taken at half size (`thresholdFilter` on Canvas, the same sum in a shader on WebGL), halved again down to each spread's level so no blur there is wider than `GLOW_SIGMA` pixels (`STREAK_SIGMA` for a streak), blurred there (Canvas's blur filter, or Gaussian stamps along a ray; WebGL's blur pass, clear past the edges as Canvas's are), summed at the largest spread's size, and added to the image once (`lighter`). Bokeh follows its own plan (`bokehPlan`): the bright part is taken the same way and halved to the level where the radius is at most `BOKEH_RADIUS` pixels; the rest of the picture (the level less the bright part) is halved further and blurred there with its edge pixels repeated, so the frame's rim does not darken. The discs grow by dilation: each step keeps the brighter of the image and a copy moved by a whole number of pixels along one side of the aperture, 1, 2, 4… pixels with the last cut short, so a few steps per side build the whole polygon and a one-pixel light keeps its full brightness; whole-pixel moves keep the shape crisp, and a last move centres it. The base and the discs (times `highlights`) are summed at the level and laid over the image. Light adds to the alpha too, so on a transparent layer pass lay the layer with `add` or `screen`. Canvas keeps colour in 255ths and rounds each streak stamp, so its star glow runs about 5% brighter than WebGL's; everything else agrees within a few 255ths. Cost: WebGL pays one full-screen pass per effect. Canvas skips the shape-keeping copies when the screen is cleared opaque and nothing cuts holes in it, and skips a grade's filter when only its tint changes; a grade's filter runs on the GPU in an accelerated browser but is about 30 ms at 2400×1600 where Canvas is drawn in software, so a game falling back to software Canvas should keep to tints, vignettes and grain. In software at that size the light effects cost Canvas about 35 ms (bloom, fog glow) to 50 ms (star glow) and 70 ms (bokeh), most of it the one full-size add and the half-size bright pass; a GPU does them in well under a millisecond. Bokeh is the heaviest on WebGL: about 25 small passes (the level chain, the soft blur and two to four dilation steps per side), each cheap on a GPU but slow under a software rasteriser. Its Canvas and WebGL pictures agree except at a few disc rims, where a disc copies the rounding of its brightest pixel across its whole area.

`endPass` creates a continuation of the previous pass without clearing it. Default pass viewport dimensions inherit from the enclosing pass; supply dimensions explicitly when using a cache-sized coordinate system. Targets have fixed physical pixel dimensions, while pass viewport dimensions define logical coordinates. Scaling is handled by the backend. A pass cannot sample the target it is currently writing.

`beginFrame`/`endFrame`/`abortFrame` belong to the runtime's render lifecycle. Producers only clear/submit/open/close passes on the supplied frame. A producer failure aborts the partial frame and stops scheduling. Rendering is synchronous once resources are prepared.

## Art toolkit (`art.mjs`)

The shapes, effects and helpers the game's art repeats, as packets. Artists build in an `artScene` and submit what `finish()` returns; nothing here touches a canvas.

```js
const art = new artScene();
groundShadow(art, 0, 12, 14, 5);
art.enter({ position: pose.position, rotation: pose.rotation });          // like save + translate + rotate
art.outlined(roundRect(-10, -6, 20, 12, 3), '#6a4c93', '#1a1020', 1.5);    // fill and outline in one packet
art.fill(capsule([0, 0], [12, 4], 2.5), shade('#6a4c93', -0.3));
art.enter({}, { blend: 'add' }); glow(art, 0, 0, 30, '255,200,120'); art.leave();
art.leave();                                                               // like restore
for (const packet of art.finish()) frame.submit({ ...packet, layer: 20, depth: pose.position[1] });
```

| Member | Contract |
|---|---|
| `new artScene()` | An empty scene with the identity transform and style `{stroke_width:1, line_cap:'butt', line_join:'miter', dash:[], opacity:1, blend:'normal'}`. |
| `enter(pose, style)` / `leave()` | Open a group: the pose (`position`, `rotation`, `scale` or `matrix`) composes onto the current transform, and `style` overrides any style field. `leave` restores the transform, style and clips. Unbalanced groups throw. |
| `place(pose)` | Compose a pose onto the current group without opening a new one. |
| `clip(shape, {rule})` | Everything painted later in this group is limited to the shape (`rule` `nonzero` or `evenodd`: a shape with a hole cut in it keeps paint out of the hole). |
| `paint(shape, material)` | One shape packet: the group's transform, style and clips, with `material` over a default of no fill and no stroke. |
| `fill(shape, colour)` / `stroke(shape, colour, width)` / `outlined(shape, fill, stroke, width)` | The common materials in one call. |
| `text(string, x, y, {font, align, baseline}, material)` | One text packet at (x, y) in the group: `font` is `{family, size, weight, style, letter_spacing}` (letter spacing in px, 0 by default), `align` left, center or right, `baseline` top, middle, bottom or alphabetic. `material` defaults to a black fill. |
| `finish()` | The packets, in paint order. Throws if a group is still open. |

Shapes are arrays of path commands, so several can go in one paint call: `circle(x, y, r, start?, end?)`, `ellipse(x, y, rx, ry, rotation?, start?, end?, reverse?)`, `rect(x, y, w, h)` (one `rect` command) and `roundRect(x, y, w, h, r)` (top-left corner, the same circular-arc outline as a canvas `roundRect`; the radius is clamped to half the shorter side), `polygon(points)` (closed), `polyline(points)` (open, for strokes), `capsule(from, to, r)` (round-ended limb, cable or pipe), and `smoothShape(points)` (a closed blob through rounded corners). `linear(from, to, stops)` and `radial(from, inner_radius, to, outer_radius, stops)` make gradient paint. A paint call keeps the shape array it is given rather than copying it, so build a fresh shape for each call and do not change it afterwards.

Effects: `glow(scene, x, y, r, 'r,g,b', core = .35, {blend, alpha = 1})` is a soft round light that fades out at `r`, in the group's blend unless given one; `groundShadow(scene, x, y, rx, ry, {strength = 1})` is the soft dark ellipse that sets an object on the floor.

Colour: `hexToRgb(hex)` gives `[r, g, b]`; `rgbToHex(rgb)`; `rgba(hex or rgb, a)` gives a CSS string; `mix(a, b, k)` blends two hex colours; `shade(hex, k)` darkens toward black (k < 0) or lightens toward white (k > 0).

Seeded randomness, for procedural detail that is the same every frame: `seededRandom(seed)` returns a function giving numbers in [0, 1); `hash2(x, y, seed)` is a repeatable number in [0, 1) for a grid cell.

### Drawing calls and drawings as data

The readable way to draw. Each call takes one object: where the shape sits in the group's local space (around its origin) and how it is painted. A **drawing** is the same thing as data: a list of steps, each naming its `shape`, that `draw` paints, so a prop, a character part or an effect needs no drawing code.

```js
const art = new artScene();
art.drawRectangle({ x: -10, y: -6, width: 20, height: 12, radius: 2, fill: '#5a4632' });
art.draw([
    { shape: 'rectangle', x: -10, y: -6, width: 20, height: 12, radius: 2, fill: '$body' },
    { shape: 'group', x: 5, rotation: 1.57, steps: [{ shape: 'circle', radius: 3, fill: '$lamp', alpha: 0.8 }] },
    { shape: 'line', points: [[-8, 6], [8, 6]], stroke: '#2b2118', line_width: 1 }
], { at: [x, y], rotation, scale: 1, values: { body: '#5a4632', lamp: '#c9b28a' } });
```

| Call | Step `shape` | Fields |
|---|---|---|
| `drawRectangle` | `rectangle` | `x`, `y` (top-left), `width`, `height`, `radius` |
| `drawCircle` | `circle` | `x`, `y`, `radius` |
| `drawEllipse` | `ellipse` | `x`, `y`, `radius_x`, `radius_y`, `rotation` |
| `drawCapsule` | `capsule` | `from`, `to`, `radius` |
| `drawLimb` | `limb` | `from`, `to`, `radii` ([start, belly, end]), `belly_at` (0..1, default 0.3): round at each joint, swelling between |
| `drawLine` | `line` | `points` (open; stroked black, 1 wide, unless told) |
| `drawPolygon` | `polygon` | `points` (closed) |
| `drawCurve` | `curve` | `points` (closed, corners rounded) |
| `drawText` | `text` | `text`, `x`, `y`, `size`, `family`, `weight`, `style`, `align`, `baseline` |
| `drawGlow` | `glow` | `x`, `y`, `radius`, `color` ('#rrggbb' or 'r,g,b'), `core`, `alpha`, `blend` |
| `drawGroundShadow` | `ground_shadow` | `x`, `y`, `radius_x`, `radius_y`, `strength` |
| `draw(steps, {at, rotation, scale, values, materials})` | `group` | `x`, `y`, `rotation`, `scale`, `steps` |

Paint fields on any shape: `fill` and `stroke` (a colour or a `linear` / `radial` gradient; black fill when neither is given), `line_width`, `line_cap`, `line_join`, `dash`, `alpha` (0 to 1), `blend`, `shadow` (`{color, blur, offset}`), `blur` (a soft edge: the shape is drawn blurred by this spread, in screen units like a shadow's; `{spread: [along, across], angle}` streaks it along an angle in the drawing's frame, for motion). An unknown field is refused, so a typo never draws silently wrong. `DRAWING` lists every step shape and the call it is.

A string value `"$name"` in a step is read from `values`, usually a look's fields, so one drawing serves every variant of a thing.

### Materials, textures and looks (`looks.mjs`)

A step's `material` names a material record, read through `draw`'s `materials` (an object, or a function of the name). `MATERIAL` lists what a material may hold: its `paint` fields (the same as a step's) and `other` (`kind`, and the physical `surface` that drawing ignores). A step's own paint fields win over its material's; an unknown material field is refused. A pattern is a fill: `{type: 'pattern', image, repeat, matrix}` repeats a registered image or target resource (`repeat`, `repeat-x`, `repeat-y` or `no-repeat`); `matrix` (`[a, b, c, d, e, f]`, from the image's pixels to the shape's space; default identity) sizes, turns and moves it, and it follows the shape's transform, so it turns and moves with its object. Backends declare it as the `pattern` capability (and `target` when it repeats a target).

**Textures.** A `texture` resource in the Directory is a surface that repeats, made from data: `{kind: 'texture', size: [w, h], steps, values, base, pixels_per_unit = 4}`. Its `steps` are drawing steps over one tile `size` world units across, with colours as `"$name"` read from `values`; shapes that cross the tile's edge come back on the other side, so it tiles seamlessly. A material (or a step) uses it with `fill: {type: 'pattern', texture: id, values, scale, rotation, offset}`; its `values` recolour it, so walnut and oak parquet are one texture with two materials. `render.resolvePaint(paint)` turns that into a pattern: the render system paints each texture once per set of values into a target of its own (`pixels_per_unit` pixels to a unit) and repeats it, so a recolour costs one more tile, not more drawing each frame. The first frame a tile is asked for, the texture's `base` colour stands in; its target is made after that frame (`render.texturesReady()` settles then) and painted at the start of the next, and painted again after a backend change. `drawLooks` resolves every packet's paints this way. `readValues(step, values)` is the `"$name"` lookup on its own.

An entity has a look when its `drawing` asset names a drawing resource (`{kind: 'drawing', steps}`). `renderSystem.drawLooks(blend)` draws every visible one into the open frame at its render pose, reading the `look` property: `{values, scale, layer, depth, visible}`. The Lobby calls it at the start of every frame. `drawLook(scene, entity, source, blend)` draws one. A bare material name in a drawing is in the drawing's own library (`qualifyResource(name, drawing_id)`).

`fitBounds(steps, bounds, {values})` fits the collision shape to a drawing, like Blender's collision bounds: `bounds` is one of `BOUNDS` (`circle`, `box`, `capsule`, `hull`). It reads only the solid steps: the ones marked `solid: true`, or, when no step is marked, every shape except glows, ground shadows, text and lines. `drawingReach(steps, {values})` is the circle round everything painted, glows included, used as the body's render bounds so the camera keeps drawing it. `drawingOutline(steps, {values})` is the outline points of each step with its solid flag.

### Components (`drawComponents`, `componentSteps`, `foreshorten`)

An entity made of components (see the physics API's Components) is drawn by `drawLooks` too: `drawComponents(entity, source, blend, {joints, view, pictures, screen})` gives one `{height, depth, top, layer, component, sides, packets}` per visible layer, lowest base first, each placed at its component's `at` and `rotation` from the entity's pose (scaled by `look.scale`), or from the world pose `joints(name)` gives for a component on a rig joint. Heights are z in the world: a layer counts up from the entity's base (its `elevation`) or from its joint's `height`. A joint's `pitch` tips its bone out of the ground plane, so `foreshorten(steps, k, lean=[0,0])` shortens every place along the bone (x, `from`, `to`, `points`) by `k`, the pitch's cosine, and keeps every size: a leg pointing straight down is seen as the round end of it. Under a leaning view the bone's far end is lower or higher than its joint, so `lean` slants each place by `[x, y]` per unit along the bone, onto where that height is drawn: a hanging thigh reaches the knee and the shin reaches the foot instead of each floating in its own joint's plane. `drawLooks` submits each at `look.depth` plus its z, so higher parts draw over lower ones, across entities too; a `drawing` look stands at its entity's elevation the same way. With `{view}` (a `heightView`) each layer draws raised in the plane of its top and its `sides` show: a colour, a `"$look"` value, or `{material}` (a material id or a `"$look"` value naming one), painted in that material's fill. Leaning, parts at one height draw farthest from the camera first, and a component set on the entity above its base (a bottle on a tray) draws whole: its `depth` is that base, so a near bottle covers the foot of a far glass and its neck too. Parts rising from the entity's base (a building's floors) and parts on joints keep their own height as their depth, so they still sort with the rest of the world. A layer's `sides` (its walls) are drawn at its base's depth and its top at its top's height (`top`), so wherever walls of one height meet (a T in a floor plan), every face draws under every top and no wall looks taller than the one it joins. Faces go farthest first (by the distance from the camera to each face's nearest point, a hair over the base's depth), so a near wall's face hides the end of one butting into it from behind, and a wall stands over anything flat at the height it rises from (the top of the floor under it, the roof a setback stands on). A layer with sides can carry a `facade` (see the physics API's Components): its walls are split at their corners (a turn of more than 30 degrees; a curve or a rounded corner carries on round), each wall into equal bays and the layer into storeys, and its panels, piers and bands are painted on them with every point at its own height, so they lean exactly with the wall and wrap round a curved one. Which windows are lit is fixed by the wall, the bay, the storey and the facade's `seed`, so it never flickers. The art goes under the wall's shading; lit panels go over it. With `screen` (`{bounds: {left, top, right, bottom}, zoom}`, what the camera shows; `drawLooks` passes it) a facade is laid only on the stretch of each wall the screen shows, and a piece less than 0.6 px across or tall on screen is left out, so a wall far off or seen nearly edge on costs little. A part drawn whole keeps both at its base. `componentSteps(components, source, {solid_only})` turns the components into one drawing in the entity's space (each layer a group), which `fitBounds` and `drawingReach` read; a component on a joint is placed at rest.

## Height (`height.mjs`)

Art that stands up from the ground under a camera above it. A point at height `z` draws at `camera + (point - camera) * k(z)`; `heightScale(z, eye)` is that `k` for a camera `eye` above the ground (`eye / (eye - z)`, with heights past 86% of the eye held there). At one height that is a uniform scale about the camera, so flat things up there are drawn in world units under one matrix.

| Member | Contract |
|---|---|
| `new heightView({camera, eye, lean = 1})` | The view from `camera` ([x, y]). `lean` multiplies how far things lean (`k = 1 + (heightScale - 1) * lean`); `leaning(lean)` gives the same view leaning otherwise. |
| `k(z)`, `at(x, y, z)`, `scaled(x, y, k)` | The scale at a height, and where a point at a height (or in the plane of scale k) draws. |
| `plane(k)` | The matrix that draws world coordinates in the plane of scale k, for `artScene.enter({matrix})` or a picture's matrix. |
| `sees(face)` | Whether a face's outward side is toward the camera. |
| `silhouette(points, k)` | The convex outline a box covers from its footprint `points` up to the plane of scale k (what it hides of things behind it). |
| `wall(face, k)` | A wall from the face's foot up to the plane of scale k: `at(u, v)`, `quad(u0, u1, v0, v1)`, `line(u0, v0, u1, v1)` and `outline()` give points and shapes on it (u along the face, v up it); `length`, `depth` (how far its top leans) and `top`. |
| `tiles(face, z0, z1, {zoom, error, max, overlap})` | A flat strip of art laid on the face from height `z0` to `z1` in affine tiles, each small enough that its error on screen (times `zoom`) stays under `error` px and no larger than `max` [along, up]: `{u0, u1, z0, z1, matrix}` each, `matrix` drawing strip coordinates (x along the face from its first end, y down from `z1`) where the tile lands. Stamp the strip's rect `[u0, z1 - tile.z1, u1 - u0, tile.z1 - tile.z0]` (a picture's `source`) under it; `overlap` widens each tile so neighbours meet without a seam. Art baked once on a wall this way costs a few stamps a frame. |
| `fins(anchors, z0, z1, w, out, lit)` | Plates standing proud of a wall at each `{x, y, nx, ny}`: `{front, edge}` shapes. |
| `ledge(edges, z, out, th)` | A slab along `{a, b, nx, ny}` edges: `{top, band, lip}`. `veranda(edges, z, out, step, rh)` adds `{posts, rail}`. |
| `columns(points, r, z0, z1)` | Round columns: `{shafts, caps}`. `sills(windows, out)`: `{lip, shade}` under each window's bottom edge. |

`boxFaces(sections)` gives the outside walls of a block of rectangles (`{side, section, x1, y1, x2, y2, nx, ny}`), with the stretches where sections meet taken out. A shape that would be empty is `null`.

## Depth batches (`depth.mjs`)

Things that stand up toward the camera (trunk faces, posts, canopies) are painted lowest first, but a frame of them is hundreds of small shapes. `depthBatches(items, {lookback = 64})` groups `items` (`{z, key, box: [left, top, right, bottom], convex}`) for painting: lowest `z` first (ties in the order given), each group one `key`. An item joins the latest group of its key unless a group of another key painted after it overlaps the item; `convex` (its outline as `[[x, y], ...]`, when convex) makes that test exact, so shapes touching along an edge (the faces of one post) do not hold each other apart. A null key never groups (a picture). A group is one paint, so where its members overlap they are covered once: the same for opaque paint, so give translucent paint a null key. It returns the groups, arrays of items, in paint order; the artist paints each as one shape.

## Rendering resources

```js
await basement.render.registerResource('coat:mesh',{
    type:'geometry',geometry:{type:'path',commands:[/* ... */]}
});
await basement.render.registerResource('coat:paint',{
    type:'material',material:{fill:'#9c64cc'}
});
await basement.render.registerResource('coat:atlas',{type:'image',url:'data:image/png;base64,...'});
await basement.render.registerResource('icon:pixel',{
    type:'image',width:1,height:1,pixels:[255,0,0,255]
});
await basement.render.registerResource('lighting:buffer',{type:'target',width:400,height:300});
context.defer(()=>basement.render.releaseResource('lighting:buffer'));
```

Preparation/upload is asynchronous and awaited at a resource boundary. Lifecycle hooks remain synchronous; prepare graphics in an application preload stage, then let level/system entry reference those prepared IDs. Resources used across levels can live for the session. The service rejects overlapping resource/backend mutations instead of guessing ownership/order; await registrations sequentially. Resource definitions are copied, and image decoding/upload completes before replacement. A failed image replacement retains the previous image. Disposing during preparation prevents a late install and releases late decoded resources.

The service does not implicitly adopt raw canvases, HTML images or old sprite caches as portable resources. Their class conversions must publish authored URLs, RGBA data, geometry/materials or render-target passes. Canvas owns its compiled Path2D caches and image/target surfaces. Those handles never leave the backend.

## Camera API

```js
basement.camera.setView({position:[320,180],zoom:1,rotation:0});
basement.camera.setBounds({left:0,top:0,right:1400,bottom:900}); // or null
basement.camera.follow(player,{offset:[0,-20],smoothing:0.15,snap:true});
basement.camera.stopFollowing();
basement.camera.worldToScreen([x,y],blend);
basement.camera.screenToWorld([x,y],blend);
basement.camera.clientToWorld(basement.controls.pointer().position,basement.render.getSurfaceBounds(),blend);
basement.camera.worldToClient([x,y],basement.render.getSurfaceBounds(),blend);
basement.camera.getView(blend);
basement.camera.getVisibleBounds({blend,margin:100});
```

`aheadOf({margin, velocity, lead})` gives how far past each side of the view to ready what the camera shows next: `margin` all round and `lead` seconds of `velocity` on the side it is moving toward, as `{left, top, right, bottom}`. `viewAhead(view, ahead)` grows a view by those margins, or by a number of px all round. Tiled layers (`createLightLayerParts`, the game's ground) take either as their `ahead`, so a moving camera readies only what it is heading for.

`cameraSystem({position,zoom,rotation,viewport,bounds})` can be used independently. Its `viewport` getter is immutable; `setViewport(packet)` updates a standalone camera. When a backend is mounted, use `basement.render.resize` to keep camera and backing dimensions together.

Screen coordinates are logical viewport units; client conversions account for the surface's CSS bounds and scaling. DPR changes backing pixels, not gameplay coordinates. Camera rotation and zoom are included in both directions. Native mouse events may quantize client positions to whole CSS pixels.

`getView` returns a detached frozen packet with position, rotation, zoom, logical viewport dimensions, DPR, forward/inverse affine matrices and the conservative world AABB. Bounds clamp the rotated view; a map smaller than the view centers. Following uses world-space offsets and optional exponential smoothing. `updateState(seconds)` belongs to the runtime's fixed step; consumers read interpolated views. These are camera poses, not writable mirrors of an entity's physical state.

## Public renderSystem API

`drawLooks(blend=1)` draws every visible entity's look into the open frame and returns how many it drew (see Materials, textures and looks).

| Method/member | Purpose |
|---|---|
| `registerRenderer(id, Constructor)`, `listRenderers()` | Register backend classes without constructing a surface/context. |
| `setRenderer(id,{surface})` | Prepare and install a backend; returns a Promise. With `create_surface` given to the render system the surface may be left out. Setting the live id again does nothing. |
| `getRenderer()` | The id of the backend now drawing, or null. |
| `measureText(text, font)` | `{width, ascent, descent}` of one line as the live backend draws it. |
| `renderer_id`, `getCapabilities()` | Currently installed backend ID and a frozen feature-name snapshot. |
| `registerResource(id,descriptor)`, `releaseResource(id)`, `listResources()` | Backend-owned graphics resource lifecycle. |
| `resize({width,height,pixel_ratio})` | Update the camera viewport and active backend dimensions. |
| `getSurfaceBounds()` | Data-only CSS bounds for pointer conversion. |
| `onFrameRendered(handler)` | Successful backend frame completion with immutable written `targets`; cache bookkeeping only, no resource mutation during callbacks. |
| `onSurfaceChanged(handler)` | Platform composition notification; returns unsubscribe. The notification contains the host-supplied surface, never its context. |
| `setEffects(stack)`, `setLayerEffects(layer, stack)`, `getEffects()` | Effects on the whole frame or on one packet layer number, kept until changed; a stack is a list of effects or `{preset, ...changes}` (see Effects). `getEffects()` is `{frame, layers}`. |
| `getVisibleEntities({blend,margin,...filters})` | Native shared-index query using render extents. |
| `resolvePaint(paint)`, `texturesReady()` | A paint naming a texture as the pattern the backend draws (see Textures), or the paint unchanged; a promise that settles once every tile asked for has its target. |
| `setStillPictures(on)`, `getStillPictures()` | On by default wherever the renderer draws pictures: each component layer not on a tipped bone is painted once into a picture (one per its steps and look, shared by every object that has them, sharp at any zoom) and stamped each frame under its place, and leaning, in the plane of its top; its walls are still drawn live. A layer covering more than 400 by 400 world units (a roof, a lawn) and art with text stay shapes: big flat art draws cheaply, and as pictures it would crowd the small, busy ones out of the cache. Detailed furniture then costs one image a layer instead of every shape every frame. Off, every shape is drawn every frame (tests that read each shape's packets turn it off). A texture painted after a picture was made starts a new picture. |
| `setHeightView({eye, lean=1} \| null)`, `getHeightView()` | Leans heights toward the camera as a camera `eye` world units up sees them: `drawLooks` draws each component layer in the plane of its top (scaled about the camera by `heightScale`), and a layer with `sides` first fills the walls the camera sees, from its base plane to its top plane. Walls stand on each solid shape's true outline: a rectangle's `radius` rounds them, circles and ellipses are faceted to their size (about one facet every 3 units), a hollow polygon keeps its hollow, and a shape lying inside a larger one adds none. Each run of facets the camera sees is one fill, with no seams, and `sides.shade` (0..1, default .35) darkens a facet the more it turns from the light (upper left), so a curve reads round. `sides.follow: 'hull'` wraps the layer in one convex skin instead. `null` (the default) draws flat. |
| `pickAllAt([x,y],{bounds,kind,tag,property,xray=true,ignore})`, `pickAt([x,y],options)` | What is at a world point, top first as a ray from the camera meets it: higher `look.layer`, then the taller entity (`entity.height`), then the later one. Each hit is `{entity,body,position,height,layer}`; `bounds` is `collision` (default) or `render`, tested exactly with `containsPoint`. `pickAt` is the top hit or null and defaults to `xray: false`, so a top thing that fails the filters blocks it. |
| `beginFrame(blend)`, `endFrame()`, `abortFrame()` | Runtime orchestration; one flush per render call. |
| `getFrameSnapshot()` | Explicit detached/frozen copy of the current packet buffer for inspection/export. No copy is made for every production frame. |
| `getStatistics()` | Packet/pass counts and storage capacity, resource count and renderer ID. |
| `dispose()`, `disposed` | Release backend resources/subscriptions and prevent resurrection. |

Frames declare `format_version:1`; the Canvas backend rejects unknown versions. Backends borrow completed frame buffers for their synchronous render call. They must not retain/mutate pooled packets across frames; inspection tools use `getFrameSnapshot`. For standalone producers, `new renderFrame()` supplies `begin(view,options)`, `clear`, `submit`, `beginPass`, `endPass`, `setEffects`, `setLayerEffects`, `finish`, `abort`, `snapshot` and `getStatistics`. `finish` borrows pooled data; `snapshot` explicitly copies it. A frame rejects submission after completion. Offscreen passes preserve submission dependencies; sorting happens only within each pass.

## Backend contract and WebGL work

A registered backend class supplies `capabilities` (names from `CAPABILITIES`), `initialize(surface,{viewport})`, `resize(viewport)`, `getSurfaceBounds()`, `registerResource(id,descriptor)`, `releaseResource(id)`, synchronous `render(frame)`, `measureText(text, font)` and `dispose()`. Initialization/upload may be asynchronous. Native resources belong to the backend and must be rebuilt when it is installed on another surface.

`new recordingRenderer({keep = 1, capabilities = CAPABILITIES})` draws nothing and keeps its last `keep` frames as data (`frames`) and its `resources`: the backend for servers, tests and replays, and the proof that the contract stands without Canvas. It measures text at 0.6 of the size per character.

`canvasRenderer({create_surface,decode_image,create_path})` optionally accepts platform adapters for headless/embedded use. Decoded images are backend-owned and their `close()` method is invoked on release when available. Defaults use browser Canvas, Image and Path2D APIs.

Canvas implements the whole packet/material/target contract. WebGL implements the subset in `WEBGL_CAPABILITIES` (see below); unsupported frames fail explicitly.

### WebGL backend (`webgl.mjs`)

`new webglRenderer({decode_image, create_surface, max_picture_bytes = 64 MB, densities = [1, 1.5, 2, 3, 4]})` draws the packet contract with WebGL 2 on a fresh canvas (`initialize` asks it for a `webgl2` context with a stencil and throws when there is none, so the render system keeps the old backend). The engine registers it as `webgl`. `WEBGL_CAPABILITIES` is what it declares: every packet type, geometry, both gradients, patterns, clips, shadows, blur, dashes, targets, layers, pictures and the effects `grade`, `vignette`, `grain`, `bloom`, `fog_glow`, `star_glow` and `bokeh`, and the blends `normal`, `add`, `multiply`, `screen`, `source-atop`, `destination-out` and `destination-over`. A blurred or shadowed packet is drawn sharp on a kept scratch surface around it (smaller when the blur is wide), blurred there one direction at a time (across and down, or along and across a directional blur's angle) and laid back under its clips and blend; a shadow is cast from the blurred packet. Not yet: the blends that read the destination per pixel (`overlay`, `soft-light`, `lighten`, `darken`) and those Canvas applies to the whole surface outside the shape (`source-in`, `source-out`, `destination-in`). `multiply` is exact over an opaque destination, which is where the engine uses it (a light layer over the scene).

How it draws, so its results match Canvas:

- **Shapes** are stencil-then-cover. The outline is cut into lines (`paths.mjs`: `flattenGeometry` follows Canvas's path rules, curves within a quarter device pixel), its fan of triangles counts winding into the stencil (`nonzero` up and down by face, `evenodd` flipping), and one quad over the shape paints the marked pixels once and clears them. A stroke (`strokeTriangles`, with Canvas's caps, joins and miter limit 10; `dashPaths` for dashes) is marked the same way, so overlapping triangles never double its paint. The stencil's top bit is the clip; each clip narrows it.
- **Paint** is premultiplied. Colours are CSS strings read by `colors.mjs` (`readColor`: names, hex, `rgb()`, `hsl()`); an unreadable colour throws. Gradients are a 256-step ramp (`gradientRamp`, interpolated without premultiplying, as Canvas does), radial ones Canvas's two-circle cone. Patterns repeat their image in the shape's local space.
- **Targets, layers and pictures** are framebuffers, multisampled where the GPU allows and resolved after each pass. A picture is painted once per key at the density the view needs (`densities`), into its own surface, and stamped; one whose packets blend other than normal and that is not `layered` is drawn as vector, kept to its bounds, as Canvas does. Pictures are kept up to `max_picture_bytes`, least recently stamped going first. There is no per-frame painting budget yet: a missing picture is painted when first stamped.
- **Text** is a texture of the line, rasterized by the platform through canvas.mjs's `rasterizeCanvasText` (the one place 2D Canvas is used for WebGL) at the view's scale, and cached; `measureText` is `measureCanvasText`, the same numbers as Canvas. Text cannot be filled with a pattern.
- `statistics` gives `{pictures, picture_bytes, texts, ramps, resources}`.

`tools/test-webgl-pixels.mjs` draws one scene through `renderSystem` on Canvas, switches to WebGL on a fresh canvas, draws it again and compares them pixel by pixel (also at DPR 2 under a turned, zoomed camera), then switches back; it compares blur, shadows and effects the same way. `tests/webgl.test.mjs` checks the colour reading, outlines, strokes, dashes and the declared subset without a GPU.

Surface notifications are for platform wiring/queries; await the mount Promise before another resource/backend mutation.

A committed replacement is not rolled back if an old-backend disposer or surface notification fails: the new backend is installed and the error is reported. Initialization/resource preparation failures before commit retain the old backend. The caller must discard a failed fresh surface if its browser context type was already selected.

## Verification and remaining migration

`tests/rendering.test.mjs` checks camera transforms, interpolation, bounds, packet reuse/sorting, data-only validation, native culling, passes, capabilities, replacement/disposal, image atomicity and Canvas state balance. The tests use the sibling physics package as a fixture; runtime rendering modules import only this folder. `tools/test-rendering-browser.py` checks actual pixels at DPR 2, curved paths, gradients, masks, sprites, text, shadows, offscreen composition, camera pointer conversion and fresh-surface replacement/input retargeting. It verifies unchanged physics and no page/console errors.

`tools/test-art-pixels.mjs` draws the toolkit on a real Canvas in Chromium and checks it pixel by pixel.

Next convert shared appearance/animation and game drawing classes to this contract, including the player, humanoids, props/buildings, lighting/reflection passes and effects. The old `drawList`/`renderQueue`/Canvas artists remain until their callers are converted and visual/performance parity is checked. Session/player gameplay and persistence conversions remain separate pending work.

Verified batch: **217 combined engine/controls/rendering/Directory/runtime tests**, including 14 rendering contracts, 17 controls contracts and 19 runtime contracts. The three Basement packages pass **165 tests** together after copying them outside the checkout. Existing game regressions and four Chromium acceptance scripts remain separate gates.

## Existing Canvas host migration

`canvasRenderer.drawPackets(context, packets)` is a synchronous compatibility boundary for a host already inside a Canvas drawing pass. It accepts inline packet data, validates the complete batch, then uses the same Canvas backend as `renderSystem`. It preserves the host's current transform, clip, opacity, drawing state and backing dimensions; it never clears the surface or installs a simulation clock. Buffers/backend instances are reused per context through weak ownership. Resource-ID packets reject before drawing: registered images/targets/geometry/materials belong to `renderSystem`.

`canvasRenderer.drawEntries(context, entries, {pictures, layered})` draws a run that mixes packets and pictures straight onto the canvas, in order: packets as `drawPackets` does, and each `{picture: {key, bounds, matrix, build}, blend, opacity, prepare}` entry stamped from `pictures` (a `pictureCache`) with its blend at its opacity (a `prepare` entry only painted ahead of need). An entry's `clips` (`[{geometry}]`, each a path geometry in the context's units with its `fill_rule`) limit where its stamp lands, as packet clips do. `layered` paints each picture with its own base under its blends; a picture marked `layered: true` itself (art whose blends act only on what it paints, such as a strip of lit windows with cut-outs) is painted so wherever it is drawn. `drawLayer` draws its packets this way into its layer.

`canvasRenderer.drawLayer(context, packets, {opacity = 1, blend = 'normal', scale = 1, pictures})` is the same boundary for a layer: it draws the packets into an off-screen surface the size of the canvas (times `scale`) under the context's current transform, then lays that surface over the canvas at `opacity` with `blend`. The light layer is drawn this way. Under `renderSystem`, the same packets go into a pass on a `target` resource, drawn back as a sprite.

`new pictureCache({max_bytes = 48 MB, budget_ms = 3, densities = [1, 1.5, 2, 3, 4]})` is the same boundary for art that rarely changes: paint once, stamp every frame. `draw(context, {key, bounds, layered, matrix, source}, build)` stamps the picture named `key` (only the part inside `source` [x, y, w, h], local units, when given: a tile of a strip) (the packets `build()` returns, in local units inside `bounds` `[x, y, w, h]`) under the context's transform times `matrix`, and returns `'stamp'`, `'paint'` or `'vector'`. A picture is painted at the first density (device pixels per local unit) at or above what the view needs, so zooming in paints a sharper one, and past the last density it draws as vector. `beginFrame()` starts a fresh painting budget; a picture still waiting draws as vector meanwhile, clipped to its bounds. A tile (a picture stamped with a `source`) never waits: as vector it would draw the whole picture under its clip, which costs more than painting it, so it is painted past the budget. With `stamp: false` it only paints the picture ahead of need when the budget allows, and draws nothing (`'paint'`, `'kept'` or `'later'`). A picture with any blend but normal always draws as vector, because inside a picture a blend has nothing under it to act on, unless it is `layered`: it paints its own base first, so its blends act on that and it is cached like any other (a light layer's dark with its cuts). When `max_bytes` would be passed, the least recently stamped pictures go first. `release(prefix)` lets go of the pictures whose keys start with `prefix` (`clear()` all of them), and `statistics` gives `{pictures, bytes}`. The key must name everything the picture shows: the cache never looks inside `build`. A shadow's blur is in device pixels, so a picture keeps the blur it was painted with. Under `renderSystem`, the same picture is a `target` resource drawn back as a sprite.

`render.measureText(text, font)` gives `{width, ascent, descent}` for one line in `font` `{family, size, weight, style, letter_spacing}`, as the live backend draws it, for art that fits a label to a box.

These `canvasRenderer` statics are Canvas-only host tools, not the contract: under `renderSystem` the same packets go into layer passes and `picture` packets, which every backend draws.

## Light layer

`createLightLayer({bounds, tint, areas, lights})` (`lighting.mjs`) builds the darkness over a scene as packets: `tint` over `bounds`; each area (`{rects | polygon, cut}`) thins the dark by `cut`; each light cuts its reach out of the dark (`destination-out`), then every light's colour is added (`add`). A point light is `{position, radius, inner_radius, polygon, intensity, cut, color, glow, glow_stops}`: a radial cut from `inner_radius` to `radius` shaped by `cut` (`[[offset, alpha]]`, default `LIGHT_CUT`) at `intensity` (capped at 1), kept inside `polygon` when given (from the physics world's `getVisibilityPolygon`, so walls cast shadows), and its colour added at `glow` through `glow_stops`. An area light (`shape: 'area'`, `size`, `round`) does the same over a rounded strip. Draw the layer over the finished scene at the dark's strength.

`createLightLayerParts({extent, tint, areas, lights, key, tile_size, view, ahead, waiting})` is the same layer split so what holds still is painted once. Lights marked `still: true` go into pictures over `extent` (the whole map): the dark with their cuts and the areas' thinning, and their colour. The other lights stay live packets. It returns, in order, the dark pictures, the live cuts, the colour pictures (`blend: 'add'`) and the live colour; cuts and added colour each commute, so this draws the layer `createLightLayer` does. With `tile_size` the pictures are tiles over the extent (a map's regions) and only those meeting `view` are returned, so a big map keeps only the tiles near the camera and a change repaints only the tiles its light reaches; the tiles within `ahead` of the view (px all round, or per-side margins from `aheadOf`) follow last, marked `prepare`, so they are painted before the camera reaches them; `waiting` lists the reaches (`[left, top, right, bottom]`) of lights not ready yet (a shadow still to cast), and a tile ahead that one of them reaches waits for it, so it is painted once, whole. A light marked `still: 'glow'` keeps its colour in the pictures and cuts live (a lamp whose shadow moves: its colour is not shadowed); the dark and colour pictures are keyed apart, so one repaints without the other. A picture's key hashes the tint, its tile, the areas over it and what each still light reaching it draws there (each light hashed once a frame); a light's `polygon` is known by its array, so give a new array when its shadow changes. Draw the parts with `canvasRenderer.drawLayer(context, parts, {pictures})`: a picture entry (`{picture: {key, bounds, build}, blend, prepare}`) is stamped from the `pictureCache` into the layer as a `layered` picture, repainted only when its key changes; a `prepare` entry is only painted.

Light shapes besides `point`: `{shape: 'area', rects | polygon, rotation}` is a soft strip, turned by `rotation` round its centre; `{shape: 'beam', position, rotation, length, width, near_width, polygon}` is a cone from `near_width` at the light to `width` at `length` (a headlight), cut by `polygon` when given, drawn as `BEAM_LAYERS`. A light marked `still: 'stamp'` holds its shape while its strength changes or it moves (a pulsing sign, a stuttering lamp, a shot): its cut and its colour are pictures keyed by its shape only, painted once at full strength round its own origin, and stamped where it is at its strength; the entries are `{picture: {key, bounds, matrix, build}, blend: 'destination-out' | 'add', opacity}` and come after the darks and after the colour pictures. A picture entry's `opacity` (0..1) is applied by `drawLayer`, and `pictureCache.draw(context, {key, bounds, matrix, blend}, build)` draws a stamp in `blend` (a picture waiting for the budget draws as vector in the same blend), so lights of one shape share one picture.

The context parameter exists only at this transitional host/backend boundary. Artists never receive it. They emit normal geometry/material/transform/clip packets, and a native `renderSystem` backend can consume the exact same packets directly. New native render hooks should call `frame.submit`, not this adapter. Renderer replacement still requires the ordinary fresh-surface lifecycle.

Drone and VelvetCat now use the packet contract in both the playable host and native runtime presentation. Other classic artists remain on their original direct Canvas paths. This does not claim a whole-game renderer cutover.
