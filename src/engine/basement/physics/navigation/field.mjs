// ===== LV0 BASEMENT =====
import { BODY_GROUP, EPS, number, mask, validBounds } from '../core/values.mjs';
import { physical } from '../core/state.mjs';
import { pieces } from '../collision/shape.mjs';
import { segmentPieceDistance } from './geometry.mjs';

/**
 * Derived walkable-space clearance field.
 *
 * Each chunk caches, for every cell centre, the exact distance to the nearest
 * obstacle piece (capped at max_clearance). Obstacles are read only from the
 * world's one spatial grid when a chunk is (re)built. The field stores no body
 * references or memberships, so it is a cache of geometry, not another index.
 * Body changes mark the chunks they can influence as dirty; rebuilding is lazy,
 * so many edits between two searches cost one rebuild.
 */
const OFFSET = 2 ** 20, SPAN = 2 ** 21;
export const chunkKey = (cx, cy) => (cx + OFFSET) * SPAN + (cy + OFFSET);

export class navigationField {
    #world; #chunks = new Map(); #revision = 0; #found = [];
    #stats = { chunk_builds: 0, chunk_reuses: 0, cells_built: 0, piece_cells: 0, dirty_marks: 0, obstacle_updates: 0, exact_checks: 0 };
    constructor(world, { cell_size = 8, chunk_cells = 32, max_clearance = 64, obstacle_groups = BODY_GROUP.STATIC | BODY_GROUP.PROP } = {}) {
        this.#world = world;
        this.cell_size = number(cell_size, 'cell_size', 0.5, 1024);
        this.chunk_cells = number(chunk_cells, 'chunk_cells', 4, 256);
        if (!Number.isInteger(chunk_cells)) throw new TypeError('chunk_cells must be integral');
        this.max_clearance = number(max_clearance, 'max_clearance', cell_size, cell_size * 64);
        this.obstacle_groups = mask(obstacle_groups, 'obstacle_groups');
        this.chunk_size = this.cell_size * this.chunk_cells;
        Object.freeze(this);
    }
    get revision() { return this.#revision; }
    getConfig() { return { cell_size: this.cell_size, chunk_cells: this.chunk_cells, max_clearance: this.max_clearance, obstacle_groups: this.obstacle_groups }; }
    /** Characters, vehicles and projectiles are agents, never baked into walkable space. */
    isObstacle(r) {
        const c = r.config;
        return !r.removed && physical(r) && !c.ghost && !!(c.collision_group & this.obstacle_groups) && c.physics_type !== 'character';
    }
    _bodySynced(r) {
        const tracked = r.navigation_pose;
        if (!this.isObstacle(r)) { if (tracked) { r.navigation_pose = null; this.#dirty(tracked.bounds); } return; }
        if (tracked && tracked.x === r.position[0] && tracked.y === r.position[1] && tracked.rotation === r.rotation && tracked.shape === r.shape) return;
        const bounds = this.#bounds(r);
        if (tracked) this.#dirty(tracked.bounds);
        this.#dirty(bounds);
        r.navigation_pose = { x: r.position[0], y: r.position[1], rotation: r.rotation, shape: r.shape, bounds };
        this.#stats.obstacle_updates++;
    }
    _bodyRemoved(r) { const tracked = r.navigation_pose; if (tracked) { r.navigation_pose = null; this.#dirty(tracked.bounds); } }
    #bounds(r) {
        const b = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
        for (const p of pieces(r.shape, r.position, r.rotation)) {
            if (p.radius !== undefined) {
                b.left = Math.min(b.left, p.center[0] - p.radius); b.right = Math.max(b.right, p.center[0] + p.radius);
                b.top = Math.min(b.top, p.center[1] - p.radius); b.bottom = Math.max(b.bottom, p.center[1] + p.radius);
            } else for (const [x, y] of p.points) { b.left = Math.min(b.left, x); b.right = Math.max(b.right, x); b.top = Math.min(b.top, y); b.bottom = Math.max(b.bottom, y); }
        }
        return b;
    }
    /** Mark every built chunk whose cached clearance could change. */
    #dirty(bounds) {
        this.#revision++;
        if (!this.#chunks.size) return;
        const m = this.max_clearance, s = this.chunk_size;
        const x0 = Math.floor((bounds.left - m) / s), x1 = Math.floor((bounds.right + m) / s);
        const y0 = Math.floor((bounds.top - m) / s), y1 = Math.floor((bounds.bottom + m) / s);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.#chunks.size) {
            for (const chunk of this.#chunks.values()) if (chunk.cx >= x0 && chunk.cx <= x1 && chunk.cy >= y0 && chunk.cy <= y1) this.#mark(chunk);
            return;
        }
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const chunk = this.#chunks.get(chunkKey(cx, cy)); if (chunk) this.#mark(chunk); }
    }
    #mark(chunk) { if (!chunk.dirty) { chunk.dirty = true; this.#stats.dirty_marks++; } }
    /** Explicit invalidation for clients that change obstacle filters or authored blockers. */
    invalidateRegion(bounds) { this.#dirty(validBounds(bounds)); }
    invalidateAll() { this.#revision++; for (const chunk of this.#chunks.values()) this.#mark(chunk); }
    _clear() { this.#chunks.clear(); this.#revision++; }
    /** Returns a built, current chunk. */
    chunk(cx, cy) {
        const key = chunkKey(cx, cy);
        let chunk = this.#chunks.get(key);
        if (!chunk) { chunk = { cx, cy, key, clearance: new Float32Array(this.chunk_cells * this.chunk_cells), dirty: true, revision: 0 }; this.#chunks.set(key, chunk); }
        if (chunk.dirty) this.#build(chunk); else this.#stats.chunk_reuses++;
        return chunk;
    }
    /** Revision of an already built chunk, or -1 when it is missing or must be rebuilt. */
    chunkRevision(key) { const chunk = this.#chunks.get(key); return chunk && !chunk.dirty ? chunk.revision : -1; }
    #build(chunk) {
        const n = this.chunk_cells, cell = this.cell_size, cap = this.max_clearance, clearance = chunk.clearance;
        const ox = chunk.cx * n, oy = chunk.cy * n, left = ox * cell, top = oy * cell, right = left + this.chunk_size, bottom = top + this.chunk_size;
        clearance.fill(cap);
        const world = this.#world, found = world.spatial_grid.queryBounds({ left: left - cap, right: right + cap, top: top - cap, bottom: bottom + cap }, this.#found);
        for (const handle of found) {
            if (!handle?.body_id) continue;
            const r = world._record(handle);
            if (!this.isObstacle(r)) continue;
            for (const piece of pieces(r.shape, r.position, r.rotation)) this.#stamp(piece, clearance, ox, oy);
        }
        found.length = 0;
        chunk.dirty = false; chunk.revision++;
        this.#stats.chunk_builds++; this.#stats.cells_built += n * n;
    }
    /** Lowers the clearance of cells near one convex piece to their exact distance from it. */
    #stamp(piece, clearance, ox, oy) {
        const n = this.chunk_cells, cell = this.cell_size, cap = this.max_clearance;
        let l, r, t, b;
        if (piece.radius !== undefined) { l = piece.center[0] - piece.radius; r = piece.center[0] + piece.radius; t = piece.center[1] - piece.radius; b = piece.center[1] + piece.radius; }
        else { l = t = Infinity; r = b = -Infinity; for (const [x, y] of piece.points) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; } }
        const i0 = Math.max(0, Math.floor((l - cap) / cell - 0.5) - ox), i1 = Math.min(n - 1, Math.ceil((r + cap) / cell - 0.5) - ox);
        const j0 = Math.max(0, Math.floor((t - cap) / cell - 0.5) - oy), j1 = Math.min(n - 1, Math.ceil((b + cap) / cell - 0.5) - oy);
        if (i0 > i1 || j0 > j1) return;
        this.#stats.piece_cells += (i1 - i0 + 1) * (j1 - j0 + 1);
        if (piece.radius !== undefined) {
            const cx = piece.center[0], cy = piece.center[1], radius = piece.radius;
            for (let j = j0; j <= j1; j++) {
                const dy = (oy + j + 0.5) * cell - cy, row = j * n;
                for (let i = i0; i <= i1; i++) {
                    const d = Math.hypot((ox + i + 0.5) * cell - cx, dy) - radius, k = row + i;
                    if (d < clearance[k]) clearance[k] = d > 0 ? d : 0;
                }
            }
            return;
        }
        const pts = piece.points, count = pts.length;
        // Orientation-independent inside test: all edge cross products share one sign.
        let area = 0; for (let e = 0; e < count; e++) { const a = pts[e], c = pts[(e + 1) % count]; area += a[0] * c[1] - c[0] * a[1]; }
        const sign = area >= 0 ? 1 : -1;
        for (let j = j0; j <= j1; j++) {
            const py = (oy + j + 0.5) * cell, row = j * n;
            for (let i = i0; i <= i1; i++) {
                const px = (ox + i + 0.5) * cell, k = row + i;
                let inside = true, best = Infinity;
                for (let e = 0; e < count; e++) {
                    const a = pts[e], c = pts[(e + 1) % count], ex = c[0] - a[0], ey = c[1] - a[1], wx = px - a[0], wy = py - a[1];
                    if ((ex * wy - ey * wx) * sign < 0) inside = false;
                    const len = ex * ex + ey * ey, u = len > EPS ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / len)) : 0;
                    const dx = wx - ex * u, dy = wy - ey * u, d = dx * dx + dy * dy;
                    if (d < best) best = d;
                }
                const d = inside ? 0 : Math.sqrt(best);
                if (d < clearance[k]) clearance[k] = d;
            }
        }
    }
    cellOf(value) { return Math.floor(value / this.cell_size); }
    cellCenter(g) { return (g + 0.5) * this.cell_size; }
    /** Exact (capped) obstacle distance at a cell centre. */
    clearanceAtCell(gx, gy) {
        const n = this.chunk_cells, cx = Math.floor(gx / n), cy = Math.floor(gy / n);
        return this.chunk(cx, cy).clearance[(gy - cy * n) * n + (gx - cx * n)];
    }
    /** Conservative lower bound at any point (clearance is 1-Lipschitz). */
    clearanceAt(point) {
        const gx = this.cellOf(point[0]), gy = this.cellOf(point[1]);
        return this.clearanceAtCell(gx, gy) - Math.hypot(point[0] - this.cellCenter(gx), point[1] - this.cellCenter(gy));
    }
    /** Exact distance from a segment (or point) to field obstacles, capped at limit. Reads the shared grid. */
    exactSegmentClearance(a, b, limit = this.max_clearance) {
        const found = this.#world.spatial_grid.queryBounds({ left: Math.min(a[0], b[0]) - limit, right: Math.max(a[0], b[0]) + limit,
            top: Math.min(a[1], b[1]) - limit, bottom: Math.max(a[1], b[1]) + limit }, this.#found);
        let best = limit;
        this.#stats.exact_checks++;
        for (const handle of found) {
            if (!handle?.body_id) continue;
            const r = this.#world._record(handle);
            if (!this.isObstacle(r)) continue;
            for (const piece of pieces(r.shape, r.position, r.rotation)) {
                const d = segmentPieceDistance(a, b, piece);
                if (d < best) { best = d; if (!d) { found.length = 0; return 0; } }
            }
        }
        found.length = 0;
        return best;
    }
    getStatistics() { return { ...this.#stats, chunks: this.#chunks.size, revision: this.#revision }; }
}
