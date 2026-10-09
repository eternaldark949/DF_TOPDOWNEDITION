/*
 * Splices body-v2-sketch.js into a scratch copy of the built game.
 * Each hook replaces one exact anchor in the build; an anchor that is
 * missing or found twice stops the build, so a drifted renderer fails loudly.
 * With every BODY_SKETCH flag off, the patched renderer draws today's body.
 */
const fs = require('fs');
const path = require('path');

const HOOKS = [
    // ── renderer: limbs ──
    ['h.drawLimb = (x1, y1, x2, y2, width, color, gloss) => {\n                const ctx = h.ctx, SH = h.shade;\n',
     'h.drawLimb = (x1, y1, x2, y2, width, color, gloss, taper) => {\n                const ctx = h.ctx, SH = h.shade;\n                if (taper && BODY_SKETCH.limbs) return _sketchLimb(ctx, SH, x1, y1, x2, y2, taper, color, gloss);\n'],
    ['if (build && build.shoulder) shoulderSpread *= build.shoulder;',
     'if (build && build.shoulder) shoulderSpread *= build.shoulder;\n            const BC = _sketchCanon(gender, config.build);\n            if (BODY_SKETCH.torso) shoulderSpread = BC.sh;'],
    ['const lBaseY = -hipWidth / 2 - 1;\n            const rBaseY = hipWidth / 2 + 1;',
     'const lBaseY = BODY_SKETCH.hips ? -BC.leg : -hipWidth / 2 - 1;\n            const rBaseY = BODY_SKETCH.hips ? BC.leg : hipWidth / 2 + 1;\n' +
     '            // legs hang from the pelvis: their roots turn with the hips\n' +
     '            const _hr = BODY_SKETCH.limbs ? hipRotation : 0, _hc = Math.cos(_hr), _hs = Math.sin(_hr);\n' +
     '            const lHipX = hipAnchorX - lBaseY * _hs, lHipY = lBaseY * _hc, rHipX = hipAnchorX - rBaseY * _hs, rHipY = rBaseY * _hc;'],
    ['const lKneeX = (hipAnchorX + lFootX) / 2;\n            const lKneeY = (lBaseY + lFootY) / 2;\n            const rKneeX = (hipAnchorX + rFootX) / 2;\n            const rKneeY = (rBaseY + rFootY) / 2;',
     'const lKneeX = (lHipX + lFootX) / 2;\n            const lKneeY = (lHipY + lFootY) / 2;\n            const rKneeX = (rHipX + rFootX) / 2;\n            const rKneeY = (rHipY + rFootY) / 2;'],
    ['g.torso.x = torsoXOff; g.torso.w = torsoWidth; g.hip.x = hipXOff; g.hip.w = hipWidth;',
     'g.torso.x = BODY_SKETCH.torso ? BC.tb : torsoXOff; g.torso.w = BODY_SKETCH.torso ? BC.tf - BC.tb : torsoWidth;\n' +
     '            g.hip.x = BODY_SKETCH.hips ? BC.hb : hipXOff; g.hip.w = BODY_SKETCH.hips ? BC.hf - BC.hb : hipWidth; g.sk = BC; _skFootK = BC.foot;'],
    ['g.hipPt[0][0] = hipAnchorX; g.hipPt[0][1] = lBaseY; g.hipPt[1][0] = hipAnchorX; g.hipPt[1][1] = rBaseY;',
     'g.hipPt[0][0] = lHipX; g.hipPt[0][1] = lHipY; g.hipPt[1][0] = rHipX; g.hipPt[1][1] = rHipY;'],
    // ── feet ──
    ['ctx.beginPath(); ctx.roundRect(lFootX - HEEL_TO_ANKLE, lFootY - FOOT_W / 2, FOOT_LEN, FOOT_W, 3); ctx.fill();',
     'if (BODY_SKETCH.feet) { _sketchFoot(ctx, lFootX, lFootY, -1, 0, false, BC.foot); _sketchFoot(ctx, rFootX, rFootY, 1, 0, false, BC.foot); } else {\n' +
     '                ctx.beginPath(); ctx.roundRect(lFootX - HEEL_TO_ANKLE, lFootY - FOOT_W / 2, FOOT_LEN, FOOT_W, 3); ctx.fill();'],
    ['ctx.beginPath(); ctx.roundRect(rFootX - HEEL_TO_ANKLE, rFootY - FOOT_W / 2, FOOT_LEN, FOOT_W, 3); ctx.fill();',
     'ctx.beginPath(); ctx.roundRect(rFootX - HEEL_TO_ANKLE, rFootY - FOOT_W / 2, FOOT_LEN, FOOT_W, 3); ctx.fill(); }'],
    // ── legs ──
    ["drawLimb(lKneeX, lKneeY, lFootX, lFootY, 3, legColor, legs === 'full' && botGloss);",
     "drawLimb(lKneeX, lKneeY, lFootX, lFootY, 3, legColor, legs === 'full' && botGloss, BC.calf);"],
    ["drawLimb(rKneeX, rKneeY, rFootX, rFootY, 3, legColor, legs === 'full' && botGloss);",
     "drawLimb(rKneeX, rKneeY, rFootX, rFootY, 3, legColor, legs === 'full' && botGloss, BC.calf);"],
    ['drawLimb(lFootX, lFootY, lFootX + (lKneeX - lFootX) * c, lFootY + (lKneeY - lFootY) * c, 3.4, bootColor);',
     'drawLimb(lFootX, lFootY, lFootX + (lKneeX - lFootX) * c, lFootY + (lKneeY - lFootY) * c, 3.4, bootColor, false, _SK_BOOT);'],
    ['drawLimb(rFootX, rFootY, rFootX + (rKneeX - rFootX) * c, rFootY + (rKneeY - rFootY) * c, 3.4, bootColor);',
     'drawLimb(rFootX, rFootY, rFootX + (rKneeX - rFootX) * c, rFootY + (rKneeY - rFootY) * c, 3.4, bootColor, false, _SK_BOOT);'],
    ["drawLimb(hipAnchorX, lBaseY, lKneeX, lKneeY, 4, thighColor, legs !== 'bare' && botGloss);",
     "drawLimb(lHipX, lHipY, lKneeX, lKneeY, 4, thighColor, legs !== 'bare' && botGloss, BC.thigh);"],
    ["drawLimb(hipAnchorX, rBaseY, rKneeX, rKneeY, 4, thighColor, legs !== 'bare' && botGloss);",
     "drawLimb(rHipX, rHipY, rKneeX, rKneeY, 4, thighColor, legs !== 'bare' && botGloss, BC.thigh);"],
    // ── pelvis ──
    ['ctx.beginPath(); ctx.roundRect(hipXOff, -11, hipWidth, 22, [8, 3, 3, 8]); ctx.fill();',
     'if (BODY_SKETCH.hips) ctx.fill(_sketchHipPath(BC, 0));\n            else { ctx.beginPath(); ctx.roundRect(hipXOff, -11, hipWidth, 22, [8, 3, 3, 8]); ctx.fill(); }'],
    // ── hands ──
    ['ctx.beginPath(); ctx.ellipse(lFistX, lFistY, 4, 3, 0, 0, Math.PI*2); ctx.fill();\n            ctx.beginPath(); ctx.ellipse(rFistX, rFistY, 4, 3, 0, 0, Math.PI*2); ctx.fill();',
     'if (BODY_SKETCH.hands) {\n' +
     "                const twoHands = stance === 'rifle' || stance === 'sniper' || stance === 'punch';   // a pistol's off hand stays relaxed\n" +
     "                _sketchHand(ctx, lElbowX, lElbowY, lFistX, lFistY, twoHands || glassHand === 'left', BC);\n" +
     "                _sketchHand(ctx, rElbowX, rElbowY, rFistX, rFistY, stance !== 'idle' || glassHand === 'right' || !!(config.weapon && config.weapon.id), BC);\n" +
     '            } else {\n' +
     '            ctx.beginPath(); ctx.ellipse(lFistX, lFistY, 4, 3, 0, 0, Math.PI*2); ctx.fill();\n            ctx.beginPath(); ctx.ellipse(rFistX, rFistY, 4, 3, 0, 0, Math.PI*2); ctx.fill(); }'],
    // ── arms ──
    ["drawLimb(lElbowX, lElbowY, lFistX, lFistY, 3, foreColor, sleeve === 'long' && topGloss);",
     "drawLimb(lElbowX, lElbowY, lFistX, lFistY, 3, foreColor, sleeve === 'long' && topGloss, BC.fore);"],
    ["drawLimb(rElbowX, rElbowY, rFistX, rFistY, 3, foreColor, sleeve === 'long' && topGloss);",
     "drawLimb(rElbowX, rElbowY, rFistX, rFistY, 3, foreColor, sleeve === 'long' && topGloss, BC.fore);"],
    ["drawLimb(shoulderX, lShoulderY, lElbowX, lElbowY, 3.5, upperColor, sleeve !== 'none' && topGloss);",
     '// arms hang from the shoulders: their roots turn with the torso\n' +
     '            const _tr = BODY_SKETCH.limbs ? torsoRotation : 0, _tc = Math.cos(_tr), _ts = Math.sin(_tr);\n' +
     "            drawLimb(shoulderX - lShoulderY * _ts, lShoulderY * _tc, lElbowX, lElbowY, 3.5, upperColor, sleeve !== 'none' && topGloss, BC.upper);"],
    ["drawLimb(shoulderX, rShoulderY, rElbowX, rElbowY, 3.5, upperColor, sleeve !== 'none' && topGloss);",
     "drawLimb(shoulderX - rShoulderY * _ts, rShoulderY * _tc, rElbowX, rElbowY, 3.5, upperColor, sleeve !== 'none' && topGloss, BC.upper);"],
    // ── torso ──
    ['ctx.fillStyle = darken(skinColor, 0.1);\n            ctx.beginPath(); ctx.roundRect(torsoXOff, -10, torsoWidth, 20, [3, 5, 5, 3]); ctx.fill();',
     'ctx.fillStyle = darken(skinColor, 0.1);\n            if (BODY_SKETCH.torso) ctx.fill(_sketchTorsoPath(BC, 0));\n            else { ctx.beginPath(); ctx.roundRect(torsoXOff, -10, torsoWidth, 20, [3, 5, 5, 3]); ctx.fill(); }'],
    ['ctx.beginPath(); ctx.arc(torsoXOff + torsoWidth - 1.5, -3.5, 3.5, 0, Math.PI*2); ctx.fill();\n                ctx.beginPath(); ctx.arc(torsoXOff + torsoWidth - 1.5, 3.5, 3.5, 0, Math.PI*2); ctx.fill();',
     'if (BODY_SKETCH.torso && BC.bust) { for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(BC.bust.x, s * BC.bust.y, BC.bust.r, 0, Math.PI*2); ctx.fill(); } } else {\n' +
     '                ctx.beginPath(); ctx.arc(torsoXOff + torsoWidth - 1.5, -3.5, 3.5, 0, Math.PI*2); ctx.fill();\n                ctx.beginPath(); ctx.arc(torsoXOff + torsoWidth - 1.5, 3.5, 3.5, 0, Math.PI*2); ctx.fill(); }'],
    // the deltoid caps, over the torso's edge (and over the top, in the sleeve's colour)
    ['            if (SH && SH.body) {                                            // the torso\'s form',
     '            if (BODY_SKETCH.torso) {\n' +
     '                const _c = Math.cos(torsoRotation), _s = Math.sin(torsoRotation), ex = x => x - hipAnchorX;\n' +
     "                const capCol = sleeve !== 'none' ? darken(sleeveCol, 0.12) : darken(skinColor, 0.12), pad = clothes.top && /jacket|coat/.test(clothes.top.type) ? 0.6 : 0;\n" +
     '                _sketchCaps(ctx, BC, capCol, ex(lElbowX) * _c + lElbowY * _s, -ex(lElbowX) * _s + lElbowY * _c, ex(rElbowX) * _c + rElbowY * _s, -ex(rElbowX) * _s + rElbowY * _c, pad);\n' +
     '            }\n' +
     '            if (SH && SH.body) {                                            // the torso\'s form'],
    ['const cx = torsoXOff + torsoWidth * 0.5;\n                if (SH.lx || SH.ly) _softSpot(ctx, cx - SH.lx * 2.5, -SH.ly * 7, torsoWidth * 1.5, 16, _SHADOW_RGB, SH.shA * 1.3);',
     'const cx = g.torso.x + g.torso.w * 0.5, tsw = BODY_SKETCH.torso ? (BC.sh + BC.del) * 1.3 : 16;\n                if (SH.lx || SH.ly) _softSpot(ctx, cx - SH.lx * 2.5, -SH.ly * tsw * 0.44, g.torso.w * 1.5, tsw, _SHADOW_RGB, SH.shA * 1.3);'],
    // ── head ──
    ['ctx.fillStyle = skinColor;\n                ctx.beginPath(); ctx.arc(headX, 0, 8, 0, Math.PI*2); ctx.fill();',
     'ctx.fillStyle = skinColor;\n                if (BODY_SKETCH.head) _sketchHead(ctx, headX, skinColor);\n                else { ctx.beginPath(); ctx.arc(headX, 0, 8, 0, Math.PI*2); ctx.fill(); }'],

    // ── wardrobe: clothes follow the new torso, pelvis and feet ──
    ['const body = (ctx, g, c, shade = 0.1, y0 = -10, y1 = 10) => rr(',
     'const body = (ctx, g, c, shade = 0.1, y0 = -10, y1 = 10) => (BODY_SKETCH.torso && g.sk) ? _sketchFillTorso(ctx, g.sk, g.darken(c.color, shade), y0, y1, Math.max(0, (Math.abs(y1) - 10) * 0.8)) : rr('],
    ['for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(g.torso.x + g.torso.w - 1.2, s * 3.5, r, 0, Math.PI * 2); ctx.fill(); }',
     'if (BODY_SKETCH.torso && g.sk && g.sk.bust) { const B = g.sk.bust; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(B.x + 0.15, s * B.y, B.r * (r + 0.4) / 3.5, 0, Math.PI * 2); ctx.fill(); } }\n' +
     '                else for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(g.torso.x + g.torso.w - 1.2, s * 3.5, r, 0, Math.PI * 2); ctx.fill(); }'],
    ['rr(ctx, g.torso.x - 0.5, -11, g.torso.w + 1, 22, TORSO_R, g.darken(c.color, 0.1));',
     'if (BODY_SKETCH.torso && g.sk) _sketchFillTorso(ctx, g.sk, g.darken(c.color, 0.1), -99, 99, 0.8); else rr(ctx, g.torso.x - 0.5, -11, g.torso.w + 1, 22, TORSO_R, g.darken(c.color, 0.1));'],
    ['rr(ctx, g.torso.x, -10, g.torso.w, 20, TORSO_R, g.darken(shirt, 0.08));',
     'if (BODY_SKETCH.torso && g.sk) _sketchFillTorso(ctx, g.sk, g.darken(shirt, 0.08), -99, 99, 0); else rr(ctx, g.torso.x, -10, g.torso.w, 20, TORSO_R, g.darken(shirt, 0.08));'],
    ['rr(ctx, g.hip.x, -11, g.hip.w, 23, [8, 3, 3, 8], g.darken(c.color, 0.2));',
     'if (BODY_SKETCH.hips && g.sk) _sketchFillHip(ctx, g.sk, g.darken(c.color, 0.2), 0.5); else rr(ctx, g.hip.x, -11, g.hip.w, 23, [8, 3, 3, 8], g.darken(c.color, 0.2));'],
    ['rr(ctx, g.hip.x - 0.5, -11, g.hip.w + 0.5, 22, [7, 3, 3, 7], col);',
     'if (BODY_SKETCH.hips && g.sk) _sketchFillHip(ctx, g.sk, col, 0.3); else rr(ctx, g.hip.x - 0.5, -11, g.hip.w + 0.5, 22, [7, 3, 3, 7], col);'],
    ['rr(ctx, g.hip.x - 3, -13, g.hip.w + 3, 26, [10, 3, 3, 10], g.darken(c.color, 0.18));',
     'if (BODY_SKETCH.hips && g.sk) _sketchFillHip(ctx, g.sk, g.darken(c.color, 0.18), 1.8); else rr(ctx, g.hip.x - 3, -13, g.hip.w + 3, 26, [10, 3, 3, 10], g.darken(c.color, 0.18));'],
    ['const L = 12, W = 6, H = 3;',
     'if (BODY_SKETCH.feet) { const s = y < 0 ? -1 : 1; if (rim) { ctx.fillStyle = rim; _sketchFoot(ctx, x, y, s, 1.1, false, _skFootK); } ctx.fillStyle = color; _sketchFoot(ctx, x, y, s, 0.45, false, _skFootK); return; }\n                const L = 12, W = 6, H = 3;'],
    ['heels:    { draw(ctx, g, c) { ctx.fillStyle = g.darken(c.color, 0.55); for (const [x, y] of g.feet) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); } } },',
     'heels:    { draw(ctx, g, c) { ctx.fillStyle = g.darken(c.color, 0.55); if (BODY_SKETCH.feet) { for (const [x, y] of g.feet) _sketchFoot(ctx, x, y, y < 0 ? -1 : 1, 0.35, true, _skFootK); return; } for (const [x, y] of g.feet) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); } } },'],
];

// Capture labels for the part-by-part sheet: config._partHook(name, ctx) before each part
const PARTS = [
    ['            // --- DRAW WEAPON (Behind hands) ---\n', 'weapon'],
    ['            // --- NPC WEAPON', 'weapon'],
    ['            // 1. Feet\n', 'feet'],
    ['            // 2. Calves\n', 'calves'],
    ['            // 3. Thighs\n', 'thighs'],
    ['            // 4. Hips & Skirt\n', 'hips'],
    ['            // 5. Trains (Dress Train)\n', 'train'],
    ['            // 5b. Coat tails\n', 'train'],
    ['            // 6. Fists\n', 'hands'],
    ['            // 7. Forearms (fabric only under long sleeves)\n', 'forearms'],
    ['            // 8. Upper Arms (fabric under short or long sleeves)\n', 'upperArms'],
    ['            // 9. Torso\n', 'torso'],
    ['            // 10. Head & Hair\n', 'head'],
    ['            // 11. HELD ITEMS\n', 'held'],
];

function patchBuild(html) {
    const once = (src, old, rep) => {
        const n = src.split(old).length - 1;
        if (n !== 1) throw new Error(`sketch hook anchor found ${n}x: ${JSON.stringify(old.slice(0, 80))}`);
        return src.replace(old, () => rep);
    };
    for (const [old, rep] of HOOKS) html = once(html, old, rep);
    for (const [old, name] of PARTS) {
        const hook = `if (config._partHook) config._partHook('${name}', ctx);\n`;
        html = once(html, old, old.endsWith('\n') ? old + '            ' + hook : '            ' + hook + old);
    }
    const sketch = fs.readFileSync(path.join(__dirname, 'body-v2-sketch.js'), 'utf8');
    return once(html, '        const WARDROBE = (() => {', sketch + '\n        const WARDROBE = (() => {');
}

module.exports = { patchBuild };
