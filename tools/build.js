/**
 * Build tool: flatten our deliberately small ES-module subset into one offline HTML.
 * Build-time Node only; the delivered game has no runtime dependencies or requests.
 * This is not a general JavaScript parser. Unsupported import/export forms fail loudly.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedStyles } from './styles-module.js';
import { embedJSON } from './json-module.js';

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
  const jsonImports=[...source.matchAll(/^import (\w+) from ['"]([^'"]+\.json)['"] with \{\s*type:\s*['"]json['"]\s*\};?$/gm)];
  for(const match of jsonImports){const data=JSON.parse(await readFile(resolve(dirname(path),match[2]),'utf8'));source=source.replace(match[0],()=>`const ${match[1]}=${embedJSON(data)};`);}
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

// Validate authored sources before emitting any delivery target.
const { ATRIUM_PROJECT }=await import('../examples/atrium/project.js');
const { FREELANCER_PROJECT }=await import('../games/freelancer/project.js');
if(!FREELANCER_PROJECT)throw new Error('No validated Freelancer project');
if(!ATRIUM_PROJECT)throw new Error('No validated project');
await mkdir(resolve(root,'dist'),{recursive:true});
for(const [folder,name] of [['examples/atrium','Atrium'],['editor','Studio'],['games/freelancer','Freelancer']]){
 modules.clear();visiting.clear();
 await bundle(resolve(root,folder,'main.js'));
 const code=[...modules.values()].map(m=>m.code).join('\n');
 const entry=resolve(root,folder,'index.html');
 let html=await embedStyles(await readFile(entry,'utf8'),entry,root);
 html=html.replace('<script type="module" src="./main.js"></script>',()=>`<script type="module">\n${code.replace(/<\/script/gi,'<\\/script')}\n</script>`);
 await writeFile(resolve(root,`dist/ETRNLNINE-${name}.html`),html);
 console.log(`Built ${modules.size} modules into dist/ETRNLNINE-${name}.html (${Buffer.byteLength(html)} bytes).`);
}
