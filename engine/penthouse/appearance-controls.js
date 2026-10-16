/** Penthouse / shared image/effect controls for any engine host.
 * App supplies the renderer, host and Lobby subscription. No game/editor IDs or scheduler.
 * Settings are viewport policy; this widget never mutates authored project data/history. */
import { BLOOM_PARAMETERS } from "../basement/bloom-settings.js";
import {
  BLOOM_PRESETS,
  matchingBloomPreset,
} from "../basement/bloom-presets.js";
import { Lifetime } from "../basement/lifetime.js";
export class AppearanceControls {
  /** Labels and bounds correspond to the public Presentation/Bloom APIs; caller owns this instance. */
  constructor({
    renderer,
    host,
    subscribe,
    onError = () => {},
    title = "✧ Image & effects",
  }) {
    this.renderer = renderer;
    this.life = new Lifetime();
    this.element = document.createElement("details");
    this.element.className = "engine-appearance";
    this.element.style.cssText = "grid-column:1/-1;min-width:0";
    try {
      const summary = document.createElement("summary");
      summary.textContent = title;
      summary.style.cssText = "cursor:pointer;padding:10px 3px;color:#d9bb83";
      this.element.append(summary);
      const body = document.createElement("div");
      body.style.cssText =
        "display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 2px";
      this.element.append(body);
      this.fields = {};
      this.owners = {};
      /** One field factory: touch target, validation, app error policy and setting adoption are shared. */
      const field = (key, label, input, owner = renderer.bloom) => {
        const wrap = document.createElement("label");
        wrap.style.cssText =
          "display:grid;gap:5px;min-width:0;font:10px system-ui;color:#bca9c8";
        wrap.append(document.createTextNode(label));
        input.style.cssText = "width:100%;min-width:0;min-height:38px";
        input.setAttribute("aria-label", label);
        input.dataset[owner === renderer.bloom ? "bloom" : "presentation"] =
          key;
        wrap.append(input);
        body.append(wrap);
        this.fields[key] = input;
        this.owners[key] = owner;
        input.value = owner.settings[key];
        this.life.listen(input, "change", () => {
          try {
            if (key === "mode" && input.value !== "off")
              renderer.presentation.configure({});
            owner.configure({
              [key]: key === "mode" ? input.value : Number(input.value),
            });
            this.refreshStatus();
          } catch (error) {
            input.value = owner.settings[key];
            onError(error);
          }
        });
      };
      const mode = document.createElement("select");
      for (const [value, label] of [
        ["off", "Off"],
        ["low", "Soft · 512 px"],
        ["high", "Fine · 1024 px"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        mode.append(option);
      }
      field("mode", "Bloom quality", mode);
      // Recipes edit the same effect fields as manual input. Selecting one explicitly opts
      // into Soft if bloom was Off, retains an existing quality, and never changes exposure.
      const presetLabel = document.createElement("label");
      presetLabel.textContent = "Bloom look";
      presetLabel.style.cssText =
        "grid-column:1/-1;display:grid;gap:5px;font:10px system-ui;color:#bca9c8";
      this.preset = document.createElement("select");
      this.preset.setAttribute("aria-label", "Bloom look");
      this.preset.dataset.bloomPreset = "";
      for (const [value, label] of [
        ["custom", "Custom"],
        ...BLOOM_PRESETS.map((p) => [p.id, p.name]),
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        if (value === "custom") option.disabled = true;
        this.preset.append(option);
      }
      presetLabel.append(this.preset);
      body.append(presetLabel);
      this.life.listen(this.preset, "change", () => {
        try {
          const recipe = BLOOM_PRESETS.find((p) => p.id === this.preset.value);
          if (!recipe) return;
          renderer.bloom.configure({
            ...recipe.settings,
            mode:
              renderer.bloom.settings.mode === "off"
                ? "low"
                : renderer.bloom.settings.mode,
          });
          renderer.presentation.configure({});
          // A recipe explicitly replaces every shaping value, including a focused numeric field.
          this.refreshStatus(true);
        } catch (error) {
          this.refreshStatus();
          onError(error);
        }
      });
      for (const { key, label, min, max, step, hint } of [
        ...BLOOM_PARAMETERS,
        {
          key: "exposure",
          label: "Exposure",
          min: 0.05,
          max: 8,
          step: 0.05,
          hint: "Whole-scene presentation brightness; independent of bloom.",
        },
      ]) {
        const input = document.createElement("input");
        input.type = "number";
        Object.assign(input, { min, max, step, title: hint });
        field(
          key,
          label,
          input,
          key === "exposure" ? renderer.presentation : renderer.bloom,
        );
      }
      this.status = document.createElement("output");
      this.status.style.cssText =
        "grid-column:1/-1;font:10px/1.6 system-ui;color:#a99bb6";
      this.status.setAttribute("aria-live", "polite");
      body.append(this.status);
      host.append(this.element);
      this.refreshStatus();
      let last = -Infinity;
      this.life.own(
        subscribe((_alpha, _time, wallMs) => {
          if (wallMs - last < 500) return;
          last = wallMs;
          this.refreshStatus();
        }),
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  /** Report actual quality/failure, never imply HDR is active merely because it was requested. */
  refreshStatus(force = false) {
    const b = this.renderer.bloom.inspect(),
      p = this.renderer.presentation.inspect();
    // Engine/application policies may configure bloom too; do not replace in-progress typing.
    for (const [key, input] of Object.entries(this.fields))
      if (
        (force || document.activeElement !== input) &&
        input.value !== String(this.owners[key].settings[key])
      )
        input.value = this.owners[key].settings[key];
    this.preset.value = matchingBloomPreset(this.renderer.bloom.settings);
    this.status.dataset.effective =
      p.effectiveMode === "hdr" && !b.failure ? b.mode : "off";
    this.status.dataset.bytes = b.targetBytes + p.targetBytes;
    this.status.textContent =
      (p.failure ?? b.failure)
        ? `${p.effectiveMode === "hdr" ? "HDR · bloom unavailable" : "Direct rendering"} · ${p.failure ?? b.failure}`
        : b.mode === "off"
          ? `${p.effectiveMode === "hdr" ? "HDR" : "Direct rendering"} · bloom off`
          : p.effectiveMode !== "hdr"
            ? p.mode === "direct"
              ? "Direct rendering · effects bypassed"
              : "Preparing HDR…"
            : `HDR · ${p.samples}× MSAA · ${b.levels} scales · ${b.passes + p.passes} passes · ${((b.targetBytes + p.targetBytes) / 1048576).toFixed(1)} MiB estimated`;
  }
  /** Unsubscribe before removing DOM; repeated disposal is safe. */
  dispose() {
    this.life.dispose();
    this.element.remove();
  }
}
