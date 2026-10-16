/** Freelancer / street-to-store journey. Directory owns preparation, Lobby owns commit timing;
 * this game owns doorway proximity, destinations and refusal messages. No engine patches. */
import { Lifetime } from "../../engine/basement/lifetime.js";
import { WorldTravel } from "../../engine/lobby/travel.js";
import { sceneWorldFactory } from "../../engine/directory/scene-world.js";
import { nearbyPortal, legalPosition, portalLanding } from "./portals.js";

/** One session owns definitions/tickets; every async completion checks lifetime before adoption. */
export function createJourney(engine, project) {
  const life = new Lifetime(),
    { basement, directory, lobby } = engine,
    residency = directory.residency,
    session = basement.identities.create("freelancer"),
    keys = project.scenes.map((s) => session + ":" + s.key);
  let travel = null,
    actor = null,
    disposed = false,
    message = "Opening Clinic Way";
  project.scenes.forEach((scene, i) => {
    residency.register(
      keys[i],
      sceneWorldFactory(
        engine,
        project,
        scene,
        basement.identities.create("world"),
      ),
    );
    life.own(() => residency.unregister(keys[i]));
  });
  const initial = residency.prepare(keys[0]);
  life.own(() => initial.release());
  const ready = initial.ready.then(() => {
    if (disposed) return;
    const value = initial.value;
    actor = directory.create("toy.actor", {
      world: value.world,
      color: [0.22, 0.12, 0.29],
      bagColor: [0.28, 0.16, 0.08],
    });
    [actor.root.x, actor.root.y, actor.root.z] = value.scene.spawn;
    if (!legalPosition(value, actor.root))
      throw new Error("The authored player spawn is blocked");
    value.world.snapshot();
    value.world.resolve();
    travel = new WorldTravel({ residency, initial, root: actor.root });
    life.own(() => travel.dispose());
    life.own(
      lobby.on(
        "boundary",
        (time) => travel.advance(time),
        "freelancer.doorway",
      ),
    );
    life.own(
      travel.onCommit(() => {
        message = travel.current.value.scene.name;
      }),
    );
    message = "Walk to the brass entrance";
  });
  return {
    ready,
    get actor() {
      return actor;
    },
    get travel() {
      return travel;
    },
    get current() {
      return travel?.current.value ?? null;
    },
    /** Context action is edge-triggered and ignored outside the authored radius or while loading. */
    interact() {
      if (!travel || travel.pending) return;
      const portal = nearbyPortal(travel.current.value.scene, actor.root);
      if (!portal) {
        message = "Approach the entrance to enter";
        return;
      }
      const index = project.scenes.findIndex(
        (s) => s.id === portal.targetScene,
      );
      travel.request(
        keys[index],
        (_root, destination) =>
          portalLanding(destination.scene, portal.targetPortal),
        (world, pose, _root, value) =>
          world === value.world &&
          nearbyPortal(travel.current.value.scene, actor.root)?.id ===
            portal.id &&
          legalPosition(value, pose)
            ? true
            : "The doorway source or destination is blocked",
      );
      message = "Opening the doorway";
    },
    inspect() {
      return {
        message,
        travel: travel
          ? {
              ...travel.stats,
              status: travel.last.status,
              message: travel.last.message,
            }
          : null,
        residency: residency.inspect(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      life.dispose();
    },
  };
}
