/** Freelancer / humanoid silhouette review. Composes the generic Penthouse humanoid with
 * 949's preset, review cameras and solid-silhouette presentation, as agreed in decision
 * 0007: front, side, three-quarter and gameplay-camera views before surface detail.
 *
 * Ownership: one adopted world, one renderer batch lease, one guide line layer and the
 * Lobby callbacks below all belong to this session's Lifetime. Rebuilding proportions
 * replaces only the figures; the world, lease and guides persist until dispose().
 * Units are metres/radians; the figure faces -Y like the planar motor's actor. */
import { Lifetime } from "../../../engine/basement/lifetime.js";
import { createMaterial, updateMaterial } from "../../../engine/basement/material.js";
import { poseHumanoid, validateHumanoid } from "../../../engine/penthouse/humanoid.js";
import { box } from "../../../engine/penthouse/toys.js";
import { FREELANCER_PROJECT } from "../project.js";

/** Turnaround order and facing. Yaw turns the figure's -Y front toward +X (screen right). */
export const REVIEW_VIEWS = Object.freeze([
  Object.freeze({ id: "front", label: "Front", yaw: 0 }),
  Object.freeze({ id: "three-quarter", label: "Three-quarter", yaw: Math.PI / 4 }),
  Object.freeze({ id: "side", label: "Side", yaw: Math.PI / 2 }),
  Object.freeze({ id: "back", label: "Back", yaw: Math.PI }),
]);
const SPACING = 1.15,
  // A walking loop in the gameplay view: a figure-eight exercises both turn directions.
  LOOP_RADIUS = 2.6,
  WALK_SPEED = 1.35,
  // Display values for review surfaces (linear RGB). Silhouette uses an exactly black
  // figure on an emissive card, so lighting, AO and shadows cannot alter the outline.
  CARD = [0.86, 0.84, 0.8],
  BACKDROP = [0.07, 0.06, 0.09],
  FLOOR = [0.16, 0.14, 0.19];

/** Does `entity` descend from (or equal) `root`? Used once, at construction. */
function isWithin(entity, root) {
  for (let e = entity; e; e = e.parent) if (e === root) return true;
  return false;
}

/**
 * Create the review. `document` is a validated humanoid document; options.onStatus
 * receives copied scalars for UI/tests. Returns a controller for mode/pose/document edits.
 */
export function createHumanoidReview(engine, { document, onStatus = () => {} }) {
  const life = new Lifetime(),
    { basement, lobby, directory } = engine,
    renderer = basement.renderer,
    world = directory.adopt(basement.createWorld());
  life.own(() => directory.releaseWorld(world.id, world));
  const lease = directory.acquire(
    "humanoid-review:" + world.id,
    () => renderer.createBatch(world, 1024),
    { owner: "freelancer.humanoid-review" },
  );
  life.own(lease.release);

  // Review surfaces own their materials; silhouette mode rewrites values in place so
  // every shape keeps its live material reference (see Basement material contract).
  const backdropMaterial = createMaterial({ baseColor: BACKDROP }),
    floorMaterial = createMaterial({ baseColor: FLOOR }),
    silhouette = createMaterial({ baseColor: [0, 0, 0] });
  const backdrop = box(world, { y: 1.7, z: 2, size: [14, 0.1, 7], material: backdropMaterial, ambientBlocker: false }),
    floor = box(world, { z: -0.02, size: [240, 240, 0.04], material: floorMaterial, ambientBlocker: false });
  // A second floor strip carries the upper row when a narrow screen stacks the turnaround.
  const upperFloor = box(world, { z: 0, size: [3.2, 1.4, 0.04], material: floorMaterial, ambientBlocker: false });
  // The existing diagnostic traveler stands in the gameplay view for a scale comparison.
  const traveler = directory.create("toy.actor", { world }),
    // Captured once: the traveler's own palette, restored when silhouette mode ends.
    travelerParts = [...world.entities.values()]
      .filter((e) => e.shape && isWithin(e, traveler.root))
      .map((entity) => ({ entity, material: entity.shape.material }));

  const guides = renderer.lines.create(512);
  life.own(() => guides.dispose());

  const state = {
    document: validateHumanoid(document),
    mode: "turnaround", // or "gameplay"
    look: "shaded", // or "silhouette"
    pose: "stand", // or "walk"
    zoom: 1, // gameplay only: 1 = true game scale
    rows: 1,
    phase: 0,
    amount: 0,
    pathTime: 0,
    rigs: [],
    walker: null,
    walkerMotion: { x: 0, y: 0, yaw: 0, speed: 0, lastYaw: null },
    statusAt: -Infinity,
  };

  /** Replace every figure from the current document. Old figures leave the world first. */
  function rebuild() {
    for (const rig of state.rigs) rig.dispose();
    state.walker?.dispose();
    state.rigs = REVIEW_VIEWS.map((view) =>
      directory.create("toy.humanoid", { world, document: state.document, yaw: view.yaw }),
    );
    state.walker = directory.create("toy.humanoid", { world, document: state.document });
    applyLook();
    layout();
  }

  /** Place figures, surfaces and guides for the current mode and screen shape. */
  function layout() {
    const turnaround = state.mode === "turnaround",
      aspect = renderer.canvas.clientWidth / Math.max(1, renderer.canvas.clientHeight),
      rows = turnaround && aspect < 0.95 ? 2 : 1,
      H = state.document.parameters.height,
      rowLift = H * 1.3;
    state.rows = rows;
    state.rigs.forEach((rig, i) => {
      const column = rows === 2 ? i % 2 : i,
        row = rows === 2 ? Math.floor(i / 2) : 0,
        count = rows === 2 ? 2 : REVIEW_VIEWS.length;
      rig.root.visible = turnaround;
      rig.root.x = (column - (count - 1) / 2) * SPACING;
      rig.root.y = 0;
      // Stacked rows sit on their own strip, above the first row's head height.
      rig.root.z = row === 0 && rows === 2 ? rowLift : 0;
    });
    upperFloor.visible = rows === 2;
    upperFloor.z = rowLift - 0.02;
    backdrop.visible = turnaround;
    state.walker.root.visible = !turnaround;
    traveler.root.visible = !turnaround;
    traveler.root.x = LOOP_RADIUS + 1.6;
    traveler.root.y = 0.4;
    // Teleport-safe: a mode switch must not interpolate figures across the scene.
    world.snapshot();
    drawGuides(rows, H, rowLift);
  }

  /** Head-unit rules behind the turnaround: the classic proportion grid. Lines are
   * editor guides; they cast no shadow and never become figure geometry. */
  function drawGuides(rows, H, rowLift) {
    guides.begin();
    if (state.mode === "turnaround") {
      const unit = state.document.parameters.headHeight * H,
        count = Math.ceil(H / unit),
        half = (rows === 2 ? SPACING : SPACING * 2) + 0.55,
        colour = state.look === "silhouette" ? [0.1, 0.08, 0.12, 0.35] : [0.8, 0.66, 0.42, 0.28];
      for (let row = 0; row < rows; row++) {
        const base = rows === 2 && row === 0 ? rowLift : 0;
        for (let k = 0; k <= count; k++) {
          const z = base + Math.min(k * unit, k === count ? H : Infinity);
          guides.segment([-half, 1.6, z], [half, 1.6, z], colour);
        }
      }
    }
    guides.end();
  }

  /** Shaded uses the palette with shadows/AO; silhouette uses one black material on a card. */
  function applyLook() {
    const solid = state.look === "silhouette";
    for (const rig of [...state.rigs, state.walker]) rig.override(solid ? silhouette : null);
    for (const { entity, material } of travelerParts) entity.shape.material = solid ? silhouette : material;
    const card = { baseColor: [0, 0, 0], emissionColor: CARD, emissionStrength: 2.2 };
    updateMaterial(backdropMaterial, solid ? card : { baseColor: BACKDROP, emissionColor: [1, 1, 1], emissionStrength: 0 });
    updateMaterial(floorMaterial, solid ? card : { baseColor: FLOOR, emissionColor: [1, 1, 1], emissionStrength: 0 });
    renderer.lighting.configureShadows({ mode: solid ? "off" : "low" });
    renderer.occlusion.configure({ mode: solid ? "off" : "geometry" });
    if (state.rigs.length) drawGuides(state.rows, state.document.parameters.height, state.document.parameters.height * 1.3);
  }

  /** Review lighting: a key light from the camera's front-left, cool ambient fill. */
  renderer.lighting.configureDirectional({ direction: [-0.55, -1.3, 1.5], color: [0.95, 0.86, 0.78] });
  renderer.lighting.ambient.set([0.2, 0.18, 0.26]);
  rebuild();

  // Simulation: gait phase and the gameplay walking loop advance at the fixed step.
  life.own(
    lobby.on(
      "update",
      (dt, time) => {
        world.snapshot();
        const walking = state.pose === "walk" || state.mode === "gameplay";
        state.amount += ((walking ? 1 : 0) - state.amount) * Math.min(1, dt * 5);
        const H = state.document.parameters.height,
          stride = H * 0.82; // metres travelled per full gait cycle at a walk
        if (state.mode === "gameplay") {
          const w = state.walkerMotion,
            omega = WALK_SPEED / (LOOP_RADIUS * 1.25);
          state.pathTime += dt;
          const t = state.pathTime * omega,
            x = LOOP_RADIUS * Math.sin(t),
            y = LOOP_RADIUS * 0.6 * Math.sin(2 * t),
            dx = x - w.x,
            dy = y - w.y,
            distance = Math.hypot(dx, dy),
            speed = distance / dt,
            yaw = distance > 1e-6 ? Math.atan2(dy, dx) + Math.PI / 2 : w.yaw;
          const turn = w.lastYaw === null ? 0 : Math.atan2(Math.sin(yaw - w.lastYaw), Math.cos(yaw - w.lastYaw)) / dt,
            accel = (speed - w.speed) / dt;
          Object.assign(w, { x, y, yaw, speed, lastYaw: yaw });
          const root = state.walker.root;
          root.x = x;
          root.y = y;
          root.yaw = yaw;
          state.phase += (distance / stride) * Math.PI * 2;
          poseHumanoid(state.walker, { phase: state.phase, amount: state.amount, turn, accel: Number.isFinite(accel) ? accel : 0, dt });
        } else {
          // In-place walk: cadence matches the same stride at walking speed.
          if (state.pose === "walk") state.phase += (WALK_SPEED / stride) * Math.PI * 2 * dt;
          for (const rig of state.rigs) poseHumanoid(rig, { phase: state.phase, amount: state.amount, dt });
        }
        if (time - state.statusAt > 0.25) {
          state.statusAt = time;
          onStatus(inspect());
        }
      },
      "freelancer.humanoid-review.update",
    ),
  );

  // Presentation: camera follows the mode; the turnaround camera is level orthographic
  // so heights and widths read without perspective or elevation foreshortening.
  life.own(
    lobby.on(
      "render",
      (alpha) => {
        const camera = renderer.camera,
          aspect = renderer.canvas.clientWidth / Math.max(1, renderer.canvas.clientHeight),
          H = state.document.parameters.height;
        if ((aspect < 0.95 ? 2 : 1) !== state.rows && state.mode === "turnaround") layout();
        camera.setProjection("orthographic");
        if (state.mode === "turnaround") {
          const rows = state.rows,
            columns = rows === 2 ? 2 : REVIEW_VIEWS.length,
            needWidth = (columns * SPACING) / 2 + 0.35,
            needHeight = rows === 2 ? H * 1.25 : H * 0.62;
          camera.azimuth = 0;
          camera.elevation = 0;
          camera.x = 0;
          camera.y = 0;
          camera.z = rows === 2 ? (H * 2.3) / 2 : H * 0.5;
          camera.halfHeight = Math.max(needHeight, needWidth / aspect);
        } else {
          // Exactly the Clinic Way game camera, including its narrow-screen widening.
          const game = FREELANCER_PROJECT.scenes[0].camera,
            root = state.walker.root;
          camera.azimuth = game.azimuth;
          camera.elevation = game.elevation;
          camera.x = state.zoom > 1 ? root.x : 0;
          camera.y = state.zoom > 1 ? root.y : 0;
          camera.z = state.zoom > 1 ? 0.9 : 0;
          camera.halfHeight = Math.max(game.halfHeight, 21 / aspect) / state.zoom;
        }
        world.resolve(alpha);
        renderer.render(lease.value, [guides]);
      },
      "freelancer.humanoid-review.presentation",
    ),
  );

  /** Copied scalars for UI and browser tests; never live entities. */
  function inspect() {
    const r = renderer.stats;
    return {
      mode: state.mode,
      look: state.look,
      pose: state.pose,
      rows: state.rows,
      zoom: state.zoom,
      figures: state.rigs.length + 1,
      parts: state.walker.parts.length,
      entities: world.entities.size,
      instances: r.instances,
      draws: r.draws,
      buffers: r.buffers,
      height: state.document.parameters.height,
    };
  }

  return {
    get document() {
      return state.document;
    },
    inspect,
    /** Validate before replacing; an invalid candidate leaves the current figures intact. */
    setDocument(candidate) {
      const next = validateHumanoid(candidate);
      state.document = next;
      rebuild();
      return next;
    },
    setMode(mode) {
      if (!["turnaround", "gameplay"].includes(mode)) throw new RangeError("Unknown review mode");
      state.mode = mode;
      state.walkerMotion.lastYaw = null;
      layout();
    },
    setLook(look) {
      if (!["shaded", "silhouette"].includes(look)) throw new RangeError("Unknown review look");
      state.look = look;
      applyLook();
    },
    setPose(pose) {
      if (!["stand", "walk"].includes(pose)) throw new RangeError("Unknown review pose");
      state.pose = pose;
    },
    setZoom(zoom) {
      if (![1, 3].includes(zoom)) throw new RangeError("Gameplay zoom is 1× or 3×");
      state.zoom = zoom;
    },
    /** Label anchors in CSS pixels, from the live camera, for the turnaround captions. */
    labelPositions() {
      if (state.mode !== "turnaround") return [];
      const m = renderer.camera.matrix,
        w = renderer.canvas.clientWidth,
        h = renderer.canvas.clientHeight;
      return state.rigs.map((rig, i) => {
        const x = rig.root.x,
          y = rig.root.y,
          z = rig.root.z - 0.08,
          cx = m[0] * x + m[4] * y + m[8] * z + m[12],
          cy = m[1] * x + m[5] * y + m[9] * z + m[13],
          cw = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
        return { label: REVIEW_VIEWS[i].label, x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h };
      });
    },
    dispose: () => {
      for (const rig of state.rigs) rig.dispose();
      state.walker?.dispose();
      life.dispose();
    },
  };
}
