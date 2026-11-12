// Enforces the folder rules in READ-FIRST/ENGINE-ARCHITECTURE.md:
//   1. classic code lives only in src/legacy/ (no .js, .cjs or .css elsewhere in src; .html only in examples/)
//   2. nothing outside src/legacy/ imports from it, and legacy scripts import nothing (they reach the
//      new engine only through the bundled DFNative object)
//   0. src/ holds only engine/, game/ and legacy/
//   3. src/engine/ runs standalone: each level imports only the levels the dependency table allows,
//      never src/game/, src/legacy/ or an unsorted folder, carries its level banner, and names no game
//   node tools/check-layout.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..'), SRC = join(ROOT, 'src');
const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = p => relative(SRC, p).split(sep).join('/');
const files = walk(SRC).map(p => ({ path: p, rel: rel(p) }));
const problems = [];

const LEVELS = { basement: 'LV0 BASEMENT', lobby: 'LV1 LOBBY', directory: 'LV2 DIRECTORY', penthouse: 'LV3 PENTHOUSE' };
const ALLOWED = {   // section 3 of the architecture file: which engine levels each level may import
    basement: ['basement'],
    lobby: ['basement', 'lobby'],
    directory: ['basement', 'directory'],
    penthouse: ['basement', 'directory', 'penthouse']
};
const GAME_NAMES = /\bdf_|\bapartment|\bGAME_DB\b|\bDFNative\b|\bganger|\bvelvet|Dimensions Freelancer/i;
const importsOf = source => [...source.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] ?? m[2] ?? m[3]);

for (const f of files) {
    if (!/^(engine|game|legacy)\//.test(f.rel) && f.rel !== 'README.md') problems.push(`${f.rel}: src/ holds only engine/, game/ and legacy/`);
    const legacy = f.rel.startsWith('legacy/');
    if (!legacy && /\.(js|cjs|css)$/.test(f.rel)) problems.push(`${f.rel}: classic file outside src/legacy/ (new code is .mjs; classic code is quarantined)`);
    if (!legacy && f.rel.endsWith('.html') && !f.rel.includes('/examples/')) problems.push(`${f.rel}: page outside src/legacy/ and not an example`);
    if (legacy && /\.(js|cjs)$/.test(f.rel)) {
        const source = readFileSync(f.path, 'utf8');
        if (/^\s*(import|export)\s[^(]/m.test(source) || /\brequire\s*\(\s*['"]/.test(source)) problems.push(`${f.rel}: a legacy script imports a module; legacy code reaches new code only through DFNative`);
    }
    if (legacy || !f.rel.endsWith('.mjs')) continue;
    const source = readFileSync(f.path, 'utf8');
    for (const spec of importsOf(source)) {
        if (!spec.startsWith('.')) continue;
        const target = rel(resolve(dirname(f.path), spec));
        if (target.startsWith('legacy/')) problems.push(`${f.rel}: imports quarantined ${target}`);
        const [root, level] = f.rel.split('/');
        if (root !== 'engine' || f.rel.includes('/tests/')) continue;
        const [troot, tlevel] = target.split('/');
        if (troot !== 'engine') problems.push(`${f.rel}: the engine imports ${target}, outside src/engine/`);
        else if (!ALLOWED[level]?.includes(tlevel)) problems.push(`${f.rel}: ${level} may not import ${tlevel} (${target})`);
    }
    const [root, level] = f.rel.split('/');
    if (root === 'engine' && LEVELS[level]) {
        if (!source.startsWith(`// ===== ${LEVELS[level]} =====`)) problems.push(`${f.rel}: must start with // ===== ${LEVELS[level]} =====`);
        if (!f.rel.includes('/tests/')) { const m = source.match(GAME_NAMES); if (m) problems.push(`${f.rel}: the engine names the game ("${m[0]}")`); }
    }
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const count = prefix => files.filter(f => f.rel.startsWith(prefix)).length;
console.log(`Layout holds: ${count('legacy/')} files quarantined in src/legacy, ${count('engine/')} in src/engine, ${count('game/')} in src/game.`);
