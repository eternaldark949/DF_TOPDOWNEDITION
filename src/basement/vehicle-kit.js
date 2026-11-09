        // ===== LV0 BASEMENT =====
        // The vehicle kit: how a car moves and what it does when it meets something, knowing nothing about any game.
        // The shape tests and the rigid-body impulse are the shape kit's (basement/shape-kit.js); the walls near a
        // car come from the static broadphase (_physicsSpatial, basement/spatial-grid.js).
        //
        // CAR       { x, y, angle, length, width, vx, vy, speed, mass, maxSpeed, acceleration, brake, handling, drive,
        //             manualGas, manualTurn, ... } (TrafficVehicle is one). `tyreModel` true: the full two-axle tyre model
        //             and its rotation in yawRate (the driven car); false: direct steering, a knock's turn in `spin`.
        // TUNING    the driving numbers (the game's CONFIG.VEHICLE_DRIVE, from vehicles.json), passed in on every call
        // SOLIDS    a list of rect lists ({ x, y, w, h }): what a car can't drive through
        //
        // vehicleKit.drive(car, T, env) -> collided     one tick: wheel, pedals, weight, tyres, drag, move, out of walls
        //   env: { solids, rain (0..1), steerCurve, gripFloor, wallBounce, wallMu, fx: { steer, skids, spray } }
        //   (fx: the game's effects, each optional: the turn signal, tyre marks, rain spray and smoke)
        // vehicleKit.wallContact(car, solids) -> { nx, ny, depth, obb } | null     the deepest solid it overlaps
        // vehicleKit.fits(car, x, y, angle, solids) -> boolean                   would it stand clear there?
        // vehicleKit.settle(car, solids, T)       a car with nobody driving slides and turns to rest on locked wheels
        // vehicleKit.carContact(c1, c2, nx, ny, depth, T) -> hit    two cars (or a car and an immovable) meeting
        // vehicleKit.body / store / spinOf / setSpin    a car as a rigid body for shapeKit.impulseAt, and back
        const vehicleKit = {
            /** One tick of driving (see the header). Returns whether it ended the tick against a solid. */
            drive(car, VD, env = {}) {
                const steerCurve = !!env.steerCurve, gripFloor = env.gripFloor || 0, fx = env.fx || {};

                car._wallProbeTick = _simTick;   // walls are handled here: the collision step skips this car's wall pass
                if (typeof car.vx === 'undefined') { car.vx = 0; car.vy = 0; }

                /* --- PER-VEHICLE PERFORMANCE ---
                   Acceleration and drag used to be hardcoded (0.5 / 0.96), so
                   every car in the game shared one top speed of 12.5 and one
                   acceleration curve — the entire brand/model stat block was
                   invisible from behind the wheel. Now the car's own numbers
                   drive it, and drag is SOLVED so it tops out where its spec
                   says it should:

                       steady state  v = a·d/(1-d)   =>   d = v/(a+v)          */
                const player = steerCurve;                    // the full weighted model is the driver's
                const ownTop = player && car.drivenTop > 0 ? car.drivenTop : car.maxSpeed;
                const ownAccel = player && car.drivenAccel > 0 ? car.drivenAccel : car.acceleration;
                const topSpeed = (typeof ownTop === 'number' && ownTop > 0) ? ownTop : 12.5;
                const acceleration = (typeof ownAccel === 'number' && ownAccel > 0) ? ownAccel : 0.5;
                const drag = topSpeed / (acceleration + topSpeed);
                const revTop = topSpeed * VD.REVERSE_TOP_FRACTION;
                const reverseDrag = revTop / (acceleration + revTop);

                const F = car.drive || VD.DEFAULT_FEEL;
                const rain = env.rain || 0;
                const absSpeed = Math.abs(car.speed);
                const clampU = (x, m) => x < -m ? -m : x > m ? m : x;

                // --- GRIP (traffic: the original single-number model) ---
                let grip = VD.GRIP_BASE;
                if (rain) grip = VD.GRIP_BASE - VD.GRIP_RAIN_PENALTY * rain;
                if (car.surfaceFriction) grip *= car.surfaceFriction;
                if (gripFloor > 0) grip = Math.max(grip, gripFloor);

                /* --- THE WHEEL ---
                   manualTurn is what the driver asks for; `steer` is where the front
                   wheels actually point. They wind on at the brand's pace and, when the
                   stick is let go, the caster pulls them home — quicker the faster the
                   car rolls, easing in rather than stopping dead. Traffic's wheels only
                   *look* like that (the drawn tyres follow `steer`): its path follower
                   steers the car directly, since a lagging wheel under it doubled
                   car-to-car contacts in the traffic sim. */
                const req = clampU(car.manualTurn || 0, 1);
                let st = car.steer || 0;
                if (!player) {
                    st += clampU(req - st, VD.AI_STEER_RATE);
                } else if (Math.abs(req) > 0.02 && (Math.sign(req) !== Math.sign(st) || Math.abs(req) > Math.abs(st))) {
                    const across = st !== 0 && Math.sign(req) !== Math.sign(st);
                    const rate = F.steerRate * (across ? 1.6 : 1);     // crossing centre, the caster helps
                    st += clampU(req - st, rate);
                } else {
                    const k = Math.min(VD.CENTER_RATE_MAX, VD.CENTER_RATE + VD.CENTER_RATE_SPEED * absSpeed);
                    const d = (req - st) * k;
                    st += Math.abs(d) < 0.006 ? req - st : d;
                }
                car.steer = st;
                if (player && fx.steer) fx.steer(car, req, absSpeed);

                // --- STEERING → ROTATION ---
                let yawTarget = 0;
                if (absSpeed > VD.STEER_MIN_SPEED) {
                    // Latch steering direction — only flip when speed clearly
                    // crosses the dead zone. Prevents direction jitter that
                    // causes wiggle at low reverse speeds.
                    if (car.speed > 1.0) car._steerDir = 1;
                    else if (car.speed < -1.0) car._steerDir = -1;
                    const direction = car._steerDir || 1;
                    const handlingMod = 1.0 - VD.HANDLING_RAIN_PENALTY * rain;

                    let authority = 1.0;
                    if (steerCurve) {
                        /* Turn rate was constant at any speed, so a barely-moving
                           car pirouetted at 189°/s with a 22px radius. Now it
                           ramps in from a standstill — you have to be rolling
                           before the wheel bites — and tapers at speed so the top
                           end is stable rather than twitchy, bottoming out at
                           STEER_HIGH_FLOOR instead of going to zero. */
                        const ramp = Math.min(1, absSpeed / VD.STEER_RAMP_SPEED);
                        const over = Math.max(0, absSpeed - VD.STEER_RAMP_SPEED);
                        authority = ramp * (VD.STEER_HIGH_FLOOR +
                            (1 - VD.STEER_HIGH_FLOOR) / (1 + over * VD.STEER_FALLOFF));
                    }
                    const reverseSteerFactor = direction < 0 ? VD.REVERSE_STEER_FACTOR : 1.0;
                    yawTarget = (player ? st : req) * car.handling * handlingMod * direction * reverseSteerFactor * authority;
                }
                /* Traffic turns where its path follower says, plus any spin a knock gave it
                   (vehicleKit.carContact), which its tyres scrub away; while it's spinning
                   the driver has lost it and barely steers. The driven car's rotation is
                   worked out from its tyres below (TYRES), so it's turned there. */
                let yaw = car.yawRate || 0;
                if (!player) {
                    const spin = car.spin || 0;
                    yaw = yawTarget * (1 - 0.85 * Math.min(1, Math.abs(spin) / 0.03)) + spin;
                    car.spin = Math.abs(spin) < 0.0005 ? 0 : spin * VD.KNOCK_SPIN_DECAY;
                    car.yawRate = yaw;
                    car.angle += yaw;
                }

                /* --- PEDALS ---
                   Gas against the direction of travel is the brake (car.brake, px/tick²),
                   taken off the car's motion and never past a stop; only once (nearly)
                   stopped does it reverse. The driver's throttle travels in over a few
                   ticks and the brake bites progressively; the handbrake is instant. */
                const fwdX0 = Math.cos(car.angle), fwdY0 = Math.sin(car.angle);
                const fwd0 = car.vx * fwdX0 + car.vy * fwdY0;
                const revBelow = player ? VD.REVERSE_BELOW : 0.25;
                let gas = car.manualGas || 0;
                if (player) {
                    const p = car.pedal || 0;
                    const braking = gas * fwd0 < 0 && Math.abs(fwd0) > revBelow;
                    const rate = (p !== 0 && Math.sign(gas) !== Math.sign(p)) ? VD.PEDAL_OUT + VD.PEDAL_BRAKE_IN
                        : Math.abs(gas) < Math.abs(p) ? VD.PEDAL_OUT
                        : braking ? VD.PEDAL_BRAKE_IN : VD.PEDAL_IN;
                    gas = car.pedal = p + clampU(gas - p, rate);
                }
                let decel = 0;
                if (Math.abs(gas) > (player && car._fineGas ? 0.02 : 0.1)) {
                    if (fwd0 * gas < 0 && Math.abs(fwd0) > revBelow) {
                        const sp = Math.hypot(car.vx, car.vy);
                        decel = Math.min(sp, Math.abs(gas) * (car.brake || 0.3));
                        if (sp > 0) { car.vx -= car.vx / sp * decel; car.vy -= car.vy / sp * decel; }
                    } else {
                        car.vx += fwdX0 * gas * acceleration;
                        car.vy += fwdY0 * gas * acceleration;
                    }
                }
                const hb = player && car.handbrake && absSpeed > 0.05;
                if (hb) {
                    const sp = Math.hypot(car.vx, car.vy), dec = Math.min(sp, VD.HANDBRAKE_DECEL);
                    if (sp > 0) { car.vx -= car.vx / sp * dec; car.vy -= car.vy / sp * dec; }
                    decel += dec;
                }

                /* --- WEIGHT ---
                   Braking pitches the load forward (the front bites, the rear goes
                   light); throttle sits it back. It shifts at the brand's pace, so a
                   heavy car settles slowly. */
                const loadTarget = decel > 0 ? Math.min(1, decel / ((car.brake || 0.3) + 0.05))
                    : gas > 0.1 ? -0.4 * gas * Math.min(1, acceleration / 0.2) : 0;
                car.load = (car.load || 0) + (loadTarget - (car.load || 0)) * VD.LOAD_RATE / F.weight;

                // --- DRIFT DECOMPOSITION ---
                const fwdX = Math.cos(car.angle);
                const fwdY = Math.sin(car.angle);
                const rightX = -fwdY;
                const rightY = fwdX;
                let fwdVelocity = car.vx * fwdX + car.vy * fwdY;
                let slideVelocity = car.vx * rightX + car.vy * rightY;

                if (fx.skids) fx.skids(car);

                // --- RAIN SPRAY ---
                if (fx.spray && rain && Math.abs(fwdVelocity) > 2.0) {
                    // Spray frequency tracks rain strength — wet roads throw more water.
                    const sprayChance = 0.7 * rain;
                    if (Math.random() < sprayChance) {
                        const sprayColor = 'rgba(200, 200, 255, 0.4)';
                        const spraySpeed = Math.abs(fwdVelocity) * 0.5;
                        const blX = car.x - car.length/2 * fwdX + car.width/2 * rightX;
                        const blY = car.y - car.length/2 * fwdY + car.width/2 * rightY;
                        fx.spray(blX, blY, car.angle + Math.PI, spraySpeed, sprayColor, 1.0, 1.0);
                        const brX = car.x - car.length/2 * fwdX - car.width/2 * rightX;
                        const brY = car.y - car.length/2 * fwdY - car.width/2 * rightY;
                        fx.spray(brX, brY, car.angle + Math.PI, spraySpeed, sprayColor, 1.0, 1.0);
                    }
                }

                // --- DRIFT SMOKE (+ traffic's grip breakaway) ---
                const smoking = Math.abs(slideVelocity) > VD.GRIP_SLIDE_THRESHOLD || (hb && Math.abs(fwdVelocity) > 3);
                if (smoking) {
                    if (!player) grip *= VD.GRIP_SLIDE_PENALTY;
                    if (fx.spray && Math.random() > 0.2) {
                        const smokeColor = 'rgba(30, 30, 30, 0.6)';
                        const slipSpeed = Math.max(Math.abs(slideVelocity), hb ? Math.abs(fwdVelocity) * 0.4 : 0);
                        const volume = 20.0;
                        const life = 10.0;
                        const blX = car.x - car.length/2 * fwdX + car.width/2 * rightX;
                        const blY = car.y - car.length/2 * fwdY + car.width/2 * rightY;
                        fx.spray(blX, blY, car.angle + Math.PI, slipSpeed, smokeColor, volume, life);
                        const brX = car.x - car.length/2 * fwdX - car.width/2 * rightX;
                        const brY = car.y - car.length/2 * fwdY - car.width/2 * rightY;
                        fx.spray(brX, brY, car.angle + Math.PI, slipSpeed, smokeColor, volume, life);
                    }
                }

                // --- TYRES ---
                if (!player) {
                    slideVelocity *= grip;
                } else {
                    /* Two axles, each a tyre pushing sideways against how fast that end of
                       the car slides across its wheels: firmly, up to a limit, then it lets
                       go. The front wheels point where the steering asks (the angle that
                       would carry yawTarget round), so the front pulls the nose in. The car
                       is one body: both pushes move it sideways, and because they act ahead
                       of and behind the centre they also turn it (rotation inertia
                       SPIN_INERTIA). So the car's rotation is worked out, not set: it
                       builds as the front bites, the tail steps out when the rear lets go
                       (braking weight forward, the handbrake), the nose pushes wide when the
                       front does, and any spin a crash gave it carries on until the tyres
                       scrub it off. */
                    const wetGrip = (1 - 0.35 * rain) * (car.surfaceFriction || 1);
                    const L = car.load;
                    let gF = F.gripF * (1 + VD.LOAD_FWD_GRIP * L) * wetGrip;
                    let gR = F.gripR * (1 - VD.LOAD_REAR_GRIP * L) * wetGrip;
                    if (hb) gR *= VD.HANDBRAKE_REAR_GRIP;
                    // Power over the rear: throttle held through a turn at speed spends the rear tyres' grip, so the tail can step out
                    if (VD.POWER_OVERSTEER && gas > 0.5 && absSpeed > 4) gR *= 1 - VD.POWER_OVERSTEER * gas * Math.min(1, Math.abs(st));
                    const a = car.length * VD.AXLE_FROM_CENTRE, wb = 2 * a;
                    const iu = (car.length * car.length + car.width * car.width) / 12 * VD.SPIN_INERTIA;   // inertia per unit mass
                    let w = car.yawRate || 0;
                    const delta = Math.abs(fwdVelocity) > 0.3 ? clampU(yawTarget * wb / fwdVelocity, VD.WHEEL_LOCK) : 0;
                    const sF = slideVelocity + w * a - fwdVelocity * delta, sR = slideVelocity - w * a;
                    const kF = VD.TYRE_STIFF * (F.turnIn / VD.DEFAULT_FEEL.turnIn), kR = VD.TYRE_STIFF;
                    const pF = -Math.sign(sF) * Math.min(Math.abs(sF) * kF * gF, F.latAcc * gF);
                    const pR = -Math.sign(sR) * Math.min(Math.abs(sR) * kR * gR, F.latAcc * gR);
                    slideVelocity += (pF + pR) / 2;
                    w += a * (pF - pR) / 2 / iu;
                    if (hb) w *= VD.HANDBRAKE_YAW_DAMP;               // the locked rear drags the swing out of it
                    w = clampU(w, VD.YAW_SPIN_MAX);
                    yaw = car.yawRate = w;
                    car.tyreSlip = Math.max(0, Math.abs(slideVelocity) - F.latAcc * 1.6) + (hb ? Math.abs(fwdVelocity) * 0.25 : 0)
                        + (decel > (car.brake || 0.3) * 0.8 && Math.abs(fwdVelocity) > 4 ? 0.8 : 0);
                }

                // --- BODY (visual): lean out of the turn, dip under the brakes ---
                const latA = clampU(yaw * fwdVelocity / 0.6, 1);
                car.bodyRoll = (car.bodyRoll || 0) + (latA - (car.bodyRoll || 0)) * 0.16 / F.weight;

                // --- RECOMPOSE + DRAG ---
                car.vx = fwdVelocity * fwdX + slideVelocity * rightX;
                car.vy = fwdVelocity * fwdY + slideVelocity * rightY;
                let dragNow = (fwdVelocity > 0 ? drag : reverseDrag);
                if (player && Math.abs(gas) < 0.1) dragNow *= 1 - (1 - (car.friction || 0.97)) * VD.COAST_DRAG;
                car.vx *= dragNow;
                car.vy *= dragNow;
                // --- INTEGRATE + COLLIDE ---
                const nextX = car.x + car.vx;
                const nextY = car.y + car.vy;
                if (player) car.angle += car.yawRate;

                /* Report the POST-drag forward component.
                   This used to be recorded before drag was applied, which
                   overstated speed by exactly one acceleration step. That was
                   invisible while top speed was a hardcoded 12.5, but now drag is
                   solved from each car's maxSpeed, so the stale value made every
                   vehicle read (maxSpeed + acceleration) instead of its spec. */
                car.speed = car.vx * fwdX + car.vy * fwdY;

                /* Wall response: move, then push out of whatever it ends up in.
                   The old axis-by-axis retry only asked "does it fit?", so once the car
                   was inside a wall (rotation is never checked: steering while touching
                   a wall turns a corner into it) every retry failed, the "head-on"
                   branch flipped the velocity back toward the wall, and the car stayed
                   stuck however the driver steered. Now each touching wall gives its
                   contact normal and depth (SAT): the car is moved out along it, the
                   speed going into the wall bounces back (WALL_BOUNCE_FACTOR) and the
                   speed along it scrapes (WALL_SLIDE_FRICTION). Speed already leaving
                   the wall is left alone, so the driver can always pull away. */
                const solids = env.solids || [];
                if (player && car._crunchCd > 0) car._crunchCd--;
                const vx0 = car.vx, vy0 = car.vy;
                car.x = nextX;
                car.y = nextY;
                let collided = false;
                for (let pass = 0; pass < 4; pass++) {
                    const c = vehicleKit.wallContact(car, solids);
                    if (!c) break;
                    collided = true;
                    // Where the car meets the wall (a corner, usually): the push lands there, so it turns the car too
                    const [px, py] = shapeKit.boxContactPoint(car, c.obb, c.nx, c.ny);
                    car.x += c.nx * (c.depth + 0.01);
                    car.y += c.ny * (c.depth + 0.01);
                    const B = vehicleKit.body(car, true, VD);
                    if (shapeKit.impulseAt(B, vehicleKit.body(c.obb, false, VD), px + c.nx * c.depth, py + c.ny * c.depth,
                                                c.nx, c.ny, -(env.wallBounce ?? 0.3), env.wallMu ?? 0.3)) vehicleKit.store(car, B, VD);
                }
                if (collided) {
                    // Re-derive forward speed from the corrected velocity so the
                    // HUD, engine audio and skid logic agree with what the car is
                    // actually doing after the impact.
                    car.speed = car.vx * fwdX + car.vy * fwdY;
                    if (player && car.onImpact) car.onImpact(Math.hypot(car.vx - vx0, car.vy - vy0));
                }
                return collided;
            },

            /** The deepest solid the car overlaps where it stands: { nx, ny, depth, obb }, the normal pointing out of
             *  the solid (SAT), or null when it's clear */
            wallContact(car, solids) {
                const obb = { x: car.x, y: car.y, angle: car.angle, length: car.length, width: car.width };
                const r = Math.hypot(car.length, car.width) / 2;
                const bounds = { left: car.x - r, right: car.x + r, top: car.y - r, bottom: car.y + r };
                let best = null;
                for (const list of solids) {
                    const candidates = _physicsSpatial.query(list, bounds);
                    if (!candidates) continue;
                    for (const w of candidates) {
                        if (car.x + r < w.x || car.x - r > w.x + w.w || car.y + r < w.y || car.y - r > w.y + w.h) continue;
                        const wo = shapeKit.rectToObb(w);
                        const c = shapeKit.sat(obb, wo);
                        if (c && (!best || c.depth > best.depth)) { best = c; c.obb = wo; }
                    }
                }
                return best;
            },

            /** Would the car stand clear of every solid at (x, y) facing angle? */
            fits(car, x, y, angle, solids) {
                const obb = { x, y, angle, length: car.length, width: car.width };
                const r = Math.hypot(car.length, car.width) / 2;   // reaches the corners at any angle
                const bounds = { left: x - r, right: x + r, top: y - r, bottom: y + r };
                for (const list of solids) {
                    const candidates = _physicsSpatial.query(list, bounds);
                    if (!candidates) continue;
                    for (const w of candidates) {
                        if (x + r < w.x || x - r > w.x + w.w || y + r < w.y || y - r > w.y + w.h) continue;
                        if (shapeKit.sat(obb, shapeKit.rectToObb(w))) return false;
                    }
                }
                return true;
            },

            /** A car nobody drives that's been hit: it slides and turns on locked wheels until it stops (out of any solid).
             *  Locked wheels grip before they slide: each tick takes a fixed bite off the speed and spin (so a brush
             *  barely moves it) and then a share of what's left. */
            settle(car, solids, VD) {
                const k = VD.PARKED_SCRUB;
                const sp = Math.hypot(car.vx || 0, car.vy || 0), keep = sp > VD.PARKED_HOLD ? (sp - VD.PARKED_HOLD) / sp * k : 0;
                car.vx = (car.vx || 0) * keep; car.vy = (car.vy || 0) * keep;
                const sn = car.spin || 0;
                car.spin = Math.abs(sn) > VD.PARKED_HOLD_SPIN ? (sn - Math.sign(sn) * VD.PARKED_HOLD_SPIN) * k : 0;
                car.x += car.vx; car.y += car.vy; car.angle += car.spin;
                for (let pass = 0; pass < 3; pass++) {
                    const c = vehicleKit.wallContact(car, solids);
                    if (!c) break;
                    car.x += c.nx * (c.depth + 0.01); car.y += c.ny * (c.depth + 0.01);
                    const vn = car.vx * c.nx + car.vy * c.ny;
                    if (vn < 0) { car.vx -= vn * c.nx; car.vy -= vn * c.ny; }
                }
            },

            /** How fast a car is turning (rad/tick): yawRate under the tyre model, else the spin from a knock */
            spinOf(c) { return c.tyreModel ? (c.yawRate || 0) : (c.spin || 0); },
            setSpin(c, w, VD) {
                const M = VD.YAW_SPIN_MAX;
                w = Math.max(-M, Math.min(M, w));
                if (c.tyreModel) c.yawRate = w; else c.spin = w;
            },

            /** A car as a rigid body for shapeKit.impulseAt (live: whether it can move at all) */
            body(c, live, VD) {
                if (!live) return { invM: 0, invI: 0, x: c.x, y: c.y, vx: 0, vy: 0, w: 0 };
                const m = c.mass || 1000, spins = !!(c.drives && c.length);
                const L = c.length || 60, W = c.width || 30;
                const hasV = c.vx !== undefined;
                const vx = hasV ? c.vx : Math.cos(c.angle || 0) * (c.speed || 0), vy = hasV ? c.vy : Math.sin(c.angle || 0) * (c.speed || 0);
                return { invM: 1 / m, invI: spins ? 1 / (m * (L * L + W * W) / 12 * VD.SPIN_INERTIA) : 0,
                         x: c.x, y: c.y, vx, vy, w: spins ? vehicleKit.spinOf(c) : 0 };
            },
            /** Write a body's new velocity and turn back onto its car */
            store(c, B, VD) {
                if (c.vx !== undefined) {
                    c.vx = B.vx; c.vy = B.vy;
                    c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
                } else if (c.speed !== undefined) c.speed = B.vx * Math.cos(c.angle || 0) + B.vy * Math.sin(c.angle || 0);
                if (B.invI > 0) vehicleKit.setSpin(c, B.w, VD);
            },

            /**
             * Two cars (or a car and something immovable: isStatic, or mass Infinity) touching along normal (nx, ny),
             * pointing from c2 to c1, overlapping by depth. Pushes them apart by mass, then resolves the hit as rigid
             * bodies at the point where they meet (impulseAt): the closing speed comes out with a little bounce and some
             * scrub, and each car turns by where it was struck. A soft nudge (under KNOCK_MIN_HIT) between two cars
             * without the tyre model doesn't spin them. A car with the tyre model is told (onImpact) how hard it was hit.
             */
            carContact(c1, c2, nx, ny, depth, VD) {
                const m1 = c1.isStatic ? Infinity : (c1.mass || 1000), m2 = c2.isStatic ? Infinity : (c2.mass || 1000);
                const w1 = isFinite(m1) ? (isFinite(m2) ? m2 / (m1 + m2) : 1) : 0;
                const w2 = isFinite(m2) ? (isFinite(m1) ? m1 / (m1 + m2) : 1) : 0;
                const [px, py] = shapeKit.boxContactPoint(c1, c2, nx, ny);
                c1.x += nx * depth * w1; c1.y += ny * depth * w1;
                c2.x -= nx * depth * w2; c2.y -= ny * depth * w2;
                c1._lastImpact = c2._lastImpact = 0;
                const B1 = vehicleKit.body(c1, w1 > 0, VD), B2 = vehicleKit.body(c2, w2 > 0, VD);
                const v1x = B1.vx, v1y = B1.vy, v2x = B2.vx, v2y = B2.vy;
                const hit = shapeKit.impulseAt(B1, B2, px + nx * depth * w1, py + ny * depth * w1, nx, ny, 0.2, 0.3);
                if (!hit) return;                                      // already separating
                if (hit < VD.KNOCK_MIN_HIT && !c1.tyreModel && !c2.tyreModel) B1.invI = B2.invI = 0;
                if (w1 > 0) vehicleKit.store(c1, B1, VD);
                if (w2 > 0) vehicleKit.store(c2, B2, VD);
                c1._lastContact = c2; c2._lastContact = c1;
                c1._lastImpact = c2._lastImpact = hit;
                if (w1 > 0 && c1.tyreModel && c1.onImpact) c1.onImpact(Math.hypot(B1.vx - v1x, B1.vy - v1y));
                if (w2 > 0 && c2.tyreModel && c2.onImpact) c2.onImpact(Math.hypot(B2.vx - v2x, B2.vy - v2y));
                return hit;
            }
        };
