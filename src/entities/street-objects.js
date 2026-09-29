        /* --- ENTITIES --- */
        // =====================================================================
        //  PROJECTILE CLASS - REMOVED (Now uses ProjectileEntity)
        // =====================================================================
                
        class NeonSign {
            constructor(x, y, text, color, fontSize = 20, fontFamily = 'Orbitron') {
                this.x = x; 
                this.y = y; 
                this.text = text; 
                this.color = color;
                this.fontSize = fontSize;
                this.fontFamily = fontFamily; // New property
                this.flickerOffset = Math.random() * 1000;
            }
            
            draw(ctx, frameTime) {
                // PERFORMANCE: Use passed frameTime or fall back to Date.now()
                const time = (_frameTime) + this.flickerOffset;
                const flicker = (Math.sin(time / 50) > 0.95 || Math.random() < 0.02) ? 0.3 : 1.0;
                
                ctx.save();
                ctx.font = `bold ${this.fontSize}px "${this.fontFamily}"`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                
                // Glowy Text
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 15 * flicker;
                ctx.fillStyle = this.color;
                ctx.globalAlpha = 0.9 * flicker;
                ctx.fillText(this.text, this.x, this.y);
                
                // Subtle white core
                ctx.shadowBlur = 0;
                ctx.fillStyle = "#ffffff";
                ctx.globalAlpha = 0.7 * flicker;
                ctx.fillText(this.text, this.x, this.y);
                
                ctx.restore();
            }
        }

        // =====================================================================
        //  PROP CLASS - MIGRATED TO PropEntity
        // =====================================================================
        
        class Loot {
            constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.bobOffset = Math.random() * Math.PI * 2; }
            draw(ctx) {
                const bobY = Math.sin(_gameTimeSec * 6 + this.bobOffset) * 2;  // game time: same speed at any frame rate
                ctx.save(); ctx.translate(this.x, this.y + bobY);
                if (this.type === 'scrap') { ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.fill(); ctx.strokeStyle = '#555'; ctx.stroke(); } 
                else if (this.type === 'pp') { ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill(); } 
                else if (this.type === 'dark_element') {
                    // A shard of Dark Element: black rock veined with neon purple light
                    const pulse = 0.6 + 0.4 * Math.sin(_gameTimeSec * 4 + this.bobOffset);
                    ctx.shadowColor = '#a855ff'; ctx.shadowBlur = 10 * pulse;
                    ctx.fillStyle = '#0b0612'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, -1); ctx.lineTo(2, 7); ctx.lineTo(-4, 4); ctx.lineTo(-5, -3); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = `rgba(190, 120, 255, ${0.6 + 0.4 * pulse})`; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(1, 1); ctx.lineTo(0, 5); ctx.moveTo(1, 1); ctx.lineTo(3, -3); ctx.stroke();
                    ctx.shadowBlur = 0;
                }
                else if (this.type === 'stim') { ctx.fillStyle = '#0f0'; ctx.shadowColor = '#0f0'; ctx.shadowBlur = 5; ctx.fillRect(-4, -4, 8, 8); ctx.fillStyle = '#fff'; ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(-3, -1, 6, 2); }
                else if (this.type === 'salvage_crate') {
                    // Large golden crate — salvage mission objective
                    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
                    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-10, -10, 20, 20);
                    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20);
                    // Cross straps
                    ctx.strokeStyle = '#B8860B'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, 10); ctx.moveTo(10, -10); ctx.lineTo(-10, 10); ctx.stroke();
                    // SCRAP label glow
                    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.fillText('SCRAP', 0, 3);
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
            }
        }

        // Pavement class - walkable areas lining streets
        class Pavement {
            constructor(x, y, w, h) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
            }
        
            draw(ctx) {
                // Concrete base
                ctx.fillStyle = '#2a2a30';
                ctx.fillRect(this.x, this.y, this.w, this.h);
                
                // Edge lines
                ctx.strokeStyle = '#1a1a20';
                ctx.lineWidth = 1;
                ctx.strokeRect(this.x, this.y, this.w, this.h);
                
                // Tiles pattern
                ctx.strokeStyle = '#222228';
                ctx.lineWidth = 1;
                const tileSize = 50;
                
                ctx.beginPath();
                for (let tx = this.x; tx < this.x + this.w; tx += tileSize) {
                    ctx.moveTo(tx, this.y); ctx.lineTo(tx, this.y + this.h);
                }
                for (let ty = this.y; ty < this.y + this.h; ty += tileSize) {
                    ctx.moveTo(this.x, ty); ctx.lineTo(this.x + this.w, ty);
                }
                ctx.stroke();
            }
        }

        /**
         * =====================================================================
         *  FOLIAGE CLASS - Trees and Bushes with Wind Animation
         * =====================================================================
         * Decorative vegetation that sways in the wind.
         * 
         * Types:
         * - 'tree': Tall tree with trunk and leafy canopy
         * - 'bush': Low shrub with multiple leaf clusters
         * - 'palm': Palm tree with fronds (for variety)
         * 
         * Wind animation uses sine waves with per-instance phase offset
         * for natural, non-synchronized movement.
         */
        class Foliage {
            constructor(x, y, type = 'tree', size = 1.0) {
                this.x = x;
                this.y = y;
                this.type = type;
                this.size = size;
                
                // Random phase offset so all plants don't sway in sync
                this.phaseOffset = Math.random() * Math.PI * 2;
                
                // Slight variation in sway amount per plant
                this.swayMultiplier = 0.8 + Math.random() * 0.4;
                
                // Check if this is a glowing variant
                this.isGlowing = type.startsWith('glow_');
                this.glowColor = null;
                
                // Color variations for natural look
                if (this.isGlowing) {
                    this._setupGlowColors();
                } else {
                    this.leafColor = this._randomLeafColor();
                }
                this.trunkColor = this._randomTrunkColor();
            }
            
            _setupGlowColors() {
                // Glowing tree color palettes
                const glowPalettes = {
                    'glow_purple': { 
                        leaf: ['#8a2be2', '#9932cc', '#a855f7', '#7c3aed'], 
                        glow: '#a855f7',
                        highlight: 'rgba(168, 85, 247, 0.4)'
                    },
                    'glow_pink': { 
                        leaf: ['#ff1493', '#ff69b4', '#ec4899', '#f472b6'], 
                        glow: '#ff69b4',
                        highlight: 'rgba(255, 105, 180, 0.4)'
                    },
                    'glow_gold': { 
                        leaf: ['#ffd700', '#ffb300', '#f59e0b', '#fbbf24'], 
                        glow: '#ffd700',
                        highlight: 'rgba(255, 215, 0, 0.4)'
                    },
                    'glow_green': { 
                        leaf: ['#00ff7f', '#32cd32', '#22c55e', '#4ade80'], 
                        glow: '#00ff7f',
                        highlight: 'rgba(0, 255, 127, 0.4)'
                    },
                    'glow_cyan': { 
                        leaf: ['#00f3ff', '#00bcd4', '#22d3ee', '#06b6d4'], 
                        glow: '#00f3ff',
                        highlight: 'rgba(0, 243, 255, 0.4)'
                    },
                    'glow_red': { 
                        leaf: ['#ff3333', '#ef4444', '#f87171', '#dc2626'], 
                        glow: '#ff4444',
                        highlight: 'rgba(255, 68, 68, 0.4)'
                    }
                };
                
                const palette = glowPalettes[this.type] || glowPalettes['glow_purple'];
                this.leafColor = palette.leaf[Math.floor(Math.random() * palette.leaf.length)];
                this.glowColor = palette.glow;
                this.glowHighlight = palette.highlight;
            }
            
            _randomLeafColor() {
                const colors = ['#1a4d1a', '#2d5a2d', '#1f4f2f', '#2a5c3a', '#1e3d1e', '#3a6b3a'];
                return colors[Math.floor(Math.random() * colors.length)];
            }
            
            _randomTrunkColor() {
                const colors = ['#3d2817', '#4a3520', '#352010', '#2e1f12'];
                return colors[Math.floor(Math.random() * colors.length)];
            }
            
            draw(ctx, wind = 0.5, windDirection = 1, frameTimeSec = null) {
                // PERFORMANCE: Use passed frameTimeSec or fall back to Date.now()
                const time = frameTimeSec || _frameTimeSec;
                // Calculate sway based on wind strength and time
                const sway = Math.sin(time * 2 + this.phaseOffset) * wind * 8 * this.swayMultiplier * windDirection;
                const sway2 = Math.sin(time * 2.5 + this.phaseOffset + 1) * wind * 5 * this.swayMultiplier * windDirection;
                
                ctx.save();
                ctx.translate(this.x, this.y);
                
                // Determine base type for glowing variants
                let baseType = this.type;
                if (this.isGlowing) {
                    baseType = 'tree'; // Glowing variants use tree shape by default
                }
                
                if (baseType === 'tree' || this.isGlowing) {
                    this._drawTree(ctx, sway, sway2, time);
                } else if (baseType === 'bush') {
                    this._drawBush(ctx, sway, sway2, time);
                } else if (baseType === 'palm') {
                    this._drawPalm(ctx, sway, sway2, time);
                }
                
                ctx.restore();
            }
            
            _drawTree(ctx, sway, sway2, time) {
                const s = this.size;
                
                // Shadow under canopy (no trunk - top-down view)
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath();
                ctx.ellipse(sway * 0.5, 5 * s, 18 * s, 8 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Glow effect for glowing trees only (shadowBlur is expensive)
                if (this.isGlowing) {
                    const glowPulse = 0.7 + Math.sin(time * 2 + this.phaseOffset) * 0.3;
                    ctx.shadowColor = this.glowColor;
                    ctx.shadowBlur = 25 * glowPulse;
                    
                    // Glow halo
                    ctx.fillStyle = this.glowHighlight;
                    ctx.beginPath();
                    ctx.ellipse(sway, -25 * s, 28 * s, 26 * s, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Main canopy (top-down view, circular with sway offset)
                ctx.fillStyle = this.leafColor;
                ctx.beginPath();
                ctx.ellipse(sway, -25 * s, 20 * s, 18 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Lighter highlight
                ctx.fillStyle = this.isGlowing ? 'rgba(255, 255, 255, 0.25)' : 'rgba(100, 180, 100, 0.3)';
                ctx.beginPath();
                ctx.ellipse(sway - 5 * s, -28 * s, 8 * s, 6 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Leaf detail clusters (smaller circles at edges)
                ctx.fillStyle = this.isGlowing ? this._lighten(this.leafColor, 30) : this._darken(this.leafColor, 20);
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2 + time * 0.2;
                    const dist = 12 * s;
                    const lx = sway + Math.cos(angle) * dist;
                    const ly = -25 * s + Math.sin(angle) * dist * 0.8;
                    ctx.beginPath();
                    ctx.arc(lx + sway2 * 0.5, ly, 6 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Inner glow core for glowing trees
                if (this.isGlowing) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.beginPath();
                    ctx.ellipse(sway, -25 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0; // Reset only if we used it
                }
            }
            
            _drawBush(ctx, sway, sway2, time) {
                const s = this.size;
                
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.ellipse(sway * 0.3, 3 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Multiple leaf clusters
                const clusters = [
                    { ox: 0, oy: 0, r: 10 },
                    { ox: -8, oy: -2, r: 7 },
                    { ox: 8, oy: -2, r: 7 },
                    { ox: -4, oy: -6, r: 6 },
                    { ox: 4, oy: -6, r: 6 }
                ];
                
                clusters.forEach((c, i) => {
                    const clusterSway = sway * (0.5 + i * 0.1);
                    ctx.fillStyle = i % 2 === 0 ? this.leafColor : this._darken(this.leafColor, 15);
                    ctx.beginPath();
                    ctx.ellipse(c.ox * s + clusterSway, c.oy * s, c.r * s, c.r * s * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();
                });
                
                // Highlight
                ctx.fillStyle = 'rgba(100, 180, 100, 0.25)';
                ctx.beginPath();
                ctx.ellipse(sway - 3 * s, -4 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            
            _drawPalm(ctx, sway, sway2, time) {
                const s = this.size;
                
                // Shadow (no trunk - top-down view)
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.ellipse(sway * 0.5, 5 * s, 15 * s, 6 * s, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Fronds (radiating from center)
                ctx.fillStyle = this.leafColor;
                const frondCount = 7;
                for (let i = 0; i < frondCount; i++) {
                    const baseAngle = (i / frondCount) * Math.PI * 2;
                    const frondSway = sway * (1 + Math.sin(baseAngle) * 0.5);
                    
                    ctx.save();
                    ctx.translate(sway * 0.2, -30 * s);
                    ctx.rotate(baseAngle);
                    
                    // Frond shape (elongated leaf)
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(8 * s + frondSway, -5 * s, 20 * s + frondSway * 2, -2 * s);
                    ctx.quadraticCurveTo(8 * s + frondSway, 5 * s, 0, 0);
                    ctx.fill();
                    
                    ctx.restore();
                }
                
                // Center crown
                ctx.fillStyle = this._darken(this.leafColor, -20);
                ctx.beginPath();
                ctx.arc(sway * 0.2, -30 * s, 5 * s, 0, Math.PI * 2);
                ctx.fill();
            }
            
            _darken(color, amount) { return darkenHex(color, amount); }
            _lighten(color, amount) { return lightenHex(color, amount); }
        }

