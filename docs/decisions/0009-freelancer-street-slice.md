# Freelancer · Enni Cole street and doorway slice

Implemented 2026-10-16 under the owner's instruction to start the street-block stage. This follows [Studio authoring tools](0008-studio-authoring-tools.md). The next humanoid workshop remains separate and requires the agreed silhouette previews before detail.

## Delivered boundary

Freelancer now occupies `games/freelancer/` with its own authored package, validation, doorway rules, journey, simulation and browser composition. Atrium remains the independent engine diagnostic. Studio installs both through `editor/projects.js`, chooses behavior from explicit package identity and uses one shared hierarchy/library/inspector/tool/session path. Unknown application packages fail validation rather than selecting arbitrary executable code.

The new street contains a recognizable Enni Cole exterior, pavement, benches, lamps, cypress planters, native geometric signage and the existing diagnostic traveler. A separate marble vestibule provides approach → explicit interaction → enter → return. This is a first representative gameplay slice, not a port of main's campaign, store departments, NPC population or complete city.

## Reusable capabilities in their proper homes

- **Basement:** `SpatialGrid` indexes static horizontal collider boxes, with deduplicated nearby queries and overflow for large footprints; `PlanarMotor` owns independent velocity, bounded movement substeps and sliding, consuming world direction plus an injected legality query. Neither knows game actions or door names.
- **Directory:** `sceneWorldFactory` prepares ordinary authored assemblies cooperatively through Lobby, builds derived collision membership and owns the world/GPU leases until disposal. Existing residency tickets/readiness contracts and bounded two-world ownership are preserved.
- **Lobby:** existing preparation/update/render phases and `WorldTravel` remain the only scheduler/transfer mechanisms. A final-boundary query checks both current source reach and destination legality. Async readiness does not change membership. A doorway keeps the same input context: reset movement momentum and touch captures while preserving held-key/gamepad edge state, so a held A button cannot become a new press on arrival.
- **Penthouse:** pure `ArchitecturalParts` and `strokeLettering` helpers author ordinary portable assembly data. They do not allocate a renderer, rasterize fonts or encode Enni Cole's palette. Runtime art uses the existing `toy.assembly` generator and retained instance buffers.
- **Game:** geometry/palette composition, navigation bounds, reciprocal portal links, spawn/camera policy, input map, gait profile and UI belong to Freelancer.
- **Studio:** an explicit installed-project selector and validator catalog replace the old Atrium-only bootstrap. Shared session/tool classes did not acquire named game branches. Unsaved edits disable starter switching until export/undo; recovery remains the existing single best-effort slot.

## Content and delivery

JSON is authoritative for source assets, placements, light arrangements and game scene metadata. The commented authoring recipe can explicitly recreate the starting JSON, but normal packaging never overwrites edits. The build validates both projects and emits three offline files: Atrium, Studio and Freelancer. GitHub's existing wildcard artifact upload includes all three. No deployment or automatic repository writeback is added.

The street uses 19 shared source assets, 35 placements and 602 parts; the interior uses 11 placements and 198 parts. Native lettering is baked thin-box signage under the 128-part asset budget, not a general text/localization or offscreen-label allocation system. Active worlds retain their bounded source geometry and batch storage; camera culling determines submitted instances. A linked interior is prepared on interaction, without unconditional prewarming.

## Explicit limits and next step

Read [the game editing/source guide](../../games/freelancer/DOCUMENTS.md) for parameters, lifecycle, navigation and art limits. The rendering path still uses opaque/emissive box geometry, forward lighting, AO and cast shadows. It does not yet have transparent/PBR glass, bloom, volumetric atmosphere or wet-road reflections. This milestone does not claim to have surpassed the Canvas2D art or achieved the original photograph's finish.

The small cutaway vestibule is a destination exercise, not Enni Cole's full department-store layout. Movement remains planar. Spatial indexing here serves static collision queries, not a claimed shared large-world render/AI/streaming accelerator. The new articulated humanoid, parkour and backpack dynamics beyond the diagnostic actor remain future work.

[Milestone evidence](../milestones/enni-street/README.md) records actual checks and screenshots. Software Chromium/emulated touch establishes workflow and cleanup, not physical-phone speed or driver compatibility.
