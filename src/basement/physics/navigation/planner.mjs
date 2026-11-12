import { number } from '../core/values.mjs';
import { chunkKey } from './field.mjs';

const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

/**
 * Grid A* over a navigationField, followed by string pulling. The default
 * heuristic weight of 1.2 bounds raw-path cost at 1.2x optimal (string pulling
 * then shortens it) and expands far fewer cells on long trips; pass 1 for optimal.
 *
 * Safety rule: a straight segment of length L whose two endpoints both have
 * obstacle clearance >= sqrt(r^2 + (L/2)^2) keeps a circle of radius r clear of
 * every obstacle. Cell-to-cell edges use that rule with exact centre
 * clearances, so raw paths need no geometric checks at all. Smoothed segments
 * first try a conservative field test and fall back to one exact segment test.
 *
 * Search scratch memory is pooled and stamped, so steady-state planning does
 * not allocate per node.
 */
export class fieldPlanner {
    #field; #capacity = 0; #g; #parent; #seen; #closed; #heapNode; #heapCost; #stamp = 0;
    #stats = { searches: 0, expanded_nodes: 0, smoothing_tests: 0, smoothing_rejections: 0, smoothing_exact_tests: 0, partial_results: 0, failed_searches: 0 };
    constructor(field) { this.#field = field; }
    getStatistics() { return { ...this.#stats }; }
    #ensure(size) {
        if (size <= this.#capacity) return;
        const capacity = Math.max(size, Math.ceil(this.#capacity * 1.5), 4096);
        this.#g = new Float64Array(capacity); this.#parent = new Int32Array(capacity);
        this.#seen = new Uint32Array(capacity); this.#closed = new Uint32Array(capacity);
        this.#heapNode = new Int32Array(capacity * 2); this.#heapCost = new Float64Array(capacity * 2);
        this.#capacity = capacity; this.#stamp = 0;
    }
    /** Edge thresholds for an agent radius. */
    thresholds(radius) {
        const cell = this.#field.cell_size;
        return { node: Math.sqrt(radius * radius + cell * cell / 4), diagonal: Math.sqrt(radius * radius + cell * cell / 2) };
    }
    /** True when a circle of `radius` can travel a→b without touching a field obstacle. */
    segmentClear(a, b, radius) {
        this.#stats.smoothing_tests++;
        const f = this.#field, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
        // Conservative test: samples h apart, each needing sqrt(r^2+(h/2)^2) of lower-bound clearance.
        const h = f.cell_size / 2, need = Math.sqrt(radius * radius + h * h / 4), steps = Math.max(1, Math.ceil(length / h));
        // Clearance is 1-Lipschitz, so a cell centre value c bounds every nearby point p
        // within c ± |p - centre|: proven clear, proven blocked, or undecided (exact test).
        let conservative = true;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, x = a[0] + dx * t, y = a[1] + dy * t, gx = f.cellOf(x), gy = f.cellOf(y);
            const c = f.clearanceAtCell(gx, gy), offset = Math.hypot(x - f.cellCenter(gx), y - f.cellCenter(gy));
            if (c + offset < radius) { this.#stats.smoothing_rejections++; return false; }
            if (c - offset < need) conservative = false;
        }
        if (conservative) return true;
        this.#stats.smoothing_exact_tests++;
        return f.exactSegmentClearance(a, b, radius + 1) >= radius;
    }
    plan({ from, to, radius, max_nodes = 20000, search_margin, allow_partial = false, smooth = true, heuristic_weight = 1.2 }) {
        const f = this.#field, cell = f.cell_size;
        number(radius, 'radius', 0, f.max_clearance - cell);
        number(max_nodes, 'max_nodes', 1, 1e6); number(heuristic_weight, 'heuristic_weight', 1, 10);
        this.#stats.searches++;
        const { node: nodeNeed, diagonal: diagonalNeed } = this.thresholds(radius);
        let goalOpen = f.exactSegmentClearance(to, to, radius + 1) >= radius, adjusted = false;
        if (!goalOpen && !allow_partial) { this.#stats.failed_searches++; return null; }
        if (!goalOpen) {
            // Blocked destination: aim for the nearest open cell centre around it instead.
            const gx = f.cellOf(to[0]), gy = f.cellOf(to[1]), rings = Math.ceil((radius * 2 + cell * 4) / cell);
            let pick = null, pickDistance = Infinity;
            for (let ring = 1; ring <= rings && !pick; ring++) for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || f.clearanceAtCell(gx + dx, gy + dy) < nodeNeed) continue;
                const c = [f.cellCenter(gx + dx), f.cellCenter(gy + dy)], d = Math.hypot(c[0] - to[0], c[1] - to[1]);
                if (d < pickDistance) { pick = c; pickDistance = d; }
            }
            if (pick) { to = pick; goalOpen = true; adjusted = true; }
        }
        // Direct line of sight: no grid search needed.
        if (goalOpen && this.segmentClear(from, to, radius)) return this.#finish([from, to], 0, adjusted);
        const sx = f.cellOf(from[0]), sy = f.cellOf(from[1]), tx = f.cellOf(to[0]), ty = f.cellOf(to[1]);
        const span = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
        // Small searches stay small. If the area is exhausted without reaching the
        // goal, the detour lies outside it: widen and search again within budget.
        let margin = Math.ceil(search_margin !== undefined ? number(search_margin, 'search_margin', 0) / cell : Math.max(32, span * 0.5));
        let found, visited = 0;
        for (let attempt = 0; ; attempt++) {
            found = this.#search({ from, to, radius, margin, max_nodes: max_nodes - visited, goalOpen, sx, sy, tx, ty, weight: heuristic_weight * 1.0001 });
            visited += found.visited;
            if (found.reached || !found.exhausted || search_margin !== undefined || attempt >= 3 || visited >= max_nodes) break;
            margin *= 4;
            if ((span + 2 * margin + 1) ** 2 > 4e6) break;
        }
        this.#stats.expanded_nodes += visited;
        const cells = found.reached ? found.cells : allow_partial ? found.best : null;
        if (!cells) { this.#stats.failed_searches++; return null; }
        // Keep only turning cells; straight runs between them are already safe.
        const raw = [from];
        for (let i = 0; i < cells.length; i += 2) {
            if (i > 0 && i < cells.length - 2 && cells[i] - cells[i - 2] === cells[i + 2] - cells[i] && cells[i + 1] - cells[i - 1] === cells[i + 3] - cells[i + 1]) continue;
            raw.push([f.cellCenter(cells[i]), f.cellCenter(cells[i + 1])]);
        }
        if (found.reached) raw.push([...to]);
        const points = smooth ? this.#pull(raw, radius) : raw;
        if (!found.reached || adjusted) this.#stats.partial_results++;
        return this.#finish(points, visited, !found.reached || adjusted);
    }
    /** One bounded A* pass. Returns path cells as flat global [gx, gy, ...] pairs. */
    #search({ from, to, radius, margin, max_nodes, goalOpen, sx, sy, tx, ty, weight }) {
        const f = this.#field, cell = f.cell_size, { node: nodeNeed, diagonal: diagonalNeed } = this.thresholds(radius);
        const gx0 = Math.min(sx, tx) - margin, gy0 = Math.min(sy, ty) - margin, gx1 = Math.max(sx, tx) + margin, gy1 = Math.max(sy, ty) + margin;
        const wx = gx1 - gx0 + 1, wy = gy1 - gy0 + 1, size = wx * wy;
        if (size > 4e6) throw new RangeError('Navigation search area exceeds four million cells; lower search_margin');
        this.#ensure(size);
        if (++this.#stamp >= 0xffffffff) { this.#seen.fill(0); this.#closed.fill(0); this.#stamp = 1; }
        const stamp = this.#stamp, g = this.#g, parent = this.#parent, seen = this.#seen, closed = this.#closed, hn = this.#heapNode, hc = this.#heapCost;
        // Chunk references for the search area, fetched (and rebuilt if dirty) on first touch.
        const n = f.chunk_cells, cx0 = Math.floor(gx0 / n), cy0 = Math.floor(gy0 / n), cwx = Math.floor(gx1 / n) - cx0 + 1;
        const chunks = new Array(cwx * (Math.floor(gy1 / n) - cy0 + 1));
        const clearance = (lx, ly) => {
            const gx = gx0 + lx, gy = gy0 + ly, cx = Math.floor(gx / n), cy = Math.floor(gy / n), ci = (cy - cy0) * cwx + (cx - cx0);
            const chunk = chunks[ci] ?? (chunks[ci] = f.chunk(cx, cy));
            return chunk.clearance[(gy - cy * n) * n + (gx - cx * n)];
        };
        const center = (lx, ly) => [(gx0 + lx + 0.5) * cell, (gy0 + ly + 0.5) * cell];
        let heapSize = 0;
        const push = (node, cost) => {
            let i = heapSize++;
            while (i) { const p = (i - 1) >> 1; if (hc[p] <= cost) break; hn[i] = hn[p]; hc[i] = hc[p]; i = p; }
            hn[i] = node; hc[i] = cost;
        };
        const pop = () => {
            const top = hn[0], lastNode = hn[--heapSize], lastCost = hc[heapSize];
            let i = 0;
            for (;;) {
                const l = i * 2 + 1; if (l >= heapSize) break;
                const m = l + 1 < heapSize && hc[l + 1] < hc[l] ? l + 1 : l;
                if (hc[m] >= lastCost) break;
                hn[i] = hn[m]; hc[i] = hc[m]; i = m;
            }
            hn[i] = lastNode; hc[i] = lastCost;
            return top;
        };
        const ltx = tx - gx0, lty = ty - gy0;
        const heuristic = (lx, ly) => { const dx = Math.abs(lx - ltx), dy = Math.abs(ly - lty); return (dx + dy + (SQRT2 - 2) * Math.min(dx, dy)) * cell * weight; };
        // Seeds: passable cells around the start, entered by a direct step.
        const lsx = sx - gx0, lsy = sy - gy0;
        for (let ring = 0; ring <= Math.ceil(radius / cell) + 2; ring++) {
            for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                const lx = lsx + dx, ly = lsy + dy; if (lx < 0 || ly < 0 || lx >= wx || ly >= wy || clearance(lx, ly) < nodeNeed) continue;
                const k = ly * wx + lx, c = center(lx, ly), cost = Math.hypot(c[0] - from[0], c[1] - from[1]);
                if (seen[k] === stamp && g[k] <= cost) continue;
                seen[k] = stamp; g[k] = cost; parent[k] = -1; push(k, cost + heuristic(lx, ly));
            }
            if (heapSize) break;
        }
        if (!heapSize) return { reached: false, exhausted: false, visited: 0, cells: null, best: null };
        let visited = 0, reached = -1, best = -1, bestH = Infinity;
        const goalReach = cell * 1.5 + 1e-9;
        while (heapSize && visited < max_nodes) {
            const k = pop();
            if (closed[k] === stamp) continue;
            closed[k] = stamp; visited++;
            const lx = k % wx, ly = (k - lx) / wx, here = clearance(lx, ly);
            const h = heuristic(lx, ly);
            if (h < bestH) { bestH = h; best = k; }
            if (goalOpen && Math.abs(lx - ltx) <= 1 && Math.abs(ly - lty) <= 1) {
                const c = center(lx, ly);
                if (Math.hypot(c[0] - to[0], c[1] - to[1]) <= goalReach && this.segmentClear(c, to, radius)) { reached = k; break; }
            }
            for (const [dx, dy, step] of NEIGHBOURS) {
                const nx = lx + dx, ny = ly + dy;
                if (nx < 0 || ny < 0 || nx >= wx || ny >= wy) continue;
                const nk = ny * wx + nx;
                if (closed[nk] === stamp) continue;
                const there = clearance(nx, ny);
                if (step === 1 ? there < nodeNeed : (there < diagonalNeed || here < diagonalNeed)) continue;
                const cost = g[k] + step * cell;
                if (seen[nk] === stamp && g[nk] <= cost) continue;
                seen[nk] = stamp; g[nk] = cost; parent[nk] = k; push(nk, cost + heuristic(nx, ny));
            }
        }
        const trace = end => { if (end < 0) return null; const out = []; for (let k = end; k >= 0; k = parent[k]) { const lx = k % wx; out.push(gy0 + (k - lx) / wx, gx0 + lx); } return out.reverse(); };
        return { reached: reached >= 0, exhausted: !heapSize && reached < 0, visited, cells: trace(reached), best: trace(best) };
    }
    /** Greedy string pulling: keep the farthest safely visible point from each anchor. */
    #pull(raw, radius) {
        if (raw.length <= 2) return raw;
        const out = [raw[0]];
        let anchor = 0;
        while (anchor < raw.length - 1) {
            let next = anchor + 1;
            for (let j = raw.length - 1; j > anchor + 1; j--) if (this.segmentClear(raw[anchor], raw[j], radius)) { next = j; break; }
            out.push(raw[next]); anchor = next;
        }
        return out;
    }
    #finish(points, visited, partial) {
        const f = this.#field, revisions = new Map();
        let length = 0;
        const note = p => { const n = f.chunk_cells, cx = Math.floor(f.cellOf(p[0]) / n), cy = Math.floor(f.cellOf(p[1]) / n), key = chunkKey(cx, cy); if (!revisions.has(key)) revisions.set(key, f.chunk(cx, cy).revision); };
        for (let i = 0; i < points.length; i++) {
            note(points[i]);
            if (!i) continue;
            const a = points[i - 1], b = points[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.ceil(d / (f.chunk_size / 2));
            length += d;
            for (let s = 1; s < steps; s++) note([a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps]);
        }
        return { points: points.map(p => [p[0], p[1]]), length, partial, visited_nodes: visited, dependencies: [...revisions] };
    }
}
