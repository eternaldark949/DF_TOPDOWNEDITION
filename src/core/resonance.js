        /* =====================================================================
           RESONANCE — 949's progression
           ---------------------------------------------------------------------
           Flitting is tuning your body's vibration to a dimension; fighting with
           style raises that resonance. What you earn in the field is UNSETTLED
           (the glowing meter) until Dr. Yin tunes it in at the medbay — only then
           does it become levels and Tuning points she can install. Die first and
           half of the unsettled Resonance scatters on the way back to her.

           Three trees of six nodes, three ranks each; a node opens once the one
           above it has a rank. The sixth nodes also require level 30.
           `stat(key, base)` gives any stat with the installed
           ranks applied — the game asks it wherever a number could be tuned.
           ===================================================================== */
        const RESONANCE = {
            CAP: 50,
            nextLevel: level => 120 + 70 * level,                 // Resonance from `level` to the next
            DEATH_LOSS: 0.5,
            RESPEC_COST: 200,
            POST_CAP_XP_PER_PP: 100,                            // Dr. Yin exchanges settled surplus; fractions carry forward
            // Kill awards: base by toughness, then style multipliers (they stack)
            BASE: { Ganger: 20, Drone: 30, GatlingGunner: 80 },
            USUAL_HP: { Ganger: 40, Drone: 60, GatlingGunner: 200 },
            FLIT_KILL: 1.5, PUNCH: 1.4, CHAIN_STEP: 0.25, CHAIN_MAX: 2, UNTOUCHED: 1.3,
            FLIT_WINDOW: 1.0, CHAIN_WINDOW: 2.5, UNTOUCHED_SECS: 20, TEAMMATE_SHARE: 0.3,
        };

        const RESONANCE_TREES = [
            { id: 'flit', name: 'Flit', color: '#b89cff', blurb: 'Tune the jump between dimensions.', nodes: [
                { id: 'reach',        name: 'Reach',        desc: r => `+${10 * r}% flit distance` },
                { id: 'quick_return', name: 'Quick Return', desc: r => `−${10 * r}% attunement per flit` },
                { id: 'flit_strike',  name: 'Flit-Strike',  desc: (r, R) => `Shots and blade hits within ${R ? R.stat('flitStrikeWindow', 1) : 1} s after a flit deal +${20 * r}%` },
                { id: 'afterimage',   name: 'Afterimage',   desc: r => `Your flit ghost draws gangers' eyes for ${(0.5 * r).toFixed(1)} s` },
                { id: 'double_step',  name: 'Double Step',  desc: r => `+${20 * r} max attunement${r >= 3 ? '; a second flit within 0.6 s costs half' : ''}` },
                { id: 'long_echo',    name: 'Long Echo',    unlockLevel: 30, desc: r => `Flit-Strike lasts ${(1 + 0.25 * r).toFixed(2)} s; its damage bonus stays the same` },
            ] },
            { id: 'frame', name: 'Frame', color: '#c4566e', blurb: 'What Dr. Yin builds into you.', nodes: [
                { id: 'reinforced',   name: 'Reinforced',   desc: r => `+${10 * r} max health` },
                { id: 'plating',      name: 'Plating',      desc: r => `−${6 * r}% damage taken` },
                { id: 'stim_potency', name: 'Stim Potency', desc: r => `Stims heal +${15 * r}` },
                { id: 'idle_mend',    name: 'Idle Mend',    desc: r => `Regen starts ${2 * r} s sooner, +${r} HP/s` },
                { id: 'last_stand',   name: 'Last Stand',   desc: r => `Survive a lethal hit at 1 HP (every ${[0, 120, 90, 60][r]} s)` },
                { id: 'grounded',     name: 'Grounded',     unlockLevel: 30, desc: r => `−${15 * r}% knockback from damage` },
            ] },
            { id: 'arms', name: 'Arms', color: '#e8c27a', blurb: 'Steadier hands, heavier hits.', nodes: [
                { id: 'steady',       name: 'Steady',       desc: r => `−${12 * r}% spread` },
                { id: 'quick_hands',  name: 'Quick Hands',  desc: r => `−${8 * r}% time between shots` },
                { id: 'hollow_points',name: 'Hollow Points',desc: r => `+${8 * r}% gun damage` },
                { id: 'heavy_hands',  name: 'Heavy Hands',  desc: r => `+${25 * r}% punch damage and knockback` },
                { id: 'quick_draw',   name: 'Quick-Draw',   desc: r => `First shot within 0.8 s of drawing: +${25 * r}%` },
                { id: 'low_signature',name: 'Low Signature',unlockLevel: 30, desc: r => `Gunshots carry ${10 * r}% less far to enemies` },
            ] },
        ];

        class ResonanceSystem {
            constructor() { this.reset(); }

            reset() {
                this.level = 0; this.xp = 0; this.unsettled = 0; this.points = 0;
                this.ranks = {}; this.lastStandReadyAt = 0; this.chain = { t: -99, n: 0 };
            }

            rank(id) { return this.ranks[id] || 0; }

            /** A stat with installed ranks applied. */
            stat(key, base) {
                const r = id => this.rank(id);
                switch (key) {
                    case 'flitDistance':   return base * (1 + 0.10 * r('reach'));
                    case 'flitCost':       return base * (1 - 0.10 * r('quick_return'));
                    case 'flitStrikeWindow': return base + 0.25 * r('long_echo');
                    case 'maxAttunement':  return base + 20 * r('double_step');
                    case 'maxHealth':      return base + 10 * r('reinforced');
                    case 'damageTaken':    return base * (1 - 0.06 * r('plating'));
                    case 'knockbackTaken': return base * (1 - 0.15 * r('grounded'));
                    case 'stimHeal':       return base + 15 * r('stim_potency');
                    case 'regenDelay':     return Math.max(60, base - 120 * r('idle_mend'));   // frames
                    case 'regenAmount':    return base + r('idle_mend');                        // HP per second
                    case 'spread':         return base * (1 - 0.12 * r('steady'));
                    case 'fireCooldown':   return base * (1 - 0.08 * r('quick_hands'));
                    case 'gunDamage':      return base * (1 + 0.08 * r('hollow_points'));
                    case 'gunNoise':       return base * (1 - 0.10 * r('low_signature'));
                    case 'punchDamage':    return base * (1 + 0.25 * r('heavy_hands'));
                    default: return base;
                }
            }

            /** Resonance to reach the next level from where you are (Infinity at the cap). */
            toNext() { return this.level >= RESONANCE.CAP ? Infinity : RESONANCE.nextLevel(this.level); }

            /** Add earned Resonance to the unsettled pool. */
            earn(amount) { if (amount > 0) this.unsettled += Math.round(amount); }

            /**
             * Resonance for a kill. `ctx`: { byPlayer, byTeammate, melee, now, lastFlitAt, lastHurtAt }.
             * Returns { amount, tags } (tags name the style bonuses that applied).
             */
            scoreKill(enemy, ctx) {
                const R = RESONANCE, name = enemy.constructor ? enemy.constructor.name : '';
                let base = R.BASE[name] || 15;
                const usual = R.USUAL_HP[name];
                if (usual && enemy.maxHp > usual) base *= Math.min(3, enemy.maxHp / usual);   // tougher waves pay more
                if (ctx.byTeammate) return { amount: Math.round(base * R.TEAMMATE_SHARE), tags: ['CREW'] };
                if (!ctx.byPlayer) return { amount: 0, tags: [] };
                let m = 1; const tags = [];
                if (ctx.now - ctx.lastFlitAt <= R.FLIT_WINDOW) { m *= R.FLIT_KILL; tags.push('FLIT-KILL'); }
                if (ctx.melee) { m *= R.PUNCH; tags.push('KNOCKOUT'); }
                if (ctx.now - this.chain.t <= R.CHAIN_WINDOW) this.chain.n++; else this.chain.n = 0;
                this.chain.t = ctx.now;
                if (this.chain.n > 0) { m *= Math.min(R.CHAIN_MAX, 1 + R.CHAIN_STEP * this.chain.n); tags.push('CHAIN ×' + (this.chain.n + 1)); }
                if (ctx.now - ctx.lastHurtAt >= R.UNTOUCHED_SECS) { m *= R.UNTOUCHED; tags.push('UNTOUCHED'); }
                return { amount: Math.round(base * m), tags };
            }

            /** Dr. Yin tunes the unsettled Resonance in. Returns how many levels were gained. */
            tune() {
                let gained = 0;
                this.xp += this.unsettled; this.unsettled = 0;
                while (this.level < RESONANCE.CAP && this.xp >= this.toNext()) {
                    this.xp -= this.toNext(); this.level++; this.points++; gained++;
                }
                return gained;
            }

            /** Exchange settled surplus only at the cap. The saved xp field retains the remainder. */
            cashOut() {
                if (this.level < RESONANCE.CAP) return 0;
                const pp = Math.floor(this.xp / RESONANCE.POST_CAP_XP_PER_PP);
                this.xp -= pp * RESONANCE.POST_CAP_XP_PER_PP;
                return pp;
            }

            /** Returning to Dr. Yin after dying: part of the unsettled Resonance scatters. Returns what was lost. */
            onDeath() {
                const lost = Math.floor(this.unsettled * RESONANCE.DEATH_LOSS);
                this.unsettled -= lost;
                return lost;
            }

            /** Can this node take another rank right now? */
            canRaise(treeId, nodeIndex) {
                const tree = RESONANCE_TREES.find(t => t.id === treeId);
                if (!tree || this.points < 1) return false;
                const node = tree.nodes[nodeIndex];
                if (!node || this.rank(node.id) >= 3 || this.level < (node.unlockLevel || 0)) return false;
                return nodeIndex === 0 || this.rank(tree.nodes[nodeIndex - 1].id) > 0;
            }

            raise(treeId, nodeIndex) {
                if (!this.canRaise(treeId, nodeIndex)) return false;
                const id = RESONANCE_TREES.find(t => t.id === treeId).nodes[nodeIndex].id;
                this.ranks[id] = this.rank(id) + 1; this.points--;
                return true;
            }

            /** Give back every installed rank as Tuning points. */
            respec() {
                let back = 0; for (const k in this.ranks) back += this.ranks[k];
                this.ranks = {}; this.points += back;
                return back;
            }

            /** Last Stand: if a hit would kill, and it's ready, survive it. */
            tryLastStand(now) {
                const r = this.rank('last_stand');
                if (!r || now < this.lastStandReadyAt) return false;
                this.lastStandReadyAt = now + [0, 120, 90, 60][r];
                return true;
            }

            serialize() {
                return { level: this.level, xp: this.xp, unsettled: this.unsettled, points: this.points, ranks: { ...this.ranks } };
            }

            deserialize(d) {
                this.reset();
                if (!d) return;
                this.level = Math.max(0, Math.min(RESONANCE.CAP, d.level | 0));
                this.xp = Number.isFinite(+d.xp) ? Math.max(0, Math.floor(+d.xp)) : 0;
                this.unsettled = Number.isFinite(+d.unsettled) ? Math.max(0, Math.floor(+d.unsettled)) : 0;
                this.points = d.points | 0;
                const known = new Set(RESONANCE_TREES.flatMap(t => t.nodes.map(n => n.id)));
                for (const [k, v] of Object.entries(d.ranks || {})) if (known.has(k)) this.ranks[k] = Math.max(0, Math.min(3, v | 0));
            }
        }
