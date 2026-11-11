import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicsSystem, gameEntity } from '../src/basement/physics/index.mjs';
import {registerGameEntityTypes} from '../src/directory/game-entity-types.mjs';
import { createGameAssetLibrary } from '../src/directory/game-assets.mjs';

test('Directory libraries create registered official entities for every declared template', () => {
    const p = new physicsSystem({ asset_library: createGameAssetLibrary() }); registerGameEntityTypes(p);
    for (const template of p.elements.asset_library.listTemplates()) {
        const entity = p.createEntity({ template }); assert.ok(entity instanceof gameEntity); assert.equal(entity.template_id, template);
        assert.equal(p.elements.fetchEntity(entity.entity_id), entity); assert.equal(p.fetchBody(entity.body_id), entity.body);
        for (const resource of Object.keys(entity.assets)) assert.ok(entity.getAsset(resource));
    }
    assert.equal(p.getStatistics().entities, p.elements.asset_library.listTemplates().length);
});
test('Directory resources resolve the existing database chapters rather than replacement copies', () => {
    const assets = createGameAssetLibrary(), cast = JSON.parse(readFileSync(new URL('../src/directory/game-db/cast.json', import.meta.url), 'utf8'));
    assert.deepEqual(assets.getResource('df:player_appearance').data, cast.appearances['949']);
    assert.ok(assets.getResource('df:vehicle_brands').data.LADY.models);
    assert.throws(() => assets.getResource('df:vehicle_brands').data.LADY = {});
    assert.throws(() => createGameAssetLibrary({ game_db: {} }), /Missing Directory resource/);
});
test('registered Directory templates round-trip through official entity save/load', () => {
    const source = new physicsSystem({ asset_library: createGameAssetLibrary() }), player = source.createCharacter({ template: 'df:player_949' });
    player.data.health = 87; const saved = source.savePhysicsState();
    const destination = new physicsSystem({ ...saved.config, asset_library: createGameAssetLibrary() }); destination.loadPhysicsState(saved);
    const restored = destination.elements.fetchEntity(player.entity_id); assert.equal(restored.data.health, 87); assert.equal(restored.name, '949');
    assert.deepEqual(restored.getAsset('appearance').data, player.getAsset('appearance').data);
});
