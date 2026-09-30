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
                this.fireJoystick = { active: false, dx: 0, dy: 0, originX: 0, originY: 0, id: null, aimed: false, firing: false, armed: false };
                this._releaseShot = null; this._releaseWait = 0;   // sniper fire-on-release (initFireJoystick)
                
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
                this.lobbyLife = new LobbyLife(); // The Double Nights lobby's guests and staff (world/lobby-life.js)
                
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
                this.flitRingEl = document.getElementById('joystick-ring');   // the move stick's flit ring (initJoystick)
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
                this.projectiles = []; this.props = []; this.npcs = []; this.enemies = []; this.loot = []; this.lamps = []; this.lastKnownMarkers = []; this.muzzleFlashes = []; this.casings = [];
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
                this.resonance = new ResonanceSystem();      // 949's progression (core/resonance.js)
                this.darkElement = 0;                        // premium shards (off-market goods)
                this.lastHurtAt = -99; this.flitState.lastFlitAt = -99;
                this.bumperMinigame = new BumperCarMinigame();
                this.bonding = new BondingSystem();
                this.dialogueSeq = new DialogueSequence(this);
                this.transcript = new DialogueTranscript();
                this.scenes = new ScenePlayer(this);            // story/scene-runner.js: the story's scenes
                this.coach = new Coach(this);                   // ui/coach.js: points at the UI and says what it's for
                this.hud = new HudReveal(this);
                this.groundBaker = new GroundBaker(this);       // world/ground-baker.js: the city's streets, painted once per tile                 // ui/hud-reveal.js: the HUD appears as the story introduces it
                // Universal capture: any write to the NPC text element gets transcribed,
                // regardless of which code path produced it (DialogueSequence, single-line
                // shop greetings, recruit prompts, story handler). Pulls the speaker from
                // npcNameEl, which is set by every call site before the text write.
                this._installDialogueCapture();
                this._installDialogueStyle();
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
                // (Their looks are in core/appearances.js)
                this.teammates = [ 
                    // Victoria Nils — SMG suppression, pink afro, silver boots
                    new NPC(1100, 150, "Victoria", "teammate", {
                        weaponId: 'rifle_rb98',
                        burstSize: 3,
                        burstDelay: 5,
                        accuracyMod: 0.8,
                        bio: 'Ex-corpo marksman turned freelancer. Loyal, lethal, and always watching your six.',
                        relationship: 0
                    }),
                    // Yenna Stone — Sniper, composed, deadly precise
                    new NPC(1150, 150, "Yenna", "teammate", {
                        weaponId: 'sniper_sr86',
                        burstSize: 1,
                        burstDelay: 0,
                        accuracyMod: 0.95,
                        bio: 'Former military sharpshooter. Quiet, patient, sees everything. SR-86 is an extension of her arm.',
                        relationship: 0
                    }),
                    // Sabrina Darkmancer — Sarcastic, dark energy, close-range
                    new NPC(1200, 150, "Sabrina", "teammate", {
                        weaponId: 'pistol_fpx',
                        burstSize: 2,
                        burstDelay: 8,
                        accuracyMod: 0.85,
                        bio: 'Street sorcerer with a mean trigger finger. Sarcasm is her second language, violence is her first.',
                        relationship: 0
                    }),
                    // Max Moon — Hotheaded, sparks, electric energy
                    new NPC(1250, 150, "Max", "teammate", {
                        weaponId: 'pistol_fpx',
                        burstSize: 2,
                        burstDelay: 6,
                        accuracyMod: 0.75,
                        bio: 'Short fuse, big firepower. Snaps blue sparks from his fingertips when he\'s irritated — which is always.',
                        relationship: 0
                    }),
                    // Josh Burke — Flat, matter-of-fact, efficient
                    new NPC(1300, 150, "Josh", "teammate", {
                        weaponId: 'sniper_sara',
                        burstSize: 1,
                        burstDelay: 0,
                        accuracyMod: 0.9,
                        bio: 'Intel specialist. States facts. Throws shrapnel when angry. Carries YourGirlSara like it owes him money.',
                        relationship: 0
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

        }

        // The rest of GameEngine's methods live in engine/*.js and are attached with
        // engineMixin(). Descriptors are made non-enumerable so the prototype looks
        // exactly as if the methods were written inside the class body.
        function engineMixin(methods) {
            const d = Object.getOwnPropertyDescriptors(methods);
            for (const k of Object.keys(d)) d[k].enumerable = false;
            Object.defineProperties(GameEngine.prototype, d);
        }

