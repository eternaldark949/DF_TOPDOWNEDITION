        /* =====================================================================
           AUDIO SYSTEM
           ---------------------------------------------------------------------
           Procedural sound effects using Web Audio API. No external audio
           files needed - everything is synthesized with oscillators.
           
           Shares a single AudioContext with MusicWidgetSystem to minimize
           memory overhead on mobile (~2-4MB savings).
           
           Key Methods:
           - init()          : Unlocks audio context (required after user gesture)
           - sfx(type)       : Plays procedural sound effect
           
           Sound Types:
           - 'shoot'   : High pitch laser drop (square wave, 800Hz → 100Hz)
           - 'explode' : Low rumble (sawtooth wave, 100Hz → 10Hz)
           - 'ui'      : High blip for menu interactions (sine wave, 1200Hz)
           - 'flit'    : Rising warp for teleport (triangle wave, 200Hz → 600Hz)
           ===================================================================== */
        class AudioSystem {
            constructor() {
                // Shared Web Audio API context - used by SFX and MusicWidgetSystem
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
                
                // MASTER GAIN BUS — single point of mute for ALL audio (SFX + music).
                // Both sfx() oscillators and MusicWidgetSystem.trackSource route through
                // this node instead of connecting directly to ctx.destination, so flipping
                // masterGain.gain silences the entire game in one place.
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = GameSettings.audioEnabled ? 1.0 : 0.0;
                this.masterGain.connect(this.ctx.destination);
            }
        
            // Must be called after user interaction to unlock audio (browser policy)
            init() {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            }
            
            // Centralized audio toggle. Used by Settings UI and save-load restore.
            // Pass true/false; reads GameSettings.audioEnabled when called with no arg.
            setEnabled(on) {
                if (typeof on === 'boolean') GameSettings.audioEnabled = on;
                this.masterGain.gain.value = GameSettings.audioEnabled ? 1.0 : 0.0;
            }
        
            /* ---------------------------------------------------------------
               PROCEDURAL SFX GENERATOR
               ---------------------------------------------------------------
               Creates sounds using oscillators and gain envelopes.
               No external audio files needed - everything is synthesized.
               
               Anatomy of a procedural sound:
               1. Create oscillator (waveform generator)
               2. Create gain node (volume control)
               3. Connect: oscillator → gain → speakers
               4. Set frequency/volume envelopes over time
               5. Start and stop at precise times
               --------------------------------------------------------------- */
            sfx(type, opts = {}) {
                // Ensure audio context is active
                if (this.ctx.state === 'suspended') this.ctx.resume();

                // Muffled = heard through walls: a lowpass in front of the master bus
                let out = this.masterGain;
                if (opts.muffled) {
                    out = this.ctx.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 160;
                    const trim = this.ctx.createGain(); trim.gain.value = 0.6;
                    out.connect(trim); trim.connect(this.masterGain);
                }

                // Create audio nodes
                const osc = this.ctx.createOscillator();  // Generates the tone
                const gain = this.ctx.createGain();       // Controls volume
                osc.connect(gain);
                gain.connect(out);                        // Route through master mute bus

                const now = this.ctx.currentTime;

                if (type === 'shoot') {
                    // LASER SHOT: Square wave dropping from high to low pitch
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                } 
                else if (type === 'explode') {
                    // EXPLOSION: Harsh sawtooth rumbling down
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(100, now);
                    osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                }
                else if (type === 'thunder') {
                    // THUNDER: low sawtooth rumble with a slow decay. Two detuned
                    // sweeps layered so it reads as a rolling boom rather than a
                    // single tone. Pitch is randomised per strike so repeated
                    // lightning in a long storm never sounds looped.
                    const base = 48 + Math.random() * 26;
                    const dur = 1.4 + Math.random() * 1.3;
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(base, now);
                    osc.frequency.exponentialRampToValueAtTime(base * 0.32, now + dur);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                    osc.start(now);
                    osc.stop(now + dur);

                    // Second, lower body for weight
                    const sub = this.ctx.createOscillator();
                    const subGain = this.ctx.createGain();
                    sub.connect(subGain);
                    subGain.connect(out);
                    sub.type = 'triangle';
                    sub.frequency.setValueAtTime(base * 0.5, now);
                    sub.frequency.exponentialRampToValueAtTime(base * 0.2, now + dur);
                    subGain.gain.setValueAtTime(0.0001, now);
                    subGain.gain.exponentialRampToValueAtTime(0.11, now + 0.14);
                    subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                    sub.start(now);
                    sub.stop(now + dur);
                }
                else if (type === 'ui') {
                    // UI BLIP: Clean sine tone, short and high
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1200, now);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
                }
                else if (type === 'flit') {
                    // TELEPORT: Smooth triangle wave rising in pitch
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(200, now);
                    osc.frequency.linearRampToValueAtTime(600, now + 0.2);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                }
            }
        }
        // Global audio system instance
        const audioSys = new AudioSystem();

        /* =====================================================================
           AMBIENCE — procedural sound beds that crossfade with place and weather
           ---------------------------------------------------------------------
           Looping noise layers (rain, rain-on-roof, wind, city, room tone,
           fireplace) whose gains glide toward targets recomputed every frame
           from the map, the room you're in, the weather and the time of day,
           plus sparse one-shots (crackles, passing cars, horns, drips, doors).
           Everything is generated in code; it all runs through masterGain, so
           the existing audio toggle mutes it.
           ===================================================================== */
        class AmbienceSystem {
            constructor(audio) {
                this.audio = audio;
                this.ready = false;
                this.voices = 0;
                this.next = { car: 0, horn: 0, drip: 0 };
            }

            _build() {
                const ctx = this.audio.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 3);
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
                this.pink = pink; this.brown = brown;
                this.bus = ctx.createGain(); this.bus.gain.value = 0; this.bus.connect(this.audio.masterGain);
                const bq = (type, f, Q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
                const layer = (buf, filters, rate) => {
                    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate;
                    let node = src; for (const f of filters) { node.connect(f); node = f; }
                    const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(this.bus);
                    src.start(0, Math.random() * 2.5);
                    return { g, t: 0 };
                };
                const windBand = bq('bandpass', 600, 0.9);
                this.L = {
                    rain: layer(pink, [bq('highpass', 400), bq('lowpass', 7000)], 1),
                    rainIn: layer(pink, [bq('lowpass', 700)], 0.93),
                    wind: layer(pink, [windBand], 0.87),
                    city: layer(brown, [bq('lowpass', 380)], 1.07),
                    fire: layer(brown, [bq('lowpass', 250)], 0.81),
                    room: layer(brown, [bq('lowpass', 140)], 0.71)
                };
                const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();   // wind gusts drift the band around
                lfo.frequency.value = 0.07; lfoAmt.gain.value = 300; lfo.connect(lfoAmt); lfoAmt.connect(windBand.frequency); lfo.start();
                for (const f of [58, 116]) {                                      // appliance hum in the room tone
                    const o = ctx.createOscillator(), og = ctx.createGain();
                    o.frequency.value = f; og.gain.value = f === 58 ? 0.5 : 0.18; o.connect(og); og.connect(this.L.room.g); o.start();
                }
                this.ready = true;
            }

            _set(layer, v, tc) {
                if (Math.abs(v - layer.t) < 0.003) return;
                layer.t = v; layer.g.gain.setTargetAtTime(v, this.audio.ctx.currentTime, tc);
            }

            /** Called every frame from GameEngine.loop (also while paused). */
            update(game) {
                const a = this.audio;
                if (!this.ready) { if (a.ctx.state !== 'running') return; this._build(); }
                const map = game.activeMap; if (!map) return;
                const now = a.ctx.currentTime, w = game.weather, rs = game.roomSystem;
                const indoorMap = map.type === 'indoor', veranda = !!(rs && rs.active && rs.isPlayerOutdoor());
                const outside = !indoorMap || veranda, apt = map.id === 'apt_949';
                const thresh = (CONFIG.WEATHER && CONFIG.WEATHER.SCHED_RAIN_THRESHOLD) || 0.15;
                const rain = w && w.intensity > thresh ? Math.min(1, w.intensity) : 0;
                const wind = w ? Math.min(1, w.wind || 0) : 0;
                const hour = ((game.worldMinutes || 0) % 1440) / 60, day = Math.max(0, 1 - Math.abs(13 - hour) / 7);
                const p = game.player, fireD = apt && p ? Math.hypot(p.x - 580, p.y - 432) : 1e9, fire = Math.pow(Math.max(0, 1 - fireD / 420), 2);
                const paused = !!game.paused;
                const vol = GameSettings.ambienceVolume ?? 0.7;

                this.bus.gain.setTargetAtTime(vol * 1.9 * (paused ? 0.25 : 1), now, 0.4);   // layer levels are set low; 1.9 brings the bed to about -22 dBFS
                this._set(this.L.rain, outside ? 0.3 * rain : 0, 0.8);
                this._set(this.L.rainIn, outside ? 0 : 0.22 * rain, 0.8);
                this._set(this.L.wind, outside ? 0.04 + 0.12 * wind : 0.015 * wind, 1.2);
                this._set(this.L.city, !indoorMap ? 0.1 + 0.07 * day : veranda ? 0.09 : apt ? 0.025 : 0.015, 1.0);
                this._set(this.L.room, apt && !veranda ? 0.035 : 0, 1.0);
                this._set(this.L.fire, 0.22 * fire, 0.5);
                if (paused) return;

                // Sparse one-shots
                if (fire > 0.02 && Math.random() < 0.09) this._crackle(0.35 * fire);
                if (outside && now > this.next.car) { this._carPass(indoorMap ? 0.05 : 0.08); this.next.car = now + 6 + Math.random() * 9; }
                if (outside && now > this.next.horn) { if (this.next.horn) this._horn(indoorMap ? 0.012 : 0.02); this.next.horn = now + 20 + Math.random() * 30; }
                if (!outside && rain > 0 && now > this.next.drip) { this._drip(0.02 * rain); this.next.drip = now + 0.6 + Math.random() * 2.4; }
            }

            /** Map menu / game stop: let everything fade out. */
            silence() { if (this.ready) this.bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.3); }

            _voice(nodes, dur) {
                if (this.voices >= 6) return false;
                this.voices++; setTimeout(() => { this.voices--; }, dur * 1000 + 50);
                return true;
            }

            _burst(buf, dur, filter, gain, env) {
                const ctx = this.audio.ctx, now = ctx.currentTime;
                const src = ctx.createBufferSource(); src.buffer = buf;
                const g = ctx.createGain(); src.connect(filter); filter.connect(g); g.connect(this.bus);
                env(g.gain, now, gain);
                src.start(now, Math.random() * 2.5, dur + 0.05);
                return { src, filter, g, now };
            }

            _crackle(v) {
                if (!this._voice(null, 0.05)) return;
                const ctx = this.audio.ctx, f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000 + Math.random() * 3000; f.Q.value = 1.5;
                const d = 0.005 + Math.random() * 0.035;
                this._burst(this.pink, d, f, v * (0.4 + Math.random() * 0.6), (g, t, a) => { g.setValueAtTime(a, t); g.exponentialRampToValueAtTime(0.0001, t + d); });
            }

            _carPass(v) {
                if (!this._voice(null, 2.4)) return;
                const ctx = this.audio.ctx, f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
                const now = ctx.currentTime;
                f.frequency.setValueAtTime(300, now); f.frequency.linearRampToValueAtTime(900, now + 1.1); f.frequency.linearRampToValueAtTime(300, now + 2.3);
                let node = f;
                if (ctx.createStereoPanner) {
                    const pan = ctx.createStereoPanner(), dir = Math.random() < 0.5 ? -1 : 1;
                    pan.pan.setValueAtTime(-0.8 * dir, now); pan.pan.linearRampToValueAtTime(0.8 * dir, now + 2.3);
                    f.connect(pan); node = pan;
                }
                const src = ctx.createBufferSource(); src.buffer = this.brown; src.playbackRate.value = 1.6;
                const g = ctx.createGain(); src.connect(f); node.connect(g); g.connect(this.bus);
                g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
                src.start(now, Math.random() * 2.5, 2.4);
            }

            _horn(v) {
                if (!this._voice(null, 0.8)) return;
                const ctx = this.audio.ctx, now = ctx.currentTime, lp = ctx.createBiquadFilter(), g = ctx.createGain();
                lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g); g.connect(this.bus);
                for (const f of [392, 397]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.9 + Math.random() * 0.2); o.connect(lp); o.start(now); o.stop(now + 0.75); }
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(v, now + 0.03); g.gain.setValueAtTime(v, now + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
                g.gain.exponentialRampToValueAtTime(v, now + 0.4); g.gain.setValueAtTime(v, now + 0.62); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
            }

            _drip(v) {
                if (!this._voice(null, 0.1)) return;
                const ctx = this.audio.ctx, now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(1800 + Math.random() * 900, now); o.frequency.exponentialRampToValueAtTime(900, now + 0.05);
                o.connect(g); g.connect(this.bus);
                g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
                o.start(now); o.stop(now + 0.07);
            }

            /** Door sounds: 'creak' | 'latch' | 'whoosh', quieter with distance from the player. */
            doorEvent(kind, door) {
                if (!this.ready || typeof game === 'undefined' || game.paused) return;
                const p = game.player, cx = door.x + door.w / 2, cy = door.y + door.h / 2;
                const near = p ? Math.max(0, 1 - Math.hypot(p.x - cx, p.y - cy) / 500) : 1;
                if (near <= 0.02) return;
                this.eventCounts = this.eventCounts || {}; this.eventCounts[kind] = (this.eventCounts[kind] || 0) + 1;
                const ctx = this.audio.ctx, now = ctx.currentTime;
                if (kind === 'creak') {
                    if (!this._voice(null, 0.6)) return;
                    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
                    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 4;
                    const f0 = 170 + Math.random() * 60;
                    o.frequency.setValueAtTime(f0, now); o.frequency.linearRampToValueAtTime(f0 * 1.25, now + 0.18);
                    o.frequency.linearRampToValueAtTime(f0 * 0.95, now + 0.34); o.frequency.linearRampToValueAtTime(f0 * 1.15, now + 0.5);
                    o.connect(bp); bp.connect(g); g.connect(this.bus);
                    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05 * near, now + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
                    o.start(now); o.stop(now + 0.56);
                } else if (kind === 'latch') {
                    if (!this._voice(null, 0.1)) return;
                    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 3;
                    this._burst(this.pink, 0.025, f, 0.18 * near, (gg, t, amp) => { gg.setValueAtTime(amp, t); gg.exponentialRampToValueAtTime(0.0001, t + 0.025); });
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(70, now + 0.07);
                    o.connect(g); g.connect(this.bus); g.gain.setValueAtTime(0.09 * near, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
                    o.start(now); o.stop(now + 0.09);
                } else if (kind === 'whoosh') {
                    if (!this._voice(null, 0.4)) return;
                    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
                    f.frequency.setValueAtTime(700, now); f.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
                    this._burst(this.pink, 0.35, f, 0.07 * near, (gg, t, amp) => { gg.setValueAtTime(0.0001, t); gg.exponentialRampToValueAtTime(amp, t + 0.1); gg.exponentialRampToValueAtTime(0.0001, t + 0.35); });
                }
            }
        }
        const ambience = new AmbienceSystem(audioSys);

        // Nothing plays in a background tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) audioSys.ctx.suspend();
            else if (typeof game !== 'undefined' && game.running) audioSys.ctx.resume();
        });


