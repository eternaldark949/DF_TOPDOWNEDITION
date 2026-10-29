        // GameEngine — the Clothing Dyer. Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // Crafted at the workbench (SCHEMATICS clothing_dyer, story/missions.js) for 1,000 scrap, it stands in the
        // bedroom (questState.hasClothingDyer; ensureDyeStation). Its window (#dye-shop) recolours any outfit she
        // owns piece by piece — top, bottom, shoes, and a trim, lining, accent or stripe where the outfit has one —
        // from a palette or a custom colour, with her in the window as she'd look. Each piece dyed costs
        // DYER.FEE scrap; putting an outfit back to its own colours is free. The colours live in
        // cosmetics.dyes (core/registries.js dyedOutfit lays them over the outfit), saved, per outfit.

        const DYER = {
            FEE: 20,
            STATION: { x: 1176, y: 214, width: 58, height: 30 },       // apt_949: the bedroom wall between the nightstand and the wardrobe
            PALETTE: [
                ['#0c0c0e', 'Onyx'], ['#3a3a44', 'Slate'], ['#c9ccd8', 'Silver'], ['#f6f3ee', 'Pearl'], ['#efe6dc', 'Cream'], ['#e8c27a', 'Gold'],
                ['#cc7722', 'Amber'], ['#8b4a2b', 'Rust'], ['#4a2e22', 'Cocoa'], ['#6a0c20', 'Bordeaux'], ['#dc143c', 'Crimson'], ['#ff6f61', 'Coral'],
                ['#f19ab0', 'Rose'], ['#f3d6e4', 'Blush'], ['#e000c8', 'Magenta'], ['#8a2be2', 'Violet'], ['#b9a8e6', 'Lavender'], ['#ccccff', 'Periwinkle'],
                ['#1a1440', 'Midnight'], ['#2a5cff', 'Cobalt'], ['#17dcff', 'Neon Cyan'], ['#00b39b', 'Teal'], ['#9be8c0', 'Mint'], ['#2f5a3e', 'Emerald']
            ]
        };
        const DYE_PIECES = { top: 'Top', bottom: 'Bottom', shoes: 'Shoes' };
        const DYE_PARTS = { color: '', trim: 'trim', inner: 'lining', accent: 'accent', stripe: 'stripe' };

        engineMixin({
            hasDyer() { return !!(this.questState && this.questState.hasClothingDyer); },

            /** At home with the dyer made: its station stands in the bedroom (added last, after the saved layout's pieces) */
            ensureDyeStation() {
                if (!this.hasDyer() || !this.activeMap || this.activeMap.id !== 'apt_949') return;
                const props = this.activeMap.props || (this.activeMap.props = []);
                if (props.some(p => p.interactionType === 'clothing_dyer')) return;
                const p = new PropEntity({ ...DYER.STATION, mass: 1e7, color: '#3a2430', interactionType: 'clothing_dyer', decorType: 'apt_dyer' });
                props.push(p);
                if (this.props !== props) this.props = props;
            },

            /** What a piece is called in the window: "Top", "Bottom accent", "Shoes" */
            dyeSlotLabel(slot) { const [piece, k] = slot.split('.'); return (DYE_PIECES[piece] + ' ' + DYE_PARTS[k]).trim(); },

            /** The colour a slot wears now (its dye, else the outfit's own), and with this visit's unapplied choices */
            dyeColorOf(outfitId, slot, pending) {
                if (pending && pending[slot]) return pending[slot];
                const own = this.cosmetics.dyes[outfitId] && this.cosmetics.dyes[outfitId][slot];
                if (own) return own;
                const [piece, k] = slot.split('.');
                return COSMETICS_REGISTRY[outfitId].data[piece][k];
            },

            /** The pieces whose pending colour differs from what they wear now */
            dyeChanges(outfitId, pending) {
                return Object.keys(pending || {}).filter(slot => pending[slot].toLowerCase() !== String(this.dyeColorOf(outfitId, slot, null)).toLowerCase());
            },

            /** Dye the changed pieces: DYER.FEE scrap each. False if there's nothing to dye or not enough scrap */
            applyDyes(outfitId, pending) {
                const changed = this.dyeChanges(outfitId, pending), cost = changed.length * DYER.FEE;
                if (!changed.length || this.scrap < cost || !COSMETICS_REGISTRY[outfitId]) return false;
                const D = this.cosmetics.dyes[outfitId] || (this.cosmetics.dyes[outfitId] = {});
                const data = COSMETICS_REGISTRY[outfitId].data;
                for (const slot of changed) {
                    const [piece, k] = slot.split('.');
                    if (pending[slot].toLowerCase() === String(data[piece][k]).toLowerCase()) delete D[slot];   // dyed back to its own colour
                    else D[slot] = pending[slot].toLowerCase();
                }
                if (!Object.keys(D).length) delete this.cosmetics.dyes[outfitId];
                this.scrap -= cost;
                this.updateUI();
                return true;
            },

            /** Back to the outfit's own colours (free) */
            resetDyes(outfitId) { delete this.cosmetics.dyes[outfitId]; },

            openDyer() {
                const C = this.cosmetics;
                this.pauseSystem.acquire('dyer');
                const outfit = C.equippedOutfit && C.isOwned(C.equippedOutfit) ? C.equippedOutfit : 'outfit_casual';
                this._dye = { outfit, slot: dyeSlots(COSMETICS_REGISTRY[outfit].data)[0], pending: {} };
                this._shopShow('dye-shop', true);
                this.renderDyer();
                document.getElementById('dye-shop-close').onclick = () => {
                    this._dye = null;
                    this._shopShow('dye-shop', false);
                    this.pauseSystem.release('dyer');
                };
            },

            renderDyer() {
                const el = document.getElementById('dye-shop-grid'), S = this._dye;
                if (!el || !S) return;
                const C = this.cosmetics, esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
                this._shopBalance('dye-shop-balance', this.scrap, 'Scrap');
                const entry = COSMETICS_REGISTRY[S.outfit], slots = dyeSlots(entry.data);
                if (!slots.includes(S.slot)) S.slot = slots[0];
                const changed = this.dyeChanges(S.outfit, S.pending), cost = changed.length * DYER.FEE;
                const dyedNow = Object.keys(C.dyes[S.outfit] || {}).length;
                const cur = this.dyeColorOf(S.outfit, S.slot, S.pending);
                let html = `<div class="sk-head dy-head"><div class="dy-stage"><canvas id="dye-preview" width="220" height="220"></canvas></div>`;
                html += `<div class="sk-meta"><div class="sk-next">${esc(entry.name)}</div>`;
                html += `<div class="sk-caps"><span class="sk-cap lav">${dyedNow ? `${dyedNow} piece${dyedNow > 1 ? 's' : ''} dyed` : 'Its own colours'}</span><span class="sk-cap">${DYER.FEE} scrap a piece</span></div>`;
                html += `<div class="sk-hint">Pick a piece, then a colour. She's shown as she'll look; nothing is dyed until you apply it. Back to its own colours is free.</div></div></div>`;
                // The outfits she owns
                const owned = Object.values(COSMETICS_REGISTRY).filter(c => c.category === 'outfit' && C.isOwned(c.id));
                html += `<div class="df-section"><span><span class="glint">◆</span>Outfit</span><span class="count">${owned.length}</span></div><div class="df-chips dy-outfits">`;
                for (const o of owned) {
                    const d = dyedOutfit(o.data, C.dyes[o.id]);
                    html += `<span class="df-chip pick${o.id === S.outfit ? ' active' : ''}" data-outfit="${o.id}"><i class="dot" style="background:linear-gradient(135deg, ${d.top.color} 0 50%, ${(d.bottom || d.top).color} 50% 100%)"></i>${esc(o.name)}</span>`;
                }
                html += `</div>`;
                // Its pieces
                html += `<div class="df-section"><span><span class="glint">◆</span>Pieces</span><span class="count">${changed.length ? `${changed.length} to dye` : slots.length}</span></div><div class="df-chips dy-slots">`;
                for (const slot of slots) {
                    const col = this.dyeColorOf(S.outfit, slot, S.pending);
                    html += `<span class="df-chip pick${slot === S.slot ? ' active' : ''}${changed.includes(slot) ? ' gold' : ''}" data-slot="${slot}"><i class="dot" style="background:${col}"></i>${esc(this.dyeSlotLabel(slot))}</span>`;
                }
                html += `</div>`;
                // The colours
                html += `<div class="df-section"><span><span class="glint">◆</span>Dye · ${esc(this.dyeSlotLabel(S.slot))}</span><span class="count">${esc(cur)}</span></div><div class="dy-palette">`;
                for (const [hex, name] of DYER.PALETTE) html += `<button class="dy-swatch${hex.toLowerCase() === String(cur).toLowerCase() ? ' on' : ''}" data-hex="${hex}" title="${esc(name)}" aria-label="${esc(name)}" style="--c:${hex}"></button>`;
                const inPalette = DYER.PALETTE.some(([hex]) => hex.toLowerCase() === String(cur).toLowerCase());
                html += `<button class="dy-swatch dy-custom${S.custom ? ' open' : ''}${!inPalette && S.pending[S.slot] ? ' on' : ''}" id="dye-custom" title="Custom colour" aria-label="Custom colour" aria-expanded="${!!S.custom}" style="--c:${cur}"><span>${S.custom ? '×' : '+'}</span></button></div>`;
                if (S.custom) html += `<div id="dye-picker">${ColorPicker.html(cur)}</div>`;   // ui/color-picker.js
                // Apply / undo
                html += `<div class="dy-actions df-sticky-actions"><button class="df-btn" id="dye-apply"${changed.length && this.scrap >= cost ? '' : ' disabled'}>Dye ${changed.length || ''} · ${cost} Scrap</button>`;
                html += `<button class="df-btn small ghost" id="dye-discard"${changed.length ? '' : ' disabled'}>Undo choices</button>`;
                html += `<button class="df-btn small ghost" id="dye-reset"${dyedNow ? '' : ' disabled'}>Original colours</button></div>`;
                el.innerHTML = html;
                this.drawDyePreview(document.getElementById('dye-preview'), S.outfit, S.pending);

                const pick = hex => { S.pending[S.slot] = hex.toLowerCase(); audioSys.sfx('ui'); this.renderDyer(); };
                el.querySelectorAll('[data-outfit]').forEach(c => c.addEventListener('click', () => { S.outfit = c.dataset.outfit; S.pending = {}; audioSys.sfx('ui'); this.renderDyer(); }));
                el.querySelectorAll('[data-slot]').forEach(c => c.addEventListener('click', () => { S.slot = c.dataset.slot; audioSys.sfx('ui'); this.renderDyer(); }));
                el.querySelectorAll('button[data-hex]').forEach(b => b.addEventListener('click', () => pick(b.dataset.hex)));
                document.getElementById('dye-custom').addEventListener('click', () => { S.custom = !S.custom; audioSys.sfx('ui'); this.renderDyer(); });
                if (S.custom) ColorPicker.bind(document.getElementById('dye-picker'), cur, {
                    onInput: hex => { S.pending[S.slot] = hex; this.drawDyePreview(document.getElementById('dye-preview'), S.outfit, S.pending); },
                    onPick: pick
                });
                document.getElementById('dye-apply').addEventListener('click', () => {
                    if (!this.applyDyes(S.outfit, S.pending)) return;
                    S.pending = {};
                    showMessage(`${entry.name.toUpperCase()}: DYED`);
                    audioSys.sfx('ui');
                    this.renderDyer();
                });
                document.getElementById('dye-discard').addEventListener('click', () => { S.pending = {}; this.renderDyer(); });
                const reset = document.getElementById('dye-reset');
                reset.addEventListener('click', () => this._confirmTap(reset, 'Confirm?', () => { this.resetDyes(S.outfit); S.pending = {}; this.renderDyer(); }));
            },

            /** Her, from above as in the world, in the outfit as it would be dyed */
            drawDyePreview(cv, outfitId, pending) {
                if (!cv || !cv.getContext) return;
                const ctx = cv.getContext('2d'), C = this.cosmetics, cfg = C.getRenderConfig();
                const dyes = { ...(C.dyes[outfitId] || {}), ...(pending || {}) };
                const o = dyedOutfit(COSMETICS_REGISTRY[outfitId].data, dyes);
                ctx.clearRect(0, 0, cv.width, cv.height);
                const g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, 10, cv.width / 2, cv.height / 2, cv.width / 2);
                g.addColorStop(0, 'rgba(202,176,250,0.22)'); g.addColorStop(1, 'rgba(202,176,250,0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
                const body = this._dyeBody || (this._dyeBody = { x: 0, y: 0, angle: Math.PI / 2, walkPhase: 0, radius: 12, _reflectionProxy: true });
                ctx.save();
                ctx.translate(cv.width / 2, cv.height / 2 + 6); ctx.scale(4.2, 4.2); ctx.rotate(Math.PI / 2);   // facing down the window, toward you
                try {
                    drawProceduralHumanoid(ctx, body, {
                        skinColor: cfg.skinColor, hair: cfg.hair, gender: APPEARANCES['949'].gender, stance: 'idle',
                        top: o.top, bottom: o.bottom, shoes: o.shoes, train: o.train || null, hat: cfg.hat, jewelry: cfg.jewelry, held: cfg.held
                    });
                } finally { ctx.restore(); }
            }
        });
