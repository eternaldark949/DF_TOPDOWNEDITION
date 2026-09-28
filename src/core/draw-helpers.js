        /** Normalize an angle difference to [-PI, PI]. */
        function normalizeAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
        
        /** Darken a hex color by an absolute RGB amount (0-255). */
        function darkenHex(hex, amount) {
            hex = hex.replace('#', '');
            const r = clamp(parseInt(hex.substr(0, 2), 16) - amount, 0, 255);
            const g = clamp(parseInt(hex.substr(2, 2), 16) - amount, 0, 255);
            const b = clamp(parseInt(hex.substr(4, 2), 16) - amount, 0, 255);
            return `rgb(${r},${g},${b})`;
        }
        
        /** Lighten a hex color by an absolute RGB amount (0-255). */
        function lightenHex(hex, amount) {
            hex = hex.replace('#', '');
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

