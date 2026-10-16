# ETRNLNINE Studio — a 3D engine with a shared authoring workspace

Recorded 2026-10-16 from the owner's agreement on the engine's 3D direction, a universal contextual editor, the first authoring milestone, and editable JSON source files packaged into self-contained HTML.

**Historical status when recorded: agreed direction and implementation plan.** See [decision 0007](0007-studio-first-workspace.md) for the subsequently implemented first workspace, schema, camera and packaging contracts. The implementation-status statements below describe the planning baseline. Studio, authored-document loading, shared property metadata, editor commands and JSON embedding are not implemented by this record. Existing rendering, input, worlds, profiling, AO and lighting remain implemented as described in the earlier decisions.

## 1. The engine understands 3D; the game chooses its presentation

ETRNLNINE is intended to become a reusable **3D engine**, with Freelancer choosing a top-down presentation. A fixed camera must not define the engine's spatial capabilities.

Current reality: real box geometry, elevation, normals, depth, lighting and cast shadows are implemented. The camera is fixed oblique orthographic; transforms primarily expose yaw, and movement/collision primarily operate on the XY plane. That is a 3D renderer with an early, mostly 2.5D simulation, not a complete general 3D engine yet.

The target contracts must support full 3D transforms/attachments, movable cameras, projection/unprojection and ray queries, picking, height-aware collision/support queries, slopes, stairs, rooftops, interiors and traversal. Preserve x/y ground and z elevation consistently. Document units and conversions; legacy editor pixels must not silently become engine lengths. The exact full-rotation storage/API and scene transform schema must be settled together before dependent implementation. Quaternions are the proposed orientation representation, not a capability already present in World.

## 2. Universal Studio workspace

**Agreed:** one coherent workspace with contextual properties and tools, rather than eight independent editor applications that duplicate selection, transforms, saving and history.

The shared shell contains a viewport, Directory/asset browser, scene hierarchy, contextual inspector, tool area and document/project controls. The document determines what is being authored; selection determines the inspector target; the active tool determines gesture behavior. Opening a panel must not accidentally replace selection or the document.

Specialized workflows contribute property sections, tools, overlays and preview modes through explicit registrations. A humanoid can expose proportions, joints, equipment and gait previews; a building can expose floors, entrances, materials and collision. An isolated animation view or other focused workspace may open within the shell and remain linked to its source asset. The common control/command/document infrastructure is reused.

Shared numeric/vector/color/reference controls own common input behavior, validation, units, accessibility, mixed-selection values, drag cancellation and transaction grouping. Specialized widgets, such as joint limits, use those same contracts. Updating a common control must benefit every registered workspace using it. Do not assemble another global object with a large type-switch chain and separate histories/input handlers for every asset category.

The world viewport uses the actual WebGL engine and materials. Selection outlines, gizmos, grids, bounds, collision/joint overlays and previews remain Canvas-free. Accessible HTML/SVG inspector panels are allowed. Editor UI is packaged separately from a game-only build; the runtime must work without importing Studio.

## 3. Responsibility map and proposed source homes

| Home | Responsibility |
| --- | --- |
| Basement | 3D math/camera/ray/picking mechanisms; inspectable property contracts; stable authored-identity and serialization primitives; validated command/transaction mechanisms; spatial/collision capabilities. |
| Lobby | Single host scheduler; edit/preview/play execution ordering; input contexts and pointer ownership; budgeted construction/rebuild work. |
| Directory | Project/library registration, document/asset identities and references, version availability, loading and resource leases. No named Freelancer content. |
| Penthouse | Reusable inspector controls, gizmos, overlays, asset preview tools, procedural generators and presets. |
| ETRNLNINE | Small composition root; no panel layout, project selection or game rules. |
| `editor/` | Studio application: shared shell, document/selection/tool coordination, panel composition, project navigation and file/recovery workflow. |
| `games/freelancer/` | Freelancer's project data, worlds, asset definitions, game-specific properties, rules and interface. |
| `examples/atrium/` | Independent first document-driven scene/editor acceptance fixture. |
| `tools/`, `.github/workflows/` | Build-time validation/packaging and eventual GitHub automation. |

Names below are proposed file organization, not directories/features claimed as existing:

```text
editor/
  main.js                    # Assemble Studio against engine public capabilities
  workspace/                 # Universal layout and contextual panels
  documents/                 # Open/close, dirty state, import/export, local recovery
  tools/                     # Tool registration and document/selection coordination
examples/atrium/
  project.json               # Entry scene and explicit packaged dependency manifest
  scenes/atrium.json         # Authored placements and environment
  assets/                    # Asset/prefab documents and procedural parameters
  main.js                    # Example-specific bootstrap and gameplay behavior
  DOCUMENTS.md               # Editable data guide, field explanations and examples
engine/penthouse/
  presets/                   # Reusable data-only defaults where appropriate
  ...                        # Generators and reusable editor toys remain JavaScript
```

Each game/example owns its own project manifest and content. There is no second authoritative copy in a separate global projects folder. Engine presets remain reusable and game-independent. Editor layout preferences stay distinct from game scene data.

## 4. Editable JSON source and one-file delivery

**Agreed:** authored data belongs in associated JSON files in the pre-build source tree, rather than being available only as literals embedded in JavaScript. Code implements behavior, algorithms, generators, systems and rendering. Data describes scenes, placements, asset references, generator parameters/seeds, light setups, presets and configurable control parameters.

Studio edits the same document format that a person can edit by hand on a phone. Avoid separate hardcoded scene definitions that drift from their JSON equivalents. The source documents are authoritative; the final HTML is a generated distributable, not the normal editing surface. Generic JavaScript defaults remain useful for capability definitions and missing optional values; they must not duplicate a scene's authoritative authored values.

Strict JSON has no comments. Meet the owner's generous-commenting requirement through adjacent document guides, versioned field/property metadata with descriptions and units, and any explicitly supported descriptive fields. Do not silently change parsing to accept JavaScript or undocumented JSON-with-comments syntax.

The first schemas must distinguish:

- Versioned project, scene, asset/prefab and preset documents, with stable authored IDs and explicit references.
- Authored state versus runtime state: exclude GL handles, derived geometry caches, input state, live callbacks, transient animation state and simulation/session IDs.
- Generator identity, generator version, seed and authored parameters. A seed alone does not preserve output after the algorithm changes; migrations/version availability must be explicit.
- Reusable source assets versus placed instances and deliberate per-instance overrides. Editing one instance must not accidentally mutate every user of its asset.
- Serializable/editable fields versus derived, runtime-only or read-only diagnostics.

A project manifest identifies its entry documents, registered libraries and included assets. Exact field names, schemas and migration APIs are implementation decisions for the first milestone. This record deliberately does not create pretend loader-ready JSON before those contracts exist.

### Proposed packaging pipeline

```text
Modular JavaScript + project manifest + referenced JSON/assets
    → schema/reference/budget validation
    → reproducible build and embedded content catalog
    → self-contained offline HTML
```

The build should:

1. Select an explicit project/build target and resolve its declared dependency graph. Include the intended project's required files, not every JSON/reference/editor document in the repository. A game-only target excludes Studio tools; an editor target includes its registered authoring tools and selected project.
2. Validate schema versions, identities, required fields, finite/ranged values, asset/library references, supported generator versions and size/count budgets. Report file/field locations and fail clearly on unresolved dependencies.
3. Embed data as safely escaped, non-executable JSON payloads or an equivalent data catalog; preserve parsed string values, including strings containing HTML closing tags. No eval or executable source expressions in JSON. Library/type identifiers resolve through explicit registered capabilities.
4. Preserve deterministic file ordering and reproducible output; record content identity/schema/generator versions needed to diagnose mismatches.
5. Keep the existing zero-runtime-dependency, zero-CDN, offline single-HTML delivery requirement. Packaged JSON must not require runtime fetches for sibling files.
6. Distinguish packaging from residency. The HTML necessarily contains the packaged payload bytes; that is not zero-memory storage. Directory should parse/instantiate the needed documents under explicit budgets, and resource leases control generated geometry/GPU residency. Avoid eagerly constructing every packaged world, mesh, label or editor preview.

Partition large payloads along document/world/library boundaries so parsing and generation can be budgeted appropriately. JSON.parse itself is synchronous and cannot be made preemptible merely by placing it inside a cooperative job. Dependency validation must allow legitimate cross-document references while rejecting unsupported construction cycles with actionable errors.

**GitHub automation is planned:** a workflow should invoke the same validation, tests and build commands used locally, then expose downloadable HTML artifacts with a clear build result. No automatic deployment, repository writeback or commit loop is implied. Until a different policy is recorded, preserve the branch's existing requirement to commit rebuilt distributables with relevant source changes. An artifact produced by CI and a repository's checked-in dist file must have clear provenance rather than silently diverging.

**Current implementation limit:** `tools/build.js` presently flattens supported JavaScript modules into the Atrium HTML. It does not embed project JSON, validate authored schemas or provide multiple targets. There is currently no `.github/workflows/` build automation on this branch. Those are next-milestone work, not completed by this planning change.

## 5. Shared property, command and play contracts

Property metadata should identify stable paths/keys, value type, units, defaults, bounds/enumerations, validation, editability and serialization policy. Inspector rendering and command validation consume this shared definition. Game-specific property types are explicitly registered by the game package; engine source must not import the game to discover them.

All document edits go through common validated transactions: create/delete, duplicate, reparent, transform, property changes and reference updates. Each transaction either completes coherently or leaves the document unchanged. Undo/redo restores authored identities and affected references; it must not regenerate every object's identity. Duplicate/paste creates new identities and remaps internal references deliberately. Pointer drags and color previews group into one user-intent command, with cancellation restoring the starting state. History has explicit storage limits.

Document mutation invalidates dependent transforms, geometry, collision, spatial membership, lights and previews through defined capability contracts. Property controls must not each invent their own rebuild path. Expensive procedural previews can use bounded/coarser updates while dragging, followed by final-quality work on commit; editing should not synchronously regenerate an entire world for each slider event.

Play creates an isolated runtime world/session from the authored document and uses the same engine capabilities as the game. Stop disposes play resources and restores the authored editing state. A future explicit Apply selected changes operation may copy chosen values back through commands; simulation mutation must not silently become authored content. Edit and play input contexts prevent a touch gesture or shortcut from affecting both. Lobby remains the sole host frame owner; panels and preview tools must not start competing loops.

## 6. Phone-first interaction and files

Use a large viewport, collapsible hierarchy/browser and a bottom property sheet. Tap selects; Move/Rotate/Scale are explicit modes with generous handles, axis/plane constraints, snapping and numeric alternatives. Top/front/side/orbit views make 3D placement usable on a touch screen. Navigation gestures, transforms, panel interaction and cancellation have explicit pointer ownership through the common engine/editor input contracts. A pointer cancel must end a transaction safely, never leave a half-drag or stuck action.

Local autosave/recovery and portable project import/export belong in the first milestone. Browser storage is best-effort and may be evicted; downloaded project backups are the durable user-controlled path. Unsupported file-system APIs must have an import/download fallback. Import validates and resolves a candidate project before replacing the open document; a broken file must not destroy unsaved work.

GitHub integration is a separate explicit file-sync/commit workflow if later implemented. A plain offline HTML editor cannot silently overwrite arbitrary phone files or repository files. Editing JSON in GitHub and obtaining a CI-built artifact is a planned complementary workflow, not a substitute for local recovery/export. No credentials belong in project JSON or distributable HTML.

Inactive panels, asset previews and unloaded documents release subscriptions and owned resources. The editor must have explicit project/document/history/preview budgets and profiling. Desktop multi-view previews must not force equivalent work onto the phone; suspended views should not keep rendering offscreen.

## 7. First milestone: edit the Atrium from the phone

Build one coherent authoring path before expanding specialist asset workspaces:

1. Define and document minimal versioned project/scene/asset schemas, stable IDs, property metadata and reference validation.
2. Move the existing Atrium's applicable authored content into those documents. Keep its gameplay behavior in JavaScript. Load through engine interfaces and embed referenced JSON in the offline build.
3. Establish the 3D camera/projection/ray/picking contracts required to select objects and navigate editor views. Record full-transform representation before depending on it. Spatial/collision queries must have one responsible home; do not duplicate ad hoc picking math in each tool.
4. Assemble the universal workspace with hierarchy, asset browser, selection and contextual property controls.
5. Move a planter and adjust a light through shared validated commands, including undo/redo, snapping, numeric editing and touch cancellation.
6. Save/import, recover an autosave and instantiate an isolated Play/Stop session. Add the GitHub validation/build artifact workflow using the same local build pipeline.

**Acceptance scenario:** on a phone-sized interface, select a planter, move it, change a light, undo both edits, redo deliberately, export the project, reload it, and walk through the result. Saved IDs/references remain stable; edited placement affects the relevant collision/spatial data. Stopping Play preserves the authored scene. Invalid imports leave the current project intact. Repeated open/close/play cycles and cancelled touches leave no stale controls, worlds, subscriptions or GPU resources. The built HTML runs offline with Canvas 2D guarded against and no external runtime requests. Verify actual-device performance separately from emulated touch/software WebGL.

This milestone establishes shared camera, document, property, input-context and resource contracts. It does not require a full physics engine, production humanoid rig or every historical editor tab before becoming useful.

## 8. Follow-on game and humanoid work

Next, recreate one representative main-branch street block through this authoring workflow. Target a recognizable building, pavement, props, player, collision, building labels, approach/interact/enter/return behavior and profiler evidence. Main's established spatial hashes/grids, caching, culling and lifecycle practices guide the new implementations. Missing general capabilities belong in the correct engine level in the same change; named building/game rules remain game content. Do not wait for a hypothetical finished engine or copy legacy rendering adapters into it.

The articulated humanoid workshop then uses the same documents, inspector, commands and preview ownership. Basement should supply full transforms, mesh/skinning, animation composition, IK/contact queries and body/load mechanisms. Penthouse supplies the reusable skeleton/body generator and presets; the game supplies character appearance, clothing, personality and behavior. Begin with one articulated humanoid walking/turning/standing on uneven ground, inspected from multiple angles, then extend to reaching/climbing and equipment/load response. This is a planned reconstruction of the original procedural intent, not a claim that the current box actor already has these capabilities. Keep the existing backpack traveler as a simple diagnostic preset.

## 9. Historical editor reference and open details

The owner supplied [DFAB Editor Suite 15](../references/DFAB-Editor-Suite-15.html). It is preserved unchanged for source/workflow reference; its source was inspected, not comprehensively playtested here. It includes level/asset/building/city/vehicle/weapon/humanoid/sprite workspaces, touch handling, JSON import/export, several separate histories and edit/play rendering paths. Carry forward useful authoring workflows while implementing the agreed shared command/input/document systems.

Its Canvas 2D rendering, global mode branches and separate loops do not establish an exception to native WebGL, house ownership or the single-scheduler requirement. Historical room, appearance and asset data may inform an explicit versioned importer. Do not promise automatic conversion of every 2D drawing or legacy file into equivalent 3D content.

Before dependent code, settle the first schema shapes/migrations, orientation/coordinate-unit conventions, picking strategy, property registration interface, command/history budgets, minimum prefab override semantics and exact edit/play session boundaries. Implement only the shared mechanisms needed by the first milestone; the specialist workspaces remain a roadmap.
