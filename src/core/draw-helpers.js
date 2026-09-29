        /** Normalize an angle difference to [-PI, PI]. */
        function normalizeAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
        
        /** Darken a hex color by an absolute RGB amount (0-255). */
        function darkenHex(hex, amount) {
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];   // '#222' → '222222'
            const r = clamp(parseInt(hex.substr(0, 2), 16) - amount, 0, 255);
            const g = clamp(parseInt(hex.substr(2, 2), 16) - amount, 0, 255);
            const b = clamp(parseInt(hex.substr(4, 2), 16) - amount, 0, 255);
            return `rgb(${r},${g},${b})`;
        }
        
        /** Lighten a hex color by an absolute RGB amount (0-255). */
        function lightenHex(hex, amount) {
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
            if (walls) { for (const w of walls) { if (getLineRectIntersections(x1, y1, x2, y2, w.x, w.y, w.w, w.h).length > 0) return true; } }
            if (buildings) { for (const b of buildings) { if (getLineRectIntersections(x1, y1, x2, y2, b.x, b.y, b.w, b.h).length > 0) return true; } }
            return false;
        }
        
        /** Raycast: find nearest hit distance along a line through obstacle rects. Returns maxDist if no hit. */
        function raycastNearest(x1, y1, x2, y2, obstacles, maxDist) {
            let nearest = maxDist;
            for (const o of obstacles) {
                for (const hit of getLineRectIntersections(x1, y1, x2, y2, o.x, o.y, o.w, o.h)) {
                    const d = Math.hypot(hit.x - x1, hit.y - y1);
                    if (d < nearest) nearest = d;
                }
            }
            return nearest;
        }
        
        /** Get building colliders from a map object (with fallbacks). */
        function getColliders(map) { return map.buildingColliders || map.buildings || []; }
        
        /** Everything that blocks sight and light on a map: walls plus building footprints (cached per map). */
        function getOccluders(map) {
            if (!map) return [];
            const cols = getColliders(map), walls = map.walls || [];
            const c = map._occluderCache;
            if (c && c.walls === walls && c.cols === cols && c.nw === walls.length && c.nc === cols.length) return c.list;
            const list = walls.concat(cols);
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
        function computeVisibilityPoly(ox, oy, range, obstacles, opts = {}) {
            const relevant = obstacles.filter(o => Math.hypot(o.x + o.w / 2 - ox, o.y + o.h / 2 - oy) < range + Math.max(o.w, o.h));
            const minDist = opts.minDist || 0;                                // ignore hits nearer than this
            const windowed = opts.aMin !== undefined;
            const TAU = Math.PI * 2, span = windowed ? (((opts.aMax - opts.aMin) % TAU + TAU) % TAU || TAU) : 0;
            const rel = a => ((a - opts.aMin) % TAU + TAU) % TAU;
            const angles = [], points = [];
            for (const o of relevant) points.push({ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h });
            if (opts.extraPoints) points.push(...opts.extraPoints);
            for (const p of points) {
                const angle = Math.atan2(p.y - oy, p.x - ox);
                for (const off of [-0.0001, 0, 0.0001]) {
                    if (windowed && rel(angle + off) > span) continue;
                    angles.push(angle + off);
                }
            }
            if (windowed) {
                const step = opts.arcStep || 0.12, n = Math.max(1, Math.ceil(span / step));
                for (let i = 0; i <= n; i++) angles.push(opts.aMin + span * i / n);
            }
            const out = [];
            for (const a of angles) {
                const dx = Math.cos(a), dy = Math.sin(a);
                let closest = range;
                for (const o of relevant) {
                    const hits = getLineRectIntersections(ox, oy, ox + dx * range, oy + dy * range, o.x, o.y, o.w, o.h);
                    for (const h of hits) { const d = Math.hypot(h.x - ox, h.y - oy); if (d < closest && d >= minDist) closest = d; }
                }
                out.push({ angle: a, x: ox + dx * closest, y: oy + dy * closest });
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
            const key = color + '|' + core;
            let cv = _glowSprites.get(key);
            if (cv) return cv;
            const rgb = color[0] === '#' ? hexToRgb(color) : color;
            cv = document.createElement('canvas'); cv.width = cv.height = 64;
            const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 1)`);
            if (core > 0) g.addColorStop(core, `rgba(${rgb}, 0.45)`);        // core 0: a plain linear falloff
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g; c.fillRect(0, 0, 64, 64);
            _glowSprites.set(key, cv);
            return cv;
        }
        /** Stamp a glow of radius r at x, y (alpha from the context's globalAlpha). */
        function drawGlow(ctx, x, y, r, color, core) {
            ctx.drawImage(glowSprite(color, core), x - r, y - r, r * 2, r * 2);
        }

        /**
         * A faulty street lamp, now and then: about one outdoor lamp in ten stutters for
         * a moment every several seconds. Returns a light multiplier (1 = steady).
         */
        function lampFlicker(l) {
            if (l._flick === undefined) {
                const h = Math.abs(Math.sin(l.x * 12.9898 + l.y * 78.233) * 43758.5453) % 1;
                l._flick = h < 0.1 ? h * 10 : -1;
            }
            if (l._flick < 0 || (typeof game !== 'undefined' && game.activeMap && game.activeMap.type !== 'outdoor')) return 1;
            const cyc = 6 + l._flick * 7, ph = (_frameTime / 1000 + l._flick * 37) % cyc;
            if (ph > 0.9) return 1;
            return Math.sin(ph * 47) * Math.sin(ph * 23 + 1.3) > 0.15 ? 0.3 : 1;
        }
