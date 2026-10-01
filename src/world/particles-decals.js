        // PuddleSystem removed — disabled for performance (this.puddles = null at init).
        // All references are guarded with `if (this.puddles)` so no code changes needed.
        // Can be restored from version control if puddle visuals are revisited.
        
        /* =====================================================================
           LEAF PARTICLE SYSTEM
           ---------------------------------------------------------------------
           Creates floating leaves that drift through the air with wind.
           Features: Object pooling, tumbling physics, varied leaf shapes,
           integration with WeatherSystem wind.
           ===================================================================== */
        class LeafParticleSystem {
            constructor(game) {
                this.game = game;
                
                // Object pool for performance
                this.leaves = [];
                this.pool = [];
                
                // Settings
                this.enabled = true;
                this.maxLeaves = 80;              // Active leaves at once (increased)
                this.spawnRate = 0.04;            // Chance per frame to spawn
                this.windInfluence = 1.2;         // How much wind affects leaves
                this.glowingChance = 0.15;        // 15% chance for glowing leaves
                
                // Leaf colors - autumn/mixed palette
                this.colors = [
                    '#2d5a2d', '#3a6b3a', '#4a7c4a',  // Greens
                    '#8B4513', '#A0522D', '#CD853F',  // Browns
                    '#B8860B', '#DAA520', '#D2691E',  // Golds/Oranges
                    '#8B0000', '#A52A2A', '#CD5C5C',  // Reds
                ];
                
                // Glowing leaf colors
                this.glowingColors = [
                    { color: '#a855f7', glow: '#a855f7' },  // Purple
                    { color: '#f472b6', glow: '#ff69b4' },  // Pink
                    { color: '#fbbf24', glow: '#ffd700' },  // Gold
                    { color: '#4ade80', glow: '#00ff7f' },  // Green
                    { color: '#22d3ee', glow: '#00f3ff' },  // Cyan
                    { color: '#f87171', glow: '#ff4444' },  // Red
                ];
                
                // Leaf shape types
                this.shapes = ['oval', 'pointed', 'round', 'maple'];
            }
            
            /**
             * Get a leaf from pool or create new one.
             */
            _getLeaf() {
                if (this.pool.length > 0) {
                    const leaf = this.pool.pop();
                    leaf._ipGen = 0;   // fresh: don't blend from its previous flight (RenderInterp)
                    return leaf;
                }
                return {
                    x: 0, y: 0,
                    vx: 0, vy: 0,
                    rotation: 0,
                    rotationSpeed: 0,
                    tumble: 0,
                    tumbleSpeed: 0,
                    size: 1,
                    color: '#2d5a2d',
                    glowColor: null,
                    isGlowing: false,
                    shape: 'oval',
                    life: 1,
                    flutter: 0,
                    flutterSpeed: 0,
                    pulsePhase: 0
                };
            }
            
            /**
             * Return leaf to pool.
             */
            _recycleLeaf(leaf) {
                if (this.pool.length < 120) {
                    this.pool.push(leaf);
                }
            }
            
            /**
             * Spawn a new leaf at screen edge or from trees.
             */
            spawnLeaf() {
                if (this.leaves.length >= this.maxLeaves) return;
                
                const cam = this.game.camera;
                const w = this.game.weather?.windVec || { x: 0, y: 0 }, ws = Math.hypot(w.x, w.y);
                
                const leaf = this._getLeaf();
                
                // Spawn off the upwind edge(s) of the view, carried in on the wind (any direction)
                const screenW = this.game.canvas.width / cam.zoom;
                const screenH = this.game.canvas.height / cam.zoom;
                const ux = ws > 0.05 ? w.x / ws : (Math.random() - 0.5), uy = ws > 0.05 ? w.y / ws : (Math.random() - 0.5);
                if (Math.random() * (Math.abs(ux) + Math.abs(uy)) < Math.abs(ux)) {
                    leaf.x = cam.x - Math.sign(ux || 1) * (screenW / 2 + 50);           // the left or right edge the wind comes from
                    leaf.y = cam.y - screenH / 2 + Math.random() * screenH;
                } else {
                    leaf.y = cam.y - Math.sign(uy || 1) * (screenH / 2 + 50);           // the top or bottom edge
                    leaf.x = cam.x - screenW / 2 + Math.random() * screenW;
                }
                
                // Already moving with the wind, give or take
                const k = (0.6 + Math.random() * 0.6) * 0.6 * this.windInfluence;
                leaf.vx = w.x * k + (Math.random() - 0.5) * 0.4;
                leaf.vy = w.y * k + (Math.random() - 0.5) * 0.4;
                
                // Rotation
                leaf.rotation = Math.random() * Math.PI * 2;
                leaf.rotationSpeed = (Math.random() - 0.5) * 0.15;
                
                // Tumbling (3D rotation illusion)
                leaf.tumble = Math.random() * Math.PI * 2;
                leaf.tumbleSpeed = 0.02 + Math.random() * 0.04;
                
                // Flutter (side-to-side oscillation)
                leaf.flutter = Math.random() * Math.PI * 2;
                leaf.flutterSpeed = 0.05 + Math.random() * 0.05;
                
                // Appearance
                leaf.size = 4 + Math.random() * 5;
                leaf.shape = this.shapes[Math.floor(Math.random() * this.shapes.length)];
                leaf.life = 1.0;
                
                // Determine if glowing
                leaf.isGlowing = Math.random() < this.glowingChance;
                
                if (leaf.isGlowing) {
                    const glowData = this.glowingColors[Math.floor(Math.random() * this.glowingColors.length)];
                    leaf.color = glowData.color;
                    leaf.glowColor = glowData.glow;
                    leaf.pulsePhase = Math.random() * Math.PI * 2;
                } else {
                    leaf.color = this.colors[Math.floor(Math.random() * this.colors.length)];
                    leaf.glowColor = null;
                }
                
                this.leaves.push(leaf);
            }
            
            /**
             * Update all leaves.
             */
            update() {
                if (!this.enabled) return;
                if (this.game.activeMap?.type !== 'outdoor') return;
                
                const wind = this.game.weather?.wind ?? 0;
                const w = this.game.weather?.windVec || { x: 0, y: 0 }, ws = Math.hypot(w.x, w.y);
                const tx = w.x * 0.6 * this.windInfluence, ty = w.y * 0.6 * this.windInfluence;   // the speed the wind carries a leaf at
                const px = ws > 0.05 ? -w.y / ws : 1, py = ws > 0.05 ? w.x / ws : 0;                 // across the wind, for the flutter
                const gust = Math.min(1, ws / 2.5);
                const cam = this.game.camera;
                const screenW = this.game.canvas.width / cam.zoom;
                const screenH = this.game.canvas.height / cam.zoom;
                
                // Spawn new leaves (more when windy; still air brings few)
                const spawnChance = this.spawnRate * (0.15 + wind);
                if (Math.random() < spawnChance) {
                    this.spawnLeaf();
                }
                
                // Update existing leaves
                for (let i = this.leaves.length - 1; i >= 0; i--) {
                    const leaf = this.leaves[i];
                    
                    // Carried by the wind: ease toward its velocity (top-down, so no "falling" south)
                    leaf.vx += (tx - leaf.vx) * 0.02;
                    leaf.vy += (ty - leaf.vy) * 0.02;
                    
                    // Flutter across the wind (in still air, a light wander that settles)
                    leaf.flutter += leaf.flutterSpeed;
                    const flutterForce = Math.sin(leaf.flutter) * (0.02 + 0.06 * gust);
                    leaf.vx += px * flutterForce;
                    leaf.vy += py * flutterForce;
                    
                    // Move
                    leaf.x += leaf.vx;
                    leaf.y += leaf.vy;
                    
                    // Rotate
                    leaf.rotation += leaf.rotationSpeed * (0.4 + gust);    // spins faster in a stronger wind
                    leaf.tumble += leaf.tumbleSpeed * (0.4 + gust);
                    
                    // Check if off-screen (with margin)
                    const margin = 100;
                    const dx = leaf.x - cam.x;
                    const dy = leaf.y - cam.y;
                    
                    if (Math.abs(dx) > screenW / 2 + margin || 
                        Math.abs(dy) > screenH / 2 + margin) {
                        // Recycle leaf - use O(1) swap removal
                        this._recycleLeaf(leaf);
                        this.leaves[i] = this.leaves[this.leaves.length - 1];
                        this.leaves.pop();
                    }
                }
            }
            
            /**
             * Draw all leaves.
             */
            draw(ctx) {
                if (!this.enabled) return;
                if (this.game.activeMap?.type !== 'outdoor') return;
                if (this.leaves.length === 0) return;
                
                const time = _frameTimeSec;
                
                ctx.save();
                
                this.leaves.forEach(leaf => {
                    ctx.save();
                    ctx.translate(leaf.x, leaf.y);
                    ctx.rotate(leaf.rotation);
                    
                    // Tumble effect - squash/stretch based on 3D rotation
                    const tumbleScale = 0.3 + Math.abs(Math.cos(leaf.tumble)) * 0.7;
                    ctx.scale(tumbleScale, 1);
                    
                    const s = leaf.size;
                    
                    // Glowing leaf effect
                    if (leaf.isGlowing && leaf.glowColor) {
                        const pulse = 0.6 + Math.sin(time * 3 + leaf.pulsePhase) * 0.4;
                        
                        // Outer glow
                        ctx.shadowColor = leaf.glowColor;
                        ctx.shadowBlur = 12 * pulse;
                        
                        // Glow halo
                        ctx.fillStyle = leaf.glowColor;
                        ctx.globalAlpha = 0.3 * pulse;
                        ctx.beginPath();
                        ctx.ellipse(0, 0, s * 1.5, s * 0.8, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                    
                    // Draw leaf shape
                    ctx.fillStyle = leaf.color;
                    
                    if (leaf.shape === 'oval') {
                        ctx.beginPath();
                        ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // Center vein
                        ctx.strokeStyle = leaf.isGlowing ? 'rgba(255,255,255,0.4)' : this._darken(leaf.color, 30);
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(-s * 0.8, 0);
                        ctx.lineTo(s * 0.8, 0);
                        ctx.stroke();
                        
                    } else if (leaf.shape === 'pointed') {
                        ctx.beginPath();
                        ctx.moveTo(-s, 0);
                        ctx.quadraticCurveTo(0, -s * 0.6, s * 1.2, 0);
                        ctx.quadraticCurveTo(0, s * 0.6, -s, 0);
                        ctx.fill();
                        
                    } else if (leaf.shape === 'round') {
                        ctx.beginPath();
                        ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2);
                        ctx.fill();
                        // Small stem
                        ctx.strokeStyle = leaf.isGlowing ? 'rgba(255,255,255,0.4)' : this._darken(leaf.color, 40);
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(s * 0.5, 0);
                        ctx.lineTo(s * 0.8, 0);
                        ctx.stroke();
                        
                    } else if (leaf.shape === 'maple') {
                        // Simplified maple leaf (5 points)
                        ctx.beginPath();
                        ctx.moveTo(0, -s);
                        ctx.lineTo(s * 0.3, -s * 0.3);
                        ctx.lineTo(s, -s * 0.2);
                        ctx.lineTo(s * 0.4, s * 0.1);
                        ctx.lineTo(s * 0.5, s);
                        ctx.lineTo(0, s * 0.5);
                        ctx.lineTo(-s * 0.5, s);
                        ctx.lineTo(-s * 0.4, s * 0.1);
                        ctx.lineTo(-s, -s * 0.2);
                        ctx.lineTo(-s * 0.3, -s * 0.3);
                        ctx.closePath();
                        ctx.fill();
                    }
                    
                    // Inner highlight for glowing leaves
                    if (leaf.isGlowing) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.beginPath();
                        ctx.ellipse(0, 0, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    // Reset shadow
                    ctx.shadowBlur = 0;
                    
                    ctx.restore();
                });
                
                ctx.restore();
            }
            
            /**
             * Darken a hex color.
             */
            _darken(hex, amount) {
                try {
                    let r = parseInt(hex.slice(1, 3), 16);
                    let g = parseInt(hex.slice(3, 5), 16);
                    let b = parseInt(hex.slice(5, 7), 16);
                    r = Math.max(0, r - amount);
                    g = Math.max(0, g - amount);
                    b = Math.max(0, b - amount);
                    return `rgb(${r}, ${g}, ${b})`;
                } catch (e) {
                    return '#1a3d1a';
                }
            }
            
            /**
             * Clear all leaves.
             */
            clear() {
                this.leaves.forEach(l => this._recycleLeaf(l));
                this.leaves = [];
            }
        }
        
        /* =====================================================================
           DECAL SYSTEM (PERSISTENT FX)
           ---------------------------------------------------------------------
           Handles persistent visuals like skid marks, blood, and scorch marks.
           Uses a dedicated off-screen canvas that is NOT cleared every frame.
           ===================================================================== */
        class DecalSystem {
            constructor() {
                this.decals = [];
                this.maxDecals = CONFIG.DECALS.MAX_DECALS;
                this.maxAgeMs = CONFIG.DECALS.MAX_AGE_MS;
                this.fadeStart = CONFIG.DECALS.FADE_START;
            }
            
            // Resize/clear are no-ops now — no canvas to manage
            resize() {}
            clear() { this.decals = []; }
            getDimensions() { return { count: this.decals.length }; }
            
            /**
             * Unified decal method — all types go through here.
             * @param {string} type - 'skid' | 'debris' | 'blood'
             * @param {number} x - World X position
             * @param {number} y - World Y position
             * @param {object} opts - Type-specific options
             */
            addDecal(type, x, y, opts = {}) {
                // Evict oldest decals when at capacity
                if (this.decals.length >= this.maxDecals) {
                    this.decals.shift(); // Remove oldest
                }
                
                const now = _frameTime;
                
                switch (type) {
                    case 'skid': {
                        const intensity = opts.intensity || 0.5;
                        const width = opts.width || CONFIG.DECALS.SKID_RADIUS;
                        this.decals.push({
                            type: 'skid', x, y, 
                            radius: width / 2,
                            alpha: Math.max(0.15, Math.min(0.8, intensity * 2.0)),
                            color: '10, 10, 10',
                            spawnTime: now
                        });
                        break;
                    }
                    case 'debris': {
                        const color = opts.color || '#555555';
                        const count = opts.count || 5;
                        const spread = CONFIG.DECALS.DEBRIS_SPREAD;
                        // Parse hex to rgb string once
                        const rgb = this._hexToRgb(color);
                        
                        for (let i = 0; i < count; i++) {
                            if (this.decals.length >= this.maxDecals) this.decals.shift();
                            const dist = Math.random() * spread;
                            const angle = Math.random() * Math.PI * 2;
                            this.decals.push({
                                type: 'debris', 
                                x: x + Math.cos(angle) * dist,
                                y: y + Math.sin(angle) * dist,
                                size: 1 + Math.random() * 3,
                                alpha: 0.6 + Math.random() * 0.4,
                                color: rgb,
                                spawnTime: now
                            });
                        }
                        break;
                    }
                    case 'blood': {
                        const size = opts.size || 3;
                        const color = opts.color || '138, 7, 7';             // "r, g, b" — each character bleeds their own colour
                        this.decals.push({
                            type: 'blood', x, y,
                            radius: size,
                            alpha: 0.4 + Math.random() * 0.4,
                            color,
                            spawnTime: now
                        });
                        // A hit sprays along its direction: a few droplets trailing away
                        if (opts.dir !== undefined) {
                            const n = 2 + Math.floor(Math.random() * 3);
                            for (let k = 1; k <= n; k++) {
                                if (this.decals.length >= this.maxDecals) this.decals.shift();
                                const d = size * (1.2 + k * 1.1) + Math.random() * 3, a = opts.dir + (Math.random() - 0.5) * 0.6;
                                this.decals.push({ type: 'blood', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
                                                   radius: Math.max(0.6, size * (0.55 - k * 0.1)), alpha: 0.35 + Math.random() * 0.35, color, spawnTime: now });
                            }
                        }
                        // Secondary splatter
                        if (Math.random() < CONFIG.DECALS.BLOOD_SPLATTER_CHANCE) {
                            if (this.decals.length >= this.maxDecals) this.decals.shift();
                            this.decals.push({
                                type: 'blood',
                                x: x + (Math.random() - 0.5) * 12,
                                y: y + (Math.random() - 0.5) * 12,
                                radius: size * 0.6,
                                alpha: 0.3 + Math.random() * 0.3,
                                color,
                                spawnTime: now
                            });
                        }
                        break;
                    }
                }
            }
            
            // Legacy API compatibility — routes to addDecal
            addSkid(x, y, width, intensity) { this.addDecal('skid', x, y, { width, intensity }); }
            addDebris(x, y, color, count) { this.addDecal('debris', x, y, { color, count }); }
            addBlood(x, y, size, color) { this.addDecal('blood', x, y, { size, color }); }
            
            /**
             * Draw only visible decals using cullBounds.
             * Fades old decals and removes expired ones.
             */
            draw(ctx, cullBounds) {
                if (this.decals.length === 0) return;
                
                const now = _frameTime;
                const maxAge = this.maxAgeMs;
                const fadeStart = this.fadeStart;
                
                // Use cullBounds if provided, otherwise draw all
                const hasBounds = !!cullBounds;
                let left, right, top, bottom;
                if (hasBounds) {
                    left = cullBounds.left;
                    right = cullBounds.right;
                    top = cullBounds.top;
                    bottom = cullBounds.bottom;
                }
                
                // Iterate and draw/cleanup in one pass
                for (let i = this.decals.length - 1; i >= 0; i--) {
                    const d = this.decals[i];
                    const age = now - d.spawnTime;
                    
                    // Remove expired decals
                    if (age > maxAge) {
                        this.decals[i] = this.decals[this.decals.length - 1];
                        this.decals.pop();
                        continue;
                    }
                    
                    // Viewport culling
                    if (hasBounds) {
                        if (d.x < left || d.x > right || d.y < top || d.y > bottom) continue;
                    }
                    
                    // Calculate fade
                    let alpha = d.alpha;
                    const ageFraction = age / maxAge;
                    if (ageFraction > fadeStart) {
                        alpha *= 1.0 - ((ageFraction - fadeStart) / (1.0 - fadeStart));
                    }
                    if (alpha < 0.01) continue;
                    
                    // Draw based on type
                    if (d.type === 'skid' || d.type === 'blood') {
                        ctx.fillStyle = `rgba(${d.color}, ${alpha})`;
                        ctx.beginPath();
                        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (d.type === 'debris') {
                        ctx.fillStyle = `rgba(${d.color}, ${alpha})`;
                        ctx.fillRect(d.x, d.y, d.size, d.size);
                    }
                }
            }
            
            _hexToRgb(hex) {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result 
                    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
                    : '128, 128, 128';
            }
        }

        
