# Editing the Atrium project

`project.json` is the authoritative version-two portable project. Edit it by hand, import it into Studio, or export a modified copy from Studio. JavaScript implements behavior; the JSON describes the world. Run `npm test` and `npm run build` after source edits. GitHub Actions also builds downloadable game and Studio HTML artifacts from this branch. After editing JSON directly on GitHub, download the Actions artifact for that commit: checked-in `dist/` files remain at their last committed build until explicitly rebuilt. CI does not rewrite repository files.

Strict JSON cannot contain comments. This guide and the property metadata in `engine/basement/properties.js` supply the explanations; do not add JavaScript expressions to the JSON.

## Package and identity

The package has `schemaVersion: 3`, a stable `id`, a display `name`, `materials`, `assets`, and `scenes`. This first milestone keeps dependencies together in **one portable package**, making phone import/export practical. Separate source documents and general dependency-graph loading remain future work. Both realms are embedded in the delivery HTML, but live worlds and GPU batches are constructed only when needed.

Authored entity, asset and scene IDs are persistent strings. Runtime `World` IDs are separate monotonic session identities. Undo, reload and Play must never write runtime identities back into the package. IDs must be unique within their table; asset references must resolve. Renaming an asset ID requires updating its placed references.

## Assets and placed instances

An asset declares `id`, `name`, `generator: "toy.assembly"`, `generatorVersion: 1`, `parts`, and `colliders`. The explicitly registered generator version is checked during packaging and opening. Unsupported versions fail; no implicit migration changes existing geometry.

Each part has a stable local `id`, `parent` (an earlier part index, or `null` for the instance anchor), local `position: [x,y,z]`, a unit `rotation: [x,y,z,w]`, and optional `shape`. A shape contains full `size: [width,depth,height]`, a linked `material` ID, and optional Boolean `castShadow`/`ambientBlocker`. Parts form a parent-before-child tree; forward references and cycles are rejected. Planters, galleries, colonnades and lanterns are grouped assemblies. Identical planters and lamps share one source asset per realm while retaining independent placed transforms and runtime shapes.

A scene entity places an asset using `id`, `name`, `asset`, `position`, `rotation`, positive uniform `scale`, and `locked`. `tag` identifies this example's `prop` and `lantern` interactions; the lantern asset contains a part named `crystal`. The `planter` tag selects the example’s initial inspector target. These are game/application conventions, not engine-wide names. Keep both tagged instances when using the Atrium Play behavior. Removing those conventions requires corresponding game behavior changes.

Instance transforms affect only that placement. Editing an asset's parts deliberately affects its instances when the project is reopened. The initial asset browser is an inventory, not an asset geometry editor. Per-instance material overrides are editable now; reparent commands, seeds and general migration tooling remain future work. Version-one inline appearance has a specific validated ingress migration.

## Coordinates and properties

World units are metres by convention: X/Y horizontal, Z elevation. Quaternions store full orientation; numeric XYZ rotation controls display degrees and compose Z × Y × X. Uniform instance scale prevents hidden hierarchy shear. Box dimensions can differ by axis, but there is no arbitrary nonuniform hierarchy scale.

The inspector shares metadata, validation and controls between transforms, point lights and materials. Arrow keys use each descriptor's increment; directly entered values may use any valid precision. A focus session or pointer drag is one undo command. Escape and cancelled touches restore the starting snapshot. The Move tool uses a horizontal construction plane; use Top or Oblique view, with optional 0.5 m / 1 m snapping. Vertical movement, full rotation and scale have numeric controls; rotation also has an interactive axis ring. Camera presets, horizontal orbit buttons, wheel and zoom buttons are available; both orthographic and perspective lenses are available. Free-flight navigation and translation-axis gizmos remain future work.

## Environment and collision

A scene supplies its stable `key`/`id`, display name, `ambient`, `sun.direction` (toward the light), `sun.color`, eight `lights`, and the example's `ethereal` flag. Each point light supplies its own stable `id`, world-space `position`, `radius`, and linear RGB irradiance `color`. RGB numbers can exceed 1 for light intensity; they are not hexadecimal display colors. The `lightVariants` object supplies the game lantern's `cool`/`warm` crystal colors and irradiance.

Local asset `colliders` describe horizontal boxes using `x`, `y`, `width`, `depth`. Moving, rotating or scaling an instance updates its conservative XY collision bounds together with the render transform. These remain **planar movement bounds**, not full 3D contact physics, stairs or a rigid-body solver. The current game still uses its courtyard landing limits and planar backpack controller.

## Saving, recovery and Play

Export JSON downloads a portable project, not an HTML build. Import validates size, schema, references, versions and preview construction before replacing the current document. Invalid files leave the open project intact. Successful edits also update one best-effort browser recovery slot. Recover is explicit; browser storage may be unavailable/evicted, so keep exported backups.

Play releases the editing preview and creates isolated runtime worlds from a detached snapshot. Stop disposes game controls, subscriptions and residency, then reconstructs the authored preview and restores the editor camera. Game mutations never silently become project edits. Input bindings are cleared at the context switch; editor tools and shortcuts are disabled during Play. The first fixture starts the game in its first realm, regardless of the currently inspected realm.

## Explicit budgets and delivery

- Portable compact JSON: 512 KiB maximum, checked before parsing imports.
- Up to 8 scenes, 256 assets, 256 placed entities per scene, 128 parts per asset, and 4,096 source parts overall.
- At most 1,800 placed parts per scene, reserving the 2,048-instance runtime batch capacity for the actor and diagnostics. Collider lists are limited to 128 per asset.
- History: at most 64 commands and 2 MiB of UTF-16 snapshot strings; larger projects consequently retain fewer commands. A current document, active gesture snapshot, save checkpoint and one recovery slot are additional bounded data.
- Editing owns one preview world; Play owns the existing two-slot residency. A validated import may briefly construct one additional candidate preview before atomically releasing the old one.
- Move previews coalesce pointer updates through the existing Lobby input phase. Asset construction is bounded but currently synchronous per scene; general large-scene streaming/authoring rebuild scheduling remains future work.

`dist/ETRNLNINE-Atrium.html` contains the game without Studio imports. `dist/ETRNLNINE-Studio.html` contains the workspace and its selected project. Both embed the required JSON, need no sibling files/CDNs, and use WebGL2 with HTML interface controls. The bundler intentionally supports a small explicit module syntax, not arbitrary JavaScript transformations.

## Authoring tools and workspace guides

Open **Assets**, search the project library, choose a card and tap the viewport to place it. Placement snaps horizontally and offsets the asset's lowest transformed point onto Z=0. **Copy** (Ctrl/Cmd+D) makes a new placement with a fresh authored ID and the same asset reference; **Delete** removes the selected unlocked placement. Undo restores deletions. Atrium's required prop/lantern interaction anchors are protected from deletion, and copied anchors lose their unique game role. These are example policies, not engine tag rules.

Choose **Rotate**, an X/Y/Z axis, World/Local space and an angle increment. Drag the ring to rotate; cancelling restores the starting orientation and a completed drag occupies one history entry. Use Top for Z, Front for Y or Side for X when a ring is edge-on. Numeric rotation remains available. Point lights do not have rotation properties.

**View & guides** contains independent grid and light-marker toggles. Markers select point lights for the same inspector and Move tool. Hiding markers preserves lighting; hiding the grid preserves snapping. Grid, markers and dial are WebGL guides, separate from authored geometry, collisions, shadows and AO. They are released during Play and restored on Stop. Axis, space, angle snap and guide visibility are best-effort local view preferences, not project edits.

The current implementation and resource budgets are recorded in [decision 0008](../../docs/decisions/0008-studio-authoring-tools.md). These tools prepare the street-block work; they do not add the new building or humanoid themselves.

## Other installed projects

Studio now also includes the [Freelancer street/vestibule slice](../../games/freelancer/DOCUMENTS.md). Choose a starter through the project selector; export or undo unsaved edits first. Each installed package supplies validation, Play and application policies through the editor catalog; Atrium remains an independent diagnostic. Import/recovery recognizes installed package IDs. The existing recovery slot is shared, so export backups when moving between projects.

## Viewport navigation and lights

Studio now provides [shared camera controls](../../docs/decisions/0010-viewport-navigation.md): mouse/touch orbit, view-plane pan, pointer-anchored zoom, F/Home framing and Reset view. Camera view state is separate from authored JSON/history. The same record lists the currently editable light-object fields (XYZ, linear RGB 0–16, radius 0.1–100 m) and distinguishes engine-level shadow settings.

## Linked materials

The project-level `materials` table defines base colour and independent emission colour/strength. Each shaped part references a material ID. Placement `materialOverrides` can redirect individual parts without copying source geometry. Old version-one files migrate once on import/recovery; exports use version two. Use Studio’s Materials tab or the object inspector’s Surface part/Assigned material controls. [Current contract](../../docs/decisions/0013-presentation-and-materials.md).

## Specular surface tuning and colour controls

Materials may also set `specularColor` (linear RGB 0–1, default white),
`specularSharpness` (0 soft–1 polished, default 0.5), and `reflectivity`
(normal-incidence reflectance 0–1, default 0). Omitted fields preserve the existing
diffuse appearance; 0.04 reflectivity is a useful polished dielectric starting point.
These reflect direct lights, not scene/mirror images. The shared inspector's colour
pills open a CSS hue/saturation wheel, brightness, HDR intensity, sRGB hex and precise
linear RGB fields. Apply commits one edit; Cancel/Escape restores the prior colour.
See [the surface contract](../../docs/decisions/0018-surface-response-and-colour.md).

## Origin/component update

Canonical packages are version 4 (version 4 adds mesh recipes and joint poses; see [decision 0023](../../docs/decisions/0023-authored-meshes-and-poses.md)). Objects have a nullable `asset` and a `parent` object
ID (or null), with local transforms; parents precede children in storage. Empty origins
need no geometry asset. `locked` affects editing, `selectable` viewport picking, and
`visible` visual rendering; hidden colliders remain independent. Older files upgrade
at ingress. See [the full contract](../../docs/decisions/0019-origins-locks-and-number-surfaces.md) for linked/unique geometry, inherited locks,
precise slider/number fields and explicit remaining mesh/light-component limits.
