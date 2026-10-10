        /* --- OPTIMIZATION: SPATIAL GRID ---
           Cells are keyed by number (no strings) and their arrays are kept and emptied, not rebuilt;
           getNearby drops repeats with a per-query stamp instead of a Set (same order as before). */
        class SpatialGrid {
            constructor(width, height, cellSize) {
                this.width = width;
                this.height = height;
                this.cellSize = cellSize;
                this.cols = Math.ceil(width / cellSize);
                this.rows = Math.ceil(height / cellSize);
                this.cells = new Map();     // key → clients (arrays kept between rebuilds)
                this._used = [];            // the arrays filled since the last clear
                this._stamp = 0;
            }
        
            clear() {
                for (let i = 0; i < this._used.length; i++) this._used[i].length = 0;
                this._used.length = 0;
            }
        
            getKey(col, row) {
                return (col + 32768) * 65536 + (row + 32768);
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
                        let cell = this.cells.get(key);
                        if (!cell) { cell = []; this.cells.set(key, cell); }
                        if (!cell.length) this._used.push(cell);
                        cell.push(client);
                    }
                }
            }
        
            getNearby(client, out) {
                const r = Math.max(client.length, client.width) / 2;          // any heading
                const minCol = Math.floor((client.x - r) / this.cellSize);
                const maxCol = Math.floor((client.x + r) / this.cellSize);
                const minRow = Math.floor((client.y - r) / this.cellSize);
                const maxRow = Math.floor((client.y + r) / this.cellSize);
        
                // Callers may own a buffer; omitted buffers retain the original fresh-array API.
                const stamp = ++this._stamp, nearby = out || [];
                nearby.length = 0;
                for (let c = minCol; c <= maxCol; c++) {
                    for (let r = minRow; r <= maxRow; r++) {
                        const contents = this.cells.get(this.getKey(c, r));
                        if (!contents) continue;
                        for (let i = 0; i < contents.length; i++) {
                            const other = contents[i];
                            if (other !== client && other._gridStamp !== stamp) { other._gridStamp = stamp; nearby.push(other); }
                        }
                    }
                }
                return nearby;
            }
        }

        class TrafficManager {
            constructor() { 
                this.vehicles = []; 
                this.spawnTimer = 0; 
                this.folk = [];                // everyone on foot the cars look out for, this tick (update)
                this.network = new RoadNetwork(); 
                // OPTIMIZATION: Grid size 150 covers roughly 2-3 car lengths
                this.grid = new SpatialGrid(2400, 3200, 150); 
            }
            
            /** Her car on its way into a junction with lights, by the lane it's driving along */
            _noteHerCar(car) {
                const lane = this.network.findNearestLane(car.x, car.y, 40);
                if (!lane || Math.cos((car.angle || 0) - lane.angle) < 0.7 || !lane.intersectingZones) return;
                const along = (car.x - lane.start.x) * lane.ux + (car.y - lane.start.y) * lane.uy;
                for (const z of lane.intersectingZones) {
                    if (z.entryDist < 5) continue;
                    const d = z.entryDist - along;
                    if (d > -40 && d < SIGNAL.SEE) { if (z.intersection.signal) z.intersection.signal.note(car, d, lane); break; }
                }
            }

            /** The junction lights in view (traffic/traffic-signals.js): on the ground, and their glow after dark */
            drawSignals(ctx, view, crosswalks) {
                const t = _frameTime;
                for (const ix of this.network.intersections) if (ix.signal && ix.signal.inView(view)) ix.signal.draw(ctx, crosswalks, t);
            }
            drawSignalGlow(ctx, dark, view, crosswalks) {
                const t = _frameTime;
                for (const ix of this.network.intersections) if (ix.signal && ix.signal.inView(view)) ix.signal.drawGlow(ctx, dark, crosswalks, t);
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
            
            /** `playerCar`: the car she's in or last left; `parked`: her cars on the map she isn't driving (the owned
             *  car, Amber's van, that last one: GameEngine.parkedCars) — out of traffic, but solid and rolling;
             *  `teammates`, `walkers`: her crew, and the street's pedestrians (with her, the `folk` cars look out for) */
            update(player, map, playerCar, weather, parked, decalSystem, teammates, walkers) { 
                const folk = this.folk;
                folk.length = 0;
                if (map.type === 'indoor') return;
                
                // Everyone on foot, with how they're moving: measured here tick to tick, since nobody on foot keeps a
                // velocity a car could read (traffic/traffic-people.js reads them). A jump (a door, a load) isn't walking.
                const track = (p) => {
                    if (p._tpt !== _simTick) {
                        let vx = p._tpt === _simTick - 1 ? p.x - p._tpx : 0, vy = p._tpt === _simTick - 1 ? p.y - p._tpy : 0;
                        if (vx * vx + vy * vy > 144) vx = vy = 0;
                        p._tvx = (p._tvx || 0) * 0.4 + vx * 0.6; p._tvy = (p._tvy || 0) * 0.4 + vy * 0.6;
                        p._tpx = p.x; p._tpy = p.y; p._tpt = _simTick;
                    }
                    folk.push(p);
                };
                if (player && player.visible && !player.dead && !(playerCar && playerCar.hasDriver)) track(player);
                if (teammates) for (const t of teammates) if (t && (t.recruited || t.hired) && !t.inCar && !t.dead) track(t);
                if (walkers) for (const w of walkers) if (w && !w.dead) track(w);
                
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
                
                // Her parked cars
                if (parked) for (const c of parked) if (c !== playerCar) this.grid.add(c);
            
                this.spawnTimer--;
                
                // 0. UPDATE INTERSECTIONS (and their lights: traffic/traffic-signals.js)
                // Her car, driven by hand, shows on the lights' gauges like anyone's (on autodrive it notes itself)
                if (playerCar && playerCar.visible && playerCar.hasDriver && playerCar.controlMode !== 'AI') this._noteHerCar(playerCar);
                for (let intersection of this.network.intersections) {
                    if (intersection.signal === undefined) intersection.signal = JunctionSignal.make(intersection);
                    if (intersection.signal) intersection.signal.update();
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
                
                // What the AI sees on the road: traffic, and her parked cars (empty and parked: it goes round them)
                let sensed = this.vehicles;
                if (parked && parked.length) {
                    sensed = this._sensed || (this._sensed = []);
                    sensed.length = 0;
                    for (const v of this.vehicles) sensed.push(v);
                    for (const c of parked) if (!this.vehicles.includes(c)) sensed.push(c);
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
                    // Leaving: fade out over ~0.5 s (still rolling on into the lane's end), then go
                    if (!v.fading && (v.dead || distToPlayer > CONFIG.CULLING.VEHICLE_DESPAWN || nearDeadEnd || frozenOut)) v.fading = true;
                    if (v.fading) v.fade = Math.min(v.fade ?? 1, 1) - 1 / 30;
                    else if ((v.fade ?? 1) < 1) v.fade = Math.min(1, v.fade + 1 / 36);       // arriving: fade in over ~0.6 s
                    if (v.fading && (v.fade <= 0 || distToPlayer > CONFIG.CULLING.VEHICLE_DESPAWN + 600)) {
                        if (v.currentIntersection) v.currentIntersection.releaseEntry(v);
                        // Properly destroy entity to unregister from collision system
                        if (!v.markedForDestroy) v.destroy();
                        this.vehicles.splice(i, 1);
                    } else if (!v.dead) {
                        // Pass decalSystem to update
                        v.update(player, playerCar, sensed, weather, this.network.intersections, map.walls, getColliders(map), decalSystem, folk);
                    }
                }
                
                // Her parked cars roll on to a stop (then park: TrafficVehicle.updateManualDriving)
                if (parked) for (const c of parked) {
                    if (!c.hasDriver && !this.vehicles.includes(c)) c.update(player, playerCar, this.vehicles, weather, this.network.intersections, map.walls, getColliders(map), decalSystem);
                }
        
                // Over the cap (the setting was turned down): the farthest cars out of view fade away
                if (_simTick % 60 === 0) this.trimToCap(player, playerCar);
                // 2. SPAWN LOGIC
                if (this.vehicles.length < GameSettings.getMaxTraffic() && this.spawnTimer <= 0) { 
                    this.spawnTimer = 5;  // Was 20 — 4× faster spawn rate so crowd density actually fills
                    const pool = this.network.allLanes.length ? this._lanesNear(player.x, player.y) : [];
                    if (pool.length > 0) {
                        // Spawn out of sight where possible: the camera's view plus a margin
                        const gv = typeof game !== 'undefined' ? game.view : null, cv = typeof game !== 'undefined' ? game.canvas : null;
                        const hw = gv && cv ? cv.width / 2 / gv.zoom + 120 : 0, hh = gv && cv ? cv.height / 2 / gv.zoom + 120 : 0;
                        for(let k=0; k<14; k++) { 
                            const spawnLane = pool[Math.floor(Math.random() * pool.length)];
                            // Choose the car first, so the check is made where it will actually appear
                            const brand = TrafficVehicle._selectRandomBrand(), model = TrafficVehicle._selectRandomModel(brand);
                            const md = VEHICLE_BRANDS[brand].models[model], len = md.length;
                            let clear = true;
                            // two lengths in (TrafficVehicle's default), or further along a long lane that only passes near her
                            const spawnOffset = this._spawnAlong(spawnLane, player, len);
                            if (spawnOffset === null) continue;
                            const spawnX = spawnLane.start.x + spawnLane.ux * spawnOffset;
                            const spawnY = spawnLane.start.y + spawnLane.uy * spawnOffset;
                            const distToP = Math.hypot(player.x - spawnX, player.y - spawnY);
                            if (distToP < CONFIG.VEHICLE_AI.SPAWN_CLEAR_MIN || distToP > CONFIG.VEHICLE_AI.SPAWN_CLEAR_MAX) clear = false; 
                            if (clear && gv && k < 12 && Math.abs(spawnX - gv.x) < hw && Math.abs(spawnY - gv.y) < hh) clear = false;   // (the last tries take what they can; the fade hides it)
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
                                const newVehicle = new TrafficVehicle(spawnLane, brand, model, 'AI', spawnOffset);
                                newVehicle.fade = 0;
                                this.vehicles.push(newVehicle);
                                break; 
                            }
                        }
                    }
                }
            }
            
            /**
             * The lanes starting within reach of a spawn round her (x, y), listed again once she has moved 300 px: on a big
             * map most lanes are far off, and drawing from all of them would rarely find one in range.
             */
            _lanesNear(x, y) {
                const c = this._near, all = this.network.allLanes;
                if (c && c.all === all && Math.abs(c.x - x) < 300 && Math.abs(c.y - y) < 300) return c.list;
                // any lane that passes through the ring round her (with slack for her moves since)
                const lo = CONFIG.VEHICLE_AI.SPAWN_CLEAR_MIN - 450, hi = CONFIG.VEHICLE_AI.SPAWN_CLEAR_MAX + 450;
                const list = all.filter(l => {
                    const t = Math.max(0, Math.min(l.length, (x - l.start.x) * l.ux + (y - l.start.y) * l.uy));
                    const near = Math.hypot(l.start.x + l.ux * t - x, l.start.y + l.uy * t - y);
                    const far = Math.max(Math.hypot(l.start.x - x, l.start.y - y), Math.hypot(l.end.x - x, l.end.y - y));
                    return near < hi && far > lo;
                });
                this._near = { all, x, y, list };
                return list;
            }
            
            /**
             * How far along a lane to start a car of length len: two lengths in where that's in range of her (as ever),
             * else a random spot along it in range, clear of both its ends' junctions; null if none.
             */
            _spawnAlong(lane, player, len) {
                const lo = CONFIG.VEHICLE_AI.SPAWN_CLEAR_MIN, hi = CONFIG.VEHICLE_AI.SPAWN_CLEAR_MAX;
                const d0 = Math.hypot(lane.start.x + lane.ux * len * 2 - player.x, lane.start.y + lane.uy * len * 2 - player.y);
                if (d0 >= lo && d0 <= hi) return len * 2;
                const t0 = (player.x - lane.start.x) * lane.ux + (player.y - lane.start.y) * lane.uy;
                const lat = Math.abs((player.x - lane.start.x) * -lane.uy + (player.y - lane.start.y) * lane.ux);
                const d = lo + Math.random() * (hi - lo);
                if (lat >= d) return null;
                const along = t0 + (Math.random() < 0.5 ? -1 : 1) * Math.sqrt(d * d - lat * lat);
                return along >= len * 2 && along <= lane.length - len * 4 ? along : null;
            }
            
            /** Down to GameSettings' cap: the farthest cars out of view fade out (hers are never in the list; one rolling stays) */
            trimToCap(player, playerCar) {
                const live = this.vehicles.filter(v => !v.fading && !v.dead);
                const over = live.length - GameSettings.getMaxTraffic();
                if (over <= 0 || !player) return;
                const g = typeof game !== 'undefined' ? game : null, cb = g && g._cullBounds && g._cullBounds.cars;
                const keep = v => v === playerCar || v.controlMode === 'PLAYER';
                live.filter(v => !keep(v) && (!cb || v.x < cb.left || v.x > cb.right || v.y < cb.top || v.y > cb.bottom))
                    .sort((a, b) => Math.hypot(b.x - player.x, b.y - player.y) - Math.hypot(a.x - player.x, a.y - player.y))
                    .slice(0, over).forEach(v => { v.fading = true; });
            }

            // Optimized Collision Resolution with DEBRIS
            resolveCollisions(playerCar, player, weather, audioSys, parked, decalSystem) {
                if (this._crunchCd > 0) this._crunchCd--;
                // 1. GATHER ALL PHYSICAL VEHICLES (and re-grid them where they are now, after moving)
                const allVehicles = this.vehicles.filter(v => !v.dead && !(v.fading && v.fade < 0.5));   // (a car fading out is a ghost)
                if (playerCar && playerCar.visible && !allVehicles.includes(playerCar)) allVehicles.push(playerCar);
                if (parked) for (const c of parked) if (!allVehicles.includes(c)) allVehicles.push(c);   // her cars standing about
                this.grid.clear();
                for (const v of allVehicles) this.grid.add(v);
                // Each pair once, at the turn of whichever comes first in the list (as the old pair-key Set did:
                // neighbours are mutual, so the first to meet the other is the earlier one)
                for (let i = 0; i < allVehicles.length; i++) allVehicles[i]._colIdx = i;
            
                // 2. BROAD PHASE: SPATIAL GRID
                for (let n1 = 0; n1 < allVehicles.length; n1++) {
                    const v1 = allVehicles[n1];
                    const neighbors = this.grid.getNearby(v1, this._collisionNeighbours || (this._collisionNeighbours = []));
                    
                    for (let v2 of neighbors) {
                        if (v1 === v2) continue; 
                        if (v2._colIdx === undefined || allVehicles[v2._colIdx] !== v2 || v2._colIdx < n1) continue;   // met already (or not in the list)
                        
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
        
