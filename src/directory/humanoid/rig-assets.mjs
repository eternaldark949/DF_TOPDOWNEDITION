import builds from './builds.json' with {type:'json'};
import bodyCanon from './body-canon.json' with {type:'json'};
import {rigDefinition,animationClip} from '../../basement/physics/index.mjs';
const immutable=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))immutable(child);Object.freeze(value);}return value;};
export const humanoidBodyCanon=immutable(bodyCanon);
export const humanoidBuilds=immutable(builds);
const cache=new Map();
const key=(time,value)=>({time,value});
const track=(joint,channel,values)=>({joint,channel,keys:values.map(([time,value])=>key(time,value))});
/** Authored humanoid proportions and motion belong to the game's asset directory. */
export function getHumanoidRigAssets(gender='androgynous',{build=null,height=1}={}){
    if(!Object.hasOwn(bodyCanon,gender))gender='androgynous';
    if(!Number.isFinite(height)||height<=0||height>100)throw new TypeError('Invalid humanoid height');
    const b=Object.hasOwn(builds,build)?builds[build]:{},id=gender+':'+(Object.hasOwn(builds,build)?build:'classic')+':'+height;
    if(cache.has(id))return cache.get(id);
    const sh=bodyCanon[gender].sh*(b.shoulder??1),leg=bodyCanon[gender].leg*(1+((b.hip??1)-1)*.5);
    const joints=[{name:'root',scale:[height*(b.d??1),height*(b.w??1)]},{name:'pelvis',parent:'root',position:[-1,0]},{name:'torso',parent:'root'},{name:'head',parent:'torso'}];
    for(const [side,sign] of [['l',-1],['r',1]])joints.push(
        {name:'shoulder_'+side,parent:'torso',position:[0,sign*sh]},
        {name:'elbow_'+side,parent:'shoulder_'+side,position:[3,sign*3]},
        {name:'hand_'+side,parent:'elbow_'+side,position:[7,-sign*4]},
        {name:'hip_'+side,parent:'pelvis',position:[0,sign*leg]},
        {name:'knee_'+side,parent:'hip_'+side,position:[-1,0]},
        {name:'foot_'+side,parent:'knee_'+side,position:[-1,0]});
    const definition=new rigDefinition({rig_id:'df:humanoid:'+id,joints,anchors:{hand_l:{joint:'hand_l'},hand_r:{joint:'hand_r'},head:{joint:'head'},back:{joint:'torso',position:[-8,0]},seat:{joint:'pelvis'}}});
    const idle=new animationClip({clip_id:'idle',duration:2,tracks:[track('head','position',[[0,[0,0]],[1,[.25,0]],[2,[0,0]]])]});
    const walking=[];
    for(const [side,sign] of [['l',1],['r',-1]]){
        walking.push(track('knee_'+side,'position',[[0,[-1,0]],[.25,[-1+sign*3,0]],[.5,[-1,0]],[.75,[-1-sign*3,0]],[1,[-1,0]]]),track('foot_'+side,'position',[[0,[-1,0]],[.25,[-1+sign*3,0]],[.5,[-1,0]],[.75,[-1-sign*3,0]],[1,[-1,0]]]));
    }
    walking.push(track('torso','rotation',[[0,0],[.25,.045],[.5,0],[.75,-.045],[1,0]]));
    const walk=new animationClip({clip_id:'walk',duration:1,tracks:walking,markers:[{name:'footstep_l',time:.25},{name:'footstep_r',time:.75}]});
    // Local offsets along shoulder -> elbow -> hand chains; no runtime joint math here.
    const stances={idle:{l:[[3,-3],[7,4]],r:[[3,3],[7,-4]]},pistol:{l:[[1,-4],[3,4]],r:[[8,-1],[10,-5]]},rifle:{l:[[10,1],[10,7]],r:[[8,-1],[10,-5]]},punch:{l:[[5,-2],[8,3]],r:[[5,2],[8,-3]]},knife:{l:[[1,-4],[4,2]],r:[[5,2],[9,-3]]}};
    const clips=[idle,walk];
    for(const [stance,sides] of Object.entries(stances)){
        const tracks=[];
        for(const side of ['l','r']){tracks.push(track('elbow_'+side,'position',[[0,sides[side][0]]]));tracks.push(track('hand_'+side,'position',[[0,sides[side][1]]]));}
        clips.push(new animationClip({clip_id:'stance_'+stance,duration:1,tracks}));
    }
    for(const side of ['l','r'])clips.push(new animationClip({clip_id:'punch_'+side,duration:1,loop:false,tracks:[track('hand_'+side,'position',[[0,[0,0]],[.2,[10,0]],[.45,[14,0]],[1,[0,0]]])]}));
    clips.push(new animationClip({clip_id:'blade',duration:1,loop:false,tracks:[track('hand_r','position',[[0,[-4,8]],[.3,[12,-8]],[.65,[7,-12]],[1,[0,0]]])]}));
    const assets=Object.freeze({definition,clips:Object.freeze(clips),arm_mask:Object.freeze(['elbow_l','elbow_r','hand_l','hand_r'])});if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(id,assets);return assets;
}
