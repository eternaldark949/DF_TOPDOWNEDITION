import data from './game-combat-rules.json' with {type:'json'};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const COMBAT_RULES=freeze(structuredClone(data));
