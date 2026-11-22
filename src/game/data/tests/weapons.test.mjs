// ===== GAME DATA =====
// Each catalog entry resolves to native art and a matching attack effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { physicsSystem } from '../../../engine/basement/physics/index.mjs';
import { artScene, drawLook } from '../../../engine/basement/rendering/index.mjs';
import { createEngineRegistry, validateLibrary } from '../../../engine/directory/index.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const weapons = read('../libraries/weapons.json');
const { gear } = read('../../../../reference/classic/game-db/items.json');

test('the weapon catalog includes all Classic gear weapons and every model and effect emits draw packets', () => {
    validateLibrary(weapons);
    const registry = createEngineRegistry({ libraries: [weapons] });
    const physics = new physicsSystem({ asset_library: registry });
    const entries = registry.getResource('weapons:catalog').entries;
    assert.equal(new Set(entries).size, entries.length);
    for (const [id, item] of Object.entries(gear)) {
        if (item.type === 'weapon') assert.ok(entries.includes(id), id);
    }
    function draw(packet) {
        const entity = physics.elements.createEntity(packet);
        const scene = new artScene();
        assert.ok(drawLook(scene, entity, registry), packet.template);
        assert.ok(scene.finish().length, packet.template);
        entity.destroy();
    }
    for (const id of entries) {
        const template = 'weapons:' + id;
        const { label, muzzle, effect, color, core, projectile, trail } = registry.getTemplate(template).data;
        assert.ok(label);
        assert.equal(muzzle.length, 2);
        assert.ok(muzzle.every(Number.isFinite));
        draw({ template });
        const look = { values: { color, core } };
        draw({ template: 'weapons:' + effect, look });
        if (projectile) {
            const profile = registry.getResource(trail);
            assert.equal(profile.kind, 'weapon_trail');
            assert.ok(profile.fade > 0 && profile.samples >= 2);
            draw({ template: projectile, direction: [1, 0], look });
        }
    }
});
