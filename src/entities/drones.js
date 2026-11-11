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
        const DRONE = GAME_DB.enemies.drone;   // directory/game-db/enemies.json
        const DRONE_KINDS = GAME_DB.enemies.drone_kinds;

        class Drone extends ActorEntity {
            constructor(x, y, kind) {
                const K = GAME_DB.enemies.kinds.drone;
                super({ x, y, radius: K.radius, type: 'drone', alliance: 'hostile', hp: DRONE.HP, mass: K.mass, friction: 0.9, speed: K.speed,
                        hasCollision: true, invincibleDuration: K.invincible_frames });
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
            _los(px, py, walls) { return !collisionWorld.lineBlocked(this.x, this.y, px, py, walls, []); }

            /** Where its eye is (world) */
            eyePos() { return { x: this.x + Math.cos(this.angle) * DRONE.EYE_FWD, y: this.y + Math.sin(this.angle) * DRONE.EYE_FWD }; }

            update(playerX, playerY, walls) {
                if (this.dead) return null;
                const g = typeof game !== 'undefined' ? game : null, now = _gameTimeSec, age = now - this._stateT;
                this.hoverOffset += 0.08;
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                collisionWorld.carry(this, 'velocity');   // knockback into its own vx / vy: the body step
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
                        const blocked = collisionWorld.lineBlocked(this.x, this.y, nx, ny, walls, []);
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
                            const wall = collisionWorld.lineBlocked(T.x, T.y, nx, ny, walls, []);
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
                const r0 = this.radius;
                for (const w of _physicsSpatial.query(walls, { left: this.x - r0, right: this.x + r0, top: this.y - r0, bottom: this.y + r0 }) || []) {
                    if (shapeKit.squareHitsRect(this.x, this.y, this.radius, w)) {
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
                    const d2 = shapeKit.segmentDistanceSq(px, py, this._beam.x0, this._beam.y0, this._beam.x1, this._beam.y1);
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
            _lift(){return DFNative.droneLift(this);}
            draw(ctx){return classicActorPackets.drawDrone(ctx,this);}
            static armPose(...args){return DFNative.droneArmPose(...args);}
            drawLights(ctx){return classicActorPackets.drawDrone(ctx,this,'lights');}
        }
