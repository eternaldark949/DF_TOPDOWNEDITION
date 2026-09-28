        /**
         * =====================================================================
         *  NPC CLASS (Extends ActorEntity)
         * =====================================================================
         * Non-Player Characters: civilians, dancers, shopkeepers, etc.
         * Now uses the unified entity system for collision detection.
         * 
         * Features:
         * - Circle collision via ActorEntity (radius: 15)
         * - Automatic wall collision via CollisionSystem
         * - Hire system for dancers/companions
         * - Multiple visual renderers (Ms. Jean, Dancers, LUVSH4D3, etc.)
         * - Smart pathfinding with obstacle avoidance
         * 
         * Migration Notes:
         * - x, y now managed by ActorEntity (circle center)
         * - Wall collision handled automatically by CollisionSystem
         * - Preserves all existing visual rendering exactly
         */
        /* ---------------------------------------------------------------------
           STAFF_LOOKS — how the staff and androids look, in the world and in
           their portraits (NPC_PORTRAIT_CONFIGS reads these too). Double Nights'
           AI staff come in moon silver, sun-on-moon gold, or Blood Moon rose red.
           --------------------------------------------------------------------- */
        const _DN_GUARD = { gender: 'male', build: 'broad', body: { kind: 'android', finish: 'gold', glow: '#00ffff' },
            top: { type: 'dn_uniform', color: '#2a2418', trim: '#e8c27a' }, bottom: { type: 'pants', color: '#1a1614' },
            shoes: { type: 'boots', color: '#111111' }, pose: 'hands_on_hips' };
        const STAFF_LOOKS = {
            'Guard Unit Alpha': _DN_GUARD,
            'Guard Unit Beta':  _DN_GUARD,
            'Concierge Lux':    { gender: 'androgynous', build: 'slim', body: { kind: 'android', finish: 'gold' },
                                  top: { type: 'dn_uniform', color: '#2a2418', trim: '#e8c27a' }, bottom: { type: 'pants', color: '#1a1a1a' },
                                  shoes: { type: 'loafers', color: '#111111' }, pose: 'concierge' },
            'LUVSH4D3':         { gender: 'female', build: 'curvy', body: { kind: 'android', finish: 'bloodmoon', hover: true },
                                  hair: { type: 'long', color: '#ff88cc' } },
            'Bartender':        { skinColor: '#c9a87c', gender: 'male', hair: { type: 'short', color: '#1a1a1a' },
                                  top: { type: 'vest', color: '#1a0020', inner: '#f2f2f2', trim: '#8b0000' }, bottom: { type: 'pants', color: '#111111' },
                                  shoes: { type: 'loafers', color: '#111111' }, pose: 'polish' },
            'Barista Ren':      { skinColor: '#a0724a', gender: 'female', hair: { type: 'ponytail', color: '#2a1500' },
                                  top: { type: 'tshirt', color: '#654321' }, bottom: { type: 'apron', color: '#3a2a1a', under: '#222222' },
                                  shoes: { type: 'sneakers', color: '#eeeeee' }, pose: 'polish' },
            // The Empereal Lord's scientist and medic; she keeps Stella and 747 running
            'Dr. Yin':          { skinColor: '#e8d0b8', gender: 'female', build: 'slim', hair: { type: 'short', color: '#222222' },
                                  top: { type: 'lab_coat', inner: '#1a3a4a' }, bottom: { type: 'pants', color: '#1a3a4a' },
                                  shoes: { type: 'loafers', color: '#222222' }, pose: 'arms_crossed' },
        };

        const _SKIN_TONES = ['#3d2b1f', '#6b3a2a', '#8d5524', '#a0522d', '#c68642', '#c68e63', '#dcc6ac', '#e8d0b8', '#f5deb3'];
        const _HAIR_COLORS = ['#0a0505', '#1a1a1a', '#2a1500', '#4a3728', '#8b4513', '#654321', '#c0c0c0'];

        /** A stable look for NPCs without a named look: medics and the club's male dancers. */
        function seededNpcLook(npc) {
            const r = seededRandom(npc.name + '|' + npc.role + '|' + Math.round(npc.spawnX || npc.x) + ',' + Math.round(npc.spawnY || npc.y));
            const skinColor = pickFrom(r, _SKIN_TONES);
            if (npc.role === 'medic') {
                const gender = r() < 0.5 ? 'female' : 'male';
                return { skinColor, gender, build: pickFrom(r, [undefined, 'slim', 'athletic', 'curvy', 'heavy']),
                         hair: { type: pickFrom(r, ['short', 'ponytail', 'braids', 'curls', 'afro']), color: pickFrom(r, _HAIR_COLORS) },
                         top: { type: 'scrubs', color: pickFrom(r, ['#3aa6a0', '#4a7fb5', '#e8ecef']) },
                         bottom: { type: 'pants', color: '#3a6f80' }, shoes: { type: 'sneakers', color: '#ffffff' } };
            }
            // Male dancer: bare chest or an open jacket, black trousers, and a dance of his own
            const jacket = r() < 0.5;
            return { skinColor, gender: 'male', build: pickFrom(r, ['athletic', 'athletic', 'slim', 'broad']), height: 0.97 + r() * 0.08,
                     hair: { type: pickFrom(r, ['short', 'dreadlocks', 'braids', 'afro', 'curls', 'ponytail']), color: pickFrom(r, ['#0a0505', '#1a1a1a', '#8a0707', '#c0c0c0']) },
                     top: jacket ? { type: 'jacket', color: pickFrom(r, ['#111111', '#2a0a3a', '#590e18']), inner: skinColor } : null,
                     bottom: { type: 'pants', color: '#111111' }, shoes: { type: 'loafers', color: '#111111' },
                     jewelry: r() < 0.5 ? [{ type: 'necklace', color: '#e8c27a' }] : null, pose: 'dance' };
        }

        class NPC extends ActorEntity {
            /**
             * Unified NPC class — handles civilians, quest givers, dancers, AND teammates.
             * 
             * @param {number} x - World X position
             * @param {number} y - World Y position  
             * @param {string} name - Display name
             * @param {string} role - Role identifier ('civilian', 'dancer', 'teammate', etc.)
             * @param {Object} [combatConfig] - Optional combat config for teammates
             *   @param {string} combatConfig.weaponId - ITEM_REGISTRY key (e.g. 'rifle_rb98')
             *   @param {number} [combatConfig.burstSize=1] - Shots per trigger pull
             *   @param {number} [combatConfig.burstDelay=10] - Ticks between burst shots
             *   @param {number} [combatConfig.accuracyMod=1.0] - Multiplier on weapon spread (lower = tighter)
             *   @param {Object} [combatConfig.appearance] - drawProceduralHumanoid config
             */
            constructor(x, y, name, role, combatConfig) {
                const isTeammate = (role === 'teammate');
                
                // Initialize ActorEntity with circle collision
                super({
                    x: x,
                    y: y,
                    radius: isTeammate ? 14 : 15,
                    type: isTeammate ? 'teammate' : 'npc',
                    alliance: isTeammate ? 'friendly' : 'neutral',
                    hp: isTeammate ? 100 : 5000000,
                    mass: isTeammate ? 12 : 8,
                    friction: isTeammate ? 0.9 : 0.85,
                    speed: isTeammate ? CONFIG.COMPANION.TEAMMATE_SPEED : 5.5,
                    hasCollision: true,
                    invincibleDuration: isTeammate ? 20 : 30
                });
                
                // Identity
                this.name = name; 
                this.role = role || 'civilian'; 
                
                // State (shared)
                this.hired = false; 
                this.inCar = false;
                this.seatIndex = -1;            // Seat assignment in vehicle (-1 = none)
                this.hireTime = 0;
                
                // Unified hire system
                this.hireType = 'none';         // 'none', 'permanent', 'contract'
                this.hireDuration = 0;          // In-game minutes (0 = infinite for permanent)
                this.hireCost = 0;              // PP cost to hire
                
                // Unified combat — every humanoid can have a weapon and/or an ability
                this.equippedWeaponId = null;
                this.equippedAbilityId = (role === 'red_demon_dancer') ? 'fireball' : null;
                this.cooldown = 0;
                this.burstSize = 1;
                this.burstDelay = 10;
                this.accuracyMod = 1.0;
                this.shotsLeftInBurst = 1;
                
                // Animation State
                this.walkPhase = Math.random() * 10; 
                this.lastX = x;
                this.lastY = y;
                this.velX = 0;
                this.velY = 0;
                this.animOffset = Math.random() * 1000;
                
                // Gender (for dancer rendering)
                this.gender = (name.includes('Male') || name.includes('Guy')) ? 'male' : 'female';
                
                // ── QUIP BUBBLE STATE (for emote reactions) ──
                // Shared shape with Pedestrian's quip system. Only NPCs listed
                // in NPC_EMOTE_REACTIONS will ever set quipText, but the fields
                // exist on every NPC so the update/draw paths stay branch-free.
                this.quipText = null;
                this.quipAge = 0;
                this.quipDuration = 0;
                this.quipCooldown = 0;
                
                // ── TEAMMATE COMBAT SYSTEM ──
                if (isTeammate && combatConfig) {
                    this.recruited = false;
                    this.hireType = 'permanent';
                    this.hireDuration = 0;
                    this.downed = false;  // True when HP hits 0 — revive at apartment
                    this.relationship = combatConfig.relationship ?? 0;
                    this.bio = combatConfig.bio || '';
                    
                    // Override shared combat defaults with teammate config
                    this.equippedWeaponId = combatConfig.weaponId || 'pistol_fpx';
                    this.equippedAbilityId = combatConfig.abilityId || null;
                    this.burstSize = combatConfig.burstSize || 1;
                    this.burstDelay = combatConfig.burstDelay || 10;
                    this.accuracyMod = combatConfig.accuracyMod || 1.0;
                    this.shotsLeftInBurst = this.burstSize;
                    
                    // Appearance config for drawProceduralHumanoid
                    this.appearance = combatConfig.appearance || null;
                    
                    // ── HEALING SYSTEM ──
                    this.teammateStims = 3;        // Self-heal charges
                    this.maxTeammateStims = 3;     // Max stim capacity
                    this.stimCooldown = 0;         // Prevent stim spam (frames)
                    this.outOfCombatTimer = 0;     // Frames since last enemy nearby
                    this.regenTimer = 0;           // Passive regen tick counter
                    this.proximityHealTimer = 0;   // Aura tick counter
                }
            }

            /**
             * Smart pathfinding with obstacle avoidance.
             * Uses feeler raycasts to steer around walls and buildings.
             */
            smartMove(targetX, targetY, speed, walls, buildings, traffic) {
                if (this.dead || this.inCar) return;
                
                // 1. Desired Velocity
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist < 60) return; // Stop if close

                // Normalize desired velocity
                let vx = (dx / dist) * speed;
                let vy = (dy / dist) * speed;

                // 2. Obstacle Avoidance (Raycast Feeler)
                const feelerLen = 40;
                const nextX = this.x + vx * (feelerLen/speed);
                const nextY = this.y + vy * (feelerLen/speed);

                let avoidanceX = 0;
                let avoidanceY = 0;
                let hit = false;

                hit = isLineBlocked(this.x, this.y, nextX, nextY, walls, buildings);

                // If blocked, apply lateral force (simple steer)
                if (hit) {
                    // Try rotating vector 90 degrees
                    avoidanceX = -vy * 2.0; 
                    avoidanceY = vx * 2.0;
                }
                
                this.velX = vx + avoidanceX;
                this.velY = vy + avoidanceY;

                // Apply movement (bypassing ActorEntity velocity for direct control)
                gaitCommand(this, vx + avoidanceX, vy + avoidanceY);
                this.x += vx + avoidanceX;
                this.y += vy + avoidanceY;
            }
            
            /**
             * Override ActorEntity update for NPC-specific logic.
             * Applies knockback physics but not AI movement (handled by smartMove).
             */
            update() {
                if (this.dead) return;
                
                // Apply knockback from ActorEntity (damage pushback)
                if (this.knockbackVx || this.knockbackVy) {
                    this.x += this.knockbackVx;
                    this.y += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                
                // Decrement invincibility
                if (this.invincibleTimer > 0) {
                    this.invincibleTimer--;
                }
            }
            
            /**
             * Set a speech bubble above this NPC. Mirrors Pedestrian._setQuip
             * timing for reading duration, but uses a much shorter post-bubble
             * cooldown (~300ms vs pedestrians' 8–12s). Named NPCs are people
             * the player is intentionally interacting with, not passersby, so
             * a long cooldown felt unresponsive when emoting at them.
             */
            _setQuip(text) {
                if (!text) return;
                this.quipText = text;
                this.quipAge = 0;
                this.quipDuration = Math.min(220, 110 + text.length * 2);
                // 300ms (~18 frames @ 60fps) after the bubble closes.
                this.quipCooldown = this.quipDuration + 18;
            }
            
            /**
             * Direct reaction to a player emote. Looks up this NPC's name in
             * NPC_EMOTE_REACTIONS — if there's no entry, the NPC silently
             * ignores the emote (they're not opted in). Respects an existing
             * bubble and cooldown so we don't interrupt or spam.
             *
             * @param {'smile'|'zany'|'cry'|'frown'} emote
             */
            reactToEmote(emote) {
                if (this.dead) return;
                if (this.quipText) return;
                if (this.quipCooldown > 0) return;
                const reactions = NPC_EMOTE_REACTIONS[this.name];
                if (!reactions) return;
                const categoryMap = {
                    smile: 'reactSmile',
                    zany:  'reactZany',
                    cry:   'reactCry',
                    frown: 'reactFrown'
                };
                const cat = categoryMap[emote];
                if (!cat) return;
                // Tier from relationship, when this NPC is a teammate that tracks
                // one. Plain NPCs (Anavia, Mirabel) have no `relationship` and
                // resolve at tier 0, which flat-array tables ignore anyway.
                let tier = 0;
                if (typeof this.relationship === 'number' && typeof game !== 'undefined' && game && game.bonding) {
                    tier = game.bonding.getTier(this.relationship);
                }
                const lines = resolveEmoteLines(reactions, cat, tier);
                if (!lines || lines.length === 0) return;
                this._setQuip(lines[Math.floor(Math.random() * lines.length)]);
            }
            
            /**
             * Teammate combat update — follow player or formation slot, auto-target enemies.
             * Reads weapon stats from ITEM_REGISTRY for damage, fire rate, projectile visuals.
             * Called separately from update() by the game loop for recruited teammates.
             * @param {number} playerX - Player world X (used for teleport-recover and heal aura)
             * @param {number} playerY - Player world Y
             * @param {Array} enemies - Enemy list for combat targeting
             * @param {Object} game - Game ref
             * @param {Object} [followTarget] - Optional {x, y} formation slot. Defaults to player.
             * @param {boolean} [skipFollow=false] - If true, the caller has already handled
             *   movement this frame, so this method only does combat. Used by the contract
             *   branch which runs its own slot-aware smartMove pass before calling here.
             * @returns {ProjectileEntity|null} A projectile if the teammate fired this frame.
             */
            updateCombat(playerX, playerY, enemies, game, followTarget, skipFollow = false) {
                if (this.dead || !this.recruited || this.inCar) return null;
                
                // Decay combat facing timer
                if (this.combatTargetTimer > 0) this.combatTargetTimer--;
                
                // Apply knockback physics
                if (this.knockbackVx || this.knockbackVy) {
                    this.x += this.knockbackVx;
                    this.y += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                if (this.stimCooldown > 0) this.stimCooldown--;
                
                // ── Follow target (slot if provided, else player) ──
                // Teleport-recover always uses player distance (recovers if truly lost,
                // regardless of formation slot location).
                // skipFollow=true means the caller already moved us this frame (contract
                // branch does its own slot-aware smartMove pass), so we must NOT move
                // again here — that was the v7.0.5 bug where contract teammates moved
                // twice per frame and permanent teammates only once, making permanent
                // feel ~2× slower than hired companions.
                const inApartment = game && game.activeMap && game.activeMap.id === 'apt_949';
                const distToPlayer = Math.hypot(playerX - this.x, playerY - this.y);
                if (!inApartment && !skipFollow) {
                    if (distToPlayer > CONFIG.COMPANION.FOLLOW_TELEPORT_DIST) {
                        this.x = playerX;
                        this.y = playerY;
                        resetHumanoidAnim(this);
                    } else {
                        // Soft arrival on slot (or player as fallback)
                        const tx = followTarget ? followTarget.x : playerX;
                        const ty = followTarget ? followTarget.y : playerY;
                        const dx = tx - this.x;
                        const dy = ty - this.y;
                        const dist = Math.hypot(dx, dy);
                        const deadzone = CONFIG.COMPANION.FORMATION_DEADZONE;
                        if (dist > deadzone) {
                            // Adaptive speed: cruise speed when close, match player when at
                            // medium distance, burst-catchup when far behind. Without this,
                            // the teammate's base speed (3.5) is below the player's (5.2),
                            // so they fall behind during any sustained movement.
                            const C = CONFIG.COMPANION;
                            let topSpeed = this.speed;  // cruise (TEAMMATE_SPEED, 3.5)
                            if (dist > C.CATCHUP_DISTANCE) topSpeed = C.CATCHUP_SPEED;
                            else if (dist > C.MATCH_DISTANCE) topSpeed = C.MATCH_SPEED;
                            // Proportional approach: step shrinks as we near the target,
                            // capped by the chosen speed. This is what kills the wiggle.
                            // Straight when clear, otherwise along a nav-grid path; soft arrival either way
                            companionNavStep(this, tx, ty, topSpeed, game);
                        }
                    }
                } 
                
                // Recompute dist after movement — referenced below by the heal aura.
                const dist = Math.hypot(playerX - this.x, playerY - this.y);
                
                
                // ── HEALING SYSTEMS ──
                
                // 1. Combat proximity check (are enemies within 400px?)
                let enemyNearby = false;
                for (let e of enemies) {
                    if (e.dead) continue;
                    if (Math.hypot(this.x - e.x, this.y - e.y) < 400) { 
                        enemyNearby = true; break; 
                    }
                }
                
                if (enemyNearby) {
                    this.outOfCombatTimer = 0;
                } else {
                    this.outOfCombatTimer++;
                }
                
                // 2. Passive Regen (out of combat for 3+ seconds = 180 frames)
                if (this.outOfCombatTimer > 180 && this.hp < this.maxHp) {
                    this.regenTimer++;
                    if (this.regenTimer >= 30) { // 1 HP every 0.5 seconds
                        this.regenTimer = 0;
                        this.heal(1);
                    }
                } else {
                    this.regenTimer = 0;
                }
                
                // 3. Self-Heal (auto-stim at 30% HP)
                if (this.hp < this.maxHp * 0.3 && this.teammateStims > 0 && this.stimCooldown <= 0) {
                    this.teammateStims--;
                    this.stimCooldown = 120; // 2 second cooldown between stims
                    this.heal(50);
                    // Combat quip
                    if (typeof captionSystem !== 'undefined') {
                        captionSystem.show(this.name, "Still breathing.", 2000);
                    }
                }
                
                // 4. Proximity Aura (heal when near player)
                if (dist < 120 && this.hp < this.maxHp) {
                    this.proximityHealTimer++;
                    // Base: 1 HP every 60 frames (1 second). VITAL LINK augment: 75% faster
                    let auraInterval = 60;
                    if (game && game.augments && game.augments.isEquipped('vital_link')) {
                        auraInterval = 34; // 60 / 1.75 ≈ 34 frames
                    }
                    if (this.proximityHealTimer >= auraInterval) {
                        this.proximityHealTimer = 0;
                        this.heal(1);
                    }
                } else {
                    this.proximityHealTimer = 0;
                }
                
                // ── Targeting & Firing (unified — weapons and abilities) ──
                if (this.cooldown > 0) this.cooldown--;
                if (this.cooldown > 0 || enemies.length === 0) return null;
                
                // Determine range from weapon or ability
                const hasWeapon = this.equippedWeaponId && ITEM_REGISTRY[this.equippedWeaponId];
                const hasAbility = this.equippedAbilityId && ABILITY_REGISTRY[this.equippedAbilityId];
                const range = hasWeapon ? 400 : (hasAbility ? (ABILITY_REGISTRY[this.equippedAbilityId].stats.range || 400) : 400);
                
                // Companions whose shots stop at walls only target enemies they can hit
                const needsEyeline = game && game.activeMap && companionNeedsEyeline(this);
                let nearest = null; 
                let minDist = range;
                for (let e of enemies) {
                    if (e.dead) continue;
                    const d = Math.hypot(this.x - e.x, this.y - e.y);
                    if (d < minDist && (!needsEyeline || hasShotLine(this.x, this.y, e.x, e.y, game.activeMap))) { minDist = d; nearest = e; }
                }
                if (!nearest) {
                    // No clear shot: hold fire, but keep facing the enemy we're maneuvering on
                    const t = this._tac && this._tac.target;
                    if (needsEyeline && t && !t.dead) {
                        this.combatTargetAngle = Math.atan2(t.y - this.y, t.x - this.x);
                        this.combatTargetTimer = 10;
                    }
                    return null;
                }
                
                const angle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
                this.combatTargetAngle = angle;
                this.combatTargetTimer = 20; // Frames to hold facing after shot
                
                // Fire weapon or cast ability
                if (hasWeapon) {
                    const stats = ITEM_REGISTRY[this.equippedWeaponId].stats;
                    this.shotsLeftInBurst--;
                    if (this.shotsLeftInBurst > 0) {
                        this.cooldown = this.burstDelay;
                    } else {
                        this.cooldown = (stats.fireRate || 20) * Math.max(this.burstSize, 2);
                        this.shotsLeftInBurst = this.burstSize;
                    }
                    this._shotTick = _simTick;   // drives the recoil kick in drawTeammate
                    const shot = aimFromMuzzle(this, angle, nearest.x, nearest.y);   // leaves the barrel, lands on target
                    return fireWeaponProjectile(this, shot.angle, this.equippedWeaponId, { spreadMod: this.accuracyMod, origin: shot });
                } else if (hasAbility) {
                    const stats = ABILITY_REGISTRY[this.equippedAbilityId].stats;
                    this.cooldown = stats.fireRate || 70;
                    return castAbilityProjectile(this, angle, this.equippedAbilityId);
                }
                return null;
            }
            
            /**
             * Vehicle combat — unified for all companion types.
             * Uses centralized fire functions. Handles lean-out positioning and arc validation.
             */
            updateVehicleCombat(car, enemies, game) {
                if (this.dead || !this.inCar || this.seatIndex === undefined || this.seatIndex < 1) return null;
                if (!car || !car.seatLayout) return null;

                // Decay combat facing timer
                if (this.combatTargetTimer > 0) this.combatTargetTimer--;

                // ALWAYS update position to seat lean-out spot, even during cooldown
                const seat = car.seatLayout[this.seatIndex];
                if (!seat) return null;
                const seatPos = car.getSeatWorldPos(this.seatIndex);
                const leanOutDist = car.width / 2 + 8;
                const outwardAngle = car.angle + (seat.side === 'left' ? -Math.PI / 2 : Math.PI / 2);
                const fireX = seatPos.x + Math.cos(outwardAngle) * leanOutDist;
                const fireY = seatPos.y + Math.sin(outwardAngle) * leanOutDist;
                this.x = fireX;
                this.y = fireY;

                if (!this.equippedWeaponId && !this.equippedAbilityId) return null;
                if (this.cooldown > 0) { this.cooldown--; return null; }

                // Determine range
                const hasWeapon = this.equippedWeaponId && ITEM_REGISTRY[this.equippedWeaponId];
                const hasAbility = this.equippedAbilityId && ABILITY_REGISTRY[this.equippedAbilityId];
                const range = hasWeapon ? 500 : (hasAbility ? (ABILITY_REGISTRY[this.equippedAbilityId].stats.range || 400) : 400);

                // Find nearest enemy
                let nearest = null;
                let minDist = range;
                for (let e of enemies) {
                    if (e.dead) continue;
                    const d = Math.hypot(fireX - e.x, fireY - e.y);
                    if (d < minDist) { minDist = d; nearest = e; }
                }
                if (!nearest) return null;

                // Check firing arc
                const angleToTarget = Math.atan2(nearest.y - fireY, nearest.x - fireX);
                this.combatTargetAngle = angleToTarget;
                this.combatTargetTimer = 20;
                if (!car.isAngleValidForSeat(this.seatIndex, angleToTarget)) return null;

                // Fire using centralized functions
                if (hasWeapon) {
                    const stats = ITEM_REGISTRY[this.equippedWeaponId].stats;
                    this.shotsLeftInBurst--;
                    if (this.shotsLeftInBurst > 0) {
                        this.cooldown = this.burstDelay;
                    } else {
                        this.cooldown = (stats.fireRate || 20) * Math.max(this.burstSize, 2);
                        this.shotsLeftInBurst = this.burstSize;
                    }
                    return fireWeaponProjectile(this, angleToTarget, this.equippedWeaponId, { spreadMod: this.accuracyMod || 1.0 });
                } else if (hasAbility) {
                    const stats = ABILITY_REGISTRY[this.equippedAbilityId].stats;
                    this.cooldown = stats.fireRate || 70;
                    return castAbilityProjectile(this, angleToTarget, this.equippedAbilityId);
                }
                return null;
            }

            /**
             * Override die() — permanent teammates become downed instead of dead.
             * Downed teammates can be recovered at the apartment.
             */
            die() {
                if (this.dead) return;
                if (this.hireType === 'permanent' && this.role === 'teammate') {
                    this.dead = true;
                    this.downed = true;
                    this.active = false;
                    this.visible = false;
                    showMessage(`${this.name.toUpperCase()} IS DOWN! Return to Silver Queen Apartments to recover.`);
                    if (typeof captionSystem !== 'undefined') {
                        captionSystem.show(this.name, "I'm... going down...", 3000);
                    }
                    return;
                }
                // All other NPCs use default death
                super.die();
            }

            /**
             * Override onProjectileHit - NPCs only take damage from ENEMY projectiles.
             * This prevents the player from accidentally (or intentionally!) killing friendly NPCs.
             */
            onProjectileHit(projectile, game) {
                // Only take damage from enemy projectiles
                if (!projectile.isEnemy) return;
                
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    // Damage-based knockback: stronger shots push harder
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 10;
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 12), 50);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }
            
            /**
             * Draw the NPC with role-specific rendering.
             * Preserves all original visual styles exactly.
             */
            draw(ctx, player) {
                
                if (this.inCar || this.dead) return;
                
                // Tick quip bubble lifetime here (not in update()) because the
                // game loop never calls NPC.update() per-frame — only the draw
                // path runs reliably for NPCs. Without this, quipAge stays at
                // 0 forever and the pop-in scale formula yields 0, hiding the
                // bubble even when quipText is set.
                if (this.quipText) {
                    this.quipAge++;
                    if (this.quipAge >= this.quipDuration) {
                        this.quipText = null;
                        this.quipAge = 0;
                    }
                }
                if (this.quipCooldown > 0) this.quipCooldown--;
                
                // Shared gait controller (per sim tick) drives both the legs and the
                // facing below, so extra or missing renders can't flicker either one.
                const gait = syncHumanoidGait(this);
                
                // Flash if invincible (from ActorEntity)
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) {
                    return;
                }

                const speed = gait.speed;
                
                this.lastX = this.x;
                this.lastY = this.y;

                ctx.save(); 
                ctx.translate(this.x, this.y);
                
                // --- ROTATION LOGIC ---
                // Every NPC is a procedural humanoid now, which faces Right (0 radians).
                // (The −PI/2 correction was for the old sprites that were drawn facing Down.)
                const usesRawAngle = true;
                const staffLook = this._staffLook();
                
                if (this.combatTargetTimer > 0 && this.combatTargetAngle !== undefined) {
                    // In combat: face target
                    const angle = this.combatTargetAngle;
                    this.angle = angle;
                    ctx.rotate(usesRawAngle ? angle : angle - Math.PI/2);
                } else if (speed > 0.1) {
                    // Moving: Face direction of travel
                    const angle = Math.atan2(gait.dirY, gait.dirX);
                    this.angle = angle;
                    ctx.rotate(usesRawAngle ? angle : angle - Math.PI/2); 
                } else if ((this.hired || this.recruited) && player) {
                    // IDLE & HIRED/RECRUITED: Face Player
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    ctx.rotate(usesRawAngle ? angle : angle - Math.PI/2);
                } else if (staffLook && staffLook.idleAngle !== undefined) {
                    ctx.rotate(staffLook.idleAngle);                          // staff face the room when idle
                } else {
                    // Default Idle
                    if (!usesRawAngle) ctx.rotate(0);
                }

                // --- RENDERERS ---
                if (this.name === 'Anavia') {
                    this.drawAnavia(ctx); 
                } 
                else if (staffLook) this.drawStaff(ctx, staffLook);
                else if (this.role === 'red_demon_dancer' || this.role === 'dancer') this.drawFemaleDancer(ctx, this.walkPhase, speed);
                
                else if (this.name === 'Ms. Jean' || this.role === 'ms_jean') this.drawMsJean(ctx);
                else if (this.name === 'Mirabel') this.drawMirabell(ctx);
                else if (this.name === 'Prisma') this.drawPrisma(ctx);
                else if (this.name === 'Torque') this.drawTorque(ctx);
                else if (this.name === 'Biggs') this.drawBiggs(ctx);
                else if (this.name === 'Grum North') this.drawGrumNorth(ctx);
                else if (this.role === 'teammate') this.drawTeammate(ctx);
                else this.drawGeneric(ctx);

                ctx.restore();
                
                // ── TEAMMATE OVERLAYS (drawn in world space, outside rotation) ──
                if (this.role === 'teammate' && this.recruited) {
                    // Health bar (if damaged)
                    if (this.hp < this.maxHp) {
                        drawHPBar(ctx, this.x - 13, this.y - 25, 26, 4, this.hp / this.maxHp);
                    }
                }
                
                // Bubble drawing has moved to drawQuipBubble() — the main
                // render loop now draws all character bubbles in a second
                // pass on top of the player/teammates/enemies, so bubbles
                // never get covered by other character bodies.
            }
            
            /**
             * Draw the speech bubble above this NPC's head.
             * Called separately from draw() so all bubbles can be rendered
             * in a unified top layer (see GameEngine main render loop).
             * Outline is tinted by SPEAKER_COLORS for character distinction.
             * No-op when there's no active quip.
             */
            drawQuipBubble(ctx) {
                if (!this.quipText || this.dead || this.inCar) return;
                
                const POP_IN = 8;
                const POP_OUT = 10;
                let scale;
                if (this.quipAge < POP_IN) {
                    const t = this.quipAge / POP_IN;
                    scale = 1 - Math.pow(1 - t, 3);
                } else if (this.quipAge < this.quipDuration - POP_OUT) {
                    scale = 1;
                } else {
                    const t = Math.max(0, (this.quipDuration - this.quipAge) / POP_OUT);
                    scale = t * t;
                }
                if (scale <= 0.01) return;
                
                ctx.save();
                ctx.translate(this.x, this.y - 35);
                ctx.scale(scale, scale);
                
                ctx.font = '600 8px Montserrat, sans-serif';
                const textW = ctx.measureText(this.quipText).width;
                const padX = 7;
                const padY = 3;
                const w = Math.max(28, textW + padX * 2);
                const h = 16 + padY * 2;
                const r = 6;
                const x = -w / 2;
                const y = -h / 2;
                
                // Character-colored outline. SPEAKER_COLORS may be missing
                // this NPC — fall back to the existing pedestrian-bubble
                // purple so the bubble still reads correctly.
                const charColor = (typeof SPEAKER_COLORS !== 'undefined' && SPEAKER_COLORS[this.name]) || '#a469ff';
                
                ctx.fillStyle = 'rgba(8, 6, 18, 0.86)';
                ctx.strokeStyle = charColor;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + w / 2 + 4, y + h);
                ctx.lineTo(x + w / 2,     y + h + 4);
                ctx.lineTo(x + w / 2 - 4, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#e8e4ff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.quipText, 0, 0);
                
                ctx.restore();
            }
            
            // ANAVIA (The VIP)
            drawAnavia(ctx) {
                // Ensure velocity/phase exist
                if (this.walkPhase === undefined) this.walkPhase = 0;
                
                // Radiant Caramel Skin (Custom Hex)
                const caramelSkin = '#c68e63'; 
                const periwinkle = '#CCCCFF';
                
                // Subtle VIP Glow
                
                drawProceduralHumanoid(ctx, this, {
                    skinColor: caramelSkin,
                    gender: 'female',   // Wide hips
                    stance: 'idle',     
                    
                    // THE LOOK: Periwinkle Silk & Gold
                    top: { type: 'sports_bra', color: periwinkle }, // Simulating a silk top
                    bottom: { type: 'skirt', color: periwinkle },   
                    train: { type: 'silk_flow', color: periwinkle }, 
                    shoes: { type: 'heels', color: '#FFD700' }, // Gold heels
                    
                    // SIGNATURE HAIR
                    hair: { type: 'curls', color: '#0a0505' }, // Darkest brown/black

                    // PROP: A glass of wine — Bellafore
                    held: { type: 'glass', drink: 'red_wine', hand: 'right' }
                });
                
            }

            // --- VISUALS ---

            // 2. MS. JEAN (Wider Hair, Static Pose, Smooth Sip)
            drawMsJean(ctx) {
                // Ensure velocity/phase exist for the procedural renderer
                if (this.walkPhase === undefined) this.walkPhase = 0;
                if (this.velX === undefined) this.velX = 0;
                if (this.velY === undefined) this.velY = 0;

                // Call the procedural renderer
                // Note: ctx is already translated/rotated by the parent draw() function
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#8d5524',
                    gender: 'female',   // Triggers wide hips (-8 offset, 12 width)
                    stance: 'idle',     // One hand holds glass, other swings naturally
                    
                    // THE RED DRESS LOOK
                    // We simulate a dress by matching the top and bottom colors
                    top: { type: 'sports_bra', color: '#aa0000' }, 
                    bottom: { type: 'skirt', color: '#aa0000' },   
                    train: { type: 'dress_train', color: '#880000' }, 
                    shoes: { type: 'heels', color: '#440000' },
                    
                    // HAIR
                    hair: { type: 'long', color: '#111' },

                    // PROP: her own brand — Ms. Jean Cream Soda
                    held: { type: 'glass', drink: 'cream_soda', hand: 'right' }
                });
            }
            
            /**
             * The look for staff, androids, medics and male dancers (STAFF_LOOKS or a
             * seeded one), or null for NPCs with their own draw method. Cached.
             */
            _staffLook() {
                if (this._look !== undefined) return this._look;
                let look = STAFF_LOOKS[this.name] || null;
                if (!look && (this.role === 'medic' || ((this.role === 'dancer' || this.role === 'red_demon_dancer') && this.gender === 'male')))
                    look = seededNpcLook(this);
                if (!look && this.role && this.role.includes('robot'))       // unnamed Double Nights staff: silver
                    look = { gender: 'androgynous', body: { kind: 'android', finish: 'silver' }, top: { type: 'dn_uniform', color: '#1c2030', trim: '#dfe6ff' },
                             bottom: { type: 'pants', color: '#1a1a1a' }, shoes: { type: 'loafers', color: '#111111' }, pose: 'concierge' };
                if (look && look.pose !== 'dance') look = { idleAngle: Math.PI / 2, ...look };
                return (this._look = look);
            }

            drawStaff(ctx, look) {
                drawProceduralHumanoid(ctx, this, { stance: 'idle', ...look });
            }

            drawFemaleDancer(ctx, phase, speed) {
                
                if (this.walkPhase === undefined) this.walkPhase = 0;
                if (this.velX === undefined) this.velX = 0;
                if (this.velY === undefined) this.velY = 0;
                
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#8a0707', // Demon Red
                    gender: 'female',
                    stance: 'idle',
                    pose: 'dance',
                    hair: { type: 'demon_dancer', color: '#0a0000' }, // <--- The Ported Hair
                    top: { type: 'sports_bra', color: '#111' },
                    bottom: { type: 'skirt', color: '#111' }
                });
            }
            
            

            drawMirabell(ctx) {
                if (this.walkPhase === undefined) this.walkPhase = 0;
                if (this.velX === undefined) this.velX = 0;
                if (this.velY === undefined) this.velY = 0;
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#dcc6ac',
                    gender: 'female',
                    stance: 'idle',
                    top:    { type: 'suit', color: '#4a0a10' },
                    bottom: { type: 'skirt', color: '#4a0a10' },
                    shoes:  { type: 'heels', color: '#2a0508' },
                    hair:   { type: 'long', color: '#1a0505' },
                    hat:    { type: 'wide_brim', color: '#590e18', crownColor: '#70121e', stroke: '#1a0505' }
                });
            }

            drawPrisma(ctx) {
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#c8b8d0',
                    gender: 'female',
                    stance: 'idle',
                    isDriving: false,
                    hair: { type: 'braids', color: '#e0e8ff' },
                    top: { type: 'sports_bra', color: '#aaccff' },
                    bottom: { type: 'skirt', color: '#8888cc' },
                    shoes: { type: 'heels', color: '#ddeeff' },
                });
                // Crystalline shimmer overlay — small faceted highlights
                const t = (typeof _frameTime !== 'undefined' ? _frameTime : Date.now()) * 0.003;
                ctx.save();
                ctx.globalAlpha = 0.35;
                for (let i = 0; i < 5; i++) {
                    const ox = Math.sin(t + i * 1.3) * 6;
                    const oy = Math.cos(t + i * 1.7) * 8 - 4;
                    const sz = 2 + Math.sin(t * 0.7 + i) * 1;
                    ctx.fillStyle = i % 2 === 0 ? '#aaddff' : '#ccaaff';
                    ctx.beginPath();
                    // Diamond shape
                    ctx.moveTo(ox, oy - sz);
                    ctx.lineTo(ox + sz * 0.6, oy);
                    ctx.lineTo(ox, oy + sz);
                    ctx.lineTo(ox - sz * 0.6, oy);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }

            /** Torque — Auto Shop mechanic. Burly, short-haired, coveralls. */
            drawTorque(ctx) {
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#6b3a2a',
                    gender: 'male',
                    stance: 'idle',
                    hair: { type: 'short', color: '#1a1a1a' },
                    top: { type: 'tshirt', color: '#ff6600' },
                    bottom: { type: 'pants', color: '#2a2a2a' },
                    shoes: { type: 'shoes', color: '#333' },
                });
            }

            drawBiggs(ctx) {
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#c9a87c',
                    gender: 'male',
                    stance: 'idle',
                    hair: { type: 'afro', color: '#ff8800' },
                    top: { type: 'suit', color: '#2a0a30' },
                    bottom: { type: 'pants', color: '#1a0820' },
                    shoes: { type: 'boots', color: '#ff8800' },
                });
            }

            drawGrumNorth(ctx) {
                drawProceduralHumanoid(ctx, this, {
                    skinColor: '#8a7565',       // Grayish brown
                    gender: 'male',
                    stance: 'idle',
                    hair: { type: 'short', color: '#7a7a7a' },  // Graying hair
                    top: { type: 'suit', color: '#2a1a1a' },    // Dark crimson-black coat
                    bottom: { type: 'pants', color: '#1a1a1a' },
                    shoes: { type: 'boots', color: '#3a2020' },
                });
            }

            
            /**
             * Teammate renderer — uses config-driven appearance via drawProceduralHumanoid.
             * Gun color pulled from equipped weapon's projectileColor.
             */
            drawTeammate(ctx) {
                // Resolve appearance from combatConfig or use defaults
                const app = this.appearance || {};
                
                // Determine stance from combat state (only active when recruited)
                const inCombat = this.recruited && (this.cooldown > 0 || (this.shotsLeftInBurst < this.burstSize));
                const weaponId = this.recruited ? this.equippedWeaponId : null;
                
                drawProceduralHumanoid(ctx, this, {
                    skinColor: app.skinColor || '#c68642',
                    gender: app.gender || 'female',
                    // Stance fits the weapon (rifles/snipers two-handed); ability users cast
                    // with an extended hand. Recoil is a real kick from the last shot.
                    stance: inCombat ? stanceForWeapon(weaponId) : 'idle',
                    pose: this._idlePose || undefined,      // e.g. Yenna's crossed arms at the apartment
                    kick: inCombat ? shotKick(this) : 0,
                    weapon: weaponId ? { id: weaponId, ready: inCombat } : null,
                    top:    app.top    || { type: 'suit', color: '#2a0a3a' },
                    bottom: app.bottom || { type: 'pants', color: '#1a0820' },
                    shoes:  app.shoes  || { type: 'boots', color: '#333' },
                    hair:   app.hair   || { type: 'short', color: '#111' },
                    hat:    app.hat    || null,
                });
                
                // (The weapon is drawn by drawProceduralHumanoid, in hand.)
            }
            
            drawGeneric(ctx) { 
                // Seed a stable random appearance from the NPC's name
                if (!this._genericSeed) {
                    let hash = 0;
                    const n = this.name || 'NPC';
                    for (let i = 0; i < n.length; i++) hash = ((hash << 5) - hash) + n.charCodeAt(i);
                    const h = Math.abs(hash);
                    const skins = ['#f5d0a9', '#c68e63', '#8d5524', '#6b3a2a', '#d4a574', '#e8c4a0'];
                    const tops = ['#335', '#533', '#353', '#445', '#554', '#345', '#543', '#455'];
                    const bottoms = ['#222', '#333', '#2a2a3a', '#1a1a2a', '#3a2a1a', '#252530'];
                    const hairs = ['#111', '#2a1a0a', '#0a0a0a', '#3a2a1a', '#555', '#1a0a00'];
                    this._genericSeed = {
                        skin: skins[h % skins.length],
                        top: tops[(h >> 3) % tops.length],
                        bottom: bottoms[(h >> 6) % bottoms.length],
                        hair: hairs[(h >> 9) % hairs.length],
                        gender: (h >> 12) % 2 === 0 ? 'male' : 'female',
                    };
                }
                const s = this._genericSeed;
                drawProceduralHumanoid(ctx, this, {
                    skinColor: s.skin,
                    gender: s.gender,
                    stance: 'idle',
                    top: { type: 'tshirt', color: s.top },
                    bottom: { type: s.gender === 'female' ? 'skirt' : 'pants', color: s.bottom },
                    shoes: { type: 'shoes', color: '#222' },
                    hair: { type: s.gender === 'female' ? 'long' : 'short', color: s.hair },
                });
            }
        }

        // =====================================================================
        //  PEDESTRIAN QUIPS — Floating speech bubbles for ambient citizens
        // =====================================================================
        // Categorized dialogue lines triggered by context. A pedestrian pops a
        // small speech bubble above their head (scale-in / hold / scale-out),
        // then returns to ambient walking. Per-pedestrian cooldown prevents
        // any one citizen from spamming, and the trigger chances are tuned so
        // the chorus feels alive but never overwhelming on a crowded street.
        // Categories are checked in priority order: danger > seesWeapon > roaming.
        /* Lines currently in the air, text -> expiry timestamp (ms).
           Time-based rather than a reference count on purpose: quip lifetime only
           ticks inside NPC.draw(), so a pedestrian who wanders off-screen mid-line
           never clears their own bubble. A refcount would leak that line forever;
           an expiry stamp always releases itself. */
        const _activeQuipLines = new Map();
        const QUIP_LINE_GRACE_MS = 1500;   // quiet beat before a line may repeat

        function _quipLineBusy(text) {
            const exp = _activeQuipLines.get(text);
            if (exp === undefined) return false;
            if (_frameTime >= exp) { _activeQuipLines.delete(text); return false; }
            return true;
        }

        const PEDESTRIAN_QUIPS = {
            roaming: [
                "Last week Martha flitted into a wall.",
                "Brax tased himself again. So based, dude.",
                "I should get me some JJ's.",
                "MISTER or MISSUS. That is the question...",
                "I should try out Amber Delivery.",
                "Jefferson Chrome has a new episode out!"
            ],
            seesWeapon: [
                "Nice stick, ma'am.",
                "Ooh, and who's on the receiving end of that?",
                "You really should put that away, you know.",
                "...",
                "Can I see that for a sec?"
            ],
            danger: [
                "I pay taxes? For this??",
                "Hit the floor!!",
                "Mama!",
                "I thought I was just going shopping!",
                "So this is what touching grass looks like."
            ],
            // Reactions to player emotes (player holsters → emote joystick → fires emote)
            reactSmile: [
                "Hey there, sunshine!",
                "Oh, hi!",
                "Look at you, all glowy.",
                "What's got you grinning?",
                "You seem nice."
            ],
            reactZany: [
                "...are you okay?",
                "Sure, why not.",
                "Tuesday energy, I guess.",
                "City does that to people.",
                "I love it. Whatever this is."
            ],
            reactCry: [
                "Aw, hon.",
                "You good?",
                "Need a minute?",
                "Same, honestly.",
                "Want to talk about it?"
            ],
            reactFrown: [
                "Yikes.",
                "Bad day?",
                "Mood.",
                "Cheer up. Or don't.",
                "Damn, who hurt you?"
            ],
            // ── VEHICLE INTERACTION QUIPS ──
            // Two registers: dodgeNearMiss is sharp and immediate (the body
            // reacting in the moment); aftermathBumped names mortality (the
            // self speaking after almost being unmade). Both deliberately
            // refuse to flatten the encounter — these are people, with
            // interior lives, who just had a car come at them.
            dodgeNearMiss: [
                "WATCH IT!",
                "Asshole!",
                "Hey — HEY!",
                "SHIT — drive much?!",
                "JESUS!",
                "Fucking — !"
            ],
            aftermathBumped: [
                "HEY, you could've killed me.",
                "You trying to murder me?!",
                "I have a kid, you fuck!",
                "What the FUCK was that?!",
                "Are you out of your mind?",
                "I almost just died.",
                "You're insane — you know that?",
                "Get OUT of the car."
            ]
        };

        /**
         * NPC_EMOTE_REACTIONS — character-specific reactions to player emotes.
         * Keyed by NPC.name. Anyone listed here can be picked by firePlayerEmote
         * as a reaction target alongside nearby pedestrians, and will pop a
         * speech bubble whose outline is colored from SPEAKER_COLORS.
         *
         * Add a character here to opt them in. Lines should sit in their
         * established voice — terse, in-world, no breaking character.
         *
         * A category's value may be EITHER:
         *   - a flat array of lines (used at every relationship tier), or
         *   - an object keyed by BONDING_TIERS index: { 0: [...], 2: [...] }
         * Tier-keyed pools do NOT need every tier filled — resolveEmoteLines()
         * walks downward to the nearest defined tier, so { 0: [...], 3: [...] }
         * means tiers 1 and 2 reuse tier 0's lines. Non-teammate NPCs have no
         * `relationship` field and always resolve at tier 0.
         */

        /**
         * Resolve an emote reaction pool for a given relationship tier.
         * Handles both the flat-array and tier-keyed formats, falling back
         * downward so a partially-filled table never returns empty.
         *
         * @param {Object} reactions - NPC_EMOTE_REACTIONS entry for a character
         * @param {string} cat - 'reactSmile' | 'reactZany' | 'reactCry' | 'reactFrown'
         * @param {number} tier - BONDING_TIERS index (0-3)
         * @returns {string[]|null} Array of candidate lines, or null if none
         */
        function resolveEmoteLines(reactions, cat, tier) {
            const pool = reactions && reactions[cat];
            if (!pool) return null;
            if (Array.isArray(pool)) return pool.length ? pool : null;
            // Tier-keyed object — walk down from the requested tier.
            for (let t = tier; t >= 0; t--) {
                const lines = pool[t];
                if (Array.isArray(lines) && lines.length) return lines;
            }
            return null;
        }

        const NPC_EMOTE_REACTIONS = {
            Anavia: {
                reactSmile: [
                    "There she is.",
                    "Good to see you smiling.",
                    "Brightens the place up."
                ],
                reactZany: [
                    "Long day?",
                    "Hm. Alright.",
                    "Whatever keeps you sharp."
                ],
                reactCry: [
                    "Hey. Take a breath.",
                    "I've got you.",
                    "Sit with it. I'm not going anywhere."
                ],
                reactFrown: [
                    "City'll do that.",
                    "Talk to me when you're ready.",
                    "Yeah. I know that look."
                ]
            },
            Mirabel: {
                reactSmile: [
                    "Charming.",
                    "Don't get soft on me.",
                    "Mm. Save it for later."
                ],
                reactZany: [
                    "Cute.",
                    "Focus, 949.",
                    "Are we doing this or not?"
                ],
                reactCry: [
                    "Pull yourself together.",
                    "Not here.",
                    "I've seen worse. So have you."
                ],
                reactFrown: [
                    "That's the face I like.",
                    "Good. Stay sharp.",
                    "Now we're talking."
                ]
            },

            // ── Permanent teammates: tier-keyed, indexed to BONDING_TIERS ──
            // 0 Acquaintance · 1 Companion · 2 Trusted · 3 Inner Circle
            Victoria: {
                reactSmile: {
                    0: ["What's that face for?", "Huh. Alright then.", "Don't get used to me being nice about it."],
                    3: ["There it is. Keep that.", "That's my Freelancer.", "Good. You've earned that one."]
                },
                reactZany: {
                    0: ["...Okay.", "Sure. Whatever that was.", "Is that a face or a malfunction?"],
                    3: ["You're an idiot. I like that about you.", "Alright, that got me.", "Do it again. I'm not laughing. I'm not."]
                },
                reactCry: {
                    0: ["Hey. Not in the street.", "Whatever it is, walk it off.", "Save it for the apartment."],
                    2: ["Come here. No — seriously. Come here.", "Okay. Okay. I've got you.", "Who do I have to hit?"],
                    3: ["You don't carry it alone. That's what I'm for.", "I'm not going anywhere. Take your time.", "Whoever did this is already finished. They just don't know it yet."]
                },
                reactFrown: {
                    0: ["Yeah. City's like that.", "Shake it off.", "Join the club."],
                    3: ["Talk to me. I'll listen. Once.", "That look means work. Point me at it.", "Whatever it is — we handle it together."]
                }
            },
            Yenna: {
                reactSmile: {
                    0: ["Noted.", "Your posture improves when you do that.", "Hm."],
                    2: ["Good. Morale affects accuracy.", "That helps more than you'd think."],
                    3: ["I've started looking for that.", "Keep doing it. It steadies me.", "...I'm smiling too. Don't look."]
                },
                reactZany: {
                    0: ["Unusual. Recording it.", "That's a new expression.", "I have no read on that."],
                    3: ["You're ridiculous. It's disarming. Which I assume is the point.", "I never know what you'll do next. That's rare."]
                },
                reactCry: {
                    0: ["Breathe. Four in, four out.", "I'll watch the street. Take a minute.", "Tears don't compromise the position."],
                    2: ["I've cried in worse places. Nobody covered me. I'm covering you.", "Sit. I have the angles."],
                    3: ["You hold everyone else together. Let me hold you.", "I'm here. Nothing gets through me."]
                },
                reactFrown: {
                    0: ["Something's wrong. Range and bearing.", "Your jaw's tight. What is it?"],
                    3: ["I know that face. We'll fix it, or I'll remove it.", "Point me at the problem."]
                }
            },
            Sabrina: {
                reactSmile: {
                    0: ["Oh, we're doing faces now. Delightful.", "Adorable. Truly.", "Careful, someone might think you're happy."],
                    3: ["That one's real. I can tell the difference now.", "Stop it, you'll make me feel something."]
                },
                reactZany: {
                    0: ["Finally, someone speaking my language.", "Oh, I like you.", "Yes. More of that."],
                    3: ["We're broken in the same direction. It's beautiful.", "This is why I stay."]
                },
                reactCry: {
                    0: ["Oh. Um. Joke, or silence?", "I'm bad at this. But I'm here.", "Right. Deflecting won't help. Probably."],
                    2: ["No jokes. I promise. Just — come here.", "I'll stop deflecting for exactly one minute. Go."],
                    3: ["Fall apart. I'll hold the pieces and I won't make it funny.", "I've got you. No punchline."]
                },
                reactFrown: {
                    0: ["Ugh, that face. What did the city do now?", "Somebody's had a day."],
                    3: ["Tell me who. I'll ruin their week. Quietly. Creatively.", "That's your something's-wrong face. Talk."]
                }
            },
            Max: {
                reactSmile: {
                    0: ["YES! Smiling! Love it!", "Oh good, we're friends now, right?", "That's the energy!"],
                    3: ["Okay this is gonna sound weird — when you smile my hands stop buzzing.", "Best part of my day. Easily."]
                },
                reactZany: {
                    0: ["OH we're doing THIS?! Finally!", "*bzzt* YEAH!", "You and me, same brand of broken."],
                    3: ["I love you. Platonically! Mostly! Don't make it weird!", "This. THIS is the crew I signed up for."]
                },
                reactCry: {
                    0: ["Whoa — hey. Hey. What do you need?", "I'm not good at quiet. But I'll try. For you."],
                    2: ["I'm sitting right here and I'm not moving. Take your time.", "Sparks are off. I checked. You can lean."],
                    3: ["My hands are steady. Feel that? That's you. So let me be the steady one for once."]
                },
                reactFrown: {
                    0: ["Uh oh. Who do I need to shock?", "That's a bad face. I hate that face."],
                    3: ["Nope. Not on my watch. What's wrong — tell me — go."]
                }
            },
            Josh: {
                reactSmile: {
                    0: ["Expression logged.", "Positive affect. Noted.", "Acknowledged."],
                    2: ["Your baseline mood is up 18% since recruitment. I've been tracking."],
                    3: ["I've stopped logging these. I just like them."]
                },
                reactZany: {
                    0: ["Unparseable. Continuing.", "I have no classification for that.", "...Noted. Reluctantly."],
                    3: ["I built a category for you. It has one entry."]
                },
                reactCry: {
                    0: ["Distress detected. I am not equipped. I will remain nearby.", "I don't know the correct response. I'm choosing to stay."],
                    2: ["I looked up what helps. Every source said 'presence.' So. I'm present."],
                    3: ["You don't have to explain it. I've stopped needing the data."]
                },
                reactFrown: {
                    0: ["Negative affect. Cause unclear. Querying.", "Something is wrong. Specify and I'll solve it."],
                    3: ["That face means don't ask yet. So I won't. I'll wait."]
                }
            }
        };

