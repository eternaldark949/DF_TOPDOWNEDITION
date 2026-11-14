import enemies from '../data/game-db/enemies.json' with {type:'json'};
const DUEL=enemies.duel;
/** Retained Canvas art over a detached record; body art is supplied by the host. */
export const demonessAppearance={
            drawDuelTells(ctx) {
                if (this.dead || !this.solo) return;
                const now = (this.render_clock ?? _gameTimeSec), t = (this.render_time ?? _frameTime / 1000), tl = this._tell;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                if (tl && tl.kind === 'bolt') {
                    const k = Math.min(1, (now - (this._boltTellT || now)) / DUEL.BOLT_TELL), a = this.angle;
                    const x = this.x + Math.cos(a) * 16, y = this.y + Math.sin(a) * 16;
                    ctx.globalAlpha = 0.5 + 0.5 * k; drawGlow(ctx, x, y, 8 + 14 * k, '255, 110, 30', 0.35);
                    ctx.strokeStyle = `rgba(255,120,40,${0.25 + 0.4 * k})`; ctx.lineWidth = 1; ctx.setLineDash([5, 6]);
                    for (let i = 0; i < DUEL.BOLT_FAN; i++) {
                        const off = (i - (DUEL.BOLT_FAN - 1) / 2) * DUEL.BOLT_SPREAD;
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + off) * 160 * k, y + Math.sin(a + off) * 160 * k); ctx.stroke();
                    }
                    ctx.setLineDash([]);
                } else if (tl && tl.kind === 'gale') {
                    const k = 1 - Math.max(0, (tl.at - now) / DUEL.GALE_TELL);
                    ctx.globalAlpha = 0.15 + 0.35 * k; ctx.fillStyle = '#ff3a5a';
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.arc(this.x, this.y, DUEL.GALE_REACH, tl.a - DUEL.GALE_SPREAD, tl.a + DUEL.GALE_SPREAD); ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffb0c0'; ctx.lineWidth = 1.2; ctx.stroke();
                }
                if (this.phase >= 2) {                                         // the duel's later phases burn round her
                    const n = this.phase >= 3 ? 10 : 5;
                    for (let i = 0; i < n; i++) {
                        const ph = (t * 1.8 + i / n) % 1, a = i * 2.39 + t * 0.5, r = 14 + 6 * Math.sin(t * 3 + i);
                        ctx.globalAlpha = (1 - ph) * (this.phase >= 3 ? 0.8 : 0.45); ctx.fillStyle = ph < 0.3 ? '#ffd0a0' : this.phase >= 3 ? '#ff3a10' : '#b0122e';
                        ctx.beginPath(); ctx.ellipse(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r - ph * 18, 2.2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();
            },
            draw(ctx,drawBody) {
                if (this.dead) return;
                // Her wings, behind her: two membranes of black and crimson that breathe as she moves
                const t = (this.render_clock ?? _gameTimeSec), flap = 0.12 * Math.sin(t * 3 + this.x * 0.01), rise = 0.6 + 0.4 * (this._riseK ?? 1);
                ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(rise, rise);
                for (const s of [-1, 1]) {
                    ctx.save(); ctx.rotate(s * (0.25 + flap));
                    ctx.fillStyle = 'rgba(14,2,6,0.92)'; ctx.strokeStyle = 'rgba(176,18,46,0.75)'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(-4, s * 5);
                    ctx.quadraticCurveTo(-14, s * 30, -34, s * 40); ctx.lineTo(-30, s * 30); ctx.lineTo(-38, s * 26); ctx.lineTo(-30, s * 18); ctx.lineTo(-34, s * 10);
                    ctx.quadraticCurveTo(-18, s * 8, -6, s * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = 'rgba(227,166,74,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-5, s * 5); ctx.lineTo(-34, s * 40); ctx.moveTo(-5, s * 5); ctx.lineTo(-38, s * 26); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
                drawBody(ctx);
                // the whip-claw: a crimson lash to where she struck
                if (this._whipT && (this.render_clock ?? _gameTimeSec) - this._whipT < 0.18 && this._whipTo) {
                    const k = 1 - ((this.render_clock ?? _gameTimeSec) - this._whipT) / 0.18;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,60,90,${0.8 * k})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                    const mx = (this.x + this._whipTo.x) / 2 + Math.cos(this.angle + 1.57) * 18, my = (this.y + this._whipTo.y) / 2 + Math.sin(this.angle + 1.57) * 18;
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.quadraticCurveTo(mx, my, this._whipTo.x, this._whipTo.y); ctx.stroke(); ctx.restore();
                }
            }
};
export function demonessPresentation(entity,blend=1){const pose=entity.getRenderState(blend),state=entity.demoness_state,action=entity.data.ability_action_state,clock=entity.data.weapon_state?.elapsed??0,definition=action?entity.physics_system.elements.asset_library.getResource('df:abilities').data[action.ability_id]:null,kind=definition?.effect==='fan'?'bolt':definition?.effect==='gale'?'gale':definition?.effect==='step'?'step':null;return {x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,solo:entity.solo,phase:entity.phase,look:structuredClone(entity.data.appearance),visible:entity.visible,enginePresentation:true,render_clock:clock,render_time:entity.actor_state.elapsed,_riseK:state.rise,_eyeK:state.eye,_whipT:state.last_strike?.at??null,_whipTo:state.last_strike?{x:state.last_strike.position[0],y:state.last_strike.position[1]}:null,_boltTellT:action?.phase_started_at??clock,_tell:action?.phase==='tell'&&kind?{kind,at:action.phase_started_at+definition.tell_seconds,a:action.heading}:null};}
