        // GameEngine — the game's side of the main loop: what it plugs into the Lobby's jacks (the clock is the Lobby's: lobby/level-lobby.js).
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            /** Plug the game into the Lobby's jacks (lobby/level-lobby.js). The Lobby keeps the clock;
             *  everything game-specific about a frame happens here. */
            _plugIntoLobby() {
                this.level_lobby.plugIn({
                    isRunning: () => this.running,
                    beginFrame: () => {
                        this._syncProfiler();
                        if (PerformanceBench.active) PerformanceBench.beginFrame();
                        const _a0 = this.profiler.enabled ? performance.now() : 0;
                        ambience.update(this);                           // the beds, the music, the motor (Audio:Ambience in the profiler)
                        if (this.profiler.enabled) this.profiler.add('Audio:Ambience', performance.now() - _a0);
                    },
                    frameRateLimit: () => GameSettings.fpsLimit,
                    acceptFrame: () => {
                        if (PerformanceBench.active) PerformanceBench.acceptFrame();   // (the Lobby stamps the frame clock next)
                    },
                    // A finisher's slow, or the scope's: they stretch each tick in real time (engine/finisher.js, engine/scope.js)
                    timeScale: (elapsed) => {
                        if (this.finisher || this.finCam) this.updateFinisher(elapsed);   // the finisher's beats run on real time
                        return Math.min(this.updateTimeSlow(elapsed), this.scopeTimeScale(elapsed));
                    },
                    // update() is written in per-tick units (acceleration 0.35/tick, cooldowns in ticks), so the
                    // Lobby runs it in fixed steps and every constant means the same thing on every display.
                    // Every step slot, held or not: interpolation blends from here, so while paused the
                    // drawn frame rests on the latest state.
                    beforeStep: () => { if (CONFIG.LOOP.INTERPOLATE) RenderInterp.snapshot(this); },
                    // Pause is the game's pause registry (engine/pause-system.js), mirrored to game.paused
                    isPaused: () => this.paused,
                    simulateStep: () => this.stepWorld(),
                    afterSimulation: (steps) => {
                        RenderStats.ticks = steps;   // sim ticks this frame (the profiler: a slow frame runs several, and its update rows add them up)
                        if (PerformanceBench.active) PerformanceBench.afterSimulation();
                    },
                    // Always draw for smooth visuals, blended between the last two ticks
                    renderFrame: (blend) => {
                        const interp = CONFIG.LOOP.INTERPOLATE;
                        if (interp) RenderInterp.apply(this, blend);
                        const tickSec = CONFIG.LOOP.STEP_MS / 1000;
                        frame_clock.setGameTime((interp && RenderInterp.stepAdvanced)
                            ? (_simTick - 1 + RenderInterp.alpha) * tickSec
                            : _simTick * tickSec);
                        try {
                            this.draw();
                        } finally {
                            if (interp) RenderInterp.restore(this);
                        }
                    },
                    endFrame: (steps, droppedMs) => { if (PerformanceBench.active) PerformanceBench.endFrame(steps, droppedMs); },
                    // Through game.loop(), so replacing it (as the test runners do) stops the loop
                    scheduleNextFrame: () => requestAnimationFrame(() => this.loop()),
                });
            },

            /** One frame of the main loop: the Lobby's clock (lobby/level-lobby.js). */
            loop() {
                try { this.level_lobby.runEngine(); }
                catch (err) {                                   // a frame that throws is reported, and the next one still comes
                    console.error(err);
                    this.level_lobby.scheduleNextFrame();
                }
            },

            // The loop's clock lives in the Lobby; these keep the old names working for the code
            // (lighting, reflections, scope) and tests that read or reset them.
            get _accumulator() { return this.level_lobby.accumulator; },
            set _accumulator(v) { this.level_lobby.accumulator = v; },
            get _lastLoopTime() { return this.level_lobby.last_frame_time; },
            set _lastLoopTime(v) { this.level_lobby.last_frame_time = v; },
            get _nextDrawDue() { return this.level_lobby.next_draw_due; },
            set _nextDrawDue(v) { this.level_lobby.next_draw_due = v; },
            get _renderFrameMs() { return this.level_lobby.frame_ms; },
            set _renderFrameMs(v) { this.level_lobby.frame_ms = v; },
            get _loopScale() { return this.level_lobby.time_scale; },
            set _loopScale(v) { this.level_lobby.time_scale = v; },
        });

