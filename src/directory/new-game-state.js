        // ===== LV2 DIRECTORY =====
        // GameEngine: this game's new-game defaults (resetGameState): player, quest flags, inventory, crew,
        // story, missions, phone, the last run's world. Called on exit to the main menu and before a new game.
        // Moved verbatim from engine/loop.js. Methods are added to GameEngine.prototype (engineMixin, engine/game-engine.js).
        engineMixin({
            /**
             * Reset all gameplay state to new-game defaults.
             * Called on exit to main menu and before starting a new game.
             * Preserves: DOM references, systems infrastructure, settings.
             * Resets: inventory, quest progress, health, currency, driving, entities.
             */
            resetGameState() {
                if(this.activeLevel)this._leaveApartment();
                this._pendingApartmentState=this._pendingApartmentRoster=null;
                game_timers.cancel();   // nothing pending from the last game (basement/timer-kit.js; standing timers stay)
                this._cancelQuickDrawHold?.(); this.cancelQuickDraw();
                this._pendingGauntletLoad = null;
                this.restrictedZone=null;
                document.getElementById('ui-scrapyard')?.classList.remove('show');
                document.body.classList.remove('yard-hud');
                clearTimeout(this.hordeGauntlet?._endT);
                this.hordeGauntlet = null;
                this._releaseLightingBase();
                if (PerformanceBench.active) PerformanceBench.cancel();
                this._cancelMapTextureWarmup(true);
                this._clearRenderSpatial();
                this._releaseReflectionScratch();
                this._effectSpatial = this._effectCandidateBuffers = null;
                _physicsSpatial.clear();
                CollisionSystem.clearSpatialGrid();
                if (this.scenes) this.scenes.abort();                       // a scene left playing doesn't run on into the next game
                if (this.cutscene) this.cutscene.end();
                if (this._bossIntroSkip) {
                    window.removeEventListener('pointerdown', this._bossIntroSkip);
                    window.removeEventListener('keydown', this._bossIntroSkip);
                    this._bossIntroSkip = null;
                }
                this._bossIntros = []; this._bossIntro = null;
                document.getElementById('boss-title')?.classList.remove('show');
                if (this._rideState && this._rideState.on) { this._rideEl.classList.remove('show'); this._rideState.on = false; }   // the ride tag goes with the run
                // The big canvases go with the run: painted floors, the city's ground tiles, the baked crowd
                if (this._releaseMapBakes) this._releaseMapBakes(null);
                if (this.groundBaker) { this.groundBaker.invalidate(); this.groundBaker.mapId = null; }
                if (typeof CrowdImpostors !== 'undefined') CrowdImpostors.clear();
                if (typeof PropSprites !== 'undefined') { PropSprites.clear(this.props); PlaneSprites.clear(this.activeMap && this.activeMap.buildings); }
                if (this.coach) { this.coach.dismiss(); this.coach.deserialize([]); }   // a story New Game then calls hud.startFresh()
                if (this.hud) this.hud.revealAll();
                this.visitedMaps = new Set(); this._mapSnaps = {};                       // a new run hasn't been anywhere yet
                // --- PLAYER STATE ---
                this.currency = 100;
                this.scrap = 0;
                this.player.buffSystem.active={};
                this.player.vitals.reset();
                this.boosterCount = 4;
                this.maxBoosters = 4;
                this.weaponMode = 'none';
                this.setWeaponHolstered(false); this.holsterAnim = 1;
                this._drawnAt = undefined; this._drawShotUsed = false;
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

                // --- COSMETICS ---
                if (this.cosmetics) {
                    this.cosmetics = new CosmeticsSystem();
                }
                
                // --- STORY ---
                if (this.story) {
                    this.story.state = { part: 1, chapter: 1, mission: 1, step: 0 };
                    this.story.watchers = [];
                    this.story.currentStepData = null;
                    this.story.initializedStep = false;
                    this.story.stepTimer = 0;
                    this.story.activeOptional = null;
                    this.story.completedOptional = [];
                }
                
                // --- NOTES, THE TRANSCRIPT, BUFFS ---
                this.foundNotes = [];
                if (typeof DialogueTranscript !== 'undefined') this.transcript = new DialogueTranscript();   // the last run's lines aren't this run's
                
                // --- BONDING ---
                if (this.bonding) {
                    this.bonding.seenDialogues = {};
                    this.bonding.bondedThisRest.clear();
                }
                
                // --- MISSIONS ---
                if (this.missions) {
                    this.missions.activeMission = null;
                    this.missions.completedCount = 0;
                    this.missions.completedDeliveries = 0;
                    this.missions.completedBounties = 0;                   // (Anavia's salvage opens at 5: a new run earns them again)
                    this.missions.amber = MissionSystem.freshAmber();
                    this.missions._recipients = [];
                    if (this.missions.missionLog) this.missions.missionLog = [];
                }
                
                // --- DRIVING / VEHICLE ---
                this._endDrive();
                this.car = this.ownedCar;                               // her car, back where a new game starts (engine/cars.js)
                Object.assign(this.ownedCar, CAR_START, { vx: 0, vy: 0, speed: 0, controlMode: 'PARKED' });
                if (typeof PlayerGarage !== 'undefined') { this.garage = new PlayerGarage(); this.garage.applyToVehicle(this.ownedCar); }   // only the BlackMark again: the last run's cars and paint stay in it
                this.deliveryVehicle = null;                            // Amber's van parks by the cafe again on the next hub load
                
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
                        if (typeof t.startRelationship === 'number') t.relationship = t.startRelationship;   // the crew's bonds start over
                        if (t.maxTeammateStims) t.teammateStims = t.maxTeammateStims;
                    });
                }
                
                // --- FLIT / TIME SLOW ---
                this.flitVFX = []; this._resetFlitFeedback();
                this.graveyardGhosts = [];
                this.timeSlowState = { active: false, scale: 1.0, targetScale: 1.0, duration: 0, transitionSpeed: 0.05 };
                
                // --- WORLD TIME ---
                this.worldMinutes = 21 * 60;
                this.lastTimeTick = 0;
                
                // --- TRANSIENT ENTITIES ---
                this.projectiles = [];
                this.stickyOrbs = [];
                this.effects.clear();
                this._fireTrailSerial = 0;
                this.loot = [];
                this.npcs = []; this.props = []; this.lamps = []; this.enemies = []; this.corpses = [];   // the last map's (loading a map sets them)
                this.lastKnownMarkers = []; this.noiseRipples = []; this.flitVFX = [];
                if (this.traffic) this.traffic.reset();                         // the last run's street, too (the hub doesn't reset it on load)
                if (this.pedestrians) this.pedestrians.reset();
                this.activeInteraction = null;
                
                // --- PHONE ---
                if (typeof phoneSystem !== 'undefined') {
                    phoneSystem.messageHistory = {};
                    phoneSystem.unread = {};
                    phoneSystem.lastMessageAt = {};
                    if (phoneSystem.contactOverrides) phoneSystem.contactOverrides = {};
                    phoneSystem.metNPCs = new Set();
                    if (phoneSystem.resetFeed) phoneSystem.resetFeed();
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
                    this.player.vitals.restoreHealth();
                    this.player.visible = true;
                    this.player.isHidden = false;
                }
                
                console.log('[RESET] Game state cleared to defaults');
            },
        });
