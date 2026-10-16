# Studio · Viewport surface and original iconography

Implemented under the owner's green light to replace the growing View & guides menu with a coordinated Viewport surface and a consistent SVG family. Extends [0015](0015-studio-diamond-shell.md); camera, rendering, authored data and material contracts retain their owners.

## Workspace behavior

A third labelled violet diamond opens **Viewport**. Camera, Guides and Appearance each have a native expandable section, plus a compact section selector that opens the desired group directly. Appearance can be reached without scrolling through all camera fields. The section selector sticks while scrolling. Expanded summaries remain usable directly; selecting a section opens only that group. Camera opens initially; the selected section lasts for the workspace instance.

- **Camera:** orthographic/perspective, view presets, vertical FOV, frame selection/all, reset, incremental orbit and zoom. FOV is clamped to 15–110 degrees, malformed/empty input restores the previous value and reports the error. Orthographic mode disables FOV.
- **Guides:** construction grid, light markers, independent XYZ world axes and the selected assembly’s bounds outline, with move snapping kept explicit. Guide visibility does not modify actual lights, geometry or collision. Axes extend six metres from the origin. The selection outline is a twelve-edge world-space bounding box around the resolved selected assembly, not a pixel silhouette effect.
- **Appearance:** the existing shared exposure/bloom widget, quality, four recipes and full artistic tuning. The renderer and effect algorithms are unchanged.

Four icon shortcuts expose lens, grid, light markers and frame selection. Shortcuts and detailed controls invoke the same controller actions and read the same existing state. Lens shows the active projection and guide buttons show visibility with aria-pressed. Camera and effect changes never edit project JSON, add undo entries or enter recovery data.

Wide layouts retain independent Directory/Properties columns. Viewport overlays the stage beside Properties, without altering the camera's canvas dimensions. On phones all three surfaces use the same PanelDock and remain mutually exclusive. A clear opposite rail keeps the other diamonds reachable; nodes move out of the way of open property fields. Escape, keyboard activation, inert hidden panels, per-layout choices, reduced motion and Play/Stop restoration follow the shared dock contract. Opening an asset or inspector never creates another panel visibility system.

## Icon language and ownership

The first original family supplies 33 icons in a 24-unit view box, using a consistent 1.5-unit stroke and clipped geometry. Move, rotate, orbit, pan, lenses, guides, framing, scene/assets/materials, file actions, Play/Stop and history have distinct SVG silhouettes. SVG is DOM interface art only; the actual scene/guides stay WebGL. Diamonds continue to mean opening/folding workspace surfaces. No icon fonts, downloaded artwork, Canvas2D, external SVG requests or sprite IDs are used.

- **Penthouse [workspace-icons.js](../../engine/penthouse/workspace-icons.js):** immutable path catalog. Registration is inert and does not allocate SVG DOM, textures or buffers.
- **Directory:** the existing generic registry exposes `ui.icons` through Penthouse's inert factory table. Directory itself contains no icon-specific code or app dependencies.
- **Penthouse [IconControls](../../engine/penthouse/icon-controls.js):** injected catalog → decorative SVG and readable/accessibly named controls. Supports dynamic Play/Stop and lens changes; restores borrowed content, classes, accessible labels and tooltips on idempotent disposal. No actions or scheduler.
- **Studio [iconography.js](../../editor/workspace/iconography.js):** maps declared application control art to the shared decorator. Labels remain real text; icon-only controls preserve native accessible names, tooltips and 44px targets.
- **Studio [ViewportPanel](../../editor/workspace/viewport-panel.js):** application commands, section navigation, preference adoption and synchronized controls. Owns/cleans listeners; receives camera/renderer/preferences and framing callbacks. Uses the existing status subscription for occasional camera-state refresh, with no additional loop.
- **Penthouse [AuthoringGuides](../../engine/penthouse/authoring-guides.js):** axes share the existing depth-tested line layer; selection bounds share the foreground widget layer. Both default off, allocate only when needed, and release when hidden. World bounds resolve lazily after document/selection changes, not on each render or camera move. No guide enters collision, AO, shadows, source geometry or project data. Layers remain bounded at 1,024 vertices each.
- **Studio [main.js](../../editor/main.js):** assembles these components and adds Viewport to the existing dock. View-control handlers move out of the bootstrap rather than accumulating a parallel handler set.
- **Shared theme / Studio CSS:** generic vector sizing and compact-caption accessibility live in Penthouse's opt-in theme; application layout, sections and responsive rail positions live in the single Studio stylesheet.

Icons are decorative and hidden from assistive technology; the owning native button/summary supplies its name. Active state also has an outline and aria state, rather than relying on icon shape or color alone. The shell uses near-black opaque surfaces for readable overlapping panels, violet interaction/focus and gold selection. Future DAW/Studio workspaces can request the same catalog/decorator; no audio implementation is claimed here.

## Verification

[Previews and measured checks](../milestones/viewport-panel/README.md). Relevant commands: `npm test`, `npm run build`, `npm run test:viewport-ui`, `npm run test:browser`, `npm run test:studio-shell`, `npm run test:studio`, `npm run test:studio-tools`, `npm run test:camera`, shared bloom-UI acceptance and material acceptance. Browser tests operate real diamond buttons rather than assigning the retired details menu's open property. Test camera projections use the current canvas, not old mobile-height assumptions.

Behavioral tests use Chromium/SwiftShader and emulated touch, not a physical-phone speed measurement. Existing rendering limitations and clustered-lighting roadmap are unchanged.
