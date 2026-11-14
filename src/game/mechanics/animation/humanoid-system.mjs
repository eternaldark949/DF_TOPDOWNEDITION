import {getHumanoidRigAssets} from '../../data/humanoid/rig-assets.mjs';
const humanoids=new Set(['df_player','df_npc','df_ganger','df_hunter','df_demoness']);
/** Game policy chooses authored poses; Basement resolves and advances every joint. */
export class humanoidSystem {
    #context=null;#people=new Map();#off=[];#stance;#appearance;
    constructor({get_stance=actor=>actor.data.humanoid_stance??'idle',get_appearance=actor=>actor.data.appearance??actor.data}={}){this.#stance=get_stance;this.#appearance=get_appearance;}
    attach(context){
        if(this.#context)throw new Error('Humanoid system already attached');this.#context=context;
        this.#off.push(context.api.physics.on('entityRegistered',({entity})=>this.#bind(entity)),context.api.physics.on('entityRemoved',({entity})=>{if(this.#people.get(entity.entity_id)?.actor===entity)this.#people.delete(entity.entity_id);}));
        for(const actor of context.api.elements.getEntities())this.#bind(actor);
    }
    #bind(actor){
        if(!actor||actor.destroyed||!humanoids.has(actor.entity_type)||this.#people.get(actor.entity_id)?.actor===actor)return;
        const world=this.#context.api.physics,appearance=this.#appearance(actor)??{},assets=getHumanoidRigAssets(appearance.gender,appearance);
        const controller=world.rigs.getRig(actor)??world.rigs.createRig(actor,assets);
        if(!controller.getState().layers.base)controller.play('idle');
        this.#people.set(actor.entity_id,{actor,assets,controller});
    }
    levelEntered(){for(const actor of this.#context.api.elements.getEntities())this.#bind(actor);}
    beforePhysics(){
        const world=this.#context.api.physics;
        for(const [id,entry] of this.#people){
            const {actor,assets,controller}=entry;
            if(world.elements.fetchEntity(actor.entity_id)!==actor){this.#people.delete(id);continue;}
            if(!actor.active)continue;
            const moving=!actor.dead&&world.getBodyMotion(actor).distance>.05;
            controller.play(moving?'walk':'idle',{fade:.12,...(moving?{distance_per_cycle:72}:{})});
            const requested=actor.dead?'idle':this.#stance(actor),stance=['pistol','rifle','punch','knife'].includes(requested)?requested:'idle';
            controller.play('stance_'+stance,{layer:'arms',mask:assets.arm_mask,fade:.1});
            const weapon=actor.data.weapon_state,swing=weapon?.swing,age=weapon?weapon.elapsed-weapon.last_punch_at:Infinity;
            if(swing){controller.play('blade',{layer:'action',additive:true,speed:0});controller.seek(Math.min(1,Math.max(0,(weapon.elapsed-swing.started)/swing.seconds)),{layer:'action'});}
            else if(age>=0&&age<(weapon?.punch_duration??0)){
                controller.play(weapon.punch_side==='left'?'punch_l':'punch_r',{layer:'action',additive:true,speed:0});
                controller.seek(age/weapon.punch_duration,{layer:'action'});
            }else controller.stop('action');
        }
    }
    detach(){for(const off of this.#off)off();this.#off=[];this.#people.clear();this.#context=null;}
}
/** Detached body-local presentation data; reading never advances the animation. */
export function humanoidPresentation(actor,blend=1){
    const rigs=actor.physics_system.rigs;
    return rigs.getRig(actor)?rigs.getPose(actor,{blend,world_space:false,relative_to:'root'}):null;
}
