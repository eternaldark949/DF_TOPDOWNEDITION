# Dependency order and verification gates

This is the migration order supported by the relationship audit, not a promise that the current hotel proof implements the game. Work internally on the existing branch; keep one offline HTML deliverable. Do not ask the owner to download every internal checkpoint.

1. Keep the pinned original and regression results available. Preserve source IDs, map aliases, save version/defaults and tuning units. Use the relationship evidence to find callers, state writes, callbacks and teardown obligations for each selected responsibility.
2. Establish scene/entity lifecycle and connected service ownership. Check create/connect/start, queued changes, removal, map replacement, stale callbacks and complete teardown. Define shared transforms/body/surface declarations before game wrappers.
3. Complete common geometry/contact/query contracts required by the original actors, vehicles, doors, props, projectiles and movement. Keep camera-independent physics. Exercise offscreen contact, swept hits, height separation, attached sources, shape changes and intentional exclusions before migrating named interactions.
4. Establish renderer/asset capabilities against representative original assets beyond the hotel: building profiles, humanoids/animation/equipment, alpha/transparency, emission, roof obstruction, shadows/reflections and weather. Preserve prepared artwork and GPU loss/restore behavior. Compare actual GPU pixels, uploads, preparation counts and representative camera views. List unsupported features instead of silently approximating them.
5. Extract reusable map activation/preparation, room/navigation/traffic/crowd services and weather/audio lifecycles. Move named placement and population recipes to Game databases. Check all static maps plus generated city attachments, transitions and scene-specific entry/exit behavior. Retain cache signatures, budgets and cancellation.
6. Move player/entity handling, inventory/equipment, combat/effects/abilities and interaction through those services. Preserve update order and fixed-step tuning. Data-driven definitions must cover current items, actors, weapons and effects; avoid named cross-pair collision repairs.
7. Connect authored missions, scenes, cast, dialogue, progression and business rules through engine operations. Port UI/phone/shops/input and audio behavior alongside their dependencies, not as decorative final screens. Verify touch/keyboard, pause scopes, fullscreen/orientation and user-gesture activation in a real browser.
8. Restore old saves through a Game compatibility adapter using engine persistence. Compare inventory IDs/equipment variants, progress, currency, map/vehicle placement, companions, settings, story and pending encounters. Check new save/reload and repeated transitions, not just schema parsing.
9. Run original scenarios against the migrated behavior where compatible; add engine checks for requested contract improvements. Perform representative seeded scenes and visual/input comparisons, then browser GPU/context-loss and offline checks on the single artifact. Report phone performance only when measured on a relevant device.

## Current foundation gaps

The v0.4 hotel demonstration is a renderer/physics foundation with prepared original artwork. It is not complete map/entity/mechanic migration. Hotel staff/crowds, all actor animation, every building profile, the original lighting/bloom/reflections, traffic/navigation, full combat, UI/story and save integration require explicit porting and parity checks. Do not infer these from a good-looking hotel screenshot.

## Per-concern migration record

For each moved concern, record: original locations; authoritative state; inputs/units; outputs/mutations; constructor/connection requirements; callers and dynamic dispatch; callbacks/timers; asset/index/cache lifetime; save fields and stable IDs; deliberate behavior changes; checks and remaining uncertainty. This record makes engine fixes propagate through all consumers instead of accumulating named game patches.

## Completion means connected behavior

A module existing, a method being renamed, or a source graph being populated is not completion. Its callers, state ownership, teardown, saved representation and behavior must be connected and checked. The original source can remain the reference without shipping a hidden second engine or a Canvas world fallback.
