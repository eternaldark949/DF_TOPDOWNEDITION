// ===== LV0 BASEMENT =====
import { createSandbox } from './scene.mjs';
const scene = createSandbox();
scene.character.moveTo([240, 120]);
for (let i = 0; i < 120; i++) scene.step();
scene.shoot([540, 150]);
for (let i = 0; i < 60; i++) scene.step();
console.log(JSON.stringify({ character: scene.character.physics_controller.body.getState(), impacts: scene.impacts, statistics: scene.physics.getStatistics() }, null, 2));
