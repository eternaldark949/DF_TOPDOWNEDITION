/** Shared door artwork over presentation records. No body, motor or collision ownership. */
const indoorDoorAppearance = {
            draw(ctx) {
                ctx.save();
                if (this.type === 'sliding') indoorDoorAppearance.drawSliding.call(this,ctx);
                else if (this.type === 'arch') indoorDoorAppearance.drawArch.call(this,ctx);
                else indoorDoorAppearance.drawHinged.call(this,ctx);
                ctx.restore();
            },

            drawSliding(ctx) {
                const slideOffset = this.openAmount * ((this.orientation === 'H' ? this.w : this.h) / 2 + 4);
                if (this.jolt) ctx.translate(this.orientation === 'H' ? 0 : this.jolt, this.orientation === 'H' ? this.jolt : 0);

                if(this.panels)for(const p of this.panels){ctx.save();ctx.translate(...p.position);ctx.rotate(p.rotation);ctx.fillStyle=this.color;ctx.fillRect(p.local_position[0]-p.dimensions[0]/2,p.local_position[1]-p.dimensions[1]/2,...p.dimensions);ctx.restore();}
                if (this.orientation === 'H') {
                    const midX = this.x + this.w / 2;
                    ctx.fillStyle = this.color;
                    if(!this.panels)ctx.fillRect(this.x - slideOffset, this.y, this.w / 2 - 2, this.h);
                    if(!this.panels)ctx.fillRect(midX + 2 + slideOffset, this.y, this.w / 2 - 2, this.h);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect(this.x - this.w / 2, this.y - 1, this.w * 2, 1);
                    ctx.fillRect(this.x - this.w / 2, this.y + this.h, this.w * 2, 1);
                } else {
                    const midY = this.y + this.h / 2;
                    ctx.fillStyle = this.color;
                    if(!this.panels)ctx.fillRect(this.x, this.y - slideOffset, this.w, this.h / 2 - 2);
                    if(!this.panels)ctx.fillRect(this.x, midY + 2 + slideOffset, this.w, this.h / 2 - 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.fillRect(this.x - 1, this.y - this.h / 2, 1, this.h * 2);
                    ctx.fillRect(this.x + this.w, this.y - this.h / 2, 1, this.h * 2);
                }
            },

            /** An open doorway: two stone jambs, a threshold, a gold keystone mark. */
            drawArch(ctx) {
                const H = this.orientation === 'H', len = H ? this.w : this.h, th = H ? this.h : this.w;
                ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
                if (!H) ctx.rotate(Math.PI / 2);
                ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-len / 2, -th / 2, len, th);          // threshold
                ctx.fillStyle = 'rgba(201,164,106,0.35)'; ctx.fillRect(-len / 2 + 4, -0.5, len - 8, 1);  // brass inlay
                for (const sx of [-1, 1]) {                                                           // jambs
                    ctx.fillStyle = '#2a2230'; ctx.fillRect(sx * len / 2 - 5, -th / 2 - 3, 10, th + 6);
                    ctx.fillStyle = 'rgba(255,230,200,0.10)'; ctx.fillRect(sx * len / 2 - 5, -th / 2 - 3, 10, 1.5);
                }
                ctx.fillStyle = '#c9a46a'; ctx.beginPath();                                            // keystone
                ctx.moveTo(0, -th / 2 - 4); ctx.lineTo(3, -th / 2); ctx.lineTo(0, -th / 2 + 2); ctx.lineTo(-3, -th / 2); ctx.closePath(); ctx.fill();
            },

            drawHinged(ctx) {
                const L = this.length, t = this.thickness;
                ctx.translate(this.hx, this.hy);
                if (Math.abs(this.angle) > 0.17) {                                  // faint sweep on the floor
                    ctx.strokeStyle = 'rgba(255,217,176,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
                    ctx.beginPath(); ctx.arc(0, 0, L, this.baseAngle, this.baseAngle + this.angle, this.angle < 0); ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.rotate(this.baseAngle + this.angle);
                ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(2, -t / 2 + 2, L - 2, t);        // shadow
                ctx.fillStyle = this.color; ctx.fillRect(0, -t / 2, L, t);
                ctx.fillStyle = 'rgba(255,220,190,0.12)'; ctx.fillRect(3, -t / 2 + 1, L - 6, 1.2); // panel sheen
                ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.strokeRect(0, -t / 2, L, t);
                ctx.fillStyle = '#c9a46a';                                           // brass handles on both faces
                ctx.fillRect(L * 0.82, -t / 2 - 2, 5, 2); ctx.fillRect(L * 0.82, t / 2, 5, 2);
                ctx.fillStyle = '#8a7048'; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();   // hinge pin
            },
};
function drawIndoorDoorAppearance(ctx,door){return indoorDoorAppearance.draw.call(door,ctx);}
