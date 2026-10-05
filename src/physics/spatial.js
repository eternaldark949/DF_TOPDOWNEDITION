        /* =====================================================================
           PHYSICS SYSTEM (OPTIMIZATION START)
           ---------------------------------------------------------------------
           A centralized engine for handling all collision geometry and response.
           
           GOAL: 
           Decouple "collision math" from "game entities". Entities simply
           feed their data (position, size, shape) to this system, and it
           returns collision results or applies resolution forces.
           
           SUPPORTED SHAPES:
           - Point (x, y)
           - Circle (x, y, radius)
           - AABB (Axis-Aligned Bounding Box - unrotated rectangles)
           - OBB (Oriented Bounding Box - rotated rectangles like cars)
           - Ray (Start, End - for shooting/sight)
           
           METHODS:
           - checkOverlap: Boolean detection
           - getSeparation: Returns vector to push objects apart
           - resolveElastic: Handles momentum transfer (bouncing)
           ===================================================================== */
        /* =====================================================================
           PHYSICS SYSTEM (SAT UPGRADE)
           ---------------------------------------------------------------------
           Replaces simple distance checks with Separating Axis Theorem (SAT).
           Guarantees solid collisions for rotated rectangles (OBBs).
           ===================================================================== */
        /* =====================================================================
           UNIFIED COLLISION SYSTEM
           Version: Alpha 4.3.0
           =====================================================================
           
           ARCHITECTURE OVERVIEW:
           ┌─────────────────────────────────────────────────────────────────────┐
           │                        GameEntity (Base)                           │
           │  ├── Position, Velocity, Angle                                     │
           │  ├── Collision Config (shape, layer, mask)                         │
           │  ├── Queue-based registration (enqueue on construct)               │
           │  └── Screen-space visibility culling                               │
           ├─────────────────────────────────────────────────────────────────────┤
           │                      CollisionSystem (Unified)                     │
           │  ├── Registration queue for batch entity loading                   │
           │  ├── SpatialHashGrid for broad-phase culling                       │
           │  ├── SAT-based narrow-phase (unified solver)                       │
           │  ├── Mass-based impulse transfer                                   │
           │  └── CollisionPacket format for all resolutions                    │
           ├─────────────────────────────────────────────────────────────────────┤
           │                    Entity Subclasses                               │
           │  ├── StaticEntity  → Walls, Buildings (AABB, infinite mass)        │
           │  ├── PropEntity    → Pushable objects (OBB, mass-based physics)    │
           │  ├── ActorEntity   → Characters (Circle, mass-based knockback)     │
           │  ├── VehicleEntity → Traffic cars (OBB, speed-based physics)       │
           │  └── ProjectileEntity → Bullets (Circle, trigger on hit)           │
           └─────────────────────────────────────────────────────────────────────┘
           
           COLLISION PIPELINE:
           1. Entities enqueue themselves on construction
           2. CollisionSystem.processQueue() registers all at map load
           3. Each frame: rebuild spatial grid → process by layer → resolve
           4. All resolutions use unified SAT solver + mass-based impulse
           
           COLLISION SHAPES:
           - CIRCLE: Actors, Projectiles (smooth movement, efficient)
           - AABB:   Static geometry (axis-aligned, no rotation)
           - OBB:    Props, Vehicles (rotatable, SAT collision)
           
           COLLISION LAYERS (Bitmask):
           - NONE:       0    → Decorative (no collision)
           - STATIC:     1    → Walls, Buildings (infinite mass)
           - DYNAMIC:    2    → Props (pushable, OBB)
           - ACTOR:      4    → Characters (circle)
           - VEHICLE:    8    → Cars (OBB, traffic system)
           - PROJECTILE: 16   → Bullets (trigger-only)
           - TRIGGER:    32   → Zones (overlap detection only)
           
           ===================================================================== */

        // =====================================================================
        //  PHYSICS SYSTEM (Legacy Compatibility Wrapper)
        // =====================================================================
        /**
         * Provides backward compatibility for traffic vehicle collisions.
         * Delegates to CollisionSystem's unified SAT solver.
         */
        class PhysicsSystem {
            /**
             * Resolve OBB collision between two vehicles.
             * Used by traffic system for vehicle-vehicle and vehicle-wall collisions.
             */
            static resolveOBBCollision(c1, c2) {
                // Use CollisionSystem's SAT solver
                const packet = CollisionSystem._satCollision(c1, c2);
                if (!packet) return false;
                PhysicsSystem.carContact(c1, c2, packet.nx, packet.ny, packet.depth);
                return true;
            }

            /**
             * Two cars (or a car and something immovable: mass Infinity) touching along normal (nx, ny),
             * pointing from c2 to c1, overlapping by depth. Pushes them apart by mass, then takes the
             * closing speed out of their real velocities (vx/vy — `speed` is only read back from those),
             * with a little bounce and some scrub along the contact. No random spin.
             */
            static carContact(c1, c2, nx, ny, depth) {
                const m1 = c1.isStatic ? Infinity : (c1.mass || 1000), m2 = c2.isStatic ? Infinity : (c2.mass || 1000);
                const w1 = isFinite(m1) ? (isFinite(m2) ? m2 / (m1 + m2) : 1) : 0;
                const w2 = isFinite(m2) ? (isFinite(m1) ? m1 / (m1 + m2) : 1) : 0;
                c1.x += nx * depth * w1; c1.y += ny * depth * w1;
                c2.x -= nx * depth * w2; c2.y -= ny * depth * w2;
                const vel = (c) => c.vx !== undefined ? [c.vx, c.vy] : [Math.cos(c.angle || 0) * (c.speed || 0), Math.sin(c.angle || 0) * (c.speed || 0)];
                const [ax, ay] = w1 > 0 ? vel(c1) : [0, 0], [bx, by] = w2 > 0 ? vel(c2) : [0, 0];
                const rvx = ax - bx, rvy = ay - by, rn = rvx * nx + rvy * ny;
                c1._lastImpact = c2._lastImpact = 0;
                if (rn >= 0) return;                                   // already separating
                const e = 0.2, jn = -(1 + e) * rn;                      // normal impulse (as a velocity change)
                const tx = -ny, ty = nx, rt = rvx * tx + rvy * ty, jt = -rt * 0.15;   // scrub along the contact
                const apply = (c, w, sgn) => {
                    if (w <= 0) return;
                    const dvx = sgn * w * (jn * nx + jt * tx), dvy = sgn * w * (jn * ny + jt * ty);
                    if (c.vx !== undefined) {
                        c.vx += dvx; c.vy += dvy;
                        c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
                    } else if (c.speed !== undefined) c.speed += dvx * Math.cos(c.angle || 0) + dvy * Math.sin(c.angle || 0);
                };
                apply(c1, w1, 1); apply(c2, w2, -1);
                c1._lastContact = c2; c2._lastContact = c1;
                c1._lastImpact = c2._lastImpact = jn;
                // The driven car feels it: a knock that twists it by where it was hit
                for (const [c, o, w, sgn] of [[c1, c2, w1, 1], [c2, c1, w2, -1]]) {
                    if (w <= 0 || c.controlMode !== 'PLAYER' || !c.onImpact) continue;
                    const fx = Math.cos(c.angle), fy = Math.sin(c.angle), hl = (c.length || 60) / 2;
                    const rf = Math.max(-hl, Math.min(hl, (o.x - c.x) * fx + (o.y - c.y) * fy));   // lever along the car
                    const Jx = sgn * w * jn * nx, Jy = sgn * w * jn * ny;
                    c.onImpact(w * jn, rf * (fx * Jy - fy * Jx) * CONFIG.VEHICLE_DRIVE.IMPACT_YAW / (hl * hl));
                }
                return jn;
            }
            
            /**
             * Point-in-AABB test (for UI/triggers).
             */
            static checkPointAABB(px, py, rect) {
                return (px >= rect.x && px <= rect.x + rect.w && 
                        py >= rect.y && py <= rect.y + rect.h);
            }
            
            /**
             * OBB vs AABB collision (treats AABB as infinite-mass OBB).
             */
            static checkOBBvsAABB(obb, aabb) {
                const aabbAsOBB = {
                    x: aabb.x + aabb.w / 2,
                    y: aabb.y + aabb.h / 2,
                    length: aabb.w,
                    width: aabb.h,
                    angle: 0,
                    mass: 10000000
                };
                return this.resolveOBBCollision(obb, aabbAsOBB);
            }
        }

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
                        const cell = this.cells.get(this._ckey(cx, cy));
                        if (!cell) continue;
                        for (let i = 0; i < cell.length; i++) {
                            const other = cell[i];
                            if (other !== entity && other._hashStamp !== stamp) { other._hashStamp = stamp; candidates.push(other); }
                        }
                    }
                }
                
                return candidates;
            }
            
            // Get all entities in a radius (for explosions, etc.)
            getInRadius(x, y, radius) {
                const stamp = ++this._stamp, results = [];
                
                const minCX = Math.floor((x - radius) / this.cellSize);
                const maxCX = Math.floor((x + radius) / this.cellSize);
                const minCY = Math.floor((y - radius) / this.cellSize);
                const maxCY = Math.floor((y + radius) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        const cell = this.cells.get(this._ckey(cx, cy));
                        if (!cell) continue;
                        for (let i = 0; i < cell.length; i++) {
                            const e = cell[i];
                            if (e._hashStamp === stamp) continue;
                            const dist = Math.hypot(e.x - x, e.y - y);
                            if (dist <= radius + e.radius) { e._hashStamp = stamp; results.push(e); }
                        }
                    }
                }
                
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


