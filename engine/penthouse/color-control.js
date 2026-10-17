/** Penthouse / one reusable linear-HDR colour editor for all declared colour properties.
 * CSS paints the wheel; no Canvas, assets, polling or extra scheduler is used.
 * A modal session owns one preview transaction; Apply commits, Escape/Cancel rolls back.
 * The host owns persistence/validation. This widget only owns its DOM/listeners/gesture. */
import { Lifetime } from "../basement/lifetime.js";
import {
  colorDisplay,
  hsvToRgb,
  rgbToHsv,
  srgbToLinear,
} from "../basement/color.js";
export class ColorControl {
  constructor({
    host,
    label,
    value,
    max = 16,
    onBegin,
    onPreview,
    onFinish,
    onError,
  }) {
    this.life = new Lifetime();
    this.active = false;
    this.disposed = false;
    this.pointer = null;
    this.value = [...value];
    this.max = max;
    this.label = label;
    this.onBegin = onBegin;
    this.onPreview = onPreview;
    this.onFinish = onFinish;
    this.onError = onError;
    const node = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };
    this.pill = node("button", "color-pill");
    this.pill.type = "button";
    this.pill.setAttribute("aria-label", `Edit ${label}`);
    this.pill.setAttribute("aria-haspopup", "dialog");
    this.swatch = node("span", "color-swatch");
    this.swatch.setAttribute("aria-hidden", "true");
    this.caption = node("span", "color-caption");
    this.pill.append(this.swatch, this.caption);
    host.append(this.pill);
    this.dialog = node("dialog", "color-dialog");
    this.dialog.setAttribute("aria-label", `${label} picker`);
    const heading = node("h2", null, label),
      note = node(
        "p",
        "color-note",
        "Wheel and hex use sRGB. RGB fields store linear values; intensity preserves HDR energy.",
      );
    this.wheel = node("div", "color-wheel");
    this.wheel.tabIndex = 0;
    this.wheel.setAttribute("role", "slider");
    this.wheel.setAttribute("aria-label", `${label} hue and saturation`);
    this.wheel.setAttribute("aria-valuemin", "0");
    this.wheel.setAttribute("aria-valuemax", "360");
    this.cursor = node("span", "color-cursor");
    this.wheel.append(this.cursor);
    const controls = node("div", "color-components");
    this.inputs = {};
    /** Every input is native/labelled; keyboard and touch share exactly the same preview path. */
    const input = (key, title, type, min, max, step) => {
      const wrap = node("label", null, title),
        el = node("input");
      el.type = type;
      if (type === "number") el.inputMode = "decimal";
      if (min !== null) {
        el.min = min;
        el.max = max;
        el.step = step;
      }
      el.setAttribute("aria-label", `${label} ${title}`);
      wrap.append(el);
      controls.append(wrap);
      this.inputs[key] = el;
      return el;
    };
    const hue = input("h", "Hue", "range", 0, 360, 1),
      sat = input("s", "Saturation", "range", 0, 1, 0.001),
      val = input("v", "Brightness", "range", 0, 1, 0.001);
    const gain = input(
      "gain",
      "Intensity",
      "number",
      1,
      Math.max(1, max),
      0.05,
    );
    gain.disabled = max <= 1;
    const hex = input("hex", "Hex", "text", null);
    hex.maxLength = 7;
    hex.spellcheck = false;
    for (const [key, el] of [
      ["h", hue],
      ["s", sat],
      ["v", val],
      ["gain", gain],
    ])
      this.life.listen(el, "input", () => {
        const n = el.valueAsNumber;
        if (!Number.isFinite(n) || n < Number(el.min) || n > Number(el.max)) {
          el.setCustomValidity("Value out of range");
          return;
        }
        el.setCustomValidity("");
        this[key] = n;
        this.fromWheel();
      });
    this.life.listen(hex, "input", () => {
      if (!/^#[0-9a-f]{6}$/i.test(hex.value)) {
        hex.setCustomValidity("Use #RRGGBB");
        return;
      }
      hex.setCustomValidity("");
      const rgb = [1, 3, 5].map(
        (i) => parseInt(hex.value.slice(i, i + 2), 16) / 255,
      );
      this.set(
        rgb.map((n) => srgbToLinear(n) * this.gain),
        hex,
      );
    });
    this.rgb = [];
    for (let i = 0; i < 3; i++) {
      const el = input(`rgb${i}`, ["R", "G", "B"][i], "number", 0, max, "any");
      this.rgb.push(el);
      this.life.listen(el, "input", () => {
        if (
          el.value.trim() === "" ||
          !Number.isFinite(el.valueAsNumber) ||
          el.valueAsNumber < 0 ||
          el.valueAsNumber > max
        ) {
          el.setCustomValidity(`Use 0–${max}`);
          return;
        }
        el.setCustomValidity("");
        const next = [...this.value];
        next[i] = el.valueAsNumber;
        this.set(next, el);
      });
    }
    const footer = node("div", "color-actions"),
      cancel = node("button", null, "Cancel"),
      apply = node("button", null, "Apply colour");
    cancel.type = apply.type = "button";
    footer.append(cancel, apply);
    this.dialog.append(heading, this.wheel, controls, note, footer);
    host.append(this.dialog);
    this.life.listen(this.pill, "click", () => this.open());
    this.life.listen(cancel, "click", () => this.finish(false));
    this.life.listen(apply, "click", () => {
      if (this.dialog.querySelector(":invalid")) {
        this.dialog.querySelector(":invalid").reportValidity();
        return;
      }
      this.finish(true);
    });
    this.life.listen(this.dialog, "cancel", (e) => {
      e.preventDefault();
      this.finish(false);
    });
    // Modal keys never reach workspace shortcuts or PanelDock's Escape handler.
    this.life.listen(this.dialog, "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        apply.click();
      }
    });
    this.life.listen(this.dialog, "close", () => {
      if (this.active) this.finish(false);
    });
    const point = (e) => {
      const b = this.wheel.getBoundingClientRect(),
        x = ((e.clientX - b.left) / b.width) * 2 - 1,
        y = ((e.clientY - b.top) / b.height) * 2 - 1;
      this.h = ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360;
      this.s = Math.min(1, Math.hypot(x, y));
      this.fromWheel();
    };
    this.life.listen(this.wheel, "pointerdown", (e) => {
      if (this.pointer !== null || e.button !== 0) return;
      e.preventDefault();
      this.wheel.focus();
      this.pointer = e.pointerId;
      this.pointerBefore = [...this.value];
      this.wheel.setPointerCapture(e.pointerId);
      point(e);
    });
    this.life.listen(this.wheel, "pointermove", (e) => {
      if (this.pointer === e.pointerId) point(e);
    });
    this.life.listen(this.wheel, "pointerup", (e) => {
      if (this.pointer === e.pointerId) {
        this.pointer = null;
        this.wheel.releasePointerCapture(e.pointerId);
      }
    });
    this.life.listen(this.wheel, "pointercancel", (e) => {
      if (this.pointer === e.pointerId) {
        this.pointer = null;
        this.set(this.pointerBefore);
      }
    });
    this.life.listen(this.wheel, "lostpointercapture", () => {
      this.pointer = null;
    });
    this.life.listen(this.wheel, "keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
        return;
      e.preventDefault();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        this.h =
          (this.h +
            (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1) +
            360) %
          360;
      else
        this.s = Math.max(
          0,
          Math.min(1, this.s + (e.key === "ArrowUp" ? 0.01 : -0.01)),
        );
      this.fromWheel();
    });
    this.sync();
  }
  /** Opening alone does not dirty a document or quantize its existing colour. */
  open() {
    if (this.disposed || this.active) return;
    try {
      this.onBegin();
      this.before = [...this.value];
      this.active = true;
      this.sync();
      this.dialog.showModal();
      this.wheel.focus();
    } catch (e) {
      if (this.active) this.finish(false);
      this.onError(e);
    }
  }
  /** Wheel state becomes linear data only here; gain remains separate from display gamma. */
  fromWheel() {
    this.set(
      hsvToRgb(this.h, this.s, this.v).map((n) =>
        Math.min(this.max, srgbToLinear(n) * this.gain),
      ),
      null,
      true,
    );
  }
  /** Preview never commits; invalid host values leave both widget and document intact. */
  set(value, source = null, keepWheel = false) {
    try {
      // Hue-only changes on white/black and repeated pointer samples need no JSON preview.
      if (value.some((n, i) => n !== this.value[i])) this.onPreview(value);
      this.value = [...value];
      this.sync(source, keepWheel);
    } catch (e) {
      this.onError(e);
    }
  }
  /** Update the pill and all alternate representations, retaining active input precision. */
  sync(source = null, keepWheel = false) {
    const display = colorDisplay(this.value);
    if (!keepWheel) {
      [this.h, this.s, this.v] = rgbToHsv(display.rgb, this.h ?? 0);
      this.gain = display.gain;
    }
    this.swatch.style.background = display.hex;
    this.caption.textContent = `${display.hex.toUpperCase()}${display.gain > 1 ? " · " + Number(display.gain.toFixed(2)) + "×" : ""}`;
    for (const [key, value] of Object.entries({
      h: this.h,
      s: this.s,
      v: this.v,
      gain: this.gain,
      hex: display.hex,
      rgb0: this.value[0],
      rgb1: this.value[1],
      rgb2: this.value[2],
    })) {
      const el = this.inputs[key];
      if (el !== source) {
        el.value =
          typeof value === "number" ? Number(value.toPrecision(10)) : value;
        el.setCustomValidity("");
      }
    }
    const angle = ((this.h - 90) * Math.PI) / 180;
    this.cursor.style.left = `${50 + Math.cos(angle) * this.s * 50}%`;
    this.cursor.style.top = `${50 + Math.sin(angle) * this.s * 50}%`;
    this.wheel.setAttribute("aria-valuenow", String(Math.round(this.h)));
    this.wheel.setAttribute(
      "aria-valuetext",
      `Hue ${Math.round(this.h)}°, saturation ${Math.round(this.s * 100)}%`,
    );
  }
  /** Close before host callbacks, since a commit can synchronously rebuild this inspector. */
  finish(commit) {
    if (!this.active) return;
    // A gesture can return to its opening colour after writing an optional default.
    // Roll that session back too, preserving the exact original authored representation.
    commit = commit && this.value.some((n, i) => n !== this.before[i]);
    this.active = false;
    this.pointer = null;
    if (!commit) {
      this.value = [...this.before];
      this.sync();
    }
    this.dialog.close();
    this.onFinish(commit, !this.disposed);
    if (!this.disposed && this.pill.isConnected)
      this.pill.focus({ preventScroll: true });
  }
  /** Selection/import/Play/disposal cancels unaccepted edits and removes the top-layer dialog. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.life.dispose();
    if (this.active) this.finish(false);
    this.dialog.remove();
    this.pill.remove();
  }
}
