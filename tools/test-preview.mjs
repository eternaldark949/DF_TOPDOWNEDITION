// The engine preview, built and played in Chromium: it boots on the apartment, every map loads from the picker, and
// a walker takes the apartment's exit to the city (its streets alive with traffic and people) and the Silver Queen's
// door back in.
// Run: node --test tools/test-preview.mjs   (needs Playwright with Chromium; skips without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { shotSteps } from './preview/shot-effects.mjs';

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
        // The main menu (engine UI, screens from data) is up over a paused game; Start New Game lets the game run.
        const screens = () => page.evaluate(() => ({ stack: preview.ui.stack, paused: preview.paused, input: preview.basement.controls.input_context }));
        await page.waitForFunction(() => preview.ui.isOpen('main'), null, { timeout: 10000 });
        assert.deepEqual(await screens(), { stack: ['hud', 'main'], paused: true, input: 'menu' });
        // A click on the words of a row starts the game as Enter would (the words are labels inside the pressable row).
        await page.click('[data-ui-item="new_game_text"]'); await page.waitForFunction(() => !preview.ui.isOpen('main'));
        assert.deepEqual(await screens(), { stack: ['hud'], paused: false, input: 'gameplay' });
        // Escape pauses into the pause menu; down four times reaches Settings past Save, Load and Inventory (inactive items are skipped), Enter opens it, and Escape twice returns to play.
        await page.keyboard.press('Escape'); await page.waitForFunction(() => preview.ui.isOpen('pause'));
        assert.deepEqual(await screens(), { stack: ['hud', 'pause'], paused: true, input: 'menu' });
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
        await page.waitForFunction(() => preview.ui.isOpen('pause.settings'));
        const sky = await page.evaluate(() => preview.weather.state);
        await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');   // Weather: one choice on
        await page.waitForFunction(sky => preview.weather.state !== sky, sky);
        const outfit = page.getByRole('switch', { name: 'Street Sorcerer (Long Sleeve)' });
        const wig = page.getByRole('switch', { name: 'Sorcerer’s Tail' });
        await outfit.click();
        await wig.click();
        assert.equal(await outfit.getAttribute('aria-checked'), 'true');
        assert.equal(await wig.getAttribute('aria-checked'), 'true');
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !preview.ui.isOpen('pause'));
        assert.deepEqual(await screens(), { stack: ['hud'], paused: false, input: 'gameplay' });
        assert.equal(await page.evaluate(() => document.querySelector('[data-ui-item="location"]').textContent), 'Silver Queen Apartments', 'the HUD reads the place it is in');
        const wardrobe = () => page.evaluate(() => {
            const { elements, rigs } = preview.basement.physics;
            const walker = elements.getEntities({ kind: 'character' }).find(entity => entity.name === 'walker');
            return {
                id: walker.entity_id,
                top: walker.get('look').values.sleeved_top ?? null,
                tail: walker.hasComponent('ponytail_0'),
                segments: rigs.getPhysicalChains(walker).find(chain => chain.chain_id === 'ponytail')?.segments.length ?? 0
            };
        });
        await page.waitForFunction(() => preview.ui.getValue('wardrobe.wig_ponytail_black') &&
            preview.basement.physics.elements.getEntities({ kind: 'character' })[0].hasComponent('ponytail_0'));
        const dressed = await wardrobe();
        assert.deepEqual(dressed, { id: dressed.id, top: '#1a0a2a', tail: true, segments: 6 });

        // Clear just the wig, leaving the outfit equipped and the player on the same entity.
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => preview.ui.isOpen('pause'));
        await page.locator('[data-ui="pause"] [data-ui-item="settings"]').first().click();
        await page.waitForFunction(() => preview.ui.isOpen('pause.settings'));
        await wig.click();
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        await page.waitForFunction(() => !preview.paused &&
            !preview.basement.physics.elements.getEntities({ kind: 'character' })[0].hasComponent('ponytail_0'));
        assert.deepEqual(await wardrobe(), { ...dressed, tail: false, segments: 0 });
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
        // The keys walk (up the steps), and on the door's mat the prompt shows. (The city's traffic and people slow a
        // software-drawn frame enough that a walker can cross the mat between two looks, so it is stood on it.)
        await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
        assert.ok((await state()).at[1] < outside.at[1] - 5, 'w walks up');
        const mat = await page.evaluate(() => { const b = preview.active_level.getExits().find(x => x.label === 'Enter the Silver Queen').bounds; return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; });
        await put(mat); await until(() => document.getElementById('prompt').classList.contains('show'));
        assert.equal((await state()).prompt, 'Enter the Silver Queen');
        assert.ok(await page.evaluate(() => preview.active_level.agents.getStatistics().agents > 20), 'the city\'s streets are alive');
        await page.keyboard.press('e'); await until(() => preview.active_level?.level_id === 'apt_949');
        const inside = await state();
        assert.ok(inside.at[1] < 860 && Math.abs(inside.at[0] - 700) < 2, `back inside, above its exit (${inside.at})`);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the touch HUD moves and aims independently, and only an armed sniper release fires', { skip: !chromium && 'Playwright is not installed', timeout: 90000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-touch-')), out = join(dir, 'preview.html');
    execFileSync(process.execPath, [join(root, 'tools/build-preview.mjs'), '--out', out]);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(out).href + '?nomenu');
        const aim = page.locator('[data-ui-item="touch_aim"]'), move = page.locator('[data-ui-item="touch_move"]');
        await aim.waitFor({ timeout: 30000 });
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
        const a = await aim.boundingBox(), m = await move.boundingBox();
        const right = { id: 2, x: Math.round(a.x + a.width / 2), y: Math.round(a.y + a.height / 2) };
        const left = { id: 1, x: Math.round(m.x + m.width / 2), y: Math.round(m.y + m.height / 2) };
        const walked = { ...left, x: left.x + 38 }, aimed = { ...right, y: right.y - 33 }, armed = { ...right, y: right.y - 73 };
        await page.evaluate(() => {
            preview.ui.setValue('preview_weapon', 'sniper_sara');
            window.previewFlashes = 0;
            preview.basement.physics.on('entityRegistered', ({ entity }) => {
                if (entity.template_id === 'weapons:flash') window.previewFlashes++;
            });
        });
        await page.waitForFunction(() => preview.basement.elements.getEntities().some(e => e.template_id === 'weapons:sniper_sara'));
        await touch('touchStart', [left, right]);
        await touch('touchMove', [walked, aimed]);
        await page.waitForFunction(() => {
            const controls = preview.basement.controls;
            return controls.direction('move')[0] > .3 && controls.direction('aim')[1] < -.2;
        });
        assert.equal(await aim.getAttribute('data-stick-state'), 'aiming');
        await touch('touchMove', [walked, armed]);
        assert.equal(await aim.getAttribute('data-stick-state'), 'armed');
        await touch('touchCancel', []);
        assert.equal(await aim.getAttribute('data-stick-state'), 'idle');
        assert.equal(await page.evaluate(() => window.previewFlashes), 0);

        await touch('touchStart', [right]);
        await touch('touchMove', [armed]);
        await touch('touchEnd', []);
        await page.waitForFunction(() => window.previewFlashes === 1);
        await page.evaluate(() => preview.ui.open('pause'));
        await aim.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
    } finally { await browser.close(); rmSync(dir, { recursive: true, force: true }); }
});


test('Classic shot effects use the traveled path and keep distinct trail signatures', () => {
    const shot = {
        points: [[0, 0], [100, 0], [325, 0], [350, 0]],
        color: '#ffd700', core: '#fffaff', trail_color: '#b48cff',
        streak_length: 25, remaining: .1, age: .1, lifetime: .7, seed: 4
    };
    const sniper = shotSteps({ ...shot, style: { fade: .1, long_tail: 300 } });
    assert.deepEqual(sniper[0].points[0], [50, 0]);
    assert.ok(sniper.every(step => step.points.at(-1)[0] === 350));

    const crackle = { fade: .1, flicker: .045, amplitude: 2.4, passes: 1 };
    const first = shotSteps({ ...shot, style: crackle });
    const next = shotSteps({ ...shot, style: crackle, age: .145 });
    assert.notDeepEqual(first, next, 'electrical trail changes at the flicker cadence');
    assert.ok(shotSteps({ ...shot, style: { ...crackle, passes: 2 } }).length > first.length);

    const wisp = shotSteps({ ...shot, remaining: 0,
        puffs: [{ at: [325, 0], born: 0, phase: 0 }],
        style: { fade: .065, sample_interval: .033333, lifetime: .833333, dust: '#ffd76a' }
    });
    assert.deepEqual(wisp.map(step => step.shape), ['glow', 'rectangle']);
    assert.ok(wisp.every(step => step.x < 350 && step.alpha > 0), 'dust lingers behind the ended streak');
});
