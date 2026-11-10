import { physicsSystem } from '../basement/physics/index.mjs';
import { createApartmentAssetLibrary } from '../directory/apartment-assets.mjs';
import { resolveApartmentDefinition, resolveApartmentDyer } from '../directory/apartment-definition.mjs';
import { Player } from '../entities/player.mjs';
import { ApartmentProp } from '../entities/apartment-prop.mjs';
import { ApartmentCompanion, rosterRecord } from '../entities/apartment-companion.mjs';
import { gameProp } from '../basement/physics/index.mjs';
class ApartmentDoor extends gameProp { static entity_type = 'df_apartment_door'; }

/** A real scene owner. No legacy actors are adopted or synchronized. */
export class ApartmentLevel {
    constructor({ game_db, spawn, layout = {}, roster = [] }) {
        const library = createApartmentAssetLibrary({ game_db });
        this.physics = new physicsSystem({ asset_library: library });
        for(const Class of [Player,ApartmentProp,ApartmentDoor,ApartmentCompanion])this.physics.elements.registerEntityType(Class.entity_type,Class);
        this.definition = resolveApartmentDefinition(library, game_db);
        this.entities = this.definition.entities.map(p=>this.physics.createEntity(p));
        this.player = this.physics.createEntity({...this.definition.player,...(spawn?{position:spawn}:{})});
        this.reconnect(); this.restoreLayout(layout); this.restoreRoster(roster,game_db);
        for(const owner of this.curtains)owner.data.cloth_id=this.physics.createCloth({owner,...owner.data.mesh,mass:.1,damping:4,stiffness:30,wind:[.15,0]});
    }
    reconnect() {
        this.entities=this.physics.elements.getEntities().filter(e=>e.entity_type!=='df_player');
        this.player=this.physics.elements.getEntities({entity_type:'df_player'})[0];
        this.projectiles=this.entities.filter(e=>e.data.role==='projectile');
        this.props=this.entities.filter(e=>e.data.role==='prop'); this.doors=this.entities.filter(e=>e.data.role==='door');
        this.curtains=this.entities.filter(e=>e.data.role==='curtain');
        this.companions=this.entities.filter(e=>e.entity_type===ApartmentCompanion.entity_type);
        this.lamps=this.entities.filter(e=>e.data.role==='lamp'); this.transitions=this.entities.filter(e=>e.data.role==='transition');
    }
    restoreLayout(layout) {
        for(const prop of this.props){const pose=layout[prop.data.layout_index];if(pose)prop.updateBody({position:pose.slice(0,2),rotation:pose[2]??0});}
    }
    addDyerStation(game_db){return this.physics.createEntity(resolveApartmentDyer(game_db));}
    getLayout() { return Object.fromEntries(this.props.filter(p=>p.data.movable).map(p=>[p.data.layout_index,[...p.position,p.rotation]])); }
    restoreRoster(roster,game_db) {
        for(const c of this.companions??[])c.destroy();
        this.companions=roster.map(r=>{
            const spot=game_db.cast.apartment_idle[r.name]??{x:700,y:600};
            return this.physics.createEntity({template:'df:npc',entity_type:ApartmentCompanion.entity_type,name:r.name,position:[spot.x,spot.y],active:!!r.recruited,
                data:{...r,downed:false,hp:r.downed?(r.maxHp??100):(r.hp??r.maxHp??100),maxHp:r.maxHp??100,appearance:game_db.cast.appearances[r.name]??game_db.cast.appearances['949'],pose:spot.pose??null}});
        });
    }
    getRoster(){return this.companions.map(rosterRecord);}
    updateState() {
        for(const c of this.companions)if(c.active!==!!c.recruited){if(c.recruited)c.activate();else c.deactivate();}
        for(const door of this.doors){
            const near=this.physics.peruseNearbyEntities(door,{near_range:door.data.appearance.triggerRadius??90,include_groups:2,include_ghosts:false}).length>0;
            if(near!==door.data.open){door.data.open=near;this.physics.motion.moveBodyTo(door,{position:near?door.data.open_position:door.data.closed_position,rotation:near?door.data.open_rotation:door.data.closed_rotation,duration:this.definition.rules.DOOR_DURATION,easing:'smooth'});}
        }
        this.physics.updateState();
    }
    saveState() { return this.physics.savePhysicsState(); }
    loadState(snapshot) { this.physics.loadPhysicsState(snapshot); this.reconnect(); }
    destroy() { this.physics.clearWorld(); }
}
