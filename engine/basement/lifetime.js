/**
 * Basement / lifetime: an explicit owner for cleanup callbacks.
 * It knows no game, scheduler, or DOM IDs. Owners release children in reverse order,
 * so a control can release its listeners before the resources it references vanish.
 */
export class Lifetime {
  /** Start an empty owner; resources are only allocated by the caller. */
  constructor() { this.cleanups = []; this.disposed = false; }

  /** Register cleanup, returning it for optional manual use. Late additions clean immediately. */
  own(cleanup) {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
    return cleanup;
  }

  /** Add a browser listener whose exact function/options are remembered for removal. */
  listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.own(() => target.removeEventListener(type, callback, options));
  }

  /** Release everything once; attempt later cleanups even if one child throws. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const errors = [];
    for (const cleanup of this.cleanups.reverse()) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    this.cleanups.length = 0;
    if (errors.length) throw new AggregateError(errors, 'Lifetime cleanup failed');
  }
}
