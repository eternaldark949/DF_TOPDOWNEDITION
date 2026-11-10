// The classic playable build links this entry. Browser/module clients use the same sources.
export { physicsSystem, gameCharacter, gameProp, gameStatic, gameTrigger, gameDecoration, gameVehicle, gameProjectile, assetLibrary, pathGeometry, layoutGeometry, BODY_GROUP } from '../basement/physics/index.mjs';
export { createGameAssetLibrary } from './game-assets.mjs';
export { ApartmentLevel } from '../levels/apartment.mjs';
export { APARTMENT_RULES } from './apartment-assets.mjs';
export { gameEngine } from '../runtime/game-engine.mjs';
export { gameLevel } from '../runtime/game-level.mjs';
export { levelLobby } from '../lobby/level-lobby.mjs';
export { createGameRuntime } from './game-runtime.mjs';
