# Official game entities and Directory assets

`gameEntity` is the base class for world entities. Its constructor creates the engine components and registers the instance. It cannot accept an existing legacy object/body to wrap. Specialized elements inherit it directly:

```text
gameEntity
  gameCharacter
  gameVehicle
  gameProjectile
  gameProp
  gameStatic
  gameTrigger
  gameDecoration
```

`physics.elements` is the world's `gameElements` owner. All element factories use this construction path, including `physics.createCharacter`, `createVehicle`, `createProjectile` and `createHitVolume`. The sandbox's scenery/props also use the official element factories. Anonymous `createBody` remains a mechanical primitive for engine internals, particles, joints and solver tests; it is not the game-world entity creation route.

## Registration by construction

```js
const physics = new physicsSystem({ asset_library });
const guard = physics.elements.createCharacter({
    template: 'mygame:guard', position: [100, 200]
});
guard.followTarget(player);
```

Construction resolves a data template, validates the declared element type and resources, creates the body/controller, registers identity and spatial membership, and returns the official entity. There is no manual body adoption, `grid.add`, surrogate owner or physical-state copy. Failed factory construction destroys both the base entity and nested entities created by its constructor.

For ordinary factory-created root entities, `entity_id === body_id`: one root identity maps to one authoritative body. The entity registry maps IDs to instances; it does not index geometry or cache positions. The single `spatialGrid` contains the body's bounds. Attached mechanical bodies may have separate body IDs without being game entities themselves.

## Lifecycle and ownership

`activate`, `deactivate` and `destroy` delegate to the engine. Deactivation retains identity and components but removes spatial membership and stops stepping the body. Reactivation restores the same body/controller. Destroying removes the body, constraints, scoped subscriptions and entity registry entry. It is idempotent. Direct body removal, projectile expiry and world clearing also retire the official entity; neither side can leave an orphan owner behind.

Event-created entities have reserved identity and components but remain `pending` until next-step commit; they are absent from lookups and spatial queries meanwhile. Lifecycle operations issued during event delivery obey the same command boundary. Saving rejects pending commands.

Identity, assets, components and transform accessors are reserved on each instance. Subclass field initializers cannot shadow them. Legacy `x`, `y`, `vx`, `vy`, `velX`, `velY`, `angularVel` and `collisionMask` fields throw on access/write, so unconverted game code fails explicitly rather than creating inert shadow physics. Read `body.getState` / `getRenderState` and issue engine requests.

Gameplay can add methods and nonphysical state. Persisted gameplay state belongs in `entity.data`; physical state belongs only in `entity.body`. The entity owns immutable resource-ID bindings, and `getAsset(slot)` resolves the corresponding resource from the library.

## Extending the official base

```js
class Guard extends gameCharacter {
    constructor(elements, definition) {
        super(elements, definition); // registration and components are owned by the base
        this.data.health ??= 100;
    }
    takeHit() { this.data.health--; }
}
physics.elements.registerEntityType('guard', Guard);
const guard = physics.createEntity({ entity_type: 'guard', template: 'mygame:guard' });
```

Use the matching specialized base for its controller vocabulary. `entity_type` selects a registered constructor; static `physics_role` selects a reusable mechanical role inherited from that base. Asset templates never contain constructors/functions. Gameplay subclasses must be registered before creating or restoring their types.

Scoped `entity.on(name, handler)` filters world events to that entity, binds `this`, returns an unsubscribe function and is cleaned on destruction. Event packets include `entity`, `entity_a`, `entity_b` and `target_entity` alongside body handles where available. Contact end events can retain destroyed identities; do not read removed body state. Query hits expose `entity` for registered roots and `null` for anonymous mechanical bodies.

## Decorations and nonphysical entities

Default `gameEntity` and `gameDecoration` bodies are static with zero collision/query groups. They have a transform and spatial bounds but no physical contacts. This avoids both gravity-driven decorations and a second render proxy/index. Use `elements.peruseNearbyEntities` to include registered nonphysical entities, or shared grid bounds queries for visibility. Exact physics queries continue to exclude them. A trigger is a ghost body; a wall is static; a prop is rigid. Registration and physical participation are independent concerns.

## Assets live in the Directory

The reusable engine exports `assetLibrary`. It provides immutable data definitions, namespaced IDs, inheritance and resource resolution. It contains no game-specific template or resource names and imports nothing from the Directory.

Game definitions belong in `src/directory/game-assets/`. The initial `entities.json` defines DF base templates and resource bindings. `src/directory/game-assets.mjs` resolves named resources from the existing `game-db` JSON chapters, preserving those catalogs as source content. New game-specific image, audio, animation and model libraries should be defined in this Directory concern as well.

`extends` resolves parent templates, plain objects merge recursively, arrays replace and instance overrides never mutate shared templates. Resource bindings are qualified `library_id:resource_id` strings. Libraries reject duplicate IDs, missing parents/resources and inheritance cycles atomically. They store data, not physics algorithms or browser loaders.

## Save/load

Snapshot format **2** includes entity IDs, types, template IDs, resource bindings and gameplay data in addition to physical state. Restoring binds each entity to its restored authoritative body through the same base initializer. It does not replay gameplay subclass constructors or spawn side effects. Methods/prototype identity are preserved; arbitrary instance fields and listeners are not serialized. Use `data` for saved gameplay state and reconnect gameplay subscriptions after a successful load.

Register Directory libraries and custom entity types before loading. Missing templates/types or mismatched controller roles fail validation before replacing the destination world. Old entity instances become destroyed; fetch restored instances with `elements.fetchEntity`. The reusable library itself is application configuration, not copied into every save.

## Migration boundary

This is the official design for the future game conversion. The old game's capitalized entity hierarchy has not been wrapped or modified in this step. Each existing class will be rewritten to inherit this base/specialized hierarchy and obtain definitions from the Directory. Its manual spatial registration, physical copies and local collision response must be removed during that conversion.
