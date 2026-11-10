#!/usr/bin/env node
/** Reports the remaining legacy migration work. --check is a cutover gate, not a baseline-green check. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
const rules = [
    ['legacy_vehicle_creation', /\bnew\s+TrafficVehicle\s*\(/],
    ['legacy_pedestrian_creation', /\bnew\s+Pedestrian\s*\(/],
    ['legacy_spatial_index', /\b(?:class|new)\s+(?:SpatialGrid|SpatialHashGrid|OrderedCrowdPointGrid|RenderGrid|OrderedRenderGrid|EffectRenderGrid|TransitionGrid)\b/],
    ['legacy_physics_call', /\b(?:shapeKit|vehicleKit|collisionKit|collisionWorld|_physicsSpatial)\s*[.(]/],
    ['legacy_collision_owner', /\bclass\s+(?:CollisionSystem|collisionWorld)\b/],
    ['legacy_entity_base', /\bextends\s+GameEntity\b/],
];
const findings = [];
for (const path of files(join(root, 'src')).filter(p => /\.(?:m?js)$/.test(p) && !p.includes('/basement/physics/'))) {
    const code = readFileSync(path, 'utf8');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^(?:\/\/|\*|\/\*)/.test(line)) continue;
        for (const [kind, pattern] of rules) if (pattern.test(line)) findings.push({ kind, file: relative(root, path), line: i + 1, code: line });
    }
}
const by_kind = {};
for (const f of findings) by_kind[f.kind] = (by_kind[f.kind] ?? 0) + 1;
const report = { migration_complete: findings.length === 0, scope: 'Known legacy owners and API references. This is a retirement gate; it does not prove absence of every hand-written physical calculation.', by_kind, findings };
const output = process.argv.indexOf('--output');
if (output !== -1) {
    if (!process.argv[output + 1]) throw new Error('--output requires a file path');
    writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
    console.log(report.migration_complete ? 'Known legacy physics owners retired.' : 'Physics migration is incomplete.');
    for (const [kind, count] of Object.entries(by_kind)) console.log(`  ${kind}: ${count}`);
    console.log(report.scope);
}
if (process.argv.includes('--check') && !report.migration_complete) process.exitCode = 1;
