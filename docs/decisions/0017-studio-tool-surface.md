# Studio · foldable tool surface

Implemented 2026-10-17 after the owner requested a way to fold the Select, Move/grab, Rotate, Orbit/Pan and related toolbar controls to reveal more of the scene. Extends [0015](0015-studio-diamond-shell.md) and [0016](0016-viewport-panel-and-iconography.md).

The **Tools** diamond at the viewport's upper-left folds the complete tool surface: transform actions, rotation settings, camera modes and viewport shortcuts. Folded tools are invisible, inert and excluded from keyboard navigation. A labelled reopening node remains outside the surface, with a native 44px target, expanded state and keyboard activation. Escape from the toolbar or its node folds it and returns focus to the node; text/select editing retains its normal Escape behavior.

Folding preserves the selected tool and camera mode. Pan can remain active while its toolbar is hidden. The canvas keeps its dimensions, camera and selection; no project JSON, undo command or renderer allocation changes. Any pending viewport gesture is cancelled before changing visibility. Opening drawers and placing assets preserve the user's Tools choice. The toolbar starts open; desktop and phone choices are kept separately for the workspace instance. Play hides tools and the node, then restores the prior choice on Stop.

## Ownership

No new widget, toggle handler, preference store or engine API is needed. Studio creates a second instance of Penthouse's existing **PanelDock**, with a disjoint DOM host:

- The main workspace dock owns mutually exclusive phone drawers (Directory, Properties, Viewport).
- The stage dock owns only the Tools surface and its reopening node. Its state cannot be cleared by drawer exclusivity or placement's closeAll command.

Each instance owns its listeners, root data attributes, borrowed accessibility state and cleanup. Studio finishes only drawer-owned property edits before drawer changes; the outer dock does not blur focused toolbar controls during resize. Studio suspends both through the existing Play state callback and disposes both through the workspace Lifetime. ETRNLNINE, renderer and Lobby contracts are unchanged.

Studio CSS positions the toolbar beside the node. On phones Orbit/Pan use the shared SVG icons with accessible names so the controls remain compact. The stage node stays under side drawers rather than covering their fields; folding an overlapping drawer reveals it. The existing shared theme/dock CSS supplies native focus, label and touch behavior. No body visibility flag or parallel mobile toggle is added.

[Previews and actual verification](../milestones/tool-fold/README.md). Run `npm test`, `npm run build`, `npm run test:tool-fold`, and relevant shell/authoring/camera regressions. The focused acceptance checks folded touch panning, retained Rotate/Pan, keyboard focus, independent drawers/layouts, both Play restoration states, unchanged documents, hit size and canvas dimensions. Rendering algorithms are unchanged; this milestone does not claim physical-phone performance.
