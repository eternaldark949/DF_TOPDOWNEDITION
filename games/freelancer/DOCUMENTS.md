# Freelancer · first Enni Cole slice

`content/project.json` is the editable source. Normal `npm run build` validates and embeds it; it does not regenerate it. Studio opens the same package through the **Freelancer** starter selector. Export before changing starters when you have unsaved edits. The selector is disabled until you export or undo those edits. Imported files resolve to explicit installed applications by package ID.

The standalone build is `dist/ETRNLNINE-Freelancer.html`. Studio is `dist/ETRNLNINE-Studio.html`. Both run offline in a WebGL2 browser without sibling files, fonts, CDN or Canvas2D. The game-only build excludes Studio. The source entry is `games/freelancer/index.html` when serving the repository.

## Play

Walk with WASD, arrows, a gamepad's left stick or the touch joystick. Steering follows the camera's horizontal orientation. Approach the arched entrance and press E, gamepad A or the Enter touch button. The contextual prompt names the doorway when you are within reach. Entering prepares the vestibule and transfers the same actor tree at a simulation boundary. Press again near its exit to return. Each transition requires a fresh press; holding an action cannot bounce between worlds.

Movement uses a sliding horizontal circle with a 0.38 m radius. A spatial grid indexes static collider footprints, and the motor limits each collision step to 0.12 m. These are planar kinematic movement rules, not full 3D stairs, parkour or rigid bodies. The existing box-based backpack traveler remains a diagnostic placeholder pending the separate humanoid silhouette review.

Soft lighting uses geometry AO and one low-resolution sun shadow map. Fine contacts enables screen-space AO and a larger sun map. Low power turns AO, cast shadows and bloom off. These modes do not establish physical-phone performance; use the integrated profiler and test an actual device. The renderer still uses opaque colored/emissive boxes, without transparent/PBR glass, volumetric fog or wet-road reflections. The shared **Image & effects** panel opts into antialiased HDR Soft/Fine bloom, with strength/spread/threshold/exposure controls. It starts Off; read the [HDR bloom guide](../../docs/decisions/0012-hdr-bloom.md) for costs and fallback. Selecting another lighting tier does not silently re-enable bloom.

## Art and assemblies

The first block is inspired by main's Enni Cole palette and the owner's photo: rose masonry, champagne trim, dark framing, amber showroom windows, a projecting arch and faceted curved upper showroom. It is a new authored 3D slice, not a geometry or gameplay import from main. Nineteen source assets supply 35 exterior placements (602 parts) and 11 vestibule placements (198 parts), plus the runtime traveler. The vestibule is an open cutaway with marble joints, a runner, medallion/EC monogram, concierge desk, planters and chandelier; the full department-store floors and departments are not implemented.

Matching window bays, lamps and planters reference shared source assets. Studio can place/copy/delete eligible instances, transform them, edit lights, save and Play. Linked materials are editable in the contextual inspector; source-part geometry editing still uses JSON and reopen. Shell, ground and required anchors are intentionally protected; this is application policy. A full building is currently composed of several named placements, not a nested prefab document with cross-instance parenting.

`content/author.js` records the starting art recipe with comments and reusable architectural helpers. Run `node games/freelancer/content/author.js` **only when you want to replace the JSON with that recipe**; it overwrites manual/Studio edits. Keep exported backups. The build does not run this command. Generic beams/arch parts and geometric lettering live in Penthouse; named content/palettes stay here.

The geometric signage supports a small Latin-capitals alphabet. Its strokes are ordinary bounded assembly geometry, with normal instance visibility culling and world ownership. It is not a general text buffer, localized typesetter or new world-label residency system.

## Scene extension fields

The base schema/units/asset shape remain in [the shared JSON guide](../../examples/atrium/DOCUMENTS.md). Freelancer validates these additional fields at build, import and open time:

| Field | Meaning |
| --- | --- |
| `navigation` | Finite `minX`, `maxX`, `minY`, `maxY` walking bounds, in metres |
| `spawn` | Initial XYZ player anchor; root Z is on the planar navigation layer |
| `camera` | Focus XYZ, azimuth/elevation radians and orthographic `halfHeight`; narrow screens fit a wider authored frontage |
| `portals` | One reciprocal doorway per scene for this first two-scene slice |
| `portals[].anchor` | Stable placed entity ID; the local offset follows its position, scale and quaternion |
| `offset` | Portal interaction point relative to its anchor |
| `radius` | Explicit action reach in ground metres, at most 4 m |
| `targetScene`, `targetPortal` | Reciprocal destination scene/door identities |
| `arrivalOffset` | World-axis offset applied when arriving at this portal; choose collision-free floor space |
| `label` | Contextual interaction text |

Navigation metadata and portals are game data, not Basement's knowledge of named places. A blocked destination fails at the final boundary and leaves source membership intact. Moving away while a doorway prepares also refuses the transfer. Spawns are checked before activating gameplay. Scene resources own their collider index, instance mappings, world, GPU lease and retained light arrays. Preparing another world does not render it or move the actor asynchronously.

Only two worlds may be resident. There is no unconditional prewarming in this first slice: the linked destination prepares on interaction. Static scene capture stores a version marker; it does not claim persistent inventory, NPCs or store progression. Stop/Restart releases controls, callbacks, tickets, definitions and world resources. Studio Play receives a detached project and does not write simulation state into JSON.

## Source reading order

1. `project.js`: data validation and application policy.
2. `portals.js`: anchor resolution, reach and movement/landing legality.
3. `journey.js`: doorway requests and owned residency/travel lifetimes.
4. `scene.js`: input, motor/gait, status and render-phase composition.
5. `main.js`: standalone UI/startup; `editor/projects.js` installs the same factory in Studio.
6. `engine/directory/scene-world.js`: generic static-scene preparation and cleanup.
7. `engine/basement/spatial-grid.js`, `planar-motor.js`: reusable collision/movement mechanisms.

Run `npm test`, `npm run build`, and `npm run test:freelancer`; use the Studio regression suites after shared workspace edits. Browser checks need development Chromium/Playwright, not runtime packages.

## Studio camera navigation

Use the shared [viewport controls](../../docs/decisions/0010-viewport-navigation.md) to orbit, pan, pinch/zoom and frame the selected asset or all authored geometry. These are editor view changes; they do not overwrite this game's camera metadata or enter document history.

## Linked materials and image presentation

The authored source is schema version 3 (linked materials were introduced in version 2). Box parts share project material IDs; per-placement overrides support private materials. Edit material definitions in Studio’s Materials tab, or select a building/prop and choose a Surface part in its contextual inspector. Emission has its own RGB and strength, independent of base colour. These are real supported diffuse/emissive parameters; PBR/transparent glass is still future work. Exposure/HDR scene ownership now belongs to Presentation, and Bloom owns its filter only. [API and lifecycle](../../docs/decisions/0013-presentation-and-materials.md).

## Surface polish

Every linked material accepts optional `specularColor` (linear RGB 0–1),
`specularSharpness` (0–1) and `reflectivity` (F₀, 0–1). Defaults are white, 0.5 and 0;
existing content retains its diffuse appearance. Start around 0.04 reflectivity for
polished stone. These controls render direct-light highlights, not mirror images of
the street. Colour pills open the shared wheel/hex/linear-RGB/HDR editor; Apply is one
undoable command and Cancel/Escape restores the opening value. Content palettes are
not automatically rewritten. See [the contract](../../docs/decisions/0018-surface-response-and-colour.md).

## Origin/component update

Canonical packages are version 3. Objects have a nullable `asset` and a `parent` object
ID (or null), with local transforms; parents precede children in storage. Empty origins
need no geometry asset. `locked` affects editing, `selectable` viewport picking, and
`visible` visual rendering; hidden colliders remain independent. Older files upgrade
at ingress. See [the full contract](../../docs/decisions/0019-origins-locks-and-number-surfaces.md) for linked/unique geometry, inherited locks,
precise slider/number fields and explicit remaining mesh/light-component limits.

## Humanoid silhouette review

`content/humanoid-949.json` holds Stella / 949's proportions, posture, backpack and palette for the generic Penthouse humanoid. It is a starting proposal for review. Open `dist/ETRNLNINE-Humanoid-Review.html` to see front, three-quarter, side and back figures plus the gameplay camera, in shaded or solid-silhouette looks, standing or walking. The **Proportions** panel edits every parameter with undo; **Export JSON** downloads a replacement for the content file. Lengths are metres, angles radians and fractions are of standing height; [decision 0020](../../docs/decisions/0020-humanoid-silhouette-review.md#document-fields) lists every field and its limits. The street scene still uses the diagnostic traveler until the proportions are approved.
