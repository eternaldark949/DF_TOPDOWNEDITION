        // GameEngine — Cars: getting in and out, which car is hers, and where each one is while she isn't
        // in it. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Three kinds of car, by what they are to her (carKind):
        //   own         her garage car (ownedCar). Parked wherever she leaves it.
        //   sanctioned  Amber's delivery van (deliveryVehicle): hers to use on the job, never stolen. Parked
        //               wherever she leaves it; back by the cafe when Barista Ren hands her a new job.
        //   hijacked    anything she takes off the street (a Zib cab too).
        // `car` is the one she's in, or the last one she got out of: her linked car. Getting out leaves the
        // lights on and lets it roll to a stop, where it parks itself (TrafficVehicle.updateManualDriving) so
        // traffic steers round it. A hijacked car stays linked until she takes another; then it goes back to
        // traffic, lights still on, and taking it again is a hijack.
        // Cars live on the hub. Any other map puts every one of them away (hidden, out of collision), and the
        // hub brings them back where she left them (_placeCarsForMap, from _doLoadMap).
        // The markers over her cars and the compass round her are engine/markers.js.

        const CAR_START = { x: 580, y: 640, angle: Math.PI };     // where her car waits in a new game

        engineMixin({
            /** What a car is to her: 'own', 'sanctioned' (Amber's van) or 'hijacked'; null for no car */
            carKind(v) {
                if (!v) return null;
                if (v === this.ownedCar || v.isOwnedCar) return 'own';
                return v.isDeliveryVehicle ? 'sanctioned' : 'hijacked';
            },

            /** Her cars on this map that she isn't in (the owned car, Amber's van, her linked car), into `out` */
            parkedCars(out = []) {
                out.length = 0;
                for (const c of [this.ownedCar, this.deliveryVehicle, this.car]) {
                    if (c && c.visible && !c.dead && !out.includes(c) && !(this.isDriving && c === this.car)) out.push(c);
                }
                return out;
            },

            /** Her garage car built new (another model from the garage, or a load): it stands where the old one
             *  stood, and the old one is gone for good, not left behind as an invisible wall */
            _replaceOwnedCar(brand, model) {
                const old = this.ownedCar, c = new TrafficVehicle(null, brand, model, 'PLAYER');
                c.isOwnedCar = true;
                if (old) {
                    Object.assign(c, { x: old.x, y: old.y, angle: old.angle, visible: old.visible, active: old.active, lampsOn: old.lampsOn });
                    old.visible = false; old.destroy();
                    if (this.car === old) this.car = c;
                }
                this.ownedCar = c;
                this.garage.applyToVehicle(c);
                return c;
            },

            /** Make `target` her linked car. A hijacked one she had goes back to traffic; hers stay where they are. */
            _switchCar(target) {
                const old = this.car;
                if (old === target) return;
                if (old && this.carKind(old) === 'hijacked' && old.visible && !old.dead && this.traffic && !this.traffic.vehicles.includes(old)) {
                    this.traffic.vehicles.push(old);
                }
                this.car = target;
            },

            /** She's out: nobody at the wheel, the lights left on, and it rolls on to a stop and parks */
            _leaveCar(c) {
                if (!c) return;
                if (c.controlMode === 'AI' && c.disableAutoDrive) c.disableAutoDrive();
                c.controlMode = 'PLAYER';
                c.hasDriver = false; c.driverType = null; c.alliance = null;
                c.handbrake = false; c.lampsOn = true;
                if (c.clearSeats) c.clearSeats();
            },

            /** The driving buttons go, the on-foot ones come back */
            _onFootButtons() {
                this.autodriveBtn.style.display = 'none';
                this.autodriveBtn.classList.remove('engaged');
                if (this.handbrakeBtn) { this.handbrakeBtn.style.display = 'none'; this.handbrakeBtn.classList.remove('held'); }
                this.handbrakeHeld = false;
                this.holsterBtn.style.display = 'flex'; { const sb = document.getElementById('btn-sneak'); if (sb) sb.style.display = 'flex'; }
                this.fireBtn.style.display = this.weaponHolstered ? 'none' : 'flex';
                this.emoteBtn.style.display = this.weaponHolstered ? 'flex' : 'none';
            },

            /** Get into one of hers: the owned car, Amber's van, or her linked car (`hijackVehicle` takes a stranger's) */
            enterCar(target) {
                if (this.isDriving || !target || !target.visible || target.dead) return;
                if (this.activeMap.type === 'indoor') { showMessage("CANNOT USE VEHICLE INDOORS."); return; }
                const back = target !== this.car, kind = this.carKind(target);
                this._switchCar(target);
                if (back && kind === 'own') showMessage(`WELCOME BACK TO ${this.garage.getDisplayName(this.garage.activeIndex).toUpperCase()}. YOUR RIDE.`);
                else if (back && kind === 'sanctioned') showMessage('AMBER DELIVERY VEHICLE — DRIVE CAREFULLY.');
                this.toggleVehicle();
                if (kind === 'sanctioned' && this.isDriving) this.pickUpPackage(true);   // a delivery waiting by the van goes in with her
            },

            /** Take a stranger's car off the street (a Zib cab too); whoever was at the wheel is put out, and a ganger
             *  driver (one car in five, TrafficVehicle) comes out hostile */
            hijackVehicle(target) {
                if (!target || this.isDriving) return;
                if (target === this.car || this.carKind(target) !== 'hijacked') { this.enterCar(target); return; }
                const occupied = target.hasDriver;                   // (an empty car, say one she left before, has nobody to put out)
                const ganger = occupied && target.driverType === 'ganger';   // one car in five on the street has a ganger at the wheel
                if (target.controlMode === 'AI' && target.disableAutoDrive) target.disableAutoDrive();   // off its lane and out of any junction it held
                this._switchCar(target);
                if (target.isZib) {
                    // Off the taxi rank for good: the player takes full control
                    target.isZib = false;
                    const zibIdx = this.zibSystem.activeZibs.indexOf(target);
                    if (zibIdx > -1) this.zibSystem.activeZibs.splice(zibIdx, 1);
                    showMessage(`ZIB TAXI HIJACKED. IT'S YOURS NOW.`);
                } else if (ganger) {
                    // thrown out of their own car, they come up fighting
                    this.enemies.push(new Ganger(target.x - 30, target.y + 30));
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED! DRIVER HOSTILE!`);
                } else {
                    showMessage(`${target.brand.toUpperCase()} ${target.modelName.toUpperCase()} HIJACKED.`);
                }
                this.toggleVehicle();
            },

            /** In or out of her linked car (`car`): the pill's Exit, E, a walk to the door arriving, a load */
            toggleVehicle() {
                if (this.activeMap.type === 'indoor') { showMessage("CANNOT USE VEHICLE INDOORS."); return; }

                // Zib passenger exit — charge partial fare and exit cleanly
                if (this.isDriving && this.zibSystem && this.zibSystem.isPassenger) {
                    this.zibSystem.exitEarly(this);
                    this.setInteract('Drive', 'Car');
                    return;
                }

                if (this.isDriving) {
                    // --- EXITING VEHICLE ---
                    this.isDriving = false;
                    this.player.visible = true;
                    this._leaveCar(this.car);

                    // Cat exits with player
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.inCar = false;
                        this.velvetCat.visible = true;
                    }
                    this._onFootButtons();

                    // --- SIDE EXIT STRATEGY ---
                    const exitDist = this.car.width / 2 + 25;
                    const cos = Math.cos(this.car.angle);
                    const sin = Math.sin(this.car.angle);

                    const leftX = this.car.x + (Math.sin(this.car.angle) * exitDist);
                    const leftY = this.car.y - (Math.cos(this.car.angle) * exitDist);
                    const rightX = this.car.x - (Math.sin(this.car.angle) * exitDist);
                    const rightY = this.car.y + (Math.cos(this.car.angle) * exitDist);

                    const isBlocked = (x, y) => {
                        for(let w of this.activeMap.walls) {
                            if(x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
                        }
                        const colliders = getColliders(this.activeMap);
                        if (colliders) {
                            for(let b of colliders) {
                                if(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
                            }
                        }
                        return false;
                    };

                    const leftBlocked = isBlocked(leftX, leftY);
                    const rightBlocked = isBlocked(rightX, rightY);

                    let useLeft = !leftBlocked;
                    let useRight = !rightBlocked;

                    if (leftBlocked && rightBlocked) {
                        this.player.x = this.car.x;
                        this.player.y = this.car.y;
                    } else {
                        const passengers = this.teammates.filter(t => t.inCar);

                        if (useLeft) { this.player.x = leftX; this.player.y = leftY; }
                        else { this.player.x = rightX; this.player.y = rightY; }

                        passengers.forEach((p, i) => {
                            p.inCar = false;
                            p.seatIndex = -1;
                            const offset = (Math.floor(i/2) + 1) * 20 * (i % 2 === 0 ? -1 : 1);
                            const offsetX = cos * offset;
                            const offsetY = sin * offset;
                            let targetX, targetY;

                            if (useLeft && useRight) { targetX = rightX + offsetX; targetY = rightY + offsetY; }
                            else if (useLeft) { targetX = leftX + offsetX; targetY = leftY + offsetY; }
                            else { targetX = rightX + offsetX; targetY = rightY + offsetY; }

                            p.x = targetX; p.y = targetY;
                        });
                    }

                    // Position cat near player on exit
                    if (this.velvetCat && this.questState.hasVelvetCat) {
                        this.velvetCat.x = this.player.x - 25;
                        this.velvetCat.y = this.player.y + 20;
                    }

                    // Reset animation state to prevent limb splay from position jump
                    resetHumanoidAnim(this.player);
                    this.teammates.forEach(t => { if (!t.inCar) resetHumanoidAnim(t); });

                    this.setInteract('Drive', 'Car');
                } else {
                    // --- ENTERING VEHICLE ---
                    const c = this.car;
                    if (!c || !c.visible || c.dead) return;         // nothing here to get into (cars live on the hub)
                    this.isDriving = true;

                    // CHANGED: Player remains visible to render the "Lean Out" animation
                    this.player.visible = true;

                    c.hasDriver = true; c.driverType = 'player'; c.controlMode = 'PLAYER';
                    c.alliance = 'friendly'; // Prevent friendly projectile collisions
                    c.fading = false; c.fade = 1;

                    // Set map bounds for boundary clamping
                    c._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };

                    // Out of traffic's hands (hers never are; one just taken off the street is)
                    const idx = this.traffic.vehicles.indexOf(c);
                    if (idx > -1) this.traffic.vehicles.splice(idx, 1);

                    this.autodriveBtn.style.display = 'flex';
                    if (this.handbrakeBtn) this.handbrakeBtn.style.display = 'flex';
                    this.holsterBtn.style.display = 'none'; { const sb = document.getElementById('btn-sneak'); if (sb) sb.style.display = 'none'; }
                    this.fireBtn.style.display = 'flex';
                    this.emoteBtn.style.display = 'none';
                    this.setInteract('Exit', 'Vehicle');

                    // --- SEATING LOGIC (seat assignment system) ---
                    // Driver = seat 0 (player)
                    if (c.seatOccupants) {
                        c.clearSeats();
                        c.seatOccupants[0] = true; // Player is driver
                    }

                    this.teammates.forEach(tm => {
                        if(tm.recruited && !tm.downed && c.assignPassenger) {
                            c.assignPassenger(tm);
                        }
                    });

                    const totalWaiting = this.teammates.filter(t => t.recruited && !t.downed && !t.inCar).length;
                    if (totalWaiting > 0) {
                        showMessage("VEHICLE FULL. SOME FOLLOWERS LEFT BEHIND.");
                    }

                    // Cat rides along (doesn't take a seat)
                    if (this.velvetCat && this.questState.hasVelvetCat) this.velvetCat.inCar = true;
                }
            },

            // ── Across maps ──

            /** Amber's van, parked beside the Cozy Cafe's door. That spot is its home: a new job finds it there. */
            _spawnDeliveryVan() {
                const cafe = this.landmarkRegistry && this.landmarkRegistry['cozy_cafe'];
                if (!cafe) return null;
                const van = new TrafficVehicle(null, 'LADY', 'suv2', 'PARKED');
                van.color = '#58391C';                 // amber-brown body
                van.glowColor = '#a469ff';             // violet underglow
                van.headlightColor = '#a469ff';        // violet headlights
                van.isDeliveryVehicle = true;
                van.hasDriver = false;
                van.home = { x: cafe.x - 80, y: cafe.y + 20, angle: Math.PI / 2 };   // to the side of the door, facing south
                Object.assign(van, van.home);
                return (this.deliveryVehicle = van);
            },

            /** A new delivery job: Amber's people bring the van back by the cafe, unless she's driving it */
            returnVanHome() {
                const van = this.deliveryVehicle;
                if (!van || !van.home || (this.isDriving && this.car === van)) return;
                Object.assign(van, van.home, { vx: 0, vy: 0, speed: 0, controlMode: 'PARKED' });
            },

            /** On this map or put away: shown and solid, or hidden and out of collision */
            _setCarHere(c, here) {
                c.visible = c.active = here;
                if (!here) return;
                c.markedForDestroy = false; c.dead = false;
                c.reregister();
                c._mapBounds = { w: this.activeMap.width, h: this.activeMap.height };
            },

            /** Out of the car where it stands, everyone with her (the map changing under her while driving, a new game) */
            _endDrive() {
                if (!this.isDriving) return;
                this.isDriving = false;
                this._leaveCar(this.car);
                for (const t of this.teammates) if (t.inCar) { t.inCar = false; t.seatIndex = -1; }
                if (this.velvetCat) this.velvetCat.inCar = false;
                this._onFootButtons();
            },

            /** A map has loaded (from _doLoadMap): she's on foot. On the hub every car of hers stands where she left
             *  it, at rest (Amber's van appears at the cafe the first time); anywhere else they're all put away, so
             *  none is drawn, bumped into or offered to her. */
            _placeCarsForMap() {
                this._endDrive();
                this.player.visible = true;
                const hub = this.activeMap.id === 'hub_949';
                if (hub && !this.deliveryVehicle) this._spawnDeliveryVan();
                for (const c of [this.ownedCar, this.deliveryVehicle, this.car]) {
                    if (!c) continue;
                    c.hasDriver = false; c.controlMode = 'PARKED'; c.speed = 0; c.vx = 0; c.vy = 0;
                    this._setCarHere(c, hub);
                }
            },
        });
