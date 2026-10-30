        /* =====================================================================
           HUNTERS — the Demoness's own (the Demoness Palace gauntlet)
           ---------------------------------------------------------------------
           A Hunter is a Ganger that was made for the dark:
             · night vision — her hiding in shadow doesn't blind it, and in the
               dark it still notices her (visibility floored at 0.55); its eyes
               burn ember, its sight cone shows red (the tell)
             · a dash — a crimson flit to close on her (ALERT, 150–420 px), or a
               sidestep when it's hit; a short cooldown, a noise she can hear
             · a claw — a swipe up close, with its sidearm for the rest
           The Hunter Alpha is tougher and dashes twice. The Demoness (a boss):
           horns, wings, a gown; chained dashes, a whip-claw at reach, she hunts
           by sound when she loses Stella; can't be executed; her intro under
           THE DEMONESS; her first defeat leaves the Maiden's Kukri.
           Lilitu's duel (`solo`, palace waves 10, 20, 30…): she comes alone, the
           palace dims, and her kit grows as she bleeds (DUEL; _duelStep):
             I   (to 66%) Ember Sigils where she last heard 949, burst after 1 s;
                 a fan of ember bolts (a Mirror Blade turns them back)
             II  (to 33%) + Shadow Step (a red flare, 0.4 s, then behind her and a
                 claw); Wing Gale (a knockback cone that breaks a blade's guard);
                 Blood Mirror (two one-hit decoys: only she keeps her ember eyes)
             III + Infernal Rite (the edges burn, the safe circle shrinks for 8 s);
                 quicker dashes; the whip strikes twice
           A haymaker's stagger stops her moves and cancels a tell. Her first solo
           defeat unlocks the Golden Retribution schematic; every one leaves two
           Dark Elements (update.js).
           ===================================================================== */
        const DUEL = {
            P2: 0.66, P3: 0.33,
            SIGIL_EVERY: [0, 4.5, 3.8, 3.2], SIGILS: [0, 1, 2, 3], SIGIL_SPREAD: 95,
            BOLT_EVERY: 2.8, BOLT_TELL: 0.35, BOLT_FAN: 3, BOLT_SPREAD: 0.17, BOLT_DMG: 12, BOLT_SPEED: 13,
            STEP_EVERY: 7, STEP_TELL: 0.4, STEP_BEHIND: 46,
            GALE_EVERY: 8, GALE_TELL: 0.5, GALE_REACH: 170, GALE_SPREAD: 0.75, GALE_PUSH: 140, GALE_HIT: 12, GUARD_BREAK: 1.2,
            MIRROR_EVERY: 16, MIRROR_SECS: 9, MIRROR_SPREAD: 80,
            RITE_EVERY: 20, RITE_R0: 430, RITE_R1: 140,
            DASH_CD_P3: 95, WHIP2_DELAY: 0.16
        };
        class Hunter extends Ganger {
            constructor(x, y, cfg = {}) {
                super(x, y, { hp: cfg.hp || 70, speed: cfg.speed || 2.8, visionRange: cfg.visionRange || 520, weaponId: cfg.weaponId || 'pistol_ganger' });
                this.hunter = true;
                this.nightVision = true;
                this.alpha = !!cfg.alpha;
                this.dashMax = cfg.dashes || 1; this.dashCDBase = cfg.dashCD || 230;
                this.dashCD = 90 + Math.random() * 120; this._chain = 0;
                this.clawCD = 0; this.clawDmg = cfg.claw || 14; this.clawReach = cfg.clawReach || 44;
                this.huntSpeed = cfg.huntSpeed || 2.4;
                this.look = cfg.look || Hunter.makeLook(this.alpha);
            }

            static makeLook(alpha) {
                const r = Math.random;
                return {
                    gender: r() < 0.5 ? 'female' : 'male', skinColor: ['#3a1a1a', '#5a2a24', '#2a1414', '#6a3a30'][r() * 4 | 0], eyeColor: '#ff5a1a', blood: 'ink',
                    build: alpha ? 'broad' : r() < 0.5 ? 'athletic' : 'slim', height: alpha ? 1.08 : 0.98 + r() * 0.06,
                    top: { type: 'coat', color: alpha ? '#2a0610' : '#120a0e', inner: '#2a0a12', trim: alpha ? '#e3a64a' : '#7a0618' },
                    bottom: { type: 'leggings', color: '#0c0608' }, shoes: { type: 'boots', color: '#0a0406' },
                    hat: { type: 'hood_up', color: alpha ? '#3a0614' : '#1a0a10' }
                };
            }

            update(player, walls, buildings, markers, traffic, map, enemies) {
                if (this.dead) return null;
                if (this.dormant || this._execBy) return null;
                // Night vision: she isn't hidden from it, and in the dark it still picks her out
                const seen = Object.create(player);
                seen.isHidden = false; seen.visibility = Math.max(player.visibility ?? 0, 0.55);
                let res = super.update(seen, walls, buildings, markers, traffic, map, enemies);
                if (this.dead || typeof game === 'undefined') return res;
                if (this._staggerUntil && _gameTimeSec < this._staggerUntil) return null;   // staggered (a haymaker, a spill): no dash, no claw
                const g = game, dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                this.dashCD--; this.clawCD--;
                const engaged = this.state === 'ALERT' || this.state === 'SUPPRESSING';
                // A dash at her, from across the room (twice for an alpha, the second hard on the first)
                if (engaged && this.dashCD <= 0 && d > 150 && d < 420) {
                    const ux = dx / d, uy = dy / d;
                    if (this._dash(player.x - ux * 70, player.y - uy * 70, walls, buildings)) {
                        this._chain = (this._chain || 0) + 1;
                        this.dashCD = this._chain < this.dashMax ? 22 : this.dashCDBase * (0.8 + Math.random() * 0.4);
                        if (this._chain >= this.dashMax) this._chain = 0;
                    } else this.dashCD = 30;
                }
                // Hit: a sidestep out of the line of fire
                if (this._hitT && _gameTimeSec - this._hitT < 0.02 && this.dashCD > 40 && this.dashCD < this.dashCDBase && Math.random() < 0.5) {
                    const s = Math.random() < 0.5 ? 1 : -1, ux = dx / (d || 1), uy = dy / (d || 1);
                    if (this._dash(this.x - uy * 90 * s, this.y + ux * 90 * s, walls, buildings)) this.dashCD = Math.max(this.dashCD, 120);
                }
                // A claw up close
                if (engaged && d < this.clawReach && this.clawCD <= 0) {
                    this.clawCD = 45;
                    this._clawT = _gameTimeSec;
                    const a = Math.atan2(dy, dx);
                    const claw = new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 18, speed: 0.5, life: 3,
                                                        damage: this.clawDmg, isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true });
                    res = res ? [].concat(res, claw) : claw;
                }
                return res;
            }

            /** A crimson flit: to (tx, ty) if the way is clear (never into a wall); a noise she can hear */
            _dash(tx, ty, walls, buildings) {
                const g = typeof game !== 'undefined' ? game : null; if (!g) return false;
                const nav = NavGrid.for(g.activeMap);
                if (nav && !nav.walkable(tx, ty)) return false;
                if (isLineBlocked(this.x, this.y, tx, ty, walls, buildings)) return false;
                if (g.roomSystem && g.roomSystem.active && g.roomSystem.doorBlocks(this.x, this.y, tx, ty)) return false;
                const L = g.hunterDashes || (g.hunterDashes = []);
                L.push({ x0: this.x, y0: this.y, x1: tx, y1: ty, t0: _gameTimeSec, a: this.angle, look: this.look, boss: !!this.bossName, seed: Math.random() * 100 });
                if (L.length > 12) L.shift();
                this.x = tx; this.y = ty;
                g.emitNoise(tx, ty, 220, 'dash', false, { src: this });
                return true;
            }
        }

        class Demoness extends Hunter {
            constructor(x, y, cfg = {}) {
                super(x, y, { hp: cfg.hp || 900, speed: 3.0, visionRange: 640, dashes: 2, dashCD: 150, claw: 22, clawReach: 50, huntSpeed: 2.9, look: Demoness.look() });
                this.bossName = 'Lilitu, the Demoness';
                this.maxHp = this.hp;
                this._noExecute = true;
                this.whipCD = 60; this.telegraphThreshold = 30; this.whipDmg = 18;
                this._eyeK = 1; this._eyeT = 1; this._riseK = 1; this._riseT = 1; this._igniteFlash = 0;
                this.solo = !!cfg.solo; this.phase = 1;
                if (cfg.decoy) {                                     // a Blood Mirror decoy: her shape, dead eyes, one hit
                    this.decoy = true; this.bossName = null; this.hp = this.maxHp = 1; this._noExecute = true;
                    this.look = { ...this.look, eyeColor: '#2a0508' }; this.clawDmg = 6; this.whipDmg = 5;
                }
            }

            static look() {
                return {
                    gender: 'female', skinColor: '#8a0707', eyeColor: '#ff5a1a', blood: 'ink', build: 'curvy', height: 1.14,
                    hair: { type: 'demon_dancer', color: '#0a0000' },
                    hat: { type: 'demon_horns', color: '#160406', trim: '#e3a64a' },
                    top: { type: 'sleeved_crop', color: '#0a0406', trim: '#e3a64a' },
                    bottom: { type: 'long_skirt', color: '#0a0406', trim: '#b0122e' },
                    train: { type: 'dress_train', color: '#2a0610' },
                    shoes: { type: 'heels', color: '#0a0406' }
                };
            }

            makeDormant() { this.dormant = true; this._eyeT = 0; this._eyeK = 0; this._riseT = 0; this._riseK = 0; }
            awaken() {
                this.dormant = false; this._eyeT = 1; this._riseT = 1;
                const p = typeof game !== 'undefined' && game.player;
                if (p) { this.state = 'SEARCHING'; this.suspicion = 70; this.investigateTarget = { x: p.x, y: p.y }; }
            }

            /** Lilitu marks where she last heard her (Ember Sigils) */
            hearNoise(nx, ny, strength, err) {
                const heard = super.hearNoise(nx, ny, strength, err);
                if (heard) this._heard = { x: nx, y: ny, t: _gameTimeSec };
                return heard;
            }

            update(player, walls, buildings, markers, traffic, map, enemies) {
                this._eyeK += (this._eyeT - this._eyeK) * 0.08; this._riseK += (this._riseT - this._riseK) * 0.05;
                this._igniteFlash = Math.max(0, (this._igniteFlash || 0) - 0.03);
                if (this.dead || this.dormant) return null;
                // She hunts by sound: lose her and she goes still, listening, then she's gone to the noise
                let res = super.update(player, walls, buildings, markers, traffic, map, enemies);
                if (this.dead || typeof game === 'undefined') return res;
                if (this._staggerUntil && _gameTimeSec < this._staggerUntil) return null;   // staggered: no whip
                const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                this.whipCD--;
                if ((this.state === 'ALERT' || this.state === 'SUPPRESSING') && this.whipCD <= 0 && d > 55 && d < 120 && !isLineBlocked(this.x, this.y, player.x, player.y, walls, buildings)) {
                    this.whipCD = 75; this._whipT = _gameTimeSec; this._whipTo = { x: player.x, y: player.y };
                    const a = Math.atan2(dy, dx);
                    const whip = new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 20, speed: 0.5, life: 3,
                                                        damage: this.whipDmg, isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true });
                    res = res ? [].concat(res, whip) : whip;
                }
                if (this.state === 'SEARCHING' && this.investigateTarget && this.dashCD <= 0) {
                    const t = this.investigateTarget, dd = Math.hypot(t.x - this.x, t.y - this.y);
                    if (dd > 160 && dd < 460 && this._dash(t.x, t.y, walls, buildings)) this.dashCD = this.dashCDBase;
                }
                if (this.solo) res = this._duelStep(player, walls, buildings, res);
                else if (this.decoy && _gameTimeSec > (this._decoyUntil || Infinity)) this._vanish();
                return res;
            }

            /** A decoy's time is up (or she fell): gone in a puff of crimson (the enemy loop takes it away) */
            _vanish() { this.dead = true; }

            /** The duel: her phase from her blood, then at most one tell at a time, and her sigils and bolts */
            _duelStep(player, walls, buildings, res) {
                const g = typeof game !== 'undefined' ? game : null; if (!g || this.dead) return res;
                const now = _gameTimeSec, D = DUEL, add = (s) => { res = res ? [].concat(res, s) : s; };
                const frac = this.hp / (this.maxHp || 1), phase = frac > D.P2 ? 1 : frac > D.P3 ? 2 : 3;
                if (!this._duel) this._duel = { sigil: now + 2, bolt: now + 1.5, step: now + 4, gale: now + 3, mirror: now + 2, rite: now + 1, whip: this._whipT || 0 };
                const T = this._duel;
                if (phase > this.phase) {                                     // she sheds her grace
                    this.phase = phase; this._igniteFlash = 1; this._tell = null;
                    g.triggerShake(10); audioSys.sfx('explode');
                    g.addHazard({ kind: 'flare', x: this.x, y: this.y, dur: 0.6, owner: this });
                    showMessage(phase === 2 ? 'LILITU — HER SHADOW WAKES' : 'LILITU — THE INFERNAL RITE');
                    if (phase === 2) { T.mirror = now + 1.5; T.step = now + 3; }
                    if (phase === 3) { T.rite = now + 1; this.dashCDBase = D.DASH_CD_P3; this.dashCD = Math.min(this.dashCD, 30); }
                }
                // Phase III: the whip strikes twice
                if (this.phase >= 3 && this._whipT && this._whipT !== T.whip) {
                    T.whip = this._whipT; T.whip2 = now + D.WHIP2_DELAY;
                }
                if (T.whip2 && now >= T.whip2) {
                    T.whip2 = 0;
                    const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                    if (d < 130 && !isLineBlocked(this.x, this.y, player.x, player.y, walls, buildings)) {
                        const a = Math.atan2(dy, dx); this._whipT = T.whip = now; this._whipTo = { x: player.x, y: player.y };
                        add(new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 20, speed: 0.5, life: 3,
                                                   damage: this.whipDmg, isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true }));
                    }
                }
                // Staggered (a haymaker): no moves, and whatever she was winding up is lost
                if (this._staggerUntil && now < this._staggerUntil) { this._tell = null; return res; }
                if (g.isDriving || !player.visible) return res;
                const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                const engaged = this.state === 'ALERT' || this.state === 'SUPPRESSING';
                const clear = !isLineBlocked(this.x, this.y, player.x, player.y, walls, buildings);
                // A tell running: when it's due, the move happens
                const tl = this._tell;
                if (tl && now >= tl.at) {
                    this._tell = null;
                    if (tl.kind === 'bolt') add(this._emberBolts(player));
                    else if (tl.kind === 'step') { const c = this._shadowStep(player, tl); if (c) add(c); }
                    else if (tl.kind === 'gale') this._wingGale(player, tl);
                    return res;
                }
                if (tl) return res;
                // Ember Sigils: where she last heard her (or sees her), and round it
                if (now >= T.sigil) {
                    const fresh = engaged ? { x: player.x, y: player.y } : this._heard && now - this._heard.t < 6 ? this._heard : null;
                    T.sigil = now + D.SIGIL_EVERY[this.phase] * (0.85 + Math.random() * 0.3);
                    if (fresh && Math.hypot(fresh.x - this.x, fresh.y - this.y) < 700) {
                        const nav = NavGrid.for(g.activeMap);
                        for (let i = 0; i < D.SIGILS[this.phase]; i++) {
                            const a = Math.random() * Math.PI * 2, r = i ? D.SIGIL_SPREAD * (0.6 + Math.random() * 0.5) : 0;
                            const x = fresh.x + Math.cos(a) * r, y = fresh.y + Math.sin(a) * r;
                            if (i && nav && !nav.walkable(x, y)) continue;
                            g.addHazard({ kind: 'sigil', x, y, r: 58, owner: this });
                        }
                    }
                }
                // Infernal Rite (III): the safe circle round where 949 stands
                if (this.phase >= 3 && now >= T.rite) {
                    T.rite = now + D.RITE_EVERY;
                    g.addHazard({ kind: 'rite', x: player.x, y: player.y, r0: D.RITE_R0, r1: D.RITE_R1, r: D.RITE_R0, dur: 8, owner: this });
                    showMessage('INFERNAL RITE — STAY INSIDE THE CIRCLE');
                    this._igniteFlash = 1;
                }
                // Blood Mirror (II+): two decoys, and she may be any of the three
                if (this.phase >= 2 && now >= T.mirror && engaged) {
                    T.mirror = now + D.MIRROR_EVERY;
                    this._bloodMirror(walls, buildings);
                    return res;
                }
                // Wing Gale (II+) up close
                if (this.phase >= 2 && now >= T.gale && d < D.GALE_REACH * 0.85 && clear) {
                    T.gale = now + D.GALE_EVERY;
                    this._tell = { kind: 'gale', at: now + D.GALE_TELL, a: Math.atan2(dy, dx) };
                    return res;
                }
                // Shadow Step (II+): a flare where she is and where she'll be
                if (this.phase >= 2 && now >= T.step && d > 90 && d < 520 && engaged) {
                    const spot = this._behind(player);
                    if (spot) {
                        T.step = now + D.STEP_EVERY * (this.phase >= 3 ? 0.7 : 1);
                        this._tell = { kind: 'step', at: now + D.STEP_TELL, x: spot.x, y: spot.y };
                        g.addHazard({ kind: 'flare', x: this.x, y: this.y, dur: D.STEP_TELL, owner: this });
                        g.addHazard({ kind: 'flare', x: spot.x, y: spot.y, dur: D.STEP_TELL, owner: this });
                        return res;
                    }
                }
                // Ember bolts at range, with a clear line
                if (now >= T.bolt && engaged && clear && d > 140 && d < 560) {
                    T.bolt = now + D.BOLT_EVERY * (this.phase >= 3 ? 0.75 : 1);
                    this._tell = { kind: 'bolt', at: now + D.BOLT_TELL };
                    this._boltTellT = now;
                }
                return res;
            }

            /** Her tells, above the darkness (engine/boss-hazards.js): embers gathering, the gale's cone, the Rite's flames on her */
            drawDuelTells(ctx) {
                if (this.dead || !this.solo) return;
                const now = _gameTimeSec, t = _frameTime / 1000, tl = this._tell;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (tl && tl.kind === 'bolt') {
                    const k = Math.min(1, (now - (this._boltTellT || now)) / DUEL.BOLT_TELL), a = this.angle;
                    const x = this.x + Math.cos(a) * 16, y = this.y + Math.sin(a) * 16;
                    ctx.globalAlpha = 0.5 + 0.5 * k; drawGlow(ctx, x, y, 8 + 14 * k, '255, 110, 30', 0.35);
                    ctx.strokeStyle = `rgba(255,120,40,${0.25 + 0.4 * k})`; ctx.lineWidth = 1; ctx.setLineDash([5, 6]);
                    for (let i = 0; i < DUEL.BOLT_FAN; i++) {
                        const off = (i - (DUEL.BOLT_FAN - 1) / 2) * DUEL.BOLT_SPREAD;
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + off) * 160 * k, y + Math.sin(a + off) * 160 * k); ctx.stroke();
                    }
                    ctx.setLineDash([]);
                } else if (tl && tl.kind === 'gale') {
                    const k = 1 - Math.max(0, (tl.at - now) / DUEL.GALE_TELL);
                    ctx.globalAlpha = 0.15 + 0.35 * k; ctx.fillStyle = '#ff3a5a';
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.arc(this.x, this.y, DUEL.GALE_REACH, tl.a - DUEL.GALE_SPREAD, tl.a + DUEL.GALE_SPREAD); ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffb0c0'; ctx.lineWidth = 1.2; ctx.stroke();
                }
                if (this.phase >= 2) {                                         // the duel's later phases burn round her
                    const n = this.phase >= 3 ? 10 : 5;
                    for (let i = 0; i < n; i++) {
                        const ph = (t * 1.8 + i / n) % 1, a = i * 2.39 + t * 0.5, r = 14 + 6 * Math.sin(t * 3 + i);
                        ctx.globalAlpha = (1 - ph) * (this.phase >= 3 ? 0.8 : 0.45); ctx.fillStyle = ph < 0.3 ? '#ffd0a0' : this.phase >= 3 ? '#ff3a10' : '#b0122e';
                        ctx.beginPath(); ctx.ellipse(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r - ph * 18, 2.2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();
            }

            /** A fan of ember bolts at her (enemy shots: a Mirror Blade's cut turns them back) */
            _emberBolts(player) {
                const D = DUEL, a = Math.atan2(player.y - this.y, player.x - this.x), out = [];
                for (let i = 0; i < D.BOLT_FAN; i++) {
                    const off = (i - (D.BOLT_FAN - 1) / 2) * D.BOLT_SPREAD;
                    out.push(new ProjectileEntity({ x: this.x + Math.cos(a) * 16, y: this.y + Math.sin(a) * 16, angle: a + off, speed: D.BOLT_SPEED,
                                                    radius: 6, damage: D.BOLT_DMG, isEnemy: true, owner: this, color: '#ff5a1a', life: 70 }));
                }
                return out;
            }

            /** A walkable spot just behind 949 (or beside her), or null */
            _behind(player) {
                const g = game, nav = NavGrid.for(g.activeMap), fa = player.angle || 0;
                for (const off of [Math.PI, Math.PI * 0.7, -Math.PI * 0.7, Math.PI / 2, -Math.PI / 2]) {
                    const x = player.x + Math.cos(fa + off) * DUEL.STEP_BEHIND, y = player.y + Math.sin(fa + off) * DUEL.STEP_BEHIND;
                    if ((!nav || nav.walkable(x, y)) && !isLineBlocked(player.x, player.y, x, y, g.activeMap.walls, getColliders(g.activeMap))) return { x, y };
                }
                return null;
            }

            /** Shadow Step: there in a blink (a crimson trail), and a claw */
            _shadowStep(player, tl) {
                const g = game, L = g.hunterDashes || (g.hunterDashes = []);
                L.push({ x0: this.x, y0: this.y, x1: tl.x, y1: tl.y, t0: _gameTimeSec, a: this.angle, look: this.look, boss: true, seed: Math.random() * 100 });
                if (L.length > 12) L.shift();
                this.x = tl.x; this.y = tl.y;
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                this.angle = a; this.clawCD = 45; this._clawT = _gameTimeSec;
                g.emitNoise(this.x, this.y, 220, 'dash', false, { src: this });
                if (Math.hypot(player.x - this.x, player.y - this.y) > 90) return null;
                return new ProjectileEntity({ x: player.x - Math.cos(a) * 4, y: player.y - Math.sin(a) * 4, angle: a, radius: 18, speed: 0.5, life: 3,
                                              damage: Math.round(this.clawDmg * 1.2), isEnemy: true, owner: this, color: 'rgba(0,0,0,0)', melee: true });
            }

            /** Wing Gale: a cone of wind before her; caught, she's thrown back and her blade's guard broken */
            _wingGale(player, tl) {
                const g = game, D = DUEL, now = _gameTimeSec;
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                g.addHazard({ kind: 'gale', x: this.x, y: this.y, a, spread: D.GALE_SPREAD, reach: D.GALE_REACH, dur: 0.35, owner: this });
                this._galeT = now; g.triggerShake(5);
                const dx = player.x - this.x, dy = player.y - this.y, d = Math.hypot(dx, dy);
                if (d > D.GALE_REACH || Math.abs(normalizeAngle(Math.atan2(dy, dx) - tl.a)) > D.GALE_SPREAD) return;
                if (!g.hurtPlayer(D.GALE_HIT)) return;
                g.shovePlayer(dx / (d || 1) * D.GALE_PUSH, dy / (d || 1) * D.GALE_PUSH);
                // a blade's guard breaks: no swing for a moment, and the one in hand is lost
                g.guardBrokenUntil = now + D.GUARD_BREAK;
                if (g.weaponMode === 'melee') { g.shootCooldown = Math.max(g.shootCooldown || 0, 40); g._slashT = -99; g._swing = null; }
                showMessage('WING GALE — GUARD BROKEN');
            }

            /** Blood Mirror: two decoys beside her, and she trades places with one of them */
            _bloodMirror(walls, buildings) {
                const g = game, nav = NavGrid.for(g.activeMap), D = DUEL;
                const pa = this.angle + Math.PI / 2, spots = [{ x: this.x, y: this.y }];
                for (const s of [-1, 1]) {
                    const x = this.x + Math.cos(pa) * D.MIRROR_SPREAD * s, y = this.y + Math.sin(pa) * D.MIRROR_SPREAD * s;
                    if ((!nav || nav.walkable(x, y)) && !isLineBlocked(this.x, this.y, x, y, walls, buildings)) spots.push({ x, y });
                }
                if (spots.length < 2) return;
                for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
                this.x = spots[0].x; this.y = spots[0].y;
                for (const s of spots.slice(1)) {
                    const m = new Demoness(s.x, s.y, { decoy: true });
                    m.angle = this.angle; m.state = this.state; m.suspicion = this.suspicion; m.navMap = this.navMap;
                    m.investigateTarget = this.investigateTarget && { ...this.investigateTarget };
                    m._decoyUntil = _gameTimeSec + D.MIRROR_SECS; m._gauntletWave = this._gauntletWave; m._mirrorOf = this;
                    g.enemies.push(m);
                }
                for (const s of spots) if (g.weather) g.weather.spawnExplosion(s.x, s.y, '#7a0618', 5, 1.4);
                g.triggerShake(4);
                showMessage('BLOOD MIRROR — ONLY ONE OF THEM HAS HER EYES');
            }

            draw(ctx) {
                if (this.dead) return;
                // Her wings, behind her: two membranes of black and crimson that breathe as she moves
                const t = _gameTimeSec, flap = 0.12 * Math.sin(t * 3 + this.x * 0.01), rise = 0.6 + 0.4 * (this._riseK ?? 1);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(rise, rise);
                for (const s of [-1, 1]) {
                    ctx.save(); ctx.rotate(s * (0.25 + flap));
                    ctx.fillStyle = 'rgba(14,2,6,0.92)'; ctx.strokeStyle = 'rgba(176,18,46,0.75)'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(-4, s * 5);
                    ctx.quadraticCurveTo(-14, s * 30, -34, s * 40); ctx.lineTo(-30, s * 30); ctx.lineTo(-38, s * 26); ctx.lineTo(-30, s * 18); ctx.lineTo(-34, s * 10);
                    ctx.quadraticCurveTo(-18, s * 8, -6, s * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = 'rgba(227,166,74,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-5, s * 5); ctx.lineTo(-34, s * 40); ctx.moveTo(-5, s * 5); ctx.lineTo(-38, s * 26); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
                super.draw(ctx);
                // the whip-claw: a crimson lash to where she struck
                if (this._whipT && _gameTimeSec - this._whipT < 0.18 && this._whipTo) {
                    const k = 1 - (_gameTimeSec - this._whipT) / 0.18;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,60,90,${0.8 * k})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                    const mx = (this.x + this._whipTo.x) / 2 + Math.cos(this.angle + 1.57) * 18, my = (this.y + this._whipTo.y) / 2 + Math.sin(this.angle + 1.57) * 18;
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.quadraticCurveTo(mx, my, this._whipTo.x, this._whipTo.y); ctx.stroke(); ctx.restore();
                }
            }
        }

