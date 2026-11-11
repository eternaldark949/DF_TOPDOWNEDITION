import {validateDemonessData} from '../entities/demoness.mjs';
import {validateWardenData} from '../entities/warden.mjs';
import {validateBossEffectData} from '../entities/boss-effect.mjs';
import {validateSecondaryAction} from '../gameplay/abilities/pattern-actions.mjs';
/** Data-only preflight runs before replacing a live map, inventory, currency or registry. */
export function validateBossRecord(record,catalog){
 const data=record.data;if(record.entity_type==='df_demoness')validateDemonessData(data);
 if(['df_warden','df_vesper','df_matins','df_compline'].includes(record.entity_type))validateWardenData(data,record.entity_type);
 if(record.entity_type==='df_boss_effect')validateBossEffectData(data);
 validateSecondaryAction(data.ability_secondary_state,catalog,{clock:data.weapon_state?.elapsed??-1});
 if(data.ability_secondary_ready_at!==undefined&&(!Number.isFinite(data.ability_secondary_ready_at)||data.ability_secondary_ready_at<0))throw new TypeError('Invalid secondary ready time');return record;
}
