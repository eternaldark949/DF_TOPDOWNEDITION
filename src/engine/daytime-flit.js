        // GameEngine — Daytime exposure, flit teleport effects, graveyard ghosts.
        // Methods are added to GameEngine.prototype (see engineMixin in game-engine.js).
        engineMixin({
            updateDaytimeExposure() {
                const overlay = document.getElementById('daytime-filter');
                if (!overlay) return;
        
                // The sun (dayCycle), felt outdoors — and out on a veranda as she steps onto it
                const rs = this.roomSystem;
                const out = this.activeMap.type === 'indoor' ? (rs && rs.active ? rs.outdoorness : 0) : 1;
                const intensity = this.dayCycle().sun * out;
                if (intensity <= 0.001) {
                    if (this._exposureOff) return;
                    overlay.style.backdropFilter = 'none';
                    overlay.style.webkitBackdropFilter = 'none';
                    this._exposureOff = true;
                    return;
                }
                this._exposureOff = false;
        
                // A gentle lift only: the day's real light is drawn (engine/daylight.js drawDaylight)
                const brightness = 100 + (intensity * 8);
                const contrast = 100;
        
                const filterString = `brightness(${brightness}%) contrast(${contrast}%)`;
                
                overlay.style.backdropFilter = filterString;
                overlay.style.webkitBackdropFilter = filterString;
            },

            /** What a flit costs right now: augment, buffs, and Resonance (Quick Return; Double Step's quick second flit). */
            flitCost() {
                let cost = this.flitState.dashCost;
                if (this.augments && this.augments.isEquipped('flit_ext')) cost = Math.floor(cost * 0.7); // 30% cost reduction
                cost = this.player.buffSystem.getStat('flitCooldown', cost);
                if (this.resonance) {
                    cost = this.resonance.stat('flitCost', cost);
                    if (this.resonance.rank('double_step') >= 3 && _gameTimeSec - this.flitState.lastFlitAt <= 0.6) cost *= 0.5;
                }
                return Math.floor(cost);
            },

            /** Event-only landing search: teleport through obstacles, but finish with a clear player circle. */
            findFlitLanding(angle, distance) {
                const p = this.player, map = this.activeMap, margin = 20, minTravel = 1;
                if (!p || !map || ![p.x, p.y, angle, distance, map.width, map.height].every(Number.isFinite) || distance < minTravel || map.width < margin * 2 || map.height < margin * 2) return null;
                const sx = p.x, sy = p.y, ux = Math.cos(angle), uy = Math.sin(angle);
                const radius = Number.isFinite(p.radius) && p.radius > 0 ? p.radius : 12;
                const rects = [], leaves = [];
                const addRect = r => {
                    if (r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0) rects.push(r);
                };
                for (const r of map.walls || []) addRect(r);
                if (Array.isArray(map.buildingColliders)) for (const r of map.buildingColliders) addRect(r);
                else for (const b of map.buildings || []) {
                    if (b.isV2 && typeof b.getCollisionShapes === 'function') for (const r of b.getCollisionShapes()) addRect(r);
                    else addRect(b);
                }
                if (this.useNewCollisionSystem) for (const e of this._staticBillboardEntities || []) {
                    if (e.active && e.hasCollision && !e.markedForDestroy) addRect(e.getBoundingBox());
                }
                const rooms = this.roomSystem;
                if (rooms && rooms.active) for (const door of rooms.doors || []) {
                    // Sliding panels and arches do not push actors; hinged leaves do.
                    if (door.type !== 'hinged') continue;
                    const half = door.halfThick;
                    if (!Number.isFinite(half) || half < 0) continue;
                    for (const s of door.leaves()) if (s.length === 4 && s.every(Number.isFinite)) leaves.push({ s, r: radius + half });
                }
                const clear = (x, y) => {
                    for (const r of rects) {
                        const dx = x - Math.max(r.x, Math.min(r.x + r.w, x)), dy = y - Math.max(r.y, Math.min(r.y + r.h, y));
                        if (Math.hypot(dx, dy) < radius) return false;
                    }
                    for (const leaf of leaves) {
                        const [ax, ay, bx, by] = leaf.s, dx = bx - ax, dy = by - ay, n = dx * dx + dy * dy;
                        const t = n ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / n)) : 0;
                        if (Math.hypot(x - ax - dx * t, y - ay - dy * t) < leaf.r) return false;
                    }
                    return true;
                };
                // Keep the original map-clamped endpoint exactly when it is already safe.
                const tx = Math.max(margin, Math.min(map.width - margin, sx + ux * distance));
                const ty = Math.max(margin, Math.min(map.height - margin, sy + uy * distance));
                if ((tx - sx) * ux + (ty - sy) * uy >= minTravel && Math.hypot(tx - sx, ty - sy) >= minTravel && clear(tx, ty)) return { x: tx, y: ty };

                // A blocked endpoint searches only along the requested ray, inside the same map margin.
                let lo = minTravel, hi = distance;
                const trim = (s, u, a, b) => {
                    if (u === 0) return s >= a && s <= b;
                    let t0 = (a - s) / u, t1 = (b - s) / u;
                    if (t0 > t1) [t0, t1] = [t1, t0];
                    lo = Math.max(lo, t0); hi = Math.min(hi, t1); return lo <= hi;
                };
                if (!trim(sx, ux, margin, map.width - margin) || !trim(sy, uy, margin, map.height - margin)) return null;
                const intervals = [];
                const add = (a, b) => { a = Math.max(lo, a); b = Math.min(hi, b); if (a < b) intervals.push([a, b]); };
                const box = (x, y, dx, dy, left, top, right, bottom) => {
                    let a = lo, b = hi;
                    for (const [s, u, min, max] of [[x, dx, left, right], [y, dy, top, bottom]]) {
                        if (u === 0) { if (s <= min || s >= max) return; }
                        else {
                            let t0 = (min - s) / u, t1 = (max - s) / u;
                            if (t0 > t1) [t0, t1] = [t1, t0];
                            a = Math.max(a, t0); b = Math.min(b, t1); if (a >= b) return;
                        }
                    }
                    add(a, b);
                };
                const disc = (cx, cy, r) => {
                    const dx = sx - cx, dy = sy - cy, n = ux * ux + uy * uy;
                    const center = -(dx * ux + dy * uy) / n, cross = dx * uy - dy * ux;
                    const span2 = (r * r - cross * cross / n) / n;
                    if (span2 > 0) { const span = Math.sqrt(span2); add(center - span, center + span); }
                };
                const rayMinX = Math.min(sx + ux * lo, sx + ux * hi), rayMaxX = Math.max(sx + ux * lo, sx + ux * hi);
                const rayMinY = Math.min(sy + uy * lo, sy + uy * hi), rayMaxY = Math.max(sy + uy * lo, sy + uy * hi);
                for (const r of rects) {
                    const left = r.x, top = r.y, right = left + r.w, bottom = top + r.h;
                    if (right + radius < rayMinX || left - radius > rayMaxX || bottom + radius < rayMinY || top - radius > rayMaxY) continue;
                    // Rounded AABB: two strips and four corner discs, rather than an oversized square.
                    box(sx, sy, ux, uy, left - radius, top, right + radius, bottom);
                    box(sx, sy, ux, uy, left, top - radius, right, bottom + radius);
                    disc(left, top, radius); disc(right, top, radius); disc(left, bottom, radius); disc(right, bottom, radius);
                }
                for (const leaf of leaves) {
                    const [ax, ay, bx, by] = leaf.s, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
                    if (len) {
                        const vx = dx / len, vy = dy / len;
                        box((sx - ax) * vx + (sy - ay) * vy, -(sx - ax) * vy + (sy - ay) * vx,
                            ux * vx + uy * vy, -ux * vy + uy * vx, 0, -leaf.r, len, leaf.r);
                    }
                    disc(ax, ay, leaf.r); disc(bx, by, leaf.r);
                }
                intervals.sort((a, b) => a[0] - b[0]);
                const merged = [];
                for (const interval of intervals) {
                    const last = merged[merged.length - 1];
                    // Touching intervals retain their shared safe tangent point.
                    if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
                    else merged.push(interval);
                }
                const epsilon = Math.max(1e-7, Number.EPSILON * Math.max(1, Math.abs(sx), Math.abs(sy), map.width, map.height) * 64);
                let t = hi;
                const landing = () => {
                    const x = sx + ux * t, y = sy + uy * t;
                    return t >= lo && x >= margin && x <= map.width - margin && y >= margin && y <= map.height - margin && clear(x, y) ? { x, y } : null;
                };
                let result = landing();
                if (result) return result;
                t = hi - epsilon; result = landing(); if (result) return result;
                for (let i = merged.length - 1; i >= 0; i--) {
                    const [a, b] = merged[i];
                    if (t < a || t > b + epsilon) continue;
                    t = a; result = landing(); if (result) return result;
                    t = a - epsilon; result = landing(); if (result) return result;
                }
                return null;
            },

            triggerFlit(angleOverride, source) {
                if (this.isDriving || this.paused) return false;
                if (this.hud && !this.hud.has('flit')) return false;   // not introduced yet (ui/hud-reveal.js)
                
                const cost = this.flitCost();
                
                // Check attunement pool
                if (this.flitState.attunement < cost) return false;
                // --- Capture start state for VFX ---
                const startX = this.player.x;
                const startY = this.player.y;
                const startAngle = this.player.angle;
                
                let flitDist = this.player.buffSystem.getStat('flitDistance', 120);
                if (this.augments && this.augments.isEquipped('flit_ext')) flitDist *= 1.3; // 30% more range
                if (this.resonance) flitDist = this.resonance.stat('flitDistance', flitDist);   // Flit: Reach

                // Flit direction: use movement keys (WASD) or joystick if active, otherwise fall back to facing angle
                let flitAngle = this.player.angle;
                let moveX = 0, moveY = 0;
                if (this.keys['w'] || this.keys['ArrowUp']) moveY = -1;
                if (this.keys['s'] || this.keys['ArrowDown']) moveY = 1;
                if (this.keys['a'] || this.keys['ArrowLeft']) moveX = -1;
                if (this.keys['d'] || this.keys['ArrowRight']) moveX = 1;
                if (this.joystick && this.joystick.active) {
                    moveX = this.joystick.dx;
                    moveY = this.joystick.dy;
                }
                if (moveX !== 0 || moveY !== 0) {
                    flitAngle = Math.atan2(moveY, moveX);
                }
                if (typeof angleOverride === 'number') flitAngle = angleOverride;

                const landing = this.findFlitLanding(flitAngle, flitDist);
                if (!landing) {
                    // No clear landing that way (the map's edge, a solid run of wall): no charge spent, and she
                    // feels it — the ring shudders crimson with a soft knock (at most every 0.4 s)
                    if (!(this._flitBlockedAt > _gameTimeSec - 0.4)) {
                        this._flitBlockedAt = _gameTimeSec;
                        this._restartRingAnim('blocked');
                        audioSys.sfx('knock');
                    }
                    return false;
                }
                const targetX = landing.x, targetY = landing.y;

                this._restartRingAnim('flash');
                
                // Spend attunement
                this.flitState.attunement -= cost;
                this.flitState.active = true;
                this.flitState.duration = this.flitState.maxDuration;
                if (this.flitState.attunement < cost) this.flitBtn.classList.add('cooldown');
                
                this.flitState.lastFlitAt = _gameTimeSec;
                // Flit: Afterimage — gangers keep seeing you where you left
                const ai = this.resonance ? this.resonance.rank('afterimage') : 0;
                this._afterimage = ai ? { x: startX, y: startY, until: _gameTimeSec + 0.5 * ai } : null;

                this.player.x = targetX; this.player.y = targetY; resetHumanoidAnim(this.player); showMessage("FLIT!"); this.triggerShake(4);

                // --- Spawn Flit VFX ---
                const cosmeticConfig = this.cosmetics.getRenderConfig();
                let stance = 'idle';
                if (this.weaponMode === 'normal') stance = 'pistol';
                else if (this.weaponMode === 'sniper') stance = 'sniper';

                // Generate jagged lightning trail segments from A to B
                const dx = targetX - startX;
                const dy = targetY - startY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const segCount = Math.max(4, Math.floor(dist / 12));
                const perpX = -dy / dist;
                const perpY = dx / dist;
                
                // Main bolt + 2 branching sub-bolts
                const generateBolt = (jitterScale) => {
                    const points = [];
                    for (let i = 0; i <= segCount; i++) {
                        const t = i / segCount;
                        const baseX = startX + dx * t;
                        const baseY = startY + dy * t;
                        // Jagged offset perpendicular to travel direction, tapered at ends
                        const envelope = Math.sin(t * Math.PI); // 0 at ends, 1 in middle
                        const jitter = (Math.random() - 0.5) * dist * 0.15 * envelope * jitterScale;
                        points.push({ x: baseX + perpX * jitter, y: baseY + perpY * jitter });
                    }
                    return points;
                };

                const trails = [
                    { points: generateBolt(1.0), width: 3, alpha: 1.0 },   // Main bolt
                    { points: generateBolt(1.4), width: 1.5, alpha: 0.6 }, // Sub-bolt 1
                    { points: generateBolt(1.6), width: 1, alpha: 0.4 }    // Sub-bolt 2
                ];

                // The two spirits' looks, and a body each that lives as long as the effect: the renderer
                // keeps hair, cloth and pose state on the body it is handed, so a fresh one every frame
                // rebuilt all of that 60 times a second (garbage a mid-range phone pays for in GC pauses)
                const spiritOf = t => ({ ...tintLook({ ...cosmeticConfig.outfit, hair: cosmeticConfig.hair, hat: cosmeticConfig.hat, gender: APPEARANCES['949'].gender }, t),
                                         stance, isDriving: false });
                const stillBody = () => ({ walkPhase: 0, animState: 'idle', velocityX: 0, velocityY: 0, speed: 0 });

                this.flitVFX.push({
                    startX, startY, startAngle,
                    endX: targetX, endY: targetY,
                    // Ghost afterimage — fades over ~1.25 seconds (75 frames)
                    ghostAlpha: 1.0,
                    ghostDecay: 0.014,
                    // Lightning trails — crackle and vanish fast (~0.2s)
                    trailLife: 1.0,
                    trailDecay: 0.084,
                    trails,
                    // Re-jitter timer for electric crackle effect
                    reJitterTimer: 0,
                    reJitterInterval: 3, // re-randomize every 3 frames
                    // Arrival glow at destination (~0.5s / 30 frames)
                    arrivalGlow: 1.0,
                    arrivalDecay: 0.035,
                    // The spirits: her look, tinted, snapshotted now (tintLook copies every piece it recolours)
                    ghostLook: spiritOf({ skin: '#c8a0ff', hair: '#d8c0ff', top: '#b88aee', bottom: '#9a70d4', shoes: '#8060b8' }),
                    arrivalLook: spiritOf({ skin: '#e0d0ff', hair: '#f0e8ff', top: '#d4c0f8', bottom: '#c0aaee', shoes: '#b098e0' }),
                    ghostBody: stillBody(), arrivalBody: stillBody(),
                    stance,
                    dist
                });
                
                // Play flit sound — and a flit is heard close by
                audioSys.sfx('flit');
                this.emitNoise(targetX, targetY, CONFIG.NOISE.flit, 'flit');
                return true;
            },

            /* =========================================================
               FLIT VISUAL EFFECTS SYSTEM
               ---------------------------------------------------------
               Renders the three-part flit teleport VFX:
               1. Ghost afterimage at origin — full humanoid silhouette
                  tinted white-violet, slowly fading over ~2.5s
               2. Lightning trails — jagged electrical arcs from A→B,
                  re-jittered every few frames for crackle, ~0.6s
               3. Arrival glow — radial bloom at destination, ~0.5s
               ========================================================= */
            updateFlitVFX() {
                for (let i = this.flitVFX.length - 1; i >= 0; i--) {
                    const vfx = this.flitVFX[i];

                    // Decay ghost afterimage
                    if (vfx.ghostAlpha > 0) {
                        vfx.ghostAlpha -= vfx.ghostDecay;
                        if (vfx.ghostAlpha < 0) vfx.ghostAlpha = 0;
                    }

                    // Decay lightning trails
                    if (vfx.trailLife > 0) {
                        vfx.trailLife -= vfx.trailDecay;
                        if (vfx.trailLife < 0) vfx.trailLife = 0;

                        // Re-jitter lightning segments for electric crackle
                        vfx.reJitterTimer++;
                        if (vfx.reJitterTimer >= vfx.reJitterInterval) {
                            vfx.reJitterTimer = 0;
                            const dx = vfx.endX - vfx.startX;
                            const dy = vfx.endY - vfx.startY;
                            const dist = vfx.dist;
                            const perpX = -dy / dist;
                            const perpY = dx / dist;
                            for (const trail of vfx.trails) {
                                const segCount = trail.points.length - 1;
                                for (let j = 1; j < segCount; j++) {
                                    const t = j / segCount;
                                    const envelope = Math.sin(t * Math.PI);
                                    const jitter = (Math.random() - 0.5) * dist * 0.15 * envelope * (trail.width > 2 ? 1.0 : 1.5);
                                    trail.points[j].x = vfx.startX + dx * t + perpX * jitter;
                                    trail.points[j].y = vfx.startY + dy * t + perpY * jitter;
                                }
                            }
                        }
                    }

                    // Decay arrival glow
                    if (vfx.arrivalGlow > 0) {
                        vfx.arrivalGlow -= vfx.arrivalDecay;
                        if (vfx.arrivalGlow < 0) vfx.arrivalGlow = 0;
                    }

                    // Remove fully dead effects
                    if (vfx.ghostAlpha <= 0 && vfx.trailLife <= 0 && vfx.arrivalGlow <= 0) {
                        this.flitVFX.splice(i, 1);
                    }
                }
            },

            /** Restart the flit ring's CSS animation (`flash`, `blocked`) without forcing a layout mid-frame:
             *  drop the class now and add it back on the next frame. */
            _restartRingAnim(cls) {
                const r = this.flitRingEl; if (!r) return;
                r.classList.remove(cls);
                requestAnimationFrame(() => r.classList.add(cls));
            },

            /* Drawn without shadowBlur: every blurred stroke or dot is its own blur pass, a dozen
               or more a frame here, which a phone's canvas feels as a hitch the moment she flits.
               The halos are wide, faint strokes and cached glow sprites (drawGlow) instead. */
            drawFlitVFX(ctx) {
                for (const vfx of this.flitVFX) {
                    ctx.save();

                    // === 1. LIGHTNING TRAILS (A → B) ===
                    if (vfx.trailLife > 0) {
                        const tAlpha = vfx.trailLife;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';

                        for (const trail of vfx.trails) {
                            const pts = trail.points;
                            if (pts.length < 2) continue;
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
                            const a = tAlpha * trail.alpha;

                            // Violet halo: a wide faint stroke under a narrower one (stands in for the blur)
                            ctx.strokeStyle = '#a469ff';
                            ctx.globalAlpha = a * 0.18;
                            ctx.lineWidth = trail.width + 16;
                            ctx.stroke();
                            ctx.globalAlpha = a * 0.4;
                            ctx.lineWidth = trail.width + 6;
                            ctx.stroke();
                            // Core bolt (white-violet) with a thin pale rim
                            ctx.strokeStyle = '#e6d2ff';
                            ctx.globalAlpha = a * 0.35;
                            ctx.lineWidth = trail.width + 2.5;
                            ctx.stroke();
                            ctx.globalAlpha = a * tAlpha;
                            ctx.lineWidth = trail.width;
                            ctx.stroke();
                        }

                        // Bright flash nodes at random points along the bolt
                        const mainPts = vfx.trails[0].points;
                        for (let j = 0; j < mainPts.length; j += 2) {
                            const nodeSize = 2 + Math.random() * 3, p = mainPts[j];
                            ctx.globalAlpha = tAlpha * 0.5;
                            drawGlow(ctx, p.x, p.y, nodeSize + 10, '200, 160, 255', 0.3);
                            ctx.globalAlpha = tAlpha * 0.7;
                            ctx.fillStyle = '#fff';
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, nodeSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                    }

                    // === 2. GHOST AFTERIMAGE at start point ===
                    if (vfx.ghostAlpha > 0) {
                        const ghostLook = vfx.ghostLook;
                        const originVisible = decorativeBodyInView(vfx.startX, vfx.startY, ghostLook, 1.04, 40);
                        if (originVisible) {
                            ctx.save();
                            ctx.translate(vfx.startX, vfx.startY);
                            ctx.rotate(vfx.startAngle);

                            // Pulsing violet-white glow behind the ghost
                            const glowPulse = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
                            const glowRadius = 25 + vfx.ghostAlpha * 15;
                            ctx.globalAlpha = vfx.ghostAlpha * 0.4 * glowPulse * 0.8;
                            drawGlow(ctx, 0, 0, glowRadius, '186, 140, 255', 0.5);

                            // Draw the player silhouette with violet-white tint
                            ctx.globalAlpha = vfx.ghostAlpha * 0.75;
                            // Vertical flicker/distortion — slight scale wobble
                            const flicker = 1.0 + (Math.random() - 0.5) * 0.04 * vfx.ghostAlpha;
                            ctx.scale(flicker, 1.0 + (1.0 - flicker) * 0.5);

                            drawProceduralHumanoid(ctx, vfx.ghostBody, ghostLook);

                            ctx.restore();
                        } else {
                            Math.random(); // original ghost flicker, before body pose/blink/glass seeds
                            tickHiddenDecorativeBody(vfx.ghostBody, ghostLook);
                        }
                    }

                    // === 3. ARRIVAL GLOW + AFTERIMAGE at destination ===
                    if (vfx.arrivalGlow > 0) {
                        const ag = vfx.arrivalGlow, arrivalLook = vfx.arrivalLook;
                        if (decorativeBodyInView(vfx.endX, vfx.endY, arrivalLook, 1.08, 55)) {
                            ctx.save();
                            ctx.translate(vfx.endX, vfx.endY);

                            // Radial bloom: a violet glow with a white heart
                            const expandRadius = 30 + (1.0 - ag) * 25;
                            ctx.globalAlpha = ag * 0.6;
                            drawGlow(ctx, 0, 0, expandRadius * 1.15, '180, 130, 255', 0.45);
                            ctx.globalAlpha = ag * 0.7;
                            drawGlow(ctx, 0, 0, expandRadius * 0.45, '255, 255, 255', 0.4);

                            // Arrival afterimage — bright white-violet silhouette that
                            // rapidly fades as the real player "solidifies" in place
                            ctx.rotate(vfx.startAngle);
                            ctx.globalAlpha = ag * 0.6;
                            // Slight vertical stretch that settles — materializing effect
                            const settle = 1.0 + ag * 0.08;
                            ctx.scale(1.0, settle);

                            drawProceduralHumanoid(ctx, vfx.arrivalBody, arrivalLook);
                            ctx.restore();
                        } else {
                            tickHiddenDecorativeBody(vfx.arrivalBody, arrivalLook);
                        }
                    }

                    ctx.restore();
                }
            },

            /* =========================================================
               GRAVEYARD GHOST RENDERING
               ---------------------------------------------------------
               Draws procedural humanoid ghosts in the cemetery.
               Each ghost fades in, wanders between gravestones, then
               fades out. Rendered with blue-white tint and radial glow.
               ========================================================= */
            drawGraveyardGhosts(ctx) {
                for (const g of this.graveyardGhosts) {
                    if (g.life <= 0) continue;
                    const look = { ...g.look, stance: 'idle' };
                    // Include the maximum flicker stretch and life-scaled halo. Ghosts
                    // keep wandering/fading in update.js while their hidden paint pauses.
                    if (g.life <= 1 && !decorativeBodyInView(g.x, g.y, look, 1.02, 28 + g.life * 12)) {
                        tickHiddenDecorativeBody(g, look);
                        continue;
                    }
                    ctx.save();
                    ctx.translate(g.x, g.y);

                    // Radial blue-white glow behind the ghost
                    const glowPulse = 0.6 + Math.sin(Date.now() * 0.003 + g.x) * 0.3;
                    const glowRadius = 28 + g.life * 12;
                    ctx.save();
                    ctx.globalAlpha = g.life * 0.35 * glowPulse;
                    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
                    glow.addColorStop(0, 'rgba(180, 220, 255, 0.7)');
                    glow.addColorStop(0.5, 'rgba(120, 180, 230, 0.25)');
                    glow.addColorStop(1, 'rgba(100, 160, 220, 0)');
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Draw the humanoid figure
                    ctx.save();
                    ctx.rotate(g.angle);
                    ctx.globalAlpha = g.life;
                    // Subtle vertical flicker
                    const flicker = 1.0 + (Math.sin(Date.now() * 0.01 + g.y * 0.1) * 0.02) * g.life;
                    ctx.scale(flicker, 1.0);

                    // Pass the ghost itself so the shared gait controller can track it
                    // (the old throwaway object used velocityX/Y, which the renderer never read)
                    drawProceduralHumanoid(ctx, g, look);

                    ctx.restore();
                    ctx.restore();
                }
            },

        });

