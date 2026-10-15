/**
 * Directory / residency: bounded prepared worlds, preparation tickets, and compact state.
 * Factories are game/library supplied. They return {world, ready, capture, dispose, ...}.
 * Pending and ready records both consume a slot. Tickets pin records until released.
 * Snapshots are JSON data, never live entities/GPU handles, and have a separate byte budget.
 */
export class WorldResidency {
  /** capacity counts managed world contexts; maxStateBytes bounds serialized snapshot data. */
  constructor({ capacity = 2, maxStateBytes = 65536 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('World capacity must be a positive integer');
    if (!Number.isInteger(maxStateBytes) || maxStateBytes < 0) throw new RangeError('Snapshot byte budget must be a nonnegative integer');
    this.capacity = capacity; this.maxStateBytes = maxStateBytes;
    this.definitions = new Map(); this.records = new Map(); this.serial = 0; this.disposed = false;
    this.stats = { evictions: 0, preparations: 0, snapshotBytes: 0, peakResident: 0 };
  }

  /** Register an inert world factory. Each definition retains at most one bounded snapshot. */
  register(key, factory) {
    if (this.disposed) throw new Error('Residency is disposed');
    if (this.definitions.has(key)) throw new Error(`Duplicate world definition: ${key}`);
    this.definitions.set(key, { factory, snapshot: null, bytes: 0 });
  }

  /**
   * Acquire a ticket immediately. Await ticket.ready, then read ticket.value.
   * Call release even if preparation fails. Shared tickets coalesce work; one owner
   * cancelling cannot abort preparation while another owner still needs it.
   */
  prepare(key) {
    if (this.disposed) throw new Error('Residency is disposed');
    const definition = this.definitions.get(key);
    if (!definition) throw new Error(`Unavailable world: ${key}`);
    let record = this.records.get(key);
    if (!record) {
      if (this.records.size >= this.capacity) {
        const candidate = [...this.records.values()].filter(r => !r.owners.size)
          .sort((a,b) => a.used - b.used)[0];
        if (!candidate) throw new Error('World residency budget is pinned');
        this.evict(candidate, true);
      }
      record = { key, owners: new Set(), used: ++this.serial, value: null, status: 'preparing',
        controller: new AbortController(), promise: null, error: null };
      this.records.set(key, record); this.stats.preparations++;
      this.stats.peakResident = Math.max(this.stats.peakResident, this.records.size);
      // Defer factory execution so the caller obtains a cancellable ticket first.
      record.promise = Promise.resolve().then(() => {
        if (record.controller.signal.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
        const state = definition.snapshot === null ? null : JSON.parse(definition.snapshot);
        return definition.factory({ signal: record.controller.signal, state });
      }).then(value => {
        if (this.records.get(key) !== record || record.controller.signal.aborted) {
          value.dispose(); throw new DOMException('Stale world preparation', 'AbortError');
        }
        if (!value?.world || value.world.disposed || value.ready?.geometry !== true || value.ready?.collision !== true || value.ready?.landing !== true
          || typeof value.capture !== 'function' || typeof value.dispose !== 'function') {
          value?.dispose?.(); throw new Error(`World ${key} did not satisfy destination readiness`);
        }
        record.value = value; record.status = 'ready';
        // Resolve readiness without the resource itself: a retained completed promise
        // must not pin an evicted world. Live access always goes through ticket.value.
        return undefined;
      }).catch(error => {
        record.status = 'failed'; record.error = error;
        if (this.records.get(key) === record) this.records.delete(key);
        throw error;
      });
      // Cancellation may release the only ticket before a caller awaits its promise.
      // Mark the shared rejection observed; individual ticket.ready still rejects normally.
      record.promise.catch(() => {});
    }
    const owner = {}; record.owners.add(owner); record.used = ++this.serial;
    let released = false;
    return {
      key,
      get value() { return released ? null : record.value; },
      ready: record.promise.then(() => {
        if (released) throw new DOMException('Ticket released', 'AbortError');
      }),
      release: () => {
        if (released) return;
        released = true; record.owners.delete(owner); record.used = ++this.serial;
        if (!record.owners.size && record.status === 'preparing' && this.records.get(key) === record) this.evict(record, false);
      },
    };
  }

  /**
   * Evict only unpinned records. Capture/encode first: if serialization or the state
   * budget fails, leave the resident world intact rather than silently losing changes.
   */
  evict(record, save) {
    if (record.owners.size) throw new Error(`World ${record.key} is pinned`);
    const definition = this.definitions.get(record.key);
    if (save && record.value) {
      const snapshot = JSON.stringify(record.value.capture());
      if (snapshot === undefined) throw new Error('World capture must return JSON data');
      const bytes = new TextEncoder().encode(snapshot).byteLength;
      if (this.stats.snapshotBytes - definition.bytes + bytes > this.maxStateBytes) throw new Error('World snapshot byte budget exceeded');
      this.stats.snapshotBytes += bytes - definition.bytes;
      definition.snapshot = snapshot; definition.bytes = bytes;
    }
    this.records.delete(record.key); record.controller.abort();
    const value = record.value; record.value = null; record.status = 'evicted';
    value?.dispose(); this.stats.evictions++;
  }

  /** Explicitly release every inactive/unpinned world; active/preparation owners are protected. */
  trim() {
    for (const record of [...this.records.values()]) if (!record.owners.size) this.evict(record, true);
  }

  /** Remove a scene's definition and snapshot after its tickets have been released. */
  unregister(key) {
    const record = this.records.get(key), definition = this.definitions.get(key);
    if (record) this.evict(record, false);
    if (definition) this.stats.snapshotBytes -= definition.bytes;
    this.definitions.delete(key);
  }

  /** Bounded diagnostic copy, requested by UI/tests rather than allocated every frame. */
  inspect() {
    return { capacity: this.capacity, resident: this.records.size, ...this.stats,
      worlds: [...this.records.values()].map(r => ({ key: r.key, status: r.status, owners: r.owners.size })) };
  }

  /** Final shutdown invalidates all tickets and cleans ready/partially prepared worlds. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.records.values()) {
      record.controller.abort(); const value = record.value; record.value = null; value?.dispose();
    }
    this.records.clear(); this.definitions.clear(); this.stats.snapshotBytes = 0;
  }
}
