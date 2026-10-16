/** Penthouse / reusable mouse, pen and touch viewport navigation over Basement camera math.
 * The caller supplies scheduling and edit interruption; this control never owns a frame loop.
 * Capture-phase arbitration prevents a navigation pointer from also selecting/placing an asset. */
import { Lifetime } from "../basement/lifetime.js";
import { CameraNavigation } from "../basement/camera-navigation.js";
export class ViewportNavigation {
  /** enabled/mode are live context queries; interrupt rolls back an in-progress object edit. */
  constructor({
    canvas,
    camera,
    host = window,
    subscribe,
    enabled = () => true,
    mode = () => "edit",
    interrupt = () => {},
  }) {
    this.canvas = canvas;
    this.motion = new CameraNavigation(camera);
    this.enabled = enabled;
    this.mode = mode;
    this.interrupt = interrupt;
    this.life = new Lifetime();
    this.touches = new Map();
    this.drag = null;
    this.blocked = false;
    this.dirty = false;
    try {
      this.life.listen(canvas, "pointerdown", (e) => this.down(e), true);
      this.life.listen(canvas, "pointermove", (e) => this.move(e), true);
      this.life.listen(canvas, "pointerup", (e) => this.up(e), true);
      this.life.listen(
        canvas,
        "pointercancel",
        (e) => {
          if (this.owns(e.pointerId) && (this.drag || this.blocked)) {
            this.swallow(e);
            this.cancel();
          } else this.touches.delete(e.pointerId);
        },
        true,
      );
      this.life.listen(
        canvas,
        "lostpointercapture",
        (e) => {
          if (
            this.owns(e.pointerId) &&
            !canvas.hasPointerCapture(e.pointerId)
          ) {
            if (this.drag || this.blocked) this.cancel();
            else this.touches.delete(e.pointerId);
          }
        },
        true,
      );
      this.life.listen(
        canvas,
        "wheel",
        (e) => {
          if (!enabled()) return;
          this.cancel();
          interrupt();
          this.swallow(e);
          const p = this.point(e),
            unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? p.height : 1;
          this.motion.zoom(
            Math.exp(Math.max(-2, Math.min(2, e.deltaY * unit * 0.001))),
            p.x,
            p.y,
            p.width,
            p.height,
          );
        },
        { capture: true, passive: false },
      );
      this.life.listen(host, "blur", () => this.cancel());
      this.life.own(subscribe(() => this.flush()));
    } catch (error) {
      // A rejected scheduler registration must not leave listeners on a half-built control.
      this.life.dispose();
      throw error;
    }
  }
  /** Surface coordinates stay in CSS pixels, independent of the renderer's pixel-ratio cap. */
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      width: Math.max(1, r.width),
      height: Math.max(1, r.height),
    };
  }
  swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  owns(id) {
    return this.drag?.pointer === id || this.touches.has(id);
  }
  /** Snapshot a gesture once; pending changes coalesce through the caller's input phase. */
  start(kind, pointer, previous) {
    this.interrupt();
    this.drag = { kind, pointer, previous, pose: this.motion.snapshot() };
    this.dirty = false;
  }
  /** The midpoint/distance describe two fingers without accumulating per-event scale errors. */
  pair() {
    const [a, b] = this.touches.values();
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      width: a.width,
      height: a.height,
    };
  }
  down(e) {
    if (!this.enabled()) return;
    if (e.pointerType === "touch") {
      if (this.touches.size >= 2) {
        this.swallow(e);
        return;
      }
      this.touches.set(e.pointerId, this.point(e));
      if (this.touches.size === 2) {
        this.flush();
        this.cancelDrag();
        this.start("pinch", null, this.pair());
        this.blocked = true;
        for (const id of this.touches.keys()) this.canvas.setPointerCapture(id);
        this.swallow(e);
        return;
      }
      if (this.blocked) {
        this.swallow(e);
        return;
      }
    }
    const mode = this.mode(),
      kind =
        e.button === 1
          ? e.shiftKey
            ? "pan"
            : "orbit"
          : e.button === 2
            ? "pan"
            : e.button === 0 && e.altKey
              ? "orbit"
              : e.button === 0 && ["orbit", "pan"].includes(mode)
                ? mode
                : null;
    if (!kind || this.drag) return;
    this.start(kind, e.pointerId, this.point(e));
    this.canvas.setPointerCapture(e.pointerId);
    this.swallow(e);
  }
  move(e) {
    if (this.touches.has(e.pointerId))
      this.touches.set(e.pointerId, this.point(e));
    if (this.drag?.kind === "pinch" || this.drag?.pointer === e.pointerId) {
      this.dirty = true;
      this.latest = this.point(e);
      this.swallow(e);
    } else if (this.blocked && this.touches.has(e.pointerId)) this.swallow(e);
  }
  /** Consume only the latest positions; final pointerup also flushes the exact endpoint. */
  flush() {
    const d = this.drag;
    if (!d || !this.dirty) return;
    if (!this.enabled()) {
      this.cancel();
      return;
    }
    this.dirty = false;
    const p = d.kind === "pinch" ? this.pair() : this.latest,
      old = d.previous;
    if (d.kind === "pinch") {
      this.motion.zoom(
        old.distance / p.distance,
        old.x,
        old.y,
        p.width,
        p.height,
      );
      this.motion.pan(p.x - old.x, p.y - old.y, p.width, p.height);
    } else if (d.kind === "orbit") this.motion.orbit(p.x - old.x, p.y - old.y);
    else this.motion.pan(p.x - old.x, p.y - old.y, p.width, p.height);
    d.previous = p;
  }
  up(e) {
    if (!this.owns(e.pointerId)) {
      if (this.drag || this.blocked) this.swallow(e);
      return;
    }
    const navigating =
      this.drag?.kind === "pinch" ||
      this.drag?.pointer === e.pointerId ||
      this.blocked;
    if (this.touches.has(e.pointerId))
      this.touches.set(e.pointerId, this.point(e));
    if (navigating) {
      if (this.drag) {
        this.latest = this.point(e);
        this.dirty = true;
        this.flush();
      }
      this.drag = null;
      this.dirty = false;
      this.swallow(e);
    }
    this.touches.delete(e.pointerId);
    if (!this.touches.size) this.blocked = false;
    if (navigating && this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
  }
  /** A second touch transitions from explicit one-finger navigation using its current pose. */
  cancelDrag() {
    this.drag = null;
    this.dirty = false;
  }
  /** Escape/context loss restores the gesture's starting camera and releases every capture. */
  cancel() {
    const d = this.drag,
      ids = new Set(this.touches.keys());
    if (d?.pointer !== null && d?.pointer !== undefined) ids.add(d.pointer);
    if (d) this.motion.restore(d.pose);
    this.drag = null;
    this.dirty = false;
    this.touches.clear();
    this.blocked = false;
    for (const id of ids)
      if (this.canvas.hasPointerCapture(id))
        this.canvas.releasePointerCapture(id);
  }
  dispose() {
    this.cancel();
    this.life.dispose();
  }
}
