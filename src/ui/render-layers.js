        // ═══ RENDER LAYERS — Baseline's panel: every layer of the frame on a chip, with its canvas calls ═══
        // Settings → Developer → Baseline: Layers. While it's on, draw() asks RenderLayers.at(key) before
        // each layer: the answer is whether that layer draws, and the canvas calls since the last ask are
        // billed to the layer before it. With Baseline off, at() is true and bills nothing.
        // The chips show calls a frame (averaged over 30 frames, the top three lit gold); the header the
        // frame's total and its ms, so switching a layer off shows what it costs in calls and in time.

        // [key, chip, group], in draw order (engine/draw.js)
        const RENDER_LAYERS = [
            ['ground', 'Ground', 'World'], ['floors', 'Floors', 'World'], ['walls', 'Walls', 'World'],
            ['reflections', 'Reflections', 'World'], ['decals', 'Decals', 'World'], ['shadows', 'Sun shadows', 'World'],
            ['buildings', 'Buildings', 'World'], ['roofs', 'Roofs', 'World'], ['neon', 'Neon', 'World'],
            ['trees', 'Trees', 'World'], ['lamps', 'Lamps', 'World'],
            ['props', 'Props', 'Things'], ['cars', 'Cars', 'Things'], ['markers', 'Markers', 'Things'],
            ['crowd', 'Crowd', 'People'], ['characters', 'Characters', 'People'], ['stella', 'Stella', 'People'],
            ['combat', 'Combat FX', 'Effects'], ['particles', 'Particles', 'Effects'], ['rings', 'Sound rings', 'Effects'],
            ['lighting', 'Lighting', 'Light'], ['glow', 'Glow', 'Light'], ['edge', 'Map edge', 'Light'],
            ['bloom', 'Bloom', 'Screen'], ['atmosphere', 'Atmosphere', 'Screen'], ['rain', 'Rain', 'Screen'],
            ['bokeh', 'Bokeh', 'Screen'], ['hud', 'HUD', 'Screen']
        ];
        const RENDER_GROUP_COLOUR = { World: '#cab0fa', Things: '#ffc248', People: '#ff8ab8', Effects: '#9be8dc', Light: '#f4e6c8', Screen: '#8fb4ff' };
        // What Baseline drew before it had layers: the ground, Stella, and the screen passes
        const RENDER_BASE = ['ground', 'stella', 'rings', 'bloom', 'atmosphere', 'rain', 'bokeh', 'hud'];
        // Billed but never switched off: the clear and transforms, Debug view's layers, and calls between frames
        const RENDER_BUCKETS = ['frame', 'debug', 'outside'];

        const RenderLayers = {
            active: false, cur: 'outside', mark: 0,
            _on: null, _tally: Object.create(null), _frames: 0, _ms: 0, _msN: 0, _endT: 0,
            _el: null, _chips: null, _shown: Object.create(null), last: null,

            /** The layers she has on (kept per device; Base the first time) */
            layers() {
                if (!this._on) {
                    let saved = null;
                    try { saved = JSON.parse(localStorage.getItem('dfab_render_layers')); } catch (e) { /* private mode */ }
                    this._on = new Set(Array.isArray(saved) ? saved : RENDER_BASE);
                }
                return this._on;
            },
            _save() { try { localStorage.setItem('dfab_render_layers', JSON.stringify([...this._on])); } catch (e) { /* private mode */ } },

            /** From here the frame's calls are `key`'s; true when that layer draws (always outside Baseline,
                and always for the frame's own calls and Debug view's) */
            at(key) {
                if (!this.active) return true;
                const c = RenderStats.calls;
                this._tally[this.cur] = (this._tally[this.cur] || 0) + c - this.mark;
                this.mark = c; this.cur = key;
                return this._on.has(key) || key === 'frame' || key === 'debug';
            },

            /** Top of draw(): after a pause, what the menus drew between frames isn't the game's */
            beginFrame() {
                if (!this.active) return;
                if (this._endT && performance.now() - this._endT > 250) this.mark = RenderStats.calls;
                this.at('frame');
            },

            /** End of draw(): bill the last layer, time the frame, and refresh the panel every 30 frames */
            endFrame() {
                if (!this.active) return;
                this.at('outside');
                const now = performance.now(), dt = this._endT ? now - this._endT : 0;
                if (dt > 0 && dt < 250) { this._ms += dt; this._msN++; }
                this._endT = now;
                if (++this._frames >= 30) this._show();
            },

            /** Show or hide the panel to match Settings → Baseline, and with it the call counter */
            sync(game) {
                const want = !!GameSettings.baseline;
                if (want && !this.active) this._reset();
                this.active = want;
                this.layers();
                if (want) this._ensure();
                if (this._el) this._el.style.display = want ? '' : 'none';
                document.body.classList.toggle('dev-render', want);
                if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);   // the counter runs while the panel is open
                if (want) this.mark = RenderStats.calls;
            },

            _reset() {
                this._tally = Object.create(null); this._frames = 0; this._ms = 0; this._msN = 0; this._endT = 0;
                this.cur = 'outside'; this.mark = RenderStats.calls;
            },

            /** Switch to a preset: everything, what Baseline drew before, or nothing */
            preset(name) {
                const L = this.layers(); L.clear();
                for (const [k] of RENDER_LAYERS) if (name === 'all' || (name === 'base' && RENDER_BASE.includes(k))) L.add(k);
                this._save(); this._paintOn();
            },

            toggle(key) {
                const L = this.layers();
                if (L.has(key)) L.delete(key); else L.add(key);
                this._save(); this._paintOn();
            },

            _ensure() {
                if (this._el) return;
                const el = document.createElement('div'); el.id = 'dev-render';
                const groups = [];
                for (const [k, name, g] of RENDER_LAYERS) {
                    let grp = groups.find(x => x.g === g);
                    if (!grp) groups.push(grp = { g, chips: [] });
                    grp.chips.push(`<button class="rl-chip" data-layer="${k}" style="--c:${RENDER_GROUP_COLOUR[g]}"><span>${name}</span><b></b></button>`);
                }
                el.innerHTML = '<div class="rl-head"><span class="rl-title">Baseline</span><b class="rl-total">--</b><span>calls</span><b class="rl-ms">--</b><span>ms</span>'
                    + '<button class="rl-fold" title="Fold">▾</button></div>'
                    + '<div class="rl-body"><div class="rl-presets"><button data-preset="all">All</button><button data-preset="base">Base</button><button data-preset="none">None</button></div>'
                    + groups.map(x => `<div class="rl-group"><i>${x.g}</i>${x.chips.join('')}</div>`).join('')
                    + '<div class="rl-foot"></div></div>';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (e.target.closest('.rl-fold')) { el.classList.toggle('folded'); return; }
                    const p = e.target.closest('[data-preset]'); if (p) { this.preset(p.dataset.preset); return; }
                    const b = e.target.closest('[data-layer]'); if (b) this.toggle(b.dataset.layer);
                });
                DevOverlay.dock().prepend(el);
                this._el = el;
                this._chips = Object.fromEntries([...el.querySelectorAll('[data-layer]')].map(b => [b.dataset.layer, { el: b, n: b.querySelector('b') }]));
                this._totalEl = el.querySelector('.rl-total'); this._msEl = el.querySelector('.rl-ms'); this._footEl = el.querySelector('.rl-foot');
                this._shown = Object.create(null);
                this._paintOn();
            },

            /** Light the chips that draw; the ones that don't lose their number */
            _paintOn() {
                if (!this._chips) return;
                const L = this.layers();
                for (const k in this._chips) {
                    const c = this._chips[k], on = L.has(k);
                    c.el.classList.toggle('on', on);
                    if (!on) { c.el.classList.remove('hot'); c.n.textContent = ''; this._shown[k] = undefined; }
                }
            },

            /** Calls a frame for each layer over the last 30 frames; the three heaviest lit */
            _show() {
                const T = this._tally, F = this._frames, avg = Object.create(null);
                let total = 0;
                for (const k in T) { avg[k] = T[k] / F; total += avg[k]; }
                const ms = this._msN ? this._ms / this._msN : 0;
                this._tally = Object.create(null); this._frames = 0; this._ms = 0; this._msN = 0;
                this.last = { avg, total, ms };
                if (!this._el) return;
                const L = this.layers();
                const hot = RENDER_LAYERS.map(([k]) => k).filter(k => L.has(k) && (avg[k] || 0) >= 1)
                    .sort((a, b) => avg[b] - avg[a]).slice(0, 3);
                for (const k in this._chips) {
                    if (!L.has(k)) continue;
                    const c = this._chips[k], n = Math.round(avg[k] || 0);
                    if (this._shown[k] !== n) { c.n.textContent = n.toLocaleString(); this._shown[k] = n; }
                    c.el.classList.toggle('hot', hot.includes(k));
                }
                const tt = Math.round(total).toLocaleString(), mt = ms ? ms.toFixed(1) : '--';
                if (this._totalEl.textContent !== tt) this._totalEl.textContent = tt;
                if (this._msEl.textContent !== mt) this._msEl.textContent = mt;
                const foot = RENDER_BUCKETS.filter(k => k !== 'debug' || (avg.debug || 0) >= 1)
                    .map(k => `<span>${k} <b>${Math.round(avg[k] || 0).toLocaleString()}</b></span>`).join('');
                if (this._footHtml !== foot) { this._footEl.innerHTML = foot; this._footHtml = foot; }
            }
        };
