/** Architecture regression: prevent game imports, reversed dependencies, and extra runtime loops. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
import { resolve,dirname,relative } from 'node:path';

/** Recursively enumerate source files; no dependency on shell commands or platform separators. */
async function sources(path) {
  const files=[];
  for(const entry of await readdir(path,{withFileTypes:true})) {
    const child=resolve(path,entry.name);
    if(entry.isDirectory())files.push(...await sources(child));
    else if(entry.name.endsWith('.js'))files.push(child);
  }
  return files;
}

test('engine dependencies respect house boundaries and contain no Canvas2D or extra frame owners',async()=>{
  const root=resolve('engine'),files=await sources(root);
  const allowed={basement:['basement'],lobby:['lobby','basement'],directory:['directory','basement'],penthouse:['penthouse','basement']};
  for(const file of files) {
    const source=await readFile(file,'utf8'),path=relative(root,file).replaceAll('\\','/'),level=path.split('/')[0];
    assert.match(source,/^\/\*\*/,`${path} has a file explanation`);
    assert.doesNotMatch(source,/getContext\(['"]2d|OffscreenCanvas|\.prototype\s*\[/,path);
    if(level!=='lobby')assert.doesNotMatch(source,/requestAnimationFrame\(/,`${path} cannot own a loop`);
    for(const [,specifier]of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
      assert.ok(specifier.startsWith('.'),`No external runtime import: ${path}`);
      const target=relative(root,resolve(dirname(file),specifier)).replaceAll('\\','/');
      assert.ok(!target.startsWith('..'),`Engine cannot import game: ${path}`);
      if(allowed[level])assert.ok(allowed[level].includes(target.split('/')[0]),`${path} -> ${target}`);
    }
  }
});
