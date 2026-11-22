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
        // The numbers live in directory/game-db/progression.json (GAME_DB.progression): the level rules, the trees
        // and every node's per-rank values. This file keeps the code: the level curve, each node's text and stat().
        const RESONANCE = Object.assign(GAME_DB.progression.resonance, {
            /** Resonance from `level` to the next */
            nextLevel: level => RESONANCE.level_cost.base + RESONANCE.level_cost.per_level * level,
        });

        /** A node's text on the tuning screen, at rank r (R: her ResonanceSystem, when there is one), built from its per_rank values */
        const _resPct = v => Math.round(v * 100);
        const RESONANCE_NODE_TEXT = {
            reach:         (r, R, v) => `+${_resPct(v.distance) * r}% flit distance`,
            quick_return:  (r, R, v) => `−${_resPct(v.cost) * r}% attunement per flit`,
            flit_strike:   (r, R, v) => `Shots and blade hits within ${R ? R.flitStrikeWindow() : v.window} s after a flit deal +${_resPct(v.damage) * r}%`,
            afterimage:    (r, R, v) => `Your flit ghost draws gangers' eyes for ${(v.secs * r).toFixed(1)} s`,
            double_step:   (r, R, v) => `+${v.attunement * r} max attunement${r >= v.half_cost_rank ? `; a second flit within ${v.half_cost_window} s costs half` : ''}`,
            long_echo:     (r, R, v) => `Flit-Strike lasts ${(resonanceNode('flit_strike').per_rank.window + v.window * r).toFixed(2)} s; its damage bonus stays the same`,
            reinforced:    (r, R, v) => `+${v.health * r} max health`,
            plating:       (r, R, v) => `−${_resPct(v.damage_taken) * r}% damage taken`,
            stim_potency:  (r, R, v) => `Stims heal +${v.heal * r}`,
            idle_mend:     (r, R, v) => `Regen starts ${v.delay_frames / 60 * r} s sooner, +${v.hp_per_sec * r} HP/s`,
            last_stand:    (r, R, v) => `Survive a lethal hit at 1 HP (every ${v.cooldown_secs[r]} s)`,
            grounded:      (r, R, v) => `−${_resPct(v.knockback) * r}% knockback from damage; gangers who step in your spills slip for ${(SPILL.SLIP_SECS + v.slip_secs * r).toFixed(1)} s`,
            steady:        (r, R, v) => `−${_resPct(v.spread) * r}% spread, −${_resPct(v.spill) * r}% drink spilt`,
            quick_hands:   (r, R, v) => `−${_resPct(v.cooldown) * r}% time between shots`,
            hollow_points: (r, R, v) => `+${_resPct(v.damage) * r}% gun damage`,
            heavy_hands:   (r, R, v) => `+${_resPct(v.damage) * r}% punch damage and knockback`,
            quick_draw:    (r, R, v) => `First shot within ${v.window} s of drawing: +${_resPct(v.damage) * r}%`,
            low_signature: (r, R, v) => `Gunshots carry ${_resPct(v.noise) * r}% less far to enemies`,
        };

        const RESONANCE_TREES = GAME_DB.progression.trees;
        for (const tree of RESONANCE_TREES) for (const node of tree.nodes) {
            const text = RESONANCE_NODE_TEXT[node.id];
            if (!text) throw new Error(`RESONANCE_TREES: node '${node.id}' has no text in RESONANCE_NODE_TEXT`);
            node.desc = (r, R) => text(r, R, node.per_rank);
        }
        /** A node by id, from any tree (undefined if there's none). */
        function resonanceNode(id) {
            for (const tree of RESONANCE_TREES) for (const node of tree.nodes) if (node.id === id) return node;
        }

        class ResonanceSystem {
            constructor() { this.reset(); }

            reset() {
                this.level = 0; this.xp = 0; this.unsettled = 0; this.points = 0;
                this.ranks = {}; this.lastStandReadyAt = 0; this.chain = { t: -99, n: 0 };
            }

            rank(id) { return this.ranks[id] || 0; }

            /** A node's per-rank value (progression.json), e.g. value('flit_strike', 'damage'). */
            value(id, key) { return resonanceNode(id).per_rank[key]; }

            /** How long after a flit Flit-Strike's bonus holds, in seconds. */
            flitStrikeWindow() { return this.stat('flitStrikeWindow', this.value('flit_strike', 'window')); }

            /** A stat with installed ranks applied. */
            stat(key, base) {
                const r = id => this.rank(id), v = (id, k) => this.value(id, k);
                switch (key) {
                    case 'flitDistance':   return base * (1 + v('reach', 'distance') * r('reach'));
                    case 'flitCost':       return base * (1 - v('quick_return', 'cost') * r('quick_return'));
                    case 'flitStrikeWindow': return base + v('long_echo', 'window') * r('long_echo');
                    case 'maxAttunement':  return base + v('double_step', 'attunement') * r('double_step');
                    case 'maxHealth':      return base + v('reinforced', 'health') * r('reinforced');
                    case 'damageTaken':    return base * (1 - v('plating', 'damage_taken') * r('plating'));
                    case 'knockbackTaken': return base * (1 - v('grounded', 'knockback') * r('grounded'));
                    case 'stimHeal':       return base + v('stim_potency', 'heal') * r('stim_potency');
                    case 'regenDelay':     return Math.max(v('idle_mend', 'min_delay_frames'), base - v('idle_mend', 'delay_frames') * r('idle_mend'));   // frames
                    case 'regenAmount':    return base + v('idle_mend', 'hp_per_sec') * r('idle_mend');                        // HP per second
                    case 'spread':         return base * (1 - v('steady', 'spread') * r('steady'));
                    case 'spill':          return base * (1 - v('steady', 'spill') * r('steady'));             // engine/spills.js
                    case 'slipSecs':       return r('grounded') ? base + v('grounded', 'slip_secs') * r('grounded') : 0;
                    case 'fireCooldown':   return base * (1 - v('quick_hands', 'cooldown') * r('quick_hands'));
                    case 'gunDamage':      return base * (1 + v('hollow_points', 'damage') * r('hollow_points'));
                    case 'gunNoise':       return base * (1 - v('low_signature', 'noise') * r('low_signature'));
                    case 'punchDamage':    return base * (1 + v('heavy_hands', 'damage') * r('heavy_hands'));
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
                if (ctx.drinkLevel >= R.POISE_LEVEL) { m *= R.POISE; tags.push('POISE'); }
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
                this.lastStandReadyAt = now + this.value('last_stand', 'cooldown_secs')[r];
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
