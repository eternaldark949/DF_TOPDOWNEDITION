        // ===== LV0 BASEMENT =====
        // The sound system: one owner for the audio. The context, the mix (channels into a master), the
        // volume control with its dial, a room's reverb, and sound files played by packet. Like the sound
        // kit under it, it knows nothing about any game: the game names its rooms, its sounds and its
        // music in the Directory and hands them over as packets.
        // (The terms are from the g7 engine (base game script 2.0): channels were its audio threads.)
        //
        //   master ── limiter ── speakers
        //     ├── dialogue ┐
        //     ├── music    ├── each channel: a wet input (its send feeds the reverb) and a dry one (it doesn't)
        //     ├── sfx      ┘
        //     └── reverb  (two convolvers: a new room fades in as the old one fades out)
        //
        // LEVELS PACKET: { master, dialogue, music, sfx }   0..1 each (volumeControl)
        // DIAL PACKET:   [music_lowering_percentage, music_lowering_speed]   how far the music dips under
        //                dialogue, and how fast (s) it goes down and comes back
        // ROOM PACKET:   [decay, predelay, damp, wet]   the reverb of a place
        //   decay             s for the tail to die away (60 dB)
        //   predelay          ms before the first reflections (the room's size)
        //   damp              Hz the highs fall to by the end of the tail (soft rooms, low; tile and glass, high)
        //   wet               how much of the sends reach the speakers (0: no reverb at all)
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
                this.master.connect(L); L.connect(ctx.destination);
                this.reverb = new soundReverb(ctx, this.master);
                this.channels = {};
                for (const name of soundSystem.CHANNELS) this.channels[name] = new soundChannel(ctx, this.master, this.reverb, levels[name] ?? 1, soundSystem.SENDS[name]);
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
            constructor(ctx, master, reverb, level, send = 1) {
                this.level = level;
                this.gain_wet = soundKit.gain(ctx, level, master);
                this.gain_dry = soundKit.gain(ctx, level, master);
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
                this.slots = [0, 1].map(() => {
                    const delay = ctx.createDelay(0.2), conv = ctx.createConvolver(), g = ctx.createGain();
                    g.gain.value = 0; this.input.connect(delay); delay.connect(conv); conv.connect(g); g.connect(dest);
                    return { delay, conv, g, key: null };
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
                    const predelay = room_packet[1] || 0;
                    s.conv.buffer = this.impulse(room_packet); s.key = key;
                    s.delay.delayTime.setValueAtTime(Math.min(0.2, predelay / 1000), now);
                }
                s.g.gain.cancelScheduledValues(now); s.g.gain.setValueAtTime(s.g.gain.value, now);
                s.g.gain.setTargetAtTime(room_packet[3], now, fade);
            }

            /** A room's tail: stereo noise dying away over `decay` s (60 dB), its brightness closing from
             *  full to `damp` Hz along the way (a one-pole lowpass whose corner falls), each side its own. */
            impulse(room_packet) {
                const key = room_packet.join('|');
                if (this.impulses.has(key)) return this.impulses.get(key);
                const [decay, , damp = 6000] = room_packet, ctx = this.ctx, sr = ctx.sampleRate;
                const len = Math.max(1, Math.floor(sr * Math.min(6, decay * 1.1))), buf = ctx.createBuffer(2, len, sr);
                const k60 = Math.log(1000) / (decay * sr);                   // per-sample fall to -60 dB at `decay`
                let seed = 0x2f6b ^ len;
                const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
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
