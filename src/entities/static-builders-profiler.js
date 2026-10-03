        // =====================================================================
        //  INTEGRATION HELPERS
        // =====================================================================

        /**
         * Convert existing map walls to StaticEntities.
         */
        function createStaticEntitiesFromWalls(walls) {
            return walls.map(w => new StaticEntity({
                x: w.x,
                y: w.y,
                width: w.w,
                height: w.h,
                data: { color: '#333' }
            }));
        }

        /**
         * Convert existing map buildings to StaticEntities.
         * V2 buildings are expanded into per-section collision shapes.
         */
        function createStaticEntitiesFromBuildings(buildings) {
            const entities = [];
            buildings.forEach(b => {
                if (b.isV2 && b.getCollisionShapes) {
                    // V2: one StaticEntity per section for accurate collision
                    b.getCollisionShapes().forEach(shape => {
                        entities.push(new StaticEntity({
                            x: shape.x,
                            y: shape.y,
                            width: shape.w,
                            height: shape.h,
                            type: 'building',
                            data: { color: '#222', label: b.label }
                        }));
                    });
                } else {
                    // Legacy: single bounding box
                    entities.push(new StaticEntity({
                        x: b.x,
                        y: b.y,
                        width: b.w,
                        height: b.h,
                        type: 'building',
                        data: { color: '#222', label: b.label }
                    }));
                }
            });
            return entities;
        }

        /* =====================================================================
           PERFORMANCE PROFILER (FINAL)
           ---------------------------------------------------------------------
           Tracks execution time. 
           Fixed: Enforces text alignment to prevent "off-screen" rendering.
           ===================================================================== */

        /* ============================================================================
           PERFBENCH — Stage 0 of the resolution-scaling investigation
           ----------------------------------------------------------------------------
           Answers one question with a number: how much of a frame is actually
           spent on PIXELS, versus on JavaScript issuing draw calls?

           This matters because rendering at reduced resolution — the trick DLSS
           and FSR are built on — only pays for the pixel-bound part. Canvas2D
           games are frequently bound by draw-call overhead instead, in which case
           halving the resolution buys far less than people expect.

           METHOD
           Hold the camera still, sweep resolutionScale, and time each of the
           renderer's existing profiler sections at every step. For a section
           costing t1 at native, a run at scale s should cost:

               t(s) = t1 · ( f·s² + (1 − f) )

           where f is the fraction of that section's cost that scales with pixel
           area (s² is the area ratio). Rearranged, the sweep measures f directly:

               f = ( 1 − t(s)/t1 ) / ( 1 − s² )

           f near 1  → pure fill rate. Resolution scaling is a large win.
           f near 0  → pure draw-call/JS. Resolution scaling is nearly free of
                       benefit, and the effort belongs in batching, caching, or
                       culling instead.

           Run it from the pause menu's Profiler button area or the console:
               PerfBench.run()
               PerfBench.run([1, 0.75, 0.5, 0.35], 150)
           ============================================================================ */
        const PerfBench = {
            active: false,
            steps: [],
            stepIndex: 0,
            frameIndex: 0,
            warmupFrames: 45,      // Let GC, shader/texture caches and the FPS settle
            framesPerStep: 120,
            results: null,
            _savedScale: 1.0,
            _status: '',

            /**
             * @param {number[]} scales  Render scales to sweep, native first.
             * @param {number} framesPerStep  Sampled frames per scale (after warmup).
             */
            run(scales = [1.0, 0.75, 0.5], framesPerStep = 120) {
                if (this.active) { showMessage('PERFBENCH ALREADY RUNNING'); return; }
                if (typeof game === 'undefined' || !game.running) {
                    showMessage('PERFBENCH: START A GAME FIRST'); return;
                }
                this._savedScale = GameSettings.resolutionScale || 1.0;
                this.steps = scales.map(sc => ({ scale: sc, samples: {}, frames: 0 }));
                this.stepIndex = 0;
                this.frameIndex = 0;
                this.framesPerStep = framesPerStep;
                this.results = null;
                this.active = true;
                this._applyScale(this.steps[0].scale);
                const total = scales.length * (this.warmupFrames + framesPerStep);
                this._status = 'warming up';
                showMessage(`PERFBENCH: ${scales.length} STEPS, ~${(total / 60).toFixed(0)}s`);
                console.log(`[PerfBench] sweeping ${scales.join(', ')} — hold the camera still.`);
            },

            cancel() {
                if (!this.active) return;
                this.active = false;
                this._applyScale(this._savedScale);
                showMessage('PERFBENCH CANCELLED');
                this.results = null;
            },

            _applyScale(sc) {
                GameSettings.resolutionScale = sc;
                if (typeof game !== 'undefined' && game.resize) game.resize();
            },

            /** Called once per rendered frame with this frame's section costs. */
            sample(deltas) {
                if (!this.active) return;
                const step = this.steps[this.stepIndex];
                if (!step) { this.active = false; return; }

                this.frameIndex++;
                if (this.frameIndex <= this.warmupFrames) {
                    this._status = `warming up ${this.frameIndex}/${this.warmupFrames}`;
                    return;
                }
                this._status = `sampling ${step.frames + 1}/${this.framesPerStep}`;

                for (const label in deltas) {
                    if (!step.samples[label]) step.samples[label] = [];
                    step.samples[label].push(deltas[label]);
                }
                step.frames++;

                if (step.frames >= this.framesPerStep) {
                    this.stepIndex++;
                    this.frameIndex = 0;
                    if (this.stepIndex >= this.steps.length) {
                        this._finish();
                    } else {
                        this._applyScale(this.steps[this.stepIndex].scale);
                    }
                }
            },

            /** Median is used rather than mean — one GC pause shouldn't move the result. */
            _median(arr) {
                if (!arr || !arr.length) return 0;
                const a = arr.slice().sort((x, y) => x - y);
                const m = a.length >> 1;
                return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
            },

            _finish() {
                this.active = false;
                this._applyScale(this._savedScale);

                const base = this.steps[0];
                const labels = Object.keys(base.samples).sort();
                const rows = [];

                for (const label of labels) {
                    const t1 = this._median(base.samples[label]);
                    const row = { label, native: t1, at: {}, f: null };
                    let fBest = null;

                    for (let i = 1; i < this.steps.length; i++) {
                        const st = this.steps[i];
                        const ts = this._median(st.samples[label]);
                        row.at[st.scale] = ts;
                        // Solve f from t(s) = t1(f·s² + 1 − f)
                        if (t1 > 0.01 && st.scale < 0.999) {
                            const f = (1 - ts / t1) / (1 - st.scale * st.scale);
                            // Widest-lever step gives the best signal-to-noise
                            if (fBest === null || st.scale < fBest.scale) {
                                fBest = { scale: st.scale, f };
                            }
                        }
                    }
                    if (fBest) row.f = Math.max(0, Math.min(1, fBest.f));
                    rows.push(row);
                }

                this.results = { rows, scales: this.steps.map(s => s.scale) };
                this._print();
            },

            _print() {
                const { rows, scales } = this.results;
                const total = rows.find(r => r.label === 'Render:Total');
                const pad = (v, n) => String(v).padStart(n);

                console.log('\n=== PerfBench: how much of the frame is PIXELS? ===');
                let head = 'section'.padEnd(20) + pad('native', 9);
                for (let i = 1; i < scales.length; i++) head += pad('@' + scales[i], 9);
                head += pad('pixel-bound', 13);
                console.log(head);
                console.log('-'.repeat(head.length));

                for (const r of rows) {
                    if (r.label === 'Render:Total') continue;
                    let line = r.label.padEnd(20) + pad(r.native.toFixed(2), 9);
                    for (let i = 1; i < scales.length; i++) {
                        line += pad((r.at[scales[i]] ?? 0).toFixed(2), 9);
                    }
                    line += pad(r.f === null ? '—' : (r.f * 100).toFixed(0) + '%', 13);
                    console.log(line);
                }
                if (total) {
                    console.log('-'.repeat(head.length));
                    let line = 'TOTAL'.padEnd(20) + pad(total.native.toFixed(2), 9);
                    for (let i = 1; i < scales.length; i++) {
                        line += pad((total.at[scales[i]] ?? 0).toFixed(2), 9);
                    }
                    line += pad(total.f === null ? '—' : (total.f * 100).toFixed(0) + '%', 13);
                    console.log(line);
                    console.log('\n' + this.verdict());
                }
            },

            /** Plain-language reading of the result. */
            verdict() {
                if (!this.results) return 'No results yet.';
                const total = this.results.rows.find(r => r.label === 'Render:Total');
                if (!total || total.f === null) return 'Inconclusive — frame cost too small to measure.';
                const f = total.f;
                const half = total.native * (f * 0.25 + (1 - f));
                const saved = total.native - half;

                let call;
                if (f >= 0.6) {
                    call = 'FILL-RATE BOUND. Resolution scaling is the right lever — proceed to Stage 1.';
                } else if (f >= 0.3) {
                    call = 'MIXED. Resolution scaling helps but will not rescue a slow device alone; ' +
                           'pair it with static-layer caching.';
                } else {
                    call = 'DRAW-CALL BOUND. Resolution scaling will NOT save you. The win is in ' +
                           'batching, culling and caching the static world layer instead.';
                }
                return `${(f * 100).toFixed(0)}% of render time scales with pixel count.\n` +
                       `At 0.5 scale you would save ~${saved.toFixed(2)}ms/frame ` +
                       `(${total.native.toFixed(2)} -> ${half.toFixed(2)}ms).\n${call}`;
            },

            /** Live overlay while a sweep is running, and the verdict afterwards. */
            /**
             * The bench's card (DOM, bottom centre): progress with Cancel while it runs, the verdict
             * with OK when it's done (OK clears it). Called every frame from draw(); it only touches
             * the DOM when what it shows changes. (ctx, x, y are kept for the old call.)
             */
            draw() {
                let el = this._card;
                if (!this.active && !this.results) { if (el) { el.remove(); this._card = null; } return; }
                if (!el) {
                    el = this._card = document.createElement('div'); el.id = 'bench-card';
                    el.addEventListener('click', (e) => {
                        const act = e.target.closest('[data-bench]')?.dataset.bench;
                        if (act === 'cancel') this.cancel();
                        else if (act === 'ok') this.results = null;
                        if (act) { e.stopPropagation(); this.draw(); }
                    });
                    document.body.appendChild(el);
                }
                let key, html;
                if (this.active) {
                    const step = this.steps[this.stepIndex];
                    key = 'run' + this.stepIndex + this._status;
                    html = `<div class="bc-head">Resolution bench<span>step ${this.stepIndex + 1}/${this.steps.length} · scale ${step ? step.scale : '?'}</span></div>`
                         + `<div class="bc-body">Measuring — hold still<br><i>${this._status}</i></div>`
                         + `<div class="bc-btns"><button class="df-btn ghost" data-bench="cancel">Cancel</button></div>`;
                } else {
                    key = 'done';
                    const v = this.verdict().split('\n').map(t => `<div>${t.replace(/</g, '&lt;')}</div>`).join('');
                    html = `<div class="bc-head">Resolution bench<span>full table in the console</span></div><div class="bc-body">${v}</div>`
                         + `<div class="bc-btns"><button class="df-btn" data-bench="ok">OK</button></div>`;
                }
                if (el._key !== key) { el._key = key; el.innerHTML = html; }
            }
        };
        if (typeof window !== 'undefined') window.PerfBench = PerfBench;

        class Profiler {
            constructor() {
                this.metrics = {};
                this.frameCounts = 0;
                this.report = []; 
            }
        
            /* Per-frame tap used by PerfBench.
               `current` only ever grows within a frame (tick() resets it at frame
               end), so snapshotting at frame start and subtracting at frame end
               yields this frame's cost per section without disturbing the
               existing 30-frame averaging. */
            beginFrame() {
                if (!this._frameStart) this._frameStart = {};
                for (const k in this.metrics) this._frameStart[k] = this.metrics[k].current;
            }
            frameDeltas() {
                const out = {};
                if (!this._frameStart) return out;
                for (const k in this.metrics) {
                    out[k] = this.metrics[k].current - (this._frameStart[k] || 0);
                }
                return out;
            }

            start(label) {
                if (!this.metrics[label]) {
                    this.metrics[label] = { current: 0, avg: 0, open: false, wrapper: false };
                }
                const m = this.metrics[label];
                if (m.open) this._warn(label, 'start() called twice without stop()');
                m.open = true;
                m.startTime = performance.now();
            }
        
            stop(label) {
                const m = this.metrics[label];
                if (!m) return;
                if (!m.open) {
                    // A second stop() would re-measure from a startTime that was
                    // never reset, silently doubling the section. This guard is
                    // how the Physics:Player double-stop was caught.
                    this._warn(label, 'stop() without a matching start()');
                    return;
                }
                m.open = false;
                m.current += performance.now() - m.startTime;
            }

            /** Warn once per label so a bad bound is loud but not spammy. */
            _warn(label, msg) {
                if (!this._warned) this._warned = {};
                const key = label + '|' + msg;
                if (this._warned[key]) return;
                this._warned[key] = true;
                console.warn(`[Profiler] ${label}: ${msg}`);
            }

            /**
             * Add time measured elsewhere (ms). `nested`: it already sits inside another
             * section (sounds started from the AI, say), so it's shown but not added to the total.
             */
            add(label, ms, nested) {
                const m = this.metrics[label] || (this.metrics[label] = { current: 0, avg: 0, open: false, wrapper: false });
                if (nested) m.nested = true;
                m.current += ms;
            }

            /** Mark a label as wrapping other sections so totals don't double-count. */
            markWrapper(label) {
                if (!this.metrics[label]) {
                    this.metrics[label] = { current: 0, avg: 0, open: false };
                }
                this.metrics[label].wrapper = true;
            }
        
            tick() {
                this.frameCounts++;
                if (this.frameCounts >= 30) {
                    this.report = [];
                    let totalFrameTime = 0;
        
                    for (const label in this.metrics) {
                        const m = this.metrics[label];
                        m.avg = m.current / this.frameCounts;
                        // Wrapper sections (Render:Total, Update:Total) already
                        // contain their children. Adding them to the sum counted
                        // the whole render and update passes twice, so TOTAL_MS
                        // read close to double the real frame time.
                        if (!m.wrapper && !m.nested) totalFrameTime += m.avg;
                        
                        this.report.push({ 
                            label: label, 
                            time: m.avg.toFixed(2), 
                            color: this.getColorFor(label) 
                        });
                        m.current = 0;
                    }
                    // Add Total
                    this.report.push({ label: 'TOTAL_MS', time: totalFrameTime.toFixed(2), color: totalFrameTime > 16 ? '#ff5555' : '#ffffff' });
                    this.frameCounts = 0;
                }
            }
        
            getColorFor(label) {
                // Render subcategories (most useful for perf analysis)
                if (label === 'Render:World') return '#44aaff';        // Blue — floor, zones, roads
                if (label === 'Render:Buildings') return '#8888ff';    // Indigo — buildings, walls, indoor
                if (label === 'Render:Entities') return '#00ffaa';     // Green — vehicles, NPCs, player
                if (label === 'Render:Lighting') return '#ff8800';     // Orange — shadow blit, light holes
                if (label === 'Render:PostFX') return '#ff55aa';       // Pink — rain, bokeh, HUD overlays
                if (label.includes('Render')) return '#00f3ff';        // Cyan — Render:Total
                if (label.includes('Physics') || label.includes('Collisions')) return '#ff0055'; 
                if (label.includes('AI') || label.includes('Traffic')) return '#FFD700'; 
                if (label.includes('Input')) return '#cc88ff';
                if (label.includes('Logic')) return '#00ff00'; 
                return '#aaa'; 
            }
        
            draw(ctx, x, y) {
                if (this.report.length === 0) return;
        
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to Screen Space
                
                // --- CRITICAL FIX: FORCE ALIGNMENT ---
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                
                const panelWidth = 320; 
                const rowHeight = 18;
                const panelHeight = 30 + (this.report.length * rowHeight);
                
                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
                ctx.fillRect(x, y, panelWidth, panelHeight);
                ctx.strokeStyle = '#00f3ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, panelWidth, panelHeight);
        
                // Header
                ctx.font = 'bold 13px Consolas, monospace';
                ctx.fillStyle = '#fff';
                ctx.fillText("FRAME PROFILER (16ms = 60fps)", x + 10, y + 8);
        
                // Metrics
                let yOff = 30;
                ctx.font = '12px Consolas, monospace';
                
                for (let r of this.report) {
                    ctx.fillStyle = r.color;
                    // Label
                    ctx.fillText(r.label, x + 10, y + yOff);
                    // Time
                    ctx.fillText(r.time + 'ms', x + 130, y + yOff);
                    
                    // Bar Graph
                    const barWidth = Math.min(parseFloat(r.time) * 8, 100); 
                    ctx.fillRect(x + 190, y + yOff + 2, barWidth, 8);
                    
                    yOff += rowHeight;
                }
                ctx.restore();
            }
        }


