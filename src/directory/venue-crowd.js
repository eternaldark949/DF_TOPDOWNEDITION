        // ===== LV2 DIRECTORY =====
        // VENUE CROWD: the walker loop that every venue's ambient crowd runs on. The Double Nights lobby
        // (lobby-life.js), Moon City (club-life.js) and the Cozy Cafe (cafe-life.js) are this class with
        // their own spots, staff and itineraries. Walkers are not NPCs: no dialogue, no prompts, no
        // minimap dots. They're cheap, and they can't trip the story. Updated from engine/update.js,
        // drawn with the characters (engine/draw.js) by Crowd Quality.
        //
        // A WALKER has a list of steps. A step with `go` walks there, then holds a pose for `wait` ticks
        // (`face` to look somewhere, `seatAt` / `seatFace` to sit down on arrival and stand up after,
        // `hide` to step into a stall). A step without `go` is an ACTIVITY ({ dance }, { seat: 'booth' },
        // { order }...): the venue's _expand() turns it into stops, claiming what it needs (a stool, a
        // queue place) from the venue's pools. `exit` steps leave.
        //
        // WHAT A VENUE SETS (class fields):
        //   START_ANGLE      which way a new walker faces
        //   WALKER_RADIUS    a radius for the walkers, or 0 for none
        //   PREFILL          share of the crowd target already inside when the venue is entered
        //   SPAWN_PACE       [thin_share, thin_gap, gap, jitter]: ticks to the next arrival (quicker while thin)
        //   LEAVE_FADE       how fast a walker with nothing left to do fades out
        //   EXIT_REACH       how near an exit counts as there (someone may be standing in the door)
        //   ARRIVE_ONCE      once at a stop, stay put there (true), or walk back if pushed off it (false)
        //   DRINKS           what a `drink` step fetches
        //   SEATS            { pool: [{ at: [x, y], from: [x, y], face }] }: its seats, for worldQuery.getSeats
        // AND WHAT IT WRITES: _setUp(game) (spots, staff), _target(game), _spawnGuest(mid_visit),
        //   _expand(w, step), _staffThink(w, game); optionally _leave, _abandonStep, _finishStep,
        //   _afterUpdate and draw.
        class VenueCrowd {
            START_ANGLE = -Math.PI / 2;
            WALKER_RADIUS = 9;
            PREFILL = 0.8;
            SPAWN_PACE = [0.7, 40, 90, 80];
            LEAVE_FADE = -0.05;
            EXIT_REACH = 26;
            ARRIVE_ONCE = true;
            DRINKS = [];

            constructor(map_id) { this.walkers = []; this.map = null; this.taken = new Map(); this.mapId = map_id; }

            /** A fresh crowd for a (re)entered venue: its staff, and a visit already under way. */
            reset(game) {
                this.walkers = []; this.map = game.activeMap; this._spawnTimer = 0; this.taken = new Map();
                const nav = NavGrid.for(this.map);
                this._snap = ([x, y]) => { const f = nav && nav.nearestFree(x, y, 4); return f !== null && f !== undefined ? [nav.cx(f), nav.cy(f)] : [x, y]; };
                this._setUp(game);
                const n = this._target(game);
                for (let i = 0; i < Math.round(n * this.PREFILL); i++) this._spawnGuest(true);
            }

            _make(kind, x, y, look) {
                const w = { kind, x, y, angle: this.START_ANGLE, walkPhase: 0, look, life: 0, fade: 0, steps: [], timer: 0, speed: 1.5, stuck: 0, lastD: Infinity };
                if (this.WALKER_RADIUS) w.radius = this.WALKER_RADIUS;
                return w;
            }

            /** A guest who is already mid-visit when the venue is entered starts where the visit is: in the
             *  seat their first stop sits them in (so they're seated, cup in hand), or at that stop's spot. */
            _settleMidVisit(g) {
                const first = g.steps[0];
                if (!first || first.go || first.exit) return;
                g.steps.splice(0, 1, ...this._expand(g, first));
                const s = g.steps[0];
                if (!s || !s.go) return;
                if (s.seatAt) { g.x = s.seatAt[0]; g.y = s.seatAt[1]; g.angle = s.seatFace; g.seated = true; s._arrived = true; s._back = [s.go[0], s.go[1]]; }
                else { g.x = s.go[0]; g.y = s.go[1]; }
            }

            // --- POOLS: stools, stalls, queue places, dance-floor cells, one walker each ---
            /** A free item from a claimable pool, or -1. */
            _claim(pool, n, w) {
                let set = this.taken.get(pool); if (!set) this.taken.set(pool, set = new Map());
                const free = []; for (let i = 0; i < n; i++) if (!set.has(i)) free.push(i);
                if (!free.length) return -1;
                const i = free[Math.random() * free.length | 0]; set.set(i, w); return i;
            }
            _release(w) { for (const set of this.taken.values()) for (const [k, o] of set) if (o === w) set.delete(k); }
            _releaseStep(w, step) {
                if (!step || !step.pool) return;
                const set = this.taken.get(step.pool); if (!set) return;
                for (const [k, o] of set) if (o === w) set.delete(k);
            }

            // --- HOOKS a venue may replace ---
            /** At an exit: fade out. */
            _leave(w, step) { if (w.fade >= 0) { w.fade = -0.05; w.angle = Math.PI / 2; } }
            /** Stuck on the way to a stop for too long: given up. */
            _abandonStep(w, step) { this._releaseStep(w, step); }
            /** A stop's wait is over. Glasses get finished; some go back for another (`keep`: not this one, it was just handed over). */
            _finishStep(w, step) {
                this._releaseStep(w, step);
                if (w.look.held && !step.keep && Math.random() < 0.25) w.look.held = null;
            }
            _afterUpdate() {}

            update(game) {
                if (!game.activeMap || game.activeMap.id !== this.mapId) { if (this.walkers.length) { this.walkers = []; this.map = null; } return; }
                if (this.map !== game.activeMap) this.reset(game);
                let guests = 0; for (const w of this.walkers) if (w.kind === 'guest') guests++;
                const target = this._target(game), P = this.SPAWN_PACE;
                if (--this._spawnTimer <= 0 && guests < target) { this._spawnGuest(false); this._spawnTimer = (guests < target * P[0] ? P[1] : P[2]) + Math.random() * P[3] | 0; }
                const pl = game.player, M = game.activeMap, nav = NavGrid.for(M);
                for (let i = this.walkers.length - 1; i >= 0; i--) {
                    const w = this.walkers[i];
                    // Fading in (arrival) or out (departure)
                    if (w.fade > 0) { w.life = Math.min(1, w.life + w.fade); if (w.life >= 1) w.fade = 0; }
                    if (w.fade < 0) { w.life += w.fade; if (w.life <= 0) { this._release(w); this.walkers.splice(i, 1); continue; } }
                    // Settling onto a seat (or into a stall), or getting up again: a short glide, no steering
                    if (w.glide) {
                        const G = w.glide, k = ++G.t / G.n;
                        w.x = G.x0 + (G.x1 - G.x0) * Math.min(1, k); w.y = G.y0 + (G.y1 - G.y0) * Math.min(1, k);
                        if (G.hide) w.life = G.up ? Math.min(1, k) : Math.max(0, 1 - k);
                        gaitCommand(w, 0, 0);
                        if (k >= 1) { w.glide = null; if (G.done) G.done(); }
                        continue;
                    }
                    if (w.kind !== 'guest') this._staffThink(w, game);
                    let step = w.steps[0];
                    if (!step) { if (w.kind === 'guest' && w.fade >= 0) w.fade = this.LEAVE_FADE; continue; }
                    for (let k = 0; k < 3 && step && !step.go && !step.exit; k++) {     // an activity: work out where (a fallback may be another activity)
                        w.steps.splice(0, 1, ...this._expand(w, step));
                        step = w.steps[0];
                    }
                    if (!step) continue;
                    if (!step.go && !step.exit) { w.steps.shift(); continue; }
                    const [gx, gy] = step.go, d = Math.hypot(gx - w.x, gy - w.y);
                    if (d > (step.exit ? this.EXIT_REACH : 6) && !(this.ARRIVE_ONCE && step._arrived)) {
                        let s = actorSteer(w, gx, gy, w.speed, M), vx = s.x, vy = s.y;
                        for (const mw of game._makeWay || [pl]) {                          // make way for 949 and her crew
                            const px = w.x - mw.x, py = w.y - mw.y, pd = Math.hypot(px, py);
                            if (pd < 34 && pd > 0.1) { vx += (px / pd) * 0.9 - (py / pd) * 0.5; vy += (py / pd) * 0.9 + (px / pd) * 0.5; }
                        }
                        for (const o of this.walkers) {                                    // and keep a little room from one another
                            if (o === w || o.life < 0.5 || o.seated) continue;
                            const ox = w.x - o.x, oy = w.y - o.y;
                            if (ox > 20 || ox < -20 || oy > 20 || oy < -20) continue;
                            const od = Math.hypot(ox, oy);
                            if (od < 20 && od > 0.1) { vx += (ox / od) * 0.35; vy += (oy / od) * 0.35; }
                        }
                        if (nav && !nav.lineWalkable(w.x, w.y, w.x + vx, w.y + vy)) { vx = s.x; vy = s.y; }     // never shoved into furniture
                        gaitCommand(w, vx, vy); w.x += vx; w.y += vy;
                        if (Math.abs(vx) + Math.abs(vy) > 0.05) w.angle = Math.atan2(vy, vx);
                        // Stuck? (blocked by a crowd): give up on this stop after a while
                        const remaining = s.remaining;                                     // (from this tick's steer: no second route walk)
                        if (remaining < w.lastD - 0.2) { w.lastD = remaining; w.stuck = 0; }
                        else if (++w.stuck > 360) { w.steps.shift(); this._abandonStep(w, step); w.stuck = 0; w.lastD = Infinity; }
                        w.look.pose = undefined;
                        continue;
                    }
                    // Arrived
                    w.lastD = Infinity; w.stuck = 0;
                    if (step.exit) { this._leave(w, step); continue; }
                    if (!step._arrived) {
                        step._arrived = true;
                        if (step.seatAt) {                                             // sit down / step into the stall
                            const back = [w.x, w.y];
                            w.angle = step.seatFace; w.seated = true;
                            w.glide = { x0: w.x, y0: w.y, x1: step.seatAt[0], y1: step.seatAt[1], t: 0, n: step.hide ? 26 : 16, hide: step.hide };
                            step._back = back;
                            continue;
                        }
                    }
                    if (step.face) w.angle = Math.atan2(step.face[1] - w.y, step.face[0] - w.x);
                    else if (step.seatFace !== undefined) w.angle = step.seatFace;
                    w.look.pose = step.hide ? undefined : step.pose;
                    w.waiting = true;
                    // A drink, fetched at the bar (the bartender's had it poured); or something handed over here (`give`)
                    if (step.drink && !w.look.held && step.wait < 200) w.look.held = { type: 'glass', drink: pickFrom(Math.random, this.DRINKS), hand: 'right' };
                    if (step.give && !w.look.held && step.wait < (step.giveAt || 200)) w.look.held = step.give;
                    if (step.take && w.look.held && step.wait < (step.takeAt || 30)) w.look.held = null;   // (and set down here)
                    if (--step.wait <= 0) {
                        if (step._back) {                                              // get up / come out
                            const b = step._back; step._back = null;
                            w.glide = { x0: w.x, y0: w.y, x1: b[0], y1: b[1], t: 0, n: step.hide ? 26 : 14, hide: step.hide, up: true,
                                        done: () => { w.seated = false; w.steps.shift(); this._releaseStep(w, step); } };
                            w.look.pose = undefined;
                            continue;
                        }
                        w.steps.shift(); this._finishStep(w, step);
                    }
                }
                this._afterUpdate();
            }

            /** Walkers for door physics: anyone up and about (not seated or tucked in a stall). */
            doorActors() { return this.walkers.filter(w => w.life > 0.5 && !w.seated); }

            draw(ctx, cb) {
                if (!this.walkers.length) return;
                // In view only (one reused list, sorted by depth); the rest keep their gait (footsteps) ticking
                const list = this._drawList || (this._drawList = []); list.length = 0;
                for (const w of this.walkers) { if (w.life <= 0.01) continue; if (!cb || (w.x > cb.left && w.x < cb.right && w.y > cb.top && w.y < cb.bottom)) list.push(w); else { syncHumanoidGait(w); RenderStats.culled++; } }
                list.sort(_byY);
                for (const w of list) {
                    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.angle); ctx.globalAlpha = w.life;
                    drawCrowdHumanoid(ctx, w, { stance: 'idle', ...w.look });                // by Crowd Quality (ui/crowd-impostors.js)
                    ctx.restore();
                }
            }
        }
