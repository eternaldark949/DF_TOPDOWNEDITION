        // GameEngine — Combat feedback: what a hit looks like. Every hit that lands
        // (ActorEntity.takeDamage) comes through onActorHit: a floating damage number,
        // the target's health bar, blood in the character's own colour, and a flinch.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).

        /* Blood kinds. A character can name one (or a '#hex') as `blood` on the entity or
           in its look; otherwise it's worked out from what they are:
             red      people
             ink      the club's demonesses (the red demon dancers) — near-black, violet sheen
             coolant  androids: sparks and a pale glowing fluid in their finish's tint
             oil      drones and gunner rigs: dark sparks, no blood */
        const BLOOD_KINDS = {
            red:  { drop: '150, 10, 14', decal: '110, 6, 8' },
            ink:  { drop: '40, 18, 58',  decal: '11, 6, 16', sheen: '120, 70, 170' },
            oil:  { drop: '40, 40, 40',  decal: '18, 18, 18', sparks: true },
            // Stella (949): deep wine — Dr. Yin keeps her running, and she isn't quite human
            wine: { drop: '112, 16, 38', decal: '70, 10, 26', sheen: '150, 40, 70' },
        };
        const COOLANT_TINTS = { silver: '170, 220, 255', gold: '255, 196, 96', bloodmoon: '255, 110, 150' };

        /** Blood for an actor: { drop, decal, sheen?, sparks? } in "r, g, b", or null for none. */
        function bloodOf(a) {
            const look = (a._staffLook ? a._staffLook() : a._look) || a.look || null;   // staff looks resolve on first use
            const named = a.blood || (look && look.blood);
            if (named === 'none') return null;
            if (typeof named === 'string' && named[0] === '#') {
                const rgb = hexToRgb(named);
                return { drop: rgb, decal: darkenHex(named, 40).match(/\d+/g).join(', ') };
            }
            if (named === 'coolant' || (look && look.body && look.body.kind === 'android')) {
                const t = COOLANT_TINTS[(look && look.body && look.body.finish)] || COOLANT_TINTS.silver;
                return { drop: t, decal: t, sparks: true, glow: true };
            }
            if (BLOOD_KINDS[named]) return BLOOD_KINDS[named];
            if (typeof PlayerEntity !== 'undefined' && a instanceof PlayerEntity) return BLOOD_KINDS.wine;
            if ((typeof Drone !== 'undefined' && a instanceof Drone) || (typeof GatlingGunner !== 'undefined' && a instanceof GatlingGunner)) return BLOOD_KINDS.oil;
            if (a.role === 'red_demon_dancer' || (a.role === 'dancer' && a.gender !== 'male')) return BLOOD_KINDS.ink;
            return BLOOD_KINDS.red;
        }

        engineMixin({
            /** Resonance for a kill: base by toughness × style (core/resonance.js), shown as a violet tag. */
            awardKill(enemy) {
                if (!this.resonance) return;
                const by = enemy.lastHitBy;
                const byPlayer = by === this.player, byTeammate = !!(by && by.role === 'teammate');
                const { amount, tags } = this.resonance.scoreKill(enemy, {
                    byPlayer, byTeammate, melee: !!enemy.lastHitMelee, now: _gameTimeSec,
                    lastFlitAt: this.flitState.lastFlitAt ?? -99, lastHurtAt: this.lastHurtAt ?? -99 });
                if (amount > 0) this.earnResonance(amount, tags.join(' '), enemy.x, enemy.y - 26);
                // Dark Element: rare shards from the toughest foes
                const tough = (typeof GatlingGunner !== 'undefined' && enemy instanceof GatlingGunner) ? 0.25 : (enemy._restrictedZoneId ? 0.04 : 0);
                if (tough && Math.random() < tough) this.loot.push(new Loot(enemy.x + 12, enemy.y, 'dark_element'));
            },

            /** Add unsettled Resonance with a violet floating tag (at x,y, or above 949). */
            earnResonance(amount, label, x, y) {
                if (!this.resonance || !(amount > 0)) return;
                this.resonance.earn(amount);
                const texts = this.floatingTexts || (this.floatingTexts = []);
                texts.push({ target: null, x: x ?? this.player.x, y: y ?? this.player.y - 30, value: 0, text: `+${Math.round(amount)} ◈${label ? ' ' + label : ''}`,
                             color: '#c9a6ff', t0: _gameTimeSec, pop: _gameTimeSec, drift: 0, big: true });
                this._resPulse = _gameTimeSec;
                if (this.updateUI) this.updateUI();
            },

            /** A hit landed on `actor` (HP already reduced). kbX/kbY = knockback, used as the hit direction. */
            onActorHit(actor, amount, kbX = 0, kbY = 0) {
                if (!(amount > 0) || !actor) return;
                const now = _gameTimeSec;
                const dir = (kbX || kbY) ? Math.atan2(kbY, kbX) : Math.random() * Math.PI * 2;

                // Damage number — hits on the same target within 0.15 s add up into one
                const texts = this.floatingTexts || (this.floatingTexts = []);
                const recent = texts.find(t => t.target === actor && now - t.t0 < 0.15);
                if (recent) { recent.value += amount; recent.t0 = now; recent.pop = now; }
                else {
                    const color = actor === this.player ? '#ff5a6a' : (actor.role === 'teammate' ? '#ffb347' : '#ffffff');
                    texts.push({ target: actor, x: actor.x, y: actor.y - 16, value: amount, color, t0: now, pop: now, drift: Math.random() - 0.5 });
                    if (texts.length > 40) texts.shift();
                }

                actor._hpShowT = now;                                        // show their health bar for a while
                actor._hitT = now; actor._hitDir = dir;                      // the humanoid flinches away from the hit

                // Blood in the character's own colour, sprayed along the hit
                const B = bloodOf(actor);
                if (B && this.weather) {
                    const count = Math.max(4, Math.min(14, Math.round(4 + amount / 4)));
                    this.weather.spawnSpray(actor.x, actor.y, dir, `rgba(${B.drop}, 1)`, count);
                    if (B.sheen) this.weather.spawnSpray(actor.x, actor.y, dir, `rgba(${B.sheen}, 0.5)`, 3);
                    if (B.sparks) this.weather.spawnSparks(actor.x, actor.y, B.glow ? 5 : 8);
                }
                if (B && this.decals) {
                    const d = 6 + Math.random() * 6;
                    this.decals.addDecal('blood', actor.x + Math.cos(dir) * d, actor.y + Math.sin(dir) * d,
                        { size: 2.5 + Math.min(4, amount / 10), color: B.decal, dir, glow: B.glow });
                }
            },

            /** Health bars for recently hit enemies, then the floating damage numbers. World space. */
            drawCombatOverlays(ctx, cull) {
                const now = _gameTimeSec;
                const inView = (x, y) => !cull || (x > cull.left - 40 && x < cull.right + 40 && y > cull.top - 40 && y < cull.bottom + 40);
                // Bars: appear on the first hit, fade 3 s after the last
                for (const e of this.enemies || []) {
                    if (!e._hpShowT || e.dead || !(e.maxHp < 5000) || !inView(e.x, e.y)) continue;
                    const age = now - e._hpShowT;
                    if (age > 3) continue;
                    ctx.globalAlpha = age < 2.4 ? 1 : (3 - age) / 0.6;
                    drawHPBar(ctx, e.x - 14, e.y - 30, 28, 3.5, Math.max(0, e.hp / e.maxHp));
                }
                ctx.globalAlpha = 1;
                // Numbers: rise, drift, fade over 0.85 s; a merged hit pops a little bigger
                const texts = this.floatingTexts;
                if (!texts || !texts.length) return;
                ctx.save();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
                for (let i = texts.length - 1; i >= 0; i--) {
                    const t = texts[i], age = now - t.t0;
                    const life = t.big ? 1.6 : 0.85;
                    if (age > life || age < -1) { texts.splice(i, 1); continue; }
                    if (t.target && !t.target.dead) { t.x = t.target.x; t.y = t.target.y - 16; }
                    const x = t.x + t.drift * age * 14, y = t.y - age * 30;
                    if (!inView(x, y)) continue;
                    const pop = Math.max(0, 1 - (now - t.pop) / 0.12);
                    ctx.globalAlpha = 1 - Math.pow(age / life, 2);
                    ctx.font = `bold ${Math.round((t.big ? 10 : 11) + pop * 4 + Math.min(5, t.value / 20))}px Orbitron, sans-serif`;
                    const s = t.text || String(Math.round(t.value));
                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(s, x, y);
                    ctx.fillStyle = t.color; ctx.fillText(s, x, y);
                }
                ctx.restore();
            },
        });
