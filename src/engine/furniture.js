        // ============================================================================
        //  FURNITURE — grab and move the apartment's furniture (apt_949 only)
        //  The hand pill (#btn-grab, G) shows by a movable piece. Press it: four gold
        //  handles appear on the piece's sides (the nearest picked); tap one, or press a
        //  direction, then G / tap again. 949 walks to that side (Walker.goTo), faces it
        //  and takes hold. Holding: she moves at 0.4× and the piece goes with her — push,
        //  pull or slide — and never into a wall or another piece (if it would, neither
        //  moves). R / ⟲ ⟳ turn it 15°. G, Esc or leaving lets go. The layout is kept
        //  (questState.aptLayout) and comes back each visit; long-press the hand to reset.
        //  Ticked from engine/update.js (update before input, afterCollision after the
        //  collision pass), drawn after the characters (engine/draw.js).
        // ============================================================================
        const FURNITURE_GRAB = {
            MAP: 'apt_949', RANGE: 90, MOVE_MUL: 0.4, GRIP_GAP: 16, TURN: Math.PI / 12,
            // What can be moved, and what it's called on the pill
            NAMES: { apt_sofa: 'Sofa', apt_coffee: 'Coffee Table', apt_chair: 'Armchair', apt_console: 'Console', apt_plant: 'Plant',
                     apt_planter: 'Planter', apt_stool: 'Stool', apt_bed: 'Bed', apt_side: 'Side Table', apt_lounger: 'Lounger',
                     apt_bistro: 'Bistro Set', apt_telescope: 'Telescope' }
        };

        class FurnitureSystem {
            constructor(game) { this.game = game; this.state = 'idle'; this.target = null; this.side = 0; this.cand = null; }

            /** Busy choosing a side, walking to it or holding something (blocks firing). */
            busy() { return this.state !== 'idle'; }
            get holding() { return this.state === 'hold'; }

            _grabbable(p) { return p && p.decorType && FURNITURE_GRAB.NAMES[p.decorType] && !p.interactionType?.startsWith('lost'); }
            _layout() { const q = this.game.questState || (this.game.questState = {}); return q.aptLayout || (q.aptLayout = {}); }

            /** The apartment was just built: number its pieces, pin the movable ones heavy, put them where they were left. */
            onMapLoaded(game) {
                this.release(true);
                if (!game.activeMap || game.activeMap.id !== FURNITURE_GRAB.MAP) return;
                if (game.questState) game.questState.aptVisited = true;          // she's been home: the furniture is hers (Inventory → Items)
                const L = (game.questState && game.questState.aptLayout) || {};
                game.activeMap.props.forEach((p, i) => {
                    p._aptIdx = i;
                    if (!this._grabbable(p)) return;
                    p.mass = 1e7;                                                 // furniture: it stays put unless she moves it
                    p._home = [p.x, p.y, p.angle || 0];
                    const s = L[i];
                    if (s) { p.x = s[0] - p.width / 2; p.y = s[1] - p.height / 2; p.angle = s[2]; }
                });
            }

            /** Put every piece back where the apartment had it. */
            resetLayout() {
                const g = this.game; this.release(true);
                if (g.questState) g.questState.aptLayout = {};
                for (const p of g.props || []) if (p._home) { [p.x, p.y, p.angle] = p._home; }
                showMessage('FURNITURE BACK WHERE IT WAS');
            }

            // --- geometry -------------------------------------------------------------
            _c(p) { return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; }
            _corners(cx, cy, w, h, a) {
                const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hh = h / 2;
                return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
            }
            _sat(A, B) {
                for (const P of [A, B]) for (let i = 0; i < 4; i++) {
                    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], nx = y1 - y2, ny = x2 - x1;
                    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
                    for (const [x, y] of A) { const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
                    for (const [x, y] of B) { const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
                    if (a1 <= b0 || b1 <= a0) return false;
                }
                return true;
            }
            /** Would the piece, centred at (cx, cy) and turned to a, run into a wall, another piece or the map's edge? */
            _blocked(p, cx, cy, a) {
                const g = this.game, M = g.activeMap, A = this._corners(cx, cy, p.width - 2, p.height - 2, a);
                for (const [x, y] of A) if (x < 0 || y < 0 || x > M.width || y > M.height) return true;
                for (const w of M.walls || []) if (this._sat(A, [[w.x, w.y], [w.x + w.w, w.y], [w.x + w.w, w.y + w.h], [w.x, w.y + w.h]])) return true;
                for (const o of g.props || []) {
                    if (o === p || o.hasCollision === false || o.noNav) continue;
                    const c = this._c(o);
                    if (Math.abs(c.x - cx) > (o.width + o.height + p.width + p.height) / 1.4) continue;
                    if (this._sat(A, this._corners(c.x, c.y, o.width, o.height, o.angle || 0))) return true;
                }
                return false;
            }
            /** Where she stands to hold side s (0 its +x face, 1 +y, 2 −x, 3 −y, in the piece's own frame). */
            _grip(p, s) {
                const c = this._c(p), a = p.angle || 0, gap = FURNITURE_GRAB.GRIP_GAP + (this.game.player.radius || 12);
                const lx = s === 0 ? p.width / 2 + gap : s === 2 ? -p.width / 2 - gap : 0, ly = s === 1 ? p.height / 2 + gap : s === 3 ? -p.height / 2 - gap : 0;
                return { x: c.x + lx * Math.cos(a) - ly * Math.sin(a), y: c.y + lx * Math.sin(a) + ly * Math.cos(a) };
            }
            _nearestSide(p, x, y) {
                const c = this._c(p), a = p.angle || 0, dx = x - c.x, dy = y - c.y;
                const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
                return Math.abs(lx) / p.width > Math.abs(ly) / p.height ? (lx > 0 ? 0 : 2) : (ly > 0 ? 1 : 3);
            }
            _distTo(p, x, y) {                                                    // from (x, y) to the piece's edge
                const c = this._c(p), a = p.angle || 0, dx = x - c.x, dy = y - c.y;
                const lx = Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) - p.width / 2, ly = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) - p.height / 2;
                return Math.hypot(Math.max(0, lx), Math.max(0, ly));
            }

            // --- the hand ------------------------------------------------------------
            /** The hand pill / G: grab the nearest piece → confirm the side → let go. */
            press() {
                const g = this.game, pl = g.player;
                if (this.state === 'idle') {
                    if (!this.cand) return;
                    this.target = this.cand; this.side = this._nearestSide(this.target, pl.x, pl.y); this.state = 'choose';
                    if (typeof audioSys !== 'undefined') audioSys.sfx('ui');
                } else if (this.state === 'choose') this._walkTo();
                else this.release();
            }

            /** Choosing: pick the side facing a direction (arrows / WASD). */
            chooseDir(dx, dy) {
                if (this.state !== 'choose' || !this.target) return;
                const a = this.target.angle || 0;
                let best = 0, bd = -Infinity;
                for (let s = 0; s < 4; s++) { const na = a + s * Math.PI / 2, d = Math.cos(na) * dx + Math.sin(na) * dy; if (d > bd) { bd = d; best = s; } }
                this.side = best;
            }

            /** A tap / click while choosing: on a handle picks that side (tapping the picked one confirms). True if handled. */
            tap(wx, wy) {
                if (this.state !== 'choose' || !this.target) return false;
                for (let s = 0; s < 4; s++) {
                    const h = this._handle(this.target, s);
                    if (Math.hypot(h.x - wx, h.y - wy) < 24) { if (s === this.side) this._walkTo(); else this.side = s; return true; }
                }
                return false;
            }

            _handle(p, s) { const gp = this._grip(p, s), c = this._c(p); return { x: gp.x + (c.x - gp.x) * 0.3, y: gp.y + (c.y - gp.y) * 0.3 }; }

            _walkTo() {
                const p = this.target, gp = this._grip(p, this.side), c = this._c(p);
                this.state = 'walk';
                Walker.goTo(this.game.player, gp.x, gp.y, { face: [c.x, c.y], arrive: 5, timeout: 240,
                    onArrive: () => this._attach(), onFail: () => { showMessage("CAN'T REACH THAT SIDE"); this.release(true); } });
            }

            _attach() {
                const g = this.game, p = this.target, c = this._c(p);
                if (!p || this.state !== 'walk') return;
                this.state = 'hold';
                this.off = { x: c.x - g.player.x, y: c.y - g.player.y };
                g.player.moveMul = FURNITURE_GRAB.MOVE_MUL;
                if (typeof audioSys !== 'undefined') audioSys.sfx('ui');
            }

            /** Let go (and keep where it was left). */
            release(silent) {
                const g = this.game;
                if (this.state === 'walk') Walker.cancel(g.player);
                if (this.state === 'hold' && this.target && this.target._aptIdx !== undefined) {
                    const c = this._c(this.target); this._layout()[this.target._aptIdx] = [Math.round(c.x), Math.round(c.y), +(this.target.angle || 0).toFixed(4)];
                }
                if (g.player) g.player.moveMul = 1;
                this.state = 'idle'; this.target = null;
            }

            /** Turn the held piece 15° about its middle; she stays on her side. */
            rotate(dir) {
                if (this.state !== 'hold') return;
                const g = this.game, p = this.target, c = this._c(p), na = (p.angle || 0) + dir * FURNITURE_GRAB.TURN;
                if (this._blocked(p, c.x, c.y, na)) { showMessage('NO ROOM TO TURN IT'); return; }
                const old = p.angle; p.angle = na;
                const gp = this._grip(p, this.side), nav = NavGrid.for(g.activeMap);
                if (nav && !nav.walkable(gp.x, gp.y)) { p.angle = old; showMessage('NO ROOM TO TURN IT'); return; }
                g.player.x = gp.x; g.player.y = gp.y; resetHumanoidAnim(g.player);
                this.off = { x: c.x - gp.x, y: c.y - gp.y };
            }

            // --- each tick ------------------------------------------------------------
            /** Before input: the pill, the nearest candidate, and (holding) where she started this tick. */
            update(game) {
                const btn = this._btn || (this._btn = document.getElementById('btn-grab'));
                const rot = this._rot || (this._rot = document.getElementById('grab-rotate'));
                const here = game.activeMap && game.activeMap.id === FURNITURE_GRAB.MAP && !game.isDriving && !game.paused;
                if (!here) { if (this.state !== 'idle') this.release(); if (btn) btn.style.display = 'none'; if (rot) rot.style.display = 'none'; this.cand = null; return; }
                const pl = game.player;
                if (this.state === 'walk' && !Walker.isWalking(pl)) { if (this.state === 'walk') this.release(true); }   // she walked off (real input took over)
                if (this.state === 'idle') {
                    let best = null, bd = FURNITURE_GRAB.RANGE;
                    for (const p of game.props || []) { if (!this._grabbable(p)) continue; const d = this._distTo(p, pl.x, pl.y); if (d < bd) { bd = d; best = p; } }
                    this.cand = best;
                }
                if (this.state === 'hold') this._prev = { x: pl.x, y: pl.y };
                if (btn) {
                    const name = this.target ? FURNITURE_GRAB.NAMES[this.target.decorType] : this.cand ? FURNITURE_GRAB.NAMES[this.cand.decorType] : '';
                    btn.style.display = this.state !== 'idle' || this.cand ? 'flex' : 'none';
                    if (btn.style.display === 'flex') setActionPill(btn, this.state === 'idle' ? 'Grab' : this.state === 'choose' ? 'Hold' : this.state === 'walk' ? 'Grab' : 'Let go', name, 'G');
                }
                if (rot) rot.style.display = this.state === 'hold' ? 'flex' : 'none';
            }

            /** After the collision pass: the held piece follows her, or (if it'd hit something) neither moves. */
            afterCollision(game) {
                if (this.state !== 'hold' || !this.target) return;
                const p = this.target, pl = game.player, cx = pl.x + this.off.x, cy = pl.y + this.off.y;
                if (this._blocked(p, cx, cy, p.angle || 0)) { if (this._prev) { pl.x = this._prev.x; pl.y = this._prev.y; } }
                else { p.x = cx - p.width / 2; p.y = cy - p.height / 2; p.vx = p.vy = 0; p._still = 0; }
                const c = this._c(p); pl.angle = Math.atan2(c.y - pl.y, c.x - pl.x);   // she keeps her hands on it
            }

            // --- drawing ---------------------------------------------------------------
            draw(ctx) {
                const g = this.game; if (!g.activeMap || g.activeMap.id !== FURNITURE_GRAB.MAP) return;
                const p = this.target || this.cand; if (!p) return;
                const c = this._c(p), a = p.angle || 0, t = _gameTimeSec;
                ctx.save();
                ctx.translate(c.x, c.y); ctx.rotate(a);
                ctx.strokeStyle = `rgba(232, 194, 122, ${this.state === 'idle' ? 0.35 + 0.15 * Math.sin(t * 3) : 0.7})`;
                ctx.lineWidth = this.state === 'idle' ? 1 : 1.6; ctx.setLineDash(this.state === 'idle' ? [4, 4] : []);
                ctx.strokeRect(-p.width / 2 - 3, -p.height / 2 - 3, p.width + 6, p.height + 6);
                ctx.setLineDash([]);
                ctx.restore();
                if (this.state === 'choose' || this.state === 'walk') {
                    for (let s = 0; s < 4; s++) {                                     // a gold chevron on each side, pointing in
                        const h = this._handle(p, s), ang = a + s * Math.PI / 2 + Math.PI, on = s === this.side, k = on ? 1.35 + 0.15 * Math.sin(t * 6) : 1;
                        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang); ctx.scale(k, k);
                        if (on) { ctx.globalAlpha = 0.45; drawGlow(ctx, 0, 0, 16, '232, 194, 122', 0); ctx.globalAlpha = 1; }
                        ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(4, 0); ctx.lineTo(-5, 7); ctx.lineTo(-2, 0); ctx.closePath();
                        ctx.fillStyle = on ? '#fff1c2' : 'rgba(232, 194, 122, 0.75)'; ctx.fill();
                        ctx.strokeStyle = 'rgba(40, 20, 10, 0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        }
