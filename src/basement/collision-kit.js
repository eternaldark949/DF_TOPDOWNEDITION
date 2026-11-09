        // ===== LV0 BASEMENT =====
        // The collision kit: the parts of a collision step that know nothing about any game. The shape tests are the
        // shape kit's (basement/shape-kit.js), the broad phase the spatial grid's (basement/spatial-grid.js).
        //
        // BODY      a circle: { x, y, radius }, and where it was last tick (px, py; default: where it is)
        // BOX       a moving box: { x, y, angle, length (along angle), width }, and where it was last tick (px, py)
        // CONTACT   { nx, ny, depth, x, y, swept }   the way out (unit normal, world), how far in, where the body goes
        //           (just outside the box), and whether it was found only along the tick's path (the box went through it)
        //
        // collisionWorld (below): the step that uses it, game-free; a game extends it (directory/collision-system.js)
        //
        // collisionKit.circleVsMovingBox(body, box) -> CONTACT | null
        //   touching now, or crossed this tick (a fast box passing a small body between two ticks: the sweep, in the
        //   box's frame, of the body's path against the box's rounded outline), so nothing slips through a car
        // collisionKit.circleVsCarBody(x, y, R, car, pad, inside) -> { nx, ny, depth } | null
        //   a circle (on foot) against a car's box grown by `pad`, the normal out of the car; `inside`: a centre inside
        //   the box goes out the nearest side (false: no contact)
        const collisionKit = {
            circleVsCarBody(x, y, R, v, pad = 2, inside = true) {
                const c = Math.cos(-v.angle), s = Math.sin(-v.angle), dx = x - v.x, dy = y - v.y;
                const lx = dx * c - dy * s, ly = dx * s + dy * c, hl = v.length / 2 + pad, hw = v.width / 2 + pad;
                const ex = lx - Math.max(-hl, Math.min(hl, lx)), ey = ly - Math.max(-hw, Math.min(hw, ly)), d2 = ex * ex + ey * ey;
                if (d2 >= R * R) return null;
                let d = Math.sqrt(d2), o = R - d, nx = ex / (d || 1), ny = ey / (d || 1);
                if (d2 <= 0) {
                    if (!inside) return null;
                    const sx = hl - Math.abs(lx), sy = hw - Math.abs(ly);
                    if (sx < sy) { nx = Math.sign(lx) || 1; ny = 0; o = sx + R; } else { nx = 0; ny = Math.sign(ly) || 1; o = sy + R; }
                }
                return { nx: nx * Math.cos(v.angle) - ny * Math.sin(v.angle), ny: nx * Math.sin(v.angle) + ny * Math.cos(v.angle), depth: o };
            },
            circleVsMovingBox(c, b) {
                const r = c.radius || 0, hl = (b.length || 0) / 2, hw = (b.width || 0) / 2, a = b.angle || 0;
                const cos = Math.cos(-a), sin = Math.sin(-a), cb = Math.cos(a), sb = Math.sin(a);
                const local = (x, y, ox, oy) => { const dx = x - ox, dy = y - oy; return [dx * cos - dy * sin, dx * sin + dy * cos]; };
                const world = (lx, ly) => [b.x + lx * cb - ly * sb, b.y + lx * sb + ly * cb];
                const [lx, ly] = local(c.x, c.y, b.x, b.y);
                // touching now: out along the nearest way (the closest point, or the nearest side when the centre is inside)
                const ex = lx - Math.max(-hl, Math.min(hl, lx)), ey = ly - Math.max(-hw, Math.min(hw, ly)), d2 = ex * ex + ey * ey;
                if (d2 < r * r) {
                    let nlx, nly, tx, ty;
                    if (d2 > 0) { const d = Math.sqrt(d2); nlx = ex / d; nly = ey / d; tx = lx + nlx * (r - d); ty = ly + nly * (r - d); }
                    else if (hl - Math.abs(lx) < hw - Math.abs(ly)) { nlx = Math.sign(lx) || 1; nly = 0; tx = nlx * (hl + r); ty = ly; }
                    else { nlx = 0; nly = Math.sign(ly) || 1; tx = lx; ty = nly * (hw + r); }
                    const [x, y] = world(tx, ty);
                    return { nx: nlx * cb - nly * sb, ny: nlx * sb + nly * cb, depth: Math.hypot(tx - lx, ty - ly), x, y, swept: false };
                }
                // crossed this tick: the body's path in the box's frame (from where each of them was)
                const [ax, ay] = local(c.px ?? c.x, c.py ?? c.y, b.px ?? b.x, b.py ?? b.y);
                if (ax === lx && ay === ly) return null;
                const t = shapeKit.sweepRoundedBox(ax, ay, lx, ly, hl, hw, r);
                if (t === null) return null;
                // thrown clear to the side it was met from (where it stood, across the box's path)
                const side = Math.abs(ay) - hw >= Math.abs(ax) - hl;
                const nlx = side ? 0 : (Math.sign(ax) || 1), nly = side ? (Math.sign(ay) || 1) : 0;
                const tx = side ? Math.max(-hl, Math.min(hl, lx)) : nlx * (hl + r), ty = side ? nly * (hw + r) : Math.max(-hw, Math.min(hw, ly));
                const [x, y] = world(tx, ty);
                return { nx: nlx * cb - nly * sb, ny: nlx * sb + nly * cb, depth: Math.hypot(tx - lx, ty - ly), x, y, swept: true };
            },
        };

        // collisionWorld: the collision step itself, game-free. Each step it rebuilds the broad-phase grid from what's on
        // screen (moving props off screen too), caches fixed bodies' cells, buckets the layers (GameEntity.LAYER), and
        // runs the passes: vehicles vs walls and props, actors vs actors, walls and props, people vs moving cars, props
        // vs everything; then the contact solver (impulses with friction and spin). A game extends it and answers
        // the HOOKS (projectiles, doors, who gives way, who meets cars its own way). Static: one world.
        class collisionWorld {
            static spatialGrid = new SpatialHashGrid(200);
            static enabled = true;
            static _staticGrid = new SpatialHashGrid(200);
            static _staticMembers = [];   // the fixed bodies (walls, buildings, posts), map-wide, gridded once
            static _movers = [];          // every other collidable, in registry order
            static _staticsRev = -1;
            static _layers = { projectile: [], vehicle: [], actor: [], dynamic: [], trigger: [] };


            /** Walls, buildings and posts never move during play: they are sorted out of the collidables and put in
             *  their own grid ONCE, for the whole map, and again only when a body joins or leaves the registry
             *  (GameEntity.registry.revision) or the map's static geometry is reported changed (invalidateStatics). */
            static _prepareStatics() {
                const reg = GameEntity.registry, all = reg.collidable;
                if (this._staticsRev === reg.revision && this._staticsSource === all && this._staticGrid.cellSize === this.spatialGrid.cellSize) return;
                this._staticsRev = reg.revision; this._staticsSource = all;
                const fixed = this._staticMembers, movers = this._movers;
                fixed.length = movers.length = 0;
                this._staticGrid = new SpatialHashGrid(this.spatialGrid.cellSize);
                for (let i = 0; i < all.length; i++) {
                    const e = all[i];
                    e._regOrder = i;
                    if (this._isFixed(e)) { e._collisionOrder = i; fixed.push(e); this._staticGrid.insert(e); }
                    else movers.push(e);
                }
                this.spatialGrid._staticCells = this._staticGrid.cells;
            }
            /** The map's static geometry changed (a wall removed, an editor): sort and grid the statics again next step */
            static invalidateStatics() { this._staticsRev = -1; }

            static _activeLayer(items) {
                let n = 0;
                for (let i = 0; i < items.length; i++) if (items[i].active) items[n++] = items[i];
                items.length = n;
                return items;
            }
            
            /**
             * Clear the spatial grid. Call during map transitions.
             */
            static clearSpatialGrid() {
                this.spatialGrid.clear();
                this.spatialGrid._staticCells = null;
                this._staticGrid = new SpatialHashGrid(this.spatialGrid.cellSize);
                this._staticMembers.length = 0; this._movers.length = 0; this._staticsRev = -1;
                const L = this._layers;
                L.projectile.length = L.vehicle.length = L.actor.length = L.dynamic.length = L.trigger.length = 0;
                this._touching.clear();
            }
            
            static stats = {
                totalChecks: 0,
                get narrowChecks() { return shapeKit.narrow_checks; },          // counted by the shape kit
                set narrowChecks(n) { shapeKit.narrow_checks = n; },
                collisionsResolved: 0,
                registered: 0
            };
            
            // =====================
            //  QUEUE PROCESSING
            // =====================
            
            /**
             * Process all entities in registration queue.
             * Call this once after map load to batch-register all entities.
             */
            static processQueue() {
                this.stats.registered = GameEntity.processQueue();
                return this.stats.registered;
            }

            // =====================
            //  MAIN UPDATE LOOP
            // =====================
            
            static update(camera, canvas, game = null) {
                if (!this.enabled) return;
                
                this.stats.totalChecks = 0;
                this.stats.narrowChecks = 0;
                this.stats.collisionsResolved = 0;
                
                // 1. Clear and rebuild spatial grid
                this.spatialGrid.clear();
                
                // 2. The fixed bodies are gridded once (_prepareStatics); only what can move is sorted each step:
                // what's on screen, and a prop still moving off screen (else it drifts through walls out of sight)
                this._prepareStatics();
                const margin = 300, movers = this._movers, onScreen = this._onScreen || (this._onScreen = []);
                onScreen.length = 0;
                for (let i = 0; i < movers.length; i++) {
                    const e = movers[i];
                    if (!e.active) continue;
                    if (e.isOnScreen(camera, canvas, margin) || (e.collisionLayer === GameEntity.LAYER.DYNAMIC && (e.vx || e.vy || e.angularVel))) onScreen.push(e);
                }
                // Actors that move by position (the player) have no vx/vy: their contact velocity is this tick's step
                for (const e of onScreen) {
                    if (e.collisionLayer === GameEntity.LAYER.VEHICLE) {   // where each car was last tick (people vs cars sweeps its path)
                        e._kpx = e._kpt === _simTick - 1 ? e._kx : e.x; e._kpy = e._kpt === _simTick - 1 ? e._ky : e.y;
                        e._kx = e.x; e._ky = e.y; e._kpt = _simTick;
                    }
                    if (e.collisionLayer !== GameEntity.LAYER.ACTOR) continue;
                    e._cvx = e._cpx === undefined ? 0 : e.x - e._cpx; e._cvy = e._cpy === undefined ? 0 : e.y - e._cpy;
                    e._cpx = e.x; e._cpy = e.y;
                }
                
                // 3. Grid the movers and bucket them by layer, in registry order (cells merge with the static grid by it)
                const L = this._layers;
                L.projectile.length = L.vehicle.length = L.actor.length = L.dynamic.length = L.trigger.length = 0;
                for (let i = 0; i < onScreen.length; i++) {
                    const entity = onScreen[i];
                    entity._collisionOrder = entity._regOrder;
                    this.spatialGrid.insert(entity);
                    switch (entity.collisionLayer) {
                        case GameEntity.LAYER.PROJECTILE: L.projectile.push(entity); break;
                        case GameEntity.LAYER.VEHICLE: L.vehicle.push(entity); break;
                        case GameEntity.LAYER.ACTOR: L.actor.push(entity); break;
                        case GameEntity.LAYER.DYNAMIC: L.dynamic.push(entity); break;
                        case GameEntity.LAYER.TRIGGER: L.trigger.push(entity); break;
                    }
                }
                
                // 4. Process collisions by layer
                this._processProjectiles(onScreen, game, L.projectile);
                this._processVehicles(onScreen, game, L.vehicle);
                this._processActors(onScreen, game, L.actor);
                this._processPeopleVsCars(game, L.vehicle);
                this._processDynamics(onScreen, game, L.dynamic);
                this._processPairs(onScreen, game);
                this._endContacts();
                
                // 5. Cleanup destroyed entities
                GameEntity.cleanup();
            }

            /** Entities of `list` bucketed by cell, for the projectile sweep: only those near the path get tested.
             *  `moving`: rebuilt each sim tick (props get pushed); otherwise only when the list changes. */
            static _near(slot, list, moving, left, top, right, bottom) {
                const C = 128, PAD = 16;                                   // (PAD: a prop nudged after the bucketing still counts)
                const grids = this._nearGrids || (this._nearGrids = {});
                let g = grids[slot];
                if (!g || (moving && g.tick !== _simTick) || g.list !== list || g.n !== list.length) {
                    g = grids[slot] = { tick: _simTick, list, n: list.length, cells: new Map(), out: [], mark: 0 };
                    for (const e of list) {
                        let cx, cy, h;
                        if (e.width !== undefined && e.height !== undefined) { cx = e.x + e.width / 2; cy = e.y + e.height / 2; h = Math.hypot(e.width, e.height); }   // (the full diagonal: right whether x, y is its corner or its centre, at any turn)
                        else { cx = e.x; cy = e.y; h = e.radius || Math.max(e.length || 0, e.vehicleWidth || 0) || 40; }
                        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
                        h += PAD;
                        const x0 = Math.floor((cx - h) / C), x1 = Math.floor((cx + h) / C), y0 = Math.floor((cy - h) / C), y1 = Math.floor((cy + h) / C);
                        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                            const k = x * 73856093 ^ y * 19349663;
                            const b = g.cells.get(k); if (b) b.push(e); else g.cells.set(k, [e]);
                        }
                    }
                }
                const out = g.out; out.length = 0; const mark = ++g.mark;
                for (let x = Math.floor(left / C), x1 = Math.floor(right / C); x <= x1; x++)
                    for (let y = Math.floor(top / C), y1 = Math.floor(bottom / C); y <= y1; y++) {
                        const b = g.cells.get(x * 73856093 ^ y * 19349663); if (!b) continue;
                        for (const e of b) if (e._nearMark !== mark || e._nearGrid !== g) { e._nearMark = mark; e._nearGrid = g; out.push(e); }
                    }
                return out;
            }

            static projectileHitTime(p, target, actor = false) {
                const ax = p.lastX ?? p.x, ay = p.lastY ?? p.y, r = p.radius ?? 5;
                if (target.collisionShape === GameEntity.SHAPE.CIRCLE) {
                    const moving = actor && p.lastX !== undefined && target._projectileStartTick === _simTick;
                    const sx = moving ? target._projectileStartX : target.x, sy = moving ? target._projectileStartY : target.y;
                    return shapeKit.sweepCircle(ax - sx, ay - sy, p.x - target.x, p.y - target.y, 0, 0, r + target.radius);
                }
                let cx, cy, hw, hh, angle = 0;
                if (target.collisionShape === GameEntity.SHAPE.OBB || target.length !== undefined) {
                    const b = target.getOBB ? target.getOBB() : target;
                    cx = b.x; cy = b.y; hw = b.length / 2; hh = b.width / 2; angle = b.angle || 0;
                } else {
                    hw = (target.width ?? target.w) / 2; hh = (target.height ?? target.h) / 2;
                    cx = target.x + hw; cy = target.y + hh;
                }
                if (![cx, cy, hw, hh].every(Number.isFinite)) return null;
                const c = Math.cos(angle), s = Math.sin(angle);
                return shapeKit.sweepRoundedBox((ax - cx) * c + (ay - cy) * s, (ay - cy) * c - (ax - cx) * s,
                    (p.x - cx) * c + (p.y - cy) * s, (p.y - cy) * c - (p.x - cx) * s, hw, hh, r);
            }


            static _processVehicles(onScreen, game, candidates = null) {
                const vehicles = candidates ? this._activeLayer(candidates) : onScreen.filter(e =>
                    e.collisionLayer === GameEntity.LAYER.VEHICLE && e.active
                );
                
                // Vehicle vs vehicle belongs to TrafficManager.resolveCollisions (every traffic car, the
                // driven car and the owned car): resolving it here too doubled the impulse, crunch and shake.

                // Vehicle vs Static: only for cars that didn't already probe the walls this tick
                // (applyDrivePhysics marks _wallProbeTick)
                for (let vehicle of vehicles) {
                    if (vehicle._wallProbeTick === _simTick) continue;
                    const nearby = this.spatialGrid.getNearby(vehicle);
                    
                    for (let wall of nearby) {
                        if (wall.collisionLayer !== GameEntity.LAYER.STATIC) continue;
                        if (!wall.active || !this._meets(vehicle, wall)) continue;
                        
                        this.stats.totalChecks++;
                        const wallOBB = shapeKit.rectToObb(wall);
                        wallOBB.mass = Infinity;
                        
                        const packet = shapeKit.sat(vehicle.getOBB(), wallOBB);
                        if (packet && this._report(vehicle, wall, packet)) {
                            this._resolveVehicleCollision(vehicle, { getOBB: () => wallOBB, isStatic: true }, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }

                // Vehicle vs props: a car shoves a prop aside (and spins it off the corner it hits); the
                // prop barely slows the car (mass ratio)
                for (let vehicle of vehicles) {
                    const nearby = this.spatialGrid.getNearby(vehicle);
                    for (let prop of nearby) {
                        if (prop.collisionLayer !== GameEntity.LAYER.DYNAMIC || !prop.active || !this._meets(vehicle, prop)) continue;
                        this.stats.totalChecks++;
                        const vo = vehicle.getOBB(), po = prop.getOBB();
                        const packet = shapeKit.sat(vo, po);
                        if (!packet || !this._report(vehicle, prop, packet)) continue;
                        const cp = shapeKit.obbContactPoint(vo, po, packet.nx, packet.ny);
                        this._solveContact(vehicle, prop, packet, cp, 0.25, 0.4);
                        prop._still = 0;
                        this.stats.collisionsResolved++;
                    }
                }
            }
            
            static _processActors(onScreen, game, candidates = null) {
                const actors = candidates ? this._activeLayer(candidates) : onScreen.filter(e =>
                    e.collisionLayer === GameEntity.LAYER.ACTOR && e.active
                );
                
                const checkedActorPairs = new Set();
                
                // Actor vs Actor (circle vs circle with mass-based separation)
                for (let i = 0; i < actors.length; i++) {
                    const actorA = actors[i];
                    const nearby = this.spatialGrid.getNearby(actorA);
                    
                    for (let actorB of nearby) {
                        if (actorB.collisionLayer !== GameEntity.LAYER.ACTOR) continue;
                        if (!actorB.active || actorB === actorA) continue;
                        
                        // Avoid checking same pair twice
                        const pairId = actorA.id < actorB.id 
                            ? `${actorA.id}-${actorB.id}` 
                            : `${actorB.id}-${actorA.id}`;
                        
                        if (checkedActorPairs.has(pairId)) continue;
                        checkedActorPairs.add(pairId);
                        if (!this._meets(actorA, actorB)) continue;
                        
                        this.stats.totalChecks++;
                        const packet = shapeKit.circleVsCircle(actorA, actorB);
                        if (packet && this._report(actorA, actorB, packet)) {
                            // Same-alliance actors get soft push (don't block each other)
                            if (actorA.alliance && actorA.alliance === actorB.alliance) {
                                packet.depth *= 0.3; // Gentle nudge instead of hard block
                            }
                            this._resolveActorVsActor(actorA, actorB, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
                
                // Actor vs Static (circle vs AABB)
                // Provide map bounds so deeply-embedded actors push out toward the
                // playable interior instead of off-map (where bound clamping would
                // yank them back into the wall).
                const mapBounds = this._mapBounds(game);
                for (let actor of actors) {
                    const nearby = this.spatialGrid.getNearby(actor);
                    
                    for (let wall of nearby) {
                        if (wall.collisionLayer !== GameEntity.LAYER.STATIC) continue;
                        if (!wall.active || !this._meets(actor, wall)) continue;
                        
                        this.stats.totalChecks++;
                        const packet = shapeKit.circleVsRect(actor, wall, mapBounds);
                        if (packet && this._report(actor, wall, packet)) {
                            this._resolveCircleVsStatic(actor, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }

                // Actor vs whatever the game moves by hand (hinged doors)
                this._stepDoors(actors, game);

                // Actor vs Dynamic (circle vs OBB)
                for (let actor of actors) {
                    const nearby = this.spatialGrid.getNearby(actor);
                    
                    for (let prop of nearby) {
                        if (prop.collisionLayer !== GameEntity.LAYER.DYNAMIC) continue;
                        if (!prop.active || !this._meets(actor, prop)) continue;
                        
                        this.stats.totalChecks++;
                        const packet = shapeKit.circleVsObb(actor, prop);
                        if (packet && this._report(actor, prop, packet)) {
                            prop._still = 0;
                            this._resolveCircleVsDynamic(actor, prop, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
            }
            
            /**
             * People vs cars: every moving car against everyone on foot near it, every tick, against the car's real box
             * and along its path this tick (circleVsMovingBox), so nobody stands inside a car and a fast one
             * can't pass through a small body. They're put just outside it; what else happens is theirs: `hitByCar(car,
             * contact, speed)`. Anyone the game handles itself is skipped (`_ownCarRules`). A parked car pushes no one.
             */
            static _processPeopleVsCars(game, cars) {
                for (const car of cars) {
                    if (!car.active || car.dead || (car.fade !== undefined && car.fade < 0.5)) continue;
                    const moved = car.x !== car._kpx || car.y !== car._kpy;
                    if (!moved && !(Math.abs(car.speed || 0) > 0.05)) continue;
                    const o = car.getOBB ? car.getOBB() : car, box = { x: o.x, y: o.y, angle: o.angle || 0, length: o.length, width: o.width, px: car._kpx, py: car._kpy };
                    const near = this.spatialGrid.getNearby(car);
                    for (const p of near) {
                        if (p.collisionLayer !== GameEntity.LAYER.ACTOR || !p.active || p.dead || p.inCar || this._ownCarRules(p, game) || !this._meets(p, car)) continue;
                        this.stats.totalChecks++;
                        const c = collisionKit.circleVsMovingBox({ x: p.x, y: p.y, radius: p.radius || 10, px: p.x - (p._cvx || 0), py: p.y - (p._cvy || 0) }, box);
                        if (!c || !this._report(p, car, c)) continue;
                        p.x = c.x; p.y = c.y;
                        if (p.hitByCar) p.hitByCar(car, c, Math.abs(car.speed || 0));
                        this.stats.collisionsResolved++;
                    }
                }
            }

            static _processDynamics(onScreen, game, candidates = null) {
                const dynamics = candidates ? this._activeLayer(candidates) : onScreen.filter(e =>
                    e.collisionLayer === GameEntity.LAYER.DYNAMIC && e.active
                );
                if (!dynamics.length) return;
                const asleep = (p) => (p._still || 0) > 30;

                // A few relaxation passes: a prop pushed out of one contact into another settles instead of jittering
                for (let pass = 0; pass < 3; pass++) {
                    const checked = new Set();
                    // Dynamic vs Dynamic (OBB vs OBB)
                    for (let propA of dynamics) {
                        const nearby = this.spatialGrid.getNearby(propA);
                        for (let propB of nearby) {
                            if (propB.collisionLayer !== GameEntity.LAYER.DYNAMIC) continue;
                            if (!propB.active || propB === propA) continue;
                            const key = propA.id < propB.id ? propA.id * 1e6 + propB.id : propB.id * 1e6 + propA.id;
                            if (checked.has(key)) continue;
                            checked.add(key);
                            if (asleep(propA) && asleep(propB)) continue;                    // two sleepers stay put
                            if (this._invMass(propA) === 0 && this._invMass(propB) === 0) continue;
                            if (!this._meets(propA, propB)) continue;
                            this.stats.totalChecks++;
                            const oa = propA.getOBB(), ob = propB.getOBB();
                            const packet = shapeKit.sat(oa, ob);
                            if (packet && this._report(propA, propB, packet)) {
                                const cp = shapeKit.obbContactPoint(oa, ob, packet.nx, packet.ny);
                                this._solveContact(propA, propB, packet, cp, Math.min(propA.restitution || 0.3, propB.restitution || 0.3), 0.35);
                                if (packet.depth > 0.5) { propA._still = 0; propB._still = 0; }
                                this.stats.collisionsResolved++;
                            }
                        }
                    }
                    // Dynamic vs Static
                    for (let prop of dynamics) {
                        if (asleep(prop) || this._invMass(prop) === 0) continue;
                        const nearby = this.spatialGrid.getNearby(prop);
                        for (let wall of nearby) {
                            if (wall.collisionLayer !== GameEntity.LAYER.STATIC) continue;
                            if (!wall.active || !this._meets(prop, wall)) continue;
                            this.stats.totalChecks++;
                            const wallOBB = shapeKit.rectToObb(wall);
                            const po = prop.getOBB();
                            const packet = shapeKit.sat(po, wallOBB);
                            if (packet && this._report(prop, wall, packet)) {
                                const cp = shapeKit.obbContactPoint(po, wallOBB, packet.nx, packet.ny);
                                this._solveContact(prop, null, packet, cp, prop.restitution || 0.3, 0.45);
                                this.stats.collisionsResolved++;
                            }
                        }
                    }
                }
            }



            // =====================
            //  BODIES: masks, ghosts, contacts (begin / stay / end), the pair table, queries
            // =====================

            /** Do these two meet at all: neither is 'no_collision', and each one's mask takes the other's group. */
            static _meets(a, b) {
                const A = a.body, B = b.body;
                if (!A || !B) return true;
                if (A.physics_type === 'no_collision' || B.physics_type === 'no_collision') return false;
                return !!(A.mask & B.group) && !!(B.mask & A.group);
            }
            static _ghostly(a, b) { return !!((a.body && a.body.ghost) || (b.body && b.body.ghost)); }
            static _touching = new Map();   // pair key -> [a, b, the tick last touching]
            /**
             * A contact: tell both (onCollide(other, contact, phase): 'begin' the first tick, 'stay' after; contact.nx, ny
             * points at the one being told), and say whether
             * to push them apart (false for a ghost: it's only told). Costs nothing when neither listens.
             */
            static _report(a, b, contact) {
                if (a.onCollide || b.onCollide) {
                    const k = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id, was = this._touching.get(k);
                    const phase = was && was[2] === _simTick - 1 ? 'stay' : was && was[2] === _simTick ? null : 'begin';
                    this._touching.set(k, [a, b, _simTick]);
                    if (phase) {   // each is handed the contact with its normal pointing at itself (away from the other)
                        const ca = this._centre(a), cb = this._centre(b), nx = contact.nx ?? 0, ny = contact.ny ?? 0;
                        const toA = nx * (ca.x - cb.x) + ny * (ca.y - cb.y) >= 0 ? contact : { ...contact, nx: -nx, ny: -ny };
                        if (a.onCollide) a.onCollide(b, toA, phase); if (b.onCollide) b.onCollide(a, { ...toA, nx: -toA.nx, ny: -toA.ny }, phase);
                    }
                }
                return !this._ghostly(a, b);
            }
            /** Pairs that touched last tick and not this one: 'end'. */
            static _endContacts() {
                for (const [k, t] of this._touching) if (t[2] < _simTick) {
                    this._touching.delete(k);
                    const [a, b] = t;
                    if (a.onCollide) a.onCollide(b, null, 'end'); if (b.onCollide) b.onCollide(a, null, 'end');
                }
            }

            /**
             * THE PAIR TABLE: anything the built-in passes above don't cover. A row is [groupA, groupB, { test, resolve }]:
             * every active body of group A against every body of group B near it (the grid), when they meet (_meets).
             * test(a, b) -> contact | null (default: by their shapes, `_shapeContact`); resolve(a, b, contact) (default:
             * `_separate`, by mass; a static never moves). Ghosts are only told. Triggers (ghosts) against people, cars and
             * props are a row already, so a TriggerEntity gets onCollide begin / stay / end with no other code.
             * collisionWorld.addPair(groupA, groupB, opts) adds one.
             */
            static PAIRS = [GameEntity.LAYER.ACTOR, GameEntity.LAYER.VEHICLE, GameEntity.LAYER.DYNAMIC].map(g => [GameEntity.LAYER.TRIGGER, g, {}]);
            static addPair(a, b, opts = {}) { this.PAIRS.push([a, b, opts]); return this; }
            static _bucket(group, onScreen) {
                const L = GameEntity.LAYER, Lb = this._layers;
                if (group === L.VEHICLE) return Lb.vehicle; if (group === L.ACTOR) return Lb.actor; if (group === L.DYNAMIC) return Lb.dynamic;
                if (group === L.TRIGGER) return Lb.trigger; if (group === L.PROJECTILE) return Lb.projectile;
                const of = e => e.active && (e.body ? e.body.group : e.collisionLayer) === group;
                return onScreen.filter(of).concat(this._staticMembers.filter(of));   // (the fixed bodies are map-wide, not sorted per step)
            }
            static _processPairs(onScreen, game) {
                for (const [ga, gb, opts] of this.PAIRS) {
                    const seen = ga === gb ? new Set() : null;
                    for (const a of this._bucket(ga, onScreen)) {
                        if (!a.active) continue;
                        for (const b of this.spatialGrid.getNearby(a)) {
                            if (!b.active || b === a || (b.body ? b.body.group : b.collisionLayer) !== gb || !this._meets(a, b)) continue;
                            if (seen) { const k = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id; if (seen.has(k)) continue; seen.add(k); }
                            this.stats.totalChecks++;
                            const c = (opts.test || this._shapeContact).call(this, a, b);
                            if (!c || !this._report(a, b, c)) continue;
                            (opts.resolve || this._separate).call(this, a, b, c);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
            }
            /** The contact between two bodies by their shapes: { nx, ny (from b toward a), depth } or null. */
            static _shapeContact(a, b) {
                const circle = e => (e.body ? e.body.shape : '') === 'circle';
                const box = e => e.getOBB ? e.getOBB() : (e.body && e.body.shape === 'aabb' ? shapeKit.rectToObb(e) : shapeKit.entityToObb(e));
                let c;
                if (circle(a) && circle(b)) c = shapeKit.circleVsCircle(a, b);
                else if (circle(a)) c = shapeKit.circleVsObb(a, { getOBB: () => box(b) });
                else if (circle(b)) { c = shapeKit.circleVsObb(b, { getOBB: () => box(a) }); if (c) c = { ...c, nx: -c.nx, ny: -c.ny }; }
                else c = shapeKit.sat(box(a), box(b));
                if (!c) return null;
                const ca = this._centre(a), cb = this._centre(b);
                if (c.nx * (ca.x - cb.x) + c.ny * (ca.y - cb.y) < 0) c = { ...c, nx: -c.nx, ny: -c.ny };   // from b toward a
                return c;
            }
            /** Push two bodies apart along the contact, by mass (a static, or a zero inverse mass, doesn't move). */
            static _separate(a, b, c) {
                const fixed = e => !e.body || e.body.physics_type === 'static' || e.isStatic;
                const ia = fixed(a) ? 0 : 1 / (a.mass || 1), ib = fixed(b) ? 0 : 1 / (b.mass || 1), t = ia + ib;
                if (!t) return;
                a.x += c.nx * c.depth * ia / t; a.y += c.ny * c.depth * ia / t;
                b.x -= c.nx * c.depth * ib / t; b.y -= c.ny * c.depth * ib / t;
            }

            /**
             * QUERIES (mask operations: no physics): what a ray, or a circle, touches. opts: mask (the groups to find, default
             * all), bit (the query's own bit, checked against each body's ray_mask; default 1), ignore (a body, or a
             * function). Ghosts are found; 'no_collision' bodies never are. Uses the step's grid: what's on screen.
             * raycast(x0, y0, x1, y1, opts) -> [{ e, t, x, y }] nearest first;  overlap(x, y, r, opts) -> [entity]
             */
            static _findable(e, opts) {
                const B = e.body, mask = opts.mask ?? 0xFFFF, bit = opts.bit ?? 1;
                if (!e.active || !B || B.physics_type === 'no_collision' || !(mask & B.group) || !(B.ray_mask & bit)) return false;
                return !(opts.ignore && (typeof opts.ignore === 'function' ? opts.ignore(e) : opts.ignore === e));
            }
            static raycast(x0, y0, x1, y1, opts = {}) {
                const q = { getBoundingBox: () => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }) }, hits = [];
                for (const e of this.spatialGrid.getNearby(q)) {
                    if (!this._findable(e, opts)) continue;
                    let t;
                    if (e.body.shape === 'circle') t = shapeKit.sweepCircle(x0, y0, x1, y1, e.x, e.y, e.radius || 0);
                    else {
                        const o = e.getOBB ? e.getOBB() : e.body.shape === 'aabb' ? shapeKit.rectToObb(e) : shapeKit.entityToObb(e), a = o.angle || 0, c = Math.cos(-a), s = Math.sin(-a);
                        const lx = (x, y) => (x - o.x) * c - (y - o.y) * s, ly = (x, y) => (x - o.x) * s + (y - o.y) * c;
                        t = shapeKit.sweepRoundedBox(lx(x0, y0), ly(x0, y0), lx(x1, y1), ly(x1, y1), o.length / 2, o.width / 2, 0);
                    }
                    if (t !== null && t !== undefined) hits.push({ e, t, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
                }
                return hits.sort((p, q2) => p.t - q2.t);
            }
            static overlap(x, y, r, opts = {}) {
                const probe = { x, y, radius: r }, out = [];
                for (const e of this.spatialGrid.getInRadius(x, y, r)) {
                    if (!this._findable(e, opts)) continue;
                    if (e.body.shape === 'circle' ? Math.hypot(e.x - x, e.y - y) < r + (e.radius || 0) : shapeKit.circleVsObb(probe, e)) out.push(e);
                }
                return out;
            }

            // =====================
            //  JOINTS: a hinged leaf (a door) — h { hx, hy (the hinge), baseAngle, angle, angVel, length, thickness }
            // =====================

            /** One tick: circle bodies push the leaf (and it pushes them back out, less near its middle), the push turns
             *  it, a spring closes it, damping slows it, and it stops `limit` either side of shut (bouncing a little). */
            static stepHinge(h, actors, limit) {
                const L = h.length, half = h.thickness / 2, MAX = limit;
                const a = h.baseAngle + h.angle, ux = Math.cos(a), uy = Math.sin(a);
                for (const act of actors) {
                    const r = act.radius || 12;
                    const px = act.x - h.hx, py = act.y - h.hy;
                    if (px * px + py * py > (L + r + 4) * (L + r + 4)) continue;
                    const s = Math.max(0, Math.min(L, px * ux + py * uy));           // closest point along the leaf
                    const dx = px - ux * s, dy = py - uy * s, dist = Math.hypot(dx, dy);
                    const depth = r + half - dist;
                    if (depth <= 0) continue;
                    let nx, ny;
                    if (dist > 1e-4) { nx = dx / dist; ny = dy / dist; }
                    else { nx = -uy; ny = ux; }
                    const jammed = Math.abs(h.angle) >= MAX - 0.01 && Math.sign(ux * -ny - uy * -nx) === Math.sign(h.angle);
                    const give = jammed || s < 4 ? 1 : 0.7;                         // near the hinge or at the stop it can't yield
                    act.x += nx * depth * give; act.y += ny * depth * give;
                    // Torque from the actor pushing along -n; a push near the hinge still swings the
                    // door (people push a door's middle), so no one gets stuck at the jamb
                    const torque = Math.max(s, L * 0.5) * (ux * -ny - uy * -nx) * depth;
                    h.angVel += torque * 0.9 / (L * L / 3);
                }
                h.angVel += -0.018 * h.angle;                                 // closing spring
                h.angVel *= 0.88;
                h.angle += h.angVel;
                if (h.angle > MAX) { h.angle = MAX; h.angVel *= -0.3; }
                if (h.angle < -MAX) { h.angle = -MAX; h.angVel *= -0.3; }
                if (Math.abs(h.angle) < 0.002 && Math.abs(h.angVel) < 0.0005) { h.angle = 0; h.angVel = 0; }
            }

            // =====================
            //  MAP QUERIES: lines, rays, sight and room to stand, against plain rects ({ x, y, w, h }: a map's walls and
            //  footprints), the whole map (not just on screen), through the rect grid (_physicsSpatial)
            // =====================

            /** Is the segment blocked by any rect in these lists? */
            static lineBlocked(x1, y1, x2, y2, ...lists) {
                const bounds = { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
                for (const list of lists) {
                    const c = _physicsSpatial.query(list, bounds);
                    if (c) for (let i = 0; i < c.length; i++) { const w = c[i]; if (shapeKit.segCrossesRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h)) return true; }
                }
                return false;
            }
            /** How far along the segment the first rect is (maxDist when none) */
            static rayNearest(x1, y1, x2, y2, rects, maxDist) {
                let nearest = maxDist;
                const candidates = _physicsSpatial.query(rects, { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) });
                for (let i = 0; i < candidates.length; i++) { const o = candidates[i]; nearest = shapeKit.segRectNearest(x1, y1, x2, y2, o.x, o.y, o.w, o.h, nearest, -Infinity); }
                return nearest;
            }
            /**
             * What can be seen from (ox, oy) out to `range` past rects: a visibility polygon, points sorted by angle
             * ({ angle, x, y }); fan them from the origin to fill. opts.extraPoints: more corners to aim at;
             * opts.aMin / aMax: only that angle window (counter-clockwise), with an arc of rays every opts.arcStep
             * (default 0.12) so the far edge stays round (vision cones, headlight beams); opts.minDist: ignore rects
             * nearer than this. Rays go to every nearby corner (and ±0.0001 rad) and stop at the first rect.
             */
            static _visRel = []; static _visAng = [];
            static visibilityPoly(ox, oy, range, obstacles, opts = {}) {
                const relevant = this._visRel; relevant.length = 0;
                for (let i = 0; i < obstacles.length; i++) { const o = obstacles[i]; if (Math.hypot(o.x + o.w / 2 - ox, o.y + o.h / 2 - oy) < range + Math.max(o.w, o.h)) relevant.push(o); }
                const minDist = opts.minDist || 0;
                const windowed = opts.aMin !== undefined;
                const TAU = Math.PI * 2, span = windowed ? (((opts.aMax - opts.aMin) % TAU + TAU) % TAU || TAU) : 0;
                const rel = a => ((a - opts.aMin) % TAU + TAU) % TAU;
                const angles = this._visAng; angles.length = 0;
                const aim = (px, py) => {
                    const angle = Math.atan2(py - oy, px - ox);
                    for (let k = -1; k <= 1; k++) {
                        const off = k === 0 ? 0 : k * 0.0001;
                        if (windowed && rel(angle + off) > span) continue;
                        angles.push(angle + off);
                    }
                };
                for (let i = 0; i < relevant.length; i++) { const o = relevant[i]; aim(o.x, o.y); aim(o.x + o.w, o.y); aim(o.x + o.w, o.y + o.h); aim(o.x, o.y + o.h); }
                if (opts.extraPoints) for (const p of opts.extraPoints) aim(p.x, p.y);
                if (windowed) {
                    const step = opts.arcStep || 0.12, n = Math.max(1, Math.ceil(span / step));
                    for (let i = 0; i <= n; i++) angles.push(opts.aMin + span * i / n);
                }
                const out = new Array(angles.length);
                for (let j = 0; j < angles.length; j++) {
                    const a = angles[j], dx = Math.cos(a), dy = Math.sin(a), ex = ox + dx * range, ey = oy + dy * range;
                    let closest = range;
                    for (let i = 0; i < relevant.length; i++) { const o = relevant[i]; closest = shapeKit.segRectNearest(ox, oy, ex, ey, o.x, o.y, o.w, o.h, closest, minDist); }
                    out[j] = { angle: a, x: ox + dx * closest, y: oy + dy * closest };
                }
                if (windowed) out.sort((p, q) => rel(p.angle) - rel(q.angle));
                else out.sort((p, q) => p.angle - q.angle);
                return out;
            }
            /** Is (x, y) strictly inside any rect in these lists? */
            static pointBlocked(x, y, ...lists) {
                for (const list of lists) if (list) for (const r of list) if (shapeKit.pointInsideRect(x, y, r)) return true;
                return false;
            }
            /** Does a square body of half-size h at (x, y) overlap any rect in these lists? (a mover's next step) */
            static squareBlocked(x, y, h, ...lists) {
                for (const list of lists) if (list) for (const r of list) if (shapeKit.squareHitsRect(x, y, h, r)) return true;
                return false;
            }
            /** Keep a body inside the map (w × h), `margin` from its edges */
            static keepInside(e, w, h, margin) {
                e.x = Math.max(margin, Math.min(w - margin, e.x));
                e.y = Math.max(margin, Math.min(h - margin, e.y));
            }

            // =====================
            //  THE STREET: cars all over the map (not just on screen), on the traffic step's own grid; the same
            //  _meets / _report as every other pass, so masks, ghosts and onCollide hold for cars too
            // =====================

            /** Every pair of `cars` once (the earlier in the list meets the later) that touch: hit(v1, v2, packet)
             *  (default `_resolveVehicleCollision`). grid.getNearby(car, buf) gives a car's neighbours. */
            static streetCars(cars, grid, buf = [], hit = null) {
                for (let i = 0; i < cars.length; i++) cars[i]._colIdx = i;
                for (let n1 = 0; n1 < cars.length; n1++) {
                    const v1 = cars[n1];
                    for (const v2 of grid.getNearby(v1, buf)) {
                        if (v1 === v2 || v2._colIdx === undefined || cars[v2._colIdx] !== v2 || v2._colIdx < n1) continue;   // met already (or not in the list)
                        if (!this._meets(v1, v2)) continue;
                        this.stats.totalChecks++;
                        const packet = shapeKit.sat(v1, v2);
                        if (!packet || !this._report(v1, v2, packet)) continue;
                        if (hit) hit(v1, v2, packet); else this._resolveVehicleCollision(v1, v2, packet);
                    }
                }
            }
            /** Everyone in `people` on foot against the cars near them: `_footRules(p, game)` -> { R, inside, skip(car) }
             *  or null (not now), then `_footVsCar(p, car, contact, game)` for each one touching (the normal out of the car). */
            static streetFeet(people, grid, game) {
                const q = this._footQuery || (this._footQuery = { x: 0, y: 0, length: 30, width: 30 }), buf = this._footNear || (this._footNear = []);
                for (const p of people) {
                    const f = this._footRules(p, game);
                    if (!f) continue;
                    q.x = p.x; q.y = p.y;
                    for (const v of grid.getNearby(q, buf)) {
                        if ((f.skip && f.skip(v)) || !this._meets(p, v)) continue;
                        this.stats.totalChecks++;
                        const c = collisionKit.circleVsCarBody(p.x, p.y, f.R, v, 2, f.inside);
                        if (!c || !this._report(p, v, c)) continue;
                        this._footVsCar(p, v, c, game);
                    }
                }
            }
            static _footRules(p, game) { return { R: p.radius || 12, inside: true }; }
            static _footVsCar(p, v, c, game) { p.x += c.nx * c.depth; p.y += c.ny * c.depth; }

            // =====================
            //  THE BODY STEP: every body moves by what it was given, loses what its damping takes, and keeps its locked
            //  axes, the same way for everyone (Blender: linear / angular velocity, damping, locks)
            // =====================

            /** What a body keeps of its speed (or 'angular': spin) a tick: 1 − its damping when set by hand, else the old field. */
            static _keep(e, kind = 'linear') {
                const B = e.body, given = B && B.given, k = kind === 'angular' ? 'angular_damping' : 'linear_damping';
                if (given && given[k] !== undefined) return 1 - given[k];
                return kind === 'angular' ? e.angularFriction : (e.knockbackFriction ?? e.friction);
            }
            static _locks(e) { return e.body ? e.body.lock : null; }
            /**
             * A character's carried velocity (knockback: what hits, shoves and slips gave it, beside its own walking):
             * moves it (into 'position', or 'velocity' for things that move by their own vx / vy), then damping takes
             * its share, and under 0.1 it stops. A locked axis carries nothing.
             */
            static carry(e, into = 'position') {
                if (!(e.knockbackVx || e.knockbackVy)) return;
                const lk = this._locks(e);
                if (lk) { if (lk.x) e.knockbackVx = 0; if (lk.y) e.knockbackVy = 0; }
                if (into === 'velocity') { e.vx += e.knockbackVx; e.vy += e.knockbackVy; }
                else { e.x += e.knockbackVx; e.y += e.knockbackVy; }
                const k = this._keep(e);
                e.knockbackVx *= k; e.knockbackVy *= k;
                if (Math.abs(e.knockbackVx) < 0.1) e.knockbackVx = 0;
                if (Math.abs(e.knockbackVy) < 0.1) e.knockbackVy = 0;
            }
            /**
             * A rigid body's whole step (props): a broken number restores its last good pose; a locked turn doesn't
             * spin; the speed cap (about its own thickness a tick, so walls can't be skipped) and the spin cap; move,
             * turn, damping; under 0.1 (spin 0.001) it stops, and still for long enough it sleeps (`_still`).
             */
            static integrate(e) {
                if (!Number.isFinite(e.x + e.y + e.vx + e.vy + e.angle + e.angularVel)) {
                    const g = e._good || { x: 0, y: 0, angle: 0 };
                    e.x = g.x; e.y = g.y; e.angle = g.angle; e.vx = e.vy = e.angularVel = 0;
                }
                const lk = this._locks(e);
                if (lk && lk.rot) e.angularVel = 0;
                if (lk && lk.x) e.vx = 0;
                if (lk && lk.y) e.vy = 0;
                const keep = this._keep(e), keepW = this._keep(e, 'angular');
                if (e.vx === 0 && e.vy === 0 && e.angularVel === 0 && Number.isFinite(keep) && Number.isFinite(keepW)) {
                    // At rest: keep even signed-zero arithmetic and the zero normalization
                    e.x += e.vx; e.y += e.vy; e.angle += e.angularVel;
                    e.vx = e.vy = e.angularVel = 0;
                    e._still = (e._still || 0) + 1;
                    if (!e._good) e._good = {};
                    e._good.x = e.x; e._good.y = e.y; e._good.angle = e.angle;
                    return;
                }
                const sp = Math.hypot(e.vx, e.vy), cap = Math.max(4, Math.min(14, Math.min(e.width, e.height) * 0.9));
                if (sp > cap) { e.vx *= cap / sp; e.vy *= cap / sp; }
                if (Math.abs(e.angularVel) > 0.35) e.angularVel = Math.sign(e.angularVel) * 0.35;
                e.x += e.vx; e.y += e.vy;
                e.angle += e.angularVel;
                e.vx *= keep; e.vy *= keep;
                e.angularVel *= keepW;
                if (Math.abs(e.vx) < 0.1) e.vx = 0;
                if (Math.abs(e.vy) < 0.1) e.vy = 0;
                if (Math.abs(e.angularVel) < 0.001) e.angularVel = 0;
                e._still = (e.vx || e.vy || e.angularVel) ? 0 : (e._still || 0) + 1;   // asleep after a still half-second; a contact wakes it
                if (!e._good) e._good = {};
                e._good.x = e.x; e._good.y = e.y; e._good.angle = e.angle;
            }
            /**
             * Push a body: impulse (jx, jy), at point (px, py) for a turn too (a rigid body). Its speed changes by
             * impulse / mass (a character's carried velocity, a prop's vx / vy); static and immovable bodies don't move.
             */
            static impulse(e, jx, jy, px = null, py = null) {
                const im = this._invMass(e);
                if (!im) return;
                this._addVel(e, jx * im, jy * im);
                const I = px === null ? 0 : this._invInertia(e);
                if (I) { const c = this._centre(e); e.angularVel = (e.angularVel || 0) + ((px - c.x) * jy - (py - c.y) * jx) * I; }
            }

            // =====================
            //  CONTACT SOLVER (rigid bodies in the plane)
            // =====================

            /** Inverse mass: 0 for static or immovable things (fixtures, very heavy decor) and walls. */
            static _invMass(e) {
                if (!e || e.isStatic || e.immovable) return 0;
                const m = e.mass || 1;
                return m >= 1e4 ? 0 : 1 / m;
            }
            /** Inverse moment of inertia about the centre: a box spins (I = m(w²+h²)/12); circles, cars and fixed decor don't. */
            static _invInertia(e) {
                if (!e || e.angularVel === undefined || e.fixedRotation || (e.body && e.body.lock.rot) || this._invMass(e) === 0) return 0;
                const w = e.width || 20, h = e.height || 20;
                return 12 / ((e.mass || 1) * (w * w + h * h));
            }
            static _centre(e) { return e.getCenter ? e.getCenter() : { x: e.x, y: e.y }; }
            /** Contact velocity: actors add knockback and the position step (the player moves by position). */
            static _vel(e) {
                if (e.collisionLayer === GameEntity.LAYER.ACTOR)
                    return { x: (e.vx || 0) + (e.knockbackVx || 0) + (e.vx ? 0 : e._cvx || 0), y: (e.vy || 0) + (e.knockbackVy || 0) + (e.vy ? 0 : e._cvy || 0) };
                return { x: e.vx || 0, y: e.vy || 0 };
            }
            static _addVel(e, dx, dy) {
                const lk = this._locks(e);
                if (lk) { if (lk.x) dx = 0; if (lk.y) dy = 0; }
                if (e.collisionLayer === GameEntity.LAYER.ACTOR && e.knockbackVx !== undefined) { e.knockbackVx += dx; e.knockbackVy += dy; }
                else { e.vx = (e.vx || 0) + dx; e.vy = (e.vy || 0) + dy; }
            }

            /**
             * Resolve one contact between a and b (b null = a wall): n points from b to a, cp is the contact point.
             * Position: push apart by the depth beyond a little slop, shared by inverse mass. Velocity: a normal
             * impulse with restitution e and Coulomb friction mu, each with its angular term (r × n)² / I,
             * so an off-centre hit turns the body the way it should — no random spin.
             */
            static _solveContact(a, b, packet, cp, e, mu, invA) {
                const { nx, ny, depth } = packet;
                const iA = invA ?? this._invMass(a), iB = b ? this._invMass(b) : 0;
                const sum = iA + iB;
                if (sum === 0) return;
                // Position correction (80% of the depth past 0.5px of slop)
                const corr = Math.max(0, depth - 0.5) * 0.8 / sum;
                if (iA) { a.x += nx * corr * iA; a.y += ny * corr * iA; }
                if (iB) { b.x -= nx * corr * iB; b.y -= ny * corr * iB; }
                if (depth > 0.5 && depth - 0.5 < 0.5) {                               // shallow: finish the push without overshoot
                    const rest = (depth - 0.5) * 0.2 / sum;
                    if (iA) { a.x += nx * rest * iA; a.y += ny * rest * iA; }
                    if (iB) { b.x -= nx * rest * iB; b.y -= ny * rest * iB; }
                }
                // Velocities at the contact point
                const IA = this._invInertia(a), IB = b ? this._invInertia(b) : 0;
                const cA = this._centre(a), cB = b ? this._centre(b) : cp;
                const rAx = cp.x - cA.x, rAy = cp.y - cA.y, rBx = cp.x - cB.x, rBy = cp.y - cB.y;
                const vA = this._vel(a), vB = b ? this._vel(b) : { x: 0, y: 0 };
                const wA = a.angularVel || 0, wB = b ? (b.angularVel || 0) : 0;
                const rvx = (vA.x - wA * rAy) - (vB.x - wB * rBy), rvy = (vA.y + wA * rAx) - (vB.y + wB * rBx);
                const vn = rvx * nx + rvy * ny;
                if (vn >= 0) return;                                                   // already separating
                const rAn = rAx * ny - rAy * nx, rBn = rBx * ny - rBy * nx;
                const kN = sum + rAn * rAn * IA + rBn * rBn * IB;
                const j = -(1 + e) * vn / kN;
                // Actors push but take no velocity back (they move by their own will; knockback is for hits)
                const vA_ = a.collisionLayer === GameEntity.LAYER.ACTOR ? 0 : iA, vB_ = b && b.collisionLayer === GameEntity.LAYER.ACTOR ? 0 : iB;
                this._applyImpulse(a, b, nx * j, ny * j, rAx, rAy, rBx, rBy, vA_, vB_, IA, IB);
                // Friction along the tangent, capped by mu·j
                let tx = rvx - vn * nx, ty = rvy - vn * ny;
                const tl = Math.hypot(tx, ty);
                if (tl > 1e-6) {
                    tx /= tl; ty /= tl;
                    const rAt = rAx * ty - rAy * tx, rBt = rBx * ty - rBy * tx;
                    const kT = sum + rAt * rAt * IA + rBt * rBt * IB;
                    const jt = Math.max(-mu * j, Math.min(mu * j, -tl / kT));
                    this._applyImpulse(a, b, tx * jt, ty * jt, rAx, rAy, rBx, rBy, vA_, vB_, IA, IB);
                }
            }
            static _applyImpulse(a, b, Jx, Jy, rAx, rAy, rBx, rBy, iA, iB, IA, IB) {
                if (iA) this._addVel(a, Jx * iA, Jy * iA);
                if (IA) a.angularVel = (a.angularVel || 0) + (rAx * Jy - rAy * Jx) * IA;
                if (b && iB) this._addVel(b, -Jx * iB, -Jy * iB);
                if (b && IB) b.angularVel = (b.angularVel || 0) - (rBx * Jy - rBy * Jx) * IB;
            }

            // =====================
            //  COLLISION RESOLUTION
            // =====================
            
            /**
             * Resolve actor vs actor collision (circle vs circle).
             * Uses mass-based separation and knockback velocity transfer.
             */
            static _resolveActorVsActor(a, b, packet) {
                const { nx, ny, depth } = packet;
                
                const m1 = a.mass || 10;
                const m2 = b.mass || 10;
                const totalMass = m1 + m2;
                let ratio1 = m2 / totalMass;
                let ratio2 = m1 / totalMass;
                if (this._yields(a, b, packet)) return;   // the game's say on who gives way
                
                // Position separation
                a.x += nx * depth * ratio1;
                a.y += ny * depth * ratio1;
                b.x -= nx * depth * ratio2;
                b.y -= ny * depth * ratio2;
                
                // Calculate combined velocities (movement + knockback)
                const v1x = (a.vx || 0) + (a.knockbackVx || 0);
                const v1y = (a.vy || 0) + (a.knockbackVy || 0);
                const v2x = (b.vx || 0) + (b.knockbackVx || 0);
                const v2y = (b.vy || 0) + (b.knockbackVy || 0);
                
                // Relative velocity along normal
                const v1n = v1x * nx + v1y * ny;
                const v2n = v2x * nx + v2y * ny;
                const relVel = v1n - v2n;
                
                // Only apply impulse if approaching
                if (relVel >= 0) return;
                
                const restitution = 0.2;  // Low bounce for actors (they're fleshy)
                const j = -(1 + restitution) * relVel / totalMass;
                
                // Apply impulse to knockback velocities (actors use knockback for collision response)
                if (a.knockbackVx !== undefined) {
                    a.knockbackVx += j * m2 * nx;
                    a.knockbackVy += j * m2 * ny;
                }
                if (b.knockbackVx !== undefined) {
                    b.knockbackVx -= j * m1 * nx;
                    b.knockbackVy -= j * m1 * ny;
                }
            }
            
            /**
             * Resolve circle (actor) vs static collision.
             */
            static _resolveCircleVsStatic(circle, packet) {
                const { nx, ny, depth } = packet;
                circle.x += nx * depth;
                circle.y += ny * depth;
            }
            
            /**
             * Resolve circle (actor) vs dynamic (prop) collision with impulse.
             */
            static _resolveCircleVsDynamic(actor, prop, packet) {
                // n points from the prop to the actor; they touch on the actor's near side
                const r = actor.radius || 10;
                const cp = { x: actor.x - packet.nx * (r - packet.depth / 2), y: actor.y - packet.ny * (r - packet.depth / 2) };
                if (prop.isStatic) { actor.x += packet.nx * packet.depth; actor.y += packet.ny * packet.depth; return; }
                // Legs push harder than a body weighs: actors shove with PUSH_MASS × their mass
                this._solveContact(actor, prop, packet, cp, 0, 0.5, 1 / ((actor.mass || 10) * this.push_mass));
            }
            

            // ── HOOKS: the game's say (a game extends this class and overrides them) ──
            /** A body that never moves and keeps its cells (cached in the static grid). */
            static _isFixed(e) { return e.collisionLayer === GameEntity.LAYER.STATIC && e.getBoundingBox === GameEntity.prototype.getBoundingBox; }
            /** The world's edges, so a body deep in a wall is pushed inward ({ w, h, margin } or null). */
            static _mapBounds(game) { return null; }
            /** Anything else actors push this step (hinged doors). */
            static _stepDoors(actors, game) {}
            /** Actor vs actor: true if the game has already settled this pair (someone gave way). */
            static _yields(a, b, packet) { return false; }
            /** People vs cars: true for anyone the game meets cars with itself. */
            static _ownCarRules(p, game) { return false; }
            /** How much harder legs push than a body weighs. */
            static push_mass = 1;
            /** Projectiles are the game's (what a hit does). */
            static _processProjectiles(onScreen, game, candidates = null) {}
            /** Vehicle vs a wall: the game's car physics; this only separates them. */
            static _resolveVehicleCollision(v1, v2, packet) { if (!v1.isStatic) { v1.x += packet.nx * packet.depth; v1.y += packet.ny * packet.depth; } }
        }
