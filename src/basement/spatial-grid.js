        // ===== LV0 BASEMENT =====
        // Spatial grids: broad-phase lookups that know nothing about any game. SpatialHashGrid (collision
        // neighbours), RenderGrid / OrderedRenderGrid (what's in view, in draw order), the physics item
        // cache, EffectRenderGrid, and TransitionGrid (exit zones by position).
        // =====================================================================
        //  SPATIAL HASH GRID (Broad-Phase Optimization)
        // =====================================================================
        /**
         * Divides the world into cells for O(1) neighbor lookups.
         * Dramatically reduces collision checks from O(n²) to O(n*k) where k = avg neighbors.
         */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                    SPATIAL HASH GRID                              ║
        // ╚══════════════════════════════════════════════════════════════════╝
        /* Broad-phase grid for collisions. Cells keyed by number, their arrays kept and emptied each clear;
           queries drop repeats with a per-query stamp instead of a Set (results in the same order). */
        class SpatialHashGrid {
            constructor(cellSize = 200) {
                this.cellSize = cellSize;
                this.cells = new Map();     // key → entities (arrays kept between frames)
                this._used = [];            // the arrays filled since the last clear
                this._stamp = 0;
            }
            
            // Cell key (a number) for cell (cx, cy)
            _ckey(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
            // Get cell key from world position
            _key(x, y) {
                return this._ckey(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
            }
            
            // Clear all cells (call at start of each frame)
            clear() {
                for (let i = 0; i < this._used.length; i++) this._used[i].length = 0;
                this._used.length = 0;
            }
            
            // Insert entity into appropriate cell(s)
            insert(entity) {
                const bb = entity.getBoundingBox();
                
                // Get all cells this entity overlaps
                const minCX = Math.floor(bb.x / this.cellSize);
                const maxCX = Math.floor((bb.x + bb.w) / this.cellSize);
                const minCY = Math.floor(bb.y / this.cellSize);
                const maxCY = Math.floor((bb.y + bb.h) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        const key = this._ckey(cx, cy);
                        let cell = this.cells.get(key);
                        if (!cell) { cell = []; this.cells.set(key, cell); }
                        if (!cell.length) this._used.push(cell);
                        cell.push(entity);
                    }
                }
            }
            
            // Get potential collision candidates for an entity
            getNearby(entity) {
                const bb = entity.getBoundingBox();
                const stamp = ++this._stamp, candidates = [];
                
                const minCX = Math.floor(bb.x / this.cellSize);
                const maxCX = Math.floor((bb.x + bb.w) / this.cellSize);
                const minCY = Math.floor(bb.y / this.cellSize);
                const maxCY = Math.floor((bb.y + bb.h) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        this._collectCell(this._ckey(cx, cy), stamp, candidates, entity);
                    }
                }
                
                return candidates;
            }

            // Cached static and refreshed dynamic cells retain the original insertion
            // order within each cell; concatenating two grids would change contacts.
            _collectCell(key, stamp, out, exclude = null) {
                const moving = this.cells.get(key), fixed = this._staticCells && this._staticCells.get(key);
                let i = 0, j = 0;
                const n = moving ? moving.length : 0, m = fixed ? fixed.length : 0;
                while (i < n || j < m) {
                    const e = j >= m || (i < n && moving[i]._collisionOrder < fixed[j]._collisionOrder) ? moving[i++] : fixed[j++];
                    if (e !== exclude && e._hashStamp !== stamp) { e._hashStamp = stamp; out.push(e); }
                }
            }
            
            // Get all entities in a radius (for explosions, etc.)
            getInRadius(x, y, radius) {
                const stamp = ++this._stamp, results = [], candidates = [];
                
                const minCX = Math.floor((x - radius) / this.cellSize);
                const maxCX = Math.floor((x + radius) / this.cellSize);
                const minCY = Math.floor((y - radius) / this.cellSize);
                const maxCY = Math.floor((y + radius) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        this._collectCell(this._ckey(cx, cy), stamp, candidates);
                    }
                }
                for (const e of candidates) if (Math.hypot(e.x - x, e.y - y) <= radius + e.radius) results.push(e);
                
                return results;
            }
        }

        // ============================================================================
        // RENDER GRID — Spatial hash for static geometry (walls, floors, crosswalks)
        // Built once on map load. Query by viewport bounds → O(visible cells) not O(N).
        // Items must have { x, y, w, h } properties.
        // ============================================================================
        class RenderGrid {
            constructor(cellSize = 400) {
                this.cellSize = cellSize;
                this.cells = new Map();
            }
            
            /**
             * Build the grid from an array of rect-like items.
             * Each item must have { x, y, w, h }.
             */
            build(items) {
                this.cells.clear();
                if (!items) return;
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const iw = item.w || 200;
                    const ih = item.h || 200;
                    
                    const minCX = Math.floor(item.x / this.cellSize);
                    const maxCX = Math.floor((item.x + iw) / this.cellSize);
                    const minCY = Math.floor(item.y / this.cellSize);
                    const maxCY = Math.floor((item.y + ih) / this.cellSize);
                    
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        for (let cy = minCY; cy <= maxCY; cy++) {
                            const key = (cx << 16) ^ cy; // Numeric key — faster than string
                            let cell = this.cells.get(key);
                            if (!cell) {
                                cell = [];
                                this.cells.set(key, cell);
                            }
                            cell.push(item);
                        }
                    }
                }
            }
            
            /**
             * Query all items overlapping the given viewport bounds.
             * Returns a Set (auto-deduplicates items spanning multiple cells).
             * @param {object} bounds - { left, right, top, bottom }
             * @param {Set} [results] - Optional caller-owned scratch set, cleared before use.
             */
            query(bounds, results = new Set()) {
                results.clear();
                
                const minCX = Math.floor(bounds.left / this.cellSize);
                const maxCX = Math.floor(bounds.right / this.cellSize);
                const minCY = Math.floor(bounds.top / this.cellSize);
                const maxCY = Math.floor(bounds.bottom / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        const key = (cx << 16) ^ cy;
                        const cell = this.cells.get(key);
                        if (cell) {
                            for (let i = 0; i < cell.length; i++) {
                                results.add(cell[i]);
                            }
                        }
                    }
                }
                
                return results;
            }
        }


        // Ordered broadphase for static buildings/foliage. Deduplicate ARRAY SLOTS,
        // so duplicate references still draw twice and foliage density keeps its original index.
        // Exact existing pass predicates run after the query; the grid never changes their margins.
        class OrderedRenderGrid {
            constructor(cellSize = 400) {
                this.cellSize = cellSize;
                this.cells = new Map();
                this.entries = [];
                this.always = [];
                this.stamp = 0;
            }

            build(items, boundsFor) {
                this.cells.clear(); this.entries.length = 0; this.always.length = 0;
                if (!items) return;
                items.forEach((item, index) => {
                    const entry = { item, index, stamp: 0, standardV2: false };
                    this.entries.push(entry);
                    const b = boundsFor(item, entry);
                    if (!b || ![b.left, b.right, b.top, b.bottom].every(Number.isFinite)) {
                        this.always.push(entry); return;
                    }
                    const x0 = Math.floor(Math.min(b.left, b.right) / this.cellSize), x1 = Math.floor(Math.max(b.left, b.right) / this.cellSize);
                    const y0 = Math.floor(Math.min(b.top, b.bottom) / this.cellSize), y1 = Math.floor(Math.max(b.top, b.bottom) / this.cellSize);
                    // Huge/invalid editor objects remain candidates without allocating a map-sized grid.
                    if (![x0, x1, y0, y1].every(Number.isSafeInteger) || (x1 - x0 + 1) * (y1 - y0 + 1) > 8192) { this.always.push(entry); return; }
                    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                        const key = x + ',' + y;
                        let cell = this.cells.get(key);
                        if (!cell) { cell = []; this.cells.set(key, cell); }
                        cell.push(entry);
                    }
                });
            }

            query(bounds, results) {
                results.length = 0;
                if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) {
                    for (const entry of this.entries) results.push(entry);
                    return results;
                }
                const x0 = Math.floor(bounds.left / this.cellSize), x1 = Math.floor(bounds.right / this.cellSize);
                const y0 = Math.floor(bounds.top / this.cellSize), y1 = Math.floor(bounds.bottom / this.cellSize);
                if (![x0, x1, y0, y1].every(Number.isSafeInteger) || x1 < x0 || y1 < y0 || (x1 - x0 + 1) * (y1 - y0 + 1) > 8192) {
                    for (const entry of this.entries) results.push(entry);
                    return results;
                }
                const stamp = ++this.stamp;
                for (const entry of this.always) { entry.stamp = stamp; results.push(entry); }
                for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                    const cell = this.cells.get(x + ',' + y);
                    if (cell) for (const entry of cell) if (entry.stamp !== stamp) {
                        entry.stamp = stamp; results.push(entry);
                    }
                }
                results.sort((a, b) => a.index - b.index);
                return results;
            }
        }

        // Static rectangle searches share an ordered, map-owned broadphase. Arbitrary
        // caller arrays keep their original linear path. Walls and buildings don't move
        // during play: a registered array is catalogued once and rebuilt only when it is
        // reported changed (invalidate, through GameEngine.invalidatePhysicsSpatial) or
        // grows or shrinks. Entries keep duplicate slots and original hit order.
        const _physicsSpatial = {
            records: new WeakMap(),
            track(items) {
                if (!items || this.records.has(items)) return;
                this.records.set(items, { grid: new OrderedRenderGrid(400), length: -1, dirty: true, linear: false, entries: [], items: [], cellQueries: new Map(), cachedSlots: 0 });
            },
            invalidate(items) {
                if (!items) { this.clear(); return; }
                const c = this.records.get(items);
                if (c) c.dirty = true;
            },
            clear() { this.records = new WeakMap(); },
            refresh(items, c) {
                c.cellQueries.clear(); c.cachedSlots = 0;
                c.linear = false;
                for (let i = 0; i < items.length; i++) if (!(i in items)) { c.linear = true; break; }
                c.grid.build(items, o => o && ({ left: o.x, right: o.x + o.w, top: o.y, bottom: o.y + o.h }));
                c.length = items.length; c.dirty = false;
            },
            query(items, bounds) {
                if (!items) return items;
                const c = this.records.get(items);
                if (!c) return items;
                if (c.dirty || c.length !== items.length) this.refresh(items, c);
                if (c.linear) return items;
                // Grid candidates depend on cell range, not the precise query rectangle.
                // Cars and sight rays repeatedly visit the same static cells. Cache their
                // ordered slot lists until geometry changes, with a bounded per-source FIFO.
                let key = null;
                if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.right) &&
                    Number.isFinite(bounds.top) && Number.isFinite(bounds.bottom)) {
                    const S = c.grid.cellSize, x0 = Math.floor(bounds.left / S), x1 = Math.floor(bounds.right / S);
                    const y0 = Math.floor(bounds.top / S), y1 = Math.floor(bounds.bottom / S);
                    if (Number.isSafeInteger(x0) && Number.isSafeInteger(x1) && Number.isSafeInteger(y0) && Number.isSafeInteger(y1) &&
                        x1 >= x0 && y1 >= y0 && (x1 - x0 + 1) * (y1 - y0 + 1) <= 8192) key = x0 + ':' + x1 + ':' + y0 + ':' + y1;
                }
                const cached = key === null ? null : c.cellQueries.get(key);
                if (cached) {
                    c.items.length = cached.length;
                    for (let i = 0; i < cached.length; i++) c.items[i] = cached[i];
                    return c.items;
                }
                c.grid.query(bounds, c.entries);
                c.items.length = c.entries.length;
                for (let i = 0; i < c.entries.length; i++) c.items[i] = c.entries[i].item;
                if (key !== null && c.items.length <= 1024) {
                    while (c.cellQueries.size && (c.cellQueries.size >= 256 || c.cachedSlots + c.items.length > 16384)) {
                        const oldest = c.cellQueries.keys().next().value;
                        c.cachedSlots -= c.cellQueries.get(oldest).length; c.cellQueries.delete(oldest);
                    }
                    c.cellQueries.set(key, c.items.slice()); c.cachedSlots += c.items.length;
                }
                return c.items;
            }
        };


        // Mutable static effect geometry is verified once per tick/draw. Every source slot
        // is retained, including duplicates and invisible lamp emitters. Unknown bounds stay live.
        class EffectRenderGrid extends OrderedRenderGrid {
            constructor() {
                super(); this.source = null; this.kind = null; this.checkedTick = this.checkedDraw = this.checkedTime = null;
                this.revision = -1;
            }
            refresh(items, kind, tick, draw, time, revision) {
                let changed = this.source !== items || this.kind !== kind || this.revision !== revision || this.entries.length !== items.length;
                if (!changed && this.checkedTick === tick && this.checkedDraw === draw && this.checkedTime === time) return;
                if (!changed) {
                    for (let i = 0; i < items.length; i++) {
                        const e = this.entries[i], item = items[i], r = kind === 'puddles' ? item.r : item.radius;
                        if (!e || e.item !== item || e.ex !== item.x || e.ey !== item.y || e.er !== r) { changed = true; break; }
                    }
                }
                if (changed) {
                    this.build(items, (item, e) => {
                        const r = kind === 'puddles' ? item.r : item.radius;
                        e.ex = item.x; e.ey = item.y; e.er = r;
                        if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || (r != null && !Number.isFinite(r))) return null;
                        // Lamp body queries use anchors; light/material/rain queries retain their
                        // own radii. A missing lamp radius still has the original 200px fallback.
                        const reach = kind === 'puddles' ? Math.abs(r || 0) + 10 : Math.max(0, r || 0, Math.abs((r || 200) * 0.6));
                        return { left: item.x - reach, right: item.x + reach, top: item.y - reach, bottom: item.y + reach };
                    });
                    this.source = items; this.kind = kind; this.revision = revision;
                }
                this.checkedTick = tick; this.checkedDraw = draw; this.checkedTime = time;
            }
        }

        /**
         * TransitionGrid — O(1) spatial lookup for map transition zones.
         * Replaces per-frame Array.find() scans with cell-based hash lookup.
         */
        class TransitionGrid {
            constructor(cellSize = 100) {
                this.cellSize = cellSize;
                this.cells = new Map();
                this._targetMap = new Map(); // O(1) lookup by target name
            }
            
            build(transitions) {
                this.cells.clear();
                this._targetMap.clear();
                if (!transitions) return;
                for (const t of transitions) {
                    // Spatial cells
                    const minCX = Math.floor(t.x / this.cellSize);
                    const maxCX = Math.floor((t.x + t.w) / this.cellSize);
                    const minCY = Math.floor(t.y / this.cellSize);
                    const maxCY = Math.floor((t.y + t.h) / this.cellSize);
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        for (let cy = minCY; cy <= maxCY; cy++) {
                            const key = (cx << 16) | (cy & 0xFFFF);
                            let cell = this.cells.get(key);
                            if (!cell) { cell = []; this.cells.set(key, cell); }
                            cell.push(t);
                        }
                    }
                    // Target name index
                    if (t.target) this._targetMap.set(t.target, t);
                }
            }
            
            /** Find transition containing point (px, py). Returns transition or null. */
            query(px, py) {
                const cx = Math.floor(px / this.cellSize);
                const cy = Math.floor(py / this.cellSize);
                const key = (cx << 16) | (cy & 0xFFFF);
                const cell = this.cells.get(key);
                if (!cell) return null;
                for (const t of cell) {
                    if (px > t.x && px < t.x + t.w && py > t.y && py < t.y + t.h) return t;
                }
                return null;
            }
            
            /** Find transition by target map name. O(1). */
            findByTarget(targetName) {
                return this._targetMap.get(targetName) || null;
            }
        }


