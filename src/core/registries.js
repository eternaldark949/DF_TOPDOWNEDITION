        // ============================================================================
        //  NOTE REGISTRY — Readable documents, letters, briefings, lore.
        //  Each entry defines content + visual style. Found notes are tracked
        //  in game.foundNotes[] and can be re-read from a future journal screen.
        //  Styles: 'letter' (warm parchment), 'briefing' (cold professional),
        //          'ancient' (dark mystical parchment), 'digital' (tech hologram)
        // ============================================================================
        const NOTE_REGISTRY = GAME_DB.items.notes;   // directory/game-db/items.json

        // ============================================================================
        //  CONSUMABLES CONFIG — Data-driven vending machine items & buff definitions
        //  Add new items in directory/game-db/items.json. The engine reads modifiers automatically.
        //  Modifier stats: 'speed', 'flitDistance', 'flitCooldown', 'detectionRange'
        //  Modifier types: 'multiply' (base * value), 'add' (base + value)
        // ============================================================================
        /* The code the consumables name in their `hooks` field (directory/game-db/items.json has their data). */
        const CONSUMABLE_HOOKS = {
            stellar_lemonade: {
                unlockCheck: (game) => game.missions && game.missions.completedBounties >= 5,
                onActivate: (game, buff, config) => {
                    buff.shield = buff.maxShield;
                    buff.savedMaxHp = game.maxPlayerHealth;
                    game.maxPlayerHealth = Math.floor(game.maxPlayerHealth / 2);
                    game.playerHealth = Math.min(game.playerHealth, game.maxPlayerHealth);
                    game.player.syncHealth(game.playerHealth, game.maxPlayerHealth);
                },
                onExpire: (game, buff) => {
                    buff.shield = 0;
                    if (buff.savedMaxHp > 0) {
                        game.maxPlayerHealth = buff.savedMaxHp;
                        buff.savedMaxHp = 0;
                    }
                    game.player.syncHealth(game.playerHealth, game.maxPlayerHealth);
                }
            }
        };
        const CONSUMABLES = attachDataHooks(GAME_DB.items.consumables, CONSUMABLE_HOOKS);   // directory/game-db/items.json

        // ============================================================================
        //  COSMETICS REGISTRY — Data-driven appearance items (W.I.G.s / S.K.I.N.s / V.O.C.A.L.s)
        //  Each entry maps to drawProceduralHumanoid config fields.
        //  Purchased at Neural Systems, equipped via NEU.ME app.
        // ============================================================================
        /** Drinks for the Crystal Glass. `glass` picks the glass shape (seen from above). */
        const GLASS_DRINKS = GAME_DB.items.drinks;   // directory/game-db/items.json

        /** The parts of an outfit the Clothing Dyer can colour: ['top.color', 'top.trim', …], in wearing order */
        const DYE_KEYS = ['color', 'trim', 'inner', 'accent', 'stripe'];
        function dyeSlots(data) {
            const out = [];
            for (const piece of ['top', 'bottom', 'shoes']) for (const k of DYE_KEYS) if (data && data[piece] && typeof data[piece][k] === 'string') out.push(piece + '.' + k);
            return out;
        }
        /** An outfit's data with its dyes laid over it (a copy; the registry is left alone) */
        function dyedOutfit(data, dyes) {
            if (!dyes || !data) return data;
            const out = { ...data };
            for (const [slot, hex] of Object.entries(dyes)) {
                const [piece, k] = slot.split('.');
                if (!out[piece] || typeof data[piece][k] !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
                if (out[piece] === data[piece]) out[piece] = { ...data[piece] };
                out[piece][k] = hex;
            }
            return out;
        }

        const COSMETICS_REGISTRY = GAME_DB.cast.cosmetics;   // directory/game-db/cast.json

        // ============================================================================
        //  COSMETICS SYSTEM — Manages owned/equipped cosmetics with save/load.
        //  Player starts with default items (price: 0, default: true).
        //  Equipped items feed directly into drawProceduralHumanoid config.
        // ============================================================================
        class CosmeticsSystem {
            constructor() {
                // Owned cosmetic IDs
                this.owned = [];
                // Equipped per-slot (one per category)
                this.equippedWig = null;
                this.equippedSkin = null;
                this.equippedVocal = null;
                this.equippedOutfit = null;
                this.equippedAccessory = null;      // optional slot (null = none)
                this.equippedHat = null;            // optional slot (null = none)
                this.equippedJewelry = [];          // any number at once
                this.equippedLegwear = [];          // any number at once (thigh bands, thigh-high heels)
                this.accessoryOptions = {};         // per-accessory choices, e.g. { acc_glass: { drink: 'red_wine' } }
                this.dyes = {};                     // the Clothing Dyer's colours, per outfit: { outfit_noir: { 'top.color': '#…', 'shoes.color': '#…' } } (engine/dyer.js)
                this.drinkLevel = 1;                // how full her glass is (1 full, 0 dry): spills drain it, the bar cart tops it up (engine/spills.js)
                this.maskMode = 'auto';             // 949's field mask (Neu.Me): 'auto' (in the field, off at home) | 'on' | 'off'
                // Grant defaults
                this._grantDefaults();
            }

            _grantDefaults() {
                for (const [id, entry] of Object.entries(COSMETICS_REGISTRY)) {
                    if (entry.default && !this.owned.includes(id)) {
                        this.owned.push(id);
                    }
                }
                // Auto-equip first defaults if nothing equipped
                if (!this.equippedWig) this.equippedWig = 'wig_curls_black';
                if (!this.equippedSkin) this.equippedSkin = 'skin_caramel';
                if (!this.equippedVocal) this.equippedVocal = 'vocal_default';
                if (!this.equippedOutfit) this.equippedOutfit = 'outfit_casual';
            }

            isOwned(id) { return this.owned.includes(id); }

            /** Purchase a cosmetic. Returns true on success. */
            buy(id, game) {
                const entry = COSMETICS_REGISTRY[id];
                if (!entry || this.isOwned(id) || entry.crafted) return false;      // crafted pieces come from the workbench
                if (game.currency < entry.price) return false;
                game.currency -= entry.price;
                this.owned.push(id);
                return true;
            }

            /** Equip a cosmetic by ID (must be owned). */
            equip(id) {
                if (!this.isOwned(id)) return false;
                const entry = COSMETICS_REGISTRY[id];
                if (!entry) return false;
                if (entry.category === 'wig') this.equippedWig = id;
                else if (entry.category === 'skin') this.equippedSkin = id;
                else if (entry.category === 'vocal') this.equippedVocal = id;
                else if (entry.category === 'outfit') {
                    this.equippedOutfit = id;
                    // Signature pairing (Periwinkle Silk → Crystal Glass) when the slot is free
                    if (entry.pairsWith && !this.equippedAccessory && this.isOwned(entry.pairsWith)) this.equippedAccessory = entry.pairsWith;
                }
                else if (entry.category === 'accessory') this.equippedAccessory = id;
                else if (entry.category === 'hat') this.equippedHat = id;
                else if (entry.category === 'jewelry') { if (!this.equippedJewelry.includes(id)) this.equippedJewelry.push(id); }
                else if (entry.category === 'legwear') {
                    // One pair of shoes at a time: new shoes take the place of any already on
                    if (entry.data.shoes) this.equippedLegwear = this.equippedLegwear.filter(l => !COSMETICS_REGISTRY[l]?.data.shoes);
                    // and one pair of tights or stockings
                    if (entry.data.type === 'hose') this.equippedLegwear = this.equippedLegwear.filter(l => COSMETICS_REGISTRY[l]?.data.type !== 'hose');
                    if (!this.equippedLegwear.includes(id)) this.equippedLegwear.push(id);
                }
                return true;
            }

            /** Take off the current hat (hats are optional). */
            unequipHat() { this.equippedHat = null; }

            /** Take off one piece of jewelry. */
            unequipJewelry(id) { this.equippedJewelry = this.equippedJewelry.filter(j => j !== id); }

            /** Take off one piece of legwear. */
            unequipLegwear(id) { this.equippedLegwear = this.equippedLegwear.filter(l => l !== id); }

            /** Take off any piece worn in a wear-many slot (jewelry, legwear). */
            unequipWorn(id) { const c = COSMETICS_REGISTRY[id]?.category; if (c === 'legwear') this.unequipLegwear(id); else this.unequipJewelry(id); }

            /** Is this cosmetic currently worn? (works for every category) */
            isEquipped(id) {
                const entry = COSMETICS_REGISTRY[id];
                if (!entry) return false;
                if (entry.category === 'jewelry') return this.equippedJewelry.includes(id);
                if (entry.category === 'legwear') return this.equippedLegwear.includes(id);
                const slot = { wig: 'equippedWig', skin: 'equippedSkin', vocal: 'equippedVocal', outfit: 'equippedOutfit', accessory: 'equippedAccessory', hat: 'equippedHat' }[entry.category];
                return !!slot && this[slot] === id;
            }

            /** Take off the current accessory (accessories are optional). */
            unequipAccessory() { this.equippedAccessory = null; }

            /** Read an accessory option, falling back to the registry default. */
            getAccessoryOption(id, key) {
                const o = this.accessoryOptions[id];
                if (o && o[key] !== undefined) return o[key];
                const entry = COSMETICS_REGISTRY[id];
                return entry && entry.options ? entry.options[key] : undefined;
            }

            /** Set an accessory option (e.g. the glass's drink). */
            setAccessoryOption(id, key, value) {
                (this.accessoryOptions[id] || (this.accessoryOptions[id] = {}))[key] = value;
            }

            /** Get the render config for the currently equipped cosmetics. */
            getRenderConfig() {
                const wig = COSMETICS_REGISTRY[this.equippedWig];
                const skin = COSMETICS_REGISTRY[this.equippedSkin];
                const outfit = COSMETICS_REGISTRY[this.equippedOutfit];
                const acc = this.equippedAccessory ? COSMETICS_REGISTRY[this.equippedAccessory] : null;
                let held = null;
                if (acc && acc.data.held === 'glass') {
                    held = { type: 'glass', hand: acc.data.hand || 'right', drink: this.getAccessoryOption(acc.id, 'drink') || 'champagne', mirror: !!acc.data.mirror, level: this.drinkLevel };
                } else if (acc && acc.data.held === 'umbrella') {
                    held = { type: 'umbrella', hand: acc.data.hand || 'right', color: acc.data.color, trim: acc.data.trim };
                }
                const hat = this.equippedHat ? COSMETICS_REGISTRY[this.equippedHat] : null;
                const jewelry = this.equippedJewelry.map(id => COSMETICS_REGISTRY[id]).filter(Boolean).map(e => e.data);
                // Legwear: shoes take the outfit's place; bands and the like ride along with the jewelry
                let outfitData = dyedOutfit(outfit ? outfit.data : COSMETICS_REGISTRY.outfit_casual.data, this.dyes[outfit ? outfit.id : 'outfit_casual']);
                for (const id of this.equippedLegwear) {
                    const leg = COSMETICS_REGISTRY[id];
                    if (!leg) continue;
                    if (leg.data.shoes) outfitData = { ...outfitData, shoes: leg.data.shoes };
                    else jewelry.push(leg.data);
                }
                return {
                    // Without a cosmetic, she's herself (APPEARANCES['949'], core/appearances.js) in Street Casual
                    hair: wig ? { type: wig.data.type, color: wig.data.color } : APPEARANCES['949'].hair,
                    skinColor: skin ? skin.data.skinColor : APPEARANCES['949'].skinColor,
                    outfit: outfitData,
                    hat: hat ? hat.data : null,
                    jewelry,
                    held
                };
            }

            /** Get caption color for equipped vocal. */
            getCaptionColor() {
                const vocal = COSMETICS_REGISTRY[this.equippedVocal];
                return vocal ? vocal.data.captionColor : '#ffffff';
            }

            serialize() {
                return {
                    owned: [...this.owned],
                    equippedWig: this.equippedWig,
                    equippedSkin: this.equippedSkin,
                    equippedVocal: this.equippedVocal,
                    equippedOutfit: this.equippedOutfit,
                    equippedAccessory: this.equippedAccessory,
                    equippedHat: this.equippedHat,
                    equippedJewelry: [...this.equippedJewelry],
                    equippedLegwear: [...this.equippedLegwear],
                    accessoryOptions: JSON.parse(JSON.stringify(this.accessoryOptions)),
                    maskMode: this.maskMode,
                    drinkLevel: this.drinkLevel,
                    dyes: JSON.parse(JSON.stringify(this.dyes))
                };
            }

            deserialize(data) {
                if (!data) return;
                this.owned = data.owned || [];
                this.equippedWig = data.equippedWig || null;
                this.equippedSkin = data.equippedSkin || null;
                this.equippedVocal = data.equippedVocal || null;
                this.equippedOutfit = data.equippedOutfit || null;
                this.accessoryOptions = data.accessoryOptions || {};
                this.maskMode = ['auto', 'on', 'off'].includes(data.maskMode) ? data.maskMode : 'auto';
                this.dyes = data.dyes && typeof data.dyes === 'object' ? data.dyes : {};
                this.drinkLevel = Number.isFinite(data.drinkLevel) ? Math.max(0, Math.min(1, data.drinkLevel)) : 1;   // older saves: a full glass
                // Saves from before hats and jewelry simply have none on
                this.equippedHat = COSMETICS_REGISTRY[data.equippedHat] ? data.equippedHat : null;
                this.equippedJewelry = (data.equippedJewelry || []).filter(id => COSMETICS_REGISTRY[id]);
                this.equippedLegwear = (data.equippedLegwear || []).filter(id => COSMETICS_REGISTRY[id]);
                if (data.equippedAccessory !== undefined) {
                    this.equippedAccessory = data.equippedAccessory || null;
                } else {
                    // Saves from before accessories: the glass used to come with Periwinkle Silk
                    this.equippedAccessory = data.equippedOutfit === 'outfit_suited' ? 'acc_glass' : null;
                }
                this._grantDefaults();  // Ensure defaults always present
            }
        }

        // ============================================================================
        //  BUFF SYSTEM — Stat modifier stack with data-driven activation/expiry
        //  Reads from CONSUMABLES config. All engine systems query getStat() for
        //  final values. Supports multiplicative & additive modifier chaining.
        // ============================================================================
        class BuffSystem {
            constructor() {
                this.active = {};   // { buffId: { active, endTime, shield?, maxShield?, savedMaxHp? } }
            }

            /**
             * Activate a buff by its CONSUMABLES key.
             * Handles cost check, currency deduction, state init, lifecycle hooks, and UI.
             * @returns {boolean} true if purchased successfully
             */
            activate(buffId, worldMinutes, game) {
                const config = CONSUMABLES[buffId];
                if (!config) return false;

                // Already active? Block re-purchase
                if (this.active[buffId]?.active) {
                    showMessage(`${config.name.toUpperCase()} ALREADY ACTIVE.`);
                    return false;
                }

                // Cost check
                if (game.currency < config.cost) {
                    showMessage(`INSUFFICIENT FUNDS (${config.cost} PERSONICS REQUIRED).`);
                    return false;
                }

                game.currency -= config.cost;

                // Build buff runtime state
                const buff = { active: true, endTime: worldMinutes + config.duration };

                // Init shield state if configured
                if (config.shield) {
                    buff.maxShield = config.shield.maxShield;
                    buff.shield = 0;
                    buff.savedMaxHp = 0;
                }

                this.active[buffId] = buff;

                // Lifecycle hook
                if (config.onActivate) config.onActivate(game, buff, config);

                // HUD label
                if (config.uiLabel) {
                    const el = document.getElementById('ui-buffs');
                    uiKit.show(el);
                    el.textContent = config.uiLabel;
                    if (config.uiColor) el.style.color = config.uiColor;
                }

                showMessage(config.purchaseMsg);
                return true;
            }

            /**
             * Resolve a stat through the modifier stack.
             * All active buffs that target `statName` are applied in sequence.
             * @param {string} statName - e.g. 'speed', 'detectionRange', 'flitDistance'
             * @param {number} baseValue - The unmodified base value
             * @returns {number} Final modified value
             */
            getStat(statName, baseValue) {
                let additive = 0;
                let multiplicative = 1.0;
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (!buff.active) continue;
                    const config = CONSUMABLES[buffId];
                    if (!config) continue;
                    for (const mod of config.modifiers) {
                        if (mod.stat !== statName) continue;
                        if (mod.type === 'multiply') multiplicative *= mod.value;
                        else if (mod.type === 'add') additive += mod.value;
                    }
                }
                return (baseValue + additive) * multiplicative;
            }

            /** Check if a specific buff is currently active. */
            isActive(buffId) {
                return !!(this.active[buffId]?.active);
            }

            /** Get the first active buff that has a shield with HP remaining, or null. */
            getShieldBuff() {
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (buff.active && buff.shield !== undefined && buff.shield > 0) return buff;
                }
                return null;
            }

            /**
             * Tick all active buffs — expire any that have exceeded their duration.
             * Called once per in-game minute from the world clock.
             */
            tick(worldMinutes, game) {
                for (const buffId in this.active) {
                    const buff = this.active[buffId];
                    if (buff.active && worldMinutes >= buff.endTime) {
                        this._expire(buffId, game);
                    }
                }
            }

            /** Internal: expire a single buff, run hooks, update UI. */
            _expire(buffId, game) {
                const buff = this.active[buffId];
                if (!buff || !buff.active) return;
                const config = CONSUMABLES[buffId];

                buff.active = false;
                if (config.onExpire) config.onExpire(game, buff);

                // If no active buff still has a UI label, hide the HUD element
                let anyLabel = false;
                for (const id in this.active) {
                    if (this.active[id].active && CONSUMABLES[id]?.uiLabel) { anyLabel = true; break; }
                }
                if (!anyLabel) {
                    const el = document.getElementById('ui-buffs');
                    uiKit.hide(el);
                    el.style.color = '';
                }

                if (config.expireMsg) showMessage(config.expireMsg);
            }

            /** Force-clear all buffs (e.g. on death). Runs onExpire hooks. */
            clearAll(game) {
                for (const buffId in this.active) {
                    if (this.active[buffId].active) this._expire(buffId, game);
                }
            }

            /** Serialize for save system. */
            serialize() {
                const data = {};
                for (const buffId in this.active) {
                    data[buffId] = { ...this.active[buffId] };
                }
                return data;
            }

            /** Deserialize from save data. Restores runtime state without re-triggering hooks. */
            deserialize(savedBuffs) {
                if (!savedBuffs) return;
                for (const buffId in savedBuffs) {
                    if (!CONSUMABLES[buffId]) continue;
                    const saved = savedBuffs[buffId];
                    const buff = { active: saved.active ?? false, endTime: saved.endTime ?? 0 };
                    // Restore shield state if this buff type has it
                    const config = CONSUMABLES[buffId];
                    if (config.shield) {
                        buff.maxShield = saved.maxShield ?? config.shield.maxShield;
                        buff.shield = saved.shield ?? 0;
                        buff.savedMaxHp = saved.savedMaxHp ?? 0;
                    }
                    this.active[buffId] = buff;
                }
            }
        }

