# Basement physics

A standalone, dependency-free 2D engine, developed separately before DF_TOPDOWNEDITION is migrated. This folder is the shareable package: implementation, API documentation, executable examples, tests and benchmarks.

**Version 0.3.0 — native migration capabilities.** All specialized game elements inherit `gameEntity` and register by construction. Directory-owned asset libraries supply definitions. The complete native runtime is now bundled into the playable game and owns the apartment scene. Other scenes retain legacy ownership. See the apartment cutover (game checkout: `src/directory/APARTMENT-CUTOVER.md`) and [implementation status and limits](docs/status.md).

```js
import { physicsSystem } from './index.mjs';

const physics = new physicsSystem();
const character = physics.createCharacter({
    name: 'Walker',
    position: [100, 100],
    collision_shape: { shape_type: 'circle', radius: 12 },
    movement: { max_speed: 150 }
});

character.setMovement([1, 0]);
physics.updateState(); // one fixed step; normally called by the Lobby
console.log(character.physics_controller.body.getState());
```

Methods/classes use lower camel case; properties and packet keywords use snake_case. All positions are centres. Units are world units, seconds, kilograms and radians. Gameplay defines objects and sends intentions; the engine owns spatial membership and physical outcomes.

## Documentation

- [Architecture and ownership](docs/architecture.md)
- [API reference and keywords](docs/api-reference.md)
- [Official entities and Directory assets](docs/entities.md)
- [Behavior, units, events and persistence](docs/behavior.md)
- [Practical examples](docs/examples.md)
- [Game migration guide](docs/migration.md)
- [Implemented, proposed and deprecated APIs](docs/status.md)
- [Verification record](docs/verification.md)
- [Changelog](CHANGELOG.md)

## Run locally

Requires a current browser, or Node 20+ for CLI examples/tests. No install/build step or external package is required.

```sh
node --test src/basement/physics/tests/*.test.mjs
node src/basement/physics/examples/headless.mjs
node src/basement/physics/benchmarks/spatial.mjs
```

From this directory, `python3 -m http.server 8080` serves the [browser sandbox](examples/index.html) at `http://localhost:8080/examples/`. Serve modules over HTTP rather than opening the HTML through `file://`.

For another project, copy this entire directory and import `index.mjs`. The runtime uses standard ECMAScript modules and has no references to this game, its assets, DOM, audio, global configuration or rendering APIs. The examples and Node tests have their own explicit environment dependencies.

Inside a copied package directory, run `node --test tests/*.test.mjs`, `node examples/headless.mjs` and `node benchmarks/spatial.mjs`.

[Incremental spatial performance](docs/spatial-performance.md) covers pose/shape caching, entering/leaving cell updates, candidate invalidation, diagnostics and reproducible local benchmarks.
