        // ===== LV0 BASEMENT =====
        // The sound kit: Web Audio building blocks. Opening the context, the mix buses, envelopes, filters,
        // tones, noise bursts, looped beds and voice caps. It knows nothing about any game: the game's
        // sounds (what a shot or a footstep is made of) are recipes written with it in the Directory.
        //
        // TONE PACKET: [wave, f0, f1, glide, amp, attack, decay, stop]   an oscillator through a gain envelope
        //   wave              'sine' | 'square' | 'sawtooth' | 'triangle'
        //   f0, f1            start pitch (Hz), and the pitch it glides to over `glide` s (f1 null: it holds)
        //   amp, attack       peak level, reached `attack` s in (default 0.003: a soft start, never a click)
        //   decay             s until it has died away (default: glide)
        //   stop              s until the oscillator stops (default: decay + 0.01)
        //
        // BURST PACKET: [buffer, filter, amp, attack, decay, offset, length, rate]   a slice of a noise buffer
        //   filter            a filter packet [type, freq, Q] or a ready node (one whose frequency sweeps)
        //   amp, attack, decay   as for a tone
        //   offset, length    where in the buffer to start (s) and how much to play
        //   rate              playback rate (left as it is when undefined)
        //
        // FILTER PACKET: [type, freq, Q]   a BiquadFilter: 'lowpass' | 'highpass' | 'bandpass' ...
        //
        //   const ctx = soundKit.open('balanced');
        //   const { master, music } = soundKit.mixer(ctx, [1, 0.7]);
        //   soundKit.tone(ctx, master, ctx.currentTime, ['square', 800, 100, 0.15, 0.1]);   // a laser shot
        //   soundKit.burst(ctx, out, t, [noise, ['bandpass', 4200, 2.2], 0.26, 0.004, 0.03, 1.2, 0.06]);
        //   if (!soundKit.cap(counts, 'shoot', 4, 190)) return;   // no more than 4 at once, each held 190 ms
        const soundKit = {
            /** A new AudioContext with a latency hint ('interactive' | 'balanced' | 'playback'), or plain if refused. */
            open (latency_hint) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                try { return new AudioContext({ latencyHint: latency_hint }); }
                catch (e) { return new AudioContext(); }
            },

            /** The mix: [master_level, music_level]. master -> a brick-wall limiter -> the speakers, and a
             *  music bus into the master. A stack of loud sounds would otherwise sum past full scale and clip. */
            mixer (ctx, levels) {
                const master = ctx.createGain();
                master.gain.value = levels[0];
                const limiter = ctx.createDynamicsCompressor();
                limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;   // near-transparent below full scale
                master.connect(limiter); limiter.connect(ctx.destination);
                const music = ctx.createGain();
                music.gain.value = levels[1];
                music.connect(master);
                return { master, limiter, music };
            },

            /** Count live voices for a profiler: every oscillator and buffer source counts while it plays.
             *  Returns the stats object; roll its per-second counters with tickStats(). */
            countVoices (ctx) {
                const S = { live: 0, peak: 0, started: 0, perSec: 0, _t: 0, _n: 0, ms: 0, _ms: 0 };
                for (const name of ['createOscillator', 'createBufferSource']) {
                    const make = ctx[name].bind(ctx);
                    ctx[name] = () => {
                        const n = make(), start = n.start.bind(n);
                        n.start = (...a) => {
                            S.live++; S.started++; if (S.live > S.peak) S.peak = S.live;
                            n.addEventListener('ended', () => { S.live--; }, { once: true });
                            return start(...a);
                        };
                        return n;
                    };
                }
                return S;
            },
            tickStats (S) {
                const now = performance.now();
                if (now - S._t >= 1000) { S.perSec = S.started - S._n; S._n = S.started; S.ms = S._ms; S._ms = 0; S._t = now; S.peakSec = S.peak; S.peak = S.live; }
            },

            /** Bring a gain in over a few ms instead of jumping to it (a jump is a click). */
            softStart (param, t, amp, ramp = 0.003) {
                param.setValueAtTime(0.0001, t);
                param.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + ramp);
            },

            /** A filter from a packet. */
            filter (ctx, filter_packet) {
                const f = ctx.createBiquadFilter();
                f.type = filter_packet[0]; f.frequency.value = filter_packet[1];
                if (filter_packet[2] !== undefined) f.Q.value = filter_packet[2];
                return f;
            },

            /** A gain node at `level`, wired into `dest`. */
            gain (ctx, level, dest) {
                const g = ctx.createGain(); g.gain.value = level; g.connect(dest);
                return g;
            },

            /** Where to connect a sound placed at `pan` (-1..1): a panner into `dest`, or `dest` itself when centred. */
            pan (ctx, dest, pan) {
                if (!ctx.createStereoPanner || !pan) return dest;
                const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest);
                return p;
            },

            /** A tone from a packet, at time t, into dest. Returns the oscillator. */
            tone (ctx, dest, t, tone_packet) {
                const [wave, f0, f1, glide, amp, attack = 0.003] = tone_packet;
                const decay = tone_packet[6] ?? glide, stop = tone_packet[7] ?? decay + 0.01;
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = wave;
                o.frequency.setValueAtTime(f0, t);
                if (f1 != null) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
                o.connect(g); g.connect(dest);
                this.softStart(g.gain, t, amp, attack);
                g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
                o.start(t); o.stop(t + stop);
                return o;
            },

            /** A noise burst from a packet, at time t, into dest. Returns the buffer source. */
            burst (ctx, dest, t, burst_packet) {
                const [buffer, filter, amp, attack, decay, offset, length, rate] = burst_packet;
                const src = ctx.createBufferSource(); src.buffer = buffer;
                if (rate !== undefined) src.playbackRate.value = rate;
                const f = Array.isArray(filter) ? this.filter(ctx, filter) : filter;
                const g = ctx.createGain(); src.connect(f); f.connect(g); g.connect(dest);
                this.softStart(g.gain, t, amp, attack);
                g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
                src.start(t, offset, length);
                return src;
            },

            /** A looped bed: `buffer` through `filters` (nodes, in order) into a silent gain wired to dest,
             *  playing from `offset` s at `rate`. Returns the gain; raise it to hear the bed. */
            loop (ctx, dest, buffer, filters, rate, offset) {
                const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; src.playbackRate.value = rate;
                let node = src; for (const f of filters) { node.connect(f); node = f; }
                const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(dest);
                src.start(0, offset);
                return g;
            },

            /** `seconds` of white noise. */
            whiteNoise (ctx, seconds) {
                const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr), d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                return buf;
            },

            /** `seconds` each of pink noise (soft hiss: rain, wind) and brown noise (low rumble: city, fire,
             *  room tone), drawn from one white stream. */
            noiseBeds (ctx, seconds) {
                const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
                const pink = ctx.createBuffer(1, len, sr), brown = ctx.createBuffer(1, len, sr);
                const pd = pink.getChannelData(0), bd = brown.getChannelData(0);
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
                for (let i = 0; i < len; i++) {
                    const w = Math.random() * 2 - 1;                  // Paul Kellet's pink filter
                    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
                    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
                    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
                    last = (last + 0.02 * w) / 1.02; bd[i] = last * 3.5;   // brown: leaky integrated white
                }
                return { pink, brown };
            },

            /** A voice cap: true (and one more counted under `key` for `ms`) if fewer than `max` are playing. */
            cap (counts, key, max, ms) {
                if ((counts[key] || 0) >= max) return false;
                counts[key] = (counts[key] || 0) + 1;
                setTimeout(() => { counts[key]--; }, ms);
                return true;
            }
        };
