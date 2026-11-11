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

export {combatSystem} from '../gameplay/combat/combat-system.mjs';
export {weaponSystem} from '../gameplay/combat/weapon-system.mjs';
export {lootSystem} from '../gameplay/items/loot-system.mjs';
export {WorldLoot} from '../entities/world-loot.mjs';
export {MELEE_SWING,WIDE_SWING,sampleMeleeSwing,sampleWideSwing,swingPhases,wideGrip} from '../gameplay/combat/melee-poses.mjs';
export {COMBAT_RULES} from './game-combat.mjs';
export {registerGameEntityTypes} from './game-entity-types.mjs';

export {actorVitals} from '../gameplay/actors/actor-vitals.mjs';
export {gameActor} from '../entities/game-actor.mjs';
export {NPC,rosterRecord,ROSTER_FIELDS} from '../entities/npc.mjs';
export {Ganger} from '../entities/ganger.mjs';
export {actorSystem} from '../gameplay/actors/actor-system.mjs';
export {actorItems,restoreActorItems} from '../gameplay/actors/actor-inventory.mjs';
export {resolveEmoteLines,NPC_EMOTE_REACTIONS} from './npc-reactions.mjs';

export {abilityLoadout,actorAbilities} from '../gameplay/abilities/ability-loadout.mjs';
export {abilitySystem} from '../gameplay/abilities/ability-system.mjs';
export {createAbilityCatalog,importActorAbilities} from './game-abilities.mjs';

export {attackRegistry,validateAttackState} from '../gameplay/attacks/attack-registry.mjs';
export {attackSystem} from '../gameplay/attacks/attack-system.mjs';
export {createAttackCatalog} from './game-attacks.mjs';

export {validateMountedAttack} from '../gameplay/attacks/mounted-attacks.mjs';

export {TrafficVehicle,createGameVehicle} from './game-street.mjs';

export {Hunter} from '../entities/hunter.mjs';
export {createHunterAppearance} from './game-hunters.mjs';

export {Marionette} from '../entities/marionette.mjs';
export {MARIONETTE_RULES} from './game-marionettes.mjs';
export {validateAbilityAction} from '../gameplay/abilities/lunge-actions.mjs';

export {GatlingGunner} from '../entities/gatling-gunner.mjs';
