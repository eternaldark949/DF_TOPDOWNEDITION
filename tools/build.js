/**
 * Build tool: flatten our deliberately small ES-module subset into one offline HTML.
 * Build-time Node only; the delivered game has no runtime dependencies or requests.
 * This is not a general JavaScript parser. Unsupported import/export forms fail loudly.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const modules=new Map(), visiting=new Set();

/** Emit dependencies first and wrap each module in its own lexical scope (no name collisions). */
async function bundle(path) {
  path=resolve(path);
  if (visiting.has(path)) throw new Error(`Cyclic import: ${path}`);
  if (modules.has(path)) return modules.get(path).id;
  visiting.add(path);
  let source=await readFile(path,'utf8');
  const id=`module${modules.size}`;
  // Reserve identity before visiting dependencies; final insertion order is topological below.
  modules.set(path,{id,code:null});
  const imports=[...source.matchAll(/^import \{([^}]+)\} from ['"]([^'"]+)['"];?$/gm)];
  for (const match of imports) {
    if (!match[2].startsWith('.')) throw new Error(`External runtime dependency: ${match[2]}`);
    const dependency=await bundle(resolve(dirname(path),match[2]));
    source=source.replace(match[0],`const {${match[1]}} = ${dependency};`);
  }
  const exports=[];
  // Collect and remove a supported export in ONE pass. Separate regexes can silently
  // strip a declaration without adding its name (notably generator functions).
  source=source.replace(/^export (class\s+|function\s*\*?\s+|const\s+)(\w+)/gm,(_match,kind,name)=>{
    exports.push(name);return `${kind}${name}`;
  });
  if (/^\s*(import|export)\s/m.test(source)) throw new Error(`Unsupported module syntax in ${path}`);
  const record=modules.get(path); modules.delete(path); modules.set(path,record);
  record.code=`// Source: ${relative(root,path)}\nconst ${id}=(()=>{\n${source}\nreturn {${exports.join(',')}};\n})();`;
  visiting.delete(path); return id;
}

await bundle(resolve(root,'examples/atrium/main.js'));
const code=[...modules.values()].map(m=>m.code).join('\n');
let html=await readFile(resolve(root,'examples/atrium/index.html'),'utf8');
// Escape closing-script syntax in embedded source without changing JavaScript semantics.
html=html.replace('<script type="module" src="./main.js"></script>',()=>`<script type="module">\n${code.replace(/<\/script/gi,'<\\/script')}\n</script>`);
await mkdir(resolve(root,'dist'),{recursive:true});
await writeFile(resolve(root,'dist/ETRNLNINE-Atrium.html'),html);
console.log(`Built ${modules.size} modules into dist/ETRNLNINE-Atrium.html (${Buffer.byteLength(html)} bytes).`);
