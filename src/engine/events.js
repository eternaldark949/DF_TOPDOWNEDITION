        // GameEngine — Input and UI event wiring (keyboard, touch, buttons).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /** Interact with whatever is in reach (the action pill, or E on a keyboard): talk, use, enter or leave the car. */
            interact() {
                if (this.activeInteraction) {
                    if(this.activeInteraction.interactionType === 'medbay_refill') {
                        this.refillStims();
                    } else if(this.activeInteraction.interactionType === 'vending_machine') {
                        this.buyBubbleTea();
                    } else if(this.activeInteraction.interactionType === 'lost_luggage') {
                        this.searchLostLuggage(this.activeInteraction);
                    } else if(this.activeInteraction.interactionType === 'bed_sleep') {
                        // NEW: Open Sleep UI
                        this.openSleepMenu();
                    } else if(this.activeInteraction.interactionType === 'crafting_table') {
                        this.openCraftingTable();
                    } else if(this.activeInteraction.interactionType === 'armory') {
                        // Open the menu straight on the inventory
                        Screens.open('inventory');
                        audioSys.sfx('ui');
                    } else if(this.activeInteraction.interactionType === 'auto_shop_counter') {
                        this.openAutoShop();
                    } else if(this.activeInteraction.interactionType === 'light_switch') {
                        // Toggle room lights on/off
                        const switchProp = this.activeInteraction;
                        if (switchProp.roomId && this.roomSystem.active) {
                            const nowDark = this.roomSystem.toggleRoomLights(switchProp.roomId);
                            switchProp._switchState = !nowDark;
                            const roomLabel = this.roomSystem.rooms[switchProp.roomId]?.label || switchProp.roomId;
                            showMessage(nowDark ? `${roomLabel} — LIGHTS OFF` : `${roomLabel} — LIGHTS ON`);
                            audioSys.sfx('ui');
                        }
                    } else if(this.activeInteraction.interactionType === 'delivery_pickup') {
                        // Delivery mission: pick up package from vehicle
                        if (this.missions.activeMission && !this.missions.activeMission.pickedUp) {
                            this.missions.activeMission.pickedUp = true;
                            showMessage('PACKAGE SECURED. DELIVER TO THE TARGET LOCATION.');
                            if (this.ui && this.ui.showMissionBanner) {
                                this.ui.showMissionBanner(this.missions.activeMission.banner, 'gold', 'IN PROGRESS');
                            }
                            audioSys.sfx('ui');
                        }
                    } else if(this.activeInteraction.interactionType === 'adopt_cat') {
                        this.questState.hasVelvetCat = true;
                        if (this.velvetCat) {
                            this.velvetCat._discoverable = false;
                            this.velvetCat.state = 'following';
                            this.velvetCat.idleBehavior = null;
                        }
                        showMessage('VELVET HAS JOINED YOU.');
                        audioSys.sfx('ui');
                    } else if(this.activeInteraction.interactionType === 'read_note') {
                        const noteId = this.activeInteraction.noteId;
                        if (noteId) this.openNote(noteId);
                    } else if(this.activeInteraction.type === 'hail_zib') {
                        this.openZibMenu(this.activeInteraction.target);
                    } else if(this.activeInteraction.type === 'hijack') {
                        this.hijackVehicle(this.activeInteraction.target);
                    } else if(this.activeInteraction instanceof NPC) {
                        this.startDialogue(this.activeInteraction);
                    }
                } else {
                    if (this._walkToCar()) return;                     // she walks round to the driver's door first
                    this.toggleVehicle();
                }
            },

            /** Getting in on foot: walk to the driver's door (Walker.goTo), face the car, then get in.
             *  True when a walk started (or is already on); close enough, or turned off, gets in at once. */
            _walkToCar() {
                const car = this.car;
                if (!CONFIG.WALK_TO_CAR || this.isDriving || !car || this.activeMap.type === 'indoor') return false;
                if (this.player._walk && this.player._walk.toCar) return true;
                // In the car's frame: +x forward, -y the driver's side (traffic-vehicle.js seat layout)
                const a = car.angle, ca = Math.cos(a), sa = Math.sin(a), nav = NavGrid.for(this.activeMap);
                const hl = (car.length || 80) / 2, hw = (car.width || 40) / 2;
                const W = (lx, ly) => [car.x + lx * ca - ly * sa, car.y + lx * sa + ly * ca];
                const L = (x, y) => [(x - car.x) * ca + (y - car.y) * sa, -(x - car.x) * sa + (y - car.y) * ca];
                let side = -1, [dx, dy] = W(hl * 0.2, -(hw + 20));                                   // the driver's door
                if (nav && !nav.walkable(dx, dy)) { side = 1; [dx, dy] = W(hl * 0.2, hw + 20); }      // blocked: in from the other side
                const door = { x: dx, y: dy };
                if (Math.hypot(door.x - this.player.x, door.y - this.player.y) < 30) return false;
                // On the far side? Round the nose or the tail (the nav grid doesn't know about cars)
                const [plx, ply] = L(this.player.x, this.player.y), via = [], ex = plx >= 0 ? hl + 30 : -(hl + 30), ew = hw + 32;
                if (Math.sign(ply) !== side && Math.abs(plx) < hl + 20) via.push(W(ex, Math.sign(ply || 1) * ew), W(ex, side * ew));
                const h = Walker.goTo(this.player, door.x, door.y, { face: [car.x, car.y], arrive: 7, timeout: 240, via,
                    onArrive: () => { if (!this.isDriving && this.car === car && Math.hypot(car.x - this.player.x, car.y - this.player.y) < 90) this.toggleVehicle(); } });
                if (this.player._walk) this.player._walk.toCar = true;
                return !!h;
            },

            initEvents() {
                window.addEventListener('resize', () => { this.resize(); });
                window.addEventListener('keydown', (e) => { 
                    this.keys[e.key] = true; 
                    if (e.key === 'h' || e.key === 'H') this.useBooster();
                    // Furniture (engine/furniture.js): G grabs / confirms / lets go, R turns, directions pick a side
                    if (this.furniture && this.running && !this.paused) {
                        if (e.key === 'g' || e.key === 'G') this.furniture.press();
                        if ((e.key === 'r' || e.key === 'R') && this.furniture.holding) this.furniture.rotate(e.shiftKey ? -1 : 1);
                        if (this.furniture.state === 'choose') {
                            const D = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] }[e.key];
                            if (D) { this.furniture.chooseDir(D[0], D[1]); e.preventDefault(); }
                        }
                    }
                    if (e.key === 'j' || e.key === 'J') this.useBoosterOnAlly();
                    
                    // AUTO-DRIVE TOGGLE (only while driving)
                    if ((e.key === 'q' || e.key === 'Q') && this.isDriving && this.running && !this.paused) {
                        this.toggleAutoDrive();
                    }
                    
                    if (e.key === ' ') {
                        e.preventDefault();
                        // Behind the wheel Space is the handbrake (update.js); the mouse still fires
                        if (!this.isDriving && this.shootCooldown <= 0 && this.player.visible && !this.paused) {
                            this.fireWeapon();
                        }
                    }
                });
                window.addEventListener('keyup', (e) => this.keys[e.key] = false);
                
                // DESKTOP MOUSE CONTROLS for aiming and shooting
                this.mouseX = 0;
                this.mouseY = 0;
                this.mouseDown = false;
                
                this.canvas.addEventListener('mousemove', (e) => {
                    /* getBoundingClientRect is CSS space, but mouseX is compared
                       against canvas.width/2 (backing-store space) when aiming.
                       Those were equal only because the two always matched; with
                       a render scale they diverge and the crosshair would map to
                       the wrong world position. Converting here is a no-op at
                       scale 1.0 and also makes the code DPR-ready. */
                    const rect = this.canvas.getBoundingClientRect();
                    const sx = rect.width  ? (this.canvas.width  / rect.width)  : 1;
                    const sy = rect.height ? (this.canvas.height / rect.height) : 1;
                    this.mouseX = (e.clientX - rect.left) * sx;
                    this.mouseY = (e.clientY - rect.top)  * sy;
                });
                
                this.canvas.addEventListener('mousedown', (e) => {
                    this.mouseDown = true;
                });
                
                this.canvas.addEventListener('mouseup', (e) => {
                    this.mouseDown = false;
                });
                
                const toggleAction = (e) => { e.preventDefault(); this.interact(); };

                this.interactBtn.addEventListener('click', toggleAction); this.interactBtn.addEventListener('touchstart', toggleAction);
                // The hand (engine/furniture.js): tap to grab / confirm / let go; hold it a moment to reset the layout
                const grabBtn = document.getElementById('btn-grab');
                if (grabBtn) {
                    let held = null, long = false;
                    grabBtn.addEventListener('pointerdown', (e) => {
                        e.preventDefault(); e.stopPropagation(); long = false;
                        held = setTimeout(() => { long = true; if (this.furniture.state === 'idle') this.furniture.resetLayout(); }, 900);
                    });
                    const up = (e) => { if (held === null) return; clearTimeout(held); held = null; e.preventDefault(); if (!long) this.furniture.press(); };
                    grabBtn.addEventListener('pointerup', up);
                    grabBtn.addEventListener('pointercancel', () => { clearTimeout(held); held = null; });
                    for (const [id, dir] of [['btn-rot-l', -1], ['btn-rot-r', 1]]) {
                        const b = document.getElementById(id);
                        if (b) b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.furniture.rotate(dir); });
                    }
                }
                // Choosing a side: a tap on a handle (world space) picks it, before anything else hears the tap
                this.canvas.addEventListener('pointerdown', (e) => {
                    if (!this.furniture || this.furniture.state !== 'choose') return;
                    const rect = this.canvas.getBoundingClientRect(), sx = rect.width ? this.canvas.width / rect.width : 1, sy = rect.height ? this.canvas.height / rect.height : 1;
                    const w = this.viewToWorld((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                    if (this.furniture.tap(w.x, w.y)) { e.preventDefault(); e.stopImmediatePropagation(); }
                }, true);
                // Weather debug: cycles Clear → Drizzle → Rain → Storm → Auto.
                // The first four pin the sky (schedule paused) so you can inspect
                // a condition without it rolling out from under you; Auto hands
                // control back to the scheduler and immediately rolls.
                document.getElementById('btn-toggle-weather').addEventListener('click', (e) => {
                    e.preventDefault();
                    const cycle = ['clear', 'drizzle', 'rain', 'storm', 'auto'];
                    const cur = this.weather.scheduleLocked ? this.weather.condition : 'auto';
                    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
                    if (next === 'auto') {
                        this.weather.unlockSchedule(true);
                        showMessage('WEATHER: AUTO');
                    } else {
                        this.weather.lockSchedule(next);
                        showMessage('WEATHER: ' + WEATHER_CONDITIONS[next].label.toUpperCase() + ' (LOCKED)');
                    }
                });
                // Weapon Mode Toggle Button
                document.getElementById('btn-weapon-mode').addEventListener('click', (e) => {
                    e.preventDefault();
                    const btn = document.getElementById('btn-weapon-mode');
                    if (this.weaponMode === 'normal') {
                        this.weaponMode = 'sniper';
                        btn.innerHTML = '🎯 Sniper';
                        btn.style.borderColor = '#ffd700';
                        btn.style.color = '#ffd700';
                        showMessage("SNIPER MODE: PENETRATING ROUNDS ACTIVE");
                    } else {
                        this.weaponMode = 'normal';
                        btn.innerHTML = '🔫 Normal';
                        btn.style.borderColor = '#00f3ff';
                        btn.style.color = '#00f3ff';
                        showMessage("NORMAL MODE: STANDARD ROUNDS ACTIVE");
                    }
                });
                
                // Add this inside initEvents()

                // 1. In-Game Save Button
                document.getElementById('btn-save-game').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.saveGame();
                });
                
                // Inside initEvents() ...

                // 3. Map Button (Dock)
                document.getElementById('btn-open-map').addEventListener('click', (e) => {
                    e.preventDefault();
                    // Close the dock first so it's not open when we return
                    document.getElementById('dock-toggle').classList.remove('open');
                    document.getElementById('dock-buttons').classList.remove('visible');
                    
                    // Open the Golden Map
                    Screens.open('map');
                });
                
                document.getElementById('btn-inventory').addEventListener('click', (e) => {
                    e.preventDefault();
                    // Close the dock so it doesn't block the view
                    document.getElementById('dock-toggle').classList.remove('open');
                    document.getElementById('dock-buttons').classList.remove('visible');
                    
                    // Open Inventory
                    Screens.open('inventory');
                });
                
                // 2. Main Menu Load Button — opens save slot selector
                document.getElementById('btn-load-game').addEventListener('click', () => {
                    FullscreenManager.requestIfEnabled();
                    audioSys.init();
                    if (typeof saveSlotManager !== 'undefined' && saveSlotManager.hasAnySave()) {
                        saveSlotManager.open('load', (success) => {
                            if (success) {
                                document.getElementById('main-menu').style.opacity = '0';
                                setTimeout(() => this.enterWorld(), 500);
                            }
                        });
                    } else {
                        showMessage('NO SAVE FILES FOUND.');
                        audioSys.sfx('ui');
                    }
                });

                
                // In initEvents()
                const toggleNV = (e) => {
                    e.preventDefault();
                    this.nightVision = !this.nightVision;
                    
                    // Visual Feedback logic...
                    const btn = document.getElementById('btn-nv');
                    if(this.nightVision) {
                        btn.classList.add('active');
                        audioSys.sfx('ui');
                        showMessage("NIGHT VISION: ON");
                    } else {
                        btn.classList.remove('active');
                        audioSys.sfx('ui');
                        showMessage("NIGHT VISION: OFF");
                    }
                };
                
                const btnNv = document.getElementById('btn-nv');
                btnNv.addEventListener('mousedown', toggleNV); // For mouse users
                btnNv.addEventListener('touchstart', toggleNV); // For touch users (INSTANT RESPONSE)


                
                    // --- PAUSE BUTTON LOGIC ---
                    const btnPause = document.getElementById('btn-pause');
                    const pauseMenuEl = document.getElementById('pause-menu');
                    
                    const togglePause = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    
                        // Option 1: Use existing PauseMenu class if available (Best practice)
                        if (typeof pauseMenu !== 'undefined') {
                            if (pauseMenu.isOpen) pauseMenu.close();
                            else pauseMenu.open();
                            return;
                        }
                    
                        // Option 2: Fallback manual toggle (If PauseMenu class is missing)
                        if (game.paused) {
                            // Resume
                            pauseMenuEl.classList.remove('active');
                            pauseMenuEl.style.display = 'none';
                            game.pauseSystem.release('pause_menu');
                        } else {
                            // Pause
                            pauseMenuEl.style.display = 'flex';
                            // Small delay to allow display:flex to apply before adding class for transition
                            requestAnimationFrame(() => {
                                pauseMenuEl.classList.add('active');
                            });
                            game.pauseSystem.acquire('pause_menu');
                        }
                        
                        // Play sound
                        if (typeof audioSys !== 'undefined') audioSys.sfx('ui');
                    };
                    
                    // Add listeners for both touch and mouse
                    btnPause.addEventListener('mousedown', togglePause);
                    btnPause.addEventListener('touchstart', togglePause);

                
                // Utility dock toggle
                const dockToggle = document.getElementById('dock-toggle');
                const dockButtons = document.getElementById('dock-buttons');
                dockToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    dockToggle.classList.toggle('open');
                    dockButtons.classList.toggle('visible');
                });
                // Close dock when clicking outside
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#utility-dock')) {
                        dockToggle.classList.remove('open');
                        dockButtons.classList.remove('visible');
                    }
                });
                
                this.transitionBtn.addEventListener('click', (e) => { e.preventDefault(); this.triggerTransition(); });
                this.transitionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerTransition(); });
                // Fire button is now a joystick - handlers in initFireJoystick()
                this.shootCooldown = 0; // Cooldown for automatic fire
                // --- HEAL BUTTON: Tap = self, Hold (300ms+) = nearest damaged ally ---
                this._healHoldTimer = null;
                this._healHeld = false;
                
                const healStart = (e) => {
                    e.preventDefault();
                    this._healHeld = false;
                    this._healHoldTimer = setTimeout(() => {
                        this._healHeld = true;
                        this.useBoosterOnAlly();
                    }, 300);
                };
                const healEnd = (e) => {
                    e.preventDefault();
                    if (this._healHoldTimer) {
                        clearTimeout(this._healHoldTimer);
                        this._healHoldTimer = null;
                    }
                    if (!this._healHeld) {
                        // Quick tap — self heal
                        this.useBooster();
                    }
                    this._healHeld = false;
                };
                this.healBtn.addEventListener('mousedown', healStart);
                this.healBtn.addEventListener('touchstart', healStart);
                this.healBtn.addEventListener('mouseup', healEnd);
                this.healBtn.addEventListener('touchend', healEnd);
                this.healBtn.addEventListener('mouseleave', healEnd);
                this.flitBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.triggerFlit(); });
                this.flitBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.triggerFlit(); });
                this.autodriveBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this.toggleAutoDrive(); });
                this.autodriveBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleAutoDrive(); });
                // Handbrake: held for as long as a finger (or the mouse) is on it
                const hbBtn = document.getElementById('btn-handbrake');
                if (hbBtn) {
                    const hbSet = (on) => { this.handbrakeHeld = on; hbBtn.classList.toggle('held', on); };
                    hbBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { hbBtn.setPointerCapture(e.pointerId); } catch (_) {} hbSet(true); });
                    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hbBtn.addEventListener(ev, () => hbSet(false));
                    hbBtn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
                    this.handbrakeBtn = hbBtn;
                }

                this.zibSkipBtn.addEventListener('mousedown', (e) => { e.preventDefault(); if (this.zibSystem) this.zibSystem.teleportToDestination(this); this.zibSkipBtn.style.display = 'none'; });
                this.zibSkipBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.zibSystem) this.zibSystem.teleportToDestination(this); this.zibSkipBtn.style.display = 'none'; });

                const toggleHolster = (e) => {
                    e.preventDefault();
                    this.weaponHolstered = !this.weaponHolstered;
                    if (!this.weaponHolstered) { this._drawnAt = _gameTimeSec; this._drawShotUsed = false; }   // Arms: Quick-Draw
                    this.holsterAnimTarget = this.weaponHolstered ? 0 : 1;
                    if (this.weaponHolstered) {
                        this.holsterBtn.classList.add('holstered');
                        this.holsterBtn.innerHTML = 'DRAW';
                        this.fireBtn.style.display = 'none';
                        this.emoteBtn.style.display = 'flex';
                        showMessage('WEAPON HOLSTERED');
                    } else {
                        this.holsterBtn.classList.remove('holstered');
                        this.holsterBtn.innerHTML = 'HOLSTER';
                        this.fireBtn.style.display = 'flex';
                        this.emoteBtn.style.display = 'none';
                        showMessage('WEAPON DRAWN');
                    }
                };
                this.holsterBtn.addEventListener('mousedown', toggleHolster);
                this.holsterBtn.addEventListener('touchstart', toggleHolster);

                // ── Emote Joystick ──
                // Drag from emote button, four overlays appear over heal/nv/flit/holster slots.
                // Drag finger to a slot → release fires that emote.
                const gameUi = document.getElementById('game-ui');
                const emoteEntries = Object.entries(this.emoteOverlays);

                const emoteStart = (clientX, clientY, touchId) => {
                    if (this.emoteJoystick.active) return;
                    this.emoteJoystick.active = true;
                    this.emoteJoystick.touchId = touchId;
                    this.emoteJoystick.highlighted = null;
                    this.emoteBtn.classList.add('dragging');
                    // Single class toggle drives the cat's-paw crossfade —
                    // utility buttons fade out, emote overlays fade in.
                    gameUi.classList.add('emote-active');
                    // Cache rects AFTER class toggle — getBoundingClientRect forces
                    // synchronous layout so values are valid even mid-fade.
                    // Using rect math (not elementFromPoint) because the overlays carry
                    // pointer-events: none to keep the drag from being stolen.
                    this.emoteJoystick.rects = emoteEntries.map(([key, el]) => ({
                        key,
                        rect: el.getBoundingClientRect()
                    }));
                    // Cache emote button center for knob-lean translation.
                    const btnRect = this.emoteBtn.getBoundingClientRect();
                    this.emoteJoystick.centerX = btnRect.left + btnRect.width / 2;
                    this.emoteJoystick.centerY = btnRect.top + btnRect.height / 2;
                };
                const emoteMove = (clientX, clientY) => {
                    if (!this.emoteJoystick.active) return;
                    let nextHighlight = null;
                    for (const { key, rect } of this.emoteJoystick.rects) {
                        if (clientX >= rect.left && clientX <= rect.right &&
                            clientY >= rect.top  && clientY <= rect.bottom) {
                            nextHighlight = key;
                            break;
                        }
                    }
                    if (nextHighlight !== this.emoteJoystick.highlighted) {
                        if (this.emoteJoystick.highlighted) {
                            this.emoteOverlays[this.emoteJoystick.highlighted].classList.remove('highlighted');
                        }
                        if (nextHighlight) {
                            this.emoteOverlays[nextHighlight].classList.add('highlighted');
                        }
                        this.emoteJoystick.highlighted = nextHighlight;
                    }
                    // Knob-lean — translate the inner knob toward the finger,
                    // clamped to MAX_LEAN so it stays inside the ring.
                    // Using CSS custom properties means the knob's base centering
                    // transform (translate(-50%, -50%)) stays intact; --lx/--ly
                    // just add the offset.
                    const dx = clientX - this.emoteJoystick.centerX;
                    const dy = clientY - this.emoteJoystick.centerY;
                    const dist = Math.hypot(dx, dy);
                    const MAX_LEAN = 18;
                    if (dist > 0) {
                        const clamped = Math.min(dist, MAX_LEAN);
                        const tx = (dx / dist) * clamped;
                        const ty = (dy / dist) * clamped;
                        this.emoteKnob.style.setProperty('--lx', tx + 'px');
                        this.emoteKnob.style.setProperty('--ly', ty + 'px');
                    } else {
                        this.emoteKnob.style.setProperty('--lx', '0px');
                        this.emoteKnob.style.setProperty('--ly', '0px');
                    }
                };
                const emoteEnd = () => {
                    if (!this.emoteJoystick.active) return;
                    const fired = this.emoteJoystick.highlighted;
                    // Clear highlight class but leave the crossfade to CSS — class
                    // toggle on game-ui handles the fade-out for both groups.
                    if (fired) {
                        this.emoteOverlays[fired].classList.remove('highlighted');
                    }
                    gameUi.classList.remove('emote-active');
                    this.emoteBtn.classList.remove('dragging');
                    // Snap-back — clearing the inline custom props lets the CSS
                    // `transition: transform 0.18s` ease the knob home.
                    this.emoteKnob.style.setProperty('--lx', '0px');
                    this.emoteKnob.style.setProperty('--ly', '0px');
                    this.emoteJoystick.active = false;
                    this.emoteJoystick.touchId = null;
                    this.emoteJoystick.highlighted = null;
                    if (fired) this.firePlayerEmote(fired);
                };

                // Touch
                this.emoteBtn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const t = e.changedTouches[0];
                    emoteStart(t.clientX, t.clientY, t.identifier);
                }, { passive: false });
                this.emoteBtn.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const t = e.changedTouches[i];
                        if (t.identifier === this.emoteJoystick.touchId) {
                            emoteMove(t.clientX, t.clientY);
                            break;
                        }
                    }
                }, { passive: false });
                const touchEndEmote = (e) => {
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === this.emoteJoystick.touchId) {
                            emoteEnd();
                            break;
                        }
                    }
                };
                this.emoteBtn.addEventListener('touchend', touchEndEmote);
                this.emoteBtn.addEventListener('touchcancel', touchEndEmote);

                // Mouse (for desktop playtesting)
                this.emoteBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    emoteStart(e.clientX, e.clientY, 'mouse');
                });
                window.addEventListener('mousemove', (e) => {
                    if (this.emoteJoystick.active && this.emoteJoystick.touchId === 'mouse') {
                        emoteMove(e.clientX, e.clientY);
                    }
                });
                window.addEventListener('mouseup', (e) => {
                    if (this.emoteJoystick.active && this.emoteJoystick.touchId === 'mouse') {
                        emoteEnd();
                    }
                });

                // Dialogue buttons: what each NPC's Accept and Decline do lives in story/npc-dialogue.js
                this.btnAccept.addEventListener('click', () => {
                    // DialogueSequence intercept (bonding, story, briefings, etc.)
                    if (this.dialogueSeq && this.dialogueSeq.isActive()) {
                        this.dialogueSeq.advance();
                        return;
                    }
                    const npc = this.activeInteraction;
                    if (npc instanceof NPC) {
                        const D = npcDialogueFor(npc);
                        if (this._extraDialogueBtn) this._extraDialogueBtn.style.display = 'none';
                        if (D.endFirst) { this.endDialogue(); if (D.accept) D.accept(this, npc); return; }   // it opens a menu of its own
                        if (D.accept) D.accept(this, npc);
                    }
                    this.endDialogue();
                });

                this.btnDecline.addEventListener('click', () => { 
                    const npc = this.activeInteraction;
                    const D = npc instanceof NPC ? npcDialogueFor(npc) : null;
                    if (this._extraDialogueBtn) this._extraDialogueBtn.style.display = 'none';
                    this.endDialogue();
                    if (D && D.decline) D.decline(this, npc);
                });
            },

        });

