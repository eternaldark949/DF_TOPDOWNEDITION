import {validateBossRecord} from '../entities/validate-boss-records.mjs';
import {validateAbilityAction} from '../mechanics/abilities/lunge-actions.mjs';
import {validateMountedAttack} from '../mechanics/attacks/mounted-attacks.mjs';
import {validateAttackState} from '../mechanics/attacks/attack-registry.mjs';
import {abilityLoadout} from '../mechanics/abilities/ability-loadout.mjs';
import {importActorAbilities} from '../mechanics/abilities/ability-loadout.mjs';
import {registerGameEntityTypes} from '../boot/game-entity-types.mjs';
import { physicsSystem } from '../../engine/basement/physics/index.mjs';
import { createApartmentAssetLibrary } from '../data/apartment-assets.mjs';
import { resolveApartmentDefinition, resolveApartmentDyer, APARTMENT_MAP_OPTIONS } from './apartment-definition.mjs';
import { mapInstance } from '../../engine/basement/maps/index.mjs';
import {NPC,rosterRecord} from '../entities/npc.mjs';
import {createActorPacket} from '../boot/game-actor-factory.mjs';
import { gameProp } from '../../engine/basement/physics/index.mjs';
class ApartmentDoor extends gameProp { static entity_type = 'df_apartment_door'; }

/** A real scene owner. No legacy actors are adopted or synchronized. */
export class ApartmentLevel {
    constructor({ game_db, spawn, layout = {}, roster = [] }) {
        const library = createApartmentAssetLibrary({ game_db });
        this.physics = new physicsSystem({ asset_library: library });
        registerGameEntityTypes(this.physics);this.physics.elements.registerEntityType(ApartmentDoor.entity_type,ApartmentDoor);
        this.definition = resolveApartmentDefinition(library, game_db);
        this.map = new mapInstance(this.physics, this.definition.definition, APARTMENT_MAP_OPTIONS);   // the Basement map system builds the scene
        this.player = this.physics.createEntity({...this.definition.player,...(spawn?{position:spawn}:{})});
        this.reconnect(); this.restoreLayout(layout); this.restoreRoster(roster,game_db);
        for(const owner of this.curtains)owner.data.cloth_id=this.physics.createCloth({owner,...owner.data.mesh,mass:.1,damping:4,stiffness:30,wind:[.15,0]});
    }
    reconnect() {
        this.entities=this.physics.elements.getEntities().filter(e=>e.entity_type!=='df_player');
        this.player=this.physics.elements.getEntities({entity_type:'df_player'})[0];
        this.props=this.entities.filter(e=>e.data.role==='prop'); this.doors=this.entities.filter(e=>e.data.role==='door');
        this.curtains=this.entities.filter(e=>e.data.role==='curtain');
        this.companions=this.entities.filter(e=>e.entity_type===NPC.entity_type);
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
            const {hp,maxHp,equippedWeaponId,weaponId,inventory,...data}=r;
            return this.physics.createEntity(createActorPacket(this.physics,{kind:'npc',name:r.name,role:r.role??'teammate',position:[spot.x,spot.y],active:!!r.recruited,
                data:{...data,...(inventory?{inventory}:{}),downed:false,health:r.downed?(maxHp??100):(hp??maxHp??100),max_health:maxHp??100,weapon_definition_id:equippedWeaponId??weaponId??null,appearance:game_db.cast.appearances[r.name]??game_db.cast.appearances['949'],pose:spot.pose??null}}));
        });
    }
    getRoster(){return this.companions.map(rosterRecord);}
    updateState() {
        for(const c of this.companions)if(c.active!==!!(c.recruited&&!c.dead)){if(c.recruited&&!c.dead)c.activate();else c.deactivate();}
        this.map.updateState({near_range:door=>door.data.appearance.triggerRadius??90,duration:this.definition.rules.DOOR_DURATION,include_groups:2});
        this.physics.updateState();
    }
    saveState() { return this.physics.savePhysicsState(); }
    loadState(snapshot) {
        const migrated=structuredClone(snapshot);
        for(const record of migrated.entities??[])if(record.entity_type==='df_apartment_companion'){
            record.entity_type=NPC.entity_type;const data=record.data;data.health=data.hp??100;data.max_health=data.maxHp??100;data.role??='teammate';data.alliance??='friendly';data.weapon_definition_id=data.equippedWeaponId??data.weaponId??null;delete data.hp;delete data.maxHp;delete data.equippedWeaponId;delete data.weaponId;
            record.assets={...record.assets,actor_rules:'df:actor_rules',items:'df:actor_items',appearances:'df:actor_appearances',abilities:'df:abilities'};
        }
        for(const record of migrated.entities??[])if(record.entity_type===NPC.entity_type)importActorAbilities(record.data,this.physics.elements.asset_library.getResource('df:abilities').data,{default_id:record.data.role==='red_demon_dancer'?'fireball':null});
        for(const record of migrated.entities??[]){validateBossRecord(record,this.physics.elements.asset_library.getResource('df:abilities').data);validateAbilityAction(record.data.ability_action_state,this.physics.elements.asset_library.getResource('df:abilities').data,{clock:record.data.weapon_state?.elapsed??-1});validateMountedAttack(record.data.mounted_attack_state);if(record.data.attack_state)validateAttackState(record.data.attack_state,id=>!!this.physics.elements.asset_library.getResource('df:attacks').data[id]);if(record.data.abilities)new abilityLoadout(record.data.abilities,this.physics.elements.asset_library.getResource('df:abilities').data);}
        this.physics.loadPhysicsState(migrated); this.map.reconnect(); this.reconnect();
        let upgraded=false;
        for(const door of this.doors)if(door.data.appearance.type==='sliding'&&!door.data.panel_version){
            const packets=this.definition.entities.filter(p=>p.data.door_key===door.data.authored_id),primary=packets.find(p=>p.data.role==='door');
            this.physics.motion.stopBodyMotion(door);
            door.updateBody({position:primary.position,rotation:0,collision_shape:primary.collision_shape});Object.assign(door.data,structuredClone(primary.data));
            this.physics.createEntity(packets.find(p=>p.data.role==='door_panel'));upgraded=true;
        }
        // Saves from before hinged doors were physical hold them as kinematic leaves: make them the
        // authored rigid leaf again; map.reconnect() then adds the hinge joint the save lacks.
        for(const door of this.doors)if(door.data.appearance.type==='hinged'&&door.body.getState().physics_type!=='rigid'){
            const primary=this.definition.entities.find(p=>p.data.authored_id===door.data.authored_id);
            this.physics.motion.stopBodyMotion(door);
            door.updateBody({physics_type:'rigid',mass:primary.mass,angular_damping:primary.angular_damping,linear_damping:primary.linear_damping,position:primary.position,rotation:0,angular_velocity:0,linear_velocity:[0,0]});
            Object.assign(door.data,structuredClone(primary.data));upgraded=true;
        }
        if(upgraded){this.map.reconnect();this.reconnect();}
    }
    destroy() { this.physics.clearWorld(); }
}
