/**
 * ETRNLNINE: the small composition root. This is the source-reading entry point.
 * It assembles the house, connects shared contracts, and exposes lifecycle methods.
 * Scene content, controls, movement, HUD, and game rules belong to the caller.
 */
import { Basement } from './basement/basement.js';
import { Lifetime } from './basement/lifetime.js';
import { Runtime } from './lobby/runtime.js';
import { Directory } from './directory/directory.js';
import { Penthouse } from './penthouse/penthouse.js';

export class ETRNLNINE {
  /** Build an empty engine. No implicit game start or scene-specific allocations. */
  constructor(canvas, options = {}) {
    this.basement = new Basement(canvas, options);
    this.lobby = new Runtime(); this.directory = new Directory(); this.penthouse = new Penthouse();
    this.life = new Lifetime(); this.disposed = false;
    for (const [name, factory] of Object.entries(this.penthouse.libraries)) this.directory.register(name, factory);
    this.life.own(this.lobby.on('input', () => this.basement.input.sample()));
    this.life.own(this.lobby.on('pause', paused => this.basement.input.suspend(paused)));
    this.life.listen(document, 'visibilitychange', () => this.lobby.pause('document-hidden', document.hidden));
    this.life.listen(window, 'blur', () => this.lobby.pause('window-unfocused', true));
    this.life.listen(window, 'focus', () => this.lobby.pause('window-unfocused', false));
    // Context loss stops simulation as well as drawing. Restoration rebuilds renderer
    // resources before this listener removes its independent pause reason.
    this.life.listen(canvas, 'webglcontextlost', () => this.lobby.pause('gpu-context', true));
    this.life.listen(canvas, 'webglcontextrestored', () => this.lobby.pause('gpu-context', false));
    this.lobby.pause('document-hidden', document.hidden);
  }
  /** Start/resume the scheduler; no new loop is created by repeated calls. */
  start() { this.lobby.start(); }
  /** Stop scheduling without discarding world or device state. */
  stop() { this.lobby.stop(); this.basement.input.clear(); }
  /** Release registrations first, then loop, worlds/resources, and foundational capabilities. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.life.dispose(); this.lobby.dispose();
    this.directory.dispose(); this.basement.dispose();
  }
}
