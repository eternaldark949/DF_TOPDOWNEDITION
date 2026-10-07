        // GameEngine — Executions. Methods are added to GameEngine.prototype (see engineMixin in
        // game-engine.js).
        //
        // Come up behind someone who hasn't noticed her — slowly, out of the light — and an
        // "Execute" pill appears (fire or punch does it too, bare-handed or with a blade). She
        // steps in, the target freezes, and it's over: bare-handed a strike to the neck, with the
        // Maiden's Kukri a fast draw-cut in gold. The body falls forward. It's quiet, not silent
        // (CONFIG.NOISE.execute / executeBlade): anyone close enough hears it and comes to look,
        // so she has to choose her moment. Bosses can't be executed.

        engineMixin({
            /** The cue: a thin gold reticle under whoever she could take right now (world space, under the bodies) */
            drawExecuteCue(ctx) {
                const e = this._execTarget; if (!e || e.dead || this._exec) return;
                const t = _gameTimeSec, r = 15 + Math.sin(t * 6) * 1.2;
                ctx.save(); ctx.translate(e.x, e.y);
                ctx.strokeStyle = 'rgba(255, 215, 120, 0.85)'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.ellipse(0, 3, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.rotate(t * 0.8);
                for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(r + 2, 0); ctx.lineTo(r + 7, 0); ctx.stroke(); }
                ctx.restore();
            },

            /** Whoever she could execute right now (nearest), or null */
            executionTarget() {
                const pl = this.player;
                if (!pl || this.isDriving || this._exec || (this.scenes && this.scenes.running) || this.furniture && this.furniture.busy()) return null;
                const blade = this.weaponMode === 'melee';
                const reach = blade ? 66 : 56, walls = this.activeMap.walls, cols = getColliders(this.activeMap);
                // she has to come quietly: sneaking (engine/sneak.js), or creeping slowly out of the bright light
                const g = pl._gait, quiet = this.sneaking || ((g ? g.speed : 0) < 2.3 && (pl.visibility ?? 0) < 0.75);
                if (!quiet) return null;
                let best = null, bd = 1e9;
                for (const e of this.enemies) {
                    if (!e || e.dead || e.bossName || e._noExecute || typeof Ganger === 'undefined' || !(e instanceof Ganger)) continue;
                    const d = Math.hypot(e.x - pl.x, e.y - pl.y);
                    if (d > reach || d >= bd) continue;
                    // unaware of her: not in a fight, and not looking at her right now (idle, wary or searching elsewhere)
                    if (e.state === 'ALERT' || e.state === 'SUPPRESSING') continue;
                    if (e.canSeePoint && e.canSeePoint(pl.x, pl.y, walls, cols)) continue;
                    // she's at its back (within ±70° of straight behind)
                    const toHer = Math.atan2(pl.y - e.y, pl.x - e.x);
                    if (Math.abs(normalizeAngle(toHer - e.angle)) < Math.PI - 1.22) continue;
                    if (isLineBlocked(pl.x, pl.y, e.x, e.y, walls, cols)) continue;
                    best = e; bd = d;
                }
                return best;
            },

            /** Begin an execution on this target */
            execute(e) {
                if (!e || e.dead || this._exec) return;
                const pl = this.player, blade = this.weaponMode === 'melee';
                // she steps in to its back
                const bx = e.x - Math.cos(e.angle) * (blade ? 30 : 24), by = e.y - Math.sin(e.angle) * (blade ? 30 : 24);
                this._exec = { e, t0: _gameTimeSec, blade, from: { x: pl.x, y: pl.y }, to: { x: bx, y: by }, struck: false };
                e._execBy = pl;                                                     // frozen (Ganger.update)
                pl.angle = e.angle;
                if (!blade && this.weaponMode === 'none') this.shootCooldown = CONFIG.PUNCH.DURATION_TICKS;
                this.activeInteraction = null;
            },

            /** Once per tick: the step-in, the strike, the fall */
            updateExecution() {
                const X = this._exec; if (!X) return;
                const pl = this.player, e = X.e, t = _gameTimeSec - X.t0;
                if (!e || (e.dead && X.struck)) { if (t > 0.45) this._exec = null; return; }
                const k = Math.min(1, t / 0.14), ease = 1 - Math.pow(1 - k, 3);
                pl.x = X.from.x + (X.to.x - X.from.x) * ease; pl.y = X.from.y + (X.to.y - X.from.y) * ease;
                pl.angle = Math.atan2(e.y - pl.y, e.x - pl.x);
                if (!X.struck && t >= 0.16) {
                    X.struck = true;
                    if (X.blade) {                                                  // the draw-cut: a gold arc, a spray
                        this._slashT = _gameTimeSec; this._slashSide = -(this._slashSide || 1);
                        (this.slashes || (this.slashes = [])).push({ x: pl.x, y: pl.y, a: pl.angle, side: this._slashSide, t0: _gameTimeSec, reach: 30, arc: 1.6, hit: true });
                        if (typeof ambience !== 'undefined' && ambience.slash) ambience.slash(true);
                        const B = bloodOf(e);
                        if (B && this.weather) this.weather.spawnSpray(e.x, e.y, e.angle + Math.PI / 2, `rgba(${B.drop}, 1)`, 14);
                    } else if (typeof ambience !== 'undefined' && ambience.footstep) {
                        ambience.footstep('boots', 'carpet', { gain: 1, near: 1 });   // a dull blow
                    }
                    e.lastHitBy = pl; e.lastHitMelee = true; e._executed = true; e._execBy = null;
                    // it falls forward, the way it was facing
                    const killed = e.takeDamage(e.hp + 1, Math.cos(e.angle) * 5, Math.sin(e.angle) * 5, { type: X.blade ? 'melee' : 'blunt' }) && e.dead;
                    if (killed) {
                        const maxHP = this.maxPlayerHealth || pl.maxHp;
                        const healed = pl.heal(Math.min(maxHP * 0.15, Math.max(0, maxHP - pl.hp)));
                        if (healed > 0) {
                            const bar = this.healthBar && this.healthBar.parentElement;
                            if (bar) {
                                bar.classList.remove('execution-heal'); void bar.offsetWidth;
                                bar.classList.add('execution-heal');
                                this.cancelPausableTimeout(this._executionHealPulse);
                                this._executionHealPulse = this.addPausableTimeout(() => bar.classList.remove('execution-heal'), 600);
                            }
                        }
                    }
                    this.emitNoise(e.x, e.y, X.blade ? CONFIG.NOISE.executeBlade : CONFIG.NOISE.execute, 'execute');
                    if (this.resonance && this.earnResonance) this.earnResonance(15, 'EXECUTION', e.x, e.y - 40);
                    this.triggerShake(3);
                }
                if (t > 0.45) this._exec = null;
            }
        });
