// Enforces the folder rules in READ-FIRST/ENGINE-ARCHITECTURE.md:
//   0. src/ holds only engine/: code that follows the Engine API spec (a game is written on it, to the same rules)
//   1. classic code lives only in reference/classic/, read-only (no .js, .cjs or .css in src; .html only in examples/)
//   2. nothing in src/ imports from reference/, and classic scripts import nothing (they reach the
//      new engine only through the bundled DFNative object)
//   3. src/engine/ runs standalone: each level imports only the levels the dependency table allows,
//      never reference/classic/ or an unsorted folder, carries its level banner, and names no game
//   node tools/check-layout.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..'), SRC = join(ROOT, 'src');
const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = p => relative(SRC, p).split(sep).join('/');
const CLASSIC = join(ROOT, 'reference', 'classic');
const files = walk(SRC).map(p => ({ path: p, rel: rel(p) }));
const classic = walk(CLASSIC);
const problems = [];

const LEVELS = { basement: 'LV0 BASEMENT', lobby: 'LV1 LOBBY', directory: 'LV2 DIRECTORY', penthouse: 'LV3 PENTHOUSE' };
const ALLOWED = {   // section 3 of the architecture file: which engine levels each level may import
    basement: ['basement'],
    lobby: ['basement', 'lobby'],
    directory: ['basement', 'directory'],
    penthouse: ['basement', 'directory', 'penthouse'],
    'game-engine.mjs': ['basement', 'lobby', 'directory', 'penthouse']   // the engine file: plugs every level in through its jack
};
const GAME_NAMES = /\bdf_|\bapartment|\bGAME_DB\b|\bDFNative\b|\bganger|\bvelvet|Dimensions Freelancer/i;
const importsOf = source => [...source.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] ?? m[2] ?? m[3]);

for (const f of files) {
    if (!/^engine\//.test(f.rel) && f.rel !== 'README.md') problems.push(`${f.rel}: src/ holds only engine/`);
    if (/\.(js|cjs|css)$/.test(f.rel)) problems.push(`${f.rel}: classic file in src/ (new code is .mjs; classic code is in reference/classic/)`);
    if (f.rel.endsWith('.html') && !f.rel.includes('/examples/')) problems.push(`${f.rel}: page in src/ that is not an example`);
    if (!f.rel.endsWith('.mjs')) continue;
    const source = readFileSync(f.path, 'utf8');
    for (const spec of importsOf(source)) {
        if (!spec.startsWith('.')) continue;
        const target = rel(resolve(dirname(f.path), spec));
        if (target.startsWith('../')) problems.push(`${f.rel}: imports ${target}, outside src/ (reference/ is read-only)`);
        const [root, level] = f.rel.split('/');
        if (root !== 'engine' || f.rel.includes('/tests/')) continue;
        const [troot, tlevel] = target.split('/');
        if (troot !== 'engine') problems.push(`${f.rel}: the engine imports ${target}, outside src/engine/`);
        else if (!ALLOWED[level]?.includes(tlevel)) problems.push(`${f.rel}: ${level} may not import ${tlevel} (${target})`);
    }
    const [root, level] = f.rel.split('/');
    if (f.rel === 'engine/game-engine.mjs') { if (!source.startsWith('// ===== ENGINE =====')) problems.push(`${f.rel}: must start with // ===== ENGINE =====`); const m = source.match(GAME_NAMES); if (m) problems.push(`${f.rel}: the engine names the game ("${m[0]}")`); }
    if (root === 'engine' && LEVELS[level]) {
        if (!source.startsWith(`// ===== ${LEVELS[level]} =====`)) problems.push(`${f.rel}: must start with // ===== ${LEVELS[level]} =====`);
        if (!f.rel.includes('/tests/')) { const m = source.match(GAME_NAMES); if (m) problems.push(`${f.rel}: the engine names the game ("${m[0]}")`); }
    }
}

for (const p of classic) if (/\.(js|cjs)$/.test(p)) {
    const source = readFileSync(p, 'utf8');
    if (/^\s*(import|export)\s[^(]/m.test(source) || /\brequire\s*\(\s*['"]/.test(source)) problems.push(`${relative(ROOT, p)}: a classic script imports a module; classic code reaches new code only through DFNative`);
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const count = prefix => files.filter(f => f.rel.startsWith(prefix)).length;
console.log(`Layout holds: ${classic.length} files in reference/classic, ${count('engine/')} in src/engine.`);
