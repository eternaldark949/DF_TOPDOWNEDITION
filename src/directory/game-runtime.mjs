import { gameEngine } from '../runtime/game-engine.mjs';
import { createApartmentAssetLibrary } from './apartment-assets.mjs';
import { Player } from '../entities/player.mjs';
import { ApartmentProp } from '../entities/apartment-prop.mjs';
import { ApartmentCompanion } from '../entities/apartment-companion.mjs';
import { registerStreetEntityTypes } from './game-street.mjs';

/** Explicit game composition. Importing this file never starts a second runtime. */
export function createGameRuntime({ game_db, ...options } = {}) {
    const engine = new gameEngine({ ...options, asset_library: createApartmentAssetLibrary({ game_db }) });
    for (const Class of [Player, ApartmentProp, ApartmentCompanion]) engine.api.elements.registerEntityType(Class.entity_type, Class);
    registerStreetEntityTypes(engine.api.physics);
    return engine;
}
