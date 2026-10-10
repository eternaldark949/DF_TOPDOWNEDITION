        // ============================================================================
        //  TRAFFIC AND PEOPLE — what a car does about someone on foot in the road
        // ============================================================================
        //  TrafficManager lists everyone on foot each tick (949, her crew, the street's walkers) as `folk`, with
        //  how each is moving (_tvx/_tvy: measured, since nobody on foot keeps a velocity a car could read). A
        //  car reads the ones out on the carriageway ahead (_readFolk) for what they're doing, not just where:
        //    crossing — moving into or across our path, and still in it when we'd get there: brake to stop short
        //               and let them cross; go as soon as they'll be clear by the time we arrive
        //    standing — in the path and staying (still, or walking along the lane): stop back far enough to pull
        //               out, pause, then go round (a lane change, else the oncoming lane). At the edge of the path
        //               a step aside within the lane is enough (sideStep)
        //    beside   — near the path, not in it: pass no faster than the room allows (_passSpeed: under 4, where
        //               a knock hurts, when it's tight)
        //  The wait behind someone standing climbs a ladder (_folkLadder): the horn, going round, a squeeze by on
        //  the far side, backing up a little to try again. Each car's temper sets how far back it stops, how long
        //  it waits, how fast it passes and how soon it sounds the horn: calm, normal, or pushy (the gangers' cars).
        //  A parked car in the lane (traffic-vehicle.js) backs up the same way when it's too close to pull out.

        const TRAFFIC_TEMPERS = {
            // gap: stop this far short of someone crossing   pull: of someone standing (room to pull out round them)
            // swing: × the sideways shift it needs, in room to pull out (how sharply it pulls round)
            // pause: ticks stopped before going round        honk, rehonk: the horn (and again every rehonk ticks)
            // pass: × the speed it goes by people at         kerb: ticks before squeezing by on the far side
            // backUp: ticks stuck before backing up to try again   take: × the gap it wants to pull into a moving lane
            //   (or to turn left across: traffic-signals.js)   amber: the share of its full brake it'll use to stop for one
            calm:   { gap: 32, pull: 72, swing: 1.85, pause: 45, honk: 300, rehonk: 0,   pass: 0.85, kerb: 600, backUp: 480, take: 1.25, amber: 1 },
            normal: { gap: 22, pull: 66, swing: 1.7,  pause: 22, honk: 150, rehonk: 0,   pass: 1,    kerb: 420, backUp: 330, take: 1,    amber: 0.75 },
            pushy:  { gap: 12, pull: 56, swing: 1.45, pause: 6,  honk: 40,  rehonk: 100, pass: 1.3,  kerb: 200, backUp: 220, take: 0.7,  amber: 0.45 },
        };

        Object.assign(TrafficVehicle.prototype, {
            /** How this car treats people in the road: anyone driving for her is calm, whatever the car */
            _temper() {
                if (this.driverType === 'player' || this.driverType === 'zib') return TRAFFIC_TEMPERS.calm;
                return TRAFFIC_TEMPERS[this.temper] || TRAFFIC_TEMPERS.normal;
            },

            /** The fastest we go by someone with `room` px between our side and them */
            _passSpeed(room) {
                return Math.min(this.maxSpeed, (2.4 + Math.max(0, room) * 0.13) * this._temper().pass);
            },

            /** Out on the road surface, not the pavement: within our road's carriageway (its junctions included), or
             *  within reach of our own body where it's strayed over the kerb */
            _onCarriageway(x, y) {
                const lane = this.currentLane || (this.currentTurnPath && this.currentTurnPath.toLane), road = lane && lane.road;
                if (!road || !road.thickness) return true;
                const mine = Math.abs(road.worldToParam(this.x, this.y).lateral) + this.width / 2 + 18;
                return Math.abs(road.worldToParam(x, y).lateral) < Math.max(road.thickness / 2, mine);
            },

            /**
             * What the people out on the road ahead mean for us this tick. Returns a plan (reused): `cap`, the speed
             * the passing room allows; `block`, the nearest one we have to stop for (`stopCap` brings us to rest
             * short of them; `front`, our bumper to them; `lat`, across from us; `laneLat`, across from our lane's
             * line; `crossing`, or standing); `sideStep`, px off our lane's line to pass someone at its edge (held
             * till we're by them). Mid lane change (`tl`), only people in the lane we're moving into, or right on our
             * bumper, can block us.
             */
            _readFolk(folk, range, tl) {
                const plan = this._folkPlan || (this._folkPlan = {});
                plan.cap = plan.stopCap = Infinity; plan.block = null; plan.front = Infinity; plan.lat = plan.laneLat = 0; plan.rad = 12;
                plan.crossing = false; plan.sideStep = 0;
                if (!folk || !folk.length) return plan;
                const T = this._temper(), fx = Math.cos(this.angle), fy = Math.sin(this.angle);
                const half = this.width / 2, L = this.length, b = (this.brake || 0.3) * 0.8;
                const v = Math.max(Math.abs(this.speed), 2.5);             // the speed we'd reach them at (or pull away at)
                const ln = this.currentLane, myOff = ln ? this._latTo(ln) : 0;
                const stepRoom = (ln && ln.road && ln.road.laneWidth ? ln.road.laneWidth / 2 : 30) - half + 4;   // a shift that stays (mostly) in our lane
                let step = 0, best = Infinity;
                // A step aside from our lane's line for someone at its edge; false if it would take more than the lane
                // gives (or than a squeeze already under way), or the other way from a step taken for someone else
                const stepFor = (laneLat, rad, squeezing) => {
                    if (!ln || tl) return false;
                    const need = half + rad + 6 - Math.abs(laneLat), dir = laneLat > 0 ? -1 : 1;
                    if (need <= 0) return true;
                    const limit = squeezing && Math.sign(myOff) === dir && Math.abs(myOff) > stepRoom - 2 ? half + 18 : stepRoom;
                    if (need > limit || (step && Math.sign(step) !== dir)) return false;
                    if (need > Math.abs(step)) step = dir * need;
                    return true;
                };
                for (const p of folk) {
                    if (!p || p.dead) continue;
                    const dx = p.x - this.x, dy = p.y - this.y;
                    if (dx > range || dx < -range || dy > range || dy < -range) continue;
                    const rad = p.radius || 12, along = dx * fx + dy * fy;
                    if (along < -L / 2 - rad || along > range) continue;      // gone by, or too far ahead to matter yet
                    const lat = -dx * fy + dy * fx, room = Math.abs(lat) - half - rad;
                    if (room > 60 || !this._onCarriageway(p.x, p.y)) continue;   // well clear, or on the pavement
                    const front = along - L / 2 - rad;                           // our front bumper to them (− once alongside)
                    const laneLat = ln ? (p.x - ln.start.x) * -ln.uy + (p.y - ln.start.y) * ln.ux : lat;
                    // Going by: no faster than the room allows, braking for it in time
                    const pass = this._passSpeed(room);
                    plan.cap = Math.min(plan.cap, front > 0 ? Math.sqrt(pass * pass + 2 * b * front) : pass);
                    if (front < -4) { stepFor(laneLat, rad, true); continue; }  // alongside: hold the step that keeps us clear till we're by
                    if (tl && front > 6 && Math.abs((p.x - tl.start.x) * -tl.uy + (p.y - tl.start.y) * tl.ux) > half + rad + 3) continue;
                    // Will they be in our path while we go by? Our body sweeps |lat| < band (a touch is 17 px off the body: 949
                    // in traffic, engine/update.js), over them from tF to tR
                    const band = half + rad + 6, vx = p._tvx || 0, vy = p._tvy || 0;
                    const vAl = vx * fx + vy * fy, vLat = -vx * fy + vy * fx;
                    const close = Math.max(0.8, v - vAl), tF = Math.max(0, front) / close, tR = (Math.max(0, front) + L + 2 * rad) / close;
                    let tIn = 0, tOut = Infinity;
                    if (Math.abs(vLat) < 0.2) { if (Math.abs(lat) >= band) continue; }
                    else { const wide = band + 8, e1 = (-wide - lat) / vLat, e2 = (wide - lat) / vLat; tIn = Math.max(0, Math.min(e1, e2)); tOut = Math.max(e1, e2); }   // (crossing: a wider berth)
                    // Clear before we get there (with the time our stopping gap takes to spare), or not in till we've gone by
                    if (tOut < tF - (T.gap + 10) / close || tIn > tR + 10) continue;
                    const crossing = Math.abs(vLat) >= 0.2 && vx * vx + vy * vy > 0.12;
                    if (!crossing && stepFor(laneLat, rad, false)) continue;   // standing at the edge of our path: a step aside gets us by
                    const stop = front - (crossing ? T.gap : T.pull);
                    if (stop < best) { best = stop; plan.block = p; plan.front = front; plan.lat = lat; plan.laneLat = laneLat; plan.rad = rad; plan.crossing = crossing; }
                }
                if (plan.block) plan.stopCap = Math.sqrt(2 * b * Math.max(0, best));
                else plan.sideStep = step;
                return plan;
            },

            /**
             * Someone in our path: the wait, and what it leads to. Counts the ticks held up, sounds the horn, and
             * says what to do now: null (hold back: they're crossing, or it's too soon), 'round' (pull out round
             * them: section 3 of updateAIDriving), or 'kerb' (squeeze by on the far side, crawling: sideStep and
             * cap are set on the plan). Stuck past patience with no way round, it backs up a little to try again
             * (twice per hold-up, then it just waits; _goRound backs up too, when it's too close to pull out).
             */
            _folkLadder(plan, folk) {
                if (!plan.block) { this._folkWait = 0; this._folkBacks = 0; return null; }
                const T = this._temper(), w = this._folkWait = (this._folkWait || 0) + (Math.abs(this.speed) < (plan.crossing ? 0.5 : 2.5) ? 1 : 0);
                if (w === T.honk || (T.rehonk && w > T.honk && (w - T.honk) % T.rehonk === 0)) this._toot(T.rehonk ? 0.04 : 0.025);
                if (plan.crossing || w < T.pause || this.driverType === 'player' || this.driverType === 'zib') return null;
                if (this.laneChangeState !== 'NONE' || this.currentTurnPath) return null;
                if (w >= T.kerb) {
                    const half = this.width / 2, need = half + plan.rad + 6 - Math.abs(plan.laneLat), dir = plan.laneLat > 0 ? -1 : 1;
                    if (need < half + 18 && this._stripClear(dir, need, plan.front, folk)) {
                        plan.sideStep = dir * need; plan.stopCap = Infinity; plan.cap = Math.min(plan.cap, 1.6);
                        return 'kerb';
                    }
                }
                if (w >= T.backUp && (this._folkBacks || 0) < 2 && this._backUp(this.length * 0.8)) {
                    this._folkBacks = (this._folkBacks || 0) + 1; this._folkWait = T.pause;
                    return null;
                }
                return 'round';
            },

            /**
             * Pull out round someone standing in our path: into a clear lane beside ours (a lane change), else, after
             * a moment stopped, the oncoming lane beside us (an overtake), on a side where our body gets past them
             * before we reach them: away from them takes a short shift, across in front of them a long one. Too
             * close for any lane that's clear: back up to the room it needs (twice per hold-up at most).
             */
            _goRound(plan) {
                const T = this._temper(), band = this.width / 2 + plan.rad + 6, clearAhead = Math.max(150, plan.front + this.length * 1.5 + 30);
                const cur = this.currentLane;
                let want = 0;
                const tryLanes = (lanes, start) => {
                    for (const lane of lanes) {
                        if (!this.isLaneClear(lane, clearAhead)) continue;
                        // Which side of us it lies (by our lane's direction: an oncoming lane runs the other way), and theirs?
                        const right = (lane.start.x - this.x) * -cur.uy + (lane.start.y - this.y) * cur.ux > 0, theirs = right ? plan.lat > 6 : plan.lat < -6;
                        const need = theirs ? (band + Math.abs(plan.lat)) * T.swing * 1.6 : (band - Math.abs(plan.lat)) * T.swing;
                        if (plan.front >= need - 8) { start(lane); return true; }
                        want = want ? Math.min(want, need) : need;
                    }
                    return false;
                };
                if (tryLanes(this._sideLanes(false), lane => this.initiateNormalLaneChange(lane))) return;
                if (Math.abs(this.speed) < 0.5 && ++this.stuckTimer > 30 && this.currentLane.road.symmetrical) {
                    if (tryLanes(this._sideLanes(true).slice(0, 1), lane => this.initiateOvertake(lane))) { this.stuckTimer = 0; return; }
                }
                if (want && (this._folkBacks || 0) < 2 && this._backUp(want - plan.front + 6)) this._folkBacks = (this._folkBacks || 0) + 1;
            },

            /** The horn, if it's near enough to hear */
            _toot(v) {
                if (typeof ambience === 'undefined' || !ambience.ready || !ambience._horn || typeof game === 'undefined' || !game.player) return;
                if (Math.hypot(this.x - game.player.x, this.y - game.player.y) < 700) ambience._horn(v);
            },

            /**
             * Back up `dist` px, straight, slowly (a few ticks of reverse: _reverseLeft, run in updateAIDriving),
             * if there's room behind us: no car, and nobody on foot, in the strip we'd reverse into.
             */
            _backUp(dist) {
                if (this._reverseLeft > 0) return true;
                const fx = Math.cos(this.angle), fy = Math.sin(this.angle), half = this.width / 2, L = this.length;
                const reach = L / 2 + dist + 14;
                const blocked = (x, y, hw, hl) => {
                    const dx = x - this.x, dy = y - this.y, along = dx * fx + dy * fy, lat = -dx * fy + dy * fx;
                    return along < -L / 2 + 6 + hl && along > -reach - hl && Math.abs(lat) < half + hw + 4;
                };
                const cars = (this._allVehicles || []).concat(this._playerCar ? [this._playerCar] : []);
                for (const c of cars) if (c && c !== this && !c.dead && c.visible !== false && blocked(c.x, c.y, (c.width || 40) / 2, (c.length || 70) / 2)) return false;
                for (const p of this._folk || []) if (p && !p.dead && blocked(p.x, p.y, p.radius || 12, p.radius || 12)) return false;
                this._reverseLeft = Math.ceil(dist / 1.4) + 12;            // ~1.4 px a tick once rolling, and a few to get going
                this._reverseFrom = { x: this.x, y: this.y, dist };
                return true;
            },

            /** Reversing (from _backUp): ease back at a crawl until we've gone far enough, then stop. Overrides the pedals. */
            _reverseStep() {
                const r = this._reverseFrom;
                if (!(this._reverseLeft > 0) || !r) return false;
                this._reverseLeft--;
                if (Math.hypot(this.x - r.x, this.y - r.y) >= r.dist || this._reverseLeft <= 0) {
                    this._reverseLeft = 0; this._reverseFrom = null;
                    return false;
                }
                this.manualGas = this.speed > -1.4 ? -0.45 : 0.1;
                this.manualTurn = 0;
                return true;
            },

            /**
             * The last resort round someone standing: the strip our body would cross shifting `need` px to side `dir`
             * (−1 left, +1 right) from just behind us to past them is empty — of people, and of cars (parked there, or
             * coming up behind it).
             */
            _stripClear(dir, need, front, folk) {
                const fx = Math.cos(this.angle), fy = Math.sin(this.angle), half = this.width / 2, L = this.length;
                const passLat = dir * need, reach = L / 2 + Math.max(0, front) + L * 1.5;
                for (const p of folk || []) {
                    if (!p || p.dead) continue;
                    const dx = p.x - this.x, dy = p.y - this.y, along = dx * fx + dy * fy, lat = -dx * fy + dy * fx;
                    if (p !== this._folkPlan.block && along > -L / 2 && along < reach && Math.abs(lat - passLat) < half + (p.radius || 12) + 2) return false;
                }
                const cars = (this._allVehicles || []).concat(this._playerCar ? [this._playerCar] : []);
                for (const c of cars) {
                    if (!c || c === this || c.dead || c.visible === false) continue;
                    const dx = c.x - this.x, dy = c.y - this.y, along = dx * fx + dy * fy, lat = -dx * fy + dy * fx;
                    if (Math.abs(lat - passLat) > half + c.width / 2 + 4) continue;
                    const closing = Math.max(0, (c.vx || 0) * fx + (c.vy || 0) * fy);
                    if (along < reach + c.length / 2 && along > -(L + c.length / 2 + closing * 40 + 20)) return false;
                }
                return true;
            },

            /** Someone on foot standing in `lane` from just behind us to `ahead` px on (for isLaneClear) */
            _folkInLane(lane, ahead) {
                const folk = this._folk;
                if (!folk || !folk.length || !lane.start) return false;
                const ux = (this.currentLane || lane).ux, uy = (this.currentLane || lane).uy, half = (lane.road && lane.road.laneWidth || 60) / 2;
                for (const p of folk) {
                    if (!p || p.dead) continue;
                    const dx = p.x - this.x, dy = p.y - this.y, along = dx * ux + dy * uy;
                    if (along < -this.length || along > ahead) continue;
                    if (Math.abs((p.x - lane.start.x) * -lane.uy + (p.y - lane.start.y) * lane.ux) < half + (p.radius || 12) - 4) return true;
                }
                return false;
            },
        });
