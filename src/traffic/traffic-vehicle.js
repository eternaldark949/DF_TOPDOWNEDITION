        /* --- UNIFIED TRAFFIC VEHICLE CLASS --- */
        /* Supports AI driving, manual player control, and brand-specific visuals */
        /* --- UNIFIED TRAFFIC VEHICLE CLASS --- */
        /* --- UNIFIED TRAFFIC VEHICLE CLASS (With Skids & Debris) --- */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                     TRAFFIC SYSTEM                                ║
        // ╚══════════════════════════════════════════════════════════════════╝
        class TrafficVehicle extends VehicleEntity {
            constructor(lane, brand = null, model = null, controlMode = 'AI') {
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
                    const spawnOffset = vehicleLength * 2; // 2 car lengths into the lane
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
                    mass: modelData.mass || 1200,
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
                
                // --- OWNED CAR MARKER STATE ---
                this.markerOpacity = 0;
                this.markerTargetOpacity = 0;
                
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
                const maxDim = Math.max(this.length, this.width);
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
                
                // Owned Car Marker (always render - important UI element)
                if (this.isOwnedCar && this.controlMode !== 'PLAYER' && this.markerOpacity > 0.01) {
                    const breathe = (Math.sin(_frameTime / 800) + 1) / 2; 
                    const scale = 1.0 + (breathe * 0.15); 
                    const alpha = this.markerOpacity;
                    
                    ctx.shadowColor = `rgba(255, 215, 0, ${alpha})`;
                    ctx.shadowBlur = (25 + (breathe * 15)) * alpha;
                    ctx.fillStyle = `rgba(255, 215, 0, ${(0.25 + breathe * 0.25) * alpha})`;
                    
                    const baseSize = 8;
                    const scaledSize = baseSize * scale;
                    ctx.beginPath();
                    ctx.rect(-this.length/2 - scaledSize, -this.width/2 - scaledSize, 
                             this.length + scaledSize * 2, this.width + scaledSize * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    
                    ctx.font = `bold ${12 * scale}px Courier New`;
                    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
                    ctx.textAlign = 'center';
                    ctx.fillText('YOUR CAR', 0, -this.width/2 - (20 * scale));
                }
                
                // Delivery Vehicle Marker (pulsing violet)
                if (this.isDeliveryVehicle) {
                    const breathe = (Math.sin(_frameTime / 600) + 1) / 2; 
                    const scale = 1.0 + (breathe * 0.1);
                    
                    ctx.shadowColor = `rgba(164, 105, 255, 0.6)`;
                    ctx.shadowBlur = 15 + (breathe * 10);
                    ctx.fillStyle = `rgba(164, 105, 255, ${0.15 + breathe * 0.15})`;
                    ctx.beginPath();
                    ctx.rect(-this.length/2 - 6, -this.width/2 - 6, this.length + 12, this.width + 12);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    
                    ctx.font = `bold ${10 * scale}px Courier New`;
                    ctx.fillStyle = `rgba(164, 105, 255, ${0.7 + breathe * 0.3})`;
                    ctx.textAlign = 'center';
                    ctx.fillText('AMBER DELIVERY', 0, -this.width/2 - (16 * scale));
                }
                
                // Status Shadows - LOD: skip for distant vehicles
                if (!farLOD) {
                    if (this.isAggressive) {
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
                    const distToEntry = zone.entryDist - myProgress;
                    if (distToEntry > -50 && distToEntry < approachDistance) return zone;
                }
                return null;
            }
            
            findAdjacentLane() {
                if (!this.currentLane || !this.currentLane.road) return null;
                const road = this.currentLane.road;
                const myIndex = this.currentLane.laneIndex;
                for (let lane of road.lanes) {
                    if (lane.isOpposing === this.currentLane.isOpposing && lane.laneIndex !== myIndex) {
                        if (this.isLaneClear(lane, 150)) return lane;
                    }
                }
                return null;
            }
            
            findOpposingLane() {
                if (!this.currentLane || !this.currentLane.road || !this.currentLane.road.symmetrical) return null;
                const road = this.currentLane.road;
                for (let lane of road.lanes) {
                    if (lane.isOpposing !== this.currentLane.isOpposing) {
                        if (this.isLaneClear(lane, 200)) return lane;
                    }
                }
                return null;
            }
            
            isLaneClear(targetLane, checkDistance) {
                const lookAhead = 40; 
                let targetX, targetY;
                if (targetLane.road.orientation === 'H') {
                    targetX = this.x + Math.cos(targetLane.angle) * lookAhead;
                    targetY = targetLane.start.y; 
                } else {
                    targetX = targetLane.start.x;
                    targetY = this.y + Math.sin(targetLane.angle) * lookAhead;
                }
                const isOpposing = (targetLane.isOpposing !== this.currentLane.isOpposing);
                const safetyRadius = isOpposing ? 150 : 55;
                if (this._allVehicles) {
                    for (let v of this._allVehicles) {
                        if (v === this) continue;
                        // PERFORMANCE: Quick distance reject — lane change only cares about nearby
                        const dvx = v.x - targetX;
                        const dvy = v.y - targetY;
                        if (dvx * dvx + dvy * dvy > safetyRadius * safetyRadius * 4) continue;
                        if (Math.hypot(dvx, dvy) < safetyRadius) return false;
                    }
                }
                if (this._playerCar && this._playerCar.visible) {
                    if (Math.hypot(this._playerCar.x - targetX, this._playerCar.y - targetY) < safetyRadius) return false;
                }
                return true; 
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
                    this.currentLane = nearestLane;
                    this.controlMode = 'AI';
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
        
                // 2. Thresholds
                // Lowered from 1.5 to 0.8 to make skids appear more easily during turns
                const driftThreshold = 0.8; 
                
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
                
                // Manual burnout/braking check
                // If we are pressing gas but moving slowly, or direction opposes velocity
                if (this.controlMode === 'PLAYER') {
                    const movingBackwards = (this.vx * fwdX + this.vy * fwdY) < 0;
                    const gasForward = this.manualGas > 0;
                    
                    // Burnout / Handbrake turn logic
                    if ((Math.abs(this.speed) > 2 && Math.sign(this.manualGas) !== Math.sign(this.speed) && this.manualGas !== 0)) {
                        isSkidding = true;
                        intensity = Math.max(intensity, 0.6); // Hard skid
                    }
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

                // --- GRIP ---
                let grip = VD.GRIP_BASE;
                if (weather && weather.isRaining) {
                    // Wet-road grip scales with how hard it's actually raining —
                    // a drizzle barely costs you, a storm is genuinely slick.
                    grip = VD.GRIP_BASE - VD.GRIP_RAIN_PENALTY *
                        Math.min(1, weather.getRainScale ? weather.getRainScale() : 1);
                }
                if (this.surfaceFriction) grip *= this.surfaceFriction;
                if (gripFloor > 0) grip = Math.max(grip, gripFloor);

                // --- STEERING ---
                const absSpeed = Math.abs(this.speed);
                if (absSpeed > VD.STEER_MIN_SPEED) {
                    // Latch steering direction — only flip when speed clearly
                    // crosses the dead zone. Prevents direction jitter that
                    // causes wiggle at low reverse speeds.
                    if (this.speed > 1.0) this._steerDir = 1;
                    else if (this.speed < -1.0) this._steerDir = -1;
                    const direction = this._steerDir || 1;
                    const handlingMod = (weather && weather.isRaining)
                        ? (1.0 - VD.HANDLING_RAIN_PENALTY *
                            Math.min(1, weather.getRainScale ? weather.getRainScale() : 1))
                        : 1.0;

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
                    this.angle += this.manualTurn * this.handling * handlingMod
                                * direction * reverseSteerFactor * authority;
                }

                // --- THROTTLE ---
                if (Math.abs(this.manualGas) > 0.1) {
                    this.vx += Math.cos(this.angle) * this.manualGas * acceleration;
                    this.vy += Math.sin(this.angle) * this.manualGas * acceleration;
                }

                // --- DRIFT DECOMPOSITION ---
                const fwdX = Math.cos(this.angle);
                const fwdY = Math.sin(this.angle);
                const rightX = -Math.sin(this.angle);
                const rightY = Math.cos(this.angle);
                let fwdVelocity = this.vx * fwdX + this.vy * fwdY;
                let slideVelocity = this.vx * rightX + this.vy * rightY;

                this.applySkids(decalSystem);

                // --- RAIN SPRAY ---
                if (weather && weather.isRaining && Math.abs(fwdVelocity) > 2.0) {
                    // Spray frequency tracks rain strength — wet roads throw more water.
                    const sprayChance = 0.7 * Math.min(1, weather.getRainScale ? weather.getRainScale() : 1);
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

                // --- DRIFT SMOKE + GRIP BREAKAWAY ---
                if (Math.abs(slideVelocity) > VD.GRIP_SLIDE_THRESHOLD) {
                    grip *= VD.GRIP_SLIDE_PENALTY;
                    if (weather && Math.random() > 0.2) {
                        const smokeColor = 'rgba(30, 30, 30, 0.6)';
                        const slipSpeed = Math.abs(slideVelocity);
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

                // --- RECOMPOSE + DRAG ---
                slideVelocity *= grip;
                this.vx = fwdVelocity * fwdX + slideVelocity * rightX;
                this.vy = fwdVelocity * fwdY + slideVelocity * rightY;
                const dragNow = (fwdVelocity > 0 ? drag : reverseDrag);
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

                /* Axis-separated wall response.
                   The old code reversed the WHOLE velocity vector on any contact,
                   so clipping a wall at a shallow angle killed all forward
                   momentum and threw the car backwards. Now the move is retried
                   one axis at a time: whichever axis is clear still moves, so a
                   glancing hit scrapes along the surface and keeps most of its
                   speed. Only a genuine head-on (both axes blocked) bounces.

                   checkEnvironmentCollision returns a bool rather than a contact
                   normal, so these two probes ARE the normal detection — and they
                   only run on frames where something was actually hit. */
                const w_ = walls || [], b_ = buildings || [];
                const collided = this.checkEnvironmentCollision(nextX, nextY, this.angle, w_, b_);
                if (collided) {
                    const blockedX = this.checkEnvironmentCollision(nextX, this.y, this.angle, w_, b_);
                    const blockedY = this.checkEnvironmentCollision(this.x, nextY, this.angle, w_, b_);
                    if (!blockedX) {
                        this.x = nextX;                          // wall runs along X
                        this.vx *= VA.WALL_SLIDE_FRICTION;
                        this.vy *= VA.WALL_BOUNCE_FACTOR;
                    } else if (!blockedY) {
                        this.y = nextY;                          // wall runs along Y
                        this.vy *= VA.WALL_SLIDE_FRICTION;
                        this.vx *= VA.WALL_BOUNCE_FACTOR;
                    } else {
                        this.vx *= VA.WALL_BOUNCE_FACTOR;        // corner / head-on
                        this.vy *= VA.WALL_BOUNCE_FACTOR;
                        this.x += this.vx * VA.WALL_PUSHOUT;
                        this.y += this.vy * VA.WALL_PUSHOUT;
                    }
                    // Re-derive forward speed from the corrected velocity so the
                    // HUD, engine audio and skid logic agree with what the car is
                    // actually doing after the impact.
                    this.speed = this.vx * fwdX + this.vy * fwdY;
                } else {
                    this.x = nextX;
                    this.y = nextY;
                }
                return collided;
            }

            // --- MANUAL UPDATE (With Physics & Skids) ---
            updateManualDriving(walls, buildings, weather, decalSystem) { // Added decalSystem
                if (typeof this.vx === 'undefined') { this.vx = 0; this.vy = 0; }
                if (Math.abs(this.speed) < 0.1 && this.manualGas === 0) this.parkIdleTimer++; else this.parkIdleTimer = 0;
                
                // Player gets the speed-dependent steering curve; see applyDrivePhysics.
                this.applyDrivePhysics({ weather, walls, buildings, decalSystem, steerCurve: true });

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
                if (walls) {
                    for (let w of walls) {
                        if (nextX + this.length < w.x || nextX - this.length > w.x + w.w || nextY + this.width < w.y || nextY - this.width > w.y + w.h) continue;
                        if (PhysicsSystem.checkOBBvsAABB(futureOBB, w)) return true;
                    }
                }
                if (buildings) {
                    for (let b of buildings) {
                        if (nextX + this.length < b.x || nextX - this.length > b.x + b.w || nextY + this.width < b.y || nextY - this.width > b.y + b.h) continue;
                        if (PhysicsSystem.checkOBBvsAABB(futureOBB, b)) return true;
                    }
                }
                return false;
            }
        
            // --- MAIN UPDATE (AI & Logic) ---
            update(player, playerCar, allVehicles, weather, intersections = [], walls = [], buildings = [], decalSystem, teammates = []) {
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
                this.updateAIDriving(player, playerCar, allVehicles, weather, intersections, walls, buildings, decalSystem, teammates);
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

            updateAIDriving(player, playerCar, allVehicles, weather, intersections, walls, buildings, decalSystem, teammates = []) {
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
                
                if (this.currentIntersection) {
                    const isInside = this.currentIntersection.isVehicleInside(this);
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
                            const nextZone = this.getNextIntersection(200);
                            if (nextZone && nextZone.intersection === this.currentIntersection) {
                                stillApproaching = true;
                            }
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
                    const nextZone = this.getNextIntersection(150);
                    if (nextZone) nearestIntersection = nextZone.intersection;
                }
                
                if (nearestIntersection) {
                    this.hasIntersectionAccess = nearestIntersection.requestEntry(this);
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
                // Category 2: Swerve targets (actors, driverless cars, parked cars)
                let trafficObstacle = null;      // Vehicle to queue behind
                let trafficObstacleDist = Infinity;
                let swerveObstacles = [];        // Obstacles to swerve around
                let actorObstacle = null;        // Player on foot
                let actorObstacleDist = Infinity;
                let actorLateral = 0;

                // ── ACTOR CLUSTER (player + on-foot teammates as one obstacle) ──
                // Player and recruited companions usually move together in formation.
                // Treating them as separate point obstacles produces unstable swerve
                // decisions (which one is "closest" oscillates each frame) and lets
                // cars pick paths that thread between companions. The fix: collect all
                // on-foot actors into a list, project each onto our heading frame, and
                // emit a SINGLE swerve obstacle whose lateral span covers the whole
                // group — a virtual bounding box in the car's reference frame.
                const cluster = [];
                if (player.visible && !(playerCar && playerCar.hasDriver)) {
                    const r = checkTunnelEx(player.x, player.y, lookAheadDist, dynamicTunnelWidth + 10);
                    if (r) cluster.push({ entity: player, x: player.x, y: player.y, dist: r.dist, lateral: r.lateral, vx: player.vx || 0, vy: player.vy || 0 });
                }
                if (teammates && teammates.length > 0) {
                    for (let tm of teammates) {
                        if (!tm || tm.inCar || tm.dead || tm.downed || !tm.recruited) continue;
                        const r = checkTunnelEx(tm.x, tm.y, lookAheadDist, dynamicTunnelWidth + 10);
                        if (r) cluster.push({ entity: tm, x: tm.x, y: tm.y, dist: r.dist, lateral: r.lateral, vx: tm.vx || 0, vy: tm.vy || 0 });
                    }
                }

                if (cluster.length === 1) {
                    // Single actor — treat as point, identical to old behavior.
                    const c = cluster[0];
                    actorObstacle = c.entity;
                    actorObstacleDist = c.dist;
                    actorLateral = c.lateral;
                    const moving = Math.hypot(c.vx, c.vy) > 0.5;
                    swerveObstacles.push({
                        type: 'actor',
                        x: c.x, y: c.y,
                        dist: c.dist,
                        lateral: c.lateral,
                        width: 20,
                        inMotion: moving
                    });
                } else if (cluster.length > 1) {
                    // Multi-actor — emit a single bounding-box swerve obstacle.
                    // Anchor to the NEAREST member's forward distance (so the car
                    // brakes for the closest actor, not the centroid which could be
                    // further). Span the lateral extent of the group + per-actor radius.
                    const ACTOR_HALF_WIDTH = 10; // Half of width:20 — matches existing convention
                    let minDist = Infinity;
                    let nearestEntity = null;
                    let nearestLat = 0;
                    let minLat = Infinity, maxLat = -Infinity;
                    let maxSpeed = 0;
                    for (const c of cluster) {
                        if (c.dist < minDist) {
                            minDist = c.dist;
                            nearestEntity = c.entity;
                            nearestLat = c.lateral;
                        }
                        if (c.lateral < minLat) minLat = c.lateral;
                        if (c.lateral > maxLat) maxLat = c.lateral;
                        const sp = Math.hypot(c.vx, c.vy);
                        if (sp > maxSpeed) maxSpeed = sp;
                    }
                    // Bounding box centroid + half-width in the car's heading frame.
                    const clusterLateral = (minLat + maxLat) / 2;
                    const clusterHalfWidth = (maxLat - minLat) / 2 + ACTOR_HALF_WIDTH;
                    actorObstacle = nearestEntity;
                    actorObstacleDist = minDist;
                    actorLateral = nearestLat;
                    swerveObstacles.push({
                        type: 'actor_cluster',
                        x: nearestEntity.x, y: nearestEntity.y,
                        dist: minDist,
                        lateral: clusterLateral,
                        // width is the full bounding-box width (used by leftClear/rightClear)
                        width: clusterHalfWidth * 2,
                        inMotion: maxSpeed > 0.5
                    });
                }
                
                // Check for player car
                if (playerCar && (playerCar.x !== 0 || playerCar.y !== 0)) {
                    const result = checkTunnelEx(playerCar.x, playerCar.y, lookAheadDist, dynamicTunnelWidth);
                    if (result) {
                        // TURN PATH FILTER: Skip if we're mid-turn and player car is waiting outside
                        const playerWaiting = this.currentTurnPath && playerCar.isWaiting && !playerCar.wasInIntersection;
                        
                        if (playerWaiting) {
                            // Ignore — player car is queued at intersection entry
                        } else if (playerCar.controlMode === 'AI') {
                            // Autodrive active - always queue behind
                            if (result.dist < trafficObstacleDist) {
                                trafficObstacle = playerCar;
                                trafficObstacleDist = result.dist;
                            }
                        } else if (!playerCar.hasDriver && playerCar.controlMode === 'PARKED') {
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
                        } else {
                            // Has driver or player-controlled - queue behind
                            if (result.dist < trafficObstacleDist) {
                                trafficObstacle = playerCar;
                                trafficObstacleDist = result.dist;
                            }
                        }
                    }
                }
                
                // Check for other traffic vehicles
                // PERFORMANCE: Pre-filter by distance — skip vehicles beyond look-ahead range
                const lookAheadSq = (lookAheadDist + 100) * (lookAheadDist + 100);
                for (let v of allVehicles) { 
                    if (v === this || v === playerCar) continue;
                    
                    // Quick distance rejection — much cheaper than tunnel check
                    const dvx = v.x - this.x;
                    const dvy = v.y - this.y;
                    if (dvx * dvx + dvy * dvy > lookAheadSq) continue;
                    
                    const result = checkTunnelEx(v.x, v.y, lookAheadDist, dynamicTunnelWidth);
                    if (result) {
                        // TURN PATH FILTER: When actively turning through an intersection,
                        // ignore vehicles waiting/queued at other intersection entries
                        if (this.currentTurnPath && v.isWaiting && !v.wasInIntersection) {
                            continue;
                        }
                        
                        // SIMPLE RULE: If it's autodrive, queue behind
                        if (v.controlMode === 'AI') {
                            if (result.dist < trafficObstacleDist) {
                                trafficObstacle = v;
                                trafficObstacleDist = result.dist;
                            }
                        } else if (!v.hasDriver && v.controlMode === 'PARKED') {
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
                        } else {
                            // Default - queue behind
                            if (result.dist < trafficObstacleDist) {
                                trafficObstacle = v;
                                trafficObstacleDist = result.dist;
                            }
                        }
                    }
                }

                // --- 2. SWERVE CALCULATION ---
                // Calculate optimal swerve direction for avoidable obstacles
                let swerveSteer = 0;
                let needsSwerve = false;
                
                if (swerveObstacles.length > 0 && this.laneChangeState === 'NONE' && !this.currentTurnPath) {
                    // Find the closest swerve obstacle
                    const closestSwerve = swerveObstacles.reduce((a, b) => a.dist < b.dist ? a : b);
                    
                    // Only swerve if obstacle is close enough to matter
                    const swerveThreshold = this.length * 4 + currentSpeed * 5;
                    if (closestSwerve.dist < swerveThreshold) {
                        needsSwerve = true;
                        
                        // Calculate open space on each side, accounting for obstacle width.
                        // For point obstacles (single actor, single car) this matches old
                        // behavior. For an actor_cluster the bounding-box span shrinks
                        // available clearance, which is the whole point of the cluster
                        // approach: cars no longer try to thread between companions.
                        const laneWidth = this.currentLane ? 40 : 50; // Approximate lane width
                        const obsHalfWidth = (closestSwerve.width || 20) / 2;
                        const obsLeftEdge = closestSwerve.lateral - obsHalfWidth;
                        const obsRightEdge = closestSwerve.lateral + obsHalfWidth;
                        const leftClear = -laneWidth - obsLeftEdge;   // Space from obs's left edge to lane's left edge
                        const rightClear = laneWidth - obsRightEdge;  // Space from obs's right edge to lane's right edge
                        
                        // Check if other obstacles block the swerve paths.
                        // Window extended to length*3.5 so a cluster of actors (player +
                        // formation companions) is treated as a group when picking sides.
                        let leftBlocked = false;
                        let rightBlocked = false;
                        const blockWindow = this.length * 3.5;
                        for (let obs of swerveObstacles) {
                            if (obs === closestSwerve) continue;
                            if (obs.dist < closestSwerve.dist + blockWindow) {
                                // Use a small lateral epsilon so two actors at nearly the
                                // same lateral don't both register as different sides.
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
                        
                        // Magnitude scales with obstacle size — actors are small (20px wide)
                        // and don't need full lock to clear. Parked vehicles still get full
                        // magnitude. Without this, cars veered way off-road for pedestrians
                        // and the player on foot.
                        const isActor = closestSwerve.type === 'actor' || closestSwerve.type === 'actor_cluster';
                        // When the actor is moving, the situation is dynamic — they'll be
                        // out of the way in a moment, so bias toward gentle steering and
                        // let the speed-slowdown logic do most of the work via braking.
                        // When stationary (standing in the road), commit harder to swerve.
                        const actorMoving = isActor && closestSwerve.inMotion;
                        let magnitude = isActor ? 0.45 : 0.9;
                        if (actorMoving) magnitude *= 0.55;
                        
                        // Pick a side. Threshold scales with obstacle width — a wide
                        // cluster needs to be more "off-center" before we commit to
                        // squeezing past on one specific side.
                        const sideThreshold = Math.max(5, obsHalfWidth * 0.5);
                        if (closestSwerve.lateral > sideThreshold && !leftBlocked) {
                            // Obstacle is to our right, swerve left
                            swerveSteer = -urgency * magnitude;
                        } else if (closestSwerve.lateral < -sideThreshold && !rightBlocked) {
                            // Obstacle is to our left, swerve right
                            swerveSteer = urgency * magnitude;
                        } else if (leftBlocked && rightBlocked) {
                            // Cluster of actors blocks both sides — don't pick a doomed
                            // swerve direction. Hard brake instead (handled by speed
                            // control below using closestObstacleDist).
                            swerveSteer = 0;
                        } else {
                            // Obstacle is centered - pick side with more space.
                            // For actors specifically, also reduce magnitude further
                            // (no clear lateral signal = ambiguous; better to nudge gently
                            // than commit a hard swerve into nothing in particular).
                            const centeredMag = isActor ? magnitude * 0.8 : 1.0;
                            if (leftClear > rightClear && !leftBlocked) {
                                swerveSteer = -urgency * centeredMag;
                            } else if (!rightBlocked) {
                                swerveSteer = urgency * centeredMag;
                            }
                            // If both blocked, we'll just slow down (handled below)
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
                let isPlayerObstacle = false;
                
                // Swerve obstacles that can't be swerved around become overtake candidates
                if (hasSwerveObstacle && !needsSwerve) {
                    const closestSwerve = swerveObstacles.reduce((a, b) => a.dist < b.dist ? a : b);
                    if (closestSwerve.type === 'vehicle') {
                        shouldOvertake = true;
                        isPlayerObstacle = closestSwerve.entity === playerCar;
                    } else if (closestSwerve.type === 'actor') {
                        shouldOvertake = true;
                        isPlayerObstacle = true;
                    }
                }
                
                // Stuck traffic also triggers overtake
                if (trafficObstacle && Math.abs(trafficObstacle.speed) < 0.3 && trafficObstacle.stuckTimer > 100) {
                    shouldOvertake = true;
                }
                
                if (shouldOvertake && this.currentLane && !this.currentTurnPath && 
                    this.laneChangeState === 'NONE' && this.state === 'DRIVING' && 
                    !approachingIntersection && !waitingForIntersection) {
                    
                    // Player/Zib autodrive should NOT overtake or change lanes - stay on navigation path
                    const isPlayerAutodrive = this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib');
                    if (!isPlayerAutodrive) {
                        const adjacentLane = this.findAdjacentLane();
                        if (adjacentLane) {
                            this.initiateNormalLaneChange(adjacentLane);
                        } else {
                            if (Math.abs(this.speed) < 0.5) {
                                this.stuckTimer++;
                                const waitLimit = isPlayerObstacle ? 30 : 240;
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
                    // Player autodrive just waits (handled by slowing down for obstacles)
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
                if (waitingForIntersection && this.postIntersectionGraceTimer <= 0) {
                    // Don't stop immediately - drive TO the queue position first
                    const nextZone = this.currentLane ? this.getNextIntersection(200) : null;
                    if (nextZone) {
                        const distToEntry = nextZone.entryDist - this.getDistanceAlongLane();
                        // Stop position must clear the crosswalk (one pavement width = 75px)
                        // immediately before the intersection edge, plus the car's half-length
                        // so the front bumper sits *behind* the crosswalk's outer stripe.
                        const stopDistance = 75 + this.length / 2 + 5;
                        
                        if (distToEntry <= stopDistance) {
                            // At queue position - full stop
                            targetSpeed = 0;
                        } else {
                            // Approach queue position with gradual slowdown
                            const approachDist = distToEntry - stopDistance;
                            const slowdownRange = CONFIG.VEHICLE_AI.INTERSECTION_APPROACH_SLOWDOWN;
                            
                            if (approachDist < slowdownRange) {
                                // Close: 20-60% speed based on distance
                                const approachMod = 0.20 + (approachDist / slowdownRange) * 0.40;
                                targetSpeed = Math.min(targetSpeed, this.maxSpeed * approachMod);
                            } else {
                                // Far: cruise at 60% toward queue position
                                targetSpeed = Math.min(targetSpeed, this.maxSpeed * 0.60);
                            }
                        }
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
                    // Slow down when approaching intersection (even if we have access)
                    const nextZone = this.currentLane ? this.getNextIntersection(120) : null;
                    if (nextZone) {
                        const distToIntersection = nextZone.entryDist - this.getDistanceAlongLane();
                        if (distToIntersection > 0 && distToIntersection < 100) {
                            // Gradual slowdown: 100% at 100px, 60% at intersection
                            const approachMod = 0.60 + (distToIntersection / 100) * 0.40;
                            targetSpeed = Math.min(targetSpeed, this.maxSpeed * approachMod);
                        }
                    }
                }
                
                // --- TRAFFIC QUEUE SLOWDOWN ---
                // When behind another vehicle, match their speed with safe following distance
                // SKIP during active turn paths — the intersection queue guarantees safe passage
                if (hasTrafficAhead && !this.currentTurnPath) {
                    const safeFollowDist = this.length * 2 + currentSpeed * 3;
                    if (trafficObstacleDist < safeFollowDist) {
                        // Match traffic speed or slower
                        const trafficSpeed = trafficObstacle ? Math.abs(trafficObstacle.speed) : 0;
                        const followFactor = trafficObstacleDist / safeFollowDist;
                        targetSpeed = Math.min(targetSpeed, trafficSpeed * 1.1 * followFactor);
                        if (trafficObstacleDist < this.length * 1.5) {
                            targetSpeed = 0; // Too close, stop
                        }
                    }
                }
                
                // --- SWERVE OBSTACLE SLOWDOWN ---
                // Slow down for obstacles we need to swerve around
                // SKIP during active turn paths — committed to the maneuver
                if (hasSwerveObstacle && !needsSwerve && !this.currentTurnPath) {
                    // Can't swerve, must slow down
                    const closestDist = Math.min(...swerveObstacles.map(o => o.dist));
                    const brakeDist = this.length * 3 + currentSpeed * 4;
                    if (closestDist < brakeDist) {
                        const brakeFactor = closestDist / brakeDist;
                        targetSpeed = Math.min(targetSpeed, this.maxSpeed * brakeFactor * 0.5);
                        if (closestDist < this.length * 1.5) {
                            targetSpeed = 0;
                        }
                    }
                }
                
                // --- ACTOR-IN-MOTION BRAKING ---
                // When an actor (player/teammate) is moving across our path, we'd rather
                // wait a moment than veer. Even when needsSwerve is true (the swerve will
                // be applied at reduced magnitude — see actorMoving multiplier above),
                // we *also* tighten the speed envelope so the car has time for the actor
                // to clear. Without this layer, gentle swerve + full speed = clipping the
                // actor's heels.
                if (needsSwerve) {
                    const movingActor = swerveObstacles.find(o =>
                        (o.type === 'actor' || o.type === 'actor_cluster') && o.inMotion
                    );
                    if (movingActor) {
                        const brakeDist = this.length * 4 + currentSpeed * 5;
                        if (movingActor.dist < brakeDist) {
                            const factor = Math.max(0.15, movingActor.dist / brakeDist);
                            targetSpeed = Math.min(targetSpeed, this.maxSpeed * factor * 0.65);
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
                
                // Calculate throttle to achieve target speed
                targetThrottle = AIDriverSolver.calculateThrottle(this, targetSpeed, 0.6);
                
                // --- 6. APPLY PHYSICS (Same as manual driving) ---
                this.manualGas = targetThrottle;
                this.manualTurn = targetSteer;
                
                // --- INTERSECTION DEADLOCK RECOVERY ---
                // When a car overswings a turn and pins itself against another vehicle in
                // the intersection, regular path-advance can't free it (forward throttle
                // just pushes it deeper into the obstacle). Detect contact-stuck state and
                // reverse briefly so the car can reorient and try again on the next pass.
                // The existing turnProgress force-advance (intersectionTimer > 360) is the
                // ultimate fallback; this is the lighter intervention that fires first.
                if (this.wasInIntersection && this.currentTurnPath) {
                    if (this._stuckRecovery > 0) {
                        // Active reverse phase — override AI throttle, ease steering
                        this._stuckRecovery--;
                        this.manualGas = -0.7;
                        this.manualTurn *= 0.3;
                    } else {
                        const contactStuck = trafficObstacle 
                            && trafficObstacleDist < this.length * 1.2 
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
                
                // Reset manual inputs
                this.manualGas = 0;
                this.manualTurn = 0;
            }
            
            // --- PHYSICS-BASED STEERING CALCULATIONS ---
            
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
                    
                    // Advance progress: speed-based + projected, never backward
                    const speedIncrement = 0.015 * Math.max(0.5, Math.abs(this.speed) / 4);
                    this.turnProgress = Math.max(this.turnProgress + speedIncrement, projectedT);
                    
                    // --- FORCE-ADVANCE if stuck in intersection ---
                    if (this.intersectionTimer > 180 && Math.abs(this.speed) < 1.0) {
                        this.turnProgress = Math.min(1.0, this.turnProgress + 0.02);
                    }
                    if (this.intersectionTimer > 360) {
                        this.turnProgress = 1.0;
                    }
                    
                    // --- CURVATURE-AWARE LOOK-AHEAD ---
                    const baseLookAhead = 0.15;
                    const lookAheadScale = 1.0 - sharpness * 0.7;
                    const speedMod = Math.max(0.3, Math.abs(this.speed) / 5);
                    const lookAhead = baseLookAhead * lookAheadScale * speedMod;
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
                    
                    // --- SPEED ---
                    const curveDiff = normalizeAngle(curveAngle - this.angle);
                    maxSpeed = AIDriverSolver.calculateTurnSpeed(this, curveDiff, 50);
                    if (sharpness > 0.5) {
                        maxSpeed *= Math.max(0.5, 1.0 - (sharpness - 0.5) * 0.6);
                    }
                    
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
                if (this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib') && isDeadEnd && distToLaneEnd < 200) {
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
                        
                        if (this.controlMode === 'AI' && (this.driverType === 'player' || this.driverType === 'zib')) {
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
                
                // Get look-ahead target on lane
                const laneTarget = AIDriverSolver.getLaneTarget(this, this.currentLane, 50);
                if (laneTarget) {
                    steer = AIDriverSolver.steerToward(this, laneTarget.x, laneTarget.y, 0.5);
                    
                    // Also correct for lateral offset (drift correction)
                    const lateralOffset = AIDriverSolver.getLateralOffset(this, this.currentLane);
                    if (Math.abs(lateralOffset) > 5) {
                        // Additional steering to return to lane center
                        const correctionSteer = -lateralOffset * 0.02;
                        steer += Math.max(-0.3, Math.min(0.3, correctionSteer));
                    }
                }
                
                return { steer, maxSpeed };
            }
            
            /**
             * Update turn planning logic (look for upcoming turns).
             * V2: Uses pre-determined turn paths from navigation waypoints.
             * When waypoints exist with road info, pick the turn that leads to the correct road.
             */
            updateTurnPlanning() {
                if (this.plannedTurn || !this.currentLane.turnPaths || this.currentLane.turnPaths.length === 0) return;
                
                const relevantPaths = this.currentLane.turnPaths.filter(p => {
                    const start = p.controlPoints[0];
                    return Math.hypot(start.x - this.x, start.y - this.y) < 120;
                });

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
                    const entryX = path.controlPoints[2].x;
                    const entryY = path.controlPoints[2].y;
                    const dx = entryX - lane.start.x;
                    const dy = entryY - lane.start.y;
                    const entryDist = dx * lane.ux + dy * lane.uy;
                    if (!lane.intersectingZones) return false;
                    const intersectionsAhead = lane.intersectingZones.filter(z => z.entryDist > entryDist + 100);
                    return intersectionsAhead.length > 0;
                };
                
                const safePaths = relevantPaths.filter(p => isSafePath(p));
                const pool = safePaths.length > 0 ? safePaths : relevantPaths;
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
                    const entryX = path.controlPoints[2].x;
                    const entryY = path.controlPoints[2].y;
                    const dx = entryX - lane.start.x;
                    const dy = entryY - lane.start.y;
                    const entryDist = dx * lane.ux + dy * lane.uy;
                    if (!lane.intersectingZones) return false;
                    const intersectionsAhead = lane.intersectingZones.filter(z => z.entryDist > entryDist + 100);
                    return intersectionsAhead.length > 0;
                };
                
                const safePaths = relevantPaths.filter(p => isSafePath(p));
                const pool = safePaths.length > 0 ? safePaths : relevantPaths;
                const straightPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) < 0.5);
                const turnPaths = pool.filter(p => Math.abs(p.toLane.angle - this.currentLane.angle) >= 0.5);
                
                let chosenPath = null;
                if (turnPaths.length > 0 && Math.random() < this.turnProbability) {
                    chosenPath = turnPaths[Math.floor(Math.random() * turnPaths.length)];
                }
                if (!chosenPath && straightPaths.length > 0) chosenPath = straightPaths[0];
                if (!chosenPath && turnPaths.length > 0) chosenPath = turnPaths[Math.floor(Math.random() * turnPaths.length)];
                return chosenPath;
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
                
                // Steer toward end point
                let steer = AIDriverSolver.steerToward(this, this.laneChangeEndX, this.laneChangeEndY, 0.6);
                
                // Near the end, start aligning with lane
                if (this.laneChangeProgress > 0.7) {
                    const alignSteer = AIDriverSolver.calculateSteering(this, this.laneChangeTargetAngle, 0.5);
                    steer = steer * 0.5 + alignSteer * 0.5;
                }
                
                // Check completion
                const distToEnd = Math.hypot(this.x - this.laneChangeEndX, this.y - this.laneChangeEndY);
                if (distToEnd < 15 || this.laneChangeProgress >= 1.0) {
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
                
                // Steer toward target
                let steer = AIDriverSolver.steerToward(this, this.laneChangeEndX, this.laneChangeEndY, 0.7);
                
                // Check completion
                const distToEnd = Math.hypot(this.x - this.laneChangeEndX, this.y - this.laneChangeEndY);
                if (distToEnd < 15 || this.laneChangeProgress >= 1.0) {
                    // Setup return maneuver
                    this.laneChangeState = 'OVERTAKING_RETURN';
                    this.laneChangeProgress = 0;
                    this.stateTimer = 180; // Wait before returning
                    this.turnSignal = null;
                    this.laneChangeStartX = this.x;
                    this.laneChangeStartY = this.y;
                    
                    const road = this.originalLane.road;
                    const originalLaneCenter = road.orientation === 'H' 
                        ? (road.y + (this.originalLane.laneIndex * 60) + 30) 
                        : (road.x + (this.originalLane.laneIndex * 60) + 30);
                    const forwardDist = this.length * 3;
                    
                    if (road.orientation === 'H') {
                        this.laneChangeEndX = this.x + Math.cos(this.originalLane.angle) * forwardDist;
                        this.laneChangeEndY = originalLaneCenter;
                    } else {
                        this.laneChangeEndX = originalLaneCenter;
                        this.laneChangeEndY = this.y + Math.sin(this.originalLane.angle) * forwardDist;
                    }
                    
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
                
                // Wait period before returning
                if (this.stateTimer > 0) {
                    this.stateTimer--;
                    // Just follow lane during wait
                    if (this.originalLane) {
                        return AIDriverSolver.calculateSteering(this, this.originalLane.angle, 0.3);
                    }
                    return 0;
                }
                
                // Progress based on distance
                const totalDist = Math.hypot(this.laneChangeEndX - this.laneChangeStartX, this.laneChangeEndY - this.laneChangeStartY);
                const currentDist = Math.hypot(this.x - this.laneChangeStartX, this.y - this.laneChangeStartY);
                this.laneChangeProgress = Math.min(1.0, currentDist / totalDist);
                
                // Steer toward return target
                let steer = AIDriverSolver.steerToward(this, this.laneChangeEndX, this.laneChangeEndY, 0.6);
                
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
                const distToEnd = Math.hypot(this.x - this.laneChangeEndX, this.y - this.laneChangeEndY);
                if (distToEnd < 15 || this.laneChangeProgress >= 1.0) {
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
                this.targetLane = targetLane;
                this.laneChangeProgress = 0;
                this.originalLane = this.currentLane;
                this.laneChangeStartX = this.x;
                this.laneChangeStartY = this.y;
                
                const road = this.currentLane.road;
                const targetLaneCenter = road.orientation === 'H' ? (road.y + (targetLane.laneIndex * 60) + (30)) : (road.x + (targetLane.laneIndex * 60) + (30));
                const forwardDist = this.length * 1.0;
                
                if (road.orientation === 'H') {
                    this.laneChangeEndX = this.x + Math.cos(this.currentLane.angle) * forwardDist;
                    this.laneChangeEndY = targetLaneCenter;
                } else {
                    this.laneChangeEndX = targetLaneCenter;
                    this.laneChangeEndY = this.y + Math.sin(this.currentLane.angle) * forwardDist;
                }
                
                this.laneChangeDiagonalAngle = Math.atan2(this.laneChangeEndY - this.laneChangeStartY, this.laneChangeEndX - this.laneChangeStartX);
                this.laneChangeTargetAngle = this.currentLane.angle;
                
                if (this.currentLane.road.orientation === 'H') this.turnSignal = targetLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                else this.turnSignal = targetLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                this.turnSignalTimer = 100;
            }
            
            initiateOvertake(opposingLane) {
                this.laneChangeState = 'OVERTAKING_OUT';
                this.targetLane = opposingLane;
                this.originalLane = this.currentLane;
                this.laneChangeProgress = 0;
                this.laneChangeStartX = this.x;
                this.laneChangeStartY = this.y;
                
                const road = this.currentLane.road;
                const targetLaneCenter = road.orientation === 'H' ? (road.y + (opposingLane.laneIndex * 60) + (30)) : (road.x + (opposingLane.laneIndex * 60) + (30));
                const forwardDist = this.length * 1.0;
                
                if (road.orientation === 'H') {
                    this.laneChangeEndX = this.x + Math.cos(this.currentLane.angle) * forwardDist;
                    this.laneChangeEndY = targetLaneCenter;
                } else {
                    this.laneChangeEndX = targetLaneCenter;
                    this.laneChangeEndY = this.y + Math.sin(this.currentLane.angle) * forwardDist;
                }
                
                this.laneChangeDiagonalAngle = Math.atan2(this.laneChangeEndY - this.laneChangeStartY, this.laneChangeEndX - this.laneChangeStartX);
                this.laneChangeTargetAngle = this.currentLane.angle;
                
                if (this.currentLane.road.orientation === 'H') this.turnSignal = opposingLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                else this.turnSignal = opposingLane.laneIndex > this.currentLane.laneIndex ? 'right' : 'left';
                this.turnSignalTimer = 80;
            }
        }

