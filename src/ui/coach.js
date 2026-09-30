        /* =====================================================================
           COACH — points at a piece of the UI and says what it's for
           ---------------------------------------------------------------------
           Spotlight (the first time): the screen dims around the target, a gold
           ring pulses on it, a caption card explains it, and only the target
           can be tapped. Ring (after that): just the ring and a small caption,
           nothing blocked. A ghost thumb can show a drag (the move stick).

             game.coach.point(el, { mode:'spot'|'ring', title, text, until, timeout, ghost })
             game.coach.first(key, el, opts)   spotlight once per key, ring after

           `until` is 'tap' (the target is tapped), a function (game) => bool, or
           omitted (a tap anywhere, or the timeout). Both return a waitable
           ({done(), value()}) so scenes can yield on them. Page level, above the
           cinematic layer (#cine) and below pause.
           ===================================================================== */
        class Coach {
            constructor(game) {
                this.game = game;
                this.taught = new Set();
                this.cur = null;
                this.root = null;
            }

            _build() {
                if (this.root) return;
                const r = this.root = document.createElement('div');
                r.id = 'coach';
                r.innerHTML = '<div class="co-hole"></div>'
                    + '<div class="co-block"></div><div class="co-block"></div><div class="co-block"></div><div class="co-block"></div>'
                    + '<div class="co-ring"><i></i><i></i></div><div class="co-thumb"></div>'
                    + '<div class="co-card"><b></b><span></span></div>';
                document.body.appendChild(r);
                this.hole = r.querySelector('.co-hole');
                this.blocks = [...r.querySelectorAll('.co-block')];
                this.ring = r.querySelector('.co-ring');
                this.thumb = r.querySelector('.co-thumb');
                this.card = r.querySelector('.co-card');
                // A tap on the dim (outside the target) in spotlight mode: nudge the ring
                for (const b of this.blocks) b.addEventListener('pointerdown', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.ring.classList.remove('nudge'); void this.ring.offsetWidth; this.ring.classList.add('nudge');
                });
            }

            /** Spotlight the first time for this key, a ring after. */
            first(key, target, opts = {}) {
                const mode = this.taught.has(key) ? 'ring' : 'spot';
                this.taught.add(key);
                return this.point(target, { ...opts, mode: opts.mode || mode });
            }

            point(target, opts = {}) {
                this._build();
                this.dismiss();
                const c = this.cur = {
                    target, mode: opts.mode || 'spot', until: opts.until, finished: false, result: null,
                    t0: performance.now(), timeout: opts.timeout || (opts.mode === 'ring' ? 6000 : 0)
                };
                const r = this.root;
                r.className = 'show ' + (c.mode === 'spot' ? 'spot' : 'ring');
                r.classList.toggle('ghost', opts.ghost === 'drag');
                this.card.querySelector('b').textContent = opts.title || '';
                this.card.querySelector('span').textContent = opts.text || '';
                this.card.classList.toggle('untitled', !opts.title);
                // Finishing on a tap: the target (passes through the hole) or anywhere
                if (c.until === 'tap' && target) {
                    c.onTap = () => this._finish(c, 'tap');
                    target.addEventListener('pointerdown', c.onTap, { once: true, capture: true });
                    target.addEventListener('click', c.onTap, { once: true, capture: true });
                } else if (!c.until) {
                    c.onTap = (e) => { if (performance.now() - c.t0 > 500) this._finish(c, 'tap'); };
                    setTimeout(() => { if (this.cur === c) window.addEventListener('pointerdown', c.onTap, true); }, 0);
                }
                this._place();
                const tick = () => {
                    if (this.cur !== c || c.finished) return;
                    this._place();
                    if (typeof c.until === 'function' && c.until(this.game)) { this._finish(c, 'done'); return; }
                    if (c.timeout && performance.now() - c.t0 > c.timeout) { this._finish(c, 'timeout'); return; }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
                return { done: () => c.finished, value: () => c.result };
            }

            _finish(c, why) {
                if (c.finished) return;
                c.finished = true; c.result = why;
                if (c.onTap) {
                    window.removeEventListener('pointerdown', c.onTap, true);
                    if (c.target) { c.target.removeEventListener('pointerdown', c.onTap, true); c.target.removeEventListener('click', c.onTap, true); }
                }
                if (this.cur === c) { this.cur = null; if (this.root) this.root.className = ''; }
            }

            /** Drop whatever is showing (a new point, a scene skip, a load). */
            dismiss() { if (this.cur) this._finish(this.cur, 'dismissed'); }

            /** Follow the target: the hole, the blockers, the ring and the card. */
            _place() {
                const c = this.cur; if (!c || !c.target) return;
                const b = c.target.getBoundingClientRect();
                const W = window.innerWidth, H = window.innerHeight, pad = 10;
                const x = b.left - pad, y = b.top - pad, w = b.width + pad * 2, h = b.height + pad * 2;
                const round = Math.abs(b.width - b.height) < 24 && b.width < 140;
                const set = (el, L, T, Wd, Ht) => { el.style.left = L + 'px'; el.style.top = T + 'px'; el.style.width = Math.max(0, Wd) + 'px'; el.style.height = Math.max(0, Ht) + 'px'; };
                set(this.hole, x, y, w, h);
                this.hole.style.borderRadius = round ? '50%' : '22px';
                set(this.blocks[0], 0, 0, W, y);                     // above
                set(this.blocks[1], 0, y + h, W, H - y - h);         // below
                set(this.blocks[2], 0, y, x, h);                     // left
                set(this.blocks[3], x + w, y, W - x - w, h);         // right
                const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
                const rs = round ? Math.max(b.width, b.height) + 26 : 0;
                if (round) { set(this.ring, cx - rs / 2, cy - rs / 2, rs, rs); this.ring.style.borderRadius = '50%'; }
                else { set(this.ring, x - 4, y - 4, w + 8, h + 8); this.ring.style.borderRadius = '26px'; }
                set(this.thumb, cx - 22, cy - 22, 44, 44);
                // The card goes on whichever side has room, clamped to the gutters
                const cw = Math.min(290, W - 32);
                this.card.style.width = cw + 'px';
                const ch = this.card.offsetHeight || 70;
                const below = cy < H / 2;
                let top = below ? y + h + 16 : y - ch - 16;
                if (!below && top < 12) top = Math.min(H - ch - 12, y + h + 16);
                if (b.height > H * 0.45) top = Math.max(12, y + 18);          // a big area (the move zone): inside, at its top
                const left = Math.max(16, Math.min(W - cw - 16, cx - cw / 2));
                this.card.style.left = left + 'px'; this.card.style.top = Math.max(12, Math.min(H - ch - 12, top)) + 'px';
            }

            serialize() { return [...this.taught]; }
            deserialize(list) { this.taught = new Set(Array.isArray(list) ? list : []); }
        }
