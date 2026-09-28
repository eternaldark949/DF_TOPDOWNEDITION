        // --- TRAFFIC CONSTANTS ---
        const STANDARD_VEHICLE_WIDTH = 30;
        const LANE_WIDTH = STANDARD_VEHICLE_WIDTH * 2; // 60 units per lane

        class Building {
            constructor(x, y, w, h, color, label = '', type = 'generic', config = {}) {
                this.x = x; this.y = y; 
                this.w = w; this.h = h;
                this.type = type; 
                this.isV2 = false; // Flag to identify old vs new buildings
                this._config = config; // Store for light regeneration
                
                // --- 1. DETERMINE THEME & COLORS ---
                this.wallColor = 'rgba(0, 0, 0, 0.5)';
                this.glowColor = '#444';
                this.glowBlur = 0;
                
                if (this.type === 'enni_cole') {
                    this.color = '#dba4b6'; 
                    this.label = label || 'Enni Cole';
                    this.wallColor = '#1a1a1a'; this.glowColor = '#ff69b4'; this.glowBlur = 15;
                } else if (this.type === 'cozy_cafe') {
                    this.color = '#5c4033'; 
                    this.label = label || 'Cozy Cafe';
                    this.wallColor = '#3e2723'; this.glowColor = '#ffaa00'; this.glowBlur = 5;
                } else if (this.type === 'hotel') {
                    this.color = '#3a2020';
                    this.label = label;
                    this.glowColor = '#ffaa00'; this.glowBlur = 10;
                } else if (this.type === 'club') {
                    this.color = '#2a1228';
                    this.label = label;
                    this.glowColor = '#ff00aa'; this.glowBlur = 10;
                } else {
                    this.color = color || '#2a2a30';
                    this.label = label;
                    if (config.sign && config.sign.color) {
                        this.glowColor = config.sign.color;
                        this.glowBlur = 8;
                    }
                }
        
                // --- 2. HANDLE ATTACHMENTS ---
                this.attachedSign = null;
                this.attachedTransition = null;
                this.attachedLights = []; 
        
                // Auto-Generate Neon Sign
                if (config.sign) {
                    const titleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
                    this.attachedSign = new NeonSign(
                        this.x + this.w / 2,        
                        this.y + this.h - 60,       
                        titleCase(config.sign.text),
                        config.sign.color,
                        (config.sign.size || 30) * 1.5, 
                        'Great Vibes'               
                    );
                }
        
                // Auto-Generate Transition & Door Light
                if (config.door) {
                    this.attachedTransition = {
                        x: (this.x + this.w / 2) - 50, 
                        y: this.y + this.h + 10,       
                        w: 100, h: 60, 
                        target: config.door.target,
                        label: config.door.label
                    };
        
                    if (config.door.lightColor) {
                        this.attachedLights.push(new LampEntity({ x: this.x + this.w / 2, y: this.y + this.h - 10, lampType: 3, color: config.door.lightColor, lightRadius: 200 }));
                    }
                }
        
                // --- 3. LIGHTING (Perimeter + Center) ---
                
                // A. Perimeter Lights (Accent)
                const perimeterSpacing = 300; 
                const lightRadius = 120;      
                
                const addPeriLight = (lx, ly) => {
                    if (Math.abs(lx - (this.x + this.w/2)) < 80 && Math.abs(ly - (this.y + this.h)) < 20) return;
                    this.attachedLights.push(new LampEntity({ x: lx, y: ly, lampType: 3, color: this.glowColor, lightRadius: lightRadius }));
                };
        
                for (let i = 40; i < this.w - 40; i += perimeterSpacing) addPeriLight(this.x + i, this.y); // Top
                for (let i = 40; i < this.w - 40; i += perimeterSpacing) addPeriLight(this.x + i, this.y + this.h); // Bottom
                for (let i = 40; i < this.h - 40; i += perimeterSpacing) addPeriLight(this.x, this.y + i); // Left
                for (let i = 40; i < this.h - 40; i += perimeterSpacing) addPeriLight(this.x + this.w, this.y + i); // Right
        
                // B. THE BRIGHT CENTER LIGHT
                this.attachedLights.push(new LampEntity({
                    x: this.x + this.w / 2,        // Center X
                    y: this.y + this.h / 2,         // Center Y
                    lampType: 3,                     // Type 3 (Roof/Standard)
                    color: this.glowColor,           // Matches Theme
                    lightRadius: 600                 // Huge Radius
                }));
        
                // --- 4. PROCEDURAL ROOF DETAILS ---
                this.roofProps = [];
                const seed = x + y; 
                const random = () => { const s = Math.sin(seed + this.roofProps.length) * 10000; return s - Math.floor(s); };
        
                if (this.type === 'apartment') {
                    const count = Math.floor((w * h) / 20000); 
                    for(let i=0; i<count; i++) {
                        this.roofProps.push({ type: 'vent', x: 20 + random() * (w - 60), y: 20 + random() * (h - 60), w: 20 + random() * 20, h: 20 + random() * 20 });
                    }
                } else if (this.type === 'hotel') {
                    this.roofProps.push({ type: 'ac_unit', x: 20, y: 20, w: 60, h: 40 });
                    this.roofProps.push({ type: 'ac_unit', x: w - 80, y: 20, w: 60, h: 40 });
                    if (w > 200 && h > 200) this.roofProps.push({ type: 'helipad', x: w/2, y: h/2, r: 60 });
                } else if (this.type === 'enni_cole') {
                    this.roofProps.push({ type: 'skylight', x: w/2 - 50, y: h/2 - 100, w: 100, h: 200 });
                    this.roofProps.push({ type: 'ac_unit', x: w - 60, y: 20, w: 40, h: 40 });
                } else if (this.type === 'cozy_cafe') {
                    this.roofProps.push({ type: 'vent', x: w - 50, y: h - 50, w: 30, h: 30 });
                }
            }
        
            // V1 buildings draw everything in one pass
            draw(ctx) { this.drawBase(ctx); this.drawTop(ctx); }
            
            // Base layer (for V2 compatibility)
            drawBase(ctx) {
                // 1. Shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(this.x + 40, this.y + 40, this.w, this.h);
        
                // 2. Roof Base
                ctx.fillStyle = this.color;
                ctx.fillRect(this.x, this.y, this.w, this.h);
                
                // 3. Texture
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for(let i=20; i<this.w; i+=40) { ctx.moveTo(this.x+i, this.y); ctx.lineTo(this.x+i, this.y+this.h); }
                ctx.stroke();
            }
            
            // Top layer (for V2 compatibility)
            drawTop(ctx) {
                // 4. Roof Props
                this.roofProps.forEach(p => {
                    if (p.type === 'vent') {
                        ctx.fillStyle = '#3a3a40'; ctx.fillRect(this.x + p.x, this.y + p.y, p.w, p.h);
                        ctx.fillStyle = '#222'; ctx.fillRect(this.x + p.x + 2, this.y + p.y + 2, p.w - 4, p.h - 4);
                    } else if (p.type === 'ac_unit') {
                        ctx.fillStyle = '#555'; ctx.fillRect(this.x + p.x, this.y + p.y, p.w, p.h);
                        ctx.fillStyle = '#222'; ctx.beginPath();
                        ctx.arc(this.x + p.x + p.w/4, this.y + p.y + p.h/2, 12, 0, Math.PI*2);
                        ctx.arc(this.x + p.x + p.w*0.75, this.y + p.y + p.h/2, 12, 0, Math.PI*2);
                        ctx.fill();
                    } else if (p.type === 'helipad') {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.x + p.x, this.y + p.y, p.r, 0, Math.PI*2); ctx.stroke();
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = `bold ${p.r}px Orbitron`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("H", this.x + p.x, this.y + p.y);
                    } else if (p.type === 'skylight') {
                        ctx.fillStyle = '#112233'; ctx.fillRect(this.x + p.x, this.y + p.y, p.w, p.h);
                        ctx.strokeStyle = '#556677'; ctx.lineWidth = 2; ctx.strokeRect(this.x + p.x, this.y + p.y, p.w, p.h);
                        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(this.x + p.x, this.y + p.y + p.h); ctx.lineTo(this.x + p.x + p.w, this.y + p.y); ctx.lineTo(this.x + p.x + p.w - 20, this.y + p.y); ctx.lineTo(this.x + p.x, this.y + p.y + p.h - 20); ctx.fill();
                    }
                });
        
                // 5. Parapet / Edge Logic
                ctx.strokeStyle = this.wallColor; 
                ctx.lineWidth = 8; 
                ctx.strokeRect(this.x + 4, this.y + 4, this.w - 8, this.h - 8);
                
                ctx.strokeStyle = this.glowColor; 
                ctx.lineWidth = 2; 
                ctx.shadowColor = this.glowColor; 
                ctx.shadowBlur = this.glowBlur; 
                ctx.strokeRect(this.x, this.y, this.w, this.h); 
                ctx.shadowBlur = 0;
        
                // 6. Hotel Awning
                if (this.type === 'hotel') {
                    const center = this.x + this.w / 2;
                    ctx.fillStyle = '#550000'; ctx.fillRect(center - 80, this.y + this.h, 160, 50);
                    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.strokeRect(center - 80, this.y + this.h, 160, 50);
                    ctx.fillStyle = '#330000'; ctx.fillRect(center - 40, this.y + this.h + 50, 80, 30);
                }
        
                // 7. LABEL
                if (this.label) {
                    ctx.save();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.font = '600 16px Montserrat';
                    ctx.textAlign = 'center';
                    const ly = (this.type === 'hotel') ? this.y + this.h - 40 : this.y + this.h/2;
                    ctx.fillText(this.label.toUpperCase(), this.x + this.w/2, ly);
                    ctx.restore();
                }
            }
        
            regenerateLights() {
                this.attachedLights = [];
                
                // Door light
                if (this._config.door && this._config.door.lightColor) {
                    this.attachedLights.push(new LampEntity({ x: this.x + this.w / 2, y: this.y + this.h - 10, lampType: 3, color: this._config.door.lightColor, lightRadius: 200 }));
                }
                
                // Perimeter lights
                const perimeterSpacing = 300;
                const lightRadius = 120;
                const addPeriLight = (lx, ly) => {
                    if (Math.abs(lx - (this.x + this.w/2)) < 80 && Math.abs(ly - (this.y + this.h)) < 20) return;
                    this.attachedLights.push(new LampEntity({ x: lx, y: ly, lampType: 3, color: this.glowColor, lightRadius: lightRadius }));
                };
                for (let i = 40; i < this.w - 40; i += perimeterSpacing) addPeriLight(this.x + i, this.y);
                for (let i = 40; i < this.w - 40; i += perimeterSpacing) addPeriLight(this.x + i, this.y + this.h);
                for (let i = 40; i < this.h - 40; i += perimeterSpacing) addPeriLight(this.x, this.y + i);
                for (let i = 40; i < this.h - 40; i += perimeterSpacing) addPeriLight(this.x + this.w, this.y + i);
                
                // Center light
                this.attachedLights.push(new LampEntity({
                    x: this.x + this.w / 2, y: this.y + this.h / 2,
                    lampType: 3, color: this.glowColor, lightRadius: 600
                }));
            }
        
            getBounds() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
        }
        
