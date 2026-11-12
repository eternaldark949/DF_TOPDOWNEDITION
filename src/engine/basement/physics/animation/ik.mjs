// ===== LV0 BASEMENT =====
import {number,vector,clone,angleDelta} from '../core/values.mjs';
import {definitionRecord} from './rig-definition.mjs';
import {name,fields,inverse,matrix,transform} from './values.mjs';
/**
 * Inverse kinematics on a rigPose, in rig space. Each solver turns joints' local rotations so an
 * end reaches or faces a target; joint limits still clamp the result. Pure: no bodies, no clock.
 *  two_bone  joints [root, mid, end]   analytic reach, bend +1 or -1 picks the elbow side
 *  chain     joints [j0, …, end]       cyclic coordinate descent, any length
 *  look_at   joints [joint]            turns one joint's forward (+x, plus aim_offset) to the target
 */
export const IK_SOLVERS=Object.freeze(['two_bone','chain','look_at']);
const GOAL_FIELDS=['solver','joints','target','space','weight','bend','aim_offset','max_angle','iterations','tolerance'];
const det=m=>m[0]*m[3]-m[1]*m[2];
/** Validates a goal against a definition and returns a detached, normalised copy. */
export function ikGoal(definition,packet){
    fields(packet,GOAL_FIELDS);const r=definitionRecord(definition),solver=packet.solver;
    if(!IK_SOLVERS.includes(solver))throw new TypeError('Unknown IK solver');
    if(!Array.isArray(packet.joints))throw new TypeError('IK joints must be a list');
    const joints=packet.joints.map(name),size={two_bone:3,look_at:1}[solver];
    if(size?joints.length!==size:joints.length<2||joints.length>64)throw new TypeError(`The ${solver} solver takes ${size??'2..64'} joints`);
    for(const id of joints)if(!r.index.has(id))throw new TypeError('Unknown IK joint');
    const ancestor=(upper,lower)=>{for(let at=r.joints[r.index.get(lower)].parent;at!==null;at=r.joints[r.index.get(at)].parent)if(at===upper)return true;return false;};
    for(let i=1;i<joints.length;i++)if(!ancestor(joints[i-1],joints[i]))throw new TypeError('Each IK joint must descend from the one before it');
    const space=packet.space??'rig';if(space!=='rig'&&space!=='world')throw new TypeError('IK space is rig or world');
    const bend=packet.bend??1;if(bend!==1&&bend!==-1)throw new TypeError('IK bend is 1 or -1');
    return {solver,joints,target:vector(packet.target,'IK target'),space,weight:number(packet.weight??1,'IK weight',0,1),bend,
        aim_offset:number(packet.aim_offset??0,'IK aim offset'),max_angle:number(packet.max_angle??Math.PI,'IK max angle',0,Math.PI),
        iterations:number(packet.iterations??12,'IK iterations',1,64),tolerance:number(packet.tolerance??.01,'IK tolerance',0)};
}
/** Turns `id` so its subtree rotates by `delta` in rig space. A mirrored parent flips the local sense. */
function turn(pose,id,delta){
    if(!delta)return;const local=pose.getLocalJoint(id),parent=det(pose.getJoint(id).matrix)*det(matrix(local));
    pose.setJoint(id,{rotation:local.rotation+(parent<0?-delta:delta)});
}
const at=(pose,id)=>pose.getJoint(id).position;
const heading=(from,to)=>Math.atan2(to[1]-from[1],to[0]-from[0]);
/** Analytic, then refined: under a non-uniformly scaled parent a bone's length depends on its angle, so the closed form is re-run until the end stops moving. */
function twoBone(pose,joints,target,goal){
    for(let pass=0;pass<4;pass++){const before=at(pose,joints[2]);twoBonePass(pose,joints,target,goal);const after=at(pose,joints[2]);if(Math.hypot(after[0]-before[0],after[1]-before[1])<1e-9||goal.weight<1)break;}
}
function twoBonePass(pose,[root,mid,end],target,{bend,weight}){
    const a=at(pose,root),b=at(pose,mid),c=at(pose,end),upper=Math.hypot(b[0]-a[0],b[1]-a[1]),lower=Math.hypot(c[0]-b[0],c[1]-b[1]);
    if(upper<1e-9||lower<1e-9)return;
    const reach=Math.min(upper+lower,Math.max(Math.abs(upper-lower)+1e-9,Math.hypot(target[0]-a[0],target[1]-a[1])));
    const opening=Math.acos(Math.max(-1,Math.min(1,(upper*upper+reach*reach-lower*lower)/(2*upper*reach))));
    turn(pose,root,weight*angleDelta(heading(a,b),heading(a,target)-bend*opening));
    turn(pose,mid,weight*angleDelta(heading(at(pose,mid),at(pose,end)),heading(at(pose,mid),target)));
}
function chain(pose,joints,target,{weight,iterations,tolerance}){
    const end=joints.at(-1),start=clone(pose.getLocalPose()),miss=()=>{const e=at(pose,end);return Math.hypot(e[0]-target[0],e[1]-target[1]);};
    for(let pass=0;pass<iterations&&miss()>tolerance;pass++)for(let i=joints.length-2;i>=0;i--){const p=at(pose,joints[i]);turn(pose,joints[i],angleDelta(heading(p,at(pose,end)),heading(p,target)));}
    if(weight<1){const solved=pose.getLocalPose();pose.setPose(Object.fromEntries(joints.map(id=>[id,start[id]])));pose.setPose(Object.fromEntries(joints.map(id=>[id,{rotation:solved[id].rotation}])),{weight});}
}
function lookAt(pose,[id],target,{aim_offset,max_angle,weight}){
    const joint=pose.getJoint(id),wanted=angleDelta(joint.rotation+aim_offset,heading(joint.position,target));
    turn(pose,id,weight*Math.max(-max_angle,Math.min(max_angle,wanted)));
}
const SOLVE={two_bone:twoBone,chain,look_at:lookAt};
/** Applies goals in order. `root` ({position, rotation}) maps world-space targets into rig space. */
export function solveIk(pose,goals,{root=null}={}){
    const toRig=root?inverse(matrix(transform(root))):null;
    for(const goal of goals){
        if(!goal.weight)continue;let target=goal.target;
        if(goal.space==='world'&&toRig)target=[toRig[0]*target[0]+toRig[2]*target[1]+toRig[4],toRig[1]*target[0]+toRig[3]*target[1]+toRig[5]];
        SOLVE[goal.solver](pose,goal.joints,target,goal);
    }
    return pose;
}
