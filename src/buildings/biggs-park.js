        // Biggs: a lacquer-and-brass fairground pavilion. The original footprint and door
        // remain authoritative. All busy ornament is baked in its own bounded plane.
        const BIGGS = { wine: '#692735', dark: '#23131f', cream: '#ead8b1', brass: '#bc945b',
            gold: '#ffe0a0', teal: '#426e75', ink: '#111a23', rose: '#e5a29a' };
        const BiggsArt = {
            cabin(wheel, i, color) {
                const cabins=wheel._biggsCabins || (wheel._biggsCabins=[]);
                if(cabins[i] && cabins[i].color===color)return cabins[i].cv;
                const cv=document.createElement('canvas');cv.width=96;cv.height=112;
                const c=cv.getContext('2d');c.scale(4,4);
                const g=c.createLinearGradient(0,0,24,22);
                g.addColorStop(0,lightenHex(color,35));g.addColorStop(.5,color);g.addColorStop(1,darkenHex(color,45));
                BiggsArt.box(c,2,2,20,24,g,'#d2b689',5,.45);
                BiggsArt.box(c,3,6,18,11,'#182b37','#cbb686',3,.35);
                c.fillStyle='#6d7d7b';c.fillRect(5,8,6,6);c.fillStyle='#b4aa86';c.fillRect(13,8,6,6);
                c.fillStyle='rgba(228,246,237,.35)';c.fillRect(5,8,13,1);
                c.fillStyle='#cbb686';c.fillRect(11.5,6,1,11);
                BiggsArt.box(c,0,1,24,4,darkenHex(color,25),'#e2c797',2,.4);
                c.fillStyle='#e5c899';c.fillRect(4,23,16,1);
                BiggsArt.title(c,String(i+1).padStart(2,'0'),12,20,3.5,'#f4e4bf');
                cabins[i]={color,cv};return cv;
            },
            box(c, x, y, w, h, fill, stroke, r = 0, strokeWidth = 1.2) {
                c.beginPath(); c.roundRect(x, y, w, h, r);
                if (fill) { c.fillStyle = fill; c.fill(); }
                if (stroke) { c.strokeStyle = stroke; c.lineWidth = strokeWidth; c.stroke(); }
            },
            star(c, x, y, r, color) {
                c.fillStyle = color; c.beginPath();
                for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, d = i % 2 ? r * .42 : r;
                    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
                    if (i) c.lineTo(px, py); else c.moveTo(px, py);
                } c.closePath(); c.fill();
            },
            title(c, text, x, y, size, color, script = false) {
                c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
                c.font = script ? `${size}px "Great Vibes", cursive` : `${size}px Orbitron, monospace`;
                c.fillText(text, x, y);
            },
            // One sprite per car; paint and number changes refresh it, motion never does.
            bumper(c, car) {
                const L = car.length, W = car.vehicleWidth;
                const key = [L, W, car.bodyColor, car.bumperColor, car.labelChar].join('|');
                let s = car._biggsPaint;
                if (!s || s.key !== key) {
                    const cv = document.createElement('canvas'), pad = 8, d = 2;
                    cv.width = Math.ceil((L + pad * 2) * d); cv.height = Math.ceil((W + pad * 2) * d);
                    const p = cv.getContext('2d'); p.setTransform(d, 0, 0, d, (L / 2 + pad) * d, (W / 2 + pad) * d);
                    const B = BiggsArt.box;
                    B(p, -L/2-2, -W/2+1, L+7, W+7, 'rgba(0,0,0,.35)', null, 11);
                    const rubber = p.createLinearGradient(0,-W/2-3,0,W/2+3);
                    rubber.addColorStop(0,lightenHex(car.bumperColor,18));rubber.addColorStop(.5,'#121519');rubber.addColorStop(1,'#34363a');
                    B(p,-L/2-3,-W/2-3,L+6,W+6,rubber,'#55565a',10);
                    B(p,-L/2-1,-W/2-1,L+2,W+2,null,'#96918a',8);
                    const lacquer=p.createLinearGradient(0,-W/2,0,W/2);
                    lacquer.addColorStop(0,lightenHex(car.bodyColor,32));lacquer.addColorStop(.25,car.bodyColor);
                    lacquer.addColorStop(.68,darkenHex(car.bodyColor,20));lacquer.addColorStop(1,darkenHex(car.bodyColor,60));
                    B(p,-L/2+1,-W/2+1,L-2,W-2,lacquer,BIGGS.brass,7);
                    // Open cockpit, upholstered seat and chrome steering hoop; front is +x.
                    B(p,-L*.3,-W*.32,L*.46,W*.64,'#11131b','#9d8d78',4);
                    B(p,-L*.27,-W*.27,L*.15,W*.54,'#592733','#945b58',2);
                    p.strokeStyle='#c4baa6';p.lineWidth=1.2;p.beginPath();p.ellipse(L*.1,0,2.5,W*.2,0,0,Math.PI*2);p.stroke();
                    B(p,L*.25,-W*.25,L*.17,W*.5,'#172a36','#8fadae',3);
                    p.fillStyle='rgba(220,244,238,.35)';p.fillRect(L*.27,-W*.22,1.5,W*.3);
                    p.strokeStyle='rgba(255,239,201,.65)';p.lineWidth=.8;p.beginPath();
                    p.moveTo(-L*.35,-W*.4);p.lineTo(L*.34,-W*.4);p.stroke();
                    for(const y of [-W*.33,W*.33]){B(p,L/2-3,y-1.8,3,3.6,'#fff1c4','#a27d4d',1);B(p,-L/2+1,y-1.6,2.4,3.2,'#e65e62',null,1);}
                    // Distinct driver identifier lives on the hood, never hidden by a roof.
                    BiggsArt.title(p,car.labelChar,L*.31,0,6,'#fff3d5');
                    s=car._biggsPaint={key,cv,x:-L/2-pad,y:-W/2-pad,w:cv.width/d,h:cv.height/d};
                }
                c.drawImage(s.cv,s.x,s.y,s.w,s.h);
            }
        };


        // ── Biggs on the tiered kit (buildings/tiered-kit.js) ─────────────────────────────────────────────
        // The pavilion under its striped canvas roof stands three floors high in wine lacquer, brass pilasters
        // between arched windows lit warm, a bulb row under the eave; out of its roof the glazed lantern rises
        // under the brass star. The entrance block in front is lower: the grand arch with the door, ringed with
        // marquee bulbs, mirror panels under stars either side, the Biggs marquee on its roof as before.
        const BG_PLAN = { W: 450, D: 400, PAV: 34, ENT: 24, LANTERN: [172, 78, 106, 94], LANT: 10 };
        const _bgFontsReady = () => !document.fonts || (document.fonts.check('36px "Great Vibes"') && document.fonts.check('12px Orbitron'));
        const _bgFront = (t) => t.mitre.find(e => e && !e.hidden && e.ny > 0.99);

        /** An arch path: x0..x1 wide, from bottom yb up to the top of its round head at yt */
        const _bgArch = (c, x0, x1, yt, yb) => { const r = (x1 - x0) / 2, xc = x0 + r; c.beginPath(); c.moveTo(x0, yb); c.lineTo(x0, yt + r); c.arc(xc, yt + r, r, Math.PI, 0); c.lineTo(x1, yb); c.closePath(); };

        /** Wine lacquer: a brass cornice with a bulb row under it, brass pilasters, a cream dado and a dark plinth */
        function _bgLacquer(d, l, t, H, L, opt = {}) {
            const T = BIGGS;
            const g = d.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7a3a44'); g.addColorStop(1, '#3a1d27'); d.fillStyle = g; d.fillRect(0, 0, L, H);
            d.fillStyle = T.brass; d.fillRect(0, 0, L, 2.2); d.fillStyle = '#f0d39a'; d.fillRect(0, 0, L, 0.5); d.fillStyle = '#6a4a2a'; d.fillRect(0, 2.2, L, 0.5);
            for (let x = 2; x < L; x += 5) { d.fillStyle = '#c7a377'; d.beginPath(); d.arc(x, 4, 0.75, 0, Math.PI * 2); d.fill(); l.fillStyle = '#ffe4ac'; l.beginPath(); l.arc(x, 4, 0.9, 0, Math.PI * 2); l.fill(); }
            d.fillStyle = T.cream; d.fillRect(0, H - 5.2, L, 1.2); d.fillStyle = '#2a141d'; d.fillRect(0, H - 4, L, 4);
            d.fillStyle = 'rgba(188,148,91,.5)'; d.fillRect(0, H - 4, L, 0.4);
            for (const e of t.mitre) {
                if (!e || e.hidden || (opt.skip && opt.skip(e))) continue;
                const n = Math.max(1, Math.round(e.L / 24));
                for (let i = 0; i <= n; i++) { const x = e.u0 + e.L * i / n; d.fillStyle = T.brass; d.fillRect(x - 0.7, 5.5, 1.4, H - 11); d.fillStyle = 'rgba(255,236,190,.35)'; d.fillRect(x - 0.7, 5.5, 0.4, H - 11); }
                if (opt.windows === false) continue;
                for (let i = 0; i < n; i++) {
                    const xc = e.u0 + e.L * (i + 0.5) / n, w = Math.min(11, e.L / n * 0.5), x0 = xc - w / 2, x1 = xc + w / 2, yt = 7, yb = H - 7.5;
                    if (yb - yt < w) continue;
                    _bgArch(d, x0 - 1, x1 + 1, yt - 1, yb + 0.6); d.fillStyle = T.cream; d.fill();
                    _bgArch(d, x0, x1, yt, yb); d.fillStyle = '#13232b'; d.fill();
                    d.save(); _bgArch(d, x0, x1, yt, yb); d.clip(); d.fillStyle = 'rgba(200,235,230,.12)'; d.fillRect(x0, yt, w * 0.35, yb - yt);
                    d.fillStyle = 'rgba(255,200,130,.12)'; d.fillRect(x0, yt, w, yb - yt); d.restore();
                    d.strokeStyle = T.brass; d.lineWidth = 0.4; d.beginPath(); d.moveTo(xc, yt); d.lineTo(xc, yb); d.moveTo(x0, yt + w / 2); d.lineTo(x1, yt + w / 2); d.stroke();
                    BiggsArt.star(d, xc, yt - 2.6, 1.3, T.brass);
                    if ((i * 5 + Math.round(e.u0)) % 4 !== 0) {
                        l.save(); _bgArch(l, x0, x1, yt, yb); l.clip(); const lg = l.createLinearGradient(0, yt, 0, yb); lg.addColorStop(0, 'rgba(255,190,120,.7)'); lg.addColorStop(1, 'rgba(255,220,160,.95)');
                        l.fillStyle = lg; l.fillRect(x0, yt, w, yb - yt); l.fillStyle = '#000'; l.fillRect(xc - 0.2, yt, 0.4, yb - yt); l.fillRect(x0, yt + w / 2 - 0.2, w, 0.4); l.restore();
                    }
                }
            }
        }

        /** The pavilion's walls */
        const _bgPavilion = (d, l, t, H, L) => _bgLacquer(d, l, t, H, L);

        /** The entrance block: lacquer, and on its front the grand arch (the door) ringed with bulbs, mirror panels either side */
        function _bgEntrance(d, l, t, H, L) {
            const T = BIGGS, e = _bgFront(t);
            _bgLacquer(d, l, t, H, L, { skip: (m) => m === e });
            if (!e) return;
            const X = (px) => e.u0 + (px - 50), cx = X(225);                     // (the block starts at plan x 50)
            for (let i = 0; i <= 7; i++) { const x = e.u0 + e.L * i / 7; if (Math.abs(x - cx) < 30) continue; d.fillStyle = T.brass; d.fillRect(x - 0.7, 5.5, 1.4, H - 11); }
            for (const s of [-1, 1]) for (const px of [110, 165]) {                // mirror panels under stars
                const x0 = X(s < 0 ? px : 450 - px) - 9, x1 = x0 + 18, yt = 7, yb = H - 6;
                d.fillStyle = T.cream; d.fillRect(x0 - 0.8, yt - 0.8, 19.6, yb - yt + 1.6);
                const mg = d.createLinearGradient(x0, yt, x1, yb); mg.addColorStop(0, '#5a6a72'); mg.addColorStop(0.5, '#2a3a44'); mg.addColorStop(1, '#46525a'); d.fillStyle = mg; d.fillRect(x0, yt, 18, yb - yt);
                d.fillStyle = 'rgba(255,255,255,.18)'; d.beginPath(); d.moveTo(x0 + 2, yt); d.lineTo(x0 + 7, yt); d.lineTo(x0 + 2, yt + 6); d.closePath(); d.fill();
                BiggsArt.star(d, x0 + 9, (yt + yb) / 2, 3.2, T.brass);
                l.fillStyle = 'rgba(255,200,140,.25)'; l.fillRect(x0, yt, 18, yb - yt);
            }
            // the grand arch: brass frame, wine doors with a star on each leaf, a fanlight; bulbs round it
            const aw = 44, x0 = cx - aw / 2, x1 = cx + aw / 2, yt = 1.2, yb = H;
            _bgArch(d, x0 - 3, x1 + 3, yt - 1, yb); d.fillStyle = T.brass; d.fill();
            _bgArch(d, x0 - 1.4, x1 + 1.4, yt + 0.2, yb); d.fillStyle = '#2a141d'; d.fill();
            _bgArch(d, x0, x1, yt + 1.6, yb); const fg = d.createLinearGradient(0, yt, 0, yb); fg.addColorStop(0, '#31424a'); fg.addColorStop(1, '#13232b'); d.fillStyle = fg; d.fill();
            const spring = yt + 1.6 + aw / 2;
            d.fillStyle = T.wine; d.fillRect(x0 + 2, spring, aw / 2 - 2.4, yb - spring); d.fillRect(cx + 0.4, spring, aw / 2 - 2.4, yb - spring);
            d.strokeStyle = T.brass; d.lineWidth = 0.5; d.strokeRect(x0 + 2, spring, aw / 2 - 2.4, yb - spring); d.strokeRect(cx + 0.4, spring, aw / 2 - 2.4, yb - spring);
            for (const sx of [cx - aw / 4, cx + aw / 4]) BiggsArt.star(d, sx, spring + (yb - spring) * 0.45, 3, T.brass);
            d.strokeStyle = T.brass; d.lineWidth = 0.4; d.beginPath(); for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; d.moveTo(cx, spring); d.lineTo(cx + Math.cos(a) * aw / 2, spring + Math.sin(a) * aw / 2); } d.stroke();
            l.save(); _bgArch(l, x0, x1, yt + 1.6, spring + 0.4); l.clip(); const lg = l.createRadialGradient(cx, spring, 0, cx, spring, aw / 2); lg.addColorStop(0, 'rgba(255,230,180,1)'); lg.addColorStop(1, 'rgba(255,180,120,.5)'); l.fillStyle = lg; l.fillRect(x0, yt, aw, spring - yt + 1);
            l.fillStyle = '#000'; for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; l.save(); l.translate(cx, spring); l.rotate(a); l.fillRect(0, -0.2, aw / 2, 0.4); l.restore(); } l.restore();
            for (let k = 0; k <= 16; k++) {                                          // the marquee bulbs round the arch
                const a = Math.PI + k * Math.PI / 16, r = aw / 2 + 2.2, bx = cx + Math.cos(a) * r, by = spring + Math.sin(a) * r;
                d.fillStyle = '#f0d39a'; d.beginPath(); d.arc(bx, by, 0.75, 0, Math.PI * 2); d.fill();
                l.fillStyle = '#ffe4ac'; l.beginPath(); l.arc(bx, by, 1, 0, Math.PI * 2); l.fill();
            }
            for (const s of [-1, 1]) for (let y = spring + 2; y < yb - 1; y += 3.2) { const bx = cx + s * (aw / 2 + 2.2); d.fillStyle = '#f0d39a'; d.beginPath(); d.arc(bx, y, 0.75, 0, Math.PI * 2); d.fill(); l.fillStyle = '#ffe4ac'; l.beginPath(); l.arc(bx, y, 1, 0, Math.PI * 2); l.fill(); }
        }

        /** The lantern: glass between brass mullions, lit warm */
        function _bgLantern(d, l, t, H, L) {
            const T = BIGGS;
            d.fillStyle = '#314952'; d.fillRect(0, 0, L, H);
            d.fillStyle = 'rgba(223,244,234,.14)'; d.fillRect(0, 0, L, H * 0.4);
            l.fillStyle = 'rgba(255,214,150,.85)'; l.fillRect(0, 0, L, H);
            d.fillStyle = T.brass; l.fillStyle = '#000';
            for (let x = 0; x < L; x += 6) { d.fillRect(x - 0.5, 0, 1, H); l.fillRect(x - 0.5, 0, 1, H); }
            d.fillRect(0, 0, L, 1.4); d.fillRect(0, H - 1.4, L, 1.4); l.fillRect(0, 0, L, 1.4); l.fillRect(0, H - 1.4, L, 1.4);
        }

        // ── roofs (world coordinates, each in its tier's plane; ox, oy: the building's corner) ──

        /** The pavilion's canvas: radial stripes shaded to the eaves, bulbs round its edge (emissive: the bulbs) */
        function _bgPavRoof(p, glow, t) {
            const x = t.box[0], y = t.box[1], T = BIGGS, B = BiggsArt.box;
            if (!glow) {
                B(p, x, y, 450, 250, T.wine, T.brass, 7);
                p.save(); p.beginPath(); p.roundRect(x + 6, y + 6, 438, 238, 4); p.clip();
                const edges = [];
                for (let xx = 0; xx <= 450; xx += 37.5) edges.push([xx, 0]);
                for (let yy = 31.25; yy <= 250; yy += 31.25) edges.push([450, yy]);
                for (let xx = 412.5; xx >= 0; xx -= 37.5) edges.push([xx, 250]);
                for (let yy = 218.75; yy >= 0; yy -= 31.25) edges.push([0, yy]);
                for (let i = 0; i < edges.length; i++) {
                    const a = edges[i], b = edges[(i + 1) % edges.length]; p.fillStyle = i % 2 ? T.wine : T.cream;
                    p.beginPath(); p.moveTo(x + 225, y + 125); p.lineTo(x + a[0], y + a[1]); p.lineTo(x + b[0], y + b[1]); p.closePath(); p.fill();
                }
                const g = p.createRadialGradient(x + 208, y + 108, 12, x + 225, y + 125, 235);
                g.addColorStop(0, 'rgba(255,238,206,.24)'); g.addColorStop(.45, 'rgba(36,10,20,.12)'); g.addColorStop(1, 'rgba(20,7,18,.64)');
                p.fillStyle = g; p.fillRect(x, y, 450, 250); p.restore();
            }
            p.fillStyle = glow ? '#ffe4ac' : '#c7a377'; p.beginPath();
            for (let xx = 16; xx < 450; xx += 19) { p.moveTo(x + xx + 1.8, y + 10); p.arc(x + xx, y + 10, 1.8, 0, Math.PI * 2); p.moveTo(x + xx + 1.8, y + 239); p.arc(x + xx, y + 239, 1.8, 0, Math.PI * 2); }
            for (let yy = 29; yy < 235; yy += 19) for (const xx of [10, 440]) { p.moveTo(x + xx + 1.8, y + yy); p.arc(x + xx, y + yy, 1.8, 0, Math.PI * 2); }
            p.fill();
        }

        /** The lantern's cap: brass-rimmed glass, the star (emissive: lit from inside) */
        function _bgLanternRoof(p, glow, t) {
            const [x, y, x1, y1] = t.box, w = x1 - x, h = y1 - y, T = BIGGS, B = BiggsArt.box;
            if (glow) { p.fillStyle = 'rgba(255,214,150,.35)'; p.beginPath(); p.roundRect(x + 9, y + 7, w - 18, h - 24, 18); p.fill(); return; }
            B(p, x, y, w, h, '#311d29', T.brass, 20);
            B(p, x + 9, y + 7, w - 18, h - 24, '#314952', '#d1ad75', 18);
            p.strokeStyle = 'rgba(223,244,234,.25)'; p.beginPath(); p.moveTo(x + 18, y + 18); p.lineTo(x + 79, y + 18); p.lineTo(x + 91, y + 39); p.stroke();
            BiggsArt.star(p, x + w / 2, y + 42, 24, T.brass);
        }

        /** The entrance block's roof: the striped deck and the Biggs marquee (emissive: its lettering and stars) */
        function _bgEntRoof(p, glow, t) {
            const x = t.box[0] - 50, y = t.box[1] - 250, T = BIGGS, B = BiggsArt.box;
            if (!glow) {
                B(p, x + 51, y + 250, 348, 149, '#3e2530', T.brass, 5);
                for (let yy = 266; yy < 390; yy += 13) { p.fillStyle = yy % 2 ? '#502733' : '#47232e'; p.fillRect(x + 58, y + yy, 334, 5); }
                B(p, x + 85, y + 289, 280, 84, '#1f1821', T.brass, 13);
                B(p, x + 91, y + 295, 268, 72, null, '#8e5b59', 10);
            }
            BiggsArt.title(p, 'Biggs', x + 225, y + 324, 46, glow ? '#ffe2ad' : T.cream, true);
            BiggsArt.title(p, 'A M U S E M E N T   P A R K', x + 225, y + 354, 8, glow ? '#eec8ac' : T.brass);
            for (const dx of [110, 340]) BiggsArt.star(p, x + dx, y + 326, 8, glow ? '#f5c381' : T.brass);
        }

        class BiggsParkBuilding extends TieredBuilding {
            _setupSign() { this.attachedSign = null; }
            _generateLights() {
                // Small door lanterns and pavilion accents, instead of an orange flood over the whole roof.
                for (const [dx,dy,color,r] of [[65,255,'#e3a69b',125],[385,255,'#e3a69b',125],
                    [125,405,'#ffcf91',140],[325,405,'#ffcf91',140]])
                    this.attachedLights.push(new LampEntity({x:this.x+dx,y:this.y+dy,lampType:3,color,lightRadius:r}));
                this.topReach = 120; this.glowReach = 120;
            }
            _layer(c,key,x,y,w,h,paint,k=1) {
                // A fallback font must not be retained when fonts finish loading.
                const ready = !document.fonts || (document.fonts.check('36px "Great Vibes"') && document.fonts.check('12px Orbitron'));
                if (!ready) { c.save(); LandmarkKit.plane(c,k); paint(c); c.restore(); return; }
                const s=LandmarkKit.sprite(this,key,this.x+x,this.y+y,w,h,1,paint);
                LandmarkKit.drawSprite(c,s,k);
            }
            drawBase(c) {
                this._layer(c,'biggs_ground',-35,-20,520,525,p=>{
                    const x=this.x,y=this.y,B=BiggsArt.box,T=BIGGS;
                    p.fillStyle='rgba(0,0,0,.36)';p.fillRect(x+12,y+15,450,250);p.fillRect(x+62,y+265,350,150);
                    B(p,x+65,y+400,320,84,'#29242b',T.brass,4);
                    p.strokeStyle='rgba(220,192,151,.14)';p.lineWidth=1;p.beginPath();
                    for(let xx=80;xx<385;xx+=24){p.moveTo(x+xx,y+401);p.lineTo(x+xx,y+483);}p.stroke();
                    B(p,x+172,y+400,106,80,T.wine,T.brass,2);
                    p.strokeStyle='#9e6f5c';p.strokeRect(x+179,y+408,92,64);
                    BiggsArt.star(p,x+225,y+443,16,T.brass);
                    // Ticket booths flank a clear central path. Painted dressing has no new colliders.
                    for(const dx of [89,305]){
                        B(p,x+dx+3,y+421,59,39,'rgba(0,0,0,.3)',null,4);
                        B(p,x+dx,y+416,56,36,'#4a2730',T.brass,3);
                        B(p,x+dx+5,y+421,46,20,'#13232b','#82795e',2);
                        p.fillStyle=T.cream;p.fillRect(x+dx+4,y+444,48,4);
                        BiggsArt.title(p,'TICKETS',x+dx+28,y+432,7,T.gold);
                    }
                    BiggsArt.title(p,'AMUSEMENTS  •  AFTER DARK',x+225,y+477,7,T.cream);
                });
            }
            /** Over her: the tiers (the kit). The marquee's lettering (on the roof) waits for its fonts: baked before they load, the roofs are baked again once they have. */
            drawTop(c) {
                if (!this._bgFonts && _bgFontsReady()) { this._bgFonts = true; this._lkSprites = {}; }
                super.drawTop(c);
            }
            drawSign() {} // The marquee is part of the roof's cached plane.
        }
        TierKit.profile(BiggsParkBuilding);

        /** Biggs: x, y its corner; the pavilion and the entrance block in front of it front south. */
        function createBiggsPark(x, y, config = {}) {
            const T = BIGGS, Pl = BG_PLAN, brass = (z, out) => ({ z, out, th: 2.4, top: '#c7a377', band: [120, 90, 56], lip: '#f0d39a' });
            return new BiggsParkBuilding({
                id: 'biggs_park', x, y, label: 'Biggs Park', type: 'entertainment', facing: 'S', hero: 1.5, plan: { W: Pl.W, D: Pl.D },
                roofColor: '#1a0a28', roofLightColor: '#220e32', wallColor: T.wine, wallLightColor: '#7a3a44', accentColor: '#ff8800',
                windowColor: '#0a0410', windowLitColor: '#ff8800', windowFrameColor: '#0c0616', balconies: [], roofProps: [],
                sign: { text: 'BIGGS', color: '#ff8800', size: 32 },
                door: { target: config.doorTarget || 'biggs_arena', label: 'Enter Biggs Amusement Park', lightColor: '#ff8800' },
                tiers: [
                    { id: 'pavilion', rect: [0, 0, 450, 250], z0: 0, z1: Pl.PAV, S: 2, fill: T.wine, paint: _bgPavilion, shade: [24, 8, 14],
                      ledges: [brass(Pl.PAV, 3)], roofRes: 1, roofGlow: true, roof: _bgPavRoof },
                    { id: 'lantern', on: 'pavilion', solid: false, rect: Pl.LANTERN, z0: Pl.PAV, z1: Pl.PAV + Pl.LANT, S: 3, fill: '#314952', paint: _bgLantern, shade: [24, 8, 14],
                      ledges: [brass(Pl.PAV + Pl.LANT, 2)], roofRes: 1, roofGlow: true, roof: _bgLanternRoof },
                    { id: 'entrance', rect: [50, 250, 350, 150], z0: 0, z1: Pl.ENT, S: 3, fill: T.wine, paint: _bgEntrance, shade: [24, 8, 14],
                      ledges: [brass(Pl.ENT, 3)], roofRes: 1, roofGlow: true, roof: _bgEntRoof }
                ],
                ...config
            });
        }

