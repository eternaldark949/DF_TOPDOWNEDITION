        /* --- OPTIMIZATION: SPATIAL GRID --- */
        class SpatialGrid {
            constructor(width, height, cellSize) {
                this.width = width;
                this.height = height;
                this.cellSize = cellSize;
                this.cols = Math.ceil(width / cellSize);
                this.rows = Math.ceil(height / cellSize);
                this.cells = new Map();
            }
        
            clear() {
                this.cells.clear();
            }
        
            getKey(col, row) {
                return `${col},${row}`;
            }
        
            add(client) {
                // Determine grid cells the vehicle overlaps
                const r = Math.max(client.length, client.width) / 2;          // any heading
                const minCol = Math.floor((client.x - r) / this.cellSize);
                const maxCol = Math.floor((client.x + r) / this.cellSize);
                const minRow = Math.floor((client.y - r) / this.cellSize);
                const maxRow = Math.floor((client.y + r) / this.cellSize);
        
                for (let c = minCol; c <= maxCol; c++) {
                    for (let r = minRow; r <= maxRow; r++) {
                        const key = this.getKey(c, r);
                        if (!this.cells.has(key)) {
                            this.cells.set(key, []);
                        }
                        this.cells.get(key).push(client);
                    }
                }
            }
        
            getNearby(client) {
                const r = Math.max(client.length, client.width) / 2;          // any heading
                const minCol = Math.floor((client.x - r) / this.cellSize);
                const maxCol = Math.floor((client.x + r) / this.cellSize);
                const minRow = Math.floor((client.y - r) / this.cellSize);
                const maxRow = Math.floor((client.y + r) / this.cellSize);
        
                const nearby = new Set();
                for (let c = minCol; c <= maxCol; c++) {
                    for (let r = minRow; r <= maxRow; r++) {
                        const key = this.getKey(c, r);
                        if (this.cells.has(key)) {
                            const contents = this.cells.get(key);
                            for (let other of contents) {
                                if (other !== client) nearby.add(other);
                            }
                        }
                    }
                }
                return Array.from(nearby);
            }
        }

        class TrafficManager {
            constructor() { 
                this.vehicles = []; 
                this.spawnTimer = 0; 
                this.network = new RoadNetwork(); 
                // OPTIMIZATION: Grid size 150 covers roughly 2-3 car lengths
                this.grid = new SpatialGrid(2400, 3200, 150); 
            }
            
            reset() { 
                // Properly destroy all vehicle entities before clearing
                for (let v of this.vehicles) {
                    if (!v.markedForDestroy) v.destroy();
                }
                this.vehicles = []; 
                this.network = new RoadNetwork(); 
                this.grid.clear();
            }
            
            // Update signature to accept decalSystem
            update(player, map, playerCar, weather, ownedCar, decalSystem, teammates) { 
                if (map.type === 'indoor') return;
                
                // 1. GRID UPDATE: Clear and Rebuild
                this.grid.clear();
                
                // Add active traffic
                this.vehicles.forEach(v => {
                    if (!v.dead) this.grid.add(v);
                });
                
                // Add player car
                if (playerCar && playerCar.visible) {
                    this.grid.add(playerCar);
                }
                
                // Add Owned Car if it's separate from player car
                if (ownedCar && ownedCar.visible && ownedCar !== playerCar) {
                    this.grid.add(ownedCar);
                }
            
                this.spawnTimer--;
                
                // 0. UPDATE INTERSECTIONS
                for (let intersection of this.network.intersections) {
                    intersection.update();
                    if (intersection.queueUnchangedFrames === 0 && 
                        intersection.occupants.length === 0 && 
                        intersection.queue.length === 0) {
                        for (let v of this.vehicles) {
                            const wasInIntersection = v.wasInIntersection && v.currentIntersection === intersection;
                            const actuallyInside = intersection.recollectVehicle(v);
                            if (wasInIntersection && !actuallyInside) {
                                v.wasInIntersection = false;
                                v.currentIntersection = null;
                                v.hasIntersectionAccess = false;
                                v.intersectionTimer = 0;
                                v.isAggressive = false;
                            }
                        }
                    }
                }
                
                // 1. VEHICLE UPDATES & CLEANUP
                for (let i = this.vehicles.length - 1; i >= 0; i--) {
                    let v = this.vehicles[i]; 
                    const distToPlayer = Math.hypot(v.x - player.x, v.y - player.y);
                    
                    // Check if vehicle is near end of a dead-end lane (no connections)
                    let nearDeadEnd = false;
                    if (v.currentLane && v.controlMode === 'AI' && v.driverType !== 'player') {
                        const lane = v.currentLane;
                        const hasConnections = (lane.connections && lane.connections.length > 0) || 
                                              (lane.turnPaths && lane.turnPaths.length > 0);
                        if (!hasConnections) {
                            // Calculate distance to lane end
                            const lx = v.x - lane.start.x;
                            const ly = v.y - lane.start.y;
                            const distAlongLane = lx * lane.ux + ly * lane.uy;
                            const distToEnd = lane.length - distAlongLane;
                            
                            // Despawn if within 2 car lengths of dead-end (mirrors spawn offset)
                            if (distToEnd < 140) {
                                nearDeadEnd = true;
                            }
                        }
                    }
                    
                    // Gridlock relief: a car frozen for 15 s somewhere the player can't see quietly goes away
                    if (v.controlMode === 'AI' && Math.abs(v.speed || 0) < 0.2) v._frozen = (v._frozen || 0) + 1; else v._frozen = 0;
                    const frozenOut = v._frozen > 900 && v.driverType !== 'player' && v.driverType !== 'zib' && !v.isOwnedCar &&
                        !v.isDeliveryVehicle && distToPlayer > 900;
                    if (v.dead || distToPlayer > CONFIG.CULLING.VEHICLE_DESPAWN || nearDeadEnd || frozenOut) { 
                        if (v.currentIntersection) v.currentIntersection.releaseEntry(v);
                        // Properly destroy entity to unregister from collision system
                        if (!v.markedForDestroy) v.destroy();
                        this.vehicles.splice(i, 1);
                    } else {
                        // Pass decalSystem to update
                        v.update(player, playerCar, this.vehicles, weather, this.network.intersections, map.walls, getColliders(map), decalSystem, teammates);
                    }
                }
                
                // --- NEW: Update Owned Car Momentum ---
                if (ownedCar && ownedCar.visible) {
                     const isInList = this.vehicles.includes(ownedCar);
                     const isBeingDriven = (ownedCar === playerCar && ownedCar.hasDriver);
                     
                     if (!isInList && !isBeingDriven) {
                         ownedCar.update(player, playerCar, this.vehicles, weather, this.network.intersections, map.walls, getColliders(map), decalSystem);
                     }
                }
        
                // 2. SPAWN LOGIC
                if (this.vehicles.length < GameSettings.getMaxTraffic() && this.spawnTimer <= 0) { 
                    this.spawnTimer = 5;  // Was 20 — 4× faster spawn rate so crowd density actually fills
                    if (this.network.allLanes.length > 0) {
                        for(let k=0; k<8; k++) { 
                            const spawnLane = this.network.allLanes[Math.floor(Math.random() * this.network.allLanes.length)];
                            // Choose the car first, so the check is made where it will actually appear
                            const brand = TrafficVehicle._selectRandomBrand(), model = TrafficVehicle._selectRandomModel(brand);
                            const md = VEHICLE_BRANDS[brand].models[model], len = md.length;
                            let clear = true;
                            const spawnOffset = len * 2;              // TrafficVehicle places it two lengths in
                            const spawnX = spawnLane.start.x + spawnLane.ux * spawnOffset;
                            const spawnY = spawnLane.start.y + spawnLane.uy * spawnOffset;
                            const distToP = Math.hypot(player.x - spawnX, player.y - spawnY);
                            if (distToP < CONFIG.VEHICLE_AI.SPAWN_CLEAR_MIN || distToP > CONFIG.VEHICLE_AI.SPAWN_CLEAR_MAX) clear = false; 
                            if (clear) {
                                // Nobody within the separation, and nobody coming up the lane who couldn't stop for it
                                const cars = this.vehicles.concat(playerCar && playerCar.visible ? [playerCar] : []);
                                for (const v of cars) {
                                    const dx = v.x - spawnX, dy = v.y - spawnY;
                                    if (Math.hypot(dx, dy) < CONFIG.VEHICLE_AI.SPAWN_SEPARATION) { clear = false; break; }
                                    const along = dx * spawnLane.ux + dy * spawnLane.uy, lat = Math.abs(-dx * spawnLane.uy + dy * spawnLane.ux);
                                    if (lat > 34) continue;
                                    const sp = Math.abs(v.speed || 0), stop = sp * sp / (2 * (v.brake || 0.3));
                                    if (along < len + 40 && along > -(stop + len + v.length / 2 + 40)) { clear = false; break; }
                                }
                            }
                            if (clear) {
                                // Spawn new vehicle - it auto-registers via GameEntity queue
                                const newVehicle = new TrafficVehicle(spawnLane, brand, model);
                                this.vehicles.push(newVehicle);
                                break; 
                            }
                        }
                    }
                }
            }
            
            // Optimized Collision Resolution with DEBRIS
            resolveCollisions(playerCar, player, weather, audioSys, ownedCar, decalSystem) {
                if (this._crunchCd > 0) this._crunchCd--;
                // 1. GATHER ALL PHYSICAL VEHICLES (and re-grid them where they are now, after moving)
                const allVehicles = this.vehicles.filter(v => !v.dead);
                this.grid.clear();
                for (const v of allVehicles) this.grid.add(v);
                if (playerCar && playerCar.visible && !allVehicles.includes(playerCar)) this.grid.add(playerCar);
                if (ownedCar && ownedCar.visible && ownedCar !== playerCar && !allVehicles.includes(ownedCar)) this.grid.add(ownedCar);
                const seen = new Set();
                
                if (playerCar && playerCar.visible && !allVehicles.includes(playerCar)) {
                    allVehicles.push(playerCar);
                }
                
                if (ownedCar && ownedCar.visible && ownedCar !== playerCar && !allVehicles.includes(ownedCar)) {
                    allVehicles.push(ownedCar);
                }
            
                // 2. BROAD PHASE: SPATIAL GRID
                for (let v1 of allVehicles) {
                    const neighbors = this.grid.getNearby(v1);
                    
                    for (let v2 of neighbors) {
                        if (v1 === v2) continue; 
                        const key = v1.id < v2.id ? v1.id + ':' + v2.id : v2.id + ':' + v1.id;   // each pair once
                        if (seen.has(key)) continue;
                        seen.add(key);
                        
                        // 3. NARROW PHASE: SAT RESOLUTION
                        const collided = PhysicsSystem.resolveOBBCollision(v1, v2);
                        
                        // 4. GAME FEEL (VISUALS/AUDIO): scaled by how hard they met, not a coin flip
                        const imp = collided ? (v1._lastImpact || 0) : 0;
                        if (imp > 1.2) {
                            const midX = (v1.x + v2.x) / 2;
                            const midY = (v1.y + v2.y) / 2;
                            
                            // Sparks (Temporary)
                            weather.spawnSparks(midX, midY, Math.min(12, Math.round(2 + imp * 2)));
                            
                            // Debris (Persistent)
                            if (decalSystem && imp > 2) {
                                decalSystem.addDebris(midX, midY, '#aaddff', 4); // Glass
                                decalSystem.addDebris(midX, midY, v1.color, 3);  // Paint
                            }
                            
                            // Sound (the driven car's own hits crunch in TrafficVehicle.onImpact)
                            const pd = Math.hypot(player.x - midX, player.y - midY);
                            if (v1.controlMode !== 'PLAYER' && v2.controlMode !== 'PLAYER' && pd < 500 && !(this._crunchCd > 0)) {
                                this._crunchCd = 10;
                                audioSys.sfx('crunch', { gain: Math.min(1, imp / 5) * (1 - pd / 600) });
                            }
                        }
                    }
                }
            }
        
        
            drawNetwork(ctx, debug) { this.network.draw(ctx, debug); }
            getNearest(px, py, range) {
                 let nearest = null; let minD = range;
                 for(let v of this.vehicles) { let d = Math.hypot(px - v.x, py - v.y); if (d < minD) { minD = d; nearest = v; } }
                 return nearest;
            }
        }
        
