import enemies from '../data/game-db/enemies.json' with {type:'json'};
import {artScene,circle,ellipse,radial,glow} from './art-packets.mjs';
const DRONE=enemies.drone;
export function droneLift(state){return DRONE.HOVER_PX+Math.sin(state.hoverOffset)*3+state.alt*240;}
export function droneArmPose(diving,stuck,s){
 if(diving)return [5,12*s,18,24*s,30,13*s,64,3*s];
 if(stuck)return [5,12*s,13,29*s,28,24*s,50,13*s];
 return [5,12*s,13,30*s,28,25*s,58,11*s];
}
function draw(state,scene){let path=[];
                if (state.dead) return;
                if (state.invincibleTimer > 0 && state.invincibleTimer % 6 < 3) return;
                const t = state.render_time ?? 0, lift = droneLift(state), A = state.angle, TAU = Math.PI * 2;
                // Its shadow on the floor: wide and faint while it's high, then tightening as it lands
                scene.enter();
                const sh = 0.25 + 0.4 * (1 - state.alt);
                scene.style.fill = `rgba(0,0,0,${sh})`; path=[]; path.push(ellipse(state.x, state.y + 4, 24 + 20 * state.alt, 16 + 12 * state.alt, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                if (state.alt > 0.02 && state.state === 'descend') {                // where it'll land
                    scene.style.stroke = `rgba(164,105,255,${0.4 + 0.4 * Math.sin(t * 14)})`; scene.style.stroke_width = 1.5; scene.style.dash=[5, 5];
                    path=[]; path.push(circle(state.x, state.y, DRONE.LAND_R, 0, TAU)); scene.paint(path,{stroke:scene.style.stroke}); scene.style.dash=[];
                }
                scene.leave();
                scene.enter();
                scene.place({position:[state.x, state.y - lift]});
                const S = 1 + state.alt * 0.5;                                      // nearer the camera while it's high
                scene.place({scale:[S, S]});
                scene.place({rotation:A});
                _drawTendrils(state,scene,t);
                _drawArms(state,scene,t);
                _drawShell(state,scene,t);
                scene.leave();
            }

function _drawTendrils(state,scene,t){let path=[];
                scene.enter(); scene.style.line_cap = 'round';
                for (let i = 0; i < 13; i++) {
                    const side = (i / 12 - 0.5) * 2, x0 = -4 + Math.abs(side) * 5, y0 = side * 15;
                    const len = 30 + (i * 7 % 5) * 6, sw = Math.sin(t * 2.2 + i * 1.3 + state._seed) * 6;
                    scene.style.stroke = i % 2 ? '#14111b' : '#26202f'; scene.style.stroke_width = i % 3 ? 1.7 : 2.8;
                    path=[]; path.push(['move',x0, y0]);
                    path.push(['cubic',x0 - len * 0.4, y0 + sw, x0 - len * 0.7, y0 * 1.1 - sw, x0 - len, y0 * 1.15 + sw * 0.6]);
                    scene.paint(path,{stroke:scene.style.stroke});
                    if (i % 3 === 1) {                                              // a node light along it
                        scene.style.fill = `rgba(190,140,255,${0.5 + 0.5 * Math.sin(t * 5 + i)})`;
                        path=[]; path.push(circle(x0 - len * 0.62, y0 * 1.08, 1.1, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                    }
                }
                scene.leave();
            }

function _drawArms(state,scene,t){let path=[];
                const st = state.state, tl = st === 'tell' ? state._tell : null;
                const diving = st === 'dive' || (tl && tl.kind === 'lance'), stuck = st === 'recover';
                const reach = st === 'tether' && state._tether ? 1 : 0;
                for (const s of [-1, 1]) {
                    // shoulder → elbow → wrist → lance tip; a dive folds both lances forward together
                    const [sx, sy, ex, ey, wx, wy, tx, ty] = droneArmPose(diving, stuck, s);
                    scene.style.line_cap = 'round';
                    scene.style.stroke = '#08070b'; scene.style.stroke_width = 7;
                    path=[]; path.push(['move',sx, sy]); path.push(['line',ex, ey]); path.push(['line',wx, wy]); scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.stroke = '#2a2436'; scene.style.stroke_width = 4;
                    path=[]; path.push(['move',sx, sy]); path.push(['line',ex, ey]); path.push(['line',wx, wy]); scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.stroke = 'rgba(200,190,230,0.18)'; scene.style.stroke_width = 1;          // a glint along the plating
                    path=[]; path.push(['move',sx, sy - 1]); path.push(['line',ex, ey - 1]); path.push(['line',wx, wy - 1]); scene.paint(path,{stroke:scene.style.stroke});
                    for (const [jx, jy] of [[ex, ey], [wx, wy]]) {                  // the joints
                        scene.style.fill = '#17131f'; path=[]; path.push(circle(jx, jy, 3.2, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                        scene.style.fill = 'rgba(180,120,255,0.8)'; path=[]; path.push(circle(jx, jy, 1, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                    }
                    if (reach && s === 1) continue;                                 // its lance is the tether (drawn in the glow pass)
                    // the lance: a long dark blade, a violet core burning down its length
                    const la = Math.atan2(ty - wy, tx - wx), nx = -Math.sin(la), ny = Math.cos(la);
                    scene.style.fill = '#15101e';
                    path=[]; path.push(['move',wx + nx * 3.4, wy + ny * 3.4]); path.push(['line',tx, ty]); path.push(['line',wx - nx * 3.4, wy - ny * 3.4]); path.push(['close']); scene.paint(path,{fill:scene.style.fill});
                    scene.style.stroke = '#7a4cd8'; scene.style.stroke_width = 0.8; scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.stroke = '#e2ccff'; scene.style.stroke_width = 1.2;
                    path=[]; path.push(['move',wx + (tx - wx) * 0.1, wy + (ty - wy) * 0.1]); path.push(['line',tx, ty]); scene.paint(path,{stroke:scene.style.stroke});
                }
            }

function _drawShell(state,scene,t){let path=[];
                const tele = state.isTelegraphing, open = state.state === 'recover';
                // under-rim shadow, then the bell
                scene.style.fill = '#050407'; path=[]; path.push(ellipse(-1, 0, 23, 21, 0, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                const gr = radial([-6,-6],2,[0,0],24,[]);
                gr.stops.push([0, '#3a3446']); gr.stops.push([0.5, '#17141e']); gr.stops.push([1, '#09080c']);
                scene.style.fill = gr; path=[]; path.push(ellipse(-2, 0, 21, 19, 0, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                // plates: concentric bands and radial seams (they part when it's open)
                scene.style.stroke = open ? 'rgba(190,140,255,0.7)' : '#04030a'; scene.style.stroke_width = open ? 1.2 : 1;
                for (const r of [8, 14]) { path=[]; path.push(ellipse(-3, 0, r * 1.05, r, 0, 0, Math.PI * 2)); scene.paint(path,{stroke:scene.style.stroke}); }
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4 + 0.2;
                    path=[]; path.push(['move',-3 + Math.cos(a) * 8, Math.sin(a) * 8]); path.push(['line',-2 + Math.cos(a) * 20, Math.sin(a) * 18]); scene.paint(path,{stroke:scene.style.stroke});
                }
                // violet light slits along the plate edges
                scene.style.stroke = `rgba(170,110,255,${0.55 + 0.25 * Math.sin(t * 3 + state._seed)})`; scene.style.stroke_width = 1.3; scene.style.line_cap = 'round';
                for (const [a0, a1, r] of [[-2.4, -1.7, 17], [1.7, 2.4, 17], [-0.9, -0.5, 11], [0.5, 0.9, 11], [2.9, 3.4, 15]]) {
                    path=[]; path.push(ellipse(-2, 0, r * 1.05, r, 0, a0, a1)); scene.paint(path,{stroke:scene.style.stroke});
                }
                // a sheen on the crown, and the hood's brow plates arching over the eye
                scene.style.fill = 'rgba(200,190,230,0.12)'; path=[]; path.push(ellipse(-8, -6, 7, 4, -0.5, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                for (const s of [-1, 1]) {
                    scene.style.fill = '#1d1926'; scene.style.stroke = '#05040a'; scene.style.stroke_width = 0.8;
                    path=[]; path.push(['move',6, 2 * s]); path.push(['quadratic',14, 13 * s, 2, 18 * s]); path.push(['quadratic',-1, 9 * s, 6, 2 * s]); scene.paint(path,{fill:scene.style.fill}); scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.stroke = `rgba(170,110,255,${0.6 + 0.3 * Math.sin(t * 4 + s)})`; scene.style.stroke_width = 0.9;
                    path=[]; path.push(['move',8, 6 * s]); path.push(['quadratic',11, 12 * s, 4, 15 * s]); scene.paint(path,{stroke:scene.style.stroke});
                }
                // the eye: rings round a hot core
                const ex = DRONE.EYE_FWD, hit = state._eyeHitT ? Math.max(0, 1 - ((state.render_clock??0) - state._eyeHitT) / 0.2) : 0;
                scene.style.fill = '#0a0710'; path=[]; path.push(circle(ex, 0, 7.5, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                scene.style.stroke = tele ? '#f0e0ff' : '#9a62ff'; scene.style.stroke_width = 1;
                for (const r of [6.5, 4.5]) { path=[]; path.push(circle(ex, 0, r, 0, Math.PI * 2)); scene.paint(path,{stroke:scene.style.stroke}); }
                scene.style.fill = hit > 0 ? '#ffffff' : tele ? '#f6eaff' : '#c9a2ff';
                path=[]; path.push(circle(ex, 0, 2.6 + (tele ? 0.8 * Math.sin(t * 30) : 0), 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
            }

function drawLights(state,scene){let path=[];
                if (state.dead) return;
                const t = state.render_time ?? 0, now = state.render_clock ?? (state.render_clock??0), lift = droneLift(state), S = 1 + state.alt * 0.5;
                const ca = Math.cos(state.angle), sa = Math.sin(state.angle);
                const W = (lx, ly) => ({ x: state.x + (lx * ca - ly * sa) * S, y: state.y - lift + (lx * sa + ly * ca) * S });
                const tl = state.state === 'tell' ? state._tell : null, k = tl ? Math.min(1, (now - state._stateT) / tl.secs) : 0;
                scene.enter(); scene.style.blend = 'add';
                // the sensor core
                const e = W(DRONE.EYE_FWD, 0);
                scene.style.opacity = 0.55 + 0.45 * k; glow(scene, e.x, e.y, (18 + 22 * k) * S, k > 0 ? '235, 200, 255' : '164, 105, 255', 0.35);
                // the lances crackle (brighter while it winds up or dives)
                const diving = state.state === 'dive' || (tl && tl.kind === 'lance');
                const hot = diving || (tl && tl.kind === 'lance') ? 1 : 0.45;
                for (const s of [-1, 1]) {
                    if (state.state === 'tether' && s === 1) continue;
                    const P = droneArmPose(diving, state.state === 'recover', s), w = W(P[4], P[5]), tip = W(P[6], P[7]);
                    scene.style.opacity = 0.35 * hot; glow(scene, tip.x, tip.y, 12 * S, '170, 110, 255', 0.3);
                    scene.style.stroke = `rgba(210,170,255,${0.5 * hot + 0.3})`; scene.style.stroke_width = 1;
                    path=[]; path.push(['move',w.x, w.y]);
                    const n = 5, seed = Math.floor(t * 18) + s * 7;
                    for (let i = 1; i <= n; i++) {
                        const u = i / n, j = i < n ? (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453 % 1) * 5 * hot : 0;
                        path.push(['line',w.x + (tip.x - w.x) * u - sa * j, w.y + (tip.y - w.y) * u + ca * j]);
                    }
                    scene.paint(path,{stroke:scene.style.stroke});
                }
                // tells: the lance line it'll dive along, the beam it's charging
                if (tl && tl.kind === 'lance') {
                    scene.style.opacity = 0.3 + 0.6 * k; scene.style.stroke = '#c9a2ff'; scene.style.stroke_width = 1 + 3 * k; scene.style.dash=[8, 6];
                    path=[]; path.push(['move',state.x, state.y]); path.push(['line',state.x + Math.cos(tl.a) * DRONE.LANCE.DIST, state.y + Math.sin(tl.a) * DRONE.LANCE.DIST]); scene.paint(path,{stroke:scene.style.stroke}); scene.style.dash=[];
                } else if (tl && tl.kind === 'beam') {
                    const R = DRONE.BEAM.RANGE;
                    scene.style.opacity = 0.15 + 0.5 * k; scene.style.stroke = '#d8b8ff'; scene.style.stroke_width = 0.6 + 2.4 * k;
                    path=[]; path.push(['move',e.x, e.y]); path.push(['line',e.x + Math.cos(tl.a) * R, e.y + Math.sin(tl.a) * R]); scene.paint(path,{stroke:scene.style.stroke});
                } else if (tl && tl.kind === 'grapple') {
                    const tip = W(58, 11); scene.style.opacity = 0.4 + 0.5 * k; glow(scene, tip.x, tip.y, (10 + 12 * k) * S, '200, 150, 255', 0.3);
                }
                // the tether: its lance flung out on a crackling line
                const T = state._tether;
                if (T) {
                    const w = W(28, 25);
                    scene.style.opacity = 0.9; scene.style.stroke = '#cfa8ff'; scene.style.stroke_width = 1.5;
                    path=[]; path.push(['move',w.x, w.y]);
                    const n = 8, dx = T.x - w.x, dy = T.y - w.y, L = Math.hypot(dx, dy) || 1;
                    for (let i = 1; i <= n; i++) { const u = i / n, j = i < n ? Math.sin(t * 40 + i * 2.1) * 3 : 0; path.push(['line',w.x + dx * u - dy / L * j, w.y + dy * u + dx / L * j]); }
                    scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.opacity = 0.8; glow(scene, T.x, T.y, T.state === 'held' ? 26 : 14, '190, 130, 255', 0.3);
                }
                // the beam itself: a white-violet line through everything
                const B = state._beam;
                if (B && now - B.t0 < DRONE.BEAM.FIRE) {
                    const u = (now - B.t0) / DRONE.BEAM.FIRE;
                    for (const [w, a] of [[14, 0.18], [6, 0.45], [2, 0.95]]) {
                        scene.style.opacity = a * (1 - u); scene.style.stroke = w > 4 ? '#a469ff' : '#ffffff'; scene.style.stroke_width = w;
                        path=[]; path.push(['move',B.x0, B.y0 - lift]); path.push(['line',B.x1, B.y1]); scene.paint(path,{stroke:scene.style.stroke});
                    }
                }
                scene.leave();
            }
export function createDronePackets(state,{pass='body'}={}){if(!['body','lights'].includes(pass))throw new TypeError('Unknown Drone art pass');const scene=new artScene();(pass==='lights'?drawLights:draw)(state,scene);return scene.finish();}

export function dronePresentation(entity,blend=1){const pose=entity.getRenderState(blend),action=entity.data.ability_action_state,state=entity.drone_state,clock=entity.data.weapon_state?.elapsed??0,definition=action?entity.physics_system.elements.asset_library.getResource('df:abilities').data[action.ability_id]:null,projectile=action?.projectile_id?entity.physics_system.elements.fetchEntity(action.projectile_id):null,target=action?.target_id?entity.physics_system.elements.fetchEntity(action.target_id):null,end=(target??projectile)?.getRenderState(blend).position;
return Object.assign({},{x:pose.position[0],y:pose.position[1],angle:pose.rotation,dead:entity.dead,kind:entity.data.drone_kind,alt:state.alt,hoverOffset:entity.data.actor_state.elapsed*4.8,_seed:entity.data.appearance_seed,state:entity.state,invincibleTimer:Math.round(entity.data.actor_state.invulnerable_remaining*60),render_time:entity.data.actor_state.elapsed,render_clock:clock,_stateT:action?.phase_started_at??clock,_tell:action?.phase==='tell'?{kind:action.ability_id.replace('drone_',''),secs:definition.tell_seconds,lock:definition.lock_seconds,a:action.heading}:null,_tether:end?{x:end[0],y:end[1],state:target?'held':'out'}:null,_beam:action?.beam?{x0:action.beam.from[0],y0:action.beam.from[1],x1:action.beam.to[0],y1:action.beam.to[1],t0:action.phase_started_at}:null});}
