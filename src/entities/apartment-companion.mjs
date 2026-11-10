import { gameCharacter } from '../basement/physics/index.mjs';
export const ROSTER_FIELDS = ['recruited','downed','equippedWeaponId','weaponId','hp','maxHp','teammateStims','maxTeammateStims','relationship','hireType','hireDuration','hireTime','hireCost','hired','role','bio','alliance'];
/** Roster gameplay data plus an ordinary native character while present in this scene. */
export class ApartmentCompanion extends gameCharacter {
    static entity_type = 'df_apartment_companion';
    get visible(){return this.active && !this.data.downed;}
    set visible(value){this.data.visible=!!value;}
    get dead(){return !!this.data.downed;}
    set dead(value){this.data.downed=!!value;}
    heal(amount){this.hp=Math.min(this.maxHp??100,(this.hp??0)+Math.max(0,amount));}
    getRenderConfig(){return this.data.appearance;}
}
for(const key of ROSTER_FIELDS)Object.defineProperty(ApartmentCompanion.prototype,key,{get(){return this.data[key];},set(value){this.data[key]=value;}});
export function rosterRecord(entity) { return {name:entity.name,...Object.fromEntries(ROSTER_FIELDS.map(key=>[key,entity[key]??null]))}; }
