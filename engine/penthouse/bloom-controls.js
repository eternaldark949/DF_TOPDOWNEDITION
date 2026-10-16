/** Penthouse / one reusable bloom control panel for any engine host.
 * App supplies the renderer, host and Lobby subscription. No game/editor IDs or scheduler.
 * Settings are viewport policy; this widget never mutates authored project data/history. */
import { Lifetime } from "../basement/lifetime.js";
export class BloomControls {
  /** Labels and bounds correspond to the public Bloom API; caller owns this instance. */
  constructor({
    renderer,
    host,
    subscribe,
    onError = () => {},
    title = "✧ Bloom & exposure",
  }) {
    this.renderer = renderer;
    this.life = new Lifetime();
    this.element = document.createElement("details");
    this.element.className = "engine-bloom";
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
      /** One field factory: touch target, validation, app error policy and setting adoption are shared. */
      const field = (key, label, input) => {
        const wrap = document.createElement("label");
        wrap.style.cssText =
          "display:grid;gap:5px;min-width:0;font:10px system-ui;color:#bca9c8";
        wrap.append(document.createTextNode(label));
        input.style.cssText = "width:100%;min-width:0;min-height:38px";
        input.setAttribute("aria-label", label);
        input.dataset.bloom = key;
        wrap.append(input);
        body.append(wrap);
        this.fields[key] = input;
        input.value = renderer.bloom.settings[key];
        this.life.listen(input, "change", () => {
          try {
            renderer.bloom.configure({
              [key]: key === "mode" ? input.value : Number(input.value),
            });
            this.refreshStatus();
          } catch (error) {
            input.value = renderer.bloom.settings[key];
            onError(error);
          }
        });
      };
      const mode = document.createElement("select");
      for (const [value, label] of [
        ["off", "Off · direct"],
        ["low", "Soft · 512 px"],
        ["high", "Fine · 1024 px"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        mode.append(option);
      }
      field("mode", "Bloom quality", mode);
      for (const [key, label, min, max, step] of [
        ["strength", "Bloom strength", 0, 3, 0.05],
        ["radius", "Bloom spread", 0.5, 3, 0.05],
        ["threshold", "Bloom threshold", 0, 16, 0.1],
        ["exposure", "Exposure", 0.05, 8, 0.05],
      ]) {
        const input = document.createElement("input");
        input.type = "number";
        Object.assign(input, { min, max, step });
        field(key, label, input);
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
  refreshStatus() {
    const b = this.renderer.bloom.inspect();
    // Engine/application policies may configure bloom too; do not replace in-progress typing.
    for (const [key, input] of Object.entries(this.fields))
      if (document.activeElement !== input && input.value !== String(b[key]))
        input.value = b[key];
    this.status.dataset.effective = b.effectiveMode;
    this.status.dataset.bytes = b.targetBytes;
    this.status.textContent = b.failure
      ? `Direct rendering · ${b.failure}`
      : b.mode === "off"
        ? "Direct rendering · bloom off"
        : b.effectiveMode === "off"
          ? "Preparing HDR…"
          : `HDR · ${b.samples}× MSAA · ${b.levels} scales · ${b.passes} passes · ${(b.targetBytes / 1048576).toFixed(1)} MiB estimated`;
  }
  /** Unsubscribe before removing DOM; repeated disposal is safe. */
  dispose() {
    this.life.dispose();
    this.element.remove();
  }
}
