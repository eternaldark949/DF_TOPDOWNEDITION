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
  /** Build an empty engine, releasing earlier levels if a later constructor fails. */
  constructor(canvas, options = {}) {
    this.life=new Lifetime();this.disposed=false;
    try {
      this.basement = new Basement(canvas, options);
      this.life.own(()=>this.basement.dispose());
      this.directory = new Directory({profiler:this.basement.profiler});
      this.life.own(()=>this.directory.dispose());
      this.lobby = new Runtime({profiler:this.basement.profiler});
      this.life.own(()=>this.lobby.dispose());
      this.penthouse = new Penthouse();
      for (const [name, factory] of Object.entries(this.penthouse.libraries)) this.directory.register(name, factory);
      this.life.own(this.lobby.on('input', () => this.basement.input.sample(),'input.devices'));
      this.life.own(this.lobby.on('pause', paused => this.basement.input.suspend(paused)));
      this.life.listen(document, 'visibilitychange', () => this.lobby.pause('document-hidden', document.hidden));
      this.life.listen(window, 'blur', () => this.lobby.pause('window-unfocused', true));
      this.life.listen(window, 'focus', () => this.lobby.pause('window-unfocused', false));
      // Context loss stops simulation; restoration rebuilds renderer resources before
      // this listener removes its independent pause reason. No game restart is needed.
      this.life.listen(canvas, 'webglcontextlost', () => this.lobby.pause('gpu-context', true));
      this.life.listen(canvas, 'webglcontextrestored', () => this.lobby.pause('gpu-context', false));
      this.lobby.pause('document-hidden', document.hidden);
    } catch(error) { this.disposed=true;this.life.dispose();throw error; }
  }
  /** Start/resume the scheduler; repeated calls do not create another loop. */
  start() { this.lobby.start(); }
  /** Stop scheduling without discarding world or device state. */
  stop() { this.lobby.stop(); this.basement.input.clear(); }
  /** Release registrations, Lobby, Directory, then Basement in reverse acquisition order. */
  dispose() { if(this.disposed)return;this.disposed=true;this.life.dispose(); }
}
