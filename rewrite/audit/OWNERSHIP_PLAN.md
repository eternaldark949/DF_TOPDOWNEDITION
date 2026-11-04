# Four levels and the game boundary

The levels are namespaces and ownership boundaries. They do not require flattening the owner's hierarchy. `engine.directory.elements` and explicit parent references are reasonable when their ownership is clear. The top engine object assembles and runs selected services; it does not implement all of them.

| Home | Owns | Does not absorb |
|---|---|---|
| Basement | Reusable math, geometry, random sources, collections, spatial algorithms and value/unit tools | Map IDs, DOM, characters, quests, global game access |
| Lobby | Fixed-step/frame scheduling, clock domains, pause scopes, start/stop, task cancellation and preparation budgets | Combat implementations, named game transitions, procedural painters |
| Directory | Scene/entity/body lifecycle; collision; rendering/camera; assets; input; navigation; audio/weather/rooms; reusable combat/inventory/effects; persistence; UI services and diagnostics | Authored plot, named cast, city placement recipes, business identities |
| Penthouse | Optional humanoid/building/vehicle/scenery builders and other advanced reusable facilities, using Directory contracts | Its own compositor, collision authority, scheduling loop or geometry visibility exceptions |
| Game | Content databases, placements, story/dialogue, named actors, tuning, starting state, rules/policies, branded presentation and composition | Independent physics/projection math, duplicate scene registration or feature-specific repairs to engine visibility |

## Declare facts once

A placed body/surface has one transform and a meaningful shape/height. Physics, rendering, attachment placement and visibility read that description. Different systems may maintain purpose-specific indexes derived from it. Moving, resizing, rotating, replacing and removing an instance updates those indexes through the scene lifecycle.

Game declares that a cat has a small solid body, a car has a larger body, and an intentional exception is a trigger or non-solid object. The contact engine decides geometric overlap. Game damage/faction/mission policy decides consequences. Adding a new ordinary body must not require editing all older body categories.

A builder declares surfaces, materials and light attachments. The renderer decides depth and obstruction. Named buildings do not acquire special priority to repair glow. Game provides asset definitions and placed instances separately, and the asset system owns shared preparation/upload/disposal.

## Dependencies should be narrow and connected deliberately

Systems receive the service they require: navigation gets geometry/query access; inventory gets definitions and effect/resource commands; a scene runner gets actor/action services. They should not receive unrestricted `game` as their only interface. Avoid copying changing state into each component. Document whether a reference is live, a snapshot, an immutable definition or a replaceable handle.

Read views and commands must name units and lifecycle. A scene load result is not ready until required assets, instances and indexes are connected. Async callbacks carry scene ownership and cancellation. Events may notify changes, but an event bus must not conceal the authoritative owner or introduce another undiscoverable global relationship network.

## Preserve versus improve

Preserve content, controls, combat tuning, clock meanings, saves and visual intent. The user explicitly requests improvements to common body collision, offscreen physics, automatic spatial maintenance and common surface/emission depth. Those are behavior changes to establish at the engine contract level, rather than pretending a structural refactor alone preserves every legacy collision omission.

MODULE_CATALOG proposes destinations for every source file. Many source files have multiple destinations: splitting definitions from mechanisms is required. These are planning assignments, not claims that a whole source file can be moved unchanged.
