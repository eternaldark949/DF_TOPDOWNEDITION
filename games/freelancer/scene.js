/** Freelancer / playable slice. Composes controls, game rules and existing engine capabilities.
 * The diagnostic backpack actor stays until the separately reviewed humanoid workshop.
 * All phase callbacks belong to Lobby and are removed with this session's Lifetime. */
import { Lifetime } from "../../engine/basement/lifetime.js";
import { PlanarMotor } from "../../engine/basement/planar-motor.js";
import { FREELANCER_PROJECT } from "./project.js";
import { createJourney } from "./journey.js";
import { nearbyPortal, legalPosition } from "./portals.js";

/** Start preparation immediately; both standalone game and Studio Play call this factory. */
export function createFreelancerScene(
  engine,
  {
    project = FREELANCER_PROJECT,
    controlsHost,
    onStatus = () => {},
    onError = () => {},
  },
) {
  const life = new Lifetime(),
    { basement, lobby, directory } = engine,
    { renderer, input } = basement;
  const journey = createJourney(engine, project);
  life.own(() => journey.dispose());
  input.bind({
    move: {
      kind: "vector",
      negativeX: ["KeyA", "ArrowLeft"],
      positiveX: ["KeyD", "ArrowRight"],
      negativeY: ["KeyW", "ArrowUp"],
      positiveY: ["KeyS", "ArrowDown"],
      axes: [0, 1],
      deadZone: 0.18,
    },
    interact: { kind: "button", keys: ["KeyE"], buttons: [0] },
  });
  life.own(() => input.bind({}));
  const prefix = basement.identities.create("freelancer-controls"),
    stick = directory.create("control.joystick", {
      input,
      host: controlsHost,
      sourceId: prefix + ":stick",
      action: "move",
      radius: 48,
    }),
    button = directory.create("control.button", {
      input,
      host: controlsHost,
      sourceId: prefix + ":enter",
      action: "interact",
      label: "Enter",
      diameter: 72,
    });
  life.own(() => stick.dispose());
  life.own(() => button.dispose());
  life.own(
    lobby.on("pause", () => {
      stick.cancel();
      button.cancel();
    }),
  );
  let motor = null,
    litWorld = null,
    statusAt = -Infinity;
  journey.ready
    .then(() => {
      if (life.disposed) return;
      motor = new PlanarMotor(journey.actor.root);
      life.own(
        journey.travel.onCommit(() => {
          motor.reset();
          // A doorway keeps the same input context. Preserve held-key/gamepad edge state:
          // clearing it would turn a still-held A button into a second press after arrival.
          stick.cancel();
          button.cancel();
        }),
      );
    })
    .catch((error) => {
      if (!life.disposed && error.name !== "AbortError") {
        life.dispose();
        onError(error);
      }
    });
  const movementScope = basement.profiler.scope("freelancer.locomotion");
  life.own(
    lobby.on(
      "update",
      (dt, time) => {
        const resource = journey.current;
        if (!resource || !motor) return;
        resource.world.snapshot();
        const actor = journey.actor,
          root = actor.root;
        if (input.consume("interact")) journey.interact();
        const token = basement.profiler.begin(movementScope);
        try {
          const move = input.read("move"),
            camera = resource.scene.camera,
            c = Math.cos(camera.azimuth),
            s = Math.sin(camera.azimuth);
          // Use the active scene orientation immediately, including the boundary before its first render.
          const distance = motor.update(
              dt,
              move.x * c + move.y * s,
              move.x * s - move.y * c,
              (pose) => legalPosition(resource, pose),
            ),
            gait =
              Math.sin(motor.distance * 5.5) *
              Math.min(1, distance / Math.max(dt, 0.00001));
          actor.body.z = 1 + Math.abs(gait) * 0.028;
          actor.legs[0].y = gait * 0.17;
          actor.legs[1].y = -gait * 0.17;
          actor.arms[0].y = -gait * 0.11;
          actor.arms[1].y = gait * 0.11;
        } finally {
          basement.profiler.end(token);
        }
        if (time - statusAt > 0.12) {
          statusAt = time;
          const portal = nearbyPortal(resource.scene, root);
          button.element.textContent =
            portal?.targetScene === "clinic-way" ? "Return" : "Enter";
          button.element.setAttribute(
            "aria-label",
            portal?.label ?? "Approach a doorway",
          );
          button.element.style.opacity = portal ? "1" : ".5";
          onStatus({
            name: resource.scene.name,
            sceneId: resource.scene.id,
            actorId: root.id,
            x: root.x,
            y: root.y,
            z: root.z,
            time,
            nearby: portal?.id ?? "",
            prompt: journey.travel.pending
              ? "Opening doorway…"
              : portal
                ? portal.label + " · E / A"
                : "Explore Clinic Way · WASD / stick",
            ...journey.inspect(),
          });
        }
      },
      "freelancer.simulation",
    ),
  );
  life.own(
    lobby.on(
      "render",
      (alpha) => {
        const resource = journey.current;
        if (!resource) {
          renderer.render();
          return;
        }
        if (litWorld !== resource.world) {
          const scene = resource.scene;
          renderer.lighting.configureDirectional(scene.sun);
          renderer.lighting.ambient.set(scene.ambient);
          renderer.lighting.positions.set(resource.positions);
          renderer.lighting.colors.set(resource.colors);
          // Authored settings contain data only; never replace camera methods or matrices.
          for (const key of [
            "x",
            "y",
            "z",
            "azimuth",
            "elevation",
            "halfHeight",
          ])
            renderer.camera[key] = scene.camera[key];
          litWorld = resource.world;
        }
        // Fit the authored facade on narrow phones without changing the authored camera settings.
        const aspect =
          renderer.canvas.clientWidth /
          Math.max(1, renderer.canvas.clientHeight);
        renderer.camera.halfHeight = Math.max(
          resource.scene.camera.halfHeight,
          (resource.scene.id === "clinic-way" ? 21 : 13) / aspect,
        );
        resource.world.resolve(alpha);
        renderer.render(resource.batch);
      },
      "freelancer.presentation",
    ),
  );
  return { journey, dispose: () => life.dispose() };
}
