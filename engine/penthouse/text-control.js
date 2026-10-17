/** Penthouse / shared precise text session. Rename fields share validation, history
 * grouping and cancellation rather than reimplementing those rules in each inspector. */
import { Lifetime } from "../basement/lifetime.js";
export class TextControl {
  constructor({
    host,
    label,
    value,
    maxLength = 120,
    disabled = false,
    onBegin,
    onPreview,
    onFinish,
    onError,
  }) {
    this.life = new Lifetime();
    this.active = false;
    this.onFinish = onFinish;
    this.value = value;
    const wrap = document.createElement("label");
    wrap.className = "property-text";
    wrap.textContent = label;
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.maxLength = maxLength;
    this.input.value = value;
    this.input.disabled = disabled;
    this.input.setAttribute("aria-label", label);
    wrap.append(this.input);
    host.append(wrap);
    this.life.listen(this.input, "focus", () => {
      onBegin();
      this.active = true;
    });
    this.life.listen(this.input, "input", () => {
      try {
        onPreview(this.input.value);
        this.input.setCustomValidity("");
      } catch (e) {
        this.input.setCustomValidity(e.message);
      }
    });
    this.life.listen(this.input, "blur", () => {
      if (!this.active) return;
      const valid = this.input.validity.valid,
        message = this.input.validationMessage;
      this.finish(valid);
      if (!valid) onError(new Error(message));
    });
    this.life.listen(this.input, "keydown", (e) => {
      if (e.key === "Enter") this.input.blur();
      if (e.key === "Escape") {
        e.preventDefault();
        this.finish(false);
        this.input.value = value;
        this.input.blur();
      }
    });
  }
  finish(commit) {
    if (!this.active) return;
    this.active = false;
    this.onFinish(commit);
  }
  dispose() {
    this.life.dispose();
    this.finish(false);
  }
}
