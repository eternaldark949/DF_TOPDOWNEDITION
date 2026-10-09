#!/usr/bin/env node
/*
 * Body v2 sketch sheets, drawn by the game's own renderer.
 *
 *   DFAB_BUILD=/path/to/pre-v2.html node docs/session-2026-10-09/body-sketch/render-sheets.cjs
 *
 * The hooks anchor on the renderer as it was before Body v2 shipped, so point
 * DFAB_BUILD at that build: git show d315f4a:"DFAB V8.html" > /tmp/pre-v2.html
 *
 * Needs Playwright with Chromium (PLAYWRIGHT_BROWSERS_PATH or a normal install).
 * Builds a scratch copy of "DFAB V8.html" with the sketch hooks (sketch-hooks.cjs,
 * body-v2-sketch.js) in the system temp folder, freezes gait, pose and weather,
 * and writes the PNG sheets next to this script. The game build is not touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { patchBuild } = require('./sketch-hooks.cjs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(process.execPath, '../../lib/node_modules/playwright'))); }

const ROOT = path.join(__dirname, '../../..');
const OUT = __dirname;
const PREVIEW = path.join(os.tmpdir(), 'dfab-body-sketch-preview.html');

// Cumulative steps: each column switches on one more part of the update
const STEPS = [
    ['Current', {}],
    ['+ Limbs', { limbs: true }],
    ['+ Hands & feet', { limbs: true, hands: true, feet: true }],
    ['+ Torso & shoulders', { limbs: true, hands: true, feet: true, torso: true }],
    ['+ Pelvis & leg roots', { limbs: true, hands: true, feet: true, torso: true, hips: true }],
    ['+ Head = full', { limbs: true, hands: true, feet: true, torso: true, hips: true, head: true }],
];
const FULL = STEPS[STEPS.length - 1][1];

/* Runs in the page: freezes everything that moves, then exposes __body() and sheet helpers. */
function pageSetup() {
    window.syncHumanoidGait = e => e._fake || { speed: 0, dirX: 1, dirY: 0 };
    window.weatherAt = () => null;
    const shade0 = humanShade;
    window.__lit = false;
    window.humanShade = (ctx, e, c) => (window.__lit ? shade0(ctx, e, c) : null);
    const FLAGS = ['limbs', 'hands', 'feet', 'torso', 'hips', 'head'];
    window.__flags = f => { for (const k of FLAGS) BODY_SKETCH[k] = !!(f && f[k]); };

    /** One body, facing up the sheet, centred at (cx, cy). pose: stand | walk | pistol | rifle | punch */
    window.__body = (ctx, cx, cy, scale, look, pose, flags, hook) => {
        __flags(flags);
        const e = { x: 4000 + Math.random() * 200, y: 4000, angle: 0, walkPhase: 0, type: 'npc' };
        const cfg = Object.assign({ pose: 'none', noShadow: true }, look);
        delete cfg.held;
        if (look.held) cfg.held = look.held;
        if (pose === 'walk') { e._fake = { speed: 5.2, dirX: 1, dirY: 0 }; e.walkPhase = Math.PI / 2; }
        if (pose === 'pistol') { cfg.stance = 'pistol'; cfg.weapon = { id: 'pistol', ready: true }; }
        if (pose === 'rifle') { cfg.stance = 'rifle'; cfg.weapon = { id: 'rifle', ready: true }; }
        if (hook) cfg._partHook = hook;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.rotate(-Math.PI / 2);
        try { drawProceduralHumanoid(ctx, e, cfg); } finally { ctx.restore(); __flags(null); }
    };

    /** The body as a flat silhouette in `color`, for context behind an isolated part. */
    window.__ghost = (ctx, cx, cy, scale, look, pose, flags, color) => {
        const c = document.createElement('canvas'); c.width = ctx.canvas.width; c.height = ctx.canvas.height;
        const g = c.getContext('2d');
        __body(g, cx, cy, scale, look, pose, flags);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(c, 0, 0);
    };
    /** Only `parts` drawn; everything else invisible. */
    window.__only = (ctx, cx, cy, scale, look, pose, flags, parts) => {
        const hook = (name, c) => { c.globalAlpha = parts.includes(name) ? 1 : 0; };
        ctx.save(); __body(ctx, cx, cy, scale, look, pose, flags, hook); ctx.restore();
    };

    const C = { bg: '#11141c', panel: '#1b2030', grid: 'rgba(255,255,255,0.035)', ink: '#eef0f6', dim: '#8d93a8', gold: '#e8c27a', ghost: 'rgba(150,160,190,0.16)' };
    window.__C = C;
    window.__sheet = (W, H) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d'); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';
        return { c, ctx };
    };
    window.__panel = (ctx, x, y, w, h) => {
        ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.clip();
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        for (let gx = x + 20; gx < x + w; gx += 20) { ctx.beginPath(); ctx.moveTo(gx + 0.5, y); ctx.lineTo(gx + 0.5, y + h); ctx.stroke(); }
        for (let gy = y + 20; gy < y + h; gy += 20) { ctx.beginPath(); ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + w, gy + 0.5); ctx.stroke(); }
        ctx.restore();
    };
    window.__text = (ctx, s, x, y, size, color, weight = 400, align = 'left') => {
        ctx.font = `${weight} ${size}px "DejaVu Sans", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
    };
    window.__title = (ctx, kicker, title, sub) => {
        __text(ctx, kicker, 36, 44, 15, C.dim, 500);
        __text(ctx, title, 36, 86, 34, C.ink, 700);
        __text(ctx, sub, 36, 116, 16, C.dim);
    };
}

const BARE = {
    female: { skinColor: '#c68e63', gender: 'female' },
    male: { skinColor: '#a8754e', gender: 'male' },
};

/* Sheet 1: each part on its own, today vs proposed, over the whole body's silhouette */
function sheetParts({ STEPS, FULL, BARE }) {
    const rows = [
        ['Head', 'egg, ears', ['head'], 'stand'],
        ['Torso & shoulders', 'deltoids, chest, back', ['torso'], 'stand'],
        ['Pelvis', 'hip bones, seat', ['hips'], 'stand'],
        ['Upper arm', 'shoulder → elbow', ['upperArms'], 'walk'],
        ['Forearm', 'elbow → wrist', ['forearms'], 'walk'],
        ['Hand, relaxed', 'along the forearm', ['hands'], 'walk'],
        ['Hand, gripping', 'a fist round the gun', ['hands', 'weapon'], 'pistol'],
        ['Thigh', 'hip → knee', ['thighs'], 'walk'],
        ['Calf', 'knee → ankle', ['calves'], 'walk'],
        ['Foot', 'heel, arch, ball, toes', ['feet'], 'walk'],
    ];
    const cellW = 250, cellH = 250, x0 = 250, y0 = 210, gap = 14;
    const cols = [['Female · today', BARE.female, {}], ['Female · proposed', BARE.female, FULL], ['Male · today', BARE.male, {}], ['Male · proposed', BARE.male, FULL]];
    const W = x0 + cols.length * (cellW + gap) + 22, H = y0 + rows.length * (cellH + gap) + 60;
    const { c, ctx } = __sheet(W, H);
    __title(ctx, 'DFAB  /  BODY V2 SKETCH  ·  1 OF 3', 'Part by part', 'The game’s own renderer. Each part alone, over the whole body’s silhouette. Hands, elbows, knees, feet, poses and colours stay where they are.');
    cols.forEach(([label, , flags], i) => __text(ctx, label, x0 + i * (cellW + gap) + cellW / 2, y0 - 16, 17, Object.keys(flags).length ? __C.gold : __C.dim, 600, 'center'));
    rows.forEach(([name, sub, parts, pose], r) => {
        const y = y0 + r * (cellH + gap);
        __text(ctx, name, 36, y + cellH / 2 - 2, 19, __C.ink, 600);
        __text(ctx, sub, 36, y + cellH / 2 + 22, 14, __C.dim);
        cols.forEach(([, look, flags], i) => {
            const x = x0 + i * (cellW + gap);
            __panel(ctx, x, y, cellW, cellH);
            const S = pose === 'stand' ? 5.6 : 4.4, cx = x + cellW / 2, cy = y + cellH / 2 + (pose === 'pistol' ? 52 : pose === 'walk' ? 4 : 8);
            ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cellW, cellH, 10); ctx.clip();
            __ghost(ctx, cx, cy, S, look, pose, flags, __C.ghost);
            __only(ctx, cx, cy, S, look, pose, flags, parts);
            ctx.restore();
        });
    });
    __text(ctx, 'Left/right pairs show both sides; the walking frame is mid-stride (left foot forward). Bare bodies, flat light, so the shapes read on their own.', 36, H - 26, 14, __C.dim);
    return c.toDataURL('image/png');
}

/* Sheet 2: the update switched on one part at a time, current → full */
function sheetBuildUp({ STEPS, BARE }) {
    const rows = [
        ['Female', 'standing', BARE.female, 'stand'],
        ['Female', 'mid-stride', BARE.female, 'walk'],
        ['Female', 'pistol', BARE.female, 'pistol'],
        ['Male', 'standing', BARE.male, 'stand'],
        ['Male', 'mid-stride', BARE.male, 'walk'],
        ['Male', 'rifle', BARE.male, 'rifle'],
    ];
    const S = 4.4, cellW = 230, cellH = 230, x0 = 170, y0 = 200, gap = 12;
    const W = x0 + STEPS.length * (cellW + gap) + 22, H = y0 + rows.length * (cellH + gap) + 56;
    const { c, ctx } = __sheet(W, H);
    __title(ctx, 'DFAB  /  BODY V2 SKETCH  ·  2 OF 3', 'Part by part, up to the full body', 'Left to right, each column switches on one more part of the update. Same frame, same pose, same palette.');
    STEPS.forEach(([label], i) => __text(ctx, label, x0 + i * (cellW + gap) + cellW / 2, y0 - 16, 16, i ? __C.gold : __C.dim, 600, 'center'));
    rows.forEach(([who, pose, look, P], r) => {
        const y = y0 + r * (cellH + gap);
        __text(ctx, who, 36, y + cellH / 2 - 2, 19, __C.ink, 600);
        __text(ctx, pose, 36, y + cellH / 2 + 22, 14, __C.dim);
        STEPS.forEach(([, flags], i) => {
            const x = x0 + i * (cellW + gap);
            __panel(ctx, x, y, cellW, cellH);
            ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cellW, cellH, 10); ctx.clip();
            __body(ctx, x + cellW / 2, y + cellH / 2 + (P === 'pistol' || P === 'rifle' ? 44 : 6), S, look, P, flags);
            ctx.restore();
        });
    });
    __text(ctx, 'Bare bodies, flat light. Builds, clothes and shading on sheet 3.', 36, H - 24, 14, __C.dim);
    return c.toDataURL('image/png');
}

/* Sheet 3: the cast dressed, lit, at sketch size and at the size the game draws them */
function sheetDressed({ FULL }) {
    const cast = [
        ['949', 'Street Casual', { ...APPEARANCES['949'], top: { type: 'sports_bra', color: '#111' }, bottom: { type: 'pants', color: '#e0e0e0' }, shoes: { type: 'sneakers', color: '#fff' } }],
        ['949', 'Periwinkle Silk', { ...APPEARANCES['949'], top: { type: 'sports_bra', color: '#CCCCFF' }, bottom: { type: 'skirt', color: '#CCCCFF' }, shoes: { type: 'heels', color: '#FFD700' } }],
        ['Victoria', 'suit, boots', APPEARANCES['Victoria']],
        ['Dr. Yin', 'slim, lab coat', APPEARANCES['Dr. Yin']],
        ['747', 'athletic, coat', APPEARANCES['747']],
        ['Max', 'tee, sneakers', APPEARANCES['Max']],
        ['Chef Koda', 'broad, apron', APPEARANCES['Chef Koda']],
        ['Bartender', 'vest, loafers', APPEARANCES['Bartender']],
    ];
    const cols = [['Standing · today', 'stand', {}], ['Standing · proposed', 'stand', FULL], ['Walking · today', 'walk', {}], ['Walking · proposed', 'walk', FULL]];
    const S = 3.6, cellW = 200, cellH = 196, x0 = 200, y0 = 200, gap = 12, gameW = 250;
    const W = x0 + cols.length * (cellW + gap) + gameW + 40, H = y0 + cast.length * (cellH + gap) + 56;
    const { c, ctx } = __sheet(W, H);
    __title(ctx, 'DFAB  /  BODY V2 SKETCH  ·  3 OF 3', 'Dressed and lit', 'The cast in their own clothes under daylight shading. Right: today and proposed at the size the game draws them (1× and 2×).');
    cols.forEach(([label, , flags], i) => __text(ctx, label, x0 + i * (cellW + gap) + cellW / 2, y0 - 16, 16, Object.keys(flags).length ? __C.gold : __C.dim, 600, 'center'));
    const gx = x0 + cols.length * (cellW + gap) + 8;
    __text(ctx, 'In game  ·  today | proposed', gx + gameW / 2, y0 - 16, 16, __C.dim, 600, 'center');
    window.__lit = true;
    cast.forEach(([who, sub, look], r) => {
        const y = y0 + r * (cellH + gap);
        __text(ctx, who, 36, y + cellH / 2 - 2, 19, __C.ink, 600);
        __text(ctx, sub, 36, y + cellH / 2 + 22, 14, __C.dim);
        cols.forEach(([, pose, flags], i) => {
            const x = x0 + i * (cellW + gap);
            __panel(ctx, x, y, cellW, cellH);
            ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cellW, cellH, 10); ctx.clip();
            __body(ctx, x + cellW / 2, y + cellH / 2 + 4, S, look, pose, flags);
            ctx.restore();
        });
        __panel(ctx, gx, y, gameW, cellH);
        ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.roundRect(gx, y, gameW, cellH, 10); ctx.fill();   // pavement grey, as in the city
        [[{}, 0], [FULL, 1]].forEach(([flags, k]) => {
            const bx = gx + 62 + k * 126;
            __body(ctx, bx, y + 34, 1, look, 'walk', flags);
            __body(ctx, bx, y + 136, 2, look, 'walk', flags);
        });
    });
    window.__lit = false;
    __text(ctx, 'Clothes follow the new torso, pelvis and feet through three shared shapes; bespoke details (lapels, stripes, vest panels) are unchanged in this sketch.', 36, H - 24, 14, __C.dim);
    return c.toDataURL('image/png');
}

(async () => {
    const html = fs.readFileSync(process.env.DFAB_BUILD || path.join(ROOT, 'DFAB V8.html'), 'utf8');
    fs.writeFileSync(PREVIEW, patchBuild(html));
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('file://' + PREVIEW.split(path.sep).map(encodeURIComponent).join('/'));
        await page.waitForFunction(() => typeof drawProceduralHumanoid === 'function' && typeof BODY_SKETCH === 'object');
        await page.evaluate(pageSetup);
        await page.evaluate(`window.__sheetParts = ${sheetParts}; window.__sheetBuildUp = ${sheetBuildUp}; window.__sheetDressed = ${sheetDressed};`);
        const arg = { STEPS, FULL, BARE };
        const sheets = [
            ['DFAB-Body-V2-1-Parts.png', '__sheetParts'],
            ['DFAB-Body-V2-2-Build-Up.png', '__sheetBuildUp'],
            ['DFAB-Body-V2-3-Dressed.png', '__sheetDressed'],
        ];
        const only = process.argv[2];
        for (const [file, fn] of sheets) {
            if (only && !file.includes(only)) continue;
            const url = await page.evaluate(([f, a]) => window[f](a), [fn, arg]);
            fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
            console.log('wrote', file);
        }
        if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
