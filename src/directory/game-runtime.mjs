import { gameEngine } from '../runtime/game-engine.mjs';
import { createApartmentAssetLibrary } from './apartment-assets.mjs';
import { Player } from '../entities/player.mjs';
import { ApartmentProp } from '../entities/apartment-prop.mjs';
import { ApartmentCompanion } from '../entities/apartment-companion.mjs';
import { registerStreetEntityTypes } from './game-street.mjs';
import controlProfile from './game-control-profile.json' with { type: 'json' };
import { canvasRenderer } from '../basement/rendering/index.mjs';

/** Explicit game composition. Importing this file never starts a second runtime. */
export function createGameRuntime({ game_db, surface, ...options } = {}) {
    const engine = new gameEngine({ ...options, controls:{...controlProfile,...(surface?.addEventListener?{mouse_target:surface}:{}),...options.controls}, asset_library: createApartmentAssetLibrary({ game_db }) });
    engine.api.render.registerRenderer('canvas',canvasRenderer);
    engine.registerSystem('surface-input',{
        attach(context){context.defer(context.api.render.onSurfaceChanged(({surface})=>context.api.controls.setMouseTarget(options.controls?.mouse_target??surface)));}
    });
    for (const Class of [Player, ApartmentProp, ApartmentCompanion]) engine.api.elements.registerEntityType(Class.entity_type, Class);
    registerStreetEntityTypes(engine.api.physics);
    return engine;
}
