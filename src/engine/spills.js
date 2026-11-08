        // GameEngine — Spills. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Her glass (the Crystal Glass, the Mirrored Glass) holds a pour: cosmetics.drinkLevel, 1 full, 0 dry.
        // A hard turn or a reversal, a Flit, a hit: it slops over the rim, a little each time, and lands as a
        // puddle the colour of the drink (red wine pools dark, champagne gold) with a few drops thrown ahead.
        // The puddles splash underfoot like rain water (engine/footsteps.js), so a trail of rosé gives a
        // sneak away, then dry out. The bar cart at home tops the glass back up (refillGlass).
        // Skills: Arms' Steady spills less; Frame's Grounded makes gangers slip in her spills; a kill with the
        // glass still three-quarters full earns POISE Resonance (core/resonance.js scoreKill).

        const SPILL = {
            JOLT: 8.5,          // px/tick her step changes in a tick before it slops (a stop is 5.2, a hard turn past ~110°, a reversal 10.4)
            JOLT_COST: 0.025,   // of a full glass, at the threshold; up to twice that for a full reversal
            FLIT_COST: 0.035,
            HIT_COST: 0.02,     // + per point of damage (HIT_PER), capped at HIT_MAX
            HIT_PER: 0.0012,
            HIT_MAX: 0.07,
            COOLDOWN: 0.35,     // s between spills
            MAX: 36,            // puddles on a map at once (the oldest dry first)
            LIFE: 75,           // s a puddle lasts…
            FADE: 20,           // …the last of them drying
            MERGE: 0.8,         // a spill landing inside a fresh puddle of the same drink feeds it instead
            SLIP_SECS: 0.4,     // Frame: Grounded — a ganger who steps in one slips (+0.2 s a rank)…
            SLIP_AGAIN: 3,      // …and keeps their footing a while after
            SLIP_SKID: 2.5
        };

        engineMixin({
            /** The drink in her hand, or null (no glass, in a car, hidden) */
            heldDrink() {
                const C = this.cosmetics, acc = C && C.equippedAccessory ? COSMETICS_REGISTRY[C.equippedAccessory] : null;
                if (!acc || acc.data.held !== 'glass' || this.isDriving || !this.player || !this.player.visible) return null;
                return GLASS_DRINKS[C.getAccessoryOption(acc.id, 'drink')] || GLASS_DRINKS.champagne;
            },

            /** Once a sim tick, after her step: a sharp change of direction slops the glass */
            updateSpills() {
                const pl = this.player; if (!pl) return;
                const sp = pl.getCurrentSpeed() * (pl.moveMul ?? 1) * (this.sneaking ? SNEAK.SPEED : 1) * this.wadeMul(pl);
                const ux = (pl.velX || 0) * sp, uy = (pl.velY || 0) * sp;
                const prev = this._spillStep;
                this._spillStep = { x: ux, y: uy, tick: _simTick };
                if (!prev || _simTick - prev.tick > 1) return;
                const jolt = Math.hypot(ux - prev.x, uy - prev.y);
                if (jolt < SPILL.JOLT) return;
                const pm = Math.hypot(prev.x, prev.y) || 1;
                // The drink keeps going the way she was going
                this.spillDrink(SPILL.JOLT_COST * Math.min(2, 1 + (jolt - SPILL.JOLT) / 2), prev.x / pm, prev.y / pm);
            },

            /** She took a hit: the harder, the more goes over (knockback, if any, sets the way it flies) */
            spillOnHit(amount, kx = 0, ky = 0) {
                if (!(amount > 0)) return;
                const k = Math.hypot(kx, ky), a = k > 0.01 ? Math.atan2(ky, kx) : Math.random() * Math.PI * 2;
                this.spillDrink(Math.min(SPILL.HIT_MAX, SPILL.HIT_COST + amount * SPILL.HIT_PER + k * 0.004), Math.cos(a), Math.sin(a));
            },

            /** Slop `amount` of a full glass the way (dx, dy), from where she stood (or (x, y)). Returns what went over. */
            spillDrink(amount, dx, dy, x, y) {
                const D = this.heldDrink(), C = this.cosmetics;
                if (!D || !(C.drinkLevel > 0)) return 0;
                const now = _gameTimeSec;
                if (now - (this._lastSpillAt ?? -1e9) < SPILL.COOLDOWN) return 0;
                this._lastSpillAt = now;
                const lost = Math.min(C.drinkLevel, this.resonance ? this.resonance.stat('spill', amount) : amount);   // Arms: Steady
                C.drinkLevel = Math.max(0, C.drinkLevel - lost);
                const ox = (x ?? this.player.x), oy = (y ?? this.player.y);
                const r = 4 + Math.sqrt(lost) * 34;                                // 2.5% ≈ 9 px, 7% ≈ 13 px
                const px = ox + dx * (10 + r * 0.6), py = oy + dy * (10 + r * 0.6);
                const spills = this.effects.of('spill');
                const merge = spills.find(s => s.color === D.liquid && now - s.born < SPILL.LIFE - SPILL.FADE && Math.hypot(s.x - px, s.y - py) < s.r * SPILL.MERGE);
                const drops = [];
                const n = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < n; i++) {
                    const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9, d = r * (1.1 + Math.random() * 1.3);
                    drops.push({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, r: 0.9 + Math.random() * 1.4 });
                }
                if (merge) {
                    merge.r = Math.min(30, Math.hypot(merge.r, r * 0.8)); merge.born = now; merge.drops.push(...drops.slice(0, 2));
                    merge.ox = ox; merge.oy = oy; merge.splash = now;
                } else {
                    this.effects.spawn('spill', { x: px, y: py, r, color: D.liquid, color2: D.liquid2 || null, glow: !!D.glow, born: now, splash: now, ox, oy,
                                  seed: Math.random() * 1000, a: Math.atan2(dy, dx), drops, map: this.activeMap ? this.activeMap.id : null }, SPILL.MAX);
                }
                return lost;
            },

            /** How wet (x, y) is with spilt drink: true inside a puddle that hasn't dried (footsteps splash) */
            _inSpill(x, y) {
                const S = this.effects.of('spill'); if (!S.length) return false;
                const now = _gameTimeSec;
                for (const s of S) if (now - s.born < SPILL.LIFE - SPILL.FADE * 0.5 && Math.hypot(x - s.x, y - s.y) < s.r * 0.9) return true;
                return false;
            },

            /** Once a sim tick: with Grounded, a ganger who steps in a spill loses their footing (Ganger.update skips while _staggerUntil) */
            updateSpillSlips() {
                if (!this.effects.of('spill').length || !this.resonance || !this.enemies) return;
                const secs = this.resonance.stat('slipSecs', SPILL.SLIP_SECS); if (!secs) return;
                const now = _gameTimeSec;
                for (const e of this.enemies) {
                    if (e.dead || !(e instanceof Ganger)) continue;
                    const px = e._slipPX ?? e.x, py = e._slipPY ?? e.y; e._slipPX = e.x; e._slipPY = e.y;
                    if (now < (e._staggerUntil || 0) + SPILL.SLIP_AGAIN || !this._inSpill(e.x, e.y)) continue;
                    e._staggerUntil = now + secs;
                    const m = Math.hypot(e.x - px, e.y - py);                   // they skid on the way they were going
                    if (m > 0.05) { e.knockbackVx += (e.x - px) / m * SPILL.SLIP_SKID; e.knockbackVy += (e.y - py) / m * SPILL.SLIP_SKID; }
                    this.effects.spawn('number', { target: null, x: e.x, y: e.y - 24, value: 0, text: 'SLIP!', color: '#f2d57e', t0: now, pop: now, drift: 0 });
                }
            },

            /** The bar cart: top the glass back up */
            refillGlass() {
                const D = this.heldDrink();
                if (!D) { showMessage(this.cosmetics.equippedAccessory ? 'NOTHING TO POUR INTO' : 'HOLD A GLASS TO POUR (NEU.ME)'); audioSys.sfx('ui'); return false; }
                if (this.cosmetics.drinkLevel >= 0.999) { showMessage(`${D.name.toUpperCase()}: ALREADY FULL`); return false; }
                this.cosmetics.drinkLevel = 1;
                showMessage(`${D.name.toUpperCase()}: TOPPED UP`);
                audioSys.sfx('ui');
                return true;
            },
        });
