/** Packaging regression: JSON field names and HTML-looking text must remain inert data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { embedJSON } from '../tools/json-module.js';

test('embedded JSON preserves prototype-named keys and script-ending text without executing either',()=>{
 const data=JSON.parse('{"__proto__":{"polluted":true},"name":"</ScRiPt><b>portable</b>","text":"function(){ throw 1; }","nested":{"literal":"\\\\u003c","unicode":"☾"}}');
 const expression=embedJSON(data);
 assert.doesNotMatch(expression,/<\/script/i);
 const restored=runInNewContext(expression);
 assert.equal(JSON.stringify(restored),JSON.stringify(data));
 assert.equal(Object.hasOwn(restored,'__proto__'),true);
 assert.equal(restored.polluted,undefined);
 assert.equal(typeof restored.text,'string');
});
