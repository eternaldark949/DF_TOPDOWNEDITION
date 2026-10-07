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
                stats: { fireRate: 6, recoil: 4, damage: 12, projectileColor: '#00ffcc', projectileSpeed: 28, flashRadius: 40 }
            },
            'pistol_anavia': {
                name: 'Anavia', type: 'weapon', icon: '💠',
                desc: 'A specialized energy blaster that fires ethereal periwinkle bolts.',
                weaponMode: 'normal',
                stats: { fireRate: 4, recoil: 3, damage: 8, projectileColor: '#CCCCFF', projectileSpeed: 24, flashRadius: 45 }
            },
            'sniper_sr86': {
                name: 'SR-86', type: 'weapon', icon: '🎯',
                desc: 'Semi-automatic crimson death.',
                weaponMode: 'sniper',
                stats: { fireRate: 50, recoil: 15, damage: 65, projectileColor: '#DC143C', projectileSpeed: 40, flashRadius: 60, penetrating: true }
            },
            'maiden_kukri': {
                name: "Maiden's Kukri", type: 'weapon', icon: '🗡',
                desc: 'A curved golden knife, light as a promise. Cuts that keep bleeding.',
                weaponMode: 'melee',
                // a slash in an arc before her: damage, then bleeding (engine/status-effects.js); quiet, not silent
                stats: { fireRate: 16, damage: 28, reach: 38, arc: 1.5, bleedDps: 6, bleedSecs: 3, noise: 60, damageType: 'melee' }
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
                    damage: 50,             // one-shots a ganger (40 HP) without trivialising the gauntlet's gunners
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
        const DEFAULT_LOADOUT = ['pistol_fpx', 'sniper_sara', 'rifle_rb98', 'pistol_anavia', 'sniper_sr86', 'maiden_kukri'];
        
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
        
        // Views of existing ownership. These records never enter physical InventorySystem.items,
        // capacity calculations, save payloads, map entities or cosmetic acquisition methods.
        const INVENTORY_SPECIAL_COSMETICS = new Set(['outfit_academy', 'acc_umbrella']);
        const APARTMENT_FURNITURE_REGISTRY = Object.freeze([
            { id: 'apt_sofa', name: 'Sofa', quantity: 1, icon: '▰', description: 'Wine-red two-seat sofa with cushions and a knit throw.' },
            { id: 'apt_coffee', name: 'Coffee Table', quantity: 1, icon: '▭', description: 'Rounded walnut coffee table with books and flowers.' },
            { id: 'apt_chair', name: 'Armchair', quantity: 2, icon: '▣', description: 'Blush upholstered lounge and bedroom armchairs.' },
            { id: 'apt_side', name: 'Side Table', quantity: 3, icon: '▥', description: 'Walnut side tables with integrated lamps; two indoors and one on the veranda.' },
            { id: 'apt_bookshelf', name: 'Bookshelf', quantity: 1, icon: '▤', description: 'Walnut shelf stocked with books and ornaments.' },
            { id: 'apt_console', name: 'Console', quantity: 1, icon: '♫', description: 'Walnut media console with a turntable and stereo speakers.' },
            { id: 'apt_fireplace', name: 'Fireplace', quantity: 1, icon: '♨', description: 'Linear glass fireplace set into a stone surround.' },
            { id: 'apt_floor_lamp', name: 'Floor Lamp', quantity: 3, icon: '◉', description: 'Cream floor lamps with brass trim.' },
            { id: 'apt_plant', name: 'Plant', quantity: 6, icon: '♣', description: 'Potted foliage throughout the living room, bedroom and bathroom.' },
            { id: 'apt_craft', name: 'Crafting Table', quantity: 1, icon: '⚒', description: 'Walnut and steel workbench with tools, a vise and a schematic tablet.' },
            { id: 'apt_fridge', name: 'Refrigerator', quantity: 1, icon: '▣', description: 'Metal-finished refrigerator with brass trim.' },
            { id: 'apt_sink', name: 'Kitchen Sink', quantity: 1, icon: '◡', description: 'Kitchen sink set into cream quartz with a brass tap.' },
            { id: 'apt_counter', name: 'Kitchen Counter', quantity: 3, icon: '▬', description: 'Cream quartz countertop sections with walnut front edges.' },
            { id: 'apt_gas_range', name: 'Gas Range', quantity: 1, icon: '♨', description: 'Five-burner black steel gas range with brass knobs.' },
            { id: 'apt_induction', name: 'Induction Cooktop', quantity: 1, icon: '⊚', description: 'Four-zone black glass induction cooktop.' },
            { id: 'apt_island', name: 'Kitchen Island', quantity: 1, icon: '▰', description: 'Quartz bar island with waterfall ends and integrated pendant shades.' },
            { id: 'apt_stool', name: 'Stool', quantity: 4, icon: '●', description: 'Wine-red stools with brass frames along the kitchen island.' },
            { id: 'apt_bed', name: 'Bed', quantity: 1, icon: '▰', description: 'Queen bed with a blush headboard, wine-red duvet and knit throw.' },
            { id: 'apt_nightstand', name: 'Nightstand', quantity: 2, icon: '▥', description: 'Walnut bedside cabinets with brass pulls and integrated lamps.' },
            { id: 'apt_wardrobe', name: 'Wardrobe', quantity: 1, icon: '▥', description: 'Tall walnut wardrobe with brass handles.' },
            { id: 'apt_vanity', name: 'Dressing Vanity', quantity: 1, icon: '◯', description: 'Walnut dressing table with a brass-framed round mirror and a stool.' },
            { id: 'apt_tub', name: 'Bathtub', quantity: 1, icon: '◡', description: 'Freestanding oval bathtub with brass fittings.' },
            { id: 'apt_bath_vanity', name: 'Bathroom Vanity', quantity: 1, icon: '▭', description: 'Double marble vanity with brass taps and a mirror.' },
            { id: 'apt_shower', name: 'Shower', quantity: 1, icon: '▣', description: 'Walk-in tiled shower with glass screening and a brass rain head.' },
            { id: 'apt_towels', name: 'Towel Rack', quantity: 1, icon: '║', description: 'Walnut towel stand with blush and cream towels.' },
            { id: 'apt_lounger', name: 'Lounger', quantity: 2, icon: '▰', description: 'Walnut-framed veranda loungers with cream cushions.' },
            { id: 'apt_bistro', name: 'Bistro Set', quantity: 1, icon: '◉', description: 'Veranda bistro table and its two chairs, treated as one set.' },
            { id: 'apt_telescope', name: 'Telescope', quantity: 1, icon: '⌕', description: 'Brass telescope on a tripod overlooking the city.' },
            { id: 'apt_planter', name: 'Planter', quantity: 3, icon: '♣', description: 'Rectangular planted troughs along the veranda railing.' }
        ].map(entry => Object.freeze(entry)));

        function getOwnedInventoryEntries(game) {
            const result = [], cosmetics = game?.cosmetics;
            const registry = typeof COSMETICS_REGISTRY !== 'undefined' ? COSMETICS_REGISTRY : {};
            const icons = { wig: '≋', skin: '◉', vocal: '♪', outfit: '✦', accessory: '◇', hat: '⌂', jewelry: '◆' };
            const labels = { wig: 'Wig', skin: 'Skin', vocal: 'Voice', outfit: 'Outfit', accessory: 'Accessory', hat: 'Hat', jewelry: 'Jewelry' };
            const seen = new Set();
            for (const sourceId of Array.isArray(cosmetics?.owned) ? cosmetics.owned : []) {
                const entry = registry[sourceId];
                if (!entry || seen.has(sourceId)) continue;
                seen.add(sourceId);
                const collectible = INVENTORY_SPECIAL_COSMETICS.has(sourceId);
                const isEquipped = typeof cosmetics.isEquipped === 'function' ? !!cosmetics.isEquipped(sourceId) :
                    entry.category === 'jewelry' ? !!cosmetics.equippedJewelry?.includes(sourceId) :
                    cosmetics[{ wig: 'equippedWig', skin: 'equippedSkin', vocal: 'equippedVocal', outfit: 'equippedOutfit',
                        accessory: 'equippedAccessory', hat: 'equippedHat' }[entry.category]] === sourceId;
                result.push({
                    id: 'cosmetic:' + sourceId, source: 'cosmetic', sourceId,
                    category: collectible ? 'collectibles' : 'items', type: collectible ? 'collectible' : 'cosmetic',
                    name: entry.name, description: entry.desc || '',
                    icon: sourceId === 'acc_umbrella' ? '☂' : icons[entry.category] || '◇',
                    detail: (labels[entry.category] || 'Cosmetic') + (isEquipped ? ' · Equipped' : ' · Owned'),
                    isEquipped, registryLabel: isEquipped ? 'EQUIPPED' : 'OWNED'
                });
            }
            // Furniture is hers once she's been home (Apartment 949 loaded once: questState.aptVisited);
            // counts come from the apartment as built, the registry's numbers until it has been
            const aptProps = game?.questState?.aptVisited && typeof maps !== 'undefined' && maps.apt_949 && maps.apt_949.props;
            const placed = new Map();
            if (aptProps && aptProps.length) for (const p of aptProps) if (p && p.decorType) placed.set(p.decorType, (placed.get(p.decorType) || 0) + 1);
            if (game?.questState?.aptVisited) for (const base of APARTMENT_FURNITURE_REGISTRY) {
                const n = placed.size ? (placed.get(base.id) || 0) : base.quantity;
                if (!n) continue;
                const entry = n === base.quantity ? base : { ...base, quantity: n };
                result.push({
                    id: 'furniture:' + entry.id, source: 'furniture', sourceId: entry.id,
                    category: 'items', type: 'furniture', name: entry.name, description: entry.description,
                    icon: entry.icon, detail: entry.quantity > 1 ? 'Apartment 949 · ' + entry.quantity + ' placed' : 'Apartment 949 · Placed',
                    quantity: entry.quantity, registryLabel: 'PLACED'
                });
            }
            if (game?.questState?.hasVelvetCat) {
                result.push({ id: 'pet:velvet_cat', source: 'pet', sourceId: 'velvet_cat', category: 'pets', type: 'pet',
                    name: 'Velvet Cat', description: 'Velvet, your velvet-furred feline companion. Follows you and rides in vehicles.',
                    icon: '🐾', detail: 'Feline companion', registryLabel: 'OWNED' });
            }
            const garage = game?.garage;
            for (const [index, car] of (Array.isArray(garage?.cars) ? garage.cars : []).entries()) {
                if (!car) continue;
                const sourceId = String(car.id ?? ('garage_' + index));
                const name = typeof garage.getDisplayName === 'function' ? garage.getDisplayName(index) :
                    [car.brand, car.model].filter(Boolean).join(' ') || 'Owned Vehicle';
                result.push({
                    id: 'mount:' + sourceId + ':' + index, source: 'garage', sourceId,
                    category: 'mounts', type: 'mount', name,
                    description: 'An owned garage vehicle. Manage it through Car.ME or Torque Auto.',
                    icon: '▰', detail: (index === garage.activeIndex ? 'Active vehicle' : 'In garage') + (car.isDefault ? ' · Default' : ''),
                    registryLabel: index === garage.activeIndex ? 'ACTIVE' : 'OWNED', color: car.paintColor || null
                });
            }
            return result;
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
        
            // Open the menu on the inventory, or close it (Screens keeps every sub-screen in step)
            toggleMenu() {
                if (Screens.menuOpen()) Screens.close();
                else Screens.open('inventory');
            }
        
            // The carried inventory remains the save/capacity source. Ownership
            // registries are views over cosmetics, the apartment, pets and garage.
            getEntries() {
                const categoryOf = type => ({
                    weapon: 'weapons', attachment: 'weapons',
                    collectible: 'collectibles', intel: 'collectibles',
                    pet: 'pets', mount: 'mounts', vehicle: 'mounts'
                }[type] || 'items');
                const carried = this.items.map(item => ({
                    id: item.id, source: 'carried', sourceId: item.id,
                    category: categoryOf(item.type), type: item.type,
                    name: item.name, description: item.description, icon: item.icon,
                    detail: item.type === 'attachment' ? 'Weapon attachment' : '',
                    isEquipped: this.isItemEquipped(item.id), item
                }));
                return carried.concat(getOwnedInventoryEntries(this.game));
            }

            _cosmeticAction(entry) {
                const cosmetics = this.game.cosmetics;
                const definition = COSMETICS_REGISTRY[entry.sourceId];
                if (!cosmetics || !definition || !cosmetics.isOwned(entry.sourceId)) return;
                if (cosmetics.isEquipped(entry.sourceId)) {
                    if (definition.category === 'accessory') cosmetics.unequipAccessory();
                    else if (definition.category === 'hat') cosmetics.unequipHat();
                    else if (definition.category === 'jewelry') cosmetics.unequipJewelry(entry.sourceId);
                    else return;
                } else cosmetics.equip(entry.sourceId);
                audioSys.sfx('ui');
                this.game.renderSidebarPortrait();
                this.render();
            }

            _dropCarriedItem(item) {
                // Registry entries never reach the existing physical drop path.
                if (!this.items.includes(item)) return;
                if (this.game.loot) {
                    const throwAngle = Math.random() * Math.PI * 2;
                    this.game.loot.push({
                        x: this.game.player.x + Math.cos(throwAngle) * 50,
                        y: this.game.player.y + Math.sin(throwAngle) * 50,
                        type: 'weapon_drop', item,
                        angle: Math.random() * 6.28, dropTime: Date.now(),
                        draw: function(ctx) {
                            ctx.save();
                            ctx.translate(this.x, this.y);
                            const bob = Math.sin(_frameTime / 500) * 3;
                            ctx.save(); ctx.translate(0, 10); ctx.scale(1, 0.36); ctx.globalAlpha = 0.75;
                            drawGlow(ctx, 0, 0, 22, '#a469ff', 0.3);
                            ctx.restore();
                            drawWeapon(ctx, this.item.id, 0, bob, this.angle, 0.8);
                            ctx.restore();
                        }
                    });
                }
                this.removeItem(item.id);
                showMessage(`DROPPED: ${item.name}`);
            }

            _renderEntry(entry) {
                const el = document.createElement('div');
                el.className = `ui-pill type-${entry.type}${entry.isEquipped ? ' active-item' : ''}`;
                el.dataset.id = entry.id;
                el.dataset.source = entry.source;
                el.dataset.category = entry.category;

                const icon = document.createElement('div');
                icon.className = 'pill-icon';
                // Existing carried icons are registry-authored SVG/markup; owned
                // registry labels and descriptions are inserted as plain text.
                if (entry.source === 'carried') icon.innerHTML = entry.icon || '';
                else icon.textContent = entry.icon || '◇';
                if (entry.color) icon.style.borderColor = entry.color;
                el.appendChild(icon);

                const body = document.createElement('div');
                body.className = 'inventory-entry-body';
                const head = document.createElement('div');
                head.className = 'inventory-entry-head';
                const name = document.createElement('span');
                name.className = 'pill-name'; name.textContent = entry.name;
                head.appendChild(name);
                const tag = document.createElement('span');
                tag.className = entry.isEquipped ? 'pill-equipped-tag' : 'inventory-registry-tag';
                tag.textContent = entry.isEquipped ? 'EQUIPPED' : (entry.registryLabel || '');
                if (tag.textContent) head.appendChild(tag);
                body.appendChild(head);
                const desc = document.createElement('div');
                desc.className = 'pill-desc'; desc.textContent = entry.description || '';
                body.appendChild(desc);
                if (entry.detail) {
                    const detail = document.createElement('div');
                    detail.className = 'inventory-entry-detail'; detail.textContent = entry.detail;
                    body.appendChild(detail);
                }
                el.appendChild(body);

                const actions = [];
                if (entry.source === 'carried') {
                    const config = this.typeConfig[entry.type] || {};
                    if (config.slot || config.consumable || entry.item.action) {
                        actions.push({ className: 'use-btn', label: entry.isEquipped ? config.unequipLabel : (config.equipLabel || 'USE'), run: () => {
                            // Read current state at the time of the action.
                            if (!this.items.includes(entry.item)) return;
                            if (config.slot) {
                                if (this.isItemEquipped(entry.id)) this.unequipSlot(config.slot);
                                else this.equipItem(entry.id);
                            } else if (config.consumable) {
                                if (entry.item.action) entry.item.action(entry.item);
                                this.removeItem(entry.id);
                            } else if (entry.item.action) entry.item.action(entry.item);
                        }});
                    }
                    actions.push({ className: 'drop-btn', label: 'DROP', run: () => this._dropCarriedItem(entry.item) });
                } else if (entry.source === 'cosmetic') {
                    const definition = COSMETICS_REGISTRY[entry.sourceId];
                    const optional = ['accessory', 'hat', 'jewelry'].includes(definition?.category);
                    if (!entry.isEquipped || optional) actions.push({
                        className: 'use-btn', label: entry.isEquipped ? 'REMOVE' : 'EQUIP',
                        run: () => this._cosmeticAction(entry)
                    });
                }

                if (actions.length) {
                    const control = document.createElement('button');
                    control.type = 'button'; control.className = 'control-node';
                    control.setAttribute('aria-label', `Actions for ${entry.name}`);
                    control.setAttribute('aria-expanded', 'false');
                    el.appendChild(control);
                    const menu = document.createElement('div');
                    menu.className = 'node-menu';
                    const close = () => {
                        el.classList.remove('expanded');
                        control.setAttribute('aria-expanded', 'false');
                        menu.querySelectorAll('button').forEach(button => button.tabIndex = -1);
                    };
                    const toggle = () => {
                        this.uiList.querySelectorAll('.ui-pill.expanded').forEach(other => {
                            if (other === el) return;
                            other.classList.remove('expanded');
                            other.querySelector('.control-node')?.setAttribute('aria-expanded', 'false');
                            other.querySelectorAll('.node-menu button').forEach(button => button.tabIndex = -1);
                        });
                        const expanded = el.classList.toggle('expanded');
                        control.setAttribute('aria-expanded', String(expanded));
                        menu.querySelectorAll('button').forEach(button => button.tabIndex = expanded ? 0 : -1);
                    };
                    actions.forEach(action => {
                        const button = document.createElement('button');
                        button.type = 'button'; button.className = `node-btn ${action.className}`;
                        button.textContent = action.label; button.tabIndex = -1;
                        button.addEventListener('click', event => { event.stopPropagation(); action.run(); close(); });
                        menu.appendChild(button);
                    });
                    el.appendChild(menu);
                    control.addEventListener('click', event => { event.stopPropagation(); toggle(); });
                    el.addEventListener('click', event => { if (!event.target.closest('button')) toggle(); });
                    el.addEventListener('keydown', event => {
                        if (event.key === 'Escape' && el.classList.contains('expanded')) {
                            event.stopPropagation(); close(); control.focus();
                        }
                    });
                } else el.classList.add('inventory-registry-readonly');
                return el;
            }

            render() {
                if (!this.uiList) return;
                this.uiList.replaceChildren();
                const equippedOnly = Screens.current === 'equipped';
                const filter = typeof invSidebar !== 'undefined' && invSidebar.filterEnabled ? invSidebar.activeFilter : null;
                let entries = this.getEntries();
                if (equippedOnly) entries = entries.filter(entry => entry.isEquipped);
                if (filter && filter !== 'all' && !equippedOnly) entries = entries.filter(entry => entry.category === filter);   // Equipped lists everything worn and held
                const labels = { items: 'Items', collectibles: 'Collectibles', weapons: 'Weapons', pets: 'Pets', mounts: 'Mounts' };
                if (!entries.length) {
                    const empty = document.createElement('div');
                    empty.className = 'inventory-empty';
                    empty.textContent = equippedOnly ? 'NOTHING EQUIPPED IN THIS CATEGORY' : `NO OWNED ${(labels[filter] || 'ITEMS').toUpperCase()}`;
                    this.uiList.appendChild(empty);
                    return;
                }
                // With filtering off, each category still has its own heading.
                for (const [category, label] of Object.entries(labels)) {
                    const group = entries.filter(entry => entry.category === category);
                    if (!group.length) continue;
                    const heading = document.createElement('h2');
                    heading.className = 'inventory-section-title';
                    heading.textContent = `${label} · ${group.length}`;
                    this.uiList.appendChild(heading);
                    group.forEach(entry => this.uiList.appendChild(this._renderEntry(entry)));
                }
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

