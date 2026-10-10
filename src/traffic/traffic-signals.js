        // ============================================================================
        //  JUNCTION LIGHTS — demand-gauged signals, one set per crossing of two roads
        // ============================================================================
        //  Nobody runs these lights on a clock. Every car on its way in (and anyone waiting at a crosswalk) adds to
        //  its road's demand gauge, and the lights follow the gauges:
        //    green  — rests on the road that has it while nobody waits on the other. Once someone does, it runs at
        //             least MIN_GREEN, then ends at the first gap in its own arrivals, or at its longest (longer the
        //             busier its own gauge; at once if the other road has waited too long)
        //    amber  — a car that can stop comfortably stops; one that can't goes on through (tempers draw that line
        //             differently: traffic-people.js `amber`)
        //    clear  — all red until the box is empty of the last cars through and nobody's still on the crosswalks
        //             of the road about to go (the junction watches itself clear), then the other road's green
        //  Within a green the road's cars go together: straight on and right turns roll through as their lane's queue
        //  moves, a car behind one that has the green may follow it in, left turns wait for a gap in what's coming the
        //  other way, and nobody enters across the path of a car already in the box (which turn paths cross is worked
        //  out once, from their shapes). People on foot cross the road that's red, only while its red has time left.
        //  Junctions without lights (other shapes, or with them switched off) keep Intersection's turn-taking queue.

        const SIGNAL = {
            ON: true,             // lights at every crossing of two roads (off: the old one-at-a-time queue)
            SEE: 480,             // how far out a car on its way in shows on the gauge (px to the box)
            MIN_GREEN: 90,        // ticks a green runs at least, once someone waits on the other road
            MAX_GREEN: 300,       // ...and at most, plus GREEN_PER for each unit of its own demand, up to MAX_BUSY
            GREEN_PER: 30, MAX_BUSY: 540,
            STARVED: 600,         // ticks a car may wait on red before its road's turn comes straight after MIN_GREEN
            AMBER: 45,
            CLEAR_MIN: 14, CLEAR_MAX: 240,
            WALK: 150,            // ticks from the start of a green that walkers may start across the red road, whatever's waiting
            CLEAR_WALK: 120,      // ticks the all-red waits for walkers still crossing (after that, the cars wait for them)
            STOP_BACK: 80,        // the stop line, px short of the box (behind the crosswalk: traffic-vehicle.js)
            CROSS: 46,            // two turn paths closer than this anywhere cross (centre to centre), plus each one's
            DRIFT: { straight: 6, turn: 34 },   // drift: how far cars stray off it mid-way (none at its ends)
            YIELD: 95,            // ticks of oncoming arrival a left turn won't cut across (× temper `take`)
        };

        class JunctionSignal {
            /** Lights for `ix` if it's a crossing of two roads with traffic in on both; else null (the queue). */
            static make(ix) {
                if (!SIGNAL.ON || !ix || ix.roads.length !== 2) return null;
                const sig = new JunctionSignal(ix);
                return sig.phases.every(p => p.gates.length) ? sig : null;
            }

            constructor(ix) {
                this.ix = ix;
                this.phases = ix.roads.map(road => ({ road, gates: ix.entryGates.filter(g => g.road === road) }));
                // Junctions start out of step with each other
                let h = 0; for (const ch of ix.id) h = h * 31 + ch.charCodeAt(0);
                this.cur = h & 1;                 // the phase (road) with the green, or the last to have it
                this.state = 'green';             // 'green' | 'amber' | 'clear'
                this.t = 0;                       // ticks in this state
                this.ending = false;              // green, and it may end at any gap now (walkers: don't start)
                this.noted = new Map();           // car → what the gauge knows of it (note)
                this.demand = [0, 0];             // per phase, this tick
                this.load = [0, 0, 0, 0];         // cars on the way in, per approach (phase × direction), smoothed: drawn
                this.walkers = [-1e9, -1e9];      // last tick someone was crossing each phase's road
                this.pedWait = [-1e9, -1e9];      // ...and waiting to cross it
                this._conf = new Map();           // turn path pair → do they cross
            }

            phaseOf(lane) {
                const r = lane && lane.road;
                return r === this.phases[0].road ? 0 : r === this.phases[1].road ? 1 : -1;
            }

            /** Approach index (for the gauge): phase × the lane's direction */
            static approach(p, lane) { return p * 2 + (lane.direction > 0 ? 0 : 1); }

            /** `v` is on its way in along `lane`, `dist` px (centre) from the box */
            note(v, dist, lane = v.currentLane) {
                const p = this.phaseOf(lane);
                if (p < 0) return;
                let n = this.noted.get(v);
                if (!n) this.noted.set(v, n = { tick: _simTick, phase: p, dist, speed: 0, wait: 0, path: null, lane });
                const speed = Math.abs(v.speed || 0);
                n.wait = speed < 0.6 ? n.wait + (_simTick - n.tick) : 0;
                n.tick = _simTick; n.phase = p; n.dist = dist; n.speed = speed; n.lane = lane;
                n.path = v.plannedTurn && v.plannedTurn.fromLane === lane ? v.plannedTurn : null;
            }

            /** May someone start across phase `p`'s road now? (it's red, and stays red a while) */
            walkOK(p) { return this.state === 'green' && this.cur !== p && (this.t < SIGNAL.WALK || !this.ending); }
            /** Someone waits to cross phase `p`'s road (asks for the other road's green), or is out on it */
            pedWaiting(p) { this.pedWait[p] = _simTick; }
            pedCrossing(p) { this.walkers[p] = _simTick; }

            update() {
                const now = _simTick, ix = this.ix, occ = ix.occupants;
                // Off the list: anyone gone, or who moved on without saying and isn't in the box
                for (let i = occ.length - 1; i >= 0; i--) {
                    const o = occ[i];
                    if (o.dead || o.markedForDestroy || (o.currentIntersection !== ix && !ix.isVehicleInside(o))) occ.splice(i, 1);
                }

                // The gauges
                const dem = this.demand, load = this.load, cnt = this._cnt || (this._cnt = [0, 0, 0, 0]);
                dem[0] = dem[1] = 0; cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0;
                let busy = false, starved = false;
                for (const [v, n] of this.noted) {
                    if (now - n.tick > 8 || v.dead || n.dist < -40) { this.noted.delete(v); continue; }
                    const stopped = n.speed < 0.6;
                    dem[n.phase] += stopped ? 1 + Math.min(3, n.wait / 240) : n.dist < 400 ? 0.7 : 0.35;
                    if (stopped || n.dist < 400) cnt[JunctionSignal.approach(n.phase, n.lane)]++;
                    if (n.phase === this.cur) { if (n.dist < 330 && (!stopped || n.wait < 90)) busy = true; }   // still using the green
                    else if (n.wait > SIGNAL.STARVED) starved = true;
                }
                for (let p = 0; p < 2; p++) if (now - this.pedWait[p] < 10) dem[1 - p] += 0.8;   // walkers ask for the other road
                for (let i = 0; i < 4; i++) load[i] += (cnt[i] - load[i]) * 0.12;

                this.t++;
                const other = 1 - this.cur;
                if (this.state === 'green') {
                    this.ending = dem[other] > 0 && this.t >= SIGNAL.MIN_GREEN;
                    const longest = Math.min(SIGNAL.MAX_BUSY, SIGNAL.MAX_GREEN + dem[this.cur] * SIGNAL.GREEN_PER);
                    if (this.ending && (!busy || starved || this.t >= longest)) { this.state = 'amber'; this.t = 0; }
                } else if (this.state === 'amber') {
                    if (this.t >= SIGNAL.AMBER) { this.state = 'clear'; this.t = 0; }
                } else if ((this.t >= SIGNAL.CLEAR_MIN && !occ.length && (now - this.walkers[other] > 5 || this.t >= SIGNAL.CLEAR_WALK)) || this.t >= SIGNAL.CLEAR_MAX) {
                    this.cur = other; this.state = 'green'; this.t = 0; this.ending = false;
                }
            }

            /** Could `v` stop at the line from here, braking no harder than its temper will for an amber? */
            _canStop(v) {
                const d = (v._sigDist == null ? Infinity : v._sigDist) - SIGNAL.STOP_BACK - v.length / 2;
                const s = Math.abs(v.speed || 0), k = v._temper ? v._temper().amber : 0.75;
                return d > -6 && s * s / (2 * (v.brake || 0.3) * k) <= d + 6;
            }

            /** Intersection.requestEntry with the lights on: may `v` go into the box (it's granted, an occupant)? */
            request(v) {
                const ix = this.ix, occ = ix.occupants, at = occ.indexOf(v);
                // In it (its nose over the edge, or on the way out with its tail still in): see it through, and be seen
                // in it (a car stopped with its nose in the box keeps it, so the cross traffic waits for it)
                if ((v.wasInIntersection && v.currentIntersection === ix) || ix.isVehicleInside(v) || v.currentTurnPath ||
                    (v._sigDist != null && v._sigDist - v.length / 2 < 4)) {
                    if (at === -1) { ix._grant(v); v._sigPath = v.currentTurnPath || v.plannedTurn; }
                    return true;
                }
                const lane = v.currentLane, p = this.phaseOf(lane);
                if (p < 0) return at !== -1;
                if (this.state === 'green' && p === this.cur) v._sigGo = v._sigStop = null;
                else {
                    // Amber, or red with a green already given: stop if it comfortably can, else go on through. Either
                    // way it sticks to it (one stopping doesn't change its mind as it gets close; once stopped, it
                    // stays stopped till its green)
                    if (v._sigGo === this && Math.abs(v.speed || 0) < 0.5) v._sigGo = null;
                    if (v._sigGo !== this) {
                        if (v._sigStop === this || p !== this.cur || this.state === 'clear' || this._canStop(v)) {
                            v._sigStop = this;
                            if (at !== -1) occ.splice(at, 1);
                            return false;
                        }
                        v._sigGo = this;
                    }
                }
                const path = v.plannedTurn && v.plannedTurn.fromLane === lane ? v.plannedTurn : null;
                if (at !== -1) {
                    // Let in, not there yet: if the way out has filled up since, and it can still stop at the line, it
                    // waits there (rather than creeping into the box behind the queue and standing in it)
                    if (path && !this._exitRoom(v, path.toLane, at) && this._canStop(v)) { occ.splice(at, 1); return false; }
                    return true;
                }
                for (const o of occ) if (o !== v && this._conflict(path, o._sigPath || o.currentTurnPath || o.plannedTurn)) return false;
                if (path && path.turnType === 'left' && this._oncoming(v, p, path)) return false;
                if (path && !this._exitRoom(v, path.toLane)) return false;
                ix._grant(v); v._sigPath = path;
                return true;
            }

            /**
             * Don't block the box: room on the lane out for `v`, past the end of the queue on it (the nearest car
             * there that's slow) and everyone already let in ahead of us who's going the same way (the first `upto`
             * let in, for one already let in itself).
             */
            _exitRoom(v, out, upto = Infinity) {
                const cars = v._allVehicles;
                if (!out || !out.start || !cars) return true;
                let room = out.length;
                for (const c of cars) {
                    if (c === v || c.dead || !c.length || Math.abs(c.speed || 0) >= 3) continue;
                    const dx = c.x - out.start.x, dy = c.y - out.start.y, along = dx * out.ux + dy * out.uy;
                    if (along < -c.length || along > room + c.length || Math.abs(-dx * out.uy + dy * out.ux) > 30) continue;
                    room = Math.min(room, along - c.length / 2);
                }
                const occ = this.ix.occupants;
                for (let i = 0; i < occ.length && i < upto; i++) {
                    const o = occ[i], op = o._sigPath || o.currentTurnPath;
                    if (o === v || !op || op.toLane !== out || o.currentLane === out) continue;
                    room -= (o.length || 70) + 14;
                }
                return room >= v.length + 14;
            }

            /** Something's coming the other way, soon, across our left turn's path (it has the right of way) */
            _oncoming(v, p, path) {
                const win = SIGNAL.YIELD * (v._temper ? v._temper().take : 1), occ = this.ix.occupants;
                for (const [c, n] of this.noted) {
                    if (c === v || n.phase !== p || n.lane === v.currentLane || n.speed < 0.8 || _simTick - n.tick > 6 || occ.includes(c)) continue;
                    const q = n.path || JunctionSignal.straightFrom(n.lane);
                    if ((q && q.turnType === 'left') || !this._conflict(path, q)) continue;
                    if (Math.max(0, n.dist - (c.length || 70) / 2) / n.speed < win) return true;
                }
                return false;
            }

            /** Do turn paths `a` and `b` cross (cars on both at once would meet)? One lane's paths take turns in it. */
            _conflict(a, b) {
                if (!a || !b) return true;
                if (a === b || a.fromLane === b.fromLane) return false;
                const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
                let c = this._conf.get(key);
                if (c === undefined) this._conf.set(key, c = JunctionSignal.pathsCross(a, b));
                return c;
            }

            /** Do cars on paths `a` and `b` come within reach of each other, allowing for how far each strays off its
             *  path along the way (a turn's drift: cars cut and swing round its curve, most at its middle) */
            static pathsCross(a, b) {
                const N = 16, D = SIGNAL.DRIFT, da = a.turnType === 'straight' ? D.straight : D.turn, db = b.turnType === 'straight' ? D.straight : D.turn;
                const pa = [];
                for (let i = 0; i <= N; i++) { const p = a.getPoint(i / N); p.r = SIGNAL.CROSS + da * Math.sin(Math.PI * i / N); pa.push(p); }
                for (let j = 0; j <= N; j++) {
                    const q = b.getPoint(j / N), rb = db * Math.sin(Math.PI * j / N);
                    for (const s of pa) { const dx = s.x - q.x, dy = s.y - q.y, r = s.r + rb; if (dx * dx + dy * dy < r * r) return true; }
                }
                return false;
            }

            static straightFrom(lane) {
                if (!lane) return null;
                if (lane._sigStraight === undefined) lane._sigStraight = (lane.turnPaths || []).find(t => t.turnType === 'straight') || null;
                return lane._sigStraight;
            }

            /** The light `lane` faces: 'green' | 'amber' | 'red' */
            lightFor(lane) {
                const p = this.phaseOf(lane);
                return p !== this.cur || this.state === 'clear' ? 'red' : this.state;
            }

            /** The signal at a crosswalk (and which phase's road it crosses), cached on the crosswalk */
            static atCrosswalk(cw, net) {
                if (!cw || !net) return null;
                if (cw._sigNet !== net || (cw._sig && cw._sig.ix.signal !== cw._sig)) {
                    cw._sigNet = net; cw._sig = null; cw._sigPhase = -1;
                    const cx = cw.x + cw.w / 2, cy = cw.y + cw.h / 2;
                    for (const ix of net.intersections) {
                        if (cx < ix.x - 90 || cx > ix.x + ix.width + 90 || cy < ix.y - 90 || cy > ix.y + ix.height + 90) continue;
                        if (ix.signal === undefined) ix.signal = JunctionSignal.make(ix);
                        const sig = ix.signal;
                        if (!sig) break;
                        const p = sig.phases.findIndex(ph => ph.road.orientation === cw.orientation);
                        if (p !== -1) { cw._sig = sig; cw._sigPhase = p; }
                        break;
                    }
                }
                return cw._sig;
            }
        }

        // ── How they look ──
        //  Each way in has a stop bar across its lanes behind the crosswalk, lit in its light; along the centre line
        //  behind it, the demand gauge: a run of segments lighting up one per car waiting or on its way (pulsing on a
        //  red as it asks, running toward the junction on a green as the queue rolls); and the signal head on the
        //  kerb. The crosswalks carry LED strips at both kerbs: walk, or don't. After dark they all glow (drawGlow).
        const SIGNAL_RGB = { red: '255, 45, 85', amber: '255, 176, 32', green: '70, 255, 110', walk: '190, 240, 255', wait: '255, 70, 90' };
        const SIGNAL_GAUGE = 6;

        Object.assign(JunctionSignal.prototype, {
            /** Where each way in's bar, gauge and head go (worked out once) */
            _looks() {
                if (this._geo) return this._geo;
                const geo = this._geo = [];
                for (let p = 0; p < 2; p++) for (const dir of [1, -1]) {
                    const lanes = this.phases[p].gates.map(g => g.lane).filter(l => l.direction === dir);
                    if (!lanes.length) continue;
                    const L = lanes[0], ux = L.ux, uy = L.uy, nx = -uy, ny = ux, w = L.road.laneWidth || 60;
                    // across the way in, from its inside edge (the centre line) to the kerb
                    let lo = Infinity, hi = -Infinity, ex = 0, ey = 0;
                    for (const l of lanes) { const o = (l.end.x - L.end.x) * nx + (l.end.y - L.end.y) * ny; lo = Math.min(lo, o - w / 2); hi = Math.max(hi, o + w / 2); ex += l.end.x; ey += l.end.y; }
                    ex /= lanes.length; ey /= lanes.length;
                    const mid = (lo + hi) / 2, back = SIGNAL.STOP_BACK + 4;
                    const at = (along, across) => ({ x: L.end.x + ux * along + nx * across, y: L.end.y + uy * along + ny * across });
                    geo.push({ p, lane: L, ux, uy, nx, ny, a: at(-back, lo + 5), b: at(-back, hi - 5),
                        head: at(-back + 6, hi + 22), gauge: at(-back - 12, lo + 6), idx: JunctionSignal.approach(p, L) });
                }
                return geo;
            },

            /** The crosswalks round this junction, and whose road each crosses (worked out on first draw) */
            _walkStrips(crosswalks) {
                if (this._walks && this._walksOf === crosswalks) return this._walks;
                this._walksOf = crosswalks; this._walks = [];
                const ix = this.ix;
                for (const cw of crosswalks || []) {
                    const cx = cw.x + cw.w / 2, cy = cw.y + cw.h / 2;
                    if (cx < ix.x - 90 || cx > ix.x + ix.width + 90 || cy < ix.y - 90 || cy > ix.y + ix.height + 90) continue;
                    const p = this.phases.findIndex(ph => ph.road.orientation === cw.orientation);
                    if (p === -1) continue;
                    // the strips along both kerbs (the crossing runs across the road it crosses)
                    const s = cw.kerbs ? cw.kerbs                                  // over an angled road: its own kerb lines
                        : cw.orientation === 'V'
                        ? [[cw.x + 3, cw.y + 7, cw.x + 3, cw.y + cw.h - 7], [cw.x + cw.w - 3, cw.y + 7, cw.x + cw.w - 3, cw.y + cw.h - 7]]
                        : [[cw.x + 7, cw.y + 3, cw.x + cw.w - 7, cw.y + 3], [cw.x + 7, cw.y + cw.h - 3, cw.x + cw.w - 7, cw.y + cw.h - 3]];
                    this._walks.push({ p, s });
                }
                return this._walks;
            },

            inView(v) {
                const ix = this.ix, m = 160;
                return !(ix.x + ix.width + m < v.left || ix.x - m > v.right || ix.y + ix.height + m < v.top || ix.y - m > v.bottom);
            },

            /** The walk light for phase `p`'s road: 'walk', 'wait', or 'flash' (don't start: it's about to change) */
            walkLight(p) { return this.walkOK(p) ? 'walk' : (this.state === 'green' && this.cur !== p) || this.state === 'amber' && this.cur !== p ? 'flash' : 'wait'; },

            /** On the ground: bars, gauges, heads and walk strips */
            draw(ctx, crosswalks, time) {
                const geo = this._looks();
                ctx.save();
                ctx.lineCap = 'round';
                for (const g of geo) {
                    const light = this.lightFor(g.lane), rgb = SIGNAL_RGB[light];
                    // the stop bar
                    ctx.strokeStyle = 'rgba(8, 4, 16, 0.55)'; ctx.lineWidth = 8;
                    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
                    ctx.strokeStyle = `rgba(${rgb}, 0.92)`; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
                    // the gauge
                    const lit = Math.min(SIGNAL_GAUGE, Math.round(this.load[g.idx]));
                    ctx.lineWidth = 3.5;
                    for (let i = 0; i < SIGNAL_GAUGE; i++) {
                        const x0 = g.gauge.x - g.ux * i * 18, y0 = g.gauge.y - g.uy * i * 18;
                        ctx.strokeStyle = i < lit ? `rgba(${rgb}, ${this._segA(light, i, time).toFixed(3)})` : 'rgba(255, 255, 255, 0.07)';
                        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - g.ux * 11, y0 - g.uy * 11); ctx.stroke();
                    }
                    // the head, on the kerb: housing and its three lamps (red nearest the junction)
                    ctx.save(); ctx.translate(g.head.x, g.head.y); ctx.rotate(Math.atan2(g.uy, g.ux));
                    ctx.fillStyle = '#120a1e'; ctx.strokeStyle = 'rgba(202, 176, 250, 0.35)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.roundRect(-16, -6, 32, 12, 5); ctx.fill(); ctx.stroke();
                    const lamps = ['green', 'amber', 'red'];
                    for (let i = 0; i < 3; i++) {
                        const on = lamps[i] === light;
                        ctx.fillStyle = `rgba(${SIGNAL_RGB[lamps[i]]}, ${on ? 1 : 0.16})`;
                        ctx.beginPath(); ctx.arc(-9.5 + i * 9.5, 0, 3.4, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                }
                // the walk strips
                ctx.lineWidth = 3;
                for (const w of this._walkStrips(crosswalks)) {
                    const wl = this.walkLight(w.p), on = wl !== 'flash' || ((time / 280) | 0) % 2 === 0;
                    ctx.strokeStyle = `rgba(${SIGNAL_RGB[wl === 'walk' ? 'walk' : 'wait']}, ${on ? 0.9 : 0.2})`;
                    for (const s of w.s) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
                }
                ctx.restore();
            },

            /** A gauge segment's brightness: pulsing as it asks on a red, running in on a green */
            _segA(light, i, time) {
                if (light === 'green') return 0.55 + 0.4 * Math.max(0, Math.sin(time / 90 + i * 0.9));
                if (light === 'red') return 0.6 + 0.3 * Math.sin(time / 260);
                return 0.85;
            },

            /** After dark (drawEmissivePass): the lit parts glow, and spill a little colour on the road */
            drawGlow(ctx, dark, crosswalks, time) {
                const a = Math.min(1, dark * 1.4);
                if (a < 0.04) return;
                const geo = this._looks();
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
                for (const g of geo) {
                    const light = this.lightFor(g.lane), rgb = SIGNAL_RGB[light];
                    const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
                    ctx.globalAlpha = a * 0.22; drawGlow(ctx, mx, my, 70, rgb, 0);
                    ctx.globalAlpha = a * 0.35; ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 10;
                    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
                    const lit = Math.min(SIGNAL_GAUGE, Math.round(this.load[g.idx]));
                    ctx.lineWidth = 7;
                    for (let i = 0; i < lit; i++) {
                        const x0 = g.gauge.x - g.ux * i * 18, y0 = g.gauge.y - g.uy * i * 18;
                        ctx.globalAlpha = a * 0.3 * this._segA(light, i, time);
                        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - g.ux * 11, y0 - g.uy * 11); ctx.stroke();
                    }
                    const li = light === 'green' ? 0 : light === 'amber' ? 1 : 2, c = Math.cos(Math.atan2(g.uy, g.ux)), sn = Math.sin(Math.atan2(g.uy, g.ux));
                    ctx.globalAlpha = a * 0.9; drawGlow(ctx, g.head.x + c * (-9.5 + li * 9.5), g.head.y + sn * (-9.5 + li * 9.5), 16, rgb, 0.3);
                }
                ctx.lineWidth = 9;
                for (const w of this._walkStrips(crosswalks)) {
                    const wl = this.walkLight(w.p);
                    if (wl === 'flash' && ((time / 280) | 0) % 2) continue;
                    ctx.globalAlpha = a * 0.3; ctx.strokeStyle = `rgb(${SIGNAL_RGB[wl === 'walk' ? 'walk' : 'wait']})`;
                    for (const s of w.s) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
                }
                ctx.restore();
            },
        });
