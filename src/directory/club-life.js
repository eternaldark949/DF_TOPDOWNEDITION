        // ===== LV2 DIRECTORY =====
        // ============================================================================
        //  CLUB LIFE — Moon City's crowd (moon_city_nightclub only)
        //  Clubgoers come in past the bouncer, check a coat, then spend the night between
        //  the dance floor, the bar (a stool or the rail, and a drink that stays in hand),
        //  the booths and high-tops, and the restrooms (a stall, the urinals, the mirrors),
        //  and leave the way they came. A barback works the floor, an attendant keeps the
        //  powder room. A VenueCrowd (directory/venue-crowd.js): its walker loop, pools and draw.
        //  Busiest late (22:00–03:00), a handful by day. They push the restroom doors.
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

        class ClubLife extends VenueCrowd {
            SEATS = CLUB_SEATS;      // read by worldQuery.getSeats (directory/world-query.js)
            DRINKS = CLUB_DRINKS;
            constructor() { super('moon_city_nightclub'); }

            /** The dance floor, and the staff on shift. */
            _setUp(game) {
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
            }

            /** How full the club is: the density setting, scaled by the hour (busiest 22:00–03:00). */
            _target(game) {
                const base = CLUB_CROWD[GameSettings.pedestrianDensity] || CLUB_CROWD.medium;
                const h = (((game.worldMinutes || 0) / 60) % 24 + 24) % 24;
                const k = h >= 22 || h < 3 ? 1 : h >= 20 ? 0.6 + (h - 20) * 0.2 : h < 5 ? 1 - (h - 3) * 0.3 : h >= 17 ? 0.35 : 0.2;
                return Math.max(3, Math.round(base * k));
            }

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
        }
