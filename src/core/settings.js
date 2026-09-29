        // ============================================================================
        // GAME SETTINGS — Mutable runtime settings (controlled by Settings UI)
        // These override CONFIG values where applicable. Systems read from here.
        // ============================================================================
        /* ============================================================================
           FULLSCREEN
           ----------------------------------------------------------------------------
           The API only grants fullscreen from inside a user gesture, so this can
           never be requested on load — enter() is called from the menu taps that
           start or resume a game, and from the settings toggle. Vendor prefixes are
           still required for older WebKit. On iPhone Safari the element API doesn't
           exist at all (only <video> can go fullscreen); supported() reports false
           and the settings row reads N/A rather than offering a button that no-ops.
           ============================================================================ */
        const FullscreenManager = {
            _el() { return document.documentElement; },

            supported() {
                const el = this._el();
                return !!(el.requestFullscreen || el.webkitRequestFullscreen ||
                          el.mozRequestFullScreen || el.msRequestFullscreen);
            },

            isActive() {
                return !!(document.fullscreenElement || document.webkitFullscreenElement ||
                          document.mozFullScreenElement || document.msFullscreenElement);
            },

            enter() {
                if (!this.supported() || this.isActive()) return;
                const el = this._el();
                const fn = el.requestFullscreen || el.webkitRequestFullscreen ||
                           el.mozRequestFullScreen || el.msRequestFullscreen;
                try {
                    // navigationUI:'hide' asks Android Chrome to drop the nav bar too.
                    const r = fn.call(el, { navigationUI: 'hide' });
                    if (r && r.catch) r.catch(() => {});
                } catch (e) { /* denied — not fatal, the game just runs windowed */ }
            },

            exit() {
                if (!this.isActive()) return;
                const fn = document.exitFullscreen || document.webkitExitFullscreen ||
                           document.mozCancelFullScreen || document.msExitFullscreen;
                if (!fn) return;
                try {
                    const r = fn.call(document);
                    if (r && r.catch) r.catch(() => {});
                } catch (e) { /* ignore */ }
            },

            /** Call from inside a click/tap handler that starts or resumes play. */
            requestIfEnabled() {
                if (GameSettings.fullscreen) this.enter();
            },

            _persist() {
                try { localStorage.setItem('dfab_fullscreen', GameSettings.fullscreen ? '1' : '0'); }
                catch (e) { /* private mode */ }
            },

            init() {
                if (!this.supported()) return;
                ['fullscreenchange', 'webkitfullscreenchange',
                 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev => {
                    document.addEventListener(ev, () => {
                        GameSettings.fullscreen = this.isActive();
                        this._persist();
                        // The viewport just changed size; the canvas is sized from
                        // window.innerWidth/Height so it has to be told.
                        if (typeof game !== 'undefined' && game && game.resize) game.resize();
                        const row = document.getElementById('set-fullscreen');
                        if (row && window.pauseMenuController) {
                            window.pauseMenuController._updateValueEl('set-fullscreen',
                                GameSettings.fullscreen ? 'on' : 'off');
                        }
                    });
                });
            }
        };

        const GameSettings = {
            // --- DENSITY ---
            trafficDensity: 'high',         // 'low' | 'medium' | 'high'
            pedestrianDensity: 'high',      // 'low' | 'medium' | 'high'
            foliageDensity: 'high',         // 'low' | 'medium' | 'high'
            rainDensity: 'high',            // 'low' | 'medium' | 'high'
            
            // --- VISUAL ---
            lightingQuality: 'high',        // 'low' | 'medium' | 'high'
            filmGrain: true,                // Film grain overlay
            softShadows: true,              // Soft shadow edges: the light layer at half resolution, blurred (on for high quality)
            bloom: true,                    // Post-process light bleed
            wetReflections: true,           // Elongated light reflections on wet surfaces
            atmosphereTint: '',             // Color wash: '' | 'amber' | 'violet' | 'crimson' | 'teal'
            colorGrade: 'none',             // 'none' | 'amber_night' | 'violet_noir' | 'crimson' | 'cold_teal' | 'dreampunk'
            
            // --- AUDIO ---
            audioEnabled: true,             // Master audio toggle (SFX + music). false = silent.
            ambienceVolume: (() => {        // Rain, wind, city, room tone, fireplace (0..1); kept outside saves too
                try {
                    const v = parseFloat(localStorage.getItem('dfab_ambience_volume'));
                    if (!isNaN(v)) return Math.max(0, Math.min(1, v));
                } catch (e) { /* private mode */ }
                return 0.7;
            })(),
            
            // --- PERFORMANCE ---
            fpsLimit: 0,
            /* Internal render scale, 1.0 = native. The scene is rasterised into a
               backing store this fraction of the display size and the browser
               upscales it — the same trick DLSS/FSR are built on, minus the
               reconstruction. Stage 0: measurement only. See PerfBench. */
            resolutionScale: 1.0,                    // 0 = uncapped, 60, 30
            
            // --- DISPLAY ---
            // Preference, not live state. FullscreenManager syncs it back down
            // when the player leaves fullscreen by Esc or the system back gesture,
            // so the settings row never claims to be on while the browser is off.
            fullscreen: (() => {
                try {
                    const stored = localStorage.getItem('dfab_fullscreen');
                    if (stored !== null) return stored === '1';
                } catch (e) { /* private mode */ }
                return true;
            })(),
            
            // --- AUTO-DETECT ---
            _isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
            
            // Apply mobile-friendly defaults on first load
            applyPreset(preset) {
                if (preset === 'low') {
                    this.lightingQuality = 'low';
                    this.trafficDensity = 'low';
                    this.pedestrianDensity = 'low';
                    this.foliageDensity = 'low';
                    this.rainDensity = 'low';
                    this.filmGrain = false;
                    this.softShadows = false;
                    this.bloom = false;
                    this.wetReflections = false;
                } else if (preset === 'medium') {
                    this.lightingQuality = 'medium';
                    this.trafficDensity = 'medium';
                    this.pedestrianDensity = 'medium';
                    this.foliageDensity = 'medium';
                    this.rainDensity = 'medium';
                    this.filmGrain = true;
                    this.softShadows = false;
                    this.bloom = true;
                    this.wetReflections = false;
                }
                // 'high' is the default — no changes needed
            },
            
            // --- DENSITY LOOKUP TABLES ---
            _densityValues: {
                traffic:    { low: 8,  medium: 16, high: 80 },   // high bumped 30 → 80 for crowds
                pedestrian: { low: 10, medium: 25, high: 100 },  // high bumped 40 → 100 for crowds
                foliage:    { low: 0.3, medium: 0.6, high: 1.0 }, // fraction of foliage rendered
                rain: {
                    low:    { maxDrops: 300,  dropRate: 25,  maxSplashes: 150 },
                    medium: { maxDrops: 600,  dropRate: 55,  maxSplashes: 350 },
                    high:   { maxDrops: 1050, dropRate: 90,  maxSplashes: 600 }
                }
            },
            
            // --- GETTERS ---
            getMaxTraffic()     { return this._densityValues.traffic[this.trafficDensity]; },
            getMaxPedestrians() { return this._densityValues.pedestrian[this.pedestrianDensity]; },
            getFoliageScale()   { return this._densityValues.foliage[this.foliageDensity]; },
            getRainConfig()     { return this._densityValues.rain[this.rainDensity]; },
            
            // Apply film grain visibility
            applyFilmGrain() {
                const container = document.getElementById('game-container');
                if (container) {
                    container.classList.toggle('no-grain', !this.filmGrain);
                }
            }
        };
        
        // ============================================================================
        // OBJECT POOLING SYSTEM - Reduces garbage collection pressure
        // ============================================================================
        class ObjectPool {
            constructor(factory, reset, initialSize = 50) {
                this._factory = factory;
                this._reset = reset;
                this._pool = [];
                this._activeCount = 0;
                for (let i = 0; i < initialSize; i++) {
                    this._pool.push(factory());
                }
            }
            
            acquire() {
                let obj = this._pool.length > 0 ? this._pool.pop() : this._factory();
                this._activeCount++;
                if (obj && typeof obj === 'object') obj._ipGen = 0;   // fresh: don't blend from a previous life (RenderInterp)
                return obj;
            }
            
            release(obj) {
                if (obj && this._activeCount > 0) {
                    this._reset(obj);
                    this._pool.push(obj);
                    this._activeCount--;
                }
            }
            
            releaseAll(activeArray) {
                for (let i = activeArray.length - 1; i >= 0; i--) {
                    this.release(activeArray[i]);
                }
                activeArray.length = 0;
            }
            
            get activeCount() { return this._activeCount; }
            get poolSize() { return this._pool.length; }
        }
        
        // ============================================================================
        // PERFORMANCE UTILITIES - Math caching and optimized operations
        // ============================================================================
        const PerfUtils = {
            // Pre-computed constants
            PI2: Math.PI * 2,
            PI_HALF: Math.PI / 2,
            DEG_TO_RAD: Math.PI / 180,
            RAD_TO_DEG: 180 / Math.PI,
            
            // DOM element cache
            _domCache: new Map(),
            
            getElement(id) {
                if (!this._domCache.has(id)) {
                    this._domCache.set(id, document.getElementById(id));
                }
                return this._domCache.get(id);
            },
            
            clearDomCache() {
                this._domCache.clear();
            },
            
            // Fast distance check (no sqrt)
            distSq(x1, y1, x2, y2) {
                const dx = x2 - x1, dy = y2 - y1;
                return dx * dx + dy * dy;
            },
            
            // Fast distance
            dist(x1, y1, x2, y2) {
                return Math.hypot(x2 - x1, y2 - y1);
            },
            
            // Clamp value
            clamp(val, min, max) {
                return val < min ? min : (val > max ? max : val);
            },
            
            // Linear interpolation
            lerp(a, b, t) {
                return a + (b - a) * t;
            },
            
            // Normalize angle to [0, 2PI)
            normalizeAngle(angle) {
                while (angle < 0) angle += this.PI2;
                while (angle >= this.PI2) angle -= this.PI2;
                return angle;
            }
        };
        
        // ============================================================================
        // ARRAY UTILITIES - O(1) operations for hot paths
        // ============================================================================
        const ArrayUtils = {
            // Remove by swapping with last element (O(1) instead of O(n))
            swapRemove(arr, index) {
                if (index < 0 || index >= arr.length) return false;
                arr[index] = arr[arr.length - 1];
                arr.pop();
                return true;
            },
            
            // Remove value by swap
            swapRemoveValue(arr, value) {
                const idx = arr.indexOf(value);
                if (idx !== -1) {
                    arr[idx] = arr[arr.length - 1];
                    arr.pop();
                    return true;
                }
                return false;
            },
            
            // Filter in-place without allocation
            filterInPlace(arr, predicate) {
                let writeIdx = 0;
                for (let i = 0; i < arr.length; i++) {
                    if (predicate(arr[i])) {
                        arr[writeIdx++] = arr[i];
                    }
                }
                arr.length = writeIdx;
            },
            
            // Fast clear
            clear(arr) {
                arr.length = 0;
            }
        };
        
        // ============================================================================
        // FRAME TIMING - Consistent updates regardless of framerate  
        // ============================================================================
        const FrameTiming = {
            _lastTime: 0,
            _delta: 0,
            _frameCount: 0,
            TARGET_FRAME_TIME: 1000 / 60,
            
            update(timestamp) {
                if (this._lastTime === 0) {
                    this._lastTime = timestamp;
                    this._delta = this.TARGET_FRAME_TIME;
                } else {
                    this._delta = Math.min(timestamp - this._lastTime, this.TARGET_FRAME_TIME * 3);
                    this._lastTime = timestamp;
                }
                this._frameCount++;
                return this._delta / this.TARGET_FRAME_TIME;
            },
            
            // For batching non-critical updates
            shouldUpdate(frequency) {
                return this._frameCount % frequency === 0;
            },
            
            get frameCount() { return this._frameCount; },
            get delta() { return this._delta; }
        };
        
        /* --- JAVASCRIPT LOGIC --- */

        const messageModal = document.getElementById('message-modal');
        function showMessage(text) {
            messageModal.textContent = text;
            messageModal.classList.add('show');
            setTimeout(() => { messageModal.classList.remove('show'); }, 2000);
        }
        
