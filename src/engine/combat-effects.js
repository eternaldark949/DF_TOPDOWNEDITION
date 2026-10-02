        // GameEngine — Screen shake, time slow, death, resize, firing, boosters, player damage.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        const _muzzleStars = new Map();
        /** A muzzle flash's star (96×48, its centre at 24,24, the long spike forward along +x) in `color`. */
        function muzzleStarSprite(color) {
            let cv = _muzzleStars.get(color);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = 96; cv.height = 48;
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
            let cv = _puffs.get(color);
            if (cv) return cv;
            cv = document.createElement('canvas'); cv.width = cv.height = 64;
            const c = cv.getContext('2d'), rgb = /^#[0-9a-f]{6}$/i.test(color) ? hexToRgb(color) : '220, 210, 225';
            const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 0.9)`); g.addColorStop(0.45, `rgba(${rgb}, 0.45)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g; c.fillRect(0, 0, 64, 64);
            _puffs.set(color, cv);
            return cv;
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
                const L = this.casings || (this.casings = []), c = Math.cos(angle), s = Math.sin(angle);
                const sniper = weaponId.includes('sniper'), back = sniper ? 30 : 8, v = 1.7 + Math.random() * 1.1;
                L.push({ x: x - c * back, y: y - s * back, vx: -s * v - c * (0.35 + Math.random() * 0.4), vy: c * v - s * (0.35 + Math.random() * 0.4),
                         a: angle, spin: (Math.random() - 0.5) * 0.9, t: 0, big: sniper, col, ph: Math.random() * 6.28, rate: 0.004 + Math.random() * 0.005 });
                while (L.length > 60) L.shift();
            },
            updateCasings() {
                const L = this.casings;
                if (!L || !L.length) return;
                for (let i = L.length - 1; i >= 0; i--) {
                    const k = L[i]; k.t++;
                    if (k.t < 26) { k.x += k.vx; k.y += k.vy; k.vx *= 0.86; k.vy *= 0.86; k.a += k.spin; k.spin *= 0.9; }
                    else if (k.t === 26) {                                               // landed: two finer flecks, and the lamp it lies under
                        k.sub = [(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5];
                        this._casingLamp(k);
                    }
                    if (k.t > 1500) L.splice(i, 1);
                }
            },
            /** Once, as a casing lands: the nearest lamp whose pool it lies in lends it its colour (k.lc) and strength (k.lk). */
            _casingLamp(k) {
                let best = null, bk = 0;
                const consider = (l) => {
                    if (!l || l._forcedOff) return;
                    const r = (l.radius || 200) * 0.6, d = Math.hypot(l.x - k.x, l.y - k.y);
                    if (d < r) { const s = 1 - d / r; if (s > bk) { bk = s; best = l; } }
                };
                for (const l of this.lamps || []) consider(l);
                for (const l of (this.activeMap && this.activeMap._interiorLights) || []) consider(l);
                if (best && /^#[0-9a-f]{6}$/i.test(best.color || '')) { k.lc = best.color; k.lk = bk; }
            },
            /**
             * Casings on the ground (after decals, under everyone) as glitter: a fleck in the gun's colour
             * that twinkles on its own rhythm, and at the top of each twinkle a four-point glint. Under a
             * burning lamp it catches that lamp's light: it twinkles brighter and oftener, the glint in the lamp's colour.
             */
            drawCasings(ctx, cb) {
                const L = this.casings;
                if (!L || !L.length || _zoomLOD >= 1) return;
                const day = this._lampDaylight ?? 0, night = Math.max(0, Math.min(1, (0.35 - day) / 0.15));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.lineCap = 'round';
                for (const k of L) {
                    if (k.x < cb.left || k.x > cb.right || k.y < cb.top || k.y > cb.bottom) continue;
                    const fade = k.t > 1380 ? (1500 - k.t) / 120 : 1, spin = k.t < 26 ? 1 : 0;
                    const lit = k.lc ? k.lk * night : 0;                                // how much lamp light it catches
                    const tw = Math.pow(Math.abs(Math.sin(_frameTime * k.rate * (1 + lit * 1.5) + k.ph)), 6 - lit * 3), s = k.big ? 1.3 : 1;
                    ctx.globalAlpha = fade * (0.45 + 0.55 * Math.max(tw, spin * 0.7)) * (1 + lit * 0.4);
                    ctx.fillStyle = k.col;
                    ctx.fillRect(k.x - 0.6 * s, k.y - 0.6 * s, 1.2 * s, 1.2 * s);        // the fleck
                    if (k.sub) {                                                         // its two finer flecks, twinkling out of step
                        const tw2 = Math.pow(Math.abs(Math.sin(_frameTime * k.rate * 1.3 + k.ph + 2)), 4);
                        ctx.globalAlpha = fade * (0.3 + 0.6 * tw2) * (1 + lit * 0.5);
                        ctx.fillRect(k.x + k.sub[0] - 0.35, k.y + k.sub[1] - 0.35, 0.7, 0.7);
                        ctx.fillStyle = lit > 0.2 ? k.lc : k.col;
                        ctx.fillRect(k.x + k.sub[2] - 0.35, k.y + k.sub[3] - 0.35, 0.7, 0.7);
                    }
                    if (tw > 0.35) {                                                     // the glint
                        const r = (1.2 + 2.6 * tw) * s * (1 + lit * 0.6);
                        ctx.globalAlpha = fade * Math.min(1, tw * (1 + lit * 0.5));
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(k.x - 0.35, k.y - 0.35, 0.7, 0.7);
                        ctx.strokeStyle = lit > 0.15 ? k.lc : k.col; ctx.lineWidth = 0.45;
                        ctx.beginPath(); ctx.moveTo(k.x - r, k.y); ctx.lineTo(k.x + r, k.y); ctx.moveTo(k.x, k.y - r); ctx.lineTo(k.x, k.y + r); ctx.stroke();
                    }
                }
                ctx.restore();
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
                    const c = Math.cos(angle), s = Math.sin(angle), F = this.shotFx || (this.shotFx = []);
                    if (fx.barrel === 'smoke') {
                        for (let i = 0; i < 6; i++) F.push({ k: 'smoke', x: x + c * (2 + i * 1.5), y: y + s * (2 + i * 1.5), vx: c * 0.22 + (Math.random() - 0.5) * 0.2, vy: s * 0.22 + (Math.random() - 0.5) * 0.2,
                                                             t: -i * 7, life: 64, r: 0.9, col: fx.col, ph: Math.random() * 6.28 });
                    } else if (fx.barrel === 'embers') {
                        for (let i = 0; i < 7; i++) { const a = angle + (Math.random() - 0.5) * 1.6, v = 0.4 + Math.random() * 1.1;
                            F.push({ k: 'ember', x: x + c * 2, y: y + s * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 30 + Math.random() * 25, col: Math.random() < 0.35 ? fx.hot : fx.col, ph: Math.random() * 6.28 }); }
                    }
                    while (F.length > 160) F.shift();
                }
            },
            /** A golden wisp puff behind a 'wisp' shot (called by the shot as it flies). */
            spawnWisp(x, y, fx) {
                if (typeof _zoomLOD !== 'undefined' && _zoomLOD >= 2) return;
                const F = this.shotFx || (this.shotFx = []);
                F.push({ k: 'wisp', x, y, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, t: 0, life: 50, r: 3, col: fx.col, ph: Math.random() * 6.28 });
                if (Math.random() < 0.85) F.push({ k: 'dust', x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, t: 0, life: 36, col: fx.dust, ph: Math.random() * 6.28 });
                while (F.length > 160) F.shift();
            },
            updateShotFx() {
                const F = this.shotFx;
                if (!F || !F.length) return;
                const W = this.weather && this.weather.windVec ? this.weather.windVec : { x: 0, y: 0 };
                for (let i = F.length - 1; i >= 0; i--) {
                    const p = F[i]; p.t++;
                    if (p.t <= 0) continue;                                              // (a smoke puff still waiting its turn)
                    if (p.t > p.life) { F.splice(i, 1); continue; }
                    if (p.k === 'smoke' || p.k === 'wisp') {                             // drifts downwind, curls, swells
                        p.vx = p.vx * 0.94 + W.x * 0.012 + Math.cos(p.t * 0.15 + p.ph) * 0.03;
                        p.vy = p.vy * 0.94 + W.y * 0.012 + Math.sin(p.t * 0.15 + p.ph) * 0.03;
                        p.r += p.k === 'smoke' ? 0.055 : 0.14;
                    } else { p.vx *= 0.93; p.vy *= 0.93; p.vx += W.x * 0.004; p.vy += W.y * 0.004; }
                    p.x += p.vx; p.y += p.vy;
                }
            },
            /** Barrel smoke and wisps (soft, normal blend), then embers and gold dust (additive). After the muzzle stars. */
            drawShotFx(ctx, cb) {
                const F = this.shotFx;
                if (!F || !F.length || _zoomLOD >= 2) return;
                ctx.save();
                for (const p of F) {
                    if (p.t <= 0 || (p.k !== 'smoke' && p.k !== 'wisp')) continue;
                    if (p.x < cb.left || p.x > cb.right || p.y < cb.top || p.y > cb.bottom) continue;
                    const u = p.t / p.life, a = (p.k === 'smoke' ? 0.2 : 0.55) * Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u);
                    ctx.globalAlpha = a;
                    const R = p.r * 2.2;
                    ctx.drawImage(puffSprite(p.col), p.x - R, p.y - R, R * 2, R * 2);
                }
                ctx.globalCompositeOperation = 'lighter';
                for (const p of F) {
                    if (p.t <= 0 || (p.k !== 'ember' && p.k !== 'dust')) continue;
                    if (p.x < cb.left || p.x > cb.right || p.y < cb.top || p.y > cb.bottom) continue;
                    const u = p.t / p.life, fl = 0.55 + 0.45 * Math.sin(_frameTime * 0.03 + p.ph);
                    ctx.globalAlpha = (1 - u) * fl;
                    ctx.fillStyle = p.col;
                    const z = p.k === 'ember' ? 0.9 * (1 - u * 0.5) : 0.75;
                    ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
                    if (p.k === 'ember' && u < 0.4) { ctx.globalAlpha *= 0.35; ctx.fillRect(p.x - p.vx * 2 - z / 2, p.y - p.vy * 2 - z / 2, z, z); }   // its streak
                }
                ctx.restore();
            },
            /** The star of each fresh muzzle flash, at the muzzle along the shot (its light is the lighting pass's). */
            drawMuzzleStars(ctx) {
                const F = this.muzzleFlashes;
                if (!F || !F.length) return;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                const base = ctx.getTransform();
                for (const f of F) {
                    if (f.angle === undefined) continue;
                    const k = Math.min(1, (f.life || 0) / 3), s = (f.radius || 50) / 170 * (0.7 + 0.3 * k);
                    ctx.setTransform(base);
                    ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.scale(s, s * (0.8 + 0.4 * ((f.x * 7 + f.life) % 1)));
                    ctx.globalAlpha = 0.35 + 0.65 * k;
                    ctx.drawImage(muzzleStarSprite(f.color), -24, -24);
                }
                ctx.restore();
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
                if (ts.scale !== ts.targetScale) {
                    ts.scale += (ts.targetScale - ts.scale) * Math.min(1, ts.transitionSpeed * f);
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
                if (typeof phoneSystem !== 'undefined') phoneSystem.fit();   // the phone turns and scales to fit (ui/phone.js)
            },

            fireWeapon() {
                // 1. VISIBILITY CHECKS
                if (!this.player.visible && !this.isDriving) return;
                if (this.paused) return;
                if (this.furniture && this.furniture.busy()) return;   // her hands are on the furniture
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
                    life: 3,
                    angle
                });
                if (onFoot) this.weaponFx(px, py, angle, this.currentWeapon.id, this.projectiles[this.projectiles.length - 1], this.player);
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
                        this.addPausableTimeout(() => {
                            this.story.triggerComms("LARISSA", "You saw it coming. The flit is faster than they are.", 5000);
                        }, 1200);
                    }
                }
            },
            
        });

