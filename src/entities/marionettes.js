        /* =====================================================================
           MARIONETTES — the Dark Maker's puppets (Darklands; DRAFT)
           ---------------------------------------------------------------------
           Little wooden marionettes with porcelain faces and blades for hands,
           hung from strings that rise out of sight. They come as a swarm (the
           corrupted safe haven's basement) and they make no sound at all:
           no footsteps, no voice, nothing for her to hear coming.
             · the body: a jointed wooden doll about two-thirds her height, a
               soft, smiling porcelain face (the jaw hinged on two lines), ball
               joints, a curved blade where each hand should be
             · the strings: five of them up to a wooden control bar hanging high
               over it, swaying; the strings fade into the dark above the bar
             · how it moves: never walks, it's carried. It's yanked forward in
               jerks (`YANK`), its limbs swinging after it, its feet barely
               brushing the ground
             · how it fights: it closes in, its arms jerk up (the tell: the
               blades catch the light, `TELL` s), then it lunges and scissors
               both blades across her (`HIT`), then hangs limp a
               moment (`RECOVER`, the opening)
             · a swarm: each keeps a little room from the others (`SPACE`) and
               they come at her from around her, not in a line
             · cut down: the strings go slack and it drops in a heap
           Wood: bullets do less (`SHOT`), blades and fists the full hit.
           ===================================================================== */
        const MARIONETTE = DFNative.MARIONETTE_RULES;

        class Marionette extends ActorEntity {
            constructor(x, y, opts = {}) {
                super({ x, y, radius: MARIONETTE.RADIUS, type: 'marionette', alliance: 'hostile', hp: MARIONETTE.HP, mass: MARIONETTE.MASS, friction: 0.88, speed: MARIONETTE.SPEED,
                        hasCollision: true, invincibleDuration: MARIONETTE.INVINCIBLE_FRAMES });
                this.angle = Math.PI / 2;
                this.state = 'stalk'; this._stateT = _gameTimeSec;
                this._seed = Math.random() * 1000;
                this._yankAt = _gameTimeSec + Math.random() * MARIONETTE.YANK;
                this._yank = 0;                                          // 1 just after a jerk, easing to 0: the limbs swing with it
                this._attackAt = _gameTimeSec + 0.6 + Math.random();
                this._slot = Math.random() * Math.PI * 2;               // where round her it means to come from
                this.cloth = opts.cloth || MARIONETTE.CLOTH[Math.floor(Math.random() * MARIONETTE.CLOTH.length)];
                this.silent = true;                                      // no footsteps, no noise (it's carried)
            }

            _setState(s) { this.state = s; this._stateT = _gameTimeSec; }

            update(playerX, playerY, walls) {
                if (this.dead) return null;
                const M = MARIONETTE, g = typeof game !== 'undefined' ? game : null, now = _gameTimeSec, age = now - this._stateT;
                if (this.invincibleTimer > 0) this.invincibleTimer--;
                collisionWorld.carry(this, 'velocity');   // knockback into its own vx / vy: the body step
                const dx = playerX - this.x, dy = playerY - this.y, dist = Math.hypot(dx, dy), toHer = Math.atan2(dy, dx);
                const turn = (to, k) => { this.angle += normalizeAngle(to - this.angle) * k; };
                this._yank *= 0.9;
                switch (this.state) {
                    case 'tell':                                             // arms up, blades catching the light
                        turn(toHer, 0.3);
                        this.vx *= 0.7; this.vy *= 0.7;
                        if (age >= M.TELL) { this._setState('lunge'); this._lungeA = this.angle; this._hit = false; this._yank = 1; }
                        break;
                    case 'lunge': {
                        const ux = Math.cos(this._lungeA), uy = Math.sin(this._lungeA);
                        if (age < 0.16) { this.vx = ux * M.LUNGE; this.vy = uy * M.LUNGE; }
                        if (!this._hit && g && dist < M.REACH * 0.7 + 14) {
                            this._hit = true;
                            if (g.hurtPlayer(M.HIT)) g.shovePlayer(ux * 14, uy * 14);
                        }
                        if (age >= 0.3) this._setState('recover');
                        break;
                    }
                    case 'recover':                                          // limp on its strings: the opening
                        this.vx *= 0.8; this.vy *= 0.8;
                        if (age >= M.RECOVER) { this._setState('stalk'); this._attackAt = now + M.COOLDOWN * (0.7 + Math.random() * 0.6); }
                        break;
                    default: {                                               // stalk: jerked toward a spot round her
                        if (dist > M.SIGHT) { this.vx *= 0.9; this.vy *= 0.9; break; }
                        turn(toHer, 0.18);
                        const close = dist < M.REACH + M.CIRCLE;
                        const tx = close ? playerX : playerX + Math.cos(this._slot) * M.CIRCLE, ty = close ? playerY : playerY + Math.sin(this._slot) * M.CIRCLE;
                        if (now >= this._yankAt) {                           // a jerk forward
                            this._yankAt = now + M.YANK * (0.75 + Math.random() * 0.5);
                            const a = Math.atan2(ty - this.y, tx - this.x) + (Math.random() - 0.5) * 0.5;
                            this.vx += Math.cos(a) * M.YANK_SPEED; this.vy += Math.sin(a) * M.YANK_SPEED; this._yank = 1;
                        } else {
                            const a = Math.atan2(ty - this.y, tx - this.x);
                            this.vx += Math.cos(a) * M.DRIFT * 0.1; this.vy += Math.sin(a) * M.DRIFT * 0.1;
                        }
                        if (dist < M.REACH && now >= this._attackAt && g && !g.isDriving) this._setState('tell');
                    }
                }
                // A little room from the rest of the swarm
                if (g && g.enemies) for (const o of g.enemies) {
                    if (o === this || o.dead || !(o instanceof Marionette)) continue;
                    const ox = this.x - o.x, oy = this.y - o.y, d = Math.hypot(ox, oy);
                    if (d > 0 && d < M.SPACE) { const k = (M.SPACE - d) / M.SPACE * 0.6; this.vx += ox / d * k; this.vy += oy / d * k; }
                }
                this.vx *= 0.86; this.vy *= 0.86;
                const nx = this.x + this.vx, ny = this.y + this.vy, r = this.radius;
                const hits = (x, y) => collisionWorld.squareBlocked(x, y, r, walls);
                if (!hits(nx, this.y)) this.x = nx; else this.vx *= -0.3;
                if (!hits(this.x, ny)) this.y = ny; else this.vy *= -0.3;
                return null;
            }

            /** Wood: bullets bite less than blades and fists */
            takeDamage(amount, knockbackX = 0, knockbackY = 0, opts = null) {
                const melee = opts && (opts.cut || opts.punch || opts.type === 'melee');
                if (opts && opts.shot && !melee) amount *= MARIONETTE.SHOT;
                const r = super.takeDamage(Math.max(1, Math.round(amount)), knockbackX, knockbackY, opts);
                if (this.state === 'tell' && !this.dead) this._setState('recover');   // a hit knocks it off its strike
                this._yank = 1;
                return r;
            }

            onProjectileHit(projectile, game) {
                if (projectile.isEnemy) return;
                this.lastHitBy = projectile.owner; this.lastHitMelee = !!projectile.melee;
                const speed = Math.hypot(projectile.vx, projectile.vy), kb = speed ? Math.min(((projectile.mass || 1) * speed * projectile.damage / 20) / this.mass, 24) : 0;
                if (game && game.weather) game.weather.spawnSparks(projectile.x, projectile.y, 4);
                this.takeDamage(projectile.damage, speed ? projectile.vx / speed * kb : 0, speed ? projectile.vy / speed * kb : 0,
                                { shot: !projectile.melee, punch: !!projectile.melee, crit: !!projectile.crit });
            }

            takeDamageOld(amount, bulletAngle) { this.takeDamage(amount, Math.cos(bulletAngle) * 8, Math.sin(bulletAngle) * 8); }

            draw(ctx){return drawMarionetteAppearance(ctx,this);}
            drawLights(ctx){return drawMarionetteAppearance(ctx,this,true);}
        }
