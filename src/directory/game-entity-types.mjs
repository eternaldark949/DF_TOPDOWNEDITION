import {Player} from '../entities/player.mjs';
import {ApartmentProp} from '../entities/apartment-prop.mjs';
import {ApartmentCompanion} from '../entities/apartment-companion.mjs';
import {WorldLoot} from '../entities/world-loot.mjs';
import {registerStreetEntityTypes} from './game-street.mjs';
/** The Directory registers concrete classes before any level or saved identity is constructed. */
export function registerGameEntityTypes(world){
 for(const Class of [Player,ApartmentProp,ApartmentCompanion,WorldLoot])if(!world.elements.listEntityTypes().includes(Class.entity_type))world.elements.registerEntityType(Class.entity_type,Class);
 registerStreetEntityTypes(world);
}
