// ===== LV0 BASEMENT =====
import { validBounds, number } from '../core/values.mjs';

/**
 * Change counters per grid cell. `touch(bounds)` stamps every cell the bounds cover with a new
 * revision; `revision(bounds)` is the newest stamp under the bounds. A cache that remembers the
 * revision under its reach knows it is stale exactly when something there changed since, without
 * walking what is there. Cells never touched cost nothing.
 */
export class changeCounters {
    #cells = new Map(); #next = 0;
    constructor({ cell_size = 256 } = {}) { this.cell_size = number(cell_size, 'cell_size', 1); Object.freeze(this); }
    get total() { return this.#next; }
    #each(bounds, visit) {
        const b = validBounds(bounds), s = this.cell_size;
        const x0 = Math.floor(b.left / s), x1 = Math.floor(b.right / s), y0 = Math.floor(b.top / s), y1 = Math.floor(b.bottom / s);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1e6) throw new RangeError('Change bounds cover over one million cells');
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) visit(`${x},${y}`);
    }
    touch(bounds) { const stamp = ++this.#next; this.#each(bounds, key => this.#cells.set(key, stamp)); return stamp; }
    revision(bounds) { let newest = 0; this.#each(bounds, key => { const v = this.#cells.get(key); if (v > newest) newest = v; }); return newest; }
    clear() { this.#cells.clear(); }
}
