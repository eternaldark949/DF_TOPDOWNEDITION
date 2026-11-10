import { validBounds, boundsMeet, number, vector } from '../core/values.mjs';

/** One incremental hash for physical and nonphysical instances. No per-consumer copies. */
export class spatialGrid {
    #cells = new Map(); #entries = new Map(); #stamp = 0;
    #stats = { updates: 0, membership_changes: 0, queries: 0, candidate_visits: 0, pairs: 0 };
    constructor({ cell_size = 128 } = {}) { this.cell_size = number(cell_size, 'cell_size', 1); Object.freeze(this); }
    #keys(b) {
        const keys = [], s = this.cell_size;
        const x0 = Math.floor(b.left / s), x1 = Math.floor(b.right / s), y0 = Math.floor(b.top / s), y1 = Math.floor(b.bottom / s);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1e6) throw new RangeError('Instance/query covers over one million cells');
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
        return keys;
    }
    registerInstance(id, bounds, value) {
        if (this.#entries.has(id)) throw new Error(`Duplicate spatial id: ${id}`);
        const b = validBounds(bounds), keys = this.#keys(b), e = { id, bounds: b, value, keys, stamp: 0 };
        this.#entries.set(id, e);
        for (const k of keys) { let c = this.#cells.get(k); if (!c) this.#cells.set(k, c = new Set()); c.add(e); }
        this.#stats.membership_changes++;
    }
    updateInstance(id, bounds) {
        const e = this.#entries.get(id); if (!e) throw new Error(`Unknown spatial id: ${id}`);
        if (e.bounds.left === bounds.left && e.bounds.right === bounds.right && e.bounds.top === bounds.top && e.bounds.bottom === bounds.bottom) return;
        const b = validBounds(bounds), keys = this.#keys(b); this.#stats.updates++;
        if (e.keys.length !== keys.length || e.keys.some((k, i) => k !== keys[i])) {
            for (const k of e.keys) { const c = this.#cells.get(k); c.delete(e); if (!c.size) this.#cells.delete(k); }
            for (const k of keys) { let c = this.#cells.get(k); if (!c) this.#cells.set(k, c = new Set()); c.add(e); }
            e.keys = keys; this.#stats.membership_changes++;
        }
        e.bounds = b;
    }
    removeInstance(id) {
        const e = this.#entries.get(id); if (!e) return false;
        for (const k of e.keys) { const c = this.#cells.get(k); c.delete(e); if (!c.size) this.#cells.delete(k); }
        this.#entries.delete(id); this.#stats.membership_changes++; return true;
    }
    queryBounds(bounds, results = []) {
        const b = validBounds(bounds); results.length = 0; const stamp = ++this.#stamp; this.#stats.queries++;
        for (const k of this.#keys(b)) for (const e of this.#cells.get(k) ?? []) {
            if (e.stamp === stamp) continue; e.stamp = stamp; this.#stats.candidate_visits++;
            if (boundsMeet(b, e.bounds)) results.push(e.value);
        }
        return results;
    }
    queryRadius(position, radius, results = []) {
        number(radius, 'radius', 0); const [x, y] = position;
        return this.queryBounds({ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius }, results);
    }
    #segmentCells(from, to, visit) {
        from = vector(from); to = vector(to);
        // DDA visits only crossed cells, including both neighbours at corner crossings.
        const s = this.cell_size;
        let x = Math.floor(from[0] / s), y = Math.floor(from[1] / s);
        const ex = Math.floor(to[0] / s), ey = Math.floor(to[1] / s), dx = to[0] - from[0], dy = to[1] - from[1];
        const sx = Math.sign(dx), sy = Math.sign(dy), tx = dx ? s / Math.abs(dx) : Infinity, ty = dy ? s / Math.abs(dy) : Infinity;
        let nx = dx ? ((sx > 0 ? x + 1 : x) * s - from[0]) / dx : Infinity;
        let ny = dy ? ((sy > 0 ? y + 1 : y) * s - from[1]) / dy : Infinity;
        if (Math.abs(ex - x) + Math.abs(ey - y) > 1e6) throw new RangeError('Segment crosses over one million cells');
        visit(x, y);
        while (x !== ex || y !== ey) {
            if (Math.abs(nx - ny) < 1e-12) { visit(x + sx, y); visit(x, y + sy); x += sx; y += sy; nx += tx; ny += ty; }
            else if (nx < ny) { x += sx; nx += tx; } else { y += sy; ny += ty; }
            visit(x, y);
        }
    }
    querySegment(from, to, results = []) {
        results.length = 0; const stamp = ++this.#stamp; this.#stats.queries++;
        this.#segmentCells(from, to, (x, y) => {
            for (const e of this.#cells.get(`${x},${y}`) ?? []) if (e.stamp !== stamp) { e.stamp = stamp; this.#stats.candidate_visits++; results.push(e.value); }
        });
        return results;
    }
    querySweep(packet, results = []) {
        if (packet.left !== undefined) return this.queryBounds(packet, results);
        results.length = 0; const stamp = ++this.#stamp; this.#stats.queries++;
        const radius = number(packet.radius ?? 0, 'radius', 0), cells = Math.ceil(radius / this.cell_size);
        if (cells > 1000) throw new RangeError('Sweep radius exceeds one thousand cells');
        const seen = new Set();
        this.#segmentCells(packet.from, packet.to, (x, y) => {
            for (let dx = -cells; dx <= cells; dx++) for (let dy = -cells; dy <= cells; dy++) {
                const k = `${x + dx},${y + dy}`; if (seen.has(k)) continue; seen.add(k);
                if (seen.size > 1e6) throw new RangeError('Sweep covers over one million cells');
                for (const e of this.#cells.get(k) ?? []) if (e.stamp !== stamp) { e.stamp = stamp; this.#stats.candidate_visits++; results.push(e.value); }
            }
        });
        return results;
    }
    collectCandidatePairs(instances, results = [], accepts = () => true) {
        results.length = 0; const seen = new Set(), nearby = [];
        for (const { id, bounds } of instances) {
            const a = this.#entries.get(id); if (!a) continue;
            this.queryBounds(bounds ?? a.bounds, nearby);
            for (const b of nearby) {
                if (a.value === b || !b.body_id) continue;
                if (!accepts(a.value, b)) continue;
                const lo = Math.min(id, b.body_id), hi = Math.max(id, b.body_id), key = `${lo}:${hi}`;
                if (seen.has(key)) continue; seen.add(key); results.push(id === lo ? [a.value, b] : [b, a.value]);
            }
        }
        this.#stats.pairs += results.length; return results;
    }
    getStatistics() { return { ...this.#stats, instances: this.#entries.size, cells: this.#cells.size }; }
    exportInstances() { return [...this.#entries.values()].map(e => ({ id: e.id, bounds: { ...e.bounds }, value: e.value })); }
    clear() { this.#entries.clear(); this.#cells.clear(); }
}
