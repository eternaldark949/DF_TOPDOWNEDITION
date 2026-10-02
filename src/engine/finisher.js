        // GameEngine — Deaths and the finisher. Methods are added to GameEngine.prototype
        // (see engineMixin in game-engine.js).
        //
        // Every fallen enemy now leaves a body: it recoils from the killing hit, the knees
        // go, the arms fly and it settles on the floor, lies there a while, then fades
        // (game.corpses, at most 24). Its gun drops beside it.
        //
        // The finisher is earned: the last of a wave, a boss (a gunner or warden), or a
        // stylish execution (the last alerted foe near her, taken by a flit-strike, a punch,
        // a one-shot sniper kill, or with Stella untouched). Time eases into slow motion and
        // the camera goes to the body while it falls; then it glides to Stella, who twirls
        // her gun as the glitter of the kill rises in its colour; time comes back and a
        // "Capture?" pill offers a photo. Real-time beats, pause-safe, any input cuts it short.
        // Settings → Finisher: Full / Subtle (no camera move, shorter) / Off.

        const FINISHER = {
            COOLDOWN: 20,          // game seconds between finishers
            SLOW: 0.25,            // time scale in the beat
            T_BODY: 1100,          // ms on the body
            T_STELLA: 1100,        // ms on Stella, twirling
            ZOOM_BODY: 1.6, ZOOM_STELLA: 1.8,
            CORPSES: 24, LIE: 12, FADE: 1.5,
            RAMP_IN: 150, RAMP_OUT: 600,   // ms: a hard brake on the kill, then time builds back on an S-curve
            CUT_OUT: 250                   // ms: back to speed when she acts (fires, flits) mid-finisher
        };

        engineMixin({
            /** An enemy has fallen: leave the body (called from the enemy loop in update.js) */
            addCorpse(e) {
                const C = this.corpses || (this.corpses = []);
                const by = e.lastHitBy, melee = !!e.lastHitMelee;
                const heavy = !melee && by === this.player && this.currentWeapon && /sniper/.test(this.currentWeapon.id);
                const dir = e._hitDir ?? (e.angle + Math.PI);
                C.push({ e, t0: _gameTimeSec, dir, kind: melee ? 'punch' : heavy ? 'heavy' : 'shot', weapon: e.equippedWeaponId || null,
                         spin: (Math.random() - 0.5) * (melee ? 1.2 : 0.4), seed: Math.random() * 10 });
                while (C.length > FINISHER.CORPSES) C.shift();
            },

            updateCorpses() {
                const C = this.corpses; if (!C || !C.length) return;
                for (let i = C.length - 1; i >= 0; i--) if (_gameTimeSec - C[i].t0 > FINISHER.LIE + FINISHER.FADE) C.splice(i, 1);
            },

            /**
             * The bodies, under the living. A ganger falls through the humanoid renderer's
             * `die` pose; anything else (gunners, drones, wardens) tips, sinks and fades.
             */
            drawCorpses(ctx, cb) {
                const C = this.corpses; if (!C || !C.length) return;
                for (const c of C) {
                    const e = c.e, age = _gameTimeSec - c.t0;
                    if (cb && (e.x < cb.left - 60 || e.x > cb.right + 60 || e.y < cb.top - 60 || e.y > cb.bottom + 60)) continue;
                    const k = Math.min(1, age / 0.6), ease = 1 - Math.pow(1 - k, 3);
                    const fade = age > FINISHER.LIE ? Math.max(0, 1 - (age - FINISHER.LIE) / FINISHER.FADE) : 1;
                    if (fade <= 0) continue;
                    // the fall: the body's back toward where the hit pushed it (punches spin it a little)
                    const back = c.kind === 'heavy' ? 14 : c.kind === 'punch' ? 7 : 9;
                    const bx = e.x + Math.cos(c.dir) * back * ease, by = e.y + Math.sin(c.dir) * back * ease;
                    const facing = c.dir + Math.PI + c.spin * ease;          // she faces where the shot came from as she goes down
                    ctx.save();
                    ctx.globalAlpha = fade;
                    if (typeof Ganger !== 'undefined' && e instanceof Ganger && e.look) {
                        if (c.weapon && ease > 0.6) {                          // the gun, dropped beside the hand
                            const gx = bx + Math.cos(facing + 0.9) * 16, gy = by + Math.sin(facing + 0.9) * 16;
                            ctx.save(); ctx.translate(gx, gy); ctx.rotate(facing + 2.2 + c.seed);
                            drawWeapon(ctx, c.weapon, 0, 0, 0, 0.9, false); ctx.restore();
                        }
                        ctx.translate(bx, by); ctx.rotate(facing);
                        // from above, a body lying back reads longer along its length and a touch narrower
                        ctx.scale(1 + 0.32 * ease, 1 - 0.06 * ease);
                        e._corpseK = ease;
                        drawProceduralHumanoid(ctx, e, { ...e.look, stance: 'idle', pose: 'die', poseWhileMoving: true, poseInstant: true, weapon: null });
                    } else {
                        // generic: tip toward the fall, sink, and go
                        ctx.translate(bx, by); ctx.rotate(c.dir * 0.15 * ease); ctx.scale(1 - 0.25 * ease, 1 - 0.45 * ease); ctx.translate(-bx, -by);
                        ctx.globalAlpha = fade * (1 - 0.35 * ease);
                        const wasDead = e.dead, st = e.state;
                        e.dead = false; e._corpseDraw = true;
                        try { e.draw(ctx); } catch (err) { /* a body that can't be drawn is just gone */ }
                        e.dead = wasDead; e.state = st; e._corpseDraw = false;
                    }
                    ctx.restore();
                }
            },

            /** Is this death one worth a finisher? Returns the reason, or null. */
            finisherReason(e) {
                if ((GameSettings.finisher || 'full') === 'off') return null;
                if (this.scenes && this.scenes.running) return null;
                if (this.isDriving || (this.cutscene && this.cutscene.active)) return null;
                if (this._finLast !== undefined && _gameTimeSec - this._finLast < FINISHER.COOLDOWN) return null;
                const others = this.enemies.filter(o => o !== e && !o.dead);
                // the last of a wave
                if (e._gauntletWave && this.hordeGauntlet && this.hordeGauntlet.active
                    && !others.some(o => o._gauntletWave === e._gauntletWave)) return 'wave';
                // a boss: a warden, or the last gunner standing
                const isGunner = typeof GatlingGunner !== 'undefined' && e instanceof GatlingGunner;
                if (isGunner && (e.persona || !others.some(o => o instanceof GatlingGunner))) return 'boss';
                // a stylish execution: hers, the last alerted foe near her
                if (e.lastHitBy !== this.player) return null;
                const near = others.some(o => Math.hypot(o.x - this.player.x, o.y - this.player.y) < 900
                    && (o.state === 'ALERT' || o.state === 'SUPPRESSING' || o.state === 'SEARCHING'));
                if (near) return null;
                if (_gameTimeSec - (this.flitState.lastFlitAt ?? -99) <= 1) return 'flit';
                if (e.lastHitMelee) return 'punch';
                if ((e._hits || 0) <= 1 && this.currentWeapon && /sniper/.test(this.currentWeapon.id)) return 'one shot';
                if (this.playerHealth >= (this.maxPlayerHealth || 100) && _gameTimeSec - (this.lastHurtAt ?? -99) > 30 && e._engaged) return 'untouched';
                return null;
            },

            /** Begin the finisher on this body */
            startFinisher(e, reason) {
                const subtle = GameSettings.finisher === 'subtle';
                this._finLast = _gameTimeSec;
                const col = (this.currentWeapon && weaponModel(this.currentWeapon.id).brass)
                    || (this.currentWeapon && (weaponModel(this.currentWeapon.id).fx || {}).col) || '#e9dcff';
                this.finisher = { reason, x: e.x, y: e.y, ms: 0, subtle, col, burst: false, twirl: 0,
                                  tBody: subtle ? 500 : FINISHER.T_BODY, tStella: subtle ? 800 : FINISHER.T_STELLA };
                this.finCam = { dx: 0, dy: 0, z: 1 };
                this.triggerTimeSlow(subtle ? 0.5 : FINISHER.SLOW, (this.finisher.tBody + this.finisher.tStella) / 1000, true,
                                     { inMs: FINISHER.RAMP_IN, outMs: FINISHER.RAMP_OUT });
                this._finShot = this.shotsFired || 0;
                if (this.muzzleFlashes && this.muzzleFlashes.length) this.muzzleFlashes[this.muzzleFlashes.length - 1].life += 6;   // the last star lingers
            },

            /** Once per rendered frame (real ms, loop.js): the beats, the camera, the twirl */
            updateFinisher(elapsedMs) {
                const F = this.finisher;
                if (!F) {                                             // ease the camera home
                    const c = this.finCam; if (!c) return;
                    const k = 1 - Math.exp(-elapsedMs / 160);
                    c.dx -= c.dx * k; c.dy -= c.dy * k; c.z += (1 - c.z) * k;
                    if (Math.abs(c.dx) < 0.5 && Math.abs(c.dy) < 0.5 && Math.abs(c.z - 1) < 0.003) this.finCam = null;
                    return;
                }
                if (this.paused) return;
                F.ms += elapsedMs;
                // cut short: she fires again, flits, or something takes the stage
                if ((this.shotsFired || 0) > this._finShot || _gameTimeSec - (this.flitState.lastFlitAt ?? -99) < 0.05 && F.ms > 200
                    || (this.scenes && this.scenes.running) || this.isDriving) { this.endFinisher(true); return; }
                const onStella = F.ms > F.tBody;
                if (onStella && !F.burst) { F.burst = true; this.finisherBurst(F); }
                F.twirl = onStella ? Math.min(1, (F.ms - F.tBody) / (F.tStella * 0.85)) : 0;
                if (!F.subtle) {
                    const tx = onStella ? 0 : F.x - this.player.x, ty = onStella ? 0 : F.y - this.player.y;
                    const tz = onStella ? FINISHER.ZOOM_STELLA : FINISHER.ZOOM_BODY;
                    const k = 1 - Math.exp(-elapsedMs / (onStella ? 220 : 150));
                    const c = this.finCam;
                    c.dx += (tx - c.dx) * k; c.dy += (ty - c.dy) * k; c.z += (tz - c.z) * k;
                }
                if (F.ms > F.tBody + F.tStella) this.endFinisher(false);
            },

            endFinisher(cut) {
                const F = this.finisher; if (!F) return;
                this.finisher = null;
                if (cut) this.endTimeSlow(FINISHER.CUT_OUT);
                else if (typeof pauseMenuController !== 'undefined' && pauseMenuController.capturePrompt)
                    pauseMenuController.capturePrompt({ x: (F.x + this.player.x) / 2, y: (F.y + this.player.y) / 2, zoom: 1.5 });
            },

            /** The kill's glitter rises from the body and settles as lamp-catching flecks */
            finisherBurst(F) {
                const L = this.casings || (this.casings = []);
                const n = F.subtle ? 14 : 26;
                for (let i = 0; i < n; i++) {
                    const a = Math.random() * Math.PI * 2, v = 1.2 + Math.random() * 2.6;
                    L.push({ x: F.x, y: F.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a, spin: (Math.random() - 0.5) * 0.9, t: 0,
                             big: false, col: F.col, ph: Math.random() * 6.28, rate: 0.006 + Math.random() * 0.006 });
                }
                while (L.length > 60) L.shift();
                const fx = this.shotFx || (this.shotFx = []);
                for (let i = 0; i < 10; i++) {
                    const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 0.9;
                    fx.push({ k: 'dust', x: F.x, y: F.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, t: -i, life: 70, col: F.col, ph: Math.random() * 6.28 });
                }
                while (fx.length > 160) fx.shift();
            },

            /** Her twirl: the gun's spin about her trigger finger (radians), for the player's weapon draw */
            twirlAngle() {
                const F = this.finisher; if (!F || !F.twirl) return 0;
                const p = F.twirl, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;   // ease in-out
                return e * Math.PI * 4;                                                        // two turns, back to ready
            }
        });
