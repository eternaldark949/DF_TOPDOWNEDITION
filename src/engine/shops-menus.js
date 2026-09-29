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
            },

            closeAutoShop() {
                document.getElementById('auto-shop-overlay').style.display = 'none';
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

                switch (this._autoShopTab) {
                    case 'browse': this._renderBrowseTab(container); break;
                    case 'garage': this._renderGarageTab(container); break;
                    case 'customize': this._renderCustomizeTab(container); break;
                }
            },

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
            },

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
            },

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
            },
            
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
                document.getElementById('zib-menu').style.display = 'none';
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

