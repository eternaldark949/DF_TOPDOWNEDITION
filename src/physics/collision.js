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
                
                // 3. Insert into spatial grid
                for (let entity of onScreen) {
                    this.spatialGrid.insert(entity);
                }
                
                // 4. Process collisions by layer
                this._processProjectiles(onScreen, game);
                this._processVehicles(onScreen, game);
                this._processActors(onScreen, game);
                this._processDynamics(onScreen, game);
                
                // 5. Cleanup destroyed entities
                GameEntity.cleanup();
            }
            
            // =====================
            //  LAYER PROCESSORS
            // =====================
            
            static _processProjectiles(onScreen, game) {
                const projectiles = onScreen.filter(e => 
                    e.collisionLayer === GameEntity.LAYER.PROJECTILE && e.active
                );
                
                for (let proj of projectiles) {
                    // Skip if destroyed between frames or by prior collision
                    if (!proj.active || proj.markedForDestroy) continue;
                    
                    // Skip ghost projectiles (zero velocity, not sticky)
                    if (!proj.sticky && proj.vx === 0 && proj.vy === 0) {
                        proj.destroy();
                        continue;
                    }
                    
                    // Skip aged-out projectiles (hard 5s cap)
                    if (typeof _frameTime !== 'undefined' && proj.spawnTime && _frameTime - proj.spawnTime > 5000) {
                        proj.destroy();
                        continue;
                    }
                    
                    const nearby = this.spatialGrid.getNearby(proj);
                    this.stats.totalChecks += nearby.length;
                    
                    for (let target of nearby) {
                        // Bail if this projectile was destroyed by a collision earlier in this loop
                        if (!proj.active || proj.markedForDestroy) break;
                        
                        if (!target.active || proj === target) continue;
                        if ((proj.collisionMask & target.collisionLayer) === 0) continue;
                        
                        // Skip collision with the projectile's owner (prevent self-hits)
                        if (proj.owner && target === proj.owner) continue;
                        
                        // Skip same-alliance targets (friendly fire prevention)
                        if (proj.alliance && target.alliance && proj.alliance === target.alliance) continue;
                        
                        // Skip neutral entities (civilians)
                        if (target.alliance === 'neutral') continue;
                        
                        // Skip targets already hit by penetrating projectiles
                        if (proj.penetrating && proj.hitTargets.has(target)) continue;
                        
                        if (this._checkCollision(proj, target)) {
                            this.stats.narrowChecks++;
                            
                            if (proj.speed > 20) {
                                // High impact dust!
                                game.createImpactDust(proj.x, proj.y);
                            }
                            
                            if (target.collisionLayer === GameEntity.LAYER.ACTOR && target.onProjectileHit) {
                                target.onProjectileHit(proj, game);
                            }
                            
                            if (proj.onHit) proj.onHit(target, game);
                            
                            // Penetrating projectiles don't stop - they keep going
                            if (proj.penetrating) {
                                proj.hitTargets.add(target);
                                proj.penetrateCount++;
                                // Check if we've exceeded max penetrations
                                if (proj.penetrateCount >= proj.maxPenetrations) {
                                    proj.destroy();
                                    break;
                                }
                                // Continue checking other targets
                            } else {
                                proj.destroy();
                                this.stats.collisionsResolved++;
                                break;
                            }
                        }
                        
                        // NEW: Fallback for high-speed tunneling (Sniper Fix)
                        else if (proj.speed > 20 && target.collisionShape === GameEntity.SHAPE.CIRCLE
                                && !(proj.alliance && target.alliance && proj.alliance === target.alliance)
                                && target.alliance !== 'neutral') {
                            // If the bullet didn't hit directly, check if it passed through
                            // We check the distance from the target center to the line segment (lastX, lastY) -> (x, y)
                            
                            // Only check if we actually have a previous position
                            if (proj.lastX !== undefined) {
                                const distSq = CollisionSystem.distToSegmentSquared(
                                    target.x, target.y, 
                                    proj.lastX, proj.lastY, 
                                    proj.x, proj.y
                                );
                        
                                // If the line passed within the target's radius
                                if (distSq < (target.radius + proj.radius) ** 2) {
                                    
                                    game.createImpactDust(target.x, target.y);
                                    
                                    // Execute the hit logic (copying from your existing hit block)
                                    if (target.collisionLayer === GameEntity.LAYER.ACTOR && target.onProjectileHit) {
                                        target.onProjectileHit(proj, game);
                                    }
                                    if (proj.onHit) proj.onHit(target, game);
                        
                                    if (proj.penetrating) {
                                        proj.hitTargets.add(target);
                                        proj.penetrateCount++;
                                        if (proj.penetrateCount >= proj.maxPenetrations) {
                                            proj.destroy();
                                            break;
                                        }
                                    } else {
                                        proj.destroy();
                                        this.stats.collisionsResolved++;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            static _processVehicles(onScreen, game) {
                const vehicles = onScreen.filter(e => 
                    e.collisionLayer === GameEntity.LAYER.VEHICLE && e.active
                );
                
                // Vehicle vs Vehicle
                for (let i = 0; i < vehicles.length; i++) {
                    const v1 = vehicles[i];
                    const nearby = this.spatialGrid.getNearby(v1);
                    
                    for (let v2 of nearby) {
                        if (v2.collisionLayer !== GameEntity.LAYER.VEHICLE) continue;
                        if (!v2.active || v1 === v2) continue;
                        if (vehicles.indexOf(v2) <= i) continue;
                        
                        this.stats.totalChecks++;
                        const packet = this._satCollision(v1.getOBB(), v2.getOBB());
                        if (packet) {
                            this._resolveVehicleCollision(v1, v2, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
                
                // Vehicle vs Static
                for (let vehicle of vehicles) {
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
            }
            
            static _processActors(onScreen, game) {
                const actors = onScreen.filter(e => 
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
                    if (game.enemies && game.enemies.length) {
                        const seen = new Set(actors);
                        doorActors = actors.concat(game.enemies.filter(e => e && !e.dead && e.active !== false && !seen.has(e)));
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
                            this._resolveCircleVsDynamic(actor, prop, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
            }
            
            static _processDynamics(onScreen, game) {
                const dynamics = onScreen.filter(e => 
                    e.collisionLayer === GameEntity.LAYER.DYNAMIC && e.active
                );
                
                const checkedPairs = new Set();
                
                // Dynamic vs Dynamic (OBB vs OBB)
                for (let propA of dynamics) {
                    const nearby = this.spatialGrid.getNearby(propA);
                    
                    for (let propB of nearby) {
                        if (propB.collisionLayer !== GameEntity.LAYER.DYNAMIC) continue;
                        if (!propB.active || propB === propA) continue;
                        
                        const pairId = propA.id < propB.id 
                            ? `${propA.id}-${propB.id}` 
                            : `${propB.id}-${propA.id}`;
                        
                        if (checkedPairs.has(pairId)) continue;
                        checkedPairs.add(pairId);
                        
                        this.stats.totalChecks++;
                        const packet = this._satCollision(propA.getOBB(), propB.getOBB());
                        if (packet) {
                            this._resolveDynamicCollision(propA, propB, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
                
                // Dynamic vs Static
                for (let prop of dynamics) {
                    const nearby = this.spatialGrid.getNearby(prop);
                    
                    for (let wall of nearby) {
                        if (wall.collisionLayer !== GameEntity.LAYER.STATIC) continue;
                        if (!wall.active) continue;
                        
                        this.stats.totalChecks++;
                        const wallOBB = this._aabbToOBB(wall);
                        wallOBB.mass = Infinity;
                        
                        const packet = this._satCollision(prop.getOBB(), wallOBB);
                        if (packet) {
                            this._resolveDynamicVsStatic(prop, packet);
                            this.stats.collisionsResolved++;
                        }
                    }
                }
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
                    // Circle center inside OBB
                    const cosBack = Math.cos(obb.angle);
                    const sinBack = Math.sin(obb.angle);
                    nx = -sinBack;
                    ny = cosBack;
                }
                
                return { nx, ny, depth: circle.radius - dist };
            }
            
            // =====================
            //  COLLISION RESOLUTION
            // =====================
            
            /**
             * Resolve collision between two dynamic entities using mass-based impulse.
             */
            static _resolveDynamicCollision(a, b, packet) {
                const { nx, ny, depth } = packet;
                
                const m1 = a.mass || 1;
                const m2 = b.mass || 1;
                const totalMass = m1 + m2;
                const ratio1 = m2 / totalMass;
                const ratio2 = m1 / totalMass;
                
                // Position separation
                a.x += nx * depth * ratio1;
                a.y += ny * depth * ratio1;
                b.x -= nx * depth * ratio2;
                b.y -= ny * depth * ratio2;
                
                // Velocity impulse
                const v1n = (a.vx || 0) * nx + (a.vy || 0) * ny;
                const v2n = (b.vx || 0) * nx + (b.vy || 0) * ny;
                const relVel = v1n - v2n;
                
                if (relVel > 0) return; // Separating
                
                const restitution = Math.min(a.restitution || 0.3, b.restitution || 0.3);
                const j = -(1 + restitution) * relVel / totalMass;
                
                a.vx = (a.vx || 0) + j * m2 * nx;
                a.vy = (a.vy || 0) + j * m2 * ny;
                b.vx = (b.vx || 0) - j * m1 * nx;
                b.vy = (b.vy || 0) - j * m1 * ny;
                
                // Angular impulse (props can spin)
                if (a.angularVel !== undefined) {
                    a.angularVel += (Math.random() - 0.5) * Math.abs(relVel) * 0.02;
                }
                if (b.angularVel !== undefined) {
                    b.angularVel += (Math.random() - 0.5) * Math.abs(relVel) * 0.02;
                }
            }
            
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
                const { nx, ny, depth } = packet;
                
                const obb1 = v1.getOBB();
                const obb2 = v2.getOBB();
                
                const m1 = obb1.mass || 1000;
                const m2 = obb2.mass || 1000;
                
                // Handle infinite mass (static objects) to avoid NaN from Infinity/Infinity
                let ratio1, ratio2;
                if (!isFinite(m2)) {
                    // m2 is static/immovable (wall/building), only m1 moves
                    ratio1 = 1;
                    ratio2 = 0;
                } else if (!isFinite(m1)) {
                    // m1 is static/immovable, only m2 moves
                    ratio1 = 0;
                    ratio2 = 1;
                } else {
                    const totalMass = m1 + m2;
                    ratio1 = m2 / totalMass;
                    ratio2 = m1 / totalMass;
                }
                
                // Position separation
                if (!v1.isStatic && ratio1 > 0) {
                    obb1.x += nx * depth * ratio1;
                    obb1.y += ny * depth * ratio1;
                    if (v1.x !== undefined) { v1.x = obb1.x; v1.y = obb1.y; }
                }
                if (!v2.isStatic && ratio2 > 0) {
                    obb2.x -= nx * depth * ratio2;
                    obb2.y -= ny * depth * ratio2;
                    if (v2.x !== undefined) { v2.x = obb2.x; v2.y = obb2.y; }
                }
                
                // Speed-based velocity
                const v1x = Math.cos(obb1.angle) * (obb1.speed || 0);
                const v1y = Math.sin(obb1.angle) * (obb1.speed || 0);
                const v2x = Math.cos(obb2.angle) * (obb2.speed || 0);
                const v2y = Math.sin(obb2.angle) * (obb2.speed || 0);
                
                const relVel = (v1x - v2x) * nx + (v1y - v2y) * ny;
                
                if (relVel >= 0) return; // Separating
                
                const restitution = 0.4;
                const j = -(1 + restitution) * relVel * 0.5;
                
                // Apply speed changes only to non-static objects
                if (obb1.speed !== undefined && ratio1 > 0) {
                    obb1.speed += j * ratio1;
                    // Write back speed to vehicle
                    if (v1.speed !== undefined) v1.speed = obb1.speed;
                }
                if (obb2.speed !== undefined && ratio2 > 0) {
                    obb2.speed -= j * ratio2;
                    if (v2.speed !== undefined) v2.speed = obb2.speed;
                }
                
                // Angular spin (only for non-static)
                if (obb1.angle !== undefined && ratio1 > 0) {
                    const spin = (Math.random() - 0.5) * 0.1 * Math.abs(j);
                    obb1.angle += spin;
                    if (v1.angle !== undefined) v1.angle = obb1.angle;
                }
                if (obb2.angle !== undefined && ratio2 > 0) {
                    const spin = (Math.random() - 0.5) * 0.1 * Math.abs(j);
                    obb2.angle -= spin;
                    if (v2.angle !== undefined) v2.angle = obb2.angle;
                }
                
                // Friction slowdown
                if (obb1.speed !== undefined && ratio1 > 0) {
                    obb1.speed *= 0.9;
                    if (v1.speed !== undefined) v1.speed = obb1.speed;
                }
                if (obb2.speed !== undefined && ratio2 > 0) {
                    obb2.speed *= 0.9;
                    if (v2.speed !== undefined) v2.speed = obb2.speed;
                }
            }
            
            /**
             * Resolve dynamic vs static collision.
             */
            static _resolveDynamicVsStatic(dynamic, packet) {
                const { nx, ny, depth } = packet;
                
                // Full separation on dynamic
                dynamic.x += nx * depth;
                dynamic.y += ny * depth;
                
                // Velocity bounce
                const vn = (dynamic.vx || 0) * nx + (dynamic.vy || 0) * ny;
                if (vn < 0) {
                    const restitution = dynamic.restitution || 0.3;
                    dynamic.vx = (dynamic.vx || 0) - (1 + restitution) * vn * nx;
                    dynamic.vy = (dynamic.vy || 0) - (1 + restitution) * vn * ny;
                    
                    // Dampen
                    dynamic.vx *= 0.8;
                    dynamic.vy *= 0.8;
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
                const { nx, ny, depth } = packet;
                
                const m1 = actor.mass || 10;
                const m2 = prop.mass || 5;
                const totalMass = m1 + m2;
                const ratio1 = m2 / totalMass;
                const ratio2 = m1 / totalMass;
                
                // Position separation
                actor.x += nx * depth * ratio1;
                actor.y += ny * depth * ratio1;
                
                if (!prop.isStatic) {
                    prop.x -= nx * depth * ratio2;
                    prop.y -= ny * depth * ratio2;
                    
                    // Velocity calculation
                    const actorVx = (actor.knockbackVx || 0) + (actor.vx || 0);
                    const actorVy = (actor.knockbackVy || 0) + (actor.vy || 0);
                    const propVx = prop.vx || 0;
                    const propVy = prop.vy || 0;
                    
                    const relVel = (actorVx - propVx) * nx + (actorVy - propVy) * ny;
                    
                    if (relVel < -0.5) {
                        const restitution = 0.3;
                        const j = -(1 + restitution) * relVel / totalMass;
                        
                        // Actor knockback
                        if (actor.knockbackVx !== undefined) {
                            actor.knockbackVx += j * m2 * nx;
                            actor.knockbackVy += j * m2 * ny;
                        }
                        
                        // Prop velocity
                        prop.vx -= j * m1 * nx;
                        prop.vy -= j * m1 * ny;
                    }
                }
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


