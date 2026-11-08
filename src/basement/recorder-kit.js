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
        //
        // RECORDING: { frames: [FRAME...], actions: [ACTION...], step }   plain data (JSON)
        //   FRAME    [held, sources, objects]
        //            held     { keyboard: [...], touch: [...], gamepad: [...] }   the inputs held that tick
        //            sources  { name: packet }
        //            objects  [[id, x, y, angle], ...] within recording_radius of the centre
        //   ACTION   [frame, action, type, device, input, shift]   an action fired after that frame
        //
        // gRecorder(controls, { sources, objects, centre, recording_radius })
        //   startRecording(), stopRecording() -> RECORDING
        //   startPlayback(recording, on_end), stopPlayback()   while playing, the devices are muted (Escape still works)
        //   recording, playing, frame (the frame index now)
        //   createFrame() / prepareFrameData() / recordFrame(): one tick's frame, its objects, kept
        class gRecorder {
            constructor(controls, { sources = {}, objects = () => [], centre = () => [0, 0], recording_radius = 600 } = {}) {
                Object.assign(this, { controls, sources, objects, centre, recording_radius, recording: false, playing: false, frame: 0, data: null, timer: null, on_end: null });
                controls.on_fire.push((action, type, ev) => { if (this.recording && ev.device !== 'replay') this.data.actions.push([this.frame - 1, action, type, ev.device, ev.input, !!ev.shift]); });
            }
            /** Each sim tick (game_timers: the recorder runs in game time, so a pause is not recorded). */
            _everyTick(fn) { this.timer?.stopTimer(); this.timer = game_timers.every(game_timers.step, fn, 'recorder'); this.timer.keep = true; }

            // ── Recording ──────────────────────────────────────────────────────
            startRecording() {
                this.stopPlayback();
                this.data = { frames: [], actions: [], step: game_timers.step };
                this.recording = true; this.frame = 0;
                this.recordFrame();
                this._everyTick(() => this.recordFrame());
            }
            stopRecording() { this.recording = false; this.timer?.stopTimer(); return this.data; }
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
            startPlayback(recording, on_end = null) {
                this.stopRecording(); this.stopPlayback();
                Object.assign(this, { data: recording, playing: true, frame: 0, on_end });
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
                const [held, src] = d.frames[this.frame];
                for (const dv of ['keyboard', 'touch', 'gamepad']) C[dv].setInputs(held[dv] || []);
                for (const k in src) this.sources[k]?.[1](src[k]);
                this.frame++;
            }
            stopPlayback(ended = false) {
                if (!this.playing) return;
                this.playing = false; this.timer?.stopTimer();
                const C = this.controls;
                for (const dv of ['keyboard', 'touch', 'gamepad']) C[dv].setInputs([]);
                C.muted = false;
                if (ended) this.on_end?.(this);
            }
        }
