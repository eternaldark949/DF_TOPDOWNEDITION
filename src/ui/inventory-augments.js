        /* =====================================================================
           INVENTORY SYSTEM
           ---------------------------------------------------------------------
           Manages complex items beyond simple counters.
           Connects to the #freelancer-menu UI.
           ===================================================================== */
        class InventoryItem {
            constructor(id, name, type, icon, description, action = null, stats = {}) {
                this.id = id;
                this.name = name;
                this.type = type; // 'weapon', 'consumable', 'intel', 'attachment'
                this.icon = icon;
                this.description = description;
                this.action = action; // Function to execute on use
                this.stats = stats;
                if (stats.effect) this.effect = stats.effect;
            }
        }
        
        /* =====================================================================
           ITEM REGISTRY — Single source of truth for all item definitions.
           Items are stored as data; createItemFromRegistry() builds live objects.
           Save stores IDs only; load reconstructs from this registry.
           ===================================================================== */
        const ITEM_REGISTRY = {
            'pistol_fpx': {
                name: 'FP-X', type: 'weapon', icon: '🔫',
                desc: 'The Freelancer experimental pistol. Packs quite a punch.',
                weaponMode: 'normal',
                stats: { fireRate: 22, recoil: 10, damage: 35, projectileColor: '#00f3ff', projectileSpeed: 25, flashRadius: 50 }
            },
            'sniper_sara': {
                name: 'YourGirlSara', type: 'weapon', icon: '🔭',
                desc: 'Mayhem incarnate. Damn, Sara.',
                weaponMode: 'sniper',
                stats: { fireRate: 70, recoil: 20, damage: 100, projectileColor: '#FFD700', projectileSpeed: 80, flashRadius: 80, penetrating: true }
            },
            'rifle_rb98': {
                name: 'RB-98', type: 'weapon', icon: '🧬',
                desc: 'High-velocity rifle blaster. SMG-class fire rate.',
                weaponMode: 'normal',
                stats: { fireRate: 6, recoil: 4, damage: 15, projectileColor: '#00ffcc', projectileSpeed: 28, flashRadius: 40 }
            },
            'pistol_anavia': {
                name: 'Anavia', type: 'weapon', icon: '💠',
                desc: 'A specialized energy blaster that fires ethereal periwinkle bolts.',
                weaponMode: 'normal',
                stats: { fireRate: 4, recoil: 3, damage: 12, projectileColor: '#CCCCFF', projectileSpeed: 24, flashRadius: 45 }
            },
            'sniper_sr86': {
                name: 'SR-86', type: 'weapon', icon: '🎯',
                desc: 'Semi-automatic crimson death.',
                weaponMode: 'sniper',
                stats: { fireRate: 50, recoil: 15, damage: 65, projectileColor: '#DC143C', projectileSpeed: 40, flashRadius: 60, penetrating: true }
            },
            'laser_sight': {
                name: 'Laser Sight', type: 'attachment', icon: '⊕',
                desc: 'Faint red targeting beam when equipped.',
                stats: { effect: 'laser_sight' }
            },
            'golden_child': {
                name: 'Golden Child', type: 'weapon', icon: '✦',
                desc: 'Fires golden orbs that stick to targets and burn away.',
                weaponMode: 'normal',
                stats: { fireRate: 38, recoil: 6, damage: 18, projectileColor: '#FFD700', projectileSpeed: 18, flashRadius: 45, sticky: true, dotDamage: 10, dotTicks: 12, dotInterval: 10 }
            },
        };
        
        // ============================================================================
        //  ABILITY REGISTRY — Data-driven abilities (magic, fireballs, etc.)
        //  Same stat pattern as ITEM_REGISTRY weapons but for innate/learned abilities.
        //  Any humanoid can use these via ActorEntity.castAbility().
        // ============================================================================
        const ABILITY_REGISTRY = {
            'fireball': {
                name: 'Fireball',
                desc: 'Red-hot projectile cast from the palm.',
                stats: {
                    fireRate: 70,           // Cooldown in frames between casts
                    damage: 30,
                    projectileColor: '#ff3300',
                    projectileSpeed: 18,
                    spread: 0.15,
                    flashRadius: 60,
                    flashColor: '#ff6600',
                    projectileLife: 50,
                    range: 400
                }
            },
            'shadow_bolt': {
                name: 'Shadow Bolt',
                desc: 'A fast-moving bolt of dark energy.',
                stats: {
                    fireRate: 50,
                    damage: 20,
                    projectileColor: '#8a2be2',
                    projectileSpeed: 24,
                    spread: 0.1,
                    flashRadius: 40,
                    flashColor: '#9966ff',
                    projectileLife: 60,
                    range: 500
                }
            },
            'ember_burst': {
                name: 'Ember Burst',
                desc: 'A rapid volley of small fire projectiles.',
                stats: {
                    fireRate: 25,
                    damage: 12,
                    projectileColor: '#ff6600',
                    projectileSpeed: 22,
                    spread: 0.25,
                    flashRadius: 35,
                    flashColor: '#ffaa00',
                    projectileLife: 40,
                    range: 350
                }
            }
        };
        
        // ============================================================================
        //  CENTRALIZED COMBAT FUNCTIONS
        //  All humanoids — player, teammates, dancers, enemies — fire through these.
        //  Handles weapon stats, ability stats, spread, burst fire, and projectile creation.
        // ============================================================================
        
        /**
         * Create a combat projectile from a weapon in ITEM_REGISTRY.
         * @param {Object} source - The entity firing (must have x, y)
         * @param {number} angle - Firing angle in radians
         * @param {string} weaponId - ITEM_REGISTRY key
         * @param {Object} [opts] - { spreadMod, burstShot }
         * @returns {ProjectileEntity}
         */
        function fireWeaponProjectile(source, angle, weaponId, opts = {}) {
            const def = ITEM_REGISTRY[weaponId];
            const stats = def ? def.stats : {};
            const spreadMod = opts.spreadMod || 1.0;
            const spread = (Math.random() - 0.5) * (stats.spread || 0.12) * spreadMod;
            
            const origin = opts.origin || source;   // e.g. the muzzle from aimFromMuzzle
            return new ProjectileEntity({
                x: origin.x,
                y: origin.y,
                angle: angle + spread,
                isEnemy: opts.isEnemy || false,
                owner: source,
                color: stats.projectileColor || '#ffaa00',
                speed: stats.projectileSpeed || 25,
                damage: stats.damage || 20,
                life: stats.projectileLife || 60,
                penetrating: stats.penetrating || false
            });
        }
        
        /**
         * Create a combat projectile from an ability in ABILITY_REGISTRY.
         * @param {Object} source - The entity casting (must have x, y)
         * @param {number} angle - Casting angle in radians
         * @param {string} abilityId - ABILITY_REGISTRY key
         * @param {Object} [opts] - { isEnemy }
         * @returns {ProjectileEntity}
         */
        function castAbilityProjectile(source, angle, abilityId, opts = {}) {
            const def = ABILITY_REGISTRY[abilityId];
            if (!def) return null;
            const stats = def.stats;
            const spread = (Math.random() - 0.5) * (stats.spread || 0.1);
            
            return new ProjectileEntity({
                x: source.x,
                y: source.y,
                angle: angle + spread,
                isEnemy: opts.isEnemy || false,
                owner: source,
                color: stats.projectileColor || '#ff3300',
                speed: stats.projectileSpeed || 18,
                damage: stats.damage || 25,
                life: stats.projectileLife || 50,
                penetrating: false
            });
        }
        
        // Default loadout for new games
        const DEFAULT_LOADOUT = ['pistol_fpx', 'sniper_sara', 'rifle_rb98', 'pistol_anavia', 'sniper_sr86'];
        
        // Factory: create a live InventoryItem from registry ID
        function createItemFromRegistry(id, game) {
            const def = ITEM_REGISTRY[id];
            if (!def) { console.warn(`[ITEM_REGISTRY] Unknown item: ${id}`); return null; }
            
            let action = null;
            if (def.type === 'weapon') {
                const mode = def.weaponMode || 'normal';
                action = (item) => {
                    if (game) {
                        game.currentWeapon = item;
                        game.weaponMode = mode;
                        game._drawnAt = _gameTimeSec; game._drawShotUsed = false;   // Arms: Quick-Draw
                    }
                };
            }
            
            const item = new InventoryItem(id, def.name, def.type, def.icon, def.desc, action, def.stats);
            return item;
        }
        
        class InventorySystem {
            constructor(game) {
                this.game = game;
                this.items = [];
                this.capacity = 10;
                this.uiList = document.getElementById('inventory-list');
                this.menu = document.getElementById('freelancer-menu');
                
                // --- DUAL EQUIP SLOTS ---
                this.equippedWeaponId = null;     // Active weapon
                this.equippedAttachmentId = null;  // Active attachment (laser sight, etc.)
                
                // --- ITEM TYPE CONFIG ---
                // Defines behavior per item type: how it equips, what slot it uses, labels
                this.typeConfig = {
                    weapon:     { slot: 'weapon',     equipLabel: 'EQUIP',   unequipLabel: 'UNEQUIP', consumable: false },
                    attachment: { slot: 'attachment',  equipLabel: 'EQUIP',   unequipLabel: 'UNEQUIP', consumable: false },
                    consumable: { slot: null,          equipLabel: 'USE',     unequipLabel: null,      consumable: true },
                    collectible:{ slot: null,          equipLabel: 'INSPECT', unequipLabel: null,      consumable: false },
                    intel:      { slot: null,          equipLabel: 'READ',    unequipLabel: null,      consumable: false },
                };
        
                // Wire up UI buttons
                const xBtn = document.getElementById('inventory-close-x');
                if (xBtn) xBtn.onclick = () => this.toggleMenu();
                const backBtn = document.getElementById('close-menu');
                if (backBtn) backBtn.onclick = () => this.toggleMenu();
        
                // Default Loadout (from ITEM_REGISTRY)
                this.loadDefaultLoadout();
                
                // Auto-equip the first weapon found
            }
            
            // Load default new-game items from ITEM_REGISTRY
            loadDefaultLoadout() {
                for (const id of DEFAULT_LOADOUT) {
                    const item = createItemFromRegistry(id, this.game);
                    if (item) this.addItem(item);
                }
            }
            
            // Rebuild inventory from an array of item IDs (used by save/load)
            loadItemsFromIds(ids) {
                this.items = [];
                this.equippedWeaponId = null;
                this.equippedAttachmentId = null;
                for (const id of ids) {
                    const item = createItemFromRegistry(id, this.game);
                    if (item) this.items.push(item);
                    else console.warn(`[LOAD] Unknown item ID in save: ${id}`);
                }
            }
        
            equipItem(id) {
                const item = this.items.find(i => i.id === id);
                if (!item) return;
                const config = this.typeConfig[item.type];
                if (!config || !config.slot) return; // Not equippable
                
                if (config.slot === 'weapon') {
                    this.equippedWeaponId = id;
                    if (item.action) item.action(item);
                } else if (config.slot === 'attachment') {
                    this.equippedAttachmentId = id;
                    showMessage(`${item.name.toUpperCase()} EQUIPPED`);
                }
                this.render();
            }
        
            unequipSlot(slot) {
                if (slot === 'weapon') {
                    this.equippedWeaponId = null;
                    this.game.weaponMode = 'none';
                    showMessage("WEAPON HOLSTERED");
                } else if (slot === 'attachment') {
                    this.equippedAttachmentId = null;
                    showMessage("ATTACHMENT REMOVED");
                }
                this.render();
            }
            
            // Legacy compat — unequips whatever was passed or defaults to weapon
            unequip(itemId) {
                if (itemId) {
                    const item = this.items.find(i => i.id === itemId);
                    if (item) {
                        const config = this.typeConfig[item.type];
                        if (config?.slot) { this.unequipSlot(config.slot); return; }
                    }
                }
                this.unequipSlot('weapon');
            }
            
            isItemEquipped(id) {
                return this.equippedWeaponId === id || this.equippedAttachmentId === id;
            }
            
            
            getEquippedAttachment() {
                return this.equippedAttachmentId ? this.items.find(i => i.id === this.equippedAttachmentId) : null;
            }
        
            addItem(item) {
                if (this.items.length >= this.capacity) {
                    showMessage("INVENTORY FULL");
                    return false;
                }
                this.items.push(item);
                // If we have nothing equipped and picked up a weapon, maybe auto-equip?
                // For now, we'll just notify.
                showMessage(`OBTAINED: ${item.name.toUpperCase()}`);
                return true;
            }
        
            removeItem(id) {
                // If dropping equipped item, unequip first
                if (this.isItemEquipped(id)) {
                    this.unequip(id);
                }
                
                const idx = this.items.findIndex(i => i.id === id);
                if (idx > -1) {
                    this.items.splice(idx, 1);
                    this.render();
                }
            }
        
            toggleMenu() {
                if (!this.menu) return;
                const isHidden = this.menu.style.display === 'none';
                if (isHidden) {
                    this.menu.style.display = 'flex'; // Use flex to keep alignment
                    this.render();
                    this.game.pauseSystem.acquire('inventory_menu');
                    this.game.renderSidebarPortrait();
                    
                    // Reset to inventory view (hide augments/contacts screen if was showing)
                    document.getElementById('inventory-list-container').style.display = '';
                    document.getElementById('augments-screen').style.display = 'none';
                    document.getElementById('contacts-screen').style.display = 'none';
                    document.getElementById('story-screen').style.display = 'none';
                    document.getElementById('collection-screen').style.display = 'none';
                    document.getElementById('screen-title-text').textContent = 'Inventory';
                    
                    // Update nav highlight
                    if (typeof invSidebar !== 'undefined') {
                        invSidebar.setActiveNav('inventory');
                    }
                } else {
                    this.menu.style.display = 'none';
                    this.game.pauseSystem.release('inventory_menu');
                }
            }
        
            render() {
                if (!this.uiList) return;
                this.uiList.innerHTML = '';
                
                // Get filter state from sidebar
                let filteredItems = this.items;
                if (typeof invSidebar !== 'undefined' && invSidebar.filterEnabled && invSidebar.activeFilter) {
                    const filter = invSidebar.activeFilter;
                    if (filter !== 'all') {
                        // Map filter names to item types
                        // Filter is plural (weapons), item.type is singular (weapon)
                        const filterToType = {
                            'weapons': 'weapon',
                            'collectibles': 'collectible',
                            'pets': 'pet',
                            'mounts': 'mount',
                            'vehicles': 'vehicle',
                            'consumables': 'consumable'
                        };
                        const targetType = filterToType[filter] || filter;
                        filteredItems = this.items.filter(item => item.type === targetType);
                    }
                }
                
                if (filteredItems.length === 0) {
                    const message = this.items.length === 0 ? 'NO ITEMS CARRIED' : 'NO MATCHING ITEMS';
                    this.uiList.innerHTML = `<div style="color:#666; text-align:center; margin-top:50px;">${message}</div>`;
                    return;
                }
        
                filteredItems.forEach(item => {
                    const isEquipped = this.isItemEquipped(item.id);
                    const config = this.typeConfig[item.type] || {};
                    const el = document.createElement('div');
                    el.className = `ui-pill type-${item.type} ${isEquipped ? 'active-item' : ''}`;
                    el.dataset.id = item.id;
                    el.innerHTML = `
                        <div class="pill-icon">${item.icon}</div>
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="pill-name">${item.name}</span>
                                <span class="pill-equipped-tag">${isEquipped ? 'EQUIPPED' : ''}</span>
                            </div>
                            <div class="pill-desc">${item.description}</div>
                        </div>
                        <div class="control-node" style="${isEquipped ? 'background:#00f3ff; box-shadow:0 0 8px #00f3ff;' : ''}"></div>
                        <div class="node-menu">
                            <button class="node-btn use-btn">${isEquipped ? (config.unequipLabel || 'UNEQUIP') : (config.equipLabel || 'EQUIP')}</button>
                            <button class="node-btn drop-btn" style="color:#ff5555">DROP</button>
                        </div>
                    `;
                    // ... remaining logic

        
                    // Expand/Collapse Logic
                    el.addEventListener('click', (e) => {
                        if (e.target.tagName === 'BUTTON') return;
                        Array.from(this.uiList.children).forEach(child => {
                            if (child !== el) child.classList.remove('expanded');
                        });
                        el.classList.toggle('expanded');
                    });
        
                    const useBtn = el.querySelector('.use-btn');
                    const dropBtn = el.querySelector('.drop-btn');
        
                    // HANDLE "USE / EQUIP / UNEQUIP"
                    useBtn.onclick = () => {
                        const cfg = this.typeConfig[item.type] || {};
                        if (cfg.slot) {
                            // Equippable item (weapon or attachment)
                            if (isEquipped) {
                                this.unequipSlot(cfg.slot);
                            } else {
                                this.equipItem(item.id);
                            }
                        } else if (cfg.consumable) {
                            // Consumables — use and remove
                            if (item.action) item.action(item);
                            this.removeItem(item.id);
                        } else {
                            // Non-equippable, non-consumable (intel, collectibles)
                            if (item.action) item.action(item);
                        }
                        el.classList.remove('expanded');
                    };
        
                    // Inside InventorySystem class
                    
                    dropBtn.onclick = () => {
                        if (this.game.loot) {
                            // 1. Calculate a safe drop distance (e.g., 50px)
                            // We use a random angle so items don't pile up in one spot
                            const throwDist = 50; 
                            const throwAngle = Math.random() * Math.PI * 2;
                    
                            this.game.loot.push({
                                // Calculate X/Y based on angle and distance
                                x: this.game.player.x + Math.cos(throwAngle) * throwDist,
                                y: this.game.player.y + Math.sin(throwAngle) * throwDist,
                                
                                type: 'weapon_drop',
                                item: item,
                                angle: Math.random() * 6.28,
                                
                                // NEW: Add a timestamp for when this was dropped
                                dropTime: Date.now(), 
                    
                                // ... (Your existing draw function here) ...
                                draw: function(ctx) {
                                    // ... (Keep your draw logic from the previous step)
                                    ctx.save();
                                    ctx.translate(this.x, this.y);
                                    const bob = Math.sin(_frameTime / 500) * 3;
                                    
                                    // Ground glow: a violet pool squashed flat under it
                                    ctx.save(); ctx.translate(0, 10); ctx.scale(1, 0.36); ctx.globalAlpha = 0.75;
                                    drawGlow(ctx, 0, 0, 22, '#a469ff', 0.3);
                                    ctx.restore();

                                    drawWeapon(ctx, this.item.id, 0, bob, this.angle, 0.8);
                                    ctx.restore();
                                }
                            });
                        }
                        
                        // Play a "whoosh" or throw sound if you have one
                    
                        this.removeItem(item.id);
                        showMessage(`DROPPED: ${item.name}`);
                    };

        
                    this.uiList.appendChild(el);
                });
            }
        
        }
        
// Initialization in GameEngine:


        /* --- GAME ENGINE --- */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                      GAME ENGINE                                  ║
        // ╚══════════════════════════════════════════════════════════════════╝
        /* =====================================================================
           AUGMENT SYSTEM
           ---------------------------------------------------------------------
           Cybernetic augments purchasable at Dr. Yin's Clinic.
           Augments are equipped from the pause menu Augments screen.
           ===================================================================== */
        const AUGMENT_CATALOG = [
            { id: 'auto_aim', name: 'NEURAL LOCK', desc: 'Soft target-lock on nearest hostile. Projectiles steer toward enemies in your line of fire.', price: 350, slot: 'optic', icon: '◎' },
            { id: 'speed_boost', name: 'ADRENAL SURGE', desc: 'Vehicle top speed increased by 20%. Acceleration boosted by 15%.', price: 300, slot: 'spine', icon: '⚡' },
            { id: 'armor_plate', name: 'SUBDERMAL MESH', desc: 'Reduces all incoming damage by 20%.', price: 400, slot: 'torso', icon: '🛡' },
            { id: 'radar_ext', name: 'ECHO PULSE', desc: 'Enables tactical radar overlay. Detects hostiles and allies within 600px. Sweep-scan display.', price: 250, slot: 'cranial', icon: '◉' },
            { id: 'fast_reload', name: 'REFLEX SYNC', desc: 'Weapon cooldown reduced by 25%. Faster fire rate across all weapons.', price: 275, slot: 'arms', icon: '↻' },
            { id: 'flit_ext', name: 'PHASE WIRE', desc: 'FLIT cost reduced by 30%. Extended dash range.', price: 500, slot: 'legs', icon: '⟐' },
            { id: 'health_regen', name: 'NANITE WEAVE', desc: 'Slowly regenerates 1 HP every 5 seconds when out of combat.', price: 600, slot: 'torso', icon: '✦' },
            { id: 'scrap_magnet', name: 'SALVAGE NET', desc: 'Scrap pickup radius doubled. +10% bonus scrap from all sources.', price: 200, slot: 'arms', icon: '⊕' },
            { id: 'vital_link', name: 'VITAL LINK', desc: 'Stim capacity +2. Proximity healing aura for allies boosted by 75%.', price: 450, slot: 'spine', icon: '❤' },
        ];

        class AugmentSystem {
            constructor() {
                this.owned = [];     // Array of augment IDs
                this.equipped = [];  // Array of augment IDs (max 3 slots)
                this.maxSlots = 3;
            }

            buy(augmentId, game) {
                const aug = AUGMENT_CATALOG.find(a => a.id === augmentId);
                if (!aug) return false;
                if (this.owned.includes(augmentId)) { showMessage('ALREADY OWNED.'); return false; }
                if (game.currency < aug.price) { showMessage('INSUFFICIENT FUNDS.'); return false; }
                game.currency -= aug.price;
                this.owned.push(augmentId);
                game.updateUI();
                showMessage(`AUGMENT INSTALLED: ${aug.name}`);
                audioSys.sfx('ui');
                return true;
            }

            equip(augmentId) {
                if (!this.owned.includes(augmentId)) return false;
                if (this.equipped.includes(augmentId)) return false;
                if (this.equipped.length >= this.maxSlots) {
                    showMessage(`MAX ${this.maxSlots} AUGMENTS EQUIPPED. UNEQUIP ONE FIRST.`);
                    return false;
                }
                this.equipped.push(augmentId);
                showMessage(`AUGMENT EQUIPPED: ${AUGMENT_CATALOG.find(a => a.id === augmentId)?.name}`);
                audioSys.sfx('ui');
                return true;
            }

            unequip(augmentId) {
                const idx = this.equipped.indexOf(augmentId);
                if (idx === -1) return false;
                this.equipped.splice(idx, 1);
                showMessage(`AUGMENT REMOVED.`);
                audioSys.sfx('ui');
                return true;
            }

            isEquipped(id) { return this.equipped.includes(id); }
            isOwned(id) { return this.owned.includes(id); }


            serialize() { return { owned: [...this.owned], equipped: [...this.equipped] }; }
            deserialize(data) {
                if (data) {
                    this.owned = data.owned || [];
                    this.equipped = data.equipped || [];
                }
            }

        }

