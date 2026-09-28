        /**
         * Lamp Entity - No collision, just decoration.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        /**
         * Lamp Entity - Now supports rotation and proper alignment.
         */
        class LampEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: 'lamp',
                    hasCollision: false,
                    collisionLayer: GameEntity.LAYER.NONE
                });
                
                this.lampType = config.lampType || 2;
                this.angle = config.angle || 0; // Orientation in radians
                
                // Use color/radius from config or defaults
                this.color = config.color || (this.lampType === 1 ? '#ffaa55' : '#ffeebb');
                this.lightRadius = config.lightRadius || (this.lampType === 1 ? 200 : 350);
                
                // --- CRITICAL FIX ---
                // Overwrite the default GameEntity radius (which is small for collision)
                // with the lightRadius so the LightingSystem knows how far to draw the glow.
                this.radius = this.lightRadius;
                
                // Random offset so lamps don't all twinkle in perfect unison
                this.animOffset = Math.random() * 10000;
            }
            
            update() { }
            
            draw(ctx, daylight = 0) {
                if (!this.visible) return;
                
                const isOn = daylight < 0.2 && !this._forcedOff;
        
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
        
                // 1. DETERMINE BULB POSITIONS (Relative to 0,0)
                let bulbs = [];
                
                if (this.lampType === 1) { // Antiquated (Curved Arm)
                    bulbs.push({x: 22, y: 0});
                    // Base
                    ctx.fillStyle = '#111'; 
                    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
                    // Arm
                    ctx.strokeStyle = '#222'; ctx.lineWidth = 4; 
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, 0); ctx.stroke();
                    
                } else if (this.lampType === 3) { // Wall Mounted (circular)
                     bulbs.push({x: 0, y: 0});
                     ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
                     
                } else if (this.lampType === 5) { // Wall Strip (narrow rectangular sconce)
                     bulbs.push({x: 0, y: 0});
                     // Rectangular housing
                     ctx.fillStyle = '#1a1a1a';
                     ctx.fillRect(-3, -12, 6, 24);
                     // Warm glow strip
                     if (daylight < 0.2) {
                         ctx.fillStyle = this.color;
                         ctx.shadowColor = this.color;
                         ctx.shadowBlur = 12;
                         ctx.fillRect(-2, -10, 4, 20);
                         ctx.shadowBlur = 0;
                     } else {
                         ctx.fillStyle = '#333';
                         ctx.fillRect(-2, -10, 4, 20);
                     }
                     
                } else if (this.lampType === 4) { // Floor Lamp
                     bulbs.push({x: 0, y: 0});
                     
                } else { // Modern Street (T-Shape)
                    // Default "Modern" is T-shaped perpendicular to the pole
                    bulbs.push({x: 0, y: -20});
                    bulbs.push({x: 0, y: 20});
                    
                    // Post
                    ctx.fillStyle = '#222'; 
                    ctx.fillRect(-7, -7, 14, 14);
                    // Crossbar
                    ctx.fillStyle = '#333'; 
                    ctx.fillRect(-4, -24, 8, 48);
                }
        
                // 2. DRAW BULBS
                for (let b of bulbs) {
                    if (isOn) {
                        ctx.fillStyle = this.color; 
                        ctx.shadowColor = this.color; 
                        ctx.shadowBlur = (this.lampType === 4) ? 25 : 15;
                    } else {
                        ctx.fillStyle = '#444444'; 
                        ctx.shadowBlur = 0;
                    }
                    
                    ctx.beginPath(); 
                    ctx.arc(b.x, b.y, (this.lampType === 4 ? 12 : 8), 0, Math.PI*2); 
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
        
                // 3. DRAW PARTICLES (skip when zoomed out — invisible at distance)
                if (isOn && _zoomLOD < 1) {
                    const time = (_frameTime + this.animOffset) / 1000;
                    ctx.fillStyle = '#ffffff'; 
                    
                    for (let b of bulbs) {
                        for(let i = 0; i < 4; i++) {
                            const speed = 0.8 + (i * 0.2);
                            const angle = time * speed + (i * 2); 
                            const dist = 12 + Math.sin(time * 2 + i) * 6; 
                            const px = b.x + Math.cos(angle) * dist;
                            const py = b.y + Math.sin(angle) * dist;
                            const alpha = 0.4 + Math.sin(time * 5 + i) * 0.4;
                            
                            if (alpha > 0) {
                                ctx.globalAlpha = alpha;
                                ctx.beginPath();
                                ctx.arc(px, py, 1.2, 0, Math.PI*2);
                                ctx.fill();
                            }
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }
                
                ctx.restore();
            }
        }

