        // ===== LV2 DIRECTORY =====
        // The game's collision system: collisionWorld (basement/collision-kit.js: the step, the layers, the grid, the
        // solver, people vs cars) with this game's rules on top: projectile hits, doors swinging, companions giving
        // way to her, who meets cars in engine/update.js, car physics (basement/vehicle-kit.js).
        // The shape tests are the Basement's shape kit (basement/shape-kit.js); entities are
        // basement/entity-base.js, the broad-phase grid basement/spatial-grid.js.
        /* =====================================================================
           PHYSICS SYSTEM (OPTIMIZATION START)
           ---------------------------------------------------------------------
           A centralized engine for handling all collision geometry and response.
           
           GOAL: 
           Decouple "collision math" from "game entities". Entities simply
           feed their data (position, size, shape) to this system, and it
           returns collision results or applies resolution forces.
           
           SUPPORTED SHAPES:
           - Point (x, y)
           - Circle (x, y, radius)
           - AABB (Axis-Aligned Bounding Box - unrotated rectangles)
           - OBB (Oriented Bounding Box - rotated rectangles like cars)
           - Ray (Start, End - for shooting/sight)
           
           METHODS:
           - checkOverlap: Boolean detection
           - getSeparation: Returns vector to push objects apart
           - resolveElastic: Handles momentum transfer (bouncing)
           ===================================================================== */
        /* =====================================================================
           PHYSICS SYSTEM (SAT UPGRADE)
           ---------------------------------------------------------------------
           Replaces simple distance checks with Separating Axis Theorem (SAT).
           Guarantees solid collisions for rotated rectangles (OBBs).
           ===================================================================== */
        /* =====================================================================
           UNIFIED COLLISION SYSTEM
           Version: Alpha 4.3.0
           =====================================================================
           
           ARCHITECTURE OVERVIEW:
           ┌─────────────────────────────────────────────────────────────────────┐
           │                        GameEntity (Base)                           │
           │  ├── Position, Velocity, Angle                                     │
           │  ├── Collision Config (shape, layer, mask)                         │
           │  ├── Queue-based registration (enqueue on construct)               │
           │  └── Screen-space visibility culling                               │
           ├─────────────────────────────────────────────────────────────────────┤
           │                      CollisionSystem (Unified)                     │
           │  ├── Registration queue for batch entity loading                   │
           │  ├── SpatialHashGrid for broad-phase culling                       │
           │  ├── SAT-based narrow-phase (unified solver)                       │
           │  ├── Mass-based impulse transfer                                   │
           │  └── CollisionPacket format for all resolutions                    │
           ├─────────────────────────────────────────────────────────────────────┤
           │                    Entity Subclasses                               │
           │  ├── StaticEntity  → Walls, Buildings (AABB, infinite mass)        │
           │  ├── PropEntity    → Pushable objects (OBB, mass-based physics)    │
           │  ├── ActorEntity   → Characters (Circle, mass-based knockback)     │
           │  ├── VehicleEntity → Traffic cars (OBB, speed-based physics)       │
           │  └── ProjectileEntity → Bullets (Circle, trigger on hit)           │
           └─────────────────────────────────────────────────────────────────────┘
           
           COLLISION PIPELINE:
           1. Entities enqueue themselves on construction
           2. CollisionSystem.processQueue() registers all at map load
           3. Each frame: rebuild spatial grid → process by layer → resolve
           4. All resolutions use unified SAT solver + mass-based impulse
           
           COLLISION SHAPES:
           - CIRCLE: Actors, Projectiles (smooth movement, efficient)
           - AABB:   Static geometry (axis-aligned, no rotation)
           - OBB:    Props, Vehicles (rotatable, SAT collision)
           
           COLLISION LAYERS (Bitmask):
           - NONE:       0    → Decorative (no collision)
           - STATIC:     1    → Walls, Buildings (infinite mass)
           - DYNAMIC:    2    → Props (pushable, OBB)
           - ACTOR:      4    → Characters (circle)
           - VEHICLE:    8    → Cars (OBB, traffic system)
           - PROJECTILE: 16   → Bullets (trigger-only)
           - TRIGGER:    32   → Zones (overlap detection only)
           
           ===================================================================== */

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
        class CollisionSystem extends collisionWorld {
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
                            const at = shapeKit.sweepRoundedBox(x0 * c + y0 * s, y0 * c - x0 * s, x1 * c + y1 * s, y1 * c - x1 * s,
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
                lifeKit.sweep(game.projectiles, (p) => {
                    this.resolveProjectile(p, game);
                    if (p.life <= 0 && p.active) p.destroy();
                    return !p.active || p.markedForDestroy;
                });
            }

            static _processProjectiles(onScreen, game, candidates = null) {
                if (!game) return;
                for (const p of candidates || onScreen.filter(e => e.collisionLayer === GameEntity.LAYER.PROJECTILE)) {
                    if (!p.active || p.markedForDestroy) continue;
                    if ((!p.sticky && !p.vx && !p.vy) || (p.spawnTime != null && _gameTimeMs() - p.spawnTime > 5000)) { p.destroy(); continue; }
                    this.resolveProjectile(p, game);
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
                vehicleKit.carContact(b1, b2, packet.nx, packet.ny, packet.depth, CONFIG.VEHICLE_DRIVE);
            }
            

            // ── The game's answers to collisionWorld's hooks ──
            static _isFixed(e) { return e instanceof StaticEntity && e.getBoundingBox === GameEntity.prototype.getBoundingBox; }
            static _mapBounds(game) {
                // Map bounds, so deeply-embedded actors push out toward the playable interior instead of off-map
                // (where bound clamping would yank them back into the wall)
                return (game && game.activeMap) ? { w: game.activeMap.width, h: game.activeMap.height, margin: 15 } : null;
            }
            static _stepDoors(actors, game) {
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
            }
            static _yields(a, b, packet) {
                const { nx, ny, depth } = packet;
                // Companions always yield to the player: a teammate bumping into you gets
                // moved out of the way instead of shoving you (and no impulse is traded)
                const isCompanion = (e) => e && (e.recruited || e.hired) && e.type !== 'player';
                if (a.type === 'player' && isCompanion(b)) {
                    b.x -= nx * depth; b.y -= ny * depth;
                    return true;
                }
                if (b.type === 'player' && isCompanion(a)) {
                    a.x += nx * depth; a.y += ny * depth;
                    return true;
                }
                return false;
            }
            /** Stella and her crew meet cars on the street step (streetFeet, from engine/update.js resolveTrafficCollisions): everywhere, not only on screen */
            static _ownCarRules(p, game) {
                if (!game) return false;
                return p === game.player || (game.teammates && game.teammates.includes(p)) || (game.isDriving && p === game.player);
            }
            static get push_mass() { return CONFIG.PHYSICS.PUSH_MASS; }

            /** Who meets traffic on foot, and how: her (15 px, never from inside a car), the crew she has (their radius + 1;
             *  a car fading in or out isn't solid yet). Each one's car-hit grace counts down here. */
            static _footRules(p, game) {
                if (p === game.player) return this._herFoot || (this._herFoot = { R: 15, inside: false });
                if (!p || p.inCar || p.dead || !(p.recruited || p.hired)) return null;
                if (p._carHitCd > 0) p._carHitCd--;
                return { R: (p.radius || 14) + 1, inside: true, skip: v => (v === game.car && game.isDriving && p.inCar) || (v.fade !== undefined && v.fade < 0.5) };
            }
            /** A car touching her or the crew: she shoves it back by mass (and with her strength); they're shoved aside.
             *  One over speed 4 hits (10), then 40 ticks' grace. */
            static _footVsCar(p, v, c, game) {
                const wx = c.nx, wy = c.ny, o = c.depth;
                if (p === game.player) {
                    const pMass = p.mass || 15, vMass = v.mass || 1000, totalMass = pMass + vMass;
                    const playerRatio = vMass / totalMass, carRatio = pMass / totalMass;   // how much each one moves
                    p.x += wx * o * playerRatio; p.y += wy * o * playerRatio;
                    v.x -= wx * o * carRatio; v.y -= wy * o * carRatio;
                    const pushDot = p.velX * wx + p.velY * wy;                           // walking into it: a shove (super strength)
                    if (pushDot < 0 && carRatio > 0.5) {
                        const pushForce = -pushDot * 2.0;
                        v.x -= wx * pushForce * carRatio * 2; v.y -= wy * pushForce * carRatio * 2;
                    }
                    if (Math.abs(v.speed) > 4.0 && !(game._carHitCd > 0)) {
                        game._carHitCd = 40;
                        game.damagePlayer(10);
                        game.triggerShake(10);
                        audioSys.sfx('explode');
                        game.weather.spawnExplosion(p.x, p.y, '#ff0000');
                    }
                    return;
                }
                p.x += wx * o; p.y += wy * o;                                            // the car doesn't give
                if (Math.abs(v.speed) > 4 && !(p._carHitCd > 0) && !p.downed) {
                    p._carHitCd = 40;
                    if (p.takeDamage) p.takeDamage(10, wx * 6, wy * 6);
                    game.triggerShake(4);
                }
            }
        }
