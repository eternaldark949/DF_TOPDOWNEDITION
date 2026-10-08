        /* roundRect for browsers without it (Safari before 16.4): on the 2D context and on Path2D, taking a
           single radius or [all], [tl-br, tr-bl], [tl, tr-bl, br] or [tl, tr, br, bl] like the real one. */
        (() => {
            const shim = function (x, y, w, h, r = 0) {
                let rs = Array.isArray(r) ? r.map(v => typeof v === 'object' ? (v.x || 0) : v) : [r];
                if (rs.length === 1) rs = [rs[0], rs[0], rs[0], rs[0]];
                else if (rs.length === 2) rs = [rs[0], rs[1], rs[0], rs[1]];
                else if (rs.length === 3) rs = [rs[0], rs[1], rs[2], rs[1]];
                const lim = Math.min(Math.abs(w), Math.abs(h)) / 2, [tl, tr, br, bl] = rs.map(v => Math.max(0, Math.min(v || 0, lim)));
                if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
                this.moveTo(x + tl, y);
                this.arcTo(x + w, y, x + w, y + h, tr);
                this.arcTo(x + w, y + h, x, y + h, br);
                this.arcTo(x, y + h, x, y, bl);
                this.arcTo(x, y, x + w, y, tl);
                this.closePath();
            };
            if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = shim;
            if (typeof Path2D !== 'undefined' && !Path2D.prototype.roundRect) Path2D.prototype.roundRect = shim;
            if (typeof OffscreenCanvasRenderingContext2D !== 'undefined' && !OffscreenCanvasRenderingContext2D.prototype.roundRect) OffscreenCanvasRenderingContext2D.prototype.roundRect = shim;
        })();

        /** Normalize an angle difference to [-PI, PI]. */
        function normalizeAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
        
        /** A two-level cache (colour → amount → result): a hit builds no key string. Cleared past 4096 entries. */
        function _hexCache(raw) {
            const top = new Map(); let n = 0;
            return (hex, amount) => {
                let m = top.get(hex);
                if (m === undefined) { if (n > 4096) { top.clear(); n = 0; } m = new Map(); top.set(hex, m); }
                let out = m.get(amount);
                if (out === undefined) { out = raw(hex, amount); m.set(amount, out); n++; }
                return out;
            };
        }
        /** Darken a hex color by an absolute RGB amount (0-255). Cached: bodies ask for the same few every frame. */
        const darkenHex = _hexCache((hex, amount) => _darkenHexRaw(hex, amount));
        function _darkenHexRaw(hex, amount) {
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];   // '#222' → '222222'
            const r = clamp(parseInt(hex.substr(0, 2), 16) - amount, 0, 255);
            const g = clamp(parseInt(hex.substr(2, 2), 16) - amount, 0, 255);
            const b = clamp(parseInt(hex.substr(4, 2), 16) - amount, 0, 255);
            return `rgb(${r},${g},${b})`;
        }
        
        /** Lighten a hex color by an absolute RGB amount (0-255). Cached like darkenHex. */
        const lightenHex = _hexCache((hex, amount) => _lightenHexRaw(hex, amount));
        function _lightenHexRaw(hex, amount) {
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            const r = clamp(parseInt(hex.substr(0, 2), 16) + amount, 0, 255);
            const g = clamp(parseInt(hex.substr(2, 2), 16) + amount, 0, 255);
            const b = clamp(parseInt(hex.substr(4, 2), 16) + amount, 0, 255);
            return `rgb(${r},${g},${b})`;
        }
        
        /** Convert hex color to "r, g, b" string. */
        function hexToRgb(hex) {
            try {
                return `${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}`;
            } catch(e) { return '164, 105, 255'; }
        }
        
        /** '#rrggbb' + alpha → 'rgba(r, g, b, a)'. */
        function hexToRgba(hex, a) { return `rgba(${hexToRgb(hex)}, ${a})`; }

        /** Check if a line segment is blocked by any rect in the obstacle arrays. */
        function isLineBlocked(x1, y1, x2, y2, walls, buildings) {
            const bounds = { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
            const wc = _physicsSpatial.query(walls, bounds);
            if (wc) { for (let i = 0; i < wc.length; i++) { const w = wc[i]; if (segCrossesRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h)) return true; } }
            const bc = _physicsSpatial.query(buildings, bounds);
            if (bc) { for (let i = 0; i < bc.length; i++) { const b = bc[i]; if (segCrossesRect(x1, y1, x2, y2, b.x, b.y, b.w, b.h)) return true; } }
            return false;
        }
        
        /** Raycast: find nearest hit distance along a line through obstacle rects. Returns maxDist if no hit. */
        function raycastNearest(x1, y1, x2, y2, obstacles, maxDist) {
            let nearest = maxDist;
            const candidates = _physicsSpatial.query(obstacles, { left: Math.min(x1, x2), right: Math.max(x1, x2), top: Math.min(y1, y2), bottom: Math.max(y1, y2) });
            for (let i = 0; i < candidates.length; i++) { const o = candidates[i]; nearest = segRectNearest(x1, y1, x2, y2, o.x, o.y, o.w, o.h, nearest, -Infinity); }
            return nearest;
        }
        
        /** Get building colliders from a map object (with fallbacks). */
        function getColliders(map) { return map.buildingColliders || map.buildings || []; }
        
        /** Everything that blocks sight and light on a map: walls plus building footprints (cached per map). */
        function getOccluders(map) {
            if (!map) return [];
            const cols = getColliders(map), walls = map.walls || [];
            const c = map._occluderCache;
            if (c && c.walls === walls && c.cols === cols && c.nw === walls.length && c.nc === cols.length) { _physicsSpatial.track(c.list); return c.list; }
            const list = walls.concat(cols);
            _physicsSpatial.track(list);
            map._occluderCache = { walls, cols, nw: walls.length, nc: cols.length, list };
            return list;
        }

        /**
         * Visibility polygon from (ox, oy) out to `range`, blocked by rect obstacles ({x,y,w,h}).
         * Returns points sorted by angle ({angle, x, y}); fan them from the origin to fill.
         *   opts.extraPoints  more corner points to aim rays at (the lamp bake adds the map corners)
         *   opts.aMin/aMax    only this angle window (radians, aMin → aMax counter-clockwise), with
         *                     its edges and an arc of rays every opts.arcStep (default 0.12) so the far
         *                     edge stays round — used by vision cones and headlight beams
         *   opts.minDist      ignore walls nearer than this (a beam cast from behind the bumper)
         * Rays go to every nearby obstacle corner (±0.0001 rad) and stop at the first wall they hit.
         */
        const _visRel = [], _visAng = [];                                     // scratch, reused by every call
        function computeVisibilityPoly(ox, oy, range, obstacles, opts = {}) {
            const relevant = _visRel; relevant.length = 0;
            for (let i = 0; i < obstacles.length; i++) { const o = obstacles[i]; if (Math.hypot(o.x + o.w / 2 - ox, o.y + o.h / 2 - oy) < range + Math.max(o.w, o.h)) relevant.push(o); }
            const minDist = opts.minDist || 0;                                // ignore hits nearer than this
            const windowed = opts.aMin !== undefined;
            const TAU = Math.PI * 2, span = windowed ? (((opts.aMax - opts.aMin) % TAU + TAU) % TAU || TAU) : 0;
            const rel = a => ((a - opts.aMin) % TAU + TAU) % TAU;
            const angles = _visAng; angles.length = 0;
            // Rays at every corner (and just either side of it), in the order the corners were always listed
            const aim = (px, py) => {
                const angle = Math.atan2(py - oy, px - ox);
                for (let k = -1; k <= 1; k++) {
                    const off = k === 0 ? 0 : k * 0.0001;
                    if (windowed && rel(angle + off) > span) continue;
                    angles.push(angle + off);
                }
            };
            for (let i = 0; i < relevant.length; i++) { const o = relevant[i]; aim(o.x, o.y); aim(o.x + o.w, o.y); aim(o.x + o.w, o.y + o.h); aim(o.x, o.y + o.h); }
            if (opts.extraPoints) for (const p of opts.extraPoints) aim(p.x, p.y);
            if (windowed) {
                const step = opts.arcStep || 0.12, n = Math.max(1, Math.ceil(span / step));
                for (let i = 0; i <= n; i++) angles.push(opts.aMin + span * i / n);
            }
            const out = new Array(angles.length);
            for (let j = 0; j < angles.length; j++) {
                const a = angles[j], dx = Math.cos(a), dy = Math.sin(a), ex = ox + dx * range, ey = oy + dy * range;
                let closest = range;
                for (let i = 0; i < relevant.length; i++) { const o = relevant[i]; closest = segRectNearest(ox, oy, ex, ey, o.x, o.y, o.w, o.h, closest, minDist); }
                out[j] = { angle: a, x: ox + dx * closest, y: oy + dy * closest };
            }
            if (windowed) out.sort((p, q) => rel(p.angle) - rel(q.angle));
            else out.sort((p, q) => p.angle - q.angle);
            return out;
        }

        /** Draw an HP bar at the given position. */
        function drawHPBar(ctx, x, y, w, h, percent) {
            ctx.fillStyle = '#333';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = percent > 0.5 ? '#0f0' : (percent > 0.25 ? '#ff0' : '#f00');
            ctx.fillRect(x, y, w * percent, h);
        }

        /* =================================================================
           ENEMY TELEGRAPH — Unified aim-line renderer
           -----------------------------------------------------------------
           Called by Ganger, Drone, GatlingGunner draw() methods.
           Draws a jittery crimson aim line from the enemy toward the
           locked telegraph angle, brightening as the shot approaches.
           
           @param ctx           Canvas context (world space, pre-camera)
           @param x, y          Enemy world position
           @param angle         Locked aim direction
           @param cooldown      Current frames remaining before shot
           @param threshold     Total telegraph window (frames)
           @param accentColor   Enemy's weapon/signature color
           @param lineLength    How far the aim line extends (default 280)
           ================================================================= */
        function drawEnemyTelegraph(ctx, x, y, angle, cooldown, threshold, accentColor, lineLength) {
            const len = lineLength || 280;
            // Progress 0→1 as shot approaches (0 = just started telegraphing, 1 = about to fire)
            const progress = 1.0 - (cooldown / threshold);
            const alpha = 0.15 + progress * 0.55; // Faint → bright
            
            // Endpoint with slight jitter perpendicular to aim (decreases as shot locks in)
            const jitterAmt = (1.0 - progress) * 8;
            const perpAngle = angle + Math.PI / 2;
            const jitterX = Math.cos(perpAngle) * (Math.random() - 0.5) * jitterAmt;
            const jitterY = Math.sin(perpAngle) * (Math.random() - 0.5) * jitterAmt;
            
            const endX = x + Math.cos(angle) * len + jitterX;
            const endY = y + Math.sin(angle) * len + jitterY;
            
            ctx.save();

            // 1. Outer glow line (wide, faint, accent-colored)
            ctx.globalAlpha = alpha * 0.4;
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 4 + progress * 4;
            ctx.shadowColor = accentColor;
            ctx.shadowBlur = 12;
            ctx.lineCap = 'round';
            ctx.setLineDash([8, 12 - progress * 8]); // Solid up as shot nears
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // 2. Inner core line (thin, bright crimson-white)
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = `rgba(255, ${Math.floor(60 + (1.0 - progress) * 80)}, ${Math.floor(40 + (1.0 - progress) * 60)}, ${alpha})`;
            ctx.lineWidth = 1 + progress * 1.5;
            ctx.shadowColor = '#ff2244';
            ctx.shadowBlur = 6 + progress * 8;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);

            // 3. Body pulse glow (radial, brightens with progress)
            ctx.globalAlpha = alpha * 0.5;
            const pulseR = 18 + progress * 12 + Math.sin(Date.now() * 0.015) * 3;
            const bodyGlow = ctx.createRadialGradient(x, y, 0, x, y, pulseR);
            bodyGlow.addColorStop(0, `rgba(255, 50, 50, ${0.3 + progress * 0.3})`);
            bodyGlow.addColorStop(0.6, `rgba(255, 50, 50, ${0.1 * progress})`);
            bodyGlow.addColorStop(1, 'rgba(255, 50, 50, 0)');
            ctx.fillStyle = bodyGlow;
            ctx.beginPath();
            ctx.arc(x, y, pulseR, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.restore();
        }


        /* ---------------------------------------------------------------------
           Glow sprites — a soft round glow in one colour, rendered once and then
           stamped with drawImage (sized, and faded with globalAlpha). Far cheaper
           than shadowBlur or a new radial gradient every frame.
           --------------------------------------------------------------------- */
        const _glowSprites = new Map();
        /** A 64×64 glow for `color` ('#rrggbb' or 'r, g, b'); `core` 0…1 is how solid the centre is (0 = linear falloff). */
        function glowSprite(color, core = 0.35) {
            let byCore = _glowSprites.get(color);                              // colour → core → sprite (a hit builds no key string)
            if (!byCore) _glowSprites.set(color, byCore = new Map());
            let cv = byCore.get(core);
            if (cv) return cv;
            const rgb = color[0] === '#' ? hexToRgb(color) : color;
            cv = document.createElement('canvas'); cv.width = cv.height = 64;
            const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 1)`);
            if (core > 0) g.addColorStop(core, `rgba(${rgb}, 0.45)`);        // core 0: a plain linear falloff
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g; c.fillRect(0, 0, 64, 64);
            byCore.set(core, cv);
            return cv;
        }
        /** Stamp a glow of radius r at x, y (alpha from the context's globalAlpha). */
        function drawGlow(ctx, x, y, r, color, core) {
            ctx.drawImage(glowSprite(color, core), x - r, y - r, r * 2, r * 2);
        }
        /** A glow at alpha `a` (skipped when it'd be invisible, capped at 1): the interiors' light pass helper. Sets globalAlpha. */
        function glowA(ctx, x, y, r, rgb, a) {
            if (a <= 0.003) return;
            ctx.globalAlpha = Math.min(1, a);
            drawGlow(ctx, x, y, r, rgb, 0);
        }

        /**
         * A bulb for an additive ('lighter') glow pass: a core of radius cr (rgb, alpha ca) with its halo added over it,
         * as a dot and a glow drawn one by one would: a disc of radius hr (hrgb at ha), or with soft, a glow falling off
         * to nothing (drawGlow's). Baked once per size (the power of two at or over ctx's pixels a world px, so a stamp
         * never shrinks more than half) and stamped at the bulb's own alpha: one draw where it was two or three.
         * Stamp it centred on (x, y), b.r world px each way: ctx.drawImage(b, x - b.r, y - b.r, b.r * 2, b.r * 2).
         */
        const _bulbSprites = new Map();
        function bulbSprite(ctx, rgb, ca, cr, hrgb, ha, hr, soft) {
            const m = ctx.getTransform(), S = Math.min(8, Math.max(1, 2 ** Math.ceil(Math.log2(Math.hypot(m.a, m.b) || 1))));
            const key = S + rgb + ca + cr + (hrgb ? hrgb + ha + hr + soft : '');
            let cv = _bulbSprites.get(key);
            if (cv) return cv;
            const R = (hrgb ? hr : cr) + 1, n = Math.ceil(R * 2 * S);   // (a pixel's pad for the edge's antialiasing)
            cv = document.createElement('canvas'); cv.width = cv.height = n; cv.r = n / S / 2;
            const c = cv.getContext('2d'); c.scale(S, S); c.globalCompositeOperation = 'lighter';
            c.fillStyle = `rgba(${rgb},${ca})`; c.beginPath(); c.arc(cv.r, cv.r, cr, 0, Math.PI * 2); c.fill();
            if (hrgb) {
                if (soft) { const g = c.createRadialGradient(cv.r, cv.r, 0, cv.r, cv.r, hr); g.addColorStop(0, `rgba(${hrgb},${ha})`); g.addColorStop(1, `rgba(${hrgb},0)`); c.fillStyle = g; }
                else c.fillStyle = `rgba(${hrgb},${ha})`;
                c.beginPath(); c.arc(cv.r, cv.r, hr, 0, Math.PI * 2); c.fill();
            }
            _bulbSprites.set(key, cv);
            return cv;
        }
        /** Stamp bulb sprite b centred on (x, y) at alpha a (skipped when it'd be invisible). Sets globalAlpha. */
        function drawBulb(ctx, b, x, y, a) {
            if (a <= 0.003) return;
            ctx.globalAlpha = Math.min(1, a); ctx.drawImage(b, x - b.r, y - b.r, b.r * 2, b.r * 2);
        }

        /**
         * A faulty street lamp, now and then: about one outdoor lamp in ten stutters for
         * a moment every several seconds. Returns a light multiplier (1 = steady).
         */
        /**
         * Street lamps under the open sky wake one by one at dusk (17:45–18:15, each at its own
         * minute), stuttering for a couple of minutes before they settle, and go out one by one
         * after dawn. 0 = off, 1 = burning. Indoors, and for candles, always 1.
         */
        function lampWake(l) {
            if (l.candle || typeof game === 'undefined' || !game.activeMap || game.activeMap.type !== 'outdoor') return 1;
            if (l._wake === undefined) l._wake = Math.abs(Math.sin(l.x * 3.137 + l.y * 7.713) * 9173.13) % 1;
            const m = game.worldMinutes % 1440, on = 17 * 60 + 45 + l._wake * 30, off = 6 * 60 + 5 + l._wake * 25;
            if (m >= off && m < on) return 0;
            const since = m >= on ? m - on : Infinity;
            if (since >= 2.5) return 1;
            const ph = since / 2.5, step = Math.floor(_frameTime / 70) + Math.floor(l._wake * 997);
            const n = Math.abs(Math.sin(step * 12.9898 + l._wake * 78.233) * 43758.5453) % 1;
            return n < 0.35 + 0.55 * ph ? 0.4 + 0.6 * ph : 0.04;
        }
        function lampFlicker(l) {
            if (l.candle) {                                           // candle flames breathe (the House's candelabras)
                const t = _frameTime / 1000, o = l.animOffset || 0;
                return 0.86 + 0.08 * Math.sin(t * 9 + o) + 0.06 * Math.sin(t * 23 + o * 1.7);
            }
            if (l._flick === undefined) {
                const h = Math.abs(Math.sin(l.x * 12.9898 + l.y * 78.233) * 43758.5453) % 1;
                l._flick = h < 0.1 ? h * 10 : -1;
            }
            if (l._flick < 0 || (typeof game !== 'undefined' && game.activeMap && game.activeMap.type !== 'outdoor')) return 1;
            const cyc = 6 + l._flick * 7, ph = (_frameTime / 1000 + l._flick * 37) % cyc;
            if (ph > 0.9) return 1;
            return Math.sin(ph * 47) * Math.sin(ph * 23 + 1.3) > 0.15 ? 0.3 : 1;
        }
