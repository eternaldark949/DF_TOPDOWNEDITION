/** Studio / the shared action boundary for Viewport shortcuts and detailed settings.
 * Panel visibility belongs to PanelDock; camera/guide state remains with its existing
 * owners. This controller has no document edits, renderer passes or scheduler. */
import { Lifetime } from "../../engine/basement/lifetime.js";
export class ViewportPanel {
  /** Borrow one workspace; callers retain camera, preferences, icons and framing policies. */
  constructor({
    root,
    viewport,
    renderer,
    preferences,
    icons,
    frameSelection,
    frameAll,
    reset,
    onError,
  }) {
    Object.assign(this, { root, viewport, renderer, preferences, icons });
    this.life = new Lifetime();
    try {
      const $ = (id) => root.querySelector("#" + id);
      this.lens = $("lens");
      this.projection = $("projection");
      this.fov = $("fov");
      /** Every copy of a command calls the same function; no synthetic click forwarding. */
      const commands = {
        lens: () =>
          renderer.camera.setProjection(
            renderer.camera.projection === "perspective"
              ? "orthographic"
              : "perspective",
          ),
        grid: () => this.toggle("grid"),
        axes: () => this.toggle("axes"),
        outlines: () => this.toggle("outlines"),
        lights: () => this.toggle("lights"),
        frame: frameSelection,
        frameAll,
        reset,
        left: () => viewport.navigation.motion.orbit(15, 0),
        right: () => viewport.navigation.motion.orbit(-15, 0),
        zoomIn: () => this.zoom(1 / 1.2),
        zoomOut: () => this.zoom(1.2),
      };
      /** Match the application's error policy and finish pending gestures before view changes. */
      const act = (fn) => () => {
        try {
          viewport.cancel();
          fn();
          this.sync();
        } catch (error) {
          onError(error);
        }
      };
      for (const button of root.querySelectorAll("[data-view-command]"))
        this.life.listen(
          button,
          "click",
          act(commands[button.dataset.viewCommand]),
        );
      this.life.listen(
        this.projection,
        "change",
        act(() => renderer.camera.setProjection(this.projection.value)),
      );
      this.life.listen(
        this.fov,
        "change",
        act(() => {
          const value = Number(this.fov.value);
          if (!Number.isFinite(value) || !this.fov.value) {
            this.fov.value = (renderer.camera.fov * 180) / Math.PI;
            throw new Error("Field of view must be a number");
          }
          renderer.camera.fov =
            (Math.max(15, Math.min(110, value)) * Math.PI) / 180;
          this.fov.value = (renderer.camera.fov * 180) / Math.PI;
        }),
      );
      this.life.listen(
        $("view"),
        "change",
        act(() => renderer.camera.preset($("view").value)),
      );
      this.life.listen(
        $("snap"),
        "change",
        act(() => {
          viewport.snap = Number($("snap").value);
        }),
      );
      // Native details remain usable without a tab system. The small section shortcuts
      // open one group directly, so Appearance never requires scrolling past camera fields.
      this.sections = new Map(
        [...root.querySelectorAll("[data-viewport-section]")].map((button) => {
          const host = $(button.dataset.viewportSection),
            details = host.matches("details")
              ? host
              : host.querySelector("details");
          this.life.listen(
            button,
            "click",
            act(() => {
              this.openSection(details);
              $("viewport-options").scrollTop = 0;
            }),
          );
          this.life.listen(details, "toggle", () => {
            if (details.open) this.openSection(details);
            this.syncSections();
          });
          return [details, button];
        }),
      );
      this.syncSections();
      this.sync();
    } catch (error) {
      this.life.dispose();
      throw error;
    }
  }
  /** Explicit accordion behavior also works in browsers without native details grouping. */
  openSection(selected) {
    for (const details of this.sections.keys())
      details.open = details === selected;
    this.syncSections();
  }
  /** Section navigation is view state and exposes the same open state as its native summary. */
  syncSections() {
    for (const [details, button] of this.sections)
      button.setAttribute("aria-pressed", String(details.open));
  }
  /** Preferences persist separately from JSON; all guide controls reflect one source. */
  toggle(key) {
    this.preferences.set(key, !this.preferences.value[key]);
    this.viewport.showLights = this.preferences.value.lights;
  }
  /** Zoom about the actual canvas centre under either lens and any responsive layout. */
  zoom(factor) {
    const c = this.renderer.canvas;
    this.viewport.navigation.motion.zoom(
      factor,
      c.clientWidth / 2,
      c.clientHeight / 2,
      c.clientWidth,
      c.clientHeight,
    );
  }
  /** Called by actions and Studio's existing 4Hz status subscription, never a new loop.
   * Do not overwrite focused FOV typing when a camera status update arrives. */
  sync() {
    const camera = this.renderer.camera,
      perspective = camera.projection === "perspective";
    this.icons.set(
      this.lens,
      camera.projection,
      perspective ? "Perspective" : "Orthographic",
      { compact: true },
    );
    this.lens.setAttribute("aria-pressed", String(perspective));
    this.projection.value = camera.projection;
    this.fov.disabled = !perspective;
    if (this.fov.ownerDocument.activeElement !== this.fov)
      this.fov.value = Number(((camera.fov * 180) / Math.PI).toFixed(2));
    for (const key of ["grid", "lights", "axes", "outlines"])
      for (const button of this.root.querySelectorAll(
        `[data-view-command=${key}]`,
      ))
        button.setAttribute(
          "aria-pressed",
          String(this.preferences.value[key]),
        );
  }
  /** The host retains the controls; this owner releases only its event registrations. */
  dispose() {
    this.life.dispose();
  }
}
