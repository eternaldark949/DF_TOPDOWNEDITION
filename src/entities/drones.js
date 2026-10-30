        /* =====================================================================
           DRONES — the hunter-killers that come for the Dark Maker (the Double
           Nights ambush, story/story-db.js), after ETERNAL's concept sheet
           ---------------------------------------------------------------------
           A black armoured shell like a jellyfish's bell, a violet sensor-core
           eye at its front, cable tendrils trailing beneath, and two long jointed
           arms ending in crackling violet energy lances. It hovers.
             · armour: hits on the shell do ARMOR of their damage (a blade finds
               the seams: BLADE); hits on the glowing eye do EYE_MULT. After a
               lance dive the lances are stuck a moment and the shell opens (OPEN)
             · it arrives from above (DESCENT s, a shadow growing where it'll
               land; untouchable until it's down), and when it loses her for
               LOST s it rises and drops again near her
           Three kinds, each with its own move (one at a time, each telegraphed):
             lancer    LANCE: a locked line, then a dive that impales and burns
             grappler  GRAPPLE: a tether; caught, she's lifted and dragged to it
                       (a flit breaks free)
             seer      BEAM: a sensor beam that charges on her, then fires
                       straight through walls and cover
           The lancer and the grappler also spit violet bolts between moves.
           ===================================================================== */
        const DRONE = {
            HP: 110, ARMOR: 0.3, OPEN: 0.7, BLADE: 0.6, EYE_MULT: 1.8, EYE_R: 10, EYE_FWD: 15,
            DESCENT: 0.9, RISE: 0.6, LOST: 5, LAND_HIT: 10, LAND_R: 48, HOVER_PX: 7,
            BOLT_EVERY: 2.2, BOLT_TELL: 0.25,
            LANCE: { EVERY: 4.5, RANGE: 330, TELL: 0.65, LOCK: 0.15, SPEED: 15, DIST: 400, HIT: 18, BURN_DPS: 6, BURN_SECS: 2.5, RECOVER: 1.0 },
            GRAPPLE: { EVERY: 6.5, RANGE: 320, TELL: 0.5, SPEED: 15, HIT: 6, PULL: 2.8, SECS: 2.4, TICK: 0.5, TICK_DMG: 4, HOLD: 64 },
            BEAM: { EVERY: 5.5, RANGE: 640, CHARGE: 1.2, LOCK: 0.2, FIRE: 0.3, HIT: 22, WIDTH: 15 },
            KEEP: { lancer: 230, grappler: 210, seer: 330 }
        };
        const DRONE_KINDS = ['lancer', 'grappler', 'seer'];

        class Drone extends ActorEntity {
            constructor(x, y, kind) {
                super({ x, y, radius: 20, type: 'drone', alliance: 'hostile', hp: DRONE.HP, mass: 30, friction: 0.9, speed: 3,
                        hasCollision: true, invincibleDuration: 15 });
                this.kind = DRONE_KINDS.includes(kind) ? kind : DRONE_KINDS[Math.floor(Math.random() * DRONE_KINDS.length)];
                this.angle = Math.PI / 2;
                this.hoverOffset = Math.random() * Math.PI * 2;
                this.strafeDir = Math.random() > 0.5 ? 1 : -1; this.strafeTimer = 0;
                this.telegraphThreshold = 1; this.telegraphAngle = 0; this.isTelegraphing = false;
                // It drops in from above
                this.state = 'descend'; this.alt = 1; this._stateT = _gameTimeSec;
                this._moveAt = _gameTimeSec + DRONE.DESCENT + 1 + Math.random() * 1.5;
                this._boltAt = _gameTimeSec + DRONE.DESCENT + 1 + Math.random();
                this._lostSince = null;
                this._seed = Math.random() * 1000;
            }

            _setState(s) { this.state = s; this._stateT = _gameTimeSec; }

            /** Clear line, walls only (props are low: it hovers over them) */
            _los(px, py, walls) { return !isLineBlocked(this.x, this.y, px, py, walls, []); }

            /** Where its eye is (world) */
            eyePos() { return { x: this.x + Math.cos(this.angle) * DRONE.EYE_FWD, y: this.y + Math.sin(this.angle) * DRONE.EYE_FWD }; }

            update(playerX, playerY, walls) {
                if (this.dead) return null;
                const g = typeof game !== 'undefined' ? game : null, now = _gameTimeSec, age = now - this._stateT;
                this.hoverOffset += 0.08;
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                if (this.knockbackVx || this.knockbackVy) {
                    this.vx += this.knockbackVx; this.vy += this.knockbackVy;
                    this.knockbackVx *= this.knockbackFriction; this.knockbackVy *= this.knockbackFriction;
                    if (Math.abs(this.knockbackVx) < 0.1) this.knockbackVx = 0;
                    if (Math.abs(this.knockbackVy) < 0.1) this.knockbackVy = 0;
                }
                const dx = playerX - this.x, dy = playerY - this.y, dist = Math.hypot(dx, dy), toHer = Math.atan2(dy, dx);
                const turn = (to, k) => { this.angle += normalizeAngle(to - this.angle) * k; };
                let shot = null;
                switch (this.state) {
                    case 'descend': {
                        this.alt = Math.max(0, 1 - age / DRONE.DESCENT);
                        turn(toHer, 0.1);
                        if (this.alt <= 0) {
                            this._setState('hover');
                            if (g) {
                                g.triggerShake(6); audioSys.sfx('explode');
                                if (g.weather) g.weather.spawnExplosion(this.x, this.y, '#a469ff', 5, 1.4);
                                if (dist < DRONE.LAND_R && g.hurtPlayer(DRONE.LAND_HIT)) g.shovePlayer(dx / (dist || 1) * 40, dy / (dist || 1) * 40);
                            }
                        }
                        return null;
                    }
                    case 'rise': {
                        this.alt = Math.min(1, age / DRONE.RISE);
                        if (this.alt >= 1) {                                       // and down again, near her
                            const spot = this._dropSpot(playerX, playerY);
                            if (spot) { this.x = spot.x; this.y = spot.y; }
                            this.vx = this.vy = 0;
                            this._setState('descend');
                        }
                        return null;
                    }
                    case 'tell': {                                                 // a move winding up
                        const M = this._tell;
                        if (age < M.secs - M.lock) M.a = toHer;                    // it tracks her until the lock
                        turn(M.a, 0.25);
                        this.isTelegraphing = true; this.telegraphAngle = M.a;
                        if (age >= M.secs) { this.isTelegraphing = false; shot = this._unleash(M, playerX, playerY); }
                        break;
                    }
                    case 'dive': {
                        const L = DRONE.LANCE, ux = Math.cos(this._diveA), uy = Math.sin(this._diveA);
                        const nx = this.x + ux * L.SPEED, ny = this.y + uy * L.SPEED;
                        const blocked = isLineBlocked(this.x, this.y, nx, ny, walls, []);
                        if (!blocked) { this.x = nx; this.y = ny; this._dived += L.SPEED; }
                        if (!this._impaled && g && Math.hypot(playerX - this.x, playerY - this.y) < this.radius + 16) {
                            this._impaled = true;
                            if (g.hurtPlayer(L.HIT)) { g.burnPlayer(L.BURN_DPS, L.BURN_SECS); g.shovePlayer(ux * 40, uy * 40); g.triggerShake(8); }
                        }
                        if (blocked || this._dived >= L.DIST) { this._setState('recover'); if (blocked && g) g.triggerShake(4); }
                        return null;
                    }
                    case 'recover':                                                // lances stuck: the shell's open
                        this.vx *= 0.8; this.vy *= 0.8;
                        if (age >= DRONE.LANCE.RECOVER) this._setState('hover');
                        break;
                    case 'tether': {
                        const T = this._tether, G = DRONE.GRAPPLE;
                        if (T.state === 'out') {
                            const nx = T.x + Math.cos(T.a) * G.SPEED, ny = T.y + Math.sin(T.a) * G.SPEED;
                            const wall = isLineBlocked(T.x, T.y, nx, ny, walls, []);
                            T.x = nx; T.y = ny;
                            if (g && Math.hypot(playerX - T.x, playerY - T.y) < 18 && !g.playerDodging()) {
                                T.state = 'held'; T.until = now + G.SECS; T.next = now + G.TICK;
                                g.hurtPlayer(G.HIT); showMessage('GRAPPLED — FLIT TO BREAK FREE');
                            } else if (wall || Math.hypot(T.x - this.x, T.y - this.y) > G.RANGE + 40) T.state = 'back';
                        } else if (T.state === 'held') {
                            T.x = playerX; T.y = playerY;
                            if (!g || g.playerDodging() || now > T.until) { T.state = 'back'; if (g && g.playerDodging()) showMessage('BROKE FREE'); }
                            else {
                                const d = Math.hypot(this.x - playerX, this.y - playerY);
                                if (d > G.HOLD) g.shovePlayer((this.x - playerX) / d * G.PULL, (this.y - playerY) / d * G.PULL);
                                if (now >= T.next) { T.next += G.TICK; g.hurtPlayer(G.TICK_DMG); }
                                this.vx -= Math.cos(toHer) * 0.12; this.vy -= Math.sin(toHer) * 0.12;   // it backs off, hauling her
                            }
                        } else {
                            const bx = this.x - T.x, by = this.y - T.y, d = Math.hypot(bx, by);
                            if (d < 24) { this._tether = null; this._setState('hover'); }
                            else { T.x += bx / d * 20; T.y += by / d * 20; }
                        }
                        turn(toHer, 0.15);
                        break;
                    }
                    case 'beam':
                        if (age >= DRONE.BEAM.FIRE) this._setState('hover');
                        break;
                    default: {                                                     // hover: keep its distance, look for a line
                        turn(toHer, 0.12);
                        const los = this._los(playerX, playerY, walls);
                        if (los) this._lostSince = null; else if (this._lostSince === null) this._lostSince = now;
                        if (!los) {
                            if (++this.strafeTimer > 60) { this.strafeDir *= -1; this.strafeTimer = 0; }
                            const sa = toHer + Math.PI / 2 * this.strafeDir;
                            this.vx += Math.cos(sa) * 0.3 + Math.cos(toHer) * 0.1; this.vy += Math.sin(sa) * 0.3 + Math.sin(toHer) * 0.1;
                        } else {
                            this.strafeTimer = 0;
                            const keep = DRONE.KEEP[this.kind];
                            const k = dist > keep ? 0.2 : -0.1;
                            this.vx += Math.cos(toHer) * k + Math.cos(toHer + Math.PI / 2) * 0.05 * this.strafeDir;
                            this.vy += Math.sin(toHer) * k + Math.sin(toHer + Math.PI / 2) * 0.05 * this.strafeDir;
                        }
                        // Lost her too long: up, and down again by her
                        if (!los && this._lostSince !== null && now - this._lostSince > DRONE.LOST) { this._lostSince = null; this._setState('rise'); return null; }
                        // Its own move
                        if (now >= this._moveAt && g && !g.isDriving) {
                            const M = this._pickMove(dist, los);
                            if (M) { this._tell = M; this._setState('tell'); break; }
                        }
                        // Bolts between moves (not the seer)
                        if (this.kind !== 'seer' && los && dist < 500) {
                            if (now >= this._boltAt - DRONE.BOLT_TELL) { this.isTelegraphing = true; this.telegraphAngle = toHer; }
                            if (now >= this._boltAt) {
                                this.isTelegraphing = false;
                                this._boltAt = now + DRONE.BOLT_EVERY * (0.8 + Math.random() * 0.4);
                                const e = this.eyePos();
                                shot = new ProjectileEntity({ x: e.x, y: e.y, angle: toHer, isEnemy: true, owner: this });
                            }
                        } else this.isTelegraphing = false;
                    }
                }
                // Drift, and bounce off walls
                this.vx *= 0.9; this.vy *= 0.9;
                this.x += this.vx; this.y += this.vy;
                for (const w of walls) {
                    if (this.x + this.radius > w.x && this.x - this.radius < w.x + w.w && this.y + this.radius > w.y && this.y - this.radius < w.y + w.h) {
                        this.vx *= -1; this.vy *= -1; this.x += this.vx * 2; this.y += this.vy * 2;
                    }
                }
                return shot;
            }

            /** Its kind's move, if she's where it can use it */
            _pickMove(dist, los) {
                const now = _gameTimeSec;
                if (this.kind === 'lancer' && los && dist < DRONE.LANCE.RANGE)
                    return { kind: 'lance', secs: DRONE.LANCE.TELL, lock: DRONE.LANCE.LOCK, a: this.angle };
                if (this.kind === 'grappler' && los && dist < DRONE.GRAPPLE.RANGE)
                    return { kind: 'grapple', secs: DRONE.GRAPPLE.TELL, lock: 0.1, a: this.angle };
                if (this.kind === 'seer' && dist < DRONE.BEAM.RANGE)                // through walls: it needs no line
                    return { kind: 'beam', secs: DRONE.BEAM.CHARGE, lock: DRONE.BEAM.LOCK, a: this.angle };
                this._moveAt = now + 0.5;
                return null;
            }

            /** The tell's over: the move itself */
            _unleash(M, px, py) {
                const g = game, now = _gameTimeSec;
                if (M.kind === 'lance') {
                    this._moveAt = now + DRONE.LANCE.EVERY; this._diveA = M.a; this._dived = 0; this._impaled = false;
                    this._setState('dive');
                } else if (M.kind === 'grapple') {
                    this._moveAt = now + DRONE.GRAPPLE.EVERY;
                    const e = this.eyePos();
                    this._tether = { x: e.x, y: e.y, a: M.a, state: 'out' };
                    this._setState('tether');
                } else if (M.kind === 'beam') {
                    this._moveAt = now + DRONE.BEAM.EVERY;
                    const e = this.eyePos(), B = DRONE.BEAM;
                    this._beam = { x0: e.x, y0: e.y, x1: e.x + Math.cos(M.a) * B.RANGE, y1: e.y + Math.sin(M.a) * B.RANGE, t0: now };
                    const d2 = CollisionSystem.distToSegmentSquared(px, py, this._beam.x0, this._beam.y0, this._beam.x1, this._beam.y1);
                    if (d2 < B.WIDTH * B.WIDTH && g.hurtPlayer(B.HIT)) { g.burnPlayer(4, 1.5); g.triggerShake(6); }
                    this._setState('beam');
                }
                return null;
            }

            /** A walkable spot 130–220 px from her, for dropping back in */
            _dropSpot(px, py) {
                const map = typeof game !== 'undefined' && game.activeMap, nav = map && NavGrid.for(map);
                for (let i = 0; i < 12; i++) {
                    const a = Math.random() * Math.PI * 2, r = 130 + Math.random() * 90, x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
                    if (!nav || nav.walkable(x, y)) return { x, y };
                }
                return null;
            }

            /** The shell's share of a hit (the eye's hits say so) */
            takeDamage(amount, knockbackX = 0, knockbackY = 0, opts = null) {
                if (this.alt > 0.15) return false;                                 // still up there
                if (!(opts && opts.eye)) amount *= opts && (opts.cut || opts.punch || opts.type === 'melee') ? DRONE.BLADE : this.state === 'recover' ? DRONE.OPEN : DRONE.ARMOR;
                return super.takeDamage(Math.max(1, Math.round(amount)), knockbackX, knockbackY, opts);
            }

            onProjectileHit(projectile, game) {
                if (projectile.isEnemy || this.alt > 0.15) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;   // who gets the Resonance
                const e = this.eyePos(), eye = Math.hypot(projectile.x - e.x, projectile.y - e.y) < DRONE.EYE_R + (projectile.radius || 5);
                const speed = Math.hypot(projectile.vx, projectile.vy);
                const kb = speed ? Math.min(((projectile.mass || 1) * speed * projectile.damage / 20) / this.mass, 30) : 0;
                const kbX = speed ? projectile.vx / speed * kb : 0, kbY = speed ? projectile.vy / speed * kb : 0;
                const opts = { shot: !projectile.melee, punch: !!projectile.melee, crit: !!projectile.crit, eye };
                if (game && game.weather) game.weather.spawnExplosion(projectile.x, projectile.y, eye ? '#d8b8ff' : '#8a8f9a', eye ? 4 : 2, eye ? 1.2 : 0.6);
                this.takeDamage(eye ? projectile.damage * DRONE.EYE_MULT : projectile.damage, kbX, kbY, opts);
                if (eye) this._eyeHitT = _gameTimeSec;
            }

            /** Legacy non-projectile damage (e.g. vehicle hits) */
            takeDamageOld(amount, bulletAngle) { this.takeDamage(amount, Math.cos(bulletAngle) * 8, Math.sin(bulletAngle) * 8); }

            /** How high it hangs (px, drawn upward) */
            _lift() { return DRONE.HOVER_PX + Math.sin(this.hoverOffset) * 3 + this.alt * 240; }

            draw(ctx) {
                if (this.dead) return;
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) return;
                const t = _frameTime / 1000, lift = this._lift(), A = this.angle, TAU = Math.PI * 2;
                // Its shadow on the floor: wide and faint while it's high, then tightening as it lands
                ctx.save();
                const sh = 0.25 + 0.4 * (1 - this.alt);
                ctx.fillStyle = `rgba(0,0,0,${sh})`; ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, 24 + 20 * this.alt, 16 + 12 * this.alt, 0, 0, TAU); ctx.fill();
                if (this.alt > 0.02 && this.state === 'descend') {                // where it'll land
                    ctx.strokeStyle = `rgba(164,105,255,${0.4 + 0.4 * Math.sin(t * 14)})`; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
                    ctx.beginPath(); ctx.arc(this.x, this.y, DRONE.LAND_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                }
                ctx.restore();
                ctx.save();
                ctx.translate(this.x, this.y - lift);
                const S = 1 + this.alt * 0.5;                                      // nearer the camera while it's high
                ctx.scale(S, S);
                ctx.rotate(A);
                this._drawTendrils(ctx, t);
                this._drawArms(ctx, t);
                this._drawShell(ctx, t);
                ctx.restore();
            }

            /** Cable tendrils trailing from under the bell, swaying */
            _drawTendrils(ctx, t) {
                ctx.save(); ctx.lineCap = 'round';
                for (let i = 0; i < 13; i++) {
                    const side = (i / 12 - 0.5) * 2, x0 = -4 + Math.abs(side) * 5, y0 = side * 15;
                    const len = 30 + (i * 7 % 5) * 6, sw = Math.sin(t * 2.2 + i * 1.3 + this._seed) * 6;
                    ctx.strokeStyle = i % 2 ? '#14111b' : '#26202f'; ctx.lineWidth = i % 3 ? 1.7 : 2.8;
                    ctx.beginPath(); ctx.moveTo(x0, y0);
                    ctx.bezierCurveTo(x0 - len * 0.4, y0 + sw, x0 - len * 0.7, y0 * 1.1 - sw, x0 - len, y0 * 1.15 + sw * 0.6);
                    ctx.stroke();
                    if (i % 3 === 1) {                                              // a node light along it
                        ctx.fillStyle = `rgba(190,140,255,${0.5 + 0.5 * Math.sin(t * 5 + i)})`;
                        ctx.beginPath(); ctx.arc(x0 - len * 0.62, y0 * 1.08, 1.1, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();
            }

            /** An arm's joints (shoulder, elbow, wrist, lance tip) on side s: out wide and forward; folded to a point in a dive */
            static armPose(diving, stuck, s) {
                if (diving) return [5, 12 * s, 18, 24 * s, 30, 13 * s, 64, 3 * s];
                if (stuck) return [5, 12 * s, 13, 29 * s, 28, 24 * s, 50, 13 * s];
                return [5, 12 * s, 13, 30 * s, 28, 25 * s, 58, 11 * s];
            }

            /** Two long jointed arms, out and forward, ending in crackling violet lances */
            _drawArms(ctx, t) {
                const st = this.state, tl = st === 'tell' ? this._tell : null;
                const diving = st === 'dive' || (tl && tl.kind === 'lance'), stuck = st === 'recover';
                const reach = st === 'tether' && this._tether ? 1 : 0;
                for (const s of [-1, 1]) {
                    // shoulder → elbow → wrist → lance tip; a dive folds both lances forward together
                    const [sx, sy, ex, ey, wx, wy, tx, ty] = Drone.armPose(diving, stuck, s);
                    ctx.lineCap = 'round';
                    ctx.strokeStyle = '#08070b'; ctx.lineWidth = 7;
                    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
                    ctx.strokeStyle = '#2a2436'; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
                    ctx.strokeStyle = 'rgba(200,190,230,0.18)'; ctx.lineWidth = 1;          // a glint along the plating
                    ctx.beginPath(); ctx.moveTo(sx, sy - 1); ctx.lineTo(ex, ey - 1); ctx.lineTo(wx, wy - 1); ctx.stroke();
                    for (const [jx, jy] of [[ex, ey], [wx, wy]]) {                  // the joints
                        ctx.fillStyle = '#17131f'; ctx.beginPath(); ctx.arc(jx, jy, 3.2, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(180,120,255,0.8)'; ctx.beginPath(); ctx.arc(jx, jy, 1, 0, Math.PI * 2); ctx.fill();
                    }
                    if (reach && s === 1) continue;                                 // its lance is the tether (drawn in the glow pass)
                    // the lance: a long dark blade, a violet core burning down its length
                    const la = Math.atan2(ty - wy, tx - wx), nx = -Math.sin(la), ny = Math.cos(la);
                    ctx.fillStyle = '#15101e';
                    ctx.beginPath(); ctx.moveTo(wx + nx * 3.4, wy + ny * 3.4); ctx.lineTo(tx, ty); ctx.lineTo(wx - nx * 3.4, wy - ny * 3.4); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#7a4cd8'; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.strokeStyle = '#e2ccff'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(wx + (tx - wx) * 0.1, wy + (ty - wy) * 0.1); ctx.lineTo(tx, ty); ctx.stroke();
                }
            }

            /** The bell: armoured plates, violet seams, the sensor-core eye at its front */
            _drawShell(ctx, t) {
                const tele = this.isTelegraphing, open = this.state === 'recover';
                // under-rim shadow, then the bell
                ctx.fillStyle = '#050407'; ctx.beginPath(); ctx.ellipse(-1, 0, 23, 21, 0, 0, Math.PI * 2); ctx.fill();
                const gr = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24);
                gr.addColorStop(0, '#3a3446'); gr.addColorStop(0.5, '#17141e'); gr.addColorStop(1, '#09080c');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(-2, 0, 21, 19, 0, 0, Math.PI * 2); ctx.fill();
                // plates: concentric bands and radial seams (they part when it's open)
                ctx.strokeStyle = open ? 'rgba(190,140,255,0.7)' : '#04030a'; ctx.lineWidth = open ? 1.2 : 1;
                for (const r of [8, 14]) { ctx.beginPath(); ctx.ellipse(-3, 0, r * 1.05, r, 0, 0, Math.PI * 2); ctx.stroke(); }
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + 0.2;
                    ctx.beginPath(); ctx.moveTo(-3 + Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(-2 + Math.cos(a) * 20, Math.sin(a) * 18); ctx.stroke();
                }
                // violet light slits along the plate edges
                ctx.strokeStyle = `rgba(170,110,255,${0.55 + 0.25 * Math.sin(t * 3 + this._seed)})`; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
                for (const [a0, a1, r] of [[-2.4, -1.7, 17], [1.7, 2.4, 17], [-0.9, -0.5, 11], [0.5, 0.9, 11], [2.9, 3.4, 15]]) {
                    ctx.beginPath(); ctx.ellipse(-2, 0, r * 1.05, r, 0, a0, a1); ctx.stroke();
                }
                // a sheen on the crown, and the hood's brow plates arching over the eye
                ctx.fillStyle = 'rgba(200,190,230,0.12)'; ctx.beginPath(); ctx.ellipse(-8, -6, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
                for (const s of [-1, 1]) {
                    ctx.fillStyle = '#1d1926'; ctx.strokeStyle = '#05040a'; ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.moveTo(6, 2 * s); ctx.quadraticCurveTo(14, 13 * s, 2, 18 * s); ctx.quadraticCurveTo(-1, 9 * s, 6, 2 * s); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = `rgba(170,110,255,${0.6 + 0.3 * Math.sin(t * 4 + s)})`; ctx.lineWidth = 0.9;
                    ctx.beginPath(); ctx.moveTo(8, 6 * s); ctx.quadraticCurveTo(11, 12 * s, 4, 15 * s); ctx.stroke();
                }
                // the eye: rings round a hot core
                const ex = DRONE.EYE_FWD, hit = this._eyeHitT ? Math.max(0, 1 - (_gameTimeSec - this._eyeHitT) / 0.2) : 0;
                ctx.fillStyle = '#0a0710'; ctx.beginPath(); ctx.arc(ex, 0, 7.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = tele ? '#f0e0ff' : '#9a62ff'; ctx.lineWidth = 1;
                for (const r of [6.5, 4.5]) { ctx.beginPath(); ctx.arc(ex, 0, r, 0, Math.PI * 2); ctx.stroke(); }
                ctx.fillStyle = hit > 0 ? '#ffffff' : tele ? '#f6eaff' : '#c9a2ff';
                ctx.beginPath(); ctx.arc(ex, 0, 2.6 + (tele ? 0.8 * Math.sin(t * 30) : 0), 0, Math.PI * 2); ctx.fill();
            }

            /** Above the darkness (engine/boss-hazards.js): the eye's glow, the lances' crackle, its tells, the tether, the beam */
            drawLights(ctx) {
                if (this.dead) return;
                const t = _frameTime / 1000, now = _gameTimeSec, lift = this._lift(), S = 1 + this.alt * 0.5;
                const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
                const W = (lx, ly) => ({ x: this.x + (lx * ca - ly * sa) * S, y: this.y - lift + (lx * sa + ly * ca) * S });
                const tl = this.state === 'tell' ? this._tell : null, k = tl ? Math.min(1, (now - this._stateT) / tl.secs) : 0;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // the sensor core
                const e = W(DRONE.EYE_FWD, 0);
                ctx.globalAlpha = 0.55 + 0.45 * k; drawGlow(ctx, e.x, e.y, (18 + 22 * k) * S, k > 0 ? '235, 200, 255' : '164, 105, 255', 0.35);
                // the lances crackle (brighter while it winds up or dives)
                const diving = this.state === 'dive' || (tl && tl.kind === 'lance');
                const hot = diving || (tl && tl.kind === 'lance') ? 1 : 0.45;
                for (const s of [-1, 1]) {
                    if (this.state === 'tether' && s === 1) continue;
                    const P = Drone.armPose(diving, this.state === 'recover', s), w = W(P[4], P[5]), tip = W(P[6], P[7]);
                    ctx.globalAlpha = 0.35 * hot; drawGlow(ctx, tip.x, tip.y, 12 * S, '170, 110, 255', 0.3);
                    ctx.strokeStyle = `rgba(210,170,255,${0.5 * hot + 0.3})`; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(w.x, w.y);
                    const n = 5, seed = Math.floor(t * 18) + s * 7;
                    for (let i = 1; i <= n; i++) {
                        const u = i / n, j = i < n ? (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1) * 5 * hot : 0;
                        ctx.lineTo(w.x + (tip.x - w.x) * u - sa * j, w.y + (tip.y - w.y) * u + ca * j);
                    }
                    ctx.stroke();
                }
                // tells: the lance line it'll dive along, the beam it's charging
                if (tl && tl.kind === 'lance') {
                    ctx.globalAlpha = 0.3 + 0.6 * k; ctx.strokeStyle = '#c9a2ff'; ctx.lineWidth = 1 + 3 * k; ctx.setLineDash([8, 6]);
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(tl.a) * DRONE.LANCE.DIST, this.y + Math.sin(tl.a) * DRONE.LANCE.DIST); ctx.stroke(); ctx.setLineDash([]);
                } else if (tl && tl.kind === 'beam') {
                    const R = DRONE.BEAM.RANGE;
                    ctx.globalAlpha = 0.15 + 0.5 * k; ctx.strokeStyle = '#d8b8ff'; ctx.lineWidth = 0.6 + 2.4 * k;
                    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(tl.a) * R, e.y + Math.sin(tl.a) * R); ctx.stroke();
                } else if (tl && tl.kind === 'grapple') {
                    const tip = W(58, 11); ctx.globalAlpha = 0.4 + 0.5 * k; drawGlow(ctx, tip.x, tip.y, (10 + 12 * k) * S, '200, 150, 255', 0.3);
                }
                // the tether: its lance flung out on a crackling line
                const T = this._tether;
                if (T) {
                    const w = W(28, 25);
                    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#cfa8ff'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(w.x, w.y);
                    const n = 8, dx = T.x - w.x, dy = T.y - w.y, L = Math.hypot(dx, dy) || 1;
                    for (let i = 1; i <= n; i++) { const u = i / n, j = i < n ? Math.sin(t * 40 + i * 2.1) * 3 : 0; ctx.lineTo(w.x + dx * u - dy / L * j, w.y + dy * u + dx / L * j); }
                    ctx.stroke();
                    ctx.globalAlpha = 0.8; drawGlow(ctx, T.x, T.y, T.state === 'held' ? 26 : 14, '190, 130, 255', 0.3);
                }
                // the beam itself: a white-violet line through everything
                const B = this._beam;
                if (B && now - B.t0 < DRONE.BEAM.FIRE) {
                    const u = (now - B.t0) / DRONE.BEAM.FIRE;
                    for (const [w, a] of [[14, 0.18], [6, 0.45], [2, 0.95]]) {
                        ctx.globalAlpha = a * (1 - u); ctx.strokeStyle = w > 4 ? '#a469ff' : '#ffffff'; ctx.lineWidth = w;
                        ctx.beginPath(); ctx.moveTo(B.x0, B.y0 - lift); ctx.lineTo(B.x1, B.y1); ctx.stroke();
                    }
                }
                ctx.restore();
            }
        }
