import {humanoidSystem} from '../mechanics/animation/humanoid-system.mjs';
import {encounterSystem} from '../mechanics/encounters/encounter-system.mjs';
import {attackSystem} from '../mechanics/attacks/attack-system.mjs';
import {abilitySystem} from '../mechanics/abilities/ability-system.mjs';
import {actorSystem} from '../mechanics/actors/actor-system.mjs';
import {registerGameEntityTypes} from './game-entity-types.mjs';
import { gameEngine } from '../../engine/lobby/runtime/game-engine.mjs';
import { travelSystem } from '../../engine/lobby/runtime/travel-system.mjs';
import { createApartmentAssetLibrary } from '../data/apartment-assets.mjs';
import controlProfile from '../data/game-control-profile.json' with { type: 'json' };
import { gameSession } from '../mechanics/game-session.mjs';
import { PlayerStateSystem } from '../mechanics/player-state-system.mjs';
import { PlayerControlSystem } from '../mechanics/player-control-system.mjs';
import playerRules from '../data/game-player-rules.json' with { type: 'json' };
import {combatSystem} from '../mechanics/combat/combat-system.mjs';
import {weaponSystem} from '../mechanics/combat/weapon-system.mjs';
import {lootSystem} from '../mechanics/items/loot-system.mjs';
import { canvasRenderer } from '../../engine/basement/rendering/index.mjs';

/** Explicit game composition. Importing this file never starts a second runtime. */
export function createGameRuntime({ game_db, surface, session_state, player, weapon_policy={}, combat_policy={}, actor_policy={}, ability_policy={}, ...options } = {}) {
    const asset_library=createApartmentAssetLibrary({game_db});
    const session=new gameSession({state:session_state,player,item_catalog:asset_library.getResource('df:actor_items').data});
    const player_state=new PlayerStateSystem({session,rules:playerRules});
    const player_controls=new PlayerControlSystem({session,player_state,placement_bounds:context=>context.engine.active_level?.player_placement_bounds});
    const combat=new combatSystem({session,policy:{...combat_policy,incoming_multiplier:(target,type)=>(target===session.player&&weapons.guarding?.75:1)*(combat_policy.incoming_multiplier?.(target,type)??1)}});
    const weapons=new weaponSystem({session,items:session.items,combat,policy:weapon_policy,input_events:false});
    const encounters=new encounterSystem({combat,random:actor_policy.random??Math.random});
    const abilities=new abilitySystem({weapons,combat,encounters,get_player:()=>session.player,policy:ability_policy});
    const attacks=new attackSystem({weapons,abilities,combat,session,definitions:asset_library.getResource('df:attacks').data});
    const actors=new actorSystem({attacks,abilities,encounters,combat,session,policy:actor_policy});
    encounters.setActors(actors);
    const humanoids=new humanoidSystem({get_stance:actor=>{if(actor===session.player){if(weapons.state?.holstered)return 'idle';const weapon=session.items.getEquippedWeapon();return weapon?.weaponMode==='melee'?'knife':weapon?.weaponMode==='normal'||weapon?.weaponMode==='sniper'?'pistol':weapons.state?.cooldown>0?'punch':'idle';}return actor.data.humanoid_stance??'idle';}});
    // Who travels through exits: the player first, then every adopted companion on foot.
    const travel=new travelSystem({get_travellers:()=>[session.player,...actors.getActors().filter(actor=>actor.adopted&&!actor.inCar)]});
    const loot=new lootSystem({items:session.items,get_player:()=>session.player,on_event:(event,detail)=>session.emit(event,detail)});
    if(options.services && ['session','items','player_state','player_controls','combat','weapons','loot','actors','abilities','attacks','encounters','humanoids','travel'].some(key=>Object.hasOwn(options.services,key)))throw new TypeError('Directory owns player services');
    const engine = new gameEngine({ ...options, services:{...options.services,session,items:session.items,player_state,player_controls,combat,weapons,loot,actors,abilities,attacks,encounters,humanoids,travel}, controls:{...controlProfile,...(surface?.addEventListener?{mouse_target:surface}:{}),...options.controls}, asset_library });
    engine.api.render.registerRenderer('canvas',canvasRenderer);
    engine.registerSystem('surface-input',{
        attach(context){context.defer(context.api.render.onSurfaceChanged(({surface})=>context.api.controls.setMouseTarget(options.controls?.mouse_target??surface)));}
    });
    registerGameEntityTypes(engine.api.physics);
    try {
        engine.registerSystem('session',session);
        engine.registerSystem('items',session.items);
        engine.registerSystem('player-state',player_state);
        engine.registerSystem('player-controls',player_controls);
        engine.registerSystem('combat',combat);engine.registerSystem('weapons',weapons);engine.registerSystem('encounters',encounters);engine.registerSystem('abilities',abilities);engine.registerSystem('attacks',attacks);engine.registerSystem('actors',actors);engine.registerSystem('loot',loot);engine.registerSystem('humanoids',humanoids);engine.registerSystem('travel',travel);
        return engine;
    } catch(error) { engine.dispose();throw error; }
}
