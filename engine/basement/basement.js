/**
 * Basement assembly: owns only foundational capabilities, never a particular game.
 * Read world/input/renderer for implementation; this small owner connects their lifetimes.
 */
import { Identities, World } from './world.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';

export class Basement {
  /** Renderer first: unsupported WebGL fails before device listeners are installed. */
  constructor(canvas, options) {
    this.identities = new Identities();
    this.renderer = new Renderer(canvas, options);
    try { this.input = new Input(canvas); }
    catch (error) { this.renderer.dispose(); throw error; }
  }
  /** Empty worlds have no game content and allocate no GPU batch until requested. */
  createWorld() { return new World(this.identities.create('world'), this.identities); }
  /** Release devices before the surface resources they target. */
  dispose() { this.input.dispose(); this.renderer.dispose(); }
}
