        /* =====================================================================
           CINEMATIC DIALOGUE — how scenes look (styles/cinematic.css)
           ---------------------------------------------------------------------
           No box: subtitles in a lower third over a soft scrim, the speaker's name
           in their colour, a living portrait cameo on their side (the listener's
           dimmed opposite), choices stacked on the right, title cards on black,
           a place-and-time marker, and a hold-to-skip chip.

           Everything here is paced by tick() (one sim tick), so a paused game
           freezes it too. The scene runner (story/scene-runner.js) is the only
           caller; it gets back waitables ({ done(), value() }) to yield on.
           ===================================================================== */
        class CinematicDialogue {
            constructor(game) {
                this.game = game;
                this.root = null;
                this.tapped = false;          // a tap since the last tick
                this.blackT = 0; this.blackTo = 0; this.blackStep = 0;
                this.line = null; this.choice = null; this.cardS = null; this.markerS = null;
                this.cast = { left: null, right: null };
                this.skipHold = 0; this.skipHeld = false; this.onSkip = null;
            }

            _build() {
                if (this.root) return;
                const el = (tag, id, cls, parent) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; (parent || this.root).appendChild(e); return e; };
                this.root = document.createElement('div'); this.root.id = 'cine'; document.body.appendChild(this.root);
                this.memEl = el('div', 'cine-memory');            // the flashback's vignette and grain (memory())
                this.blackEl = el('div', 'cine-black');
                this.tapEl = el('div', 'cine-tap');
                this.scrim = el('div', 'cine-scrim');
                this.cams = {};
                for (const side of ['left', 'right']) {
                    const c = el('div', null, 'cine-cameo ' + side); const cv = el('canvas', null, null, c); cv.width = cv.height = 220;
                    el('div', null, 'cine-cameo-rim', c);
                    this.cams[side] = { el: c, canvas: cv, who: null, face: null, last: '' };
                }
                this.sub = el('div', 'cine-sub');
                this.nameEl = el('div', null, 'cine-name', this.sub);
                this.textEl = el('div', null, 'cine-text', this.sub);
                this.nextEl = el('div', null, 'cine-next', this.sub); this.nextEl.textContent = '◆';
                this.choicesEl = el('div', 'cine-choices');
                this.cardEl = el('div', 'cine-card');
                this.markerEl = el('div', 'cine-marker');
                this.skipEl = el('div', 'cine-skip'); this.skipEl.innerHTML = '<span>HOLD TO SKIP</span><i></i>';
                const tap = e => { e.preventDefault(); e.stopPropagation(); this.tapped = true; };
                this.tapEl.addEventListener('pointerdown', tap); this.cardEl.addEventListener('pointerdown', tap); this.sub.addEventListener('pointerdown', tap);
                window.addEventListener('keydown', e => {
                    if (!this.game.scenes || !this.game.scenes.running) return;
                    if (this.choice && /^[1-9]$/.test(e.key)) { this._pick(+e.key - 1); return; }
                    if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') this.tapped = true;
                });
                const hold = on => e => { e.preventDefault(); e.stopPropagation(); this.skipHeld = on; };
                this.skipEl.addEventListener('pointerdown', hold(true));
                for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) this.skipEl.addEventListener(ev, hold(false));
            }

            // ── Black ────────────────────────────────────────────────────────
            /** Fade the black layer to `to` (0..1) over `frames` ticks (0 = at once). ease 'out': quick at
             *  first, settling softly (the picture is there almost at once, the last of the dark lingers). */
            black(to, frames, ease) {
                this._build();
                this.blackEl.style.transition = 'none';
                this.blackTo = to; this.blackStep = frames ? Math.abs(to - this.blackT) / frames : 1;
                this.blackFrom = this.blackT; this.blackP = 0; this.blackN = frames || 1; this.blackEase = ease || null;
                if (!frames) this.blackT = to;
                this.blackEl.style.opacity = this.blackT;
            }
            fading() { return Math.abs(this.blackT - this.blackTo) > 0.001; }
            /** After a scene: let the black go by itself (real time), whatever the game does next. */
            releaseBlack(frames) {
                this._build();
                const ms = frames * 16.7;
                this.blackTo = this.blackT = 0;
                this.blackEl.style.transition = `opacity ${ms}ms ease ${Math.round(ms * 0.6)}ms`;
                this.blackEl.style.opacity = 0;
            }

            // ── Memory (a flashback's look) ──────────────────────────────────
            /** Ease the flashback grade to `to` (0..1): the world cooler and softer, a vignette, grain. */
            memory(to, frames) {
                this._build();
                this.memTo = to; this.memK = this.memK || 0;
                this.memStep = frames ? Math.abs(to - this.memK) / frames : 1;
                if (!frames) { this.memK = to; this._applyMemory(); }
            }
            memoryEasing() { return Math.abs((this.memK || 0) - (this.memTo || 0)) > 0.001; }
            _applyMemory() {
                const k = this.memK || 0;                           // the world's own grade takes it from here (draw.js filter chain)
                this.memEl.style.opacity = k.toFixed(3);
                this.memEl.classList.toggle('on', k > 0.001);
            }

            // ── Lines ────────────────────────────────────────────────────────
            /** A line: typed out; a tap completes it, the next tap moves on (or it moves on by itself with auto). */
            say(who, text, opts = {}) {
                this._build();
                if (who === null) opts = { ...opts, noCameo: true };                 // narration: the novel's own voice, no name
                const C = who === null ? { name: '', look: null, color: '#e8c27a', side: 'right' }
                        : SCENE_CAST[who] || { name: String(who).toUpperCase(), look: who, color: '#e8c27a', side: 'right' };
                this.sub.classList.toggle('narr', who === null);
                const side = opts.side || C.side || 'right', other = side === 'left' ? 'right' : 'left';
                this.nameEl.innerHTML = '';
                const n = document.createElement('span'); n.textContent = C.name; n.style.color = C.color; this.nameEl.appendChild(n);
                if (opts.offscreen) { const v = document.createElement('em'); v.textContent = 'VOICE'; this.nameEl.appendChild(v); }
                this.sub.style.setProperty('--who', C.color);
                this.sub.classList.add('show'); this.scrim.classList.add('show'); this.sub.classList.remove('done');
                this.tapEl.classList.add('on');
                // Cameos: the speaker lit on their side; whoever spoke last on the other side stays, dimmed
                if (opts.offscreen || opts.noCameo) { this._cameo(side, null); }
                else {
                    this._cameo(side, C, opts.mood, text);
                    const L = opts.with ? { id: opts.with, C: SCENE_CAST[opts.with] } : this.cast[other];   // the listener: named, or whoever spoke last
                    if (L && L.C && L.id !== who && !opts.alone) this._cameo(other, L.C, null, null, true); else this._cameo(other, null);
                }
                this.textEl.textContent = '';
                const line = this.line = { text: String(text), shown: 0, speed: opts.speed || 1.35, auto: opts.auto, hold: 0, done: false };
                if (this.game.transcript && C.name) this.game.transcript.add(C.name, line.text, this.game.worldMinutes);
                this.tapped = false;
                return { done: () => line.done };
            }

            _cameo(side, C, mood, text, dim) {
                const cam = this.cams[side];
                if (!C) { cam.el.classList.remove('show', 'dim'); cam.who = null; this.cast[side] = null; return; }
                const changed = cam.who !== C.look;
                cam.who = C.look; this.cast[side] = { id: Object.keys(SCENE_CAST).find(k => SCENE_CAST[k] === C), C };
                cam.el.classList.add('show'); cam.el.classList.toggle('dim', !!dim);
                cam.el.style.setProperty('--who', C.color);
                if (!dim) {
                    let seed = 0; for (const ch of String(C.look)) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
                    const expr = mood || (text ? inferMood(text, C.look) : 'neutral');
                    cam.face = { seed, expression: expr, talkUntil: _gameTimeSec + (text ? Math.min(3.5, 0.35 + text.length * 0.045) : 0) };
                    cam.last = '';
                } else if (changed || !cam.face) { cam.face = { seed: 3, expression: 'neutral', talkUntil: 0 }; cam.last = ''; }
                else cam.face.talkUntil = 0;
                this._paintCameo(cam);
            }

            _paintCameo(cam) {
                if (!cam.who || !cam.face) return;
                const t = _gameTimeSec, f = cam.face;
                const blink = Math.round(blinkAmount(t, f.seed) * 4) / 4;
                const talk = t < f.talkUntil ? Math.round(Math.abs(Math.sin(t * Math.PI * 5.5)) * 4) / 4 * 0.55 : 0;
                const key = cam.who + '|' + blink + '|' + talk + '|' + f.expression;
                if (key === cam.last) return;
                cam.last = key;
                if (this.game.paintPortraitTo) this.game.paintPortraitTo(cam.canvas, cam.who, null, { expression: f.expression, blink, talk });
            }

            // ── Choices ──────────────────────────────────────────────────────
            /** Options on the right; returns the index picked. opts: { timer (ticks), def, weighty: [indices] } */
            choose(options, opts = {}) {
                this._build();
                const ch = this.choice = { picked: -1, timer: opts.timer || 0, left: opts.timer || 0, def: opts.def ?? 0 };
                this.choicesEl.innerHTML = '';
                options.forEach((o, i) => {
                    const row = document.createElement('button'); row.className = 'cine-choice';
                    const weighty = (opts.weighty || []).includes(i);
                    row.innerHTML = `<b>${i + 1}</b><span></span>${weighty ? '<i>◆</i>' : ''}`;
                    row.querySelector('span').textContent = o;
                    row.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this._pick(i); });
                    this.choicesEl.appendChild(row);
                });
                if (ch.timer) { const bar = document.createElement('div'); bar.className = 'cine-timer'; bar.innerHTML = '<i></i>'; this.choicesEl.appendChild(bar); ch.bar = bar.firstChild; }
                this.choicesEl.classList.add('show');
                this.tapEl.classList.remove('on');
                return { done: () => ch.picked >= 0, value: () => ch.picked };
            }
            _pick(i) {
                const ch = this.choice; if (!ch || ch.picked >= 0) return;
                ch.picked = i; this.choice = null;
                const rows = this.choicesEl.querySelectorAll('.cine-choice');
                rows.forEach((r, k) => r.classList.toggle(k === i ? 'picked' : 'gone', true));
                setTimeout(() => this.choicesEl.classList.remove('show'), 260);
            }

            // ── Cards and the marker ─────────────────────────────────────────
            /** Lines on black, one after another; then a tap (or its hold time) and it fades. */
            card(lines, opts = {}) {
                this._build();
                this.cardEl.innerHTML = '';
                this.cardEl.className = opts.style ? 'show ' + opts.style : 'show';
                const els = lines.map(t => { const d = document.createElement('div'); d.className = t === '' ? 'gap' : 'ln'; d.textContent = t; this.cardEl.appendChild(d); return d; });
                if (opts.sign) { const s = document.createElement('div'); s.className = 'sign'; s.textContent = opts.sign; this.cardEl.appendChild(s); els.push(s); }
                const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'tap to continue'; this.cardEl.appendChild(hint);
                const S = this.cardS = { els, i: 0, t: 0, every: opts.every || 70, hold: opts.hold || 0, held: 0, out: 0, done: false, hint };
                this.tapped = false;
                return { done: () => S.done, leaving: () => S.done || S.out > 0 };   // leaving: the tap is in, it's fading out
            }

            marker(place, time, opts = {}) {
                this._build();
                this.markerEl.innerHTML = '<div class="pl"></div><i></i><div class="tm"></div>';
                this.markerEl.querySelector('.pl').textContent = place; this.markerEl.querySelector('.tm').textContent = time || '';
                this.markerS = { t: 0, hold: opts.hold || 360 };
            }

            /** The next tap anywhere. */
            waitTap() { this._build(); this.tapped = false; this.tapEl.classList.add('on'); return { done: () => { if (this.tapped) { this.tapped = false; return true; } return false; } }; }

            showSkip(on, cb) { this._build(); this.skipEl.classList.toggle('show', !!on); this.onSkip = cb || null; this.skipHold = 0; this.skipHeld = false; }

            clear() {
                if (!this.root) return;
                this.sub.classList.remove('show'); this.scrim.classList.remove('show');
                this._cameo('left', null); this._cameo('right', null);
                this.choicesEl.classList.remove('show'); this.choice = null;
                this.cardEl.className = ''; this.cardS = null;
                this.markerEl.classList.remove('show'); this.markerS = null;
                this.tapEl.classList.remove('on'); this.line = null;
            }

            /** Dismiss the subtitle (between beats, when a scene wants the frame clean). */
            hideLine() { if (!this.root) return; this.sub.classList.remove('show'); this.scrim.classList.remove('show'); this._cameo('left', null); this._cameo('right', null); this.tapEl.classList.remove('on'); }

            // ── One tick ────────────────────────────────────────────────────
            tick() {
                if (!this.root) return;
                const tap = this.tapped; this.tapped = false;
                // Black
                if (this.fading()) {
                    if (this.blackEase === 'out') {
                        this.blackP = Math.min(1, this.blackP + 1 / this.blackN);
                        const k = 1 - Math.pow(1 - this.blackP, 3);
                        this.blackT = this.blackP >= 1 ? this.blackTo : this.blackFrom + (this.blackTo - this.blackFrom) * k;
                    } else this.blackT += Math.sign(this.blackTo - this.blackT) * Math.min(this.blackStep, Math.abs(this.blackTo - this.blackT));
                    this.blackEl.style.opacity = this.blackT;
                }
                // Memory grade
                if (this.memoryEasing()) {
                    this.memK += Math.sign(this.memTo - this.memK) * Math.min(this.memStep, Math.abs(this.memTo - this.memK));
                    this._applyMemory();
                }
                // The line
                const L = this.line;
                if (L && !L.done) {
                    if (L.shown < L.text.length) {
                        if (tap) L.shown = L.text.length; else L.shown = Math.min(L.text.length, L.shown + L.speed);
                        this.textEl.textContent = L.text.slice(0, Math.floor(L.shown));
                        if (L.shown >= L.text.length) this.sub.classList.add('done');
                    } else {
                        L.hold++;
                        const auto = L.auto && L.hold > (typeof L.auto === 'number' ? L.auto : 50 + L.text.length * 1.6);
                        if ((tap && L.hold > 3) || auto) { L.done = true; this.tapEl.classList.remove('on'); }
                    }
                }
                for (const side of ['left', 'right']) this._paintCameo(this.cams[side]);
                // Choice timer
                const ch = this.choice;
                if (ch && ch.timer) { ch.left--; if (ch.bar) ch.bar.style.transform = `scaleX(${Math.max(0, ch.left / ch.timer)})`; if (ch.left <= 0) this._pick(ch.def); }
                // Card
                const S = this.cardS;
                if (S && !S.done) {
                    S.t++;
                    if (S.out) { if (++S.out > 40) { S.done = true; this.cardEl.className = ''; } }
                    else if (S.i < S.els.length) {
                        if (S.t >= S.every || (tap && S.t > 8)) { S.els[S.i].classList.add('on'); S.i++; S.t = 0; }
                    } else {
                        S.held++; if (S.held === 40) S.hint.classList.add('on');
                        if ((tap && S.held > 10) || (S.hold && S.held > S.hold)) { S.out = 1; this.cardEl.classList.add('out'); }
                    }
                }
                // Marker: in, hold, out
                const M = this.markerS;
                if (M) { M.t++; if (M.t === 2) this.markerEl.classList.add('show'); if (M.t === M.hold) this.markerEl.classList.remove('show'); if (M.t > M.hold + 90) this.markerS = null; }
                // Hold to skip
                if (this.skipHeld && this.onSkip) {
                    this.skipHold++; this.skipEl.style.setProperty('--k', Math.min(1, this.skipHold / 48));
                    if (this.skipHold >= 48) { const cb = this.onSkip; this.onSkip = null; this.skipHeld = false; cb(); }
                } else if (this.skipHold) { this.skipHold = Math.max(0, this.skipHold - 3); this.skipEl.style.setProperty('--k', this.skipHold / 48); }
            }
        }
