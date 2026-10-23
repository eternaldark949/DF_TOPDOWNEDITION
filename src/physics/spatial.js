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

            /** The four corners of a box: centre x, y; `length` along `angle`, `width` across. */
            static corners(b) {
                const a = b.angle || 0, fx = Math.cos(a), fy = Math.sin(a), hl = (b.length || 0) / 2, hw = (b.width || 0) / 2;
                return [[b.x + fx * hl - fy * hw, b.y + fy * hl + fx * hw], [b.x + fx * hl + fy * hw, b.y + fy * hl - fx * hw],
                        [b.x - fx * hl + fy * hw, b.y - fy * hl - fx * hw], [b.x - fx * hl - fy * hw, b.y - fy * hl + fx * hw]];
            }
            static _inside(b, px, py, pad = 0.5) {
                const a = b.angle || 0, dx = px - b.x, dy = py - b.y;
                return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) <= (b.length || 0) / 2 + pad
                    && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= (b.width || 0) / 2 + pad;
            }
            /**
             * Where two overlapping boxes touch, with the normal (nx, ny) pointing from b to a: the
             * corners of each that are inside the other (a corner into a flat side, the usual
             * crash); averaged when several are, so a flat-on hit lands mid-face and twists nothing.
             */
            static contactPoint(a, b, nx, ny) {
                // Each with how deep it went (a's corners against the normal, b's along it): a fast car is
                // well in by the time it's caught, so only the deepest (the corner that struck first) counts
                const pts = [];
                if (b.length) for (const [x, y] of PhysicsSystem.corners(a)) if (PhysicsSystem._inside(b, x, y)) pts.push([x, y, -(x * nx + y * ny)]);
                if (a.length) for (const [x, y] of PhysicsSystem.corners(b)) if (PhysicsSystem._inside(a, x, y)) pts.push([x, y, x * nx + y * ny]);
                if (pts.length > 1) {
                    let deepest = -Infinity;
                    for (const p of pts) if (p[2] > deepest) deepest = p[2];
                    for (let i = pts.length - 1; i >= 0; i--) if (pts[i][2] < deepest - 2) pts.splice(i, 1);
                }
                if (!pts.length) {       // edge to edge: a's deepest corner along the normal
                    let best = null, bd = Infinity;
                    for (const c of PhysicsSystem.corners(a)) { const d = c[0] * nx + c[1] * ny; if (d < bd) { bd = d; best = c; } }
                    return best || [(a.x + b.x) / 2, (a.y + b.y) / 2];
                }
                let x = 0, y = 0;
                for (const p of pts) { x += p[0]; y += p[1]; }
                return [x / pts.length, y / pts.length];
            }

            /** How fast a car is turning (rad/tick): the driven car's yawRate, traffic's spin from a knock */
            static spinOf(c) { return c.controlMode === 'PLAYER' ? (c.yawRate || 0) : (c.spin || 0); }
            static setSpin(c, w) {
                const M = CONFIG.VEHICLE_DRIVE.YAW_SPIN_MAX;
                w = Math.max(-M, Math.min(M, w));
                if (c.controlMode === 'PLAYER') c.yawRate = w; else c.spin = w;
            }

            /**
             * One rigid-body impulse at a contact point P between bodies a and b (b may be
             * immovable: invM 0), normal n from b to a. Each body is { invM, invI, x, y, vx, vy, w }
             * (w = turn rate, rad/tick); velocities are changed in place. Bounce e along the normal,
             * Coulomb friction mu along the face. Because the push lands at P, not at the centre,
             * it turns the body as well as moving it: a front corner into a wall swings the tail
             * round to meet it, a shove on a rear quarter sends that end away.
             * Returns the closing speed it took out (0 when they were already parting).
             */
            static impulseAt(a, b, px, py, nx, ny, e, mu) {
                const r1x = px - a.x, r1y = py - a.y, r2x = px - b.x, r2y = py - b.y;
                const vpx = (a.vx - a.w * r1y) - (b.vx - b.w * r2y), vpy = (a.vy + a.w * r1x) - (b.vy + b.w * r2x);
                const vn = vpx * nx + vpy * ny;
                if (vn >= 0) return 0;
                const c1n = r1x * ny - r1y * nx, c2n = r2x * ny - r2y * nx;
                const kn = a.invM + b.invM + a.invI * c1n * c1n + b.invI * c2n * c2n;
                if (!(kn > 0)) return 0;
                const jn = -(1 + e) * vn / kn;
                const tx = -ny, ty = nx, vt = vpx * tx + vpy * ty;
                const c1t = r1x * ty - r1y * tx, c2t = r2x * ty - r2y * tx;
                const kt = a.invM + b.invM + a.invI * c1t * c1t + b.invI * c2t * c2t;
                const jt = Math.max(-mu * jn, Math.min(mu * jn, kt > 0 ? -vt / kt : 0));
                const Jx = jn * nx + jt * tx, Jy = jn * ny + jt * ty;
                a.vx += Jx * a.invM; a.vy += Jy * a.invM; a.w += a.invI * (r1x * Jy - r1y * Jx);
                b.vx -= Jx * b.invM; b.vy -= Jy * b.invM; b.w -= b.invI * (r2x * Jy - r2y * Jx);
                return -(1 + e) * vn;
            }

            /** A car as a rigid body for impulseAt (live: whether it can move at all) */
            static body(c, live) {
                if (!live) return { invM: 0, invI: 0, x: c.x, y: c.y, vx: 0, vy: 0, w: 0 };
                const m = c.mass || 1000, spins = !!(c.applyDrivePhysics && c.length);
                const L = c.length || 60, W = c.width || 30;
                const hasV = c.vx !== undefined;
                const vx = hasV ? c.vx : Math.cos(c.angle || 0) * (c.speed || 0), vy = hasV ? c.vy : Math.sin(c.angle || 0) * (c.speed || 0);
                return { invM: 1 / m, invI: spins ? 1 / (m * (L * L + W * W) / 12 * CONFIG.VEHICLE_DRIVE.SPIN_INERTIA) : 0,
                         x: c.x, y: c.y, vx, vy, w: spins ? PhysicsSystem.spinOf(c) : 0 };
            }
            /** Write a body's new velocity and turn back onto its car */
            static _store(c, B) {
                if (c.vx !== undefined) {
                    c.vx = B.vx; c.vy = B.vy;
                    c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
                } else if (c.speed !== undefined) c.speed = B.vx * Math.cos(c.angle || 0) + B.vy * Math.sin(c.angle || 0);
                if (B.invI > 0) PhysicsSystem.setSpin(c, B.w);
            }

            /**
             * Two cars (or a car and something immovable: mass Infinity) touching along normal (nx, ny),
             * pointing from c2 to c1, overlapping by depth. Pushes them apart by mass, then resolves the
             * hit as rigid bodies at the point where they meet (impulseAt): the closing speed comes out
             * with a little bounce and some scrub, and each car turns by where it was struck.
             */
            static carContact(c1, c2, nx, ny, depth) {
                const m1 = c1.isStatic ? Infinity : (c1.mass || 1000), m2 = c2.isStatic ? Infinity : (c2.mass || 1000);
                const w1 = isFinite(m1) ? (isFinite(m2) ? m2 / (m1 + m2) : 1) : 0;
                const w2 = isFinite(m2) ? (isFinite(m1) ? m1 / (m1 + m2) : 1) : 0;
                const [px, py] = PhysicsSystem.contactPoint(c1, c2, nx, ny);
                c1.x += nx * depth * w1; c1.y += ny * depth * w1;
                c2.x -= nx * depth * w2; c2.y -= ny * depth * w2;
                c1._lastImpact = c2._lastImpact = 0;
                const B1 = PhysicsSystem.body(c1, w1 > 0), B2 = PhysicsSystem.body(c2, w2 > 0);
                const v1x = B1.vx, v1y = B1.vy, v2x = B2.vx, v2y = B2.vy;
                const hit = PhysicsSystem.impulseAt(B1, B2, px + nx * depth * w1, py + ny * depth * w1, nx, ny, 0.2, 0.3);
                if (!hit) return;                                      // already separating
                // A nudge between two traffic cars (queues, merges) is driven out of; a real knock spins them
                const soft = hit < CONFIG.VEHICLE_DRIVE.KNOCK_MIN_HIT && c1.controlMode !== 'PLAYER' && c2.controlMode !== 'PLAYER';
                if (soft) B1.invI = B2.invI = 0;
                if (w1 > 0) PhysicsSystem._store(c1, B1);
                if (w2 > 0) PhysicsSystem._store(c2, B2);
                c1._lastContact = c2; c2._lastContact = c1;
                c1._lastImpact = c2._lastImpact = hit;
                // The driven car feels it (the spin is already in its yawRate)
                if (w1 > 0 && c1.controlMode === 'PLAYER' && c1.onImpact) c1.onImpact(Math.hypot(B1.vx - v1x, B1.vy - v1y));
                if (w2 > 0 && c2.controlMode === 'PLAYER' && c2.onImpact) c2.onImpact(Math.hypot(B2.vx - v2x, B2.vy - v2y));
                return hit;
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
        // caller arrays keep their original linear path. Registered arrays validate
        // slots/geometry once per simulation tick, never once per car or sight ray.
        // Known same-tick edits explicitly invalidate; replacement/length changes
        // rebuild immediately. Entries keep duplicate slots and original hit order.
        const _physicsSpatial = {
            records: new WeakMap(),
            track(items) {
                if (!items || this.records.has(items)) return;
                this.records.set(items, { grid: new OrderedRenderGrid(400), slots: [], geometry: [], epoch: -1, dirty: true, linear: false, entries: [], items: [], cellQueries: new Map(), cachedSlots: 0, gen: -1 });
            },
            invalidate(items) {
                if (!items) { this.clear(); return; }
                const c = this.records.get(items);
                if (c) c.dirty = true;
            },
            clear() { this.records = new WeakMap(); },
            _seq: 0,
            /** The geometry generation of a tracked array, validated for this tick (as query does); null when
                untracked or linear. Equal generations mean the same slots and the same x/y/w/h. */
            generation(items) {
                const c = items && this.records.get(items);
                if (!c) return null;
                if (c.dirty || c.slots.length !== items.length || c.epoch !== _simTick) this.refresh(items, c);
                return c.linear ? null : c.gen;
            },
            /** How far (x, y) is from the edge of the grid cells `bounds` covers: anything a query of those
                bounds didn't return lies wholly outside them, so at least this far away. */
            cellEdge(items, bounds, x, y) {
                const c = this.records.get(items), S = c.grid.cellSize;
                const x0 = Math.floor(bounds.left / S) * S, x1 = (Math.floor(bounds.right / S) + 1) * S;
                const y0 = Math.floor(bounds.top / S) * S, y1 = (Math.floor(bounds.bottom / S) + 1) * S;
                return Math.min(x - x0, x1 - x, y - y0, y1 - y);
            },
            refresh(items, c) {
                let changed = c.dirty || c.slots.length !== items.length;
                if (!changed && c.epoch !== _simTick) {
                    for (let i = 0; i < items.length; i++) {
                        const o = items[i], at = i * 4;
                        if (c.slots[i] !== o || !o || !Object.is(c.geometry[at], o.x) || !Object.is(c.geometry[at + 1], o.y) || !Object.is(c.geometry[at + 2], o.w) || !Object.is(c.geometry[at + 3], o.h)) { changed = true; break; }
                    }
                }
                if (changed) {
                    c.gen = ++this._seq;                 // unique across records, so a cleared-and-retracked array never matches an old one
                    c.cellQueries.clear(); c.cachedSlots = 0;
                    c.slots.length = items.length; c.geometry.length = items.length * 4;
                    c.linear = false;
                    for (let i = 0; i < items.length; i++) {
                        const o = items[i], at = i * 4;
                        if (!(i in items)) c.linear = true;
                        c.slots[i] = o;
                        c.geometry[at] = o && o.x; c.geometry[at + 1] = o && o.y; c.geometry[at + 2] = o && o.w; c.geometry[at + 3] = o && o.h;
                    }
                    c.grid.build(items, o => o && ({ left: o.x, right: o.x + o.w, top: o.y, bottom: o.y + o.h }));
                    c.dirty = false;
                }
                c.epoch = _simTick;
            },
            query(items, bounds) {
                if (!items) return items;
                const c = this.records.get(items);
                if (!c) return items;
                if (c.dirty || c.slots.length !== items.length || c.epoch !== _simTick) this.refresh(items, c);
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


