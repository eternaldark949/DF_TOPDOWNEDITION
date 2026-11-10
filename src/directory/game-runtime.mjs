import { gameEngine } from '../runtime/game-engine.mjs';
import { createApartmentAssetLibrary } from './apartment-assets.mjs';
import { Player } from '../entities/player.mjs';
import { ApartmentProp } from '../entities/apartment-prop.mjs';
import { ApartmentCompanion } from '../entities/apartment-companion.mjs';
import { registerStreetEntityTypes } from './game-street.mjs';
import controlProfile from './game-control-profile.json' with { type: 'json' };
import { gameSession } from '../gameplay/game-session.mjs';
import { PlayerStateSystem } from '../gameplay/player-state-system.mjs';
import { PlayerControlSystem } from '../gameplay/player-control-system.mjs';
import { createItemCatalog } from './game-items.mjs';
import playerRules from './game-player-rules.json' with { type: 'json' };
import { canvasRenderer } from '../basement/rendering/index.mjs';

/** Explicit game composition. Importing this file never starts a second runtime. */
export function createGameRuntime({ game_db, surface, session_state, player, ...options } = {}) {
    const session=new gameSession({state:session_state,player,item_catalog:createItemCatalog(game_db?.items)});
    const player_state=new PlayerStateSystem({session,rules:playerRules});
    const player_controls=new PlayerControlSystem({session,player_state,placement_bounds:context=>context.engine.active_level?.player_placement_bounds});
    if(options.services && ['session','items','player_state','player_controls'].some(key=>Object.hasOwn(options.services,key)))throw new TypeError('Directory owns player services');
    const engine = new gameEngine({ ...options, services:{...options.services,session,items:session.items,player_state,player_controls}, controls:{...controlProfile,...(surface?.addEventListener?{mouse_target:surface}:{}),...options.controls}, asset_library: createApartmentAssetLibrary({ game_db }) });
    engine.api.render.registerRenderer('canvas',canvasRenderer);
    engine.registerSystem('surface-input',{
        attach(context){context.defer(context.api.render.onSurfaceChanged(({surface})=>context.api.controls.setMouseTarget(options.controls?.mouse_target??surface)));}
    });
    for (const Class of [Player, ApartmentProp, ApartmentCompanion]) engine.api.elements.registerEntityType(Class.entity_type, Class);
    registerStreetEntityTypes(engine.api.physics);
    try {
        engine.registerSystem('session',session);
        engine.registerSystem('items',session.items);
        engine.registerSystem('player-state',player_state);
        engine.registerSystem('player-controls',player_controls);
        return engine;
    } catch(error) { engine.dispose();throw error; }
}
