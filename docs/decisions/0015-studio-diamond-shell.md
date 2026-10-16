# Studio · labelled diamonds and the DFAB palette

Implemented after the owner's green light to bring the original editor's diamond panel controls, nearby collapsed labels and nocturnal violet/gold palette into the universal Studio. Extends [0007](0007-studio-first-workspace.md) and [0008](0008-studio-authoring-tools.md); scene, material, rendering and document contracts remain in their existing owners.

## Interaction and appearance

Directory and Properties use glowing violet diamonds. A small label beside each collapsed diamond names its panel. Expanded panels supply their own heading and an outlined diamond for folding them away. Each control is a native button with a minimum 44×44 CSS-pixel target around the smaller visible diamond; keyboard focus receives a clear outline. Labels are part of the same button, not a second action.

Violet marks interaction/focus and panel controls. Champagne gold marks active tools, selections and headings. Warm off-white supplies content, with brighter muted labels and larger property text than the reference. Play, Undo, Export and other commands retain labelled buttons. System typography and CSS provide the visual identity without downloaded fonts or Canvas preparation.

Wide layouts have independently collapsible Directory/Properties columns. Compact layouts (760px or below) start with both folded and use one sliding overlay panel at a time. The phone canvas keeps its full dimensions while a panel opens, preserving camera projection and touch coordinates. A clear edge strip leaves the opposite collapsed control reachable. Wide and compact visibility choices are separate, so a resize does not overwrite desktop choices. Panel choices last for the workspace instance; reload uses sensible defaults rather than writing them to project JSON.

Hidden panels are inert and have aria-hidden; controls expose aria-controls, aria-expanded and Show/Hide labels. Enter/Space operate the button. Escape closes a panel when used on its control or non-editing content; input Escape retains normal numeric/text cancellation. Focus returns to the relevant diamond when its panel closes. Reduced-motion preferences remove movement transitions. Play hides both panels and controls and restores the editing choices on Stop.

## Ownership and source map

- **Penthouse [PanelDock](../../engine/penthouse/panel-dock.js):** injected DOM panels/labels, diamond buttons, per-layout visibility, accessibility, media-query listener ownership, suspension and idempotent disposal. It has no editor/game IDs, renderer, history or scheduler. Caller descriptors are copied, and dispose restores the borrowed panels' accessibility state.
- **Penthouse [panel-dock.css](../../engine/penthouse/panel-dock.css):** shared diamond/hit-area visuals. **[workspace-theme.css](../../engine/penthouse/workspace-theme.css):** opt-in palette tokens and baseline controls. Future workspaces/DAW hosts can use these same components; no DAW is implemented here.
- **Studio [studio.css](../../editor/studio.css):** one coherent application layout and contextual surface stylesheet. Replaces the previous accumulating inline override layers. Panel positions, drawer dimensions and editor-only selectors remain here.
- **Studio [main.js](../../editor/main.js):** supplies actual panels, layout defaults and existing gesture cancellation/blur behavior. Context selection opens Properties; placing an asset clears panels. The old mobile-only buttons and parallel body visibility flags are removed.
- **Build tool [styles-module.js](../../tools/styles-module.js):** embeds explicitly linked local self-contained CSS into each offline HTML. Source HTML may link the three maintained stylesheets; delivery has no CSS requests. Unsupported links, escaping the project root, runtime @import/url dependencies and external stylesheets fail. Closing-style text is CSS-escaped during embedding. No new runtime framework or dependency loader.

Panel changes operate on viewport state. They do not change selection, create worlds, add renderer resources, mutate source JSON or add undo entries. The existing Lobby still owns the only frame loop. CSS handles transitions and the renderer observes the resulting canvas dimensions through its existing resize path. The application finishes focused property edits and cancels viewport gestures before panel/layout changes.

## Verification

[Previews and actual verification](../milestones/studio-diamonds/README.md). Use `npm test`, `npm run build`, `npm run test:studio-shell`, `npm run test:studio`, `npm run test:studio-tools`, `npm run test:camera` and shared appearance-control acceptance as applicable. Tests use the real diamond controls and actual current projection, replacing assumptions about the old mobile toolbar and half-height viewport. Software WebGL/emulated touch establishes behavior rather than a physical-device performance claim.
