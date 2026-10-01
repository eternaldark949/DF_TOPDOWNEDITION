        // GameEngine — Resonance on screen: the HUD meter, Dr. Yin's tuning overlay, the
        // SKILLS screen, and applying installed ranks to 949's stats (see core/resonance.js).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /** Push installed ranks into the stats that aren't read on the fly: max health, max attunement. */
            applyResonanceStats() {
                if (!this.resonance) return;
                const maxHp = Math.round(this.resonance.stat('maxHealth', 100));
                const sl = this.player && this.player.buffSystem.active.stellarLemonade;   // Stellar Lemonade halves max HP while active
                if (sl && sl.active) { sl.savedMaxHp = maxHp; this.maxPlayerHealth = Math.floor(maxHp / 2); }
                else this.maxPlayerHealth = maxHp;
                this.playerHealth = Math.min(this.playerHealth, this.maxPlayerHealth);
                this.flitState.maxAttunement = this.resonance.stat('maxAttunement', 120);
                if (this.player) this.player.syncHealth(this.playerHealth, this.maxPlayerHealth);
            },

            /** HUD: level and how much unsettled Resonance you're carrying (it glows brighter the more). */
            updateResonanceHUD() {
                const el = this._uiRes || (this._uiRes = document.getElementById('ui-resonance'));
                if (!el || !this.resonance) return;
                const R = this.resonance;
                const de = this.darkElement > 0 ? ` <span style="color:#b98cff">◆ ${this.darkElement}</span>` : '';
                el.innerHTML = `<span style="color:#c9a6ff">◈ Lv ${R.level}</span>${R.unsettled > 0 ? ` · ${R.unsettled} unsettled` : ''}${de}`;
                const glow = Math.min(1, R.unsettled / Math.max(1, R.toNext() === Infinity ? 500 : R.toNext()));
                el.style.textShadow = `0 0 ${4 + glow * 10}px rgba(185, 140, 255, ${0.3 + glow * 0.6})`;
            },

            /** Dr. Yin offers a choice: tune Resonance or browse augments. */
            openDrYinMenu() {
                this.pauseSystem.acquire('tuning');
                const ov = document.getElementById('tuning-overlay');
                ov.style.display = 'block';
                const body = document.getElementById('tuning-body');
                const R = this.resonance;
                body.innerHTML = `
                    <div class="tun-quote">"Hold still, Stella. Let's see what the fighting did to you."</div>
                    <div class="tun-choice" data-act="tune"><b>TUNE RESONANCE</b><span>${R.unsettled > 0 ? R.unsettled + ' unsettled to settle' : 'Spend Tuning points, review your trees'}</span></div>
                    <div class="tun-choice" data-act="aug"><b>AUGMENTS</b><span>Browse and install augments</span></div>`;
                body.querySelector('[data-act="tune"]').onclick = () => this.openTuning();
                body.querySelector('[data-act="aug"]').onclick = () => { this.closeTuning(); this.openAugmentShop(); };
            },

            /** Tune the unsettled Resonance in, then show the trees. */
            openTuning() {
                const R = this.resonance;
                const before = R.level, carried = R.unsettled;
                const gained = R.tune();
                this.applyResonanceStats();
                this.updateUI();
                if (gained > 0) audioSys.sfx('ui');
                this._tuneReveal = carried > 0 ? { carried, gained, from: before } : null;
                this.renderTuning();
            },

            renderTuning() {
                const R = this.resonance, body = document.getElementById('tuning-body');
                const rv = this._tuneReveal;
                const next = R.toNext();
                const pct = next === Infinity ? 100 : Math.round(100 * R.xp / next);
                let html = `<div class="tun-head">
                        <div><span class="tun-lv">◈ LEVEL ${R.level}</span>${R.level >= RESONANCE.CAP ? ' <span class="tun-dim">(tuned to the limit)</span>' : ''}</div>
                        <div class="tun-bar"><div style="width:${pct}%"></div></div>
                        <div class="tun-dim">${next === Infinity ? '' : `${R.xp} / ${next} to the next level`} · <b style="color:#e8c27a">${R.points} Tuning point${R.points === 1 ? '' : 's'}</b></div>
                    </div>`;
                if (rv) html += `<div class="tun-quote">${rv.gained > 0
                        ? `"There. ${rv.carried} settled — you're ${rv.gained > 1 ? rv.gained + ' levels' : 'a level'} stronger. Choose where it goes."`
                        : R.level >= RESONANCE.CAP ? `"${rv.carried} settled. You're tuned as far as I can take you — for now."`
                        : `"${rv.carried} settled. Not enough to rise yet — keep moving, keep flitting."`}</div>`;
                html += `<div class="tun-trees">`;
                for (const tree of RESONANCE_TREES) {
                    html += `<div class="tun-tree" style="--c:${tree.color}"><div class="tun-tree-name">${tree.name.toUpperCase()}</div><div class="tun-dim">${tree.blurb}</div>`;
                    tree.nodes.forEach((n, i) => {
                        const r = R.rank(n.id), can = R.canRaise(tree.id, i), locked = i > 0 && R.rank(tree.nodes[i - 1].id) === 0;
                        const pips = [1, 2, 3].map(k => `<i class="${k <= r ? 'on' : ''}"></i>`).join('');
                        html += `<div class="tun-node${can ? ' can' : ''}${locked ? ' locked' : ''}" data-tree="${tree.id}" data-i="${i}">
                            <div class="tun-node-top"><b>${n.name}</b><span class="tun-pips">${pips}</span></div>
                            <div class="tun-dim">${n.desc(Math.max(1, Math.min(3, r + (r < 3 ? 1 : 0))))}${r > 0 && r < 3 ? ' <span class="tun-next">(next rank)</span>' : ''}</div></div>`;
                    });
                    html += `</div>`;
                }
                html += `</div><div class="tun-foot"><span class="tun-respec">RESPEC — ${RESONANCE.RESPEC_COST} PP</span></div>`;
                body.innerHTML = html;
                body.querySelectorAll('.tun-node.can').forEach(el => el.onclick = () => {
                    if (R.raise(el.dataset.tree, +el.dataset.i)) { audioSys.sfx('ui'); this._tuneReveal = null; this.applyResonanceStats(); this.updateUI(); this.renderTuning(); }
                });
                body.querySelector('.tun-respec').onclick = () => {
                    let spent = 0; for (const k in R.ranks) spent += R.ranks[k];
                    if (!spent) return showMessage('NOTHING INSTALLED TO RESET');
                    if (this.currency < RESONANCE.RESPEC_COST) return showMessage('INSUFFICIENT PERSONICS');
                    this.currency -= RESONANCE.RESPEC_COST; R.respec(); this.applyResonanceStats(); this.updateUI();
                    showMessage('DR. YIN RESET YOUR TUNING'); this._tuneReveal = null; this.renderTuning();
                };
            },

            closeTuning() {
                document.getElementById('tuning-overlay').style.display = 'none';
                this.pauseSystem.release('tuning');
                this._tuneReveal = null;
            },

            /** SKILLS (sidebar): plan your trees; Dr. Yin is where you spend. */
            renderSkillsScreen() {
                const el = document.getElementById('skills-screen-content');
                if (!el || !this.resonance) return;
                const R = this.resonance, next = R.toNext();
                const pct = next === Infinity ? 100 : Math.max(0, Math.min(100, Math.round(R.xp / next * 100)));
                let html = `<div class="df-section"><span><span class="glint">◆</span>Resonance</span><span class="count">Level ${R.level}</span></div>`;
                html += `<div class="df-card"><div class="df-head"><div class="grow"><div class="title script">Level ${R.level}</div>`;
                html += `<div class="eyebrow" style="margin-top:2px;">${next === Infinity ? 'Tuned to the limit' : `${R.xp} / ${next} to the next level`}</div></div>`;
                html += `<div class="df-chips" style="justify-content:flex-end;"><span class="df-chip active">${R.points} Tuning point${R.points === 1 ? '' : 's'}</span>`;
                html += `<span class="df-chip gold">${R.unsettled} unsettled</span><span class="df-chip info">Dark Element ◆ ${this.darkElement || 0}</span></div></div>`;
                html += `<div class="df-bar${pct ? '' : ' zero'}" style="margin-top:12px;"><i style="--v:${pct}%"></i></div>`;
                html += `<div class="df-hint" style="margin-top:12px;">Visit Dr. Yin at the medbay to tune. Unsettled Resonance is lost by half if you fall before you get there.</div></div>`;
                html += `<div class="df-grid" style="margin-top:14px;">`;
                for (const tree of RESONANCE_TREES) {
                    const spent = tree.nodes.reduce((a, n) => a + R.rank(n.id), 0);
                    html += `<div class="df-card accent" style="--acc:${tree.color}"><div class="df-head"><div class="title" style="color:${tree.color}">${tree.name}</div><span class="count df-chip info">${spent} / ${tree.nodes.length * 3}</span></div>`;
                    for (const n of tree.nodes) {
                        const r = R.rank(n.id);
                        html += `<div class="df-node${r ? ' on' : ''}"><span class="df-pips">${'<i class="on"></i>'.repeat(r)}${'<i></i>'.repeat(3 - r)}</span><span><b>${n.name}</b> — ${n.desc(Math.max(1, r))}</span></div>`;
                    }
                    html += `</div>`;
                }
                html += `</div>`;
                el.innerHTML = html;
            },
        });
