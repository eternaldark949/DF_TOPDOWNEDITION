        /* =====================================================================
           BOKEH SYSTEM
           ---------------------------------------------------------------------
           Renders soft, drifting bokeh circles at screen edges for a cinematic
           dreampunk depth-of-field effect. Colors are pulled from nearby 
           dominant light sources or fall back to amber/violet.
           ===================================================================== */
        class BokehSystem {
            constructor(count = 18) {
                this.circles = [];
                for (let i = 0; i < count; i++) {
                    this.circles.push(this._spawn(true));
                }
            }

            _spawn(initial = false) {
                // Place along edges with bias
                const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
                const edgeDepth = 0.15 + Math.random() * 0.15; // How far into screen (15-30%)
                let nx, ny;
                switch (edge) {
                    case 0: nx = Math.random(); ny = edgeDepth * Math.random(); break;
                    case 1: nx = 1 - edgeDepth * Math.random(); ny = Math.random(); break;
                    case 2: nx = Math.random(); ny = 1 - edgeDepth * Math.random(); break;
                    case 3: nx = edgeDepth * Math.random(); ny = Math.random(); break;
                }
                // Dreampunk colors
                const colors = [
                    'rgba(255, 170, 0, ',   // amber
                    'rgba(164, 105, 255, ',  // violet
                    'rgba(255, 100, 150, ',  // pink
                    'rgba(0, 200, 255, ',    // cyan
                    'rgba(255, 215, 0, ',    // gold
                    'rgba(255, 50, 100, ',   // crimson-pink
                ];
                return {
                    nx, ny,
                    radius: 15 + Math.random() * 45,
                    alpha: 0.02 + Math.random() * 0.06,
                    colorBase: colors[Math.floor(Math.random() * colors.length)],
                    driftX: (Math.random() - 0.5) * 0.00008,
                    driftY: (Math.random() - 0.5) * 0.00006,
                    pulseSpeed: 0.0005 + Math.random() * 0.001,
                    pulseOffset: Math.random() * Math.PI * 2,
                    life: initial ? Math.random() * 15000 : 8000 + Math.random() * 12000,
                    age: initial ? Math.random() * 8000 : 0,
                };
            }

            update(dt) {
                for (let i = 0; i < this.circles.length; i++) {
                    const c = this.circles[i];
                    c.age += dt;
                    c.nx += c.driftX * dt;
                    c.ny += c.driftY * dt;
                    if (c.age > c.life || c.nx < -0.1 || c.nx > 1.1 || c.ny < -0.1 || c.ny > 1.1) {
                        this.circles[i] = this._spawn();
                    }
                }
            }

            draw(ctx, w, h, time) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'screen';
                for (const c of this.circles) {
                    const fadeIn = Math.min(1, c.age / 2000);
                    const fadeOut = Math.min(1, (c.life - c.age) / 2000);
                    const fade = fadeIn * fadeOut;
                    const pulse = 0.7 + 0.3 * Math.sin(time * c.pulseSpeed + c.pulseOffset);
                    const alpha = c.alpha * fade * pulse;
                    if (alpha < 0.005) continue;

                    const x = c.nx * w;
                    const y = c.ny * h;
                    const r = c.radius * (0.9 + pulse * 0.1);

                    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                    grad.addColorStop(0, c.colorBase + (alpha * 0.8).toFixed(3) + ')');
                    grad.addColorStop(0.5, c.colorBase + (alpha * 0.4).toFixed(3) + ')');
                    grad.addColorStop(1, c.colorBase + '0)');

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }
        }

