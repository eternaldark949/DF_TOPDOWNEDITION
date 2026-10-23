        // Whole-loop benchmark. Times CPU submission and presentation cadence separately;
        // browser/compositor/GPU time cannot be measured by synchronous Canvas timers.
        const PerformanceBench = {
            active: false, detailed: true, results: null, _card: null,
            run({ durationMs = 30000, warmupMs = 3000, detailed = true } = {}) {
                if (this.active || PerfBench.active) { showMessage('A BENCHMARK IS ALREADY RUNNING'); return false; }
                if (typeof game === 'undefined' || !game.running || game.paused || document.hidden) {
                    showMessage('START OR RESUME THE GAME FIRST'); return false;
                }
                if (!Number.isFinite(durationMs) || !Number.isFinite(warmupMs) || durationMs < 100 || durationMs > 120000 || warmupMs < 0 || warmupMs > 30000) return false;
                this.detailed = !!detailed;
                this.results = null; this.frames = []; this.maps = new Set();
                this.durationMs = durationMs; this.warmupMs = warmupMs; this.sampledMs = 0;
                this.interruptions = 0; this._previous = null; this._frame = null;
                this.started = performance.now(); this.context = this._context();
                this._saved = { show: game.showProfiler, mode: GameSettings.profilerMode, calls: GameSettings.countCalls, baseline: GameSettings.baseline };
                // Keep diagnostic UI and per-call interception out of the measurement.
                // _syncProfiler enables existing detail hooks independently of this UI.
                game.showProfiler = false; GameSettings.profilerMode = 'off';
                GameSettings.countCalls = false; GameSettings.baseline = false;
                this.active = true; game._syncProfiler();
                if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);
                this._visibility = () => { if (document.hidden) { this._previous = null; this.interruptions++; } };
                document.addEventListener('visibilitychange', this._visibility);
                this.draw(); return true;
            },
            _context() {
                const settings = {};
                for (const k of ['resolutionScale','fpsLimit','baseZoom','lightingQuality','adaptiveLighting','softShadows','bloom','reflections','trafficDensity','pedestrianDensity','crowdQuality','lampShadows','foliageDensity','rainDensity','filmGrain','devicePreset','movingLightCache','crowdHybrid']) settings[k] = GameSettings[k];
                return { map: game.activeMap?.id || 'unknown', viewport: [window.innerWidth, window.innerHeight],
                    canvas: [game.canvas.width, game.canvas.height], dpr: window.devicePixelRatio || 1,
                    browser: navigator.userAgent || 'unknown', cores: navigator.hardwareConcurrency || null,
                    deviceMemoryGB: navigator.deviceMemory || null, jsHeapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
                    effectiveLightingFactor: game._adaptiveLighting?.factor || 1, effectiveReflections: game.reflectQuality ? game.reflectQuality() : null,
                    fonts: { status: document.fonts?.status || 'unknown', greatVibesReady: document.fonts ? document.fonts.check('45px "Great Vibes"') : null },
                    weather: game.weather?.condition || 'unknown', simulation: { stepMs: CONFIG.LOOP.STEP_MS, gameSpeed: CONFIG.LOOP.GAME_SPEED,
                        nominalTicksPerSecond: +(1000 / CONFIG.LOOP.STEP_MS * CONFIG.LOOP.GAME_SPEED).toFixed(3), interpolated: CONFIG.LOOP.INTERPOLATE }, settings };
            },
            beginFrame() {
                if (!this.active) return;
                if (game.paused || document.hidden || game.cineCam) {
                    if (this._previous !== null) this.interruptions++;
                    this._previous = null; this._frame = null; return;
                }
                const now = performance.now();
                const before = {};
                for (const k in game.profiler.metrics) before[k] = game.profiler.metrics[k].current;
                this._frame = { start: now, cadence: null, before, sections: {},
                    warmup: now - this.started < this.warmupMs };
            },
            acceptFrame() {
                if (!this.active || !this._frame) return;
                if (this._frame.warmup) { this._previous = null; return; }
                const now = this._frame.start;
                this._frame.cadence = this._previous === null ? null : now - this._previous;
                this._previous = now;
            },
            afterSimulation() {
                if (!this.active || !this._frame) return;
                const f = this._frame;
                for (const k in game.profiler.metrics) {
                    const ms = game.profiler.metrics[k].current - (f.before[k] || 0);
                    if (ms > 0) f.sections[k] = ms;
                }
            },
            render(deltas) {
                if (!this.active || !this._frame) return;
                for (const k in deltas) this._frame.sections[k] = (this._frame.sections[k] || 0) + deltas[k];
            },
            endFrame(ticks, droppedMs) {
                if (!this.active || !this._frame) return;
                const f = this._frame; this._frame = null;
                if (f.warmup || !(f.cadence > 0)) { this.draw(); return; }
                f.cpu = Math.max(0, performance.now() - f.start);
                f.ticks = ticks; f.droppedMs = Math.max(0, droppedMs || 0);
                f.cars = game.traffic?.vehicles.length || 0; f.pedestrians = game.pedestrians?.pedestrians.length || 0;
                f.bodies = RenderStats.bodies || 0; delete f.before;
                this.frames.push(f); this.sampledMs += f.cadence;
                this.maps.add(game.activeMap?.id || 'unknown');
                if (this.sampledMs >= this.durationMs) this.finish(); else this.draw();
            },
            _restore() {
                this.active = false; this._frame = null;
                if (this._visibility) document.removeEventListener('visibilitychange', this._visibility);
                this._visibility = null;
                if (this._saved) {
                    game.showProfiler = this._saved.show; GameSettings.profilerMode = this._saved.mode;
                    GameSettings.countCalls = this._saved.calls; GameSettings.baseline = this._saved.baseline;
                    this._saved = null; game._syncProfiler();
                    RenderStats.timed = game._profileDetailed;
                    if (typeof DevOverlay !== 'undefined') DevOverlay.sync(game);
                }
            },
            cancel() { if (!this.active) return; this._restore(); this.frames = []; this.draw(); },
            stats(values) {
                if (!values.length) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
                const a = values.slice().sort((x, y) => x - y);
                const at = p => a[Math.max(0, Math.ceil(p * a.length) - 1)];
                return { mean: a.reduce((s, v) => s + v, 0) / a.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: a[a.length - 1] };
            },
            finish() {
                if (!this.active) return;
                const endContext = this._context(); this._restore();
                if (!this.frames.length) { this.draw(); return; }
                const frames = this.frames, stat = key => this.stats(frames.map(f => f[key] || 0));
                const cadence = stat('cadence'), cpu = stat('cpu');
                const labels = new Set(frames.flatMap(f => Object.keys(f.sections)));
                const sections = [...labels].map(label => ({ label, ...this.stats(frames.map(f => f.sections[label] || 0)) }))
                    .sort((a, b) => b.mean - a.mean);
                const targetFps = this.context.settings.fpsLimit > 0 ? Math.min(60, this.context.settings.fpsLimit) : 60;
                const sum = key => frames.reduce((n, f) => n + (f[key] || 0), 0);
                const fps = 1000 / cadence.mean, slow = frames.filter(f => f.cadence > 1000 / targetFps * 1.1).length;
                const findings = [];
                const cost = label => sections.find(s => s.label === label)?.mean || 0;
                if (cost('Update:Total') > 1000 / targetFps * 0.4) findings.push('Simulation takes a substantial part of the frame budget. Compare traffic, pedestrians and physics below.');
                if (cost('Render:Total') > 1000 / targetFps * 0.6) findings.push('Rendering submission is expensive. Compare buildings, entities, lighting and post effects; use Resolution Bench to test pixel sensitivity.');
                if (cadence.mean - cpu.mean > Math.max(4, cadence.mean * 0.3)) findings.push('A substantial interval remains outside measured loop work. This may include the frame cap, display scheduling, browser work or GPU/compositor back-pressure; this report cannot separate them.');
                const dropped = sum('droppedMs'), droppedFraction = dropped / sum('cadence');
                if (droppedFraction > 0.01) findings.push(`Simulation dropped ${dropped.toFixed(2)} ms of accumulated time (${(100 * droppedFraction).toFixed(2)}% of sampled time). This can affect world progression; compare the configured simulation speed below.`);
                else if (dropped > 0) findings.push(`Simulation dropped only ${dropped.toFixed(2)} ms of accumulated time (${(100 * droppedFraction).toFixed(3)}% of sampled time); this alone does not indicate sustained simulation overload.`);
                if (frames.some(f => f.cadence > 50)) findings.push('Frames above 50 ms occurred. Check p95/p99 and the worst frame for stutter severity.');
                if (JSON.stringify(this.context.settings) !== JSON.stringify(endContext.settings)) findings.push('Settings changed during the run; comparisons are less controlled.');
                if (this.maps.size > 1) findings.push('The run crossed multiple maps and may include loading work.');
                if (fps < targetFps * 0.9) findings.unshift(`Average throughput is below the ${targetFps} FPS evaluation target.`);
                if (!findings.length) findings.push('No major issue was identified by these thresholds in the sampled scene.');
                const stage = sections.find(s => ['Render:Setup','Render:World','Render:Buildings','Render:Entities','Render:Lighting','Render:PostFX'].includes(s.label));
                if (stage) findings.push(`Largest measured rendering stage: ${stage.label} (${stage.mean.toFixed(2)} ms/frame mean).`);
                const sim = sections.find(s => /^(AI:|Logic:|Physics:)/.test(s.label));
                if (sim) findings.push(`Largest measured simulation section: ${sim.label} (${sim.mean.toFixed(2)} ms/rendered frame mean, including catch-up ticks).`);
                if (this.detailed) {
                    const traffic = sections.find(s => s.mean > 0 && s.label.startsWith('Traffic: '));
                    if (traffic) findings.push(`Largest timed traffic substage: ${traffic.label} (${traffic.mean.toFixed(2)} ms/rendered frame mean). Traffic vehicle contacts belong to collision physics; the other traffic stages belong to AI:Traffic.`);
                    const signs = sections.find(s => s.mean > 0 && s.label.startsWith('Signs: '));
                    if (signs) findings.push(`Largest timed sign substage: ${signs.label} (${signs.mean.toFixed(2)} ms/frame mean). Cold sprite baking is reported separately from warm sign drawing.`);
                    const entity = sections.find(s => s.mean > 0 && /^Entities: /.test(s.label));
                    if (entity) findings.push(`Largest measured entity group: ${entity.label} (${entity.mean.toFixed(2)} ms/frame mean).`);
                    const people = sections.find(s => s.mean > 0 && /^People: /.test(s.label));
                    if (people) findings.push(`Largest measured character detail: ${people.label} (${people.mean.toFixed(2)} ms/frame mean).`);
                }
                this.results = { version: 2, instrumentation: { mode: this.detailed ? 'detailed' : 'summary', profilerPanel: false, canvasCallCounting: false,
                        note: this.detailed ? 'Full entity, character, world, traffic and sign-detail timing hooks are enabled without the profiler panel. Extra timing calls and wrappers add overhead; compare against another detailed capture.' : 'Summary section timers only; detailed entity/character/world hooks are disabled.' }, createdAt: new Date().toISOString(), sampleCount: frames.length,
                    sampledSeconds: sum('cadence') / 1000, targetFps, fps, cadenceMs: cadence, cpuLoopMs: cpu,
                    outsideLoopMeanMs: Math.max(0, cadence.mean - cpu.mean), slowFrames: slow,
                    stallsOver50Ms: frames.filter(f => f.cadence > 50).length,
                    stallsOver100Ms: frames.filter(f => f.cadence > 100).length,
                    catchupFrames: frames.filter(f => f.ticks > 1).length, droppedSimulationMs: sum('droppedMs'),
                    simulationTicks: sum('ticks'), simulationMsPerTick: sum('ticks') ? frames.reduce((n, f) => n + (f.sections['Update:Total'] || 0), 0) / sum('ticks') : 0, sections, population: { cars: stat('cars'), pedestrians: stat('pedestrians'), drawnBodies: stat('bodies') },
                    interruptions: this.interruptions, context: this.context, endContext, maps: [...this.maps], findings,
                    limitations: ['CPU timers measure synchronous work and Canvas submission, not GPU completion.',
                        'Section totals include parent and child rows; do not add every row together.',
                        'Profiling and sampling add overhead. Detailed captures are diagnostic and may run slower than ordinary gameplay or summary captures. This is a current-scene capture, not a repeatable hardware score.',
                        'People: Body and limbs and world Other rows are residual categories, including uninstrumented work and timing overhead.',
                        'Warmup, paused/hidden frames and the first interval after resuming are excluded. Long visible stalls are retained.',
                        'Adaptive visual effects remain enabled as configured; the start/end settings and scene mix affect comparisons.'] };
                this.frames = []; this.draw();
            },
            reportText() {
                const r = this.results; if (!r) return 'No whole-game benchmark report yet.';
                const n = v => v.toFixed(2);
                return ['DIMENSIONS: FREELANCER — WHOLE-GAME PERFORMANCE REPORT', r.createdAt,
                    `Capture mode: ${r.instrumentation.mode.toUpperCase()} | profiler panel OFF | canvas call counting OFF`, r.instrumentation.note,
                    `${r.sampleCount} frames / ${n(r.sampledSeconds)} s | maps: ${r.maps.join(', ')} | interruptions: ${r.interruptions}`,
                    `Average FPS: ${n(r.fps)} | evaluation target: ${r.targetFps} FPS`,
                    `Frame intervals (ms): median ${n(r.cadenceMs.p50)}, p95 ${n(r.cadenceMs.p95)}, p99 ${n(r.cadenceMs.p99)}, worst ${n(r.cadenceMs.max)}`,
                    `Measured loop CPU/submission: mean ${n(r.cpuLoopMs.mean)} ms; p95 ${n(r.cpuLoopMs.p95)} ms`,
                    `Outside measured loop: ${n(r.outsideLoopMeanMs)} ms mean (not a GPU measurement)`,
                    `Over target + 10%: ${r.slowFrames}/${r.sampleCount} | >50 ms: ${r.stallsOver50Ms} | >100 ms: ${r.stallsOver100Ms}`,
                    `Simulation: ${r.simulationTicks} ticks (configured ${r.context.simulation.nominalTicksPerSecond} ticks/s at ${r.context.simulation.gameSpeed}x speed; ${n(r.simulationMsPerTick)} ms/tick); ${r.catchupFrames} catch-up frames; ${n(r.droppedSimulationMs)} ms dropped`,
                    `Population mean/max: cars ${n(r.population.cars.mean)}/${r.population.cars.max}; street pedestrians ${n(r.population.pedestrians.mean)}/${r.population.pedestrians.max}; drawn bodies ${n(r.population.drawnBodies.mean)}/${r.population.drawnBodies.max}`,
                    '', 'FINDINGS', ...r.findings.map(s => '- ' + s), '', 'SECTIONS — mean / p95 ms per rendered frame (parents overlap children)',
                    ...r.sections.map(s => `${s.label}: ${n(s.mean)} / ${n(s.p95)}`), '', 'CONTEXT', JSON.stringify(r.context, null, 2),
                    '', 'END CONTEXT', JSON.stringify(r.endContext, null, 2), '', 'LIMITS', ...r.limitations.map(s => '- ' + s)].join('\n');
            },
            async exportReport(format = 'txt') {
                if (!this.results || this._exporting) return;
                this._exporting = true;
                try {
                    const json = format === 'json', text = json ? JSON.stringify(this.results, null, 2) : this.reportText();
                    const name = `DF-performance-${this.results.createdAt.replace(/[:.]/g, '-')}.${json ? 'json' : 'txt'}`;
                    const blob = new Blob([text], { type: json ? 'application/json' : 'text/plain' });
                    if (typeof File !== 'undefined' && navigator.share && navigator.canShare) {
                        const file = new File([blob], name, { type: blob.type });
                        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Performance report' }); return; }
                    }
                    const url = URL.createObjectURL(blob), a = document.createElement('a');
                    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                } catch (e) { if (e.name !== 'AbortError') showMessage('REPORT EXPORT FAILED — TRY THE OTHER FORMAT'); }
                finally { this._exporting = false; }
            },
            draw() {
                let el = this._card;
                if (!this.active && !this.results) { if (el) el.remove(); this._card = null; return; }
                if (!el) {
                    el = this._card = document.createElement('div'); el.id = 'performance-bench-card';
                    for (const type of ['pointerdown','mousedown','touchstart','touchmove']) {
                        el.addEventListener(type, e => e.stopPropagation(), { passive: true });
                    }
                    el.addEventListener('click', e => {
                        const action = e.target.closest('[data-performance-bench]')?.dataset.performanceBench;
                        if (!action) return; e.stopPropagation();
                        if (action === 'cancel') this.cancel();
                        else if (action === 'close') { this.results = null; this.draw(); }
                        else this.exportReport(action);
                    });
                    document.body.appendChild(el);
                }
                const seconds = Math.floor(this.sampledMs / 1000), key = this.active ? 'run' + seconds : 'done' + this.results.createdAt;
                if (el._key === key) return; el._key = key;
                const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                if (this.active) el.innerHTML = '<div class="bc-head">Whole-game bench</div><div class="bc-body">Play normally, including your busiest scenes.<br>'
                    + `${seconds} / ${Math.round(this.durationMs / 1000)} seconds sampled (after warmup).<br>${this.detailed ? 'Detailed timing active; adds measurement overhead.' : 'Summary timing active.'}</div><div class="bc-btns"><button class="df-btn ghost" data-performance-bench="cancel">Cancel</button></div>`;
                else el.innerHTML = '<div class="bc-head">Performance report</div><pre class="bc-body">' + escape(this.reportText())
                    + '</pre><div class="bc-btns"><button class="df-btn" data-performance-bench="txt">Save text</button><button class="df-btn" data-performance-bench="json">Save JSON</button><button class="df-btn ghost" data-performance-bench="close">Close</button></div>';
            }
        };
        if (typeof window !== 'undefined') window.PerformanceBench = PerformanceBench;
