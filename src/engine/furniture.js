const FURNITURE_GRAB = DFNative.APARTMENT_RULES;
// Apartment interaction policy. Geometry, clearance, forces and constraints belong to Basement.
class FurnitureSystem {
    constructor(game) { this.game=game;this.state='idle';this.target=null;this.cand=null;this.side=0; }
    get holding(){return this.state==='hold';}
    busy(){return this.state!=='idle';}
    grip(entity=this.target,side=this.side){return this.game.physics_system.getBodyGrip(entity,{near:this.game.player.position,side,gap:FURNITURE_GRAB.GRIP_GAP});}
    press(){
        if(!this.game.activeLevel)return;
        if(this.state==='idle'&&!this.cand)return;
        if(this.state==='idle'&&this.cand){this.target=this.cand;this.side=this.game.physics_system.getBodyGrip(this.target,{near:this.game.player.position,gap:FURNITURE_GRAB.GRIP_GAP}).side;this.state='choose';}
        else if(this.state==='choose'){
            this.state='walk';this.game.player.moveTo(this.grip().position,{arrival_distance:2,face_movement:true});
            this._dropArrival=this.game.player.on('destinationReached',()=>{if(this.state==='walk')this.attach();});
        } else this.release();
    }
    chooseDir(dx,dy){if(this.state!=='choose'||!this.target)return;this.side=this.game.physics_system.getBodyGrip(this.target,{near:this.game.player.position,direction:[dx,dy],gap:FURNITURE_GRAB.GRIP_GAP}).side;}
    tap(x,y){if(this.state!=='choose'||!this.target)return false;this.side=this.game.physics_system.getBodyGrip(this.target,{near:[x,y],gap:FURNITURE_GRAB.GRIP_GAP}).side;return true;}
    attach(){
        this._dropArrival?.();this._dropArrival=null;
        if(!this.target||this.state!=='walk')return;
        const world=this.game.physics_system,grip=this.grip();
        this.game.player.cancelMovement();this.game.player.setRotation(grip.rotation,{preserve_velocity:true});
        this.target.updateBody({physics_type:'rigid'});
        this.joint=world.createConstraint({constraint_type:'spring',body_a:this.target,body_b:this.game.player,local_anchor_a:grip.local_position,
            rest_length:0,stiffness:FURNITURE_GRAB.STIFFNESS,damping:FURNITURE_GRAB.DAMPING,max_force:FURNITURE_GRAB.MAX_FORCE});
        this.state='hold';
    }
    release(){
        if(!this.game.activeLevel){this.state='idle';this.target=null;this.cand=null;return;}
        const world=this.game.physics_system;
        this._dropArrival?.();this._dropArrival=null;
        if(this.joint){world.removeConstraint(this.joint);this.joint=null;}
        if(this.target&&!this.target.destroyed){world.motion.stopBodyMotion(this.target);this.target.updateBody({physics_type:'static',linear_velocity:[0,0],angular_velocity:0});}
        if(this.state==='walk')this.game.player.cancelMovement();
        this.state='idle';this.target=null;
        this.game.questState.aptLayout=this.game.activeLevel.getLayout();
    }
    rotate(direction){if(this.holding)this.game.physics_system.motion.rotateBodyBy(this.target,{angle:direction<0?-FURNITURE_GRAB.TURN:FURNITURE_GRAB.TURN,duration:FURNITURE_GRAB.TURN_DURATION});}
    resetLayout(){this.release();for(const p of this.game.activeLevel.props)p.updateBody({position:p.data.home_position,rotation:p.data.home_rotation});this.game.questState.aptLayout={};showMessage('FURNITURE BACK WHERE IT WAS');}
    update(){
        const g=this.game;if(!g.activeLevel)return;
        if(this.state==='idle'){
            const hits=g.physics_system.peruseNearbyEntities(g.player,{near_range:FURNITURE_GRAB.QUERY_RANGE});let distance=FURNITURE_GRAB.RANGE;this.cand=null;
            for(const {entity}of hits)if(entity?.data.movable){const grip=g.physics_system.getBodyGrip(entity,{near:g.player.position});if(grip.distance<distance){distance=grip.distance;this.cand=entity;}}
        }
        const button=document.getElementById('btn-grab'),rot=document.getElementById('btn-rotate');
        if(button){uiKit.toggle(button,this.busy()||!!this.cand,'flex');if(this.busy()||this.cand)setActionPill(button,this.holding?'Let go':this.state==='choose'?'Hold':'Grab',FURNITURE_GRAB.NAMES[(this.target||this.cand)?.decorType]||'Furniture','G');}
        if(rot)uiKit.toggle(rot,this.holding,'flex');
    }
    onMapLoaded(){}
    draw(){}
    _grabbable(p){return !!p?.data?.movable;}
    afterCollision(){} // The native world solves both participants; no game correction pass.
}
