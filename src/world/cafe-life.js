        // ============================================================================
        //  CAFE LIFE — the Cozy Cafe's guests (cozy_cafe_interior only)
        //  They come in from the street, queue at the counter, order, wait for their cup
        //  at the pick-up end, and settle in for a while: a round table by a candle, an
        //  armchair by the fire, a booth, the window bench. Some browse the books or the
        //  pastry case first; friends come in pairs and share a table. Visits are long and
        //  calm (a minute or two seated), the walk unhurried. A second barista carries
        //  cups out to the tables and polishes. Busy in the morning and late afternoon,
        //  a few night owls after dark. Built on ClubLife's walker loop (world/club-life.js):
        //  ambient walkers, not NPCs — no dialogue, no prompts. Updated from update.js,
        //  drawn with the characters (draw.js), by Crowd Quality.
        // ============================================================================
        const CAFE_GATE = [600, 896];
        const CAFE_SPOTS = {
            queue: [[300, 304], [300, 332], [300, 360], [300, 388]], orderAt: [300, 250],
            pickup: [[170, 304], [212, 304]], pickupAt: [190, 250],
            pastry: [[366, 306], [396, 306]], books: [[480, 104], [530, 104], [580, 104]], record: [650, 106],
            staffHome: [150, 206], staffGap: [86, 262]
        };
        const CAFE_DRINKS = ['latte', 'latte', 'tea', 'cocoa', 'espresso', 'latte', 'tea'];
        const CAFE_CROWD = { low: 6, medium: 10, high: 14 };
        // Seats: where you sit, where you step up to it from, which way you face. (Chairs come in
        // pairs, a table's two: chair 2k and 2k+1, so friends can take a table together.)
        const CAFE_SEATS = {
            chair: CAFE_TABLES.flatMap(([cx, cy]) => [
                { at: [cx - 48, cy], from: [cx - 48, cy + 34], face: 0 },
                { at: [cx + 48, cy], from: [cx + 48, cy + 34], face: Math.PI }]),
            hearth: [
                { at: [167, 433], from: [167, 476], face: Math.PI / 2 }, { at: [167, 641], from: [167, 600], face: -Math.PI / 2 },
                { at: [309, 515], from: [262, 515], face: Math.PI }, { at: [309, 565], from: [262, 565], face: Math.PI }],
            booth: CAFE_BOOTHS.flatMap(cy => [
                { at: [987, cy - 17], from: [944, cy - 17], face: 0 }, { at: [987, cy + 17], from: [944, cy + 17], face: 0 },
                { at: [1125, cy - 17], from: [1068, cy + 58], face: Math.PI }, { at: [1125, cy + 17], from: [1068, cy + 58], face: Math.PI }]),
            bench: [[105, 926], [222, 926], [288, 926], [398, 926], [792, 926], [892, 926]].map(([x, y]) => ({ at: [x, y], from: [x, 878], face: -Math.PI / 2 }))
        };

        class CafeLife extends ClubLife {
            constructor() { super(); this.mapId = 'cozy_cafe_interior'; }

            /** A fresh café: the barista on shift, and the day's regulars already settled in. */
            reset(game) {
                this.walkers = []; this.map = game.activeMap; this._spawnTimer = 0; this.taken = new Map();
                const nav = NavGrid.for(this.map);
                this._snap = ([x, y]) => { const f = nav && nav.nearestFree(x, y, 4); return f !== null && f !== undefined ? [nav.cx(f), nav.cy(f)] : [x, y]; };
                const staff = this._make('runner', CAFE_SPOTS.staffHome[0], CAFE_SPOTS.staffHome[1], ROLE_LOOKS.cafe_staff(seededRandom('cafe_staff')));
                staff.life = 1; staff.speed = 1.2;
                this.walkers.push(staff);
                const n = this._target(game);
                for (let i = 0; i < Math.round(n * 0.75); i++) this._spawnGuest(true);
            }

            /** How full: the density setting, scaled by the hour (mornings and late afternoons are busy). */
            _target(game) {
                const base = CAFE_CROWD[GameSettings.pedestrianDensity] || CAFE_CROWD.medium;
                const h = (((game.worldMinutes || 0) / 60) % 24 + 24) % 24;
                const k = h >= 7 && h < 10 ? 1 : h >= 10 && h < 14 ? 0.7 : h >= 14 && h < 18 ? 0.9 : h >= 18 && h < 22 ? 0.55 : h >= 22 || h < 2 ? 0.3 : 0.12;
                return Math.max(1, Math.round(base * k));
            }

            /** A guest (or two friends) walks in; when the café is entered, some are already seated, cup in hand. */
            _spawnGuest(midVisit) {
                const r = Math.random;
                const pair = !midVisit && r() < 0.3;
                const party = [];
                for (let k = 0; k < (pair ? 2 : 1); k++) {
                    const look = ROLE_LOOKS.cafegoer(seededRandom('cafe' + r()));
                    const p = midVisit ? CAFE_GATE : [CAFE_GATE[0] + (k ? 22 : 0), CAFE_GATE[1] + (k ? 10 : 0)];
                    const g = this._make('guest', p[0], p[1], look);
                    g.speed = 0.85 + r() * 0.35; g.fade = midVisit ? 0 : 0.04; g.life = midVisit ? 1 : 0;
                    party.push(g);
                }
                const mug = () => ({ type: 'glass', drink: pickFrom(r, CAFE_DRINKS), hand: 'right' });
                // Friends: one table, a chair each
                let pairChairs = null;
                if (pair) {
                    const set = this.taken.get('chair') || (this.taken.set('chair', new Map()), this.taken.get('chair'));
                    const free = []; for (let t = 0; t < CAFE_SEATS.chair.length / 2; t++) if (!set.has(2 * t) && !set.has(2 * t + 1)) free.push(t);
                    if (free.length) { const t = free[r() * free.length | 0]; set.set(2 * t, party[0]); set.set(2 * t + 1, party[1]); pairChairs = [2 * t, 2 * t + 1]; }
                }
                party.forEach((g, k) => {
                    const stay = 1800 + r() * 2700 | 0;                                 // a minute or two and a half, seated
                    if (midVisit) {
                        g.look.held = mug();
                        g.steps.push({ seat: pickFrom(r, ['chair', 'chair', 'hearth', 'booth', 'booth', 'bench']), wait: (stay * (0.2 + r() * 0.8)) | 0, pose: pickFrom(r, ['sit', 'sit', 'sit_lean', 'sit_phone', 'sit_work']) });
                    } else {
                        if (k === 0 || !pairChairs) g.steps.push({ order: true });     // (a friend lets the other order for both)
                        else g.steps.push({ go: CAFE_SPOTS.pastry[1], face: [396, 250], wait: 120 + r() * 120 | 0, pose: 'idle' });
                        g.steps.push({ go: CAFE_SPOTS.pickup[k], face: CAFE_SPOTS.pickupAt, wait: 80 + r() * 60 | 0, pose: 'idle', give: mug(), giveAt: 50, keep: true });
                        if (!pairChairs && r() < 0.3) g.steps.push(r() < 0.6 ? { browse: 'books' } : { browse: 'pastry' });
                        g.steps.push(pairChairs ? { seatIdx: pairChairs[k], pool: 'chair', wait: stay, pose: pickFrom(r, ['sit', 'sit_lean', 'sit']) }
                                                : { seat: pickFrom(r, ['chair', 'chair', 'chair', 'hearth', 'booth', 'booth', 'bench', 'bench']), wait: stay, pose: pickFrom(r, ['sit', 'sit', 'sit_lean', 'sit_phone', 'sit_work']) });
                    }
                    if (!pairChairs && r() < 0.2) g.steps.push({ browse: 'record' });
                    g.steps.push({ exit: true, go: CAFE_GATE });
                    this.walkers.push(g);
                });
            }

            /** Turn a planned activity into concrete stops (claiming what it needs). */
            _expand(w, step) {
                const r = Math.random, S = CAFE_SPOTS;
                if (step.order) {
                    const i = this._claim('queue', S.queue.length, w);
                    if (i < 0) return [{ go: this._snap([340, 430]), face: S.orderAt, wait: 120, pose: 'phone' }, { order: true }];   // a wait by the tables, then try again
                    return [{ go: S.queue[i], face: S.orderAt, wait: 120 + r() * 140 | 0, pose: pickFrom(r, ['idle', 'phone', 'idle']), pool: 'queue' }];
                }
                if (step.browse) {
                    if (step.browse === 'books') { const p = pickFrom(r, S.books); return [{ go: this._snap(p), face: [p[0], 50], wait: 200 + r() * 300 | 0, pose: 'idle' }]; }
                    if (step.browse === 'record') return [{ go: this._snap(S.record), face: [650, 50], wait: 150 + r() * 150 | 0, pose: 'idle' }];
                    return [{ go: S.pastry[0], face: [366, 250], wait: 150 + r() * 150 | 0, pose: 'idle' }];
                }
                if (step.seat || step.seatIdx !== undefined) {
                    let pool = step.seat || step.pool, i = step.seatIdx;
                    if (i === undefined) {
                        i = this._claim(pool, CAFE_SEATS[pool].length, w);
                        for (const alt of ['chair', 'booth', 'bench', 'hearth']) { if (i >= 0) break; pool = alt; i = this._claim(alt, CAFE_SEATS[alt].length, w); }
                        if (i < 0) return [{ go: this._snap(pickFrom(r, S.books)), face: [500, 50], wait: 300, pose: 'phone' }];   // full: a look at the books, then home
                    }
                    const s = CAFE_SEATS[pool][i];
                    return [{ go: this._snap(s.from), seatAt: s.at, seatFace: s.face, wait: step.wait, pose: step.pose, pool }];
                }
                return [step];
            }

            /** The other barista: polishes behind the counter, carries a cup out to a table now and then. */
            _staffThink(w) {
                if (w.steps.length) return;
                const r = Math.random, S = CAFE_SPOTS;
                if (r() < 0.45) {
                    const [cx, cy] = pickFrom(r, CAFE_TABLES);
                    w.look.held = { type: 'glass', drink: pickFrom(r, CAFE_DRINKS), hand: 'right' };
                    w.steps.push({ go: S.staffGap, wait: 1 }, { go: this._snap([cx, cy + 36]), face: [cx, cy], wait: 70 + r() * 40 | 0, pose: 'idle', take: true, keep: true },   // the cup set down
                                 { go: S.staffGap, wait: 1 }, { go: S.staffHome, face: [150, 260], wait: 300 + r() * 300 | 0, pose: 'polish' });
                } else w.steps.push({ go: this._snap([120 + r() * 220, 200 + r() * 20]), face: [200, 260], wait: 240 + r() * 360 | 0, pose: 'polish' });
            }
        }
