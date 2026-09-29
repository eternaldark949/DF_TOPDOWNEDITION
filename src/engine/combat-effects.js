        // GameEngine — Screen shake, time slow, death, resize, firing, boosters, player damage.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            triggerShake(amount) {
                if (amount > this.camera.shake) {
                    this.camera.shake = amount;
                    
                    // HAPTIC FEEDBACK (Vibration)
                    if (navigator.vibrate) {
                        // Vibrate for milliseconds equal to the shake amount * 10
                        navigator.vibrate(amount * 10); 
                    }
                }
            },
            
            /**
             * Trigger a dramatic time slow effect.
             * Useful for boss kills, critical moments, etc.
             * 
             * @param {number} slowPercent - How much to slow (0.4 = 60% slower, meaning 40% speed)
             * @param {number} durationSeconds - How long the slow lasts in real seconds
             * @param {boolean} smoothTransition - Whether to ease in/out (default true)
             */
            triggerTimeSlow(slowPercent = 0.4, durationSeconds = 4, smoothTransition = true) {
                this.timeSlowState.active = true;
                this.timeSlowState.targetScale = slowPercent;
                // Duration is in frames at 60fps, but we want real seconds
                // So we need to account for the slow - more frames needed when slowed
                this.timeSlowState.duration = Math.floor(durationSeconds * 60);
                this.timeSlowState.transitionSpeed = smoothTransition ? 0.08 : 1.0;
                
                // If not smooth, snap immediately
                if (!smoothTransition) {
                    this.timeSlowState.scale = slowPercent;
                }
            },
            
            /**
             * Update the time slow state each frame.
             * Called from the game loop before other updates.
             * @returns {boolean} Whether to skip this frame's update
             */
            updateTimeSlow() {
                const ts = this.timeSlowState;
                
                if (!ts.active) return false;
                
                // Smoothly interpolate to target scale
                if (ts.scale !== ts.targetScale) {
                    ts.scale += (ts.targetScale - ts.scale) * ts.transitionSpeed;
                    // Snap if close enough
                    if (Math.abs(ts.scale - ts.targetScale) < 0.01) {
                        ts.scale = ts.targetScale;
                    }
                }
                
                // Count down duration (in real frames, not slowed)
                ts.duration--;
                
                // When duration expires, transition back to normal
                if (ts.duration <= 0) {
                    ts.targetScale = 1.0;
                    // Check if we've returned to normal
                    if (ts.scale >= 0.99) {
                        ts.scale = 1.0;
                        ts.active = false;
                        return false;
                    }
                }
                
                // Frame skipping based on time scale
                // At 0.4 scale, we run ~40% of frames
                // Use a random threshold for smooth appearance
                if (Math.random() > ts.scale) {
                    return true; // Skip this frame's game logic
                }
                
                return false;
            },
            
            triggerDeathSequence() {
                const ds = document.getElementById('death-screen');
                const off = document.getElementById('death-text-off');
                const on = document.getElementById('death-text-on');
                
                // 1. Show OFFLINE (Red/Gray on Black 80%)
                ds.style.display = 'flex';
                ds.classList.remove('respawn');
                off.style.display = 'block';
                on.style.display = 'none';
                
                // 2. Wait 1.5s -> Switch to ONLINE (Cyan/Black on White 50%)
                setTimeout(() => {
                    ds.classList.add('respawn'); // Turns BG white
                    off.style.display = 'none';
                    on.style.display = 'block';
                    
                    // 3. Respawn & Reset
                    setTimeout(() => {
                        ds.style.display = 'none';
                        // Logic to teleport player to Ethereal Plane or Checkpoint goes here
                        const rs = (MAP_DATA.medbay_sw && MAP_DATA.medbay_sw.respawn) || { x: 212, y: 328 };
                        this.loadMap('medbay_sw', { x: rs.x, y: rs.y }); // Wake up in Dr. Yin's clinic
                        this.playerHealth = 100;
                        this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Sync with entity
                        this.updateUI();
                    }, 1000);
                }, 1500);
            },


            /**
             * Is a decimated subsystem due to run this step?
             * @param {number} interval  Run every Nth step (1 = every step).
             * @param {number} phase     Per-agent offset so load spreads evenly.
             */
            simDue(interval, phase = 0) {
                if (!CONFIG.SIM.DECIMATE || interval <= 1) return true;
                return ((this.simStep + phase) % interval) === 0;
            },

            resize() { 
                /* ── INTERNAL RENDER SCALE ──────────────────────────────────────
                   The backing store is sized to displaySize × resolutionScale
                   while the CSS box stays at full display size, so the browser
                   upscales the result on the GPU for free. At scale 1.0 this is
                   byte-for-byte the old behaviour.

                   Note the engine never handled devicePixelRatio, so on a DPR-3
                   phone it was ALREADY rendering ~1/9 of the device's pixels and
                   letting the compositor upscale. This just makes that ratio
                   explicit and controllable instead of accidental. */
                const scale = Math.max(0.25, Math.min(1, GameSettings.resolutionScale || 1));
                const cssW = window.innerWidth, cssH = window.innerHeight;
                const bufW = Math.max(1, Math.round(cssW * scale));
                const bufH = Math.max(1, Math.round(cssH * scale));

                this.canvas.width = bufW;
                this.canvas.height = bufH;
                // Pin the presented size so the buffer stretches to fill the screen.
                this.canvas.style.width = cssW + 'px';
                this.canvas.style.height = cssH + 'px';
                this._renderScale = scale;
                
                // Apply Fidelity Scale — lightingScale composes with the render
                // scale rather than multiplying against it, so 'low' lighting at
                // 0.5 render scale doesn't end up at quarter resolution.
                // (drawLightingSystem also halves it for soft shadows, and keeps it in step)
                this.lightCanvas.width = Math.max(1, Math.round(bufW * this.lightingScale)); 
                this.lightCanvas.height = Math.max(1, Math.round(bufH * this.lightingScale));
                
                // Weather spawns and its full-screen overlay work in backing-store
                // pixels, not CSS pixels — pass the buffer size or rain lands in
                // the wrong place the moment scale ≠ 1.
                this.weather.resize(bufW, bufH);
                
                // (Lamp shadow shapes are in world space: no rebake needed on resize.)

                // A phone on its side: short and wide. Everything landscape keys off this one class
                // (styles/landscape.css); portrait never sees it.
                const land = cssW > cssH && cssH <= 540;
                this.isLandscape = land;
                document.body.classList.toggle('landscape', land);
                document.documentElement.style.setProperty('--phone-scale', land ? Math.min(1, (cssH - 24) / 600).toFixed(3) : '1');
            },

            fireWeapon() {
                // 1. VISIBILITY CHECKS
                if (!this.player.visible && !this.isDriving) return;
                if (this.paused) return;
                if (!this.currentWeapon && this.weaponMode !== 'none') return;
            
                // --- MELEE / PUNCH LOGIC (Unchanged) ---
                if (this.weaponMode === 'none') {
                    this.shootCooldown = CONFIG.PUNCH.DURATION_TICKS;
                    // Toggle Punch Side
                    this.player.punchSide = (this.player.punchSide === 'right') ? 'left' : 'right';
                    const punchAngle = this.player.angle;
                    
                    const px = this.player.x + Math.cos(punchAngle) * 20;
                    const py = this.player.y + Math.sin(punchAngle) * 20;
                    
                    this.emitNoise(this.player.x, this.player.y, CONFIG.NOISE.punch, 'punch');
                    this.projectiles.push(new ProjectileEntity({
                        x: px, y: py, 
                        angle: punchAngle, 
                        isEnemy: false, 
                        owner: this.player, 
                        color: 'rgba(0,0,0,0)', // Invisible hitbox
                        radius: 15, speed: 10, life: 5, damage: Math.round(this.resonance.stat('punchDamage', 15)), mass: 50,
                        melee: true
                    }));
                    this.triggerShake(2);
                    return;
                }
            
                // --- GENERIC WEAPON LOGIC ---
                const stats = this.currentWeapon.stats || {};
                
                // 1. Apply Stats (Recoil & Cooldown)
                this.shootCooldown = Math.max(2, Math.round(this.resonance.stat('fireCooldown', stats.fireRate || 20) * (this.augments.isEquipped('fast_reload') ? 0.8 : 1)));
                this.triggerShake(stats.recoil || 5);
                audioSys.sfx('shoot');
            
                // 2. Calculate Spawn Position & Angle
                let px, py, angle = this.player.angle;
                const onFoot = !(this.isDriving && this.car);

                // On foot: leave from the drawn muzzle and converge on the aim point — the same
                // line the laser sight draws (see getLaserSight). Spread is applied after.
                if (onFoot && this.player._muzzleLocal) {
                    const ap = this.player._aimPoint;
                    const shot = aimFromMuzzle(this.player, this.player.angle, ap ? ap.x : undefined, ap ? ap.y : undefined);
                    px = shot.x; py = shot.y; angle = shot.angle;
                }
            
                // Handle "Scatter" (Anavia) defined in stats, or specific ID check fallback
                // You can add 'spread: 0.2' to your item stats to make this generic too!
                if (this.currentWeapon.id === 'pistol_anavia' || stats.spread) {
                    const magnitude = this.resonance.stat('spread', stats.spread || 0.22);
                    angle += (Math.random() - 0.5) * magnitude;
                }
            
                // Offset based on Vehicle vs On-Foot
                if (!onFoot) {
                    const offset = this.car.length / 2 + 10;
                    px = this.car.x + Math.cos(angle) * offset;
                    py = this.car.y + Math.sin(angle) * offset;
                } else if (px === undefined) {
                    // No weapon drawn yet (first frame): old hand offset (right side bias)
                    px = this.player.x + Math.cos(angle) * 15 + Math.cos(angle + Math.PI/2) * 5;
                    py = this.player.y + Math.sin(angle) * 15 + Math.sin(angle + Math.PI/2) * 5;
                }
            
                // 3. Resolve Projectile Properties
                // Pull from stats or use safe defaults
                const shotColor  = stats.projectileColor || '#00f3ff';
                const shotSpeed  = stats.projectileSpeed || 25;
                // Arms: Hollow Points; Flit: Flit-Strike (shots just after a flit); Arms: Quick-Draw (first shot after drawing)
                let shotDamage = this.resonance.stat('gunDamage', stats.damage || 35);
                if (_gameTimeSec - this.flitState.lastFlitAt <= 1) shotDamage *= 1 + 0.2 * this.resonance.rank('flit_strike');
                if (this._drawnAt !== undefined && _gameTimeSec - this._drawnAt <= 0.8 && !this._drawShotUsed) { shotDamage *= 1 + 0.25 * this.resonance.rank('quick_draw'); this._drawShotUsed = true; }
                shotDamage = Math.round(shotDamage);
                const shotLife   = stats.projectileLife || 60;
                const isPenetrating = stats.penetrating || false;
                
                // Determine if this should look like a sniper shot (Long trail + core)
                // Check if mode is 'sniper' OR if the weapon id contains 'sniper'
                const isSniperVisual = this.weaponMode === 'sniper' || (this.currentWeapon.id && this.currentWeapon.id.includes('sniper'));
            
                // 4. Spawn Projectile
                this.projectiles.push(new ProjectileEntity({
                    x: px, 
                    y: py, 
                    angle: angle, 
                    isEnemy: false, 
                    owner: this.player, 
                    
                    // Dynamic Stats
                    color: shotColor, 
                    speed: shotSpeed, 
                    damage: shotDamage, 
                    life: shotLife,
                    
                    // Special Properties
                    penetrating: isPenetrating, 
                    isSniper: isSniperVisual,    // Tells draw() to render the long trail
                    
                    // Sticky DOT (Golden Child)
                    sticky: stats.sticky || false,
                    dotDamage: stats.dotDamage || 5,
                    dotTicks: stats.dotTicks || 12,
                    dotInterval: stats.dotInterval || 10
                }));
            
                // Gunfire carries: gangers in earshot come to look (engine/noise.js)
                { const N = CONFIG.NOISE, id = (this.currentWeapon && this.currentWeapon.id) || '';
                  this.emitNoise(this.player.x, this.player.y, isSniperVisual || id.includes('sniper') ? N.sniper : id.includes('rifle') ? N.rifle : N.pistol, 'shot'); }

                // 5. Spawn Muzzle Flash
                this.muzzleFlashes.push({ 
                    x: px, 
                    y: py, 
                    radius: stats.flashRadius || 50, 
                    color: shotColor, // Flash matches bullet color
                    life: 3 
                });
            },

            // Inside GameEngine class
            
            createImpactDust(x, y) {
                // ALTERNATE VERSION: Uses addSpray for visible black impact debris
                // We create a radial puff by triggering multiple sprays in a circle
                const bursts = 8;
                
                for(let i = 0; i < bursts; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    
                    // NOTE: addSpray requires speed > 2 to spawn anything.
                    // We pass 10 to guarantee particles spawn. 
                    // (Internal particle velocity is randomized by addSpray independently)
                    const triggerSpeed = 10;
                    
                    this.weather.addSpray(
                        x, 
                        y, 
                        angle, 
                        triggerSpeed, 
                        'rgba(50, 50, 55, 0.7)', // Lighter "Charcoal" (visible on dark roads)
                        6.0,                     // Count Multiplier (3x density for a thick cloud)
                        4.0                      // Life Multiplier (Lingers 2x longer)
                    );
                }
            },

            
            


            /* =========================================================
               BOOSTER/STIM USAGE
               ---------------------------------------------------------
               Healing items restore 50 HP when used.
               Boosters are limited - refilled at clinics/checkpoints.
               ========================================================= */
            /**
             * Effective max booster count, factoring in VITAL LINK augment.
             */
            getEffectiveMaxBoosters() {
                let max = this.maxBoosters;
                if (this.augments && this.augments.isEquipped('vital_link')) max += 2;
                return max;
            },
            
            useBooster() {
                if (this.playerHealth >= this.maxPlayerHealth) { 
                    showMessage("HEALTH FULL"); 
                    return; 
                }
                if (this.boosterCount > 0) { 
                    this.boosterCount--; 
                    this.playerHealth = Math.min(this.playerHealth + this.resonance.stat('stimHeal', 50), this.maxPlayerHealth);
                    this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Sync with entity
                    this.updateUI(); // Updates health bar AND booster count
                    showMessage("STIM PACK USED. HP RESTORED."); 
                } else { 
                    showMessage("NO BOOSTERS REMAINING."); 
                }
            },
            
            /**
             * Share a stim with the nearest damaged teammate.
             * Hold heal button (300ms+) or press J to trigger.
             * Costs 1 booster from the player's supply.
             */
            useBoosterOnAlly() {
                if (this.boosterCount <= 0) {
                    showMessage("NO BOOSTERS TO SHARE.");
                    return;
                }
                
                // Find nearest damaged, recruited teammate within range
                let nearestTm = null;
                let nearestDist = 200; // Must be within 200px
                
                for (let tm of this.teammates) {
                    if (!tm.recruited || tm.dead || tm.inCar) continue;
                    if (tm.hp >= tm.maxHp) continue; // Skip full HP
                    const d = Math.hypot(this.player.x - tm.x, this.player.y - tm.y);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestTm = tm;
                    }
                }
                
                if (!nearestTm) {
                    showMessage("NO WOUNDED ALLIES NEARBY.");
                    return;
                }
                
                // Use player's booster on the teammate
                this.boosterCount--;
                nearestTm.heal(50);
                this.updateUI();
                showMessage(`STIM SHARED WITH ${nearestTm.name.toUpperCase()}. (+50 HP)`);
                
                // Visual feedback — green flash on the teammate
                nearestTm.invincibleTimer = 10;
            },
            
            /* =========================================================
               STIM REFILL (Clinic/Checkpoint)
               ---------------------------------------------------------
               Fully restores health and refills all boosters.
               Called at medical stations and respawn points.
               ========================================================= */
            refillStims() {
                this.boosterCount = this.getEffectiveMaxBoosters();
                this.playerHealth = this.maxPlayerHealth;
                this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);
                
                // Refill teammate stims too
                if (this.teammates) {
                    for (let tm of this.teammates) {
                        if (tm.recruited && tm.maxTeammateStims) {
                            tm.teammateStims = tm.maxTeammateStims;
                            tm.heal(tm.maxHp); // Full heal at clinic
                        }
                    }
                }
                
                this.updateUI();
                showMessage("STIMS REFILLED & VITALS NORMALIZED. ALLIES RESTORED.");
            },

            /* =========================================================
               DAMAGE SYSTEM
               ---------------------------------------------------------
               Called when player takes damage from enemies/hazards.
               Now delegates to PlayerEntity for unified damage handling.
               FLIT ability grants brief invulnerability.
               Death triggers respawn at nearest medbay.
               ========================================================= */
            damagePlayer(amount) {
                // Apply augment damage reduction
                if (this.augments && this.augments.isEquipped('armor_plate')) {
                    amount = Math.floor(amount * 0.8); // 20% reduction
                }
                
                // Shield absorption (any buff with active shield)
                const shieldBuff = this.player.buffSystem.getShieldBuff();
                if (shieldBuff) {
                    if (amount <= shieldBuff.shield) {
                        shieldBuff.shield -= amount;
                        // Visual feedback — gold flash
                        this.triggerShake(2);
                        this.updateUI();
                        return; // Shield absorbed all damage
                    } else {
                        // Shield breaks — remaining damage goes to HP
                        amount -= shieldBuff.shield;
                        shieldBuff.shield = 0;
                        showMessage("GOLDEN SHIELD BROKEN.");
                        this.triggerShake(6);
                        this.updateUI();
                    }
                }
                
                // Delegate to PlayerEntity - it handles FLIT invulnerability,
                // health tracking, UI updates, and death/respawn
                this.player.takeDamage(amount);
                
                // Larissa flit hint: first time player takes damage while enemies are telegraphing
                if (!this.questState.larissa_flit_hint && this.story && this.enemies.length > 0) {
                    const anyTelegraphing = this.enemies.some(e => e.isTelegraphing && !e.dead);
                    if (anyTelegraphing) {
                        this.questState.larissa_flit_hint = true;
                        setTimeout(() => {
                            this.story.triggerComms("LARISSA", "You saw it coming. The flit is faster than they are.", 5000);
                        }, 1200);
                    }
                }
            },
            
        });

