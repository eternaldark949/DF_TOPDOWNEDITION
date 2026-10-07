        /**
         * =====================================================================
         *  VEHICLE ENTITY (Base Class for Traffic Vehicles)
         * =====================================================================
         * Base class for all vehicles in the game. Provides:
         * - OBB (oriented bounding box) collision via CollisionSystem
         * - VEHICLE collision layer for projectile interactions
         * - Mass-based physics with speed/velocity
         * - Proper entity registration/lifecycle management
         * 
         * Subclasses:
         * - TrafficVehicle (AI driving, player hijacking)
         * 
         * Usage:
         *   class MyVehicle extends VehicleEntity {
         *       constructor(x, y) {
         *           super({ x, y, length: 70, width: 35, mass: 1200 });
         *       }
         *   }
         */
        class VehicleEntity extends GameEntity {
            constructor(config) {
                const length = config.length || 70;
                const width = config.width || 35;
                
                super({
                    ...config,
                    type: config.type || 'vehicle',
                    // Use length/width for dimensions (vehicles are longer than wide)
                    width: length,
                    height: width,
                    hasCollision: config.hasCollision !== false,
                    collisionShape: GameEntity.SHAPE.OBB,
                    collisionLayer: GameEntity.LAYER.VEHICLE,
                    // Vehicles collide with static geometry and other vehicles
                    collisionMask: config.collisionMask ?? (
                        GameEntity.LAYER.STATIC | 
                        GameEntity.LAYER.VEHICLE |
                        GameEntity.LAYER.PROJECTILE
                    ),
                    mass: config.mass ?? 1200,  // Default car mass in kg
                    friction: config.friction ?? 0.96,
                    restitution: config.restitution ?? 0.4
                });
                
                // Vehicle-specific dimensions
                this.length = length;
                // Note: 'width' is overloaded - GameEntity uses it for bounding box,
                // but vehicles use it for the shorter dimension (perpendicular to travel)
                this.vehicleWidth = width;
                
                // Physics state
                this.speed = config.speed || 0;
                
                // Death state for cleanup
                this.dead = false;
            }
            
            /**
             * Get OBB (Oriented Bounding Box) for SAT collision.
             * Center-based for accurate rotation.
             * @returns {Object} OBB data for collision system
             */
            getOBB() {
                return {
                    x: this.x,
                    y: this.y,
                    length: this.length,
                    width: this.vehicleWidth,
                    angle: this.angle || 0,
                    mass: this.mass,
                    speed: this.speed,
                    vx: this.vx || 0,
                    vy: this.vy || 0
                };
            }
            
            /**
             * Get bounding box for spatial hash grid.
             * Uses max of length/width to account for rotation.
             * @returns {{x: number, y: number, w: number, h: number}}
             */
            getBoundingBox() {
                // Use the diagonal as the bounding radius to handle any rotation
                const maxDim = Math.hypot(this.length, this.vehicleWidth);
                return {
                    x: this.x - maxDim / 2,
                    y: this.y - maxDim / 2,
                    w: maxDim,
                    h: maxDim
                };
            }
            
            /**
             * Get the center position.
             * Vehicles store position at center (unlike props which use corner).
             * @returns {{x: number, y: number}}
             */
            getCenter() {
                return { x: this.x, y: this.y };
            }
            
            /**
             * Handle projectile hit on this vehicle.
             * Override in subclasses for custom behavior (explosions, damage, etc.)
             * @param {ProjectileEntity} projectile - The projectile that hit
             * @param {Object} game - Game reference
             */
            onProjectileHit(projectile, game) {
                // Default: spawn sparks and apply impulse
                if (game && game.weather) {
                    game.weather.spawnSparks(this.x, this.y, 8);
                }
                
                // Apply damage-based knockback
                const projSpeed = Math.hypot(projectile.vx, projectile.vy);
                if (projSpeed > 0) {
                    const dirX = projectile.vx / projSpeed;
                    const dirY = projectile.vy / projSpeed;
                    const impulseStrength = (projectile.damage * projSpeed * 0.02) / (this.mass * 0.01);
                    this.vx = (this.vx || 0) + dirX * impulseStrength;
                    this.vy = (this.vy || 0) + dirY * impulseStrength;
                }
            }
            
            /**
             * Mark vehicle for destruction.
             * Properly cleans up entity registration.
             */
            die() {
                if (this.dead) return;
                this.dead = true;
                this.active = false;
                // Will be cleaned up by GameEntity.cleanup()
                this.destroy();
            }
            
            /**
             * Default draw - override in subclasses.
             * @param {CanvasRenderingContext2D} ctx 
             */
            draw(ctx) {
                if (!this.visible) return;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                
                ctx.fillStyle = '#444';
                ctx.fillRect(-this.length / 2, -this.vehicleWidth / 2, 
                             this.length, this.vehicleWidth);
                
                ctx.restore();
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  BUMPER CAR — Lightweight bouncy vehicle for Biggs Amusement Park
        //  Extends VehicleEntity. High restitution, low mass, spark effects.
        // ════════════════════════════════════════════════════════════════════════
        class BumperCar extends VehicleEntity {
            constructor(config) {
                super({
                    x: config.x || 0,
                    y: config.y || 0,
                    length: 42,
                    width: 30,
                    mass: 300,
                    friction: 0.92,
                    restitution: 0.85,
                    type: 'bumper_car',
                    collisionMask: GameEntity.LAYER.STATIC | GameEntity.LAYER.VEHICLE
                });
                
                this.angle = config.angle || 0;
                this.speed = 0;
                this.vx = 0;
                this.vy = 0;
                this.maxSpeed = 5.5;
                this.handling = 0.12;
                this.accel = 0.6;
                
                // Visuals
                this.bodyColor = config.bodyColor || '#ff00aa';
                this.bumperColor = config.bumperColor || '#444';
                this.labelChar = config.labelChar || '?';
                
                // AI state (null for player car)
                this.isAI = config.isAI || false;
                this.aiTarget = null;
                this.aiSwitchTimer = 0;
                this.aiReverseTimer = 0;
                this.aiAggression = 0.5 + Math.random() * 0.5; // 0.5–1.0 — throttle & steering gain
                // How hard this driver biases target selection toward whoever is
                // currently winning. Deliberately independent of aiAggression, which
                // only governs how hard they drive: a calm driver can still hunt the
                // leader by arithmetic (Josh) and a flat-out one can ignore the
                // scoreboard entirely (Max). One number couldn't express both.
                // Default is near-zero — unnamed filler cars don't do math.
                this.aiLeaderFocus = config.aiLeaderFocus ?? 0.1;
                this.stuckTimer = 0;
                this.lastX = this.x;
                this.lastY = this.y;
                
                // Scoring
                this.hitScore = 0;
                this.hitCooldown = 0;
                this.lastHitBy = null;
                
                // Effects
                this._sparkTimer = 0;
                this._shakeAmount = 0;
            }
            
            updateAI(allCars, walls, dt) {
                if (!this.isAI) return;
                
                this.aiSwitchTimer--;
                
                // Stuck detection — if barely moved in 30 frames, reverse
                if (this._sparkTimer % 30 === 0) {
                    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
                    if (moved < 5) {
                        this.aiReverseTimer = 20 + Math.random() * 20;
                        this.angle += (Math.random() - 0.5) * 1.5; // Random turn to unstick
                    }
                    this.lastX = this.x;
                    this.lastY = this.y;
                }
                this._sparkTimer++;
                
                // Pick target — distance-weighted, with a pull toward whoever is
                // currently winning. Aggressive drivers hunt the leader; timid ones
                // mostly chase whoever's closest. While every score is still 0 the
                // lead term vanishes and this behaves exactly like pure proximity,
                // so the comeback pressure only switches on once someone pulls ahead.
                if (!this.aiTarget || this.aiSwitchTimer <= 0) {
                    const candidates = allCars.filter(c => c !== this && !c.dead);
                    if (candidates.length > 0) {
                        let topScore = 0;
                        for (const c of candidates) {
                            if ((c.hitScore || 0) > topScore) topScore = c.hitScore;
                        }
                        // How many px of distance a full score-lead is "worth".
                        // At leaderFocus 1.0 the leader reads ~480px closer than they are.
                        const LEAD_PULL = 480;
                        let best = null;
                        let bestCost = Infinity;
                        for (const c of candidates) {
                            const dist = Math.hypot(c.x - this.x, c.y - this.y);
                            const lead = topScore > 0 ? (c.hitScore || 0) / topScore : 0; // 0–1
                            // Original ±150 jitter retained so targeting stays unpredictable.
                            const cost = dist
                                - lead * LEAD_PULL * this.aiLeaderFocus
                                + (Math.random() - 0.5) * 300;
                            if (cost < bestCost) { bestCost = cost; best = c; }
                        }
                        this.aiTarget = best;
                    }
                    this.aiSwitchTimer = 60 + Math.floor(Math.random() * 120);
                }
                
                // Drive toward target
                let gas = 0, turn = 0;
                
                if (this.aiReverseTimer > 0) {
                    // Reversing to unstick
                    gas = -0.7;
                    turn = (Math.random() - 0.5) * 2;
                    this.aiReverseTimer--;
                } else if (this.aiTarget) {
                    const dx = this.aiTarget.x - this.x;
                    const dy = this.aiTarget.y - this.y;
                    const targetAngle = Math.atan2(dy, dx);
                    let angleDiff = targetAngle - this.angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    turn = clamp(angleDiff * 2.5 * this.aiAggression, -1, 1);
                    gas = this.aiAggression * (1.0 - Math.abs(angleDiff) * 0.3);
                    gas = Math.max(0.3, gas);
                }
                
                this.manualGas = gas;
                this.manualTurn = turn;
                this._applyBumperPhysics(walls);
            }
            
            updateManualDriving(walls) {
                this._applyBumperPhysics(walls);
            }
            
            _applyBumperPhysics(walls) {
                if (typeof this.vx === 'undefined') { this.vx = 0; this.vy = 0; }
                this.hitCooldown = Math.max(0, this.hitCooldown - 1);
                
                // Steering
                if (Math.abs(this.speed) > 0.3) {
                    const direction = this.speed > 0 ? 1 : -1;
                    this.angle += this.manualTurn * this.handling * direction;
                }
                
                // Acceleration
                if (Math.abs(this.manualGas) > 0.1) {
                    this.vx += Math.cos(this.angle) * this.manualGas * this.accel;
                    this.vy += Math.sin(this.angle) * this.manualGas * this.accel;
                }
                
                // Forward/lateral decomposition
                const fwdX = Math.cos(this.angle);
                const fwdY = Math.sin(this.angle);
                const rightX = -Math.sin(this.angle);
                const rightY = Math.cos(this.angle);
                
                let fwdVel = this.vx * fwdX + this.vy * fwdY;
                let slideVel = this.vx * rightX + this.vy * rightY;
                
                // Grip — bumper cars have high lateral grip (no drifting, just bouncing)
                slideVel *= 0.8;
                
                // Speed cap
                fwdVel = clamp(fwdVel, -this.maxSpeed * 0.5, this.maxSpeed);
                
                // Reconstruct velocity
                this.vx = fwdX * fwdVel + rightX * slideVel;
                this.vy = fwdY * fwdVel + rightY * slideVel;
                
                // Drag
                this.vx *= 0.96;
                this.vy *= 0.96;
                
                // Speed scalar
                this.speed = fwdVel;
                
                // Move
                this.x += this.vx;
                this.y += this.vy;
                
                // Wall collision (simple AABB push-out with bounce)
                if (walls) {
                    for (const w of walls) {
                        const hw = this.length / 2;
                        const hh = this.vehicleWidth / 2;
                        if (this.x + hw > w.x && this.x - hw < w.x + w.w &&
                            this.y + hh > w.y && this.y - hh < w.y + w.h) {
                            // Find smallest overlap axis
                            const overlapL = (this.x + hw) - w.x;
                            const overlapR = (w.x + w.w) - (this.x - hw);
                            const overlapT = (this.y + hh) - w.y;
                            const overlapB = (w.y + w.h) - (this.y - hh);
                            const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
                            
                            if (minOverlap === overlapL) { this.x = w.x - hw; this.vx = -Math.abs(this.vx) * 0.6; }
                            else if (minOverlap === overlapR) { this.x = w.x + w.w + hw; this.vx = Math.abs(this.vx) * 0.6; }
                            else if (minOverlap === overlapT) { this.y = w.y - hh; this.vy = -Math.abs(this.vy) * 0.6; }
                            else { this.y = w.y + w.h + hh; this.vy = Math.abs(this.vy) * 0.6; }
                            
                            this.speed *= 0.6;
                            this._shakeAmount = Math.max(this._shakeAmount, 1.5);
                        }
                    }
                }
                
                // Decay shake
                this._shakeAmount *= 0.85;
                
                // Map bounds clamp (hard safety net)
                if (this._mapBounds) {
                    const margin = this.length / 2 + 5;
                    if (this.x < margin) { this.x = margin; this.vx = Math.abs(this.vx) * 0.5; }
                    if (this.x > this._mapBounds.w - margin) { this.x = this._mapBounds.w - margin; this.vx = -Math.abs(this.vx) * 0.5; }
                    if (this.y < margin) { this.y = margin; this.vy = Math.abs(this.vy) * 0.5; }
                    if (this.y > this._mapBounds.h - margin) { this.y = this._mapBounds.h - margin; this.vy = -Math.abs(this.vy) * 0.5; }
                }
                
                this.manualGas = 0;
                this.manualTurn = 0;
            }
            
            /**
             * Check collision against another BumperCar (circle-based for simplicity + bounciness)
             */
            checkBumperCollision(other, game) {
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.hypot(dx, dy);
                // Collision radius from average of both dimensions + bumper ring
                const r1 = (this.length + this.vehicleWidth) / 4 + 3;
                const r2 = (other.length + other.vehicleWidth) / 4 + 3;
                const minDist = r1 + r2;
                
                if (dist < minDist && dist > 0) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;
                    
                    // Separate
                    this.x -= nx * overlap * 0.5;
                    this.y -= ny * overlap * 0.5;
                    other.x += nx * overlap * 0.5;
                    other.y += ny * overlap * 0.5;
                    
                    // Relative velocity along collision normal
                    const dvx = this.vx - other.vx;
                    const dvy = this.vy - other.vy;
                    const relVelN = dvx * nx + dvy * ny;
                    
                    // Only resolve if approaching
                    if (relVelN > 0) {
                        const bounce = 1.0 + this.restitution; // Extra bouncy
                        const impulse = relVelN * bounce; // 2× bounce back
                        
                        this.vx -= impulse * nx;
                        this.vy -= impulse * ny;
                        other.vx += impulse * nx;
                        other.vy += impulse * ny;
                        
                        // Angular impulse — spin on off-center hits
                        const cross = dx * dvy - dy * dvx;
                        this.angle -= cross * 0.0003;
                        other.angle += cross * 0.0003;
                    }
                    
                    // Impact strength for effects
                    const impactSpeed = Math.abs(relVelN);
                    
                    // Sparks on any real contact
                    if (impactSpeed > 0.3) {
                        const sparkX = (this.x + other.x) / 2;
                        const sparkY = (this.y + other.y) / 2;
                        if (game && game.weather) {
                            game.weather.spawnSparks(sparkX, sparkY, Math.floor(impactSpeed * 4));
                        }
                        
                        // Screen shake
                        const shake = Math.min(impactSpeed * 0.8, 6);
                        this._shakeAmount = Math.max(this._shakeAmount, shake);
                        other._shakeAmount = Math.max(other._shakeAmount, shake);
                    }
                    
                    // Scoring — only front-facing collisions count
                    // Check if each car's front is aimed toward the other
                    const angleThisToOther = Math.atan2(dy, dx);
                    const angleOtherToThis = Math.atan2(-dy, -dx);
                    
                    let faceDiffThis = angleThisToOther - this.angle;
                    while (faceDiffThis > Math.PI) faceDiffThis -= Math.PI * 2;
                    while (faceDiffThis < -Math.PI) faceDiffThis += Math.PI * 2;
                    
                    let faceDiffOther = angleOtherToThis - other.angle;
                    while (faceDiffOther > Math.PI) faceDiffOther -= Math.PI * 2;
                    while (faceDiffOther < -Math.PI) faceDiffOther += Math.PI * 2;
                    
                    const frontAngle = Math.PI / 3; // ±60° cone
                    
                    if (Math.abs(faceDiffThis) < frontAngle && this.hitCooldown <= 0) {
                        this.hitScore++;
                        this.hitCooldown = 10;
                        // Quips
                        if (this.driverName) captionSystem.bumperCarQuip(this.driverName, 'hit');
                        if (other.driverName) captionSystem.bumperCarQuip(other.driverName, 'gotHit');
                    }
                    if (Math.abs(faceDiffOther) < frontAngle && other.hitCooldown <= 0) {
                        other.hitScore++;
                        other.hitCooldown = 10;
                        // Quips
                        if (other.driverName) captionSystem.bumperCarQuip(other.driverName, 'hit');
                        if (this.driverName) captionSystem.bumperCarQuip(this.driverName, 'gotHit');
                    }
                    
                    return true;
                }
                return false;
            }
            
            draw(ctx) {
                if (!this.visible) return;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // Apply screen shake offset
                if (this._shakeAmount > 0.2) {
                    ctx.translate(
                        (Math.random() - 0.5) * this._shakeAmount * 2,
                        (Math.random() - 0.5) * this._shakeAmount * 2
                    );
                }
                
                ctx.rotate(this.angle);
                
                const L = this.length;
                const W = this.vehicleWidth;
                
                // Rubber bumper ring (outer)
                ctx.fillStyle = this.bumperColor;
                ctx.beginPath();
                ctx.roundRect(-L/2 - 3, -W/2 - 3, L + 6, W + 6, 10);
                ctx.fill();
                
                // Body
                ctx.fillStyle = this.bodyColor;
                ctx.beginPath();
                ctx.roundRect(-L/2, -W/2, L, W, 6);
                ctx.fill();
                
                // Body highlight stripe
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fillRect(-L/2 + 4, -W/2 + 2, L - 8, W * 0.3);
                
                // Windshield
                ctx.fillStyle = 'rgba(100,200,255,0.25)';
                ctx.beginPath();
                ctx.roundRect(L/2 - 10, -W/2 + 4, 8, W - 8, 2);
                ctx.fill();
                
                // Headlights
                ctx.fillStyle = '#ffffcc';
                ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.arc(L/2 - 1, -W/2 + 5, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(L/2 - 1, W/2 - 5, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1.0;
                
                // Taillights
                ctx.fillStyle = '#ff2222';
                ctx.fillRect(-L/2, -W/2 + 3, 3, 4);
                ctx.fillRect(-L/2, W/2 - 7, 3, 4);
                
                // Number label on roof
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Orbitron, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.labelChar, 0, 0);
                
                ctx.restore();
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  FERRIS WHEEL — Animated top-down ferris wheel for Biggs Amusement Park
        //  Renders as a foreshortened ellipse with rotating gondolas.
        // ════════════════════════════════════════════════════════════════════════
        // Paint-only culling: never changes emitters, collision, animation updates or reflection queries.
        // Two backing-canvas pixels cover antialiasing; invalid/custom geometry stays live.
        function worldPaintBoxInView(ctx, view, zoom, x, y, left, top, right, bottom, angle = 0) {
            if (!view || !Number.isFinite(zoom) || zoom <= 0 ||
                !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle) ||
                !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom) ||
                right < left || bottom < top || !Number.isFinite(view.left) || !Number.isFinite(view.right) ||
                !Number.isFinite(view.top) || !Number.isFinite(view.bottom) || view.right < view.left || view.bottom < view.top ||
                (ctx.filter && ctx.filter !== 'none') || ctx.shadowBlur > 0 || ctx.shadowOffsetX || ctx.shadowOffsetY ||
                (ctx.globalCompositeOperation && ctx.globalCompositeOperation !== 'source-over')) return true;
            const c = Math.cos(angle), s = Math.sin(angle), mx = (left + right) / 2, my = (top + bottom) / 2;
            const cx = x + c * mx - s * my, cy = y + s * mx + c * my;
            const hw = Math.abs(c) * (right - left) / 2 + Math.abs(s) * (bottom - top) / 2;
            const hh = Math.abs(s) * (right - left) / 2 + Math.abs(c) * (bottom - top) / 2;
            const pad = 2 / zoom + 1e-7 * Math.max(1, Math.abs(cx), Math.abs(cy), hw, hh);
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(hw) || !Number.isFinite(hh) || !Number.isFinite(pad)) return true;
            return cx + hw + pad >= view.left && cx - hw - pad <= view.right &&
                   cy + hh + pad >= view.top && cy - hh - pad <= view.bottom;
        }

        function ferrisPaintInView(wheel, ctx, view, zoom, top) {
            if (!wheel || wheel[top ? 'drawTop' : 'drawBase'] !== FerrisWheel.prototype[top ? 'drawTop' : 'drawBase']) return true;
            if (view && wheel.x >= view.left && wheel.x <= view.right && wheel.y >= view.top && wheel.y <= view.bottom) return true;
            const R = wheel.wheelRadius, hg = wheel.rimGap / 2, sf = R / 140;
            if (!Number.isFinite(R) || R <= 0 || !Number.isFinite(hg) || hg < 0 ||
                !Number.isFinite(wheel.axleHeight) || !Number.isFinite(wheel.angle) ||
                !Number.isFinite(wheel.gondolaCount) || wheel.gondolaCount < 0 || wheel.gondolaCount > 256) return true;
            let left, right, low, high;
            if (top) {
                // Rims/spokes, lit gondola halos, hubs, arms and height-dependent ground shadows.
                const minSO = (wheel.axleHeight - R) * 0.12, maxSO = (wheel.axleHeight + R) * 0.12;
                left = Math.min(-R - 2, -R - 23.76 * sf, -8 * sf - 1, -R + minSO + 3 * sf - 21.78 * sf);
                right = Math.max(R + 2, R + 23.76 * sf, 8 * sf + 1, R + maxSO + 3 * sf + 21.78 * sf);
                low = Math.min(-hg - 9 * sf - 1, -29.76 * sf, minSO - 4.05 * sf);
                high = Math.max(hg + 9 * sf + 1, 35.86 * sf, maxSO + 14.05 * sf);
            } else {
                const support = Math.max(hg, R * 0.25) + 3 * sf;
                left = Math.min(-R * 0.2 - 3 * sf, 5 * sf - R - 10);
                right = Math.max(R * 0.2 + 3 * sf, 5 * sf + R + 10);
                low = Math.min(-support, 7 * sf - hg - 18);
                high = Math.max(support, 7 * sf + hg + 18);
            }
            return worldPaintBoxInView(ctx, view, zoom, wheel.x, wheel.y, left, low, right, high, wheel.facing);
        }

        const _ferrisGondolaBuffers = new WeakMap();
        function ferrisGondolaBuffer(wheel) {
            const n = wheel.gondolaCount;
            // Preserve legacy/custom count behavior without retaining an unbounded allocation.
            if (!Number.isInteger(n) || n < 0 || n > 256) return null;
            let b = _ferrisGondolaBuffers.get(wheel);
            if (!b) { b = { records: [], order: [] }; _ferrisGondolaBuffers.set(wheel, b); }
            b.records.length = b.order.length = n;
            for (let i = 0; i < n; i++) {
                const g = b.records[i] || (b.records[i] = { x: 0, height: 0, nh: 0, ci: i });
                // Restore original index order before sorting, including equal-height ties.
                b.order[i] = g;
            }
            return b;
        }

        class FerrisWheel {
            constructor(x, y, config = {}) {
                this.x = x; this.y = y;
                this.wheelRadius = config.radius || 560;
                this.axleHeight = config.axleHeight || 600;
                this.rotationSpeed = config.speed || 0.003;
                this.gondolaCount = config.gondolas || 8;
                this.angle = 0;
                this.facing = config.facing || 0;
                this.rimGap = config.rimGap || 112;
                this.rimColor = config.rimColor || '#8a6a20';
                this.hubColor = config.hubColor || '#d4af37';
                this.spokeColor = config.spokeColor || '#5a4a18';
                this.strutColor = config.strutColor || '#3a2a10';
                this.gondolaColors = config.gondolaColors || [
                    '#ff8800','#aa00ff','#dc143c','#00bfbf','#ff69b4','#d4af37','#4488ff','#22dd44'
                ];
            }
            update() {
                this.angle += this.rotationSpeed;
                if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;
            }
            draw(ctx) { this.drawBase(ctx); this.drawTop(ctx); }
            
            drawBase(ctx) {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.facing);
                const R = this.wheelRadius;
                const hg = this.rimGap / 2;
                const sf = R / 140;

                // ─── A-FRAME SUPPORTS ───
                const legSpread = R * 0.2;
                const legLength = R * 0.25;
                ctx.strokeStyle = this.strutColor; ctx.lineWidth = 6 * sf; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-legSpread, legLength); ctx.lineTo(0, hg); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(legSpread, legLength); ctx.lineTo(0, hg); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-legSpread, -legLength); ctx.lineTo(0, -hg); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(legSpread, -legLength); ctx.lineTo(0, -hg); ctx.stroke();
                const bw = 3 * sf;
                ctx.lineWidth = bw; ctx.strokeStyle = darkenHex(this.strutColor, 10);
                ctx.beginPath(); ctx.moveTo(-legSpread*0.6, legLength*0.55); ctx.lineTo(legSpread*0.6, legLength*0.55); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-legSpread*0.6, -legLength*0.55); ctx.lineTo(legSpread*0.6, -legLength*0.55); ctx.stroke();
                ctx.lineWidth = bw * 0.7;
                ctx.beginPath(); ctx.moveTo(-legSpread*0.7, legLength*0.4); ctx.lineTo(-legSpread*0.7, -legLength*0.4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(legSpread*0.7, legLength*0.4); ctx.lineTo(legSpread*0.7, -legLength*0.4); ctx.stroke();

                // ─── GROUND SHADOW ───
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.beginPath(); ctx.ellipse(5*sf, 7*sf, R+10, hg+18, 0, 0, Math.PI*2); ctx.fill();

                ctx.restore();
            }
            
            drawTop(ctx) {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.facing);
                const R = this.wheelRadius;
                const axleH = this.axleHeight;
                const hg = this.rimGap / 2;
                const shadowScale = 0.12;
                const sf = R / 140;

                // ─── RIMS ───
                const rimT = 3 * sf;
                for (const ry of [-hg, hg]) {
                    ctx.fillStyle = this.rimColor;
                    ctx.beginPath(); ctx.roundRect(-R-2, ry-rimT/2, (R+2)*2, rimT, rimT*0.5); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.fillRect(-R, ry-rimT/2, R*2, rimT*0.3);
                }

                // ─── CROSS-TIES ───
                ctx.strokeStyle = darkenHex(this.rimColor, 20);
                ctx.lineWidth = 1.5*sf; ctx.globalAlpha = 0.35;
                const tieCount = Math.max(16, Math.floor(R / 8));
                for (let i = 0; i < tieCount; i++) {
                    const ta = this.angle + (i/tieCount)*Math.PI*2;
                    const tx = Math.cos(ta)*R;
                    ctx.beginPath(); ctx.moveTo(tx, -hg); ctx.lineTo(tx, hg); ctx.stroke();
                }
                ctx.globalAlpha = 1.0;

                // ─── SPOKES ───
                ctx.strokeStyle = this.spokeColor; ctx.lineWidth = 1.5*sf; ctx.globalAlpha = 0.5;
                for (let i = 0; i < this.gondolaCount; i++) {
                    const sa = this.angle + (i/this.gondolaCount)*Math.PI*2;
                    const sx = Math.cos(sa)*R;
                    ctx.beginPath(); ctx.moveTo(0, -hg); ctx.lineTo(sx, -hg); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, hg); ctx.lineTo(sx, hg); ctx.stroke();
                }
                ctx.globalAlpha = 1.0;

                // ─── GONDOLAS ───
                const gondolaBuffer = ferrisGondolaBuffer(this);
                const gondolas = gondolaBuffer ? gondolaBuffer.order : [];
                for (let i = 0; i < this.gondolaCount; i++) {
                    const ga = this.angle + (i/this.gondolaCount)*Math.PI*2;
                    const rimX = Math.cos(ga)*R;
                    const height = Math.sin(ga)*R + axleH;
                    const nh = (height-(axleH-R))/(R*2);
                    if (gondolaBuffer) {
                        const g = gondolas[i]; g.x = rimX; g.height = height; g.nh = nh;
                    } else gondolas.push({ x: rimX, height, nh, ci: i });
                }
                gondolas.sort((a, b) => a.height - b.height);

                for (const g of gondolas) {
                    const color = this.gondolaColors[g.ci % this.gondolaColors.length];
                    const s = 0.6 + g.nh * 0.5;
                    const gw = 18 * s * sf;
                    const gh = 22 * s * sf;
                    const py = -g.nh * 6 * sf;

                    // Shadow
                    const so = g.height * shadowScale;
                    ctx.fillStyle = `rgba(0,0,0,${0.06+g.nh*0.14})`;
                    ctx.beginPath(); ctx.ellipse(g.x+so+3*sf, py+so+8*sf, gw*1.1, gh*0.25, 0, 0, Math.PI*2); ctx.fill();

                    // Suspension arms
                    ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5*s*sf;
                    ctx.beginPath(); ctx.moveTo(g.x, -hg); ctx.lineTo(g.x - gw*0.25, py + 1.5*s*sf); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(g.x, hg); ctx.lineTo(g.x + gw*0.25, py + 1.5*s*sf); ctx.stroke();

                    // Body
                    ctx.fillStyle = color;
                    ctx.beginPath(); ctx.roundRect(g.x-gw/2, py+2*s*sf, gw, gh, 4*s*sf); ctx.fill();

                    // Roof
                    ctx.fillStyle = darkenHex(color, 50);
                    ctx.beginPath(); ctx.roundRect(g.x-gw/2-2*sf, py+0.5*s*sf, gw+4*sf, 4*s*sf, 2.5*s*sf); ctx.fill();

                    // Side trim
                    ctx.fillStyle = darkenHex(color, 25);
                    ctx.fillRect(g.x-gw/2+1*sf, py+5*s*sf, 2*sf, gh-5*s*sf);
                    ctx.fillRect(g.x+gw/2-3*sf, py+5*s*sf, 2*sf, gh-5*s*sf);

                    // Windows
                    ctx.fillStyle = 'rgba(150,200,255,0.2)';
                    const ww = gw*0.28, wh = gh*0.28, wy = py+6.5*s*sf;
                    ctx.fillRect(g.x-ww-1.5*sf, wy, ww, wh);
                    ctx.fillRect(g.x+1.5*sf, wy, ww, wh);
                    ctx.strokeStyle = darkenHex(color, 30); ctx.lineWidth = 0.5*sf;
                    ctx.strokeRect(g.x-ww-1.5*sf, wy, ww, wh);
                    ctx.strokeRect(g.x+1.5*sf, wy, ww, wh);

                    // Floor bar
                    ctx.fillStyle = darkenHex(color, 60);
                    ctx.fillRect(g.x-gw/2, py+gh+1*s*sf, gw, 2.5*s*sf);

                    // Peak glow
                    if (g.nh > 0.82) {
                        const gi = (g.nh-0.82)*3;
                        ctx.fillStyle = `rgba(255,200,50,${gi*0.15})`;
                        ctx.beginPath(); ctx.arc(g.x, py+gh/2, gw*1.2, 0, Math.PI*2); ctx.fill();
                    }
                }

                // ─── AXLE HUBS ───
                const hubR = 6 * sf;
                const hubInR = 3.5 * sf;
                for (const ry of [-hg, hg]) {
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.beginPath(); ctx.arc(2*sf, ry+3*sf, hubR+1, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = this.hubColor;
                    ctx.beginPath(); ctx.arc(0, ry, hubR, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = darkenHex(this.hubColor, 35);
                    ctx.beginPath(); ctx.arc(0, ry, hubInR, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.25)';
                    ctx.beginPath(); ctx.arc(-1.5*sf, ry-1.5*sf, hubInR*0.5, 0, Math.PI*2); ctx.fill();
                }
                // Axle bar
                ctx.strokeStyle = darkenHex(this.hubColor, 20); ctx.lineWidth = 3*sf;
                ctx.beginPath(); ctx.moveTo(0, -hg); ctx.lineTo(0, hg); ctx.stroke();

                ctx.restore();
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        //  BUMPER CAR MINIGAME — Manages arena rounds, AI, scoring, timer, HUD
        //  Activated when player interacts with Biggs NPC in the arena map.
        // ════════════════════════════════════════════════════════════════════════
        class BumperCarMinigame {
            constructor() {
                this.active = false;
                this.cars = [];         // All bumper cars (player + AI)
                this.playerCar = null;
                this.timer = 0;         // Frames remaining
                this.roundDuration = 60 * 60; // 60 seconds at 60fps
                this.entryCost = 75;    // PP to enter
                this.hudTimer = null;
                this.hudBoard = null;
                this._bars = null;
                this._resultsShown = false;
            }
            
            /**
             * Start a bumper car round.
             * @param {Object} game - GameEngine reference
             */
            start(game) {
                if (this.active) return;
                
                // Check funds
                if ((game.currency || 0) < this.entryCost) {
                    showMessage(`NEED ${this.entryCost} PERSONICS TO ENTER CRASH ROYALE.`);
                    return;
                }
                game.currency -= this.entryCost;
                showMessage('CRASH ROYALE — 60 SECONDS — GO!');
                
                this.active = true;
                this.timer = this.roundDuration;
                this.cars = [];
                this._resultsShown = false;
                this._hiddenTeammates = [];
                
                // Hide HUD elements during minigame
                ['ui-currency', 'ui-scrap', 'ui-health', 'ui-flit-bar-container', 'ui-equipment', 'btn-phone', 'btn-heal'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                
                // Spawn positions (spread around arena center)
                const cx = 450, cy = 400;
                const spawnPoints = [
                    { x: cx, y: cy - 120, angle: Math.PI / 2 },       // Top center (player)
                    { x: cx - 200, y: cy - 80, angle: 0.3 },
                    { x: cx + 200, y: cy - 80, angle: 2.8 },
                    { x: cx - 180, y: cy + 100, angle: -0.5 },
                    { x: cx + 180, y: cy + 100, angle: 3.6 },
                    { x: cx - 80, y: cy + 180, angle: -1.2 },
                    { x: cx + 80, y: cy + 180, angle: 1.8 },
                ];
                
                // Player car
                this.playerCar = new BumperCar({
                    x: spawnPoints[0].x, y: spawnPoints[0].y,
                    angle: spawnPoints[0].angle,
                    bodyColor: '#d4af37', bumperColor: '#555',
                    labelChar: '★', isAI: false
                });
                this.playerCar.driverName = 'YOU';
                this.cars.push(this.playerCar);
                
                // Gather recruited teammates
                const recruitedTeammates = (game.teammates || []).filter(t => t.recruited && !t.downed);
                

                
                // AI filler colors for remaining slots
                const fillerColors = [
                    { body: '#00ccff', label: 'A' },
                    { body: '#ff6600', label: 'B' },
                    { body: '#22dd44', label: 'C' },
                    { body: '#ffcc00', label: 'D' },
                    { body: '#cc44ff', label: 'E' },
                    { body: '#ff4466', label: 'F' },
                ];

                // Per-driver AI personality. The two axes are intentionally
                // uncorrelated: aggression is how hard they drive, leaderFocus is how
                // much they steer toward the scoreboard leader. Josh drives calmly and
                // hunts the winner by arithmetic; Max drives flat out and hits whoever
                // is nearest. Unlisted teammates fall back to the middle of both.
                const TEAMMATE_DRIVING = {
                    'Victoria': { aggression: 1.00, leaderFocus: 0.85 }, // ego — wants the top dog
                    'Max':      { aggression: 0.95, leaderFocus: 0.15 }, // no math, all throttle
                    'Sabrina':  { aggression: 0.75, leaderFocus: 0.50 }, // enjoys the chaos
                    'Yenna':    { aggression: 0.60, leaderFocus: 0.75 }, // patient, picks her shot
                    'Josh':     { aggression: 0.55, leaderFocus: 1.00 }, // pure optimisation
                };
                const DEFAULT_DRIVING = { aggression: 0.75, leaderFocus: 0.40 };
                
                let slotIndex = 1;
                let fillerIndex = 0;
                
                // Put teammates in bumper cars first
                for (const tm of recruitedTeammates) {
                    if (slotIndex >= spawnPoints.length) break;
                    const sp = spawnPoints[slotIndex];
                    const color = (APPEARANCES[tm.name] || {}).accent || '#888';   // their signature colour (core/appearances.js)
                    const initial = tm.name.charAt(0).toUpperCase();
                    
                    const car = new BumperCar({
                        x: sp.x, y: sp.y, angle: sp.angle,
                        bodyColor: color,
                        bumperColor: '#333',
                        labelChar: initial,
                        isAI: true
                    });
                    car.driverName = tm.name;
                    const drive = TEAMMATE_DRIVING[tm.name] || DEFAULT_DRIVING;
                    // ±0.05 wobble on aggression so repeat rounds aren't identical.
                    // leaderFocus stays exact — that's the axis carrying the
                    // characterisation, and blurring it would muddy the read.
                    car.aiAggression = clamp(drive.aggression + (Math.random() - 0.5) * 0.1, 0.3, 1.0);
                    car.aiLeaderFocus = drive.leaderFocus;
                    this.cars.push(car);
                    slotIndex++;
                    
                    // Hide the teammate NPC during the round
                    tm.inCar = true;
                    tm.seatIndex = -1; // Prevent vehicle combat trigger
                    this._hiddenTeammates.push(tm);
                }
                
                // Fill remaining slots with generic AI
                while (slotIndex < spawnPoints.length) {
                    const sp = spawnPoints[slotIndex];
                    const filler = fillerColors[fillerIndex % fillerColors.length];
                    const car = new BumperCar({
                        x: sp.x, y: sp.y, angle: sp.angle,
                        bodyColor: filler.body,
                        bumperColor: '#333',
                        labelChar: filler.label,
                        isAI: true
                    });
                    car.driverName = `CAR ${filler.label}`;
                    // Filler bands sit below every teammate's aggression and well below
                    // their leaderFocus, so the crew reads as distinct drivers rather
                    // than blending into the pack. Previously fillers rolled 0.5–1.0
                    // and out-aggressed a random teammate ~40% of the time.
                    car.aiAggression = 0.45 + Math.random() * 0.25; // 0.45–0.70
                    car.aiLeaderFocus = Math.random() * 0.20;       // 0.00–0.20
                    this.cars.push(car);
                    slotIndex++;
                    fillerIndex++;
                }
                
                // Set map bounds on all bumper cars for clamping
                const mapBounds = { w: game.activeMap.width, h: game.activeMap.height };
                for (const car of this.cars) {
                    car._mapBounds = mapBounds;
                }
                
                // Put player in car
                game.isDriving = true;
                game.car = this.playerCar;
                game.player.visible = false;
                
                // Disable map transitions during game
                this._savedTransitions = game.activeMap.transitions;
                game.activeMap.transitions = [];
                
                // Create HUD overlay
                this._createHUD();
            }
            
            update(game) {
                if (!this.active) return;
                
                const walls = game.activeMap.walls;
                
                // Update timer
                this.timer--;
                
                // Player driving input
                let inputX = 0, inputY = 0;
                if (game.keys) {
                    if (game.keys['w'] || game.keys['ArrowUp']) inputY = -1;
                    if (game.keys['s'] || game.keys['ArrowDown']) inputY = 1;
                    if (game.keys['a'] || game.keys['ArrowLeft']) inputX = -1;
                    if (game.keys['d'] || game.keys['ArrowRight']) inputX = 1;
                }
                if (game.joystick && game.joystick.active) {
                    inputX = game.joystick.dx;
                    inputY = game.joystick.dy;
                }
                
                // Apply input to player car
                if (this.playerCar) {
                    let gas = 0, turn = 0;
                    const inputMag = Math.hypot(inputX, inputY);
                    if (inputMag > 0.15) {
                        const inputAngle = Math.atan2(inputY, inputX);
                        let angleDiff = inputAngle - this.playerCar.angle;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        turn = clamp(angleDiff * 2.0, -1, 1);
                        gas = inputMag * (1.0 - Math.abs(angleDiff / Math.PI) * 0.5);
                        if (Math.abs(angleDiff) > Math.PI * 0.75) gas = -0.5; // Reverse if facing away
                    }
                    this.playerCar.manualGas = gas;
                    this.playerCar.manualTurn = turn;
                    this.playerCar.updateManualDriving(walls);
                    
                    // Position player entity on car
                    game.player.x = this.playerCar.x;
                    game.player.y = this.playerCar.y;
                    game.player.angle = this.playerCar.angle;
                    
                    // Apply screen shake to camera
                    if (this.playerCar._shakeAmount > 0.5 && game.camera) {
                        game.camera.shakeX = (Math.random() - 0.5) * this.playerCar._shakeAmount * 3;
                        game.camera.shakeY = (Math.random() - 0.5) * this.playerCar._shakeAmount * 3;
                    }
                }
                
                // Update AI cars
                for (const car of this.cars) {
                    if (car.isAI) {
                        car.updateAI(this.cars, walls);
                    }
                }
                
                // Car-vs-car collisions
                for (let i = 0; i < this.cars.length; i++) {
                    for (let j = i + 1; j < this.cars.length; j++) {
                        this.cars[i].checkBumperCollision(this.cars[j], game);
                    }
                }
                
                // Update HUD
                this._updateHUD();
                
                // Time's up
                if (this.timer <= 0 && !this._resultsShown) {
                    this._endRound(game);
                }
            }
            
            draw(ctx, camera) {
                if (!this.active) return;
                for (const car of this.cars) {
                    car.draw(ctx);
                }
            }
            
            _endRound(game) {
                this._resultsShown = true;
                this.active = false;
                
                // Restore HUD elements
                ['ui-currency', 'ui-scrap', 'ui-health', 'ui-flit-bar-container', 'ui-equipment', 'btn-phone'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = '';
                });
                const healBtn = document.getElementById('btn-heal');
                if (healBtn) healBtn.style.display = 'flex';
                
                // Exit car
                game.isDriving = false;
                game.car = game.ownedCar;
                game.player.visible = true;
                game.player.x = 450;
                game.player.y = 750;
                
                // Restore transitions
                if (this._savedTransitions) {
                    game.activeMap.transitions = this._savedTransitions;
                }
                
                // Restore hidden teammates
                if (this._hiddenTeammates) {
                    for (const tm of this._hiddenTeammates) {
                        tm.inCar = false;
                        tm.seatIndex = -1;
                        tm.x = game.player.x + (Math.random() - 0.5) * 60;
                        tm.y = game.player.y + 30 + Math.random() * 30;
                    }
                    this._hiddenTeammates = [];
                }
                
                // Sort results
                const results = [...this.cars].sort((a, b) => b.hitScore - a.hitScore);
                const playerRank = results.indexOf(this.playerCar) + 1;
                const playerHits = this.playerCar.hitScore;
                
                // Prize determination
                let prizeLabel = '';
                let prizePP = 0;
                let medalColor = '#888';
                let medalGlow = 'transparent';
                if (playerRank === 1) {
                    prizeLabel = '1ST PLACE';
                    prizePP = 200;
                    medalColor = '#ffd700';
                    medalGlow = 'rgba(255,215,0,0.4)';
                } else if (playerRank === 2) {
                    prizeLabel = '2ND PLACE';
                    prizePP = 100;
                    medalColor = '#c0c0c0';
                    medalGlow = 'rgba(192,192,192,0.3)';
                } else if (playerRank === 3) {
                    prizeLabel = '3RD PLACE';
                    prizePP = 100;
                    medalColor = '#cd7f32';
                    medalGlow = 'rgba(205,127,50,0.3)';
                } else {
                    prizeLabel = `${playerRank}TH PLACE`;
                    prizePP = 25;
                }
                
                game.currency = (game.currency || 0) + prizePP;
                
                // Relationship boost for teammates who participated
                for (const car of this.cars) {
                    if (car.driverName && car !== this.playerCar) {
                        const tm = (game.teammates || []).find(t => t.name === car.driverName);
                        if (tm && tm.relationship !== undefined) {
                            tm.relationship += 2;
                        }
                    }
                }
                
                // Pause game
                game.pauseSystem.acquire('bumper_results');
                
                // ─── BUILD RESULTS POPUP ───
                const overlay = document.createElement('div');
                overlay.id = 'bumper-results-overlay';
                overlay.style.cssText = `
                    position: fixed; inset: 0; z-index: 200;
                    background: rgba(5, 2, 10, 0.85);
                    display: flex; justify-content: center; align-items: center;
                    animation: bumperFadeIn 0.4s ease;
                `;
                
                const popup = document.createElement('div');
                popup.style.cssText = `
                    background: linear-gradient(180deg, #120818, #0a0510);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px; padding: 24px 20px 18px;
                    width: 280px; max-width: 90vw;
                    font-family: Orbitron, monospace;
                    box-shadow: 0 0 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05);
                `;
                
                // Header
                popup.innerHTML = `
                    <div style="text-align:center; margin-bottom: 16px;">
                        <div style="font-size:0.5rem; letter-spacing:4px; color:#555; margin-bottom:6px;">CRASH ROYALE</div>
                        <div style="font-size:1.1rem; letter-spacing:3px; color:${medalColor}; 
                            text-shadow: 0 0 12px ${medalGlow};">${prizeLabel}</div>
                    </div>
                `;
                
                // Prize box
                popup.innerHTML += `
                    <div style="display:flex; justify-content:center; gap:20px; margin-bottom:16px;
                        padding:10px; background:rgba(255,255,255,0.02); border-radius:6px;
                        border:1px solid rgba(255,255,255,0.05);">
                        <div style="text-align:center;">
                            <div style="font-size:0.4rem; color:#666; letter-spacing:2px;">YOUR HITS</div>
                            <div style="font-size:1rem; color:#ddd; margin-top:2px;">${playerHits}</div>
                        </div>
                        <div style="width:1px; background:rgba(255,255,255,0.06);"></div>
                        <div style="text-align:center;">
                            <div style="font-size:0.4rem; color:#666; letter-spacing:2px;">PRIZE</div>
                            <div style="font-size:1rem; color:#d4af37; margin-top:2px;">+${prizePP} <span style="font-size:0.5rem;">PP</span></div>
                        </div>
                    </div>
                `;
                
                // Scoreboard
                let boardHTML = `<div style="margin-bottom:14px;">`;
                results.forEach((car, i) => {
                    const isPlayer = car === this.playerCar;
                    const name = isPlayer ? '★ YOU' : (car.driverName || `CAR ${car.labelChar}`);
                    const rank = i + 1;
                    
                    let rankColor = '#555';
                    if (rank === 1) rankColor = '#ffd700';
                    else if (rank === 2) rankColor = '#c0c0c0';
                    else if (rank === 3) rankColor = '#cd7f32';
                    
                    const bg = isPlayer 
                        ? 'linear-gradient(90deg, rgba(212,175,55,0.15), rgba(212,175,55,0.03))'
                        : 'rgba(255,255,255,0.02)';
                    const borderCol = isPlayer ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.04)';
                    const nameCol = isPlayer ? '#d4af37' : '#aaa';
                    
                    boardHTML += `
                        <div style="display:flex; align-items:center; gap:8px; padding:5px 8px;
                            background:${bg}; border:1px solid ${borderCol}; border-radius:4px;
                            margin-bottom:3px; animation: bumperSlideIn 0.3s ease ${i * 0.06}s both;">
                            <span style="font-size:0.55rem; color:${rankColor}; min-width:16px; font-weight:bold;">${rank}</span>
                            <span style="font-size:0.5rem; color:${nameCol}; letter-spacing:1px; flex:1;
                                overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
                            <span style="font-size:0.55rem; color:#ddd; font-weight:bold;">${car.hitScore}</span>
                        </div>`;
                });
                boardHTML += `</div>`;
                popup.innerHTML += boardHTML;
                
                // Continue button
                popup.innerHTML += `
                    <div style="text-align:center;">
                        <button id="bumper-results-close" style="
                            font-family:Orbitron,monospace; font-size:0.55rem; letter-spacing:3px;
                            color:#d4af37; background:rgba(212,175,55,0.08);
                            border:1px solid rgba(212,175,55,0.3); border-radius:20px;
                            padding:8px 28px; cursor:pointer;
                            transition: all 0.2s ease;
                        ">CONTINUE</button>
                    </div>
                `;
                
                // Inject animations
                if (!document.getElementById('bumper-results-style')) {
                    const style = document.createElement('style');
                    style.id = 'bumper-results-style';
                    style.textContent = `
                        @keyframes bumperFadeIn { from { opacity:0; } to { opacity:1; } }
                        @keyframes bumperSlideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
                        #bumper-results-close:hover { background:rgba(212,175,55,0.18); box-shadow:0 0 12px rgba(212,175,55,0.2); }
                    `;
                    document.head.appendChild(style);
                }
                
                overlay.appendChild(popup);
                document.body.appendChild(overlay);
                
                // Dismiss handler
                document.getElementById('bumper-results-close').addEventListener('click', () => {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                        game.pauseSystem.release('bumper_results');
                    }, 300);
                });
                document.getElementById('bumper-results-close').addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    document.getElementById('bumper-results-close').click();
                });
                
                // Clean up cars
                this.cars = [];
                this.playerCar = null;
                
                // Remove HUD
                this._removeHUD();
            }
            
            _createHUD() {
                // Timer bar (top center)
                this.hudTimer = document.createElement('div');
                this.hudTimer.id = 'bumper-timer';
                this.hudTimer.style.cssText = `
                    position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
                    font-family: Orbitron, monospace; color: #d4af37; font-size: 0.85rem;
                    letter-spacing: 3px; text-align: center; z-index: 100;
                    background: rgba(10, 5, 15, 0.75); padding: 6px 18px;
                    border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 6px;
                    pointer-events: none; text-shadow: 0 0 8px rgba(212,175,55,0.4);
                `;
                document.body.appendChild(this.hudTimer);
                
                // Scoreboard container (right side)
                this.hudBoard = document.createElement('div');
                this.hudBoard.id = 'bumper-board';
                this.hudBoard.style.cssText = `
                    position: fixed; top: 45px; right: 8px; width: 140px;
                    z-index: 100; pointer-events: none;
                    font-family: Orbitron, monospace; font-size: 0.55rem;
                `;
                document.body.appendChild(this.hudBoard);
                
                // Header
                const header = document.createElement('div');
                header.style.cssText = `
                    color: #888; letter-spacing: 2px; text-align: center;
                    margin-bottom: 4px; font-size: 0.45rem;
                `;
                header.textContent = 'CRASH ROYALE';
                this.hudBoard.appendChild(header);
                
                // Bar container (relative, for absolute-positioned bars)
                this.hudBarContainer = document.createElement('div');
                this.hudBarContainer.style.cssText = `
                    position: relative;
                    height: ${this.cars.length * 24}px;
                `;
                this.hudBoard.appendChild(this.hudBarContainer);
                
                // Create a bar for each car
                this._bars = {};
                const barHeight = 20;
                const barGap = 4;
                
                this.cars.forEach((car, i) => {
                    const bar = document.createElement('div');
                    const isPlayer = car === this.playerCar;
                    
                    bar.style.cssText = `
                        position: absolute; left: 0; right: 0;
                        top: ${i * (barHeight + barGap)}px;
                        height: ${barHeight}px;
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 0 8px;
                        background: ${isPlayer 
                            ? 'linear-gradient(90deg, rgba(212,175,55,0.25), rgba(212,175,55,0.08))' 
                            : 'rgba(20, 10, 30, 0.6)'};
                        border: 1px solid ${isPlayer 
                            ? 'rgba(212,175,55,0.4)' 
                            : 'rgba(255,255,255,0.08)'};
                        border-radius: 4px;
                        transition: top 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
                        box-sizing: border-box;
                    `;
                    
                    const nameEl = document.createElement('span');
                    nameEl.style.cssText = `
                        color: ${isPlayer ? '#d4af37' : '#aaa'};
                        letter-spacing: 1px; font-size: 0.5rem;
                        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                        max-width: 90px;
                    `;
                    nameEl.textContent = isPlayer ? '★ YOU' : (car.driverName || car.labelChar);
                    
                    const scoreEl = document.createElement('span');
                    scoreEl.style.cssText = `
                        color: ${isPlayer ? '#ffd700' : '#ddd'};
                        font-size: 0.6rem; font-weight: bold;
                        min-width: 16px; text-align: right;
                    `;
                    scoreEl.textContent = '0';
                    
                    bar.appendChild(nameEl);
                    bar.appendChild(scoreEl);
                    this.hudBarContainer.appendChild(bar);
                    
                    this._bars[car.labelChar] = { el: bar, scoreEl, car, lastRank: i };
                });
            }
            
            _updateHUD() {
                if (!this.hudTimer) return;
                
                // Timer
                const secs = Math.max(0, Math.ceil(this.timer / 60));
                const timeColor = secs <= 10 ? '#ff4444' : '#d4af37';
                this.hudTimer.innerHTML = `<span style="color:${timeColor}">${secs}s</span>`;
                
                // Sort cars by score (descending), stable by original order
                const sorted = [...this.cars].sort((a, b) => b.hitScore - a.hitScore);
                
                const barHeight = 20;
                const barGap = 4;
                
                // Update positions and scores
                sorted.forEach((car, rank) => {
                    const barData = this._bars[car.labelChar];
                    if (!barData) return;
                    
                    // Update score text
                    barData.scoreEl.textContent = car.hitScore;
                    
                    // Slide to new rank position
                    const newTop = rank * (barHeight + barGap);
                    barData.el.style.top = newTop + 'px';
                    
                    // Flash border on rank change
                    if (barData.lastRank !== rank) {
                        const isPlayer = car === this.playerCar;
                        barData.el.style.borderColor = rank < barData.lastRank 
                            ? 'rgba(0,255,136,0.6)' : 'rgba(255,100,68,0.4)';
                        setTimeout(() => {
                            barData.el.style.borderColor = isPlayer 
                                ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)';
                        }, 400);
                        barData.lastRank = rank;
                    }
                });
            }
            
            _removeHUD() {
                if (this.hudTimer && this.hudTimer.parentNode) {
                    this.hudTimer.parentNode.removeChild(this.hudTimer);
                    this.hudTimer = null;
                }
                if (this.hudBoard && this.hudBoard.parentNode) {
                    this.hudBoard.parentNode.removeChild(this.hudBoard);
                    this.hudBoard = null;
                }
                this._bars = null;
            }
        }

