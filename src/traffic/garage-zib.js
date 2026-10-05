        /* --- VEHICLE BRANDS DATA STRUCTURE --- */
        /* --- UPDATED VEHICLE DATA --- */
        const VEHICLE_BRANDS = {
            LADY: {
                tier: 'ultra-luxury',
                baseStats: { 
                    maxSpeed: 12.5, acceleration: 0.35, handling: 0.08, friction: 0.98, 
                    mass: 2500, lightRange: 100, seats: 6, // SUV = 6 seats
                    brake: 0.42     // px/tick² at full brake (traffic/traffic-vehicle.js applyDrivePhysics)
                },
                // Handling character (applyDrivePhysics): heavy and floaty, lazy wheel, long catchable slide
                drive: { steerRate: 0.085, turnIn: 0.3, gripF: 1.0, gripR: 0.86, latAcc: 0.60, weight: 1.35 },
                colors: ['#050505', '#1a0b1a', '#0b1a1a', '#1a1a0b', '#2b0000'],
                glowColor: '#ffffff', headlightColor: '#ffffff', visualStyle: 'blackmark',
                models: { 
                    suv: { name: 'BlackMark V1', length: 95, width: 44, speedMod: 1.0 },
                    suv2: { name: 'BlackMark V3', length: 88, width: 42, speedMod: 1.05, noHearseCap: true, seats: 6 }
                }
            },
            Zenxera: {
                tier: 'mid-luxury',
                baseStats: { maxSpeed: 9.5, acceleration: 0.12, handling: 0.055, friction: 0.96, mass: 1200, seats: 4, brake: 0.30 },
                drive: { steerRate: 0.15, turnIn: 0.45, gripF: 1.1, gripR: 0.9, latAcc: 0.55, weight: 0.85 },   // sharp, lively rear
                // NEW PALETTE: Lavender, Periwinkle, Silver, Bronze
                colors: ['#E6E6FA', '#CCCCFF', '#C0C0C0', '#cd7f32', '#9370DB'],
                glowColor: '#00f3ff', headlightColor: '#ccddff', // Cool blue-white
                visualStyle: 'angular',
                models: {
                    sedan:  { name: 'Stratos',   length: 72, width: 40, speedMod: 1.0, seats: 4 },
                    suv:    { name: 'Apex',      length: 78, width: 46, speedMod: 0.9, seats: 6 },
                    sports: { name: 'Bolt',      length: 63, width: 36, speedMod: 1.25, seats: 2 },
                    truck:  { name: 'Freighter', length: 92, width: 50, speedMod: 0.75, seats: 2 }
                }
            },
            Gelfash: {
                tier: 'economy',
                baseStats: { maxSpeed: 8.5, acceleration: 0.1, handling: 0.05, friction: 0.96, mass: 1000, seats: 4, brake: 0.26 },
                drive: { steerRate: 0.11, turnIn: 0.36, gripF: 0.88, gripR: 1.1, latAcc: 0.42, weight: 1.0 },    // soft, understeers
                colors: ['#fff', '#aaa', '#555', '#a469ff', '#00f3ff'],
                glowColor: null, headlightColor: '#ffffaa', visualStyle: 'boxy',
                models: {
                    sedan:  { name: 'Commuter',  length: 70, width: 40, speedMod: 1.0, seats: 4 },
                    suv:    { name: 'Ranger',    length: 75, width: 44, speedMod: 0.9, seats: 5 },
                    sports: { name: 'Sprint',    length: 62, width: 36, speedMod: 1.15, seats: 2 },
                    truck:  { name: 'Workhorse', length: 90, width: 50, speedMod: 0.7, seats: 2 }
                }
            }
        };
        
        // Spawn weights by brand (can be adjusted per map zone later)
        const VEHICLE_SPAWN_WEIGHTS = { LADY: 0.1, Zenxera: 0.25, Gelfash: 0.65 };
        const VEHICLE_MODEL_WEIGHTS = { sedan: 0.5, suv: 0.2, suv2: 0.1, sports: 0.1, truck: 0.1 };

        // ============================================================================
        //  PLAYER GARAGE — Multi-car ownership & customization system
        //  ---------------------------------------------------------
        //  Manages owned vehicles, customization (paint, underglow, headlights),
        //  active car switching, and save/load serialization.
        //  The BlackMark V1 is Stella's permanent default — cannot be sold.
        // ============================================================================

        /** BlackMark factory defaults — used for reset to default */
        const BLACKMARK_DEFAULTS = Object.freeze({
            brand: 'LADY', model: 'suv',
            paintColor: '#1a1a1a',
            underglowColor: '#ffffff',
            headlightColor: '#ffffff'
        });

        /** Purchase prices per brand tier + model */
        const CAR_PRICES = {
            LADY:    { suv: 15000, suv2: 18000 },
            Zenxera: { sedan: 3000, suv: 4500, sports: 6000, truck: 3500 },
            Gelfash: { sedan: 1200, suv: 1800, sports: 2500, truck: 1500 }
        };

        /** Cosmetic service pricing */
        const CUSTOM_PRICES = Object.freeze({
            paint: 75,
            underglow: 150,
            headlights: 100
        });

        class PlayerGarage {
            constructor() {
                // Cars array — index 0 is always the BlackMark (permanent default)
                this.cars = [{
                    id: 'blackmark_default',
                    brand: BLACKMARK_DEFAULTS.brand,
                    model: BLACKMARK_DEFAULTS.model,
                    paintColor: BLACKMARK_DEFAULTS.paintColor,
                    underglowColor: BLACKMARK_DEFAULTS.underglowColor,
                    headlightColor: BLACKMARK_DEFAULTS.headlightColor,
                    isDefault: true
                }];
                this.activeIndex = 0;
            }

            /** Get the currently active car data object. */
            getActive() { return this.cars[this.activeIndex] || this.cars[0]; }

            /** Get a car by index. */
            get(index) { return this.cars[index] || null; }

            /** Number of owned cars. */
            get count() { return this.cars.length; }

            /**
             * Add a new car to the garage.
             * @param {string} brand - VEHICLE_BRANDS key
             * @param {string} model - Model key within brand
             * @param {Object} [custom] - Optional initial customization overrides
             * @returns {number} Index of the new car, or -1 if brand/model invalid
             */
            addCar(brand, model, custom = {}) {
                const brandData = VEHICLE_BRANDS[brand];
                if (!brandData || !brandData.models[model]) return -1;

                const id = `${brand}_${model}_${Date.now()}`;
                this.cars.push({
                    id,
                    brand,
                    model,
                    paintColor: custom.paintColor || brandData.colors[0],
                    underglowColor: custom.underglowColor || brandData.glowColor || null,
                    headlightColor: custom.headlightColor || brandData.headlightColor || '#ffffaa',
                    isDefault: false
                });
                return this.cars.length - 1;
            }

            /**
             * Remove a car from the garage (cannot remove the default BlackMark).
             * If the removed car was active, switches to the default.
             * @returns {boolean} true if removed
             */
            removeCar(index) {
                if (index <= 0 || index >= this.cars.length) return false;
                const car = this.cars[index];
                if (car.isDefault) return false;

                this.cars.splice(index, 1);

                // Fix active index
                if (this.activeIndex === index) {
                    this.activeIndex = 0; // Fall back to BlackMark
                } else if (this.activeIndex > index) {
                    this.activeIndex--;
                }
                return true;
            }

            /**
             * Set the active car by index.
             * @returns {boolean} true if switched
             */
            setActive(index) {
                if (index < 0 || index >= this.cars.length) return false;
                this.activeIndex = index;
                return true;
            }

            /**
             * Apply customization to a car.
             * @param {number} index - Car index
             * @param {Object} changes - { paintColor?, underglowColor?, headlightColor? }
             */
            customize(index, changes) {
                const car = this.cars[index];
                if (!car) return;
                if (changes.paintColor !== undefined) car.paintColor = changes.paintColor;
                if (changes.underglowColor !== undefined) car.underglowColor = changes.underglowColor;
                if (changes.headlightColor !== undefined) car.headlightColor = changes.headlightColor;
            }

            /**
             * Reset a car to its factory defaults.
             * For the BlackMark, restores BLACKMARK_DEFAULTS.
             * For purchased cars, restores brand defaults.
             */
            resetToDefault(index) {
                const car = this.cars[index];
                if (!car) return;

                if (car.isDefault) {
                    car.paintColor = BLACKMARK_DEFAULTS.paintColor;
                    car.underglowColor = BLACKMARK_DEFAULTS.underglowColor;
                    car.headlightColor = BLACKMARK_DEFAULTS.headlightColor;
                } else {
                    const brandData = VEHICLE_BRANDS[car.brand];
                    if (brandData) {
                        car.paintColor = brandData.colors[0];
                        car.underglowColor = brandData.glowColor || null;
                        car.headlightColor = brandData.headlightColor || '#ffffaa';
                    }
                }
            }

            /**
             * Apply the active car's data to a TrafficVehicle instance.
             * Called after switching cars or loading a save to sync visuals.
             */
            applyToVehicle(vehicle) {
                const car = this.getActive();
                if (!car || !vehicle) return;
                vehicle.color = car.paintColor;
                vehicle.glowColor = car.underglowColor;
                vehicle.headlightColor = car.headlightColor;
            }

            /**
             * Get the display name for a car entry.
             */
            getDisplayName(index) {
                const car = this.cars[index];
                if (!car) return 'Unknown';
                const brandData = VEHICLE_BRANDS[car.brand];
                const modelData = brandData?.models[car.model];
                return modelData ? `${car.brand} ${modelData.name}` : `${car.brand} ${car.model}`;
            }

            /** Serialize for save system. */
            serialize() {
                return {
                    cars: this.cars.map(c => ({ ...c })),
                    activeIndex: this.activeIndex
                };
            }

            /** Deserialize from save data. */
            deserialize(data) {
                if (!data) return;

                if (Array.isArray(data.cars) && data.cars.length > 0) {
                    this.cars = data.cars.map(c => ({
                        id: c.id || 'unknown',
                        brand: c.brand || 'LADY',
                        model: c.model || 'suv',
                        paintColor: c.paintColor || '#1a1a1a',
                        underglowColor: c.underglowColor ?? null,
                        headlightColor: c.headlightColor || '#ffffaa',
                        isDefault: c.isDefault ?? false
                    }));

                    // Ensure BlackMark is always at index 0 with isDefault
                    if (!this.cars[0].isDefault) {
                        this.cars.unshift({
                            id: 'blackmark_default',
                            brand: BLACKMARK_DEFAULTS.brand,
                            model: BLACKMARK_DEFAULTS.model,
                            paintColor: BLACKMARK_DEFAULTS.paintColor,
                            underglowColor: BLACKMARK_DEFAULTS.underglowColor,
                            headlightColor: BLACKMARK_DEFAULTS.headlightColor,
                            isDefault: true
                        });
                    }
                }
                this.activeIndex = data.activeIndex ?? 0;
                if (this.activeIndex >= this.cars.length) this.activeIndex = 0;
            }
        }

        // ============================================================================
        //  ZIB AUTONOMOUS TAXI SYSTEM
        //  ---------------------------------------------------------
        //  Violet luxe taxis using LADY BlackMark V3 (suv2) chassis.
        //  Players can hail a nearby Zib, pick a destination, and ride
        //  as a passenger while the Zib drives via AutoDrive.
        //  Fare: base fee + distance-based rate. Hijacking is free.
        // ============================================================================

        const ZIB_CONFIG = Object.freeze({
            brand: 'LADY',
            model: 'suv2',
            paintColor: '#1a0a2e',
            underglowColor: '#8a2be2',
            headlightColor: '#9966ff',
            fareBase: 25,
            farePerUnit: 0.025,
            maxActive: 3,
            spawnChance: 0.008
        });

        const ZIB_DESTINATIONS = [
            { id: 'silver_queen', label: 'Silver Queen Apartments', landmark: 'parking_spot' },
            { id: 'moon_city', label: 'Moon City Nightclub', landmark: 'club_entrance' },
            { id: 'double_nights', label: 'Double Nights Hotel', landmark: 'hotel_entrance' },
            { id: 'cozy_cafe', label: 'Cozy Cafe', landmark: 'cozy_cafe' },
            { id: 'dr_yins', label: "Dr. Yin's Clinic", landmark: 'clinic' },
            { id: 'torque_auto', label: 'Torque Auto', landmark: 'torque_auto' },
            { id: 'neural_sys', label: 'Neural Systems', landmark: 'neural_systems' },
            { id: 'enni_cole', label: 'Enni Cole', landmark: 'enni_cole' },
            { id: 'biggs_park', label: 'Biggs Amusement Park', landmark: 'biggs_park' }
        ];

        class ZibSystem {
            constructor() {
                this.activeZibs = [];
                this.passengerRide = null;
            }

            trySpawn(trafficManager) {
                if (this.activeZibs.length >= ZIB_CONFIG.maxActive) return;
                if (Math.random() > ZIB_CONFIG.spawnChance) return;
                const allLanes = trafficManager.network?.allLanes;
                if (!allLanes || allLanes.length === 0) return;
                const lane = allLanes[Math.floor(Math.random() * allLanes.length)];
                if (!lane || !lane.start) return;

                const zib = new TrafficVehicle(lane, ZIB_CONFIG.brand, ZIB_CONFIG.model, 'AI');
                zib.color = ZIB_CONFIG.paintColor;
                zib.glowColor = ZIB_CONFIG.underglowColor;
                zib.headlightColor = ZIB_CONFIG.headlightColor;
                zib.isZib = true;
                zib.driverType = 'traffic';
                zib.hasDriver = false;
                trafficManager.vehicles.push(zib);
                this.activeZibs.push(zib);
            }

            cleanup() {
                this.activeZibs = this.activeZibs.filter(z => z.visible && !z.markedForDestroy);
            }

            getNearest(px, py, range) {
                let closest = null;
                let closestDist = range;
                for (const zib of this.activeZibs) {
                    if (!zib.visible || zib.dead || zib.markedForDestroy || zib.fading || zib.hasDriver) continue;
                    if (this.passengerRide && this.passengerRide.zib === zib) continue;
                    const dist = Math.hypot(px - zib.x, py - zib.y);
                    if (dist < closestDist) { closestDist = dist; closest = zib; }
                }
                return closest;
            }

            calculateFare(fromX, fromY, toX, toY) {
                const dist = Math.hypot(toX - fromX, toY - fromY);
                return Math.max(ZIB_CONFIG.fareBase, Math.round(ZIB_CONFIG.fareBase + dist * ZIB_CONFIG.farePerUnit));
            }

            startRide(zib, landmarkId, destX, destY, fare, game) {
                if (this.passengerRide || !zib || zib.dead || zib.markedForDestroy) return;
                this.passengerRide = { zib, destinationX: destX, destinationY: destY, fare, startX: zib.x, startY: zib.y };

                const idx = game.traffic.vehicles.indexOf(zib);
                if (idx > -1) game.traffic.vehicles.splice(idx, 1);

                zib.hasDriver = true;
                zib.controlMode = 'AI';
                zib.driverType = 'zib';
                game.car = zib;
                game.isDriving = true;
                game.player.visible = true;
                zib._mapBounds = { w: game.activeMap.width, h: game.activeMap.height };

                // Resolve the drive-to point. Priority:
                //   1. Precomputed per-landmark drop-off (south-curb projection from CityLayout)
                //   2. Euclidean nearest-road snap (legacy fallback for non-building landmarks)
                //   3. Raw landmark coords (last resort)
                let driveDestX = destX, driveDestY = destY;
                const drop = (landmarkId && game.dropOffRegistry) ? game.dropOffRegistry[landmarkId] : null;
                if (drop) {
                    driveDestX = drop.x;
                    driveDestY = drop.y;
                } else if (game.traffic && game.traffic.network) {
                    const roadPt = game.traffic.network.findNearestRoadPoint(destX, destY);
                    if (roadPt && roadPt.distance < 300) {
                        driveDestX = roadPt.x;
                        driveDestY = roadPt.y;
                    }
                }
                zib.navDestination = { x: driveDestX, y: driveDestY };
                game.navDestination = { x: driveDestX, y: driveDestY };
                // Update ride destination to match drop-off point so arrival check fires correctly.
                this.passengerRide.destinationX = driveDestX;
                this.passengerRide.destinationY = driveDestY;

                if (game.ui) game.ui.navMarker = { x: driveDestX, y: driveDestY };
                const success = zib.enableAutoDrive(game.traffic.network, game.activeMap.walls) && game._refreshAutoDriveRoute();
                if (!success) {
                    showMessage(`ZIB REROUTING...`);
                    const ride = this.passengerRide;
                    setTimeout(() => { if (this.passengerRide === ride) this.teleportToDestination(game); }, 500);
                }
                // Ensure driverType stays 'zib' after enableAutoDrive
                zib.driverType = 'zib';

                zib.clearSeats();
                zib.seatOccupants[0] = true;
                zib.seatOccupants[1] = true;
                if (game.teammates) game.teammates.forEach(tm => {
                    if (tm.recruited && !tm.downed) zib.assignPassenger(tm);
                });
                if (game.velvetCat && game.questState.hasVelvetCat) game.velvetCat.inCar = true;
                Object.assign(game.player, zib.getSeatWorldPos(0));

                game.autodriveBtn.style.display = 'none';
                if (game.zibSkipBtn) game.zibSkipBtn.style.display = 'flex';
                if (game.holsterBtn) game.holsterBtn.style.display = 'none';
                showMessage(`ZIB HAILED — ${fare} PERSONICS — EN ROUTE. Press SKIP to teleport.`);
            }

            tick(game) {
                if (!this.passengerRide || this.passengerRide.teleporting) return;
                const ride = this.passengerRide;
                if (game._hasReachedDriveDestination(ride.zib, ride.destinationX, ride.destinationY, 40)) {
                    this.completeRide(game); return;
                }
                
                // Stuck detection — if Zib barely moves for 10 seconds, force-complete
                if (ride._stuckX === undefined) { ride._stuckX = ride.zib.x; ride._stuckY = ride.zib.y; ride._stuckTimer = 0; }
                const moved = Math.hypot(ride.zib.x - ride._stuckX, ride.zib.y - ride._stuckY);
                if (moved < 20) {
                    ride._stuckTimer++;
                    if (ride._stuckTimer > 600) { // ~10 seconds at 60fps
                        showMessage("ZIB REROUTING — TELEPORTING TO DESTINATION");
                        this.teleportToDestination(game);
                        return;
                    }
                } else {
                    ride._stuckX = ride.zib.x;
                    ride._stuckY = ride.zib.y;
                    ride._stuckTimer = 0;
                }
            }

            /** Teleport player to destination instantly — the premium Zib feature. */
            teleportToDestination(game) {
                if (!this.passengerRide || this.passengerRide.teleporting) return;
                const ride = this.passengerRide;
                ride.teleporting = true;
                
                // Charge full fare
                game.currency -= ride.fare;
                if (game.currency < 0) game.currency = 0;
                game.updateUI();
                
                // Pause + fade out
                game.pauseSystem.acquire('zib_teleport');
                const fadeOverlay = document.getElementById('fade-overlay');
                fadeOverlay.classList.add('active');

                setTimeout(() => {
                    if (this.passengerRide !== ride) {
                        fadeOverlay.classList.remove('active');
                        game.pauseSystem.release('zib_teleport');
                        return;
                    }
                    const lane = ride.zib._driveRoute?.endLane || game.traffic.network.findBestLaneAt(
                        ride.destinationX, ride.destinationY,
                        ride.destinationX + Math.cos(ride.zib.angle) * 100,
                        ride.destinationY + Math.sin(ride.zib.angle) * 100
                    );
                    ride.zib.disableAutoDrive();
                    ride.zib.currentLane = lane;
                    if (lane) ride.zib.angle = lane.angle;
                    ride.zib.vx = ride.zib.vy = ride.zib.speed = 0;
                    // Teleport Zib + player to destination
                    ride.zib.x = ride.destinationX;
                    ride.zib.y = ride.destinationY;
                    ride.zib.prevX = ride.zib.x; ride.zib.prevY = ride.zib.y;
                    game.player.x = ride.destinationX;
                    game.player.y = ride.destinationY;
                    
                    // Snap camera
                    game.camera.x = ride.destinationX;
                    game.camera.y = ride.destinationY;

                    // Reset animation state after teleport
                    resetHumanoidAnim(game.player);
                    game.teammates.forEach(t => resetHumanoidAnim(t));

                    // Exit Zib cleanly — player gets out, Zib drives off
                    this._exitZib(game, ride.zib);
                    this.passengerRide = null;
                    
                    showMessage(`TELEPORTED — ${ride.fare} PERSONICS CHARGED. THANK YOU FOR RIDING ZIB.`);

                    // Fade back in
                    setTimeout(() => {
                        fadeOverlay.classList.remove('active');
                        game.pauseSystem.release('zib_teleport');
                    }, 200);
                }, 400);
            }

            completeRide(game) {
                if (!this.passengerRide || this.passengerRide.teleporting) return;
                const ride = this.passengerRide;
                ride.zib.vx = ride.zib.vy = ride.zib.speed = 0;
                game.currency -= ride.fare;
                if (game.currency < 0) game.currency = 0;
                game.updateUI();
                showMessage(`ARRIVED — ${ride.fare} PERSONICS CHARGED. THANK YOU FOR RIDING ZIB.`);
                this._exitZib(game, ride.zib);
                this.passengerRide = null;
            }

            exitEarly(game) {
                if (!this.passengerRide || this.passengerRide.teleporting) return;
                const ride = this.passengerRide;
                const totalDist = Math.hypot(ride.destinationX - ride.startX, ride.destinationY - ride.startY);
                const traveledDist = Math.hypot(ride.zib.x - ride.startX, ride.zib.y - ride.startY);
                const fraction = Math.min(1, totalDist > 0 ? traveledDist / totalDist : 0);
                const partialFare = Math.round(ride.fare * fraction);
                game.currency -= partialFare;
                if (game.currency < 0) game.currency = 0;
                game.updateUI();
                showMessage(`EXITED EARLY — ${partialFare} PERSONICS CHARGED.`);
                this._exitZib(game, ride.zib);
                this.passengerRide = null;
            }

            _exitZib(game, zib) {
                // Player exits — Zib should drive off as normal AI traffic
                zib.hasDriver = false;
                zib.driverType = 'traffic';
                zib.controlMode = 'AI';
                zib.navDestination = null;
                if (zib.clearNavWaypoints) zib.clearNavWaypoints();
                // DON'T disable autodrive — let the Zib continue driving as traffic AI
                // Just clear its passenger-set destination so it resumes normal lane following
                if (!game.traffic.vehicles.includes(zib)) game.traffic.vehicles.push(zib);

                game.isDriving = false;
                game.player.visible = true;
                game.car = game.ownedCar;
                game.autodriveBtn.classList.remove('engaged');
                game.autodriveBtn.style.display = 'none';
                game.handbrakeHeld = false;
                if (game.handbrakeBtn) { game.handbrakeBtn.style.display = 'none'; game.handbrakeBtn.classList.remove('held'); }
                if (game.zibSkipBtn) game.zibSkipBtn.style.display = 'none';
                if (game.holsterBtn) game.holsterBtn.style.display = 'flex';

                const exitDist = zib.width / 2 + 25;
                game.player.x = zib.x + Math.sin(zib.angle) * exitDist;
                game.player.y = zib.y - Math.cos(zib.angle) * exitDist;

                if (game.teammates) game.teammates.forEach(tm => { if (tm.inCar) { tm.inCar = false; tm.seatIndex = -1; tm.x = game.player.x + (Math.random() - 0.5) * 30; tm.y = game.player.y + (Math.random() - 0.5) * 30; }});
                zib.clearSeats();
                if (game.velvetCat && game.questState.hasVelvetCat) {
                    game.velvetCat.inCar = false;
                    game.velvetCat.x = game.player.x - 25; game.velvetCat.y = game.player.y + 20;
                }

                game.navDestination = null;
                if (game.ui) {
                    game.ui.navMarker = null;
                    game.ui.navPath = [];
                    game.ui.roadLevelPath = [];
                    game.ui.precisePath = null;
                    game.ui.drawablePathSegments = [];
                }
            }

            get isPassenger() { return this.passengerRide !== null; }
        }

        /* --- AI DRIVING SOLVER --- */
        /* Calculates steering and throttle inputs for physics-based AI driving */
        class AIDriverSolver {
            /**
             * Calculate steering input to reach a target angle.
             * Uses predictive control that accounts for vehicle physics.
             * @param {TrafficVehicle} vehicle - The vehicle to steer
             * @param {number} targetAngle - Desired angle in radians
             * @param {number} urgency - How aggressively to steer (0.0-1.0)
             * @returns {number} Steering input (-1 to 1)
             */
            static calculateSteering(vehicle, targetAngle, urgency = 0.5) {
                // Normalize angle difference to -PI to PI
                let angleDiff = targetAngle - vehicle.angle;
                angleDiff = normalizeAngle(angleDiff);
                
                // Get current speed (use magnitude of velocity if available)
                const speed = Math.abs(vehicle.speed) || 0.1;
                
                // Calculate how much steering effect we get per unit input
                // Based on the manual driving formula: angle += turn * handling * direction
                const steerEffect = vehicle.handling * (speed > 0.5 ? 1 : 0);
                
                if (steerEffect < 0.001) {
                    // Vehicle is nearly stopped, steering has no effect
                    // Return maximum steering in the desired direction to prepare
                    return Math.sign(angleDiff) * urgency;
                }
                
                // Calculate required steering input
                // We want: angleDiff = turn * handling * direction * numFrames
                // For smooth control, aim to correct over several frames
                const correctionFrames = Math.max(3, 15 - speed * 1.5); // Faster = quicker response
                const requiredTurn = angleDiff / (steerEffect * correctionFrames);
                
                // Apply urgency scaling and clamp
                let steerInput = requiredTurn * (0.5 + urgency * 1.5);
                steerInput = clamp(steerInput, -1, 1);
                
                // Add damping for stability at high speeds
                if (speed > 5) {
                    const dampingFactor = 1.0 - (speed - 5) * 0.05;
                    steerInput *= Math.max(0.3, dampingFactor);
                }
                
                return steerInput;
            }
            
            /**
             * Calculate steering input to reach a target position.
             * Computes angle to target and uses angle-based steering.
             * @param {TrafficVehicle} vehicle - The vehicle to steer
             * @param {number} targetX - Target X position
             * @param {number} targetY - Target Y position
             * @param {number} urgency - How aggressively to steer (0.0-1.0)
             * @returns {number} Steering input (-1 to 1)
             */
            static steerToward(vehicle, targetX, targetY, urgency = 0.5) {
                const dx = targetX - vehicle.x;
                const dy = targetY - vehicle.y;
                const targetAngle = Math.atan2(dy, dx);
                return AIDriverSolver.calculateSteering(vehicle, targetAngle, urgency);
            }
            
            /**
             * Calculate throttle input to reach a target speed.
             * @param {TrafficVehicle} vehicle - The vehicle to control
             * @param {number} targetSpeed - Desired speed
             * @param {number} urgency - How aggressively to accelerate/brake (0.0-1.0)
             * @returns {number} Throttle input (-1 to 1)
             */
            static calculateThrottle(vehicle, targetSpeed, urgency = 0.5) {
                const currentSpeed = vehicle.speed || 0;
                const speedDiff = targetSpeed - currentSpeed;
                
                // Slowing while rolling forward: brake (vehicle.brake, px/tick²) to close the gap to the
                // target over about two ticks — no dead zone, so a car told to stop actually stops
                if (currentSpeed > 0.05 && (speedDiff < -0.3 || (targetSpeed < 0.5 && speedDiff < -0.05))) {
                    const b = vehicle.brake || 0.3;
                    return Math.max(-1, Math.min(-0.12, speedDiff / (b * 2)));
                }
                
                // Calculate throttle based on speed difference
                if (speedDiff > 0.5) {
                    // Need to accelerate - more aggressive acceleration
                    const accelInput = Math.min(1, speedDiff * 0.5 * (0.5 + urgency));
                    return accelInput;
                } else if (speedDiff < -0.5) {
                    // Need to brake/slow down - more aggressive braking
                    const brakeInput = Math.max(-1, speedDiff * 0.4 * (0.5 + urgency));
                    return brakeInput;
                }
                
                // Close to target speed, maintain
                return speedDiff * 0.2;
            }
            
            /**
             * Calculate a look-ahead target point on a lane.
             * @param {TrafficVehicle} vehicle - The vehicle
             * @param {Object} lane - The lane to follow
             * @param {number} lookAhead - How far ahead to look (in pixels)
             * @returns {{x: number, y: number, angle: number}} Target point and tangent angle
             */
            static getLaneTarget(vehicle, lane, lookAhead = 60) {
                if (!lane) return null;
                
                // Find current position along lane
                const dx = vehicle.x - lane.start.x;
                const dy = vehicle.y - lane.start.y;
                const currentDist = dx * lane.ux + dy * lane.uy;
                
                // Calculate look-ahead distance based on speed
                const speedMod = Math.max(1, Math.abs(vehicle.speed) * 0.8);
                const adjustedLookAhead = lookAhead * speedMod;
                
                // Get target point ahead on lane
                const targetDist = Math.min(currentDist + adjustedLookAhead, lane.length);
                const t = targetDist / lane.length;
                const point = lane.getPoint(t);
                
                return {
                    x: point.x,
                    y: point.y,
                    angle: lane.angle,
                    distanceAlong: currentDist,
                    laneLength: lane.length
                };
            }
            
            
            /**
             * Calculate appropriate speed for a turn based on curvature.
             * @param {TrafficVehicle} vehicle - The vehicle
             * @param {number} angleDiff - How much the vehicle needs to turn (radians)
             * @param {number} distance - Distance over which the turn occurs
             * @returns {number} Recommended maximum speed
             */
            static calculateTurnSpeed(vehicle, angleDiff, distance) {
                const absDiff = Math.abs(angleDiff);
                
                if (absDiff > Math.PI / 2) {
                    return vehicle.maxSpeed * CONFIG.VEHICLE_AI.TURN_SPEED_SHARP;
                } else if (absDiff > Math.PI / 4) {
                    return vehicle.maxSpeed * CONFIG.VEHICLE_AI.TURN_SPEED_MEDIUM;
                } else if (absDiff > Math.PI / 8) {
                    return vehicle.maxSpeed * CONFIG.VEHICLE_AI.TURN_SPEED_GENTLE;
                }
                
                return vehicle.maxSpeed;
            }
            
            /**
             * Project a vehicle's position onto a turn path curve.
             * Returns the nearest t parameter (0-1) on the curve.
             */
            static projectOntoCurve(vehicle, turnPath, hintT = 0.5) {
                const scanStart = Math.max(0, hintT - 0.3);
                const scanEnd = Math.min(1, hintT + 0.3);
                let bestT = hintT;
                let bestDist = Infinity;
                const steps = 24;
                for (let i = 0; i <= steps; i++) {
                    const t = scanStart + (scanEnd - scanStart) * (i / steps);
                    const p = turnPath.getPoint(t);
                    const d = Math.hypot(vehicle.x - p.x, vehicle.y - p.y);
                    if (d < bestDist) { bestDist = d; bestT = t; }
                }
                let lo = Math.max(0, bestT - (scanEnd - scanStart) / steps);
                let hi = Math.min(1, bestT + (scanEnd - scanStart) / steps);
                for (let iter = 0; iter < 10; iter++) {
                    const m1 = lo + (hi - lo) / 3;
                    const m2 = hi - (hi - lo) / 3;
                    const p1 = turnPath.getPoint(m1);
                    const p2 = turnPath.getPoint(m2);
                    const d1 = Math.hypot(vehicle.x - p1.x, vehicle.y - p1.y);
                    const d2 = Math.hypot(vehicle.x - p2.x, vehicle.y - p2.y);
                    if (d1 < d2) hi = m2; else lo = m1;
                }
                const finalT = (lo + hi) / 2;
                const finalP = turnPath.getPoint(finalT);
                return {
                    t: finalT,
                    dist: Math.hypot(vehicle.x - finalP.x, vehicle.y - finalP.y),
                    point: finalP
                };
            }
            
            /**
             * Estimate curvature (sharpness) of a turn path.
             * Returns total absolute angle change across the curve.
             */
            static getCurvature(turnPath) {
                let totalAngleChange = 0;
                const samples = 8;
                let prevAngle = turnPath.getAngle(0);
                for (let i = 1; i <= samples; i++) {
                    const t = i / samples;
                    const angle = turnPath.getAngle(t);
                    totalAngleChange += Math.abs(normalizeAngle(angle - prevAngle));
                    prevAngle = angle;
                }
                return totalAngleChange;
            }
            
            /**
             * Calculate lateral offset from lane center.
             * Useful for lane correction.
             * @param {TrafficVehicle} vehicle - The vehicle
             * @param {Object} lane - The lane
             * @returns {number} Lateral offset (positive = right of lane, negative = left)
             */
            static getLateralOffset(vehicle, lane) {
                if (!lane) return 0;
                
                const dx = vehicle.x - lane.start.x;
                const dy = vehicle.y - lane.start.y;
                
                // Perpendicular direction (right of lane direction)
                const perpX = -lane.uy;
                const perpY = lane.ux;
                
                return dx * perpX + dy * perpY;
            }
        }

