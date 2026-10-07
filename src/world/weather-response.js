        /* =====================================================================
           WEATHER RESPONSE — how the weather reaches a character
           ---------------------------------------------------------------------
           weatherAt(entity) → { wind: {x,y}, hairWind: {x,y}, rain, strong } or null
             wind      cloth's push toward downwind (world px per physics slice),
                       with a gust that's out of step per character
             hairWind  the same for hair (lighter, so it streams without whipping)
             rain      0 … 1 how hard it's raining on them
             strong    0 … 1 how much the wind makes them lean their head into it
           Indoor maps are still (except the player on an outdoor part, like the veranda,
           where it reaches her as she steps out: RoomSystem.outdoorness).
           Lightning: each strike makes outdoor characters flinch, a few hundredths
           of a second apart, so a crowd ripples instead of jumping as one.
           ===================================================================== */
        const WEATHER_RESPONSE = { CLOTH_WIND: 0.085, HAIR_WIND: 0.05, STRONG_FROM: 0.55, STRONG_SPAN: 0.4 };

        // Every outdoor character shares the same wind direction. Cache by the actual
        // components, including signed zero, so edits and map changes are immediate.
        let _weatherDirX, _weatherDirY, _weatherDirAngle = 0;
        function _weatherWindAngle(x, y) {
            if (!Object.is(x, _weatherDirX) || !Object.is(y, _weatherDirY)) {
                _weatherDirX = x; _weatherDirY = y; _weatherDirAngle = Math.atan2(y, x);
            }
            return _weatherDirAngle;
        }

        function weatherAt(entity) {
            if (typeof game === 'undefined' || !game || !game.weather || !game.activeMap || !entity) return null;
            const map = game.activeMap, w = game.weather;
            // Indoor maps are still, except the player out on an open part of one (the apartment
            // veranda) — and the weather reaches her as she steps out, not all at once
            let reach = 1;
            if (map.type === 'indoor') {
                const rs = game.roomSystem;
                if ((entity !== game.player && entity._reflectionSource !== game.player) || !rs || !rs.active) return null;
                reach = rs.outdoorness;
                if (reach < 0.01) return null;
            }
            const seed = entity._wxSeed !== undefined ? entity._wxSeed : (entity._wxSeed = Math.random() * 100);
            const t = _gameTimeSec;
            const gust = 1 + 0.35 * Math.sin(t * 2.3 + seed) + 0.15 * Math.sin(t * 5.1 + seed * 1.7);
            const k = WEATHER_RESPONSE, wv = w.windVec || { x: 0, y: 0 }, v = { x: wv.x * reach, y: wv.y * reach };
            const out = {
                wind: { x: v.x * k.CLOTH_WIND * gust, y: v.y * k.CLOTH_WIND * gust },
                hairWind: { x: v.x * k.HAIR_WIND * gust, y: v.y * k.HAIR_WIND * gust },
                rain: w.isRaining ? Math.min(1, w.intensity || 0) * reach : 0,
                strong: Math.max(0, Math.min(1, ((w.wind || 0) - k.STRONG_FROM) / k.STRONG_SPAN)) * reach,
                dir: _weatherWindAngle(wv.x, wv.y)
            };
            // Lightning ripple: a flinch per strike, staggered per character
            const strike = w.strikeCount || 0;
            if (entity._wxStrike === undefined) entity._wxStrike = strike;
            if (strike !== entity._wxStrike) { entity._wxStrike = strike; entity._boltAt = t + Math.random() * 0.15; }
            if (entity._boltAt !== undefined && t >= entity._boltAt) {
                entity._hitT = t; entity._hitDir = Math.random() * Math.PI * 2; entity._boltAt = undefined;
            }
            return out;
        }

        /** Draw an umbrella seen from above: a ribbed canopy (open 0…1) or a furled stick in the hand. */
        const _sheens = new Map();
        function _umbrellaSheen(R) {
            const k = Math.round(R * 4) / 4; let g = _sheens.get(k);
            if (!g) {
                const c = (_sheens._c || (_sheens._c = document.createElement('canvas').getContext('2d')));
                g = c.createRadialGradient(-k * 0.35, -k * 0.35, 0, 0, 0, k);
                g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                _sheens.set(k, g);
            }
            return g;
        }
        function drawUmbrella(ctx, cx, cy, handX, handY, open, u) {
            const color = u.color || '#1a1a1a', trim = u.trim || darkenHex(color, 40);
            if (open < 0.15) {                                                   // furled: a slim stick along the forearm
                ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(handX + 1, handY); ctx.lineTo(handX - 13, handY + (handY > 0 ? 2 : -2)); ctx.stroke();
                ctx.lineCap = 'butt';
                return;
            }
            const R = 17 * open, N = 8;
            ctx.save();
            ctx.globalAlpha = 0.93;
            ctx.fillStyle = color;
            ctx.beginPath();
            for (let i = 0; i <= N; i++) {                                       // scalloped rim between the ribs
                const a0 = (i - 1) / N * Math.PI * 2, a1 = i / N * Math.PI * 2, am = (a0 + a1) / 2;
                if (i === 0) { ctx.moveTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); continue; }
                ctx.quadraticCurveTo(cx + Math.cos(am) * R * 0.88, cy + Math.sin(am) * R * 0.88, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
            }
            ctx.fill();
            // Sheen on the upper panels, ribs, the tip
            // (one gradient per canopy size, made once: shifted into place, the path stays where it was built)
            const sh = _umbrellaSheen(R);
            ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = sh; ctx.fill(); ctx.restore();
            ctx.strokeStyle = trim; ctx.lineWidth = 0.7; ctx.beginPath();
            for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
            ctx.stroke();
            ctx.fillStyle = trim;
            for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.9, 0, Math.PI * 2); ctx.fill(); }
            ctx.beginPath(); ctx.arc(cx, cy, 1.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
