        // ===== LV0 BASEMENT =====
        // The sound system: one owner for the audio. The context, the mix (channels into a master), the
        // volume control with its dial, a room's reverb, and sound files played by packet. Like the sound
        // kit under it, it knows nothing about any game: the game names its rooms, its sounds and its
        // music in the Directory and hands them over as packets.
        // (The terms are from the g7 engine (base game script 2.0): channels were its audio threads.)
        //
        //   master ── inserts ── limiter ── speakers
        //     ├── dialogue ┐
        //     ├── music    ├── each channel: a wet input (its send feeds the reverb) and a dry one (it doesn't),
        //     ├── sfx      ┘   both through the channel's level and then its inserts
        //     └── reverb  (two convolvers: a new room fades in as the old one fades out)
        //
        // LEVELS PACKET: { master, dialogue, music, sfx }   0..1 each (volumeControl)
        // DIAL PACKET:   [music_lowering_percentage, music_lowering_speed]   how far the music dips under
        //                dialogue, and how fast (s) it goes down and comes back
        // ROOM PACKET:   [decay, predelay, damp, wet, echo, feedback, echo_level]   the reverb of a place
        //   decay             s for the tail to die away (60 dB)
        //   predelay          ms before the tail starts (the room's size; up to 2000: a delayed reverb)
        //   damp              Hz the highs fall to by the end of the tail (soft rooms, low; tile and glass, high)
        //   wet               how much of the sends reach the speakers (0: no reverb at all)
        //   echo              s between echoes (0 or left out: none): a far wall, a canyon, a tunnel
        //   feedback          how much of each echo comes back again (0..0.9: one repeat .. a long train)
        //   echo_level        how loud the echoes are against the dry sound (each one also rings in the tail)
        // INSERT PACKET: [effect, effect, ...]   a mixer track's insert chain, in order (soundSystem.insert)
        //   [filter, freq, Q, gain]        'highpass' | 'lowpass' | 'bandpass' | 'notch' | 'allpass' (Q: resonance)
        //                                  'peaking' (gain dB at freq, Q: width) | 'lowshelf' | 'highshelf' (gain dB)
        //   ['drive', amount]              saturation, 0..1 (soft tanh: warmth at 0.2, crunch at 0.7)
        //   ['crush', bits]                bit depth (16: clean .. 4: crushed)
        //   ['comp', threshold, ratio, attack, release, knee, makeup]   a compressor (dB, :1, s, s, dB, dB)
        //   ['gain', db]                   a trim
        //   ['delay', time, feedback, mix, damp, pingpong]   echoes `time` apart, each darker by `damp` Hz
        //   ['chorus', rate, depth_ms, mix]                  two short delays swept against each other
        //   ['phaser', rate, depth, freq, feedback, mix]     four allpass stages swept around freq
        //   ['tremolo', rate, depth, shape]                  the level pulses
        //   ['autopan', rate, depth]                         it swings left and right
        //   TIMES and RATES: a number (seconds; Hz), or a note value that follows the tempo (setTempo):
        //   '1/4' a beat, '1/8d' a dotted eighth, '1/16t' a sixteenth triplet, '1' a bar. A rate as a note
        //   value is one cycle per note: ['autopan', '1/2'] swings across every half bar.
        //   Setting the same effects again glides their values (an EQ sweep, a filter opening); a different
        //   list rebuilds the chain. [] is a straight wire.
        // SOUND PACKET:  [channel, name, layer, volume, options]   a sound file, through soundSystem.playSound
        //   channel           'dialogue' | 'music' | 'sfx'
        //   layer             a slot in the channel: one sound per layer; another one waits for it unless
        //                     options.ignore_queue (null: no slot, it just plays)
        //   options           { loop, rate, dry, pan }
        //
        //   const sound = new soundSystem({ latency: 'balanced', levels: { master: 1, music: 0.7 }, load: name => decode(name) });
        //   sfx_recipe(sound.ctx, sound.out('sfx'));                  // a recipe plays into the sfx channel (with the room)
        //   sound.reverb.setRoom([2.2, 22, 5500, 0.24]);              // walked into a hall: its reverb fades in
        //   sound.playSound(['dialogue', 'door_bell', 0, 1]);         // the music dips while it plays
        //   sound.volume.set('music', 0.5);
        //   sound.insert('music', [['lowpass', 600, 0.7]], 0.4);    // underwater: the music closes over 0.4 s
        //   sound.insert('dialogue', [['drive', 0.4], ['highpass', 300], ['lowpass', 3400]]);   // over a phone (grit first, the filters trim it)
        class soundSystem {
            constructor({ latency = 'balanced', levels = {}, dial = [0.3, 2.0], load = null } = {}) {
                this.ctx = soundKit.open(latency);
                this.load = load;                                         // name → Promise of an AudioBuffer (the game's assets)
                const ctx = this.ctx;
                this.master = ctx.createGain();
                this.master.gain.value = levels.master ?? 1;
                this.limiter = ctx.createDynamicsCompressor();          // a stack of loud sounds would sum past full scale and clip
                const L = this.limiter;
                L.threshold.value = -1; L.knee.value = 0; L.ratio.value = 20; L.attack.value = 0.001; L.release.value = 0.1;
                this.clock = { bpm: 120 };                                // the tempo synced effects follow (setTempo)
                this.master_insert = new soundInsert(ctx, this.master, L, this.clock); L.connect(ctx.destination);
                this.reverb = new soundReverb(ctx, this.master);
                this.channels = {};
                for (const name of soundSystem.CHANNELS) this.channels[name] = new soundChannel(ctx, this.master, this.reverb, levels[name] ?? 1, soundSystem.SENDS[name], this.clock);
                this.volume = new volumeControl(this, levels, dial);
            }

            /** Where a sound goes: the channel's wet input (with the room) or dry one, through a panner when off centre. */
            out(channel = 'sfx', { dry = false, pan = 0 } = {}) {
                const ch = this.channels[channel] || this.channels.sfx;
                return soundKit.pan(this.ctx, dry ? ch.dry : ch.wet, pan);
            }

            /** Resume the context after a user gesture (browsers start it suspended). */
            wake() { if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume(); }

            /** A sound file from a packet. Resolves to the playing source, or null (no loader, no such sound,
             *  or it waited in its layer's queue and the layer is now busy with it). */
            playSound(sound_packet) {
                const [channel = 'sfx', name, layer = null, volume = 1, options = {}] = sound_packet;
                const ch = this.channels[channel] || this.channels.sfx;
                if (!this.load) return Promise.resolve(null);
                return this.load(name).then(buffer => {
                    if (!buffer) return null;
                    if (layer !== null && ch.layers.has(layer)) {
                        if (options.ignore_queue) { try { ch.layers.get(layer).stop(); } catch (e) { /* already stopped */ } }
                        else { ch.queue.push(sound_packet); return null; }   // waits for its layer
                    }
                    this.wake();
                    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
                    s.buffer = buffer; s.loop = !!options.loop; s.playbackRate.value = options.rate || 1;
                    g.gain.value = volume;
                    s.connect(g); g.connect(this.out(channel, options));
                    if (layer !== null) ch.layers.set(layer, s);
                    ch.playing++; if (channel === 'dialogue') this.volume.dial.update();
                    s.addEventListener('ended', () => {
                        ch.playing--; if (channel === 'dialogue') this.volume.dial.update();
                        if (layer !== null && ch.layers.get(layer) === s) {
                            ch.layers.delete(layer);
                            const i = ch.queue.findIndex(p => (p[2] ?? null) === layer);
                            if (i >= 0) this.playSound(ch.queue.splice(i, 1)[0]);
                        }
                    }, { once: true });
                    s.start();
                    return s;
                });
            }

            /** The tempo (bpm): every effect timed in note values follows it, gliding over `glide` s. */
            setTempo(bpm, glide = 0.1) {
                if (!(bpm > 0) || bpm === this.clock.bpm) return;
                this.clock.bpm = bpm;
                for (const ins of [this.master_insert, ...Object.values(this.channels).map(c => c.insert)]) for (const e of ins.effects) e.tune(e.op, glide);
            }

            /** A time in seconds from a number (s) or a note value at `bpm`: '1/4' a beat, '1/8d' dotted, '1/16t' triplet, '2' two bars. */
            static seconds(v, bpm) {
                if (typeof v === 'number') return v;
                const m = /^(\d+)(?:\/(\d+))?([dt]?)$/.exec(String(v).trim());
                if (!m) return 0.25;
                const bars = (+m[1]) / (m[2] ? +m[2] : 1), k = m[3] === 'd' ? 1.5 : m[3] === 't' ? 2 / 3 : 1;
                return bars * 4 * 60 / bpm * k;
            }
            /** A rate in Hz from a number (Hz) or a note value (one cycle each: '1/2' every half bar). */
            static rate(v, bpm) { return typeof v === 'number' ? v : 1 / Math.max(1e-3, soundSystem.seconds(v, bpm)); }

            /** A track's insert chain (INSERT PACKET): 'master' or a channel's, gliding over `glide` s. */
            insert(name, chain, glide = 0.05) {
                const ins = name === 'master' ? this.master_insert : (this.channels[name] || {}).insert;
                if (ins) ins.set(chain, glide);
                return ins;
            }

            /** Whether a channel is playing a file (in one layer, or any). */
            isPlaying(channel, layer = null) {
                const ch = this.channels[channel];
                return !!ch && (layer === null ? ch.playing > 0 : ch.layers.has(layer));
            }
        }
        soundSystem.CHANNELS = ['dialogue', 'music', 'sfx'];
        soundSystem.SENDS = { dialogue: 0.6, music: 0.5, sfx: 1 };            // how much of each channel's wet input reaches the reverb

        /** A channel: its level (into the master) and its send (into the reverb). Sounds connect to `wet`
         *  (heard in the room) or `dry` (beside the ear: the phone, the HUD, the car's own cabin). */
        class soundChannel {
            constructor(ctx, master, reverb, level, send = 1, clock = { bpm: 120 }) {
                this.level = level;
                this.bus = ctx.createGain();                              // its level's output, into its inserts
                this.insert = new soundInsert(ctx, this.bus, master, clock);
                this.gain_wet = soundKit.gain(ctx, level, this.bus);
                this.gain_dry = soundKit.gain(ctx, level, this.bus);
                this.send = soundKit.gain(ctx, level * send, reverb.input);
                this.send_amount = send;
                this.wet = soundKit.gain(ctx, 1, this.gain_wet); this.wet.connect(this.send);
                this.dry = soundKit.gain(ctx, 1, this.gain_dry);
                this.layers = new Map(); this.queue = []; this.playing = 0;
            }
            /** Glide the channel's level (s: the time constant). */
            setLevel(ctx, v, s = 0.05) {
                this.level = v;
                const t = ctx.currentTime;
                this.gain_wet.gain.setTargetAtTime(v, t, s); this.gain_dry.gain.setTargetAtTime(v, t, s);
                this.send.gain.setTargetAtTime(v * this.send_amount, t, s);
            }
        }

        /** A track's inserts: effects in a row between `input` and `output` (INSERT PACKET). */
        class soundInsert {
            constructor(ctx, input, output, clock = { bpm: 120 }) {
                this.ctx = ctx; this.input = input; this.output = output; this.clock = clock;
                this.effects = []; this.shape = '';
                input.connect(output);
            }

            /** The chain: the same effects again glide to their new values; others rebuild it. */
            set(chain = [], glide = 0.05) {
                const shape = chain.map(op => op[0]).join(',');
                if (shape === this.shape) { chain.forEach((op, i) => this.effects[i].tune(op, glide)); return; }
                this.input.disconnect(); for (const e of this.effects) e.out.disconnect();
                this.effects = chain.map(op => this.make(op)); this.shape = shape;
                let node = this.input;
                for (const e of this.effects) { e.tune(e.op, 0); node.connect(e.in); node = e.out; }
                node.connect(this.output);
            }

            /** One effect from its packet: { in, out, op, tune(op, glide) }. */
            make(op) {
                const ctx = this.ctx, at = (param, v, glide) => glide > 0 ? param.setTargetAtTime(v, ctx.currentTime, glide) : param.setValueAtTime(v, ctx.currentTime);
                const kind = op[0];
                if (kind === 'drive' || kind === 'crush') {
                    const w = ctx.createWaveShaper(); w.oversample = kind === 'drive' ? '4x' : 'none';
                    const e = { in: w, out: w, op, key: null, tune: (o) => {
                        const key = kind + o[1]; if (key === e.key) return; e.key = key; e.op = o;
                        const n = 2048, curve = new Float32Array(n);
                        if (kind === 'drive') { const k = 1 + Math.max(0, o[1]) * 12, t = 0.5 / Math.tanh(0.5 * k); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(k * x) * t; } }   // a half-scale peak keeps its level: drive adds grit, not loudness
                        else { const steps = Math.pow(2, Math.max(1, Math.min(16, o[1] ?? 8)) - 1); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.round(x * steps) / steps; } }
                        w.curve = curve;
                    } };
                    return e;
                }
                if (kind === 'comp') {
                    const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
                    c.connect(g);
                    return { in: c, out: g, op, tune: (o, glide) => {
                        const [, threshold = -18, ratio = 4, attack = 0.01, release = 0.2, knee = 6, makeup = 0] = o;
                        at(c.threshold, threshold, glide); at(c.ratio, ratio, glide); at(c.attack, attack, glide); at(c.release, release, glide); at(c.knee, knee, glide);
                        at(g.gain, Math.pow(10, makeup / 20), glide);
                    } };
                }
                if (kind === 'gain') {
                    const g = ctx.createGain();
                    return { in: g, out: g, op, tune: (o, glide) => at(g.gain, Math.pow(10, (o[1] || 0) / 20), glide) };
                }
                const T = (v) => soundSystem.seconds(v, this.clock.bpm), Hz = (v) => soundSystem.rate(v, this.clock.bpm);
                // Wet effects: in → (dry) → out, and in → the effect → (wet) → out; mix 0..1 sets the balance
                const wetDry = () => { const i = ctx.createGain(), o = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(); i.connect(dry); dry.connect(o); wet.connect(o); return { i, o, dry, wet }; };
                const mixTo = (W, mix, glide) => { at(W.dry.gain, Math.cos(mix * Math.PI / 2), glide); at(W.wet.gain, Math.sin(mix * Math.PI / 2), glide); };   // equal power
                const lfo = (type = 'sine') => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.connect(g); o.start(); return { o, g }; };
                if (kind === 'delay') {
                    // [delay, time, feedback, mix, damp, pingpong]: echoes `time` apart (a note value follows the tempo),
                    // each darker by `damp` Hz; pingpong bounces them left and right
                    const W = wetDry(), dL = ctx.createDelay(8), dR = ctx.createDelay(8), lp = ctx.createBiquadFilter(), fbL = ctx.createGain(), fbR = ctx.createGain(), merge = ctx.createChannelMerger(2), mono = ctx.createGain();
                    lp.type = 'lowpass'; mono.channelCount = 1; mono.channelCountMode = 'explicit';
                    W.i.connect(mono); mono.connect(dL);
                    dL.connect(fbL); fbL.connect(dR); dR.connect(fbR); fbR.connect(lp); lp.connect(dL);   // L → R → (darker) → L ...
                    dL.connect(merge, 0, 0); dR.connect(merge, 0, 1); merge.connect(W.wet);
                    return { in: W.i, out: W.o, op, tune: (o, glide) => {
                        const [, time = '1/4', feedback = 0.35, mix = 0.3, damp = 6000, pingpong = false] = o, t = Math.min(4, T(time));
                        at(lp.frequency, damp, glide); mixTo(W, mix, glide);
                        // (a feedback loop in Web Audio runs one render block (128 samples) late: the times give it back)
                        const q = 128 / ctx.sampleRate;
                        if (pingpong) { at(dL.delayTime, Math.max(q, t - q / 2), glide); at(dR.delayTime, Math.max(q, t - q / 2), glide); at(fbL.gain, Math.sqrt(Math.min(0.95, feedback)), glide); at(fbR.gain, Math.sqrt(Math.min(0.95, feedback)), glide); }
                        else {                                                     // straight: R holds one render block (a loop can't be shorter), L the rest
                            at(dL.delayTime, Math.max(q, t - 2 * q), glide); at(dR.delayTime, q, glide); at(fbL.gain, 1, glide); at(fbR.gain, Math.min(0.95, feedback), glide);
                        }
                    } };
                }
                if (kind === 'chorus') {
                    // [chorus, rate, depth, mix]: two short delays swept in opposite directions (depth in ms)
                    const W = wetDry(), merge = ctx.createChannelMerger(2), a = ctx.createDelay(0.1), b = ctx.createDelay(0.1), L = lfo(), inv = ctx.createGain();
                    W.i.connect(a); W.i.connect(b); a.connect(merge, 0, 0); b.connect(merge, 0, 1); merge.connect(W.wet);
                    L.g.connect(a.delayTime); L.g.connect(inv); inv.gain.value = -1; inv.connect(b.delayTime);
                    a.delayTime.value = 0.018; b.delayTime.value = 0.018;
                    return { in: W.i, out: W.o, op, tune: (o, glide) => { const [, rate = 0.8, depth = 4, mix = 0.5] = o; at(L.o.frequency, Hz(rate), glide); at(L.g.gain, depth / 1000, glide); mixTo(W, mix, glide); } };
                }
                if (kind === 'phaser') {
                    // [phaser, rate, depth, freq, feedback, mix]: four allpass stages swept around `freq` Hz by ±depth (0..1)
                    const W = wetDry(), stages = [0, 1, 2, 3].map(() => { const f = ctx.createBiquadFilter(); f.type = 'allpass'; f.Q.value = 0.6; return f; }), L = lfo(), fb = ctx.createGain();
                    let n = W.i; for (const s of stages) { n.connect(s); n = s; L.g.connect(s.frequency); }
                    n.connect(W.wet); n.connect(fb); fb.connect(stages[0]);
                    return { in: W.i, out: W.o, op, tune: (o, glide) => {
                        const [, rate = '1/2', depth = 0.7, freq = 900, feedback = 0.4, mix = 0.5] = o;
                        at(L.o.frequency, Hz(rate), glide); at(L.g.gain, freq * depth, glide); at(fb.gain, Math.min(0.9, feedback), glide);
                        for (const s of stages) at(s.frequency, freq, glide); mixTo(W, mix, glide);
                    } };
                }
                if (kind === 'tremolo') {
                    // [tremolo, rate, depth, shape]: the level pulses (shape 'sine' | 'square' | 'triangle')
                    const g = ctx.createGain(), L = lfo(op[3] || 'sine'); L.g.connect(g.gain);
                    return { in: g, out: g, op, tune: (o, glide) => { const [, rate = '1/8', depth = 0.5] = o; at(L.o.frequency, Hz(rate), glide); at(g.gain, 1 - depth / 2, glide); at(L.g.gain, depth / 2, glide); } };
                }
                if (kind === 'autopan') {
                    // [autopan, rate, depth]: it swings left and right
                    const p = ctx.createStereoPanner(), L = lfo(); L.g.connect(p.pan);
                    return { in: p, out: p, op, tune: (o, glide) => { const [, rate = '1/2', depth = 0.7] = o; at(L.o.frequency, Hz(rate), glide); at(L.g.gain, Math.min(1, depth), glide); } };
                }
                const f = ctx.createBiquadFilter(); f.type = kind;               // the filter shapes
                return { in: f, out: f, op, tune: (o, glide) => {
                    at(f.frequency, o[1] ?? 1000, glide);
                    at(f.Q, o[2] ?? (kind === 'peaking' ? 1 : 0.707), glide);
                    if (o[3] !== undefined) at(f.gain, o[3], glide);
                } };
            }
        }

        /** The volume control: master, dialogue, music and sfx levels, and the dial that lowers the music
         *  under dialogue. */
        class volumeControl {
            constructor(system, levels, dial) {
                this.system = system;
                for (const k of ['master', ...soundSystem.CHANNELS]) this[k] = levels[k] ?? 1;
                this.dial = new volumeDial(this, dial);
            }
            /** Set a level (0..1): 'master' or a channel's. */
            set(name, v) {
                v = Math.max(0, Math.min(1, v)); this[name] = v;
                const S = this.system;
                if (name === 'master') S.master.gain.setTargetAtTime(v, S.ctx.currentTime, 0.02);   // a fade, not a click
                else if (name === 'music') this.dial.update();
                else S.channels[name].setLevel(S.ctx, v);
            }
        }

        /** The dial: while dialogue plays (or a game says so: duck(true)), the music sinks by
         *  music_lowering_percentage, gliding over music_lowering_speed s, and comes back after. */
        class volumeDial {
            constructor(volume_controller, [lowering = 0.3, speed = 2.0] = []) {
                this.volume_controller = volume_controller;
                this.music_lowering_percentage = lowering;
                this.music_lowering_speed = speed;
                this.ducked = false;
            }
            duck(on) { this.ducked = !!on; this.update(); }
            update() {
                const V = this.volume_controller, S = V.system, low = this.ducked || S.channels.dialogue.playing > 0;
                S.channels.music.setLevel(S.ctx, V.music * (low ? 1 - this.music_lowering_percentage : 1), this.music_lowering_speed / 3);   // ~95% of the way in `speed` s
            }
        }

        /** The reverb: a room's tail, made on the spot from its packet (decaying noise whose highs fade
         *  toward `damp`), in two convolvers, so a new room fades in while the old one fades out. */
        class soundReverb {
            constructor(ctx, dest) {
                this.ctx = ctx;
                this.input = ctx.createGain();
                // A slot: input → predelay → convolver → g, and the echoes: input → echo delay ⟲ (damped
                // feedback) → echo level → g, each echo fed into the convolver too, so it rings in the room
                this.slots = [0, 1].map(() => {
                    const delay = ctx.createDelay(2), conv = ctx.createConvolver(), g = ctx.createGain();
                    g.gain.value = 0; this.input.connect(delay); delay.connect(conv); conv.connect(g); g.connect(dest);
                    const echo = ctx.createDelay(4), damp = soundKit.filter(ctx, ['lowpass', 6000]), fb = ctx.createGain(), level = ctx.createGain();
                    fb.gain.value = 0; level.gain.value = 0;
                    this.input.connect(echo); echo.connect(damp); damp.connect(fb); fb.connect(echo);
                    damp.connect(level); level.connect(g); level.connect(delay);
                    return { delay, conv, g, echo, damp, fb, level, key: null };
                });
                this.live = 0; this.key = null; this.room = null;
                this.impulses = new Map();                                // tails already made, by packet
            }

            /** Change room: its tail fades in over `fade` s (a time constant), the last one out. null: no reverb. */
            setRoom(room_packet, fade = 0.35) {
                const key = room_packet ? room_packet.join('|') : 'none';
                if (key === this.key) return;
                this.key = key; this.room = room_packet;
                const now = this.ctx.currentTime, old = this.slots[this.live];
                old.g.gain.setTargetAtTime(0, now, fade);
                if (!room_packet || !(room_packet[3] > 0)) return;
                this.live ^= 1;
                const s = this.slots[this.live];
                if (s.key !== key) {
                    const [, predelay = 0, damp = 6000, , echo = 0, feedback = 0, echo_level = 0] = room_packet, on = echo > 0;
                    s.conv.buffer = this.impulse(room_packet); s.key = key;
                    s.delay.delayTime.setValueAtTime(Math.min(2, predelay / 1000), now);
                    s.echo.delayTime.setValueAtTime(on ? Math.min(4, echo) : 0.01, now);
                    s.damp.frequency.setValueAtTime(damp, now);
                    s.fb.gain.setValueAtTime(on ? Math.min(0.9, feedback) : 0, now);
                    s.level.gain.setValueAtTime(on ? echo_level / Math.max(0.01, room_packet[3]) : 0, now);   // (g carries `wet`: undo it, so echo_level is its own)
                }
                s.g.gain.cancelScheduledValues(now); s.g.gain.setValueAtTime(s.g.gain.value, now);
                s.g.gain.setTargetAtTime(room_packet[3], now, fade);
            }

            /** A room's tail: stereo noise dying away over `decay` s (60 dB), its brightness closing from
             *  full to `damp` Hz along the way (a one-pole lowpass whose corner falls), each side its own. */
            impulse(room_packet) {
                const key = room_packet.slice(0, 3).join('|');                // the tail depends only on decay and damp (and predelay, kept with them)
                if (this.impulses.has(key)) return this.impulses.get(key);
                const [decay, , damp = 6000] = room_packet, ctx = this.ctx, sr = ctx.sampleRate;
                const len = Math.max(1, Math.floor(sr * Math.min(6, decay * 1.1))), buf = ctx.createBuffer(2, len, sr);
                const k60 = Math.log(1000) / (decay * sr);                   // per-sample fall to -60 dB at `decay`
                let seed = 0x2f6b ^ len;
                // mulberry32: 32-bit integer maths throughout. (A plain LCG multiplied in doubles loses its low
                // bits and repeats every few hundred samples: a ~100 Hz buzz in every tail.)
                const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1; };
                const fall = Math.exp(-k60), fade_in = Math.floor(sr * 0.004);
                for (let c = 0; c < 2; c++) {
                    const d = buf.getChannelData(c); let lp = 0, env = 1;
                    for (let i0 = 0; i0 < len; i0 += 128) {                      // the corner moves a block at a time (128 samples: inaudible steps)
                        const fc = 18000 * Math.pow(damp / 18000, i0 / len), a = 1 - Math.exp(-2 * Math.PI * fc / sr), i1 = Math.min(len, i0 + 128);
                        for (let i = i0; i < i1; i++) { lp += (rnd() - lp) * a; d[i] = lp * env; env *= fall; }
                    }
                    for (let i = 0; i < fade_in && i < len; i++) d[i] *= i / fade_in;   // a 4 ms fade-in: no click
                }
                // Even out the loudness, so a long hall and a small room sit at the same level for the same `wet`
                let e = 0; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) e += d[i] * d[i]; }
                const norm = 1 / Math.sqrt(e / 2 + 1e-9);                  // unit energy: `wet` is then the tail's level against the dry sound
                for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] *= norm; }
                this.impulses.set(key, buf);
                return buf;
            }
        }
