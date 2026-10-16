/** Freelancer / standalone browser composition. Game UI stays here, never in the engine.
 * The same scene factory runs under Studio Play, with detached authored JSON. */
import { ETRNLNINE } from "../../engine/etrnlnine.js";
import { Lifetime } from "../../engine/basement/lifetime.js";
import { createFreelancerScene } from "./scene.js";
const $ = (id) => document.getElementById(id),
  life = new Lifetime();
let engine, scene;
/** Surface errors without leaving partially created controls/worlds running. */
function report(error) {
  $("error").hidden = false;
  $("error").textContent = error.message;
  console.error(error);
}
/** Restart uses the same lifecycle as closing Studio Play; definitions and controls are released. */
function restart() {
  scene?.dispose();
  scene = createFreelancerScene(engine, {
    controlsHost: $("controls"),
    onError: report,
    onStatus: (state) => {
      const r = engine.basement.renderer.stats,
        residency = state.residency;
      $("prompt").textContent =
        state.travel?.status === "failed" ? state.travel.message : state.prompt;
      $("subtitle").textContent = state.name;
      const out = $("status");
      out.textContent = `${r.instances} visible forms · ${r.draws} draws · ${residency.resident}/2 worlds · WebGL2`;
      Object.assign(out.dataset, {
        scene: state.sceneId,
        actor: state.actorId,
        x: state.x.toFixed(4),
        y: state.y.toFixed(4),
        nearby: state.nearby,
        committed: state.travel?.committed ?? 0,
        failed: state.travel?.failed ?? 0,
        resident: residency.resident,
        worlds: engine.directory.worlds.size,
        buffers: r.buffers,
      });
    },
  });
}
try {
  engine = new ETRNLNINE($("world"), {
    pixelRatio: 1.25,
    occlusion: { mode: "geometry" },
    lighting: { shadows: { mode: "low" } },
  });
  life.own(() => engine.dispose());
  life.own(() => scene?.dispose());
  restart();
  life.listen($("restart"), "click", restart);
  life.listen($("pause"), "click", () => {
    const paused = !engine.lobby.reasons.has("freelancer-menu");
    engine.lobby.pause("freelancer-menu", paused);
    document.body.classList.toggle("paused", paused);
    $("pause").textContent = paused ? "Resume" : "Pause";
  });
  life.listen($("quality"), "change", () => {
    const r = engine.basement.renderer,
      quality = $("quality").value;
    r.occlusion.configure({
      mode:
        quality === "fine" ? "screen" : quality === "off" ? "off" : "geometry",
    });
    r.lighting.configureShadows({
      mode: quality === "fine" ? "high" : quality === "off" ? "off" : "low",
    });
  });
  const profiler = engine.directory.create("tool.profiler", {
    profiler: engine.basement.profiler,
    host: document.body,
    subscribe: (fn) => engine.lobby.on("render", fn, "freelancer.profiler"),
  });
  life.own(() => profiler.dispose());
  life.listen(
    $("profiler"),
    "click",
    () => (profiler.element.open = !profiler.element.open),
  );
  life.listen(window, "pagehide", (event) => {
    if (!event.persisted) life.dispose();
  });
  engine.start();
} catch (error) {
  life.dispose();
  report(error);
}
