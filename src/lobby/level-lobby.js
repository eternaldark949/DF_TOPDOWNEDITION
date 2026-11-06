        // ===== LV1 LOBBY =====
        // The engine's game loop. The Lobby keeps the clock and nothing else: it knows when a frame is due,
        // how many fixed simulation steps that frame owes, and how far the drawn frame sits between two steps.
        // It knows nothing about the game. Whatever the game wants done in a frame (profiling, audio,
        // slow-mo, the simulation itself, drawing) is plugged into its jacks with plugIn().
        //
        // FIXED TIMESTEP: the simulation advances in steps of loop_config.STEP_MS of game time, and the
        // screen is drawn whenever the display allows. Leftover time carries over in the accumulator, so
        // steps land at a true rate on average on any monitor. A stall (alt-tab, GC, debugger) is clamped
        // to MAX_FRAME_MS, and a frame never runs more than MAX_STEPS steps: past that the backlog is
        // dropped rather than letting the world fast-forward or spiral.
        //
        // JACKS (each optional; an empty jack does nothing):
        //   isRunning()                 -> bool    the loop stops re-arming itself when false
        //   beginFrame()                           every display frame, before the FPS limiter
        //   frameRateLimit()            -> number  frames per second to draw at, 0 = as fast as the display
        //   acceptFrame()                          a frame the limiter let through
        //   timeScale(elapsed_ms)       -> number  1 = normal, 0.4 = slow-mo; stretches each step in real time
        //   simulateStep()                         one fixed step of the world
        //   afterSimulation(steps)                 after this frame's steps
        //   renderFrame(blend)                     draw; blend 0..1 = how far between the last two steps
        //   endFrame(steps, dropped_ms)            after drawing
        //   scheduleNextFrame(run)                 arm the next frame (default: requestAnimationFrame)
        class levelLobby {
            constructor (loop_config) {
                this.loop_config = loop_config;          // read live every frame: { STEP_MS, MAX_FRAME_MS, MAX_STEPS, GAME_SPEED }
                this.jacks = {};

                // --- CLOCK STATE ---
                this.last_frame_time = undefined;        // performance.now() of the last accepted frame
                this.next_draw_due = undefined;          // when the FPS limiter lets the next frame through
                this.accumulator = 0;                    // real ms owed to the simulation
                this.frame_ms = 0;                       // raw time between accepted frames (render cadence)
                this.time_scale = 1;                     // this frame's slow-mo scale
                this.step_ms = 0;                        // this frame's real length of one step
                this.steps_taken = 0;                    // steps run in the last frame

                this.engine_clock = this.runEngine.bind(this);
            }

            /** Plug the game into the Lobby: { jackName: function }. Later calls add to or replace earlier ones. */
            plugIn (jacks) {
                Object.assign(this.jacks, jacks);
                return this;
            }

            /** One display frame. */
            runEngine () {
                const J = this.jacks, L = this.loop_config;
                if (J.isRunning && !J.isRunning()) return;
                if (J.beginFrame) J.beginFrame();

                // --- FPS LIMITER ---
                // Scheduled against a running due-time rather than the last drawn frame. Comparing to the last
                // frame overshoots whenever the display period doesn't divide the target evenly: on a 144Hz panel
                // (6.94ms) a 16.67ms target could only land every 3rd frame, so "60 FPS" delivered 48.
                const fps_limit = J.frameRateLimit ? J.frameRateLimit() : 0;
                if (fps_limit > 0) {
                    const now = performance.now();
                    const min_interval = 1000 / fps_limit;
                    if (this.next_draw_due === undefined) this.next_draw_due = now;
                    if (now < this.next_draw_due) {
                        this.scheduleNextFrame();
                        return;
                    }
                    // Carry the schedule forward; resync if we've fallen far behind.
                    this.next_draw_due = (now - this.next_draw_due > min_interval)
                        ? now + min_interval
                        : this.next_draw_due + min_interval;
                } else {
                    this.next_draw_due = undefined;
                }
                if (J.acceptFrame) J.acceptFrame();

                // --- ELAPSED TIME ---
                const now_ms = performance.now();
                if (this.last_frame_time === undefined) this.last_frame_time = now_ms;
                let elapsed = now_ms - this.last_frame_time;
                this.frame_ms = elapsed;                 // raw render cadence; never changes the fixed step
                this.last_frame_time = now_ms;

                const clamped_ms = Math.max(0, elapsed - L.MAX_FRAME_MS);
                if (elapsed > L.MAX_FRAME_MS) elapsed = L.MAX_FRAME_MS;
                if (elapsed < 0) elapsed = 0;
                this.accumulator = (this.accumulator || 0) + elapsed;

                // --- STEP LENGTH ---
                // Real-time length of one step. GAME_SPEED 0.5 -> 33.3ms -> 30 steps/sec. A time scale stretches
                // it the same way: evenly spaced, interpolated steps.
                const scale = this.time_scale = J.timeScale ? J.timeScale(elapsed) : 1;
                const step_ms = this.step_ms = L.STEP_MS / Math.max(0.05, (L.GAME_SPEED || 1) * scale);

                // --- SIMULATION ---
                let steps = 0;
                while (this.accumulator >= step_ms && steps < L.MAX_STEPS) {
                    if (J.simulateStep) J.simulateStep();
                    this.accumulator -= step_ms;
                    steps++;
                }
                // Machine can't keep up: drop the backlog rather than spiral.
                const dropped_ms = clamped_ms + (steps >= L.MAX_STEPS ? this.accumulator : 0);
                if (steps >= L.MAX_STEPS) this.accumulator = 0;
                this.steps_taken = steps;
                if (J.afterSimulation) J.afterSimulation(steps);

                // --- RENDER ---
                if (J.renderFrame) J.renderFrame(this.accumulator / step_ms);
                if (J.endFrame) J.endFrame(steps, dropped_ms);
                this.scheduleNextFrame();
            }

            scheduleNextFrame () {
                if (this.jacks.scheduleNextFrame) this.jacks.scheduleNextFrame(this.engine_clock);
                else requestAnimationFrame(this.engine_clock);
            }
        }
