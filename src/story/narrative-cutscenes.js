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
                
                // 1. Letterbox Effect
                if (this.bars) this.bars.classList.add('active'); 
                
                // 2. (Input is locked by the scene runner while a scene plays: ScenePlayer._lockInput)
                
                // 3. Hide HUD
                const ui = document.getElementById('game-ui');
                if (ui) ui.style.opacity = '0'; 
                
                // 4. Take initial control of camera logic
                // We sync the target to the camera's current spot so it doesn't "jump"
                this.camTargetX = this.game.camera.x;
                this.camTargetY = this.game.camera.y;
                this.camZoomTarget = this.game.camera.zoom;
            }
        
            end() {
                this.active = false;
                
                // 1. Remove Letterbox
                if (this.bars) this.bars.classList.remove('active');
                
                
                // 3. Show HUD
                const ui = document.getElementById('game-ui');
                if (ui) ui.style.opacity = '1';
                
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
        
            startPrologue() {
                console.log("STORY: Initializing Prologue via Database...");
                
                // START AT STEP 0
                this.state = { part: 1, chapter: 1, mission: 1, step: 0 };
                this.initializedStep = false;
                this.currentStepData = null;
                this.stepTimer = 0;
        
                // Reset Systems
                if(typeof phoneSystem !== 'undefined') {
                    phoneSystem.close();
                    phoneSystem.contactOverrides = {};
                    phoneSystem.seedDefaultContacts();
                }
        
                // Setup World
                this.game.loadMap('apt_949', {x: 1050, y: 370});
                this.game.player.angle = -Math.PI/2;
                
                // --- CINEMATIC INTRO: Start zoomed in on Stella ---
                this.game.camera.x = this.game.player.x;
                this.game.camera.y = this.game.player.y;
                this.game.camera.zoom = 3.5; // Tight close-up on Stella
                
                // Fade-in from black
                const fadeOverlay = document.getElementById('fade-overlay');
                fadeOverlay.style.transition = 'none';
                fadeOverlay.classList.add('active'); // Start fully black
                // Force reflow then enable slow fade
                fadeOverlay.offsetHeight;
                fadeOverlay.style.transition = 'opacity 2.5s ease-out';
                setTimeout(() => fadeOverlay.classList.remove('active'), 50);
            }
            
            // Direct Event Handler
            onMessageRead(contactName) {
                if (this.isAt('READ_MESSAGE') && contactName === 'Mirabel') {
                    console.log("STORY EVENT: Mirabel message read.");
                    this.advanceStep();
                }
            }
        
            update() {
                if (this.game.scenes && this.game.scenes.running) return;   // the story waits while a scene plays
                if (this.state.part === 1) {
                    this.checkOverrides(); 
                }

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
        
            // UPDATED FAILSAFES
            checkOverrides() {
                const mapId = this.game.activeMap.id;
                const qs = this.game.questState;
        
                // 1. HUB ARRIVAL FAIL-SAFE
                if (mapId === 'hub_949' && this.isBefore('CAR_REVEAL')) {
                    console.log("STORY OVERRIDE: Player in Hub. Jumping to Step 3 (Car Reveal).");
                    this.goTo('CAR_REVEAL');
                    this.cleanupPhone();
                }

                // 2. KEYCARD OVERRIDE -> Step 9 (Leave Club)
                if (qs.hasKeycard && this.isBefore('LEAVE_CLUB')) {
                    console.log("STORY OVERRIDE: Keycard found. Jumping to Step 9.");
                    this.goTo('LEAVE_CLUB');
                    this.cleanupPhone();
                }
        
                // 3. EXIT OVERRIDE -> Step 10 (Arrive Hotel)
                if (this.isAt('LEAVE_CLUB') && mapId === 'hub_949') {
                    console.log("STORY OVERRIDE: Left club. Jumping to Step 10.");
                    this.goTo('ARRIVE_HOTEL');
                }
        
                // 4. ARRIVAL OVERRIDE -> Step 6 (Wait inside Club)
                if (mapId === 'moon_city_nightclub' && this.isBefore('WAIT_FOR_TEXT')) {
                    console.log("STORY OVERRIDE: Arrived at Nightclub. Jumping to Step 6.");
                    this.goTo('WAIT_FOR_TEXT');
                }

                // 5. AMBUSH CLEARED OVERRIDE -> Step 14 (Report back)
                // Handles old saves where ambushCleared was set by inline code
                if (qs.ambushCleared && this.isBefore('REPORT_BACK')) {
                    console.log("STORY OVERRIDE: Ambush already cleared. Jumping to Step 14.");
                    this.goTo('REPORT_BACK');
                }

                // 6. CONTRACTOR REWARDED -> Step 15 (Chapter complete)
                if (qs.rewardClaimedContractor && this.isBefore('CHAPTER_COMPLETE')) {
                    console.log("STORY OVERRIDE: Contractor rewarded. Jumping to Step 15.");
                    this.goTo('CHAPTER_COMPLETE');
                }

                // 7. CHURCH BOSS OVERRIDE — mark sanctum optional as complete
                if (qs.churchBossDefeated && !this.completedOptional.includes('sanctum')) {
                    this.completedOptional.push('sanctum');
                    console.log("STORY OVERRIDE: Church boss already defeated. Marking sanctum complete.");
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

            serialize() {
                return {
                    state: { ...this.state },
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

