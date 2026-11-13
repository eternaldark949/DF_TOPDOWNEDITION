import {artScene,circle,ellipse,radial,linear,groundShadow} from '../../engine/basement/rendering/index.mjs';
import {velvetCatAnimation,velvetFrame,velvetLegGait,velvetJoints,VELVET_LEG_JOINTS} from './velvet-cat-animation.mjs';
import {VELVET_CAT_PALETTES,VELVET_T,VELVET_PROFILES,VELVET_TAIL_SEGS} from '../data/game-velvet-appearance.mjs';
/** Renderer-neutral feline geometry/material packets over detached animation state. */

export function createVelvetCatArt(state){const scene=new artScene(),eyes=[];let path=[];
                if (!state.visible || state.inCar) return {body:[],eyes:[]};

                // A missing/unrecognized selector uses the default coat.
                const C = Object.prototype.hasOwnProperty.call(VELVET_CAT_PALETTES, state.coatPalette)
                    ? VELVET_CAT_PALETTES[state.coatPalette].colors : VELVET_CAT_PALETTES.default.colors;
                const P = state._poses || { sit: 0, loaf: 0, sleep: 0, stretch: 0, groom: 0 };
                const moving = (state.animationSpeed || 0) > 0.05;
                const g = velvetCatAnimation._gaitParams.call(state);
                const TAU = Math.PI * 2, frac = v => v - Math.floor(v);
                const stand = Math.max(0, 1 - P.sit - P.loaf - P.sleep - P.stretch);
                const breathe = 1 + Math.sin(state._breath || 0) * 0.025 * (1 - stand);

                // Ground contact is independent of body facing, gait and tail movement.
                groundShadow(scene, state.x, state.y, P.sleep > 0.5 ? 13 : 15, P.sleep > 0.5 ? 11 : 9);
                scene.enter();
                scene.place({position:[state.x, state.y]});
                scene.place({rotation:state.angle});
                scene.style.line_cap = 'round';
                scene.style.line_join = 'round';

                // The world's light (upper left) in her own frame, so her shading doesn't turn with her.
                const lx = Math.cos(-state.angle) * -0.6 - Math.sin(-state.angle) * -0.8;
                const ly = Math.sin(-state.angle) * -0.6 + Math.cos(-state.angle) * -0.8;

                // --- Spine: the rig's spine joints, rump (spine_0) to neck (spine_12), the neck facing +X ---
                const J = state.joints ?? velvetJoints(state), f = velvetFrame(state), width = f.width, S = 12;
                const pts = Array.from({ length: S + 1 }, (_, i) => { const j = J['spine_' + i]; return { x: j.position[0], y: j.position[1], th: j.rotation }; });
                // A curled spine turns past a half circle; unwrap the joints' angles so they run on smoothly.
                for (let i = 1; i <= S; i++) { const d = pts[i].th - pts[i - 1].th; pts[i].th = pts[i - 1].th + Math.atan2(Math.sin(d), Math.cos(d)); }
                const at = (t) => {
                    const s = Math.max(0, Math.min(S - 1e-6, t * S)), i = Math.floor(s), u = s - i;
                    const a = pts[i], b = pts[Math.min(S, i + 1)];
                    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, th: a.th + (b.th - a.th) * u };
                };
                // Shoulder blades and hips roll up on the side of the leg that's bearing weight.
                const roll = (j) => moving && f.legU(j) < g.duty ? Math.sin(f.legU(j) / g.duty * Math.PI) * 0.7 * stand : 0;
                const left = [], right = [];
                for (let i = 0; i <= S; i++) {
                    const p = pts[i], t = i / S, w = width(t), nx = -Math.sin(p.th), ny = Math.cos(p.th);
                    const sh = Math.max(0, 1 - Math.abs(t - .74) / .14), hp = Math.max(0, 1 - Math.abs(t - .2) / .14);
                    const wl = w + sh * roll(1) + hp * roll(0), wr = w + sh * roll(3) + hp * roll(2);
                    left.push({ x: p.x - nx * wl, y: p.y - ny * wl });
                    right.push({ x: p.x + nx * wr, y: p.y + ny * wr });
                }
                const rump = pts[0], neck = pts[S];
                const ring = [{ x: rump.x - Math.cos(rump.th) * width(0) * .9, y: rump.y - Math.sin(rump.th) * width(0) * .9 },
                    ...left, { x: neck.x + 1.6, y: neck.y }, ...right.reverse()];
                // A closed curve through the midpoints of a point ring (open: starts and ends on its first and last points).
                const smoothRing = (path, ring, open = false) => {
                    const n = ring.length, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                    const m0 = open ? ring[0] : mid(ring[n - 1], ring[0]);
                    path.push(['move',m0.x, m0.y]);
                    for (let i = open ? 1 : 0; i < n; i++) { const a = ring[i], m = mid(a, ring[(i + 1) % n]); path.push(['quadratic',a.x, a.y, m.x, m.y]); }
                    path.push(['close']);
                };
                const outline = [];
                smoothRing(outline, ring);

                // --- Legs: from the spine to the rig's paw joints ---
                const legs = VELVET_LEG_JOINTS.map((joint, j) => {
                    const hind = j % 2 === 0, sideY = j < 2 ? -1 : 1, a = at(hind ? .2 : .78), w = width(hind ? .2 : .78), nx = -Math.sin(a.th), ny = Math.cos(a.th);
                    const { lift, vis } = velvetLegGait(f, j), p = J[joint];
                    return { hind, sideY, ax: a.x + nx * w * .45 * sideY, ay: a.y + ny * w * .45 * sideY, fx: p.position[0], fy: p.position[1], lift, vis, th: p.rotation };
                });
                const paw = (x, y, th, s, raised) => {
                    scene.enter(); scene.place({position:[x, y]}); scene.place({rotation:th}); scene.place({scale:[s, s]});
                    scene.style.fill = raised ? C.raisedPaw : C.pawTop;
                    path=[]; path.push(ellipse(0, 0, 2.5, 1.85, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                    scene.style.fill = C.pawShadow; path=[]; path.push(ellipse(-.5, .35, 1.9, 1.3, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                    scene.style.fill = raised ? C.raisedPaw : C.pawTop; path=[]; path.push(ellipse(.25, -.15, 2.1, 1.5, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                    // three toe creases at the front of the foot
                    scene.style.stroke = C.pawShadow; scene.style.stroke_width = .35; path=[];
                    path.push(['move',1.5, -.8]); path.push(['line',2.3, -.75]); path.push(['move',1.7, 0]); path.push(['line',2.5, 0]); path.push(['move',1.5, .8]); path.push(['line',2.3, .75]);
                    scene.paint(path,{stroke:scene.style.stroke}); scene.leave();
                };

                // --- Tail: the rig's tail joints from the rump, foreshortened as it rises ---
                const tail = Array.from({ length: VELVET_TAIL_SEGS + 1 }, (_, i) => ({ x: J['tail_' + i].position[0], y: J['tail_' + i].position[1] }));
                // One tapering filled shape (no overlapping strokes to bead at the joints), rounded at the tip.
                const tailPath = [];
                {
                    const l = [], r = [], n = tail.length;
                    for (let i = 0; i < n; i++) {
                        const a = tail[Math.max(0, i - 1)], b = tail[Math.min(n - 1, i + 1)];
                        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
                        const w = 1.85 - (i / (n - 1)) * .95;
                        l.push({ x: tail[i].x + nx * w, y: tail[i].y + ny * w }); r.push({ x: tail[i].x - nx * w, y: tail[i].y - ny * w });
                    }
                    const e = tail[n - 1], q = tail[n - 2], d = Math.hypot(e.x - q.x, e.y - q.y) || 1;
                    smoothRing(tailPath, [...l, { x: e.x + (e.x - q.x) / d * 1.1, y: e.y + (e.y - q.y) / d * 1.1 }, ...r.reverse()], true);
                }

                // Soft cast shadow of the whole silhouette, away from the light; a raised tail throws its own further off.
                scene.enter();
                scene.style.opacity = 0.22;
                scene.place({position:[-lx * 1.8, -ly * 1.8]});
                scene.style.fill = '#000'; scene.paint(outline,{fill:scene.style.fill});
                scene.place({position:[-lx * (state._tailLift || 0) * 5, -ly * (state._tailLift || 0) * 5]}); scene.paint(tailPath,{fill:scene.style.fill});
                scene.leave();

                // Tail, then legs, under the body.
                const drawTail = () => {
                    const tailCoat = linear([tail[0].x,tail[0].y],[tail[tail.length - 1].x,tail[tail.length - 1].y],[]);
                    tailCoat.stops.push([0, C.tailBase]); tailCoat.stops.push([.5, C.tailMiddle]); tailCoat.stops.push([1, C.tailTip]);
                    scene.style.fill = tailCoat; scene.paint(tailPath,{fill:scene.style.fill});
                    scene.style.stroke = 'rgba(8,3,12,.5)'; scene.style.stroke_width = .5; scene.paint(tailPath,{stroke:scene.style.stroke});
                    scene.style.stroke = C.tailNap; scene.style.stroke_width = .9; path=[];
                    path.push(['move',tail[0].x + lx * .7, tail[0].y + ly * .7]);
                    for (let i = 1; i < tail.length - 1; i++) path.push(['line',tail[i].x + lx * .7, tail[i].y + ly * .7]);
                    scene.paint(path,{stroke:scene.style.stroke});
                };
                // Trailing, the tail starts under the rump; wrapped round her at rest it lies over the haunch.
                const tailOver = P.sit + P.loaf + P.sleep > 0.5;
                if (!tailOver) drawTail();

                for (const leg of legs) {
                    if (leg.vis < 0.05) continue;
                    scene.style.opacity = Math.min(1, leg.vis);
                    scene.style.stroke = C.legShade; scene.style.stroke_width = leg.hind ? 3.6 : 3.1;
                    path=[]; path.push(['move',leg.ax, leg.ay]); path.push(['line',leg.fx, leg.fy]); scene.paint(path,{stroke:scene.style.stroke});
                    paw(leg.fx, leg.fy, leg.th, (leg.hind ? 1.05 : .95) * (1 + leg.lift * .14), leg.lift > .3);
                }
                scene.style.opacity = 1;

                // --- Body ---
                const coat = linear([lx * 7,ly * 7],[-lx * 7,-ly * 7],[]);
                coat.stops.push([0, C.bodyTop]);
                coat.stops.push([.4, C.bodyMiddle]);
                coat.stops.push([.75, C.bodyShade]);
                coat.stops.push([1, C.bodyDeep]);
                scene.style.fill = coat; scene.paint(outline,{fill:scene.style.fill});
                scene.enter(); scene.clip(outline);
                // Velvet sheen down the spine, rounded masses over the haunches and shoulders
                scene.style.stroke = C.napHighlight; scene.style.stroke_width = 4.2; path=[];
                for (let i = 1; i < S; i++) { const p = pts[i]; i === 1 ? path.push(['move',p.x + lx, p.y + ly]) : path.push(['line',p.x + lx, p.y + ly]); }
                scene.paint(path,{stroke:scene.style.stroke});
                for (const t of [.2, .74]) {
                    const p = at(t), r = width(t) * 1.05;
                    const hl = radial([p.x + lx * 2.2,p.y + ly * 2.2],0,[p.x + lx * 2.2,p.y + ly * 2.2],r,[]);
                    hl.stops.push([0, C.bodyRim]); hl.stops.push([1, C.napEnd]);
                    scene.style.fill = hl; path=[]; path.push(circle(p.x + lx * 2.2, p.y + ly * 2.2, r, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                }
                // Fur lies back from the head: short strands scattered without a visible pattern or RNG
                scene.style.stroke = C.furStroke; scene.style.stroke_width = .3; path=[];
                for (let i = 0; i < 26; i++) {
                    const t = .06 + ((i * .61803398875 + .19) % 1) * .9, p = at(t), w = width(t);
                    const o = (((i * .41421356237 + .36) % 1) - .5) * 1.7 * w;
                    const x = p.x - Math.sin(p.th) * o, y = p.y + Math.cos(p.th) * o, l = 1 + (Math.sin(i * 2.41) + 1) * .35;
                    path.push(['move',x, y]); path.push(['line',x - Math.cos(p.th) * l, y - Math.sin(p.th) * l]);
                }
                scene.paint(path,{stroke:scene.style.stroke});
                scene.leave();
                scene.style.stroke = 'rgba(8,3,12,.5)'; scene.style.stroke_width = .55; scene.paint(outline,{stroke:scene.style.stroke});
                if (tailOver) drawTail();

                // --- Head ---
                const headScale = J.head.scale[1], [hx, hy] = J.head.position, headYaw = J.head.rotation;
                // Return eye anchors for the later glow pass; presentation never writes to the actor.
                {
                    const yaw = headYaw, ca = Math.cos(state.angle), sa = Math.sin(state.angle);

                    for (let e = 0; e < 2; e++) {
                        const ex = 2.9 * headScale, ey = (e ? 1 : -1) * 2.05 * headScale;
                        const lx2 = hx + ex * Math.cos(yaw) - ey * Math.sin(yaw), ly2 = hy + ex * Math.sin(yaw) + ey * Math.cos(yaw);
                        eyes.push({x:state.x + lx2 * ca - ly2 * sa,y:state.y + lx2 * sa + ly2 * ca});
                    }
                }
                scene.enter();
                scene.place({position:[hx, hy]}); scene.place({rotation:headYaw}); scene.place({scale:[headScale, headScale]});
                // the head shades the shoulders under it
                scene.style.fill = 'rgba(0,0,0,.2)'; path=[]; path.push(ellipse(-lx * 1.4, -ly * 1.4, 5.2, 5, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                const skull = [];
                skull.push(['move',-4.3, 0]);
                skull.push(['cubic',-4.3, -3.5, -2.2, -5, .6, -4.95]);
                skull.push(['cubic',2.9, -4.9, 4.2, -3.1, 5.1, -1.85]);
                skull.push(['quadratic',6.1, -1, 6.1, 0]);
                skull.push(['quadratic',6.1, 1, 5.1, 1.85]);
                skull.push(['cubic',4.2, 3.1, 2.9, 4.9, .6, 4.95]);
                skull.push(['cubic',-2.2, 5, -4.3, 3.5, -4.3, 0]);
                skull.push(['close']);
                const hlx = Math.cos(-headYaw) * lx - Math.sin(-headYaw) * ly;
                const hly = Math.sin(-headYaw) * lx + Math.cos(-headYaw) * ly;
                const face = radial([hlx * 2 + .5,hly * 2],.5,[.5,0],6.5,[]);
                face.stops.push([0, C.headTop]); face.stops.push([.55, C.headMiddle]); face.stops.push([1, C.headShadow]);
                scene.style.fill = face; scene.paint(skull,{fill:scene.style.fill});
                scene.style.stroke = 'rgba(8,3,12,.5)'; scene.style.stroke_width = .5; scene.paint(skull,{stroke:scene.style.stroke});
                // cheek tufts
                scene.style.stroke = C.cheekFur; scene.style.stroke_width = .45; path=[];
                for (const sd of [-1, 1]) {
                    path.push(['move',1.2, sd * 4.6]); path.push(['line',.2, sd * 5.4]);
                    path.push(['move',2.4, sd * 4.1]); path.push(['line',1.6, sd * 5.0]);
                }
                scene.paint(path,{stroke:scene.style.stroke});
                // Eyes on the front of the face: almond, slit pupils, lids that close from above
                const blink = state._blink || 0;
                for (const sd of [-1, 1]) {
                    scene.enter(); scene.place({position:[2.9, sd * 2.05]}); scene.place({rotation:sd * .38});
                    const open = 1 - blink;
                    if (open < .12) {
                        scene.style.stroke = 'rgba(20,10,26,.9)'; scene.style.stroke_width = .5;
                        path=[]; path.push(['move',-1.3, 0]); path.push(['quadratic',0, .5 * sd, 1.3, 0]); scene.paint(path,{stroke:scene.style.stroke});
                    } else {
                        path=[]; path.push(['move',-1.5, 0]); path.push(['quadratic',0, -1 * open, 1.5, 0]); path.push(['quadratic',0, 1 * open, -1.5, 0]);
                        scene.style.fill = '#ac7fc4'; scene.paint(path,{fill:scene.style.fill}); scene.style.stroke = '#120918'; scene.style.stroke_width = .42; scene.paint(path,{stroke:scene.style.stroke});
                        scene.enter(); scene.clip(path);
                        scene.style.fill = '#170d20'; path=[]; path.push(ellipse(.15, 0, .22 + (state._pupil || .5) * .5, .9, 0, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                        scene.style.fill = '#efe2f3'; path=[]; path.push(circle(-.45, -.28 * sd, .28, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                        scene.leave();
                    }
                    scene.leave();
                }
                // Muzzle pads, nose, mouth line
                scene.style.fill = '#3c2540'; path=[];
                path.push(ellipse(4.6, -1.05, 1.3, 1.15, -.2, 0, TAU)); path.push(ellipse(4.6, 1.05, 1.3, 1.15, .2, 0, TAU)); scene.paint(path,{fill:scene.style.fill});
                scene.style.fill = '#b38c9c'; path=[]; path.push(['move',6.25, 0]); path.push(['line',5.3, -.7]); path.push(['line',5.3, .7]); path.push(['close']); scene.paint(path,{fill:scene.style.fill});
                // Whiskers sweep forward when she's alert, droop sideways at rest
                const fwd = moving ? .55 : P.sleep > .5 ? -.25 : P.sit > .5 ? .1 : .3;
                scene.style.stroke = 'rgba(214,196,226,.38)'; scene.style.stroke_width = .28; path=[];
                for (const sd of [-1, 1]) for (let w = 0; w < 3; w++) {
                    const a0 = sd * (1.25 - w * .28 - fwd), r = 6.5 - w * .4;
                    path.push(['move',4.8, sd * 1.4]); path.push(['quadratic',4.8 + Math.cos(a0) * r * .5, sd * 1.4 + Math.sin(a0) * r * .5, 4.8 + Math.cos(a0 + sd * .25) * r, sd * 1.4 + Math.sin(a0 + sd * .25) * r]);
                }
                scene.paint(path,{stroke:scene.style.stroke});
                // Ears stand above the skull at its back corners: seen from above, triangles opening forward
                for (const sd of [-1, 1]) {
                    const ear = J[sd < 0 ? 'ear_l' : 'ear_r'], [ex0, ey0] = [ear.position[0] - hx, ear.position[1] - hy], back = -headYaw;
                    // the ear's pose inside the head's frame (the head group already carries its position, turn and scale)
                    scene.enter(); scene.place({position:[(Math.cos(back) * ex0 - Math.sin(back) * ey0) / headScale, (Math.sin(back) * ex0 + Math.cos(back) * ey0) / headScale]}); scene.place({rotation:ear.rotation - headYaw});
                    // a cup of fur: the back of the ear, then the pink inside showing at its open front
                    scene.style.fill = C.earBase; path=[];
                    path.push(['move',-2.5, -sd * .5]); path.push(['quadratic',-2.9, sd * 2, -2.6, sd * 3.9]);
                    path.push(['quadratic',.2, sd * 2.2, 1.9, sd * .1]); path.push(['quadratic',-.2, -sd * .9, -2.5, -sd * .5]); path.push(['close']); scene.paint(path,{fill:scene.style.fill});
                    scene.style.stroke = 'rgba(8,3,12,.55)'; scene.style.stroke_width = .4; scene.paint(path,{stroke:scene.style.stroke});
                    scene.style.fill = '#5e3150'; path=[];
                    path.push(['move',-1.3, sd * .35]); path.push(['quadratic',-1.9, sd * 2, -2.2, sd * 3.2]); path.push(['quadratic',-.2, sd * 1.9, 1.2, sd * .35]); path.push(['close']); scene.paint(path,{fill:scene.style.fill});
                    scene.style.stroke = C.earRim; scene.style.stroke_width = .35; path=[]; path.push(['move',-1.6, sd * .6]); path.push(['quadratic',-2.1, sd * 2, -2.3, sd * 3.1]); scene.paint(path,{stroke:scene.style.stroke});
                    scene.leave();
                }
                scene.leave();

                // Grooming: a fore paw lifts to the mouth for a few licks, then wipes back over the ear.
                if (P.groom > 0.5) {
                    const ph = state._groomPhase || 0, wipe = Math.max(0, Math.sin(ph * .35)) ** 2, lick = Math.sin(ph * 3);
                    const yaw = headYaw;
                    const mx = hx + Math.cos(yaw) * 4.2 - Math.sin(yaw) * -2.2, my = hy + Math.sin(yaw) * 4.2 + Math.cos(yaw) * -2.2;
                    const ex = hx - 1, ey = hy - 4.5;
                    const px2 = mx + (ex - mx) * wipe, py2 = my + (ey - my) * wipe + lick * .25 * (1 - wipe);
                    const sh = legs[1];
                    scene.style.stroke = C.groomArm; scene.style.stroke_width = 3;
                    path=[]; path.push(['move',sh.ax, sh.ay]); path.push(['quadratic',neck.x + 2, neck.y - 4, px2, py2]); scene.paint(path,{stroke:scene.style.stroke});
                    paw(px2, py2, yaw + Math.PI * .25, .85, true);
                    if (lick > .4 && wipe < .2) {
                        scene.style.stroke = '#b27f97'; scene.style.stroke_width = .8;
                        path=[]; path.push(['move',mx + 1.2, my + 1.6]); path.push(['line',mx + .6, my + .9]); scene.paint(path,{stroke:scene.style.stroke});
                    }
                }
                scene.leave();

return {body:scene.finish(),eyes};}

export function createVelvetEyePackets(state,{eyes,darkness=.8}={}){const scene=new artScene();let path=[];
                if (!state.visible || state.inCar) return [];
                const shine = Math.max(0, Math.min(1, (darkness - 0.25) / 0.45)) * (1 - (state._blink || 0));
                if (shine < 0.03) return [];
                // brighter as she turns her face toward the light; a lowered head (grooming) dims it
                const a = shine * (0.8 + 0.2 * Math.cos((state._headYaw || 0) * 2)) * (1 - ((state._poses && state._poses.groom) || 0) * 0.5);
                scene.enter();
                scene.style.blend = 'add';
                for (const e of eyes??createVelvetCatArt(state).eyes) {
                    const g = radial([e.x,e.y],0,[e.x,e.y],3.6,[]);
                    g.stops.push([0, `rgba(236,222,255,${0.95 * a})`]);
                    g.stops.push([0.25, `rgba(190,150,255,${0.55 * a})`]);
                    g.stops.push([1, 'rgba(120,70,220,0)']);
                    scene.style.fill = g; path=[]; path.push(circle(e.x, e.y, 3.6, 0, Math.PI * 2)); scene.paint(path,{fill:scene.style.fill});
                }
                scene.leave();

return scene.finish();}
export function createVelvetCatPackets(state,{pass='body',darkness=.8}={}){if(!['body','eyes'].includes(pass))throw new TypeError('Unknown Velvet art pass');return pass==='eyes'?createVelvetEyePackets(state,{darkness}):createVelvetCatArt(state).body;}
