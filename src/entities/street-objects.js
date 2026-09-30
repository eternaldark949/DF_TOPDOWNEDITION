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
        /* FLORA — each kind of plant painted once into a sprite (a lit canopy, inner shade,
           leaf grain, blossom), then drawn with a sway offset. The old glow_* kinds are the
           city's dream trees now: blossom in pink and violet, jade, moon-silver, amber, crimson. */
        const FLORA_KINDS = {
            tree:        { base: '#153524', mid: '#245a38', hi: '#5d9a68', dark: '#0c2016' },
            glow_pink:   { base: '#4a1f3e', mid: '#9a4a78', hi: '#f4b0d4', dark: '#2a0f22', petals: ['#ffd3ea', '#ff9fcf', '#fff4fa'] },
            glow_purple: { base: '#2f2052', mid: '#6448a8', hi: '#c9aeff', dark: '#1a1030', petals: ['#e6d8ff', '#b894ff', '#fff'] },
            glow_gold:   { base: '#3e2a14', mid: '#8e6228', hi: '#f0c878', dark: '#22160a', petals: ['#ffe6b0', '#fff2d0'] },
            glow_green:  { base: '#11302a', mid: '#2a6a56', hi: '#8ee0c2', dark: '#081c18', petals: ['#d8fff0'] },
            glow_cyan:   { base: '#1c2840', mid: '#465f92', hi: '#bcd2ff', dark: '#0e1426', petals: ['#eaf2ff', '#cfe0ff'] },
            glow_red:    { base: '#3e1018', mid: '#98243a', hi: '#ff8a9e', dark: '#22060c', petals: ['#ffd0d8'] },
            bush:        { base: '#16341f', mid: '#285c34', hi: '#5c9660', dark: '#0c2014' },
            palm:        { base: '#1b3d22', mid: '#2f6636', hi: '#7cb46a', dark: '#10261a' }
        };
        const _floraCache = new Map();
        /** The sprite for a kind/size (sizes bucketed to 0.2), in 4 variants. */
        function floraSprite(type, size, variant) {
            const sz = Math.round(size * 5) / 5, key = type + '|' + sz + '|' + variant;
            let spr = _floraCache.get(key);
            if (spr) return spr;
            const K = FLORA_KINDS[type] || FLORA_KINDS.tree, rnd = seededRandom(variant * 977 + Math.round(sz * 100) + type.length * 31);
            const palm = type === 'palm', bush = type === 'bush';
            const R = (palm ? 24 : bush ? 13 : 21) * sz, W = Math.ceil(R * 2.6 + 6), cv = document.createElement('canvas'); cv.width = cv.height = W;
            const c = cv.getContext('2d'), o = W / 2;
            if (palm) {
                const n = 8 + (variant % 2);
                for (let i = 0; i < n; i++) {
                    const a = i / n * Math.PI * 2 + rnd() * 0.3, len = R * (0.85 + rnd() * 0.3);
                    c.save(); c.translate(o, o); c.rotate(a);
                    c.fillStyle = i % 2 ? K.mid : K.base;
                    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.45, -len * 0.22, len, 0); c.quadraticCurveTo(len * 0.45, len * 0.22, 0, 0); c.fill();
                    c.strokeStyle = K.hi; c.globalAlpha = 0.5; c.lineWidth = 0.8; c.beginPath(); c.moveTo(2, 0); c.lineTo(len * 0.95, 0); c.stroke(); c.globalAlpha = 1;
                    c.strokeStyle = K.dark; c.lineWidth = 0.6; c.beginPath();
                    for (let t = 0.2; t < 0.9; t += 0.12) { c.moveTo(len * t, 0); c.lineTo(len * (t + 0.06), len * 0.12 * (1 - t)); c.moveTo(len * t, 0); c.lineTo(len * (t + 0.06), -len * 0.12 * (1 - t)); }
                    c.stroke(); c.restore();
                }
                c.fillStyle = '#4a3420'; c.beginPath(); c.arc(o, o, R * 0.16, 0, Math.PI * 2); c.fill();
            } else {
                // Canopy: overlapping clusters, dark underneath; light from the upper left, shade to the lower right
                const lumps = bush ? 5 : 8;
                c.fillStyle = K.dark; c.beginPath(); c.arc(o + 1, o + 1, R * 1.02, 0, Math.PI * 2); c.fill();
                for (let i = 0; i < lumps; i++) {
                    const a = i / lumps * Math.PI * 2 + rnd() * 0.5, d = R * (0.45 + rnd() * 0.15), r = R * (0.48 + rnd() * 0.12);
                    c.fillStyle = K.base; c.beginPath(); c.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, r, 0, Math.PI * 2); c.fill();
                }
                c.fillStyle = K.base; c.beginPath(); c.arc(o, o, R * 0.62, 0, Math.PI * 2); c.fill();
                for (let i = 0; i < lumps; i++) {
                    const a = i / lumps * Math.PI * 2 + 0.4, d = R * 0.38, r = R * 0.36;
                    const g = c.createRadialGradient(o + Math.cos(a) * d - r * 0.35, o + Math.sin(a) * d - r * 0.35, 1, o + Math.cos(a) * d, o + Math.sin(a) * d, r);
                    g.addColorStop(0, K.mid); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(o + Math.cos(a) * d, o + Math.sin(a) * d, r, 0, Math.PI * 2); c.fill();
                }
                const lit = c.createRadialGradient(o - R * 0.4, o - R * 0.45, 1, o - R * 0.2, o - R * 0.2, R * 0.9);
                lit.addColorStop(0, K.hi); lit.addColorStop(1, 'rgba(0,0,0,0)');
                c.globalAlpha = 0.55; c.fillStyle = lit; c.beginPath(); c.arc(o, o, R, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
                const shade = c.createRadialGradient(o + R * 0.5, o + R * 0.55, 1, o + R * 0.4, o + R * 0.45, R * 0.9);
                shade.addColorStop(0, 'rgba(0,0,0,0.35)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = shade; c.beginPath(); c.arc(o, o, R, 0, Math.PI * 2); c.fill();
                for (let i = 0; i < R * 4; i++) {                                                     // leaf grain
                    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.95;
                    c.fillStyle = rnd() < 0.5 ? K.hi : K.dark; c.globalAlpha = 0.35; c.fillRect(o + Math.cos(a) * d, o + Math.sin(a) * d, 1.4, 1.4);
                }
                c.globalAlpha = 1;
                if (K.petals) for (let i = 0; i < R * 2; i++) {                                         // blossom, heavier toward the light
                    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.92, x = o + Math.cos(a) * d, y = o + Math.sin(a) * d;
                    if (x + y > o * 2 + R * 0.5 && rnd() < 0.6) continue;
                    c.globalAlpha = 0.55 + rnd() * 0.4; c.fillStyle = K.petals[Math.floor(rnd() * K.petals.length)];
                    c.beginPath(); c.arc(x, y, 0.7 + rnd() * 0.9, 0, Math.PI * 2); c.fill();
                }
                c.globalAlpha = 1;
            }
            spr = { cv, w: W };
            _floraCache.set(key, spr);
            return spr;
        }

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
                const s = this.size, palm = this.type === 'palm', bush = this.type === 'bush';
                // Shadow on the ground (drawn live: in daylight it will follow the sun)
                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath(); ctx.ellipse(this.x + sway * 0.4 + 4 * s, this.y + (bush ? 3 : 6) * s, (bush ? 13 : palm ? 16 : 19) * s, (bush ? 6 : 8) * s, 0, 0, Math.PI * 2); ctx.fill();
                // The canopy: its painted sprite, carried by the wind
                if (this._variant === undefined) this._variant = Math.floor(this.phaseOffset * 0.637) % 4;
                const spr = floraSprite(this.type, s, this._variant);
                const cx = this.x + sway * (bush ? 0.6 : palm ? 0.3 : 1), cy = this.y - (bush ? 2 : palm ? 30 : 25) * s;
                if (palm) {
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(sway * 0.012); ctx.drawImage(spr.cv, -spr.w / 2, -spr.w / 2); ctx.restore();
                } else ctx.drawImage(spr.cv, cx - spr.w / 2, cy - spr.w / 2);
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

