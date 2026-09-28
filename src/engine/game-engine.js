        class GameEngine {
            constructor() {
                
                // Pause registry — every subsystem that needs the world paused
                // (dialogues, shops, menus, cinematic transitions) acquires/releases
                // tokens here. Initialized first so anything that follows can use it.
                this.pauseSystem = new PauseSystem(this);
                
                this.ui = new UISystem(this);
                this.musicWidget = new MusicWidgetSystem(this);
                this.inventory = new InventorySystem(this);
                
                this.cutscene = new CutsceneManager(this);
                this.story = new StoryManager(this);
                this.landmarkRegistry = {};  // Dynamic landmark storage
                this.dropOffRegistry = {};   // Zib taxi drop-off points per landmarkId
                
                this.profiler = new Profiler(); // Initialize the performance tracker
                
                // Unified Entity System feature flag
                this.useNewCollisionSystem = true;
                
                this.canvas = document.getElementById('game-canvas');
                this.ctx = this.canvas.getContext('2d');
                
                // Lighting Layer
                this.lightingScale = 1.0; // 1.0 = High (Native), 0.75 = Medium, 0.5 = Low (Half-Res)
                this.lightCanvas = document.createElement('canvas');
                this.lightCtx = this.lightCanvas.getContext('2d');
                this.bloomCanvas = document.createElement('canvas');
                this.bloomCtx = this.bloomCanvas.getContext('2d');
                this.neonSigns = [];
                
                // In GameEngine constructor
                this.nightVision = false; // The toggle switch
                this.nvIntensity = 0;     // The smooth value (0.0 to 1.0)
                
                // Lighting state (shadow geometry cached per-lamp, no map-sized canvas)
                this.lightingBaked = false;
                this._zoomLOD = 0;
                this._maxLitLamps = 40;
                this._maxSignLayers = 5;
                
                // Grayscale Filter
                this.visualGrayscale = 0;
                this.targetGrayscale = 0;

                this.running = false;
                if (this.pauseSystem) this.pauseSystem.clear();
                else this.paused = false;
                this.activeMap = null;
                this.camera = { x: 0, y: 0, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
                this._hubCache = null;          // Cached CityLayout + RoadNetwork (expensive one-time builds)
                this._hubCacheSkipSigns = false; // Flag to skip sign re-harvest on cache restore
                this._transitionGrid = new TransitionGrid(100); // Spatial grid for O(1) transition zone lookup
                this.roomSystem = new RoomSystem(); // Indoor V2 room system
                this.keys = {};
                this.joystick = { active: false, dx: 0, dy: 0, originX: 0, originY: 0, id: null };
                this.fireJoystick = { active: false, dx: 0, dy: 0, originX: 0, originY: 0, id: null };
                
                this.questState = { 
                    hasKeycard: false, 
                    suiteAmbushTriggered: false, 
                    ambushCleared: false, 
                    rewardClaimedContractor: false, 
                    rewardClaimedLUVSH4D3: false,
                    etherealUnlocked: false,
                    churchBossDefeated: false,
                    hasVelvetCat: false,
                    // Larissa combat tutorial comms (one-shot)
                    larissa_telegraph_hint: false,
                    larissa_flit_hint: false,
                    larissa_stealth_hint: false,
                    larissa_loadout_hint: false
                };
                this.velvetCat = null; // Active VelvetCat entity
                this.flitState = { 
                    active: false, duration: 0, maxDuration: 15,
                    attunement: 120, maxAttunement: 120, 
                    dashCost: 40, rechargeRate: 2 // 2/frame = full in 1s
                };
                this.flitVFX = []; // Active flit visual effects (ghost afterimages, lightning trails)
                this.graveyardGhosts = []; // Procedural humanoid ghosts in the cemetery
                
                // Time slow system for dramatic moments (boss kills, etc.)
                this.timeSlowState = {
                    active: false,
                    scale: 1.0,           // Current time scale (1.0 = normal, 0.4 = 60% slower)
                    targetScale: 1.0,     // Scale we're transitioning to
                    duration: 0,          // Frames remaining at slow speed
                    transitionSpeed: 0.05 // How fast we lerp between scales
                };
                
                this.currency = 100; this.scrap = 0; this.playerHealth = 100; this.maxPlayerHealth = 100; this.boosterCount = 4; this.maxBoosters = 4; this.debugMode = false; this.showProfiler = false;
                this.healthRegenTimer = 0; // Frames since health was not full (for passive regen)
                this.weaponMode = 'none';  // 'normal' or 'sniper' - sniper shots penetrate everything
                this.shootCooldown = 0;    // Tracks timing between shots
                this.currentWeapon = null; // Stores the currently active weapon object

                this.interactBtn = document.getElementById('btn-interact');
                this.transitionBtn = document.getElementById('btn-transition');
                this.fireBtn = document.getElementById('btn-fire');
                this.healBtn = document.getElementById('btn-heal');
                this.flitBtn = document.getElementById('btn-flit');
                this.autodriveBtn = document.getElementById('btn-autodrive');
                this.zibSkipBtn = document.getElementById('btn-zib-skip');
                this.holsterBtn = document.getElementById('btn-holster');
                this.weaponHolstered = false; // false = drawn (fire btn visible), true = holstered (fire btn hidden)
                this.holsterAnim = 1.0;       // visual lerp: 1 = fully drawn, 0 = fully holstered
                this.holsterAnimTarget = 1.0; // animation target — toggle sets this, render lerps toward it

                // Emote joystick (active only while holstered)
                this.emoteBtn = document.getElementById('btn-emote');
                this.emoteKnob = document.getElementById('emote-joystick-knob');
                this.emoteOverlays = {
                    smile: document.getElementById('emote-smile'),
                    zany:  document.getElementById('emote-zany'),
                    cry:   document.getElementById('emote-cry'),
                    frown: document.getElementById('emote-frown'),
                };
                this.emoteJoystick = { active: false, touchId: null, highlighted: null };
                this.playerEmote = { text: null, age: 0, duration: 120 }; // ~2s bubble above player

                // Pausable timer system — frame-tick driven so timers naturally
                // freeze with the game. Use addPausableTimeout/cancelPausableTimeout
                // anywhere that setTimeout would inappropriately run during pause.
                this.pausableTimers = [];
                this._lastPausableTimerTick = undefined;
                this.uiLocation = document.getElementById('ui-location');
                this.uiTime = document.getElementById('ui-time');
                this.uiCurrency = document.getElementById('ui-currency');
                this.uiScrap = document.getElementById('ui-scrap');
                this.healthBar = document.getElementById('health-bar');
                
                this.dialogueBox = document.getElementById('dialogue-box');
                this.npcNameEl = document.getElementById('npc-name');
                this.npcTextEl = document.getElementById('npc-text');
                this.btnAccept = document.getElementById('btn-accept');
                this.btnDecline = document.getElementById('btn-decline');

                this.weather = new WeatherSystem(window.innerWidth, window.innerHeight);
                this.decals = new DecalSystem();
                this.puddles = null; // PuddleSystem disabled for performance (will revisit)
                this.leafParticles = new LeafParticleSystem(this); // Floating leaves
                this.projectiles = []; this.props = []; this.npcs = []; this.enemies = []; this.loot = []; this.lamps = []; this.lastKnownMarkers = []; this.muzzleFlashes = [];
                this.stickyOrbs = []; // Golden Child DOT orbs attached to enemies
                this.traffic = new TrafficManager(); // <--- ADD THIS LINE
                this.pedestrians = new PedestrianManager(); // Roaming civilians
                
                this.isDriving = false;
                this.player = new PlayerEntity({ x: 0, y: 0 });
                this.player.setGame(this);  // Link player to game for damage callbacks
                this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Initial sync
                
                // Player's OWNED car: LADY Blackmark V1 (Luxury SUV) - This is YOUR car
                this.ownedCar = new TrafficVehicle(null, 'LADY', 'suv', 'PLAYER');
                this.ownedCar.color = '#1a1a1a'; // Consistent dark color for player's car
                this.ownedCar.isOwnedCar = true; // Mark as player's owned vehicle
                
                // Garage system — multi-car ownership & customization
                this.garage = new PlayerGarage();
                this.garage.applyToVehicle(this.ownedCar);
                
                // Zib autonomous taxi system
                this.zibSystem = new ZibSystem();
                
                // Current car (starts as owned car, can be hijacked vehicles)
                this.car = this.ownedCar;
                
                // --- NEW SYSTEMS ---
                this.augments = new AugmentSystem();
                this.bumperMinigame = new BumperCarMinigame();
                this.bonding = new BondingSystem();
                this.dialogueSeq = new DialogueSequence(this);
                this.transcript = new DialogueTranscript();
                // Universal capture: any write to the NPC text element gets transcribed,
                // regardless of which code path produced it (DialogueSequence, single-line
                // shop greetings, recruit prompts, story handler). Pulls the speaker from
                // npcNameEl, which is set by every call site before the text write.
                this._installDialogueCapture();
                this.cosmetics = new CosmeticsSystem();
                this.foundNotes = [];  // IDs of discovered notes (persists in save)
                this.bokeh = new BokehSystem(18);
                this.missions = new MissionSystem();
                this.deliveryVehicle = null; // Spawned on hub_949 map load
                
                this.hubState = { carX: 580, carY: 640, carAngle: Math.PI };                 this.worldMinutes = 21 * 60; this.lastTimeTick = 0;
                
                // --- NAVIGATION SYSTEM ---
                this.navDestination = null; // Set by map UI when player places marker
                this.navCheckDistance = 150; // Distance to destination to consider "arrived"
                
                // Inside GameEngine constructor:
                
                // INSIDE constructor()
                this.teammates = [ 
                    // Victoria Nils — SMG suppression, pink afro, silver boots
                    new NPC(1100, 150, "Victoria", "teammate", {
                        weaponId: 'rifle_rb98',
                        burstSize: 3,
                        burstDelay: 5,
                        accuracyMod: 0.8,
                        bio: 'Ex-corpo marksman turned freelancer. Loyal, lethal, and always watching your six.',
                        relationship: 0,
                        appearance: {
                            skinColor: '#c68642',
                            gender: 'female',
                            top:    { type: 'suit', color: '#2a0a3a' },
                            bottom: { type: 'pants', color: '#1a0820' },
                            shoes:  { type: 'boots', color: '#c0c0c0' },
                            hair:   { type: 'afro', color: '#ff69b4' }
                        }
                    }),
                    // Yenna Stone — Sniper, composed, deadly precise
                    new NPC(1150, 150, "Yenna", "teammate", {
                        weaponId: 'sniper_sr86',
                        burstSize: 1,
                        burstDelay: 0,
                        accuracyMod: 0.95,
                        bio: 'Former military sharpshooter. Quiet, patient, sees everything. SR-86 is an extension of her arm.',
                        relationship: 0,
                        appearance: {
                            skinColor: '#8B4513',
                            gender: 'female',
                            top:    { type: 'tshirt', color: '#2a3a2a' },
                            bottom: { type: 'pants', color: '#1a1a1a' },
                            shoes:  { type: 'boots', color: '#333' },
                            hair:   { type: 'dreadlocks', color: '#1a0a00' }
                        }
                    }),
                    // Sabrina Darkmancer — Sarcastic, dark energy, close-range
                    new NPC(1200, 150, "Sabrina", "teammate", {
                        weaponId: 'pistol_fpx',
                        burstSize: 2,
                        burstDelay: 8,
                        accuracyMod: 0.85,
                        bio: 'Street sorcerer with a mean trigger finger. Sarcasm is her second language, violence is her first.',
                        relationship: 0,
                        appearance: {
                            skinColor: '#e8d0c0',
                            gender: 'female',
                            top:    { type: 'sports_bra', color: '#1a0a2a' },
                            bottom: { type: 'skirt', color: '#0a0a1a' },
                            shoes:  { type: 'heels', color: '#2a1a3a' },
                            hair:   { type: 'ponytail', color: '#0a0008' }
                        }
                    }),
                    // Max Moon — Hotheaded, sparks, electric energy
                    new NPC(1250, 150, "Max", "teammate", {
                        weaponId: 'pistol_fpx',
                        burstSize: 2,
                        burstDelay: 6,
                        accuracyMod: 0.75,
                        bio: 'Short fuse, big firepower. Snaps blue sparks from his fingertips when he\'s irritated — which is always.',
                        relationship: 0,
                        appearance: {
                            skinColor: '#c9a87c',
                            gender: 'male',
                            top:    { type: 'tshirt', color: '#1a2a4a' },
                            bottom: { type: 'pants', color: '#222' },
                            shoes:  { type: 'sneakers', color: '#333' },
                            hair:   { type: 'short', color: '#0088ff' }
                        }
                    }),
                    // Josh Burke — Flat, matter-of-fact, efficient
                    new NPC(1300, 150, "Josh", "teammate", {
                        weaponId: 'sniper_sara',
                        burstSize: 1,
                        burstDelay: 0,
                        accuracyMod: 0.9,
                        bio: 'Intel specialist. States facts. Throws shrapnel when angry. Carries YourGirlSara like it owes him money.',
                        relationship: 0,
                        appearance: {
                            skinColor: '#e8d5c4',
                            gender: 'male',
                            top:    { type: 'tshirt', color: '#333' },
                            bottom: { type: 'pants', color: '#2a2a2a' },
                            shoes:  { type: 'shoes', color: '#1a1a1a' },
                            hair:   { type: 'short', color: '#3a2a1a' }
                        }
                    })
                ];
                this.activeInteraction = null;

                this.initEvents(); this.initJoystick(); this.initFireJoystick();
            }

            // ── UNIFIED COMPANION HELPERS ──
            /** Get all active contract (hired) companions. */
            get hiredDancers() { return this.teammates.filter(t => t.hireType === 'contract' && t.hired); }

            /** Count of active contract companions. */
            get contractCount() { return this.teammates.filter(t => t.hireType === 'contract' && t.hired).length; }

            /** Hire a dancer/companion on contract. Pushes to teammates if not already there. */
            hireCompanion(npc, worldMinutes) {
                npc.hired = true;
                npc.hireType = 'contract';
                npc.hireDuration = CONFIG.COMPANION.DEFAULT_HIRE_DURATION;
                npc.hireTime = worldMinutes + npc.hireDuration;
                npc.hireCost = CONFIG.COMPANION.DEFAULT_HIRE_COST;
                npc.alliance = 'friendly';
                npc.recruited = true; // So combat/follow systems treat them as active
                if (!this.teammates.includes(npc)) {
                    this.teammates.push(npc);
                }
                // Remove from map NPCs (prevents ghost double-rendering)
                const idx = this.npcs.indexOf(npc);
                if (idx > -1) this.npcs.splice(idx, 1);
            }

            /** Dismiss a contract companion. Removes from teammates. */
            dismissCompanion(npc) {
                npc.hired = false;
                npc.hireType = 'none';
                npc.alliance = 'neutral';
                npc.recruited = false;
                npc.inCar = false;
                npc.seatIndex = -1;
                const idx = this.teammates.indexOf(npc);
                if (idx > -1) this.teammates.splice(idx, 1);
            }

            initEvents() {
                window.addEventListener('resize', () => { this.resize(); });
                window.addEventListener('keydown', (e) => { 
                    this.keys[e.key] = true; 
                    if (e.key === 'h' || e.key === 'H') this.useBooster();
                    if (e.key === 'j' || e.key === 'J') this.useBoosterOnAlly();
                    
                    // AUTO-DRIVE TOGGLE (only while driving)
                    if ((e.key === 'q' || e.key === 'Q') && this.isDriving && this.running && !this.paused) {
                        this.toggleAutoDrive();
                    }
                    
                    if (e.key === ' ') {
                        e.preventDefault();
                        // MODIFIED: Removed !this.isDriving check to allow shooting from car
                        if (this.shootCooldown <= 0 && this.player.visible && !this.paused) {
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
                
                const toggleAction = (e) => {
                    e.preventDefault();
                    if (this.activeInteraction) {
                        if(this.activeInteraction.interactionType === 'medbay_refill') {
                            this.refillStims();
                        } else if(this.activeInteraction.interactionType === 'vending_machine') {
                            this.buyBubbleTea();
                        } else if(this.activeInteraction.interactionType === 'bed_sleep') {
                            // NEW: Open Sleep UI
                            this.openSleepMenu();
                        } else if(this.activeInteraction.interactionType === 'crafting_table') {
                            this.openCraftingTable();
                        } else if(this.activeInteraction.interactionType === 'armory') {
                            // Open inventory directly to weapons/equipment screen
                            this.inventory.toggleMenu();
                            requestAnimationFrame(() => {
                                const invNav = document.querySelector('#freelancer-menu .sidebar-nav-item[data-screen="inventory"]');
                                if (invNav) invNav.click();
                            });
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
                        this.toggleVehicle();
                    }
                };

                this.interactBtn.addEventListener('click', toggleAction); this.interactBtn.addEventListener('touchstart', toggleAction);
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
                document.getElementById('btn-colorgrade').addEventListener('click', (e) => { e.preventDefault(); const p = document.getElementById('game-grade-panel'); p.classList.toggle('visible'); if (p.classList.contains('visible')) initGameGradePresets(); });
                document.getElementById('btn-debug').addEventListener('click', (e) => { e.preventDefault(); this.debugMode = !this.debugMode; showMessage("DEBUG OVERLAY: " + (this.debugMode ? "ON" : "OFF")); });
                document.getElementById('btn-profiler').addEventListener('click', (e) => {
                    e.preventDefault();
                    // Shift-click runs the resolution sweep instead of toggling the
                    // panel — keeps the benchmark one gesture away without adding
                    // another button to the debug bar.
                    if (e.shiftKey) {
                        this.showProfiler = true;
                        PerfBench.run();
                        return;
                    }
                    this.showProfiler = !this.showProfiler;
                    showMessage("PROFILER: " + (this.showProfiler ? "ON" : "OFF"));
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
                    this.ui.toggleMap(true);
                });
                
                document.getElementById('btn-inventory').addEventListener('click', (e) => {
                    e.preventDefault();
                    // Close the dock so it doesn't block the view
                    document.getElementById('dock-toggle').classList.remove('open');
                    document.getElementById('dock-buttons').classList.remove('visible');
                    
                    // Open Inventory
                    this.inventory.toggleMenu();
                });
                
                // 2. Main Menu Load Button — opens save slot selector
                document.getElementById('btn-load-game').addEventListener('click', () => {
                    FullscreenManager.requestIfEnabled();
                    audioSys.init();
                    if (typeof saveSlotManager !== 'undefined' && saveSlotManager.hasAnySave()) {
                        saveSlotManager.open('load', (success) => {
                            if (success) {
                                document.getElementById('main-menu').style.opacity = '0';
                                setTimeout(() => {
                                    document.getElementById('ui-layer').style.display = 'none';
                                    document.getElementById('game-container').style.display = 'block';
                                    this.running = true;
                                    this.loop();
                                }, 500);
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

                this.zibSkipBtn.addEventListener('mousedown', (e) => { e.preventDefault(); if (this.zibSystem) this.zibSystem.teleportToDestination(this); this.zibSkipBtn.style.display = 'none'; });
                this.zibSkipBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.zibSystem) this.zibSystem.teleportToDestination(this); this.zibSkipBtn.style.display = 'none'; });

                const toggleHolster = (e) => {
                    e.preventDefault();
                    this.weaponHolstered = !this.weaponHolstered;
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

                this.btnAccept.addEventListener('click', () => {
                    // DialogueSequence intercept (bonding, story, briefings, etc.)
                    if (this.dialogueSeq && this.dialogueSeq.isActive()) {
                        this.dialogueSeq.advance();
                        return;
                    }
                    if (this.activeInteraction instanceof NPC && this.activeInteraction.role === 'teammate') {
                        this.activeInteraction.recruited = true; 
                        showMessage(`${this.activeInteraction.name.toUpperCase()} RECRUITED.`);
                    } 
                    else if (this.activeInteraction instanceof NPC) {
                        if (this.activeInteraction.name === "Dr. Yin") {
                            this.endDialogue();
                            this.openAugmentShop();
                            return;
                        }
                        else if (this.activeInteraction.name === "Torque") {
                            this.endDialogue();
                            this.openAutoShop();
                            return;
                        }
                        else if (this.activeInteraction.name === "Prisma") {
                            this.endDialogue();
                            this.openCosmeticsShop();
                            return;
                        }
                        else if (this.activeInteraction.name === "Biggs") {
                            this.endDialogue();
                            this.bumperMinigame.start(this);
                            return;
                        }
                        else if (this.activeInteraction.name === "Grum North") {
                            // GAUNTLET button pressed — start horde arena
                            if (this._grumCancelBtn) this._grumCancelBtn.style.display = 'none';
                            this.endDialogue();
                            if (this.hordeGauntlet) {
                                this.hordeGauntlet.start(this);
                            }
                            return;
                        } 
                        else if (this.activeInteraction.name === "Barista Ren") {
                            // Offer delivery mission from the cafe
                            if (!this.missions.activeMission) {
                                const delivery = this.missions.generateDelivery(this);
                                if (delivery) {
                                    this.missions.acceptMission(delivery, this);
                                    showMessage('PICK UP THE PACKAGE FROM THE AMBER DELIVERY VEHICLE OUTSIDE.');
                                } else {
                                    showMessage('NO DELIVERIES AVAILABLE. TRY AGAIN LATER.');
                                }
                            } else {
                                showMessage('FINISH YOUR CURRENT MISSION FIRST.');
                            }
                        }
                        else if (this.activeInteraction.name === "Bartender") {
                            // Offer bounty mission from the club
                            const bounty = this.missions.generateBounty(this);
                            if (bounty) {
                                this.missions.acceptMission(bounty, this);
                            }
                        }
                        else if (this.activeInteraction.name === "Anavia") {
                            // Anavia salvage missions (unlocked after 5 bounties)
                            if (this.missions.completedBounties >= 5 && !this.missions.activeMission) {
                                const salvage = this.missions.generateSalvage(this);
                                if (salvage) {
                                    this.missions.acceptMission(salvage, this);
                                    showMessage('SALVAGE SITE MARKED. CLEAR THE HOSTILES, COLLECT THE CRATE.');
                                } else {
                                    showMessage('NO SALVAGE OPS AVAILABLE RIGHT NOW.');
                                }
                            }
                        } 
                        else if (this.activeInteraction.role === 'dancer' || this.activeInteraction.role === 'red_demon_dancer') {
                            // Hire dancer logic (unified companion system)
                            if (!this.activeInteraction.hired && this.contractCount < CONFIG.COMPANION.MAX_CONTRACTS) {
                                if (this.currency >= CONFIG.COMPANION.DEFAULT_HIRE_COST) {
                                    this.currency -= CONFIG.COMPANION.DEFAULT_HIRE_COST;
                                    const dancer = this.activeInteraction;
                                    this.hireCompanion(dancer, this.worldMinutes);
                                    this.updateUI();
                                    showMessage(`${dancer.name.toUpperCase()} HIRED FOR ${Math.round(CONFIG.COMPANION.DEFAULT_HIRE_DURATION / 60)} HOURS.`);
                                } else {
                                    showMessage(`INSUFFICIENT FUNDS. ${CONFIG.COMPANION.DEFAULT_HIRE_COST} PERSONICS REQUIRED.`);
                                }
                            }
                        } 
                        else if (this.activeInteraction.name === "LUVSH4D3") {
                             if (this.questState.ambushCleared && !this.questState.rewardClaimedLUVSH4D3) {
                                this.currency += 450; this.scrap += 10;
                                this.questState.rewardClaimedLUVSH4D3 = true; 
                                this.updateUI(); showMessage("REWARD: 450 PERSONICS, 10 SCRAP");
                             } else if (!this.questState.hasKeycard) {
                                showMessage("KEYCARD RECEIVED FROM CONTRACTOR (HUB)."); 
                             }
                        } 
                        else if (this.activeInteraction.name === "Ms. Jean") {
                            if (!this.questState.etherealUnlocked) {
                                this.questState.etherealUnlocked = true;
                                showMessage("ETHEREAL PLANE UNLOCKED.");
                                this.weather.spawnGhost(this.player.x + 50, this.player.y, 0);
                                this.weather.spawnGhost(this.player.x - 50, this.player.y, Math.PI);
                            } else {
                                showMessage("CROSSING OVER...");
                                this.loadMap('ethereal_plane');
                            }
                        } 
                        else {
                            if (this.questState.ambushCleared && !this.questState.rewardClaimedContractor) {
                                this.currency += 500; this.questState.rewardClaimedContractor = true;
                                this.updateUI(); showMessage("PAYMENT RECEIVED: 500 PERSONICS");
                            } else if (!this.questState.hasKeycard) {
                                showMessage("MISSION ACCEPTED. RECEIVED: VIP KEYCARD."); this.questState.hasKeycard = true;
                            }
                        }
                    }
                    this.endDialogue();
                });

                this.btnDecline.addEventListener('click', () => { 
                    // Grum North — BOSS REPLAY (decline button repurposed)
                    if (this.activeInteraction instanceof NPC && this.activeInteraction.name === 'Grum North') {
                        if (this._grumCancelBtn) this._grumCancelBtn.style.display = 'none';
                        this.endDialogue();
                        // Teleport to church_boss and spawn the Triumvirate
                        this.loadMap('church_boss');
                        setTimeout(() => {
                            this.enemies.push(new GatlingGunner(300, 300, 0));
                            this.enemies.push(new GatlingGunner(600, 200, 1));
                            this.enemies.push(new GatlingGunner(900, 300, 2));
                            showMessage("THE TRIUMVIRATE AWAKENS... (REPLAY)");
                            this.triggerShake(20);
                        }, 500);
                        return;
                    }
                    this.endDialogue(); 
                });
            }

            triggerShake(amount) {
                if (amount > this.camera.shake) {
                    this.camera.shake = amount;
                    
                    // HAPTIC FEEDBACK (Vibration)
                    if (navigator.vibrate) {
                        // Vibrate for milliseconds equal to the shake amount * 10
                        navigator.vibrate(amount * 10); 
                    }
                }
            }
            
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
            }
            
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
            }
            
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
            }


            /**
             * Is a decimated subsystem due to run this step?
             * @param {number} interval  Run every Nth step (1 = every step).
             * @param {number} phase     Per-agent offset so load spreads evenly.
             */
            simDue(interval, phase = 0) {
                if (!CONFIG.SIM.DECIMATE || interval <= 1) return true;
                return ((this.simStep + phase) % interval) === 0;
            }

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
                this.lightCanvas.width = Math.max(1, Math.round(bufW * this.lightingScale)); 
                this.lightCanvas.height = Math.max(1, Math.round(bufH * this.lightingScale));
                
                // Weather spawns and its full-screen overlay work in backing-store
                // pixels, not CSS pixels — pass the buffer size or rain lands in
                // the wrong place the moment scale ≠ 1.
                this.weather.resize(bufW, bufH);
                
                // If map is active, we might need to re-bake static lighting if resolution changed
                if(this.activeMap) {
                    this.bakeStaticLighting(); 
                }
            }

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
                    
                    this.projectiles.push(new ProjectileEntity({
                        x: px, y: py, 
                        angle: punchAngle, 
                        isEnemy: false, 
                        owner: this.player, 
                        color: 'rgba(0,0,0,0)', // Invisible hitbox
                        radius: 15, speed: 10, life: 5, damage: 15, mass: 50 
                    }));
                    this.triggerShake(2);
                    return;
                }
            
                // --- GENERIC WEAPON LOGIC ---
                const stats = this.currentWeapon.stats || {};
                
                // 1. Apply Stats (Recoil & Cooldown)
                this.shootCooldown = stats.fireRate || 20;
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
                    const magnitude = stats.spread || 0.22;
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
                const shotDamage = stats.damage || 35;
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
            
                // 5. Spawn Muzzle Flash
                this.muzzleFlashes.push({ 
                    x: px, 
                    y: py, 
                    radius: stats.flashRadius || 50, 
                    color: shotColor, // Flash matches bullet color
                    life: 3 
                });
            }

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
            }

            
            


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
            }
            
            useBooster() {
                if (this.playerHealth >= this.maxPlayerHealth) { 
                    showMessage("HEALTH FULL"); 
                    return; 
                }
                if (this.boosterCount > 0) { 
                    this.boosterCount--; 
                    this.playerHealth = Math.min(this.playerHealth + 50, this.maxPlayerHealth);
                    this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Sync with entity
                    this.updateUI(); // Updates health bar AND booster count
                    showMessage("STIM PACK USED. HP RESTORED."); 
                } else { 
                    showMessage("NO BOOSTERS REMAINING."); 
                }
            }
            
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
            }
            
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
            }

            /* =========================================================
               NEON BLUE BUBBLE TEA (Consumable Buff)
               ---------------------------------------------------------
               Costs 30 PP. Grants speed boost for 2 in-game hours.
               Affects movement speed and flit distance.
               ========================================================= */
            // =========================================================
            //  VENDING MACHINE SYSTEM
            // =========================================================
            openVendingMenu() {
                this.pauseSystem.acquire('vending');
                const menu = document.getElementById('vending-menu');
                menu.style.display = 'block';
                
                // Update balance display
                document.getElementById('vend-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;
                
                // Show Stellar Lemonade if unlock condition is met (config-driven)
                const stellarEl = document.getElementById('vend-item-stellar');
                if (stellarEl) {
                    const stellarConfig = CONSUMABLES.stellarLemonade;
                    const unlocked = stellarConfig.unlockCheck ? stellarConfig.unlockCheck(this) : true;
                    stellarEl.style.display = unlocked ? 'flex' : 'none';
                }
                
                // Wire up item clicks (re-bind each open to capture current state)
                document.getElementById('vend-item-bubble').onclick = () => this.vendPurchase('bubbleTea');
                document.getElementById('vend-item-jean').onclick = () => this.vendPurchase('jeanSoda');
                if (stellarEl) stellarEl.onclick = () => this.vendPurchase('stellarLemonade');
                document.getElementById('btn-vend-close').onclick = () => this.closeVendingMenu();
            }
            
            closeVendingMenu() {
                document.getElementById('vending-menu').style.display = 'none';
                this.pauseSystem.release('vending');
            }
            
            vendPurchase(itemId) {
                if (this.player.buffSystem.activate(itemId, this.worldMinutes, this)) {
                    this.updateUI();
                    document.getElementById('vend-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;
                }
                this.closeVendingMenu();
            }
            
            // Legacy alias
            buyBubbleTea() { this.openVendingMenu(); }

            // =========================================================
            //  GARAGE VEHICLE MANAGEMENT
            //  Switch active car, apply customization, rebuild vehicle
            // =========================================================
            
            /**
             * Switch the active car from the garage.
             * Rebuilds the ownedCar TrafficVehicle with new brand/model/colors.
             * Preserves position and visibility state.
             */
            switchGarageCar(garageIndex) {
                if (!this.garage.setActive(garageIndex)) return false;
                const carData = this.garage.getActive();
                
                // If currently driving owned car, exit first
                if (this.isDriving && this.car === this.ownedCar) {
                    this.toggleVehicle();
                }
                
                // Preserve current state
                const oldX = this.ownedCar.x;
                const oldY = this.ownedCar.y;
                const oldAngle = this.ownedCar.angle;
                const oldVisible = this.ownedCar.visible;
                
                // Rebuild TrafficVehicle with new brand/model
                this.ownedCar = new TrafficVehicle(null, carData.brand, carData.model, 'PLAYER');
                this.ownedCar.isOwnedCar = true;
                this.ownedCar.x = oldX;
                this.ownedCar.y = oldY;
                this.ownedCar.angle = oldAngle;
                this.ownedCar.visible = oldVisible;
                
                // Apply customization colors from garage
                this.garage.applyToVehicle(this.ownedCar);
                
                // Update the car reference
                this.car = this.ownedCar;
                
                const name = this.garage.getDisplayName(garageIndex);
                showMessage(`ACTIVE VEHICLE: ${name.toUpperCase()}`);
                return true;
            }
            
            /**
             * Apply customization changes to a garage car and sync to the live vehicle.
             * @param {number} garageIndex - Car index in garage
             * @param {Object} changes - { paintColor?, underglowColor?, headlightColor? }
             */
            customizeGarageCar(garageIndex, changes) {
                this.garage.customize(garageIndex, changes);
                // If this is the active car, immediately apply to the live vehicle
                if (garageIndex === this.garage.activeIndex) {
                    this.garage.applyToVehicle(this.ownedCar);
                }
            }
            
            /**
             * Reset a garage car to factory defaults and sync if active.
             */
            resetGarageCarDefaults(garageIndex) {
                this.garage.resetToDefault(garageIndex);
                if (garageIndex === this.garage.activeIndex) {
                    this.garage.applyToVehicle(this.ownedCar);
                }
                showMessage('VEHICLE RESET TO FACTORY DEFAULTS.');
            }

            // =========================================================
            //  AUTO SHOP UI — Browse, Garage Management, Customize
            // =========================================================
            openAutoShop() {
                this.pauseSystem.acquire('auto_shop');
                this._autoShopTab = 'browse';
                const overlay = document.getElementById('auto-shop-overlay');
                overlay.style.display = 'block';
                document.getElementById('auto-shop-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;

                // Wire tabs
                const self = this;
                overlay.querySelectorAll('.auto-tab').forEach(btn => {
                    btn.onclick = () => {
                        self._autoShopTab = btn.dataset.tab;
                        // Update tab visual
                        overlay.querySelectorAll('.auto-tab').forEach(t => {
                            t.style.background = 'rgba(255,255,255,0.03)';
                            t.style.borderColor = 'rgba(255,255,255,0.1)';
                            t.style.color = '#888';
                        });
                        btn.style.background = 'rgba(255,136,0,0.15)';
                        btn.style.borderColor = 'rgba(255,136,0,0.4)';
                        btn.style.color = '#ff8800';
                        self.renderAutoShopTab();
                    };
                });

                // Wire close
                document.getElementById('auto-shop-close').onclick = () => this.closeAutoShop();

                // Set initial active tab visual
                const activeBtn = overlay.querySelector('.auto-tab[data-tab="browse"]');
                if (activeBtn) {
                    activeBtn.style.background = 'rgba(255,136,0,0.15)';
                    activeBtn.style.borderColor = 'rgba(255,136,0,0.4)';
                    activeBtn.style.color = '#ff8800';
                }

                this.renderAutoShopTab();
            }

            closeAutoShop() {
                document.getElementById('auto-shop-overlay').style.display = 'none';
                this._customizeOriginal = null;
                this._customizePending = null;
                this.pauseSystem.release('auto_shop');
            }

            renderAutoShopTab() {
                const container = document.getElementById('auto-shop-content');
                if (!container) return;

                // Clear customize preview state when leaving that tab
                if (this._autoShopTab !== 'customize') {
                    this._customizeOriginal = null;
                    this._customizePending = null;
                }

                switch (this._autoShopTab) {
                    case 'browse': this._renderBrowseTab(container); break;
                    case 'garage': this._renderGarageTab(container); break;
                    case 'customize': this._renderCustomizeTab(container); break;
                }
            }

            // ── BROWSE TAB: Purchase new vehicles ──
            _renderBrowseTab(container) {
                const self = this;
                let html = '';
                const sLabel = `font-family:Orbitron,sans-serif; font-size:0.6rem; letter-spacing:2px; margin:12px 0 8px; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.06);`;

                for (const brandKey in VEHICLE_BRANDS) {
                    const brand = VEHICLE_BRANDS[brandKey];
                    const tierColors = { 'ultra-luxury': '#d4af37', 'mid-luxury': '#00f3ff', 'economy': '#aaa' };
                    const tierCol = tierColors[brand.tier] || '#888';

                    html += `<div style="${sLabel} color:${tierCol};">${brandKey.toUpperCase()} <span style="font-size:0.45rem; color:#555; letter-spacing:1px;">${brand.tier.toUpperCase()}</span></div>`;

                    for (const modelKey in brand.models) {
                        const model = brand.models[modelKey];
                        const price = CAR_PRICES[brandKey]?.[modelKey];
                        if (!price) continue;

                        // Check if already owned
                        const alreadyOwned = this.garage.cars.some(c => c.brand === brandKey && c.model === modelKey);
                        const canAfford = this.currency >= price;

                        html += `<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:4px; padding:10px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">`;
                        html += `<div>`;
                        html += `<div style="font-size:0.8rem; color:#ddd;">${model.name}</div>`;
                        html += `<div style="font-size:0.55rem; color:#777;">SPD ${(brand.baseStats.maxSpeed * model.speedMod).toFixed(1)} · SEATS ${model.seats || brand.baseStats.seats || 4} · ${modelKey.toUpperCase()}</div>`;
                        html += `</div>`;

                        if (alreadyOwned) {
                            html += `<span style="font-family:Orbitron,sans-serif; font-size:0.5rem; color:#00ff66; letter-spacing:1px;">OWNED</span>`;
                        } else {
                            html += `<button class="auto-buy-btn" data-brand="${brandKey}" data-model="${modelKey}" style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:5px 12px; border-radius:3px; cursor:pointer; background:${canAfford ? 'rgba(255,136,0,0.12)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${canAfford ? 'rgba(255,136,0,0.3)' : 'rgba(255,255,255,0.08)'}; color:${canAfford ? '#ff8800' : '#555'};">${price.toLocaleString()} PP</button>`;
                        }
                        html += `</div>`;
                    }
                }

                container.innerHTML = html;

                // Wire buy buttons
                container.querySelectorAll('.auto-buy-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const brandKey = btn.dataset.brand;
                        const modelKey = btn.dataset.model;
                        const price = CAR_PRICES[brandKey]?.[modelKey] || 0;

                        if (btn.dataset.confirm === 'true') {
                            // Second tap — buy
                            if (self.currency < price) { showMessage('INSUFFICIENT FUNDS.'); return; }
                            self.currency -= price;
                            const idx = self.garage.addCar(brandKey, modelKey);
                            if (idx >= 0) {
                                const name = self.garage.getDisplayName(idx);
                                showMessage(`PURCHASED: ${name.toUpperCase()}`);
                                document.getElementById('auto-shop-balance').textContent = `BALANCE: ${self.currency} PERSONICS`;
                                self.updateUI();
                                self._renderBrowseTab(container);
                            }
                        } else {
                            // First tap — confirm
                            btn.dataset.confirm = 'true';
                            btn._origText = btn.textContent;
                            btn._origStyle = btn.style.cssText;
                            btn.textContent = 'CONFIRM?';
                            btn.style.background = 'rgba(255,136,0,0.25)';
                            btn.style.borderColor = '#ff8800';
                            btn.style.color = '#ff8800';
                            setTimeout(() => {
                                if (btn.dataset.confirm === 'true') {
                                    btn.dataset.confirm = '';
                                    btn.textContent = btn._origText;
                                    btn.style.cssText = btn._origStyle;
                                }
                            }, 2500);
                        }
                    });
                });
            }

            // ── GARAGE TAB: View owned cars, switch active, sell ──
            _renderGarageTab(container) {
                const self = this;
                let html = '';

                html += `<div style="font-size:0.65rem; color:#666; margin-bottom:10px;">OWNED: ${this.garage.count} VEHICLE${this.garage.count > 1 ? 'S' : ''}</div>`;

                for (let i = 0; i < this.garage.count; i++) {
                    const car = this.garage.get(i);
                    const isActive = i === this.garage.activeIndex;
                    const name = this.garage.getDisplayName(i);
                    const brandData = VEHICLE_BRANDS[car.brand];
                    const borderCol = isActive ? 'rgba(255,136,0,0.3)' : 'rgba(255,255,255,0.06)';
                    const bgCol = isActive ? 'rgba(255,136,0,0.04)' : 'rgba(255,255,255,0.02)';

                    html += `<div style="background:${bgCol}; border:1px solid ${borderCol}; border-radius:4px; padding:12px; margin-bottom:6px;">`;

                    // Row 1: Name + Status
                    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">`;
                    html += `<div style="display:flex; align-items:center; gap:8px;">`;
                    html += `<div style="width:16px; height:10px; border-radius:2px; background:${car.paintColor}; border:1px solid rgba(255,255,255,0.15);"></div>`;
                    html += `<span style="font-family:Orbitron,sans-serif; font-size:0.8rem; color:#ddd; letter-spacing:1px;">${name.toUpperCase()}</span>`;
                    if (car.isDefault) html += `<span style="font-size:0.45rem; color:#d4af37; letter-spacing:1px; border:1px solid rgba(212,175,55,0.3); padding:1px 6px; border-radius:2px;">DEFAULT</span>`;
                    html += `</div>`;
                    html += `<span style="font-family:Orbitron,sans-serif; font-size:0.5rem; color:${isActive ? '#00ff88' : '#666'}; letter-spacing:1px;">${isActive ? '● ACTIVE' : '○'}</span>`;
                    html += `</div>`;

                    // Row 2: Color swatches
                    html += `<div style="display:flex; gap:12px; align-items:center; margin-bottom:8px; font-size:0.55rem; color:#666;">`;
                    html += `<span>PAINT <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${car.paintColor}; border:1px solid rgba(255,255,255,0.1); vertical-align:middle;"></span></span>`;
                    if (car.underglowColor) html += `<span>GLOW <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${car.underglowColor}; box-shadow:0 0 4px ${car.underglowColor}; vertical-align:middle;"></span></span>`;
                    html += `<span>LIGHTS <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${car.headlightColor}; box-shadow:0 0 4px ${car.headlightColor}; vertical-align:middle;"></span></span>`;
                    html += `</div>`;

                    // Row 3: Buttons
                    html += `<div style="display:flex; gap:6px; flex-wrap:wrap;">`;
                    if (!isActive) {
                        html += `<button class="auto-activate-btn" data-index="${i}" style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:4px 12px; background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.3); color:#00ff88; border-radius:3px; cursor:pointer;">SET ACTIVE</button>`;
                    }
                    html += `<button class="auto-reset-btn" data-index="${i}" style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:4px 12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); color:#888; border-radius:3px; cursor:pointer;">RESET</button>`;
                    if (!car.isDefault) {
                        const sellPrice = Math.floor((CAR_PRICES[car.brand]?.[car.model] || 0) * 0.4);
                        html += `<button class="auto-sell-btn" data-index="${i}" style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:1px; padding:4px 12px; background:rgba(255,68,68,0.08); border:1px solid rgba(255,68,68,0.2); color:#ff6644; border-radius:3px; cursor:pointer;">SELL (${sellPrice} PP)</button>`;
                    }
                    html += `</div>`;

                    html += `</div>`;
                }

                container.innerHTML = html;

                // Wire activate
                container.querySelectorAll('.auto-activate-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        self.switchGarageCar(parseInt(btn.dataset.index));
                        self._renderGarageTab(container);
                    });
                });

                // Wire reset (double-tap)
                container.querySelectorAll('.auto-reset-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (btn.dataset.confirm === 'true') {
                            self.resetGarageCarDefaults(parseInt(btn.dataset.index));
                            self._renderGarageTab(container);
                        } else {
                            btn.dataset.confirm = 'true';
                            btn._orig = btn.textContent;
                            btn._origS = btn.style.cssText;
                            btn.textContent = 'ARE YOU SURE?';
                            btn.style.background = 'rgba(255,40,40,0.2)';
                            btn.style.borderColor = 'rgba(255,40,40,0.6)';
                            btn.style.color = '#ff4444';
                            setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = btn._orig; btn.style.cssText = btn._origS; }, 2500);
                        }
                    });
                });

                // Wire sell (double-tap)
                container.querySelectorAll('.auto-sell-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.index);
                        const car = self.garage.get(idx);
                        if (!car || car.isDefault) return;
                        const sellPrice = Math.floor((CAR_PRICES[car.brand]?.[car.model] || 0) * 0.4);
                        if (btn.dataset.confirm === 'true') {
                            self.garage.removeCar(idx);
                            self.currency += sellPrice;
                            // If we sold the active car, rebuild ownedCar to the new active
                            const newActive = self.garage.getActive();
                            if (self.ownedCar.brand !== newActive.brand || self.ownedCar.model !== newActive.model) {
                                self.switchGarageCar(self.garage.activeIndex);
                            } else {
                                self.garage.applyToVehicle(self.ownedCar);
                            }
                            document.getElementById('auto-shop-balance').textContent = `BALANCE: ${self.currency} PERSONICS`;
                            self.updateUI();
                            showMessage(`VEHICLE SOLD FOR ${sellPrice} PERSONICS.`);
                            self._renderGarageTab(container);
                        } else {
                            btn.dataset.confirm = 'true';
                            btn._orig = btn.textContent;
                            btn._origS = btn.style.cssText;
                            btn.textContent = 'SELL?';
                            btn.style.background = 'rgba(255,40,40,0.2)';
                            btn.style.borderColor = 'rgba(255,40,40,0.6)';
                            btn.style.color = '#ff4444';
                            setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = btn._orig; btn.style.cssText = btn._origS; }, 2500);
                        }
                    });
                });
            }

            // ── CUSTOMIZE TAB: Paint, underglow, headlights ──
            _renderCustomizeTab(container) {
                const self = this;
                const idx = this.garage.activeIndex;
                const car = this.garage.getActive();
                if (!car) { container.innerHTML = '<div style="color:#555;">No active vehicle.</div>'; return; }

                const name = this.garage.getDisplayName(idx);
                const brandData = VEHICLE_BRANDS[car.brand];

                // Snapshot originals on first render (so we can revert)
                if (!this._customizeOriginal || this._customizeOriginal._carId !== car.id) {
                    this._customizeOriginal = {
                        _carId: car.id,
                        paintColor: car.paintColor,
                        underglowColor: car.underglowColor,
                        headlightColor: car.headlightColor
                    };
                    // Pending starts as current
                    this._customizePending = {
                        paintColor: car.paintColor,
                        underglowColor: car.underglowColor,
                        headlightColor: car.headlightColor
                    };
                }
                const pending = this._customizePending;
                const orig = this._customizeOriginal;

                // Color palette: brand colors + universal options + pink
                const universalColors = ['#1a1a1a', '#0a0a0a', '#ffffff', '#333333', '#8b0000', '#003366', '#2d5a27', '#4a0e4e', '#d4af37', '#ff4500', '#ff69b4', '#E6E6FA', '#CCCCFF'];
                const brandColors = brandData?.colors || [];
                const allPaintColors = [...new Set([...brandColors, ...universalColors])];

                const glowOptions = [null, '#ffffff', '#ff8800', '#00f3ff', '#ff00aa', '#00ff88', '#d4af37', '#ff2244', '#a469ff', '#ff4500', '#ff69b4', '#E6E6FA', '#CCCCFF'];
                const headlightOptions = ['#ffffaa', '#ffffff', '#ccddff', '#ff8800', '#00f3ff', '#ff69b4', '#d4af37', '#ff2244', '#E6E6FA', '#CCCCFF'];

                // Calculate pending cost
                let totalCost = 0;
                let changeCount = 0;
                if (pending.paintColor !== orig.paintColor) { totalCost += CUSTOM_PRICES.paint; changeCount++; }
                if (pending.underglowColor !== orig.underglowColor) { totalCost += CUSTOM_PRICES.underglow; changeCount++; }
                if (pending.headlightColor !== orig.headlightColor) { totalCost += CUSTOM_PRICES.headlights; changeCount++; }
                const canAfford = this.currency >= totalCost;

                let html = '';
                html += `<div style="font-family:Orbitron,sans-serif; font-size:0.75rem; color:#ff8800; letter-spacing:1px; margin-bottom:4px;">CUSTOMIZING: ${name.toUpperCase()}</div>`;
                html += `<div style="font-size:0.55rem; color:#666; margin-bottom:12px;">Preview freely — you're only charged when you apply.</div>`;

                // ── PAINT ──
                html += `<div style="font-size:0.6rem; color:#888; letter-spacing:1px; margin:10px 0 6px;">PAINT COLOR <span style="font-size:0.5rem; color:#555;">(${CUSTOM_PRICES.paint} PP)</span></div>`;
                html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">`;
                for (const col of allPaintColors) {
                    const isSelected = pending.paintColor === col;
                    html += `<button class="auto-paint-btn" data-color="${col}" style="width:28px; height:28px; border-radius:4px; background:${col}; border:2px solid ${isSelected ? '#ff8800' : 'rgba(255,255,255,0.1)'}; cursor:pointer; ${isSelected ? 'box-shadow:0 0 8px rgba(255,136,0,0.5);' : ''}"></button>`;
                }
                html += `</div>`;

                // ── UNDERGLOW ──
                html += `<div style="font-size:0.6rem; color:#888; letter-spacing:1px; margin:10px 0 6px;">UNDERGLOW <span style="font-size:0.5rem; color:#555;">(${CUSTOM_PRICES.underglow} PP)</span></div>`;
                html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">`;
                for (const col of glowOptions) {
                    const isSelected = pending.underglowColor === col;
                    const display = col || 'transparent';
                    const label = col === null ? '✕' : '';
                    html += `<button class="auto-glow-btn" data-color="${col === null ? 'null' : col}" style="width:28px; height:28px; border-radius:50%; background:${display}; border:2px solid ${isSelected ? '#ff8800' : 'rgba(255,255,255,0.15)'}; cursor:pointer; color:#888; font-size:0.7rem; line-height:24px; text-align:center; ${col ? 'box-shadow:0 0 6px ' + col + ';' : ''} ${isSelected ? 'box-shadow:0 0 10px rgba(255,136,0,0.6);' : ''}">${label}</button>`;
                }
                html += `</div>`;

                // ── HEADLIGHTS ──
                html += `<div style="font-size:0.6rem; color:#888; letter-spacing:1px; margin:10px 0 6px;">HEADLIGHT COLOR <span style="font-size:0.5rem; color:#555;">(${CUSTOM_PRICES.headlights} PP)</span></div>`;
                html += `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">`;
                for (const col of headlightOptions) {
                    const isSelected = pending.headlightColor === col;
                    html += `<button class="auto-headlight-btn" data-color="${col}" style="width:28px; height:28px; border-radius:50%; background:${col}; border:2px solid ${isSelected ? '#ff8800' : 'rgba(255,255,255,0.15)'}; cursor:pointer; box-shadow:0 0 6px ${col}; ${isSelected ? 'box-shadow:0 0 10px rgba(255,136,0,0.6);' : ''}"></button>`;
                }
                html += `</div>`;

                // ── LIVE PREVIEW ──
                html += `<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:4px; padding:12px; margin-top:10px;">`;
                html += `<div style="font-size:0.55rem; color:#555; letter-spacing:1px; margin-bottom:8px;">PREVIEW</div>`;
                html += `<div style="display:flex; align-items:center; gap:16px;">`;
                html += `<div style="position:relative; width:80px; height:40px; background:${pending.paintColor}; border-radius:6px 6px 3px 3px; border:1px solid rgba(255,255,255,0.1);">`;
                if (pending.underglowColor) html += `<div style="position:absolute; bottom:-4px; left:5px; right:5px; height:4px; background:${pending.underglowColor}; border-radius:2px; box-shadow:0 0 8px ${pending.underglowColor}, 0 2px 12px ${pending.underglowColor};"></div>`;
                html += `<div style="position:absolute; top:8px; right:-2px; width:6px; height:6px; border-radius:50%; background:${pending.headlightColor}; box-shadow:0 0 8px ${pending.headlightColor};"></div>`;
                html += `<div style="position:absolute; top:26px; right:-2px; width:6px; height:6px; border-radius:50%; background:${pending.headlightColor}; box-shadow:0 0 8px ${pending.headlightColor};"></div>`;
                html += `</div>`;
                html += `<div style="font-size:0.6rem; color:#999; line-height:1.6;">`;
                html += `Paint: <span style="color:#ccc;">${pending.paintColor}</span>${pending.paintColor !== orig.paintColor ? ' <span style="color:#ff8800;">●</span>' : ''}<br>`;
                html += `Glow: <span style="color:#ccc;">${pending.underglowColor || 'None'}</span>${pending.underglowColor !== orig.underglowColor ? ' <span style="color:#ff8800;">●</span>' : ''}<br>`;
                html += `Lights: <span style="color:#ccc;">${pending.headlightColor}</span>${pending.headlightColor !== orig.headlightColor ? ' <span style="color:#ff8800;">●</span>' : ''}`;
                html += `</div></div></div>`;

                // ── ACTION BUTTONS ──
                html += `<div style="display:flex; gap:8px; margin-top:14px;">`;
                if (changeCount > 0) {
                    html += `<button id="auto-custom-apply" style="font-family:Orbitron,sans-serif; font-size:0.6rem; letter-spacing:1px; padding:8px 16px; flex:1; border-radius:3px; cursor:pointer; background:${canAfford ? 'rgba(255,136,0,0.15)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${canAfford ? 'rgba(255,136,0,0.4)' : 'rgba(255,255,255,0.08)'}; color:${canAfford ? '#ff8800' : '#555'};">APPLY ${changeCount} CHANGE${changeCount > 1 ? 'S' : ''} — ${totalCost} PP</button>`;
                    html += `<button id="auto-custom-revert" style="font-family:Orbitron,sans-serif; font-size:0.6rem; letter-spacing:1px; padding:8px 16px; border-radius:3px; cursor:pointer; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); color:#888;">REVERT</button>`;
                } else {
                    html += `<div style="font-size:0.6rem; color:#555; font-style:italic; padding:8px 0;">No changes selected. Pick a color above to preview.</div>`;
                }
                html += `</div>`;

                container.innerHTML = html;

                // ── Wire preview clicks (no charge, just update pending + re-render) ──
                const updatePending = (prop, val) => {
                    pending[prop] = val;
                    self._renderCustomizeTab(container);
                };

                container.querySelectorAll('.auto-paint-btn').forEach(btn => {
                    btn.addEventListener('click', () => updatePending('paintColor', btn.dataset.color));
                });
                container.querySelectorAll('.auto-glow-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const val = btn.dataset.color === 'null' ? null : btn.dataset.color;
                        updatePending('underglowColor', val);
                    });
                });
                container.querySelectorAll('.auto-headlight-btn').forEach(btn => {
                    btn.addEventListener('click', () => updatePending('headlightColor', btn.dataset.color));
                });

                // ── Wire apply button (charges once for all changes) ──
                const applyBtn = document.getElementById('auto-custom-apply');
                if (applyBtn) {
                    applyBtn.addEventListener('click', () => {
                        if (!canAfford) { showMessage(`INSUFFICIENT FUNDS (${totalCost} PERSONICS REQUIRED).`); return; }
                        self.currency -= totalCost;
                        self.customizeGarageCar(idx, {
                            paintColor: pending.paintColor,
                            underglowColor: pending.underglowColor,
                            headlightColor: pending.headlightColor
                        });
                        document.getElementById('auto-shop-balance').textContent = `BALANCE: ${self.currency} PERSONICS`;
                        self.updateUI();
                        showMessage(`CUSTOMIZATION APPLIED — ${totalCost} PERSONICS`);
                        // Reset originals to new state
                        self._customizeOriginal = { _carId: car.id, paintColor: pending.paintColor, underglowColor: pending.underglowColor, headlightColor: pending.headlightColor };
                        self._renderCustomizeTab(container);
                    });
                }

                // ── Wire revert button ──
                const revertBtn = document.getElementById('auto-custom-revert');
                if (revertBtn) {
                    revertBtn.addEventListener('click', () => {
                        pending.paintColor = orig.paintColor;
                        pending.underglowColor = orig.underglowColor;
                        pending.headlightColor = orig.headlightColor;
                        self._renderCustomizeTab(container);
                    });
                }
            }
            
            // =========================================================
            //  ZIB TAXI DESTINATION PICKER
            // =========================================================
            openZibMenu(zib) {
                this.pauseSystem.acquire('zib_menu');
                this._pendingZib = zib;
                const menu = document.getElementById('zib-menu');
                menu.style.display = 'block';
                document.getElementById('zib-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;

                const container = document.getElementById('zib-destinations');
                const self = this;
                let html = '';

                for (const dest of ZIB_DESTINATIONS) {
                    // Resolve position from landmark registry
                    const lm = this.landmarkRegistry[dest.landmark];
                    if (!lm) continue; // Skip if landmark not found on current map
                    const destX = lm.x;
                    const destY = lm.y;

                    const fare = this.zibSystem.calculateFare(zib.x, zib.y, destX, destY);
                    const canAfford = this.currency >= fare;
                    const dist = Math.hypot(destX - zib.x, destY - zib.y);
                    const distLabel = dist < 500 ? 'NEARBY' : dist < 2000 ? 'MODERATE' : 'FAR';

                    html += `<button class="zib-dest-btn" data-id="${dest.id}" data-landmark="${dest.landmark}" data-x="${destX}" data-y="${destY}" data-fare="${fare}" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:10px 14px; margin-bottom:5px; background:${canAfford ? 'rgba(138,43,226,0.06)' : 'rgba(255,255,255,0.02)'}; border:1px solid ${canAfford ? 'rgba(138,43,226,0.2)' : 'rgba(255,255,255,0.05)'}; border-radius:4px; cursor:${canAfford ? 'pointer' : 'default'}; font-family:Montserrat,sans-serif; color:${canAfford ? '#ddd' : '#555'}; text-align:left;">`;
                    html += `<div>`;
                    html += `<div style="font-size:0.8rem; margin-bottom:2px;">${dest.label}</div>`;
                    html += `<div style="font-size:0.5rem; color:#777; letter-spacing:1px;">${distLabel}</div>`;
                    html += `</div>`;
                    html += `<div style="font-family:Orbitron,sans-serif; font-size:0.6rem; color:${canAfford ? '#8a2be2' : '#555'}; letter-spacing:1px;">${fare} PP</div>`;
                    html += `</button>`;
                }

                container.innerHTML = html;

                // Wire destination buttons
                container.querySelectorAll('.zib-dest-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const fare = parseInt(btn.dataset.fare);
                        if (self.currency < fare) { showMessage('INSUFFICIENT FUNDS.'); return; }
                        const destX = parseFloat(btn.dataset.x);
                        const destY = parseFloat(btn.dataset.y);
                        const landmarkId = btn.dataset.landmark;
                        const selectedZib = self._pendingZib;
                        self.closeZibMenu();
                        self.zibSystem.startRide(selectedZib, landmarkId, destX, destY, fare, self);
                    });
                });

                // Wire close
                document.getElementById('zib-close').onclick = () => this.closeZibMenu();
            }

            closeZibMenu() {
                document.getElementById('zib-menu').style.display = 'none';
                this._pendingZib = null;
                this.pauseSystem.release('zib_menu');
            }

            openSleepMenu() {
                this.pauseSystem.acquire('sleep_menu');
                const menu = document.getElementById('sleep-menu');
                menu.style.display = 'block';
                
                // Setup Slider Logic
                const slider = document.getElementById('sleep-slider');
                const display = document.getElementById('sleep-time-display');
                
                // Default to 8 AM
                slider.value = 8;
                display.textContent = "08:00";
                
                // Update display on drag
                slider.oninput = () => {
                    const val = parseInt(slider.value);
                    display.textContent = `${val.toString().padStart(2, '0')}:00`;
                };
                
                // Confirm Button
                const confirmBtn = document.getElementById('btn-sleep-confirm');
                confirmBtn.onclick = () => {
                    menu.style.display = 'none';
                    this.pauseSystem.release('sleep_menu');
                    this.sleep(parseInt(slider.value));
                };
                
                // Cancel Button
                const cancelBtn = document.getElementById('btn-sleep-cancel');
                cancelBtn.onclick = () => {
                    menu.style.display = 'none';
                    this.pauseSystem.release('sleep_menu');
                };
            }
        
            sleep(targetHour) {
                // 1. Fade to Black
                const overlay = document.getElementById('fade-overlay');
                overlay.classList.add('active');
                this.pauseSystem.acquire('sleep_blackout');
                
                showMessage("RESTING...");
                
                setTimeout(() => {
                    // 2. Advance Time
                    // Calculate difference between now and target hour
                    const currentMinOfDay = this.worldMinutes % (24 * 60);
                    const targetMinOfDay = targetHour * 60;
                    
                    let diff = targetMinOfDay - currentMinOfDay;
                    if (diff <= 0) diff += 24 * 60; // Wrap to next day
                    
                    this.worldMinutes += diff;
                    
                    // 3. Heal Player & Refill Boosters
                    this.playerHealth = this.maxPlayerHealth;
                    this.player.syncHealth(this.playerHealth);
                    this.boosterCount = this.getEffectiveMaxBoosters();
                    
                    // 4. Save Game
                    this.saveGame();
                    
                    // 4b. Reset bonding cooldowns (new rest cycle)
                    if (this.bonding) this.bonding.resetCooldowns();
                    
                    this.updateUI();
                    this.updateTime(true); // Update clock immediately
                    
                    // 5. Wake up
                    setTimeout(() => {
                        overlay.classList.remove('active');
                        this.pauseSystem.release('sleep_blackout');
                        showMessage(`RESTED UNTIL ${targetHour.toString().padStart(2,'0')}:00. GAME SAVED.`);
                        audioSys.sfx('ui');
                    }, 1000);
                    
                }, 1500); // 1.5 second blackout
            }
            
            updateDaytimeExposure() {
                const overlay = document.getElementById('daytime-filter');
                if (!overlay) return;
        
                // Current time in minutes (0 - 1440)
                const time = this.worldMinutes % 1440;
                
                // Define Day Cycle
                const sunrise = 6 * 60;   // 06:00
                const sunset = 19 * 60;   // 19:00
                
                // 1. NIGHT CHECK: If it's night, remove filter entirely
                if (time <= sunrise || time >= sunset || this.activeMap.type === 'indoor') {
                    overlay.style.backdropFilter = 'none';
                    overlay.style.webkitBackdropFilter = 'none';
                    return;
                }
        
                // 2. DAY CALCULATION
                const dayLength = sunset - sunrise;
                const progress = (time - sunrise) / dayLength;
                const intensity = Math.sin(progress * Math.PI);
        
                // Brightness: 100% -> 130%
                const brightness = 100 + (intensity * 60);
                
                // Contrast: 100% -> 80%
                const contrast = 100 - (intensity * 20);
        
                const filterString = `brightness(${brightness}%) contrast(${contrast}%)`;
                
                overlay.style.backdropFilter = filterString;
                overlay.style.webkitBackdropFilter = filterString;
            }

            triggerFlit() {
                if (this.isDriving || this.paused) return;
                
                // Calculate effective dash cost (reduced by augment + buffs)
                let cost = this.flitState.dashCost;
                if (this.augments && this.augments.isEquipped('flit_ext')) {
                    cost = Math.floor(cost * 0.7); // 30% cost reduction
                }
                cost = Math.floor(this.player.buffSystem.getStat('flitCooldown', cost));
                
                // Check attunement pool
                if (this.flitState.attunement < cost) return;
                
                // Spend attunement
                this.flitState.attunement -= cost;
                this.flitState.active = true; 
                this.flitState.duration = this.flitState.maxDuration;
                if (this.flitState.attunement < cost) this.flitBtn.classList.add('cooldown');
                
                // --- Capture start state for VFX ---
                const startX = this.player.x;
                const startY = this.player.y;
                const startAngle = this.player.angle;
                
                let flitDist = this.player.buffSystem.getStat('flitDistance', 120);
                if (this.augments && this.augments.isEquipped('flit_ext')) flitDist *= 1.3; // 30% more range

                // Flit direction: use movement keys (WASD) or joystick if active, otherwise fall back to facing angle
                let flitAngle = this.player.angle;
                let moveX = 0, moveY = 0;
                if (this.keys['w'] || this.keys['ArrowUp']) moveY = -1;
                if (this.keys['s'] || this.keys['ArrowDown']) moveY = 1;
                if (this.keys['a'] || this.keys['ArrowLeft']) moveX = -1;
                if (this.keys['d'] || this.keys['ArrowRight']) moveX = 1;
                if (this.joystick && this.joystick.active) {
                    moveX = this.joystick.dx;
                    moveY = this.joystick.dy;
                }
                if (moveX !== 0 || moveY !== 0) {
                    flitAngle = Math.atan2(moveY, moveX);
                }

                let targetX = this.player.x + Math.cos(flitAngle) * flitDist; let targetY = this.player.y + Math.sin(flitAngle) * flitDist;
                let hitWall = false; for(let w of this.activeMap.walls) { if (targetX > w.x && targetX < w.x + w.w && targetY > w.y && targetY < w.y + w.h) { hitWall = true; break; } }
                if (hitWall) { targetX = this.player.x + Math.cos(flitAngle) * 20; targetY = this.player.y + Math.sin(flitAngle) * 20; }
                
                // Clamp target within map bounds
                const margin = 20;
                targetX = Math.max(margin, Math.min(this.activeMap.width - margin, targetX));
                targetY = Math.max(margin, Math.min(this.activeMap.height - margin, targetY));
                
                this.player.x = targetX; this.player.y = targetY; resetHumanoidAnim(this.player); showMessage("FLIT!"); this.triggerShake(4);

                // --- Spawn Flit VFX ---
                const cosmeticConfig = this.cosmetics.getRenderConfig();
                let stance = 'idle';
                if (this.weaponMode === 'normal') stance = 'pistol';
                else if (this.weaponMode === 'sniper') stance = 'sniper';

                // Generate jagged lightning trail segments from A to B
                const dx = targetX - startX;
                const dy = targetY - startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const segCount = Math.max(4, Math.floor(dist / 12));
                const perpX = -dy / dist;
                const perpY = dx / dist;
                
                // Main bolt + 2 branching sub-bolts
                const generateBolt = (jitterScale) => {
                    const points = [];
                    for (let i = 0; i <= segCount; i++) {
                        const t = i / segCount;
                        const baseX = startX + dx * t;
                        const baseY = startY + dy * t;
                        // Jagged offset perpendicular to travel direction, tapered at ends
                        const envelope = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
                        const jitter = (Math.random() - 0.5) * dist * 0.15 * envelope * jitterScale;
                        points.push({ x: baseX + perpX * jitter, y: baseY + perpY * jitter });
                    }
                    return points;
                };

                const trails = [
                    { points: generateBolt(1.0), width: 3, alpha: 1.0 },   // Main bolt
                    { points: generateBolt(1.4), width: 1.5, alpha: 0.6 }, // Sub-bolt 1
                    { points: generateBolt(1.6), width: 1, alpha: 0.4 }    // Sub-bolt 2
                ];

                this.flitVFX.push({
                    startX, startY, startAngle,
                    endX: targetX, endY: targetY,
                    // Ghost afterimage — fades over ~1.25 seconds (75 frames)
                    ghostAlpha: 1.0,
                    ghostDecay: 0.014,
                    // Lightning trails — crackle and vanish fast (~0.2s)
                    trailLife: 1.0,
                    trailDecay: 0.084,
                    trails,
                    // Re-jitter timer for electric crackle effect
                    reJitterTimer: 0,
                    reJitterInterval: 3, // re-randomize every 3 frames
                    // Arrival glow at destination (~0.5s / 30 frames)
                    arrivalGlow: 1.0,
                    arrivalDecay: 0.035,
                    // Snapshot of player appearance
                    cosmeticConfig: JSON.parse(JSON.stringify(cosmeticConfig)),
                    stance,
                    outfit: { ...cosmeticConfig.outfit },
                    dist
                });
                
                // Play flit sound
                audioSys.sfx('flit');
            }

            /* =========================================================
               FLIT VISUAL EFFECTS SYSTEM
               ---------------------------------------------------------
               Renders the three-part flit teleport VFX:
               1. Ghost afterimage at origin — full humanoid silhouette
                  tinted white-violet, slowly fading over ~2.5s
               2. Lightning trails — jagged electrical arcs from A→B,
                  re-jittered every few frames for crackle, ~0.6s
               3. Arrival glow — radial bloom at destination, ~0.5s
               ========================================================= */
            updateFlitVFX() {
                for (let i = this.flitVFX.length - 1; i >= 0; i--) {
                    const vfx = this.flitVFX[i];

                    // Decay ghost afterimage
                    if (vfx.ghostAlpha > 0) {
                        vfx.ghostAlpha -= vfx.ghostDecay;
                        if (vfx.ghostAlpha < 0) vfx.ghostAlpha = 0;
                    }

                    // Decay lightning trails
                    if (vfx.trailLife > 0) {
                        vfx.trailLife -= vfx.trailDecay;
                        if (vfx.trailLife < 0) vfx.trailLife = 0;

                        // Re-jitter lightning segments for electric crackle
                        vfx.reJitterTimer++;
                        if (vfx.reJitterTimer >= vfx.reJitterInterval) {
                            vfx.reJitterTimer = 0;
                            const dx = vfx.endX - vfx.startX;
                            const dy = vfx.endY - vfx.startY;
                            const dist = vfx.dist;
                            const perpX = -dy / dist;
                            const perpY = dx / dist;
                            for (const trail of vfx.trails) {
                                const segCount = trail.points.length - 1;
                                for (let j = 1; j < segCount; j++) {
                                    const t = j / segCount;
                                    const envelope = Math.sin(t * Math.PI);
                                    const jitter = (Math.random() - 0.5) * dist * 0.15 * envelope * (trail.width > 2 ? 1.0 : 1.5);
                                    trail.points[j].x = vfx.startX + dx * t + perpX * jitter;
                                    trail.points[j].y = vfx.startY + dy * t + perpY * jitter;
                                }
                            }
                        }
                    }

                    // Decay arrival glow
                    if (vfx.arrivalGlow > 0) {
                        vfx.arrivalGlow -= vfx.arrivalDecay;
                        if (vfx.arrivalGlow < 0) vfx.arrivalGlow = 0;
                    }

                    // Remove fully dead effects
                    if (vfx.ghostAlpha <= 0 && vfx.trailLife <= 0 && vfx.arrivalGlow <= 0) {
                        this.flitVFX.splice(i, 1);
                    }
                }
            }

            drawFlitVFX(ctx) {
                for (const vfx of this.flitVFX) {
                    ctx.save();

                    // === 1. LIGHTNING TRAILS (A → B) ===
                    if (vfx.trailLife > 0) {
                        const tAlpha = vfx.trailLife;

                        for (const trail of vfx.trails) {
                            const pts = trail.points;
                            if (pts.length < 2) continue;

                            // Outer glow layer (violet)
                            ctx.save();
                            ctx.globalAlpha = tAlpha * trail.alpha * 0.5;
                            ctx.strokeStyle = 'rgba(164, 105, 255, 1)';
                            ctx.lineWidth = trail.width + 6;
                            ctx.shadowColor = '#a469ff';
                            ctx.shadowBlur = 20;
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            for (let j = 1; j < pts.length; j++) {
                                ctx.lineTo(pts[j].x, pts[j].y);
                            }
                            ctx.stroke();
                            ctx.restore();

                            // Core bolt (white-violet)
                            ctx.save();
                            ctx.globalAlpha = tAlpha * trail.alpha;
                            ctx.strokeStyle = `rgba(230, 210, 255, ${tAlpha})`;
                            ctx.lineWidth = trail.width;
                            ctx.shadowColor = '#fff';
                            ctx.shadowBlur = 8;
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            for (let j = 1; j < pts.length; j++) {
                                ctx.lineTo(pts[j].x, pts[j].y);
                            }
                            ctx.stroke();
                            ctx.restore();
                        }

                        // Bright flash nodes at random points along the bolt
                        ctx.save();
                        const mainPts = vfx.trails[0].points;
                        ctx.globalAlpha = tAlpha * 0.7;
                        for (let j = 0; j < mainPts.length; j += 2) {
                            const nodeSize = 2 + Math.random() * 3;
                            ctx.fillStyle = '#fff';
                            ctx.shadowColor = '#c8a0ff';
                            ctx.shadowBlur = 12;
                            ctx.beginPath();
                            ctx.arc(mainPts[j].x, mainPts[j].y, nodeSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.restore();
                    }

                    // === 2. GHOST AFTERIMAGE at start point ===
                    if (vfx.ghostAlpha > 0) {
                        ctx.save();
                        ctx.translate(vfx.startX, vfx.startY);
                        ctx.rotate(vfx.startAngle);

                        // Pulsing violet-white glow behind the ghost
                        const glowPulse = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
                        const glowRadius = 25 + vfx.ghostAlpha * 15;
                        ctx.save();
                        ctx.globalAlpha = vfx.ghostAlpha * 0.4 * glowPulse;
                        const ghostGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
                        ghostGlow.addColorStop(0, 'rgba(200, 170, 255, 0.8)');
                        ghostGlow.addColorStop(0.5, 'rgba(164, 105, 255, 0.3)');
                        ghostGlow.addColorStop(1, 'rgba(164, 105, 255, 0)');
                        ctx.fillStyle = ghostGlow;
                        ctx.beginPath();
                        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        // Draw the player silhouette with violet-white tint
                        ctx.globalAlpha = vfx.ghostAlpha * 0.75;
                        // Vertical flicker/distortion — slight scale wobble
                        const flicker = 1.0 + (Math.random() - 0.5) * 0.04 * vfx.ghostAlpha;
                        ctx.scale(flicker, 1.0 + (1.0 - flicker) * 0.5);

                        drawProceduralHumanoid(ctx, {
                            walkPhase: 0, animState: 'idle',
                            velocityX: 0, velocityY: 0, speed: 0
                        }, {
                            skinColor: '#c8a0ff', // Violet-tinted skin
                            hair: vfx.cosmeticConfig.hair ? {
                                ...vfx.cosmeticConfig.hair,
                                color: '#d8c0ff' // Light violet hair
                            } : null,
                            gender: 'female',
                            stance: vfx.stance,
                            isDriving: false,
                            top: '#b88aee',    // Violet outfit tint
                            bottom: '#9a70d4',
                            shoes: '#8060b8'
                        });

                        ctx.restore();
                    }

                    // === 3. ARRIVAL GLOW + AFTERIMAGE at destination ===
                    if (vfx.arrivalGlow > 0) {
                        const ag = vfx.arrivalGlow;

                        // Radial bloom
                        ctx.save();
                        const expandRadius = 30 + (1.0 - ag) * 25;
                        ctx.globalAlpha = ag * 0.6;
                        ctx.translate(vfx.endX, vfx.endY);
                        const arrGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, expandRadius);
                        arrGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                        arrGrad.addColorStop(0.3, 'rgba(200, 170, 255, 0.6)');
                        arrGrad.addColorStop(0.7, 'rgba(164, 105, 255, 0.2)');
                        arrGrad.addColorStop(1, 'rgba(164, 105, 255, 0)');
                        ctx.fillStyle = arrGrad;
                        ctx.shadowColor = '#c8a0ff';
                        ctx.shadowBlur = 20 * ag;
                        ctx.beginPath();
                        ctx.arc(0, 0, expandRadius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        // Arrival afterimage — bright white-violet silhouette that
                        // rapidly fades as the real player "solidifies" in place
                        ctx.save();
                        ctx.translate(vfx.endX, vfx.endY);
                        ctx.rotate(vfx.startAngle);
                        ctx.globalAlpha = ag * 0.6;
                        // Slight vertical stretch that settles — materializing effect
                        const settle = 1.0 + ag * 0.08;
                        ctx.scale(1.0, settle);

                        drawProceduralHumanoid(ctx, {
                            walkPhase: 0, animState: 'idle',
                            velocityX: 0, velocityY: 0, speed: 0
                        }, {
                            skinColor: '#e0d0ff', // Brighter white-violet tint
                            hair: vfx.cosmeticConfig.hair ? {
                                ...vfx.cosmeticConfig.hair,
                                color: '#f0e8ff'
                            } : null,
                            gender: 'female',
                            stance: vfx.stance,
                            isDriving: false,
                            top: '#d4c0f8',
                            bottom: '#c0aaee',
                            shoes: '#b098e0'
                        });
                        ctx.restore();
                    }

                    // === 4. ORIGIN BURST — small particles at start ===
                    // (Handled by existing ghost particle + the glow above)

                    ctx.restore();
                }
            }

            /* =========================================================
               GRAVEYARD GHOST RENDERING
               ---------------------------------------------------------
               Draws procedural humanoid ghosts in the cemetery.
               Each ghost fades in, wanders between gravestones, then
               fades out. Rendered with blue-white tint and radial glow.
               ========================================================= */
            drawGraveyardGhosts(ctx) {
                for (const g of this.graveyardGhosts) {
                    if (g.life <= 0) continue;
                    ctx.save();
                    ctx.translate(g.x, g.y);

                    // Radial blue-white glow behind the ghost
                    const glowPulse = 0.6 + Math.sin(Date.now() * 0.003 + g.x) * 0.3;
                    const glowRadius = 28 + g.life * 12;
                    ctx.save();
                    ctx.globalAlpha = g.life * 0.35 * glowPulse;
                    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
                    glow.addColorStop(0, 'rgba(180, 220, 255, 0.7)');
                    glow.addColorStop(0.5, 'rgba(120, 180, 230, 0.25)');
                    glow.addColorStop(1, 'rgba(100, 160, 220, 0)');
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Draw the humanoid figure
                    ctx.save();
                    ctx.rotate(g.angle);
                    ctx.globalAlpha = g.life;
                    // Subtle vertical flicker
                    const flicker = 1.0 + (Math.sin(Date.now() * 0.01 + g.y * 0.1) * 0.02) * g.life;
                    ctx.scale(flicker, 1.0);

                    // Pass the ghost itself so the shared gait controller can track it
                    // (the old throwaway object used velocityX/Y, which the renderer never read)
                    drawProceduralHumanoid(ctx, g, {
                        skinColor: g.skinColor,
                        hair: g.hair,
                        gender: g.gender,
                        stance: 'idle',
                        isDriving: false,
                        top: g.topColor,
                        bottom: g.bottomColor,
                        shoes: g.shoeColor
                    });

                    ctx.restore();
                    ctx.restore();
                }
            }

            /* =========================================================
               UNIFIED UI UPDATE SYSTEM
               ---------------------------------------------------------
               All HUD elements are updated through this single method.
               Called every frame from the main game loop.
               
               Previously had separate functions (updateHealthUI, 
               updateBoosterUI, updateEconomyUI) but consolidated here
               for cleaner code and consistent state.
               ========================================================= */
            updateUI() {
                // --- 1. HEALTH BAR (Red gradient) ---
                // Displays player's current HP as percentage of max
                const healthPercent = Math.max(0, (this.playerHealth / this.maxPlayerHealth) * 100);
                this.healthBar.style.width = `${healthPercent}%`;
                
                // --- 2. FLIT ATTUNEMENT BAR (Champagne/Gold) ---
                // Shows current attunement pool. Full bar = max charges available.
                const flitPercent = Math.max(0, Math.min(100, 
                    (this.flitState.attunement / this.flitState.maxAttunement) * 100));
                document.getElementById('flit-bar').style.width = `${flitPercent}%`;

                // --- 3. ECONOMY DISPLAY ---
                // PP = Primary currency for purchases
                // Scrap = Secondary resource for upgrades
                this.uiCurrency.textContent = `PP: ${this.currency}`;
                this.uiScrap.textContent = `Scrap: ${this.scrap}`;
                
                // --- 4. BOOSTER/STIM COUNT ---
                // Shows remaining healing items on the heal button
                this.healBtn.innerHTML = `✚<br><span>${this.boosterCount}</span>`;
                
                // --- 5. GOLDEN SHIELD BAR (any buff with shield) ---
                const shieldContainer = document.getElementById('ui-shield-bar');
                const shieldFill = document.getElementById('shield-bar-fill');
                if (shieldContainer && shieldFill) {
                    const shieldBuff = this.player.buffSystem.getShieldBuff();
                    if (shieldBuff) {
                        shieldContainer.style.display = 'block';
                        shieldFill.style.width = `${(shieldBuff.shield / shieldBuff.maxShield) * 100}%`;
                    } else {
                        shieldContainer.style.display = 'none';
                    }
                }
                
                // --- 6. AUDIO VISUALIZER (Cosmetic) ---
                // Random bar heights create a "playing music" effect
                const bars = document.querySelectorAll('#audio-viz .viz-bar');
                bars.forEach(bar => bar.style.height = `${20 + Math.random() * 80}%`);
            }
            
            /* =========================================================
               LOOT SPAWNING
               ---------------------------------------------------------
               Called when enemies die to drop random pickups.
               Drop rates: 40% PP, 30% Scrap, 20% Stim, 10% Nothing
               ========================================================= */
            spawnLoot(x, y) { 
                const rand = Math.random(); 
                if (rand < 0.4) this.loot.push(new Loot(x, y, 'pp')); 
                else if (rand < 0.7) this.loot.push(new Loot(x, y, 'scrap')); 
                else if (rand < 0.9) this.loot.push(new Loot(x, y, 'stim')); 
            }

            startDialogue(entity) {
                // BONDING INTERCEPT — recruited teammates in apartment
                if (entity.role === 'teammate' && entity.recruited 
                    && this.activeMap && this.activeMap.id === 'apt_949' && this.bonding) {
                    if (this.bonding.canBond(entity)) {
                        this.bonding.startBonding(entity, this);
                        return;
                    } else {
                        // Cooldown — show a brief remark instead
                        this.pauseSystem.acquire('dialogue');
                        this.dialogueBox.style.display = 'block';
                        this.npcNameEl.textContent = entity.name;
                        this.npcNameEl.style.color = SPEAKER_COLORS[entity.name] || '#ff0055';
                        this.renderDialoguePortrait(entity.name);
                        document.getElementById('dialogue-caption').style.display = 'none';
                        const cooldownLines = {
                            'Victoria': "We already talked. Go shoot something.",
                            'Yenna': "We've spoken. I'll be here.",
                            'Sabrina': "Miss me already? Later, Freelancer.",
                            'Max': "Chill, we just talked! Go take a nap or something.",
                            'Josh': "Social interaction quota met for this cycle."
                        };
                        this.npcTextEl.textContent = cooldownLines[entity.name] || "We've already caught up.";
                        this.btnAccept.style.display = 'none';
                        this.btnDecline.textContent = 'OK';
                        this.btnDecline.style.display = '';
                        return;
                    }
                }

                this.pauseSystem.acquire('dialogue'); 
                this.dialogueBox.style.display = 'block'; 
                this.npcNameEl.textContent = entity.name;
                
                // Render portrait and apply speaker color
                this.renderDialoguePortrait(entity.name);
                this.npcNameEl.style.color = SPEAKER_COLORS[entity.name] || '#ff0055';
                
                // 1. HIDE RANDOM CAPTIONS (Cleanup the screen)
                document.getElementById('dialogue-caption').style.display = 'none';
                
                // 2. Track Meeting (For Phone Contacts)
                if (typeof phoneSystem !== 'undefined') {
                    phoneSystem.meetNPC(entity);
                }
                
                // 3. SET DIALOGUE TEXT
                if (entity.name === "Dr. Yin") {
                    this.npcTextEl.textContent = "Welcome to the Clinic. I have cybernetic augments if you have the personics. Neural implants, subdermal mesh, phase wires — all top-grade.";
                } 
                else if (entity.name === "Barista Ren") {
                    if (this.missions.activeMission) {
                        this.npcTextEl.textContent = "You've already got a job running. Finish that first, then come back for more work.";
                    } else {
                        this.npcTextEl.textContent = "Hey! We've got an Amber delivery that needs to go out. Want to run it? Good personics in it for you.";
                    }
                }
                else if (entity.name === "Bartender") {
                    if (this.missions.activeMission) {
                        this.npcTextEl.textContent = "Handle your current contract first, Freelancer. Then we'll talk bounties.";
                    } else {
                        this.npcTextEl.textContent = "Welcome to Moon City. We've got a bounty that needs handling — dangerous type, good payout. Interested?";
                    }
                } 
                else if (entity.name === "Torque") {
                    this.npcTextEl.textContent = "Welcome to Torque Auto, Freelancer. Need a new ride, paint job, or some glow work? Step up to the counter.";
                }
                else if (entity.name === "Prisma") {
                    this.npcTextEl.textContent = "Welcome to Neural Systems. Identity is a spectrum — we just help you find your frequency. Browse our W.I.G.s, S.K.I.N.s, and V.O.C.A.L.s.";
                }
                else if (entity.name === "Biggs") {
                    this.npcTextEl.textContent = `Welcome to Biggs Amusement Park! CRASH ROYALE is our flagship — 7 cars, 60 seconds, pure chaos. Entry: ${this.bumperMinigame.entryCost} personics. You in?`;
                }
                else if (entity.name === "Grum North") {
                    const highWave = this.hordeGauntlet ? this.hordeGauntlet.highestWave : 0;
                    const bossStatus = this.questState.churchBossDefeated ? 'DEFEATED' : 'UNVISITED';
                    let grumText = "Freelancer. I run the Gauntlet — waves of hostiles, no mercy, good pay. ";
                    if (highWave > 0) grumText += `Your record: Wave ${highWave}. `;
                    grumText += "I can also send you back to the Sanctum if you want another crack at the Triumvirate.";
                    this.npcTextEl.textContent = grumText;
                    // Show three-option menu
                    this.btnAccept.textContent = 'GAUNTLET';
                    this.btnDecline.textContent = 'BOSS REPLAY';
                    // Create third button for cancel
                    if (!this._grumCancelBtn) {
                        this._grumCancelBtn = document.createElement('button');
                        this._grumCancelBtn.className = 'dialogue-btn';
                        this._grumCancelBtn.textContent = 'LEAVE';
                        this._grumCancelBtn.style.opacity = '0.6';
                        this.btnDecline.parentElement.appendChild(this._grumCancelBtn);
                        this._grumCancelBtn.addEventListener('click', () => {
                            this._grumCancelBtn.style.display = 'none';
                            this.endDialogue();
                        });
                    }
                    this._grumCancelBtn.style.display = '';
                    this.btnAccept.style.display = '';
                    this.btnDecline.style.display = '';
                    return; // Skip default button setup
                }
                else if (entity.role === 'dancer' || entity.role === 'red_demon_dancer') {
                    if (entity.hired) {
                        this.npcTextEl.textContent = `I'm already with you for ${Math.ceil((entity.hireTime - this.worldMinutes) / 60)} more hours.`;
                    } else if (this.contractCount >= CONFIG.COMPANION.MAX_CONTRACTS) {
                        this.npcTextEl.textContent = "You already have 5 companions. That's the maximum!";
                    } else {
                        this.npcTextEl.textContent = `Hi, I'm ${entity.name}. Want some company? 400 personics for 8 hours.`;
                    }
                } 
                else if (entity.name === "LUVSH4D3") {
                     if (this.questState.ambushCleared && !this.questState.rewardClaimedLUVSH4D3) {
                        this.npcTextEl.textContent = "Oh, Freelancer! Thank you ever so much for dealing with those pesky intruders. Please, accept this as a token of Double Nights' gratitude.";
                     } else if (this.questState.rewardClaimedLUVSH4D3) {
                        this.npcTextEl.textContent = "We hope you enjoy your stay here at Double Nights. Excellence is our guarantee.";
                     } else {
                        this.npcTextEl.textContent = "Welcome to Double Nights. Please be aware, the Penthouse is currently... undergoing maintenance.";
                     }
                } 
                else if (entity.name === "Ms. Jean") {
                    if (!this.questState.etherealUnlocked) {
                        this.npcTextEl.textContent = "Yes, I am the face of 'Jean Soda'. But today I'm just paying respects. Tell me, Freelancer, do you see the ghosts here? Have you ever been curious about their stories?";
                    } else {
                        this.npcTextEl.textContent = "The Ethereal Plane is close. Do you wish to cross over?";
                    }
                }
                else if (entity.name === "Anavia") {
                    if (this.missions.completedBounties >= 5) {
                        if (this.missions.activeMission) {
                            this.npcTextEl.textContent = "Handle your current operation first, 949. I don't invest in distracted people.";
                        } else {
                            this.npcTextEl.textContent = "You've been making noise, 949. Good noise. I know where the real materials are — abandoned caches, forgotten freight. I'll mark it, you clear it. The scrap is yours. Interested?";
                        }
                    } else if (!this.questState.etherealUnlocked) {
                        this.npcTextEl.textContent = "Well, what a surprise visit. I'm curious to know if you work as good as you look. Come back later and I just might have something for you."
                    } else {
                        this.npcTextEl.textContent = "Hmm, you're clearly worth your salt, 949. Keep making noise out there. I may have something for you yet."
                    }
                }
                else if (entity.role.includes("robot")) {
                    this.npcTextEl.textContent = "I work 24/7, 366 on leap years. Have you ever stopped to admire the moonrise? What? Backside?? No! Just the regular ol' moon."
                }
                else if (entity.role === 'teammate') {
                    if (entity.recruited) {
                        // Per-character recruited lines
                        const recruitedLines = {
                            'Victoria': "Let's cause some chaos, Freelancer.",
                            'Yenna':    "Say the word. The SR-86 is ready.",
                            'Sabrina':  "Still here. Still deadly. You're welcome.",
                            'Max':      "Point me at something and let me shoot it.",
                            'Josh':     "Intel is current. Awaiting orders."
                        };
                        this.npcTextEl.textContent = recruitedLines[entity.name] || "Ready to roll out.";
                    } else {
                        const recruitLines = {
                            'Victoria': "Save me from these sad motherfuckers. Let's ride. (Recruit Victoria?)",
                            'Yenna':    "I've been watching the perimeter. Could use a spotter though. (Recruit Yenna?)",
                            'Sabrina':  "You look like you could use someone with actual talent. (Recruit Sabrina?)",
                            'Max':      "I'm bored as hell. You need firepower? Fine. Let's blow something up. (Recruit Max?)",
                            'Josh':     "I have tactical data that may be of use. Shall we proceed? (Recruit Josh?)"
                        };
                        this.npcTextEl.textContent = recruitLines[entity.name] || `You need heavy ordinance? Fine. Let's blow something up. (Recruit ${entity.name}?)`;
                    }
                } 
                else {
                    // Default Quest Giver Logic (Mirabel/Contractor)
                    if (this.questState.ambushCleared && !this.questState.rewardClaimedContractor) { 
                        this.npcTextEl.textContent = "949, you're alive! He escaped?? Starry Heavens above... Well take this payment as promised, and be ready for my next call."; 
                    } 
                    else if (this.questState.rewardClaimedContractor) { 
                        this.npcTextEl.textContent = "For the love of starry heavens! Fuck, he can't be far."; 
                    } 
                    else { 
                        this.npcTextEl.textContent = "Starry heavens, 949! We finally meet in the flesh. We have no time to waste. The Dark Maker is in the Double Nights, get him before he escapes! The fucker. Take this keycard, for the Suite."; 
                    }
                }
                
                // 4. LOCK UI INTERACTIONS (Except Dialogue Box)
                document.getElementById('game-ui').style.pointerEvents = 'none'; 
                this.dialogueBox.style.pointerEvents = 'auto';
            }

            /**
             * Resolve a speaker name to a drawCharacterPortrait() config.
             *
             * This is the SINGLE source of truth for "what does this character look
             * like in a portrait". It is deliberately separate from any canvas work
             * so every surface that wants a bust — the dialogue box, the cosmetic
             * preview canvases, a future contact-list avatar — resolves identically.
             * Duplicating the tier order is how these things drift apart.
             *
             * Tier order:
             *   1. Player (949 / Stella) — live cosmetics, falls back to defaults
             *   2. Recruited teammates — their own `appearance` block
             *   3. NPC_PORTRAIT_CONFIGS — per-name authored configs
             *   4. ROLE_PORTRAIT_CONFIGS — per-role, gender-split (dancers, spirits)
             *   5. Grey silhouette
             *
             * Always returns a usable config, never null. The returned object carries
             * `isFallback: true` when it landed on tier 5, so a caller that would
             * rather show something else than a grey silhouette (e.g. keeping a
             * contact's emoji avatar) can check before drawing.
             *
             * NOTE ON CACHING: the tier-1 result depends on live cosmetics and changes
             * when the player switches outfits. Do NOT cache rendered output by name.
             * Use getPortraitCanvas() / getPortraitDataURL(), which key on the resolved
             * config via portraitCacheKey() and therefore invalidate themselves.
             *
             * @param {string} speakerName
             * @returns {Object} config for drawCharacterPortrait
             */
            resolvePortraitConfig(speakerName) {
                // 1. Player
                if (speakerName === '949' || speakerName === 'Stella') {
                    if (this.cosmetics) {
                        const c = this.cosmetics.getRenderConfig();
                        return { skinColor: c.skinColor, hair: c.hair, eyeColor: '#daa520', gender: 'female', top: c.outfit.top };
                    }
                    return { skinColor: '#c68e63', hair: { type: 'curls', color: '#0a0505' }, eyeColor: '#daa520', gender: 'female' };
                }

                // 2. Teammates
                const tm = (this.teammates || []).find(t => t.name === speakerName);
                if (tm && tm.appearance) {
                    return { skinColor: tm.appearance.skinColor, hair: tm.appearance.hair, eyeColor: '#332211', gender: tm.appearance.gender || 'female', top: tm.appearance.top };
                }

                // 3. Per-name NPC configs
                if (NPC_PORTRAIT_CONFIGS[speakerName]) {
                    return { ...NPC_PORTRAIT_CONFIGS[speakerName], eyeColor: '#332211' };
                }

                // 4. Per-role configs — looks the speaker up among the live NPCs to
                // read their role and gender, so numerous cast members (dancers,
                // spirits) get a correct bust without per-name entries.
                const npc = (this.npcs || []).find(n => n.name === speakerName);
                const roleCfg = npc && ROLE_PORTRAIT_CONFIGS[npc.role];
                if (roleCfg) {
                    const resolved = roleCfg.byGender
                        ? (roleCfg.byGender[npc.gender] || roleCfg.byGender.female)
                        : roleCfg;
                    if (resolved) return { ...resolved, eyeColor: '#332211' };
                }

                // 5. Silhouette
                return { skinColor: '#555', hair: { type: 'short', color: '#333' }, eyeColor: '#222', gender: 'male', isFallback: true };
            }

            /**
             * Paint a resolved portrait into any canvas, with the circular backdrop.
             * Shared by the dialogue box and available to any future surface.
             * @param {HTMLCanvasElement} canvas
             * @param {string} speakerName
             * @param {string} [bg] backdrop fill; pass null to skip it
             */
            paintPortraitTo(canvas, speakerName, bg = 'rgba(40, 5, 25, 0.95)') {
                if (!canvas) return null;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (bg) {
                    ctx.fillStyle = bg;
                    ctx.beginPath();
                    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                const config = this.resolvePortraitConfig(speakerName);
                drawCharacterPortrait(ctx, canvas.width, canvas.height, config);
                return config;
            }

            /** Deterministic serialisation — key order can't affect the result. */
            _stableStringify(v) {
                if (v === null || typeof v !== 'object') return JSON.stringify(v);
                if (Array.isArray(v)) return '[' + v.map(x => this._stableStringify(x)).join(',') + ']';
                return '{' + Object.keys(v).sort()
                    .map(k => JSON.stringify(k) + ':' + this._stableStringify(v[k]))
                    .join(',') + '}';
            }

            /**
             * Cache key for a portrait config.
             *
             * THIS IS THE FIX FOR THE STALE-AVATAR PROBLEM. Caching rendered portraits
             * by character NAME is unsafe: 949's config is built from live cosmetics,
             * so changing outfits leaves a stale avatar behind. Keying on the resolved
             * config instead means appearance IS the key — change the outfit and the
             * key changes, so the next lookup misses and repaints. Nothing has to
             * remember to fire an invalidation event, which is the failure mode that
             * bit the notification badges.
             *
             * Serialises the WHOLE config rather than an enumerated list of fields
             * drawCharacterPortrait happens to read today. That's deliberate: if a
             * field is added to configs later and the renderer starts reading it, a
             * hand-maintained list would silently under-invalidate and serve wrong
             * portraits. Serialising everything can only ever OVER-invalidate, whose
             * worst case is one redundant redraw.
             *
             * `isFallback` is excluded because it's metadata for the caller, not
             * something the renderer draws.
             */
            portraitCacheKey(config) {
                const visual = { ...config };
                delete visual.isFallback;
                return this._stableStringify(visual);
            }

            /**
             * Offscreen canvas for a character at a given size, cached by appearance.
             * Safe to call every repaint — a hit is a Map lookup.
             * @returns {{canvas: HTMLCanvasElement, config: Object}}
             */
            getPortraitCanvas(speakerName, size = 48, bg = 'rgba(40, 5, 25, 0.95)') {
                if (!this._portraitCache) this._portraitCache = new Map();
                const config = this.resolvePortraitConfig(speakerName);
                const key = size + '|' + (bg || '') + '|' + this.portraitCacheKey(config);

                const hit = this._portraitCache.get(key);
                if (hit) {
                    // Refresh LRU position.
                    this._portraitCache.delete(key);
                    this._portraitCache.set(key, hit);
                    return hit;
                }

                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                this.paintPortraitTo(canvas, speakerName, bg);

                const entry = { canvas, config, url: null };
                this._portraitCache.set(key, entry);

                // Bound the cache. Outfit changes mint new keys, so an unbounded map
                // would grow with every cosmetic swap. Map preserves insertion order,
                // so the first key is the least recently used.
                const MAX_PORTRAIT_CACHE = 32;
                while (this._portraitCache.size > MAX_PORTRAIT_CACHE) {
                    this._portraitCache.delete(this._portraitCache.keys().next().value);
                }
                return entry;
            }

            /**
             * Data URL for a character portrait, for use as an <img src> in DOM lists.
             * Encoding is the expensive part, so it's memoised on the cache entry and
             * only paid once per appearance.
             */
            getPortraitDataURL(speakerName, size = 48, bg = 'rgba(40, 5, 25, 0.95)') {
                const entry = this.getPortraitCanvas(speakerName, size, bg);
                if (!entry.url) entry.url = entry.canvas.toDataURL('image/png');
                return entry.url;
            }

            /** Drop all cached portraits. Not needed for appearance changes — the key
             *  handles those — but useful for teardown and tests. */
            clearPortraitCache() {
                if (this._portraitCache) this._portraitCache.clear();
            }

            /** Render a character portrait into the dialogue box canvas. */
            renderDialoguePortrait(speakerName) {
                this.paintPortraitTo(document.getElementById('dialogue-portrait'), speakerName);
            }

            /**
             * Install a MutationObserver on npcTextEl so EVERY dialogue line ever
             * shown (DialogueSequence, single-line shop/quest greetings, recruit
             * prompts, story handler lines, anything future) is captured to the
             * transcript. Speaker is read from npcNameEl, which every call site
             * sets BEFORE the text write — that ordering is part of the contract.
             *
             * The observer runs synchronously on each text mutation. DialogueTranscript.add
             * already dedupes consecutive identical entries, which guards against the
             * "set name then set text" two-mutation pattern from re-firing when only
             * one of them changed.
             */
            _installDialogueCapture() {
                if (!this.npcTextEl || !this.transcript) return;
                if (this._dialogueCaptureInstalled) return;
                this._dialogueCaptureInstalled = true;

                const captureCurrentLine = () => {
                    // Only capture while the dialogue box is actually visible to the
                    // player — guards against init-time stub values being logged.
                    if (!this.dialogueBox || this.dialogueBox.style.display === 'none') return;
                    // Skip captures during peek mode — the player is reviewing, not
                    // hearing a new line. DialogueSequence flips this class on the box.
                    if (this.dialogueBox.classList.contains('peeking')) return;
                    const speaker = (this.npcNameEl && this.npcNameEl.textContent || '').trim();
                    const text = (this.npcTextEl.textContent || '').trim();
                    if (!speaker || !text) return;
                    // Filter out the placeholder defaults that get re-asserted on
                    // endDialogue resets. (The buttons reset to "Accept" / "Decline",
                    // but in case anything else writes a stub, this catches it.)
                    if (speaker === 'NPC Name') return;
                    this.transcript.add(speaker, text, this.worldMinutes);
                };

                const observer = new MutationObserver(captureCurrentLine);
                observer.observe(this.npcTextEl, { childList: true, characterData: true, subtree: true });
                this._dialogueObserver = observer;
            }
            
            endDialogue() {
                this.pauseSystem.release('dialogue'); 
                this.dialogueBox.style.display = 'none'; 
                
                // 1. RESTORE RANDOM CAPTIONS
                document.getElementById('dialogue-caption').style.display = 'block';
                
                // 2. RESTORE DIALOGUE BUTTON DEFAULTS
                this.btnAccept.textContent = 'Accept';
                this.btnAccept.style.display = '';
                this.btnDecline.textContent = 'Decline';
                this.btnDecline.style.display = '';
                this.npcNameEl.style.color = '';
                
                // 2b. Hide Grum's extra cancel button
                if (this._grumCancelBtn) this._grumCancelBtn.style.display = 'none';
                
                // 3. RESET POINTER EVENTS (Re-enable Buttons)
                document.getElementById('game-ui').style.pointerEvents = 'none'; 
                const buttons = document.querySelectorAll('.game-btn, #btn-fire, #btn-heal, #btn-flit, #btn-autodrive, #btn-nv, #btn-holster'); 
                buttons.forEach(b => b.style.pointerEvents = 'auto');
                document.getElementById('input-zone-left').style.pointerEvents = 'auto';
            }

            // --- AUGMENT SHOP ---
            openAugmentShop() {
                this.pauseSystem.acquire('augment_shop');
                const shop = document.getElementById('augment-shop');
                shop.classList.add('active');
                document.getElementById('aug-shop-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;
                
                const grid = document.getElementById('aug-shop-grid');
                grid.innerHTML = '';
                for (const aug of AUGMENT_CATALOG) {
                    const owned = this.augments.isOwned(aug.id);
                    const card = document.createElement('div');
                    card.className = 'aug-card' + (owned ? ' owned' : '');
                    card.innerHTML = `
                        <div class="aug-card-name">${aug.icon} ${aug.name}</div>
                        <div class="aug-card-desc">${aug.desc}</div>
                        ${owned ? '<div class="aug-card-owned">✓ OWNED</div>' : `<div class="aug-card-price">${aug.price} PP</div>`}
                    `;
                    if (!owned) {
                        card.addEventListener('click', () => {
                            if (this.augments.buy(aug.id, this)) {
                                this.openAugmentShop(); // Refresh
                            }
                        });
                    }
                    grid.appendChild(card);
                }

                // Close handler
                document.getElementById('aug-shop-close').onclick = () => {
                    shop.classList.remove('active');
                    this.pauseSystem.release('augment_shop');
                };
            }

            // ── COSMETICS SHOP (Neural Systems) ──
            openCosmeticsShop() {
                this.pauseSystem.acquire('cosmetics_shop');
                const overlay = document.getElementById('cosmetics-shop-overlay');
                overlay.style.display = 'block';
                document.getElementById('cosmetics-shop-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;

                // Tab state
                let activeTab = 'wig';
                const tabs = overlay.querySelectorAll('.cosmetics-tab');
                const content = document.getElementById('cosmetics-shop-content');

                const renderTab = (category) => {
                    activeTab = category;
                    // Update tab styling
                    tabs.forEach(t => {
                        const isActive = t.dataset.tab === category;
                        t.style.background = isActive ? 'rgba(0,136,255,0.15)' : 'rgba(255,255,255,0.03)';
                        t.style.borderColor = isActive ? 'rgba(0,136,255,0.4)' : 'rgba(255,255,255,0.1)';
                        t.style.color = isActive ? '#0088ff' : '#888';
                    });

                    // Get items for this category
                    const items = Object.values(COSMETICS_REGISTRY).filter(e => e.category === category);
                    const equippedId = category === 'wig' ? this.cosmetics.equippedWig :
                                       category === 'skin' ? this.cosmetics.equippedSkin :
                                       category === 'outfit' ? this.cosmetics.equippedOutfit :
                                       category === 'accessory' ? this.cosmetics.equippedAccessory :
                                       this.cosmetics.equippedVocal;

                    let html = '';
                    for (const item of items) {
                        const owned = this.cosmetics.isOwned(item.id);
                        const equipped = item.id === equippedId;
                        const borderCol = equipped ? 'rgba(0,136,255,0.5)' : owned ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
                        const bgCol = equipped ? 'rgba(0,136,255,0.08)' : 'rgba(255,255,255,0.03)';

                        // Color swatch for visual categories
                        let swatch = '';
                        if (category === 'wig') {
                            swatch = `<div style="width:18px;height:18px;border-radius:50%;background:${item.data.color};border:1px solid rgba(255,255,255,0.15);flex-shrink:0;"></div>`;
                        } else if (category === 'skin') {
                            swatch = `<div style="width:18px;height:18px;border-radius:50%;background:${item.data.skinColor};border:1px solid rgba(255,255,255,0.15);flex-shrink:0;"></div>`;
                        } else if (category === 'outfit') {
                            // Two-tone swatch: top color + bottom color
                            swatch = `<div style="width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg, ${item.data.top.color} 50%, ${item.data.bottom.color} 50%);border:1px solid rgba(255,255,255,0.15);flex-shrink:0;"></div>`;
                        } else if (category === 'vocal') {
                            swatch = `<div style="width:18px;height:18px;border-radius:50%;background:${item.data.captionColor};border:1px solid rgba(255,255,255,0.15);flex-shrink:0;opacity:0.7;"></div>`;
                        } else if (category === 'accessory') {
                            const d = GLASS_DRINKS[this.cosmetics.getAccessoryOption(item.id, 'drink')] || GLASS_DRINKS.champagne;
                            swatch = `<div style="width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #fff 0 12%, ${d.liquid} 30%, ${d.liquid2 || d.liquid} 100%);border:1px solid rgba(255,255,255,0.35);box-shadow:inset 0 0 3px rgba(255,255,255,0.6);flex-shrink:0;"></div>`;
                        }

                        html += `<div class="cosmetics-item" data-id="${item.id}" style="background:${bgCol}; border:1px solid ${borderCol}; border-radius:6px; padding:12px; margin-bottom:6px; display:flex; align-items:center; gap:10px; cursor:pointer; transition: border-color 0.2s;">`;
                        html += swatch;
                        html += `<div style="flex:1;">`;
                        html += `<div style="font-family:Orbitron,sans-serif; font-size:0.7rem; color:${equipped ? '#0088ff' : '#ccc'}; letter-spacing:1px;">${item.name}`;
                        if (equipped) html += ` <span style="color:#00ff66;font-size:0.55rem;margin-left:6px;">● ACTIVE</span>`;
                        html += `</div>`;
                        html += `<div style="font-size:0.6rem; color:#777; margin-top:2px;">${item.desc}</div>`;
                        // Drink picker for the glass (owned only)
                        if (category === 'accessory' && owned && item.data.held === 'glass') {
                            const cur = this.cosmetics.getAccessoryOption(item.id, 'drink');
                            html += `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">`;
                            for (const [key, d] of Object.entries(GLASS_DRINKS)) {
                                const on = key === cur;
                                html += `<div class="cosmetics-drink" data-acc="${item.id}" data-drink="${key}" style="display:flex; align-items:center; gap:4px; padding:3px 7px; border-radius:10px; border:1px solid ${on ? 'rgba(0,136,255,0.7)' : 'rgba(255,255,255,0.12)'}; background:${on ? 'rgba(0,136,255,0.15)' : 'rgba(255,255,255,0.03)'}; cursor:pointer;">`;
                                html += `<div style="width:9px;height:9px;border-radius:50%;background:${d.liquid};${d.liquid2 ? `box-shadow:3px 0 0 -1px ${d.liquid2};` : ''}"></div>`;
                                html += `<span style="font-size:0.5rem; color:${on ? '#fff' : '#999'}; letter-spacing:0.5px;">${d.name}</span></div>`;
                            }
                            html += `</div>`;
                        }
                        html += `</div>`;

                        if (!owned) {
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.65rem; color:#ffd700; white-space:nowrap;">${item.price} PP</div>`;
                        } else if (!equipped) {
                            html += `<div style="font-size:0.55rem; color:#0088ff; letter-spacing:1px;">EQUIP</div>`;
                        } else if (category === 'accessory') {
                            html += `<div style="font-size:0.55rem; color:#ff6688; letter-spacing:1px;">REMOVE</div>`;
                        } else {
                            html += `<div style="font-size:0.55rem; color:#555; letter-spacing:1px;">EQUIPPED</div>`;
                        }
                        html += `</div>`;
                    }
                    content.innerHTML = html;

                    // Drink chips: pick the pour (and put the glass in hand)
                    content.querySelectorAll('.cosmetics-drink').forEach(el => {
                        el.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            this.cosmetics.setAccessoryOption(el.dataset.acc, 'drink', el.dataset.drink);
                            this.cosmetics.equip(el.dataset.acc);
                            audioSys.sfx('ui');
                            renderTab(activeTab);
                        });
                    });

                    // Bind click handlers
                    content.querySelectorAll('.cosmetics-item').forEach(el => {
                        el.addEventListener('click', () => {
                            const id = el.dataset.id;
                            const entry = COSMETICS_REGISTRY[id];
                            if (entry && entry.category === 'accessory' && this.cosmetics.equippedAccessory === id) {
                                this.cosmetics.unequipAccessory();   // accessories toggle off
                                audioSys.sfx('ui');
                                renderTab(activeTab);
                            } else if (this.cosmetics.isOwned(id)) {
                                this.cosmetics.equip(id);
                                audioSys.sfx('ui');
                                renderTab(activeTab);
                            } else {
                                if (this.cosmetics.buy(id, this)) {
                                    audioSys.sfx('ui'); // purchase blip
                                    this.cosmetics.equip(id);
                                    document.getElementById('cosmetics-shop-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;
                                    renderTab(activeTab);
                                } else {
                                    showMessage("INSUFFICIENT PERSONICS");
                                }
                            }
                        });
                    });
                };

                // Wire tabs
                tabs.forEach(t => {
                    t.onclick = () => renderTab(t.dataset.tab);
                });

                // Initial render
                renderTab('wig');

                // Close handler
                document.getElementById('cosmetics-shop-close').onclick = () => {
                    overlay.style.display = 'none';
                    this.pauseSystem.release('cosmetics_shop');
                };
            }

            // Render augments management in the sidebar screen
            renderAugmentManagement() {
                const container = document.getElementById('augments-screen-content');
                if (!container) return;
                
                let html = '';
                html += `<div style="font-size: 0.75rem; color: #888; margin-bottom: 10px;">EQUIPPED: ${this.augments.equipped.length} / ${this.augments.maxSlots}</div>`;
                
                if (this.augments.owned.length === 0) {
                    html += '<div style="padding: 30px 15px; text-align: center;">';
                    html += '<div style="font-size: 0.9rem; color: #555; font-style: italic; margin-bottom: 10px;">No augments installed.</div>';
                    html += '<div style="font-size: 0.75rem; color: #00f3ff; opacity: 0.6;">Visit Dr. Yin\'s Clinic to purchase cybernetic augments.</div>';
                    html += '</div>';
                } else {
                    for (const id of this.augments.owned) {
                        const aug = AUGMENT_CATALOG.find(a => a.id === id);
                        if (!aug) continue;
                        const isEq = this.augments.isEquipped(id);
                        const borderCol = isEq ? 'rgba(0,243,255,0.3)' : 'rgba(255,255,255,0.1)';
                        const bgCol = isEq ? 'rgba(0,243,255,0.06)' : 'rgba(255,255,255,0.03)';
                        html += `<div style="background: ${bgCol}; border: 1px solid ${borderCol}; border-radius: 6px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">`;
                        html += `<div style="flex: 1;">`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.75rem; color: ${isEq ? '#00f3ff' : '#ccc'}; margin-bottom: 3px;">${aug.icon} ${aug.name} ${isEq ? '<span style="color:#00ff66;font-size:0.6rem;margin-left:6px;">● ACTIVE</span>' : ''}</div>`;
                        html += `<div style="font-size: 0.65rem; color: #777; line-height: 1.3;">${aug.desc}</div>`;
                        html += `<div style="font-size: 0.6rem; color: #555; margin-top: 3px;">SLOT: ${aug.slot.toUpperCase()}</div>`;
                        html += `</div>`;
                        html += `<button onclick="game.augments.${isEq ? 'unequip' : 'equip'}('${id}'); game.renderAugmentManagement();" style="background: transparent; border: 1px solid ${isEq ? '#ff5555' : '#00f3ff'}; color: ${isEq ? '#ff5555' : '#00f3ff'}; padding: 6px 14px; cursor: pointer; font-size: 0.7rem; font-family: Montserrat, sans-serif; letter-spacing: 1px; flex-shrink: 0; margin-left: 10px;">${isEq ? 'UNEQUIP' : 'EQUIP'}</button>`;
                        html += '</div>';
                    }
                }
                
                // Augment slots visualization at bottom
                html += '<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05);">';
                html += '<div style="font-family: Orbitron, sans-serif; font-size: 0.65rem; color: #555; letter-spacing: 2px; margin-bottom: 8px;">AUGMENT SLOTS</div>';
                html += '<div style="display: flex; gap: 8px;">';
                for (let i = 0; i < this.augments.maxSlots; i++) {
                    const equipped = this.augments.equipped[i];
                    const aug = equipped ? AUGMENT_CATALOG.find(a => a.id === equipped) : null;
                    if (aug) {
                        html += `<div style="width: 80px; height: 80px; border: 1px solid rgba(0,243,255,0.4); border-radius: 6px; background: rgba(0,243,255,0.08); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">`;
                        html += `<div style="font-size: 1.2rem;">${aug.icon}</div>`;
                        html += `<div style="font-size: 0.5rem; color: #00f3ff; margin-top: 2px; line-height: 1.1;">${aug.name}</div>`;
                        html += `</div>`;
                    } else {
                        html += `<div style="width: 80px; height: 80px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; display: flex; align-items: center; justify-content: center;">`;
                        html += `<div style="font-size: 0.6rem; color: #333;">EMPTY</div>`;
                        html += `</div>`;
                    }
                }
                html += '</div></div>';
                
                container.innerHTML = html;
            }

            // Render contacts screen in the sidebar
            renderContactsScreen() {
                const container = document.getElementById('contacts-screen-content');
                if (!container) return;

                // Category determination from role/name
                const getCategory = (name, role) => {
                    if (role === 'medic' || name === 'Dr. Yin') return 'medics';
                    if (['dancer', 'red_demon_dancer'].includes(role)) return 'companions';
                    if (role === 'bartender') return 'associates';
                    if (['Mirabel', 'Anavia', 'Contractor'].includes(name)) return 'clients';
                    if (role === 'teammate') return 'teammates';
                    if (['747', 'Victoria', 'Yenna', 'Sabrina', 'Max', 'Josh'].includes(name)) return 'teammates';
                    if (['Barista Ren', 'Chef Koda', 'LUVSH4D3', 'Torque', 'Prisma', 'Biggs'].includes(name)) return 'associates';
                    if (role && role.includes('robot')) return 'associates';
                    return 'associates';
                };

                // Build NPC role lookup from known NPCs
                const knownRoles = {};
                for (const npc of (this.npcs || [])) { knownRoles[npc.name] = npc.role; }
                for (const tm of (this.teammates || [])) { knownRoles[tm.name] = 'teammate'; }

                const categories = { clients: [], teammates: [], companions: [], associates: [], medics: [] };
                const catLabels = { clients: 'CLIENTS', teammates: 'TEAMMATES', companions: 'COMPANIONS', associates: 'ASSOCIATES', medics: 'MEDICS' };
                const catColors = { clients: '#ffaa00', teammates: '#00f3ff', companions: '#ff55aa', associates: '#aaa', medics: '#00ff88' };

                // Populate from phone message history
                if (typeof phoneSystem !== 'undefined' && phoneSystem.messageHistory) {
                    for (const [name, messages] of Object.entries(phoneSystem.messageHistory)) {
                        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
                        const lastText = lastMsg ? (lastMsg.text || lastMsg) : '';
                        const displayText = typeof lastText === 'string' ? lastText.substring(0, 50) : '';
                        const role = knownRoles[name] || 'civilian';
                        const cat = getCategory(name, role);
                        if (categories[cat]) categories[cat].push({ name, lastMsg: displayText, role });
                    }
                }

                let html = '';
                let totalContacts = 0;

                for (const [cat, contacts] of Object.entries(categories)) {
                    if (contacts.length === 0) continue;
                    totalContacts += contacts.length;
                    const color = catColors[cat];
                    html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.65rem; color: ${color}; letter-spacing: 2px; margin: 15px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">${catLabels[cat]}</div>`;
                    for (const c of contacts) {
                        html += `<div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; padding: 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">`;
                        html += `<div><div style="font-size: 0.8rem; color: #ddd; margin-bottom: 2px;">${c.name}</div>`;
                        if (c.lastMsg) html += `<div style="font-size: 0.65rem; color: #666; font-style: italic;">"${c.lastMsg}"</div>`;
                        html += `</div>`;
                        html += `<div style="font-size: 0.6rem; color: ${color}; opacity: 0.6;">●</div>`;
                        html += `</div>`;
                    }
                }

                if (totalContacts === 0) {
                    html = '<div style="padding: 30px 15px; text-align: center;"><div style="font-size: 0.9rem; color: #555; font-style: italic;">No contacts yet.</div><div style="font-size: 0.75rem; color: #666; margin-top: 8px;">Talk to people to add them to your contacts.</div></div>';
                }

                container.innerHTML = html;
            }

            // =========================================================
            //  TEAM MANAGEMENT SCREEN
            //  ---------------------------------------------------------
            //  Two sections:
            //  1. FREELANCER CREW — permanent teammates (Victoria, etc.)
            //     Shows status, HP, weapon, relationship meter, recruit btn
            //  2. HIRED GUNS — temporary dancers/mercs with time remaining
            //     Shows active hires, dismiss button, empty slot count
            // =========================================================
            renderTeamScreen() {
                const container = document.getElementById('team-screen-content');
                if (!container) return;

                const self = this;
                let html = '';

                // ── SECTION HEADER STYLE ──
                const sectionStyle = `font-family: Orbitron, sans-serif; font-size: 0.65rem; letter-spacing: 3px; margin: 12px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);`;

                // ══════════════════════════════════════════════════
                //  FREELANCER CREW (Permanent Teammates)
                // ══════════════════════════════════════════════════
                html += `<div style="${sectionStyle} color: #00f3ff;">FREELANCER CREW</div>`;

                if (!this.teammates || this.teammates.length === 0) {
                    html += `<div style="padding: 15px; color: #555; font-style: italic; font-size: 0.8rem;">No crew members found.</div>`;
                } else {
                    for (let i = 0; i < this.teammates.length; i++) {
                        const tm = this.teammates[i];
                        const isRecruited = tm.recruited;
                        const hpPercent = Math.max(0, Math.round((tm.hp / tm.maxHp) * 100));
                        const relPercent = Math.max(0, Math.min(100, tm.relationship || 0));
                        const weaponName = tm.equippedWeaponId && ITEM_REGISTRY[tm.equippedWeaponId] 
                            ? ITEM_REGISTRY[tm.equippedWeaponId].name : 'Unarmed';

                        // Relationship rank label
                        let relRank = 'STRANGER';
                        if (relPercent >= 80) relRank = 'BONDED';
                        else if (relPercent >= 60) relRank = 'TRUSTED';
                        else if (relPercent >= 40) relRank = 'FAMILIAR';
                        else if (relPercent >= 20) relRank = 'ACQUAINTANCE';

                        // Appearance color for portrait dot
                        const portraitColor = tm.appearance?.hair?.color || tm.appearance?.top?.color || '#00f3ff';

                        html += `<div style="background: rgba(0,243,255,0.03); border: 1px solid rgba(0,243,255,${isRecruited ? '0.15' : '0.06'}); border-radius: 4px; padding: 12px; margin-bottom: 8px;">`;

                        // Row 1: Name + Status
                        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
                        html += `<div style="display: flex; align-items: center; gap: 8px;">`;
                        html += `<div style="width: 10px; height: 10px; border-radius: 50%; background: ${portraitColor}; box-shadow: 0 0 6px ${portraitColor};"></div>`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.85rem; color: #e0e0e0; letter-spacing: 1px;">${tm.name.toUpperCase()}</div>`;
                        html += `</div>`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.55rem; letter-spacing: 2px; color: ${tm.downed ? '#ff4444' : isRecruited ? '#00ff88' : '#ff6644'}; opacity: 0.9;">${tm.downed ? '✕ DOWNED' : isRecruited ? '● ACTIVE' : '○ STANDBY'}</div>`;
                        html += `</div>`;

                        // Row 2: Bio
                        if (tm.bio) {
                            html += `<div style="font-size: 0.7rem; color: #777; font-style: italic; margin-bottom: 8px; line-height: 1.4;">${tm.bio}</div>`;
                        }

                        // Row 3: HP Bar
                        html += `<div style="margin-bottom: 6px;">`;
                        html += `<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: #888; margin-bottom: 2px;">`;
                        html += `<span>VITALS</span><span>${hpPercent}%</span></div>`;
                        html += `<div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">`;
                        html += `<div style="width: ${hpPercent}%; height: 100%; background: linear-gradient(90deg, #ff4444, #ff6666); border-radius: 2px; transition: width 0.3s;"></div>`;
                        html += `</div></div>`;

                        // Row 4: Relationship Bar
                        const relColor = relPercent >= 60 ? '#d4af37' : relPercent >= 30 ? '#b87333' : '#666';
                        html += `<div style="margin-bottom: 8px;">`;
                        html += `<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: #888; margin-bottom: 2px;">`;
                        html += `<span>BOND — ${relRank}</span><span>${relPercent}/100</span></div>`;
                        html += `<div style="height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">`;
                        html += `<div style="width: ${relPercent}%; height: 100%; background: linear-gradient(90deg, ${relColor}, ${relColor}aa); border-radius: 2px; transition: width 0.3s;"></div>`;
                        html += `</div></div>`;

                        // Row 5: Weapon + Recruit/Dismiss Button
                        html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                        html += `<div style="font-size: 0.65rem; color: #999;">WEAPON: <span style="color: #ccc;">${weaponName}</span></div>`;
                        if (isRecruited) {
                            html += `<button class="team-btn-dismiss-tm" data-index="${i}" style="font-family: Orbitron, sans-serif; font-size: 0.55rem; letter-spacing: 1px; background: rgba(255,68,68,0.1); border: 1px solid rgba(255,68,68,0.3); color: #ff6644; padding: 4px 12px; border-radius: 3px; cursor: pointer;">STAND DOWN</button>`;
                        } else {
                            html += `<button class="team-btn-recruit-tm" data-index="${i}" style="font-family: Orbitron, sans-serif; font-size: 0.55rem; letter-spacing: 1px; background: rgba(0,243,255,0.1); border: 1px solid rgba(0,243,255,0.3); color: #00f3ff; padding: 4px 12px; border-radius: 3px; cursor: pointer;">RECRUIT</button>`;
                        }
                        html += `</div>`;

                        html += `</div>`; // card end
                    }
                }

                // ══════════════════════════════════════════════════
                //  HIRED GUNS (Temporary — Dancers/Mercs)
                // ══════════════════════════════════════════════════
                const maxHires = 5;
                const activeHires = this.hiredDancers || [];

                html += `<div style="${sectionStyle} color: #ff55aa; margin-top: 18px;">HIRED GUNS <span style="font-size: 0.5rem; color: #888; letter-spacing: 1px;">(${activeHires.length}/${maxHires})</span></div>`;

                if (activeHires.length === 0) {
                    html += `<div style="padding: 15px; text-align: center;">`;
                    html += `<div style="font-size: 0.8rem; color: #555; font-style: italic;">No hired guns on payroll.</div>`;
                    html += `<div style="font-size: 0.65rem; color: #666; margin-top: 6px;">Visit the nightclub or VIP lounges to hire dancers as temporary muscle. 400 PP / 8 hours.</div>`;
                    html += `</div>`;
                } else {
                    for (let i = 0; i < activeHires.length; i++) {
                        const d = activeHires[i];
                        const minsLeft = Math.max(0, (d.hireTime || 0) - this.worldMinutes);
                        const hoursLeft = Math.floor(minsLeft / 60);
                        const minsRemainder = minsLeft % 60;
                        const timeStr = `${hoursLeft}h ${minsRemainder}m`;
                        const hpPercent = Math.max(0, Math.round((d.hp / d.maxHp) * 100));
                        const isLowTime = minsLeft < 60;
                        const isDemon = d.role === 'red_demon_dancer';

                        html += `<div style="background: rgba(255,85,170,0.03); border: 1px solid rgba(255,85,170,0.12); border-radius: 4px; padding: 10px; margin-bottom: 6px;">`;

                        // Row 1: Name + Time Remaining
                        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">`;
                        html += `<div style="display: flex; align-items: center; gap: 8px;">`;
                        html += `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${isDemon ? '#ff2244' : '#ff55aa'}; box-shadow: 0 0 5px ${isDemon ? '#ff2244' : '#ff55aa'};"></div>`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.75rem; color: #ddd; letter-spacing: 1px;">${d.name.toUpperCase()}</div>`;
                        html += `</div>`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.55rem; color: ${isLowTime ? '#ff4444' : '#ff55aa'}; letter-spacing: 1px; ${isLowTime ? 'animation: pulse 1s infinite;' : ''}">${timeStr} LEFT</div>`;
                        html += `</div>`;

                        // Row 2: HP Bar + Dismiss
                        html += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">`;
                        html += `<div style="flex: 1;">`;
                        html += `<div style="display: flex; justify-content: space-between; font-size: 0.5rem; color: #888; margin-bottom: 2px;">`;
                        html += `<span>VITALS</span><span>${hpPercent}%</span></div>`;
                        html += `<div style="height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">`;
                        html += `<div style="width: ${hpPercent}%; height: 100%; background: linear-gradient(90deg, #ff55aa, #ff88cc); border-radius: 2px;"></div>`;
                        html += `</div></div>`;
                        html += `<button class="team-btn-dismiss-hire" data-index="${i}" style="font-family: Orbitron, sans-serif; font-size: 0.5rem; letter-spacing: 1px; background: rgba(255,68,68,0.08); border: 1px solid rgba(255,68,68,0.2); color: #ff6644; padding: 3px 10px; border-radius: 3px; cursor: pointer; white-space: nowrap;">DISMISS</button>`;
                        html += `</div>`;

                        html += `</div>`;
                    }

                    // Empty slot indicators
                    const emptySlots = maxHires - activeHires.length;
                    if (emptySlots > 0) {
                        html += `<div style="font-size: 0.6rem; color: #444; text-align: center; margin-top: 6px; letter-spacing: 1px;">${emptySlots} OPEN SLOT${emptySlots > 1 ? 'S' : ''}</div>`;
                    }
                }

                container.innerHTML = html;

                // ── WIRE BUTTONS (double-tap confirmation) ──
                // Helper: first click turns button into red "ARE YOU SURE?", second click executes
                const confirmTap = (btn, onConfirm) => {
                    btn.addEventListener('click', () => {
                        if (btn.dataset.confirm === 'true') {
                            // Second tap — execute
                            onConfirm();
                        } else {
                            // First tap — arm confirmation
                            btn.dataset.confirm = 'true';
                            btn._origText = btn.textContent;
                            btn._origStyle = btn.style.cssText;
                            btn.textContent = 'ARE YOU SURE?';
                            btn.style.background = 'rgba(255,40,40,0.2)';
                            btn.style.borderColor = 'rgba(255,40,40,0.6)';
                            btn.style.color = '#ff4444';
                            // Auto-reset after 2.5 seconds if no second tap
                            btn._resetTimer = setTimeout(() => {
                                btn.dataset.confirm = '';
                                btn.textContent = btn._origText;
                                btn.style.cssText = btn._origStyle;
                            }, 2500);
                        }
                    });
                };

                // Recruit teammate (instant — no confirmation needed)
                container.querySelectorAll('.team-btn-recruit-tm').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.index);
                        const tm = self.teammates[idx];
                        if (tm) {
                            tm.recruited = true;
                            showMessage(`${tm.name.toUpperCase()} RECRUITED.`);
                            self.renderTeamScreen();
                        }
                    });
                });

                // Stand down teammate (double-tap)
                container.querySelectorAll('.team-btn-dismiss-tm').forEach(btn => {
                    confirmTap(btn, () => {
                        const idx = parseInt(btn.dataset.index);
                        const tm = self.teammates[idx];
                        if (tm) {
                            tm.recruited = false;
                            tm.inCar = false;
                            showMessage(`${tm.name.toUpperCase()} STANDING DOWN.`);
                            self.renderTeamScreen();
                        }
                    });
                });

                // Dismiss hired companion (double-tap)
                container.querySelectorAll('.team-btn-dismiss-hire').forEach(btn => {
                    confirmTap(btn, () => {
                        const idx = parseInt(btn.dataset.index);
                        const contracts = self.hiredDancers;
                        const dancer = contracts[idx];
                        if (dancer) {
                            self.dismissCompanion(dancer);
                            showMessage(`${dancer.name.toUpperCase()} DISMISSED.`);
                            self.renderTeamScreen();
                        }
                    });
                });
            }

            // =========================================================
            //  CHARACTER SCREEN
            //  ---------------------------------------------------------
            //  Displays player identity, live stats with buff modifiers,
            //  active buffs with time remaining, and equipped augments.
            // =========================================================
            renderCharacterScreen() {
                const container = document.getElementById('character-screen-content');
                if (!container) return;

                let html = '';
                const sectionStyle = `font-family: Orbitron, sans-serif; font-size: 0.65rem; letter-spacing: 3px; margin: 14px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);`;
                const labelStyle = `font-size: 0.6rem; color: #666; letter-spacing: 1px;`;
                const valueStyle = `font-size: 0.8rem; color: #ddd;`;
                const modStyle = `font-size: 0.65rem; color: #00f3ff; margin-left: 6px;`;

                // ══════════════════════════════════════════════════
                //  IDENTITY
                // ══════════════════════════════════════════════════
                html += `<div style="${sectionStyle} color: #d4af37;">IDENTITY</div>`;
                html += `<div style="background: rgba(212,175,55,0.03); border: 1px solid rgba(212,175,55,0.1); border-radius: 4px; padding: 14px; margin-bottom: 8px;">`;

                // Name row with golden accent
                html += `<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">`;
                html += `<div style="width: 12px; height: 12px; border-radius: 50%; background: #d4af37; box-shadow: 0 0 8px rgba(212,175,55,0.5);"></div>`;
                html += `<div style="font-family: Orbitron, sans-serif; font-size: 1rem; color: #e0d0a0; letter-spacing: 2px;">949</div>`;
                html += `<div style="font-size: 0.6rem; color: #888; letter-spacing: 1px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">STELLA</div>`;
                html += `</div>`;

                // Info grid
                const infoRows = [
                    ['AGE', '24'],
                    ['OCCUPATION', 'FREELANCER'],
                    ['RESIDENCE', 'Silver Queen Apartments, Southern Dimensions City'],
                    ['OUTFIT', this.cosmetics ? (COSMETICS_REGISTRY[this.cosmetics.equippedOutfit]?.name || '—').toUpperCase() : '—'],
                    ['W.I.G', this.cosmetics ? (COSMETICS_REGISTRY[this.cosmetics.equippedWig]?.name || '—').toUpperCase() : '—'],
                    ['S.K.I.N', this.cosmetics ? (COSMETICS_REGISTRY[this.cosmetics.equippedSkin]?.name || '—').toUpperCase() : '—'],
                    ['V.O.C.A.L', this.cosmetics ? (COSMETICS_REGISTRY[this.cosmetics.equippedVocal]?.name || '—').toUpperCase() : '—']
                ];
                for (const [label, val] of infoRows) {
                    html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
                    html += `<span style="${labelStyle} flex-shrink: 0;">${label}</span>`;
                    html += `<span style="font-size: 0.7rem; color: #ccc; text-align: right;">${val}</span>`;
                    html += `</div>`;
                }
                html += `</div>`;

                // ══════════════════════════════════════════════════
                //  STATS
                // ══════════════════════════════════════════════════
                html += `<div style="${sectionStyle} color: #00f3ff;">STATS</div>`;
                html += `<div style="background: rgba(0,243,255,0.02); border: 1px solid rgba(0,243,255,0.08); border-radius: 4px; padding: 14px; margin-bottom: 8px;">`;

                // HP Bar
                const hp = this.playerHealth ?? 0;
                const maxHp = this.maxPlayerHealth ?? 100;
                const hpPct = Math.max(0, Math.round((hp / maxHp) * 100));
                html += `<div style="margin-bottom: 10px;">`;
                html += `<div style="display: flex; justify-content: space-between; ${labelStyle} margin-bottom: 3px;"><span>VITALS</span><span style="color:#ccc;">${hp} / ${maxHp}</span></div>`;
                html += `<div style="height: 5px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">`;
                html += `<div style="width: ${hpPct}%; height: 100%; background: linear-gradient(90deg, #ff4444, #ff6666); border-radius: 2px;"></div>`;
                html += `</div></div>`;

                // Stat rows with buff comparison
                const baseSpeed = this.player?.speed ?? 5.2;
                const finalSpeed = this.player?.buffSystem?.getStat('speed', baseSpeed) ?? baseSpeed;
                const baseFlitDist = 120;
                const finalFlitDist = this.player?.buffSystem?.getStat('flitDistance', baseFlitDist) ?? baseFlitDist;
                const baseFlitCost = this.flitState?.dashCost ?? 40;
                let finalFlitCost = baseFlitCost;
                if (this.augments && this.augments.isEquipped('flit_ext')) finalFlitCost = Math.floor(finalFlitCost * 0.7);
                finalFlitCost = Math.floor(this.player?.buffSystem?.getStat('flitCooldown', finalFlitCost) ?? finalFlitCost);
                const baseDetect = 1.0;
                const finalDetect = this.player?.buffSystem?.getStat('detectionRange', baseDetect) ?? baseDetect;

                const statRow = (label, base, final, unit, lowerIsBetter) => {
                    const modified = Math.abs(final - base) > 0.001;
                    const better = lowerIsBetter ? final < base : final > base;
                    let valHtml = `<span style="${valueStyle}">${typeof final === 'number' ? (final % 1 === 0 ? final : final.toFixed(2)) : final}</span>`;
                    if (modified) {
                        valHtml = `<span style="font-size: 0.7rem; color: #666; text-decoration: line-through;">${typeof base === 'number' ? (base % 1 === 0 ? base : base.toFixed(2)) : base}</span>`;
                        valHtml += `<span style="font-size: 0.15rem;"> </span>`;
                        valHtml += `<span style="font-size: 0.8rem; color: ${better ? '#00ff88' : '#ff6644'}; text-shadow: 0 0 4px ${better ? 'rgba(0,255,136,0.3)' : 'rgba(255,102,68,0.3)'};">${typeof final === 'number' ? (final % 1 === 0 ? final : final.toFixed(2)) : final}</span>`;
                        valHtml += `<span style="${modStyle}">◆</span>`;
                    }
                    if (unit) valHtml += `<span style="font-size: 0.55rem; color: #555; margin-left: 3px;">${unit}</span>`;
                    return `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);"><span style="${labelStyle}">${label}</span><div>${valHtml}</div></div>`;
                };

                html += statRow('SPEED', baseSpeed, finalSpeed, '', false);
                html += statRow('FLIT DISTANCE', baseFlitDist, finalFlitDist, 'px', false);
                html += statRow('FLIT COST', baseFlitCost, finalFlitCost, '/ 120', true);
                html += statRow('DETECTION MULT', baseDetect, finalDetect, '×', true);

                // Weapon
                const weapId = this.inventory?.equippedWeaponId;
                const weapName = weapId && typeof ITEM_REGISTRY !== 'undefined' && ITEM_REGISTRY[weapId] ? ITEM_REGISTRY[weapId].name : 'Unarmed';
                html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
                html += `<span style="${labelStyle}">WEAPON</span><span style="${valueStyle}">${weapName}</span></div>`;

                // Attachment
                const attId = this.inventory?.equippedAttachmentId;
                const attName = attId && typeof ITEM_REGISTRY !== 'undefined' && ITEM_REGISTRY[attId] ? ITEM_REGISTRY[attId].name : 'None';
                html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
                html += `<span style="${labelStyle}">ATTACHMENT</span><span style="${valueStyle}">${attName}</span></div>`;

                // Stims / Currency / Scrap
                html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
                html += `<span style="${labelStyle}">STIMS</span><span style="${valueStyle}">${this.boosterCount ?? 0} / ${this.getEffectiveMaxBoosters?.() ?? 4}</span></div>`;

                html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">`;
                html += `<span style="${labelStyle}">CURRENCY</span><span style="${valueStyle}">${this.currency ?? 0} <span style="font-size:0.55rem;color:#888;">PP</span></span></div>`;

                html += `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0;">`;
                html += `<span style="${labelStyle}">SCRAP</span><span style="${valueStyle}">${this.scrap ?? 0}</span></div>`;

                html += `</div>`;

                // ══════════════════════════════════════════════════
                //  ACTIVE BUFFS
                // ══════════════════════════════════════════════════
                html += `<div style="${sectionStyle} color: #ff55aa;">ACTIVE BUFFS</div>`;

                const bs = this.player?.buffSystem;
                let buffCount = 0;
                if (bs) {
                    for (const buffId in bs.active) {
                        const buff = bs.active[buffId];
                        if (!buff.active) continue;
                        buffCount++;
                        const config = CONSUMABLES[buffId];
                        if (!config) continue;

                        const minsLeft = Math.max(0, buff.endTime - this.worldMinutes);
                        const hoursLeft = Math.floor(minsLeft / 60);
                        const minsRemainder = minsLeft % 60;
                        const timeStr = `${hoursLeft}h ${minsRemainder}m`;
                        const isLow = minsLeft < 30;

                        html += `<div style="background: rgba(255,85,170,0.03); border: 1px solid rgba(255,85,170,0.12); border-radius: 4px; padding: 10px; margin-bottom: 6px;">`;
                        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">`;
                        html += `<span style="font-family: Orbitron, sans-serif; font-size: 0.75rem; color: ${config.uiColor || '#ff55aa'}; letter-spacing: 1px;">${config.name.toUpperCase()}</span>`;
                        html += `<span style="font-family: Orbitron, sans-serif; font-size: 0.55rem; color: ${isLow ? '#ff4444' : '#aaa'}; letter-spacing: 1px;">${timeStr} LEFT</span>`;
                        html += `</div>`;

                        // Modifier list
                        for (const mod of config.modifiers) {
                            const arrow = mod.type === 'multiply' && mod.value > 1 ? '▲' : mod.type === 'multiply' && mod.value < 1 ? '▼' : '●';
                            const color = (mod.type === 'multiply' && mod.value > 1) ? '#00ff88' : '#ff6644';
                            const valStr = mod.type === 'multiply' ? `×${mod.value}` : `+${mod.value}`;
                            html += `<div style="font-size: 0.6rem; color: #888; padding: 1px 0;"><span style="color:${color};">${arrow}</span> ${mod.stat.toUpperCase()} ${valStr}</div>`;
                        }

                        // Shield display if applicable
                        if (buff.shield !== undefined && buff.maxShield) {
                            const shieldPct = Math.round((buff.shield / buff.maxShield) * 100);
                            html += `<div style="margin-top: 4px;">`;
                            html += `<div style="display: flex; justify-content: space-between; font-size: 0.5rem; color: #b89730; margin-bottom: 2px;"><span>SHIELD</span><span>${shieldPct}%</span></div>`;
                            html += `<div style="height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">`;
                            html += `<div style="width: ${shieldPct}%; height: 100%; background: linear-gradient(90deg, #B8860B, #FFD700); border-radius: 2px;"></div>`;
                            html += `</div></div>`;
                        }

                        html += `</div>`;
                    }
                }

                if (buffCount === 0) {
                    html += `<div style="padding: 12px; text-align: center; font-size: 0.75rem; color: #444; font-style: italic;">NO ACTIVE BUFFS</div>`;
                }

                // ══════════════════════════════════════════════════
                //  EQUIPPED AUGMENTS
                // ══════════════════════════════════════════════════
                html += `<div style="${sectionStyle} color: #00f3ff;">AUGMENTS</div>`;

                const eqAugs = this.augments?.equipped || [];
                if (eqAugs.length === 0) {
                    html += `<div style="padding: 12px; text-align: center; font-size: 0.75rem; color: #444; font-style: italic;">NO AUGMENTS EQUIPPED</div>`;
                } else {
                    for (const id of eqAugs) {
                        const aug = typeof AUGMENT_CATALOG !== 'undefined' ? AUGMENT_CATALOG.find(a => a.id === id) : null;
                        if (!aug) continue;
                        html += `<div style="background: rgba(0,243,255,0.03); border: 1px solid rgba(0,243,255,0.1); border-radius: 4px; padding: 8px 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">`;
                        html += `<div><span style="font-size: 0.75rem; color: #00f3ff;">${aug.icon}</span> <span style="font-size: 0.7rem; color: #ccc;">${aug.name}</span></div>`;
                        html += `<span style="font-size: 0.5rem; color: #555; letter-spacing: 1px;">${aug.slot.toUpperCase()}</span>`;
                        html += `</div>`;
                    }
                }

                container.innerHTML = html;
            }

            // ── STORY/MISSIONS SCREEN ──
            renderStoryScreen() {
                const container = document.getElementById('story-screen-content');
                if (!container) return;

                if (!this._storyView) {
                    this._storyView = { tab: 'main', selectedPart: 1, selectedMission: 1 };
                }
                const sv = this._storyView;
                const storyState = this.story ? this.story.state : { part: 1, chapter: 1, mission: 1, step: 0 };

                const sectionStyle = `font-family: Orbitron, sans-serif; font-size: 0.6rem; letter-spacing: 3px; margin: 14px 0 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);`;
                let html = '';

                // ── TAB BAR (MAIN / SIDE) ──
                html += `<div style="display:flex; gap:0; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">`;
                for (const tab of ['main', 'side']) {
                    const active = sv.tab === tab;
                    html += `<div class="story-tab" data-tab="${tab}" style="flex:1; padding:10px 0; text-align:center; font-family:Orbitron,sans-serif; font-size:0.6rem; letter-spacing:3px; color:${active ? '#c8b8d0' : '#444'}; cursor:pointer; border-bottom:${active ? '2px solid #8866aa' : '2px solid transparent'}; transition:color 0.2s;">${tab.toUpperCase()}</div>`;
                }
                html += `</div>`;

                if (sv.tab === 'main') {
                    // ── PART SELECTOR (horizontal pills) ──
                    html += `<div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;">`;
                    for (let p = 1; p <= 4; p++) {
                        const partData = STORY_DB[p];
                        const isActive = sv.selectedPart === p;
                        const hasContent = !!partData;
                        html += `<div class="story-part-btn" data-part="${p}" style="padding:6px 14px; font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:2px; color:${isActive ? '#c8b8d0' : hasContent ? '#666' : '#333'}; cursor:${hasContent ? 'pointer' : 'default'}; background:${isActive ? 'rgba(136,102,170,0.15)' : 'rgba(255,255,255,0.02)'}; border:1px solid ${isActive ? 'rgba(136,102,170,0.3)' : 'rgba(255,255,255,0.05)'}; border-radius:4px; transition:all 0.2s;">PART ${p}</div>`;
                    }
                    html += `</div>`;

                    // ── MISSION CARD ──
                    const partData = STORY_DB[sv.selectedPart];
                    if (partData) {
                        const allMissions = [];
                        for (const chId in partData.chapters) {
                            const ch = partData.chapters[chId];
                            for (const mId in ch.missions) {
                                allMissions.push({ partId: sv.selectedPart, chId: parseInt(chId), mId: parseInt(mId), chapter: ch, mission: ch.missions[mId] });
                            }
                        }

                        const mIdx = Math.max(0, Math.min(sv.selectedMission - 1, allMissions.length - 1));
                        const current = allMissions[mIdx];

                        if (current) {
                            const m = current.mission;
                            const isCurrentMission = sv.selectedPart === storyState.part && current.chId === storyState.chapter && current.mId === storyState.mission;
                            const totalSteps = m.totalSteps || Object.keys(m.steps).length;
                            const currentStep = isCurrentMission ? Math.min(storyState.step, totalSteps) : (sv.selectedPart < storyState.part ? totalSteps : 0);
                            const pct = Math.round((currentStep / totalSteps) * 100);

                            html += `<div style="background:rgba(136,102,170,0.04); border:1px solid rgba(136,102,170,0.15); border-radius:6px; padding:14px; margin-bottom:10px;">`;

                            // Title + status
                            html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">`;
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.75rem; letter-spacing:2px; color:#c8b8d0;">MISSION ${current.mId}</div>`;
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:2px; color:${isCurrentMission ? '#00ff88' : pct >= 100 ? '#8866aa' : '#555'};">${isCurrentMission ? '● ACTIVE' : pct >= 100 ? '✓ COMPLETE' : '○ LOCKED'}</div>`;
                            html += `</div>`;

                            // Mission name
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.85rem; color:#e0d0f0; letter-spacing:1px; margin-bottom:6px;">${m.name}</div>`;

                            // Description
                            if (m.desc) {
                                html += `<div style="font-size:0.7rem; color:#777; font-style:italic; line-height:1.5; margin-bottom:10px;">${m.desc}</div>`;
                            }

                            // Progress bar
                            html += `<div style="margin-bottom:4px;">`;
                            html += `<div style="display:flex; justify-content:space-between; font-size:0.5rem; color:#888; margin-bottom:2px;">`;
                            html += `<span>PROGRESS</span><span>${pct}%</span></div>`;
                            html += `<div style="height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">`;
                            html += `<div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #8866aa, #cc88ff); border-radius:2px; transition:width 0.3s;"></div>`;
                            html += `</div></div>`;

                            html += `</div>`; // End mission card

                            // ── NAV ARROWS ──
                            if (allMissions.length > 1) {
                                html += `<div style="display:flex; justify-content:center; align-items:center; gap:20px; margin-bottom:12px;">`;
                                html += `<div class="story-mission-nav" data-dir="-1" style="font-size:1.2rem; color:${mIdx > 0 ? '#888' : '#333'}; cursor:${mIdx > 0 ? 'pointer' : 'default'};">◀</div>`;
                                html += `<div style="font-family:Orbitron,sans-serif; font-size:0.5rem; color:#555; letter-spacing:2px;">${mIdx + 1} / ${allMissions.length}</div>`;
                                html += `<div class="story-mission-nav" data-dir="1" style="font-size:1.2rem; color:${mIdx < allMissions.length - 1 ? '#888' : '#333'}; cursor:${mIdx < allMissions.length - 1 ? 'pointer' : 'default'};">▶</div>`;
                                html += `</div>`;
                            }

                            // ── INTEL SECTION ──
                            if (m.location || m.target) {
                                html += `<div style="${sectionStyle} color: #8866aa;">INTEL</div>`;
                                html += `<div style="display:flex; gap:10px; flex-wrap:wrap;">`;

                                if (m.location) {
                                    html += `<div style="flex:1; min-width:120px; background:rgba(136,102,170,0.04); border:1px solid rgba(136,102,170,0.1); border-radius:4px; padding:10px;">`;
                                    html += `<div style="font-family:Orbitron,sans-serif; font-size:0.45rem; letter-spacing:2px; color:#666; margin-bottom:4px;">LOCATION</div>`;
                                    html += `<div style="font-size:0.7rem; color:#c8b8d0;">${m.location}</div>`;
                                    if (m.locationDesc) html += `<div style="font-size:0.6rem; color:#555; margin-top:3px;">${m.locationDesc}</div>`;
                                    html += `</div>`;
                                }

                                if (m.target) {
                                    html += `<div style="flex:1; min-width:120px; background:rgba(136,102,170,0.04); border:1px solid rgba(136,102,170,0.1); border-radius:4px; padding:10px;">`;
                                    html += `<div style="font-family:Orbitron,sans-serif; font-size:0.45rem; letter-spacing:2px; color:#666; margin-bottom:4px;">TARGET</div>`;
                                    html += `<div style="font-size:0.7rem; color:#c8b8d0;">${m.target}</div>`;
                                    if (m.completionTime) html += `<div style="font-size:0.6rem; color:#555; margin-top:3px;">EST: ${m.completionTime}</div>`;
                                    html += `</div>`;
                                }

                                html += `</div>`;
                            }

                        } else {
                            html += `<div style="padding:30px 0; text-align:center; font-size:0.7rem; color:#444; font-style:italic;">Content locked.</div>`;
                        }
                    } else {
                        html += `<div style="padding:30px 0; text-align:center; font-size:0.7rem; color:#444; font-style:italic;">This part has not been unlocked yet.</div>`;
                    }

                } else {
                    // ── SIDE TAB ──
                    html += `<div style="${sectionStyle} color: #8866aa;">OPTIONAL CONTENT</div>`;
                    const mission = this.story?.nsm?.getActiveMission(storyState.part, storyState.chapter, storyState.mission);
                    const optionals = mission?.optional || [];
                    if (optionals.length === 0) {
                        html += `<div style="padding:20px 0; text-align:center; font-size:0.7rem; color:#444; font-style:italic;">No side content discovered.</div>`;
                    } else {
                        for (const opt of optionals) {
                            const completed = this.story?.completedOptional?.includes(opt.id);
                            html += `<div style="background:rgba(136,102,170,0.04); border:1px solid rgba(136,102,170,${completed ? '0.08' : '0.15'}); border-radius:4px; padding:12px; margin-bottom:8px;">`;
                            html += `<div style="display:flex; justify-content:space-between; align-items:center;">`;
                            html += `<div style="display:flex; align-items:center; gap:8px;">`;
                            html += `<div style="width:8px; height:8px; border-radius:50%; background:${completed ? '#00ff66' : '#8866aa'}; box-shadow:0 0 6px ${completed ? '#00ff66' : '#8866aa'};"></div>`;
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.7rem; color:#c8b8d0; letter-spacing:1px;">${opt.name}</div>`;
                            html += `</div>`;
                            html += `<div style="font-family:Orbitron,sans-serif; font-size:0.5rem; letter-spacing:2px; color:${completed ? '#00ff66' : '#ffd700'};">${completed ? '✓ DONE' : 'AVAILABLE'}</div>`;
                            html += `</div>`;
                            html += `</div>`;
                        }
                    }
                }

                container.innerHTML = html;

                // ── Bind interactions ──
                container.querySelectorAll('.story-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        sv.tab = tab.dataset.tab;
                        this.renderStoryScreen();
                    });
                });

                container.querySelectorAll('.story-part-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const p = parseInt(btn.dataset.part);
                        if (STORY_DB[p]) {
                            sv.selectedPart = p;
                            sv.selectedMission = 1;
                            this.renderStoryScreen();
                        }
                    });
                });

                container.querySelectorAll('.story-mission-nav').forEach(nav => {
                    nav.addEventListener('click', () => {
                        const dir = parseInt(nav.dataset.dir);
                        sv.selectedMission = Math.max(1, sv.selectedMission + dir);
                        this.renderStoryScreen();
                    });
                });
            }

            // ── COLLECTION SCREEN ──
            renderCollectionScreen() {
                const container = document.getElementById('collection-screen-content');
                if (!container) return;

                let html = '';

                // ── FOUND NOTES section ──
                const sectionStyle = `font-family: Orbitron, sans-serif; font-size: 0.65rem; letter-spacing: 3px; margin: 12px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);`;

                html += `<div style="${sectionStyle} color: #c8b090;">FOUND NOTES</div>`;

                if (!this.foundNotes || this.foundNotes.length === 0) {
                    html += `<div style="padding: 30px 15px; text-align: center;">`;
                    html += `<div style="font-size: 0.85rem; color: #555; font-style: italic; margin-bottom: 8px;">No notes discovered yet.</div>`;
                    html += `<div style="font-size: 0.7rem; color: #666;">Explore the world to find letters, briefings, and lore.</div>`;
                    html += `</div>`;
                } else {
                    // Style colors per note type
                    const styleColors = {
                        letter: { border: 'rgba(180,140,80,0.2)', bg: 'rgba(42,31,20,0.4)', accent: '#c8a870', icon: '📜' },
                        briefing: { border: 'rgba(100,120,180,0.15)', bg: 'rgba(10,10,20,0.4)', accent: '#6688cc', icon: '📋' },
                        ancient: { border: 'rgba(160,80,200,0.15)', bg: 'rgba(26,10,26,0.4)', accent: '#cc88ff', icon: '🔮' },
                        digital: { border: 'rgba(0,200,255,0.12)', bg: 'rgba(4,8,16,0.4)', accent: '#00bbff', icon: '💾' }
                    };

                    for (const noteId of this.foundNotes) {
                        const note = NOTE_REGISTRY[noteId];
                        if (!note) continue;
                        const sc = styleColors[note.style] || styleColors.letter;

                        html += `<div class="collection-note-card" data-note-id="${noteId}" style="background: ${sc.bg}; border: 1px solid ${sc.border}; border-radius: 6px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s; display: flex; align-items: center; gap: 12px;">`;
                        // Icon
                        html += `<div style="font-size: 1.4rem; opacity: 0.7; flex-shrink: 0;">${note.icon || sc.icon}</div>`;
                        // Info
                        html += `<div style="flex: 1; min-width: 0;">`;
                        html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.75rem; color: ${sc.accent}; letter-spacing: 1px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.title}</div>`;
                        html += `<div style="font-size: 0.6rem; color: #777;">by ${note.author || 'Unknown'}</div>`;
                        html += `</div>`;
                        // Read indicator
                        html += `<div class="collection-note-indicator" style="font-size: 0.5rem; color: ${sc.accent}; letter-spacing: 2px; opacity: 0.5; flex-shrink: 0;">READ</div>`;
                        html += `</div>`;
                    }
                    
                    // Inline note viewer slot — populates when a card is tapped, no fullscreen
                    // overlay, no pause-state dance. Lives inside the menu's existing scroll
                    // context so the menu stays usable while reading.
                    html += `<div id="collection-note-inline" style="display:none; margin-top: 8px; margin-bottom: 8px;"></div>`;
                }

                // ── STATS ──
                const totalNotes = Object.keys(NOTE_REGISTRY).length;
                const found = this.foundNotes ? this.foundNotes.length : 0;
                html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); text-align: center;">`;
                html += `<div style="font-family: Orbitron, sans-serif; font-size: 0.55rem; color: #555; letter-spacing: 2px;">DISCOVERED: ${found} / ${totalNotes}</div>`;
                html += `</div>`;

                container.innerHTML = html;

                // Bind note card clicks — toggle inline viewer (NOT the fullscreen overlay).
                // The fullscreen overlay is reserved for first-discovery in the world; once a
                // note is in the collection, re-reading should be seamless and stay in-menu.
                container.querySelectorAll('.collection-note-card').forEach(card => {
                    card.addEventListener('click', () => {
                        this.toggleInlineNote(card.dataset.noteId, card);
                    });
                });
            }

            /**
             * Inline note viewer for the COLLECTION screen.
             * Renders a note's content into the persistent slot below the notes list,
             * styled with the same note-{style} CSS classes as the fullscreen overlay.
             * Toggle: clicking the active card again (or its close button) collapses it.
             * 
             * Does NOT touch this.paused — the menu containing this view is already
             * pausing the game; an inline reveal shouldn't re-enter that state machine.
             */
            toggleInlineNote(noteId, cardEl) {
                const slot = document.getElementById('collection-note-inline');
                if (!slot) return;
                
                const container = document.getElementById('collection-screen-content');
                const allCards = container ? container.querySelectorAll('.collection-note-card') : [];
                
                // Toggle close: same card tapped while open
                if (slot.dataset.activeNote === noteId && slot.style.display !== 'none') {
                    slot.style.display = 'none';
                    slot.innerHTML = '';
                    delete slot.dataset.activeNote;
                    allCards.forEach(c => { c.style.borderColor = ''; });
                    audioSys.sfx('ui');
                    return;
                }
                
                const note = NOTE_REGISTRY[noteId];
                if (!note) return;
                
                // Track discovery (parity with openNote — handles edge case of opening a
                // pre-loaded note that wasn't in foundNotes yet).
                if (!this.foundNotes.includes(noteId)) this.foundNotes.push(noteId);
                
                // Build inline content. Reuses note-{style} classes from the existing
                // overlay so visual identity carries across both viewers.
                const styleClass = `note-${note.style || 'letter'}`;
                let inner = `<div class="${styleClass}" id="collection-note-inline-doc" style="border-radius: 6px; padding: 16px 18px 8px; position: relative;">`;
                
                // Close affordance (top-right). Inline X — small, doesn't compete with
                // the note's typographic header.
                inner += `<div class="collection-note-inline-close" style="position:absolute; top:8px; right:10px; font-size:0.85rem; opacity:0.4; cursor:pointer; padding:4px 8px; line-height:1;">✕</div>`;
                
                // Header (mirrors fullscreen overlay structure but tighter spacing).
                inner += `<div id="note-header" style="text-align:center; padding: 4px 8px 8px;">`;
                if (note.icon) inner += `<div style="font-size:1.4rem; margin-bottom:6px; opacity:0.6;">${note.icon}</div>`;
                if (note.headerDetail) inner += `<div style="font-size:0.5rem; letter-spacing:3px; opacity:0.4; margin-bottom:5px;">${note.headerDetail.toUpperCase()}</div>`;
                inner += `<div style="font-size:0.9rem; letter-spacing:2px; margin-bottom:3px;">${note.title}</div>`;
                if (note.author) inner += `<div style="font-size:0.6rem; opacity:0.5; letter-spacing:1px;">by ${note.author}</div>`;
                inner += `</div>`;
                
                // Body — preserve line breaks, same logic as fullscreen openNote.
                inner += `<div id="note-body" style="padding: 6px 6px 8px; line-height:1.65; font-size:0.85rem;">`;
                inner += note.body.split('\n').map(line => 
                    line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`
                ).join('');
                inner += `</div>`;
                
                // Signature
                if (note.signature) {
                    inner += `<div id="note-signature" style="text-align:right; padding: 0 6px 8px; font-size:0.8rem;">${note.signature}</div>`;
                }
                
                inner += `</div>`;
                
                slot.innerHTML = inner;
                slot.style.display = 'block';
                slot.dataset.activeNote = noteId;
                
                // Active-card highlight (uses same accent the card already shows).
                const styleColors = {
                    letter: '#c8a870', briefing: '#6688cc', ancient: '#cc88ff', digital: '#00bbff'
                };
                const accent = styleColors[note.style] || styleColors.letter;
                allCards.forEach(c => {
                    c.style.borderColor = (c.dataset.noteId === noteId) ? accent : '';
                });
                
                // Wire close button
                const closeBtn = slot.querySelector('.collection-note-inline-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleInlineNote(noteId, cardEl);
                    });
                }
                
                // Scroll the opened note into view smoothly. matchMedia check avoids the
                // jump on browsers that don't support smooth scrolling (older mobile).
                if (slot.scrollIntoView) {
                    try {
                        slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch (e) {
                        slot.scrollIntoView();
                    }
                }
                
                audioSys.sfx('ui');
            }

            // ── NOTE READING SYSTEM ──
            openNote(noteId) {
                const note = NOTE_REGISTRY[noteId];
                if (!note) return;

                this.pauseSystem.acquire('note_overlay');
                
                // Track discovery
                if (!this.foundNotes.includes(noteId)) {
                    this.foundNotes.push(noteId);
                }

                const overlay = document.getElementById('note-overlay');
                const doc = document.getElementById('note-document');
                const header = document.getElementById('note-header');
                const body = document.getElementById('note-body');
                const sig = document.getElementById('note-signature');

                // Apply style class
                doc.className = `note-${note.style || 'letter'}`;

                // Header
                let headerHtml = '';
                if (note.icon) headerHtml += `<div style="font-size:1.8rem; margin-bottom:8px; opacity:0.6;">${note.icon}</div>`;
                if (note.headerDetail) headerHtml += `<div style="font-size:0.5rem; letter-spacing:3px; opacity:0.4; margin-bottom:6px;">${note.headerDetail.toUpperCase()}</div>`;
                headerHtml += `<div style="font-size:1rem; letter-spacing:2px; margin-bottom:4px;">${note.title}</div>`;
                if (note.author) headerHtml += `<div style="font-size:0.6rem; opacity:0.5; letter-spacing:1px;">by ${note.author}</div>`;
                header.innerHTML = headerHtml;

                // Body — preserve line breaks
                body.innerHTML = note.body.split('\n').map(line => 
                    line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`
                ).join('');

                // Signature
                sig.innerHTML = note.signature ? `<span style="font-size:0.85rem;">${note.signature}</span>` : '';

                // Show
                overlay.style.display = 'block';
                doc.scrollTop = 0;

                // Close on click/tap
                const closeHandler = () => {
                    overlay.style.display = 'none';
                    this.pauseSystem.release('note_overlay');
                    overlay.removeEventListener('click', closeHandler);
                    audioSys.sfx('ui');
                };
                // Delay to prevent immediate close from the interaction click
                setTimeout(() => {
                    overlay.addEventListener('click', closeHandler);
                }, 200);

                audioSys.sfx('ui');
            }

            // --- CRAFTING SYSTEM ---
            openCraftingTable() {
                this.pauseSystem.acquire('crafting');
                const shop = document.getElementById('augment-shop');
                // Repurpose augment shop overlay for crafting
                shop.classList.add('active');
                shop.querySelector('.aug-shop-title').textContent = 'CRAFTING WORKBENCH';
                shop.querySelector('.aug-shop-subtitle').textContent = 'APT 949 — MAIN ROOM';
                document.getElementById('aug-shop-balance').textContent = `SCRAP: ${this.scrap}`;

                const grid = document.getElementById('aug-shop-grid');
                grid.innerHTML = '';
                for (const sch of SCHEMATICS) {
                    const owned = this.inventory.items.some(i => i.id === sch.id);
                    const canAfford = this.scrap >= sch.scrapCost;
                    const card = document.createElement('div');
                    card.className = 'aug-card' + (owned ? ' owned' : '');
                    card.innerHTML = `
                        <div class="aug-card-name">${sch.icon || '⊕'} ${sch.name}</div>
                        <div class="aug-card-desc">${sch.desc}</div>
                        ${owned ? '<div class="aug-card-owned">✓ CRAFTED</div>' : `<div class="aug-card-price">${sch.scrapCost} SCRAP${!canAfford ? ' <span style="color:#ff5555;">(INSUFFICIENT)</span>' : ''}</div>`}
                    `;
                    if (!owned && canAfford) {
                        card.addEventListener('click', () => {
                            this.scrap -= sch.scrapCost;
                            const craftedItem = createItemFromRegistry(sch.id, this);
                            if (craftedItem) this.inventory.addItem(craftedItem);
                            this.updateUI();
                            showMessage(`CRAFTED: ${sch.name}`);
                            audioSys.sfx('ui');
                            this.openCraftingTable(); // Refresh
                        });
                    }
                    grid.appendChild(card);
                }

                document.getElementById('aug-shop-close').onclick = () => {
                    shop.classList.remove('active');
                    // Restore titles for augment shop
                    shop.querySelector('.aug-shop-title').textContent = 'CYBERNETIC AUGMENTS';
                    shop.querySelector('.aug-shop-subtitle').textContent = "DR. YIN'S CLINIC";
                    this.pauseSystem.release('crafting');
                };
            }

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
            }
            
            // ========================================
            // MODULAR SAVE/LOAD SYSTEM
            // ========================================
            
            /**
             * SAVE SCHEMA - Defines all saveable properties with default values.
             * When adding new save data, add it here with a sensible default.
             * Old saves will automatically get the default for any missing properties.
             */
            getSaveSchema() {
                return {
                    version: this.getSaveVersion(),
                    timestamp: Date.now(),
                    
                    // --- PLAYER DATA ---
                    player: {
                        x: this.player?.x ?? 500,
                        y: this.player?.y ?? 500,
                        health: this.playerHealth ?? 100,
                        currency: this.currency ?? 500,
                        scrap: this.scrap ?? 0,
                        boosters: this.boosterCount ?? 0,
                        buffs: this.player?.buffSystem?.serialize() ?? {}
                    },
                    
                    // --- WORLD STATE ---
                    world: {
                        mapId: this.activeMap?.id ?? 'hub_949',
                        worldMinutes: this.worldMinutes ?? 480,
                        questState: this.questState ?? {},
                        // Weather is part of world state — reloading shouldn't
                        // reset the sky. Optional field: older saves simply get
                        // the defaults below, so no schema bump is needed.
                        weather: this.weather?.serialize() ?? null
                    },
                    
                    // --- VEHICLE DATA ---
                    car: {
                        x: this.ownedCar?.x ?? 0,
                        y: this.ownedCar?.y ?? 0,
                        angle: this.ownedCar?.angle ?? 0,
                        mapId: this.activeMap?.id ?? 'hub_949',
                        visible: this.ownedCar?.visible ?? true
                    },
                    garage: this.garage?.serialize() ?? null,
                    isDriving: this.isDriving ?? false,
                    
                    // --- NPC DATA ---
                    dancers: [],      // Populated dynamically
                    teammates: [],    // Populated dynamically
                    
                    // --- INVENTORY & EQUIPMENT ---
                    inventory: {
                        items: this.inventory?.items?.map(i => i.id) ?? [],
                        equippedWeaponId: this.inventory?.equippedWeaponId ?? null,
                        equippedAttachmentId: this.inventory?.equippedAttachmentId ?? null,
                        weaponMode: this.weaponMode ?? 'normal'
                    },
                    
                    // --- PHONE DATA ---
                    phone: {
                        messageHistory: (typeof phoneSystem !== 'undefined') ? phoneSystem.messageHistory : {},
                        contactOverrides: (typeof phoneSystem !== 'undefined') ? phoneSystem.contactOverrides : {},
                        unread: (typeof phoneSystem !== 'undefined') ? phoneSystem.unread : {},
                        lastMessageAt: (typeof phoneSystem !== 'undefined') ? phoneSystem.lastMessageAt : {},
                        metNPCs: (typeof phoneSystem !== 'undefined') ? phoneSystem.getMetNPCsList() : []
                    },
                    
                    // --- AUGMENTS ---
                    augments: this.augments ? this.augments.serialize() : { owned: [], equipped: [] },
                    
                    // --- COSMETICS ---
                    cosmetics: this.cosmetics ? this.cosmetics.serialize() : null,
                    
                    // --- STORY ---
                    story: this.story ? this.story.serialize() : null,
                    
                    // --- NOTES ---
                    foundNotes: this.foundNotes || [],
                    
                    // --- MISSIONS ---
                    missions: this.missions ? this.missions.serialize() : { completedCount: 0, missionLog: [] },
                    
                    // --- BONDING ---
                    bonding: this.bonding ? this.bonding.serialize() : null,
                    
                    // --- DIALOGUE TRANSCRIPT ---
                    transcript: this.transcript ? this.transcript.serialize() : null,
                    
                    // --- RESTRICTED ZONE ---
                    restrictedZone: this.restrictedZone ? {
                        clearCount: this.restrictedZone.clearCount || 0
                    } : null,
                    
                    // --- HORDE GAUNTLET ---
                    hordeGauntlet: this.hordeGauntlet ? {
                        highestWave: this.hordeGauntlet.highestWave || 0
                    } : null,
                    
                    // --- SETTINGS ---
                    settings: {
                        trafficDensity: GameSettings.trafficDensity,
                        pedestrianDensity: GameSettings.pedestrianDensity,
                        foliageDensity: GameSettings.foliageDensity,
                        rainDensity: GameSettings.rainDensity,
                        lightingQuality: GameSettings.lightingQuality,
                        filmGrain: GameSettings.filmGrain,
                        softShadows: GameSettings.softShadows,
                        bloom: GameSettings.bloom,
                        wetReflections: GameSettings.wetReflections,
                        atmosphereTint: GameSettings.atmosphereTint,
                        colorGrade: GameSettings.colorGrade,
                        fpsLimit: GameSettings.fpsLimit,
                        audioEnabled: GameSettings.audioEnabled,
                        ambienceVolume: GameSettings.ambienceVolume,
                        fullscreen: GameSettings.fullscreen,
                    },
                };
            }
            
            /**
             * Get default values for loading (separate from current state).
             * These are the fallback values when a save is missing properties.
             * Keep this in sync with getSaveSchema().
             */
            getDefaultSaveValues() {
                return {
                    version: 2,
                    timestamp: 0,
                    player: {
                        x: 500,
                        y: 500,
                        health: 100,
                        currency: 500,
                        scrap: 0,
                        boosters: 0,
                        buffs: {}
                    },
                    world: {
                        mapId: 'hub_949',
                        worldMinutes: 480,
                        questState: {},
                        weather: null
                    },
                    car: {
                        x: 0,
                        y: 0,
                        angle: 0,
                        mapId: 'hub_949',
                        visible: true
                    },
                    garage: null,
                    isDriving: false,
                    dancers: [],
                    teammates: [],
                    inventory: {
                        items: [],  // Empty = use default loadout
                        equippedWeaponId: null,
                        equippedAttachmentId: null,
                        weaponMode: 'normal'
                    },
                    phone: {
                        messageHistory: {},
                        contactOverrides: {},
                        metNPCs: []
                    },
                    augments: { owned: [], equipped: [] },
                    cosmetics: null,        // null = use COSMETICS_REGISTRY defaults
                    story: null,            // null = use STORY_DB step 1 / fresh state
                    foundNotes: [],
                    missions: { completedCount: 0, missionLog: [] },
                    bonding: null,          // null = use BondingSystem fresh state
                    transcript: null,       // null = empty transcript
                    restrictedZone: null,
                    hordeGauntlet: null,
                    settings: null          // null = use GameSettings defaults (or auto-detect)
                };
            }
            
            /**
             * Deep merge saved data with defaults.
             * Saved values take priority; defaults fill in missing properties.
             * Handles dynamic-key objects (like messageHistory) by merging keys from BOTH sources.
             */
            mergeSaveData(defaults, saved) {
                const result = {};
                
                // Get all keys from BOTH defaults and saved to preserve dynamic keys
                const allKeys = new Set([
                    ...Object.keys(defaults),
                    ...(saved ? Object.keys(saved) : [])
                ]);
                
                for (const key of allKeys) {
                    const defaultVal = defaults[key];
                    const savedVal = saved?.[key];
                    
                    if (savedVal !== undefined) {
                        // We have a saved value for this key
                        if (defaultVal !== null && 
                            defaultVal !== undefined &&
                            typeof defaultVal === 'object' && 
                            !Array.isArray(defaultVal) &&
                            typeof savedVal === 'object' &&
                            savedVal !== null &&
                            !Array.isArray(savedVal)) {
                            // Both are objects - recursively merge
                            result[key] = this.mergeSaveData(defaultVal, savedVal);
                        } else {
                            // Use saved value (primitives, arrays, or type mismatch)
                            result[key] = savedVal;
                        }
                    } else if (defaultVal !== undefined) {
                        // No saved value, use default
                        result[key] = defaultVal;
                    }
                }
                
                return result;
            }

            // ────────────────────────────────────────────────────────────────────────
            //  SAVE VERSIONING & MIGRATIONS
            //  Bump getSaveVersion() and register a migration when making a breaking
            //  change to the save shape (renaming a key, restructuring nested data,
            //  etc.). Adding NEW fields with sensible defaults does NOT need a bump
            //  — mergeSaveData() handles missing keys against getDefaultSaveValues().
            // ────────────────────────────────────────────────────────────────────────

            /** Current save schema version. Single source of truth. */
            getSaveVersion() { return 2; }

            /**
             * Migration registry. Each function takes a save at version N and returns
             * the save transformed to version N+1. Pure data — no side effects, no
             * dependence on `this`. mergeSaveData() runs after migrations and fills in
             * any new defaulted fields, so migrations only need to handle structural
             * transformations.
             */
            getSaveMigrations() {
                return {
                    // v1 → v2: No structural changes.
                    // Fields added in v2 (cosmetics, story, bonding, restrictedZone,
                    // hordeGauntlet, foundNotes, phone.metNPCs, settings.bloom /
                    // wetReflections / atmosphereTint / colorGrade, story.activeOptional)
                    // are all additive — mergeSaveData fills them from defaults.
                    1: (save) => save,
                };
            }

            /**
             * Walk a raw save through migrations until it matches the current version,
             * or stop (with a warning) if the path runs out. Returns the migrated save.
             * Bumps `version` after each step so the loop is self-terminating even if
             * a migration forgets to set it.
             */
            migrateSave(rawSave) {
                if (!rawSave || typeof rawSave !== 'object') return rawSave;
                const migrations = this.getSaveMigrations();
                const targetVersion = this.getSaveVersion();
                let save = rawSave;
                let version = save.version || 1;

                while (version < targetVersion && migrations[version]) {
                    console.log(`[MIGRATE] Save v${version} → v${version + 1}`);
                    save = migrations[version](save) || save;
                    version++;
                    save.version = version;
                }

                if (version < targetVersion) {
                    console.warn(`[MIGRATE] No migration registered from v${version} to v${targetVersion}; loading as-is and relying on default-merge`);
                }
                return save;
            }

            // ────────────────────────────────────────────────────────────────────────
            //  SAVE INTEGRITY VALIDATOR
            //  Runs after migrate + merge. Walks reference points (item ids, cosmetic
            //  ids, augment ids, note ids) and drops any that no longer exist in their
            //  registries. Mutates `save` in place for simplicity, returns it for
            //  chaining. Logs every drop so renames / removed registry entries surface
            //  in the console instead of silently corrupting state.
            // ────────────────────────────────────────────────────────────────────────
            validateSaveData(save) {
                if (!save || typeof save !== 'object') return save;
                const warnings = [];

                // --- Inventory items ---
                if (typeof ITEM_REGISTRY !== 'undefined' && save.inventory) {
                    if (Array.isArray(save.inventory.items)) {
                        save.inventory.items = save.inventory.items.filter(id => {
                            if (ITEM_REGISTRY[id]) return true;
                            warnings.push(`inventory: dropped unknown item "${id}"`);
                            return false;
                        });
                    }
                    if (save.inventory.equippedWeaponId && !ITEM_REGISTRY[save.inventory.equippedWeaponId]) {
                        warnings.push(`inventory: cleared unknown equipped weapon "${save.inventory.equippedWeaponId}"`);
                        save.inventory.equippedWeaponId = null;
                    }
                    if (save.inventory.equippedAttachmentId && !ITEM_REGISTRY[save.inventory.equippedAttachmentId]) {
                        warnings.push(`inventory: cleared unknown equipped attachment "${save.inventory.equippedAttachmentId}"`);
                        save.inventory.equippedAttachmentId = null;
                    }
                }

                // --- Cosmetics ---
                if (typeof COSMETICS_REGISTRY !== 'undefined' && save.cosmetics) {
                    if (Array.isArray(save.cosmetics.owned)) {
                        save.cosmetics.owned = save.cosmetics.owned.filter(id => {
                            if (COSMETICS_REGISTRY[id]) return true;
                            warnings.push(`cosmetics: dropped unknown owned "${id}"`);
                            return false;
                        });
                    }
                    for (const slot of ['equippedWig', 'equippedSkin', 'equippedVocal', 'equippedOutfit']) {
                        const id = save.cosmetics[slot];
                        if (id && !COSMETICS_REGISTRY[id]) {
                            warnings.push(`cosmetics: cleared unknown ${slot} "${id}" (CosmeticsSystem will re-grant defaults)`);
                            save.cosmetics[slot] = null;
                        }
                    }
                }

                // --- Augments ---
                if (typeof AUGMENT_CATALOG !== 'undefined' && save.augments) {
                    const validIds = new Set(AUGMENT_CATALOG.map(a => a.id));
                    if (Array.isArray(save.augments.owned)) {
                        save.augments.owned = save.augments.owned.filter(id => {
                            if (validIds.has(id)) return true;
                            warnings.push(`augments: dropped unknown owned "${id}"`);
                            return false;
                        });
                    }
                    if (Array.isArray(save.augments.equipped)) {
                        save.augments.equipped = save.augments.equipped.filter(id => {
                            // Equipped must also be owned (consistency invariant)
                            if (validIds.has(id) && save.augments.owned.includes(id)) return true;
                            warnings.push(`augments: unequipped "${id}" (unknown or not owned)`);
                            return false;
                        });
                    }
                }

                // --- Notes ---
                if (typeof NOTE_REGISTRY !== 'undefined' && Array.isArray(save.foundNotes)) {
                    save.foundNotes = save.foundNotes.filter(id => {
                        if (NOTE_REGISTRY[id]) return true;
                        warnings.push(`notes: dropped unknown found "${id}"`);
                        return false;
                    });
                }

                // --- Teammate equipped weapons ---
                if (typeof ITEM_REGISTRY !== 'undefined' && Array.isArray(save.teammates)) {
                    for (const tm of save.teammates) {
                        if (tm.equippedWeaponId && !ITEM_REGISTRY[tm.equippedWeaponId]) {
                            warnings.push(`teammate "${tm.name}": cleared unknown weapon "${tm.equippedWeaponId}"`);
                            tm.equippedWeaponId = null;
                        }
                    }
                }

                if (warnings.length > 0) {
                    console.warn(`[VALIDATE] Save has ${warnings.length} integrity issue(s) — cleaned:`);
                    warnings.forEach(w => console.warn(`  • ${w}`));
                } else {
                    console.log('[VALIDATE] Save integrity OK');
                }
                return save;
            }

            saveGame() {
                // Build save data from schema (captures current game state)
                const saveData = this.getSaveSchema();
                
                // Serialize all companions (unified — permanent + contract)
                saveData.dancers = []; // Keep empty for backwards compat
                saveData.teammates = this.teammates.map(t => ({ 
                    name: t.name, 
                    recruited: t.recruited,
                    downed: t.downed || false,
                    equippedWeaponId: t.equippedWeaponId || null,
                    hp: t.hp || 100,
                    teammateStims: t.teammateStims ?? 3,
                    relationship: t.relationship ?? 0,
                    hireType: t.hireType || 'none',
                    hireDuration: t.hireDuration || 0,
                    hireTime: t.hireTime || 0,
                    hireCost: t.hireCost || 0,
                    hired: t.hired || false,
                    role: t.role || 'civilian'
                }));
        
                localStorage.setItem(
                    (typeof saveSlotManager !== 'undefined') ? saveSlotManager.getActiveKey() : 'dfab_save_slot_0',
                    JSON.stringify(saveData)
                );
                // Legacy compat key
                localStorage.setItem('dimensions_save_data', JSON.stringify(saveData));
                const slotLabel = (typeof saveSlotManager !== 'undefined') ? ` [SLOT ${saveSlotManager.activeSlot + 1}]` : '';
                showMessage(`GAME SAVED TO DISK.${slotLabel}`);
                audioSys.sfx('ui');
                console.log('[SAVE] Game saved:', saveData);
                if (saveData.phone) {
                    console.log('[SAVE] Phone data:', saveData.phone);
                    console.log('[SAVE] Message history contacts:', Object.keys(saveData.phone.messageHistory || {}));
                }
            }
        
            loadGame() {
                const slotKey = (typeof saveSlotManager !== 'undefined') ? saveSlotManager.getActiveKey() : 'dfab_save_slot_0';
                let json = localStorage.getItem(slotKey);
                // Fallback to legacy key
                if (!json) json = localStorage.getItem('dimensions_save_data');
                if (!json) {
                    showMessage("NO SAVE FILE FOUND.");
                    audioSys.sfx('ui');
                    return false;
                }
        
                try {
                    const rawSave = JSON.parse(json);
                    const fromVersion = rawSave.version || 1;

                    // Run version migrations first, then merge with defaults, then validate refs
                    const migrated = this.migrateSave(rawSave);
                    const defaults = this.getDefaultSaveValues();
                    const merged = this.mergeSaveData(defaults, migrated);
                    const save = this.validateSaveData(merged);
                    
                    // Handle legacy saves (v1 format without nested structure)
                    const playerData = save.player || save;
                    const worldData = save.world || save;
                    const carData = save.car || rawSave.car || defaults.car;
                    
                    console.log(`[LOAD] Loading save (v${fromVersion} → v${save.version}), merged with defaults`);
        
                    // 1. Load Player Data
                    this.currency = playerData.currency ?? defaults.player.currency;
                    this.scrap = playerData.scrap ?? defaults.player.scrap;
                    this.playerHealth = playerData.health ?? defaults.player.health;
                    this.boosterCount = playerData.boosters ?? defaults.player.boosters;
                    
                    // Restore buff system from save data
                    this.player.buffSystem.deserialize(playerData.buffs || {});
                    
                    // Re-apply persistent buff side-effects (e.g. Stellar Lemonade halved maxHP)
                    const slBuff = this.player.buffSystem.active.stellarLemonade;
                    if (slBuff && slBuff.active && slBuff.savedMaxHp > 0) {
                        this.maxPlayerHealth = Math.floor(slBuff.savedMaxHp / 2);
                    }
                    
                    this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);
                    
                    // 2. Load World State
                    this.worldMinutes = worldData.worldMinutes ?? defaults.world.worldMinutes;
                    this.questState = worldData.questState ?? defaults.world.questState;
                    
                    // Restore the sky. Applied BEFORE loadMap so the map's own
                    // climate tag still gets the final say on the odds table,
                    // while the saved condition and its deadline carry over.
                    if (worldData.weather) this.weather.deserialize(worldData.weather);
                    
                    // 3. Load Map & Player Position
                    const mapId = worldData.mapId ?? rawSave.mapId ?? defaults.world.mapId;
                    const playerX = playerData.x ?? rawSave.player?.x ?? defaults.player.x;
                    const playerY = playerData.y ?? rawSave.player?.y ?? defaults.player.y;
                    this.loadMap(mapId, { x: playerX, y: playerY });
        
                    // 4. Restore Teammates (unified — permanent + contract)
                    const savedTeammates = save.teammates || rawSave.teammates || [];
                    
                    // First, clear any existing contract companions
                    for (let i = this.teammates.length - 1; i >= 0; i--) {
                        if (this.teammates[i].hireType === 'contract') this.teammates.splice(i, 1);
                    }
                    
                    savedTeammates.forEach(savedTm => {
                        if (savedTm.hireType === 'contract' && savedTm.hired) {
                            // Restore contract companion (dancer)
                            const role = savedTm.role || (['Scarlet', 'Ruby', 'Crimson'].includes(savedTm.name) 
                                ? 'red_demon_dancer' : 'dancer');
                            let npc = this.npcs.find(n => n.name === savedTm.name);
                            if (!npc) {
                                npc = new NPC(this.player.x, this.player.y, savedTm.name, role);
                            }
                            npc.hired = true;
                            npc.hireType = 'contract';
                            npc.hireDuration = savedTm.hireDuration || CONFIG.COMPANION.DEFAULT_HIRE_DURATION;
                            npc.hireTime = savedTm.hireTime || 0;
                            npc.hireCost = savedTm.hireCost || CONFIG.COMPANION.DEFAULT_HIRE_COST;
                            npc.alliance = 'friendly';
                            npc.recruited = true;
                            if (!this.teammates.includes(npc)) this.teammates.push(npc);
                            const npcIdx = this.npcs.indexOf(npc);
                            if (npcIdx > -1) this.npcs.splice(npcIdx, 1);
                        } else {
                            // Restore permanent teammate
                            const tm = this.teammates.find(t => t.name === savedTm.name);
                            if (tm) {
                                tm.recruited = savedTm.recruited;
                                if (savedTm.equippedWeaponId && ITEM_REGISTRY[savedTm.equippedWeaponId]) {
                                    tm.equippedWeaponId = savedTm.equippedWeaponId;
                                }
                                if (savedTm.hp !== undefined) tm.hp = Math.min(savedTm.hp, tm.maxHp);
                                if (savedTm.teammateStims !== undefined) tm.teammateStims = savedTm.teammateStims;
                                if (savedTm.relationship !== undefined) tm.relationship = savedTm.relationship;
                                // Restore downed state
                                if (savedTm.downed) {
                                    tm.downed = true;
                                    tm.dead = true;
                                    tm.active = false;
                                    tm.visible = false;
                                    tm.hp = 0;
                                }
                            }
                        }
                    });
                    
                    // Backwards compat: old saves have separate dancers array
                    const oldDancers = save.dancers || rawSave.dancers || [];
                    oldDancers.forEach(savedDancer => {
                        // Skip if already restored via unified teammates
                        if (this.teammates.some(t => t.name === savedDancer.name && t.hireType === 'contract')) return;
                        const role = ['Scarlet', 'Ruby', 'Crimson'].includes(savedDancer.name) 
                            ? 'red_demon_dancer' : 'dancer';
                        let npc = this.npcs.find(n => n.name === savedDancer.name);
                        if (!npc) {
                            npc = new NPC(this.player.x, this.player.y, savedDancer.name, role);
                        }
                        npc.hired = true;
                        npc.hireType = 'contract';
                        npc.hireDuration = CONFIG.COMPANION.DEFAULT_HIRE_DURATION;
                        npc.hireTime = savedDancer.hireTime || 0;
                        npc.alliance = 'friendly';
                        npc.recruited = true;
                        if (!this.teammates.includes(npc)) this.teammates.push(npc);
                        const npcIdx = this.npcs.indexOf(npc);
                        if (npcIdx > -1) this.npcs.splice(npcIdx, 1);
                    });
        
                    // 6. Restore Garage & Car
                    if (save.garage) {
                        this.garage.deserialize(save.garage);
                        const activeCarData = this.garage.getActive();
                        // Rebuild ownedCar if saved car differs from default
                        if (activeCarData.brand !== this.ownedCar.brand || activeCarData.model !== this.ownedCar.model) {
                            this.ownedCar = new TrafficVehicle(null, activeCarData.brand, activeCarData.model, 'PLAYER');
                            this.ownedCar.isOwnedCar = true;
                            this.car = this.ownedCar;
                        }
                    }
                    // Apply garage customization colors
                    this.garage.applyToVehicle(this.ownedCar);
                    
                    this.ownedCar.x = carData.x ?? defaults.car.x;
                    this.ownedCar.y = carData.y ?? defaults.car.y;
                    this.ownedCar.angle = carData.angle ?? defaults.car.angle;
                    
                    const carMapId = carData.mapId ?? rawSave.car?.mapId ?? defaults.car.mapId;
                    if (carMapId === this.activeMap.id && this.activeMap.type !== 'indoor') {
                        this.ownedCar.visible = true;
                    } else {
                        this.ownedCar.visible = false;
                    }
        
                    // 7. Restore Driving State
                    const wasDriving = save.isDriving ?? rawSave.isDriving ?? false;
                    if (wasDriving) {
                        this.car = this.ownedCar;
                        this.toggleVehicle();
                    }
        
                    // 8. Restore Inventory & Equipped Weapon
                    const invData = save.inventory || rawSave.inventory || defaults.inventory;
                    if (invData && this.inventory) {
                        // Restore weapon mode
                        this.weaponMode = invData.weaponMode ?? 'normal';
                        
                        // Rebuild inventory from saved item IDs (if save has items)
                        if (invData.items && invData.items.length > 0) {
                            this.inventory.loadItemsFromIds(invData.items);
                            console.log(`[LOAD] Rebuilt inventory: ${invData.items.length} items (${invData.items.join(', ')})`);
                        }
                        // If save had empty items array, keep the default loadout from constructor
                        
                        // Restore equipped weapon (with legacy equippedId fallback)
                        const wId = invData.equippedWeaponId || invData.equippedId || null;
                        if (wId) {
                            const equippedItem = this.inventory.items.find(i => i.id === wId);
                            if (equippedItem) {
                                this.inventory.equippedWeaponId = wId;
                                this.currentWeapon = equippedItem;
                                if (equippedItem.action) equippedItem.action(equippedItem);
                                console.log(`[LOAD] Equipped weapon: ${equippedItem.name}`);
                            }
                        }
                        
                        // Restore equipped attachment
                        if (invData.equippedAttachmentId) {
                            const attachItem = this.inventory.items.find(i => i.id === invData.equippedAttachmentId);
                            if (attachItem) {
                                this.inventory.equippedAttachmentId = invData.equippedAttachmentId;
                                console.log(`[LOAD] Equipped attachment: ${attachItem.name}`);
                            }
                        }
                        
                        this.inventory.render();
                    }

                    // 9. Restore Phone Data (Message History)
                    const phoneData = save.phone || rawSave.phone || defaults.phone;
                    if (typeof phoneSystem !== 'undefined') {
                        // Restore message history (merge with existing to avoid losing data)
                        if (phoneData && phoneData.messageHistory && Object.keys(phoneData.messageHistory).length > 0) {
                            phoneSystem.messageHistory = phoneData.messageHistory;
                            console.log(`[LOAD] Restored message history for ${Object.keys(phoneData.messageHistory).length} contacts:`, phoneData.messageHistory);
                        } else {
                            console.log('[LOAD] No message history in save file');
                        }
                        // Restore active contact overrides (current unread messages)
                        if (phoneData && phoneData.contactOverrides && Object.keys(phoneData.contactOverrides).length > 0) {
                            phoneSystem.contactOverrides = phoneData.contactOverrides;
                            console.log(`[LOAD] Restored contact overrides:`, phoneData.contactOverrides);
                        }
                        // Restore unread counts. Saves written before the ledger
                        // existed have no `unread` key — rebuild one entry per
                        // override so old saves still show a correct badge.
                        if (phoneData && phoneData.unread) {
                            phoneSystem.unread = phoneData.unread;
                        } else if (phoneData && phoneData.contactOverrides) {
                            phoneSystem.unread = {};
                            for (const name in phoneData.contactOverrides) phoneSystem.unread[name] = 1;
                        }
                        if (phoneData && phoneData.lastMessageAt) phoneSystem.lastMessageAt = phoneData.lastMessageAt;
                        phoneSystem.refreshNotifications();
                        // Restore met NPCs list
                        if (phoneData && phoneData.metNPCs) {
                            phoneSystem.restoreMetNPCs(phoneData.metNPCs);
                            console.log(`[LOAD] Restored ${phoneSystem.metNPCs.size} met NPCs`);
                        }
                        // Ensure Freelancer crew always present
                        phoneSystem.seedDefaultContacts();
                    } else {
                        console.warn('[LOAD] phoneSystem not defined, skipping phone data restore');
                    }

                    // 10. Restore Augments
                    if (this.augments && save.augments) {
                        this.augments.deserialize(save.augments);
                        console.log(`[LOAD] Restored ${this.augments.owned.length} augments`);
                    }

                    // 10b. Restore Cosmetics
                    if (this.cosmetics && save.cosmetics) {
                        this.cosmetics.deserialize(save.cosmetics);
                        console.log(`[LOAD] Restored ${this.cosmetics.owned.length} cosmetics`);
                    }

                    // 10c. Restore Story Progress
                    if (this.story && save.story) {
                        this.story.deserialize(save.story);
                        console.log(`[LOAD] Restored story at step ${this.story.state.step}, ${this.story.completedOptional.length} optional quests completed`);
                    }

                    // 10d. Restore Found Notes
                    if (save.foundNotes) {
                        this.foundNotes = save.foundNotes;
                        console.log(`[LOAD] Restored ${this.foundNotes.length} found notes`);
                    }

                    // 11. Restore Missions
                    if (this.missions && save.missions) {
                        this.missions.deserialize(save.missions);
                        console.log(`[LOAD] Restored mission data (${this.missions.completedCount} completed)`);
                    }

                    // 11b. Restore Bonding
                    if (this.bonding && save.bonding) {
                        this.bonding.deserialize(save.bonding);
                        console.log(`[LOAD] Restored bonding data`);
                    }

                    // 11b2. Restore Dialogue Transcript
                    if (this.transcript && save.transcript) {
                        this.transcript.deserialize(save.transcript);
                        console.log(`[LOAD] Restored transcript (${this.transcript.entries.length} entries)`);
                    }

                    // 11c. Restore Restricted Zone
                    if (this.restrictedZone && save.restrictedZone) {
                        this.restrictedZone.clearCount = save.restrictedZone.clearCount || 0;
                        console.log(`[LOAD] Restored restricted zone clearCount: ${this.restrictedZone.clearCount}`);
                    }

                    // 11d. Restore Horde Gauntlet
                    if (this.hordeGauntlet && save.hordeGauntlet) {
                        this.hordeGauntlet.highestWave = save.hordeGauntlet.highestWave || 0;
                        console.log(`[LOAD] Restored horde gauntlet highestWave: ${this.hordeGauntlet.highestWave}`);
                    }

                    // 12. Restore Settings
                    if (save.settings) {
                        GameSettings.trafficDensity = save.settings.trafficDensity || 'high';
                        GameSettings.pedestrianDensity = save.settings.pedestrianDensity || 'high';
                        GameSettings.foliageDensity = save.settings.foliageDensity || 'high';
                        GameSettings.rainDensity = save.settings.rainDensity || 'high';
                        GameSettings.lightingQuality = save.settings.lightingQuality || 'high';
                        GameSettings.filmGrain = save.settings.filmGrain !== false;
                        GameSettings.softShadows = save.settings.softShadows || false;
                        GameSettings.bloom = save.settings.bloom !== false;
                        GameSettings.wetReflections = save.settings.wetReflections !== false;
                        GameSettings.atmosphereTint = save.settings.atmosphereTint ?? '';
                        GameSettings.colorGrade = save.settings.colorGrade || 'none';
                        GameSettings.fpsLimit = save.settings.fpsLimit || 0;
                        GameSettings.audioEnabled = save.settings.audioEnabled !== false;
                        if (typeof save.settings.ambienceVolume === 'number') GameSettings.ambienceVolume = Math.max(0, Math.min(1, save.settings.ambienceVolume));
                        if (typeof syncAmbienceSliders === 'function') syncAmbienceSliders();
                        // Apply lighting scale
                        this.lightingScale = GameSettings.lightingQuality === 'low' ? 0.5 : GameSettings.lightingQuality === 'medium' ? 0.75 : 1.0;
                        GameSettings.applyFilmGrain();
                        audioSys.setEnabled(GameSettings.audioEnabled);
                        this.resize();
                        console.log(`[LOAD] Restored settings (lighting: ${GameSettings.lightingQuality}, bloom: ${GameSettings.bloom}, wet: ${GameSettings.wetReflections}, tint: ${GameSettings.atmosphereTint || 'off'}, grade: ${GameSettings.colorGrade}, audio: ${GameSettings.audioEnabled ? 'on' : 'off'})`);
                    }

                    // Update UI
                    this.updateUI();
                    
                    showMessage("GAME LOADED SUCCESSFULLY.");
                    console.log('[LOAD] Game loaded successfully');
                    return true;
        
                } catch (e) {
                    console.error('[LOAD] Error loading save:', e);
                    showMessage("ERROR LOADING SAVE FILE.");
                    return false;
                }
            }

            loadMap(mapId, spawnAt) {
                // 1. Initial Load (No Fade)
                if (!this.activeMap) {
                    this._doLoadMap(mapId, spawnAt);
                    this.bakeStaticLighting(); // <--- ADDED: Bake immediately on first load
                    return;
                }
                
                this.lightingBaked = false;
                
                // 2. Start Fade Out
                const fadeOverlay = document.getElementById('fade-overlay');
                fadeOverlay.classList.add('active');
                
                // Pause game
                this.pauseSystem.acquire('map_load');
                
                // 3. Wait for Screen to go Black (400ms)
                setTimeout(() => {
                    // A. Switch the Map Data
                    this._doLoadMap(mapId, spawnAt);
                    
                    // B. Bake Lighting for the NEW Map
                    // Now that activeMap is updated, this will calculate the correct lines
                    this.bakeStaticLighting(); 
                    
                    // C. Fade Back In
                    setTimeout(() => {
                        fadeOverlay.classList.remove('active');
                        this.pauseSystem.release('map_load');
                    }, 100);
                }, 400);
            }
            
            _doLoadMap(mapId, spawnAt) {
                // =========================================================
                //  PHASE 1: CLEANUP
                // =========================================================
                CollisionSystem.clearSpatialGrid();
                
                if (this._staticWallEntities) {
                    for (let entity of this._staticWallEntities) {
                        entity.active = false; entity.markedForDestroy = true; entity._finalDestroy();
                    }
                }
                this._staticWallEntities = [];
                if (this._staticBuildingEntities) {
                    for (let entity of this._staticBuildingEntities) {
                        entity.active = false; entity.markedForDestroy = true; entity._finalDestroy();
                    }
                }
                this._staticBuildingEntities = [];
                
                for (let proj of this.projectiles) {
                    if (proj instanceof GameEntity) { proj.active = false; proj.markedForDestroy = true; }
                }
                this.projectiles = [];
                this.stickyOrbs = [];
                
                GameEntity.queueEnabled = true;
                GameEntity.clearQueue();
                GameEntity.clearAll();
                
                this.neonSigns = [];
                
                if (this.activeMap && (this.activeMap.id === 'hub_949' || this.activeMap.id === 'road_test')) { 
                    this.hubState.carX = this.car.x; this.hubState.carY = this.car.y; this.hubState.carAngle = this.car.angle; 
                }
                
                if (mapId !== 'hub_949' && mapId !== 'road_test') {
                    this.traffic.reset();
                    this.pedestrians.reset();
                }
                
                // Clear landmark registry for fresh map
                this.landmarkRegistry = {};
                this.dropOffRegistry = {};
                
                // Clear all particles on map transition
                if (this.weather) {
                    this.weather.particles = [];
                }

                // =========================================================
                //  PHASE 2: DEFINE ASSETS & MAPS
                // =========================================================
                
                // --- HUB ASSETS (lazy: only create for hub map) ---
                // --- BUILD MAP FROM DATA LAYER ---
                const entities = createMapEntities(mapId);
                const maps = {};
                for (const id in MAP_DATA) {
                    if (id === mapId) {
                        maps[id] = { ...MAP_DATA[id], ...entities };
                    } else {
                        maps[id] = { ...MAP_DATA[id], props: [], npcs: [], lamps: [] };
                    }
                }

                // =========================================================
                //  PHASE 3: PROCEDURAL GENERATION & AUTOMATION
                // =========================================================
                
                // --- HUB 949 (CITYLAYOUT V2) ---
                if (mapId === 'hub_949') {
                    const mapData = maps['hub_949'];
                    
                    if (this._hubCache) {
                        // =============================================================
                        //  FAST PATH: Restore from cache (skips all procedural generation)
                        // =============================================================
                        const c = this._hubCache;
                        
                        // Restore non-GameEntity data directly
                        mapData.buildings = c.buildings;
                        mapData.buildingColliders = c.buildingColliders;
                        mapData.cityLayout = c.cityLayout;
                        mapData.ferrisWheel = c.ferrisWheel;
                        mapData.pavements = c.pavements.map(p => new Pavement(p.x, p.y, p.w, p.h));
                        mapData.crosswalks = [...c.crosswalks];
                        mapData.foliage = [...c.foliage];
                        mapData.walls = c.wallRects.map(w => ({...w}));
                        
                        // Restore road network + pedestrian sidewalk network
                        this.traffic.network = c.network;
                        this.pedestrians.setNetwork(c.sidewalkNetwork);
                        
                        // Recreate street/intersection LampEntity instances (GameEntities must be fresh)
                        mapData.lamps = c.lampConfigs.map(cfg => new LampEntity(cfg));
                        
                        // Regenerate building lights (old instances were destroyed by GameEntity.clearAll)
                        // Phase 4 will harvest these into mapData.lamps
                        mapData.buildings.forEach(b => {
                            if (b.regenerateLights) b.regenerateLights();
                        });
                        
                        // Flag so Phase 4 skips sign harvest (already handled below) but still harvests lights
                        this._hubCacheSkipSigns = true;
                        
                        // Recreate graveyard PropEntity instances
                        c.gravestoneConfigs.forEach(cfg => mapData.props.push(new PropEntity(cfg)));
                        
                        // Neon signs from cached buildings (NeonSign is NOT a GameEntity)
                        this.neonSigns = [];
                        mapData.buildings.forEach(b => {
                            if (b.attachedSign) this.neonSigns.push(b.attachedSign);
                        });
                        
                        // Restore landmarks
                        this.landmarkRegistry = {...c.landmarks};
                        this.dropOffRegistry = {...(c.dropOffs || {})};
                        
                        // Process queued GameEntities
                        GameEntity.processQueue();
                        
                        console.log('[HUB CACHE] Restored from cache — skipped procedural generation');
                        
                    } else {
                    // =============================================================
                    //  SLOW PATH: First-time procedural generation (cached after)
                    // =============================================================
                    
                    // Track original prop count so we can extract graveyard stones for cache later
                    this._hubCache_hubPropCount = mapData.props.length;
                    
                    // 1. CREATE CITY LAYOUT
                    const city = new CityLayout({
                        width: 4000,
                        height: 8500,
                        margin: 25
                    });
                    
                    // 2. DEFINE ROAD GRID
                    // Horizontal roads (Y = center position)
                    // First road pushed south to accommodate larger Silver Queen Apartments
                    city.addHorizontalRoad(1200, 'Hotel Dr.', 2);
                    city.addHorizontalRoad(2500, 'Crimson Blvd', 3);     // Main artery
                    city.addHorizontalRoad(3800, 'Commerce Blvd', 2);
                    city.addHorizontalRoad(4900, 'Skyline Ave', 2);
                    city.addHorizontalRoad(6100, 'Clinic Way', 2);
                    city.addHorizontalRoad(7400, 'Gridlock Ln', 3);
                    
                    // Vertical highways
                    city.addVerticalRoad(1200, 'West Ave', 2);
                    city.addVerticalRoad(2800, 'East Ave', 2);
                    
                    // 3. GENERATE BLOCKS (must be done before placing buildings)
                    city.generateBlocks();
                    
                    // Debug: Log blocks to console
                    console.log('CityLayout Blocks:', city.listBlocks());
                    
                    // 4. REGISTER BUILDING TEMPLATES
                    // V2 buildings are auto-registered from BuildingV2Registry
                    city.registerV2Buildings();
                    
                    // Register V1 templates and override V2 landmarkIds where needed
                    city.registerTemplates({
                        // V2 buildings: just specify landmarkId (dimensions come from registry)
                        silver_queen: { landmarkId: 'parking_spot' },
                        enni_cole: { landmarkId: 'enni_cole' },
                        double_nights: { landmarkId: 'hotel_entrance' },
                        cozy_cafe: { landmarkId: 'cozy_cafe' },
                        
                        // V2 buildings (auto-detected from BuildingV2Registry)
                        moon_city: {
                            landmarkId: 'club_entrance',
                            door: { target: 'moon_city_nightclub', label: 'Enter Club', lightColor: '#ff00aa' }
                        },
                        neural_sys: {
                            landmarkId: 'neural_systems',
                            door: { target: 'neural_sys_interior', label: 'Enter Neural Systems', lightColor: '#0088ff' }
                        },
                        torque_auto: { landmarkId: 'torque_auto' },
                        cozy_cafe: { landmarkId: 'cozy_cafe' },
                        biggs_park: { landmarkId: 'biggs_park' },
                        dr_yins: {
                            landmarkId: 'clinic',
                            door: { target: 'medbay_sw', label: 'Enter Clinic', lightColor: '#00f3ff' }
                        },
                        // Generic V2 templates for auto-fill (detected from BuildingV2Registry)
                        apartment_small: {
                            weight: 3
                        },
                        shop_small: {
                            weight: 3
                        },
                        warehouse: {
                            weight: 2
                        }
                    });
                    
                    // 5. PLACE KEY BUILDINGS
                    // Block naming: block_[row]_[col]
                    // Rows: 0, 2, 4, 6, 8, 10 (even numbers - odd rows are road zones)
                    // Cols: 0, 2, 4 (even numbers - odd cols are road zones)
                    // Col 0 = west side, Col 2 = center, Col 4 = east side
                    
                    city.placeBuilding('silver_queen', 'block_0_0', { align: 'center' });   // Silver Queen Apartments - NW
                    city.placeBuilding('double_nights', 'block_0_2', { align: 'center' });  // Double Nights Hotel - N center
                    city.placeBuilding('moon_city', 'block_2_2', { align: 'center' });      // Moon City Nightclub - center
                    city.placeBuilding('enni_cole', 'block_2_4', { align: 'center' });      // Enni Cole - E side
                    city.placeBuilding('cozy_cafe', 'block_4_0', { align: 'center' });      // Cozy Cafe - W side
                    city.placeBuilding('dr_yins', 'block_4_4', { align: 'center' });        // Dr. Yin's Clinic - E side
                    city.placeBuilding('neural_sys', 'block_6_2', { align: 'center' });     // Neural Systems - S center
                    city.placeBuilding('torque_auto', 'block_2_0', { align: 'center' });   // Torque Auto - W center
                    city.placeBuilding('biggs_park', 'block_4_2', { align: 'center' });    // Biggs Amusement Park - center
                    
                    // 5b. SET CUSTOM LAMP COLORS FOR V1 BUILDINGS
                    // V2 buildings auto-set their block lamp colors from accent color
                    city.setBlockLampColors({
                        'block_2_2': '#ff00aa',    // Moon City Nightclub - hot pink
                        'block_4_4': '#00f3ff',    // Dr. Yin's Clinic - medical cyan
                        'block_6_2': '#0088ff',    // Neural Systems - tech blue
                        'block_4_2': '#ff8800'     // Biggs Amusement Park - carnival amber
                    });
                    
                    // 5b. RESERVE SCRIPTED NPC ANCHORS
                    // Must happen BEFORE autoFillAll — _findValidPosition rejects any
                    // candidate rect that intersects a safe zone, so reserving here is
                    // what stops a filler building spawning on Mirabel or Anavia.
                    for (const a of HUB_NPC_ANCHORS) {
                        city._addSafeZone(
                            a.x - HUB_NPC_CLEARANCE, a.y - HUB_NPC_CLEARANCE,
                            HUB_NPC_CLEARANCE * 2, HUB_NPC_CLEARANCE * 2,
                            `NPC: ${a.name}`
                        );
                    }

                    // 6. AUTO-FILL REMAINING BLOCKS
                    city.autoFillAll({
                        density: 0.4,
                        categories: ['residential', 'shopping', 'commercial']
                    });
                    
                    // 7. CREATE ROAD NETWORK
                    resetRoadNetworkIds();
                    this.traffic.network = new RoadNetwork();
                    {
                        const net = this.traffic.network;
                        
                        // Add horizontal roads
                        city.horizontalRoads.forEach(r => {
                            net.addRoad(createRoad(0, r.y, city.width, r.roadHeight, 'H', r.name, r.lanes, true, true));
                        });
                        
                        // Add vertical roads
                        city.verticalRoads.forEach(r => {
                            net.addRoad(createRoad(r.x, 0, r.roadWidth, city.height, 'V', r.name, r.lanes, true, true));
                        });
                        
                        net.buildGraph();
                    }
                    const net = this.traffic.network;
                    
                    // 8. CREATE BUILDINGS
                    const buildings = city.placedBuildings.map(p => {
                        const t = p.template;
                        
                        // Check BuildingV2Registry first (single source of truth)
                        if (t.isV2 && BuildingV2Registry.has(p.templateId)) {
                            const building = BuildingV2Registry.create(p.templateId, p.x, p.y, { 
                                doorTarget: t.door?.target 
                            });
                            // Propagate mapCategory from template for map icons
                            if (t.mapCategory) building.mapCategory = t.mapCategory;
                            return building;
                        }
                        
                        // Legacy V1 buildings
                        const config = {};
                        if (t.sign) config.sign = { ...t.sign };
                        if (t.door) config.door = { ...t.door };
                        return new Building(p.x, p.y, p.w, p.h, t.color, t.label, t.type, config);
                    });
                    mapData.buildings = buildings;
                    
                    // Compute Zib taxi drop-off points (south-curb projection per landmark).
                    // Stored on mapData and merged into game registry below alongside landmarks.
                    mapData.dropOffs = city.computeDropOffs(net, buildings);
                    console.log(`Computed ${Object.keys(mapData.dropOffs).length} Zib drop-offs`);
                    
                    // Create Ferris Wheel next to Biggs Amusement Park
                    const biggsBuilding = buildings.find(b => b.id === 'biggs_park');
                    const biggsBlock = city.blockMap['block_4_2'];
                    if (biggsBuilding && biggsBlock) {
                        const blockCenterX = biggsBlock.x + biggsBlock.w / 2;
                        const aboveBuildingY = biggsBuilding.y - 100; // Just above the building
                        mapData.ferrisWheel = new FerrisWheel(
                            blockCenterX,
                            aboveBuildingY,
                            { radius: 560, axleHeight: 600, gondolas: 8, speed: 0.003, rimGap: 112, facing: 0 }
                        );
                    }
                    
                    // Build per-section collision shapes for old-style collision checks
                    // (vehicles, NPCs, LOS). Flattens V2 multi-section buildings.
                    mapData.buildingColliders = [];
                    buildings.forEach(b => {
                        if (b.isV2 && b.getCollisionShapes) {
                            mapData.buildingColliders.push(...b.getCollisionShapes());
                        } else {
                            mapData.buildingColliders.push({ x: b.x, y: b.y, w: b.w, h: b.h });
                        }
                    });
                    
                    // Store city reference for later lamp color application
                    mapData.cityLayout = city;
                    
                    // ── RESTRICTED ZONE (Hostile farming area) ──
                    // Place in block_10_4 — deep southeast, between Clinic Way & Gridlock Ln
                    const rzBlock = city.blockMap['block_10_4'];
                    console.log('[RESTRICTED ZONE] block_10_4:', rzBlock ? `${rzBlock.x},${rzBlock.y} ${rzBlock.w}x${rzBlock.h}` : 'NOT FOUND');
                    if (rzBlock) {
                        this.restrictedZone = new RestrictedZone({
                            id: 'rz_scrapyard',
                            name: 'THE SCRAPYARD',
                            x: rzBlock.x + 10,
                            y: rzBlock.y + 10,
                            w: rzBlock.w - 20,
                            h: rzBlock.h - 20,
                            hostileCount: 8,
                            respawnDelay: 900, // ~15 seconds
                            mapId: 'hub_949'
                        });
                        // Set block lamp color to danger crimson
                        city.setBlockLampColors({ 'block_10_4': '#ff2200' });
                        
                        // Ground visual — dark crimson floor tint so the zone is visible in-world
                        mapData.floorZones.push({
                            x: rzBlock.x, y: rzBlock.y, w: rzBlock.w, h: rzBlock.h,
                            color: '#1a0505'
                        });
                        
                        console.log('[RESTRICTED ZONE] Created at', this.restrictedZone.x, this.restrictedZone.y, this.restrictedZone.w, 'x', this.restrictedZone.h);
                    } else {
                        console.warn('[RESTRICTED ZONE] block_10_4 not found in city layout! Available blocks:', Object.keys(city.blockMap).join(', '));
                    }
                    
                    // 8b. EXTRACT LANDMARKS FROM BUILDINGS
                    const buildingLandmarks = city.extractLandmarks();
                    console.log('Building Landmarks:', Object.keys(buildingLandmarks));
                    
                    // Merge into game's landmark registry
                    this.landmarkRegistry = {
                        ...this.landmarkRegistry,
                        ...buildingLandmarks
                    };
                    
                    // Merge Zib drop-offs into game registry (one entry per landmarkId).
                    this.dropOffRegistry = { ...(mapData.dropOffs || {}) };
                    
                    // 9. GENERATE SMART PAVEMENTS
                    const generateSmartPavements = (road) => {
                        const paves = [];
                        const pavW = 75;
                        const intersections = net.getIntersectionsForRoad(road);
                        const exclusions = [];
                        
                        intersections.forEach(ix => {
                            let start, end;
                            if (road.orientation === 'H') {
                                start = ix.x - road.x;
                                end = (ix.x + ix.width) - road.x;
                            } else {
                                start = ix.y - road.y;
                                end = (ix.y + ix.height) - road.y;
                            }
                            exclusions.push({ s: start - 2, e: end + 2 });
                        });
                        
                        exclusions.sort((a, b) => a.s - b.s);
                        
                        const segments = [];
                        let curr = 0;
                        exclusions.forEach(ex => {
                            if (ex.s > curr) segments.push({ s: curr, e: ex.s });
                            curr = Math.max(curr, ex.e);
                        });
                        if (curr < road.length) segments.push({ s: curr, e: road.length });
                        
                        segments.forEach(seg => {
                            const len = seg.e - seg.s;
                            if (len < 10) return;
                            
                            if (road.orientation === 'H') {
                                paves.push(new Pavement(road.x + seg.s, road.y - pavW, len, pavW));
                                paves.push(new Pavement(road.x + seg.s, road.y + road.h, len, pavW));
                            } else {
                                paves.push(new Pavement(road.x - pavW, road.y + seg.s, pavW, len));
                                paves.push(new Pavement(road.x + road.w, road.y + seg.s, pavW, len));
                            }
                        });
                        return paves;
                    };
                    
                    mapData.pavements = [];
                    net.roads.forEach(r => {
                        mapData.pavements.push(...generateSmartPavements(r));
                    });
                    
                    // Generate crosswalks from CityLayout (knows all intersection positions)
                    mapData.crosswalks = city.generateCrosswalks();
                    
                    // Generate sidewalk network for pedestrians
                    const sidewalkNetwork = city.generateSidewalkNetwork();
                    this.pedestrians.setNetwork(sidewalkNetwork);
                    console.log(`Sidewalk Network: ${sidewalkNetwork.nodes.length} nodes, ${sidewalkNetwork.crosswalks.length} crosswalks`);
                    
                    // 10. GENERATE WALLS (Automatic from CityLayout!)
                    const generatedWalls = city.generateWalls(mapData.width, mapData.height);
                    // Push generated boundary walls into mapData.walls so Phase 4
                    // creates static entities for them (fixes boundary collision)
                    mapData.walls.push(...generatedWalls);
                    
                    // 11. GENERATE LAMPS
                    mapData.lamps = [];
                    net.roads.forEach(r => {
                        mapData.lamps.push(...r.generateLamps(net, 350));
                    });
                    
                    // 11b. APPLY CUSTOM BLOCK LAMP COLORS
                    city.applyBlockLampColors(mapData.lamps);
                    
                    // 11b2. ADD INTERSECTION CORNER LAMPS
                    const cornerInset = 40; // Distance from intersection edge
                    net.intersections.forEach(ix => {
                        // Four corners of each intersection
                        const corners = [
                            { x: ix.x - cornerInset, y: ix.y - cornerInset },                    // Top-left
                            { x: ix.x + ix.width + cornerInset, y: ix.y - cornerInset },        // Top-right
                            { x: ix.x - cornerInset, y: ix.y + ix.height + cornerInset },       // Bottom-left
                            { x: ix.x + ix.width + cornerInset, y: ix.y + ix.height + cornerInset } // Bottom-right
                        ];
                        
                        corners.forEach(corner => {
                            mapData.lamps.push(new LampEntity({
                                x: corner.x,
                                y: corner.y,
                                lampType: 2,
                                color: '#ffaa44',
                                lightRadius: 280
                            }));
                        });
                    });
                    
                    console.log(`Added ${net.intersections.length * 4} intersection corner lamps`);
                    
                    // 11c. GENERATE FOLIAGE (Trees and Bushes along streets)
                    mapData.foliage = [];
                    const foliageSpacing = 180; // Distance between trees
                    const foliageInset = 50;    // Distance from road edge
                    
                    net.roads.forEach(road => {
                        // Get intersections to avoid placing trees there
                        const intersections = net.getIntersectionsForRoad(road);
                        const exclusions = [];
                        
                        intersections.forEach(ix => {
                            let start, end;
                            if (road.orientation === 'H') {
                                start = ix.x - road.x - 80;
                                end = (ix.x + ix.width) - road.x + 80;
                            } else {
                                start = ix.y - road.y - 80;
                                end = (ix.y + ix.height) - road.y + 80;
                            }
                            exclusions.push({ start, end });
                        });
                        exclusions.sort((a, b) => a.start - b.start);
                        
                        // Merge overlapping exclusions
                        const merged = [];
                        if (exclusions.length > 0) {
                            let curr = exclusions[0];
                            for (let i = 1; i < exclusions.length; i++) {
                                if (curr.end >= exclusions[i].start) {
                                    curr.end = Math.max(curr.end, exclusions[i].end);
                                } else {
                                    merged.push(curr);
                                    curr = exclusions[i];
                                }
                            }
                            merged.push(curr);
                        }
                        
                        // Find valid segments
                        const segments = [];
                        let cursor = 50; // Start a bit in from road start
                        merged.forEach(ex => {
                            if (ex.start > cursor) segments.push({ start: cursor, end: ex.start });
                            cursor = Math.max(cursor, ex.end);
                        });
                        if (cursor < road.length - 50) segments.push({ start: cursor, end: road.length - 50 });
                        
                        // Place foliage along both sides
                        segments.forEach(seg => {
                            const len = seg.end - seg.start;
                            if (len < foliageSpacing) return;
                            
                            const count = Math.floor(len / foliageSpacing);
                            
                            // Glowing tree types for variety
                            const glowTypes = ['glow_purple', 'glow_pink', 'glow_gold', 'glow_green', 'glow_cyan'];
                            
                            for (let i = 0; i < count; i++) {
                                const offset = seg.start + foliageSpacing * (i + 0.5) + (Math.random() - 0.5) * 30;
                                
                                // Randomly choose type (60% trees, 15% bushes, 10% palms, 15% glowing)
                                const rand = Math.random();
                                let type, size;
                                if (rand < 0.60) {
                                    type = 'tree';
                                    size = 1.4 + Math.random() * 0.6;
                                } else if (rand < 0.75) {
                                    type = 'bush';
                                    size = 1.0 + Math.random() * 0.5;
                                } else if (rand < 0.85) {
                                    type = 'palm';
                                    size = 1.4 + Math.random() * 0.6;
                                } else {
                                    // Glowing tree!
                                    type = glowTypes[Math.floor(Math.random() * glowTypes.length)];
                                    size = 1.3 + Math.random() * 0.5;
                                }
                                
                                if (road.orientation === 'H') {
                                    // Top side
                                    mapData.foliage.push(new Foliage(
                                        road.x + offset,
                                        road.y - foliageInset - Math.random() * 20,
                                        type, size
                                    ));
                                    // Bottom side (different type for variety)
                                    const rand2 = Math.random();
                                    const type2 = rand2 < 0.5 ? 'tree' : (rand2 < 0.7 ? 'bush' : glowTypes[Math.floor(Math.random() * glowTypes.length)]);
                                    mapData.foliage.push(new Foliage(
                                        road.x + offset + (Math.random() - 0.5) * 40,
                                        road.y + road.h + foliageInset + Math.random() * 20,
                                        type2, 1.2 + Math.random() * 0.6
                                    ));
                                } else {
                                    // Left side
                                    mapData.foliage.push(new Foliage(
                                        road.x - foliageInset - Math.random() * 20,
                                        road.y + offset,
                                        type, size
                                    ));
                                    // Right side
                                    const rand2 = Math.random();
                                    const type2 = rand2 < 0.5 ? 'tree' : (rand2 < 0.7 ? 'bush' : glowTypes[Math.floor(Math.random() * glowTypes.length)]);
                                    mapData.foliage.push(new Foliage(
                                        road.x + road.w + foliageInset + Math.random() * 20,
                                        road.y + offset + (Math.random() - 0.5) * 40,
                                        type2, 1.2 + Math.random() * 0.6
                                    ));
                                }
                            }
                        });
                    });
                    
                    // Keep the Silver Queen forecourt (portico, steps, carpet) clear of street trees
                    const _sqBld = (mapData.buildings || []).find(b => b.id === 'silver_queen');
                    const _sqCourt = _sqBld && _sqBld._sqForecourt ? _sqBld._sqForecourt() : null;
                    if (_sqCourt) {
                        const inCourt = (o) => o.x > _sqCourt.x && o.x < _sqCourt.x + _sqCourt.w && o.y > _sqCourt.y && o.y < _sqCourt.y + _sqCourt.h;
                        mapData.foliage = mapData.foliage.filter(f => !inCourt(f));
                        mapData.lamps = mapData.lamps.filter(l => !inCourt(l));
                    }
                    console.log(`Generated ${mapData.foliage.length} foliage elements (including glowing trees)`);
                    
                    // 11d. SOUTHERN GRAVEYARD
                    // Large cemetery south of the road grid with stone walls, warm lamps,
                    // gravestones, and Ms. Jean's spawn point at center.
                    {
                        const gx = 500, gy = 8800, gw = 3000, gh = 2000;
                        const wallT = 30;         // Wall thickness
                        const gateW = 300;        // North entrance gap width
                        const gateCX = gx + gw / 2; // Gate center X
                        
                        // Stone walls (added directly as StaticEntities)
                        const graveyardWalls = [
                            // North wall - left of gate
                            { x: gx, y: gy, w: gateCX - gateW / 2 - gx, h: wallT },
                            // North wall - right of gate
                            { x: gateCX + gateW / 2, y: gy, w: (gx + gw) - (gateCX + gateW / 2), h: wallT },
                            // South wall
                            { x: gx, y: gy + gh - wallT, w: gw, h: wallT },
                            // West wall
                            { x: gx, y: gy, w: wallT, h: gh },
                            // East wall
                            { x: gx + gw - wallT, y: gy, w: wallT, h: gh }
                        ];
                        
                        graveyardWalls.forEach(w => {
                            this._staticWallEntities.push(new GameEntity({
                                type: 'wall', x: w.x, y: w.y,
                                width: w.w, height: w.h,
                                hasCollision: true,
                                collisionLayer: GameEntity.LAYER.STATIC,
                                collisionShape: GameEntity.SHAPE.AABB,
                                isStatic: true
                            }));
                            // Also add to mapData.walls for rendering
                            mapData.walls.push(w);
                        });
                        
                        // Gravestones - scattered in rows throughout the graveyard
                        const stoneMargin = 120;     // Inset from walls
                        const rowSpacing = 160;       // Y gap between rows
                        const colSpacing = 120;       // X gap between stones
                        const stoneArea = {
                            x: gx + stoneMargin,
                            y: gy + stoneMargin,
                            w: gw - stoneMargin * 2,
                            h: gh - stoneMargin * 2
                        };
                        
                        const seed = 949;
                        const rng = (i) => { const s = Math.sin(seed + i * 127.1) * 43758.5453; return s - Math.floor(s); };
                        let si = 0;
                        
                        for (let row = stoneArea.y; row < stoneArea.y + stoneArea.h - 40; row += rowSpacing) {
                            for (let col = stoneArea.x; col < stoneArea.x + stoneArea.w - 30; col += colSpacing) {
                                // Slight random offset for organic feel
                                const ox = (rng(si++) - 0.5) * 30;
                                const oy = (rng(si++) - 0.5) * 20;
                                // Skip ~20% for gaps and paths
                                if (rng(si++) < 0.2) continue;
                                
                                mapData.props.push(new PropEntity({
                                    x: col + ox, y: row + oy,
                                    width: 30 + rng(si++) * 15,
                                    height: 45 + rng(si++) * 20,
                                    color: '#555',
                                    mass: 50000 // Immovable
                                }));
                            }
                        }
                        
                        // Warm single-bulb lamps - evenly distributed throughout graveyard
                        const lampSpacing = 350;
                        const lampMargin = 100;
                        
                        for (let ly = gy + lampMargin; ly < gy + gh - lampMargin; ly += lampSpacing) {
                            for (let lx = gx + lampMargin; lx < gx + gw - lampMargin; lx += lampSpacing) {
                                mapData.lamps.push(new LampEntity({
                                    x: lx, y: ly,
                                    lampType: 1,         // Antiquated single-bulb
                                    color: '#ffaa55',    // Warm amber
                                    lightRadius: 300
                                }));
                            }
                        }
                        
                        // Gate lamps - flanking the north entrance
                        mapData.lamps.push(new LampEntity({ x: gateCX - gateW / 2 - 15, y: gy, lampType: 1, color: '#ffaa55', lightRadius: 350 }));
                        mapData.lamps.push(new LampEntity({ x: gateCX + gateW / 2 + 15, y: gy, lampType: 1, color: '#ffaa55', lightRadius: 350 }));
                        
                        // Register graveyard landmark (for Ms. Jean spawn)
                        this.landmarkRegistry['graveyard_center'] = { x: gateCX, y: gy + gh / 2 };
                        
                        console.log(`Graveyard: ${graveyardWalls.length} walls, ${mapData.props.length - entities.props.length} gravestones, lamps placed`);
                    }
                    
                    // 12. REGISTER NEON SIGNS
                    this.neonSigns = [];
                    buildings.forEach(build => {
                        if (build.attachedSign) this.neonSigns.push(build.attachedSign);
                    });
                    
                    // 13. PROCESS ENTITY QUEUE
                    GameEntity.processQueue();
                    
                    console.log(`CityLayout v2: Generated ${buildings.length} buildings, ${city.blocks.length} blocks`);
                    
                    // =========================================================
                    //  CACHE RESULTS for instant restore on future visits
                    // =========================================================
                    this._hubCache = {
                        buildings: mapData.buildings,
                        buildingColliders: mapData.buildingColliders,
                        cityLayout: mapData.cityLayout,
                        ferrisWheel: mapData.ferrisWheel || null,
                        network: this.traffic.network,
                        sidewalkNetwork: sidewalkNetwork,
                        pavements: mapData.pavements.map(p => ({...p})),
                        crosswalks: mapData.crosswalks.map(c => ({...c})),
                        foliage: [...mapData.foliage],
                        wallRects: mapData.walls.map(w => ({...w})),
                        landmarks: {...this.landmarkRegistry},
                        dropOffs: {...this.dropOffRegistry},
                        lampConfigs: mapData.lamps.map(l => ({
                            x: l.x, y: l.y, lampType: l.lampType,
                            color: l.color, lightRadius: l.lightRadius,
                            angle: l.angle || 0
                        })),
                        gravestoneConfigs: (() => {
                            // All props after the initial entity props are graveyard gravestones
                            const hubPropCount = this._hubCache_hubPropCount;
                            return mapData.props.slice(hubPropCount).map(p => ({
                                x: p.x, y: p.y, width: p.width, height: p.height,
                                color: p.color, mass: p.mass
                            }));
                        })()
                    };
                    console.log('[HUB CACHE] Cached procedural generation results');
                    
                    } // end of else (!this._hubCache) — first-time generation
                }
                
                // --- ROAD TEST (AUTOMATED) ---
                if (mapId === 'road_test') {
                    // Initialize road network
                    resetRoadNetworkIds();
                    this.traffic.network = new RoadNetwork();
                    const net = this.traffic.network;
                    const mapData = maps['road_test'];
                    
                    const gridLines = [600, 1300, 2000, 2700, 3400];
                    const extension = 250; 
                    const startCoord = gridLines[0] - extension; 
                    const endCoord = gridLines[gridLines.length-1] + extension;
                    const roadLength = endCoord - startCoord;
                    const lampColors = ['#ff007f', '#ccccff', '#ffd700', '#8a2be2']; 

                    const addLampsToSegment = (x, y1, y2, orientation) => {
                        const mid = (y1 + y2) / 2;
                        const segmentLen = Math.abs(y2 - y1);
                        const count = segmentLen > 600 ? 2 : 1;
                        const offset = segmentLen > 600 ? 150 : 0; 
                        const positions = (count === 1) ? [mid] : [mid - offset, mid + offset];
                        positions.forEach(pos => {
                            const color = lampColors[Math.floor(Math.random() * lampColors.length)];
                            if (orientation === 'V') mapData.lamps.push(new LampEntity({ x: x, y: pos, lampType: 2, color: color }));
                            else mapData.lamps.push(new LampEntity({ x: pos, y: x, lampType: 2, color: color }));
                        });
                    };

                    gridLines.forEach(x => {
                        const lanes = Math.floor(Math.random() * 3) + 1; 
                        const width = (lanes * 2) * 60;
                        const road = createRoad(x - width/2, startCoord, width, roadLength, 'V', '', lanes, true, true);
                        net.addRoad(road);
                        const lxL = road.x - 37.5; const lxR = road.x + road.w + 37.5;
                        addLampsToSegment(lxL, startCoord, gridLines[0], 'V'); addLampsToSegment(lxR, startCoord, gridLines[0], 'V');
                        for(let i=0; i<gridLines.length-1; i++) { addLampsToSegment(lxL, gridLines[i], gridLines[i+1], 'V'); addLampsToSegment(lxR, gridLines[i], gridLines[i+1], 'V'); }
                        addLampsToSegment(lxL, gridLines[gridLines.length-1], endCoord, 'V'); addLampsToSegment(lxR, gridLines[gridLines.length-1], endCoord, 'V');
                    });

                    gridLines.forEach(y => {
                        const lanes = Math.floor(Math.random() * 3) + 1;
                        const width = (lanes * 2) * 60;
                        const road = createRoad(startCoord, y - width/2, roadLength, width, 'H', '', lanes, true, true);
                        net.addRoad(road);
                        const lyT = road.y - 37.5; const lyB = road.y + road.h + 37.5;
                        addLampsToSegment(lyT, startCoord, gridLines[0], 'H'); addLampsToSegment(lyB, startCoord, gridLines[0], 'H');
                        for(let i=0; i<gridLines.length-1; i++) { addLampsToSegment(lyT, gridLines[i], gridLines[i+1], 'H'); addLampsToSegment(lyB, gridLines[i], gridLines[i+1], 'H'); }
                        addLampsToSegment(lyT, gridLines[gridLines.length-1], endCoord, 'H'); addLampsToSegment(lyB, gridLines[gridLines.length-1], endCoord, 'H');
                    });

                    net.buildGraph();
                    net.roads.forEach(road => { mapData.pavements.push(...road.getPavements()); });
                    const autoCrosswalks = net.generateCrosswalks(mapData.pavements);
                    mapData.crosswalks.push(...autoCrosswalks);
                    this.traffic.vehicles = []; 
                    
                    console.log(`[ROAD TEST] Road network initialized`);
                }

                // =========================================================
                //  PHASE 4: LOAD MAP DATA
                // =========================================================
                this.activeMap = maps[mapId] || maps['hub_949'];
                this.uiLocation.textContent = this.activeMap.label;

                // --- WEATHER: adopt this map's climate ---
                // Only outdoor maps change the odds table. Indoor maps leave it
                // alone: you haven't left the city by walking into a cafe, and
                // the sky should be unchanged when you come back out.
                if (this.weather) {
                    if (this.activeMap.climate) {
                        this.weather.setClimate(this.activeMap.climate);
                    } else if (this.activeMap.type === 'outdoor') {
                        this.weather.setClimate('_default');
                    }
                    // Suppression is reset further down, once the room system for
                    // this map has actually been built — see "WEATHER: resolve
                    // indoor suppression" below.
                }

                // --- NEW: HARVEST ATTACHMENTS FROM BUILDINGS ---
                // This automatically pulls signs and doors defined in the Building constructor
                if (this.activeMap.buildings) {
                    // Strip building-generated transitions from previous loads
                    // (prevents accumulation when MAP_DATA arrays get mutated by push)
                    if (this.activeMap.transitions) {
                        this.activeMap.transitions = this.activeMap.transitions.filter(t => !t._fromBuilding);
                    } else {
                        this.activeMap.transitions = [];
                    }
                    
                    // On cache restore, signs are already collected — only skip sign harvest
                    const skipSigns = this._hubCacheSkipSigns;
                    this._hubCacheSkipSigns = false; // Reset flag
                    
                    this.activeMap.buildings.forEach(b => {
                        // 1. Harvest Sign (skip on cache restore — already collected)
                        if (!skipSigns && b.attachedSign) {
                            this.neonSigns.push(b.attachedSign);
                        }
                        // 2. Harvest Transition (Door) — tag to prevent accumulation
                        if (b.attachedTransition) {
                            b.attachedTransition._fromBuilding = true;
                            this.activeMap.transitions.push(b.attachedTransition);
                        }
                        // 3. Harvest Lights — always needed (regenerated fresh on cache restore)
                        if (b.attachedLights && b.attachedLights.length > 0) {
                            this.activeMap.lamps.push(...b.attachedLights);
                        }
                    });
                    
                    // 3b. Re-apply block lamp colors to include building lights
                    // This ensures V2 building lights match street lamp colors on their block
                    if (this.activeMap.cityLayout && this.activeMap.cityLayout.applyBlockLampColors) {
                        this.activeMap.cityLayout.applyBlockLampColors(this.activeMap.lamps);
                    }
                    
                    // Add Road Test Map transition (at bottom center of hub)
                    if (this.activeMap.id === 'hub_949') {
                        this.activeMap.transitions.push({
                            x: 1960, y: 8400, w: 80, h: 60,
                            target: 'road_test',
                            label: 'Enter Road Test Zone',
                            _fromBuilding: true
                        });
                        this.activeMap.transitions.push({
                            x: 1960, y: 8500, w: 80, h: 60,
                            target: 'ollo_test',
                            label: 'Visit OllO Plaza',
                            _fromBuilding: true
                        });
                        // Cache hub buildings for delivery mission generation from any map
                        this._hubBuildingsCache = this.activeMap.buildings;
                    }
                }
                
                // POPULATE LANDMARK REGISTRY FROM MAP DATA
                if (this.activeMap.landmarks) {
                    for (const lm of this.activeMap.landmarks) {
                        this.landmarkRegistry[lm.id] = { x: lm.x, y: lm.y };
                    }
                    console.log(`Loaded ${this.activeMap.landmarks.length} landmarks for ${mapId}`);
                }
                
                // Also auto-generate landmarks from transitions (door positions)
                if (this.activeMap.transitions) {
                    for (const t of this.activeMap.transitions) {
                        // Create a landmark for each transition's center point
                        const transitionLandmarkId = `${mapId}_to_${t.target}`;
                        this.landmarkRegistry[transitionLandmarkId] = {
                            x: t.x + t.w / 2,
                            y: t.y + t.h / 2
                        };
                    }
                }
                
                // Build spatial transition grid for O(1) lookups (replaces per-frame .find())
                this._transitionGrid.build(this.activeMap.transitions);
                
                // Build render grids for static geometry — O(visible cells) draw instead of O(N)
                this._renderGridWalls = new RenderGrid(400);
                this._renderGridWalls.build(this.activeMap.walls);
                
                if (this.activeMap.floorZones) {
                    this._renderGridFloorZones = new RenderGrid(400);
                    this._renderGridFloorZones.build(this.activeMap.floorZones);
                } else {
                    this._renderGridFloorZones = null;
                }
                
                if (this.activeMap.pavements) {
                    this._renderGridPavements = new RenderGrid(400);
                    this._renderGridPavements.build(this.activeMap.pavements);
                } else {
                    this._renderGridPavements = null;
                }
                
                if (this.activeMap.crosswalks) {
                    this._renderGridCrosswalks = new RenderGrid(400);
                    this._renderGridCrosswalks.build(this.activeMap.crosswalks);
                } else {
                    this._renderGridCrosswalks = null;
                }
                
                // Build Indoor V2 Room System (if this map has room definitions)
                if (ROOM_DEFS[mapId]) {
                    this.roomSystem.build(ROOM_DEFS[mapId]);
                    
                    // AUTO WALL CUTTER — Split walls wherever doors are placed
                    if (this.roomSystem.doors.length > 0 && this.activeMap.walls) {
                        this.activeMap.walls = RoomSystem.cutWallsForDoors(
                            this.activeMap.walls,
                            ROOM_DEFS[mapId].doors || []
                        );
                    }
                } else {
                    this.roomSystem.clear();
                }
                
                // --- WEATHER: resolve indoor suppression for the new map ---
                // Runs after roomSystem.build() so `active` reflects THIS map.
                // Outdoor maps always show the sky. Indoor maps hide it, unless
                // they run a room system — those get it recomputed per frame in
                // the update loop, since a map can mix indoor rooms with a
                // veranda or courtyard that should still get rained on.
                if (this.weather) {
                    if (this.activeMap.type === 'outdoor') {
                        this.weather.setIndoorSuppressed(false);
                    } else if (!this.roomSystem.active) {
                        this.weather.setIndoorSuppressed(true);
                    }
                }
                
                // -------------------------------------------------------

                this.props = this.activeMap.props || [];
                this.npcs = this.activeMap.npcs || [];
                this.lamps = this.activeMap.lamps || [];
                this.enemies = []; this.loot = []; 
                
                // Auto-tag lamps with their containing room ID for per-room light control
                if (this.roomSystem.active) {
                    this.roomSystem.tagLamps(this.lamps);
                } 
                
                this.decals.clear(); 
                
                // Deactivate current map entities (non-target maps have empty arrays from lazy creation)
                const targetMapData = maps[mapId];
                if (targetMapData) {
                    if (targetMapData.props) { for (let prop of targetMapData.props) { if (prop instanceof GameEntity) { prop.active = false; prop.markedForDestroy = false; } } }
                    if (targetMapData.npcs) { for (let npc of targetMapData.npcs) { if (npc instanceof GameEntity) { npc.active = false; npc.markedForDestroy = false; } } }
                }
                
                // Re-register persistents
                if (this.player) { this.player.active = true; this.player.markedForDestroy = false; this.player.reregister(); }
                if (this.ownedCar && this.ownedCar instanceof VehicleEntity) { this.ownedCar.active = true; this.ownedCar.markedForDestroy = false; this.ownedCar.dead = false; this.ownedCar.reregister(); }
                for (let tm of this.teammates) { if (tm instanceof ActorEntity) { tm.active = true; tm.markedForDestroy = false; tm.reregister(); } }
                
                // Activate current map entities
                for (let prop of this.props) { if (prop instanceof GameEntity) { prop.active = true; prop.markedForDestroy = false; prop.reregister(); } }
                for (let npc of this.npcs) { if (npc instanceof GameEntity) { npc.active = true; npc.markedForDestroy = false; npc.dead = false; npc.reregister(); } }
                
                GameEntity.clearType('projectile'); 

                if (this.useNewCollisionSystem) {
                    if (this.activeMap.walls) { this._staticWallEntities = createStaticEntitiesFromWalls(this.activeMap.walls); }
                    if (this.activeMap.buildings) { this._staticBuildingEntities = createStaticEntitiesFromBuildings(this.activeMap.buildings); }
                }
                
                CollisionSystem.processQueue();
                GameEntity.queueEnabled = false;
                
                if (this.activeMap.id === 'hub_949' && this.questState.ambushCleared) { 
                    this.npcs.push(new NPC(2000, 9800, "Ms. Jean", 'ms_jean')); 
                }
                
                // Spawn Grum North near the Scrapyard
                if (this.activeMap.id === 'hub_949' && this.restrictedZone) {
                    const rz = this.restrictedZone;
                    // Place Grum just south of the zone entrance, on the road
                    this.npcs.push(new NPC(rz.x + rz.w / 2 - 40, rz.y + rz.h + 60, "Grum North", 'arena_master'));
                }
                
                // Create HordeGauntlet (persists across map switches)
                if (!this.hordeGauntlet) {
                    this.hordeGauntlet = new HordeGauntlet();
                }
                
                // Spawn bounty target on hub if active bounty mission
                // Must re-spawn on every hub entry because enemies array is cleared on map load
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission
                    && this.missions.activeMission.type === MISSION_TYPES.BOUNTY
                    && this.missions.activeMission.status === 'active') {
                    // Clear stale entity reference (entity was destroyed on previous map unload)
                    this.missions.activeMission.targetEntity = null;
                    this.missions.spawnBountyTarget(this);
                }
                
                // Spawn salvage guards on hub if active salvage mission
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission
                    && this.missions.activeMission.type === MISSION_TYPES.SALVAGE
                    && this.missions.activeMission.status === 'active'
                    && !this.missions.activeMission.crateCollected) {
                    // Reset guard spawns for fresh map load
                    this.missions.activeMission.guardsSpawned = false;
                    this.missions.activeMission._guardEntities = [];
                    this.missions.activeMission.crateSpawned = false;
                    this.missions.spawnSalvageGuards(this);
                }
                
                // Show active mission guidance on hub load
                if (this.activeMap.id === 'hub_949' && this.missions && this.missions.activeMission) {
                    const m = this.missions.activeMission;
                    if (m.status === 'active') {
                        setTimeout(() => {
                            if (this.ui && this.ui.showMissionBanner) {
                                const text = this.missions.getObjectiveText();
                                if (text) this.ui.showMissionBanner(text, 'gold', 'IN PROGRESS');
                            }
                        }, 800);
                    }
                }
                
                // --- VELVET CAT ---
                if (this.activeMap.id === 'hub_949') {
                    if (this.questState.hasVelvetCat) {
                        // Owned — temp position, repositioned by placeEntitySmart in Phase 5
                        this.velvetCat = new VelvetCat(this.activeMap.spawn.x, this.activeMap.spawn.y);
                    } else {
                        // Discoverable — sitting near the hub spawn (apartment area)
                        this.velvetCat = new VelvetCat(900, 580);
                        this.velvetCat.state = 'idle';
                        this.velvetCat.idleBehavior = 'sit';
                        this.velvetCat._discoverable = true; // Flag for interaction
                    }
                } else if (this.questState.hasVelvetCat) {
                    // Owned + indoor/other maps — temp position, repositioned in Phase 5
                    this.velvetCat = new VelvetCat(this.activeMap.spawn.x, this.activeMap.spawn.y);
                } else {
                    this.velvetCat = null;
                }

                // =========================================================
                //  PHASE 5: PLAYER POSITIONING (DYNAMIC LINKING)
                // =========================================================
                
                // CASE A: DYNAMIC RETURN (e.g. Exiting a building to the Hub)
                if (spawnAt && spawnAt.linkFrom) {
                    // Find the transition on the NEW map that targets the OLD map
                    // Example: If loading 'hub_949' coming from 'apt_949', find the Hub door that points to 'apt_949'
                    const returnGate = this._transitionGrid.findByTarget(spawnAt.linkFrom);
                    
                    if (returnGate) {
                        // Spawn at the center of the gate
                        this.player.x = returnGate.x + returnGate.w / 2;
                        
                        // Offset Y to step "out" of the door
                        // Note: Most buildings are "North", so "Out" is South (Positive Y).
                        // We add 35px to clear the building wall/door trigger.
                        this.player.y = returnGate.y + returnGate.h + 35;
                        
                        // Face Down (South)
                        this.player.angle = Math.PI / 2; 
                    } else {
                        // Fallback: If no linking door found, use map default
                        console.warn(`Link connection to ${spawnAt.linkFrom} not found. Using default spawn.`);
                        this.player.x = this.activeMap.spawn.x;
                        this.player.y = this.activeMap.spawn.y;
                    }
                } 
                
                // CASE B: EXPLICIT COORDINATES (e.g. Save Game load, or debug teleport)
                else if (spawnAt && typeof spawnAt.x === 'number') { 
                    this.player.x = spawnAt.x; 
                    this.player.y = spawnAt.y; 
                } 
                
                // CASE C: DEFAULT SPAWN (e.g. Entering an interior for the first time)
                else { 
                    this.player.x = this.activeMap.spawn.x; 
                    this.player.y = this.activeMap.spawn.y; 
                }
                
                // Setup Car for Hub
                if (this.activeMap.id === 'hub_949' || this.activeMap.id === 'road_test') {
                    this.car.x = this.hubState.carX; 
                    this.car.y = this.hubState.carY; 
                    this.car.angle = this.hubState.carAngle;
                    this.car.visible = true; 
                    this.car.active = true;  // Enable collision on outdoor maps
                    this.car.controlMode = 'PLAYER'; 
                    this.player.visible = true; 
                    this.isDriving = false;
                } else {
                    this.car.visible = false; 
                    this.car.active = false;  // Disable collision on indoor maps
                    this.car.controlMode = 'PARKED';
                    this.isDriving = false; 
                    this.player.visible = true;
                }
                
                // --- DELIVERY VEHICLE (Amber LADY Blackmark V3, parked near Cozy Cafe) ---
                if (this.activeMap.id === 'hub_949') {
                    // Get cafe landmark position for parking nearby
                    const cafeLandmark = this.landmarkRegistry['cozy_cafe'];
                    if (cafeLandmark && !this.deliveryVehicle) {
                        this.deliveryVehicle = new TrafficVehicle(null, 'LADY', 'suv2', 'PARKED');
                        //this.deliveryVehicle.color = '#1a0b2e'; // Deep violet body
                        this.deliveryVehicle.color = '#58391C'
                        this.deliveryVehicle.glowColor = '#a469ff'; // Violet underglow
                        this.deliveryVehicle.headlightColor = '#a469ff'; // Violet headlights
                        this.deliveryVehicle.isDeliveryVehicle = true;
                        this.deliveryVehicle.controlMode = 'PARKED';
                        this.deliveryVehicle.hasDriver = false;
                        // Park near cafe entrance (offset to the side so it doesn't block door)
                        this.deliveryVehicle.x = cafeLandmark.x - 80;
                        this.deliveryVehicle.y = cafeLandmark.y + 20;
                        this.deliveryVehicle.angle = Math.PI / 2; // Facing south
                        this.deliveryVehicle.visible = true;
                        this.deliveryVehicle.active = true;
                    } else if (this.deliveryVehicle) {
                        // Re-show on return to hub
                        this.deliveryVehicle.visible = true;
                        this.deliveryVehicle.active = true;
                        this.deliveryVehicle.reregister();
                    }
                } else {
                    // Hide delivery vehicle on indoor maps
                    if (this.deliveryVehicle) {
                        this.deliveryVehicle.visible = false;
                        this.deliveryVehicle.active = false;
                    }
                }
                
                // =========================================================
                // SMART COMPANION PLACEMENT (Teammates & Dancers)
                // =========================================================
                // Config: 40px start offset, Smart Cone Search, Transition Safe-zones
            
                const occupiedSpots = [];
                const map = this.activeMap;
                const pX = this.player.x;
                const pY = this.player.y;
                const pAngle = this.player.angle || 0; // Direction player is looking
            
                // 1. Helper: Collision Check (includes Door Override)
                const isSpotValid = (x, y) => {
                    const r = 10; // Entity radius
                    
                    // Bounds
                    if (x < r || x > map.width - r || y < r || y > map.height - r) return false;
            
                    // Transition/Door Override (ALWAYS VALID)
                    // This ensures they can spawn on door mats even if near walls
                    if (map.transitions) {
                        for (let t of map.transitions) {
                            if (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h) return true;
                        }
                    }
            
                    // Walls
                    if (map.walls) {
                        for (let w of map.walls) {
                            if (x + r > w.x && x - r < w.x + w.w &&
                                y + r > w.y && y - r < w.y + w.h) return false;
                        }
                    }
            
                    // Buildings (Visual Footprint)
                    const placeColliders = getColliders(map);
                    if (placeColliders) {
                        for (let b of placeColliders) {
                            if (x + r > b.x && x - r < b.x + b.w &&
                                y + r > b.y && y - r < b.y + b.h) return false;
                        }
                    }
                    return true;
                };
            
                // 2. Helper: The Smart Search Logic
                const placeEntitySmart = (entity) => {
                    let validPosFound = false;
                    
                    // SETTINGS: Start at 40px as requested
                    const startRadius = 40; 
                    const ringStep = 20;
                    const maxRings = 10; 
            
                    searchLoop:
                    for (let r = 0; r < maxRings; r++) {
                        const currentDist = startRadius + (r * ringStep);
                        const steps = 12 + (r * 4); // Increase angular resolution further out
                        
                        // Cone Search: Alternating angles (0, +15, -15, +30, -30...)
                        // Prioritizes looking where the player is looking
                        for (let i = 0; i < steps; i++) {
                            const offsetIdx = Math.ceil(i/2) * (i%2 === 0 ? 1 : -1);
                            const angleOffset = (offsetIdx / steps) * Math.PI * 2; 
                            const angle = pAngle + angleOffset;
                            
                            const tx = pX + Math.cos(angle) * currentDist;
                            const ty = pY + Math.sin(angle) * currentDist;
            
                            // A. Environment Check
                            if (!isSpotValid(tx, ty)) continue;
            
                            // B. Overlap Check (prevent stacking)
                            let overlaps = false;
                            for (let spot of occupiedSpots) {
                                if (Math.hypot(tx - spot.x, ty - spot.y) < 20) {
                                    overlaps = true;
                                    break;
                                }
                            }
                            if (overlaps) continue;
            
                            // Success
                            entity.x = tx;
                            entity.y = ty;
                            entity.vx = 0; // Stop sliding
                            entity.vy = 0;
                            occupiedSpots.push({x: tx, y: ty});
                            validPosFound = true;
                            break searchLoop;
                        }
                    }
            
                    // Fallback: If trapped in valid geometry, stack on player
                    if (!validPosFound) {
                        entity.x = pX;
                        entity.y = pY;
                    }
                };
            
                // 3. Execute for Teammates
                for (let tm of this.teammates) {
                    if (!tm.recruited) {
                        // Unrecruited logic
                        if (map.id === 'moon_city_nightclub') { tm.x = 1100; tm.y = 150; }
                        else { tm.x = -5000; tm.y = -5000; }
                        continue;
                    }
                    // Downed teammates recover at the apartment
                    if (tm.downed) {
                        if (map.id === 'apt_949') {
                            tm.downed = false;
                            tm.dead = false;
                            tm.active = true;
                            tm.visible = true;
                            tm.hp = tm.maxHp;
                            tm.teammateStims = tm.maxTeammateStims || 3;
                            showMessage(`${tm.name.toUpperCase()} HAS RECOVERED.`);
                            placeEntitySmart(tm);
                        } else {
                            // Still downed — hide offscreen
                            tm.x = -5000; tm.y = -5000;
                            tm.visible = false;
                        }
                        continue;
                    }
                    placeEntitySmart(tm);
                }

                // 3b. Apartment idle positions — place recruited teammates at fixed spots
                if (map.id === 'apt_949') {
                    for (const tm of this.teammates) {
                        if (!tm.recruited || tm.downed) continue;
                        const pos = APT_IDLE_POSITIONS[tm.name];
                        if (pos) {
                            tm.x = pos.x;
                            tm.y = pos.y;
                            tm.velX = 0;
                            tm.velY = 0;
                            // Face toward center of living room
                            tm.angle = Math.atan2(450 - tm.y, 500 - tm.x);
                        }
                    }
                }

                // 4. Reposition Velvet Cat near player (after player position is final)
                if (this.velvetCat && this.questState.hasVelvetCat) {
                    placeEntitySmart(this.velvetCat);
                }

                // 5. Reset animation state AFTER all positioning to prevent limb splay
                resetHumanoidAnim(this.player);
                this.teammates.forEach(t => resetHumanoidAnim(t));

                this.camera.zoom = 1; 
                this.resize();
            }
            
            /**
             * COMPUTE LAMP SHADOWS (Geometry-Only)
             * -----------------------------------------------------------
             * Pre-computes shadow polygon geometry per lamp and caches it
             * on the lamp object. NO map-sized canvas allocation.
             * 
             * Old approach: 4000×11000 shadowCanvas = 44M pixels in VRAM
             * New approach: ~100 polygon points per lamp = ~50KB total
             * 
             * The shadow polygons are drawn per-frame into the screen-sized
             * lightCanvas for only visible lamps (AABB culled).
             */
            bakeStaticLighting() {
                if (!this.activeMap) return;
            
                // 1. RESET DEBUG DATA
                this.debugLightData = []; 
                
                let allObstacles = [...this.activeMap.walls];
                if (this.activeMap.buildingColliders) {
                    allObstacles = allObstacles.concat(this.activeMap.buildingColliders);
                } else if (this.activeMap.buildings) {
                    allObstacles = allObstacles.concat(this.activeMap.buildings);
                }
            
                // 2. COMPUTE SHADOW POLYGON PER LAMP (cached on lamp object)
                for (let lamp of this.lamps) {
                    const range = lamp.radius;
                    const relevantObstacles = allObstacles.filter(o => 
                        Math.hypot(o.x + o.w/2 - lamp.x, o.y + o.h/2 - lamp.y) < range + Math.max(o.w, o.h)
                    );
            
                    let points = [];
                    for (let o of relevantObstacles) {
                        points.push({x: o.x, y: o.y});
                        points.push({x: o.x + o.w, y: o.y});
                        points.push({x: o.x + o.w, y: o.y + o.h});
                        points.push({x: o.x, y: o.y + o.h});
                    }
                    // Map corners as boundary points
                    points.push({x: 0, y: 0}, {x: this.activeMap.width, y: 0}, 
                                {x: this.activeMap.width, y: this.activeMap.height}, {x: 0, y: this.activeMap.height});
            
                    let intersections = [];
                    for (let p of points) {
                        const angle = Math.atan2(p.y - lamp.y, p.x - lamp.x);
                        [-0.0001, 0, 0.0001].forEach(offset => {
                            const rayAngle = angle + offset;
                            const dx = Math.cos(rayAngle);
                            const dy = Math.sin(rayAngle);
                            let closestDist = range;
                            for (let o of relevantObstacles) {
                                const hits = getLineRectIntersections(lamp.x, lamp.y, lamp.x + dx * range, lamp.y + dy * range, o.x, o.y, o.w, o.h);
                                for (let hit of hits) {
                                    const dist = Math.hypot(hit.x - lamp.x, hit.y - lamp.y);
                                    if (dist < closestDist) closestDist = dist;
                                }
                            }
                            intersections.push({ angle: rayAngle, x: lamp.x + dx * closestDist, y: lamp.y + dy * closestDist });
                        });
                    }
                    intersections.sort((a, b) => a.angle - b.angle);
            
                    // Cache the shadow polygon on the lamp — NO canvas needed
                    lamp._shadowPoly = intersections;
                    
                    // Debug data
                    if (intersections.length > 0) {
                        this.debugLightData.push({ source: {x: lamp.x, y: lamp.y}, points: intersections });
                    }
                }
                this.lightingBaked = true;
            }
            
            /**
             * Laser sight geometry for this frame: from the drawn muzzle along the line the
             * next shot will fly (same aimFromMuzzle call as fireWeapon), clipped at the
             * first wall. Null when the sight shouldn't show (no attachment, holstered,
             * driving, no weapon drawn). Cached per frame for the world and light passes.
             */
            getLaserSight() {
                const key = _simTick + ':' + RenderInterp.alpha + ':' + this.player.x + ':' + this.player.y + ':' + this.player.angle;
                if (this._laserKey === key) return this._laserGeom;
                this._laserKey = key;
                this._laserGeom = null;
                const attach = this.inventory.getEquippedAttachment();
                if (attach?.effect !== 'laser_sight' || !this.player.visible || this.isDriving) return null;
                if (!(this.weaponMode === 'normal' || this.weaponMode === 'sniper') || this.weaponHolstered) return null;
                if (!this.player._muzzleLocal || !this.player._muzzleReady) return null;
                const ap = this.player._aimPoint;
                const shot = aimFromMuzzle(this.player, this.player.angle, ap ? ap.x : undefined, ap ? ap.y : undefined);
                const beamLength = 300;
                const ex = shot.x + Math.cos(shot.angle) * beamLength, ey = shot.y + Math.sin(shot.angle) * beamLength;
                const hitD = raycastNearest(shot.x, shot.y, ex, ey, [...(this.activeMap.walls || []), ...getColliders(this.activeMap)], beamLength);
                this._laserGeom = { x0: shot.x, y0: shot.y, x1: shot.x + Math.cos(shot.angle) * hitD, y1: shot.y + Math.sin(shot.angle) * hitD, angle: shot.angle };
                return this._laserGeom;
            }

            /** After lighting: building windows/neon/rooftop lights, then the sky layer. */
            drawEmissivePass(ctx) {
                const dark = this.getAmbientDarkness();
                if (this.activeMap.id === 'apt_949') this.drawApartmentGlow(ctx);
                if (CONFIG.BUILDINGS.LEAN && this.activeMap.buildings) {
                    const z = this.camera.zoom || 1;
                    const hw = this.canvas.width / 2 / z + 200, hh = this.canvas.height / 2 / z + 200;
                    for (const b of this.activeMap.buildings) {
                        if (!b.isV2 || !b.drawEmissive) continue;
                        const m = b.emissiveReach || 0;
                        if (b.x + b.w < this.camera.x - hw - m || b.x > this.camera.x + hw + m || b.y + b.h < this.camera.y - hh - m || b.y > this.camera.y + hh + m) continue;
                        b.drawEmissive(ctx, dark);
                    }
                }
                if (this.activeMap.type === 'outdoor') {
                    if (!this.skyLayer || this.skyLayer.map !== this.activeMap) this.skyLayer = new SkyLayer(this.activeMap);
                    this.skyLayer.draw(ctx, this.camera, this.canvas, dark);
                }
            }

            /** Debug overlay: blocked nav cells in view, companion paths, spots and shot lines. */
            drawNavDebug(ctx) {
                const nav = NavGrid.for(this.activeMap);
                if (!nav) return;
                const z = this.camera.zoom || 1;
                const halfW = this.canvas.width / 2 / z, halfH = this.canvas.height / 2 / z;
                const c = nav.cell;
                const c0 = Math.max(0, nav.colOf(this.camera.x - halfW)), c1 = Math.min(nav.cols - 1, nav.colOf(this.camera.x + halfW));
                const r0 = Math.max(0, nav.rowOf(this.camera.y - halfH)), r1 = Math.min(nav.rows - 1, nav.rowOf(this.camera.y + halfH));
                ctx.save();
                ctx.fillStyle = 'rgba(40, 120, 255, 0.28)';   // blue reads against the city's reds and pinks
                for (let row = r0; row <= r1; row++) {
                    for (let col = c0; col <= c1; col++) {
                        if (nav.blocked[row * nav.cols + col]) ctx.fillRect(col * c, row * c, c, c);
                    }
                }
                for (const tm of this.teammates) {
                    if (!tm.recruited || tm.inCar) continue;
                    const st = tm._navPath;
                    if (st && st.pts) {
                        ctx.strokeStyle = 'rgba(0, 220, 255, 0.9)'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(tm.x, tm.y);
                        for (let i = st.idx; i < st.pts.length; i++) ctx.lineTo(st.pts[i].x, st.pts[i].y);
                        ctx.stroke();
                    }
                    const tac = tm._tac;
                    if (tac && tac.spot) {
                        ctx.strokeStyle = 'rgba(255, 220, 0, 0.95)'; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(tac.spot.x, tac.spot.y, 10, 0, Math.PI * 2); ctx.stroke();
                        if (tac.target && !tac.target.dead) {
                            ctx.strokeStyle = hasShotLine(tac.spot.x, tac.spot.y, tac.target.x, tac.target.y, this.activeMap)
                                ? 'rgba(80, 255, 120, 0.8)' : 'rgba(255, 80, 80, 0.8)';
                            ctx.setLineDash([6, 6]);
                            ctx.beginPath(); ctx.moveTo(tac.spot.x, tac.spot.y); ctx.lineTo(tac.target.x, tac.target.y); ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }
                }
                ctx.restore();
            }

            drawDebugLighting(ctx) {
                // If there is no data (because bake hasn't run), do nothing
                if (!this.debugLightData) return;

                ctx.save();
                ctx.lineWidth = 1;

                for (let light of this.debugLightData) {
                    // Draw Rays (The "Angles") - Faint White
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.beginPath();
                    for (let p of light.points) {
                        ctx.moveTo(light.source.x, light.source.y);
                        ctx.lineTo(p.x, p.y);
                    }
                    ctx.stroke();

                    // Draw Polygon Outline (The "Shadows") - Bright White
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.beginPath();
                    if (light.points.length > 0) {
                        ctx.moveTo(light.points[0].x, light.points[0].y);
                        for (let i = 1; i < light.points.length; i++) {
                            ctx.lineTo(light.points[i].x, light.points[i].y);
                        }
                        ctx.closePath();
                    }
                    ctx.stroke();
                    
                    // Draw Light Source Center
                    ctx.fillStyle = '#00f3ff';
                    ctx.fillRect(light.source.x - 2, light.source.y - 2, 4, 4);
                }
                ctx.restore();
            }

            triggerTransition() {
                if (!this.activeMap.transitions) return;
                
                // Find which transition zone the player is standing in
                const t = this._transitionGrid.query(this.player.x, this.player.y);
                
                if (t && t.target) {
                    const displayNames = {
                        'apt_949': "SILVER QUEEN APARTMENTS",
                        'medbay_sw': "DR. YIN'S CLINIC",
                        'moon_city_nightclub': "MOON CITY NIGHTCLUB",
                        'hotel_lobby': "DOUBLE NIGHTS HOTEL",
                        'hotel_suite': "PENTHOUSE SUITE",
                        'church_boss': "THE SANCTUM",
                        'road_test': "ROAD TEST ZONE",
                        'hub_949': "CITY SECTOR 9",
                        'auto_shop': "TORQUE AUTO",
                        'neural_sys_interior': "NEURAL SYSTEMS",
                        'biggs_arena': "BIGGS AMUSEMENT PARK",
                        'grum_arena': "GRUM'S GAUNTLET"
                    };
            
                    const locName = displayNames[t.target] || "UNKNOWN LOCATION";
                    
                    // --- SECURITY CHECKS ---
                    // Prevent entering the Suite without a keycard
                    if (t.target === 'hotel_suite' && this.activeMap.id === 'hotel_lobby' && !this.questState.hasKeycard) {
                        showMessage("ACCESS DENIED. VIP KEYCARD REQUIRED.");
                        return;
                    }
                    
                    // --- FLAVOR TEXT ---
                    if (t.target === 'hotel_lobby' && this.activeMap.id === 'hotel_suite') {
                        showMessage("GOING DOWN...");
                    } else if (this.activeMap.id === 'church_boss') {
                        showMessage("RETURNING TO REALITY...");
                    } else {
                        // Standard Entry/Exit message
                        const action = this.activeMap.type === 'indoor' ? "EXITING TO" : "ENTERING";
                        showMessage(`${action} ${locName}...`);
                    }
            
                    // --- EXECUTE TRANSITION (With Dynamic Linking) ---
                    // by passing 'linkFrom: this.activeMap.id', the loader will:
                    // 1. Load the new map (t.target)
                    // 2. Look for a door/elevator/portal in that map that points BACK to where we came from
                    // 3. Spawn the player exactly at that point
                    this.loadMap(t.target, { linkFrom: this.activeMap.id });
                }
            }

            toggleVehicle() {
                if (this.activeMap.type === 'indoor') { showMessage("CANNOT USE VEHICLE INDOORS."); return; }
                
                // Zib passenger exit — charge partial fare and exit cleanly
                if (this.isDriving && this.zibSystem && this.zibSystem.isPassenger) {
                    this.zibSystem.exitEarly(this);
                    this.interactBtn.innerHTML = "Enter<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                    return;
                }
                
                if (this.isDriving) {
                    // --- EXITING VEHICLE ---
                    this.isDriving = false; 
                    this.player.visible = true;
                    this.car.visible = true; 
                    this.car.hasDriver = false; 
                    this.car.alliance = null; // Clear friendly protection
                    
                    // Cat exits with player
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.inCar = false;
                        this.velvetCat.visible = true;
                    }
                    
                    // Add hijacked car back to traffic
                    if (this.car !== this.ownedCar && !this.traffic.vehicles.includes(this.car)) {
                        this.traffic.vehicles.push(this.car);
                    }
                    if (this.car === this.ownedCar) this.ownedCar.markerTargetOpacity = 1.0;

                    this.autodriveBtn.style.display = 'none';
                    this.autodriveBtn.classList.remove('engaged');
                    this.holsterBtn.style.display = 'flex';
                    this.fireBtn.style.display = this.weaponHolstered ? 'none' : 'flex';
                    this.emoteBtn.style.display = this.weaponHolstered ? 'flex' : 'none';
                    if (this.car.controlMode === 'AI') this.car.disableAutoDrive();
                    if (this.car.clearSeats) this.car.clearSeats();
                    
                    // --- SIDE EXIT STRATEGY ---
                    const exitDist = this.car.width / 2 + 25; 
                    const cos = Math.cos(this.car.angle);
                    const sin = Math.sin(this.car.angle);
                    
                    const leftX = this.car.x + (Math.sin(this.car.angle) * exitDist);
                    const leftY = this.car.y - (Math.cos(this.car.angle) * exitDist);
                    const rightX = this.car.x - (Math.sin(this.car.angle) * exitDist);
                    const rightY = this.car.y + (Math.cos(this.car.angle) * exitDist);

                    const isBlocked = (x, y) => {
                        for(let w of this.activeMap.walls) {
                            if(x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
                        }
                        const colliders = getColliders(this.activeMap);
                        if (colliders) {
                            for(let b of colliders) {
                                if(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
                            }
                        }
                        return false;
                    };

                    const leftBlocked = isBlocked(leftX, leftY);
                    const rightBlocked = isBlocked(rightX, rightY);
                    
                    let useLeft = !leftBlocked;
                    let useRight = !rightBlocked;
                    
                    if (leftBlocked && rightBlocked) {
                        this.player.x = this.car.x;
                        this.player.y = this.car.y;
                    } else {
                        const passengers = this.teammates.filter(t => t.inCar);
                        
                        if (useLeft) { this.player.x = leftX; this.player.y = leftY; } 
                        else { this.player.x = rightX; this.player.y = rightY; }
                        
                        passengers.forEach((p, i) => {
                            p.inCar = false;
                            p.seatIndex = -1;
                            const offset = (Math.floor(i/2) + 1) * 20 * (i % 2 === 0 ? -1 : 1);
                            const offsetX = cos * offset;
                            const offsetY = sin * offset;
                            let targetX, targetY;
                            
                            if (useLeft && useRight) { targetX = rightX + offsetX; targetY = rightY + offsetY; } 
                            else if (useLeft) { targetX = leftX + offsetX; targetY = leftY + offsetY; } 
                            else { targetX = rightX + offsetX; targetY = rightY + offsetY; }
                            
                            p.x = targetX; p.y = targetY;
                        });
                    }
                    
                    // Position cat near player on exit
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.x = this.player.x - 25;
                        this.velvetCat.y = this.player.y + 20;
                    }
                    
                    // Reset animation state to prevent limb splay from position jump
                    resetHumanoidAnim(this.player);
                    this.teammates.forEach(t => { if (!t.inCar) resetHumanoidAnim(t); });
                    
                    this.interactBtn.innerHTML = "Enter<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                } else {
                    // --- ENTERING VEHICLE ---
                    this.isDriving = true; 
                    
                    // CHANGED: Player remains visible to render the "Lean Out" animation
                    this.player.visible = true; 
                    
                    this.car.visible = true; 
                    this.car.hasDriver = true; 
                    this.car.alliance = 'friendly'; // Prevent friendly projectile collisions
                    
                    // Set map bounds for boundary clamping
                    this.car._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };
                    
                    if (this.car !== this.ownedCar) {
                        const idx = this.traffic.vehicles.indexOf(this.car);
                        if (idx > -1) this.traffic.vehicles.splice(idx, 1);
                    }
                    if (this.car === this.ownedCar) this.ownedCar.markerTargetOpacity = 0;

                    this.autodriveBtn.style.display = 'flex';
                    this.holsterBtn.style.display = 'none';
                    this.fireBtn.style.display = 'flex';
                    this.emoteBtn.style.display = 'none';
                    this.interactBtn.innerHTML = "Exit<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                    
                    // --- SEATING LOGIC (seat assignment system) ---
                    // Driver = seat 0 (player)
                    if (this.car.seatOccupants) {
                        this.car.clearSeats();
                        this.car.seatOccupants[0] = true; // Player is driver
                    }
                    
                    this.teammates.forEach(tm => { 
                        if(tm.recruited && !tm.downed && this.car.assignPassenger) {
                            this.car.assignPassenger(tm);
                        }
                    });
                    
                    const totalWaiting = this.teammates.filter(t => t.recruited && !t.downed && !t.inCar).length;
                    if (totalWaiting > 0) {
                        showMessage("VEHICLE FULL. SOME FOLLOWERS LEFT BEHIND.");
                    }
                    
                    // Cat rides along (doesn't take a seat)
                    if (this.velvetCat && this.questState.hasVelvetCat) this.velvetCat.inCar = true;
                }
            }
            
            // Inside GameEngine class
            toggleAutoDrive() {
                if (!this.car || !this.isDriving) return;
                
                if (this.car.controlMode === 'AI') {
                    // Switch back to manual control
                    this.car.disableAutoDrive();
                    this.car.clearNavWaypoints();
                    this.autodriveBtn.classList.remove('engaged');
                    showMessage("AUTO-DRIVE DISENGAGED");
                    audioSys.sfx('ui');
                } else {
                    // Require a navigation destination before engaging
                    if (!this.navDestination) {
                        showMessage("SET A DESTINATION FIRST (USE MAP PIN)");
                        audioSys.sfx('ui');
                        return;
                    }
                    
                    // Try to enable auto-drive
                    const success = this.car.enableAutoDrive(this.traffic.network, this.activeMap.walls);
                    
                    if (success) {
                        this.autodriveBtn.classList.add('engaged');
                        
                        // Snap destination to nearest road point for reliable autodrive arrival
                        let driveTarget = this.navDestination;
                        if (this.traffic && this.traffic.network) {
                            const roadPt = this.traffic.network.findNearestRoadPoint(
                                this.navDestination.x, this.navDestination.y
                            );
                            if (roadPt && roadPt.distance < 300) {
                                driveTarget = { x: roadPt.x, y: roadPt.y };
                            }
                        }
                        this.navDestination = driveTarget;
                        this.car.navDestination = driveTarget;
                        
                        if (this.ui) {
                            // Use car's current position as path origin
                            const savedPX = this.player.x, savedPY = this.player.y;
                            this.player.x = this.car.x;
                            this.player.y = this.car.y;
                            this.ui.calculateNavPath();
                            this.player.x = savedPX;
                            this.player.y = savedPY;
                            if (this.ui.navPath && this.ui.navPath.length > 1) {
                                this.car.setNavWaypoints(this.ui.navPath.slice(1));
                            }
                        }
                        showMessage("AUTO-DRIVE: FOLLOWING NAVIGATION");
                        audioSys.sfx('ui');
                    } else {
                        showMessage("AUTO-DRIVE FAILED - ROAD BLOCKED OR TOO FAR");
                    }
                }
            }
            
            // Check if player has reached navigation destination
            checkNavArrival() {
                if (!this.navDestination) return;
                
                const dist = Math.hypot(
                    this.player.x - this.navDestination.x,
                    this.player.y - this.navDestination.y
                );
                
                if (dist < this.navCheckDistance) {
                    // Arrived at destination
                    showMessage("DESTINATION REACHED");
                    audioSys.sfx('ui');
                    
                    // Clear navigation
                    this.navDestination = null;
                    if (this.car) {
                        this.car.navDestination = null;
                        this.car.clearNavWaypoints(); // Clear waypoints too
                    }
                    
                    // Clear UI markers
                    if (this.ui) {
                        this.ui.navMarker = null;
                        this.ui.navPath = [];
                        this.ui.roadLevelPath = [];
                    }
                    
                    // Disable autodrive if it was following nav
                    if (this.isDriving && this.car && this.car.controlMode === 'AI') {
                        this.car.disableAutoDrive();
                        this.autodriveBtn.classList.remove('engaged');
                    }
                }
            }
            
            hijackVehicle(target) {
                // 1. Handle returning to owned car
                if (target === this.ownedCar) {
                    showMessage(`WELCOME BACK TO LADY BLACKMARK V1. YOUR RIDE.`);
                    
                    // Smoothly fade out the marker
                    this.ownedCar.markerTargetOpacity = 0;
                    
                    // If we are leaving a hijacked car to get into owned car, save the hijacked car
                    if (this.car && this.car !== this.ownedCar && this.car.visible) {
                         this.car.controlMode = 'PARKED'; // Traffic cars stop instantly to save physics calc
                         this.car.driverType = null;
                         this.car.hasDriver = false;
                         // PUSH BACK TO TRAFFIC SYSTEM so it stays physical
                         this.traffic.vehicles.push(this.car);
                    }
                    
                    this.car = this.ownedCar;
                    this.toggleVehicle();
                    return;
                }
                
                // 2. Handle abandoning current car
                const oldCar = this.car;
                if (oldCar && oldCar.visible) {
                    oldCar.driverType = null;
                    oldCar.hasDriver = false;
                    
                    // If it's the Owned Car, keep it special
                    if (oldCar.isOwnedCar) {
                        // FIX: Do NOT set to 'PARKED'. Set to 'PLAYER' so it coasts using updateManualDriving physics.
                        oldCar.controlMode = 'PLAYER'; 
                        
                        // Show "YOUR CAR" marker
                        oldCar.markerTargetOpacity = 1.0; 
                    } 
                    // If it's a stolen car, give it back to the Traffic Manager
                    else {
                        // Generic cars get parked instantly to prevent runaway physics on non-critical entities
                        oldCar.controlMode = 'PARKED';
                        
                        // Check if it's already in the list to avoid duplicates
                        if (!this.traffic.vehicles.includes(oldCar)) {
                            this.traffic.vehicles.push(oldCar);
                        }
                    }
                }
                
                // 3. Take control of new target
                target.controlMode = 'PLAYER';
                target.driverType = 'player';
                target.hasDriver = true;
                this.car = target;
                
                // Set map bounds for boundary clamping
                this.car._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };
                
                // Remove new target from traffic list (so AI doesn't control it)
                const idx = this.traffic.vehicles.indexOf(target);
                if (idx > -1) this.traffic.vehicles.splice(idx, 1);
                
                // If hijacking the delivery vehicle, clear its persistent slot
                // (a new one will spawn at the cafe when player returns)
                if (target.isDeliveryVehicle) {
                    this.deliveryVehicle = null; // Clear persistent ref so a new one spawns
                    showMessage(`AMBER DELIVERY VEHICLE — DRIVE CAREFULLY.`);
                }
                // Zib hijack — remove from taxi system, player takes full control
                else if (target.isZib) {
                    target.isZib = false;
                    target.driverType = 'player';
                    const zibIdx = this.zibSystem.activeZibs.indexOf(target);
                    if (zibIdx > -1) this.zibSystem.activeZibs.splice(zibIdx, 1);
                    showMessage(`ZIB TAXI HIJACKED. IT'S YOURS NOW.`);
                }
                // 4. Eject Driver Logic
                else if (target.driverType === 'ganger' || (target.brand === 'Gelfash' && Math.random() < 0.2)) {
                    let ganger = new Ganger(this.car.x - 30, this.car.y + 30);
                    this.enemies.push(ganger);
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED! DRIVER HOSTILE!`);
                } else {
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED.`);
                }
            
                // 5. Enter
                this.toggleVehicle();
            }

            checkRectCollision(cx, cy, cw, ch, angle, walls) {
                const cos = Math.cos(angle); const sin = Math.sin(angle); const hw = cw / 2; const hh = ch / 2;
                const corners = [ { x: cx + (hw * cos - hh * sin), y: cy + (hw * sin + hh * cos) }, { x: cx + (hw * cos + hh * sin), y: cy + (hw * sin - hh * cos) }, { x: cx + (-hw * cos + hh * sin), y: cy + (-hw * sin - hh * cos) }, { x: cx + (-hw * cos - hh * sin), y: cy + (-hw * sin + hh * cos) } ];
                for (let w of walls) { if (cx + cw < w.x || cx - cw > w.x + w.w || cy + ch < w.y || cy - ch > w.y + w.h) continue; for(let p of corners) { if(p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h) return true; } } return false;
            }
            
            // Raycast check for Light Occlusion (Shadows)
            checkLineOfSight(x1, y1, x2, y2) {
                return !isLineBlocked(x1, y1, x2, y2, this.activeMap.walls, getColliders(this.activeMap));
            }
            
            calculatePlayerVisibility() {
                // 1. BASE: Start with Ambient Light Level (World Darkness)
                // Outdoors (Day): Ambient 0 -> Visibility 1.0
                // Indoors (Dark): Ambient 0.95 -> 1.0 - (0.95 * 1.3) = -0.235 (Clamped to 0.0)
                let visibility = 1.0 - (this.getAmbientDarkness() * 1.3);
                
                // 2. STATIC LIGHTS (Lamps)
                for (let lamp of this.lamps) {
                    // Skip lamps in rooms with lights switched off
                    if (this.roomSystem.isLampRoomDark(lamp)) continue;
                    
                    const dist = Math.hypot(this.player.x - lamp.x, this.player.y - lamp.y);
                    if (dist < lamp.radius) {
                        // Shadow Check (Raycast)
                        const lampY = (lamp.type === 4 || lamp.type === 3) ? lamp.y : lamp.y - 60;
                        if (this.checkLineOfSight(this.player.x, this.player.y, lamp.x, lampY)) {
                            // Intensity fades over distance
                            const intensity = (1.0 - (dist / lamp.radius));
                            visibility += intensity * 0.8; 
                        }
                    }
                }

                // --- PROPS (Vending Machines & Medbays) - Dynamic Visibility ---
                for (let prop of this.props) {
                    if (prop.interactionType === 'medbay_refill' || prop.interactionType === 'vending_machine') {
                        const center = prop.getCenter();
                        const px = center.x;
                        const py = center.y;
                        
                        // 1. Calculate Dynamic State (stable seed so animation doesn't jump when pushed)
                        const time = Date.now();
                        const offset = (prop.id || 0) * 1337;
                        const isMedbay = prop.interactionType === 'medbay_refill';
                        
                        let intensityMod = 1.0;
                        let radiusMod = 1.0;

                        if (isMedbay) {
                            // Medbay Pulse
                            const breath = Math.sin((time + offset) / 400); 
                            intensityMod = 0.9 + (breath * 0.2); 
                            radiusMod = 1.0 + (breath * 0.05);
                        } else {
                            // Vending Glitch
                            // NOTE: Since calculatePlayerVisibility runs every frame, 
                            // Math.random() might make the UI jittery if the glitch isn't sustained.
                            // For gameplay stability, we only apply the "Hum" here, or use a time-based flicker.
                            // Let's use the 'Hum' for mechanic stability so the stealth meter doesn't seize up.
                            const hum = Math.sin((time + offset) / 50);
                            intensityMod = 1.0 + hum * 0.05; 
                            
                            // Optional: If you want the glitch to save you, uncomment below, 
                            // but be warned the UI bar might flash rapidly.
                        }

                        // 2. Determine Range & Line of Sight
                        // Dynamic range based on the pulse
                        const currentLightRadius = 160 * radiusMod; 

                        const dist = Math.hypot(this.player.x - px, this.player.y - py);
                        
                        if (dist < currentLightRadius) {
                            if (this.checkLineOfSight(this.player.x, this.player.y, px, py)) {
                                // Calculate base intensity from distance
                                let lightLevel = (1.0 - (dist / currentLightRadius));
                                
                                // Apply the Dynamic Pulse Modifier
                                lightLevel *= intensityMod;
                                
                                // Add to total visibility (Weight 0.6)
                                visibility += lightLevel * 0.6; 
                            }
                        }
                    }
                }
            
                // 3. DYNAMIC LIGHT BONUSES
            
                // Muzzle Flashes (High Intensity, Instant)
                for (let flash of this.muzzleFlashes) {
                    const dist = Math.hypot(this.player.x - flash.x, this.player.y - flash.y);
                    if (dist < flash.radius) {
                        const intensity = (1.0 - (dist / flash.radius));
                        visibility += intensity * 1.0; 
                    }
                }
            
                // Projectiles (Glowing Bullets/Magic)
                for (let proj of this.projectiles) {
                    const dist = Math.hypot(this.player.x - proj.x, this.player.y - proj.y);
                    // Visual radius is roughly 30px for glow
                    const glowRadius = 40; 
                    if (dist < glowRadius) {
                        const intensity = (1.0 - (dist / glowRadius));
                        visibility += intensity * 0.6; 
                    }
                }
            
                // Car Headlights (Cone Check)
                if (this.car && this.car.visible && !this.isDriving) {
                    const dx = this.player.x - this.car.x;
                    const dy = this.player.y - this.car.y;
                    const cos = Math.cos(-this.car.angle);
                    const sin = Math.sin(-this.car.angle);
                    
                    const localX = dx * cos - dy * sin; // Forward distance
                    const localY = dx * sin + dy * cos; // Sideways distance
            
                    // Headlight range is ~400px, Width expands outwards
                    if (localX > 0 && localX < 400) {
                        const coneWidthAtDist = localX * 0.4; 
                        if (Math.abs(localY) < coneWidthAtDist) {
                             if (this.checkLineOfSight(this.player.x, this.player.y, this.car.x, this.car.y)) {
                                 const intensity = (1.0 - (localX / 400));
                                 visibility += intensity * 0.9;
                             }
                        }
                    }
                }
            
                // 4. CLAMP & UI UPDATE
                this.player.visibility = Math.min(1.0, Math.max(0.0, visibility));
                
                // Calculate percentage (100% Hidden = 0% Visible)
                const hiddenPercent = Math.round((1.0 - this.player.visibility) * 100);
                
                // Target the NEW stealth indicator
                const stealthUI = document.getElementById('ui-stealth-indicator');
                
                // Threshold: If visibility is below 30%, you are considered Hidden
                if (this.player.visibility < 0.30) {
                    stealthUI.style.display = 'block';
                    stealthUI.textContent = `HIDDEN (${hiddenPercent}%)`;
                    this.player.isHidden = true;
                } else {
                    stealthUI.style.display = 'none';
                    this.player.isHidden = false;
                }

                // Clean up the OLD buff UI if it was showing hidden status previously
                const buffUI = document.getElementById('ui-buffs');
                if (buffUI.textContent.includes('HIDDEN')) {
                    buffUI.style.display = 'none';
                }
            }

            checkPlayerCarCollision(px, py) {
                if (!this.car.visible) return false;
                const dx = px - this.car.x; const dy = py - this.car.y; const cos = Math.cos(-this.car.angle); const sin = Math.sin(-this.car.angle);
                const localX = dx * cos - dy * sin; const localY = dx * sin + dy * cos; const halfLen = this.car.length / 2 + 15; const halfWid = this.car.width / 2 + 15;
                if (Math.abs(localX) < halfLen && Math.abs(localY) < halfWid) return true; return false;
            }

            updateTime(force = false) {
                // Counted in sim ticks (not wall-clock) so the clock follows
                // CONFIG.LOOP.GAME_SPEED along with everything else.
                this._clockTicks = (this._clockTicks || 0) + 1;
                if (force || this._clockTicks >= CONFIG.LOOP.TICKS_PER_WORLD_MINUTE) { 
                    this._clockTicks = 0;
                    this.worldMinutes++; this.lastTimeTick = Date.now(); 
                    // worldMinutes is MONOTONIC — it counts up forever. Day-of-cycle
                    // values are derived via `% 1440` at the read site (display,
                    // ambient darkness, window lit-state). Wrapping here would
                    // silently break any timer stored as `worldMinutes + duration`
                    // — e.g. buffs activated at 23:30 with a 60-min duration set
                    // endTime = 1470, then the clock would snap to 0 and the
                    // comparison `worldMinutes >= endTime` becomes false forever,
                    // making the buff (and contract hires) effectively permanent.
                    let h = Math.floor(this.worldMinutes / 60) % 24; let m = this.worldMinutes % 60; 
                    this.uiTime.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; 
                    
                    this.updateDaytimeExposure();
                    
                    // Tick all active buffs — config-driven expiry + lifecycle hooks
                    this.player.buffSystem.tick(this.worldMinutes, this);
                    
                    // Advance the weather schedule. Ticked per world-minute rather
                    // than per-frame so condition durations are written in the same
                    // units as the game clock, and so the cost is once per 2s
                    // instead of 60x/sec.
                    this.weather.tickSchedule(this.worldMinutes);
                    
                    // Check contract companion expiration (unified)
                    for (let i = this.teammates.length - 1; i >= 0; i--) {
                        const tm = this.teammates[i];
                        if (tm.hireType === 'contract' && tm.hired && this.worldMinutes >= tm.hireTime) {
                            showMessage(`${tm.name.toUpperCase()}'S TIME IS UP.`);
                            this.dismissCompanion(tm);
                        }
                    }
                }
            }
            
            getAmbientDarkness() {
                // Per-map override (e.g. well-lit interiors like arenas)
                if (this.activeMap.ambientDarkness !== undefined) return this.activeMap.ambientDarkness;
                // CHANGE: If indoor, return high darkness (0.95) instead of 0
                if (this.activeMap.type === 'indoor') return 0.95; 
                
                // --- Existing Outdoor Logic ---
                // worldMinutes is monotonic (counts up forever) — derive
                // hour-of-day with % 1440 so day 2+ still cycles correctly.
                const time = (this.worldMinutes % 1440) / 60;
                const maxDarkness = 0.6; 
            
                // DAWN (5:00 to 6:00)
                if (time >= 5 && time < 6) {
                    const progress = time - 5; 
                    return maxDarkness - (progress * maxDarkness);
                }
            
                // DAY (6:00 to 18:00)
                if (time >= 6 && time < 18) {
                    return 0;
                }
            
                // DUSK (18:00 to 20:00)
                if (time >= 18 && time < 20) {
                    const progress = (time - 18) / 2; 
                    return progress * maxDarkness;
                }
            
                // NIGHT (20:00 to 5:00)
                return maxDarkness;
            }
            
            /* --- ADD TO GameEngine CLASS --- */
            
            /**
             * Get landmark coordinates by ID.
             * Checks in order:
             * 1. Dynamic entities (player, boss)
             * 2. Current map's landmark registry (populated during loadMap)
             * 3. Fallback to player position
             * 
             * @param {string} id - Landmark identifier (e.g., 'club_entrance', 'apt_door')
             * @returns {{ x: number, y: number }} World coordinates
             */
            getLandmark(id) {
                // 1. Dynamic Entities (Moving targets)
                if (id === 'player') return { x: this.player.x, y: this.player.y };
                if (id === 'player_car' || id === 'blackmark') return this.ownedCar ? { x: this.ownedCar.x, y: this.ownedCar.y } : { x: this.player.x, y: this.player.y };
                if (id === 'boss') return this.boss ? { x: this.boss.x, y: this.boss.y } : null;
                
                // 2. Check the landmark registry (populated by loadMap)
                if (this.landmarkRegistry[id]) {
                    return this.landmarkRegistry[id];
                }
                
                // 3. Fallback - warn and return player position
                console.warn(`Landmark ID not found: '${id}' - Available: [${Object.keys(this.landmarkRegistry).join(', ')}]`);
                return { x: this.player.x, y: this.player.y };
            }
            
            /**
             * Debug helper - call game.debugLandmarks() in console to see all registered landmarks
             */
            debugLandmarks() {
                console.log('=== LANDMARK REGISTRY ===');
                console.log(`Map: ${this.activeMap?.id || 'none'}`);
                console.log(`Total landmarks: ${Object.keys(this.landmarkRegistry).length}`);
                for (const [id, pos] of Object.entries(this.landmarkRegistry)) {
                    console.log(`  ${id}: (${pos.x}, ${pos.y})`);
                }
                return this.landmarkRegistry;
            }

            /* =====================================================================
               MAIN GAME LOOP (UPDATE)
               ---------------------------------------------------------------------
               Handles all logic updates for the current frame.
               Instrumented with Profiler to track performance bottlenecks.
               ===================================================================== */
            update() {
                if (!this.running || this.paused) return;
                
                // Gait clock — advances only when the world actually steps, so
                // walk animation freezes with everything else while paused.
                _simTick++;
                
                // Pausable systems — must tick before any logic that might
                // schedule new timers or read playerEmote state.
                this._tickPausableTimers();
                this.tickPlayerEmote();
                
                // PERFORMANCE: Use globally cached frame time (set once in loop())
                this.frameTime = _frameTime;
                this.frameTimeSec = _frameTimeSec;
            
                // --- 1. SYSTEM UPDATES ---
                /* Simulation step counter — drives subsystem decimation (CONFIG.SIM).
                   Increments once per fixed 1/60s step, NOT per rendered frame,
                   so decimation intervals mean the same thing on every device. */
                this.simStep = (this.simStep + 1) | 0;

                this.profiler.start('Update:Total');
                this.profiler.markWrapper('Update:Total');
                this.profiler.start('Logic:Systems');
                
                // Cleanup old muzzle flashes
                for(let i=this.muzzleFlashes.length-1; i>=0; i--) {
                    this.muzzleFlashes[i].life--;
                    if(this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
                }
            
                this.updateTime();
                this.updateUI();
                this.weather.update(this.camera);
                if (this.puddles) this.puddles.update();
                if (this.leafParticles) this.leafParticles.update();
                
                // Indoor V2: Room system update + per-room weather
                if (this.roomSystem.active) {
                    this.roomSystem.update(this.player.x, this.player.y);
                    
                    // Per-room rain: suppress weather under a roof, restore outdoors.
                    // This sets a SEPARATE flag rather than writing isRaining —
                    // the scheduler owns that now, and two systems assigning the
                    // same bool every frame would just overwrite each other.
                    // Stepping inside hides the rain; the storm keeps running.
                    this.weather.setIndoorSuppressed(
                        this.activeMap.type === 'indoor' && !this.roomSystem.isPlayerOutdoor()
                    );
                }
                
                // Owned car marker fade logic
                if (this.ownedCar) {
                    const fadeSpeed = 0.05;
                    this.ownedCar.markerOpacity += (this.ownedCar.markerTargetOpacity - this.ownedCar.markerOpacity) * fadeSpeed;
                }
                
                // Check if player reached navigation destination
                this.checkNavArrival();
            
                // --- CAMERA SHAKE & DRIFT FX ---
                // 1. Reset or Apply Explosion Shake (Random Jitter)
                if (this.camera.shake > 0) {
                    this.camera.shakeX = (Math.random() - 0.5) * this.camera.shake * 2;
                    this.camera.shakeY = (Math.random() - 0.5) * this.camera.shake * 2;
                    this.camera.shake *= 0.9; // Decay
                    if (this.camera.shake < 0.5) { this.camera.shake = 0; }
                } else {
                    this.camera.shakeX = 0;
                    this.camera.shakeY = 0;
                }
            
                // 2. Add Drift "Wobble" (Smooth Sine Wave)
                if (this.isDriving && this.car) {
                    // Calculate lateral velocity (How fast are we sliding sideways?)
                    const rightX = -Math.sin(this.car.angle);
                    const rightY = Math.cos(this.car.angle);
                    const slideVelocity = this.car.vx * rightX + this.car.vy * rightY;
                    const driftIntensity = Math.abs(slideVelocity);
            
                    // Threshold: Only shake if drifting noticeably (speed > 2.0)
                    if (driftIntensity > 1.0) {
                        // Initialize wave timer if needed
                        if (this.camera.driftTime === undefined) this.camera.driftTime = 0;
                        
                        // Advance the wave (0.2 = frequency/speed of the wobble)
                        this.camera.driftTime += 2.0; 
            
                        // Calculate Amplitude: Scales with drift intensity
                        // (driftIntensity - 2.0) ensures it starts at 0 when threshold is hit
                        const waveAmp = (driftIntensity - 1.0) * 1.5; 
            
                        // Apply Sine/Cosine offsets to existing shake
                        // Using different multipliers (1.0 vs 0.8) prevents a perfect circle motion
                        this.camera.shakeX += Math.sin(this.camera.driftTime) * waveAmp;
                        this.camera.shakeY += Math.cos(this.camera.driftTime * 0.8) * waveAmp;
                    }
                }
            
                // Ability & Regen Timers
                // Flit Attunement recharge
                if (this.flitState.attunement < this.flitState.maxAttunement) {
                    this.flitState.attunement = Math.min(
                        this.flitState.attunement + this.flitState.rechargeRate,
                        this.flitState.maxAttunement
                    );
                    // Calculate effective cost for button state
                    let cost = this.flitState.dashCost;
                    if (this.augments && this.augments.isEquipped('flit_ext')) cost = Math.floor(cost * 0.7);
                    cost = Math.floor(this.player.buffSystem.getStat('flitCooldown', cost));
                    if (this.flitState.attunement >= cost) this.flitBtn.classList.remove('cooldown');
                }
                if (this.flitState.active) { 
                    this.flitState.duration--; 
                    if (this.flitState.duration <= 0) this.flitState.active = false; 
                }
                // Update flit visual effects (ghost afterimages, lightning trails)
                if (this.flitVFX.length > 0) this.updateFlitVFX();
                
                // Passive Health Regen (5 HP/sec after 10s no damage)
                if (this.playerHealth < this.maxPlayerHealth) {
                    this.healthRegenTimer++;
                    if (this.healthRegenTimer >= 600 && (this.healthRegenTimer - 600) % 60 === 0) {
                        this.playerHealth = Math.min(this.playerHealth + 5, this.maxPlayerHealth);
                        this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);  // Sync with entity
                    }
                } else {
                    this.healthRegenTimer = 0;
                }
                this.profiler.stop('Logic:Systems');
            
                // --- 2. AI & TRAFFIC ---
                this.profiler.start('AI:Traffic');
                this.traffic.update(this.player, this.activeMap, this.car, this.weather, this.ownedCar, this.decals, this.teammates);
                
                // Zib taxi system — spawn, arrival check, cleanup
                if (this.zibSystem && this.activeMap.type !== 'indoor') {
                    this.zibSystem.trySpawn(this.traffic);
                    this.zibSystem.tick(this);
                    this.zibSystem.cleanup();
                }
                // Add delivery vehicle to spatial grid (managed separately from traffic lifecycle)
                if (this.deliveryVehicle && this.deliveryVehicle.visible && this.traffic.grid) {
                    this.traffic.grid.add(this.deliveryVehicle);
                }
                this.profiler.stop('AI:Traffic');
                
                // --- PEDESTRIANS ---
                this.profiler.start('AI:Pedestrians');
                // Build the list of cars peds should react to. While the player
                // is driving, this.car is REMOVED from this.traffic.vehicles
                // (intentionally, so traffic AI doesn't try to drive around
                // itself). For the ped reaction system, we want it included —
                // otherwise peds phase through the player's car while
                // dodging every AI car around them. Concat is cheap; no
                // allocation when not driving.
                const reactionVehicles = (this.isDriving && this.car)
                    ? this.traffic.vehicles.concat(this.car)
                    : this.traffic.vehicles;
                this.pedestrians.update(this.player, this.activeMap, reactionVehicles, this.weaponMode !== 'none' && !this.weaponHolstered, this.enemies);
                this.profiler.stop('AI:Pedestrians');
                
                // Velvet Cat AI
                if (this.velvetCat && this.velvetCat.visible && !this.velvetCat.inCar) {
                    if (this.questState.hasVelvetCat) {
                        this.velvetCat.update(this.player, 1);
                    }
                }
            
                this.profiler.start('Logic:Stealth');
                // Visibility is a solve over lights and occluders whose result
                // changes slowly. Skipped steps keep the previous value.
                if (this.simDue(CONFIG.SIM.STEALTH_INTERVAL)) {
                    this.calculatePlayerVisibility();
                }
                this.profiler.stop('Logic:Stealth');
            
                this.profiler.start('Logic:Story');
                this.cutscene.update();
                this.story.update();
                this.profiler.stop('Logic:Story');
                
                // Larissa loadout hint — triggers when approaching apt exit for the first time
                if (!this.questState.larissa_loadout_hint && this.activeMap && this.activeMap.id === 'apt_949'
                    && this.player.y > 780 && this.player.x > 500 && this.player.x < 900
                    && this.story && !this.cutscene.active) {
                    this.questState.larissa_loadout_hint = true;
                    this.story.triggerComms("LARISSA", "Your loadout is on the wall, 949. Equip before you leave. Pause if you need the full inventory.", 6000);
                }
                
                // --- 1. WEAPON COOLDOWN & FIRING ---
                // Decrement the timer every frame
                if (this.shootCooldown > 0) this.shootCooldown--;
            
                // Aimed firing (the fire joystick, or the mouse once it has a position)
                // happens in the walking/driving code in step 7, after this tick's aim
                // angle is set. Only fire here for input those branches don't handle
                // (bumper minigame, or a mouse press before the mouse has moved).
                if (this.shootCooldown <= 0 && !this.paused && (this.mouseDown || this.fireJoystick.active)) {
                    const aimedBelow = !(this.bumperMinigame && this.bumperMinigame.active)
                        && (this.fireJoystick.active || (this.mouseDown && this.mouseX));
                    if (!aimedBelow) this.fireWeapon();
                }
            
                // --- 3. GAME EVENTS (SPAWNING & TRIGGERS) ---
                this.profiler.start('Logic:Events');
                
                // Ganger Spawning (Hub Only)
                if (this.activeMap.id === 'hub_949' && this.enemies.length < 6 && Math.random() < 0.02) {
                    const ex = Math.random() * this.activeMap.width;
                    const ey = Math.random() * this.activeMap.height;
                    let hitObstacle = false;
                    
                    // Safety check to ensure they don't spawn in walls
                    for(let w of this.activeMap.walls) { 
                        if (ex > w.x - 20 && ex < w.x + w.w + 20 && ey > w.y - 20 && ey < w.y + w.h + 20) { hitObstacle = true; break; }
                    }
                    if (!hitObstacle) {
                        const spawnColliders = getColliders(this.activeMap);
                        if (spawnColliders) {
                            for(let b of spawnColliders) { 
                                if (ex > b.x - 20 && ex < b.x + b.w + 20 && ey > b.y - 20 && ey < b.y + b.h + 20) { hitObstacle = true; break; }
                            }
                        }
                    }
                    const d = Math.hypot(this.player.x - ex, this.player.y - ey);
                    // Exclude restricted zone bounds
                    if (!hitObstacle && this.restrictedZone) {
                        const rz = this.restrictedZone;
                        if (ex > rz.x && ex < rz.x + rz.w && ey > rz.y && ey < rz.y + rz.h) hitObstacle = true;
                    }
                    if (!hitObstacle && d > 600 && d < 1200) { 
                        this.enemies.push(new Ganger(ex, ey)); 
                        captionSystem.gangerAggro();
                    }
                }
            
                // Graveyard Humanoid Ghosts (Cemetery: x 500-3500, y 8800-10800)
                const inGraveyard = this.activeMap.id === 'hub_949' && 
                    this.player.x > 400 && this.player.x < 3600 && 
                    this.player.y > 8600 && this.player.y < 11000;
                if (inGraveyard) {
                    // Spawn new ghosts periodically (max 5 at once)
                    if (this.graveyardGhosts.length < 15 && Math.random() < 0.02) {
                        const GHOST_HAIR = ['long', 'short', 'afro', 'curls', 'braids', 'dreadlocks', 'ponytail'];
                        const GHOST_SKINS = ['#8ec8d8', '#7ab0c8', '#9dd4e0', '#a0d0e8', '#6ea8c0'];
                        const hairType = GHOST_HAIR[Math.floor(Math.random() * GHOST_HAIR.length)];
                        const skinColor = GHOST_SKINS[Math.floor(Math.random() * GHOST_SKINS.length)];
                        const gender = Math.random() < 0.5 ? 'male' : 'female';
                        const gx = 600 + Math.random() * 2800;
                        const gy = 8900 + Math.random() * 1800;
                        // Pick a random wander target inside graveyard
                        const tx = 600 + Math.random() * 2800;
                        const ty = 8900 + Math.random() * 1800;
                        this.graveyardGhosts.push({
                            x: gx, y: gy,
                            targetX: tx, targetY: ty,
                            angle: Math.atan2(ty - gy, tx - gx),
                            walkPhase: Math.random() * Math.PI * 2,
                            speed: 0.3 + Math.random() * 0.4,
                            // Lifecycle: fade in → wander → fade out
                            life: 0,        // 0→1 fade in, hold, then decay to 0
                            phase: 'in',    // 'in', 'wander', 'out'
                            fadeSpeed: 0.005 + Math.random() * 0.005,
                            wanderTimer: 300 + Math.floor(Math.random() * 400), // frames to wander
                            // Appearance
                            skinColor,
                            hair: { type: hairType, color: '#c0e8ff' },
                            gender,
                            topColor: '#90c0d8',
                            bottomColor: '#7aaccc',
                            shoeColor: '#6898b8'
                        });
                    }

                    // Update graveyard ghosts
                    for (let i = this.graveyardGhosts.length - 1; i >= 0; i--) {
                        const g = this.graveyardGhosts[i];

                        if (g.phase === 'in') {
                            g.life += g.fadeSpeed * 2;
                            if (g.life >= 0.7) { g.life = 0.7; g.phase = 'wander'; }
                        } else if (g.phase === 'wander') {
                            g.wanderTimer--;
                            // Walk toward target
                            const dx = g.targetX - g.x;
                            const dy = g.targetY - g.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist > 5) {
                                g.angle = Math.atan2(dy, dx);
                                gaitCommand(g, Math.cos(g.angle) * g.speed, Math.sin(g.angle) * g.speed);
                                g.x += Math.cos(g.angle) * g.speed;
                                g.y += Math.sin(g.angle) * g.speed;
                            } else {
                                // Pick new target
                                g.targetX = 600 + Math.random() * 2800;
                                g.targetY = 8900 + Math.random() * 1800;
                            }
                            if (g.wanderTimer <= 0) g.phase = 'out';
                        } else if (g.phase === 'out') {
                            g.life -= g.fadeSpeed;
                            if (g.life <= 0) {
                                this.graveyardGhosts.splice(i, 1);
                                continue;
                            }
                        }
                    }
                } else {
                    // Clear ghosts when leaving the area
                    if (this.graveyardGhosts.length > 0) this.graveyardGhosts = [];
                }
                
                // Boss Logic (Church Lightning)
                if (this.activeMap.id === 'church_boss' && this.weather.isRaining && !this.questState.churchBossDefeated) {
                    if (this.weather.lightningCooldown <= 0) {
                        this.weather.triggerLightning();
                        this.triggerShake(8);
                        setTimeout(() => audioSys.sfx('explode'), 50);
                    }
                }
            
                // Veranda Rain Trigger — hotel_suite has no room system, so the
                // balcony is a hardcoded rect. Toggles SUPPRESSION rather than
                // isRaining: stepping outside reveals whatever the sky is
                // actually doing, instead of forcing rain on a clear night.
                if (this.activeMap.id === 'hotel_suite') {
                    const onVeranda = this.player.x > 800 && this.player.x < 1300 && this.player.y > 800 && this.player.y < 1000;
                    this.weather.setIndoorSuppressed(!onVeranda);
                    if (onVeranda && !this.verandaRainTriggered) {
                        // Only announce it if there's actually weather out there
                        if (this.weather.intensity > 0.1) showMessage("RAIN BEGINS TO FALL...");
                        this.verandaRainTriggered = true;
                    } else if (!onVeranda) {
                        this.verandaRainTriggered = false;
                    }
                }
                // Restricted Zone (Hostile farming area)
                if (this.restrictedZone) {
                    this.restrictedZone.update(this);
                    // Update location label when inside zone
                    if (this.activeMap.id === 'hub_949') {
                        const rz = this.restrictedZone;
                        const inside = rz._playerInside(this);
                        if (inside && !rz._labelShown) {
                            rz._labelShown = true;
                            this.uiLocation.textContent = rz.name;
                            this.uiLocation.style.color = '#ff4422';
                        } else if (!inside && rz._labelShown) {
                            rz._labelShown = false;
                            this.uiLocation.textContent = this.activeMap.label;
                            this.uiLocation.style.color = '#fff';
                        }
                    }
                }
                
                // Horde Gauntlet (Wave-based arena)
                if (this.hordeGauntlet) {
                    this.hordeGauntlet.update(this);
                }
                
                this.profiler.stop('Logic:Events');
            
                // --- 4. INPUT HANDLING ---
                this.profiler.start('Input:Process');
                let inputX = 0; let inputY = 0;
                if (this.keys['w'] || this.keys['ArrowUp']) inputY = -1; 
                if (this.keys['s'] || this.keys['ArrowDown']) inputY = 1; 
                if (this.keys['a'] || this.keys['ArrowLeft']) inputX = -1; 
                if (this.keys['d'] || this.keys['ArrowRight']) inputX = 1;
                if (this.joystick.active) { inputX = this.joystick.dx; inputY = this.joystick.dy; }
                this.profiler.stop('Input:Process');
            
                // --- 5. ENTITY UPDATES ---
                this.profiler.start('AI:Enemies');
                
                // Ferris wheel animation
                if (this.activeMap.ferrisWheel) this.activeMap.ferrisWheel.update();
                
                // Teammates & Companions (Unified loop)
                // Skip during bumper car minigame — teammates are in bumper cars
                if (!(this.bumperMinigame && this.bumperMinigame.active)) {

                // ── FORMATION SLOTS ──
                // Build the active list and assign each member a stable slot around
                // the player. Slots are evenly spaced on a circle of FORMATION_RADIUS.
                // The ring rotates with the player's facing so companions stay behind/
                // beside, never blocking the forward arc. This single pass replaces the
                // old "everyone follow player + push apart" tug-of-war that caused the
                // wiggle/jostle. With slots, each companion has a unique stable target.
                const activeFormation = this.teammates.filter(
                    t => t.recruited && !t.downed && !t.inCar
                );
                const formationN = activeFormation.length;
                const formationRadius = CONFIG.COMPANION.FORMATION_RADIUS;
                const baseAngle = CONFIG.COMPANION.FORMATION_FOLLOW_FACING
                    ? (this.player.angle + Math.PI)  // +π = behind player
                    : 0;
                // Distribute slots around a 240° arc behind the player when N>1, so
                // they spread to the rear and sides without crowding directly in front.
                // For N=1 we just place the single companion directly behind.
                const arc = formationN <= 1 ? 0 : (Math.PI * 4 / 3); // 240°
                activeFormation.forEach((tm, i) => {
                    const t = formationN <= 1 ? 0.5 : i / (formationN - 1);
                    const angle = baseAngle + (t - 0.5) * arc;
                    tm._formationSlot = {
                        x: this.player.x + Math.cos(angle) * formationRadius,
                        y: this.player.y + Math.sin(angle) * formationRadius
                    };
                });

                this.teammates.forEach(tm => {
                    if (!tm.recruited || tm.downed) return;
                    const processShot = (shot) => {
                        if (!shot) return;
                        const abilityDef = tm.equippedAbilityId ? ABILITY_REGISTRY[tm.equippedAbilityId] : null;
                        const weaponDef = tm.equippedWeaponId ? ITEM_REGISTRY[tm.equippedWeaponId] : null;
                        const flashColor = (weaponDef?.stats?.projectileColor) || (abilityDef?.stats?.flashColor) || shot.color || '#ffaa00';
                        const flashRadius = (weaponDef?.stats?.flashRadius) || (abilityDef?.stats?.flashRadius) || 40;
                        this.projectiles.push(shot);
                        this.muzzleFlashes.push({ x: shot.x, y: shot.y, radius: flashRadius, color: flashColor, life: 3 });
                        if (tm.hireType === 'permanent') captionSystem.teammateCombatQuip(tm.name);
                        else captionSystem.dancerFollowQuip(tm.name);
                    };

                    // ── VEHICLE COMBAT (all companion types) ──
                    if (tm.inCar && this.isDriving && tm.seatIndex >= 1) {
                        processShot(tm.updateVehicleCombat(this.car, this.enemies, this));
                        return;
                    }
                    if (tm.inCar) return;

                    // ── SAFETY-NET SEPARATION (gentle bump, not the old shove) ──
                    // Slot assignment already keeps companions apart; this fires only
                    // when a teleport / map transition / knockback puts them on top of
                    // each other. Radii and forces are tuned to be barely perceptible.
                    let sepX = 0, sepY = 0;
                    for (let other of this.teammates) {
                        if (other === tm || other.inCar || !other.recruited || other.downed) continue;
                        const d = Math.hypot(tm.x - other.x, tm.y - other.y);
                        if (d < CONFIG.COMPANION.SEPARATION_RADIUS && d > 0.1) {
                            const pushAngle = Math.atan2(tm.y - other.y, tm.x - other.x);
                            sepX += Math.cos(pushAngle) * CONFIG.COMPANION.SEPARATION_FORCE;
                            sepY += Math.sin(pushAngle) * CONFIG.COMPANION.SEPARATION_FORCE;
                        }
                    }
                    const distToP = Math.hypot(tm.x - this.player.x, tm.y - this.player.y);
                    if (distToP < CONFIG.COMPANION.PLAYER_SEPARATION_RADIUS && distToP > 0.1) {
                        const pushAngle = Math.atan2(tm.y - this.player.y, tm.x - this.player.x);
                        sepX += Math.cos(pushAngle) * CONFIG.COMPANION.PLAYER_SEPARATION_FORCE;
                        sepY += Math.sin(pushAngle) * CONFIG.COMPANION.PLAYER_SEPARATION_FORCE;
                    }
                    tm.x += sepX;
                    tm.y += sepY;

                    // ── EYELINE TACTICS: a firing spot overrides the formation slot ──
                    const eyelineSpot = updateCompanionTactics(tm, this);

                    // ── ON FOOT: Permanent teammates use built-in follow via updateCombat ──
                    if (tm.hireType === 'permanent') {
                        processShot(tm.updateCombat(this.player.x, this.player.y, this.enemies, this, eyelineSpot || tm._formationSlot));
                        return;
                    }

                    // ── ON FOOT: Contract companions — slot-aware follow, then combat ──
                    if (tm.hireType === 'contract' && tm.hired) {
                        tm.update();

                        // Teleport recovery still uses player distance — if a contract
                        // companion is truly lost, snap them to the player rather than
                        // their slot (slot may also be far if they were left across map).
                        const dx = this.player.x - tm.x;
                        const dy = this.player.y - tm.y;
                        const distToPlayer = Math.hypot(dx, dy);
                        if (distToPlayer > CONFIG.COMPANION.FOLLOW_TELEPORT_DIST) {
                            tm.x = this.player.x + (Math.random() - 0.5) * 40;
                            tm.y = this.player.y + (Math.random() - 0.5) * 40;
                            resetHumanoidAnim(tm);
                        } else if (eyelineSpot) {
                            // Repositioning for a clear shot — nav-grid path to the spot
                            const C = CONFIG.COMPANION;
                            const dSpot = Math.hypot(eyelineSpot.x - tm.x, eyelineSpot.y - tm.y);
                            const topSpeed = dSpot > C.CATCHUP_DISTANCE ? C.CATCHUP_SPEED : (dSpot > C.MATCH_DISTANCE ? C.MATCH_SPEED : C.CONTRACT_SPEED);
                            companionNavStep(tm, eyelineSpot.x, eyelineSpot.y, topSpeed, this);
                        } else if (tm._formationSlot) {
                            // Soft arrival on slot via smartMove (which still does
                            // obstacle avoidance against walls/buildings). Adaptive
                            // speed mirrors the permanent-teammate path.
                            const slot = tm._formationSlot;
                            const dxSlot = slot.x - tm.x;
                            const dySlot = slot.y - tm.y;
                            const distSlot = Math.hypot(dxSlot, dySlot);
                            const C = CONFIG.COMPANION;
                            let topSpeed = C.CONTRACT_SPEED;  // cruise
                            if (distSlot > C.CATCHUP_DISTANCE) topSpeed = C.CATCHUP_SPEED;
                            else if (distSlot > C.MATCH_DISTANCE) topSpeed = C.MATCH_SPEED;
                            if (distSlot > C.FORMATION_DEADZONE) {
                                // smartMove uses its own internal stop-at-60 check, so
                                // for short approaches we step directly. This avoids
                                // the smartMove early-out fighting our soft-arrival.
                                if (distSlot > 60) {
                                    // Head for the next nav waypoint (the slot itself when the way is clear);
                                    // smartMove still handles traffic and small obstacles on the way
                                    const wp0 = navWaypoint(tm, slot.x, slot.y, this.activeMap);
                                    if (wp0.x !== slot.x || wp0.y !== slot.y) {
                                        // Blocked straight line: follow the nav path directly (smartMove's
                                        // wall feelers fight paths that hug corners, like gateways)
                                        companionNavStep(tm, slot.x, slot.y, topSpeed, this);
                                    } else {
                                        // Open ground: smartMove, which also dodges traffic
                                        const wp = detourAroundPlayer(tm, wp0.x, wp0.y, this.player);
                                        tm.smartMove(wp.x, wp.y, topSpeed, this.activeMap.walls, getColliders(this.activeMap), this.traffic.vehicles);
                                    }
                                } else {
                                    const step = Math.min(topSpeed, distSlot * C.FORMATION_ARRIVE_GAIN);
                                    gaitCommand(tm, (dxSlot / distSlot) * step, (dySlot / distSlot) * step);
                                    tm.x += (dxSlot / distSlot) * step;
                                    tm.y += (dySlot / distSlot) * step;
                                }
                            }
                        }

                        // Combat — uses unified updateCombat (reads weapon or ability).
                        // skipFollow=true: we already did slot-aware follow above, so
                        // updateCombat must not move us again (otherwise we'd move
                        // twice per frame and run circles around permanent teammates).
                        processShot(tm.updateCombat(this.player.x, this.player.y, this.enemies, this, tm._formationSlot, true));
                    }
                });
                } // end bumper minigame guard
                // Ghosts/Markers
                for (let i = this.lastKnownMarkers.length - 1; i >= 0; i--) {
                    this.lastKnownMarkers[i].update();
                    if (!this.lastKnownMarkers[i].active) this.lastKnownMarkers.splice(i, 1);
                }
            
                // Enemies (Gangers, Bosses)
                for(let i=this.enemies.length-1; i>=0; i--) {
                    let enemy = this.enemies[i];
                    let result = null;
                    
                    if (enemy instanceof Ganger) {
                        const trafficCars = this.traffic ? [...this.traffic.vehicles] : [];
                        if (this.isDriving && this.car) trafficCars.push(this.car);
                        result = enemy.update(this.player, this.activeMap.walls, getColliders(this.activeMap), this.lastKnownMarkers, trafficCars, this.activeMap, this.enemies);
                    } else if (enemy instanceof GatlingGunner) {
                        result = enemy.update(this.player.x, this.player.y, this.enemies, this.activeMap.walls);
                    } else {
                        result = enemy.update(this.player.x, this.player.y, this.activeMap.walls); 
                    }
                    
                    // Unified projectile collection — handles single shots, arrays, or null
                    if (result) {
                        const shots = Array.isArray(result) ? result : [result];
                        for (const shot of shots) {
                            if (shot instanceof ProjectileEntity) {
                                this.projectiles.push(shot);
                                this.muzzleFlashes.push({ x: shot.x, y: shot.y, radius: 50, color: shot.color, life: 3 });
                            }
                        }
                    }
                    
                    if (enemy.dead) { 
                        audioSys.sfx('explode'); 
                        this.weather.spawnExplosion(enemy.x, enemy.y, '#a469ff'); 
                        this.triggerShake(10); 
                        this.spawnLoot(enemy.x, enemy.y);
                        
                        // Bounty target killed — complete mission with bonus loot
                        if (enemy.isBountyTarget && this.missions.activeMission 
                            && this.missions.activeMission.targetEntity === enemy) {
                            this.missions.completeMission(this);
                        }
                        
                        if (enemy instanceof GatlingGunner) {
                            // Count remaining gunners (excluding this one)
                            let remainingGunners = 0;
                            for (let e of this.enemies) {
                                if (e instanceof GatlingGunner && e !== enemy && !e.dead) {
                                    remainingGunners++;
                                    e.maxBurstCount += 5; e.reloadTime = Math.max(30, e.reloadTime - 0.7);
                                }
                            }
                            
                            if (remainingGunners > 0) {
                                showMessage("REMAINING GUNNERS ENRAGED!");
                            } else {
                                // Last GatlingGunner killed - trigger dramatic time slow!
                                this.triggerTimeSlow(0.4, 4, true);
                            }
                        }
                        this.enemies.splice(i, 1); 
                    }
                }
                
                // ── LARISSA COMBAT TUTORIAL COMMS ──
                // One-shot dialogue triggers that teach the player about combat systems.
                // Uses Larissa's cold, professional handler voice.
                if (this.enemies.length > 0 && this.story) {
                    // 1. Telegraph hint: first time any enemy telegraphs at the player
                    if (!this.questState.larissa_telegraph_hint) {
                        for (const e of this.enemies) {
                            if (e.isTelegraphing && !e.dead) {
                                this.questState.larissa_telegraph_hint = true;
                                setTimeout(() => {
                                    this.story.triggerComms("LARISSA", "Watch the line, 949. That's your window.", 4500);
                                }, 300);
                                break;
                            }
                        }
                    }
                    // 2. Stealth hint: first time a ganger enters ALERT state
                    if (!this.questState.larissa_stealth_hint) {
                        for (const e of this.enemies) {
                            if (e instanceof Ganger && e.state === 'ALERT' && !e.dead) {
                                this.questState.larissa_stealth_hint = true;
                                setTimeout(() => {
                                    this.story.triggerComms("LARISSA", "They can't see in the dark. Use it.", 4500);
                                }, 4800); // Delayed so it doesn't overlap telegraph hint
                                break;
                            }
                        }
                    }
                }
                
                this.profiler.stop('AI:Enemies');
            
                // --- 6. PROJECTILES (Entity System + Actor Collision) ---
                // Wall/building/prop collisions handled by CollisionSystem.
                // Actor collisions (player/enemies) use onProjectileHit() callbacks.
                this.profiler.start('Physics:Proj');
                
                // ── ORPHAN SWEEP ──
                // Catch any ProjectileEntity stuck in the GameEntity registry that isn't 
                // in this.projectiles. These are ghost entities that can deal invisible damage.
                const registeredProjectiles = GameEntity.registry.collidable.filter(e => 
                    e.collisionLayer === GameEntity.LAYER.PROJECTILE && e.active
                );
                for (const rp of registeredProjectiles) {
                    if (!this.projectiles.includes(rp)) {
                        // Orphan found — force-kill it
                        rp.active = false;
                        rp.markedForDestroy = true;
                        rp.vx = 0;
                        rp.vy = 0;
                        rp._finalDestroy();
                    }
                }
                
                // Update all projectiles and check for actor collisions
                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    let p = this.projectiles[i];
                    
                    // Skip if already destroyed by entity system
                    if (!p.active || p.markedForDestroy) {
                        // Ensure destroy() was called (triggers registry cleanup)
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    p.update();
                    
                    // ── NEURAL LOCK AIM ASSIST ──
                    // Steer friendly projectiles toward nearest enemy on trajectory path
                    if (p.alliance === 'friendly' && this.augments && this.augments.isEquipped('auto_aim')) {
                        const STEER_RATE = 0.052;   // ~3° per frame — strong but not homing
                        const DETECT_RANGE = 350;   // px detection radius from projectile
                        const CONE_HALF = Math.PI / 3; // 60° half-cone (120° total forward arc)
                        
                        const projAngle = Math.atan2(p.vy, p.vx);
                        let bestTarget = null;
                        let bestPathDist = Infinity;
                        
                        for (const e of this.enemies) {
                            if (e.dead || !e.active) continue;
                            const dx = e.x - p.x;
                            const dy = e.y - p.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist > DETECT_RANGE || dist < 5) continue;
                            
                            // Must be within forward cone
                            const angleToEnemy = Math.atan2(dy, dx);
                            let angleDiff = angleToEnemy - projAngle;
                            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                            if (Math.abs(angleDiff) > CONE_HALF) continue;
                            
                            // Perpendicular distance to projectile path — closest to trajectory wins
                            const pathDist = Math.abs(Math.sin(angleDiff) * dist);
                            if (pathDist < bestPathDist) {
                                bestPathDist = pathDist;
                                bestTarget = e;
                            }
                        }
                        
                        if (bestTarget) {
                            const desired = Math.atan2(bestTarget.y - p.y, bestTarget.x - p.x);
                            let steer = desired - projAngle;
                            while (steer > Math.PI) steer -= 2 * Math.PI;
                            while (steer < -Math.PI) steer += 2 * Math.PI;
                            steer = Math.max(-STEER_RATE, Math.min(STEER_RATE, steer));
                            const newAngle = projAngle + steer;
                            const speed = Math.hypot(p.vx, p.vy);
                            p.vx = Math.cos(newAngle) * speed;
                            p.vy = Math.sin(newAngle) * speed;
                        }
                    }
                    
                    // If update() destroyed the projectile (life expired), remove immediately
                    if (!p.active || p.markedForDestroy) {
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    // ── DEFENSIVE GUARDS (eliminate ghost projectiles) ──
                    
                    // Hard age cap: no projectile survives beyond 5 seconds
                    if (_frameTime - p.spawnTime > 5000) {
                        p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    // Zero-velocity kill: a non-sticky projectile with no momentum is dead
                    // (Normal projectiles should NEVER have zero velocity mid-flight)
                    if (!p.sticky && p.vx === 0 && p.vy === 0) {
                        p.destroy();
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                    
                    let hit = false;
                    let shouldDestroy = false;
                    
                    // Indoor V2: Check window shatter
                    if (this.roomSystem.active) {
                        for (const win of this.roomSystem.windows) {
                            if (win.tryShatter(p.x, p.y, 6)) {
                                this.weather.spawnSparks(p.x, p.y, 8);
                                audioSys.sfx('explode');
                                break;
                            }
                        }
                    }
                    
                    // Check Player (Enemy Projectiles Only) - uses PlayerEntity
                    if (p.isEnemy && this.player.visible && !this.player.dead) {
                        // Skip if penetrating and already hit this target
                        if (!p.penetrating || !p.hitTargets.has(this.player)) {
                            const d = Math.hypot(p.x - this.player.x, p.y - this.player.y);
                            if (d < this.player.radius + 5) {
                                hit = true;
                                this.player.onProjectileHit(p, this);
                                if (p.penetrating) {
                                    p.hitTargets.add(this.player);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) shouldDestroy = true;
                                } else {
                                    shouldDestroy = true;
                                }
                            }
                        }
                    }
                    
                    // Check Enemies (Player Projectiles Only)
                    if (!p.isEnemy) {
                        for (let e of this.enemies) {
                            if (e.dead) continue;
                            // Skip if penetrating and already hit this target
                            if (p.penetrating && p.hitTargets.has(e)) continue;
                            
                            const d = Math.hypot(p.x - e.x, p.y - e.y);
                            if (d < e.radius + 5) {
                                hit = true;
                                const angle = Math.atan2(p.vy, p.vx);
                                // Knockback scales with damage AND speed (powerful sniper = huge knockback)
                                // Formula: (damage * speed) / target_mass, capped for sanity
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const targetMass = e.mass || 20;
                                const knockbackStrength = Math.min((p.damage * projSpeed * 0.02) / (targetMass * 0.1), 50);
                                const kbX = Math.cos(angle) * knockbackStrength;
                                const kbY = Math.sin(angle) * knockbackStrength;
                                e.takeDamage(p.damage, kbX, kbY);
                                
                                // Spawn sticky DOT orb (Golden Child)
                                if (p.sticky && !e.dead) {
                                    // Random offset so multiple orbs scatter across the target
                                    const orbOffset = (e.radius || 10) * 0.5;
                                    this.stickyOrbs.push({
                                        target: e,
                                        offsetX: (Math.random() - 0.5) * orbOffset,
                                        offsetY: (Math.random() - 0.5) * orbOffset,
                                        maxRadius: 7,
                                        ticksLeft: p.dotTicks,
                                        maxTicks: p.dotTicks,
                                        tickInterval: p.dotInterval,
                                        tickTimer: 0,
                                        dotDamage: p.dotDamage,
                                    });
                                }
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(e);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) {
                                        shouldDestroy = true;
                                        break;
                                    }
                                    // Continue to next enemy for penetrating shots
                                } else {
                                    shouldDestroy = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Check Traffic Vehicles (penetrating shots go through)
                    if (this.traffic && this.traffic.vehicles) {
                        for (let car of this.traffic.vehicles) {
                            // Skip if penetrating and already hit this target
                            if (p.penetrating && p.hitTargets.has(car)) continue;
                            
                            if (Math.hypot(p.x - car.x, p.y - car.y) < 35) {
                                hit = true;
                                this.weather.spawnSparks(p.x, p.y, 8);
                                const angle = Math.atan2(p.vy, p.vx);
                                // Push cars based on damage and speed - sniper sends them flying!
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const carMass = 500; // Cars are heavy
                                const pushStrength = (p.damage * projSpeed * 0.005) / (carMass * 0.01);
                                car.x += Math.cos(angle) * pushStrength;
                                car.y += Math.sin(angle) * pushStrength;
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(car);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) {
                                        shouldDestroy = true;
                                        break;
                                    }
                                } else {
                                    shouldDestroy = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Check Owned Car (penetrating shots go through)
                    if (this.ownedCar && this.ownedCar.visible) {
                        if (!p.penetrating || !p.hitTargets.has(this.ownedCar)) {
                            if (Math.hypot(p.x - this.ownedCar.x, p.y - this.ownedCar.y) < 35) {
                                hit = true;
                                this.weather.spawnSparks(p.x, p.y, 8);
                                // Push owned car based on damage - sniper sends it flying!
                                const angle = Math.atan2(p.vy, p.vx);
                                const projSpeed = Math.hypot(p.vx, p.vy);
                                const carMass = 500;
                                const pushStrength = (p.damage * projSpeed * 0.005) / (carMass * 0.01);
                                this.ownedCar.x += Math.cos(angle) * pushStrength;
                                this.ownedCar.y += Math.sin(angle) * pushStrength;
                                
                                if (p.penetrating) {
                                    p.hitTargets.add(this.ownedCar);
                                    p.penetrateCount++;
                                    if (p.penetrateCount >= p.maxPenetrations) shouldDestroy = true;
                                } else {
                                    shouldDestroy = true;
                                }
                            }
                        }
                    }
                    
                    // HIT RESOLUTION (Audio/Visual Effects)
                    if (hit) {
                        const distToPlayer = Math.hypot(p.x - this.player.x, p.y - this.player.y);
                        
                        if (distToPlayer < 800) {
                            audioSys.sfx('explode');
                            
                            // Camera shake: Sniper > Fireballs > Enemy Shots > Player Shots
                            let shakeAmt = p.isSniper ? 15 : (p.color === '#ff3300' ? 12 : (p.isEnemy ? 8 : 4));
                            shakeAmt *= (1 - (distToPlayer / 800));
                            if (shakeAmt > 0.5) this.triggerShake(shakeAmt);
                        }
                        
                        // Visual explosion
                        if (p.color === '#ff3300') {
                            this.weather.spawnExplosion(p.x, p.y, '#ff3300');
                            this.weather.spawnSparks(p.x, p.y, 25);
                        } else {
                            this.weather.spawnExplosion(p.x, p.y, p.color);
                            // Extra sparks for sniper hits
                            if (p.isSniper) {
                                this.weather.spawnSparks(p.x, p.y, 15);
                            }
                        }
                        
                        // Destroy if not penetrating or exceeded max
                        if (shouldDestroy) {
                            p.destroy();
                            this.projectiles.splice(i, 1);
                        }
                    }
                    
                    // Remove if expired (entity handles this, but sync arrays)
                    if (!p.active || p.markedForDestroy) {
                        if (!p.markedForDestroy) p.destroy();
                        this.projectiles.splice(i, 1);
                    }
                }
                
                // ── STICKY ORBS (Golden Child DOT) ──
                for (let i = this.stickyOrbs.length - 1; i >= 0; i--) {
                    const orb = this.stickyOrbs[i];
                    
                    // Remove if target dead or ticks exhausted
                    if (!orb.target || orb.target.dead || orb.ticksLeft <= 0) {
                        this.stickyOrbs.splice(i, 1);
                        continue;
                    }
                    
                    // Tick damage timer
                    orb.tickTimer++;
                    if (orb.tickTimer >= orb.tickInterval) {
                        orb.tickTimer = 0;
                        orb.ticksLeft--;
                        orb.target.takeDamage(orb.dotDamage);
                        
                        // Small golden spark on each tick
                        if (this.weather) {
                            this.weather.spawnExplosion(
                                orb.target.x + orb.offsetX, 
                                orb.target.y + orb.offsetY, 
                                '#FFD700'
                            );
                        }
                    }
                }
            
                // Loot Collection
                for(let i=this.loot.length-1; i>=0; i--) {
                    let l = this.loot[i];
                    const d = Math.hypot(this.player.x - l.x, this.player.y - l.y);
                    
                    // Check pickup range
                    if (d < 35) {
                        // --- WEAPON PICKUP WITH DELAY ---
                        if (l.type === 'weapon_drop') {
                            
                            // CHECK: Has it been 1.5 seconds (1500ms) since it was dropped?
                            // If dropTime doesn't exist (generated by map), default to 0 (allow pickup)
                            const timeSinceDrop = Date.now() - (l.dropTime || 0);
                            
                            if (timeSinceDrop > 1500) { 
                                const added = this.inventory.addItem(l.item);
                                if (added) {
                                    audioSys.sfx('ui');
                                    this.loot.splice(i, 1);
                                }
                            }
                            // Skip the generic splice below - weapon_drop handles its own removal
                            continue;
                        } 
                        else if (l.type === 'pp') { this.currency += 20; showMessage("+PERSONICS"); } 
                        else if (l.type === 'scrap') { 
                            const amount = 2 + Math.floor(Math.random() * 2); // 2-3 scrap
                            this.scrap += amount; 
                            showMessage(`+${amount} SCRAP`); 
                        }
                        else if (l.type === 'salvage_crate') {
                            // Salvage mission crate — big scrap payout
                            if (this.missions.activeMission && this.missions.activeMission.type === MISSION_TYPES.SALVAGE) {
                                this.missions.activeMission.crateCollected = true;
                                showMessage('SCRAP CRATE RECOVERED.');
                                audioSys.sfx('ui');
                            }
                        } 
                        else if (l.type === 'stim') { 
                            if (this.boosterCount < this.getEffectiveMaxBoosters()) { 
                                this.boosterCount++; 
                                showMessage("+STIM"); 
                            } else { 
                                showMessage("STIMS FULL"); 
                                continue; // Don't remove if stims are full
                            } 
                        }
                        this.loot.splice(i, 1);
                    }
                }
            
                // Props Physics (Entity System)
                // NOTE: All prop collisions (prop-prop, prop-wall, actor-prop) are handled
                // by CollisionSystem._processDynamics and _processActors (circle vs OBB).
                // We only handle velocity/friction here.
                for (let prop of this.props) {
                    prop.update();
                }
                
                this.profiler.stop('Physics:Proj');
            
                // --- 7. PLAYER PHYSICS ---
                this.profiler.start('Physics:Player');
                
                // Bumper Car Minigame takes over driving when active
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.bumperMinigame.update(this);
                    // (No stop() here — this branch falls through to the shared
                    // stop at the end of the block. Stopping twice against a
                    // start() that was never reset counted the whole span twice,
                    // roughly doubling Physics:Player whenever the minigame ran.)
                } else if (this.isDriving) {
                    if (this.car.controlMode === 'AI') {
                        // PER-FRAME WAYPOINT SYNC & GPS SANITY CHECK
                        // Handles: exhausted waypoints, faulty data, off-route detection
                        if ((this.car.driverType === 'player' || this.car.driverType === 'zib') 
                            && this.navDestination) {
                            
                            const hasWaypoints = this.car.navWaypoints && this.car.navWaypoints.length > 0 
                                && this.car.currentWaypointIndex < this.car.navWaypoints.length;
                            
                            // Track recalc timer per car
                            if (!this.car._gpsCheckTimer) this.car._gpsCheckTimer = 0;
                            this.car._gpsCheckTimer++;
                            
                            let needsRecalc = false;
                            
                            // Case 1: No waypoints at all
                            if (!hasWaypoints) {
                                needsRecalc = true;
                            }
                            
                            // Case 2: Periodic sanity check (every 3 seconds)
                            if (!needsRecalc && hasWaypoints && this.car._gpsCheckTimer > 180) {
                                this.car._gpsCheckTimer = 0;
                                
                                // Check if current waypoint is unreachably far
                                const wp = this.car.navWaypoints[this.car.currentWaypointIndex];
                                if (wp) {
                                    const wpDist = Math.hypot(this.car.x - wp.x, this.car.y - wp.y);
                                    // If nearest waypoint is more than 500px away, route is likely broken
                                    if (wpDist > 500) {
                                        needsRecalc = true;
                                    }
                                }
                                
                                // Check if car is on the expected road (when on a lane, not mid-turn)
                                if (!needsRecalc && this.car.currentLane && !this.car.currentTurnPath) {
                                    if (!this.car.isOnExpectedRoad()) {
                                        // Give benefit of the doubt — only recalc if off-road for 2+ checks
                                        if (!this.car._offRouteCount) this.car._offRouteCount = 0;
                                        this.car._offRouteCount++;
                                        if (this.car._offRouteCount >= 2) {
                                            needsRecalc = true;
                                            this.car._offRouteCount = 0;
                                        }
                                    } else {
                                        this.car._offRouteCount = 0;
                                    }
                                }
                            }
                            
                            // Recalculate GPS path from current position
                            if (needsRecalc) {
                                this.car.navDestination = this.navDestination;
                                if (this.ui) {
                                    const savedPX = this.player.x, savedPY = this.player.y;
                                    this.player.x = this.car.x;
                                    this.player.y = this.car.y;
                                    this.ui.calculateNavPath();
                                    this.player.x = savedPX;
                                    this.player.y = savedPY;
                                    if (this.ui.navPath && this.ui.navPath.length > 1) {
                                        this.car.setNavWaypoints(this.ui.navPath.slice(1));
                                        this.car._gpsCheckTimer = 0;
                                    }
                                }
                            }
                        }
                        this.car.update(this.player, null, this.traffic.vehicles, this.weather, this.traffic.network.intersections, this.activeMap.walls, getColliders(this.activeMap));
                        if (inputX !== 0 || inputY !== 0) { this.car.disableAutoDrive(); this.autodriveBtn.classList.remove('engaged'); showMessage("AUTO-DRIVE DISENGAGED"); }
                    } else {
                        let gas = 0; let turn = 0;
                        if (this.joystick.active) { 
                            const carDirX = Math.cos(this.car.angle); const carDirY = Math.sin(this.car.angle); 
                            gas = (inputX * carDirX + inputY * carDirY); 
                            if (Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1) { 
                                const inputAngle = Math.atan2(inputY, inputX); let angleDiff = inputAngle - this.car.angle; 
                                angleDiff = normalizeAngle(angleDiff); 
                                turn = clamp(angleDiff * 2.0, -1, 1);
                                if (Math.abs(turn) < 0.1) turn = 0;
                            } 
                        } else { 
                            if (inputY < 0) gas = 1; if (inputY > 0) gas = -0.5; if (inputX < 0) turn = -1; if (inputX > 0) turn = 1; 
                        }
                        this.car.manualGas = gas; this.car.manualTurn = turn;
                        this.car.updateManualDriving(this.activeMap.walls, getColliders(this.activeMap), this.weather, this.decals);
                    }
                    // Player sits at seat 0, not car center
                    const driverSeatPos = this.car.getSeatWorldPos(0);
                    this.player.x = driverSeatPos.x; this.player.y = driverSeatPos.y;
            
                    // Drive-By Shooting Logic
                    const isShooting = this.fireJoystick.active || (this.mouseDown && this.mouseX);
                    this.isShootingFromCar = isShooting; // Store for drawing
                    
                    if (isShooting) {
                        // Get raw aim angle
                        let aimAngle;
                        if (this.fireJoystick.active) {
                            aimAngle = Math.atan2(this.fireJoystick.dy, this.fireJoystick.dx);
                        } else {
                            const worldX = this.player.x + (this.mouseX - this.canvas.width/2) / this.camera.zoom;
                            const worldY = this.player.y + (this.mouseY - this.canvas.height/2) / this.camera.zoom;
                            aimAngle = Math.atan2(worldY - this.player.y, worldX - this.player.x);
                        }
                        
                        // Clamp aim angle to LEFT side of car (driver's window)
                        // Valid range: car.angle - PI to car.angle (the left 180 degrees)
                        let relativeAngle = aimAngle - this.car.angle;
                        // Normalize to -PI to PI
                        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                        
                        // Left side is from -PI to 0 (relative to car facing)
                        // If aiming to right side (0 to PI), clamp to nearest edge
                        if (relativeAngle > 0 && relativeAngle < Math.PI) {
                            // Aiming to right side - clamp to nearest valid edge
                            if (relativeAngle < Math.PI / 2) {
                                relativeAngle = 0; // Clamp to forward
                            } else {
                                relativeAngle = -Math.PI; // Clamp to backward
                            }
                        }
                        
                        this.player.angle = this.car.angle + relativeAngle;
                        
                        // Cooldown already counted down once this tick (step 1)
                        if (this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else {
                        // Not shooting - face car direction
                        this.player.angle = this.car.angle;
                    }
            
                } else {
                    // Walking Logic (Player Entity System)
                    this.isShootingFromCar = false; // Reset when not driving
                    // Normalize so keyboard diagonals (±1, ±1) aren't √2 faster.
                    // Analog stick input already inside the unit circle passes through.
                    const walkInputMag = Math.hypot(inputX, inputY);
                    if (walkInputMag > 1) { inputX /= walkInputMag; inputY /= walkInputMag; }
                    this.player.velX = inputX; this.player.velY = inputY; 
                    
                    if (this.fireJoystick.active || !this.mouseDown) this.player._aimPoint = null;   // stick / facing: fire straight
                    if (this.fireJoystick.active) {
                        this.player.angle = Math.atan2(this.fireJoystick.dy, this.fireJoystick.dx);
                        // Cooldown already counted down once this tick (step 1); fire at the weapon's own rate
                        if (this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else if (this.mouseDown && this.mouseX) {
                        const worldX = this.player.x + (this.mouseX - this.canvas.width/2) / this.camera.zoom;
                        const worldY = this.player.y + (this.mouseY - this.canvas.height/2) / this.camera.zoom;
                        this.player.angle = Math.atan2(worldY - this.player.y, worldX - this.player.x);
                        this.player._aimPoint = { x: worldX, y: worldY };   // shots and the laser converge here
                        // Cooldown already counted down once this tick (step 1)
                        if (this.shootCooldown <= 0) { this.fireWeapon(); }
                    } else {
                        if (inputX !== 0 || inputY !== 0) this.player.angle = Math.atan2(inputY, inputX);
                    }
                    
                    // Apply movement via PlayerEntity (collision resolution via CollisionSystem)
                    // Store pre-movement position for car collision check
                    const prevX = this.player.x;
                    const prevY = this.player.y;
                    
                    this.player.applyMovement(inputX, inputY);
                    
                    // Car collision (not in entity system yet) - revert if colliding
                    if (this.checkPlayerCarCollision(this.player.x, this.player.y)) {
                        this.player.x = prevX;
                        this.player.y = prevY;
                    }
                    
                    // Clamp player within map bounds
                    const boundsMargin = 15;
                    this.player.x = Math.max(boundsMargin, Math.min(this.activeMap.width - boundsMargin, this.player.x));
                    this.player.y = Math.max(boundsMargin, Math.min(this.activeMap.height - boundsMargin, this.player.y));
                    
                    // Wall/Building/Prop collisions now handled by CollisionSystem
                    // (runs after this in the update loop)
                    
                    // --- BLOOD TRAIL LOGIC (PLAYER) ---
                    if (this.playerHealth < 50) {
                        const isMoving = (Math.abs(inputX) > 0 || Math.abs(inputY) > 0);
                        const bleedChance = this.playerHealth < 20 ? 0.3 : 0.1;
                        
                        //if ((isMoving || Math.random() < 0.05) && Math.random() < bleedChance) {
                            this.decals.addBlood(this.player.x, this.player.y, 3 + Math.random() * 2);
                        //}
                    }
                }
                
                // Update PlayerEntity (knockback decay, animation phase)
                this.player.update();
                
                // Clamp player within map bounds after knockback
                if (!this.isDriving) {
                    const postKnockbackMargin = 15;
                    this.player.x = Math.max(postKnockbackMargin, Math.min(this.activeMap.width - postKnockbackMargin, this.player.x));
                    this.player.y = Math.max(postKnockbackMargin, Math.min(this.activeMap.height - postKnockbackMargin, this.player.y));
                }
                this.profiler.stop('Physics:Player');

                // --- ENTITY BOUNDARY CLAMPING ---
                // Prevent NPCs, enemies, teammates, and cat from leaving map bounds
                {
                    const mapW = this.activeMap.width;
                    const mapH = this.activeMap.height;
                    const em = 15; // entity margin
                    const clampEntity = (e) => {
                        if (!e || e.x === undefined) return;
                        if (e.x < em) e.x = em;
                        else if (e.x > mapW - em) e.x = mapW - em;
                        if (e.y < em) e.y = em;
                        else if (e.y > mapH - em) e.y = mapH - em;
                    };
                    for (const npc of this.npcs) clampEntity(npc);
                    for (const tm of this.teammates) { if (tm.recruited) clampEntity(tm); }
                    for (const enemy of this.enemies) clampEntity(enemy);
                    if (this.velvetCat && this.velvetCat.visible) clampEntity(this.velvetCat);
                }
            
                // --- 8. COLLISIONS & INTERACTION UI ---
                this.profiler.start('Physics:Collisions');
                // Runs every step. This call contains the player-vs-traffic
                // contact test (including damage and impact SFX) as well as
                // car-vs-car separation — anything feeding a discrete contact
                // test must be sampled every step or hits get missed outright.
                if (this.simDue(CONFIG.SIM.TRAFFIC_COLLIDE_INTERVAL)) {
                    this.resolveTrafficCollisions();
                }
                
                // Unified Entity System collision pass (spatial grid optimization)
                if (this.useNewCollisionSystem) {
                    CollisionSystem.update(this.camera, this.canvas, this);
                }
                this.profiler.stop('Physics:Collisions');
            
                this.profiler.start('Logic:UI_Interact');
                // Interaction UI Checks
                let inTransition = false;
                if (this.activeMap.transitions && !this.isDriving) { 
                    const t = this._transitionGrid.query(this.player.x, this.player.y); 
                    if (t) { inTransition = true; this.transitionBtn.textContent = t.label; this.transitionBtn.style.display = 'block'; } 
                }
                if (!inTransition) this.transitionBtn.style.display = 'none';
            
                let carDist = Math.hypot(this.player.x - this.car.x, this.player.y - this.car.y);
                let nearInteractable = null;
                
                // Find Interactables
                for(let npc of this.npcs) { let d = Math.hypot(this.player.x - npc.x, this.player.y - npc.y); if (d < 50) { nearInteractable = npc; } }
                for(let tm of this.teammates) { 
                    if (tm.inCar) continue;
                    // In apartment: recruited teammates are interactable for bonding
                    const inApt = this.activeMap && this.activeMap.id === 'apt_949';
                    if (tm.recruited && !inApt) continue;
                    if (!tm.recruited && inApt) continue; // Skip unrecruited in apartment
                    let d = Math.hypot(this.player.x - tm.x, this.player.y - tm.y); if(d < 50) { nearInteractable = tm; } 
                }
                for(let p of this.props) { if (p.interactionType) { let d = Math.hypot(this.player.x - (p.x + p.w/2), this.player.y - (p.y + p.h/2)); if (d < 60) nearInteractable = p; } }
                
                // Discoverable Velvet Cat
                if (this.velvetCat && this.velvetCat._discoverable && !this.questState.hasVelvetCat) {
                    const catDist = Math.hypot(this.player.x - this.velvetCat.x, this.player.y - this.velvetCat.y);
                    if (catDist < 50) nearInteractable = { interactionType: 'adopt_cat', entity: this.velvetCat };
                }
                
                // Delivery vehicle interaction (for pickup when mission active)
                if (this.deliveryVehicle && this.deliveryVehicle.visible && this.missions.activeMission 
                    && this.missions.activeMission.type === MISSION_TYPES.DELIVERY 
                    && !this.missions.activeMission.pickedUp && !this.isDriving) {
                    const dvDist = Math.hypot(this.player.x - this.deliveryVehicle.x, this.player.y - this.deliveryVehicle.y);
                    if (dvDist < 80) {
                        nearInteractable = { interactionType: 'delivery_pickup' };
                    }
                }
                
                captionSystem.checkProximityGreetings(this.player, this.npcs, this.teammates);
                
                let ownedCarDist = null;
                if (this.ownedCar && this.ownedCar !== this.car && this.ownedCar.visible) {
                    ownedCarDist = Math.hypot(this.player.x - this.ownedCar.x, this.player.y - this.ownedCar.y);
                }
                let nearTraffic = this.traffic.getNearest(this.player.x, this.player.y, 80);
                
                // Check delivery vehicle proximity (managed separately from traffic)
                let nearDeliveryVehicle = null;
                if (this.deliveryVehicle && this.deliveryVehicle.visible && !this.isDriving
                    && this.deliveryVehicle.controlMode !== 'PLAYER') {
                    const dvDist = Math.hypot(this.player.x - this.deliveryVehicle.x, this.player.y - this.deliveryVehicle.y);
                    if (dvDist < 80) nearDeliveryVehicle = this.deliveryVehicle;
                }
            
                // Update Button State
                if (this.isDriving) { 
                    this.interactBtn.innerHTML = "Exit<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = null; 
                } 
                else if (nearInteractable) { 
                    this.interactBtn.style.display = 'flex'; this.activeInteraction = nearInteractable; 
                    if (nearInteractable instanceof PropEntity) {
                        if (nearInteractable.interactionType === 'medbay_refill') this.interactBtn.innerHTML = "Refill<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'vending_machine') this.interactBtn.innerHTML = "Buy<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'bed_sleep') this.interactBtn.innerHTML = "Rest<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'crafting_table') this.interactBtn.innerHTML = "Craft<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'auto_shop_counter') this.interactBtn.innerHTML = "Shop<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'armory') this.interactBtn.innerHTML = "Loadout<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'read_note') this.interactBtn.innerHTML = "Read<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        if (nearInteractable.interactionType === 'light_switch') this.interactBtn.innerHTML = "Lights<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                    } else if (nearInteractable.interactionType === 'delivery_pickup') {
                        this.interactBtn.innerHTML = "Pick Up<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                    } else if (nearInteractable.interactionType === 'adopt_cat') {
                        this.interactBtn.innerHTML = "Adopt<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                    } else if (nearInteractable.role === 'teammate' && nearInteractable.recruited && this.activeMap && this.activeMap.id === 'apt_949') {
                        if (this.bonding.canBond(nearInteractable)) {
                            this.interactBtn.innerHTML = "Bond<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        } else {
                            this.interactBtn.innerHTML = "Talk<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>";
                        }
                    } else { this.interactBtn.innerHTML = "Talk<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; }
                }
                else if (ownedCarDist !== null && ownedCarDist < 80) {
                    this.interactBtn.innerHTML = "Enter<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: this.ownedCar };
                }
                else if (nearDeliveryVehicle) {
                    this.interactBtn.innerHTML = "Enter<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: nearDeliveryVehicle };
                }
                else if (nearTraffic && nearTraffic.isZib) {
                    this.interactBtn.innerHTML = "Hail<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hail_zib', target: nearTraffic };
                }
                else if (nearTraffic) {
                    this.interactBtn.innerHTML = "Hijack<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = { type: 'hijack', target: nearTraffic };
                }
                else if (carDist < 80 && this.activeMap.type !== 'indoor') { 
                    this.interactBtn.innerHTML = "Enter<br><span style='font-size:0.5rem;opacity:0.7'>(E)</span>"; this.interactBtn.style.display = 'flex'; this.activeInteraction = null; 
                } 
                else { 
                    this.interactBtn.style.display = 'none'; this.activeInteraction = null; 
                }
            
                // Camera Zoom Logic (skip during cutscene — cutscene manager owns zoom)
                if (!this.cutscene || !this.cutscene.active) {
                let targetZoom = 1.0;
                if (this.isDriving) { 
                    const speedRatio = Math.abs(this.car.speed) / this.car.maxSpeed; 
                    targetZoom = 1.0 - (speedRatio * 0.65); 
                    if (targetZoom < 0.35) targetZoom = 0.35; 
                } else if (nearInteractable) { targetZoom = 1.4; }
                
                const diff = targetZoom - this.camera.zoom;
                if (Math.abs(diff) > 0.005) this.camera.zoom += diff * 0.05;
                else this.camera.zoom = targetZoom;
                }
                
                // Mission System: check objective completion
                if (this.missions) this.missions.checkCompletion(this);
                
                this.profiler.stop('Logic:UI_Interact');
                this.profiler.stop('Update:Total');
            }

            
            resolveTrafficCollisions() {
                // 1. WALKING COLLISION (Player vs Traffic)
                if (!this.isDriving) {
                    // Create dummy for Grid Query
                    const playerDummy = { x: this.player.x, y: this.player.y, length: 30, width: 30 };
                    const nearby = this.traffic.grid.getNearby(playerDummy);
                    
                    for (let v of nearby) {
                        // Translate player to vehicle local space
                        const dx = this.player.x - v.x;
                        const dy = this.player.y - v.y;
                        const cos = Math.cos(-v.angle);
                        const sin = Math.sin(-v.angle);
                        const localX = dx * cos - dy * sin;
                        const localY = dx * sin + dy * cos;
                        
                        const hLen = (v.length / 2) + 2; 
                        const hWid = (v.width / 2) + 2;
                        const closestX = Math.max(-hLen, Math.min(hLen, localX));
                        const closestY = Math.max(-hWid, Math.min(hWid, localY));
                        const distX = localX - closestX;
                        const distY = localY - closestY;
                        const distSq = distX * distX + distY * distY;
                        const radius = 15; 
            
                        if (distSq < radius * radius && distSq > 0) {
                            const dist = Math.sqrt(distSq);
                            const overlap = radius - dist;
                            const nX = distX / dist;
                            const nY = distY / dist;
                            
                            // Rotate normal back to world space
                            const worldNx = nX * Math.cos(v.angle) - nY * Math.sin(v.angle);
                            const worldNy = nX * Math.sin(v.angle) + nY * Math.cos(v.angle);
            
                            // --- NEW PHYSICS LOGIC ---
                            const pMass = this.player.mass || 15; // Your 15000 goes here
                            const vMass = v.mass || 1000;
                            const totalMass = pMass + vMass;
                            
                            // Calculate push ratios
                            const playerRatio = vMass / totalMass; // How much player moves
                            const carRatio = pMass / totalMass;    // How much car moves
            
                            // 1. Position Separation (Push both based on mass)
                            this.player.x += worldNx * overlap * playerRatio;
                            this.player.y += worldNy * overlap * playerRatio;
                            
                            v.x -= worldNx * overlap * carRatio;
                            v.y -= worldNy * overlap * carRatio;
            
                            // 2. Momentum Transfer (Super strength effect)
                            // If player is moving into the car, transfer velocity
                            const pushDot = this.player.velX * worldNx + this.player.velY * worldNy;
                            if (pushDot < 0) {
                                const pushForce = -pushDot * 2.0; // Strength multiplier
                                // Apply velocity to car (if it has vx/vy properties)
                                // Since cars use 'speed' and 'angle', we approximate:
                                if (carRatio > 0.5) { // Only if player is heavy enough to matter
                                     // Hacky impulse for legacy cars: nudge position directly for "slide"
                                     v.x -= worldNx * pushForce * carRatio * 2;
                                     v.y -= worldNy * pushForce * carRatio * 2;
                                }
                            }
                            // -------------------------
            
                            // Damage Logic (Keep existing)
                            if (Math.abs(v.speed) > 4.0) {
                                this.damagePlayer(10);
                                this.triggerShake(10);
                                audioSys.sfx('explode'); 
                                this.weather.spawnExplosion(this.player.x, this.player.y, '#ff0000');
                            }
                        }
                    }
                } 
                
                // 2. VEHICLE vs VEHICLE Collisions
                this.traffic.resolveCollisions(this.car, this.player, this.weather, audioSys, this.ownedCar, this.decals);
            }

            // Helper: Checks if two rotated cars intersect
            checkCarIntersect(c1, c2) {
                // Get corners of Car 1
                const corners1 = this.getOBBCorners(c1);
                // Get corners of Car 2
                const corners2 = this.getOBBCorners(c2);
            
                // Check if any corner of C1 is inside C2
                for(let p of corners1) {
                    if(this.isPointInRotatedRect(p.x, p.y, c2)) return true;
                }
                // Check if any corner of C2 is inside C1
                for(let p of corners2) {
                    if(this.isPointInRotatedRect(p.x, p.y, c1)) return true;
                }
                return false;
            }
            
            getOBBCorners(c) {
                const cos = Math.cos(c.angle); const sin = Math.sin(c.angle);
                const hw = c.length / 2; const hh = c.width / 2; // Note: Length is X-axis in local space usually
                return [
                    { x: c.x + (hw * cos - hh * sin), y: c.y + (hw * sin + hh * cos) },
                    { x: c.x + (hw * cos + hh * sin), y: c.y + (hw * sin - hh * cos) },
                    { x: c.x + (-hw * cos + hh * sin), y: c.y + (-hw * sin - hh * cos) },
                    { x: c.x + (-hw * cos - hh * sin), y: c.y + (-hw * sin + hh * cos) }
                ];
            }
            
            isPointInRotatedRect(x, y, rect) {
                // Translate point to rect local space
                const dx = x - rect.x;
                const dy = y - rect.y;
                const cos = Math.cos(-rect.angle);
                const sin = Math.sin(-rect.angle);
                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;
                
                // Check AABB in local space
                return (Math.abs(localX) < rect.length/2 && Math.abs(localY) < rect.width/2);
            }

            /* =====================================================================
               MAIN RENDER LOOP (DRAW)
               ---------------------------------------------------------------------
               Handles all visual rendering.
               Layers: Floor -> Roads -> Buildings -> Walls -> Entities -> Light -> UI
               Instrumented with Profiler.
               ===================================================================== */
            draw() {
                if (!this.running || this.paused) return;
            
                // --- PROFILER START ---
                this.profiler.beginFrame();
                this.profiler.start('Render:Total');
                this.profiler.markWrapper('Render:Total');
                /* Render:Setup — the full-screen clear, camera transform, cull
                   bounds and zoom LOD. This block used to sit inside Render:Total
                   but in no subsection, so the parts never summed to the whole
                   and the clear (a full-viewport fillRect — pure fill rate, and
                   precisely what resolution scaling targets) was invisible in the
                   breakdown. */
                this.profiler.start('Render:Setup');
            
                // 1. CLEAR & CAMERA SETUP
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
                this.ctx.save();
                this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
                this.ctx.scale(this.camera.zoom, this.camera.zoom);
            
                // Camera Logic: Cutscene Director vs Player Tracking
                let camX, camY;
                if (this.cutscene && this.cutscene.active) {
                    camX = this.camera.x;
                    camY = this.camera.y;
                } else {
                    camX = this.player.x;
                    camY = this.player.y;
                    this.camera.x = camX; // Sync for smooth handoff
                    this.camera.y = camY;
                }
                
                this.ctx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                // World → screen matrix for this frame: lets the hair physics work out any
                // character's head position in world space, whatever transforms drew it
                _worldMatrix = this.ctx.getTransform();
                _worldCanvas = this.canvas;
                
                // PERFORMANCE: Pre-calculate viewport culling bounds once per frame
                // Uses AABB (rectangular) instead of radial distance for better screen coverage
                // cullZoom clamps the zoom used for cull bounds, preventing the cull rect from
                // exploding at low zoom (driving at speed). Margins stay unscaled as pop-in buffer.
                const cullZoom = Math.max(CONFIG.CULLING.ZOOM_MIN, Math.min(CONFIG.CULLING.ZOOM_MAX, this.camera.zoom));
                const cullHalfW = (this.canvas.width / 2) / cullZoom;
                const cullHalfH = (this.canvas.height / 2) / cullZoom;
                const cullBounds = {
                    buildings:    { left: camX - cullHalfW - CONFIG.CULLING.BUILDINGS,     right: camX + cullHalfW + CONFIG.CULLING.BUILDINGS,     top: camY - cullHalfH - CONFIG.CULLING.BUILDINGS,     bottom: camY + cullHalfH + CONFIG.CULLING.BUILDINGS },
                    buildingTops: { left: camX - cullHalfW - CONFIG.CULLING.BUILDING_TOPS, right: camX + cullHalfW + CONFIG.CULLING.BUILDING_TOPS, top: camY - cullHalfH - CONFIG.CULLING.BUILDING_TOPS, bottom: camY + cullHalfH + CONFIG.CULLING.BUILDING_TOPS },
                    foliage:      { left: camX - cullHalfW - CONFIG.CULLING.FOLIAGE,       right: camX + cullHalfW + CONFIG.CULLING.FOLIAGE,       top: camY - cullHalfH - CONFIG.CULLING.FOLIAGE,       bottom: camY + cullHalfH + CONFIG.CULLING.FOLIAGE },
                    lamps:        { left: camX - cullHalfW - CONFIG.CULLING.LAMPS,         right: camX + cullHalfW + CONFIG.CULLING.LAMPS,         top: camY - cullHalfH - CONFIG.CULLING.LAMPS,         bottom: camY + cullHalfH + CONFIG.CULLING.LAMPS },
                    lampGlow:     { left: camX - cullHalfW - CONFIG.CULLING.LAMP_GLOW,     right: camX + cullHalfW + CONFIG.CULLING.LAMP_GLOW,     top: camY - cullHalfH - CONFIG.CULLING.LAMP_GLOW,     bottom: camY + cullHalfH + CONFIG.CULLING.LAMP_GLOW },
                    props:        { left: camX - cullHalfW - CONFIG.CULLING.PROPS,         right: camX + cullHalfW + CONFIG.CULLING.PROPS,         top: camY - cullHalfH - CONFIG.CULLING.PROPS,         bottom: camY + cullHalfH + CONFIG.CULLING.PROPS },
                    neonSigns:    { left: camX - cullHalfW - CONFIG.CULLING.NEON_SIGNS,    right: camX + cullHalfW + CONFIG.CULLING.NEON_SIGNS,    top: camY - cullHalfH - CONFIG.CULLING.NEON_SIGNS,    bottom: camY + cullHalfH + CONFIG.CULLING.NEON_SIGNS },
                    headlights:   { left: camX - cullHalfW - CONFIG.CULLING.HEADLIGHTS,    right: camX + cullHalfW + CONFIG.CULLING.HEADLIGHTS,    top: camY - cullHalfH - CONFIG.CULLING.HEADLIGHTS,    bottom: camY + cullHalfH + CONFIG.CULLING.HEADLIGHTS },
                    vehicles:     { left: camX - cullHalfW - CONFIG.CULLING.VEHICLES,      right: camX + cullHalfW + CONFIG.CULLING.VEHICLES,      top: camY - cullHalfH - CONFIG.CULLING.VEHICLES,      bottom: camY + cullHalfH + CONFIG.CULLING.VEHICLES },
                    entities:     { left: camX - cullHalfW - CONFIG.CULLING.ENTITIES,      right: camX + cullHalfW + CONFIG.CULLING.ENTITIES,      top: camY - cullHalfH - CONFIG.CULLING.ENTITIES,      bottom: camY + cullHalfH + CONFIG.CULLING.ENTITIES },
                    world:        { left: camX - cullHalfW - CONFIG.CULLING.WORLD,         right: camX + cullHalfW + CONFIG.CULLING.WORLD,         top: camY - cullHalfH - CONFIG.CULLING.WORLD,         bottom: camY + cullHalfH + CONFIG.CULLING.WORLD }
                };
            
                // --- DYNAMIC LOD (Zoom-Aware) ---
                // Progressive quality reduction as camera zooms out.
                // At zoom 1.0: full detail. At 0.35: minimal detail.
                // zoomLOD 0 = full quality, 1 = reduced, 2 = minimal
                const zoom = this.camera.zoom;
                _zoomLOD = zoom > 0.7 ? 0 : (zoom > 0.5 ? 1 : 2);
                
                // Vehicle LOD threshold scales with zoom — entities that are small on screen skip effects
                const _vehicleLODThreshSq = Math.pow(300 / Math.max(0.35, zoom), 2);
                
                // Max shadow polygons drawn per frame in lighting pass (prevents zoom-out bomb)
                const _maxLitLamps = _zoomLOD === 2 ? 10 : (_zoomLOD === 1 ? 18 : 40);
                
                // Max neon sign layers (5 = full glow, 2 = core only, 1 = flat text)
                const _maxSignLayers = _zoomLOD === 2 ? 1 : (_zoomLOD === 1 ? 2 : 5);
                
                // Store on engine for access by sub-systems
                this._zoomLOD = _zoomLOD;
                this._maxLitLamps = _maxLitLamps;
                this._maxSignLayers = _maxSignLayers;
            
                this.profiler.stop('Render:Setup');

                // 2. WORLD GEOMETRY (BOTTOM LAYERS)
                this.profiler.start('Render:World');
                
                // Pre-calculate daylight factor for windows, lamps, and lighting
                // Indoor V2: If room system is active, use room type; otherwise use map type
                // worldMinutes is monotonic — derive hour-of-day with % 1440.
                const hour = (this.worldMinutes % 1440) / 60;
                const isEffectivelyOutdoor = this.activeMap.type === 'outdoor' || this.roomSystem.isPlayerOutdoor();
                const daylight = isEffectivelyOutdoor ? Math.max(0, 1 - (Math.abs(12 - hour) / 6)) : 0;
                // For windows: they always project based on world time, even in indoor maps
                const windowDaylight = Math.max(0, 1 - (Math.abs(12 - hour) / 6));
                this._windowDaylight = windowDaylight; // Store for lighting system access
                // Floor Base - PERFORMANCE: Clip to visible area instead of full map
                // Uses actual camera zoom (not cullZoom) so floor always fills the screen
                const viewHalfW = (this.canvas.width / 2) / this.camera.zoom;
                const viewHalfH = (this.canvas.height / 2) / this.camera.zoom;
                this.ctx.fillStyle = this.activeMap.floorColor;
                const floorLeft = Math.max(0, camX - viewHalfW - 50);
                const floorTop = Math.max(0, camY - viewHalfH - 50);
                const floorRight = Math.min(this.activeMap.width, camX + viewHalfW + 50);
                const floorBottom = Math.min(this.activeMap.height, camY + viewHalfH + 50);
                this.ctx.fillRect(floorLeft, floorTop, floorRight - floorLeft, floorBottom - floorTop);
                
                // Floor Zones (Grass, Industrial ground - drawn UNDER roads)
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridFloorZones) {
                    const visibleZones = this._renderGridFloorZones.query(cullBounds.world);
                    for (const z of visibleZones) {
                        this.ctx.fillStyle = z.color;
                        this.ctx.fillRect(z.x, z.y, z.w, z.h);
                    }
                }
                
                // Restricted Zone — in-world crimson hazard border
                if (this.restrictedZone && this.activeMap.id === 'hub_949') {
                    const rz = this.restrictedZone;
                    const wb = cullBounds.world;
                    // Only draw if zone is visible in viewport
                    if (rz.x + rz.w > wb.x && rz.x < wb.x + wb.w && rz.y + rz.h > wb.y && rz.y < wb.y + wb.h) {
                        this.ctx.save();
                        // Pulsing crimson dashed border
                        const t = _frameTime / 500;
                        const alpha = rz.active && !rz.cleared ? 0.6 + Math.sin(t) * 0.2 : 0.25;
                        this.ctx.strokeStyle = `rgba(200, 20, 0, ${alpha})`;
                        this.ctx.lineWidth = 3;
                        this.ctx.setLineDash([12, 8]);
                        this.ctx.lineDashOffset = _frameTime / 40;
                        this.ctx.strokeRect(rz.x, rz.y, rz.w, rz.h);
                        this.ctx.setLineDash([]);
                        
                        // Corner hazard chevrons
                        const cs = 20; // chevron size
                        this.ctx.strokeStyle = `rgba(255, 60, 0, ${alpha * 0.8})`;
                        this.ctx.lineWidth = 2;
                        // Top-left
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x, rz.y + cs); this.ctx.lineTo(rz.x, rz.y); this.ctx.lineTo(rz.x + cs, rz.y); this.ctx.stroke();
                        // Top-right
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x + rz.w - cs, rz.y); this.ctx.lineTo(rz.x + rz.w, rz.y); this.ctx.lineTo(rz.x + rz.w, rz.y + cs); this.ctx.stroke();
                        // Bottom-left
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x, rz.y + rz.h - cs); this.ctx.lineTo(rz.x, rz.y + rz.h); this.ctx.lineTo(rz.x + cs, rz.y + rz.h); this.ctx.stroke();
                        // Bottom-right
                        this.ctx.beginPath(); this.ctx.moveTo(rz.x + rz.w - cs, rz.y + rz.h); this.ctx.lineTo(rz.x + rz.w, rz.y + rz.h); this.ctx.lineTo(rz.x + rz.w, rz.y + rz.h - cs); this.ctx.stroke();
                        
                        this.ctx.restore();
                    }
                }
                
                // Roads (Asphalt)
                this.traffic.drawNetwork(this.ctx, this.debugMode);
                
                // Puddle Reflections (draw on roads, before buildings/entities)
                if (this.puddles && this.weather?.isRaining && this.activeMap?.type === 'outdoor') {
                    this.puddles.draw(this.ctx);
                }
            
                this.profiler.stop('Render:World');
                
                // Buildings - BASE LAYER (shadows, ground floor) - drawn before entities
                this.profiler.start('Render:Buildings');
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildings;
                    this.activeMap.buildings.forEach(b => {
                        // AABB check - building bounds vs viewport bounds
                        const bRight = b.x + (b.w || 200);
                        const bBottom = b.y + (b.h || 200);
                        if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                        
                        if (b.drawBase) {
                            b.drawBase(this.ctx);
                        } else {
                            b.draw(this.ctx);
                        }
                    });
                }
                
                // BuildingV3 — Ground layer (beneath player: facade, sidewalk)
                if (this.activeMap._v3Buildings) {
                    this.activeMap._v3Buildings.forEach(b => {
                        b.drawGround(this.ctx, performance.now());
                    });
                }
                
                // Neon Signs on buildings - PERFORMANCE: AABB culling + cached frameTime
                const cbNeonMain = cullBounds.neonSigns;
                this.neonSigns.forEach(s => {
                    if (s.x < cbNeonMain.left || s.x > cbNeonMain.right || s.y < cbNeonMain.top || s.y > cbNeonMain.bottom) return;
                    s.draw(this.ctx, _frameTime);  // per-frame real time (was sampled once per tick)
                });
            
                // Walls & Indoor Zones (WITH BAKED TEXTURES)
                if (this.activeMap.zones) { 
                    this.activeMap.zones.forEach(z => { 
                        // Base color fill
                        this.ctx.fillStyle = z.color; 
                        this.ctx.fillRect(z.x, z.y, z.w, z.h); 
                        
                        // PERFORMANCE: Use pre-baked texture patterns instead of per-frame procedural
                        if (z.texture === 'wood') {
                            // Simple baked wood effect - just lines, no loops
                            this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
                            const plankHeight = 24; // Doubled for fewer draws
                            for (let py = z.y; py < z.y + z.h; py += plankHeight) {
                                this.ctx.fillRect(z.x, py, z.w, 1);
                            }
                            // Single polish overlay
                            this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
                            this.ctx.fillRect(z.x, z.y, z.w, z.h);
                            
                        } else if (z.texture === 'carpet') {
                            // Simple carpet overlay - single fill, no loops
                            this.ctx.fillStyle = 'rgba(0,0,0,0.06)';
                            this.ctx.fillRect(z.x, z.y, z.w, 4);
                            this.ctx.fillRect(z.x, z.y + z.h - 4, z.w, 4);
                            this.ctx.fillRect(z.x, z.y, 4, z.h);
                            this.ctx.fillRect(z.x + z.w - 4, z.y, 4, z.h);
                        }
                    }); 
                }
                
                // --- APARTMENT CITY BACKDROP ---
                // Draw AFTER zones so it overwrites the veranda zone color with a living cityscape
                if (this.activeMap.id === 'apt_949') {
                    this.drawApartmentBackdrop(this.ctx);
                    this.drawApartmentInterior(this.ctx);
                }
                if (this.activeMap.id === 'medbay_sw') {
                    this.drawClinicInterior(this.ctx);
                }
                
                // Indoor V2: Room floors, windows, and doors
                if (this.roomSystem.active) {
                    this.roomSystem.drawFloors(this.ctx);
                    this.roomSystem.drawWindows(this.ctx, windowDaylight);
                    // Doors drawn AFTER walls (see below) so they render on top
                }
                
                // Pavements
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridPavements) {
                    const visiblePavements = this._renderGridPavements.query(cullBounds.world);
                    for (const p of visiblePavements) {
                        p.draw(this.ctx);
                    }
                }
                
                // Crosswalks
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                if (this._renderGridCrosswalks) {
                    const visibleCrosswalks = this._renderGridCrosswalks.query(cullBounds.world);
                    for (const cw of visibleCrosswalks) {
                        this.ctx.fillStyle = '#1a1a20';
                        this.ctx.fillRect(cw.x, cw.y, cw.w, cw.h);
                        
                        // Zebra stripes
                        this.ctx.fillStyle = '#ddd';
                        const stripeWidth = 12;
                        const stripeGap = 18;
                        
                        if (cw.orientation === 'H') {
                            for (let sy = cw.y + 8; sy < cw.y + cw.h - 8; sy += stripeGap) {
                                this.ctx.fillRect(cw.x + 8, sy, cw.w - 16, stripeWidth);
                            }
                        } else {
                            for (let sx = cw.x + 8; sx < cw.x + cw.w - 8; sx += stripeGap) {
                                this.ctx.fillRect(sx, cw.y + 8, stripeWidth, cw.h - 16);
                            }
                        }
                    }
                }
                
                // Building forecourts sit on top of the pavement (Silver Queen portico floor, steps, carpet)
                if (this.activeMap.buildings && this.activeMap.type === 'outdoor') {
                    const cbW = cullBounds.world;
                    for (const b of this.activeMap.buildings) {
                        if (b.style !== 'silver_queen' || !b._sqDrawGround) continue;
                        if (b.x + b.w < cbW.left || b.x > cbW.right || b.y > cbW.bottom || b.y + b.h + 160 < cbW.top) continue;
                        b._sqDrawGround(this.ctx);
                    }
                }
                this.decals.draw(this.ctx, cullBounds.world);
                
                this.profiler.stop('Render:Buildings');
                
                // Entrance Markers (Holo-Zones) - Periwinkle/Lavender Glow
                this.profiler.start('Render:Entities');
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.transitions) {
                    const cbW = cullBounds.world;
                    const pulse = (Math.sin(_frameTime / 200) + 1) / 2;
                    this.ctx.save();
                    this.activeMap.transitions.forEach(t => {
                        if (t.x + t.w < cbW.left || t.x > cbW.right || t.y + t.h < cbW.top || t.y > cbW.bottom) return;
                        
                        const cx = t.x + t.w / 2;
                        const cy = t.y + t.h / 2;
                        const maxR = Math.max(t.w, t.h) * 0.8;
                        
                        // Radial glow gradient floor mat
                        const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
                        grad.addColorStop(0, `rgba(180, 170, 255, ${0.2 + pulse * 0.12})`);
                        grad.addColorStop(0.6, `rgba(200, 190, 255, ${0.1 + pulse * 0.08})`);
                        grad.addColorStop(1, `rgba(220, 210, 255, 0)`);
                        this.ctx.fillStyle = grad;
                        this.ctx.fillRect(t.x - 20, t.y - 20, t.w + 40, t.h + 40);
                
                        // Inner floor fill
                        this.ctx.fillStyle = `rgba(200, 190, 255, ${0.08 + pulse * 0.06})`;
                        this.ctx.fillRect(t.x, t.y, t.w, t.h);
                
                        // Glowing border with shadowBlur
                        this.ctx.shadowColor = 'rgba(180, 170, 255, 0.8)';
                        this.ctx.shadowBlur = 12 + pulse * 6;
                        this.ctx.strokeStyle = `rgba(200, 190, 255, ${0.5 + pulse * 0.35})`;
                        this.ctx.lineWidth = 2;
                        this.ctx.strokeRect(t.x, t.y, t.w, t.h);
                        this.ctx.shadowBlur = 0;
                
                        // Corner markers - brighter periwinkle
                        this.ctx.strokeStyle = `rgba(210, 200, 255, ${0.7 + pulse * 0.3})`;
                        this.ctx.lineWidth = 2;
                        const cornerSize = 10;
                
                        // Top-left
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x, t.y + cornerSize);
                        this.ctx.lineTo(t.x, t.y);
                        this.ctx.lineTo(t.x + cornerSize, t.y);
                        this.ctx.stroke();
                
                        // Top-right
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x + t.w - cornerSize, t.y);
                        this.ctx.lineTo(t.x + t.w, t.y);
                        this.ctx.lineTo(t.x + t.w, t.y + cornerSize);
                        this.ctx.stroke();
                
                        // Bottom-left
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x, t.y + t.h - cornerSize);
                        this.ctx.lineTo(t.x, t.y + t.h);
                        this.ctx.lineTo(t.x + cornerSize, t.y + t.h);
                        this.ctx.stroke();
                
                        // Bottom-right
                        this.ctx.beginPath();
                        this.ctx.moveTo(t.x + t.w - cornerSize, t.y + t.h);
                        this.ctx.lineTo(t.x + t.w, t.y + t.h);
                        this.ctx.lineTo(t.x + t.w, t.y + t.h - cornerSize);
                        this.ctx.stroke();
                
                        // "ENTRANCE" text
                        // Outdoor maps: place BELOW the rect (the area above is occluded
                        // by the building's art). Indoor maps: place ABOVE the rect (the
                        // doorway sits against a wall and the label belongs over it).
                        if (Math.hypot(this.player.x - cx, this.player.y - cy) < 150) {
                            const isIndoor = this.activeMap.type === 'indoor';
                            this.ctx.fillStyle = '#ddd8ff';
                            this.ctx.font = '12px Orbitron';
                            this.ctx.textAlign = 'center';
                            this.ctx.textBaseline = isIndoor ? 'bottom' : 'top';
                            this.ctx.shadowColor = 'rgba(180, 170, 255, 0.9)';
                            this.ctx.shadowBlur = 12;
                            const labelY = isIndoor ? (t.y - 8) : (t.y + t.h + 8);
                            this.ctx.fillText("ENTRANCE", cx, labelY);
                            this.ctx.shadowBlur = 0;
                            this.ctx.textBaseline = 'alphabetic';
                        }
                    });
                    this.ctx.restore();
                }
                
                // --- DELIVERY DROP-OFF MARKER (world-space spinning amber coffee cup) ---
                if (this.missions.activeMission && this.missions.activeMission.status === 'active'
                    && this.missions.activeMission.type === MISSION_TYPES.DELIVERY
                    && this.missions.activeMission.pickedUp && this.activeMap.id === 'hub_949') {
                    const m = this.missions.activeMission;
                    const tx = m.targetX;
                    const ty = m.targetY;
                    const t = _frameTime;
                    const pulse = (Math.sin(t / 400) + 1) / 2;
                    const spin = (t / 1000) % (Math.PI * 2);
                    
                    this.ctx.save();
                    this.ctx.translate(tx, ty);
                    
                    // Ground glow ring
                    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
                    grad.addColorStop(0, `rgba(255, 170, 0, ${0.15 + pulse * 0.1})`);
                    grad.addColorStop(0.6, `rgba(255, 170, 0, ${0.05 + pulse * 0.05})`);
                    grad.addColorStop(1, 'rgba(255, 170, 0, 0)');
                    this.ctx.fillStyle = grad;
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, 50, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Spinning coffee cup icon
                    const scaleX = Math.cos(spin); // Creates 3D spin illusion
                    this.ctx.save();
                    this.ctx.scale(scaleX, 1);
                    
                    // Cup body (amber)
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 12 + pulse * 8;
                    this.ctx.fillStyle = `rgba(255, 170, 0, ${0.7 + pulse * 0.3})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(-8, -12);
                    this.ctx.lineTo(-6, 6);
                    this.ctx.quadraticCurveTo(0, 10, 6, 6);
                    this.ctx.lineTo(8, -12);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    // Cup rim (champagne)
                    this.ctx.fillStyle = '#f5e6c8';
                    this.ctx.fillRect(-9, -14, 18, 3);
                    
                    // Handle
                    this.ctx.strokeStyle = `rgba(255, 170, 0, ${0.6 + pulse * 0.3})`;
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(10, -4, 5, -Math.PI / 2, Math.PI / 2);
                    this.ctx.stroke();
                    
                    // Steam wisps
                    for (let i = 0; i < 3; i++) {
                        const sx = -3 + i * 3;
                        const sy = -14 - 4 - Math.sin(t / 300 + i * 2) * 4;
                        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + pulse * 0.1})`;
                        this.ctx.beginPath();
                        this.ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                    
                    // "DELIVER HERE" text
                    this.ctx.font = 'bold 10px Orbitron';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillStyle = `rgba(255, 170, 0, ${0.6 + pulse * 0.4})`;
                    this.ctx.shadowColor = '#ffaa00';
                    this.ctx.shadowBlur = 8;
                    this.ctx.fillText('DELIVER HERE', 0, 30);
                    this.ctx.shadowBlur = 0;
                    
                    this.ctx.restore();
                }
                
                // --- BOUNTY TARGET MARKER (world-space red skull indicator) ---
                if (this.missions.activeMission && this.missions.activeMission.status === 'active'
                    && this.missions.activeMission.type === MISSION_TYPES.BOUNTY
                    && this.missions.activeMission.targetEntity
                    && !this.missions.activeMission.targetEntity.dead
                    && this.activeMap.id === 'hub_949') {
                    const target = this.missions.activeMission.targetEntity;
                    const pulse = (Math.sin(_frameTime / 300) + 1) / 2;
                    
                    this.ctx.save();
                    this.ctx.translate(target.x, target.y - 35);
                    
                    // Red diamond marker above target
                    this.ctx.shadowColor = '#ff3355';
                    this.ctx.shadowBlur = 10 + pulse * 8;
                    this.ctx.fillStyle = `rgba(255, 51, 85, ${0.7 + pulse * 0.3})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, -10);
                    this.ctx.lineTo(7, 0);
                    this.ctx.lineTo(0, 10);
                    this.ctx.lineTo(-7, 0);
                    this.ctx.closePath();
                    this.ctx.fill();
                    
                    // Skull icon (simplified)
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = 'bold 8px sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('☠', 0, 4);
                    
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
            
                // Grid (Faint) - WITH VIEWPORT CULLING
                this.ctx.strokeStyle = 'rgba(164, 105, 255, 0.1)'; 
                this.ctx.lineWidth = 1;
                const gridSize = 100; 
                
                // Calculate visible area
                const halfW = (this.canvas.width / this.camera.zoom) / 2 + gridSize;
                const halfH = (this.canvas.height / this.camera.zoom) / 2 + gridSize;
                const gridMinX = Math.max(0, Math.floor((camX - halfW) / gridSize) * gridSize);
                const gridMaxX = Math.min(this.activeMap.width, Math.ceil((camX + halfW) / gridSize) * gridSize);
                const gridMinY = Math.max(0, Math.floor((camY - halfH) / gridSize) * gridSize);
                const gridMaxY = Math.min(this.activeMap.height, Math.ceil((camY + halfH) / gridSize) * gridSize);
                
                this.ctx.beginPath(); 
                for(let x = gridMinX; x <= gridMaxX; x += gridSize) { 
                    this.ctx.moveTo(x, gridMinY); 
                    this.ctx.lineTo(x, gridMaxY); 
                } 
                for(let y = gridMinY; y <= gridMaxY; y += gridSize) { 
                    this.ctx.moveTo(gridMinX, y); 
                    this.ctx.lineTo(gridMaxX, y); 
                } 
                this.ctx.stroke();
                
                // Map Walls
                // PERFORMANCE: RenderGrid spatial query — O(visible cells) not O(N)
                {
                    const visibleWalls = this._renderGridWalls.query(cullBounds.world);
                    for (const w of visibleWalls) {
                        this.ctx.fillStyle = '#222'; 
                        this.ctx.fillRect(w.x, w.y, w.w, w.h); 
                        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)'; 
                        this.ctx.strokeRect(w.x, w.y, w.w, w.h); 
                    }
                }
            
                // Indoor V2: Doors (drawn OVER walls so they're visible in wall gaps)
                if (this.roomSystem.active) {
                    this.roomSystem.drawDoors(this.ctx);
                }
            
                // 3. DYNAMIC ENTITIES & CARS
                // PERFORMANCE: AABB viewport culling for props
                {
                    const cbP = cullBounds.props;
                    this.props.forEach(p => {
                        const px = p.x + (p.w || 0) / 2;
                        const py = p.y + (p.h || 0) / 2;
                        if (px < cbP.left || px > cbP.right || py < cbP.top || py > cbP.bottom) return;
                        p.draw(this.ctx);
                    });
                }
                
                // Draw Traffic Cars
                // PERFORMANCE: AABB viewport culling + distance LOD
                {
                    const cbV = cullBounds.vehicles;
                    this.traffic.vehicles.forEach(v => {
                        if (!v.visible) return;
                        if (v.x < cbV.left || v.x > cbV.right || v.y < cbV.top || v.y > cbV.bottom) return;
                        // LOD: 0 = full effects, 1 = no glows/shadows
                        // Threshold scales with zoom — distant cars at max zoom-out skip effects earlier
                        const dx = v.x - camX, dy = v.y - camY;
                        v._lod = (dx * dx + dy * dy > _vehicleLODThreshSq) ? 1 : (_zoomLOD >= 2 ? 1 : 0);
                        v.draw(this.ctx);
                    });
                }
                
                // Draw Owned Car (if parked/separate)
                if (this.ownedCar && this.ownedCar !== this.car && this.ownedCar.visible) {
                    this.ownedCar.draw(this.ctx);
                }
                
                // Draw Delivery Vehicle (persistent, never despawns)
                if (this.deliveryVehicle && this.deliveryVehicle.visible) {
                    const cbV = cullBounds.vehicles;
                    const dv = this.deliveryVehicle;
                    if (!(dv.x < cbV.left || dv.x > cbV.right || dv.y < cbV.top || dv.y > cbV.bottom)) {
                        dv._lod = 0;
                        dv.draw(this.ctx);
                        
                        // Draw amber package beside the vehicle (if delivery mission active, not yet picked up)
                        if (this.missions.activeMission && this.missions.activeMission.type === MISSION_TYPES.DELIVERY
                            && !this.missions.activeMission.pickedUp) {
                            const pkgX = dv.x + Math.cos(dv.angle + Math.PI / 2) * (dv.vehicleWidth / 2 + 15);
                            const pkgY = dv.y + Math.sin(dv.angle + Math.PI / 2) * (dv.vehicleWidth / 2 + 15);
                            const pulse = (Math.sin(_frameTime / 500) + 1) / 2;
                            
                            this.ctx.save();
                            this.ctx.translate(pkgX, pkgY);
                            
                            // Glow
                            this.ctx.shadowColor = '#ffaa00';
                            this.ctx.shadowBlur = 8 + pulse * 6;
                            
                            // Amber box
                            this.ctx.fillStyle = '#cc8800';
                            this.ctx.fillRect(-8, -6, 16, 12);
                            
                            // Champagne stripe
                            this.ctx.fillStyle = '#f5e6c8';
                            this.ctx.fillRect(-8, -1, 16, 2);
                            
                            // Vertical champagne stripe
                            this.ctx.fillRect(-1, -6, 2, 12);
                            
                            // Box edge highlight
                            this.ctx.strokeStyle = '#ffcc44';
                            this.ctx.lineWidth = 0.5;
                            this.ctx.strokeRect(-8, -6, 16, 12);
                            
                            this.ctx.shadowBlur = 0;
                            this.ctx.restore();
                        }
                    }
                }
            
                this.lastKnownMarkers.forEach(m => m.draw(this.ctx));
                
                // PERFORMANCE: AABB viewport culling for entities
                {
                    const cbE = cullBounds.entities;
                    this.loot.forEach(l => {
                        if (l.x < cbE.left || l.x > cbE.right || l.y < cbE.top || l.y > cbE.bottom) return;
                        l.draw(this.ctx);
                    });
                    this.npcs.forEach(n => {
                        if (n.x < cbE.left || n.x > cbE.right || n.y < cbE.top || n.y > cbE.bottom) return;
                        n.draw(this.ctx);
                    });
                    this.pedestrians.draw(this.ctx, cbE); // Roaming civilians
                    this.teammates.forEach(tm => {
                        if (tm.x < cbE.left || tm.x > cbE.right || tm.y < cbE.top || tm.y > cbE.bottom) return;
                        tm.draw(this.ctx, this.player);
                    });
                    // Velvet Cat
                    if (this.velvetCat && this.velvetCat.visible && !this.velvetCat.inCar) {
                        this.velvetCat.draw(this.ctx);
                    }
                    this.enemies.forEach(e => {
                        if (e.x < cbE.left || e.x > cbE.right || e.y < cbE.top || e.y > cbE.bottom) return;
                        e.draw(this.ctx);
                    });
                    
                    // Sticky Orbs (Golden Child DOT — rendered on top of enemies)
                    for (const orb of this.stickyOrbs) {
                        if (!orb.target || orb.target.dead) continue;
                        const ox = orb.target.x + orb.offsetX;
                        const oy = orb.target.y + orb.offsetY;
                        // Smooth shrink as ticks deplete
                        const lifeRatio = orb.ticksLeft / orb.maxTicks;
                        const r = Math.max(orb.maxRadius * lifeRatio, 1);
                        
                        // Outer pulse glow
                        const pulse = 0.4 + 0.3 * Math.sin(_frameTime / 150);
                        this.ctx.shadowColor = '#FFD700';
                        this.ctx.shadowBlur = 8;
                        this.ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r + 2, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Core orb
                        this.ctx.fillStyle = '#FFD700';
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // White hot center
                        this.ctx.fillStyle = '#fffbe6';
                        this.ctx.beginPath();
                        this.ctx.arc(ox, oy, r * 0.4, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.shadowBlur = 0;
                    }
                }
                
                // Active Car (The one player is driving)
                if (this.car.visible) this.car.draw(this.ctx);
                
                // Bumper Car Minigame — draw all bumper cars
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.bumperMinigame.draw(this.ctx, this.camera);
                }
                
                // Indoor V2: Roof occlusion (fades in when player is on outdoor segment)
                if (this.roomSystem.active) {
                    this.roomSystem.drawRoofOcclusion(this.ctx);
                }
                
                // Flit VFX (ghost afterimage, lightning trails — drawn behind player)
                if (this.flitVFX.length > 0) this.drawFlitVFX(this.ctx);

                // Player
                if (this.player.visible) { 
                    if (this.flitState.active) this.ctx.globalAlpha = 0.5; 
                    this.drawPlayer(); 
                    this.ctx.globalAlpha = 1.0; 
                    this.drawPlayerEmote();
                }
                
                // ── UNIFIED BUBBLE PASS ──
                // Speech bubbles (NPC + pedestrian) draw AFTER all character
                // bodies so they're never covered by the player, teammates,
                // or other NPCs walking past. They still go under building
                // roofs, foliage canopy, and weather — those layers come
                // later in the render order, which is intentional: an
                // indoor pedestrian's bubble shouldn't punch through the
                // roof when you're standing outside.
                {
                    const cbE = cullBounds.entities;
                    for (const n of this.npcs) {
                        if (!n.quipText) continue;
                        if (n.x < cbE.left || n.x > cbE.right || n.y < cbE.top || n.y > cbE.bottom) continue;
                        n.drawQuipBubble(this.ctx);
                    }
                    this.pedestrians.drawQuipBubbles(this.ctx, cbE);
                    // Teammates can theoretically have quipText too (shared NPC class)
                    for (const tm of this.teammates) {
                        if (!tm.quipText) continue;
                        if (tm.x < cbE.left || tm.x > cbE.right || tm.y < cbE.top || tm.y > cbE.bottom) continue;
                        tm.drawQuipBubble(this.ctx);
                    }
                }
                
                // Laser Sight beam (drawn after player, in world space) — from the gun's muzzle
                // along the exact line the next shot takes (see getLaserSight / fireWeapon)
                const laser = this.getLaserSight();
                if (laser) {
                    const muzzleX = laser.x0, muzzleY = laser.y0, hitX = laser.x1, hitY = laser.y1;
                    
                    // Red laser beam
                    this.ctx.save();
                    this.ctx.strokeStyle = 'rgba(255, 20, 0, 0.35)';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.setLineDash([6, 4]);
                    this.ctx.beginPath();
                    this.ctx.moveTo(muzzleX, muzzleY);
                    this.ctx.lineTo(hitX, hitY);
                    this.ctx.stroke();
                    this.ctx.setLineDash([]);
                    
                    // Bright dot at hit point
                    const dotPulse = 0.6 + 0.35 * Math.sin(_frameTime / 200);
                    this.ctx.fillStyle = `rgba(255, 0, 0, ${dotPulse})`;
                    this.ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
                    this.ctx.shadowBlur = 4;
                    this.ctx.beginPath();
                    this.ctx.arc(hitX, hitY, 2.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
                
                // Passenger lean-out rendering — draw in-car companions at their seat positions
                // Uses drawProceduralHumanoid with isDriving flag for unified lean-out animation
                // Drawn BEFORE the car overlay so the car body partially covers them
                if (this.isDriving && this.car && this.car.seatLayout) {
                    for (let i = 1; i < this.car.seatLayout.length; i++) {
                        const occ = this.car.seatOccupants[i];
                        if (!occ || occ === true || !occ.inCar) continue;
                        
                        const seat = this.car.seatLayout[i];
                        const seatPos = this.car.getSeatWorldPos(i);
                        
                        // Draw at seat position (no lean offset)
                        const drawX = seatPos.x;
                        const drawY = seatPos.y;
                        
                        // Resolve appearance — teammates have it, dancers need defaults
                        const isShooting = occ.cooldown !== undefined && occ.cooldown > 0;
                        const app = occ.appearance || {};
                        const isDemon = occ.role === 'red_demon_dancer';
                        const isDancer = occ.role === 'dancer' || isDemon;
                        
                        // Build appearance config with fallbacks for dancers
                        const skinColor = app.skinColor || (isDemon ? '#8b2500' : '#c68642');
                        const topColor = app.top || (isDemon ? { type: 'sports_bra', color: '#440000' } : { type: 'sports_bra', color: '#ff55aa' });
                        const bottomColor = app.bottom || (isDemon ? { type: 'skirt', color: '#220000' } : { type: 'skirt', color: '#ff88cc' });
                        const shoesColor = app.shoes || { type: 'heels', color: isDemon ? '#660000' : '#ff69b4' };
                        const hairConfig = app.hair || (isDemon ? { type: 'long', color: '#330000' } : { type: 'curls', color: '#111' });
                        
                        // Set up canvas context — translate to seat position, rotate
                        // In combat: face target. Otherwise: face car forward.
                        const occAngle = (occ.combatTargetTimer > 0 && occ.combatTargetAngle !== undefined)
                            ? occ.combatTargetAngle
                            : this.car.angle;
                        this.ctx.save();
                        this.ctx.translate(drawX, drawY);
                        this.ctx.rotate(occAngle);
                        
                        drawProceduralHumanoid(this.ctx, occ, {
                            skinColor: skinColor,
                            gender: occ.gender || 'female',
                            isDriving: true,
                            isShootingFromCar: isShooting,
                            carAngle: this.car.angle,
                            recoil: isShooting ? 0.5 : 0,
                            stance: isShooting ? 'pistol' : 'idle',
                            top: topColor,
                            bottom: bottomColor,
                            shoes: shoesColor,
                            hair: hairConfig,
                            hat: app.hat || null
                        });
                        
                        this.ctx.restore();
                    }
                }
                
                // Car Door Frame Overlay (creates "leaning out" illusion)
                // Drawn AFTER player/occupants to make them appear INSIDE the car
                if (this.isDriving && this.car.visible && this.car.drawOccupantOverlay) {
                    this.car.drawOccupantOverlay(this.ctx);
                }
                
                // DEBUG: Draw red center dots for in-car occupants ON TOP of the car overlay
                if (this.debugMode && this.isDriving && this.car && this.car.seatLayout) {
                    for (let i = 1; i < this.car.seatLayout.length; i++) {
                        const occ = this.car.seatOccupants[i];
                        if (!occ || occ === true || !occ.inCar) continue;
                        const seat = this.car.seatLayout[i];
                        const seatPos = this.car.getSeatWorldPos(i);
                        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
                        this.ctx.beginPath();
                        this.ctx.arc(seatPos.x, seatPos.y, 3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    // Player driver dot
                    const driverPos = this.car.getSeatWorldPos(0);
                    if (driverPos) {
                        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
                        this.ctx.beginPath();
                        this.ctx.arc(driverPos.x, driverPos.y, 3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
                
                // Ferris Wheel BASE (legs/shadow — under building roofs)
                if (this.activeMap.ferrisWheel) {
                    this.activeMap.ferrisWheel.drawBase(this.ctx);
                }
                
                // Buildings - TOP LAYER (roofs, upper floors) - drawn OVER player for occlusion
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildingTops;
                    this.activeMap.buildings.forEach(b => {
                        if (b.isV2 && b.drawTop) {
                            const bRight = b.x + (b.w || 200);
                            const bBottom = b.y + (b.h || 200);
                            if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                            
                            b.drawTop(this.ctx, this.worldMinutes);
                        }
                    });
                }
                
                // BuildingV3 — Editor-exported buildings (full render with details)
                if (this.activeMap._v3Buildings) {
                    this.activeMap._v3Buildings.forEach(b => {
                        b.draw(this.ctx, performance.now());
                    });
                }
                
                // Buildings - SIGN LAYER (neon signs above entrance) - drawn OVER building tops
                // PERFORMANCE: AABB viewport culling
                if (this.activeMap.buildings) {
                    const cb = cullBounds.buildingTops;
                    this.activeMap.buildings.forEach(b => {
                        if (b.isV2 && b.drawSign) {
                            const bRight = b.x + (b.w || 200);
                            const bBottom = b.y + (b.h || 200);
                            if (bRight < cb.left || b.x > cb.right || bBottom < cb.top || b.y > cb.bottom) return;
                            
                            b.drawSign(this.ctx);
                        }
                    });
                }
                
                // Foliage (trees and bushes) - drawn AFTER player so canopy appears overhead
                // PERFORMANCE: AABB viewport culling + cached frameTime
                if (this.activeMap.foliage) {
                    const wind = this.weather ? this.weather.wind : 0.3;
                    const windDir = this.weather ? this.weather.windDirection : 1;
                    const cb = cullBounds.foliage;
                    const foliageScale = GameSettings.getFoliageScale();
                    this.activeMap.foliage.forEach((f, idx) => {
                        // Density culling: skip foliage based on setting (uses stable index so same trees always hidden)
                        if (foliageScale < 1.0 && (idx % Math.round(1 / foliageScale)) !== 0) return;
                        if (f.x < cb.left || f.x > cb.right || f.y < cb.top || f.y > cb.bottom) return;
                        f.draw(this.ctx, wind, windDir, _gameTimeSec);  // smooth game time (was sampled once per tick)
                    });
                }
                
                // Floating leaf particles - drawn after foliage, before weather
                if (this.leafParticles) {
                    this.leafParticles.draw(this.ctx);
                }
                
                // Ferris Wheel TOP (rims, gondolas, hub — above buildings, trees, everything)
                if (this.activeMap.ferrisWheel) {
                    this.activeMap.ferrisWheel.drawTop(this.ctx);
                }
                
                // Indoor V2: Silk linens (atmospheric cloth with pooled light)
                if (this.roomSystem.active && this.roomSystem.linens.length > 0) {
                    const wind = this.weather ? this.weather.wind : 0.3;
                    const windDir = this.weather ? this.weather.windDirection : 1;
                    this.roomSystem.drawLinens(this.ctx, wind, windDir, _gameTimeSec);
                }
                
                // Top Layer Props (Lamps/Weather)
                
                // 1. Calculate daylight intensity (pre-calculated above)
                // Lamps turn OFF when daylight value is > 0.2
            
                // 2. Draw lamps passing the calculated daylight factor
                // PERFORMANCE: AABB viewport culling
                const cbLamps = cullBounds.lamps;
                const _roofHidesIndoorLamps = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                this.lamps.forEach(l => {
                    if (l.x < cbLamps.left || l.x > cbLamps.right || l.y < cbLamps.top || l.y > cbLamps.bottom) return;
                    // Skip indoor lamps when roof is occluding
                    if (_roofHidesIndoorLamps) {
                        for (const rid in this.roomSystem.rooms) {
                            const r = this.roomSystem.rooms[rid];
                            if (r.type !== 'outdoor' && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) return;
                        }
                    }
                    // Set per-frame forced-off flag for room light switches
                    l._forcedOff = this.roomSystem.isLampRoomDark(l);
                    l.draw(this.ctx, daylight);
                }); 
            
                // 3. Draw projectiles and weather effects
                this.projectiles.forEach(p => p.draw(this.ctx));
                
                // Debug: nav grid, companion paths and eyeline spots
                // (with the debug overlay, or on its own via `game.navDebug = true`)
                if (this.debugMode || this.navDebug) this.drawNavDebug(this.ctx);

                // Debug: visualize ALL projectile positions (catches invisible ghosts)
                if (this.debugMode) {
                    // Show game array projectiles as green dots
                    this.ctx.save();
                    for (const p of this.projectiles) {
                        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    // Show registry projectiles as red dots (orphans would be red WITHOUT green)
                    const regProjs = GameEntity.registry.collidable.filter(e => 
                        e.collisionLayer === GameEntity.LAYER.PROJECTILE
                    );
                    for (const rp of regProjs) {
                        this.ctx.fillStyle = rp.active ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 255, 0, 0.4)';
                        this.ctx.beginPath();
                        this.ctx.arc(rp.x, rp.y, 10, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.restore();
                    
                    // Debug: Seat positions on player's car and nearby vehicles
                    if (this.isDriving && this.car && this.car.seatLayout) {
                        this.ctx.save();
                        const car = this.car;
                        for (let i = 0; i < car.seatLayout.length; i++) {
                            const seat = car.seatLayout[i];
                            const pos = car.getSeatWorldPos(i);
                            const occupied = car.seatOccupants[i] != null;
                            
                            // Seat dot
                            this.ctx.fillStyle = seat.isDriver ? 'rgba(255,215,0,0.8)' : 
                                occupied ? 'rgba(0,255,136,0.8)' : 'rgba(255,255,255,0.3)';
                            this.ctx.beginPath();
                            this.ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
                            this.ctx.fill();
                            
                            // Firing arc (180° hemisphere) — only for non-driver seats
                            if (!seat.isDriver) {
                                const arcCenter = car.angle + seat.fireAngle;
                                this.ctx.strokeStyle = occupied ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)';
                                this.ctx.lineWidth = 1;
                                this.ctx.beginPath();
                                this.ctx.arc(pos.x, pos.y, 30, arcCenter - Math.PI / 2, arcCenter + Math.PI / 2);
                                this.ctx.stroke();
                                
                                // Arc direction line
                                this.ctx.strokeStyle = occupied ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.15)';
                                this.ctx.beginPath();
                                this.ctx.moveTo(pos.x, pos.y);
                                this.ctx.lineTo(pos.x + Math.cos(arcCenter) * 25, pos.y + Math.sin(arcCenter) * 25);
                                this.ctx.stroke();
                            }
                            
                            // Seat label
                            this.ctx.fillStyle = '#fff';
                            this.ctx.font = '8px monospace';
                            this.ctx.textAlign = 'center';
                            this.ctx.fillText(`S${i}`, pos.x, pos.y - 7);
                        }
                        this.ctx.restore();
                    }
                    
                    // HUD counter (screen space)
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    this.ctx.fillStyle = '#0f0';
                    this.ctx.font = '12px monospace';
                    this.ctx.fillText(`PROJ array: ${this.projectiles.length}  |  registry: ${regProjs.length}`, 10, this.canvas.height - 30);
                    this.ctx.restore();
                }
                
                this.weather.draw(this.ctx);
                
                // Graveyard humanoid ghosts
                if (this.graveyardGhosts.length > 0) this.drawGraveyardGhosts(this.ctx);
                
                this.profiler.stop('Render:Entities');
                
                // 4. LIGHTING SYSTEM & DEBUG
                this.profiler.start('Render:Lighting');
                this.drawLightingSystem(this.ctx);
                // Glowing details drawn after the darkness layer: windows, neon, rooftops, sky
                this.drawEmissivePass(this.ctx);
                
                // Profiler (independent of debug mode)
                if (this.showProfiler) {
                    this.profiler.draw(this.ctx, 20, 150); 
                }
                
                // Debug Overlay (traffic network, entity stats, lighting debug)
                if (this.debugMode) {
                    this.drawDebugLighting(this.ctx);
                    
                    // Entity System Stats (Screen Space)
                    if (this.useNewCollisionSystem) {
                        this.ctx.save();
                        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                        
                        // Background panel
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                        this.ctx.fillRect(10, 400, 180, 105);
                        this.ctx.strokeStyle = '#00ff88';
                        this.ctx.lineWidth = 1;
                        this.ctx.strokeRect(10, 400, 180, 105);
                        
                        // Stats
                        this.ctx.font = 'bold 12px Consolas';
                        this.ctx.fillStyle = '#00ff88';
                        this.ctx.fillText('ENTITY SYSTEM', 20, 418);
                        
                        this.ctx.font = '11px Consolas';
                        this.ctx.fillStyle = '#00ffaa';
                        this.ctx.fillText(`Entities: ${GameEntity.registry.all.length}`, 20, 435);
                        this.ctx.fillText(`Collidable: ${GameEntity.registry.collidable.length}`, 20, 450);
                        this.ctx.fillText(`Checks: ${CollisionSystem.stats.totalChecks}`, 20, 465);
                        this.ctx.fillText(`Resolved: ${CollisionSystem.stats.collisionsResolved}`, 20, 480);
                        this.ctx.fillText(`Pedestrians: ${this.pedestrians.pedestrians.length}`, 20, 495);
                        
                        this.ctx.restore();
                    }
                }
            
                this.ctx.restore();
                
                this.profiler.stop('Render:Lighting');
                
                // 5. SCREEN SPACE UI (Overlays)
                this.profiler.start('Render:PostFX');
                
                // Wet-world post-processing (after lighting, before rain)
                const ambient = this.getAmbientDarkness();
                if (ambient > 0.2) {
                    this.drawWetReflections(this.ctx);
                    this.drawBloomPass(this.ctx);
                }
                this.drawAtmospherePass(this.ctx);
                
                const showRainOverlay = this.activeMap.type === 'outdoor' || this.roomSystem.isPlayerOutdoor();
                if (showRainOverlay) {
                    const rainLamps = this.activeMap._interiorLights ? [...this.lamps, ...this.activeMap._interiorLights] : this.lamps;
                    this.weather.drawRainOverlay(this.ctx, this.camera, rainLamps);
                }
                
                // Dynamic Bokeh (Screen-space dreampunk depth-of-field)
                if (this.bokeh) {
                    this.bokeh.update(this.deltaTime || 16);
                    this.bokeh.draw(this.ctx, this.canvas.width, this.canvas.height, _frameTime);
                }
                
                // Mission waypoint marker (screen-space indicator)
                if (this.missions.activeMission && this.missions.activeMission.status === 'active' 
                    && this.activeMap && this.activeMap.id === 'hub_949') {
                    this.drawMissionMarker();
                }
                
                // HUD mission objective text (top of screen)
                if (this.missions.activeMission && this.missions.activeMission.status === 'active') {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    const objText = this.missions.getObjectiveText();
                    if (objText) {
                        this.ctx.font = 'bold 11px Courier New';
                        this.ctx.textAlign = 'center';
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(this.canvas.width / 2 - 200, 4, 400, 20);
                        this.ctx.fillStyle = '#ffaa00';
                        this.ctx.globalAlpha = 0.8 + 0.2 * Math.sin(_frameTime / 500);
                        this.ctx.fillText(objText, this.canvas.width / 2, 18);
                    }
                    this.ctx.restore();
                }
                
                // Vehicle HUD Info (bottom-left)
                if (this.isDriving && this.car && !(this.bumperMinigame && this.bumperMinigame.active)) {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space
                    
                    const isOwnedCar = this.car === this.ownedCar;
                    const isZibRide = this.zibSystem && this.zibSystem.isPassenger;
                    const vhudY = this.canvas.height - 40;
                    this.ctx.font = 'bold 7px Courier New';
                    this.ctx.fillStyle = isZibRide ? '#8a2be2' : isOwnedCar ? '#FFD700' : '#ffaa00';
                    this.ctx.shadowColor = isZibRide ? '#8a2be2' : isOwnedCar ? '#FFD700' : '#ffaa00';
                    this.ctx.shadowBlur = 4;
                    this.ctx.textAlign = 'left';
                    
                    const vehicleText = isZibRide ?
                        '► ZIB AUTONOMOUS TAXI (PASSENGER)' :
                        isOwnedCar ? 
                        `► ${this.garage.getDisplayName(this.garage.activeIndex).toUpperCase()} (YOUR CAR)` : 
                        `► ${this.car.brand.toUpperCase()} ${this.car.modelName.toUpperCase()} (HIJACKED)`;
                    this.ctx.fillText(vehicleText, 20, vhudY);
                    
                    if (!isOwnedCar && this.ownedCar.visible) {
                        const dx = this.ownedCar.x - this.player.x;
                        const dy = this.ownedCar.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        this.ctx.font = '6px Courier New';
                        this.ctx.fillStyle = '#FFD700';
                        this.ctx.shadowColor = '#FFD700';
                        this.ctx.shadowBlur = 3;
                        this.ctx.fillText(`YOUR CAR: ${Math.round(distance)}m away`, 20, vhudY + 9);
                    }
                    this.ctx.shadowBlur = 0;
                    this.ctx.restore();
                }
                
                // 6. CSS FILTERS (Night Vision / Grayscale / Color Grade)
                const targetNV = this.nightVision ? 1.0 : 0.0;
                this.nvIntensity += (targetNV - this.nvIntensity) * 0.08;
                
                // Color grade multipliers (from custom grade panel)
                const _gg = (typeof _gameGrade !== 'undefined') ? _gameGrade : null;
                const ggBright = _gg ? _gg.brightness / 100 : 1;
                const ggContrast = _gg ? _gg.contrast / 100 : 1;
                const ggSaturate = _gg ? _gg.saturate / 100 : 1;
                const ggExposure = _gg ? (1 + _gg.exposure / 200) : 1;
            
                let filterChain;
                if (this.nvIntensity > 0.98) {
                    filterChain = `grayscale(100%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)})`;
                    // Ms. Jean Soda: pink tinge over NV
                    if (this.player.buffSystem.isActive('jeanSoda')) {
                        filterChain = `grayscale(80%) brightness(${(1.4 * ggBright * ggExposure).toFixed(2)}) contrast(${(1.2 * ggContrast).toFixed(2)}) sepia(0.3) hue-rotate(300deg) saturate(${(1.5 * ggSaturate).toFixed(2)})`;
                    }
                } else {
                    if (this.player.visibility !== undefined) {
                        this.targetGrayscale = (1.0 - this.player.visibility) * 100;
                        this.visualGrayscale += (this.targetGrayscale - this.visualGrayscale) * 0.05;
                        if (this.visualGrayscale < 0.5) this.visualGrayscale = 0;
                    }
                    const sat = 1.4 * (1.0 - this.nvIntensity) * ggSaturate; 
                    const con = (1.35 + (0.15 * this.nvIntensity)) * ggContrast; 
                    const sepia = 0.18 * (1.0 - this.nvIntensity);
                    const bright = (1.1 + (1.4 * this.nvIntensity)) * ggBright * ggExposure;
                    const effectiveGray = Math.max(this.visualGrayscale, this.nvIntensity * 100);
                    filterChain = `grayscale(${effectiveGray.toFixed(0)}%) contrast(${con.toFixed(2)}) saturate(${sat.toFixed(2)}) sepia(${sepia.toFixed(2)}) brightness(${bright.toFixed(2)})`;
                    // Ms. Jean Soda: subtle pink warmth even outside NV
                    if (this.player.buffSystem.isActive('jeanSoda')) {
                        filterChain += ` hue-rotate(8deg)`;
                    }
                }
                
                if (this.canvas.style.filter !== filterChain) {
                    this.canvas.style.filter = filterChain;
                }
                
                // ── ECHO PULSE TACTICAL RADAR ──
                if (this.augments && this.augments.isEquipped('radar_ext') && !this.paused) {
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    
                    const RADAR_RADIUS = 60;
                    const RADAR_RANGE = 600;  // world-px detection radius
                    const cx = this.canvas.width - RADAR_RADIUS - 16;
                    const cy = this.canvas.height - RADAR_RADIUS - 60;
                    const playerX = this.isDriving && this.car ? this.car.x : this.player.x;
                    const playerY = this.isDriving && this.car ? this.car.y : this.player.y;
                    const scale = RADAR_RADIUS / RADAR_RANGE;
                    
                    // Background disc
                    this.ctx.globalAlpha = 0.35;
                    this.ctx.fillStyle = '#0a0a18';
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Concentric rings
                    this.ctx.globalAlpha = 0.2;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 0.5;
                    for (let r = 1; r <= 3; r++) {
                        this.ctx.beginPath();
                        this.ctx.arc(cx, cy, RADAR_RADIUS * r / 3, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                    
                    // Sweep line
                    this.ctx.globalAlpha = 0.25;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 1;
                    const sweepAngle = (_frameTime / 1200) % (Math.PI * 2);
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx, cy);
                    this.ctx.lineTo(cx + Math.cos(sweepAngle) * RADAR_RADIUS, cy + Math.sin(sweepAngle) * RADAR_RADIUS);
                    this.ctx.stroke();
                    
                    // Sweep trail (fading arc behind sweep line)
                    const sweepGrad = this.ctx.createConicGradient(sweepAngle - 0.8, cx, cy);
                    sweepGrad.addColorStop(0, 'rgba(0, 243, 255, 0)');
                    sweepGrad.addColorStop(0.12, 'rgba(0, 243, 255, 0.08)');
                    sweepGrad.addColorStop(0.13, 'rgba(0, 243, 255, 0)');
                    this.ctx.globalAlpha = 1.0;
                    this.ctx.fillStyle = sweepGrad;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Enemy blips (crimson)
                    this.ctx.globalAlpha = 0.9;
                    for (const e of this.enemies) {
                        if (e.dead || !e.active) continue;
                        const dx = (e.x - playerX) * scale;
                        const dy = (e.y - playerY) * scale;
                        if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
                        this.ctx.fillStyle = '#ff2244';
                        this.ctx.shadowColor = '#ff2244';
                        this.ctx.shadowBlur = 4;
                        this.ctx.beginPath();
                        this.ctx.arc(cx + dx, cy + dy, 2.5, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    
                    // Friendly NPC blips (teal) — teammates
                    for (const n of this.npcs) {
                        if (!n.active || n.dead || n.alliance === 'hostile') continue;
                        if (!n.isRecruited) continue;
                        const dx = (n.x - playerX) * scale;
                        const dy = (n.y - playerY) * scale;
                        if (Math.hypot(dx, dy) > RADAR_RADIUS - 2) continue;
                        this.ctx.fillStyle = '#00f3ff';
                        this.ctx.shadowColor = '#00f3ff';
                        this.ctx.shadowBlur = 3;
                        this.ctx.beginPath();
                        this.ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.shadowBlur = 0;
                    
                    // Player dot (gold center)
                    this.ctx.globalAlpha = 1.0;
                    this.ctx.fillStyle = '#ffd700';
                    this.ctx.shadowColor = '#ffd700';
                    this.ctx.shadowBlur = 5;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.shadowBlur = 0;
                    
                    // Border ring
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.strokeStyle = '#00f3ff';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, RADAR_RADIUS, 0, Math.PI * 2);
                    this.ctx.stroke();
                    
                    // Label
                    this.ctx.globalAlpha = 0.4;
                    this.ctx.fillStyle = '#00f3ff';
                    this.ctx.font = 'bold 7px Courier New';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('ECHO PULSE', cx, cy - RADAR_RADIUS - 4);
                    
                    this.ctx.restore();
                }
            
                this.profiler.stop('Render:PostFX');
                
                // --- PROFILER END ---
                this.profiler.stop('Render:Total');
                if (PerfBench.active) PerfBench.sample(this.profiler.frameDeltas());
                // Bench overlay draws regardless of the profiler panel state, so a
                // sweep is always visible while it runs.
                PerfBench.draw(this.ctx, 20, this.canvas.height - 110);
                this.profiler.tick(); 
            }

            /* =====================================================================
               APARTMENT CITY BACKDROP
               ---------------------------------------------------------------------
               Draws a simplified city view visible from the apartment veranda.
               Small buildings, neon glows, tiny car/pedestrian sprites for life.
               ===================================================================== */
            /** Clinic floor details: tiles, wayfinding stripe, scanner platform, curtain tracks. */
            /** apt_949 floor art: veranda deck, living-room planks, kitchen tiles, rugs, bedroom boards, bathroom tiles. */
            drawApartmentInterior(ctx) {
                const lines = (x0, y0, x1, y1, step, vertical, color, lw = 1) => {
                    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
                    if (vertical) for (let x = x0 + step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
                    else for (let y = y0 + step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
                    ctx.stroke();
                };
                const rug = (x, y, w, h, base, border, inner) => {
                    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 3, w, h, 8); ctx.fill();
                    ctx.fillStyle = base; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
                    ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x + 7, y + 7, w - 14, h - 14, 5); ctx.stroke();
                    if (inner) { ctx.strokeStyle = inner; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 4); ctx.stroke(); }
                };
                ctx.save();
                lines(8, 8, 1392, 200, 14, false, 'rgba(0,0,0,0.16)');                                   // veranda deck boards
                lines(8, 208, 900, 892, 28, true, 'rgba(0,0,0,0.14)');                                   // living-room planks
                ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath();                                   // staggered plank joints
                for (let i = 0, x = 8; x < 900; x += 28, i++) for (let y = 208 + (i % 3) * 70; y < 892; y += 210) { ctx.moveTo(x, y); ctx.lineTo(x + 28, y); }
                ctx.stroke();
                ctx.fillStyle = '#4a2a2c'; ctx.fillRect(84, 690, 520, 202);                              // kitchen stone tiles
                lines(84, 690, 604, 892, 40, true, 'rgba(0,0,0,0.2)'); lines(84, 690, 604, 892, 40, false, 'rgba(0,0,0,0.2)');
                ctx.strokeStyle = 'rgba(239,230,220,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(84.5, 690.5, 520, 202);
                rug(320, 396, 334, 214, APT.wineLt, APT.blush, 'rgba(239,230,220,0.35)');                  // lounge rug
                lines(908, 208, 1392, 548, 24, true, 'rgba(255,255,255,0.05)');                          // bedroom boards
                rug(975, 270, 160, 130, '#8a5560', APT.blushLt, null);                                   // bedroom rug under the bed foot
                lines(908, 556, 1392, 892, 32, true, 'rgba(0,0,0,0.09)'); lines(908, 556, 1392, 892, 32, false, 'rgba(0,0,0,0.09)');   // bathroom tiles
                ctx.fillStyle = APT.blushLt; ctx.beginPath(); ctx.roundRect(1270, 672, 76, 30, 8); ctx.fill();   // bath mat
                ctx.restore();
            }

            /** apt_949 glows after the darkness layer: lamp shades, pendants, fireplace, cooktops, veranda string lights. */
            drawApartmentGlow(ctx) {
                const t = _frameTime / 1000, rs = this.roomSystem;
                const dark = (x, y) => { const r = rs && rs.active ? rs.getRoomAt(x, y) : null; return !!(r && r.lightsOff); };
                const glow = (x, y, r, c0, c1) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // Lamp shades and bar pendants (they follow the room switches)
                const shades = [[353, 484, 30], [573, 484, 30], [991, 232, 28], [1115, 232, 28], [307, 439, 34], [700, 700, 34], [109, 463, 34], [231, 759, 22], [350, 759, 22], [469, 759, 22]];
                for (const [x, y, r] of shades) {
                    if (dark(x, y)) continue;
                    glow(x, y, r, 'rgba(255,210,160,0.26)', 'rgba(255,190,140,0)');
                    ctx.fillStyle = 'rgba(255,236,210,0.8)'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
                }
                // Fireplace
                const ff = 0.8 + 0.2 * Math.sin(t * 6.3) * Math.sin(t * 2.1);
                glow(580, 432, 60, `rgba(255,140,60,${0.35 * ff})`, 'rgba(255,120,40,0)');
                // Induction zones (warm red) and two gas burners (blue flame)
                for (const [x, y] of [[433, 864], [460, 877]]) glow(x, y, 12, 'rgba(255,70,40,0.55)', 'rgba(255,60,30,0)');
                for (const [x, y, r] of [[312, 859, 7], [329, 873, 5.5]]) {
                    ctx.strokeStyle = `rgba(90,160,255,${0.6 + 0.3 * Math.sin(t * 14 + x)})`; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.stroke();
                    glow(x, y, r + 6, 'rgba(90,150,255,0.25)', 'rgba(90,150,255,0)');
                }
                // Candles on the tub rim
                for (const [x, y] of [[1248, 619], [1256, 612], [1368, 619]]) {
                    const f = 0.75 + 0.25 * Math.sin(t * 9 + x);
                    glow(x, y, 12, `rgba(255,200,130,${0.5 * f})`, 'rgba(255,180,110,0)');
                }
                // Festoon string lights swagged along the veranda railing
                for (let s = 0; s < 8; s++) {
                    const x0 = 20 + s * 170, x1 = x0 + 170;
                    for (let i = 0; i <= 8; i++) {
                        const u = i / 8, x = x0 + (x1 - x0) * u, y = 14 + Math.sin(u * Math.PI) * 12;
                        const f = 0.7 + 0.3 * Math.sin(t * 1.3 + s * 3 + i * 1.7);
                        glow(x, y, 9, `rgba(255,214,160,${0.45 * f})`, 'rgba(255,200,140,0)');
                        ctx.fillStyle = `rgba(255,240,215,${0.9 * f})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();
            }

            drawClinicInterior(ctx) {
                const t = _gameTimeSec;
                ctx.save();
                // Tile grid with a faint alternating tint
                for (let ty = 50; ty < 750; ty += 50) {
                    for (let tx = 50; tx < 750; tx += 50) {
                        if (((tx + ty) / 50) % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(tx, ty, 50, 50); }
                    }
                }
                ctx.strokeStyle = 'rgba(40,55,65,0.22)'; ctx.lineWidth = 1;
                ctx.beginPath();
                for (let v = 50; v <= 750; v += 50) { ctx.moveTo(v, 50); ctx.lineTo(v, 750); ctx.moveTo(50, v); ctx.lineTo(750, v); }
                ctx.stroke();
                // Recovery-bay floor mats under the beds
                ctx.fillStyle = 'rgba(63,143,163,0.16)';
                ctx.fillRect(50, 270, 170, 320); ctx.fillRect(580, 270, 170, 320);
                // Wayfinding stripe: door → desk, splitting to both bays
                ctx.strokeStyle = 'rgba(63,182,201,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(400, 745); ctx.lineTo(400, 560); ctx.moveTo(400, 400); ctx.lineTo(400, 275);
                ctx.moveTo(400, 620); ctx.lineTo(240, 620); ctx.lineTo(240, 430); ctx.moveTo(400, 620); ctx.lineTo(560, 620); ctx.lineTo(560, 430);
                ctx.stroke(); ctx.lineCap = 'butt';
                // Diagnostic scanner platform (walk-on), slowly sweeping ring
                const cx = 400, cy = 480;
                ctx.fillStyle = '#5d6b74'; ctx.beginPath(); ctx.arc(cx, cy, 64, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#44525b'; ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(63,227,255,0.85)'; ctx.lineWidth = 3; ctx.shadowColor = '#3fe3ff'; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.stroke();
                const sweep = (t * 0.9) % (Math.PI * 2);
                ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 58, sweep, sweep + 0.9); ctx.stroke();
                ctx.shadowBlur = 0;
                const pulse = 0.5 + 0.5 * Math.sin(t * 2);
                ctx.strokeStyle = `rgba(63,227,255,${0.25 + 0.35 * pulse})`; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(cx, cy, 30 + 18 * pulse, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = 'rgba(63,227,255,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
                // Medical cross inlay in front of the desk
                ctx.fillStyle = 'rgba(220,60,70,0.55)';
                ctx.fillRect(390, 300, 20, 56); ctx.fillRect(372, 318, 56, 20);
                // Privacy curtains between beds (ceiling tracks with drawn-back curtains)
                const curtain = (x0, x1, y) => {
                    ctx.strokeStyle = 'rgba(200,210,215,0.9)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
                    ctx.fillStyle = 'rgba(170,215,225,0.55)';
                    ctx.beginPath(); ctx.moveTo(x0, y - 4);
                    for (let xx = x0; xx <= x0 + 60; xx += 6) ctx.lineTo(xx, y + ((xx / 6) % 2 ? 4 : -4));
                    ctx.lineTo(x0 + 60, y + 4); ctx.lineTo(x0, y + 4); ctx.closePath(); ctx.fill();
                };
                curtain(55, 215, 413); curtain(585, 745, 413);
                ctx.restore();
            }

            drawApartmentBackdrop(ctx) {
                /* ------------------------------------------------------------------
                   THE STREET, SEEN FROM HIGH ABOVE.
                   The veranda railing sits at y 0-8; we are looking straight DOWN
                   over it. Everything below uses the same visual grammar as the main
                   city — asphalt, dashed lane lines, tiled pavement, rooftops — but
                   rendered small. The miniature scale is what reads as altitude.

                   "d" = distance out from the base of our building (0 at the railing).
                   Larger d = further away = higher on screen = hazier.

                   PERFORMANCE: all static geometry (ground, roads, markings, roofs,
                   streetlight pools) is baked ONCE into an offscreen canvas. Per frame
                   we blit that and draw only the living things — traffic, pedestrians,
                   signal cycles, neon pulse.
                   ------------------------------------------------------------------ */
                const backdropBottom = 6;    // world Y of the railing line
                const backdropDepth  = 400;  // how far out we can see
                const backdropTop    = backdropBottom - backdropDepth;
                const mapW = this.activeMap.width;
                const t = _frameTime;

                // --- DEPTH BANDS -------------------------------------------------
                const D_CHASM   = 26;   // shadowed ground at our own building's base
                const D_WALK_N  = 50;   // near pavement ends / street begins
                const D_STREET  = 120;  // main street ends
                const D_WALK_F  = 144;  // far pavement ends / first block begins
                const D_BLOCK1  = 206;  // first row of rooftops ends
                const D_ALLEY   = 222;  // service alley ends
                const D_BLOCK2  = 292;  // second row ends
                const D_ALLEY2  = 308;  // second alley ends
                const D_MAX     = backdropDepth;
                const yAt = (d) => backdropBottom - d;

                // =================================================================
                // ONE-TIME LAYOUT SEED
                // Deterministic PRNG so the street below her window is the SAME
                // street every session — it shouldn't rearrange itself between visits.
                // =================================================================
                if (!this._backdropCity) {
                    let _s = 0x9491949;
                    const rnd = () => {
                        _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
                        let x = Math.imul(_s ^ (_s >>> 15), 1 | _s);
                        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
                        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
                    };
                    const rand = (a, b) => a + rnd() * (b - a);
                    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

                    const city = { cross: [], blocks: [], cars: [], peds: [], lamps: [], signs: [], flicker: [] };

                    // --- CROSS STREETS (run away from us, perpendicular to the main road)
                    let cx = rand(80, 150);
                    while (cx < mapW - 90) {
                        city.cross.push({ x: cx, w: rand(40, 54), phase: rnd() * 12000 });
                        cx += rand(300, 440);
                    }

                    // --- CITY BLOCKS in the gaps between cross streets
                    const gaps = [];
                    let prev = -40;
                    for (const cs of city.cross) { gaps.push([prev, cs.x]); prev = cs.x + cs.w; }
                    gaps.push([prev, mapW + 40]);

                    const roofTones = ['#191922', '#1e1e28', '#15151e', '#20202b'];
                    const rows = [
                        { d0: D_WALK_F, d1: D_BLOCK1 },
                        { d0: D_ALLEY,  d1: D_BLOCK2 },
                        { d0: D_ALLEY2, d1: D_MAX + 20 }   // furthest row runs off the top edge
                    ];
                    for (const [gx0, gx1] of gaps) {
                        for (let ri = 0; ri < rows.length; ri++) {
                            const row = rows[ri];
                            let bx = gx0 + rand(2, 12);
                            while (bx < gx1 - 30) {
                                const bw = Math.min(rand(58, 155), gx1 - bx - 4);
                                if (bw < 28) break;
                                const d0 = row.d0 + rand(0, 15);
                                // Occasionally a tower deep enough to swallow the alley
                                // behind it, so the rows don't read as a perfect grid.
                                const deep = ri < rows.length - 1 && rnd() < 0.17;
                                const d1 = (deep ? rows[ri + 1].d1 : row.d1) - rand(0, 13);

                                // Rooftop clutter — AC units, stairwell housings, water tanks
                                const props = [];
                                const pn = 1 + Math.floor(rnd() * 4);
                                for (let i = 0; i < pn; i++) {
                                    props.push({
                                        fx: rand(0.14, 0.86), fd: rand(0.22, 0.8),
                                        w: rand(6, 15), h: rand(5, 11),
                                        kind: rnd() < 0.22 ? 'tank' : 'ac'
                                    });
                                }
                                city.blocks.push({
                                    x: bx, w: bw, d0, d1,
                                    kind: (!deep && rnd() < 0.11) ? 'lot' : 'roof',
                                    tone: pick(roofTones),
                                    props,
                                    beacon: rnd() < 0.34,
                                    beaconPhase: rnd() * 3000,
                                    litSeed: rnd() * 100
                                });

                                // Neon on the face turned toward us
                                if (rnd() < 0.42) {
                                    city.signs.push({
                                        x: bx + rand(0.15, 0.6) * bw,
                                        d: d0 - rand(1, 3),
                                        w: rand(10, 26), h: rand(2.5, 4),
                                        color: pick(['#ff1493', '#00ff88', '#ffaa00', '#a469ff', '#00f3ff', '#ff3355']),
                                        phase: rnd() * 6000,
                                        rate: rand(0.0011, 0.0026)
                                    });
                                }
                                bx += bw + rand(5, 14);
                            }
                        }
                    }

                    // --- TRAFFIC on the main street: 4 lanes, 2 each way
                    const laneW = (D_STREET - D_WALK_N) / 4;
                    const carColors = ['#6a6a78', '#8a3040', '#30506a', '#7a7060', '#404050', '#5a3a6a'];
                    for (let i = 0; i < 20; i++) {
                        const lane = Math.floor(rnd() * 4);
                        city.cars.push({
                            axis: 'h',
                            d: D_WALK_N + laneW * (lane + 0.5),
                            dir: lane < 2 ? 1 : -1,          // near lanes head east, far lanes west
                            speed: rand(0.030, 0.062),
                            offset: rnd() * (mapW + 160),
                            len: rand(8, 12), wid: rand(4.2, 5.4),
                            body: pick(carColors)
                        });
                    }
                    // --- TRAFFIC on the cross streets (far side of the intersection only)
                    for (const cs of city.cross) {
                        const n = 1 + Math.floor(rnd() * 3);
                        for (let i = 0; i < n; i++) {
                            const outbound = rnd() < 0.5;
                            city.cars.push({
                                axis: 'v', cx: cs.x + cs.w * (outbound ? 0.68 : 0.32),
                                dir: outbound ? 1 : -1,
                                speed: rand(0.022, 0.048),
                                offset: rnd() * 150,
                                len: rand(8, 11), wid: rand(4.2, 5.2),
                                body: pick(carColors)
                            });
                        }
                    }

                    // --- PEDESTRIANS on both pavements
                    for (let i = 0; i < 28; i++) {
                        const far = rnd() < 0.5;
                        city.peds.push({
                            d: far ? rand(D_STREET + 5, D_WALK_F - 4) : rand(D_CHASM - 12, D_WALK_N - 4),
                            dir: rnd() < 0.5 ? 1 : -1,
                            speed: rand(0.006, 0.013),
                            offset: rnd() * (mapW + 40),
                            bob: rnd() * 6,
                            tint: pick(['#9aa0aa', '#8a8f99', '#a8a2b0', '#93a2a8'])
                        });
                    }

                    // --- STREETLIGHTS down both kerbs, staggered
                    for (let x = 40; x < mapW; x += 118) {
                        city.lamps.push({ x, d: D_WALK_N - 5 });
                        city.lamps.push({ x: x + 59, d: D_STREET + 5 });
                    }

                    // --- A few windows that flicker, for life in the static roofs
                    for (let i = 0; i < 10; i++) {
                        city.flicker.push({
                            x: rand(30, mapW - 30), d: rand(D_WALK_F - 4, D_WALK_F),
                            phase: rnd() * 9000, rate: rand(0.0004, 0.0015)
                        });
                    }

                    this._backdropCity = city;
                    this._backdropStatic = null;  // force bake
                }

                const city = this._backdropCity;

                // =================================================================
                // BAKE STATIC LAYER (once)
                // =================================================================
                if (!this._backdropStatic || this._backdropStaticW !== mapW) {
                    const off = document.createElement('canvas');
                    off.width = mapW;
                    off.height = backdropDepth;
                    const g = off.getContext('2d');
                    g.translate(0, -backdropTop);   // draw in world coords

                    const ASPHALT = '#222225';
                    const PAVE    = '#2a2a30';

                    // Ground base — unlit gaps between everything
                    g.fillStyle = '#0b0b12';
                    g.fillRect(0, backdropTop, mapW, backdropDepth);

                    // Service alleys between the rows of blocks. Drawn FIRST so the
                    // buildings sit on top of them and the alley edges come out ragged.
                    g.fillStyle = '#131318';
                    g.fillRect(0, yAt(D_ALLEY),  mapW, D_ALLEY  - D_BLOCK1);
                    g.fillRect(0, yAt(D_ALLEY2), mapW, D_ALLEY2 - D_BLOCK2);

                    // --- PAVEMENTS (near + far), matching the Pavement class treatment
                    const drawPave = (x, y, w, h) => {
                        g.fillStyle = PAVE;
                        g.fillRect(x, y, w, h);
                        g.strokeStyle = '#222228';
                        g.lineWidth = 0.6;
                        g.beginPath();
                        for (let tx = x; tx < x + w; tx += 17) { g.moveTo(tx, y); g.lineTo(tx, y + h); }
                        for (let ty = y; ty < y + h; ty += 17) { g.moveTo(x, ty); g.lineTo(x + w, ty); }
                        g.stroke();
                        g.strokeStyle = '#16161c';
                        g.lineWidth = 1;
                        g.strokeRect(x, y, w, h);
                    };
                    // Near pavement is wider — we're almost directly above it
                    drawPave(0, yAt(D_WALK_N), mapW, D_WALK_N - 6);
                    drawPave(0, yAt(D_WALK_F), mapW, D_WALK_F - D_STREET);

                    // --- MAIN STREET ASPHALT
                    g.fillStyle = ASPHALT;
                    g.fillRect(0, yAt(D_STREET), mapW, D_STREET - D_WALK_N);

                    // --- LANE MARKINGS (miniature version of Road.draw)
                    const laneW = (D_STREET - D_WALK_N) / 4;
                    const line = (y, style) => {
                        g.strokeStyle = style === 'dash' ? '#888' : (style === 'solid' ? '#ddd' : '#444');
                        g.setLineDash(style === 'dash' ? [7, 6] : []);
                        g.lineWidth = style === 'edge' ? 0.8 : 1;
                        g.beginPath(); g.moveTo(0, y); g.lineTo(mapW, y); g.stroke();
                    };
                    line(yAt(D_WALK_N), 'edge');
                    line(yAt(D_WALK_N + laneW), 'dash');
                    line(yAt(D_WALK_N + laneW * 2), 'solid');   // centre line
                    line(yAt(D_WALK_N + laneW * 3), 'dash');
                    line(yAt(D_STREET), 'edge');
                    g.setLineDash([]);

                    // --- CROSS STREETS: asphalt over the top, which cuts the far
                    //     pavement and blanks the main street's markings at junctions
                    for (const cs of city.cross) {
                        // T-junctions: they stop at the near kerb — our building fronts
                        // the main road, so the pavement below us runs unbroken.
                        g.fillStyle = ASPHALT;
                        g.fillRect(cs.x, backdropTop, cs.w, yAt(D_WALK_N) - backdropTop);
                        // Kerb edges beyond the junction
                        g.strokeStyle = '#444'; g.lineWidth = 0.8;
                        g.beginPath();
                        g.moveTo(cs.x, yAt(D_STREET)); g.lineTo(cs.x, backdropTop);
                        g.moveTo(cs.x + cs.w, yAt(D_STREET)); g.lineTo(cs.x + cs.w, backdropTop);
                        g.stroke();
                        // Centre dash beyond the junction
                        g.strokeStyle = '#888'; g.setLineDash([7, 6]); g.lineWidth = 1;
                        g.beginPath();
                        g.moveTo(cs.x + cs.w / 2, yAt(D_WALK_F)); g.lineTo(cs.x + cs.w / 2, backdropTop);
                        g.stroke();
                        g.setLineDash([]);

                        // Zebra crossings either side of the junction (bars run WITH traffic)
                        g.fillStyle = 'rgba(225,225,230,0.42)';
                        for (const zx of [cs.x - 15, cs.x + cs.w + 6]) {
                            for (let d = D_WALK_N + 5; d < D_STREET - 2; d += 9) {
                                g.fillRect(zx, yAt(d), 9, 5);
                            }
                        }
                        // Stop line where the side street meets the kerb
                        g.fillStyle = 'rgba(225,225,230,0.45)';
                        g.fillRect(cs.x + 2, yAt(D_STREET + 4), cs.w / 2 - 3, 2);
                    }

                    // --- ROOFTOPS
                    for (const b of city.blocks) {
                        const ry = yAt(b.d1), rh = b.d1 - b.d0;

                        // Open lot — gravel, bay markings, a few cars left overnight
                        if (b.kind === 'lot') {
                            g.fillStyle = '#1a1a20';
                            g.fillRect(b.x, ry, b.w, rh);
                            g.strokeStyle = '#101016'; g.lineWidth = 1;
                            g.strokeRect(b.x + 0.5, ry + 0.5, b.w - 1, rh - 1);
                            g.strokeStyle = 'rgba(200,200,215,0.15)'; g.lineWidth = 0.7;
                            g.beginPath();
                            const bay = Math.min(15, rh * 0.34);
                            for (let lx = b.x + 8; lx < b.x + b.w - 6; lx += 9) {
                                g.moveTo(lx, ry + 5);      g.lineTo(lx, ry + 5 + bay);
                                g.moveTo(lx, ry + rh - 5); g.lineTo(lx, ry + rh - 5 - bay);
                            }
                            g.stroke();
                            for (const p of b.props) {
                                const px = b.x + p.fx * (b.w - 14) + 4;
                                const py = ry + (p.fd < 0.5 ? 7 : rh - 17);
                                g.fillStyle = '#33333d';
                                g.fillRect(px, py, 5, 9);
                                g.fillStyle = 'rgba(190,195,215,0.10)';
                                g.fillRect(px + 1, py + 2, 3, 5);
                            }
                            continue;
                        }

                        // The face turned toward us — we're above and to the south, so a
                        // sliver of the near wall shows. Further blocks show more of it.
                        const face = 3 + (b.d0 - D_WALK_F) * 0.055;
                        g.fillStyle = '#0a0a10';
                        g.fillRect(b.x, yAt(b.d0), b.w, face);
                        // Lit windows in that sliver
                        for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 7) {
                            if (Math.sin(wx * 3.7 + b.litSeed) > -0.1) {
                                const warm = Math.sin(wx * 1.3 + b.litSeed) > 0.3;
                                g.fillStyle = warm ? 'rgba(255,208,128,0.55)' : 'rgba(120,150,190,0.32)';
                                g.fillRect(wx, yAt(b.d0) + 1, 3, Math.max(1.5, face - 2));
                            }
                        }

                        // Roof slab
                        g.fillStyle = b.tone;
                        g.fillRect(b.x, ry, b.w, rh);
                        g.strokeStyle = '#0d0d14'; g.lineWidth = 1;
                        g.strokeRect(b.x + 0.5, ry + 0.5, b.w - 1, rh - 1);
                        // Parapet catching a little skyglow
                        g.strokeStyle = 'rgba(150,150,180,0.13)'; g.lineWidth = 1;
                        g.strokeRect(b.x + 2.5, ry + 2.5, b.w - 5, rh - 5);

                        // Rooftop clutter
                        for (const p of b.props) {
                            const px = b.x + p.fx * b.w - p.w / 2;
                            const py = ry + p.fd * rh - p.h / 2;
                            if (p.kind === 'tank') {
                                g.fillStyle = '#2a2a34';
                                g.beginPath();
                                g.arc(px + p.w / 2, py + p.h / 2, Math.min(p.w, p.h) / 2, 0, Math.PI * 2);
                                g.fill();
                                g.strokeStyle = '#3a3a46'; g.lineWidth = 0.7; g.stroke();
                            } else {
                                g.fillStyle = '#26262f';
                                g.fillRect(px, py, p.w, p.h);
                                g.fillStyle = 'rgba(160,160,190,0.10)';
                                g.fillRect(px, py, p.w, 1.5);
                            }
                            // Contact shadow, thrown away from us
                            g.fillStyle = 'rgba(0,0,0,0.35)';
                            g.fillRect(px + 1, py - 2, p.w, 2);
                        }
                    }

                    // --- STREETLIGHT POOLS (baked; the lamps don't move)
                    const R = 30;
                    const pool = document.createElement('canvas');
                    pool.width = pool.height = R * 2;
                    const pg = pool.getContext('2d');
                    const grd = pg.createRadialGradient(R, R, 0, R, R, R);
                    grd.addColorStop(0,    'rgba(255,226,170,0.50)');
                    grd.addColorStop(0.35, 'rgba(255,208,140,0.19)');
                    grd.addColorStop(1,    'rgba(255,190,110,0)');
                    pg.fillStyle = grd;
                    pg.fillRect(0, 0, R * 2, R * 2);

                    g.globalCompositeOperation = 'lighter';
                    for (const L of city.lamps) {
                        g.drawImage(pool, L.x - R, yAt(L.d) - R);
                    }
                    g.globalCompositeOperation = 'source-over';
                    // Lamp heads
                    for (const L of city.lamps) {
                        g.fillStyle = '#ffe6b0';
                        g.fillRect(L.x - 1, yAt(L.d) - 1, 2, 2);
                    }

                    this._backdropStatic = off;
                    this._backdropStaticW = mapW;
                }

                // =================================================================
                // PER-FRAME RENDER
                // =================================================================
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, backdropTop, mapW, backdropDepth);
                ctx.clip();

                // 1. Baked city
                ctx.drawImage(this._backdropStatic, 0, backdropTop);

                // 2. NEON PULSE on the near faces
                ctx.globalCompositeOperation = 'lighter';
                for (const s of city.signs) {
                    const pulse = 0.45 + 0.35 * Math.sin((t + s.phase) * s.rate);
                    ctx.globalAlpha = pulse * 0.75;
                    ctx.fillStyle = s.color;
                    ctx.fillRect(s.x, yAt(s.d), s.w, s.h);
                    ctx.globalAlpha = pulse * 0.13;
                    ctx.fillRect(s.x - 5, yAt(s.d) - 5, s.w + 10, s.h + 10);
                }
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';

                // 3. TRAFFIC
                for (const car of city.cars) {
                    let cx, cy, alpha = 0.9;
                    if (car.axis === 'h') {
                        const span = mapW + 160;
                        cx = ((t * car.speed * car.dir + car.offset) % span + span) % span - 80;
                        cy = yAt(car.d) - car.wid / 2;
                        ctx.fillStyle = car.body;
                        ctx.globalAlpha = alpha;
                        ctx.fillRect(cx, cy, car.len, car.wid);
                        // Roof highlight
                        ctx.fillStyle = 'rgba(190,195,215,0.16)';
                        ctx.fillRect(cx + 1.5, cy + 1, car.len - 3, car.wid - 2);
                        // Headlight wash ahead, tail glow behind
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = 0.16;
                        ctx.fillStyle = '#fff3d0';
                        ctx.fillRect(cx + (car.dir > 0 ? car.len : -14), cy - 1.5, 14, car.wid + 3);
                        ctx.globalAlpha = 0.5;
                        ctx.fillStyle = '#ff2a00';
                        ctx.fillRect(cx + (car.dir > 0 ? -1.5 : car.len), cy + 0.6, 1.5, car.wid - 1.2);
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1;
                    } else {
                        // Cross-street traffic lives beyond the junction; fade at the ends
                        const dMin = D_WALK_F - 6, dMax = D_BLOCK2 + 30, span = dMax - dMin;
                        const d = dMin + (((t * car.speed * car.dir + car.offset) % span) + span) % span;
                        const edge = Math.min(d - dMin, dMax - d);
                        alpha = Math.max(0, Math.min(1, edge / 14)) * 0.9;
                        if (alpha <= 0.02) continue;
                        cx = car.cx - car.wid / 2;
                        cy = yAt(d);
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = car.body;
                        ctx.fillRect(cx, cy, car.wid, car.len);
                        ctx.fillStyle = 'rgba(190,195,215,0.16)';
                        ctx.fillRect(cx + 1, cy + 1.5, car.wid - 2, car.len - 3);
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = alpha * 0.16;
                        ctx.fillStyle = '#fff3d0';
                        // dir +1 = travelling away from us = up the screen
                        ctx.fillRect(cx - 1.5, cy + (car.dir > 0 ? -14 : car.len), car.wid + 3, 14);
                        ctx.globalAlpha = alpha * 0.5;
                        ctx.fillStyle = '#ff2a00';
                        ctx.fillRect(cx + 0.6, cy + (car.dir > 0 ? car.len : -1.5), car.wid - 1.2, 1.5);
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1;
                    }
                }

                // 4. PEDESTRIANS — tiny dots with a slight walking bob
                for (const ped of city.peds) {
                    const span = mapW + 40;
                    const px = ((t * ped.speed * ped.dir + ped.offset) % span + span) % span - 20;
                    const py = yAt(ped.d) + Math.sin(t * 0.006 + ped.bob) * 0.7;
                    ctx.fillStyle = 'rgba(0,0,0,0.45)';
                    ctx.fillRect(px + 0.8, py + 0.8, 2.2, 2.2);
                    ctx.fillStyle = ped.tint;
                    ctx.globalAlpha = 0.85;
                    ctx.fillRect(px, py, 2.2, 2.2);
                    ctx.globalAlpha = 1;
                }

                // 5. TRAFFIC SIGNALS at each junction, on a shared 11s cycle
                for (const cs of city.cross) {
                    const ph = ((t + cs.phase) % 11000) / 11000;
                    const col = ph < 0.46 ? '#00ff66' : (ph < 0.54 ? '#ffaa00' : '#ff2a2a');
                    ctx.globalCompositeOperation = 'lighter';
                    for (const corner of [[cs.x - 3, D_STREET + 3], [cs.x + cs.w + 3, D_WALK_N - 3]]) {
                        ctx.fillStyle = col;
                        ctx.globalAlpha = 0.95;
                        ctx.fillRect(corner[0], yAt(corner[1]), 2, 2);
                        ctx.globalAlpha = 0.20;
                        ctx.fillRect(corner[0] - 2.5, yAt(corner[1]) - 2.5, 7, 7);
                    }
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = 1;
                }

                // 6. ROOFTOP AVIATION BEACONS
                ctx.globalCompositeOperation = 'lighter';
                for (const b of city.blocks) {
                    if (!b.beacon) continue;
                    const blink = Math.sin((t + b.beaconPhase) * 0.0016);
                    if (blink < 0.55) continue;
                    const bx = b.x + b.w * 0.5, by = yAt(b.d1) + 5;
                    ctx.fillStyle = '#ff3040';
                    ctx.globalAlpha = (blink - 0.55) / 0.45;
                    ctx.fillRect(bx - 1, by - 1, 2, 2);
                    ctx.globalAlpha *= 0.28;
                    ctx.fillRect(bx - 4, by - 4, 8, 8);
                }
                ctx.globalAlpha = 1;

                // 7. FLICKERING WINDOWS
                for (const f of city.flicker) {
                    const v = Math.sin((t + f.phase) * f.rate);
                    if (v < 0.6) continue;
                    ctx.fillStyle = '#ffd080';
                    ctx.globalAlpha = (v - 0.6) / 0.4 * 0.5;
                    ctx.fillRect(f.x, yAt(f.d) + 1, 3, 2.5);
                }
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';

                // 8. DISTANCE HAZE — the further down/out, the more air in the way
                const haze = ctx.createLinearGradient(0, backdropTop, 0, yAt(34));
                haze.addColorStop(0,    'rgba(5, 4, 12, 0.97)');   // merges into the black beyond
                haze.addColorStop(0.16, 'rgba(16, 12, 30, 0.72)');
                haze.addColorStop(0.42, 'rgba(19, 15, 36, 0.42)');
                haze.addColorStop(0.72, 'rgba(17, 13, 32, 0.17)');
                haze.addColorStop(1,    'rgba(14, 10, 26, 0)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, backdropTop, mapW, backdropDepth);

                // 9. OUR OWN BUILDING'S SHADOW falling on the ground directly below
                const shad = ctx.createLinearGradient(0, backdropBottom, 0, yAt(D_CHASM + 10));
                shad.addColorStop(0, 'rgba(0,0,0,0.90)');
                shad.addColorStop(0.55, 'rgba(0,0,0,0.42)');
                shad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = shad;
                ctx.fillRect(0, yAt(D_CHASM + 10), mapW, D_CHASM + 16);

                ctx.restore();
            }

            /* =====================================================================
               MISSION WAYPOINT MARKER
               ---------------------------------------------------------------------
               Draws a screen-edge indicator pointing toward the active mission target.
               ===================================================================== */
            drawMissionMarker() {
                const m = this.missions.activeMission;
                if (!m || m.status !== 'active') return;
                
                let targetX, targetY;
                if (m.type === MISSION_TYPES.DELIVERY && !m.pickedUp && this.deliveryVehicle) {
                    targetX = this.deliveryVehicle.x;
                    targetY = this.deliveryVehicle.y;
                } else {
                    targetX = m.targetX;
                    targetY = m.targetY;
                }
                
                const dx = targetX - this.player.x;
                const dy = targetY - this.player.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist < (m.targetRadius || 80)) return; // Already there
                
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                
                const angle = Math.atan2(dy, dx);
                const margin = 60;
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                
                // Clamp to screen edge
                const edgeX = Math.max(margin, Math.min(this.canvas.width - margin, cx + Math.cos(angle) * (cx - margin)));
                const edgeY = Math.max(margin, Math.min(this.canvas.height - margin, cy + Math.sin(angle) * (cy - margin)));
                
                // Pulsing arrow
                const pulse = (Math.sin(_frameTime / 400) + 1) / 2;
                const color = m.type === MISSION_TYPES.DELIVERY ? '#ffaa00' : '#ff3355';
                
                this.ctx.save();
                this.ctx.translate(edgeX, edgeY);
                this.ctx.rotate(angle);
                
                // Arrow
                this.ctx.shadowColor = color;
                this.ctx.shadowBlur = 10 + pulse * 8;
                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = 0.7 + pulse * 0.3;
                this.ctx.beginPath();
                this.ctx.moveTo(12, 0);
                this.ctx.lineTo(-6, -8);
                this.ctx.lineTo(-6, 8);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.restore();
                
                // Distance text
                this.ctx.font = 'bold 10px Courier New';
                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = 0.8;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`${Math.round(dist)}m`, edgeX, edgeY + 20);
                
                this.ctx.restore();
            }

            /* =====================================================================
               LIGHTING SYSTEM RENDERER (OPTIMIZED)
               ---------------------------------------------------------------------
               Handles the dynamic lighting layer, shadows, and night vision.
               Supports dynamic resolution scaling via 'lightingScale'.
               ===================================================================== */
            /* =====================================================================
               LIGHTING SYSTEM RENDERER (FIXED)
               ---------------------------------------------------------------------
               Handles the dynamic lighting layer, shadows, and night vision.
               Now correctly syncs with Cutscene Camera.
               ===================================================================== */
            drawLightingSystem(ctx) {
                const ambient = this.getAmbientDarkness();
                
                // THE FIX: Maintain original shadow opacity (ambient), but fade it to 0 as NV turns on.
                const finalOpacity = ambient * (1.0 - this.nvIntensity);
                
                // Optimization: If shadows are invisible and we don't need the NV boost, stop.
                if (finalOpacity <= 0.01 && !this.nightVision) return; 
            
                // 1. CLEAR BUFFER
                this.lightCtx.clearRect(0, 0, this.lightCanvas.width, this.lightCanvas.height);
            
                this.lightCtx.save();
                
                // --- FIDELITY SCALE ---
                this.lightCtx.scale(this.lightingScale, this.lightingScale);
            
                // 2. CAMERA TRANSFORM (SYNCED WITH MAIN RENDERER)
                this.lightCtx.translate(this.canvas.width/2, this.canvas.height/2);
                this.lightCtx.scale(this.camera.zoom, this.camera.zoom);
                
                // --- FIX: USE ACTIVE CAMERA COORDINATES, NOT PLAYER COORDINATES ---
                let camX, camY;
                if (this.cutscene && this.cutscene.active) {
                    camX = this.camera.x;
                    camY = this.camera.y;
                } else {
                    camX = this.player.x;
                    camY = this.player.y;
                }
                this.lightCtx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                
                // PERFORMANCE: Pre-calculate viewport culling bounds for lighting pass
                const lightCullZoom = Math.max(CONFIG.CULLING.ZOOM_MIN, Math.min(CONFIG.CULLING.ZOOM_MAX, this.camera.zoom));
                const lightCullHalfW = (this.canvas.width / 2) / lightCullZoom;
                const lightCullHalfH = (this.canvas.height / 2) / lightCullZoom;
                const lightCullBounds = {
                    headlights: { left: camX - lightCullHalfW - CONFIG.CULLING.HEADLIGHTS, right: camX + lightCullHalfW + CONFIG.CULLING.HEADLIGHTS, top: camY - lightCullHalfH - CONFIG.CULLING.HEADLIGHTS, bottom: camY + lightCullHalfH + CONFIG.CULLING.HEADLIGHTS },
                    props:      { left: camX - lightCullHalfW - CONFIG.CULLING.PROPS,      right: camX + lightCullHalfW + CONFIG.CULLING.PROPS,      top: camY - lightCullHalfH - CONFIG.CULLING.PROPS,      bottom: camY + lightCullHalfH + CONFIG.CULLING.PROPS },
                    lampGlow:   { left: camX - lightCullHalfW - CONFIG.CULLING.LAMP_GLOW,  right: camX + lightCullHalfW + CONFIG.CULLING.LAMP_GLOW,  top: camY - lightCullHalfH - CONFIG.CULLING.LAMP_GLOW,  bottom: camY + lightCullHalfH + CONFIG.CULLING.LAMP_GLOW },
                    neonSigns:  { left: camX - lightCullHalfW - CONFIG.CULLING.NEON_SIGNS, right: camX + lightCullHalfW + CONFIG.CULLING.NEON_SIGNS, top: camY - lightCullHalfH - CONFIG.CULLING.NEON_SIGNS, bottom: camY + lightCullHalfH + CONFIG.CULLING.NEON_SIGNS }
                };
                
                // PERFORMANCE: Calculate visible world bounds for clipping large draws
                const lightViewMargin = 200; // Extra margin for light bleed
                const visLeft   = Math.max(0, camX - lightCullHalfW - lightViewMargin);
                const visTop    = Math.max(0, camY - lightCullHalfH - lightViewMargin);
                const visRight  = Math.min(this.activeMap.width, camX + lightCullHalfW + lightViewMargin);
                const visBottom = Math.min(this.activeMap.height, camY + lightCullHalfH + lightViewMargin);
                const visW = visRight - visLeft;
                const visH = visBottom - visTop;
            
                // 3. DRAW BASE DARKNESS (Viewport-Only)
                // NEW: No map-sized shadow canvas. Fill viewport with black, then cut
                // light holes using cached per-lamp shadow polygons. Cost scales with
                // visible lamp count (~10-15), not map pixel count (was 44M).
                this.lightCtx.fillStyle = '#000000';
                this.lightCtx.fillRect(visLeft, visTop, visW, visH);
            
                // 3b. INTERIOR LAMP PASS — Per-lamp shadow projection from building interior walls
                // Matches editor lighting pipeline: invisible emitters that cast real-time
                // shadow wedges from interior_wall segments on the same level.
                if (this.activeMap._interiorLights && this.activeMap._interiorLights.length > 0) {
                    const iLights = this.activeMap._interiorLights;
                    const iSegsByLevel = this.activeMap._interiorShadowSegs || {};
                    
                    iLights.forEach(lamp => {
                        // Viewport cull
                        if (lamp.x + lamp.radius < visLeft || lamp.x - lamp.radius > visRight ||
                            lamp.y + lamp.radius < visTop || lamp.y - lamp.radius > visBottom) return;
                        
                        // Step A: Cut this lamp's light hole
                        this.lightCtx.globalCompositeOperation = 'destination-out';
                        const grad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, lamp.radius);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${lamp.intensity})`);
                        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.arc(lamp.x, lamp.y, lamp.radius, 0, Math.PI * 2);
                        this.lightCtx.fill();
                        
                        // Step B: Add color glow (before shadows mask it)
                        this.lightCtx.globalCompositeOperation = 'lighter';
                        const cGrad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.colorRadius);
                        cGrad.addColorStop(0, '#ffffff');
                        cGrad.addColorStop(0.1, lamp.color);
                        cGrad.addColorStop(0.6, lamp.color);
                        cGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        this.lightCtx.globalAlpha = 0.08 * lamp.intensity;
                        this.lightCtx.fillStyle = cGrad;
                        this.lightCtx.beginPath();
                        this.lightCtx.arc(lamp.x, lamp.y, lamp.colorRadius, 0, Math.PI * 2);
                        this.lightCtx.fill();
                        this.lightCtx.globalAlpha = 1.0;
                        
                        // Step C: Paint shadow wedges back from same-level wall segments
                        this.lightCtx.globalCompositeOperation = 'source-over';
                        const segs = iSegsByLevel[lamp.level] || [];
                        segs.forEach(seg => {
                            const d1 = Math.hypot(seg.x1 - lamp.x, seg.y1 - lamp.y);
                            const d2 = Math.hypot(seg.x2 - lamp.x, seg.y2 - lamp.y);
                            if (d1 > lamp.radius * 1.5 && d2 > lamp.radius * 1.5) return;
                            const a1 = Math.atan2(seg.y1 - lamp.y, seg.x1 - lamp.x);
                            const a2 = Math.atan2(seg.y2 - lamp.y, seg.x2 - lamp.x);
                            const ext = lamp.radius * 1.2;
                            this.lightCtx.fillStyle = '#000000';
                            this.lightCtx.beginPath();
                            this.lightCtx.moveTo(seg.x1, seg.y1);
                            this.lightCtx.lineTo(lamp.x + Math.cos(a1) * ext, lamp.y + Math.sin(a1) * ext);
                            this.lightCtx.lineTo(lamp.x + Math.cos(a2) * ext, lamp.y + Math.sin(a2) * ext);
                            this.lightCtx.lineTo(seg.x2, seg.y2);
                            this.lightCtx.closePath();
                            this.lightCtx.fill();
                        });
                    });
                }
            
                // 4. CUT STATIC LAMP SHADOWS (Destination-Out from cached geometry)
                this.lightCtx.globalCompositeOperation = 'destination-out';
                
                if (this.lightingBaked) {
                    const cbLampShadow = lightCullBounds.lampGlow;
                    let litLampCount = 0;
                    
                    // Roof occlusion: when player is outdoors, skip lamps inside indoor rooms
                    // so their light doesn't punch through the roof
                    const roofActive = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                    
                    // Collect visible lamps, then sort by distance to camera so the
                    // budget cap (_maxLitLamps) always prioritizes lamps closest to the
                    // player. Without this, lamps earlier in the array lit up while
                    // nearby lamps added later were dark.
                    const visibleLamps = [];
                    for (let lamp of this.lamps) {
                        // AABB cull — skip lamps outside viewport
                        if (lamp.x < cbLampShadow.left || lamp.x > cbLampShadow.right || 
                            lamp.y < cbLampShadow.top || lamp.y > cbLampShadow.bottom) continue;
                        
                        // Skip indoor lamps when roof is occluding
                        if (roofActive) {
                            let insideIndoor = false;
                            for (const rid in this.roomSystem.rooms) {
                                const r = this.roomSystem.rooms[rid];
                                if (r.type !== 'outdoor' && lamp.x >= r.x && lamp.x <= r.x + r.w && lamp.y >= r.y && lamp.y <= r.y + r.h) {
                                    insideIndoor = true;
                                    break;
                                }
                            }
                            if (insideIndoor) continue;
                        }
                        
                        if (!lamp._shadowPoly || lamp._shadowPoly.length === 0) continue;
                        
                        // Skip lamps in rooms where lights have been switched off
                        if (this.roomSystem.isLampRoomDark(lamp)) continue;
                        
                        // Squared distance to camera center (cheap, no sqrt needed for sort)
                        const dx = lamp.x - camX;
                        const dy = lamp.y - camY;
                        lamp._distSq = dx * dx + dy * dy;
                        visibleLamps.push(lamp);
                    }
                    
                    // Sort nearest-first so budget cap keeps the closest lights on
                    visibleLamps.sort((a, b) => a._distSq - b._distSq);
                    
                    for (const lamp of visibleLamps) {
                        if (litLampCount >= this._maxLitLamps) break;
                        
                        const poly = lamp._shadowPoly;
                        
                        // Draw the cached shadow polygon with radial gradient
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(poly[0].x, poly[0].y);
                        for (let i = 1; i < poly.length; i++) {
                            this.lightCtx.lineTo(poly[i].x, poly[i].y);
                        }
                        this.lightCtx.closePath();
                        
                        const range = lamp.radius;
                        const grad = this.lightCtx.createRadialGradient(lamp.x, lamp.y, 10, lamp.x, lamp.y, range);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
                        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.fill();
                        litLampCount++;
                    }
                }
            
                // 5. CUT DYNAMIC HOLES (Destination-Out)
                this.lightCtx.globalCompositeOperation = 'destination-out';
                
                // Projectiles
                this.projectiles.forEach(p => {
                    this.lightCtx.beginPath(); this.lightCtx.arc(p.x, p.y, 45, 0, Math.PI*2);
                    this.lightCtx.fillStyle = 'rgba(255, 255, 255, 1.0)'; this.lightCtx.fill();
                });
            
                // Muzzle Flashes
                this.muzzleFlashes.forEach(f => {
                    this.lightCtx.beginPath(); this.lightCtx.arc(f.x, f.y, f.radius * 1.2, 0, Math.PI*2);
                    this.lightCtx.fillStyle = 'rgba(255, 255, 255, 1.0)'; this.lightCtx.fill();
                });
            
                // Laser Sight beam cuts through darkness (same geometry as the visible beam)
                const lsGeom = this.getLaserSight();
                if (lsGeom) {
                    const mx = lsGeom.x0, my = lsGeom.y0, hx = lsGeom.x1, hy = lsGeom.y1;
                    
                    // Thin faint light line cutting through shadow
                    const lsGrad = this.lightCtx.createLinearGradient(mx, my, hx, hy);
                    lsGrad.addColorStop(0, 'rgba(255, 50, 0, 0.6)');
                    lsGrad.addColorStop(1, 'rgba(255, 50, 0, 0.1)');
                    this.lightCtx.strokeStyle = lsGrad;
                    this.lightCtx.lineWidth = 3;
                    this.lightCtx.beginPath();
                    this.lightCtx.moveTo(mx, my);
                    this.lightCtx.lineTo(hx, hy);
                    this.lightCtx.stroke();
                    
                    // Small glow at hit point
                    this.lightCtx.beginPath();
                    this.lightCtx.arc(hx, hy, 8, 0, Math.PI * 2);
                    this.lightCtx.fillStyle = 'rgba(255, 50, 0, 0.4)';
                    this.lightCtx.fill();
                }
            
                // Car Headlights (Dynamic Beam Length)
                if (this.isDriving || (this.car && this.car.forceLights)) {
                    const bumperOffset = this.car.length / 2;
                    const cx = this.car.x + Math.cos(this.car.angle) * bumperOffset;
                    const cy = this.car.y + Math.sin(this.car.angle) * bumperOffset;
                    
                    const lightStat = this.car.lightRange || 60; 
                    const beamLength = lightStat * 6; 
                    const beamWidth = lightStat * 1.5;
            
                    this.lightCtx.save(); 
                    this.lightCtx.translate(cx, cy); 
                    this.lightCtx.rotate(this.car.angle);
                    
                    const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0); 
                    //const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                    const lightingElement = this.car.headlightColor || '#ffffdd';
                    //const LERGB = this.hexToRgb(lightingElement) || '255, 255, 170';
                    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                    const rgb = hexMatch 
                        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                        : '255, 255, 170';
                    const gradCol = lightingElement;
                    grad.addColorStop(0, gradCol);
                    grad.addColorStop(1, `rgba(${rgb}, 0)`)

                    //const gradCol = this.car.headlightColor || 'rgba(255, 0, 0, 0.0)';
                    //grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); 
                    //grad.addColorStop(1, 'rgba(255, 255, 255, 0)');   
                    //grad.addColorStop(0, gradCol);
                    //grad.addColorStop(1, gradCol);
                    
                    this.lightCtx.fillStyle = grad; 
                    this.lightCtx.beginPath(); 
                    this.lightCtx.moveTo(0, -15); 
                    this.lightCtx.lineTo(beamLength, -beamWidth); 
                    this.lightCtx.lineTo(beamLength, beamWidth); 
                    this.lightCtx.lineTo(0, 15); 
                    this.lightCtx.fill(); 
                    this.lightCtx.restore();
                }
                
                // AI Vehicle Headlights (same cone effect)
                // PERFORMANCE: AABB viewport culling + vehicle count limit
                if (this.traffic && this.traffic.vehicles) {
                    const cbHL = lightCullBounds.headlights;
                    let headlightCount = 0;
                    
                    for (let i = 0; i < this.traffic.vehicles.length && headlightCount < 6; i++) {
                        const v = this.traffic.vehicles[i];
                        if (!v.visible || v.dead || v === this.car) continue;
                        
                        // AABB check
                        if (v.x < cbHL.left || v.x > cbHL.right || v.y < cbHL.top || v.y > cbHL.bottom) continue;
                        
                        headlightCount++;
                        
                        const bumperOffset = v.length / 2;
                        const cx = v.x + Math.cos(v.angle) * bumperOffset;
                        const cy = v.y + Math.sin(v.angle) * bumperOffset;
                        
                        const lightStat = 40;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(v.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const vHlc = v.headlightColor || '#ffffee';
                        const vHex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(vHlc);
                        const vRgb = vHex ? `${parseInt(vHex[1],16)}, ${parseInt(vHex[2],16)}, ${parseInt(vHex[3],16)}` : '255, 255, 230';
                        grad.addColorStop(0, vHlc);
                        grad.addColorStop(1, `rgba(${vRgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
                
                // Bumper Car Headlights (during minigame — same logic as player headlight)
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    for (const car of this.bumperMinigame.cars) {
                        if (car === this.bumperMinigame.playerCar) continue;
                        
                        const bumperOffset = car.length / 2;
                        const cx = car.x + Math.cos(car.angle) * bumperOffset;
                        const cy = car.y + Math.sin(car.angle) * bumperOffset;
                        
                        const lightStat = car.lightRange || 60;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(car.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const lightingElement = car.headlightColor || car.bodyColor || '#ffffdd';
                        const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                        const rgb = hexMatch 
                            ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                            : '255, 255, 170';
                        const gradCol = lightingElement;
                        grad.addColorStop(0, gradCol);
                        grad.addColorStop(1, `rgba(${rgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
                
                this.lightCtx.shadowBlur = 0;
                
                // Indoor V2: Window daylight projections (cut light through shadow)
                if (this.roomSystem.active) {
                    this.roomSystem.drawWindowLightProjections(this.lightCtx, this._windowDaylight || 0);
                }
                
                // Prop Glows (Vending/Medbay) - PERFORMANCE: AABB culling
                // FIX: Use getCenter() for accurate tracking of pushed/rotated props
                // and stable entity ID seed so animation doesn't jump on movement
                const cbProps = lightCullBounds.props;
                this.props.forEach(p => {
                    if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                        const center = p.getCenter();
                        const px = center.x; const py = center.y;
                        if (px < cbProps.left || px > cbProps.right || py < cbProps.top || py > cbProps.bottom) return;
                        
                        const time = _frameTime; const offset = (p.id || 0) * 1337;
                        let radiusMod = p.interactionType === 'medbay_refill' ? 1.0 + (Math.sin((time + offset) / 400) * 0.05) : 1.0 + (Math.sin((time + offset) / 50) * 0.02);
                        const holeRadius = 170 * radiusMod;
                        const grad = this.lightCtx.createRadialGradient(px, py, 20, px, py, holeRadius);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)'); grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');   
                        this.lightCtx.fillStyle = grad; this.lightCtx.beginPath(); this.lightCtx.arc(px, py, holeRadius, 0, Math.PI*2); this.lightCtx.fill();
                    }
                });
                
                // 6. COLOR PASS (Lighter Blend)
                this.lightCtx.globalCompositeOperation = 'lighter'; 
                const isIndoor = this.activeMap.type === 'indoor';
                const baseAlpha = (isIndoor ? 0.08 : 0.18); 
                
                // Indoor V2: Window warm daylight color (lighter blend)
                if (this.roomSystem.active) {
                    this.roomSystem.drawWindowColorPass(this.lightCtx, this._windowDaylight || 0);
                }
            
                // Lamps - PERFORMANCE: AABB culling + cached gradients
                const cbLampGlow = lightCullBounds.lampGlow;
                const _roofBlocksColor = this.roomSystem.active && (this.roomSystem._roofOpacity || 0) > 0.3;
                this.lamps.forEach(l => {
                    if (l.x < cbLampGlow.left || l.x > cbLampGlow.right || l.y < cbLampGlow.top || l.y > cbLampGlow.bottom) return;
                    
                    // Skip indoor lamps when roof is occluding
                    if (_roofBlocksColor) {
                        for (const rid in this.roomSystem.rooms) {
                            const r = this.roomSystem.rooms[rid];
                            if (r.type !== 'outdoor' && l.x >= r.x && l.x <= r.x + r.w && l.y >= r.y && l.y <= r.y + r.h) return;
                        }
                    }
                    
                    // Skip lamps in rooms with lights switched off
                    if (this.roomSystem.isLampRoomDark(l)) return;
                    
                    if (!l._cachedGrad) {
                        l._cachedGrad = this.lightCtx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
                        l._cachedGrad.addColorStop(0, '#ffffff'); l._cachedGrad.addColorStop(0.1, l.color); l._cachedGrad.addColorStop(0.6, l.color); l._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    }
                    this.lightCtx.globalAlpha = baseAlpha; 
                    this.lightCtx.fillStyle = l._cachedGrad; this.lightCtx.beginPath(); this.lightCtx.arc(l.x, l.y, l.radius, 0, Math.PI*2); this.lightCtx.fill();
                });
            
                // Neon Signs - PERFORMANCE: AABB culling + cached gradients
                const cbNeon = lightCullBounds.neonSigns;
                this.neonSigns.forEach(s => {
                    if (s.x < cbNeon.left || s.x > cbNeon.right || s.y < cbNeon.top || s.y > cbNeon.bottom) return;
                    
                    if (!s._cachedGrad) {
                        const radius = 150;
                        s._cachedGrad = this.lightCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
                        s._cachedGrad.addColorStop(0, s.color); s._cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        s._cachedRadius = radius;
                    }
                    this.lightCtx.globalAlpha = baseAlpha * 1.5; 
                    this.lightCtx.fillStyle = s._cachedGrad; this.lightCtx.beginPath(); this.lightCtx.arc(s.x, s.y, s._cachedRadius, 0, Math.PI*2); this.lightCtx.fill();
                });
            
                // Prop Colors - Dynamic glow tint (no caching — props can be pushed)
                this.props.forEach(p => {
                    if (p.interactionType === 'medbay_refill' || p.interactionType === 'vending_machine') {
                        const center = p.getCenter();
                        const px = center.x; const py = center.y;
                        if (px < cbProps.left || px > cbProps.right || py < cbProps.top || py > cbProps.bottom) return;
                        
                        const isMedbay = p.interactionType === 'medbay_refill';
                        const baseColor = isMedbay ? '#00ff00' : '#00f3ff';
                        const grad = this.lightCtx.createRadialGradient(px, py, 10, px, py, 180);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); grad.addColorStop(0.3, baseColor); grad.addColorStop(1, 'rgba(0,0,0,0)');
                        
                        const time = _frameTime; const offset = (p.id || 0) * 1337;
                        const intensityMod = isMedbay ? 0.9 + (Math.sin((time + offset) / 400) * 0.2) : (1.0 + Math.sin((time + offset) / 50) * 0.05);
                        this.lightCtx.globalAlpha = Math.min(1.0, 0.2 * intensityMod);
                        this.lightCtx.fillStyle = grad; this.lightCtx.beginPath(); this.lightCtx.arc(px, py, 180, 0, Math.PI*2); this.lightCtx.fill();
                    }
                });
            
                // Car Headlights (Color Haze)
                if (this.isDriving) {
                    this.lightCtx.globalAlpha = baseAlpha; 
                    const bumperOffset = this.car.length / 2;
                    const cx = this.car.x + Math.cos(this.car.angle) * bumperOffset;
                    const cy = this.car.y + Math.sin(this.car.angle) * bumperOffset;
                    
                    const lightStat = this.car.lightRange || 60; 
                    const beamLength = lightStat * 6; 
                    const beamWidth = lightStat * 1.5;
            
                    this.lightCtx.save(); 
                    this.lightCtx.translate(cx, cy); 
                    this.lightCtx.rotate(this.car.angle);
                    
                    const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                    const lightingElement = this.car.headlightColor || '#ffffdd';
                    //const LERGB = this.hexToRgb(lightingElement) || '255, 255, 170';
                    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                    const rgb = hexMatch 
                        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                        : '255, 255, 170';
                    const gradCol = lightingElement;
                    grad.addColorStop(0, gradCol);
                    grad.addColorStop(1, `rgba(${rgb}, 0)`)
                    //grad.addColorStop(0, '#ffffdd');
                    //grad.addColorStop(1, 'rgba(255,255,200,0)');
                    
                    this.lightCtx.fillStyle = grad; 
                    this.lightCtx.beginPath(); 
                    this.lightCtx.moveTo(0, -15); 
                    this.lightCtx.lineTo(beamLength, -beamWidth); 
                    this.lightCtx.lineTo(beamLength, beamWidth); 
                    this.lightCtx.lineTo(0, 15); 
                    this.lightCtx.fill(); 
                    this.lightCtx.restore();
                }
                
                // AI Vehicle Headlights (Color Haze)
                // PERFORMANCE: AABB viewport culling + vehicle count limit
                if (this.traffic && this.traffic.vehicles) {
                    this.lightCtx.globalAlpha = baseAlpha * 0.7;
                    const cbHL2 = lightCullBounds.headlights;
                    let headlightCount = 0;
                    
                    for (let i = 0; i < this.traffic.vehicles.length && headlightCount < 6; i++) {
                        const v = this.traffic.vehicles[i];
                        if (!v.visible || v.dead || v === this.car) continue;
                        
                        // AABB check
                        if (v.x < cbHL2.left || v.x > cbHL2.right || v.y < cbHL2.top || v.y > cbHL2.bottom) continue;
                        
                        headlightCount++;
                        
                        const bumperOffset = v.length / 2;
                        const cx = v.x + Math.cos(v.angle) * bumperOffset;
                        const cy = v.y + Math.sin(v.angle) * bumperOffset;
                        
                        const lightStat = 40;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(v.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const vHlc2 = v.headlightColor || '#ffffcc';
                        const vHex2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(vHlc2);
                        const vRgb2 = vHex2 ? `${parseInt(vHex2[1],16)}, ${parseInt(vHex2[2],16)}, ${parseInt(vHex2[3],16)}` : '255, 255, 200';
                        grad.addColorStop(0, vHlc2);
                        grad.addColorStop(1, `rgba(${vRgb2}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }
            
                // Bumper Car Headlights (Color Haze — same pass as player/traffic)
                if (this.bumperMinigame && this.bumperMinigame.active) {
                    this.lightCtx.globalAlpha = baseAlpha;
                    for (const car of this.bumperMinigame.cars) {
                        if (car === this.bumperMinigame.playerCar) continue;
                        
                        const bumperOffset = car.length / 2;
                        const cx = car.x + Math.cos(car.angle) * bumperOffset;
                        const cy = car.y + Math.sin(car.angle) * bumperOffset;
                        
                        const lightStat = car.lightRange || 60;
                        const beamLength = lightStat * 6;
                        const beamWidth = lightStat * 1.5;
                        
                        this.lightCtx.save();
                        this.lightCtx.translate(cx, cy);
                        this.lightCtx.rotate(car.angle);
                        
                        const grad = this.lightCtx.createLinearGradient(0, 0, beamLength, 0);
                        const lightingElement = car.headlightColor || car.bodyColor || '#ffffdd';
                        const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(lightingElement);
                        const rgb = hexMatch 
                            ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}` 
                            : '255, 255, 170';
                        const gradCol = lightingElement;
                        grad.addColorStop(0, gradCol);
                        grad.addColorStop(1, `rgba(${rgb}, 0)`);
                        
                        this.lightCtx.fillStyle = grad;
                        this.lightCtx.beginPath();
                        this.lightCtx.moveTo(0, -15);
                        this.lightCtx.lineTo(beamLength, -beamWidth);
                        this.lightCtx.lineTo(beamLength, beamWidth);
                        this.lightCtx.lineTo(0, 15);
                        this.lightCtx.fill();
                        this.lightCtx.restore();
                    }
                }

                this.lightCtx.restore();
            
                // 7. RENDER TO SCREEN (UPSCALING)
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); 
                ctx.globalAlpha = finalOpacity;
                
                // Soft Shadows: single GPU-accelerated blur over entire lighting layer.
                // Much smoother than per-polygon shadowBlur — uniform softness on all edges.
                if (GameSettings.softShadows) {
                    ctx.filter = 'blur(4px)';
                }
                
                ctx.drawImage(this.lightCanvas, 0, 0, this.canvas.width, this.canvas.height);
                
                if (GameSettings.softShadows) {
                    ctx.filter = 'none';
                }
                
                // 8. NV SIGNAL BOOST
                if (this.nvIntensity > 0.01) {
                    ctx.globalCompositeOperation = 'soft-light';
                    ctx.globalAlpha = 1.0;
                    ctx.fillStyle = `rgba(255, 255, 255, ${this.nvIntensity * 0.6})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            
                // Lightning Flash Effect
                if (this.weather.lightningFlash > 0) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = this.weather.lightningFlash * 0.7;
                    ctx.fillStyle = `rgba(200, 220, 255, 1)`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
                ctx.restore();
            }
            
            darkenColor(hex, amount) { return darkenHex(hex, Math.floor(255 * amount)); }

            // ═══ WET-WORLD POST-PROCESSING ═══
            
            drawBloomPass(ctx) {
                if (!GameSettings.bloom) return;
                const W = this.canvas.width, H = this.canvas.height;
                const bw = Math.floor(W / 3), bh = Math.floor(H / 3);
                if (this.bloomCanvas.width !== bw || this.bloomCanvas.height !== bh) {
                    this.bloomCanvas.width = bw; this.bloomCanvas.height = bh;
                }
                this.bloomCtx.clearRect(0, 0, bw, bh);
                this.bloomCtx.drawImage(this.canvas, 0, 0, bw, bh);
                this.bloomCtx.globalCompositeOperation = 'lighter';
                this.bloomCtx.globalAlpha = 0.5;
                this.bloomCtx.drawImage(this.bloomCanvas, 0, 0);
                this.bloomCtx.globalAlpha = 1.0;
                this.bloomCtx.globalCompositeOperation = 'source-over';
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.15;
                ctx.filter = 'blur(12px)';
                ctx.drawImage(this.bloomCanvas, 0, 0, W, H);
                ctx.filter = 'blur(24px)';
                ctx.globalAlpha = 0.08;
                ctx.drawImage(this.bloomCanvas, 0, 0, W, H);
                ctx.filter = 'none';
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }
            
            drawWetReflections(ctx) {
                if (!GameSettings.wetReflections || !this.lamps || this.lamps.length === 0) return;
                const ambient = this.getAmbientDarkness();
                if (ambient < 0.2) return; // No reflections in daylight
                ctx.save();
                ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
                ctx.scale(this.camera.zoom, this.camera.zoom);
                let camX, camY;
                if (this.cutscene && this.cutscene.active) { camX = this.camera.x; camY = this.camera.y; }
                else { camX = this.player.x; camY = this.player.y; }
                ctx.translate(-camX + this.camera.shakeX, -camY + this.camera.shakeY);
                ctx.globalCompositeOperation = 'lighter';
                const halfW = (this.canvas.width / 2) / this.camera.zoom;
                const halfH = (this.canvas.height / 2) / this.camera.zoom;
                for (const l of this.lamps) {
                    if (l.x < camX - halfW - 300 || l.x > camX + halfW + 300 ||
                        l.y < camY - halfH - 300 || l.y > camY + halfH + 300) continue;
                    if (this.roomSystem && this.roomSystem.isLampRoomDark && this.roomSystem.isLampRoomDark(l)) continue;
                    const r = l.radius || 200;
                    const color = l.color || '#ffeebb';
                    const intensity = l.intensity || 0.8;
                    const hex = color.replace('#', '');
                    const cr = parseInt(hex.substr(0, 2), 16) || 255;
                    const cg = parseInt(hex.substr(2, 2), 16) || 238;
                    const cb = parseInt(hex.substr(4, 2), 16) || 187;
                    const reflectH = r * 1.2, reflectW = r * 0.4;
                    const grad = ctx.createRadialGradient(l.x, l.y + r * 0.3, 0, l.x, l.y + r * 0.3, reflectH);
                    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.06 * intensity})`);
                    grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},${0.03 * intensity})`);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath(); ctx.ellipse(l.x, l.y + r * 0.3, reflectW, reflectH, 0, 0, Math.PI * 2); ctx.fill();
                    const hotGrad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 0.25);
                    hotGrad.addColorStop(0, `rgba(${Math.min(255, cr + 40)},${Math.min(255, cg + 40)},${Math.min(255, cb + 40)},${0.08 * intensity})`);
                    hotGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = hotGrad;
                    ctx.beginPath(); ctx.arc(l.x, l.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }
            
            drawAtmospherePass(ctx) {
                const tintMap = {
                    amber: 'rgba(255,160,50,0.04)',
                    violet: 'rgba(120,60,200,0.04)',
                    crimson: 'rgba(200,50,70,0.03)',
                    teal: 'rgba(50,180,200,0.03)'
                };
                const tint = tintMap[GameSettings.atmosphereTint];
                if (!tint) return;
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = tint;
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                ctx.restore();
            }
            
            applyColorGrade() {
                const GRADES = {
                    none: { brightness: 100, contrast: 100, saturate: 100, tempR: 128, tempG: 128, tempB: 128, tempOpacity: 0, vignette: 0 },
                    amber_night: { brightness: 95, contrast: 130, saturate: 110, tempR: 178, tempG: 118, tempB: 88, tempOpacity: 0.08, vignette: 35 },
                    violet_noir: { brightness: 90, contrast: 140, saturate: 80, tempR: 108, tempG: 88, tempB: 178, tempOpacity: 0.08, vignette: 45 },
                    crimson: { brightness: 92, contrast: 135, saturate: 120, tempR: 178, tempG: 98, tempB: 108, tempOpacity: 0.07, vignette: 30 },
                    cold_teal: { brightness: 95, contrast: 125, saturate: 75, tempR: 78, tempG: 138, tempB: 178, tempOpacity: 0.07, vignette: 25 },
                    dreampunk: { brightness: 93, contrast: 145, saturate: 95, tempR: 148, tempG: 108, tempB: 168, tempOpacity: 0.06, vignette: 50 }
                };
                const g = GRADES[GameSettings.colorGrade] || GRADES.none;
                const filters = [];
                if (g.brightness !== 100) filters.push(`brightness(${g.brightness / 100})`);
                if (g.contrast !== 100) filters.push(`contrast(${g.contrast / 100})`);
                if (g.saturate !== 100) filters.push(`saturate(${g.saturate / 100})`);
                this.canvas.style.filter = filters.length > 0 ? filters.join(' ') : 'none';
                // Temperature overlay
                let ov = document.getElementById('grade-overlay');
                if (!ov) {
                    ov = document.createElement('div');
                    ov.id = 'grade-overlay';
                    ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;';
                    this.canvas.parentElement.appendChild(ov);
                }
                if (g.tempOpacity > 0) {
                    ov.style.background = `rgb(${g.tempR},${g.tempG},${g.tempB})`;
                    ov.style.opacity = g.tempOpacity;
                    ov.style.display = 'block';
                } else { ov.style.display = 'none'; }
                // Vignette
                if (g.vignette > 0) {
                    this.canvas.style.boxShadow = `inset 0 0 ${g.vignette * 2}px ${g.vignette}px rgba(0,0,0,${g.vignette / 100})`;
                } else { this.canvas.style.boxShadow = 'none'; }
            }

            roundRect(x, y, w, h, r) { if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2; this.ctx.beginPath(); this.ctx.moveTo(x + r, y); this.ctx.arcTo(x + w, y, x + w, y + h, r); this.ctx.arcTo(x + w, y + h, x, y + h, r); this.ctx.arcTo(x, y + h, x, y, r); this.ctx.arcTo(x, y, x + w, y, r); this.ctx.closePath(); }

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
                    held: cosmeticConfig.held || outfit.held || null
                });
                
                this.ctx.restore();
            }

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
            }

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
            }
            cancelPausableTimeout(timer) {
                const idx = this.pausableTimers.indexOf(timer);
                if (idx !== -1) this.pausableTimers.splice(idx, 1);
            }
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
            }

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
                }
            }

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
            }
            
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
            }
            
            initJoystick() {
                const inputZone = document.getElementById('input-zone-left'); const visualZone = document.getElementById('joystick-zone'); const knob = document.getElementById('joystick-knob');
                inputZone.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.joystick.active) return; const touch = e.changedTouches[0]; this.joystick.id = touch.identifier; this.joystick.active = true; this.joystick.originX = touch.clientX; this.joystick.originY = touch.clientY; this.joystick.dx = 0; this.joystick.dy = 0; visualZone.style.display = 'block'; visualZone.style.left = (touch.clientX - 50) + 'px'; visualZone.style.top = (touch.clientY - 50) + 'px'; knob.style.transform = `translate(-50%, -50%)`; }, {passive: false});
                inputZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (!this.joystick.active) return; for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.joystick.id) { const touch = e.changedTouches[i]; const deltaX = touch.clientX - this.joystick.originX; const deltaY = touch.clientY - this.joystick.originY; const maxDist = 35; const distance = Math.min(Math.sqrt(deltaX*deltaX + deltaY*deltaY), maxDist); const angle = Math.atan2(deltaY, deltaX); const moveX = Math.cos(angle) * distance; const moveY = Math.sin(angle) * distance; knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`; this.joystick.dx = moveX / maxDist; this.joystick.dy = moveY / maxDist; break; } } }, {passive: false});
                const endHandler = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.joystick.id) { this.joystick.active = false; this.joystick.dx = 0; this.joystick.dy = 0; visualZone.style.display = 'none'; break; } } };
                inputZone.addEventListener('touchend', endHandler); inputZone.addEventListener('touchcancel', endHandler);
            }

            initFireJoystick() {
                const fireZone = document.getElementById('btn-fire'); const knob = document.getElementById('fire-joystick-knob');
                fireZone.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.fireJoystick.active) return; const touch = e.changedTouches[0]; this.fireJoystick.id = touch.identifier; this.fireJoystick.active = true; const rect = fireZone.getBoundingClientRect(); this.fireJoystick.originX = rect.left + rect.width / 2; this.fireJoystick.originY = rect.top + rect.height / 2; this.fireJoystick.dx = 0; this.fireJoystick.dy = 0; knob.style.transform = `translate(-50%, -50%)`; }, {passive: false});
                fireZone.addEventListener('touchmove', (e) => { e.preventDefault(); if (!this.fireJoystick.active) return; for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.fireJoystick.id) { const touch = e.changedTouches[i]; const deltaX = touch.clientX - this.fireJoystick.originX; const deltaY = touch.clientY - this.fireJoystick.originY; const maxDist = 35; const distance = Math.min(Math.sqrt(deltaX*deltaX + deltaY*deltaY), maxDist); const angle = Math.atan2(deltaY, deltaX); const moveX = Math.cos(angle) * distance; const moveY = Math.sin(angle) * distance; knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`; this.fireJoystick.dx = moveX / maxDist; this.fireJoystick.dy = moveY / maxDist; break; } } }, {passive: false});
                const endHandler = (e) => { e.preventDefault(); for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === this.fireJoystick.id) { this.fireJoystick.active = false; this.fireJoystick.dx = 0; this.fireJoystick.dy = 0; knob.style.transform = `translate(-50%, -50%)`; break; } } };
                fireZone.addEventListener('touchend', endHandler); fireZone.addEventListener('touchcancel', endHandler);
            }

            start(mapId) { 
                // Auto-detect mobile on first load (no saved settings override)
                if (GameSettings._isMobile && !localStorage.getItem('dimensions_save_data') && !localStorage.getItem('dfab_save_slot_0')) {
                    GameSettings.applyPreset('medium');
                    this.lightingScale = 0.75;
                    GameSettings.applyFilmGrain();
                    this.resize();
                    console.log('[AUTO-DETECT] Mobile device — applied MEDIUM preset');
                }
                this.running = true; this.loadMap(mapId); document.getElementById('ui-layer').style.display = 'none'; document.getElementById('game-container').style.display = 'block'; if (this.ui) this.ui.showMissionBanner("WELCOME TO SOUTHERN DIMENSIONS CITY", "new", "WELCOME"); this.loop(); 
            }
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
            }
            
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
            }
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
            }
        }

