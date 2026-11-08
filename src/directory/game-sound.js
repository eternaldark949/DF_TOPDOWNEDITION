        /* =====================================================================
           AUDIO SYSTEM
           ---------------------------------------------------------------------
           The game's sounds, written with the Basement's sound kit
           (basement/sound-kit.js): what a shot, a footstep or the rain is made of.
           No external audio files needed - everything is synthesized.
           
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
        /** The Audio Buffer setting → the context's latencyHint (read once, at launch) */
        const AUDIO_BUFFERS = { low: 'interactive', balanced: 'balanced', smooth: 'playback' };
        /** sfx(): the recipes there are, how long each one rings (s) and how many may ring at once (default 6) */
        const SFX_DUR = { shoot: 0.16, explode: 0.31, thunder: 2.8, knock: 0.14, bump: 0.32, crunch: 0.3, ui: 0.06, flit: 0.21, crit: 0.14 };
        const SFX_CAP = { shoot: 4, explode: 3, thunder: 2, ui: 3, crunch: 3, crit: 3 };

        class AudioSystem {
            constructor() {
                // Shared Web Audio API context - used by SFX and MusicWidgetSystem
                // The output buffer (Settings → Audio Buffer): 'balanced' by default. The smallest
                // ('interactive') underruns on mid-range phones while the game is busy — the crackles
                // and pops — so it trades ~10–20 ms of latency for a steady stream. Read at launch.
                this.bufferMode = AUDIO_BUFFERS[GameSettings.audioBuffer] ? GameSettings.audioBuffer : 'balanced';
                // The Basement's sound system owns the context and the mix (basement/sound-system.js): the master
                // (the audio toggle mutes everything there), the dialogue, music and sfx channels (the Music
                // slider sets the music's), the room's reverb, and asset sounds by packet (core/assets.js loads them).
                this.system = new soundSystem({ latency: AUDIO_BUFFERS[this.bufferMode],
                    levels: { master: GameSettings.audioEnabled ? 1.0 : 0.0, music: GameSettings.musicVolume ?? 0.7 }, load: (name) => loadSound(name) });
                this.ctx = this.system.ctx;
                this.stats = soundKit.countVoices(this.ctx);   // live voices, sounds per second and the peak, for the profiler
                this.masterGain = this.system.master; this.limiter = this.system.limiter;
                this.sfxOut = this.system.out('sfx');                        // in the room (with its reverb)
                this.sfxDry = this.system.out('sfx', { dry: true });          // beside her: the HUD's blips, her car's cabin
                this.musicGain = this.system.out('music', { dry: true });     // the phone radio (in her ear)
                this.musicRoom = this.system.out('music');                   // a map's speakers (in the room)
            }

            /** Once a frame (ambience.update): roll the per-second counters */
            _tickStats() { soundKit.tickStats(this.stats); }

            /** Music slider (0..1). */
            setMusicVolume(v) {
                GameSettings.musicVolume = Math.max(0, Math.min(1, v));
                this.system.volume.set('music', GameSettings.musicVolume);
            }
        
            // Must be called after user interaction to unlock audio (browser policy)
            init() {
                if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
            }

            /** Back at the menu: once the fades have played out, stop the audio thread (an sfx or enterWorld wakes it) */
            idle(ms = 1200) {
                clearTimeout(this._idleT);
                this._idleT = setTimeout(() => {
                    if (typeof game !== 'undefined' && (game.running || (game.musicWidget && game.musicWidget.isPlaying))) return;
                    this.ctx.suspend();
                }, ms);
            }
            wake() { clearTimeout(this._idleT); if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume(); }
            
            // Centralized audio toggle. Used by Settings UI and save-load restore.
            // Pass true/false; reads GameSettings.audioEnabled when called with no arg.
            setEnabled(on) {
                if (typeof on === 'boolean') GameSettings.audioEnabled = on;
                this.system.volume.set('master', GameSettings.audioEnabled ? 1.0 : 0.0);   // a fade, not a click
            }
        
            /** A one-shot sound effect: `type` names the recipe. opts.muffled = heard through a wall, opts.gain = how hard (crunch). */
            sfx(type, opts = {}) {
                // Ensure audio context is active (not from a timer while the app is in the background)
                if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
                if (!(type in SFX_DUR)) return;                                    // no such recipe: nothing to play
                // Rapid fire: a few shots ringing at once is plenty; more only stacks into clipping
                const dur = SFX_DUR[type];
                if (!soundKit.cap(this._sfxV || (this._sfxV = {}), type, SFX_CAP[type] || 6, dur * 1000 + 30)) return;

                // Muffled = heard through walls: a lowpass in front of the master bus
                const c = this.ctx, now = c.currentTime;
                const home = type === 'ui' ? this.sfxDry : this.sfxOut;       // a menu blip is beside her; the rest ring in the room
                let out = home;
                if (opts.muffled) { out = soundKit.filter(c, ['lowpass', 160]); out.connect(soundKit.gain(c, 0.6, home)); }
                const tone = (tone_packet, t = now) => soundKit.tone(c, out, t, tone_packet);

                // Tone packets: [wave, f0, f1, glide, amp, attack, decay, stop] (basement/sound-kit.js)
                if (type === 'shoot') tone(['square', 800, 100, 0.15, 0.1]);                     // LASER SHOT: a square wave dropping
                else if (type === 'explode') tone(['sawtooth', 100, 10, 0.3, 0.2]);               // EXPLOSION: a harsh sawtooth rumbling down
                else if (type === 'thunder') {
                    // THUNDER: a low sawtooth rumble with a slow decay, and a lower triangle body for weight.
                    // Pitch is randomised per strike so repeated lightning in a long storm never sounds looped.
                    const base = 48 + Math.random() * 26;
                    const dur = 1.4 + Math.random() * 1.3;
                    tone(['sawtooth', base, base * 0.32, dur, 0.16, 0.08, dur, dur]);
                    tone(['triangle', base * 0.5, base * 0.2, dur, 0.11, 0.14, dur, dur]);
                }
                else if (type === 'knock') tone(['triangle', 150, 70, 0.09, 0.22, 0.006, 0.13]);  // KNOCK: a gloved fist on the van's partition, a dull metal thud
                else if (type === 'bump') {
                    // BUMP: the van hitting a seam in the road, a low thump with a rattle after
                    tone(['sine', 90, 38, 0.25, 0.3, 0.015, 0.3, 0.32]);
                    const r = c.createOscillator(), rg = c.createGain();
                    r.type = 'square'; r.frequency.setValueAtTime(420, now + 0.05); r.connect(rg); rg.connect(out);
                    rg.gain.setValueAtTime(0.0001, now); rg.gain.exponentialRampToValueAtTime(0.018, now + 0.06); rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
                    r.start(now + 0.04); r.stop(now + 0.22);
                }
                else if (type === 'crunch') {
                    // CRUNCH: a car hit, a body thump under a short burst of torn metal and glass.
                    // opts.gain (0..1) scales it with the impact.
                    const v = Math.max(0.15, Math.min(1, opts.gain ?? 0.6));
                    tone(['sine', 120, 42, 0.22, 0.32 * v, 0.01, 0.28, 0.3]);
                    soundKit.burst(c, out, now, [this._noise(), ['bandpass', 1400 + Math.random() * 900, 1.1], 0.22 * v, 0.006, 0.09 + 0.1 * v, Math.random() * 0.5, 0.25]);
                    if (v > 0.5) for (let i = 0; i < 3; i++) {             // glass settling
                        const t = now + 0.05 + Math.random() * 0.12;
                        tone(['triangle', 3200 + Math.random() * 2400, null, 0, 0.03 * v, 0.004, 0.05, 0.06], t);
                    }
                }
                else if (type === 'ui') tone(['sine', 1200, null, 0.05, 0.05]);                   // UI BLIP: a clean sine tone, short and high
                else if (type === 'crit') tone(['sine', 1500, 2600, 0.05, 0.09, 0.003, 0.13]);    // CRITICAL HIT: a bright ping that rises, over the hit itself
                else if (type === 'flit') tone(['triangle', 200, null, 0.2, 0.1]).frequency.linearRampToValueAtTime(600, now + 0.2);   // TELEPORT: a smooth triangle rising
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
                    const c = this.ctx, bus = soundKit.gain(c, 0, this.sfxDry);   // her own motor: in the cabin, dry
                    const osc = (type, g0) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; g.gain.value = g0; o.connect(g); o.start(); return { o, g }; };
                    const body1 = osc('sine', 0.5), body2 = osc('sine', 0.3), fifth = osc('triangle', 0.09), whine = osc('sine', 0);
                    const saw = osc('sawtooth', 0.07), lp = soundKit.filter(c, ['lowpass', 300, 0.8]);
                    saw.g.connect(lp);
                    const tone = soundKit.filter(c, ['lowpass', 2600]);   // rounds off the whole bank
                    for (const n of [body1.g, body2.g, fifth.g, whine.g, lp]) n.connect(tone);
                    tone.connect(bus);
                    const chorus = c.createOscillator(), cg = c.createGain(); chorus.frequency.value = 0.23; cg.gain.value = 5;   // ±5 cents, slowly
                    chorus.connect(cg); cg.connect(body2.o.detune); chorus.start();
                    body1.o.detune.value = -4; body2.o.detune.value = 4;
                    this._eng = { bus, body1, body2, fifth, whine, saw, lp };
                }
                const E = this._eng, now = this.ctx.currentTime, H = ENGINE_HUM[st && st.brand] || ENGINE_HUM.Gelfash;
                const v = Math.max(0, Math.min(1, (st && st.speed01) || 0)), thr = Math.max(0, Math.min(1, (st && st.throttle) || 0));
                // Only when something moved: parked (or on foot) it would otherwise reschedule eight glides a frame
                const sig = (on ? 1 : 0) + '|' + H.root + '|' + Math.round(v * 200) + '|' + Math.round(thr * 50);
                if (sig === this._engSig) return;
                this._engSig = sig;
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
            _noise() { return this._noiseBuf || (this._noiseBuf = soundKit.whiteNoise(this.ctx, 1)); }

            /**
             * The driven car's tyres: a looped squeal whose level (0..1) follows how hard they're
             * sliding. Built on first use; pitch wanders a little so a long slide never drones.
             */
            tyres(level) {
                const L = Math.max(0, Math.min(1, level || 0));
                if (!this._tyre) {
                    if (L <= 0) return;
                    const c = this.ctx, src = c.createBufferSource(); src.buffer = this._noise(); src.loop = true;
                    const bp = soundKit.filter(c, ['bandpass', 1500, 9]), bp2 = soundKit.filter(c, ['bandpass', 2250, 6]);
                    const g = soundKit.gain(c, 0, this.sfxOut);
                    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6.5; lg.gain.value = 90;
                    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
                    src.connect(bp); src.connect(bp2); bp.connect(g); bp2.connect(g);
                    src.start();
                    this._tyre = { g, bp };
                }
                if (Math.abs(L - (this._tyreL ?? -1)) < 0.01 && (L > 0 || this._tyreL === 0)) return;                 // unchanged: nothing to schedule
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
           Everything is generated in code; it all runs through the sfx channel (the beds dry,
           the one-shots in the room's reverb) into the master, so
           the existing audio toggle mutes it.
           ===================================================================== */
        // Footsteps, splashes and slashes vary on their own random stream, so they never shift the game's
        const _sndRand = (() => { let x = 987654321; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();

        class AmbienceSystem {
            constructor(audio) {
                this.audio = audio;
                this.ready = false;
                this.voices = 0;
                this.next = { car: 0, horn: 0, drip: 0 };
            }

            _build() {
                const ctx = this.audio.ctx;
                const { pink, brown } = soundKit.noiseBeds(ctx, 3);
                this.pink = pink; this.brown = brown;
                this.bus = soundKit.gain(ctx, 0, this.audio.sfxDry);         // the beds are the place itself: no reverb on them
                this.shots = soundKit.gain(ctx, 0, this.audio.sfxOut);       // its one-shots ring in the room (the bed's level)
                const bq = (type, f, Q = 0.7) => soundKit.filter(ctx, [type, f, Q]);
                const layer = (buf, filters, rate) => ({ g: soundKit.loop(ctx, this.bus, buf, filters, rate, Math.random() * 2.5), t: 0 });
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
                if (a.stats) a._tickStats();
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
                a.engine({ on: inCar, brand: car && car.brand, speed01: car ? Math.abs(car.speed || 0) / (car.drivenTop || car.maxSpeed || 10) : 0,
                           throttle: car ? Math.abs(car.controlMode === 'PLAYER' ? (car.pedal || 0) : (car.manualGas || 0)) : 0 });   // her motor (auto-drive too)

                const busV = vol * 1.9 * (paused ? 0.25 : 1) * (1 - 0.45 * (game.scopeK || 0));
                if (Math.abs(busV - (this._busV ?? -1)) > 0.004) { this._busV = busV; this.bus.gain.setTargetAtTime(busV, now, 0.4); this.shots.gain.setTargetAtTime(busV, now, 0.4); }   // only on change: a new automation event every frame keeps the audio thread busy   // scoped: the world goes quiet   // layer levels are set low; 1.9 brings the bed to about -22 dBFS
                const van = map.id === 'van_interior', rolling = van && game.vanMoving !== false;   // the crew's van: rain drums on the roof, the road hums underneath
                this._set(this.L.rain, outside && !realm ? 0.3 * rain : 0, 0.8);
                this._set(this.L.rainIn, van ? 0.2 : outside ? 0 : 0.22 * rain, 0.8);
                this._set(this.L.road, rolling ? 0.32 : 0, rolling ? 1.2 : 0.6);
                this._set(this.L.wind, outside ? 0.04 + 0.12 * wind : 0.015 * wind, 1.2);
                this._set(this.L.city, realm ? 0 : !indoorMap ? 0.1 + 0.07 * day : veranda ? 0.09 : apt ? 0.025 : 0.015, 1.0);
                this._set(this.L.room, apt && !veranda ? 0.035 : 0, 1.0);
                this._set(this.L.fire, 0.22 * fire, 0.5);
                this._music(game, paused);
                this._reverb(game, map, rs, veranda);
                if (paused) return;

                // Sparse one-shots
                if (fire > 0.02 && Math.random() < 0.09) this._crackle(0.35 * fire);
                if (outside && !realm && now > this.next.car) { this._carPass(indoorMap ? 0.05 : 0.08); this.next.car = now + 6 + Math.random() * 9; }
                if (outside && !realm && now > this.next.horn) { if (this.next.horn) this._horn(indoorMap ? 0.012 : 0.02); this.next.horn = now + 20 + Math.random() * 30; }
                if (!outside && rain > 0 && now > this.next.drip) { this._drip(0.02 * rain); this.next.drip = now + 0.6 + Math.random() * 2.4; }
            }

            /** The room she's in as reverb: its own (ROOM_REVERB), the street from a veranda, else the map's. */
            _reverb(game, map, rs, veranda) {
                const room = rs && rs.active ? rs.currentRoom : null;
                const name = (room && ROOM_REVERB[room.id]) || (veranda ? 'street' : MAP_REVERB[map.id] || (map.type === 'indoor' ? 'room' : 'street'));
                this.audio.system.reverb.setRoom(REVERB[name]);
                this.reverbRoom = name;
            }

            /** Map menu / game stop: let everything fade out. */
            silence() {
                if (!this.ready) return;
                const now = this.audio.ctx.currentTime;
                this.bus.gain.setTargetAtTime(0, now, 0.3); this.shots.gain.setTargetAtTime(0, now, 0.3);
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
                // A track that belongs to one area of a map (`area`, or a `building`'s footprint): full inside,
                // rising over `fade` px as 949 (or her car) comes up to it, silent and stopped beyond.
                // A map can list several (the hub: the graveyard, the club's bass through its walls); the nearest wins.
                const entry = game.activeMap && MAP_MUSIC[game.activeMap.id];
                let spec = null, areaK = 0;
                for (const sp of entry ? (Array.isArray(entry) ? entry : [entry]) : []) {
                    const A = sp.building ? this._buildingArea(game, sp.building) : sp.area;
                    if (!A) { if (!sp.area && !sp.building && areaK < 1) { spec = sp; areaK = 1; } continue; }
                    const who = game.isDriving && game.car ? game.car : game.player;
                    const dx = who ? Math.max(A.x - who.x, 0, who.x - (A.x + A.w)) : 1e9, dy = who ? Math.max(A.y - who.y, 0, who.y - (A.y + A.h)) : 1e9;
                    const t = Math.max(0, 1 - Math.hypot(dx, dy) / (sp.fade || 500)), k = t * t * (3 - 2 * t);
                    if (k > areaK) { spec = sp; areaK = k; }
                }
                this._activeSpec = spec;
                const M = this._mus || (this._mus = (() => {
                    const f = ctx.createBiquadFilter(), g = ctx.createGain();
                    f.type = 'lowpass'; f.frequency.value = 18000; f.Q.value = 0.5; g.gain.value = 0;
                    f.connect(g); g.connect(this.audio.musicRoom);                 // the speakers are in the room: they take its reverb
                    return { f, g, src: null, name: null, loading: null, level: 0, cut: 18000, quietSince: now };
                })());
                // Start the track for this map (decoded once)
                if (spec && M.name !== spec.track && M.loading !== spec.track) {
                    M.loading = spec.track;
                    loadSound(spec.track).then(buf => {
                        M.loading = null;
                        if (!buf) return;
                        const cur = this._activeSpec;
                        if (!cur || cur.track !== spec.track) return;       // left the map (or the area) while it decoded
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
                    if (spec.lowpass) cut = Math.min(cut, spec.lowpass);  // heard through walls: only the thump
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

            /** A building's footprint on this map (for `building:` area music), cached per map. */
            _buildingArea(game, id) {
                const m = game.activeMap; if (!m) return null;
                if (this._areaMap !== m) { this._areaMap = m; this._areas = {}; }
                if (id in this._areas) return this._areas[id];
                const b = (m.buildings || []).find(o => o.id === id);
                if (!b) return (this._areas[id] = null);
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const s of b.sections) { x0 = Math.min(x0, b.x + s.x); y0 = Math.min(y0, b.y + s.y); x1 = Math.max(x1, b.x + s.x + s.w); y1 = Math.max(y1, b.y + s.y + s.h); }
                return (this._areas[id] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
            }

            /** Beats played so far of the playing track (MAP_MUSIC bpm/beat0), counted from where the
             *  speakers actually are in the loop, or null when it isn't playing. Lights keep time with it. */
            musicBeat(game) {
                const M = this._mus, spec = this._activeSpec;
                if (!M || !M.src || !spec || !spec.bpm || M.name !== spec.track || M.level < 0.002) return null;
                const ctx = this.audio.ctx;
                if (ctx.state !== 'running') return null;                       // a locked or paused clock stands still
                const el = ctx.currentTime - M.t0 - (ctx.outputLatency || ctx.baseLatency || 0);
                if (el < 0) return null;
                const loops = Math.floor(el / M.dur), perLoop = Math.round(M.dur * spec.bpm / 60);
                return loops * perLoop + ((el - loops * M.dur) - (spec.beat0 || 0)) * spec.bpm / 60;
            }

            /** One more ambient one-shot, if fewer than 6 are ringing */
            _voice(nodes, dur) { return soundKit.cap(this, 'voices', 6, dur * 1000 + 50); }

            /** A short click of noise from the fire: [filter, amp, decay] go into a burst packet on the bed's bus */
            _crackle(v) {
                if (!this._voice(null, 0.05)) return;
                const ctx = this.audio.ctx, f = soundKit.filter(ctx, ['bandpass', 2000 + Math.random() * 3000, 1.5]);
                const d = 0.005 + Math.random() * 0.035;
                soundKit.burst(ctx, this.shots, ctx.currentTime, [this.pink, f, v * (0.4 + Math.random() * 0.6), 0.002, d, Math.random() * 2.5, d + 0.05]);
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
                const g = ctx.createGain(); src.connect(f); node.connect(g); g.connect(this.shots);
                g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
                src.start(now, Math.random() * 2.5, 2.4);
            }

            _horn(v) {
                if (!this._voice(null, 0.8)) return;
                const ctx = this.audio.ctx, now = ctx.currentTime, lp = soundKit.filter(ctx, ['lowpass', 900]), g = ctx.createGain();
                lp.connect(g); g.connect(this.shots);
                for (const f of [392, 397]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.9 + Math.random() * 0.2); o.connect(lp); o.start(now); o.stop(now + 0.75); }
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(v, now + 0.03); g.gain.setValueAtTime(v, now + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
                g.gain.exponentialRampToValueAtTime(v, now + 0.4); g.gain.setValueAtTime(v, now + 0.62); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
            }

            _drip(v) {
                if (!this._voice(null, 0.1)) return;
                const ctx = this.audio.ctx;
                soundKit.tone(ctx, this.shots, ctx.currentTime, ['sine', 1800 + Math.random() * 900, 900, 0.05, v, 0.003, 0.06, 0.07]);
            }

            /**
             * A footstep (engine/footsteps.js): the shoe sets the attack, the floor its colour.
             *   shoe: heels | boots | sneakers | loafers   mat: marble | wood | carpet | stone | concrete | asphalt | grass | metal | water
             *   o.gain (0..1 loudness: pace), o.wet (rain on hard ground), o.near (distance 0..1), o.pan (-1..1)
             * Its own bus at full level (Settings → Footsteps), its own voice cap.
             */
            footstep(shoe, mat, o = {}) {
                if (!this.ready || GameSettings.footsteps === false) return;
                const near = o.near ?? 1; if (near <= 0.03) return;
                if (!soundKit.cap(this, 'stepVoices', 6, 160)) return;
                const ctx = this.audio.ctx, now = ctx.currentTime;
                const out = soundKit.pan(ctx, this._foley(), o.pan);
                const v = near * (0.55 + 0.45 * (o.gain ?? 0.7));
                const burst = (type, f, Q, dur, amp, rate = 1, buf = this.pink) => soundKit.burst(ctx, out, now, [buf, [type, f, Q], amp, 0.004, dur, _sndRand() * 2.5, dur + 0.03, rate]);
                const tone = (f0, f1, dur, amp, type = 'sine') => soundKit.tone(ctx, out, now, [type, f0, f1, dur, amp, 0.003, dur, dur + 0.02]);
                const soft = mat === 'carpet' ? 0.35 : mat === 'grass' ? 0.5 : 1, j = 0.9 + _sndRand() * 0.2;
                if (mat === 'water') {                                   // into a puddle: a slap and a spray
                    burst('lowpass', 900 * j, 0.7, 0.14, 0.32 * v, 0.9);
                    burst('bandpass', 2600 * j, 0.8, 0.2, 0.18 * v);
                    return;
                }
                if (mat === 'grass') burst('highpass', 2400 * j, 0.6, 0.09, 0.09 * v);                     // a brush through the blades
                else if (mat === 'carpet') burst('lowpass', 420 * j, 0.7, 0.06, 0.14 * v, 0.8);           // a dull pat
                if (shoe === 'heels') {
                    if (mat !== 'grass' && mat !== 'carpet') {
                        burst('bandpass', 4200 * j, 2.2, 0.03, 0.26 * v * (mat === 'marble' ? 1.25 : 1));   // the click
                        if (mat === 'marble') tone(2400 * j, 2200 * j, 0.09, 0.03 * v);                    // a ring off the stone
                    } else burst('bandpass', 1500 * j, 1.2, 0.03, 0.08 * v * soft);
                } else if (shoe === 'boots') {
                    burst('lowpass', 650 * j, 0.8, 0.07, 0.28 * v * soft, 0.9, this.brown);                // the heel's weight
                    tone(95 * j, 55, 0.09, 0.12 * v * soft);
                    if (mat !== 'carpet' && mat !== 'grass') burst('bandpass', 2400 * j, 1, 0.025, 0.07 * v);   // the scuff
                } else if (shoe === 'sneakers') {
                    burst('bandpass', 900 * j, 1, 0.05, 0.12 * v * soft);                                  // a soft tap
                } else {
                    burst('bandpass', 1700 * j, 1.5, 0.04, 0.16 * v * soft);                               // loafers: a neat tap
                }
                if (mat === 'wood') tone(210 * j, 150, 0.07, 0.05 * v);                                     // hollow boards
                else if (mat === 'metal') tone(820 * j, 780, 0.16, 0.05 * v, 'triangle');                   // a plate that rings
                if (o.wet && mat !== 'carpet') burst('bandpass', 2600 * j, 0.8, 0.08, 0.09 * v);            // rain on the ground
            }

            /** The foley bus (footsteps, blades, fists), made on first use */
            _foley() { return this.foley || (this.foley = soundKit.gain(this.audio.ctx, 0.9, this.audio.sfxOut)); }

            /** A blade through the air (and, on a hit, into someone) */
            slash(hit) {
                if (!this.ready) return;
                const ctx = this.audio.ctx, now = ctx.currentTime;
                const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.Q.value = 1.4;
                bf.frequency.setValueAtTime(1800, now); bf.frequency.exponentialRampToValueAtTime(5200, now + 0.14);
                soundKit.burst(ctx, this._foley(), now, [this.pink, bf, 0.22, 0.05, 0.17, _sndRand() * 2.5, 0.2]);
                if (hit) this.cut(0.05);
            }

            /** The cut: a wet thud and a bright ring off the blade, `delay` seconds from now */
            cut(delay = 0) {
                if (!this.ready) return;
                const ctx = this.audio.ctx, t = ctx.currentTime + delay, out = this._foley();
                soundKit.burst(ctx, out, t, [this.brown, ['lowpass', 700], 0.3, 0.01, 0.11, _sndRand() * 2.5, 0.15]);
                soundKit.tone(ctx, out, t, ['sine', 3400, 3100, 0.35, 0.025, 0.003, 0.35, 0.37]);
            }

            /** Brass on bone: a knuckle-duster's haymaker lands — a dull knock and two bright metal partials */
            clink() {
                if (!this.ready) return;
                const ctx = this.audio.ctx, t = ctx.currentTime, out = this._foley();
                soundKit.burst(ctx, out, t, [this.brown, ['lowpass', 500], 0.34, 0.008, 0.12, _sndRand() * 2.5, 0.15]);
                for (const [f, v, d] of [[2350, 0.07, 0.42], [3920, 0.04, 0.3]]) soundKit.tone(ctx, out, t, ['triangle', f, f * 0.985, d, v, 0.003, d, d + 0.02]);
            }

            /** A car's tyres through a puddle: a long hiss-splash, quieter with distance */
            splash(near, pan, big) {
                if (!this.ready || GameSettings.footsteps === false || near <= 0.03) return;
                if (!this._voice(null, 0.5)) return;
                const ctx = this.audio.ctx, now = ctx.currentTime;
                const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.Q.value = 0.7;
                bf.frequency.setValueAtTime(big ? 1400 : 2200, now); bf.frequency.exponentialRampToValueAtTime(big ? 600 : 1200, now + 0.4);
                soundKit.burst(ctx, soundKit.pan(ctx, this.audio.sfxOut, pan), now, [this.pink, bf, (big ? 0.3 : 0.18) * near, 0.03, big ? 0.45 : 0.25, _sndRand() * 2.5, 0.5]);
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
                    const o = ctx.createOscillator(), bp = soundKit.filter(ctx, ['bandpass', 900, 4]), g = ctx.createGain();
                    o.type = 'sawtooth';
                    const f0 = 170 + Math.random() * 60;
                    o.frequency.setValueAtTime(f0, now); o.frequency.linearRampToValueAtTime(f0 * 1.25, now + 0.18);
                    o.frequency.linearRampToValueAtTime(f0 * 0.95, now + 0.34); o.frequency.linearRampToValueAtTime(f0 * 1.15, now + 0.5);
                    o.connect(bp); bp.connect(g); g.connect(this.shots);
                    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05 * near, now + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
                    o.start(now); o.stop(now + 0.56);
                } else if (kind === 'latch') {
                    if (!this._voice(null, 0.1)) return;
                    soundKit.burst(ctx, this.shots, now, [this.pink, ['bandpass', 3200, 3], 0.18 * near, 0.002, 0.025, Math.random() * 2.5, 0.075]);
                    soundKit.tone(ctx, this.shots, now, ['sine', 140, 70, 0.07, 0.09 * near, 0.003, 0.08, 0.09]);
                } else if (kind === 'thud') {                                 // a round into a wooden leaf
                    if (!this._voice(null, 0.12)) return;
                    soundKit.burst(ctx, this.shots, now, [this.pink, ['lowpass', 520], 0.22 * near, 0.002, 0.06, Math.random() * 2.5, 0.11]);
                    soundKit.tone(ctx, this.shots, now, ['sine', 120, 60, 0.1, 0.12 * near, 0.003, 0.11, 0.12]);
                } else if (kind === 'tink') {                                 // a round glancing off glass
                    if (!this._voice(null, 0.3)) return;
                    soundKit.tone(ctx, this.shots, now, ['sine', 2600 + Math.random() * 500, null, 0.28, 0.06 * near, 0.003, 0.28, 0.3]);
                    soundKit.burst(ctx, this.shots, now, [this.pink, ['highpass', 4000], 0.12 * near, 0.002, 0.03, Math.random() * 2.5, 0.08]);
                } else if (kind === 'whoosh') {
                    if (!this._voice(null, 0.4)) return;
                    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
                    f.frequency.setValueAtTime(700, now); f.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
                    soundKit.burst(ctx, this.shots, now, [this.pink, f, 0.07 * near, 0.1, 0.35, Math.random() * 2.5, 0.4]);
                }
            }
        }
        /* A soundtrack per map: `track` names a file in assets/audio (without the extension),
           `room` is where its speakers are (it's fullest there), `volume` its level; `area` {x, y, w, h}
           keeps it to one part of the map, fading in over `fade` px as you come up to it. */
        /** The game's rooms as reverb (ROOM PACKET [decay s, predelay ms, damp Hz, wet], basement/sound-system.js).
         *  The sound system makes each tail on the spot and fades between them as she goes. */
        const REVERB = {
            street:   [1.0, 24, 4200, 0.10],   // out in the city: a short slap off the buildings
            open:     [0.6, 12, 3500, 0.05],   // a hillside: almost nothing comes back
            room:     [0.5,  6, 6000, 0.14],   // a furnished room
            bathroom: [1.1,  4, 9000, 0.26],   // tile and marble: bright and close
            hall:     [2.0, 22, 5200, 0.22],   // a lobby, a club's floor
            stone:    [3.2, 32, 4000, 0.30],   // a church, a palace: long and dark
            cabin:    [0.25, 2, 2800, 0.10],   // the van: boxed in
            void:     [5.5, 60, 2600, 0.38],   // the ethereal plane
            valley:   [1.2, 40, 3500, 0.10, 0.45, 0.4, 0.32]   // open ground under cliffs: echoes coming back off the far side
        };
        /** Each map's room (indoor maps default to `room`, outdoor ones to `street`) and rooms that differ inside them. */
        const MAP_REVERB = {
            hotel_lobby: 'hall', moon_city_nightclub: 'hall', enni_cole_interior: 'hall', biggs_arena: 'hall', auto_shop: 'hall',
            church_boss: 'stone', demoness_palace: 'stone', house_of_death: 'stone',
            van_interior: 'cabin', keepers_hill: 'open', ethereal_plane: 'void'
        };
        const ROOM_REVERB = { bathroom: 'bathroom' };

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
            sdc: [
                { track: 'grave stories (1)', volume: 0.5, area: HUB_GRAVEYARD, fade: 600 },
                // Moon City's bass through its walls: heard as you come up to the club, low-passed to the thump; its lights keep time
                { track: 'moon city nightclub - swig', building: 'moon_city', volume: 0.32, fade: 420, lowpass: 260, bpm: 140, beat0: 0 }
            ],
        };
        const CLUB_BPM = 140;
        const CLUB_PAL = ['176, 120, 255', '220, 190, 255', '255, 90, 150', '232, 194, 122'];   // the club's lights: violet, lavender, rose, gold

        /** The current map's beat count, if its track has a tempo (MAP_MUSIC bpm): from the music while
         *  it plays, else a free-running clock at that tempo (audio locked, paused). null without one. */
        function mapBeatN() {
            if (typeof game === 'undefined' || !game || !game.activeMap) return null;
            const e = MAP_MUSIC[game.activeMap.id], spec = Array.isArray(e) ? (typeof ambience !== 'undefined' ? ambience._activeSpec : null) : e;
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

        // Audio:Sounds in the profiler: the main-thread cost of starting each sound (building its
        // nodes and envelopes). They're started from inside other sections (AI, physics, logic),
        // so the row is shown but not added to the frame total. The mixing itself runs on the
        // browser's audio thread; the Audio line under the rows reports on that.
        for (const [obj, names] of [[audioSys, ['sfx']], [ambience, ['footstep', 'slash', 'splash', 'doorEvent']]]) {
            for (const name of names) {
                const fn = obj[name];
                obj[name] = function (...args) {
                    if (!_profileSampling) return fn.apply(this, args);
                    const t0 = performance.now();
                    try { return fn.apply(this, args); }
                    finally {
                        const ms = performance.now() - t0;
                        audioSys.stats._ms += ms;
                        if (typeof game !== 'undefined' && game && game.profiler) game.profiler.add('Audio:Sounds', ms, true);
                    }
                };
            }
        }

        // Nothing plays in a background tab
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) audioSys.ctx.suspend();
            else if (typeof game !== 'undefined' && game.running) audioSys.ctx.resume();
        });


