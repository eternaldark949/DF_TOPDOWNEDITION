// The classic playable build links this entry. Browser/module clients use the same sources.
export { physicsSystem, gameCharacter, gameProp, gameStatic, gameTrigger, gameDecoration, gameVehicle, gameProjectile, pathGeometry, layoutGeometry, BODY_GROUP } from '../../engine/basement/physics/index.mjs';
export { assetLibrary } from '../../engine/directory/index.mjs';
export { createGameAssetLibrary } from '../data/game-assets.mjs';
export { resolveMapLayout, resolvePlacement, isMovableProp, mapHost, createMapLibraries, PROP_TYPES, MAP_IDS } from '../data/game-maps.mjs';
export { ApartmentLevel } from '../levels/apartment.mjs';
export { APARTMENT_RULES } from '../data/apartment-assets.mjs';
export { gameEngine } from '../../engine/lobby/runtime/game-engine.mjs';
export { gameLevel } from '../../engine/lobby/runtime/game-level.mjs';
export { mapLevel } from '../../engine/lobby/runtime/map-level.mjs';
export { travelSystem } from '../../engine/lobby/runtime/travel-system.mjs';
export { InteriorLevel, registerInteriorLevels } from '../levels/interior-level.mjs';
export { levelLobby } from '../../engine/lobby/level-lobby.mjs';
export { createGameRuntime } from './game-runtime.mjs';
export { controlSystem, controlsSystem, inputInstance, keyboardInstance, mouseInstance, touchInstance, touchStick, gamepadInstance, TAP, DOUBLETAP, HELD, PRESS, REPEAT, RELEASE } from '../../engine/basement/controls/index.mjs';
export { renderSystem, renderFrame, canvasRenderer, cameraSystem } from '../../engine/basement/rendering/index.mjs';

export { gameSession } from '../mechanics/game-session.mjs';
export { PlayerStateSystem } from '../mechanics/player-state-system.mjs';
export { PlayerControlSystem } from '../mechanics/player-control-system.mjs';
export { Player } from '../entities/player.mjs';

export { playerVitals } from '../mechanics/player-vitals.mjs';

export { itemSystem } from '../mechanics/items/item-system.mjs';
export { createItemCatalog } from '../data/game-items.mjs';

export { GUN_MATERIALS, WEAPON_MODELS, LASER_MODULE, weaponModel } from '../data/weapon-models.mjs';
export { weaponAppearance } from '../presentation/weapon-appearance.mjs';

export {combatSystem} from '../mechanics/combat/combat-system.mjs';
export {weaponSystem} from '../mechanics/combat/weapon-system.mjs';
export {lootSystem} from '../mechanics/items/loot-system.mjs';
export {WorldLoot} from '../entities/world-loot.mjs';
export {MELEE_SWING,WIDE_SWING,sampleMeleeSwing,sampleWideSwing,swingPhases,wideGrip} from '../mechanics/combat/melee-poses.mjs';
export {COMBAT_RULES} from '../data/game-combat.mjs';
export {registerGameEntityTypes} from './game-entity-types.mjs';

export {actorVitals} from '../mechanics/actors/actor-vitals.mjs';
export {gameActor} from '../entities/game-actor.mjs';
export {NPC,rosterRecord,ROSTER_FIELDS} from '../entities/npc.mjs';
export {Ganger} from '../entities/ganger.mjs';
export {actorSystem} from '../mechanics/actors/actor-system.mjs';
export {actorItems,restoreActorItems} from '../mechanics/actors/actor-inventory.mjs';
export {resolveEmoteLines,NPC_EMOTE_REACTIONS} from '../data/npc-reactions.mjs';

export {abilityLoadout,actorAbilities,importActorAbilities} from '../mechanics/abilities/ability-loadout.mjs';
export {abilitySystem} from '../mechanics/abilities/ability-system.mjs';
export {createAbilityCatalog} from '../data/game-abilities.mjs';

export {attackRegistry,validateAttackState} from '../mechanics/attacks/attack-registry.mjs';
export {attackSystem} from '../mechanics/attacks/attack-system.mjs';
export {createAttackCatalog} from '../data/game-attacks.mjs';

export {validateMountedAttack} from '../mechanics/attacks/mounted-attacks.mjs';

export {TrafficVehicle,createGameVehicle} from './game-street.mjs';

export {Hunter} from '../entities/hunter.mjs';
export {createHunterAppearance} from '../data/game-hunters.mjs';

export {Marionette} from '../entities/marionette.mjs';
export {MARIONETTE_RULES} from '../data/game-marionettes.mjs';
export {validateAbilityAction} from '../mechanics/abilities/lunge-actions.mjs';

export {GatlingGunner} from '../entities/gatling-gunner.mjs';

export {Drone} from '../entities/drone.mjs';
export {VelvetCat} from '../entities/velvet-cat.mjs';
export {velvetCatAnimation,createVelvetAnimation,velvetPresentation} from '../presentation/velvet-cat-animation.mjs';
export {droneLift,droneArmPose,dronePresentation} from '../presentation/drone.mjs';
export {VELVET_CAT_PALETTES,VELVET_T,VELVET_PROFILES,VELVET_GAITS,VELVET_TAIL_SEGS} from '../data/game-velvet-appearance.mjs';

export {Demoness} from '../entities/demoness.mjs';
export {Warden,Vesper,Matins,Compline} from '../entities/warden.mjs';
export {BossEffect} from '../entities/boss-effect.mjs';
export {encounterSystem} from '../mechanics/encounters/encounter-system.mjs';
export {createBossAbilities,createDemonessAppearance} from '../data/game-bosses.mjs';
export {demonessAppearance,demonessPresentation} from '../presentation/demoness.mjs';
export {bossEffectAppearance,bossEffectPresentation} from '../presentation/boss-effects.mjs';

export {validateBossRecord} from '../entities/validate-boss-records.mjs';

export {createDronePackets} from '../presentation/drone.mjs';
export {createVelvetCatArt,createVelvetCatPackets,createVelvetEyePackets} from '../presentation/velvet-cat.mjs';
export {doorPresentation,createDoorPackets,DOOR_APPEARANCE} from '../presentation/door.mjs';
export {sceneLighting,levelLights,LIGHTING} from '../presentation/lighting.mjs';

export {rigDefinition,rigPose,animationClip,animationController,rigSystem} from '../../engine/basement/physics/index.mjs';
export {humanoidSystem,humanoidPresentation} from '../mechanics/animation/humanoid-system.mjs';
export {humanoidBodyCanon,humanoidBuilds,getHumanoidRigAssets} from '../data/humanoid/rig-assets.mjs';
export {roadNavigationData,loadRoadNavigation} from '../data/road-navigation.mjs';
