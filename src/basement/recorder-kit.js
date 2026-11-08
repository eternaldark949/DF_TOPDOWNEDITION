        // ===== LV0 BASEMENT =====
        // The recorder: what the player did, tick by tick, so it can be played back through the controls
        // system as if they were doing it again (a replay test, a demo, a bug to watch happen twice). It also
        // keeps where the things near the centre were (recording_radius), so a playback can be checked
        // against the recording, or drawn as a ghost.
        // (The terms are from the g7 engine: base game script 2.0's gRecorder.)
        //
        // It knows nothing about any game: the game hands it
        //   sources   { name: [get, set] }  state the controls don't hold, read and written each tick
        //             (a touch stick's dx/dy, the mouse's aim): get() -> a packet, set(packet)
        //   objects   () -> [[id, x, y, angle], ...]   things that may be recorded
        //   centre    () -> [x, y]                     the middle of the recorded circle
        //   world     [get, set]   the world's start: what a run reads besides the dice (its clocks, id counters, the
        //             camera, a street to empty): got before the setup, set again before the playback's setup
        //
        // RECORDING: { frames: [FRAME...], actions: [ACTION...], step, seed, world }   plain data (JSON)
        //   seed     the dice: while recording or playing, Math.random is reseeded from it at the start of every
        //            tick and before every action, so whatever the drawing used in between (it draws a different
        //            number of frames each time) can't change what the world does: a playback is the same run
        //   FRAME    [held, sources, objects]
        //            held     { keyboard: [...], touch: [...], gamepad: [...] }   the inputs held that tick
        //            sources  { name: packet }
        //            objects  [[id, x, y, angle], ...] within recording_radius of the centre
        //   ACTION   [frame, action, type, device, input, shift]   an action fired after that frame
        //
        // gRecorder(controls, { sources, objects, centre, recording_radius })
        //   startRecording(setup), stopRecording() -> RECORDING
        //   startPlayback(recording, on_end, setup), stopPlayback()   while playing, the devices are muted (Escape still works)
        //   setup     optional: what puts the world where it starts (a map load), run on the recording's dice; give the
        //             same one to the playback and it starts from the same world (pedestrians and all)
        //   recording, playing, frame (the frame index now)
        //   createFrame() / prepareFrameData() / recordFrame(): one tick's frame, its objects, kept
        class gRecorder {
            constructor(controls, { sources = {}, objects = () => [], centre = () => [0, 0], recording_radius = 600, world = null } = {}) {
                Object.assign(this, { controls, sources, objects, centre, recording_radius, world, recording: false, playing: false, frame: 0, data: null, timer: null, on_end: null });
                controls.on_fire.push((action, type, ev) => { if (this.recording && ev.device !== 'replay') this.data.actions.push([this.frame - 1, action, type, ev.device, ev.input, !!ev.shift]); });
                controls.before_fire.push(() => { if (this.recording || this.playing) this.reseed(this.frame - 1, 1 + this._fired++); });
                game_timers.before.push(() => { if (this.recording || this.playing) { this.reseed(this.frame, 0); this._fired = 0; } });
                this.real_random = Math.random; this._fired = 0;
            }
            /** The dice for (frame, n): the same numbers every time this run reaches that point. */
            reseed(frame, n) {
                let a = (this.data.seed ^ Math.imul(frame + 1, 0x9E3779B1) ^ Math.imul(n + 1, 0x85EBCA6B)) >>> 0;
                Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
            }
            _dice(on) { if (!on) Math.random = this.real_random; }
            _setup(setup) { if (!setup) return; this.reseed(-1, 0); try { setup(); } finally { this._dice(false); } }
            /** Each sim tick (game_timers: the recorder runs in game time, so a pause is not recorded). */
            _everyTick(fn) { this.timer?.stopTimer(); this.timer = game_timers.every(game_timers.step, fn, 'recorder'); this.timer.keep = true; }

            // ── Recording ──────────────────────────────────────────────────────
            /** setup(): what puts the world where it starts (a map load); it runs on the recording's own dice, so a
             *  playback that runs it again starts from the same world, pedestrians and all. Without one, a playback
             *  starts from whatever world is there, and only her own part is sure to repeat. */
            startRecording(setup = null) {
                this.stopPlayback();
                this.data = { frames: [], actions: [], step: game_timers.step, seed: (this.real_random() * 4294967296) >>> 0, world: this.world ? this.world[0]() : null };
                if (this.world) this.world[1](this.data.world);   // the same way the playback will start: the street emptied, the clocks set
                this._setup(setup);
                this.recording = true; this.frame = 0;
                this.recordFrame();
                this._everyTick(() => this.recordFrame());
            }
            stopRecording() { if (this.recording) this._dice(false); this.recording = false; this.timer?.stopTimer(); return this.data; }
            createFrame() {
                const C = this.controls, held = {};
                for (const d of ['keyboard', 'touch', 'gamepad']) held[d] = C[d].getActiveInputs();
                const src = {};
                for (const k in this.sources) src[k] = this.sources[k][0]();
                return [held, src, this.prepareFrameData()];
            }
            prepareFrameData() {
                const [cx, cy] = this.centre(), r2 = this.recording_radius ** 2, r = v => Math.round(v * 100) / 100;
                return this.objects().filter(o => (o[1] - cx) ** 2 + (o[2] - cy) ** 2 <= r2).map(([id, x, y, a]) => [id, r(x), r(y), r(a || 0)]);
            }
            recordFrame() { this.data.frames.push(this.createFrame()); this.frame++; }

            // ── Playback ───────────────────────────────────────────────────────
            startPlayback(recording, on_end = null, setup = null) {
                this.stopRecording(); this.stopPlayback();
                Object.assign(this, { data: recording, frame: 0, on_end });
                if (this.world && recording.world) this.world[1](recording.world);
                this._setup(setup);
                this.playing = true;
                this.controls.clear(); this.controls.muted = true;
                this.playFrame();
                this._everyTick(() => this.playFrame());
            }
            playFrame() {
                const d = this.data, C = this.controls;
                // the actions fired after the last frame, then this frame's held inputs and sources
                for (const [f, action, type, device, input, shift] of d.actions) if (f === this.frame - 1)
                    C.fire(action, type, { device: 'replay', from: device, input, type, shift, time: controlsSystem.now(), repeat: false, typing: false, ctrl: false, preventDefault() {}, stop() {} });
                if (this.frame >= d.frames.length) return this.stopPlayback(true);
                this.reseed(this.frame, 0);   // the tick's own dice again, after those actions (they ran between ticks when recorded)
                const [held, src] = d.frames[this.frame];
                for (const dv of ['keyboard', 'touch', 'gamepad']) C[dv].setInputs(held[dv] || []);
                for (const k in src) this.sources[k]?.[1](src[k]);
                this.frame++;
            }
            stopPlayback(ended = false) {
                if (!this.playing) return;
                this.playing = false; this.timer?.stopTimer(); this._dice(false);
                const C = this.controls;
                for (const dv of ['keyboard', 'touch', 'gamepad']) C[dv].setInputs([]);
                C.muted = false;
                if (ended) this.on_end?.(this);
            }
        }
