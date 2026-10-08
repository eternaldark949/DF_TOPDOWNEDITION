        // ═══ PROP SPRITES — furniture painted once, stamped every frame ═══
        // A piece of furniture's vector art (entities/props-decor.js) is about 30 canvas calls; its sprite is one
        // drawImage, five when it's turned. Each prop keeps its own sprite (p._spr), so art seeded from where it
        // stands stays right, and a piece she drags keeps its look; it's repainted when what it shows changes
        // (_searched, _switchState). The vector art still draws whenever a sprite would be wrong or soft: while
        // one is pending, zoomed in past PROP_SPRITE.ZOOM_MAX (a finisher, photo zoom, a scene's close-up), with
        // Settings → Developer → Prop Sprites off, and for the animated pieces in PROP_LIVE.
        // Moving parts: PROP_LOOP pieces are painted as phase frames of their one period (each frame the first
        // time it's due, so no one frame pays for them all); split pieces mark
        // their drawer with PropPass.seg(live), and the still runs between the live parts become sprites,
        // stamped in their place, so what moves keeps its depth among what doesn't.

        const PROP_SPRITE = {
            S: 2,                       // sprite pixels per world unit (the view is ~1–1.5 indoors in play)
            PAD: 8,                     // world px round the box: the +3/+4 drop shadows, lips, line widths
            ZOOM_MAX: 2.2,              // above this the vector art draws (sharp in a close-up)
            BUDGET_MS: 3,               // painting a frame may spend; the rest wait (drawn as vector meanwhile)
            MAX_BYTES: 48 * 1048576,    // past this no new sprites (vector instead)
            BLUR_DRIFT: 0.25,           // a glow's blur is device px: repaint when the view's zoom drifts this far
            RETRY_MS: 1000              // a webfont not loaded yet: try the paint again this much later
        };
        // Pieces that reach further past their box than PAD (world px)
        const PROP_PAD = {
            apt_vanity: 13, apt_planter: 11, apt_fireplace: 10, apt_bed: 9,
            ps_suitcase: 27, ps_piano: 16, ps_wardrobe: 16, ps_telescope: 11, mc_coatcheck: 17, mc_lost_purse: 11, mc_dj: 9,
            dn_lost_luggage: 14, dn_palm: 10, cc_fireplace: 13, cc_plant: 12, cc_sacks: 9, hod_chair: 10, sc_fallen: 11, sc_altar: 9,
            dp_throne: 31, dp_pool: 9, dp_embers: 9, light_switch: 10, vending_machine: 12, medbay_refill: 14
        };
        // One period of the sway, painted as `frames` phase frames
        const PROP_LOOP = {
            apt_plant: { period: 2 * Math.PI / 0.8, frames: 10 }, plant: { period: 2 * Math.PI / 0.8, frames: 10 },
            cc_plant: { period: 2 * Math.PI / 0.8, frames: 10 }, dn_palm: { period: 2 * Math.PI / 0.8, frames: 10 },
            mc_rope: { period: 2 * Math.PI / 1.4, frames: 12 }, apt_telescope: { period: 2 * Math.PI / 0.2, frames: 48 }
        };
        // Animated pieces left as vector art (true, or true while the test holds); the comment says what moves
        const PROP_LIVE = {
            hod_candelabra: true, hod_altar: true, hod_console: true, hod_fountain: true, hod_coffin: true, hod_reliquary: true,   // flames, crystal, ripples, glow, bob
            hod_table: p => !!(p.decor && p.decor.candles),                                                                      // candle flames
            dn_float_chaise: true, dn_float_chair: true, dn_fountain: true,                                                      // hover bob, rings and rift
            dn_lost_luggage: p => !p._searched,                                                                                  // the tag swings until opened
            mc_stage: true, mc_dj: true, mc_speaker: true, mc_orb: true, mc_vanity: true,                                        // the beat, needles, bulbs, craters
            mc_lost_clutch: p => !p._searched,                                                                                   // sequins
            ps_fireplace: true, ps_tub: true, ps_pool: true,                                                                     // embers, petal ring, ripples
            sc_altar: true, sc_candles: true, sc_brazier: true,                                                                  // flames and coals
            cc_espresso: true, cc_fireplace: true, cc_record: true, cc_stove: true,                                              // gauge, embers, arc, flame
            monitor: true,                                                                                                       // the trace
            dp_pool: true, dp_pillar: true, dp_brazier: true, dp_fountain: true, dp_altar: true, dp_embers: true                 // ripples, arc, fire, jets, embers
        };

        /**
         * The segments of a split piece's drawer. Every segment draws in the plain vector pass (mode 0). Painting
         * (mode 1) draws only still run `run`; stamping (mode 2) puts each still run's sprite where the run starts
         * and draws the live segments as vector.
         */
        const PropPass = {
            mode: 0, run: 0, idx: -1, still: false, live: false, runs: null, ctx: null, x: 0, y: 0, pad: 0, dw: 0, dh: 0,
            /** The next segment: `live` when it moves. True when it's to be drawn as vector now. */
            seg(live) {
                if (this.mode === 0) return true;
                if (live) { this.still = false; this.live = true; return this.mode === 2; }
                if (!this.still) {
                    this.still = true; this.idx++;
                    if (this.mode === 2) { const cv = this.runs[this.idx]; if (cv) this.ctx.drawImage(cv, this.x - this.pad, this.y - this.pad, this.dw, this.dh); }
                }
                return this.mode === 1 && this.idx === this.run;
            },
            _begin(mode, run) { this.mode = mode; this.run = run; this.idx = -1; this.still = false; this.live = false; }
        };

        const PropSprites = {
            density: 1, bytes: 0, _spent: 0,
            _bake: { k: 1, blur: false, bad: false, retry: false },

            /** Once a frame, before the props: the view's zoom (backing px per world unit) and a fresh budget */
            frame(zoom) { this.density = zoom || 1; this._spent = 0; },

            /** Whether a piece is painted once, and how: 'still' (one sprite, or the runs of a split drawer), 'loop', or null (vector) */
            kindOf(p) {
                const k = p.decorType;
                if (k) {
                    if (k.startsWith('gy_')) return null;                 // gravestones keep their own sprite (_gySprite)
                    const live = PROP_LIVE[k];
                    if (live === true || (live && live(p))) return null;
                    return PROP_LOOP[k] ? 'loop' : 'still';
                }
                const it = p.interactionType;
                return it === 'light_switch' || it === 'vending_machine' || it === 'medbay_refill' ? 'still' : null;
            },

            /** Draw a prop from its sprite; false when its vector art should draw instead (PropEntity.draw) */
            stamp(ctx, p) {
                if (PropPass.mode !== 0 || GameSettings.propSprites === false) return false;
                let s = p._spr;
                if (!s || s.sw !== p._switchState || s.se !== p._searched) s = this._plan(p, s);
                if (s.vector || s.never || this.density > PROP_SPRITE.ZOOM_MAX) return false;
                if (s.loop) {                                            // the phase frame for now, painted the first time it's needed
                    const L = s.loop, k = Math.round(((_frameTime / 1000) % L.period) / L.period * L.frames) % L.frames;
                    const cv = (s.runs && s.runs[k]) || (this._spent < PROP_SPRITE.BUDGET_MS && !(s.retryAt && performance.now() < s.retryAt) ? this._paintFrame(p, s, k) : null);
                    if (!cv) return false;
                    this._stampOne(ctx, p, s, cv);
                    return true;
                }
                const drift = s.blur && Math.abs(this.density / s.D - 1) > PROP_SPRITE.BLUR_DRIFT;
                if (!s.ready || drift) {
                    if (!(s.retryAt && performance.now() < s.retryAt) && this._spent < PROP_SPRITE.BUDGET_MS) this._paint(p, s);
                    if (!s.ready) return false;
                }
                if (s.split) {                                           // its drawer, with the still runs stamped (PropPass)
                    const PP = PropPass;
                    PP._begin(2, 0); PP.runs = s.runs; PP.ctx = ctx; PP.x = p.x; PP.y = p.y; PP.pad = s.pad; PP.dw = s.dw; PP.dh = s.dh;
                    try { p.draw(ctx); } finally { PP.mode = 0; PP.runs = null; PP.ctx = null; }
                    return true;
                }
                this._stampOne(ctx, p, s, s.runs[0]);
                return true;
            },

            _stampOne(ctx, p, s, cv) {
                if (!p.angle) { ctx.drawImage(cv, p.x - s.pad, p.y - s.pad, s.dw, s.dh); return; }
                ctx.save(); ctx.translate(p.x + p.width / 2, p.y + p.height / 2); ctx.rotate(p.angle);
                ctx.drawImage(cv, -p.width / 2 - s.pad, -p.height / 2 - s.pad, s.dw, s.dh);
                ctx.restore();
            },

            /** (Re)decide how a prop is drawn, after a change in what it shows */
            _plan(p, old) {
                if (old && old.runs) this.bytes -= old.bytes || 0;
                const kind = this.kindOf(p), pad = PROP_PAD[p.decorType || p.interactionType] || PROP_SPRITE.PAD;
                const S = PROP_SPRITE.S, W = Math.ceil((p.width + 2 * pad) * S), H = Math.ceil((p.height + 2 * pad) * S);
                return p._spr = { vector: !kind, sw: p._switchState, se: p._searched, pad, W, H, dw: W / S, dh: H / S,
                    loop: kind === 'loop' ? PROP_LOOP[p.decorType] : null, ready: false, never: false, split: false, runs: null, bytes: 0, blur: false, D: 1, retryAt: 0 };
            },

            /** Paint one phase frame of a loop; null when it can't be (memory, a composite, a webfont not in yet) */
            _paintFrame(p, s, k) {
                const t0 = performance.now(), B = this._bake, L = s.loop;
                if (this.bytes + s.W * s.H * 4 > PROP_SPRITE.MAX_BYTES) return null;
                B.k = PROP_SPRITE.S / Math.max(0.5, this.density); B.blur = false; B.bad = false; B.retry = false;
                const cv = this._canvas(p, s, 0, k * L.period / L.frames * 1000);
                this._spent += performance.now() - t0;
                if (B.bad) { s.never = true; return null; }
                if (B.retry) { s.retryAt = performance.now() + PROP_SPRITE.RETRY_MS; return null; }
                if (!s.runs) s.runs = new Array(L.frames);
                s.runs[k] = cv; s.bytes += s.W * s.H * 4; this.bytes += s.W * s.H * 4;
                return cv;
            },

            /** Paint a prop's sprites (its still runs); the old ones stay until the new are whole */
            _paint(p, s) {
                const t0 = performance.now(), B = this._bake, S = PROP_SPRITE.S;
                if (this.bytes - s.bytes + s.W * s.H * 4 > PROP_SPRITE.MAX_BYTES) { if (!s.ready) s.never = true; return; }
                B.k = S / Math.max(0.5, this.density); B.blur = false; B.bad = false; B.retry = false;
                const runs = [this._canvas(p, s, 0)];
                const n = PropPass.idx + 1;                                 // still runs the drawer marked (none: it's all still)
                const split = PropPass.live || n > 1;
                for (let r = 1; r < n && !B.bad; r++) runs.push(this._canvas(p, s, r));
                this._spent += performance.now() - t0;
                if (B.bad) { s.never = true; return; }                       // a composite a sprite can't keep: vector it stays
                if (B.retry) { s.retryAt = performance.now() + PROP_SPRITE.RETRY_MS; return; }   // its webfont isn't in yet
                const bytes = runs.length * s.W * s.H * 4;
                this.bytes += bytes - s.bytes;
                s.runs = runs; s.bytes = bytes; s.split = split; s.ready = true; s.retryAt = 0; s.blur = B.blur; s.D = this.density;
            },

            /** One sprite: the prop unturned, world mapped onto the canvas round its box; `t` sets the clock for a loop frame */
            _canvas(p, s, run, t) {
                const S = PROP_SPRITE.S, cv = document.createElement('canvas'); cv.width = s.W; cv.height = s.H;
                const c = cv.getContext('2d');
                c.setTransform(S, 0, 0, S, (s.pad - p.x) * S, (s.pad - p.y) * S);
                const angle = p.angle, clock = _frameTime;
                PropPass._begin(1, run);
                try { p.angle = 0; if (t !== undefined) _frameTime = t; p.draw(this._proxy(c)); }
                catch (e) { this._bake.bad = true; }
                finally { p.angle = angle; _frameTime = clock; PropPass.mode = 0; }
                return cv;
            },

            /** The painting context: a glow's blur scaled to look as it does on screen, a composite a sprite can't
                keep marks the piece, a webfont still loading asks for another try */
            _proxy(c) {
                const B = this._bake, bound = new Map();
                return new Proxy(c, {
                    get(o, k) {
                        const v = o[k];
                        if (typeof v !== 'function') return v;
                        let f = bound.get(k); if (!f) bound.set(k, f = v.bind(o));
                        return f;
                    },
                    set(o, k, v) {
                        if (k === 'shadowBlur') { if (v > 0) B.blur = true; v *= B.k; }
                        else if (k === 'globalCompositeOperation') { if (v !== 'source-over') B.bad = true; }
                        else if (k === 'font' && typeof document !== 'undefined' && document.fonts && document.fonts.check && !document.fonts.check(v)) B.retry = true;
                        o[k] = v;
                        return true;
                    }
                });
            },

            /** Let go of every sprite (a map change, a reset, the setting turned off) */
            clear(props) {
                if (props) for (const p of props) if (p) p._spr = undefined;
                this.bytes = 0;
            },

            /** Paint ahead (the map's fade): `props` now, ignoring the frame budget */
            prepare(props, zoom) {
                if (GameSettings.propSprites === false) return;
                const d = this.density; this.density = zoom || 1;
                for (const p of props) {
                    if (!p || !p.visible) continue;
                    const s = (!p._spr || p._spr.sw !== p._switchState || p._spr.se !== p._searched) ? this._plan(p, p._spr) : p._spr;
                    if (s.vector || s.never) continue;
                    if (s.loop) { for (let k = 0; k < s.loop.frames && !s.never; k++) if (!(s.runs && s.runs[k])) this._paintFrame(p, s, k); }
                    else if (!s.ready) this._paint(p, s);
                }
                this.density = d;
            }
        };
