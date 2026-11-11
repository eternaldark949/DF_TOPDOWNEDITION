import enemies from '../directory/game-db/enemies.json' with {type:'json'};
const HAZARD=enemies.hazards;
export const bossEffectAppearance={
 _smokeK(h){const now=this.render_clock??_gameTimeSec;return Math.min(1,(now-h.t0)/.5)*Math.min(1,(h.until-now)/1.2);},
 draw(ctx){
                const L = this._hazards, B = this._playerBurn, p = this.player;
                if ((!L || !L.length) && !B) return;
                const now = (this.render_clock??_gameTimeSec), t = (this.render_time??_frameTime/1000), TAU = Math.PI * 2;
                ctx.save();
                for (const h of L || []) {
                    const age = now - h.t0;
                    switch (h.kind) {
                        case 'sigil': {
                            const k = Math.min(1, age / HAZARD.SIGIL_ARM), flick = 0.7 + 0.3 * Math.sin(t * 30);
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.globalAlpha = 0.18 + 0.4 * k; drawGlow(ctx, h.x, h.y, h.r * (0.6 + 0.4 * k), '255, 70, 20', 0);
                            ctx.globalAlpha = 0.85; ctx.strokeStyle = `rgba(255,${120 - 60 * k | 0},40,${0.5 + 0.5 * k * flick})`; ctx.lineWidth = 2;
                            ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
                            ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, TAU); ctx.stroke();
                            // the sigil: a five-point star turning inside the ring
                            ctx.lineWidth = 1.2; ctx.beginPath();
                            for (let i = 0; i <= 5; i++) { const a = t * 0.8 + i * 4 * Math.PI / 5, rr = h.r * 0.72; i ? ctx.lineTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr) : ctx.moveTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr); }
                            ctx.stroke();
                            break;
                        }
                        case 'fire': {
                            const fade = Math.min(1, (h.until - now) / 0.6) * Math.min(1, age / 0.15);
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.globalAlpha = 0.55 * fade; drawGlow(ctx, h.x, h.y, h.r * 1.15, h.censer ? '255, 150, 50' : '255, 80, 25', 0.2);
                            for (let i = 0; i < 9; i++) {                       // tongues of flame licking up
                                const a = i * 2.4 + (h.x % 7), rr = h.r * (0.25 + 0.6 * ((i * 0.37 + t * 0.3) % 1)), ph = (t * 2.2 + i * 0.31) % 1;
                                const fx = h.x + Math.cos(a) * rr, fy = h.y + Math.sin(a) * rr - ph * 14;
                                ctx.globalAlpha = (1 - ph) * 0.7 * fade; ctx.fillStyle = ph < 0.25 ? '#ffd890' : ph < 0.6 ? '#ff7a22' : '#c8320c';
                                ctx.beginPath(); ctx.ellipse(fx, fy, 2 + 2.5 * (1 - ph), 4 + 5 * (1 - ph), 0, 0, TAU); ctx.fill();
                            }
                            break;
                        }
                        case 'smoke': {
                            const k = this._smokeK(h);
                            ctx.globalCompositeOperation = 'source-over';
                            for (let i = 0; i < 9; i++) {
                                const a = (h.seed || 0) + i * 0.7 + t * 0.15 * (i % 2 ? 1 : -1), rr = h.r * 0.45 * ((i * 0.53) % 1);
                                ctx.globalAlpha = 0.16 * k; ctx.fillStyle = i % 3 ? '#5c5262' : '#8a7f90';
                                ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr, h.r * (0.45 + 0.12 * Math.sin(t + i)), 0, TAU); ctx.fill();
                            }
                            break;
                        }
                        case 'censer': {
                            const u = Math.min(1, age / h.flight), x = h.x0 + (h.x1 - h.x0) * u, y = h.y0 + (h.y1 - h.y0) * u - Math.sin(u * Math.PI) * 70;
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.globalAlpha = 0.25 + 0.5 * u; ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
                            ctx.beginPath(); ctx.arc(h.x1, h.y1, HAZARD.CENSER_FIRE_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                            ctx.globalAlpha = 0.2 * u; drawGlow(ctx, h.x1, h.y1, HAZARD.CENSER_FIRE_R, '255, 140, 40', 0);
                            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                            ctx.fillStyle = '#e8c27a'; ctx.strokeStyle = '#6a4f22'; ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.stroke();
                            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; drawGlow(ctx, x, y, 14, '255, 150, 60', 0.3);
                            break;
                        }
                        case 'hymn': {
                            const u = Math.min(1, age / HAZARD.HYMN_SECS), r = HAZARD.HYMN_RANGE * u;
                            ctx.globalCompositeOperation = 'lighter';
                            for (const [w, a] of [[10, 0.12], [4, 0.35], [1.5, 0.8]]) {
                                ctx.globalAlpha = a * (1 - u * 0.7); ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = w;
                                ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.stroke();
                            }
                            break;
                        }
                        case 'hook': {
                            const o = h.owner; if (!o) break;
                            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
                            const d = Math.hypot(h.x - o.x, h.y - o.y), n = Math.max(1, d / 7 | 0), a = Math.atan2(h.y - o.y, h.x - o.x);
                            ctx.strokeStyle = '#cfc6b8'; ctx.lineWidth = 1.4;
                            for (let i = 0; i < n; i++) {                       // the links
                                const u = (i + 0.5) / n, x = o.x + (h.x - o.x) * u, y = o.y + (h.y - o.y) * u;
                                ctx.beginPath(); ctx.ellipse(x, y, 3.2, 1.8, a + (i % 2 ? Math.PI / 2 : 0), 0, TAU); ctx.stroke();
                            }
                            ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a);
                            ctx.fillStyle = '#e6ddd0'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-3, -7); ctx.lineTo(0, 0); ctx.lineTo(-3, 7); ctx.closePath(); ctx.fill();
                            ctx.restore();
                            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; drawGlow(ctx, h.x, h.y, 14, '200, 120, 255', 0.3);
                            break;
                        }
                        case 'rite': {
                            const warn = age < HAZARD.RITE_WARN, pulse = 0.6 + 0.4 * Math.sin(t * 10);
                            ctx.globalCompositeOperation = 'lighter';
                            ctx.globalAlpha = warn ? 0.5 * pulse : 0.9; ctx.strokeStyle = warn ? '#ff9a4a' : '#ff3a1a'; ctx.lineWidth = warn ? 2 : 3;
                            ctx.setLineDash(warn ? [10, 8] : []); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                            if (!warn) {
                                // the burning beyond: a band of fire just outside the circle and a red wash past it
                                ctx.globalAlpha = 0.12; ctx.fillStyle = '#ff2a10';
                                ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 1400, 0, TAU); ctx.arc(h.x, h.y, h.r, 0, TAU, true); ctx.fill();
                                const n = Math.min(64, h.r / 9 | 0);
                                for (let i = 0; i < n; i++) {
                                    const a = i / n * TAU + t * 0.4, ph = (t * 2 + i * 0.37) % 1, rr = h.r + 6 + ph * 18;
                                    ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = ph < 0.35 ? '#fff0b0' : '#ff5a1a';
                                    ctx.beginPath(); ctx.ellipse(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr - ph * 10, 3, 6, 0, 0, TAU); ctx.fill();
                                }
                            }
                            break;
                        }
                        case 'flare': {
                            const u = Math.min(1, age / (h.dur || 0.4));
                            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * (1 - u * 0.5);
                            drawGlow(ctx, h.x, h.y, 16 + 26 * u, '255, 30, 50', 0.25);
                            ctx.strokeStyle = '#ff3050'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(h.x, h.y, 26 * (1 - u) + 6, 0, TAU); ctx.stroke();
                            break;
                        }
                        case 'gale': {
                            const u = Math.min(1, age / (h.dur || 0.35));
                            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * (1 - u);
                            ctx.fillStyle = '#ff7a8a';
                            ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.reach * (0.4 + 0.6 * u), h.a - h.spread, h.a + h.spread); ctx.closePath(); ctx.fill();
                            ctx.strokeStyle = '#ffd0d8'; ctx.lineWidth = 1;
                            for (let i = -2; i <= 2; i++) { const a = h.a + i * h.spread / 2.5, r0 = h.reach * u * 0.5; ctx.beginPath(); ctx.moveTo(h.x + Math.cos(a) * r0, h.y + Math.sin(a) * r0); ctx.lineTo(h.x + Math.cos(a) * (r0 + 30), h.y + Math.sin(a) * (r0 + 30)); ctx.stroke(); }
                            break;
                        }
                    }
                }
                // Burning: flames on her
                if (B && p && p.visible) {
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.5; drawGlow(ctx, p.x, p.y, 20, '255, 100, 30', 0.2);
                    for (let i = 0; i < 5; i++) {
                        const ph = (t * 2.6 + i * 0.2) % 1, a = i * 1.26;
                        ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = ph < 0.4 ? '#ffe9a0' : '#ff6a1a';
                        ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8 - ph * 16, 2.5, 5, 0, 0, TAU); ctx.fill();
                    }
                }
                ctx.restore();
 }
};
export function bossEffectPresentation(effects,clock){return effects.filter(effect=>!effect.destroyed).map(effect=>{const d=structuredClone(effect.data),position=effect.position;return {...d,x:position[0],y:position[1],x0:d.from_position?.[0]??position[0],y0:d.from_position?.[1]??position[1],x1:position[0],y1:position[1],t0:clock-d.age,until:clock+d.duration-d.age,flight:d.duration,dur:d.duration,r:d.kind==='rite'?d.radius+(d.radius_to-d.radius)*Math.min(1,Math.max(0,(d.age-HAZARD.RITE_WARN)/(d.duration-HAZARD.RITE_WARN))):d.radius,r0:d.radius,r1:d.radius_to};});}
