/**
 * Penthouse / common accessible property controls, reused for entities and lights.
 * A focus session groups previews into one command. Escape cancels; blur commits.
 * All listeners belong to this panel and disappear when selection/context changes.
 */
import { NumberControl } from "./number-control.js";
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
    disabled = false,
  }) {
    this.life = new Lifetime();

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
        color.pill.disabled = disabled;
        color.pill.dataset.colorKey = descriptor.key;
        this.life.own(() => color.dispose());
        host.append(fieldset);
        continue;
      }
      values.forEach((_v, i) => {
        const label = document.createElement("label");
        label.textContent = descriptor.components?.[i] ?? descriptor.label;
        const control = new NumberControl({
          host: label,
          label:
            `${descriptor.label} ${descriptor.components?.[i] ?? ""}`.trim(),
          value: values[i],
          min: descriptor.min,
          max: descriptor.max,
          step: descriptor.step,
          slider: descriptor.slider,
          disabled,
          onBegin: () => {
            doc.cancel();
            doc.begin(descriptor.label);
          },
          onPreview: (n) => {
            const current = readProperty(resolve(doc.data), descriptor),
              next = Array.isArray(current) ? current : [current];
            next[i] = n;
            doc.preview((data) =>
              writeProperty(
                resolve(data),
                descriptor,
                descriptor.components ? next : next[0],
              ),
            );
          },
          onFinish: (commit) => {
            if (commit) doc.commit();
            else doc.cancel();
          },
          onError,
        });
        fieldset.append(label);
        this.life.own(() => control.dispose());
      });
      host.append(fieldset);
    }
  }
  /** Finalize ownership before rebuilding the DOM; cancellation is explicit and reversible. */
  dispose() {
    this.life.dispose();
  }
}
