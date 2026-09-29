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
                const wx = weatherAt(this.player), rainOn = !!(wx && wx.rain > 0.05);

                drawProceduralHumanoid(this.ctx, this.player, {
                    skinColor: cosmeticConfig.skinColor,
                    hair: cosmeticConfig.hair,
                    gender: APPEARANCES['949'].gender,
                    stance: currentStance,
                    scopeK: currentStance === 'sniper' ? (this.scopeK || 0) : 0,   // eye to the sight (engine/scope.js)
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
                    // In the rain outdoors a hoodie's hood goes up (unless she's wearing a hat)
                    hat: cosmeticConfig.hat || (rainOn && outfit.top && outfit.top.type === 'hoodie' ? { type: 'hood_up', color: outfit.top.color } : null),
                    jewelry: cosmeticConfig.jewelry,
                    pose: typeof phoneSystem !== 'undefined' && phoneSystem.isOpen ? 'phone' : undefined,
                    // A drawn gun takes the hand; the umbrella waits
                    held: armed && cosmeticConfig.held && cosmeticConfig.held.type === 'umbrella' ? null : (cosmeticConfig.held || outfit.held || null)
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
            
            /* =========================================================
               TOUCH STICKS — the move stick (left) and the fire stick (right).
               Flitting without letting go of the trigger:
                 • Flit Ring (setting, on): push the move stick past its walking
                   radius into the outer ring → flit that way; the ring re-arms
                   once the thumb comes back inside. The ring shows the flit charge.
                 • Flick to Flit (setting): a fast flick of the move stick flits.
                 • Two-Finger Flit (setting): while firing, tap another finger on
                   the right half of the screen.
                 • Aim memory: let go of the fire stick and touch it again within
                   0.6 s — it resumes at the old aim until the thumb drags.
               ========================================================= */
            initJoystick() {
                const inputZone = document.getElementById('input-zone-left'), visualZone = document.getElementById('joystick-zone'), knob = document.getElementById('joystick-knob');
                const J = this.joystick, WALK = 35, RING_IN = 82, RING_OUT = 65, EDGE = 100;   // ring: flit past 82 px, re-arm inside 65
                const gameUI = document.getElementById('game-ui');
                const canFlit = () => !this.isDriving && !(gameUI && gameUI.classList.contains('emote-active'));   // not at the wheel or holstered
                const ringFlit = (dx, dy) => {
                    if (!GameSettings.flitRing || !J.armed || !canFlit()) return;
                    J.armed = false;
                    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* no haptics */ }
                    this.triggerFlit(Math.atan2(dy, dx), 'ring');
                };
                inputZone.addEventListener('touchstart', (e) => {
                    e.preventDefault(); if (J.active) return;
                    const touch = e.changedTouches[0];
                    // Keep the whole ring on screen: shift the stick's centre in from the edges
                    const ox = Math.max(EDGE, Math.min(window.innerWidth - EDGE, touch.clientX)), oy = Math.max(EDGE, Math.min(window.innerHeight - EDGE, touch.clientY));
                    J.id = touch.identifier; J.active = true; J.originX = ox; J.originY = oy; J.dx = 0; J.dy = 0; J.armed = true;
                    J.landX = touch.clientX; J.landY = touch.clientY;      // drags count from where the thumb landed
                    J.trail = [{ x: 0, y: 0, t: performance.now() }];
                    visualZone.style.display = 'block'; visualZone.style.left = (ox - 40) + 'px'; visualZone.style.top = (oy - 40) + 'px';
                    knob.style.transform = `translate(-50%, -50%)`;
                    if (this.flitRingEl) this.flitRingEl.classList.toggle('off', !GameSettings.flitRing || !canFlit());
                }, { passive: false });
                inputZone.addEventListener('touchmove', (e) => {
                    e.preventDefault(); if (!J.active) return;
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        if (touch.identifier !== J.id) continue;
                        const deltaX = touch.clientX - J.landX, deltaY = touch.clientY - J.landY, far = Math.hypot(deltaX, deltaY);
                        const distance = Math.min(far, WALK), angle = Math.atan2(deltaY, deltaX);
                        const moveX = Math.cos(angle) * distance, moveY = Math.sin(angle) * distance;
                        knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
                        J.dx = moveX / WALK; J.dy = moveY / WALK;
                        // The ring: past the walking radius → flit; back inside → re-armed
                        if (far >= RING_IN) ringFlit(deltaX, deltaY);
                        else if (far <= RING_OUT) J.armed = true;
                        // A flick: from near the centre to well out, fast
                        if (GameSettings.flitFlick && J.armed) {
                            const now = performance.now(); J.trail.push({ x: deltaX, y: deltaY, t: now });
                            while (J.trail.length > 2 && now - J.trail[0].t > 150) J.trail.shift();
                            const t0 = J.trail[0];
                            if (Math.hypot(t0.x, t0.y) < 14 && far > 30 && now - t0.t < 150 && canFlit()) { J.armed = false; this.triggerFlit(angle, 'flick'); }
                        }
                        break;
                    }
                }, { passive: false });
                const endHandler = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === J.id) { J.active = false; J.dx = 0; J.dy = 0; J.armed = true; visualZone.style.display = 'none'; break; } } };
                inputZone.addEventListener('touchend', endHandler); inputZone.addEventListener('touchcancel', endHandler);
                // Two-Finger Flit: while the fire stick is held, a tap on the right half (not on a button)
                document.addEventListener('touchstart', (e) => {
                    if (!GameSettings.flitTwoFinger || !this.fireJoystick.active || !this.running || this.paused) return;
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const t = e.changedTouches[i];
                        if (t.identifier === this.fireJoystick.id || t.clientX < window.innerWidth / 2) continue;
                        const el = t.target;
                        if (el && el.closest && el.closest('button, .game-btn, #btn-fire, #btn-heal, #btn-flit, #btn-nv, #btn-holster, #btn-autodrive, #btn-emote, #phone-overlay, #game-ui [id^="btn-"]')) continue;
                        this.triggerFlit(undefined, 'twofinger');
                        break;
                    }
                }, { passive: true });
            },

            /* The fire stick. With Aim Before Firing (on by default) aiming and firing are two
               intentions: inside the gold threshold ring she only aims (the laser shows the line,
               nothing is heard); past it she fires; back inside, she holds the line in silence.
               With a sniper and Sniper Fire on Release, crossing the ring arms the shot and
               lifting the thumb takes it. The other buttons fade while the stick is held. */
            initFireJoystick() {
                const fireZone = document.getElementById('btn-fire'), knob = document.getElementById('fire-joystick-knob');
                const ring = document.getElementById('fire-ring'), band = document.getElementById('fire-band'), gameUI = document.getElementById('game-ui');
                const F = this.fireJoystick, MEMORY = 0.6, DRAG = 8, DEAD = 6, FIRE_IN = 62, FIRE_OUT = 45;   // fire past 62 px, stop inside 45
                const aimMode = () => GameSettings.aimBeforeFire !== false;
                const sniperRelease = () => aimMode() && GameSettings.sniperRelease !== false && this.weaponMode === 'sniper';
                const setKnob = (x, y) => { knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; };
                const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* no haptics */ } };
                const showRing = () => { for (const el of [ring, band]) { if (!el) continue; el.classList.toggle('off', !aimMode()); el.classList.toggle('hot', !!F.firing); el.classList.toggle('armed', !!F.armed); } };
                // Past the ring → fire (or arm, for a sniper on release); back inside → stop
                const setFiring = (far) => {
                    if (!aimMode()) { F.firing = true; return; }
                    const out = far >= FIRE_IN || ((F.firing || F.armed) && far > FIRE_OUT);
                    if (sniperRelease()) { if (out && !F.armed) buzz(); F.armed = out; F.firing = false; }
                    else { if (out && !F.firing) buzz(); F.firing = out; F.armed = false; }
                    showRing();
                };
                fireZone.addEventListener('touchstart', (e) => {
                    e.preventDefault(); if (F.active) return;
                    const touch = e.changedTouches[0], rect = fireZone.getBoundingClientRect();
                    F.id = touch.identifier; F.active = true; F.originX = rect.left + rect.width / 2; F.originY = rect.top + rect.height / 2;
                    F.dx = 0; F.dy = 0; F.landX = touch.clientX; F.landY = touch.clientY; F.remembered = false;
                    F.aimed = !aimMode(); F.firing = !aimMode(); F.armed = false;
                    if (gameUI) gameUI.classList.add('aiming');
                    // Aim memory: back within 0.6 s → the old aim (and fire again only if she was firing)
                    const m = this._aimMemory;
                    if (m && performance.now() / 1000 - m.at <= MEMORY) {
                        F.dx = Math.cos(m.angle); F.dy = Math.sin(m.angle); F.remembered = true; F.aimed = true;
                        if (aimMode()) { F.firing = !!m.firing && !sniperRelease(); F.armed = !!m.firing && sniperRelease(); }
                        const r = aimMode() && (F.firing || F.armed) ? FIRE_IN + 5 : 30;
                        setKnob(F.dx * r, F.dy * r);
                    } else knob.style.transform = `translate(-50%, -50%)`;
                    showRing();
                }, { passive: false });
                fireZone.addEventListener('touchmove', (e) => {
                    e.preventDefault(); if (!F.active) return;
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        if (touch.identifier !== F.id) continue;
                        if (F.remembered && Math.hypot(touch.clientX - F.landX, touch.clientY - F.landY) < DRAG) break;   // still on the remembered aim
                        F.remembered = false;
                        const deltaX = touch.clientX - F.originX, deltaY = touch.clientY - F.originY, far = Math.hypot(deltaX, deltaY);
                        const MAX = aimMode() ? 74 : 35, distance = Math.min(far, MAX), angle = Math.atan2(deltaY, deltaX);
                        setKnob(Math.cos(angle) * distance, Math.sin(angle) * distance);
                        if (aimMode()) {
                            if (far > DEAD) { F.aimed = true; F.dx = Math.cos(angle); F.dy = Math.sin(angle); }   // direction only: she aims wherever the thumb points
                            setFiring(far);
                        } else { F.dx = Math.cos(angle) * distance / MAX; F.dy = Math.sin(angle) * distance / MAX; }
                        break;
                    }
                }, { passive: false });
                const endHandler = (e) => {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier !== F.id) continue;
                        if (F.armed && F.aimed) this._releaseShot = Math.atan2(F.dy, F.dx);   // sniper: lifting the thumb takes the shot (update.js)
                        if (F.aimed && Math.hypot(F.dx, F.dy) > 0.2) this._aimMemory = { angle: Math.atan2(F.dy, F.dx), at: performance.now() / 1000, firing: F.firing || F.armed };   // real time, not game time
                        F.active = false; F.dx = 0; F.dy = 0; F.remembered = false; F.aimed = false; F.firing = false; F.armed = false;
                        knob.style.transform = `translate(-50%, -50%)`;
                        if (gameUI) gameUI.classList.remove('aiming');
                        showRing();
                        break;
                    }
                };
                fireZone.addEventListener('touchend', endHandler); fireZone.addEventListener('touchcancel', endHandler);
            },

            /** The flit ring's charge (fill, ready pulse, dim when unaffordable) — only touched when it changes. */
            updateFlitRing() {
                const el = this.flitRingEl; if (!el) return;
                const fs = this.flitState, fill = Math.round(100 * fs.attunement / fs.maxAttunement), ready = fs.attunement >= this.flitCost();
                if (fill !== this._ringFill) { this._ringFill = fill; el.style.setProperty('--fill', fill + '%'); }
                if (ready !== this._ringReady) {
                    this._ringReady = ready; el.classList.toggle('dim', !ready);
                    if (ready) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
                }
            },
        });

