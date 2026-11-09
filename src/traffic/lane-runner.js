        // ===== TRAFFIC: LANE RUNNERS =====
        // An ordinary AI car on its way is a LANE RUNNER: where it is is just the lane or junction turn it's on and how far
        // along (`_rs`), and its speed. Position and heading are read off the rail (basement/lane-rail-kit.js); the car ahead
        // is the next runner on the same rail, or the last on the one after (TrafficManager keeps them in order: `_rails`);
        // speed follows the same rules the full driver keeps (stop behind the car ahead by stopping distance, slow for the
        // turn and the box, stop on the line, ask the junction and its lights) with the same pedals and drag, so it moves as
        // it did. No sensing tunnel, no tyre physics, no walls: a car on its lane can't reach one.
        //
        // The slide through a turn is kept as it looked: the tail steps out by a sideways speed built from the bend and the
        // speed (`RUNNER.SLIDE_PER_ACC` × v²·k, eased), the nose turned in by as much, so tyre marks and smoke fall where they did.
        //
        // Anything a runner doesn't handle hands it to the full driver (`_runnerOff`, the car becomes a BODY: the old
        // updateAIDriving, physics and all): touched or pushed by anything (a crash, a shot, people), someone on foot or a
        // parked car in its way, stuck behind a car that isn't moving, or a driver that isn't traffic's. A body back on its
        // lane, lined up and calm for `RUNNER.CALM_TICKS`, runs on rails again (`_runnerOn`).
        const RUNNER = CONFIG.TRAFFIC_RUNNER;

        Object.assign(TrafficVehicle.prototype, {
            /** Could this car run on rails at all (ordinary traffic, driven by traffic's AI)? */
            _runnerEligible() {
                return RUNNER.ON && this.controlMode === 'AI' && !this.isZib && !this._driveRoute && this.driverType !== 'player' &&
                    this.driverType !== 'zib' && !this.isOwnedCar && !this.isDeliveryVehicle && !this.dead;
            },

            /** The rail it's on: its turn path's sampled table, or its lane */
            _rail() {
                const tp = this.currentTurnPath;
                if (!tp) return this.currentLane;
                return tp._rail || (tp._rail = railKit.table(t => tp.getPoint(t), t => tp.getAngle(t), RUNNER.CURVE_SAMPLES));
            },
            _railLength() { return this.currentTurnPath ? this._rail().length : this.currentLane.length; },

            /** Put the car where s says on its rail (heading, and the turn's slide) */
            _placeOnRail() {
                const P = this._railAt || (this._railAt = { x: 0, y: 0, a: 0, k: 0 }), s = this._rs;
                if (this.currentTurnPath) railKit.at(this._rail(), s, P);
                else { const ln = this.currentLane; P.x = ln.start.x + ln.ux * s; P.y = ln.start.y + ln.uy * s; P.a = ln.angle; P.k = 0; }
                const v = this.speed;
                // the slide: outward from the bend, built from the sideways pull (v²·k) and eased in and out
                const want = Math.max(-RUNNER.SLIDE_MAX, Math.min(RUNNER.SLIDE_MAX, -RUNNER.SLIDE_PER_ACC * v * v * P.k));
                this._slide = (this._slide || 0) + (want - (this._slide || 0)) * RUNNER.SLIDE_EASE;
                const slip = Math.asin(Math.max(-RUNNER.SLIP_MAX, Math.min(RUNNER.SLIP_MAX, this._slide / Math.max(0.5, Math.abs(v)))));
                // joining from the full driver: whatever it was off the line eases away, not snapped
                const lat = this._joinLat || 0, yaw = this._joinYaw || 0;
                this.x = P.x - Math.sin(P.a) * lat; this.y = P.y + Math.cos(P.a) * lat;
                this.angle = P.a - slip + yaw;
                if (lat || yaw) { this._joinLat = Math.abs(lat) < 0.05 ? 0 : lat * 0.9; this._joinYaw = Math.abs(yaw) < 0.002 ? 0 : yaw * 0.9; }
                // what the rest of the world reads: travel along the rail (the slide across the car follows from it)
                this.vx = Math.cos(P.a) * v; this.vy = Math.sin(P.a) * v;
                this.steer = (this.steer || 0) + (Math.max(-1, Math.min(1, P.k * 40)) - (this.steer || 0)) * 0.2;   // the drawn front wheels
                this.yawRate = 0; this.spin = 0;
                this._rx = this.x; this._ry = this.y; this._ra = this.angle;
            },

            /** From the full driver onto rails: if it's on a lane (or a turn), lined up, and nothing has bothered it lately */
            _runnerOn(R) {
                if (!this._runnerEligible()) { this._calm = 0; return false; }
                if (this._runnerHold > 0) { this._runnerHold--; this._calm = 0; return false; }   // just left to go round something
                const ln = this.currentLane, tp = this.currentTurnPath;
                let ok = this.laneChangeState === 'NONE' && Math.abs(this.spin || 0) < 0.002 && !(this._reverseLeft > 0) && !this._stuckRecovery;
                let s = 0;
                if (ok && tp) ok = false;                                   // (joins on the lane after its turn)
                if (ok && ln) {
                    s = (this.x - ln.start.x) * ln.ux + (this.y - ln.start.y) * ln.uy;
                    const lat = (this.x - ln.start.x) * -ln.uy + (this.y - ln.start.y) * ln.ux;
                    const da = Math.abs(Math.atan2(Math.sin(this.angle - ln.angle), Math.cos(this.angle - ln.angle)));
                    const slide = Math.abs((this.vx || 0) * -Math.sin(this.angle) + (this.vy || 0) * Math.cos(this.angle));
                    ok = s >= 0 && s <= ln.length && Math.abs(lat) < RUNNER.JOIN_LAT && da < RUNNER.JOIN_ANGLE && slide < 0.3;
                } else ok = false;
                this._calm = ok ? (this._calm || 0) + 1 : 0;
                if (this._calm < RUNNER.CALM_TICKS) return false;
                // whatever sent it off (someone on foot, a parked car) must be out of the way now
                if (R) {
                    const v = Math.max(0, this.speed || 0), b = this.brake || 0.3;
                    this._rs = s; this._runnerTrouble = null;
                    this._runnerLeader(R, RUNNER.LOOK_BASE + this.length + v * v / (2 * b) + v * RUNNER.LOOK_PER_SPEED);
                    if (this._runnerTrouble) { this._calm = 0; return false; }
                }
                this.runner = true; this._calm = 0; this._rs = s; this._slide = 0;
                this._joinLat = (this.x - ln.start.x) * -ln.uy + (this.y - ln.start.y) * ln.ux;
                this._joinYaw = Math.atan2(Math.sin(this.angle - ln.angle), Math.cos(this.angle - ln.angle));
                this.speed = Math.max(0, this.speed || 0);
                this._placeOnRail();
                return true;
            },

            /** Off rails: the full driver takes it from here, rolling on at the speed and heading it has */
            _runnerOff(why) {
                if (!this.runner) return;
                this.runner = false; this._calm = 0; this._runnerWhy = why;
                if (why === 'stuck') this._runnerHold = RUNNER.STUCK_TICKS * 2;
                this.manualGas = 0; this.manualTurn = 0;
            },

            /**
             * One tick on rails. R: what the manager gathered this tick: { rails (rail → its runners by s), extra (her car when
             * it isn't among traffic's), folk (people on foot, grid in sensing.people), sensing (its cars grid), all (every
             * car traffic sees) }.
             */
            runnerStep(R, weather, decalSystem) {
                // Moved by something else since we put it there (a hit, a shot, someone shoving): it's a body now
                if (this.x !== this._rx || this.y !== this._ry || this.angle !== this._ra || !this._runnerEligible()) { this._runnerOff('moved'); return false; }
                if (!this.currentLane && !this.currentTurnPath) { this.dead = true; return true; }
                this._allVehicles = R.all;
                this._runnerTrouble = null;
                const v = Math.max(0, this.speed || 0), b = this.brake || 0.3;
                const look = RUNNER.LOOK_BASE + this.length + v * v / (2 * b) + v * RUNNER.LOOK_PER_SPEED;

                // --- THE JUNCTION AHEAD (and the lights) ---
                let target = this.maxSpeed, stopCap = Infinity;
                const ln = this.currentLane;
                if (ln) {
                    if (ln.turnPaths && ln.turnPaths.length && !this.plannedTurn) this.updateTurnPlanning();
                    target = Math.min(target, this._runnerJunction(v, b));
                    if (this._runnerStop !== undefined) stopCap = this._runnerStop;
                    if (this.plannedTurn) target = Math.min(target, this._turnAhead(this.plannedTurn));
                    if (ln.road && ln.road.isCurved) {
                        const Rb = this._bendAhead(ln, this._rs, 60 + v * 22);
                        if (Rb < Infinity) target = Math.min(target, Math.max(2.5, Math.sqrt(0.16 * Rb)));
                    }
                } else {
                    // in a turn through the box: as fast as the rest of the curve allows, never over 70%
                    const tp = this.currentTurnPath;
                    this._runnerInBox();
                    target = Math.min(target, this.maxSpeed * 0.70, this._turnSpeed(tp, this._rs / Math.max(1, this._rail().length)));
                }

                // --- WHO'S AHEAD ---
                const lead = this._runnerLeader(R, look);
                if (this._runnerTrouble) { this._runnerOff(this._runnerTrouble); return false; }
                let follow = Infinity;
                if (lead) {
                    const minGap = 12 + this.length * 0.18;
                    follow = railKit.followCap(lead.gap, v, lead.v, b, lead.car.brake, minGap);
                    // stopped behind something that isn't going to move (or a runner across our way, which may be waiting
                    // on us): the full driver goes round it
                    if (v < 0.3 && Math.abs(lead.v) < 0.3 && (!lead.car.runner || lead.cross) && !this.isWaiting) {
                        this._runnerWait = (this._runnerWait || 0) + 1;
                        if (this._runnerWait > RUNNER.STUCK_TICKS) { this._runnerWait = 0; this._runnerOff('stuck'); return false; }
                    } else this._runnerWait = 0;
                } else this._runnerWait = 0;
                target = Math.min(target, follow, stopCap);

                // --- PEDALS, ALONG THE RAIL ---
                const gas = railKit.throttle(v, target, b, 0.6);
                this.manualGas = gas; this.manualTurn = 0;
                const top = this.maxSpeed > 0 ? this.maxSpeed : 12.5, acc = this.acceleration > 0 ? this.acceleration : 0.5;
                let nv = Math.max(0, railKit.roll(v, gas, acc, b, top));
                if (Math.abs(nv) < 0.0005) nv = 0;
                this.speed = nv;
                this._rs += nv;
                this._runnerAdvance();
                if (this.dead) return true;
                this._placeOnRail();
                this._runnerEffects(weather, decalSystem);
                if (Math.abs(this.speed) < 0.1) this.idleTimer = (this.idleTimer || 0) + 1; else this.idleTimer = 0;
                this.stuckTimer = Math.abs(this.speed) < 0.3 ? (this.stuckTimer || 0) + 1 : 0;
                return true;
            },

            /** Past the end of its rail: onto the next (the planned turn, the lane round the bend, or out of the turn) */
            _runnerAdvance() {
                for (let hop = 0; hop < 24; hop++) {
                    const len = this._railLength();
                    if (this._rs < len) return;
                    const over = this._rs - len;
                    if (this.currentTurnPath) {
                        const tp = this.currentTurnPath, next = tp.toLane;
                        if (!next || !next.start) { this.dead = true; return; }
                        const end = tp.controlPoints[tp.controlPoints.length - 1];
                        this.currentLane = next; this.currentTurnPath = null; this.turnProgress = 0; this.turnSignal = null;
                        this._rs = Math.max(0, (end.x - next.start.x) * next.ux + (end.y - next.start.y) * next.uy) + over;
                        continue;
                    }
                    const ln = this.currentLane;
                    if (this.plannedTurn) {
                        this.currentTurnPath = this.plannedTurn; this.plannedTurn = null; this.currentLane = null;
                        this.turnProgress = 0; this._rs = over;
                        if (!this.wasInIntersection) { this.wasInIntersection = true; this.intersectionTimer = 0; }
                        continue;
                    }
                    if (ln.connections && ln.connections.length) { this.currentLane = ln.connections[0]; this._rs = over; continue; }
                    this._rs = len; this.speed = 0;                 // a dead end: it waits there for the manager to take it away
                    return;
                }
            },

            /** In the box on its turn: still the junction's; out once its tail has cleared it (on the lane after) */
            _runnerInBox() {
                const ix = this.currentIntersection;
                if (!ix) return;
                if (!this.wasInIntersection) { this.wasInIntersection = true; this.intersectionTimer = 0; }
                else this.intersectionTimer++;
            },

            /**
             * The junction ahead on the lane, as the full driver keeps it: show on its lights' gauge, claim the box only when
             * first in the lane with room on the way out, wait on the line without access, let go once the tail has cleared
             * it. Returns the speed the approach allows; `_runnerStop` the stop line's cap (undefined: none).
             */
            _runnerJunction(v, b) {
                this._runnerStop = undefined;
                let cap = this.maxSpeed;
                const ln = this.currentLane, my = this._rs;
                // leaving the one behind us: let go once the tail is out of it
                if (this.wasInIntersection && this.currentIntersection) {
                    const ix = this.currentIntersection;
                    const tail = my - this.length / 2;
                    if (tail > 0 || !ix.containsPoint(ln.start.x + ln.ux * Math.max(0, tail), ln.start.y + ln.uy * Math.max(0, tail))) {
                        ix.releaseEntry(this);
                        this.wasInIntersection = false; this.intersectionTimer = 0; this.isAggressive = false;
                        this.postIntersectionGraceTimer = 60; this.currentIntersection = null; this.hasIntersectionAccess = false;
                    } else return cap;
                }
                if (this.postIntersectionGraceTimer > 0) this.postIntersectionGraceTimer--;
                const icRange = 80 + this.length / 2 + v * v / (2 * b) + 80;
                let zone = null;
                for (const z of ln.intersectingZones || []) {
                    if (z.entryDist < 5) continue;
                    const d = z.entryDist - my;
                    if (d > -50) { zone = z; break; }
                }
                this._sigDist = null;
                if (!zone) { this._runnerClearJunction(); return cap; }
                const d = zone.entryDist - my, ix = zone.intersection;
                if (ix.signal && d < SIGNAL.SEE) { this._sigDist = d; ix.signal.note(this, d); }
                if (d >= icRange && this.currentIntersection !== ix) { this._runnerClearJunction(); return cap; }
                // first in its lane (with lights, behind one already let in), and room on the way out
                const notFirst = this._carAheadInLane(ix.signal ? ix : null) || this._exitBlocked();
                if (notFirst) { ix.releaseEntry(this); this.hasIntersectionAccess = false; }
                else this.hasIntersectionAccess = ix.requestEntry(this);
                this.currentIntersection = ix;
                const waiting = !this.hasIntersectionAccess;
                if (waiting && this.postIntersectionGraceTimer <= 0) {
                    const stopDistance = 75 + this.length / 2 + 5;
                    this._runnerStop = d - stopDistance < 2 ? 0 : Math.sqrt(2 * b * 0.8 * (d - stopDistance));
                } else if (d > 0 && d < 100) {
                    const low = ix.signal && this.plannedTurn && this.plannedTurn.turnType === 'straight' ? 0.85 : 0.6;
                    cap = Math.min(cap, this.maxSpeed * (low + (d / 100) * (1 - low)));
                }
                this.isWaiting = waiting;
                return cap;
            },
            _runnerClearJunction() {
                if (this.currentIntersection && !this.wasInIntersection) { this.currentIntersection.releaseEntry(this); this.currentIntersection = null; }
                this.hasIntersectionAccess = false; this.isWaiting = false;
            },

            /**
             * The nearest thing ahead along where it's going: { car, gap (bumper to bumper), v (its speed along), cross (a
             * runner on another rail) } or null. Runners from the rails' order; every other car near (hers, bodies, parked,
             * runners whose turns cross or join ours) and people on foot by where they stand against the path. A parked car or someone on foot in the way sets `_runnerTrouble` (the full driver's job).
             */
            _runnerLeader(R, look) {
                let best = null, bestGap = Infinity, bestV = 0;
                const half = this.length / 2;
                // 1. runners down the rails: the next past it on its own, else the last in on the ones it runs onto
                let rail = this.currentTurnPath || this.currentLane, ahead = -this._rs, first = true;
                for (let hop = 0; rail && ahead < look && hop < 6; hop++) {
                    const list = R.rails.get(rail);
                    if (list) for (let i = 0; i < list.length; i++) {
                        const o = list[i];
                        if (o === this || o.dead || (first && o._rs <= this._rs)) continue;
                        best = o; bestGap = ahead + o._rs - half - o.length / 2; bestV = o.speed || 0;
                        break;                                        // (in order along the rail: the first is the nearest)
                    }
                    if (best) break;
                    ahead += this._lenOf(rail);
                    rail = this._railAfter(rail, first); first = false;
                }
                // 2. every other car near enough (bodies, hers, parked, and runners on other rails: turns that cross
                // or merge with ours) against the path ahead
                const S = R.sensing, reach = look + 60, reach2 = reach * reach;
                const near = S && S.active && S.source === R.all
                    ? S.cars.query(this.x + Math.cos(this.angle) * look / 2, this.y + Math.sin(this.angle) * look / 2, look / 2 + 60)
                    : R.all;
                let cross = false;
                const seen = this._seen || (this._seen = { car: null, gap: Infinity, v: 0 });
                seen.car = null;
                for (const o of near) this._runnerSee(o, reach2, look);
                for (let i = 0; i < R.extra.length; i++) this._runnerSee(R.extra[i], reach2, look);   // her car, outside traffic's list
                if (this._runnerTrouble) return null;
                if (seen.car && seen.gap < bestGap) { best = seen.car; bestGap = seen.gap; bestV = seen.v; cross = seen.car.runner; }
                if (S && S.people && R.folk && R.folk.length) {
                    const near = S.people.query(this.x + Math.cos(this.angle) * look / 2, this.y + Math.sin(this.angle) * look / 2, look / 2 + 40 + (S.folkRad || 12));
                    for (const p of near) {
                        if (!p || p.dead) continue;
                        if (this._pathHit(p.x, p.y, this.width / 2 + (p.radius || 12) + RUNNER.FOLK_MARGIN, look + 40) === null) continue;
                        if (!this._onCarriageway(p.x, p.y)) continue;         // on the pavement: the full driver ignores them too
                        this._runnerTrouble = 'folk'; return null;
                    }
                }
                if (!best) return null;
                const out = this._leadOut || (this._leadOut = { car: null, gap: 0, v: 0, cross: false });
                out.car = best; out.gap = bestGap; out.v = bestV; out.cross = cross;
                return out;
            },

            /** One car near us: if it's on the path ahead and nearer than the nearest yet, it's the one (in `_seen`) */
            _runnerSee(o, reach2, look) {
                if (o === this || o.dead || o.visible === false || this._runnerTrouble) return;
                if (o.runner && (o.currentTurnPath || o.currentLane) === (this.currentTurnPath || this.currentLane)) return;  // (the rails had it)
                const dx = o.x - this.x, dy = o.y - this.y;
                if (dx * dx + dy * dy > reach2) return;
                const hit = this._pathHit(o.x, o.y, (this.width + (o.width || this.width)) / 2 + (o.runner ? 0 : 4), look);
                if (hit === null) return;
                const parked = o.controlMode === 'PARKED' || (!o.hasDriver && o.controlMode !== 'AI');
                if (parked) { this._runnerTrouble = 'parked'; return; }
                if (this.currentTurnPath && o.isWaiting && !o.wasInIntersection) return;   // queued at another way in
                const gap = hit - this.length / 2 - (o.length || 40) / 2;
                const seen = this._seen;
                if (seen.car && seen.gap <= gap) return;
                seen.car = o; seen.gap = gap;
                seen.v = o.vx !== undefined ? o.vx * Math.cos(this.angle) + o.vy * Math.sin(this.angle) : (o.speed || 0);
            },

            /** The rail after `rail` on the way it's going (its planned turn, the lane round the bend, a turn's lane out) */
            _railAfter(rail, mine) {
                if (rail.controlPoints) return rail.toLane || null;
                if (mine && this.plannedTurn) return this.plannedTurn;
                if (rail.connections && rail.connections.length && !(rail.turnPaths && rail.turnPaths.length)) return rail.connections[0];
                return null;
            },
            _lenOf(rail) { return rail.controlPoints ? this._tableOf(rail).length : rail.length; },
            _tableOf(tp) { return tp._rail || (tp._rail = railKit.table(t => tp.getPoint(t), t => tp.getAngle(t), RUNNER.CURVE_SAMPLES)); },

            /** How far along its path ahead (from its centre) the point (x, y) sits, if within `half` of the path and `look`
             *  of the car; null otherwise. The lane is a line; a turn its sampled curve. */
            _pathHit(x, y, half, look) {
                const dx = x - this.x, dy = y - this.y, far = look + half + this.length;
                if (dx * dx + dy * dy > far * far) return null;            // beyond anything the path ahead reaches
                let rail = this.currentTurnPath || this.currentLane, base = -this._rs, hops = 0, first = true;
                while (rail && hops < 4) {
                    if (rail.controlPoints) {
                        const T = this._tableOf(rail);
                        for (let i = 0; i < T.n; i++) {
                            const along = base + T.s[i];
                            if (along > look) return null;
                            if (first && T.s[i + 1] < this._rs) continue;
                            const ax = T.x[i], ay = T.y[i], L = T.s[i + 1] - T.s[i], reach = L + half;
                            const px = x - ax, py = y - ay;
                            if (px > reach || px < -reach || py > reach || py < -reach) continue;   // nowhere near this piece
                            const ex = T.x[i + 1] - ax, ey = T.y[i + 1] - ay, L2 = ex * ex + ey * ey || 1;
                            const t = Math.max(0, Math.min(1, (px * ex + py * ey) / L2));
                            const qx = px - ex * t, qy = py - ey * t;
                            const at = along + L * t;
                            if (qx * qx + qy * qy < half * half && at > 0 && at < look) return at;
                        }
                        base += T.length;
                    } else {
                        const along = (x - rail.start.x) * rail.ux + (y - rail.start.y) * rail.uy;
                        const lat = Math.abs((x - rail.start.x) * -rail.uy + (y - rail.start.y) * rail.ux);
                        const at = base + along;
                        if (lat < half && along >= -10 && along <= rail.length + 10 && at > 0 && at < look) return at;
                        base += rail.length;
                    }
                    if (base > look) return null;
                    rail = this._railAfter(rail, first); first = false; hops++;
                }
                return null;
            },

            /** Tyre marks, rain spray and smoke as the full driver throws them (the slide is the runner's) */
            _runnerEffects(weather, decalSystem) {
                this.applySkids(decalSystem);
                if (!weather || !weather.addSpray) return;
                const VD = CONFIG.VEHICLE_DRIVE, fwd = Math.abs(this.speed), slide = this._slide || 0;
                const rain = weather.isRaining ? Math.min(1, weather.getRainScale ? weather.getRainScale() : 1) : 0;
                const fx = Math.cos(this.angle), fy = Math.sin(this.angle), rx = -fy, ry = fx;
                const blX = this.x - this.length / 2 * fx + this.width / 2 * rx, blY = this.y - this.length / 2 * fy + this.width / 2 * ry;
                const brX = this.x - this.length / 2 * fx - this.width / 2 * rx, brY = this.y - this.length / 2 * fy - this.width / 2 * ry;
                if (rain && fwd > 2.0 && Math.random() < 0.7 * rain) {
                    const c = 'rgba(200, 200, 255, 0.4)', sp = fwd * 0.5;
                    weather.addSpray(blX, blY, this.angle + Math.PI, sp, c, 1.0, 1.0);
                    weather.addSpray(brX, brY, this.angle + Math.PI, sp, c, 1.0, 1.0);
                }
                if (Math.abs(slide) > VD.GRIP_SLIDE_THRESHOLD && Math.random() > 0.2) {
                    const c = 'rgba(30, 30, 30, 0.6)', sp = Math.abs(slide);
                    weather.addSpray(blX, blY, this.angle + Math.PI, sp, c, 20.0, 10.0);
                    weather.addSpray(brX, brY, this.angle + Math.PI, sp, c, 20.0, 10.0);
                }
            }
        });
