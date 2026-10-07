        // ============================================================================
        //  CLUB LIFE — Moon City's crowd (moon_city_nightclub only)
        //  Clubgoers come in past the bouncer, check a coat, then spend the night between
        //  the dance floor, the bar (a stool or the rail, and a drink that stays in hand),
        //  the booths and high-tops, and the restrooms (a stall, the urinals, the mirrors),
        //  and leave the way they came. A barback works the floor, an attendant keeps the
        //  powder room. Like the lobby's guests (world/lobby-life.js) they're ambient
        //  walkers, not NPCs: no dialogue, no prompts — cheap, and they can't trip the story.
        //  Busiest late (22:00–03:00), a handful by day. They push the restroom doors.
        //  Updated from engine/update.js, drawn with the characters (engine/draw.js).
        // ============================================================================
        const CLUB_GATE = [800, 1150];
        const CLUB_STOOLS = [280, 343, 406, 595, 658, 721];                       // bar stool centres (x 510)
        const CLUB_STALLS = { powder: [192, 282, 372, 462], gents: [722, 814, 906, 998] };   // stall centres (x 60)
        const CLUB_URINALS = [53, 103, 153, 203, 253];                           // y 612, facing the north wall
        const CLUB_SPOTS = {
            coat: [465, 1078], foyer: [[620, 1090], [980, 1090], [1050, 1078], [560, 1110]],
            rail: CLUB_STOOLS.map(y => [538, y]),                                // standing at the bar, leaning on it
            hightops: [[555, 125], [530, 162], [580, 170], [1125, 135], [1100, 175], [1150, 172], [1125, 805], [1100, 845], [1150, 842]],
            hightopAt: [[555, 155], [1125, 165], [1125, 835]],
            mirrors: [[70, 82], [125, 82], [180, 82], [235, 82]],                // the powder-room vanity
            sinks: [[170, 1122], [230, 1122], [290, 1122]],                      // the gents' basins (south wall)
            floorEdge: [[560, 300], [1040, 300], [560, 720], [1040, 720], [700, 760], [900, 760]],
            bouncer: [935, 1095], barback: [[535, 500], [535, 870], [1125, 870], [600, 220], [1060, 220]], attendant: [255, 120]
        };
        // Seats: where you sit, where you step up to it from, which way you face
        const CLUB_SEATS = {
            stool: CLUB_STOOLS.map(y => ({ at: [510, y], from: [540, y], face: Math.PI })),
            booth: [470, 1060].flatMap(bx => [
                { at: [bx + 40, bx === 470 ? 938 : 938], from: [bx + 40, 872], face: -Math.PI / 2 },
                { at: [bx + 65, 940], from: [bx + 65, 872], face: -Math.PI / 2 },
                { at: [bx + 90, 938], from: [bx + 90, 872], face: -Math.PI / 2 },
                { at: [bx + 21, 912], from: [bx - 14, 905], face: 0 },
                { at: [bx + 109, 912], from: [bx + 144, 905], face: Math.PI }
            ]),
            settee: [{ at: [250, 330], from: [212, 330], face: Math.PI }, { at: [250, 370], from: [212, 370], face: Math.PI }, { at: [250, 405], from: [212, 405], face: Math.PI }]
        };
        const CLUB_POLES = [[800, 370], [660, 560], [940, 560]];
        const CLUB_CROWD = { low: 14, medium: 24, high: 34 };
        const CLUB_DRINKS = ['neon', 'neon', 'martini', 'champagne', 'rose', 'cream_soda', 'whiskey', 'red_wine', 'stellar_lemonade'];

        class ClubLife {
            constructor() { this.walkers = []; this.map = null; this.taken = new Map(); this.mapId = 'moon_city_nightclub'; }

            /** Fresh crowd for a (re)entered club. */
            reset(game) {
                this.walkers = []; this.map = game.activeMap; this._spawnTimer = 0; this.taken = new Map();
                const nav = NavGrid.for(this.map), snap = ([x, y]) => { const f = nav && nav.nearestFree(x, y, 4); return f !== null && f !== undefined ? [nav.cx(f), nav.cy(f)] : [x, y]; };
                this._snap = snap;
                // Dance-floor cells (40 px grid), clear of the poles and the club's own dancers
                const dancers = (this.map.npcs || []).filter(n => n.role === 'dancer' || n.role === 'red_demon_dancer').map(n => [n.x, n.y]);
                const block = CLUB_POLES.concat(dancers);
                this.cells = [];
                for (let i = 0; i <= 10; i++) for (let j = 0; j <= 9; j++) {
                    const x = 600 + i * 40, y = 320 + j * 40;
                    if (block.every(([bx, by]) => Math.hypot(bx - x, by - y) > 42)) this.cells.push([x, y]);
                }
                const r = Math.random;
                // Staff: the bouncer at the ropes, a barback working the floor, the powder-room attendant
                for (const kind of ['bouncer', 'barback', 'attendant']) {
                    const p = kind === 'bouncer' ? CLUB_SPOTS.bouncer : kind === 'attendant' ? CLUB_SPOTS.attendant : CLUB_SPOTS.barback[0];
                    const w = this._make(kind, p[0], p[1], ROLE_LOOKS.mc_staff(kind, seededRandom('mc' + kind)));
                    w.life = 1; w.speed = kind === 'barback' ? 1.8 : 1.4;
                    this.walkers.push(w);
                }
                // A night already under way
                const n = this._target(game);
                for (let i = 0; i < Math.round(n * 0.8); i++) this._spawnGuest(true);
            }

            /** How full the club is: the density setting, scaled by the hour (busiest 22:00–03:00). */
            _target(game) {
                const base = CLUB_CROWD[GameSettings.pedestrianDensity] || CLUB_CROWD.medium;
                const h = (((game.worldMinutes || 0) / 60) % 24 + 24) % 24;
                const k = h >= 22 || h < 3 ? 1 : h >= 20 ? 0.6 + (h - 20) * 0.2 : h < 5 ? 1 - (h - 3) * 0.3 : h >= 17 ? 0.35 : 0.2;
                return Math.max(3, Math.round(base * k));
            }

            _make(kind, x, y, look) {
                return { kind, x, y, angle: -Math.PI / 2, walkPhase: 0, look, life: 0, fade: 0, steps: [], timer: 0, speed: 1.5, stuck: 0, lastD: Infinity, radius: 9 };
            }

            /** A free item from a claimable pool (stalls, stools, cells…), or -1. */
            _claim(pool, n, w) {
                let set = this.taken.get(pool); if (!set) this.taken.set(pool, set = new Map());
                const free = []; for (let i = 0; i < n; i++) if (!set.has(i)) free.push(i);
                if (!free.length) return -1;
                const i = free[Math.random() * free.length | 0]; set.set(i, w); return i;
            }
            _release(w) { for (const set of this.taken.values()) for (const [k, o] of set) if (o === w) set.delete(k); }

            /** A clubgoer walks in, or (when the club is entered) is already somewhere in the night. */
            _spawnGuest(midVisit) {
                const r = Math.random;
                const look = ROLE_LOOKS.clubgoer(seededRandom('club' + r()));
                const p = midVisit ? pickFrom(r, this.cells.concat(CLUB_SPOTS.rail, CLUB_SPOTS.floorEdge)) : CLUB_GATE;
                const g = this._make('guest', p[0] + (r() - 0.5) * 8, p[1] + (r() - 0.5) * 8, look);
                g.speed = 1.2 + r() * 0.5; g.fade = midVisit ? 0 : 0.05; g.life = midVisit ? 1 : 0;
                if (midVisit && r() < 0.5) look.held = { type: 'glass', drink: pickFrom(r, CLUB_DRINKS), hand: 'right' };
                // The night: a coat checked on the way in, then a few things, then home
                if (!midVisit) { if (r() < 0.35) g.steps.push({ go: CLUB_SPOTS.coat, face: [465, 1040], wait: 60 + r() * 60 | 0, pose: 'idle' }); }
                const acts = 2 + (r() * 4 | 0);
                for (let i = 0; i < acts; i++) {
                    const a = r();
                    if (a < 0.38) g.steps.push({ dance: true, wait: 600 + r() * 1400 | 0 });
                    else if (a < 0.58) g.steps.push(r() < 0.5 ? { seat: 'stool', wait: 400 + r() * 700 | 0, pose: pickFrom(r, ['sit', 'sit_lean', 'sit_phone']), drink: true }
                                                              : { rail: true, wait: 300 + r() * 500 | 0, drink: true });
                    else if (a < 0.7) g.steps.push({ seat: 'booth', wait: 600 + r() * 900 | 0, pose: pickFrom(r, ['sit', 'sit_lean', 'sit_phone']) });
                    else if (a < 0.78) g.steps.push({ hightop: true, wait: 300 + r() * 500 | 0 });
                    else g.steps.push({ restroom: true });
                }
                g.steps.push({ exit: true, go: CLUB_GATE });
                this.walkers.push(g);
            }

            /** Turn a planned activity into concrete stops (claiming what it needs). */
            _expand(w, step) {
                const r = Math.random, S = CLUB_SPOTS, out = [];
                if (step.dance) {
                    const i = this._claim('cell', this.cells.length, w);
                    if (i < 0) return [{ go: pickFrom(r, S.floorEdge), wait: 200, pose: 'idle' }];
                    return [{ go: this.cells[i], wait: step.wait, pose: 'dance', face: [800 + (r() - 0.5) * 300, 120], pool: 'cell' }];
                }
                if (step.seat) {
                    const list = CLUB_SEATS[step.seat], i = this._claim(step.seat, list.length, w);
                    if (i < 0) return step.seat === 'stool' ? [{ rail: true, wait: step.wait, drink: true }] : [];
                    const s = list[i];
                    return [{ go: this._snap(s.from), seatAt: s.at, seatFace: s.face, wait: step.wait, pose: step.pose, drink: step.drink, pool: step.seat }];
                }
                if (step.rail) {
                    const i = this._claim('rail', S.rail.length, w);
                    if (i < 0) return [];
                    return [{ go: this._snap(S.rail[i]), face: [420, S.rail[i][1]], wait: step.wait, pose: 'lean_rail', drink: true, pool: 'rail' }];
                }
                if (step.hightop) {
                    const i = this._claim('hightop', S.hightops.length, w);
                    if (i < 0) return [];
                    const p = S.hightops[i], t = S.hightopAt.reduce((b, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(b[0] - p[0], b[1] - p[1]) ? q : b);
                    return [{ go: this._snap(p), face: t, wait: step.wait, pose: pickFrom(r, ['idle', 'phone', 'breathe']), pool: 'hightop' }];
                }
                if (step.restroom) {
                    const g = w.look.gender, room = g === 'female' ? 'powder' : g === 'male' ? 'gents' : (r() < 0.5 ? 'powder' : 'gents');
                    if (room === 'gents' && r() < 0.6) {                               // the urinals
                        const i = this._claim('urinal', CLUB_URINALS.length, w);
                        if (i >= 0) out.push({ go: this._snap([CLUB_URINALS[i], 614]), face: [CLUB_URINALS[i], 560], wait: 140 + r() * 120 | 0, pose: 'idle', pool: 'urinal' });
                    }
                    if (!out.length) {                                                 // a stall: in, door shut, out
                        const list = CLUB_STALLS[room], i = this._claim('stall_' + room, list.length, w);
                        if (i < 0) return [{ go: this._snap(room === 'powder' ? [200, 220] : [220, 800]), wait: 160, pose: 'phone' }];   // a queue for the loo
                        out.push({ go: this._snap([118, list[i]]), seatAt: [62, list[i]], seatFace: 0, hide: true, wait: 240 + r() * 300 | 0, pose: 'idle', pool: 'stall_' + room });
                    }
                    // Wash up / a look in the mirror on the way out
                    if (room === 'powder') {
                        const i = this._claim('mirror', S.mirrors.length, w);
                        if (i >= 0) out.push({ go: this._snap(S.mirrors[i]), face: [S.mirrors[i][0], 30], wait: 120 + r() * 200 | 0, pose: 'idle', pool: 'mirror' });
                        if (r() < 0.25) { const j = this._claim('settee', CLUB_SEATS.settee.length, w); if (j >= 0) { const s = CLUB_SEATS.settee[j]; out.push({ go: this._snap(s.from), seatAt: s.at, seatFace: s.face, wait: 300 + r() * 300 | 0, pose: 'sit_phone', pool: 'settee' }); } }
                    } else {
                        const i = this._claim('sink', S.sinks.length, w);
                        if (i >= 0) out.push({ go: this._snap(S.sinks[i]), face: [S.sinks[i][0], 1170], wait: 90 + r() * 80 | 0, pose: 'idle', pool: 'sink' });
                    }
                    return out;
                }
                return [step];
            }

            update(game) {
                if (!game.activeMap || game.activeMap.id !== this.mapId) { if (this.walkers.length) { this.walkers = []; this.map = null; } return; }
                if (this.map !== game.activeMap) this.reset(game);
                let guests = 0; for (const w of this.walkers) if (w.kind === 'guest') guests++;
                const target = this._target(game);
                if (--this._spawnTimer <= 0 && guests < target) { this._spawnGuest(false); this._spawnTimer = (guests < target * 0.7 ? 40 : 90) + Math.random() * 80 | 0; }
                const pl = game.player, M = game.activeMap, nav = NavGrid.for(M);
                for (let i = this.walkers.length - 1; i >= 0; i--) {
                    const w = this.walkers[i];
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
                    if (!step) { if (w.kind === 'guest' && w.fade >= 0) w.fade = -0.05; continue; }
                    for (let k = 0; k < 3 && step && !step.go && !step.exit; k++) {     // an activity: work out where (a fallback may be another activity)
                        w.steps.splice(0, 1, ...this._expand(w, step));
                        step = w.steps[0];
                    }
                    if (!step) continue;
                    if (!step.go && !step.exit) { w.steps.shift(); continue; }
                    const [gx, gy] = step.go, d = Math.hypot(gx - w.x, gy - w.y);
                    if (d > (step.exit ? 26 : 6) && !step._arrived) {                       // (the door: near enough, someone may be standing in it)
                        let s = actorSteer(w, gx, gy, w.speed, M), vx = s.x, vy = s.y;
                        for (const mw of game._makeWay || [pl]) {                          // make way for 949 and her crew
                            const px = w.x - mw.x, py = w.y - mw.y, pd = Math.hypot(px, py);
                            if (pd < 34 && pd > 0.1) { vx += (px / pd) * 0.9 - (py / pd) * 0.5; vy += (py / pd) * 0.9 + (px / pd) * 0.5; }
                        }
                        for (const o of this.walkers) {
                            if (o === w || o.life < 0.5 || o.seated) continue;
                            const ox = w.x - o.x, oy = w.y - o.y;
                            if (ox > 20 || ox < -20 || oy > 20 || oy < -20) continue;
                            const od = Math.hypot(ox, oy);
                            if (od < 20 && od > 0.1) { vx += (ox / od) * 0.35; vy += (oy / od) * 0.35; }
                        }
                        if (nav && !nav.lineWalkable(w.x, w.y, w.x + vx, w.y + vy)) { vx = s.x; vy = s.y; }
                        gaitCommand(w, vx, vy); w.x += vx; w.y += vy;
                        if (Math.abs(vx) + Math.abs(vy) > 0.05) w.angle = Math.atan2(vy, vx);
                        const remaining = navWaypoint(w, gx, gy, M).remaining;
                        if (remaining < w.lastD - 0.2) { w.lastD = remaining; w.stuck = 0; }
                        else if (++w.stuck > 360) { w.steps.shift(); this._releaseStep(w, step); w.stuck = 0; w.lastD = Infinity; }
                        w.look.pose = undefined;
                        continue;
                    }
                    // Arrived
                    w.lastD = Infinity; w.stuck = 0;
                    if (step.exit) { if (w.fade >= 0) { w.fade = -0.05; w.angle = Math.PI / 2; } continue; }
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
                    // A drink, fetched at the bar (the bartender's had it poured); or something handed over here (`give`)
                    if (step.drink && !w.look.held && step.wait < 200) w.look.held = { type: 'glass', drink: pickFrom(Math.random, CLUB_DRINKS), hand: 'right' };
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
                        w.steps.shift(); this._releaseStep(w, step);
                        // Glasses get finished; some go back for another (`keep`: not this one, it was just handed over)
                        if (w.look.held && !step.keep && Math.random() < 0.25) w.look.held = null;
                    }
                }
            }

            _releaseStep(w, step) {
                if (!step || !step.pool) return;
                const set = this.taken.get(step.pool); if (!set) return;
                for (const [k, o] of set) if (o === w) set.delete(k);
            }

            /** Staff: the bouncer turns to each arrival, the barback clears glasses, the attendant tidies. */
            _staffThink(w, game) {
                if (w.kind === 'bouncer') {
                    const p = CLUB_SPOTS.bouncer;
                    if (Math.hypot(w.x - p[0], w.y - p[1]) > 8) { if (!w.steps.length) w.steps.push({ go: p, wait: 60, pose: 'arms_crossed' }); return; }
                    const g = this.walkers.find(o => o.kind === 'guest' && o.life > 0.2 && o.y > 1020 && Math.abs(o.x - 800) < 120);
                    w.angle = g ? Math.atan2(g.y - w.y, g.x - w.x) : Math.PI;
                    w.look.pose = 'arms_crossed';
                    return;
                }
                if (w.steps.length) return;
                const r = Math.random, S = CLUB_SPOTS;
                if (w.kind === 'barback') w.steps.push({ go: this._snap(pickFrom(r, S.barback.slice(1))), wait: 90 + r() * 80 | 0, pose: 'polish' }, { go: this._snap(S.barback[0]), face: [450, 500], wait: 120, pose: 'polish' });
                else w.steps.push({ go: this._snap(S.attendant), face: [150, 30], wait: 300, pose: pickFrom(r, ['concierge', 'arms_crossed']) },
                                  { go: this._snap(pickFrom(r, S.mirrors)), face: [150, 30], wait: 120, pose: 'polish' });
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
