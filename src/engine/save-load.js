        // GameEngine — Save schema, migrations, saveGame / loadGame.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
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

                    // --- RESONANCE & DARK ELEMENT ---
                    resonance: this.resonance ? this.resonance.serialize() : null,
                    darkElement: this.darkElement || 0,
                    
                    // --- COSMETICS ---
                    cosmetics: this.cosmetics ? this.cosmetics.serialize() : null,
                    
                    // --- STORY ---
                    story: this.story ? this.story.serialize() : null,
                    
                    // --- NOTES ---
                    foundNotes: this.foundNotes || [],

                    // --- HUD: which parts the story has introduced, what the coach has taught ---
                    hudRevealed: this.hud ? this.hud.serialize() : undefined,
                    coachTaught: this.coach ? this.coach.serialize() : undefined,
                    
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
                        highestWave: this.hordeGauntlet.highestWave || 0,       // best on any map (older builds read this)
                        highestWaves: { ...this.hordeGauntlet.highestWaves }
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
                        gradeCustom: GameSettings.gradeCustom,
                        stealthGray: GameSettings.stealthGray,
                        reflections: GameSettings.reflections,
                        photoReflections: GameSettings.photoReflections,
                        soundRings: GameSettings.soundRings,
                        finisher: GameSettings.finisher,
                        footsteps: GameSettings.footsteps,
                        enemyRings: GameSettings.enemyRings,
                        fpsLimit: GameSettings.fpsLimit,
                        audioEnabled: GameSettings.audioEnabled,
                        flitRing: GameSettings.flitRing, flitFlick: GameSettings.flitFlick,
                        flitTwoFinger: GameSettings.flitTwoFinger, flitButton: GameSettings.flitButton,
                        aimBeforeFire: GameSettings.aimBeforeFire, sniperRelease: GameSettings.sniperRelease, scopeView: GameSettings.scopeView,
                        ambienceVolume: GameSettings.ambienceVolume,
                        musicVolume: GameSettings.musicVolume,
                        fullscreen: GameSettings.fullscreen,
                    },
                };
            },
            
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
            },
            
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
            },

            // ────────────────────────────────────────────────────────────────────────
            //  SAVE VERSIONING & MIGRATIONS
            //  Bump getSaveVersion() and register a migration when making a breaking
            //  change to the save shape (renaming a key, restructuring nested data,
            //  etc.). Adding NEW fields with sensible defaults does NOT need a bump
            //  — mergeSaveData() handles missing keys against getDefaultSaveValues().
            // ────────────────────────────────────────────────────────────────────────

            /** Current save schema version. Single source of truth. */
            getSaveVersion() { return 2; },

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
            },

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
            },

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
            },

            saveGame() {
                if (this.scenes && this.scenes.running) { showMessage("Can't save during a scene"); return; }
                // Build save data from schema (captures current game state)
                const saveData = this.getSaveSchema();
                
                // Serialize all companions (unified — permanent + contract)
                // (Old saves carried a `dancers` list; loadGame still reads it. New saves keep companions in `teammates`.)
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
                const slotLabel = (typeof saveSlotManager !== 'undefined') ? ` [SLOT ${saveSlotManager.activeSlot + 1}]` : '';
                showMessage(`GAME SAVED TO DISK.${slotLabel}`);
                audioSys.sfx('ui');
                console.log('[SAVE] Game saved:', saveData);
                if (saveData.phone) {
                    console.log('[SAVE] Phone data:', saveData.phone);
                    console.log('[SAVE] Message history contacts:', Object.keys(saveData.phone.messageHistory || {}));
                }
            },
        
            loadGame() {
                const slotKey = (typeof saveSlotManager !== 'undefined') ? saveSlotManager.getActiveKey() : 'dfab_save_slot_0';
                let json = localStorage.getItem(slotKey);
                // (A pre-slots save was moved into slot 1 once, by saveSlotManager._migrateV1Save; an empty slot stays empty.)
                if (json && this.pausableTimers) this.pausableTimers.length = 0;   // the loaded world starts with nothing pending
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
                    let mapId = worldData.mapId ?? rawSave.mapId ?? defaults.world.mapId;
                    const playerX = playerData.x ?? rawSave.player?.x ?? defaults.player.x;
                    const playerY = playerData.y ?? rawSave.player?.y ?? defaults.player.y;
                    // Saved in Grum's old arena: it's the House of Death now — start at its door
                    if (mapId === 'grum_arena') { mapId = 'house_of_death'; this.loadMap(mapId); }
                    else this.loadMap(mapId, { x: playerX, y: playerY });
        
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
                            // The Maiden's Kukri waits in the armory for now (GameSettings.kukriFromArmory); later only the Demoness gives it
                            if (GameSettings.kukriFromArmory !== false && !invData.items.includes('maiden_kukri')) { const k = createItemFromRegistry('maiden_kukri', this); if (k) this.inventory.items.push(k); }
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

                    // 10a. Restore Resonance (older saves have none: level 0) and Dark Element
                    if (this.resonance) { this.resonance.deserialize(save.resonance || null); this.applyResonanceStats(); }
                    this.darkElement = save.darkElement || 0;

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

                    // 10c2. The HUD the story has introduced (older saves: all of it)
                    if (this.coach) { this.coach.dismiss(); this.coach.deserialize(save.coachTaught); }
                    if (this.hud) this.hud.deserialize(save.hudRevealed);

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
                        // Per map; an old save's single number becomes the House of Death's
                        this.hordeGauntlet.highestWaves = { ...(save.hordeGauntlet.highestWaves || {}) };
                        if (!save.hordeGauntlet.highestWaves) this.hordeGauntlet.highestWave = save.hordeGauntlet.highestWave || 0;
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
                        GameSettings.softShadows = save.settings.softShadows ?? (GameSettings.lightingQuality === 'high');
                        GameSettings.bloom = save.settings.bloom !== false;
                        GameSettings.wetReflections = save.settings.wetReflections !== false;
                        GameSettings.atmosphereTint = save.settings.atmosphereTint ?? '';
                        GameSettings.colorGrade = save.settings.colorGrade || 'none';
                        GameSettings.gradeCustom = save.settings.gradeCustom || null;
                        GameSettings.stealthGray = save.settings.stealthGray !== false;
                        GameSettings.reflections = save.settings.reflections || (GameSettings.wetReflections ? 'high' : 'off');
                        GameSettings.photoReflections = save.settings.photoReflections !== false;
                        if (save.settings.soundRings) GameSettings.soundRings = save.settings.soundRings;
                        if (save.settings.finisher) GameSettings.finisher = save.settings.finisher;
                        GameSettings.footsteps = save.settings.footsteps !== false;
                        GameSettings.enemyRings = save.settings.enemyRings !== false;
                        if (typeof restoreGameGrade === 'function') restoreGameGrade();       // the grade back on screen, not just in the setting
                        GameSettings.fpsLimit = save.settings.fpsLimit || 0;
                        GameSettings.audioEnabled = save.settings.audioEnabled !== false;
                        GameSettings.flitRing = save.settings.flitRing !== false;
                        GameSettings.flitFlick = !!save.settings.flitFlick;
                        GameSettings.flitTwoFinger = !!save.settings.flitTwoFinger;
                        GameSettings.flitButton = save.settings.flitButton !== false;
                        GameSettings.aimBeforeFire = save.settings.aimBeforeFire !== false;
                        GameSettings.sniperRelease = save.settings.sniperRelease !== false;
                        GameSettings.scopeView = save.settings.scopeView !== false;
                        GameSettings.applyControls();
                        if (typeof save.settings.ambienceVolume === 'number') GameSettings.ambienceVolume = Math.max(0, Math.min(1, save.settings.ambienceVolume));
                        if (typeof save.settings.musicVolume === 'number') audioSys.setMusicVolume(save.settings.musicVolume);
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
            },

        });

