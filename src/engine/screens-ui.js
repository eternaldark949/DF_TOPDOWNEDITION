        // GameEngine — HUD update, dialogue and portraits, shops, character/team/story/collection screens, notes, crafting.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /* =========================================================
               UNIFIED UI UPDATE SYSTEM
               ---------------------------------------------------------
               All HUD elements are updated through this single method.
               Called every frame from the main game loop.
               
               Previously had separate functions (updateHealthUI, 
               updateBoosterUI, updateEconomyUI) but consolidated here
               for cleaner code and consistent state.
               ========================================================= */
            updateUI() {
                // Runs every tick, so it only touches the DOM when a value actually changed
                // (each write can cost a style recalculation on phones). U caches the elements and last values.
                const U = this._ui || (this._ui = {
                    flit: document.getElementById('flit-bar'), shield: document.getElementById('ui-shield-bar'),
                    shieldFill: document.getElementById('shield-bar-fill'), bars: null, last: {}, vizT: 0
                });
                const L = U.last, set = (k, v, fn) => { if (L[k] !== v) { L[k] = v; fn(v); } };

                // --- 1. HEALTH BAR (Red gradient) ---
                // Displays player's current HP as percentage of max
                const healthPercent = Math.max(0, (this.playerHealth / this.maxPlayerHealth) * 100);
                set('hp', healthPercent.toFixed(1), v => { this.healthBar.style.width = `${v}%`; });
                
                // --- 2. FLIT ATTUNEMENT BAR (Champagne/Gold) ---
                // Shows current attunement pool. Full bar = max charges available.
                const flitPercent = Math.max(0, Math.min(100, 
                    (this.flitState.attunement / this.flitState.maxAttunement) * 100));
                if (U.flit) set('flit', flitPercent.toFixed(1), v => { U.flit.style.width = `${v}%`; });

                // --- 3. ECONOMY DISPLAY ---
                // PP = Primary currency for purchases
                // Scrap = Secondary resource for upgrades
                set('pp', this.currency, v => { this.uiCurrency.textContent = `PP: ${v}`; });
                set('scrap', this.scrap, v => { this.uiScrap.textContent = `Scrap: ${v}`; });
                this.updateResonanceHUD();
                
                // --- 4. BOOSTER/STIM COUNT ---
                // Shows remaining healing items on the heal button
                set('boost', this.boosterCount, v => { this.healBtn.innerHTML = `✚<br><span>${v}</span>`; });
                
                // --- 5. GOLDEN SHIELD BAR (any buff with shield) ---
                if (U.shield && U.shieldFill) {
                    const shieldBuff = this.player.buffSystem.getShieldBuff();
                    set('shieldOn', !!shieldBuff, v => { U.shield.style.display = v ? 'block' : 'none'; });
                    if (shieldBuff) set('shieldW', ((shieldBuff.shield / shieldBuff.maxShield) * 100).toFixed(1), v => { U.shieldFill.style.width = `${v}%`; });
                }
                
                // --- 6. AUDIO VISUALIZER (Cosmetic) ---
                // Random bar heights create a "playing music" effect (about 10 times a second is plenty)
                if (++U.vizT >= 6) {
                    U.vizT = 0;
                    if (!U.bars || !U.bars.length) U.bars = document.querySelectorAll('#audio-viz .viz-bar');
                    U.bars.forEach(bar => bar.style.height = `${20 + Math.random() * 80}%`);
                }
            },
            
            /* =========================================================
               LOOT SPAWNING
               ---------------------------------------------------------
               Called when enemies die to drop random pickups.
               Drop rates: 40% PP, 30% Scrap, 20% Stim, 10% Nothing
               ========================================================= */
            spawnLoot(x, y) { 
                const rand = Math.random(); 
                if (rand < 0.4) this.loot.push(new Loot(x, y, 'pp')); 
                else if (rand < 0.7) this.loot.push(new Loot(x, y, 'scrap')); 
                else if (rand < 0.9) this.loot.push(new Loot(x, y, 'stim')); 
            },

            startDialogue(entity) {
                // BONDING INTERCEPT — recruited teammates in apartment
                if (entity.role === 'teammate' && entity.recruited 
                    && this.activeMap && this.activeMap.id === 'apt_949' && this.bonding) {
                    if (this.bonding.canBond(entity)) {
                        this.bonding.startBonding(entity, this);
                        return;
                    } else {
                        // Cooldown — show a brief remark instead
                        this.pauseSystem.acquire('dialogue');
                        this.dialogueBox.style.display = 'block';
                        this.npcNameEl.textContent = entity.name;
                        this.npcNameEl.style.color = SPEAKER_COLORS[entity.name] || '#ff0055';
                        this.renderDialoguePortrait(entity.name);
                        document.getElementById('dialogue-caption').style.display = 'none';
                        const cooldownLines = {
                            'Victoria': "We already talked. Go shoot something.",
                            'Yenna': "We've spoken. I'll be here.",
                            'Sabrina': "Miss me already? Later, Freelancer.",
                            'Max': "Chill, we just talked! Go take a nap or something.",
                            'Josh': "Social interaction quota met for this cycle."
                        };
                        this.npcTextEl.textContent = cooldownLines[entity.name] || "We've already caught up.";
                        this.btnAccept.style.display = 'none';
                        this.btnDecline.textContent = 'OK';
                        this.btnDecline.style.display = '';
                        return;
                    }
                }

                this.pauseSystem.acquire('dialogue'); 
                this.dialogueBox.style.display = 'block'; 
                this.npcNameEl.textContent = entity.name;
                
                // Render portrait and apply speaker color
                this.renderDialoguePortrait(entity.name);
                this.npcNameEl.style.color = SPEAKER_COLORS[entity.name] || '#ff0055';
                
                // 1. HIDE RANDOM CAPTIONS (Cleanup the screen)
                document.getElementById('dialogue-caption').style.display = 'none';
                
                // 2. Track Meeting (For Phone Contacts)
                if (typeof phoneSystem !== 'undefined') {
                    phoneSystem.meetNPC(entity);
                }
                
                // 3. THE LINE AND THE BUTTONS (story/npc-dialogue.js)
                const D = npcDialogueFor(entity);
                this.npcTextEl.textContent = D.text(this, entity);
                const B = D.buttons ? D.buttons(this, entity) : {};
                if (B.accept === null) this.btnAccept.style.display = 'none';
                else if (B.accept) this.btnAccept.textContent = B.accept;
                if (B.decline) this.btnDecline.textContent = B.decline;
                if (B.extra) {
                    // A third button that just leaves (Grum's menu)
                    if (!this._extraDialogueBtn) {
                        this._extraDialogueBtn = document.createElement('button');
                        this._extraDialogueBtn.className = 'dialogue-btn';
                        this._extraDialogueBtn.style.opacity = '0.6';
                        this.btnDecline.parentElement.appendChild(this._extraDialogueBtn);
                        this._extraDialogueBtn.addEventListener('click', () => { this._extraDialogueBtn.style.display = 'none'; this.endDialogue(); });
                    }
                    this._extraDialogueBtn.textContent = B.extra;
                    this._extraDialogueBtn.style.display = '';
                }
                if (D.noLock) return;
                
                // 4. LOCK UI INTERACTIONS (Except Dialogue Box)
                document.getElementById('game-ui').style.pointerEvents = 'none'; 
                this.dialogueBox.style.pointerEvents = 'auto';
            },

            /**
             * Resolve a speaker name to a drawCharacterPortrait() config.
             *
             * This is the SINGLE source of truth for "what does this character look
             * like in a portrait". It is deliberately separate from any canvas work
             * so every surface that wants a bust — the dialogue box, the cosmetic
             * preview canvases, a future contact-list avatar — resolves identically.
             * Duplicating the tier order is how these things drift apart.
             *
             * Tier order:
             *   1. Player (949 / Stella) — live cosmetics, falls back to defaults
             *   2. Everyone else — portraitOf(their look), the same look as their body
             *      in the world (core/appearances.js): a live teammate or NPC by name,
             *      else their APPEARANCES entry
             *   3. Grey silhouette
             *
             * Always returns a usable config, never null. The returned object carries
             * `isFallback: true` when it landed on tier 3, so a caller that would
             * rather show something else than a grey silhouette (e.g. keeping a
             * contact's emoji avatar) can check before drawing.
             *
             * NOTE ON CACHING: the tier-1 result depends on live cosmetics and changes
             * when the player switches outfits. Do NOT cache rendered output by name.
             * Use getPortraitCanvas() / getPortraitDataURL(), which key on the resolved
             * config via portraitCacheKey() and therefore invalidate themselves.
             *
             * @param {string} speakerName
             * @returns {Object} config for drawCharacterPortrait
             */
            resolvePortraitConfig(speakerName) {
                // 1. Player
                if (speakerName === '949' || speakerName === 'Stella') {
                    if (this.cosmetics) {
                        const c = this.cosmetics.getRenderConfig();
                        const face = this.playerExpression ? { expression: this.playerExpression } : {};
                        const me = APPEARANCES['949'];
                        return { skinColor: c.skinColor, hair: c.hair, eyeColor: me.eyeColor, gender: me.gender, top: c.outfit.top, hat: c.hat, jewelry: withFieldMask(this, c.jewelry), ...face };
                    }
                    return portraitOf(APPEARANCES['949'], { jewelry: withFieldMask(this, APPEARANCES['949'].jewelry) });
                }

                // 2. Everyone else: their look (core/appearances.js) — a live NPC or teammate by name
                //    (so crowds resolve by role), else their named entry
                const who = (this.teammates || []).find(t => t.name === speakerName) || (this.npcs || []).find(n => n.name === speakerName);
                const look = who ? lookFor(who) : APPEARANCES[speakerName];
                if (look) return portraitOf(look);

                // 3. Silhouette
                return { skinColor: '#555', hair: { type: 'short', color: '#333' }, eyeColor: '#222', gender: 'male', isFallback: true };
            },

            /** Deterministic serialisation — key order can't affect the result. */
            _stableStringify(v) {
                if (v === null || typeof v !== 'object') return JSON.stringify(v);
                if (Array.isArray(v)) return '[' + v.map(x => this._stableStringify(x)).join(',') + ']';
                return '{' + Object.keys(v).sort()
                    .map(k => JSON.stringify(k) + ':' + this._stableStringify(v[k]))
                    .join(',') + '}';
            },

            /**
             * Cache key for a portrait config.
             *
             * THIS IS THE FIX FOR THE STALE-AVATAR PROBLEM. Caching rendered portraits
             * by character NAME is unsafe: 949's config is built from live cosmetics,
             * so changing outfits leaves a stale avatar behind. Keying on the resolved
             * config instead means appearance IS the key — change the outfit and the
             * key changes, so the next lookup misses and repaints. Nothing has to
             * remember to fire an invalidation event, which is the failure mode that
             * bit the notification badges.
             *
             * Serialises the WHOLE config rather than an enumerated list of fields
             * drawCharacterPortrait happens to read today. That's deliberate: if a
             * field is added to configs later and the renderer starts reading it, a
             * hand-maintained list would silently under-invalidate and serve wrong
             * portraits. Serialising everything can only ever OVER-invalidate, whose
             * worst case is one redundant redraw.
             *
             * `isFallback` is excluded because it's metadata for the caller, not
             * something the renderer draws.
             */
            portraitCacheKey(config) {
                const visual = { ...config };
                delete visual.isFallback;
                return this._stableStringify(visual);
            },

            /** Drop all cached portraits. Not needed for appearance changes — the key
             *  handles those — but useful for teardown and tests. */
            clearPortraitCache() {
                if (this._portraitCache) this._portraitCache.clear();
            },

            /**
             * Render a character portrait into the dialogue box canvas, wearing the line's
             * mood (or one read from the text), and keep it alive while the box is open:
             * the lips move for about as long as the line takes to say, and they blink.
             */
            renderDialoguePortrait(speakerName, mood, text) {
                const now = performance.now(), len = text ? String(text).length : 0;
                let seed = 0; for (const ch of String(speakerName)) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
                this._dialogueFace = {
                    speaker: speakerName, seed,
                    // Tagged mood, else read from the line, else the speaker's temperament, else what their pose suggests
                    expression: mood || ((text ? inferMood(text, speakerName) : 'neutral') !== 'neutral' || CHARACTER_TEMPERAMENT[speakerName]
                        ? (text ? inferMood(text, speakerName) : CHARACTER_TEMPERAMENT[speakerName])
                        : this._poseFace(speakerName)),
                    talkUntil: now + (len ? Math.min(3500, 350 + len * 45) : 0), last: ''
                };
                // Out in a storm, everyone squints against the wind
                const wx = weatherAt(this.player);
                if (wx && wx.strong > 0.4) {
                    const X = resolveExpression(this._dialogueFace.expression);
                    X.lids.top = Math.max(X.lids.top, 0.3 * wx.strong + 0.05);
                    this._dialogueFace.expression = X;
                }
                this._paintDialogueFace();
                if (!this._dialogueFaceTimer) this._dialogueFaceTimer = setInterval(() => this._paintDialogueFace(), 50);
            },

            /** The face a speaker's current pose suggests (e.g. dancing → sultry), or neutral. */
            _poseFace(speakerName) {
                const who = (this.teammates || []).find(t => t.name === speakerName) || (this.npcs || []).find(n => n.name === speakerName);
                const p = who && who._pose && POSES[who._pose.name] ? POSES[who._pose.name](0, { still: 0, seed: 0 }) : null;
                return (p && p.hint) || 'neutral';
            },

            /** One frame of the living dialogue portrait (repaints only when the face changed). */
            _paintDialogueFace() {
                const f = this._dialogueFace, canvas = document.getElementById('dialogue-portrait');
                if (!f || !canvas || !this.dialogueBox || this.dialogueBox.style.display === 'none') {
                    clearInterval(this._dialogueFaceTimer); this._dialogueFaceTimer = null; return;
                }
                const now = performance.now();
                const blink = Math.round(blinkAmount(now / 1000, f.seed) * 4) / 4;
                const talk = now < f.talkUntil ? Math.round(Math.abs(Math.sin(now / 1000 * Math.PI * 5.5)) * 4) / 4 * 0.55 : 0;
                const key = blink + '|' + talk;
                if (key === f.last) return;
                f.last = key;
                this.paintPortraitTo(canvas, f.speaker, undefined, { expression: f.expression, blink, talk });
            },

            /**
             * Paint a resolved portrait into any canvas, with the circular backdrop.
             * Shared by the dialogue box and available to any future surface.
             * @param {HTMLCanvasElement} canvas
             * @param {string} speakerName
             * @param {string} [bg] backdrop fill; pass null to skip it
             */
            paintPortraitTo(canvas, speakerName, bg = 'rgba(40, 5, 25, 0.95)', face = null) {
                if (!canvas) return null;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (bg) {
                    ctx.fillStyle = bg;
                    ctx.beginPath();
                    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                const config = this.resolvePortraitConfig(speakerName);
                drawCharacterPortrait(ctx, canvas.width, canvas.height, face ? { ...config, ...face } : config);
                return config;
            },

            /**
             * Offscreen canvas for a character at a given size, cached by appearance.
             * Safe to call every repaint — a hit is a Map lookup.
             * @returns {{canvas: HTMLCanvasElement, config: Object}}
             */
            getPortraitCanvas(speakerName, size = 48, bg = 'rgba(40, 5, 25, 0.95)') {
                if (!this._portraitCache) this._portraitCache = new Map();
                const config = this.resolvePortraitConfig(speakerName);
                const key = size + '|' + (bg || '') + '|' + this.portraitCacheKey(config);

                const hit = this._portraitCache.get(key);
                if (hit) {
                    // Refresh LRU position.
                    this._portraitCache.delete(key);
                    this._portraitCache.set(key, hit);
                    return hit;
                }

                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                this.paintPortraitTo(canvas, speakerName, bg);

                const entry = { canvas, config, url: null };
                this._portraitCache.set(key, entry);

                // Bound the cache. Outfit changes mint new keys, so an unbounded map
                // would grow with every cosmetic swap. Map preserves insertion order,
                // so the first key is the least recently used.
                const MAX_PORTRAIT_CACHE = 32;
                while (this._portraitCache.size > MAX_PORTRAIT_CACHE) {
                    this._portraitCache.delete(this._portraitCache.keys().next().value);
                }
                return entry;
            },

            /**
             * Data URL for a character portrait, for use as an <img src> in DOM lists.
             * Encoding is the expensive part, so it's memoised on the cache entry and
             * only paid once per appearance.
             */
            getPortraitDataURL(speakerName, size = 48, bg = 'rgba(40, 5, 25, 0.95)') {
                const entry = this.getPortraitCanvas(speakerName, size, bg);
                if (!entry.url) entry.url = entry.canvas.toDataURL('image/png');
                return entry.url;
            },

            /**
             * The talk box's mood follows the speaker: each new line tints the box
             * halo (--who) with the name's colour and fades the words in.
             */
            _installDialogueStyle() {
                if (!this.npcTextEl || this._dialogueStyleInstalled) return;
                this._dialogueStyleInstalled = true;
                let lastName = null;
                const restyle = () => {
                    if (!this.dialogueBox || this.dialogueBox.style.display === 'none') { lastName = null; return; }
                    const c = this.npcNameEl && this.npcNameEl.style.color;
                    if (c) this.dialogueBox.style.setProperty('--who', c);
                    const els = [this.npcTextEl];
                    const name = this.npcNameEl && this.npcNameEl.textContent;
                    if (name !== lastName) { els.push(this.npcNameEl); lastName = name; }
                    for (const el of els) { el.classList.remove('line-in'); void el.offsetWidth; el.classList.add('line-in'); }
                };
                new MutationObserver(restyle).observe(this.npcTextEl, { childList: true, characterData: true, subtree: true });
            },

            /**
             * Install a MutationObserver on npcTextEl so EVERY dialogue line ever
             * shown (DialogueSequence, single-line shop/quest greetings, recruit
             * prompts, story handler lines, anything future) is captured to the
             * transcript. Speaker is read from npcNameEl, which every call site
             * sets BEFORE the text write — that ordering is part of the contract.
             *
             * The observer runs synchronously on each text mutation. DialogueTranscript.add
             * already dedupes consecutive identical entries, which guards against the
             * "set name then set text" two-mutation pattern from re-firing when only
             * one of them changed.
             */
            _installDialogueCapture() {
                if (!this.npcTextEl || !this.transcript) return;
                if (this._dialogueCaptureInstalled) return;
                this._dialogueCaptureInstalled = true;

                const captureCurrentLine = () => {
                    // Only capture while the dialogue box is actually visible to the
                    // player — guards against init-time stub values being logged.
                    if (!this.dialogueBox || this.dialogueBox.style.display === 'none') return;
                    // Skip captures during peek mode — the player is reviewing, not
                    // hearing a new line. DialogueSequence flips this class on the box.
                    if (this.dialogueBox.classList.contains('peeking')) return;
                    const speaker = (this.npcNameEl && this.npcNameEl.textContent || '').trim();
                    const text = (this.npcTextEl.textContent || '').trim();
                    if (!speaker || !text) return;
                    // Filter out the placeholder defaults that get re-asserted on
                    // endDialogue resets. (The buttons reset to "Accept" / "Decline",
                    // but in case anything else writes a stub, this catches it.)
                    if (speaker === 'NPC Name') return;
                    this.transcript.add(speaker, text, this.worldMinutes);
                };

                const observer = new MutationObserver(captureCurrentLine);
                observer.observe(this.npcTextEl, { childList: true, characterData: true, subtree: true });
                this._dialogueObserver = observer;
            },
            
            endDialogue() {
                this.pauseSystem.release('dialogue'); 
                this.dialogueBox.style.display = 'none'; 
                
                // 1. RESTORE RANDOM CAPTIONS
                document.getElementById('dialogue-caption').style.display = 'block';
                
                // 2. RESTORE DIALOGUE BUTTON DEFAULTS
                this.btnAccept.textContent = 'Accept';
                this.btnAccept.style.display = '';
                this.btnDecline.textContent = 'Decline';
                this.btnDecline.style.display = '';
                this.npcNameEl.style.color = '';
                
                // 2b. Hide the third button (Grum's menu)
                if (this._extraDialogueBtn) this._extraDialogueBtn.style.display = 'none';
                
                // 3. RESET POINTER EVENTS (Re-enable Buttons)
                document.getElementById('game-ui').style.pointerEvents = 'none'; 
                const buttons = document.querySelectorAll('.game-btn, #btn-fire, #btn-heal, #btn-flit, #btn-autodrive, #btn-handbrake, #btn-nv, #btn-holster'); 
                buttons.forEach(b => b.style.pointerEvents = 'auto');
                document.getElementById('input-zone-left').style.pointerEvents = 'auto';
            },

            // --- AUGMENT SHOP ---
            /* ── SHOP FRAME (styles/shops.css): open/close an overlay, its balance capsule, double-tap buys ── */
            _shopShow(id, on) {
                const el = document.getElementById(id); if (!el) return;
                el.classList.toggle('open', on);
                if (on) el.onclick = (e) => { if (e.target === el) { const c = el.querySelector('.df-shop-close'); if (c) c.click(); } };   // a tap on the backdrop closes it
            },
            _shopBalance(id, n, unit = 'PP') {
                const el = document.getElementById(id); if (!el) return;
                el.classList.toggle('scrap', unit !== 'PP');
                el.innerHTML = `<span class="gem">◆</span>${Math.floor(n).toLocaleString()}<span class="unit">${unit}</span>`;
            },
            /** First tap arms the button ("Confirm?"), a second within 2.5 s does it */
            _confirmTap(btn, label, run) {
                if (btn.dataset.armed) { btn.dataset.armed = ''; clearTimeout(btn._t); run(); return; }
                btn.dataset.armed = '1'; btn._label = btn.innerHTML; btn.innerHTML = label; btn.classList.add('confirm');
                audioSys.sfx('ui');
                btn._t = setTimeout(() => { btn.dataset.armed = ''; btn.innerHTML = btn._label; btn.classList.remove('confirm'); }, 2500);
            },
            /** A card that was just bought glows gold once (after the re-render) */
            _shopFlash(container) {
                if (!this._shopJust) return;
                const el = container.querySelector(`[data-key="${this._shopJust}"]`); this._shopJust = null;
                if (el) { el.classList.add('bought'); el.scrollIntoView({ block: 'nearest' }); }
            },
            _priceHtml(price, have, unit = 'PP') {
                return `<span class="df-price${have < price ? ' short' : ''}">${price.toLocaleString()}<span class="unit">${unit}</span></span>`;
            },

            openAugmentShop() {
                this.pauseSystem.acquire('augment_shop');
                this._shopShow('augment-shop', true);
                this._shopBalance('aug-shop-balance', this.currency);
                const grid = document.getElementById('aug-shop-grid'), A = this.augments;
                let html = `<div class="df-section"><span><span class="glint">◆</span>Cybernetic Augments</span><span class="count">${A.owned.length} / ${AUGMENT_CATALOG.length} installed</span></div>`;
                for (const aug of AUGMENT_CATALOG) {
                    const owned = A.isOwned(aug.id), afford = this.currency >= aug.price;
                    html += `<div class="df-card${owned ? ' lit' : afford ? '' : ' unaffordable'}" data-key="${aug.id}"><div class="df-head">`;
                    html += `<div class="note-ico">${aug.icon}</div><div class="grow"><div class="eyebrow">Slot · ${aug.slot}</div><div class="title">${aug.name}</div><div class="desc">${aug.desc}</div></div>`;
                    html += `<div class="df-shop-side">${owned ? `<span class="df-chip active">✓ Installed</span>${A.isEquipped(aug.id) ? '<span class="df-chip">● Equipped</span>' : ''}`
                        : `${this._priceHtml(aug.price, this.currency)}<button class="df-btn small" data-buy="${aug.id}"${afford ? '' : ' disabled'}>Buy</button>`}</div>`;
                    html += `</div></div>`;
                }
                html += `<div class="df-hint" style="text-align:center;margin-top:8px;">Equip installed augments from the Augments screen.</div>`;
                grid.innerHTML = html;
                this._shopFlash(grid);
                grid.querySelectorAll('button[data-buy]').forEach(b => b.addEventListener('click', () => this._confirmTap(b, 'Confirm?', () => {
                    if (A.buy(b.dataset.buy, this)) { this._shopJust = b.dataset.buy; audioSys.sfx('ui'); this.openAugmentShop(); }
                })));
                document.getElementById('aug-shop-close').onclick = () => {
                    this._shopShow('augment-shop', false);
                    this.pauseSystem.release('augment_shop');
                };
            },

            // ── COSMETICS SHOP (Neural Systems) ──
            openCosmeticsShop() {
                this.pauseSystem.acquire('cosmetics_shop');
                this._shopShow('cosmetics-shop-overlay', true);
                this._shopBalance('cosmetics-shop-balance', this.currency);
                const overlay = document.getElementById('cosmetics-shop-overlay');
                const tabs = overlay.querySelectorAll('.cosmetics-tab');
                const content = document.getElementById('cosmetics-shop-content');
                const C = this.cosmetics;
                const LABEL = { wig: 'W.I.G.s', skin: 'S.K.I.N.s', outfit: 'O.U.T.F.I.T.s', vocal: 'V.O.C.A.L.s', accessory: 'A.C.C.E.S.S.', hat: 'H.A.T.s', jewelry: 'J.E.W.E.L.s' };
                let activeTab = this._cosmeticsTab || 'wig';

                /** The item's look as a round swatch */
                const swatchOf = (item, category) => {
                    const d = item.data || {};
                    if (category === 'wig') return `background:${d.color}`;
                    if (category === 'skin') return `background:${d.skinColor}`;
                    if (category === 'outfit') return `background:linear-gradient(135deg, ${d.top.color} 50%, ${d.bottom.color} 50%)`;
                    if (category === 'hat' || category === 'jewelry') return `background:radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55) 0 14%, ${d.color} 45%)`;
                    if (category === 'vocal') return `background:${d.captionColor};opacity:0.8`;
                    if (category === 'accessory' && d.held === 'umbrella') return `background:conic-gradient(${d.color} 0 12.5%, ${d.trim} 12.5% 14%, ${d.color} 14% 25%, ${d.trim} 25% 26.5%, ${d.color} 26.5% 100%)`;
                    if (category === 'accessory') { const g = GLASS_DRINKS[C.getAccessoryOption(item.id, 'drink')] || GLASS_DRINKS.champagne; return `background:radial-gradient(circle at 35% 35%, #fff 0 12%, ${g.liquid} 30%, ${g.liquid2 || g.liquid} 100%)`; }
                    return 'background:#333';
                };

                const renderTab = (category) => {
                    activeTab = this._cosmeticsTab = category;
                    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === category));
                    const items = Object.values(COSMETICS_REGISTRY).filter(e => e.category === category);
                    const optional = category === 'accessory' || category === 'hat' || category === 'jewelry';   // these can be taken off
                    const ownedN = items.filter(it => C.isOwned(it.id)).length;
                    let html = `<div class="df-section"><span><span class="glint">◆</span>${LABEL[category] || category}</span><span class="count">${ownedN} / ${items.length} owned</span></div>`;
                    for (const item of items) {
                        const owned = C.isOwned(item.id), equipped = C.isEquipped(item.id), afford = this.currency >= item.price;
                        html += `<div class="df-card clickable${equipped ? ' lit' : ''}${!owned && !afford ? ' unaffordable' : ''}" data-key="${item.id}" data-id="${item.id}"><div class="df-head">`;
                        html += `<div class="df-swatch" style="${swatchOf(item, category)}"></div>`;
                        html += `<div class="grow"><div class="title">${item.name}</div><div class="desc">${item.desc}</div></div>`;
                        html += `<div class="df-shop-side">`;
                        if (!owned) html += `${this._priceHtml(item.price, this.currency)}<button class="df-btn small" data-act="buy"${afford ? '' : ' disabled'}>Buy</button>`;
                        else if (!equipped) html += `<span class="df-chip">Owned</span><button class="df-btn small ghost" data-act="equip">Equip</button>`;
                        else html += `<span class="df-chip active">● Active</span>${optional ? '<button class="df-btn small danger" data-act="remove">Remove</button>' : ''}`;
                        html += `</div></div>`;
                        // The glass: pick the pour (owned only)
                        if (category === 'accessory' && owned && item.data.held === 'glass') {
                            const cur = C.getAccessoryOption(item.id, 'drink');
                            html += `<div class="df-chips" style="margin-top:10px;">`;
                            for (const [key, d] of Object.entries(GLASS_DRINKS)) {
                                if (d.cafe) continue;                                   // (mugs are the cafe's)
                                html += `<span class="df-chip pick cosmetics-drink${key === cur ? ' active' : ''}" data-acc="${item.id}" data-drink="${key}"><i class="dot" style="background:${d.liquid};${d.liquid2 ? `box-shadow:3px 0 0 -1px ${d.liquid2};` : ''}"></i>${d.name}</span>`;
                            }
                            html += `</div>`;
                        }
                        html += `</div>`;
                    }
                    content.innerHTML = html;
                    this._shopFlash(content);

                    content.querySelectorAll('.cosmetics-drink').forEach(el => el.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        C.setAccessoryOption(el.dataset.acc, 'drink', el.dataset.drink);
                        C.equip(el.dataset.acc);
                        audioSys.sfx('ui');
                        renderTab(activeTab);
                    }));
                    content.querySelectorAll('.df-card[data-id]').forEach(card => {
                        const id = card.dataset.id, entry = COSMETICS_REGISTRY[id];
                        const act = (kind, btn) => {
                            if (kind === 'remove') {
                                if (entry.category === 'accessory') C.unequipAccessory();
                                else if (entry.category === 'hat') C.unequipHat();
                                else C.unequipJewelry(id);
                                audioSys.sfx('ui'); renderTab(activeTab);
                            } else if (kind === 'equip') {
                                C.equip(id); audioSys.sfx('ui'); renderTab(activeTab);
                            } else if (kind === 'buy') {
                                this._confirmTap(btn, 'Confirm?', () => {
                                    if (C.buy(id, this)) {
                                        audioSys.sfx('ui'); C.equip(id); this._shopJust = id;
                                        this._shopBalance('cosmetics-shop-balance', this.currency);
                                        renderTab(activeTab);
                                    } else showMessage('INSUFFICIENT PERSONICS');
                                });
                            }
                        };
                        card.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); act(b.dataset.act, b); }));
                        // A tap on an owned card equips it (or takes an optional piece off)
                        card.addEventListener('click', () => {
                            if (!C.isOwned(id)) return;
                            act(C.isEquipped(id) ? (['accessory', 'hat', 'jewelry'].includes(entry.category) ? 'remove' : null) : 'equip');
                        });
                    });
                };

                tabs.forEach(t => { t.onclick = () => { audioSys.sfx('ui'); renderTab(t.dataset.tab); }; });
                renderTab(activeTab);

                document.getElementById('cosmetics-shop-close').onclick = () => {
                    this._shopShow('cosmetics-shop-overlay', false);
                    this.pauseSystem.release('cosmetics_shop');
                };
            },

            // Render augments management in the sidebar screen (dossier classes: styles/dossier.css)
            renderAugmentManagement() {
                const container = document.getElementById('augments-screen-content');
                if (!container) return;
                const A = this.augments;
                let html = `<div class="df-section"><span><span class="glint">◆</span>Augment Slots</span><span class="count">${A.equipped.length} / ${A.maxSlots} equipped</span></div>`;
                html += '<div class="df-tiles">';
                for (let i = 0; i < A.maxSlots; i++) {
                    const id = A.equipped[i], aug = id ? AUGMENT_CATALOG.find(a => a.id === id) : null;
                    html += aug ? `<div class="df-tile"><div class="ico">${aug.icon}</div><div class="lbl">${aug.name}</div></div>`
                                : `<div class="df-tile empty"><div class="lbl">Empty</div></div>`;
                }
                html += '</div>';

                html += `<div class="df-section"><span>Installed</span><span class="count">${A.owned.length}</span></div>`;
                if (A.owned.length === 0) {
                    html += `<div class="df-empty">No augments installed.<div class="df-hint">Visit Dr. Yin's clinic to purchase cybernetic augments.</div></div>`;
                } else {
                    for (const id of A.owned) {
                        const aug = AUGMENT_CATALOG.find(a => a.id === id);
                        if (!aug) continue;
                        const isEq = A.isEquipped(id);
                        html += `<div class="df-card${isEq ? ' lit' : ''}"><div class="df-head">`;
                        html += `<div class="note-ico">${aug.icon}</div><div class="grow">`;
                        html += `<div class="eyebrow">Slot · ${aug.slot}</div><div class="title">${aug.name}</div><div class="desc">${aug.desc}</div></div>`;
                        html += `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">${isEq ? '<span class="df-chip active">● Active</span>' : ''}`;
                        html += `<button class="df-btn${isEq ? ' ghost' : ''}" data-aug="${id}" data-act="${isEq ? 'unequip' : 'equip'}">${isEq ? 'Unequip' : 'Equip'}</button></div>`;
                        html += `</div></div>`;
                    }
                }
                container.innerHTML = html;
                container.querySelectorAll('button[data-aug]').forEach(b => b.addEventListener('click', () => {
                    A[b.dataset.act](b.dataset.aug); this.renderAugmentManagement();
                }));
            },

            /** A contact or crew avatar: their painted bust (getPortraitDataURL), else a script monogram. */
            _dfAvatar(name, acc, big) {
                let inner;
                try {
                    const cfg = this.resolvePortraitConfig(name);
                    inner = cfg && !cfg.isFallback ? `<img alt="" src="${this.getPortraitDataURL(name, big ? 128 : 72)}">` : null;
                } catch (e) { inner = null; }
                if (!inner) inner = `<div class="mono">${(name || '?').replace(/^(Dr\.|Barista|Chef)\s+/, '').charAt(0)}</div>`;
                return `<div class="df-avatar${big ? ' big' : ''}" style="--acc:${acc}">${inner}${big ? '' : '<span class="dot"></span>'}</div>`;
            },

            // Render contacts screen in the sidebar
            renderContactsScreen() {
                const container = document.getElementById('contacts-screen-content');
                if (!container) return;

                // Category determination from role/name
                const getCategory = (name, role) => {
                    if (role === 'medic' || name === 'Dr. Yin') return 'medics';
                    if (['dancer', 'red_demon_dancer'].includes(role)) return 'companions';
                    if (role === 'bartender') return 'associates';
                    if (['Mirabel', 'Anavia', 'Contractor'].includes(name)) return 'clients';
                    if (role === 'teammate') return 'teammates';
                    if (['747', 'Victoria', 'Yenna', 'Sabrina', 'Max', 'Josh'].includes(name)) return 'teammates';
                    if (['Barista Ren', 'Chef Koda', 'LUVSH4D3', 'Torque', 'Prisma', 'Biggs'].includes(name)) return 'associates';
                    if (role && role.includes('robot')) return 'associates';
                    return 'associates';
                };

                // Build NPC role lookup from known NPCs
                const knownRoles = {};
                for (const npc of (this.npcs || [])) { knownRoles[npc.name] = npc.role; }
                for (const tm of (this.teammates || [])) { knownRoles[tm.name] = 'teammate'; }

                const categories = { clients: [], teammates: [], companions: [], associates: [], medics: [] };
                const catLabels = { clients: 'Clients', teammates: 'Teammates', companions: 'Companions', associates: 'Associates', medics: 'Medics' };
                const roleLabels = { clients: 'Client', teammates: 'Crew', companions: 'Companion', associates: 'Associate', medics: 'Medic' };
                // Category accents, inside the scheme: gold, lavender, rose, lilac-grey, mint
                const catColors = { clients: '#ffc248', teammates: '#cab0fa', companions: '#f0a6c8', associates: '#b9aec4', medics: '#9be8dc' };

                // Populate from phone message history
                if (typeof phoneSystem !== 'undefined' && phoneSystem.messageHistory) {
                    for (const [name, messages] of Object.entries(phoneSystem.messageHistory)) {
                        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
                        const lastText = lastMsg ? (lastMsg.text || lastMsg) : '';
                        const displayText = typeof lastText === 'string' ? lastText : '';
                        const role = knownRoles[name] || 'civilian';
                        const cat = getCategory(name, role);
                        if (categories[cat]) categories[cat].push({ name, lastMsg: displayText, role });
                    }
                }

                let html = '';
                let totalContacts = 0;

                for (const [cat, contacts] of Object.entries(categories)) {
                    if (contacts.length === 0) continue;
                    totalContacts += contacts.length;
                    const color = catColors[cat];
                    html += `<div class="df-section"><span>${catLabels[cat]}</span><span class="count">${contacts.length}</span></div><div class="df-grid">`;
                    for (const c of contacts) {
                        html += `<div class="df-card accent" style="--acc:${color}"><div class="df-person">${this._dfAvatar(c.name, color)}<div class="who">`;
                        html += `<div class="name">${c.name}</div><div class="role">${roleLabels[cat]}</div>`;
                        if (c.lastMsg) html += `<div class="desc quote">“${c.lastMsg}”</div>`;
                        html += `</div></div></div>`;
                    }
                    html += `</div>`;
                }

                if (totalContacts === 0) {
                    html = '<div class="df-empty">No contacts yet.<div class="df-hint">Talk to people to add them to your contacts.</div></div>';
                }

                container.innerHTML = html;
            },

            // =========================================================
            //  TEAM MANAGEMENT SCREEN
            //  ---------------------------------------------------------
            //  Two sections:
            //  1. FREELANCER CREW — permanent teammates (Victoria, etc.)
            //     Shows status, HP, weapon, relationship meter, recruit btn
            //  2. HIRED GUNS — temporary dancers/mercs with time remaining
            //     Shows active hires, dismiss button, empty slot count
            // =========================================================
            renderTeamScreen() {
                const container = document.getElementById('team-screen-content');
                if (!container) return;

                const self = this;
                let html = '';

                // ══════════════════════════════════════════════════
                //  FREELANCER CREW (Permanent Teammates)
                // ══════════════════════════════════════════════════
                const crew = this.teammates || [];
                html += `<div class="df-section"><span><span class="glint">◆</span>Freelancer Crew</span><span class="count">${crew.filter(t => t.recruited).length} active</span></div>`;

                if (crew.length === 0) {
                    html += `<div class="df-empty">No crew members found.</div>`;
                } else {
                    html += `<div class="df-grid">`;
                    for (let i = 0; i < crew.length; i++) {
                        const tm = crew[i];
                        const isRecruited = tm.recruited;
                        const hpPercent = Math.max(0, Math.round((tm.hp / tm.maxHp) * 100));
                        const relPercent = Math.max(0, Math.min(100, tm.relationship || 0));
                        const weaponName = tm.equippedWeaponId && ITEM_REGISTRY[tm.equippedWeaponId]
                            ? ITEM_REGISTRY[tm.equippedWeaponId].name : 'Unarmed';

                        // Relationship rank label
                        let relRank = 'Stranger';
                        if (relPercent >= 80) relRank = 'Bonded';
                        else if (relPercent >= 60) relRank = 'Trusted';
                        else if (relPercent >= 40) relRank = 'Familiar';
                        else if (relPercent >= 20) relRank = 'Acquaintance';

                        const status = tm.downed ? '<span class="df-chip crimson">✕ Downed</span>' : isRecruited ? '<span class="df-chip active">● Active</span>' : '<span class="df-chip info">○ Standby</span>';
                        html += `<div class="df-card${isRecruited ? '' : ' dim'}"><div class="df-person">${this._dfAvatar(tm.name, isRecruited ? '#cab0fa' : '#b9aec4')}<div class="who">`;
                        html += `<div class="name">${tm.name}</div><div class="role">${weaponName}</div></div>${status}</div>`;
                        if (tm.bio) html += `<div class="desc">${tm.bio}</div>`;
                        html += `<div class="df-bar-label"><span>Vitals</span><span>${hpPercent}%</span></div><div class="df-bar crimson${hpPercent ? '' : ' zero'}"><i style="--v:${hpPercent}%"></i></div>`;
                        html += `<div class="df-bar-label"><span>Bond · ${relRank}</span><span>${relPercent} / 100</span></div><div class="df-bar gold${relPercent ? '' : ' zero'}"><i style="--v:${relPercent}%"></i></div>`;
                        html += `<div style="display:flex;justify-content:flex-end;margin-top:12px;">`;
                        html += isRecruited ? `<button class="df-btn ghost team-btn-dismiss-tm" data-index="${i}">Stand Down</button>`
                                            : `<button class="df-btn team-btn-recruit-tm" data-index="${i}">Recruit</button>`;
                        html += `</div></div>`;
                    }
                    html += `</div>`;
                }

                // ══════════════════════════════════════════════════
                //  HIRED GUNS (Temporary — Dancers/Mercs)
                // ══════════════════════════════════════════════════
                const maxHires = 5;
                const activeHires = this.hiredDancers || [];

                html += `<div class="df-section"><span>Hired Guns</span><span class="count">${activeHires.length} / ${maxHires}</span></div>`;

                if (activeHires.length === 0) {
                    html += `<div class="df-empty">No hired guns on payroll.<div class="df-hint">Visit the nightclub or VIP lounges to hire dancers as temporary muscle. 400 PP / 8 hours.</div></div>`;
                } else {
                    html += `<div class="df-grid">`;
                    for (let i = 0; i < activeHires.length; i++) {
                        const d = activeHires[i];
                        const minsLeft = Math.max(0, (d.hireTime || 0) - this.worldMinutes);
                        const timeStr = `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`;
                        const hpPercent = Math.max(0, Math.round((d.hp / d.maxHp) * 100));
                        const isLowTime = minsLeft < 60;
                        const isDemon = d.role === 'red_demon_dancer';
                        const acc = isDemon ? '#ff4a5e' : '#f0a6c8';

                        html += `<div class="df-card accent" style="--acc:${acc}"><div class="df-person">${this._dfAvatar(d.name, acc)}<div class="who">`;
                        html += `<div class="name">${d.name}</div><div class="role">${isDemon ? 'Red Demon' : 'Dancer'}</div></div>`;
                        html += `<span class="df-chip ${isLowTime ? 'crimson' : 'info'}">${timeStr} left</span></div>`;
                        html += `<div class="df-bar-label"><span>Vitals</span><span>${hpPercent}%</span></div><div class="df-bar crimson${hpPercent ? '' : ' zero'}"><i style="--v:${hpPercent}%"></i></div>`;
                        html += `<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="df-btn danger team-btn-dismiss-hire" data-index="${i}">Dismiss</button></div>`;
                        html += `</div>`;
                    }
                    html += `</div>`;
                    const emptySlots = maxHires - activeHires.length;
                    if (emptySlots > 0) html += `<div class="df-pager" style="margin-top:12px;">${emptySlots} open slot${emptySlots > 1 ? 's' : ''}</div>`;
                }

                container.innerHTML = html;

                // ── WIRE BUTTONS (double-tap confirmation) ──
                // First tap arms the button (crimson "ARE YOU SURE?"), the second executes; it disarms after 2.5 s
                const confirmTap = (btn, onConfirm) => {
                    btn.addEventListener('click', () => {
                        if (btn.dataset.confirm === 'true') { onConfirm(); return; }
                        btn.dataset.confirm = 'true';
                        btn._origText = btn.textContent;
                        btn.textContent = 'Are you sure?';
                        btn.classList.add('confirm');
                        btn._resetTimer = setTimeout(() => {
                            btn.dataset.confirm = '';
                            btn.textContent = btn._origText;
                            btn.classList.remove('confirm');
                        }, 2500);
                    });
                };

                // Recruit teammate (instant — no confirmation needed)
                container.querySelectorAll('.team-btn-recruit-tm').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tm = self.teammates[parseInt(btn.dataset.index)];
                        if (tm) {
                            tm.recruited = true;
                            showMessage(`${tm.name.toUpperCase()} RECRUITED.`);
                            self.renderTeamScreen();
                        }
                    });
                });

                // Stand down teammate (double-tap)
                container.querySelectorAll('.team-btn-dismiss-tm').forEach(btn => {
                    confirmTap(btn, () => {
                        const tm = self.teammates[parseInt(btn.dataset.index)];
                        if (tm) {
                            tm.recruited = false;
                            tm.inCar = false;
                            showMessage(`${tm.name.toUpperCase()} STANDING DOWN.`);
                            self.renderTeamScreen();
                        }
                    });
                });

                // Dismiss hired companion (double-tap)
                container.querySelectorAll('.team-btn-dismiss-hire').forEach(btn => {
                    confirmTap(btn, () => {
                        const dancer = self.hiredDancers[parseInt(btn.dataset.index)];
                        if (dancer) {
                            self.dismissCompanion(dancer);
                            showMessage(`${dancer.name.toUpperCase()} DISMISSED.`);
                            self.renderTeamScreen();
                        }
                    });
                });
            },

            // =========================================================
            //  CHARACTER SCREEN
            //  ---------------------------------------------------------
            //  Displays player identity, live stats with buff modifiers,
            //  active buffs with time remaining, and equipped augments.
            // =========================================================
            renderCharacterScreen() {
                const container = document.getElementById('character-screen-content');
                if (!container) return;

                let html = '';
                const fmt = v => typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(2)) : v;
                const row = (k, v) => `<div class="df-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

                // ══════════════════════════════════════════════════
                //  IDENTITY
                // ══════════════════════════════════════════════════
                const cos = this.cosmetics, nm = id => (COSMETICS_REGISTRY[id]?.name || '—');
                html += `<div class="df-section"><span><span class="glint">◆</span>Identity</span></div>`;
                html += `<div class="df-card"><div class="df-person">${this._dfAvatar('949', '#e3ad8f', true)}<div class="who">`;
                html += `<div class="title script">Stella</div><div class="eyebrow" style="margin-top:2px;">949 · Freelancer · Age 24</div>`;
                html += `<div class="df-chips" style="margin-top:8px;"><span class="df-chip gold">Silver Queen Apartments</span><span class="df-chip info">Southern Dimensions City</span></div>`;
                html += `</div></div>`;
                html += `<div class="df-rows" style="margin-top:12px;">`;
                html += row('Outfit', cos ? nm(cos.equippedOutfit) : '—');
                html += row('W.I.G', cos ? nm(cos.equippedWig) : '—');
                html += row('S.K.I.N', cos ? nm(cos.equippedSkin) : '—');
                html += row('V.O.C.A.L', cos ? nm(cos.equippedVocal) : '—');
                html += row('H.A.T', cos && cos.equippedHat ? nm(cos.equippedHat) : '—');
                html += row('J.E.W.E.L.R.Y', cos && cos.equippedJewelry.length ? cos.equippedJewelry.map(id => COSMETICS_REGISTRY[id]?.name).filter(Boolean).join(', ') : '—');
                html += `</div></div>`;

                // ══════════════════════════════════════════════════
                //  STATS
                // ══════════════════════════════════════════════════
                html += `<div class="df-section"><span>Stats</span></div><div class="df-card">`;

                const hp = this.playerHealth ?? 0;
                const maxHp = this.maxPlayerHealth ?? 100;
                const hpPct = Math.max(0, Math.round((hp / maxHp) * 100));
                html += `<div class="df-bar-label" style="margin-top:0;"><span>Vitals</span><span>${hp} / ${maxHp}</span></div><div class="df-bar crimson${hpPct ? '' : ' zero'}"><i style="--v:${hpPct}%"></i></div>`;

                // Stat rows with buff comparison
                const baseSpeed = this.player?.speed ?? 5.2;
                const finalSpeed = this.player?.buffSystem?.getStat('speed', baseSpeed) ?? baseSpeed;
                const baseFlitDist = 120;
                let finalFlitDist = this.player?.buffSystem?.getStat('flitDistance', baseFlitDist) ?? baseFlitDist;
                if (this.augments && this.augments.isEquipped('flit_ext')) finalFlitDist *= 1.3;
                if (this.resonance) finalFlitDist = this.resonance.stat('flitDistance', finalFlitDist);
                const baseFlitCost = this.flitState?.dashCost ?? 40;
                const finalFlitCost = this.flitCost ? this.flitCost() : baseFlitCost;
                const baseDetect = 1.0;
                const finalDetect = this.player?.buffSystem?.getStat('detectionRange', baseDetect) ?? baseDetect;

                const statRow = (label, base, final, unit, lowerIsBetter) => {
                    const modified = Math.abs(final - base) > 0.001;
                    const better = lowerIsBetter ? final < base : final > base;
                    let v = modified ? `<span class="was">${fmt(base)}</span>${fmt(final)}<span class="diamond">◆</span>` : `${fmt(final)}`;
                    if (unit) v += `<span class="unit">${unit}</span>`;
                    return `<div class="df-row"><span class="k">${label}</span><span class="v${modified ? (better ? ' up' : ' down') : ''}">${v}</span></div>`;
                };

                const weapId = this.inventory?.equippedWeaponId;
                const weapName = weapId && typeof ITEM_REGISTRY !== 'undefined' && ITEM_REGISTRY[weapId] ? ITEM_REGISTRY[weapId].name : 'Unarmed';
                const attId = this.inventory?.equippedAttachmentId;
                const attName = attId && typeof ITEM_REGISTRY !== 'undefined' && ITEM_REGISTRY[attId] ? ITEM_REGISTRY[attId].name : 'None';

                html += `<div class="df-rows" style="margin-top:8px;">`;
                html += statRow('Speed', baseSpeed, finalSpeed, '', false);
                html += statRow('Flit Distance', baseFlitDist, finalFlitDist, 'px', false);
                html += statRow('Flit Cost', baseFlitCost, finalFlitCost, '/ 120', true);
                html += statRow('Detection', baseDetect, finalDetect, '×', true);
                html += row('Weapon', weapName);
                html += row('Attachment', attName);
                html += row('Stims', `${this.boosterCount ?? 0} / ${this.getEffectiveMaxBoosters?.() ?? 4}`);
                html += row('Currency', `${this.currency ?? 0}<span class="unit">PP</span>`);
                html += row('Scrap', `${this.scrap ?? 0}`);
                html += `</div></div>`;

                // ══════════════════════════════════════════════════
                //  ACTIVE BUFFS
                // ══════════════════════════════════════════════════
                html += `<div class="df-section"><span>Active Buffs</span></div>`;
                const bs = this.player?.buffSystem;
                let buffHtml = '';
                if (bs) {
                    for (const buffId in bs.active) {
                        const buff = bs.active[buffId];
                        if (!buff.active) continue;
                        const config = CONSUMABLES[buffId];
                        if (!config) continue;
                        const minsLeft = Math.max(0, buff.endTime - this.worldMinutes);
                        const timeStr = `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`;
                        buffHtml += `<div class="df-card accent" style="--acc:${config.uiColor || '#f0a6c8'}"><div class="df-head"><div class="title">${config.name}</div><span class="df-chip ${minsLeft < 30 ? 'crimson' : 'info'}">${timeStr} left</span></div>`;
                        buffHtml += `<div class="df-chips" style="margin-top:8px;">`;
                        for (const mod of config.modifiers) {
                            const up = mod.type === 'multiply' && mod.value > 1, down = mod.type === 'multiply' && mod.value < 1;
                            buffHtml += `<span class="df-chip ${up ? 'mint' : 'crimson'}">${up ? '▲' : down ? '▼' : '●'} ${mod.stat} ${mod.type === 'multiply' ? '×' + mod.value : '+' + mod.value}</span>`;
                        }
                        buffHtml += `</div>`;
                        if (buff.shield !== undefined && buff.maxShield) {
                            const shieldPct = Math.round((buff.shield / buff.maxShield) * 100);
                            buffHtml += `<div class="df-bar-label"><span>Shield</span><span>${shieldPct}%</span></div><div class="df-bar gold${shieldPct ? '' : ' zero'}"><i style="--v:${shieldPct}%"></i></div>`;
                        }
                        buffHtml += `</div>`;
                    }
                }
                html += buffHtml ? `<div class="df-grid">${buffHtml}</div>` : `<div class="df-empty">No active buffs.</div>`;

                // ══════════════════════════════════════════════════
                //  EQUIPPED AUGMENTS
                // ══════════════════════════════════════════════════
                html += `<div class="df-section"><span>Augments</span></div>`;
                const eqAugs = (this.augments?.equipped || []).map(id => typeof AUGMENT_CATALOG !== 'undefined' ? AUGMENT_CATALOG.find(a => a.id === id) : null).filter(Boolean);
                html += eqAugs.length ? `<div class="df-chips">${eqAugs.map(a => `<span class="df-chip active">${a.icon} ${a.name} · ${a.slot}</span>`).join('')}</div>`
                                      : `<div class="df-empty">No augments equipped.</div>`;

                container.innerHTML = html;
            },

            // ── STORY/MISSIONS SCREEN ──
            renderStoryScreen() {
                const container = document.getElementById('story-screen-content');
                if (!container) return;

                if (!this._storyView) {
                    this._storyView = { tab: 'main', selectedPart: 1, selectedMission: 1 };
                }
                const sv = this._storyView;
                const storyState = this.story ? this.story.state : { part: 1, chapter: 1, mission: 1, step: 0 };
                let html = '';

                // ── TAB BAR (MAIN / SIDE) ──
                html += `<div class="df-tabs">`;
                for (const tab of ['main', 'side']) html += `<div class="df-tab story-tab${sv.tab === tab ? ' active' : ''}" data-tab="${tab}">${tab}</div>`;
                html += `</div>`;

                if (sv.tab === 'main') {
                    // ── PART SELECTOR ──
                    html += `<div class="df-tabs" style="margin-top:-6px;">`;
                    for (let p = 1; p <= 4; p++) {
                        html += `<div class="df-tab small story-part-btn${sv.selectedPart === p ? ' active' : ''}${STORY_DB[p] ? '' : ' disabled'}" data-part="${p}">Part ${p}</div>`;
                    }
                    html += `</div>`;

                    // ── MISSION CARD ──
                    const partData = STORY_DB[sv.selectedPart];
                    if (partData) {
                        const allMissions = [];
                        for (const chId in partData.chapters) {
                            const ch = partData.chapters[chId];
                            for (const mId in ch.missions) {
                                allMissions.push({ partId: sv.selectedPart, chId: parseInt(chId), mId: parseInt(mId), chapter: ch, mission: ch.missions[mId] });
                            }
                        }

                        const mIdx = Math.max(0, Math.min(sv.selectedMission - 1, allMissions.length - 1));
                        const current = allMissions[mIdx];

                        if (current) {
                            const m = current.mission;
                            const isCurrentMission = sv.selectedPart === storyState.part && current.chId === storyState.chapter && current.mId === storyState.mission;
                            const totalSteps = m.totalSteps || Object.keys(m.steps).length;
                            const currentStep = isCurrentMission ? Math.min(storyState.step, totalSteps) : (sv.selectedPart < storyState.part ? totalSteps : 0);
                            const pct = Math.round((currentStep / totalSteps) * 100);
                            const status = isCurrentMission ? '<span class="df-chip active">● Active</span>' : pct >= 100 ? '<span class="df-chip done">✓ Complete</span>' : '<span class="df-chip locked">○ Locked</span>';

                            html += `<div class="df-card${isCurrentMission ? ' lit' : pct >= 100 ? '' : ' locked'}" style="padding:20px 24px;">`;
                            html += `<div class="df-head"><div class="eyebrow">Part ${current.partId} · Chapter ${current.chId} · Mission ${current.mId}</div>${status}</div>`;
                            html += `<div class="title script" style="margin-top:4px;">${m.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</div>`;
                            if (m.desc) html += `<div class="desc" style="font-style:italic;">${m.desc}</div>`;
                            html += `<div class="df-bar-label"><span>Progress</span><span>${pct}%</span></div><div class="df-bar${pct ? '' : ' zero'}"><i style="--v:${pct}%"></i></div>`;
                            html += `</div>`;

                            // ── NAV ARROWS ──
                            if (allMissions.length > 1) {
                                html += `<div class="df-pager"><span class="df-arrow story-mission-nav${mIdx > 0 ? '' : ' disabled'}" data-dir="-1">◀</span>`;
                                html += `<span>${mIdx + 1} / ${allMissions.length}</span>`;
                                html += `<span class="df-arrow story-mission-nav${mIdx < allMissions.length - 1 ? '' : ' disabled'}" data-dir="1">▶</span></div>`;
                            }

                            // ── INTEL ──
                            if (m.location || m.target) {
                                html += `<div class="df-section"><span><span class="glint">◆</span>Intel</span></div><div class="df-pair">`;
                                if (m.location) {
                                    html += `<div class="df-card gold"><div class="eyebrow">Location</div><div class="title">${m.location}</div>`;
                                    if (m.locationDesc) html += `<div class="desc">${m.locationDesc}</div>`;
                                    html += `</div>`;
                                }
                                if (m.target) {
                                    html += `<div class="df-card gold"><div class="eyebrow">Target</div><div class="title">${m.target}</div>`;
                                    if (m.completionTime) html += `<div class="desc">Est. ${m.completionTime}</div>`;
                                    html += `</div>`;
                                }
                                html += `</div>`;
                            }
                        } else {
                            html += `<div class="df-empty">Content locked.</div>`;
                        }
                    } else {
                        html += `<div class="df-empty">This part has not been unlocked yet.</div>`;
                    }

                } else {
                    // ── SIDE TAB ──
                    html += `<div class="df-section"><span>Optional Content</span></div>`;
                    const mission = this.story?.nsm?.getActiveMission(storyState.part, storyState.chapter, storyState.mission);
                    const optionals = mission?.optional || [];
                    if (optionals.length === 0) {
                        html += `<div class="df-empty">No side content discovered.</div>`;
                    } else {
                        for (const opt of optionals) {
                            const completed = this.story?.completedOptional?.includes(opt.id);
                            html += `<div class="df-card accent" style="--acc:${completed ? '#8e55f5' : '#ffc248'}"><div class="df-head"><div class="grow"><div class="title">${opt.name}</div>`;
                            if (opt.desc) html += `<div class="desc">${opt.desc}</div>`;
                            html += `</div><span class="df-chip ${completed ? 'done' : 'available'}">${completed ? '✓ Done' : 'Available'}</span></div></div>`;
                        }
                    }
                }

                container.innerHTML = html;

                // ── Bind interactions ──
                container.querySelectorAll('.story-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        sv.tab = tab.dataset.tab;
                        this.renderStoryScreen();
                    });
                });

                container.querySelectorAll('.story-part-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const p = parseInt(btn.dataset.part);
                        if (STORY_DB[p]) {
                            sv.selectedPart = p;
                            sv.selectedMission = 1;
                            this.renderStoryScreen();
                        }
                    });
                });

                container.querySelectorAll('.story-mission-nav').forEach(nav => {
                    nav.addEventListener('click', () => {
                        if (nav.classList.contains('disabled')) return;
                        const dir = parseInt(nav.dataset.dir);
                        sv.selectedMission = Math.max(1, sv.selectedMission + dir);
                        this.renderStoryScreen();
                    });
                });
            },

            // ── COLLECTION SCREEN ──
            renderCollectionScreen() {
                const container = document.getElementById('collection-screen-content');
                if (!container) return;

                const totalNotes = Object.keys(NOTE_REGISTRY).length;
                const found = this.foundNotes ? this.foundNotes.length : 0;
                let html = `<div class="df-section"><span><span class="glint">◆</span>Found Notes</span><span class="count">${found} / ${totalNotes} discovered</span></div>`;

                if (!this.foundNotes || this.foundNotes.length === 0) {
                    html += `<div class="df-empty">No notes discovered yet.<div class="df-hint">Explore the world to find letters, briefings, and lore.</div></div>`;
                } else {
                    // Each kind of note keeps a touch of its own colour, inside the scheme
                    const styleColors = {
                        letter: { accent: '#d8c6a2', icon: '📜', kind: 'Letter' },
                        briefing: { accent: '#cab0fa', icon: '📋', kind: 'Briefing' },
                        ancient: { accent: '#e3ad8f', icon: '🔮', kind: 'Ancient' },
                        digital: { accent: '#9be8dc', icon: '💾', kind: 'Digital' }
                    };
                    html += `<div class="df-grid">`;
                    for (const noteId of this.foundNotes) {
                        const note = NOTE_REGISTRY[noteId];
                        if (!note) continue;
                        const sc = styleColors[note.style] || styleColors.letter;
                        html += `<div class="df-card accent clickable collection-note-card" data-note-id="${noteId}" style="--acc:${sc.accent}"><div class="df-head">`;
                        html += `<div class="note-ico">${note.icon || sc.icon}</div><div class="grow"><div class="eyebrow">${sc.kind}</div>`;
                        html += `<div class="title">${note.title}</div>`;
                        html += `<div class="desc" style="margin-top:2px;">by ${note.author || 'Unknown'}</div></div>`;
                        html += `<span class="df-chip info collection-note-indicator">Read</span></div></div>`;
                    }
                    html += `</div>`;

                    // Inline note viewer slot — populates when a card is tapped, no fullscreen
                    // overlay, no pause-state dance. Lives inside the menu's existing scroll
                    // context so the menu stays usable while reading.
                    html += `<div id="collection-note-inline" style="display:none; margin: 14px 0 8px;"></div>`;
                }

                container.innerHTML = html;

                // Bind note card clicks — toggle inline viewer (NOT the fullscreen overlay).
                // The fullscreen overlay is reserved for first-discovery in the world; once a
                // note is in the collection, re-reading should be seamless and stay in-menu.
                container.querySelectorAll('.collection-note-card').forEach(card => {
                    card.addEventListener('click', () => {
                        this.toggleInlineNote(card.dataset.noteId, card);
                    });
                });
            },

            /**
             * Inline note viewer for the COLLECTION screen.
             * Renders a note's content into the persistent slot below the notes list,
             * styled with the same note-{style} CSS classes as the fullscreen overlay.
             * Toggle: clicking the active card again (or its close button) collapses it.
             * 
             * Does NOT touch this.paused — the menu containing this view is already
             * pausing the game; an inline reveal shouldn't re-enter that state machine.
             */
            toggleInlineNote(noteId, cardEl) {
                const slot = document.getElementById('collection-note-inline');
                if (!slot) return;
                
                const container = document.getElementById('collection-screen-content');
                const allCards = container ? container.querySelectorAll('.collection-note-card') : [];
                
                // Toggle close: same card tapped while open
                if (slot.dataset.activeNote === noteId && slot.style.display !== 'none') {
                    slot.style.display = 'none';
                    slot.innerHTML = '';
                    delete slot.dataset.activeNote;
                    allCards.forEach(c => c.classList.remove('selected'));
                    audioSys.sfx('ui');
                    return;
                }
                
                const note = NOTE_REGISTRY[noteId];
                if (!note) return;
                
                // Track discovery (parity with openNote — handles edge case of opening a
                // pre-loaded note that wasn't in foundNotes yet).
                if (!this.foundNotes.includes(noteId)) this.foundNotes.push(noteId);
                
                // Build inline content. Reuses note-{style} classes from the existing
                // overlay so visual identity carries across both viewers.
                const styleClass = `note-${note.style || 'letter'}`;
                let inner = `<div class="df-reader"><div class="${styleClass}" id="collection-note-inline-doc" style="padding: 16px 18px 8px; position: relative;">`;
                
                // Close affordance (top-right). Inline X — small, doesn't compete with
                // the note's typographic header.
                inner += `<div class="collection-note-inline-close" style="position:absolute; top:8px; right:10px; font-size:0.85rem; opacity:0.4; cursor:pointer; padding:4px 8px; line-height:1;">✕</div>`;
                
                // Header (mirrors fullscreen overlay structure but tighter spacing).
                inner += `<div id="note-header" style="text-align:center; padding: 4px 8px 8px;">`;
                if (note.icon) inner += `<div style="font-size:1.4rem; margin-bottom:6px; opacity:0.6;">${note.icon}</div>`;
                if (note.headerDetail) inner += `<div style="font-size:0.5rem; letter-spacing:3px; opacity:0.4; margin-bottom:5px;">${note.headerDetail.toUpperCase()}</div>`;
                inner += `<div style="font-size:0.9rem; letter-spacing:2px; margin-bottom:3px;">${note.title}</div>`;
                if (note.author) inner += `<div style="font-size:0.6rem; opacity:0.5; letter-spacing:1px;">by ${note.author}</div>`;
                inner += `</div>`;
                
                // Body — preserve line breaks, same logic as fullscreen openNote.
                inner += `<div id="note-body" style="padding: 6px 6px 8px; line-height:1.65; font-size:0.85rem;">`;
                inner += note.body.split('\n').map(line => 
                    line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`
                ).join('');
                inner += `</div>`;
                
                // Signature
                if (note.signature) {
                    inner += `<div id="note-signature" style="text-align:right; padding: 0 6px 8px; font-size:0.8rem;">${note.signature}</div>`;
                }
                
                inner += `</div></div>`;
                
                slot.innerHTML = inner;
                slot.style.display = 'block';
                slot.dataset.activeNote = noteId;
                
                // Active-card highlight
                allCards.forEach(c => c.classList.toggle('selected', c.dataset.noteId === noteId));
                
                // Wire close button
                const closeBtn = slot.querySelector('.collection-note-inline-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleInlineNote(noteId, cardEl);
                    });
                }
                
                // Scroll the opened note into view smoothly. matchMedia check avoids the
                // jump on browsers that don't support smooth scrolling (older mobile).
                if (slot.scrollIntoView) {
                    try {
                        slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch (e) {
                        slot.scrollIntoView();
                    }
                }
                
                audioSys.sfx('ui');
            },

            // ── NOTE READING SYSTEM ──
            openNote(noteId) {
                const note = NOTE_REGISTRY[noteId];
                if (!note) return;

                this.pauseSystem.acquire('note_overlay');
                
                // Track discovery
                if (!this.foundNotes.includes(noteId)) {
                    this.foundNotes.push(noteId);
                }

                const overlay = document.getElementById('note-overlay');
                const doc = document.getElementById('note-document');
                const header = document.getElementById('note-header');
                const body = document.getElementById('note-body');
                const sig = document.getElementById('note-signature');

                // Apply style class
                doc.className = `note-${note.style || 'letter'}`;

                // Header
                let headerHtml = '';
                if (note.icon) headerHtml += `<div style="font-size:1.8rem; margin-bottom:8px; opacity:0.6;">${note.icon}</div>`;
                if (note.headerDetail) headerHtml += `<div style="font-size:0.5rem; letter-spacing:3px; opacity:0.4; margin-bottom:6px;">${note.headerDetail.toUpperCase()}</div>`;
                headerHtml += `<div style="font-size:1rem; letter-spacing:2px; margin-bottom:4px;">${note.title}</div>`;
                if (note.author) headerHtml += `<div style="font-size:0.6rem; opacity:0.5; letter-spacing:1px;">by ${note.author}</div>`;
                header.innerHTML = headerHtml;

                // Body — preserve line breaks
                body.innerHTML = note.body.split('\n').map(line => 
                    line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px;">${line}</p>`
                ).join('');

                // Signature
                sig.innerHTML = note.signature ? `<span style="font-size:0.85rem;">${note.signature}</span>` : '';

                // Show
                overlay.style.display = 'block';
                doc.scrollTop = 0;

                // Close on click/tap
                const closeHandler = () => {
                    overlay.style.display = 'none';
                    this.pauseSystem.release('note_overlay');
                    overlay.removeEventListener('click', closeHandler);
                    audioSys.sfx('ui');
                };
                // Delay to prevent immediate close from the interaction click
                setTimeout(() => {
                    overlay.addEventListener('click', closeHandler);
                }, 200);

                audioSys.sfx('ui');
            },

            // --- CRAFTING SYSTEM ---
            openCraftingTable() {
                this.pauseSystem.acquire('crafting');
                this._shopShow('craft-shop', true);
                this._shopBalance('craft-shop-balance', this.scrap, 'Scrap');
                const grid = document.getElementById('craft-shop-grid');
                let html = `<div class="df-section"><span><span class="glint">◆</span>Schematics</span><span class="count">${SCHEMATICS.length}</span></div>`;
                for (const sch of SCHEMATICS) {
                    const owned = this.inventory.items.some(i => i.id === sch.id), canAfford = this.scrap >= sch.scrapCost;
                    const reg = (typeof ITEM_REGISTRY !== 'undefined' && ITEM_REGISTRY[sch.id]) || {};
                    // What it is: its registry stats, as label / value rows
                    const stats = [], st = reg.stats || {};
                    if (reg.type) stats.push(['Type', reg.type]);
                    if (st.damage) stats.push(['Damage', st.damage]);
                    if (st.fireRate) stats.push(['Fire delay', st.fireRate + '<span class="unit">ticks</span>']);
                    if (st.recoil) stats.push(['Recoil', st.recoil]);
                    if (st.dotDamage) stats.push(['Burn', `${st.dotDamage} × ${st.dotTicks || 1}`]);
                    if (st.sticky) stats.push(['Orbs', 'Stick to targets']);
                    if (st.effect === 'laser_sight') stats.push(['Effect', 'Targeting beam']);
                    html += `<div class="df-card${owned ? ' lit' : ''}" data-key="${sch.id}"><div class="df-head">`;
                    html += `<div class="note-ico">${sch.icon || '⊕'}</div><div class="grow"><div class="eyebrow">Schematic</div><div class="title">${sch.name}</div><div class="desc">${sch.desc}</div></div>`;
                    html += `<div class="df-shop-side">${owned ? '<span class="df-chip active">✓ Crafted</span>' : `${this._priceHtml(sch.scrapCost, this.scrap, 'Scrap')}<button class="df-btn small" data-craft="${sch.id}"${canAfford ? '' : ' disabled'}>Craft</button>`}</div></div>`;
                    if (stats.length) html += `<div class="df-rows" style="margin-top:8px;">${stats.map(([k, v]) => `<div class="df-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>`;
                    if (!owned) {
                        const pct = Math.min(100, Math.round(this.scrap / sch.scrapCost * 100));
                        html += `<div class="df-bar-label"><span>Scrap</span><span>${Math.min(this.scrap, sch.scrapCost)} / ${sch.scrapCost}</span></div><div class="df-bar ${canAfford ? 'gold' : ''}${pct ? '' : ' zero'}" style="--v:${pct}%"><i></i></div>`;
                    }
                    html += `</div>`;
                }
                grid.innerHTML = html;
                this._shopFlash(grid);
                grid.querySelectorAll('button[data-craft]').forEach(b => b.addEventListener('click', () => {
                    const sch = SCHEMATICS.find(x => x.id === b.dataset.craft);
                    if (!sch || this.scrap < sch.scrapCost) return;
                    this.scrap -= sch.scrapCost;
                    const craftedItem = createItemFromRegistry(sch.id, this);
                    if (craftedItem) this.inventory.addItem(craftedItem);
                    this.updateUI();
                    showMessage(`CRAFTED: ${sch.name}`);
                    audioSys.sfx('ui');
                    this._shopJust = sch.id;
                    this.openCraftingTable();
                }));
                document.getElementById('craft-shop-close').onclick = () => {
                    this._shopShow('craft-shop', false);
                    this.pauseSystem.release('crafting');
                };
            },

        });
