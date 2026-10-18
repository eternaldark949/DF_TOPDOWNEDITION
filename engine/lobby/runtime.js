/**
 * Lobby / runtime: sole animation-frame owner, explicit phases, and pause reasons.
 * All elapsed values are seconds. The engine advances fixed simulation steps and
 * interpolates render poses; long browser suspensions never trigger unlimited work.
 *
 * Phase order per frame: preparation → input → (boundary → update) × fixed steps →
 * animate → render. `animate(alpha, time)` runs once per frame, paused or not, after the
 * last simulation step and before anything draws: it is where skeletons are posed and
 * clips sampled, so every render callback sees finished joint palettes. It receives the
 * same interpolation alpha as render (1 while paused).
 */
import { PreparationQueue } from './preparation.js';
import { runtimeDiagnostics } from './runtime-diagnostics.js';

export class Runtime {
  /** Inject scheduling for deterministic lifecycle tests; browser defaults allocate no loop yet. */
  constructor({ request = cb => requestAnimationFrame(cb), cancel = id => cancelAnimationFrame(id), step = 1 / 60, maxSteps = 5, profiler = null } = {}) {
    this.request = request; this.cancel = cancel; this.step = step; this.maxSteps = maxSteps;
    this.profiler = profiler; this.preparation = new PreparationQueue({profiler});
    this.phases = { boundary: new Set(), input: new Set(), update: new Set(), animate: new Set(), render: new Set(), pause: new Set() };
    this.reasons = new Set(); this.running = false; this.disposed = false;
    this.frameId = null; this.last = null; this.accumulator = 0; this.time = 0;
    this.stats = { frames: 0, steps: 0, droppedSeconds: 0 };
    this.diagnostics=runtimeDiagnostics(this,profiler);
    this.tick = this.tick.bind(this);
  }

  /** Register a phase callback. Return an idempotent remover owned by the caller's lifetime. */
  on(phase, callback, name = null) {
    if (this.disposed) throw new Error('Runtime is disposed');
    const list = this.phases[phase];
    if (!list) throw new Error(`Unknown runtime phase: ${phase}`);
    const record={callback,scope:name&&this.profiler?this.profiler.scope(name):-1};
    list.add(record);
    return () => list.delete(record);
  }

  /** Emit in registration order. Callback owners must remove registrations on scene disposal. */
  emit(phase, ...args) {
    for (const record of this.phases[phase]) {
      const token=record.scope>=0?this.profiler.begin(record.scope):-1;
      try { record.callback(...args); } finally { if(token>=0)this.profiler.end(token); }
    }
  }

  /** Measure a named phase without allocating wrapper callbacks in the frame loop. */
  beginPhase(name){return this.profiler?.begin(this.diagnostics.scopes[name])??-1;}
  /** Close only valid recording tokens; disabled profiling does not read a clock. */
  endPhase(token){if(token>=0)this.profiler.end(token);}

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

  /** Execute budgeted preparation -> input -> boundary/fixed updates -> animate -> interpolated render. */
  tick(milliseconds) {
    if (!this.running) return;
    this.frameId = null;
    let failed=true;
    try {
      const elapsed = this.last === null ? 0 : Math.max(0, (milliseconds - this.last) / 1000);
      this.profiler?.beginFrame(this.last===null?null:elapsed*1000,this.reasons.size>0);
      this.last = milliseconds;
      let token=this.beginPhase('preparation');
      try { if (!this.reasons.size) this.preparation.advance(); } finally { this.endPhase(token); }
      token=this.beginPhase('input');
      try { this.emit('input'); } finally { this.endPhase(token); }
      if (!this.reasons.size) {
        const admitted = Math.min(elapsed, this.step * this.maxSteps);
        this.stats.droppedSeconds += elapsed - admitted;
        this.accumulator += admitted;
        let count = 0;
        while (this.accumulator + 1e-10 >= this.step && count < this.maxSteps) {
          token=this.beginPhase('boundary');
          try { this.emit('boundary', this.time); } finally { this.endPhase(token); }
          token=this.beginPhase('update');
          try { this.emit('update', this.step, this.time); } finally { this.endPhase(token); }
          this.accumulator = Math.max(0, this.accumulator - this.step);
          this.time += this.step; this.stats.steps++; count++;
        }
      }
      const alpha = this.reasons.size ? 1 : this.accumulator / this.step;
      token=this.beginPhase('animate');
      try { this.emit('animate', alpha, this.time); } finally { this.endPhase(token); }
      token=this.beginPhase('render');
      try { this.emit('render', alpha, this.time, milliseconds); }
      finally { this.endPhase(token); }
      this.stats.frames++;failed=false;
    } catch (error) {
      this.running = false; this.last = null; throw error;
    } finally { this.profiler?.endFrame(this.time,failed); }
    if (this.running) this.frameId = this.request(this.tick);
  }

  /** Stop scheduling and remove registrations, allowing the composed engine to release resources. */
  dispose() {
    if (this.disposed) return;
    this.stop(); this.preparation.dispose(); this.diagnostics?.remove(); this.disposed = true;
    for (const phase of Object.values(this.phases)) phase.clear();
    this.reasons.clear();
  }
}
