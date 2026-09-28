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
                const minCol = Math.floor((client.x - client.length/2) / this.cellSize);
                const maxCol = Math.floor((client.x + client.length/2) / this.cellSize);
                const minRow = Math.floor((client.y - client.width/2) / this.cellSize);
                const maxRow = Math.floor((client.y + client.width/2) / this.cellSize);
        
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
                const minCol = Math.floor((client.x - client.length/2) / this.cellSize);
                const maxCol = Math.floor((client.x + client.length/2) / this.cellSize);
                const minRow = Math.floor((client.y - client.width/2) / this.cellSize);
                const maxRow = Math.floor((client.y + client.width/2) / this.cellSize);
        
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
                    
                    if (v.dead || distToPlayer > CONFIG.CULLING.VEHICLE_DESPAWN || nearDeadEnd) { 
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
                            let clear = true;
                            // Calculate actual spawn position (2 car lengths into lane)
                            const spawnOffset = 140; // ~2 car lengths
                            const spawnX = spawnLane.start.x + Math.cos(spawnLane.angle) * spawnOffset;
                            const spawnY = spawnLane.start.y + Math.sin(spawnLane.angle) * spawnOffset;
                            const distToP = Math.hypot(player.x - spawnX, player.y - spawnY);
                            if (distToP < CONFIG.VEHICLE_AI.SPAWN_CLEAR_MIN || distToP > CONFIG.VEHICLE_AI.SPAWN_CLEAR_MAX) clear = false; 
                            if (clear) {
                                const dummy = { x: spawnX, y: spawnY, length: 100, width: 50 };
                                const nearby = this.grid.getNearby(dummy);
                                for(let v of nearby) { 
                                    if (Math.hypot(v.x - spawnX, v.y - spawnY) < CONFIG.VEHICLE_AI.SPAWN_SEPARATION) { clear = false; break; } 
                                }
                            }
                            if (clear) {
                                // Spawn new vehicle - it auto-registers via GameEntity queue
                                const newVehicle = new TrafficVehicle(spawnLane);
                                this.vehicles.push(newVehicle);
                                break; 
                            }
                        }
                    }
                }
            }
            
            // Optimized Collision Resolution with DEBRIS
            resolveCollisions(playerCar, player, weather, audioSys, ownedCar, decalSystem) {
                // 1. GATHER ALL PHYSICAL VEHICLES
                const allVehicles = [...this.vehicles];
                
                if (playerCar && playerCar.visible) {
                    allVehicles.push(playerCar);
                }
                
                if (ownedCar && ownedCar.visible && ownedCar !== playerCar) {
                    allVehicles.push(ownedCar);
                }
            
                // 2. BROAD PHASE: SPATIAL GRID
                for (let v1 of allVehicles) {
                    const neighbors = this.grid.getNearby(v1);
                    
                    for (let v2 of neighbors) {
                        if (v1 === v2) continue; 
                        
                        // 3. NARROW PHASE: SAT RESOLUTION
                        const collided = PhysicsSystem.resolveOBBCollision(v1, v2);
                        
                        // 4. GAME FEEL (VISUALS/AUDIO)
                        if (collided) {
                            if (Math.random() < 0.1) {
                                const midX = (v1.x + v2.x) / 2;
                                const midY = (v1.y + v2.y) / 2;
                                
                                // Sparks (Temporary)
                                weather.spawnSparks(midX, midY, 5);
                                
                                // Debris (Persistent)
                                if (decalSystem) {
                                    decalSystem.addDebris(midX, midY, '#aaddff', 4); // Glass
                                    decalSystem.addDebris(midX, midY, v1.color, 3);  // Paint
                                }
                                
                                // Sound
                                if (Math.hypot(player.x - midX, player.y - midY) < 400) {
                                    audioSys.sfx('explode'); 
                                }
                            }
                        }
                    }
                }
            }
        
            checkIntersect(c1, c2) {
                const getCorners = (c) => {
                    const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
                    const hw = c.length/2, hh = c.width/2;
                    return [
                        { x: c.x + (hw*cos - hh*sin), y: c.y + (hw*sin + hh*cos) },
                        { x: c.x + (hw*cos + hh*sin), y: c.y + (hw*sin - hh*cos) },
                        { x: c.x + (-hw*cos + hh*sin), y: c.y + (-hw*sin - hh*cos) },
                        { x: c.x + (-hw*cos - hh*sin), y: c.y + (-hw*sin + hh*cos) }
                    ];
                };
                const isPointIn = (p, r) => {
                    const dx = p.x - r.x, dy = p.y - r.y;
                    const cos = Math.cos(-r.angle), sin = Math.sin(-r.angle);
                    const lx = dx*cos - dy*sin, ly = dx*sin + dy*cos;
                    return (Math.abs(lx) < r.length/2 && Math.abs(ly) < r.width/2);
                };
                const c1Points = getCorners(c1);
                for(let p of c1Points) if(isPointIn(p, c2)) return true;
                const c2Points = getCorners(c2);
                for(let p of c2Points) if(isPointIn(p, c1)) return true;
                return false;
            }
        
            drawNetwork(ctx, debug) { this.network.draw(ctx, debug); }
            getNearest(px, py, range) {
                 let nearest = null; let minD = range;
                 for(let v of this.vehicles) { let d = Math.hypot(px - v.x, py - v.y); if (d < minD) { minD = d; nearest = v; } }
                 return nearest;
            }
        }
        
