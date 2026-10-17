/** Penthouse / a shared number surface. Optional bounded drag track and precise input
 * represent one value. The host owns validation/history; this widget owns each gesture,
 * cancellation, native keyboard access and listener cleanup. No frame loop or document IDs. */
import {
  validateRange,
  rangeValue,
  rangeUnit,
} from "../basement/number-range.js";
import { Lifetime } from "../basement/lifetime.js";
export class NumberControl {
  /** Slider bounds describe useful interaction; min/max remain hard numeric limits. */
  constructor({
    host,
    label,
    value,
    min,
    max,
    step = 0.01,
    slider = null,
    disabled = false,
    escape = "cancel",
    onBegin = () => {},
    onPreview = () => {},
    onFinish = () => {},
    onError = () => {},
  }) {
    this.life = new Lifetime();
    this.value = value;
    this.active = false;
    this.disposed = false;
    this.callbacks = { onBegin, onPreview, onFinish, onError };
    this.slider = slider ? { ...validateRange(slider) } : null;
    this.element = document.createElement("span");
    this.element.className = "number-control";
    this.input = document.createElement("input");
    this.input.type = "number";
    this.input.inputMode = "decimal";
    this.input.step = "any";
    this.input.dataset.increment = step;
    this.input.setAttribute("aria-label", label);
    if (Number.isFinite(min)) this.input.min = min;
    if (Number.isFinite(max)) this.input.max = max;
    this.input.disabled = disabled;
    if (slider) {
      this.range = document.createElement("input");
      this.range.type = "range";
      this.range.min = 0;
      this.range.max = 1;
      this.range.step = "any";
      this.range.disabled = disabled;
      this.range.setAttribute("aria-label", label + " slider");
      this.element.classList.add("has-slider");
      this.element.append(this.range);
    }
    this.element.append(this.input);
    host.append(this.element);
    this.setValue(value, true);
    /** Begin lazily: repeated focus/pointer events cannot open nested host transactions. */
    const begin = () => {
      if (this.active || this.disposed || disabled) return;
      try {
        onBegin();
        this.before = this.value;
        this.changed = false;
        this.active = true;
      } catch (e) {
        onError(e);
      }
    };
    const preview = (value) => {
      begin();
      if (!this.active) return;
      try {
        if (
          !Number.isFinite(value) ||
          value < Number(this.input.min || -Infinity) ||
          value > Number(this.input.max || Infinity)
        )
          throw new RangeError("Value out of range");
        if (value !== this.value) {
          this.callbacks.onPreview(value);
          this.changed = true;
        }
        this.value = value;
        this.input.setCustomValidity("");
        this.paint();
      } catch (e) {
        this.input.setCustomValidity(e.message);
      }
    };
    this.life.listen(this.input, "focus", () => {
      // Compact display never quantizes data. Reveal the full stored double for typing.
      this.input.value = String(this.value);
      begin();
    });
    this.life.listen(this.input, "input", () =>
      preview(this.input.value.trim() === "" ? NaN : this.input.valueAsNumber),
    );
    this.life.listen(this.input, "change", () => {
      preview(this.input.value.trim() === "" ? NaN : this.input.valueAsNumber);
      const valid = this.input.validity.valid,
        message = this.input.validationMessage;
      this.finish(valid);
      if (!valid) onError(new Error(message));
    });
    this.life.listen(this.input, "blur", () => {
      const valid = this.input.validity.valid;
      this.finish(valid);
      if (!valid)
        onError(new Error(this.input.validationMessage || "Invalid number"));
    });
    this.life.listen(this.input, "keydown", (e) => {
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        this.input.value = String(
          Number(
            (
              Number(this.input.value) + (e.key === "ArrowUp" ? step : -step)
            ).toFixed(10),
          ),
        );
        preview(this.input.valueAsNumber);
      }
      if (e.key === "Escape") {
        if (escape === "bubble") return;
        e.preventDefault();
        this.finish(false);
        this.input.blur();
      }
      if (e.key === "Enter") this.input.blur();
    });
    if (this.range) {
      this.life.listen(this.range, "focus", begin);
      this.life.listen(this.range, "pointerdown", begin);
      this.life.listen(this.range, "input", () => {
        this.input.value = this.fromUnit(this.range.valueAsNumber);
        preview(this.input.valueAsNumber);
      });
      this.life.listen(this.range, "pointerup", () => this.finish(true));
      this.life.listen(this.range, "pointercancel", () => this.finish(false));
      this.life.listen(this.range, "blur", () => this.finish(true));
      // Native ranges fire change after every keyboard step. Keep keyboard editing
      // open until blur/Enter, so Escape can cancel the entire focus session.
      this.life.listen(this.range, "keydown", (e) => {
        if (e.key === "Escape") {
          if (escape === "bubble") return;
          e.preventDefault();
          e.stopPropagation();
          this.finish(false);
          this.range.blur();
        }
        if (e.key === "Enter") this.range.blur();
      });
    }
  }
  /** Logarithmic tracks are opt-in and require strictly positive bounds. */
  fromUnit(t) {
    return rangeValue(this.slider, t);
  }
  toUnit(v) {
    return rangeUnit(this.slider, v);
  }
  /** External configuration refreshes never replace in-progress typing or slider gestures. */
  setValue(value, force = false) {
    if (this.active && !force) return;
    this.value = value;
    this.input.value = Number(value.toPrecision(10));
    this.input.setCustomValidity("");
    this.paint();
  }
  /** Fill and accessible range text derive from the same retained numeric value. */
  paint() {
    if (this.range) {
      const t = this.toUnit(this.value);
      this.range.value = t;
      this.range.setAttribute("aria-valuetext", String(this.value));
      this.element.style.setProperty("--number-fill", `${t * 100}%`);
    }
  }
  /** Close ownership before host callbacks, which may synchronously replace this control. */
  finish(commit) {
    if (!this.active) return;
    this.active = false;
    commit =
      commit &&
      this.input.validity.valid &&
      (!this.changed || this.value !== this.before);
    if (!commit) this.setValue(this.before, true);
    this.callbacks.onFinish(commit);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.life.dispose();
    this.finish(false);
    this.element.remove();
  }
}
