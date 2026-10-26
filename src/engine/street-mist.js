        // GameEngine — Street mist and lantern sparks. Methods are added to GameEngine.prototype
        // (see engineMixin in game-engine.js).
        //
        // After dark, a pale violet mist drifts through the city on the wind, thick in some
        // places and thin in others. Where it passes through a lantern's light, the light
        // hangs in it. Warm motes rise off each lit lantern, drift and fade. Both are drawn
        // after the darkness (drawEmissivePass): the mist under the lanterns, so their points
        // of light stay crisp in it, and the sparks over them. Outdoor maps only.
        //
        // Settings → Street Fog (GameSettings.streetFog) and Lamp Sparks (GameSettings.lampSparks),
        // each on its own; the Low preset turns both off.

        const MIST = {
            FROM: 0.25, FULL: 0.55,     // ambient darkness where the mist starts to show, and where it's full
            STEP: 170,                  // one puff per this many px of the view, each drawn 2.2× as wide
            SCALE: 520,                 // px across one patch of thick or thin mist
            ALPHA: 0.3,                 // a puff where the mist is thickest
            COLOR: 'rgb(150,128,190)',  // pale violet
            DRIFT: [18, 9],             // px/s it drifts on a still night
            WIND: 6,                    // and this much more per unit of the weather's windVec
            SWAY: [30, 20],             // each puff wanders this far round its place
            LAMP_R: 190,                // a lantern's light caught in the mist: its radius
            LAMP_A: 0.22,               // and its strength where the mist is thickest
        };
        const SPARKS = {
            N: 10,                      // motes per lantern on screen
            RISE: 120,                  // px a mote rises before it's gone
            SPEED: [0.07, 0.12],        // lives per second, slowest to fastest
            SPREAD: 26,                 // px it sways side to side as it rises
            SIZE: [1.3, 2.7],           // radius of its hot core
            ALPHA: 0.9,
        };

        // Value noise for the mist's thickness: patches of thick and thin, smooth between
        const _mistHash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
        function _mistNoise(x, y) {
            const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
            const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
            return (_mistHash(i, j) * (1 - u) + _mistHash(i + 1, j) * u) * (1 - v)
                + (_mistHash(i, j + 1) * (1 - u) + _mistHash(i + 1, j + 1) * u) * v;
        }
        /** How thick the mist is at (x, y), 0..1, after it has drifted (ox, oy) */
        function mistDensity(x, y, ox, oy) {
            const wx = (x - ox) / MIST.SCALE, wy = (y - oy) / MIST.SCALE;
            return Math.max(0, _mistNoise(wx, wy) * 0.65 + _mistNoise(wx * 2.3 + 5, wy * 2.3 + 9) * 0.35 - 0.28) / 0.72;
        }

        // A soft puff in one colour (any CSS colour), baked once per colour: a white puff, then tinted
        const _mistPuffs = new Map();
        function mistPuff(color) {
            let c = _mistPuffs.get(color);
            if (c) return c;
            c = document.createElement('canvas'); c.width = c.height = 128;
            const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g; x.fillRect(0, 0, 128, 128);
            x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 128, 128);
            _mistPuffs.set(color, c);
            return c;
        }
        // A spark: a hot core in a small halo of its lantern's colour, baked once per colour
        const _sparkSprites = new Map();
        function sparkSprite(hex) {
            let c = _sparkSprites.get(hex);
            if (c) return c;
            const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
            c = document.createElement('canvas'); c.width = c.height = 32;
            const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
            gr.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 50)},${Math.min(255, b + 40)},1)`);
            gr.addColorStop(0.18, `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 30)},${Math.min(255, b + 20)},0.9)`);
            gr.addColorStop(0.3, `rgba(${r},${g},${b},0.3)`);
            gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
            x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
            _sparkSprites.set(hex, c);
            return c;
        }
        const _mistHex = (l) => /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#ffeebb';

        engineMixin({
            /** 0 by day, 1 deep in the night: how much mist and how many sparks show */
            _mistNightK(dark) {
                return Math.max(0, Math.min(1, (dark - MIST.FROM) / (MIST.FULL - MIST.FROM)));
            },

            /** After the darkness, under the lanterns: the drifting mist, and the lanterns' light caught in it */
            drawStreetMist(ctx, dark) {
                if (GameSettings.streetFog === false || this.activeMap.type !== 'outdoor' || !this._cullBounds) return;
                const night = this._mistNightK(dark);
                // it drifts on, night or day, so it doesn't jump when it comes back
                const M = this._mist || (this._mist = { ox: 0, oy: 0, t: _frameTime });
                const dt = Math.min(0.1, Math.max(0, (_frameTime - M.t) / 1000)); M.t = _frameTime;
                const w = (this.weather && this.weather.windVec) || { x: 0, y: 0 };
                M.ox += (MIST.DRIFT[0] + w.x * MIST.WIND) * dt; M.oy += (MIST.DRIFT[1] + w.y * MIST.WIND) * dt;
                if (night < 0.01) return;
                const t = _frameTime / 1000, v = this._cullBounds.view, S = MIST.STEP;
                ctx.save();
                const puff = mistPuff(MIST.COLOR);
                for (let x = Math.floor((v.left - S) / S) * S; x < v.right + S; x += S) {
                    for (let y = Math.floor((v.top - S) / S) * S; y < v.bottom + S; y += S) {
                        const d = mistDensity(x, y, M.ox, M.oy);
                        if (d < 0.05) continue;
                        const sx = Math.sin(t * 0.13 + x * 0.01) * MIST.SWAY[0], sy = Math.cos(t * 0.11 + y * 0.01) * MIST.SWAY[1];
                        ctx.globalAlpha = MIST.ALPHA * d * night;
                        ctx.drawImage(puff, x - S * 1.1 + sx, y - S * 1.1 + sy, S * 2.2, S * 2.2);
                    }
                }
                ctx.globalCompositeOperation = 'lighter';
                const R = MIST.LAMP_R;
                for (const entry of this._queryLampCandidates(this._cullBounds.lamps, 'lampMist')) {
                    const l = entry.item;
                    if (l._wakeFrame !== this._renderDrawId || l._wakeDay >= 0.2 || l._forcedOff || !LAMP_TYPE_STYLE[l.lampType]) continue;
                    if (l.x + R < v.left || l.x - R > v.right || l.y + R < v.top || l.y - R > v.bottom) continue;
                    const d = mistDensity(l.x, l.y, M.ox, M.oy);
                    if (d < 0.05) continue;
                    ctx.globalAlpha = MIST.LAMP_A * d * night * Math.min(1, l._lightK ?? 1);
                    ctx.drawImage(mistPuff(_mistHex(l)), l.x - R, l.y - R, R * 2, R * 2);
                }
                ctx.restore();
            },

            /** After a lit lantern's glass (drawEmissivePass): warm motes rising off it */
            drawLampSparks(ctx, l, dark) {
                const k = this._mistNightK(dark) * Math.min(1, l._lightK ?? 1);
                if (k < 0.02) return;
                const t = _frameTime / 1000, seed = (l.x * 13 + l.y * 7) % 1000, spr = sparkSprite(_mistHex(l));
                const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < SPARKS.N; i++) {
                    const h = ((i * 37 + seed) % 10) / 10, sp = SPARKS.SPEED[0] + (SPARKS.SPEED[1] - SPARKS.SPEED[0]) * h;
                    const life = (t * sp + i / SPARKS.N + seed * 0.001) % 1;
                    const a = Math.sin(life * Math.PI) * (0.6 + 0.4 * Math.sin(t * 7 + i * 3 + seed));
                    if (a <= 0.02) continue;
                    const x = l.x + Math.sin(t * 0.6 + i * 2.1 + seed) * SPARKS.SPREAD + (i - (SPARKS.N - 1) / 2) * 6;
                    const y = l.y + 10 - life * SPARKS.RISE;
                    const r = SPARKS.SIZE[0] + (SPARKS.SIZE[1] - SPARKS.SIZE[0]) * (((i * 53 + seed) % 10) / 10);
                    ctx.globalAlpha = a * SPARKS.ALPHA * k;
                    ctx.drawImage(spr, x - r * 5, y - r * 5, r * 10, r * 10);
                }
                ctx.globalCompositeOperation = prevOp; ctx.globalAlpha = prevA;
            }
        });
