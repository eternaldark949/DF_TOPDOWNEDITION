        // ═══ DEV OVERLAY — the profiler pill and the debug layers ═══
        // Both are DOM, so the colour grade and post-FX never tint them, and they cost
        // next to nothing: the pill's numbers change a few times a second, its breakdown
        // on the profiler's own 30-frame report, the sparkline one column at a time.
        // Settings → Developer: Profiler (Off / Compact / Full), Debug View (on/off).
        // game.dbg(layer) asks whether a debug layer is showing; draw code checks it.

        const DEBUG_LAYERS = [
            ['nav', 'Nav', '#6f8cff'], ['lights', 'Lights', '#f1e8fe'], ['traffic', 'Traffic', '#ffc248'],
            ['projectiles', 'Shots', '#9be8dc'], ['rooms', 'Rooms', '#cab0fa'], ['vision', 'Vision', '#ff8a92'],
            ['hearing', 'Hearing', '#e6dff0'], ['colliders', 'Colliders', '#ff6ab8'], ['labels', 'Labels', '#f4e6c8']
        ];
        const DEBUG_COLOUR = Object.fromEntries(DEBUG_LAYERS.map(([k, , c]) => [k, c]));

        const DevOverlay = {
            _prof: null, _dbg: null, _spark: null, _sctx: null,
            _times: new Float32Array(120), _ti: 0, _last: 0, _n: 0, _report: null,

            /** The layers she has on (kept per device) */
            layers() {
                if (!this._layers) {
                    let saved = null;
                    try { saved = JSON.parse(localStorage.getItem('dfab_debug_layers')); } catch (e) { /* private mode */ }
                    this._layers = new Set(Array.isArray(saved) ? saved : ['nav', 'projectiles', 'vision', 'hearing']);
                }
                return this._layers;
            },
            _saveLayers() { try { localStorage.setItem('dfab_debug_layers', JSON.stringify([...this._layers])); } catch (e) { /* private mode */ } },

            /** Show or hide the pill and the layer panel to match the settings */
            sync(game) {
                game._syncProfiler();
                const mode = game.showProfiler ? (GameSettings.profilerMode && GameSettings.profilerMode !== 'off' ? GameSettings.profilerMode : 'compact') : 'off';
                if (mode !== 'off') this._ensureProf();
                if (this._prof) {
                    this._prof.style.display = mode === 'off' ? 'none' : '';
                    this._prof.classList.toggle('full', mode === 'full');
                    this._report = null;
                }
                this._countCalls(this._wantCalls(game));
                if (game.debugMode) this._ensureDbg();
                if (this._dbg) this._dbg.style.display = game.debugMode ? '' : 'none';
                document.body.classList.toggle('dev-debug', !!game.debugMode);
                document.body.classList.toggle('dev-prof-full', mode === 'full');   // (in portrait it shares the column with the dock)
            },

            _ensureProf() {
                if (this._prof) return;
                const el = document.createElement('div'); el.id = 'dev-prof';
                el.innerHTML = '<div class="dp-head"><b class="dp-fps">--</b><span>fps</span><b class="dp-ms">--</b><span>ms</span><canvas class="dp-spark" width="96" height="22"></canvas></div><div class="dp-rows"></div>';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    GameSettings.profilerMode = GameSettings.profilerMode === 'full' ? 'compact' : 'full';
                    this.sync(game);
                });
                document.body.appendChild(el);
                this._prof = el; this._spark = el.querySelector('.dp-spark'); this._sctx = this._spark.getContext('2d');
                this._fpsEl = el.querySelector('.dp-fps'); this._msEl = el.querySelector('.dp-ms'); this._rowsEl = el.querySelector('.dp-rows');
            },

            /** The call counter: the Full profiler with Count Canvas Calls, or Baseline's layer panel */
            _wantCalls(game) {
                return !!(game.showProfiler && GameSettings.profilerMode === 'full' && GameSettings.countCalls)
                    || (typeof RenderLayers !== 'undefined' && RenderLayers.active);
            },

            /** One column for the dev panels (Baseline's layers over the Debug chips), so both can be open */
            dock() {
                let d = document.getElementById('dev-dock');
                if (!d) { d = document.createElement('div'); d.id = 'dev-dock'; document.body.appendChild(d); }
                return d;
            },

            _ensureDbg() {
                if (this._dbg) return;
                const el = document.createElement('div'); el.id = 'dev-layers';
                const on = this.layers();
                el.innerHTML = '<div class="dl-head"><span>Debug</span><button class="dl-fold" title="Fold">▾</button></div><div class="dl-chips">'
                    + DEBUG_LAYERS.map(([k, name, c]) => `<button class="dl-chip${on.has(k) ? ' on' : ''}" data-layer="${k}" style="--c:${c}">${name}</button>`).join('')
                    + '</div><div class="dl-counts"></div>';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (e.target.closest('.dl-fold')) { el.classList.toggle('folded'); return; }
                    const b = e.target.closest('[data-layer]'); if (!b) return;
                    const L = this.layers(), k = b.dataset.layer;
                    if (L.has(k)) L.delete(k); else L.add(k);
                    b.classList.toggle('on', L.has(k)); this._saveLayers();
                });
                this.dock().appendChild(el);
                this._dbg = el; this._countsEl = el.querySelector('.dl-counts');
            },

            /** Once per rendered frame, after draw() */
            frame(game) {
                const now = performance.now(), dt = this._last ? now - this._last : 16.7;
                this._last = now;
                if (this._calls) {                        // (a running count: Baseline's layer panel bills from it too)
                    this._callTotal += RenderStats.calls - this._callMark; this._callMark = RenderStats.calls; this._callFrames++;
                }
                if (!game.showProfiler && !game.debugMode) return;
                this._times[this._ti] = dt; this._ti = (this._ti + 1) % this._times.length;
                this._n++;
                if (game.showProfiler && this._prof) {
                    if (this._n % 3 === 0) this._sparkStep(dt);
                    if (this._n % 15 === 0) this._numbers();
                    const rep = game.profiler.report;
                    if (rep !== this._report && this._prof.classList.contains('full')) { this._report = rep; this._rows(game, rep); }
                }
                if (game.debugMode && this._dbg && this._n % 30 === 0) this._counts(game);
            },

            _numbers() {
                let sum = 0, n = 0;
                for (let i = 0; i < 30; i++) { const v = this._times[(this._ti - 1 - i + this._times.length) % this._times.length]; if (v) { sum += v; n++; } }
                const ms = n ? sum / n : 0, fps = ms ? Math.round(1000 / ms) : 0;
                const msT = ms.toFixed(1);
                if (this._fpsEl.textContent !== String(fps)) this._fpsEl.textContent = fps;
                if (this._msEl.textContent !== msT) {
                    this._msEl.textContent = msT;
                    this._prof.dataset.tier = ms < 12 ? 'mint' : ms < 17.5 ? 'gold' : 'crimson';
                }
            },

            /** The sparkline: shift two pixels left, draw this frame's column (scale: 0 – 33 ms) */
            _sparkStep(dt) {
                const c = this._sctx, W = this._spark.width, H = this._spark.height;
                c.globalCompositeOperation = 'copy'; c.drawImage(this._spark, -2, 0); c.globalCompositeOperation = 'source-over';
                const h = Math.max(1, Math.min(H, dt / 33.3 * H));
                c.fillStyle = dt < 12 ? '#9be8dc' : dt < 17.5 ? '#ffc248' : '#ff6a78';
                c.fillRect(W - 2, H - h, 2, h);
                c.fillStyle = 'rgba(241, 232, 254, 0.18)'; c.fillRect(W - 2, Math.round(H - 16.7 / 33.3 * H), 2, 1);   // the 60 fps line
            },

            /** Full mode: the sections, slowest first; the top three lit */
            _rows(game, rep) {
                if (!rep || !rep.length) return;
                const total = rep.find(r => r.label === 'TOTAL_MS');
                const rows = rep.filter(r => r.label !== 'TOTAL_MS' && !(game.profiler.metrics[r.label] || {}).wrapper)
                    .sort((a, b) => b.time - a.time);
                const max = Math.max(4, +rows[0]?.time || 0);
                let html = `<div class="dp-total"><span>Frame work</span><b>${total ? total.time : '--'} ms</b></div>`;
                // At the top, where a phone can see it: what was drawn, and the time spent outside the game's code
                html += `<div class="dp-counts dp-render">${this._renderLine(game, total ? +total.time : 0)}</div>`;
                rows.forEach((r, i) => {
                    const [grp, name] = r.label.includes(':') ? r.label.split(':') : ['', r.label];
                    html += `<div class="dp-row${i < 3 ? ' top' : ''}"><span class="dp-l"><i>${grp}</i>${name}</span><span class="dp-t">${r.time}</span>`
                         + `<span class="dp-bar"><i style="transform:scaleX(${Math.min(1, r.time / max).toFixed(3)})"></i></span></div>`;
                });
                html += `<div class="dp-counts">${this._countLine(game)}</div>`;
                html += `<div class="dp-counts dp-audio">${this._audioLine()}</div>`;
                this._rowsEl.innerHTML = html;
            },

            /**
             * The audio thread, as far as the page can see it: the context's state, buffer mode and
             * latency, voices playing now (and the peak over the last second), sounds started a
             * second, main-thread ms a second spent starting them, and, where Chrome reports it,
             * glitches (output underruns: the crackles and pops).
             */
            /** Bodies drawn / culled this frame, and canvas calls a frame (counted only while Full is open) */
            _renderLine(game, workMs) {
                this._countCalls(this._wantCalls(game));
                const counting = !!this._calls;
                const n = this._callFrames ? Math.round(this._callTotal / this._callFrames) : 0;
                this._callTotal = 0; this._callFrames = 0;
                // frame time (last 30 frames) minus the game's own measured work: raster in the browser's GPU process, GC, the compositor
                let sum = 0, k = 0;
                for (let i = 0; i < 30; i++) { const v = this._times[(this._ti - 1 - i + this._times.length) % this._times.length]; if (v) { sum += v; k++; } }
                const frameMs = k ? sum / k : 0, other = Math.max(0, frameMs - workMs);
                const P = game.pedestrians, T = game.traffic;
                const parts = [
                    `<span>browser/GPU <b>${other.toFixed(1)}</b> ms</span>`,
                    `<span>ticks/frame <b>${RenderStats.ticks}</b></span>`,
                    `<span>bodies <b>${RenderStats.bodies}</b> drawn / <b>${RenderStats.culled}</b> culled</span>`,
                    `<span>live <b>${RenderStats.liveBodies}</b> / sprites <b>${RenderStats.cachedBodies}</b> / bake poses <b>${RenderStats.bakedBodies}</b></span>`,
                    `<span>cars <b>${T ? T.vehicles.length : 0}</b>/${GameSettings.getMaxTraffic()}</span>`,
                    `<span>peds <b>${P ? P.pedestrians.length : 0}</b>/${GameSettings.getMaxPedestrians()}</span>`,
                    `<span>crowd <b>${GameSettings.crowdQuality || 'high'}</b></span>`
                ];
                if (counting) parts.push(`<span>canvas calls <b>${n.toLocaleString()}</b>/frame</span>`);
                // The world: buildings drawn of the map's, the ground tiles held, and the big image caches' memory
                const M = game.activeMap, nb = M && M.buildings ? M.buildings.length : 0;
                if (nb) parts.push(`<span>buildings <b>${RenderStats.bldBase}</b>/${RenderStats.bldTops} of ${nb}</span>`);
                const mem = this._canvasMB(game);
                if (mem.groundN) parts.push(`<span>ground <b>${mem.groundN}</b> tiles (${mem.ground.toFixed(0)} MB)</span>`);
                if (mem.props) parts.push(`<span>furniture sprites <b>${mem.props.toFixed(1)}</b> MB</span>`);
                parts.push(`<span>image caches ≈ <b>${mem.total.toFixed(0)}</b> MB</span>`);
                return parts.join('');
            },

            /** Pixel memory held by the game's big canvas caches (4 bytes a pixel): ground tiles, painted floors,
                car sprites, the baked crowd, furniture sprites. Recounted every half second. */
            _canvasMB(game) {
                const now = performance.now();
                if (this._memAt && now - this._memAt < 500) return this._mem;
                const px = (cv) => cv ? cv.width * cv.height : 0, MB = 4 / 1048576;
                let ground = 0, groundN = 0, floors = 0, cars = 0, crowd = 0;
                const gb = game.groundBaker;
                if (gb) for (const cv of gb.cache.values()) { ground += px(cv); groundN++; }
                if (typeof MAP_BAKES !== 'undefined') { const seen = new Set(); for (const id in MAP_BAKES) for (const k of MAP_BAKES[id]) if (!seen.has(k)) { seen.add(k); floors += px(game[k]); } }
                if (typeof _carSprites !== 'undefined') for (const sp of _carSprites.values()) cars += px(sp.cv);
                if (typeof CrowdImpostors !== 'undefined') for (const b of CrowdImpostors.cache.values()) crowd += px(b.cv);
                const props = typeof PropSprites !== 'undefined' ? PropSprites.bytes / 4 : 0;
                this._mem = { ground: ground * MB, groundN, floors: floors * MB, cars: cars * MB, crowd: crowd * MB, props: props * MB, total: (ground + floors + cars + crowd + props) * MB };
                this._memAt = now;
                return this._mem;
            },

            /** A counting shim on the 2D context's methods (the Full profiler's count, or Baseline's panel; removed when both close) */
            _countCalls(on) {
                const P = CanvasRenderingContext2D.prototype;
                if (on && !this._calls) {
                    this._calls = {}; this._callTotal = 0; this._callFrames = 0; this._callMark = RenderStats.calls;
                    for (const k of Object.getOwnPropertyNames(P)) {
                        const d = Object.getOwnPropertyDescriptor(P, k);
                        if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
                        const f = d.value; this._calls[k] = f;
                        P[k] = function () { RenderStats.calls++; return f.apply(this, arguments); };
                    }
                } else if (!on && this._calls) {
                    for (const k in this._calls) Object.getOwnPropertyDescriptor(P, k) && (P[k] = this._calls[k]);
                    this._calls = null;
                }
            },

            _audioLine() {
                if (typeof audioSys === 'undefined' || !audioSys.stats) return '';
                const c = audioSys.ctx, S = audioSys.stats;
                const lat = Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000);
                const parts = [['audio', c.state === 'running' ? audioSys.bufferMode : c.state], ['latency', lat + ' ms'],
                               ['voices', `${S.live} / ${S.peakSec ?? S.peak}`], ['new/s', S.perSec], ['start ms/s', S.ms.toFixed(1)]];
                const st = c.playbackStats || c.playoutStats;                // the playback-stats API, where the browser has it
                if (st) {
                    const ev = st.underrunEvents ?? st.fallbackFramesEvents, dur = st.underrunDuration ?? st.fallbackDuration;
                    if (ev !== undefined) parts.push(['glitches', ev + (dur ? ` (${Math.round(dur * 1000)} ms)` : '')]);
                } else parts.push(['glitches', 'n/a']);
                return parts.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
            },

            _countLine(game) {
                const R = typeof GameEntity !== 'undefined' ? GameEntity.registry : null;
                const parts = [
                    ['entities', R ? R.all.length : 0], ['collidable', R ? R.collidable.length : 0],
                    ['enemies', game.enemies.length], ['peds', game.pedestrians ? game.pedestrians.pedestrians.length : 0],
                    ['cars', game.traffic ? game.traffic.vehicles.length : 0], ['shots', game.projectiles.length],
                    ['decals', game.decals ? game.decals.decals.length : 0], ['glitter', (game.casings || []).length], ['fx', (game.shotFx || []).length]
                ];
                return parts.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('');
            },

            _counts(game) {
                const R = typeof GameEntity !== 'undefined' ? GameEntity.registry : null;
                const reg = R ? R.collidable.filter(e => e.collisionLayer === GameEntity.LAYER.PROJECTILE).length : 0;
                const chk = typeof CollisionSystem !== 'undefined' ? CollisionSystem.stats : null;
                this._countsEl.innerHTML = `<span>shots <b>${game.projectiles.length}</b> / reg <b>${reg}</b></span>`
                    + (chk ? `<span>checks <b>${chk.totalChecks}</b> resolved <b>${chk.collisionsResolved}</b></span>` : '')
                    + `<span>zoom <b>${(game.camera.zoom || 1).toFixed(2)}</b> room <b>${game.roomSystem && game.roomSystem.currentRoom ? game.roomSystem.currentRoom.label : '—'}</b></span>`;
            }
        };

        engineMixin({
            /** Is this debug layer showing? (debug view on, and the layer chip lit) */
            dbg(layer) { return !!this.debugMode && DevOverlay.layers().has(layer); },

            /**
             * The new debug layers, in world space above the lighting: rooms and doors, vision
             * cones with their state, what each noise reached and who heard it, collision boxes,
             * and labels. One look: thin lines, a colour per layer, small labels on a dark plate.
             */
            drawDebugLayers(ctx) {
                const z = this.camera.zoom || 1, px = 1 / z;
                const label = (txt, x, y, col) => {
                    ctx.font = `${(10 * px).toFixed(2)}px ui-monospace, Consolas, monospace`;
                    const w = ctx.measureText(txt).width + 6 * px;
                    ctx.fillStyle = 'rgba(8, 3, 14, 0.78)'; ctx.fillRect(x - w / 2, y - 7 * px, w, 13 * px);
                    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y);
                };
                ctx.save();
                ctx.lineWidth = px;
                const V = this.view || { x: this.camera.x, y: this.camera.y };
                const hw = this.canvas.width / 2 / z + 60, hh = this.canvas.height / 2 / z + 60;
                const inView = (x, y, m = 0) => x > V.x - hw - m && x < V.x + hw + m && y > V.y - hh - m && y < V.y + hh + m;

                const rs = this.roomSystem;
                if (this.dbg('rooms') && rs && rs.active) {
                    const c = DEBUG_COLOUR.rooms;
                    for (const id in rs.rooms) {
                        const r = rs.rooms[id], cur = rs.currentRoom === r;
                        ctx.strokeStyle = c; ctx.globalAlpha = cur ? 0.95 : 0.5;
                        ctx.setLineDash(cur ? [] : [6 * px, 4 * px]);
                        for (const q of r.rects) ctx.strokeRect(q.x, q.y, q.w, q.h);
                        const q = r.rects[0];
                        ctx.globalAlpha = 1; label(r.label + (r.type ? ' · ' + r.type : ''), q.x + q.w / 2, q.y + 10 * px, c);
                    }
                    ctx.setLineDash([]);
                    for (const d of rs.doors) {
                        ctx.strokeStyle = d.openAmount > 0.5 ? '#9be8dc' : '#ffc248'; ctx.globalAlpha = 0.9;
                        ctx.strokeRect(d.x, d.y, d.w, d.h);
                    }
                    ctx.globalAlpha = 1;
                }

                if (this.dbg('colliders')) {
                    ctx.strokeStyle = DEBUG_COLOUR.colliders; ctx.globalAlpha = 0.6;
                    for (const w of (this.activeMap.walls || [])) if (inView(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h))) ctx.strokeRect(w.x, w.y, w.w, w.h);
                    for (const b of getColliders(this.activeMap)) if (b.w && inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) ctx.strokeRect(b.x, b.y, b.w, b.h);
                    ctx.globalAlpha = 0.9;
                    if (typeof GameEntity !== 'undefined') for (const e of GameEntity.registry.collidable) {
                        if (!e.active || !inView(e.x, e.y)) continue;
                        const r = e.radius || e.collisionRadius || 0;
                        if (r) { ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke(); }
                    }
                    ctx.globalAlpha = 1;
                }

                if (this.dbg('vision')) {
                    for (const e of this.enemies) {
                        if (!e || e.dead || !e._visionCone || !inView(e.x, e.y, 400)) continue;
                        const st = e.state || 'IDLE';
                        const col = st === 'ALERT' || st === 'SUPPRESSING' ? '#ff6a78' : st === 'SUSPICIOUS' || st === 'SEARCHING' ? '#ffc248' : '#cab0fa';
                        const cone = e._visionCone();
                        ctx.strokeStyle = col; ctx.globalAlpha = 0.8;
                        ctx.beginPath(); ctx.moveTo(e.x, e.y); for (const p of cone) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.stroke();
                        if (e.investigateTarget) {
                            ctx.setLineDash([4 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.investigateTarget.x, e.investigateTarget.y); ctx.stroke(); ctx.setLineDash([]);
                            ctx.beginPath(); ctx.arc(e.investigateTarget.x, e.investigateTarget.y, 5 * px, 0, Math.PI * 2); ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                        label(st.toLowerCase() + (e.suspicion ? ' ' + Math.round(e.suspicion) : ''), e.x, e.y - 30, col);
                    }
                }

                if (this.dbg('hearing') && this._dbgNoises) {
                    const N = this._dbgNoises, now = _gameTimeSec;
                    for (let i = N.length - 1; i >= 0; i--) {
                        const n = N[i], age = now - n.t;
                        if (age > 2.5) { N.splice(i, 1); continue; }
                        const a = 1 - age / 2.5;
                        ctx.strokeStyle = DEBUG_COLOUR.hearing; ctx.globalAlpha = 0.55 * a;
                        ctx.setLineDash([5 * px, 5 * px]);
                        ctx.beginPath(); ctx.arc(n.x, n.y, n.reach, 0, Math.PI * 2); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = '#ffc248'; ctx.globalAlpha = 0.9 * a;
                        for (const h of n.heard) { ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(h.x, h.y); ctx.stroke(); }
                        ctx.globalAlpha = a;
                        label(`${n.kind || 'noise'} ${n.reach} · heard ${n.heard.length}`, n.x, n.y - 14 * px, DEBUG_COLOUR.hearing);
                    }
                    ctx.globalAlpha = 1;
                }

                if (this.dbg('labels')) {
                    const c = DEBUG_COLOUR.labels;
                    const tag = (e, name) => { if (e && inView(e.x, e.y)) label(name + (e.hp !== undefined ? ` ${Math.round(e.hp)}${e.maxHp ? '/' + e.maxHp : ''}` : ''), e.x, e.y + 26, c); };
                    for (const e of this.enemies) if (e && !e.dead) tag(e, e.constructor ? e.constructor.name : 'enemy');
                    for (const n of (this.npcs || [])) tag(n, n.name || n.role || 'npc');
                    for (const t of (this.teammates || [])) if (t.recruited && !t.inCar) tag(t, t.name);
                    if (this.player) label(`949 ${Math.round(this.player.x)},${Math.round(this.player.y)}`, this.player.x, this.player.y + 26, '#fff');
                }
                ctx.restore();
            }
        });
