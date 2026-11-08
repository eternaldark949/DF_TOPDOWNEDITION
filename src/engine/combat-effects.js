        // GameEngine — Screen shake, time slow, death, resize, firing, boosters, player damage.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        const _muzzleStars = new Map();
        /** A muzzle flash's star (96×48, its centre at 24,24, the long spike forward along +x) in `color`. */
        function muzzleStarSprite(color) {
            let cv = _muzzleStars.get(color);
            if (cv) return cv;
            cv = canvasKit.createLayer([96, 48]).canvas;
            const c = cv.getContext('2d'), rgb = /^#[0-9a-f]{6}$/i.test(color) ? hexToRgb(color) : '255, 204, 136';
            const spike = (x0, y0, x1, y1, w) => {                          // a tapered spike from (x0,y0) to (x1,y1)
                const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
                c.beginPath(); c.moveTo(x0 + nx, y0 + ny); c.lineTo(x1, y1); c.lineTo(x0 - nx, y0 - ny); c.closePath(); c.fill();
            };
            const g = c.createRadialGradient(24, 24, 0, 24, 24, 22);
            g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(0.3, `rgba(${rgb}, 0.9)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g; c.fillRect(0, 0, 48, 48);
            c.fillStyle = `rgba(${rgb}, 0.95)`;
            spike(24, 24, 96, 24, 7); spike(24, 24, 60, 8, 4); spike(24, 24, 60, 40, 4); spike(24, 24, 24, 4, 3.5); spike(24, 24, 24, 44, 3.5);
            c.fillStyle = 'rgba(255, 255, 255, 0.95)'; spike(24, 24, 70, 24, 3); c.beginPath(); c.arc(24, 24, 5, 0, Math.PI * 2); c.fill();
            _muzzleStars.set(color, cv);
            return cv;
        }

        const _puffs = new Map();
        /** A soft round puff (64×64) in `color`, for barrel smoke and golden wisps. */
        function puffSprite(color) {
            return canvasKit.bake(_puffs, color, () => {
                const rgb = /^#[0-9a-f]{6}$/i.test(color) ? hexToRgb(color) : '220, 210, 225';
                return canvasKit.glow([64, [[0, `rgba(${rgb}, 0.9)`], [0.45, `rgba(${rgb}, 0.45)`], [1, `rgba(${rgb}, 0)`]]]);
            });
        }

        engineMixin({
            /**
             * A spent casing flies from the gun's ejection port (to the right of the barrel, a little
             * back), spins and settles, and lies there glinting like a fleck of glitter in the gun's
             * colour (its model's `brass`, ui/weapon-models.js; none for energy guns). As it lands it
             * scatters two finer flecks, and it lingers (CONFIG-free: 25 s, at most 60, oldest first).
             */
            spawnCasing(x, y, angle, weaponId) {
                const col = weaponId ? weaponModel(weaponId).brass : null;
                if (!col || (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2)) return;
                const c = Math.cos(angle), s = Math.sin(angle);
                const sniper = weaponId.includes('sniper'), back = sniper ? 30 : 8, v = 1.7 + Math.random() * 1.1;
                this.effects.spawn('casing', { x: x - c * back, y: y - s * back, vx: -s * v - c * (0.35 + Math.random() * 0.4), vy: c * v - s * (0.35 + Math.random() * 0.4),
                         a: angle, spin: (Math.random() - 0.5) * 0.9, t: 0, big: sniper, col, ph: Math.random() * 6.28, rate: 0.004 + Math.random() * 0.005 });
            },
            /**
             * A gun's signature beyond the flash (its model's `fx`, ui/weapon-models.js), at every shot:
             * casings for the guns that throw them, a trail tag on the shot for the guns that don't
             * (crackle / static / wisp: entities/actors.js), and smoke or embers off the barrel.
             */
            weaponFx(x, y, angle, weaponId, shot, shooter) {
                this.spawnCasing(x, y, angle, weaponId);
                const fx = weaponId ? weaponModel(weaponId).fx : null;
                if (!fx || (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2)) return;
                if (fx.trail && shot) { shot.fxTrail = fx; shot.trail = []; }
                if (fx.barrel) {
                    if (fx.after) {                                                      // only once the gun's been worked hard
                        const o = shooter || this.player, now = _gameTimeSec;
                        o._streak = (now - (o._streakT || -9) < 0.6 ? (o._streak || 0) : 0) + 1; o._streakT = now;
                        if (o._streak < fx.after) return;
                    }
                    const c = Math.cos(angle), s = Math.sin(angle), E = this.effects;
                    if (fx.barrel === 'smoke') {
                        for (let i = 0; i < 6; i++) E.spawn('barrel', { k: 'smoke', x: x + c * (2 + i * 1.5), y: y + s * (2 + i * 1.5), vx: c * 0.22 + (Math.random() - 0.5) * 0.2, vy: s * 0.22 + (Math.random() - 0.5) * 0.2,
                                                             t: -i * 7, life: 64, r: 0.9, col: fx.col, ph: Math.random() * 6.28 });
                    } else if (fx.barrel === 'embers') {
                        for (let i = 0; i < 7; i++) { const a = angle + (Math.random() - 0.5) * 1.6, v = 0.4 + Math.random() * 1.1;
                            E.spawn('barrel', { k: 'ember', x: x + c * 2, y: y + s * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 30 + Math.random() * 25, col: Math.random() < 0.35 ? fx.hot : fx.col, ph: Math.random() * 6.28 }); }
                    }
                }
            },
            /** A golden wisp puff behind a 'wisp' shot (called by the shot as it flies). */
            spawnWisp(x, y, fx) {
                if (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2) return;
                const E = this.effects;
                E.spawn('barrel', { k: 'wisp', x, y, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, t: 0, life: 50, r: 3, col: fx.col, ph: Math.random() * 6.28 });
                if (Math.random() < 0.85) E.spawn('barrel', { k: 'dust', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, t: 0, life: 36, col: fx.dust, ph: Math.random() * 6.28 });
            },
            /** Lay flames along the distance actually flown, including the hand's starting point. */
            emitFireTrail(shot, x0, y0, x1, y1) {
                if (!shot.isFireball || !shot.active || shot.markedForDestroy) return;
                // Flames stop at the wall the fireball meets this step (it's destroyed in the collision pass after)
                const map = this.activeMap;
                if (map && collisionWorld.lineBlocked(x0, y0, x1, y1, map.walls, getColliders(map))) {
                    let lo = 0, hi = 1;
                    for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (collisionWorld.lineBlocked(x0, y0, x0 + (x1 - x0) * m, y0 + (y1 - y0) * m, map.walls, getColliders(map))) hi = m; else lo = m; }
                    x1 = x0 + (x1 - x0) * lo; y1 = y0 + (y1 - y0) * lo;
                }
                const dx = x1 - x0, dy = y1 - y0, distance = Math.hypot(dx, dy);
                if (distance < 0.001) return;
                const now = _gameTimeMs();
                const angle = Math.atan2(dy, dx);
                const add = (x, y, born) => {
                    this._fireTrailSerial = ((this._fireTrailSerial || 0) + 1) >>> 0;
                    const seed = (this._fireTrailSerial * 0.61803398875) % 1;
                    this.effects.spawn('flame', { x, y, born, life: 1500 + seed * 300, seed, angle });
                };
                if (!shot._fireTrailStarted) {
                    shot._fireTrailStarted = true; shot._fireTrailGap = 0;
                    add(x0, y0, now - CONFIG.LOOP.STEP_MS);
                }
                // Interpolate emission points at high speed; frame spacing must not leave holes.
                const gap = shot._fireTrailGap || 0;
                for (let d = FIRE_TRAIL_SPACING - gap; d <= distance; d += FIRE_TRAIL_SPACING) {
                    const u = d / distance;
                    add(x0 + dx * u, y0 + dy * u, now - CONFIG.LOOP.STEP_MS * (1 - u));
                }
                shot._fireTrailGap = (gap + distance) % FIRE_TRAIL_SPACING;
            },
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
             * @param {{inMs: number, outMs: number}} [ramp] - Timed ramps on real ms instead of the
             *   exponential ease: in on an ease-out cubic (a brake that lands softly), hold, then
             *   out on a smoothstep (it builds gently and settles). The finisher uses this.
             */
            triggerTimeSlow(slowPercent = 0.4, durationSeconds = 4, smoothTransition = true, ramp = null) {
                this.timeSlowState.active = true;
                this.timeSlowState.ramp = ramp ? { inMs: ramp.inMs, outMs: ramp.outMs, phase: 'in', t: 0, from: this.timeSlowState.scale } : null;
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
            
            /** Ease time back to normal now, from wherever it is, over outMs (real ms): a smoothstep */
            endTimeSlow(outMs = 300) {
                const ts = this.timeSlowState; if (!ts.active) return;
                ts.duration = 0; ts.targetScale = 1;
                ts.ramp = { inMs: 0, outMs, phase: 'out', t: 0, from: ts.scale };
            },

            /**
             * Advance the time slow by one rendered frame (real ms) and return the
             * time scale. The loop stretches its tick length by 1/scale, so slowed
             * ticks stay evenly spaced and RenderInterp blends them: smooth slow
             * motion, not dropped frames. It holds still while paused.
             * @param {number} elapsedMs - real time since the last frame
             * @returns {number} the time scale (1 = normal)
             */
            updateTimeSlow(elapsedMs = CONFIG.LOOP.STEP_MS) {
                const ts = this.timeSlowState;
                if (!ts.active || this.paused) return ts.active ? ts.scale : 1;
                const f = elapsedMs / CONFIG.LOOP.STEP_MS;                 // in 60 Hz frames
                const R = ts.ramp;
                if (R) {                                                   // timed ramps (real ms): in, hold, out
                    R.t += elapsedMs;
                    if (R.phase === 'in') {
                        const u = Math.min(1, R.t / Math.max(1, R.inMs)), e = 1 - Math.pow(1 - u, 3);
                        ts.scale = R.from + (ts.targetScale - R.from) * e;
                        if (u >= 1) { R.phase = 'hold'; ts.scale = ts.targetScale; }
                    }
                    ts.duration -= f;
                    if (R.phase !== 'out' && ts.duration <= 0) { R.phase = 'out'; R.t = 0; R.from = ts.scale; }
                    if (R.phase === 'out') {
                        const u = Math.min(1, R.t / Math.max(1, R.outMs)), e = u * u * (3 - 2 * u);
                        ts.scale = R.from + (1 - R.from) * e;
                        if (u >= 1) { ts.scale = 1; ts.targetScale = 1; ts.active = false; ts.ramp = null; }
                    }
                    return ts.scale;
                }
                if (ts.scale !== ts.targetScale) {
                    // the share of the gap closed per 60 Hz frame, made the same at any frame rate
                    ts.scale += (ts.targetScale - ts.scale) * (1 - Math.pow(1 - Math.min(1, ts.transitionSpeed), f));
                    if (Math.abs(ts.scale - ts.targetScale) < 0.01) ts.scale = ts.targetScale;
                }
                ts.duration -= f;                                          // real time, not slowed
                if (ts.duration <= 0) {
                    ts.targetScale = 1.0;
                    if (ts.scale >= 0.99) { ts.scale = 1.0; ts.active = false; }
                }
                return ts.scale;
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
                // Match the final draw size so resize does not allocate a larger buffer first.
                const lightScale = this.lightingScale * (GameSettings.softShadows ? 0.5 : 1) * this._lightingAdaptiveScale();
                const lightW = Math.max(1, Math.round(bufW * lightScale));
                const lightH = Math.max(1, Math.round(bufH * lightScale));
                if (this.lightCanvas.width !== lightW || this.lightCanvas.height !== lightH) {
                    this.lightCanvas.width = lightW; this.lightCanvas.height = lightH;
                }
                
                // Weather spawns and its full-screen overlay work in backing-store
                // pixels, not CSS pixels — pass the buffer size or rain lands in
                // the wrong place the moment scale ≠ 1.
                this.weather.resize(bufW, bufH);
                
                // (Lamp shadow shapes are in world space: no rebake needed on resize.)

                // A phone on its side: short and wide. Everything landscape keys off this one class
                // (styles/landscape.css); portrait never sees it. Browser zoom changes the CSS height
                // (a 411px-tall phone reads 548px at 75%), but not the shape: a touch screen at least
                // 1.7× as wide as tall is a phone on its side at any zoom. With the Orientation setting on
                // Landscape, any wide screen takes the landscape layout.
                const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
                const land = cssW > cssH && (cssH <= 540 || GameSettings.orientation === 'landscape' || (coarse && cssW / cssH >= 1.7));
                this.isLandscape = land;
                document.body.classList.toggle('landscape', land);
                // The HUD scales with the screen's height (--hud, styles/landscape.css), so it keeps the
                // same places and share of the screen at any zoom. 548px tall is 1:1 (a phone at 75% zoom);
                // with a mouse (a desktop window) it never grows past 1:1.
                this.hudScale = land ? Math.max(0.4, Math.min(coarse ? 2 : 1, cssH / 548)) : 1;
                document.documentElement.style.setProperty('--hud', this.hudScale.toFixed(3));
                if (typeof phoneSystem !== 'undefined') phoneSystem.fit();   // the phone turns and scales to fit (ui/phone.js)
            },

            fireWeapon() {
                if ((this._quickDraw && !this._quickDrawFiring) || (this.weaponHolstered && !this.isDriving)) return;
                // 1. VISIBILITY CHECKS
                if (!this.player.visible && !this.isDriving) return;
                if (this.paused) return;
                if (this.furniture && this.furniture.busy()) return;   // her hands are on the furniture
                if (!this.currentWeapon && this.weaponMode !== 'none' && this.weaponMode !== 'fists') return;
                // Fists or a blade at an unaware back: the strike is an execution (engine/executions.js)
                if ((this.weaponMode === 'none' || this.weaponMode === 'fists' || this.weaponMode === 'melee') && this._execTarget && !this.isDriving) { this.execute(this._execTarget); return; }
                this.shotsFired = (this.shotsFired || 0) + 1;             // (a finisher steps aside when she fires again)
                if (this.weaponMode === 'melee') { if (!this.isDriving) this.meleeSlash(); return; }   // a blade (engine/status-effects.js)
                if (this.weaponMode === 'fists') { this.knucklePunch(); return; }                       // Golden Retribution (engine/knuckles.js)
            
                // --- MELEE / PUNCH LOGIC (Unchanged) ---
                if (this.weaponMode === 'none') {
                    this.shootCooldown = this._punchDur = CONFIG.PUNCH.DURATION_TICKS;
                    // Toggle Punch Side
                    this.player.punchSide = (this.player.punchSide === 'right') ? 'left' : 'right'; this.player.punchHay = false;
                    const punchAngle = this.player.angle;
                    
                    const px = this.player.x + Math.cos(punchAngle) * 20;
                    const py = this.player.y + Math.sin(punchAngle) * 20;
                    
                    this.emitNoise(this.player.x, this.player.y, CONFIG.NOISE.punch, 'punch');
                    const punchCrit = this.rollCrit(null);                // a punch can crit too (engine/combat-fx.js)
                    this.projectiles.push(new ProjectileEntity({
                        x: px, y: py, 
                        angle: punchAngle, 
                        isEnemy: false, 
                        owner: this.player, 
                        color: 'rgba(0,0,0,0)', // Invisible hitbox
                        radius: 15, speed: 10, life: 5, damage: Math.round(this.resonance.stat('punchDamage', 15) * punchCrit * this.playerDamageMult()), mass: 50,
                        melee: true
                    }));
                    this.projectiles[this.projectiles.length - 1].crit = punchCrit > 1;
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
                const shotGeometry = this.getPlayerShotGeometry();
                px = shotGeometry.x; py = shotGeometry.y; angle = shotGeometry.angle;

                // Handle "Scatter" (Anavia) defined in stats, or specific ID check fallback
                // You can add 'spread: 0.2' to your item stats to make this generic too!
                if (this.currentWeapon.id === 'pistol_anavia' || stats.spread) {
                    const magnitude = this.resonance.stat('spread', stats.spread || 0.22);
                    angle += (Math.random() - 0.5) * magnitude;
                }
            
                // 3. Resolve Projectile Properties
                // Pull from stats or use safe defaults
                const shotColor  = stats.projectileColor || '#00f3ff';
                const shotSpeed  = stats.projectileSpeed || 25;
                // Arms: Hollow Points; Flit: Flit-Strike (shots just after a flit); Arms: Quick-Draw (first shot after drawing)
                let shotDamage = this.resonance.stat('gunDamage', stats.damage || 35);
                if (_gameTimeSec - this.flitState.lastFlitAt <= this.resonance.flitStrikeWindow()) shotDamage *= 1 + this.resonance.value('flit_strike', 'damage') * this.resonance.rank('flit_strike');
                if (this._drawnAt !== undefined && _gameTimeSec - this._drawnAt <= this.resonance.value('quick_draw', 'window') && !this._drawShotUsed) { shotDamage *= 1 + this.resonance.value('quick_draw', 'damage') * this.resonance.rank('quick_draw'); this._drawShotUsed = true; }
                shotDamage *= this.gunDamageMult();                      // the Bloodthirsty Muzzle, the Mirrored Glass (engine/status-effects.js)
                const shotCrit = this.rollCrit(stats);                   // a critical hit (engine/combat-fx.js)
                // A Golden Child orb burns with the shot: its every boost (Hollow Points, Flit-Strike, Quick-Draw, the
                // Muzzle and the Glass) and its crit, snapshot now
                const shotBoost = shotDamage * shotCrit / (stats.damage || 35);
                shotDamage = Math.round(shotDamage * shotCrit);
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
                    dotDamage: Math.round((stats.dotDamage || 5) * shotBoost),
                    dotTicks: stats.dotTicks || 12,
                    dotInterval: stats.dotInterval || 10
                }));
                this.projectiles[this.projectiles.length - 1].crit = shotCrit > 1;
                this.projectiles[this.projectiles.length - 1].maxOrbs = stats.maxOrbs || 4;
            
                // Gunfire carries: gangers in earshot come to look (engine/noise.js)
                { const N = CONFIG.NOISE, id = (this.currentWeapon && this.currentWeapon.id) || '';
                  const reach = isSniperVisual || id.includes('sniper') ? N.sniper : id.includes('rifle') ? N.rifle : N.pistol;
                  this.emitNoise(this.player.x, this.player.y, this.resonance.stat('gunNoise', reach), 'shot'); }
                this._loudUntil = _gameTimeSec + 10;                     // she's fired: the crew is weapons free (engine/sneak.js)

                // 5. Spawn Muzzle Flash
                this.effects.spawn('muzzle', { 
                    x: px, 
                    y: py, 
                    radius: stats.flashRadius || 50, 
                    color: shotColor, // Flash matches bullet color
                    life: 3,
                    angle
                });
                this.weaponFx(px, py, angle, this.currentWeapon.id, this.projectiles[this.projectiles.length - 1], this.player);
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
                if (!this.running || this.paused || hudInputBlocked()) return;
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
                if (!this.running || this.paused || hudInputBlocked()) return;
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
                        game_timers.after(1.2, () => {
                            this.story.triggerComms("LARISSA", "You saw it coming. The flit is faster than they are.", 5000);
                        }, 'world');
                    }
                }
            },
            
        });

