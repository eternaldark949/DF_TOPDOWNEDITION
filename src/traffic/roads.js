        /* --- NEW TRAFFIC SYSTEM (WITH UNIQUE IDs FOR AUTODRIVE) --- */
        /* === ID-BASED ROAD NETWORK ARCHITECTURE === 
         * All entities have unique IDs for clean navigation:
         * - Road:         "road_0", "road_1", etc.
         * - Lane:         "lane_0_0", "lane_0_1" (roadIndex_laneIndex)
         * - Intersection: "int_0", "int_1", etc.
         * - TurnPath:     "turn_0", "turn_1", etc.
         *
         * RoadNetwork maintains lookup maps and a pre-built navigation graph.
         */
        

        
        /* --- HELPER: LINE-RECT INTERSECTION --- */
        function getLineRectIntersections(x1, y1, x2, y2, rx, ry, rw, rh) {
            const points = [];
            const lines = [
                { x1: rx, y1: ry, x2: rx + rw, y2: ry },
                { x1: rx, y1: ry + rh, x2: rx + rw, y2: ry + rh },
                { x1: rx, y1: ry, x2: rx, y2: ry + rh },
                { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh }
            ];
        
            lines.forEach(line => {
                const denom = (line.y2 - line.y1) * (x2 - x1) - (line.x2 - line.x1) * (y2 - y1);
                if (denom !== 0) {
                    const uA = ((line.x2 - line.x1) * (y1 - line.y1) - (line.y2 - line.y1) * (x1 - line.x1)) / denom;
                    const uB = ((x2 - x1) * (y1 - line.y1) - (y2 - y1) * (x1 - line.x1)) / denom;
                    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
                        points.push({ x: x1 + uA * (x2 - x1), y: y1 + uA * (y2 - y1) });
                    }
                }
            });
            return points;
        }

        /**
         * ================================================================================
         * ROAD NETWORK - SEGMENT-BASED ARCHITECTURE
         * ================================================================================
         * 
         * NEW ID SYSTEM:
         *   Road:         "R0", "R1", "R2" ...
         *   Segment:      "R0.S0", "R0.S1" ... (Road.Segment)
         *   Lane:         "R0.S0.L0", "R0.S0.L1" ... (Road.Segment.Lane)
         *   Intersection: "A", "B", "C" ... (letter-based)
         *   Gate:         "A.R0.S0.L0" (Intersection.Road.Segment.Lane)
         *   TurnPath:     "A:R0.S0.L0>R1.S1.L0" (Intersection:FromLane>ToLane)
         * 
         * KEY CONCEPTS:
         *   - A ROAD is a named entity spanning the map
         *   - A SEGMENT is a stretch of road between intersections (or dead-ends)
         *   - A LANE is a single directional path within a segment
         *   - An INTERSECTION is where roads cross
         *   - A GATE is an entry/exit point at an intersection boundary
         *   - A TURNPATH connects an entry gate to an exit gate through an intersection
         * ================================================================================
         */

        // Global ID Counters
        let _roadIdCounter = 0;
        let _intersectionIdCounter = 0;

        function resetRoadNetworkIds() {
            _roadIdCounter = 0;
            _intersectionIdCounter = 0;
        }

        function getNextIntersectionLetter() {
            const id = _intersectionIdCounter++;
            if (id < 26) {
                return String.fromCharCode(65 + id); // A-Z
            } else {
                const first = Math.floor(id / 26) - 1;
                const second = id % 26;
                return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
            }
        }

        /**
         * Lane: A single directional path within a segment.
         * ID Format: "R{road}.S{segment}.L{lane}"
         */
        class Lane {
            constructor(startX, startY, endX, endY, segment, laneIndex, direction = 1) {
                // === IDENTITY ===
                this.id = `${segment.id}.L${laneIndex}`;
                this.laneIndex = laneIndex;
                this.direction = direction;
                
                // === PARENT REFERENCES ===
                this.segment = segment;
                this.segmentId = segment.id;
                this.road = segment.road;
                this.roadId = segment.roadId;
                
                // === GEOMETRY ===
                this.start = { x: startX, y: startY };
                this.end = { x: endX, y: endY };
                this.dx = endX - startX;
                this.dy = endY - startY;
                this.length = Math.hypot(this.dx, this.dy);
                this.angle = Math.atan2(this.dy, this.dx);
                
                // Unit vectors
                this.ux = this.length > 0 ? this.dx / this.length : 0;
                this.uy = this.length > 0 ? this.dy / this.length : 0;
                
                // === CONNECTIONS ===
                this.entryGate = null;
                this.exitGate = null;
                this.connections = [];
                this.connectionIds = [];
                this.turnPaths = [];
                this.turnPathIds = [];
                
                // === LEGACY COMPATIBILITY ===
                this.isOpposing = direction < 0;
                this.directionId = laneIndex;
                this.intersectingZones = [];
            }
            
            getPoint(t) {
                return {
                    x: this.start.x + this.dx * t,
                    y: this.start.y + this.dy * t
                };
            }
            
            getDistanceAlong(x, y) {
                const dx = x - this.start.x;
                const dy = y - this.start.y;
                return dx * this.ux + dy * this.uy;
            }
            
            getLateralOffset(x, y) {
                const dx = x - this.start.x;
                const dy = y - this.start.y;
                return dx * (-this.uy) + dy * this.ux;
            }
            
            getTurnPathsToRoad(targetRoadId) {
                return this.turnPaths.filter(tp => tp.toRoadId === targetRoadId);
            }
            
            getConnectionsToRoad(targetRoadId) {
                return this.connections.filter(conn => conn.roadId === targetRoadId);
            }
        }

        /**
         * Segment: A stretch of road between intersections (or dead-ends).
         * ID Format: "R{road}.S{segment}"
         */
        class Segment {
            constructor(road, segmentIndex, startCoord, endCoord, startBound, endBound) {
                // === IDENTITY ===
                this.id = `${road.id}.S${segmentIndex}`;
                this.segmentIndex = segmentIndex;
                
                // === PARENT REFERENCE ===
                this.road = road;
                this.roadId = road.id;
                
                // === BOUNDS ===
                this.startBound = startBound;  // Intersection ID or null
                this.endBound = endBound;      // Intersection ID or null
                
                // === GEOMETRY ===
                this.startCoord = startCoord;
                this.endCoord = endCoord;
                this.length = endCoord - startCoord;
                
                // === LANES ===
                this.lanes = [];
                this.laneIds = [];
            }
            
            addLane(lane) {
                this.lanes.push(lane);
                this.laneIds.push(lane.id);
            }
            
            getLanesByDirection(dir) {
                return this.lanes.filter(l => l.direction === dir);
            }
            
            isDeadEndStart() { return this.startBound === null; }
            isDeadEndEnd() { return this.endBound === null; }
        }

        /**
         * Gate: An entry/exit point at an intersection boundary.
         * ID Format: "{intersection}.{road}.{segment}.{lane}"
         */
        class Gate {
            constructor(intersection, lane, type) {
                this.id = `${intersection.id}.${lane.id}`;
                this.type = type; // "entry" or "exit"
                
                // === REFERENCES ===
                this.intersection = intersection;
                this.intersectionId = intersection.id;
                this.lane = lane;
                this.laneId = lane.id;
                this.segment = lane.segment;
                this.segmentId = lane.segmentId;
                this.road = lane.road;
                this.roadId = lane.roadId;
                
                // === GEOMETRY ===
                if (type === 'entry') {
                    this.x = lane.end.x;
                    this.y = lane.end.y;
                    this.angle = lane.angle;
                } else {
                    this.x = lane.start.x;
                    this.y = lane.start.y;
                    this.angle = lane.angle;
                }
                
                // === CONNECTIONS ===
                this.turnPaths = [];
                this.turnPathIds = [];
            }
        }

        /**
         * TurnPath: A curved path through an intersection connecting two gates.
         * ID Format: "{intersection}:{fromLaneId}>{toLaneId}"
         */
        class TurnPath {
            constructor(fromGate, toGate, controlPoints) {
                this.id = `${fromGate.intersectionId}:${fromGate.laneId}>${toGate.laneId}`;
                
                // === GATE REFERENCES ===
                this.fromGate = fromGate;
                this.fromGateId = fromGate.id;
                this.toGate = toGate;
                this.toGateId = toGate.id;
                
                // === LANE REFERENCES ===
                this.fromLane = fromGate.lane;
                this.fromLaneId = fromGate.laneId;
                this.toLane = toGate.lane;
                this.toLaneId = toGate.laneId;
                
                // === ROAD/SEGMENT REFERENCES ===
                this.fromRoadId = fromGate.roadId;
                this.toRoadId = toGate.roadId;
                this.fromSegmentId = fromGate.segmentId;
                this.toSegmentId = toGate.segmentId;
                
                // === INTERSECTION ===
                this.intersection = fromGate.intersection;
                this.intersectionId = fromGate.intersectionId;
                
                // === GEOMETRY ===
                this.controlPoints = controlPoints;
                this.length = this._calculateLength();
                this.turnType = this._classifyTurn();
            }
            
            _classifyTurn() {
                if (!this.fromLane || !this.toLane) return 'unknown';
                let angleDiff = this.toLane.angle - this.fromLane.angle;
                angleDiff = normalizeAngle(angleDiff);
                
                if (Math.abs(angleDiff) < 0.3) return 'straight';
                if (angleDiff > 0.3) return 'right';
                if (angleDiff < -0.3) return 'left';
                return 'straight';
            }
            
            _calculateLength() {
                let length = 0;
                const samples = 20;
                let prev = this.getPoint(0);
                for (let i = 1; i <= samples; i++) {
                    const curr = this.getPoint(i / samples);
                    length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
                    prev = curr;
                }
                return length;
            }
            
            getPoint(t) {
                if (this.controlPoints.length === 3) {
                    const [p0, p1, p2] = this.controlPoints;
                    const t1 = 1 - t;
                    return {
                        x: t1*t1*p0.x + 2*t1*t*p1.x + t*t*p2.x,
                        y: t1*t1*p0.y + 2*t1*t*p1.y + t*t*p2.y
                    };
                } else if (this.controlPoints.length === 4) {
                    const [p0, p1, p2, p3] = this.controlPoints;
                    const t1 = 1 - t;
                    return {
                        x: t1*t1*t1*p0.x + 3*t1*t1*t*p1.x + 3*t1*t*t*p2.x + t*t*t*p3.x,
                        y: t1*t1*t1*p0.y + 3*t1*t1*t*p1.y + 3*t1*t*t*p2.y + t*t*t*p3.y
                    };
                }
                return this.controlPoints[0];
            }
            
            getAngle(t) {
                if (this.controlPoints.length === 3) {
                    const [p0, p1, p2] = this.controlPoints;
                    const t1 = 1 - t;
                    const dx = 2*t1*(p1.x - p0.x) + 2*t*(p2.x - p1.x);
                    const dy = 2*t1*(p1.y - p0.y) + 2*t*(p2.y - p1.y);
                    return Math.atan2(dy, dx);
                } else if (this.controlPoints.length === 4) {
                    const [p0, p1, p2, p3] = this.controlPoints;
                    const t1 = 1 - t;
                    const dx = 3*t1*t1*(p1.x-p0.x) + 6*t1*t*(p2.x-p1.x) + 3*t*t*(p3.x-p2.x);
                    const dy = 3*t1*t1*(p1.y-p0.y) + 6*t1*t*(p2.y-p1.y) + 3*t*t*(p3.y-p2.y);
                    return Math.atan2(dy, dx);
                }
                return this.fromLane?.angle || 0;
            }
        }

        /**
         * Intersection: Where roads cross, with gates and queue management.
         * ID Format: "A", "B", "C", ... "Z", "AA", "AB", ...
         */
        class Intersection {
            constructor(x, y, width, height) {
                // === IDENTITY ===
                this.id = getNextIntersectionLetter();
                
                // === GEOMETRY ===
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
                this.centerX = x + width / 2;
                this.centerY = y + height / 2;
                
                // === CONNECTED ROADS ===
                this.roads = [];
                this.roadIds = [];
                this.connectingRoadIds = []; // Legacy compat
                this.connectingRoads = [];   // Legacy compat
                
                // === GATES ===
                this.gates = [];
                this.gateById = new Map();
                this.entryGates = [];
                this.exitGates = [];
                
                // === TURN PATHS ===
                this.turnPaths = [];
                this.turnPathIds = [];
                this.turnPathById = new Map();
                
                // === LEGACY COMPATIBILITY ===
                this.boundaryMarkers = [];
                
                // === QUEUE MANAGEMENT ===
                this.queue = [];
                this.currentVehicle = null;
                this.clearanceTimer = 0;
                this.occupants = [];
                this.maxOccupancy = 1;
                this.occupiedBy = null;
                
                // Queue deadlock detection
                this.lastQueueState = '';
                this.queueUnchangedFrames = 0;
                this.maxQueueStuckFrames = 300;
            }
            
            addRoad(road) {
                if (!this.roadIds.includes(road.id)) {
                    this.roads.push(road);
                    this.roadIds.push(road.id);
                    this.connectingRoads.push(road);
                    this.connectingRoadIds.push(road.id);
                }
            }
            
            addGate(gate) {
                this.gates.push(gate);
                this.gateById.set(gate.id, gate);
                
                if (gate.type === 'entry') {
                    this.entryGates.push(gate);
                    // Legacy compat marker
                    this.boundaryMarkers.push({
                        x: gate.x, y: gate.y,
                        lane: gate.lane, laneId: gate.laneId,
                        roadId: gate.roadId, id: gate.lane.directionId,
                        type: 'in'
                    });
                } else {
                    this.exitGates.push(gate);
                    this.boundaryMarkers.push({
                        x: gate.x, y: gate.y,
                        lane: gate.lane, laneId: gate.laneId,
                        roadId: gate.roadId, id: gate.lane.directionId,
                        type: 'out'
                    });
                }
            }
            
            addTurnPath(turnPath) {
                this.turnPaths.push(turnPath);
                this.turnPathIds.push(turnPath.id);
                this.turnPathById.set(turnPath.id, turnPath);
                
                turnPath.fromGate.turnPaths.push(turnPath);
                turnPath.fromGate.turnPathIds.push(turnPath.id);
                turnPath.toGate.turnPaths.push(turnPath);
                turnPath.toGate.turnPathIds.push(turnPath.id);
                
                // Add to lane's turnPaths
                turnPath.fromLane.turnPaths.push(turnPath);
                turnPath.fromLane.turnPathIds.push(turnPath.id);
            }
            
            getTurnPathsFromGate(gateId) {
                return this.turnPaths.filter(tp => tp.fromGateId === gateId);
            }
            
            getTurnPathsToGate(gateId) {
                return this.turnPaths.filter(tp => tp.toGateId === gateId);
            }
            
            getTurnPathsToRoad(roadId) {
                return this.turnPaths.filter(tp => tp.toRoadId === roadId);
            }
            
            getTurnPathsToSegment(segmentId) {
                return this.turnPaths.filter(tp => tp.toSegmentId === segmentId);
            }
            
            findTurnPath(fromLaneId, toLaneId) {
                const id = `${this.id}:${fromLaneId}>${toLaneId}`;
                return this.turnPathById.get(id);
            }
            
            containsPoint(x, y) {
                return x >= this.x && x <= this.x + this.width &&
                       y >= this.y && y <= this.y + this.height;
            }
            
            isVehicleInside(vehicle) {
                return (vehicle.x >= this.x && vehicle.x <= this.x + this.width &&
                        vehicle.y >= this.y && vehicle.y <= this.y + this.height);
            }
            
            // === QUEUE MANAGEMENT ===
            requestEntry(vehicle) {
                if (this.occupants.includes(vehicle)) return true;
                if (this.occupants.length < this.maxOccupancy) {
                    this._grant(vehicle);
                    return true;
                }
                // Movements that can't cross share the box: a car right behind one from the same lane
                // (a platoon), or straight-through traffic from opposite directions of the same road.
                // Only when nobody incompatible is already waiting, so the queue can't be starved.
                if (this.occupants.length < 3 && this.occupants.every(o => this._compatible(o, vehicle)) &&
                    this.queue.every(q => q === vehicle || this._compatible(q, vehicle))) {
                    const qi = this.queue.indexOf(vehicle);
                    if (qi !== -1) this.queue.splice(qi, 1);
                    this._grant(vehicle);
                    return true;
                }
                if (!this.queue.includes(vehicle)) {
                    this.queue.push(vehicle);
                }
                return false;
            }
            
            _grant(vehicle) {
                vehicle._entryLane = vehicle.currentLane || null;
                vehicle._entryMove = vehicle.plannedTurn ? vehicle.plannedTurn.turnType : null;
                this.occupants.push(vehicle);
            }

            /** Can `a` (in or granted) and `b` be in the box together without their paths crossing? */
            _compatible(a, b) {
                const la = a._entryLane || a.currentLane, lb = b.currentLane;
                if (!la || !lb) return false;
                const mb = b.plannedTurn ? b.plannedTurn.turnType : null, ma = a._entryMove;
                if (la === lb) return ma && ma === mb;                                      // platoon, same way out
                return la.roadId === lb.roadId && la.isOpposing !== lb.isOpposing && ma === 'straight' && mb === 'straight';
            }

            releaseEntry(vehicle) {
                const occupantIndex = this.occupants.indexOf(vehicle);
                if (occupantIndex !== -1) {
                    this.occupants.splice(occupantIndex, 1);
                    while (this.occupants.length < this.maxOccupancy && this.queue.length > 0) {
                        const nextVehicle = this.queue.shift();
                        this._grant(nextVehicle);
                    }
                }
                const queueIndex = this.queue.indexOf(vehicle);
                if (queueIndex !== -1) {
                    this.queue.splice(queueIndex, 1);
                }
            }
            
            isVehicleApproaching(vehicle, distance) {
                const dx = Math.min(Math.abs(vehicle.x - this.x), Math.abs(vehicle.x - (this.x + this.width)));
                const dy = Math.min(Math.abs(vehicle.y - this.y), Math.abs(vehicle.y - (this.y + this.height)));
                const dist = Math.hypot(dx, dy);
                return dist < distance && !this.isVehicleInside(vehicle);
            }
            
            update() {
                if (this.clearanceTimer > 0) {
                    this.clearanceTimer--;
                    if (this.clearanceTimer === 0 && this.queue.length > 0) {
                        this.currentVehicle = this.queue[0];
                    }
                }
                
                // Deadlock detection
                const currentState = this.queue.map(v => `${v.x.toFixed(0)},${v.y.toFixed(0)}`).join('|') + 
                                   ';' + this.occupants.map(v => `${v.x.toFixed(0)},${v.y.toFixed(0)}`).join('|');
                
                if (currentState === this.lastQueueState) {
                    this.queueUnchangedFrames++;
                    if (this.queueUnchangedFrames >= this.maxQueueStuckFrames) {
                        this.clearAndRecollect();
                    }
                } else {
                    this.queueUnchangedFrames = 0;
                    this.lastQueueState = currentState;
                }
            }
            
            clearAndRecollect() {
                this.queue = [];
                this.occupants = [];
                this.queueUnchangedFrames = 0;
                this.lastQueueState = '';
            }
            
            recollectVehicle(vehicle) {
                if (this.isVehicleInside(vehicle)) {
                    if (!this.occupants.includes(vehicle)) {
                        this.occupants.push(vehicle);
                    }
                    return true;
                }
                return false;
            }
            
            draw(ctx, debug) {
                if (debug) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                    ctx.strokeStyle = 'red';
                    ctx.strokeRect(this.x, this.y, this.width, this.height);
                    
                    ctx.fillStyle = '#ff0';
                    ctx.font = '14px monospace';
                    ctx.fillText(this.id, this.centerX - 8, this.centerY + 4);
            
                    this.turnPaths.forEach(path => {
                        const isStraight = path.turnType === 'straight';
                        ctx.strokeStyle = isStraight ? '#fff' : (path.turnType === 'left' ? '#0ff' : '#f0f');
                        ctx.lineWidth = 2;
                        
                        ctx.beginPath();
                        const p0 = path.controlPoints[0];
                        const p1 = path.controlPoints[1];
                        const p2 = path.controlPoints[2];
                        ctx.moveTo(p0.x, p0.y);
                        ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
                        ctx.stroke();
                    });
                } else {
                    ctx.fillStyle = '#18181b';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                }
            }
        }

        /**
         * Road: A named entity spanning the map, containing segments.
         * ID Format: "R0", "R1", "R2", ...
         */
        class Road {
            constructor(config) {
                // === IDENTITY ===
                this.id = `R${_roadIdCounter++}`;
                this.name = config.name || '';
                
                // === INTERNAL INDEX ===
                this._index = _roadIdCounter - 1;
                
                // === GEOMETRY: Unified angle-based representation ===
                // Accept either x1,y1,x2,y2 (diagonal) or x,y,w,h,orientation (legacy H/V)
                if (config.x1 !== undefined && config.y1 !== undefined && config.x2 !== undefined && config.y2 !== undefined) {
                    // Diagonal/freeform road
                    this.x1 = config.x1;
                    this.y1 = config.y1;
                    this.x2 = config.x2;
                    this.y2 = config.y2;
                    this.isDiagonal = true;
                    this.orientation = 'D'; // Diagonal
                } else {
                    // Legacy H/V road — derive endpoints from rect
                    this.orientation = config.orientation || 'H';
                    this.isDiagonal = false;
                    if (this.orientation === 'H') {
                        this.x1 = config.x;
                        this.y1 = config.y + (config.h || 0) / 2;
                        this.x2 = config.x + (config.w || 0);
                        this.y2 = config.y + (config.h || 0) / 2;
                    } else {
                        this.x1 = config.x + (config.w || 0) / 2;
                        this.y1 = config.y;
                        this.x2 = config.x + (config.w || 0) / 2;
                        this.y2 = config.y + (config.h || 0);
                    }
                }
                
                // Road axis vector and length
                const dx = this.x2 - this.x1;
                const dy = this.y2 - this.y1;
                this.length = Math.hypot(dx, dy);
                this.angle = Math.atan2(dy, dx);
                
                // Unit vectors: forward (along road) and normal (perpendicular left)
                this.ux = this.length > 0 ? dx / this.length : 1;
                this.uy = this.length > 0 ? dy / this.length : 0;
                this.nx = -this.uy; // perpendicular left
                this.ny = this.ux;
                
                // Parametric start/end (always 0 to length along the road axis)
                this.startCoord = 0;
                this.endCoord = this.length;
                
                // === LANE CONFIG ===
                this.numLanes = config.lanes || 2;
                this.symmetrical = config.symmetrical !== false;
                this.laneWidth = config.laneWidth || 60;
                
                const totalLanes = this.symmetrical ? this.numLanes * 2 : this.numLanes;
                this.thickness = totalLanes * this.laneWidth;
                
                // === AABB (bounding box for broad-phase checks) ===
                // Compute from endpoints + half-thickness perpendicular offset
                const halfT = this.thickness / 2;
                const corners = [
                    { x: this.x1 + this.nx * halfT, y: this.y1 + this.ny * halfT },
                    { x: this.x1 - this.nx * halfT, y: this.y1 - this.ny * halfT },
                    { x: this.x2 + this.nx * halfT, y: this.y2 + this.ny * halfT },
                    { x: this.x2 - this.nx * halfT, y: this.y2 - this.ny * halfT },
                ];
                const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
                this.x = Math.min(...xs);
                this.y = Math.min(...ys);
                this.w = Math.max(...xs) - this.x;
                this.h = Math.max(...ys) - this.y;
                
                // === SEGMENTS ===
                this.segments = [];
                this.segmentIds = [];
                
                // === LEGACY COMPATIBILITY: Flat lane array ===
                this.lanes = [];
                this.laneIds = [];
                
                // === INTERSECTIONS ===
                this.intersections = [];
                this.intersectionIds = [];
                
                // === MISC ===
                this.hasPavements = config.hasPavements || false;
                this.pavementWidth = config.pavementWidth || 75;
            }
            
            // Convert a parametric distance along the road to world coordinates
            paramToWorld(t, lateralOffset = 0) {
                return {
                    x: this.x1 + this.ux * t + this.nx * lateralOffset,
                    y: this.y1 + this.uy * t + this.ny * lateralOffset
                };
            }
            
            // Project a world point onto the road axis, returns { along, lateral }
            worldToParam(wx, wy) {
                const dx = wx - this.x1;
                const dy = wy - this.y1;
                return {
                    along: dx * this.ux + dy * this.uy,
                    lateral: dx * this.nx + dy * this.ny
                };
            }
            
            // Get the 4 corners of the road polygon (for rendering and collision)
            getCorners() {
                const halfT = this.thickness / 2;
                return [
                    { x: this.x1 - this.nx * halfT, y: this.y1 - this.ny * halfT },
                    { x: this.x2 - this.nx * halfT, y: this.y2 - this.ny * halfT },
                    { x: this.x2 + this.nx * halfT, y: this.y2 + this.ny * halfT },
                    { x: this.x1 + this.nx * halfT, y: this.y1 + this.ny * halfT },
                ];
            }
            
            buildSegments(intersectionCoords) {
                this.segments = [];
                this.segmentIds = [];
                this.lanes = [];
                this.laneIds = [];
                
                const sorted = [...intersectionCoords].sort((a, b) => a.coord - b.coord);
                
                let prevCoord = this.startCoord;
                let prevBound = null;
                let segmentIndex = 0;
                
                for (const intData of sorted) {
                    if (intData.coord > prevCoord) {
                        const segment = new Segment(this, segmentIndex++, prevCoord, intData.coord, prevBound, intData.id);
                        this.segments.push(segment);
                        this.segmentIds.push(segment.id);
                    }
                    
                    prevCoord = intData.coord + intData.width;
                    prevBound = intData.id;
                }
                
                if (prevCoord < this.endCoord) {
                    const segment = new Segment(this, segmentIndex, prevCoord, this.endCoord, prevBound, null);
                    this.segments.push(segment);
                    this.segmentIds.push(segment.id);
                }
                
                for (const segment of this.segments) {
                    this._generateLanesForSegment(segment);
                }
            }
            
            _generateLanesForSegment(segment) {
                const totalLanes = this.symmetrical ? this.numLanes * 2 : this.numLanes;
                const halfT = this.thickness / 2;
                
                for (let i = 0; i < totalLanes; i++) {
                    const laneOffset = (i * this.laneWidth) + (this.laneWidth / 2) - halfT;
                    
                    // Direction convention:
                    // First half of lanes (i < numLanes) sit on one side of the centerline,
                    // second half on the other. Sign assignment per orientation:
                    //   H roads: top=-1 (right→left), bottom=1 (left→right)
                    //   V roads: left=-1 (bottom→top), right=1 (top→bottom)  [INVERTED]
                    //   D roads: left side=1, right side=-1
                    let direction;
                    if (this.symmetrical) {
                        if (this.orientation === 'D') {
                            direction = (i < this.numLanes ? 1 : -1);
                        } else {
                            // H and V share the same sign pattern after V inversion
                            direction = (i < this.numLanes ? -1 : 1);
                        }
                    } else {
                        direction = 1;
                    }
                    
                    // Compute lane start/end in world coords using parametric projection
                    const laneStart = this.paramToWorld(segment.startCoord, laneOffset);
                    const laneEnd = this.paramToWorld(segment.endCoord, laneOffset);
                    
                    let startX, startY, endX, endY;
                    if (direction > 0) {
                        startX = laneStart.x; startY = laneStart.y;
                        endX = laneEnd.x; endY = laneEnd.y;
                    } else {
                        startX = laneEnd.x; startY = laneEnd.y;
                        endX = laneStart.x; endY = laneStart.y;
                    }
                    
                    const lane = new Lane(startX, startY, endX, endY, segment, i, direction);
                    segment.addLane(lane);
                    
                    // Add to flat lane array
                    this.lanes.push(lane);
                    this.laneIds.push(lane.id);
                }
            }
            
            getSegment(index) {
                return this.segments[index];
            }
            
            getSegmentAtCoord(coord) {
                for (const seg of this.segments) {
                    if (coord >= seg.startCoord && coord <= seg.endCoord) {
                        return seg;
                    }
                }
                return null;
            }
            
            getSegmentAtPoint(x, y) {
                const p = this.worldToParam(x, y);
                return this.getSegmentAtCoord(p.along);
            }
            
            getPavements() {
                if (!this.hasPavements || this.isDiagonal) return [];
                const paves = [];
                if (this.orientation === 'H') {
                    paves.push(new Pavement(this.x, this.y - this.pavementWidth, this.w, this.pavementWidth));
                    paves.push(new Pavement(this.x, this.y + this.h, this.w, this.pavementWidth));
                } else {
                    paves.push(new Pavement(this.x - this.pavementWidth, this.y, this.pavementWidth, this.h));
                    paves.push(new Pavement(this.x + this.w, this.y, this.pavementWidth, this.h));
                }
                return paves;
            }
            
            generateLamps(network, spacing = 200) {
                if (!this.hasPavements || this.isDiagonal) return [];
            
                const lamps = [];
                const CROSSWALK_BUFFER = 45; 
                const PAVEMENT_INSET = 20; 
            
                const intersections = this.intersections;
            
                const exclusions = [];
                intersections.forEach(ix => {
                    let start, end;
                    if (this.orientation === 'H') {
                        start = ix.x - this.x - CROSSWALK_BUFFER;
                        end = (ix.x + ix.width) - this.x + CROSSWALK_BUFFER;
                    } else {
                        start = ix.y - this.y - CROSSWALK_BUFFER;
                        end = (ix.y + ix.height) - this.y + CROSSWALK_BUFFER;
                    }
                    exclusions.push({ start, end });
                });
                exclusions.sort((a, b) => a.start - b.start);
            
                const mergedExclusions = [];
                if (exclusions.length > 0) {
                    let curr = exclusions[0];
                    for (let i = 1; i < exclusions.length; i++) {
                        if (curr.end >= exclusions[i].start) {
                            curr.end = Math.max(curr.end, exclusions[i].end);
                        } else {
                            mergedExclusions.push(curr);
                            curr = exclusions[i];
                        }
                    }
                    mergedExclusions.push(curr);
                }
            
                const validSegments = [];
                let cursor = 0;
                mergedExclusions.forEach(ex => {
                    if (ex.start > cursor) validSegments.push({ start: cursor, end: ex.start });
                    cursor = Math.max(cursor, ex.end);
                });
                if (cursor < this.length) validSegments.push({ start: cursor, end: this.length });
            
                const lines = [];
                if (this.orientation === 'H') {
                    lines.push({ y: this.y - PAVEMENT_INSET, angle: Math.PI, color: '#ffaa00' }); 
                    lines.push({ y: this.y + this.h + PAVEMENT_INSET, angle: 0, color: '#ffffff' }); 
                } else {
                    lines.push({ x: this.x - PAVEMENT_INSET, angle: Math.PI / 2, color: '#ffaa00' }); 
                    lines.push({ x: this.x + this.w + PAVEMENT_INSET, angle: -Math.PI / 2, color: '#ffffff' }); 
                }
            
                validSegments.forEach(seg => {
                    const segLen = seg.end - seg.start;
                    if (segLen < 50) return; 
            
                    const count = Math.floor(segLen / spacing);
                    const actualSpacing = count > 0 ? segLen / (count + 1) : segLen / 2;
            
                    lines.forEach(line => {
                        for (let i = 1; i <= Math.max(1, count); i++) {
                            const offset = seg.start + (actualSpacing * i);
                            let lx, ly;
                            
                            if (this.orientation === 'H') {
                                lx = this.x + offset;
                                ly = line.y;
                            } else {
                                lx = line.x;
                                ly = this.y + offset;
                            }
            
                            lamps.push(new LampEntity({
                                x: lx, y: ly, lampType: 2, color: line.color, angle: line.angle
                            }));
                        }
                    });
                });
            
                return lamps;
            }
            
            draw(ctx) {
                const corners = this.getCorners();
                
                // Fill road polygon
                ctx.fillStyle = '#222225'; 
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
                ctx.closePath();
                ctx.fill();
                
                // Lane lines
                ctx.lineWidth = 2;
                const totalLanes = this.symmetrical ? this.numLanes * 2 : this.numLanes;
                const halfT = this.thickness / 2;
                
                const drawLine = (x1, y1, x2, y2, style) => {
                    ctx.strokeStyle = style === 'dash' ? '#888' : (style === 'solid' ? '#ddd' : '#444');
                    ctx.setLineDash(style === 'dash' ? [20, 15] : []);
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                };
                
                // Interior lane dividers
                for (let i = 1; i < totalLanes; i++) {
                    const offset = (i * this.laneWidth) - halfT;
                    const p1 = this.paramToWorld(0, offset);
                    const p2 = this.paramToWorld(this.length, offset);
                    const style = (this.symmetrical && i === this.numLanes) ? 'solid' : 'dash';
                    drawLine(p1.x, p1.y, p2.x, p2.y, style);
                }
                
                // Edge lines
                const e1s = this.paramToWorld(0, -halfT);
                const e1e = this.paramToWorld(this.length, -halfT);
                const e2s = this.paramToWorld(0, halfT);
                const e2e = this.paramToWorld(this.length, halfT);
                drawLine(e1s.x, e1s.y, e1e.x, e1e.y, 'edge');
                drawLine(e2s.x, e2s.y, e2e.x, e2e.y, 'edge');
                
                ctx.setLineDash([]);
                
                if (this.name) {
                    ctx.save();
                    ctx.font = "500 11px Montserrat, sans-serif";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
                    const label = this.name.toUpperCase();

                    // Multiple labels along the road — one every ~LABEL_SPACING px,
                    // minimum 1. Same (i + 0.5) / N distribution as the M-map labels:
                    // for N=1 the label sits at center (identical to old behavior),
                    // for N>1 they distribute evenly along the road axis.
                    const LABEL_SPACING = 600;
                    const labelCount = Math.max(1, Math.round(this.length / LABEL_SPACING));

                    for (let i = 0; i < labelCount; i++) {
                        const distAlong = this.length * ((i + 0.5) / labelCount);
                        if (this.symmetrical) {
                            /* One label per carriageway, mirrored about the solid
                               centreline — the way road paint actually works, where
                               each side is oriented for the traffic that reads it.
                               The far copy is rotated by PI, so from a fixed
                               overhead camera one of the pair reads upside down.
                               That is correct rather than a defect: it is what
                               makes the two read as painted markings instead of
                               one label drawn twice by mistake.

                               Both sit just inside the innermost lane. An earlier
                               attempt centred them in each carriageway at halfT/2,
                               which is numLanes*30 — and since dividers fall on
                               multiples of laneWidth from the centre, every EVEN
                               lane count put the text straight through a dashed
                               line. Hugging the centreline avoids every divider at
                               any lane count, and is clamped so it can never
                               escape the innermost lane. */
                            const lateral = Math.min(13, this.laneWidth * 0.35);
                            const p1 = this.paramToWorld(distAlong, -lateral);
                            const p2 = this.paramToWorld(distAlong, lateral);
                            ctx.save(); ctx.translate(p1.x, p1.y); ctx.rotate(this.angle);
                            ctx.fillText(label, 0, 0); ctx.restore();
                            ctx.save(); ctx.translate(p2.x, p2.y); ctx.rotate(this.angle + Math.PI);
                            ctx.fillText(label, 0, 0); ctx.restore();
                        } else {
                            const p = this.paramToWorld(distAlong, 0);
                            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.angle);
                            ctx.fillText(label, 0, 0); ctx.restore();
                        }
                    }
                    ctx.restore();
                }
            }
        }

        /**
         * RoadNetwork: Central manager for the segment-based road system.
         */
        class RoadNetwork {
            constructor() {
                // === PRIMARY COLLECTIONS ===
                this.roads = [];
                this.segments = [];
                this.lanes = [];
                this.intersections = [];
                this.gates = [];
                this.turnPaths = [];
                
                // === LEGACY COMPATIBILITY ===
                this.allLanes = this.lanes;
                
                // === LOOKUP MAPS ===
                this.roadById = new Map();
                this.segmentById = new Map();
                this.laneById = new Map();
                this.intersectionById = new Map();
                this.gateById = new Map();
                this.turnPathById = new Map();
                
                // === NAVIGATION GRAPH ===
                this.navGraph = null;
            }
            
            // === LOOKUP METHODS ===
            getRoad(id) { return this.roadById.get(id); }
            getSegment(id) { return this.segmentById.get(id); }
            getLane(id) { return this.laneById.get(id); }
            getIntersection(id) { return this.intersectionById.get(id); }
            getGate(id) { return this.gateById.get(id); }
            getTurnPath(id) { return this.turnPathById.get(id); }
            
            addRoad(road) {
                this.roads.push(road);
                this.roadById.set(road.id, road);
            }
            
            registerTurnPath(turnPath) {
                this.turnPathById.set(turnPath.id, turnPath);
            }
            
            buildGraph() {
                console.log(`=== BUILDING ROAD NETWORK ===`);
                console.log(`Roads: ${this.roads.length}`);
                
                resetRoadNetworkIds();
                _roadIdCounter = this.roads.length; // Preserve road count
                
                this._detectIntersections();
                console.log(`Intersections: ${this.intersections.length}`);
                
                this._buildSegments();
                console.log(`Segments: ${this.segments.length}`);
                
                this._registerLanes();
                console.log(`Lanes: ${this.lanes.length}`);
                
                this._createGates();
                console.log(`Gates: ${this.gates.length}`);
                
                this._createTurnPaths();
                console.log(`Turn Paths: ${this.turnPaths.length}`);
                
                this._connectSegments();
                this._populateLaneIntersectionZones();
                this._buildNavigationGraph();
                
                console.log(`Nav Graph Nodes: ${this.navGraph?.nodes.length || 0}`);
                console.log(`=== ROAD NETWORK COMPLETE ===`);
            }
            
            _detectIntersections() {
                this.intersections = [];
                
                for (let i = 0; i < this.roads.length; i++) {
                    for (let j = i + 1; j < this.roads.length; j++) {
                        const r1 = this.roads[i];
                        const r2 = this.roads[j];
                        
                        const overlap = this._getRoadOverlap(r1, r2);
                        if (overlap) {
                            const intersection = new Intersection(
                                overlap.x - 5, overlap.y - 5,
                                overlap.w + 10, overlap.h + 10
                            );
                            
                            intersection.addRoad(r1);
                            intersection.addRoad(r2);
                            
                            r1.intersections.push(intersection);
                            r1.intersectionIds.push(intersection.id);
                            r2.intersections.push(intersection);
                            r2.intersectionIds.push(intersection.id);
                            
                            this.intersections.push(intersection);
                            this.intersectionById.set(intersection.id, intersection);
                        }
                    }
                }
            }
            
            _getRoadOverlap(r1, r2) {
                // Quick AABB pre-check
                if (r1.x >= r2.x + r2.w || r2.x >= r1.x + r1.w ||
                    r1.y >= r2.y + r2.h || r2.y >= r1.y + r1.h) {
                    return null;
                }
                
                // For axis-aligned roads, use precise overlap
                if (!r1.isDiagonal && !r2.isDiagonal) {
                    let x, y, w, h;
                    if (r1.orientation !== r2.orientation) {
                        const vRoad = r1.orientation === 'V' ? r1 : r2;
                        const hRoad = r1.orientation === 'H' ? r1 : r2;
                        x = vRoad.x;
                        y = hRoad.y;
                        w = vRoad.thickness;
                        h = hRoad.thickness;
                    } else {
                        x = Math.max(r1.x, r2.x);
                        y = Math.max(r1.y, r2.y);
                        w = Math.min(r1.x + r1.w, r2.x + r2.w) - x;
                        h = Math.min(r1.y + r1.h, r2.y + r2.h) - y;
                    }
                    return { x, y, w, h };
                }
                
                // At least one diagonal road — find centerline intersection point
                // Project road center lines and find closest approach
                const seg1 = { x1: r1.x1, y1: r1.y1, x2: r1.x2, y2: r1.y2 };
                const seg2 = { x1: r2.x1, y1: r2.y1, x2: r2.x2, y2: r2.y2 };
                
                // Line-line intersection
                const d1x = seg1.x2 - seg1.x1, d1y = seg1.y2 - seg1.y1;
                const d2x = seg2.x2 - seg2.x1, d2y = seg2.y2 - seg2.y1;
                const denom = d1x * d2y - d1y * d2x;
                
                let ix, iy;
                if (Math.abs(denom) < 0.001) {
                    // Parallel — use midpoint of overlap region
                    ix = (Math.max(r1.x, r2.x) + Math.min(r1.x + r1.w, r2.x + r2.w)) / 2;
                    iy = (Math.max(r1.y, r2.y) + Math.min(r1.y + r1.h, r2.y + r2.h)) / 2;
                } else {
                    const t = ((seg2.x1 - seg1.x1) * d2y - (seg2.y1 - seg1.y1) * d2x) / denom;
                    ix = seg1.x1 + t * d1x;
                    iy = seg1.y1 + t * d1y;
                }
                
                // Check that intersection point is within both roads' extents
                const p1 = r1.worldToParam(ix, iy);
                const p2 = r2.worldToParam(ix, iy);
                const halfT1 = r1.thickness / 2 + 5;
                const halfT2 = r2.thickness / 2 + 5;
                
                if (p1.along < -halfT1 || p1.along > r1.length + halfT1) return null;
                if (p2.along < -halfT2 || p2.along > r2.length + halfT2) return null;
                if (Math.abs(p1.lateral) > halfT1 + halfT2) return null;
                if (Math.abs(p2.lateral) > halfT1 + halfT2) return null;
                
                // Create intersection box centered on the crossing point
                const size = Math.max(r1.thickness, r2.thickness);
                return { x: ix - size / 2, y: iy - size / 2, w: size, h: size };
            }
            
            _buildSegments() {
                for (const road of this.roads) {
                    const intCoords = [];
                    for (const intersection of road.intersections) {
                        // Project intersection AABB corners onto road axis to get parametric span
                        const ix = intersection.x, iy = intersection.y;
                        const iw = intersection.width, ih = intersection.height;
                        const corners = [
                            road.worldToParam(ix, iy),
                            road.worldToParam(ix + iw, iy),
                            road.worldToParam(ix, iy + ih),
                            road.worldToParam(ix + iw, iy + ih)
                        ];
                        const minAlong = Math.min(...corners.map(c => c.along));
                        const maxAlong = Math.max(...corners.map(c => c.along));
                        intCoords.push({ id: intersection.id, coord: minAlong, width: maxAlong - minAlong });
                    }
                    
                    road.buildSegments(intCoords);
                    
                    for (const segment of road.segments) {
                        this.segments.push(segment);
                        this.segmentById.set(segment.id, segment);
                    }
                }
            }
            
            _registerLanes() {
                this.lanes = [];
                for (const segment of this.segments) {
                    for (const lane of segment.lanes) {
                        this.lanes.push(lane);
                        this.laneById.set(lane.id, lane);
                    }
                }
                this.allLanes = this.lanes;
            }
            
            _createGates() {
                // Gates connect lanes to intersections:
                // - ENTRY gate: Where a lane ENTERS an intersection (at lane's exit point)
                // - EXIT gate: Where a lane EXITS an intersection (at lane's starting point)
                //
                // Lane direction determines flow:
                // - direction > 0: flows startCoord → endCoord
                // - direction < 0: flows endCoord → startCoord
                
                for (const intersection of this.intersections) {
                    for (const road of intersection.roads) {
                        for (const segment of road.segments) {
                            // Segment's endBound touches this intersection
                            if (segment.endBound === intersection.id) {
                                for (const lane of segment.lanes) {
                                    if (lane.direction > 0) {
                                        // Lane flows toward endCoord, so it ENTERS intersection here
                                        const gate = new Gate(intersection, lane, 'entry');
                                        intersection.addGate(gate);
                                        lane.exitGate = gate;
                                        this.gates.push(gate);
                                        this.gateById.set(gate.id, gate);
                                    } else {
                                        // Lane flows FROM endCoord, so it EXITS intersection here
                                        const gate = new Gate(intersection, lane, 'exit');
                                        intersection.addGate(gate);
                                        lane.entryGate = gate;
                                        this.gates.push(gate);
                                        this.gateById.set(gate.id, gate);
                                    }
                                }
                            }
                            
                            // Segment's startBound touches this intersection
                            if (segment.startBound === intersection.id) {
                                for (const lane of segment.lanes) {
                                    if (lane.direction > 0) {
                                        // Lane flows FROM startCoord, so it EXITS intersection here
                                        const gate = new Gate(intersection, lane, 'exit');
                                        intersection.addGate(gate);
                                        lane.entryGate = gate;
                                        this.gates.push(gate);
                                        this.gateById.set(gate.id, gate);
                                    } else {
                                        // Lane flows toward startCoord, so it ENTERS intersection here
                                        const gate = new Gate(intersection, lane, 'entry');
                                        intersection.addGate(gate);
                                        lane.exitGate = gate;
                                        this.gates.push(gate);
                                        this.gateById.set(gate.id, gate);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            _createTurnPaths() {
                for (const intersection of this.intersections) {
                    for (const entryGate of intersection.entryGates) {
                        for (const exitGate of intersection.exitGates) {
                            // Only skip if same lane (physically impossible, but safety check)
                            // This allows:
                            // - Turns to different roads
                            // - Straight-through (same road, different segment)
                            // - U-turns (same segment, different lane/direction)
                            if (entryGate.laneId === exitGate.laneId) continue;
                            
                            const controlPoints = this._calculateTurnPathCurve(entryGate, exitGate, intersection);
                            const turnPath = new TurnPath(entryGate, exitGate, controlPoints);
                            
                            if (turnPath.length > 5) {
                                intersection.addTurnPath(turnPath);
                                this.turnPaths.push(turnPath);
                                this.turnPathById.set(turnPath.id, turnPath);
                            }
                        }
                    }
                }
            }
            
            _calculateTurnPathCurve(entryGate, exitGate, intersection) {
                const p0 = { x: entryGate.x, y: entryGate.y };
                const p2 = { x: exitGate.x, y: exitGate.y };
                
                let angleDiff = Math.abs(entryGate.angle - exitGate.angle);
                angleDiff = normalizeAngle(angleDiff);
                const isStraight = Math.abs(angleDiff) < 0.5;
                
                const pullStrength = isStraight ? 0.0 : 0.5;
                const p1 = {
                    x: (p0.x + p2.x)/2 + (intersection.centerX - (p0.x + p2.x)/2) * pullStrength,
                    y: (p0.y + p2.y)/2 + (intersection.centerY - (p0.y + p2.y)/2) * pullStrength
                };
                
                return [p0, p1, p2];
            }
            
            _connectSegments() {
                for (const road of this.roads) {
                    for (let i = 0; i < road.segments.length - 1; i++) {
                        const seg1 = road.segments[i];
                        const seg2 = road.segments[i + 1];
                        
                        if (seg1.endBound !== null) continue;
                        
                        for (const lane1 of seg1.lanes) {
                            for (const lane2 of seg2.lanes) {
                                if (lane1.laneIndex === lane2.laneIndex && 
                                    lane1.direction === lane2.direction) {
                                    if (lane1.direction > 0) {
                                        lane1.connections.push(lane2);
                                        lane1.connectionIds.push(lane2.id);
                                    } else {
                                        lane2.connections.push(lane1);
                                        lane2.connectionIds.push(lane1.id);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            _populateLaneIntersectionZones() {
                for (let lane of this.lanes) {
                    lane.intersectingZones = [];
                    
                    for (let intersection of this.intersections) {
                        const hits = getLineRectIntersections(
                            lane.start.x, lane.start.y, lane.end.x, lane.end.y,
                            intersection.x, intersection.y, intersection.width, intersection.height
                        );
                        
                        if (hits.length > 0) {
                            let entryPoint = null;
                            let entryDist = Infinity;
                            
                            for (let hit of hits) {
                                const dist = Math.hypot(hit.x - lane.start.x, hit.y - lane.start.y);
                                if (dist < entryDist) {
                                    entryDist = dist;
                                    entryPoint = hit;
                                }
                            }
                            
                            if (entryPoint) {
                                lane.intersectingZones.push({
                                    intersection: intersection,
                                    intersectionId: intersection.id,
                                    entryDist: entryDist,
                                    entryPoint: { x: entryPoint.x, y: entryPoint.y }
                                });
                            }
                        }
                    }
                    
                    lane.intersectingZones.sort((a, b) => a.entryDist - b.entryDist);
                }
            }
            
            _buildNavigationGraph() {
                const nodes = [];
                const nodeById = new Map();
                
                for (const intersection of this.intersections) {
                    const node = {
                        id: intersection.id,
                        x: intersection.centerX,
                        y: intersection.centerY,
                        intersection: intersection,
                        neighbors: []
                    };
                    nodes.push(node);
                    nodeById.set(intersection.id, node);
                }
                
                for (const segment of this.segments) {
                    if (segment.startBound && segment.endBound) {
                        const nodeA = nodeById.get(segment.startBound);
                        const nodeB = nodeById.get(segment.endBound);
                        
                        if (nodeA && nodeB) {
                            const distance = segment.length;
                            
                            if (!nodeA.neighbors.find(n => n.nodeId === nodeB.id && n.segmentId === segment.id)) {
                                nodeA.neighbors.push({
                                    nodeId: nodeB.id, node: nodeB,
                                    segmentId: segment.id, segment: segment,
                                    roadId: segment.roadId, road: segment.road,
                                    distance: distance
                                });
                            }
                            if (!nodeB.neighbors.find(n => n.nodeId === nodeA.id && n.segmentId === segment.id)) {
                                nodeB.neighbors.push({
                                    nodeId: nodeA.id, node: nodeA,
                                    segmentId: segment.id, segment: segment,
                                    roadId: segment.roadId, road: segment.road,
                                    distance: distance
                                });
                            }
                        }
                    }
                }
                
                this.navGraph = { nodes, nodeById };
            }
            
            findPath(startIntersectionId, endIntersectionId) {
                if (!this.navGraph) return null;
                
                const startNode = this.navGraph.nodeById.get(startIntersectionId);
                const endNode = this.navGraph.nodeById.get(endIntersectionId);
                
                if (!startNode || !endNode) return null;
                if (startNode === endNode) {
                    return [{ intersectionId: startIntersectionId, segmentId: null, x: startNode.x, y: startNode.y }];
                }
                
                const openSet = [startNode];
                const closedSet = new Set();
                const cameFrom = new Map();
                const cameFromSegment = new Map();
                const gScore = new Map();
                const fScore = new Map();
                
                gScore.set(startNode, 0);
                fScore.set(startNode, Math.hypot(startNode.x - endNode.x, startNode.y - endNode.y));
                
                while (openSet.length > 0) {
                    openSet.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
                    const current = openSet.shift();
                    
                    if (current === endNode) {
                        const path = [];
                        let node = endNode;
                        while (cameFrom.has(node)) {
                            const segmentToHere = cameFromSegment.get(node);
                            path.unshift({
                                intersectionId: node.id,
                                segmentId: segmentToHere?.id || null,
                                segment: segmentToHere,
                                roadId: segmentToHere?.roadId || null,
                                road: segmentToHere?.road || null,
                                x: node.x,
                                y: node.y
                            });
                            node = cameFrom.get(node);
                        }
                        path.unshift({
                            intersectionId: startNode.id,
                            segmentId: null, segment: null,
                            roadId: null, road: null,
                            x: startNode.x, y: startNode.y
                        });
                        return path;
                    }
                    
                    closedSet.add(current);
                    
                    for (const neighbor of current.neighbors) {
                        if (closedSet.has(neighbor.node)) continue;
                        
                        const tentativeG = (gScore.get(current) ?? Infinity) + neighbor.distance;
                        const existingG = gScore.get(neighbor.node) ?? Infinity;
                        
                        if (tentativeG < existingG) {
                            cameFrom.set(neighbor.node, current);
                            cameFromSegment.set(neighbor.node, neighbor.segment);
                            gScore.set(neighbor.node, tentativeG);
                            fScore.set(neighbor.node, tentativeG + 
                                Math.hypot(neighbor.node.x - endNode.x, neighbor.node.y - endNode.y));
                            
                            if (!openSet.includes(neighbor.node)) {
                                openSet.push(neighbor.node);
                            }
                        }
                    }
                }
                
                return null;
            }
            
            findNearestLane(x, y, maxDist = 100) {
                let nearest = null;
                let nearestDist = maxDist;
                
                for (const lane of this.lanes) {
                    const dist = lane.getDistanceAlong(x, y);
                    const t = clamp(dist / lane.length, 0, 1);
                    const point = lane.getPoint(t);
                    const d = Math.hypot(x - point.x, y - point.y);
                    
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearest = lane;
                    }
                }
                
                return nearest;
            }
            
            findNearestIntersection(x, y) {
                let nearest = null;
                let nearestDist = Infinity;
                
                for (const intersection of this.intersections) {
                    const d = Math.hypot(x - intersection.centerX, y - intersection.centerY);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearest = intersection;
                    }
                }
                
                return nearest;
            }
            
            findNearestRoadPoint(x, y) {
                let nearest = null;
                let nearestDist = Infinity;
                
                for (let road of this.roads) {
                    // Project point onto road centerline, clamp to road length
                    const p = road.worldToParam(x, y);
                    const clamped = Math.max(0, Math.min(road.length, p.along));
                    const pt = road.paramToWorld(clamped, 0);
                    
                    const dist = Math.hypot(x - pt.x, y - pt.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = { x: pt.x, y: pt.y, road: road, roadId: road.id, distance: dist };
                    }
                }
                
                return nearest;
            }
            
            getIntersectionsForRoad(road) {
                return this.intersections.filter(i => 
                    i.x <= road.x + road.w && i.x + i.width >= road.x &&
                    i.y <= road.y + road.h && i.y + i.height >= road.y
                );
            }
            
            generateCrosswalks(pavements) {
                const crosswalks = [];
                pavements.forEach(pav => {
                    this.roads.forEach(road => {
                        const ix = Math.max(pav.x, road.x);
                        const iy = Math.max(pav.y, road.y);
                        const iw = Math.min(pav.x + pav.w, road.x + road.w) - ix;
                        const ih = Math.min(pav.y + pav.h, road.y + road.h) - iy;

                        if (iw > 0 && ih > 0) {
                            crosswalks.push({ x: ix, y: iy, w: iw, h: ih, orientation: road.orientation });
                        }
                    });
                });
                return crosswalks;
            }
            
            draw(ctx, debug) {
                this.roads.forEach(r => r.draw(ctx));
                
                if (debug) {
                    ctx.save();
                    for (let lane of this.lanes) {
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
                        ctx.beginPath();
                        ctx.arc(lane.start.x, lane.start.y, 5, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                        ctx.beginPath();
                        ctx.arc(lane.end.x, lane.end.y, 5, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.fillStyle = '#0f0';
                        ctx.font = '9px monospace';
                        ctx.fillText(lane.id, lane.start.x + 5, lane.start.y - 5);
                        
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(lane.start.x, lane.start.y);
                        ctx.lineTo(lane.end.x, lane.end.y);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                
                this.intersections.forEach(i => i.draw(ctx, debug));
            }
            
            debugPrint() {
                console.log('=== ROAD NETWORK DEBUG ===');
                console.log(`Roads: ${this.roads.length}`);
                for (const road of this.roads) {
                    console.log(`  ${road.id} "${road.name}" - ${road.segments.length} segments, ${road.lanes.length} lanes`);
                    for (const segment of road.segments) {
                        console.log(`    ${segment.id}: [${segment.startBound || 'dead-end'}] -> [${segment.endBound || 'dead-end'}]`);
                    }
                }
                console.log(`Intersections: ${this.intersections.length}`);
                for (const int of this.intersections) {
                    console.log(`  ${int.id}: ${int.entryGates.length} entry gates, ${int.exitGates.length} exit gates, ${int.turnPaths.length} turn paths`);
                }
                console.log(`Segments: ${this.segments.length}`);
                console.log(`Lanes: ${this.lanes.length}`);
                console.log(`Gates: ${this.gates.length}`);
                console.log(`Turn Paths: ${this.turnPaths.length}`);
                console.log('============================');
            }
            
            // ================================================================
            // PRECISE LANE-LEVEL PATHFINDING
            // ================================================================
            
            /**
             * Find the best lane at a position heading toward a target.
             * @returns {Lane} The best matching lane
             */
            findBestLaneAt(x, y, targetX, targetY, maxDist = 100) {
                const targetAngle = Math.atan2(targetY - y, targetX - x);
                let bestLane = null;
                let bestScore = Infinity;
                
                for (const lane of this.lanes) {
                    // Get distance to lane
                    const dist = lane.getDistanceAlong(x, y);
                    const t = clamp(dist / lane.length, 0, 1);
                    const point = lane.getPoint(t);
                    const d = Math.hypot(x - point.x, y - point.y);
                    
                    if (d > maxDist) continue;
                    
                    // Check angle alignment
                    let angleDiff = Math.abs(targetAngle - lane.angle);
                    angleDiff = normalizeAngle(angleDiff);
                    angleDiff = Math.abs(angleDiff);
                    
                    // Prefer lanes heading toward target (angle diff < 90 deg)
                    if (angleDiff > Math.PI / 2) continue;
                    
                    const score = d + angleDiff * 50; // Balance distance and angle
                    if (score < bestScore) {
                        bestScore = score;
                        bestLane = lane;
                    }
                }
                
                return bestLane;
            }
            
            /**
             * Build a precise lane-level path from start to end.
             * Returns array of waypoints with lane, segment, gate, and turnPath info.
             * 
             * Waypoint types:
             *   - LANE_START: Start point on a lane
             *   - LANE_POINT: Point along a lane
             *   - GATE_ENTRY: Entering an intersection
             *   - TURN_PATH: Curved path through intersection
             *   - GATE_EXIT: Exiting an intersection
             *   - DESTINATION: Final target
             */
            buildPrecisePath(startX, startY, endX, endY) {
                const path = [];
                
                // Find start and end lanes
                const startLane = this.findBestLaneAt(startX, startY, endX, endY);
                const endLane = this.findBestLaneAt(endX, endY, startX, startY);
                
                if (!startLane) {
                    console.warn('[NAV] No start lane found');
                    return [{ type: 'DESTINATION', x: endX, y: endY }];
                }
                
                // Get segments
                const startSegment = startLane.segment;
                const endSegment = endLane?.segment;
                
                // Find nearest intersections
                const startInt = this.findNearestIntersection(startX, startY);
                const endInt = this.findNearestIntersection(endX, endY);
                
                if (!startInt || !endInt) {
                    return this._buildSimpleLanePath(startLane, startX, startY, endX, endY);
                }
                
                // Get intersection-level A* path
                const intPath = this.findPath(startInt.id, endInt.id);
                
                if (!intPath || intPath.length === 0) {
                    console.warn('[NAV] No intersection path found');
                    return this._buildSimpleLanePath(startLane, startX, startY, endX, endY);
                }
                
                console.log(`[NAV] A* path through ${intPath.length} intersections`);
                
                // Start waypoint
                path.push({
                    type: 'LANE_START',
                    x: startX, y: startY,
                    lane: startLane,
                    laneId: startLane.id,
                    segment: startSegment,
                    segmentId: startSegment.id,
                    road: startLane.road,
                    roadId: startLane.roadId
                });
                
                // Track current lane through the path
                let currentLane = startLane;
                
                // Build path through each intersection
                for (let i = 0; i < intPath.length; i++) {
                    const intWaypoint = intPath[i];
                    const intersection = this.getIntersection(intWaypoint.intersectionId);
                    
                    if (!intersection) continue;
                    
                    // Determine the target segment (what we need to exit onto)
                    let targetSegment = null;
                    if (i < intPath.length - 1) {
                        // There's a next intersection - use the connecting segment
                        const nextWaypoint = intPath[i + 1];
                        targetSegment = nextWaypoint.segment;
                    } else if (endSegment) {
                        // This is the last intersection - target the end segment
                        targetSegment = endSegment;
                    }
                    
                    // Find turn path from current lane to target segment
                    let turnPath = null;
                    
                    if (targetSegment) {
                        // First try: use current lane's exit gate
                        turnPath = this._findTurnPathToSegment(currentLane, intersection, targetSegment);
                        
                        // Second try: find ANY turn path from current road to target segment
                        if (!turnPath && currentLane.road) {
                            turnPath = this._findAnyTurnPathBetween(
                                currentLane.road, targetSegment, intersection
                            );
                        }
                    }
                    
                    if (turnPath) {
                        // Add lane end point (where we exit onto the turn)
                        const laneEndX = currentLane.end.x;
                        const laneEndY = currentLane.end.y;
                        
                        path.push({
                            type: 'LANE_END',
                            x: laneEndX, y: laneEndY,
                            lane: currentLane,
                            laneId: currentLane.id,
                            segment: currentLane.segment,
                            segmentId: currentLane.segmentId
                        });
                        
                        // Add entry gate
                        path.push({
                            type: 'GATE_ENTRY',
                            x: turnPath.fromGate.x,
                            y: turnPath.fromGate.y,
                            gate: turnPath.fromGate,
                            gateId: turnPath.fromGate.id,
                            intersection: intersection,
                            intersectionId: intersection.id,
                            fromLane: turnPath.fromLane,
                            fromLaneId: turnPath.fromLaneId
                        });
                        
                        // Add turn path (the curve through intersection)
                        path.push({
                            type: 'TURN_PATH',
                            x: intersection.centerX,
                            y: intersection.centerY,
                            turnPath: turnPath,
                            turnPathId: turnPath.id,
                            controlPoints: turnPath.controlPoints,
                            intersection: intersection,
                            intersectionId: intersection.id,
                            fromLaneId: turnPath.fromLaneId,
                            toLaneId: turnPath.toLaneId,
                            toSegmentId: turnPath.toSegmentId
                        });
                        
                        // Add exit gate
                        path.push({
                            type: 'GATE_EXIT',
                            x: turnPath.toGate.x,
                            y: turnPath.toGate.y,
                            gate: turnPath.toGate,
                            gateId: turnPath.toGate.id,
                            lane: turnPath.toLane,
                            laneId: turnPath.toLane.id,
                            segment: turnPath.toLane.segment,
                            segmentId: turnPath.toLane.segmentId,
                            road: turnPath.toLane.road,
                            roadId: turnPath.toLane.roadId
                        });
                        
                        // Update current lane
                        currentLane = turnPath.toLane;
                        
                        console.log(`[NAV] Turn at ${intersection.id}: ${turnPath.fromLaneId} -> ${turnPath.toLaneId}`);
                    } else {
                        // Fallback: create ad-hoc curve through intersection
                        const lastWp = path.length > 0 ? path[path.length - 1] : null;
                        const entryX = lastWp ? lastWp.x : intersection.centerX;
                        const entryY = lastWp ? lastWp.y : intersection.centerY;
                        
                        // Determine exit point based on target segment
                        let exitX = intersection.centerX;
                        let exitY = intersection.centerY;
                        if (targetSegment && targetSegment.road) {
                            const tRoad = targetSegment.road;
                            if (tRoad.orientation === 'H') {
                                exitX = tRoad.x + tRoad.w / 2;
                                exitY = tRoad.y + tRoad.h / 2;
                            } else {
                                exitX = tRoad.x + tRoad.w / 2;
                                exitY = tRoad.y + tRoad.h / 2;
                            }
                        }
                        
                        // Create curve control points
                        const controlPoints = [
                            { x: entryX, y: entryY },
                            { x: intersection.centerX, y: intersection.centerY },
                            { x: exitX, y: exitY }
                        ];
                        
                        path.push({
                            type: 'TURN_PATH',
                            x: intersection.centerX,
                            y: intersection.centerY,
                            intersection: intersection,
                            intersectionId: intersection.id,
                            road: intWaypoint.road,
                            roadId: intWaypoint.roadId,
                            controlPoints: controlPoints,
                            turnPathId: `fallback_${intersection.id}`
                        });
                        
                        // Try to find a lane on the target segment
                        if (targetSegment) {
                            const nextLane = this._findLaneOnSegment(targetSegment, intersection.id);
                            if (nextLane) {
                                currentLane = nextLane;
                            }
                        }
                        
                        console.log(`[NAV] Created fallback curve at ${intersection.id}`);
                    }
                }
                
                // Add final destination
                path.push({
                    type: 'DESTINATION',
                    x: endX, y: endY,
                    lane: endLane,
                    laneId: endLane?.id,
                    segment: endSegment,
                    segmentId: endSegment?.id
                });
                
                console.log(`[NAV] Built precise path: ${path.length} waypoints, ${path.filter(w => w.type === 'TURN_PATH').length} turns`);
                return path;
            }
            
            /**
             * Find ANY turn path from a road to a target segment through an intersection.
             */
            _findAnyTurnPathBetween(fromRoad, toSegment, intersection) {
                for (const tp of intersection.turnPaths) {
                    if (tp.fromRoadId === fromRoad.id && tp.toSegmentId === toSegment.id) {
                        return tp;
                    }
                }
                // Less strict: just match target segment
                for (const tp of intersection.turnPaths) {
                    if (tp.toSegmentId === toSegment.id) {
                        return tp;
                    }
                }
                return null;
            }
            
            /**
             * Find a turn path that leads from currentLane through intersection to targetSegment.
             */
            _findTurnPathToSegment(currentLane, intersection, targetSegment) {
                if (!currentLane || !intersection || !targetSegment) return null;
                
                // Get all turn paths from current lane's exit gate
                const exitGate = currentLane.exitGate;
                if (!exitGate || exitGate.intersectionId !== intersection.id) {
                    // Lane doesn't exit at this intersection - find one that does
                    for (const tp of intersection.turnPaths) {
                        if (tp.toSegmentId === targetSegment.id) {
                            return tp;
                        }
                    }
                    return null;
                }
                
                // Find turn path from this gate to target segment
                for (const tp of exitGate.turnPaths) {
                    if (tp.toSegmentId === targetSegment.id) {
                        return tp;
                    }
                }
                
                // Fallback: any turn path to target segment
                for (const tp of intersection.turnPaths) {
                    if (tp.toSegmentId === targetSegment.id) {
                        return tp;
                    }
                }
                
                return null;
            }
            
            /**
             * Find a lane on a segment that starts from a given intersection.
             */
            _findLaneOnSegment(segment, fromIntersectionId) {
                for (const lane of segment.lanes) {
                    // Prefer lanes that flow away from this intersection
                    if (segment.startBound === fromIntersectionId && lane.direction > 0) {
                        return lane;
                    }
                    if (segment.endBound === fromIntersectionId && lane.direction < 0) {
                        return lane;
                    }
                }
                return segment.lanes[0];
            }
            
            /**
             * Build simple lane path (no intersections).
             */
            _buildSimpleLanePath(lane, startX, startY, endX, endY) {
                const path = [];
                
                path.push({
                    type: 'LANE_START',
                    x: startX, y: startY,
                    lane: lane,
                    laneId: lane.id
                });
                
                path.push({
                    type: 'LANE_POINT',
                    x: lane.end.x,
                    y: lane.end.y,
                    lane: lane,
                    laneId: lane.id
                });
                
                path.push({
                    type: 'DESTINATION',
                    x: endX, y: endY
                });
                
                return path;
            }
            
            /**
             * Generate drawable path segments from a precise path.
             * Returns array of { type: 'line'|'curve', points/controlPoints }
             */
            getDrawablePath(precisePath) {
                const segments = [];
                if (!precisePath || precisePath.length < 2) return segments;
                
                let lastPoint = null;
                
                for (let i = 0; i < precisePath.length; i++) {
                    const wp = precisePath[i];
                    
                    if (wp.type === 'TURN_PATH' && wp.controlPoints && wp.controlPoints.length >= 3) {
                        // Draw curve through intersection
                        segments.push({
                            type: 'curve',
                            controlPoints: wp.controlPoints
                        });
                        lastPoint = wp.controlPoints[wp.controlPoints.length - 1];
                    } else {
                        // For non-curve waypoints, draw line from last point
                        const point = { x: wp.x, y: wp.y };
                        
                        if (lastPoint && wp.type !== 'GATE_ENTRY') {
                            // Skip drawing lines TO gate entries (they're part of the curve)
                            const dist = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
                            if (dist > 10) {
                                segments.push({
                                    type: 'line',
                                    points: [lastPoint, point]
                                });
                            }
                        }
                        
                        // Don't update lastPoint for TURN_PATH center (use exit instead)
                        if (wp.type !== 'TURN_PATH') {
                            lastPoint = point;
                        }
                    }
                }
                
                return segments;
            }
        }

        /**
         * Factory function to create a Road from positional parameters
         */
        function createRoad(x, y, w, h, orientation = 'H', name = '', lanes = 2, symmetrical = true, hasPavements = false) {
            return new Road({
                x, y, w, h, orientation, name, lanes, symmetrical, hasPavements
            });
        }
        

