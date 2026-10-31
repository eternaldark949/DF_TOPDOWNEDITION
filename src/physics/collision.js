        // =====================================================================
        //  COLLISION SYSTEM (Unified Manager)
        // =====================================================================
        /**
         * Unified collision system with:
         * - Queue-based registration for batch entity loading
         * - SAT-based collision detection for all shapes
         * - Mass-based impulse transfer
         * - Single collision packet format
         */
                // ╔══════════════════════════════════════════════════════════════════╗
        // ║                    COLLISION SYSTEM                               ║
        // ╚══════════════════════════════════════════════════════════════════╝
        class CollisionSystem {
            static spatialGrid = new SpatialHashGrid(200);
            static enabled = true;
            static _staticGrid = new SpatialHashGrid(200);
            static _staticRows = [];
            static _staticMembers = [];
            static _layers = { projectile: [], vehicle: [], actor: [], dynamic: [] };

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
            
            // Math helper: distance from a point (circle center) to a line segment (bullet path)
            static distToSegmentSquared(px, py, l1x, l1y, l2x, l2y) {
                const l2 = (l1x - l2x) ** 2 + (l1y - l2y) ** 2;
                if (l2 === 0) return (px - l1x) ** 2 + (py - l1y) ** 2;
                let t = ((px - l1x) * (l2x - l1x) + (py - l1y) * (l2y - l1y)) / l2;
                t = clamp(t, 0, 1);
                return (px - (l1x + t * (l2x - l1x))) ** 2 + (py - (l1y + t * (l2y - l1y))) ** 2;
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
                narrowChecks: 0,
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
                    if (entity instanceof StaticEntity && entity.getBoundingBox === GameEntity.prototype.getBoundingBox) fixed.push(entity);
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
                this._processDynamics(onScreen, game, L.dynamic);
                
                // 5. Cleanup destroyed entities
                GameEntity.cleanup();
            }
            
            // =====================
            //  LAYER PROCESSORS
            // =====================
            
            // Projectile hits are resolved once, after actors have moved, along the full tick path.
            static beginProjectileStep(game) {
                const remember = a => {
                    if (!a) return;
                    a._projectileStartTick = _simTick;
                    a._projectileStartX = a.x; a._projectileStartY = a.y;
                };
                for (const a of GameEntity.getByLayer('ACTOR')) remember(a);
                for (const a of game.enemies) remember(a);
                remember(game.player);
            }

            static _sweepCircle(ax, ay, bx, by, cx, cy, radius) {
                if (Math.max(ax, bx) < cx - radius || Math.min(ax, bx) > cx + radius ||
                    Math.max(ay, by) < cy - radius || Math.min(ay, by) > cy + radius) return null;
                const ox = ax - cx, oy = ay - cy, dx = bx - ax, dy = by - ay;
                const c = ox * ox + oy * oy - radius * radius;
                if (c <= 0) return 0;
                const a = dx * dx + dy * dy;
                if (!a) return null;
                const b = ox * dx + oy * dy, disc = b * b - a * c;
                if (disc < 0) return null;
                const t = (-b - Math.sqrt(disc)) / a;
                return t >= 0 && t <= 1 ? t : null;
            }

            static _sweepRect(ax, ay, bx, by, left, top, right, bottom) {
                let lo = 0, hi = 1;
                for (const [v, step, min, max] of [[ax, bx - ax, left, right], [ay, by - ay, top, bottom]]) {
                    if (!step) { if (v < min || v > max) return null; continue; }
                    const a = (min - v) / step, b = (max - v) / step;
                    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
                    if (lo > hi) return null;
                }
                return lo;
            }

            // Exact circle-vs-box sweep: two strips plus round corners, avoiding false corner hits.
            static _sweepRoundedBox(ax, ay, bx, by, hw, hh, radius) {
                if (Math.max(ax, bx) < -hw - radius || Math.min(ax, bx) > hw + radius ||
                    Math.max(ay, by) < -hh - radius || Math.min(ay, by) > hh + radius) return null;
                let best = null;
                const keep = t => { if (t !== null && (best === null || t < best)) best = t; };
                keep(this._sweepRect(ax, ay, bx, by, -hw - radius, -hh, hw + radius, hh));
                keep(this._sweepRect(ax, ay, bx, by, -hw, -hh - radius, hw, hh + radius));
                for (const x of [-hw, hw]) for (const y of [-hh, hh]) keep(this._sweepCircle(ax, ay, bx, by, x, y, radius));
                return best;
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

            static _projectileContacts(p, game) {
                const hits = [], seen = new Set(), mask = p.collisionMask;
                const add = (target, kind) => {
                    if (!target || seen.has(target) || target === p.owner || target.active === false || target.dead || target.markedForDestroy || target.hasCollision === false) return;
                    if (game.isDriving && p.owner === game.player && target === game.car) return;
                    const actor = kind === 'enemy' || kind === 'actor';
                    if (actor && (target.alliance === 'neutral' || (p.alliance && p.alliance === target.alliance))) return;
                    if (target === game.player && (!p.isEnemy || !target.visible)) return;
                    const layer = target.collisionLayer ?? (kind === 'wall' ? GameEntity.LAYER.STATIC : GameEntity.LAYER.VEHICLE);
                    if (!(mask & layer) || p.hitTargets.has(target)) return;
                    seen.add(target);
                    const t = this.projectileHitTime(p, target, actor);
                    if (t !== null) hits.push({ target, kind, t });
                };
                if (!p.isEnemy) for (const e of game.enemies) add(e, 'enemy');
                add(game.player, 'actor');
                for (const a of GameEntity.getByLayer('ACTOR')) add(a, 'actor');
                // Props: only those whose cell the path crosses (a map can hold hundreds; testing each against every shot cost ~3 ms a tick)
                const r0 = p.radius ?? 5, px0 = p.lastX ?? p.x, py0 = p.lastY ?? p.y;
                for (const prop of this._near('dynamic', GameEntity.getByLayer('DYNAMIC'), true, Math.min(px0, p.x) - r0, Math.min(py0, p.y) - r0, Math.max(px0, p.x) + r0, Math.max(py0, p.y) + r0)) add(prop, 'entity');
                for (const car of game.traffic?.vehicles || []) add(car, 'traffic');
                if (game.ownedCar?.visible) add(game.ownedCar, 'traffic');
                for (const car of GameEntity.getByLayer('VEHICLE')) add(car, 'entity');

                // Authored walls use their existing spatial index, independent of camera culling.
                const map = game.activeMap, r = p.radius ?? 5;
                if (map) {
                    const bounds = { left: Math.min(p.lastX ?? p.x, p.x) - r, right: Math.max(p.lastX ?? p.x, p.x) + r,
                        top: Math.min(p.lastY ?? p.y, p.y) - r, bottom: Math.max(p.lastY ?? p.y, p.y) + r };
                    for (const list of [map.walls || [], getColliders(map)]) for (const wall of _physicsSpatial.query(list, bounds)) add(wall, 'wall');
                }
                // Other registered statics (e.g. billboard posts); avoid duplicate map-wall proxies.
                const statics = GameEntity.getByLayer('STATIC');
                let extra = game._projectileStaticExtras;
                if (!extra || extra.walls !== game._staticWallEntities || extra.buildings !== game._staticBuildingEntities) {
                    extra = game._projectileStaticExtras = { walls: game._staticWallEntities, buildings: game._staticBuildingEntities,
                        mapped: new Set([...(game._staticWallEntities || []), ...(game._staticBuildingEntities || [])]) };
                }
                if (extra.tick !== _simTick || extra.source !== statics || extra.length !== statics.length) {
                    extra.source = statics; extra.length = statics.length; extra.tick = _simTick;
                    extra.items = statics.filter(s => !extra.mapped.has(s));
                }
                for (const wall of this._near('statics', extra.items, false, Math.min(px0, p.x) - r0, Math.min(py0, p.y) - r0, Math.max(px0, p.x) + r0, Math.max(py0, p.y) + r0)) add(wall, 'wall');

                const room = game.roomSystem;
                if (room?.active) {
                    for (const win of room.windows) if (!win.shattered) {
                        const t = this.projectileHitTime(p, win);
                        if (t !== null) hits.push({ target: win, kind: 'window', t });
                    }
                    for (const door of room.doors) {
                        if (door.type === 'arch' || p._doorHits?.has(door)) continue;
                        let t = null;
                        for (const [ax, ay, bx, by] of door.leaves()) {
                            const cx = (ax + bx) / 2, cy = (ay + by) / 2, a = Math.atan2(by - ay, bx - ax), c = Math.cos(a), s = Math.sin(a);
                            const x0 = (p.lastX ?? p.x) - cx, y0 = (p.lastY ?? p.y) - cy, x1 = p.x - cx, y1 = p.y - cy;
                            const at = this._sweepRoundedBox(x0 * c + y0 * s, y0 * c - x0 * s, x1 * c + y1 * s, y1 * c - x1 * s,
                                Math.hypot(bx - ax, by - ay) / 2, 0, r + (door.halfThick || 0));
                            if (at !== null && (t === null || at < t)) t = at;
                        }
                        if (t !== null) hits.push({ target: door, kind: 'door', t });
                    }
                }
                // Resolve front-to-back, never by enemy-array or spatial-cell insertion order.
                const priority = hit => hit.kind === 'window' ? 0 : (hit.kind === 'enemy' || hit.kind === 'actor') ? 2 : 1;
                hits.sort((a, b) => a.t - b.t || priority(a) - priority(b));
                return hits;
            }

            static resolveProjectile(p, game) {
                if (!p.active || p.markedForDestroy || p._projectileCollisionTick === _simTick) return;
                p._projectileCollisionTick = _simTick;
                const x0 = p.lastX ?? p.x, y0 = p.lastY ?? p.y, x1 = p.x, y1 = p.y;
                for (const hit of this._projectileContacts(p, game)) {
                    if (!p.active || p.markedForDestroy) break;
                    const e = hit.target;
                    if (e.active === false || e.dead || e.markedForDestroy || p.hitTargets.has(e)) continue;
                    p.x = x0 + (x1 - x0) * hit.t; p.y = y0 + (y1 - y0) * hit.t;
                    if (hit.kind === 'window') {
                        if (e.tryShatter(p.x, p.y, (p.radius ?? 5) + 1e-6)) {
                            game.weather.spawnSparks(p.x, p.y, 8); audioSys.sfx('explode');
                            game.emitNoise(p.x, p.y, CONFIG.NOISE.glass, 'glass', !p.isEnemy);
                        }
                        continue;
                    }
                    if (hit.kind === 'door') {
                        e.strike(p, p.x, p.y); (p._doorHits || (p._doorHits = new Set())).add(e);
                        const glass = e.type === 'sliding';
                        game.weather.spawnSparks(p.x, p.y, glass ? 6 : 4);
                        if (!glass) game.createImpactDust(p.x, p.y);
                        if (typeof ambience !== 'undefined') ambience.doorEvent(glass ? 'tink' : 'thud', e);
                        game.emitNoise(p.x, p.y, CONFIG.NOISE.door, 'door', !p.isEnemy);
                        if (p.penetrating && !p.melee) p.damage *= 0.5;
                        else { p.destroy(); break; }
                        continue;
                    }
                    if (hit.kind === 'enemy') {
                        // p.knock (Golden Retribution): a set multiple of a jab's shove, whatever the hit's damage
                        const speed = Math.hypot(p.vx, p.vy), strength = Math.min(((p.knock ? p.knockDmg * p.knock : p.damage) * speed * 0.02) / ((e.mass || 20) * 0.1), 50);
                        e.lastHitBy = p.owner; e.lastHitMelee = !!p.melee;
                        const landed = e.takeDamage(p.damage, speed ? p.vx / speed * strength : 0, speed ? p.vy / speed * strength : 0,
                            { shot: !p.melee, punch: !!p.melee, crit: !!p.crit });
                        if (landed && p.melee && e.interruptMelee) e.interruptMelee();
                        if (landed && p.sticky && !e.dead) game.stickOrb(e, p);
                        if (landed && p.knuckles && game.onKnuckleHit) game.onKnuckleHit(e, p);
                        if (landed && p.melee && !p.isEnemy && p.owner === game.player && game.onPunchLanded) game.onPunchLanded(e, p);   // her punches (Vampiric Fists)
                    } else if (hit.kind === 'actor') e.onProjectileHit(p, game);
                    else if (hit.kind === 'traffic') {
                        const speed = Math.hypot(p.vx, p.vy), push = (p.damage * speed * 0.005) / 5;
                        if (speed) { e.x += p.vx / speed * push; e.y += p.vy / speed * push; }
                        game.weather.spawnSparks(p.x, p.y, 8);
                    }
                    if (p.onHit) p.onHit(e, game, hit.kind !== 'traffic');
                    if (p.isSniper) game.weather.spawnSparks(p.x, p.y, 15);
                    p.hitTargets.add(e);
                    if (!p.penetrating || ++p.penetrateCount >= p.maxPenetrations) { p.destroy(); break; }
                }
                if (p.active && !p.markedForDestroy) { p.x = x1; p.y = y1; }
            }

            static resolveProjectiles(game) {
                for (let i = game.projectiles.length - 1; i >= 0; i--) {
                    const p = game.projectiles[i];
                    this.resolveProjectile(p, game);
                    if (p.life <= 0 && p.active) p.destroy();
                    if (!p.active || p.markedForDestroy) game.projectiles.splice(i, 1);
                }
            }

            static _processProjectiles(onScreen, game, candidates = null) {
                if (!game) return;
                for (const p of candidates || onScreen.filter(e => e.collisionLayer === GameEntity.LAYER.PROJECTILE)) {
                    if (!p.active || p.markedForDestroy) continue;
                    if ((!p.sticky && !p.vx && !p.vy) || (p.spawnTime != null && _gameTimeMs() - p.spawnTime > 5000)) { p.destroy(); continue; }
                    this.resolveProjectile(p, game);
                }
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
                const mapBounds = (game && game.activeMap)
                    ? { w: game.activeMap.width, h: game.activeMap.height, margin: 15 }
                    : null;
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

                // Actor vs hinged doors (they swing when pushed)
                // (every live enemy too, on screen or not, so no one ghosts through a closed door)
                if (game && game.roomSystem && game.roomSystem.active) {
                    let doorActors = actors;
                    if (game.clubLife && game.clubLife.walkers.length) doorActors = doorActors.concat(game.clubLife.doorActors());   // the club's crowd pushes the restroom doors
                    if (game.enemies && game.enemies.length) {
                        const seen = new Set(actors);
                        doorActors = doorActors.concat(game.enemies.filter(e => e && !e.dead && e.active !== false && !seen.has(e)));   // (onto the crowd too, not over it)
                    }
                    game.roomSystem.stepDoorPhysics(doorActors);
                }

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

            /** Is point p inside the OBB (a little tolerance)? */
            static _inOBB(p, o, tol = 0.6) {
                const c = Math.cos(-(o.angle || 0)), s = Math.sin(-(o.angle || 0)), dx = p.x - o.x, dy = p.y - o.y;
                const lx = dx * c - dy * s, ly = dx * s + dy * c;
                return Math.abs(lx) <= (o.length || o.width || 20) / 2 + tol && Math.abs(ly) <= (o.width || o.height || 20) / 2 + tol;
            }
            /**
             * Where two OBBs touch (n from o2 to o1): the deepest corner(s) of each into the other, averaging
             * corners that tie (face to face, so a flush push doesn't twist), preferring the one that's inside.
             */
            static _contactPoint(o1, o2, nx, ny) {
                const pick = (corners, sign) => {
                    let best = Infinity; for (const c of corners) best = Math.min(best, sign * (c.x * nx + c.y * ny));
                    let x = 0, y = 0, k = 0;
                    for (const c of corners) if (sign * (c.x * nx + c.y * ny) <= best + 0.5) { x += c.x; y += c.y; k++; }
                    return { x: x / k, y: y / k };
                };
                const p1 = pick(this._getOBBCorners(o1), 1), p2 = pick(this._getOBBCorners(o2), -1);
                const in1 = this._inOBB(p1, o2), in2 = this._inOBB(p2, o1);
                if (in1 && !in2) return p1;
                if (in2 && !in1) return p2;
                return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            }

            // =====================
            //  COLLISION DETECTION
            // =====================
            
            /**
             * Generic collision check dispatching to appropriate method.
             */
            static _checkCollision(a, b) {
            // Quick AABB early-out before expensive shape checks
            const aBox = a.getBoundingBox();
            const bBox = b.getBoundingBox();
            if (aBox.x + aBox.w < bBox.x || bBox.x + bBox.w < aBox.x ||
                aBox.y + aBox.h < bBox.y || bBox.y + bBox.h < aBox.y) {
                return false;
            }

                const shapeA = a.collisionShape;
                const shapeB = b.collisionShape;
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.CIRCLE) {
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    return dist < a.radius + b.radius;
                }
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.AABB) {
                    return this._circleVsAABB(a, b) !== null;
                }
                if (shapeA === GameEntity.SHAPE.AABB && shapeB === GameEntity.SHAPE.CIRCLE) {
                    return this._circleVsAABB(b, a) !== null;
                }
                
                if (shapeA === GameEntity.SHAPE.CIRCLE && shapeB === GameEntity.SHAPE.OBB) {
                    return this._circleVsOBB(a, b) !== null;
                }
                if (shapeA === GameEntity.SHAPE.OBB && shapeB === GameEntity.SHAPE.CIRCLE) {
                    return this._circleVsOBB(b, a) !== null;
                }
                
                // Treat everything else as OBB
                const obbA = a.getOBB ? a.getOBB() : this._entityToOBB(a);
                const obbB = b.getOBB ? b.getOBB() : this._entityToOBB(b);
                return this._satCollision(obbA, obbB) !== null;
            }
            
            /**
             * SAT collision detection with MTV (Minimum Translation Vector).
             * Returns collision packet or null if no collision.
             */
            static _satCollision(obb1, obb2) {
                const corners1 = this._getOBBCorners(obb1);
                const corners2 = this._getOBBCorners(obb2);
                const axes = [...this._getOBBAxes(obb1), ...this._getOBBAxes(obb2)];
                
                let minOverlap = Infinity;
                let mtv = null;
                
                for (let axis of axes) {
                    const p1 = this._projectShape(corners1, axis);
                    const p2 = this._projectShape(corners2, axis);
                    
                    if (p1.max < p2.min || p2.max < p1.min) {
                        return null; // Gap found, no collision
                    }
                    
                    const overlap = Math.min(p1.max, p2.max) - Math.max(p1.min, p2.min);
                    if (overlap < minOverlap) {
                        minOverlap = overlap;
                        mtv = { x: axis.x, y: axis.y };
                    }
                }
                
                // Ensure MTV points from obb2 to obb1
                const dx = obb1.x - obb2.x;
                const dy = obb1.y - obb2.y;
                if (dx * mtv.x + dy * mtv.y < 0) {
                    mtv.x = -mtv.x;
                    mtv.y = -mtv.y;
                }
                
                this.stats.narrowChecks++;
                return { nx: mtv.x, ny: mtv.y, depth: minOverlap };
            }
            
            /**
             * Circle vs Circle collision.
             * Returns collision packet with normal pointing from b to a.
             */
            static _circleVsCircle(a, b) {
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.hypot(dx, dy);
                const minDist = a.radius + b.radius;
                
                if (dist >= minDist) return null;
                
                this.stats.narrowChecks++;
                
                if (dist > 0) {
                    return { 
                        nx: dx / dist, 
                        ny: dy / dist, 
                        depth: minDist - dist 
                    };
                }
                
                // Circles perfectly overlapping - push in arbitrary direction
                return { nx: 1, ny: 0, depth: minDist };
            }
            
            /**
             * Circle vs AABB collision.
             */
            static _circleVsAABB(circle, rect, mapBounds) {
                const bb = rect.getBoundingBox();
                const closestX = Math.max(bb.x, Math.min(bb.x + bb.w, circle.x));
                const closestY = Math.max(bb.y, Math.min(bb.y + bb.h, circle.y));
                
                const dx = circle.x - closestX;
                const dy = circle.y - closestY;
                const dist = Math.hypot(dx, dy);
                
                if (dist >= circle.radius) return null;
                
                this.stats.narrowChecks++;
                
                if (dist > 0) {
                    return { nx: dx / dist, ny: dy / dist, depth: circle.radius - dist };
                }
                
                // Circle center is inside the AABB. Evaluate pushout to each of the four
                // faces and pick the smallest valid one. "Valid" = the resulting position
                // stays inside the playable map area (when mapBounds is supplied).
                //
                // This is critical for thick perimeter walls (e.g. the gauntlet's 80px
                // outer ring): the geometric shortest face on the LEFT wall is west, but
                // pushing west goes off the map and the bound-clamp yanks the actor back
                // into the wall — wobble loop. Filtering to in-bounds candidates first
                // makes the resolver pick "east" for the left wall, "south" for the top
                // wall, etc., automatically.
                const r = circle.radius;
                const candidates = [
                    { nx: -1, ny:  0, depth: (circle.x - bb.x) + r,        outX: bb.x - r,        outY: circle.y },
                    { nx:  1, ny:  0, depth: (bb.x + bb.w - circle.x) + r, outX: bb.x + bb.w + r, outY: circle.y },
                    { nx:  0, ny: -1, depth: (circle.y - bb.y) + r,        outX: circle.x,        outY: bb.y - r },
                    { nx:  0, ny:  1, depth: (bb.y + bb.h - circle.y) + r, outX: circle.x,        outY: bb.y + bb.h + r }
                ];
                candidates.sort((a, b) => a.depth - b.depth);
                
                if (mapBounds) {
                    const m = mapBounds.margin || 0;
                    for (const c of candidates) {
                        if (c.outX >= m && c.outX <= mapBounds.w - m
                         && c.outY >= m && c.outY <= mapBounds.h - m) {
                            return { nx: c.nx, ny: c.ny, depth: c.depth };
                        }
                    }
                }
                
                // No bounds info, or every face's pushout exits the map — fall back to
                // the geometrically smallest pushout (degenerate case).
                const c0 = candidates[0];
                return { nx: c0.nx, ny: c0.ny, depth: c0.depth };
            }
            
            /**
             * Circle vs OBB collision.
             * Transforms circle to OBB local space for accurate collision.
             */
            static _circleVsOBB(circle, obbEntity) {
                const obb = obbEntity.getOBB ? obbEntity.getOBB() : this._entityToOBB(obbEntity);
                
                // Transform circle center to OBB local space
                const cos = Math.cos(-obb.angle);
                const sin = Math.sin(-obb.angle);
                const dx = circle.x - obb.x;
                const dy = circle.y - obb.y;
                const localX = dx * cos - dy * sin;
                const localY = dx * sin + dy * cos;
                
                // Find closest point on local AABB
                const hw = obb.length / 2;
                const hh = obb.width / 2;
                const closestX = Math.max(-hw, Math.min(hw, localX));
                const closestY = Math.max(-hh, Math.min(hh, localY));
                
                const distX = localX - closestX;
                const distY = localY - closestY;
                const dist = Math.hypot(distX, distY);
                
                if (dist >= circle.radius) return null;
                
                this.stats.narrowChecks++;
                
                // Transform normal back to world space
                let nx, ny;
                if (dist > 0) {
                    const localNx = distX / dist;
                    const localNy = distY / dist;
                    const cosBack = Math.cos(obb.angle);
                    const sinBack = Math.sin(obb.angle);
                    nx = localNx * cosBack - localNy * sinBack;
                    ny = localNx * sinBack + localNy * cosBack;
                } else {
                    // Circle centre inside the box: out through the nearest face, the whole way
                    const cosBack = Math.cos(obb.angle);
                    const sinBack = Math.sin(obb.angle);
                    const ex = hw - Math.abs(localX), ey = hh - Math.abs(localY);
                    const lnx = ex < ey ? Math.sign(localX) || 1 : 0, lny = ex < ey ? 0 : Math.sign(localY) || 1;
                    nx = lnx * cosBack - lny * sinBack;
                    ny = lnx * sinBack + lny * cosBack;
                    return { nx, ny, depth: Math.min(ex, ey) + circle.radius };
                }
                
                return { nx, ny, depth: circle.radius - dist };
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
                // Companions always yield to the player: a teammate bumping into you gets
                // moved out of the way instead of shoving you (and no impulse is traded)
                const isCompanion = (e) => e && (e.recruited || e.hired) && e.type !== 'player';
                if (a.type === 'player' && isCompanion(b)) {
                    b.x -= nx * depth; b.y -= ny * depth;
                    return;
                }
                if (b.type === 'player' && isCompanion(a)) {
                    a.x += nx * depth; a.y += ny * depth;
                    return;
                }
                
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
             * Resolve vehicle collision (uses speed property).
             */
            static _resolveVehicleCollision(v1, v2, packet) {
                // The car on either side is the entity itself (a wall arrives as a static stand-in)
                const body = (v) => v.isStatic ? Object.assign(v.getOBB(), { isStatic: true }) : v;
                const b1 = body(v1), b2 = body(v2);
                if (b1.mass === undefined && v1.getOBB) b1.mass = v1.getOBB().mass;
                PhysicsSystem.carContact(b1, b2, packet.nx, packet.ny, packet.depth);
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
                this._solveContact(actor, prop, packet, cp, 0, 0.5, 1 / ((actor.mass || 10) * CONFIG.PHYSICS.PUSH_MASS));
            }
            
            // =====================
            //  SAT HELPERS
            // =====================
            
            static _getOBBCorners(obb) {
                const cos = Math.cos(obb.angle || 0);
                const sin = Math.sin(obb.angle || 0);
                const hw = (obb.length || obb.width || 20) / 2;
                const hh = (obb.width || obb.height || 20) / 2;
                
                return [
                    { x: obb.x + (hw * cos - (-hh) * sin), y: obb.y + (hw * sin + (-hh) * cos) },
                    { x: obb.x + (hw * cos - hh * sin),    y: obb.y + (hw * sin + hh * cos) },
                    { x: obb.x + ((-hw) * cos - hh * sin), y: obb.y + ((-hw) * sin + hh * cos) },
                    { x: obb.x + ((-hw) * cos - (-hh) * sin), y: obb.y + ((-hw) * sin + (-hh) * cos) }
                ];
            }
            
            static _getOBBAxes(obb) {
                const cos = Math.cos(obb.angle || 0);
                const sin = Math.sin(obb.angle || 0);
                return [
                    { x: cos, y: sin },
                    { x: -sin, y: cos }
                ];
            }
            
            static _projectShape(corners, axis) {
                let min = Infinity;
                let max = -Infinity;
                for (let c of corners) {
                    const dot = c.x * axis.x + c.y * axis.y;
                    if (dot < min) min = dot;
                    if (dot > max) max = dot;
                }
                return { min, max };
            }
            
            static _entityToOBB(entity) {
                const center = entity.getCenter ? entity.getCenter() : { x: entity.x, y: entity.y };
                return {
                    x: center.x, 
                    y: center.y,
                    length: entity.width || 20, 
                    width: entity.height || 20,
                    angle: entity.angle || 0,
                    mass: entity.mass || 1,
                    vx: entity.vx || 0,
                    vy: entity.vy || 0
                };
            }
            
            static _aabbToOBB(aabb) {
                return {
                    x: aabb.x + (aabb.width || aabb.w) / 2,
                    y: aabb.y + (aabb.height || aabb.h) / 2,
                    length: aabb.width || aabb.w,
                    width: aabb.height || aabb.h,
                    angle: 0,
                    mass: aabb.mass || 1
                };
            }
        }


