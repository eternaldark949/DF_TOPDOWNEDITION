        /* =====================================================================
           SCENE VISIONS — full-screen painted sequences a scene steps through
           ---------------------------------------------------------------------
           For what the top-down world can't show: the Keeper's trance. A vision
           is a canvas over the world (under the letterbox and the subtitles) whose
           look eases between states the script sets with beat():

               s.vision.show('vanoga', 60);     // fade in over 60 ticks
               s.vision.beat('pinprick');       // …then 'pulse', 'burst', 'orb'
               s.vision.hide(60);

           Painted every tick from the state, so it pauses with the game.
           ===================================================================== */
        class SceneVision {
            constructor() {
                this.cv = null; this.name = null; this.alpha = 0; this.alphaTo = 0; this.alphaStep = 0; this.t = 0;
                this.S = {}; this.T = {};
            }
            _build() {
                if (this.cv) return;
                this.cv = document.createElement('canvas'); this.cv.id = 'scene-vision';
                Object.assign(this.cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 1090, pointerEvents: 'none', opacity: 0 });
                document.body.appendChild(this.cv);
            }
            /** Fade a vision in. Showing the same one again resumes it where it was (a cut away and back). */
            show(name, frames = 60) {
                this._build();
                if (this._last !== name) {
                    this.t = 0; this.shards = null;
                    this.S = { flames: 1, speed: 1, dark: 0, egg: 0, pulse: 0, burst: 0, orb: 0 };   // current
                    this.T = { ...this.S };                                                              // targets
                }
                this.name = this._last = name;
                this.alphaTo = 1; this.alphaStep = 1 / Math.max(1, frames);
                return { done: () => this.alpha >= 1 };
            }
            hide(frames = 60) {
                this.alphaTo = 0; this.alphaStep = frames ? 1 / frames : 1;
                if (!frames) { this.alpha = 0; if (this.cv) this.cv.style.opacity = 0; this.name = null; }
                return { done: () => this.alpha <= 0 };
            }
            /** Move toward a named state. Returns a waitable that's done once it has (about) arrived. */
            beat(name) {
                const B = SCENE_VISION_BEATS[this.name] && SCENE_VISION_BEATS[this.name][name];
                if (B) Object.assign(this.T, B);
                if (name === 'burst') this.burstT = 0;
                return { done: () => Object.keys(B || {}).every(k => Math.abs(this.S[k] - this.T[k]) < 0.02) };
            }
            tick() {
                if (!this.cv || (!this.name && this.alpha <= 0)) return;
                this.t++;
                if (this.alpha !== this.alphaTo) {
                    this.alpha += Math.sign(this.alphaTo - this.alpha) * Math.min(this.alphaStep, Math.abs(this.alphaTo - this.alpha));
                    this.cv.style.opacity = this.alpha;
                    if (this.alpha <= 0 && this.alphaTo === 0) { this.name = null; return; }
                }
                // Ease every quantity toward its target (the burst runs on its own clock)
                for (const k in this.T) { const r = k === 'burst' ? 0.012 : k === 'egg' ? 0.01 : 0.025; this.S[k] += (this.T[k] - this.S[k]) * r; }
                if (this.T.burst > 0) this.S.burst = Math.min(this.T.burst, (this.burstT = (this.burstT || 0) + 1) / 150);
                const P = SCENE_VISION_PAINT[this.name];
                if (P) {
                    const cv = this.cv, k = Math.min(1.5, window.devicePixelRatio || 1), w = Math.round(innerWidth * k), h = Math.round(innerHeight * k);
                    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
                    P.call(this, cv.getContext('2d'), w, h, this.t, this.S);
                }
            }
        }

        const SCENE_VISION_BEATS = {
            vanoga: {
                streams:  { flames: 1, speed: 1, dark: 0 },
                slow:     { flames: 0.15, speed: 0.12, dark: 1 },
                pinprick: { flames: 0, dark: 1, egg: 0.3, pulse: 0.15 },
                near:     { egg: 0.62, pulse: 0.55 },
                pulse:    { egg: 0.8, pulse: 1 },
                burst:    { burst: 1, egg: 0, pulse: 0 },
                orb:      { orb: 1 }
            }
        };

        const SCENE_VISION_PAINT = {
            /** The trance: flames streaming past like time running backwards, the dark, Vanoga, the burst, the Lord. */
            vanoga(c, w, h, t, S) {
                const cx = w / 2, cy = h / 2, m = Math.min(w, h), TAU = Math.PI * 2;
                // Ground: fire orange going to the dark of space
                const warm = 1 - S.dark;
                c.fillStyle = `rgb(${Math.round(4 + 60 * warm)},${Math.round(2 + 18 * warm)},${Math.round(10 + 4 * warm)})`; c.fillRect(0, 0, w, h);
                // Stars, once the dark comes
                if (S.dark > 0.05) {
                    const R = seededRandom(6125);
                    for (let i = 0; i < 180; i++) {
                        const x = R() * w, y = R() * h, tw = 0.5 + 0.5 * Math.sin(t * 0.03 + i);
                        c.globalAlpha = S.dark * (0.15 + 0.5 * R()) * tw; c.fillStyle = i % 9 ? '#d9ccff' : '#ffd8a8';
                        c.fillRect(x, y, 1 + (i % 13 === 0), 1 + (i % 13 === 0));
                    }
                    c.globalAlpha = 1;
                }
                // The flames: tongues and half-seen shapes (faces, arches, towers) streaming out from the centre
                if (S.flames > 0.01) {
                    c.save(); c.globalCompositeOperation = 'lighter';
                    const R = seededRandom(949), N = 70, clock = t * 0.004 * (0.3 + S.speed * 2.2);
                    for (let i = 0; i < N; i++) {
                        const a = R() * TAU, ph = (R() + clock * (0.6 + R())) % 1, d = ph * ph * m * 0.85, sz = (0.02 + ph * 0.12) * m * (0.6 + R());
                        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, al = S.flames * Math.sin(ph * Math.PI) * 0.55;
                        const g = c.createRadialGradient(x, y, 0, x, y, sz);
                        g.addColorStop(0, `rgba(255,${170 + (i % 5) * 12},90,${al})`); g.addColorStop(0.5, `rgba(230,90,40,${al * 0.5})`); g.addColorStop(1, 'rgba(120,20,10,0)');
                        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, sz * 0.55, sz, a + Math.PI / 2, 0, TAU); c.fill();
                        // Every few: a shape in the fire — a face, an arch, a spire
                        if (i % 6 === 0 && ph > 0.2 && ph < 0.8) {
                            c.strokeStyle = `rgba(255,225,170,${al * 0.9})`; c.lineWidth = Math.max(1, sz * 0.05); c.beginPath();
                            const kind = i % 18;
                            if (kind === 0) { c.arc(x, y - sz * 0.12, sz * 0.16, 0, TAU); c.moveTo(x - sz * 0.34, y + sz * 0.38); c.quadraticCurveTo(x - sz * 0.3, y + sz * 0.06, x, y + sz * 0.06); c.quadraticCurveTo(x + sz * 0.3, y + sz * 0.06, x + sz * 0.34, y + sz * 0.38); }   // someone, head and shoulders
                            else if (kind === 6) { c.moveTo(x - sz * 0.3, y + sz * 0.3); c.lineTo(x - sz * 0.3, y - sz * 0.05); c.arc(x, y - sz * 0.05, sz * 0.3, Math.PI, 0); c.lineTo(x + sz * 0.3, y + sz * 0.3); }
                            else { c.moveTo(x - sz * 0.25, y + sz * 0.35); c.lineTo(x - sz * 0.1, y - sz * 0.1); c.lineTo(x, y - sz * 0.45); c.lineTo(x + sz * 0.1, y - sz * 0.1); c.lineTo(x + sz * 0.25, y + sz * 0.35); }
                            c.stroke();
                        }
                    }
                    c.restore();
                }
                // Vanoga: a pinprick of gold easing closer, pulsing brighter
                if (S.egg > 0.01) {
                    const pulse = 0.5 + 0.5 * Math.sin(t * (0.05 + S.pulse * 0.07));
                    const r = m * (0.004 + S.egg * S.egg * 0.07), aura = r * (3 + S.pulse * 6 + pulse * S.pulse * 3);
                    c.save(); c.globalCompositeOperation = 'lighter';
                    const g = c.createRadialGradient(cx, cy, 0, cx, cy, aura);
                    g.addColorStop(0, `rgba(255,236,170,${0.5 + 0.4 * pulse * S.pulse})`); g.addColorStop(0.25, `rgba(232,194,122,${0.25 + 0.2 * S.pulse})`); g.addColorStop(1, 'rgba(232,194,122,0)');
                    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, aura, 0, TAU); c.fill();
                    c.restore();
                    c.fillStyle = '#fff4d6'; c.beginPath(); c.ellipse(cx, cy, r * 0.82, r, 0, 0, TAU); c.fill();       // an egg, not a ball
                    c.strokeStyle = `rgba(232,194,122,${0.6})`; c.lineWidth = Math.max(1, r * 0.08); c.stroke();
                }
                // The burst: gold splattered across the dark, shards flying, a nebula left behind
                if (S.burst > 0.001) {
                    if (!this.shards) { const R = seededRandom(1); this.shards = Array.from({ length: 160 }, () => ({ a: R() * TAU, v: 0.25 + R() * 0.9, s: 1 + R() * 4, k: R() })); }
                    const b = S.burst, e = 1 - Math.pow(1 - b, 3);
                    c.save(); c.globalCompositeOperation = 'lighter';
                    const flash = Math.max(0, 1 - b * 4);
                    if (flash > 0) { c.fillStyle = `rgba(255,240,200,${flash * 0.85})`; c.fillRect(0, 0, w, h); }
                    for (let i = 0; i < 7; i++) {                                // the splatter: soft gold lobes
                        const a = i * 0.9 + 0.3, d = e * m * (0.18 + (i % 3) * 0.09), R = m * (0.12 + (i % 2) * 0.08) * e;
                        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
                        const g = c.createRadialGradient(x, y, 0, x, y, R);
                        g.addColorStop(0, `rgba(255,205,110,${0.5 * (1 - b * 0.35)})`); g.addColorStop(0.5, `rgba(240,160,70,${0.22 * (1 - b * 0.35)})`); g.addColorStop(1, 'rgba(232,150,60,0)');
                        c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
                    }
                    for (const q of this.shards) {
                        const d = e * q.v * m * 0.75, x = cx + Math.cos(q.a) * d, y = cy + Math.sin(q.a) * d;
                        const sz = q.s * (1.1 - b * 0.4) * (m / 480);
                        c.fillStyle = q.k > 0.82 ? `rgba(255,170,215,${0.95 - b * 0.35})` : `rgba(255,${205 + (q.k * 40 | 0)},120,${0.95 - b * 0.4})`;
                        c.beginPath(); c.arc(x, y, sz, 0, TAU); c.fill();
                        c.strokeStyle = `rgba(255,215,140,${0.5 * (1 - b * 0.7)})`; c.lineWidth = Math.max(1, sz * 0.5); c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(q.a) * 40 * (1 - b * 0.6), y - Math.sin(q.a) * 40 * (1 - b * 0.6)); c.stroke();
                    }
                    c.restore();
                }
                // The Empereal Lord: a pink orb wafting out from the centre, among Vanoga's shards
                if (S.orb > 0.01) {
                    const o = S.orb, x = cx + Math.sin(t * 0.012) * m * 0.03 * o, y = cy - o * m * 0.05 + Math.cos(t * 0.017) * m * 0.015, r = m * 0.035 * (0.4 + 0.6 * o);
                    c.save(); c.globalCompositeOperation = 'lighter';
                    const g = c.createRadialGradient(x, y, 0, x, y, r * 5);
                    g.addColorStop(0, `rgba(255,170,215,${0.55 * o})`); g.addColorStop(0.3, `rgba(230,110,190,${0.25 * o})`); g.addColorStop(1, 'rgba(160,60,160,0)');
                    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 5, 0, TAU); c.fill();
                    c.restore();
                    const core = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
                    core.addColorStop(0, `rgba(255,236,246,${o})`); core.addColorStop(0.6, `rgba(246,150,205,${o})`); core.addColorStop(1, `rgba(200,80,160,${o * 0.9})`);
                    c.fillStyle = core; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
                }
                // Vignette
                const v = c.createRadialGradient(cx, cy, m * 0.3, cx, cy, Math.hypot(w, h) * 0.6);
                v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
                c.fillStyle = v; c.fillRect(0, 0, w, h);
            }
        };
