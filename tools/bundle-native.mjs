import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

/** Deterministic build-time linker for this project's static named-export ESM graph.
 * Each source keeps its own lexical scope. Unsupported syntax/cycles fail the build.
 * No runtime loader, network imports, globals in Basement, or duplicated maintained source.
 */
export function bundleNative(root, entry, binding = 'DFNative') {
    const modules = new Map(), visiting = new Set(), chunks = [];
    function visit(path) {
        path = resolve(path);
        if (visiting.has(path)) throw new Error(`Native bundle dependency cycle: ${relative(root, path)}`);
        if (modules.has(path)) return modules.get(path);
        const id = `m${modules.size}`, exports = new Map(); modules.set(path, id); visiting.add(path);
        let source = readFileSync(path, 'utf8');
        if (path.endsWith('.json')) {
            JSON.parse(source); chunks.push(`const ${id} = Object.freeze({default:${source.trim()}});`);
        } else {
            const dependency = spec => {
                if (!spec.startsWith('.')) throw new Error(`Only relative native imports are supported: ${spec}`);
                return visit(resolve(dirname(path), spec));
            };
            source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"](?:\s+with\s*\{[^}]*\})?\s*;/gm, (_, names, spec) => {
                const dep = dependency(spec);
                if (/^\{[\s\S]*\}$/.test(names.trim())) {
                    const fields = names.trim().slice(1, -1).split(',').filter(x => x.trim()).map(x => x.trim().replace(/\s+as\s+/, ':'));
                    return `const {${fields.join(',')}} = ${dep};`;
                }
                if (/^[A-Za-z_$][\w$]*$/.test(names.trim())) return `const ${names.trim()} = ${dep}.default;`;
                throw new Error(`Unsupported import in ${path}: ${names}`);
            });
            source = source.replace(/^export\s*\{([^}]+)\}\s*(?:from\s*['"]([^'"]+)['"]\s*)?;/gm, (_, names, spec) => {
                const dep = spec ? dependency(spec) : null;
                for (const field of names.split(',').filter(x => x.trim())) {
                    const [local, name = local] = field.trim().split(/\s+as\s+/);
                    exports.set(name, dep ? `${dep}.${local}` : local);
                }
                return '';
            });
            source = source.replace(/^export\s+(class|function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => { exports.set(name, name); return `${kind} ${name}`; });
            if (/^\s*(?:import|export)\s/m.test(source)) throw new Error(`Unsupported module syntax in ${path}`);
            const fields = [...exports].map(([name, value]) => `get ${name}(){return ${value};}`).join(',');
            chunks.push(`// ${relative(root, path).replaceAll('\\', '/')}\nconst ${id} = (()=>{\n${source}\nreturn Object.freeze({${fields}});\n})();`);
        }
        visiting.delete(path); return id;
    }
    const main = visit(resolve(root, entry));
    return `const ${binding} = (()=>{\n'use strict';\n${chunks.join('\n')}\nreturn ${main};\n})();\n`;
}
