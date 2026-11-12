import {VELVET_GAITS,VELVET_TAIL_SEGS} from '../data/game-velvet-appearance.mjs';
/** Fixed-step cosmetic animation only. No draw backend or physical movement. */
export const velvetCatAnimation={
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
_gaitParams() {
                const gi = Math.max(0, Math.min(2, this._gaitMix || 0)), i0 = Math.min(1, Math.floor(gi)), u = gi - i0;
                const a = VELVET_GAITS[i0], b = VELVET_GAITS[i0 + 1], mix = (p, q) => p + (q - p) * u;
                return { off: a.off.map((o, i) => mix(o, b.off[i])), duty: mix(a.duty, b.duty), stride: mix(a.stride, b.stride), gallop: Math.max(0, gi - 1) };
            }
};
export function createVelvetAnimation(seed=1){const record=Object.create(velvetCatAnimation);(function(){this.walkPhase = 0;
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
export function velvetPresentation(entity,blend=1){const pose=entity.getRenderState(blend);return Object.assign({},structuredClone(entity.data.velvet_animation),{x:pose.position[0],y:pose.position[1],angle:pose.rotation,state:entity.state,visible:entity.visible,inCar:entity.inCar,coatPalette:entity.data.coat_palette});}
export function advanceVelvetAnimation(entity,player,seconds){const record=entity.data.velvet_animation,packet=Object.assign(Object.create(velvetCatAnimation),velvetPresentation(entity)),motion=entity.physics_system.getBodyMotion(entity),position=player?.position??entity.position;packet.animationSpeed=motion.distance/(seconds*60);packet._dash=entity.cat_state.dash;packet.idleBehavior=entity.cat_state.rest;packet._animate({x:position[0],y:position[1]},seconds*60,motion.distance,motion.previous_rotation,entity.state==='following'&&motion.distance<.001,player?entity.physics_system.observeTarget(entity,player).distance:0);for(const key of Object.keys(record))record[key]=structuredClone(packet[key]);}

