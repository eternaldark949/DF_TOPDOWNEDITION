// ===== LV2 DIRECTORY =====
// DEFAULT LIBRARIES: the data the engine runs on with no game installed. `engine.json` holds the
// base entity kinds (entity, character, prop, static, trigger, decoration) and a default humanoid
// (skeleton, idle and walk clips, locomotion). A game registers its own libraries beside it, and
// its templates may extend `engine:` ones.
import engine from './engine.json' with { type: 'json' };
import { assetLibrary } from '../registry.mjs';
import { validateLibrary } from '../structures.mjs';

const deepFreeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; };

/** The engine's default library packets, validated and frozen. */
export const ENGINE_LIBRARIES = deepFreeze([validateLibrary(engine)]);

/** A registry holding the engine's defaults, then `libraries` (each validated) in order. */
export function createEngineRegistry({ libraries = [] } = {}) {
    return new assetLibrary({ libraries: [...ENGINE_LIBRARIES, ...libraries.map(validateLibrary)] });
}
