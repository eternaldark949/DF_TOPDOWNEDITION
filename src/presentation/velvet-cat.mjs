import {VELVET_CAT_PALETTES,VELVET_T,VELVET_PROFILES,VELVET_GAITS,VELVET_TAIL_SEGS} from '../directory/game-velvet-appearance.mjs';
/** Cosmetic springs and retained Canvas artwork. No body ownership or movement. */
export const velvetCatAppearance={
_random() {
                let n = this._randomSeed;
                n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
                this._randomSeed = n;
                return (n >>> 0) / 4294967296;
            },
_restBehavior() {
                if (this.state === 'sitting') return 'sit';
                if (this.state === 'sleeping') return 'sleep';
                return this.state === 'idle' ? this.idleBehavior : null;
            },
_animate(player, dt, moved, prevAngle, blocked, dist) {
                const k = (rate) => Math.min(1, rate * dt);
                const spd = this.animationSpeed;
                const turned = Math.atan2(Math.sin(this.angle - prevAngle), Math.cos(this.angle - prevAngle));
                // Gait: walk under 3 px/tick, trot to 5, gallop above; the stride sets how far a cycle carries her.
                const gaitTarget = spd > 5 ? 2 : spd > 3 ? 1 : 0;
                if (moved) this._gaitMix += (gaitTarget - this._gaitMix) * k(0.08);
                const g = this._gaitParams();
                // Phase follows distance actually travelled: blocked cats never run in place.
                this.walkPhase += moved * Math.PI * 2 * g.duty / g.stride;
                this.tailPhase += (blocked ? 0.16 : moved ? 0.05 : 0.025) * dt;
                this._breath += dt * 0.06;
                // The spine bends into a turn: the chest leads, the hips follow.
                const bendTarget = Math.max(-0.9, Math.min(0.9, turned / dt * 7));
                this._bend += (bendTarget - this._bend) * k(0.18);

                // Rest poses ease in slowly (she settles) and out quickly (she gets up).
                const rest = moved ? null : this._restBehavior();
                const P = this._poses;
                for (const name of ['sit', 'loaf', 'sleep', 'stretch', 'groom']) {
                    const on = rest === name || (name === 'sit' && (rest === 'groom' || rest === 'look'));
                    P[name] += ((on ? 1 : 0) - P[name]) * k(on ? 0.07 : 0.2);
                }
                if (rest === 'groom') this._groomPhase += dt * 0.07;

                // Tail: a happy walk carries it high with the tip hooked; a run streams it level; sitting and
                // sleeping wrap it round her; a blocked route lashes it. Turns kick it the other way (follow-through).
                const walking = spd > 0.05 && this._gaitMix < 1.5;
                const liftTarget = blocked ? 0.25 : spd > 0.05 ? (walking ? 0.78 - this._gaitMix * 0.35 : 0.08) : 0.3 * (1 - P.sleep - P.loaf);
                this._tailLift += (liftTarget - this._tailLift) * k(0.05);
                if (this._flick > 0) this._flick = Math.max(0, this._flick - dt * 0.04);
                else if (!moved && this._random() < 0.006 * dt) this._flick = 1;
                const N = VELVET_TAIL_SEGS, side = this._curlSide;
                const wrap = P.sit * 0.2 + P.loaf * 0.24 + P.sleep * 0.44;
                const amp = blocked ? 0.24 : spd > 0.05 ? 0.07 : 0.035 * (1 - P.sleep);
                for (let i = 0; i < N; i++) {
                    const f = i / (N - 1);
                    let target = Math.sin(this.tailPhase * (blocked ? 1.6 : 1) - i * 0.55) * amp * (0.4 + f);
                    target += side * wrap;
                    if (i >= N - 3) target += side * (this._tailLift * 0.45 + Math.sin(this._flick * Math.PI) * 0.7);
                    this._tailVel[i] -= turned * (i ? 0.12 : 0.7);
                    this._tailVel[i] = this._tailVel[i] * Math.pow(0.8, dt) + (target - this._tail[i]) * (0.1 - f * 0.04) * dt;
                    this._tail[i] += this._tailVel[i] * dt;
                    this._tail[i] = Math.max(-1.2, Math.min(1.2, this._tail[i]));
                }

                // Head: into the turn while moving; at rest she watches the player, glancing away now and then.
                this._lookTimer -= dt;
                if (this._lookTimer <= 0) {
                    const toPlayer = Math.atan2(player.y - this.y, player.x - this.x) - this.angle;
                    const watch = rest !== 'look' && this._random() < 0.55;
                    this._lookYaw = watch && dist > 8 ? Math.atan2(Math.sin(toPlayer), Math.cos(toPlayer)) : (this._random() - 0.5) * 2.2;
                    this._lookTimer = (rest === 'look' ? 35 : 80) + this._random() * 120;
                    // An ear swivels after a sound now and then.
                    if (this._random() < 0.45) this._earVel[this._random() < 0.5 ? 0 : 1] += 0.35;
                }
                let yaw = moved ? Math.max(-0.5, Math.min(0.5, this._bend * 0.7)) : rest === 'sleep' ? side * 1.3
                    : rest === 'groom' ? -0.35 : rest === 'stretch' ? 0 : this._lookYaw;
                yaw = Math.max(-1.25, Math.min(1.25, yaw));
                this._headYaw += (yaw - this._headYaw) * k(moved ? 0.12 : 0.16);
                // Ears: pricked forward when moving or watching, eased outward at rest, flat back when blocked.
                const earRest = blocked ? 0.85 : moved ? -0.05 : rest === 'sleep' ? 0.45 : rest === 'look' ? -0.1 : 0.18;
                for (let e = 0; e < 2; e++) {
                    const lean = rest === 'look' ? (e ? 1 : -1) * Math.max(-0.4, Math.min(0.4, this._headYaw * 0.4)) : 0;
                    this._earVel[e] = this._earVel[e] * Math.pow(0.75, dt) + (earRest + lean - this._ears[e]) * 0.12 * dt;
                    this._ears[e] += this._earVel[e] * dt;
                }
                // Eyes: quick blinks, slow blinks (a cat's "I trust you") while sitting near the player, shut in sleep.
                this._pupil += ((this._dash || blocked ? 0.95 : moved ? 0.6 : 0.35) - this._pupil) * k(0.05);
                if (this._blinkT >= 0) {
                    this._blinkT += dt / this._blinkLen;
                    if (this._blinkT >= 1) { this._blinkT = -1; this._blinkWait = 90 + this._random() * 200; }
                } else if ((this._blinkWait -= dt) <= 0) {
                    const slow = !moved && P.sit > 0.6 && dist < 140 && this._random() < 0.5;
                    this._blinkT = 0; this._blinkLen = slow ? 110 : 9;
                }
                const b = this._blinkT < 0 ? 0 : this._blinkLen > 20
                    ? Math.min(1, Math.sin(this._blinkT * Math.PI) * 1.6)   // eases shut, holds, eases open
                    : Math.sin(this._blinkT * Math.PI);
                this._blink = Math.max(b, P.sleep > 0.5 ? 1 : 0);
            },
drawEyeShine(ctx, darkness) {
                if (!this.visible || this.inCar || !this._eyeWorld) return;
                const shine = Math.max(0, Math.min(1, (darkness - 0.25) / 0.45)) * (1 - (this._blink || 0));
                if (shine < 0.03) return;
                // brighter as she turns her face toward the light; a lowered head (grooming) dims it
                const a = shine * (0.8 + 0.2 * Math.cos((this._headYaw || 0) * 2)) * (1 - ((this._poses && this._poses.groom) || 0) * 0.5);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (const e of this._eyeWorld) {
                    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 3.6);
                    g.addColorStop(0, `rgba(236,222,255,${0.95 * a})`);
                    g.addColorStop(0.25, `rgba(190,150,255,${0.55 * a})`);
                    g.addColorStop(1, 'rgba(120,70,220,0)');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, 3.6, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            },
_gaitParams() {
                const gi = Math.max(0, Math.min(2, this._gaitMix || 0)), i0 = Math.min(1, Math.floor(gi)), u = gi - i0;
                const a = VELVET_GAITS[i0], b = VELVET_GAITS[i0 + 1], mix = (p, q) => p + (q - p) * u;
                return { off: a.off.map((o, i) => mix(o, b.off[i])), duty: mix(a.duty, b.duty), stride: mix(a.stride, b.stride), gallop: Math.max(0, gi - 1) };
            },
draw(ctx) {
                if (!this.visible || this.inCar) return;

                // A missing/unrecognized selector uses the default coat.
                const C = Object.prototype.hasOwnProperty.call(VELVET_CAT_PALETTES, this.coatPalette)
                    ? VELVET_CAT_PALETTES[this.coatPalette].colors : VELVET_CAT_PALETTES.default.colors;
                const P = this._poses || { sit: 0, loaf: 0, sleep: 0, stretch: 0, groom: 0 };
                const moving = (this.animationSpeed || 0) > 0.05;
                const g = this._gaitParams();
                const TAU = Math.PI * 2, frac = v => v - Math.floor(v);
                const stand = Math.max(0, 1 - P.sit - P.loaf - P.sleep - P.stretch);
                const breathe = 1 + Math.sin(this._breath || 0) * 0.025 * (1 - stand);

                // Ground contact is independent of body facing, gait and tail movement.
                drawGroundContactShadow(ctx, this.x, this.y, P.sleep > 0.5 ? 13 : 15, P.sleep > 0.5 ? 11 : 9);
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowBlur = 0;
                // The world's light (upper left) in her own frame, so her shading doesn't turn with her.
                const lx = Math.cos(-this.angle) * -0.6 - Math.sin(-this.angle) * -0.8;
                const ly = Math.sin(-this.angle) * -0.6 + Math.cos(-this.angle) * -0.8;

                // --- Spine: an arc from rump (t = 0) to neck (t = 1), the neck facing +X ---
                const cyc = this.walkPhase / TAU;
                const flex = moving ? Math.sin((cyc + .3) * TAU) * g.gallop : 0;   // a galloping cat gathers and stretches
                const L = 23.5 * (1 - 0.36 * P.sit - 0.12 * P.loaf + 0.03 * P.sleep + 0.2 * P.stretch) * (1 + flex * 0.13);
                const bend = (this._bend || 0) * (1 - P.sleep) + P.sleep * 4.3 * (this._curlSide || 1);
                const S = 12, pts = [];
                let px = 0, py = 0;
                for (let i = S; i >= 0; i--) {
                    const t = i / S, th = bend * (t - 1);
                    pts[i] = { x: px, y: py, th };
                    px -= Math.cos(th) * L / S; py -= Math.sin(th) * L / S;
                }
                let cx = 0, cy = 0;
                for (const p of pts) { cx += p.x; cy += p.y; }
                cx = cx / pts.length - 1.5 - P.sit * 2; cy /= pts.length;
                for (const p of pts) { p.x -= cx; p.y -= cy; }
                const width = (t) => {
                    let j = 0; while (j < VELVET_T.length - 2 && t > VELVET_T[j + 1]) j++;
                    const u = (t - VELVET_T[j]) / (VELVET_T[j + 1] - VELVET_T[j]);
                    let w = 0;
                    for (const [name, wt] of [['stand', stand], ['sit', P.sit], ['loaf', P.loaf], ['sleep', P.sleep], ['stretch', P.stretch]]) {
                        if (wt <= 0) continue;
                        const pr = VELVET_PROFILES[name];
                        w += (pr[j] + (pr[j + 1] - pr[j]) * u) * wt;
                    }
                    return w * breathe;
                };
                const at = (t) => {
                    const f = Math.max(0, Math.min(S - 1e-6, t * S)), i = Math.floor(f), u = f - i;
                    const a = pts[i], b = pts[Math.min(S, i + 1)];
                    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, th: a.th + (b.th - a.th) * u };
                };
                // Shoulder blades and hips roll up on the side of the leg that's bearing weight.
                const legU = (j) => frac(cyc + g.off[j]);
                const roll = (j) => moving && legU(j) < g.duty ? Math.sin(legU(j) / g.duty * Math.PI) * 0.7 * stand : 0;
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
                    path.moveTo(m0.x, m0.y);
                    for (let i = open ? 1 : 0; i < n; i++) { const a = ring[i], m = mid(a, ring[(i + 1) % n]); path.quadraticCurveTo(a.x, a.y, m.x, m.y); }
                    path.closePath();
                };
                const outline = new Path2D();
                smoothRing(outline, ring);

                // --- Paw positions: gait, blended toward each rest pose ---
                const legs = [];
                for (let j = 0; j < 4; j++) {
                    const hind = j % 2 === 0, sideY = j < 2 ? -1 : 1;
                    const anchorT = hind ? .2 : .78, a = at(anchorT), w = width(anchorT);
                    const nx = -Math.sin(a.th), ny = Math.cos(a.th), ux = Math.cos(a.th), uy = Math.sin(a.th);
                    // gait: planted feet slide back under her, lifted feet swing forward
                    const u = legU(j);
                    let along = 0, lift = 0;
                    if (moving) {
                        if (u < g.duty) along = g.stride * (0.5 - u / g.duty);
                        else { const s = (u - g.duty) / (1 - g.duty); along = g.stride * (-0.5 + (s * s * (3 - 2 * s))); lift = Math.sin(s * Math.PI); }
                    }
                    const out = (hind ? 1 : 1.02) * w * (0.85 + lift * 0.12);
                    let fx = a.x + ux * ((hind ? -1.5 : 4.6) + along) + nx * out * sideY;
                    let fy = a.y + uy * ((hind ? -1.5 : 4.6) + along) + ny * out * sideY;
                    let vis = stand;
                    // sit: fore paws together before the chest, hind paws peeking at the haunches
                    const sx = hind ? pts[3].x + 3.5 : neck.x + 6.8, sy = hind ? pts[3].y + sideY * (width(.25) + .4) : neck.y + sideY * 2;
                    // stretch: fore paws reach far ahead
                    const tx = hind ? fx : neck.x + 12.5, ty = hind ? fy : neck.y + sideY * 3.3;
                    fx = fx * stand + sx * P.sit + tx * P.stretch + (hind ? pts[3].x : neck.x) * (P.loaf + P.sleep);
                    fy = fy * stand + sy * P.sit + ty * P.stretch + (hind ? pts[3].y : neck.y) * (P.loaf + P.sleep);
                    vis += P.sit + P.stretch;
                    const groomPaw = !hind && sideY < 0 && P.groom > 0.5;
                    legs.push({ hind, sideY, ax: a.x + nx * w * .45 * sideY, ay: a.y + ny * w * .45 * sideY, fx, fy, lift: lift * stand, vis: groomPaw ? 0 : vis, th: a.th });
                }
                const paw = (x, y, th, s, raised) => {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.scale(s, s);
                    ctx.fillStyle = raised ? C.raisedPaw : C.pawTop;
                    ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 1.85, 0, 0, TAU); ctx.fill();
                    ctx.fillStyle = C.pawShadow; ctx.beginPath(); ctx.ellipse(-.5, .35, 1.9, 1.3, 0, 0, TAU); ctx.fill();
                    ctx.fillStyle = raised ? C.raisedPaw : C.pawTop; ctx.beginPath(); ctx.ellipse(.25, -.15, 2.1, 1.5, 0, 0, TAU); ctx.fill();
                    // three toe creases at the front of the foot
                    ctx.strokeStyle = C.pawShadow; ctx.lineWidth = .35; ctx.beginPath();
                    ctx.moveTo(1.5, -.8); ctx.lineTo(2.3, -.75); ctx.moveTo(1.7, 0); ctx.lineTo(2.5, 0); ctx.moveTo(1.5, .8); ctx.lineTo(2.3, .75);
                    ctx.stroke(); ctx.restore();
                };

                // --- Tail: nine springy segments from the rump, foreshortened as it rises ---
                const tail = [];
                {
                    // Resting, it leaves the rump already turned along her side, to wrap round toward the fore paws.
                    let th = rump.th + Math.PI - (this._curlSide || 1) * (P.sit * 1.75 + P.loaf * 1.75 + P.sleep * 1.1), x = rump.x - Math.cos(rump.th) * width(0) * .6, y = rump.y - Math.sin(rump.th) * width(0) * .6;
                    tail.push({ x, y });
                    const lift = this._tailLift || 0;
                    for (let i = 0; i < VELVET_TAIL_SEGS; i++) {
                        th += -(this._tail ? this._tail[i] : 0);
                        const len = 3.4 * (1 - lift * (i < 5 ? .62 : .22)) * (1 - P.loaf * .12);
                        x += Math.cos(th) * len; y += Math.sin(th) * len;
                        tail.push({ x, y });
                    }
                }
                // One tapering filled shape (no overlapping strokes to bead at the joints), rounded at the tip.
                const tailPath = new Path2D();
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
                ctx.save();
                ctx.globalAlpha = 0.22;
                ctx.translate(-lx * 1.8, -ly * 1.8);
                ctx.fillStyle = '#000'; ctx.fill(outline);
                ctx.translate(-lx * (this._tailLift || 0) * 5, -ly * (this._tailLift || 0) * 5); ctx.fill(tailPath);
                ctx.restore();

                // Tail, then legs, under the body.
                const drawTail = () => {
                    const tailCoat = ctx.createLinearGradient(tail[0].x, tail[0].y, tail[tail.length - 1].x, tail[tail.length - 1].y);
                    tailCoat.addColorStop(0, C.tailBase); tailCoat.addColorStop(.5, C.tailMiddle); tailCoat.addColorStop(1, C.tailTip);
                    ctx.fillStyle = tailCoat; ctx.fill(tailPath);
                    ctx.strokeStyle = 'rgba(8,3,12,.5)'; ctx.lineWidth = .5; ctx.stroke(tailPath);
                    ctx.strokeStyle = C.tailNap; ctx.lineWidth = .9; ctx.beginPath();
                    ctx.moveTo(tail[0].x + lx * .7, tail[0].y + ly * .7);
                    for (let i = 1; i < tail.length - 1; i++) ctx.lineTo(tail[i].x + lx * .7, tail[i].y + ly * .7);
                    ctx.stroke();
                };
                // Trailing, the tail starts under the rump; wrapped round her at rest it lies over the haunch.
                const tailOver = P.sit + P.loaf + P.sleep > 0.5;
                if (!tailOver) drawTail();

                for (const leg of legs) {
                    if (leg.vis < 0.05) continue;
                    ctx.globalAlpha = Math.min(1, leg.vis);
                    ctx.strokeStyle = C.legShade; ctx.lineWidth = leg.hind ? 3.6 : 3.1;
                    ctx.beginPath(); ctx.moveTo(leg.ax, leg.ay); ctx.lineTo(leg.fx, leg.fy); ctx.stroke();
                    paw(leg.fx, leg.fy, leg.th, (leg.hind ? 1.05 : .95) * (1 + leg.lift * .14), leg.lift > .3);
                }
                ctx.globalAlpha = 1;

                // --- Body ---
                const coat = ctx.createLinearGradient(lx * 7, ly * 7, -lx * 7, -ly * 7);
                coat.addColorStop(0, C.bodyTop);
                coat.addColorStop(.4, C.bodyMiddle);
                coat.addColorStop(.75, C.bodyShade);
                coat.addColorStop(1, C.bodyDeep);
                ctx.fillStyle = coat; ctx.fill(outline);
                ctx.save(); ctx.clip(outline);
                // Velvet sheen down the spine, rounded masses over the haunches and shoulders
                ctx.strokeStyle = C.napHighlight; ctx.lineWidth = 4.2; ctx.beginPath();
                for (let i = 1; i < S; i++) { const p = pts[i]; i === 1 ? ctx.moveTo(p.x + lx, p.y + ly) : ctx.lineTo(p.x + lx, p.y + ly); }
                ctx.stroke();
                for (const t of [.2, .74]) {
                    const p = at(t), r = width(t) * 1.05;
                    const hl = ctx.createRadialGradient(p.x + lx * 2.2, p.y + ly * 2.2, 0, p.x + lx * 2.2, p.y + ly * 2.2, r);
                    hl.addColorStop(0, C.bodyRim); hl.addColorStop(1, C.napEnd);
                    ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(p.x + lx * 2.2, p.y + ly * 2.2, r, 0, TAU); ctx.fill();
                }
                // Fur lies back from the head: short strands scattered without a visible pattern or RNG
                ctx.strokeStyle = C.furStroke; ctx.lineWidth = .3; ctx.beginPath();
                for (let i = 0; i < 26; i++) {
                    const t = .06 + ((i * .61803398875 + .19) % 1) * .9, p = at(t), w = width(t);
                    const o = (((i * .41421356237 + .36) % 1) - .5) * 1.7 * w;
                    const x = p.x - Math.sin(p.th) * o, y = p.y + Math.cos(p.th) * o, l = 1 + (Math.sin(i * 2.41) + 1) * .35;
                    ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(p.th) * l, y - Math.sin(p.th) * l);
                }
                ctx.stroke();
                ctx.restore();
                ctx.strokeStyle = 'rgba(8,3,12,.5)'; ctx.lineWidth = .55; ctx.stroke(outline);
                if (tailOver) drawTail();

                // --- Head ---
                const headScale = 1 + P.sit * .07 - P.sleep * .04 - P.stretch * .05;
                const hx = neck.x + 2.6 - P.sit * 1.2 + P.stretch * 1.5, hy = neck.y;
                // Where her eyes are in the world, for the eyeshine drawn above the darkness (drawEyeShine)
                {
                    const yaw = this._headYaw || 0, ca = Math.cos(this.angle), sa = Math.sin(this.angle);
                    const eyes = this._eyeWorld || (this._eyeWorld = [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
                    for (let e = 0; e < 2; e++) {
                        const ex = 2.9 * headScale, ey = (e ? 1 : -1) * 2.05 * headScale;
                        const lx2 = hx + ex * Math.cos(yaw) - ey * Math.sin(yaw), ly2 = hy + ex * Math.sin(yaw) + ey * Math.cos(yaw);
                        eyes[e].x = this.x + lx2 * ca - ly2 * sa; eyes[e].y = this.y + lx2 * sa + ly2 * ca;
                    }
                }
                ctx.save();
                ctx.translate(hx, hy); ctx.rotate(this._headYaw || 0); ctx.scale(headScale, headScale);
                // the head shades the shoulders under it
                ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(-lx * 1.4, -ly * 1.4, 5.2, 5, 0, 0, TAU); ctx.fill();
                const skull = new Path2D();
                skull.moveTo(-4.3, 0);
                skull.bezierCurveTo(-4.3, -3.5, -2.2, -5, .6, -4.95);
                skull.bezierCurveTo(2.9, -4.9, 4.2, -3.1, 5.1, -1.85);
                skull.quadraticCurveTo(6.1, -1, 6.1, 0);
                skull.quadraticCurveTo(6.1, 1, 5.1, 1.85);
                skull.bezierCurveTo(4.2, 3.1, 2.9, 4.9, .6, 4.95);
                skull.bezierCurveTo(-2.2, 5, -4.3, 3.5, -4.3, 0);
                skull.closePath();
                const hlx = Math.cos(-(this._headYaw || 0)) * lx - Math.sin(-(this._headYaw || 0)) * ly;
                const hly = Math.sin(-(this._headYaw || 0)) * lx + Math.cos(-(this._headYaw || 0)) * ly;
                const face = ctx.createRadialGradient(hlx * 2 + .5, hly * 2, .5, .5, 0, 6.5);
                face.addColorStop(0, C.headTop); face.addColorStop(.55, C.headMiddle); face.addColorStop(1, C.headShadow);
                ctx.fillStyle = face; ctx.fill(skull);
                ctx.strokeStyle = 'rgba(8,3,12,.5)'; ctx.lineWidth = .5; ctx.stroke(skull);
                // cheek tufts
                ctx.strokeStyle = C.cheekFur; ctx.lineWidth = .45; ctx.beginPath();
                for (const sd of [-1, 1]) {
                    ctx.moveTo(1.2, sd * 4.6); ctx.lineTo(.2, sd * 5.4);
                    ctx.moveTo(2.4, sd * 4.1); ctx.lineTo(1.6, sd * 5.0);
                }
                ctx.stroke();
                // Eyes on the front of the face: almond, slit pupils, lids that close from above
                const blink = this._blink || 0;
                for (const sd of [-1, 1]) {
                    ctx.save(); ctx.translate(2.9, sd * 2.05); ctx.rotate(sd * .38);
                    const open = 1 - blink;
                    if (open < .12) {
                        ctx.strokeStyle = 'rgba(20,10,26,.9)'; ctx.lineWidth = .5;
                        ctx.beginPath(); ctx.moveTo(-1.3, 0); ctx.quadraticCurveTo(0, .5 * sd, 1.3, 0); ctx.stroke();
                    } else {
                        ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.quadraticCurveTo(0, -1 * open, 1.5, 0); ctx.quadraticCurveTo(0, 1 * open, -1.5, 0);
                        ctx.fillStyle = '#ac7fc4'; ctx.fill(); ctx.strokeStyle = '#120918'; ctx.lineWidth = .42; ctx.stroke();
                        ctx.save(); ctx.clip();
                        ctx.fillStyle = '#170d20'; ctx.beginPath(); ctx.ellipse(.15, 0, .22 + (this._pupil || .5) * .5, .9, 0, 0, TAU); ctx.fill();
                        ctx.fillStyle = '#efe2f3'; ctx.beginPath(); ctx.arc(-.45, -.28 * sd, .28, 0, TAU); ctx.fill();
                        ctx.restore();
                    }
                    ctx.restore();
                }
                // Muzzle pads, nose, mouth line
                ctx.fillStyle = '#3c2540'; ctx.beginPath();
                ctx.ellipse(4.6, -1.05, 1.3, 1.15, -.2, 0, TAU); ctx.ellipse(4.6, 1.05, 1.3, 1.15, .2, 0, TAU); ctx.fill();
                ctx.fillStyle = '#b38c9c'; ctx.beginPath(); ctx.moveTo(6.25, 0); ctx.lineTo(5.3, -.7); ctx.lineTo(5.3, .7); ctx.closePath(); ctx.fill();
                // Whiskers sweep forward when she's alert, droop sideways at rest
                const fwd = moving ? .55 : P.sleep > .5 ? -.25 : P.sit > .5 ? .1 : .3;
                ctx.strokeStyle = 'rgba(214,196,226,.38)'; ctx.lineWidth = .28; ctx.beginPath();
                for (const sd of [-1, 1]) for (let w = 0; w < 3; w++) {
                    const a0 = sd * (1.25 - w * .28 - fwd), r = 6.5 - w * .4;
                    ctx.moveTo(4.8, sd * 1.4); ctx.quadraticCurveTo(4.8 + Math.cos(a0) * r * .5, sd * 1.4 + Math.sin(a0) * r * .5, 4.8 + Math.cos(a0 + sd * .25) * r, sd * 1.4 + Math.sin(a0 + sd * .25) * r);
                }
                ctx.stroke();
                // Ears stand above the skull at its back corners: seen from above, triangles opening forward
                for (const sd of [-1, 1]) {
                    const e = this._ears ? this._ears[sd < 0 ? 0 : 1] : 0;
                    ctx.save(); ctx.translate(-.9, sd * 2.9); ctx.rotate(sd * (e + .35));
                    // a cup of fur: the back of the ear, then the pink inside showing at its open front
                    ctx.fillStyle = C.earBase; ctx.beginPath();
                    ctx.moveTo(-2.5, -sd * .5); ctx.quadraticCurveTo(-2.9, sd * 2, -2.6, sd * 3.9);
                    ctx.quadraticCurveTo(.2, sd * 2.2, 1.9, sd * .1); ctx.quadraticCurveTo(-.2, -sd * .9, -2.5, -sd * .5); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(8,3,12,.55)'; ctx.lineWidth = .4; ctx.stroke();
                    ctx.fillStyle = '#5e3150'; ctx.beginPath();
                    ctx.moveTo(-1.3, sd * .35); ctx.quadraticCurveTo(-1.9, sd * 2, -2.2, sd * 3.2); ctx.quadraticCurveTo(-.2, sd * 1.9, 1.2, sd * .35); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = C.earRim; ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(-1.6, sd * .6); ctx.quadraticCurveTo(-2.1, sd * 2, -2.3, sd * 3.1); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // Grooming: a fore paw lifts to the mouth for a few licks, then wipes back over the ear.
                if (P.groom > 0.5) {
                    const ph = this._groomPhase || 0, wipe = Math.max(0, Math.sin(ph * .35)) ** 2, lick = Math.sin(ph * 3);
                    const yaw = this._headYaw || 0;
                    const mx = hx + Math.cos(yaw) * 4.2 - Math.sin(yaw) * -2.2, my = hy + Math.sin(yaw) * 4.2 + Math.cos(yaw) * -2.2;
                    const ex = hx - 1, ey = hy - 4.5;
                    const px2 = mx + (ex - mx) * wipe, py2 = my + (ey - my) * wipe + lick * .25 * (1 - wipe);
                    const sh = legs[1];
                    ctx.strokeStyle = C.groomArm; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(sh.ax, sh.ay); ctx.quadraticCurveTo(neck.x + 2, neck.y - 4, px2, py2); ctx.stroke();
                    paw(px2, py2, yaw + Math.PI * .25, .85, true);
                    if (lick > .4 && wipe < .2) {
                        ctx.strokeStyle = '#b27f97'; ctx.lineWidth = .8;
                        ctx.beginPath(); ctx.moveTo(mx + 1.2, my + 1.6); ctx.lineTo(mx + .6, my + .9); ctx.stroke();
                    }
                }
                ctx.restore();
            }
};
export function createVelvetAnimation(seed=1){const record=Object.create(velvetCatAppearance);(function(){this.walkPhase = 0;
                this.tailPhase = (seed>>>0)/4294967296 * Math.PI * 2;
                this._randomSeed = (this.tailPhase * 1e8) | 0 || 1;
                this.idleTimer = 0;
                this.idleBehavior = null;   // sit, groom, look, sleep, loaf, stretch
                this._behaviorFor = 360;
                this.animationSpeed = 0;
                this._moveSpeed = 0;
                this._dash = false;         // a sprint to catch up, held until she's close again


                // Body: spine bend into turns, gait blend (0 walk .. 2 gallop; not `_gait`, which marks a humanoid for
                // RenderInterp), pose weights eased in update()
                this._bend = 0;
                this._gaitMix = 0;
                this._poses = { sit: 0, loaf: 0, sleep: 0, stretch: 0, groom: 0 };
                this._curlSide = this._random() < 0.5 ? -1 : 1;
                this._breath = 0;
                // Tail: relative segment angles and their spring velocities; lift foreshortens a raised tail
                this._tail = new Array(VELVET_TAIL_SEGS).fill(0);
                this._tailVel = new Array(VELVET_TAIL_SEGS).fill(0);
                this._tailLift = 0.4;
                this._flick = 0;
                // Head, ears, eyes
                this._headYaw = 0;
                this._lookYaw = 0;
                this._lookTimer = 0;
                this._ears = [0, 0];        // swivel out/back (+) per side [-1, +1]
                this._earVel = [0, 0];
                this._blink = 0;            // 0 open .. 1 shut
                this._blinkT = -1;          // progress through a blink, -1 when none
                this._blinkLen = 10;
                this._blinkWait = 120;
                this._pupil = 0.5;          // slit .. round
                this._groomPhase = 0;

                }).call(record);return structuredClone({...record});}
export function velvetPresentation(entity,blend=1){const pose=entity.getRenderState(blend);return Object.assign(Object.create(velvetCatAppearance),structuredClone(entity.data.velvet_animation),{x:pose.position[0],y:pose.position[1],angle:pose.rotation,state:entity.state,visible:entity.visible,inCar:entity.inCar,coatPalette:entity.data.coat_palette});}
export function advanceVelvetAnimation(entity,player,seconds){const record=entity.data.velvet_animation,packet=velvetPresentation(entity),motion=entity.physics_system.getBodyMotion(entity),position=player?.position??entity.position;packet.animationSpeed=motion.distance/(seconds*60);packet._dash=entity.cat_state.dash;packet.idleBehavior=entity.cat_state.rest;packet._animate({x:position[0],y:position[1]},seconds*60,motion.distance,motion.previous_rotation,entity.state==='following'&&motion.distance<.001,player?entity.physics_system.observeTarget(entity,player).distance:0);for(const key of Object.keys(record))record[key]=structuredClone(packet[key]);}
