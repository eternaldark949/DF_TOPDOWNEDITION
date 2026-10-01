        /**
         * =====================================================================
         *  PEDESTRIAN CLASS (Roaming City Civilian)
         * =====================================================================
         * NPCs that walk along sidewalks and use crosswalks to cross streets.
         * Brings life to the city with varied appearances and behaviors.
         * 
         * Features:
         * - Follows sidewalk network waypoints
         * - Uses crosswalks to cross roads safely
         * - Varied appearances (suits, casual, workers, etc.)
         * - Avoids player and other pedestrians
         * - Dynamic spawn/despawn based on player proximity
         */
        class Pedestrian extends ActorEntity {
            // Appearance presets for variety
            static APPEARANCES = [
                { name: 'suit_male', bodyColor: '#1a1a2e', headColor: '#dcc6ac', hairColor: '#222', hasHat: false },
                { name: 'suit_female', bodyColor: '#2d132c', headColor: '#e8d5c4', hairColor: '#4a3728', hasHat: false },
                { name: 'casual_male', bodyColor: '#3d5a80', headColor: '#c9a87c', hairColor: '#1a1a1a', hasHat: false },
                { name: 'casual_female', bodyColor: '#ee6c4d', headColor: '#e8d5c4', hairColor: '#8b4513', hasHat: false },
                { name: 'worker', bodyColor: '#ff6b35', headColor: '#c9a87c', hairColor: '#222', hasHat: true, hatColor: '#ffcc00' },
                { name: 'corporate', bodyColor: '#293241', headColor: '#dcc6ac', hairColor: '#333', hasHat: false },
                { name: 'hipster', bodyColor: '#606c38', headColor: '#dcc6ac', hairColor: '#8b4513', hasHat: true, hatColor: '#333' },
                { name: 'punk', bodyColor: '#9d4edd', headColor: '#e8d5c4', hairColor: '#ff006e', hasHat: false },
                { name: 'tourist', bodyColor: '#48cae4', headColor: '#c9a87c', hairColor: '#654321', hasHat: true, hatColor: '#fff' },
                { name: 'delivery', bodyColor: '#2ec4b6', headColor: '#dcc6ac', hairColor: '#1a1a1a', hasHat: true, hatColor: '#2ec4b6' }
            ];

            /** Is it raining where this pedestrian is? */
            _raining() {
                return typeof game !== 'undefined' && game.weather && game.weather.isRaining && game.activeMap && game.activeMap.type !== 'indoor';
            }

            /** A person built from an archetype (their look: ROLE_LOOKS.pedestrian, core/appearances.js). */
            static makeLook(ap, r) { return ROLE_LOOKS.pedestrian(ap, r); }
            
            constructor(x, y, network) {
                super({
                    x: x,
                    y: y,
                    radius: 12,
                    type: 'pedestrian',
                    alliance: 'neutral',
                    hp: 100,
                    mass: 8,
                    friction: 0.85,
                    speed: 3.2 + Math.random() * 0.8, // Varied walking speeds (1.2 - 2.0)
                    hasCollision: true,
                    invincibleDuration: 30
                });
                
                // Navigation
                this.network = network;
                this.currentNodeId = null;
                this.targetNodeId = null;
                this.pathProgress = 0;
                
                // State machine
                this.state = 'walking'; // walking, waiting, crossing, dodging, sprawled, recovering
                this.waitTimer = 0;
                this.crossingTimer = 0;
                
                // ── VEHICLE INTERACTION STATE ──
                // dodgeTimer: frames remaining in active dodge burst
                // dodgeDirX/Y: unit vector of the dodge direction
                // sprawlTimer: frames remaining lying on the ground
                // recoverTimer: frames remaining in stand-up animation
                // bumpCount: how many times this ped has been hit (Phase 3 hook)
                // vehicleCheckCooldown: throttles raycast checks for perf
                this.dodgeTimer = 0;
                this.dodgeDirX = 0;
                this.dodgeDirY = 0;
                this.sprawlTimer = 0;
                this.recoverTimer = 0;
                this.sprawlAngle = 0;       // rotation while lying on the ground
                this.bumpCount = 0;
                this.vehicleCheckCooldown = Math.floor(Math.random() * 8); // stagger
                
                // Appearance (random selection)
                const appearance = Pedestrian.APPEARANCES[Math.floor(Math.random() * Pedestrian.APPEARANCES.length)];
                this.appearance = appearance;
                this.bodyColor = appearance.bodyColor;
                this.headColor = appearance.headColor;
                this.hairColor = appearance.hairColor;
                this.hasHat = appearance.hasHat;
                this.hatColor = appearance.hatColor || '#333';
                this.look = Pedestrian.makeLook(appearance, seededRandom(Math.random()));   // who this person is (stable)
                
                // Animation
                this.walkPhase = Math.random() * Math.PI * 2;
                this.lastX = x;
                this.lastY = y;
                this.facingAngle = Math.random() * Math.PI * 2;
                
                // Quip bubble state — popping ambient text above head
                this.quipText = null;
                this.quipAge = 0;        // Frames since current quip began
                this.quipDuration = 0;   // Frames the current quip lasts
                this.quipCooldown = 60 + Math.floor(Math.random() * 240); // Stagger first quips so the city doesn't all speak at once on spawn
                
                // Find nearest node to start
                this._findNearestNode();
            }
            
            _findNearestNode() {
                if (!this.network || !this.network.nodes) return;
                
                let nearest = null;
                let nearestDist = Infinity;
                
                for (let node of this.network.nodes) {
                    const dist = Math.hypot(node.x - this.x, node.y - this.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = node;
                    }
                }
                
                if (nearest) {
                    this.currentNodeId = nearest.id;
                    this._pickNextTarget();
                }
            }
            
            _pickNextTarget() {
                if (!this.network || this.currentNodeId === null) return;
                
                const currentNode = this.network.nodes[this.currentNodeId];
                if (!currentNode || currentNode.connections.length === 0) return;
                
                // Avoid backtracking when possible
                let candidates = currentNode.connections.filter(id => id !== this.targetNodeId);
                if (candidates.length === 0) candidates = currentNode.connections;
                
                // Crosswalk bias — uniform random weighted heavily toward sidewalk
                // continuations means peds rarely picked the lone crosswalk option
                // and shuffled along one side of the street forever. Now: when a
                // crosswalk option exists among candidates, ~50% chance to take it.
                // No bias if currently on a crosswalk (already mid-cross, just finish).
                if (!currentNode.isCrosswalk) {
                    const crosswalkOptions = candidates.filter(id => {
                        const n = this.network.nodes[id];
                        return n && n.isCrosswalk;
                    });
                    if (crosswalkOptions.length > 0 && Math.random() < 0.5) {
                        this.targetNodeId = crosswalkOptions[Math.floor(Math.random() * crosswalkOptions.length)];
                        this.pathProgress = 0;
                        return;
                    }
                }
                
                this.targetNodeId = candidates[Math.floor(Math.random() * candidates.length)];
                this.pathProgress = 0;
            }
            
            _getNode(id) {
                return this.network && this.network.nodes ? this.network.nodes[id] : null;
            }
            
            /**
             * Maybe trigger a context-aware speech bubble above this pedestrian.
             * Priority order (only one category fires per call):
             *   1. Danger     — any live enemy within QUIP_DANGER_RANGE
             *   2. SeesWeapon — player is close AND has a weapon drawn
             *   3. Roaming    — pure ambient chatter (lowest chance)
             * A per-pedestrian cooldown prevents any single citizen from
             * spamming. Skips entirely if a quip is already active.
             */
            tryQuip(player, weaponOut, enemies) {
                if (this.quipText || this.quipCooldown > 0) return;
                
                const QUIP_DANGER_RANGE = 500;
                const QUIP_WEAPON_RANGE = 180;
                
                // 1. DANGER — enemies in earshot
                if (enemies && enemies.length > 0) {
                    for (let e of enemies) {
                        if (e.dead) continue;
                        const ed = Math.hypot(e.x - this.x, e.y - this.y);
                        if (ed < QUIP_DANGER_RANGE) {
                            // Higher trigger chance — combat is loud, panic spreads
                            if (Math.random() < 0.025) {
                                this._setQuip(this._pickQuip('danger'));
                            }
                            return;
                        }
                    }
                }
                
                // 2. SEES WEAPON — player nearby with weapon out
                if (weaponOut && player) {
                    const pd = Math.hypot(player.x - this.x, player.y - this.y);
                    if (pd < QUIP_WEAPON_RANGE) {
                        if (Math.random() < 0.012) {
                            this._setQuip(this._pickQuip('seesWeapon'));
                        }
                        return;
                    }
                }
                
                // 3. ROAMING — rare idle chatter
                if (Math.random() < 0.0020) {
                    this._setQuip(this._pickQuip('roaming'));
                }
            }
            
            _pickQuip(category) {
                const arr = PEDESTRIAN_QUIPS[category];
                if (!arr || arr.length === 0) return null;
                // Never echo a line someone else is already saying. If the whole
                // category is spoken for, this pedestrian stays quiet rather than
                // doubling up — silence reads better than a chorus.
                const free = arr.filter(t => !_quipLineBusy(t));
                if (free.length === 0) return null;
                return free[Math.floor(Math.random() * free.length)];
            }
            
            _setQuip(text) {
                if (!text) return;
                this.quipText = text;
                this.quipAge = 0;
                // Reading time scales with length — short lines pop briefly,
                // longer lines linger so the player can actually read them.
                this.quipDuration = Math.min(220, 110 + text.length * 2);
                // Post-quip cooldown: ~8–12s after the bubble fades, so this
                // pedestrian goes quiet for a beat before they can speak again.
                this.quipCooldown = this.quipDuration + 480 + Math.floor(Math.random() * 240);
                // Reserve the line for its readable lifetime plus a grace beat.
                _activeQuipLines.set(text, _frameTime + this.quipDuration * (1000 / 60) + QUIP_LINE_GRACE_MS);
            }

            /**
             * Direct reaction to a player emote — bypasses the normal random
             * trigger roll (the player is *addressing* this ped, not just standing
             * nearby), but respects an already-active bubble so we don't interrupt
             * mid-line. Cooldown is set after via _setQuip so the same ped can't
             * be spam-emoted at.
             *
             * @param {'smile'|'zany'|'cry'|'frown'} emote
             */
            reactToEmote(emote) {
                if (this.quipText) return; // don't interrupt an existing bubble
                const categoryMap = {
                    smile: 'reactSmile',
                    zany:  'reactZany',
                    cry:   'reactCry',
                    frown: 'reactFrown'
                };
                const cat = categoryMap[emote];
                if (!cat) return;
                this._setQuip(this._pickQuip(cat));
            }
            
            update(player, trafficVehicles = [], otherPedestrians = []) {
                if (this.dead) return;
                
                // Tick quip bubble animation/lifetime
                if (this.quipText) {
                    this.quipAge++;
                    if (this.quipAge >= this.quipDuration) {
                        this.quipText = null;
                        this.quipAge = 0;
                    }
                }
                if (this.quipCooldown > 0) this.quipCooldown--;
                
                // Apply knockback physics from ActorEntity
                if (this.knockbackVx || this.knockbackVy) {
                    this.x += this.knockbackVx;
                    this.y += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction;
                    this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                
                // ── VEHICLE THREAT CHECK ──
                // Run every ~8 frames per ped (staggered via constructor) to
                // keep total ray cost per frame low. Skipped while sprawled,
                // recovering, or already dodging — those states either can't
                // dodge again or are mid-response.
                if (this.vehicleCheckCooldown > 0) {
                    this.vehicleCheckCooldown--;
                } else if (this.state === 'walking' || this.state === 'crossing') {
                    this.vehicleCheckCooldown = 8;
                    this._checkVehicleThreat(trafficVehicles);
                }
                
                // State machine
                switch (this.state) {
                    case 'walking':
                        this._updateWalking(player, trafficVehicles, otherPedestrians);
                        break;
                    case 'waiting':
                        this._updateWaiting(trafficVehicles);
                        break;
                    case 'crossing':
                        this._updateCrossing(player, otherPedestrians);
                        break;
                    case 'dodging':
                        this._updateDodging(trafficVehicles);
                        break;
                    case 'sprawled':
                        this._updateSprawled();
                        break;
                    case 'recovering':
                        this._updateRecovering();
                        break;
                }
            }
            
            /**
             * Predicts whether any nearby car will reach this pedestrian
             * within ~1 second at current velocity. If so, either:
             *  - Trigger a dodge (perpendicular burst) if there's time and
             *    space to react, OR
             *  - Trigger a sprawl directly (the dodge would have failed,
             *    car is already on top of us).
             *
             * The world philosophy: a car "could have killed me" must
             * register on the body. This function is what makes that real.
             */
            _checkVehicleThreat(trafficVehicles) {
                if (!trafficVehicles || trafficVehicles.length === 0) return;
                
                const PREDICT_FRAMES = 60;             // ~1 second lookahead
                const REACT_RADIUS = 90;               // peds notice cars within this range
                const CONTACT_RADIUS = 18;             // overlap = sprawl
                
                for (const car of trafficVehicles) {
                    if (!car || car.dead) continue;
                    
                    const dx = car.x - this.x;
                    const dy = car.y - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > REACT_RADIUS) continue;
                    
                    // Already in contact — sprawl immediately.
                    if (dist < CONTACT_RADIUS && Math.abs(car.speed) > 1.5) {
                        this._handleVehicleImpact(car);
                        return;
                    }
                    
                    // Predict: project the car forward by PREDICT_FRAMES * speed
                    // along its heading, and see if our position is within a
                    // narrow corridor of that path.
                    const carSpeed = Math.abs(car.speed);
                    if (carSpeed < 1.0) continue; // parked/idling cars don't threaten
                    
                    const carDirX = Math.cos(car.angle);
                    const carDirY = Math.sin(car.angle);
                    
                    // Project the ped's position onto the car's forward ray
                    const relX = this.x - car.x;
                    const relY = this.y - car.y;
                    const along = relX * carDirX + relY * carDirY;        // forward distance
                    const lateral = Math.abs(-relX * carDirY + relY * carDirX); // perpendicular distance
                    
                    // Must be in front of the car, within stopping distance, in lane
                    if (along < 0 || along > carSpeed * PREDICT_FRAMES) continue;
                    if (lateral > 22) continue; // ~ped width + small buffer
                    
                    // Threat confirmed — dodge perpendicular to car heading
                    // toward whichever side we're already leaning.
                    const sideSign = (-relX * carDirY + relY * carDirX) >= 0 ? 1 : -1;
                    this._enterDodge(-carDirY * sideSign, carDirX * sideSign);
                    return;
                }
            }
            
            /**
             * Begin a dodge burst — short perpendicular movement away from
             * the threatening car. The body reacts before the mouth — quip
             * fires immediately to convey the "shit shit shit" of a near miss.
             */
            _enterDodge(dirX, dirY) {
                this.state = 'dodging';
                this.dodgeTimer = 28; // ~0.47s at 60fps
                this.dodgeDirX = dirX;
                this.dodgeDirY = dirY;
                
                // Fire near-miss quip (skip the cooldown gate — this is reactive,
                // not ambient, and should always speak)
                if (!this.quipText) {
                    this._setQuip(this._pickQuip('dodgeNearMiss'));
                }
            }
            
            /**
             * Handle direct car contact. Knockback the ped, enter sprawled
             * state, fire the mortality-naming aftermath quip, and bleed
             * velocity from the car — the cost lands on the driver.
             *
             * No HP damage. The world refuses to enact what it shows.
             */
            _handleVehicleImpact(car) {
                if (this.invincibleTimer > 0) return; // brief grace after a bump
                
                this.bumpCount++;
                
                // Knockback away from car, scaled by impact speed
                const dx = this.x - car.x;
                const dy = this.y - car.y;
                const d = Math.hypot(dx, dy) || 1;
                const carSpeed = Math.abs(car.speed);
                const force = Math.min(8, 1.5 + carSpeed * 0.6);
                this.knockbackVx = (dx / d) * force;
                this.knockbackVy = (dy / d) * force;
                
                // Sprawl pose: lying perpendicular to the car's path
                this.sprawlAngle = car.angle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
                
                // Enter sprawled state. Duration scales slightly with impact —
                // a fast bump sits the ped down longer. Capped to keep the
                // city from filling with downed bodies.
                this.state = 'sprawled';
                this.sprawlTimer = Math.min(120, 60 + Math.floor(carSpeed * 6));
                this.invincibleTimer = 30; // can't be re-bumped during sprawl
                
                // Aftermath quip (mortality-naming register). Force-replaces
                // any existing quip — what they were saying doesn't matter
                // anymore; this just happened.
                this.quipText = null;
                this.quipCooldown = 0;
                this._setQuip(this._pickQuip('aftermathBumped'));
                
                // ── DRIVER PAYS THE COST ──
                // Velocity loss on the car, ~25% per impact. The friction
                // of carelessness lands on the driver, not on the body.
                if (typeof car.speed === 'number') {
                    car.speed *= 0.75;
                }
            }
            
            _updateDodging(trafficVehicles) {
                if (this.dodgeTimer <= 0) {
                    this.state = 'walking';
                    return;
                }
                
                // Dodge burst — fast lateral movement
                const burstSpeed = 3.5;
                gaitCommand(this, this.dodgeDirX * burstSpeed, this.dodgeDirY * burstSpeed);
                this.x += this.dodgeDirX * burstSpeed;
                this.y += this.dodgeDirY * burstSpeed;
                this.lastX = this.x - this.dodgeDirX * burstSpeed;
                this.lastY = this.y - this.dodgeDirY * burstSpeed;
                this.facingAngle = Math.atan2(this.dodgeDirY, this.dodgeDirX);
                
                this.dodgeTimer--;
                
                // If a car is now on top of us mid-dodge, sprawl
                if (trafficVehicles) {
                    for (const car of trafficVehicles) {
                        if (!car || car.dead) continue;
                        const d = Math.hypot(car.x - this.x, car.y - this.y);
                        if (d < 18 && Math.abs(car.speed) > 1.5) {
                            this._handleVehicleImpact(car);
                            return;
                        }
                    }
                }
            }
            
            _updateSprawled() {
                // Body is on the ground. Knockback decay is handled in the
                // base update() pass already. Just tick the timer.
                this.sprawlTimer--;
                if (this.sprawlTimer <= 0) {
                    this.state = 'recovering';
                    this.recoverTimer = 24; // ~0.4s stand-up
                }
            }
            
            _updateRecovering() {
                this.recoverTimer--;
                if (this.recoverTimer <= 0) {
                    this.state = 'walking';
                    // Small grace cooldown so they don't immediately panic again
                    this.invincibleTimer = 20;
                }
            }
            
            _updateWalking(player, trafficVehicles, otherPedestrians) {
                const targetNode = this._getNode(this.targetNodeId);
                if (!targetNode) {
                    this._findNearestNode();
                    return;
                }
                
                const currentNode = this._getNode(this.currentNodeId);
                if (!currentNode) return;
                
                // Calculate direction to target
                const dx = targetNode.x - this.x;
                const dy = targetNode.y - this.y;
                const dist = Math.hypot(dx, dy);
                
                // Check if approaching a crosswalk
                if (targetNode.isCrosswalk && dist < 50 && !currentNode.isCrosswalk) {
                    // Check for traffic before crossing
                    if (this._isTrafficClear(targetNode.crosswalkData, trafficVehicles)) {
                        this.state = 'crossing';
                        this.crossingTimer = 0;
                    } else {
                        this.state = 'waiting';
                        this.waitTimer = 0;
                    }
                    return;
                }
                
                // Move towards target
                if (dist > 5) {
                    const pace = this.speed * (this._raining() ? (this.look.hurry || 1.25) : 1);   // hurrying in the rain
                    let moveX = (dx / dist) * pace;
                    let moveY = (dy / dist) * pace;
                    
                    // Make way for 949 and her crew (engine/update.js _makeWay)
                    for (const p of (typeof game !== 'undefined' && game._makeWay) || [player]) {
                        const pd = Math.hypot(p.x - this.x, p.y - this.y);
                        if (pd < 60 && pd > 0.1) { moveX += (this.x - p.x) / pd * 1.5; moveY += (this.y - p.y) / pd * 1.5; }
                    }
                    
                    // Avoid other pedestrians
                    for (let other of otherPedestrians) {
                        if (other === this || other.dead) continue;
                        const otherDist = Math.hypot(other.x - this.x, other.y - this.y);
                        if (otherDist < 30) {
                            const avoidX = (this.x - other.x) / (otherDist + 0.1);
                            const avoidY = (this.y - other.y) / (otherDist + 0.1);
                            moveX += avoidX * 0.8;
                            moveY += avoidY * 0.8;
                        }
                    }
                    
                    gaitCommand(this, moveX, moveY);
                    this.x += moveX;
                    this.y += moveY;
                    this.facingAngle = Math.atan2(moveY, moveX);
                } else {
                    // Reached target node
                    const oldTarget = this.targetNodeId;
                    this.currentNodeId = this.targetNodeId;
                    this._pickNextTarget();
                    
                    // Avoid getting stuck
                    if (this.targetNodeId === oldTarget) {
                        this._findNearestNode();
                    }
                }
            }
            
            _updateWaiting(trafficVehicles) {
                this.waitTimer++;
                
                const targetNode = this._getNode(this.targetNodeId);
                if (!targetNode || !targetNode.isCrosswalk) {
                    this.state = 'walking';
                    return;
                }
                
                // Check traffic periodically
                if (this.waitTimer % 30 === 0) {
                    if (this._isTrafficClear(targetNode.crosswalkData, trafficVehicles)) {
                        this.state = 'crossing';
                        this.crossingTimer = 0;
                    }
                }
                
                // Give up after waiting too long (find alternate route)
                if (this.waitTimer > 300) {
                    const currentNode = this._getNode(this.currentNodeId);
                    if (currentNode && currentNode.connections.length > 1) {
                        const alternatives = currentNode.connections.filter(id => id !== this.targetNodeId);
                        if (alternatives.length > 0) {
                            this.targetNodeId = alternatives[Math.floor(Math.random() * alternatives.length)];
                        }
                    }
                    this.state = 'walking';
                }
            }
            
            _updateCrossing(player, otherPedestrians) {
                // Cross quickly!
                const targetNode = this._getNode(this.targetNodeId);
                if (!targetNode) {
                    this.state = 'walking';
                    return;
                }
                
                const dx = targetNode.x - this.x;
                const dy = targetNode.y - this.y;
                const dist = Math.hypot(dx, dy);
                
                // Move faster when crossing
                const crossSpeed = this.speed * 1.5;
                
                if (dist > 5) {
                    gaitCommand(this, (dx / dist) * crossSpeed, (dy / dist) * crossSpeed);
                    this.x += (dx / dist) * crossSpeed;
                    this.y += (dy / dist) * crossSpeed;
                    this.facingAngle = Math.atan2(dy, dx);
                    this.crossingTimer++;
                } else {
                    // Made it across!
                    this.currentNodeId = this.targetNodeId;
                    this._pickNextTarget();
                    this.state = 'walking';
                }
                
                // Safety timeout
                if (this.crossingTimer > 180) {
                    this.state = 'walking';
                }
            }
            
            _isTrafficClear(crosswalkData, trafficVehicles) {
                if (!crosswalkData) return true;
                
                const checkDist = 250; // How far to check for oncoming traffic
                const cwCenterX = crosswalkData.x + crosswalkData.w / 2;
                const cwCenterY = crosswalkData.y + crosswalkData.h / 2;
                
                for (let vehicle of trafficVehicles) {
                    if (!vehicle || vehicle.dead) continue;
                    
                    const vDist = Math.hypot(vehicle.x - cwCenterX, vehicle.y - cwCenterY);
                    if (vDist < checkDist) {
                        // Check if vehicle is heading toward crosswalk
                        const towardX = cwCenterX - vehicle.x;
                        const towardY = cwCenterY - vehicle.y;
                        const vDirX = Math.cos(vehicle.angle);
                        const vDirY = Math.sin(vehicle.angle);
                        const dot = (towardX * vDirX + towardY * vDirY) / (vDist + 0.1);
                        
                        // Vehicle heading toward crosswalk and close
                        if (dot > 0.3 && vDist < 200) {
                            return false;
                        }
                    }
                }
                return true;
            }
            
            onProjectileHit(projectile, game) {
                // Pedestrians only take damage from enemy projectiles (like NPCs)
                if (!projectile.isEnemy) return;
                
                const speed = Math.hypot(projectile.vx, projectile.vy);
                if (speed > 0) {
                    const projMomentum = (projectile.mass || 1) * speed;
                    const damageMultiplier = projectile.damage / 10;
                    const knockbackStrength = Math.min((projMomentum * damageMultiplier) / (this.mass || 8), 50);
                    
                    const kbX = (projectile.vx / speed) * knockbackStrength;
                    const kbY = (projectile.vy / speed) * knockbackStrength;
                    this.takeDamage(projectile.damage, kbX, kbY);
                } else {
                    this.takeDamage(projectile.damage);
                }
            }
            
            draw(ctx) {
                if (this.dead) return;
                
                // Shared gait controller (per sim tick) — keeps ticking through the invincibility flash
                const speed = syncHumanoidGait(this).speed;
                
                // Flash if invincible
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) return;
                
                this.lastX = this.x;
                this.lastY = this.y;
                
                // Set angle for procedural humanoid (it expects this for facing direction)
                this.angle = this.facingAngle;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // ── SPRAWL / RECOVERY TRANSFORM ──
                // Sprawled: body rotates to a different angle (away from
                // car heading) and scales Y down so it reads as horizontal
                // from the top-down view. Recovering: scale lerps back to
                // normal as the ped stands up. The visual register here is
                // intentionally close to 949's bleed-out — same vulnerable
                // body language, but the game refuses to enact damage.
                let useAngle = this.facingAngle;
                let scaleX = 1, scaleY = 1;
                let bodyAlpha = 1;
                if (this.state === 'sprawled') {
                    useAngle = this.sprawlAngle;
                    scaleX = 1.1;
                    scaleY = 0.55;
                    bodyAlpha = 0.92;
                } else if (this.state === 'recovering') {
                    // Linear stand-up: 0 → 1 over recoverTimer (24 frames)
                    const t = 1 - (this.recoverTimer / 24);
                    useAngle = this.sprawlAngle + (this.facingAngle - this.sprawlAngle) * t;
                    scaleX = 1.1 - 0.1 * t;
                    scaleY = 0.55 + 0.45 * t;
                    bodyAlpha = 0.92 + 0.08 * t;
                }
                ctx.rotate(useAngle);
                if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
                if (bodyAlpha !== 1) ctx.globalAlpha = bodyAlpha;
                
                // (their contact shadow is the renderer's: drawHumanContactShadow, cast along the sun)
                
                // Their own look (Pedestrian.makeLook) — hats, hair and all. Zoomed out (more of
                // the crowd on screen, too small to read details) they get simple hair, no jewelry.
                const far = typeof _zoomLOD !== 'undefined' && _zoomLOD >= 1;
                let look = far && this.look.hair ? { ...this.look, hair: { type: 'short', color: this.look.hair.color }, jewelry: null } : this.look;
                // Rain: open the umbrella, or pull the hoodie's hood up
                if (this.look.umbrella) look = { ...look, held: { type: 'umbrella', color: this.look.umbrella, hand: 'right' } };
                if (this._raining() && this.look.rainHood && !look.hat && look.top && look.top.type === 'hoodie') look = { ...look, hat: { type: 'hood_up', color: look.top.color } };
                drawProceduralHumanoid(ctx, this, { ...look, stance: 'idle', lerpSpeed: 0.15 });
                
                // Waiting indicator (if at crosswalk) - above head at +X
                if (this.state === 'waiting') {
                    ctx.fillStyle = '#ffcc00';
                    ctx.globalAlpha = 0.5 + Math.sin(_frameTime / 200) * 0.3;
                    ctx.beginPath();
                    ctx.arc(14, 0, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                
                ctx.restore();
                
                // Bubble drawing has moved to drawQuipBubble() — the main
                // render loop now draws all character bubbles in a second
                // pass on top of the player/teammates/enemies, so bubbles
                // never get covered by other character bodies.
            }
            
            /**
             * Draw the speech bubble above this pedestrian's head.
             * Called separately from draw() so all bubbles can be rendered
             * in a unified top layer (see GameEngine main render loop).
             * No-op when there's no active quip.
             */
            drawQuipBubble(ctx) {
                if (!this.quipText) return;
                
                const POP_IN = 8;
                const POP_OUT = 10;
                let scale;
                if (this.quipAge < POP_IN) {
                    const t = this.quipAge / POP_IN;
                    scale = 1 - Math.pow(1 - t, 3);                  // ease-out cubic
                } else if (this.quipAge < this.quipDuration - POP_OUT) {
                    scale = 1;                                        // hold
                } else {
                    const t = Math.max(0, (this.quipDuration - this.quipAge) / POP_OUT);
                    scale = t * t;                                    // ease-in shrink
                }
                if (scale <= 0.01) return;
                
                ctx.save();
                ctx.translate(this.x, this.y - 30);  // above head, screen-aligned
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
                
                // Rounded-rect bubble with a small downward tail
                ctx.fillStyle = 'rgba(8, 6, 18, 0.86)';
                ctx.strokeStyle = 'rgba(164, 105, 255, 0.4)';   // subtle purple-neon edge
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + w / 2 + 4, y + h);
                ctx.lineTo(x + w / 2,     y + h + 4);            // tail tip
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
        }
        
        /**
         * =====================================================================
         *  PEDESTRIAN MANAGER
         * =====================================================================
         * Manages the spawning, updating, and despawning of pedestrians.
         * Similar to TrafficManager but for foot traffic.
         */
        class PedestrianManager {
            constructor() {
                this.pedestrians = [];
                this.network = null; // Sidewalk network from CityLayout
                this.spawnTimer = 0;
                this.maxPedestrians = 40;
                this.spawnRadius = { min: CONFIG.CULLING.PEDESTRIAN_SPAWN_MIN, max: CONFIG.CULLING.PEDESTRIAN_SPAWN_MAX }; // Spawn distance from player
                this.despawnRadius = CONFIG.CULLING.PEDESTRIAN_DESPAWN;
            }
            
            /**
             * Initialize with a sidewalk network from CityLayout
             */
            setNetwork(network) {
                this.network = network;
            }
            
            /**
             * Reset all pedestrians (called on map change)
             */
            reset() {
                for (let p of this.pedestrians) {
                    if (!p.markedForDestroy) p.destroy();
                }
                this.pedestrians = [];
                this.network = null;
            }
            
            /**
             * Main update loop
             * @param {Object} player          Player entity
             * @param {Object} map             Active map (skipped for indoor maps)
             * @param {Array}  trafficVehicles Vehicles to avoid at crosswalks
             * @param {boolean} weaponOut      Player has a weapon drawn (drives "sees weapon" quips)
             * @param {Array}  enemies         Live enemies (drives "danger" panic quips)
             */
            update(player, map, trafficVehicles = [], weaponOut = false, enemies = []) {
                // Only in outdoor maps with a network
                if (map.type === 'indoor' || !this.network || !this.network.nodes) return;
                
                // Update existing pedestrians
                for (let i = this.pedestrians.length - 1; i >= 0; i--) {
                    const ped = this.pedestrians[i];
                    const distToPlayer = Math.hypot(ped.x - player.x, ped.y - player.y);
                    
                    // Despawn if too far or dead
                    if (ped.dead || distToPlayer > this.despawnRadius) {
                        if (!ped.markedForDestroy) ped.destroy();
                        this.pedestrians.splice(i, 1);
                    } else {
                        ped.update(player, trafficVehicles, this.pedestrians);
                        // Ambient quip rolls — runs every frame but cheap due to the
                        // early-exit on cooldown / active quip inside tryQuip.
                        ped.tryQuip(player, weaponOut, enemies);
                    }
                }
                
                // Spawn new pedestrians
                this.spawnTimer--;
                if (this.pedestrians.length < GameSettings.getMaxPedestrians() && this.spawnTimer <= 0) {
                    this.spawnTimer = 4 + Math.floor(Math.random() * 6);  // Was 15-35 — ~4× faster for crowds
                    this._trySpawn(player, map);
                }
            }
            
            _trySpawn(player, map) {
                // Try a few times to find a good spawn point
                for (let attempt = 0; attempt < 5; attempt++) {
                    // Pick a random node in the network
                    const node = this.network.nodes[Math.floor(Math.random() * this.network.nodes.length)];
                    if (!node || node.isCrosswalk) continue; // Don't spawn on crosswalks
                    
                    const dist = Math.hypot(node.x - player.x, node.y - player.y);
                    
                    // Check distance constraints
                    if (dist < this.spawnRadius.min || dist > this.spawnRadius.max) continue;
                    
                    // Check not too close to other pedestrians
                    let tooClose = false;
                    for (let ped of this.pedestrians) {
                        if (Math.hypot(ped.x - node.x, ped.y - node.y) < 60) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (tooClose) continue;
                    
                    // Check not inside buildings
                    const pedColliders = getColliders(map);
                    if (pedColliders) {
                        let insideBuilding = false;
                        for (let b of pedColliders) {
                            if (node.x > b.x && node.x < b.x + b.w &&
                                node.y > b.y && node.y < b.y + b.h) {
                                insideBuilding = true;
                                break;
                            }
                        }
                        if (insideBuilding) continue;
                    }
                    
                    // Spawn!
                    const ped = new Pedestrian(node.x, node.y, this.network);
                    this.pedestrians.push(ped);
                    break;
                }
            }
            
            /**
             * Draw all pedestrians
             */
            draw(ctx, cb) {
                for (let ped of this.pedestrians) {
                    if (cb && (ped.x < cb.left || ped.x > cb.right || ped.y < cb.top || ped.y > cb.bottom)) continue;
                    ped.draw(ctx);
                }
            }
            
            /**
             * Render only the speech bubbles for all visible pedestrians.
             * Called from the main render loop AFTER all character bodies
             * (player, teammates, enemies, etc.) so bubbles always sit on
             * top and don't get covered by characters drawn later.
             */
            drawQuipBubbles(ctx, cb) {
                for (let ped of this.pedestrians) {
                    if (!ped.quipText) continue;
                    if (cb && (ped.x < cb.left || ped.x > cb.right || ped.y < cb.top || ped.y > cb.bottom)) continue;
                    ped.drawQuipBubble(ctx);
                }
            }
        }

