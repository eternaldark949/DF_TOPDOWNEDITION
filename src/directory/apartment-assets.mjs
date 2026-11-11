import { createGameAssetLibrary } from './game-assets.mjs';
import definition from './game-assets/apartment.json' with { type: 'json' };

export function createApartmentAssetLibrary(options = {}) {
    const library = createGameAssetLibrary(options);
    library.registerLibrary(definition); return library;
}

Object.freeze(definition.resources.rules.data.NAMES);
export const APARTMENT_RULES = Object.freeze(definition.resources.rules.data);
