import {VELVET_GAITS,VELVET_TAIL_SEGS,VELVET_T,VELVET_PROFILES} from '../data/game-velvet-appearance.mjs';
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
                    // The pose a physical tail is driven toward; without a world, the spring below stands in for its weight.
                    (this._tailTarget ??= new Array(N).fill(0))[i] = Math.max(-1.2, Math.min(1.2, target));
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
export function velvetPresentation(entity,blend=1){const pose=entity.getRenderState(blend);return Object.assign({},structuredClone(entity.data.velvet_animation),{x:pose.position[0],y:pose.position[1],angle:pose.rotation,state:entity.state,visible:entity.visible,inCar:entity.inCar,coatPalette:entity.data.coat_palette},entity.physics_system.rigs.getRig(entity)?{joints:entity.physics_system.rigs.getPose(entity,{blend}).joints}:{});}
export function advanceVelvetAnimation(entity,player,seconds){const record=entity.data.velvet_animation,packet=Object.assign(Object.create(velvetCatAnimation),velvetPresentation(entity)),motion=entity.physics_system.getBodyMotion(entity),position=player?.position??entity.position;packet.animationSpeed=motion.distance/(seconds*60);packet._dash=entity.cat_state.dash;packet.idleBehavior=entity.cat_state.rest;packet._animate({x:position[0],y:position[1]},seconds*60,motion.distance,motion.previous_rotation,entity.state==='following'&&motion.distance<.001,player?entity.physics_system.observeTarget(entity,player).distance:0);for(const key of Object.keys(record))record[key]=structuredClone(packet[key]);}


// ----- Her rig: the pose the animation state gives each joint ---------------------------------------
// The skeleton (`data/velvet-skeleton.json`) runs root -> spine_0 (rump) ... spine_12 (neck) -> head ->
// ears, tail_0 ... tail_9 from the rump, and four paws on the root, all in her own frame (+X forward).
// `velvetLocalPose(state)` is the procedural pose the state asks for; the world's rig resolves it, a
// physical tail chain swings tail_0..tail_8 with its own weight, and the artist draws from the joints.
const SPINE=12,TAU=Math.PI*2,frac=v=>v-Math.floor(v);
const LEGS=Object.freeze([['paw_hl',true,-1],['paw_fl',false,-1],['paw_hr',true,1],['paw_fr',false,1]]);
/** Values every part of her pose and drawing derives from: pose weights, gait, spine length and bend, and her half-width along the spine. */
export function velvetFrame(state){
    const P=state._poses||{sit:0,loaf:0,sleep:0,stretch:0,groom:0},moving=(state.animationSpeed||0)>0.05,g=velvetCatAnimation._gaitParams.call(state);
    const stand=Math.max(0,1-P.sit-P.loaf-P.sleep-P.stretch),breathe=1+Math.sin(state._breath||0)*0.025*(1-stand),cyc=state.walkPhase/TAU;
    const flex=moving?Math.sin((cyc+.3)*TAU)*g.gallop:0;   // a galloping cat gathers and stretches
    const L=23.5*(1-0.36*P.sit-0.12*P.loaf+0.03*P.sleep+0.2*P.stretch)*(1+flex*0.13);
    const bend=(state._bend||0)*(1-P.sleep)+P.sleep*4.3*(state._curlSide||1);
    const width=t=>{let j=0;while(j<VELVET_T.length-2&&t>VELVET_T[j+1])j++;const u=(t-VELVET_T[j])/(VELVET_T[j+1]-VELVET_T[j]);let w=0;
        for(const [name,wt] of [['stand',stand],['sit',P.sit],['loaf',P.loaf],['sleep',P.sleep],['stretch',P.stretch]]){if(wt<=0)continue;const pr=VELVET_PROFILES[name];w+=(pr[j]+(pr[j+1]-pr[j])*u)*wt;}return w*breathe;};
    const legU=j=>frac(cyc+g.off[j]);
    return {P,moving,g,stand,cyc,L,bend,width,legU};
}
/** Each leg's gait: how far along and lifted the paw is, and how visible the leg is, for leg j (hind left, fore left, hind right, fore right). */
export function velvetLegGait(f,j){
    const u=f.legU(j);let along=0,lift=0;
    if(f.moving){if(u<f.g.duty)along=f.g.stride*(0.5-u/f.g.duty);else{const s=(u-f.g.duty)/(1-f.g.duty);along=f.g.stride*(-0.5+(s*s*(3-2*s)));lift=Math.sin(s*Math.PI);}}
    const hind=LEGS[j][1],groomPaw=!hind&&LEGS[j][2]<0&&f.P.groom>0.5;
    return {along,lift:lift*f.stand,raw_lift:lift,vis:groomPaw?0:f.stand+f.P.sit+f.P.stretch};
}
/** Local joint transforms for her rig, from the animation state. */
export function velvetLocalPose(state,{tail='spring'}={}){
    const f=velvetFrame(state),{P,L,bend,width}=f,pts=[];
    let px=0,py=0;
    for(let i=SPINE;i>=0;i--){const t=i/SPINE,th=bend*(t-1);pts[i]={x:px,y:py,th};px-=Math.cos(th)*L/SPINE;py-=Math.sin(th)*L/SPINE;}
    let cx=0,cy=0;for(const p of pts){cx+=p.x;cy+=p.y;}cx=cx/pts.length-1.5-P.sit*2;cy/=pts.length;for(const p of pts){p.x-=cx;p.y-=cy;}
    const pose={root:{position:[0,0],rotation:0}};
    pts.forEach((p,i)=>{pose['spine_'+i]=i?{position:[Math.cos(p.th-pts[i-1].th)*L/SPINE,Math.sin(p.th-pts[i-1].th)*L/SPINE],rotation:p.th-pts[i-1].th}:{position:[p.x,p.y],rotation:p.th};});
    const neck=pts[SPINE],yaw=state._headYaw||0,headScale=1+P.sit*.07-P.sleep*.04-P.stretch*.05,reach=2.6-P.sit*1.2+P.stretch*1.5;
    pose.head={position:[Math.cos(-neck.th)*reach,Math.sin(-neck.th)*reach],rotation:yaw-neck.th,scale:[headScale,headScale]};
    for(const [e,side] of [[0,'l'],[1,'r']]){const sd=e?1:-1;pose['ear_'+side]={position:[-.9,sd*2.9],rotation:sd*((state._ears?state._ears[e]:0)+.35)};}
    // Resting, the tail leaves the rump already turned along her side, to wrap round toward the fore paws.
    const lift=state._tailLift||0,rump=pts[0],start=Math.PI-(state._curlSide||1)*(P.sit*1.75+P.loaf*1.75+P.sleep*1.1),turns=(tail==='target'?state._tailTarget:state._tail)??state._tail??[];
    for(let i=0;i<=VELVET_TAIL_SEGS;i++){
        const turn=i<VELVET_TAIL_SEGS?-(turns[i]||0):0;
        const length=i?3.4*(1-lift*(i-1<5?.62:.22))*(1-P.loaf*.12):width(0)*.6;
        pose['tail_'+i]=i?{position:[length,0],rotation:Math.max(-1.2,Math.min(1.2,turn))}:{position:[-length,0],rotation:start+turn};
    }
    const at=t=>{const s=Math.max(0,Math.min(SPINE-1e-6,t*SPINE)),i=Math.floor(s),u=s-i,a=pts[i],b=pts[Math.min(SPINE,i+1)];return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,th:a.th+(b.th-a.th)*u};};
    LEGS.forEach(([joint,hind,sideY],j)=>{
        const anchorT=hind?.2:.78,a=at(anchorT),w=width(anchorT),nx=-Math.sin(a.th),ny=Math.cos(a.th),ux=Math.cos(a.th),uy=Math.sin(a.th),{along,raw_lift}=velvetLegGait(f,j);
        // gait: planted feet slide back under her, lifted feet swing forward
        const out=(hind?1:1.02)*w*(0.85+raw_lift*0.12);
        let fx=a.x+ux*((hind?-1.5:4.6)+along)+nx*out*sideY,fy=a.y+uy*((hind?-1.5:4.6)+along)+ny*out*sideY;
        // sit: fore paws together before the chest, hind paws peeking at the haunches; stretch: fore paws reach far ahead
        const sx=hind?pts[3].x+3.5:neck.x+6.8,sy=hind?pts[3].y+sideY*(width(.25)+.4):neck.y+sideY*2,tx=hind?fx:neck.x+12.5,ty=hind?fy:neck.y+sideY*3.3;
        fx=fx*f.stand+sx*P.sit+tx*P.stretch+(hind?pts[3].x:neck.x)*(P.loaf+P.sleep);fy=fy*f.stand+sy*P.sit+ty*P.stretch+(hind?pts[3].y:neck.y)*(P.loaf+P.sleep);
        pose[joint]={position:[fx,fy],rotation:a.th};
    });
    return pose;
}
export const VELVET_LEG_JOINTS=Object.freeze(LEGS.map(([joint])=>joint));
import skeleton from '../data/velvet-skeleton.json' with {type:'json'};
import {rigDefinition,rigPose} from '../../engine/basement/physics/index.mjs';
import {validateSkeleton} from '../../engine/directory/index.mjs';
const {kind:_kind,...definitionPacket}=validateSkeleton(skeleton);
/** Her rig definition (validated once). */
export const VELVET_RIG=new rigDefinition(definitionPacket);
/** Joints in her own frame for a bare animation state, with no world: what a live rig would hold before physics. */
export function velvetJoints(state){const pose=new rigPose(VELVET_RIG).setPose(velvetLocalPose(state));return Object.fromEntries(VELVET_RIG.getJointNames().map(id=>[id,pose.getJoint(id)]));}
