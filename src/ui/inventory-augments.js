        /* =====================================================================
           INVENTORY SYSTEM
           ---------------------------------------------------------------------
           Manages complex items beyond simple counters.
           Connects to the #freelancer-menu UI.
           ===================================================================== */
        /* =====================================================================
           ITEM REGISTRY — Single source of truth for all item definitions.
           Items are definitions; itemSystem owns uniquely identified instances.
           Saves preserve instance records and equipment references.
           ===================================================================== */
        const ITEM_REGISTRY = GAME_DB.items.gear;   // directory/game-db/items.json
        
        // ============================================================================
        //  ABILITY REGISTRY — Data-driven abilities (magic, fireballs, etc.)
        //  Same stat pattern as ITEM_REGISTRY weapons but for innate/learned abilities.
        //  Any humanoid can use these via ActorEntity.castAbility().
        // ============================================================================
        const ABILITY_REGISTRY = GAME_DB.progression.abilities;   // directory/game-db/progression.json
        
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
                x: (opts.origin || source).x,
                y: (opts.origin || source).y,
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
        const DEFAULT_LOADOUT = GAME_DB.items.default_loadout;   // directory/game-db/items.json
        
        // Views of existing ownership. These records never enter the carried item model,
        // capacity calculations, save payloads, map entities or cosmetic acquisition methods.
        const INVENTORY_SPECIAL_COSMETICS = new Set(['outfit_academy', 'acc_umbrella']);
        const APARTMENT_FURNITURE_REGISTRY = Object.freeze(GAME_DB.items.furniture.map(entry => Object.freeze(entry)));   // directory/game-db/items.json

        function getOwnedInventoryEntries(game) {
            const result = [], cosmetics = game?.cosmetics;
            const registry = typeof COSMETICS_REGISTRY !== 'undefined' ? COSMETICS_REGISTRY : {};
            const icons = { wig: '≋', skin: '◉', vocal: '♪', outfit: '✦', accessory: '◇', hat: '⌂', jewelry: '◆', legwear: '♢' };
            const labels = { wig: 'Wig', skin: 'Skin', vocal: 'Voice', outfit: 'Outfit', accessory: 'Accessory', hat: 'Hat', jewelry: 'Jewelry', legwear: 'Legwear' };
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

        class InventoryView {
            constructor(game) {
                this.game = game;
                this.uiList = document.getElementById('inventory-list');
                this.menu = document.getElementById('freelancer-menu');
                
                this.entryOrder = [];             // pill order the player dragged, as 'source:id' keys (saved)
                
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
        
            }

            equipItem(instance_id) {
                const item=this.game.items.getItem(instance_id);
                if(!this.game.items.equipItem(instance_id)){showMessage('ATTACHMENT SLOTS FULL OR INCOMPATIBLE');return false;}
                showMessage(`${item.name.toUpperCase()} EQUIPPED`);this.render();return true;
            }
            unequipSlot(slot,instance_id=null) {
                if(instance_id)this.game.items.unequipItem(instance_id);else this.game.items.unequipSlot(slot);
                showMessage(slot==='weapon'?'WEAPON HOLSTERED':'ATTACHMENT REMOVED');this.render();
            }
            receiveItem(packet) {
                const item=packet.root_instance_id?this.game.items.receiveBundle(packet):this.game.items.receiveItem(packet);
                if(!item){showMessage('INVENTORY FULL');return false;}
                showMessage(`OBTAINED: ${item.name.toUpperCase()}`);this.render();return true;
            }
            useItem(instance_id) {
                const item=this.game.items.getItem(instance_id),effect=item.effect;
                if(effect?.kind==='buff'){
                    if(!this.game.player.buffSystem.activate(effect.buff_id,this.game.worldMinutes,this.game,{charge:false}))return false;
                    this.game.items.consumeItem(instance_id);this.render();return true;
                }
                if(effect?.kind==='note'){this.game.openNote(effect.note_id);return true;}
                return false;
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
                const carried = this.game.items.listItems().map(item => ({
                    id:item.instance_id,source:'carried',sourceId:item.definition_id,
                    category: categoryOf(item.type), type: item.type,
                    name: item.name, description: item.description, icon: item.icon,
                    detail:item.type==='attachment'?(this.game.items.getParentWeapon(item.instance_id)?'Mounted on '+this.game.items.getParentWeapon(item.instance_id).name:'Weapon attachment'):'',
                    isEquipped:this.game.items.isEquipped(item.instance_id),item
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
                    else if (definition.category === 'jewelry' || definition.category === 'legwear') cosmetics.unequipWorn(entry.sourceId);
                    else return;
                } else cosmetics.equip(entry.sourceId);
                audioSys.sfx('ui');
                this.game.renderSidebarPortrait();
                this.render();
            }

            _dropCarriedItem(item) {
                // Registry entries never reach the existing physical drop path.
                if(!this.game.running||!this.game.loot||!this.game.items.hasInstance(item.instance_id))return;
                const parent=this.game.items.getParentWeapon(item.instance_id);if(parent)this.game.items.detachFromWeapon(parent.instance_id,item.instance_id);
                const packet=this.game.items.extractItem(item.instance_id);
                if (this.game.loot) {
                    const throwAngle = Math.random() * Math.PI * 2;
                    this.game.loot.push({
                        x: this.game.playerPosition[0] + Math.cos(throwAngle) * 50,
                        y: this.game.playerPosition[1] + Math.sin(throwAngle) * 50,
                        type:'weapon_drop',item:packet,
                        angle: Math.random() * 6.28, dropTime: Date.now(),
                        draw: function(ctx) {
                            ctx.save();
                            ctx.translate(this.x, this.y);
                            const bob = Math.sin(_frameTime / 500) * 3;
                            ctx.save(); ctx.translate(0, 10); ctx.scale(1, 0.36); ctx.globalAlpha = 0.75;
                            drawGlow(ctx, 0, 0, 22, '#a469ff', 0.3);
                            ctx.restore();
                            drawWeapon(ctx, this.item.root_instance_id?this.item.records[0].definition_id:this.item.definition_id, 0, bob, this.angle, 0.8);
                            ctx.restore();
                        }
                    });
                }
                this.render();
                showMessage(`DROPPED: ${item.name}`);
            }

            _renderEntry(entry) {
                const el = uiKit.make(['div', `ui-pill type-${entry.type}${entry.isEquipped ? ' active-item' : ''}`]);
                el.dataset.id = entry.id;
                el.dataset.source = entry.source;
                el.dataset.category = entry.category;

                const icon = uiKit.make(['div', 'pill-icon']);
                // Existing carried icons are registry-authored SVG/markup; owned
                // registry labels and descriptions are inserted as plain text.
                if (entry.source === 'carried') icon.innerHTML = entry.icon || '';
                else icon.textContent = entry.icon || '◇';
                if (entry.color) icon.style.borderColor = entry.color;
                el.appendChild(icon);

                const body = uiKit.make(['div', 'inventory-entry-body']);
                const head = uiKit.make(['div', 'inventory-entry-head']);
                const name = uiKit.make(['span', 'pill-name', entry.name], head);
                const tag = uiKit.make(['span', entry.isEquipped ? 'pill-equipped-tag' : 'inventory-registry-tag', entry.isEquipped ? 'EQUIPPED' : (entry.registryLabel || '')]);
                if (tag.textContent) head.appendChild(tag);
                body.appendChild(head);
                const desc = uiKit.make(['div', 'pill-desc', entry.description || ''], body);
                if (entry.detail) {
                    const detail = uiKit.make(['div', 'inventory-entry-detail', entry.detail], body);
                }
                el.appendChild(body);

                const qty = uiKit.make(['div', 'pill-qty']);
                const qtyLabel = uiKit.make(['span', 'pill-qty-label', 'QTY']);
                const qtyValue = uiKit.make(['span', 'pill-qty-value', String(entry.quantity ?? entry.item?.quantity ?? 1)]);
                qty.append(qtyLabel, qtyValue);
                el.appendChild(qty);

                // Each action is an icon the control node slides out: kind picks the icon (#icon-node-*)
                const actions = [];
                if (entry.source === 'carried') {
                    const config = this.typeConfig[entry.type] || {};
                    if (config.slot || config.consumable || entry.item.effect?.kind==='note') {
                        const kind = config.slot ? 'equip' : config.consumable ? 'consume' : 'inspect';
                        const label = config.slot ? (entry.isEquipped ? config.unequipLabel : config.equipLabel)
                            : config.consumable ? 'CONSUME' : (config.equipLabel || 'USE');
                        actions.push({ kind, label, run: () => {
                            // Read current state at the time of the action.
                            if(!this.game.items.hasInstance(entry.item.instance_id))return;
                            if (config.slot) {
                                if (this.game.items.isEquipped(entry.id)) this.unequipSlot(config.slot, entry.id);
                                else this.equipItem(entry.id);
                            } else this.useItem(entry.item.instance_id);
                        }});
                    }
                    actions.push({ kind: 'drop', label: 'DROP', run: () => this._dropCarriedItem(entry.item) });
                } else if (entry.source === 'cosmetic') {
                    const definition = COSMETICS_REGISTRY[entry.sourceId];
                    const optional = ['accessory', 'hat', 'jewelry', 'legwear'].includes(definition?.category);
                    if (!entry.isEquipped || optional) actions.push({
                        kind: 'equip', label: entry.isEquipped ? 'REMOVE' : 'EQUIP',
                        run: () => this._cosmeticAction(entry)
                    });
                }

                if (actions.length) this._attachControlNode(el, entry, actions);
                else el.classList.add('inventory-registry-readonly');
                return el;
            }

            /* The control node: the gold diamond at a pill's end. A tap slides its action icons out
               to the left (the pill's contents dim and a gold glow gathers behind the node); a drag
               moves the pill up or down its section, and the new order is kept (entryOrder, saved). */
            _attachControlNode(el, entry, actions) {
                const control = uiKit.make(['button']);
                control.type = 'button'; control.className = 'control-node';
                control.setAttribute('aria-label', `Actions for ${entry.name}; drag to reorder`);
                control.setAttribute('aria-expanded', 'false');
                el.appendChild(control);
                const menu = uiKit.make(['div', 'node-menu']);
                menu.style.setProperty('--n', actions.length);
                const caption = uiKit.make(['span', 'node-caption'], menu);
                const showCaption = text => { caption.textContent = text; };
                const buttons = actions.map((action, i) => {
                    const button = uiKit.make(['button']);
                    button.type = 'button'; button.className = `node-btn node-btn-${action.kind}`;
                    button.style.setProperty('--i', i);
                    button.setAttribute('aria-label', action.label); button.title = action.label; button.tabIndex = -1;
                    button.innerHTML = `<svg aria-hidden="true"><use href="#icon-node-${action.kind}"/></svg>`;
                    button.addEventListener('click', event => { event.stopPropagation(); action.run(); close(); });
                    button.addEventListener('pointerenter', () => showCaption(action.label));
                    button.addEventListener('focus', () => showCaption(action.label));
                    menu.appendChild(button);
                    return button;
                });
                menu.addEventListener('pointerleave', () => showCaption(actions[0].label));
                showCaption(actions[0].label);
                el.appendChild(menu);

                const setOpen = open => {
                    el.classList.toggle('expanded', open);
                    control.setAttribute('aria-expanded', String(open));
                    buttons.forEach(button => button.tabIndex = open ? 0 : -1);
                    if (open) showCaption(actions[0].label);
                };
                const close = () => setOpen(false);
                const toggle = () => {
                    this.uiList.querySelectorAll('.ui-pill.expanded').forEach(other => {
                        if (other === el) return;
                        other.classList.remove('expanded');
                        other.querySelector('.control-node')?.setAttribute('aria-expanded', 'false');
                        other.querySelectorAll('.node-menu button').forEach(button => button.tabIndex = -1);
                    });
                    setOpen(!el.classList.contains('expanded'));
                };

                // A press that moves past a few pixels becomes a drag; otherwise it's a tap.
                let drag = null, swallowClick = false;
                control.addEventListener('pointerdown', event => {
                    if (event.button !== 0) return;
                    drag = { id: event.pointerId, y: event.clientY, moved: false };
                    control.setPointerCapture?.(event.pointerId);
                });
                control.addEventListener('pointermove', event => {
                    if (!drag || event.pointerId !== drag.id) return;
                    const dy = event.clientY - drag.y;
                    if (!drag.moved && Math.abs(dy) < 6) return;
                    if (!drag.moved) { drag.moved = true; close(); el.classList.add('dragging'); }
                    el.style.transform = `translateY(${dy}px)`;
                    // Swap with a neighbour once the pill passes its middle. Measured by layout (offsetTop), not by
                    // what's on screen: a neighbour still sliding to its new spot mustn't swap straight back.
                    const mid = el.offsetTop + dy + el.offsetHeight / 2;
                    const prev = el.previousElementSibling, next = el.nextElementSibling;
                    if (prev?.classList.contains('ui-pill') && mid < prev.offsetTop + prev.offsetHeight / 2) {
                        this._slidePills(() => el.parentNode.insertBefore(el, prev), el);
                        drag.y -= prev.offsetHeight + parseFloat(getComputedStyle(prev).marginBottom);
                        el.style.transform = `translateY(${event.clientY - drag.y}px)`;
                    } else if (next?.classList.contains('ui-pill') && mid > next.offsetTop + next.offsetHeight / 2) {
                        this._slidePills(() => el.parentNode.insertBefore(next, el), el);
                        drag.y += next.offsetHeight + parseFloat(getComputedStyle(next).marginBottom);
                        el.style.transform = `translateY(${event.clientY - drag.y}px)`;
                    }
                });
                const endDrag = event => {
                    if (!drag || event.pointerId !== drag.id) return;
                    const moved = drag.moved; drag = null;
                    if (!moved) return;
                    swallowClick = true;
                    // let go: the pill settles into its slot rather than jumping there
                    const from = el.style.transform;
                    el.classList.remove('dragging'); el.style.transform = '';
                    if (from && el.animate && !this._still()) el.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
                    this._keepOrder(el);
                };
                control.addEventListener('pointerup', endDrag);
                control.addEventListener('pointercancel', endDrag);
                control.addEventListener('click', event => {
                    event.stopPropagation();
                    if (swallowClick) { swallowClick = false; return; }
                    toggle();
                });
                el.addEventListener('click', event => { if (!event.target.closest('button')) toggle(); });
                el.addEventListener('keydown', event => {
                    if (event.key === 'Escape' && el.classList.contains('expanded')) {
                        event.stopPropagation(); close(); control.focus();
                    }
                    // Alt+Up / Alt+Down on the node moves the pill, for keyboards and controllers
                    if (event.target === control && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                        event.preventDefault();
                        const sibling = event.key === 'ArrowUp' ? el.previousElementSibling : el.nextElementSibling;
                        if (!sibling?.classList.contains('ui-pill')) return;
                        this._slidePills(() => { if (event.key === 'ArrowUp') el.parentNode.insertBefore(el, sibling); else el.parentNode.insertBefore(sibling, el); });
                        this._keepOrder(el); control.focus();
                    }
                });
            }

            // Record the order of the pill's section as the DOM now shows it
            _keepOrder(el) {
                const section = [];
                let first = el; while (first.previousElementSibling?.classList.contains('ui-pill')) first = first.previousElementSibling;
                for (let n = first; n?.classList.contains('ui-pill'); n = n.nextElementSibling) section.push(`${n.dataset.source}:${n.dataset.id}`);
                const rest = this.entryOrder.filter(key => !section.includes(key));
                // The section's keys take the place of the earliest of them, so other sections keep theirs
                const at = Math.min(...section.map(key => this.entryOrder.indexOf(key)).filter(i => i >= 0), rest.length);
                this.entryOrder = [...rest.slice(0, at), ...section, ...rest.slice(at)];
            }

            _ordered(entries) {
                if (!this.entryOrder.length) return entries;
                const rank = new Map(this.entryOrder.map((key, i) => [key, i]));
                return entries.map((entry, i) => ({ entry, i, r: rank.get(`${entry.source}:${entry.id}`) }))
                    .sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity) || a.i - b.i).map(x => x.entry);
            }

            /** No sliding for players who've asked the system for less motion */
            _still() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }

            /**
             * Make a change to the list, then slide every pill (and heading) from where it was to where it is now,
             * rather than letting it jump: measure, change, then play each one's offset back to nothing (FLIP).
             * Pills are matched by source and id, so this works across a full re-render too. New pills fade in.
             * `skip`: a pill to leave alone (the one being dragged follows the pointer).
             */
            _slidePills(change, skip = null) {
                const list = this.uiList;
                if (!list || this._still() || typeof Element === 'undefined' || !Element.prototype.animate) { change(); return; }
                const keyOf = n => n.classList.contains('ui-pill') ? `p|${n.dataset.source}:${n.dataset.id}` : `h|${n.dataset.category}`;
                const sel = '.ui-pill, .inventory-section-title';
                const before = new Map();
                list.querySelectorAll(sel).forEach(n => {
                    const r = n.getBoundingClientRect();          // where it's drawn now, mid-slide included
                    if (r.width) before.set(keyOf(n), r);
                });
                change();
                if (!before.size) return;                         // first fill (or the list was hidden): nothing to slide from
                list.querySelectorAll(sel).forEach(n => {
                    if (n === skip) return;
                    n.getAnimations().forEach(a => { if (a.id === 'pill-slide' || a.id === 'pill-in') a.cancel(); });
                    const r = n.getBoundingClientRect();
                    if (!r.width) return;
                    const was = before.get(keyOf(n));
                    let anim;
                    if (!was) anim = n.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
                    else {
                        const dx = was.left - r.left, dy = was.top - r.top;
                        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
                        anim = n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
                    }
                    anim.id = was ? 'pill-slide' : 'pill-in';
                });
            }

            render() { this._slidePills(() => this._renderList()); }

            _renderList() {
                if (!this.uiList) return;
                this.uiList.replaceChildren();
                const equippedOnly = Screens.current === 'equipped';
                const filter = typeof invSidebar !== 'undefined' && invSidebar.filterEnabled ? invSidebar.activeFilter : null;
                let entries = this.getEntries();
                if (equippedOnly) entries = entries.filter(entry => entry.isEquipped);
                if (filter && filter !== 'all' && !equippedOnly) entries = entries.filter(entry => entry.category === filter);   // Equipped lists everything worn and held
                const labels = { items: 'Items', collectibles: 'Collectibles', weapons: 'Weapons', pets: 'Pets', mounts: 'Mounts' };
                if (!entries.length) {
                    const empty = uiKit.make(['div', 'inventory-empty', equippedOnly ? 'NOTHING EQUIPPED IN THIS CATEGORY' : `NO OWNED ${(labels[filter] || 'ITEMS').toUpperCase()}`], this.uiList);
                    return;
                }
                // With filtering off, each category still has its own heading.
                for (const [category, label] of Object.entries(labels)) {
                    const group = this._ordered(entries.filter(entry => entry.category === category));
                    if (!group.length) continue;
                    const heading = uiKit.make(['h2', 'inventory-section-title']);
                    heading.dataset.category = category;
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
        const AUGMENT_CATALOG = GAME_DB.items.augments;   // directory/game-db/items.json

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

