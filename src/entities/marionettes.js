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
        const MARIONETTE = {
            HP: 30, RADIUS: 11, SCALE: 0.72, SHOT: 0.7,
            YANK: 0.55, YANK_SPEED: 7.5, DRIFT: 0.5,                 // s between jerks forward, how hard, how much it drifts between them
            SPACE: 34, SIGHT: 900, CIRCLE: 60,                       // room it keeps from the others; how far it knows where she is; how wide they fan round her
            REACH: 46, TELL: 0.38, LUNGE: 9, HIT: 9, RECOVER: 0.7, COOLDOWN: 1.4,
            BAR_Z: 96,                                               // how high its control bar hangs (px, drawn upward)
            WOOD: '#7a5534', WOOD_HI: '#a07548', WOOD_LO: '#4a3220', JOINT: '#2c1d12',
            FACE: '#efe2d4', FACE_LO: '#cdb8a6', BLUSH: 'rgba(214,110,120,.55)', BLADE: '#d9dde4', BLADE_LO: '#8d939c',
            STRING: 'rgba(230,226,214,', CLOTH: ['#5b2340', '#2d3b5c', '#3e2a52', '#5c3a1e']
        };

        class Marionette extends ActorEntity {
            constructor(x, y, opts = {}) {
                super({ x, y, radius: MARIONETTE.RADIUS, type: 'marionette', alliance: 'hostile', hp: MARIONETTE.HP, mass: 6, friction: 0.88, speed: 3,
                        hasCollision: true, invincibleDuration: 6 });
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

            /** How it hangs: a bob on its strings, a sag while it recovers, a hop as it's yanked */
            _pose(t) {
                const s = this._seed, st = this.state, age = _gameTimeSec - this._stateT;
                const bob = Math.sin(t * 3.1 + s) * 1.5 + this._yank * 4;
                const sag = st === 'recover' ? Math.min(1, age / 0.15) * (1 - Math.max(0, (age - MARIONETTE.RECOVER + 0.25) / 0.25)) : 0;
                const raise = st === 'tell' ? Math.min(1, age / (MARIONETTE.TELL * 0.6)) : st === 'lunge' ? 1 - Math.min(1, age / 0.18) : 0;
                const swing = Math.sin(t * 5 + s) * (0.25 + this._yank * 0.6);
                return { lift: 5 + bob - sag * 3, sag, raise, swing, lunge: st === 'lunge' ? 1 - age / 0.3 : 0 };
            }

            draw(ctx) {
                if (this.dead) return;
                if (this.invincibleTimer > 0 && this.invincibleTimer % 4 < 2) return;
                const t = _frameTime / 1000, P = this._pose(t), S = MARIONETTE.SCALE * 1.4;
                ctx.save();
                // Its shadow: small and soft, it hardly touches the ground
                ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
                this._drawStrings(ctx, t, P);
                ctx.translate(this.x, this.y - P.lift);
                ctx.scale(S, S);
                ctx.rotate(this.angle - Math.PI / 2);                   // its front is local +y
                this._drawBody(ctx, t, P);
                ctx.restore();
            }

            /** The control bar high over it and five strings down to head, hands and knees; faded into the dark above */
            _drawStrings(ctx, t, P) {
                const M = MARIONETTE, sway = Math.sin(t * 1.3 + this._seed) * 6, bx = this.x + sway, by = this.y - M.BAR_Z - P.lift;
                const S = M.SCALE * 1.4, a = this.angle - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
                const at = (lx, ly) => [this.x + (lx * c - ly * s) * S, this.y - P.lift + (lx * s + ly * c) * S];
                const ends = [at(0, 2), at(-11, 6 + P.raise * 8), at(11, 6 + P.raise * 8), at(-5, -8), at(5, -8)];
                const tips = [[bx, by], [bx - 16, by + 2], [bx + 16, by + 2], [bx - 6, by - 10], [bx + 6, by - 10]];
                ctx.lineWidth = 0.6;
                for (let i = 0; i < ends.length; i++) {
                    const [ex, ey] = ends[i], [tx, ty] = tips[i];
                    const gr = ctx.createLinearGradient(tx, ty, ex, ey); gr.addColorStop(0, M.STRING + '0)'); gr.addColorStop(0.35, M.STRING + '.3)'); gr.addColorStop(1, M.STRING + '.55)');
                    ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
                }
                // The bar: a wooden cross, half lost in the dark
                ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(bx, by); ctx.rotate(Math.sin(t * 1.1 + this._seed) * 0.15);
                ctx.fillStyle = M.WOOD_LO; ctx.fillRect(-18, -1.5, 36, 3); ctx.fillRect(-1.5, -12, 3, 20);
                ctx.fillStyle = M.WOOD; ctx.fillRect(-18, -1.5, 36, 1.2);
                ctx.restore();
            }

            /** The doll from above: legs dangling behind, the jointed body, arms with their blades, the porcelain face */
            _drawBody(ctx, t, P) {
                const M = MARIONETTE, TAU = Math.PI * 2;
                const joint = (x, y, r) => { ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
                const limb = (x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
                // Legs: dangling back and swinging
                for (const sd of [-1, 1]) {
                    const sw = P.swing * sd * 3, kx = sd * 4 + sw * 0.5, ky = -9, fx = sd * 4.5 + sw, fy = -16 - P.sag * 2;
                    limb(sd * 3.5, -5, kx, ky, 3.2, M.WOOD_LO); joint(kx, ky, 1.7); limb(kx, ky, fx, fy, 2.8, M.WOOD);
                    ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.ellipse(fx, fy - 1, 1.9, 2.6, 0, 0, TAU); ctx.fill();
                }
                // The torso: a little coat over carved wood, the belly joint
                ctx.fillStyle = M.WOOD_LO; ctx.beginPath(); ctx.ellipse(0, -2, 6, 5, 0, 0, TAU); ctx.fill(); joint(0, -1, 2);
                ctx.fillStyle = this.cloth; ctx.beginPath(); ctx.ellipse(0, 3, 8, 6.5, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.ellipse(-2, 1.5, 4, 3, -0.4, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 9); ctx.stroke();
                ctx.fillStyle = '#c9a85a'; for (const by of [1, 4.5]) { ctx.beginPath(); ctx.arc(0.9, by, 0.6, 0, TAU); ctx.fill(); }
                // Arms: shoulders, elbows, the blades. Raised for the tell, scissoring through the lunge
                for (const sd of [-1, 1]) {
                    const up = P.raise, cut = P.lunge;
                    const sx = sd * 8, sy = 4;
                    const ex = sd * (11 - up * 3) + P.swing * sd * 2, ey = 9 + up * 6 - P.sag * 4;
                    const hx = sd * (9 - up * 5 - cut * 12), hy = 13 + up * 10 + cut * 4 - P.sag * 6;
                    limb(sx, sy, ex, ey, 2.6, M.WOOD); joint(sx, sy, 1.9); joint(ex, ey, 1.6); limb(ex, ey, hx, hy, 2.3, M.WOOD_HI);
                    // The blade: a curved sickle out of the wrist
                    const a = Math.atan2(hy - ey, hx - ex) - sd * (0.35 + cut * 0.6);
                    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
                    ctx.fillStyle = M.BLADE_LO; ctx.beginPath(); ctx.moveTo(0, -1.2); ctx.quadraticCurveTo(9, -3 * sd, 15, sd * 2); ctx.quadraticCurveTo(8, 0.5 * sd, 0, 1.2); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = M.BLADE; ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(9, -2.6 * sd, 15, sd * 2); ctx.quadraticCurveTo(8, -0.6 * sd, 0, 0); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = M.JOINT; ctx.fillRect(-1.2, -1.6, 2.4, 3.2);
                    ctx.restore();
                }
                // The head: a porcelain face turned up toward the strings, soft and smiling; the jaw on its two lines
                const hy = 13;
                ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.arc(0, 9, 2, 0, TAU); ctx.fill();
                const fg = ctx.createRadialGradient(-1.5, hy - 1.5, 1, 0, hy, 7); fg.addColorStop(0, M.FACE); fg.addColorStop(1, M.FACE_LO);
                ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, hy, 6, 6.6, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse(0, hy - 3.2, 6.2, 3.8, 0, Math.PI, TAU); ctx.fill();   // painted hair, a little cap of it
                ctx.fillStyle = M.BLUSH; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 3.4, hy + 2.2, 1.3, 0, TAU); ctx.fill(); }
                ctx.fillStyle = '#1a1010'; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 2.2, hy + 0.6, 0.9, 0.5, 0, 0, TAU); ctx.fill(); }
                ctx.strokeStyle = 'rgba(120,40,50,.75)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(0, hy + 2.8, 1.6, 0.2, Math.PI - 0.2); ctx.stroke();   // the smile
                ctx.strokeStyle = 'rgba(60,40,30,.5)'; ctx.lineWidth = 0.35; ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(sd * 1.9, hy + 3.2); ctx.lineTo(sd * 1.9, hy + 6.2); } ctx.stroke();   // the jaw's hinge lines
            }

            /** Above the darkness: the blades' glint as it winds up, so a swarm in the dark can still be read */
            drawLights(ctx) {
                if (this.dead || this.state !== 'tell') return;
                const age = _gameTimeSec - this._stateT, k = Math.min(1, age / MARIONETTE.TELL), P = this._pose(_frameTime / 1000);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const sd of [-1, 1]) {
                    const a = this.angle - Math.PI / 2, lx = sd * 6, ly = 22, S = MARIONETTE.SCALE * 1.4;
                    const x = this.x + (lx * Math.cos(a) - ly * Math.sin(a)) * S, y = this.y - P.lift + (lx * Math.sin(a) + ly * Math.cos(a)) * S;
                    const gr = ctx.createRadialGradient(x, y, 0, x, y, 9 + 5 * k); gr.addColorStop(0, `rgba(235,240,255,${0.55 * k})`); gr.addColorStop(1, 'rgba(235,240,255,0)');
                    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
        }
