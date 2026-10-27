        // GameEngine — Shopfront light. Methods are added to GameEngine.prototype (see engineMixin in
        // game-engine.js).
        //
        // After dark each lit shop spills its light out across the pavement in front of it: one soft
        // shaft per pane, widening as it goes (the light is a lamp inside, behind the glass), with dark
        // gaps where the mullions stand, the door's a little brighter. Each shaft is warm interior light
        // with a touch of the shop's neon down its middle. The panes come from the shop's front (its
        // _frontGeo and _entrance), so nothing is placed by hand: OllO's walls-under-the-facade look
        // (its interior_wall and interior_lamp details), on every street. Where the street mist drifts
        // through, the light hangs in it and shows stronger.
        //
        // Baked once per front width and neon colour, at half size (it's soft), and stamped in
        // drawEmissivePass under the buildings' own glow. Settings → Shop Light (GameSettings.shopLight);
        // the Low preset turns it off.

        const SHOP_LIGHT = {
            PANE: 44, MULL: 7,          // a pane and the mullion between two, px along the front
            DEPTH: 170,                 // how far out across the pavement it reaches
            SRC: 60,                    // how far inside the lamp is (nearer: the shafts fan out more)
            SPREAD: 0.55,               // and how much of that fan they keep (softer than a point light)
            ALPHA: 0.22,                // a pane's shaft at the glass
            DOOR: 1.3,                  // the door's, against a pane's
            NEON: 0.07,                 // the neon down a shaft's middle
            SILL: 0.22,                 // the hot line where the glass meets the pavement
            WARM: '255,206,150',
            MIST: 0.5,                  // this much stronger where the mist is thickest
            FROM: 0.25, FULL: 0.55,     // ambient darkness where it starts, and where it's full
            K: 0.5                      // bake scale (px per world px)
        };
        // Shops whose variant has no neon of its own take one of these, by where they stand
        const SHOP_LIGHT_NEON = ['#ff3fa4', '#3fe0ff', '#b45bff', '#ff7a3f', '#5bff9e'];

        const _shopLightBakes = new Map();
        const _shopRGB = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');

        /** One pane's shaft: from a..b along the glass out to DEPTH, fanning (local px: x along the front, centre ox; y out) */
        function _shopShaft(c, ox, a, b, rgb, alpha) {
            const L = SHOP_LIGHT, D = L.DEPTH, k = (D + L.SRC) / L.SRC, mid = (a + b) / 2;
            const fa = mid + (a - mid) * k * L.SPREAD, fb = mid + (b - mid) * k * L.SPREAD;
            const g = c.createLinearGradient(0, 0, 0, D);
            g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(0.25, `rgba(${rgb},${alpha * 0.55})`);
            g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.18})`); g.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = g;
            // three passes a little apart, so the edges are soft (no ctx.filter: slow on phones, missing in Safari)
            for (const s of [-2.5, 0, 2.5]) {
                c.globalAlpha = 1 / 3;
                c.beginPath(); c.moveTo(ox + a - s * 0.4, 0); c.lineTo(ox + b + s * 0.4, 0); c.lineTo(ox + fb + s, D); c.lineTo(ox + fa - s, D); c.closePath(); c.fill();
            }
            c.globalAlpha = 1;
        }

        /** A front `width` px wide's panes, in `neon`: { cv, ox (the front's centre, world px), panes: [a, b] } */
        function shopLightSprite(width, neon) {
            const w = Math.round(width / 4) * 4, key = w + neon;
            let s = _shopLightBakes.get(key);
            if (s) return s;
            const L = SHOP_LIGHT, D = L.DEPTH, W = w + D * 1.2, ox = W / 2;
            const cv = document.createElement('canvas');
            cv.width = Math.ceil(W * L.K); cv.height = Math.ceil(D * L.K);
            const c = cv.getContext('2d');
            c.scale(L.K, L.K); c.globalCompositeOperation = 'lighter';
            const n = Math.max(2, Math.floor((w - 24) / (L.PANE + L.MULL))), span = n * (L.PANE + L.MULL) - L.MULL, x0 = -span / 2;
            const neonRGB = _shopRGB(neon), panes = [];
            for (let i = 0; i < n; i++) {
                const a = x0 + i * (L.PANE + L.MULL), b = a + L.PANE;
                panes.push([a, b]);
                _shopShaft(c, ox, a, b, L.WARM, L.ALPHA);
                _shopShaft(c, ox, a + 4, b - 4, neonRGB, L.NEON);
            }
            const sg = c.createLinearGradient(0, 0, 0, 10); sg.addColorStop(0, `rgba(${L.WARM},${L.SILL})`); sg.addColorStop(1, `rgba(${L.WARM},0)`);
            c.fillStyle = sg; c.fillRect(ox + x0, 0, span, 10);
            s = { cv, ox, W, panes };
            _shopLightBakes.set(key, s);
            return s;
        }
        /** The door's extra: one pane's shaft, warm, the door's extra brightness */
        function shopDoorSprite() {
            return shopLightSprite._door || (shopLightSprite._door = (() => {
                const L = SHOP_LIGHT, D = L.DEPTH, W = L.PANE + D, ox = W / 2, cv = document.createElement('canvas');
                cv.width = Math.ceil(W * L.K); cv.height = Math.ceil(D * L.K);
                const c = cv.getContext('2d'); c.scale(L.K, L.K); c.globalCompositeOperation = 'lighter';
                _shopShaft(c, ox, -L.PANE / 2, L.PANE / 2, L.WARM, L.ALPHA * (L.DOOR - 1));
                return { cv, ox, W };
            })());
        }

        engineMixin({
            /** After the darkness, under the buildings' glow: each lit shop's light across the pavement */
            drawShopfrontLight(ctx, dark) {
                if (GameSettings.shopLight === false || this.activeMap.type !== 'outdoor' || !this._cullBounds || !this.activeMap.buildings) return;
                const L = SHOP_LIGHT, night = Math.max(0, Math.min(1, (dark - L.FROM) / (L.FULL - L.FROM)));
                if (night < 0.01) return;
                const v = this._cullBounds.view, t = _frameTime / 1000, M = GameSettings.streetFog !== false && this._mist;
                const reach = L.DEPTH * 1.2;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (const entry of this._prepareRenderBuildingLists(this._cullBounds).v2) {
                    const b = entry.item;
                    if (!b.isV2 || !b.variant || b.variant.kind !== 'shop' || !b._shopfront) continue;
                    const E = b._entrance();
                    if (!E) continue;
                    const g = b._frontGeo(), width = g.ny ? g.sec.w : g.sec.h;
                    if (g.cx + width / 2 + reach < v.left || g.cx - width / 2 - reach > v.right || g.cy + width / 2 + reach < v.top || g.cy - width / 2 - reach > v.bottom) continue;
                    const neon = (b.variant.neon && /^#[0-9a-f]{6}$/i.test(b.variant.neon)) ? b.variant.neon
                        : SHOP_LIGHT_NEON[Math.abs(Math.round(b.x * 7 + b.y * 3)) % SHOP_LIGHT_NEON.length];
                    const S = shopLightSprite(width, neon);
                    const mist = M ? mistDensity(g.cx + g.nx * 80, g.cy + g.ny * 80, M.ox, M.oy) : 0;
                    ctx.save();
                    ctx.transform(g.ux, g.uy, g.nx, g.ny, g.cx, g.cy);   // local x along the front, y out from it
                    ctx.globalAlpha = night * (0.92 + 0.08 * Math.sin(t * 2.3 + b.x)) * (1 + L.MIST * mist);
                    ctx.drawImage(S.cv, -S.ox, 0, S.W, L.DEPTH);
                    // the door: the pane nearest it a little brighter
                    const du = (E.cx - g.cx) * g.ux + (E.cy - g.cy) * g.uy;
                    let best = null;
                    for (const p of S.panes) if (!best || Math.abs((p[0] + p[1]) / 2 - du) < Math.abs((best[0] + best[1]) / 2 - du)) best = p;
                    if (best && Math.abs((best[0] + best[1]) / 2 - du) < L.PANE) {
                        const Dr = shopDoorSprite();
                        ctx.drawImage(Dr.cv, (best[0] + best[1]) / 2 - Dr.ox, 0, Dr.W, L.DEPTH);
                    }
                    ctx.restore();
                }
                ctx.restore();
            }
        });
