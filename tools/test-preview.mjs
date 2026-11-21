// The engine preview, built and played in Chromium: it boots on the apartment, every map loads from the picker, and
// a walker takes the apartment's exit to the city and the Silver Queen's door back in.
// Run: node --test tools/test-preview.mjs   (needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(import.meta.url), '../..');
let chromium = null; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

test('the preview boots, loads every map and travels between the apartment and the city', { skip: !chromium && 'Playwright is not installed', timeout: 240000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-')), out = join(dir, 'preview.html');
    execFileSync(process.execPath, [join(root, 'tools/build-preview.mjs'), '--check', '--out', out]);
    const browser = await chromium.launch(), errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(out).href);
        await page.waitForFunction(() => window.preview?.active_level, null, { timeout: 60000 });
        const state = () => page.evaluate(() => ({ level: preview.active_level?.level_id, at: [...preview.basement.elements.getEntities({ kind: 'character' })[0].position], prompt: document.getElementById('prompt').classList.contains('show') ? document.getElementById('exit-label').textContent : null }));
        assert.equal((await state()).level, 'apt_949', 'it opens in the apartment');
        // Every map from the picker.
        const maps = await page.evaluate(async () => {
            const out = {}, select = document.getElementById('maps');
            for (const id of [...select.options].map(o => o.value)) {
                select.value = id; select.dispatchEvent(new Event('change'));
                const t0 = performance.now(); while (preview.active_level?.level_id !== id && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 50));
                out[id] = preview.active_level?.level_id === id;
            }
            return out;
        });
        assert.equal(Object.keys(maps).length, 21); assert.deepEqual(Object.entries(maps).filter(([, ok]) => !ok), [], 'every map loads');
        // Into the apartment, onto its exit, and out to the city.
        const go = id => page.evaluate(async id => { const s = document.getElementById('maps'); s.value = id; s.dispatchEvent(new Event('change')); while (preview.active_level?.level_id !== id) await new Promise(r => setTimeout(r, 50)); }, id);
        const put = at => page.evaluate(at => { const e = preview.basement.elements.getEntities({ kind: 'character' })[0]; preview.basement.physics.updateBody(e, { position: at }); }, at);
        const until = (test, ms = 30000) => page.waitForFunction(test, null, { timeout: ms });
        await go('apt_949'); await put([700, 880]);
        await until(() => document.getElementById('prompt').classList.contains('show'));
        assert.equal((await state()).prompt, 'Exit to City');
        await page.keyboard.press('e'); await until(() => preview.active_level?.level_id === 'sdc');
        const outside = await state();
        assert.ok(Math.abs(outside.at[0] - 327.5) < 2 && outside.at[1] > 980 && outside.at[1] < 1100, `out of the Silver Queen's door onto the street (${outside.at})`);
        assert.equal(outside.prompt, null, 'the apartment\'s exit prompt went with the apartment');
        // Back up the steps and in.
        await page.keyboard.down('w'); await until(() => document.getElementById('prompt').classList.contains('show')); await page.keyboard.up('w');
        assert.equal((await state()).prompt, 'Enter the Silver Queen');
        await page.keyboard.press('e'); await until(() => preview.active_level?.level_id === 'apt_949');
        const inside = await state();
        assert.ok(inside.at[1] < 860 && Math.abs(inside.at[0] - 700) < 2, `back inside, above its exit (${inside.at})`);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); rmSync(dir, { recursive: true, force: true }); }
});
