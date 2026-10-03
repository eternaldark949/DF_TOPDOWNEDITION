        // GameEngine — Vending, garage, auto shop, Zib rides, sleep menu.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
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
            },
            
            closeVendingMenu() {
                document.getElementById('vending-menu').style.display = 'none';
                this.pauseSystem.release('vending');
            },
            
            vendPurchase(itemId) {
                if (this.player.buffSystem.activate(itemId, this.worldMinutes, this)) {
                    this.updateUI();
                    document.getElementById('vend-balance').textContent = `BALANCE: ${this.currency} PERSONICS`;
                }
                this.closeVendingMenu();
            },
            
            // Legacy alias
            buyBubbleTea() { this.openVendingMenu(); },

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
            },
            
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
            },
            
            /**
             * Reset a garage car to factory defaults and sync if active.
             */
            resetGarageCarDefaults(garageIndex) {
                this.garage.resetToDefault(garageIndex);
                if (garageIndex === this.garage.activeIndex) {
                    this.garage.applyToVehicle(this.ownedCar);
                }
                showMessage('VEHICLE RESET TO FACTORY DEFAULTS.');
            },

            // =========================================================
            //  AUTO SHOP UI — Browse, Garage Management, Customize
            // =========================================================
            openAutoShop() {
                this.pauseSystem.acquire('auto_shop');
                this._autoShopTab = 'browse';
                const overlay = document.getElementById('auto-shop-overlay');
                this._shopShow('auto-shop-overlay', true);
                this._shopBalance('auto-shop-balance', this.currency);
                overlay.querySelectorAll('.auto-tab').forEach(btn => {
                    btn.onclick = () => { this._autoShopTab = btn.dataset.tab; audioSys.sfx('ui'); this.renderAutoShopTab(); };
                });
                document.getElementById('auto-shop-close').onclick = () => this.closeAutoShop();
                this.renderAutoShopTab();
            },

            closeAutoShop() {
                this._shopShow('auto-shop-overlay', false);
                this._customizeOriginal = null;
                this._customizePending = null;
                this.pauseSystem.release('auto_shop');
            },

            renderAutoShopTab() {
                const container = document.getElementById('auto-shop-content');
                if (!container) return;

                // Clear customize preview state when leaving that tab
                if (this._autoShopTab !== 'customize') {
                    this._customizeOriginal = null;
                    this._customizePending = null;
                }

                document.querySelectorAll('#auto-shop-overlay .auto-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this._autoShopTab));
                this._shopBalance('auto-shop-balance', this.currency);
                switch (this._autoShopTab) {
                    case 'browse': this._renderBrowseTab(container); break;
                    case 'garage': this._renderGarageTab(container); break;
                    case 'customize': this._renderCustomizeTab(container); break;
                }
            },

            // ── BROWSE TAB: Purchase new vehicles ──
            _renderBrowseTab(container) {
                const TIER = { 'ultra-luxury': ['gold', 'Ultra Luxury'], 'mid-luxury': ['mint', 'Mid Luxury'], 'economy': ['info', 'Economy'] };
                // the fastest car on sale sets the speed bars' scale
                let topSpeed = 0;
                for (const b in VEHICLE_BRANDS) for (const m in VEHICLE_BRANDS[b].models) topSpeed = Math.max(topSpeed, VEHICLE_BRANDS[b].baseStats.maxSpeed * VEHICLE_BRANDS[b].models[m].speedMod);
                let html = '';
                for (const brandKey in VEHICLE_BRANDS) {
                    const brand = VEHICLE_BRANDS[brandKey], [tc, tl] = TIER[brand.tier] || ['info', brand.tier];
                    html += `<div class="df-section"><span><span class="glint">◆</span>${brandKey}</span><span class="df-chip ${tc}">${tl}</span></div>`;
                    for (const modelKey in brand.models) {
                        const model = brand.models[modelKey], price = CAR_PRICES[brandKey]?.[modelKey];
                        if (!price) continue;
                        const owned = this.garage.cars.some(c => c.brand === brandKey && c.model === modelKey), afford = this.currency >= price;
                        const spd = brand.baseStats.maxSpeed * model.speedMod, seats = model.seats || brand.baseStats.seats || 4;
                        html += `<div class="df-card${owned ? ' lit' : afford ? '' : ' unaffordable'}" data-key="${brandKey}:${modelKey}"><div class="df-head">`;
                        html += `<div class="note-ico">${ACTION_ICONS && ACTION_ICONS.car ? `<span style="width:24px;height:24px;color:var(--df-gold);display:inline-flex">${ACTION_ICONS.car}</span>` : '🚗'}</div>`;
                        html += `<div class="grow"><div class="eyebrow">${brandKey} · ${modelKey}</div><div class="title">${model.name}</div>`;
                        html += `<div class="df-bar-label"><span>Top speed</span><span>${spd.toFixed(1)}</span></div><div class="df-bar${owned ? '' : ' gold'}" style="--v:${Math.round(spd / topSpeed * 100)}%"><i></i></div>`;
                        html += `<div class="df-chips" style="margin-top:8px;"><span class="df-chip">${seats} seats</span></div></div>`;
                        html += `<div class="df-shop-side">${owned ? '<span class="df-chip active">✓ Owned</span>' : `${this._priceHtml(price, this.currency)}<button class="df-btn small auto-buy-btn" data-brand="${brandKey}" data-model="${modelKey}"${afford ? '' : ' disabled'}>Buy</button>`}</div>`;
                        html += `</div></div>`;
                    }
                }
                container.innerHTML = html;
                this._shopFlash(container);
                container.querySelectorAll('.auto-buy-btn').forEach(btn => btn.addEventListener('click', () => this._confirmTap(btn, 'Confirm?', () => {
                    const brandKey = btn.dataset.brand, modelKey = btn.dataset.model, price = CAR_PRICES[brandKey]?.[modelKey] || 0;
                    if (this.currency < price) { showMessage('INSUFFICIENT FUNDS.'); return; }
                    this.currency -= price;
                    const idx = this.garage.addCar(brandKey, modelKey);
                    if (idx >= 0) {
                        showMessage(`PURCHASED: ${this.garage.getDisplayName(idx).toUpperCase()}`);
                        audioSys.sfx('ui');
                        this.updateUI();
                        this._shopJust = brandKey + ':' + modelKey;
                        this.renderAutoShopTab();
                    }
                })));
            },

            // ── GARAGE TAB: View owned cars, switch active, sell ──
            _renderGarageTab(container) {
                let html = `<div class="df-section"><span><span class="glint">◆</span>My Garage</span><span class="count">${this.garage.count} vehicle${this.garage.count === 1 ? '' : 's'}</span></div>`;
                for (let i = 0; i < this.garage.count; i++) {
                    const car = this.garage.get(i), isActive = i === this.garage.activeIndex, name = this.garage.getDisplayName(i);
                    html += `<div class="df-card${isActive ? ' lit' : ''}"><div class="df-head">`;
                    html += `<div class="df-swatch sq" style="background:${car.paintColor}"></div>`;
                    html += `<div class="grow"><div class="eyebrow">${car.brand} · ${car.model}</div><div class="title">${name}</div>`;
                    html += `<div class="df-chips" style="margin-top:8px;">`;
                    html += `<span class="df-chip">Paint <i class="df-swatch small sq" style="background:${car.paintColor}"></i></span>`;
                    html += `<span class="df-chip">Glow <i class="df-swatch small" style="background:${car.underglowColor || 'transparent'};${car.underglowColor ? `box-shadow:0 0 5px ${car.underglowColor}` : ''}"></i></span>`;
                    html += `<span class="df-chip">Lights <i class="df-swatch small" style="background:${car.headlightColor};box-shadow:0 0 5px ${car.headlightColor}"></i></span>`;
                    html += `</div></div><div class="df-shop-side">${isActive ? '<span class="df-chip active">● Active</span>' : ''}${car.isDefault ? '<span class="df-chip gold">Default</span>' : ''}</div></div>`;
                    html += `<div class="df-btn-row">`;
                    if (!isActive) html += `<button class="df-btn small auto-activate-btn" data-index="${i}">Set active</button>`;
                    html += `<button class="df-btn small ghost auto-reset-btn" data-index="${i}">Reset look</button>`;
                    if (!car.isDefault) html += `<button class="df-btn small danger auto-sell-btn" data-index="${i}">Sell · ${Math.floor((CAR_PRICES[car.brand]?.[car.model] || 0) * 0.4).toLocaleString()} PP</button>`;
                    html += `</div></div>`;
                }
                container.innerHTML = html;
                container.querySelectorAll('.auto-activate-btn').forEach(btn => btn.addEventListener('click', () => {
                    this.switchGarageCar(parseInt(btn.dataset.index)); audioSys.sfx('ui'); this.renderAutoShopTab();
                }));
                container.querySelectorAll('.auto-reset-btn').forEach(btn => btn.addEventListener('click', () => this._confirmTap(btn, 'Reset?', () => {
                    this.resetGarageCarDefaults(parseInt(btn.dataset.index)); this.renderAutoShopTab();
                })));
                container.querySelectorAll('.auto-sell-btn').forEach(btn => btn.addEventListener('click', () => this._confirmTap(btn, 'Sell?', () => {
                    const idx = parseInt(btn.dataset.index), car = this.garage.get(idx);
                    if (!car || car.isDefault) return;
                    const sellPrice = Math.floor((CAR_PRICES[car.brand]?.[car.model] || 0) * 0.4);
                    this.garage.removeCar(idx);
                    this.currency += sellPrice;
                    // If we sold the active car, rebuild ownedCar to the new active
                    const newActive = this.garage.getActive();
                    if (this.ownedCar.brand !== newActive.brand || this.ownedCar.model !== newActive.model) this.switchGarageCar(this.garage.activeIndex);
                    else this.garage.applyToVehicle(this.ownedCar);
                    this.updateUI();
                    showMessage(`VEHICLE SOLD FOR ${sellPrice} PERSONICS.`);
                    this.renderAutoShopTab();
                })));
            },

            // ── CUSTOMIZE TAB: Paint, underglow, headlights (preview free, pay on apply) ──
            _renderCustomizeTab(container) {
                const idx = this.garage.activeIndex, car = this.garage.getActive();
                if (!car) { container.innerHTML = '<div class="df-empty">No active vehicle.</div>'; return; }
                const name = this.garage.getDisplayName(idx), brandData = VEHICLE_BRANDS[car.brand];
                // Snapshot originals on first render (so we can revert)
                if (!this._customizeOriginal || this._customizeOriginal._carId !== car.id) {
                    this._customizeOriginal = { _carId: car.id, paintColor: car.paintColor, underglowColor: car.underglowColor, headlightColor: car.headlightColor };
                    this._customizePending = { paintColor: car.paintColor, underglowColor: car.underglowColor, headlightColor: car.headlightColor };
                }
                const pending = this._customizePending, orig = this._customizeOriginal;
                const universalColors = ['#1a1a1a', '#0a0a0a', '#ffffff', '#333333', '#8b0000', '#003366', '#2d5a27', '#4a0e4e', '#d4af37', '#ff4500', '#ff69b4', '#E6E6FA', '#CCCCFF'];
                const allPaintColors = [...new Set([...(brandData?.colors || []), ...universalColors])];
                const glowOptions = [null, '#ffffff', '#ff8800', '#00f3ff', '#ff00aa', '#00ff88', '#d4af37', '#ff2244', '#a469ff', '#ff4500', '#ff69b4', '#E6E6FA', '#CCCCFF'];
                const headlightOptions = ['#ffffaa', '#ffffff', '#ccddff', '#ff8800', '#00f3ff', '#ff69b4', '#d4af37', '#ff2244', '#E6E6FA', '#CCCCFF'];
                let totalCost = 0, changeCount = 0;
                if (pending.paintColor !== orig.paintColor) { totalCost += CUSTOM_PRICES.paint; changeCount++; }
                if (pending.underglowColor !== orig.underglowColor) { totalCost += CUSTOM_PRICES.underglow; changeCount++; }
                if (pending.headlightColor !== orig.headlightColor) { totalCost += CUSTOM_PRICES.headlights; changeCount++; }
                const canAfford = this.currency >= totalCost;
                const picks = (cls, list, cur, sq, glow) => `<div class="df-swatches">${list.map(c => `<button class="df-swatch-pick${sq ? ' sq' : ''} ${cls}${c === cur ? ' on' : ''}" data-color="${c === null ? 'null' : c}" style="background:${c || 'transparent'};${glow && c ? `box-shadow:0 0 7px ${c};` : ''}">${c === null ? '✕' : ''}</button>`).join('')}</div>`;
                const lamp = (top) => `<i class="lamp" style="top:${top}px;background:${pending.headlightColor};box-shadow:0 0 9px ${pending.headlightColor}"></i>`;
                let html = `<div class="df-card"><div class="df-car-preview">`;
                html += `<div class="df-car" style="background:${pending.paintColor}">${pending.underglowColor ? `<i class="glow" style="background:${pending.underglowColor};box-shadow:0 0 10px ${pending.underglowColor},0 3px 14px ${pending.underglowColor}"></i>` : ''}${lamp(9)}${lamp(33)}</div>`;
                html += `<div class="grow"><div class="eyebrow">Customizing</div><div class="title">${name}</div><div class="desc">Preview freely — you're only charged when you apply.</div></div></div></div>`;
                html += `<div class="df-section"><span>Paint</span><span class="count">${CUSTOM_PRICES.paint} PP${pending.paintColor !== orig.paintColor ? ' · <b style="color:var(--df-gold)">changed</b>' : ''}</span></div>${picks('auto-paint-btn', allPaintColors, pending.paintColor, true)}`;
                html += `<div class="df-section"><span>Underglow</span><span class="count">${CUSTOM_PRICES.underglow} PP${pending.underglowColor !== orig.underglowColor ? ' · <b style="color:var(--df-gold)">changed</b>' : ''}</span></div>${picks('auto-glow-btn', glowOptions, pending.underglowColor, false, true)}`;
                html += `<div class="df-section"><span>Headlights</span><span class="count">${CUSTOM_PRICES.headlights} PP${pending.headlightColor !== orig.headlightColor ? ' · <b style="color:var(--df-gold)">changed</b>' : ''}</span></div>${picks('auto-headlight-btn', headlightOptions, pending.headlightColor, false, true)}`;
                html += `<div class="df-btn-row" style="justify-content:center;margin-top:14px;">`;
                if (changeCount > 0) {
                    html += `<button class="df-btn" id="auto-custom-apply"${canAfford ? '' : ' disabled'}>Apply ${changeCount} change${changeCount > 1 ? 's' : ''} · ${totalCost} PP</button>`;
                    html += `<button class="df-btn ghost" id="auto-custom-revert">Revert</button>`;
                } else html += `<div class="df-hint">Pick a colour above to preview it.</div>`;
                html += `</div>`;
                container.innerHTML = html;
                const updatePending = (prop, val) => { pending[prop] = val; audioSys.sfx('ui'); this._renderCustomizeTab(container); };
                container.querySelectorAll('.auto-paint-btn').forEach(b => b.addEventListener('click', () => updatePending('paintColor', b.dataset.color)));
                container.querySelectorAll('.auto-glow-btn').forEach(b => b.addEventListener('click', () => updatePending('underglowColor', b.dataset.color === 'null' ? null : b.dataset.color)));
                container.querySelectorAll('.auto-headlight-btn').forEach(b => b.addEventListener('click', () => updatePending('headlightColor', b.dataset.color)));
                const applyBtn = document.getElementById('auto-custom-apply');
                if (applyBtn) applyBtn.addEventListener('click', () => {
                    if (!canAfford) { showMessage(`INSUFFICIENT FUNDS (${totalCost} PERSONICS REQUIRED).`); return; }
                    this.currency -= totalCost;
                    this.customizeGarageCar(idx, { paintColor: pending.paintColor, underglowColor: pending.underglowColor, headlightColor: pending.headlightColor });
                    this._shopBalance('auto-shop-balance', this.currency);
                    this.updateUI();
                    showMessage(`CUSTOMIZATION APPLIED — ${totalCost} PERSONICS`);
                    this._customizeOriginal = { _carId: car.id, paintColor: pending.paintColor, underglowColor: pending.underglowColor, headlightColor: pending.headlightColor };
                    this._renderCustomizeTab(container);
                });
                const revertBtn = document.getElementById('auto-custom-revert');
                if (revertBtn) revertBtn.addEventListener('click', () => {
                    pending.paintColor = orig.paintColor; pending.underglowColor = orig.underglowColor; pending.headlightColor = orig.headlightColor;
                    this._renderCustomizeTab(container);
                });
            },

            // =========================================================
            //  ZIB TAXI DESTINATION PICKER
            // =========================================================
            openZibMenu(zib) {
                this.pauseSystem.acquire('zib_menu');
                this._pendingZib = zib;
                this._shopShow('zib-menu', true);
                this._shopBalance('zib-balance', this.currency);
                const container = document.getElementById('zib-destinations');
                const DIST = { near: ['mint', 'Nearby'], mid: ['gold', 'Moderate'], far: ['crimson', 'Far'] };
                const pin = typeof ACTION_ICONS !== 'undefined' && ACTION_ICONS.car ? `<span style="width:24px;height:24px;color:var(--df-gold);display:inline-flex">${ACTION_ICONS.car}</span>` : '🚕';
                let html = `<div class="df-section"><span><span class="glint">◆</span>Select destination</span></div>`, n = 0;
                for (const dest of ZIB_DESTINATIONS) {
                    const lm = this.landmarkRegistry[dest.landmark];
                    if (!lm) continue;                                              // not on this map
                    const fare = this.zibSystem.calculateFare(zib.x, zib.y, lm.x, lm.y), afford = this.currency >= fare;
                    const dist = Math.hypot(lm.x - zib.x, lm.y - zib.y), [dc, dl] = DIST[dist < 500 ? 'near' : dist < 2000 ? 'mid' : 'far'];
                    html += `<div class="df-card clickable zib-dest-btn${afford ? '' : ' unaffordable dim'}" data-landmark="${dest.landmark}" data-x="${lm.x}" data-y="${lm.y}" data-fare="${fare}"><div class="df-head">`;
                    html += `<div class="note-ico">${pin}</div><div class="grow"><div class="title">${dest.label}</div><div class="df-chips" style="margin-top:6px;"><span class="df-chip ${dc}">${dl}</span></div></div>`;
                    html += `<div class="df-shop-side">${this._priceHtml(fare, this.currency)}</div></div></div>`;
                    n++;
                }
                if (!n) html += `<div class="df-empty">No destinations from here.</div>`;
                container.innerHTML = html;
                container.querySelectorAll('.zib-dest-btn').forEach(card => card.addEventListener('click', () => {
                    const fare = parseInt(card.dataset.fare);
                    if (this.currency < fare) { showMessage('INSUFFICIENT FUNDS.'); audioSys.sfx('ui'); return; }
                    const selectedZib = this._pendingZib;
                    this.closeZibMenu();
                    this.zibSystem.startRide(selectedZib, card.dataset.landmark, parseFloat(card.dataset.x), parseFloat(card.dataset.y), fare, this);
                }));
                document.getElementById('zib-close').onclick = () => this.closeZibMenu();
            },

            // =========================================================
            //  LOST THINGS — the Double Nights lobby's forgotten cases, Moon City's clutches,
            //  coat and VIP purses. A few personics lifted from each; each fills again once a
            //  day. Props may carry their own pay range (lootMin/lootMax) and lines (lootLines).
            //  (Save key questState.lobbyLuggage, kept for old saves, now holds them all.)
            // =========================================================
            searchLostLuggage(prop) {
                const qs = this.questState, id = prop.noteId || 'lobby';
                const day = Math.floor((this.worldMinutes || 0) / 1440);
                qs.lobbyLuggage = qs.lobbyLuggage || {};
                if (qs.lobbyLuggage[id] === day) { showMessage('EMPTY. SOMEONE BEAT YOU TO IT.'); audioSys.sfx('ui'); return; }
                const lo = prop.lootMin ?? 25, hi = prop.lootMax ?? 80;
                const pp = lo + Math.floor(Math.random() * (hi - lo + 1));
                qs.lobbyLuggage[id] = day; prop._searched = true;
                this.currency += pp; this.updateUI();
                showMessage(`+${pp} PERSONICS — ${pickFrom(Math.random, prop.lootLines || ["SOMEONE WON'T MISS IT", 'FINDERS KEEPERS', 'A TIP, OF SORTS', 'THINK EXCELLENCE'])}`);
                audioSys.sfx('ui');
            },

            /** Which lost things have been searched today (they open; they refill at dawn of the next day). */
            refreshLostLuggage() {
                const L = (this.questState && this.questState.lobbyLuggage) || {}, day = Math.floor((this.worldMinutes || 0) / 1440);
                for (const p of this.props) if (p.interactionType === 'lost_luggage') p._searched = L[p.noteId] === day;
            },

            // =========================================================
            //  GAUNTLET MAP PICKER (Grum North) — one card per GAUNTLET_MAPS entry;
            //  sealed ones are placeholders for maps to come
            // =========================================================
            openGauntletMenu() {
                this.pauseSystem.acquire('gauntlet_menu');
                const menu = document.getElementById('gauntlet-menu');
                menu.style.display = 'block';
                const hg = this.hordeGauntlet, container = document.getElementById('gauntlet-maps');
                let html = '';
                for (const g of GAUNTLET_MAPS) {
                    const best = hg && hg.highestWaves[g.id];
                    const on = !g.locked;
                    html += `<button class="gauntlet-map-btn" data-id="${g.id}" ${on ? '' : 'disabled'} style="display:block; width:100%; padding:12px 14px; margin-bottom:7px; text-align:left; border-radius:5px; font-family:Montserrat,sans-serif; cursor:${on ? 'pointer' : 'default'}; background:${on ? 'linear-gradient(90deg, rgba(122,77,216,0.16), rgba(138,31,53,0.14))' : 'rgba(255,255,255,0.02)'}; border:1px solid ${on ? 'rgba(232,194,122,0.35)' : 'rgba(255,255,255,0.06)'}; color:${on ? '#eee' : '#555'};">`;
                    html += `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px;">`;
                    html += `<div style="font-family:Orbitron,sans-serif; font-size:0.78rem; letter-spacing:1.5px; color:${on ? '#e8c27a' : '#555'};">${on ? '' : '🔒 '}${g.label.toUpperCase()}</div>`;
                    html += on ? `<div style="font-size:0.55rem; color:#b48cff; letter-spacing:1px; white-space:nowrap;">${best ? 'BEST: WAVE ' + best : 'UNPLAYED'}</div>` : '';
                    html += `</div><div style="font-size:0.62rem; color:${on ? '#a99ab4' : '#444'}; margin-top:4px; line-height:1.35;">${g.blurb}</div></button>`;
                }
                container.innerHTML = html;
                container.querySelectorAll('.gauntlet-map-btn:not([disabled])').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.closeGauntletMenu();
                        if (this.hordeGauntlet) this.hordeGauntlet.start(this, btn.dataset.id);
                    });
                });
                document.getElementById('gauntlet-close').onclick = () => this.closeGauntletMenu();
            },

            closeGauntletMenu() {
                document.getElementById('gauntlet-menu').style.display = 'none';
                this.pauseSystem.release('gauntlet_menu');
            },

            closeZibMenu() {
                this._shopShow('zib-menu', false);
                this._pendingZib = null;
                this.pauseSystem.release('zib_menu');
            },

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
            },
        
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
            },
            
        });

