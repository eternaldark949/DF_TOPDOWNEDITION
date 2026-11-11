const marionetteAppearanceRules=DFNative.MARIONETTE_RULES;
/** Retained artwork over presentation records, with no physical actor ownership. */
const marionetteAppearance={
            _pose(t) {
                const s = this._seed, st = this.state, age = this.phase_age??(_gameTimeSec - this._stateT);
                const bob = Math.sin(t * 3.1 + s) * 1.5 + this._yank * 4;
                const sag = st === 'recover' ? Math.min(1, age / 0.15) * (1 - Math.max(0, (age - marionetteAppearanceRules.RECOVER + 0.25) / 0.25)) : 0;
                const raise = st === 'tell' ? Math.min(1, age / (marionetteAppearanceRules.TELL * 0.6)) : st === 'lunge' ? 1 - Math.min(1, age / 0.18) : 0;
                const swing = Math.sin(t * 5 + s) * (0.25 + this._yank * 0.6);
                return { lift: 5 + bob - sag * 3, sag, raise, swing, lunge: st === 'lunge' ? 1 - age / 0.3 : 0 };
            },

            draw(ctx) {
                if (this.dead) return;
                if (this.invincibleTimer > 0 && this.invincibleTimer % 4 < 2) return;
                const t = this.render_time??_frameTime / 1000, P = marionetteAppearance._pose.call(this,t), S = marionetteAppearanceRules.SCALE * 1.4;
                ctx.save();
                // Its shadow: small and soft, it hardly touches the ground
                ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
                marionetteAppearance._drawStrings.call(this,ctx,t,P);
                ctx.translate(this.x, this.y - P.lift);
                ctx.scale(S, S);
                ctx.rotate(this.angle - Math.PI / 2);                   // its front is local +y
                marionetteAppearance._drawBody.call(this,ctx,t,P);
                ctx.restore();
            },

            /** The control bar high over it and five strings down to head, hands and knees; faded into the dark above */
            _drawStrings(ctx, t, P) {
                const M = marionetteAppearanceRules, sway = Math.sin(t * 1.3 + this._seed) * 6, bx = this.x + sway, by = this.y - M.BAR_Z - P.lift;
                const S = M.SCALE * 1.4, a = this.angle - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
                const at = (lx, ly) => [this.x + (lx * c - ly * s) * S, this.y - P.lift + (lx * s + ly * c) * S];
                const ends = [at(0, 2), at(-11, 6 + P.raise * 8), at(11, 6 + P.raise * 8), at(-5, -8), at(5, -8)];
                const tips = [[bx, by], [bx - 16, by + 2], [bx + 16, by + 2], [bx - 6, by - 10], [bx + 6, by - 10]];
                ctx.lineWidth = 0.6;
                for (let i = 0; i < ends.length; i++) {
                    const [ex, ey] = ends[i], [tx, ty] = tips[i];
                    const gr = ctx.createLinearGradient(tx, ty, ex, ey); gr.addColorStop(0, M.STRING + '0)'); gr.addColorStop(0.35, M.STRING + '.3)'); gr.addColorStop(1, M.STRING + '.55)');
                    ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
                }
                // The bar: a wooden cross, half lost in the dark
                ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(bx, by); ctx.rotate(Math.sin(t * 1.1 + this._seed) * 0.15);
                ctx.fillStyle = M.WOOD_LO; ctx.fillRect(-18, -1.5, 36, 3); ctx.fillRect(-1.5, -12, 3, 20);
                ctx.fillStyle = M.WOOD; ctx.fillRect(-18, -1.5, 36, 1.2);
                ctx.restore();
            },

            /** The doll from above: legs dangling behind, the jointed body, arms with their blades, the porcelain face */
            _drawBody(ctx, t, P) {
                const M = marionetteAppearanceRules, TAU = Math.PI * 2;
                const joint = (x, y, r) => { ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
                const limb = (x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
                // Legs: dangling back and swinging
                for (const sd of [-1, 1]) {
                    const sw = P.swing * sd * 3, kx = sd * 4 + sw * 0.5, ky = -9, fx = sd * 4.5 + sw, fy = -16 - P.sag * 2;
                    limb(sd * 3.5, -5, kx, ky, 3.2, M.WOOD_LO); joint(kx, ky, 1.7); limb(kx, ky, fx, fy, 2.8, M.WOOD);
                    ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.ellipse(fx, fy - 1, 1.9, 2.6, 0, 0, TAU); ctx.fill();
                }
                // The torso: a little coat over carved wood, the belly joint
                ctx.fillStyle = M.WOOD_LO; ctx.beginPath(); ctx.ellipse(0, -2, 6, 5, 0, 0, TAU); ctx.fill(); joint(0, -1, 2);
                ctx.fillStyle = this.cloth; ctx.beginPath(); ctx.ellipse(0, 3, 8, 6.5, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.ellipse(-2, 1.5, 4, 3, -0.4, 0, TAU); ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 9); ctx.stroke();
                ctx.fillStyle = '#c9a85a'; for (const by of [1, 4.5]) { ctx.beginPath(); ctx.arc(0.9, by, 0.6, 0, TAU); ctx.fill(); }
                // Arms: shoulders, elbows, the blades. Raised for the tell, scissoring through the lunge
                for (const sd of [-1, 1]) {
                    const up = P.raise, cut = P.lunge;
                    const sx = sd * 8, sy = 4;
                    const ex = sd * (11 - up * 3) + P.swing * sd * 2, ey = 9 + up * 6 - P.sag * 4;
                    const hx = sd * (9 - up * 5 - cut * 12), hy = 13 + up * 10 + cut * 4 - P.sag * 6;
                    limb(sx, sy, ex, ey, 2.6, M.WOOD); joint(sx, sy, 1.9); joint(ex, ey, 1.6); limb(ex, ey, hx, hy, 2.3, M.WOOD_HI);
                    // The blade: a curved sickle out of the wrist
                    const a = Math.atan2(hy - ey, hx - ex) - sd * (0.35 + cut * 0.6);
                    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
                    ctx.fillStyle = M.BLADE_LO; ctx.beginPath(); ctx.moveTo(0, -1.2); ctx.quadraticCurveTo(9, -3 * sd, 15, sd * 2); ctx.quadraticCurveTo(8, 0.5 * sd, 0, 1.2); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = M.BLADE; ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(9, -2.6 * sd, 15, sd * 2); ctx.quadraticCurveTo(8, -0.6 * sd, 0, 0); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = M.JOINT; ctx.fillRect(-1.2, -1.6, 2.4, 3.2);
                    ctx.restore();
                }
                // The head: a porcelain face turned up toward the strings, soft and smiling; the jaw on its two lines
                const hy = 13;
                ctx.fillStyle = M.JOINT; ctx.beginPath(); ctx.arc(0, 9, 2, 0, TAU); ctx.fill();
                const fg = ctx.createRadialGradient(-1.5, hy - 1.5, 1, 0, hy, 7); fg.addColorStop(0, M.FACE); fg.addColorStop(1, M.FACE_LO);
                ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, hy, 6, 6.6, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse(0, hy - 3.2, 6.2, 3.8, 0, Math.PI, TAU); ctx.fill();   // painted hair, a little cap of it
                ctx.fillStyle = M.BLUSH; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 3.4, hy + 2.2, 1.3, 0, TAU); ctx.fill(); }
                ctx.fillStyle = '#1a1010'; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 2.2, hy + 0.6, 0.9, 0.5, 0, 0, TAU); ctx.fill(); }
                ctx.strokeStyle = 'rgba(120,40,50,.75)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(0, hy + 2.8, 1.6, 0.2, Math.PI - 0.2); ctx.stroke();   // the smile
                ctx.strokeStyle = 'rgba(60,40,30,.5)'; ctx.lineWidth = 0.35; ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(sd * 1.9, hy + 3.2); ctx.lineTo(sd * 1.9, hy + 6.2); } ctx.stroke();   // the jaw's hinge lines
            },

            /** Above the darkness: the blades' glint as it winds up, so a swarm in the dark can still be read */
            drawLights(ctx) {
                if (this.dead || this.state !== 'tell') return;
                const age = this.phase_age??(_gameTimeSec - this._stateT), k = Math.min(1, age / marionetteAppearanceRules.TELL), P = marionetteAppearance._pose.call(this,this.render_time??_frameTime/1000);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const sd of [-1, 1]) {
                    const a = this.angle - Math.PI / 2, lx = sd * 6, ly = 22, S = marionetteAppearanceRules.SCALE * 1.4;
                    const x = this.x + (lx * Math.cos(a) - ly * Math.sin(a)) * S, y = this.y - P.lift + (lx * Math.sin(a) + ly * Math.cos(a)) * S;
                    const gr = ctx.createRadialGradient(x, y, 0, x, y, 9 + 5 * k); gr.addColorStop(0, `rgba(235,240,255,${0.55 * k})`); gr.addColorStop(1, 'rgba(235,240,255,0)');
                    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            },
};
function drawMarionetteAppearance(ctx,packet,lights=false){return marionetteAppearance[lights?'drawLights':'draw'].call(packet,ctx);}
