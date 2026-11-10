// The classic playable build links this entry. Browser/module clients use the same sources.
export { physicsSystem, gameCharacter, gameProp, gameStatic, gameTrigger, gameDecoration, gameVehicle, gameProjectile, assetLibrary, pathGeometry, layoutGeometry, BODY_GROUP } from '../basement/physics/index.mjs';
export { createGameAssetLibrary } from './game-assets.mjs';
export { ApartmentLevel } from '../levels/apartment.mjs';
export { APARTMENT_RULES } from './apartment-assets.mjs';
export { gameEngine } from '../runtime/game-engine.mjs';
export { gameLevel } from '../runtime/game-level.mjs';
export { levelLobby } from '../lobby/level-lobby.mjs';
export { createGameRuntime } from './game-runtime.mjs';
export { controlSystem, controlsSystem, inputInstance, keyboardInstance, mouseInstance, touchInstance, touchStick, gamepadInstance, TAP, DOUBLETAP, HELD, PRESS, REPEAT, RELEASE } from '../basement/controls/index.mjs';
export { renderSystem, renderFrame, canvasRenderer, cameraSystem } from '../basement/rendering/index.mjs';

export { gameSession } from '../gameplay/game-session.mjs';
export { PlayerStateSystem } from '../gameplay/player-state-system.mjs';
export { PlayerControlSystem } from '../gameplay/player-control-system.mjs';
export { Player } from '../entities/player.mjs';

export { playerVitals } from '../gameplay/player-vitals.mjs';

export { itemSystem } from '../gameplay/items/item-system.mjs';
export { createItemCatalog } from './game-items.mjs';

export { GUN_MATERIALS, WEAPON_MODELS, LASER_MODULE, weaponModel } from './weapon-appearance.mjs';
export { weaponAppearance } from '../presentation/weapon-appearance.mjs';
