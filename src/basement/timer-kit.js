        // ===== LV0 BASEMENT =====
        // The game's timers: anything that should happen "in N seconds" of GAME time. They run on the frame
        // clock's sim ticks (frame_clock.advanceTick moves them), so they stop while the game is paused, follow
        // GAME_SPEED, and never fire while a menu holds the world still. (A UI fade that must run while paused,
        // or a load screen, still wants a plain setTimeout: that is real time.)
        // (The terms are from the g7 engine: base game script 2.0's gTimer and V1's gameTimer.)
        //
        // TIMER PACKET:  [seconds]  or  [hours, minutes, seconds]   (seconds may be fractional)
        // gTimer(packet, { mode, on_end, repeat, tag })
        //   mode       'countdown' (from the packet down to 0, then on_end) | 'stopwatch' (up from 0, no end)
        //   repeat     true: a countdown starts over when it ends (every N seconds)
        //   tag        a name to cancel it by (game_timers.cancel(tag))
        //   keep       (set on the timer) a standing timer: a new game's cancel() leaves it running
        //   setTimer(packet), startTimer(), stopTimer() (back to the start), pauseTimer(), unpauseTimer()
        //   seconds (left, or so far), running, cycle_count (times it has ended), display_time ('h.mm.ss')
        // One-liners: game_timers.after(seconds, fn, tag), game_timers.every(seconds, fn, tag), game_timers.cancel(tag)
        class gTimer {
            constructor(packet = [0], { mode = 'countdown', on_end = null, repeat = false, tag = null } = {}) {
                Object.assign(this, { mode, on_end, repeat, tag, running: false, cycle_count: 0, separator_symbol: '.' });
                this.setTimer(packet);
            }
            /** [seconds] or [hours, minutes, seconds] */
            setTimer(packet) {
                const [h, m, s] = packet.length >= 3 ? packet : [0, 0, packet[0] || 0];
                this.start_seconds = h * 3600 + m * 60 + s;
                if (!this.running) this.seconds = this.mode === 'countdown' ? this.start_seconds : 0;
                return this;
            }
            startTimer() { if (!this.running) { this.running = true; game_timers.add(this); } return this; }
            stopTimer() { this.running = false; this.seconds = this.mode === 'countdown' ? this.start_seconds : 0; game_timers.remove(this); return this; }
            pauseTimer() { this.running = false; return this; }
            unpauseTimer() { this.running = true; game_timers.add(this); return this; }
            get display_time() {
                const t = Math.max(0, this.mode === 'countdown' ? Math.ceil(this.seconds - 1e-6) : Math.floor(this.seconds + 1e-6)), p = n => String(n).padStart(2, '0');
                return [Math.floor(t / 3600), p(Math.floor(t / 60) % 60), p(t % 60)].join(this.separator_symbol);
            }
            /** One sim tick of `dt` seconds. */
            updateState(dt) {
                if (!this.running) return;
                if (this.mode === 'stopwatch') { this.seconds += dt; return; }
                this.seconds -= dt;
                if (this.seconds > 1e-9) return;
                this.cycle_count++;
                if (this.repeat && this.start_seconds > 0) this.seconds += this.start_seconds;
                else { this.running = false; game_timers.remove(this); }
                this.on_end?.(this);
            }
        }

        class timerSystem {
            constructor() { this.timers = new Set(); this.step = 1 / 60; this.before = []; }   // before: run at the start of every tick, ahead of the timers
            add(t) { this.timers.add(t); }
            remove(t) { this.timers.delete(t); }
            after(seconds, fn, tag = null) { return new gTimer([seconds], { on_end: fn, tag }).startTimer(); }
            every(seconds, fn, tag = null) { return new gTimer([seconds], { on_end: fn, tag, repeat: true }).startTimer(); }
            /** Stop every timer with this tag (or, with none, every timer but the standing ones, `keep`: a new game). */
            cancel(tag = undefined) { for (const t of [...this.timers]) if (tag === undefined ? !t.keep : t.tag === tag) { t.running = false; this.timers.delete(t); } }
            /** One sim tick (frame_clock.advanceTick). */
            tick() { for (const fn of this.before) fn(); for (const t of [...this.timers]) { try { t.updateState(this.step); } catch (e) { console.error(e); } } }
        }
        const game_timers = new timerSystem();
