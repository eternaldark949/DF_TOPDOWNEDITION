        // GameEngine — boss hazards: what the bosses leave on the floor and throw at her. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // One list (`_hazards`), stepped each tick (updateBossHazards, from update.js) and drawn above the
        // darkness (drawBossHazards, from draw.js) so they read in a dark palace. Every one telegraphs:
        //   sigil   Lilitu's Ember Sigil: a ring where she last heard 949; after ARM s it bursts into fire
        //   fire    a burning patch (a sigil's aftermath, a censer): standing in it sets her burning
        //   smoke   a censer's incense: a thick cloud the wardens can't see through either (smokeBlocks)
        //   censer  Vesper's thurible in flight, its landing ring on the floor; lands as fire + smoke
        //   hymn    Matins' pulse: a ring through walls; caught by it (no flit) she's hurt and revealed
        //   hook    Compline's chain: flies past cover (not walls); it catches her and drags her out
        //   rite    Lilitu's Infernal Rite: the edges burn and the safe circle shrinks for RITE_SECS
        //   flare   a red flare (Shadow Step's tell), gale (Wing Gale's cone): looks only
        // She burns (`_playerBurn`, burnPlayer) for a few seconds after fire touches her; a flit puts it out.
        // The duel's dimming (`_duelDimK`) lives here too: the palace darkens while Lilitu hunts alone.

        const HAZARD = GAME_DB.enemies.hazards;   // directory/game-db/enemies.json

        engineMixin({
            bossHazards() { return this._hazards || (this._hazards = []); },

            /** Lay a hazard (see the list above); returns it */
            addHazard(h) {
                h.t0 = _gameTimeSec; h.mapId = this.activeMap && this.activeMap.id;
                const L = this.bossHazards(); L.push(h); if (L.length > 60) L.shift();
                return h;
            },

            /** Clear every hazard (or only an owner's) — a boss falls, the map changes */
            clearHazards(owner) {
                if (!this._hazards) return;
                this._hazards = owner ? this._hazards.filter(h => h.owner !== owner) : [];
                if (!owner) { this._playerBurn = null; this._hooked = null; }
            },

            /** Flitting: out of reach of every hazard */
            playerDodging() { return !!(this.player && this.player.flitting); },

            /** A boss move lands on her (unless she's mid-flit); true if it did */
            hurtPlayer(amount) {
                if (this.playerDodging() || !this.player || this.player.dead || this.isDriving) return false;
                this.damagePlayer(Math.round(amount));
                return true;
            },

            /** Set her burning for `secs` at `dps` (fresh fire refreshes it) */
            burnPlayer(dps, secs) {
                if (this.playerDodging()) return;
                const now = _gameTimeSec, B = this._playerBurn;
                if (B && now < B.until) { B.until = Math.max(B.until, now + secs); B.dps = Math.max(B.dps, dps); }
                else this._playerBurn = { dps, until: now + secs, next: now + HAZARD.BURN_TICK };
            },

            /** Push her (dx, dy), stopping at the first unwalkable step or wall */
            shovePlayer(dx, dy) {
                const p = this.player, map = this.activeMap; if (!p || !map) return;
                const nav = NavGrid.for(map), d = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(d / 6));
                for (let i = 0; i < n; i++) {
                    const nx = p.x + dx / n, ny = p.y + dy / n;
                    if (nav && !nav.walkable(nx, ny)) break;
                    if (collisionWorld.lineBlocked(p.x, p.y, nx, ny, map.walls, [])) break;
                    p.x = nx; p.y = ny;
                }
            },

            /** Does a censer's smoke cut the line (x0, y0)–(x1, y1)? */
            smokeBlocks(x0, y0, x1, y1) {
                if (!this._hazards) return false;
                for (const h of this._hazards) {
                    if (h.kind !== 'smoke') continue;
                    const r = h.r * this._smokeK(h);
                    if (r > 20 && shapeKit.segmentDistanceSq(h.x, h.y, x0, y0, x1, y1) < (r * 0.7) ** 2) return true;
                }
                return false;
            },

            _smokeK(h) {
                const age = _gameTimeSec - h.t0;
                return Math.min(1, age / 0.5) * Math.min(1, (h.until - _gameTimeSec) / 1.2);
            },

            /** One tick: every hazard does its work; her burn ticks; the duel's dimming eases */
            updateBossHazards() {
                const now = _gameTimeSec, p = this.player, mapId = this.activeMap && this.activeMap.id;
                const duel = (this.enemies || []).some(e => e.solo && !e.dead && !e.dormant);
                this._duelDimK = (this._duelDimK || 0) + ((duel ? 1 : 0) - (this._duelDimK || 0)) * 0.03;
                if (!this._hazards && !this._playerBurn && !this._hooked) return;
                if (this._hazards) this._hazards = this._hazards.filter(h => h.mapId === mapId && !h.done);
                const L = this._hazards || [];
                const inside = (x, y, r) => p && Math.hypot(p.x - x, p.y - y) < r;
                for (const h of L) {
                    const age = now - h.t0;
                    switch (h.kind) {
                        case 'sigil':
                            if (age >= HAZARD.SIGIL_ARM) {
                                h.done = true;
                                if (inside(h.x, h.y, h.r) && this.hurtPlayer(HAZARD.SIGIL_HIT)) this.burnPlayer(6, 2);
                                this.addHazard({ kind: 'fire', x: h.x, y: h.y, r: h.r * 0.8, until: now + HAZARD.FIRE_SECS, dps: 8, owner: h.owner });
                                if (this.weather) this.weather.spawnExplosion(h.x, h.y, '#ff5a1a', 6, 1.6);
                                this.triggerShake(3);
                            }
                            break;
                        case 'fire':
                            if (now > h.until) h.done = true;
                            else if (inside(h.x, h.y, h.r)) this.burnPlayer(h.dps || 8, 1.2);
                            break;
                        case 'smoke':
                            if (now > h.until) h.done = true;
                            break;
                        case 'censer':
                            if (age >= h.flight) {
                                h.done = true;
                                if (inside(h.x1, h.y1, HAZARD.CENSER_FIRE_R)) this.hurtPlayer(HAZARD.CENSER_HIT);
                                this.addHazard({ kind: 'fire', x: h.x1, y: h.y1, r: HAZARD.CENSER_FIRE_R, until: now + HAZARD.CENSER_FIRE_SECS, dps: 9, owner: h.owner, censer: true });
                                this.addHazard({ kind: 'smoke', x: h.x1, y: h.y1, r: HAZARD.CENSER_SMOKE_R, until: now + HAZARD.CENSER_SMOKE_SECS, owner: h.owner, seed: Math.random() * 100 });
                                if (this.weather) this.weather.spawnExplosion(h.x1, h.y1, '#ffaa33', 5, 1.4);
                                this.triggerShake(4); audioSys.sfx('explode');
                            }
                            break;
                        case 'hymn': {
                            const r = HAZARD.HYMN_RANGE * Math.min(1, age / HAZARD.HYMN_SECS);
                            if (age > HAZARD.HYMN_SECS + 0.25) h.done = true;
                            if (!h.hit && p && Math.abs(Math.hypot(p.x - h.x, p.y - h.y) - r) < 22) {
                                h.hit = true;
                                if (this.hurtPlayer(HAZARD.HYMN_HIT)) {
                                    this._revealedUntil = now + HAZARD.REVEAL_SECS;
                                    showMessage('MATINS SINGS — YOU ARE REVEALED');
                                }
                            }
                            break;
                        }
                        case 'hook': {
                            if (h.state === 'out') {
                                const nx = h.x + Math.cos(h.a) * HAZARD.HOOK_SPEED, ny = h.y + Math.sin(h.a) * HAZARD.HOOK_SPEED;
                                const wall = collisionWorld.lineBlocked(h.x, h.y, nx, ny, this.activeMap.walls, []);
                                h.x = nx; h.y = ny;
                                if (p && Math.hypot(p.x - h.x, p.y - h.y) < 20 && !this.playerDodging()) {
                                    h.state = 'caught'; h.caughtAt = now;
                                    this.hurtPlayer(HAZARD.HOOK_HIT);
                                    this._hooked = { owner: h.owner, until: now + HAZARD.HOOK_PULL_SECS, hook: h };
                                    showMessage('COMPLINE HOOKS YOU');
                                    this.triggerShake(6);
                                } else if (wall || Math.hypot(h.x - h.x0, h.y - h.y0) > HAZARD.HOOK_RANGE) h.state = 'back';
                            } else if (h.state === 'caught') {
                                if (p) { h.x = p.x; h.y = p.y; }
                                if (!this._hooked || this._hooked.hook !== h) h.state = 'back';
                            } else {
                                const o = h.owner, dx = (o ? o.x : h.x0) - h.x, dy = (o ? o.y : h.y0) - h.y, d = Math.hypot(dx, dy);
                                if (d < 24 || !o || o.dead) h.done = true;
                                else { h.x += dx / d * 22; h.y += dy / d * 22; }
                            }
                            break;
                        }
                        case 'rite': {
                            if (age > h.dur) { h.done = true; break; }
                            const k = Math.min(1, Math.max(0, (age - HAZARD.RITE_WARN) / (h.dur - HAZARD.RITE_WARN)));
                            h.r = h.r0 + (h.r1 - h.r0) * k;
                            if (age > HAZARD.RITE_WARN && p && !inside(h.x, h.y, h.r)) this.burnPlayer(HAZARD.RITE_DPS, 0.8);
                            break;
                        }
                        default:
                            if (age > (h.dur || 0.5)) h.done = true;
                    }
                }
                // Hooked: dragged toward Compline until close, or a flit breaks the chain
                const H = this._hooked;
                if (H) {
                    const o = H.owner;
                    if (!o || o.dead || now > H.until || this.playerDodging() || !p) this._hooked = null;
                    else {
                        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
                        if (d < HAZARD.HOOK_STOP) this._hooked = null;
                        else this.shovePlayer(dx / d * HAZARD.HOOK_PULL, dy / d * HAZARD.HOOK_PULL);
                    }
                }
                // Burning: a tick every half second; a flit snuffs it
                const B = this._playerBurn;
                if (B) {
                    if (this.playerDodging() && now - B.next < 2) { this._playerBurn = null; }
                    else {
                        while (B && now >= B.next && B.next <= B.until) {
                            B.next += HAZARD.BURN_TICK;
                            this.hurtPlayer(B.dps * HAZARD.BURN_TICK);
                        }
                        if (now > B.until) this._playerBurn = null;
                    }
                }
            },

            /** Above the darkness: the duel's dimming, the elites' marks, every hazard, then her flames if she burns */
            drawBossHazards(ctx, view) {
                const dim = this._duelDimK || 0;
                if (dim > 0.01 && view) {
                    ctx.save(); ctx.fillStyle = `rgba(6,0,2,${0.42 * dim})`;
                    ctx.fillRect(view.left - 50, view.top - 50, view.right - view.left + 100, view.bottom - view.top + 100);
                    ctx.restore();
                }
                for (const e of this.enemies || []) {                                   // the elites' marks (entities/enemies.js)
                    if (!e.elite || e.dead || !view || e.x < view.left - 40 || e.x > view.right + 40 || e.y < view.top - 40 || e.y > view.bottom + 40) continue;
                    drawEliteMark(ctx, e);
                }
                for (const e of this.enemies || []) {
                    if (e.solo && e.drawDuelTells) e.drawDuelTells(ctx);              // Lilitu's tells (entities/hunters.js)
                    else if (e instanceof Drone || e instanceof Marionette) e.drawLights(ctx);   // a drone's eye, lances, tells (entities/drones.js); a marionette's blades (entities/marionettes.js)
                }
                DFNative.bossEffectAppearance.draw.call(this,ctx);
            },

            /** Lilitu falls in her duel: a second Dark Element; the first time, the Golden Retribution schematic */
            lilituDuelWon(her) {
                const qs = this.questState || (this.questState = {}), first = !qs.lilituSoloWins;
                qs.lilituSoloWins = (qs.lilituSoloWins || 0) + 1;
                this.loot.push(new Loot(her.x - 14, her.y + 8, 'dark_element'));
                const g = this.hordeGauntlet;
                if (g) g.spoil('Dark Element');
                if (first) {
                    qs.goldenRetributionUnlocked = true;                 // the workbench's schematic (story/missions.js SCHEMATICS)
                    if (g) g.spoil('Golden Retribution schematic');
                    game_timers.after(2.2, () => showMessage('SCHEMATIC UNLOCKED — GOLDEN RETRIBUTION'), 'world');
                }
            },

            /** The last of the Triumvirate falls: the first time, Compline leaves the Blood Pact (if she hasn't one) */
            triumvirateFallen(last) {
                if (this._triFallTick === _simTick) return;           // (two falling in the same tick: one defeat)
                this._triFallTick = _simTick;
                const qs = this.questState || (this.questState = {}), first = !qs.triumvirateDefeats;
                qs.triumvirateDefeats = (qs.triumvirateDefeats || 0) + 1;
                if (first && !this.items.listItems().some(i => i.id === 'blood_pact') && this.dropBossWeapon('blood_pact', last.x, last.y + 8)) {
                    game_timers.after(1.6, () => showMessage('COMPLINE LEAVES THE BLOOD PACT'), 'world');
                    if (this.hordeGauntlet) this.hordeGauntlet.spoil('Blood Pact');
                }
            },

            /** A boss's weapon on the floor where it fell, glowing gold (picked up like any weapon drop) */
            dropBossWeapon(id, x, y) {
                const item = this.items.createItem(id); if (!item) return null;
                const drop = { x, y, type: 'weapon_drop', item, angle: 0.6, dropTime: 0,
                    draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.save(); ctx.translate(0, 10); ctx.scale(1, 0.36); ctx.globalAlpha = 0.75; drawGlow(ctx, 0, 0, 22, '#ffd76a', 0.3); ctx.restore(); drawWeapon(ctx, this.item.definition_id, 0, Math.sin(_frameTime / 500) * 3, this.angle, 0.9); ctx.restore(); } };
                this.loot.push(drop);
                return drop;
            }
        });
