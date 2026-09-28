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

        function drawClinicDecorProp(ctx, p) {
            if (p.decorType.startsWith('apt_')) return drawApartmentDecorProp(ctx, p);
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
                this.patient = !!config.patient;
                this.noteId = config.noteId || null;
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
                    // === STIM REFILL STATION (rectangular, green + white cross) ===
                    ctx.rotate(-this.angle);
                    ctx.translate(-center.x, -center.y);
                    
                    const mx = this.x, my = this.y, mw = this.width, mh = this.height;
                    
                    // Black back casing
                    ctx.fillStyle = '#111';
                    ctx.fillRect(mx, my, mw, mh);
                    
                    // Green front panel (inset)
                    ctx.fillStyle = '#0a4f0a';
                    ctx.fillRect(mx + 3, my + 3, mw - 6, mh - 6);
                    
                    // Animated green glow
                    const stimPulse = 0.7 + Math.sin(_frameTime / 400) * 0.3;
                    ctx.shadowColor = '#00ff44';
                    ctx.shadowBlur = 18 * stimPulse;
                    ctx.fillStyle = `rgba(0, 255, 68, ${0.15 * stimPulse})`;
                    ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4);
                    
                    // White cross (centered)
                    const crossW = Math.min(mw, mh) * 0.35;
                    const crossH = crossW * 0.25;
                    const ccx = mx + mw / 2, ccy = my + mh / 2;
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(ccx - crossW / 2, ccy - crossH / 2, crossW, crossH);
                    ctx.fillRect(ccx - crossH / 2, ccy - crossW / 2, crossH, crossW);
                    ctx.shadowBlur = 0;
                    
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
                    // === VENDING MACHINE (rectangular, white front, black back, "minispree") ===
                    ctx.rotate(-this.angle);
                    ctx.translate(-center.x, -center.y);
                    
                    const vx = this.x, vy = this.y, vw = this.width, vh = this.height;
                    
                    // Black back casing
                    ctx.fillStyle = '#0a0a0a';
                    ctx.fillRect(vx, vy, vw, vh);
                    
                    // White front panel (inset)
                    ctx.fillStyle = '#e8e8e8';
                    ctx.fillRect(vx + 3, vy + 3, vw - 6, vh - 6);
                    
                    // Product display window (dark inset)
                    ctx.fillStyle = '#1a1a2a';
                    ctx.fillRect(vx + 5, vy + 5, vw - 10, vh * 0.5);
                    
                    // Animated bluish-white glow
                    const vendPulse = 0.8 + Math.sin(_frameTime / 300) * 0.2;
                    ctx.shadowColor = '#ccddff';
                    ctx.shadowBlur = 14 * vendPulse;
                    ctx.fillStyle = `rgba(200, 220, 255, ${0.12 * vendPulse})`;
                    ctx.fillRect(vx + 4, vy + 4, vw - 8, vh * 0.55);
                    ctx.shadowBlur = 0;
                    
                    // "minispree" text
                    ctx.font = `bold ${Math.max(6, Math.floor(vw * 0.18))}px Montserrat, sans-serif`;
                    ctx.fillStyle = '#00bbff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('minispree', vx + vw / 2, vy + vh * 0.75);
                    ctx.textAlign = 'left';
                    
                    // Coin slot detail
                    ctx.fillStyle = '#555';
                    ctx.fillRect(vx + vw - 10, vy + vh * 0.6, 4, 8);
                    
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

