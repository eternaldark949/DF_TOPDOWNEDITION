        // GameEngine — Spills. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Her glass (the Crystal Glass, the Mirrored Glass) holds a pour: cosmetics.drinkLevel, 1 full, 0 dry.
        // A hard turn or a reversal, a Flit, a hit: it slops over the rim, a little each time, and lands as a
        // puddle the colour of the drink (red wine pools dark, champagne gold) with a few drops thrown ahead.
        // The puddles splash underfoot like rain water (engine/footsteps.js), so a trail of rosé gives a
        // sneak away, then dry out. The bar cart at home tops the glass back up (refillGlass).

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
            MERGE: 0.8          // a spill landing inside a fresh puddle of the same drink feeds it instead
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
                const sp = pl.getCurrentSpeed() * (pl.moveMul ?? 1) * (this.sneaking ? SNEAK.SPEED : 1);
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
                const lost = Math.min(C.drinkLevel, amount);
                C.drinkLevel = Math.max(0, C.drinkLevel - lost);
                const ox = (x ?? this.player.x), oy = (y ?? this.player.y);
                const r = 4 + Math.sqrt(lost) * 34;                                // 2.5% ≈ 9 px, 7% ≈ 13 px
                const px = ox + dx * (10 + r * 0.6), py = oy + dy * (10 + r * 0.6);
                const spills = this.spills || (this.spills = []);
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
                    if (spills.length >= SPILL.MAX) spills.shift();
                    spills.push({ x: px, y: py, r, color: D.liquid, color2: D.liquid2 || null, glow: !!D.glow, born: now, splash: now, ox, oy,
                                  seed: Math.random() * 1000, a: Math.atan2(dy, dx), drops, map: this.activeMap ? this.activeMap.id : null });
                }
                return lost;
            },

            /** How wet (x, y) is with spilt drink: true inside a puddle that hasn't dried (footsteps splash) */
            _inSpill(x, y) {
                if (!this.spills || !this.spills.length) return false;
                const now = _gameTimeSec;
                for (const s of this.spills) if (now - s.born < SPILL.LIFE - SPILL.FADE * 0.5 && Math.hypot(x - s.x, y - s.y) < s.r * 0.9) return true;
                return false;
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

            /** The puddles, on the floor under everyone (after the decals) */
            drawSpills(ctx, cb) {
                const S = this.spills; if (!S || !S.length) return;
                const now = _gameTimeSec, TAU = Math.PI * 2, mapId = this.activeMap ? this.activeMap.id : null;
                for (let i = S.length - 1; i >= 0; i--) {
                    const s = S[i], age = now - s.born;
                    if (age > SPILL.LIFE || s.map !== mapId) { S.splice(i, 1); continue; }
                    if (cb && (s.x + 40 < cb.left || s.x - 40 > cb.right || s.y + 40 < cb.top || s.y - 40 > cb.bottom)) continue;
                    const dry = age > SPILL.LIFE - SPILL.FADE ? 1 - (age - (SPILL.LIFE - SPILL.FADE)) / SPILL.FADE : 1;
                    const fly = Math.min(1, (now - s.splash) / 0.2);                // the splash: the drink flies out, then lands
                    const grow = Math.min(1, (now - s.splash) / 0.3), ease = 1 - (1 - grow) * (1 - grow);
                    const r = s.r * (0.35 + 0.65 * ease) * (0.75 + 0.25 * dry);  // and shrinks a little as it dries
                    const rgb = hexToRgb(s.color);
                    ctx.save();
                    ctx.globalAlpha = 0.6 * dry;
                    // The pool: thrown out along the way it flew, a few lobes from its seed so no two are the same shape
                    ctx.fillStyle = `rgb(${rgb})`;
                    if (s.glow) { ctx.shadowColor = s.color; ctx.shadowBlur = 8; }
                    ctx.beginPath();
                    ctx.ellipse(s.x, s.y, r, r * 0.62, s.a || 0, 0, TAU);
                    for (let k = 0; k < 4; k++) {
                        const a = (s.a || 0) + (k - 1.5) * 1.1 + Math.sin(s.seed + k) * 0.4, d = r * (0.5 + ((s.seed * (k + 3)) % 1) * 0.25);
                        const lr = r * (0.22 + ((s.seed * (k + 7)) % 1) * 0.18), cx = s.x + Math.cos(a) * d, cy = s.y + Math.sin(a) * d * 0.7;
                        ctx.moveTo(cx + lr, cy); ctx.arc(cx, cy, lr, 0, TAU);
                    }
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 0.3 * dry; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8;   // the edge, darker where it's thin
                    ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.62, s.a || 0, 0, TAU); ctx.stroke();
                    ctx.shadowBlur = 0;
                    if (s.color2) {                                              // a layered cocktail keeps its second colour in the middle
                        ctx.globalAlpha = 0.5 * dry; ctx.fillStyle = s.color2;
                        ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.4, 0, TAU); ctx.fill();
                    }
                    // Sheen: the room's light caught on the wet surface
                    ctx.globalAlpha = 0.35 * dry; ctx.fillStyle = '#ffffff';
                    ctx.beginPath(); ctx.ellipse(s.x - r * 0.3, s.y - r * 0.2, r * 0.26, r * 0.09, -0.6, 0, TAU); ctx.fill();
                    // The drops thrown ahead (in flight for the first moment)
                    ctx.globalAlpha = 0.8 * dry; ctx.fillStyle = `rgb(${rgb})`;
                    for (const d of s.drops) {
                        const dx = s.ox + (d.x - s.ox) * fly, dy = s.oy + (d.y - s.oy) * fly;
                        ctx.beginPath(); ctx.arc(dx, dy, d.r * (fly < 1 ? 0.8 : 1), 0, TAU); ctx.fill();
                    }
                    ctx.restore();
                }
            }
        });
