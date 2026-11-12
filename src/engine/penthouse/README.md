# LV3 Penthouse: prefab toys

The proof that the levels below work. A prefab invents no mechanism: it is built only from Basement systems and Directory data, and boots on the Directory's default libraries with no game present. Built: `humanoid/`. Planned: `foliage/`.

- **May import:** `src/engine/basement/`, `src/engine/directory/` and `src/engine/penthouse/`.
- **Must never:** import the Lobby or the game, contain game rules, or contain a mechanism the Basement lacks. A missing mechanism is added to the Basement first.
- **Banner:** every `.mjs` file starts with `// ===== LV3 PENTHOUSE =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.

## `humanoid`

A person made of engine parts: a character body from the `engine:humanoid` template, a rig built from its `skeleton` and `clip_set`, Basement IK and physical chains, and the `figure` turned into render packets. It boots with no game:

```js
import { physicsSystem } from '../basement/physics/index.mjs';
import { createEngineRegistry } from '../directory/index.mjs';
import { humanoid } from './index.mjs';
const physics = new physicsSystem({ asset_library: createEngineRegistry() });
const person = new humanoid(physics, { position: [100, 100] });
person.entity.setMovement([1, 0]);
// each step, whoever owns it: person.updateState(); physics.updateState();
```

| Member | Contract |
|---|---|
| `new humanoid(physics, {template:'engine:humanoid', height:1, entity:null, ...packet})` | Creates the body (the rest of the packet: position, rotation, name, data…) and its rig, playing the idle clip. The world's data source must hold `template` and its `skeleton`, `clips`, `locomotion` and `figure` assets. `height` scales the skeleton. Pass a restored `entity` instead to take over a humanoid loaded from a save. |
| `entity`, `rig` | The character entity and its animation controller. |
| `updateState()` | Plays the walk clip, on distance travelled, while the body moves faster than the locomotion's `moving_speed`, otherwise idle. Call it once per step before the world steps. |
| `reachFor(hand, target, {weight})` / `release(hand)` | Two-bone IK puts hand `l` or `r` on a world point, elbow outward / removes it. |
| `lookAt(target, {max_angle:1.2, weight})` / `stopLooking()` | Turns the head toward a world point. |
| `setPhysicalArm(arm, on, {follow_rate:20, follow_torque:1e5, mass:1})` / `physical_arms` | Makes an arm two hinged bodies that follow the pose, trail and take hits; `follow_torque:0` is limp. |
| `getRenderPacket({blend:1})` | `{entity_id, position, rotation, parts}` in world space, back to front: `{part, shape, center, rotation, radius \| radii}` or, for a capsule, `{part, shape, from, to, radius}`. Reading advances nothing. |
| `remove()` | Destroys the entity, its rig, goals and arms. |

Tests: `node --test src/engine/penthouse/tests/*.test.mjs`.
