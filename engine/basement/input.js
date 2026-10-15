/**
 * Basement / input: keyboard, pointer, touch-control sources, and gamepad actions.
 * Games supply maps; this module never interprets "move" or "interact" as game rules.
 * Vector sources combine by strongest magnitude (no diagonal/duplicate speed boost).
 * Button sources OR together; press edges are consumed once, even during catch-up.
 */
import { Lifetime } from './lifetime.js';

export class Input {
  /** Bind to the supplied surface/window, and an injectable gamepad reader for tests. */
  constructor(surface, { host = window, gamepads = () => navigator.getGamepads?.() ?? [] } = {}) {
    this.surface = surface; this.host = host; this.gamepads = gamepads;
    this.life = new Lifetime(); this.keys = new Set(); this.pointers = new Set();
    this.map = {}; this.sources = new Map(); this.actions = new Map(); this.pendingPresses = new Set();
    this.pointer = { x: 0, y: 0, active: false }; this.disposed = false;
    this.suspended = false;
    // Ignore keyboard input intended for editable HTML fields, including on key repeat.
    this.life.listen(host, 'keydown', event => {
      if (event.target?.closest?.('input,textarea,select,[contenteditable=true]')) return;
      if (this.usesKey(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) {
        this.latch(map => map.keys?.includes(event.code));
      }
      this.keys.add(event.code);
    });
    this.life.listen(host, 'keyup', event => this.keys.delete(event.code));
    this.life.listen(host, 'blur', () => this.clear());
    this.life.listen(surface, 'pointermove', event => {
      const r = surface.getBoundingClientRect();
      this.pointer.x = event.clientX - r.left; this.pointer.y = event.clientY - r.top;
      this.pointer.active = true;
    });
    this.life.listen(surface, 'pointerleave', () => { this.pointer.active = false; });
    this.life.listen(surface, 'pointerdown', event => {
      if (!this.pointers.has(event.button)) this.latch(map => map.pointerButtons?.includes(event.button));
      this.pointers.add(event.button); surface.setPointerCapture?.(event.pointerId);
    });
    this.life.listen(surface, 'pointerup', event => this.pointers.delete(event.button));
    this.life.listen(surface, 'pointercancel', () => this.pointers.clear());
    this.life.listen(surface, 'lostpointercapture', () => this.pointers.clear());
    this.life.listen(surface, 'contextmenu', event => event.preventDefault());
    this.life.listen(host, 'gamepaddisconnected', () => this.sample());
  }

  /** Does this map own a key? Used to avoid scrolling while playing, not globally. */
  usesKey(code) {
    return Object.values(this.map).some(m => m.keys?.includes(code)
      || m.negativeX?.includes(code) || m.positiveX?.includes(code)
      || m.negativeY?.includes(code) || m.positiveY?.includes(code));
  }

  /** Replace bindings between scenes; clear held actions so old rules cannot leak. */
  bind(map) { this.clear(); this.map = map; this.actions.clear(); }

  /**
   * Check current physical contributions rather than the last frame's cached action.
   * This distinguishes a genuine new tap after release from a second binding pressed
   * while another source is still held, even if both events fall between frames.
   */
  buttonHeld(name) {
    const map = this.map[name];
    if (!map || map.kind === 'vector') return false;
    if (map.keys?.some(key => this.keys.has(key)) || map.pointerButtons?.some(button => this.pointers.has(button))) return true;
    for (const source of this.sources.values()) if (source.action === name && source.x > 0) return true;
    return [...this.gamepads()].some(pad => pad?.connected && map.buttons?.some(button => pad.buttons[button]?.pressed));
  }

  /** Preserve brief presses between frames; held/overlapping bindings cannot create extra edges. */
  latch(matches) {
    if (this.suspended || this.disposed) return;
    for (const [name, map] of Object.entries(this.map)) {
      if (map.kind !== 'vector' && matches(map) && !this.buttonHeld(name)) this.pendingPresses.add(name);
    }
  }

  /** Set one template's action contribution. Each control must use a unique source ID. */
  setSource(sourceId, action, x, y = 0) {
    if (this.disposed || this.suspended) return;
    const previous = this.sources.get(sourceId);
    if (x > 0 && !(previous?.x > 0) && this.map[action]?.kind !== 'vector' && !this.buttonHeld(action)) {
      this.pendingPresses.add(action);
    }
    this.sources.set(sourceId, { action, x, y });
  }

  /** Remove only this control's contribution; other fingers/devices remain independent. */
  removeSource(sourceId) { this.sources.delete(sourceId); }

  /** Build action state once per presentation frame, preserving edges until consumed. */
  sample() {
    if (this.disposed || this.suspended) return;
    const pads = [...this.gamepads()].filter(p => p?.connected);
    for (const [name, map] of Object.entries(this.map)) {
      let state = this.actions.get(name);
      if (!state) { state = { x: 0, y: 0, down: false, pressed: false }; this.actions.set(name, state); }
      let x = 0, y = 0;
      if (map.kind === 'vector') {
        x = Number(map.positiveX?.some(k => this.keys.has(k)) ?? false)
          - Number(map.negativeX?.some(k => this.keys.has(k)) ?? false);
        y = Number(map.positiveY?.some(k => this.keys.has(k)) ?? false)
          - Number(map.negativeY?.some(k => this.keys.has(k)) ?? false);
      } else {
        x = Number((map.keys?.some(k => this.keys.has(k)) ?? false)
          || (map.pointerButtons?.some(b => this.pointers.has(b)) ?? false));
      }
      // Standard gamepad layout is the initial policy. Exotic mapping/calibration is open.
      for (const pad of pads) {
        if (map.kind === 'vector' && map.axes) {
          let px = pad.axes[map.axes[0]] ?? 0, py = pad.axes[map.axes[1]] ?? 0;
          const length = Math.hypot(px, py), dead = map.deadZone ?? 0.18;
          if (length <= dead) { px = 0; py = 0; }
          else { const scale = Math.min(1, (length - dead) / (1 - dead)) / length; px *= scale; py *= scale; }
          if (Math.hypot(px, py) > Math.hypot(x, y)) { x = px; y = py; }
        } else if (map.buttons?.some(b => pad.buttons[b]?.pressed)) x = 1;
      }
      for (const source of this.sources.values()) {
        if (source.action !== name) continue;
        if (map.kind === 'vector') {
          if (Math.hypot(source.x, source.y) > Math.hypot(x, y)) { x = source.x; y = source.y; }
        } else x = Math.max(x, source.x);
      }
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      const down = length > 0.001;
      if ((down && !state.down) || this.pendingPresses.has(name)) state.pressed = true;
      state.x = x; state.y = y; state.down = down;
    }
    this.pendingPresses.clear();
  }

  /** Read without allocating; unknown actions share an immutable zero state. */
  read(name) { return this.actions.get(name) ?? ZERO_ACTION; }

  /** Consume a press once. Use this for toggles, not continuously held movement. */
  consume(name) {
    const state = this.actions.get(name), pressed = state?.pressed ?? false;
    if (state) state.pressed = false;
    return pressed;
  }

  /** Clear physical and logical states on focus loss, pause, or action-map replacement. */
  clear() {
    this.keys.clear(); this.pointers.clear(); this.sources.clear(); this.pendingPresses.clear(); this.pointer.active = false;
    for (const state of this.actions.values()) { state.x = state.y = 0; state.down = state.pressed = false; }
  }

  /** Pausing blocks new control contributions until resumed; UI pause buttons remain DOM-driven. */
  suspend(value) { this.suspended = value; this.clear(); }

  /** Remove exactly this instance's browser listeners; safe to call more than once. */
  dispose() { if (this.disposed) return; this.clear(); this.life.dispose(); this.disposed = true; }
}

/** Shared read-only fallback; callers must not mutate action state directly. */
const ZERO_ACTION = Object.freeze({ x: 0, y: 0, down: false, pressed: false });
