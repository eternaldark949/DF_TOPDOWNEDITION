        // GameEngine — Footsteps. Methods are added to GameEngine.prototype (see engineMixin in
        // game-engine.js).
        //
        // Every foot that lands (syncHumanoidGait → onStep) makes a sound from the shoe and the
        // floor under it: heels click (ringing on marble), boots thud and scuff, sneakers tap
        // softly; carpet and grass hush it, boards sound hollow, metal rings, a puddle splashes.
        // Stella's steps also make noise (CONFIG.NOISE) for anyone in earshot: heels carry
        // further than sneakers, carpet swallows a step, marble throws it, a puddle gives her
        // away, and walking slowly halves it all. Settings → Footsteps.

        // Floors per map (the painted interiors have no zone data): rects [x, y, w, h, material], first match wins, then the default
        const FLOOR_MATERIALS = {
            house_of_death: { def: 'wood', rects: [
                [840, 1014, 120, 486, 'carpet'], [840, 130, 120, 300, 'carpet'], [1250, 1064, 480, 50, 'carpet'], [1686, 1064, 50, 412, 'carpet'],
                [574, 1014, 652, 486, 'marble'], [574, 444, 652, 556, 'marble'], [1574, 14, 212, 416, 'marble'],
                [574, 14, 652, 416, 'stone'], [14, 1014, 546, 472, 'concrete'], [1240, 14, 320, 416, 'carpet'],
                [1240, 444, 546, 556, 'stone'], [1240, 1178, 382, 308, 'stone']] },
            hotel_lobby: { def: 'marble', rects: [[440, 612, 120, 538, 'carpet']] },
            moon_city_nightclub: { def: 'wood', rects: [[590, 310, 420, 380, 'marble']] },
            van_interior: { def: 'metal' },
            ethereal_plane: { def: 'marble' },
            church_boss: { def: 'stone' },
            keepers_hill: { def: 'grass' },
            demoness_palace: { def: 'stone', rects: [[860, 760, 80, 226, 'carpet'], [860, 1000, 80, 386, 'carpet'], [14, 1000, 572, 386, 'carpet'],
                               [600, 380, 600, 606, 'marble'], [600, 1000, 600, 386, 'marble'], [14, 14, 872, 352, 'grass']] }
        };

        engineMixin({
            /** What's underfoot at (x, y): marble | wood | carpet | stone | concrete | asphalt | grass | metal | water */
            materialAt(x, y) {
                const map = this.activeMap; if (!map) return 'concrete';
                if (this._inPuddle && this._inPuddle(x, y) > 0.2) return 'water';
                const surf = this._surfaces && this._surfaces();
                if (surf) for (const [wx, wy, r] of surf.water) if (Math.hypot(x - wx, y - wy) < r) return 'water';
                const F = FLOOR_MATERIALS[map.id];
                if (F) {
                    for (const [rx, ry, rw, rh, m] of F.rects || []) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) {
                        if (m === 'marble' && map.id === 'house_of_death' && Math.hypot(x - 900, y - 720) < 150) return 'carpet';   // the hall's rug
                        return m;
                    }
                }
                for (let i = (map.zones || []).length - 1; i >= 0; i--) {
                    const z = map.zones[i];
                    if (z.texture && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z.texture === 'carpet' ? 'carpet' : z.texture === 'wood' ? 'wood' : 'concrete';
                }
                if (F) return F.def;
                if (map.type === 'indoor') return 'wood';
                // The city: crossings and pavements, roads, parks and plazas, lawns
                for (const c of map.crosswalks || []) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return 'concrete';
                for (const p of map.pavements || []) if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return 'concrete';
                const net = this.traffic && this.traffic.network;
                if (net && map.id === 'hub_949') {
                    for (const ix of net.intersections) if (ix.containsPoint(x, y)) return 'asphalt';
                    for (const r of net.roads) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'asphalt';
                }
                const city = map.cityLayout;
                if (city) for (const b of city.blocks) {
                    if ((b.type === 'PARK' || b.type === 'PLAZA') && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
                        if (b.type === 'PLAZA') return 'stone';
                        const P = b._park; if (P && (Math.abs(x - P.cx) < 34 || Math.abs(y - P.cy) < 34)) return 'stone';
                        return 'grass';
                    }
                }
                for (const z of map.floorZones || []) if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h && this.groundBaker && this.groundBaker._isGreen && this.groundBaker._isGreen(z.color)) return 'grass';
                return 'concrete';
            },

            /** A foot landed (core/utils.js syncHumanoidGait) */
            onStep(e, speed) {
                if (this.paused || !this.player || this.isDriving && e === this.player) return;
                const pl = this.player, isHer = e === pl;
                const d = Math.hypot(e.x - pl.x, e.y - pl.y);
                if (!isHer && d > 520) return;
                const mat = this.materialAt(e.x, e.y);
                let shoe;
                if (isHer) { const cc = this.cosmetics && this.cosmetics.getRenderConfig ? this.cosmetics.getRenderConfig() : null; shoe = cc && cc.outfit && cc.outfit.shoes && cc.outfit.shoes.type; }
                else { const L = e.look || e.appearance; shoe = L && L.shoes && L.shoes.type; }
                shoe = shoe === 'shoes' || !shoe ? 'loafers' : shoe;
                const outside = this.activeMap.type === 'outdoor' || (this.roomSystem && this.roomSystem.active && this.roomSystem.outdoorness > 0.5);
                const wet = outside && this.weather && this.weather.isRaining && mat !== 'grass';
                const pace = Math.min(1, speed / 3);
                if (typeof ambience !== 'undefined' && ambience.footstep) {
                    const z = this.camera.zoom || 1, hw = this.canvas.width / 2 / z;
                    ambience.footstep(shoe, mat, { gain: isHer ? (this.sneaking ? 0.2 : 0.4 + 0.6 * pace) : 0.3 + 0.4 * pace, wet, near: isHer ? 1 : Math.max(0, 1 - d / 520) * 0.75, pan: isHer ? 0 : (e.x - pl.x) / Math.max(200, hw) });
                }
                if (isHer) {
                    // her steps carry: shoe × floor × pace; a puddle gives her away (with a small ring)
                    const N = CONFIG.NOISE;
                    const sneak = this.sneaking;
                    if (mat === 'water') { this.emitNoise(e.x, e.y, Math.round(N.puddleStep * (sneak ? SNEAK.PUDDLE_NOISE : 1)), 'puddle', true, { ring: true }); return; }
                    let reach = shoe === 'heels' ? N.stepHeels : shoe === 'boots' ? N.stepBoots : N.stepSoft;
                    reach *= mat === 'carpet' || mat === 'grass' ? 0.5 : mat === 'marble' ? 1.3 : mat === 'metal' ? 1.4 : 1;
                    reach *= speed < 1.4 ? 0.5 : speed > 3.2 ? 1.3 : 1;
                    if (sneak) reach *= SNEAK.STEP_NOISE;
                    this.emitNoise(e.x, e.y, Math.round(reach), 'step', true, { ring: false });
                } else if (e instanceof Ganger && (mat === 'marble' || mat === 'metal' || mat === 'wood') && (shoe === 'boots' || shoe === 'heels') && (e._stepN = (e._stepN || 0) + 1) % 2 === 0) {
                    // a guard's hard steps: a faint ember ring where you can hear them (nobody else is alerted)
                    this.emitNoise(e.x, e.y, 120, 'enemyStep', false, { hear: false });
                }
            }
        });
