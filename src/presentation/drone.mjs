import enemies from '../directory/game-db/enemies.json' with {type:'json'};
const DRONE=enemies.drone;
export const droneAppearance={
_lift() { return DRONE.HOVER_PX + Math.sin(this.hoverOffset) * 3 + this.alt * 240; },
draw(ctx) {
                if (this.dead) return;
                if (this.invincibleTimer > 0 && this.invincibleTimer % 6 < 3) return;
                const t = this.render_time ?? _frameTime / 1000, lift = this._lift(), A = this.angle, TAU = Math.PI * 2;
                // Its shadow on the floor: wide and faint while it's high, then tightening as it lands
                ctx.save();
                const sh = 0.25 + 0.4 * (1 - this.alt);
                ctx.fillStyle = `rgba(0,0,0,${sh})`; ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, 24 + 20 * this.alt, 16 + 12 * this.alt, 0, 0, TAU); ctx.fill();
                if (this.alt > 0.02 && this.state === 'descend') {                // where it'll land
                    ctx.strokeStyle = `rgba(164,105,255,${0.4 + 0.4 * Math.sin(t * 14)})`; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
                    ctx.beginPath(); ctx.arc(this.x, this.y, DRONE.LAND_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
                }
                ctx.restore();
                ctx.save();
                ctx.translate(this.x, this.y - lift);
                const S = 1 + this.alt * 0.5;                                      // nearer the camera while it's high
                ctx.scale(S, S);
                ctx.rotate(A);
                this._drawTendrils(ctx, t);
                this._drawArms(ctx, t);
                this._drawShell(ctx, t);
                ctx.restore();
            },
_drawTendrils(ctx, t) {
                ctx.save(); ctx.lineCap = 'round';
                for (let i = 0; i < 13; i++) {
                    const side = (i / 12 - 0.5) * 2, x0 = -4 + Math.abs(side) * 5, y0 = side * 15;
                    const len = 30 + (i * 7 % 5) * 6, sw = Math.sin(t * 2.2 + i * 1.3 + this._seed) * 6;
                    ctx.strokeStyle = i % 2 ? '#14111b' : '#26202f'; ctx.lineWidth = i % 3 ? 1.7 : 2.8;
                    ctx.beginPath(); ctx.moveTo(x0, y0);
                    ctx.bezierCurveTo(x0 - len * 0.4, y0 + sw, x0 - len * 0.7, y0 * 1.1 - sw, x0 - len, y0 * 1.15 + sw * 0.6);
                    ctx.stroke();
                    if (i % 3 === 1) {                                              // a node light along it
                        ctx.fillStyle = `rgba(190,140,255,${0.5 + 0.5 * Math.sin(t * 5 + i)})`;
                        ctx.beginPath(); ctx.arc(x0 - len * 0.62, y0 * 1.08, 1.1, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();
            },
armPose(diving, stuck, s) {
                if (diving) return [5, 12 * s, 18, 24 * s, 30, 13 * s, 64, 3 * s];
                if (stuck) return [5, 12 * s, 13, 29 * s, 28, 24 * s, 50, 13 * s];
                return [5, 12 * s, 13, 30 * s, 28, 25 * s, 58, 11 * s];
            },
_drawArms(ctx, t) {
                const st = this.state, tl = st === 'tell' ? this._tell : null;
                const diving = st === 'dive' || (tl && tl.kind === 'lance'), stuck = st === 'recover';
                const reach = st === 'tether' && this._tether ? 1 : 0;
                for (const s of [-1, 1]) {
                    // shoulder → elbow → wrist → lance tip; a dive folds both lances forward together
                    const [sx, sy, ex, ey, wx, wy, tx, ty] = droneAppearance.armPose(diving, stuck, s);
                    ctx.lineCap = 'round';
                    ctx.strokeStyle = '#08070b'; ctx.lineWidth = 7;
                    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
                    ctx.strokeStyle = '#2a2436'; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
                    ctx.strokeStyle = 'rgba(200,190,230,0.18)'; ctx.lineWidth = 1;          // a glint along the plating
                    ctx.beginPath(); ctx.moveTo(sx, sy - 1); ctx.lineTo(ex, ey - 1); ctx.lineTo(wx, wy - 1); ctx.stroke();
                    for (const [jx, jy] of [[ex, ey], [wx, wy]]) {                  // the joints
                        ctx.fillStyle = '#17131f'; ctx.beginPath(); ctx.arc(jx, jy, 3.2, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(180,120,255,0.8)'; ctx.beginPath(); ctx.arc(jx, jy, 1, 0, Math.PI * 2); ctx.fill();
                    }
                    if (reach && s === 1) continue;                                 // its lance is the tether (drawn in the glow pass)
                    // the lance: a long dark blade, a violet core burning down its length
                    const la = Math.atan2(ty - wy, tx - wx), nx = -Math.sin(la), ny = Math.cos(la);
                    ctx.fillStyle = '#15101e';
                    ctx.beginPath(); ctx.moveTo(wx + nx * 3.4, wy + ny * 3.4); ctx.lineTo(tx, ty); ctx.lineTo(wx - nx * 3.4, wy - ny * 3.4); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = '#7a4cd8'; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.strokeStyle = '#e2ccff'; ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(wx + (tx - wx) * 0.1, wy + (ty - wy) * 0.1); ctx.lineTo(tx, ty); ctx.stroke();
                }
            },
_drawShell(ctx, t) {
                const tele = this.isTelegraphing, open = this.state === 'recover';
                // under-rim shadow, then the bell
                ctx.fillStyle = '#050407'; ctx.beginPath(); ctx.ellipse(-1, 0, 23, 21, 0, 0, Math.PI * 2); ctx.fill();
                const gr = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24);
                gr.addColorStop(0, '#3a3446'); gr.addColorStop(0.5, '#17141e'); gr.addColorStop(1, '#09080c');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(-2, 0, 21, 19, 0, 0, Math.PI * 2); ctx.fill();
                // plates: concentric bands and radial seams (they part when it's open)
                ctx.strokeStyle = open ? 'rgba(190,140,255,0.7)' : '#04030a'; ctx.lineWidth = open ? 1.2 : 1;
                for (const r of [8, 14]) { ctx.beginPath(); ctx.ellipse(-3, 0, r * 1.05, r, 0, 0, Math.PI * 2); ctx.stroke(); }
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + 0.2;
                    ctx.beginPath(); ctx.moveTo(-3 + Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(-2 + Math.cos(a) * 20, Math.sin(a) * 18); ctx.stroke();
                }
                // violet light slits along the plate edges
                ctx.strokeStyle = `rgba(170,110,255,${0.55 + 0.25 * Math.sin(t * 3 + this._seed)})`; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
                for (const [a0, a1, r] of [[-2.4, -1.7, 17], [1.7, 2.4, 17], [-0.9, -0.5, 11], [0.5, 0.9, 11], [2.9, 3.4, 15]]) {
                    ctx.beginPath(); ctx.ellipse(-2, 0, r * 1.05, r, 0, a0, a1); ctx.stroke();
                }
                // a sheen on the crown, and the hood's brow plates arching over the eye
                ctx.fillStyle = 'rgba(200,190,230,0.12)'; ctx.beginPath(); ctx.ellipse(-8, -6, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
                for (const s of [-1, 1]) {
                    ctx.fillStyle = '#1d1926'; ctx.strokeStyle = '#05040a'; ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.moveTo(6, 2 * s); ctx.quadraticCurveTo(14, 13 * s, 2, 18 * s); ctx.quadraticCurveTo(-1, 9 * s, 6, 2 * s); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = `rgba(170,110,255,${0.6 + 0.3 * Math.sin(t * 4 + s)})`; ctx.lineWidth = 0.9;
                    ctx.beginPath(); ctx.moveTo(8, 6 * s); ctx.quadraticCurveTo(11, 12 * s, 4, 15 * s); ctx.stroke();
                }
                // the eye: rings round a hot core
                const ex = DRONE.EYE_FWD, hit = this._eyeHitT ? Math.max(0, 1 - (_gameTimeSec - this._eyeHitT) / 0.2) : 0;
                ctx.fillStyle = '#0a0710'; ctx.beginPath(); ctx.arc(ex, 0, 7.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = tele ? '#f0e0ff' : '#9a62ff'; ctx.lineWidth = 1;
                for (const r of [6.5, 4.5]) { ctx.beginPath(); ctx.arc(ex, 0, r, 0, Math.PI * 2); ctx.stroke(); }
                ctx.fillStyle = hit > 0 ? '#ffffff' : tele ? '#f6eaff' : '#c9a2ff';
                ctx.beginPath(); ctx.arc(ex, 0, 2.6 + (tele ? 0.8 * Math.sin(t * 30) : 0), 0, Math.PI * 2); ctx.fill();
            },
drawLights(ctx) {
                if (this.dead) return;
                const t = this.render_time ?? _frameTime / 1000, now = this.render_clock ?? _gameTimeSec, lift = this._lift(), S = 1 + this.alt * 0.5;
                const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
                const W = (lx, ly) => ({ x: this.x + (lx * ca - ly * sa) * S, y: this.y - lift + (lx * sa + ly * ca) * S });
                const tl = this.state === 'tell' ? this._tell : null, k = tl ? Math.min(1, (now - this._stateT) / tl.secs) : 0;
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                // the sensor core
                const e = W(DRONE.EYE_FWD, 0);
                ctx.globalAlpha = 0.55 + 0.45 * k; drawGlow(ctx, e.x, e.y, (18 + 22 * k) * S, k > 0 ? '235, 200, 255' : '164, 105, 255', 0.35);
                // the lances crackle (brighter while it winds up or dives)
                const diving = this.state === 'dive' || (tl && tl.kind === 'lance');
                const hot = diving || (tl && tl.kind === 'lance') ? 1 : 0.45;
                for (const s of [-1, 1]) {
                    if (this.state === 'tether' && s === 1) continue;
                    const P = droneAppearance.armPose(diving, this.state === 'recover', s), w = W(P[4], P[5]), tip = W(P[6], P[7]);
                    ctx.globalAlpha = 0.35 * hot; drawGlow(ctx, tip.x, tip.y, 12 * S, '170, 110, 255', 0.3);
                    ctx.strokeStyle = `rgba(210,170,255,${0.5 * hot + 0.3})`; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(w.x, w.y);
                    const n = 5, seed = Math.floor(t * 18) + s * 7;
                    for (let i = 1; i <= n; i++) {
                        const u = i / n, j = i < n ? (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1) * 5 * hot : 0;
                        ctx.lineTo(w.x + (tip.x - w.x) * u - sa * j, w.y + (tip.y - w.y) * u + ca * j);
                    }
                    ctx.stroke();
                }
                // tells: the lance line it'll dive along, the beam it's charging
                if (tl && tl.kind === 'lance') {
                    ctx.globalAlpha = 0.3 + 0.6 * k; ctx.strokeStyle = '#c9a2ff'; ctx.lineWidth = 1 + 3 * k; ctx.setLineDash([8, 6]);
                    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(tl.a) * DRONE.LANCE.DIST, this.y + Math.sin(tl.a) * DRONE.LANCE.DIST); ctx.stroke(); ctx.setLineDash([]);
                } else if (tl && tl.kind === 'beam') {
                    const R = DRONE.BEAM.RANGE;
                    ctx.globalAlpha = 0.15 + 0.5 * k; ctx.strokeStyle = '#d8b8ff'; ctx.lineWidth = 0.6 + 2.4 * k;
                    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(tl.a) * R, e.y + Math.sin(tl.a) * R); ctx.stroke();
                } else if (tl && tl.kind === 'grapple') {
                    const tip = W(58, 11); ctx.globalAlpha = 0.4 + 0.5 * k; drawGlow(ctx, tip.x, tip.y, (10 + 12 * k) * S, '200, 150, 255', 0.3);
                }
                // the tether: its lance flung out on a crackling line
                const T = this._tether;
                if (T) {
                    const w = W(28, 25);
                    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#cfa8ff'; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(w.x, w.y);
                    const n = 8, dx = T.x - w.x, dy = T.y - w.y, L = Math.hypot(dx, dy) || 1;
                    for (let i = 1; i <= n; i++) { const u = i / n, j = i < n ? Math.sin(t * 40 + i * 2.1) * 3 : 0; ctx.lineTo(w.x + dx * u - dy / L * j, w.y + dy * u + dx / L * j); }
                    ctx.stroke();
                    ctx.globalAlpha = 0.8; drawGlow(ctx, T.x, T.y, T.state === 'held' ? 26 : 14, '190, 130, 255', 0.3);
                }
                // the beam itself: a white-violet line through everything
                const B = this._beam;
                if (B && now - B.t0 < DRONE.BEAM.FIRE) {
                    const u = (now - B.t0) / DRONE.BEAM.FIRE;
                    for (const [w, a] of [[14, 0.18], [6, 0.45], [2, 0.95]]) {
                        ctx.globalAlpha = a * (1 - u); ctx.strokeStyle = w > 4 ? '#a469ff' : '#ffffff'; ctx.lineWidth = w;
                        ctx.beginPath(); ctx.moveTo(B.x0, B.y0 - lift); ctx.lineTo(B.x1, B.y1); ctx.stroke();
                    }
                }
                ctx.restore();
            }
};
export function dronePresentation(entity,blend=1){const pose=entity.getRenderState(blend),action=entity.data.ability_action_state,state=entity.drone_state,clock=entity.data.weapon_state?.elapsed??0,definition=action?entity.physics_system.elements.asset_library.getResource('df:abilities').data[action.ability_id]:null,projectile=action?.projectile_id?entity.physics_system.elements.fetchEntity(action.projectile_id):null,target=action?.target_id?entity.physics_system.elements.fetchEntity(action.target_id):null,end=(target??projectile)?.getRenderState(blend).position;
return Object.assign(Object.create(droneAppearance),{x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,kind:entity.data.drone_kind,alt:state.alt,hoverOffset:entity.data.actor_state.elapsed*4.8,_seed:entity.data.appearance_seed,state:entity.state,invincibleTimer:Math.round(entity.data.actor_state.invulnerable_remaining*60),render_time:entity.data.actor_state.elapsed,render_clock:clock,_stateT:action?.phase_started_at??clock,_tell:action?.phase==='tell'?{kind:action.ability_id.replace('drone_',''),secs:definition.tell_seconds,lock:definition.lock_seconds,a:action.heading}:null,_tether:end?{x:end[0],y:end[1],state:target?'held':'out'}:null,_beam:action?.beam?{x0:action.beam.from[0],y0:action.beam.from[1],x1:action.beam.to[0],y1:action.beam.to[1],t0:action.phase_started_at}:null});}
