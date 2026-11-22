# LV3 Penthouse: prefab toys

The proof that the levels below work. A prefab invents no mechanism: it is built only from Basement systems and Directory data, and boots on the Directory's default libraries with no game present. Built: `objects/`, `humanoid/`. Planned: `foliage/`.

- **May import:** `src/engine/basement/`, `src/engine/directory/` and `src/engine/penthouse/`.
- **Must never:** import the Lobby or the game, contain game rules, or contain a mechanism the Basement lacks. A missing mechanism is added to the Basement first.
- **Banner:** every `.mjs` file starts with `// ===== LV3 PENTHOUSE =====`.

Section 2 of [READ-FIRST/ENGINE-ARCHITECTURE.md](../../../READ-FIRST/ENGINE-ARCHITECTURE.md) has the full rules.

## `objects`

`createObject(elements, record, at, overrides)` makes any object from a catalog record; `objectPacket(assets, record, at, overrides)` is the packet it would make. The record's fields switch its parts on: `entity_type`, `assets.drawing` (its look), `look` (kept as the `look` property), `bounds` (collision bounds fitted from the drawing's solid steps with the Basement's `fitBounds`: `circle`, `box`, `capsule`, `hull` or `parts`), `collision_shape` (always wins), `assets.material` (its `surface` sets friction and restitution) and `data`. The drawing and material are checked with the Directory's `validateDrawing` and `validateMaterial`. The engine file exposes it as `engine.createObject(record, at, overrides, {lifetime})`, which goes through the Lobby so level objects leave with their level. The user guide is [Objects in src/engine/API.md](../API.md#objects).

## Example: a bar cart from one data file

`examples/bar-cart.json` is a whole object as data, the classic apartment bar cart rebuilt with no drawing code: a `frame` component (wheels on the floor, a lower shelf at 25 cm, brass posts, the tray at 80 cm, the handle) and a component per thing on the tray (three bottles with a body and a neck, a decanter and its stopper, an ice bucket, two coupes on stems), each at its own height so the height view leans them. Leaning, each thing on the tray draws whole, farthest from the camera first, so a near bottle covers the foot of a far glass. It is painted in material records (brass, smoked glass, bottle glass, cork, crystal, steel, ice…) in the same library; its `look.values` pick which material each part takes (`frame: 'brass'`), and a layer's `sides` name a material too, so no colour is written in the record. `bar_cart_chrome` extends it and picks chrome, tinted glass and port, and what it does is a name in its data (`behaviour: 'refill_drink'`) for the game to register. `createObject(elements, 'examples:bar_cart', at)` makes it; Canvas and WebGL draw it alike. A game's catalog holds records like it in `game/data`. Tests: `tests/example-objects.test.mjs`.

## `humanoid`

A person made of engine parts: a character body from the `engine:humanoid` template, a rig built from its `skeleton` and `clip_set`, Basement IK and physical chains. Its body is made of components on the rig's joints (feet, upper arms, forearms, hands, torso, a head with hair as a second layer), each layer at its own height in the template's data, so the render system draws it like any entity, its look values (`skin`, `shirt`, `shoes`, `hair`) colour it, and its collision reaches 1.75 m tall. It boots with no game:

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
| `new humanoid(physics, {template:'engine:humanoid', height:1, entity:null, ...packet})` | Creates the body (the rest of the packet: position, rotation, name, data…) and its rig, playing the idle clip. The world's data source must hold `template` and its `skeleton`, `clips` and `locomotion` assets; every component's joint must be in the skeleton. `height` scales the skeleton. Pass a restored `entity` instead to take over a humanoid loaded from a save. |
| `entity`, `rig` | The character entity and its animation controller. |
| `updateState()` | Plays the walk clip, on distance travelled, while the body moves faster than the locomotion's `moving_speed`, otherwise idle. Call it once per step before the world steps. |
| `reachFor(hand, target, {weight})` / `release(hand)` | Two-bone IK puts hand `l` or `r` on a world point, elbow outward / removes it. |
| `lookAt(target, {max_angle:1.2, weight})` / `stopLooking()` | Turns the head toward a world point. |
| `setPhysicalArm(arm, on, {follow_rate:20, follow_torque:1e5, mass:1})` / `physical_arms` | Makes an arm two hinged bodies that follow the pose, trail and take hits; `follow_torque:0` is limp. |
| `remove()` | Destroys the entity, its rig, goals and arms. |

Tests: `node --test src/engine/penthouse/tests/*.test.mjs`.
