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
           - 'crunch'  : A car hit (thump + metal noise + glass), opts.gain by impact
           - tyres(l)  : Looped tyre squeal for the driven car, level 0..1
           - engine(s) : The driven car's electric hum (ENGINE_HUM per brand)
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

                // MUSIC BUS — all music (the apartment's track, the phone radio) goes through
                // here into the master, so the Music slider sets it apart from sound effects.
                this.musicGain = this.ctx.createGain();
                this.musicGain.gain.value = GameSettings.musicVolume ?? 0.7;
                this.musicGain.connect(this.masterGain);
            }

            /** Music slider (0..1). */
            setMusicVolume(v) {
                GameSettings.musicVolume = Math.max(0, Math.min(1, v));
                this.musicGain.gain.setTargetAtTime(GameSettings.musicVolume, this.ctx.currentTime, 0.05);
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
                else if (type === 'knock') {
                    // KNOCK: a gloved fist on the van's partition — a short, dull metal thud
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.006);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
                    osc.start(now);
                    osc.stop(now + 0.14);
                }
                else if (type === 'bump') {
                    // BUMP: the van hitting a seam in the road — a low thump with a rattle after
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(90, now);
                    osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.32);
                    const r = this.ctx.createOscillator(), rg = this.ctx.createGain();
                    r.type = 'square'; r.frequency.setValueAtTime(420, now + 0.05); r.connect(rg); rg.connect(out);
                    rg.gain.setValueAtTime(0.0001, now); rg.gain.exponentialRampToValueAtTime(0.018, now + 0.06); rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
                    r.start(now + 0.04); r.stop(now + 0.22);
                }
                else if (type === 'crunch') {
                    // CRUNCH: a car hit — a body thump under a short burst of torn metal and glass.
                    // opts.gain (0..1) scales it with the impact.
                    const v = Math.max(0.15, Math.min(1, opts.gain ?? 0.6));
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(120, now);
                    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.32 * v, now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    const n = this.ctx.createBufferSource(); n.buffer = this._noise();
                    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 900; bp.Q.value = 1.1;
                    const ng = this.ctx.createGain(); n.connect(bp); bp.connect(ng); ng.connect(out);
                    ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(0.22 * v, now + 0.006);
                    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.09 + 0.1 * v);
                    n.start(now, Math.random() * 0.5, 0.25);
                    if (v > 0.5) for (let i = 0; i < 3; i++) {             // glass settling
                        const t = now + 0.05 + Math.random() * 0.12, o = this.ctx.createOscillator(), og = this.ctx.createGain();
                        o.type = 'triangle'; o.frequency.value = 3200 + Math.random() * 2400; o.connect(og); og.connect(out);
                        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.03 * v, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
                        o.start(t); o.stop(t + 0.06);
                    }
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

            /**
             * The driven car's motor: a low, smooth, many-voiced electric hum. A detuned pair
             * (the body) with a slow chorus, a quiet fifth (warmth), a filtered saw that opens
             * with the throttle (shimmer), and a faint high whine past half speed. Pitch glides
             * with speed — no gears. Each brand has its own root (ENGINE_HUM). Built on first
             * use; `on` swells it in and out.
             *   engine({ on, speed01, throttle, brand })
             */
            engine(st) {
                const on = !!(st && st.on);
                if (!this._eng) {
                    if (!on) return;
                    const c = this.ctx, bus = c.createGain(); bus.gain.value = 0; bus.connect(this.masterGain);
                    const osc = (type, g0) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; g.gain.value = g0; o.connect(g); o.start(); return { o, g }; };
                    const body1 = osc('sine', 0.5), body2 = osc('sine', 0.3), fifth = osc('triangle', 0.09), whine = osc('sine', 0);
                    const saw = osc('sawtooth', 0.07), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8; lp.frequency.value = 300;
                    saw.g.connect(lp);
                    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;   // rounds off the whole bank
                    for (const n of [body1.g, body2.g, fifth.g, whine.g, lp]) n.connect(tone);
                    tone.connect(bus);
                    const chorus = c.createOscillator(), cg = c.createGain(); chorus.frequency.value = 0.23; cg.gain.value = 5;   // ±5 cents, slowly
                    chorus.connect(cg); cg.connect(body2.o.detune); chorus.start();
                    body1.o.detune.value = -4; body2.o.detune.value = 4;
                    this._eng = { bus, body1, body2, fifth, whine, saw, lp };
                }
                const E = this._eng, now = this.ctx.currentTime, H = ENGINE_HUM[st && st.brand] || ENGINE_HUM.Gelfash;
                const v = Math.max(0, Math.min(1, (st && st.speed01) || 0)), thr = Math.max(0, Math.min(1, (st && st.throttle) || 0));
                const f = H.root * (1 + 1.1 * v);                                  // one smooth glide, idle to top speed
                const glide = (p, x) => p.setTargetAtTime(x, now, 0.12);
                glide(E.body1.o.frequency, f); glide(E.body2.o.frequency, f * 2);
                glide(E.fifth.o.frequency, f * 1.5); glide(E.saw.o.frequency, f * 3); glide(E.whine.o.frequency, f * 8);
                glide(E.lp.frequency, 250 + 1250 * Math.max(thr, v * 0.6) * H.shimmer);
                glide(E.whine.g.gain, H.whine * Math.max(0, v - 0.5) * 2 * 0.06);
                glide(E.body1.g.gain, 0.5 * H.body);
                const level = on ? H.level * (0.72 + 0.18 * v + 0.1 * thr) : 0;
                E.bus.gain.setTargetAtTime(level, now, on ? (this._engOn ? 0.1 : 0.2) : 0.27);   // swells in over ~0.6 s, out over ~0.8 s
                this._engOn = on;
            }

            /** One second of white noise, made once. */
            _noise() {
                if (this._noiseBuf) return this._noiseBuf;
                const sr = this.ctx.sampleRate, buf = this.ctx.createBuffer(1, sr, sr), d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                return (this._noiseBuf = buf);
            }

            /**
             * The driven car's tyres: a looped squeal whose level (0..1) follows how hard they're
             * sliding. Built on first use; pitch wanders a little so a long slide never drones.
             */
            tyres(level) {
                const L = Math.max(0, Math.min(1, level || 0));
                if (!this._tyre) {
                    if (L <= 0) return;
                    const c = this.ctx, src = c.createBufferSource(); src.buffer = this._noise(); src.loop = true;
                    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 9;
                    const bp2 = c.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2250; bp2.Q.value = 6;
                    const g = c.createGain(); g.gain.value = 0;
                    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6.5; lg.gain.value = 90;
                    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
                    src.connect(bp); src.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(this.masterGain);
                    src.start();
                    this._tyre = { g, bp };
                }
                const now = this.ctx.currentTime;
                this._tyre.g.gain.setTargetAtTime(L * 0.5, now, L > this._tyreL ? 0.03 : 0.09);
                this._tyre.bp.frequency.setTargetAtTime(1300 + 500 * L, now, 0.1);
                this._tyreL = L;
            }
        }
        /** Each brand's motor (AudioSystem.engine): root pitch in Hz and how the voices sit. */
        const ENGINE_HUM = {
            LADY:    { root: 44, body: 1.15, shimmer: 0.8, whine: 0.8, level: 0.11 },   // darkest, most body
            Zenxera: { root: 55, body: 1.0,  shimmer: 1.2, whine: 1.0, level: 0.1 },    // brighter, more shimmer
            Gelfash: { root: 62, body: 0.85, shimmer: 0.9, whine: 0.5, level: 0.09 }    // thinner, little whine
        };

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
                    room: layer(brown, [bq('lowpass', 140)], 0.71),
                    road: layer(brown, [bq('lowpass', 95)], 0.63)          // tyres on wet asphalt, felt through the van floor
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
                const realm = map.id.startsWith('keepers_');                  // the prologue's hill and parlor: no city out there
                const outside = !indoorMap || veranda || map.id === 'keepers_hill', apt = map.id === 'apt_949';
                const thresh = (CONFIG.WEATHER && CONFIG.WEATHER.SCHED_RAIN_THRESHOLD) || 0.15;
                const rain = w && w.intensity > thresh ? Math.min(1, w.intensity) : 0;
                const wind = w ? Math.min(1, w.wind || 0) : 0;
                const hour = ((game.worldMinutes || 0) % 1440) / 60, day = Math.max(0, 1 - Math.abs(13 - hour) / 7);
                const p = game.player, cam = game.camera;
                const H = HEARTHS[map.id], fireD = !H ? 1e9 : apt ? (p ? Math.hypot(p.x - H.x, p.y - H.y) : 1e9) : Math.hypot(cam.x - H.x, cam.y - H.y) * 0.6, fire = Math.pow(Math.max(0, 1 - fireD / 420), 2);
                const paused = !!game.paused;
                const vol = GameSettings.ambienceVolume ?? 0.7;
                const drv = !paused && game.isDriving && game.car && game.car.controlMode === 'PLAYER';
                a.tyres(drv ? Math.min(1, (game.car.tyreSlip || 0) * 0.45) : 0);   // the driven car's tyres, however hard they're sliding
                const car = game.car, inCar = !paused && game.isDriving && car && (car.controlMode === 'PLAYER' || car.controlMode === 'AI');
                a.engine({ on: inCar, brand: car && car.brand, speed01: car ? Math.abs(car.speed || 0) / (car.maxSpeed || 10) : 0,
                           throttle: car ? Math.abs(car.controlMode === 'PLAYER' ? (car.pedal || 0) : (car.manualGas || 0)) : 0 });   // her motor (auto-drive too)

                this.bus.gain.setTargetAtTime(vol * 1.9 * (paused ? 0.25 : 1) * (1 - 0.45 * (game.scopeK || 0)), now, 0.4);   // scoped: the world goes quiet   // layer levels are set low; 1.9 brings the bed to about -22 dBFS
                const van = map.id === 'van_interior', rolling = van && game.vanMoving !== false;   // the crew's van: rain drums on the roof, the road hums underneath
                this._set(this.L.rain, outside && !realm ? 0.3 * rain : 0, 0.8);
                this._set(this.L.rainIn, van ? 0.2 : outside ? 0 : 0.22 * rain, 0.8);
                this._set(this.L.road, rolling ? 0.32 : 0, rolling ? 1.2 : 0.6);
                this._set(this.L.wind, outside ? 0.04 + 0.12 * wind : 0.015 * wind, 1.2);
                this._set(this.L.city, realm ? 0 : !indoorMap ? 0.1 + 0.07 * day : veranda ? 0.09 : apt ? 0.025 : 0.015, 1.0);
                this._set(this.L.room, apt && !veranda ? 0.035 : 0, 1.0);
                this._set(this.L.fire, 0.22 * fire, 0.5);
                this._music(game, paused);
                if (paused) return;

                // Sparse one-shots
                if (fire > 0.02 && Math.random() < 0.09) this._crackle(0.35 * fire);
                if (outside && !realm && now > this.next.car) { this._carPass(indoorMap ? 0.05 : 0.08); this.next.car = now + 6 + Math.random() * 9; }
                if (outside && !realm && now > this.next.horn) { if (this.next.horn) this._horn(indoorMap ? 0.012 : 0.02); this.next.horn = now + 20 + Math.random() * 30; }
                if (!outside && rain > 0 && now > this.next.drip) { this._drip(0.02 * rain); this.next.drip = now + 0.6 + Math.random() * 2.4; }
            }

            /** Map menu / game stop: let everything fade out. */
            silence() {
                if (!this.ready) return;
                const now = this.audio.ctx.currentTime;
                this.bus.gain.setTargetAtTime(0, now, 0.3);
                if (this._mus) { this._mus.g.gain.setTargetAtTime(0, now, 0.3); this._mus.level = 0; }
            }

            /**
             * A map's soundtrack (MAP_MUSIC): loops while you're on that map, fading in and out.
             * With rooms, it plays from the room its speakers are in: full there, quieter and
             * muffled elsewhere (as if through a wall, or the glass from a veranda), and an open
             * door between lets more through. It ducks for the pause menu and stops for the phone radio.
             */
            _music(game, paused) {
                const ctx = this.audio.ctx, now = ctx.currentTime;
                let spec = game.activeMap && MAP_MUSIC[game.activeMap.id];
                // A track that belongs to one area of a map (`area`, e.g. the graveyard): full inside,
                // rising over `fade` px as 949 (or her car) comes up to it, silent and stopped beyond
                let areaK = 1;
                if (spec && spec.area) {
                    const A = spec.area, who = game.isDriving && game.car ? game.car : game.player;
                    const dx = who ? Math.max(A.x - who.x, 0, who.x - (A.x + A.w)) : 1e9, dy = who ? Math.max(A.y - who.y, 0, who.y - (A.y + A.h)) : 1e9;
                    const t = Math.max(0, 1 - Math.hypot(dx, dy) / (spec.fade || 500));
                    areaK = t * t * (3 - 2 * t);
                    if (areaK <= 0) spec = null;
                }
                const M = this._mus || (this._mus = (() => {
                    const f = ctx.createBiquadFilter(), g = ctx.createGain();
                    f.type = 'lowpass'; f.frequency.value = 18000; f.Q.value = 0.5; g.gain.value = 0;
                    f.connect(g); g.connect(this.audio.musicGain);
                    return { f, g, src: null, name: null, loading: null, level: 0, cut: 18000, quietSince: now };
                })());
                // Start the track for this map (decoded once)
                if (spec && M.name !== spec.track && M.loading !== spec.track) {
                    M.loading = spec.track;
                    loadSound(spec.track).then(buf => {
                        M.loading = null;
                        if (!buf) return;
                        const cur = game.activeMap && MAP_MUSIC[game.activeMap.id];
                        if (!cur || cur.track !== spec.track) return;       // left the map while it decoded
                        if (M.src) { try { M.src.stop(); } catch (e) { /* already stopped */ } }
                        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(M.f); s.start();
                        M.src = s; M.name = spec.track; M.t0 = ctx.currentTime; M.dur = buf.duration;
                    });
                }
                // How loud and how bright, from where 949 is
                let level = 0, cut = 18000;
                if (spec && M.name === spec.track) {
                    level = (spec.volume ?? 0.5) * areaK;
                    const rs = game.roomSystem, room = rs && rs.active ? rs.currentRoom : null;
                    if (room && spec.room && room.id !== spec.room) {
                        let open = 0;                                        // an open door straight to the speakers' room
                        for (const d of rs.doors) if (d.rooms.includes(room.id) && d.rooms.includes(spec.room)) open = Math.max(open, d.openAmount);
                        if (room.type === 'outdoor') { level *= 0.35 + 0.45 * open; cut = 550 + 5000 * open; }
                        else { level *= 0.55 + 0.35 * open; cut = 900 + 6000 * open; }
                    }
                    if (paused) level *= 0.3;
                    if (game.musicWidget && game.musicWidget.isPlaying) level = 0;   // the phone radio takes over
                }
                if (Math.abs(level - M.level) > 0.002) { M.level = level; M.g.gain.setTargetAtTime(level, now, level > 0 ? 0.6 : 0.8); }
                if (Math.abs(cut - M.cut) > 20) { M.cut = cut; M.f.frequency.setTargetAtTime(cut, now, 0.35); }
                // Off this map: once faded out, stop it
                if (!spec && M.src) {
                    if (M.level > 0.002) M.quietSince = now;
                    else if (now - M.quietSince > 4) { try { M.src.stop(); } catch (e) { /* already stopped */ } M.src = null; M.name = null; }
                } else M.quietSince = now;
            }

            /** Beats played so far of this map's track (MAP_MUSIC bpm/beat0), counted from where the
             *  speakers actually are in the loop, or null when it isn't playing. Lights keep time with it. */
            musicBeat(game) {
                const M = this._mus, spec = game.activeMap && MAP_MUSIC[game.activeMap.id];
                if (!M || !M.src || !spec || !spec.bpm || M.name !== spec.track || M.level < 0.002) return null;
                const ctx = this.audio.ctx;
                if (ctx.state !== 'running') return null;                       // a locked or paused clock stands still
                const el = ctx.currentTime - M.t0 - (ctx.outputLatency || ctx.baseLatency || 0);
                if (el < 0) return null;
                const loops = Math.floor(el / M.dur), perLoop = Math.round(M.dur * spec.bpm / 60);
                return loops * perLoop + ((el - loops * M.dur) - (spec.beat0 || 0)) * spec.bpm / 60;
            }

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
                } else if (kind === 'thud') {                                 // a round into a wooden leaf
                    if (!this._voice(null, 0.12)) return;
                    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
                    this._burst(this.pink, 0.06, f, 0.22 * near, (gg, t, amp) => { gg.setValueAtTime(amp, t); gg.exponentialRampToValueAtTime(0.0001, t + 0.06); });
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.frequency.setValueAtTime(120, now); o.frequency.exponentialRampToValueAtTime(60, now + 0.1);
                    o.connect(g); g.connect(this.bus); g.gain.setValueAtTime(0.12 * near, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
                    o.start(now); o.stop(now + 0.12);
                } else if (kind === 'tink') {                                 // a round glancing off glass
                    if (!this._voice(null, 0.3)) return;
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'sine'; o.frequency.setValueAtTime(2600 + Math.random() * 500, now);
                    o.connect(g); g.connect(this.bus); g.gain.setValueAtTime(0.06 * near, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
                    o.start(now); o.stop(now + 0.3);
                    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000;
                    this._burst(this.pink, 0.03, f, 0.12 * near, (gg, t, amp) => { gg.setValueAtTime(amp, t); gg.exponentialRampToValueAtTime(0.0001, t + 0.03); });
                } else if (kind === 'whoosh') {
                    if (!this._voice(null, 0.4)) return;
                    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
                    f.frequency.setValueAtTime(700, now); f.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
                    this._burst(this.pink, 0.35, f, 0.07 * near, (gg, t, amp) => { gg.setValueAtTime(0.0001, t); gg.exponentialRampToValueAtTime(amp, t + 0.1); gg.exponentialRampToValueAtTime(0.0001, t + 0.35); });
                }
            }
        }
        /* A soundtrack per map: `track` names a file in assets/audio (without the extension),
           `room` is where its speakers are (it's fullest there), `volume` its level; `area` {x, y, w, h}
           keeps it to one part of the map, fading in over `fade` px as you come up to it. */
        const MAP_MUSIC = {
            apt_949: { track: 'silver queen tst', room: 'main_room', volume: 0.5 },   // the Silver Queen suite
            // Swig (the club's cut): a 24-bar loop at 140 BPM, the kick on the first sample; the club's lights dance to it
            moon_city_nightclub: { track: 'moon city nightclub - swig', room: 'hall', volume: 0.55, bpm: 140, beat0: 0 },
            // The Visitor: the Keeper's fireside — the same track on the hill and in the parlor, so it plays on across the cut
            keepers_hill: { track: 'the visitor', volume: 0.5 },
            keepers_parlor: { track: 'the visitor', volume: 0.5 },
            // The Sanctum: the Triumvirate
            church_boss: { track: 'triumvirate boss fight', volume: 0.55 },
            // The van, on the way to the job (the intro): over the rain on the roof and the road
            van_interior: { track: 'van 2', volume: 0.45 },
            // Grave Stories: the southern graveyard in Southern Dimensions City (its walls, engine/map-loading.js 11d)
            hub_949: { track: 'grave stories (1)', volume: 0.5, area: { x: 500, y: 8800, w: 3000, h: 2000 }, fade: 600 },
            // ('we ponder main' and 'map' ship in the build as extras, not placed yet)
        };
        const CLUB_BPM = 140;
        const CLUB_PAL = ['176, 120, 255', '220, 190, 255', '255, 90, 150', '232, 194, 122'];   // the club's lights: violet, lavender, rose, gold

        /** The current map's beat count, if its track has a tempo (MAP_MUSIC bpm): from the music while
         *  it plays, else a free-running clock at that tempo (audio locked, paused). null without one. */
        function mapBeatN() {
            if (typeof game === 'undefined' || !game || !game.activeMap) return null;
            const spec = MAP_MUSIC[game.activeMap.id];
            if (!spec || !spec.bpm) return null;
            const b = typeof ambience !== 'undefined' ? ambience.musicBeat(game) : null;
            return b !== null ? b : (_frameTime / 1000) * spec.bpm / 60;
        }

        /** The club's beat count (its lights and dancers keep time with Swig). */
        function clubBeatN() {
            const b = mapBeatN();
            return b !== null ? b : (_frameTime / 1000) * CLUB_BPM / 60;
        }

        const ambience = new AmbienceSystem(audioSys);

        // Nothing plays in a background tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) audioSys.ctx.suspend();
            else if (typeof game !== 'undefined' && game.running) audioSys.ctx.resume();
        });


