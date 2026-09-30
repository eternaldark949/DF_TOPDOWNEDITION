        // GameEngine — The per-tick simulation (update) and traffic collision helpers.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        /** Props you can use, and what the action pill says for them: type → [verb, name, name from the prop's own label].
         *  A prop whose interactionType isn't here is scenery (the sofa, the bedside tables…): no pill, no action.
         *  What each one does is engine/events.js interact(). */
        const PROP_ACTIONS = {
            medbay_refill:     ['Refill', 'Health station'],
            lost_luggage:      ['Search', 'Lost luggage', true],
            vending_machine:   ['Buy', 'MiniSpree'],
            bed_sleep:         ['Rest', 'Bed'],
            crafting_table:    ['Craft', 'Workbench'],
            auto_shop_counter: ['Shop', 'Counter'],
            armory:            ['Loadout', 'Armory'],
            read_note:         ['Read', 'Note', true],
            light_switch:      ['Lights', 'Light switch']
        };

        engineMixin({
            /* =====================================================================
               MAIN GAME LOOP (UPDATE)
               ---------------------------------------------------------------------
               Handles all logic updates for the current frame.
               Instrumented with Profiler to track performance bottlenecks.
               ===================================================================== */
            update() {
                if (!this.running || this.paused) return;
                
                // Gait clock — advances only when the world actually steps, so
                // walk animation freezes with everything else while paused.
                _simTick++;
                
                // Pausable systems — must tick before any logic that might
                // schedule new timers or read playerEmote state.
                this._tickPausableTimers();
                if (this.scenes && this.scenes.running) this.scenes._lockInput();   // a scene has the stage: no walking or firing
                this.tickPlayerEmote();
                
                // PERFORMANCE: Use globally cached frame time (set once in loop())
                this.frameTime = _frameTime;
                this.frameTimeSec = _frameTimeSec;
            
                // --- 1. SYSTEM UPDATES ---
                /* Simulation step counter — drives subsystem decimation (CONFIG.SIM).
                   Increments once per fixed 1/60s step, NOT per rendered frame,
                   so decimation intervals mean the same thing on every device. */
                this.simStep = (this.simStep + 1) | 0;

                this.profiler.start('Update:Total');
                this.profiler.markWrapper('Update:Total');
                this.profiler.start('Logic:Systems');
                
                // Cleanup old muzzle flashes
                for(let i=this.muzzleFlashes.length-1; i>=0; i--) {
                    this.muzzleFlashes[i].life--;
                    if(this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
                }
            
                this.updateTime();
                this.updateUI();
                this.weather.update(this.camera);
                if (this.puddles) this.puddles.update();
                if (this.leafParticles) this.leafParticles.update();
                
                // Indoor V2: Room system update + per-room weather
                if (this.roomSystem.active) {
                    this.roomSystem.update(this.player.x, this.player.y);
                    
                    // Per-room rain: suppress weather under a roof, restore outdoors.
                    // This sets a SEPARATE flag rather than writing isRaining —
                    // the scheduler owns that now, and two systems assigning the
                    // same bool every frame would just overwrite each other.
                    // Stepping inside hides the rain; the storm keeps running.
                    // Eased with her step outside: the rain fades in rather than switching on.
                    const out = this.roomSystem.outdoorness;
                    this.weather.setIndoorSuppressed(this.activeMap.type === 'indoor' && out < 0.02);
                    if (out !== this._lastOutdoorness) { this._lastOutdoorness = out; this.updateDaytimeExposure(); }
                }
                
                // Owned car marker fade logic
                if (this.ownedCar) {
                    const fadeSpeed = 0.05;
                    this.ownedCar.markerOpacity += (this.ownedCar.markerTargetOpacity - this.ownedCar.markerOpacity) * fadeSpeed;
                }
                
                // Check if player reached navigation destination
                this.checkNavArrival();
            
                // --- CAMERA SHAKE & DRIFT FX ---
                // 1. Reset or Apply Explosion Shake (Random Jitter)
                if (this.camera.shake > 0) {
                    this.camera.shakeX = (Math.random() - 0.5) * this.camera.shake * 2;
                    this.camera.shakeY = (Math.random() - 0.5) * this.camera.shake * 2;
                    this.camera.shake *= 0.9; // Decay
                    if (this.camera.shake < 0.5) { this.camera.shake = 0; }
                } else {
                    this.camera.shakeX = 0;
                    this.camera.shakeY = 0;
                }
            
                // 2. Add Drift "Wobble" (Smooth Sine Wave)
                if (this.isDriving && this.car) {
                    // Calculate lateral velocity (How fast are we sliding sideways?)
                    const rightX = -Math.sin(this.car.angle);
                    const rightY = Math.cos(this.car.angle);
                    const slideVelocity = this.car.vx * rightX + this.car.vy * rightY;
                    const driftIntensity = Math.abs(slideVelocity);
            
                    // Threshold: Only shake if drifting noticeably (speed > 2.0)
                    if (driftIntensity > 1.0) {
                        // Initialize wave timer if needed
                        if (this.camera.driftTime === undefined) this.camera.driftTime = 0;
                        
                        // Advance the wave (0.2 = frequency/speed of the wobble)
                        this.camera.driftTime += 2.0; 
            
                        // Calculate Amplitude: Scales with drift intensity
                        // (driftIntensity - 2.0) ensures it starts at 0 when threshold is hit
                        const waveAmp = (driftIntensity - 1.0) * 1.5; 
            
                        // Apply Sine/Cosine offsets to existing shake
                        // Using different multipliers (1.0 vs 0.8) prevents a perfect circle motion
                        this.camera.shakeX += Math.sin(this.camera.driftTime) * waveAmp;
                        this.camera.shakeY += Math.cos(this.camera.driftTime * 0.8) * waveAmp;
                    }
                }
            
                // Ability & Regen Timers
                // Flit Attunement recharge
                if (this.flitState.attunement < this.flitState.maxAttunement) {
                    this.flitState.attunement = Math.min(
                        this.flitState.attunement + this.flitState.rechargeRate,
                        this.flitState.maxAttunement
                    );
                    if (this.flitState.attunement >= this.flitCost()) this.flitBtn.classList.remove('cooldown');
                }
                this.updateFlitRing();
                this.updateNoiseRipples();
                this.updateScope();
                if (this.flitState.active) { 
                    this.flitState.duration--; 
                    if (this.flitState.duration <= 0) this.flitState.active = false; 
                }
                // Update flit visual effects (ghost afterimages, lightning trails)
                if (this.flitVFX.length > 0) this.updateFlitVFX();
                
                // Passive Health Regen (5 HP/sec after 10s no damage)
                if (this.playerHealth < this.maxPlayerHealth) {
                    this.healthRegenTimer++;
                    const regenDelay = this.resonance.stat('regenDelay', 600);                       // Frame: Idle Mend
                    if (this.healthRegenTimer >= regenDelay && (this.healthRegenTimer - regenDelay) % 60 === 0) {
                        const heal = this.resonance.stat('regenAmount', 5) * (this.augments.isEquipped('health_regen') ? 2 : 1);
                        this.playerHealth = Math.min(this.playerHealth + heal, this.maxPlayerHealth);
                        this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Sync with entity
                    }
                } else {
                    this.healthRegenTimer = 0;
                }
                this.profiler.stop('Logic:Systems');
            
                // --- 2. AI & TRAFFIC ---
                this.profiler.start('AI:Traffic');
                this.traffic.update(this.player, this.activeMap, this.car, this.weather, this.ownedCar, this.decals, this.teammates);
                
                // Zib taxi system — spawn, arrival check, cleanup
                if (this.zibSystem && this.activeMap.type !== 'indoor') {
                    this.zibSystem.trySpawn(this.traffic);
                    this.zibSystem.tick(this);
                    this.zibSystem.cleanup();
                }
                // Add delivery vehicle to spatial grid (managed separately from traffic lifecycle)
                if (this.deliveryVehicle && this.deliveryVehicle.visible && this.traffic.grid) {
                    this.traffic.grid.add(this.deliveryVehicle);
                }
                this.profiler.stop('AI:Traffic');
                
                // --- PEDESTRIANS ---
                this.profiler.start('AI:Pedestrians');
                // Build the list of cars peds should react to. While the player
                // is driving, this.car is REMOVED from this.traffic.vehicles
                // (intentionally, so traffic AI doesn't try to drive around
                // itself). For the ped reaction system, we want it included —
                // otherwise peds phase through the player's car while
                // dodging every AI car around them. Concat is cheap; no
                // allocation when not driving.
                const reactionVehicles = (this.isDriving && this.car)
                    ? this.traffic.vehicles.concat(this.car)
                    : this.traffic.vehicles;
                this.pedestrians.update(this.player, this.activeMap, reactionVehicles, this.weaponMode !== 'none' && !this.weaponHolstered, this.enemies);
                this.profiler.stop('AI:Pedestrians');
                
                // Velvet Cat AI
                if (this.velvetCat && this.velvetCat.visible && !this.velvetCat.inCar) {
                    if (this.questState.hasVelvetCat) {
                        this.velvetCat.update(this.player, 1);
                    }
                }
            
                this.profiler.start('Logic:Stealth');
                // Visibility is a solve over lights and occluders whose result
                // changes slowly. Skipped steps keep the previous value.
                if (this.simDue(CONFIG.SIM.STEALTH_INTERVAL)) {
                    this.calculatePlayerVisibility();
                }
                this.profiler.stop('Logic:Stealth');
            
                this.profiler.start('Logic:Story');
                this.cutscene.update();
                if (this.scenes && this.scenes.running) this.scenes.update();                     // story/scene-runner.js
                if (this._bossIntros && this._bossIntros.length) this.updateBossIntro();          // engine/boss-intro.js
                this.story.update();
                this.profiler.stop('Logic:Story');
                
                // Larissa loadout hint — triggers when approaching apt exit for the first time
                if (!this.questState.larissa_loadout_hint && this.activeMap && this.activeMap.id === 'apt_949'
                    && this.player.y > 780 && this.player.x > 500 && this.player.x < 900
                    && this.story && !this.cutscene.active) {
                    this.questState.larissa_loadout_hint = true;
                    this.story.triggerComms("LARISSA", "Your loadout is on the wall, 949. Equip before you leave. Pause if you need the full inventory.", 6000);
                }
                
                // --- 1. WEAPON COOLDOWN & FIRING ---
                // Decrement the timer every frame
                if (this.shootCooldown > 0) this.shootCooldown--;
            
                // Aimed firing (the fire joystick, or the mouse once it has a position)
                // happens in the walking/driving code in step 7, after this tick's aim
                // angle is set. Only fire here for input those branches don't handle
                // (bumper minigame, or a mouse press before the mouse has moved).
                const stickFiring = this.fireJoystick.active && this.fireJoystick.firing;   // past the fire stick's threshold ring
                if (this.shootCooldown <= 0 && !this.paused && (this.mouseDown || stickFiring)) {
                    const aimedBelow = !(this.bumperMinigame && this.bumperMinigame.active)
                        && (stickFiring || (this.mouseDown && this.mouseX));
                    if (!aimedBelow) this.fireWeapon();
                }
            
                // --- 3. GAME EVENTS (SPAWNING & TRIGGERS) ---
                this.profiler.start('Logic:Events');
                
                // Ganger Spawning (Hub Only)
                if (this.activeMap.id === 'hub_949' && this.enemies.length < 6 && Math.random() < 0.02) {
                    const ex = Math.random() * this.activeMap.width;
                    const ey = Math.random() * this.activeMap.height;
                    let hitObstacle = false;
                    
                    // Safety check to ensure they don't spawn in walls
                    for(let w of this.activeMap.walls) { 
                        if (ex > w.x - 20 && ex < w.x + w.w + 20 && ey > w.y - 20 && ey < w.y + w.h + 20) { hitObstacle = true; break; }
                    }
                    if (!hitObstacle) {
                        const spawnColliders = getColliders(this.activeMap);
                        if (spawnColliders) {
                            for(let b of spawnColliders) { 
                                if (ex > b.x - 20 && ex < b.x + b.w + 20 && ey > b.y - 20 && ey < b.y + b.h + 20) { hitObstacle = true; break; }
                            }
                        }
                    }
                    const d = Math.hypot(this.player.x - ex, this.player.y - ey);
                    // Exclude restricted zone bounds
                    if (!hitObstacle && this.restrictedZone) {
                        const rz = this.restrictedZone;
                        if (ex > rz.x && ex < rz.x + rz.w && ey > rz.y && ey < rz.y + rz.h) hitObstacle = true;
                    }
                    if (!hitObstacle && d > 600 && d < 1200) { 
                        this.enemies.push(new Ganger(ex, ey)); 
                        captionSystem.gangerAggro();
                    }
                }
            
                // The Double Nights lobby: guests and staff come and go; searched cases refill daily
                this.lobbyLife.update(this);
                if (_simTick % 60 === 0) {                                // lost things (lobby, club) refill daily
                    if (this._lostMap !== this.activeMap) { this._lostMap = this.activeMap; this._hasLost = this.props.some(p => p.interactionType === 'lost_luggage'); }
                    if (this._hasLost) this.refreshLostLuggage();
                }

                // Graveyard Humanoid Ghosts (Cemetery: x 500-3500, y 8800-10800)
                const inGraveyard = this.activeMap.id === 'hub_949' && 
                    this.player.x > 400 && this.player.x < 3600 && 
                    this.player.y > 8600 && this.player.y < 11000;
                if (inGraveyard) {
                    // Spawn new ghosts periodically (max 5 at once)
                    if (this.graveyardGhosts.length < 15 && Math.random() < 0.02) {
                        const look = ROLE_LOOKS.ghost(Math.random);   // pale and icy (core/appearances.js)
                        const gx = 600 + Math.random() * 2800;
                        const gy = 8900 + Math.random() * 1800;
                        // Pick a random wander target inside graveyard
                        const tx = 600 + Math.random() * 2800;
                        const ty = 8900 + Math.random() * 1800;
                        this.graveyardGhosts.push({
                            x: gx, y: gy,
                            targetX: tx, targetY: ty,
                            angle: Math.atan2(ty - gy, tx - gx),
                            walkPhase: Math.random() * Math.PI * 2,
                            speed: 0.3 + Math.random() * 0.4,
                            // Lifecycle: fade in → wander → fade out
                            life: 0,        // 0→1 fade in, hold, then decay to 0
                            phase: 'in',    // 'in', 'wander', 'out'
                            fadeSpeed: 0.005 + Math.random() * 0.005,
                            wanderTimer: 300 + Math.floor(Math.random() * 400), // frames to wander
                            look
                        });
                    }

                    // Update graveyard ghosts
                    for (let i = this.graveyardGhosts.length - 1; i >= 0; i--) {
                        const g = this.graveyardGhosts[i];

                        if (g.phase === 'in') {
                            g.life += g.fadeSpeed * 2;
                            if (g.life >= 0.7) { g.life = 0.7; g.phase = 'wander'; }
                        } else if (g.phase === 'wander') {
                            g.wanderTimer--;
                            // Walk toward target
                            const dx = g.targetX - g.x;
                            const dy = g.targetY - g.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist > 5) {
                                g.angle = Math.atan2(dy, dx);
                                gaitCommand(g, Math.cos(g.angle) * g.speed, Math.sin(g.angle) * g.speed);
                                g.x += Math.cos(g.angle) * g.speed;
                                g.y += Math.sin(g.angle) * g.speed;
                            } else {
                                // Pick new target
                                g.targetX = 600 + Math.random() * 2800;
                                g.targetY = 8900 + Math.random() * 1800;
                            }
                            if (g.wanderTimer <= 0) g.phase = 'out';
                        } else if (g.phase === 'out') {
                            g.life -= g.fadeSpeed;
                            if (g.life <= 0) {
                                this.graveyardGhosts.splice(i, 1);
                                continue;
                            }
                        }
                    }
                } else {
                    // Clear ghosts when leaving the area
                    if (this.graveyardGhosts.length > 0) this.graveyardGhosts = [];
                }
                
                // Boss Logic (Church Lightning)
                if (this.activeMap.id === 'church_boss' && this.weather.isRaining && !this.questState.churchBossDefeated) {
                    if (this.weather.lightningCooldown <= 0) {
                        this.weather.triggerLightning();
                        this.triggerShake(8);
                        setTimeout(() => audioSys.sfx('explode'), 50);
                    }
                }
            
                // Restricted Zone (Hostile farming area)
                if (this.restrictedZone) {
                    this.restrictedZone.update(this);
                    // Update location label when inside zone
                    if (this.activeMap.id === 'hub_949') {
                        const rz = this.restrictedZone;
                        const inside = rz._playerInside(this);
                        if (inside && !rz._labelShown) {
                            rz._labelShown = true;
                            this.uiLocation.textContent = rz.name;
                            this.uiLocation.style.color = '#ff4422';
                        } else if (!inside && rz._labelShown) {
                            rz._labelShown = false;
                            this.uiLocation.textContent = this.activeMap.label;
                            this.uiLocation.style.color = '#fff';
                        }
                    }
                }
                
                // Horde Gauntlet (Wave-based arena)
                if (this.hordeGauntlet) {
                    this.hordeGauntlet.update(this);
                }
                
                this.profiler.stop('Logic:Events');
            
                // --- 4. INPUT HANDLING ---
                this.profiler.start('Input:Process');
                let inputX = 0; let inputY = 0;
                if (this.keys['w'] || this.keys['ArrowUp']) inputY = -1; 
                if (this.keys['s'] || this.keys['ArrowDown']) inputY = 1; 
                if (this.keys['a'] || this.keys['ArrowLeft']) inputX = -1; 
                if (this.keys['d'] || this.keys['ArrowRight']) inputX = 1;
                if (this.joystick.active) { inputX = this.joystick.dx; inputY = this.joystick.dy; }
                this.profiler.stop('Input:Process');
            
                // --- 5. ENTITY UPDATES ---
                this.profiler.start('AI:Enemies');
                
                // Ferris wheel animation
                if (this.activeMap.ferrisWheel) this.activeMap.ferrisWheel.update();
                
                // Teammates & Companions (Unified loop)
                // Skip during bumper car minigame — teammates are in bumper cars
                if (!(this.bumperMinigame && this.bumperMinigame.active)) {

                // ── FORMATION SLOTS ──
                // Build the active list and assign each member a stable slot around
                // the player. Slots are evenly spaced on a circle of FORMATION_RADIUS.
                // The ring rotates with the player's facing so companions stay behind/
                // beside, never blocking the forward arc. This single pass replaces the
                // old "everyone follow player + push apart" tug-of-war that caused the
                // wiggle/jostle. With slots, each companion has a unique stable target.
                const activeFormation = this.teammates.filter(
                    t => t.recruited && !t.downed && !t.inCar
                );
                const formationN = activeFormation.length;
                const formationRadius = CONFIG.COMPANION.FORMATION_RADIUS;
                const baseAngle = CONFIG.COMPANION.FORMATION_FOLLOW_FACING
                    ? (this.player.angle + Math.PI)  // +π = behind player
                    : 0;
                // Distribute slots around a 240° arc behind the player when N>1, so
                // they spread to the rear and sides without crowding directly in front.
                // For N=1 we just place the single companion directly behind.
                const arc = formationN <= 1 ? 0 : (Math.PI * 4 / 3); // 240°
                activeFormation.forEach((tm, i) => {
                    const t = formationN <= 1 ? 0.5 : i / (formationN - 1);
                    const angle = baseAngle + (t - 0.5) * arc;
                    tm._formationSlot = {
                        x: this.player.x + Math.cos(angle) * formationRadius,
                        y: this.player.y + Math.sin(angle) * formationRadius
                    };
                });

                this.teammates.forEach(tm => {
                    if (!tm.recruited || tm.downed) return;
                    const processShot = (shot) => {
                        if (!shot) return;
                        const abilityDef = tm.equippedAbilityId ? ABILITY_REGISTRY[tm.equippedAbilityId] : null;
                        const weaponDef = tm.equippedWeaponId ? ITEM_REGISTRY[tm.equippedWeaponId] : null;
                        const flashColor = (weaponDef?.stats?.projectileColor) || (abilityDef?.stats?.flashColor) || shot.color || '#ffaa00';
                        const flashRadius = (weaponDef?.stats?.flashRadius) || (abilityDef?.stats?.flashRadius) || 40;
                        this.projectiles.push(shot);
                        this.muzzleFlashes.push({ x: shot.x, y: shot.y, radius: flashRadius, color: flashColor, life: 3 });
                        if (tm.hireType === 'permanent') captionSystem.teammateCombatQuip(tm.name);
                        else captionSystem.dancerFollowQuip(tm.name);
                    };

                    // ── VEHICLE COMBAT (all companion types) ──
                    if (tm.inCar && this.isDriving && tm.seatIndex >= 1) {
                        processShot(tm.updateVehicleCombat(this.car, this.enemies, this));
                        return;
                    }
                    if (tm.inCar) return;

                    // ── SAFETY-NET SEPARATION (gentle bump, not the old shove) ──
                    // Slot assignment already keeps companions apart; this fires only
                    // when a teleport / map transition / knockback puts them on top of
                    // each other. Radii and forces are tuned to be barely perceptible.
                    let sepX = 0, sepY = 0;
                    for (let other of this.teammates) {
                        if (other === tm || other.inCar || !other.recruited || other.downed) continue;
                        const d = Math.hypot(tm.x - other.x, tm.y - other.y);
                        if (d < CONFIG.COMPANION.SEPARATION_RADIUS && d > 0.1) {
                            const pushAngle = Math.atan2(tm.y - other.y, tm.x - other.x);
                            sepX += Math.cos(pushAngle) * CONFIG.COMPANION.SEPARATION_FORCE;
                            sepY += Math.sin(pushAngle) * CONFIG.COMPANION.SEPARATION_FORCE;
                        }
                    }
                    const distToP = Math.hypot(tm.x - this.player.x, tm.y - this.player.y);
                    if (distToP < CONFIG.COMPANION.PLAYER_SEPARATION_RADIUS && distToP > 0.1) {
                        const pushAngle = Math.atan2(tm.y - this.player.y, tm.x - this.player.x);
                        sepX += Math.cos(pushAngle) * CONFIG.COMPANION.PLAYER_SEPARATION_FORCE;
                        sepY += Math.sin(pushAngle) * CONFIG.COMPANION.PLAYER_SEPARATION_FORCE;
                    }
                    tm.x += sepX;
                    tm.y += sepY;

                    // ── EYELINE TACTICS: a firing spot overrides the formation slot ──
                    const eyelineSpot = updateCompanionTactics(tm, this);

                    // ── ON FOOT: Permanent teammates use built-in follow via updateCombat ──
                    if (tm.hireType === 'permanent') {
                        processShot(tm.updateCombat(this.player.x, this.player.y, this.enemies, this, eyelineSpot || tm._formationSlot));
                        return;
                    }

                    // ── ON FOOT: Contract companions — slot-aware follow, then combat ──
                    if (tm.hireType === 'contract' && tm.hired) {
                        tm.update();

                        // Teleport recovery still uses player distance — if a contract
                        // companion is truly lost, snap them to the player rather than
                        // their slot (slot may also be far if they were left across map).
                        const dx = this.player.x - tm.x;
                        const dy = this.player.y - tm.y;
                        const distToPlayer = Math.hypot(dx, dy);
                        if (distToPlayer > CONFIG.COMPANION.FOLLOW_TELEPORT_DIST) {
                            tm.x = this.player.x + (Math.random() - 0.5) * 40;
                            tm.y = this.player.y + (Math.random() - 0.5) * 40;
                            resetHumanoidAnim(tm);
                        } else if (eyelineSpot) {
                            // Repositioning for a clear shot — nav-grid path to the spot
                            const C = CONFIG.COMPANION;
                            const dSpot = Math.hypot(eyelineSpot.x - tm.x, eyelineSpot.y - tm.y);
                            const topSpeed = dSpot > C.CATCHUP_DISTANCE ? C.CATCHUP_SPEED : (dSpot > C.MATCH_DISTANCE ? C.MATCH_SPEED : C.CONTRACT_SPEED);
                            companionNavStep(tm, eyelineSpot.x, eyelineSpot.y, topSpeed, this);
                        } else if (tm._formationSlot) {
                            // Soft arrival on slot via smartMove (which still does
                            // obstacle avoidance against walls/buildings). Adaptive
                            // speed mirrors the permanent-teammate path.
                            const slot = tm._formationSlot;
                            const dxSlot = slot.x - tm.x;
                            const dySlot = slot.y - tm.y;
                            const distSlot = Math.hypot(dxSlot, dySlot);
                            const C = CONFIG.COMPANION;
                            let topSpeed = C.CONTRACT_SPEED;  // cruise
                            if (distSlot > C.CATCHUP_DISTANCE) topSpeed = C.CATCHUP_SPEED;
                            else if (distSlot > C.MATCH_DISTANCE) topSpeed = C.MATCH_SPEED;
                            if (distSlot > C.FORMATION_DEADZONE) {
                                // smartMove uses its own internal stop-at-60 check, so
                                // for short approaches we step directly. This avoids
                                // the smartMove early-out fighting our soft-arrival.
                                if (distSlot > 60) {
                                    // Head for the next nav waypoint (the slot itself when the way is clear);
                                    // smartMove still handles traffic and small obstacles on the way
                                    const wp0 = navWaypoint(tm, slot.x, slot.y, this.activeMap);
                                    if (wp0.x !== slot.x || wp0.y !== slot.y) {
                                        // Blocked straight line: follow the nav path directly (smartMove's
                                        // wall feelers fight paths that hug corners, like gateways)
                                        companionNavStep(tm, slot.x, slot.y, topSpeed, this);
                                    } else {
                                        // Open ground: smartMove, which also dodges traffic
                                        const wp = detourAroundPlayer(tm, wp0.x, wp0.y, this.player);
                                        tm.smartMove(wp.x, wp.y, topSpeed, this.activeMap.walls, getColliders(this.activeMap), this.traffic.vehicles);
                                    }
                                } else {
                                    const step = Math.min(topSpeed, distSlot * C.FORMATION_ARRIVE_GAIN);
                                    gaitCommand(tm, (dxSlot / distSlot) * step, (dySlot / distSlot) * step);
                                    tm.x += (dxSlot / distSlot) * step;
                                    tm.y += (dySlot / distSlot) * step;
                                }
                            }
                        }

                        // Combat — uses unified updateCombat (reads weapon or ability).
                        // skipFollow=true: we already did slot-aware follow above, so
                        // updateCombat must not move us again (otherwise we'd move
                        // twice per frame and run circles around permanent teammates).
                        processShot(tm.updateCombat(this.player.x, this.player.y, this.enemies, this, tm._formationSlot, true));
                    }
                });
                } // end bumper minigame guard
                // Ghosts/Markers
                for (let i = this.lastKnownMarkers.length - 1; i >= 0; i--) {
                    this.lastKnownMarkers[i].update();
                    if (!this.lastKnownMarkers[i].active) this.lastKnownMarkers.splice(i, 1);
                }
            
                // Enemies (Gangers, Bosses)
                for(let i=this.enemies.length-1; i>=0; i--) {
                    let enemy = this.enemies[i];
                    let result = null;
                    
                    if (enemy instanceof Ganger) {
                        const trafficCars = this.traffic ? [...this.traffic.vehicles] : [];
                        if (this.isDriving && this.car) trafficCars.push(this.car);
                        result = enemy.update(this.player, this.activeMap.walls, getColliders(this.activeMap), this.lastKnownMarkers, trafficCars, this.activeMap, this.enemies);
                    } else if (enemy instanceof GatlingGunner) {
                        result = enemy.update(this.player.x, this.player.y, this.enemies, this.activeMap.walls);
                    } else {
                        result = enemy.update(this.player.x, this.player.y, this.activeMap.walls); 
                    }
                    
                    // Unified projectile collection — handles single shots, arrays, or null
                    if (result) {
                        const shots = Array.isArray(result) ? result : [result];
                        if (shots.some(s => s instanceof ProjectileEntity)) this.emitNoise(enemy.x, enemy.y, CONFIG.NOISE.enemyShot, 'enemyShot', false);   // their gunfire draws their friends
                        for (const shot of shots) {
                            if (shot instanceof ProjectileEntity) {
                                this.projectiles.push(shot);
                                this.muzzleFlashes.push({ x: shot.x, y: shot.y, radius: 50, color: shot.color, life: 3 });
                            }
                        }
                    }
                    
                    if (enemy.dead) { 
                        this.awardKill(enemy);                                    // Resonance for the kill (core/resonance.js)
                        audioSys.sfx('explode'); 
                        this.weather.spawnExplosion(enemy.x, enemy.y, '#a469ff'); 
                        this.triggerShake(10); 
                        this.spawnLoot(enemy.x, enemy.y);
                        
                        // Bounty target killed — complete mission with bonus loot
                        if (enemy.isBountyTarget && this.missions.activeMission 
                            && this.missions.activeMission.targetEntity === enemy) {
                            this.missions.completeMission(this);
                        }
                        
                        if (enemy instanceof GatlingGunner) {
                            // Count remaining gunners (excluding this one)
                            let remainingGunners = 0;
                            for (let e of this.enemies) {
                                if (e instanceof GatlingGunner && e !== enemy && !e.dead) {
                                    remainingGunners++;
                                    e.maxBurstCount += 5; e.reloadTime = Math.max(30, e.reloadTime - 0.7);
                                }
                            }
                            
                            if (remainingGunners > 0) {
                                showMessage("REMAINING GUNNERS ENRAGED!");
                            } else {
                                // Last GatlingGunner killed - trigger dramatic time slow!
                                this.triggerTimeSlow(0.4, 4, true);
                            }
                        }
                        this.enemies.splice(i, 1); 
                    }
                }
                
                // ── LARISSA COMBAT TUTORIAL COMMS ──
                // One-shot dialogue triggers that teach the player about combat systems.
                // Uses Larissa's cold, professional handler voice.
                if (this.enemies.length > 0 && this.story) {
                    // 1. Telegraph hint: first time any enemy telegraphs at the player
                    if (!this.questState.larissa_telegraph_hint) {
                        for (const e of this.enemies) {
                            if (e.isTelegraphing && !e.dead) {
                                this.questState.larissa_telegraph_hint = true;
                                this.addPausableTimeout(() => {
                                    this.story.triggerComms("LARISSA", "Watch the line, 949. That's your window.", 4500);
                                }, 300);
                                break;
                            }
                        }
                    }
                    // 2. Stealth hint: first time a ganger enters ALERT state
                    if (!this.questState.larissa_stealth_hint) {
                        for (const e of this.enemies) {
                            if (e instanceof Ganger && e.state === 'ALERT' && !e.dead) {
                                this.questState.larissa_stealth_hint = true;
                                this.addPausableTimeout(() => {
                                    this.story.triggerComms("LARISSA", "They can't see in the dark. Use it.", 4500);
                                }, 4800); // Delayed so it doesn't overlap telegraph hint
                                break;
                            }
                        }
                    }
                }
                
                this.profiler.stop('AI:Enemies');
            
                // --- 6. PROJECTILES (Entity System + Actor Collision) ---
                // Wall/building/prop collisions handled by CollisionSystem.
                // Actor collisions (player/enemies) use onProjectileHit() callbacks.
                this.profiler.start('Physics:Proj');
                
                // ── ORPHAN SWEEP ──
                // Catch any ProjectileEntity stuck in the GameEntity registry that isn't 
                // in this.projectiles. These are ghost entities that can deal invisible damage.
                const registeredProjectiles = GameEntity.registry.collidable.filter(e => 
                    e.collisionLayer === GameEntity.LAYER.PROJECTILE && e.active
                );
                for (const rp of registeredProjectiles) {
                    if (!this.projectiles.includes(rp)) {
                        // Orphan found — force-kill it
                        rp.active = false;
                        rp.markedForDestroy = true;
                        rp.vx = 0;
                        rp.vy = 0;
                        rp._finalDestroy();
                    }
                }
                
                // Update all projectiles and check for actor collisions
                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    let p = this.projectiles[i];
                    
                    // Skip if already destroyed by entity system
                    if (!p.active || p.markedForDestroy) {
                        // Ensure destroy() was called (triggers registry cleanup)
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    p.update();
                    
                    // ── NEURAL LOCK AIM ASSIST ──
                    // Steer friendly projectiles toward nearest enemy on trajectory path
                    if (p.alliance === 'friendly' && this.augments && this.augments.isEquipped('auto_aim')) {
                        const STEER_RATE = 0.052;   // ~3° per frame — strong but not homing
                        const DETECT_RANGE = 350;   // px detection radius from projectile
                        const CONE_HALF = Math.PI / 3; // 60° half-cone (120° total forward arc)
                        
                        const projAngle = Math.atan2(p.vy, p.vx);
                        let bestTarget = null;
                        let bestPathDist = Infinity;
                        
                        for (const e of this.enemies) {
                            if (e.dead || !e.active) continue;
                            const dx = e.x - p.x;
                            const dy = e.y - p.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist > DETECT_RANGE || dist < 5) continue;
                            
                            // Must be within forward cone
                            const angleToEnemy = Math.atan2(dy, dx);
                            let angleDiff = angleToEnemy - projAngle;
                            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                            if (Math.abs(angleDiff) > CONE_HALF) continue;
                            
                            // Perpendicular distance to projectile path — closest to trajectory wins
                            const pathDist = Math.abs(Math.sin(angleDiff) * dist);
                            if (pathDist < bestPathDist) {
                                bestPathDist = pathDist;
                                bestTarget = e;
                            }
                        }
                        
                        if (bestTarget) {
                            const desired = Math.atan2(bestTarget.y - p.y, bestTarget.x - p.x);
                            let steer = desired - projAngle;
                            while (steer > Math.PI) steer -= 2 * Math.PI;
                            while (steer < -Math.PI) steer += 2 * Math.PI;
                            steer = Math.max(-STEER_RATE, Math.min(STEER_RATE, steer));
                            const newAngle = projAngle + steer;
                            const speed = Math.hypot(p.vx, p.vy);
                            p.vx = Math.cos(newAngle) * speed;
                            p.vy = Math.sin(newAngle) * speed;
                        }
                    }
                    
                    // If update() destroyed the projectile (life expired), remove immediately
                    if (!p.active || p.markedForDestroy) {
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    // ── DEFENSIVE GUARDS (eliminate ghost projectiles) ──
                    
                    // Hard age cap: no projectile survives beyond 5 seconds
                    if (_frameTime - p.spawnTime > 5000) {
                        p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    // Zero-velocity kill: a non-sticky projectile with no momentum is dead
                    // (Normal projectiles should NEVER have zero velocity mid-flight)
                    if (!p.sticky && p.vx === 0 && p.vy === 0) {
                        p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    let hit = false;
                    let shouldDestroy = false;
                    
                    // Indoor V2: Check window shatter
                    if (this.roomSystem.active) {
                        for (const win of this.roomSystem.windows) {
                            if (win.tryShatter(p.x, p.y, 6)) {
                                this.weather.spawnSparks(p.x, p.y, 8);
                                audioSys.sfx('explode');
                                this.emitNoise(p.x, p.y, CONFIG.NOISE.glass, 'glass', !p.isEnemy);
                                break;
                            }
                        }
                        // Doors take bullets: the leaf swings (or the glass jolts) with the round's force
                        const dh = this.roomSystem.hitDoors(p);
                        if (dh) {
                            const glass = dh.door.type === 'sliding';
                            this.weather.spawnSparks(dh.x, dh.y, glass ? 6 : 4);
                            if (!glass && this.createImpactDust) this.createImpactDust(dh.x, dh.y);
                            if (typeof ambience !== 'undefined') ambience.doorEvent(glass ? 'tink' : 'thud', dh.door);
                            this.emitNoise(dh.x, dh.y, CONFIG.NOISE.door, 'door', !p.isEnemy);
                            if (p.penetrating && !p.melee) p.damage *= 0.5;          // a sniper round punches through, spent
                            else { p.destroy(); this.projectiles.splice(i, 1); continue; }
                        }
                    }
                    
                    // Check Player (Enemy Projectiles Only) - uses PlayerEntity
                    if (p.isEnemy && this.player.visible && !this.player.dead) {
                        // Skip if penetrating and already hit this target
                        if (!p.penetrating || !p.hitTargets.has(this.player)) {
                            const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
                            if (d < this.player.radius + 5) {
                                hit = true;
                                this.player.onProjectileHit(p, this);
                                if (p.penetrating) {
                                    p.hitTargets.add(this.player);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) shouldDestroy = true;
                                } else {
                                    shouldDestroy = true;
                                }
                            }
                        }
                    }
                    
                    // Check Enemies (Player Projectiles Only)
                    if (!p.isEnemy) {
                        for (let e of this.enemies) {
                            if (e.dead) continue;
                            // Skip if penetrating and already hit this target
                            if (p.penetrating && p.hitTargets.has(e)) continue;
                            
                            const d = Math.hypot(p.x - e.x, p.y - e.y);
                            if (d < e.radius + 5) {
                                hit = true;
                                const angle = Math.atan2(p.vy, p.vx);
                                // Knockback scales with damage AND speed (powerful sniper = huge knockback)
                                // Formula: (damage * speed) / target_mass, capped for sanity
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const targetMass = e.mass || 20;
                                const knockbackStrength = Math.min((p.damage * projSpeed * 0.02) / (targetMass * 0.1), 50);
                                const kbX = Math.cos(angle) * knockbackStrength;
                                const kbY = Math.sin(angle) * knockbackStrength;
                                e.lastHitBy = p.owner; e.lastHitMelee = !!p.melee;       // who gets the Resonance
                                e.takeDamage(p.damage, kbX, kbY);
                                
                                // Spawn sticky DOT orb (Golden Child)
                                if (p.sticky && !e.dead) {
                                    // Random offset so multiple orbs scatter across the target
                                    const orbOffset = (e.radius || 10) * 0.5;
                                    this.stickyOrbs.push({
                                        target: e,
                                        offsetX: (Math.random() - 0.5) * orbOffset,
                                        offsetY: (Math.random() - 0.5) * orbOffset,
                                        maxRadius: 7,
                                        ticksLeft: p.dotTicks,
                                        maxTicks: p.dotTicks,
                                        tickInterval: p.dotInterval,
                                        tickTimer: 0,
                                        dotDamage: p.dotDamage,
                                    });
                                }
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(e);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) {
                                        shouldDestroy = true;
                                        break;
                                    }
                                    // Continue to next enemy for penetrating shots
                                } else {
                                    shouldDestroy = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Check Traffic Vehicles (penetrating shots go through)
                    if (this.traffic && this.traffic.vehicles) {
                        for (let car of this.traffic.vehicles) {
                            // Skip if penetrating and already hit this target
                            if (p.penetrating && p.hitTargets.has(car)) continue;
                            
                            if (Math.hypot(p.x - car.x, p.y - car.y) < 35) {
                                hit = true;
                                this.weather.spawnSparks(p.x, p.y, 8);
                                const angle = Math.atan2(p.vy, p.vx);
                                // Push cars based on damage and speed - sniper sends them flying!
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const carMass = 500; // Cars are heavy
                                const pushStrength = (p.damage * projSpeed * 0.005) / (carMass * 0.01);
                                car.x += Math.cos(angle) * pushStrength;
                                car.y += Math.sin(angle) * pushStrength;
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(car);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) {
                                        shouldDestroy = true;
                                        break;
                                    }
                                } else {
                                    shouldDestroy = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Check Owned Car (penetrating shots go through)
                    if (this.ownedCar && this.ownedCar.visible) {
                        if (!p.penetrating || !p.hitTargets.has(this.ownedCar)) {
                            if (Math.hypot(p.x - this.ownedCar.x, p.y - this.ownedCar.y) < 35) {
                                hit = true;
                                this.weather.spawnSparks(p.x, p.y, 8);
                                // Push owned car based on damage - sniper sends it flying!
                                const angle = Math.atan2(p.vy, p.vx);
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const carMass = 500;
                                const pushStrength = (p.damage * projSpeed * 0.005) / (carMass * 0.01);
                                this.ownedCar.x += Math.cos(angle) * pushStrength;
                                this.ownedCar.y += Math.sin(angle) * pushStrength;
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(this.ownedCar);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) shouldDestroy = true;
                                } else {
                                    shouldDestroy = true;
                                }
                            }
                        }
                    }
                    
                    // HIT RESOLUTION (Audio/Visual Effects)
                    if (hit) {
                        const distToPlayer = Math.hypot(p.x - this.player.x, p.y - this.player.y);
                        
                        if (distToPlayer < 800) {
                            audioSys.sfx('explode');
                            
                            // Camera shake: Sniper > Fireballs > Enemy Shots > Player Shots
                            let shakeAmt = p.isSniper ? 15 : (p.color === '#ff3300' ? 12 : (p.isEnemy ? 8 : 4));
                            shakeAmt *= (1 - (distToPlayer / 800));
                            if (shakeAmt > 0.5) this.triggerShake(shakeAmt);
                        }
                        
                        // Visual explosion
                        if (p.color === '#ff3300') {
                            this.weather.spawnExplosion(p.x, p.y, '#ff3300');
                            this.weather.spawnSparks(p.x, p.y, 25);
                        } else {
                            this.weather.spawnExplosion(p.x, p.y, p.color);
                            // Extra sparks for sniper hits
                            if (p.isSniper) {
                                this.weather.spawnSparks(p.x, p.y, 15);
                            }
                        }
                        
                        // Destroy if not penetrating or exceeded max
                        if (shouldDestroy) {
                            p.destroy();
                            this.projectiles.splice(i, 1);
                        }
                    }
                    
                    // Remove if expired (entity handles this, but sync arrays)
                    if (!p.active || p.markedForDestroy) {
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                    }
                }
                
                // ── STICKY ORBS (Golden Child DOT) ──
                for (let i = this.stickyOrbs.length - 1; i >= 0; i--) {
                    const orb = this.stickyOrbs[i];
                    
                    // Remove if target dead or ticks exhausted
                    if (!orb.target || orb.target.dead || orb.ticksLeft <= 0) {
                        this.stickyOrbs.splice(i, 1);
                        continue;
                    }
                    
                    // Tick damage timer
                    orb.tickTimer++;
                    if (orb.tickTimer >= orb.tickInterval) {
                        orb.tickTimer = 0;
                        orb.ticksLeft--;
                        orb.target.takeDamage(orb.dotDamage);
                        
                        // Small golden spark on each tick
                        if (this.weather) {
                            this.weather.spawnExplosion(
                                orb.target.x + orb.offsetX, 
                                orb.target.y + orb.offsetY, 
                                '#FFD700'
                            );
                        }
                    }
                }
            
                // Loot Collection
                for(let i=this.loot.length-1; i>=0; i--) {
                    let l = this.loot[i];
                    let d = Math.hypot(this.player.x - l.x, this.player.y - l.y);
                    // Scrap Magnet augment: small pickups drift in from three times the range
                    if (d >= 35 && d < 105 && this.augments.isEquipped('scrap_magnet') && (l.type === 'pp' || l.type === 'scrap' || l.type === 'stim' || l.type === 'dark_element')) {
                        const k = Math.min(1, 4 / d);
                        l.x += (this.player.x - l.x) * k; l.y += (this.player.y - l.y) * k;
                        d = Math.hypot(this.player.x - l.x, this.player.y - l.y);
                    }
                    
                    // Check pickup range
                    if (d < 35) {
                        // --- WEAPON PICKUP WITH DELAY ---
                        if (l.type === 'weapon_drop') {
                            
                            // CHECK: Has it been 1.5 seconds (1500ms) since it was dropped?
                            // If dropTime doesn't exist (generated by map), default to 0 (allow pickup)
                            const timeSinceDrop = Date.now() - (l.dropTime || 0);
                            
                            if (timeSinceDrop > 1500) { 
                                const added = this.inventory.addItem(l.item);
                                if (added) {
                                    audioSys.sfx('ui');
                                    this.loot.splice(i, 1);
                                }
                            }
                            // Skip the generic splice below - weapon_drop handles its own removal
                            continue;
                        } 
                        else if (l.type === 'pp') { this.currency += 20; showMessage("+PERSONICS"); } 
                        else if (l.type === 'dark_element') {
                            this.darkElement = (this.darkElement || 0) + 1;
                            showMessage('DARK ELEMENT SHARD — THE CORPORATIONS WOULD WANT THIS BACK');
                            audioSys.sfx('ui');
                        }
                        else if (l.type === 'scrap') { 
                            const amount = 2 + Math.floor(Math.random() * 2); // 2-3 scrap
                            this.scrap += amount; 
                            showMessage(`+${amount} SCRAP`); 
                        }
                        else if (l.type === 'salvage_crate') {
                            // Salvage mission crate — big scrap payout
                            if (this.missions.activeMission && this.missions.activeMission.type === MISSION_TYPES.SALVAGE) {
                                this.missions.activeMission.crateCollected = true;
                                showMessage('SCRAP CRATE RECOVERED.');
                                audioSys.sfx('ui');
                            }
                        } 
                        else if (l.type === 'stim') { 
                            if (this.boosterCount < this.getEffectiveMaxBoosters()) { 
                                this.boosterCount++; 
                                showMessage("+STIM"); 
                            } else { 
                                showMessage("STIMS FULL"); 
                                continue; // Don't remove if stims are full
                            } 
                        }
                        this.loot.splice(i, 1);
                    }
                }
            
                // Props Physics (Entity System)
                // NOTE: All prop collisions (prop-prop, prop-wall, actor-prop) are handled
                // by CollisionSystem._processDynamics and _processActors (circle vs OBB).
                // We only handle velocity/friction here.
                for (let prop of this.props) {
                    prop.update();
                }
                
                this.profiler.stop('Physics:Proj');
            
                // --- 7. PLAYER PHYSICS ---
                this.profiler.start('Physics:Player');
                
                // Bumper Car Minigame takes over driving when active
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.bumperMinigame.update(this);
                    // (No stop() here — this branch falls through to the shared
                    // stop at the end of the block. Stopping twice against a
                    // start() that was never reset counted the whole span twice,
                    // roughly doubling Physics:Player whenever the minigame ran.)
                } else if (this.isDriving) {
                    if (this.car.controlMode === 'AI') {
                        // PER-FRAME WAYPOINT SYNC & GPS SANITY CHECK
                        // Handles: exhausted waypoints, faulty data, off-route detection
                        if ((this.car.driverType === 'player' || this.car.driverType === 'zib') 
                            && this.navDestination) {
                            
                            const hasWaypoints = this.car.navWaypoints && this.car.navWaypoints.length > 0 
                                && this.car.currentWaypointIndex < this.car.navWaypoints.length;
                            
                            // Track recalc timer per car
                            if (!this.car._gpsCheckTimer) this.car._gpsCheckTimer = 0;
                            this.car._gpsCheckTimer++;
                            
                            let needsRecalc = false;
                            
                            // Case 1: No waypoints at all
                            if (!hasWaypoints) {
                                needsRecalc = true;
                            }
                            
                            // Case 2: Periodic sanity check (every 3 seconds)
                            if (!needsRecalc && hasWaypoints && this.car._gpsCheckTimer > 180) {
                                this.car._gpsCheckTimer = 0;
                                
                                // Check if current waypoint is unreachably far
                                const wp = this.car.navWaypoints[this.car.currentWaypointIndex];
                                if (wp) {
                                    const wpDist = Math.hypot(this.car.x - wp.x, this.car.y - wp.y);
                                    // If nearest waypoint is more than 500px away, route is likely broken
                                    if (wpDist > 500) {
                                        needsRecalc = true;
                                    }
                                }
                                
                                // Check if car is on the expected road (when on a lane, not mid-turn)
                                if (!needsRecalc && this.car.currentLane && !this.car.currentTurnPath) {
                                    if (!this.car.isOnExpectedRoad()) {
                                        // Give benefit of the doubt — only recalc if off-road for 2+ checks
                                        if (!this.car._offRouteCount) this.car._offRouteCount = 0;
                                        this.car._offRouteCount++;
                                        if (this.car._offRouteCount >= 2) {
                                            needsRecalc = true;
                                            this.car._offRouteCount = 0;
                                        }
                                    } else {
                                        this.car._offRouteCount = 0;
                                    }
                                }
                            }
                            
                            // Recalculate GPS path from current position
                            if (needsRecalc) {
                                this.car.navDestination = this.navDestination;
                                if (this.ui) {
                                    const savedPX = this.player.x, savedPY = this.player.y;
                                    this.player.x = this.car.x;
                                    this.player.y = this.car.y;
                                    this.ui.calculateNavPath();
                                    this.player.x = savedPX;
                                    this.player.y = savedPY;
                                    if (this.ui.navPath && this.ui.navPath.length > 1) {
                                        this.car.setNavWaypoints(this.ui.navPath.slice(1));
                                        this.car._gpsCheckTimer = 0;
                                    }
                                }
                            }
                        }
                        this.car.update(this.player, null, this.traffic.vehicles, this.weather, this.traffic.network.intersections, this.activeMap.walls, getColliders(this.activeMap));
                        if (inputX !== 0 || inputY !== 0) { this.car.disableAutoDrive(); this.autodriveBtn.classList.remove('engaged'); showMessage("AUTO-DRIVE DISENGAGED"); }
                    } else {
                        let gas = 0; let turn = 0;
                        if (this.joystick.active) { 
                            const carDirX = Math.cos(this.car.angle); const carDirY = Math.sin(this.car.angle); 
                            gas = (inputX * carDirX + inputY * carDirY); 
                            if (Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1) { 
                                const inputAngle = Math.atan2(inputY, inputX); let angleDiff = inputAngle - this.car.angle; 
                                angleDiff = normalizeAngle(angleDiff); 
                                turn = clamp(angleDiff * 2.0, -1, 1);
                                if (Math.abs(turn) < 0.1) turn = 0;
                            } 
                        } else { 
                            if (inputY < 0) gas = 1; if (inputY > 0) gas = -0.5; if (inputX < 0) turn = -1; if (inputX > 0) turn = 1; 
                        }
                        this.car.manualGas = gas; this.car.manualTurn = turn;
                        this.car.updateManualDriving(this.activeMap.walls, getColliders(this.activeMap), this.weather, this.decals);
                    }
                    // Player sits at seat 0, not car center
                    const driverSeatPos = this.car.getSeatWorldPos(0);
                    this.player.x = driverSeatPos.x; this.player.y = driverSeatPos.y;
            
                    // Drive-By Shooting Logic: from the driver's window, so the aim is held
                    // to the car's left half. A sniper on Fire on Release arms past the ring
                    // and takes the shot when the thumb lifts, same as on foot.
                    const F = this.fireJoystick;
                    const clampToWindow = (aimAngle) => {
                        let rel = aimAngle - this.car.angle;
                        while (rel > Math.PI) rel -= Math.PI * 2;
                        while (rel < -Math.PI) rel += Math.PI * 2;
                        // Left side is -PI..0 relative to the car's facing; the right snaps to the nearer edge
                        if (rel > 0 && rel < Math.PI) rel = rel < Math.PI / 2 ? 0 : -Math.PI;
                        return this.car.angle + rel;
                    };
                    const releasing = this._releaseShot !== null && this._releaseShot !== undefined;
                    const isShooting = (F.active && F.firing) || (this.mouseDown && this.mouseX);
                    const armed = F.active && F.armed;
                    this.isShootingFromCar = isShooting || armed || releasing; // Store for drawing

                    if (releasing) {
                        this.player.angle = clampToWindow(this._releaseShot);
                        if (this.shootCooldown <= 0) { this.fireWeapon(); this._releaseShot = null; }
                        else if (++this._releaseWait > 30) this._releaseShot = null;
                        if (this._releaseShot === null) this._releaseWait = 0;
                    } else if (isShooting || armed) {
                        let aimAngle;
                        if (F.active) {
                            aimAngle = Math.atan2(F.dy, F.dx);
                        } else {
                            const worldX = this.player.x + (this.mouseX - this.canvas.width/2) / this.camera.zoom;
                            const worldY = this.player.y + (this.mouseY - this.canvas.height/2) / this.camera.zoom;
                            aimAngle = Math.atan2(worldY - this.player.y, worldX - this.player.x);
                        }
                        this.player.angle = clampToWindow(aimAngle);
                        // Cooldown already counted down once this tick (step 1); armed only aims
                        if (isShooting && this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else {
                        // Not shooting - face car direction
                        this.player.angle = this.car.angle;
                    }
            
                } else {
                    // Walking Logic (Player Entity System)
                    this.isShootingFromCar = false; // Reset when not driving
                    // Normalize so keyboard diagonals (±1, ±1) aren't √2 faster.
                    // Analog stick input already inside the unit circle passes through.
                    const walkInputMag = Math.hypot(inputX, inputY);
                    if (walkInputMag > 1) { inputX /= walkInputMag; inputY /= walkInputMag; }
                    this.player.velX = inputX; this.player.velY = inputY; 
                    
                    const F = this.fireJoystick;
                    if (F.active || !this.mouseDown) this.player._aimPoint = null;   // stick / facing: fire straight
                    if (this._releaseShot !== null && this._releaseShot !== undefined) {
                        // Sniper fire-on-release: the thumb lifted with the shot armed — take it (waits out the cooldown briefly)
                        this.player.angle = this._releaseShot;
                        if (this.shootCooldown <= 0) { this.fireWeapon(); this._releaseShot = null; }
                        else if (++this._releaseWait > 30) this._releaseShot = null;
                        if (this._releaseShot === null) this._releaseWait = 0;
                    } else if (F.active && F.aimed) {
                        this.player.angle = Math.atan2(F.dy, F.dx);
                        // Fire only past the threshold ring (Aim Before Firing), at the weapon's own rate;
                        // cooldown already counted down once this tick (step 1)
                        if (F.firing && this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else if (this.mouseDown && this.mouseX) {
                        const worldX = this.player.x + (this.mouseX - this.canvas.width/2) / this.camera.zoom;
                        const worldY = this.player.y + (this.mouseY - this.canvas.height/2) / this.camera.zoom;
                        this.player.angle = Math.atan2(worldY - this.player.y, worldX - this.player.x);
                        this.player._aimPoint = { x: worldX, y: worldY };   // shots and the laser converge here
                        // Cooldown already counted down once this tick (step 1)
                        if (this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else {
                        if (inputX !== 0 || inputY !== 0) this.player.angle = Math.atan2(inputY, inputX);
                    }
                    
                    // Apply movement via PlayerEntity (collision resolution via CollisionSystem)
                    // Store pre-movement position for car collision check
                    const prevX = this.player.x;
                    const prevY = this.player.y;
                    
                    this.player.applyMovement(inputX, inputY);
                    
                    // Car collision (not in entity system yet) - revert if colliding
                    if (this.checkPlayerCarCollision(this.player.x, this.player.y)) {
                        this.player.x = prevX;
                        this.player.y = prevY;
                    }
                    
                    // Clamp player within map bounds
                    const boundsMargin = 15;
                    this.player.x = Math.max(boundsMargin, Math.min(this.activeMap.width - boundsMargin, this.player.x));
                    this.player.y = Math.max(boundsMargin, Math.min(this.activeMap.height - boundsMargin, this.player.y));
                    
                    // Wall/Building/Prop collisions now handled by CollisionSystem
                    // (runs after this in the update loop)
                    
                    // --- BLOOD TRAIL LOGIC (PLAYER) ---
                    if (this.playerHealth < 50) {
                        const isMoving = (Math.abs(inputX) > 0 || Math.abs(inputY) > 0);
                        const bleedChance = this.playerHealth < 20 ? 0.3 : 0.1;
                        
                        // Drops as she moves (now and then when still), more often when badly hurt
                        if ((isMoving || Math.random() < 0.05) && Math.random() < bleedChance) {
                            this.decals.addBlood(this.player.x, this.player.y, 3 + Math.random() * 2, BLOOD_KINDS.wine.decal);   // Stella's own
                        }
                    }
                }
                
                // Update PlayerEntity (knockback decay, animation phase)
                this.player.update();
                
                // Clamp player within map bounds after knockback
                if (!this.isDriving) {
                    const postKnockbackMargin = 15;
                    this.player.x = Math.max(postKnockbackMargin, Math.min(this.activeMap.width - postKnockbackMargin, this.player.x));
                    this.player.y = Math.max(postKnockbackMargin, Math.min(this.activeMap.height - postKnockbackMargin, this.player.y));
                }
                this.profiler.stop('Physics:Player');

                // --- ENTITY BOUNDARY CLAMPING ---
                // Prevent NPCs, enemies, teammates, and cat from leaving map bounds
                {
                    const mapW = this.activeMap.width;
                    const mapH = this.activeMap.height;
                    const em = 15; // entity margin
                    const clampEntity = (e) => {
                        if (!e || e.x === undefined) return;
                        if (e.x < em) e.x = em;
                        else if (e.x > mapW - em) e.x = mapW - em;
                        if (e.y < em) e.y = em;
                        else if (e.y > mapH - em) e.y = mapH - em;
                    };
                    for (const npc of this.npcs) clampEntity(npc);
                    for (const tm of this.teammates) { if (tm.recruited) clampEntity(tm); }
                    for (const enemy of this.enemies) clampEntity(enemy);
                    if (this.velvetCat && this.velvetCat.visible) clampEntity(this.velvetCat);
                }
            
                // --- 8. COLLISIONS & INTERACTION UI ---
                this.profiler.start('Physics:Collisions');
                // Runs every step. This call contains the player-vs-traffic
                // contact test (including damage and impact SFX) as well as
                // car-vs-car separation — anything feeding a discrete contact
                // test must be sampled every step or hits get missed outright.
                if (this.simDue(CONFIG.SIM.TRAFFIC_COLLIDE_INTERVAL)) {
                    this.resolveTrafficCollisions();
                }
                
                // Unified Entity System collision pass (spatial grid optimization)
                if (this.useNewCollisionSystem) {
                    CollisionSystem.update(this.camera, this.canvas, this);
                }
                this.profiler.stop('Physics:Collisions');
            
                this.profiler.start('Logic:UI_Interact');
                // Interaction UI Checks
                let inTransition = false;
                if (this.activeMap.transitions && !this.isDriving) { 
                    const t = this._transitionGrid.query(this.player.x, this.player.y); 
                    if (t) { inTransition = true; const [v, n] = transitionAction(t.label); setActionPill(this.transitionBtn, v, n, 'F'); this.transitionBtn.style.display = 'flex'; } 
                }
                if (!inTransition) this.transitionBtn.style.display = 'none';
            
                let carDist = Math.hypot(this.player.x - this.car.x, this.player.y - this.car.y);
                let nearInteractable = null;
                
                // Find Interactables
                for(let npc of this.npcs) { let d = Math.hypot(this.player.x - npc.x, this.player.y - npc.y); if (d < 50) { nearInteractable = npc; } }
                for(let tm of this.teammates) { 
                    if (tm.inCar) continue;
                    // In apartment: recruited teammates are interactable for bonding
                    const inApt = this.activeMap && this.activeMap.id === 'apt_949';
                    if (tm.recruited && !inApt) continue;
                    if (!tm.recruited && inApt) continue; // Skip unrecruited in apartment
                    let d = Math.hypot(this.player.x - tm.x, this.player.y - tm.y); if(d < 50) { nearInteractable = tm; } 
                }
                for(let p of this.props) { if (PROP_ACTIONS[p.interactionType]) { let d = Math.hypot(this.player.x - (p.x + p.w/2), this.player.y - (p.y + p.h/2)); if (d < 60) nearInteractable = p; } }   // only props that do something
                
                // Discoverable Velvet Cat
                if (this.velvetCat && this.velvetCat._discoverable && !this.questState.hasVelvetCat) {
                    const catDist = Math.hypot(this.player.x - this.velvetCat.x, this.player.y - this.velvetCat.y);
                    if (catDist < 50) nearInteractable = { interactionType: 'adopt_cat', entity: this.velvetCat };
                }
                
                // Delivery vehicle interaction (for pickup when mission active)
                if (this.deliveryVehicle && this.deliveryVehicle.visible && this.missions.activeMission 
                    && this.missions.activeMission.type === MISSION_TYPES.DELIVERY 
                    && !this.missions.activeMission.pickedUp && !this.isDriving) {
                    const dvDist = Math.hypot(this.player.x - this.deliveryVehicle.x, this.player.y - this.deliveryVehicle.y);
                    if (dvDist < 80) {
                        nearInteractable = { interactionType: 'delivery_pickup' };
                    }
                }
                
                captionSystem.checkProximityGreetings(this.player, this.npcs, this.teammates);
                
                let ownedCarDist = null;
                if (this.ownedCar && this.ownedCar !== this.car && this.ownedCar.visible) {
                    ownedCarDist = Math.hypot(this.player.x - this.ownedCar.x, this.player.y - this.ownedCar.y);
                }
                let nearTraffic = this.traffic.getNearest(this.player.x, this.player.y, 80);
                
                // Check delivery vehicle proximity (managed separately from traffic)
                let nearDeliveryVehicle = null;
                if (this.deliveryVehicle && this.deliveryVehicle.visible && !this.isDriving
                    && this.deliveryVehicle.controlMode !== 'PLAYER') {
                    const dvDist = Math.hypot(this.player.x - this.deliveryVehicle.x, this.player.y - this.deliveryVehicle.y);
                    if (dvDist < 80) nearDeliveryVehicle = this.deliveryVehicle;
                }
            
                // Update Button State
                if (this.isDriving) { 
                    this.setInteract('Exit', 'Vehicle'); this.interactBtn.style.display = 'flex'; this.activeInteraction = null; 
                } 
                else if (nearInteractable) { 
                    this.interactBtn.style.display = 'flex'; this.activeInteraction = nearInteractable; 
                    if (nearInteractable instanceof PropEntity) {
                        const [verb, name, useLabel] = PROP_ACTIONS[nearInteractable.interactionType];
                        this.setInteract(verb, (useLabel && nearInteractable.label) || name);
                    } else if (nearInteractable.interactionType === 'delivery_pickup') {
                        this.setInteract('Pick Up', 'Delivery');
                    } else if (nearInteractable.interactionType === 'adopt_cat') {
                        this.setInteract('Adopt', nearInteractable.name || 'Cat');
                    } else if (nearInteractable.role === 'teammate' && nearInteractable.recruited && this.activeMap && this.activeMap.id === 'apt_949') {
                        if (this.bonding.canBond(nearInteractable)) {
                            this.setInteract('Bond', nearInteractable.name);
                        } else {
                            this.setInteract('Talk', nearInteractable.name);
                        }
                    } else { this.setInteract('Talk', nearInteractable.name); }
                }
                else if (ownedCarDist !== null && ownedCarDist < 80) {
                    this.setInteract('Drive', 'Your car'); this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: this.ownedCar };
                }
                else if (nearDeliveryVehicle) {
                    this.setInteract('Drive', 'Delivery van'); this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: nearDeliveryVehicle };
                }
                else if (nearTraffic && nearTraffic.isZib) {
                    this.setInteract('Hail', 'Zib cab'); this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hail_zib', target: nearTraffic };
                }
                else if (nearTraffic) {
                    this.setInteract('Hijack', 'Vehicle'); this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: nearTraffic };
                }
                else if (carDist < 80 && this.activeMap.type !== 'indoor') { 
                    this.setInteract('Drive', 'Car'); this.interactBtn.style.display = 'flex'; this.activeInteraction = null; 
                } 
                else { 
                    this.interactBtn.style.display = 'none'; this.activeInteraction = null; 
                }
            
                // Camera Zoom Logic (skip during cutscene — cutscene manager owns zoom)
                if (!this.cutscene || !this.cutscene.active) {
                let targetZoom = 1.0;
                if (this.isDriving) { 
                    const speedRatio = Math.abs(this.car.speed) / this.car.maxSpeed; 
                    targetZoom = 1.0 - (speedRatio * 0.65); 
                    if (targetZoom < 0.35) targetZoom = 0.35; 
                } else if (nearInteractable) { targetZoom = 1.4; }
                if (this.isLandscape) targetZoom *= 0.9;          // a short screen: a little more ground above and below her
                
                const diff = targetZoom - this.camera.zoom;
                if (Math.abs(diff) > 0.005) this.camera.zoom += diff * 0.05;
                else this.camera.zoom = targetZoom;
                }
                
                // Mission System: check objective completion
                if (this.missions) this.missions.checkCompletion(this);
                
                this.profiler.stop('Logic:UI_Interact');
                this.profiler.stop('Update:Total');
            },

            
            resolveTrafficCollisions() {
                // 1. WALKING COLLISION (Player vs Traffic)
                if (!this.isDriving) {
                    // Create dummy for Grid Query
                    const playerDummy = { x: this.player.x, y: this.player.y, length: 30, width: 30 };
                    const nearby = this.traffic.grid.getNearby(playerDummy);
                    
                    for (let v of nearby) {
                        // Translate player to vehicle local space
                        const dx = this.player.x - v.x;
                        const dy = this.player.y - v.y;
                        const cos = Math.cos(-v.angle);
                        const sin = Math.sin(-v.angle);
                        const localX = dx * cos - dy * sin;
                        const localY = dx * sin + dy * cos;
                        
                        const hLen = (v.length / 2) + 2; 
                        const hWid = (v.width / 2) + 2;
                        const closestX = Math.max(-hLen, Math.min(hLen, localX));
                        const closestY = Math.max(-hWid, Math.min(hWid, localY));
                        const distX = localX - closestX;
                        const distY = localY - closestY;
                        const distSq = distX * distX + distY * distY;
                        const radius = 15; 
            
                        if (distSq < radius * radius && distSq > 0) {
                            const dist = Math.sqrt(distSq);
                            const overlap = radius - dist;
                            const nX = distX / dist;
                            const nY = distY / dist;
                            
                            // Rotate normal back to world space
                            const worldNx = nX * Math.cos(v.angle) - nY * Math.sin(v.angle);
                            const worldNy = nX * Math.sin(v.angle) + nY * Math.cos(v.angle);
            
                            // --- NEW PHYSICS LOGIC ---
                            const pMass = this.player.mass || 15; // Your 15000 goes here
                            const vMass = v.mass || 1000;
                            const totalMass = pMass + vMass;
                            
                            // Calculate push ratios
                            const playerRatio = vMass / totalMass; // How much player moves
                            const carRatio = pMass / totalMass;    // How much car moves
            
                            // 1. Position Separation (Push both based on mass)
                            this.player.x += worldNx * overlap * playerRatio;
                            this.player.y += worldNy * overlap * playerRatio;
                            
                            v.x -= worldNx * overlap * carRatio;
                            v.y -= worldNy * overlap * carRatio;
            
                            // 2. Momentum Transfer (Super strength effect)
                            // If player is moving into the car, transfer velocity
                            const pushDot = this.player.velX * worldNx + this.player.velY * worldNy;
                            if (pushDot < 0) {
                                const pushForce = -pushDot * 2.0; // Strength multiplier
                                // Apply velocity to car (if it has vx/vy properties)
                                // Since cars use 'speed' and 'angle', we approximate:
                                if (carRatio > 0.5) { // Only if player is heavy enough to matter
                                     // Hacky impulse for legacy cars: nudge position directly for "slide"
                                     v.x -= worldNx * pushForce * carRatio * 2;
                                     v.y -= worldNy * pushForce * carRatio * 2;
                                }
                            }
                            // -------------------------
            
                            // Damage Logic (Keep existing)
                            if (Math.abs(v.speed) > 4.0) {
                                this.damagePlayer(10);
                                this.triggerShake(10);
                                audioSys.sfx('explode'); 
                                this.weather.spawnExplosion(this.player.x, this.player.y, '#ff0000');
                            }
                        }
                    }
                } 
                
                // 2. VEHICLE vs VEHICLE Collisions
                this.traffic.resolveCollisions(this.car, this.player, this.weather, audioSys, this.ownedCar, this.decals);
            },

            
            getOBBCorners(c) {
                const cos = Math.cos(c.angle); const sin = Math.sin(c.angle);
                const hw = c.length / 2; const hh = c.width / 2; // Note: Length is X-axis in local space usually
                return [
                    { x: c.x + (hw * cos - hh * sin), y: c.y + (hw * sin + hh * cos) },
                    { x: c.x + (hw * cos + hh * sin), y: c.y + (hw * sin - hh * cos) },
                    { x: c.x + (-hw * cos + hh * sin), y: c.y + (-hw * sin - hh * cos) },
                    { x: c.x + (-hw * cos - hh * sin), y: c.y + (-hw * sin + hh * cos) }
                ];
            },
            
            isPointInRotatedRect(x, y, rect) {
                // Translate point to rect local space
                const dx = x - rect.x;
                const dy = y - rect.y;
                const cos = Math.cos(-rect.angle);
                const sin = Math.sin(-rect.angle);
                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;
                
                // Check AABB in local space
                return (Math.abs(localX) < rect.length/2 && Math.abs(localY) < rect.width/2);
            },

        });

