        // ===== LV2 DIRECTORY =====
        // Car contact: how this game's cars hit each other and walls (mass, spin, the driven car's jolt).
        // The geometry and the rigid-body impulse are the Basement's shape kit (basement/shape-kit.js).
        /**
         * Provides backward compatibility for traffic vehicle collisions.
         * Delegates to CollisionSystem's unified SAT solver.
         */
        class PhysicsSystem {

            /**
             * Resolve OBB collision between two vehicles.
             * Used by traffic system for vehicle-vehicle and vehicle-wall collisions.
             */
            static resolveOBBCollision(c1, c2) {
                // Use CollisionSystem's SAT solver
                const packet = shapeKit.sat(c1, c2);
                if (!packet) return false;
                PhysicsSystem.carContact(c1, c2, packet.nx, packet.ny, packet.depth);
                return true;
            }

            /** How fast a car is turning (rad/tick): the driven car's yawRate, traffic's spin from a knock */
            static spinOf(c) { return c.controlMode === 'PLAYER' ? (c.yawRate || 0) : (c.spin || 0); }
            static setSpin(c, w) {
                const M = CONFIG.VEHICLE_DRIVE.YAW_SPIN_MAX;
                w = Math.max(-M, Math.min(M, w));
                if (c.controlMode === 'PLAYER') c.yawRate = w; else c.spin = w;
            }

            /** A car as a rigid body for impulseAt (live: whether it can move at all) */
            static body(c, live) {
                if (!live) return { invM: 0, invI: 0, x: c.x, y: c.y, vx: 0, vy: 0, w: 0 };
                const m = c.mass || 1000, spins = !!(c.applyDrivePhysics && c.length);
                const L = c.length || 60, W = c.width || 30;
                const hasV = c.vx !== undefined;
                const vx = hasV ? c.vx : Math.cos(c.angle || 0) * (c.speed || 0), vy = hasV ? c.vy : Math.sin(c.angle || 0) * (c.speed || 0);
                return { invM: 1 / m, invI: spins ? 1 / (m * (L * L + W * W) / 12 * CONFIG.VEHICLE_DRIVE.SPIN_INERTIA) : 0,
                         x: c.x, y: c.y, vx, vy, w: spins ? PhysicsSystem.spinOf(c) : 0 };
            }
            /** Write a body's new velocity and turn back onto its car */
            static _store(c, B) {
                if (c.vx !== undefined) {
                    c.vx = B.vx; c.vy = B.vy;
                    c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
                } else if (c.speed !== undefined) c.speed = B.vx * Math.cos(c.angle || 0) + B.vy * Math.sin(c.angle || 0);
                if (B.invI > 0) PhysicsSystem.setSpin(c, B.w);
            }

            /**
             * Two cars (or a car and something immovable: mass Infinity) touching along normal (nx, ny),
             * pointing from c2 to c1, overlapping by depth. Pushes them apart by mass, then resolves the
             * hit as rigid bodies at the point where they meet (impulseAt): the closing speed comes out
             * with a little bounce and some scrub, and each car turns by where it was struck.
             */
            static carContact(c1, c2, nx, ny, depth) {
                const m1 = c1.isStatic ? Infinity : (c1.mass || 1000), m2 = c2.isStatic ? Infinity : (c2.mass || 1000);
                const w1 = isFinite(m1) ? (isFinite(m2) ? m2 / (m1 + m2) : 1) : 0;
                const w2 = isFinite(m2) ? (isFinite(m1) ? m1 / (m1 + m2) : 1) : 0;
                const [px, py] = shapeKit.boxContactPoint(c1, c2, nx, ny);
                c1.x += nx * depth * w1; c1.y += ny * depth * w1;
                c2.x -= nx * depth * w2; c2.y -= ny * depth * w2;
                c1._lastImpact = c2._lastImpact = 0;
                const B1 = PhysicsSystem.body(c1, w1 > 0), B2 = PhysicsSystem.body(c2, w2 > 0);
                const v1x = B1.vx, v1y = B1.vy, v2x = B2.vx, v2y = B2.vy;
                const hit = shapeKit.impulseAt(B1, B2, px + nx * depth * w1, py + ny * depth * w1, nx, ny, 0.2, 0.3);
                if (!hit) return;                                      // already separating
                // A nudge between two traffic cars (queues, merges) is driven out of; a real knock spins them
                const soft = hit < CONFIG.VEHICLE_DRIVE.KNOCK_MIN_HIT && c1.controlMode !== 'PLAYER' && c2.controlMode !== 'PLAYER';
                if (soft) B1.invI = B2.invI = 0;
                if (w1 > 0) PhysicsSystem._store(c1, B1);
                if (w2 > 0) PhysicsSystem._store(c2, B2);
                c1._lastContact = c2; c2._lastContact = c1;
                c1._lastImpact = c2._lastImpact = hit;
                // The driven car feels it (the spin is already in its yawRate)
                if (w1 > 0 && c1.controlMode === 'PLAYER' && c1.onImpact) c1.onImpact(Math.hypot(B1.vx - v1x, B1.vy - v1y));
                if (w2 > 0 && c2.controlMode === 'PLAYER' && c2.onImpact) c2.onImpact(Math.hypot(B2.vx - v2x, B2.vy - v2y));
                return hit;
            }
            
            /**
             * OBB vs AABB collision (treats AABB as infinite-mass OBB).
             */
            static checkOBBvsAABB(obb, aabb) {
                const aabbAsOBB = {
                    x: aabb.x + aabb.w / 2,
                    y: aabb.y + aabb.h / 2,
                    length: aabb.w,
                    width: aabb.h,
                    angle: 0,
                    mass: 10000000
                };
                return this.resolveOBBCollision(obb, aabbAsOBB);
            }
        }
