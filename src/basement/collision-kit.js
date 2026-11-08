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
        const collisionKit = {
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
            static _staticRows = [];
            static _staticMembers = [];
            static _layers = { projectile: [], vehicle: [], actor: [], dynamic: [] };

            // --- SHAPE MATHS: basement/shape-kit.js, under the names the game already calls ---
            static distToSegmentSquared = shapeKit.segmentDistanceSq;
            static _sweepCircle = shapeKit.sweepCircle;
            static _sweepRect = shapeKit.sweepRect;
            static _sweepRoundedBox = shapeKit.sweepRoundedBox;
            static _inOBB = shapeKit.insideObb;
            static _contactPoint = shapeKit.obbContactPoint;
            static _checkCollision = shapeKit.overlaps;
            static _satCollision = shapeKit.sat;
            static _circleVsCircle = shapeKit.circleVsCircle;
            static _circleVsAABB = shapeKit.circleVsRect;
            static _circleVsOBB = shapeKit.circleVsObb;
            static _getOBBCorners = shapeKit.obbCorners;
            static _getOBBAxes = shapeKit.obbAxes;
            static _projectShape = shapeKit.projectOnAxis;
            static _entityToOBB = shapeKit.entityToObb;
            static _aabbToOBB = shapeKit.rectToObb;

            static _prepareStaticGrid(items) {
                const rows = this._staticRows;
                if (this._staticGrid.cellSize !== this.spatialGrid.cellSize) { this._staticGrid = new SpatialHashGrid(this.spatialGrid.cellSize); rows.length = 0; }
                let changed = rows.length !== items.length;
                if (!changed) for (let i = 0; i < items.length; i++) {
                    const e = items[i], r = rows[i];
                    if (r.e !== e || !Object.is(r.x, e.x) || !Object.is(r.y, e.y) || !Object.is(r.w, e.width) || !Object.is(r.h, e.height) || !Object.is(r.r, e.radius) || !Object.is(r.a, e.angle) || r.shape !== e.collisionShape) { changed = true; break; }
                }
                if (changed) {
                    this._staticGrid.clear(); rows.length = items.length;
                    for (let i = 0; i < items.length; i++) {
                        const e = items[i], r = rows[i] || (rows[i] = {});
                        r.e = e; r.x = e.x; r.y = e.y; r.w = e.width; r.h = e.height; r.r = e.radius; r.a = e.angle; r.shape = e.collisionShape;
                        this._staticGrid.insert(e);
                    }
                }
                this.spatialGrid._staticCells = this._staticGrid.cells;
            }

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
                this._staticRows.length = 0; this._staticMembers.length = 0;
                const L = this._layers;
                L.projectile.length = L.vehicle.length = L.actor.length = L.dynamic.length = 0;
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
                
                // 2. Get on-screen collidables
                const margin = 300;
                const onScreen = GameEntity.getOnScreen(camera, canvas, margin);
                // A prop still moving off screen keeps colliding (else it drifts through walls out of sight)
                const dyn = GameEntity.getByLayer('DYNAMIC');
                if (dyn.length) {
                    let seen = null;
                    for (const p of dyn) {
                        if (!p.active || !(p.vx || p.vy || p.angularVel)) continue;
                        if (!seen) seen = new Set(onScreen);
                        if (!seen.has(p)) { onScreen.push(p); seen.add(p); }
                    }
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
                
                // 3. Refresh moving cells; unchanged standard static bodies keep their
                // cell coverage. Bucket layers once, in the same onScreen order.
                const L = this._layers, fixed = this._staticMembers;
                L.projectile.length = L.vehicle.length = L.actor.length = L.dynamic.length = fixed.length = 0;
                for (let i = 0; i < onScreen.length; i++) {
                    const entity = onScreen[i];
                    entity._collisionOrder = i;
                    if (this._isFixed(entity)) fixed.push(entity);
                    else this.spatialGrid.insert(entity);
                    switch (entity.collisionLayer) {
                        case GameEntity.LAYER.PROJECTILE: L.projectile.push(entity); break;
                        case GameEntity.LAYER.VEHICLE: L.vehicle.push(entity); break;
                        case GameEntity.LAYER.ACTOR: L.actor.push(entity); break;
                        case GameEntity.LAYER.DYNAMIC: L.dynamic.push(entity); break;
                    }
                }
                this._prepareStaticGrid(fixed);
                
                // 4. Process collisions by layer
                this._processProjectiles(onScreen, game, L.projectile);
                this._processVehicles(onScreen, game, L.vehicle);
                this._processActors(onScreen, game, L.actor);
                this._processPeopleVsCars(game, L.vehicle);
                this._processDynamics(onScreen, game, L.dynamic);
                
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
                    return this._sweepCircle(ax - sx, ay - sy, p.x - target.x, p.y - target.y, 0, 0, r + target.radius);
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
                return this._sweepRoundedBox((ax - cx) * c + (ay - cy) * s, (ay - cy) * c - (ax - cx) * s,
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
                        if (!wall.active) continue;
                        
                        this.stats.totalChecks++;
                        const wallOBB = this._aabbToOBB(wall);
                        wallOBB.mass = Infinity;
                        
                        const packet = this._satCollision(vehicle.getOBB(), wallOBB);
                        if (packet) {
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
                        if (prop.collisionLayer !== GameEntity.LAYER.DYNAMIC || !prop.active) continue;
                        this.stats.totalChecks++;
                        const vo = vehicle.getOBB(), po = prop.getOBB();
                        const packet = this._satCollision(vo, po);
                        if (!packet) continue;
                        const cp = this._contactPoint(vo, po, packet.nx, packet.ny);
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
                        
                        this.stats.totalChecks++;
                        const packet = this._circleVsCircle(actorA, actorB);
                        if (packet) {
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
                        if (!wall.active) continue;
                        
                        this.stats.totalChecks++;
                        const packet = this._circleVsAABB(actor, wall, mapBounds);
                        if (packet) {
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
                        if (!prop.active) continue;
                        
                        this.stats.totalChecks++;
                        const packet = this._circleVsOBB(actor, prop);
                        if (packet) {
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
                        if (p.collisionLayer !== GameEntity.LAYER.ACTOR || !p.active || p.dead || p.inCar || this._ownCarRules(p, game)) continue;
                        this.stats.totalChecks++;
                        const c = collisionKit.circleVsMovingBox({ x: p.x, y: p.y, radius: p.radius || 10, px: p.x - (p._cvx || 0), py: p.y - (p._cvy || 0) }, box);
                        if (!c) continue;
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
                            this.stats.totalChecks++;
                            const oa = propA.getOBB(), ob = propB.getOBB();
                            const packet = this._satCollision(oa, ob);
                            if (packet) {
                                const cp = this._contactPoint(oa, ob, packet.nx, packet.ny);
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
                            if (!wall.active) continue;
                            this.stats.totalChecks++;
                            const wallOBB = this._aabbToOBB(wall);
                            const po = prop.getOBB();
                            const packet = this._satCollision(po, wallOBB);
                            if (packet) {
                                const cp = this._contactPoint(po, wallOBB, packet.nx, packet.ny);
                                this._solveContact(prop, null, packet, cp, prop.restitution || 0.3, 0.45);
                                this.stats.collisionsResolved++;
                            }
                        }
                    }
                }
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
                if (!e || e.angularVel === undefined || e.fixedRotation || this._invMass(e) === 0) return 0;
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
