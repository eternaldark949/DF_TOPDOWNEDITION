        /**
         * =====================================================================
         *  ACTOR ENTITY (Base Class for NPCs & Enemies)
         * =====================================================================
         * Base class for all character entities: NPCs, enemies, companions.
         * Uses circle collision for smooth character movement and realistic
         * physics interactions with the environment.
         * 
         * Features:
         * - Circle collision shape with configurable radius
         * - ACTOR collision layer (layer 4)
         * - Built-in health and damage system
         * - Knockback support via velocity
         * - Auto-registers with CollisionSystem for wall/prop collisions
         * - Friction-based movement with velocity decay
         * - Dead state tracking for cleanup
         * 
         * Subclasses:
         * - NPC (civilians, dancers, shopkeepers)
         * - Teammate (combat companions like Victoria)
         * - Drone (flying enemies)
         * - GatlingGunner (boss enemies)
         * - Ganger (stealth AI enemies)
         * 
         * Usage:
         *   class MyEnemy extends ActorEntity {
         *       constructor(x, y) {
         *           super({ x, y, radius: 15, hp: 100 });
         *       }
         *       
         *       update(player, game) {
         *           super.update(); // Apply physics
         *           // Custom AI logic here
         *       }
         *   }
         */
        class ActorEntity extends GameEntity {
            constructor(config) {
                const radius = config.radius || 15;
                
                super({
                    ...config,
                    type: config.type || 'actor',
                    width: radius * 2,
                    height: radius * 2,
                    radius: radius,
                    hasCollision: config.hasCollision !== false,
                    collisionShape: GameEntity.SHAPE.CIRCLE,
                    collisionLayer: GameEntity.LAYER.ACTOR,
                    // Can be hit by projectiles, collide with walls/dynamics/other actors
                    collisionMask: config.collisionMask ?? (
                        GameEntity.LAYER.STATIC | 
                        GameEntity.LAYER.DYNAMIC | 
                        GameEntity.LAYER.PROJECTILE |
                        GameEntity.LAYER.ACTOR
                    ),
                    mass: config.mass ?? 10,
                    friction: config.friction ?? 0.9
                });
                
                // Health system
                this.hp = config.hp ?? 100;
                this.maxHp = config.maxHp ?? this.hp;
                this.dead = false;
                
                // Invincibility frames to prevent damage spam
                this.invincibleTimer = 0;
                
                // Alliance system — determines projectile pass-through and collision softening
                // 'friendly' = player side, 'hostile' = enemy side, 'neutral' = civilians
                this.alliance = config.alliance || 'neutral';
                this.invincibleDuration = config.invincibleDuration ?? 0; // 0 = no i-frames
                
                // Movement speed (for AI/player control)
                this.speed = config.speed ?? 3;
                this.moveDir = { x: 0, y: 0 }; // Normalized direction
                this.lerpFactor = 0.15;
                
                // Knockback velocity (applied on damage, decays separately)
                this.knockbackVx = 0;
                this.knockbackVy = 0;
                this.knockbackFriction = 0.85;
                
                // Optional callbacks
                this._onDeath = config.onDeath || null;
                this._onDamage = config.onDamage || null;
            }
            
            /**
             * Apply damage and optional knockback.
             * Returns true if damage was applied, false if invincible/dead.
             * 
             * @param {number} amount - Damage amount
             * @param {number} knockbackX - X knockback force (optional)
             * @param {number} knockbackY - Y knockback force (optional)
             * @returns {boolean} - Whether damage was applied
             */
            takeDamage(amount, knockbackX = 0, knockbackY = 0) {
                if (this.dead || this.invincibleTimer > 0) return false;
                
                this.hp -= amount;
                // Damage number, health bar, blood, flinch (engine/combat-fx.js)
                if (typeof game !== 'undefined' && game && game.onActorHit) game.onActorHit(this, amount, knockbackX, knockbackY);
                
                // Apply knockback
                if (knockbackX || knockbackY) {
                    this.knockbackVx += knockbackX;
                    this.knockbackVy += knockbackY;
                }
                
                // Trigger invincibility frames
                if (this.invincibleDuration > 0) {
                    this.invincibleTimer = this.invincibleDuration;
                }
                
                // Callback
                if (this._onDamage) {
                    this._onDamage(amount, this);
                }
                
                // Check for death
                if (this.hp <= 0) {
                    this.hp = 0;
                    this.die();
                }
                
                return true;
            }
            
            /**
             * Handle death - override in subclasses for custom behavior.
             */
            die() {
                if (this.dead) return;
                this.dead = true;
                this.active = false;  // Remove from collision system
                
                // Callback
                if (this._onDeath) {
                    this._onDeath(this);
                }
            }
            
            /**
             * Heal the actor.
             * @param {number} amount - Heal amount
             * @returns {number} - Amount actually healed
             */
            heal(amount) {
                if (this.dead) return 0;
                
                const oldHp = this.hp;
                this.hp = Math.min(this.hp + amount, this.maxHp);
                return this.hp - oldHp;
            }
            
            
            /**
             * Set movement direction (for AI or input).
             * Direction will be normalized.
             * 
             * @param {number} dx - X direction (-1 to 1)
             * @param {number} dy - Y direction (-1 to 1)
             */
            setMoveDirection(dx, dy) {
                const len = Math.hypot(dx, dy);
                if (len > 0) {
                    this.moveDir.x = dx / len;
                    this.moveDir.y = dy / len;
                } else {
                    this.moveDir.x = 0;
                    this.moveDir.y = 0;
                }
            }
            
            /**
             * Update physics - velocity, knockback, friction.
             * Call super.update() in subclasses to apply physics.
             */

            update() {
                if (this.dead) return;
        
                if (this.invincibleTimer > 0) this.invincibleTimer--;
        
                // 1. CALCULATE TARGET SPEED
                // If moveDir has length, we want to go to 'speed'. Otherwise, go to 0.
                const isMoving = (Math.abs(this.moveDir.x) > 0.01 || Math.abs(this.moveDir.y) > 0.01);
                const targetSpeed = isMoving ? this.speed : 0;
        
                // 2. INTERPOLATE CURRENT SPEED
                this.curSpeed += (targetSpeed - this.curSpeed) * this.lerpFactor;
                if (this.curSpeed < 0.01) this.curSpeed = 0;
        
                // 3. APPLY TO VELOCITY
                // We use the interpolated speed and the normalized direction
                this.vx = this.moveDir.x * this.curSpeed;
                this.vy = this.moveDir.y * this.curSpeed;
        
                // 4. APPLY KNOCKBACK (Additive)
                this.vx += this.knockbackVx;
                this.vy += this.knockbackVy;
        
                // 5. APPLY TO POSITION
                this.x += this.vx;
                this.y += this.vy;
        
                // 6. DECAY KNOCKBACK
                this.knockbackVx *= this.knockbackFriction;
                this.knockbackVy *= this.knockbackFriction;
                if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
            }
        
            // Standard helper to set direction for AI/Input
            setMoveDirection(dx, dy) {
                const len = Math.hypot(dx, dy);
                if (len > 0.01) {
                    this.moveDir.x = dx / len;
                    this.moveDir.y = dy / len;
                } else {
                    this.moveDir.x = 0;
                    this.moveDir.y = 0;
                }
            }
           
            /**
             * Get the center point of this actor.
             * Overrides GameEntity for circle-centric positioning.
             * @returns {{x: number, y: number}}
             */
            getCenter() {
                return { x: this.x, y: this.y };
            }
            
            /**
             * Get bounding box for spatial hash grid.
             * @returns {{x: number, y: number, w: number, h: number}}
             */
            getBoundingBox() {
                return {
                    x: this.x - this.radius,
                    y: this.y - this.radius,
                    w: this.radius * 2,
                    h: this.radius * 2
                };
            }
            
            
            /**
             * Default draw - override in subclasses.
             * Draws a simple circle with health bar.
             * 
             * @param {CanvasRenderingContext2D} ctx 
             */
            draw(ctx) {
                if (!this.visible || this.dead) return;
                
                // Flash if invincible
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) {
                    return; // Skip frame for flash effect
                }
                
                // Base circle
                ctx.fillStyle = '#ff00ff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // Health bar (if damaged)
                if (this.hp < this.maxHp) {
                    const barWidth = this.radius * 2;
                    const barHeight = 4;
                    const barX = this.x - this.radius;
                    const barY = this.y - this.radius - 10;
                    
                    drawHPBar(ctx, barX, barY, barWidth, barHeight, this.hp / this.maxHp);
                }
            }
            
            
            /**
             * Called when this actor is hit by a projectile.
             * Override for custom damage/effects.
             * 
             * @param {ProjectileEntity} projectile - The projectile
             * @param {GameEngine} game - Game reference
             */
            onProjectileHit(projectile, game) {
                // Calculate knockback using damage, mass, and velocity
                // High damage shots (like sniper) cause massive knockback
                const projSpeed = Math.hypot(projectile.vx, projectile.vy);
                
                if (projSpeed > 0) {
                    // Knockback formula: (damage * speed * mass) / target_mass
                    // Sniper (100 dmg, 80 speed) will send enemies flying
                    const projMomentum = (projectile.mass || 1) * projSpeed;
                    const damageMultiplier = projectile.damage / 20;  // Normalize to base damage of 20
                    const knockbackStrength = (projMomentum * damageMultiplier) / (this.mass || 10);
                    
                    // Cap knockback to prevent insane launches (but allow big hits)
                    const cappedKnockback = Math.min(knockbackStrength, 60);
                    
                    // Direction from projectile velocity
                    const kbX = (projectile.vx / projSpeed) * cappedKnockback;
                    const kbY = (projectile.vy / projSpeed) * cappedKnockback;
                    
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }
            
            /**
             * Clean up when destroyed.
             */
            destroy() {
                this.dead = true;
                this.active = false;
                super.destroy();
            }
        }

        /**
         * =====================================================================
         *  PLAYER ENTITY (Unified Entity System)
         * =====================================================================
         * The player character, now fully integrated into the entity system.
         * Uses circle collision for smooth movement and wall sliding.
         * 
         * Features:
         * - Circle collision (radius: 12) for CollisionSystem integration
         * - Input-driven movement (velX/velY as direction, not velocity)
         * - Built-in health/damage with invincibility during FLIT
         * - Cosmetics-driven appearance (hair, skin, outfit via CosmeticsSystem)
         * - Buff system (Neon Tea speed boost)
         * - Automatic wall/prop collision via CollisionSystem
         * - Can be hit by enemy projectiles via onProjectileHit()
         * 
         * NOTE: Player movement is special - we DON'T use ActorEntity's 
         * moveDir-based movement. Instead, velX/velY are raw input direction
         * and we apply them directly in update().
         */
        class PlayerEntity extends ActorEntity {
            constructor(config) {
                super({
                    x: config.x || 0,
                    y: config.y || 0,
                    radius: 12,  // Slightly smaller than other actors for tight movement
                    type: 'player',
                    alliance: 'friendly',
                    hp: 100,
                    maxHp: 100,
                    speed: 5.2,
                    mass: 15,  // Heavier than NPCs
                    friction: 0.9,
                    invincibleDuration: 0  // Invincibility handled by FLIT system
                });
                
                // Input direction (raw, not normalized velocity)
                this.velX = 0;
                this.velY = 0;
                
                // Facing angle (independent of movement)
                this.angle = 0;
                
                // Visibility (no longer hidden when in car, so visible is not a valid check for on foot)
                this.visible = true;
                
                // Buff system (data-driven — see CONSUMABLES config & BuffSystem class)
                this.buffSystem = new BuffSystem();
                
                // Animation state
                this.walkPhase = 0;
                this.isHidden = false;
                
                // Reference to game engine (set after construction)
                this._game = null;
            }
            
            /**
             * Set reference to game engine for damage handling.
             */
            setGame(game) {
                this._game = game;
            }
            
            /**
             * Get current movement speed (with buffs applied).
             */
            getCurrentSpeed() {
                return this.buffSystem.getStat('speed', this.speed);
            }
            
            /**
             * Player update - handles input-based movement.
             * Wall/prop collision is handled by CollisionSystem automatically.
             * 
             * NOTE: We override ActorEntity.update() completely because
             * player uses direct position updates, not velocity-based physics.
             */
            update() {
                if (this.dead || !this.visible) return;
                
                // Decrement invincibility (from ActorEntity)
                if (this.invincibleTimer > 0) {
                    this.invincibleTimer--;
                }
                
                // Walk phase is advanced by the shared gait controller (syncHumanoidGait)
                
                // Movement is applied in GameEngine.update() BEFORE CollisionSystem runs
                // CollisionSystem will then resolve any wall/prop penetrations
                
                // Apply knockback (if any, from damage)
                this.x += this.knockbackVx;
                this.y += this.knockbackVy;
                
                // Decay knockback
                this.knockbackVx *= this.knockbackFriction;
                this.knockbackVy *= this.knockbackFriction;
                if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
            }
            
            /**
             * Apply movement from input.
             * Called by GameEngine before collision resolution.
             * 
             * @param {number} dx - Input X direction (-1 to 1)
             * @param {number} dy - Input Y direction (-1 to 1)
             */
            applyMovement(dx, dy) {
                if (!this.visible) return;
                
                const speed = this.getCurrentSpeed();
                gaitCommand(this, dx * speed, dy * speed);
                this.x += dx * speed;
                this.y += dy * speed;
            }
            
            /**
             * Override takeDamage to check FLIT invulnerability.
             */
            takeDamage(amount, knockbackX = 0, knockbackY = 0) {
                // FLIT grants invulnerability
                if (this._game && this._game.flitState && this._game.flitState.active) {
                    return false;
                }
                const g = this._game;
                let lastStood = false;
                if (g && g.resonance && !(this.invincibleTimer > 0) && !this.dead) {
                    amount = g.resonance.stat('damageTaken', amount);                 // Frame: Plating
                    // Frame: Last Stand — a hit that would kill leaves 1 HP and a moment's grace
                    if (this.hp - amount <= 0 && g.resonance.tryLastStand(_gameTimeSec)) {
                        amount = Math.max(0, this.hp - 1);
                        lastStood = true;
                        showMessage('LAST STAND');
                        if (g.weather) g.weather.spawnExplosion(this.x, this.y, 'rgba(196, 86, 110, 1)');
                    }
                    g.lastHurtAt = _gameTimeSec;
                }
                
                // Use ActorEntity's damage system
                const damaged = super.takeDamage(amount, knockbackX, knockbackY);
                if (lastStood) this.invincibleTimer = 60;                 // a moment's grace after Last Stand
                
                if (damaged && this._game) {
                    // Sync with legacy health system
                    this._game.playerHealth = this.hp;
                    this._game.healthRegenTimer = 0;
                    this._game.updateUI();
                }
                
                return damaged;
            }
            
            /**
             * Override die to trigger respawn instead of removal.
             */
            die() {
                if (this._game) {
                    showMessage("CRITICAL FAILURE - RESPONDING TO MEDBAY");
                    // Half the unsettled Resonance scatters on the way back to Dr. Yin
                    if (this._game.resonance) {
                        const lost = this._game.resonance.onDeath();
                        if (lost > 0) this._game.addPausableTimeout(() => showMessage(`${lost} UNSETTLED RESONANCE SCATTERED IN THE RETURN`), 1800);
                    }
                    
                    // Clear all active buffs (restores maxHP if Stellar Lemonade was active, etc.)
                    this.buffSystem.clearAll(this._game);
                    
                    // Reset health
                    this.hp = this.maxHp;
                    this.dead = false;
                    this._game.playerHealth = this.hp;
                    this._game.boosterCount = this._game.getEffectiveMaxBoosters();
                    this._game.questState.suiteAmbushTriggered = false;
                    // Reset story step so ambush can re-trigger on return
                    const st = this._game.story;
                    if (st && !st.isBefore('SEARCH_SUITE') && st.isBefore('REPORT_BACK')) st.goTo('ENTER_SUITE');
                    // Reset optional sanctum quest if active (boss respawns on re-entry)
                    if (this._game.story && this._game.story.activeOptional && this._game.story.activeOptional.id === 'sanctum') {
                        this._game.story.activeOptional = null;
                    }
                    this._game.updateUI();
                    
                    // Respawn at the medbay: wake beside the recovery bed in Dr. Yin's clinic
                    const rs = (MAP_DATA.medbay_sw && MAP_DATA.medbay_sw.respawn) || { x: 212, y: 328 };
                    this._game.loadMap('medbay_sw', { x: rs.x, y: rs.y });
                }
            }
            
            /**
             * Heal the player.
             */
            heal(amount) {
                const healed = super.heal(amount);
                if (healed > 0 && this._game) {
                    this._game.playerHealth = this.hp;
                    this._game.updateUI();
                }
                return healed;
            }
            
            /**
             * Called when hit by a projectile.
             * Only enemy projectiles damage the player.
             */
            onProjectileHit(projectile, game) {
                // Only enemy projectiles hurt player
                if (!projectile.isEnemy) return;
                
                // Calculate knockback based on damage and speed
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // Higher damage = more knockback
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 10;  // Normalize to base damage
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 15), 40);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }
            
            /**
             * Sync health from legacy system.
             * Called when health is modified externally (boosters, medbay, etc.)
             */
            syncHealth(newHp, newMaxHp = null) {
                this.hp = newHp;
                if (newMaxHp !== null) {
                    this.maxHp = newMaxHp;
                }
            }
            
            /**
             * Player drawing is handled by GameEngine.drawPlayer() for now
             * since it's deeply integrated with game state (shootCooldown, etc.)
             */
            draw(ctx) {
                // Drawing delegated to GameEngine.drawPlayer()
                // This is called from the entity system but we skip it
            }
        }

        /**
         * Projectile Entity - Fast-moving bullets/fireballs.
         */
        /**
         * =====================================================================
         *  PROJECTILE ENTITY (Unified Entity System)
         * =====================================================================
         * Projectiles now use the GameEntity system for automatic collision
         * detection via CollisionSystem. The onHit callback handles all
         * damage and visual effects when a collision is detected.
         * 
         * Key Features:
         * - Auto-registers with GameEntity.registry
         * - Collision detection via spatial hash grid
         * - Lifecycle managed by destroy()/cleanup()
         * - Supports both player and enemy projectiles
         * - Built-in onHit handler spawns explosions via weather system
         * 
         * Usage:
         *   new ProjectileEntity({
         *       x: 100, y: 200,
         *       angle: Math.PI/4,
         *       isEnemy: false,
         *       color: '#00f3ff'
         *   });
         */
        class ProjectileEntity extends GameEntity {
            // Static pool for projectile reuse
            static _pool = [];
            static _maxPoolSize = 100;
            
            static acquire(config) {
                let proj;
                if (this._pool.length > 0) {
                    proj = this._pool.pop();
                    proj._reinit(config);
                } else {
                    proj = new ProjectileEntity(config);
                }
                return proj;
            }
            
            static release(proj) {
                if (this._pool.length < this._maxPoolSize) {
                    proj.active = false;
                    this._pool.push(proj);
                }
            }
            
            _reinit(config) {
                this.x = config.x || 0;
                this.y = config.y || 0;
                this.vx = config.vx || 0;
                this.vy = config.vy || 0;
                this.damage = config.damage || 10;
                this.owner = config.owner || null;
                this.ownerType = config.ownerType || 'player';
                this.speed = Math.hypot(this.vx, this.vy);
                this.color = config.color || '#00f3ff';
                this.life = config.life || 60;
                this.alliance = (config.ownerType === 'enemy' || config.isEnemy) ? 'hostile' : 'friendly';
                this.active = true;
                this.markedForDestroy = false;
                this.penetrating = config.penetrating || false;
                this.melee = !!config.melee;                              // a punch (Resonance: knockout bonus, Heavy Hands)
                this.penetrateCount = 0;
                this.maxPenetrations = config.maxPenetrations || 3;
                this.hitTargets = new Set();
                this.sticky = config.sticky || false;
                this.dotDamage = config.dotDamage || 5;
                this.dotTicks = config.dotTicks || 12;
                this.dotInterval = config.dotInterval || 10;
                this.spawnTime = _frameTime;
            }

            constructor(config) {
                // Default speeds: enemy = slower, player = faster
                let speed = config.isEnemy ? 24 : 25;
                const angle = config.angle || 0;
                const color = config.color || (config.isEnemy ? '#a469ff' : '#00f3ff');
                const radius = config.radius || 5;
                
                // Special case: orange shots (teammate) are medium speed, high damage
                if (!config.isEnemy && color === '#ffaa00') {
                    speed = config.speed || 20;
                }
                
                // Fireballs are bigger and slower but pack a punch
                const finalRadius = (color === '#ff3300') ? 8 : radius;
                const finalSpeed = config.speed || speed;
                
                // Calculate mass from speed and size: mass = radius * speed * 0.1
                // Faster, bigger projectiles have more mass/momentum
                const calculatedMass = finalRadius * finalSpeed * 0.1;
                
                super({
                    ...config,
                    type: 'projectile',
                    width: finalRadius * 2,
                    height: finalRadius * 2,
                    radius: finalRadius,
                    mass: calculatedMass,
                    hasCollision: true,
                    collisionShape: GameEntity.SHAPE.CIRCLE,
                    collisionLayer: GameEntity.LAYER.PROJECTILE,
                    // Collision mask determines what this projectile can hit
                    collisionMask: GameEntity.LAYER.STATIC | GameEntity.LAYER.DYNAMIC | GameEntity.LAYER.ACTOR | GameEntity.LAYER.VEHICLE,
                    vx: Math.cos(angle) * finalSpeed,
                    vy: Math.sin(angle) * finalSpeed,
                    friction: 1.0  // No friction decay for projectiles
                });
                
                this.isEnemy = config.isEnemy || false;
                this.alliance = this.isEnemy ? 'hostile' : 'friendly';
                this.color = color;
                this.speed = finalSpeed;
                this.owner = config.owner || null;  // Prevent self-collision
                
                // Damage values: fireballs > orange > default
                if (color === '#ff3300') {
                    this.damage = config.damage || 35;  // Fireball
                } else if (color === '#ffaa00') {
                    this.damage = config.damage || 30;  // Teammate orange
                } else {
                    this.damage = config.damage || (config.isEnemy ? 10 : 20);
                }
                
                this.life = config.life || 60;
                this.isFireball = (color === '#ff3300');
                this.angle = angle;
                
                // Penetration: projectile passes through targets instead of stopping
                this.penetrating = config.penetrating || false;
                this.melee = !!config.melee;                              // a punch (Resonance: knockout bonus, Heavy Hands)
                this.penetrateCount = config.penetrateCount || 0;  // How many things hit so far
                this.maxPenetrations = config.maxPenetrations || Infinity;  // Limit penetrations
                this.hitTargets = new Set();  // Track what we've already hit (avoid double-hits)
                
                // Sniper shot visual flag
                this.isSniper = config.isSniper || false;
                
                // Sticky DOT (Golden Child) — orb sticks to target on hit
                this.sticky = config.sticky || false;
                this.dotDamage = config.dotDamage || 5;
                this.dotTicks = config.dotTicks || 12;
                this.dotInterval = config.dotInterval || 10;
                
                // Store custom onHit override if provided
                this._customOnHit = config.onHit || null;
                
                // Hard age cap — prevents ghost projectiles from persisting
                this.spawnTime = _frameTime;
            }
            
            /**
             * Called by CollisionSystem when projectile hits a target entity.
             * Handles audio/visual effects (explosions, sparks, camera shake).
             * Now uses mass-based impulse transfer for physics interactions.
             * 
             * @param {GameEntity} target - The entity that was hit
             * @param {GameEngine} game - Reference to the game engine
             */
            onHit(target, game) {
                if (!game) return;
                
                // Use current position (at impact) for effects
                const hitX = this.x;
                const hitY = this.y;
                
                // Distance check for audio/visual effects (performance)
                const distToPlayer = Math.hypot(hitX - game.player.x, hitY - game.player.y);
                
                if (distToPlayer < 800) {
                    // Play impact sound
                    audioSys.sfx('explode');
                    
                    // Camera shake: Fireballs > Enemy Shots > Player Shots
                    let shakeAmt = 0;
                    if (this.isFireball) shakeAmt = 12;
                    else if (this.isEnemy) shakeAmt = 8;
                    else shakeAmt = 4;
                    
                    // Falloff based on distance (shake less if far away)
                    shakeAmt *= (1 - (distToPlayer / 800));
                    if (shakeAmt > 0.5) game.triggerShake(shakeAmt);
                }
                
                // Visual explosion effects
                if (this.isFireball) {
                    game.weather.spawnExplosion(hitX, hitY, '#ff3300');
                    game.weather.spawnSparks(hitX, hitY, 25);
                } else {
                    game.weather.spawnExplosion(hitX, hitY, this.color);
                }
                
                // Handle specific target types with mass-based impulse
                if (target) {
                    // If hit a DYNAMIC entity (prop), apply damage-scaled impulse
                    if (target.collisionLayer === GameEntity.LAYER.DYNAMIC) {
                        if (target.vx !== undefined) {
                            // Impulse = (damage * speed * mass) / target_mass
                            // High damage sniper shots send props flying!
                            const targetMass = target.mass || 5;
                            const projSpeed = Math.hypot(this.vx, this.vy);
                            
                            // Normalize velocity direction and apply impulse
                            if (projSpeed > 0) {
                                const dirX = this.vx / projSpeed;
                                const dirY = this.vy / projSpeed;
                                
                                // Damage-based impulse: more damage = more push
                                // Formula scales with damage, speed, and projectile mass
                                const impulseStrength = Math.min(
                                    (this.damage * projSpeed * this.mass * 0.01) / targetMass, 
                                    80  // Higher cap for sniper shots
                                );
                                target.vx += dirX * impulseStrength;
                                target.vy += dirY * impulseStrength;
                                
                                // Add spin on powerful hits
                                if (this.damage > 50 && target.angularVelocity !== undefined) {
                                    target.angularVelocity += (Math.random() - 0.5) * impulseStrength * 0.1;
                                }
                            }
                        }
                    }
                    
                    // If hit a VEHICLE entity, spawn sparks and apply damage-scaled impulse
                    if (target.collisionLayer === GameEntity.LAYER.VEHICLE) {
                        game.weather.spawnSparks(hitX, hitY, 8);
                        
                        // All projectiles can push vehicles now - damage determines how much
                        if (target.vx !== undefined) {
                            const vehicleMass = target.mass || 1000;
                            const projSpeed = Math.hypot(this.vx, this.vy);
                            
                            if (projSpeed > 0) {
                                const dirX = this.vx / projSpeed;
                                const dirY = this.vy / projSpeed;
                                
                                // Heavy vehicles resist, but high damage overcomes
                                // Sniper (100 dmg, 80 speed) will push hard
                                const impulseStrength = (this.damage * projSpeed * 0.02) / (vehicleMass * 0.01);
                                target.vx += dirX * impulseStrength;
                                target.vy += dirY * impulseStrength;
                            }
                        }
                    }
                }
                
                // Call custom handler if provided
                if (this._customOnHit) {
                    this._customOnHit(target, game, this);
                }
            }
            
            update(dt = 1) {
                // SAVE PREVIOUS POSITION
                this.lastX = this.x;
                this.lastY = this.y;
            
                super.update(dt);
                this.life--;
                if (this.life <= 0) {
                    this.vx = 0;
                    this.vy = 0;
                    this.destroy();
                }
            }
            
            draw(ctx) {
                if (!this.visible || !this.active) return;
                
                // Ghost projectile safety — don't render or process dead-in-flight bullets
                if (!this.sticky && this.vx === 0 && this.vy === 0) return;
                
                ctx.save();
                
                if (this.isFireball) {
                    // --- FIREBALL VISUALS ---
                    ctx.translate(this.x, this.y);
                    ctx.rotate(this.angle);
                    
                    // Flickering flame trail
                    const flicker = Math.random() * 0.5 + 0.5;
                    ctx.fillStyle = `rgba(255, 100, 0, ${0.6 * flicker})`;
                    ctx.beginPath();
                    ctx.moveTo(0, 6);
                    ctx.lineTo(-30 * flicker, 0);
                    ctx.lineTo(0, -6);
                    ctx.fill();
                    
                    // Glowing core
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 20;
                    ctx.fillStyle = '#fff700';
                    ctx.beginPath();
                    ctx.arc(0, 0, 8, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Inner hot core
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.shadowBlur = 0;
                } else if (this.sticky) {
                    // --- GOLDEN ORB VISUALS (Golden Child) ---
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 12;
                    
                    // Outer glow
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Core orb
                    ctx.fillStyle = '#FFD700';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // White hot center
                    ctx.fillStyle = '#fffbe6';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.shadowBlur = 0;
                } else {
                    // --- STANDARD LASER VISUALS ---
                    ctx.shadowColor = this.color;
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(this.x - this.vx * 0.5, this.y - this.vy * 0.5);
                    ctx.stroke();
                    
                    // Sniper shots get extra long trail
                    // --- SNIPER TRAIL LOGIC ---
                    if (this.isSniper) {
                        ctx.save();
                        
                        // 1. Calculate Fade
                        // This makes the trail fade out as the bullet reaches max range/life
                        const alpha = Math.max(0, this.life / 60); 
                        ctx.globalAlpha = alpha;
                
                        // 2. Set Style using the BULLET'S OWN COLOR
                        // PREVIOUSLY: ctx.strokeStyle = '#FFD700'; (Hardcoded Gold)
                        // NOW:
                        ctx.strokeStyle = this.color; 
                        
                        ctx.lineWidth = 2;
                        
                        // 3. Draw the Trail
                        // We assume you calculate a 'tail' or just draw a long streak
                        ctx.beginPath();
                        // Move to current position minus velocity (to create the streak)
                        // Or if you store startX/Y, draw from there. 
                        // Here is a standard "long streak" approach:
                        const tailLen = 300; // Long trail for sniper
                        const tailX = this.x - Math.cos(this.angle) * tailLen;
                        const tailY = this.y - Math.sin(this.angle) * tailLen;
                        
                        ctx.moveTo(tailX, tailY);
                        ctx.lineTo(this.x, this.y);
                        ctx.stroke();
                        
                        // Optional: Add a core white line for intensity
                        ctx.globalAlpha = alpha * 0.5;
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        
                        ctx.restore();
                        
                    }
                }
                
                ctx.restore();
            }
        }

        /**
         * Trigger Entity - Overlap-only zones (transitions, pickups).
         */
        class TriggerEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: config.type || 'trigger',
                    hasCollision: true,
                    collisionShape: GameEntity.SHAPE.AABB,
                    collisionLayer: GameEntity.LAYER.TRIGGER,
                    isTrigger: true
                });
                
                this.label = config.label || '';
                this.target = config.target || null;
                this.onEnter = config.onEnter || null;
                this.onExit = config.onExit || null;
                this.entitiesInside = new Set();
            }
            
            containsEntity(entity) {
                const bb = this.getBoundingBox();
                const center = entity.getCenter();
                return center.x >= bb.x && center.x <= bb.x + bb.w &&
                       center.y >= bb.y && center.y <= bb.y + bb.h;
            }
            
            
            draw(ctx) {
                if (!this.visible) return;
                
                ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(this.x, this.y, this.width, this.height);
                ctx.setLineDash([]);
                
                if (this.label) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.label, this.x + this.width/2, this.y + this.height/2);
                }
            }
        }


