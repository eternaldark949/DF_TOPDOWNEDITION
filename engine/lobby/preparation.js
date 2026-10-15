/**
 * Lobby / preparation: cooperatively budgeted generator work in the existing frame loop.
 * Each next() must be a small, synchronous chunk; JavaScript cannot preempt a huge chunk.
 * Both a step ceiling and a time budget apply. No timers or secondary animation loop.
 */
export class PreparationQueue {
  /** Budget is milliseconds per frame; next() count is also bounded for reliable tests. */
  constructor({ budgetMs = 2, maxSteps = 2, now = () => performance.now() } = {}) {
    if (!(budgetMs > 0) || !Number.isFinite(budgetMs) || !Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new RangeError('Preparation requires a positive time budget and integer step limit');
    }
    this.budgetMs = budgetMs; this.maxSteps = maxSteps; this.now = now;
    this.jobs = new Set(); this.disposed = false;
    this.stats = { steps: 0, peakChunkMs: 0, cancelled: 0 };
  }

  /** Queue an iterator; its finally block must release partially prepared resources. */
  enqueue(iterator, { signal } = {}) {
    if (this.disposed) return Promise.reject(new Error('Preparation queue is disposed'));
    return new Promise((resolve, reject) => {
      const job = { iterator, resolve, reject, signal, abort: null };
      job.abort = () => {
        if (!this.jobs.delete(job)) return;
        signal?.removeEventListener('abort', job.abort);
        this.stats.cancelled++;
        try { iterator.return?.(); } catch (error) { reject(error); return; }
        reject(new DOMException('Preparation cancelled', 'AbortError'));
      };
      this.jobs.add(job); signal?.addEventListener('abort', job.abort, { once: true });
      if (signal?.aborted) job.abort();
    });
  }

  /** Advance jobs round-robin; a long chunk is measured rather than hidden by the budget. */
  advance() {
    const start = this.now(); let steps = 0;
    while (this.jobs.size && steps < this.maxSteps && this.now() - start < this.budgetMs) {
      const job = this.jobs.values().next().value;
      this.jobs.delete(job); this.jobs.add(job);
      const before = this.now();
      try {
        const result = job.iterator.next();
        if (result.done) {
          this.jobs.delete(job); job.signal?.removeEventListener('abort', job.abort); job.resolve(result.value);
        }
      } catch (error) {
        this.jobs.delete(job); job.signal?.removeEventListener('abort', job.abort); job.reject(error);
      }
      steps++; this.stats.steps++;
      this.stats.peakChunkMs = Math.max(this.stats.peakChunkMs, this.now() - before);
    }
  }

  /** Cancel every queued iterator, running its cleanup even during engine shutdown. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of [...this.jobs]) job.abort();
  }
}
