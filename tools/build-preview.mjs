// Builds the engine preview (tools/preview/) into one page that runs offline and anywhere a page may run only its own
// inline script: every engine module it imports and every library in src/game/data, inlined. Each module becomes a
// function of its exports (read through getters, so they stay live as in a module) and its imports; the engine runs
// as its source is written, with no bundler.
//   node tools/build-preview.mjs [--out "DFAB Preview.html"] [--check]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const OUT = resolve(ROOT, arg('--out') ?? 'DFAB Preview.html');
const ENTRY = join(ROOT, 'tools/preview/main.mjs');
const key = path => relative(ROOT, path).split(sep).join('/');
const list = text => text.split(',').map(s => s.trim()).filter(Boolean).map(s => { const [local, name = local] = s.split(/\s+as\s+/); return [local.trim(), name.trim()]; });

const modules = new Map(), order = [];
// The names a `const a = 1, b = [2, 3];` declares: each identifier before an `=` at the top depth, up to its end.
function declared(text, start) {
    const out = []; let depth = 0, expect = true;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (expect) { const m = /^\s*([\w$]+)/.exec(text.slice(i, i + 200)); if (!m) throw new Error(`cannot read a declaration at ${text.slice(i, i + 40)}`); out.push(m[1]); i += m[0].length - 1; expect = false; continue; }
        if (c === '"' || c === "'" || c === '`') { const q = c; for (i++; i < text.length && text[i] !== q; i++) if (text[i] === '\\') i++; continue; }
        if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; i--; continue; }
        if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 1; continue; }
        if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        else if (depth === 0 && c === ',') expect = true;
        else if (depth === 0 && c === ';') break;
        else if (depth === 0 && c === '\n' && !/^\s*[,.?:+\-*|&]/.test(text.slice(i + 1, i + 40)) && !/[=,(\[{+\-*|&?:]\s*$/.test(text.slice(Math.max(start, i - 40), i))) break;
    }
    return out;
}
// Turns one module's source into the body of its function: imports read from __req, exports kept as getters.
function transform(path) {
    const names = [], reexported = [], from = id => JSON.stringify(visit(resolve(dirname(path), id)));
    let source = readFileSync(path, 'utf8');
    source = source.replace(/^\s*import\s+([\s\S]*?)\s+from\s*(['"])([^'"]+)\2\s*(?:with\s*\{[^}]*\}\s*)?;?/gm, (all, what, q, id) => {
        const m = what.match(/^(?:([\w$]+)\s*,?\s*)?(?:\{([\s\S]*)\})?$/); if (!m) throw new Error(`${key(path)}: cannot read import ${what}`);
        const out = []; if (m[1]) out.push(`const ${m[1]} = __req(${from(id)}).default;`);
        if (m[2] !== undefined) out.push(`const { ${list(m[2]).map(([a, b]) => a === b ? a : `${a}: ${b}`).join(', ')} } = __req(${from(id)});`);
        return out.join(' ');
    });
    source = source.replace(/^\s*import\s*(['"])([^'"]+)\1\s*;?/gm, (all, q, id) => `__req(${from(id)});`);
    source = source.replace(/^(\s*)export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3\s*;?/gm, (all, lead, what, q, id) => { for (const [, b] of list(what)) reexported.push(b); return `${lead}__from(__exports, __req(${from(id)}), ${JSON.stringify(list(what))});`; });
    source = source.replace(/^(\s*)export\s*\{([^}]*)\}\s*;?/gm, (all, lead, what) => { for (const [a, b] of list(what)) names.push([a, b]); return lead; });
    source = source.replace(/^(\s*)export\s+((?:async\s+)?function\*?|class)\s+([\w$]+)/gm, (all, lead, kind, name) => { names.push([name, name]); return `${lead}${kind} ${name}`; });
    source = source.replace(/^(\s*)export\s+(const|let|var)\s+/gm, (all, lead, kind, at, text) => { for (const name of declared(text, at + all.length)) names.push([name, name]); return `${lead}${kind} `; });
    source = source.replace(/^(\s*)export\s+default\s+/gm, (all, lead) => `${lead}__exports.default = `);
    if (/^\s*export\s/m.test(source) || /^\s*import[\s{]/m.test(source)) throw new Error(`${key(path)}: an import or export the build cannot read is left`);
    const getters = names.map(([local, name]) => `${JSON.stringify(name)}: { get: () => ${local}, enumerable: true }`).join(', ');
    return { source: `Object.defineProperties(__exports, { ${getters} });\n${source}`, names: [...names.map(n => n[1]), ...reexported] };
}
function visit(path) {
    const id = key(path); if (modules.has(id)) return id;
    modules.set(id, null);
    modules.set(id, path.endsWith('.json') ? { source: `__exports.default = ${readFileSync(path, 'utf8').trim()};`, names: ['default'] } : transform(path));
    order.push(id); return id;
}
const entry = visit(ENTRY);

// --check: every engine module's exports, as Node imports them, are the ones the build gives.
if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [id, { names }] of modules) {
        if (id.endsWith('.json') || id.startsWith('tools/')) continue;
        const real = Object.keys(await import(pathToFileURL(join(ROOT, id)).href)).sort(), ours = [...new Set(names)].sort();
        const missing = real.filter(n => !ours.includes(n)), extra = ours.filter(n => !real.includes(n));
        if (missing.length || extra.length) { bad++; console.error(`${id}: the build misses ${missing.join(', ') || 'nothing'} and adds ${extra.join(', ') || 'nothing'}`); }
    }
    if (bad) process.exit(1);
}

const data = dir => readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8')));
// The game's libraries and maps, and the engine's example bar cart, which the apartment stands in its kitchen.
const libraries = [JSON.parse(readFileSync(join(ROOT, 'src/engine/penthouse/examples/bar-cart.json'), 'utf8')), ...data('src/game/data/libraries'), ...data('src/game/data/maps')];
// Inside a script element only "</script" could end it early; "<\/" means the same in JSON and in a string.
const safe = text => text.replace(/<\/(script)/gi, '<\\/$1');
const script = `"use strict";
(() => {
const __defs = {}, __cache = {};
const __req = id => { if (__cache[id]) return __cache[id]; const exports = __cache[id] = {}; __defs[id](exports, __req); return exports; };
const __from = (exports, source, names) => { for (const [local, name] of names) Object.defineProperty(exports, name, { get: () => source[local], enumerable: true }); };
${order.map(id => `__defs[${JSON.stringify(id)}] = ${id === entry ? 'async ' : ''}function (__exports, __req) {\n${modules.get(id).source}\n};`).join('\n')}
__req(${JSON.stringify(entry)});
})();`;
const page = readFileSync(join(ROOT, 'tools/preview/shell.html'), 'utf8').replace('<!--PREVIEW-->', () =>
    `<script type="application/json" id="preview-data">${safe(JSON.stringify(libraries))}</script>\n<script>\n${safe(script)}\n</script>`);
writeFileSync(OUT, page);
console.log(`${relative(ROOT, OUT)}: ${order.length} modules, ${libraries.length} libraries, ${(page.length / 1e6).toFixed(1)} MB`);
