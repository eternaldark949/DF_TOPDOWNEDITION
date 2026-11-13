import {Demoness} from '../entities/demoness.mjs';
import {Warden,Vesper,Matins,Compline} from '../entities/warden.mjs';
import {BossEffect} from '../entities/boss-effect.mjs';
import {Drone} from '../entities/drone.mjs';
import {VelvetCat} from '../entities/velvet-cat.mjs';
import {GatlingGunner} from '../entities/gatling-gunner.mjs';
import {Marionette} from '../entities/marionette.mjs';
import {Player} from '../entities/player.mjs';
import {ApartmentProp} from '../entities/apartment-prop.mjs';
import {ApartmentDoor} from '../entities/apartment-door.mjs';
import {gameActor} from '../entities/game-actor.mjs';
import {NPC} from '../entities/npc.mjs';
import {Hunter} from '../entities/hunter.mjs';
import {Ganger} from '../entities/ganger.mjs';
import {WorldLoot} from '../entities/world-loot.mjs';
import {registerStreetEntityTypes} from './game-street.mjs';
/** The Directory registers concrete classes before any level or saved identity is constructed. */
export function registerGameEntityTypes(world){
 for(const Class of [gameActor,Player,ApartmentProp,ApartmentDoor,NPC,Ganger,Hunter,Marionette,GatlingGunner,Demoness,Warden,Vesper,Matins,Compline,BossEffect,Drone,VelvetCat,WorldLoot])if(!world.elements.listEntityTypes().includes(Class.entity_type))world.elements.registerEntityType(Class.entity_type,Class);
 registerStreetEntityTypes(world);
}
