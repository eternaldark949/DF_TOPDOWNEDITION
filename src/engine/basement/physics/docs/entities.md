# Official game entities and Directory assets

`gameEntity` is the one class for world entities. There are no subclasses: what an object is, what parts it has and what it holds are data. Its constructor creates the engine components and registers the instance. It cannot accept an existing legacy object/body to wrap.

A **kind** is a preset: body defaults plus the parts it switches on. The built-in kinds are in `KINDS`:

| Kind | Body defaults | Motor | Awareness |
|---|---|---|---|
| `entity`, `decoration` | static, collides with nothing | none | no |
| `character` | character body, character group | `character` | yes |
| `vehicle` | rigid, vehicle group | `vehicle` | no |
| `projectile` | rigid, projectile group, no friction or damping | `projectile` | no |
| `prop` | rigid, prop group | none | no |
| `static` | static, static group | none | no |
| `trigger` | static ghost sensor | none | no |

A record names its `kind` (default `entity`) and may override any body default, and `motor` (`character`, `vehicle`, `projectile` or `null`) and `awareness` (true or false). `elements.defineKind(name, {body, motor, awareness})` adds a kind. Motor calls go through the part: `entity.motor.setMovement(...)`, `entity.motor.steerVehicle(...)`, `entity.motor.launchProjectile(...)`.

`physics.elements` is the world's `gameElements` owner. Every entity is made through `elements.createEntity(packet)` (or `physics.createEntity`), including the engine's own projectiles and `createHitVolume`. Anonymous `createBody` remains a mechanical primitive for engine internals, particles, joints and solver tests; it is not the game-world entity creation route.

## Registration by construction

```js
const physics = new physicsSystem({ asset_library });
const guard = physics.elements.createEntity({ template: 'mygame:guard', position: [100, 200] });   // the template says kind: 'character'
guard.motor.followTarget(player);
```

Construction resolves a data template, applies its kind's preset, validates resources, creates the body and parts, registers identity and spatial membership, and returns the entity. There is no manual body adoption, `grid.add`, surrogate owner or physical-state copy. Failed construction destroys the body it made.

For ordinary root entities, `entity_id === body_id`: one root identity maps to one authoritative body. The entity registry maps IDs to instances and files each under its kind and its tags; it does not index geometry or cache positions. The single `spatialGrid` contains the body's bounds. Attached mechanical bodies may have separate body IDs without being game entities themselves.

## Lifecycle and ownership

`activate`, `deactivate` and `destroy` delegate to the engine. Deactivation retains identity and components but removes spatial membership and stops stepping the body. Reactivation restores the same body/controller. Destroying removes the body, constraints, scoped subscriptions and entity registry entry. It is idempotent. Direct body removal, projectile expiry and world clearing also retire the official entity; neither side can leave an orphan owner behind.

Event-created entities have reserved identity and components but remain `pending` until next-step commit; they are absent from lookups and spatial queries meanwhile. Lifecycle operations issued during event delivery obey the same command boundary. Saving rejects pending commands.

Identity, assets, parts and transform accessors are reserved on each instance and cannot be shadowed. Legacy `x`, `y`, `vx`, `vy`, `velX`, `velY`, `angularVel` and `collisionMask` fields throw on access/write, so unconverted game code fails explicitly rather than creating inert shadow physics. Read `body.getState` / `getRenderState` and issue engine requests.

Persisted gameplay state belongs in `entity.data` (read and written with `get` and `set`); physical state belongs only in `entity.body`. The entity owns immutable resource-ID bindings, and `getAsset(slot)` resolves the corresponding resource from the library.

## Behaviour is data, not subclasses

Gameplay never extends `gameEntity`; constructing a subclass throws. An object's state is its properties (`get`, `set`, saved in `data`), its parts come from its kind and record, and behaviour belongs to systems that read those properties. Sort and find objects by `kind` and by `tags`: `getEntities({kind, tag})`.

Scoped `entity.on(name, handler)` filters world events to that entity, binds `this`, returns an unsubscribe function and is cleaned on destruction. Event packets include `entity`, `entity_a`, `entity_b` and `target_entity` alongside body handles where available. Contact end events can retain destroyed identities; do not read removed body state. Query hits expose `entity` for registered roots and `null` for anonymous mechanical bodies.

## Decorations and nonphysical entities

The `entity` and `decoration` kinds are static with zero collision/query groups. They have a transform and spatial bounds but no physical contacts. This avoids both gravity-driven decorations and a second render proxy/index. Use `elements.peruseNearbyEntities` to include registered nonphysical entities, or shared grid bounds queries for visibility. Exact physics queries continue to exclude them. A trigger is a ghost body; a wall is static; a prop is rigid. Registration and physical participation are independent concerns.

## Data lives in the Directory

The Basement owns no data definitions. A world receives a data source (`asset_library`) and uses only `resolveTemplate()` and `getResource()` on it; see [the data source contract](api-reference.md#data-source). The engine's data source is the Directory's registry (`engine/directory/registry.mjs`): immutable definitions, namespaced IDs, `extends` inheritance and resource resolution. A game registers its own libraries into it at boot; this game's live in `src/game/data/game-assets/`, assembled by `src/game/data/game-assets.mjs`.

## Save/load

Snapshot format **2** includes entity IDs, kinds, motors, awareness, template IDs, resource bindings and gameplay data in addition to physical state. Restoring binds each entity to its restored authoritative body through the same base initializer. It replays no construction side effects; listeners are not serialized. Use `data` for saved gameplay state and reconnect gameplay subscriptions after a successful load.

Register Directory libraries and define custom kinds before loading. Missing templates or kinds, or a motor that does not match its body, fail validation before replacing the destination world. Old entity instances become destroyed; fetch restored instances with `elements.fetchEntity`. The reusable library itself is application configuration, not copied into every save.

## Migration boundary

The old game's entity classes are not carried over. Each becomes a record (kind, parts, properties) plus systems that read it.
