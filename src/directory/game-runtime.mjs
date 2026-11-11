import {attackSystem} from '../gameplay/attacks/attack-system.mjs';
import {abilitySystem} from '../gameplay/abilities/ability-system.mjs';
import {actorSystem} from '../gameplay/actors/actor-system.mjs';
import {registerGameEntityTypes} from './game-entity-types.mjs';
import { gameEngine } from '../runtime/game-engine.mjs';
import { createApartmentAssetLibrary } from './apartment-assets.mjs';
import controlProfile from './game-control-profile.json' with { type: 'json' };
import { gameSession } from '../gameplay/game-session.mjs';
import { PlayerStateSystem } from '../gameplay/player-state-system.mjs';
import { PlayerControlSystem } from '../gameplay/player-control-system.mjs';
import playerRules from './game-player-rules.json' with { type: 'json' };
import {combatSystem} from '../gameplay/combat/combat-system.mjs';
import {weaponSystem} from '../gameplay/combat/weapon-system.mjs';
import {lootSystem} from '../gameplay/items/loot-system.mjs';
import { canvasRenderer } from '../basement/rendering/index.mjs';

/** Explicit game composition. Importing this file never starts a second runtime. */
export function createGameRuntime({ game_db, surface, session_state, player, weapon_policy={}, combat_policy={}, actor_policy={}, ability_policy={}, ...options } = {}) {
    const asset_library=createApartmentAssetLibrary({game_db});
    const session=new gameSession({state:session_state,player,item_catalog:asset_library.getResource('df:actor_items').data});
    const player_state=new PlayerStateSystem({session,rules:playerRules});
    const player_controls=new PlayerControlSystem({session,player_state,placement_bounds:context=>context.engine.active_level?.player_placement_bounds});
    const combat=new combatSystem({session,policy:{...combat_policy,incoming_multiplier:(target,type)=>(target===session.player&&weapons.guarding?.75:1)*(combat_policy.incoming_multiplier?.(target,type)??1)}});
    const weapons=new weaponSystem({session,items:session.items,combat,policy:weapon_policy,input_events:false});
    const abilities=new abilitySystem({weapons,combat,get_player:()=>session.player,policy:ability_policy});
    const attacks=new attackSystem({weapons,abilities,combat,session,definitions:asset_library.getResource('df:attacks').data});
    const actors=new actorSystem({attacks,abilities,combat,session,policy:actor_policy});
    const loot=new lootSystem({items:session.items,get_player:()=>session.player,on_event:(event,detail)=>session.emit(event,detail)});
    if(options.services && ['session','items','player_state','player_controls','combat','weapons','loot','actors','abilities','attacks'].some(key=>Object.hasOwn(options.services,key)))throw new TypeError('Directory owns player services');
    const engine = new gameEngine({ ...options, services:{...options.services,session,items:session.items,player_state,player_controls,combat,weapons,loot,actors,abilities,attacks}, controls:{...controlProfile,...(surface?.addEventListener?{mouse_target:surface}:{}),...options.controls}, asset_library });
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
        engine.registerSystem('combat',combat);engine.registerSystem('weapons',weapons);engine.registerSystem('abilities',abilities);engine.registerSystem('attacks',attacks);engine.registerSystem('actors',actors);engine.registerSystem('loot',loot);
        return engine;
    } catch(error) { engine.dispose();throw error; }
}
