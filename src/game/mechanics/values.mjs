// Gameplay validation, deliberately unrelated to physical vectors or integration. The generic data
// checks (identifier, nonnegative, jsonCopy) are the Directory's: engine/directory/values.mjs.
import { identifier, nonnegative, jsonCopy } from '../../engine/directory/index.mjs';
export function validateModifiers(modifiers) {
    const copy=jsonCopy(modifiers);
    if(!copy || typeof copy!=='object' || Array.isArray(copy))throw new TypeError('Buff modifiers must be a record');
    for(const modifier of Object.values(copy)) {
        if(!modifier || typeof modifier!=='object' || Array.isArray(modifier) || Object.keys(modifier).some(key=>!['add','multiply'].includes(key)))throw new TypeError('Buff modifiers require add and/or multiply');
        if(modifier.add!==undefined&&!Number.isFinite(modifier.add))throw new TypeError('Buff addition must be finite');
        if(modifier.multiply!==undefined)nonnegative(modifier.multiply,'buff multiplier');
    }
    return copy;
}
