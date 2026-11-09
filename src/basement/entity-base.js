        // ===== LV0 BASEMENT =====
        // =====================================================================
        //  GAME ENTITY (Base Class)
        // =====================================================================
        /**
         * All game objects inherit from this.
         * Provides position, collision config, screen culling, and queue-based registration.
         * 
         * REGISTRATION FLOW:
         * 1. Entity constructor adds self to registrationQueue
         * 2. CollisionSystem.processQueue() processes all queued entities
         * 3. Entities get added to registry.all, registry.collidable, etc.
         * 4. Queue is cleared after processing
         */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                      ENTITY SYSTEM                                ║
        // ╚══════════════════════════════════════════════════════════════════╝
        class GameEntity {
            // === REGISTRATION QUEUE ===
            static registrationQueue = [];   // Entities waiting to be registered
            static queueEnabled = true;      // When false, register immediately (legacy support)
            
            // === STATIC REGISTRY ===
            static registry = {
                all: [],              // Every entity
                collidable: [],       // Entities with hasCollision: true
                byLayer: {},          // Grouped by collision layer name
                byType: {},           // Grouped by entity type (for targeted updates)
                revision: 0           // Bumped whenever a body joins or leaves `collidable`
            };
            
            // === COLLISION LAYERS (Bitmask) ===
            static LAYER = {
                NONE:       0,
                STATIC:     1,
                DYNAMIC:    2,
                ACTOR:      4,
                VEHICLE:    8,
                PROJECTILE: 16,
                TRIGGER:    32
            };
            
            // === COLLISION SHAPES ===
            static SHAPE = {
                AABB:   'AABB',       // Axis-aligned bounding box
                CIRCLE: 'CIRCLE',     // Circle (uses radius)
                OBB:    'OBB'         // Oriented bounding box (rotated rect)
            };
            
            // === PHYSICS BODY ===
            // Every entity has one (Blender's object physics, in this engine's terms):
            //   physics_type   'no_collision' (skipped by everything: an Empty) | 'static' (never moves) | 'dynamic' (moves,
            //                  doesn't spin) | 'rigid' (moves and spins) | 'character' (moved by its own code, pushes and is
            //                  pushed; never tips) — default from the layer: STATIC → static, DYNAMIC → rigid, ACTOR →
            //                  character, VEHICLE → dynamic, PROJECTILE → dynamic, TRIGGER → static ghost; no collision → no_collision
            //   ghost          meets nothing physically (no push either way), but its contacts are still reported
            //                  (onCollide) and mask queries still find it: triggers, sensors, sight
            //   shape          'circle' | 'box' (rotates with angle) | 'aabb' (doesn't)    (default: from collisionShape)
            //   group          the bit it belongs to (default: its collisionLayer; the game may name more: BODY_GROUPS)
            //   mask           the groups it collides with (default: all)
            //   ray_mask       which queries see it (a query passes its own bit; default: all): a raycast or overlap finds a
            //                  body when the query's mask includes its group and its ray_mask includes the query's bit
            //   mass, linear_damping, angular_damping (the share of its speed, or spin, lost each tick, 0..1; default: what
            //                  the old fields keep: 1 − knockbackFriction / friction / angularFriction), lock { x, y, rot }
            //                  (locked axes: rot by default for all but 'rigid', and for fixedRotation), ccd (swept: fast
            //                  movers can't pass through thin things)
            //   collisionWorld moves bodies (carry: what impulses gave a character; integrate: a rigid body's whole step)
            //   and pushes them (impulse): see basement/collision-kit.js THE BODY STEP
            static BODY_TYPES = ['no_collision', 'static', 'dynamic', 'rigid', 'character'];
            /** The body: what's set (`b`) wins; the rest follows the entity as it is now (its layer, shape, mass, flags). */
            static makeBody(e, b = {}) {
                const set = Object.assign({}, b || {}), L = GameEntity.LAYER;
                const derived = {
                    physics_type: () => { const layer = e.collisionLayer;
                        return !e.hasCollision || layer === L.NONE ? 'no_collision' : e.isStatic || layer === L.STATIC || layer === L.TRIGGER ? 'static'
                            : layer === L.DYNAMIC ? 'rigid' : layer === L.ACTOR ? 'character' : 'dynamic'; },
                    ghost: () => !!e.isTrigger || e.collisionLayer === L.TRIGGER,
                    shape: () => e.collisionShape === GameEntity.SHAPE.CIRCLE ? 'circle' : e.collisionShape === GameEntity.SHAPE.OBB ? 'box' : 'aabb',
                    group: () => e.collisionLayer, mask: () => 0xFFFF, ray_mask: () => 0xFFFF,
                    mass: () => e.mass,
                    linear_damping: () => 1 - (e.knockbackFriction ?? e.friction ?? 1),          // (what the old fields keep a tick)
                    angular_damping: () => 1 - (e.angularFriction ?? 1),
                    lock: () => { const r = (set.physics_type ?? derived.physics_type()) !== 'rigid' || !!e.fixedRotation; return { x: false, y: false, rot: r }; },
                    ccd: () => e.collisionLayer === L.PROJECTILE,
                };
                const body = {};
                for (const k in derived) Object.defineProperty(body, k, { enumerable: true, get: () => set[k] ?? derived[k](), set: (v) => { set[k] = v; } });
                Object.defineProperty(body, 'given', { value: set });   // what was set by hand (the rest follows the entity)
                return body;
            }

            // Auto-increment ID
            static _nextId = 1;
            
            constructor(config = {}) {
                // --- IDENTITY ---
                this.id = GameEntity._nextId++;
                this.type = config.type || 'entity';
                this.name = config.name || null;
                
                // --- TRANSFORM ---
                this.x = config.x ?? 0;
                this.y = config.y ?? 0;
                this.angle = config.angle ?? 0;
                
                // --- DIMENSIONS ---
                this.width = config.width ?? config.w ?? 20;
                this.height = config.height ?? config.h ?? 20;
                this.radius = config.radius ?? Math.max(this.width, this.height) / 2;
                
                // --- PHYSICS ---
                this.vx = config.vx ?? 0;
                this.vy = config.vy ?? 0;
                this.angularVel = config.angularVel ?? 0;
                this.mass = config.mass ?? 1;
                this.friction = config.friction ?? 0.8;
                this.restitution = config.restitution ?? 0.3;  // Bounciness
                this.isStatic = config.isStatic ?? false;
                
                // --- COLLISION CONFIG ---
                this.hasCollision = config.hasCollision ?? false;
                this.collisionShape = config.collisionShape ?? GameEntity.SHAPE.AABB;
                this.collisionLayer = config.collisionLayer ?? GameEntity.LAYER.NONE;
                this.collisionMask = config.collisionMask ?? 0xFFFF;
                this.isTrigger = config.isTrigger ?? false;
                // The physics body (Blender's terms): what the collision world needs to know, in one place
                this.body = GameEntity.makeBody(this, config.body);
                
                // --- LIFECYCLE ---
                this.active = true;
                this.visible = config.visible ?? true;
                this.markedForDestroy = false;
                
                // --- CUSTOM DATA ---
                this.data = config.data || {};
                
                // --- ENQUEUE FOR REGISTRATION ---
                this._enqueue();
            }
            
            // =====================
            //  REGISTRATION (Queue-Based)
            // =====================
            
            /**
             * Add entity to registration queue.
             * If queue is disabled, register immediately (legacy/runtime spawns).
             */
            _enqueue() {
                if (GameEntity.queueEnabled) {
                    GameEntity.registrationQueue.push(this);
                } else {
                    this._doRegister();
                }
            }
            
            /**
             * Actually register entity in registry.
             * Called by CollisionSystem.processQueue() or immediately if queue disabled.
             */
            _doRegister() {
                // Avoid double registration
                if (GameEntity.registry.all.includes(this)) return;
                
                GameEntity.registry.all.push(this);
                
                if (!GameEntity.registry.byType[this.type]) {
                    GameEntity.registry.byType[this.type] = [];
                }
                GameEntity.registry.byType[this.type].push(this);
                
                if (this.hasCollision) {
                    this._registerCollision();
                }
            }
            
            /**
             * Legacy method - now calls _doRegister
             */
            _register() {
                this._doRegister();
            }
            
            _registerCollision() {
                if (GameEntity.registry.collidable.includes(this)) return;
                
                GameEntity.registry.collidable.push(this);
                GameEntity.registry.revision++;   // the collision step re-sorts fixed from moving only when this moves
                
                const layerName = this._getLayerName();
                if (!GameEntity.registry.byLayer[layerName]) {
                    GameEntity.registry.byLayer[layerName] = [];
                }
                GameEntity.registry.byLayer[layerName].push(this);
            }
            
            _unregister() {
                let idx = GameEntity.registry.all.indexOf(this);
                if (idx > -1) GameEntity.registry.all.splice(idx, 1);
                
                if (GameEntity.registry.byType[this.type]) {
                    idx = GameEntity.registry.byType[this.type].indexOf(this);
                    if (idx > -1) GameEntity.registry.byType[this.type].splice(idx, 1);
                }
                
                if (this.hasCollision) {
                    this._unregisterCollision();
                }
            }
            
            _unregisterCollision() {
                let idx = GameEntity.registry.collidable.indexOf(this);
                if (idx > -1) { GameEntity.registry.collidable.splice(idx, 1); GameEntity.registry.revision++; }
                
                const layerName = this._getLayerName();
                if (GameEntity.registry.byLayer[layerName]) {
                    idx = GameEntity.registry.byLayer[layerName].indexOf(this);
                    if (idx > -1) GameEntity.registry.byLayer[layerName].splice(idx, 1);
                }
            }
            
            _getLayerName() {
                for (let name in GameEntity.LAYER) {
                    if (GameEntity.LAYER[name] === this.collisionLayer) return name;
                }
                return 'NONE';
            }
            
            // =====================
            //  STATIC QUEUE METHODS
            // =====================
            
            /**
             * Process all entities in registration queue.
             * Called once after map load to batch-register all entities.
             */
            static processQueue() {
                const count = GameEntity.registrationQueue.length;
                for (let entity of GameEntity.registrationQueue) {
                    entity._doRegister();
                }
                GameEntity.registrationQueue = [];
                return count;
            }
            
            /**
             * Clear queue without registering (used when discarding entities).
             */
            static clearQueue() {
                GameEntity.registrationQueue = [];
            }
            
            // =====================
            //  COLLISION GEOMETRY
            // =====================
            
            getBoundingBox() {
                if (this.collisionShape === GameEntity.SHAPE.OBB) {
                    const cos = Math.abs(Math.cos(this.angle));
                    const sin = Math.abs(Math.sin(this.angle));
                    const w = this.width * cos + this.height * sin;
                    const h = this.width * sin + this.height * cos;
                    return { x: this.x - w / 2, y: this.y - h / 2, w: w, h: h };
                }
                
                if (this.collisionShape === GameEntity.SHAPE.CIRCLE) {
                    return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
                }
                
                return { x: this.x, y: this.y, w: this.width, h: this.height };
            }
            
            getCenter() {
                if (this.collisionShape === GameEntity.SHAPE.OBB || 
                    this.collisionShape === GameEntity.SHAPE.CIRCLE) {
                    return { x: this.x, y: this.y };
                }
                return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
            }
            
            getOBB() {
                const center = this.getCenter();
                return {
                    x: center.x, y: center.y,
                    length: this.width, width: this.height,
                    angle: this.angle, mass: this.mass,
                    speed: Math.hypot(this.vx, this.vy),
                    vx: this.vx, vy: this.vy
                };
            }
            
            getCorners() {
                const center = this.getCenter();
                const cos = Math.cos(this.angle);
                const sin = Math.sin(this.angle);
                const hw = this.width / 2;
                const hh = this.height / 2;
                
                return [
                    { x: center.x + (hw * cos - (-hh) * sin), y: center.y + (hw * sin + (-hh) * cos) },
                    { x: center.x + (hw * cos - hh * sin),    y: center.y + (hw * sin + hh * cos) },
                    { x: center.x + ((-hw) * cos - hh * sin), y: center.y + ((-hw) * sin + hh * cos) },
                    { x: center.x + ((-hw) * cos - (-hh) * sin), y: center.y + ((-hw) * sin + (-hh) * cos) }
                ];
            }
            
            // =====================
            //  SCREEN CULLING
            // =====================
            
            isOnScreen(camera, canvas, margin = 100) {
                const center = this.getCenter();
                const screenX = (center.x - camera.x) * camera.zoom + canvas.width / 2;
                const screenY = (center.y - camera.y) * camera.zoom + canvas.height / 2;
                const size = Math.max(this.width, this.height, this.radius * 2);
                const screenSize = (size / 2 + margin) * camera.zoom;
                
                return (
                    screenX + screenSize > 0 &&
                    screenX - screenSize < canvas.width &&
                    screenY + screenSize > 0 &&
                    screenY - screenSize < canvas.height
                );
            }
            
            // =====================
            //  LIFECYCLE
            // =====================
            
            update(dt = 1) {
                if (!this.active || this.isStatic) return;
                
                this.x += this.vx * dt;
                this.y += this.vy * dt;
                this.angle += this.angularVel * dt;
                
                this.vx *= this.friction;
                this.vy *= this.friction;
                
                if (Math.abs(this.vx) < 0.01) this.vx = 0;
                if (Math.abs(this.vy) < 0.01) this.vy = 0;
            }
            
            draw(ctx) {
                if (!this.visible) return;
                
                ctx.save();
                const center = this.getCenter();
                ctx.translate(center.x, center.y);
                ctx.rotate(this.angle);
                
                ctx.strokeStyle = '#ff00ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(-this.width/2, -this.height/2, this.width, this.height);
                
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(this.width/2, 0);
                ctx.stroke();
                
                ctx.restore();
            }
            
            destroy() {
                this.markedForDestroy = true;
                this.active = false;
                this.vx = 0;
                this.vy = 0;
            }
            
            _finalDestroy() {
                this._unregister();
            }
            
            // =====================
            //  STATIC UTILITIES
            // =====================
            
            static getByType(type) {
                return GameEntity.registry.byType[type] || [];
            }
            
            static getByLayer(layerName) {
                return GameEntity.registry.byLayer[layerName] || [];
            }
            
            static getOnScreen(camera, canvas, margin = 200) {
                return GameEntity.registry.collidable.filter(e => 
                    e.active && e.isOnScreen(camera, canvas, margin)
                );
            }
            
            static clearAll() {
                GameEntity.registry.all = [];
                GameEntity.registry.collidable = [];
                GameEntity.registry.revision++;
                GameEntity.registry.byLayer = {};
                GameEntity.registry.byType = {};
            }
            
            /**
             * Re-register an entity after registry has been cleared.
             * Used during map transitions when props persist but registry is reset.
             */
            reregister() {
                // Only re-register if not already in registry
                if (!GameEntity.registry.all.includes(this)) {
                    this._register();
                }
            }
            
            static clearType(type) {
                const entities = GameEntity.registry.byType[type] || [];
                entities.forEach(e => e.destroy());
            }
            
            static cleanup() {
                const destroyed = GameEntity.registry.all.filter(e => e.markedForDestroy);
                destroyed.forEach(e => e._finalDestroy());
            }
        }


