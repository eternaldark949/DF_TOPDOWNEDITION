/**
 * Lobby / runtime: sole animation-frame owner, explicit phases, and pause reasons.
 * All elapsed values are seconds. The engine advances fixed simulation steps and
 * interpolates render poses; long browser suspensions never trigger unlimited work.
 */
import { PreparationQueue } from './preparation.js';

export class Runtime {
  /** Inject scheduling for deterministic lifecycle tests; browser defaults allocate no loop yet. */
  constructor({ request = cb => requestAnimationFrame(cb), cancel = id => cancelAnimationFrame(id), step = 1 / 60, maxSteps = 5 } = {}) {
    this.request = request; this.cancel = cancel; this.step = step; this.maxSteps = maxSteps;
    this.preparation = new PreparationQueue();
    this.phases = { boundary: new Set(), input: new Set(), update: new Set(), render: new Set(), pause: new Set() };
    this.reasons = new Set(); this.running = false; this.disposed = false;
    this.frameId = null; this.last = null; this.accumulator = 0; this.time = 0;
    this.stats = { frames: 0, steps: 0, droppedSeconds: 0 };
    this.tick = this.tick.bind(this);
  }

  /** Register a phase callback. Return an idempotent remover owned by the caller's lifetime. */
  on(phase, callback) {
    if (this.disposed) throw new Error('Runtime is disposed');
    const list = this.phases[phase];
    if (!list) throw new Error(`Unknown runtime phase: ${phase}`);
    list.add(callback);
    return () => list.delete(callback);
  }

  /** Emit in registration order. Callback owners must remove registrations on scene disposal. */
  emit(phase, ...args) { for (const callback of this.phases[phase]) callback(...args); }

  /** Repeated start calls are harmless; stopped runtime preserves simulation time. */
  start() {
    if (this.disposed) throw new Error('Runtime is disposed');
    if (this.running) return;
    this.running = true; this.last = null; this.frameId = this.request(this.tick);
  }

  /** Cancel the only outstanding frame; reset interpolation debt on the next start. */
  stop() {
    if (!this.running) return;
    this.running = false; this.cancel(this.frameId); this.frameId = null;
    this.last = null; this.accumulator = 0;
  }

  /**
   * Add/remove an owned pause reason. Removing a menu pause cannot remove focus pause.
   * Reset wall-clock debt at transitions, keeping the paused pose fully resolved.
   */
  pause(reason, active = true) {
    const wasPaused = this.reasons.size > 0;
    if (active) this.reasons.add(reason); else this.reasons.delete(reason);
    if (wasPaused !== (this.reasons.size > 0)) {
      this.last = null; this.accumulator = 0; this.emit('pause', this.reasons.size > 0);
    }
  }

  /** Execute budgeted preparation -> input -> boundary/fixed updates -> interpolated render. */
  tick(milliseconds) {
    if (!this.running) return;
    this.frameId = null;
    try {
      const elapsed = this.last === null ? 0 : Math.max(0, (milliseconds - this.last) / 1000);
      this.last = milliseconds;
      if (!this.reasons.size) this.preparation.advance();
      this.emit('input');
      if (!this.reasons.size) {
        const admitted = Math.min(elapsed, this.step * this.maxSteps);
        this.stats.droppedSeconds += elapsed - admitted;
        this.accumulator += admitted;
        let count = 0;
        while (this.accumulator + 1e-10 >= this.step && count < this.maxSteps) {
          this.emit('boundary', this.time);
          this.emit('update', this.step, this.time);
          this.accumulator = Math.max(0, this.accumulator - this.step);
          this.time += this.step; this.stats.steps++; count++;
        }
      }
      this.emit('render', this.reasons.size ? 1 : this.accumulator / this.step, this.time);
      this.stats.frames++;
    } catch (error) {
      this.running = false; this.last = null; throw error;
    }
    if (this.running) this.frameId = this.request(this.tick);
  }

  /** Stop scheduling and remove registrations, allowing the composed engine to release resources. */
  dispose() {
    if (this.disposed) return;
    this.stop(); this.preparation.dispose(); this.disposed = true;
    for (const phase of Object.values(this.phases)) phase.clear();
    this.reasons.clear();
  }
}
