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
                
                const { nx, ny, depth } = packet;
                
                // Mass-based separation
                const m1 = c1.mass || 1000;
                const m2 = c2.mass || 1000;
                const totalMass = m1 + m2;
                const t1 = m2 / totalMass;
                const t2 = m1 / totalMass;
                
                // Position separation
                c1.x += nx * depth * t1;
                c1.y += ny * depth * t1;
                c2.x -= nx * depth * t2;
                c2.y -= ny * depth * t2;
                
                // Speed-based velocity
                const v1x = Math.cos(c1.angle) * (c1.speed || 0);
                const v1y = Math.sin(c1.angle) * (c1.speed || 0);
                const v2x = Math.cos(c2.angle) * (c2.speed || 0);
                const v2y = Math.sin(c2.angle) * (c2.speed || 0);
                
                const relVel = (v1x - v2x) * nx + (v1y - v2y) * ny;
                
                if (relVel < 0) {
                    const restitution = 0.4;
                    const j = -(1 + restitution) * relVel * 0.5;
                    
                    if (c1.speed !== undefined) c1.speed += j * t1;
                    if (c2.speed !== undefined) c2.speed -= j * t2;
                    
                    // Angular spin
                    if (c1.angle !== undefined) c1.angle += (Math.random() - 0.5) * 0.1 * Math.abs(j);
                    if (c2.angle !== undefined) c2.angle -= (Math.random() - 0.5) * 0.1 * Math.abs(j);
                }
                
                // Friction slowdown
                if (c1.speed !== undefined) c1.speed *= 0.9;
                if (c2.speed !== undefined) c2.speed *= 0.9;
                
                return true;
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
        class SpatialHashGrid {
            constructor(cellSize = 200) {
                this.cellSize = cellSize;
                this.cells = new Map();
            }
            
            // Get cell key from world position
            _key(x, y) {
                const cx = Math.floor(x / this.cellSize);
                const cy = Math.floor(y / this.cellSize);
                return `${cx},${cy}`;
            }
            
            // Clear all cells (call at start of each frame)
            clear() {
                this.cells.clear();
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
                        const key = `${cx},${cy}`;
                        if (!this.cells.has(key)) {
                            this.cells.set(key, []);
                        }
                        this.cells.get(key).push(entity);
                    }
                }
            }
            
            // Get potential collision candidates for an entity
            getNearby(entity) {
                const bb = entity.getBoundingBox();
                const candidates = new Set();
                
                const minCX = Math.floor(bb.x / this.cellSize);
                const maxCX = Math.floor((bb.x + bb.w) / this.cellSize);
                const minCY = Math.floor(bb.y / this.cellSize);
                const maxCY = Math.floor((bb.y + bb.h) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        const key = `${cx},${cy}`;
                        const cell = this.cells.get(key);
                        if (cell) {
                            for (let other of cell) {
                                if (other !== entity) {
                                    candidates.add(other);
                                }
                            }
                        }
                    }
                }
                
                return Array.from(candidates);
            }
            
            // Get all entities in a radius (for explosions, etc.)
            getInRadius(x, y, radius) {
                const results = new Set();
                
                const minCX = Math.floor((x - radius) / this.cellSize);
                const maxCX = Math.floor((x + radius) / this.cellSize);
                const minCY = Math.floor((y - radius) / this.cellSize);
                const maxCY = Math.floor((y + radius) / this.cellSize);
                
                for (let cx = minCX; cx <= maxCX; cx++) {
                    for (let cy = minCY; cy <= maxCY; cy++) {
                        const key = `${cx},${cy}`;
                        const cell = this.cells.get(key);
                        if (cell) {
                            for (let e of cell) {
                                const dist = Math.hypot(e.x - x, e.y - y);
                                if (dist <= radius + e.radius) {
                                    results.add(e);
                                }
                            }
                        }
                    }
                }
                
                return Array.from(results);
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
             */
            query(bounds) {
                const results = new Set();
                
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


