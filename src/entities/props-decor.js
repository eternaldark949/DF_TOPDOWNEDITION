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
            const shadow = () => rr(x + 3, y + 3, w, h, 5, 'rgba(0,0,0,0.28)');
            const lampShade = (cx, cy, r) => { circ(cx, cy, r, A.cream, A.creamDk, 1); circ(cx, cy, r * 0.35, '#ffd9b0'); };
            const counterTop = (X, Y, W, H) => {                          // cream quartz with a walnut front edge (north side)
                rr(X, Y, W, H, 2, A.cream);
                ctx.strokeStyle = 'rgba(160,140,125,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath();
                for (let i = 0; i < W; i += 23) { ctx.moveTo(X + i, Y + 4); ctx.quadraticCurveTo(X + i + 9, Y + H * 0.5, X + i + 4, Y + H - 3); }
                ctx.stroke();
                ctx.fillStyle = A.walnut; ctx.fillRect(X, Y, W, 3);
            };
            switch (p.decorType) {
                case 'apt_craft': {                                        // the workbench: walnut on steel, a pegboard lip, vise, schematic tablet, iron
                    rr(x + 3, y + 4, w, h, 3, 'rgba(0,0,0,0.34)');
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
                    const tx = x + w * 0.44, ty = y + 11, tw = w * 0.3, th = h * 0.42;
                    rr(tx - 1, ty - 1, tw + 2, th + 2, 2, '#15101e');
                    rr(tx, ty, tw, th, 1.5, '#2a1a48');
                    ctx.strokeStyle = 'rgba(200,160,255,0.75)'; ctx.lineWidth = 0.6; ctx.beginPath();
                    ctx.rect(tx + 2, ty + 2, tw * 0.45, th * 0.5); ctx.arc(tx + tw * 0.72, ty + th * 0.35, th * 0.2, 0, Math.PI * 2);
                    ctx.moveTo(tx + 2, ty + th - 3); ctx.lineTo(tx + tw - 2, ty + th - 3); ctx.moveTo(tx + tw * 0.25, ty + th * 0.5 + 2); ctx.lineTo(tx + tw * 0.25, ty + th - 3);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(232,210,255,0.55)'; ctx.fillRect(tx + 0.5, ty + ((t * 6) % th), tw - 1, 0.8);
                    // Parts tray, a coil of copper wire
                    rr(x + 17, y + h - 13, 12, 8, 1, '#3a3844', '#5a5866', 0.6);
                    for (let i = 0; i < 6; i++) circ(x + 19.5 + (i % 3) * 3.5, y + h - 11 + (i / 3 | 0) * 3.5, 0.9, i % 2 ? A.brass : '#9aa0b0');
                    ctx.strokeStyle = '#c47a4a'; ctx.lineWidth = 0.9; for (const r of [4, 2.8, 1.6]) { ctx.beginPath(); ctx.arc(x + w - 9, y + 16, r, 0, Math.PI * 2); ctx.stroke(); }
                    // Soldering iron in its stand, the tip an ember
                    circ(x + w - 10, y + h - 9, 3.5, '#2a2a30', '#5a5e6a', 0.8);
                    ctx.strokeStyle = '#1a1a1e'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w - 10, y + h - 9); ctx.lineTo(x + w - 24, y + h - 13); ctx.stroke();
                    ctx.strokeStyle = '#a0a4b0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w - 24, y + h - 13); ctx.lineTo(x + w - 29, y + h - 14.5); ctx.stroke(); ctx.lineCap = 'butt';
                    circ(x + w - 29, y + h - 14.5, 1.2, `rgba(255,${140 + 60 * Math.sin(t * 7) | 0},70,1)`);
                    break;
                }
                case 'apt_sofa': {                                         // faces north: back along the bottom edge
                    shadow();
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
                    rr(x - 6, y - 4, w + 12, h + 8, 3, '#2b2224', 'rgba(239,230,220,0.35)', 1);
                    rr(x, y + 3, w, h - 6, 2, '#120c0c');
                    for (let i = 0; i < 6; i++) {
                        const fx = x + 5 + i * (w - 10) / 5, fl = 0.6 + 0.4 * Math.sin(t * 7 + i * 1.9);
                        ctx.fillStyle = `rgba(255,${140 + 60 * fl | 0},60,${0.55 + 0.35 * fl})`;
                        ctx.beginPath(); ctx.ellipse(fx, y + h / 2, 3.5, (h - 10) / 2 * fl, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'apt_side': case 'apt_nightstand': {
                    shadow(); rr(x, y, w, h, 5, A.walnut, A.walnutLt, 1);
                    lampShade(x + w * 0.42, y + h * 0.45, Math.min(w, h) * 0.3);
                    if (p.decorType === 'apt_nightstand') { ctx.fillStyle = A.brass; ctx.fillRect(x + w / 2 - 3, y + h - 3, 6, 1.5); }
                    break;
                }
                case 'apt_coffee': {
                    shadow(); rr(x, y, w, h, h / 2, A.walnut, A.walnutLt, 1);
                    rr(x + 5, y + 4, w - 10, h - 8, (h - 8) / 2, 'rgba(255,240,230,0.08)');
                    rr(x + 8, y + 8, 16, 11, 1, A.cream); rr(x + 10, y + 10, 16, 11, 1, A.blush);           // books
                    circ(x + w - 16, y + h / 2, 5, '#d8cbbd'); for (let i = 0; i < 5; i++) circ(x + w - 16 + Math.cos(i * 1.26) * 4, y + h / 2 + Math.sin(i * 1.26) * 4, 2.2, i % 2 ? A.blushLt : '#f3e3ea');   // vase of flowers
                    break;
                }
                case 'apt_chair': {
                    shadow(); rr(x, y, w, h, 12, A.blush);
                    rr(x + 5, y + 5, w - 10, h - 14, 9, '#e6c3c2'); rr(x + 3, y + h - 10, w - 6, 8, 4, '#b27a82');
                    break;
                }
                case 'apt_bookshelf': {
                    shadow(); rr(x, y, w, h, 2, A.walnut);
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
                    shadow(); rr(x, y, w, h, 2, A.walnut, A.walnutLt, 1);
                    ctx.fillStyle = '#2a2020'; ctx.fillRect(x + 6, y + 4, 26, h - 8); ctx.fillRect(x + w - 32, y + 4, 26, h - 8);   // speakers
                    ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 4; i++) { ctx.fillRect(x + 8, y + 6 + i * 3.5, 22, 1); ctx.fillRect(x + w - 30, y + 6 + i * 3.5, 22, 1); }
                    const cx = x + w / 2 - 6, cy = y + h / 2;                                           // turntable
                    circ(cx, cy, 9, A.ink); circ(cx, cy, 3, A.wineLt);
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, 6, t * 3.5, t * 3.5 + 1.2); ctx.stroke();
                    ctx.strokeStyle = A.brass; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx + 14, cy - 7); ctx.lineTo(cx + 5, cy + 2); ctx.stroke();
                    break;
                }
                case 'apt_plant': {
                    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
                    circ(cx + 2, cy + 2, r * 0.62, 'rgba(0,0,0,0.3)'); circ(cx, cy, r * 0.6, A.cream, A.creamDk, 1);
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + (x % 7), sway = Math.sin(t * 0.8 + i) * 0.05;
                        ctx.fillStyle = i % 2 ? A.leaf : A.leafLt;
                        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.26, a + sway, 0, Math.PI * 2); ctx.fill();
                    }
                    break;
                }
                case 'apt_floor_lamp': {
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 2, cy + 2, w / 2, 'rgba(0,0,0,0.25)'); circ(cx, cy, w / 2, A.cream, A.brass, 1.5); circ(cx, cy, w / 5, '#ffd9b0');
                    break;
                }
                case 'apt_fridge': {
                    shadow(); rr(x, y, w, h, 2, '#8e8986'); rr(x + 2, y + 2, w - 4, h - 4, 1.5, '#b6b1ad');
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
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 4, y + 4, w, h);
                    counterTop(x, y, w, h);
                    ctx.fillStyle = A.creamDk; ctx.fillRect(x, y, 6, h); ctx.fillRect(x + w - 6, y, 6, h);                   // waterfall edges
                    ctx.fillStyle = A.walnut; ctx.fillRect(x + 6, y + h - 4, w - 12, 4);
                    for (const u of [0.17, 0.5, 0.83]) { circ(x + w * u, y + h / 2, 7, A.brass, '#9a7c4a', 1); circ(x + w * u, y + h / 2, 3, '#ffe6c4'); }   // pendant shades above
                    rr(x + w * 0.62, y + 8, 14, 9, 2, A.wineLt); circ(x + w * 0.4, y + 12, 4, '#f3e3ea');                     // fruit bowl, glasses
                    break;
                }
                case 'apt_stool': {
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 1.5, cy + 1.5, w / 2, 'rgba(0,0,0,0.3)'); circ(cx, cy, w / 2, A.brass); circ(cx, cy, w / 2 - 2.5, A.wine);
                    break;
                }
                case 'apt_bed': {                                          // queen bed, headboard against the top wall
                    shadow(); rr(x - 2, y, w + 4, h, 5, A.walnut);
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
                    shadow(); rr(x, y, w, h, 2, A.walnut, A.walnutLt, 1);
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, y + h / 2 - 0.5, w - 4, 1);
                    ctx.fillStyle = A.brass; ctx.fillRect(x + 4, y + h / 2 - 6, 1.5, 5); ctx.fillRect(x + 4, y + h / 2 + 1, 1.5, 5);
                    break;
                }
                case 'apt_vanity': {                                       // against the east wall: round mirror, stool in front
                    shadow(); rr(x + 14, y, w - 14, h, 3, A.walnut, A.walnutLt, 1);
                    const mx = x + w - 6, my = y + h / 2;
                    circ(mx, my, 16, A.brass); circ(mx, my, 14, '#d9d6de');
                    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx - 2, my - 1, 8, 1.9, 4.2); ctx.stroke();   // the one crescent
                    circ(x + 20, y + 12, 2.5, A.blushLt); circ(x + 22, y + 20, 2, A.brass); rr(x + 18, y + h - 16, 8, 10, 2, '#f3e3ea');
                    circ(x + 5, y + h / 2, 8, A.blush, '#b27a82', 1);                                  // stool
                    break;
                }
                case 'apt_tub': {                                          // freestanding oval tub with petals
                    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, y + h / 2 + 3, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#f7f4f0'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#cfe0e6'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 7, h / 2 - 7, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 14 + Math.sin(t) * 2, h / 2 - 14, 0, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 3 ? A.blushLt : A.blush; ctx.beginPath(); ctx.ellipse(x + w * (0.25 + ((i * 37) % 50) / 100), y + h * (0.3 + ((i * 23) % 40) / 100), 2.6, 1.6, i, 0, Math.PI * 2); ctx.fill(); }
                    ctx.strokeStyle = A.brass; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + w - 2, y + h / 2); ctx.lineTo(x + w - 12, y + h / 2); ctx.stroke();
                    break;
                }
                case 'apt_bath_vanity': {                                  // double marble vanity against the south wall
                    shadow(); rr(x, y, w, h, 2, A.stone, '#c9c4c0', 1);
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
                    shadow(); rr(x, y, w, h, 4, A.walnut);
                    rr(x + 2, y + 2, w - 4, h - 4, 4, A.cream); rr(x + 3, y + 3, w - 6, 16, 4, '#fbf6f0');
                    rr(x + 1, y + h - 22, w - 2, 14, 3, A.blush);
                    break;
                }
                case 'apt_bistro': {
                    const cx = x + w / 2, cy = y + h / 2;
                    for (const s of [-1, 1]) { circ(cx + s * 24, cy + 2, 8, A.ink, A.brass, 1); }
                    circ(cx + 2, cy + 2, 13, 'rgba(0,0,0,0.3)'); circ(cx, cy, 13, A.stone, A.brass, 1.5);
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
                case 'apt_planter': {
                    shadow(); rr(x, y, w, h, 3, '#8c7f76', '#a79a90', 1); rr(x + 3, y + 3, w - 6, h - 6, 2, '#3a2a24');
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
            const shadow = (r = 4) => rr(x + 3, y + 3, w, h, r, 'rgba(0,0,0,0.32)');
            const flame = (fx, fy, s = 1, k = 0) => {                     // a candle: wax, then a breathing flame
                circ(fx, fy, 2.2 * s, C.bone);
                const f = 0.75 + 0.25 * Math.sin(t * 11 + fx * 0.3 + k);
                circ(fx, fy - 0.5, 1.6 * s * f, `rgba(255,${190 + 40 * f | 0},110,0.95)`);
            };
            switch (p.decorType) {
                case 'hod_candelabra': {                                  // wrought iron, five candles
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 2, cy + 2, w / 2, 'rgba(0,0,0,0.3)');
                    circ(cx, cy, w / 2 - 1, null, C.gold, 1.4);
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.beginPath();
                    ctx.moveTo(cx - w / 2 + 3, cy); ctx.lineTo(cx + w / 2 - 3, cy); ctx.moveTo(cx, cy - h / 2 + 3); ctx.lineTo(cx, cy + h / 2 - 3); ctx.stroke();
                    flame(cx, cy, 1.1); flame(cx - w / 2 + 3, cy, 0.9, 1); flame(cx + w / 2 - 3, cy, 0.9, 2); flame(cx, cy - h / 2 + 3, 0.9, 3); flame(cx, cy + h / 2 - 3, 0.9, 4);
                    break;
                }
                case 'hod_table': {                                       // oxblood table, gold inlay; a runner and candles when laid
                    shadow(5); rr(x, y, w, h, 5, C.wood, C.woodLt, 1.2);
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
                    shadow(3); rr(x, y, w, h, 3, C.crimson, C.wine, 1);
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
                    shadow(3); rr(x, y, w, h, 3, C.wood, C.woodLt, 1);
                    ctx.fillStyle = C.woodLt; ctx.fillRect(x + 2, y + h - 5, w - 4, 4);            // backrest
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 1; i < 4; i++) ctx.fillRect(x + i * w / 4, y + 2, 1, h - 7);
                    ctx.fillStyle = C.gold; ctx.fillRect(x - 1, y + 2, 2, h - 4); ctx.fillRect(x + w - 1, y + 2, 2, h - 4);
                    break;
                }
                case 'hod_organ': {                                       // gold pipes over a black console
                    shadow(3); rr(x, y, w, h, 3, C.ink, C.gold, 1);
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
                    shadow(4); rr(x, y, w, h, 3, C.marble, C.marbleLt, 1.5);
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
                    shadow(2); rr(x, y, w, h, 2, C.ink, C.gold, 0.8);
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
                    shadow(4); rr(x, y, w, h, 5, C.steel, C.steelLt, 1);
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
                    ctx.save(); ctx.translate(3, 3); ctx.fillStyle = 'rgba(0,0,0,0.32)';
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.55, y); ctx.bezierCurveTo(x + w, y, x + w, y + h * 0.4, x + w * 0.8, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); ctx.restore();
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
                    circ(cx + 3, cy + 3, w / 2, 'rgba(0,0,0,0.35)');
                    circ(cx, cy, w / 2, C.marble, C.gold, 1.5); circ(cx, cy, w / 2 - 5, C.marbleLt);
                    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 8, -2.4, -0.8); ctx.stroke();
                    break;
                }
                case 'hod_fountain': {                                    // a round basin, rain rippling, an obsidian spire
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx + 3, cy + 3, R, 'rgba(0,0,0,0.3)');
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
                    shadow(3); rr(x, y, w, h, 3, C.ink, C.gold, 1);
                    circ(x + w / 2, y + h / 2 + 2, w * 0.3, '#cfc8c0'); circ(x + w / 2, y + h / 2 - 2, w * 0.2, C.bone);
                    break;
                }
                case 'hod_coffin': {                                      // a hexagonal coffin under violet glass, gold cross-bands
                    const pts = [[0, 0.5], [0.18, 0], [0.8, 0.1], [1, 0.5], [0.8, 0.9], [0.18, 1]];
                    const path = (dx = 0, dy = 0) => { ctx.beginPath(); pts.forEach(([u, v], i) => ctx[i ? 'lineTo' : 'moveTo'](x + dx + u * w, y + dy + v * h)); ctx.closePath(); };
                    path(3, 3); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
                    path(); ctx.fillStyle = '#120a14'; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    const pulse = 0.6 + 0.4 * Math.sin(t * 1.7);
                    ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * pulse; ctx.fillStyle = C.violet;
                    ctx.beginPath(); ctx.ellipse(x + w * 0.52, y + h / 2, w * 0.3, h * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    ctx.fillStyle = C.gold; ctx.fillRect(x + w * 0.35, y + 4, 2, h - 8); ctx.fillRect(x + w * 0.2, y + h / 2 - 1, w * 0.6, 2);
                    break;
                }
                case 'hod_reliquary': {                                   // a glass case on a gold stand, a relic floating inside
                    shadow(3); rr(x, y, w, h, 3, C.ink, C.gold, 1.2);
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
            const shadow = (r = 5) => rr(x + 3, p.y + 4, w, h, r, floats ? `rgba(0,0,0,${0.22 - bob * 0.01})` : 'rgba(0,0,0,0.3)');
            if (floats) {                                                  // the hover-glow beneath
                ctx.save(); ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 3 + x);
                ctx.fillStyle = 'rgba(232,194,122,0.5)'; ctx.beginPath(); ctx.ellipse(x + w / 2, p.y + h / 2 + 2, w * 0.45, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            switch (p.decorType) {
                case 'dn_fountain': {                                      // black-marble basin, water sheeting down a glass column round a turning rift
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx + 3, cy + 4, R, 'rgba(0,0,0,0.35)');
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
                    ctx.save(); ctx.translate(3, 4); ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, y + h * 0.9, x + w, y); ctx.lineTo(x + w, y + h * 0.5); ctx.quadraticCurveTo(cx, y + h * 1.5, x, y + h * 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
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
                    shadow(10); rr(x, y, w, h, 10, C.velvet);
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
                    shadow(6); rr(x, y, w, h, 6, C.velvet);
                    rr(x + 2, y + (p.y < 950 ? h - 12 : 0), w - 4, 12, 5, '#4a0814'); rr(x, y + 4, 8, h - 8, 4, '#4a0814'); rr(x + w - 8, y + 4, 8, h - 8, 4, '#4a0814');
                    rr(x + 10, y + 8, w - 20, h - 20, 4, C.crimsonLt);
                    break;
                }
                case 'dn_table': {                                         // marble top on gold legs, champagne and a vase
                    shadow(h / 2); rr(x, y, w, h, h / 2, '#e9e4ea', C.gold, 2);
                    ctx.strokeStyle = 'rgba(120,110,130,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w - 12, y + 10); ctx.stroke();
                    circ(x + w * 0.3, y + h / 2, 3, 'rgba(255,240,200,0.9)', C.gold, 0.8); circ(x + w * 0.42, y + h / 2 + 3, 3, 'rgba(255,240,200,0.9)', C.gold, 0.8);   // flutes
                    circ(x + w * 0.72, y + h / 2, 6, C.ink, C.gold, 1); for (let i = 0; i < 5; i++) circ(x + w * 0.72 + Math.cos(i * 1.26) * 4, y + h / 2 + Math.sin(i * 1.26) * 4, 2, i % 2 ? '#e8b4b8' : C.crimsonLt);
                    break;
                }
                case 'dn_lamp': {                                          // a champagne-gold floor lamp
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 2, cy + 3, w / 2, 'rgba(0,0,0,0.3)'); circ(cx, cy, w / 2, C.cream, C.gold, 1.5); circ(cx, cy, w * 0.18, '#fff0c8');
                    break;
                }
                case 'dn_palm': {                                          // a potted palm in a gold urn
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 2, cy + 3, w / 2, 'rgba(0,0,0,0.3)'); circ(cx, cy, w * 0.32, C.ink, C.gold, 1.5);
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9 + Math.sin(t * 0.8 + i) * 0.04, L = w * 0.62;
                        ctx.strokeStyle = i % 2 ? C.leafLt : C.leaf; ctx.lineWidth = 4; ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * L * 0.6, cy + Math.sin(a + 0.3) * L * 0.6, cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
                    }
                    ctx.lineCap = 'butt';
                    break;
                }
                case 'dn_float_chaise': {                                  // a chaise hanging in the air, silver-edged
                    shadow(10); rr(x, y, w, h, 12, '#2a0a14', C.silver, 1.2);
                    rr(x + 4, y + 4, w * 0.3, h - 8, 8, C.crimsonLt); rr(x + w * 0.34, y + 6, w * 0.6, h - 12, 6, C.velvet);
                    ctx.fillStyle = 'rgba(223,230,255,0.25)'; ctx.fillRect(x + 12, y + 2, w - 24, 1);
                    break;
                }
                case 'dn_float_chair': {
                    shadow(8); rr(x, y, w, h, 8, '#2a0a14', C.gold, 1.2);
                    rr(x + 6, y + 6, w - 12, h - 12, 6, C.crimsonLt);
                    break;
                }
                case 'dn_lost_luggage': {                                  // a hard case; open (and empty) once searched
                    const open = p._searched;
                    shadow(3);
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
        function drawMiniSpree(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const hum = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 4, w, h, 4); ctx.fill();
            ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
            ctx.shadowColor = '#3ef0ff'; ctx.shadowBlur = 8 * hum;                               // neon edge
            ctx.strokeStyle = `rgba(62,240,255,${0.55 * hum})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke();
            ctx.shadowBlur = 0;
            // Marquee
            const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#3ef0ff');
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, 9, 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.max(5, Math.floor(w * 0.16))}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('MiniSpree', x + w / 2 + 2, y + 6.8);
            ctx.fillStyle = '#fff6b0'; ctx.beginPath(); const sx = x + 6, sy = y + 6.5;                // the little spark
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 1 : 2.6; ctx[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * r, sy + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
            // The window of cans: bubble tea, Jean soda, stellar lemonade
            const wx = x + 4, wy = y + 13, ww = w - 8, wh = h * 0.5;
            ctx.fillStyle = '#10141e'; ctx.fillRect(wx, wy, ww, wh);
            const cans = ['#c89a6a', '#3a6ad0', '#ffe45a'], cw = (ww - 8) / 3;
            for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
                const cx = wx + 2 + i * (cw + 2), cy = wy + 2 + row * (wh - 4) / 3;
                ctx.fillStyle = cans[i]; ctx.beginPath(); ctx.roundRect(cx, cy, cw, (wh - 4) / 3 - 2, 1.5); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx + 1, cy + 1, 1, (wh - 4) / 3 - 4);
            }
            ctx.fillStyle = `rgba(190,240,255,${0.10 * hum})`; ctx.fillRect(wx, wy, ww, wh);        // the window's light
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx + ww * 0.2, wy + wh); ctx.lineTo(wx + ww * 0.75, wy); ctx.stroke();   // glass glint
            // Keypad, card slot, pickup tray
            const ky = wy + wh + 3;
            ctx.fillStyle = '#3ef0ff'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 6 + (i % 3) * 4, ky + Math.floor(i / 3) * 4, 2, 2);
            ctx.fillStyle = '#e8c27a'; ctx.fillRect(x + w - 12, ky, 6, 2);
            ctx.fillStyle = '#ff4fa3'; ctx.fillRect(x + w - 12, ky + 4, 6, 1);
            ctx.fillStyle = '#050508'; ctx.beginPath(); ctx.roundRect(x + 5, y + h - 9, w - 10, 5, 1.5); ctx.fill();
            ctx.restore();
        }

        function drawHealthStation(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, t = _frameTime / 1000;
            const pulse = 0.7 + 0.3 * Math.sin(t * 2.5);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 4, w, h, 4); ctx.fill();
            ctx.fillStyle = '#eceef2'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
            ctx.strokeStyle = '#6a1a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 4); ctx.stroke();
            // The green cross, glowing
            const cx = x + w / 2, cy = y + 11, s = 5;
            ctx.shadowColor = '#00ff66'; ctx.shadowBlur = 10 * pulse;
            ctx.fillStyle = '#12c85a'; ctx.fillRect(cx - s, cy - s * 0.35, s * 2, s * 0.7); ctx.fillRect(cx - s * 0.35, cy - s, s * 0.7, s * 2);
            ctx.shadowBlur = 0;
            // A rack of stim vials, refilling
            const ry = y + 20, rh = h * 0.34, n = 5, vw = (w - 10) / n;
            ctx.fillStyle = '#d4d8de'; ctx.fillRect(x + 4, ry, w - 8, rh);
            for (let i = 0; i < n; i++) {
                const vx = x + 5 + i * vw, lvl = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.3));
                ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(vx + 0.5, ry + 2, vw - 2, rh - 4);
                ctx.fillStyle = '#19d46a'; ctx.fillRect(vx + 0.5, ry + 2 + (rh - 4) * (1 - lvl), vw - 2, (rh - 4) * lvl);
                ctx.fillStyle = '#6a1a2a'; ctx.fillRect(vx + 0.5, ry + 1, vw - 2, 1.5);
            }
            // Vitals readout: a trace running across a dark screen
            const sy = ry + rh + 3, sh = h - (sy - y) - 5;
            ctx.fillStyle = '#0a1410'; ctx.beginPath(); ctx.roundRect(x + 4, sy, w - 8, sh, 2); ctx.fill();
            ctx.strokeStyle = '#3cff8a'; ctx.lineWidth = 1; ctx.beginPath();
            const mid = sy + sh / 2, ph = (t * 30) % (w - 8);
            for (let i = 0; i <= w - 8; i += 1) {
                const k = (i + ph) % 24, beat = k > 8 && k < 11 ? -sh * 0.35 : k > 11 && k < 13 ? sh * 0.25 : 0;
                ctx[i ? 'lineTo' : 'moveTo'](x + 4 + i, mid + beat);
            }
            ctx.stroke();
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
            const shadow = (r = 4) => rr(x + 3, y + 4, w, h, r, 'rgba(0,0,0,0.36)');
            const tufts = (X, Y, W, H, n, m, col) => { ctx.fillStyle = col; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { ctx.beginPath(); ctx.arc(X + (i + 0.5) * W / n, Y + (j + 0.5) * H / m, 1.1, 0, Math.PI * 2); ctx.fill(); } };
            switch (p.decorType) {
                case 'mc_stage': {                                         // raised black stage, a gold lip, lavender LED strip on the front edge
                    shadow(6); rr(x, y, w, h, 6, C.lacquer, C.goldDk, 1.5);
                    ctx.strokeStyle = 'rgba(200,168,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath();
                    for (let px = x + 20; px < x + w; px += 20) { ctx.moveTo(px, y + 2); ctx.lineTo(px, y + h - 6); } ctx.stroke();
                    rr(x + 4, y + h - 6, w - 8, 3, 1.5, `rgba(200,168,255,${0.55 + 0.4 * pulse})`);
                    ctx.fillStyle = C.gold; ctx.fillRect(x + 2, y + h - 2, w - 4, 1.5);
                    // Crescent logo on the backdrop
                    ctx.save(); ctx.globalAlpha = 0.5; circ(x + w / 2, y + 16, 9, C.lavender); ctx.globalCompositeOperation = 'destination-out'; circ(x + w / 2 + 4, y + 14, 8, '#000'); ctx.restore();
                    break;
                }
                case 'mc_dj': {                                            // the booth: two decks, a mixer, a laptop, LED strip
                    shadow(4); rr(x, y, w, h, 4, '#120c18', C.chromeDk, 1);
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
                    shadow(3); rr(x, y, w, h, 3, '#141018', '#2e2838', 1.2);
                    const k = 1 + 0.08 * pulse;
                    for (const cy of [y + h * 0.33, y + h * 0.72]) { circ(x + w / 2, cy, w * 0.34 * k, '#1f1a26', C.chromeDk, 1); circ(x + w / 2, cy, w * 0.16 * k, '#0a080c'); circ(x + w / 2, cy, w * 0.05, C.chromeDk); }
                    circ(x + w / 2, y + 7, 3, '#2a2632', C.chromeDk, 0.6);
                    break;
                }
                case 'mc_pole': {                                          // a chrome pole on a lit plinth (the plinth ring is floor art; the glow in drawClubGlow)
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 2, cy + 3, 6, 'rgba(0,0,0,0.4)');
                    const g = ctx.createRadialGradient(cx - 1.5, cy - 1.5, 0.5, cx, cy, 5); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, C.chrome); g.addColorStop(1, C.chromeDk);
                    circ(cx, cy, 5, g); circ(cx, cy, 5, null, C.gold, 1);
                    break;
                }
                case 'mc_hightop': {                                       // round high-top: marble on a chrome ring, a cocktail, a candle
                    const cx = x + w / 2, cy = y + h / 2, R = w / 2;
                    circ(cx + 2, cy + 3, R, 'rgba(0,0,0,0.36)'); circ(cx, cy, R, C.marble, C.gold, 1.5);
                    ctx.strokeStyle = 'rgba(120,100,140,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx - R + 4, cy - 3); ctx.quadraticCurveTo(cx, cy + 4, cx + R - 5, cy - 6); ctx.stroke();
                    circ(cx - 4, cy + 2, 3.2, 'rgba(255,90,138,0.8)', C.chrome, 0.7); circ(cx + 5, cy - 3, 2.2, '#fff2d8');
                    break;
                }
                case 'mc_booth': {                                         // a curved velvet booth round a marble table; faces north
                    shadow(14);
                    ctx.fillStyle = C.velvetDk; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.quadraticCurveTo(x, y + h, x + 20, y + h); ctx.lineTo(x + w - 20, y + h); ctx.quadraticCurveTo(x + w, y + h, x + w, y + 10);
                    ctx.lineTo(x + w - 16, y + 10); ctx.quadraticCurveTo(x + w - 16, y + h - 16, x + w - 30, y + h - 16); ctx.lineTo(x + 30, y + h - 16); ctx.quadraticCurveTo(x + 16, y + h - 16, x + 16, y + 10); ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.stroke();
                    tufts(x + 24, y + h - 13, w - 48, 10, 6, 1, 'rgba(255,190,220,0.35)');
                    ctx.fillStyle = C.velvetLt; ctx.beginPath(); ctx.moveTo(x + 16, y + 10); ctx.quadraticCurveTo(x + 16, y + h - 16, x + 30, y + h - 16); ctx.lineTo(x + w - 30, y + h - 16); ctx.quadraticCurveTo(x + w - 16, y + h - 16, x + w - 16, y + 10);
                    ctx.lineTo(x + w - 26, y + 10); ctx.quadraticCurveTo(x + w - 26, y + h - 26, x + w - 36, y + h - 26); ctx.lineTo(x + 36, y + h - 26); ctx.quadraticCurveTo(x + 26, y + h - 26, x + 26, y + 10); ctx.closePath(); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(x + w / 2 + 2, y + 18, 26, 13, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 16, 26, 13, 0, 0, Math.PI * 2); ctx.fillStyle = C.marble; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.3; ctx.stroke();
                    circ(x + w / 2 - 8, y + 16, 2.8, 'rgba(255,240,200,0.9)', C.gold, 0.7); circ(x + w / 2 + 2, y + 13, 2.8, 'rgba(255,240,200,0.9)', C.gold, 0.7); circ(x + w / 2 + 12, y + 18, 2, '#fff2d8');
                    break;
                }
                case 'mc_backbar': {                                       // mirrored back bar: shelves of bottles, lit from beneath
                    shadow(2); rr(x, y, w, h, 2, '#150e1c', C.goldDk, 1);
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
                    shadow(10);
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
                    circ(cx + 2, cy + 3, w / 2, 'rgba(0,0,0,0.35)'); circ(cx, cy, w / 2, C.chromeDk, C.chrome, 1.2); circ(cx, cy, w / 2 - 3, C.velvetLt);
                    circ(cx - 2, cy - 2, 2.5, 'rgba(255,190,220,0.3)');
                    break;
                }
                case 'mc_coatcheck': {                                     // a lacquer counter, a bell, tickets; the coat rail behind
                    rr(x + 2, y - 14, w - 4, 10, 3, '#120c18');
                    ctx.strokeStyle = C.chromeDk; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, y - 9); ctx.lineTo(x + w - 6, y - 9); ctx.stroke();
                    const coats = ['#2a1a36', '#5a0c34', '#1e2a3a', '#3a3040', '#8a1a52', '#1a1a1e', '#4a3a60'];
                    for (let i = 0; i < 11; i++) rr(x + 8 + i * 12.5, y - 13, 9, 9, 3, coats[i % coats.length], 'rgba(255,255,255,0.08)', 0.6);
                    shadow(4); rr(x, y, w, h, 4, C.lacquerLt, C.gold, 1.5);
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
                    for (let i = 0; i < posts; i++) { const [px, py] = P(i); circ(px + 1.5, py + 2, 5, 'rgba(0,0,0,0.35)'); circ(px, py, 5, C.chromeDk, C.chrome, 1); circ(px, py, 2.4, C.gold); }
                    break;
                }
                case 'mc_bench': {                                         // a buttoned velvet bench on gold feet
                    shadow(8); rr(x, y, w, h, 8, C.velvet, C.gold, 1);
                    rr(x + 4, y + 4, w - 8, h - 8, 6, C.velvetLt); tufts(x + 6, y + 6, w - 12, h - 12, 7, 2, 'rgba(255,190,220,0.4)');
                    break;
                }
                case 'mc_orb': {                                           // a moon orb floating over a black plinth, turning slowly
                    const cx = x + w / 2, cy = y + h / 2, bob = Math.sin(t * 1.5 + x) * 2;
                    circ(cx + 2, cy + 3, w / 2, 'rgba(0,0,0,0.35)'); circ(cx, cy, w / 2, C.lacquer, C.goldDk, 1.2);
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
                    shadow(3); rr(x, y, w, h, 3, C.marble, C.goldDk, 1);
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
                    shadow(2);
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
                    rr(x + 2, y + 3, w, h, 6, 'rgba(0,0,0,0.3)');
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 2, y + h * 0.6); ctx.quadraticCurveTo(x + w / 2, y + h + 2, x + 2, y + h * 0.6); ctx.closePath();
                    ctx.fillStyle = C.porcelain; ctx.fill(); ctx.strokeStyle = C.marbleDk; ctx.lineWidth = 0.8; ctx.stroke();
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.5, w * 0.28, h * 0.28, 0, 0, Math.PI * 2); ctx.fillStyle = '#c8d4e8'; ctx.fill();
                    rr(x + w / 2 - 3, y + 1, 6, 3, 1, C.gold);
                    break;
                }
                case 'mc_dryer': {                                         // chrome hand dryer, a blue ready-light
                    shadow(3); rr(x, y, w, h, 4, C.chromeDk, C.chrome, 1);
                    if (d.vertical) { rr(x + 3, y + 6, w - 6, h - 12, 3, '#2a2e3a'); circ(x + w / 2, y + 4, 1.4, '#7fd0ff'); }
                    else { rr(x + 6, y + 3, w - 12, h - 6, 3, '#2a2e3a'); circ(x + 4, y + h / 2, 1.4, '#7fd0ff'); }
                    break;
                }
                case 'mc_settee': {                                        // a blush chaise, tufted, gold-footed (back against the east side)
                    shadow(10); rr(x, y, w, h, 12, '#c96a8e', C.gold, 1);
                    rr(x + w - 12, y + 4, 10, h - 8, 5, '#a84e72'); rr(x + 4, y + 4, w - 18, 20, 8, '#a84e72');
                    tufts(x + 6, y + 28, w - 20, h - 34, 2, 5, 'rgba(255,220,235,0.55)');
                    rr(x + 8, y + h - 34, 16, 12, 4, C.lilac);                   // a cushion
                    break;
                }
                case 'mc_crescent_sofa': {                                 // Mirabel's: a crescent of wine velvet, back to the north wall
                    rr(x + 3, y + 5, w, h, 30, 'rgba(0,0,0,0.36)');
                    ctx.fillStyle = C.velvetDk; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.quadraticCurveTo(x + w, y + h, x + w / 2, y + h); ctx.quadraticCurveTo(x, y + h, x, y); ctx.fill();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.fillStyle = C.velvetLt; ctx.beginPath(); ctx.moveTo(x + 14, y + 12); ctx.lineTo(x + w - 14, y + 12); ctx.quadraticCurveTo(x + w - 16, y + h - 12, x + w / 2, y + h - 10); ctx.quadraticCurveTo(x + 16, y + h - 12, x + 14, y + 12); ctx.fill();
                    ctx.fillStyle = C.velvet; ctx.beginPath(); ctx.moveTo(x + 30, y + 12); ctx.lineTo(x + w - 30, y + 12); ctx.quadraticCurveTo(x + w - 34, y + h - 26, x + w / 2, y + h - 24); ctx.quadraticCurveTo(x + 34, y + h - 26, x + 30, y + 12); ctx.fill();
                    tufts(x + 20, y + 3, w - 40, 7, 9, 1, 'rgba(255,190,220,0.45)');
                    rr(x + 40, y + 16, 18, 12, 5, C.gold); rr(x + w - 58, y + 16, 18, 12, 5, C.lilac);                 // cushions
                    break;
                }
                case 'mc_lowtable': {                                      // black glass on gold, champagne on ice, two flutes, rose petals
                    shadow(6); rr(x, y, w, h, 6, 'rgba(20,14,28,0.92)', C.gold, 1.5);
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
                    rr(x + 1.5, y + 2, w, h, 2, 'rgba(0,0,0,0.35)');
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
                    rr(x + 2, y + 3, w, h, 6, 'rgba(0,0,0,0.35)');
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
                    rr(x + 2, y + 3, w, h, 4, 'rgba(0,0,0,0.35)');
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
                    rr(x + 2, y + 3, w, h, 3, 'rgba(0,0,0,0.35)');
                    rr(x, y, w, h, 3, '#0e0c12', '#4a4458', 0.8);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 2, y + 2, w - 6, 1.2);           // the patent shine
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.9; ctx.setLineDash([1.5, 1]); ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.bezierCurveTo(x - 6, y + h + 6, x + w + 6, y + h + 6, x + w - 2, y + 2); ctx.stroke(); ctx.setLineDash([]);
                    if (open) rr(x + 2, y + 2, w - 4, h - 5, 2, '#2a2436');
                    else rr(x + w / 2 - 3, y + h * 0.35, 6, 3, 1, C.gold);
                    break;
                }
                case 'mc_suite_couch': {                                   // a long velvet couch, back against the east wall, facing west
                    shadow(12); rr(x, y, w, h, 12, C.velvetDk, C.gold, 1.2);
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
            c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(cx + 4, h - 1, w * 0.55, 5, 0, 0, Math.PI * 2); c.fill();
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
            const shadow = (r = 5) => rr(x + 3, y + 4, w, h, r, 'rgba(0,0,0,0.34)');
            const glass = (gx, gy, drunk) => { circ(gx, gy, 3, drunk ? 'rgba(255,240,220,0.35)' : 'rgba(150,20,40,0.85)', C.silver, 0.7); if (!drunk) circ(gx - 0.8, gy - 0.8, 0.8, 'rgba(255,200,210,0.6)'); };
            const candle = (cx, cy) => { circ(cx, cy, 2.2, C.cream, C.goldDk, 0.5); };
            switch (p.decorType) {
                case 'ps_console': {                                       // by the elevator: the visitor book, a crescent seal
                    shadow(3); rr(x, y, w, h, 3, C.ink, C.gold, 1.2);
                    rr(x + 5, y + 10, w - 10, 22, 1, C.cream, C.goldDk, 0.6); ctx.fillStyle = C.crimson; ctx.fillRect(x + w / 2 - 0.5, y + 10, 1, 22);
                    ctx.strokeStyle = 'rgba(40,20,30,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + 7, y + 14 + i * 4); ctx.lineTo(x + w / 2 - 2, y + 14 + i * 4); } ctx.stroke();
                    circ(x + w / 2, y + h - 18, 5, C.crimsonLt, '#5a0a18', 0.8); ctx.save(); circ(x + w / 2, y + h - 18, 2.6, '#ffd0d8'); ctx.globalCompositeOperation = 'destination-out'; circ(x + w / 2 + 1.2, y + h - 18.6, 2.3, '#000'); ctx.restore();
                    break;
                }
                case 'ps_pit_sofa': {                                      // one half of the round crimson pit, curving about the table
                    const up = d.face === 'N', cx = x + w / 2;
                    ctx.save(); ctx.translate(3, 4); ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath();
                    if (up) { ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, y + h * 1.9, x + w, y); ctx.lineTo(x + w - 18, y); ctx.quadraticCurveTo(cx, y + h * 1.1, x + 18, y); }
                    else { ctx.moveTo(x, y + h); ctx.quadraticCurveTo(cx, y - h * 0.9, x + w, y + h); ctx.lineTo(x + w - 18, y + h); ctx.quadraticCurveTo(cx, y - h * 0.1, x + 18, y + h); }
                    ctx.fill(); ctx.restore();
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
                    ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, y + h / 2 + 4, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fill();
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fillStyle = C.marble; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.strokeStyle = 'rgba(223,230,255,0.2)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 12, y + 14); ctx.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w - 10, y + 16); ctx.stroke();
                    circ(x + w / 2, y + h / 2, 4, '#1e3a24', C.gold, 0.8); glass(x + w / 2 - 14, y + h / 2 + 6, true); glass(x + w / 2 + 15, y + h / 2 - 4, false);
                    rr(x + w - 22, y + h - 16, 12, 8, 1, C.cream);                                                   // a folded note
                    break;
                }
                case 'ps_piano': {                                         // a silver-lacquered grand, lid up, a page of music left open
                    const P = new Path2D(); P.moveTo(x, y + 8); P.lineTo(x + w * 0.55, y + 8); P.bezierCurveTo(x + w * 0.9, y + 6, x + w, y + h * 0.45, x + w * 0.8, y + h * 0.75);
                    P.bezierCurveTo(x + w * 0.6, y + h, x + w * 0.2, y + h, x + 6, y + h - 6); P.closePath();
                    ctx.save(); ctx.translate(3, 4); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(P); ctx.restore();
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
                    shadow(3); rr(x, y, w, h, 3, C.marbleLt, C.gold, 1.5);
                    rr(x + 16, y + 6, w - 32, h - 12, 3, '#0a0608');
                    for (let i = 0; i < 7; i++) { const f = 0.6 + 0.4 * Math.sin(t * 6 + i * 1.9); circ(x + 26 + i * (w - 52) / 6, y + h / 2 + Math.sin(i) * 3, 3 + f * 1.5, `rgba(255,${90 + 60 * f | 0},40,${0.55 + 0.35 * f})`); }
                    for (const [px, py, r] of [[x + 38, y + 12, 0.3], [x + w - 52, y + 15, -0.4]]) { ctx.save(); ctx.translate(px, py); ctx.rotate(r); rr(0, 0, 12, 8, 1, '#3a2a20'); ctx.fillStyle = 'rgba(255,120,40,0.6)'; ctx.fillRect(0, 7, 12, 1); ctx.restore(); }
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 12, y + h - 3); ctx.lineTo(x + w - 12, y + h - 3); ctx.stroke();
                    break;
                }
                case 'ps_bar': {                                           // black lacquer bar against the west wall, a wine wall behind
                    shadow(3); rr(x, y, w, h, 3, '#140e14', C.gold, 1.2);
                    for (let j = 0; j < 12; j++) for (let i = 0; i < 2; i++) circ(x + 8 + i * 9, y + 10 + j * 15, 3, j % 3 ? '#4a0c1c' : '#1e3a24', 'rgba(0,0,0,0.5)', 0.5);
                    rr(x + w - 14, y + 4, 12, h - 8, 2, C.marble, C.goldDk, 0.6);
                    glass(x + w - 8, y + 40, false); glass(x + w - 8, y + h - 50, true); circ(x + w - 8, y + h / 2, 3.6, '#e8f0ff', C.silver, 0.8);   // a decanter
                    break;
                }
                case 'ps_dining': {                                        // a marble table for two: candles, the plates, one glass drunk and one not
                    shadow(8); rr(x, y, w, h, 8, '#ece8ee', C.gold, 2);
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
                    shadow(5); rr(x, y, w, h, 5, C.velvet, C.gold, 1);
                    const bk = f === 'E' ? [x, y + 2, 7, h - 4] : f === 'W' ? [x + w - 7, y + 2, 7, h - 4] : f === 'N' ? [x + 2, y + h - 7, w - 4, 7] : [x + 2, y, w - 4, 7];
                    rr(...bk, 3, '#4a0814'); rr(x + 5, y + 5, w - 10, h - 10, 4, C.crimsonLt);
                    break;
                }
                case 'ps_bed': {                                           // canopy king: black posts, crimson drapes, the covers thrown back
                    shadow(6); rr(x, y, w, h, 6, '#140e14', C.gold, 1.5);
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
                    shadow(10); rr(x, y, w, h, 12, '#3a0a1c', C.gold, 1);
                    rr(x + 4, y + 4, 22, h - 8, 9, C.velvet); rr(x + 28, y + 6, w - 34, h - 12, 7, C.crimsonLt);
                    rr(x + 40, y + 12, 18, 14, 5, C.gold);                                                          // a cushion
                    break;
                }
                case 'ps_desk': {                                          // his writing desk: chess mid-game, a crescent seal, candle stubs, the 10/10 card
                    shadow(4); rr(x, y, w, h, 4, '#2a1a1e', C.gold, 1.4);
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
                    shadow(3); rr(x, y, w, h, 3, '#140e14', C.gold, 1.2);
                    rr(x + 4, y + 4, w - 8, h - 8, 2, '#0a070a');
                    ctx.strokeStyle = C.silverDk; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2, y + h - 6); ctx.stroke();
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; for (let i = 0; i < 7; i++) { const hy = y + 14 + i * 19; ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, hy + 3); ctx.lineTo(x + w / 2, hy); ctx.lineTo(x + w / 2 + 9, hy + 3); ctx.stroke(); }
                    rr(x + w - 2, y + 6, 14, h * 0.45, 2, '#1a1216', C.goldDk, 0.8); rr(x + w - 2, y + h * 0.52, 14, h * 0.45, 2, '#1a1216', C.goldDk, 0.8);   // the doors swung out
                    break;
                }
                case 'ps_suitcase': {                                      // his monogrammed case, left open; rifled once searched today
                    const rifled = p._searched;
                    shadow(3); rr(x, y, w, h, 3, '#3a2418', C.gold, 1);
                    rr(x - 1, y - h * 0.62, w + 2, h * 0.6, 3, '#4a2e1e', C.gold, 1);                                // the open lid
                    ctx.fillStyle = C.gold; ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D·M', x + w / 2, y - h * 0.32);
                    rr(x + 3, y + 3, w - 6, h - 6, 2, '#6a1020');                                                     // crimson lining
                    if (!rifled) { rr(x + 6, y + 6, 18, 12, 2, '#f4efe8'); rr(x + 26, y + 8, 18, 10, 2, '#1a1a22'); ctx.fillStyle = C.crimsonLt; ctx.beginPath(); ctx.moveTo(x + 10, y + h - 6); ctx.lineTo(x + 40, y + h - 10); ctx.lineTo(x + 40, y + h - 7); ctx.closePath(); ctx.fill(); circ(x + 16, y + h - 12, 1.3, C.gold); circ(x + 20, y + h - 12, 1.3, C.gold); }
                    else { rr(x + 8, y + h + 2, 20, 8, 2, '#f4efe8', 'rgba(0,0,0,0.3)', 0.5); ctx.fillStyle = C.crimsonLt; ctx.fillRect(x + w - 6, y + h - 2, 14, 2.5); }   // shirts tipped out
                    break;
                }
                case 'ps_tub': {                                           // a round marble tub, rose petals floating
                    circ(x + w / 2 + 3, y + h / 2 + 4, w / 2, 'rgba(0,0,0,0.3)'); circ(x + w / 2, y + h / 2, w / 2, '#f4f2f6', C.gold, 1.5);
                    circ(x + w / 2, y + h / 2, w / 2 - 7, '#b8d0e8');
                    for (let i = 0; i < 8; i++) { const a = i * 0.8 + t * 0.05, r = 10 + (i * 7) % 22; ctx.fillStyle = i % 2 ? '#c42a52' : '#e04a6e'; ctx.beginPath(); ctx.ellipse(x + w / 2 + Math.cos(a) * r, y + h / 2 + Math.sin(a) * r, 2.6, 1.6, a, 0, Math.PI * 2); ctx.fill(); }
                    rr(x + w / 2 - 4, y - 1, 8, 6, 2, C.gold);                                                        // the spout
                    break;
                }
                case 'ps_vanity': {                                        // a marble vanity along the east wall, a basin, a perfume
                    shadow(2); rr(x, y, w, h, 2, '#f0ecf2', C.goldDk, 1);
                    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, 7, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#d8dce8'; ctx.fill(); ctx.strokeStyle = C.silverDk; ctx.lineWidth = 0.6; ctx.stroke();
                    circ(x + w / 2, y + 10, 2.6, '#e8b4c8', C.gold, 0.5); circ(x + w / 2, y + h - 10, 2.2, C.gold);
                    break;
                }
                case 'ps_pool': {                                          // the plunge pool: tiled edge, water with a slow ripple
                    shadow(10); rr(x, y, w, h, 10, '#d8d0c4', C.gold, 1.2);
                    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#1e5a7a'); g.addColorStop(1, '#0e2a44');
                    rr(x + 6, y + 6, w - 12, h - 12, 7, g);
                    ctx.strokeStyle = 'rgba(160,230,255,0.35)'; ctx.lineWidth = 0.8;
                    for (let k = 0; k < 5; k++) { ctx.beginPath(); for (let i = 0; i <= 20; i++) { const px = x + 10 + i * (w - 20) / 20, py = y + 14 + k * (h - 28) / 4 + Math.sin(i * 0.9 + t * 1.6 + k) * 2; ctx[i ? 'lineTo' : 'moveTo'](px, py); } ctx.stroke(); }
                    ctx.strokeStyle = C.silver; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + w - 18, y + 3); ctx.lineTo(x + w - 18, y + 14); ctx.moveTo(x + w - 12, y + 3); ctx.lineTo(x + w - 12, y + 14); ctx.stroke();   // the ladder
                    break;
                }
                case 'ps_lounger': {                                       // a white lounger, a folded towel
                    shadow(6); rr(x, y, w, h, 6, '#e8e4dc', C.goldDk, 1);
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
                    circ(cx + 4, cy + 5, R, 'rgba(0,0,0,0.4)');
                    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 2, cx, cy, R); g.addColorStop(0, '#8a8290'); g.addColorStop(0.7, '#4a4452'); g.addColorStop(1, '#2a2630');
                    circ(cx, cy, R, g, '#1a161e', 1.2);
                    ctx.strokeStyle = 'rgba(20,16,24,0.45)'; ctx.lineWidth = 0.8;
                    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke(); }
                    circ(cx, cy, R * 0.5, '#6a6272', 'rgba(200,180,255,0.18)', 1);
                    moss(cx + R * 0.3, cy + R * 0.4, 7, R * 0.5);
                    break;
                }
                case 'sc_fallen': {                                        // a toppled column in pieces across the aisle
                    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 4, y + 6, w, h);
                    const seg = (sx, sw, tilt) => { ctx.save(); ctx.translate(sx + sw / 2, y + h / 2); ctx.rotate(tilt); const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#7a7282'); g.addColorStop(0.5, '#5a5262'); g.addColorStop(1, '#2e2a34'); rr(-sw / 2, -h / 2, sw, h, 6, g, '#1a161e', 1); ctx.strokeStyle = 'rgba(20,16,24,0.4)'; ctx.lineWidth = 0.7; for (let k = -sw / 2 + 6; k < sw / 2; k += 7) { ctx.beginPath(); ctx.moveTo(k, -h / 2 + 3); ctx.lineTo(k, h / 2 - 3); ctx.stroke(); } ctx.restore(); };
                    seg(x, w * 0.45, -0.06); seg(x + w * 0.5, w * 0.5, 0.08);
                    for (let i = 0; i < 6; i++) circ(x + w * 0.47 + (i % 3) * 3 - 3, y + h + 3 + (i / 3 | 0) * 3, 2, '#4a4452');   // rubble
                    moss(x + w * 0.2, y + h * 0.4, 6, 8);
                    break;
                }
                case 'sc_pew': case 'sc_pew_broken': {                     // a dark wooden pew; the broken ones snapped and splintered
                    const broken = p.decorType === 'sc_pew_broken';
                    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 4, w, h);
                    const wood = (X, W) => { rr(X, y, W, h, 2, '#2e1e1a', '#140c0a', 1); rr(X + 2, y + 2, W - 4, 7, 1.5, '#3e2822'); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = y + 12; k < y + h - 2; k += 4) { ctx.moveTo(X + 2, k); ctx.lineTo(X + W - 2, k); } ctx.stroke(); };
                    if (!broken) wood(x, w);
                    else { wood(x, w * 0.45); ctx.save(); ctx.translate(x + w * 0.72, y + h / 2); ctx.rotate(0.35); wood(-w * 0.25, w * 0.45); ctx.restore(); ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w * 0.45, y + 2); ctx.lineTo(x + w * 0.5, y + 6); ctx.lineTo(x + w * 0.45, y + 10); ctx.stroke(); }
                    break;
                }
                case 'sc_altar': {                                         // black stone, a crimson cloth, a gold chalice, candles guttering
                    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 4, y + 6, w, h);
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
                    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 5, w, h);
                    rr(x, y + h * 0.55, w, h * 0.45, 2, '#241c1a', '#8a6a3a', 1);
                    for (let i = 0; i < 11; i++) { const px = x + 5 + i * (w - 10) / 10, r = 3.2 - Math.abs(i - 5) * 0.18, bentOff = (i === 3 || i === 8) ? 1 : 0; const g = ctx.createRadialGradient(px - 1, y + 10 - 1, 0.5, px, y + 10, r); g.addColorStop(0, '#d8d0c0'); g.addColorStop(1, '#6a5a3a'); if (!bentOff) circ(px, y + 10 + Math.abs(i - 5) * 1.2, r, g, '#3a2e1e', 0.6); }
                    ctx.save(); ctx.translate(x + w * 0.35, y + h * 0.3); ctx.rotate(1.1); rr(-2, 0, 4, 22, 2, '#8a7a5a', '#3a2e1e', 0.6); ctx.restore();   // a fallen pipe
                    break;
                }
                case 'sc_candles': {                                       // an iron stand of pillar candles, wax spilled
                    circ(x + w / 2 + 2, y + h / 2 + 3, w / 2 + 2, 'rgba(0,0,0,0.4)');
                    circ(x + w / 2, y + h / 2, w / 2 + 1, '#1a161a', '#4a4452', 1);
                    ctx.fillStyle = 'rgba(230,221,208,0.5)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 3, y + h / 2 + 5, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill();
                    for (const [dx, dy, k] of [[-4, -3, 0], [4, -2, 1], [0, 4, 2]]) flame(x + w / 2 + dx, y + h / 2 + dy, k);
                    break;
                }
                case 'sc_brazier': {                                       // an iron bowl of coals on three legs, burning
                    const cx = x + w / 2, cy = y + h / 2;
                    circ(cx + 3, cy + 4, w / 2, 'rgba(0,0,0,0.4)');
                    ctx.strokeStyle = '#2a2630'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.5; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (w / 2 + 3), cy + Math.sin(a) * (w / 2 + 3)); } ctx.stroke();
                    circ(cx, cy, w / 2 - 2, '#1a161a', '#6a5a4a', 1.5);
                    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i % 3) * 3.5 + 2, f = 0.6 + 0.4 * Math.sin(t * 7 + i * 1.9); circ(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6 + f, `rgba(255,${80 + 90 * f | 0},30,${0.6 + 0.35 * f})`); }
                    break;
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
                this.decor = { face: config.face, vertical: !!config.vertical, candles: !!config.candles, variant: config.variant | 0 };   // House pieces: facing, wall run, lit
                this.noNav = !!config.noNav;                     // thin wall pieces paths needn't route round
                this.patient = !!config.patient;
                this.noteId = config.noteId || null;
                if (config.label) this.label = config.label;                   // what the action pill names it
                if (config.lootLines) { this.lootMin = config.lootMin; this.lootMax = config.lootMax; this.lootLines = config.lootLines; }   // lost things (searchLostLuggage)
                this.roomId = config.roomId || null;  // For light switches: which room this controls
                this._switchState = true;  // Light switch: true = lights ON
                this.angularFriction = 0.9;  // Rotation slows down over time
                
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
                
                // Keep w/h in sync for legacy compatibility
                this.w = this.width;
                this.h = this.height;
            }
            
            /**
             * Handle player pushing this prop
             */
            handlePlayerPush(player) {
                const center = this.getCenter();
                const dist = Math.hypot(center.x - player.x, center.y - player.y);
                const pushRadius = Math.max(this.width, this.height) / 2 - 5;
                
                if (dist < pushRadius) {
                    const dx = center.x - player.x;
                    const dy = center.y - player.y;
                    const len = Math.hypot(dx, dy) || 1;
                    
                    // FIX: Define a push force (e.g., 20) and divide by mass
                    // Heavier objects (mass 50,000) will result in tiny, imperceptible velocity
                    const pushForce = 20; 
                    const acceleration = pushForce / (this.mass || 1); 
            
                    this.vx += (dx / len) * acceleration;
                    this.vy += (dy / len) * acceleration;
                }
            }
            
            draw(ctx) {
                if (!this.visible) return;
                
                ctx.save();
                const center = this.getCenter();
                ctx.translate(center.x, center.y);
                ctx.rotate(this.angle);
                
                ctx.fillStyle = this.color;
                
                if (this.decorType) {
                    ctx.rotate(-this.angle);
                    ctx.translate(-center.x, -center.y);
                    drawClinicDecorProp(ctx, this);
                } else if (this.interactionType === 'medbay_refill') {
                    ctx.rotate(-this.angle);
                    ctx.translate(-center.x, -center.y);
                    drawHealthStation(ctx, this);
                } else if (this.interactionType === 'armory') {
                    // === ARMORY LOCKER (wall-mounted weapons rack) ===
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
                    ctx.translate(-center.x, -center.y);
                    drawMiniSpree(ctx, this);
                } else if (this.interactionType === 'bed_sleep') {
                    // --- NEW: SMALLER BED RENDERER ---
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
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
                    ctx.rotate(-this.angle);
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

