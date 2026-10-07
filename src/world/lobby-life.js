        // ============================================================================
        //  LOBBY LIFE — the Double Nights lobby's guests and AI staff (hotel_lobby only)
        //  Guests step out of the portals or in at the doors, check in at the desk, then
        //  take the elevators, sit a while in the lounges, or leave the way they came.
        //  Gold bellhops push luggage carts, Blood Moon concierges attend the waiting,
        //  a silver valet carries cases. They're ambient walkers, not NPCs: no dialogue,
        //  no prompts, no minimap dots — cheap, and they can't trip the story.
        //  Updated from engine/update.js, drawn with the characters (engine/draw.js).
        // ============================================================================
        const LOBBY_PORTALS = [[215, 185], [785, 185]];
        const LOBBY_DEPARTURES = [
            ["VEL'SHARA", 'ON TIME'], ['THE UNDERSKY', 'BOARDING'], ['MOONFALL STATION', 'ON TIME'],
            ['AURELIAN REACH', 'DELAYED'], ['THE VIOLET MILE', 'ON TIME'], ['SOUTHERN DIMENSIONS', 'ARRIVED'],
            ['HALCYON DEEP', 'BOARDING'], ['THE NIGHT ORCHARD', 'ON TIME'], ['SILVER TIDE', 'DELAYED']
        ];
        const LOBBY_SPOTS = {
            door: [500, 1122],
            elevators: [[108, 450], [108, 650], [892, 450], [892, 650]],
            desk: [[438, 652], [500, 664], [562, 652], [468, 712], [532, 712]],     // the queue before reception
            lounge: [[250, 880], [250, 740], [160, 860], [750, 880], [750, 740], [840, 860], [400, 950], [600, 950]],
            mill: [[380, 450], [620, 450], [300, 560], [700, 560], [420, 1000], [580, 1000], [200, 640], [800, 640]],
            posts: [[410, 630], [590, 630]]                                          // where concierges wait
        };
        // Population by the pedestrian density setting
        const LOBBY_GUESTS = { low: 8, medium: 14, high: 20 };

        class LobbyLife {
            constructor() { this.walkers = []; this.map = null; this.spots = null; }

            /** Fresh crowd for a (re)entered lobby. */
            reset(game) {
                this.walkers = []; this.map = game.activeMap; this._spawnTimer = 0;
                const nav = NavGrid.for(this.map), snap = ([x, y]) => { const f = nav && nav.nearestFree(x, y, 4); return f !== null && f !== undefined ? [nav.cx(f), nav.cy(f)] : [x, y]; };
                const S = LOBBY_SPOTS;
                this.spots = { door: snap(S.door), elevators: S.elevators.map(snap), desk: S.desk.map(snap), lounge: S.lounge.map(snap), mill: S.mill.map(snap), posts: S.posts.map(snap), portals: LOBBY_PORTALS.map(snap) };
                const r = Math.random;
                // Staff: two gold bellhops with carts, two Blood Moon concierges, a silver valet
                for (const [kind, finish] of [['bellhop', 'gold'], ['bellhop', 'gold'], ['concierge', 'bloodmoon'], ['concierge', 'bloodmoon'], ['valet', 'silver']]) {
                    const p = kind === 'concierge' ? this.spots.posts[this.walkers.length % 2] : pickFrom(r, this.spots.mill);
                    const w = this._make(kind, p[0], p[1], ROLE_LOOKS.dn_staff(finish, seededRandom('dn' + this.walkers.length)));
                    w.life = 1; w.speed = kind === 'concierge' ? 1.5 : 1.7;
                    if (kind === 'valet') w.bag = { type: 'case', color: '#2a2a34' };
                    this.walkers.push(w);
                }
                // Guests already about the place
                const n = this._target();
                for (let i = 0; i < Math.round(n * 0.7); i++) this._spawnGuest(true);
            }

            /** The nearest walkable spot to (x, y). */
            _free(x, y) { const nav = NavGrid.for(this.map), f = nav && nav.nearestFree(x, y, 4); return f !== null && f !== undefined ? [nav.cx(f), nav.cy(f)] : [x, y]; }

            _target() { return LOBBY_GUESTS[GameSettings.pedestrianDensity] || LOBBY_GUESTS.medium; }

            _make(kind, x, y, look) {
                return { kind, x, y, angle: Math.PI / 2, walkPhase: 0, look, life: 0, fade: 0, steps: [], timer: 0, speed: 1.5, stuck: 0, lastD: Infinity };
            }

            /** A guest arrives: from a portal (in a bloom), through the doors, or (at start) already mid-visit. */
            _spawnGuest(midVisit) {
                const r = Math.random, S = this.spots;
                const aps = Pedestrian.APPEARANCES.filter(a => a.name !== 'worker' && a.name !== 'delivery');
                const look = ROLE_LOOKS.pedestrian(pickFrom(r, aps), seededRandom('guest' + r()));
                look.umbrella = null; look.rainHood = false;
                let from = r() < 0.6 ? 'portal' : 'door', p = from === 'portal' ? pickFrom(r, S.portals) : S.door;
                if (midVisit) { p = pickFrom(r, S.mill.concat(S.lounge)); from = 'mid'; }
                const g = this._make('guest', p[0] + (r() - 0.5) * 10, p[1] + (r() - 0.5) * 10, look);
                g.from = from; g.speed = 1.3 + r() * 0.5; g.fade = from === 'mid' ? 0 : from === 'portal' ? 0.025 : 0.06;
                g.life = from === 'mid' ? 1 : 0; g.angle = from === 'door' ? -Math.PI / 2 : Math.PI / 2;
                const bag = r();
                if (bag < 0.55) g.bag = { type: 'roller', color: pickFrom(r, ['#1a1a22', '#5a0f1e', '#c9ccd8', '#2b3a55', '#d9b45a', '#3a2a4a']) };
                else if (bag < 0.7) g.bag = { type: 'garment', color: pickFrom(r, ['#1a1a1a', '#2d132c']) };
                else if (bag < 0.8) g.bag = { type: 'hatbox', color: pickFrom(r, ['#e8b4b8', '#f3e6c8', '#8a1024']) };
                // Itinerary: the desk (if there's room in the queue), then onward
                if (!midVisit && r() < 0.8) g.steps.push({ desk: true, wait: 150 + r() * 200 | 0, pose: pickFrom(r, ['idle', 'breathe', 'phone']) });
                const next = r();
                if (next < 0.4) g.steps.push({ exit: 'elevator', go: pickFrom(r, S.elevators) });
                else {
                    if (next < 0.7) g.steps.push({ go: pickFrom(r, S.lounge), wait: 300 + r() * 600 | 0, pose: pickFrom(r, ['breathe', 'phone', 'arms_crossed', 'idle']) });
                    else g.steps.push({ go: pickFrom(r, S.mill), wait: 120 + r() * 240 | 0, pose: pickFrom(r, ['idle', 'fidget', 'phone']) });
                    g.steps.push(r() < 0.55 ? { exit: 'portal', go: pickFrom(r, S.portals) } : { exit: 'door', go: S.door });
                }
                this.walkers.push(g);
            }

            update(game) {
                if (!game.activeMap || game.activeMap.id !== 'hotel_lobby') { if (this.walkers.length) { this.walkers = []; this.map = null; } return; }
                if (this.map !== game.activeMap) this.reset(game);
                let guests = 0; for (const w of this.walkers) if (w.kind === 'guest') guests++;
                // Arrivals keep pace with departures: quicker when the lobby is thin
                if (--this._spawnTimer <= 0 && guests < this._target()) { this._spawnGuest(false); this._spawnTimer = (guests < this._target() * 0.75 ? 25 : 60) + Math.random() * 50 | 0; }
                const pl = game.player, M = game.activeMap;
                for (let i = this.walkers.length - 1; i >= 0; i--) {
                    const w = this.walkers[i];
                    // Fading in (arrival) or out (departure)
                    if (w.fade > 0) { w.life = Math.min(1, w.life + w.fade); if (w.life >= 1) w.fade = 0; }
                    if (w.fade < 0) { w.life += w.fade; if (w.life <= 0) { this.walkers.splice(i, 1); continue; } }
                    if (w.kind !== 'guest') this._staffThink(w);
                    const step = w.steps[0];
                    if (!step) { if (w.kind === 'guest' && w.fade >= 0) w.fade = -0.04; continue; }
                    // The desk: take a free place in the queue, or skip it when the queue is full
                    if (step.desk && !step.go) {
                        const S = this.spots.desk, taken = new Set(this.walkers.filter(o => o !== w && o._slot !== undefined).map(o => o._slot));
                        const slot = S.findIndex((_, k) => !taken.has(k));
                        if (slot < 0) { w.steps.shift(); continue; }
                        w._slot = slot; step.go = S[slot]; step.face = [500, 590];
                    }
                    const [gx, gy] = step.go, d = Math.hypot(gx - w.x, gy - w.y);
                    if (d > 6) {
                        let s = actorSteer(w, gx, gy, w.speed, M), vx = s.x, vy = s.y;
                        // Make way for 949, and keep a little room from one another
                        for (const mw of game._makeWay || [pl]) {                          // make way for 949 and her crew
                            const px = w.x - mw.x, py = w.y - mw.y, pd = Math.hypot(px, py);
                            if (pd < 34 && pd > 0.1) { vx += (px / pd) * 0.9 - (py / pd) * 0.5; vy += (py / pd) * 0.9 + (px / pd) * 0.5; }
                        }
                        for (const o of this.walkers) {
                            if (o === w || o.life < 0.5) continue;
                            const ox = w.x - o.x, oy = w.y - o.y, od = Math.hypot(ox, oy);
                            if (od < 20 && od > 0.1) { vx += (ox / od) * 0.35; vy += (oy / od) * 0.35; }
                        }
                        const nav = NavGrid.for(M);
                        if (nav && !nav.lineWalkable(w.x, w.y, w.x + vx, w.y + vy)) { vx = s.x; vy = s.y; }     // never shoved into furniture
                        gaitCommand(w, vx, vy); w.x += vx; w.y += vy;
                        if (Math.abs(vx) + Math.abs(vy) > 0.05) w.angle = Math.atan2(vy, vx);
                        // Stuck? (blocked by a crowd): give up on this stop after a while
                        const remaining = navWaypoint(w, gx, gy, M).remaining;
                        if (remaining < w.lastD - 0.2) { w.lastD = remaining; w.stuck = 0; } else if (++w.stuck > 360) { w.steps.shift(); w._slot = undefined; w.stuck = 0; w.lastD = Infinity; }
                        w.look.pose = undefined;
                        continue;
                    }
                    // Arrived
                    w.lastD = Infinity; w.stuck = 0;
                    if (step.exit) {                                                   // gone: into the lift, the portal, the night
                        if (w.fade >= 0) { w.fade = step.exit === 'portal' ? -0.025 : -0.05; w.exitKind = step.exit; if (step.exit === 'elevator') w.angle = w.x < 500 ? Math.PI : 0; }
                        continue;
                    }
                    if (step.face) w.angle = Math.atan2(step.face[1] - w.y, step.face[0] - w.x);
                    w.look.pose = step.pose;
                    w.waiting = true;
                    if (--step.wait <= 0) { w.steps.shift(); w.waiting = false; w.attended = false; if (step.desk) w._slot = undefined; }
                }
                // Luggage follows its owner (rollers trail behind)
                for (const w of this.walkers) if (w.bag && w.bag.type === 'roller') {
                    const tx = w.x - Math.cos(w.angle) * 16 + Math.cos(w.angle + Math.PI / 2) * 7, ty = w.y - Math.sin(w.angle) * 16 + Math.sin(w.angle + Math.PI / 2) * 7;
                    if (w.bag.bx === undefined) { w.bag.bx = tx; w.bag.by = ty; }
                    w.bag.bx += (tx - w.bag.bx) * 0.25; w.bag.by += (ty - w.bag.by) * 0.25;
                }
            }

            /** Staff: bellhops and the valet do rounds; concierges attend whoever is waiting. */
            _staffThink(w) {
                if (w.steps.length) return;
                const r = Math.random, S = this.spots;
                if (w.kind === 'concierge') {
                    const guest = this.walkers.find(g => g.kind === 'guest' && g.waiting && !g.attended && g.life >= 1);
                    if (guest) {
                        guest.attended = true;
                        const side = Math.cos(guest.angle + Math.PI / 2) > 0 ? 1 : -1;
                        w.steps.push({ go: this._free(guest.x + side * 26, guest.y + 10), face: [guest.x, guest.y], wait: 220, pose: 'concierge' });
                    } else w.steps.push({ go: S.posts[this.walkers.indexOf(w) % 2], face: [500, 1000], wait: 90, pose: 'concierge' });
                } else if (w.kind === 'bellhop') {
                    w.steps.push({ go: pickFrom(r, S.portals.concat([S.door])), wait: 80, pose: 'polish' },
                                 { go: pickFrom(r, S.elevators), wait: 100, pose: 'concierge' });
                } else {
                    w.steps.push({ go: S.door, wait: 90, pose: 'concierge' }, { go: pickFrom(r, S.elevators), wait: 90, pose: 'concierge' });
                }
            }

            /** The walkers, the luggage and the carts; blooms where they step through portals. */
            draw(ctx, cb) {
                if (!this.walkers.length) return;
                const t = _frameTime / 1000;
                // In view only (one reused list, sorted by depth); the rest keep their gait (footsteps) ticking
                const list = this._drawList || (this._drawList = []); list.length = 0;
                for (const w of this.walkers) { if (!cb || (w.x > cb.left && w.x < cb.right && w.y > cb.top && w.y < cb.bottom)) list.push(w); else { syncHumanoidGait(w); RenderStats.culled++; } }
                list.sort(_byY);
                for (const w of list) {
                    // Portal arrivals and departures: a violet-gold bloom that fades as they solidify
                    if (w.life < 1 && (w.from === 'portal' || w.exitKind === 'portal')) {
                        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - w.life) * 0.8;
                        drawGlow(ctx, w.x, w.y, 34, '200, 150, 255', 0);
                        ctx.strokeStyle = 'rgba(232,194,122,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w.x, w.y, 10 + (1 - w.life) * 16, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                    }
                    const b = w.bag;
                    if (b && b.type === 'roller' && b.bx !== undefined) {                // a suitcase rolled behind
                        ctx.save(); ctx.globalAlpha = w.life; ctx.translate(b.bx, b.by); ctx.rotate(w.angle);
                        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-5, -6, 12, 14);
                        ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(-7, -7, 12, 14, 2); ctx.fill();
                        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-6, -1, 10, 1);
                        ctx.restore();
                        ctx.save(); ctx.globalAlpha = w.life * 0.8; ctx.strokeStyle = '#8a90a8'; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(b.bx + Math.cos(w.angle) * 5, b.by + Math.sin(w.angle) * 5); ctx.lineTo(w.x + Math.cos(w.angle + Math.PI / 2) * 7, w.y + Math.sin(w.angle + Math.PI / 2) * 7); ctx.stroke();
                        ctx.restore();
                    }
                    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.angle); ctx.globalAlpha = w.life;
                    if (w.kind === 'bellhop') {                                       // the gold luggage cart, pushed ahead
                        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(15, -12, 30, 26);
                        ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 2; ctx.strokeRect(14, -13, 28, 26);
                        ctx.fillStyle = '#5a0f1e'; ctx.fillRect(17, -10, 10, 9); ctx.fillStyle = '#c9ccd8'; ctx.fillRect(28, -10, 11, 11);
                        ctx.fillStyle = '#2b3a55'; ctx.fillRect(17, 1, 22, 9);
                        ctx.strokeStyle = '#e8c27a'; ctx.beginPath(); ctx.moveTo(14, -13); ctx.quadraticCurveTo(28, -22, 42, -13); ctx.stroke();
                    }
                    drawCrowdHumanoid(ctx, w, { stance: 'idle', ...w.look });                // by Crowd Quality (ui/crowd-impostors.js)
                    if (b && b.type !== 'roller') {                                   // carried: a case, a garment bag, a hat box
                        ctx.fillStyle = b.color;
                        if (b.type === 'case') { ctx.fillRect(-2, 9, 12, 5); ctx.fillStyle = '#e8c27a'; ctx.fillRect(3, 8, 3, 1); }
                        else if (b.type === 'garment') { ctx.beginPath(); ctx.roundRect(-10, 8, 20, 5, 2); ctx.fill(); }
                        else { ctx.beginPath(); ctx.arc(2, 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 0.8; ctx.stroke(); }
                    }
                    ctx.restore();
                }
            }
        }
