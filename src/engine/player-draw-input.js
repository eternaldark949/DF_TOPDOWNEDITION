        // GameEngine — Drawing the player, emotes, pausable timers, sidebar portrait, joysticks.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            drawPlayer() {
                this.ctx.save(); 
                this.ctx.translate(this.player.x, this.player.y); 
                this.ctx.rotate(this.player.angle); 
                
                // Stealth/Flit Ghosting
                if (this.player.isHidden || this.flitState.active) this.ctx.globalAlpha = 0.5;
            
                // ── Fully cosmetics-driven appearance ──
                const cosmeticConfig = this.cosmetics.getRenderConfig();
                
                // Stance from weapon mode — holstering reverts to idle and lets the
                // existing _animState lerp ease the arms back to a relaxed pose.
                let currentStance = 'idle';
                const armed = (this.weaponMode === 'normal' || this.weaponMode === 'sniper') && !this.weaponHolstered;
                if (armed) currentStance = this.currentWeapon ? stanceForWeapon(this.currentWeapon.id) : (this.weaponMode === 'sniper' ? 'sniper' : 'pistol');
                else if (this.weaponMode === 'none' && this.shootCooldown > 0) currentStance = 'punch';

                // Gun kick: snaps back on the shot, recovers in game ticks (blended like
                // everything else). Heavier weapons (stats.recoil) kick harder and longer.
                let gunKick = 0;
                if (armed && this.currentWeapon && this.shootCooldown > 0) {
                    const st = this.currentWeapon.stats || {};
                    const fireRate = st.fireRate || 20, heavy = Math.max(0.4, Math.min(2, (st.recoil || 10) / 10));
                    const a = RenderInterp.stepAdvanced ? RenderInterp.alpha : 1;
                    const since = Math.max(0, fireRate - this.shootCooldown - 1 + a);
                    gunKick = Math.max(0, 1 - since / (4 + 4 * heavy)) * heavy;
                }

                // Outfit from equipped cosmetic
                const outfit = cosmeticConfig.outfit;

                drawProceduralHumanoid(this.ctx, this.player, {
                    skinColor: cosmeticConfig.skinColor,
                    hair: cosmeticConfig.hair,
                    gender: 'female',
                    stance: currentStance,
                    isDriving: this.isDriving,
                    isShootingFromCar: this.isDriving && this.isShootingFromCar,
                    carAngle: this.car ? this.car.angle : 0,
                    // Guns kick via `kick` (applied after smoothing); `recoil` only drives the legacy punch path
                    recoil: currentStance === 'punch' && this.shootCooldown > 0 ? (this.shootCooldown / 10) : 0,
                    kick: gunKick,
                    // Ticks since the punch was thrown, blended between ticks like everything else
                    punchTicks: currentStance === 'punch'
                        ? Math.max(0, CONFIG.PUNCH.DURATION_TICKS - this.shootCooldown - 1 + RenderInterp.alpha)
                        : undefined,
                    top: outfit.top,
                    bottom: outfit.bottom,
                    shoes: outfit.shoes,
                    train: outfit.train || null,
                    hat: cosmeticConfig.hat,
                    jewelry: cosmeticConfig.jewelry,
                    held: cosmeticConfig.held || outfit.held || null
                });
                
                this.ctx.restore();
            },

            /**
             * Spawn an emote bubble above the player. Map of slot key → emoji.
             * Lifetime managed by playerEmote.{age, duration}; rendered each frame
             * by drawPlayerEmote() until age >= duration.
             */
            firePlayerEmote(key) {
                const map = { smile: '😊', zany: '🤪', cry: '😭', frown: '😞' };
                const emoji = map[key];
                if (!emoji) return;
                this.playerEmote.text = emoji;
                this.playerEmote.age = 0;
                // 949's face follows the emote while the bubble is up (sidebar, phone, dialogue)
                const faces = { smile: 'smile', zany: { brow: { lift: 0.3, raise: 0.8 }, lids: { bottom: 0.3 }, gaze: { x: 0.4 }, mouth: { curve: 1, open: 0.4, smirk: 0.4 }, blush: 0.2 }, cry: 'crying', frown: 'annoyed' };
                this.playerExpression = faces[key];
                this.renderSidebarPortrait();

                // Trigger nearest reactor's response within range — slight delay
                // so it feels like processing rather than reflex. Eligible
                // reactors: pedestrians (always) + named NPCs that have an
                // entry in NPC_EMOTE_REACTIONS (Anavia, Mirabel, etc.). We
                // pick the nearest across both pools so a bubble doesn't
                // double-fire.
                const REACT_RANGE = 180;
                const px = this.player.x, py = this.player.y;
                let nearest = null;
                let nearestDistSq = REACT_RANGE * REACT_RANGE;
                
                const peds = this.pedestrians && this.pedestrians.pedestrians;
                if (peds) {
                    for (const ped of peds) {
                        if (ped.dead) continue;
                        const dx = ped.x - px, dy = ped.y - py;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < nearestDistSq) { nearestDistSq = d2; nearest = ped; }
                    }
                }
                
                if (this.npcs) {
                    for (const npc of this.npcs) {
                        if (npc.dead) continue;
                        if (!NPC_EMOTE_REACTIONS[npc.name]) continue;
                        const dx = npc.x - px, dy = npc.y - py;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < nearestDistSq) { nearestDistSq = d2; nearest = npc; }
                    }
                }

                // Recruited teammates live in `this.teammates`, a separate array
                // from `this.npcs`, so they need their own pass or they'd never
                // answer you while following. Skip anyone downed or riding in a
                // vehicle — no bubble should surface from inside the car.
                if (this.teammates) {
                    for (const tm of this.teammates) {
                        if (tm.dead || tm.downed || tm.inCar || !tm.recruited) continue;
                        if (!NPC_EMOTE_REACTIONS[tm.name]) continue;
                        const dx = tm.x - px, dy = tm.y - py;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < nearestDistSq) { nearestDistSq = d2; nearest = tm; }
                    }
                }
                
                if (nearest) {
                    const delay = 400 + Math.random() * 200; // 400–600ms beat
                    this.addPausableTimeout(() => {
                        if (nearest.dead) return;
                        nearest.reactToEmote(key);
                    }, delay);
                }
            },

            /**
             * Schedule a callback to fire after `ms` of in-game time. Unlike
             * setTimeout, these timers freeze when the game is paused — they
             * advance only when update() runs. Returns a token that can be
             * passed to cancelPausableTimeout.
             */
            addPausableTimeout(callback, ms) {
                const timer = { msRemaining: ms, cb: callback };
                this.pausableTimers.push(timer);
                return timer;
            },
            cancelPausableTimeout(timer) {
                const idx = this.pausableTimers.indexOf(timer);
                if (idx !== -1) this.pausableTimers.splice(idx, 1);
            },
            _tickPausableTimers() {
                const now = performance.now();
                if (this._lastPausableTimerTick === undefined) this._lastPausableTimerTick = now;
                // Clamp dt to avoid post-pause/tab-blur spikes firing every queued timer at once.
                const dt = Math.min(50, now - this._lastPausableTimerTick);
                this._lastPausableTimerTick = now;
                for (let i = this.pausableTimers.length - 1; i >= 0; i--) {
                    const t = this.pausableTimers[i];
                    t.msRemaining -= dt;
                    if (t.msRemaining <= 0) {
                        this.pausableTimers.splice(i, 1);
                        try { t.cb(); } catch (e) { console.error('[pausableTimer]', e); }
                    }
                }
            },

            /**
             * Tick the player emote bubble's age. Called from update() so it
             * naturally freezes when paused (vs. previous behavior where it
             * ticked inside the draw() flow and counted down through pauses).
             */
            tickPlayerEmote() {
                if (!this.playerEmote.text) return;
                this.playerEmote.age++;
                if (this.playerEmote.age >= this.playerEmote.duration) {
                    this.playerEmote.text = null;
                    this.playerEmote.age = 0;
                    this.playerExpression = null;
                    this.renderSidebarPortrait();
                }
            },

            /**
             * Render the player emote bubble in world space above the player.
             * Pop-in (ease-out cubic) → hold → pop-out (ease-in) scale curve,
             * mirroring the pedestrian quip bubble for visual consistency.
             */
            drawPlayerEmote() {
                if (!this.playerEmote.text || !this.player.visible) return;
                // NOTE: age++ and lifetime check moved to tickPlayerEmote() (called from
                // update()) so the bubble doesn't keep counting down during pause.
                if (this.playerEmote.age >= this.playerEmote.duration) return;
                const POP_IN = 8;
                const POP_OUT = 10;
                const age = this.playerEmote.age;
                const dur = this.playerEmote.duration;
                let scale;
                if (age < POP_IN) {
                    scale = 1 - Math.pow(1 - age / POP_IN, 3);
                } else if (age < dur - POP_OUT) {
                    scale = 1;
                } else {
                    const t = Math.max(0, (dur - age) / POP_OUT);
                    scale = t * t;
                }
                if (scale < 0.01) return;
                const ctx = this.ctx;
                ctx.save();
                ctx.translate(this.player.x, this.player.y - 32);
                ctx.scale(scale, scale);
                ctx.font = '600 18px sans-serif';
                const w = 28, h = 26, r = 7;
                const x = -w / 2, y = -h / 2;
                ctx.fillStyle = 'rgba(8, 6, 18, 0.86)';
                ctx.strokeStyle = 'rgba(255, 170, 68, 0.55)'; // amber tint to match holster family
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + w / 2 + 4, y + h);
                ctx.lineTo(x + w / 2, y + h + 4);
                ctx.lineTo(x + w / 2 - 4, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.playerEmote.text, 0, 1);
                ctx.restore();
            },
            
            renderSidebarPortrait() {
                const canvasIds = ['portrait-canvas-map', 'portrait-canvas-inv'];

                for (const id of canvasIds) {
                    const canvas = document.getElementById(id);
                    if (!canvas) continue;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Square backdrop here, not the dialogue box's circle — these two
                    // canvases are already clipped to a circle by inline border-radius.
                    ctx.fillStyle = 'rgba(40, 5, 25, 0.8)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Same resolver the dialogue box uses, so the cosmetic preview can
                    // never disagree with the portrait shown when 949 speaks.
                    drawCharacterPortrait(ctx, canvas.width, canvas.height, this.resolvePortraitConfig('949'));
                }
            },
            
            initJoystick() {
                const inputZone = document.getElementById('input-zone-left'); const visualZone = document.getElementById('joystick-zone'); const knob = document.getElementById('joystick-knob');
                inputZone.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.joystick.active) return; const touch = e.changedTouches[0]; this.joystick.id = touch.identifier; this.joystick.active = true; this.joystick.originX = touch.clientX; this.joystick.originY = touch.clientY; this.joystick.dx = 0; this.joystick.dy = 0; visualZone.style.display = 'block'; visualZone.style.left = (touch.clientX - 50) + 'px'; visualZone.style.top = (touch.clientY - 50) + 'px'; knob.style.transform = `translate(-50%, -50%)`; }, {passive: false});
                inputZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (!this.joystick.active) return; for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.joystick.id) { const touch = e.changedTouches[i]; const deltaX = touch.clientX - this.joystick.originX; const deltaY = touch.clientY - this.joystick.originY; const maxDist = 35; const distance = Math.min(Math.sqrt(deltaX*deltaX + deltaY*deltaY), maxDist); const angle = Math.atan2(deltaY, deltaX); const moveX = Math.cos(angle) * distance; const moveY = Math.sin(angle) * distance; knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`; this.joystick.dx = moveX / maxDist; this.joystick.dy = moveY / maxDist; break; } } }, {passive: false});
                const endHandler = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.joystick.id) { this.joystick.active = false; this.joystick.dx = 0; this.joystick.dy = 0; visualZone.style.display = 'none'; break; } } };
                inputZone.addEventListener('touchend', endHandler); inputZone.addEventListener('touchcancel', endHandler);
            },

            initFireJoystick() {
                const fireZone = document.getElementById('btn-fire'); const knob = document.getElementById('fire-joystick-knob');
                fireZone.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.fireJoystick.active) return; const touch = e.changedTouches[0]; this.fireJoystick.id = touch.identifier; this.fireJoystick.active = true; const rect = fireZone.getBoundingClientRect(); this.fireJoystick.originX = rect.left + rect.width / 2; this.fireJoystick.originY = rect.top + rect.height / 2; this.fireJoystick.dx = 0; this.fireJoystick.dy = 0; knob.style.transform = `translate(-50%, -50%)`; }, {passive: false});
                fireZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (!this.fireJoystick.active) return; for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.fireJoystick.id) { const touch = e.changedTouches[i]; const deltaX = touch.clientX - this.fireJoystick.originX; const deltaY = touch.clientY - this.fireJoystick.originY; const maxDist = 35; const distance = Math.min(Math.sqrt(deltaX*deltaX + deltaY*deltaY), maxDist); const angle = Math.atan2(deltaY, deltaX); const moveX = Math.cos(angle) * distance; const moveY = Math.sin(angle) * distance; knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`; this.fireJoystick.dx = moveX / maxDist; this.fireJoystick.dy = moveY / maxDist; break; } } }, {passive: false});
                const endHandler = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.fireJoystick.id) { this.fireJoystick.active = false; this.fireJoystick.dx = 0; this.fireJoystick.dy = 0; knob.style.transform = `translate(-50%, -50%)`; break; } } };
                fireZone.addEventListener('touchend', endHandler); fireZone.addEventListener('touchcancel', endHandler);
            },

        });

