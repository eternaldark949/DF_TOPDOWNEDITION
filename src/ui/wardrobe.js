        /* =====================================================================
           WARDROBE — clothing, hats and jewelry for the procedural humanoid
           ---------------------------------------------------------------------
           A character's look is one plain object (every field optional; missing
           ones fall back to the old plain-colour drawing):

             { skinColor, gender: 'female'|'male'|'androgynous', hair: { type, color },
               top:    { type, color, trim?, inner? },   // inner = colour under an open jacket/coat
               bottom: { type, color, trim? },
               (any piece can carry finish: 'gloss' | 'matte' — shading is matte unless the item
                or its WARDROBE piece says gloss, e.g. leggings)
               shoes:  { type, color },
               hat:    { type, color, trim? } | null,
               jewelry: [ { type, color? }, ... ],
               train, held }

           Each piece below draws itself in the humanoid's local frame (+x is the
           way the character faces, y runs shoulder to shoulder) from the geometry
           drawProceduralHumanoid already works out, passed in as `g`:
             g.darken(hex, frac), g.skin, g.gender, g.walkCycle
             g.torso = { x, w }   (rect x..x+w, y -10..10, in the torso's rotated frame)
             g.hip   = { x, w }   (rect x..x+w, y -11..11, in the hips' rotated frame)
             g.headInTorso        head centre x in the torso frame
             g.feet/knees/fists/elbows/hipPt = [[lx,ly],[rx,ry]]  (hipPt = where each thigh starts)
             g.headX              head centre x in the body frame
             g.cloth(key, spec)   simulated cloth drawn in the current frame (see ui/cloth.js)
           Tops also say which parts of the arm are fabric (`sleeve`), bottoms which
           parts of the leg (`legs`), hats how much hair they hide (`hides`).
           Portrait versions take P = { cx, cy, fw, fh, w, h, eyeY, eyeSpacing }.
           ===================================================================== */
        const WARDROBE = (() => {
            // Geometry specs are shared read-only after construction. Most bodies use
            // the same local dimensions, so avoid recreating chains for every draw.
            const clothPieces = new Map();
            const pieceSpec = (key, a, b, c, build) => {
                const p = clothPieces.get(key);
                if (p && Object.is(p.a, a) && Object.is(p.b, b) && Object.is(p.c, c)) return p.spec;
                const spec = build(a, b, c); clothPieces.set(key, { a, b, c, spec }); return spec;
            };
            const coatSpec = (back, front, len, s) => {
                const mid = (front + back) / 2;
                return { segs: 3, stiffness: 0.1, damping: 0.88, keepOut: 7, chains: [
                    { a: { x: front - 1, y: s * 9 },  t: { x: front - 2, y: s * 13 } },
                    { a: { x: mid, y: s * 10.5 },     t: { x: back - len * 0.35, y: s * 13.3 } },
                    { a: { x: back, y: s * 8 },       t: { x: back - len * 0.85, y: s * 10.5 } },
                    { a: { x: back, y: s * 2 },       t: { x: back - len + 2.5, y: s * 1.5 } } ] };
            };
            const coatLeft = (back, front, len) => coatSpec(back, front, len, -1);
            const coatRight = (back, front, len) => coatSpec(back, front, len, 1);
            const hoodSpec = h => ({ segs: 2, stiffness: 0.22, damping: 0.8,
                chains: [{ a: { x: h - 4, y: 0 }, t: { x: h - 8, y: 0 } }] });
            // A narrow circular hem, with the Academy skirt's radial cloth response.
            const skirtSpec = (cx, width) => {
                const radius = Math.max(10.5, width / 2 + 3.5), chains = [];
                for (let i = 0; i < 16; i++) {
                    const angle = i / 16 * Math.PI * 2, ca = Math.cos(angle), sa = Math.sin(angle);
                    chains.push({ a: { x: cx + ca * radius, y: sa * radius },
                                  t: { x: cx + ca * (radius + 3), y: sa * (radius + 3) } });
                }
                return { segs: 2, stiffness: 0.16, damping: 0.85, keepOut: 7, closed: true, chains };
            };
            const crimsonTrainSpec = back => ({ segs: 6, stiffness: 0.055, damping: 0.89, chains: [
                { a: { x: back, y: -9 },   t: { x: -38, y: -16 } },
                { a: { x: back, y: -4.5 }, t: { x: -45, y: -9 } },
                { a: { x: back, y: 0 },    t: { x: -48, y: 0 } },
                { a: { x: back, y: 4.5 },  t: { x: -45, y: 9 } },
                { a: { x: back, y: 9 },    t: { x: -38, y: 16 } } ] });
            // Rounded, closed contour through a radial seam or hem, without per-draw point arrays.
            const ringContour = (ctx, chains, hem) => {
                const N = chains.length, at = i => {
                    const ch = chains[i % N]; return ch[hem ? ch.length - 1 : 0];
                };
                const last = at(N - 1), first = at(0);
                ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
                for (let i = 0; i < N; i++) {
                    const p = at(i), q = at(i + 1);
                    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
                }
                ctx.closePath();
            };
            const pleatedSpec = cx => {
                const N = 16, chains = [];
                for (let i = 0; i < N; i++) {
                    const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                    chains.push({ a: { x: cx + ca * 7, y: sa * 10.5 }, t: { x: cx + ca * 14.5, y: sa * 17.5 } });
                }
                return { segs: 2, stiffness: 0.16, damping: 0.85, keepOut: 7, chains };
            };
            const longSkirtSpec = (x0, xb) => {
                const mid = (x0 + xb) / 2;
                const ring = [[x0, 12, x0 - 1, 15], [mid, 13, mid - 2, 16], [xb + 2, 11, xb - 2, 13.5], [xb, 4, xb - 4, 5]];
                const chains = [...ring.map(([ax, ay, tx, ty]) => ({ a: { x: ax, y: -ay }, t: { x: tx, y: -ty } })),
                                ...ring.slice().reverse().map(([ax, ay, tx, ty]) => ({ a: { x: ax, y: ay }, t: { x: tx, y: ty } }))];
                return { segs: 2, stiffness: 0.12, damping: 0.87, keepOut: 6, chains };
            };
            const rr = (ctx, x, y, w, h, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
            const TORSO_R = [3, 5, 5, 3];
            const body = (ctx, g, c, shade = 0.1, y0 = -10, y1 = 10) => rr(ctx, g.torso.x, y0, g.torso.w, y1 - y0, TORSO_R, g.darken(c.color, shade));
            const bust = (ctx, g, c, shade = 0.15, r = 3) => {
                if (g.gender !== 'female') return;
                ctx.fillStyle = g.darken(c.color, shade);
                for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(g.torso.x + g.torso.w - 1.2, s * 3.5, r, 0, Math.PI * 2); ctx.fill(); }
            };
            const shoulderSeams = (ctx, g, c) => {
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath();
                for (const s of [-1, 1]) { ctx.moveTo(g.torso.x + 1, s * 7.5); ctx.lineTo(g.torso.x + g.torso.w - 1, s * 7.5); }
                ctx.stroke();
            };
            const collarRing = (ctx, g, color, r = 9.3, width = 2.2) => {
                ctx.strokeStyle = color; ctx.lineWidth = width;
                ctx.beginPath(); ctx.arc(g.headInTorso, 0, r, 0, Math.PI * 2); ctx.stroke();
            };
            const coatTail = (ctx, g, c, len) => {                       // the hem seen from above: flares past the hips, split at the back vent
                const back = g.hip.x + 1, front = g.hip.x + g.hip.w - 1;
                for (const s of [-1, 1]) {
                    const key = s < 0 ? 'coat_l' : 'coat_r';
                    const hem = g.cloth(key, pieceSpec(key, back, front, len, s < 0 ? coatLeft : coatRight));
                    drawClothPanel(ctx, hem, g.darken(c.color, 0.22), g.darken(c.color, 0.4));
                }
            };
            // Portrait helpers ------------------------------------------------
            const pShoulders = (ctx, P, color, neckW = 0.35) => {
                const { cx, cy, fw, fh } = P, bw = P.bw || 1;                // bw: shoulder breadth from the build
                ctx.fillStyle = color; ctx.beginPath();
                ctx.moveTo(cx - fw * neckW, cy + fh * 1.4);
                ctx.quadraticCurveTo(cx - fw * 1.8 * bw, cy + fh * 1.6, cx - fw * 2.5 * bw, cy + fh * 2.8);
                ctx.lineTo(cx + fw * 2.5 * bw, cy + fh * 2.8);
                ctx.quadraticCurveTo(cx + fw * 1.8 * bw, cy + fh * 1.6, cx + fw * neckW, cy + fh * 1.4);
                ctx.closePath(); ctx.fill();
            };
            const pNeckline = (ctx, P, color, depth, width = 0.45) => {   // skin showing through a neckline
                const { cx, cy, fw, fh } = P;
                ctx.fillStyle = color; ctx.beginPath();
                ctx.moveTo(cx - fw * width, cy + fh * 1.42);
                ctx.quadraticCurveTo(cx, cy + fh * (1.42 + depth), cx + fw * width, cy + fh * 1.42);
                ctx.closePath(); ctx.fill();
            };

            const tops = {
                suit: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        body(ctx, g, c);
                        const lx = g.torso.x + g.torso.w - 6;
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(lx, -4); ctx.lineTo(lx + 3, 0); ctx.lineTo(lx, 4); ctx.fill();
                        bust(ctx, g, c, 0.15, 3);
                    },
                    portrait(ctx, P, c, skinShadow) { pShoulders(ctx, P, c.color); pNeckline(ctx, P, '#f2f2f2', 0.55, 0.3); }
                },
                sports_bra: {
                    sleeve: 'none',
                    draw(ctx, g, c) {
                        body(ctx, g, c);
                        bust(ctx, g, c, 0.15, 3.5);
                        ctx.fillStyle = g.darken(c.color, 0.05);
                        const x = g.torso.x, w = g.torso.w;
                        ctx.beginPath(); ctx.moveTo(x + 2, -10); ctx.lineTo(x + w / 2, -2); ctx.lineTo(x + w / 2, 2); ctx.lineTo(x + 2, 10); ctx.lineTo(x, 10); ctx.lineTo(x, -10); ctx.fill();
                    },
                    portrait(ctx, P, c, skinShadow) { pShoulders(ctx, P, skinShadow); const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(cx, cy + fh * 2.55, fw * 1.6, fh * 0.55, 0, Math.PI, 0); ctx.fill(); ctx.strokeStyle = c.color; ctx.lineWidth = fw * 0.12; ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(cx + s * fw * 0.9, cy + fh * 2.1); ctx.lineTo(cx + s * fw * 0.75, cy + fh * 1.5); } ctx.stroke(); }
                },
                // The sports bra's fitted crop, with long sleeves to the wrist; a scooped neck in the portrait
                sleeved_crop: {
                    sleeve: 'long',
                    draw(ctx, g, c) { tops.sports_bra.draw(ctx, g, c); shoulderSeams(ctx, g, c); },
                    portrait(ctx, P, c, skinShadow) {
                        pShoulders(ctx, P, c.color); pNeckline(ctx, P, skinShadow, 0.55, 0.62);
                        const { cx, cy, fw, fh } = P; ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx - fw * 1.6, cy + fh * 2.6, fw * 3.2, fh * 0.08);   // the crop's hem
                    }
                },
                tshirt: {
                    sleeve: 'short',
                    draw(ctx, g, c) { body(ctx, g, c); shoulderSeams(ctx, g, c); bust(ctx, g, c, 0.16, 3); },
                    portrait(ctx, P, c, skinShadow) { pShoulders(ctx, P, c.color); pNeckline(ctx, P, skinShadow, 0.35); const { cx, cy, fw, fh } = P; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - fw * 0.47, cy + fh * 1.41); ctx.quadraticCurveTo(cx, cy + fh * 1.8, cx + fw * 0.47, cy + fh * 1.41); ctx.stroke(); }
                },
                tank: {
                    sleeve: 'none',
                    draw(ctx, g, c) { body(ctx, g, c, 0.1, -7.5, 7.5); bust(ctx, g, c, 0.16, 3); },
                    portrait(ctx, P, c, skinShadow) { pShoulders(ctx, P, skinShadow); const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color; ctx.beginPath(); ctx.moveTo(cx - fw * 1.0, cy + fh * 1.55); ctx.quadraticCurveTo(cx, cy + fh * 2.2, cx + fw * 1.0, cy + fh * 1.55); ctx.lineTo(cx + fw * 1.4, cy + fh * 2.8); ctx.lineTo(cx - fw * 1.4, cy + fh * 2.8); ctx.closePath(); ctx.fill(); }
                },
                crop_top: {
                    sleeve: 'none',
                    draw(ctx, g, c) {
                        body(ctx, g, c, 0.1, -8.5, 8.5); bust(ctx, g, c, 0.16, 3.2);
                        rr(ctx, g.torso.x - 0.5, -6, 2.6, 12, 1.2, g.darken(g.skin, 0.05));   // bare midriff at the waist
                    },
                    portrait(ctx, P, c, skinShadow) { tops.tank.portrait(ctx, P, c, skinShadow); const { cx, cy, fw, fh } = P; ctx.fillStyle = skinShadow; ctx.fillRect(cx - fw * 1.6, cy + fh * 2.55, fw * 3.2, fh * 0.3); }
                },
                turtleneck: {
                    sleeve: 'long',
                    draw(ctx, g, c) { body(ctx, g, c); bust(ctx, g, c, 0.16, 3); },
                    collar(ctx, g, c) { collarRing(ctx, g, g.darken(c.color, 0.02), 9.2, 2.6); },
                    portrait(ctx, P, c) { pShoulders(ctx, P, c.color); const { cx, cy, fw, fh } = P; rr(ctx, cx - fw * 0.5, cy + fh * 0.95, fw, fh * 0.6, fw * 0.2, c.color); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(cx - fw * 0.45, cy + fh * (0.95 + i * 0.13)); ctx.lineTo(cx + fw * 0.45, cy + fh * (0.95 + i * 0.13)); } ctx.stroke(); }
                },
                hoodie: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        body(ctx, g, c, 0.08, -10.5, 10.5); bust(ctx, g, c, 0.14, 3);
                        ctx.strokeStyle = c.trim || '#e8e8e8'; ctx.lineWidth = 0.8; ctx.beginPath();   // drawstrings
                        for (const s of [-1, 1]) { ctx.moveTo(g.torso.x + g.torso.w - 1, s * 2.5); ctx.lineTo(g.torso.x + g.torso.w + 2.5, s * 2.8); }
                        ctx.stroke();
                    },
                    collar(ctx, g, c) {                                   // the hood, bunched behind the neck; it bobs as you move
                        const h = g.headInTorso, bob = g.cloth('hood', pieceSpec('hood', h, 0, 0, hoodSpec))[0];
                        const dx = bob[2].x - (h - 8), dy = bob[2].y;
                        ctx.fillStyle = g.darken(c.color, 0.2);
                        ctx.beginPath(); ctx.ellipse(h - 7 + dx * 0.8, dy * 0.8, 4.2, 8.5, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = g.darken(c.color, 0.35);
                        ctx.beginPath(); ctx.ellipse(h - 7.5 + dx, dy, 2, 5.5, 0, 0, Math.PI * 2); ctx.fill();
                    },
                    portrait(ctx, P, c) {
                        const { cx, cy, fw, fh } = P;
                        ctx.fillStyle = g_d(c.color, 0.25); ctx.beginPath(); ctx.ellipse(cx, cy + fh * 1.35, fw * 1.25, fh * 0.45, 0, 0, Math.PI * 2); ctx.fill();   // hood folds
                        pShoulders(ctx, P, c.color, 0.6);
                        ctx.strokeStyle = c.trim || '#e8e8e8'; ctx.lineWidth = fw * 0.05; ctx.beginPath();
                        for (const s of [-1, 1]) { ctx.moveTo(cx + s * fw * 0.3, cy + fh * 1.55); ctx.lineTo(cx + s * fw * 0.35, cy + fh * 2.2); }
                        ctx.stroke();
                    }
                },
                track_jacket: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        body(ctx, g, c); bust(ctx, g, c, 0.14, 3);
                        ctx.strokeStyle = c.trim || '#f5f5f5'; ctx.lineWidth = 1.1; ctx.beginPath();   // stripes over the shoulders
                        for (const s of [-1, 1]) { ctx.moveTo(g.torso.x, s * 8.6); ctx.lineTo(g.torso.x + g.torso.w, s * 8.6); }
                        ctx.stroke();
                    },
                    collar(ctx, g, c) { collarRing(ctx, g, g.darken(c.color, 0.05), 9.1, 1.6); },
                    armStripe: true,
                    portrait(ctx, P, c) {
                        pShoulders(ctx, P, c.color); const { cx, cy, fw, fh } = P;
                        rr(ctx, cx - fw * 0.5, cy + fh * 1.1, fw, fh * 0.45, fw * 0.15, c.color);
                        ctx.strokeStyle = c.trim || '#f5f5f5'; ctx.lineWidth = fw * 0.07; ctx.beginPath();
                        ctx.moveTo(cx, cy + fh * 1.2); ctx.lineTo(cx, cy + fh * 2.8);                          // zip
                        for (const s of [-1, 1]) { ctx.moveTo(cx + s * fw * 1.3, cy + fh * 1.75); ctx.lineTo(cx + s * fw * 2.3, cy + fh * 2.75); }   // shoulder stripes
                        ctx.stroke();
                    }
                },
                jacket: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        rr(ctx, g.torso.x - 0.5, -11, g.torso.w + 1, 22, TORSO_R, g.darken(c.color, 0.1));   // a touch wider: padded shoulders
                        const front = g.torso.x + g.torso.w;
                        rr(ctx, front - 4, -3, 4, 6, 1.5, g.darken(c.inner || '#111', 0.05));                  // the top underneath
                        ctx.fillStyle = c.trim || g.darken(c.color, 0.02);                                       // lapels
                        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(front - 0.5, s * 3); ctx.lineTo(front - 5, s * 7); ctx.lineTo(front - 1, s * 7.5); ctx.closePath(); ctx.fill(); }
                    },
                    portrait(ctx, P, c, skinShadow) {
                        pShoulders(ctx, P, c.color, 0.55); const { cx, cy, fw, fh } = P;
                        ctx.fillStyle = c.inner || '#111'; ctx.beginPath(); ctx.moveTo(cx - fw * 0.55, cy + fh * 1.45); ctx.lineTo(cx, cy + fh * 2.8); ctx.lineTo(cx + fw * 0.55, cy + fh * 1.45); ctx.closePath(); ctx.fill();
                        ctx.fillStyle = c.trim || g_d(c.color, 0.2);
                        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * fw * 0.55, cy + fh * 1.45); ctx.lineTo(cx + s * fw * 0.95, cy + fh * 1.7); ctx.lineTo(cx + s * fw * 0.2, cy + fh * 2.5); ctx.closePath(); ctx.fill(); }
                    }
                },
                coat: {
                    sleeve: 'long',
                    draw(ctx, g, c) { tops.jacket.draw(ctx, g, c); },
                    collar(ctx, g, c) {                                   // turned-up collar behind the neck
                        ctx.strokeStyle = g.darken(c.color, 0.25); ctx.lineWidth = 2.4;
                        ctx.beginPath(); ctx.arc(g.headInTorso, 0, 9.4, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
                    },
                    tail(ctx, g, c) { coatTail(ctx, g, c, 9); },
                    portrait(ctx, P, c, skinShadow) {
                        tops.jacket.portrait(ctx, P, c, skinShadow); const { cx, cy, fw, fh } = P;
                        ctx.fillStyle = g_d(c.color, 0.15);                  // high collar
                        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * fw * 0.5, cy + fh * 1.45); ctx.lineTo(cx + s * fw * 0.85, cy + fh * 0.95); ctx.lineTo(cx + s * fw * 1.15, cy + fh * 1.55); ctx.closePath(); ctx.fill(); }
                    }
                },
                // Waistcoat over a shirt (inner, default white); the sleeves are the shirt's; bow tie in trim
                vest: {
                    sleeve: 'long', sleeveFrom: 'inner',
                    draw(ctx, g, c) {
                        const shirt = c.inner || '#f2f2f2';
                        rr(ctx, g.torso.x, -10, g.torso.w, 20, TORSO_R, g.darken(shirt, 0.08));
                        const front = g.torso.x + g.torso.w;
                        ctx.fillStyle = g.darken(c.color, 0.1);                  // the two vest panels, open in a V at the front
                        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.torso.x, s * 10); ctx.lineTo(front - 1, s * 9.5); ctx.lineTo(front - 1, s * 2); ctx.lineTo(g.torso.x + g.torso.w * 0.35, s * 1); ctx.lineTo(g.torso.x, s * 1.5); ctx.closePath(); ctx.fill(); }
                        bust(ctx, g, { color: c.color }, 0.14, 2.8);
                        ctx.fillStyle = c.trim || '#8b0000';                      // bow tie
                        ctx.beginPath(); ctx.moveTo(front - 1.5, 0); ctx.lineTo(front + 0.5, -2); ctx.lineTo(front + 0.5, 2); ctx.closePath(); ctx.fill();
                    },
                    portrait(ctx, P, c) {
                        const { cx, cy, fw, fh } = P, shirt = c.inner || '#f2f2f2';
                        pShoulders(ctx, P, shirt);
                        ctx.fillStyle = c.color;
                        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * fw * 0.45, cy + fh * 1.75); ctx.lineTo(cx + s * fw * 0.15, cy + fh * 2.8); ctx.lineTo(cx + s * fw * 1.6 * (P.bw || 1), cy + fh * 2.8); ctx.lineTo(cx + s * fw * 1.2, cy + fh * 1.7); ctx.closePath(); ctx.fill(); }
                        ctx.fillStyle = c.trim || '#8b0000';
                        ctx.beginPath(); ctx.moveTo(cx, cy + fh * 1.5); ctx.lineTo(cx - fw * 0.3, cy + fh * 1.38); ctx.lineTo(cx - fw * 0.3, cy + fh * 1.62); ctx.closePath(); ctx.moveTo(cx, cy + fh * 1.5); ctx.lineTo(cx + fw * 0.3, cy + fh * 1.38); ctx.lineTo(cx + fw * 0.3, cy + fh * 1.62); ctx.closePath(); ctx.fill();
                    }
                },
                // Doctor's white coat: breast pocket, a small red-cross pin, a swinging hem
                lab_coat: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        tops.jacket.draw(ctx, g, { ...c, color: c.color || '#f1f3f5' });
                        const front = g.torso.x + g.torso.w;
                        ctx.fillStyle = '#d9342b';
                        ctx.fillRect(front - 4, -7.2, 2.4, 0.8); ctx.fillRect(front - 3.6, -7.6, 0.8, 1.6);   // the pin
                    },
                    tail(ctx, g, c) { coatTail(ctx, g, { ...c, color: c.color || '#f1f3f5' }, 8); },
                    portrait(ctx, P, c, skinShadow) {
                        const col = c.color || '#f1f3f5';
                        tops.jacket.portrait(ctx, P, { ...c, color: col }, skinShadow);
                        const { cx, cy, fw, fh } = P;
                        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
                        ctx.strokeRect(cx + fw * 0.9, cy + fh * 2.1, fw * 0.55, fh * 0.35);                    // pocket
                        ctx.fillStyle = '#d9342b';
                        ctx.fillRect(cx - fw * 1.35, cy + fh * 2.02, fw * 0.3, fh * 0.07); ctx.fillRect(cx - fw * 1.235, cy + fh * 1.95, fw * 0.07, fh * 0.21);
                    }
                },
                // Medical scrubs: short sleeves, V-neck
                scrubs: {
                    sleeve: 'short',
                    draw(ctx, g, c) {
                        body(ctx, g, c); shoulderSeams(ctx, g, c); bust(ctx, g, c, 0.16, 3);
                        const front = g.torso.x + g.torso.w;
                        ctx.fillStyle = g.skin; ctx.beginPath(); ctx.moveTo(front - 1, -2.5); ctx.lineTo(front - 4.5, 0); ctx.lineTo(front - 1, 2.5); ctx.closePath(); ctx.fill();
                    },
                    portrait(ctx, P, c, skinShadow) {
                        pShoulders(ctx, P, c.color); const { cx, cy, fw, fh } = P;
                        ctx.fillStyle = skinShadow; ctx.beginPath(); ctx.moveTo(cx - fw * 0.45, cy + fh * 1.42); ctx.lineTo(cx, cy + fh * 2.05); ctx.lineTo(cx + fw * 0.45, cy + fh * 1.42); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = g_d(c.color, 0.2); ctx.lineWidth = 1.2; ctx.stroke();
                    }
                },
                // Double Nights staff jacket: mandarin collar, accent piping, the double-crescent mark
                dn_uniform: {
                    sleeve: 'long',
                    draw(ctx, g, c) {
                        body(ctx, g, c, 0.08); bust(ctx, g, c, 0.14, 3);
                        const front = g.torso.x + g.torso.w, accent = c.trim || '#e8c27a';
                        ctx.strokeStyle = accent; ctx.lineWidth = 0.8; ctx.beginPath();
                        ctx.moveTo(front - 1, -9); ctx.lineTo(front - 1, 9); ctx.stroke();                       // button line
                        drawDNEmblem(ctx, g.torso.x + g.torso.w * 0.55, -5, 1.9, accent);
                    },
                    collar(ctx, g, c) { collarRing(ctx, g, g.darken(c.color, 0.2), 9, 1.4); },
                    portrait(ctx, P, c) {
                        pShoulders(ctx, P, c.color); const { cx, cy, fw, fh } = P, accent = c.trim || '#e8c27a';
                        rr(ctx, cx - fw * 0.45, cy + fh * 1.05, fw * 0.9, fh * 0.45, fw * 0.12, g_d(c.color, 0.12));   // mandarin collar
                        ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, fw * 0.05);
                        ctx.beginPath(); ctx.moveTo(cx, cy + fh * 1.5); ctx.lineTo(cx, cy + fh * 2.8); ctx.stroke();
                        drawDNEmblem(ctx, cx - fw * 1.05, cy + fh * 2.05, fw * 0.2, accent);
                    }
                }
            };
            function g_d(hex, frac) { return darkenHex(hex, Math.floor(255 * frac)); }

            const bottoms = {
                pants:    { legs: 'full' },
                // Waist apron (color) over trousers (under); ties at the back
                apron:    { legs: 'full', hips(ctx, g, c) {
                    const front = g.hip.x + g.hip.w;
                    rr(ctx, front - 3, -8.5, 5.5, 17, [1, 3, 3, 1], g.darken(c.color, 0.12));
                    ctx.strokeStyle = g.darken(c.color, 0.3); ctx.lineWidth = 0.7; ctx.beginPath();
                    ctx.moveTo(g.hip.x + 1, -9.5); ctx.lineTo(front - 2, -9); ctx.moveTo(g.hip.x + 1, 9.5); ctx.lineTo(front - 2, 9);
                    ctx.moveTo(g.hip.x + 1, -2); ctx.lineTo(g.hip.x - 2, -3.5); ctx.moveTo(g.hip.x + 1, 2); ctx.lineTo(g.hip.x - 2, 3.5);   // bow at the back
                    ctx.stroke();
                } },
                leggings: { legs: 'full', shade: 0.5, finish: 'gloss', detail(ctx, g, c) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.6; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(g.hipPt[i][0], g.hipPt[i][1]); ctx.lineTo(g.feet[i][0], g.feet[i][1]); ctx.stroke(); } } },
                joggers:  { legs: 'full', detail(ctx, g, c) {
                    ctx.fillStyle = g.darken(c.color, 0.6);                 // cuffs at the ankles
                    for (let i = 0; i < 2; i++) { const [kx, ky] = g.knees[i], [fx, fy] = g.feet[i]; ctx.beginPath(); ctx.arc(kx + (fx - kx) * 0.82, ky + (fy - ky) * 0.82, 2.8, 0, Math.PI * 2); ctx.fill(); }
                    ctx.strokeStyle = c.trim || 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.9;   // side stripes
                    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(g.hipPt[i][0], g.hipPt[i][1]); ctx.lineTo(g.knees[i][0], g.knees[i][1]); ctx.stroke(); }
                } },
                cargo:    { legs: 'full', detail(ctx, g, c) {
                    ctx.fillStyle = g.darken(c.color, 0.5);                 // thigh pockets
                    for (const [[x1, y1], [x2, y2]] of [[g.hipPt[0], g.knees[0]], [g.hipPt[1], g.knees[1]]]) { const mx = x1 + (x2 - x1) * 0.55, my = y1 + (y2 - y1) * 0.55; ctx.beginPath(); ctx.roundRect(mx - 2, my - 1.8 + (my < 0 ? -1.4 : 1.4), 4, 3.6, 0.8); ctx.fill(); }
                } },
                shorts:   { legs: 'thigh', detail(ctx, g, c) { ctx.fillStyle = g.darken(c.color, 0.5); for (const [x, y] of g.knees) { ctx.beginPath(); ctx.arc(x + 1.5, y, 3.2, 0, Math.PI * 2); ctx.fill(); } } },
                skirt:    { legs: 'bare', hips(ctx, g, c) {
                    if (c.hem !== 'none') {
                        const cx = g.hip.x + g.hip.w / 2;
                        const hem = g.cloth('skirt', pieceSpec('skirt', cx, g.hip.w, 0, skirtSpec));
                        const N = hem.length, tip = i => { const ch = hem[i % N]; return ch[ch.length - 1]; };
                        // A filled, softly fluted skirt follows the existing cloth perimeter.
                        // Every other drawing control dips inward; simulation chains/spec stay unchanged.
                        const point = k => {
                            const i = (k >> 1) % N, p = tip(i), q = tip(i + 1), valley = k % 2;
                            const x = valley ? (p.x + q.x) / 2 : p.x, y = valley ? (p.y + q.y) / 2 : p.y;
                            const dx = x - cx, length = Math.hypot(dx, y) || 1, flute = valley ? -0.95 : 0.25;
                            return { x: x + dx / length * flute, y: y + y / length * flute };
                        };
                        const contour = () => {
                            const first = point(0), last = point(N * 2 - 1);
                            ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
                            for (let k = 0; k < N * 2; k++) {
                                const p = point(k), q = point((k + 1) % (N * 2));
                                ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
                            }
                            ctx.closePath();
                        };
                        let reach = 1;
                        for (let i = 0; i < N; i++) { const p = tip(i); reach = Math.max(reach, Math.hypot(p.x - cx, p.y)); }
                        const fabric = ctx.createRadialGradient(cx - 3, -4, 0, cx, 0, reach + 0.6);
                        fabric.addColorStop(0, c.color); fabric.addColorStop(0.48, g.darken(c.color, 0.06));
                        fabric.addColorStop(1, g.darken(c.color, 0.19));
                        ctx.save(); ctx.beginPath(); contour(); ctx.clip();
                        ctx.fillStyle = fabric; ctx.fill();
                        // Fine curved fold valleys and soft ridge highlights give the filled cloth depth.
                        // The small highlights keep the midnight-colour version visibly folded too.
                        ctx.lineCap = 'round';
                        for (let i = 0; i < N; i++) {
                            const root = hem[i][0], crest = tip(i), valley = point(i * 2 + 1);
                            const sx = cx + (root.x - cx) * 0.38, sy = root.y * 0.38;
                            ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 0.75; ctx.beginPath();
                            ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx + (valley.x - cx) * 0.65, valley.y * 0.65, valley.x, valley.y); ctx.stroke();
                            ctx.strokeStyle = 'rgba(234,229,248,0.11)'; ctx.lineWidth = 0.45; ctx.beginPath();
                            ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx + (crest.x - cx) * 0.62, crest.y * 0.62, crest.x, crest.y); ctx.stroke();
                        }
                        ctx.restore(); ctx.beginPath(); contour();
                        ctx.strokeStyle = g.darken(c.color, 0.3); ctx.lineWidth = 0.4; ctx.stroke();
                    }
                    rr(ctx, g.hip.x, -11, g.hip.w, 23, [8, 3, 3, 8], g.darken(c.color, 0.2));
                } },
                // Form-fitting: no cloth, it moves with her. Hugs the hips and the tops of the thighs; a back slit
                pencil_skirt: { legs: 'bare', hips(ctx, g, c) {
                    const col = g.darken(c.color, 0.18);
                    ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 6.5;
                    for (let i = 0; i < 2; i++) { const [hx, hy] = g.hipPt[i], [kx, ky] = g.knees[i]; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + (kx - hx) * 0.55, hy + (ky - hy) * 0.55); ctx.stroke(); }
                    ctx.lineCap = 'butt';
                    rr(ctx, g.hip.x - 0.5, -11, g.hip.w + 0.5, 22, [7, 3, 3, 7], col);
                    ctx.strokeStyle = g.darken(c.color, 0.34); ctx.lineWidth = 0.6; ctx.beginPath();
                    ctx.moveTo(g.hip.x + 0.5, -2); ctx.lineTo(g.hip.x - 1.5, 0); ctx.lineTo(g.hip.x + 0.5, 2);   // the slit at the back
                    ctx.moveTo(g.hip.x + g.hip.w - 1, -10); ctx.lineTo(g.hip.x + g.hip.w - 1, 10);                  // the waist seam
                    ctx.stroke();
                } },
                // A full circle of pleats all the way round, simulated as cloth: it swirls out as she turns and
                // bells behind her as she runs. Alternating pleat shades, a trim band, a frilled hem of scallops.
                pleated_skirt: { legs: 'bare', hips(ctx, g, c) {
                    const cx = g.hip.x + g.hip.w / 2, N = 16;
                    const ch = g.cloth('pleated_skirt', pieceSpec('pleated_skirt', cx, 0, 0, pleatedSpec));
                    const tip = k => ch[k % N][ch[k % N].length - 1], root = k => ch[k % N][0];
                    const base = g.darken(c.color, 0.12), deep = g.darken(c.color, 0.34), trim = c.trim || '#f4eee6';
                    // Pleats: alternating wedges from the waist to the hem
                    for (let i = 0; i < N; i++) {
                        const a0 = root(i), a1 = root(i + 1), t0 = tip(i), t1 = tip(i + 1);
                        ctx.fillStyle = i % 2 ? deep : base; ctx.beginPath();
                        ctx.moveTo(a0.x, a0.y); ctx.lineTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(a1.x, a1.y); ctx.closePath(); ctx.fill();
                    }
                    // A trim band near the hem, then the frill: two scallops per pleat
                    ctx.strokeStyle = trim; ctx.lineWidth = 0.9; ctx.beginPath();
                    for (let i = 0; i <= N; i++) { const t = tip(i), a = root(i), p = { x: a.x + (t.x - a.x) * 0.8, y: a.y + (t.y - a.y) * 0.8 }; ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y); }
                    ctx.stroke();
                    ctx.fillStyle = trim;
                    for (let i = 0; i < N; i++) {
                        const t0 = tip(i), t1 = tip(i + 1);
                        for (const f of [0.25, 0.75]) { const x = t0.x + (t1.x - t0.x) * f, y = t0.y + (t1.y - t0.y) * f; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
                    }
                    ctx.strokeStyle = g.darken(c.color, 0.45); ctx.lineWidth = 0.5; ctx.beginPath();
                    for (let i = 0; i <= N; i++) { const t = tip(i); ctx[i ? 'lineTo' : 'moveTo'](t.x, t.y); }
                    ctx.stroke();
                    // The waistband
                    ctx.fillStyle = deep; ctx.beginPath(); ctx.ellipse(cx, 0, 7.5, 11, 0, 0, Math.PI * 2); ctx.fill();
                } },
                long_skirt: { legs: 'full', shade: 0.25, hips(ctx, g, c) {
                    // The hem swings around the legs: a ring of chains from one front side, round the back, to the other
                    const x0 = g.hip.x + g.hip.w - 2, xb = g.hip.x - 2;
                    drawClothPanel(ctx, g.cloth('long_skirt', pieceSpec('long_skirt', x0, xb, 0, longSkirtSpec)),
                        g.darken(c.color, 0.24), g.darken(c.color, 0.34));
                    rr(ctx, g.hip.x - 3, -13, g.hip.w + 3, 26, [10, 3, 3, 10], g.darken(c.color, 0.18));
                    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.7; ctx.beginPath();
                    for (const y of [-6, 0, 6]) { ctx.moveTo(g.hip.x - 2, y); ctx.lineTo(g.hip.x + g.hip.w - 1, y * 0.8); }
                    ctx.stroke();
                } }
            };

            const soleFoot = (ctx, x, y, color, rim) => {
                const L = 12, W = 6, H = 3;
                if (rim) { ctx.fillStyle = rim; ctx.beginPath(); ctx.roundRect(x - H - 0.7, y - W / 2 - 0.7, L + 1.4, W + 1.4, 3.5); ctx.fill(); }
                ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - H, y - W / 2, L, W, 3); ctx.fill();
            };
            const shoes = {
                heels:    { draw(ctx, g, c) { ctx.fillStyle = g.darken(c.color, 0.55); for (const [x, y] of g.feet) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); } } },
                loafers:  { draw(ctx, g, c) { for (const [x, y] of g.feet) { soleFoot(ctx, x, y, g.darken(c.color, 0.55)); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 5, y - 1, 2.5, 2); } } },
                sneakers: { draw(ctx, g, c) {
                    for (const [x, y] of g.feet) {
                        soleFoot(ctx, x, y, g.darken(c.color, 0.35), '#f4f4f4');
                        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7;
                        ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 6, y); ctx.stroke();
                    }
                } },
                boots:    { calf: 0.45, draw(ctx, g, c) { for (const [x, y] of g.feet) soleFoot(ctx, x, y, g.darken(c.color, 0.5)); } }
            };
            shoes.shoes = shoes.loafers;                                      // old generic id

            const hats = {
                wide_brim: { hides: 'none', draw(ctx, hx, c, dyn) {
                    ctx.fillStyle = c.color || '#590e18'; ctx.strokeStyle = c.stroke || '#1a0505'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.ellipse(hx, -4 + (dyn.bounce || 0), 24, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = c.crownColor || c.color || '#70121e';
                    ctx.beginPath(); ctx.arc(hx, -4 + (dyn.bounce || 0), 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color || '#590e18'; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.75, fw * 2.3, fh * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c.crownColor || c.color || '#70121e'; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 1.05, fw * 1.05, fh * 0.5, 0, Math.PI, 0); ctx.fill(); } },
                beret: { hides: 'none', draw(ctx, hx, c) { ctx.fillStyle = c.color || '#222'; ctx.beginPath(); ctx.ellipse(hx - 2, -8, 10, 6, -0.2, 0, Math.PI * 2); ctx.fill(); },
                    portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color || '#222'; ctx.beginPath(); ctx.ellipse(cx - fw * 0.25, cy - fh * 0.95, fw * 1.2, fh * 0.35, -0.15, 0, Math.PI * 2); ctx.fill(); } },
                cap: { hides: 'none', draw(ctx, hx, c) {
                    ctx.fillStyle = g_d(c.color || '#222', 0.2); ctx.beginPath(); ctx.ellipse(hx + 8.5, 0, 5, 6.5, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();   // brim
                    ctx.fillStyle = c.color || '#222'; ctx.beginPath(); ctx.arc(hx - 0.5, 0, 8.4, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx - 8, 0); ctx.lineTo(hx + 7, 0); ctx.stroke();
                    ctx.fillStyle = c.trim || g_d(c.color || '#222', 0.3); ctx.beginPath(); ctx.arc(hx - 0.5, 0, 1.2, 0, Math.PI * 2); ctx.fill();
                }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color || '#222'; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.6, fw * 1.08, fh * 0.62, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = g_d(c.color || '#222', 0.2); ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.58, fw * 1.25, fh * 0.13, 0, 0, Math.PI); ctx.fill(); } },
                beanie: { hides: 'none', draw(ctx, hx, c) {
                    ctx.fillStyle = c.color || '#333'; ctx.beginPath(); ctx.arc(hx - 1, 0, 8.8, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.7; ctx.beginPath();
                    for (let i = -2; i <= 2; i++) { ctx.moveTo(hx - 8, i * 3); ctx.lineTo(hx + 5, i * 3); }
                    ctx.stroke();
                    ctx.fillStyle = c.trim || g_d(c.color || '#333', 0.25); ctx.beginPath(); ctx.arc(hx - 1, 0, 8.8, -0.7, 0.7); ctx.arc(hx - 1, 0, 6.2, 0.7, -0.7, true); ctx.closePath(); ctx.fill();   // folded band at the front
                }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.fillStyle = c.color || '#333'; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.55, fw * 1.1, fh * 0.75, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = c.trim || g_d(c.color || '#333', 0.25); ctx.fillRect(cx - fw * 1.1, cy - fh * 0.62, fw * 2.2, fh * 0.2); } },
                hood_up: { hides: 'most', back(ctx, hx, c) { ctx.fillStyle = g_d(c.color || '#222', 0.2); ctx.beginPath(); ctx.arc(hx - 1, 0, 10, 0, Math.PI * 2); ctx.fill(); },
                    draw(ctx, hx, c) {
                        ctx.strokeStyle = c.color || '#222'; ctx.lineWidth = 7; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.arc(hx - 1.5, 0, 6.2, Math.PI * 0.42, Math.PI * 1.58); ctx.stroke();
                        ctx.fillStyle = c.color || '#222'; ctx.beginPath(); ctx.arc(hx - 2.5, 0, 6.5, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(hx - 1.5, 0, 9.2, -1.1, 1.1); ctx.stroke();   // hood rim framing the face
                        ctx.lineCap = 'butt';
                    }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.strokeStyle = c.color || '#222'; ctx.lineWidth = fw * 0.42; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.05, fw * 1.2, fh * 1.18, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke(); } },
                headband: { hides: 'none', draw(ctx, hx, c) {
                    ctx.strokeStyle = c.color || '#8f8cf0'; ctx.lineWidth = 2.2;
                    ctx.beginPath(); ctx.moveTo(hx + 1.5, -8.3); ctx.quadraticCurveTo(hx + 3.5, 0, hx + 1.5, 8.3); ctx.stroke();
                    ctx.fillStyle = c.color || '#8f8cf0'; ctx.beginPath(); ctx.ellipse(hx - 7.5, 0, 2.2, 3, 0, 0, Math.PI * 2); ctx.fill();   // knot at the back
                }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.strokeStyle = c.color || '#8f8cf0'; ctx.lineWidth = fh * 0.13; ctx.beginPath(); ctx.ellipse(cx, cy - fh * 0.2, fw * 1.02, fh * 0.9, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); } },
                demon_horns: { hides: 'none', draw(ctx, hx, c) {                // two black horns sweeping back from the brow, gilt at the tips
                    for (const s of [-1, 1]) {
                        ctx.fillStyle = c.color || '#160406';
                        ctx.beginPath(); ctx.moveTo(hx + 2.5, s * 3.2); ctx.quadraticCurveTo(hx - 3, s * 9.5, hx - 11, s * 9);
                        ctx.quadraticCurveTo(hx - 4, s * 6.8, hx - 0.5, s * 2); ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = 'rgba(176,18,46,0.7)'; ctx.lineWidth = 0.6; ctx.stroke();
                        ctx.fillStyle = c.trim || '#e3a64a'; ctx.beginPath(); ctx.arc(hx - 10.6, s * 9, 0.9, 0, Math.PI * 2); ctx.fill();
                    }
                }, portrait(ctx, P, c) {
                    const { cx, cy, fw, fh } = P;
                    for (const s of [-1, 1]) {
                        ctx.fillStyle = c.color || '#160406'; ctx.beginPath();
                        ctx.moveTo(cx + s * fw * 0.35, cy - fh * 0.75); ctx.quadraticCurveTo(cx + s * fw * 0.9, cy - fh * 1.25, cx + s * fw * 1.15, cy - fh * 1.55);
                        ctx.quadraticCurveTo(cx + s * fw * 0.7, cy - fh * 1.05, cx + s * fw * 0.2, cy - fh * 0.85); ctx.closePath(); ctx.fill();
                        ctx.fillStyle = c.trim || '#e3a64a'; ctx.beginPath(); ctx.arc(cx + s * fw * 1.15, cy - fh * 1.55, fw * 0.05, 0, Math.PI * 2); ctx.fill();
                    }
                } },
                tiara: { hides: 'none', draw(ctx, hx, c) {
                    const gold = c.color || '#e8c27a';
                    ctx.strokeStyle = gold; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(hx, 0, 6.8, -1.1, 1.1); ctx.stroke();
                    ctx.fillStyle = gold;
                    for (let i = -2; i <= 2; i++) { const a = i * 0.45, r = i === 0 ? 9.8 : 8.6; ctx.beginPath(); ctx.moveTo(hx + Math.cos(a - 0.12) * 6.8, Math.sin(a - 0.12) * 6.8); ctx.lineTo(hx + Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(hx + Math.cos(a + 0.12) * 6.8, Math.sin(a + 0.12) * 6.8); ctx.fill(); }
                    ctx.fillStyle = c.trim || '#b89cff'; ctx.beginPath(); ctx.arc(hx + 7.2, 0, 1.2, 0, Math.PI * 2); ctx.fill();
                }, portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; const gold = c.color || '#e8c27a'; ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(cx - fw * 0.8, cy - fh * 0.78); for (let i = 0; i <= 8; i++) { const x = cx - fw * 0.8 + fw * 1.6 * i / 8; ctx.lineTo(x, cy - fh * (i % 2 ? 0.95 : (i === 4 ? 1.12 : 0.85))); } ctx.lineTo(cx + fw * 0.8, cy - fh * 0.72); ctx.closePath(); ctx.fill(); ctx.fillStyle = c.trim || '#b89cff'; ctx.beginPath(); ctx.arc(cx, cy - fh * 0.9, fw * 0.08, 0, Math.PI * 2); ctx.fill(); } }
            };

            const jewelry = {
                hoops: { at: 'head', underHair: true, draw(ctx, g, c) { ctx.strokeStyle = c.color || '#e8c27a'; ctx.lineWidth = 0.9; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(g.headX + 0.5, s * 8.6, 1.9, 0, Math.PI * 2); ctx.stroke(); } },
                    portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; ctx.strokeStyle = c.color || '#e8c27a'; ctx.lineWidth = fw * 0.05; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * fw * 1.02, cy + fh * 0.35, fw * 0.16, 0, Math.PI * 2); ctx.stroke(); } } },
                sunglasses: { at: 'head', draw(ctx, g, c) { ctx.fillStyle = c.color || '#141414'; ctx.beginPath(); ctx.roundRect(g.headX + 3.6, -5.5, 2.8, 11, 1.2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(g.headX + 4.2, -4.5, 0.8, 2.5); },
                    portrait(ctx, P, c) { const { cx, fw, eyeY, eyeSpacing } = P; ctx.fillStyle = c.color || '#141414'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * eyeSpacing, eyeY, fw * 0.33, fw * 0.22, 0, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = c.color || '#141414'; ctx.lineWidth = fw * 0.06; ctx.beginPath(); ctx.moveTo(cx - eyeSpacing + fw * 0.3, eyeY - fw * 0.05); ctx.lineTo(cx + eyeSpacing - fw * 0.3, eyeY - fw * 0.05); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * eyeSpacing - fw * 0.1, eyeY - fw * 0.07, fw * 0.08, fw * 0.04, -0.4, 0, Math.PI * 2); ctx.fill(); } } },
                necklace: { at: 'neck', draw(ctx, g, c) { const gold = c.color || '#d8d8e0'; ctx.strokeStyle = gold; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(g.headInTorso, 0, 9.6, -0.95, 0.95); ctx.stroke(); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(g.headInTorso + 10.2, 0, 1.3, 0, Math.PI * 2); ctx.fill(); },
                    portrait(ctx, P, c) { const { cx, cy, fw, fh } = P; const col = c.color || '#d8d8e0'; ctx.strokeStyle = col; ctx.lineWidth = fw * 0.04; ctx.beginPath(); ctx.moveTo(cx - fw * 0.42, cy + fh * 1.1); ctx.quadraticCurveTo(cx, cy + fh * 1.95, cx + fw * 0.42, cy + fh * 1.1); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy + fh * 1.62); ctx.lineTo(cx + fw * 0.08, cy + fh * 1.78); ctx.lineTo(cx, cy + fh * 1.92); ctx.lineTo(cx - fw * 0.08, cy + fh * 1.78); ctx.fill(); } },
                // The Freelancers' field mask: black, a sheen in `tint`, eye slits glowing in `eyes`.
                // In portraits it goes on under the fringe (at: 'face'); top-down, over the head.
                field_mask: { at: 'face', draw(ctx, g, c) {
                    const hx = g.headX;
                    ctx.fillStyle = c.color || '#0b0710';
                    ctx.beginPath(); ctx.arc(hx, 0, 8.3, -1.25, 1.25); ctx.arc(hx + 1.2, 0, 5.2, 1.1, -1.1, true); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = c.tint || '#5a2a8a'; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.7;
                    ctx.beginPath(); ctx.arc(hx, 0, 8.1, -1.1, 1.1); ctx.stroke(); ctx.globalAlpha = 1;
                    // the slits' glow: a cached glow sprite under each (no shadowBlur: it ran every frame on her)
                    const eye = c.eyes || '#e8c27a', a0 = ctx.globalAlpha;
                    ctx.globalAlpha = a0 * 0.75;
                    for (const s of [-1, 1]) drawGlow(ctx, hx + 6.2, s * 2.6, 3.4, eye, 0.3);
                    ctx.globalAlpha = a0; ctx.fillStyle = eye;
                    for (const s of [-1, 1]) { ctx.save(); ctx.translate(hx + 6.2, s * 2.6); ctx.rotate(s * 0.35); ctx.fillRect(-0.45, -1.3, 0.9, 2.6); ctx.restore(); }
                },
                    portrait(ctx, P, c) {
                        const { cx, cy, fw, fh, eyeY, eyeSpacing } = P, eyes = c.eyes || '#e8c27a';
                        ctx.save();
                        // The shell: the whole face from the brow down, jaw included
                        ctx.beginPath();
                        ctx.moveTo(cx - fw * 1.02, cy - fh * 0.42);
                        ctx.quadraticCurveTo(cx, cy - fh * 0.62, cx + fw * 1.02, cy - fh * 0.42);
                        ctx.lineTo(cx + fw * 1.02, cy);
                        ctx.quadraticCurveTo(cx + fw * 0.78, cy + fh * 1.12, cx, cy + fh * 1.08);
                        ctx.quadraticCurveTo(cx - fw * 0.78, cy + fh * 1.12, cx - fw * 1.02, cy);
                        ctx.closePath();
                        const g = ctx.createLinearGradient(cx - fw, cy - fh, cx + fw, cy + fh);
                        g.addColorStop(0, c.color || '#0b0710'); g.addColorStop(0.55, c.color || '#0b0710'); g.addColorStop(1, c.tint || '#3a1a5a');
                        ctx.fillStyle = g; ctx.fill();
                        ctx.clip();
                        // A soft sheen down one side and a ridge down the nose
                        ctx.globalAlpha = 0.18; ctx.fillStyle = c.tint || '#7a4ab0';
                        ctx.beginPath(); ctx.ellipse(cx - fw * 0.55, cy - fh * 0.05, fw * 0.22, fh * 0.6, -0.15, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 0.25; ctx.strokeStyle = c.tint || '#7a4ab0'; ctx.lineWidth = fw * 0.04;
                        ctx.beginPath(); ctx.moveTo(cx, eyeY + fh * 0.05); ctx.lineTo(cx, cy + fh * 0.45); ctx.stroke();
                        ctx.globalAlpha = 1;
                        ctx.restore();
                    },
                    // Eye slits: sharp, lifting outward, the curve that rounds out beneath them — drawn over
                    // the fringe, so they glow through the hair like the brows do
                    portraitOver(ctx, P, c) {
                        const { cx, fw, fh, eyeY, eyeSpacing } = P, eyes = c.eyes || '#e8c27a';
                        ctx.save();
                        ctx.shadowColor = eyes; ctx.shadowBlur = fw * 0.45;
                        for (const s of [-1, 1]) {
                            const ex = cx + s * eyeSpacing;
                            ctx.fillStyle = eyes;
                            ctx.beginPath();
                            ctx.moveTo(ex - s * fw * 0.3, eyeY + fh * 0.04);
                            ctx.quadraticCurveTo(ex - s * fw * 0.02, eyeY - fh * 0.12, ex + s * fw * 0.36, eyeY - fh * 0.14);
                            ctx.quadraticCurveTo(ex + s * fw * 0.06, eyeY + fh * 0.04, ex - s * fw * 0.3, eyeY + fh * 0.04);
                            ctx.fill();
                            ctx.fillStyle = 'rgba(255,250,235,0.85)';                               // a hot core
                            ctx.beginPath(); ctx.ellipse(ex + s * fw * 0.02, eyeY - fh * 0.04, fw * 0.1, fh * 0.018, s * -0.35, 0, Math.PI * 2); ctx.fill();
                            ctx.strokeStyle = eyes; ctx.globalAlpha = 0.6; ctx.lineWidth = fw * 0.04; ctx.shadowBlur = fw * 0.2;
                            ctx.beginPath(); ctx.moveTo(ex - s * fw * 0.26, eyeY + fh * 0.12);
                            ctx.quadraticCurveTo(ex + s * fw * 0.06, eyeY + fh * 0.26, ex + s * fw * 0.34, eyeY + fh * 0.03); ctx.stroke();
                            ctx.globalAlpha = 1;
                        }
                        ctx.restore();
                    } },
                bangles: { at: 'wrists', draw(ctx, g, c) {
                    const gold = c.color || '#e8c27a';
                    for (let i = 0; i < 2; i++) {
                        const [ex, ey] = g.elbows[i], [fx, fy] = g.fists[i];
                        for (const t of [0.7, 0.8]) { ctx.strokeStyle = gold; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(ex + (fx - ex) * t, ey + (fy - ey) * t, 3.3, 0, Math.PI * 2); ctx.stroke(); }
                    }
                }, portrait() {} }
            };

            // A soft fabric outline through the simulated nodes, including the long side chains.
            const clothCurve = (ctx, count, point) => {
                if (count === 2) { const p = point(1); ctx.lineTo(p.x, p.y); return; }
                for (let i = 1; i < count - 1; i++) {
                    const p = point(i), q = point(i + 1);
                    ctx.quadraticCurveTo(p.x, p.y, i === count - 2 ? q.x : (p.x + q.x) / 2,
                                                   i === count - 2 ? q.y : (p.y + q.y) / 2);
                }
            };
            const trains = {
                crimson_train: { overWaist: true, draw(ctx, g, c) {
                    const panel = g.cloth('train_crimson', pieceSpec('train_crimson', g.hip.x + 1, 0, 0, crimsonTrainSpec));
                    const first = panel[0], last = panel[panel.length - 1], tip = i => panel[i][panel[i].length - 1];
                    ctx.beginPath(); ctx.moveTo(first[0].x, first[0].y);
                    clothCurve(ctx, first.length, i => first[i]);
                    clothCurve(ctx, panel.length, tip);
                    clothCurve(ctx, last.length, i => last[last.length - 1 - i]);
                    for (let i = panel.length - 2; i > 0; i--) ctx.lineTo(panel[i][0].x, panel[i][0].y);
                    ctx.closePath(); ctx.fillStyle = g.darken(c.color, 0.1); ctx.fill();
                    ctx.strokeStyle = g.darken(c.color, 0.34); ctx.lineWidth = 0.65; ctx.stroke();
                    // Long seams expose the bends of the dragging fabric, with no added light or blur.
                    ctx.strokeStyle = g.darken(c.color, 0.26); ctx.lineWidth = 0.65;
                    ctx.beginPath();
                    for (const ci of [1, 3]) {
                        const chain = panel[ci]; ctx.moveTo(chain[0].x, chain[0].y);
                        clothCurve(ctx, chain.length, i => chain[i]);
                    }
                    ctx.stroke();
                } }
            };
            return { tops, bottoms, shoes, hats, jewelry, trains };
        })();

