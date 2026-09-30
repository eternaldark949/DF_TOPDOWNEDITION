        // GameEngine — boss intros: the Sanctum's Triumvirate awakens.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        //
        // The bosses spawn dormant (kneeling, eyes dark). The first time: the letterbox comes down, the
        // camera goes to them, their eyes ignite one by one under a title, they rise, the camera comes
        // back to 949, and after a breath of grace they wake one by one — and their first burst still
        // telegraphs. Replays (or once seen) get the short version: no pan, eyes and rising in place.
        // A tap or a key skips to the pan back. Runs on frames (updateBossIntro, from update.js).
        /** The Sanctum's three wardens: where they kneel on the dais (x, y, id, persona). */
        const TRIUMVIRATE = [[360, 330, 0, 'vesper'], [600, 290, 1, 'matins'], [840, 330, 2, 'compline']];

        engineMixin({
            /** Spawn the Triumvirate dormant and play their awakening (the story's first visit, or Grum's replay). */
            spawnTriumvirate(opts = {}) {
                this.bossIntro(TRIUMVIRATE.map(([x, y, id, persona]) => new GatlingGunner(x, y, id, { persona })), opts);
            },

            bossIntro(bosses, opts = {}) {
                const qs = this.questState || {};
                let short = !!(opts.short || qs.sanctumIntroSeen || qs.churchBossDefeated);
                for (const b of bosses) {
                    b.makeDormant();
                    b.navMap = this.activeMap;                    // no clear line: route round the pews for one
                    this.enemies.push(b);
                }
                qs.sanctumIntroSeen = true;
                const names = bosses.map(b => b.bossName).filter(Boolean);
                if (this._bossIntro) short = true;                  // one already running: this set just wakes in place
                (this._bossIntros || (this._bossIntros = [])).push(this._bossIntro = { bosses, short, f: 0, title: opts.title || 'THE TRIUMVIRATE', names, skipped: false,
                                    zoom: this.camera.zoom || 1, woke: 0 });
                if (!short) {
                    this.cutscene.start();
                    const cx = bosses.reduce((s, b) => s + b.x, 0) / bosses.length, cy = bosses.reduce((s, b) => s + b.y, 0) / bosses.length;
                    // Frame all of them, whatever the screen's shape (a portrait phone is narrow)
                    const xs = bosses.map(b => b.x), ys = bosses.map(b => b.y), cw = this.canvas.clientWidth || this.canvas.width, ch = this.canvas.clientHeight || this.canvas.height;
                    const fit = Math.min(cw / (Math.max(...xs) - Math.min(...xs) + 220), ch / (Math.max(...ys) - Math.min(...ys) + 320));
                    this._bossIntro.fit = { x: cx, y: cy + 30, zoom: Math.max(0.45, Math.min(1.35, fit)) };
                    this.cutscene.camTargetX = bosses[0].x; this.cutscene.camTargetY = bosses[0].y; this.cutscene.camZoomTarget = 1.15;   // to the first of them
                    const me = this._bossIntro, skip = () => { if (me.f > 20) me.skipped = true; };
                    this._bossIntroSkip = skip;
                    window.addEventListener('pointerdown', skip); window.addEventListener('keydown', skip);
                }
            },

            /** After the darkness: the wardens' eyes, halo and heat glow through the Sanctum's red gloom. */
            drawBossGlow(ctx) {
                const list = this.enemies && this.enemies.filter(e => e.persona && !e.dead);
                if (!list || !list.length) return;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const e of list) {
                    const W = WARDENS[e.persona], eye = e._eyeK, kneel = 1 - e._riseK, S = e.artScale || 1;
                    const ex = e.x + Math.cos(e.angle) * (7 - 3 * kneel) * S, ey = e.y + Math.sin(e.angle) * (7 - 3 * kneel) * S;
                    const tele = e.isTelegraphing && e.burstCooldown > 0 ? 0.5 : 0;
                    if (eye > 0.02) { ctx.globalAlpha = Math.min(1, 0.4 * eye + 0.5 * (e._igniteFlash || 0) + tele); drawGlow(ctx, ex, ey, (22 + 26 * (e._igniteFlash || 0)) * S, W.eye, 0.3); }
                    ctx.globalAlpha = 0.07 + 0.06 * eye; drawGlow(ctx, e.x, e.y, 30 * S, W.eye, 0);          // their accent, faint, so the three read apart
                    if (e.persona === 'matins' && eye > 0.02) { ctx.globalAlpha = 0.35 * eye; ctx.strokeStyle = W.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(e.x, e.y + (-6 * e._riseK - 2) * S * 1.12, 16 * S * 1.12, 6 * S * 1.12, 0, 0, Math.PI * 2); ctx.stroke(); }
                    if (e._heat > 0.05) { ctx.globalAlpha = 0.5 * e._heat; drawGlow(ctx, e.x + Math.cos(e.angle) * 34 * S, e.y + Math.sin(e.angle) * 34 * S, 16 * S, '255, 150, 60', 0.3); }
                }
                ctx.restore();
            },

            _bossTitle(show) {
                let el = document.getElementById('boss-title');
                if (!el) {
                    el = document.createElement('div'); el.id = 'boss-title';
                    el.innerHTML = '<div class="bt-main"></div><div class="bt-names"></div>';
                    document.body.appendChild(el);
                }
                const I = this._bossIntro;
                if (show && I) { el.querySelector('.bt-main').textContent = I.title; el.querySelector('.bt-names').textContent = I.names.join('  ·  '); }
                el.classList.toggle('show', !!show);
            },

            /** One frame of every running intro (60 per second). */
            updateBossIntro() {
                const list = this._bossIntros || [];
                for (const I of list.slice()) this._stepBossIntro(I);
                this._bossIntros = list.filter(I => !I.done);
                this._bossIntro = this._bossIntros[0] || null;
            },

            _stepBossIntro(I) {
                const f = ++I.f, B = I.bosses;
                const ignite = (b) => { b._eyeT = 1; b._igniteFlash = 1; if (this.weather) this.weather.triggerLightning && this.weather.triggerLightning(); this.triggerShake(5); audioSys.sfx('explode'); };
                const wakeAll = (from) => B.forEach((b, i) => { b._wakeAt = from + i * 18; });
                if (I.short) {
                    // Short: eyes ignite in place, they rise, then wake after the grace
                    B.forEach((b, i) => { if (f === 12 + i * 18) ignite(b); });
                    if (f === 20) this._bossTitle(true);
                    if (f === 60) B.forEach(b => { b._riseT = 1; });
                    if (f === 100) { this._bossTitle(false); wakeAll(110); }
                } else {
                    if (I.skipped && !I.skipAt) { I.skipAt = f; B.forEach(b => { b._eyeT = 1; b._riseT = 1; }); if (!I.backAt) I.backAt = f; }
                    // The camera visits each as its eye ignites, then pulls back to frame all three under the title
                    B.forEach((b, i) => {
                        if (I.skipAt) return;
                        if (f === 20 + i * 40) { this.cutscene.camTargetX = b.x; this.cutscene.camTargetY = b.y; }
                        if (f === 48 + i * 40) ignite(b);
                    });
                    const allLit = 48 + (B.length - 1) * 40;
                    if (!I.skipAt && f === allLit + 16) { this.cutscene.camTargetX = I.fit.x; this.cutscene.camTargetY = I.fit.y; this.cutscene.camZoomTarget = I.fit.zoom; this._bossTitle(true); }
                    if (!I.skipAt && f === allLit + 60) B.forEach(b => { b._riseT = 1; });
                    if (!I.backAt && f === allLit + 110) I.backAt = f;
                    if (I.backAt && f === I.backAt) {                   // the camera comes back to her
                        this._bossTitle(false);
                        this.cutscene.camTargetX = this.player.x; this.cutscene.camTargetY = this.player.y; this.cutscene.camZoomTarget = I.zoom;
                    }
                    if (I.backAt && f === I.backAt + 42) {             // control back; grace; then they wake
                        this.cutscene.end(); this.camera.zoom = I.zoom;
                        window.removeEventListener('pointerdown', this._bossIntroSkip); window.removeEventListener('keydown', this._bossIntroSkip);
                        wakeAll(f + 60);
                    }
                }
                // Wake each at its time (the first burst still waits a full telegraph)
                for (const b of B) if (b.dormant && b._wakeAt && f >= b._wakeAt) { b.awaken(b.telegraphThreshold); I.woke++; }
                if (I.woke >= B.length || B.every(b => b.dead)) I.done = true;
            }
        });
