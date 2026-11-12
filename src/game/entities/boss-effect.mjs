import {gameTrigger} from '../../engine/basement/physics/index.mjs';
import {jsonCopy,nonnegative} from '../mechanics/values.mjs';
export const BOSS_EFFECT_KINDS=Object.freeze(['sigil','fire','smoke','censer','hymn','rite']);
export function validateBossEffectData(d){jsonCopy(d);if(d.format_version!==1||!BOSS_EFFECT_KINDS.includes(d.kind)||!Number.isSafeInteger(d.owner_id)||d.owner_id<1||!Array.isArray(d.hit_ids)||d.hit_ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(d.hit_ids).size!==d.hit_ids.length)throw new TypeError('Invalid boss effect');for(const key of ['age','duration','next_tick','radius','radius_to','damage','burn_dps'])nonnegative(d[key],`effect ${key}`);if(!d.duration||d.age>d.duration+1)throw new TypeError('Invalid boss effect lifetime');if(typeof d.owner_alliance!=='string')throw new TypeError('Invalid effect allegiance');if(d.from_position!==undefined&&(!Array.isArray(d.from_position)||d.from_position.length!==2||!d.from_position.every(Number.isFinite)))throw new TypeError('Invalid effect origin');return d;}
/** A real registered area/tell in the shared world. Its service owns only logical timing. */
export class BossEffect extends gameTrigger{
 static entity_type='df_boss_effect';
 validateEffect(){validateBossEffectData(this.data);return this;}
}
