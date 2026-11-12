import { validBounds, number, vector } from '../core/values.mjs';

/**
 * One incremental hash for physical and nonphysical instances. No per-consumer copies.
 *
 * Two levels share one membership table and one query stamp:
 *  - the fine level (cell_size) holds ordinary instances;
 *  - a coarse level (cell_size × COARSE) holds instances that would cover more than
 *    BIG_CELLS fine cells (whole buildings, long walls), so they occupy a few
 *    coarse cells instead of dozens of fine ones and are rechecked far less often.
 * Cells are keyed by integers and store plain arrays; queries run as plain loops and
 * reuse scratch sets, so steady-state use allocates nothing per cell or per pair.
 */
// Keys stay below 2^52: cell coordinates must lie within ±LIMIT on each axis.
const COARSE = 8, BIG_CELLS = 16, OFFSET = 2 ** 25, SPAN = 2 ** 26, LIMIT = 2 ** 25 - 1;
// Near the origin, keys are small integers (fast map hashing); far cells use a separate, larger key range.
const NEAR = 16383, PAIR_SPAN = 2 ** 26;
const cellKey = (x, y) => x >= -NEAR && x <= NEAR && y >= -NEAR && y <= NEAR ? x * 32768 + y : 2 ** 30 + (x + OFFSET) * SPAN + (y + OFFSET);
/** Does segment a→b pass within `pad` of box b (slab test on the padded box)? */
function segmentMeetsBox(box, ax, ay, bx, by, pad) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) < 1e-12) { if (ax < box.left - pad || ax > box.right + pad) return false; }
    else {
        let u = (box.left - pad - ax) / dx, v = (box.right + pad - ax) / dx; if (u > v) { const w = u; u = v; v = w; }
        if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) return false;
    }
    if (Math.abs(dy) < 1e-12) return ay >= box.top - pad && ay <= box.bottom + pad;
    let u = (box.top - pad - ay) / dy, v = (box.bottom + pad - ay) / dy; if (u > v) { const w = u; u = v; v = w; }
    if (u > t0) t0 = u; if (v < t1) t1 = v;
    return t0 <= t1;
}

export class spatialGrid {
    #levels; #entries = new Map(); #stamp = 0; #revision = 0;
    #nearby = []; #pairStamp = 0; #pairKeys = new Set();
    #stats = { updates: 0, membership_changes: 0, queries: 0, candidate_visits: 0, pairs: 0, cell_additions: 0, cell_removals: 0, query_cells: 0 };
    constructor({ cell_size = 128 } = {}) {
        this.cell_size = number(cell_size, 'cell_size', 1);
        this.#levels = [{ size: this.cell_size, cells: new Map(), count: 0 }, { size: this.cell_size * COARSE, cells: new Map(), count: 0 }];
        Object.freeze(this);
    }
    get revision() { return this.#revision; }
    #range(b, size) {
        const x0 = Math.floor(b.left / size), x1 = Math.floor(b.right / size), y0 = Math.floor(b.top / size), y1 = Math.floor(b.bottom / size);
        if (!Number.isSafeInteger(x0) || !Number.isSafeInteger(x1) || !Number.isSafeInteger(y0) || !Number.isSafeInteger(y1)) throw new RangeError('Cell coordinates must be safe integers');
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1e6) throw new RangeError('Instance/query covers over one million cells');
        if (x0 < -LIMIT || x1 > LIMIT || y0 < -LIMIT || y1 > LIMIT) throw new RangeError(`Cell coordinates must stay within ±${LIMIT} cells`);
        return { x0, x1, y0, y1 };
    }
    /** Fine range, or the coarse range for an instance that would cover many fine cells. */
    #place(b) {
        const fine = this.#range(b, this.cell_size);
        if ((fine.x1 - fine.x0 + 1) * (fine.y1 - fine.y0 + 1) <= BIG_CELLS) return { level: 0, range: fine };
        return { level: 1, range: this.#range(b, this.cell_size * COARSE) };
    }
    #add(level, x0, x1, y0, y1, e) {
        const cells = this.#levels[level].cells;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y); let cell = cells.get(key);
            if (!cell) cells.set(key, cell = { items: [], mark: 0 });
            cell.items.push(e); this.#stats.cell_additions++;
        }
    }
    #remove(level, x0, x1, y0, y1, e) {
        const cells = this.#levels[level].cells;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y), items = cells.get(key).items, i = items.indexOf(e), last = items.pop();
            if (last !== e) items[i] = last;
            if (!items.length) cells.delete(key);
            this.#stats.cell_removals++;
        }
    }
    /** Cells of range a that are outside range b, as up to four strips. */
    #difference(level, a, b, e, adding) {
        const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
        if (x0 > x1 || y0 > y1) { this.#strip(level, adding, a.x0, a.x1, a.y0, a.y1, e); return; }
        if (a.x0 <= x0 - 1) this.#strip(level, adding, a.x0, x0 - 1, a.y0, a.y1, e);
        if (x1 + 1 <= a.x1) this.#strip(level, adding, x1 + 1, a.x1, a.y0, a.y1, e);
        if (a.y0 <= y0 - 1) this.#strip(level, adding, x0, x1, a.y0, y0 - 1, e);
        if (y1 + 1 <= a.y1) this.#strip(level, adding, x0, x1, y1 + 1, a.y1, e);
    }
    #strip(level, adding, x0, x1, y0, y1, e) { if (adding) this.#add(level, x0, x1, y0, y1, e); else this.#remove(level, x0, x1, y0, y1, e); }
    registerInstance(id, bounds, value) {
        if (this.#entries.has(id)) throw new Error(`Duplicate spatial id: ${id}`);
        const b = validBounds(bounds), { level, range } = this.#place(b), e = { id, bounds: b, value, range, level, stamp: 0 };
        this.#entries.set(id, e); this.#levels[level].count++;
        this.#add(level, range.x0, range.x1, range.y0, range.y1, e);
        this.#stats.membership_changes++; this.#revision++;
    }
    updateInstance(id, bounds) {
        const e = this.#entries.get(id); if (!e) throw new Error(`Unknown spatial id: ${id}`);
        if (e.bounds.left === bounds.left && e.bounds.right === bounds.right && e.bounds.top === bounds.top && e.bounds.bottom === bounds.bottom) return;
        const b = validBounds(bounds), { level, range } = this.#place(b), old = e.range;
        if (level !== e.level) {
            this.#remove(e.level, old.x0, old.x1, old.y0, old.y1, e); this.#levels[e.level].count--;
            this.#add(level, range.x0, range.x1, range.y0, range.y1, e); this.#levels[level].count++;
            e.level = level; e.range = range; this.#stats.membership_changes++;
        } else if (old.x0 !== range.x0 || old.x1 !== range.x1 || old.y0 !== range.y0 || old.y1 !== range.y1) {
            this.#difference(level, old, range, e, false);
            this.#difference(level, range, old, e, true);
            e.range = range; this.#stats.membership_changes++;
        }
        e.bounds = b; this.#stats.updates++; this.#revision++;
    }
    removeInstance(id) {
        const e = this.#entries.get(id); if (!e) return false;
        const r = e.range; this.#remove(e.level, r.x0, r.x1, r.y0, r.y1, e); this.#levels[e.level].count--;
        this.#entries.delete(id); this.#stats.membership_changes++; this.#revision++; return true;
    }
    /** Validates a segment query's cost up front, even when the grid is empty. */
    #checkSegment(from, to) {
        const s = this.cell_size, x = Math.floor(from[0] / s), y = Math.floor(from[1] / s), ex = Math.floor(to[0] / s), ey = Math.floor(to[1] / s);
        if (!(Math.abs(x) <= LIMIT && Math.abs(y) <= LIMIT && Math.abs(ex) <= LIMIT && Math.abs(ey) <= LIMIT)) throw new RangeError('Cell coordinates must be safe integers');
        if (Math.abs(ex - x) + Math.abs(ey - y) > 1e6) throw new RangeError('Segment crosses over one million cells');
    }
    #nextStamp() { this.#stats.queries++; return ++this.#stamp; }
    /** Visits a cell rectangle of one level, pushing unseen entries (optionally bounds-filtered). */
    #collect(level, x0, x1, y0, y1, stamp, results, b, segment) {
        const cells = this.#levels[level].cells, stats = this.#stats;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
            stats.query_cells++;
            const cell = cells.get(cellKey(x, y)); if (!cell || cell.mark === stamp) continue;
            cell.mark = stamp;
            const items = cell.items;
            for (let i = 0; i < items.length; i++) {
                const e = items[i]; if (e.stamp === stamp) continue;
                e.stamp = stamp; stats.candidate_visits++;
                if (b ? (b.left <= e.bounds.right && b.right >= e.bounds.left && b.top <= e.bounds.bottom && b.bottom >= e.bounds.top)
                    : !segment || segmentMeetsBox(e.bounds, segment[0], segment[1], segment[2], segment[3], segment[4])) results.push(e.value);
            }
        }
    }
    queryBounds(bounds, results = []) {
        const b = validBounds(bounds), stamp = this.#nextStamp(); results.length = 0;
        for (let level = 0; level < 2; level++) {
            if (!this.#levels[level].count) continue;
            const r = this.#range(b, this.#levels[level].size);
            this.#collect(level, r.x0, r.x1, r.y0, r.y1, stamp, results, b);
        }
        return results;
    }
    queryRadius(position, radius, results = []) {
        number(radius, 'radius', 0); const [x, y] = position;
        return this.queryBounds({ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius }, results);
    }
    /** DDA over one level's cells crossed by a segment, including both neighbours at corner crossings. */
    #segmentCells(size, from, to, visit) {
        let x = Math.floor(from[0] / size), y = Math.floor(from[1] / size);
        const ex = Math.floor(to[0] / size), ey = Math.floor(to[1] / size), dx = to[0] - from[0], dy = to[1] - from[1];
        if (!(Math.abs(x) <= LIMIT && Math.abs(y) <= LIMIT && Math.abs(ex) <= LIMIT && Math.abs(ey) <= LIMIT)) throw new RangeError('Cell coordinates must be safe integers');
        const sx = Math.sign(dx), sy = Math.sign(dy), tx = dx ? size / Math.abs(dx) : Infinity, ty = dy ? size / Math.abs(dy) : Infinity;
        let nx = dx ? ((sx > 0 ? x + 1 : x) * size - from[0]) / dx : Infinity;
        let ny = dy ? ((sy > 0 ? y + 1 : y) * size - from[1]) / dy : Infinity;
        if (Math.abs(ex - x) + Math.abs(ey - y) > 1e6) throw new RangeError('Segment crosses over one million cells');
        visit(x, y);
        while (x !== ex || y !== ey) {
            if (x === ex) { y += sy; ny += ty; }
            else if (y === ey) { x += sx; nx += tx; }
            else if (Math.abs(nx - ny) < 1e-12) { visit(x + sx, y); visit(x, y + sy); x += sx; y += sy; nx += tx; ny += ty; }
            else if (nx < ny) { x += sx; nx += tx; } else { y += sy; ny += ty; }
            visit(x, y);
        }
    }
    querySegment(from, to, results = []) {
        from = vector(from); to = vector(to); this.#checkSegment(from, to);
        results.length = 0; const stamp = this.#nextStamp(), segment = [from[0], from[1], to[0], to[1], 0];
        for (let level = 0; level < 2; level++) {
            if (!this.#levels[level].count) continue;
            this.#segmentCells(this.#levels[level].size, from, to, (x, y) => this.#collect(level, x, x, y, y, stamp, results, null, segment));
        }
        return results;
    }
    querySweep(packet, results = []) {
        if (packet.left !== undefined) return this.queryBounds(packet, results);
        const from = vector(packet.from), to = vector(packet.to), radius = number(packet.radius ?? 0, 'radius', 0); this.#checkSegment(from, to);
        if (Math.ceil(radius / this.cell_size) > 1000) throw new RangeError('Sweep radius exceeds one thousand cells');
        results.length = 0; const stamp = this.#nextStamp(), segment = [from[0], from[1], to[0], to[1], radius];
        // Cells already visited this query carry its stamp, so overlapping neighbourhoods cost one lookup each.
        for (let level = 0; level < 2; level++) {
            if (!this.#levels[level].count) continue;
            const size = this.#levels[level].size, cells = Math.ceil(radius / size);
            this.#segmentCells(size, from, to, (x, y) => this.#collect(level, x - cells, x + cells, y - cells, y + cells, stamp, results, null, segment));
        }
        return results;
    }
    collectCandidatePairs(instances, results = [], accepts = () => true) {
        // A pair with an unlisted body can only be found from its listed side, so only
        // pairs of two listed instances need the (numeric) duplicate check.
        results.length = 0; const nearby = this.#nearby, seen = this.#pairKeys, mark = ++this.#pairStamp;
        seen.clear();
        for (const { id } of instances) { const a = this.#entries.get(id); if (a) a.listed = mark; }
        for (const { id, bounds } of instances) {
            const a = this.#entries.get(id); if (!a) continue;
            this.queryBounds(bounds ?? a.bounds, nearby);
            for (let i = 0; i < nearby.length; i++) {
                const b = nearby[i], other = b.body_id;
                if (a.value === b || !other) continue;
                const lo = id < other ? id : other, hi = id < other ? other : id;
                if (this.#entries.get(other)?.listed === mark) {
                    const key = lo * PAIR_SPAN + hi;
                    if (seen.has(key) || !accepts(a.value, b)) continue;
                    seen.add(key);
                } else if (!accepts(a.value, b)) continue;
                results.push(id === lo ? [a.value, b] : [b, a.value]);
            }
        }
        nearby.length = 0; seen.clear();
        this.#stats.pairs += results.length; return results;
    }
    getStatistics() { return { ...this.#stats, instances: this.#entries.size, cells: this.#levels[0].cells.size + this.#levels[1].cells.size, coarse_instances: this.#levels[1].count }; }
    exportInstances() { return [...this.#entries.values()].map(e => ({ id: e.id, bounds: { ...e.bounds }, value: e.value })); }
    clear() {
        this.#revision++; this.#entries.clear();
        for (const level of this.#levels) { level.cells.clear(); level.count = 0; }
        this.#stats.cell_removals = this.#stats.cell_additions;
    }
}
