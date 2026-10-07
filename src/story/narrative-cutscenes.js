        class CutsceneManager {
            constructor(game) {
                this.game = game;
                this.active = false;
                
                // Camera control
                this.camTargetX = 0;
                this.camTargetY = 0;
                this.camZoomTarget = 1.0;
                
                // UI Elements
                this.overlay = document.getElementById('intro-title-overlay');
                this.bars = document.getElementById('cinematic-bars');
            }
        
            start() {
                this.active = true;
                this.game.scenes?.ui?.showPause(true);
                window.pauseMenuController?._syncCutsceneMenu();
                // 1. Letterbox Effect
                if (this.bars) this.bars.classList.add('active'); 
                
                // 2. (Input is locked by the scene runner while a scene plays: ScenePlayer._lockInput)
                
                // 3. Hide HUD
                const ui = document.getElementById('game-ui');
                if (ui) { ui.style.opacity = '0'; syncHudInput(this.game); } 
                
                // 4. Take initial control of camera logic
                // We sync the target to the camera's current spot so it doesn't "jump"
                this.camTargetX = this.game.camera.x;
                this.camTargetY = this.game.camera.y;
                this.camZoomTarget = this.game.camera.zoom;
            }
        
            end() {
                this.active = false;
                this.game.scenes?.ui?.showPause(false);
                window.pauseMenuController?._syncCutsceneMenu();
                // 1. Remove Letterbox
                if (this.bars) this.bars.classList.remove('active');
                
                
                // 3. Show HUD
                const ui = document.getElementById('game-ui');
                if (ui) { ui.style.opacity = '1'; syncHudInput(this.game); }
                
                // 4. Ensure Title Text is gone
                if (this.overlay) this.overlay.style.opacity = '0'; 
            }
        
            showTitle(duration) {
                if (this.overlay) {
                    this.overlay.style.opacity = '1';
                    this.game.addPausableTimeout(() => {
                        this.overlay.style.opacity = '0';
                    }, duration);
                }
            }
        
            /**
             * Pan camera to a location. Supports both raw coords and modular IDs.
             * * Usage A: panTo('club_entrance', 0.8)  -> Uses getLandmark()
             * Usage B: panTo(500, 500, 1.0)         -> Uses raw coordinates
             */
            panTo(arg1, arg2, arg3 = 1.0) {
                // MODE 1: Modular ID (String)
                // arg1 = "landmark_id", arg2 = zoom
                if (typeof arg1 === 'string') {
                    const targetId = arg1;
                    const zoom = arg2 || 1.0;
        
                    // Resolve location via GameEngine
                    // (Assumes you added the getLandmark method to GameEngine!)
                    if (this.game.getLandmark) {
                        const loc = this.game.getLandmark(targetId);
                        this.camTargetX = loc.x;
                        this.camTargetY = loc.y;
                    } else {
                        console.warn(`CutsceneManager: getLandmark('${targetId}') failed. GameEngine method missing.`);
                        // Fallback to player position to prevent crash
                        this.camTargetX = this.game.player.x;
                        this.camTargetY = this.game.player.y;
                    }
                    
                    this.camZoomTarget = zoom;
                } 
                // MODE 2: Raw Coordinates (Number)
                // arg1 = x, arg2 = y, arg3 = zoom
                else {
                    this.camTargetX = arg1;
                    this.camTargetY = arg2;
                    this.camZoomTarget = arg3;
                }
            }
        
            update() {
                if (!this.active) return;
        
                // Smooth Pan Interpolation (Lerp)
                // 0.04 provides a cinematic "heavy camera" feel
                this.game.camera.x += (this.camTargetX - this.game.camera.x) * 0.04;
                this.game.camera.y += (this.camTargetY - this.game.camera.y) * 0.04;
                
                // Smooth Zoom Interpolation
                this.game.camera.zoom += (this.camZoomTarget - this.game.camera.zoom) * 0.02;
            }
        }
        
        /* =====================================================================
           NARRATIVE STATE MACHINE (The Logic Engine)
           ---------------------------------------------------------------------
           Translates raw DB data into game logic conditions.
           ===================================================================== */
        /* =====================================================================
           NARRATIVE STATE MACHINE (Event-Driven Refactor)
           ---------------------------------------------------------------------
           Receives direct signals from game systems (Phone, etc.) and stores
           them as state flags. This prevents missing rapid interactions.
           ===================================================================== */
        class NarrativeStateMachine {
            constructor(game) {
                this.game = game;
                this.db = STORY_DB;
                
                // NEW: Event Memory
                // Stores flags that stay true until explicitly cleared or checked
                this.flags = {
                    phoneOpenedContacts: false,
                    messageReadMirabel: false,
                    lastContactOpened: null
                };
            }
            
            // NEW: Direct Event Receiver
            // Systems call this: game.story.nsm.notifyEvent('CONTACTS_OPENED', {contact: 'Mirabel'})
            notifyEvent(eventType, payload = {}) {
                console.log(`NSM RECEIVED EVENT: ${eventType}`, payload);
                
                if (eventType === 'APP_OPENED' && payload.app === 'contacts') {
                    this.flags.phoneOpenedContacts = true;
                }
                
                if (eventType === 'CONTACT_VIEWED') {
                    this.flags.lastContactOpened = payload.name;
                    if (payload.name === 'Mirabel') {
                        this.flags.messageReadMirabel = true;
                        // Forward specific event to Story Manager for immediate triggers
                        this.game.story.onMessageRead(payload.name);
                    }
                }
            }
        
            getStepData(part, chapter, mission, step) {
                try {
                    if (!this.db[part]) return null;
                    if (!this.db[part].chapters[chapter]) return null;
                    if (!this.db[part].chapters[chapter].missions[mission]) return null;
                    return this.db[part].chapters[chapter].missions[mission].steps[step] || null;
                } catch (e) {
                    return null;
                }
            }

            getActiveMission(part, chapter, mission) {
                try {
                    return this.db[part]?.chapters[chapter]?.missions[mission] || null;
                } catch (e) {
                    return null;
                }
            }
        
            checkCondition(conditionString, timerValue) {
                const g = this.game;
                
                switch (conditionString) {
                    case "PHONE_OPENED_CONTACTS":
                        // Check our latched flag OR the live state
                        if (this.flags.phoneOpenedContacts) return true;
                        // Fallback: If they are currently looking at contacts or a detail page
                        if (phoneSystem.isOpen && (phoneSystem.currentApp === 'contacts' || phoneSystem.currentApp === 'details')) {
                            this.flags.phoneOpenedContacts = true;
                            return true;
                        }
                        return false;
        
                    case "MESSAGE_READ_MIRABEL":
                        return this.flags.messageReadMirabel;
        
                    case "PLAYER_IN_OWNED_CAR":
                        return g.isDriving && g.car === g.ownedCar;
        
                    case "LOC_NIGHTCLUB":
                        return g.activeMap.id === 'moon_city_nightclub';
        
                    case "LOC_HUB":
                        return g.activeMap.id === 'hub_949';
        
                    case "LOC_HOTEL_LOBBY":
                        return g.activeMap.id === 'hotel_lobby';
        
                    case "HAS_KEYCARD":
                        return g.questState.hasKeycard;

                    case "LOC_HOTEL_SUITE":
                        return g.activeMap.id === 'hotel_suite';

                    case "LOC_CHURCH_BOSS":
                        return g.activeMap.id === 'church_boss';

                    case "PLAYER_DEEP_IN_SUITE":
                        return g.activeMap.id === 'hotel_suite' && g.player.y > 800;

                    case "AMBUSH_CLEARED":
                        return g.questState.suiteAmbushTriggered && g.enemies.length === 0;

                    case "CONTRACTOR_REWARDED":
                        return g.questState.rewardClaimedContractor;

                    case "CHURCH_BOSS_DEFEATED":
                        return g.activeMap.id === 'church_boss' && g.enemies.length === 0;
        
                    default: {
                        // TIMER_<ticks>, and LOC_<map id> for any map
                        const m = /^TIMER_(\d+)$/.exec(conditionString);
                        if (m) return timerValue >= +m[1];
                        if (conditionString.startsWith('LOC_')) return g.activeMap.id === conditionString.slice(4).toLowerCase();
                        return false;
                    }
                }
            }
        }

        /* =====================================================================
           STORY MANAGER (The Controller)
           ---------------------------------------------------------------------
           Manages the timeline using the State Machine.
           ===================================================================== */
        class StoryManager {
            constructor(game) {
                this.game = game;
                this.nsm = new NarrativeStateMachine(game);
                
                // Main story state
                this.state = { part: 1, chapter: 1, mission: 1, step: 0 };
                
                this.currentStepData = null;
                this.stepTimer = 0; 
                this.initializedStep = false;

                // Optional quest state
                this.activeOptional = null;       // { id, step, stepData, timer, initialized }
                this.completedOptional = [];       // ['sanctum', ...]
            }
        
            /** New Game, after the Keeper's prologue: chapter 1 opens in the van (story/scenes/van.js). */
            startPrologue() {
                console.log("STORY: Chapter 1 — the van");
                const g = this.game;
                this.state = { part: 1, chapter: 1, mission: 1, step: 0 };
                this.stepTimer = 0; this.watchers = [];
                if (typeof phoneSystem !== 'undefined') {
                    phoneSystem.close();
                    phoneSystem.contactOverrides = {};
                    phoneSystem.seedDefaultContacts();
                }
                if (g.hud) g.hud.startFresh();                        // the HUD arrives piece by piece (ui/hud-reveal.js)
                if (g.coach) g.coach.deserialize([]);
                for (const t of g.teammates || []) t.recruited = true;   // a team from the start
                this.currentStepData = this.nsm.getStepData(1, 1, 1, 0);
                this.initializedStep = true;
                this.playVan();
            }

            /** The van scene, then the hand-over at the hotel door (also after a skip). */
            playVan() {
                return this.game.scenes.play('van').then(() => vanAftermath(this.game));
            }

            /** A check run every tick until it returns true (the chapter's one-off hints). */
            watch(fn) { (this.watchers || (this.watchers = [])).push(fn); }
            _runWatchers() {
                if (!this.watchers || !this.watchers.length) return;
                this.watchers = this.watchers.filter(w => { try { return !w(this.game); } catch (e) { console.error(e); return false; } });
            }

            /** After the ambush the BlackMark waits at the hotel curb. */
            placeCarAtHotel() {
                const c = this.game.ownedCar; if (!c) return;
                c.x = 1764; c.y = 960; c.angle = Math.PI / 2;   // on the Double Nights drive (buildings/double-nights.js) c.vx = 0; c.vy = 0; if ('speed' in c) c.speed = 0;
            }

            /** Seven holds the lobby while the crew goes up (chapter 1). */
            _sevenInLobby() {
                const g = this.game;
                if (!g.activeMap || g.activeMap.id !== 'hotel_lobby' || !g.questState.vanDone) return;
                if (!this.isBefore('LEAVE_HOTEL') || (g.npcs || []).some(n => n.name === '747')) return;
                const n = new NPC(560, 1030, '747', 'story', {});
                n.angle = -Math.PI / 2;
                g.npcs.push(n);
            }
            
            // Direct Event Handler
            onMessageRead(contactName) {
                // (Chapter 1 no longer waits on a text; the hook stays for chapters that will.)
            }
        
            update() {
                if (this.game.scenes && this.game.scenes.running) return;   // the story waits while a scene plays
                if (this._needsRecruit) { this._needsRecruit = false; for (const t of this.game.teammates || []) t.recruited = true; }
                if (this.state.part === 1) {
                    this.checkOverrides(); 
                    this._sevenInLobby();
                }
                this._runWatchers();

                // ── OPTIONAL QUESTS (run regardless of main story state) ──
                this.updateOptional();
        
                // 1. Load Data
                if (!this.currentStepData) {
                    this.currentStepData = this.nsm.getStepData(
                        this.state.part, this.state.chapter, this.state.mission, this.state.step
                    );
                    if (!this.currentStepData) return; // End of main content
                }

                // Skip main step processing if condition is null (terminal step)
                if (this.currentStepData.condition === null && this.initializedStep) return;
        
                // 2. Initialize Step
                if (!this.initializedStep) {
                    console.log(`STORY: Starting Step ${this.state.step} [${this.currentStepData.name}]`);
                    
                    if (this.currentStepData.banner) {
                        this.game.ui.showMissionBanner(this.currentStepData.banner, "new");
                    }
                    
                    if (this.currentStepData.onStart) {
                        this.currentStepData.onStart(this.game);
                    }
                    
                    this.stepTimer = 0;
                    this.initializedStep = true;
                }
        
                // 3. Logic Tick
                this.stepTimer++;
        
                // 4. Check Completion
                if (this.currentStepData.condition) {
                    const c = this.currentStepData.condition;
                    const isComplete = typeof c === 'function' ? c(this.game, this.stepTimer) : this.nsm.checkCondition(c, this.stepTimer);
                    if (isComplete) {
                        console.log(`STORY: Step ${this.state.step} Condition Met.`);
                        this.advanceStep();
                    }
                }
            }
        
            // ── Steps by name (story-db.js names every step): numbers shift when a chapter changes; names don't
            _stepsOf(st = this.state) { const M = this.nsm.db[st.part]?.chapters[st.chapter]?.missions[st.mission]; return M ? M.steps : {}; }
            stepIndex(name) {
                const S = this._stepsOf();
                for (const k in S) if (S[k].name === name) return +k;
                throw new Error('No story step named ' + name);
            }
            isAt(name) { return this.state.step === this.stepIndex(name); }
            isBefore(name) { return this.state.step < this.stepIndex(name); }
            /** Jump to a named step (its onStart runs on the next update). */
            goTo(name) {
                this.state.step = this.stepIndex(name);
                this.currentStepData = null; this.initializedStep = false;
            }

            advanceStep() {
                this.state.step++;
                this.currentStepData = null; 
                this.initializedStep = false;
            }
        
            // Fail-safes: the world says where the story is (an older save, a skipped beat)
            checkOverrides() {
                const mapId = this.game.activeMap.id;
                const qs = this.game.questState;
                if (!qs.vanDone) return;                                   // still in the van

                if (mapId === 'hotel_lobby' && this.isBefore('TAKE_ELEVATOR')) this.goTo('TAKE_ELEVATOR');
                if (mapId === 'hotel_suite' && this.isBefore('SEARCH_SUITE')) this.goTo('SEARCH_SUITE');
                if (qs.ambushCleared && this.isBefore('FIND_NOTE')) this.goTo('FIND_NOTE');
                if ((this.game.foundNotes || []).includes('dark_maker_letter') && qs.ambushCleared && this.isBefore('LEAVE_HOTEL')) this.goTo('LEAVE_HOTEL');
                if (qs.rewardClaimedContractor && this.isBefore('CHAPTER_COMPLETE')) this.goTo('CHAPTER_COMPLETE');

                // The Sanctum: mark it complete if the boss is already down
                if (qs.churchBossDefeated && !this.completedOptional.includes('sanctum')) {
                    this.completedOptional.push('sanctum');
                }
            }
        
            cleanupPhone() {
                // Clears Mirabel specifically; any other genuinely unread contact
                // keeps its badge, because the UI is now derived rather than wiped.
                if (typeof phoneSystem !== 'undefined') phoneSystem.markRead('Mirabel');
            }
        
            triggerComms(speaker, text, duration) {
                const bar = document.getElementById('comms-bar');
                const sEl = document.getElementById('comms-speaker');
                const tEl = document.getElementById('comms-text');
                const pEl = document.getElementById('comms-portrait');
                
                sEl.textContent = speaker;
                tEl.textContent = text;
                
                if (speaker === '747') {
                    pEl.style.backgroundColor = '#4b0082'; pEl.style.borderColor = '#ffd700'; 
                } else if (speaker === '949') {
                    pEl.style.backgroundColor = '#1a1a1a'; pEl.style.borderColor = '#ff00ff'; 
                } else if (speaker === 'LARISSA') {
                    pEl.style.backgroundColor = '#f5f5f5'; pEl.style.borderColor = '#c0c0c0'; 
                } else {
                    pEl.style.backgroundColor = '#333'; pEl.style.borderColor = '#fff';
                }
                
                bar.classList.add('active');
                // Use pausable timer so the message doesn't self-dismiss during a pause.
                if (this.commsTimer) this.game.cancelPausableTimeout(this.commsTimer);
                this.commsTimer = this.game.addPausableTimeout(() => { bar.classList.remove('active'); }, duration);
            }

            // ── OPTIONAL QUEST SYSTEM ──

            /** Check if any optional quest triggers match. Called each frame after main update. */
            updateOptional() {
                // If an optional quest is active, advance it
                if (this.activeOptional) {
                    const opt = this.activeOptional;

                    // Initialize step
                    if (!opt.initialized) {
                        console.log(`STORY [OPTIONAL ${opt.id}]: Starting step ${opt.step} [${opt.stepData.name}]`);
                        if (opt.stepData.banner) {
                            this.game.ui.showMissionBanner(opt.stepData.banner, "new");
                        }
                        if (opt.stepData.onStart) {
                            opt.stepData.onStart(this.game);
                        }
                        opt.timer = 0;
                        opt.initialized = true;
                    }

                    opt.timer++;

                    // Check condition
                    if (opt.stepData.condition) {
                        if (this.nsm.checkCondition(opt.stepData.condition, opt.timer)) {
                            console.log(`STORY [OPTIONAL ${opt.id}]: Step ${opt.step} complete.`);
                            this.advanceOptionalStep();
                        }
                    }
                    return;
                }

                // No active optional — scan for triggers
                const mission = this.nsm.getActiveMission(this.state.part, this.state.chapter, this.state.mission);
                if (!mission || !mission.optional) return;

                for (const optDef of mission.optional) {
                    if (this.completedOptional.includes(optDef.id)) continue;
                    if (!optDef.trigger) continue;

                    if (this.nsm.checkCondition(optDef.trigger, 0)) {
                        // Activate this optional quest
                        const stepData = optDef.steps[0];
                        if (!stepData) continue;
                        this.activeOptional = {
                            id: optDef.id,
                            name: optDef.name,
                            def: optDef,
                            step: 0,
                            stepData: stepData,
                            timer: 0,
                            initialized: false
                        };
                        console.log(`STORY [OPTIONAL]: Activated "${optDef.name}"`);
                        break;
                    }
                }
            }

            advanceOptionalStep() {
                const opt = this.activeOptional;
                const nextStep = opt.step + 1;
                const nextData = opt.def.steps[nextStep];

                if (nextData && nextData.condition !== null) {
                    // More steps
                    opt.step = nextStep;
                    opt.stepData = nextData;
                    opt.timer = 0;
                    opt.initialized = false;
                } else if (nextData && nextData.condition === null) {
                    // Terminal step — run onStart then mark complete
                    if (nextData.onStart) nextData.onStart(this.game);
                    this.completedOptional.push(opt.id);
                    this.activeOptional = null;
                    console.log(`STORY [OPTIONAL]: Completed "${opt.name}"`);
                } else {
                    // No more steps — mark complete
                    this.completedOptional.push(opt.id);
                    this.activeOptional = null;
                    console.log(`STORY [OPTIONAL]: Completed "${opt.name}"`);
                }
            }

            // ── SAVE / LOAD ──

            /**
             * Saves carry the step's name; older ones only its number in the old chapter 1
             * (apartment → club → hotel). Those map by name; the retired opening (apartment,
             * car, club) resumes at the hotel door with the team and the keycard.
             */
            _migrateStep(data) {
                const st = this.state, has = n => { try { this.stepIndex(n); return true; } catch (e) { return false; } };
                if (data.stepName && has(data.stepName)) { st.step = this.stepIndex(data.stepName); return; }
                if (data.stepName || st.part !== 1 || st.chapter !== 1 || st.mission !== 1) return;
                const OLD = ['INTRO_SEQUENCE', 'CHECK_PHONE', 'LEAVE_APARTMENT', 'CAR_REVEAL', 'ENTER_VEHICLE', 'DRIVE_CLUB', 'WAIT_FOR_TEXT', 'READ_MESSAGE',
                             'FIND_MIRABEL', 'LEAVE_CLUB', 'ARRIVE_HOTEL', 'ENTER_SUITE', 'SEARCH_SUITE', 'SURVIVE_AMBUSH', 'REPORT_BACK', 'CHAPTER_COMPLETE'];
                const RENAMED = { ARRIVE_HOTEL: 'ENTER_HOTEL', ENTER_SUITE: 'TAKE_ELEVATOR', REPORT_BACK: 'REPORT_TO_MIRABEL' };
                const old = OLD[st.step], name = RENAMED[old] || old;
                const qs = this.game.questState;
                qs.vanDone = true; qs.hasKeycard = true;
                if (qs.mirabelFavor === undefined) qs.mirabelFavor = 1;
                this._needsRecruit = true;
                st.step = this.stepIndex(old && has(name) ? name : 'ENTER_HOTEL');
            }

            serialize() {
                return {
                    state: { ...this.state },
                    stepName: this.currentStepData ? this.currentStepData.name : (this.nsm.getStepData(this.state.part, this.state.chapter, this.state.mission, this.state.step) || {}).name,
                    completedOptional: [...this.completedOptional],
                    // Persist mid-quest progress; def/stepData re-derive from NSM on load
                    activeOptional: this.activeOptional ? {
                        id: this.activeOptional.id,
                        step: this.activeOptional.step
                    } : null
                };
            }

            deserialize(data) {
                if (!data) return;
                if (data.state) {
                    this.state = data.state;
                    this.currentStepData = null;
                    this.initializedStep = false;
                    this.stepTimer = 0;
                    this.watchers = [];
                    this._migrateStep(data);
                }
                if (data.completedOptional) {
                    this.completedOptional = data.completedOptional;
                }

                // Restore active optional quest (re-derive def/stepData from registry)
                this.activeOptional = null;
                if (data.activeOptional && data.activeOptional.id &&
                    !this.completedOptional.includes(data.activeOptional.id)) {
                    const mission = this.nsm.getActiveMission(
                        this.state.part, this.state.chapter, this.state.mission
                    );
                    if (mission && mission.optional) {
                        const optDef = mission.optional.find(o => o.id === data.activeOptional.id);
                        const step = data.activeOptional.step || 0;
                        const stepData = optDef && optDef.steps ? optDef.steps[step] : null;
                        if (optDef && stepData) {
                            this.activeOptional = {
                                id: optDef.id,
                                name: optDef.name,
                                def: optDef,
                                step: step,
                                stepData: stepData,
                                timer: 0,           // reset runtime timer
                                initialized: false  // re-fires onStart on next tick (matches main-step convention)
                            };
                            console.log(`STORY [LOAD]: Restored optional "${optDef.name}" at step ${step}`);
                        } else {
                            console.warn(`STORY [LOAD]: Could not restore optional "${data.activeOptional.id}" — not found in current mission's optional list`);
                        }
                    }
                }
            }
        }
        
        /**
         * PROCEDURAL HUMANOID RENDERER (Updated with Casual Hair Physics)
         */
        /**
         * PROCEDURAL HUMANOID RENDERER (Gendered Proportions)
         * Supports 'male', 'female', 'androgynous' body types.
         */
        /**
         * PROCEDURAL HUMANOID RENDERER (FINAL)
         * - Gendered Proportions
         * - Weapon Stances
         * - Clothing Layers
         * - RESTORED: Directional Strafing
         */
        /**
         * PROCEDURAL HUMANOID RENDERER (Updated Female Proportions)
         */
        /**
         * PROCEDURAL HUMANOID RENDERER
         * - Updated: Skirt is now perfectly form-fitting (matches hip geometry).
         */

        // ============================================================================
        //  HUMANOID SUB-RENDERERS — Hair, Head, Held Items
        //  Extracted from drawProceduralHumanoid for reuse across driving/walking modes.
        // ============================================================================
        
        /** Hair style renderers. Each takes (ctx, color, headX, dyn:{drag,bounce,wiggle}). */
        // ════════════════════════════════════════════════════════════════════════
        //  HAIR PHYSICS — strands that swing, trail and bob
        // ════════════════════════════════════════════════════════════════════════
        //  Ponytails, braids, long hair, locs and tendrils are chains of points
        //  simulated in WORLD space (verlet + fixed segment lengths), so they keep
        //  their length, lag behind when you move, swing around when you turn and
        //  bob with each stride. Volume styles (afro, curls, short) ride a small
        //  spring for a bouncy jiggle. Everything steps in fixed 1/120s slices of
        //  GAME time: same at any frame rate, slower at lower game speed, frozen
        //  while paused. Off the main canvas (portraits, previews) hair is drawn in
        //  its rest pose.
        //
        //  Layouts are in the head's frame: x forward, y to the character's right,
        //  so "hanging down the back" points toward -x.
        let _worldMatrix = null;   // world → screen for the current frame (set in GameEngine.draw)
        let _worldCanvas = null;

        /** Shade a hair colour (frac > 0 darker, < 0 lighter); non-hex colours pass through. */
        function _hairShade(color, frac) {
            return (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) ? darkenHex(color, Math.floor(255 * frac)) : color;
        }

