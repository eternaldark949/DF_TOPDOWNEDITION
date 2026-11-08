        // GameEngine — Input and UI event wiring (keyboard, touch, buttons).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /** Interact with whatever is in reach (the action pill, or E on a keyboard): talk, use, enter or leave the car. */
            interact() {
                if (this.activeInteraction && this.activeInteraction.type === 'execute') { this.execute(this.activeInteraction.target); return; }
                if (this.activeInteraction) {
                    if(this.activeInteraction.interactionType === 'neural_counter') {
                        const prisma=this.npcs.find(n=>n.name==='Prisma');
                        if(prisma)this.startDialogue(prisma);
                    } else if(this.activeInteraction.interactionType === 'medbay_refill') {
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
                    } else if(this.activeInteraction.interactionType === 'bar_cart') {
                        this.refillGlass();                            // (engine/spills.js)
                    } else if(this.activeInteraction.interactionType === 'clothing_dyer') {
                        this.openDyer();                               // (engine/dyer.js)
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
                        this.pickUpPackage();                          // the package by the van (engine/markers.js)
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
                    } else if(this.activeInteraction.type === 'drive') {
                        // one of hers (engine/cars.js): she walks round to the driver's door first
                        const car = this.activeInteraction.target;
                        if (this._walkToCar(car)) return;
                        this.enterCar(car);
                    } else if(this.activeInteraction.type === 'hijack') {
                        this.hijackVehicle(this.activeInteraction.target);
                    } else if(this.activeInteraction instanceof NPC) {
                        this.startDialogue(this.activeInteraction);
                    }
                } else if (this.isDriving) {
                    this.toggleVehicle();                              // Exit
                }
            },

            /** Getting into one of her cars on foot: walk to the driver's door (Walker.goTo), face the car, then get in.
             *  True when a walk started (or is already on); close enough, or turned off, gets in at once. */
            _walkToCar(car) {
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
                // On the far side? Round the nose or the tail (the nav grid doesn't know about cars): the nearer, unless
                // it's against a wall (Amber's van has the cafe at its back) and the other end is open
                const [plx, ply] = L(this.player.x, this.player.y), via = [], ew = hw + 32;
                if (Math.sign(ply) !== side && Math.abs(plx) < hl + 20) {
                    let ex = plx >= 0 ? hl + 30 : -(hl + 30);
                    const open = e => !nav || (nav.walkable(...W(e, Math.sign(ply || 1) * ew)) && nav.walkable(...W(e, side * ew)));
                    if (!open(ex) && open(-ex)) ex = -ex;
                    via.push(W(ex, Math.sign(ply || 1) * ew), W(ex, side * ew));
                } else if (shapeKit.segmentHitsRect(plx, ply, hl * 0.2, side * (hw + 20), -(hl + 17), -(hw + 17), hl + 17, hw + 17)) {
                    // Behind it or in front (either side): the straight line to the door cuts the corner, so round the
                    // corner on the door's side of the end she's at first, then along the side to the door
                    via.push(W(Math.sign(plx || -1) * (hl + 30), side * ew));
                }
                // Arrived, or stuck on the way but still beside it: in either way (the walk is how she gets in, not whether)
                const getIn = () => { if (!this.isDriving && car.visible && Math.hypot(car.x - this.player.x, car.y - this.player.y) < 90) this.enterCar(car); };
                const h = Walker.goTo(this.player, door.x, door.y, { face: [car.x, car.y], arrive: 7, timeout: 240, via, onArrive: getIn, onFail: getIn });
                if (this.player._walk) this.player._walk.toCar = true;
                return !!h;
            },

            /** The app went to the background (another app, the lock screen, the tab hidden or closed): save quietly
                to the Autosave slot, stop the radio, and open the pause menu so she isn't ambushed on return. */
            onPageHidden() {
                if (!this.running) return;
                clearGameplayInputs(this);
                try { this.saveGame({ auto: true }); } catch (e) { console.warn('autosave', e); }
                if (this.musicWidget && this.musicWidget.isPlaying) this.musicWidget.togglePlay(false);
                const pm = typeof pauseMenuController !== 'undefined' ? pauseMenuController : null;
                if (pm && !pm.isOpen && !this.paused && !(this.scenes && this.scenes.running)) pm.open(true);
            },

            /** Night vision on or off (the 👁️ button, D-pad ↓). */
            toggleNightVision() {
                this.nightVision = !this.nightVision;
                document.getElementById('btn-nv')?.classList.toggle('active', this.nightVision);
                audioSys.sfx('ui'); showMessage(this.nightVision ? "NIGHT VISION: ON" : "NIGHT VISION: OFF");
            },

            initEvents() {
                window.addEventListener('resize', () => { this.resize(); });
                document.addEventListener('visibilitychange', () => { if (document.hidden) this.onPageHidden(); });
                window.addEventListener('pagehide', () => this.onPageHidden());
                // Keys and controller buttons: directory/game-controls.js (the controls system)
                
                // DESKTOP MOUSE CONTROLS for aiming and shooting
                this.mouseX = 0;
                this.mouseY = 0;
                this.mouseDown = false;
                
                const aimMouse = (e) => {
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
                };
                this.canvas.addEventListener('mousemove', aimMouse);
                
                this.canvas.addEventListener('mousedown', (e) => {
                    if (!this.running || this.paused || hudInputBlocked()) return;
                    if (e.button !== 0) return;
                    aimMouse(e);
                    this.mouseDown = true;
                });
                
                window.addEventListener('mouseup', (e) => {
                    if (e.button === 0 && this.mouseDown && this._quickDraw) {
                        aimMouse(e);
                        const p = this.viewToWorld(this.mouseX, this.mouseY);
                        this.requestQuickDraw(Math.atan2(p.y - this.player.y, p.x - this.player.x), p);
                    }
                    this.mouseDown = false;
                });
                
                // The HUD's buttons are inputs of the controls system (directory/game-controls.js: dfTouchButtons)
                controls.touch.buttons(dfTouchButtons);
                this._cancelGrabHold = () => controls.touch.drop('touchGrab');
                // Choosing a side: a tap on a handle (world space) picks it, before anything else hears the tap
                this.canvas.addEventListener('pointerdown', (e) => {
                    if (!this.running || this.paused || hudInputBlocked() || !this.furniture || this.furniture.state !== 'choose') return;
                    const rect = this.canvas.getBoundingClientRect(), sx = rect.width ? this.canvas.width / rect.width : 1, sy = rect.height ? this.canvas.height / rect.height : 1;
                    const w = this.viewToWorld((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
                    if (this.furniture.tap(w.x, w.y)) { e.preventDefault(); e.stopImmediatePropagation(); }
                }, true);
                
                // 2. Main Menu Load Button — opens save slot selector
                document.getElementById('btn-load-game').addEventListener('click', () => {
                    FullscreenManager.requestIfEnabled();
                    audioSys.init();
                    if (typeof saveSlotManager !== 'undefined' && saveSlotManager.hasAnySave()) {
                        // The chosen save loads under the loading screen (engine/loop.js loadIntoWorld)
                        saveSlotManager.open('load', null, { loadVia: (load) => this.loadSaveFromMenu(load) });
                    } else {
                        showMessage('NO SAVE FILES FOUND.');
                        audioSys.sfx('ui');
                    }
                });

                
                this.shootCooldown = 0; // Cooldown for automatic fire (the fire button is a joystick: initFireJoystick())
                this.handbrakeBtn = document.getElementById('btn-handbrake');
                this.initQuickDrawControl();

                // ── Emote Joystick ──
                // Drag from emote button, four overlays appear over heal/nv/flit/holster slots.
                // Drag finger to a slot → release fires that emote.
                const gameUi = document.getElementById('game-ui');

                // The stick (basement/controls-system.js touchStick): the knob leans up to 18 px; the slot under the finger lights
                const E = this.emoteJoystick;
                controls.touch.stick('emote', { zone: this.emoteBtn, knob: this.emoteKnob, travel: 18, slots: this.emoteOverlays, mouse: true,
                    onStart: (S) => {
                        Object.assign(E, { active: true, touchId: S.id, highlighted: null });
                        this.emoteBtn.classList.add('dragging');
                        gameUi.classList.add('emote-active');   // one class: the utility buttons fade out, the emote overlays in
                    },
                    onMove: (S) => { E.highlighted = S.slot; },
                    onEnd: (S) => {
                        gameUi.classList.remove('emote-active');
                        this.emoteBtn.classList.remove('dragging');   // the knob eases home (CSS transition)
                        Object.assign(E, { active: false, touchId: null, highlighted: null });
                        if (S.slot) this.firePlayerEmote(S.slot);
                    },
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
                        if (this._extraDialogueBtn) uiKit.hide(this._extraDialogueBtn);
                        if (D.endFirst) { this.endDialogue(); if (D.accept) D.accept(this, npc); return; }   // it opens a menu of its own
                        if (D.accept) D.accept(this, npc);
                    }
                    this.endDialogue();
                });

                // Veil: a tap on the line goes on to the next one (the buttons keep their own taps)
                document.querySelector('#dialogue-box .dialogue-inner').addEventListener('click', (e) => {
                    if (typeof TalkStyle === 'undefined' || TalkStyle.get() !== 'veil' || e.target.closest('button')) return;
                    if (this.dialogueSeq && this.dialogueSeq.isActive() && this.btnAccept.style.display !== 'none') this.btnAccept.click();
                });

                this.btnDecline.addEventListener('click', () => { 
                    const npc = this.activeInteraction;
                    const D = npc instanceof NPC ? npcDialogueFor(npc) : null;
                    if (this._extraDialogueBtn) uiKit.hide(this._extraDialogueBtn);
                    this.endDialogue();
                    if (D && D.decline) D.decline(this, npc);
                });
            },

        });

