        // One soft, centred ground blob shared by props, pickups and Velvet. It is stamped
        // before artwork transforms and never baked into a rotating furniture sprite.
        function drawGroundContactShadow(ctx, x, y, rx, ry, angle = 0) {
            let cv = drawGroundContactShadow.sprite;
            if (!cv) {
                cv = drawGroundContactShadow.sprite = document.createElement('canvas');
                cv.width = cv.height = 64;
                const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
                g.addColorStop(0, 'rgba(0,0,0,0.30)');
                g.addColorStop(0.65, 'rgba(0,0,0,0.24)');
                g.addColorStop(0.85, 'rgba(0,0,0,0.12)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = g; c.fillRect(0, 0, 64, 64);
            }
            if (angle) {
                // The contact footprint follows the base. Its centre never gains a
                // facing-dependent light offset like the old displaced silhouette.
                ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
                ctx.drawImage(cv, -rx, -ry, rx * 2, ry * 2); ctx.restore();
            } else ctx.drawImage(cv, x - rx, y - ry, rx * 2, ry * 2);
        }

        // =====================================================================
        //  ENTITY SUBCLASSES
        // =====================================================================

        /**
         * Static Entity - Walls, Buildings (never moves).
         */
        class StaticEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: config.type || 'static',
                    hasCollision: true,
                    collisionShape: GameEntity.SHAPE.AABB,
                    collisionLayer: GameEntity.LAYER.STATIC,
                    isStatic: true
                });
            }

            update() { }

            draw(ctx) {
                if (!this.visible) return;
                ctx.fillStyle = this.data.color || '#444';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        }

        /**
         * =====================================================================
         *  PROP ENTITY (Unified Entity System)
         * =====================================================================
         * Pushable objects with physics. Props can be pushed by the player,
         * collide with walls, and interact with other props.
         * 
         * Features:
         * - AABB collision via CollisionSystem
         * - Wall bounce physics
         * - Prop-prop separation
         * - Player push mechanics
         * - Special rendering for medbay/vending machines
         */
        /** Top-down furniture art for clinic props (beds, monitors, IV stands, cabinets, desk...). */
        // Cozy-modern apartment palette (apt_949): wine and blush, cream, walnut, brass, deep greens.
        const APT = {
            wine: '#5a2230', wineDk: '#3f1722', wineLt: '#7a2e3c', blush: '#c98f95', blushLt: '#e8b4b8',
            cream: '#efe6dc', creamDk: '#d8cbbd', walnut: '#4a3a30', walnutLt: '#6b5444', brass: '#c9a46a',
            ink: '#1b1718', leaf: '#2f5a3e', leafLt: '#3f7a52', stone: '#e9e6e3'
        };
        const APT_PENDANTS = [0.17, 0.5, 0.83];   // where the bar island's pendants hang along it

        function drawApartmentDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000, A = APT;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            const lampShade = (cx, cy, r) => drawLampFixture(ctx, 'shade_table', cx, cy, { scale: r / 9, color: '#ffd9b0' });   // (the lamp library, entities/lamps.js; lit by drawApartmentGlow)
            const counterTop = (X, Y, W, H) => {                          // cream quartz with a walnut front edge (north side)
                rr(X, Y, W, H, 2, A.cream);
                ctx.strokeStyle = 'rgba(160,140,125,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath();
                for (let i = 0; i < W; i += 23) { ctx.moveTo(X + i, Y + 4); ctx.quadraticCurveTo(X + i + 9, Y + H * 0.5, X + i + 4, Y + H - 3); }
                ctx.stroke();
                ctx.fillStyle = A.walnut; ctx.fillRect(X, Y, W, 3);
            };
            switch (p.decorType) {
                case 'apt_craft': {                                        // the workbench: walnut on steel, a pegboard lip, vise, schematic tablet, iron
                    const tx = x + w * 0.44, ty = y + 11, tw = w * 0.3, th = h * 0.42;
                    // (PropPass segments, entities/prop-sprites.js: the still runs are painted once, the scanline and the ember stay live)
                    if (PropPass.seg(false)) {
                        for (const [lx, ly] of [[x + 1, y + 1], [x + w - 5, y + 1], [x + 1, y + h - 5], [x + w - 5, y + h - 5]]) rr(lx, ly, 4, 4, 1, '#5a5e6a');
                        rr(x, y, w, h, 3, A.walnut, '#2a201a', 1);
                        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6; ctx.beginPath();          // grain
                        for (let gy = y + 11; gy < y + h - 3; gy += 4.5) { ctx.moveTo(x + 2, gy); ctx.bezierCurveTo(x + w * 0.3, gy - 1.2, x + w * 0.6, gy + 1.2, x + w - 2, gy); }
                        ctx.stroke();
                        ctx.fillStyle = 'rgba(255,220,180,0.08)'; ctx.fillRect(x + 2, y + 9, w - 4, 2);
                        rr(x, y + h - 3, w, 3, 1, '#8a8e9a'); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 1, y + h - 3, w - 2, 0.8);   // steel edge band
                        // Pegboard lip along the back, tools hung on it
                        rr(x - 1, y - 1, w + 2, 8, 1.5, '#2c2a34', '#4a4656', 0.8);
                        ctx.fillStyle = 'rgba(0,0,0,0.6)'; for (let px = x + 3; px < x + w - 1; px += 4) for (const py of [y + 1.5, y + 4.5]) ctx.fillRect(px, py, 1, 1);
                        ctx.strokeStyle = '#b8bcc8'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.beginPath();
                        ctx.moveTo(x + 6, y + 1); ctx.lineTo(x + 6, y + 6);                             // screwdriver
                        ctx.moveTo(x + 12, y + 1); ctx.lineTo(x + 14, y + 6); ctx.moveTo(x + 16, y + 1); ctx.lineTo(x + 14, y + 6);   // pliers
                        ctx.stroke();
                        ctx.fillStyle = A.wineLt; ctx.fillRect(x + 5, y + 5, 2, 2.5);
                        circ(x + 21, y + 2.5, 1.8, null, '#b8bcc8', 1); ctx.beginPath(); ctx.moveTo(x + 21, y + 4); ctx.lineTo(x + 21, y + 7); ctx.stroke();   // wrench
                        ctx.lineCap = 'butt';
                        // Bench vise on the front-left corner
                        rr(x + 3, y + h - 13, 11, 9, 1.5, '#4a5060', '#2a2e38', 0.8);
                        rr(x + 5, y + h - 16, 7, 4, 1, '#6a7080'); ctx.fillStyle = '#c9ccd6'; ctx.fillRect(x + 1, y + h - 9, 15, 1.2);
                        // Holo-schematic tablet, a scanline drifting down it
                        rr(tx - 1, ty - 1, tw + 2, th + 2, 2, '#15101e');
                        rr(tx, ty, tw, th, 1.5, '#2a1a48');
                        ctx.strokeStyle = 'rgba(200,160,255,0.75)'; ctx.lineWidth = 0.6; ctx.beginPath();
                        ctx.rect(tx + 2, ty + 2, tw * 0.45, th * 0.5); ctx.arc(tx + tw * 0.72, ty + th * 0.35, th * 0.2, 0, Math.PI * 2);
                        ctx.moveTo(tx + 2, ty + th - 3); ctx.lineTo(tx + tw - 2, ty + th - 3); ctx.moveTo(tx + tw * 0.25, ty + th * 0.5 + 2); ctx.lineTo(tx + tw * 0.25, ty + th - 3);
                        ctx.stroke();
                    }
                    if (PropPass.seg(true)) { ctx.fillStyle = 'rgba(232,210,255,0.55)'; ctx.fillRect(tx + 0.5, ty + ((t * 6) % th), tw - 1, 0.8); }
                    if (PropPass.seg(false)) {
                        // Parts tray, a coil of copper wire
                        rr(x + 17, y + h - 13, 12, 8, 1, '#3a3844', '#5a5866', 0.6);
                        for (let i = 0; i < 6; i++) circ(x + 19.5 + (i % 3) * 3.5, y + h - 11 + (i / 3 | 0) * 3.5, 0.9, i % 2 ? A.brass : '#9aa0b0');
                        ctx.strokeStyle = '#c47a4a'; ctx.lineWidth = 0.9; for (const r of [4, 2.8, 1.6]) { ctx.beginPath(); ctx.arc(x + w - 9, y + 16, r, 0, Math.PI * 2); ctx.stroke(); }
                        // Soldering iron in its stand, the tip an ember
                        circ(x + w - 10, y + h - 9, 3.5, '#2a2a30', '#5a5e6a', 0.8);
                        ctx.strokeStyle = '#1a1a1e'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w - 10, y + h - 9); ctx.lineTo(x + w - 24, y + h - 13); ctx.stroke();
                        ctx.strokeStyle = '#a0a4b0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w - 24, y + h - 13); ctx.lineTo(x + w - 29, y + h - 14.5); ctx.stroke(); ctx.lineCap = 'butt';
                    }
                    if (PropPass.seg(true)) circ(x + w - 29, y + h - 14.5, 1.2, `rgba(255,${140 + 60 * Math.sin(t * 7) | 0},70,1)`);
                    break;
                }
                case 'apt_sofa': {                                         // faces north: back along the bottom edge
                    rr(x, y, w, h, 10, A.wine);
                    rr(x + 2, y + h - 20, w - 4, 18, 8, A.wineDk);                                   // back
                    rr(x, y + 4, 16, h - 6, 7, A.wineDk); rr(x + w - 16, y + 4, 16, h - 6, 7, A.wineDk);   // arms
                    rr(x + 17, y + 6, (w - 36) / 2 - 1, h - 28, 6, A.wineLt); rr(x + w / 2 + 1, y + 6, (w - 36) / 2 - 1, h - 28, 6, A.wineLt);
                    rr(x + 20, y + h - 30, 22, 13, 5, A.blushLt); rr(x + w - 44, y + h - 31, 22, 14, 5, A.cream);    // cushions
                    ctx.save(); ctx.globalAlpha = 0.92;                                               // knit throw over one arm
                    rr(x + w - 30, y + 2, 26, h - 10, 4, '#e9dcc8');
                    ctx.strokeStyle = 'rgba(150,120,100,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 0; i < 4; i++) { ctx.moveTo(x + w - 26 + i * 6, y + 5); ctx.lineTo(x + w - 26 + i * 6, y + h - 12); }
                    ctx.stroke(); ctx.restore();
                    break;
                }
                case 'apt_fireplace': {                                    // linear glass fireplace set into a stone slab
                    if (PropPass.seg(false)) { rr(x - 6, y - 4, w + 12, h + 8, 3, '#2b2224', 'rgba(239,230,220,0.35)', 1); rr(x, y + 3, w, h - 6, 2, '#120c0c'); }
                    if (PropPass.seg(true)) for (let i = 0; i < 6; i++) {
                        const fx = x + 5 + i * (w - 10) / 5, fl = 0.6 + 0.4 * Math.sin(t * 7 + i * 1.9);
                        ctx.fillStyle = `rgba(255,${140 + 60 * fl | 0},60,${0.55 + 0.35 * fl})`;
                        ctx.beginPath(); ctx.ellipse(fx, y + h / 2, 3.5, (h - 10) / 2 * fl, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'apt_side': case 'apt_nightstand': {
                    rr(x, y, w, h, 5, A.walnut, A.walnutLt, 1);
                    lampShade(x + w * 0.42, y + h * 0.45, Math.min(w, h) * 0.3);
                    if (p.decorType === 'apt_nightstand') { ctx.fillStyle = A.brass; ctx.fillRect(x + w / 2 - 3, y + h - 3, 6, 1.5); }
                    break;
                }
                case 'apt_coffee': {
                    rr(x, y, w, h, h / 2, A.walnut, A.walnutLt, 1);
                    rr(x + 5, y + 4, w - 10, h - 8, (h - 8) / 2, 'rgba(255,240,230,0.08)');
                    rr(x + 8, y + 8, 16, 11, 1, A.cream); rr(x + 10, y + 10, 16, 11, 1, A.blush);           // books
                    circ(x + w - 16, y + h / 2, 5, '#d8cbbd'); for (let i = 0; i < 5; i++) circ(x + w - 16 + Math.cos(i * 1.26) * 4, y + h / 2 + Math.sin(i * 1.26) * 4, 2.2, i % 2 ? A.blushLt : '#f3e3ea');   // vase of flowers
                    break;
                }
                case 'apt_chair': {
                    rr(x, y, w, h, 12, A.blush);
                    rr(x + 5, y + 5, w - 10, h - 14, 9, '#e6c3c2'); rr(x + 3, y + h - 10, w - 6, 8, 4, '#b27a82');
                    break;
                }
                case 'apt_bookshelf': {
                    rr(x, y, w, h, 2, A.walnut);
                    const cols = [A.wine, A.cream, A.blush, A.leaf, A.brass, '#8c6d5e', A.wineLt];
                    let bx = x + 3, i = 0;
                    while (bx < x + w - 4) {
                        const bw = 3 + ((i * 7) % 4); if ((i % 9) === 5) { bx += 8; i++; continue; }        // gaps for ornaments
                        ctx.fillStyle = cols[(i * 5) % cols.length]; ctx.fillRect(bx, y + 3, bw, h - 6); bx += bw + 0.6; i++;
                    }
                    circ(x + w - 14, y + h / 2, 6, A.leafLt);
                    break;
                }
                case 'apt_console': {
                    const cx = x + w / 2 - 6, cy = y + h / 2;                                           // turntable
                    if (PropPass.seg(false)) {
                        rr(x, y, w, h, 2, A.walnut, A.walnutLt, 1);
                        ctx.fillStyle = '#2a2020'; ctx.fillRect(x + 6, y + 4, 26, h - 8); ctx.fillRect(x + w - 32, y + 4, 26, h - 8);   // speakers
                        ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) { ctx.fillRect(x + 8, y + 6 + i * 3.5, 22, 1); ctx.fillRect(x + w - 30, y + 6 + i * 3.5, 22, 1); }
                        circ(cx, cy, 9, A.ink); circ(cx, cy, 3, A.wineLt);
                    }
                    if (PropPass.seg(true)) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 6, t * 3.5, t * 3.5 + 1.2); ctx.stroke(); }   // the record's sheen turns
                    if (PropPass.seg(false)) { ctx.strokeStyle = A.brass; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx + 14, cy - 7); ctx.lineTo(cx + 5, cy + 2); ctx.stroke(); }
                    break;
                }
                case 'apt_plant': {
                    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
                    circ(cx, cy, r * 0.6, A.cream, A.creamDk, 1);
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + (x % 7), sway = Math.sin(t * 0.8 + i) * 0.05;
                        ctx.fillStyle = i % 2 ? A.leaf : A.leafLt;
                        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.26, a + sway, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'apt_floor_lamp': {
                    const cx = x + w / 2, cy = y + h / 2;
                    drawLampFixture(ctx, 'shade_floor', cx, cy, { scale: w / 26, color: '#ffd9b0' });   // lit by drawApartmentGlow
                    break;
                }
                case 'apt_fridge': {
                    rr(x, y, w, h, 2, '#8e8986'); rr(x + 2, y + 2, w - 4, h - 4, 1.5, '#b6b1ad');
                    ctx.fillStyle = A.brass; ctx.fillRect(x + 4, y + 3, w - 8, 1.6);
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w / 2 - 0.5, y + 4, 1, h - 8);
                    break;
                }
                case 'apt_counter': counterTop(x, y, w, h); break;
                case 'apt_sink': {
                    counterTop(x, y, w, h);
                    rr(x + w / 2 - 26, y + 8, 52, h - 14, 5, '#b9b4b0'); rr(x + w / 2 - 23, y + 10, 46, h - 18, 4, '#8f8a87');
                    ctx.strokeStyle = A.brass; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + w / 2, y + h - 4, 7, Math.PI, Math.PI * 2); ctx.stroke();   // arched tap
                    break;
                }
                case 'apt_gas_range': {                                    // five-burner range: black steel, brass knobs
                    rr(x, y, w, h, 2, A.ink, '#3a3334', 1);
                    const pts = [[0.2, 0.35], [0.5, 0.35], [0.8, 0.35], [0.3, 0.72], [0.7, 0.72]];
                    pts.forEach(([u, v], i) => {
                        const cx = x + w * u, cy = y + h * v, r = i === 1 ? 7 : 5.5;
                        circ(cx, cy, r, '#2a2526', '#4a4244', 1.2);
                        ctx.strokeStyle = '#4a4244'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
                    });
                    for (let i = 0; i < 5; i++) circ(x + 10 + i * (w - 20) / 4, y + 4, 2, A.brass);
                    break;
                }
                case 'apt_induction': {                                    // black glass, four zones
                    counterTop(x, y, w, h);
                    rr(x + 3, y + 5, w - 6, h - 8, 3, '#141012', 'rgba(255,255,255,0.12)', 1);
                    [[0.3, 0.4, 7], [0.72, 0.4, 5.5], [0.3, 0.78, 5], [0.72, 0.78, 6.5]].forEach(([u, v, r]) => circ(x + w * u, y + (h - 3) * v + 2, r, null, 'rgba(255,255,255,0.22)', 1));
                    break;
                }
                case 'apt_island': {                                       // open bar: quartz top, waterfall ends, overhang on the seating side

                    counterTop(x, y, w, h);
                    ctx.fillStyle = A.creamDk; ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);                   // waterfall edges
                    ctx.fillStyle = A.walnut; ctx.fillRect(x + 6, y + h - 4, w - 12, 4);
                    for (const u of APT_PENDANTS) drawLampFixture(ctx, 'pendant', x + w * u, y + h / 2, { scale: 1, color: '#ffd9b0' });   // brass pendants above (lit by drawApartmentGlow)
                    rr(x + w * 0.62, y + 8, 14, 9, 2, A.wineLt); circ(x + w * 0.4, y + 12, 4, '#f3e3ea');                     // fruit bowl, glasses
                    break;
                }
                case 'apt_dyer': {                                         // the Clothing Dyer: walnut cabinet, three dye vats, a bolt of cloth, a swatch fan, the steamer
                    rr(x, y, w, h, 3, A.walnut, '#2a201a', 1);
                    ctx.fillStyle = 'rgba(255,220,180,0.08)'; ctx.fillRect(x + 2, y + 2, w - 4, 2);
                    rr(x, y + h - 3, w, 3, 1, A.brass);
                    for (const [vx, col] of [[x + 8, '#f19ab0'], [x + 19, '#17b8c8'], [x + 30, '#e8c27a']]) {          // vats, the dye in each
                        circ(vx, y + h / 2, 5, '#1a1416', '#b8bcc8', 0.9); circ(vx, y + h / 2, 3.7, col);
                        circ(vx - 1.2, y + h / 2 - 1.2, 1, 'rgba(255,255,255,0.45)');
                    }
                    rr(x + 37, y + 4, 9, h - 8, 2, A.blush, A.wineLt, 0.6);                                               // a bolt of cloth, rolled
                    ctx.strokeStyle = 'rgba(122,46,60,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath();
                    for (let yy = y + 7; yy < y + h - 5; yy += 3) { ctx.moveTo(x + 38, yy); ctx.lineTo(x + 45, yy); }
                    ctx.stroke();
                    ctx.save(); ctx.translate(x + w - 6, y + h - 7);                                                     // the swatch fan
                    for (const [i, col] of ['#8a2be2', '#dc143c', '#00b39b', '#e8c27a'].entries()) { ctx.rotate(0.28); rr(-1, -9, 2.6, 9, 0.8, col); }
                    ctx.restore();
                    circ(x + w - 6, y + 6, 2.6, '#d8cbbd', '#8a8e9a', 0.6);                                              // the steamer's head
                    break;
                }
                case 'apt_bar_cart': {                                     // brass and smoked glass on two wheels: bottles, a decanter, the ice bucket, two coupes
                    circ(x + 3, y + 2, 3.2, '#1a1416', A.brass, 0.8); circ(x + 3, y + h - 2, 3.2, '#1a1416', A.brass, 0.8);   // wheels, west end
                    ctx.strokeStyle = A.brass; ctx.lineWidth = 1.6; ctx.lineCap = 'round';                                     // handle, east end
                    ctx.beginPath(); ctx.moveTo(x + w - 3, y + 2); ctx.quadraticCurveTo(x + w + 5, y + h / 2, x + w - 3, y + h - 2); ctx.stroke(); ctx.lineCap = 'butt';
                    rr(x, y, w, h, 3, 'rgba(40,30,36,0.92)', A.brass, 1.4);                                                     // smoked-glass tray in its frame
                    ctx.fillStyle = 'rgba(255,240,220,0.08)'; ctx.fillRect(x + 2, y + 2, w - 4, 2.5);
                    const bottle = (bx, by, liq) => { circ(bx, by, 3.4, '#14100f', 'rgba(255,255,255,0.18)', 0.6); circ(bx, by, 2.3, liq); circ(bx, by, 1.2, '#c8a27a'); circ(bx - 1.1, by - 1.1, 0.6, 'rgba(255,255,255,0.6)'); };
                    bottle(x + 7, y + 6, GLASS_DRINKS.red_wine.liquid); bottle(x + 7, y + h - 6, '#2c4a2a'); bottle(x + 14, y + h / 2, GLASS_DRINKS.whiskey.liquid);
                    circ(x + 22, y + 7, 3.6, 'rgba(225,240,255,0.25)', 'rgba(240,250,255,0.75)', 0.6); circ(x + 22, y + 7, 2.4, GLASS_DRINKS.whiskey.liquid);   // crystal decanter
                    circ(x + 22, y + 7, 1.1, 'rgba(240,250,255,0.85)');
                    circ(x + 23, y + h - 7, 4, '#b8bcc8', '#e6e8f0', 0.8); circ(x + 23, y + h - 7, 3, '#dfe9f2');               // ice bucket
                    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x + 21.5, y + h - 8.5, 1.6, 1.6); ctx.fillRect(x + 23.5, y + h - 7, 1.4, 1.4);
                    for (const gy of [y + 6, y + h - 6]) { circ(x + w - 8, gy, 2.6, 'rgba(220,240,255,0.2)', 'rgba(245,252,255,0.8)', 0.5); }   // two coupes, waiting
                    break;
                }
                case 'apt_stool': {
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, w / 2, A.brass); circ(cx, cy, w / 2 - 2.5, A.wine);
                    break;
                }
                case 'apt_bed': {                                          // queen bed, headboard against the top wall
                    rr(x - 2, y, w + 4, h, 5, A.walnut);
                    rr(x - 4, y - 2, w + 8, 12, 4, A.blush);                                          // channel-tufted headboard
                    ctx.strokeStyle = 'rgba(90,34,48,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 1; i < 8; i++) { ctx.moveTo(x - 4 + (w + 8) * i / 8, y - 1); ctx.lineTo(x - 4 + (w + 8) * i / 8, y + 9); }
                    ctx.stroke();
                    rr(x + 3, y + 10, w - 6, h - 14, 4, A.cream);                                     // mattress
                    rr(x + 8, y + 14, (w - 22) / 2, 16, 6, '#fbf6f0'); rr(x + w / 2 + 3, y + 14, (w - 22) / 2, 16, 6, '#fbf6f0');
                    rr(x + w / 2 - 12, y + 24, 24, 12, 5, A.blushLt);                                // accent pillow
                    rr(x + 3, y + 40, w - 6, h - 44, 4, A.wine);                                      // duvet
                    ctx.fillStyle = A.cream; ctx.fillRect(x + 3, y + 40, w - 6, 6);                    // folded sheet
                    ctx.fillStyle = '#e9dcc8'; ctx.fillRect(x + 1, y + h - 26, w - 2, 16);            // knit throw at the foot
                    ctx.strokeStyle = 'rgba(150,120,100,0.35)'; ctx.beginPath();
                    for (let i = 0; i < 8; i++) { ctx.moveTo(x + 6 + i * (w - 12) / 7, y + h - 25); ctx.lineTo(x + 6 + i * (w - 12) / 7, y + h - 11); }
                    ctx.stroke();
                    break;
                }
                case 'apt_wardrobe': {
                    rr(x, y, w, h, 2, A.walnut, A.walnutLt, 1);
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, y + h / 2 - 0.5, w - 4, 1);
                    ctx.fillStyle = A.brass; ctx.fillRect(x + 4, y + h / 2 - 6, 1.5, 5); ctx.fillRect(x + 4, y + h / 2 + 1, 1.5, 5);
                    break;
                }
                case 'apt_vanity': {                                       // against the east wall: round mirror, stool in front
                    rr(x + 14, y, w - 14, h, 3, A.walnut, A.walnutLt, 1);
                    const mx = x + w - 6, my = y + h / 2;
                    circ(mx, my, 16, A.brass); circ(mx, my, 14, '#d9d6de');
                    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx - 2, my - 1, 8, 1.9, 4.2); ctx.stroke();   // the one crescent
                    circ(x + 20, y + 12, 2.5, A.blushLt); circ(x + 22, y + 20, 2, A.brass); rr(x + 18, y + h - 16, 8, 10, 2, '#f3e3ea');
                    circ(x + 5, y + h / 2, 8, A.blush, '#b27a82', 1);                                  // stool
                    break;
                }
                case 'apt_tub': {                                          // freestanding oval tub with petals
                    if (PropPass.seg(false)) {

                        ctx.fillStyle = '#f7f4f0'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#cfe0e6'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 7, h / 2 - 7, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    if (PropPass.seg(true)) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 14 + Math.sin(t) * 2, h / 2 - 14, 0, 0, Math.PI * 2); ctx.stroke(); }
                    if (PropPass.seg(false)) {                             // petals and the spout, over the ripple
                        for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 3 ? A.blushLt : A.blush; ctx.beginPath(); ctx.ellipse(x + w * (0.25 + ((i * 37) % 50) / 100), y + h * (0.3 + ((i * 23) % 40) / 100), 2.6, 1.6, i, 0, Math.PI * 2); ctx.fill(); }
                        ctx.strokeStyle = A.brass; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + w - 2, y + h / 2); ctx.lineTo(x + w - 12, y + h / 2); ctx.stroke();
                    }
                    break;
                }
                case 'apt_bath_vanity': {                                  // double marble vanity against the south wall
                    rr(x, y, w, h, 2, A.stone, '#c9c4c0', 1);
                    ctx.fillStyle = '#cfd6da'; ctx.fillRect(x + 4, y + h - 4, w - 8, 3);                  // mirror edge on the wall
                    for (const u of [0.28, 0.72]) {
                        ctx.fillStyle = '#d4d0cc'; ctx.beginPath(); ctx.ellipse(x + w * u, y + h * 0.45, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = A.brass; ctx.fillRect(x + w * u - 1, y + h * 0.45 + 8, 2, 7);
                    }
                    circ(x + w * 0.5, y + h * 0.4, 3, A.blushLt); circ(x + w * 0.5 + 6, y + h * 0.55, 2, A.brass);
                    break;
                }
                case 'apt_shower': {                                       // walk-in shower: tiled floor, glass screen, brass rain head
                    rr(x, y, w, h, 2, '#b8c1c3');
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
                    for (let i = 8; i < w; i += 8) { ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); }
                    for (let j = 8; j < h; j += 8) { ctx.moveTo(x, y + j); ctx.lineTo(x + w, y + j); }
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(210,235,245,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w * 0.65, y); ctx.stroke();
                    circ(x + w * 0.6, y + h * 0.6, 9, A.brass); circ(x + w * 0.6, y + h * 0.6, 7, '#9a7c4a');
                    break;
                }
                case 'apt_towels': {
                    ctx.fillStyle = A.walnut; ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
                    rr(x - 1, y + 10, w + 2, 26, 2, A.blushLt); rr(x - 1, y + 48, w + 2, 26, 2, A.cream);
                    break;
                }
                case 'apt_lounger': {                                      // veranda lounger, head toward the railing (north)
                    rr(x, y, w, h, 4, A.walnut);
                    rr(x + 2, y + 2, w - 4, h - 4, 4, A.cream); rr(x + 3, y + 3, w - 6, 16, 4, '#fbf6f0');
                    rr(x + 1, y + h - 22, w - 2, 14, 3, A.blush);
                    break;
                }
                case 'apt_bistro': {
                    const cx = x + w / 2, cy = y + h / 2;
                    for (const s of [-1, 1]) { circ(cx + s * 24, cy + 2, 8, A.ink, A.brass, 1); }
                    circ(cx, cy, 13, A.stone, A.brass, 1.5);
                    circ(cx - 3, cy - 2, 3, '#f3e3ea'); circ(cx + 4, cy + 2, 2.5, A.blush);
                    break;
                }
                case 'apt_telescope': {
                    const cx = x + w / 2, cy = y + h - 8;
                    ctx.strokeStyle = A.walnutLt; ctx.lineWidth = 1.5; ctx.beginPath();
                    for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * 2.1; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); }
                    ctx.stroke();
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2 + 0.25 * Math.sin(t * 0.2));
                    rr(-3, -3.5, 26, 7, 3, A.brass); rr(20, -4.5, 6, 9, 2, '#9a7c4a'); ctx.restore();
                    break;
                }
                case 'apt_dining': {                                       // round walnut table for six: blush chairs tucked in, flowers and two candles
                    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.27;
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3 + Math.PI / 6, chx = cx + Math.cos(a) * (R + 13), chy = cy + Math.sin(a) * (R + 13);
                        ctx.save(); ctx.translate(chx, chy); ctx.rotate(a + Math.PI / 2);
                        rr(-9, -8, 18, 17, 5, A.blush, '#b27a82', 1); rr(-9, 5, 18, 5, 2.5, A.wine);   // seat, the back away from the table
                        ctx.restore();
                    }
                    circ(cx + 2, cy + 3, R, 'rgba(0,0,0,0.35)');
                    circ(cx, cy, R, A.walnut, A.brass, 1.5); circ(cx, cy, R - 5, A.walnutLt);
                    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6; for (let k = 6; k < R - 5; k += 5) { ctx.beginPath(); ctx.arc(cx, cy, k, 0, Math.PI * 2); ctx.stroke(); }
                    circ(cx, cy, 8, '#e9e3ec', A.brass, 1);                                                      // a marble lazy susan, a posy on it
                    for (let i = 0; i < 6; i++) circ(cx + Math.cos(i * 1.05) * 4, cy + Math.sin(i * 1.05) * 4, 2.2, i % 2 ? A.blushLt : '#f3e3ea');
                    circ(cx, cy, 1.8, A.leafLt);
                    for (const s of [-1, 1]) { circ(cx + s * 13, cy - s * 6, 2.4, A.brass); circ(cx + s * 13, cy - s * 6, 1.2, '#fff1d6'); }   // candlesticks
                    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; circ(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9), 4, '#f4f0ea', 'rgba(201,164,106,0.8)', 0.6); }   // places set
                    break;
                }
                case 'apt_piano': {                                        // a baby grand in black lacquer, lid up: the gold harp and strings, keys to the south
                    const body = new Path2D();
                    body.moveTo(x + 4, y + h - 14); body.lineTo(x + 4, y + 10);
                    body.quadraticCurveTo(x + 4, y + 2, x + 16, y + 2); body.lineTo(x + w * 0.5, y + 2);
                    body.bezierCurveTo(x + w * 0.72, y + 2, x + w * 0.62, y + h * 0.42, x + w * 0.86, y + h * 0.48);
                    body.quadraticCurveTo(x + w - 2, y + h * 0.54, x + w - 2, y + h - 14); body.closePath();
                    ctx.save(); ctx.translate(2, 3); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(body); ctx.restore();
                    ctx.fillStyle = '#121014'; ctx.fill(body); ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 1.2; ctx.stroke(body);
                    ctx.save(); ctx.clip(body);
                    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(x + 10, y + 8, w * 0.62, h - 26);                            // the harp
                    ctx.strokeStyle = 'rgba(255,230,180,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath();
                    for (let sx = x + 13; sx < x + w * 0.7; sx += 2.6) { ctx.moveTo(sx, y + h - 18); ctx.lineTo(sx + (sx - x) * 0.12, y + 8); }
                    ctx.stroke();
                    ctx.strokeStyle = A.brass; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.42, 9, 12, 0, 0, Math.PI * 2); ctx.stroke();
                    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
                    ctx.restore();
                    ctx.strokeStyle = 'rgba(30,26,34,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w * 0.8, y + h * 0.5); ctx.stroke();   // the prop stick and lid edge
                    rr(x + 2, y + h - 16, w - 2, 12, 1.5, '#1a1720', '#3a3440', 1);                                          // keyboard
                    rr(x + 5, y + h - 14, w - 8, 8, 1, '#f4f1ea');
                    ctx.fillStyle = '#141018'; for (let k = 0, kx = x + 7; kx < x + w - 6; kx += 3.4, k++) if (k % 7 !== 2 && k % 7 !== 6) ctx.fillRect(kx, y + h - 14, 1.8, 4.6);
                    rr(x + w * 0.3, y + h - 3, w * 0.4, 7, 2, A.wine, A.brass, 0.8);                                       // the bench
                    break;
                }
                case 'apt_bench': {                                        // tufted bench at the foot of the bed, brass legs
                    for (const [lx, ly] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) circ(lx + 1, ly + 1, 1.8, A.brass);
                    rr(x, y, w, h, 5, A.blush, '#b27a82', 1);
                    for (let i = 1; i < 6; i++) circ(x + w * i / 6, y + h / 2, 1.2, '#b27a82');
                    rr(x + w - 30, y + 2, 22, h - 4, 3, '#e9dcc8');                                                     // a folded throw
                    break;
                }
                case 'apt_chaise': {                                       // velvet chaise longue in Silver Queen plum, a silver bolster
                    rr(x, y, w, h, 10, '#2d1d59', '#4c3a94', 1.2);
                    rr(x + 3, y + 4, w - 6, 22, 8, '#3a2a6e');                                                          // raised back end
                    ctx.strokeStyle = 'rgba(207,200,226,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let ty = y + 34; ty < y + h - 8; ty += 14) { ctx.moveTo(x + 6, ty); ctx.lineTo(x + w - 6, ty); }
                    ctx.stroke();
                    rr(x + 5, y + 26, w - 10, 8, 4, '#cfc8e2');                                                         // bolster
                    rr(x + 8, y + h - 30, w - 14, 18, 3, '#e9dcc8');                                                    // an open book and a throw
                    ctx.fillStyle = '#f4f0ea'; ctx.fillRect(x + w / 2 - 7, y + 46, 14, 9); ctx.fillStyle = A.wine; ctx.fillRect(x + w / 2 - 0.5, y + 46, 1, 9);
                    break;
                }
                case 'apt_firepit': {                                      // the veranda's fire bowl: travertine ring, bronze bowl, a bed of embers
                    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;
                    if (PropPass.seg(false)) {
                        circ(cx + 2, cy + 3, R, 'rgba(0,0,0,0.35)');
                        circ(cx, cy, R, '#cdbfae', '#a99a88', 1.5); circ(cx, cy, R - 6, '#6a4a2a', A.brass, 1.5); circ(cx, cy, R - 10, '#1a0f0a');
                        for (let i = 0; i < 9; i++) circ(cx + Math.cos(i * 2.4) * (R - 15) * ((i * 37 % 10) / 10), cy + Math.sin(i * 2.4) * (R - 15) * ((i * 37 % 10) / 10), 2.4, '#2e1a12');
                    }
                    if (PropPass.seg(true)) for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + t * 0.4, d = (R - 14) * (0.2 + 0.6 * ((i * 0.37) % 1)), f = 0.6 + 0.4 * Math.sin(t * 6 + i * 2.1);
                        ctx.fillStyle = `rgba(255,${120 + 90 * f | 0},50,${0.6 + 0.35 * f})`;
                        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3.2 * f + 1, 2.6 * f + 1, a, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'apt_patio_sofa': {                                   // outdoor sofa: teak frame, cream cushions, a blush pillow; back along the outer side
                    const east = p.decor.face === 'W';                                                 // (faces west: back on the east side)
                    rr(x, y, w, h, 5, '#6e5040', '#4a3428', 1);
                    rr(east ? x + w - 9 : x + 1, y + 1, 8, h - 2, 3, '#b9ab98');                                         // back cushion
                    rr(east ? x + 2 : x + 10, y + 3, w - 12, h / 2 - 4, 3, '#cfc2b0'); rr(east ? x + 2 : x + 10, y + h / 2 + 1, w - 12, h / 2 - 4, 3, '#cfc2b0');
                    rr(east ? x + w - 18 : x + 9, y + h / 2 - 8, 9, 16, 3, A.blush);
                    break;
                }
                case 'apt_planter': {
                    rr(x, y, w, h, 3, '#8c7f76', '#a79a90', 1); rr(x + 3, y + 3, w - 6, h - 6, 2, '#3a2a24');
                    for (let i = 0; i < 6; i++) {
                        const lx = x + 6 + i * (w - 12) / 5;
                        ctx.fillStyle = i % 2 ? A.leaf : A.leafLt; ctx.beginPath(); ctx.ellipse(lx, y + h / 2, 6, 4, i, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = A.leaf; ctx.beginPath(); ctx.ellipse(lx + 2, y + h + 3, 3, 5, 0.3, 0, Math.PI * 2); ctx.fill();   // trailing
                    }
                    circ(x + w * 0.3, y + h / 2, 2, A.blushLt); circ(x + w * 0.7, y + h / 2 - 2, 2, '#f3e3ea');
                    break;
                }
            }
        }

        // The House of Death (gauntlet): black marble, oxblood wood, gold, violet glass, cyan holograms.
        const HOD = {
            ink: '#0e0b12', marble: '#1d1824', marbleLt: '#2e2738', gold: '#c9a46a', goldLt: '#ecd09a',
            wine: '#4a1624', crimson: '#8a1f35', violet: '#7a4dd8', violetLt: '#b48cff', bone: '#e6ddd0',
            steel: '#3a3d48', steelLt: '#6a7080', wood: '#3a2226', woodLt: '#5a3438', holo: '#7fe0ff'
        };

        function drawHouseDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000, C = HOD, d = p.decor || {};
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            const flame = (fx, fy, s = 1, k = 0) => {                     // a candle: wax, then a breathing flame
                circ(fx, fy, 2.2 * s, C.bone);
                const f = 0.75 + 0.25 * Math.sin(t * 11 + fx * 0.3 + k);
                circ(fx, fy - 0.5, 1.6 * s * f, `rgba(255,${190 + 40 * f | 0},110,0.95)`);
            };
            switch (p.decorType) {
                case 'hod_candelabra': {                                  // wrought iron, five candles
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, w / 2 - 1, null, C.gold, 1.4);
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.beginPath();
                    ctx.moveTo(cx - w / 2 + 3, cy); ctx.lineTo(cx + w / 2 - 3, cy); ctx.moveTo(cx, cy - h / 2 + 3); ctx.lineTo(cx, cy + h / 2 - 3); ctx.stroke();
                    flame(cx, cy, 1.1); flame(cx - w / 2 + 3, cy, 0.9, 1); flame(cx + w / 2 - 3, cy, 0.9, 2); flame(cx, cy - h / 2 + 3, 0.9, 3); flame(cx, cy + h / 2 - 3, 0.9, 4);
                    break;
                }
                case 'hod_table': {                                       // oxblood table, gold inlay; a runner and candles when laid
                    rr(x, y, w, h, 5, C.wood, C.woodLt, 1.2);
                    rr(x + 4, y + 4, w - 8, h - 8, 3, null, 'rgba(201,164,106,0.45)', 0.8);
                    if (d.candles) {
                        rr(x + 12, y + h / 2 - 8, w - 24, 16, 2, C.crimson);
                        ctx.fillStyle = 'rgba(236,208,154,0.5)'; ctx.fillRect(x + 12, y + h / 2 - 8, w - 24, 1); ctx.fillRect(x + 12, y + h / 2 + 7, w - 24, 1);
                        for (let i = 0; i < 6; i++) { const px = x + 30 + i * (w - 60) / 5; circ(px, y + 13, 5, C.bone, 'rgba(0,0,0,0.3)'); circ(px, y + h - 13, 5, C.bone, 'rgba(0,0,0,0.3)'); }
                        flame(x + w * 0.25, y + h / 2, 1.1); flame(x + w * 0.75, y + h / 2, 1.1, 2);
                        circ(x + w / 2, y + h / 2, 7, C.violet); circ(x + w / 2, y + h / 2, 3.5, C.violetLt);   // a dark bloom
                    } else {
                        rr(x + 14, y + 10, 26, 18, 1, C.bone); rr(x + 18, y + 13, 26, 18, 1, C.crimson);        // open books
                        circ(x + w - 22, y + h / 2, 8, null, C.gold, 1.2); circ(x + w - 22, y + h / 2, 3, C.goldLt);   // an astrolabe
                    }
                    break;
                }
                case 'hod_chair': {                                       // gothic high back, pointed crest (back on the far side from `face`)
                    rr(x, y, w, h, 3, C.crimson, C.wine, 1);
                    const f = d.face || 'S';
                    ctx.fillStyle = C.wood;
                    if (f === 'S') ctx.fillRect(x - 1, y - 4, w + 2, 6); else if (f === 'N') ctx.fillRect(x - 1, y + h - 2, w + 2, 6);
                    else if (f === 'E') ctx.fillRect(x - 4, y - 1, 6, h + 2); else ctx.fillRect(x + w - 2, y - 1, 6, h + 2);
                    ctx.fillStyle = C.gold; const cx = x + w / 2, cy = y + h / 2;
                    if (f === 'S') ctx.fillRect(cx - 1.5, y - 7, 3, 3); else if (f === 'N') ctx.fillRect(cx - 1.5, y + h + 4, 3, 3);
                    else if (f === 'E') ctx.fillRect(x - 7, cy - 1.5, 3, 3); else ctx.fillRect(x + w + 4, cy - 1.5, 3, 3);
                    break;
                }
                case 'hod_pew': {
                    rr(x, y, w, h, 3, C.wood, C.woodLt, 1);
                    ctx.fillStyle = C.woodLt; ctx.fillRect(x + 2, y + h - 5, w - 4, 4);            // backrest
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * w / 4, y + 2, 1, h - 7);
                    ctx.fillStyle = C.gold; ctx.fillRect(x - 1, y + 2, 2, h - 4); ctx.fillRect(x + w - 1, y + 2, 2, h - 4);
                    break;
                }
                case 'hod_organ': {                                       // gold pipes over a black console
                    rr(x, y, w, h, 3, C.ink, C.gold, 1);
                    const n = 15;
                    for (let i = 0; i < n; i++) {
                        const px = x + 6 + i * (w - 12) / (n - 1), tall = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.55 + 0.4));
                        circ(px, y + 6 + (1 - tall) * 12, 3.2, C.gold, C.goldLt, 0.6);
                    }
                    rr(x + 20, y + h - 12, w - 40, 9, 1, C.bone);                                      // keys
                    ctx.fillStyle = C.ink; for (let i = 0; i < 18; i++) ctx.fillRect(x + 24 + i * (w - 48) / 18, y + h - 12, 1.5, 5);
                    break;
                }
                case 'hod_altar': {                                       // black stone, a violet cloth, a Dark Element crystal glowing
                    rr(x, y, w, h, 3, C.marble, C.marbleLt, 1.5);
                    rr(x + w * 0.3, y - 2, w * 0.4, h + 4, 1, '#3b1f6a');
                    ctx.fillStyle = C.gold; ctx.fillRect(x + w * 0.3, y + h + 1, w * 0.4, 1.5);
                    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
                    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(t * 0.4);
                    ctx.fillStyle = `rgba(180,120,255,${0.35 * pulse})`; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#6a3cc8'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = C.violetLt; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(2, 0); ctx.lineTo(0, 3); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill();
                    ctx.restore();
                    flame(x + 10, y + 10); flame(x + w - 10, y + 10, 1, 1); flame(x + 10, y + h - 10, 1, 2); flame(x + w - 10, y + h - 10, 1, 3);
                    break;
                }
                case 'hod_bookcase': {                                    // dark shelves of spines, gold-edged
                    rr(x, y, w, h, 2, C.ink, C.gold, 0.8);
                    const cols = ['#5a1a2a', '#2c2248', '#1f3a33', '#4a3a28', '#6a4a8a', '#3a1a1a'];
                    const along = d.vertical ? h : w, across = d.vertical ? w : h;
                    for (let i = 0, k = 0; i < along - 6; k++) {
                        const bw = 4 + ((k * 7) % 5);
                        ctx.fillStyle = cols[k % cols.length];
                        if (d.vertical) ctx.fillRect(x + 3, y + 3 + i, across - 6, Math.min(bw, along - 6 - i)); else ctx.fillRect(x + 3 + i, y + 3, Math.min(bw, along - 6 - i), across - 6);
                        i += bw + 0.6;
                    }
                    break;
                }
                case 'hod_console': {                                     // a steel plinth with a turning hologram
                    rr(x, y, w, h, 5, C.steel, C.steelLt, 1);
                    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.32;
                    ctx.save(); ctx.globalAlpha = 0.75 + 0.2 * Math.sin(t * 3);
                    circ(cx, cy, r, 'rgba(127,224,255,0.18)', C.holo, 1);
                    ctx.strokeStyle = 'rgba(180,140,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath();
                    ctx.ellipse(cx, cy, r, r * Math.abs(Math.cos(t * 1.3)), t * 0.7, 0, Math.PI * 2); ctx.stroke();
                    circ(cx, cy, 2, '#dff8ff');
                    ctx.restore();
                    break;
                }
                case 'hod_piano': {                                       // a black grand, lid open, gold strings

                    ctx.fillStyle = '#0b0a0e'; ctx.strokeStyle = C.gold; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.55, y); ctx.bezierCurveTo(x + w, y, x + w, y + h * 0.4, x + w * 0.8, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.strokeStyle = 'rgba(236,208,154,0.35)'; ctx.beginPath();
                    for (let i = 0; i < 9; i++) { ctx.moveTo(x + 18, y + 8 + i * (h - 16) / 8); ctx.lineTo(x + w * 0.62 + i * 3, y + 10 + i * (h - 20) / 8); }
                    ctx.stroke();
                    rr(x + 2, y + 6, 12, h - 12, 1, C.bone); ctx.fillStyle = '#0b0a0e'; for (let i = 0; i < 12; i++) ctx.fillRect(x + 8, y + 9 + i * (h - 18) / 12, 6, 2);
                    break;
                }
                case 'hod_column': {                                      // a black marble column, gold capital ring
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, w / 2, C.marble, C.gold, 1.5); circ(cx, cy, w / 2 - 5, C.marbleLt);
                    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 8, -2.4, -0.8); ctx.stroke();
                    break;
                }
                case 'hod_fountain': {                                    // a round basin, rain rippling, an obsidian spire
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx, cy, R, '#3a3a44', C.gold, 1.2); circ(cx, cy, R - 7, '#1a2a3a');
                    ctx.strokeStyle = 'rgba(170,200,255,0.3)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(cx, cy, 12 + ph * (R - 20), 0, Math.PI * 2); ctx.stroke(); }
                    ctx.globalAlpha = 1;
                    circ(cx, cy, 11, C.ink, C.violetLt, 1); circ(cx, cy, 4, C.violet);
                    break;
                }
                case 'hod_statue': {                                      // a weeping angel on a plinth: wings spread
                    const cx = x + w / 2, cy = y + h / 2;
                    rr(x, y, w, h, 3, '#4a4a52', '#6a6a72', 1);
                    ctx.fillStyle = '#9a98a4';
                    ctx.beginPath(); ctx.ellipse(cx - 8, cy, 9, 4, -0.5, 0, Math.PI * 2); ctx.ellipse(cx + 8, cy, 9, 4, 0.5, 0, Math.PI * 2); ctx.fill();
                    circ(cx, cy + 1, 5, '#b4b2bc'); circ(cx, cy - 4, 3, '#c4c2cc');
                    break;
                }
                case 'hod_portrait': {                                    // a gilt frame on the wall, a dim figure within
                    rr(x, y, w, h, 1, C.gold, C.goldLt, 0.6);
                    rr(x + 1.5, y + 1.5, w - 3, h - 3, 1, C.wine);
                    ctx.fillStyle = 'rgba(230,221,208,0.35)';
                    if (d.vertical) ctx.fillRect(x + 2.5, y + h * 0.3, w - 5, h * 0.4); else ctx.fillRect(x + w * 0.3, y + 2.5, w * 0.4, h - 5);
                    break;
                }
                case 'hod_bust': {                                        // a marble head on a black plinth
                    rr(x, y, w, h, 3, C.ink, C.gold, 1);
                    circ(x + w / 2, y + h / 2 + 2, w * 0.3, '#cfc8c0'); circ(x + w / 2, y + h / 2 - 2, w * 0.2, C.bone);
                    break;
                }
                case 'hod_coffin': {                                      // a hexagonal coffin under violet glass, gold cross-bands
                    const pts = [[0, 0.5], [0.18, 0], [0.8, 0.1], [1, 0.5], [0.8, 0.9], [0.18, 1]];
                    const path = (dx = 0, dy = 0) => { ctx.beginPath(); pts.forEach(([u, v], i) => ctx[i ? 'lineTo' : 'moveTo'](x + dx + u * w, y + dy + v * h)); ctx.closePath(); };

                    path(); ctx.fillStyle = '#120a14'; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    const pulse = 0.6 + 0.4 * Math.sin(t * 1.7);
                    ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * pulse; ctx.fillStyle = C.violet;
                    ctx.beginPath(); ctx.ellipse(x + w * 0.52, y + h / 2, w * 0.3, h * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    ctx.fillStyle = C.gold; ctx.fillRect(x + w * 0.35, y + 4, 2, h - 8); ctx.fillRect(x + w * 0.2, y + h / 2 - 1, w * 0.6, 2);
                    break;
                }
                case 'hod_reliquary': {                                   // a glass case on a gold stand, a relic floating inside
                    rr(x, y, w, h, 3, C.ink, C.gold, 1.2);
                    rr(x + 4, y + 4, w - 8, h - 8, 2, 'rgba(180,150,255,0.14)', 'rgba(220,200,255,0.5)', 0.8);
                    const bob = Math.sin(t * 2 + x) * 1.5;
                    circ(x + w / 2, y + h / 2 + bob, 4, (x + y) % 2 ? '#ff8a6a' : C.violetLt);
                    break;
                }
            }
        }

        // Double Nights (hotel lobby): black lacquer and marble, gold, silver, crimson velvet.
        const DNL = {
            ink: '#0e0c10', marble: '#1b181e', marbleLt: '#2e2934', gold: '#e8c27a', goldDk: '#a8823e', goldLt: '#fff1c2',
            silver: '#dfe6ff', silverDk: '#8a90a8', crimson: '#8a1024', crimsonLt: '#b8203a', velvet: '#6a0c1c', cream: '#f3e6c8',
            leaf: '#1f4a34', leafLt: '#2f6a48'
        };

        function drawLobbyDecorProp(ctx, p) {
            const x = p.x, w = p.width, h = p.height, t = _frameTime / 1000, C = DNL;
            // Floating pieces bob on a faint gold hover-glow; their shadow stays on the floor
            const floats = p.decorType.startsWith('dn_float');
            const bob = floats ? Math.sin(t * 1.6 + x * 0.05) * 3 - 6 : 0;
            const y = p.y + bob;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            if (floats) {                                                  // the hover-glow beneath
                ctx.save(); ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 3 + x);
                ctx.fillStyle = 'rgba(232,194,122,0.5)'; ctx.beginPath(); ctx.ellipse(x + w / 2, p.y + h / 2 + 2, w * 0.45, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            switch (p.decorType) {
                case 'dn_fountain': {                                      // black-marble basin, water sheeting down a glass column round a turning rift
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx, cy, R, C.marble, C.gold, 2); circ(cx, cy, R - 5, null, 'rgba(223,230,255,0.35)', 1);
                    circ(cx, cy, R - 8, '#0f1a2a');
                    ctx.strokeStyle = 'rgba(180,210,255,0.35)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) { const ph = (t * 0.45 + i / 3) % 1; ctx.globalAlpha = 1 - ph; circ(cx, cy, 22 + ph * (R - 32), null, 'rgba(180,210,255,0.45)', 1); }
                    ctx.globalAlpha = 1;
                    circ(cx, cy, 22, 'rgba(200,220,255,0.10)', 'rgba(223,230,255,0.7)', 1.5);     // the glass column
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate((t * 0.5) % (Math.PI * 2));   // the rift, turning
                    for (let k = 0; k < 2; k++) {
                        ctx.rotate(Math.PI);
                        ctx.strokeStyle = k ? 'rgba(232,194,122,0.9)' : 'rgba(190,130,255,0.9)'; ctx.lineWidth = 2.2;
                        ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 1.4, r = 3 + i * 0.75; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
                    }
                    ctx.restore();
                    circ(cx, cy, 3, '#fff6e0');
                    break;
                }
                case 'dn_desk': {                                          // curved black marble, gold edge; bell, key rack, ledger
                    const cx = x + w / 2;

                    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, y + h * 0.9, x + w, y); ctx.lineTo(x + w, y + h * 0.5); ctx.quadraticCurveTo(cx, y + h * 1.5, x, y + h * 0.5); ctx.closePath();
                    ctx.fillStyle = C.marbleLt; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5; ctx.stroke();
                    ctx.strokeStyle = 'rgba(223,230,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath();          // silver veins
                    for (let i = 0; i < 5; i++) { ctx.moveTo(x + 20 + i * 45, y + 6); ctx.quadraticCurveTo(x + 40 + i * 45, y + 20, x + 30 + i * 45, y + 34); }
                    ctx.stroke();
                    circ(x + 34, y + 12, 5, C.gold, C.goldLt, 1); circ(x + 34, y + 12, 1.5, C.goldLt);   // the bell
                    rr(cx - 12, y + 16, 24, 14, 1, C.cream, C.goldDk, 0.8); ctx.fillStyle = C.crimson; ctx.fillRect(cx - 0.5, y + 16, 1, 14);   // ledger
                    rr(x + w - 58, y + 6, 30, 10, 1, C.silverDk); for (let i = 0; i < 6; i++) circ(x + w - 54 + i * 4.4, y + 11, 1.3, C.silver);   // keys
                    break;
                }
                case 'dn_sofa': {                                          // red velvet, buttoned, gold feet
                    rr(x, y, w, h, 10, C.velvet);
                    const back = p.y < 800 ? 'N' : 'S';                    // faces into the lounge
                    rr(x + 2, back === 'N' ? y : y + h - 16, w - 4, 16, 8, '#4a0814');
                    rr(x, y + 4, 14, h - 8, 6, '#4a0814'); rr(x + w - 14, y + 4, 14, h - 8, 6, '#4a0814');
                    ctx.fillStyle = 'rgba(255,200,210,0.35)';
                    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + 22 + i * (w - 44) / 4, back === 'N' ? y + 8 : y + h - 8, 1.3, 0, Math.PI * 2); ctx.fill(); }
                    rr(x + 16, back === 'N' ? y + 18 : y + 6, (w - 34) / 2, h - 26, 5, C.crimsonLt); rr(x + w / 2 + 1, back === 'N' ? y + 18 : y + 6, (w - 34) / 2, h - 26, 5, C.crimsonLt);
                    for (const [fx, fy] of [[x + 2, y + 2], [x + w - 5, y + 2], [x + 2, y + h - 5], [x + w - 5, y + h - 5]]) { ctx.fillStyle = C.gold; ctx.fillRect(fx, fy, 3, 3); }
                    break;
                }
                case 'dn_wingback': {
                    rr(x, y, w, h, 6, C.velvet);
                    rr(x + 2, y + (p.y < 950 ? h - 12 : 0), w - 4, 12, 5, '#4a0814'); rr(x, y + 4, 8, h - 8, 4, '#4a0814'); rr(x + w - 8, y + 4, 8, h - 8, 4, '#4a0814');
                    rr(x + 10, y + 8, w - 20, h - 20, 4, C.crimsonLt);
                    break;
                }
                case 'dn_table': {                                         // marble top on gold legs, champagne and a vase
                    rr(x, y, w, h, h / 2, '#e9e4ea', C.gold, 2);
                    ctx.strokeStyle = 'rgba(120,110,130,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w - 12, y + 10); ctx.stroke();
                    circ(x + w * 0.3, y + h / 2, 3, 'rgba(255,240,200,0.9)', C.gold, 0.8); circ(x + w * 0.42, y + h / 2 + 3, 3, 'rgba(255,240,200,0.9)', C.gold, 0.8);   // flutes
                    circ(x + w * 0.72, y + h / 2, 6, C.ink, C.gold, 1); for (let i = 0; i < 5; i++) circ(x + w * 0.72 + Math.cos(i * 1.26) * 4, y + h / 2 + Math.sin(i * 1.26) * 4, 2, i % 2 ? '#e8b4b8' : C.crimsonLt);
                    break;
                }
                case 'dn_lamp': {                                          // a champagne-gold floor lamp
                    const cx = x + w / 2, cy = y + h / 2;
                    drawLampFixture(ctx, 'shade_floor', cx, cy, { scale: w / 26, lit: true, color: '#fff0c8' });   // (the lobby's lamps always burn)
                    break;
                }
                case 'dn_palm': {                                          // a potted palm in a gold urn
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, w * 0.32, C.ink, C.gold, 1.5);
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + Math.sin(t * 0.8 + i) * 0.04, L = w * 0.62;
                        ctx.strokeStyle = i % 2 ? C.leafLt : C.leaf; ctx.lineWidth = 4; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * L * 0.6, cy + Math.sin(a + 0.3) * L * 0.6, cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
                    }
                    ctx.lineCap = 'butt';
                    break;
                }
                case 'dn_float_chaise': {                                  // a chaise hanging in the air, silver-edged
                    rr(x, y, w, h, 12, '#2a0a14', C.silver, 1.2);
                    rr(x + 4, y + 4, w * 0.3, h - 8, 8, C.crimsonLt); rr(x + w * 0.34, y + 6, w * 0.6, h - 12, 6, C.velvet);
                    ctx.fillStyle = 'rgba(223,230,255,0.25)'; ctx.fillRect(x + 12, y + 2, w - 24, 1);
                    break;
                }
                case 'dn_float_chair': {
                    rr(x, y, w, h, 8, '#2a0a14', C.gold, 1.2);
                    rr(x + 6, y + 6, w - 12, h - 12, 6, C.crimsonLt);
                    break;
                }
                case 'dn_lost_luggage': {                                  // a hard case; open (and empty) once searched
                    const open = p._searched;
                    rr(x, y, w, h, 3, '#3a2a4a', C.gold, 1);
                    if (open) { rr(x - 2, y - h * 0.55, w + 4, h * 0.55, 3, '#2a1e38', C.goldDk, 1); rr(x + 3, y + 3, w - 6, h - 6, 2, '#1a1224'); }
                    else { ctx.fillStyle = C.gold; ctx.fillRect(x + w / 2 - 4, y - 2, 8, 3); ctx.fillRect(x + 4, y + h / 2 - 0.5, w - 8, 1);
                           const tagSwing = Math.sin(t * 2 + x) * 0.2; ctx.save(); ctx.translate(x + w - 4, y + 2); ctx.rotate(0.6 + tagSwing); ctx.fillStyle = C.cream; ctx.fillRect(0, 0, 5, 8); ctx.restore(); }
                    break;
                }
            }
        }

        /* The two machines every map shares, one design each (standard size 40×60):
           MiniSpree — the city's vending brand: glossy black, a lit window of cans, a pink-and-cyan
           marquee; and the health station — Dr. Yin's refill cabinet: white and wine, a green cross,
           a rack of stim vials, a vitals readout. */
        // (PropPass segments, entities/prop-sprites.js: the still runs are painted once; the neon's hum,
        //  the window's light, and the station's cross, vials and trace stay live, each at its own depth)
        function drawMiniSpree(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const hum = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3);
            const wx = x + 4, wy = y + 13, ww = w - 8, wh = h * 0.5;
            ctx.save();
            if (PropPass.seg(false)) {

                ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
            }
            if (PropPass.seg(true)) {
                ctx.shadowColor = '#3ef0ff'; ctx.shadowBlur = 8 * hum;                               // neon edge
                ctx.strokeStyle = `rgba(62,240,255,${0.55 * hum})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke();
                ctx.shadowBlur = 0;
            }
            if (PropPass.seg(false)) {
                // Marquee
                const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#3ef0ff');
                ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, 9, 2); ctx.fill();
                ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.max(5, Math.floor(w * 0.16))}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('MiniSpree', x + w / 2 + 2, y + 6.8);
                ctx.fillStyle = '#fff6b0'; ctx.beginPath(); const sx = x + 6, sy = y + 6.5;                // the little spark
                for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 1 : 2.6; ctx[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
                // The window of cans: bubble tea, Jean soda, stellar lemonade
                ctx.fillStyle = '#10141e'; ctx.fillRect(wx, wy, ww, wh);
                const cans = ['#c89a6a', '#3a6ad0', '#ffe45a'], cw = (ww - 8) / 3;
                for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
                    const cx = wx + 2 + i * (cw + 2), cy = wy + 2 + row * (wh - 4) / 3;
                    ctx.fillStyle = cans[i]; ctx.beginPath(); ctx.roundRect(cx, cy, cw, (wh - 4) / 3 - 2, 1.5); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx + 1, cy + 1, 1, (wh - 4) / 3 - 4);
                }
            }
            if (PropPass.seg(true)) { ctx.fillStyle = `rgba(190,240,255,${0.10 * hum})`; ctx.fillRect(wx, wy, ww, wh); }   // the window's light
            if (PropPass.seg(false)) {
                ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx + ww * 0.2, wy + wh); ctx.lineTo(wx + ww * 0.75, wy); ctx.stroke();   // glass glint
                // Keypad, card slot, pickup tray
                const ky = wy + wh + 3;
                ctx.fillStyle = '#3ef0ff'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 6 + (i % 3) * 4, ky + Math.floor(i / 3) * 4, 2, 2);
                ctx.fillStyle = '#e8c27a'; ctx.fillRect(x + w - 12, ky, 6, 2);
                ctx.fillStyle = '#ff4fa3'; ctx.fillRect(x + w - 12, ky + 4, 6, 1);
                ctx.fillStyle = '#050508'; ctx.beginPath(); ctx.roundRect(x + 5, y + h - 9, w - 10, 5, 1.5); ctx.fill();
            }
            ctx.restore();
        }

        function drawHealthStation(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const pulse = 0.7 + 0.3 * Math.sin(t * 2.5);
            const cx = x + w / 2, cy = y + 11, s = 5;
            const ry = y + 20, rh = h * 0.34, n = 5, vw = (w - 10) / n;
            const sy = ry + rh + 3, sh = h - (sy - y) - 5;
            ctx.save();
            if (PropPass.seg(false)) {

                ctx.fillStyle = '#eceef2'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
                ctx.strokeStyle = '#6a1a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 4); ctx.stroke();
            }
            if (PropPass.seg(true)) {                                                                // the green cross, glowing
                ctx.shadowColor = '#00ff66'; ctx.shadowBlur = 10 * pulse;
                ctx.fillStyle = '#12c85a'; ctx.fillRect(cx - s, cy - s * 0.35, s * 2, s * 0.7); ctx.fillRect(cx - s * 0.35, cy - s, s * 0.7, s * 2);
                ctx.shadowBlur = 0;
            }
            // A rack of stim vials, refilling (glass, then levels, then caps: the vials never overlap, so by pass is as by vial)
            if (PropPass.seg(false)) {
                ctx.fillStyle = '#d4d8de'; ctx.fillRect(x + 4, ry, w - 8, rh);
                ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < n; i++) ctx.fillRect(x + 5 + i * vw + 0.5, ry + 2, vw - 2, rh - 4);
            }
            if (PropPass.seg(true)) {
                ctx.fillStyle = '#19d46a';
                for (let i = 0; i < n; i++) { const lvl = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.3)); ctx.fillRect(x + 5 + i * vw + 0.5, ry + 2 + (rh - 4) * (1 - lvl), vw - 2, (rh - 4) * lvl); }
            }
            if (PropPass.seg(false)) {
                ctx.fillStyle = '#6a1a2a'; for (let i = 0; i < n; i++) ctx.fillRect(x + 5 + i * vw + 0.5, ry + 1, vw - 2, 1.5);
                // Vitals readout: a trace running across a dark screen
                ctx.fillStyle = '#0a1410'; ctx.beginPath(); ctx.roundRect(x + 4, sy, w - 8, sh, 2); ctx.fill();
            }
            if (PropPass.seg(true)) {
                ctx.strokeStyle = '#3cff8a'; ctx.lineWidth = 1; ctx.beginPath();
                const mid = sy + sh / 2, ph = (t * 30) % (w - 8);
                for (let i = 0; i <= w - 8; i += 1) {
                    const k = (i + ph) % 24, beat = k > 8 && k < 11 ? -sh * 0.35 : k > 11 && k < 13 ? sh * 0.25 : 0;
                    ctx[i ? 'lineTo' : 'moveTo'](x + 4 + i, mid + beat);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // Moon City Nightclub: black lacquer, chrome, violet and lavender neon, gold, rose-wine velvet.
        const MC = {
            ink: '#0b0810', lacquer: '#1a1022', lacquerLt: '#2a1a36', violet: '#8a5cff', lavender: '#c8a8ff', lilac: '#e8d8ff',
            gold: '#e8c27a', goldDk: '#a8823e', goldLt: '#fff1c2', rose: '#ff5a8a', velvet: '#5a0c34', velvetLt: '#8a1a52', velvetDk: '#3a0620',
            chrome: '#d8dcef', chromeDk: '#6a6e82', marble: '#ece6f0', marbleDk: '#b8aec4', porcelain: '#f4f2f8', steel: '#3a3848'
        };

        function drawClubDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000, C = MC, d = p.decor || {};
            const beat = ((clubBeatN() % 1) + 1) % 1, pulse = Math.pow(1 - beat, 3);   // on the music's kick (audio.js)
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            const tufts = (X, Y, W, H, n, m, col) => { ctx.fillStyle = col; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { ctx.beginPath(); ctx.arc(X + (i + 0.5) * W / n, Y + (j + 0.5) * H / m, 1.1, 0, Math.PI * 2); ctx.fill(); } };
            switch (p.decorType) {
                case 'mc_stage': {                                         // raised black stage, a gold lip, lavender LED strip on the front edge
                    rr(x, y, w, h, 6, C.lacquer, C.goldDk, 1.5);
                    ctx.strokeStyle = 'rgba(200,168,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let px = x + 20; px < x + w; px += 20) { ctx.moveTo(px, y + 2); ctx.lineTo(px, y + h - 6); } ctx.stroke();
                    rr(x + 4, y + h - 6, w - 8, 3, 1.5, `rgba(200,168,255,${0.55 + 0.4 * pulse})`);
                    ctx.fillStyle = C.gold; ctx.fillRect(x + 2, y + h - 2, w - 4, 1.5);
                    // Crescent logo on the backdrop
                    ctx.save(); ctx.globalAlpha = 0.5; circ(x + w / 2, y + 16, 9, C.lavender); ctx.globalCompositeOperation = 'destination-out'; circ(x + w / 2 + 4, y + 14, 8, '#000'); ctx.restore();
                    break;
                }
                case 'mc_dj': {                                            // the booth: two decks, a mixer, a laptop, LED strip
                    rr(x, y, w, h, 4, '#120c18', C.chromeDk, 1);
                    rr(x + 2, y + h - 5, w - 4, 3, 1.5, `rgba(255,90,138,${0.5 + 0.5 * pulse})`);
                    for (const cx of [x + 26, x + w - 26]) {
                        circ(cx, y + 17, 13, '#1e1a24', C.chromeDk, 1); circ(cx, y + 17, 11, '#0a080c');
                        ctx.strokeStyle = 'rgba(200,168,255,0.25)'; ctx.lineWidth = 0.6; for (const r of [4, 7, 9.5]) { ctx.beginPath(); ctx.arc(cx, y + 17, r, 0, Math.PI * 2); ctx.stroke(); }
                        const a = t * 4.2 + cx; ctx.strokeStyle = C.lilac; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, y + 17); ctx.lineTo(cx + Math.cos(a) * 10, y + 17 + Math.sin(a) * 10); ctx.stroke();
                        circ(cx, y + 17, 2, C.gold);
                    }
                    rr(x + w / 2 - 14, y + 5, 28, 26, 2, '#1a1620', '#3a3644', 0.8);    // mixer
                    for (let i = 0; i < 4; i++) { const lv = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 1.3)) * (0.5 + 0.5 * pulse); rr(x + w / 2 - 11 + i * 6, y + 27 - 18 * lv, 3, 18 * lv, 1, i < 2 ? C.lavender : C.rose); }
                    rr(x + w / 2 - 12, y - 4, 24, 8, 1, '#2a2632', C.chromeDk, 0.8); rr(x + w / 2 - 10, y - 3, 20, 5, 1, 'rgba(160,200,255,0.8)');   // laptop
                    break;
                }
                case 'mc_speaker': {                                       // a stack: two woofers breathing on the kick, a tweeter
                    rr(x, y, w, h, 3, '#141018', '#2e2838', 1.2);
                    const k = 1 + 0.08 * pulse;
                    for (const cy of [y + h * 0.33, y + h * 0.72]) { circ(x + w / 2, cy, w * 0.34 * k, '#1f1a26', C.chromeDk, 1); circ(x + w / 2, cy, w * 0.16 * k, '#0a080c'); circ(x + w / 2, cy, w * 0.05, C.chromeDk); }
                    circ(x + w / 2, y + 7, 3, '#2a2632', C.chromeDk, 0.6);
                    break;
                }
                case 'mc_pole': {                                          // a chrome pole on a lit plinth (the plinth ring is floor art; the glow in drawClubGlow)
                    const cx = x + w / 2, cy = y + h / 2;
                    const g = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 0.5, cx, cy, 5); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, C.chrome); g.addColorStop(1, C.chromeDk);
                    circ(cx, cy, 5, g); circ(cx, cy, 5, null, C.gold, 1);
                    break;
                }
                case 'mc_hightop': {                                       // round high-top: marble on a chrome ring, a cocktail, a candle
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx, cy, R, C.marble, C.gold, 1.5);
                    ctx.strokeStyle = 'rgba(120,100,140,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx - R + 4, cy - 3); ctx.quadraticCurveTo(cx, cy + 4, cx + R - 5, cy - 6); ctx.stroke();
                    circ(cx - 4, cy + 2, 3.2, 'rgba(255,90,138,0.8)', C.chrome, 0.7); circ(cx + 5, cy - 3, 2.2, '#fff2d8');
                    break;
                }
                case 'mc_booth': {                                         // a curved velvet booth round a marble table; faces north
                    ctx.fillStyle = C.velvetDk; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.quadraticCurveTo(x, y + h, x + 20, y + h); ctx.lineTo(x + w - 20, y + h); ctx.quadraticCurveTo(x + w, y + h, x + w, y + 10);
                    ctx.lineTo(x + w - 16, y + 10); ctx.quadraticCurveTo(x + w - 16, y + h - 16, x + w - 30, y + h - 16); ctx.lineTo(x + 30, y + h - 16); ctx.quadraticCurveTo(x + 16, y + h - 16, x + 16, y + 10); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.stroke();
                    tufts(x + 24, y + h - 13, w - 48, 10, 6, 1, 'rgba(255,190,220,0.35)');
                    ctx.fillStyle = C.velvetLt; ctx.beginPath(); ctx.moveTo(x + 16, y + 10); ctx.quadraticCurveTo(x + 16, y + h - 16, x + 30, y + h - 16); ctx.lineTo(x + w - 30, y + h - 16); ctx.quadraticCurveTo(x + w - 16, y + h - 16, x + w - 16, y + 10);
                    ctx.lineTo(x + w - 26, y + 10); ctx.quadraticCurveTo(x + w - 26, y + h - 26, x + w - 36, y + h - 26); ctx.lineTo(x + 36, y + h - 26); ctx.quadraticCurveTo(x + 26, y + h - 26, x + 26, y + 10); ctx.closePath(); ctx.fill();

                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 16, 26, 13, 0, 0, Math.PI * 2); ctx.fillStyle = C.marble; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.3; ctx.stroke();
                    circ(x + w / 2 - 8, y + 16, 2.8, 'rgba(255,240,200,0.9)', C.gold, 0.7); circ(x + w / 2 + 2, y + 13, 2.8, 'rgba(255,240,200,0.9)', C.gold, 0.7); circ(x + w / 2 + 12, y + 18, 2, '#fff2d8');
                    break;
                }
                case 'mc_backbar': {                                       // mirrored back bar: shelves of bottles, lit from beneath
                    rr(x, y, w, h, 2, '#150e1c', C.goldDk, 1);
                    rr(x + 2, y + 2, 6, h - 4, 1, 'rgba(200,168,255,0.18)');           // the mirror strip against the wall
                    const cols = ['#b8f0c0', '#ffd08a', '#ff8ab0', '#c8a8ff', '#9ad8ff', '#fff2d8', '#e8a060'];
                    for (let by = y + 8, i = 0; by < y + h - 6; by += 9, i++) {
                        const c = cols[(i * 5 + (x | 0)) % cols.length];
                        circ(x + 12 + (i % 2) * 5, by, 2.6, c, 'rgba(0,0,0,0.5)', 0.6); circ(x + 12 + (i % 2) * 5, by, 1, 'rgba(255,255,255,0.7)');
                    }
                    ctx.fillStyle = C.gold; ctx.fillRect(x + w - 2, y + 2, 1.2, h - 4);
                    break;
                }
                case 'mc_bar': {                                           // the counter: black marble veined gold, a curved gold rail, a row of gold taps
                    ctx.fillStyle = '#2a2234'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - 14, y); ctx.quadraticCurveTo(x + w, y + h / 2, x + w - 14, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = C.goldDk; ctx.lineWidth = 1; ctx.stroke();
                    ctx.strokeStyle = 'rgba(232,194,122,0.3)'; ctx.lineWidth = 0.7; ctx.beginPath();
                    for (let vy = y + 20; vy < y + h; vy += 46) { ctx.moveTo(x + 4, vy); ctx.bezierCurveTo(x + 14, vy + 12, x + 24, vy - 6, x + w - 16, vy + 14); } ctx.stroke();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w - 12, y + 4); ctx.quadraticCurveTo(x + w + 1, y + h / 2, x + w - 12, y + h - 4); ctx.stroke();   // the rail
                    ctx.strokeStyle = C.goldLt; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + w - 13, y + 6); ctx.quadraticCurveTo(x + w - 1, y + h / 2, x + w - 13, y + h - 6); ctx.stroke();
                    rr(x + 2, y + h / 2 - 34, 10, 68, 2, '#2a2230', C.goldDk, 0.8);                                     // the taps
                    for (let i = 0; i < 6; i++) { circ(x + 7, y + h / 2 - 28 + i * 11, 2.6, C.gold, C.goldLt, 0.6); rr(x + 10, y + h / 2 - 29 + i * 11, 6, 2, 1, C.goldDk); }
                    for (const [gx, f] of [[22, 0.12], [26, 0.3], [20, 0.7], [24, 0.9]]) circ(x + gx, y + h * f, 3, 'rgba(255,240,200,0.85)', C.gold, 0.7);
                    circ(x + 24, y + h * 0.22, 3.2, 'rgba(255,90,138,0.85)', C.chrome, 0.7); circ(x + 22, y + h * 0.8, 3.2, 'rgba(200,168,255,0.85)', C.chrome, 0.7);
                    break;
                }
                case 'mc_stool': {                                         // chrome and velvet
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, w / 2, C.chromeDk, C.chrome, 1.2); circ(cx, cy, w / 2 - 3, C.velvetLt);
                    circ(cx - 2, cy - 2, 2.5, 'rgba(255,190,220,0.3)');
                    break;
                }
                case 'mc_coatcheck': {                                     // a lacquer counter, a bell, tickets; the coat rail behind
                    rr(x + 2, y - 14, w - 4, 10, 3, '#120c18');
                    ctx.strokeStyle = C.chromeDk; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, y - 9); ctx.lineTo(x + w - 6, y - 9); ctx.stroke();
                    const coats = ['#2a1a36', '#5a0c34', '#1e2a3a', '#3a3040', '#8a1a52', '#1a1a1e', '#4a3a60'];
                    for (let i = 0; i < 11; i++) rr(x + 8 + i * 12.5, y - 13, 9, 9, 3, coats[i % coats.length], 'rgba(255,255,255,0.08)', 0.6);
                    rr(x, y, w, h, 4, C.lacquerLt, C.gold, 1.5);
                    rr(x + 4, y + 4, w - 8, h - 8, 3, C.lacquer);
                    circ(x + 22, y + h / 2, 4.5, C.gold, C.goldLt, 0.8); circ(x + 22, y + h / 2, 1.3, C.goldLt);
                    for (let i = 0; i < 4; i++) rr(x + 50 + i * 12, y + h / 2 - 5, 9, 10, 1, i % 2 ? C.lilac : C.goldLt, 'rgba(0,0,0,0.3)', 0.5);
                    rr(x + w - 40, y + h / 2 - 7, 26, 14, 2, '#0a080c', C.chromeDk, 0.8); rr(x + w - 38, y + h / 2 - 5, 22, 10, 1, 'rgba(200,168,255,0.55)');
                    break;
                }
                case 'mc_rope': {                                          // velvet rope sagging between chrome-and-gold stanchions
                    const posts = Math.max(2, Math.round(h / 36) + 1), vert = h > w;
                    const P = i => vert ? [x + w / 2, y + i * h / (posts - 1)] : [x + i * w / (posts - 1), y + h / 2];
                    ctx.lineCap = 'round';
                    for (let i = 0; i < posts - 1; i++) {
                        const [ax, ay] = P(i), [bx, by] = P(i + 1), sway = Math.sin(t * 1.4 + i) * 0.6;
                        ctx.strokeStyle = C.velvetLt; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 + (vert ? 5 + sway : 0), (ay + by) / 2 + (vert ? 0 : 5 + sway), bx, by); ctx.stroke();
                        ctx.strokeStyle = 'rgba(255,160,200,0.35)'; ctx.lineWidth = 1; ctx.stroke();
                    }
                    ctx.lineCap = 'butt';
                    for (let i = 0; i < posts; i++) { const [px, py] = P(i); circ(px, py, 5, C.chromeDk, C.chrome, 1); circ(px, py, 2.4, C.gold); }
                    break;
                }
                case 'mc_bench': {                                         // a buttoned velvet bench on gold feet
                    rr(x, y, w, h, 8, C.velvet, C.gold, 1);
                    rr(x + 4, y + 4, w - 8, h - 8, 6, C.velvetLt); tufts(x + 6, y + 6, w - 12, h - 12, 7, 2, 'rgba(255,190,220,0.4)');
                    break;
                }
                case 'mc_orb': {                                           // a moon orb floating over a black plinth, turning slowly
                    const cx = x + w / 2, cy = y + h / 2, bob = Math.sin(t * 1.5 + x) * 2;
                    circ(cx, cy, w / 2, C.lacquer, C.goldDk, 1.2);
                    const R = w * 0.3, oy = cy - 3 + bob;
                    const g = ctx.createRadialGradient(cx - R * 0.35, oy - R * 0.35, 1, cx, oy, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, C.lilac); g.addColorStop(1, '#9a86c8');
                    circ(cx, oy, R, g);
                    ctx.fillStyle = 'rgba(120,100,160,0.35)'; for (const [a, r] of [[t * 0.3, 0.45], [t * 0.3 + 2, 0.3], [t * 0.3 + 4, 0.55]]) { const c = Math.cos(a); if (c > -0.2) { ctx.beginPath(); ctx.arc(cx + c * R * r, oy + Math.sin(a * 1.3) * R * 0.3, R * 0.16, 0, Math.PI * 2); ctx.fill(); } }
                    break;
                }
                case 'mc_vanity': {                                        // marble vanity, round sinks, a mirror strip lit with bulbs (mirror on the wall side)
                    const north = d.face !== 'N';                          // default: against the north wall
                    const my = north ? y - 4 : y + h - 2;
                    rr(x, my, w, 6, 2, 'rgba(200,190,230,0.55)', C.gold, 1);
                    for (let bx = x + 8; bx < x + w - 4; bx += 16) circ(bx, my + 3, 1.7, `rgba(255,236,200,${0.8 + 0.2 * Math.sin(t * 2 + bx)})`);
                    rr(x, y, w, h, 3, C.marble, C.goldDk, 1);
                    ctx.strokeStyle = 'rgba(140,120,160,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let vx = x + 10; vx < x + w; vx += 38) { ctx.moveTo(vx, y + 2); ctx.quadraticCurveTo(vx + 12, y + h / 2, vx + 4, y + h - 2); } ctx.stroke();
                    const n = Math.max(2, Math.floor(w / 55));
                    for (let i = 0; i < n; i++) {
                        const sx = x + (i + 0.5) * w / n, sy = y + h / 2 + (north ? 2 : -2);
                        ctx.beginPath(); ctx.ellipse(sx, sy, 11, 8, 0, 0, Math.PI * 2); ctx.fillStyle = C.porcelain; ctx.fill(); ctx.strokeStyle = C.marbleDk; ctx.lineWidth = 0.8; ctx.stroke();
                        ctx.beginPath(); ctx.ellipse(sx, sy, 7, 5, 0, 0, Math.PI * 2); ctx.fillStyle = '#d8d4e4'; ctx.fill();
                        circ(sx, sy, 1, '#6a6e82'); rr(sx - 1, north ? y + 2 : y + h - 8, 2, 6, 1, C.gold);
                    }
                    if (w > 150) { circ(x + w - 14, y + h / 2, 3, '#e8b4c8'); circ(x + w - 22, y + h / 2 + 2, 2.4, C.lilac); }   // perfume
                    break;
                }
                case 'mc_stall': {                                         // a lacquer stall against the west wall, door (east side) ajar a hair
                    rr(x, y, w, h, 2, '#dcd6e4');                           // tile inside
                    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let gx = x + 10; gx < x + w; gx += 10) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); } for (let gy = y + 10; gy < y + h; gy += 10) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); } ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(x + 20, y + h / 2, 12, 9, 0, 0, Math.PI * 2); ctx.fillStyle = C.porcelain; ctx.fill(); ctx.strokeStyle = C.marbleDk; ctx.lineWidth = 0.8; ctx.stroke();   // the bowl
                    ctx.beginPath(); ctx.ellipse(x + 21, y + h / 2, 7, 5, 0, 0, Math.PI * 2); ctx.fillStyle = '#b8c8e0'; ctx.fill();
                    rr(x + 3, y + h / 2 - 10, 6, 20, 2, C.porcelain, C.marbleDk, 0.6);                                  // cistern
                    ctx.fillStyle = C.lacquerLt; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4);             // partitions
                    ctx.fillStyle = C.goldDk; ctx.fillRect(x, y + 3, w, 1); ctx.fillRect(x, y + h - 4, w, 1);
                    rr(x + w - 5, y + 4, 5, h - 8, 1, C.lacquer, C.gold, 0.8);                                         // the door
                    circ(x + w - 2.5, y + h / 2, 1.2, C.gold); rr(x + w - 4, y + h / 2 + 6, 3, 4, 0.5, '#4ad07a');      // handle, VACANT
                    break;
                }
                case 'mc_urinal': {                                        // wall-hung porcelain, a gold flush plate
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 2, y + h * 0.6); ctx.quadraticCurveTo(x + w / 2, y + h + 2, x + 2, y + h * 0.6); ctx.closePath();
                    ctx.fillStyle = C.porcelain; ctx.fill(); ctx.strokeStyle = C.marbleDk; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.5, w * 0.28, h * 0.28, 0, 0, Math.PI * 2); ctx.fillStyle = '#c8d4e8'; ctx.fill();
                    rr(x + w / 2 - 3, y + 1, 6, 3, 1, C.gold);
                    break;
                }
                case 'mc_dryer': {                                         // chrome hand dryer, a blue ready-light
                    rr(x, y, w, h, 4, C.chromeDk, C.chrome, 1);
                    if (d.vertical) { rr(x + 3, y + 6, w - 6, h - 12, 3, '#2a2e3a'); circ(x + w / 2, y + 4, 1.4, '#7fd0ff'); }
                    else { rr(x + 6, y + 3, w - 12, h - 6, 3, '#2a2e3a'); circ(x + 4, y + h / 2, 1.4, '#7fd0ff'); }
                    break;
                }
                case 'mc_settee': {                                        // a blush chaise, tufted, gold-footed (back against the east side)
                    rr(x, y, w, h, 12, '#c96a8e', C.gold, 1);
                    rr(x + w - 12, y + 4, 10, h - 8, 5, '#a84e72'); rr(x + 4, y + 4, w - 18, 20, 8, '#a84e72');
                    tufts(x + 6, y + 28, w - 20, h - 34, 2, 5, 'rgba(255,220,235,0.55)');
                    rr(x + 8, y + h - 34, 16, 12, 4, C.lilac);                   // a cushion
                    break;
                }
                case 'mc_crescent_sofa': {                                 // Mirabel's: a crescent of wine velvet, back to the north wall
                    ctx.fillStyle = C.velvetDk; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.quadraticCurveTo(x + w, y + h, x + w / 2, y + h); ctx.quadraticCurveTo(x, y + h, x, y); ctx.fill();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.fillStyle = C.velvetLt; ctx.beginPath(); ctx.moveTo(x + 14, y + 12); ctx.lineTo(x + w - 14, y + 12); ctx.quadraticCurveTo(x + w - 16, y + h - 12, x + w / 2, y + h - 10); ctx.quadraticCurveTo(x + 16, y + h - 12, x + 14, y + 12); ctx.fill();
                    ctx.fillStyle = C.velvet; ctx.beginPath(); ctx.moveTo(x + 30, y + 12); ctx.lineTo(x + w - 30, y + 12); ctx.quadraticCurveTo(x + w - 34, y + h - 26, x + w / 2, y + h - 24); ctx.quadraticCurveTo(x + 34, y + h - 26, x + 30, y + 12); ctx.fill();
                    tufts(x + 20, y + 3, w - 40, 7, 9, 1, 'rgba(255,190,220,0.45)');
                    rr(x + 40, y + 16, 18, 12, 5, C.gold); rr(x + w - 58, y + 16, 18, 12, 5, C.lilac);                 // cushions
                    break;
                }
                case 'mc_lowtable': {                                      // black glass on gold, champagne on ice, two flutes, rose petals
                    rr(x, y, w, h, 6, 'rgba(20,14,28,0.92)', C.gold, 1.5);
                    ctx.fillStyle = 'rgba(200,168,255,0.12)'; ctx.fillRect(x + 4, y + 3, w - 8, 1.5);
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx, cy, Math.min(w, h) * 0.22, C.chrome, C.chromeDk, 1); circ(cx, cy, Math.min(w, h) * 0.16, '#e8f0ff');   // the ice bucket
                    circ(cx + 1, cy - 1, 2.8, '#1e3a24', C.gold, 0.8);                                                 // the bottle's neck
                    circ(cx - w * 0.3, cy + h * 0.18, 2.6, 'rgba(255,240,200,0.9)', C.gold, 0.6); circ(cx + w * 0.3, cy - h * 0.18, 2.6, 'rgba(255,240,200,0.9)', C.gold, 0.6);
                    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#c42a52' : '#e04a6e'; ctx.beginPath(); ctx.ellipse(x + 6 + (i * 13 % (w - 10)), y + h - 5 - (i % 2) * 3, 2.2, 1.3, i, 0, Math.PI * 2); ctx.fill(); }
                    break;
                }
                // Lost things (searchLostLuggage): closed and full, or lying open once searched today
                case 'mc_lost_clutch': {                                   // a sequined envelope clutch on a gold chain
                    const open = p._searched;
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.quadraticCurveTo(x + w / 2, y - 7, x + w - 2, y + 2); ctx.stroke();
                    rr(x, y, w, h, 2, p.noteId === 'club_gents' ? '#1e2a44' : '#5a1440', C.goldDk, 0.8);
                    ctx.fillStyle = 'rgba(255,235,250,0.55)';
                    for (let i = 0; i < 9; i++) { const sx = x + 2 + ((i * 7) % (w - 4)), sy = y + 2 + ((i * 5) % (h - 4)), tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2 + x); ctx.globalAlpha = 0.3 + 0.7 * tw; ctx.fillRect(sx, sy, 1, 1); }
                    ctx.globalAlpha = 1;
                    if (open) { ctx.fillStyle = '#12080e'; ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + w - 1, y + 1); ctx.lineTo(x + w / 2, y + h * 0.75); ctx.closePath(); ctx.fill(); }
                    else { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y + h * 0.6); ctx.lineTo(x + w, y); ctx.fill(); circ(x + w / 2, y + h * 0.6, 1.4, C.gold); }
                    break;
                }
                case 'mc_lost_coat': {                                     // a plum coat with a fur collar, draped over the bench
                    const open = p._searched;
                    ctx.fillStyle = '#3e1a4a'; ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + 4); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 1); ctx.stroke();
                    rr(x + 1, y + h - 8, 7, 10, 3, '#34143e'); rr(x + w - 8, y + h - 8, 7, 10, 3, '#34143e');       // sleeves over the edge
                    for (let i = 0; i < 9; i++) circ(x + 4 + i * (w - 8) / 8, y + 4 + Math.sin(i * 1.7) * 1.2, 2.6, i % 2 ? '#e8dcd0' : '#cfc2b6');   // the fur collar
                    circ(x + w / 2 + 3, y + 11, 1, C.gold); circ(x + w / 2 + 3, y + 17, 1, C.gold);
                    if (open) for (const px of [x + 7, x + w - 12]) rr(px, y + h - 11, 6, 5, 1.5, '#d8cce0', 'rgba(0,0,0,0.4)', 0.5);   // pockets turned out
                    break;
                }
                case 'mc_lost_purse': {                                    // rose velvet, quilted, a gold crescent clasp
                    const open = p._searched;
                    rr(x, y, w, h, 4, '#a8305a', C.goldDk, 0.8);
                    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.clip();
                    ctx.strokeStyle = 'rgba(60,0,20,0.4)'; ctx.lineWidth = 0.6; ctx.beginPath();
                    for (let k = -h; k < w; k += 5) { ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.moveTo(x + k + h, y); ctx.lineTo(x + k, y + h); }
                    ctx.stroke(); ctx.restore();
                    if (open) { rr(x - 1, y - h * 0.5, w + 2, h * 0.55, 3, '#8a2048', C.goldDk, 0.6); rr(x + 2, y + 2, w - 4, h - 4, 2, '#2a0614'); }
                    else { rr(x + 1, y, w - 2, h * 0.45, 3, '#8a2048'); ctx.save(); circ(x + w / 2, y + h * 0.45, 2.4, C.gold); ctx.globalCompositeOperation = 'destination-out'; circ(x + w / 2 + 1, y + h * 0.45 - 0.6, 1.9, '#000'); ctx.restore(); }
                    break;
                }
                case 'mc_lost_handbag': {                                  // black patent, a gold chain strap
                    const open = p._searched;
                    rr(x, y, w, h, 3, '#0e0c12', '#4a4458', 0.8);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 2, y + 2, w - 6, 1.2);           // the patent shine
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.9; ctx.setLineDash([1.5, 1]); ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.bezierCurveTo(x - 6, y + h + 6, x + w + 6, y + h + 6, x + w - 2, y + 2); ctx.stroke(); ctx.setLineDash([]);
                    if (open) rr(x + 2, y + 2, w - 4, h - 5, 2, '#2a2436');
                    else rr(x + w / 2 - 3, y + h * 0.35, 6, 3, 1, C.gold);
                    break;
                }
                case 'mc_suite_couch': {                                   // a long velvet couch, back against the east wall, facing west
                    rr(x, y, w, h, 12, C.velvetDk, C.gold, 1.2);
                    rr(x + w - 16, y + 4, 14, h - 8, 7, C.velvet);
                    rr(x + 4, y + 4, w - 22, 16, 7, C.velvet); rr(x + 4, y + h - 20, w - 22, 16, 7, C.velvet);
                    rr(x + 6, y + 22, w - 24, h - 44, 6, C.velvetLt); tufts(x + w - 15, y + 8, 12, h - 16, 1, 9, 'rgba(255,190,220,0.4)');
                    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1; k < 3; k++) { const sy = y + 22 + k * (h - 44) / 3; ctx.moveTo(x + 6, sy); ctx.lineTo(x + w - 18, sy); } ctx.stroke();
                    rr(x + 10, y + 30, 14, 18, 5, C.gold); rr(x + 10, y + h - 50, 14, 18, 5, C.lilac);
                    break;
                }
            }
        }

        /* The hub graveyard's stones (gy_stone). Eight carvings, seen face-on like the old ones but kept
           inside the collision box: 0 rounded headstone, 1 gothic arch, 2 Celtic cross, 3 obelisk,
           4 praying angel, 5 ledger slab (flat, seen from above), 6 broken and leaning, 7 twin family
           stone. Each is painted once into a sprite (granite tone, moonlit lavender rim, lettering,
           moss, cracks, and now and then flowers, a wreath or a candle), so ~200 stones cost one
           drawImage apiece. Candle flames breathe in drawGraveyardGlow. */
        const GY_PAD = 6, GY_SCALE = 2;
        function gyStoneLayout(p) {
            if (p._gy) return p._gy;
            let s = Math.abs(Math.floor(p.x * 7.13 + p.y * 13.7)) % 233280;
            const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
            const v = (p.decor && p.decor.variant) | 0, w = p.width, h = p.height;
            const acc = r(), tone = r();
            p._gy = {
                v, rnd: r, seed: s,
                acc: acc < 0.22 ? 'flowers' : acc < 0.36 ? 'candle' : acc < 0.44 && v !== 5 ? 'wreath' : null,
                tone: tone < 0.14 ? 'black' : tone < 0.3 ? 'rose' : tone < 0.5 ? 'blue' : 'grey',
                candle: { x: p.x + w * (r() < 0.5 ? 0.22 : 0.78), y: p.y + h - 5 }
            };
            return p._gy;
        }

        function drawGraveStone(ctx, p) {
            if (!p._gySprite) p._gySprite = paintGraveStone(p);
            ctx.drawImage(p._gySprite, p.x - GY_PAD, p.y - GY_PAD, p.width + GY_PAD * 2, p.height + GY_PAD * 2);
        }

        function paintGraveStone(p) {
            const L = gyStoneLayout(p), w = p.width, h = p.height, r = L.rnd;
            const cv = document.createElement('canvas');
            cv.width = Math.ceil((w + GY_PAD * 2) * GY_SCALE); cv.height = Math.ceil((h + GY_PAD * 2) * GY_SCALE);
            const c = cv.getContext('2d'); c.scale(GY_SCALE, GY_SCALE); c.translate(GY_PAD, GY_PAD);
            const TONES = {
                grey:  ['#9a96a6', '#5e5a6a', '#34303e'], blue: ['#8e98b0', '#56607a', '#2e3446'],
                rose:  ['#a8949c', '#6e5a62', '#3a2e36'], black: ['#4a4658', '#24222e', '#121018']
            };
            const [lt, mid, dk] = TONES[L.tone], letter = L.tone === 'black' ? 'rgba(232,194,122,0.85)' : 'rgba(20,16,26,0.55)';
            const base = h - 8, cx = w / 2;
            // The shadow the moon throws, down and to the right

            if (L.v !== 5 && L.v !== 4) { c.fillStyle = '#2a2632'; c.beginPath(); c.roundRect(0, base, w, 8, 1.5); c.fill(); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(1, base, w - 2, 1); }
            // The silhouette
            const body = new Path2D();
            let tilt = 0;
            switch (L.v) {
                case 0: { const R = (w - 6) / 2; body.moveTo(3, base); body.lineTo(3, R + 1); body.arc(cx, R + 1, R, Math.PI, 0); body.lineTo(w - 3, base); body.closePath(); break; }
                case 1: { const R = (w - 6) / 2; body.moveTo(3, base); body.lineTo(3, R + 4); body.quadraticCurveTo(3, 4, cx, 0); body.quadraticCurveTo(w - 3, 4, w - 3, R + 4); body.lineTo(w - 3, base); body.closePath(); break; }
                case 2: { const bw = w * 0.3, ay = h * 0.26, ah = w * 0.26; body.rect(cx - bw / 2, 0, bw, base); body.rect(3, ay - ah / 2, w - 6, ah); body.moveTo(cx + w * 0.3, ay); body.arc(cx, ay, w * 0.3, 0, Math.PI * 2); break; }
                case 3: { body.moveTo(cx - w * 0.3, base); body.lineTo(cx - w * 0.17, 9); body.lineTo(cx, 0); body.lineTo(cx + w * 0.17, 9); body.lineTo(cx + w * 0.3, base); body.closePath(); break; }
                case 4: {                                                  // the angel: a plinth, a robed figure, folded wings, bowed head
                    const py = h * 0.58;
                    body.rect(2, py, w - 4, h - py - 2);
                    body.moveTo(cx - w * 0.22, py); body.quadraticCurveTo(cx - w * 0.12, h * 0.3, cx - w * 0.07, h * 0.22); body.lineTo(cx + w * 0.07, h * 0.22); body.quadraticCurveTo(cx + w * 0.12, h * 0.3, cx + w * 0.22, py); body.closePath();
                    body.moveTo(cx - w * 0.08, h * 0.2); body.quadraticCurveTo(cx - w * 0.48, h * 0.05, cx - w * 0.36, py - 2); body.quadraticCurveTo(cx - w * 0.2, h * 0.36, cx - w * 0.08, h * 0.2);
                    body.moveTo(cx + w * 0.08, h * 0.2); body.quadraticCurveTo(cx + w * 0.48, h * 0.05, cx + w * 0.36, py - 2); body.quadraticCurveTo(cx + w * 0.2, h * 0.36, cx + w * 0.08, h * 0.2);
                    body.moveTo(cx + w * 0.1, h * 0.12); body.arc(cx, h * 0.12, w * 0.1, 0, Math.PI * 2);
                    break;
                }
                case 5: body.roundRect(1, 2, w - 2, h - 4, 3); break;       // the ledger, lying flat
                case 6: {                                                  // snapped across, leaning
                    const by = h * 0.4; tilt = 0.1;
                    body.moveTo(3, base); body.lineTo(3, by + 3);
                    for (let i = 1; i <= 6; i++) body.lineTo(3 + i * (w - 6) / 6, by + (i % 2 ? -4 : 3) + r() * 3);
                    body.lineTo(w - 3, base); body.closePath();
                    break;
                }
                case 7: { const R = (w - 6) / 4; body.moveTo(3, base); body.lineTo(3, R + 3); body.arc(3 + R, R + 3, R, Math.PI, 0); body.arc(w - 3 - R, R + 3, R, Math.PI, 0); body.lineTo(w - 3, base); body.closePath(); break; }
            }
            c.save();
            if (tilt) { c.translate(3, base); c.rotate(tilt); c.translate(-3, -base); }
            const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, lt); g.addColorStop(0.55, mid); g.addColorStop(1, dk);
            c.fillStyle = g; c.fill(body, 'nonzero');
            c.save(); c.clip(body);
            // Grain, the moonlit lavender rim down the left, moss creeping up from the foot, a crack
            for (let i = 0; i < w * h / 18; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)'; c.fillRect(r() * w, r() * h, 0.8, 0.8); }
            const rim = c.createLinearGradient(0, 0, w * 0.35, 0); rim.addColorStop(0, 'rgba(210,190,255,0.45)'); rim.addColorStop(1, 'rgba(210,190,255,0)');
            c.fillStyle = rim; c.fillRect(0, 0, w * 0.35, h);
            const moss = L.tone === 'black' ? 0.35 : 1;
            for (let i = 0; i < 14; i++) {
                const mx = r() * w, my = base - r() * r() * h * 0.5;
                c.fillStyle = `rgba(${60 + r() * 30 | 0},${96 + r() * 40 | 0},${58 + r() * 20 | 0},${(0.25 + r() * 0.35) * moss})`;
                c.beginPath(); c.arc(mx, my, 1 + r() * 2.6, 0, Math.PI * 2); c.fill();
            }
            if (r() < 0.6) {
                c.strokeStyle = 'rgba(10,8,14,0.6)'; c.lineWidth = 0.7; c.beginPath();
                let kx = w * (0.3 + r() * 0.4), ky = L.v === 5 ? 4 : h * 0.15; c.moveTo(kx, ky);
                for (let i = 0; i < 4; i++) { kx += (r() - 0.5) * 8; ky += 3 + r() * 5; c.lineTo(kx, ky); }
                c.stroke();
            }
            c.restore();
            c.strokeStyle = 'rgba(12,10,18,0.85)'; c.lineWidth = 1; c.stroke(body);
            // Carving and lettering
            const engrave = (x0, y0, len) => { c.fillStyle = letter; c.fillRect(x0, y0, len, 1.2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x0, y0 + 1.2, len, 0.6); };
            const crescent = (mx, my, R) => {
                c.save(); c.strokeStyle = letter; c.lineWidth = 1.2; c.beginPath(); c.arc(mx, my, R, Math.PI * 0.35, Math.PI * 1.65); c.stroke();
                c.beginPath(); c.arc(mx - R * 0.45, my, R * 0.7, Math.PI * 0.2, Math.PI * 1.8, false); c.stroke(); c.restore();
            };
            if (L.v === 5) {                                               // ledger: a carved cross and the long inscription
                c.strokeStyle = 'rgba(12,10,18,0.5)'; c.lineWidth = 1; c.strokeRect(4, 5, w - 8, h - 10);
                c.fillStyle = letter; c.fillRect(cx - 1, 9, 2, h * 0.4); c.fillRect(cx - w * 0.16, 9 + h * 0.1, w * 0.32, 2);
                for (let i = 0; i < 3; i++) engrave(cx - w * 0.3 + i * 1.5, h * 0.6 + i * 5, w * 0.6 - i * 3);
            } else if (L.v === 2) {
                c.strokeStyle = letter; c.lineWidth = 0.8; c.beginPath(); c.arc(cx, h * 0.26, w * 0.2, 0, Math.PI * 2); c.stroke();
                engrave(cx - w * 0.1, h * 0.5, w * 0.2); engrave(cx - w * 0.08, h * 0.58, w * 0.16);
            } else if (L.v === 3) {
                crescent(cx, h * 0.3, w * 0.07); engrave(cx - w * 0.15, h * 0.55, w * 0.3); engrave(cx - w * 0.12, h * 0.63, w * 0.24);
            } else if (L.v === 4) {
                engrave(w * 0.2, h * 0.72, w * 0.6); engrave(w * 0.28, h * 0.82, w * 0.44);
            } else if (L.v === 7) {
                for (const sx of [w * 0.28, w * 0.72]) { engrave(sx - w * 0.14, h * 0.42, w * 0.28); engrave(sx - w * 0.1, h * 0.5, w * 0.2); }
                c.fillStyle = letter; c.beginPath(); c.arc(cx - 1.4, h * 0.3, 1.6, 0, Math.PI * 2); c.arc(cx + 1.4, h * 0.3, 1.6, 0, Math.PI * 2); c.fill();   // two rings entwined
            } else {
                if (L.v === 1 || r() < 0.5) crescent(cx, h * 0.24, Math.min(5, w * 0.12));
                const top = L.v === 6 ? h * 0.52 : h * 0.4;
                engrave(cx - w * 0.3, top, w * 0.6); engrave(cx - w * 0.22, top + 6, w * 0.44); engrave(cx - w * 0.15, top + 11, w * 0.3);
            }
            c.restore();
            if (L.v === 6) {                                               // the broken-off piece lying at its foot
                c.fillStyle = mid; c.beginPath(); c.moveTo(w * 0.62, h - 4); c.lineTo(w * 0.95, h - 7); c.lineTo(w, h - 2); c.lineTo(w * 0.66, h); c.closePath(); c.fill();
                c.strokeStyle = 'rgba(12,10,18,0.8)'; c.lineWidth = 0.8; c.stroke();
            }
            // Offerings
            if (L.acc === 'flowers') {
                const fx = w * (0.25 + r() * 0.5);
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + (i - 2) * 0.35, sx = fx + Math.cos(a) * 6, sy = h - 3 + Math.sin(a) * 6;
                    c.strokeStyle = '#2f5a3e'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(fx, h - 2); c.lineTo(sx, sy); c.stroke();
                    c.fillStyle = ['#e04a6e', '#c8a8ff', '#fff2d8', '#ff8ab0', '#b8203a'][(i + (L.seed | 0)) % 5]; c.beginPath(); c.arc(sx, sy, 1.6, 0, Math.PI * 2); c.fill();
                }
            } else if (L.acc === 'wreath' && L.v !== 5) {
                const wy = L.v === 4 ? h * 0.7 : h * 0.62;
                c.strokeStyle = '#2a4a32'; c.lineWidth = 2.4; c.beginPath(); c.arc(cx, wy, Math.min(6, w * 0.16), 0, Math.PI * 2); c.stroke();
                c.fillStyle = '#b8203a'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.arc(cx + Math.cos(a) * Math.min(6, w * 0.16), wy + Math.sin(a) * Math.min(6, w * 0.16), 0.9, 0, Math.PI * 2); c.fill(); }
            } else if (L.acc === 'candle') {                               // a candle in a glass jar (its flame is in the glow pass)
                const kx = L.candle.x - p.x, ky = L.candle.y - p.y;
                c.fillStyle = 'rgba(200,190,230,0.35)'; c.beginPath(); c.roundRect(kx - 2.5, ky - 3, 5, 6, 1.5); c.fill();
                c.fillStyle = '#e6ddd0'; c.fillRect(kx - 1.5, ky - 1, 3, 3.5);
            }
            return cv;
        }

        /* The hub graveyard's walls (gy_wall) and their pillars (gy_pillar), drawn by the walls pass (engine/draw.js).
           Seen like the stones, a little from the front: a low wall of grey brick under a pale stone coping, a black
           iron fence of spear-topped pickets along its top, and every so often a brick pillar under a stone cap,
           a lantern on each (map-loading.js puts a LampEntity, lampType 6, on every cap). The bricks, coping and
           fence are pattern tiles painted once; a pillar is one sprite. The walls keep their 30 px footprint. */
        const GY_WALL = { T: 30, COPE: 14, FENCE: 27, PILLAR: 44 };
        const GY_IRON = '#0b0a0f', GY_IRON_HI = 'rgba(170, 160, 205, 0.45)';
        const _gyTiles = {};
        function _gyTile(name, w, h, paint) {
            if (_gyTiles[name]) return _gyTiles[name];
            const S = 2, cv = document.createElement('canvas'); cv.width = w * S; cv.height = h * S;
            const c = cv.getContext('2d'); c.scale(S, S); paint(c, w, h);
            const pat = c.createPattern(cv, 'repeat'); pat.setTransform(new DOMMatrix().scale(1 / S));
            return (_gyTiles[name] = pat);
        }
        // Running-bond grey brick, courses along x (a wall's face, a pillar's)
        function _gyBrickPaint(c, w, h) {
            let s = 7;
            const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
            const GREYS = ['#7e7b86', '#716e7a', '#88858f', '#666370', '#7a7884', '#6c6b78', '#8d8a92'];
            c.fillStyle = '#34313b'; c.fillRect(0, 0, w, h);                 // the mortar
            for (let row = 0, y = 0; y < h; row++, y += 5.5) {
                for (let x = row % 2 ? -6.5 : 0; x < w; x += 13) {
                    c.fillStyle = GREYS[Math.floor(r() * GREYS.length)];
                    c.fillRect(x + 0.6, y + 0.6, 12, 4.4);
                    c.fillStyle = 'rgba(255, 255, 255, 0.10)'; c.fillRect(x + 0.6, y + 0.6, 12, 0.8);   // each brick's upper lip catches the light
                    c.fillStyle = 'rgba(0, 0, 0, 0.16)'; c.fillRect(x + 0.6, y + 4.2, 12, 0.8);
                    for (let k = 0; k < 4; k++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)'; c.fillRect(x + 1 + r() * 11, y + 1 + r() * 3, 0.9, 0.9); }
                }
            }
        }
        // The same brick laid north-south, its courses along y (seen from above on a wall running that way)
        function _gyBrickPaintV(c, w, h) { c.translate(w, 0); c.rotate(Math.PI / 2); _gyBrickPaint(c, h, w); }
        // The coping: pale stone slabs with their joints, along x or (vertical) along y
        function _gyCopePaint(vertical) {
            return (c, w, h) => {
                let s = vertical ? 31 : 13;
                const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
                const len = vertical ? h : w, across = vertical ? w : h, slab = 32;
                for (let a = 0; a < len; a += slab) {
                    const tone = 132 + Math.floor(r() * 20), col = `rgb(${tone - 6}, ${tone - 8}, ${tone + 4})`;
                    c.fillStyle = col;
                    if (vertical) c.fillRect(0, a, across, slab); else c.fillRect(a, 0, slab, across);
                    for (let k = 0; k < 40; k++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'; const u = a + r() * slab, v = r() * across; if (vertical) c.fillRect(v, u, 1, 1); else c.fillRect(u, v, 1, 1); }
                    c.fillStyle = 'rgba(30, 26, 36, 0.75)';                    // the joint
                    if (vertical) c.fillRect(0, a, across, 1); else c.fillRect(a, 0, 1, across);
                }
            };
        }
        // One spear-topped picket between the two rails, 10 px a picket (the tile's foot is the coping's middle)
        function _gyFencePaint(c, w, h) {
            const x = w / 2;
            c.fillStyle = GY_IRON;
            c.fillRect(0, 6.2, w, 1.6); c.fillRect(0, h - 5, w, 1.6);         // the top and bottom rails
            c.fillRect(x - 0.8, 3, 1.6, h - 3);                               // the picket
            c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 1.9, 3.4); c.lineTo(x, 4.6); c.lineTo(x - 1.9, 3.4); c.closePath(); c.fill();   // its spear
            c.beginPath(); c.arc(x, 9.5, 1.3, 0, Math.PI * 2); c.fill();      // a collar under the top rail
            c.fillStyle = GY_IRON_HI;                                         // moonlight down the left of the iron
            c.fillRect(x - 0.8, 4.6, 0.5, h - 6); c.fillRect(0, 6.2, w, 0.4);
            c.beginPath(); c.moveTo(x, 0.2); c.lineTo(x - 1.6, 3.3); c.lineTo(x - 0.9, 3.5); c.closePath(); c.fill();
        }
        // The fence seen end-on (a wall running north-south): spears along the rail, 10 px apart
        function _gyFenceEndPaint(c, w, h) {
            const x = w / 2;
            c.fillStyle = GY_IRON;
            c.beginPath(); c.moveTo(x, 2); c.lineTo(x + 2.2, 5); c.lineTo(x, 8); c.lineTo(x - 2.2, 5); c.closePath(); c.fill();
            c.fillStyle = GY_IRON_HI; c.beginPath(); c.moveTo(x, 2.3); c.lineTo(x - 1.8, 5); c.lineTo(x - 1, 5.2); c.closePath(); c.fill();
        }

        function drawGraveyardWall(ctx, w) {
            const { T, COPE, FENCE } = GY_WALL, vertical = w.h > w.w;
            const brick = _gyTile('brick', 78, 22, _gyBrickPaint);
            ctx.save(); ctx.translate(w.x, w.y);
            if (!vertical) {
                const L = w.w, face = T - COPE;
                ctx.fillStyle = 'rgba(6, 4, 10, 0.4)'; ctx.fillRect(2, T, L, 6);                 // its shadow on the ground
                ctx.fillStyle = brick; ctx.fillRect(0, COPE, L, face);                           // the brick face
                const g = ctx.createLinearGradient(0, COPE, 0, T);                               // darker at its foot
                g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,16,0.35)');
                ctx.fillStyle = g; ctx.fillRect(0, COPE, L, face);
                ctx.fillStyle = _gyTile('copeH', 96, COPE, _gyCopePaint(false)); ctx.fillRect(0, 0, L, COPE);   // the coping
                ctx.fillStyle = 'rgba(225, 218, 240, 0.35)'; ctx.fillRect(0, COPE - 2, L, 1.2);  // its front lip
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; ctx.fillRect(0, 0, L, 1); ctx.fillRect(0, COPE, L, 1.2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, COPE / 2 + 1, L, 2);       // the fence's shadow on the coping
                ctx.translate(0, COPE / 2 - FENCE);
                ctx.fillStyle = _gyTile('fence', 10, FENCE, _gyFencePaint); ctx.fillRect(0, 0, L, FENCE);
            } else {
                const L = w.h;
                ctx.fillStyle = 'rgba(6, 4, 10, 0.4)'; ctx.fillRect(T, 4, 5, L);                  // its shadow, to the east
                // Its top: brick between two narrow kerbs of coping
                const kerb = 5;
                ctx.fillStyle = _gyTile('brickV', 22, 78, _gyBrickPaintV); ctx.fillRect(kerb, 0, T - kerb * 2, L);
                ctx.fillStyle = _gyTile('copeV', T, 96, _gyCopePaint(true)); ctx.fillRect(0, 0, kerb, L); ctx.fillRect(T - kerb, 0, kerb, L);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(kerb, 0, 1, L); ctx.fillRect(T - kerb - 1, 0, 1, L);
                ctx.fillStyle = 'rgba(225, 218, 240, 0.3)'; ctx.fillRect(1, 0, 1.2, L);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; ctx.fillRect(T - 1.2, 0, 1.2, L);
                // The fence end-on: its rails a black bar down the middle (rising the fence's height at the north end), spears along it
                const cx = T / 2;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(cx + 2, 0, 3, L);             // its shadow on the coping
                ctx.fillStyle = GY_IRON; ctx.fillRect(cx - 1.5, COPE / 2 - FENCE + 6, 3, L - COPE / 2 + FENCE - 6);
                ctx.fillStyle = GY_IRON_HI; ctx.fillRect(cx - 1.5, COPE / 2 - FENCE + 6, 0.6, L - COPE / 2 + FENCE - 6);
                ctx.translate(cx - 5, 0);
                ctx.fillStyle = _gyTile('fenceEnd', 10, 10, _gyFenceEndPaint); ctx.fillRect(0, 0, 10, L);
            }
            ctx.restore();
        }

        // A brick pillar under a stone cap (its lantern is a LampEntity on the cap)
        let _gyPillarSprite = null;
        const GY_PILLAR_PAD = 10;
        function drawGraveyardPillar(ctx, p) {
            const P = GY_WALL.PILLAR, pad = GY_PILLAR_PAD;
            if (!_gyPillarSprite) {
                const S = 3, cv = document.createElement('canvas'); cv.width = cv.height = (P + pad * 2) * S;
                const c = cv.getContext('2d'); c.scale(S, S); c.translate(pad, pad);
                const capH = 20;
                c.fillStyle = 'rgba(6, 4, 10, 0.45)'; c.beginPath(); c.roundRect(5, 6, P + 2, P + 1, 3); c.fill();   // its shadow
                c.fillStyle = _gyTile('brick', 78, 22, _gyBrickPaint); c.fillRect(0, capH - 2, P, P - capH + 2);      // the brick face
                const g = c.createLinearGradient(0, 0, P, 0);                    // rounder: lit on the left, dark on the right
                g.addColorStop(0, 'rgba(210,200,240,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
                c.fillStyle = g; c.fillRect(0, capH - 2, P, P - capH + 2);
                const f = c.createLinearGradient(0, capH, 0, P);
                f.addColorStop(0, 'rgba(0,0,0,0.35)'); f.addColorStop(0.25, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(10,6,16,0.35)');
                c.fillStyle = f; c.fillRect(0, capH - 2, P, P - capH + 2);
                c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.strokeRect(0.5, capH - 1.5, P - 1, P - capH + 1);
                // The cap: a stone slab overhanging the brick, its front edge, a raised plinth for the lantern
                c.fillStyle = '#5c5966'; c.fillRect(-3, capH - 6, P + 6, 5);
                const cg = c.createLinearGradient(0, -3, 0, capH - 6);
                cg.addColorStop(0, '#a8a4b2'); cg.addColorStop(1, '#827e8c');
                c.fillStyle = cg; c.fillRect(-3, -3, P + 6, capH - 3);
                c.fillStyle = 'rgba(240, 234, 255, 0.45)'; c.fillRect(-3, capH - 7, P + 6, 1);
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-3, -3, P + 6, 0.8);
                c.fillStyle = '#7e7a88'; c.fillRect(8, 0, P - 16, capH - 8);
                c.fillStyle = '#9894a2'; c.fillRect(10, 1, P - 20, capH - 11);
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(8, capH - 9, P - 16, 1);
                _gyPillarSprite = cv;
            }
            ctx.drawImage(_gyPillarSprite, p.x - pad, p.y - pad, P + pad * 2, P + pad * 2);
        }

        /* The Double Nights penthouse (ps_*): the Dark Maker's stay, in the hotel's black marble, gold,
           silver and crimson. Things are left as he left them: the bed unmade, one glass drunk, the
           chess game unfinished, the wardrobe open, a card propped on the desk rating his stay. */
        function drawSuiteDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000, C = DNL, d = p.decor || {};
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            const glass = (gx, gy, drunk) => { circ(gx, gy, 3, drunk ? 'rgba(255,240,220,0.35)' : 'rgba(150,20,40,0.85)', C.silver, 0.7); if (!drunk) circ(gx - 0.8, gy - 0.8, 0.8, 'rgba(255,200,210,0.6)'); };
            const candle = (cx, cy) => { circ(cx, cy, 2.2, C.cream, C.goldDk, 0.5); };
            switch (p.decorType) {
                case 'ps_console': {                                       // by the elevator: the visitor book, a crescent seal
                    rr(x, y, w, h, 3, C.ink, C.gold, 1.2);
                    rr(x + 5, y + 10, w - 10, 22, 1, C.cream, C.goldDk, 0.6); ctx.fillStyle = C.crimson; ctx.fillRect(x + w / 2 - 0.5, y + 10, 1, 22);
                    ctx.strokeStyle = 'rgba(40,20,30,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + 7, y + 14 + i * 4); ctx.lineTo(x + w / 2 - 2, y + 14 + i * 4); } ctx.stroke();
                    circ(x + w / 2, y + h - 18, 5, C.crimsonLt, '#5a0a18', 0.8); ctx.save(); circ(x + w / 2, y + h - 18, 2.6, '#ffd0d8'); ctx.globalCompositeOperation = 'destination-out'; circ(x + w / 2 + 1.2, y + h - 18.6, 2.3, '#000'); ctx.restore();
                    break;
                }
                case 'ps_pit_sofa': {                                      // one half of the round crimson pit, curving about the table
                    const up = d.face === 'N', cx = x + w / 2;

                    const band = (off, col) => { ctx.fillStyle = col; ctx.beginPath();
                        if (up) { ctx.moveTo(x + off, y); ctx.quadraticCurveTo(cx, y + h * 1.9 - off * 1.6, x + w - off, y); ctx.lineTo(x + w - 18, y); ctx.quadraticCurveTo(cx, y + h * 1.1, x + 18, y); }
                        else { ctx.moveTo(x + off, y + h); ctx.quadraticCurveTo(cx, y - h * 0.9 + off * 1.6, x + w - off, y + h); ctx.lineTo(x + w - 18, y + h); ctx.quadraticCurveTo(cx, y - h * 0.1, x + 18, y + h); }
                        ctx.fill(); };
                    band(0, '#4a0814'); band(6, C.velvet); band(12, C.crimsonLt);
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.beginPath();
                    if (up) { ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, y + h * 1.9, x + w, y); } else { ctx.moveTo(x, y + h); ctx.quadraticCurveTo(cx, y - h * 0.9, x + w, y + h); }
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255,200,210,0.35)';
                    for (let i = 1; i < 6; i++) { const u = i / 6, bx = x + w * u, by = up ? y + (h * 1.9) * 2 * u * (1 - u) * 0.9 - 4 : y + h - (h * 1.9) * 2 * u * (1 - u) * 0.9 + 4; ctx.beginPath(); ctx.arc(bx, by, 1.2, 0, Math.PI * 2); ctx.fill(); }
                    break;
                }
                case 'ps_pit_table': {                                     // black marble oval, a bottle, two glasses (one drunk)

                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fillStyle = C.marble; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.strokeStyle = 'rgba(223,230,255,0.2)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 12, y + 14); ctx.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w - 10, y + 16); ctx.stroke();
                    circ(x + w / 2, y + h / 2, 4, '#1e3a24', C.gold, 0.8); glass(x + w / 2 - 14, y + h / 2 + 6, true); glass(x + w / 2 + 15, y + h / 2 - 4, false);
                    rr(x + w - 22, y + h - 16, 12, 8, 1, C.cream);                                                   // a folded note
                    break;
                }
                case 'ps_piano': {                                         // a silver-lacquered grand, lid up, a page of music left open
                    const P = new Path2D(); P.moveTo(x, y + 8); P.lineTo(x + w * 0.55, y + 8); P.bezierCurveTo(x + w * 0.9, y + 6, x + w, y + h * 0.45, x + w * 0.8, y + h * 0.75);
                    P.bezierCurveTo(x + w * 0.6, y + h, x + w * 0.2, y + h, x + 6, y + h - 6); P.closePath();

                    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#e8ecf6'); g.addColorStop(0.5, '#a8aec0'); g.addColorStop(1, '#6a7082');
                    ctx.fillStyle = g; ctx.fill(P); ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.stroke(P);
                    ctx.strokeStyle = 'rgba(20,20,30,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 10, y + 16); ctx.lineTo(x + w * 0.72, y + h * 0.7); ctx.stroke();   // the lid's prop
                    rr(x, y, w * 0.5, 10, 1, '#0e0c10'); for (let i = 0; i < 14; i++) ctx.fillStyle = '#f4f2ee', ctx.fillRect(x + 2 + i * (w * 0.5 - 4) / 14, y + 1, (w * 0.5 - 4) / 14 - 0.8, 8);
                    ctx.fillStyle = '#0e0c10'; for (let i = 0; i < 14; i++) if ([1, 2, 4, 5, 6].includes(i % 7)) ctx.fillRect(x + 2 + i * (w * 0.5 - 4) / 14 - 1.2, y + 1, 2.4, 5);
                    rr(x + 14, y + 14, 22, 14, 1, C.cream, C.goldDk, 0.5);                                          // the music
                    ctx.strokeStyle = 'rgba(40,30,40,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + 16, y + 17 + i * 2.6); ctx.lineTo(x + 34, y + 17 + i * 2.6); } ctx.stroke();
                    rr(x + w * 0.18, y - 12, 34, 10, 4, C.velvet, C.gold, 0.8);                                      // the bench
                    break;
                }
                case 'ps_fireplace': {                                     // black marble surround, gold fender, embers and burnt pages
                    rr(x, y, w, h, 3, C.marbleLt, C.gold, 1.5);
                    rr(x + 16, y + 6, w - 32, h - 12, 3, '#0a0608');
                    for (let i = 0; i < 7; i++) { const f = 0.6 + 0.4 * Math.sin(t * 6 + i * 1.9); circ(x + 26 + i * (w - 52) / 6, y + h / 2 + Math.sin(i) * 3, 3 + f * 1.5, `rgba(255,${90 + 60 * f | 0},40,${0.55 + 0.35 * f})`); }
                    for (const [px, py, r] of [[x + 38, y + 12, 0.3], [x + w - 52, y + 15, -0.4]]) { ctx.save(); ctx.translate(px, py); ctx.rotate(r); rr(0, 0, 12, 8, 1, '#3a2a20'); ctx.fillStyle = 'rgba(255,120,40,0.6)'; ctx.fillRect(0, 7, 12, 1); ctx.restore(); }
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 12, y + h - 3); ctx.lineTo(x + w - 12, y + h - 3); ctx.stroke();
                    break;
                }
                case 'ps_bar': {                                           // black lacquer bar against the west wall, a wine wall behind
                    rr(x, y, w, h, 3, '#140e14', C.gold, 1.2);
                    for (let j = 0; j < 12; j++) for (let i = 0; i < 2; i++) circ(x + 8 + i * 9, y + 10 + j * 15, 3, j % 3 ? '#4a0c1c' : '#1e3a24', 'rgba(0,0,0,0.5)', 0.5);
                    rr(x + w - 14, y + 4, 12, h - 8, 2, C.marble, C.goldDk, 0.6);
                    glass(x + w - 8, y + 40, false); glass(x + w - 8, y + h - 50, true); circ(x + w - 8, y + h / 2, 3.6, '#e8f0ff', C.silver, 0.8);   // a decanter
                    break;
                }
                case 'ps_dining': {                                        // a marble table for two: candles, the plates, one glass drunk and one not
                    rr(x, y, w, h, 8, '#ece8ee', C.gold, 2);
                    ctx.strokeStyle = 'rgba(120,110,130,0.3)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 12, y + 10); ctx.quadraticCurveTo(x + w / 2, y + h * 0.8, x + w - 10, y + 12); ctx.stroke();
                    rr(x + w / 2 - 6, y + 6, 12, h - 12, 3, C.crimson);                                             // a runner
                    for (const px of [x + 18, x + w - 18]) { circ(px, y + h / 2, 10, '#fafafa', C.silverDk, 0.8); circ(px, y + h / 2, 6.5, null, C.gold, 0.6); }
                    circ(x + 22, y + h / 2 + 2, 3.5, 'rgba(120,20,30,0.5)');                                        // his plate: a smear of sauce
                    glass(x + 30, y + 14, true); glass(x + w - 30, y + h - 14, false);
                    candle(x + w / 2, y + 18); candle(x + w / 2, y + h - 18);
                    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#b8203a'; ctx.beginPath(); ctx.ellipse(x + w / 2 - 2 + i * 1.5, y + h / 2 - 6 + i * 4, 2, 1.2, i, 0, Math.PI * 2); ctx.fill(); }   // petals
                    break;
                }
                case 'ps_chair': {                                         // a velvet dining chair, gold frame; faces its table
                    const f = d.face || 'S';
                    rr(x, y, w, h, 5, C.velvet, C.gold, 1);
                    const bk = f === 'E' ? [x, y + 2, 7, h - 4] : f === 'W' ? [x + w - 7, y + 2, 7, h - 4] : f === 'N' ? [x + 2, y + h - 7, w - 4, 7] : [x + 2, y, w - 4, 7];
                    rr(...bk, 3, '#4a0814'); rr(x + 5, y + 5, w - 10, h - 10, 4, C.crimsonLt);
                    break;
                }
                case 'ps_bed': {                                           // canopy king: black posts, crimson drapes, the covers thrown back
                    rr(x, y, w, h, 6, '#140e14', C.gold, 1.5);
                    rr(x + 4, y + 2, w - 8, 18, 5, '#2a0a14', C.goldDk, 0.8);                                         // headboard
                    rr(x + 10, y + 22, w - 20, h - 30, 6, '#f1ece6');                                                // sheets
                    rr(x + 18, y + 26, 60, 26, 10, '#fbf8f4', 'rgba(0,0,0,0.12)', 0.6); rr(x + w - 78, y + 26, 60, 26, 10, '#fbf8f4', 'rgba(0,0,0,0.12)', 0.6);
                    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.beginPath(); ctx.ellipse(x + w - 60, y + 46, 22, 9, 0.3, 0, Math.PI * 2); ctx.fill();   // one pillow slept on
                    ctx.fillStyle = C.velvet; ctx.beginPath(); ctx.moveTo(x + 10, y + 96); ctx.bezierCurveTo(x + w * 0.4, y + 80, x + w * 0.6, y + 118, x + w - 10, y + 104);   // the thrown-back cover
                    ctx.lineTo(x + w - 10, y + h - 8); ctx.lineTo(x + 10, y + h - 8); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = C.crimsonLt; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 10, y + 96); ctx.bezierCurveTo(x + w * 0.4, y + 80, x + w * 0.6, y + 118, x + w - 10, y + 104); ctx.stroke();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; ctx.strokeRect(x + 16, y + 112, w - 32, h - 126);
                    for (const [px, py] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) circ(px, py, 5, '#0e0a0e', C.gold, 1.2);   // posts
                    ctx.fillStyle = 'rgba(138,16,36,0.45)'; for (const [px, dir] of [[x + 3, 1], [x + w - 3, -1]]) { ctx.beginPath(); ctx.moveTo(px, y + 8); ctx.quadraticCurveTo(px + dir * 16, y + h / 2, px, y + h - 8); ctx.lineTo(px + dir * 4, y + h - 8); ctx.quadraticCurveTo(px + dir * 8, y + h / 2, px + dir * 4, y + 8); ctx.fill(); }   // drapes
                    break;
                }
                case 'ps_chaise': {                                        // a velvet chaise under the window
                    rr(x, y, w, h, 12, '#3a0a1c', C.gold, 1);
                    rr(x + 4, y + 4, 22, h - 8, 9, C.velvet); rr(x + 28, y + 6, w - 34, h - 12, 7, C.crimsonLt);
                    rr(x + 40, y + 12, 18, 14, 5, C.gold);                                                          // a cushion
                    break;
                }
                case 'ps_desk': {                                          // his writing desk: chess mid-game, a crescent seal, candle stubs, the 10/10 card
                    rr(x, y, w, h, 4, '#2a1a1e', C.gold, 1.4);
                    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let gy = y + 8; gy < y + h; gy += 6) { ctx.moveTo(x + 3, gy); ctx.lineTo(x + w - 3, gy); } ctx.stroke();
                    const bx = x + 10, by = y + 10, sq = 5;                                                          // the chessboard
                    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.fillStyle = (i + j) % 2 ? '#1a1418' : '#e8e0d0'; ctx.fillRect(bx + i * sq, by + j * sq, sq, sq); }
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; ctx.strokeRect(bx, by, sq * 8, sq * 8);
                    for (const [i, j, white] of [[1, 6, 1], [2, 6, 1], [4, 4, 1], [5, 7, 1], [3, 1, 0], [4, 2, 0], [6, 1, 0], [2, 3, 0], [6, 5, 1]]) circ(bx + i * sq + sq / 2, by + j * sq + sq / 2, 1.6, white ? '#fff8ec' : '#2a0a14', white ? '#8a7a6a' : C.crimsonLt, 0.5);
                    circ(bx + sq * 8 + 6, by + 6, 1.8, '#fff8ec', '#8a7a6a', 0.5);                                  // a captured piece
                    rr(x + 64, y + 12, 34, 24, 1, C.cream, C.goldDk, 0.6);                                          // the card: 10/10
                    ctx.fillStyle = C.crimson; ctx.font = 'bold 8px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('10/10', x + 81, y + 22);
                    ctx.fillStyle = C.goldDk; ctx.font = 'italic 4px Georgia, serif'; ctx.fillText('would recommend', x + 81, y + 30);
                    circ(x + 110, y + 40, 4.5, C.crimsonLt, '#5a0a18', 0.8); ctx.save(); circ(x + 110, y + 40, 2.4, '#ffd0d8'); ctx.globalCompositeOperation = 'destination-out'; circ(x + 111.2, y + 39.4, 2.1, '#000'); ctx.restore();   // wax seal
                    candle(x + 128, y + 14); candle(x + 138, y + 20); candle(x + 132, y + 48);
                    rr(x + 104, y + 8, 3, 18, 1, '#1a1a1e'); circ(x + 105.5, y + 8, 1.2, C.gold);                   // a pen
                    break;
                }
                case 'ps_wardrobe': {                                      // standing open, empty hangers on the rail
                    rr(x, y, w, h, 3, '#140e14', C.gold, 1.2);
                    rr(x + 4, y + 4, w - 8, h - 8, 2, '#0a070a');
                    ctx.strokeStyle = C.silverDk; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 6); ctx.stroke();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; for (let i = 0; i < 7; i++) { const hy = y + 14 + i * 19; ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, hy + 3); ctx.lineTo(x + w / 2, hy); ctx.lineTo(x + w / 2 + 9, hy + 3); ctx.stroke(); }
                    rr(x + w - 2, y + 6, 14, h * 0.45, 2, '#1a1216', C.goldDk, 0.8); rr(x + w - 2, y + h * 0.52, 14, h * 0.45, 2, '#1a1216', C.goldDk, 0.8);   // the doors swung out
                    break;
                }
                case 'ps_suitcase': {                                      // his monogrammed case, left open; rifled once searched today
                    const rifled = p._searched;
                    rr(x, y, w, h, 3, '#3a2418', C.gold, 1);
                    rr(x - 1, y - h * 0.62, w + 2, h * 0.6, 3, '#4a2e1e', C.gold, 1);                                // the open lid
                    ctx.fillStyle = C.gold; ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D·M', x + w / 2, y - h * 0.32);
                    rr(x + 3, y + 3, w - 6, h - 6, 2, '#6a1020');                                                     // crimson lining
                    if (!rifled) { rr(x + 6, y + 6, 18, 12, 2, '#f4efe8'); rr(x + 26, y + 8, 18, 10, 2, '#1a1a22'); ctx.fillStyle = C.crimsonLt; ctx.beginPath(); ctx.moveTo(x + 10, y + h - 6); ctx.lineTo(x + 40, y + h - 10); ctx.lineTo(x + 40, y + h - 7); ctx.closePath(); ctx.fill(); circ(x + 16, y + h - 12, 1.3, C.gold); circ(x + 20, y + h - 12, 1.3, C.gold); }
                    else { rr(x + 8, y + h + 2, 20, 8, 2, '#f4efe8', 'rgba(0,0,0,0.3)', 0.5); ctx.fillStyle = C.crimsonLt; ctx.fillRect(x + w - 6, y + h - 2, 14, 2.5); }   // shirts tipped out
                    break;
                }
                case 'ps_tub': {                                           // a round marble tub, rose petals floating
                    circ(x + w / 2, y + h / 2, w / 2, '#f4f2f6', C.gold, 1.5);
                    circ(x + w / 2, y + h / 2, w / 2 - 7, '#b8d0e8');
                    for (let i = 0; i < 8; i++) { const a = i * 0.8 + t * 0.05, r = 10 + (i * 7) % 22; ctx.fillStyle = i % 2 ? '#c42a52' : '#e04a6e'; ctx.beginPath(); ctx.ellipse(x + w / 2 + Math.cos(a) * r, y + h / 2 + Math.sin(a) * r, 2.6, 1.6, a, 0, Math.PI * 2); ctx.fill(); }
                    rr(x + w / 2 - 4, y - 1, 8, 6, 2, C.gold);                                                        // the spout
                    break;
                }
                case 'ps_vanity': {                                        // a marble vanity along the east wall, a basin, a perfume
                    rr(x, y, w, h, 2, '#f0ecf2', C.goldDk, 1);
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, 7, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#d8dce8'; ctx.fill(); ctx.strokeStyle = C.silverDk; ctx.lineWidth = 0.6; ctx.stroke();
                    circ(x + w / 2, y + 10, 2.6, '#e8b4c8', C.gold, 0.5); circ(x + w / 2, y + h - 10, 2.2, C.gold);
                    break;
                }
                case 'ps_pool': {                                          // the plunge pool: tiled edge, water with a slow ripple
                    rr(x, y, w, h, 10, '#d8d0c4', C.gold, 1.2);
                    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#1e5a7a'); g.addColorStop(1, '#0e2a44');
                    rr(x + 6, y + 6, w - 12, h - 12, 7, g);
                    ctx.strokeStyle = 'rgba(160,230,255,0.35)'; ctx.lineWidth = 0.8;
                    for (let k = 0; k < 5; k++) { ctx.beginPath(); for (let i = 0; i <= 20; i++) { const px = x + 10 + i * (w - 20) / 20, py = y + 14 + k * (h - 28) / 4 + Math.sin(i * 0.9 + t * 1.6 + k) * 2; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.stroke(); }
                    ctx.strokeStyle = C.silver; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + w - 18, y + 3); ctx.lineTo(x + w - 18, y + 14); ctx.moveTo(x + w - 12, y + 3); ctx.lineTo(x + w - 12, y + 14); ctx.stroke();   // the ladder
                    break;
                }
                case 'ps_lounger': {                                       // a white lounger, a folded towel
                    rr(x, y, w, h, 6, '#e8e4dc', C.goldDk, 1);
                    rr(x + 3, y + 3, w - 6, 24, 5, '#f8f6f2'); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let ly = y + 32; ly < y + h - 4; ly += 6) { ctx.moveTo(x + 4, ly); ctx.lineTo(x + w - 4, ly); } ctx.stroke();
                    rr(x + 6, y + h - 22, w - 12, 14, 2, C.crimsonLt);
                    break;
                }
                case 'ps_telescope': {                                     // brass on a tripod, trained on the sky
                    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 1.5; ctx.beginPath(); for (const a of [0.4, 2.5, 4.6]) { ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(x + w / 2 + Math.cos(a) * 13, y + h / 2 + Math.sin(a) * 13); } ctx.stroke();
                    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-2.2); rr(-3, -3, 24, 6, 3, C.gold, C.goldDk, 0.8); rr(18, -4, 6, 8, 2, C.goldDk); ctx.restore();
                    break;
                }
            }
        }

        /* The Sanctum (sc_*): weathered stone, black iron, crimson cloth, candle wax. Rain-dark and
           mossed; the colonnade's pillars are the cover the Triumvirate's sight-gated fire respects. */
        function drawSanctumDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const moss = (mx, my, n, R) => { for (let i = 0; i < n; i++) { const a = i * 2.4 + mx, r = R * (0.3 + ((i * 37) % 10) / 14); ctx.fillStyle = `rgba(${60 + (i * 13) % 30},${90 + (i * 17) % 30},${60},0.5)`; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * r, my + Math.sin(a) * r, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2); ctx.fill(); } };
            const flame = (fx, fy, k = 0) => { const f = 0.75 + 0.25 * Math.sin(t * 11 + fx * 0.3 + k); circ(fx, fy, 1.8, '#e6ddd0'); circ(fx, fy - 0.5, 1.4 * f, `rgba(255,${190 + 40 * f | 0},110,0.95)`); };
            switch (p.decorType) {
                case 'sc_pillar': {                                        // a round stone column seen from above: capital, fluting, moss
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;

                    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 2, cx, cy, R); g.addColorStop(0, '#8a8290'); g.addColorStop(0.7, '#4a4452'); g.addColorStop(1, '#2a2630');
                    circ(cx, cy, R, g, '#1a161e', 1.2);
                    ctx.strokeStyle = 'rgba(20,16,24,0.45)'; ctx.lineWidth = 0.8;
                    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke(); }
                    circ(cx, cy, R * 0.5, '#6a6272', 'rgba(200,180,255,0.18)', 1);
                    moss(cx + R * 0.3, cy + R * 0.4, 7, R * 0.5);
                    break;
                }
                case 'sc_fallen': {                                        // a toppled column in pieces across the aisle

                    const seg = (sx, sw, tilt) => { ctx.save(); ctx.translate(sx + sw / 2, y + h / 2); ctx.rotate(tilt); const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#7a7282'); g.addColorStop(0.5, '#5a5262'); g.addColorStop(1, '#2e2a34'); rr(-sw / 2, -h / 2, sw, h, 6, g, '#1a161e', 1); ctx.strokeStyle = 'rgba(20,16,24,0.4)'; ctx.lineWidth = 0.7; for (let k = -sw / 2 + 6; k < sw / 2; k += 7) { ctx.beginPath(); ctx.moveTo(k, -h / 2 + 3); ctx.lineTo(k, h / 2 - 3); ctx.stroke(); } ctx.restore(); };
                    seg(x, w * 0.45, -0.06); seg(x + w * 0.5, w * 0.5, 0.08);
                    for (let i = 0; i < 6; i++) circ(x + w * 0.47 + (i % 3) * 3 - 3, y + h + 3 + (i / 3 | 0) * 3, 2, '#4a4452');   // rubble
                    moss(x + w * 0.2, y + h * 0.4, 6, 8);
                    break;
                }
                case 'sc_pew': case 'sc_pew_broken': {                     // a dark wooden pew; the broken ones snapped and splintered
                    const broken = p.decorType === 'sc_pew_broken';

                    const wood = (X, W) => { rr(X, y, W, h, 2, '#2e1e1a', '#140c0a', 1); rr(X + 2, y + 2, W - 4, 7, 1.5, '#3e2822'); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = y + 12; k < y + h - 2; k += 4) { ctx.moveTo(X + 2, k); ctx.lineTo(X + W - 2, k); } ctx.stroke(); };
                    if (!broken) wood(x, w);
                    else { wood(x, w * 0.45); ctx.save(); ctx.translate(x + w * 0.72, y + h / 2); ctx.rotate(0.35); wood(-w * 0.25, w * 0.45); ctx.restore(); ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w * 0.45, y + 2); ctx.lineTo(x + w * 0.5, y + 6); ctx.lineTo(x + w * 0.45, y + 10); ctx.stroke(); }
                    break;
                }
                case 'sc_altar': {                                         // black stone, a crimson cloth, a gold chalice, candles guttering

                    rr(x, y, w, h, 3, '#1c1822', '#8a6a3a', 1.5);
                    rr(x + w * 0.2, y - 2, w * 0.6, h + 4, 2, '#6a0c1c'); ctx.fillStyle = '#e8c27a'; ctx.fillRect(x + w * 0.2, y + h - 3, w * 0.6, 1.5); ctx.fillRect(x + w * 0.2, y - 2, w * 0.6, 1.5);
                    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.globalAlpha = 0.7; ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 1;   // the three rings, stitched
                    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 6, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.restore();
                    circ(x + 20, y + h / 2, 5, '#e8c27a', '#8a6a3a', 1); circ(x + 20, y + h / 2, 2.4, '#5a0a18');   // chalice
                    for (const [cx, cy, k] of [[x + w - 16, y + 12, 0], [x + w - 24, y + 20, 1], [x + w - 12, y + h - 12, 2], [x + 10, y + 10, 3], [x + 12, y + h - 10, 4]]) flame(cx, cy, k);
                    break;
                }
                case 'sc_organ': {                                         // a ruined pipe organ: a rank of pipes, some fallen

                    rr(x, y + h * 0.55, w, h * 0.45, 2, '#241c1a', '#8a6a3a', 1);
                    for (let i = 0; i < 11; i++) { const px = x + 5 + i * (w - 10) / 10, r = 3.2 - Math.abs(i - 5) * 0.18, bentOff = (i === 3 || i === 8) ? 1 : 0; const g = ctx.createRadialGradient(px - 1, y + 10 - 1, 0.5, px, y + 10, r); g.addColorStop(0, '#d8d0c0'); g.addColorStop(1, '#6a5a3a'); if (!bentOff) circ(px, y + 10 + Math.abs(i - 5) * 1.2, r, g, '#3a2e1e', 0.6); }
                    ctx.save(); ctx.translate(x + w * 0.35, y + h * 0.3); ctx.rotate(1.1); rr(-2, 0, 4, 22, 2, '#8a7a5a', '#3a2e1e', 0.6); ctx.restore();   // a fallen pipe
                    break;
                }
                case 'sc_candles': {                                       // an iron stand of pillar candles, wax spilled
                    circ(x + w / 2, y + h / 2, w / 2 + 1, '#1a161a', '#4a4452', 1);
                    ctx.fillStyle = 'rgba(230,221,208,0.5)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, y + h / 2 + 5, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill();
                    for (const [dx, dy, k] of [[-4, -3, 0], [4, -2, 1], [0, 4, 2]]) flame(x + w / 2 + dx, y + h / 2 + dy, k);
                    break;
                }
                case 'sc_brazier': {                                       // an iron bowl of coals on three legs, burning
                    const cx = x + w / 2, cy = y + h / 2;
                    ctx.strokeStyle = '#2a2630'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.5; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (w / 2 + 3), cy + Math.sin(a) * (w / 2 + 3)); } ctx.stroke();
                    circ(cx, cy, w / 2 - 2, '#1a161a', '#6a5a4a', 1.5);
                    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i % 3) * 3.5 + 2, f = 0.6 + 0.4 * Math.sin(t * 7 + i * 1.9); circ(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6 + f, `rgba(255,${80 + 90 * f | 0},30,${0.6 + 0.35 * f})`); }
                    break;
                }
            }
        }

        /* =====================================================================
           COZY CAFE (cc_*) — walnut, honey, brass and velvet. Flames, steam and
           pendant glows are the glow pass's (engine/interiors.js drawCafeGlow).
           Seated pieces take `face` (where the sitter looks); they're drawn
           facing south and turned.
           ===================================================================== */
        const CC = {
            walnut: '#4a2c1a', walnutDk: '#2e1b10', walnutLt: '#6e4529', honey: '#c98c4a', honeyLt: '#e2ae6c',
            cream: '#f3e4c6', linen: '#e8dcc4', brass: '#c9a24a', copper: '#b8683a', steel: '#8d9098', steelDk: '#4a4d55',
            brick: '#8a3b28', brickDk: '#5a2418', rust: '#8e4632', rustDk: '#5e2a1e', sage: '#6d8a64', sageDk: '#4a6244',
            mustard: '#c0903a', leaf: '#4f7a3a', leafLt: '#79a656', pot: '#b5643e', chalk: '#1f2a24'
        };
        const CC_FACE = { S: 0, W: Math.PI / 2, N: Math.PI, E: -Math.PI / 2 };
        function drawCafeDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000, d = p.decor || {}, C = CC;
            const hsh = (k) => { const v = Math.sin((x * 12.9898 + y * 78.233 + k * 37.719)) * 43758.5453; return v - Math.floor(v); };   // a stable per-piece choice
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            const circ = (cx, cy, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };

            const cup = (cx, cy, col = C.cream, coffee = '#6b4423') => { circ(cx, cy, 4.6, C.linen, 'rgba(120,90,60,0.6)', 0.6); circ(cx, cy, 3.4, col); circ(cx, cy, 2.6, coffee); circ(cx - 0.6, cy - 0.6, 1, 'rgba(240,220,190,0.75)'); ctx.fillStyle = C.linen; ctx.fillRect(cx + 4, cy - 1, 2.2, 2); };
            const candleJar = (cx, cy) => { circ(cx, cy, 4.2, 'rgba(255,214,160,0.35)', 'rgba(255,230,190,0.6)', 0.7); circ(cx, cy, 2.2, '#f6ead6'); circ(cx, cy, 0.9, '#3a2410'); };
            /** Draw facing south in a local frame (w × h as it stands when facing S), turned to `face` */
            const turned = (face, fn) => {
                const a = CC_FACE[face] || 0, side = Math.abs(Math.sin(a)) > 0.5, LW = side ? h : w, LH = side ? w : h;
                ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(a); fn(-LW / 2, -LH / 2, LW, LH); ctx.restore();
            };
            switch (p.decorType) {
                case 'cc_counter': {                                       // walnut bar, honey edge, slatted front, the register, a pastry case at the end
                    if (d.vertical) {
                        rr(x, y, w, h, 4, C.walnut, C.walnutDk, 1.2); rr(x + 3, y + 3, w - 6, h - 6, 3, C.walnutLt);
                        ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = y + 10; yy < y + h - 4; yy += 9) ctx.fillRect(x + w - 6, yy, 4, 5);   // the slats on the room side
                        ctx.fillStyle = C.honey; ctx.fillRect(x + w - 3, y + 2, 2, h - 4);
                        // A cake stand under a glass dome, a jar of biscotti
                        circ(x + w / 2, y + 40, 10, 'rgba(230,240,255,0.18)', 'rgba(255,255,255,0.45)', 0.8); circ(x + w / 2, y + 40, 7, '#d9a36a'); circ(x + w / 2 - 2, y + 38, 2, '#f4dcc0');
                        rr(x + w / 2 - 5, y + 74, 10, 14, 3, 'rgba(220,235,255,0.3)', 'rgba(255,255,255,0.5)', 0.7); ctx.fillStyle = '#c8935a'; ctx.fillRect(x + w / 2 - 3, y + 78, 6, 8);
                        cup(x + w / 2, y + 112); cup(x + w / 2, y + 140, '#e9d2b4');
                        break;
                    }
                    rr(x, y, w, h, 4, C.walnut, C.walnutDk, 1.2); rr(x + 3, y + 3, w - 6, h - 9, 3, C.walnutLt);
                    ctx.fillStyle = C.honey; ctx.fillRect(x + 2, y + h - 4, w - 4, 2);                                  // the honey edge the guests lean on
                    ctx.strokeStyle = 'rgba(255,220,170,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); for (let xx = x + 12; xx < x + w; xx += 16) { ctx.moveTo(xx, y + 4); ctx.lineTo(xx + 6, y + h - 8); } ctx.stroke();
                    // The register (brass), a tip jar, a cup of stirrers
                    rr(x + 50, y + 5, 30, 16, 3, '#2a2026', C.brass, 1); rr(x + 54, y + 8, 14, 6, 1, 'rgba(170,255,200,0.65)'); ctx.fillStyle = C.brass; ctx.fillRect(x + 70, y + 8, 6, 9);
                    circ(x + 98, y + 13, 6, 'rgba(220,235,255,0.25)', 'rgba(255,255,255,0.55)', 0.8); ctx.fillStyle = '#7fb06a'; ctx.fillRect(x + 95, y + 12, 6, 3); ctx.fillStyle = C.brass; circ(x + 99, y + 15, 1.4, C.brass);
                    cup(x + 130, y + 13); cup(x + 150, y + 15, '#d8b48c');
                    // The pastry case: glass, three shelves of something sweet
                    const px = x + w - 104, pw = 98;
                    rr(px, y + 2, pw, h - 7, 3, 'rgba(255,236,210,0.12)', 'rgba(255,240,220,0.55)', 1);
                    const pastry = ['#d9a36a', '#f0c9a0', '#8a4b2e', '#e8b8c8', '#f4dcae', '#c27b4a'];
                    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) {
                        const cx = px + 9 + i * 13, cy = y + 9 + j * 10, col = pastry[(i * 3 + j * 5) % pastry.length];
                        if ((i + j) % 3 === 2) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - 5, cy + 3); ctx.quadraticCurveTo(cx, cy - 6, cx + 5, cy + 3); ctx.closePath(); ctx.fill(); }   // croissants
                        else { circ(cx, cy, 4, col); circ(cx - 1, cy - 1, 1.4, 'rgba(255,255,255,0.4)'); }
                    }
                    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(px + 4, y + 3, 3, h - 10);
                    break;
                }
                case 'cc_espresso': {                                      // brass and steel: two group heads, cups warming on top, a pressure gauge
                    rr(x, y, w, h, 6, C.steelDk, '#2a2c32', 1); rr(x + 3, y + 3, w - 6, h - 10, 5, C.steel);
                    rr(x + 3, y + 3, w - 6, 5, 3, C.brass);
                    for (const gx of [x + 18, x + w - 18]) { circ(gx, y + h - 9, 6, '#2a2c32', C.brass, 1.2); circ(gx, y + h - 9, 2.5, '#111'); }
                    circ(x + w / 2, y + 18, 5, '#f4efe6', C.brass, 1); ctx.strokeStyle = '#a3241a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 18); ctx.lineTo(x + w / 2 + 3 * Math.cos(t), y + 18 + 3 * Math.sin(t)); ctx.stroke();
                    for (let i = 0; i < 4; i++) circ(x + 10 + i * 6, y + 12, 2.6, C.linen, 'rgba(0,0,0,0.25)', 0.5);
                    break;
                }
                case 'cc_grinder': {
                    rr(x + 3, y + 8, w - 6, h - 8, 3, '#2a2026', '#14100f', 1);
                    ctx.fillStyle = 'rgba(120,80,50,0.85)'; ctx.beginPath(); ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + w - 2, y + 10); ctx.lineTo(x + w - 6, y); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
                    for (let i = 0; i < 6; i++) circ(x + 7 + (i % 3) * 6, y + 3 + (i / 3 | 0) * 3, 1.3, '#3a2214');
                    break;
                }
                case 'cc_mug_shelf': {                                     // a walnut shelf on the wall, mismatched mugs on hooks
                    rr(x, y + h - 8, w, 8, 2, C.walnutLt, C.walnutDk, 1);
                    const mugs = ['#e9dcc6', '#c98c4a', '#6d8a64', '#8e4632', '#f1e4cc', '#5d6f8a', '#d9b45a', '#b5643e'];
                    for (let i = 0; i < 9; i++) { const mx = x + 8 + i * 13.5; rr(mx - 5, y + 2, 10, 11, 2, mugs[i % mugs.length], 'rgba(0,0,0,0.3)', 0.6); ctx.strokeStyle = mugs[i % mugs.length]; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(mx + 5, y + 7, 2.6, -1.2, 1.2); ctx.stroke(); }
                    break;
                }
                case 'cc_plant': {                                         // a terracotta pot, leaves fanned out (variant 1: a big fern)
                    const cx = x + w / 2, cy = y + h / 2, big = d.variant === 1, R = Math.min(w, h) / 2;
                    circ(cx, cy, R * 0.58, C.pot, '#7a3e22', 1.2); circ(cx, cy, R * 0.44, '#3a2416');
                    const n = big ? 13 : 9, sway = Math.sin(t * 0.8 + x) * 0.05;
                    for (let i = 0; i < n; i++) {
                        const a = i / n * Math.PI * 2 + sway + hsh(i) * 0.3, L = R * (big ? 1.25 : 0.95) * (0.75 + hsh(i + 9) * 0.35);
                        ctx.fillStyle = i % 2 ? C.leaf : C.leafLt; ctx.beginPath();
                        ctx.ellipse(cx + Math.cos(a) * L * 0.55, cy + Math.sin(a) * L * 0.55, L * 0.55, big ? 3.2 : 4.4, a, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'cc_fireplace': {                                     // brick surround on the west wall, a stone hearth, logs in the firebox
                    rr(x, y, w, h, 3, C.brick, C.brickDk, 1.5);
                    ctx.strokeStyle = 'rgba(40,12,8,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let yy = y + 8, row = 0; yy < y + h; yy += 8, row++) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); for (let xx = x + (row % 2 ? 6 : 12); xx < x + w; xx += 12) { ctx.moveTo(xx, yy - 8); ctx.lineTo(xx, yy); } }
                    ctx.stroke();
                    rr(x + w - 4, y - 8, 14, h + 16, 3, '#6a625a', '#3c3630', 1);                                        // the hearthstone
                    rr(x + 8, y + 26, w - 14, h - 52, 4, '#140806', '#2a120a', 1.2);                                    // the firebox
                    ctx.fillStyle = '#4a2c18'; ctx.save(); ctx.translate(x + w / 2 + 2, y + h / 2); ctx.rotate(0.4); ctx.fillRect(-4, -26, 8, 52); ctx.rotate(-0.8); ctx.fillRect(-4, -24, 8, 48); ctx.restore();   // crossed logs
                    for (let i = 0; i < 7; i++) { const f = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.7); circ(x + w / 2 + 2 + (hsh(i) - 0.5) * 12, y + 34 + i * ((h - 68) / 6), 2 + f * 1.5, `rgba(255,${90 + 80 * f | 0},30,${0.55 + 0.4 * f})`); }   // embers
                    rr(x + 2, y + 6, 8, h - 12, 2, C.walnut);                                                            // the mantel's shadow line
                    // On the mantel: two candlesticks and a small clock
                    for (const cy of [y + 14, y + h - 14]) { circ(x + 6, cy, 3, C.brass); circ(x + 6, cy, 1.6, '#f6ead6'); }
                    break;
                }
                case 'cc_armchair': case 'cc_loveseat': {                  // tufted velvet (rust or sage), deep arms, a cushion; a throw on some
                    const sofa = p.decorType === 'cc_loveseat', col = sofa ? C.sage : (hsh(1) > 0.5 ? C.rust : C.mustard), dk = sofa ? C.sageDk : (col === C.rust ? C.rustDk : '#8a6424');
                    turned(d.face || 'S', (X, Y, W, H) => {
                        rr(X, Y, W, H, 10, dk); rr(X, Y, W, H * 0.34, 9, col, dk, 1);                                     // the back
                        rr(X, Y + 4, W * 0.18, H - 6, 6, col, dk, 1); rr(X + W * 0.82, Y + 4, W * 0.18, H - 6, 6, col, dk, 1);   // arms
                        const seats = sofa ? 2 : 1, sw = (W * 0.64) / seats;
                        for (let i = 0; i < seats; i++) rr(X + W * 0.18 + i * sw + 1, Y + H * 0.32, sw - 2, H * 0.62, 6, col, 'rgba(0,0,0,0.25)', 0.8);
                        ctx.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 1; i < 4; i++) for (const yy of [Y + H * 0.12, Y + H * 0.24]) { ctx.beginPath(); ctx.arc(X + W * i / 4, yy, 1.1, 0, Math.PI * 2); ctx.fill(); }   // tufting
                        if (hsh(3) > 0.4) { ctx.fillStyle = 'rgba(232,220,196,0.85)'; ctx.beginPath(); ctx.moveTo(X + W * 0.62, Y + H * 0.3); ctx.lineTo(X + W * 0.84, Y + H * 0.3); ctx.lineTo(X + W * 0.8, Y + H * 0.95); ctx.lineTo(X + W * 0.56, Y + H * 0.9); ctx.closePath(); ctx.fill();   // a knitted throw
                            ctx.strokeStyle = 'rgba(160,120,80,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = 0.4; k < 0.95; k += 0.1) { ctx.moveTo(X + W * 0.6, Y + H * k); ctx.lineTo(X + W * 0.82, Y + H * k); } ctx.stroke(); }
                        if (sofa) rr(X + W * 0.24, Y + H * 0.3, W * 0.16, H * 0.2, 4, C.mustard, 'rgba(0,0,0,0.25)', 0.6);   // a cushion
                    });
                    break;
                }
                case 'cc_lowtable': {                                      // a low round table: a stack of books, two mugs, a candle
                    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;
                    circ(cx, cy, R, C.walnut, C.walnutDk, 1.5); circ(cx, cy, R - 4, C.walnutLt);
                    rr(cx - 16, cy - 10, 20, 14, 1, '#7a3b2e'); rr(cx - 15, cy - 13, 18, 4, 1, '#d9c8a6'); rr(cx - 14, cy - 17, 16, 4, 1, '#3e5a6e');
                    cup(cx + 10, cy - 6); cup(cx + 6, cy + 10, '#e2c7a2'); candleJar(cx - 8, cy + 10);
                    break;
                }
                case 'cc_bookshelf': {                                     // a walnut case of well-read spines
                    rr(x, y, w, h, 2, C.walnutDk, '#1a0f08', 1);
                    const cols = ['#7a3b2e', '#3e5a6e', '#c0903a', '#5f7a5a', '#d9c8a6', '#4a3a5e', '#9a5a3a', '#2e4a3a'];
                    let bx = x + 3;
                    while (bx < x + w - 4) { const bw = 3 + (hsh(bx) * 4 | 0), lean = hsh(bx + 1) > 0.88; ctx.fillStyle = cols[(bx * 7 | 0) % cols.length]; if (lean) { ctx.save(); ctx.translate(bx, y + h - 3); ctx.rotate(-0.25); ctx.fillRect(0, -(h - 7), bw, h - 7); ctx.restore(); } else ctx.fillRect(bx, y + 3, bw, h - 6); bx += bw + 0.6; }
                    ctx.fillStyle = 'rgba(255,220,160,0.08)'; ctx.fillRect(x + 2, y + 2, w - 4, 2);
                    break;
                }
                case 'cc_record': {                                        // a sideboard, a turntable turning, a stack of sleeves
                    rr(x, y, w, h, 3, C.walnut, C.walnutDk, 1);
                    rr(x + 3, y + 3, h - 6, h - 6, 2, '#2a2026'); const cx = x + 3 + (h - 6) / 2, cy = y + h / 2;
                    circ(cx, cy, (h - 10) / 2, '#0e0c10'); circ(cx, cy, 3, '#c0903a');
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(cx, cy, 7, t * 3.5, t * 3.5 + 1.2); ctx.stroke();
                    ctx.strokeStyle = C.brass; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + h, y + 4); ctx.lineTo(cx + 4, cy - 2); ctx.stroke();
                    for (let i = 0; i < 3; i++) rr(x + h + 4 + i * 2, y + 5, 14, h - 10, 1, ['#c98c4a', '#6d8a64', '#8e4632'][i], 'rgba(0,0,0,0.3)', 0.5);
                    break;
                }
                case 'cc_round_table': {                                   // a walnut round, a candle jar, cups and saucers, a sprig in a bud vase
                    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;
                    circ(cx, cy, R, C.walnut, C.walnutDk, 1.4); circ(cx, cy, R - 4, C.walnutLt);
                    ctx.strokeStyle = 'rgba(255,220,170,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R - 10, 0, Math.PI * 2); ctx.stroke();
                    candleJar(cx, cy);
                    const k = hsh(5);
                    if (k > 0.3) cup(cx - 13, cy + 4);
                    if (k > 0.55) cup(cx + 13, cy - 4, '#e2c7a2');
                    if (k < 0.5) { rr(cx + 6, cy + 6, 12, 8, 2, '#f1e4cc'); circ(cx + 12, cy + 10, 3, '#c27b4a'); }        // a plate, a pastry
                    circ(cx - 6, cy - 12, 2.4, 'rgba(220,235,255,0.5)'); ctx.fillStyle = hsh(6) > 0.5 ? '#e8b8c8' : '#f4dcae'; circ(cx - 6, cy - 14, 2, ctx.fillStyle);
                    break;
                }
                case 'cc_chair': {                                         // a bentwood chair: a round seat, a curved back
                    turned(d.face || 'S', (X, Y, W, H) => {
                        circ(X + W / 2, Y + H / 2 + 1, W / 2 - 1, C.walnutLt, C.walnutDk, 1.2);
                        circ(X + W / 2, Y + H / 2 + 1, W / 2 - 5, hsh(2) > 0.5 ? C.rust : C.sage);
                        ctx.strokeStyle = C.walnut; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X + W / 2, Y + H / 2 + 1, W / 2 - 1, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
                    });
                    break;
                }
                case 'cc_booth': {                                         // a padded bench, its back to the wall
                    turned(d.face || 'S', (X, Y, W, H) => {
                        rr(X, Y, W, H, 8, C.walnutDk); rr(X + 2, Y + 1, W - 4, H * 0.38, 7, C.sage, C.sageDk, 1);
                        for (let i = 0; i < 3; i++) rr(X + 3 + i * (W - 6) / 3, Y + H * 0.36, (W - 6) / 3 - 2, H * 0.56, 5, C.sage, 'rgba(0,0,0,0.25)', 0.8);
                        ctx.fillStyle = 'rgba(0,0,0,0.2)'; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.arc(X + W * i / 6, Y + H * 0.18, 1.1, 0, Math.PI * 2); ctx.fill(); }
                    });
                    break;
                }
                case 'cc_booth_table': case 'cc_side_table': {
                    const side = p.decorType === 'cc_side_table';
                    rr(x, y, w, h, side ? Math.min(w, h) / 2 : 4, C.walnut, C.walnutDk, 1.4); rr(x + 3, y + 3, w - 6, h - 6, side ? Math.min(w, h) / 2 - 3 : 3, C.walnutLt);
                    if (side) { cup(x + w / 2 - 5, y + h / 2); circ(x + w / 2 + 8, y + h / 2 - 3, 2, 'rgba(220,235,255,0.5)'); break; }
                    candleJar(x + w / 2, y + h / 2);
                    cup(x + 14, y + 14); if (hsh(4) > 0.4) cup(x + w - 14, y + h - 14, '#e2c7a2');
                    rr(x + w - 18, y + 6, 10, 12, 3, 'rgba(220,235,255,0.25)', 'rgba(255,255,255,0.5)', 0.6); ctx.fillStyle = '#f4ead6'; ctx.fillRect(x + w - 16, y + 11, 6, 6);   // sugar
                    break;
                }
                case 'cc_bench': {                                         // a window bench: cushions in three colours, pillows, a folded blanket
                    turned(d.face || 'S', (X, Y, W, H) => {
                        rr(X, Y, W, H, 6, C.walnutDk, '#1a0f08', 1);
                        const cols = [C.rust, C.sage, C.mustard, C.linen];
                        const n = Math.max(2, Math.round(W / 62));
                        for (let i = 0; i < n; i++) rr(X + 3 + i * (W - 6) / n, Y + 3, (W - 6) / n - 3, H - 6, 6, cols[(i + (x | 0)) % cols.length], 'rgba(0,0,0,0.22)', 0.8);
                        for (let i = 0; i < n; i += 2) rr(X + 8 + i * (W - 6) / n, Y + H - 14, 16, 10, 4, cols[(i + 1 + (x | 0)) % cols.length], 'rgba(0,0,0,0.25)', 0.6);   // pillows against the glass
                    });
                    break;
                }
                case 'cc_easel': {                                         // a chalkboard on legs: today's special
                    rr(x, y, w, h, 2, C.walnutLt, C.walnutDk, 1); rr(x + 2, y + 2, w - 4, h - 4, 1, C.chalk);
                    ctx.fillStyle = 'rgba(240,235,220,0.85)'; ctx.font = '600 5px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('honey', x + w / 2, y + h / 2 - 3); ctx.fillText('latte ♥', x + w / 2, y + h / 2 + 4);
                    break;
                }
                case 'cc_stove': {                                         // the range: four burners, a pot simmering, a copper pan
                    rr(x, y, w, h, 3, C.steelDk, '#202228', 1); rr(x + 3, y + 3, w - 6, h - 8, 2, '#2c2e34');
                    for (let i = 0; i < 4; i++) { const bx = x + 18 + i * 32, by = y + h / 2 - 2; circ(bx, by, 10, '#16171b', '#55585f', 1); if (i === 1) circ(bx, by, 8, `rgba(80,140,255,${0.35 + 0.15 * Math.sin(t * 9)})`); }
                    circ(x + 50, y + h / 2 - 2, 11, C.steel, '#3a3c42', 1); circ(x + 50, y + h / 2 - 2, 8, '#c27b4a');            // the soup
                    circ(x + 114, y + h / 2 - 2, 10, C.copper, '#6e3a1a', 1); ctx.fillStyle = C.copper; ctx.fillRect(x + 123, y + h / 2 - 4, 10, 3);
                    for (let i = 0; i < 4; i++) circ(x + 18 + i * 32, y + h - 3, 2, '#c9c9c9');
                    break;
                }
                case 'cc_sink': { rr(x, y, w, h, 3, C.steel, C.steelDk, 1); rr(x + 6, y + 5, w / 2 - 9, h - 10, 4, '#5a5e66'); rr(x + w / 2 + 3, y + 5, w / 2 - 9, h - 10, 4, '#5a5e66'); circ(x + w / 2, y + 4, 2.5, '#d0d2d8'); break; }
                case 'cc_prep': {                                          // a butcher-block table: a loaf, a board, a knife, a bowl of lemons
                    rr(x, y, w, h, 3, '#b07a44', '#6e4628', 1.2);
                    ctx.strokeStyle = 'rgba(80,50,25,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); for (let xx = x + 10; xx < x + w; xx += 10) { ctx.moveTo(xx, y + 2); ctx.lineTo(xx, y + h - 2); } ctx.stroke();
                    ctx.fillStyle = '#c8894a'; ctx.beginPath(); ctx.ellipse(x + 30, y + h / 2, 18, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8a5428'; ctx.beginPath(); for (let k = -10; k <= 10; k += 6) { ctx.moveTo(x + 30 + k - 2, y + h / 2 - 6); ctx.lineTo(x + 30 + k + 2, y + h / 2 + 6); } ctx.stroke();
                    rr(x + 64, y + 10, 30, 22, 3, '#e3c38e'); ctx.fillStyle = '#cfd2d8'; ctx.fillRect(x + 70, y + 20, 18, 2);
                    circ(x + 122, y + h / 2, 12, '#e8e2d4', '#b0a890', 1); for (let i = 0; i < 4; i++) circ(x + 118 + (i % 2) * 8, y + h / 2 - 3 + (i >> 1) * 6, 3.4, '#f2cf45');
                    break;
                }
                case 'cc_fridge': { rr(x, y, w, h, 4, '#d6d8de', '#8a8d95', 1); ctx.fillStyle = '#9a9da5'; ctx.fillRect(x + 3, y + h * 0.42, w - 6, 1.5); rr(x + w - 9, y + 8, 3, 18, 1, '#6a6d75'); rr(x + w - 9, y + h * 0.5, 3, 22, 1, '#6a6d75');
                    rr(x + 8, y + 10, 14, 10, 1, '#f5e9a8'); rr(x + 26, y + 30, 12, 12, 1, '#a8d8f5'); break; }       // notes and a drawing on the door
                case 'cc_shelf': {                                         // shelves of jars and tins
                    rr(x, y, w, h, 2, C.walnutDk, '#1a0f08', 1);
                    const jars = ['#d9a36a', '#f4dcae', '#8a4b2e', '#6d8a64', '#c0903a', '#e8dcc4'];
                    const along = d.vertical ? h : w, across = d.vertical ? w : h;
                    for (let i = 0; i * 12 + 8 < along; i++) for (let j = 0; j < 2; j++) {
                        const a = i * 12 + 7, b = across * (j ? 0.7 : 0.3);
                        circ(d.vertical ? x + b : x + a, d.vertical ? y + a : y + b, 4, jars[(i * 2 + j) % jars.length], 'rgba(0,0,0,0.3)', 0.6);
                    }
                    break;
                }
                case 'cc_crate': {                                         // a crate of coffee beans, stencilled
                    rr(x, y, w, h, 2, '#8a5a32', '#4a2c14', 1.2);
                    ctx.strokeStyle = 'rgba(40,20,8,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
                    ctx.fillStyle = 'rgba(30,14,6,0.55)'; ctx.font = '700 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.variant ? 'COCOA' : 'BEANS', x + w / 2, y + h / 2);
                    break;
                }
                case 'cc_sacks': {                                         // flour sacks slumped together
                    for (let i = 0; i < 3; i++) { const sx = x + 4 + i * 24, sy = y + (i % 2) * 8; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx + 16, sy + 24, 14, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e4d6b8'; ctx.beginPath(); ctx.ellipse(sx + 13, sy + 20, 13, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a89470'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#b8574a'; ctx.fillRect(sx + 6, sy + 18, 14, 3); }
                    break;
                }
            }
        }

        // Enni Cole's display furniture. All coordinates stay in the prop's world-space rectangle;
        // deterministic product arrangements make its normal and reflection passes identical.
        function drawEnniDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, d = p.decor || {}, variant = d.variant | 0;
            const C = { brass: '#b0844c', bright: '#ead5a6', rose: '#2b2328', dark: '#262328',
                walnut: '#493428', cream: '#e8ddd0', ivory: '#f4eadc', glass: '#9faeb2' };
            const rr = (X,Y,W,H,r,col,stroke,lw=1) => {
                ctx.beginPath(); ctx.roundRect(X,Y,W,H,r);
                if(col){ctx.fillStyle=col;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
            };
            const dot = (X,Y,R,col,stroke) => {ctx.beginPath();ctx.arc(X,Y,R,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke();}};
            const text = (str,X,Y,size=9,col=C.bright) => {ctx.save();ctx.font=`${size}px Georgia, serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=col;ctx.fillText(str,X,Y);ctx.restore();};

            const plinth = (col=C.walnut) => {rr(x,y,w,h,7,col,C.brass,1.5);rr(x+5,y+5,w-10,h-10,4,'#201e21');};
            const bottle = (X,Y,col) => {rr(X-3,Y-7,6,16,2,col);rr(X-1.3,Y-12,2.6,6,1,C.dark);rr(X-2.5,Y-3,5,5,.5,'#d6c3a2');ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(X-2,Y-6,1,12);};
            const screen = (X,Y,W,H,variant=0) => {
                rr(X,Y,W,H,3,C.dark,C.brass,1.2);
                const g=ctx.createLinearGradient(X,Y,X+W,Y+H);
                g.addColorStop(0,['#172f44','#421f4a','#1d383b'][variant%3]);g.addColorStop(1,['#79a1b5','#b888b7','#a6b5a3'][variant%3]);
                rr(X+3,Y+3,W-6,H-6,1.5,g);
                ctx.save();ctx.beginPath();ctx.rect(X+3,Y+3,W-6,H-6);ctx.clip();
                ctx.fillStyle=['#e2c29e','#d5c2e4','#dfd5b3'][variant%3];ctx.globalAlpha=.45;
                ctx.beginPath();ctx.moveTo(X+3,Y+H-3);ctx.bezierCurveTo(X+W*.32,Y-H*.2,X+W*.5,Y+H*1.4,X+W-3,Y+3);ctx.lineTo(X+W-3,Y+H-3);ctx.closePath();ctx.fill();
                ctx.fillStyle='#fff4dc';ctx.globalAlpha=.28;ctx.beginPath();ctx.arc(X+W*.7,Y+H*.3,Math.min(W,H)*.15,0,Math.PI*2);ctx.fill();ctx.restore();
                ctx.fillStyle='#efdeb5';ctx.fillRect(X+W/2-1,Y+H-1,2,1);
            };
            const turned = (fn) => {
                const a={S:0,W:Math.PI/2,N:Math.PI,E:-Math.PI/2}[d.face]||0,side=Math.abs(Math.sin(a))>.5,LW=side?h:w,LH=side?w:h;
                ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(a);fn(-LW/2,-LH/2,LW,LH);ctx.restore();
            };
            switch(p.decorType) {
                case 'ec_column': {
                    rr(x,y,w,h,3,C.brass,C.dark,1);rr(x+4,y+4,w-8,h-8,2,'#8a5362','#ad7b86',1);
                    rr(x+8,y+8,w-16,h-16,2,'#663747');ctx.fillStyle='rgba(255,220,210,.15)';ctx.fillRect(x+6,y+6,2,h-12);break;
                }
                case 'ec_wine': {
                    plinth();rr(x+7,y+7,w-14,h-14,3,'#553b2d');
                    for(let i=0;i<Math.floor((w-24)/17);i++)for(let j=0;j<2;j++)bottle(x+15+i*17,y+19+j*25,['#44394a','#39553b','#71494c'][(i+j)%3]);
                    ctx.strokeStyle='rgba(224,191,130,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+8,y+h/2);ctx.lineTo(x+w-8,y+h/2);ctx.stroke();
                    text('THE CELLAR',x+w/2,y+h-3,8);break;
                }
                case 'ec_produce': {
                    plinth();rr(x+8,y+8,w-16,h-20,3,'#5c4230');
                    for(let row=0;row<3;row++)for(let col=0;col<4;col++) {
                        const bx=x+10+col*(w-20)/4,by=y+10+row*(h-24)/3,bw=(w-24)/4,bh=(h-28)/3;
                        rr(bx,by,bw,bh,2,'#37291d','#886848',.8);
                        const color=['#b74840','#d5aa40','#85a84e','#5e8650','#927899','#e8994e'][(col+row*2+variant*3)%6];
                        for(let k=0;k<6;k++){const fx=bx+8+(k%3)*(bw-12)/3,fy=by+7+(k/3|0)*10;dot(fx,fy,4.2,color);dot(fx-1,fy-1,1,'rgba(255,244,192,.3)');ctx.fillStyle='#425234';ctx.fillRect(fx,fy-5,1,3);}
                    }
                    text(variant?'SEASONAL GREENS':'ORCHARD SELECTION',x+w/2,y+h-8,8);break;
                }
                case 'ec_grocery': {
                    plinth();rr(x+8,y+7,w-16,h-17,2,'#72533e');
                    const cols=Math.floor((w-24)/15);
                    for(let i=0;i<cols;i++)for(let j=0;j<2;j++) {
                        const X=x+13+i*15,Y=y+10+j*20,col=['#ae7154','#cfbd95','#779d8d','#955360'][(i+j+variant)%4];
                        rr(X,Y,10,14,1,col,'#3d2c23',.5);ctx.fillStyle='#ecd9b5';ctx.fillRect(X+2,Y+4,6,4);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(X+1,Y+1,1,11);
                    }
                    text(variant?'PANTRY & CONFECTIONS':'FINE FOODS',x+w/2,y+h-5,8);break;
                }
                case 'ec_cold': {
                    plinth('#495458');rr(x+6,y+6,w-12,h-15,3,'#9aaeb0');
                    const count=7,bw=(w-16)/count;
                    for(let i=0;i<count;i++) {
                        const X=x+8+i*bw;rr(X+2,y+11,bw-6,h-28,2,'#879f9f',C.brass,.8);
                        for(let j=0;j<3;j++){const xx=X+10+j*11;rr(xx,y+20,8,16,1,['#ece3cf','#e1c97f','#c8b1a9'][j]);rr(xx,y+43,8,12,1,['#e5daca','#aa7b60','#c9d5b4'][(i+j)%3]);}
                        ctx.fillStyle='rgba(232,250,255,.22)';ctx.fillRect(X+5,y+12,4,h-31);ctx.strokeStyle='rgba(245,255,255,.28)';ctx.beginPath();ctx.moveTo(X+6,y+12);ctx.lineTo(X+bw-10,y+h-18);ctx.stroke();
                    }
                    text('DAIRY • DELICATESSEN • CHILLED',x+w/2,y+h-5,8);break;
                }
                case 'ec_bakery': {
                    plinth();rr(x+6,y+6,w-12,h-15,4,'#c4a782');
                    for(let i=0;i<Math.floor((w-20)/23);i++)for(let j=0;j<2;j++) {
                        const X=x+17+i*23,Y=y+23+j*24;ctx.fillStyle=(i+j)%2?'#d6ac6c':'#a36b42';ctx.beginPath();ctx.ellipse(X,Y,9,5,-.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#efd4a4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X-4,Y-2);ctx.lineTo(X-2,Y+2);ctx.moveTo(X+1,Y-2);ctx.lineTo(X+3,Y+2);ctx.stroke();
                    }
                    rr(x+5,y+5,w-10,h-14,4,'rgba(222,244,245,.08)','rgba(255,248,225,.55)',1);text('BAKERY & PATISSERIE',x+w/2,y+h-4,8);break;
                }
                case 'ec_sofa': case 'ec_armchair': {
                    turned((X,Y,W,H)=>{
                        rr(X,Y,W,H,10,'#695549',C.brass,1.5);rr(X+5,Y+5,W-10,H-10,8,C.cream);
                        rr(X+6,Y+4,W-12,14,5,'#cdb8a6','#af9279',.6);
                        const n=p.decorType==='ec_sofa'?3:1,cw=(W-26)/n;
                        for(let k=0;k<n;k++)rr(X+13+k*cw,Y+22,cw-2,H-30,6,'#e9dbca','#c5b2a0',.8);
                        rr(X+4,Y+8,9,H-15,5,'#d5c2b1');rr(X+W-13,Y+8,9,H-15,5,'#d5c2b1');
                        if(n>1){rr(X+22,Y+25,19,16,4,C.rose,'#9b6579');rr(X+W-43,Y+24,19,16,4,'#b7a88c');}
                    });break;
                }
                case 'ec_lowtable': {
                    rr(x,y,w,h,12,C.brass,C.dark,1.2);rr(x+3,y+3,w-6,h-6,10,'#efded0');
                    ctx.strokeStyle='rgba(143,104,98,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+11,y+h-10);ctx.bezierCurveTo(x+w*.4,y-2,x+w*.52,y+h,x+w-8,y+8);ctx.stroke();
                    rr(x+16,y+16,25,20,1,'#765963',C.brass,.6);rr(x+20,y+13,25,20,1,'#b39a83');dot(x+w-25,y+h/2,9,'#d4bd9a',C.brass);dot(x+w-25,y+h/2,4,'#4f5c41');break;
                }
                case 'ec_side': {
                    rr(x,y,w,h,5,C.walnut,C.brass,1);rr(x+3,y+3,w-6,h-6,4,'#70523d');
                    dot(x+w/2,y+h/2,Math.min(w,h)*.24,'#eee2c7',C.brass);dot(x+w/2,y+h/2,Math.min(w,h)*.15,'#d8c8a9',C.brass);dot(x+w/2,y+h/2,3,'#fff2cb');break;
                }
                case 'ec_bed': {
                    rr(x,y,w,h,9,'#65404b',C.brass,1.5);rr(x+5,y+7,w-10,h-13,7,C.ivory);
                    rr(x+3,y+3,w-6,23,8,'#875768','#b17d89');
                    rr(x+15,y+35,w/2-22,33,7,'#ece2d7','#c1ad9b',.7);rr(x+w/2+7,y+35,w/2-22,33,7,'#ece2d7','#c1ad9b',.7);
                    rr(x+9,y+79,w-18,h-89,4,'#c5b4a5');rr(x+9,y+h*.6,w-18,h*.24,2,'#714555');
                    ctx.strokeStyle='rgba(241,223,191,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+10,y+h*.64);ctx.lineTo(x+w-10,y+h*.64);ctx.moveTo(x+10,y+h*.8);ctx.lineTo(x+w-10,y+h*.8);ctx.stroke();
                    ctx.strokeStyle='rgba(97,74,56,.16)';ctx.beginPath();for(let X=x+18;X<x+w-10;X+=15){ctx.moveTo(X,y+87);ctx.lineTo(X+2,y+h-10);}ctx.stroke();break;
                }
                case 'ec_dining': {
                    // Every chair is inside the collision footprint, so guests route around the full set.
                    for(let i=0;i<3;i++){rr(x+14+i*55,y,33,24,6,C.rose,C.brass);rr(x+14+i*55,y+h-24,33,24,6,C.rose,C.brass);}
                    rr(x+4,y+22,w-8,h-44,18,C.walnut,C.brass,1.3);rr(x+8,y+26,w-16,h-52,16,'#73503b');
                    for(let i=0;i<3;i++)for(const Y of [y+37,y+h-37]){const X=x+29+i*55;dot(X,Y,8,'#e8ddc7',C.brass);dot(X,Y,5,'#f4ead6');}
                    dot(x+w/2,y+h/2,9,'#bda26b',C.brass);dot(x+w/2,y+h/2,5,'#627446');break;
                }
                case 'ec_tvwall': {
                    plinth();for(let i=0;i<3;i++)screen(x+12+i*122,y+9,112,42,i);text('HOME CINEMA',x+w/2,y+h-4,8);break;
                }
                case 'ec_laptop': {
                    plinth('#594235');rr(x+5,y+5,w-10,h-10,4,'#ddcbb2');
                    for(let i=0;i<3;i++){const X=x+13+i*52;screen(X,y+12,42,24,i);rr(X-2,y+37,46,31,3,'#969ca0','#54585a',.7);ctx.fillStyle='#3b4045';for(let j=0;j<4;j++)for(let k=0;k<6;k++)ctx.fillRect(X+3+k*6,y+41+j*4,4,2);rr(X+12,y+59,15,6,1,'#afb2b3','#74787c',.5);}
                    text('COMPUTING',x+w/2,y+h-5,8,C.dark);break;
                }
                case 'ec_tablet': {
                    plinth('#594235');rr(x+5,y+5,w-10,h-10,4,'#ddcbb2');
                    for(let i=0;i<3;i++){const X=x+12+i*35;screen(X,y+14,27,43,i+variant);dot(X+13.5,y+54,1,'#eee1bf');}
                    text(variant?'CONNECTED HOME':'PERSONAL DEVICES',x+w/2,y+h-10,7,C.dark);break;
                }
                case 'ec_audio': {
                    plinth('#594235');rr(x+5,y+5,w-10,h-10,4,'#ddcbb2');
                    for(let i=0;i<3;i++) {const X=x+15+i*53;rr(X,y+12,36,50,5,'#383238',C.brass,.9);dot(X+18,y+29,11,'#1b1c20','#635b5c');dot(X+18,y+49,6,'#1d2025','#827460');dot(X+18,y+29,3,'#887e72');}
                    text('HIGH FIDELITY',x+w/2,y+h-8,8,C.dark);break;
                }
                case 'ec_appliances': {
                    plinth('#594235');rr(x+5,y+5,w-10,h-10,4,'#ddcbb2');
                    for(let i=0;i<4;i++){const X=x+17+i*93;rr(X,y+12,68,48,5,['#c4c6c5','#343537','#d2cec4','#949999'][i],C.dark,1);
                        if(i===0||i===3){dot(X+34,y+37,16,'#242c31','#efddbd');dot(X+34,y+37,11,'#738289');}
                        else if(i===1){for(let k=0;k<4;k++)dot(X+20+(k%2)*27,y+24+(k/2|0)*22,9,'#191c20','#86888a');}
                        else{rr(X+8,y+19,52,25,2,'#2b343c','#a89f92');ctx.fillStyle='#88abc0';ctx.fillRect(X+49,y+24,6,4);}
                    }text('DESIGNED FOR HOME',x+w/2,y+h-7,8,C.dark);break;
                }
                case 'ec_checkout': {
                    rr(x,y,w,h,9,C.rose,C.brass,1.5);rr(x+5,y+5,w-10,h-15,6,'#eadccc','#c4ac91',.8);
                    ctx.strokeStyle='rgba(157,105,110,.2)';ctx.beginPath();ctx.moveTo(x+12,y+15);ctx.lineTo(x+w-23,y+35);ctx.stroke();
                    screen(x+22,y+12,32,20,2);rr(x+26,y+32,24,8,1,'#68615c');rr(x+w-40,y+18,17,25,3,'#35353a',C.brass);ctx.fillStyle='#8aa8a3';ctx.fillRect(x+w-37,y+22,11,7);dot(x+w/2,y+22,8,'#bfa470',C.brass);dot(x+w/2,y+22,5,'#4f6845');
                    text(variant?'CUSTOMER SERVICES':'CHECKOUT',x+w/2,y+h-5,8);break;
                }
                case 'ec_plant': {
                    dot(x+w/2,y+h/2,Math.min(w,h)*.43,'#a78a51',C.brass);dot(x+w/2,y+h/2,Math.min(w,h)*.34,'#3a3525');
                    for(let i=0;i<9;i++){const a=i*Math.PI*2/9,rx=w*.24;ctx.save();ctx.translate(x+w/2+Math.cos(a)*rx*.35,y+h/2+Math.sin(a)*rx*.35);ctx.rotate(a);ctx.fillStyle=i%2?'#3b6140':'#537948';ctx.beginPath();ctx.ellipse(rx*.45,0,rx,.18*w,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(163,186,126,.35)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(rx*1.3,0);ctx.stroke();ctx.restore();}break;
                }
                // ── The lobby ──
                case 'ec_balustrade': {                                // the staircase's brass rail on rose stone
                    const v=h>w;rr(x,y,w,h,3,'#7d4b5a',C.brass,1.2);
                    ctx.fillStyle=C.bright;if(v)ctx.fillRect(x+w/2-1,y+2,2,h-4);else ctx.fillRect(x+2,y+h/2-1,w-4,2);
                    ctx.fillStyle='#5b3341';for(let k=8;k<(v?h:w)-4;k+=12){if(v)dot(x+w/2,y+k,2.2,'#d8bd84');else dot(x+k,y+h/2,2.2,'#d8bd84');}
                    break;
                }
                case 'ec_newel': {                                     // a newel post with a frosted globe lamp
                    rr(x,y,w,h,4,'#6a3a4a',C.brass,1.5);rr(x+4,y+4,w-8,h-8,3,'#8a5362');
                    dot(x+w/2,y+h/2,w*.3,'#f6ead0',C.brass);dot(x+w/2,y+h/2,w*.16,'#fff8e6');break;
                }
                case 'ec_perfume': {                                   // a round glass counter of perfume bottles
                    dot(x+w/2,y+h/2,w/2,C.rose,C.brass);dot(x+w/2,y+h/2,w/2-6,'#efe2cf','#c4ac91');
                    const cols=['#f0c9a8','#d79bb1','#c9d6e8','#e8d58f','#b9e0cf','#f4dfe9'];
                    for(let i=0;i<10;i++){const a=i*Math.PI/5,R=w*.3,X=x+w/2+Math.cos(a)*R,Y=y+h/2+Math.sin(a)*R;rr(X-4,Y-5,8,10,2,cols[i%6],'#8c7457',.6);dot(X,Y-6,1.8,C.brass);}
                    dot(x+w/2,y+h/2,9,'#f7f0e2',C.brass);dot(x+w/2,y+h/2,3.5,'#e7b6c2');break;
                }
                case 'ec_floral': {                                    // a tall urn of pale roses
                    dot(x+w/2,y+h/2,w*.46,'#b59a63',C.dark);dot(x+w/2,y+h/2,w*.38,'#3e4a35');
                    for(let i=0;i<14;i++){const a=i*2.39996,R=w*.32*Math.sqrt((i+.5)/14),X=x+w/2+Math.cos(a)*R,Y=y+h/2+Math.sin(a)*R;dot(X,Y,w*.085,['#f3d6dc','#e9b3c0','#fbefe6','#d98ea3'][i%4]);dot(X,Y,w*.03,'rgba(140,60,80,.4)');}
                    break;
                }
                case 'ec_topiary': {                                   // a clipped cypress in a black planter, as at the door
                    rr(x,y,w,h,4,'#232126',C.brass,1);dot(x+w/2,y+h/2,w*.4,'#2e4a31');dot(x+w/2,y+h/2,w*.28,'#3e6440');dot(x+w/2-2,y+h/2-2,w*.14,'#5c8a55');break;
                }
                case 'ec_display': {                                   // a round walnut table of handbags and scarves
                    dot(x+w/2,y+h/2,w/2,C.walnut,C.brass);dot(x+w/2,y+h/2,w/2-5,'#70523d');
                    const cols=['#7b2f45','#e6d2b4','#1f1b20','#c58f6a'];
                    for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,R=w*.24,X=x+w/2+Math.cos(a)*R,Y=y+h/2+Math.sin(a)*R;rr(X-9,Y-6,18,12,3,cols[(i+variant)%4],C.brass,.7);ctx.strokeStyle=C.bright;ctx.lineWidth=1;ctx.beginPath();ctx.arc(X,Y-6,5,Math.PI,0);ctx.stroke();}
                    dot(x+w/2,y+h/2,6,'#f0e2c4',C.brass);break;
                }
                case 'ec_mannequin': {                                 // a dressed form on a marble plinth, seen from above
                    const dress=['#e9d3a6','#1c1a1f','#b0475f','#f3ece0','#2f5a4d','#7b3fa0'][variant%6],cx=x+w/2,cy=y+h/2,s=w/40;
                    dot(cx,cy,w/2,'#141116',C.brass);dot(cx,cy,w/2-3,'#2a252c');
                    // the gown's skirt, scalloped into folds, then the bodice and shoulders, the head turned to the room
                    ctx.fillStyle=dress;ctx.beginPath();
                    for(let i=0;i<=24;i++){const a=i*Math.PI/12,R=(14+(i%2?1.6:0))*s;ctx.lineTo(cx+Math.cos(a)*R,cy+2*s+Math.sin(a)*R*.92);}
                    ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(0,0,0,.28)';ctx.lineWidth=.7;ctx.stroke();
                    ctx.strokeStyle='rgba(255,240,215,.28)';ctx.lineWidth=.8;
                    for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*5*s,cy+2*s+Math.sin(a)*5*s);ctx.lineTo(cx+Math.cos(a)*13*s,cy+2*s+Math.sin(a)*12*s);ctx.stroke();}
                    ctx.fillStyle=dress;ctx.beginPath();ctx.ellipse(cx,cy-1*s,10*s,5*s,0,0,Math.PI*2);ctx.fill();
                    ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(cx,cy-1*s,10*s,5*s,0,0,Math.PI*2);ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=.8;ctx.stroke();
                    dot(cx-10*s,cy-1*s,2.2*s,'#e6dccd');dot(cx+10*s,cy-1*s,2.2*s,'#e6dccd');                                // the form's arms
                    dot(cx,cy-1.5*s,3.4*s,'#f1e7da','#a8957a');
                    if(variant%2===0){ctx.strokeStyle=C.bright;ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy-1*s,5*s,.3,Math.PI-.3);ctx.stroke();}   // a necklace
                    break;
                }
                // ── Fashion ──
                case 'ec_rack': {                                      // a brass rail of hung clothes
                    rr(x,y,w,h,4,'rgba(42,35,40,.55)',C.brass,1.2);
                    ctx.fillStyle=C.brass;ctx.fillRect(x+4,y+h/2-1,w-8,2);
                    const n=Math.floor((w-12)/9),cols=['#e9d3a6','#1c1a1f','#b0475f','#f3ece0','#6d5a8a','#c58f6a','#2f5a4d'];
                    for(let i=0;i<n;i++){const X=x+7+i*9;rr(X,y+4,7,h-8,2,cols[(i*3+variant)%7],'rgba(0,0,0,.25)',.5);ctx.fillStyle='rgba(255,245,225,.18)';ctx.fillRect(X+1,y+5,1,h-10);}
                    break;
                }
                case 'ec_round_rack': {                                // a two-tier round rack: bronze rails on an obsidian plinth, garments hung by colour
                    const cx=x+w/2,cy=y+h/2,R=w/2,pal=[['#e9dcc4','#cdb48a','#a3815a','#6e5440','#2a2428','#f4ede0'],['#16301f','#2f5a4d','#5a1a2a','#8c2b3e','#1d2a4a','#0f0e12'],['#f2d6dc','#d79bb1','#b0475f','#e9d3a6','#f4ede0','#c9a3b8'],['#0f0e12','#2a2830','#55525c','#9a98a2','#d8d6dc','#1c1a1f'],['#3a2a1f','#7a5a3a','#c58f6a','#e2c79a','#5a1a2a','#1c1a1f']][variant%5];
                    const hash=i=>{const s=Math.sin(i*91.7+variant*13.1)*4375.5;return s-Math.floor(s);};
                    dot(cx+2,cy+3,R,'rgba(0,0,0,.28)');dot(cx,cy,R,'#141116',C.brass);dot(cx,cy,R-3,'#1f1b20');
                    ctx.strokeStyle='rgba(255,240,215,.08)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,R-6,Math.PI*1.05,Math.PI*1.6);ctx.stroke();
                    // garments on a tier: hangers on the rail, each piece a narrow shape falling outward, the colours graded round
                    const tier=(rad,n,len,wid)=>{
                        for(let i=0;i<n;i++){const a=i*Math.PI*2/n+.08,col=pal[Math.floor(i/n*pal.length*2)%pal.length],L=len*(.8+hash(i+rad)*.35);
                            ctx.save();ctx.translate(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);ctx.rotate(a);
                            // seen from above a hung piece is its shoulders edge-on: a slim shape, wider at the shoulder, the hem falling away
                            ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-1.5,-wid*.5);ctx.lineTo(L*.3,-wid*.62);ctx.lineTo(L,-wid*.36);ctx.quadraticCurveTo(L+1.2,0,L,wid*.36);ctx.lineTo(L*.3,wid*.62);ctx.lineTo(-1.5,wid*.5);ctx.closePath();ctx.fill();
                            ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=.5;ctx.stroke();ctx.fillStyle='rgba(255,245,225,.2)';ctx.fillRect(0,-wid*.4,L*.7,.7);
                            ctx.restore();}
                        ctx.strokeStyle='#4a3420';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();
                        ctx.strokeStyle=C.brass;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();
                        ctx.strokeStyle='rgba(240,214,160,.7)';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(cx,cy,rad-.6,Math.PI*1.1,Math.PI*1.7);ctx.stroke();
                        for(let i=0;i<n;i++){const a=i*Math.PI*2/n+.08;dot(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,.8,'#e8cf9c');}
                    };
                    tier(R*.56,Math.round(R*2*Math.PI*.56/3.6),R*.38,4.2);
                    tier(R*.27,Math.round(R*2*Math.PI*.27/3.8),R*.2,3.8);
                    // the crown: a champagne post with a bronze finial and its little sign
                    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;ctx.strokeStyle=C.brass;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*5,cy+Math.sin(a)*5);ctx.lineTo(cx+Math.cos(a)*R*.27,cy+Math.sin(a)*R*.27);ctx.stroke();}
                    dot(cx,cy,6,'#cdb48a','#5c4128');dot(cx,cy,3,'#f1dfb6');dot(cx-1,cy-1,1,'#fffaf0');
                    break;
                }
                // ── The aisles: obsidian gondolas, bronze price rails, goods seen from above on both faces ──
                case 'ec_gondola': case 'ec_cloth_aisle': {
                    const v=h>w,L=v?h:w,D=v?w:h,food=p.decorType==='ec_gondola';
                    const hash=i=>{const s=Math.sin(i*127.1+variant*311.7+x*.13)*43758.5;return s-Math.floor(s);};
                    ctx.save();ctx.translate(x,y);if(v){ctx.translate(w,0);ctx.rotate(Math.PI/2);}
                    rr(2,3,L,D,4,'rgba(0,0,0,.3)');rr(0,0,L,D,4,'#161317','#5c4128',1);
                    const cap=Math.min(26,D*.62);                                                  // the end caps
                    rr(1,1,L-2,D-2,3,null,C.brass,1.2);
                    ctx.fillStyle='#0d0b0e';ctx.fillRect(cap,D/2-1.5,L-2*cap,3);ctx.fillStyle='rgba(201,154,91,.5)';ctx.fillRect(cap,D/2-.4,L-2*cap,.8);   // the spine
                    const half=(D-3)/2-4;
                    // one face: goods in a row from cap to cap, `top` true for the north face (goods' fronts at its outer edge)
                    const face=(top,kind,seed)=>{
                        const Y0=top?3:D/2+1.5,H=half,run=L-2*cap-4;let X=cap+2,i=0;
                        ctx.save();ctx.beginPath();ctx.rect(cap+1,Y0,run+2,H+1);ctx.clip();
                        while(X<cap+2+run){const k=hash(seed+i*7.3),k2=hash(seed+i*3.1+9);
                            if(kind==='box'){const bw=7+k*7,col=['#b0475f','#e9d3a6','#2f5a4d','#c58f6a','#1d2a4a','#f3ece0','#8a5a2a','#d5aa40'][(seed+i)%8];
                                for(let s=0;s<2;s++){rr(X,Y0+1+s*(H/2),bw-1,H/2-1.5,.8,col,'rgba(0,0,0,.35)',.5);ctx.fillStyle='rgba(255,250,235,.45)';ctx.fillRect(X+1.5,Y0+2.5+s*(H/2),bw-4,1.6);}X+=bw;}
                            else if(kind==='jar'){const R=2.6+k*1.4,col=['#c84a3a','#d5aa40','#7a4a2a','#e8994e','#6a8a3a','#a03a5a'][(seed+i)%6];
                                for(let s=0;s<Math.max(1,Math.floor(H/(R*2+1)));s++){const yy=Y0+R+1+s*(R*2+1);dot(X+R,yy,R,col,'rgba(0,0,0,.4)');dot(X+R,yy,R*.62,['#c6a365','#e8e0d0','#2a2428'][(seed+i)%3]);dot(X+R-.8,yy-.8,.6,'rgba(255,255,255,.6)');}X+=R*2+1;}
                            else if(kind==='bottle'){const col=['#3c2a3a','#2f4a2f','#6a3a2a','#c9b06a','#1f2a3a'][(seed+i)%5];
                                for(let s=0;s<Math.max(1,Math.floor(H/7.5));s++){const yy=Y0+4+s*7.5;dot(X+3.2,yy,3.2,col,'rgba(0,0,0,.4)');dot(X+3.2,yy,1.2,'#c6a365');}X+=7;}
                            else if(kind==='produce'){const bw=18+k*6,col=['#b74840','#d5aa40','#85a84e','#e8994e','#6b3a6a','#c8d86a'][(seed+i)%6];
                                rr(X,Y0+1,bw-2,H-1,1.5,'#4a3424','#8a6844',.6);for(let q=0;q<bw*H/22;q++){const fx=X+3+hash(seed+i*5+q)*(bw-8),fy=Y0+3.5+hash(seed+i*9+q*2)*(H-6);dot(fx,fy,2.4,col);dot(fx-.7,fy-.7,.6,'rgba(255,250,210,.4)');}X+=bw;}
                            else if(kind==='fold'){const bw=13,col=['#f3ece0','#e9d3a6','#cdb48a','#a3815a','#6e5440','#3a3540','#1c1a1f','#5a1a2a','#2f5a4d','#1d2a4a'][Math.floor(i/2+seed)%10];
                                rr(X,Y0+1.5,bw-2,H-2,1.2,col,'rgba(0,0,0,.35)',.5);ctx.fillStyle='rgba(0,0,0,.16)';for(let f=1;f<4;f++)ctx.fillRect(X+1,Y0+1.5+f*(H-2)/4,bw-4,.7);ctx.fillStyle='rgba(255,250,235,.2)';ctx.fillRect(X+1,Y0+2,1,H-4);X+=bw;}
                            else if(kind==='hang'){const col=['#e9dcc4','#cdb48a','#a3815a','#2a2428','#5a1a2a','#8c2b3e','#2f5a4d','#1d2a4a','#f2d6dc','#16141a'][Math.floor(i/3+seed)%10],Lg=H*(.82+k2*.2);
                                ctx.fillStyle=col;ctx.beginPath();const y0=top?Y0+H:Y0,dir=top?-1:1;ctx.moveTo(X,y0);ctx.lineTo(X+5,y0);ctx.lineTo(X+5.6,y0+dir*Lg*.7);ctx.quadraticCurveTo(X+2.5,y0+dir*Lg,X-.6,y0+dir*Lg*.7);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=.5;ctx.stroke();X+=4.2;}
                            i++;}
                        ctx.restore();
                        // the face's bronze price rail at its outer edge, a champagne tag every so often
                        const ry=top?1.5:D-3;ctx.fillStyle=C.brass;ctx.fillRect(cap,ry,L-2*cap,1.5);
                        if(kind!=='hang')for(let t=cap+10;t<L-cap-6;t+=26){ctx.fillStyle='#ead5a6';ctx.fillRect(t,top?ry-.5:ry,5,2.5);}
                    };
                    const kinds=food?[['box','jar'],['bottle','box'],['produce','produce'],['jar','bottle']][variant%4]:[['fold','fold'],['hang','hang'],['fold','hang']][variant%3];
                    if(kinds[1]==='hang'&&kinds[0]==='hang'){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(cap,D/2-2,L-2*cap,4);}
                    face(true,kinds[0],variant*17+1);face(false,kinds[1],variant*17+40);
                    if(kinds.includes('hang')){ctx.fillStyle=C.brass;ctx.fillRect(cap,D/2-1,L-2*cap,2);ctx.fillStyle='rgba(255,238,200,.6)';ctx.fillRect(cap,D/2-1,L-2*cap,.6);}
                    // end caps: a featured stack each end on champagne stone
                    for(const ex of [0,L-cap]){rr(ex+2,2,cap-4,D-4,3,'#8d795d',C.brass,1);rr(ex+5,5,cap-10,D-10,2,'#a48e6c');
                        const ccx=ex+cap/2,ccy=D/2;
                        if(food){const col=[['#e8994e','#d5aa40'],['#6a2a3a','#2f4a2f'],['#b74840','#85a84e'],['#d6ac6c','#a36b42']][variant%4];for(let q=0;q<7;q++){const a=q*Math.PI*2/6;dot(q?ccx+Math.cos(a)*4.6:ccx,q?ccy+Math.sin(a)*4.6:ccy,2.6,col[q%2],'rgba(0,0,0,.35)');}}
                        else{for(let q=0;q<3;q++)rr(ccx-6+q*.6,ccy-7+q*4.4,12,5,1,['#e9dcc4','#2a2428','#cdb48a','#5a1a2a'][(q+variant)%4],'rgba(0,0,0,.3)',.5);}
                    }
                    ctx.restore();
                    // the hanging sign over the aisle: an obsidian plate on bronze, its shadow on the goods
                    const label=d.label||(food?['PANTRY','CELLAR & OILS','THE GREENGROCER','PRESERVES'][variant%4]:['KNITWEAR','EVENING','DENIM & SHIRTS'][variant%3]);
                    const sx=v?x+w/2:x+(d.signAt||.5)*w,sy=v?y+(d.signAt||.5)*h:y+h/2;
                    ctx.save();ctx.font='7px Georgia, serif';const tw=ctx.measureText(label).width+16;
                    rr(sx-tw/2+4,sy-6+6,tw,13,2,'rgba(0,0,0,.28)');rr(sx-tw/2,sy-7,tw,13,2,'#141116',C.brass,1);
                    ctx.fillStyle='#d9bf8c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((d.aisle?d.aisle+'  •  ':'')+label,sx,sy);ctx.restore();
                    break;
                }
                case 'ec_shelfwall': {                                 // cubbies of folded knits along the wall
                    plinth();const v=h>w,n=Math.floor(((v?h:w)-12)/26),cols=['#e8ddd0','#c9a98c','#7b2f45','#3a3540','#d7b7c0','#9aa38a'];
                    for(let i=0;i<n;i++){const X=v?x+5:x+6+i*26,Y=v?y+6+i*26:y+5,W=v?w-10:22,H=v?22:h-10;rr(X,Y,W,H,2,'#563c2d',C.brass,.6);for(let k=0;k<3;k++){const c=cols[(i+k)%6];if(v)rr(X+3,Y+2+k*6,W-6,5,1,c);else rr(X+2+k*6,Y+3,5,H-6,1,c);}}
                    break;
                }
                case 'ec_fashion_table': {                             // a walnut table of folded shirts, belts and a vase
                    rr(x,y,w,h,6,C.walnut,C.brass,1.4);rr(x+4,y+4,w-8,h-8,4,'#70523d');
                    const cols=['#f3ece0','#b0475f','#c9a98c','#3a3540','#e9d3a6','#6d5a8a'];
                    for(let i=0;i<3;i++)for(let j=0;j<2;j++){const X=x+12+i*((w-24)/3),Y=y+10+j*((h-20)/2);rr(X,Y,(w-24)/3-8,(h-20)/2-6,2,cols[(i+j*3+variant)%6],'rgba(0,0,0,.2)',.6);ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(X+2,Y+((h-20)/2-6)/2,(w-24)/3-12,1);}
                    break;
                }
                // ── The Food Hall ──
                case 'ec_deli': {                                      // La Cuisine: the chef's counter of prepared dishes
                    plinth('#495458');rr(x+6,y+6,w-12,h-18,3,'#cfd9d6');
                    const n=Math.floor((w-20)/46);
                    for(let i=0;i<n;i++){const X=x+12+i*46;rr(X,y+12,40,h-34,3,'#f1ece2','#9aa3a0',.8);
                        const food=[['#c86a3a','#7a9a4a'],['#e2c06a','#b04a3a'],['#8a5a3a','#d8c8a0'],['#5f8a4a','#e8d8b0'],['#c84a5a','#f0e0c8']][i%5];
                        ctx.fillStyle=food[0];ctx.beginPath();ctx.ellipse(X+20,y+12+(h-34)/2,14,(h-34)/2-5,0,0,Math.PI*2);ctx.fill();
                        for(let k=0;k<4;k++)dot(X+12+k*5,y+14+(h-34)/2+(k%2?3:-3),2,food[1]);}
                    ctx.fillStyle='rgba(232,250,255,.18)';ctx.fillRect(x+8,y+8,w-16,4);
                    text('LA CUISINE  •  TRAITEUR',x+w/2,y+h-5,8);break;
                }
                // ── Upstairs: the gallery's void over the lobby ──
                case 'ec_void': {
                    // Looking down into the lobby: its marble far below, the medallion's ring, the rail all round.
                    // The chandelier hanging in it is drawEnniUpperGlow's.
                    const g=ctx.createRadialGradient(x+w/2,y+h/2,20,x+w/2,y+h/2,Math.max(w,h)*.62);
                    g.addColorStop(0,'#8a7768');g.addColorStop(.6,'#4d3a3c');g.addColorStop(1,'#241820');
                    rr(x,y,w,h,40,g);
                    ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,40);ctx.clip();
                    ctx.strokeStyle='rgba(30,18,22,.25)';ctx.lineWidth=1;for(let X=x+20;X<x+w;X+=46){ctx.beginPath();ctx.moveTo(X,y);ctx.lineTo(X,y+h);ctx.stroke();}for(let Y=y+20;Y<y+h;Y+=46){ctx.beginPath();ctx.moveTo(x,Y);ctx.lineTo(x+w,Y);ctx.stroke();}
                    ctx.strokeStyle='rgba(198,163,101,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.38,0,Math.PI*2);ctx.stroke();
                    ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(x,y,w,14);ctx.fillRect(x,y,14,h);   // the floor's lip throws its shadow
                    ctx.restore();
                    ctx.strokeStyle='#5b3341';ctx.lineWidth=9;ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,h-6,38);ctx.stroke();
                    ctx.strokeStyle=C.brass;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x+3,y+3,w-6,h-6,38);ctx.stroke();
                    ctx.strokeStyle=C.bright;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x+2,y+2,w-4,h-4,39);ctx.stroke();
                    break;
                }
                case 'ec_ottoman': {                                   // a round buttoned ottoman
                    dot(x+w/2,y+h/2,w/2,'#7d4b5a',C.brass);dot(x+w/2,y+h/2,w/2-6,'#a46a7b');
                    for(let i=0;i<8;i++){const a=i*Math.PI/4;dot(x+w/2+Math.cos(a)*w*.25,y+h/2+Math.sin(a)*w*.25,1.6,'#5b3341');}
                    dot(x+w/2,y+h/2,2.5,C.brass);break;
                }
                // ── Cuisine, the restaurant ──
                case 'ec_rtable': {                                    // a round table for four, linen and candle
                    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,X=x+w/2+Math.cos(a)*w*.38,Y=y+h/2+Math.sin(a)*h*.38;dot(X,Y,w*.11,C.rose,C.brass);dot(X,Y,w*.07,'#94586b');}
                    dot(x+w/2,y+h/2,w*.3,'#f6efe3','#c9b597');
                    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,X=x+w/2+Math.cos(a)*w*.19,Y=y+h/2+Math.sin(a)*h*.19;dot(X,Y,5.5,'#fffaf0','#c8b89a');dot(X,Y,2.5,'#e8dcc4');}
                    dot(x+w/2,y+h/2,4,C.brass);dot(x+w/2,y+h/2,1.6,'#fff1c9');break;
                }
                case 'ec_booth': {                                     // a rose velvet banquette with its table for two
                    rr(x,y,30,h,8,'#713f52',C.brass,1.2);rr(x+4,y+4,22,h-8,6,'#94586b');
                    rr(x+38,y+8,w-62,h-16,4,'#f6efe3','#c9b597');dot(x+38+(w-62)/2,y+h/2-9,5.5,'#fffaf0','#c8b89a');dot(x+38+(w-62)/2,y+h/2+9,5.5,'#fffaf0','#c8b89a');dot(x+38+(w-62)/2+10,y+h/2,2,C.brass);
                    dot(x+w-12,y+h/2,11,C.rose,C.brass);dot(x+w-12,y+h/2,7,'#94586b');break;
                }
                case 'ec_dessert': {                                   // the patisserie trolley-counter
                    plinth();rr(x+6,y+6,w-12,h-16,4,'#efe2cf');
                    const n=Math.floor((w-20)/26),cols=['#e9b3c0','#7b4a32','#f4ead6','#c9d79a','#d98ea3'];
                    for(let i=0;i<n;i++){const X=x+16+i*26,Y=y+6+(h-16)/2;dot(X,Y,9,'#fffaf2','#c9b597');dot(X,Y,6,cols[i%5]);dot(X,Y-2,1.6,'#b8303e');}
                    text('PATISSERIE',x+w/2,y+h-4,8);break;
                }
                // ── The kitchen ──
                case 'ec_range': {
                    rr(x,y,w,h,3,'#2c2e31','#8f9396',1.2);
                    const n=Math.floor((w-10)/36);for(let i=0;i<n;i++)for(let j=0;j<1;j++){const X=x+22+i*36,Y=y+h/2;dot(X,Y,13,'#18191b','#5a5d60');dot(X,Y,7,'#2b2d30','#6d7074');}
                    ctx.fillStyle='#b9bdc0';ctx.fillRect(x+4,y+h-6,w-8,3);break;
                }
                case 'ec_kprep': {
                    rr(x,y,w,h,3,'#aab0b3','#5f6467',1.2);rr(x+4,y+4,w-8,h-8,2,'#c9ced0');
                    rr(x+14,y+12,40,26,3,'#c99a6a','#7b5a3a',.8);for(let k=0;k<5;k++)dot(x+70+k*12,y+h/2,4,['#b04a3a','#e2c06a','#5f8a4a','#f0e0c8','#c86a3a'][k]);
                    ctx.fillStyle='#4a4d50';ctx.fillRect(x+w-40,y+14,26,3);ctx.fillRect(x+w-40,y+22,22,3);break;
                }
                case 'ec_kfridge': {
                    rr(x,y,w,h,3,'#c4c9cb','#5f6467',1.2);ctx.fillStyle='#8a8f92';ctx.fillRect(x+w/2-.5,y+4,1,h-8);ctx.fillRect(x+w/2-6,y+h/2-8,2,16);ctx.fillRect(x+w/2+4,y+h/2-8,2,16);break;
                }
                case 'ec_ksink': {
                    rr(x,y,w,h,3,'#b7bcbf','#5f6467',1.2);rr(x+8,y+8,w/2-12,h-16,4,'#7d8487','#4f5558');rr(x+w/2+4,y+8,w/2-12,h-16,4,'#7d8487','#4f5558');dot(x+w/2,y+6,3,'#e0e3e5','#4f5558');break;
                }
                // ── The salon ──
                case 'ec_jewel': {                                     // a glass vitrine of rings and necklaces on velvet
                    plinth();rr(x+6,y+6,w-12,h-12,3,'#3a1f2c');
                    const n=Math.floor((w-20)/22);for(let i=0;i<n;i++){const X=x+16+i*22;ctx.strokeStyle=i%2?C.bright:'#e0e6ec';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(X,y+h/2-4,6,0,Math.PI);ctx.stroke();dot(X,y+h/2+3,2.2,['#ff7aa8','#9ad8ff','#f4e2a0','#b8f0c8'][i%4]);dot(X,y+h/2+12,2.6,'#e9dcc0',C.brass);}
                    ctx.fillStyle='rgba(232,250,255,.16)';ctx.fillRect(x+7,y+7,w-14,3);ctx.strokeStyle='rgba(255,248,225,.5)';ctx.lineWidth=1;ctx.strokeRect(x+5.5,y+5.5,w-11,h-11);break;
                }
                case 'ec_bagwall': case 'ec_shoewall': {               // wall shelves: handbags, or heels in pairs
                    plinth();const v=h>w,n=Math.floor(((v?h:w)-12)/34),bag=p.decorType==='ec_bagwall';
                    for(let i=0;i<n;i++){const X=v?x+w/2:x+20+i*34,Y=v?y+20+i*34:y+h/2;
                        if(bag){const c=['#7b2f45','#e6d2b4','#1f1b20','#c58f6a','#d79bb1'][i%5];rr(X-10,Y-8,20,16,3,c,C.brass,.7);ctx.strokeStyle=C.bright;ctx.lineWidth=1;ctx.beginPath();ctx.arc(X,Y-8,6,Math.PI,0);ctx.stroke();}
                        else{const c=['#b0475f','#1c1a1f','#e9d3a6','#c9a98c','#7b3fa0'][i%5];ctx.fillStyle=c;for(const dx of [-5,5]){ctx.beginPath();ctx.ellipse(X+dx,Y,3.5,10,0,0,Math.PI*2);ctx.fill();}ctx.fillStyle=C.bright;dot(X-5,Y+8,1.2,C.bright);dot(X+5,Y+8,1.2,C.bright);}}
                    break;
                }
                case 'ec_shoes': {                                     // a low island of heels
                    rr(x,y,w,h,8,'#efe2cf',C.brass,1.4);
                    const n=Math.floor((w-16)/26);for(let i=0;i<n;i++){const X=x+16+i*26,c=['#b0475f','#1c1a1f','#e9d3a6','#c58f6a','#7b3fa0'][(i+variant)%5];ctx.fillStyle=c;for(const dx of [-4,4]){ctx.beginPath();ctx.ellipse(X+dx,y+h/2,3.2,9,0,0,Math.PI*2);ctx.fill();}}
                    break;
                }
                case 'ec_chaise': {                                    // a rose velvet chaise
                    rr(x,y,w,h,14,'#713f52',C.brass,1.4);rr(x+6,y+6,w-12,h-12,10,'#a46a7b');rr(x+4,y+4,26,h-8,10,'#8a5362');
                    for(let i=0;i<4;i++)dot(x+44+i*((w-56)/3),y+h/2,1.5,'#5b3341');break;
                }
                case 'ec_mirror': {                                    // a gilt three-way mirror
                    for(let i=0;i<3;i++){const X=x+i*w/3;rr(X+1,y,w/3-2,h,3,C.brass,C.dark,.8);const g=ctx.createLinearGradient(X,y,X+w/3,y+h);g.addColorStop(0,'#cfd8dc');g.addColorStop(.5,'#f4f7f8');g.addColorStop(1,'#9fb0b6');rr(X+4,y+4,w/3-8,h-8,2,g);}
                    break;
                }
                case 'ec_fitting': {                                   // curtained cubicles, each with its mirror and stool
                    const n=Math.max(1,Math.floor(w/90)),cw=w/n;
                    for(let i=0;i<n;i++){const X=x+i*cw;rr(X+2,y,cw-4,h,3,'#e9dfd2','#b59a75',1.2);
                        rr(X+8,y+4,cw-16,8,2,'#cfd8dc',C.brass,.8);dot(X+cw/2,y+h*.45,8,'#a46a7b',C.brass);
                        ctx.fillStyle=i===1?'#a46a7b':'#7d4b5a';for(let k=0;k<(i===1?3:8);k++)rr(X+4+k*(cw-8)/8,y+h-14,(cw-8)/8-1,12,2,ctx.fillStyle);   // the curtain, one drawn back
                        ctx.fillStyle=C.brass;ctx.fillRect(X+4,y+h-16,cw-8,2);}
                    break;
                }
                case 'ec_vending': {
                    rr(x,y,w,h,4,'#4a353d',C.brass,1.2);rr(x+5,y+6,w-15,h-18,2,'#273032','#a4987f',.7);
                    for(let i=0;i<3;i++)for(let j=0;j<3;j++)rr(x+8+i*8,y+12+j*12,6,8,1,['#ab8260','#92705a','#bfd0b0'][(i+j)%3]);
                    rr(x+w-8,y+16,5,10,1,'#a5b6a5');ctx.fillStyle=C.brass;ctx.fillRect(x+w-8,y+31,5,3);rr(x+8,y+h-10,w-19,5,1,'#1b2021');break;
                }
            }
        }

        function drawClinicDecorProp(ctx, p) {
            if (p.decorType.startsWith('apt_')) return drawApartmentDecorProp(ctx, p);
            if (p.decorType.startsWith('sc_')) return drawSanctumDecorProp(ctx, p);
            if (p.decorType.startsWith('ps_')) return drawSuiteDecorProp(ctx, p);
            if (p.decorType.startsWith('mc_')) return drawClubDecorProp(ctx, p);
            if (p.decorType.startsWith('gy_')) return drawGraveStone(ctx, p);
            if (p.decorType.startsWith('dn_')) return drawLobbyDecorProp(ctx, p);
            if (p.decorType.startsWith('hod_')) return drawHouseDecorProp(ctx, p);
            if (p.decorType.startsWith('ns_')) return drawNeuralDecorProp(ctx,p);
            if (p.decorType.startsWith('ta_')) return drawTorqueDecorProp(ctx, p);
            if (p.decorType.startsWith('dp_')) return drawPalaceDecorProp(ctx, p);
            if (p.decorType.startsWith('cc_')) return drawCafeDecorProp(ctx, p);
            if (p.decorType.startsWith('ec_')) return drawEnniDecorProp(ctx, p);
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => {
                ctx.beginPath(); ctx.roundRect(X, Y, W, H, r);
                if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
            };
            switch (p.decorType) {
                case 'bed': {
                    const L = p.headSide !== 'right';                 // head against the left wall?
                    rr(x, y, w, h, 6, '#d9dee2', '#8a949b', 1.5);      // frame
                    rr(x + 4, y + 4, w - 8, h - 8, 5, '#eef3f6');        // mattress
                    const px = L ? x + 7 : x + w - 29;                  // pillow
                    rr(px, y + 9, 22, h - 18, 6, '#ffffff', 'rgba(0,0,0,0.12)', 1);
                    const bx = L ? x + 34 : x + 5, bw = w - 40;         // blanket over the lower body
                    rr(bx, y + 5, bw, h - 10, 5, '#3f8fa3');
                    ctx.fillStyle = 'rgba(255,255,255,0.18)';           // folded sheet edge
                    ctx.fillRect(L ? bx : bx + bw - 7, y + 5, 7, h - 10);
                    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;   // folds
                    for (let i = 1; i < 4; i++) { const fx = bx + (bw * i) / 4; ctx.beginPath(); ctx.moveTo(fx, y + 8); ctx.quadraticCurveTo(fx + 4, y + h / 2, fx, y + h - 8); ctx.stroke(); }
                    if (p.patient) {                                    // someone resting
                        const hx = L ? x + 18 : x + w - 18;
                        ctx.fillStyle = '#6b4a36'; ctx.beginPath(); ctx.arc(hx, y + h / 2, 8, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(hx + (L ? -2 : 2), y + h / 2, 8, L ? 1.2 : -1.9, L ? 5.1 : 1.9); ctx.fill();
                        ctx.fillStyle = '#35788a'; rr(L ? x + 30 : x + w - 70, y + 8, 40, h - 16, 8, '#35788a');   // body under the blanket
                    }
                    ctx.fillStyle = '#9aa4ab';                         // side rails
                    ctx.fillRect(x + (L ? 30 : 10), y - 1, w - 42, 3); ctx.fillRect(x + (L ? 30 : 10), y + h - 2, w - 42, 3);
                    break;
                }
                case 'monitor': {                                       // vitals monitor on a cart
                    rr(x, y, w, h, 3, '#2b3138', '#15191d', 1);
                    rr(x + 2, y + 2, w - 4, h - 8, 2, '#04130c');
                    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 8); ctx.clip();
                    ctx.strokeStyle = '#3dff8a'; ctx.lineWidth = 1; ctx.shadowColor = '#3dff8a'; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    const mid = y + 2 + (h - 8) / 2, sw = w - 4;
                    for (let i = 0; i <= sw; i++) {                    // scrolling heartbeat trace
                        const ph = ((i / sw) * 2 + t * 1.2 + p.x * 0.01) % 1;
                        const spike = ph > 0.45 && ph < 0.55 ? Math.sin((ph - 0.45) * Math.PI * 20) * (h - 10) * 0.45 : 0;
                        const yy = mid - spike;
                        i === 0 ? ctx.moveTo(x + 2 + i, yy) : ctx.lineTo(x + 2 + i, yy);
                    }
                    ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0;
                    ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(x + w - 4, y + h - 3, 1.3, 0, Math.PI * 2); ctx.fill();
                    break;
                }
                case 'iv': {                                            // IV stand: base spokes, pole, bag
                    const cx = x + w / 2, cy = y + h / 2;
                    ctx.strokeStyle = '#8c969d'; ctx.lineWidth = 1.5;
                    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); ctx.stroke(); }
                    ctx.fillStyle = '#c7ced3'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
                    rr(cx - 4, cy - 5, 8, 10, 3, 'rgba(200,235,255,0.55)', 'rgba(255,255,255,0.8)', 0.8);
                    ctx.fillStyle = 'rgba(120,200,255,0.45)'; ctx.fillRect(cx - 3, cy - 1, 6, 5);
                    break;
                }
                case 'cabinet': {                                       // glass-front pharmacy cabinet
                    rr(x, y, w, h, 3, '#e4e9ec', '#8a949b', 1.5);
                    rr(x + 3, y + 3, w - 6, h - 6, 2, '#b9cbd4');
                    const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#ecf0f1', '#9b59b6'];
                    for (let i = 0, n = Math.floor((w - 10) / 9); i < n; i++) {
                        const bx = x + 6 + i * 9, c = cols[(i * 7 + Math.floor(p.x)) % cols.length];
                        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(bx + 3, y + 10, 2.6, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = cols[(i * 3 + 1) % cols.length]; ctx.fillRect(bx + 1, y + 16, 5, 7);
                    }
                    ctx.fillStyle = 'rgba(255,255,255,0.25)';           // glass sheen
                    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + 3); ctx.lineTo(x + w * 0.32, y + 3); ctx.lineTo(x + w * 0.22, y + h - 3); ctx.lineTo(x + w * 0.1, y + h - 3); ctx.fill();
                    break;
                }
                case 'desk': {                                          // reception desk, screens face Dr. Yin (north)
                    rr(x, y, w, h, 6, '#f2f4f5', '#9aa4ab', 1.5);
                    rr(x + 4, y + h - 9, w - 8, 5, 2, '#3fb6c9');       // teal front trim
                    const scr = (sx) => { rr(sx, y + 4, 26, 5, 1, '#1d2328'); ctx.fillStyle = '#6ff0ff'; ctx.shadowColor = '#6ff0ff'; ctx.shadowBlur = 6; ctx.fillRect(sx + 2, y + 5, 22, 2.4); ctx.shadowBlur = 0; };
                    scr(x + 30); scr(x + w - 56);
                    ctx.fillStyle = '#ffffff'; ctx.save(); ctx.translate(x + w / 2 - 6, y + 14); ctx.rotate(-0.15); ctx.fillRect(0, 0, 12, 9); ctx.fillStyle = '#c9d1d6'; ctx.fillRect(2, 2, 8, 1); ctx.fillRect(2, 5, 6, 1); ctx.restore();   // papers
                    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(x + 20, y + 17, 3.5, 0, Math.PI * 2); ctx.fill();   // mug
                    ctx.fillStyle = '#5a3b22'; ctx.beginPath(); ctx.arc(x + 20, y + 17, 2.4, 0, Math.PI * 2); ctx.fill();
                    break;
                }
                case 'bench': {
                    rr(x, y, w, h, 5, '#8a949b');
                    for (let i = 0; i < 3; i++) rr(x + 4 + i * (w - 8) / 3, y + 4, (w - 8) / 3 - 3, h - 8, 5, '#2f6f80', 'rgba(255,255,255,0.15)', 1);
                    break;
                }
                case 'cooler': {                                        // water cooler: bottle seen from above
                    rr(x, y, w, h, 4, '#dfe5e8', '#8a949b', 1);
                    ctx.fillStyle = 'rgba(90,170,255,0.75)'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.36, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + w / 2 - 3, y + h / 2 - 3, 2.2, 0, Math.PI * 2); ctx.fill();
                    break;
                }
                case 'plant': {                                         // potted plant
                    const cx = x + w / 2, cy = y + h / 2;
                    ctx.fillStyle = '#6d5a4b'; ctx.beginPath(); ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2); ctx.fill();
                    const greens = ['#2e7d32', '#388e3c', '#43a047', '#1b5e20'];
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + Math.sin(t * 0.8 + i) * 0.05, r = w * (0.2 + (i % 3) * 0.08);
                        ctx.fillStyle = greens[i % greens.length];
                        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w * 0.2, w * 0.1, a, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
            }
        }

        class PropEntity extends GameEntity {
            constructor(config) {
                super({
                    ...config,
                    type: config.type || 'prop',
                    hasCollision: true,
                    collisionShape: GameEntity.SHAPE.OBB,  // Now uses OBB for SAT collision
                    collisionLayer: GameEntity.LAYER.DYNAMIC,
                    mass: config.mass || 50,
                    friction: config.friction || 0.85,
                    restitution: config.restitution || 0.3,
                    angularVel: config.angularVel || 0
                });

                this.color = config.color || '#00CED1';
                this.interactionType = config.interactionType || null;
                this.decorType = config.decorType || null;       // custom furniture art (clinic)
                this.light = config.light || null;               // soft light that follows the prop: { radius, color, intensity, dx, dy }
                this.headSide = config.headSide || null;
                this.decor = Object.assign({ face: config.face, vertical: !!config.vertical, candles: !!config.candles, variant: config.variant | 0 }, config.decor);   // House pieces: facing, wall run, lit
                this.noNav = !!config.noNav;                     // thin wall pieces paths needn't route round
                this.tall = !!config.tall;                       // taller than a person: drawn over the people (engine/overhead.js)
                this.patient = !!config.patient;
                this.noteId = config.noteId || null;
                if (config.label) this.label = config.label;                   // what the action pill names it
                if (config.lootLines) { this.lootMin = config.lootMin; this.lootMax = config.lootMax; this.lootLines = config.lootLines; }   // lost things (searchLostLuggage)
                this.roomId = config.roomId || null;  // For light switches: which room this controls
                this._switchState = true;  // Light switch: true = lights ON
                this.angularFriction = 0.85;  // Rotation slows down over time (as fast as sliding does)
                // Fixtures never turn: wall-mounted things, thin wall pieces, and anything too heavy to shift
                this.fixedRotation = config.fixedRotation ?? (this.noNav || this.mass >= 1e4
                    || ['light_switch', 'armory', 'medbay_refill', 'tv_screen', 'vending_machine'].includes(this.interactionType));

                // Legacy compatibility: expose w and h
                this.w = this.width;
                this.h = this.height;
            }

            /**
             * Get OBB for SAT collision.
             * Center-based for accurate rotation.
             */
            getOBB() {
                return {
                    x: this.x + this.width / 2,
                    y: this.y + this.height / 2,
                    length: this.width,
                    width: this.height,
                    angle: this.angle || 0,
                    mass: this.mass,
                    vx: this.vx,
                    vy: this.vy
                };
            }

            /**
             * Get center position (for OBB collision)
             */
            getCenter() {
                return { 
                    x: this.x + this.width / 2, 
                    y: this.y + this.height / 2 
                };
            }

            /**
             * Get AABB bounding box for broadphase collision.
             * Props use corner-based positioning (x,y = top-left), so we must
             * compute center before building the rotated AABB — unlike the base
             * GameEntity version which assumes x,y is already center for OBBs.
             */
            getBoundingBox() {
                const cos = Math.abs(Math.cos(this.angle));
                const sin = Math.abs(Math.sin(this.angle));
                const w = this.width * cos + this.height * sin;
                const h = this.width * sin + this.height * cos;
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
            }

            /**
             * Update prop physics - velocity, rotation, and friction.
             * Wall and prop-prop collisions are handled by CollisionSystem.
             */
            update() {
                // A broken number never spreads: restore the last good state
                if (!Number.isFinite(this.x + this.y + this.vx + this.vy + this.angle + this.angularVel)) {
                    const g = this._good || { x: 0, y: 0, angle: 0 };
                    this.x = g.x; this.y = g.y; this.angle = g.angle; this.vx = this.vy = this.angularVel = 0;
                }
                if (this.fixedRotation) this.angularVel = 0;
                // Settled furniture still wakes on any assigned velocity/rotation or
                // edited pose. Keep all externally visible sleeping bookkeeping.
                if (this.vx === 0 && this.vy === 0 && this.angularVel === 0 && Number.isFinite(this.friction) && Number.isFinite(this.angularFriction)) {
                    // Retain even signed-zero arithmetic and the original zero normalization.
                    this.x += this.vx; this.y += this.vy; this.angle += this.angularVel;
                    this.vx = this.vy = this.angularVel = 0;
                    this._still = (this._still || 0) + 1;
                    if (!this._good) this._good = {};
                    this._good.x = this.x; this._good.y = this.y; this._good.angle = this.angle;
                    this.w = this.width; this.h = this.height;
                    return;
                }
                // Speed cap: no faster than about half its own thickness a tick (walls can't be skipped)
                const sp = Math.hypot(this.vx, this.vy), cap = Math.max(4, Math.min(14, Math.min(this.width, this.height) * 0.9));
                if (sp > cap) { this.vx *= cap / sp; this.vy *= cap / sp; }
                if (Math.abs(this.angularVel) > 0.35) this.angularVel = Math.sign(this.angularVel) * 0.35;

                // Apply velocity
                this.x += this.vx;
                this.y += this.vy;

                // Apply rotation
                this.angle += this.angularVel;

                // Apply friction
                this.vx *= this.friction;
                this.vy *= this.friction;
                this.angularVel *= this.angularFriction;

                // Stop if very slow (prevents micro-drift)
                if (Math.abs(this.vx) < 0.1) this.vx = 0;
                if (Math.abs(this.vy) < 0.1) this.vy = 0;
                if (Math.abs(this.angularVel) < 0.001) this.angularVel = 0;
                // Asleep after a still half-second (CollisionSystem skips sleeper pairs); a contact wakes it
                this._still = (this.vx || this.vy || this.angularVel) ? 0 : (this._still || 0) + 1;
                if (!this._good) this._good = {};
                this._good.x = this.x; this._good.y = this.y; this._good.angle = this.angle;

                // Keep w/h in sync for legacy compatibility
                this.w = this.width;
                this.h = this.height;
            }


            draw(ctx) {
                if (!this.visible) return;
                // Painting or replaying a split run draws body art only. The outer pass
                // adds exactly one ground shadow, including vector fallback and live props.
                if (PropPass.mode === 0) {
                    drawGroundContactShadow(ctx, this.x + this.width / 2, this.y + this.height / 2,
                        this.width / 2 + 5, this.height / 2 + 5, this.angle || 0);
                }
                if (PropSprites.stamp(ctx, this)) return;      // painted once, stamped (entities/prop-sprites.js)

                ctx.save();
                const center = this.getCenter();
                ctx.translate(center.x, center.y);
                ctx.rotate(this.angle);

                ctx.fillStyle = this.color;

                if (this.decorType) {
                    ctx.translate(-center.x, -center.y);
                    drawClinicDecorProp(ctx, this);
                } else if (this.interactionType === 'medbay_refill') {
                    ctx.translate(-center.x, -center.y);
                    drawHealthStation(ctx, this);
                } else if (this.interactionType === 'armory') {
                    // === ARMORY LOCKER (wall-mounted weapons rack) ===
                    ctx.translate(-center.x, -center.y);

                    const ax = this.x, ay = this.y, aw = this.width, ah = this.height;

                    // Dark metal casing
                    ctx.fillStyle = '#1a1a22';
                    ctx.fillRect(ax, ay, aw, ah);

                    // Inner panel (dark violet)
                    ctx.fillStyle = '#1a0f2a';
                    ctx.fillRect(ax + 3, ay + 3, aw - 6, ah - 6);

                    // Weapon silhouettes — three horizontal bars representing guns
                    ctx.fillStyle = '#444';
                    const barH = 3;
                    const barInset = 8;
                    for (let i = 0; i < 3; i++) {
                        const by = ay + 10 + i * (ah - 20) / 3;
                        ctx.fillRect(ax + barInset, by, aw - barInset * 2, barH);
                        // Small grip nub
                        ctx.fillRect(ax + barInset + 4, by - 2, 5, barH + 4);
                    }

                    // Pulsing violet glow (indicates interactable)
                    const armPulse = 0.5 + Math.sin(_frameTime / 500) * 0.4;
                    ctx.shadowColor = '#a469ff';
                    ctx.shadowBlur = 12 * armPulse;
                    ctx.fillStyle = `rgba(164, 105, 255, ${0.1 * armPulse})`;
                    ctx.fillRect(ax + 2, ay + 2, aw - 4, ah - 4);

                    // "LOADOUT" label
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = `rgba(164, 105, 255, ${0.5 + armPulse * 0.3})`;
                    ctx.font = 'bold 5px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('LOADOUT', ax + aw / 2, ay + ah - 5);
                    ctx.textAlign = 'start';

                } else if (this.interactionType === 'vending_machine') {
                    ctx.translate(-center.x, -center.y);
                    drawMiniSpree(ctx, this);
                } else if (this.interactionType === 'bed_sleep') {
                    // --- NEW: SMALLER BED RENDERER ---
                    ctx.translate(-center.x, -center.y);

                    // Mattress
                    ctx.fillStyle = '#202025'; 
                    ctx.fillRect(this.x, this.y, this.width, this.height);

                    // Pillow (White rect at top)
                    ctx.fillStyle = '#dddddd';
                    ctx.fillRect(this.x + 3, this.y + 3, this.width - 6, 15);

                    // Blanket (Colored rect covering bottom 3/4)
                    ctx.fillStyle = this.color; 
                    ctx.fillRect(this.x, this.y + 25, this.width, this.height - 25);

                    // Fold/Detail line
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.fillRect(this.x, this.y + 25, this.width, 3);

                } else if (this.interactionType === 'couch_two_seater') {
                    // --- TWO SEATER COUCH (Top-down view) ---
                    ctx.translate(-center.x, -center.y);

                    // Couch base/frame (darker)
                    ctx.fillStyle = '#1a1215';
                    ctx.fillRect(this.x, this.y, this.width, this.height);

                    // Back rest (top portion, slightly raised look)
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.x + 4, this.y + 4, this.width - 8, 18);

                    // Seat cushions (two side by side)
                    const cushionGap = 4;
                    const cushionWidth = (this.width - 12 - cushionGap) / 2;
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.x + 6, this.y + 26, cushionWidth, this.height - 34);
                    ctx.fillRect(this.x + 6 + cushionWidth + cushionGap, this.y + 26, cushionWidth, this.height - 34);

                    // Cushion detail lines (subtle indent)
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.fillRect(this.x + 6, this.y + 26, cushionWidth, 3);
                    ctx.fillRect(this.x + 6 + cushionWidth + cushionGap, this.y + 26, cushionWidth, 3);

                    // Arm rests (left and right sides)
                    ctx.fillStyle = '#0d0a0c';
                    ctx.fillRect(this.x, this.y + 20, 6, this.height - 24);
                    ctx.fillRect(this.x + this.width - 6, this.y + 20, 6, this.height - 24);

                } else if (this.interactionType === 'tv_screen') {
                    // --- TV SCREEN (Top-down, warm glow for fireplace effect) ---
                    ctx.translate(-center.x, -center.y);

                    // TV frame (black border)
                    ctx.fillStyle = '#0a0a0a';
                    ctx.fillRect(this.x, this.y, this.width, this.height);

                    // Screen with warm glow (simulating fireplace video)
                    ctx.shadowColor = this.color || '#ff6622';
                    ctx.shadowBlur = 25;
                    ctx.fillStyle = this.color || '#ff6622';
                    ctx.fillRect(this.x + 4, this.y + 4, this.width - 8, this.height - 8);

                    // Inner flame detail (lighter center)
                    ctx.fillStyle = '#ffaa44';
                    ctx.fillRect(this.x + 8, this.y + 6, this.width - 16, this.height - 14);

                    // Flickering core (brightest)
                    ctx.fillStyle = '#ffdd88';
                    const flicker = Math.sin(_frameTime / 200) * 2;
                    ctx.fillRect(this.x + 12 + flicker, this.y + 8, this.width - 26, this.height - 18);

                    ctx.shadowBlur = 0;

                } else if (this.interactionType === 'light_switch') {
                    // --- LIGHT SWITCH (Wall-mounted panel with LED indicator) ---
                    ctx.translate(-center.x, -center.y);

                    const sx = this.x, sy = this.y, sw = this.width, sh = this.height;

                    // Wall plate (dark gray housing)
                    ctx.fillStyle = '#1a1a1a';
                    ctx.fillRect(sx, sy, sw, sh);

                    // Plate border highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.06)';
                    ctx.fillRect(sx, sy, sw, 1);
                    ctx.fillRect(sx, sy, 1, sh);
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(sx + sw - 1, sy, 1, sh);
                    ctx.fillRect(sx, sy + sh - 1, sw, 1);

                    // Toggle rocker (raised rectangle)
                    ctx.fillStyle = '#2a2a2a';
                    ctx.fillRect(sx + 2, sy + 3, sw - 4, sh - 6);

                    // LED indicator
                    const ledColor = this._switchState ? '#44ff88' : '#ff3333';
                    const ledGlow = this._switchState ? 'rgba(68, 255, 136, 0.6)' : 'rgba(255, 51, 51, 0.4)';
                    ctx.shadowColor = ledGlow;
                    ctx.shadowBlur = 6;
                    ctx.fillStyle = ledColor;
                    ctx.beginPath();
                    ctx.arc(sx + sw / 2, sy + sh - 3, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                } else if (this.interactionType === 'bedside_table') {
                    // --- BEDSIDE TABLE (Top-down, small square table) ---
                    ctx.translate(-center.x, -center.y);

                    // Table top
                    ctx.fillStyle = this.color || '#2a1f1a';
                    ctx.fillRect(this.x, this.y, this.width, this.height);

                    // Wood grain detail (subtle lines)
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.fillRect(this.x + 5, this.y + 3, 2, this.height - 6);
                    ctx.fillRect(this.x + 12, this.y + 3, 1, this.height - 6);
                    ctx.fillRect(this.x + this.width - 8, this.y + 3, 2, this.height - 6);

                    // Highlight edge (top)
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.fillRect(this.x, this.y, this.width, 3);

                    // Shadow edge (bottom/right)
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(this.x, this.y + this.height - 3, this.width, 3);
                    ctx.fillRect(this.x + this.width - 3, this.y, 3, this.height);

                } else if (this.color === '#555') {
                    // Gravestones (no rotation for gravestones)
                    ctx.translate(-center.x, -center.y);
                    ctx.fillStyle = '#444';
                    ctx.beginPath();
                    ctx.arc(this.x + this.width/2, this.y, this.width/2, Math.PI, 0);
                    ctx.lineTo(this.x + this.width, this.y + this.height);
                    ctx.lineTo(this.x, this.y + this.height);
                    ctx.fill();
                    ctx.strokeStyle = '#222';
                    ctx.stroke();

                } else {
                    // Default prop with 3D highlights (rotated)
                    const hw = this.width / 2;
                    const hh = this.height / 2;
                    ctx.fillRect(-hw, -hh, this.width, this.height);
                    // Top highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.1)';
                    ctx.fillRect(-hw, -hh, this.width, 5);
                    // Right shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(hw - 5, -hh, 5, this.height);
                }

                ctx.restore();
            }
        }

