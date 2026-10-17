/** Freelancer / standalone humanoid review page. Review UI stays here, never in the engine.
 * The outfit section edits the document's outfit list against the Freelancer wardrobe;
 * "Generate outfit" draws one at random from it with a small colour palette.
 * Proportion edits validate a candidate document before replacing the figures; the
 * authored JSON in content/humanoid-949.json changes only when the owner saves an export. */
import { ETRNLNINE } from "../../../engine/etrnlnine.js";
import { Lifetime } from "../../../engine/basement/lifetime.js";
import { NumberControl } from "../../../engine/penthouse/number-control.js";
import { HUMANOID_PARAMETERS, HUMANOID_CHOICES } from "../../../engine/penthouse/humanoid.js";
import { GARMENT_SLOTS, generateOutfit } from "../../../engine/penthouse/garments.js";
import { STELLA_949, FREELANCER_WARDROBE } from "./preset.js";
import { createHumanoidReview } from "./review.js";

const $ = (id) => document.getElementById(id),
  life = new Lifetime(),
  // Bounded undo: whole documents are small (≈1 KB), so 48 entries cost little.
  HISTORY_LIMIT = 48;
let engine, review;

/** Surface errors without leaving partially created controls or worlds running. */
function report(error) {
  $("error").hidden = false;
  $("error").textContent = error.message;
  console.error(error);
}

/** Toggle a button group's pressed state from the chosen value. */
function press(attribute, value) {
  for (const button of document.querySelectorAll(`nav [data-${attribute}]`))
    button.setAttribute("aria-pressed", String(button.dataset[attribute] === String(value)));
}

/** Build the proportions panel from the shared parameter table. Returns its disposer. */
function buildPanel(host) {
  const panel = new Lifetime(),
    controls = new Map(),
    history = [];
  let before = null;
  // Action buttons exist before any control can record history; they are appended last.
  const undo = document.createElement("button"),
    reset = document.createElement("button"),
    save = document.createElement("button");
  const problem = document.createElement("div");
  problem.id = "problem";
  problem.setAttribute("role", "status");
  /** Apply one candidate; an invalid combination is reported and leaves the figures. */
  const apply = (patch, outfit = null) => {
    const candidate = structuredClone(review.document);
    Object.assign(candidate.parameters, patch);
    if (outfit) candidate.outfit = outfit;
    try {
      review.setDocument(candidate);
      problem.textContent = "";
      return true;
    } catch (error) {
      problem.textContent = error.message;
      return false;
    }
  };
  /** Refresh every control from the live document (after undo/reset). */
  const refresh = () => {
    const p = review.document.parameters;
    for (const [key, control] of controls) {
      if (control instanceof NumberControl) control.setValue(p[key], true);
      else if (control.type === "checkbox") control.checked = p[key];
      else control.value = p[key];
    }
    for (const [slot, select] of outfitControls)
      select.value = review.document.outfit.find((e) => FREELANCER_WARDROBE.garments.get(e.garment)?.slot === slot)?.garment ?? "";
  };
  const outfitControls = new Map();
  const remember = (document) => {
    history.push(document);
    if (history.length > HISTORY_LIMIT) history.shift();
    undo.disabled = false;
  };
  let group = null;
  for (const d of HUMANOID_PARAMETERS) {
    if (d.group !== group) {
      group = d.group;
      const heading = document.createElement("h2");
      heading.textContent = group;
      host.append(heading);
    }
    const label = document.createElement("label");
    label.innerHTML = `${d.label} <em>${d.unit}</em>`;
    host.append(label);
    const control = new NumberControl({
      host,
      label: `${d.label} (${d.unit})`,
      value: review.document.parameters[d.key],
      min: d.min,
      max: d.max,
      step: d.max - d.min > 5 ? 0.5 : 0.005,
      slider: { min: d.slider[0], max: d.slider[1] },
      // One gesture or typing session is one undo entry, matching Studio's transactions.
      onBegin: () => (before = review.document),
      onPreview: (value) => apply({ [d.key]: value }),
      onFinish: (commit) => {
        if (!commit) {
          if (before) review.setDocument(before);
          problem.textContent = "";
        } else if (before && before !== review.document) remember(before);
        before = null;
        refresh();
      },
      onError: (error) => (problem.textContent = error.message),
    });
    controls.set(d.key, control);
    panel.own(() => control.dispose());
  }
  // Discrete choices: string options become selects, booleans become checkboxes.
  const heading = document.createElement("h2");
  heading.textContent = "Body and outline";
  host.append(heading);
  const choiceLabels = { gender: "Body canon", build: "Build", hair: "Hair", backpack: "Wear backpack" };
  for (const [key, options] of Object.entries(HUMANOID_CHOICES)) {
    const label = document.createElement("label");
    let control;
    if (options.every((o) => typeof o === "boolean")) {
      control = document.createElement("input");
      control.type = "checkbox";
      control.checked = review.document.parameters[key];
      label.append(control, choiceLabels[key] ?? key);
      host.append(label);
    } else {
      label.textContent = choiceLabels[key] ?? key;
      control = document.createElement("select");
      control.setAttribute("aria-label", choiceLabels[key] ?? key);
      for (const option of options) control.append(new Option(option, option));
      control.value = review.document.parameters[key];
      host.append(label, control);
    }
    controls.set(key, control);
    panel.listen(control, "change", () => {
      const previous = review.document;
      if (apply({ [key]: control.type === "checkbox" ? control.checked : control.value })) remember(previous);
      refresh();
    });
  }
  // Outfit: one garment per slot from the wardrobe. Garments carry their own colour.
  const outfitHeading = document.createElement("h2");
  outfitHeading.textContent = "Outfit";
  host.append(outfitHeading);
  const slots = Object.keys(GARMENT_SLOTS),
    /** Current outfit with `slot` replaced by `garment` (or removed when empty). */
    withSlot = (slot, garment) => {
      const kept = review.document.outfit.filter((e) => FREELANCER_WARDROBE.garments.get(e.garment)?.slot !== slot);
      return garment ? [...kept, { garment }] : kept;
    };
  for (const slot of slots) {
    const label = document.createElement("label"),
      select = document.createElement("select");
    label.textContent = slot[0].toUpperCase() + slot.slice(1);
    select.setAttribute("aria-label", `Outfit ${slot}`);
    select.append(new Option("None", ""));
    for (const g of FREELANCER_WARDROBE.garments.values()) if (g.slot === slot) select.append(new Option(g.name, g.id));
    host.append(label, select);
    outfitControls.set(slot, select);
    panel.listen(select, "change", () => {
      const previous = review.document;
      if (apply({}, withSlot(slot, select.value))) remember(previous);
      refresh();
    });
  }
  const generate = document.createElement("button");
  generate.textContent = "Generate outfit";
  const generateRow = document.createElement("div");
  generateRow.className = "row";
  generateRow.append(generate);
  host.append(generateRow);
  panel.listen(generate, "click", () => {
    const previous = review.document;
    if (apply({}, generateOutfit(FREELANCER_WARDROBE, { colors: OUTFIT_COLOURS }))) remember(previous);
    refresh();
  });
  // Document actions.
  const row = document.createElement("div");
  row.className = "row";
  undo.textContent = "Undo";
  undo.disabled = true;
  reset.textContent = "Reset";
  save.textContent = "Export JSON";
  row.append(undo, reset, save);
  host.append(row, problem);
  panel.listen(undo, "click", () => {
    const previous = history.pop();
    if (previous) review.setDocument(previous);
    undo.disabled = !history.length;
    problem.textContent = "";
    refresh();
  });
  panel.listen(reset, "click", () => {
    if (review.document !== STELLA_949) remember(review.document);
    review.setDocument(STELLA_949);
    problem.textContent = "";
    refresh();
  });
  // Export writes a file the owner can commit as content/humanoid-949.json. No network.
  panel.listen(save, "click", () => {
    const blob = new Blob([JSON.stringify(review.document, null, 2) + "\n"], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      link = Object.assign(document.createElement("a"), { href: url, download: "humanoid-949.json" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  panel.own(() => host.replaceChildren());
  refresh();
  return () => panel.dispose();
}

/** Linear-RGB colours "Generate outfit" draws from: Freelancer's night palette. */
const OUTFIT_COLOURS = Object.freeze([
  [0.02, 0.018, 0.03], [0.18, 0.1, 0.3], [0.32, 0.05, 0.08], [0.05, 0.12, 0.2], [0.6, 0.58, 0.55],
  [0.45, 0.3, 0.12], [0.08, 0.2, 0.12], [0.5, 0.18, 0.32], [0.04, 0.035, 0.06], [0.72, 0.5, 0.1],
]);

try {
  engine = new ETRNLNINE($("world"), {
    pixelRatio: 1.5,
    occlusion: { mode: "geometry" },
    lighting: { shadows: { mode: "low" } },
  });
  life.own(() => engine.dispose());
  review = createHumanoidReview(engine, {
    document: STELLA_949,
    wardrobe: FREELANCER_WARDROBE,
    onStatus: (s) => {
      $("status").textContent = `${s.figures} figures · ${s.parts} parts each · ${s.instances} visible forms · ${s.draws} draws · WebGL2`;
      Object.assign($("status").dataset, s);
    },
  });
  life.own(() => review.dispose());
  $("name").textContent = STELLA_949.name;
  life.own(buildPanel($("panel")));
  // Captions follow the live camera; they are HTML labels, not rendered text.
  const labels = $("labels");
  life.own(
    engine.lobby.on(
      "render",
      () => {
        const anchors = review.labelPositions();
        while (labels.children.length < anchors.length) labels.append(document.createElement("span"));
        [...labels.children].forEach((span, i) => {
          span.hidden = i >= anchors.length;
          if (i < anchors.length) {
            span.textContent = anchors[i].label;
            span.style.left = anchors[i].x.toFixed(1) + "px";
            span.style.top = anchors[i].y.toFixed(1) + "px";
          }
        });
      },
      "freelancer.humanoid-review.labels",
    ),
  );
  for (const button of document.querySelectorAll("nav [data-mode]"))
    life.listen(button, "click", () => {
      review.setMode(button.dataset.mode);
      press("mode", button.dataset.mode);
      $("poses").hidden = button.dataset.mode !== "turnaround";
      $("zooms").hidden = button.dataset.mode !== "gameplay";
    });
  for (const button of document.querySelectorAll("nav [data-look]"))
    life.listen(button, "click", () => {
      review.setLook(button.dataset.look);
      press("look", button.dataset.look);
      document.body.classList.toggle("silhouette", button.dataset.look === "silhouette");
    });
  for (const button of document.querySelectorAll("nav [data-pose]"))
    life.listen(button, "click", () => {
      review.setPose(button.dataset.pose);
      press("pose", button.dataset.pose);
    });
  for (const button of document.querySelectorAll("nav [data-zoom]"))
    life.listen(button, "click", () => {
      review.setZoom(Number(button.dataset.zoom));
      press("zoom", button.dataset.zoom);
    });
  life.listen($("toggle-panel"), "click", () => {
    const open = $("panel").hidden;
    $("panel").hidden = !open;
    $("toggle-panel").setAttribute("aria-expanded", String(open));
  });
  life.listen(window, "pagehide", (event) => {
    if (!event.persisted) life.dispose();
  });
  engine.start();
} catch (error) {
  life.dispose();
  report(error);
}
