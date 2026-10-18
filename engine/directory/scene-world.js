/** Directory / prepared static scene world. Connects authored instances, collision indexing
 * and GPU leases using existing readiness and cooperative preparation contracts.
 * Game-specific mutable snapshots use their own factories (as in the Atrium example).
 * Definitions and source data are borrowed; the returned resource owns derived storage. */
import { Lifetime } from "../basement/lifetime.js";
import { SpatialGrid } from "../basement/spatial-grid.js";
import { SceneInstance } from "./scene-instance.js";

/** Register this inert factory with residency; no world exists until a ticket requests it. */
export function sceneWorldFactory(
  { basement, directory, lobby },
  project,
  scene,
  id,
) {
  return ({ signal, state }) =>
    lobby.preparation.enqueue(
      (function* () {
        const life = new Lifetime();
        let complete = false;
        const world = directory.adopt(basement.createWorld(id));
        life.own(() => directory.releaseWorld(world.id, world));
        try {
          if (state && state.version !== 1)
            throw new Error("Unsupported static scene snapshot");
          const instance = yield* SceneInstance.prepare(
              directory,
              world,
              project,
              scene,
              { renderer: basement.renderer },
            ),
            grid = new SpatialGrid(4);
          life.own(()=>instance.dispose());
          grid.rebuild(instance.colliders);
          life.own(() => grid.clear());
          world.snapshot();
          world.resolve();
          const lease = directory.acquire(
            "scene:" + world.id,
            () => basement.renderer.createBatch(world),
            { owner: "scene:" + scene.id },
          );
          life.own(lease.release);
          basement.renderer.prepare(lease.value);
          yield;
          const positions = new Float32Array(32),
            colors = new Float32Array(24);
          scene.lights.forEach((light, i) => {
            positions.set([...light.position, light.radius], i * 4);
            colors.set(light.color, i * 3);
          });
          const resource = {
            world,
            scene,
            instance,
            grid,
            batch: lease.value,
            positions,
            colors,
            ready: Object.freeze({
              geometry: true,
              collision: true,
              landing: true,
            }),
            capture: () => ({ version: 1 }),
            dispose: () => life.dispose(),
          };
          complete = true;
          return resource;
        } finally {
          if (!complete) life.dispose();
        }
      })(),
      // Static profiler identity survives scene renames/imports without filling the registry.
      { signal, label: "scene.prepare" },
    );
}
