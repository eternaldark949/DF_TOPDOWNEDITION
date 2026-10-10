        /* --- UNIFIED TRAFFIC VEHICLE CLASS --- */
        /* Supports AI driving, manual player control, and brand-specific visuals */
        /* --- UNIFIED TRAFFIC VEHICLE CLASS --- */
        /* --- UNIFIED TRAFFIC VEHICLE CLASS (With Skids & Debris) --- */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                     TRAFFIC SYSTEM                                ║
        // ╚══════════════════════════════════════════════════════════════════╝
        class TrafficVehicle extends VehicleEntity {
            constructor(lane, brand = null, model = null, controlMode = 'AI', along = null) {
                // --- RESOLVE BRAND/MODEL BEFORE SUPER ---
                // Must resolve these first since dimensions come from model data
                const resolvedBrand = brand || TrafficVehicle._selectRandomBrand();
                const resolvedModel = model || TrafficVehicle._selectRandomModel(resolvedBrand);
                const brandData = VEHICLE_BRANDS[resolvedBrand];
                const modelData = brandData.models[resolvedModel];
                
                // Get dimensions from model data
                const vehicleLength = modelData.length;
                const vehicleWidth = modelData.width;
                
                // Calculate starting position - offset by 2 car lengths to avoid wall spawns
                let startX = 0, startY = 0, startAngle = 0;
                if (lane) {
                    const spawnOffset = along ?? vehicleLength * 2; // 2 car lengths into the lane, unless told where (TrafficManager)
                    startX = lane.start.x + Math.cos(lane.angle) * spawnOffset;
                    startY = lane.start.y + Math.sin(lane.angle) * spawnOffset;
                    startAngle = lane.angle;
                }
                
                // --- CALL PARENT CONSTRUCTOR ---
                super({
                    type: 'trafficvehicle',
                    x: startX,
                    y: startY,
                    angle: startAngle,
                    length: vehicleLength,
                    width: vehicleWidth,
                    mass: modelData.mass || brandData.baseStats.mass || 1200,
                    friction: brandData.baseStats.friction || 0.96
                });
                
                // --- VEHICLE IDENTITY ---
                this.brand = resolvedBrand;
                this.model = resolvedModel;
                this.modelName = modelData.name;
                this.noHearseCap = modelData.noHearseCap || false;
                
                // --- CONTROL MODE ---
                this.controlMode = controlMode; // 'AI', 'PLAYER', 'PARKED'
                
                // --- RESOLVE REMAINING STATS ---
                // Note: length/width already set by super, but we override width here
                // TrafficVehicle uses this.width for vehicle's physical width (shorter dimension)
                this.length = vehicleLength;
                this.width = vehicleWidth;  // Override for backward compatibility with draw()
                this.maxSpeed = brandData.baseStats.maxSpeed * modelData.speedMod + (Math.random() * 1 - 0.5);
                this.acceleration = brandData.baseStats.acceleration;
                this.handling = brandData.baseStats.handling;
                this.brake = brandData.baseStats.brake || 0.3;        // px/tick² at full brake
                this.drive = brandData.drive || CONFIG.VEHICLE_DRIVE.DEFAULT_FEEL;   // handling character
                this.seats = modelData.seats || brandData.baseStats.seats || 4;
                this.seatLayout = TrafficVehicle.generateSeatLayout(this.seats, this.length, this.width);
                this.seatOccupants = new Array(this.seats).fill(null); // Entity refs per seat
                this.visualStyle = brandData.visualStyle;
                this.glowColor = brandData.glowColor;
                this.headlightColor = brandData.headlightColor || '#ffffaa';
                this.color = brandData.colors[Math.floor(Math.random() * brandData.colors.length)];
                
                // --- POSITION ---
                this.currentLane = lane;
                this.currentTurnPath = null;   
                this.turnProgress = 0;         
                
                this.turnSignal = null; 
                this.turnSignalTimer = 0;
                this.plannedTurn = null; 
                
                // --- DRIVER ---
                if (controlMode === 'PLAYER') {
                    this.driverType = 'player';
                    this.turnProbability = 0;
                } else {
                    this.driverType = Math.random() < 0.2 ? 'ganger' : 'civilian';
                    this.turnProbability = this.driverType === 'ganger' ? 0.8 : 0.3;
                    
                    if (this.driverType === 'ganger') {
                        this.color = '#550000'; 
                        this.maxSpeed += 2; 
                    }
                }
                // How it treats people in the road (traffic/traffic-people.js): the gangers push; a third of the rest are in no hurry
                this.temper = this.driverType === 'ganger' ? 'pushy' : Math.random() < 0.35 ? 'calm' : 'normal';
                
                this.state = 'DRIVING'; 
                this.stateTimer = 0;
                this.stuckTimer = 0; 
                
                // Light Aggressive Mode
                this.idleTimer = 0;            
                this.isLightAggressive = false; 
                this.lightAggressiveDuration = 0; 
                
                // Lane switching state
                this.laneChangeState = 'NONE'; 
                this.targetLane = null;
                this.laneChangeProgress = 0;
                this.originalLane = null; 
                
                // Intersection queue management
                this.currentIntersection = null; 
                this.hasIntersectionAccess = false; 
                this.wasInIntersection = false; 
                this.intersectionTimer = 0; 
                this.isAggressive = false; // Red Mode
                this.isWaiting = false;    // Orange Mode
                
                // --- INTERSECTION DEADLOCK RECOVERY ---
                // Tracks "physically pinned against another vehicle in turn" state.
                // _stuckContactFrames accumulates while in contact; once it exceeds
                // a threshold, _stuckRecovery counts down a brief reverse maneuver.
                this._stuckContactFrames = 0;
                this._stuckRecovery = 0;
                
                this.postIntersectionGraceTimer = 0;
        
                this.isDriving = true;
                this.prevX = this.x;
                this.prevY = this.y;
                
                // --- MANUAL DRIVING STATE ---
                this.manualGas = 0;
                this.manualTurn = 0;
                
                // --- PARK IDLE TIMER ---
                this.parkIdleTimer = 0; 
                
                // --- DRIVER STATE ---
                this.hasDriver = (controlMode === 'AI'); 
            }
            
            // Static helper methods for brand/model selection (called before super)
            static _selectRandomBrand() {
                const rand = Math.random();
                let cumulative = 0;
                for (let brand in VEHICLE_SPAWN_WEIGHTS) {
                    cumulative += VEHICLE_SPAWN_WEIGHTS[brand];
                    if (rand < cumulative) return brand;
                }
                return 'Gelfash';
            }
            
            static _selectRandomModel(brand) {
                const availableModels = Object.keys(VEHICLE_BRANDS[brand].models);
                let validWeights = {};
                let totalWeight = 0;
                
                for (let m of availableModels) {
                    const weight = VEHICLE_MODEL_WEIGHTS[m] || 0.1; 
                    validWeights[m] = weight;
                    totalWeight += weight;
                }
                
                const rand = Math.random() * totalWeight;
                let cumulative = 0;
                
                for (let m in validWeights) {
                    cumulative += validWeights[m];
                    if (rand < cumulative) return m;
                }
                return availableModels[0];
            }
            
            // Legacy instance methods (for compatibility)
            selectRandomBrand() {
                return TrafficVehicle._selectRandomBrand();
            }
            
            selectRandomModel() {
                return TrafficVehicle._selectRandomModel(this.brand);
            }
            
            /**
             * Override getOBB to use TrafficVehicle's width (physical vehicle width)
             */
            getOBB() {
                return {
                    x: this.x,
                    y: this.y,
                    length: this.length,
                    width: this.width,  // Use TrafficVehicle's width property
                    angle: this.angle || 0,
                    mass: this.mass,
                    speed: this.speed,
                    vx: this.vx || 0,
                    vy: this.vy || 0
                };
            }
            
            /**
             * Override getBoundingBox for spatial grid using actual vehicle dimensions
             */
            getBoundingBox() {
                // Use the diagonal to account for any rotation
                const maxDim = Math.hypot(this.length, this.width);
                return {
                    x: this.x - maxDim / 2,
                    y: this.y - maxDim / 2,
                    w: maxDim,
                    h: maxDim
                };
            }
        
            // --- VISUALS ---
            draw(ctx) {
                if (!this.visible) return;
                const farLOD = this._lod === 1; // Skip expensive effects when distant
                
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
                
                // Status Shadows (AI state: red pushing through, orange waiting at a box, yellow nudging) —
                // a debug view now that queues are real; underglow and the rest stay
                if (!farLOD) {
                    const showState = typeof game !== 'undefined' && game.dbg && game.dbg('traffic');
                    if (!showState) { /* no state halos */ }
                    else if (this.isAggressive) {
                        const pulse = (Math.sin(_frameTime / 150) + 1) / 2; 
                        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20 + (pulse * 10); 
                        ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + pulse * 0.2})`; 
                        ctx.beginPath(); ctx.rect(-this.length/2 - 5, -this.width/2 - 5, this.length + 10, this.width + 10); ctx.fill(); ctx.shadowBlur = 0;
                    } 
                    else if (this.isWaiting) {
                        const pulse = (Math.sin(_frameTime / 300) + 1) / 2; 
                        ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 15 + (pulse * 10); 
                        ctx.fillStyle = `rgba(255, 170, 0, ${0.2 + pulse * 0.2})`; 
                        ctx.beginPath(); ctx.rect(-this.length/2 - 5, -this.width/2 - 5, this.length + 10, this.width + 10); ctx.fill(); ctx.shadowBlur = 0;
                    }
                    else if (this.isLightAggressive) {
                        const pulse = (Math.sin(_frameTime / 100) + 1) / 2;
                        ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 15 + (pulse * 10); 
                        ctx.fillStyle = `rgba(255, 255, 0, ${0.2 + pulse * 0.2})`; 
                        ctx.beginPath(); ctx.rect(-this.length/2 - 5, -this.width/2 - 5, this.length + 10, this.width + 10); ctx.fill(); ctx.shadowBlur = 0;
                    }
                    
                    // Brand underglow (traffic/car-art.js)
                    drawCarUnderglow(ctx, this);
                }
                
                // The body: painted once per look, light sliding over it (traffic/car-art.js).
                // The car you're driving is drawn once, over its occupants (drawOccupantOverlay).
                if (!(typeof game !== 'undefined' && game.isDriving && game.car === this && this.hasDriver)) {
                    drawCarBody(ctx, this, farLOD);
                    this.drawLights(ctx, farLOD);
                }
                
                ctx.restore();
            }
        
            /**
             * Unified light renderer — turn signals, brake/tail lights, headlights.
             * Single callable function used by both draw() and drawOccupantOverlay().
             * @param {CanvasRenderingContext2D} ctx - Already translated/rotated to vehicle center
             * @param {boolean} farLOD - Skip expensive shadow effects when distant
             */
            drawLights(ctx, farLOD) { drawCarLamps(ctx, this, farLOD); }
        
            // --- DRAW HELPERS (the bodies themselves: traffic/car-art.js) ---
            hexToRgb(hex) { const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 255, 255'; }
            darkenColor(hex, amount) { return darkenHex(hex, Math.floor(255 * amount)); }
            /**
             * Draw car body overlay on top of occupants.
             * Creates the illusion of characters being INSIDE the car.
             * Redraws the car body, lights, and turn signals over occupants.
             */
            // ── SEAT LAYOUT SYSTEM ──
            // Generates local-space seat positions and firing arcs.
            // Seat 0 = driver (front-left). Right side = positive localY.
            // Each seat has a 180° firing arc on its side of the car.
            static generateSeatLayout(seatCount, vehicleLength, vehicleWidth) {
                const seats = [];
                const hw = vehicleWidth / 2;
                const hl = vehicleLength / 2;

                // Side offsets (local Y) — use most of vehicle width
                const leftY = -hw * 0.72;   // Driver side (left)
                const rightY = hw * 0.72;   // Passenger side (right)

                // Row positions (local X, forward is positive)
                // Spread rows across the usable cabin area (front 35% to rear 40%)
                const rowCount = Math.ceil(seatCount / 2);
                const rows = [];
                const frontLimit = hl * 0.35;   // Front row position
                const rearLimit = -hl * 0.40;   // Rear row position
                
                if (rowCount === 1) {
                    rows.push(frontLimit);
                } else {
                    for (let r = 0; r < rowCount; r++) {
                        rows.push(frontLimit - (r / (rowCount - 1)) * (frontLimit - rearLimit));
                    }
                }

                // Fill seats: 2 per row (left then right), front to back
                let seatsFilled = 0;
                for (let r = 0; r < rows.length && seatsFilled < seatCount; r++) {
                    const rowX = rows[r];
                    const isFirstRow = (r === 0);
                    
                    // Left seat
                    if (seatsFilled < seatCount) {
                        seats.push({
                            localX: rowX,
                            localY: leftY,
                            side: 'left',
                            isDriver: isFirstRow && seatsFilled === 0,
                            fireAngle: Math.PI
                        });
                        seatsFilled++;
                    }
                    // Right seat
                    if (seatsFilled < seatCount) {
                        seats.push({
                            localX: rowX,
                            localY: rightY,
                            side: 'right',
                            isDriver: false,
                            fireAngle: 0
                        });
                        seatsFilled++;
                    }
                }

                return seats;
            }

            /**
             * Get the world position of a seat.
             * Transforms local seat coords by the vehicle's position + angle.
             */
            getSeatWorldPos(seatIndex) {
                const seat = this.seatLayout[seatIndex];
                if (!seat) return { x: this.x, y: this.y };
                const cos = Math.cos(this.angle);
                const sin = Math.sin(this.angle);
                return {
                    x: this.x + seat.localX * cos - seat.localY * sin,
                    y: this.y + seat.localX * sin + seat.localY * cos
                };
            }

            /**
             * Check if a world-space firing angle falls within a seat's valid 180° arc.
             * Left-side seats fire into the left hemisphere (relative to car forward).
             * Right-side seats fire into the right hemisphere.
             */
            isAngleValidForSeat(seatIndex, worldAngle) {
                const seat = this.seatLayout[seatIndex];
                if (!seat) return false;
                // Seat's outward-facing direction in world space
                const seatWorldAngle = this.angle + seat.fireAngle;
                // Angle difference between desired shot and seat's outward direction
                let diff = worldAngle - seatWorldAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                // Valid if within ±90° (half of 180° arc)
                return Math.abs(diff) <= Math.PI / 2;
            }

            /**
             * Assign an entity to a seat. Returns the seat index, or -1 if full.
             * Seat 0 (driver) is reserved — use assignDriver() for that.
             */
            assignPassenger(entity) {
                for (let i = 1; i < this.seatOccupants.length; i++) {
                    if (!this.seatOccupants[i]) {
                        this.seatOccupants[i] = entity;
                        entity.seatIndex = i;
                        entity.inCar = true;
                        return i;
                    }
                }
                return -1; // No seats available
            }

            /** Clear all seat assignments. */
            clearSeats() {
                for (let i = 0; i < this.seatOccupants.length; i++) {
                    const occ = this.seatOccupants[i];
                    if (occ && occ !== true) {
                        occ.seatIndex = -1;
                        occ.inCar = false;
                    }
                    this.seatOccupants[i] = null;
                }
            }

            drawOccupantOverlay(ctx) {
                if (!this.visible || !this.hasDriver) return;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                
                // Redraw the car body (same as in draw())
                drawCarBody(ctx, this, false);
                
                // Unified lights (same function as draw() — ensures headlight color consistency)
                this.drawLights(ctx, false);
                
                ctx.restore();
            }
        
            // --- NAVIGATION HELPERS ---
            getDistanceAlongLane() {
                if (!this.currentLane) return 0;
                const lane = this.currentLane;
                const dx = this.x - lane.start.x;
                const dy = this.y - lane.start.y;
                return Math.max(0, dx * lane.ux + dy * lane.uy);
            }
            
            // --- WAYPOINT NAVIGATION SYSTEM ---
            /**
             * Get the road the car is currently on (from its lane).
             * @returns {Object|null} The road object or null
             */
            getCurrentRoad() {
                return this.currentLane?.road || null;
            }
            
            /**
             * Get the road the navigation expects us to be on (from current waypoint).
             * @returns {Object|null} The expected road object or null
             */
            getExpectedNavRoad() {
                if (this.navWaypoints && this.navWaypoints.length > 0 && 
                    this.currentWaypointIndex < this.navWaypoints.length) {
                    const wp = this.navWaypoints[this.currentWaypointIndex];
                    // Check for lane/segment first (more precise)
                    if (wp.lane?.road) return wp.lane.road;
                    if (wp.segment?.road) return wp.segment.road;
                    // V1 fallback
                    return wp.road || null;
                }
                return null;
            }
            
            /**
             * Get the expected next segment from navigation (V2 only).
             * @returns {Segment|null} The expected next segment
             */
            getExpectedNavSegment() {
                if (this.navWaypoints && this.navWaypoints.length > 0) {
                    for (let i = this.currentWaypointIndex; i < this.navWaypoints.length; i++) {
                        const wp = this.navWaypoints[i];
                        if (wp.segment) return wp.segment;
                        if (wp.lane?.segment) return wp.lane.segment;
                    }
                }
                return null;
            }
            
            
            /**
             * Check if the car is on the correct road according to navigation.
             * @returns {boolean} True if on correct road or no navigation active
             */
            isOnExpectedRoad() {
                const currentRoad = this.getCurrentRoad();
                const expectedRoad = this.getExpectedNavRoad();
                
                // If no navigation or no expected road, consider it "on track"
                if (!expectedRoad) return true;
                if (!currentRoad) return false;
                
                return currentRoad === expectedRoad;
            }
            
            /**
             * Set navigation waypoints for the car to follow.
             * @param {Array} waypoints - Array of {x, y} points to follow
             */
            setNavWaypoints(waypoints) {
                // Expand curves into discrete points so car follows exact drawn path
                this.navWaypoints = this._expandCurveWaypoints(waypoints || []);
                this.currentWaypointIndex = 0;
                // Skip early waypoints that are behind the car
                this.advanceToRelevantWaypoint();
            }
            
            /**
             * Expand TURN_PATH waypoints with controlPoints into sampled curve points.
             * IMPORTANT: The original TURN_PATH waypoint is PRESERVED (pushed first)
             * so that updateTurnPlanning() can still find it by type. The sampled
             * CURVE_POINT waypoints follow it for positional tracking.
             */
            _expandCurveWaypoints(waypoints) {
                const expanded = [];
                
                for (let i = 0; i < waypoints.length; i++) {
                    const wp = waypoints[i];
                    
                    // Check if this is a curve waypoint
                    if (wp.type === 'TURN_PATH' && wp.controlPoints && wp.controlPoints.length >= 3) {
                        // ALWAYS keep the original TURN_PATH waypoint — updateTurnPlanning needs it
                        expanded.push(wp);
                        
                        const cp = wp.controlPoints;
                        const numSamples = 8;
                        
                        // Sample points along the bezier curve (skip t=0, it's the original wp position)
                        for (let s = 1; s <= numSamples; s++) {
                            const t = s / numSamples;
                            let point;
                            if (cp.length === 3) {
                                const mt = 1 - t;
                                point = {
                                    x: mt * mt * cp[0].x + 2 * mt * t * cp[1].x + t * t * cp[2].x,
                                    y: mt * mt * cp[0].y + 2 * mt * t * cp[1].y + t * t * cp[2].y,
                                    type: 'CURVE_POINT',
                                    turnPath: wp.turnPath,
                                    turnPathId: wp.turnPathId,
                                    road: wp.road,
                                    roadId: wp.roadId,
                                    segment: wp.segment,
                                    segmentId: wp.segmentId
                                };
                            } else if (cp.length === 4) {
                                const mt = 1 - t;
                                point = {
                                    x: mt*mt*mt*cp[0].x + 3*mt*mt*t*cp[1].x + 3*mt*t*t*cp[2].x + t*t*t*cp[3].x,
                                    y: mt*mt*mt*cp[0].y + 3*mt*mt*t*cp[1].y + 3*mt*t*t*cp[2].y + t*t*t*cp[3].y,
                                    type: 'CURVE_POINT',
                                    turnPath: wp.turnPath,
                                    turnPathId: wp.turnPathId,
                                    road: wp.road,
                                    roadId: wp.roadId,
                                    segment: wp.segment,
                                    segmentId: wp.segmentId
                                };
                            }
                            
                            if (point) {
                                const lastPoint = expanded[expanded.length - 1];
                                if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 5) {
                                    expanded.push(point);
                                }
                            }
                        }
                    } else {
                        // Regular waypoint - just add it
                        expanded.push(wp);
                    }
                }
                
                return expanded;
            }
            
            /**
             * Clear navigation waypoints.
             */
            clearNavWaypoints() {
                this.navWaypoints = [];
                this.currentWaypointIndex = 0;
                this.navDestination = null;
                this._driveRoute = null;
            }
            
            /**
             * Advance waypoint index if we've passed waypoints.
             * Skip waypoints that are behind us or very close.
             */
            advanceToRelevantWaypoint() {
                if (!this.navWaypoints || this.navWaypoints.length === 0) return;
                
                const waypointReachDistance = 120; // How close to consider "reached"
                
                while (this.currentWaypointIndex < this.navWaypoints.length - 1) {
                    const wp = this.navWaypoints[this.currentWaypointIndex];
                    const dist = Math.hypot(this.x - wp.x, this.y - wp.y);
                    
                    if (dist < waypointReachDistance) {
                        // Reached this waypoint, move to next
                        this.currentWaypointIndex++;
                    } else {
                        // Check if waypoint is behind us
                        const toWpX = wp.x - this.x;
                        const toWpY = wp.y - this.y;
                        const fwdX = Math.cos(this.angle);
                        const fwdY = Math.sin(this.angle);
                        const dot = toWpX * fwdX + toWpY * fwdY;
                        
                        // If waypoint is significantly behind us and not the final one, skip it
                        if (dot < -50 && this.currentWaypointIndex < this.navWaypoints.length - 1) {
                            this.currentWaypointIndex++;
                        } else {
                            break;
                        }
                    }
                }
            }
            
            
            
            getNextIntersection(approachDistance = 100) {
                if (!this.currentLane || !this.currentLane.intersectingZones) return null;
                const myProgress = this.getDistanceAlongLane();
                for (let zone of this.currentLane.intersectingZones) {
                    // A lane that starts at an intersection touches it at 0: that's where we came from, not where
                    // we're going — without this a car just out of the box queued for it again and stopped on the exit
                    if (zone.entryDist < 5) continue;
                    const distToEntry = zone.entryDist - myProgress;
                    if (distToEntry > -50 && distToEntry < approachDistance) return zone;
                }
                return null;
            }
            
            // --- SENSING ALONG THE ROUTE (T1) ---
            /** Distance it takes to stop from `v` at full brake. */
            stoppingDistance(v = Math.abs(this.speed)) { return v * v / (2 * (this.brake || 0.3)); }

            /**
             * Probe points along where the car is about to drive, from its front bumper out to `range`
             * (flat array x, y, s — s is distance from the car's centre): down the lane and through the
             * planned turn onto the exit lane, or along the rest of the turn it's in; straight ahead
             * while changing lanes. Cached per decision.
             */
            _routeProbe(range) {
                const L = this.length, step = 14, out = [];
                const poly = [{ x: this.x, y: this.y }];
                const tail = (ln) => { if (ln && ln.start) poly.push({ x: ln.start.x + ln.ux * range, y: ln.start.y + ln.uy * range }); };
                if (this.laneChangeState !== 'NONE' || (!this.currentLane && !this.currentTurnPath)) {
                    poly.push({ x: this.x + Math.cos(this.angle) * range, y: this.y + Math.sin(this.angle) * range });
                } else if (this.currentTurnPath) {
                    const tp = this.currentTurnPath, t0 = Math.min(1, this.turnProgress || 0);
                    for (let i = 1; i <= 8; i++) poly.push(tp.getPoint(t0 + (1 - t0) * i / 8));
                    tail(tp.toLane);
                } else {
                    const ln = this.currentLane, pt = this.plannedTurn;
                    // Rejoin the lane's centre line within a car length, so a car that came out of a turn a little
                    // wide looks down its own lane rather than diagonally across the next one
                    const my = (this.x - ln.start.x) * ln.ux + (this.y - ln.start.y) * ln.uy;
                    const back = Math.min(ln.length, my + this.length);
                    poly.push({ x: ln.start.x + ln.ux * back, y: ln.start.y + ln.uy * back });
                    if (pt) {
                        for (let i = 0; i <= 8; i++) poly.push(pt.getPoint(i / 8));
                        tail(pt.toLane);
                    } else poly.push({ x: ln.end.x + ln.ux * 40, y: ln.end.y + ln.uy * 40 });
                }
                let s = 0, want = L / 2;
                for (let i = 1; i < poly.length && want <= range; i++) {
                    const a = poly[i - 1], b = poly[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
                    while (want <= s + seg && want <= range) {
                        const t = seg > 0 ? (want - s) / seg : 0;
                        out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, want);
                        want += step;
                    }
                    s += seg;
                }
                return out;
            }

            /** Bumper gap to `v` along the probe (Infinity if it isn't in the way). */
            _probeGap(v, pts) {
                const c = Math.cos(v.angle), sn = Math.sin(v.angle);
                const hl = v.length / 2 + 2, hw = (v.width + this.width) / 2 + 1;
                for (let i = 0; i < pts.length; i += 3) {
                    const dx = pts[i] - v.x, dy = pts[i + 1] - v.y;
                    const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
                    if (lx < hl && lx > -hl && ly < hw && ly > -hw) return Math.max(0, pts[i + 2] - this.length / 2 - 7);
                }
                return Infinity;
            }

            /** Where a point falls on a lane's centre line. */
            _laneProject(lane, x, y) {
                const d = (x - lane.start.x) * lane.ux + (y - lane.start.y) * lane.uy;
                return { x: lane.start.x + lane.ux * d, y: lane.start.y + lane.uy * d, d };
            }

            /** Another car is ahead of us in our lane (between us and its end) — we're not first in line. With `ix`
             *  (lights), one that already has the green into it doesn't count: we can follow it in. */
            _carAheadInLane(ix = null) {
                const ln = this.currentLane;
                if (!ln || !this._allVehicles) return false;
                const my = (this.x - ln.start.x) * ln.ux + (this.y - ln.start.y) * ln.uy;
                for (const v of this._allVehicles) {
                    if (v === this || v.dead || !v.length || (ix && ix.occupants.includes(v))) continue;
                    const dx = v.x - ln.start.x, dy = v.y - ln.start.y;
                    const along = dx * ln.ux + dy * ln.uy;
                    if (along <= my || along > ln.length + 10) continue;
                    if (Math.abs(-dx * ln.uy + dy * ln.ux) > 26) continue;
                    if (Math.cos((v.angle || 0) - ln.angle) < 0.5) continue;
                    return true;
                }
                return false;
            }

            /** The lane we're about to turn onto has no room for us yet (a car sits near its start). */
            _exitBlocked() {
                const pt = this.plannedTurn, tl = pt && pt.toLane;
                if (!tl || !tl.start || !this._allVehicles) return false;
                for (const v of this._allVehicles) {
                    if (v === this || v.dead || !v.length) continue;
                    const dx = v.x - tl.start.x, dy = v.y - tl.start.y;
                    const along = dx * tl.ux + dy * tl.uy, lat = Math.abs(-dx * tl.uy + dy * tl.ux);
                    if (lat < 30 && along > -20 && along - v.length / 2 < this.length + 24 && Math.abs(v.speed || 0) < 3) return true;
                }
                return false;
            }

            /** The lanes beside ours on this stretch (same segment), nearest first (none on a curved road: no pulling out on a bend) */
            _sideLanes(opposing) {
                const cur = this.currentLane, seg = cur.segment;
                if (cur.road.isCurved) return [];
                return cur.road.lanes.filter(l => l !== cur && (!seg || l.segment === seg) && (l.isOpposing !== cur.isOpposing) === opposing)
                    .sort((p, q) => Math.abs(this._latTo(p)) - Math.abs(this._latTo(q)));
            }
            _latTo(lane) { return (this.x - lane.start.x) * -lane.uy + (this.y - lane.start.y) * lane.ux; }

            findAdjacentLane(ahead = 150) {
                if (!this.currentLane || !this.currentLane.road) return null;
                for (const lane of this._sideLanes(false)) if (this.isLaneClear(lane, ahead)) return lane;   // (this stretch only, nearest first)
                return null;
            }
            
            findOpposingLane() {
                if (!this.currentLane || !this.currentLane.road || !this.currentLane.road.symmetrical) return null;
                const near = this._sideLanes(true)[0];                                 // the oncoming lane right beside us, if it's clear
                return near && this.isLaneClear(near, 200) ? near : null;
            }
            
            /**
             * Room to move into `targetLane` here: nobody in it from a closing car's worth behind us (its
             * speed toward us × ~40 ticks, plus our length) to our stopping distance ahead. Oncoming lanes
             * want far more room ahead. Measured along the lane, so it works on any road direction.
             */
            isLaneClear(targetLane, checkDistance) {
                const dir = this.currentLane || targetLane;
                const ux = dir.ux, uy = dir.uy, mySpeed = Math.max(0, Math.abs(this.speed));
                const isOpposing = !!this.currentLane && (targetLane.isOpposing !== this.currentLane.isOpposing);
                const ahead = isOpposing ? 260 + (mySpeed + 9) * 70 : Math.max(checkDistance || 0, this.stoppingDistance() + this.length);
                const cands = (this._allVehicles || []).slice();
                if (this._playerCar && this._playerCar.visible && !cands.includes(this._playerCar)) cands.push(this._playerCar);
                for (const v of cands) {
                    if (v === this || v.dead || !v.length) continue;
                    const dx = v.x - this.x, dy = v.y - this.y;
                    if (dx * dx + dy * dy > 700 * 700) continue;
                    const lat = Math.abs(-(v.x - targetLane.start.x) * targetLane.uy + (v.y - targetLane.start.y) * targetLane.ux);
                    if (lat > 30 + v.width / 2) continue;                          // not in that lane
                    const along = dx * ux + dy * uy;                               // + ahead of us, - behind
                    const vAlong = v.vx !== undefined ? v.vx * ux + v.vy * uy : (v.speed || 0) * Math.cos((v.angle || 0) - Math.atan2(uy, ux));
                    const closing = Math.max(0, vAlong - mySpeed);                 // gaining on us from behind
                    const behind = this.length + v.length / 2 + closing * 40 * this._temper().take + 20;   // (the pushy take tighter gaps)
                    if (along > -behind && along < ahead + v.length / 2) return false;
                }
                return !this._folkInLane(targetLane, ahead);                       // and nobody on foot in it
            }

            // --- AUTO-DRIVE LOGIC ---
            enableAutoDrive(roadNetwork, walls) {
                if (!roadNetwork || !roadNetwork.allLanes || roadNetwork.allLanes.length === 0) return false;
                let nearestLane = null;
                let nearestDist = Infinity;
                for (let lane of roadNetwork.allLanes) {
                    const lx = this.x - lane.start.x;
                    const ly = this.y - lane.start.y;
                    const dot = lx * lane.ux + ly * lane.uy;
                    const t = clamp(dot / lane.length, 0, 1);
                    const closestX = lane.start.x + lane.ux * lane.length * t;
                    const closestY = lane.start.y + lane.uy * lane.length * t;
                    const dist = Math.hypot(this.x - closestX, this.y - closestY);
                    
                    let angleDiff = Math.abs(this.angle - lane.angle);
                    angleDiff = normalizeAngle(angleDiff);
                    angleDiff = Math.abs(angleDiff);
                    
                    const isBlocked = isLineBlocked(this.x, this.y, closestX, closestY, walls);
                    if (!isBlocked && dist < nearestDist && angleDiff < Math.PI / 2) {
                        nearestDist = dist;
                        nearestLane = lane;
                    }
                }
                if (nearestLane && nearestDist < 80) {
                    const driverType = this.driverType;
                    this.disableAutoDrive();
                    this.currentLane = nearestLane;
                    this.controlMode = 'AI';
                    this.dead = false;
                    this.manualGas = 0;
                    this.manualTurn = 0;
                    this._driveRoute = null;
                    this.driverType = driverType;
                    // Preserve existing driverType if already set (e.g. 'zib'), default to 'player'
                    if (!this.driverType || this.driverType === 'traffic') {
                        this.driverType = 'player';
                    }
                    return true;
                }
                return false;
            }
            
            disableAutoDrive() {
                this.controlMode = 'PLAYER';
                this._driveRoute = null;
                
                // --- Release from intersection queue/occupancy ---
                if (this.currentIntersection) {
                    this.currentIntersection.releaseEntry(this);
                }
                
                // --- Navigation state ---
                this.currentLane = null;
                this.currentTurnPath = null;
                this.plannedTurn = null;
                this.turnProgress = 0;
                this.turnSignal = null;
                this.turnSignalTimer = 0;
                
                // --- Lane change state ---
                this.laneChangeState = 'NONE';
                this.targetLane = null;
                this.originalLane = null;
                this.laneChangeProgress = 0;
                
                // --- Intersection state ---
                this.currentIntersection = null;
                this.hasIntersectionAccess = false;
                this.wasInIntersection = false;
                this.intersectionTimer = 0;
                this.postIntersectionGraceTimer = 0;
                this._stuckContactFrames = 0;
                this._stuckRecovery = 0;
                this._reverseLeft = 0; this._reverseFrom = null; this._folkWait = 0; this._folkBacks = 0;
                if (this._folkPlan) this._folkPlan.sideStep = 0;
                
                // --- Aggressive / idle modes ---
                this.isAggressive = false;
                this.isLightAggressive = false;
                this.lightAggressiveDuration = 0;
                this.isWaiting = false;
                this.idleTimer = 0;
                this.stuckTimer = 0;
                
                // --- Curvature cache ---
                this._cachedCurvaturePath = null;
                this._cachedCurvature = 0;
            }
        
            // --- NEW: SKID & DECAL LOGIC ---
            applySkids(decalSystem) {
                // 1. Calculate Velocity for AI (since they don't set vx/vy naturally)
                // We use the delta from the previous frame to determine actual movement vector
                if (this.controlMode === 'AI') {
                    this.vx = this.x - this.prevX;
                    this.vy = this.y - this.prevY;
                }
        
                // Store current pos for next frame
                this.prevX = this.x;
                this.prevY = this.y;
        
                // 2. Thresholds: traffic marks easily in turns; the driven car only once
                //    its tyres are past their limit (the weighted model holds a clean line)
                const player = this.controlMode === 'PLAYER';
                const driftThreshold = player ? 1.6 : 0.8;
                
                // 3. Physics Calculations
                const fwdX = Math.cos(this.angle);
                const fwdY = Math.sin(this.angle);
                const rightX = -Math.sin(this.angle);
                const rightY = Math.cos(this.angle);
                
                // Slide Velocity = How fast are we moving SIDEWAYS?
                const slideVelocity = this.vx * rightX + this.vy * rightY;
                
                // 4. Skid Logic
                let isSkidding = Math.abs(slideVelocity) > driftThreshold;
                let intensity = (Math.abs(slideVelocity) - driftThreshold) * 0.5; // Boosted intensity
                
                // Locked wheels (handbrake, hard braking) mark the road too
                if (player && this.tyreSlip > 0.3) {
                    isSkidding = true;
                    intensity = Math.max(intensity, Math.min(1, this.tyreSlip * 0.5));
                }
        
                // 5. Draw
                if (isSkidding && decalSystem) {
                    // Tire Positions
                    const rearAxleX = this.x - (this.length / 2 - 8) * fwdX; // Moved axle slightly forward
                    const rearAxleY = this.y - (this.length / 2 - 8) * fwdY;
                    const tireOffset = this.width / 2 - 4;
                    
                    const lrX = rearAxleX - tireOffset * rightX;
                    const lrY = rearAxleY - tireOffset * rightY;
                    const rrX = rearAxleX + tireOffset * rightX;
                    const rrY = rearAxleY + tireOffset * rightY;
                    
                    const tireWidth = 5; // Slightly thicker
                    decalSystem.addSkid(lrX, lrY, tireWidth, intensity);
                    decalSystem.addSkid(rrX, rrY, tireWidth, intensity);
                }
            }
        
            /**
             * SHARED DRIVE PHYSICS — the single implementation used by BOTH the
             * player and the traffic AI.
             *
             * These were previously two near-verbatim copies that had already
             * begun to diverge (the AI copy kept an older wall response and its
             * own grip line). Both control paths funnel their intent into the
             * same manualGas/manualTurn pair, so everything below is genuinely
             * common. Only the two real differences are passed in:
             *
             *   steerCurve — speed-dependent steering authority. PLAYER ONLY, on
             *                purpose: the traffic AI solves its steering input by
             *                inverting `angle += turn * handling * direction`, so
             *                scaling authority underneath it would make every car
             *                understeer out of its lane. Giving the AI the curve
             *                means also reworking its path follower; that is a
             *                separate job from this one.
             *   gripFloor  — AI-only assist that raises grip through scripted
             *                intersection turns so cars don't drift wide.
             *
             * @returns {boolean} whether the vehicle hit environment geometry
             */
            applyDrivePhysics({ weather, walls, buildings, decalSystem,
                                steerCurve = false, gripFloor = 0 }) {
                const VD = CONFIG.VEHICLE_DRIVE;
                const VA = CONFIG.VEHICLE_AI;
                this._wallProbeTick = _simTick;   // walls are handled here: CollisionSystem skips this car's wall pass
                if (typeof this.vx === 'undefined') { this.vx = 0; this.vy = 0; }

                /* --- PER-VEHICLE PERFORMANCE ---
                   Acceleration and drag used to be hardcoded (0.5 / 0.96), so
                   every car in the game shared one top speed of 12.5 and one
                   acceleration curve — the entire brand/model stat block was
                   invisible from behind the wheel. Now the car's own numbers
                   drive it, and drag is SOLVED so it tops out where its spec
                   says it should:

                       steady state  v = a·d/(1-d)   =>   d = v/(a+v)          */
                const topSpeed = (typeof this.maxSpeed === 'number' && this.maxSpeed > 0)
                    ? this.maxSpeed : 12.5;
                const acceleration = (typeof this.acceleration === 'number' && this.acceleration > 0)
                    ? this.acceleration : 0.5;
                const drag = topSpeed / (acceleration + topSpeed);
                const revTop = topSpeed * VD.REVERSE_TOP_FRACTION;
                const reverseDrag = revTop / (acceleration + revTop);

                const player = steerCurve;                    // the full weighted model is the driver's
                const F = this.drive || VD.DEFAULT_FEEL;
                const rain = (weather && weather.isRaining)
                    ? Math.min(1, weather.getRainScale ? weather.getRainScale() : 1) : 0;
                const absSpeed = Math.abs(this.speed);
                const clampU = (x, m) => x < -m ? -m : x > m ? m : x;

                // --- GRIP (traffic: the original single-number model) ---
                let grip = VD.GRIP_BASE;
                if (rain) grip = VD.GRIP_BASE - VD.GRIP_RAIN_PENALTY * rain;
                if (this.surfaceFriction) grip *= this.surfaceFriction;
                if (gripFloor > 0) grip = Math.max(grip, gripFloor);

                /* --- THE WHEEL ---
                   manualTurn is what the driver asks for; `steer` is where the front
                   wheels actually point. They wind on at the brand's pace and, when the
                   stick is let go, the caster pulls them home — quicker the faster the
                   car rolls, easing in rather than stopping dead. Traffic's wheels only
                   *look* like that (the drawn tyres follow `steer`): its path follower
                   steers the car directly, since a lagging wheel under it doubled
                   car-to-car contacts in the traffic sim. */
                const req = clampU(this.manualTurn || 0, 1);
                let st = this.steer || 0;
                if (!player) {
                    st += clampU(req - st, VD.AI_STEER_RATE);
                } else if (Math.abs(req) > 0.02 && (Math.sign(req) !== Math.sign(st) || Math.abs(req) > Math.abs(st))) {
                    const across = st !== 0 && Math.sign(req) !== Math.sign(st);
                    const rate = F.steerRate * (across ? 1.6 : 1);     // crossing centre, the caster helps
                    st += clampU(req - st, rate);
                } else {
                    const k = Math.min(VD.CENTER_RATE_MAX, VD.CENTER_RATE + VD.CENTER_RATE_SPEED * absSpeed);
                    const d = (req - st) * k;
                    st += Math.abs(d) < 0.006 ? req - st : d;
                }
                this.steer = st;

                // --- STEERING → ROTATION ---
                let yawTarget = 0;
                if (absSpeed > VD.STEER_MIN_SPEED) {
                    // Latch steering direction — only flip when speed clearly
                    // crosses the dead zone. Prevents direction jitter that
                    // causes wiggle at low reverse speeds.
                    if (this.speed > 1.0) this._steerDir = 1;
                    else if (this.speed < -1.0) this._steerDir = -1;
                    const direction = this._steerDir || 1;
                    const handlingMod = 1.0 - VD.HANDLING_RAIN_PENALTY * rain;

                    let authority = 1.0;
                    if (steerCurve) {
                        /* Turn rate was constant at any speed, so a barely-moving
                           car pirouetted at 189°/s with a 22px radius. Now it
                           ramps in from a standstill — you have to be rolling
                           before the wheel bites — and tapers at speed so the top
                           end is stable rather than twitchy, bottoming out at
                           STEER_HIGH_FLOOR instead of going to zero. */
                        const ramp = Math.min(1, absSpeed / VD.STEER_RAMP_SPEED);
                        const over = Math.max(0, absSpeed - VD.STEER_RAMP_SPEED);
                        authority = ramp * (VD.STEER_HIGH_FLOOR +
                            (1 - VD.STEER_HIGH_FLOOR) / (1 + over * VD.STEER_FALLOFF));
                    }
                    const reverseSteerFactor = direction < 0 ? VD.REVERSE_STEER_FACTOR : 1.0;
                    yawTarget = (player ? st : req) * this.handling * handlingMod * direction * reverseSteerFactor * authority;
                }
                let yaw = this.yawRate || 0;
                if (!player) yaw = yawTarget;
                else {
                    /* The body has inertia: rotation builds toward what the wheels ask
                       (at the brand's turn-in) and settles when they straighten. Past what
                       the tyres can hold (latAcc / speed) the nose pushes wide instead. */
                    const wetGrip = (1 - 0.35 * rain) * (this.surfaceFriction || 1);
                    if (absSpeed > 1 && !this.handbrake) yawTarget = clampU(yawTarget, F.latAcc * wetGrip / absSpeed);
                    // last tick's rear/front grip imbalance: a light rear swings the tail out
                    yaw += (yawTarget + (this._yawCouple || 0) - yaw) * F.turnIn;
                    if (absSpeed < VD.STEER_MIN_SPEED) yaw *= 0.5;
                    yaw = clampU(yaw, VD.YAW_MAX);
                }
                this.yawRate = yaw;
                this.angle += yaw;

                /* --- PEDALS ---
                   Gas against the direction of travel is the brake (this.brake, px/tick²),
                   taken off the car's motion and never past a stop; only once (nearly)
                   stopped does it reverse. The driver's throttle travels in over a few
                   ticks and the brake bites progressively; the handbrake is instant. */
                const fwdX0 = Math.cos(this.angle), fwdY0 = Math.sin(this.angle);
                const fwd0 = this.vx * fwdX0 + this.vy * fwdY0;
                const revBelow = player ? VD.REVERSE_BELOW : 0.25;
                let gas = this.manualGas || 0;
                if (player) {
                    const p = this.pedal || 0;
                    const braking = gas * fwd0 < 0 && Math.abs(fwd0) > revBelow;
                    const rate = (p !== 0 && Math.sign(gas) !== Math.sign(p)) ? VD.PEDAL_OUT + VD.PEDAL_BRAKE_IN
                        : Math.abs(gas) < Math.abs(p) ? VD.PEDAL_OUT
                        : braking ? VD.PEDAL_BRAKE_IN : VD.PEDAL_IN;
                    gas = this.pedal = p + clampU(gas - p, rate);
                }
                let decel = 0;
                if (Math.abs(gas) > (player && this._fineGas ? 0.02 : 0.1)) {
                    if (fwd0 * gas < 0 && Math.abs(fwd0) > revBelow) {
                        const sp = Math.hypot(this.vx, this.vy);
                        decel = Math.min(sp, Math.abs(gas) * (this.brake || 0.3));
                        if (sp > 0) { this.vx -= this.vx / sp * decel; this.vy -= this.vy / sp * decel; }
                    } else {
                        this.vx += fwdX0 * gas * acceleration;
                        this.vy += fwdY0 * gas * acceleration;
                    }
                }
                const hb = player && this.handbrake && absSpeed > 0.05;
                if (hb) {
                    const sp = Math.hypot(this.vx, this.vy), dec = Math.min(sp, VD.HANDBRAKE_DECEL);
                    if (sp > 0) { this.vx -= this.vx / sp * dec; this.vy -= this.vy / sp * dec; }
                    decel += dec;
                }

                /* --- WEIGHT ---
                   Braking pitches the load forward (the front bites, the rear goes
                   light); throttle sits it back. It shifts at the brand's pace, so a
                   heavy car settles slowly. */
                const loadTarget = decel > 0 ? Math.min(1, decel / ((this.brake || 0.3) + 0.05))
                    : gas > 0.1 ? -0.4 * gas * Math.min(1, acceleration / 0.2) : 0;
                this.load = (this.load || 0) + (loadTarget - (this.load || 0)) * VD.LOAD_RATE / F.weight;

                // --- DRIFT DECOMPOSITION ---
                const fwdX = Math.cos(this.angle);
                const fwdY = Math.sin(this.angle);
                const rightX = -Math.sin(this.angle);
                const rightY = Math.cos(this.angle);
                let fwdVelocity = this.vx * fwdX + this.vy * fwdY;
                let slideVelocity = this.vx * rightX + this.vy * rightY;

                this.applySkids(decalSystem);

                // --- RAIN SPRAY ---
                if (rain && Math.abs(fwdVelocity) > 2.0) {
                    // Spray frequency tracks rain strength — wet roads throw more water.
                    const sprayChance = 0.7 * rain;
                    if (Math.random() < sprayChance) {
                        const sprayColor = 'rgba(200, 200, 255, 0.4)';
                        const spraySpeed = Math.abs(fwdVelocity) * 0.5;
                        const blX = this.x - this.length/2 * fwdX + this.width/2 * rightX;
                        const blY = this.y - this.length/2 * fwdY + this.width/2 * rightY;
                        weather.addSpray(blX, blY, this.angle + Math.PI, spraySpeed, sprayColor, 1.0, 1.0);
                        const brX = this.x - this.length/2 * fwdX - this.width/2 * rightX;
                        const brY = this.y - this.length/2 * fwdY - this.width/2 * rightY;
                        weather.addSpray(brX, brY, this.angle + Math.PI, spraySpeed, sprayColor, 1.0, 1.0);
                    }
                }

                // --- DRIFT SMOKE (+ traffic's grip breakaway) ---
                const smoking = Math.abs(slideVelocity) > VD.GRIP_SLIDE_THRESHOLD || (hb && Math.abs(fwdVelocity) > 3);
                if (smoking) {
                    if (!player) grip *= VD.GRIP_SLIDE_PENALTY;
                    if (weather && Math.random() > 0.2) {
                        const smokeColor = 'rgba(30, 30, 30, 0.6)';
                        const slipSpeed = Math.max(Math.abs(slideVelocity), hb ? Math.abs(fwdVelocity) * 0.4 : 0);
                        const volume = 20.0;
                        const life = 10.0;
                        const blX = this.x - this.length/2 * fwdX + this.width/2 * rightX;
                        const blY = this.y - this.length/2 * fwdY + this.width/2 * rightY;
                        weather.addSpray(blX, blY, this.angle + Math.PI, slipSpeed, smokeColor, volume, life);
                        const brX = this.x - this.length/2 * fwdX - this.width/2 * rightX;
                        const brY = this.y - this.length/2 * fwdY - this.width/2 * rightY;
                        weather.addSpray(brX, brY, this.angle + Math.PI, slipSpeed, smokeColor, volume, life);
                    }
                }

                // --- TYRES ---
                if (!player) {
                    slideVelocity *= grip;
                } else {
                    /* Two axles, each a tyre that holds firmly up to its limit and then
                       slides. Weight transfer and the handbrake move those limits apart;
                       when the rear gives first, the difference swings the tail out
                       (applied to next tick's rotation). */
                    const wetGrip = (1 - 0.35 * rain) * (this.surfaceFriction || 1);
                    const L = this.load;
                    let gF = F.gripF * (1 + VD.LOAD_FWD_GRIP * L) * wetGrip;
                    let gR = F.gripR * (1 - VD.LOAD_REAR_GRIP * L) * wetGrip;
                    if (hb) gR *= VD.HANDBRAKE_REAR_GRIP;
                    const s = Math.abs(slideVelocity);
                    const remF = Math.min(s * 0.22 * gF, F.latAcc * gF);
                    const remR = Math.min(s * 0.22 * gR, F.latAcc * gR);
                    const rem = Math.min(s, (remF + remR) / 2);
                    slideVelocity -= Math.sign(slideVelocity) * rem;
                    const couple = (remF - remR) * VD.OVERSTEER_COUPLE * (hb ? VD.HANDBRAKE_SWING : 1) * (70 / this.length);
                    this._yawCouple = -Math.sign(slideVelocity) * (couple < 0 ? couple * 0.5 : couple);   // understeer only half as strong
                    this.tyreSlip = Math.max(0, s - F.latAcc * 1.6) + (hb ? Math.abs(fwdVelocity) * 0.25 : 0)
                        + (decel > (this.brake || 0.3) * 0.8 && Math.abs(fwdVelocity) > 4 ? 0.8 : 0);
                }

                // --- BODY (visual): lean out of the turn, dip under the brakes ---
                const latA = clampU(yaw * fwdVelocity / 0.6, 1);
                this.bodyRoll = (this.bodyRoll || 0) + (latA - (this.bodyRoll || 0)) * 0.16 / F.weight;

                // --- RECOMPOSE + DRAG ---
                this.vx = fwdVelocity * fwdX + slideVelocity * rightX;
                this.vy = fwdVelocity * fwdY + slideVelocity * rightY;
                let dragNow = (fwdVelocity > 0 ? drag : reverseDrag);
                if (player && Math.abs(gas) < 0.1) dragNow *= 1 - (1 - (this.friction || 0.97)) * VD.COAST_DRAG;
                this.vx *= dragNow;
                this.vy *= dragNow;
                // --- INTEGRATE + COLLIDE ---
                const nextX = this.x + this.vx;
                const nextY = this.y + this.vy;

                /* Report the POST-drag forward component.
                   This used to be recorded before drag was applied, which
                   overstated speed by exactly one acceleration step. That was
                   invisible while top speed was a hardcoded 12.5, but now drag is
                   solved from each car's maxSpeed, so the stale value made every
                   vehicle read (maxSpeed + acceleration) instead of its spec. */
                this.speed = this.vx * fwdX + this.vy * fwdY;

                /* Wall response: move, then push out of whatever it ends up in.
                   The old axis-by-axis retry only asked "does it fit?", so once the car
                   was inside a wall (rotation is never checked: steering while touching
                   a wall turns a corner into it) every retry failed, the "head-on"
                   branch flipped the velocity back toward the wall, and the car stayed
                   stuck however the driver steered. Now each touching wall gives its
                   contact normal and depth (SAT): the car is moved out along it, the
                   speed going into the wall bounces back (WALL_BOUNCE_FACTOR) and the
                   speed along it scrapes (WALL_SLIDE_FRICTION). Speed already leaving
                   the wall is left alone, so the driver can always pull away. */
                const w_ = walls || [], b_ = buildings || [];
                if (player && this._crunchCd > 0) this._crunchCd--;
                const vx0 = this.vx, vy0 = this.vy;
                this.x = nextX;
                this.y = nextY;
                let collided = false;
                for (let pass = 0; pass < 4; pass++) {
                    const c = this._wallContact(w_, b_);
                    if (!c) break;
                    collided = true;
                    this.x += c.nx * (c.depth + 0.01);
                    this.y += c.ny * (c.depth + 0.01);
                    const vn = this.vx * c.nx + this.vy * c.ny;
                    if (vn < 0) {
                        const tx = this.vx - vn * c.nx, ty = this.vy - vn * c.ny;
                        const vnOut = vn * VA.WALL_BOUNCE_FACTOR;
                        this.vx = tx * VA.WALL_SLIDE_FRICTION + vnOut * c.nx;
                        this.vy = ty * VA.WALL_SLIDE_FRICTION + vnOut * c.ny;
                    }
                }
                if (collided) {
                    // Re-derive forward speed from the corrected velocity so the
                    // HUD, engine audio and skid logic agree with what the car is
                    // actually doing after the impact.
                    this.speed = this.vx * fwdX + this.vy * fwdY;
                    if (player) this.onImpact(Math.hypot(this.vx - vx0, this.vy - vy0));
                }
                return collided;
            }

            /**
             * A knock the driver feels (PhysicsSystem.carContact, walls in applyDrivePhysics):
             * strength is the speed change it caused (px/tick), kick a twist to the car's
             * rotation. Hard enough, it crunches and shakes the camera.
             */
            onImpact(strength, kick = 0) {
                if (this.controlMode !== 'PLAYER') return;
                this.yawRate = clamp((this.yawRate || 0) + kick, -CONFIG.VEHICLE_DRIVE.YAW_MAX, CONFIG.VEHICLE_DRIVE.YAW_MAX);
                if (strength < 0.7 || this._crunchCd > 0) return;
                this._crunchCd = 8;
                audioSys.sfx('crunch', { gain: Math.min(1, strength / 5) });
                if (typeof game !== 'undefined' && game.triggerShake) game.triggerShake(Math.min(12, 2 + strength * 1.8));
            }

            /**
             * The driver's hands and feet: a move input → manualGas / manualTurn.
             * analog (the touch stick) points where the car should go; keys are
             * throttle/brake and left/right. Pulling back while rolling forward is
             * the brake, straight; it only turns into reverse once nearly stopped.
             * The stick also eases off as the car's rotation builds (yawRate), the
             * way a driver unwinds before the car reaches the line they want.
             * With Precise Stick the stick has already been shaped (its own dead
             * centre and response curve, initJoystick), so any push steers, and
             * how far it's pushed sets how hard: a light push off the nose is a
             * gentle turn, a full push the old full lock.
             */
            driverInput(inputX, inputY, analog) {
                const VD = CONFIG.VEHICLE_DRIVE;
                const fwd = this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
                const rolling = fwd > VD.REVERSE_BELOW;
                const precise = !!analog && typeof GameSettings !== 'undefined' && !!GameSettings.preciseStick;
                this._fineGas = precise;   // applyDrivePhysics: a light throttle still pulls
                let gas = 0, turn = 0;
                if (analog) {
                    const carDirX = Math.cos(this.angle), carDirY = Math.sin(this.angle);
                    gas = inputX * carDirX + inputY * carDirY;
                    const push = Math.hypot(inputX, inputY);
                    if (precise ? push > 0 : (Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1)) {
                        const angleDiff = normalizeAngle(Math.atan2(inputY, inputX) - this.angle);
                        if (rolling && Math.abs(angleDiff) > 1.9) turn = 0;          // hauling back: brake, not a spin
                        else {
                            const lock = precise ? VD.STICK_LIGHT_LOCK + (1 - VD.STICK_LIGHT_LOCK) * Math.min(1, push / VD.STICK_FULL_LOCK_PUSH) : 1;
                            turn = clamp(clamp(angleDiff * 2.0, -1, 1) * lock - (this.yawRate || 0) * VD.STICK_YAW_DAMP, -1, 1);
                            if (Math.abs(turn) < 0.1 && Math.abs(angleDiff) < 0.05) turn = 0;
                        }
                    }
                } else {
                    if (inputY < 0) gas = 1;
                    if (inputY > 0) gas = rolling ? -1 : -0.5;
                    if (inputX < 0) turn = -1;
                    if (inputX > 0) turn = 1;
                }
                this.manualGas = gas; this.manualTurn = turn;
            }

            // --- MANUAL UPDATE (With Physics & Skids) ---
            updateManualDriving(walls, buildings, weather, decalSystem) { // Added decalSystem
                if (typeof this.vx === 'undefined') { this.vx = 0; this.vy = 0; }
                if (Math.abs(this.speed) < 0.1 && this.manualGas === 0) this.parkIdleTimer++; else this.parkIdleTimer = 0;
                
                // Player gets the speed-dependent steering curve; see applyDrivePhysics.
                this.applyDrivePhysics({ weather, walls, buildings, decalSystem, steerCurve: true });
                // Nobody at the wheel (she got out) and it has come to rest: parked, so traffic steers round it
                // (the lights stay as she left them: lampsOn, traffic/car-art.js)
                if (!this.hasDriver && Math.abs(this.speed) < 0.05 && Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05) this.controlMode = 'PARKED';

                // Clamp to map bounds (prevent driving off-map)
                if (this._mapBounds) {
                    const margin = this.length;
                    this.x = Math.max(margin, Math.min(this._mapBounds.w - margin, this.x));
                    this.y = Math.max(margin, Math.min(this._mapBounds.h - margin, this.y));
                }
                
                this.manualGas = 0; this.manualTurn = 0;
            }
        
            checkEnvironmentCollision(nextX, nextY, angle, walls, buildings) {
                const futureOBB = { x: nextX, y: nextY, angle: angle, length: this.length, width: this.width };
                const r = Math.hypot(this.length, this.width) / 2;   // reaches the corners at any angle
                const bounds = { left: nextX - r, right: nextX + r, top: nextY - r, bottom: nextY + r };
                for (const list of [walls, buildings]) {
                    const candidates = _physicsSpatial.query(list, bounds);
                    if (!candidates) continue;
                    for (let w of candidates) {
                        if (nextX + r < w.x || nextX - r > w.x + w.w || nextY + r < w.y || nextY - r > w.y + w.h) continue;
                        if (CollisionSystem._satCollision(futureOBB, CollisionSystem._aabbToOBB(w))) return true;
                    }
                }
                return false;
            }

            /** The deepest wall or building the car overlaps where it stands: { nx, ny, depth },
             *  the normal pointing out of the wall (SAT), or null when it's clear */
            _wallContact(walls, buildings) {
                const obb = { x: this.x, y: this.y, angle: this.angle, length: this.length, width: this.width };
                const r = Math.hypot(this.length, this.width) / 2;
                const bounds = { left: this.x - r, right: this.x + r, top: this.y - r, bottom: this.y + r };
                let best = null;
                for (const list of [walls, buildings]) {
                    const candidates = _physicsSpatial.query(list, bounds);
                    if (!candidates) continue;
                    for (let w of candidates) {
                        if (this.x + r < w.x || this.x - r > w.x + w.w || this.y + r < w.y || this.y - r > w.y + w.h) continue;
                        const c = CollisionSystem._satCollision(obb, CollisionSystem._aabbToOBB(w));
                        if (c && (!best || c.depth > best.depth)) best = c;
                    }
                }
                return best;
            }
        
            // --- MAIN UPDATE (AI & Logic) ---
            update(player, playerCar, allVehicles, weather, intersections = [], walls = [], buildings = [], decalSystem, folk = []) {
                // --- CONTROL MODE BRANCHING ---
                if (this.controlMode === 'PARKED') {
                    this.speed = 0;
                    return;
                }
                
                if (this.controlMode === 'PLAYER') {
                    this.updateManualDriving(walls, buildings, weather, decalSystem);
                    return;
                }
                
                // --- AI DRIVING MODE (PHYSICS-BASED) ---
                // AI now uses the same physics model as manual driving
                this.updateAIDriving(player, playerCar, allVehicles, weather, intersections, walls, buildings, decalSystem, folk);
            }
            
            // --- PHYSICS-BASED AI DRIVING (Refactored v4.5.10) ---
            // Features: Drift-aware speed control, dynamic sensing, swerve avoidance
            /**
             * Movement-only step for an AI vehicle. Runs EVERY simulation step,
             * even on steps where the AI skips re-deciding, so cars keep rolling
             * smoothly on whatever throttle and steering they last chose.
             *
             * Physics is shared with manual driving (see applyDrivePhysics). The
             * AI keeps LINEAR steering — its path follower solves steering by
             * inverting `angle += turn * handling * direction`, so applying the
             * player's speed-dependent authority underneath would make every car
             * understeer out of its lane.
             */
            aiDriveStep(weather, walls, buildings, decalSystem) {
                // Turn-path grip boost: reduce lateral slide during intersection
                // turns. Reads only persistent state, so it is valid on steps
                // where the decision layer was skipped.
                let gripFloor = 0;
                if (this.currentTurnPath) {
                    const turnSharpness = this._cachedCurvature
                        ? Math.min(1.0, this._cachedCurvature / Math.PI)
                        : 0.5;
                    gripFloor = 0.96 + turnSharpness * 0.03;
                }
                this.applyDrivePhysics({
                    weather, walls, buildings, decalSystem,
                    steerCurve: false, gripFloor
                });
            }

            updateAIDriving(player, playerCar, allVehicles, weather, intersections, walls, buildings, decalSystem, folk = []) {
                /* ── DISTANCE-BASED AI THINNING ──────────────────────────
                   Cars within AI_NEAR_RADIUS of the player think every step, full
                   stop. Those are the only cars whose reaction time the player
                   can observe or collide with, and thinning them was what caused
                   the rear-ending and missed player hits.

                   Distant cars re-decide every TRAFFIC_AI_FAR_INTERVAL steps. On
                   skipped steps they still move: manualGas and manualTurn persist
                   and aiDriveStep() integrates them as normal, so motion stays
                   bit-identical — only the thinking is slower, out where nobody
                   is watching.

                   Each vehicle carries its own phase offset so the far fleet's
                   thinking spreads evenly across steps instead of spiking
                   together every Nth step into a sawtooth. */
                if (this._aiPhase === undefined) {
                    this._aiPhase = (TrafficVehicle._phaseCounter =
                        ((TrafficVehicle._phaseCounter | 0) + 1)) % 997;
                }
                const _game = (typeof game !== 'undefined') ? game : null;
                if (_game && _game.simDue && CONFIG.SIM.DECIMATE && player) {
                    // Squared compare — no sqrt on the hot path.
                    const _dx = this.x - player.x, _dy = this.y - player.y;
                    const _r = CONFIG.SIM.AI_NEAR_RADIUS;
                    const _far = (_dx * _dx + _dy * _dy) > (_r * _r);
                    if (_far && !_game.simDue(CONFIG.SIM.TRAFFIC_AI_FAR_INTERVAL, this._aiPhase)) {
                        this.aiDriveStep(weather, walls, buildings, decalSystem);
                        return;
                    }
                }

                // Initialize velocity if needed
                if (typeof this.vx === 'undefined') { this.vx = 0; this.vy = 0; }
                
                // Check for valid navigation
                if (!this.currentLane && !this.currentTurnPath) { this.dead = true; return; }
                
                this._allVehicles = allVehicles;
                this._playerCar = playerCar;
                this._folk = folk;
                if (this._driveRoute) this.advanceToRelevantWaypoint();

                if (this.postIntersectionGraceTimer > 0) this.postIntersectionGraceTimer--;

                // --- CALCULATE CURRENT DRIFT STATE (Used for speed control) ---
                const fwdX = Math.cos(this.angle);
                const fwdY = Math.sin(this.angle);
                const rightX = -Math.sin(this.angle);
                const rightY = Math.cos(this.angle);
                const currentSlide = Math.abs(this.vx * rightX + this.vy * rightY);
                const isDrifting = currentSlide > 1.5; // Threshold for "drifting"
                const driftSeverity = Math.min(1, (currentSlide - 1.5) / 4); // 0-1 scale of how hard we're drifting

                // --- INTERSECTION QUEUE MANAGEMENT ---
                let waitingForIntersection = false;
                let nearestIntersection = null;
                
                // How far ahead to look for the next intersection: far enough to stop at its line from this speed
                const icRange = 80 + this.length / 2 + this.stoppingDistance() + 80;
                if (this.currentIntersection) {
                    // Inside until the rear bumper has cleared the box too (not just the centre)
                    const isInside = this.currentIntersection.isVehicleInside(this) || (this.wasInIntersection &&
                        this.currentIntersection.containsPoint(this.x - Math.cos(this.angle) * this.length / 2, this.y - Math.sin(this.angle) * this.length / 2));
                    if (isInside) {
                        nearestIntersection = this.currentIntersection;
                        if (!this.wasInIntersection) {
                            this.wasInIntersection = true;
                            this.intersectionTimer = 0;
                        } else {
                            this.intersectionTimer++;
                            if (this.intersectionTimer > 240 && !this.isAggressive) {
                                this.isAggressive = true; 
                            }
                        }
                    } else if (this.wasInIntersection) {
                        this.currentIntersection.releaseEntry(this);
                        this.wasInIntersection = false;
                        this.intersectionTimer = 0;
                        this.isAggressive = false;
                        this.postIntersectionGraceTimer = 60;
                        this.currentIntersection = null;
                        this.hasIntersectionAccess = false;
                    } else {
                        // Car has currentIntersection set, is NOT inside, was NEVER inside.
                        // Verify the intersection is still ahead of us — if we've passed it,
                        // release the stale reference so we don't stop in the middle of a lane.
                        let stillApproaching = false;
                        if (this.currentLane) {
                            const nextZone = this.getNextIntersection(Math.max(200, icRange));
                            if (nextZone && nextZone.intersection === this.currentIntersection) {
                                stillApproaching = true;
                            }
                        }
                        // Starting one of its turns (its centre not over the edge yet): still this junction's.
                        // (By distance alone, a long box's centre is too far: it let go of the box as it went in.)
                        if (!stillApproaching && this.currentTurnPath && this.currentTurnPath.intersection === this.currentIntersection) {
                            stillApproaching = true;
                        }
                        // Also check raw distance as fallback for mid-turn (no currentLane)
                        if (!stillApproaching && !this.currentLane) {
                            const ci = this.currentIntersection;
                            const cx = ci.x + ci.width / 2;
                            const cy = ci.y + ci.height / 2;
                            if (Math.hypot(this.x - cx, this.y - cy) < 200) {
                                stillApproaching = true;
                            }
                        }
                        
                        if (stillApproaching) {
                            nearestIntersection = this.currentIntersection;
                        } else {
                            // Stale reference — intersection is behind us or too far
                            this.currentIntersection.releaseEntry(this);
                            this.currentIntersection = null;
                            this.hasIntersectionAccess = false;
                        }
                    }
                }
                
                if (!this.currentIntersection && this.currentLane) {
                    const nextZone = this.getNextIntersection(icRange);
                    if (nextZone) nearestIntersection = nextZone.intersection;
                }

                // Lights ahead (traffic/traffic-signals.js) see us coming, from further out than we ask to go in
                this._sigDist = null;
                if (this.currentLane && !this.currentTurnPath && !this.wasInIntersection) {
                    const sz = this.getNextIntersection(SIGNAL.SEE);
                    if (sz && sz.intersection.signal) {
                        this._sigDist = sz.entryDist - this.getDistanceAlongLane();
                        sz.intersection.signal.note(this, this._sigDist);
                    }
                }
                
                // Only the car at the front of its lane may claim the intersection: a fast car further back would
                // otherwise take the access and sit behind the slower car it belongs to, which waits for it forever.
                // With lights, a car may follow one ahead that already has the green in.
                const beforeBox = nearestIntersection && !this.wasInIntersection && !this.currentTurnPath;
                // Nor while the lane out has no room for it (it waits at the line without holding the box)
                const notFirst = beforeBox && (this._carAheadInLane(nearestIntersection.signal ? nearestIntersection : null) || this._exitBlocked());
                if (notFirst) {
                    nearestIntersection.releaseEntry(this);
                    this.hasIntersectionAccess = false;
                }
                if (nearestIntersection) {
                    this.hasIntersectionAccess = notFirst ? false : nearestIntersection.requestEntry(this);
                    this.currentIntersection = nearestIntersection;
                    
                    // Cancel lane change near intersections
                    const nextZone = this.currentLane ? this.getNextIntersection(200) : null;
                    const distToIntersection = nextZone ? (nextZone.entryDist - this.getDistanceAlongLane()) : Infinity;
                    
                    if (distToIntersection < 150 && this.laneChangeState !== 'NONE') {
                        // Abort lane change - AI will steer back naturally via physics
                        this.laneChangeState = 'NONE';
                        this.targetLane = null;
                        if (this.originalLane) {
                            this.currentLane = this.originalLane;
                        }
                        this.originalLane = null;
                        this.laneChangeProgress = 0;
                        this.turnSignal = null;
                    }
                    
                    if (!this.hasIntersectionAccess && !nearestIntersection.isVehicleInside(this) && !this.currentTurnPath) {
                        waitingForIntersection = true;
                    }
                } else {
                    if (this.isWaiting) {
                        this.isLightAggressive = true;
                        this.lightAggressiveDuration = 45;
                        this.idleTimer = 0;
                        this.isWaiting = false;
                    }
                    this.hasIntersectionAccess = false;
                }

                this.isWaiting = waitingForIntersection;

                // --- 1. ENHANCED SENSORS (Speed-based range & width) ---
                const cos = Math.cos(this.angle);
                const sin = Math.sin(this.angle);
                
                // Dynamic sensing parameters based on speed
                const currentSpeed = Math.abs(this.speed);
                const baseLookAhead = this.length * 3;
                const speedLookAheadBonus = currentSpeed * 8; // More aggressive scaling
                const lookAheadDist = baseLookAhead + speedLookAheadBonus;
                
                // Tunnel width also scales with speed (wider at high speed for better detection)
                const baseTunnelWidth = 25;
                const speedWidthBonus = currentSpeed * 1.5;
                const dynamicTunnelWidth = baseTunnelWidth + speedWidthBonus;

                // Enhanced tunnel check returns distance AND lateral offset
                const checkTunnelEx = (tx, ty, range, width) => {
                    const dx = tx - this.x;
                    const dy = ty - this.y;
                    const fwdDist = dx * cos + dy * sin;
                    const latDist = dx * (-sin) + dy * cos;
                    if (fwdDist > 0 && fwdDist < range && Math.abs(latDist) < width) {
                        return { dist: fwdDist, lateral: latDist };
                    }
                    return null;
                };

                // --- CATEGORIZED OBSTACLE DETECTION ---
                // Category 1: Traffic to queue behind (AI drivers, autodriving player vehicles)
                // Category 2: Swerve targets (driverless cars, parked cars)
                // People on foot are their own thing: read for what they're doing (traffic/traffic-people.js)
                let trafficObstacle = null;      // Vehicle to queue behind
                let trafficObstacleDist = Infinity;
                let swerveObstacles = [];        // Obstacles to swerve around
                // Mid lane change / overtake: only what's in the lane we're moving into is in the way
                const tl = this.laneChangeState !== 'NONE' && this.targetLane, tlHalf = this.width / 2 + 18;
                const folkPlan = this._readFolk(folk, lookAheadDist + 60, tl);
                
                // Cars to queue behind are found along the route itself (lane, planned turn, exit lane),
                // as a bumper-to-bumper gap; parked ones still come from the heading tunnel (swerve targets)
                const probeRange = Math.max(this.length * 3, this.stoppingDistance() + this.length * 2 + 60);
                const probe = this._routeProbe(probeRange);
                const probeReach = (probeRange + 120) * (probeRange + 120);
                const senseQueue = (v) => {
                    const dx = v.x - this.x, dy = v.y - this.y;
                    if (dx * dx + dy * dy > probeReach) return;
                    const gap = this._probeGap(v, probe);
                    if (gap < trafficObstacleDist) { trafficObstacle = v; trafficObstacleDist = gap; }
                };

                // Mid lane change / overtake, a parked car is in the way only in the lane we're moving into
                // (the one we're pulling out from behind is being left; the same rule as people, above)
                const parkedInWay = c => !tl || Math.abs((c.x - tl.start.x) * -tl.uy + (c.y - tl.start.y) * tl.ux) < tlHalf + c.width / 2;

                // Check for player car
                if (playerCar && playerCar !== this && (playerCar.x !== 0 || playerCar.y !== 0)) {
                    const result = checkTunnelEx(playerCar.x, playerCar.y, lookAheadDist, dynamicTunnelWidth);
                    const parkedEmpty = !playerCar.hasDriver && playerCar.controlMode === 'PARKED';
                    if (!parkedEmpty && !(this.currentTurnPath && playerCar.isWaiting && !playerCar.wasInIntersection)) senseQueue(playerCar);
                    if (result) {
                        // TURN PATH FILTER: Skip if we're mid-turn and player car is waiting outside
                        const playerWaiting = this.currentTurnPath && playerCar.isWaiting && !playerCar.wasInIntersection;
                        
                        if (playerWaiting) {
                            // Ignore — player car is queued at intersection entry
                        } else if (!playerCar.hasDriver && playerCar.controlMode === 'PARKED' && parkedInWay(playerCar)) {
                            // Truly parked and empty - can swerve around
                            swerveObstacles.push({
                                type: 'vehicle',
                                entity: playerCar,
                                x: playerCar.x,
                                y: playerCar.y,
                                dist: result.dist,
                                lateral: result.lateral,
                                width: playerCar.width + 15
                            });
                        }
                    }
                }
                
                // Check for other traffic vehicles
                // PERFORMANCE: Pre-filter by distance — skip vehicles beyond look-ahead range
                const lookAheadSq = Math.max((lookAheadDist + 100) * (lookAheadDist + 100), probeReach);
                for (let v of allVehicles) { 
                    if (v === this || v === playerCar) continue;
                    
                    // Quick distance rejection — much cheaper than tunnel check
                    const dvx = v.x - this.x;
                    const dvy = v.y - this.y;
                    if (dvx * dvx + dvy * dvy > lookAheadSq) continue;
                    
                    // TURN PATH FILTER: when turning through an intersection, ignore cars queued at its other entries
                    if (this.currentTurnPath && v.isWaiting && !v.wasInIntersection) continue;
                    const parkedEmpty = !v.hasDriver && v.controlMode === 'PARKED';
                    if (!parkedEmpty) { senseQueue(v); continue; }
                    const result = parkedInWay(v) && checkTunnelEx(v.x, v.y, lookAheadDist, dynamicTunnelWidth);
                    if (result) {
                        // Empty parked vehicle - can swerve
                        swerveObstacles.push({
                            type: 'vehicle',
                            entity: v,
                            x: v.x,
                            y: v.y,
                            dist: result.dist,
                            lateral: result.lateral,
                            width: v.width + 10
                        });
                    }
                }

                // --- 2. SWERVE CALCULATION ---
                // A parked car part-way into the lane: steer round it inside the lane. (People are never swerved
                // round: traffic/traffic-people.js)
                let swerveSteer = 0;
                let needsSwerve = false;
                
                if (swerveObstacles.length > 0 && this.laneChangeState === 'NONE' && !this.currentTurnPath) {
                    // Find the closest swerve obstacle
                    const closestSwerve = swerveObstacles.reduce((a, b) => a.dist < b.dist ? a : b);
                    // A parked car squarely in the lane can't be swerved round inside it (the lane gives ~30 px, two
                    // bodies need their half-widths): change lanes or stop and overtake instead (section 3), never shove it
                    const blockingCar = Math.abs(closestSwerve.lateral) < (this.width + (closestSwerve.entity.width || this.width)) / 2 + 4;
                    
                    // Only swerve if obstacle is close enough to matter
                    const swerveThreshold = this.length * 4 + currentSpeed * 5;
                    if (closestSwerve.dist < swerveThreshold && !blockingCar) {
                        needsSwerve = true;
                        
                        // Calculate open space on each side, accounting for obstacle width.
                        const laneWidth = this.currentLane ? 40 : 50; // Approximate lane width
                        const obsHalfWidth = (closestSwerve.width || 20) / 2;
                        const obsLeftEdge = closestSwerve.lateral - obsHalfWidth;
                        const obsRightEdge = closestSwerve.lateral + obsHalfWidth;
                        const leftClear = -laneWidth - obsLeftEdge;   // Space from obs's left edge to lane's left edge
                        const rightClear = laneWidth - obsRightEdge;  // Space from obs's right edge to lane's right edge
                        
                        // Check if other obstacles block the swerve paths.
                        let leftBlocked = false;
                        let rightBlocked = false;
                        const blockWindow = this.length * 3.5;
                        for (let obs of swerveObstacles) {
                            if (obs === closestSwerve) continue;
                            if (obs.dist < closestSwerve.dist + blockWindow) {
                                if (obs.lateral < closestSwerve.lateral - 2) leftBlocked = true;
                                if (obs.lateral > closestSwerve.lateral + 2) rightBlocked = true;
                            }
                        }
                        
                        // Choose swerve direction.
                        // Urgency curve: harder evade when very close. A car traveling at
                        // typical speeds covers ~50px in one second of reaction time, so
                        // anything inside that distance gets full urgency regardless of
                        // the swerve threshold.
                        const baseUrgency = Math.max(0.5, 1 - closestSwerve.dist / swerveThreshold);
                        const urgency = closestSwerve.dist < 50 ? 1.0 : baseUrgency;
                        const magnitude = 0.9;
                        
                        // Pick a side. Threshold scales with obstacle width.
                        const sideThreshold = Math.max(5, obsHalfWidth * 0.5);
                        if (closestSwerve.lateral > sideThreshold && !leftBlocked) {
                            // Obstacle is to our right, swerve left
                            swerveSteer = -urgency * magnitude;
                        } else if (closestSwerve.lateral < -sideThreshold && !rightBlocked) {
                            // Obstacle is to our left, swerve right
                            swerveSteer = urgency * magnitude;
                        } else if (!(leftBlocked && rightBlocked)) {
                            // Obstacle is centered - pick side with more space (both blocked: just slow down, below)
                            if (leftClear > rightClear && !leftBlocked) swerveSteer = -urgency;
                            else if (!rightBlocked) swerveSteer = urgency;
                        }
                    }
                }

                // --- COMBINED OBSTACLE STATE ---
                // For speed calculations, consider both traffic and swerve obstacles
                const hasTrafficAhead = trafficObstacle !== null;
                const hasSwerveObstacle = swerveObstacles.length > 0;
                const closestObstacleDist = Math.min(
                    trafficObstacleDist,
                    swerveObstacles.length > 0 ? Math.min(...swerveObstacles.map(o => o.dist)) : Infinity
                );

                // --- IDLE CHECK FOR LIGHT AGGRESSIVE MODE ---
                if (Math.abs(this.speed) < 0.5 && !waitingForIntersection && this.currentIntersection === null && !this.isAggressive && this.state === 'DRIVING') {
                    this.idleTimer++;
                    if (this.idleTimer > 120) {
                        this.isLightAggressive = true;
                        this.lightAggressiveDuration = 30; 
                        this.idleTimer = 0; 
                    }
                } else if (Math.abs(this.speed) >= 0.5) {
                    this.idleTimer = 0;
                }
                
                // --- GAP NUDGE ---
                if (Math.abs(this.speed) < 0.5 && trafficObstacle && !waitingForIntersection && !this.wasInIntersection && this.state === 'DRIVING' && !this.isLightAggressive) {
                    const distToObstacle = Math.hypot(this.x - trafficObstacle.x, this.y - trafficObstacle.y);
                    if (distToObstacle > 50 && this.idleTimer > 120) {
                        this.isLightAggressive = true;
                        this.lightAggressiveDuration = 20; 
                        this.idleTimer = 0;
                    }
                }

                // --- 3. LANE SWITCHING DECISION (Only for stuck situations, not for swerve obstacles) ---
                const nextZoneForLaneCheck = this.currentLane ? this.getNextIntersection(350) : null;
                const approachingIntersection = nextZoneForLaneCheck && !this.wasInIntersection;
                if (approachingIntersection || waitingForIntersection) this.stuckTimer = 0;
                
                // Only consider lane change for truly stuck situations (traffic that won't move)
                let shouldOvertake = false;
                let waitBriefly = false;          // someone standing, or a parked car: neither is about to move off, so go round soon
                let clearAhead = 150;             // how far the lane beside must be clear (past what's in the way, all of it)
                let backOff = 0;                  // too close behind a parked car to pull out round it (she parked on our nose): back up this far first
                
                // Swerve obstacles that can't be swerved around become overtake candidates
                if (hasSwerveObstacle && !needsSwerve) {
                    const closestSwerve = swerveObstacles.reduce((a, b) => a.dist < b.dist ? a : b), otherLen = closestSwerve.entity.length || this.length;
                    shouldOvertake = true;
                    waitBriefly = true;
                    clearAhead = Math.max(clearAhead, closestSwerve.dist + otherLen + 30);
                    if (closestSwerve.dist < this.length * 1.2 + otherLen / 2 && Math.abs(this.speed) < 0.3) backOff = this.length * 1.6 + otherLen / 2 - closestSwerve.dist;
                }
                
                // Someone standing in the road: the wait, the horn, then round them (traffic/traffic-people.js)
                const folkMove = this._folkLadder(folkPlan, folk);
                
                // Stuck traffic also triggers overtake
                if (trafficObstacle && Math.abs(trafficObstacle.speed) < 0.3 && trafficObstacle.stuckTimer > 100) {
                    shouldOvertake = true;
                }
                
                // Player/Zib autodrive should NOT overtake or change lanes - stay on navigation path (it just waits)
                const isPlayerAutodrive = this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib');
                const canPullOut = this.currentLane && !this.currentTurnPath && !(this._reverseLeft > 0) &&
                    this.laneChangeState === 'NONE' && this.state === 'DRIVING' &&
                    !approachingIntersection && !waitingForIntersection && !isPlayerAutodrive;
                if (folkMove === 'round' && canPullOut) {
                    this._goRound(folkPlan);
                } else if (shouldOvertake && canPullOut && !(backOff && this._backUp(backOff))) {
                    const adjacentLane = this.findAdjacentLane(clearAhead);
                    if (adjacentLane) {
                        this.initiateNormalLaneChange(adjacentLane);
                    } else {
                        if (Math.abs(this.speed) < 0.5) {
                            this.stuckTimer++;
                            const waitLimit = waitBriefly ? 30 : 240;
                            if (this.stuckTimer > waitLimit) {
                                const opposingLane = this.findOpposingLane();
                                if (opposingLane) { 
                                    this.initiateOvertake(opposingLane);
                                    this.stuckTimer = 0;
                                }
                            }
                        }
                    }
                }

                // --- 4. CALCULATE AI TARGETS ---
                let targetSteer = 0;
                let targetThrottle = 0;
                let targetSpeed = this.maxSpeed;
                
                // --- DRIFT-BASED SPEED CONTROL ---
                // If drifting, reduce target speed to regain control
                if (isDrifting) {
                    // Reduce speed proportional to drift severity
                    // At max drift (severity=1), reduce to 40% of max speed
                    const driftSpeedMod = 1 - (driftSeverity * 0.6);
                    targetSpeed = this.maxSpeed * driftSpeedMod;
                }
                
                // --- INTERSECTION APPROACH SLOWDOWN ---
                let stopLineCap = Infinity;
                if (waitingForIntersection && this.postIntersectionGraceTimer <= 0) {
                    // Don't stop immediately - drive TO the queue position first
                    const nextZone = this.currentLane ? this.getNextIntersection(Math.max(200, icRange)) : null;
                    if (nextZone) {
                        const distToEntry = nextZone.entryDist - this.getDistanceAlongLane();
                        // Stop position must clear the crosswalk (one pavement width = 75px)
                        // immediately before the intersection edge, plus the car's half-length
                        // so the front bumper sits *behind* the crosswalk's outer stripe.
                        const stopDistance = 75 + this.length / 2 + 5;
                        
                        // Brake so the car comes to rest on its stop line (applied after the boosts, below)
                        stopLineCap = distToEntry - stopDistance < 2 ? 0
                            : Math.sqrt(2 * (this.brake || 0.3) * 0.8 * (distToEntry - stopDistance));
                    } else {
                        // No zone data available — intersection is behind us or stale.
                        // Release and continue instead of stopping in the middle of the lane.
                        if (this.currentIntersection) {
                            this.currentIntersection.releaseEntry(this);
                            this.currentIntersection = null;
                            this.hasIntersectionAccess = false;
                        }
                        waitingForIntersection = false;
                        this.isWaiting = false;
                    }
                } else if (nearestIntersection && !this.wasInIntersection) {
                    // Slow down when approaching intersection (even if we have access) — less going straight on a green
                    const nextZone = this.currentLane ? this.getNextIntersection(120) : null;
                    if (nextZone) {
                        const distToIntersection = nextZone.entryDist - this.getDistanceAlongLane();
                        if (distToIntersection > 0 && distToIntersection < 100) {
                            // Gradual slowdown: 100% at 100px, 60% at intersection (85% straight through lights)
                            const low = nearestIntersection.signal && this.plannedTurn && this.plannedTurn.turnType === 'straight' ? 0.85 : 0.6;
                            const approachMod = low + (distToIntersection / 100) * (1 - low);
                            targetSpeed = Math.min(targetSpeed, this.maxSpeed * approachMod);
                        }
                    }
                }
                
                // --- TRAFFIC QUEUE: FOLLOW BY STOPPING DISTANCE ---
                // The fastest we can go and still stop behind the car ahead if it brakes hard now: the bumper
                // gap less a standing gap and a few ticks of reaction, plus the leader's own stopping distance.
                // Applies in turns too, and after the aggressive-mode boosts (below), so nothing pushes past it.
                let followCap = Infinity;
                if (hasTrafficAhead) {
                    const b = (this.brake || 0.3) * 0.85, bl = trafficObstacle.brake || 0.3;
                    const minGap = 12 + this.length * 0.18;
                    const lead = trafficObstacle.vx !== undefined
                        ? trafficObstacle.vx * cos + trafficObstacle.vy * sin
                        : (trafficObstacle.speed || 0) * Math.cos((trafficObstacle.angle || 0) - this.angle);
                    const vl = Math.max(0, lead);
                    const room = trafficObstacleDist - minGap - currentSpeed * 4;
                    if (trafficObstacleDist < minGap) followCap = 0;
                    else if (room <= 0) followCap = vl * 0.85;
                    else followCap = Math.sqrt(vl * vl * (b / bl) + 2 * b * room);
                }
                
                // --- SWERVE OBSTACLE SLOWDOWN ---
                // Slow down for obstacles we need to swerve around
                // SKIP during active turn paths — committed to the maneuver
                if (hasSwerveObstacle && !needsSwerve && !this.currentTurnPath) {
                    // Can't swerve, must slow down — behind a parked car, far enough back to pull out round it
                    const closest = swerveObstacles.reduce((a, b) => a.dist < b.dist ? a : b), closestDist = closest.dist;
                    const standOff = this.length * 1.6 + (closest.entity.length || this.length) / 2;
                    const brakeDist = standOff + this.length * 1.5 + currentSpeed * 4;
                    if (closestDist < brakeDist) {
                        const brakeFactor = closestDist / brakeDist;
                        targetSpeed = Math.min(targetSpeed, this.maxSpeed * brakeFactor * 0.5);
                        if (closestDist < standOff) {
                            targetSpeed = 0;
                        }
                    }
                }
                
                // --- TURN PATH SLOWDOWN ---
                // Slow down during intersection turns (physics-based - let drift detection handle it)
                if (this.currentTurnPath) {
                    targetSpeed = Math.min(targetSpeed, this.maxSpeed * 0.70);
                }
                
                // --- AGGRESSIVE MODE SPEED BOOSTS ---
                const allowAggressiveBoost = !isDrifting || this.currentTurnPath;
                if (this.isLightAggressive && allowAggressiveBoost) {
                    targetSpeed = Math.min(this.maxSpeed * 1.2, targetSpeed * 1.2);
                } else if (this.isAggressive && this.wasInIntersection && allowAggressiveBoost) {
                    targetSpeed = Math.min(this.maxSpeed * 1.3, targetSpeed * 1.3);
                }

                // --- ZIB PLAYER PROXIMITY SLOWDOWN ---
                // Zib taxis slow down when near the player ON FOOT (not in a car)
                // Check both: this Zib has no passenger AND the player isn't driving
                const playerOnFoot = player && player.visible && !(playerCar && playerCar.hasDriver);
                if (this.isZib && !this.hasDriver && playerOnFoot) {
                    const pDist = Math.hypot(this.x - player.x, this.y - player.y);
                    if (pDist < 250) {
                        const slowFactor = Math.max(0.05, (pDist / 250) * (pDist / 250));
                        targetSpeed = Math.min(targetSpeed, this.maxSpeed * slowFactor);
                        // Full stop within 40px
                        if (pDist < 40) targetSpeed = 0;
                    }
                }
                
                // --- 5. PROCESS NAVIGATION & STEERING ---
                if (this.laneChangeState === 'CHANGING') {
                    targetSteer = this.calculateLaneChangeSteering();
                } else if (this.laneChangeState === 'OVERTAKING_OUT') {
                    targetSteer = this.calculateOvertakeOutSteering();
                } else if (this.laneChangeState === 'OVERTAKING_RETURN') {
                    targetSteer = this.calculateOvertakeReturnSteering();
                } else {
                    // Normal lane/path following
                    const navResult = this.calculateNavigationSteering();
                    targetSteer = navResult.steer;
                    if (navResult.maxSpeed < targetSpeed) {
                        targetSpeed = navResult.maxSpeed;
                    }
                    
                    // Apply swerve steering for regular AI traffic only
                    // Player/Zib autodrive should follow the exact navigation path - no swerving
                    const isPlayerAutodrive = this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib');
                    if (!isPlayerAutodrive && needsSwerve && Math.abs(swerveSteer) > 0.1) {
                        // Swerve overrides navigation when avoiding obstacles (AI traffic only)
                        targetSteer = swerveSteer;
                    }
                }
                
                // Light aggressive mode countdown
                if (this.isLightAggressive) {
                    this.lightAggressiveDuration--;
                    if (this.lightAggressiveDuration <= 0) this.isLightAggressive = false;
                }
                
                // Safety caps come last, so no boost or nudge can push a car into the one ahead, over its line, or into
                // someone on foot (stopped short of them, or going by no faster than the room allows)
                targetSpeed = Math.min(targetSpeed, followCap, stopLineCap, folkPlan.cap, folkPlan.stopCap);
                const route = this._driveRoute;
                if (route && route.index >= route.transitions.length && !this.currentTurnPath && this.currentLane === route.endLane) {
                    const remaining = (route.destination.x - this.x) * this.currentLane.ux
                        + (route.destination.y - this.y) * this.currentLane.uy;
                    targetSpeed = Math.min(targetSpeed, Math.sqrt(2 * (this.brake || 0.3) * Math.max(0, remaining - 20)));
                }
                
                // Calculate throttle to achieve target speed
                targetThrottle = AIDriverSolver.calculateThrottle(this, targetSpeed, 0.6);
                
                // --- 6. APPLY PHYSICS (Same as manual driving) ---
                this.manualGas = targetThrottle;
                this.manualTurn = targetSteer;
                // Backing up a little to get round something (traffic/traffic-people.js: _backUp)
                this._reverseStep();
                
                // --- INTERSECTION DEADLOCK RECOVERY ---
                // When a car overswings a turn and pins itself against another vehicle in
                // the intersection, regular path-advance can't free it (forward throttle
                // just pushes it deeper into the obstacle). Detect contact-stuck state and
                // reverse briefly so the car can reorient and try again on the next pass.
                // The existing turnProgress force-advance (intersectionTimer > 360) is the
                // ultimate fallback; this is the lighter intervention that fires first.
                if ((this.wasInIntersection && this.currentTurnPath) || (this._stuckRecovery > 0) ||
                    (trafficObstacle && trafficObstacleDist <= 0 && !waitingForIntersection)) {
                    if (this._stuckRecovery > 0) {
                        // Active reverse phase — override AI throttle, ease steering
                        this._stuckRecovery--;
                        this.manualGas = -0.7;
                        this.manualTurn *= 0.3;
                    } else {
                        const contactStuck = trafficObstacle 
                            && trafficObstacleDist < 6                      // bumper to bumper (or overlapping)
                            && Math.abs(this.speed) < 0.5;
                        if (contactStuck) {
                            this._stuckContactFrames++;
                            if (this._stuckContactFrames > 90) { // ~1.5s pinned
                                this._stuckRecovery = 45;        // ~0.75s reverse
                                this._stuckContactFrames = 0;
                            }
                        } else {
                            this._stuckContactFrames = 0;
                        }
                    }
                } else {
                    this._stuckContactFrames = 0;
                    this._stuckRecovery = 0;
                }
                
                this.aiDriveStep(weather, walls, buildings, decalSystem);

                // Update state flags
                this.isDriving = Math.abs(this.speed) >= 1.0 || this.laneChangeState !== 'NONE';
                if (this.turnSignalTimer > 0) this.turnSignalTimer--;
                
                // The controls persist until the next decision, so cars that think every few steps (far
                // from the player) keep braking and steering in between rather than coasting blind
            }
            
            // --- PHYSICS-BASED STEERING CALCULATIONS ---
            
            /** How fast a turn path can be followed from `t` on: by its tightest radius left, as round a bend
             *  (`_bendAhead`), and no faster than the wheel turns the car round it (`handling` rad a tick) */
            _turnSpeed(tp, t = 0) {
                const R = tp.radiusFrom(t);
                if (R === Infinity) return this.maxSpeed;
                return Math.min(this.maxSpeed, Math.max(1.5, Math.min(Math.sqrt(0.16 * R), R * (this.handling || 0.05) * 0.75)));
            }

            /** The speed to be at now to be down to a turn's speed at its start */
            _turnAhead(tp) {
                const p = tp.controlPoints[0], d = Math.max(0, Math.hypot(p.x - this.x, p.y - this.y) - 25);
                const v = this._turnSpeed(tp);
                return Math.sqrt(v * v + 2 * (this.brake || 0.3) * 0.5 * d);
            }

            /**
             * Calculate steering for normal lane/turn path following.
             * Returns steering input and recommended max speed.
             */
            calculateNavigationSteering() {
                let steer = 0;
                let maxSpeed = this.maxSpeed;
                
                // Following a turn path (intersection turn)
                if (this.currentTurnPath) {
                    // --- CURVATURE ANALYSIS (cached once per turn path) ---
                    if (this._cachedCurvaturePath !== this.currentTurnPath) {
                        this._cachedCurvature = AIDriverSolver.getCurvature(this.currentTurnPath);
                        this._cachedCurvaturePath = this.currentTurnPath;
                    }
                    const curvature = this._cachedCurvature;
                    const sharpness = Math.min(1.0, curvature / Math.PI);
                    
                    // --- PROJECT car onto curve for actual position ---
                    const proj = AIDriverSolver.projectOntoCurve(this, this.currentTurnPath, this.turnProgress);
                    const projectedT = proj.t;
                    const crossTrackDist = proj.dist;
                    
                    // Advance progress: speed-based + projected, never backward — and not while standing, nor far past
                    // where the car really is (else, waiting in the box, its aim runs on round the corner, and it cuts
                    // across it when it moves off: with lights, other cars are in the box with it)
                    const speedIncrement = Math.abs(this.speed) < 0.3 ? 0 : 0.015 * Math.max(0.5, Math.abs(this.speed) / 4);
                    this.turnProgress = Math.max(Math.min(this.turnProgress + speedIncrement, projectedT + 0.12), projectedT, this.turnProgress);
                    
                    // --- FORCE-ADVANCE if stuck in intersection ---
                    if (this.intersectionTimer > 180 && Math.abs(this.speed) < 1.0) {
                        this.turnProgress = Math.min(1.0, this.turnProgress + 0.02);
                    }
                    if (this.intersectionTimer > 360) {
                        this.turnProgress = 1.0;
                    }
                    
                    // --- LOOK-AHEAD --- a distance down the curve, longer with speed (as a share of the curve, a short kerb
                    // turn's aim sat on the car's own nose, and it began to steer only once it was already off the line)
                    const lookAhead = (14 + Math.abs(this.speed) * 5) / Math.max(20, this.currentTurnPath.length);
                    const targetT = Math.min(this.turnProgress + lookAhead, 1.0);
                    const targetPoint = this.currentTurnPath.getPoint(targetT);
                    const curveAngle = this.currentTurnPath.getAngle(targetT);
                    
                    // --- BLENDED STEERING TARGET ---
                    let steerTargetX, steerTargetY;
                    if (sharpness > 0.3 && crossTrackDist > 5) {
                        const blendWeight = Math.min(0.6, sharpness * crossTrackDist / 40);
                        steerTargetX = targetPoint.x * (1 - blendWeight) + proj.point.x * blendWeight;
                        steerTargetY = targetPoint.y * (1 - blendWeight) + proj.point.y * blendWeight;
                    } else {
                        steerTargetX = targetPoint.x;
                        steerTargetY = targetPoint.y;
                    }
                    
                    // --- STEERING with angle clamping ---
                    const dx = steerTargetX - this.x;
                    const dy = steerTargetY - this.y;
                    const targetAngle = Math.atan2(dy, dx);
                    let angleDiff = normalizeAngle(targetAngle - this.angle);
                    angleDiff = clamp(angleDiff, -Math.PI / 2, Math.PI / 2);
                    
                    const steerUrgency = 0.7 + sharpness * 0.25;
                    steer = AIDriverSolver.calculateSteering(this, this.angle + angleDiff, steerUrgency);
                    // at least the lock that arcs the car through its aim (pure pursuit: a turn rate of 2·speed·sin(off)/distance),
                    // so it turns in with the curve from the line instead of drifting out first and catching up
                    const aimDist = Math.hypot(dx, dy), speedNow = Math.abs(this.speed);
                    if (aimDist > 4 && speedNow > 0.5) {
                        const pursue = clamp(2 * speedNow * Math.sin(angleDiff) / aimDist / (this.handling || 0.05), -1, 1);
                        if (Math.sign(pursue) === Math.sign(steer) || Math.abs(steer) < 0.05) steer = Math.abs(pursue) > Math.abs(steer) ? pursue : steer;
                    }
                    
                    // --- CROSS-TRACK CORRECTION ---
                    if (crossTrackDist > 5) {
                        const corrAngle = Math.atan2(proj.point.y - this.y, proj.point.x - this.x);
                        let corrDiff = normalizeAngle(corrAngle - this.angle);
                        corrDiff = clamp(corrDiff, -Math.PI / 3, Math.PI / 3);
                        const corrStrength = Math.min(0.5, (crossTrackDist / 60) * (0.3 + sharpness * 0.7));
                        steer += corrDiff * corrStrength;
                        steer = clamp(steer, -1, 1);
                    }
                    
                    // --- POSITION NUDGE for severe off-track (rail assist) ---
                    if (crossTrackDist > 15 && sharpness > 0.25) {
                        const nudgeStrength = Math.min(0.3, (crossTrackDist - 15) / 100 * (0.2 + sharpness * 0.5));
                        this.x += (proj.point.x - this.x) * nudgeStrength;
                        this.y += (proj.point.y - this.y) * nudgeStrength;
                    }
                    
                    // --- SPEED --- what the rest of the curve allows (slowed for it before the box: `_turnAhead`), and
                    // slower still while the car is off its line
                    const curveDiff = normalizeAngle(curveAngle - this.angle);
                    maxSpeed = Math.min(this._turnSpeed(this.currentTurnPath, this.turnProgress), AIDriverSolver.calculateTurnSpeed(this, curveDiff * 0.5, 50));
                    
                    // Check if turn is complete
                    const exitPoint = this.currentTurnPath.controlPoints[this.currentTurnPath.controlPoints.length - 1];
                    const distToExit = Math.hypot(this.x - exitPoint.x, this.y - exitPoint.y);
                    if (this.turnProgress >= 1.0 || (distToExit < 20 && this.turnProgress > 0.7)) {
                        // Validate that toLane is a real lane before assigning. If the
                        // turn path's destination lane is stale or undefined, mark for
                        // clean despawn instead of dropping both refs (which would crash
                        // any code reading currentLane this frame).
                        const nextLane = this.currentTurnPath.toLane;
                        if (nextLane && typeof nextLane.length === 'number' && nextLane.start) {
                            const step = this._driveRoute?.transitions[this._driveRoute.index];
                            if (step && step.turnPath === this.currentTurnPath) this._driveRoute.index++;
                            this.currentLane = nextLane;
                            this.currentTurnPath = null;
                            this.turnProgress = 0;
                            this.turnSignal = null;
                            this._cachedCurvaturePath = null;
                        } else {
                            // Clean despawn — refs stay valid for the rest of this frame.
                            this.dead = true;
                            if (typeof console !== 'undefined') {
                                console.warn(`[TRAFFIC] Lost toLane ref after turn at (${this.x|0}, ${this.y|0}); clean despawn`);
                            }
                        }
                    }
                    
                    return { steer, maxSpeed };
                }
                
                // Following a lane
                if (!this.currentLane) return { steer: 0, maxSpeed: this.maxSpeed };
                
                // Process turn planning
                this.updateTurnPlanning();
                
                // Check if we need to start a planned turn
                if (this.plannedTurn) {
                    const turnStart = this.plannedTurn.controlPoints[0];
                    const dist = Math.hypot(turnStart.x - this.x, turnStart.y - this.y);
                    if (dist < 25) {
                        this.currentTurnPath = this.plannedTurn;
                        this.currentLane = null;
                        this.turnProgress = 0;
                        this.plannedTurn = null;
                        this.laneChangeState = 'NONE';
                        this.targetLane = null;
                        this.originalLane = null;
                        this.laneChangeProgress = 0;
                        
                        // Immediately process the new turn path
                        return this.calculateNavigationSteering();
                    }
                }
                
                // Check for end of lane
                const lx = this.x - this.currentLane.start.x;
                const ly = this.y - this.currentLane.start.y;
                const distAlongLane = lx * this.currentLane.ux + ly * this.currentLane.uy;
                const distToLaneEnd = this.currentLane.length - distAlongLane;
                
                // Check if this is a dead-end (no connections or turn paths)
                const hasConnections = (this.currentLane.connections && this.currentLane.connections.length > 0);
                const hasTurnPaths = (this.currentLane.turnPaths && this.currentLane.turnPaths.length > 0);
                const isDeadEnd = !hasConnections && !hasTurnPaths;
                
                // For autodrive player/zib: handle dead-ends (3 car lengths out)
                if (!this._driveRoute && this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib') && isDeadEnd && distToLaneEnd < 200) {
                    maxSpeed = Math.max(0, (distToLaneEnd - 50) / 150) * this.maxSpeed; // Gradual slowdown
                    if (distToLaneEnd < 80) {
                        if (this.driverType === 'zib') {
                            // Zib: clear waypoints to trigger GPS recalculation, stay in AI mode
                            this.navWaypoints = [];
                            this.currentWaypointIndex = 0;
                            return { steer, maxSpeed: 0 };
                        } else {
                            this.disableAutoDrive();
                            showMessage("END OF ROAD - AUTO-DRIVE DISENGAGED");
                            return { steer, maxSpeed: 0 };
                        }
                    }
                }
                
                if (distAlongLane >= this.currentLane.length - 10) {
                    if (hasConnections) {
                        // NAVIGATION-AWARE CONNECTION SELECTION
                        // For autodrive, pick the connection that leads to the expected road/segment
                        let nextLane = this.currentLane.connections[0]; // Default to first
                        const routeStep = this._driveRoute?.transitions[this._driveRoute.index];
                        if (routeStep && !routeStep.turnPath && routeStep.fromLane === this.currentLane) nextLane = routeStep.toLane;
                        
                        if (!this._driveRoute && this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib')) {
                            const expectedSegment = this.getExpectedNavSegment();
                            if (expectedSegment) {
                                for (let conn of this.currentLane.connections) {
                                    if (conn.segment === expectedSegment || conn.segmentId === expectedSegment.id) {
                                        nextLane = conn;
                                        // console.log(`[AUTODRIVE] Connection to segment: ${expectedSegment.id}`);
                                        break;
                                    }
                                }
                            }
                            
                            // Fallback: road-based matching
                            if (nextLane === this.currentLane.connections[0]) {
                                const expectedRoad = this.getExpectedNavRoad();
                                if (expectedRoad) {
                                    for (let conn of this.currentLane.connections) {
                                        if (conn.road === expectedRoad) {
                                            nextLane = conn;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        this.currentLane = nextLane;
                        const step = this._driveRoute?.transitions[this._driveRoute.index];
                        if (step && !step.turnPath && step.toLane === nextLane) this._driveRoute.index++;
                        // Round a curve the lanes are short pieces: catch up with any we're already past, and steer on along
                        // the new one this tick (a tick without steering at each piece would carry us wide)
                        for (let hop = 0; hop < 24; hop++) {
                            const ln = this.currentLane, next = ln.connections && ln.connections.length === 1 && !(ln.turnPaths && ln.turnPaths.length) ? ln.connections[0] : null;
                            if (!next || (this.x - ln.start.x) * ln.ux + (this.y - ln.start.y) * ln.uy < ln.length - 10) break;
                            this.currentLane = next;
                            const st = this._driveRoute?.transitions[this._driveRoute.index];
                            if (st && !st.turnPath && st.toLane === next) this._driveRoute.index++;
                        }
                        if (this.currentLane.road && this.currentLane.road.isCurved) return this.calculateNavigationSteering();
                    } else {
                        if (this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib')) {
                            if (this.driverType === 'zib') {
                                // Zib: clear waypoints to trigger GPS recalculation, stay in AI mode
                                maxSpeed = 0;
                                this.navWaypoints = [];
                                this.currentWaypointIndex = 0;
                            } else {
                                maxSpeed = 0;
                                this.disableAutoDrive();
                                showMessage("END OF ROAD REACHED");
                            }
                        } else {
                            this.dead = true;
                        }
                    }
                    return { steer, maxSpeed };
                }
                
                // Round a bend ahead: slow to take it, and aim closer in (a long look cuts the corner)
                const R = this._bendAhead(this.currentLane, distAlongLane, 60 + Math.abs(this.speed) * 22);
                if (R < Infinity) maxSpeed = Math.min(maxSpeed, Math.max(2.5, Math.sqrt(0.16 * R)));
                // A turn coming up: slow to take it by the time we reach it (braking only as hard as a gentle stop)
                if (this.plannedTurn) maxSpeed = Math.min(maxSpeed, this._turnAhead(this.plannedTurn));
                
                // Get look-ahead target on lane
                const laneTarget = AIDriverSolver.getLaneTarget(this, this.currentLane, 50, R * 0.6);
                if (laneTarget) {
                    // Stepping aside within the lane to pass someone at its edge (traffic/traffic-people.js: sideStep)
                    const ln = this.currentLane, side = this._folkPlan ? this._folkPlan.sideStep : 0;
                    steer = AIDriverSolver.steerToward(this, laneTarget.x - ln.uy * side, laneTarget.y + ln.ux * side, 0.5);
                    
                    // Also correct for lateral offset (drift correction)
                    const lateralOffset = AIDriverSolver.getLateralOffset(this, this.currentLane) - side;
                    if (Math.abs(lateralOffset) > 5) {
                        // Additional steering to return to lane center
                        const correctionSteer = -lateralOffset * 0.02;
                        steer += Math.max(-0.3, Math.min(0.3, correctionSteer));
                    }
                }
                
                return { steer, maxSpeed };
            }
            
            /** How tight the road bends within `reach` px ahead, down the lanes we run into (a curve's lanes are short
             *  straight pieces, each turned a little from the last): its smallest radius there, or Infinity if straight */
            _bendAhead(lane, along, reach) {
                let R = Infinity, ln = lane, d = -along;
                for (let hop = 0; d < reach && hop < 24; hop++) {
                    const next = ln.connections && ln.connections.length === 1 ? ln.connections[0] : null;
                    if (!next) break;
                    const turn = Math.abs(Math.atan2(ln.ux * next.uy - ln.uy * next.ux, ln.ux * next.ux + ln.uy * next.uy));
                    if (turn > 0.02) R = Math.min(R, Math.min(ln.length, next.length) / turn);
                    d += ln.length; ln = next;
                }
                return R;
            }
            
            /**
             * Update turn planning logic (look for upcoming turns).
             * V2: Uses pre-determined turn paths from navigation waypoints.
             * When waypoints exist with road info, pick the turn that leads to the correct road.
             */
            updateTurnPlanning() {
                if (this.plannedTurn || !this.currentLane.turnPaths || this.currentLane.turnPaths.length === 0) return;
                if (this._driveRoute) {
                    const step = this._driveRoute.transitions[this._driveRoute.index];
                    if (step && step.fromLane === this.currentLane && step.turnPath) {
                        this.plannedTurn = step.turnPath;
                        const diff = normalizeAngle(step.toLane.angle - this.currentLane.angle);
                        this.turnSignal = Math.abs(diff) > 0.5 ? (diff > 0 ? 'right' : 'left') : null;
                        this.turnSignalTimer = 150;
                    }
                    return;
                }
                
                // Plan early enough to see where we're going from the stop line (and to check the exit has room)
                const planReach = 200 + this.length / 2 + this.stoppingDistance();
                const isAutodrive = this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib');
                let relevantPaths = this.currentLane.turnPaths.filter(p => {
                    const start = p.controlPoints[0];
                    return Math.hypot(start.x - this.x, start.y - this.y) < planReach;
                });
                // Traffic doesn't U-turn in the box (too tight: it ends up across both lanes)
                if (!isAutodrive) {
                    const noU = relevantPaths.filter(p => !p.toLane || Math.abs(normalizeAngle(p.toLane.angle - this.currentLane.angle)) < 2.5);
                    if (noU.length) relevantPaths = noU;
                }

                if (relevantPaths.length === 0) return;
                
                let chosenPath = null;
                
                if (this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib')) {
                    // --- PLAYER/ZIB AUTODRIVE (nav waypoint guided) ---
                    
                    // === V2: Look for pre-determined turn path ===
                    if (this.navWaypoints && this.navWaypoints.length > 0) {
                        this.advanceToRelevantWaypoint();
                        
                        // Search for a TURN_PATH waypoint in upcoming waypoints
                        for (let i = this.currentWaypointIndex; i < this.navWaypoints.length; i++) {
                            const wp = this.navWaypoints[i];
                            
                            // V2: Pre-determined turn path
                            if (wp.type === 'TURN_PATH' && wp.turnPath) {
                                // Check if this turn path starts from our current lane
                                if (wp.turnPath.fromLaneId === this.currentLane.id) {
                                    chosenPath = wp.turnPath;
                                    // console.log(`[AUTODRIVE] Using pre-determined turn: ${wp.turnPathId}`);
                                    break;
                                }
                                // Check if turn path is from a connected lane (same road, same direction)
                                if (wp.turnPath.fromRoadId === this.currentLane.roadId) {
                                    // Find this turn path in relevantPaths (it should connect to the same destination)
                                    const matchingPath = relevantPaths.find(rp => 
                                        rp.toLaneId === wp.turnPath.toLaneId || 
                                        rp.toSegmentId === wp.turnPath.toSegmentId
                                    );
                                    if (matchingPath) {
                                        chosenPath = matchingPath;
                                        // console.log(`[AUTODRIVE] Using matching turn to segment: ${wp.turnPath.toSegmentId}`);
                                        break;
                                    }
                                }
                            }
                            
                            // Gate exit waypoint tells us which lane to target
                            if (wp.type === 'GATE_EXIT' && wp.lane) {
                                // Find turn path that leads to this lane
                                const targetPath = relevantPaths.find(rp => 
                                    rp.toLaneId === wp.laneId || 
                                    rp.toSegmentId === wp.segmentId
                                );
                                if (targetPath) {
                                    chosenPath = targetPath;
                                    // console.log(`[AUTODRIVE] Turn to gate exit lane: ${wp.laneId}`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // === FALLBACK: Road-based selection ===
                    if (!chosenPath && this.navWaypoints && this.navWaypoints.length > 0) {
                        let navTarget = null;
                        let turnTarget = null;
                        
                        for (let i = this.currentWaypointIndex; i < this.navWaypoints.length; i++) {
                            const wp = this.navWaypoints[i];
                            if (!navTarget) navTarget = wp;
                            
                            if (wp.intersectionId && wp.road) {
                                turnTarget = wp;
                                break;
                            }
                        }
                        
                        if (!navTarget && this.navDestination) {
                            navTarget = this.navDestination;
                        }
                        
                        if (turnTarget && turnTarget.road) {
                            for (let path of relevantPaths) {
                                if (path.toLane.road === turnTarget.road) {
                                    chosenPath = path;
                                    break;
                                }
                            }
                            
                            if (!chosenPath) {
                                let bestDist = Infinity;
                                for (let path of relevantPaths) {
                                    const endPoint = path.controlPoints[path.controlPoints.length - 1];
                                    const dist = Math.hypot(endPoint.x - turnTarget.x, endPoint.y - turnTarget.y);
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        chosenPath = path;
                                    }
                                }
                            }
                        } else if (navTarget) {
                            let bestDist = Infinity;
                            for (let path of relevantPaths) {
                                const endPoint = path.controlPoints[path.controlPoints.length - 1];
                                const dist = Math.hypot(endPoint.x - navTarget.x, endPoint.y - navTarget.y);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    chosenPath = path;
                                }
                            }
                        }
                    }
                    
                    // No waypoints - random cruise
                    if (!chosenPath && !this.navWaypoints?.length) {
                        chosenPath = this.pickCruiseTurn(relevantPaths);
                    }
                } else {
                    // Regular AI traffic behavior
                    chosenPath = this.pickTrafficTurn(relevantPaths);
                }

                if (chosenPath) {
                    this.plannedTurn = chosenPath;
                    const angleDiff = chosenPath.toLane.angle - this.currentLane.angle;
                    if (Math.abs(angleDiff) > 0.5) {
                        let diff = angleDiff;
                        while(diff > Math.PI) diff -= Math.PI*2;
                        while(diff < -Math.PI) diff += Math.PI*2;
                        this.turnSignal = diff > 0 ? 'right' : 'left';
                        this.turnSignalTimer = 150;
                    }
                }
            }
            
            /**
             * Pick a turn for cruising (no destination) - prefers roads with more intersections ahead
             */
            pickCruiseTurn(relevantPaths) {
                const isSafePath = (path) => {
                    const lane = path.toLane;
                    const entryX = path.controlPoints.at(-1).x;
                    const entryY = path.controlPoints.at(-1).y;
                    const dx = entryX - lane.start.x;
                    const dy = entryY - lane.start.y;
                    const entryDist = dx * lane.ux + dy * lane.uy;
                    if (!lane.intersectingZones) return false;
                    const intersectionsAhead = lane.intersectingZones.filter(z => z.entryDist > entryDist + 100);
                    return intersectionsAhead.length > 0;
                };
                
                const allowed = relevantPaths.filter(p => TrafficVehicle.laneMayTake(this.currentLane, p));
                const from = allowed.length ? allowed : relevantPaths;
                const safePaths = from.filter(p => isSafePath(p));
                const pool = safePaths.length > 0 ? safePaths : from;
                const straightPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) < 0.5);
                const turnPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) >= 0.5);
                
                const myDist = this.getDistanceAlongLane();
                const zonesAhead = this.currentLane.intersectingZones 
                    ? this.currentLane.intersectingZones.filter(z => z.entryDist > myDist + 200) 
                    : [];
                const isLastExit = zonesAhead.length === 0;

                if (isLastExit && turnPaths.length > 0) {
                    return turnPaths[Math.floor(Math.random() * turnPaths.length)];
                } else {
                    if (turnPaths.length > 0 && Math.random() < 0.2) {
                        return turnPaths[Math.floor(Math.random() * turnPaths.length)];
                    } else if (straightPaths.length > 0) {
                        return straightPaths[0];
                    }
                }
                return null;
            }
            
            /**
             * Pick a turn for regular AI traffic
             */
            pickTrafficTurn(relevantPaths) {
                const isSafePath = (path) => {
                    const lane = path.toLane;
                    const entryX = path.controlPoints.at(-1).x;
                    const entryY = path.controlPoints.at(-1).y;
                    const dx = entryX - lane.start.x;
                    const dy = entryY - lane.start.y;
                    const entryDist = dx * lane.ux + dy * lane.uy;
                    if (!lane.intersectingZones) return false;
                    const intersectionsAhead = lane.intersectingZones.filter(z => z.entryDist > entryDist + 100);
                    return intersectionsAhead.length > 0;
                };
                
                // Lane discipline first (before what's safe ahead, which could otherwise leave only a turn this lane
                // mustn't make): right only from the kerb lane, left from the inside lane, straight on from any (only a
                // lane with no other way out turns from where it is, side by side with the next), and come out in the
                // matching lane across the road (inside to inside, kerb to kerb), so cars side by side in the box don't
                // cut across each other and a turn waits in its own lane, out of the way of cars going on
                const rank = TrafficVehicle._laneRank, mine = rank(this.currentLane);
                const allowed = relevantPaths.filter(p => TrafficVehicle.laneMayTake(this.currentLane, p));
                const from = allowed.length ? allowed : relevantPaths;
                const safePaths = from.filter(p => isSafePath(p));
                let pool = safePaths.length > 0 ? safePaths : from;
                const matching = (p) => {
                    let best = p;
                    for (const q of pool) {
                        if (q.toLane.road === p.toLane.road && q.toLane.direction === p.toLane.direction &&
                            Math.abs(rank(q.toLane) - mine) < Math.abs(rank(best.toLane) - mine)) best = q;
                    }
                    return best;
                };
                const straightPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) < 0.5);
                const turnPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) >= 0.5);

                let chosenPath = null;
                if (turnPaths.length > 0 && Math.random() < this.turnProbability) {
                    chosenPath = matching(turnPaths[Math.floor(Math.random() * turnPaths.length)]);
                }
                if (!chosenPath && straightPaths.length > 0) chosenPath = matching(straightPaths[0]);
                if (!chosenPath && turnPaths.length > 0) chosenPath = matching(turnPaths[Math.floor(Math.random() * turnPaths.length)]);
                return chosenPath;
            }

            /** May a car in `lane` take turn path `p`: right only from the kerb lane, left only from the inside lane, straight
             *  on from any (a one-lane side does all three) */
            static laneMayTake(lane, p) {
                if (p.turnType === 'straight' || !lane.road || !lane.road.symmetrical) return true;
                const mine = TrafficVehicle._laneRank(lane);
                return p.turnType === 'left' ? mine === 0 : p.turnType === 'right' ? mine === lane.road.numLanes - 1 : true;
            }

            /** Which lane across its side of the road: 0 the inside one (by the centre line), up to numLanes − 1 at the kerb */
            static _laneRank(lane) {
                const r = lane.road, w = r.laneWidth || 60;
                if (lane._rank === undefined) lane._rank = Math.max(0, Math.round((Math.abs(r.worldToParam(lane.start.x, lane.start.y).lateral) - w / 2) / w));
                return lane._rank;
            }
            
            /**
             * Steering onto `lane`'s line, our way along it (pure pursuit): aim a little way ahead on the line, so the
             * car eases onto it rather than reaching a point at an angle and swinging on past (`look` is shorter when
             * pulling out from a crawl, round something close ahead). Returns the steer and how far off the line we are.
             */
            _steerOntoLane(lane, urgency, look = this.length * 1.2) {
                const dir = this.originalLane || this.currentLane || lane;
                look = Math.max(look, Math.abs(this.speed) * 14);
                const aim = this._laneProject(lane, this.x + dir.ux * look, this.y + dir.uy * look);
                return { steer: AIDriverSolver.steerToward(this, aim.x, aim.y, urgency), off: Math.abs(this._latTo(lane)) };
            }

            /**
             * Calculate steering for lane change maneuver.
             */
            calculateLaneChangeSteering() {
                if (!this.targetLane || !this.originalLane || !this.originalLane.road) {
                    this.laneChangeState = 'NONE';
                    return 0;
                }
                
                // Progress based on actual distance traveled
                const totalDist = Math.hypot(this.laneChangeEndX - this.laneChangeStartX, this.laneChangeEndY - this.laneChangeStartY);
                const currentDist = Math.hypot(this.x - this.laneChangeStartX, this.y - this.laneChangeStartY);
                this.laneChangeProgress = Math.min(1.0, currentDist / totalDist);
                
                // Onto the target lane's line; done once on it (or well past where it was meant to end)
                const { steer, off } = this._steerOntoLane(this.targetLane, 0.6, this._pullOutLook);
                if (off < 6 || this.laneChangeProgress >= 1.0 && off < 15 || currentDist > totalDist * 2.5) {
                    this.currentLane = this.targetLane;
                    this.laneChangeState = 'NONE';
                    this.targetLane = null;
                    this.originalLane = null;
                    this.laneChangeProgress = 0;
                    this.turnSignal = null;
                }
                
                return steer;
            }
            
            /**
             * Calculate steering for overtake (moving to opposing lane).
             */
            calculateOvertakeOutSteering() {
                if (!this.targetLane || !this.originalLane || !this.originalLane.road) {
                    this.laneChangeState = 'NONE';
                    return 0;
                }
                
                // Progress based on distance
                const totalDist = Math.hypot(this.laneChangeEndX - this.laneChangeStartX, this.laneChangeEndY - this.laneChangeStartY);
                const currentDist = Math.hypot(this.x - this.laneChangeStartX, this.y - this.laneChangeStartY);
                this.laneChangeProgress = Math.min(1.0, currentDist / totalDist);
                
                // Onto the oncoming lane's line (our way along it); out once on it
                const { steer, off } = this._steerOntoLane(this.targetLane, 0.7, this._pullOutLook);
                if (off < 8 || this.laneChangeProgress >= 1.0 && off < 15 || currentDist > totalDist * 2.5) {
                    // Setup return maneuver
                    this.laneChangeState = 'OVERTAKING_RETURN';
                    this.laneChangeProgress = 0;
                    this.stateTimer = 180; // Wait before returning
                    this.turnSignal = null;
                    this.laneChangeStartX = this.x;
                    this.laneChangeStartY = this.y;
                    
                    const forwardDist = this.length * 3, ol = this.originalLane;
                    const onOrig = this._laneProject(ol, this.x + ol.ux * forwardDist, this.y + ol.uy * forwardDist);
                    this.laneChangeEndX = onOrig.x;
                    this.laneChangeEndY = onOrig.y;
                    
                    this.laneChangeTargetAngle = this.originalLane.angle;
                }
                
                return steer;
            }
            
            /**
             * Calculate steering for returning from overtake.
             */
            calculateOvertakeReturnSteering() {
                if (!this.targetLane || !this.originalLane || !this.originalLane.road) {
                    this.laneChangeState = 'NONE';
                    return 0;
                }
                
                // Wait period before returning — and keep waiting until the lane we're cutting back into is clear
                if (this.stateTimer <= 0 && this.laneChangeProgress === 0 && !this.isLaneClear(this.originalLane, this.length * 2)) this.stateTimer = 10;
                if (this.stateTimer > 0) {
                    this.stateTimer--;
                    // Hold the oncoming lane's line while we pass (squaring up alone let the car drift on across)
                    return this._steerOntoLane(this.targetLane, 0.5).steer;
                }
                
                // Progress based on distance
                const totalDist = Math.hypot(this.laneChangeEndX - this.laneChangeStartX, this.laneChangeEndY - this.laneChangeStartY);
                const currentDist = Math.hypot(this.x - this.laneChangeStartX, this.y - this.laneChangeStartY);
                this.laneChangeProgress = Math.min(1.0, currentDist / totalDist);
                
                // Back onto our own lane's line
                const { steer, off } = this._steerOntoLane(this.originalLane, 0.6);
                
                // Setup turn signal
                if (this.laneChangeProgress < 0.5 && this.turnSignalTimer === 0) {
                    const road = this.originalLane.road;
                    if (road.orientation === 'H') {
                        this.turnSignal = this.originalLane.laneIndex > this.targetLane.laneIndex ? 'right' : 'left';
                    } else {
                        this.turnSignal = this.originalLane.laneIndex > this.targetLane.laneIndex ? 'right' : 'left';
                    }
                    this.turnSignalTimer = 80;
                }
                
                // Check completion
                if (off < 6 || this.laneChangeProgress >= 1.0 && off < 15 || currentDist > totalDist * 2.5) {
                    this.currentLane = this.originalLane;
                    this.laneChangeState = 'NONE';
                    this.targetLane = null;
                    this.originalLane = null;
                    this.laneChangeProgress = 0;
                    this.turnSignal = null;
                }
                
                return steer;
            }
            
            initiateNormalLaneChange(targetLane) {
                this.laneChangeState = 'CHANGING';
                this._pullOutLook = Math.abs(this.speed) < 2 ? this.length * 0.75 : undefined;   // from a crawl: pulling out round something
                this.targetLane = targetLane;
                this.laneChangeProgress = 0;
                this.originalLane = this.currentLane;
                this.laneChangeStartX = this.x;
                this.laneChangeStartY = this.y;
                
                // End point: on the target lane's centre line, a car and a half ahead (any road direction)
                const forwardDist = this.length * 1.5;
                const onTarget = this._laneProject(targetLane, this.x + this.currentLane.ux * forwardDist, this.y + this.currentLane.uy * forwardDist);
                this.laneChangeEndX = onTarget.x;
                this.laneChangeEndY = onTarget.y;
                
                this.laneChangeDiagonalAngle = Math.atan2(this.laneChangeEndY - this.laneChangeStartY, this.laneChangeEndX - this.laneChangeStartX);
                this.laneChangeTargetAngle = this.currentLane.angle;
                
                if (this.currentLane.road.orientation === 'H') this.turnSignal = targetLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                else this.turnSignal = targetLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                this.turnSignalTimer = 100;
            }
            
            initiateOvertake(opposingLane) {
                this.laneChangeState = 'OVERTAKING_OUT';
                this._pullOutLook = Math.abs(this.speed) < 2 ? this.length * 0.75 : undefined;
                this.targetLane = opposingLane;
                this.originalLane = this.currentLane;
                this.laneChangeProgress = 0;
                this.laneChangeStartX = this.x;
                this.laneChangeStartY = this.y;
                
                const forwardDist = this.length * 1.5;
                const onTarget = this._laneProject(opposingLane, this.x + this.currentLane.ux * forwardDist, this.y + this.currentLane.uy * forwardDist);
                this.laneChangeEndX = onTarget.x;
                this.laneChangeEndY = onTarget.y;
                
                this.laneChangeDiagonalAngle = Math.atan2(this.laneChangeEndY - this.laneChangeStartY, this.laneChangeEndX - this.laneChangeStartX);
                this.laneChangeTargetAngle = this.currentLane.angle;
                
                if (this.currentLane.road.orientation === 'H') this.turnSignal = opposingLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                else this.turnSignal = opposingLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                this.turnSignalTimer = 80;
            }
        }

