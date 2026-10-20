        // The Demoness Palace: its floor (painted once), its glow after the darkness, and its decor
        // (dp_*). Obsidian and gold, crimson silk, ember light. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js); the decor drawer is a plain
        // function that entities/props-decor.js dispatches to.

        const PALACE = { obsidian: '#0b0509', obsidianHi: '#1c0d16', gold: '#ffc64b', goldDim: 'rgba(255,190,58,0.65)', blood: '#7a0618',
                      crimson: '#b0122e', ember: '#ff6a3a', bone: '#e9d8c6', thorn: '#2a0e12', rose: '#c0143e', water: '#14060c' };

        // Shared palace ornament: flowing channels, leaf-like mineral facets, no inherited religious emblem.
        function palaceCrystalCrest(c,r) {
            c.strokeStyle='rgba(255,194,61,.95)';c.lineWidth=1.5;c.beginPath();
            for(let i=0;i<6;i++){
                const a=i*Math.PI/3,cs=Math.cos(a),sn=Math.sin(a);
                c.moveTo(cs*r*.24,sn*r*.24);
                c.bezierCurveTo(Math.cos(a-.42)*r*.57,Math.sin(a-.42)*r*.57,
                    Math.cos(a+.32)*r*.81,Math.sin(a+.32)*r*.81,cs*r,sn*r);
            }c.stroke();
            c.strokeStyle='rgba(255,183,47,.42)';c.lineWidth=1;c.beginPath();c.ellipse(0,0,r+8,r+8,0,.12,Math.PI*1.8);c.stroke();
            c.fillStyle='#c60b38';c.strokeStyle='#ffd36a';c.lineWidth=1.3;
            c.beginPath();c.moveTo(0,-r*.48);c.lineTo(r*.22,0);c.lineTo(0,r*.48);c.lineTo(-r*.22,0);c.closePath();c.fill();c.stroke();
            c.fillStyle='#ff4560';c.beginPath();c.moveTo(0,-r*.4);c.lineTo(0,r*.29);c.lineTo(-r*.14,-1);c.closePath();c.fill();
        }

        function palaceFlowers(p) {
            if(p._palaceFlowers)return p._palaceFlowers;
            const rnd=seededRandom((p.x*31+p.y)|0),out=[],count=Math.max(12,Math.floor(p.width*p.height/280));
            const cols=Math.max(2,Math.round(Math.sqrt(count*p.width/p.height))),rows=Math.ceil(count/cols);
            for(let i=0;i<count;i++)out.push({x:8+((i%cols)+.2+rnd()*.6)*(p.width-16)/cols,
                y:7+(Math.floor(i/cols)+.2+rnd()*.6)*(p.height-14)/rows,r:3+rnd()*2,a:rnd()*6.28,blood:i%4===0});
            return p._palaceFlowers=out;
        }

        function palaceFlowerGlow(c,p,t) {
            if(!p._flowerGlow){
                const cv=document.createElement('canvas');cv.width=Math.ceil(p.width+24);cv.height=Math.ceil(p.height+24);
                const g=cv.getContext('2d');
                for(const f of palaceFlowers(p))if(f.blood){
                    const x=f.x+12,y=f.y+12,halo=g.createRadialGradient(x,y,0,x,y,11);
                    halo.addColorStop(0,'rgba(255,65,90,.88)');halo.addColorStop(.25,'rgba(255,10,55,.52)');halo.addColorStop(1,'rgba(190,0,45,0)');
                    g.fillStyle=halo;g.fillRect(x-11,y-11,22,22);
                    g.strokeStyle='rgba(255,38,82,.9)';g.lineWidth=.7;g.beginPath();
                    for(let j=0;j<6;j++){const a=f.a+j*Math.PI/3;g.moveTo(x,y);g.ellipse(x+Math.cos(a)*2.6,y+Math.sin(a)*2.6,2.4,1.2,a,0,Math.PI*2);}g.stroke();
                    g.fillStyle='#ffd89a';g.beginPath();g.arc(x,y,.9,0,Math.PI*2);g.fill();
                }p._flowerGlow=cv;
            }
            c.save();c.globalAlpha*=.82+.12*Math.sin(t*1.4+p.x*.01);c.drawImage(p._flowerGlow,p.x-12,p.y-12);c.restore();
        }

        engineMixin({
            drawPalaceInterior(ctx) {
                if (!this._palaceFloor) this._palaceFloor = this._paintPalaceFloor();
                ctx.drawImage(this._palaceFloor, 0, 0);
            },

            _paintPalaceFloor() {
                const cv=document.createElement('canvas');cv.width=1800;cv.height=1400;
                const c=cv.getContext('2d'),r=seededRandom(666);
                const box=(x,y,w,h,col,edge,rad=0)=>{c.beginPath();c.roundRect(x,y,w,h,rad);c.fillStyle=col;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=1;c.stroke();}};
                const slabs=(x,y,w,h,size,base)=>{
                    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
                    for(let yy=y;yy<y+h;yy+=size)for(let xx=x;xx<x+w;xx+=size){
                        const v=r()*7|0;c.fillStyle=`rgb(${base[0]+v},${base[1]+v},${base[2]+v})`;c.fillRect(xx,yy,size,size);
                    }
                    c.strokeStyle='rgba(226,191,135,.15)';c.lineWidth=.8;c.beginPath();
                    for(let xx=x;xx<=x+w;xx+=size){c.moveTo(xx,y);c.lineTo(xx,y+h);}
                    for(let yy=y;yy<=y+h;yy+=size){c.moveTo(x,yy);c.lineTo(x+w,yy);}c.stroke();
                    c.strokeStyle='rgba(220,175,175,.08)';c.lineWidth=.7;
                    for(let i=0;i<w*h/7500;i++){
                        let xx=x+r()*w,yy=y+r()*h;c.beginPath();c.moveTo(xx,yy);
                        for(let j=0;j<4;j++){xx+=(r()-.3)*45;yy+=(r()-.5)*35;c.lineTo(xx,yy);}c.stroke();
                    }c.restore();
                };
                const carpet=(y,h)=>{
                    box(840,y,120,h,'#930922','#ffc64b',3);box(848,y+4,104,h-8,'#c80e34','#da9639',2);
                    const sheen=c.createLinearGradient(850,0,950,0);sheen.addColorStop(0,'rgba(18,5,20,.25)');sheen.addColorStop(.48,'rgba(255,83,97,.18)');sheen.addColorStop(1,'rgba(18,5,20,.25)');
                    c.fillStyle=sheen;c.fillRect(850,y+5,100,h-10);
                    c.strokeStyle='rgba(255,204,86,.85)';c.lineWidth=1;c.beginPath();
                    for(let yy=y+24;yy<y+h-12;yy+=38)for(const side of [-1,1]){
                        const x=900+side*43;c.moveTo(x,yy+12);c.quadraticCurveTo(x-side*14,yy,x,yy-12);
                        c.moveTo(x,yy);c.lineTo(x-side*8,yy-4);
                    }c.stroke();
                };
                box(0,0,1800,1400,'#19121d');
                // Polished plum-black stone in the main route; matte dusk stone in the hunting lanes.
                slabs(600,380,600,606,60,[29,20,31]);slabs(600,1000,600,386,60,[34,23,34]);
                slabs(14,380,572,606,64,[42,31,43]);slabs(1214,380,572,606,64,[42,31,43]);
                slabs(900,14,486,352,48,[34,23,40]);slabs(1400,14,386,352,44,[43,25,25]);
                // Pale route margins give the red velvet readable edges even in deep shadow.
                for(const y of [760,1000]){
                    const h=y===760?226:386;box(821,y,158,h,'#6d5b63');carpet(y,h);
                    c.strokeStyle='rgba(246,220,184,.3)';c.lineWidth=1;c.strokeRect(825,y+1,150,h-2);
                }
                for(const [x,y,w,h] of [[618,398,564,570],[32,398,536,570],[1232,398,536,570]]){
                    c.strokeStyle='rgba(211,173,118,.26)';c.lineWidth=1;c.strokeRect(x,y,w,h);
                }
                // Six flowing gold channels and a ruby focus: an original mineral/organic crest.
                c.save();c.translate(900,535);palaceCrystalCrest(c,90);c.restore();
                // The Blood Garden: silver-veined earth, soft moss and curved ivory paths.
                box(14,14,872,352,'#252029');
                for(let i=0;i<1300;i++){
                    const x=18+r()*862,y=18+r()*342;c.fillStyle=i%3?'rgba(70,86,66,.25)':'rgba(156,101,112,.13)';
                    c.fillRect(x,y,1+r()*3,1+r()*3);
                }
                const paths=[[[330,366],[330,285],[363,230],[417,205]],[[745,366],[745,258],[570,270],[484,212]],
                    [[886,190],[735,170],[586,184],[495,190]],[[450,14],[466,67],[420,92],[444,145]]];
                for(const a of paths){
                    c.beginPath();c.moveTo(...a[0]);c.bezierCurveTo(...a[1],...a[2],...a[3]);
                    c.strokeStyle='#51424b';c.lineWidth=47;c.lineCap='round';c.stroke();
                    c.strokeStyle='#ae9b94';c.lineWidth=37;c.stroke();c.strokeStyle='rgba(248,223,195,.32)';c.lineWidth=1;c.stroke();
                }
                c.strokeStyle='rgba(228,193,160,.25)';c.lineWidth=1;
                for(let yy=20;yy<360;yy+=25){c.beginPath();c.moveTo(429,yy);c.lineTo(465,yy+3);c.stroke();}
                // Fountain terrace and a few petals carried beyond the raised beds.
                c.fillStyle='#8a7579';c.beginPath();c.ellipse(450,190,75,67,0,0,Math.PI*2);c.fill();
                c.strokeStyle='#edbc5c';c.lineWidth=1.5;c.stroke();
                for(let i=0;i<95;i++){c.fillStyle=i%4?'#b90d32':'#fa3258';c.beginPath();c.ellipse(100+r()*720,25+r()*310,1.2+r()*1.5,.7+r(),r()*3,0,Math.PI*2);c.fill();}
                // Crystal chamber: inlaid channels converge toward a floating mineral focus.
                c.save();c.translate(1145,180);palaceCrystalCrest(c,109);c.restore();
                for(const x of [925,1360])for(const y of [40,332])box(x-8,y-8,16,16,'#71545f','#cda77f',4);
                // Dressing room: deep silk with a pearl border. Kennels retain their dark recesses.
                box(14,1000,572,386,'#452037');box(34,1020,532,346,'#4e253b','#ac846c',5);
                slabs(1214,1000,572,386,52,[26,20,26]);
                for(let i=0;i<220;i++){
                    c.strokeStyle='rgba(190,157,109,.12)';c.lineWidth=1;const x=1230+r()*540,y=1120+r()*250;
                    c.beginPath();c.moveTo(x,y);c.lineTo(x+r()*10,y+r()*6);c.stroke();
                }
                // Matching petal-shaped threshold inlays frame the deliberately unlit side galleries.
                for(const x of [600,1200])for(const y of [625,738]){
                    c.save();c.translate(x,y);c.strokeStyle='#9f7c76';c.lineWidth=1;
                    c.beginPath();c.moveTo(-13,0);c.quadraticCurveTo(0,-8,13,0);c.quadraticCurveTo(0,8,-13,0);c.stroke();c.restore();
                }
                return cv;
            },

            /** After the darkness: braziers, the red moon, the embers, the fountain, drifting sparks */
            drawPalaceGlow(ctx) {
                const t = _frameTime / 1000, glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props || []) {
                    if (!p.decorType || !p.decorType.startsWith('dp_')) continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, f = 0.8 + 0.2 * Math.sin(t * 9 + cx);
                    if (p.decorType === 'dp_roses') { palaceFlowerGlow(ctx,p,t); }
                    else if (p.decorType === 'dp_brazier') { glow(cx, cy, 46, '255, 110, 60', 0.5 * f); glow(cx, cy, 14, '255, 220, 160', 0.7 * f); }
                    else if (p.decorType === 'dp_embers') glow(cx, cy, 140, '255, 90, 30', 0.28 + 0.06 * Math.sin(t * 1.3));
                    else if (p.decorType === 'dp_fountain') glow(cx, cy, 60, '255, 24, 75', 0.3 + 0.05 * Math.sin(t * 2));
                    else if (p.decorType === 'dp_altar') { glow(cx - 30, cy, 18, '255, 180, 110', 0.5 * f); glow(cx + 30, cy, 18, '255, 180, 110', 0.5 * f); glow(cx, cy, 50, '255, 70, 90', 0.25); }
                    else if (p.decorType === 'dp_throne') glow(cx, cy - 6, 70, '255, 28, 70', 0.22 + 0.03 * Math.sin(t * 0.9));
                    else if (p.decorType === 'dp_pool') glow(cx, cy, 70, '200, 20, 60', 0.14);
                    else if (p.decorType === 'dp_cage') glow(cx, cy, 30, '255, 60, 20', 0.12);
                }
                // The red moon through the oculus, over the throne
                glow(900, 470, 160, '255, 75, 110', 0.07 + 0.02 * Math.sin(t * 0.5));
                // Sparks rising from the braziers and the embers
                for (let i = 0; i < 36; i++) {
                    const src = i % 3 === 0 ? [1590, 175] : [[733, 573], [1067, 573], [733, 833], [1067, 833]][i % 4];
                    const ph = (t * (0.25 + (i % 5) * 0.05) + i * 0.137) % 1;
                    const x = src[0] + Math.sin(t * 2 + i) * 10 * ph + ((i * 37) % 30 - 15), y = src[1] - ph * 90;
                    ctx.globalAlpha = (1 - ph) * 0.7; ctx.fillStyle = i % 2 ? '#ffb070' : '#ff6a3a';
                    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
        });

        // The hunters (entities/hunters.js): their dashes and their eyes
        engineMixin({
            /** The hunters' crimson flits: a fading ghost where they were, jagged red lines to where they are (world space) */
            drawHunterDashes(ctx) {
                const L = this.hunterDashes; if (!L || !L.length) return;
                const now = _gameTimeSec;
                for (let i = L.length - 1; i >= 0; i--) {
                    const D = L[i], age = now - D.t0;
                    if (age > 0.6) { L.splice(i, 1); continue; }
                    const k = 1 - age / 0.6;
                    // the ghost: a silhouette in crimson, fading
                    ctx.save(); ctx.globalAlpha = 0.45 * k; ctx.fillStyle = D.boss ? '#ff2a4a' : '#c0142e';
                    ctx.translate(D.x0, D.y0); ctx.rotate(D.a);
                    ctx.beginPath(); ctx.ellipse(-2, 0, 7, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    // the trail: three jagged lines, re-jittered as they fade
                    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
                    const dx = D.x1 - D.x0, dy = D.y1 - D.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, n = 9;
                    for (let j = 0; j < 3; j++) {
                        ctx.strokeStyle = j ? `rgba(255,60,80,${0.5 * k})` : `rgba(255,190,170,${0.8 * k})`; ctx.lineWidth = j ? 2.2 : 1;
                        ctx.beginPath(); ctx.moveTo(D.x0, D.y0);
                        for (let s = 1; s < n; s++) {
                            const f = s / n, jit = Math.sin(D.seed + s * 2.3 + j * 7 + Math.floor(now * 30)) * 7 * (1 - Math.abs(f - 0.5) * 1.4);
                            ctx.lineTo(D.x0 + dx * f + nx * jit, D.y0 + dy * f + ny * jit);
                        }
                        ctx.lineTo(D.x1, D.y1); ctx.stroke();
                    }
                    ctx.restore();
                }
            },

            /** After the darkness: hunters' eyes burn ember (night vision's tell) */
            drawHunterEyes(ctx) {
                for (const e of this.enemies || []) {
                    if (!e || e.dead || !e.hunter) continue;
                    const k = e.bossName ? (e._eyeK ?? 1) : 1; if (k < 0.05) continue;
                    const fx = Math.cos(e.angle), fy = Math.sin(e.angle), S = e.bossName ? 1.15 : 1;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    for (const s of [-1, 1]) {
                        const x = e.x + fx * 6 * S - fy * 2.6 * s * S, y = e.y + fy * 6 * S + fx * 2.6 * s * S;
                        ctx.globalAlpha = 0.9 * k; ctx.fillStyle = '#ffb070'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = 0.5 * k; drawGlow(ctx, x, y, 6 + 10 * (e._igniteFlash || 0), '255, 90, 40', 0.3);
                    }
                    ctx.restore();
                }
            }
        });

        /** Her palace's pieces, drawn on the floor pass (dispatched from entities/props-decor.js) */
        function drawPalaceDecorProp(ctx, p) {
            const x = p.x, y = p.y, w = p.width, h = p.height, cx = x + w / 2, cy = y + h / 2, t = _frameTime / 1000, C = PALACE;
            const rr = (X, Y, W, H, r, fill, stroke, lw = 1) => { ctx.beginPath(); ctx.roundRect(X, Y, W, H, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
            const circ = (X, Y, r, fill, stroke, lw = 1) => { ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
            const shadow = (r = 4) => rr(x + 3, y + 3, w, h, r, 'rgba(0,0,0,0.4)');
            switch (p.decorType) {
                case 'dp_throne': {
                    shadow(10);rr(x-4,y-2,w+8,h+6,12,'#332333','#f1b43d',1.4);
                    rr(x+5,y+8,w-10,h-12,8,'#b1092d','#f4b94c',1);
                    // Obsidian ribs sweep around a ruby focus above the upholstered seat.
                    for(const side of [-1,1]){
                        ctx.fillStyle='#322436';ctx.strokeStyle='#ffd06b';ctx.lineWidth=1.1;ctx.beginPath();
                        ctx.moveTo(cx+side*7,y+8);ctx.bezierCurveTo(cx+side*32,y+4,cx+side*39,y-15,cx+side*34,y-25);
                        ctx.quadraticCurveTo(cx+side*21,y-8,cx+side*5,y+13);ctx.fill();ctx.stroke();
                        rr(cx+side*24-4,y+20,8,27,3,'#44303f','#d5a03e',1);
                    }
                    ctx.fillStyle='#df143e';ctx.strokeStyle='#ffda77';ctx.lineWidth=1;
                    ctx.beginPath();ctx.moveTo(cx,y-22);ctx.lineTo(cx+8,y-4);ctx.lineTo(cx,y+8);ctx.lineTo(cx-8,y-4);ctx.closePath();ctx.fill();ctx.stroke();
                    ctx.fillStyle='#ff5a65';ctx.beginPath();ctx.moveTo(cx,y-18);ctx.lineTo(cx,y+4);ctx.lineTo(cx-5,y-4);ctx.closePath();ctx.fill();
                    break;
                }
                case 'dp_pool': {
                    rr(x - 4, y - 4, w + 8, h + 8, 30, '#22101a', C.goldDim, 2);                   // the gold rim
                    rr(x, y, w, h, 26, C.water);
                    ctx.strokeStyle = 'rgba(255,80,120,0.12)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) { const k = ((t * 0.3 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx, cy, 10 + k * 60, 6 + k * 36, 0, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.globalAlpha = 1;
                    break;
                }
                case 'dp_pillar': {
                    shadow(18); circ(cx, cy, w / 2, '#160810', C.gold, 1.4); circ(cx, cy, w / 2 - 6, '#24101a');
                    ctx.strokeStyle = 'rgba(176,18,46,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 3, t * 0.2, t * 0.2 + 4); ctx.stroke();
                    break;
                }
                case 'dp_brazier': {
                    shadow(13); circ(cx, cy, w / 2, '#1c0a0a', C.gold, 1.4); circ(cx, cy, w / 2 - 4, '#3a0c06');
                    const f = 0.7 + 0.3 * Math.sin(t * 13 + cx);
                    circ(cx, cy, 7 * f, '#ff6a3a'); circ(cx, cy, 3.5 * f, '#ffe0a0');
                    break;
                }
                case 'dp_fountain': {
                    circ(cx, cy, w / 2, '#68505d', '#efc366', 2); circ(cx, cy, w / 2 - 8, '#302234');
                    circ(cx, cy, 10, '#2a1018', C.gold, 1.2);                                      // the spout
                    ctx.strokeStyle = 'rgba(255,106,129,0.7)'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); ctx.quadraticCurveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24 - 6, cx + Math.cos(a) * 32, cy + Math.sin(a) * 32); ctx.stroke(); }
                    break;
                }
                case 'dp_roses': {
                    shadow(12);rr(x,y,w,h,12,'#4a3442','#d9a742',1.3);
                    rr(x+4,y+4,w-8,h-8,9,'#211f2a','rgba(225,177,152,.18)');
                    for(const f of palaceFlowers(p)){
                        const px=x+f.x,py=y+f.y;
                        ctx.fillStyle=f.blood?'#385953':'#2b573c';ctx.beginPath();
                        ctx.ellipse(px-2,py+2,f.r*1.5,f.r*.7,f.a,0,Math.PI*2);ctx.fill();
                        ctx.strokeStyle='#71806d';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(px-3,py+4);ctx.lineTo(px+1,py-1);ctx.stroke();
                        for(let j=0;j<6;j++){
                            const a=f.a+j*Math.PI/3;
                            ctx.fillStyle=f.blood?(j%2?'#da0c40':'#ff3a62'):(j%2?'#a70a2d':'#ef1947');
                            ctx.beginPath();ctx.ellipse(px+Math.cos(a)*f.r*.5,py+Math.sin(a)*f.r*.5,f.r*.75,f.r*.42,a,0,Math.PI*2);ctx.fill();
                        }
                        circ(px,py,f.r*.4,f.blood?'#ffd09a':'#680b25');
                        if(!f.blood){ctx.strokeStyle='#ff5772';ctx.lineWidth=.55;ctx.beginPath();ctx.arc(px,py,f.r*.52,f.a,f.a+3.8);ctx.stroke();}
                    }break;
                }
                case 'dp_bench': {
                    shadow(5);rr(x,y,w,h,5,'#5a4751','#ebba55',1.3);
                    rr(x+8,y+4,w-16,h-8,3,'#a30a30','#db3856');
                    for(const dx of [3,w-8])rr(x+dx,y+2,5,h-4,2,'#ad8c69');
                    break;
                }
                case 'dp_hedge': {
                    rr(x, y, w, h, 6, '#140a0a');
                    ctx.strokeStyle = C.thorn; ctx.lineWidth = 1.2; for (let i = 0; i < 10; i++) { const py = y + 4 + i * (h - 8) / 9; ctx.beginPath(); ctx.moveTo(x + 2, py); ctx.lineTo(x + w - 2, py + 3); ctx.stroke(); }
                    break;
                }
                case 'dp_altar': {
                    shadow(12);rr(x,y,w,h,12,'#352738','#c2a080',1.4);
                    rr(x+7,y+6,w-14,h-12,9,'#543349','rgba(225,179,147,.45)');
                    // Mineral facets hang over a reflecting cradle, with faint red-black filaments.
                    const bob=Math.sin(t*1.1)*2;
                    for(const side of [-1,1]){
                        circ(cx+side*32,cy+5,7,'#3d293d','#d3b28b');
                        ctx.strokeStyle='rgba(232,30,77,.65)';ctx.lineWidth=1;ctx.beginPath();
                        ctx.moveTo(cx+side*30,cy+2);ctx.bezierCurveTo(cx+side*19,cy-13,cx+side*15,cy+12,cx,cy+bob);ctx.stroke();
                    }
                    ctx.fillStyle='#dc0e40';ctx.strokeStyle='#ffd570';ctx.lineWidth=1;
                    ctx.beginPath();ctx.moveTo(cx,cy-24+bob);ctx.lineTo(cx+13,cy-1+bob);ctx.lineTo(cx,cy+23+bob);ctx.lineTo(cx-13,cy-1+bob);ctx.closePath();ctx.fill();ctx.stroke();
                    ctx.fillStyle='#ff526c';ctx.beginPath();ctx.moveTo(cx,cy-20+bob);ctx.lineTo(cx,cy+17+bob);ctx.lineTo(cx-9,cy-1+bob);ctx.closePath();ctx.fill();
                    break;
                }
                case 'dp_statue': {
                    shadow(10);circ(cx,cy,w/2,'#493540','#b39172');
                    for(const [dx,dy,scale] of [[-5,1,.65],[5,4,.55],[0,-4,1]]){
                        ctx.fillStyle=dx<0?'#756072':dx>0?'#442c47':'#987c91';ctx.strokeStyle='#c6a28f';ctx.lineWidth=.7;
                        ctx.beginPath();ctx.moveTo(cx+dx,cy+dy-11*scale);ctx.lineTo(cx+dx+6*scale,cy+dy);ctx.lineTo(cx+dx,cy+dy+9*scale);ctx.lineTo(cx+dx-5*scale,cy+dy);ctx.closePath();ctx.fill();ctx.stroke();
                    }break;
                }
                case 'dp_embers': {
                    rr(x - 4, y - 4, w + 8, h + 8, 24, '#2a0e08', C.goldDim, 2);
                    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) / 2);
                    g.addColorStop(0, '#ff8a3a'); g.addColorStop(0.5, '#b0300a'); g.addColorStop(1, '#3a0a04');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.fill();
                    const R = seededRandom(17);
                    for (let i = 0; i < 40; i++) { const px = x + 10 + R() * (w - 20), py = y + 10 + R() * (h - 20), f = 0.5 + 0.5 * Math.sin(t * (3 + R() * 4) + i); circ(px, py, 1.5 + R() * 2, `rgba(255,${180 + (f * 60 | 0)},120,${0.4 + 0.5 * f})`); }
                    break;
                }
                case 'dp_mirror': {
                    rr(x, y, w, h, 3, '#e3a64a'); rr(x + 3, y + 3, w - 6, h - 6, 2, 'rgba(200,190,220,0.5)');
                    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 8, y + 4, 12, 2);
                    break;
                }
                case 'dp_vanity': { shadow(); rr(x, y, w, h, 5, '#2a0c16', C.goldDim, 1.2); circ(x + 20, cy, 5, '#ff8aa8'); circ(x + 40, cy, 4, '#e3a64a'); circ(x + 60, cy - 4, 3, '#b0122e'); break; }
                case 'dp_wardrobe': { shadow(); rr(x, y, w, h, 4, '#1a0710', C.gold, 1.2); ctx.fillStyle = C.goldDim; ctx.fillRect(cx - 1, y + 3, 2, h - 6); break; }
                case 'dp_cage': {
                    shadow(); rr(x, y, w, h, 4, 'rgba(20,8,6,0.8)');
                    ctx.strokeStyle = '#6a3a1a'; ctx.lineWidth = 1.6; for (let i = 0; i <= 8; i++) { const px = x + i * w / 8; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
                    rr(x, y, w, h, 4, null, '#8a4a2a', 2);
                    break;
                }
                default: rr(x, y, w, h, 4, '#2a0c14');
            }
        }
