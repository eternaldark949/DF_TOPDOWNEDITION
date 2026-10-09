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
        // Markers (drawCarMarkers, after the light so the night can't swallow them): MapIcons pins over her car
        // and Amber's van, held at the screen's edge with the distance while they're off it, and the job's
        // objective the same way. They replace the old in-world YOUR CAR / AMBER DELIVERY labels and the
        // mission's edge arrow.

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
            },

            /** Take a stranger's car off the street (a Zib cab too); whoever was at the wheel is put out */
            hijackVehicle(target) {
                if (!target || this.isDriving) return;
                if (target === this.car || this.carKind(target) !== 'hijacked') { this.enterCar(target); return; }
                const occupied = target.hasDriver;                   // (an empty car, say one she left before, has nobody to put out)
                if (target.controlMode === 'AI' && target.disableAutoDrive) target.disableAutoDrive();   // off its lane and out of any junction it held
                this._switchCar(target);
                if (target.isZib) {
                    // Off the taxi rank for good: the player takes full control
                    target.isZib = false;
                    const zibIdx = this.zibSystem.activeZibs.indexOf(target);
                    if (zibIdx > -1) this.zibSystem.activeZibs.splice(zibIdx, 1);
                    showMessage(`ZIB TAXI HIJACKED. IT'S YOURS NOW.`);
                } else if (occupied && target.brand === 'Gelfash' && Math.random() < 0.2) {
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

            // ── Markers ──

            /**
             * Where her cars and the job are (the HUD stage, after the light, at fixed CSS sizes). On screen, a
             * MapIcons pin over each car with its name (crimson hers, amber the van), fading out as she comes within
             * reach (the Drive pill takes over). Off screen, held at the edge with a chevron and the distance: her
             * car only on foot (driving, the ride tag points to it), the van only while she's to fetch it for a job,
             * the objective whenever she isn't there yet. The hub only (the cars and jobs are there); never in a
             * scene or special view.
             */
            drawCarMarkers(ctx) {
                const v = this.view, p = this.player;
                if (!this.running || !v || !p || !this.activeMap || this.activeMap.id !== 'hub_949' ||
                    (this.scenes && this.scenes.running) || (this.cutscene && this.cutscene.active) ||
                    this.cineCam || this.finisher || this.finCam || (this.bumperMinigame && this.bumperMinigame.active)) return;
                const m = this.missions && this.missions.activeMission, job = m && m.status === 'active' ? m : null;
                const fetchVan = !!(job && job.type === MISSION_TYPES.DELIVERY && !job.pickedUp && this.deliveryVehicle);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                if (job && !fetchVan && typeof job.targetX === 'number' &&
                    Math.hypot(job.targetX - p.x, job.targetY - p.y) >= (job.targetRadius || 80)) {
                    // (a delivery's drop-off has its own spinning cup on the ground: only the edge marker)
                    const label = job.type === MISSION_TYPES.DELIVERY ? 'DROP-OFF' : job.type === MISSION_TYPES.BOUNTY ? 'BOUNTY' : 'SALVAGE';
                    this._drawMarker(ctx, 'objective', job.targetX, job.targetY, 0, label, '255, 194, 72',
                        { onScreen: job.type !== MISSION_TYPES.DELIVERY, edge: true });
                }
                const van = this.deliveryVehicle;
                if (van && van.visible && !(this.isDriving && this.car === van)) {
                    this._drawMarker(ctx, 'amberPin:box', van.x, van.y, van.length, 'AMBER DELIVERY', '255, 159, 67',
                        { onScreen: true, edge: fetchVan, fadeNear: true });
                }
                const own = this.ownedCar;
                if (own && own.visible && !(this.isDriving && this.car === own)) {
                    this._drawMarker(ctx, 'pin:car', own.x, own.y, own.length, 'YOUR CAR', '255, 194, 72',
                        { onScreen: true, edge: !this.isDriving, fadeNear: true });
                }
                ctx.restore();
            },

            /** One marker: `kind` a MapIcons sprite (pins stand on their tip), over world (wx, wy), `size` the car's
             *  length (the pin clears its roof); `rgb` the label's rim. opts: { onScreen, edge, fadeNear }. Inside the
             *  ring it stands over the point; outside, it's on the ring with a chevron the way to go. */
            _drawMarker(ctx, kind, wx, wy, size, label, rgb, opts) {
                const v = this.view, p = this.player, s = this._renderScale || 1, z = v.zoom;
                const cw = this.canvas.width, ch = this.canvas.height, cx = cw / 2, cy = ch / 2;
                const sx = cx + (wx - v.x + (v.shakeX || 0)) * z, sy = cy + (wy - v.y + (v.shakeY || 0)) * z;
                if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
                const pin = /pin/i.test(kind), css = pin ? 28 : 24, head = css * s, d = Math.hypot(wx - p.x, wy - p.y);
                // The ring markers keep to: an ellipse inside the screen, clear of the HUD in its corners
                const rx = Math.max(40 * s, cx - 56 * s), ry = Math.max(40 * s, cy - 104 * s), dx = sx - cx, dy = sy - cy;
                const e = Math.hypot(dx / rx, dy / ry);
                let x, y, alpha = 1, edge = null;
                if (e <= 1) {
                    if (!opts.onScreen) return;
                    // fade in from just past the Drive pill's reach (80) to a car-length beyond it
                    if (opts.fadeNear) { const t = clamp((d - 90) / 80, 0, 1); alpha = t * t * (3 - 2 * t); }
                    if (alpha < 0.02) return;
                    x = sx; y = sy - (pin ? (size * 0.32 * z + 4 * s) : 0) + Math.sin(_frameTime / 450) * 2 * s;
                } else {
                    if (!opts.edge) return;
                    // on the ring, along the line from the screen's centre
                    x = cx + dx / e; y = cy + dy / e + (pin ? head * 0.5 : 0);
                    edge = Math.atan2(dy, dx); alpha = 0.92;
                }
                ctx.globalAlpha = alpha;
                MapIcons.draw(ctx, kind, x, y, { dpr: s, css });
                const hy = pin ? y - head * 0.62 : y;                   // the icon's head
                if (edge !== null) {
                    // a gold chevron outside the icon, pointing the way
                    const r = head * 0.78, ux = Math.cos(edge), uy = Math.sin(edge), tx = x + ux * r, ty = hy + uy * r, w = 4.5 * s;
                    ctx.fillStyle = '#ffc248';
                    ctx.beginPath();
                    ctx.moveTo(tx + ux * w, ty + uy * w);
                    ctx.lineTo(tx - ux * w * 0.6 - uy * w, ty - uy * w * 0.6 + ux * w);
                    ctx.lineTo(tx - ux * w * 0.6 + uy * w, ty - uy * w * 0.6 - ux * w);
                    ctx.closePath(); ctx.fill();
                    label += ' · ' + Math.round(d / 10) * 10 + 'm';
                }
                // the label in the ride tag's capsule: ink to violet, a hairline rim, cream caps
                ctx.font = `600 ${9 * s}px Montserrat, sans-serif`;
                if ('letterSpacing' in ctx) ctx.letterSpacing = `${2 * s}px`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const tw = ctx.measureText(label).width + 14 * s, th = 15 * s;
                const below = edge !== null && hy < cy;                 // high on the ring, under the icon; else over it
                const ly = below ? (pin ? y : hy + head * 0.5) + th * 0.5 + 4 * s : hy - head * 0.55 - th * 0.5 - 2 * s;
                ctx.fillStyle = 'rgba(12, 4, 24, 0.68)'; ctx.strokeStyle = `rgba(${rgb}, 0.55)`; ctx.lineWidth = Math.max(1, s);
                ctx.beginPath(); ctx.roundRect(x - tw / 2, ly - th / 2, tw, th, th / 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#f3e4c6';
                ctx.fillText(label, x + s, ly + 0.5 * s);
                if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
                ctx.globalAlpha = 1;
            },
        });
