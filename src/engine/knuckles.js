        // GameEngine — Golden Retribution, the gilded brass knuckles (weaponMode 'fists'). Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Crafted at the workbench (SCHEMATICS golden_retribution, 400 scrap). Each press throws a jab (the
        // bare-fist punch's hitbox, combat-effects.js), but quicker with Quick Hands and Reflex Sync (the
        // gun and blade cooldown), harder with Heavy Hands, and it can crit and takes the Glass. Every
        // KNUCKLES.EVERY-th punch is a haymaker: ×HAY_MULT, a hard shove (HAY_KNOCK against a jab's
        // JAB_KNOCK), and a stagger that stops a ganger's shot or telegraph, a hunter's dash and claw and
        // the Demoness's whip (shorter on a boss, and not again for BOSS_RESIST). Driven into a wall or a
        // collider, a haymaker's target takes SLAM more of the hit. A punch inside the Flit-Strike
        // window is always a haymaker, Flit-Strike's bonus on top. Jabs step her in like a blade does.
        // Each punch leaves gold afterimages of the fist along its path; a haymaker adds a ring burst,
        // sparks and a clink (drawKnuckleFx, after the slashes).

        const KNUCKLES = {
            ID: 'golden_retribution', EVERY: 3, HAY_MULT: 2.5, JAB_KNOCK: 1, HAY_KNOCK: 3,
            STAGGER: 0.5, BOSS_STAGGER: 0.25, BOSS_RESIST: 1.5, SLAM: 0.5, SLAM_SECS: 0.45,
            COMBO_RESET: 1.2,          // s without a punch before the count starts again
            STEP_REACH: 46             // px ahead (past both bodies) she'll step in toward someone on a jab
        };

        engineMixin({
            /** Ticks into the punch for the body's strike curve: a quicker punch runs the same 15-tick curve faster */
            punchStanceTicks() {
                const D = CONFIG.PUNCH.DURATION_TICKS, dur = this._punchDur || D;
                return Math.max(0, (dur - this.shootCooldown - 1 + RenderInterp.alpha) * D / dur);
            },

            /** A press with the knuckles on: the jab (or haymaker) hitbox, its afterimages; returns the punch */
            knucklePunch() {
                const W = this.currentWeapon, st = (W && W.stats) || {}, pl = this.player, now = _gameTimeSec;
                const fast = this.augments && this.augments.isEquipped('fast_reload') ? 0.8 : 1;
                this.shootCooldown = this._punchDur = Math.max(2, Math.round(this.resonance.stat('fireCooldown', st.fireRate || 15) * fast));
                pl.punchSide = pl.punchSide === 'right' ? 'left' : 'right';
                if (now - (this._punchAt ?? -99) > KNUCKLES.COMBO_RESET) this._punchCombo = 0;
                this._punchAt = now;
                this._punchCombo = (this._punchCombo || 0) + 1;
                const flit = _gameTimeSec - this.flitState.lastFlitAt <= this.resonance.stat('flitStrikeWindow', 1);
                const hay = flit || this._punchCombo % (st.haymakerEvery || KNUCKLES.EVERY) === 0;
                if (hay) this._punchCombo = 0;
                const ang = pl.angle;
                // Step in toward someone just out of reach (as a blade does)
                const walls = this.activeMap.walls, cols = getColliders(this.activeMap);
                const near = this.enemies.filter(e => {
                    if (!e || e.dead) return false;
                    const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.hypot(dx, dy);
                    return d - (pl.radius || 12) - (e.radius || 14) <= KNUCKLES.STEP_REACH && Math.abs(normalizeAngle(Math.atan2(dy, dx) - ang)) < 0.6
                        && !isLineBlocked(pl.x, pl.y, e.x, e.y, walls, cols);
                });
                if (near.length) this.meleeStepIn(ang, this._meleeGap(near));

                let dmg = this.resonance.stat('punchDamage', st.damage || 16) * this.playerDamageMult();
                if (flit) dmg *= 1 + 0.2 * this.resonance.rank('flit_strike');
                if (hay) dmg *= st.haymakerMult || KNUCKLES.HAY_MULT;
                const crit = this.rollCrit(st);
                const px = pl.x + Math.cos(ang) * 20, py = pl.y + Math.sin(ang) * 20;
                const p = new ProjectileEntity({ x: px, y: py, angle: ang, isEnemy: false, owner: pl, color: 'rgba(0,0,0,0)',
                    radius: 15, speed: 10, life: 5, damage: Math.round(dmg * crit), mass: 50, melee: true });
                p.crit = crit > 1; p.knuckles = true; p.haymaker = hay;
                p.knock = hay ? KNUCKLES.HAY_KNOCK : KNUCKLES.JAB_KNOCK; p.knockDmg = st.damage || 16;
                this.projectiles.push(p);
                // The fist's afterimages: gold copies along its path, fading
                const fx = this.knuckleFx || (this.knuckleFx = []);
                fx.push({ k: 'trail', x: pl.x, y: pl.y, a: ang, side: pl.punchSide, t0: now, hay });
                if (fx.length > 24) fx.splice(0, fx.length - 24);
                this.emitNoise(pl.x, pl.y, CONFIG.NOISE.punch, 'punch');
                this.triggerShake(hay ? 4 : 2);
                return p;
            },

            /** A knuckle punch landed (CollisionSystem.resolveProjectile): a haymaker staggers, and may slam */
            onKnuckleHit(e, p) {
                if (!p.haymaker || e.dead) return;
                const now = _gameTimeSec, boss = !!e.bossName;
                if (!boss || now >= (e._hayResistUntil || 0)) {
                    e._staggerUntil = Math.max(e._staggerUntil || 0, now + (boss ? KNUCKLES.BOSS_STAGGER : KNUCKLES.STAGGER));
                    if (boss) e._hayResistUntil = now + KNUCKLES.BOSS_RESIST;
                    e.isTelegraphing = false; e._aimPoint = null;                     // the shot she was lining up is gone
                    if (e.telegraphThreshold !== undefined) e.cooldown = Math.max(e.cooldown || 0, e.telegraphThreshold + 1);
                }
                e._slam = { until: now + KNUCKLES.SLAM_SECS, dmg: Math.round(p.damage * KNUCKLES.SLAM), by: p.owner };
                const fx = this.knuckleFx || (this.knuckleFx = []);
                fx.push({ k: 'ring', x: e.x, y: e.y, t0: now });
                if (this.weather) this.weather.spawnSparks(e.x, e.y, 14);
                if (typeof ambience !== 'undefined' && ambience.clink) ambience.clink();
            },

            /** Once a sim tick: a body a haymaker drove into a wall takes the slam */
            updateKnuckleSlams() {
                if (!this.enemies || !this.activeMap) return;
                const now = _gameTimeSec;
                for (const e of this.enemies) {
                    const S = e._slam; if (!S) continue;
                    if (e.dead || now > S.until) { e._slam = null; continue; }
                    const r = (e.radius || 14) + 2, kx = e.knockbackVx || 0, ky = e.knockbackVy || 0;
                    if (!kx && !ky) continue;                                           // the shove has run out
                    const box = { left: e.x - r, right: e.x + r, top: e.y - r, bottom: e.y + r };
                    let hit = false;
                    for (const list of [this.activeMap.walls || [], getColliders(this.activeMap)]) {
                        const near = _physicsSpatial.query(list, box) || [];
                        for (let i = 0; !hit && i < near.length; i++) {
                            const b = near[i], dx = Math.max(b.x, Math.min(b.x + b.w, e.x)) - e.x, dy = Math.max(b.y, Math.min(b.y + b.h, e.y)) - e.y;
                            hit = dx * dx + dy * dy <= r * r && dx * kx + dy * ky >= 0;   // touching it, and driven toward it
                        }
                    }
                    if (!hit) continue;
                    e._slam = null;
                    e.lastHitBy = S.by; e.lastHitMelee = true;
                    e.takeDamage(S.dmg, 0, 0, { punch: true, slam: true });
                    e.knockbackVx = 0; e.knockbackVy = 0;
                    const fx = this.knuckleFx || (this.knuckleFx = []);
                    fx.push({ k: 'ring', x: e.x, y: e.y, t0: now, slam: true });
                    if (this.weather) this.weather.spawnSparks(e.x, e.y, 10);
                    this.triggerShake(5);
                    if (typeof ambience !== 'undefined' && ambience.clink) ambience.clink();
                    (this.floatingTexts || (this.floatingTexts = [])).push({ target: null, x: e.x, y: e.y - 26, value: 0, text: 'SLAM!', color: '#ffd76a', t0: now, pop: now, drift: 0 });
                }
            },

            /** The gold afterimages of each punch and a haymaker's ring (world space, after the slashes) */
            drawKnuckleFx(ctx) {
                const L = this.knuckleFx; if (!L || !L.length) return;
                const now = _gameTimeSec, TAU = Math.PI * 2, R = CONFIG.PUNCH.REACH;
                for (let i = L.length - 1; i >= 0; i--) {
                    const f = L[i], age = now - f.t0;
                    if (f.k === 'trail') {
                        const life = f.hay ? 0.32 : 0.22;
                        if (age > life) { L.splice(i, 1); continue; }
                        const c = Math.cos(f.a), s = Math.sin(f.a), side = f.side === 'right' ? 1 : -1;
                        const ox = -s * 5 * side, oy = c * 5 * side;                   // the punching hand's side
                        const n = f.hay ? 4 : 3;
                        ctx.save();
                        for (let j = 0; j < n; j++) {
                            const u = (j + 1) / n, d = 12 + R * u * 1.1, a = (1 - age / life) * (0.18 + 0.42 * u);
                            const x = f.x + c * d + ox, y = f.y + s * d + oy, rr = (f.hay ? 5.4 : 4.4) * (0.7 + 0.3 * u);
                            const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.2);
                            g.addColorStop(0, `rgba(255, 238, 170, ${a})`); g.addColorStop(0.45, `rgba(255, 196, 72, ${a * 0.7})`); g.addColorStop(1, 'rgba(255, 170, 40, 0)');
                            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr * 2.2, 0, TAU); ctx.fill();
                            ctx.fillStyle = `rgba(255, 226, 140, ${a * 1.2})`; ctx.beginPath(); ctx.arc(x, y, rr * 0.7, 0, TAU); ctx.fill();
                        }
                        ctx.restore();
                    } else {
                        const life = 0.36;
                        if (age > life) { L.splice(i, 1); continue; }
                        const u = age / life, rr = (f.slam ? 14 : 10) + u * (f.slam ? 30 : 24);
                        ctx.save();
                        ctx.globalAlpha = (1 - u) * 0.9;
                        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3 * (1 - u) + 0.6;
                        ctx.shadowColor = '#ffb732'; ctx.shadowBlur = 10;
                        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, TAU); ctx.stroke();
                        ctx.lineWidth = 1; ctx.strokeStyle = '#fff4cf';
                        ctx.beginPath(); ctx.arc(f.x, f.y, rr * 0.7, 0, TAU); ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        });

        /** Gilded brass knuckles across a fist, seen from above: `a` is the forearm's way (toward the knuckles) */
        function drawKnuckleDuster(ctx, fx, fy, a, scale = 1) {
            ctx.save();
            ctx.translate(fx, fy); ctx.rotate(a); ctx.scale(scale, scale);
            ctx.fillStyle = '#7a5a1a'; ctx.beginPath(); ctx.roundRect(1.2, -3.6, 2.6, 7.2, 1.1); ctx.fill();          // the bar's shadowed base
            const g = ctx.createLinearGradient(1.2, -3.6, 3.8, 3.6);
            g.addColorStop(0, '#fff0b0'); g.addColorStop(0.45, '#e8b84a'); g.addColorStop(1, '#a87a22');
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(1.6, -3.4, 2.2, 6.8, 1); ctx.fill();
            ctx.fillStyle = '#fff6d0';
            for (const y of [-2.4, -0.8, 0.8, 2.4]) { ctx.beginPath(); ctx.arc(3.3, y, 0.55, 0, Math.PI * 2); ctx.fill(); }   // a stud over each knuckle
            ctx.restore();
        }
