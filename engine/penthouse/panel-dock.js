/** Penthouse / labelled diamond panel controls. The host supplies panels and layout policy;
 * no project, game DOM IDs, renderer, document history or frame scheduler lives here. */
import { Lifetime } from "../basement/lifetime.js";
export class PanelDock {
  /** Each layout owns its visibility set, so a phone resize cannot erase desktop choices. */
  constructor({ root, entries, compact, defaults, onBeforeChange = () => {} }) {
    entries = entries.map((e) => ({ ...e }));
    this.root = root;
    this.entries = entries;
    this.compact = compact;
    this.onBeforeChange = onBeforeChange;
    this.life = new Lifetime();
    this.blocked = false;
    this.disposed = false;
    this.layouts = {
      wide: new Set(defaults.wide),
      compact: new Set(defaults.compact),
    };
    const keys = new Set();
    for (const e of entries) {
      if (!/^[a-z]+$/.test(e.key) || keys.has(e.key) || !e.panel.id)
        throw new Error("Panel keys and DOM identities must be unique");
      keys.add(e.key);
    }
    for (const set of Object.values(this.layouts))
      for (const key of set)
        if (!keys.has(key)) throw new Error("Unknown default panel");
    for (const e of entries) {
      e.original = {
        inert: e.panel.inert,
        aria: e.panel.getAttribute("aria-hidden"),
      };
      e.panel.classList.add("dock-panel");
      const button = document.createElement("button");
      e.button = button;
      button.type = "button";
      button.className = "panel-control";
      button.dataset.panelToggle = e.key;
      button.dataset.side = e.side;
      button.setAttribute("aria-controls", e.panel.id);
      const diamond = document.createElement("span");
      diamond.className = "panel-diamond";
      diamond.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "panel-control-label";
      label.textContent = e.label;
      button.append(diamond, label);
      root.append(button);
      this.life.listen(button, "click", () =>
        this.setOpen(e.key, !this.current.has(e.key)),
      );
    }
    this.life.listen(compact, "change", () => {
      const active = document.activeElement;
      this.onBeforeChange();
      this.sync(active);
    });
    // Escape closes a panel without interfering with numeric/text edit cancellation.
    this.life.listen(root, "keydown", (event) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.target.closest("input,select,textarea,[contenteditable]")
      )
        return;
      const e = entries.find(
        (e) => e.panel.contains(event.target) || e.button === event.target,
      );
      if (e && this.current.has(e.key)) {
        event.preventDefault();
        this.setOpen(e.key, false);
      }
    });
    this.sync();
  }
  /** View state only: compact uses one panel at a time, while wide allows both. */
  get current() {
    return this.layouts[this.compact.matches ? "compact" : "wide"];
  }
  setOpen(key, open) {
    if (this.disposed || this.blocked) return;
    if (!this.entries.some((e) => e.key === key))
      throw new Error("Unknown panel");
    if (this.current.has(key) === open) return;
    const active = document.activeElement;
    this.onBeforeChange();
    if (open) {
      if (this.compact.matches) this.current.clear();
      this.current.add(key);
    } else this.current.delete(key);
    this.sync(active);
  }
  /** Placement mode can reclaim the whole viewport through one explicit host command. */
  closeAll() {
    if (this.disposed || this.blocked || !this.current.size) return;
    const active = document.activeElement;
    this.onBeforeChange();
    this.current.clear();
    this.sync(active);
  }
  /** Play temporarily hides controls/panels, preserving each layout's editing choices. */
  suspend(value) {
    if (this.disposed || this.blocked === value) return;
    this.onBeforeChange();
    this.blocked = value;
    this.sync();
  }
  /** Accessibility and CSS derive from exactly the same state; no independent body flags. */
  sync(active = document.activeElement) {
    this.root.dataset.compact = String(this.compact.matches);
    for (const e of this.entries) {
      const open = !this.blocked && this.current.has(e.key);
      this.root.dataset[e.key + "Open"] = String(open);
      e.panel.dataset.panelOpen = String(open);
      e.panel.inert = !open;
      e.panel.setAttribute("aria-hidden", String(!open));
      e.button.hidden = this.blocked;
      e.button.setAttribute("aria-expanded", String(open));
      e.button.setAttribute(
        "aria-label",
        `${open ? "Hide" : "Show"} ${e.label}`,
      );
      e.button.title = `${open ? "Hide" : "Show"} ${e.label}`;
      if (!open && e.panel.contains(active) && !this.blocked)
        e.button.focus({ preventScroll: true });
    }
  }
  /** Release listeners and DOM owned by this widget; an application may mount a fresh dock. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.life.dispose();
    for (const e of this.entries) {
      e.button.remove();
      e.panel.classList.remove("dock-panel");
      delete e.panel.dataset.panelOpen;
      e.panel.inert = e.original.inert;
      if (e.original.aria === null) e.panel.removeAttribute("aria-hidden");
      else e.panel.setAttribute("aria-hidden", e.original.aria);
      delete this.root.dataset[e.key + "Open"];
    }
    delete this.root.dataset.compact;
  }
}
