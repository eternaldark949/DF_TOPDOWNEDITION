/**
 * Penthouse / common accessible property controls, reused for entities and lights.
 * A focus session groups previews into one command. Escape cancels; blur commits.
 * All listeners belong to this panel and disappear when selection/context changes.
 */
import { ColorControl } from "./color-control.js";
import { Lifetime } from "../basement/lifetime.js";
import { readProperty, writeProperty } from "../basement/properties.js";
export class PropertyInspector {
  /** Resolve the target afresh after undo/import, rather than holding a stale data object. */
  constructor({
    host,
    focusHost = host,
    document: doc,
    resolve,
    properties,
    onError,
  }) {
    this.life = new Lifetime();
    this.doc = doc;
    this.active = null;
    this.colors = [];
    for (const descriptor of properties) {
      const fieldset = document.createElement("fieldset"),
        legend = document.createElement("legend");
      legend.textContent = `${descriptor.label} · ${descriptor.unit}`;
      fieldset.append(legend);
      const value = readProperty(resolve(doc.data), descriptor),
        values = Array.isArray(value) ? value : [value];
      if (descriptor.color) {
        // The colour widget owns one modal transaction, independently of numeric focus sessions.
        const color = new ColorControl({
          host: fieldset,
          label: descriptor.label,
          value,
          max: descriptor.max,
          onBegin: () => {
            doc.cancel();
            doc.begin(descriptor.label);
          },
          onPreview: (next) =>
            doc.preview((data) =>
              writeProperty(resolve(data), descriptor, next),
            ),
          onFinish: (commit, restoreFocus) => {
            if (commit) doc.commit();
            else doc.cancel();
            // The host may defer a history rebuild until this event returns. Resolve
            // the replacement pill afterward through the supplied stable context.
            if (restoreFocus)
              queueMicrotask(() => {
                if (focusHost.isConnected)
                  [...focusHost.querySelectorAll("[data-color-key]")]
                    .find((el) => el.dataset.colorKey === descriptor.key)
                    ?.focus({ preventScroll: true });
              });
          },
          onError,
        });
        color.pill.dataset.colorKey = descriptor.key;
        this.colors.push(color);
        host.append(fieldset);
        continue;
      }
      values.forEach((_v, i) => {
        const label = document.createElement("label");
        label.textContent = descriptor.components?.[i] ?? descriptor.label;
        const input = document.createElement("input");
        input.type = "number";
        input.inputMode = "decimal";
        input.step = "any";
        input.dataset.increment = descriptor.step;
        input.min = descriptor.min;
        input.max = descriptor.max; // Suppress quaternion/Euler roundoff in the display without quantizing authored data.
        input.value = Number(values[i].toPrecision(10));
        input.setAttribute(
          "aria-label",
          `${descriptor.label} ${descriptor.components?.[i] ?? ""}`.trim(),
        );
        label.append(input);
        fieldset.append(label);
        this.life.listen(input, "focus", () => {
          doc.cancel();
          doc.begin(descriptor.label);
          this.active = input;
        });
        this.life.listen(input, "input", () => {
          try {
            const current = readProperty(resolve(doc.data), descriptor),
              next = Array.isArray(current) ? current : [current];
            if (input.value.trim() === "") {
              input.setCustomValidity("Enter a number");
              return;
            }
            next[i] = Number(input.value);
            doc.preview((data) =>
              writeProperty(
                resolve(data),
                descriptor,
                descriptor.components ? next : next[0],
              ),
            );
            input.setCustomValidity("");
          } catch (error) {
            input.setCustomValidity(error.message);
          }
        });
        this.life.listen(input, "blur", () => {
          if (this.active !== input) return;
          this.active = null;
          if (input.validity.valid) doc.commit();
          else {
            doc.cancel();
            onError(new Error(input.validationMessage));
          }
        });
        this.life.listen(input, "keydown", (event) => {
          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            input.value = String(
              Number(
                (
                  Number(input.value) +
                  (event.key === "ArrowUp" ? 1 : -1) * descriptor.step
                ).toFixed(6),
              ),
            );
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (event.key === "Escape") {
            doc.cancel();
            this.active = null;
            input.value = Array.isArray(value) ? value[i] : value;
            input.blur();
          }
          if (event.key === "Enter") input.blur();
        });
      });
      host.append(fieldset);
    }
  }
  /** Finalize ownership before rebuilding the DOM; cancellation is explicit and reversible. */
  dispose() {
    for (const color of this.colors) color.dispose();
    this.colors.length = 0;
    if (this.active) {
      this.active = null;
      this.doc.cancel();
    }
    this.life.dispose();
  }
}
