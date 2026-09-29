        // GameEngine — start / stop / reset and the main loop.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            start(mapId) { 
                // Auto-detect mobile on first load (no saved settings override)
                if (GameSettings._isMobile && !localStorage.getItem('dimensions_save_data') && !localStorage.getItem('dfab_save_slot_0')) {
                    GameSettings.applyPreset('medium');
                    this.lightingScale = 0.75;
                    GameSettings.applyFilmGrain();
                    GameSettings.applyControls();
                    this.resize();
                    console.log('[AUTO-DETECT] Mobile device — applied MEDIUM preset');
                }
                this.running = true; this.loadMap(mapId); document.getElementById('ui-layer').style.display = 'none'; document.getElementById('game-container').style.display = 'block'; if (this.ui) this.ui.showMissionBanner("WELCOME TO SOUTHERN DIMENSIONS CITY", "new", "WELCOME"); this.loop(); 
            },
            stop() {
                this.running = false;
                ambience.silence();
                this.pauseSystem.clear();
                document.getElementById('game-container').style.display = 'none'; 
                document.getElementById('ui-layer').style.display = 'flex'; 
                document.getElementById('main-menu').style.opacity = '1'; 
                document.getElementById('main-menu-list').classList.remove('hidden'); 
                document.getElementById('story-mode-list').classList.add('hidden');
                
                // Reset all gameplay state so New Game starts fresh
                this.resetGameState();
            },
            
            /**
             * Reset all gameplay state to new-game defaults.
             * Called on exit to main menu and before starting a new game.
             * Preserves: DOM references, systems infrastructure, settings.
             * Resets: inventory, quest progress, health, currency, driving, entities.
             */
            resetGameState() {
                // --- PLAYER STATE ---
                this.currency = 100;
                this.scrap = 0;
                this.playerHealth = 100;
                this.maxPlayerHealth = 100;
                this.boosterCount = 4;
                this.maxBoosters = 4;
                this.healthRegenTimer = 0;
                this.weaponMode = 'none';
                this.shootCooldown = 0;
                this.currentWeapon = null;
                this.nightVision = false;
                this.nvIntensity = 0;
                
                // --- QUEST / STORY ---
                this.questState = { 
                    hasKeycard: false, 
                    suiteAmbushTriggered: false, 
                    ambushCleared: false, 
                    rewardClaimedContractor: false, 
                    rewardClaimedLUVSH4D3: false,
                    etherealUnlocked: false,
                    churchBossDefeated: false,
                    hasVelvetCat: false,
                    larissa_telegraph_hint: false,
                    larissa_flit_hint: false,
                    larissa_stealth_hint: false,
                    larissa_loadout_hint: false
                };
                
                // --- INVENTORY (rebuild from defaults) ---
                if (this.inventory) {
                    this.inventory.items = [];
                    this.inventory.equippedWeaponId = null;
                    this.inventory.equippedAttachmentId = null;
                    this.inventory.loadDefaultLoadout();
                }
                
                // --- AUGMENTS ---
                if (this.augments) {
                    this.augments.owned = [];
                    this.augments.equipped = [];
                }
                
                // --- RESONANCE & DARK ELEMENT ---
                if (this.resonance) { this.resonance.reset(); this.applyResonanceStats(); }
                this.darkElement = 0;
                if (this.flitState) this.flitState.lastFlitAt = -99;
                this.lastHurtAt = -99;

                // --- COSMETICS ---
                if (this.cosmetics) {
                    this.cosmetics = new CosmeticsSystem();
                }
                
                // --- STORY ---
                if (this.story) {
                    this.story.state = { part: 1, chapter: 1, mission: 1, step: 0 };
                    this.story.currentStepData = null;
                    this.story.initializedStep = false;
                    this.story.stepTimer = 0;
                    this.story.activeOptional = null;
                    this.story.completedOptional = [];
                }
                
                // --- NOTES ---
                this.foundNotes = [];
                
                // --- BONDING ---
                if (this.bonding) {
                    this.bonding.seenDialogues = {};
                    this.bonding.bondedThisRest.clear();
                }
                
                // --- MISSIONS ---
                if (this.missions) {
                    this.missions.activeMission = null;
                    this.missions.completedCount = 0;
                    if (this.missions.missionLog) this.missions.missionLog = [];
                }
                
                // --- DRIVING / VEHICLE ---
                this.isDriving = false;
                if (this.car) {
                    this.car.controlMode = 'PARKED';
                    this.car.hasDriver = false;
                }
                this.car = this.ownedCar;
                this.deliveryVehicle = null;
                
                // --- COMPANIONS ---
                // Dismiss all contract companions
                for (let i = this.teammates.length - 1; i >= 0; i--) {
                    const tm = this.teammates[i];
                    if (tm.hireType === 'contract') {
                        tm.hired = false; tm.hireType = 'none'; tm.alliance = 'neutral';
                        tm.recruited = false; tm.inCar = false; tm.seatIndex = -1;
                        this.teammates.splice(i, 1);
                    }
                }
                this.velvetCat = null;
                if (this.teammates) {
                    this.teammates.forEach(t => { 
                        t.recruited = false; t.inCar = false; 
                        t.hp = t.maxHp; t.dead = false;
                        t.downed = false; t.active = true; t.visible = true;
                        if (t.maxTeammateStims) t.teammateStims = t.maxTeammateStims;
                    });
                }
                
                // --- FLIT / TIME SLOW ---
                this.flitState = { 
                    active: false, duration: 0, maxDuration: 15,
                    attunement: 120, maxAttunement: 120, 
                    dashCost: 40, rechargeRate: 2
                };
                this.flitVFX = [];
                this.graveyardGhosts = [];
                this.timeSlowState = { active: false, scale: 1.0, targetScale: 1.0, duration: 0, transitionSpeed: 0.05 };
                
                // --- WORLD TIME ---
                this.worldMinutes = 21 * 60;
                this.lastTimeTick = 0;
                
                // --- TRANSIENT ENTITIES ---
                this.projectiles = [];
                this.stickyOrbs = [];
                this.muzzleFlashes = [];
                this.loot = [];
                this.activeInteraction = null;
                
                // --- PHONE ---
                if (typeof phoneSystem !== 'undefined') {
                    phoneSystem.messageHistory = {};
                    phoneSystem.unread = {};
                    phoneSystem.lastMessageAt = {};
                    if (phoneSystem.contactOverrides) phoneSystem.contactOverrides = {};
                    phoneSystem.metNPCs = new Set();
                    phoneSystem.seedDefaultContacts();
                    phoneSystem.refreshNotifications();
                }
                
                // --- NAVIGATION ---
                this.navDestination = null;
                
                // --- LIGHTING ---
                this.lightingBaked = false;
                
                // --- PLAYER ENTITY ---
                if (this.player) {
                    this.player.x = 0;
                    this.player.y = 0;
                    this.player.hp = this.maxPlayerHealth;
                    this.player.visible = true;
                    this.player.isHidden = false;
                }
                
                console.log('[RESET] Game state cleared to defaults');
            },
            loop() {
                if (!this.running) return;
                ambience.update(this);
                
                /* FPS LIMITER — skip frame if too soon.
                   Scheduled against a running due-time rather than the last
                   drawn frame. Comparing to the last frame overshoots whenever
                   the display period doesn't divide the target evenly: on a
                   144Hz panel (6.94ms) a 16.67ms target could only land every
                   3rd frame, so the "60 FPS" setting actually delivered 48. */
                if (GameSettings.fpsLimit > 0) {
                    const now = performance.now();
                    const minInterval = 1000 / GameSettings.fpsLimit;
                    if (this._nextDrawDue === undefined) this._nextDrawDue = now;
                    if (now < this._nextDrawDue) {
                        requestAnimationFrame(() => this.loop());
                        return;
                    }
                    // Carry the schedule forward; resync if we've fallen far behind.
                    this._nextDrawDue = (now - this._nextDrawDue > minInterval)
                        ? now + minInterval
                        : this._nextDrawDue + minInterval;
                } else {
                    this._nextDrawDue = undefined;
                }
                
                // Sync global frame time cache (used by all draw methods)
                _frameTime = Date.now();
                _frameTimeSec = _frameTime / 1000;

                /* ─── FIXED TIMESTEP ────────────────────────────────────────────
                   update() is written entirely in per-frame units: acceleration
                   0.35/frame, drag 0.96/frame, cooldowns counted in frames. With
                   a raw requestAnimationFrame loop that made the whole game run
                   at the speed of the monitor — a 144Hz player drove 2.4× faster
                   than a 60Hz one, and 240Hz was 4×.

                   Rather than thread a `dt` through thousands of lines (and
                   re-tune every constant that was dialled in by feel), the loop
                   now advances the simulation in fixed 1/60s steps and renders
                   whenever it can. Every per-frame constant in the codebase —
                   driving, weather fades, gust cycles, lightning cooldowns, AI
                   timers, animation counters — keeps its meaning and its tuning,
                   and now means the same thing on every display.

                   Leftover time carries in the accumulator, so steps land at a
                   true 60/sec on average rather than drifting.               */
                const nowMs = performance.now();
                if (this._lastLoopTime === undefined) this._lastLoopTime = nowMs;
                let elapsed = nowMs - this._lastLoopTime;
                this._lastLoopTime = nowMs;

                // Clamp so a stall (alt-tab, GC pause, debugger) doesn't queue a
                // huge backlog and fast-forward the world when focus returns.
                if (elapsed > CONFIG.LOOP.MAX_FRAME_MS) elapsed = CONFIG.LOOP.MAX_FRAME_MS;
                if (elapsed < 0) elapsed = 0;
                this._accumulator = (this._accumulator || 0) + elapsed;

                // Real-time length of one tick. GAME_SPEED 0.5 → 33.3ms → 30 ticks/sec.
                const stepMs = CONFIG.LOOP.STEP_MS / Math.max(0.05, CONFIG.LOOP.GAME_SPEED || 1);
                const interp = CONFIG.LOOP.INTERPOLATE;

                let steps = 0;
                while (this._accumulator >= stepMs && steps < CONFIG.LOOP.MAX_STEPS) {
                    if (interp) RenderInterp.snapshot(this);
                    // Time slow may skip individual simulation steps
                    if (!this.updateTimeSlow()) {
                        this.update();
                    }
                    this._accumulator -= stepMs;
                    steps++;
                }
                // Machine can't keep up — drop the backlog rather than spiral.
                if (steps >= CONFIG.LOOP.MAX_STEPS) this._accumulator = 0;
                
                // Always draw for smooth visuals — blended between the last two ticks
                if (interp) RenderInterp.apply(this, this._accumulator / stepMs);
                const tickSec = CONFIG.LOOP.STEP_MS / 1000;
                _gameTimeSec = (interp && RenderInterp.stepAdvanced)
                    ? (_simTick - 1 + RenderInterp.alpha) * tickSec
                    : _simTick * tickSec;
                try {
                    this.draw();
                } finally {
                    if (interp) RenderInterp.restore(this);
                }
                requestAnimationFrame(() => this.loop()); 
            },
        });

