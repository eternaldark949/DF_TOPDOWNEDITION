/**
 * Lobby / travel: asynchronous preparation becomes a synchronous boundary commit.
 * It consumes generic residency tickets; it does not import Directory or game content.
 * The active ticket pins the source until a successful transfer replaces it.
 */
import { transferTree } from '../basement/transfer.js';

export class WorldTravel {
  /** Adopt an already-ready initial ticket/root. The owner must call advance at a boundary. */
  constructor({ residency, initial, root, now = () => performance.now() }) {
    if (!initial.value || initial.value.world.entities.get(root.id) !== root) throw new Error('Initial travel ownership is invalid');
    this.residency = residency; this.current = initial; this.root = root; this.now = now;
    this.pending = null; this.listeners = new Set(); this.disposed = false;
    this.stats = { committed: 0, cancelled: 0, failed: 0, waitMs: 0, transferMs: 0, observerErrors: 0 };
    this.last = { status: 'idle', message: 'Ready to flit' };
  }

  /** Observe completed commits only; listeners see fully coherent membership and active ownership. */
  onCommit(callback) {
    if (this.disposed) throw new Error('Travel is disposed');
    this.listeners.add(callback); return () => this.listeners.delete(callback);
  }

  /**
   * Latest request wins. Preparing/ready requests never mutate the active actor.
   * A landing object is copied; a pure landing resolver instead evaluates the current
   * actor/destination at commit. This supports a moving source without stale coordinates.
   */
  request(key, landing, validate) {
    if (this.disposed) throw new Error('Travel is disposed');
    this.cancel();
    if (key === this.current.key) return;
    let ticket;
    try { ticket = this.residency.prepare(key); }
    catch (error) { this.fail(error); return; }
    const pending = { ticket, landing: typeof landing === 'function' ? landing : { ...landing }, validate, ready: false, started: this.now() };
    this.pending = pending; this.last = { status: 'preparing', message: 'Preparing destination' };
    ticket.ready.then(() => {
      if (this.pending !== pending || this.disposed) return;
      pending.ready = true; this.last = { status: 'ready', message: 'Awaiting simulation boundary' };
    }).catch(error => {
      if (this.pending !== pending || this.disposed) return;
      this.pending = null; ticket.release(); this.fail(error);
    });
  }

  /** Cancel before commit, including a ready request waiting behind a pause. */
  cancel() {
    if (!this.pending) return;
    this.pending.ticket.release(); this.pending = null; this.stats.cancelled++;
    this.last = { status: 'cancelled', message: 'Flit cancelled; source preserved' };
  }

  /** Store a readable refusal without throwing through the game loop or consuming game costs. */
  fail(error) {
    this.stats.failed++; this.last = { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }

  /**
   * Call only between fixed simulation steps. Validate again here, not merely when
   * preparation completed: landing geometry may have changed while the request waited.
   */
  advance(simulationTime) {
    const pending = this.pending;
    if (!pending?.ready || this.disposed) return;
    const source = this.current, destination = pending.ticket;
    let event;
    const before = this.now();
    try {
      event = transferTree({ source: source.value.world, destination: destination.value.world,
        root: this.root, landing: typeof pending.landing === 'function' ? pending.landing(this.root, destination.value) : pending.landing,
        validate: (world, pose, root) => pending.validate ? pending.validate(world, pose, root, destination.value) : true });
    } catch (error) {
      this.pending = null; destination.release(); this.fail(error); return;
    }
    this.current = destination; this.pending = null; source.release();
    this.stats.committed++; this.stats.waitMs = this.now() - pending.started;
    this.stats.transferMs = this.now() - before;
    this.last = { status: 'committed', message: 'Flit complete', event: Object.freeze({ ...event, simulationTime }) };
    for (const listener of this.listeners) {
      try { listener(this.last.event); }
      catch (error) {
        // Notification failures cannot undo an already completed membership transaction.
        this.stats.observerErrors++; this.last.message = `Flit complete; observer failed: ${error.message}`;
      }
    }
  }

  /** Release active/preparation pins and notifications without disposing game-owned actor state. */
  dispose() {
    if (this.disposed) return;
    this.cancel(); this.current.release(); this.listeners.clear(); this.disposed = true;
  }
}
