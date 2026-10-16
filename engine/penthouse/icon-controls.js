/** Penthouse / accessible SVG control decoration. The injected catalog contains only
 * path data; no editor IDs, app actions, frame loop or global sprite registry lives here. */
export class IconControls {
  /** Borrow controls, preserving their original content and accessible labels for disposal. */
  constructor(library) {
    this.library = library;
    this.controls = new Map();
    this.disposed = false;
  }

  /** Create a decorative vector. A button's text/aria-label carries its accessible name. */
  vector(name, doc) {
    if (!Object.hasOwn(this.library, name))
      throw new Error(`Unknown workspace icon: ${name}`);
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    }))
      svg.setAttribute(key, value);
    svg.classList.add("workspace-icon");
    svg.dataset.icon = name;
    const path = doc.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", this.library[name]);
    svg.append(path);
    return svg;
  }

  /** Decorate once, then update only changed icon/label values (e.g. Play/Stop or lens).
   * Icon-only controls retain their text in the accessibility tree and a native tooltip. */
  set(element, name, label, { compact = false } = {}) {
    if (this.disposed) throw new Error("Icon controls disposed");
    if (!Object.hasOwn(this.library, name))
      throw new Error(`Unknown workspace icon: ${name}`);
    let record = this.controls.get(element);
    if (!record) {
      record = {
        nodes: [...element.childNodes],
        aria: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        compact: element.classList.contains("icon-only"),
        decorated: element.classList.contains("icon-control"),
      };
      record.caption = element.ownerDocument.createElement("span");
      record.caption.className = "control-caption";
      element.replaceChildren(record.caption);
      element.classList.add("icon-control");
      this.controls.set(element, record);
    }
    if (record.name !== name) {
      const next = this.vector(name, element.ownerDocument);
      if (record.svg) record.svg.replaceWith(next);
      else element.prepend(next);
      record.svg = next;
      record.name = name;
    }
    if (record.label !== label) {
      record.caption.textContent = label;
      record.label = label;
    }
    element.classList.toggle("icon-only", compact);
    element.setAttribute("aria-label", record.aria ?? label);
    if (!record.title) element.title = label;
  }

  /** Restore borrowed DOM exactly; no surviving listeners or generated SVG IDs exist. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [element, r] of this.controls) {
      element.replaceChildren(...r.nodes);
      element.classList.toggle("icon-only", r.compact);
      element.classList.toggle("icon-control", r.decorated);
      for (const [key, value] of [
        ["aria-label", r.aria],
        ["title", r.title],
      ]) {
        if (value === null) element.removeAttribute(key);
        else element.setAttribute(key, value);
      }
    }
    this.controls.clear();
  }
}
