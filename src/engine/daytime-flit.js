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
        
                // Brightness: 100% -> 130%
                const brightness = 100 + (intensity * 60);
                
                // Contrast: 100% -> 80%
                const contrast = 100 - (intensity * 20);
        
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

            /** Flit. `angleOverride` (radians) comes from the move stick's ring or a flick; otherwise
             *  the way she's moving (keys, stick) or facing. Returns true if she flitted. */
            triggerFlit(angleOverride, source) {
                if (this.isDriving || this.paused) return false;
                
                const cost = this.flitCost();
                
                // Check attunement pool
                if (this.flitState.attunement < cost) return false;
                if (this.flitRingEl) { const r = this.flitRingEl; r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }
                
                // Spend attunement
                this.flitState.attunement -= cost;
                this.flitState.active = true; 
                this.flitState.duration = this.flitState.maxDuration;
                if (this.flitState.attunement < cost) this.flitBtn.classList.add('cooldown');
                
                // --- Capture start state for VFX ---
                const startX = this.player.x;
                const startY = this.player.y;
                const startAngle = this.player.angle;
                
                let flitDist = this.player.buffSystem.getStat('flitDistance', 120);
                if (this.augments && this.augments.isEquipped('flit_ext')) flitDist *= 1.3; // 30% more range
                if (this.resonance) flitDist = this.resonance.stat('flitDistance', flitDist);   // Flit: Reach
                this.flitState.lastFlitAt = _gameTimeSec;
                // Flit: Afterimage — gangers keep seeing you where you left
                const ai = this.resonance ? this.resonance.rank('afterimage') : 0;
                this._afterimage = ai ? { x: this.player.x, y: this.player.y, until: _gameTimeSec + 0.5 * ai } : null;

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

                let targetX = this.player.x + Math.cos(flitAngle) * flitDist; let targetY = this.player.y + Math.sin(flitAngle) * flitDist;
                let hitWall = false; for(let w of this.activeMap.walls) { if (targetX > w.x && targetX < w.x + w.w && targetY > w.y && targetY < w.y + w.h) { hitWall = true; break; } }
                if (hitWall) { targetX = this.player.x + Math.cos(flitAngle) * 20; targetY = this.player.y + Math.sin(flitAngle) * 20; }
                
                // Clamp target within map bounds
                const margin = 20;
                targetX = Math.max(margin, Math.min(this.activeMap.width - margin, targetX));
                targetY = Math.max(margin, Math.min(this.activeMap.height - margin, targetY));
                
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
                    // Snapshot of player appearance
                    cosmeticConfig: JSON.parse(JSON.stringify(cosmeticConfig)),
                    stance,
                    outfit: { ...cosmeticConfig.outfit },
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

            drawFlitVFX(ctx) {
                for (const vfx of this.flitVFX) {
                    ctx.save();

                    // === 1. LIGHTNING TRAILS (A → B) ===
                    if (vfx.trailLife > 0) {
                        const tAlpha = vfx.trailLife;

                        for (const trail of vfx.trails) {
                            const pts = trail.points;
                            if (pts.length < 2) continue;

                            // Outer glow layer (violet)
                            ctx.save();
                            ctx.globalAlpha = tAlpha * trail.alpha * 0.5;
                            ctx.strokeStyle = 'rgba(164, 105, 255, 1)';
                            ctx.lineWidth = trail.width + 6;
                            ctx.shadowColor = '#a469ff';
                            ctx.shadowBlur = 20;
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            for (let j = 1; j < pts.length; j++) {
                                ctx.lineTo(pts[j].x, pts[j].y);
                            }
                            ctx.stroke();
                            ctx.restore();

                            // Core bolt (white-violet)
                            ctx.save();
                            ctx.globalAlpha = tAlpha * trail.alpha;
                            ctx.strokeStyle = `rgba(230, 210, 255, ${tAlpha})`;
                            ctx.lineWidth = trail.width;
                            ctx.shadowColor = '#fff';
                            ctx.shadowBlur = 8;
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            for (let j = 1; j < pts.length; j++) {
                                ctx.lineTo(pts[j].x, pts[j].y);
                            }
                            ctx.stroke();
                            ctx.restore();
                        }

                        // Bright flash nodes at random points along the bolt
                        ctx.save();
                        const mainPts = vfx.trails[0].points;
                        ctx.globalAlpha = tAlpha * 0.7;
                        for (let j = 0; j < mainPts.length; j += 2) {
                            const nodeSize = 2 + Math.random() * 3;
                            ctx.fillStyle = '#fff';
                            ctx.shadowColor = '#c8a0ff';
                            ctx.shadowBlur = 12;
                            ctx.beginPath();
                            ctx.arc(mainPts[j].x, mainPts[j].y, nodeSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.restore();
                    }

                    // === 2. GHOST AFTERIMAGE at start point ===
                    if (vfx.ghostAlpha > 0) {
                        ctx.save();
                        ctx.translate(vfx.startX, vfx.startY);
                        ctx.rotate(vfx.startAngle);

                        // Pulsing violet-white glow behind the ghost
                        const glowPulse = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
                        const glowRadius = 25 + vfx.ghostAlpha * 15;
                        ctx.save();
                        ctx.globalAlpha = vfx.ghostAlpha * 0.4 * glowPulse;
                        const ghostGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
                        ghostGlow.addColorStop(0, 'rgba(200, 170, 255, 0.8)');
                        ghostGlow.addColorStop(0.5, 'rgba(164, 105, 255, 0.3)');
                        ghostGlow.addColorStop(1, 'rgba(164, 105, 255, 0)');
                        ctx.fillStyle = ghostGlow;
                        ctx.beginPath();
                        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        // Draw the player silhouette with violet-white tint
                        ctx.globalAlpha = vfx.ghostAlpha * 0.75;
                        // Vertical flicker/distortion — slight scale wobble
                        const flicker = 1.0 + (Math.random() - 0.5) * 0.04 * vfx.ghostAlpha;
                        ctx.scale(flicker, 1.0 + (1.0 - flicker) * 0.5);

                        drawProceduralHumanoid(ctx, {
                            walkPhase: 0, animState: 'idle',
                            velocityX: 0, velocityY: 0, speed: 0
                        }, {
                            // Her own cut, in violet light
                            ...tintLook({ ...vfx.cosmeticConfig.outfit, hair: vfx.cosmeticConfig.hair, hat: vfx.cosmeticConfig.hat, gender: APPEARANCES['949'].gender },
                                { skin: '#c8a0ff', hair: '#d8c0ff', top: '#b88aee', bottom: '#9a70d4', shoes: '#8060b8' }),
                            stance: vfx.stance,
                            isDriving: false
                        });

                        ctx.restore();
                    }

                    // === 3. ARRIVAL GLOW + AFTERIMAGE at destination ===
                    if (vfx.arrivalGlow > 0) {
                        const ag = vfx.arrivalGlow;

                        // Radial bloom
                        ctx.save();
                        const expandRadius = 30 + (1.0 - ag) * 25;
                        ctx.globalAlpha = ag * 0.6;
                        ctx.translate(vfx.endX, vfx.endY);
                        const arrGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, expandRadius);
                        arrGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                        arrGrad.addColorStop(0.3, 'rgba(200, 170, 255, 0.6)');
                        arrGrad.addColorStop(0.7, 'rgba(164, 105, 255, 0.2)');
                        arrGrad.addColorStop(1, 'rgba(164, 105, 255, 0)');
                        ctx.fillStyle = arrGrad;
                        ctx.shadowColor = '#c8a0ff';
                        ctx.shadowBlur = 20 * ag;
                        ctx.beginPath();
                        ctx.arc(0, 0, expandRadius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();

                        // Arrival afterimage — bright white-violet silhouette that
                        // rapidly fades as the real player "solidifies" in place
                        ctx.save();
                        ctx.translate(vfx.endX, vfx.endY);
                        ctx.rotate(vfx.startAngle);
                        ctx.globalAlpha = ag * 0.6;
                        // Slight vertical stretch that settles — materializing effect
                        const settle = 1.0 + ag * 0.08;
                        ctx.scale(1.0, settle);

                        drawProceduralHumanoid(ctx, {
                            walkPhase: 0, animState: 'idle',
                            velocityX: 0, velocityY: 0, speed: 0
                        }, {
                            // Her own cut, in violet light
                            ...tintLook({ ...vfx.cosmeticConfig.outfit, hair: vfx.cosmeticConfig.hair, hat: vfx.cosmeticConfig.hat, gender: APPEARANCES['949'].gender },
                                { skin: '#e0d0ff', hair: '#f0e8ff', top: '#d4c0f8', bottom: '#c0aaee', shoes: '#b098e0' }),
                            stance: vfx.stance,
                            isDriving: false
                        });
                        ctx.restore();
                    }

                    // === 4. ORIGIN BURST — small particles at start ===
                    // (Handled by existing ghost particle + the glow above)

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
                    drawProceduralHumanoid(ctx, g, { ...g.look, stance: 'idle' });

                    ctx.restore();
                    ctx.restore();
                }
            },

        });

