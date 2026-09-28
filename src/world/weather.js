        /* =====================================================================
           WEATHER CONDITIONS — the vocabulary the scheduler picks from
           ---------------------------------------------------------------------
           Each condition is a complete "look": how hard it rains, how the wind
           behaves, whether lightning fires, and what the phone HUD reports.

           intensity  — multiplier on the player's rain-density setting. This is
                        deliberately layered ON TOP of GameSettings.rainDensity
                        rather than replacing it, so a player who set rain to LOW
                        for performance still gets LOW during a storm — just the
                        heaviest version of LOW. The scheduler changes the
                        weather, never the player's perf budget.
           wind       — target magnitude for windVec. Direction is picked per
                        weather change and drifts with gusts.
           gust       — how much the wind wanders around its target.
           lightning  — per-frame probability of a strike (0 = never).
           minDur/maxDur — how long this condition lasts, in WORLD minutes.
           follows    — which conditions may precede this one. This is what keeps
                        the sky believable: you never snap from Clear Sky to a
                        full storm, you build up through drizzle and rain.
           ===================================================================== */
        const WEATHER_CONDITIONS = {
            clear: {
                id: 'clear',   label: 'Clear Sky', icon: '🌙', temp: 21,
                intensity: 0.0,  wind: 0.35, gust: 0.15, lightning: 0,
                minDur: 25, maxDur: 70,
                follows: ['clear', 'drizzle']
            },
            drizzle: {
                id: 'drizzle', label: 'Drizzle',   icon: '🌦️', temp: 19,
                intensity: 0.38, wind: 0.75, gust: 0.25, lightning: 0,
                minDur: 20, maxDur: 55,
                follows: ['clear', 'drizzle', 'rain', 'storm']
            },
            rain: {
                id: 'rain',    label: 'Raining',   icon: '🌧️', temp: 18,
                intensity: 1.0,  wind: 1.15, gust: 0.4,  lightning: 0,
                minDur: 45, maxDur: 140,
                follows: ['drizzle', 'rain', 'storm']
            },
            storm: {
                id: 'storm',   label: 'Storm',     icon: '⛈️', temp: 16,
                intensity: 1.25, wind: 1.9,  gust: 0.85, lightning: 0.0016,
                minDur: 15, maxDur: 45,
                follows: ['rain', 'storm']
            }
        };

        /* =====================================================================
           CLIMATE PROFILES — per-map odds for the next roll
           ---------------------------------------------------------------------
           A profile is just a weighting. Higher number = more likely to be
           picked when the current condition expires. Weights are relative, so
           {rain: 48, clear: 12} means rain is four times as likely as clear.

           nightBias multiplies the wet-weather weights between dusk and dawn,
           so the city gets grimmer after dark without ever being scripted.

           `prevailing` is a METEOROLOGICAL bearing: the compass direction the
           wind blows FROM, not toward (a 135 wind is southeasterly — it comes
           out of the southeast). Screen north is -y, confirmed by the game's own
           `facing === 'N'` convention. `windVar` is how many degrees the heading
           typically wanders either side of prevailing.

           Maps opt in via a `climate:` key in MAP_DATA. Anything without one
           falls back to '_default'. Indoor maps do NOT switch profiles — you're
           still standing in the same world, so the sky keeps doing whatever it
           was doing outside, and the room system just stops drawing it on you.
           ===================================================================== */
        /** Spoken-form compass points, for "blowing from the southeast". */
        const COMPASS_WORDS = {
            N: 'north', NE: 'northeast', E: 'east', SE: 'southeast',
            S: 'south', SW: 'southwest', W: 'west', NW: 'northwest'
        };

        const CLIMATE_PROFILES = {
            // The main city: perpetually wet. Clear sky is the rare event here,
            // and it never lasts long — that's the whole mood of the place.
            // clear:22 measured at ~10% clear / 90% wet over 20 in-game days.
            // Tuned against Sky.ME rather than by feel: at clear:10 the app could
            // only find a dry spell in its outlook 32% of the time, so two thirds
            // of visits answered "when does it stop?" with "it doesn't". 22 keeps
            // the city emphatically wet while letting the forecast mean something.
            city:    { weights: { clear: 22, drizzle: 26, rain: 50, storm: 14 }, nightBias: 1.45,
                       prevailing: 135, windVar: 45 },   // SE — matches v7's hardcoded wind exactly
            // Open road outside the city — noticeably milder, so driving out of
            // town actually feels like going somewhere else.
            outskirt:{ weights: { clear: 34, drizzle: 28, rain: 30, storm: 8  }, nightBias: 1.15,
                       prevailing: 225, windVar: 60 },   // SW — open ground, wanders more
            // Plaza/commercial pocket. Driest profile in the game.
            plaza:   { weights: { clear: 44, drizzle: 30, rain: 24, storm: 2  }, nightBias: 1.1,
                       prevailing: 270, windVar: 70 },   // W — sheltered, least consistent
            // Boss arena — permanently foul. Weighted so it effectively never clears.
            tempest: { weights: { clear: 0,  drizzle: 8,  rain: 46, storm: 46 }, nightBias: 1.0,
                       prevailing: 0,   windVar: 20 },   // N — relentless, barely shifts
            _default:{ weights: { clear: 25, drizzle: 25, rain: 40, storm: 10 }, nightBias: 1.25,
                       prevailing: 135, windVar: 55 }
        };

        /* =====================================================================
           WEATHER & PARTICLE SYSTEM
           ---------------------------------------------------------------------
           Handles all environmental effects and particle-based visuals:
           
           WEATHER EFFECTS:
           - Rain drops: Perspective-correct top-down rain. Drops fall away from
             camera, starting as lines (near) and shrinking to dots (far) before
             splashing on impact. Direction locked at spawn (no rotation).
           - Wind: windVec {x,y} — (0,0)=no wind/pure perspective, nonzero=uniform
             drift. Affects both drop position (RAIN_WIND_DRIFT) and line angle
             (RAIN_WIND_DIR_STR). setWind(x,y) to change.
           - Splash ripples: Expanding rings at impact point with quadratic fade.
           - Lightning: Screen flash effect with cooldown
           
           PARTICLE TYPES:
           - spray    : Water/dust kicked up by vehicles (rgba colors)
           - explosion: Radial burst of colored particles
           - spark    : Small bright particles from impacts
           - ghost    : Ethereal afterimage for flit ability
           
           PARTICLE ANATOMY:
           Each particle has: position (x,y), velocity (vx,vy), 
           life (1.0 → 0.0), decay rate, color, size
           
           The system is used for:
           - Vehicle tire spray in rain
           - Exhaust smoke from cars  
           - Combat explosion effects
           - Metal-on-metal spark impacts
           - Flit teleport afterimages
           - Atmospheric ghost effects in graveyard
           ===================================================================== */
        class WeatherSystem {
            constructor(width, height) {
                this.isRaining = true;       // Toggle for rain effect
                
                // Wind as a 2D vector: {x:0, y:0} = no wind (pure perspective)
                // Positive x = blows right, positive y = blows "down" on screen
                this.windVec = { x: -2.5, y: -2.5 };
                this.wind = 0.5;             // Legacy scalar (0-1) for vehicle grip etc.
                this.windDirection = 1;      // Legacy direction for vehicle grip etc.
                
                this.drops = [];             // Perspective rain drops (fall away from camera)
                this.splashes = [];          // Ground impact ripple effects
                this.particles = [];         // All other particle effects
                
                // Object pool for particles (eliminates GC pressure)
                this._particlePool = new ObjectPool(
                    () => ({ type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 0, color: '', size: 0, angle: 0 }),
                    (p) => { p.type = ''; p.life = 0; },
                    150  // Pre-allocate 150 particles
                );
                this.width = width;
                this.height = height;
                this._halfW = width / 2;
                this._halfH = height / 2;
                
                // Rain drops spawn dynamically each frame — no pre-allocation needed
                
                // Lightning system for storm effects
                this.lightningFlash = 0;      // 0 = no flash, 1.0 = full brightness
                this.lightningCooldown = 0;   // Frames until next lightning allowed

                /* -------------------------------------------------------------
                   AUTOMATED WEATHER SCHEDULER
                   -------------------------------------------------------------
                   Three layers, kept deliberately separate so nothing fights:

                   1. condition       — what the SKY is doing. Owned by the
                                        scheduler. Changes on a world-minute timer.
                   2. intensity       — the smoothed 0..1.25 render strength. Eases
                                        toward the condition's target so weather
                                        fades in and out instead of popping.
                   3. isRaining       — the RENDER GATE. Derived every frame from
                                        intensity + indoor suppression. Every
                                        existing read site (vehicle grip, overlay,
                                        phone HUD, tire spray) keeps working
                                        untouched because this stays a plain bool.

                   Indoor suppression is its own flag rather than the room system
                   writing isRaining directly. Previously those two would have
                   overwritten each other every frame — the scheduler turning rain
                   on, the room system turning it off, forever.
                   ------------------------------------------------------------- */
                this.condition = 'rain';        // Current scheduled condition id
                this.climate = 'city';          // Active CLIMATE_PROFILES key
                this.intensity = 1.0;           // Smoothed render strength
                this.targetIntensity = 1.0;     // Where intensity is heading
                this.conditionEndsAt = 0;       // worldMinutes deadline for next roll
                this.conditionStartedAt = 0;    // When the current spell began (for progress)
                this.forecast = [];             // Precomputed lookahead: [{id, startsAt, endsAt}]
                this.scheduleEnabled = CONFIG.WEATHER.SCHED_ENABLED;
                this.scheduleLocked = false;    // Missions/cutscenes can pin the sky
                this.indoorSuppressed = false;  // Set by the room system, not by us
                this._lastWorldMinutes = -1;    // Monotonic-clock guard
                this._windTarget = { x: -2.5, y: -2.5 };
                this._gustPhase = Math.random() * Math.PI * 2;
                // Seeded from the city's prevailing SE wind, which is the same
                // heading v7 hardcoded as {-2.5,-2.5}.
                this._windAngle = this._prevailingAngle();
            }

            /* ---------------------------------------------------------------
               SCHEDULER API
               --------------------------------------------------------------- */

            /* ---------------------------------------------------------------
               WIND ORIENTATION
               ---------------------------------------------------------------
               Screen space: +x is east, -y is north. The game already commits to
               this via `facing === 'N'` mapping to a negative y offset, and the
               interior layouts label their y:0 blocks "north".

               windVec points where the air is TRAVELLING. Every direction shown
               to the player is inverted from it, because meteorology names a
               wind for where it comes FROM: air moving toward the northwest is
               reported as a southeasterly.
               --------------------------------------------------------------- */

            /** Normalise any angle to [-π, π] so drift maths can't wind up. */
            _wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

            /** Travel-angle for the current region's prevailing wind. */
            _prevailingAngle() {
                const p = CLIMATE_PROFILES[this.climate] || CLIMATE_PROFILES._default;
                const fromDeg = (typeof p.prevailing === 'number') ? p.prevailing : 135;
                const toRad = (fromDeg + 180) * Math.PI / 180;   // FROM -> TOWARD
                return Math.atan2(-Math.cos(toRad), Math.sin(toRad));
            }

            /** Compass bearing (degrees) the wind is blowing FROM. */
            getWindBearing() {
                const b = Math.atan2(this.windVec.x, -this.windVec.y) * 180 / Math.PI;
                return ((b + 180) % 360 + 360) % 360;
            }

            /** Eight-point compass label for the bearing, e.g. 'SE'. */
            getWindCompass() {
                const pts = ['N','NE','E','SE','S','SW','W','NW'];
                return pts[Math.round(this.getWindBearing() / 45) % 8];
            }

            /** Screen-space magnitude of the wind vector. */
            getWindSpeed() { return Math.hypot(this.windVec.x, this.windVec.y); }

            /** Descriptive strength band, Beaufort-flavoured. */
            getWindLabel() {
                const v = this.getWindSpeed();
                if (v < 1.2) return 'Calm';
                if (v < 2.4) return 'Light Breeze';
                if (v < 3.8) return 'Moderate';
                if (v < 5.0) return 'Strong';
                return 'Gale';
            }

            /** Current condition definition, always a valid object. */
            getCondition() {
                return WEATHER_CONDITIONS[this.condition] || WEATHER_CONDITIONS.rain;
            }

            /** Human-readable state for the phone HUD and debug overlay. */
            getConditionLabel() { return this.getCondition().label; }
            getConditionIcon()  { return this.getCondition().icon; }
            getConditionTemp()  { return this.getCondition().temp; }

            /**
             * Effective rain strength for renderers, 0 when indoors.
             * Drop budgets use this clamped by SCHED_BUDGET_CAP; visual alpha
             * can use the raw value so storms read heavier than they cost.
             */
            getRainScale() { return this.indoorSuppressed ? 0 : this.intensity; }
            getBudgetScale() {
                return Math.min(CONFIG.WEATHER.SCHED_BUDGET_CAP, this.getRainScale());
            }

            /**
             * Room system entry point. Call with true when the player is under a
             * roof. Kept separate from `condition` so stepping inside pauses the
             * rain on screen without derailing the world's weather timeline —
             * walk back out and it's still the same storm you left.
             */
            setIndoorSuppressed(v) { this.indoorSuppressed = !!v; }

            /** Swap the odds table, e.g. on map load. No immediate visual change. */
            setClimate(key) {
                if (CLIMATE_PROFILES[key]) this.climate = key;
            }

            /**
             * Jump to a condition immediately.
             * @param {string} id      Condition key.
             * @param {number} durMins Optional world-minute duration. Omit to roll normally.
             * @param {boolean} snap   Skip the fade and apply intensity instantly.
             */
            setCondition(id, durMins = null, snap = false) {
                const cfg = WEATHER_CONDITIONS[id];
                if (!cfg) return false;
                this.condition = id;
                this.targetIntensity = cfg.intensity;
                if (snap) this.intensity = cfg.intensity;

                // Re-aim the wind for each weather change.
                //
                // This used to be a plain random walk off the previous heading.
                // It looked fine per-step but had no restoring force, so after
                // ~20 weather changes the direction was uniform across all 360°
                // — the city had no prevailing wind at all. Invisible while wind
                // only tilted raindrops; obvious the moment Sky.ME started
                // printing a compass bearing you could watch wander.
                //
                // Now it's mean-reverting: pull the heading back toward the
                // region's prevailing wind, then apply a random kick. Weather
                // still varies, but it varies AROUND a regional norm.
                const prof = CLIMATE_PROFILES[this.climate] || CLIMATE_PROFILES._default;
                const home = this._prevailingAngle();
                let off = this._wrapAngle(this._windAngle - home);
                off *= (1 - CONFIG.WEATHER.WIND_REVERSION);
                // Kick sized so the stationary spread lands near windVar degrees
                const kick = (prof.windVar || 45) * (Math.PI / 180) * 1.386;
                off += (Math.random() - 0.5) * kick;
                this._windAngle = home + off;

                const mag = cfg.wind * CONFIG.WEATHER.WIND_SCALE;
                this._windTarget.x = Math.cos(this._windAngle) * mag;
                this._windTarget.y = Math.sin(this._windAngle) * mag;

                const span = cfg.maxDur - cfg.minDur;
                this._pendingDuration = durMins != null
                    ? durMins
                    : cfg.minDur + Math.random() * span;
                return true;
            }

            /**
             * Pin the weather for a mission/boss fight. The schedule stops
             * rolling until unlockSchedule() — useful for "it must be storming
             * when the player reaches the church" without racing the RNG.
             */
            lockSchedule(id = null) {
                if (id) this.setCondition(id, Infinity, true);
                // The queued forecast was chained off the previous condition, so
                // forcing a new sky invalidates its continuity. Drop it rather
                // than let the app show a plan that will never happen.
                this.forecast.length = 0;
                this.scheduleLocked = true;
            }
            unlockSchedule(rollNow = true) {
                this.scheduleLocked = false;
                this.forecast.length = 0;
                if (rollNow) this.conditionEndsAt = 0; // Forces a reseed on next tick
            }

            /**
             * Weighted pick for the condition that follows `from`.
             * Two rules keep it from feeling like a slot machine:
             *   - `follows` gates implausible jumps (clear → storm never happens).
             *   - Repeating the current condition is damped, so the sky actually
             *     changes rather than rolling "rain" six times running.
             *
             * `from` is a parameter rather than always reading this.condition so
             * the same function can be chained to roll a multi-step forecast:
             * each hop feeds its result in as the next hop's starting point.
             */
            _pickNextCondition(worldMinutes, from = this.condition) {
                const profile = CLIMATE_PROFILES[this.climate] || CLIMATE_PROFILES._default;
                const hour = (worldMinutes % 1440) / 60;
                const isNight = hour < 6 || hour >= 19;
                const nightBias = isNight ? (profile.nightBias || 1) : 1;

                const candidates = [];
                let total = 0;
                for (const key in profile.weights) {
                    const cfg = WEATHER_CONDITIONS[key];
                    if (!cfg) continue;
                    // Plausibility gate — can this condition follow `from`?
                    if (cfg.follows && !cfg.follows.includes(from)) continue;

                    let w = profile.weights[key];
                    if (w <= 0) continue;
                    if (key !== 'clear') w *= nightBias;       // Wet weather favours the dark
                    if (key === from) w *= 0.35;               // Damp self-repeats
                    total += w;
                    candidates.push({ key, w });
                }

                // Degenerate profile (everything gated out) — hold the current sky.
                if (!candidates.length || total <= 0) return from;

                let roll = Math.random() * total;
                for (const c of candidates) {
                    roll -= c.w;
                    if (roll <= 0) return c.key;
                }
                return candidates[candidates.length - 1].key;
            }

            /**
             * Drive the schedule. Called once per world-minute tick from
             * Game.updateTime, NOT per frame — so durations read in the same
             * units the designer wrote them in.
             *
             * worldMinutes is monotonic (counts up forever, never wraps), which
             * is exactly what a `now >= deadline` timer needs. Guarded anyway
             * against a loaded save moving the clock backwards.
             */
            tickSchedule(worldMinutes) {
                if (!this.scheduleEnabled || this.scheduleLocked) return;

                // Clock went backwards (save load, or a new game after a long
                // session) — rebase instead of stalling until the old deadline is
                // reached again, and throw away a forecast that's now nonsense.
                if (worldMinutes < this._lastWorldMinutes) {
                    this.conditionEndsAt = 0;
                    this.forecast.length = 0;
                }
                this._lastWorldMinutes = worldMinutes;

                // First run: seed a deadline for whatever we spawned with.
                if (this.conditionEndsAt === 0) {
                    const cfg = this.getCondition();
                    const span = cfg.maxDur - cfg.minDur;
                    this.conditionEndsAt = worldMinutes + CONFIG.WEATHER.SCHED_STARTUP_MINS
                                         + cfg.minDur + Math.random() * span;
                    this.targetIntensity = cfg.intensity;
                    this.conditionStartedAt = worldMinutes;
                    this.forecast.length = 0;
                }

                this._ensureForecast();

                // Drain every entry the clock has passed. Normally this runs zero
                // or one times, but sleeping jumps worldMinutes by hours in a
                // single step — without the loop the forecast would be left
                // pointing at conditions that already came and went.
                let guard = 0;
                while (worldMinutes >= this.conditionEndsAt && guard++ < 64) {
                    this._ensureForecast();
                    const next = this.forecast.shift();
                    if (!next) break;
                    this.setCondition(next.id, next.endsAt - next.startsAt);
                    this.conditionStartedAt = next.startsAt;
                    this.conditionEndsAt = next.endsAt;
                }

                // Pathological jump (guard tripped) — abandon the backlog and
                // resynchronise on the current time rather than churning forever.
                if (guard >= 64) {
                    this.forecast.length = 0;
                    this.conditionStartedAt = worldMinutes;
                    this.conditionEndsAt = worldMinutes + this._rollDuration(this.condition);
                }

                this._ensureForecast();
            }

            /** Roll a duration for a condition, in world minutes. */
            _rollDuration(id) {
                const cfg = WEATHER_CONDITIONS[id] || WEATHER_CONDITIONS.rain;
                return cfg.minDur + Math.random() * (cfg.maxDur - cfg.minDur);
            }

            /**
             * Top the lookahead queue back up to SCHED_FORECAST_LEN entries.
             *
             * The whole point of precomputing is honesty: the forecast the phone
             * shows IS the schedule, not a guess about it. Rolling at expiry
             * instead would mean the app could only ever show probabilities, and
             * "70% chance of rain" is far less satisfying to watch tick down than
             * "rain stops in 12 minutes" — especially when it's actually true.
             *
             * Each hop chains from the previous one so the `follows` plausibility
             * rules hold across the entire forecast, not just the first step.
             */
            _ensureForecast() {
                const want = CONFIG.WEATHER.SCHED_FORECAST_LEN;
                let cursorId = this.forecast.length
                    ? this.forecast[this.forecast.length - 1].id
                    : this.condition;
                let cursorAt = this.forecast.length
                    ? this.forecast[this.forecast.length - 1].endsAt
                    : this.conditionEndsAt;

                let guard = 0;
                while (this.forecast.length < want && guard++ < 32) {
                    const id = this._pickNextCondition(cursorAt, cursorId);
                    const dur = this._rollDuration(id);
                    this.forecast.push({ id, startsAt: cursorAt, endsAt: cursorAt + dur });
                    cursorId = id;
                    cursorAt += dur;
                }
            }

            /**
             * Everything the weather app needs, computed in one place so the UI
             * stays dumb. Times are world minutes; the caller converts.
             *
             * `flipAt` is the headline number — the moment the sky crosses
             * between wet and dry, which is the one thing a player actually wants
             * to know. Anything short of a full clear counts as wet, so a
             * rain → drizzle step is a change of degree, not a change of state.
             */
            getForecastSummary(worldMinutes) {
                const isWet = id => id !== 'clear';
                const wetNow = isWet(this.condition);
                const cfg = this.getCondition();
                // Exact progress through the current spell, for the app's bar.
                const span = Math.max(1, this.conditionEndsAt - this.conditionStartedAt);
                const progress = Math.max(0, Math.min(1, (worldMinutes - this.conditionStartedAt) / span));

                const out = {
                    condition: this.condition,
                    label: cfg.label,
                    icon: cfg.icon,
                    temp: cfg.temp,
                    intensity: this.intensity,
                    climate: this.climate,
                    windCompass: this.getWindCompass(),
                    windBearing: this.getWindBearing(),
                    windSpeed: this.getWindSpeed(),
                    windLabel: this.getWindLabel(),
                    windPrevailing: (CLIMATE_PROFILES[this.climate] || CLIMATE_PROFILES._default).prevailing,
                    wet: wetNow,
                    locked: this.scheduleLocked,
                    enabled: this.scheduleEnabled,
                    indoors: this.indoorSuppressed,
                    minsLeft: Math.max(0, this.conditionEndsAt - worldMinutes),
                    endsAt: this.conditionEndsAt,
                    startedAt: this.conditionStartedAt,
                    progress,
                    flipAt: null,       // When wet/dry state flips (null = not in range)
                    flipTo: null,
                    // True when the outlook contains no state change at all — in
                    // the city this is the common case, and the app says so
                    // rather than pretending it has nothing to report.
                    flipBeyondRange: false,
                    horizon: 0,         // How far ahead the forecast actually reaches
                    upcoming: this.forecast.map(f => ({
                        id: f.id,
                        label: (WEATHER_CONDITIONS[f.id] || cfg).label,
                        icon: (WEATHER_CONDITIONS[f.id] || cfg).icon,
                        startsAt: f.startsAt,
                        endsAt: f.endsAt,
                        mins: f.endsAt - f.startsAt
                    }))
                };

                // Walk forward to the first entry that flips the wet/dry state.
                for (const f of this.forecast) {
                    if (isWet(f.id) !== wetNow) {
                        out.flipAt = f.startsAt;
                        out.flipTo = f.id;
                        break;
                    }
                }
                out.horizon = this.forecast.length
                    ? this.forecast[this.forecast.length - 1].endsAt - worldMinutes
                    : 0;
                out.flipBeyondRange = (out.flipAt === null);
                return out;
            }

            /** Persist the sky across save/load so the world stays continuous. */
            serialize() {
                return {
                    condition: this.condition,
                    climate: this.climate,
                    intensity: this.intensity,
                    conditionEndsAt: this.conditionEndsAt,
                    conditionStartedAt: this.conditionStartedAt,
                    scheduleEnabled: this.scheduleEnabled,
                    // Saved so the forecast the player was watching before they
                    // quit is still the forecast when they come back.
                    forecast: this.forecast.slice(0, 8)
                };
            }
            deserialize(data) {
                if (!data) return;
                if (WEATHER_CONDITIONS[data.condition]) {
                    this.condition = data.condition;
                    this.targetIntensity = WEATHER_CONDITIONS[data.condition].intensity;
                }
                if (CLIMATE_PROFILES[data.climate]) this.climate = data.climate;
                if (typeof data.intensity === 'number') this.intensity = data.intensity;
                if (typeof data.conditionEndsAt === 'number') this.conditionEndsAt = data.conditionEndsAt;
                if (typeof data.conditionStartedAt === 'number') this.conditionStartedAt = data.conditionStartedAt;
                if (typeof data.scheduleEnabled === 'boolean') this.scheduleEnabled = data.scheduleEnabled;
                // Rebuild the queue from saved data, discarding anything malformed
                // — a corrupt entry here would desync the schedule from the app.
                this.forecast = Array.isArray(data.forecast)
                    ? data.forecast.filter(f =>
                        f && WEATHER_CONDITIONS[f.id] &&
                        typeof f.startsAt === 'number' && typeof f.endsAt === 'number' &&
                        f.endsAt > f.startsAt)
                    : [];
                this._lastWorldMinutes = -1;   // Re-seed the monotonic guard
                this.scheduleLocked = false;
            }
            
            // Set wind vector directly: setWind(x, y)
            // (0,0) = no wind, pure perspective rain. Values ~-2 to 2.
            // Also updates legacy scalar/direction for vehicle grip compatibility.
            setWind(x, y = 0) {
                if (typeof x === 'number' && arguments.length === 1 && y === 0) {
                    // Legacy call: setWind(strength) — convert scalar to vector
                    this.wind = clamp(x, 0, 1);
                    this.windDirection = 1;
                    this.windVec.x = this.wind * this.windDirection;
                    this.windVec.y = 0;
                } else {
                    this.windVec.x = x;
                    this.windVec.y = y;
                    // Sync legacy scalar from vector magnitude
                    this.wind = Math.min(1, Math.sqrt(x * x + y * y));
                    this.windDirection = x >= 0 ? 1 : -1;
                }
            }
            
            // Trigger a lightning flash (used in boss fights and storms)
            triggerLightning() {
                this.lightningFlash = 1.0;
                this.lightningCooldown = 180 + Math.random() * 240; // 3-7 seconds
            }
            
            resize(w, h) { this.width = w; this.height = h; this._halfW = w / 2; this._halfH = h / 2; }
            
            /* ---------------------------------------------------------------
               SPRAY PARTICLES
               ---------------------------------------------------------------
               Creates water/dust spray behind vehicles.
               Parameters:
               - countMult: Multiplier for particle count (default 1)
               - lifeMult: Multiplier for particle lifespan (higher = longer)
               --------------------------------------------------------------- */
            addSpray(x, y, angle, speed, color = 'rgba(200, 200, 255, 0.5)', countMult = 1, lifeMult = 1) {
                // Only spawn if moving fast enough
                let count = Math.abs(speed) > 2 ? 2 : 0;
                count = Math.floor(count * countMult); 
                
                for(let i=0; i<count; i++) {
                    const p = this._particlePool.acquire();
                    p.type = 'spray';
                    p.x = x + (Math.random()-0.5)*5;
                    p.y = y + (Math.random()-0.5)*5;
                    p.vx = -Math.cos(angle)*(Math.random()*3) + (Math.random()-0.5);
                    p.vy = -Math.sin(angle)*(Math.random()*3) + (Math.random()-0.5);
                    p.life = 1.0;
                    p.decay = (0.08 + Math.random()*0.05) / lifeMult;
                    p.color = color;
                    p.size = 2 + Math.random() * 3;
                    this.particles.push(p);
                }
            }
            
            // Explosion: Radial burst of particles (combat/destruction)
            spawnExplosion(x, y, color = 'rgba(0, 243, 255, 1)') {
                for(let i=0; i<15; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = Math.random() * 6;
                    const p = this._particlePool.acquire();
                    p.type = 'explosion';
                    p.x = x; p.y = y;
                    p.vx = Math.cos(ang) * spd;
                    p.vy = Math.sin(ang) * spd;
                    p.life = 1.0;
                    p.decay = 0.05 + Math.random() * 0.05;
                    p.color = color;
                    p.size = 3 + Math.random() * 3;
                    this.particles.push(p);
                }
            }
            
            // Ghost: Player afterimage (flit ability and graveyard effects)
            spawnGhost(x, y, angle, life = 0.5) {
                const p = this._particlePool.acquire();
                p.type = 'ghost';
                p.x = x; p.y = y;
                p.angle = angle;
                p.life = life;
                p.decay = 0.02;
                p.color = 'rgba(164, 105, 255, 0.5)';
                this.particles.push(p);
            }
            
            // Sparks: Bright particles from impacts (metal collisions)
            spawnSparks(x, y, amount = 15) {
                for(let i=0; i<amount; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const speed = 3 + Math.random() * 5;
                    const p = this._particlePool.acquire();
                    p.type = 'spark';
                    p.x = x; p.y = y;
                    p.vx = Math.cos(ang) * speed;
                    p.vy = Math.sin(ang) * speed;
                    p.life = 1.0;
                    p.decay = 0.1 + Math.random() * 0.1;
                    p.color = '#fff5aa';
                    p.size = 1 + Math.random();
                    this.particles.push(p);
                }
            }
            
            // Called every frame from main game loop
            update(camera) {
                /* --- WEATHER STATE RESOLUTION (runs before anything renders) ---
                   Order matters: ease intensity, ease wind, THEN derive isRaining
                   so every consumer this frame sees a consistent picture. */
                const WC = CONFIG.WEATHER;

                // 1. Ease intensity toward the current condition's target. This is
                //    what makes rain arrive and leave instead of blinking on.
                if (this.intensity !== this.targetIntensity) {
                    const delta = this.targetIntensity - this.intensity;
                    const step = WC.SCHED_FADE_RATE;
                    this.intensity = Math.abs(delta) <= step
                        ? this.targetIntensity
                        : this.intensity + Math.sign(delta) * step;
                }

                // 2. Ease wind toward target, plus a slow gust cycle so even
                //    steady rain never looks perfectly uniform.
                this._gustPhase += (Math.PI * 2) / WC.SCHED_GUST_PERIOD;
                const cfg = this.getCondition();
                const gust = Math.sin(this._gustPhase) * (cfg.gust || 0);
                const gust2 = Math.sin(this._gustPhase * 0.37 + 1.2) * (cfg.gust || 0) * 0.6;
                const tx = this._windTarget.x + gust;
                const ty = this._windTarget.y + gust2;
                const wl = WC.SCHED_WIND_LERP;
                this.windVec.x += (tx - this.windVec.x) * wl;
                this.windVec.y += (ty - this.windVec.y) * wl;
                // Keep the legacy scalar/direction in sync. Foliage sway and leaf
                // particles read `wind` as a 0-1 value; normalising by WIND_NORM
                // rather than a flat 0.5 keeps that range usable — at 0.5 every
                // condition above a drizzle clamped to 1 and the trees couldn't
                // tell a shower from a gale.
                const wMag = Math.hypot(this.windVec.x, this.windVec.y);
                this.wind = Math.min(1, wMag / (WC.WIND_NORM * WC.WIND_SCALE));
                this.windDirection = this.windVec.x >= 0 ? 1 : -1;

                // 3. Derive the render gate. Single source of truth — nothing else
                //    should be assigning isRaining.
                this.isRaining = !this.indoorSuppressed
                              && this.intensity > WC.SCHED_RAIN_THRESHOLD;

                // 4. Storms make their own lightning.
                if (this.isRaining && cfg.lightning > 0 && this.lightningCooldown <= 0) {
                    if (Math.random() < cfg.lightning * this.intensity) {
                        this.triggerLightning();
                        if (typeof audioSys !== 'undefined' && audioSys.sfx) {
                            // Thunder trails the flash slightly — light before sound.
                            setTimeout(() => audioSys.sfx('thunder', { muffled: this.indoorSuppressed }), 220 + Math.random() * 500);
                        }
                    }
                }

                // Update perspective rain — drops exist in WORLD space, decoupled from camera
                if(this.isRaining && camera) {
                    const RC = CONFIG.WEATHER;
                    const rainCfg = GameSettings.getRainConfig();
                    // Scheduler strength layered on top of the player's density
                    // setting — never replacing it, so LOW stays cheap in a storm.
                    const wScale = this.getBudgetScale();
                    const hw = this._halfW;
                    const hh = this._halfH;
                    const wx = this.windVec.x;
                    const wy = this.windVec.y;
                    const zoom = camera.zoom || 1;
                    
                    // Visible world rect (with margin so drops don't pop in at edges)
                    const margin = 200 / zoom;
                    const viewW = (this.width / zoom) + margin * 2;
                    const viewH = (this.height / zoom) + margin * 2;
                    const viewLeft = camera.x - viewW / 2;
                    const viewTop = camera.y - viewH / 2;
                    
                    // Scale drop budget by visible area so density stays constant at any zoom
                    // zoom=1 → 1x, zoom=0.5 → 4x area → 4x drops needed
                    const areaScale = Math.min(4, 1 / (zoom * zoom)); // cap at 4x to limit cost
                    const maxDrops = Math.floor(rainCfg.maxDrops * areaScale * wScale);
                    const baseRate = Math.max(1, Math.floor(rainCfg.dropRate * areaScale * wScale));
                    
                    // Spawn new drops in world space within visible area
                    const toSpawn = baseRate + Math.floor(Math.random() * baseRate * 0.4);
                    for (let i = 0; i < toSpawn && this.drops.length < maxDrops; i++) {
                        const gx = viewLeft + Math.random() * viewW;
                        const gy = viewTop + Math.random() * viewH;
                        const h0 = 0.6 + Math.random() * 0.4;
                        
                        // Convert ground target to screen space for direction calc
                        const sx = (gx - camera.x) * zoom + hw;
                        const sy = (gy - camera.y) * zoom + hh;
                        
                        // Direction from initial screen-space apparent position toward screen target
                        const dx = sx - hw;
                        const dy = sy - hh;
                        const parallax = h0 * h0 * RC.RAIN_PARALLAX;
                        const startX = sx + dx * parallax + wx * RC.RAIN_WIND_DRIFT * h0;
                        const startY = sy + dy * parallax + wy * RC.RAIN_WIND_DRIFT * h0;
                        let toX = sx - startX + wx * RC.RAIN_WIND_DIR_STR;
                        let toY = sy - startY + wy * RC.RAIN_WIND_DIR_STR;
                        const dist = Math.sqrt(toX * toX + toY * toY);
                        let dirX = 0, dirY = 1;
                        if (dist > 0.1) { dirX = toX / dist; dirY = toY / dist; }
                        
                        this.drops.push({
                            groundX: gx, groundY: gy,  // WORLD space
                            height: h0,
                            fallSpeed: RC.RAIN_FALL_SPEED_MIN + Math.random() * (RC.RAIN_FALL_SPEED_MAX - RC.RAIN_FALL_SPEED_MIN),
                            brightness: 0.35 + Math.random() * 0.65,
                            dirX: dirX, dirY: dirY
                        });
                    }
                    
                    // Update drops — decrease height, splash on impact, cull off-screen
                    const cullMargin = 400 / zoom;
                    const cullLeft = camera.x - (this.width / zoom) / 2 - cullMargin;
                    const cullRight = camera.x + (this.width / zoom) / 2 + cullMargin;
                    const cullTop = camera.y - (this.height / zoom) / 2 - cullMargin;
                    const cullBottom = camera.y + (this.height / zoom) / 2 + cullMargin;
                    
                    for (let i = this.drops.length - 1; i >= 0; i--) {
                        const d = this.drops[i];
                        d.height -= d.fallSpeed;
                        
                        // Cull drops far from camera (player moved away)
                        if (d.groundX < cullLeft || d.groundX > cullRight ||
                            d.groundY < cullTop || d.groundY > cullBottom) {
                            this.drops[i] = this.drops[this.drops.length - 1];
                            this.drops.pop();
                            continue;
                        }
                        
                        if (d.height <= 0) {
                            // Spawn splash (also in world space)
                            if (this.splashes.length < rainCfg.maxSplashes * areaScale * wScale) {
                                this.splashes.push({
                                    x: d.groundX, y: d.groundY,  // WORLD space
                                    t: 0, lifespan: 300 + Math.random() * 250,
                                    maxR: CONFIG.WEATHER.SPLASH_RADIUS_MIN + Math.random() * (CONFIG.WEATHER.SPLASH_RADIUS_MAX - CONFIG.WEATHER.SPLASH_RADIUS_MIN),
                                    rings: Math.random() > (1 - CONFIG.WEATHER.SPLASH_RINGS_CHANCE) ? 2 : 1,
                                    br: d.brightness
                                });
                            }
                            this.drops[i] = this.drops[this.drops.length - 1];
                            this.drops.pop();
                        }
                    }
                    
                    // Update splashes — cull off-screen ones too
                    for (let i = this.splashes.length - 1; i >= 0; i--) {
                        this.splashes[i].t += 16.67;
                        const s = this.splashes[i];
                        if (s.t > s.lifespan ||
                            s.x < cullLeft || s.x > cullRight ||
                            s.y < cullTop || s.y > cullBottom) {
                            this.splashes[i] = this.splashes[this.splashes.length - 1];
                            this.splashes.pop();
                        }
                    }
                }
                
                // Update all particles
                for(let i=this.particles.length-1; i>=0; i--) {
                    let p = this.particles[i]; 
                    
                    // Ghosts drift slowly in their facing direction
                    if (p.type === 'ghost') {
                        p.x += Math.cos(p.angle) * 0.5; 
                        p.y += Math.sin(p.angle) * 0.5;
                    } else { 
                        p.x += p.vx; 
                        p.y += p.vy; 
                    }
                    
                    // Reduce life and apply friction to explosions
                    p.life -= p.decay; 
                    if (p.type === 'explosion') { 
                        p.vx *= 0.9; 
                        p.vy *= 0.9; 
                    }
                    
                    // Remove dead particles - release to pool and use O(1) swap removal
                    if(p.life <= 0) {
                        this._particlePool.release(p);
                        this.particles[i] = this.particles[this.particles.length - 1];
                        this.particles.pop();
                    }
                }
                
                // Lightning flash decay (fast fade out)
                if (this.lightningFlash > 0) {
                    this.lightningFlash -= 0.15;
                    if (this.lightningFlash < 0) this.lightningFlash = 0;
                }
                
                // Lightning cooldown countdown
                if (this.lightningCooldown > 0) {
                    this.lightningCooldown--;
                }
            }
            draw(ctx) {
                this.particles.forEach(p => {
                    ctx.save();
                    if (p.type === 'ghost') {
                        ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = `rgba(164, 255, 255, ${p.life * 0.6})`; 
                        ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
                        ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(10, -10, 10, 10, 0, 15); ctx.bezierCurveTo(-10, 10, -10, -10, 0, -10); ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                    else if (p.type === 'spark') {
                                ctx.strokeStyle = `rgba(255, 220, 100, ${p.life})`;
                                ctx.lineWidth = 2;
                                ctx.beginPath();
                                ctx.moveTo(p.x, p.y);
                                ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); // Trail effect
                                ctx.stroke();
                    } else {
                        ctx.fillStyle = p.color.replace('1)', `${p.life})`).replace('0.5)', `${p.life * 0.5})`); ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
                    }
                    ctx.restore();
                });
                ctx.globalAlpha = 1.0;
            }
            drawRainOverlay(ctx, camera, lamps) {
                if (!this.isRaining || !camera) return;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                
                const hw = this._halfW;
                const hh = this._halfH;
                const pxStr = CONFIG.WEATHER.RAIN_PARALLAX;
                const wDrift = CONFIG.WEATHER.RAIN_WIND_DRIFT;
                const wx = this.windVec.x;
                const wy = this.windVec.y;
                const camX = camera.x;
                const camY = camera.y;
                const zoom = camera.zoom || 1;
                
                // --- BATCHED RAIN RENDERING ---
                // Bucket drops by height band to batch stroke() calls
                // 4 bands × 2 passes (main + core) = max 8 stroke calls instead of 2000+
                ctx.lineCap = 'round';
                
                const BANDS = 4;
                const bandPaths = new Array(BANDS);
                const corePaths = new Array(BANDS);
                const bandAlpha = new Float32Array(BANDS);
                const bandWidth = new Float32Array(BANDS);
                const coreAlpha = new Float32Array(BANDS);
                const coreWidth = new Float32Array(BANDS);
                const bandCount = new Int32Array(BANDS);
                
                // Visual weight of the current condition. Uses the RAW intensity
                // (not the budget-capped one) so a storm reads heavier on screen
                // than a shower even though both draw a similar number of drops.
                // Curved so drizzle thins out noticeably rather than just having
                // fewer drops at full opacity.
                const vScale = Math.min(1.35, Math.pow(Math.max(0, this.intensity), 0.75));

                // Pre-calculate band visual properties (using band midpoints)
                for (let b = 0; b < BANDS; b++) {
                    const midH = (b + 0.5) / BANDS;
                    bandWidth[b] = (0.4 + midH * 1.6) * Math.min(zoom, 1.5);
                    bandAlpha[b] = (0.08 + midH * 0.2) * 0.7 * vScale; // avg brightness ~0.7
                    coreWidth[b] = Math.max(0.3, bandWidth[b] * 0.35);
                    coreAlpha[b] = bandAlpha[b] * 0.3;
                }
                
                // Pre-calculate visible lamp screen positions for light interaction
                let screenLamps = null;
                if (lamps && lamps.length > 0) {
                    screenLamps = [];
                    for (const l of lamps) {
                        const lsx = (l.x - camX) * zoom + hw;
                        const lsy = (l.y - camY) * zoom + hh;
                        const lsr = (l.radius || 200) * zoom * 0.6;
                        // Skip lamps far off screen
                        if (lsx < -lsr || lsx > this.width + lsr || lsy < -lsr || lsy > this.height + lsr) continue;
                        const hex = (l.color || '#ffeebb').replace('#', '');
                        // Parse each channel; preserve 0x00 bytes (the `|| 255` fallback
                        // pattern would have corrupted any channel that was 00 — common
                        // in crimson #ff0055, amber #ffaa00, cyan #00ddff lamps — turning
                        // them yellow-white at runtime).
                        const pr = parseInt(hex.substr(0, 2), 16);
                        const pg = parseInt(hex.substr(2, 2), 16);
                        const pb = parseInt(hex.substr(4, 2), 16);
                        screenLamps.push({
                            sx: lsx, sy: lsy, sr: lsr, srSq: lsr * lsr,
                            r: Number.isNaN(pr) ? 255 : pr,
                            g: Number.isNaN(pg) ? 238 : pg,
                            b: Number.isNaN(pb) ? 187 : pb,
                            intensity: l.intensity || 0.8
                        });
                    }
                    if (screenLamps.length === 0) screenLamps = null;
                }
                
                // Collect lit drop data for the colored pass
                const litDrops = screenLamps ? [] : null;
                
                // Sort drops into bands and build paths
                // Render interpolation: step each drop back by the frame's lag (drops fall
                // d.fallSpeed per tick), so rain falls smoothly between ticks
                const rainLag = (typeof RenderInterp !== 'undefined') ? RenderInterp.lagTicks() : 0;
                for (let i = 0; i < this.drops.length; i++) {
                    const d = this.drops[i];
                    const h = d.height + d.fallSpeed * rainLag;
                    
                    const sx = (d.groundX - camX) * zoom + hw;
                    const sy = (d.groundY - camY) * zoom + hh;
                    if (sx < -40 || sx > this.width + 40 || sy < -40 || sy > this.height + 40) continue;
                    
                    const dxs = sx - hw;
                    const dys = sy - hh;
                    const parallax = h * h * pxStr;
                    const ax = sx + dxs * parallax + wx * wDrift * h;
                    const ay = sy + dys * parallax + wy * wDrift * h;
                    
                    // Length tapers toward screen center: parallax displacement is
                    // small at center (vertical-ish drops, short streaks) and large
                    // at edges (oblique drops, long streaks). Capped at original max
                    // so high-h corner drops don't blow out. Wind also feeds dispMag
                    // via ax/ay, so windy weather naturally lengthens center drops.
                    const dispX = ax - sx;
                    const dispY = ay - sy;
                    const dispMag = Math.sqrt(dispX * dispX + dispY * dispY);
                    const maxLen = (h * (CONFIG.WEATHER.RAIN_LENGTH_FACTOR || 14) + 1) * zoom;
                    const lineLen = Math.min(maxLen, dispMag * 1.8);
                    const tailX = ax - d.dirX * lineLen;
                    const tailY = ay - d.dirY * lineLen;
                    
                    const band = Math.min(BANDS - 1, (h * BANDS) | 0);
                    
                    if (!bandPaths[band]) bandPaths[band] = new Path2D();
                    bandPaths[band].moveTo(tailX, tailY);
                    bandPaths[band].lineTo(ax, ay);
                    bandCount[band]++;
                    
                    // Core pass for drops above 0.4 height
                    if (h > 0.4) {
                        if (!corePaths[band]) corePaths[band] = new Path2D();
                        corePaths[band].moveTo(tailX, tailY);
                        corePaths[band].lineTo(ax, ay);
                    }
                    
                    // Check lamp proximity for light interaction
                    if (screenLamps) {
                        for (const sl of screenLamps) {
                            const ddx = ax - sl.sx, ddy = ay - sl.sy;
                            const distSq = ddx * ddx + ddy * ddy;
                            if (distSq < sl.srSq) {
                                const falloff = 1 - Math.sqrt(distSq) / sl.sr;
                                litDrops.push({
                                    tx: tailX, ty: tailY, ax, ay,
                                    cr: sl.r, cg: sl.g, cb: sl.b,
                                    a: Math.min(0.5, 0.12 + falloff * 0.38) * sl.intensity,
                                    w: bandWidth[band] * (1 + falloff * 0.6)
                                });
                                break; // One lamp per drop
                            }
                        }
                    }
                }
                
                // Stroke each band in one call
                for (let b = 0; b < BANDS; b++) {
                    if (!bandPaths[b] || bandCount[b] === 0) continue;
                    
                    ctx.strokeStyle = `rgba(185,195,220,${bandAlpha[b].toFixed(3)})`;
                    ctx.lineWidth = bandWidth[b];
                    ctx.stroke(bandPaths[b]);
                    
                    // Core glow pass
                    if (corePaths[b]) {
                        ctx.strokeStyle = `rgba(210,220,240,${coreAlpha[b].toFixed(3)})`;
                        ctx.lineWidth = coreWidth[b];
                        ctx.stroke(corePaths[b]);
                    }
                }
                
                // --- LIT RAIN PASS (colored drops near lamps) ---
                if (litDrops && litDrops.length > 0) {
                    // Batch by color (group drops lit by the same lamp)
                    // For simplicity: draw individually since each may have unique alpha/width
                    // Performance: these are a small fraction of total drops
                    for (const ld of litDrops) {
                        ctx.strokeStyle = `rgba(${ld.cr},${ld.cg},${ld.cb},${ld.a.toFixed(3)})`;
                        ctx.lineWidth = ld.w;
                        ctx.beginPath();
                        ctx.moveTo(ld.tx, ld.ty);
                        ctx.lineTo(ld.ax, ld.ay);
                        ctx.stroke();
                    }
                }
                
                // --- BATCHED SPLASH RIPPLES ---
                // Batch splash rings and fills
                const ripplePath = new Path2D();
                const fillPath = new Path2D();
                let rippleCount = 0;
                let fillCount = 0;
                
                for (let i = 0; i < this.splashes.length; i++) {
                    const s = this.splashes[i];
                    const t = Math.max(0, s.t - 16.67 * rainLag) / s.lifespan;   // splashes age 16.67ms per tick
                    
                    const sx = (s.x - camX) * zoom + hw;
                    const sy = (s.y - camY) * zoom + hh;
                    if (sx < -20 || sx > this.width + 20 || sy < -20 || sy > this.height + 20) continue;
                    
                    const r1 = s.maxR * t * zoom;
                    if (r1 > 0.1) {
                        ripplePath.moveTo(sx + r1, sy);
                        ripplePath.arc(sx, sy, r1, 0, Math.PI * 2);
                        rippleCount++;
                    }
                    
                    if (t < 0.25) {
                        const dropR = (1 + (1 - t / 0.25) * 1.2) * zoom;
                        fillPath.moveTo(sx + dropR, sy);
                        fillPath.arc(sx, sy, dropR, 0, Math.PI * 2);
                        fillCount++;
                    }
                }
                
                // One stroke for all ripple rings
                if (rippleCount > 0) {
                    ctx.strokeStyle = 'rgba(180,190,210,0.12)';
                    ctx.lineWidth = 0.7;
                    ctx.stroke(ripplePath);
                }
                
                // One fill for all splash dots
                if (fillCount > 0) {
                    ctx.fillStyle = 'rgba(205,215,235,0.2)';
                    ctx.fill(fillPath);
                }
                
                ctx.restore();
            }
        }
        
