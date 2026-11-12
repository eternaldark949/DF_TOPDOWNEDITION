// ===== LV2 DIRECTORY =====
// The engine's data layer: the registry, data structures and loading. See README.md.
export { assetLibrary, mergeDefinition } from './registry.mjs';
export { STRUCTURES, validatePropCatalog, validateMapLayout } from './structures.mjs';
export { resolvePlacement, resolveLayout, isMovable } from './loading.mjs';
