/** Shared retained gunner/Warden artwork. Receives presentation records, never owns bodies. */
const gunnerAppearance={
            _drawBarrels(ctx) {
                const phase = this._barrelPhase || 0;
                for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 6; i++) {
                    const a = phase + i * Math.PI / 3, depth = Math.cos(a);
                    if ((depth >= 0 ? 1 : 0) !== pass) continue;
                    const by = Math.sin(a) * 8, shade = Math.round(38 + (depth + 1) * 12);
                    ctx.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
                    ctx.fillRect(5, by - 2, 30, 4);
                    ctx.fillStyle = 'rgba(175,180,190,0.20)';
                    ctx.fillRect(5, by - 1.6, 30, 0.45);
                    ctx.fillStyle = 'rgba(0,0,0,0.38)';
                    ctx.fillRect(11, by - 2, 0.8, 4);
                    ctx.fillRect(29, by - 2, 0.8, 4);
                }
            },
            _getHeatStrips() {
                if (gunnerAppearance._heatStrips) return gunnerAppearance._heatStrips;
                return (gunnerAppearance._heatStrips = [
                    ['rgba(65,3,2,0)', '#631008', '#c72e0b', '#ee5415'],
                    ['rgba(90,14,3,0)', '#8e2108', '#ee6913', '#ffc34d'],
                    ['rgba(110,25,4,0)', '#ad420d', '#ffc245', '#fff1ba']
                ].map((colors,stage) => {
                    const { canvas: cv, ctx: c } = canvasKit.createLayer([120, 16]), g = c.createLinearGradient(0,0,120,0);
                    for (const [i,stop] of [0,0.22,0.72,1].entries()) g.addColorStop(stop,colors[i]);
                    c.fillStyle = g; c.fillRect(0,0,120,16);
                    c.fillStyle = stage === 2 ? 'rgba(255,250,214,0.85)' : stage === 1 ? 'rgba(255,204,100,0.55)' : 'rgba(255,100,24,0.35)';
                    c.fillRect(68,2,52,2);
                    c.fillRect(116,0,4,16);
                    return cv;
                }));
            },
            drawHeat(ctx) {
                if (this.dead || this.visible === false || this.persona || this._barrelHeat <= 0.02 ||
                    (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3)) return;
                const heat = this._barrelHeat, intensity = heat * heat;
                const strips = gunnerAppearance._getHeatStrips();
                const stage = heat * 2, lo = Math.min(2, Math.floor(stage)), hi = Math.min(2, lo + 1), blend = stage - lo;
                ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.angle);
                const alpha = ctx.globalAlpha;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.25 * intensity;
                drawGlow(ctx,25,0,22 + heat * 6,'255,88,20',0);
                ctx.globalAlpha = alpha * 0.16 * intensity * heat;
                drawGlow(ctx,34,0,11,'255,202,91',0.1);
                for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 6; i++) {
                    const a = (this._barrelPhase || 0) + i * Math.PI / 3, depth = Math.cos(a);
                    if ((depth >= 0 ? 1 : 0) !== pass) continue;
                    const by = Math.sin(a) * 8, light = intensity * (0.70 + (depth + 1) * 0.15);
                    ctx.globalAlpha = alpha * light * (1 - blend);
                    ctx.drawImage(strips[lo],5,by - 2,30,4);
                    if (blend > 0) {
                        ctx.globalAlpha = alpha * light * blend;
                        ctx.drawImage(strips[hi],5,by - 2,30,4);
                    }
                }
                ctx.restore();
            },
            draw(ctx) {
                if (this.dead) return;

                // Flash if invincible
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) {
                    return;
                }
                if (this.persona) return (this._drawWarden??gunnerAppearance._drawWarden).call(this,ctx);

                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.ellipse(0, 10, 20, 12, 0, 0, Math.PI*2);
                ctx.fill();

                // In night vision the body burns white-hot: drawn into a capture and stamped back (ui/silhouette-fx.js)
                const heat = SilhouetteFX.heat, cap = heat > 0.01 ? SilhouetteFX.begin(ctx, 56) : null;
                try { (this._drawGunnerBody??gunnerAppearance._drawGunnerBody).call(this,cap || ctx); }
                finally { if (cap) SilhouetteFX.end('heat', heat); }

                // (Health bar: drawn with the other combat overlays once hit — engine/combat-fx.js)
                ctx.restore();

                // Telegraph aim line (world space)
                if (this.isTelegraphing && this.burstCooldown > 0) {
                    drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle,
                        this.burstCooldown, this.telegraphThreshold, '#ffaa00', 350);
                }
            },
            _drawGunnerBody(ctx) {
                // Body
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath();
                ctx.arc(0, 0, 20, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = '#ff3300';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Head
                ctx.fillStyle = '#ff0000';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(6, 0, 8, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Barrels
                const spinning = this.burstCount > 0 && this.burstCooldown === 0;
                (this._drawBarrels??gunnerAppearance._drawBarrels).call(this,ctx);

                // Muzzle Flash
                if (spinning && this.burstTimer < 3) {
                    ctx.fillStyle = '#ffaa00';
                    ctx.shadowColor = '#ffaa00';
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(35, 0, 8, 0, Math.PI*2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            },
            _drawWarden(ctx) {
                const W = WARDENS[this.persona], t = _frameTime / 1000, rise = this._riseK, kneel = 1 - rise, eye = this._eyeK;
                const tele = this.isTelegraphing && this.burstCooldown > 0, spinning = this.burstCount > 0 && this.burstCooldown === 0;
                const big = (this.persona === 'matins' ? 1.12 : 1) * (this.artScale || 1), S = this.artScale || 1;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(3, 8, 26 * big, 18 * big, 0, 0, Math.PI * 2); ctx.fill();
                ctx.rotate(this.angle);
                ctx.scale(big * (1 - 0.14 * kneel), big * (1 - 0.14 * kneel));
                // The mantle: a long cape behind, fluttering; pooled wide on the floor while kneeling
                const fl = Math.sin(t * 3 + this.id * 2) * 2.5 * rise;
                ctx.fillStyle = W.mantle; ctx.beginPath();
                ctx.moveTo(4, -16); ctx.quadraticCurveTo(-18 - 10 * kneel, -26 - 6 * kneel + fl, -34 - 6 * kneel, -10 + fl);
                ctx.quadraticCurveTo(-40 - 8 * kneel, 0, -34 - 6 * kneel, 10 - fl); ctx.quadraticCurveTo(-18 - 10 * kneel, 26 + 6 * kneel - fl, 4, 16); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = W.accent; ctx.lineWidth = 1.2; ctx.stroke();
                // Armoured body: black iron plates, gold filigree
                ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = W.trim; ctx.lineWidth = 1; ctx.stroke();
                for (const sy of [-1, 1]) {                                    // pauldrons
                    ctx.fillStyle = '#231c28'; ctx.beginPath(); ctx.ellipse(-2, sy * 15, this.persona === 'matins' ? 10 : 8, 6, sy * 0.3, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = W.accent; ctx.lineWidth = 1; ctx.stroke();
                }
                ctx.strokeStyle = W.trim; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(0, 0, 10, -1.2, 1.2); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-2, 0, -6, 8); ctx.stroke(); ctx.globalAlpha = 1;
                if (this.persona === 'compline') {                             // chains across the chest
                    ctx.strokeStyle = W.trim; ctx.lineWidth = 1.4; ctx.setLineDash([2, 1.5]);
                    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(0, 0 + Math.sin(t * 2) * rise, -10, 14); ctx.moveTo(-4, -16); ctx.lineTo(8, 10); ctx.stroke(); ctx.setLineDash([]);
                }
                // The weapon: rotary barrels on the right arm, lowered while kneeling; they glow as they heat
                ctx.save(); ctx.rotate(-0.9 * kneel); ctx.translate(4, 9);
                if (this.persona === 'vesper') { ctx.fillStyle = W.trim; ctx.beginPath(); ctx.arc(10, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#6a4f22'; ctx.lineWidth = 1; ctx.stroke(); }   // the thurible drum
                const spin = spinning ? _frameTime / 18 : 0, nB = this.persona === 'matins' ? 2 : 6;
                for (let i = 0; i < nB; i++) {
                    const off = nB === 2 ? (i ? 3.5 : -3.5) : Math.sin(spin + i * Math.PI / 3) * 4;
                    ctx.fillStyle = '#2e2a32'; ctx.fillRect(8, off - 1.6, 26, 3.2);
                    if (this._heat > 0.05) { ctx.fillStyle = `rgba(255,${120 + 80 * (1 - this._heat) | 0},40,${this._heat})`; ctx.fillRect(28, off - 1.6, 6, 3.2); }
                }
                if (this.persona === 'compline') { ctx.strokeStyle = W.trim; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(26, 6); ctx.moveTo(12, 6); ctx.lineTo(24, -6); ctx.stroke(); ctx.setLineDash([]); }
                if (spinning && this.burstTimer < 3) { ctx.fillStyle = '#ffcf6a'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(36, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
                ctx.restore();
                // The hood and the eye slit: dark while dormant; flaring white-red when about to fire
                ctx.fillStyle = '#0e0a10'; ctx.beginPath(); ctx.arc(2 - 3 * kneel, 0, 9, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = W.accent; ctx.lineWidth = 1.2; ctx.stroke();
                if (eye > 0.02) {
                    const flare = tele ? 0.6 + 0.4 * Math.sin(_frameTime / 40) : 0, flash = this._igniteFlash || 0;
                    ctx.shadowColor = `rgb(${W.eye})`; ctx.shadowBlur = 8 * eye + 14 * flash + 10 * flare;
                    ctx.fillStyle = flare > 0 ? `rgba(255,${200 * flare | 0},${200 * flare | 0},1)` : `rgba(${W.eye},${eye})`;
                    ctx.fillRect(6 - 3 * kneel, -4.5, 3, 9); ctx.shadowBlur = 0;
                }
                ctx.restore();
                // Matins' halo turns over its crown; Vesper's censer trails incense
                if (this.persona === 'matins') {
                    ctx.save(); ctx.translate(this.x, this.y); ctx.globalAlpha = 0.25 + 0.75 * eye;
                    ctx.scale(S * 1.12, S * 1.12); ctx.strokeStyle = W.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -6 * rise - 2, 16, 6, 0, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < 8; i++) { const a = t * 0.8 * rise + i * Math.PI / 4; ctx.fillStyle = W.accent; ctx.beginPath(); ctx.arc(Math.cos(a) * 16, -6 * rise - 2 + Math.sin(a) * 6, 1.4, 0, Math.PI * 2); ctx.fill(); }
                    ctx.restore();
                } else if (this.persona === 'vesper' && eye > 0.02) {
                    for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i / 5) % 1; ctx.globalAlpha = (1 - ph) * 0.25 * eye; ctx.fillStyle = '#b8a8c8'; ctx.beginPath(); ctx.arc(this.x - Math.cos(this.angle) * (10 + ph * 30) * S + Math.sin(t + i) * 4 * S, this.y - Math.sin(this.angle) * (10 + ph * 30) * S - ph * 10 * S, (3 + ph * 6) * S, 0, Math.PI * 2); ctx.fill(); }
                    ctx.globalAlpha = 1;
                }
                if (tele) drawEnemyTelegraph(ctx, this.x, this.y, this.telegraphAngle, this.burstCooldown, this.telegraphThreshold, `rgb(${W.eye})`, 380);
            }
};
function drawGunnerAppearance(ctx,packet,heat=false){return gunnerAppearance[heat?'drawHeat':'draw'].call(packet,ctx);}
