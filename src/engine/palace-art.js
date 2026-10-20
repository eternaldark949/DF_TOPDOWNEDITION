        // The Demoness Palace: its floor (painted once), its glow after the darkness, and its decor
        // (dp_*). Obsidian and gold, crimson silk, ember light. Methods are added to
        // GameEngine.prototype (see engineMixin in game-engine.js); the decor drawer is a plain
        // function that entities/props-decor.js dispatches to.

        const PALACE = { obsidian: '#0b0509', obsidianHi: '#1c0d16', gold: '#ffc64b', goldDim: 'rgba(255,190,58,0.65)', blood: '#7a0618',
                      crimson: '#b0122e', ember: '#ff6a3a', bone: '#e9d8c6', thorn: '#2a0e12', rose: '#c0143e', water: '#14060c' };

        // Fixed lights painted into the floor and lit in the glow pass (their hidden lamps: world/map-entities.js).
        const PALACE_SCONCES = [[608,470],[608,880],[1192,470],[1192,880],[820,388],[980,388],[608,1075],[608,1310],[1192,1075],[1192,1310]];
        const PALACE_RUNNER_LAMPS = [820,940,1060,1180,1300].flatMap(y => [[827,y],[973,y]]);
        const PALACE_GARDEN_LANTERNS = [[390,135],[510,135],[390,245],[510,245]];

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
                y:7+(Math.floor(i/cols)+.2+rnd()*.6)*(p.height-14)/rows,r:3+rnd()*2,a:rnd()*6.28,blood:i%4===0,gold:i%4!==0&&i%5===2});
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
                }
                for(const f of palaceFlowers(p))if(f.gold){
                    const x=f.x+12,y=f.y+12,halo=g.createRadialGradient(x,y,0,x,y,8);
                    halo.addColorStop(0,'rgba(255,200,90,.6)');halo.addColorStop(1,'rgba(255,150,40,0)');
                    g.fillStyle=halo;g.fillRect(x-8,y-8,16,16);
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
                // Polished stone: each slab its own shade, faint grout, crimson and gold veins through it.
                const slabs=(x,y,w,h,size,base,vein='rgba(255,70,95,.11)',fleck='rgba(255,196,96,.09)')=>{
                    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
                    for(let yy=y;yy<y+h;yy+=size)for(let xx=x;xx<x+w;xx+=size){
                        const v=r()*9|0;c.fillStyle=`rgb(${base[0]+v+2},${base[1]+v*.6|0},${base[2]+v})`;c.fillRect(xx,yy,size,size);
                        // a soft top-left sheen on every slab, as if lit from the oculus
                        const s=c.createLinearGradient(xx,yy,xx+size,yy+size);s.addColorStop(0,'rgba(255,190,170,.05)');s.addColorStop(1,'rgba(0,0,0,.08)');
                        c.fillStyle=s;c.fillRect(xx,yy,size,size);
                    }
                    c.strokeStyle='rgba(226,170,120,.17)';c.lineWidth=.8;c.beginPath();
                    for(let xx=x;xx<=x+w;xx+=size){c.moveTo(xx,y);c.lineTo(xx,y+h);}
                    for(let yy=y;yy<=y+h;yy+=size){c.moveTo(x,yy);c.lineTo(x+w,yy);}c.stroke();
                    for(const [col,n,lw] of [[vein,w*h/6000,.8],[fleck,w*h/16000,.6]]){
                        c.strokeStyle=col;c.lineWidth=lw;
                        for(let i=0;i<n;i++){
                            let xx=x+r()*w,yy=y+r()*h;c.beginPath();c.moveTo(xx,yy);
                            for(let j=0;j<5;j++){const nx=xx+(r()-.3)*42,ny=yy+(r()-.5)*32;c.quadraticCurveTo((xx+nx)/2+(r()-.5)*12,(yy+ny)/2+(r()-.5)*12,nx,ny);xx=nx;yy=ny;}c.stroke();
                        }
                    }c.restore();
                };
                // Depth: every room's floor falls into shadow along its walls.
                const occlude=(x,y,w,h,d=46,a=.62)=>{
                    for(const [gx0,gy0,gx1,gy1,rx,ry,rw,rh] of [[x,y,x,y+d,x,y,w,d],[x,y+h,x,y+h-d,x,y+h-d,w,d],[x,y,x+d,y,x,y,d,h],[x+w,y,x+w-d,y,x+w-d,y,d,h]]){
                        const g=c.createLinearGradient(gx0,gy0,gx1,gy1);g.addColorStop(0,`rgba(4,0,3,${a})`);g.addColorStop(1,'rgba(4,0,3,0)');
                        c.fillStyle=g;c.fillRect(rx,ry,rw,rh);
                    }
                };
                const carpet=(y,h)=>{
                    box(836,y,128,h,'#5c0414','#ffcd5c',3);
                    // Velvet: deep at the edges, bright down the nap, lit from above.
                    const nap=c.createLinearGradient(842,0,958,0);
                    nap.addColorStop(0,'#62031a');nap.addColorStop(.18,'#b20a2e');nap.addColorStop(.5,'#e3173d');nap.addColorStop(.82,'#b20a2e');nap.addColorStop(1,'#62031a');
                    c.fillStyle=nap;c.beginPath();c.roundRect(842,y+4,116,h-8,2);c.fill();
                    c.strokeStyle='#ffc957';c.lineWidth=1.6;c.strokeRect(848,y+6,104,h-12);
                    c.strokeStyle='rgba(255,214,120,.55)';c.lineWidth=.8;c.strokeRect(853,y+10,94,h-20);
                    // Gold fringe along both long edges.
                    c.strokeStyle='rgba(255,201,87,.75)';c.lineWidth=1;c.beginPath();
                    for(let yy=y+5;yy<y+h-4;yy+=4){c.moveTo(836,yy);c.lineTo(832,yy+1.5);c.moveTo(964,yy);c.lineTo(968,yy+1.5);}c.stroke();
                    // Down the centre: ruby lozenges inside gold, between embroidered curls.
                    for(let yy=y+40;yy<y+h-24;yy+=76){
                        c.fillStyle='#7c0420';c.strokeStyle='#ffd06a';c.lineWidth=1.2;
                        c.beginPath();c.moveTo(900,yy-17);c.lineTo(914,yy);c.lineTo(900,yy+17);c.lineTo(886,yy);c.closePath();c.fill();c.stroke();
                        c.fillStyle='#ff3d5c';c.beginPath();c.moveTo(900,yy-9);c.lineTo(906,yy);c.lineTo(900,yy+9);c.lineTo(894,yy);c.closePath();c.fill();
                    }
                    c.strokeStyle='rgba(255,208,100,.8)';c.lineWidth=1;c.beginPath();
                    for(let yy=y+24;yy<y+h-12;yy+=38)for(const side of [-1,1]){
                        const x=900+side*40;c.moveTo(x,yy+12);c.quadraticCurveTo(x-side*14,yy,x,yy-12);
                        c.moveTo(x,yy);c.lineTo(x-side*8,yy-4);
                    }c.stroke();
                };
                box(0,0,1800,1400,'#1a0d16');
                // Throne Hall and Entrance: polished oxblood obsidian. Galleries: matte wine-dusk stone.
                slabs(600,380,600,606,60,[40,12,24]);slabs(600,1000,600,386,60,[38,13,22]);
                slabs(14,380,572,606,64,[34,17,32],'rgba(170,60,150,.08)','rgba(255,190,120,.05)');
                slabs(1214,380,572,606,64,[34,17,32],'rgba(170,60,150,.08)','rgba(255,190,120,.05)');
                slabs(900,14,486,352,48,[36,15,40],'rgba(255,60,120,.12)');slabs(1400,14,386,352,44,[62,26,20],'rgba(255,140,60,.12)');
                // Gold rays fan from the throne across the hall: the floor leads the eye to her.
                c.save();c.beginPath();c.rect(600,380,600,606);c.clip();
                for(let i=-9;i<=9;i++){
                    const a=Math.PI/2+i*.13,g=c.createLinearGradient(900,420,900+Math.cos(a)*620,420+Math.sin(a)*620);
                    g.addColorStop(0,'rgba(255,196,90,.28)');g.addColorStop(1,'rgba(255,196,90,0)');
                    c.strokeStyle=g;c.lineWidth=i%3?1:2;c.beginPath();c.moveTo(900,420);c.lineTo(900+Math.cos(a)*620,420+Math.sin(a)*620);c.stroke();
                }
                // The dais: two stepped crimson tiers, gold-edged, under the throne.
                for(const [rx,ry,col] of [[176,104,'#2c0814'],[132,78,'#4e0a1e'],[94,56,'#760c26']]){
                    const g=c.createRadialGradient(900,392,10,900,392,rx);g.addColorStop(0,col);g.addColorStop(1,'#1c0610');
                    c.fillStyle=g;c.beginPath();c.ellipse(900,388,rx,ry,0,0,Math.PI);c.fill();
                    c.strokeStyle='rgba(255,201,87,.8)';c.lineWidth=1.4;c.beginPath();c.ellipse(900,388,rx,ry,0,0,Math.PI);c.stroke();
                    c.strokeStyle='rgba(0,0,0,.45)';c.lineWidth=3;c.beginPath();c.ellipse(900,391,rx,ry,0,.08,Math.PI-.08);c.stroke();
                }
                c.restore();
                // Gold inlay borders inset from each grand room's walls.
                for(const [x,y,w,h] of [[618,398,564,570],[618,1018,564,350],[918,32,450,316]]){
                    c.strokeStyle='rgba(255,196,90,.45)';c.lineWidth=1.4;c.strokeRect(x,y,w,h);
                    c.strokeStyle='rgba(255,196,90,.2)';c.lineWidth=.8;c.strokeRect(x+6,y+6,w-12,h-12);
                    for(const [px,py] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){c.fillStyle='#ffc957';c.beginPath();c.moveTo(px,py-5);c.lineTo(px+5,py);c.lineTo(px,py+5);c.lineTo(px-5,py);c.closePath();c.fill();}
                }
                for(const [x,y,w,h] of [[32,398,536,570],[1232,398,536,570]]){
                    c.strokeStyle='rgba(211,140,118,.2)';c.lineWidth=1;c.strokeRect(x,y,w,h);
                }
                // Pale route margins give the red velvet readable edges even in deep shadow.
                for(const y of [760,1000]){
                    const h=y===760?226:386;box(818,y,164,h,'#7a6264');carpet(y,h);
                    c.strokeStyle='rgba(255,226,184,.35)';c.lineWidth=1;c.strokeRect(821,y+1,158,h-2);
                }
                // Ember lamps set flush in the margins light the way to the throne.
                for(const [x,y] of PALACE_RUNNER_LAMPS){
                    c.fillStyle='#2a0a08';c.strokeStyle='#ffcd5c';c.lineWidth=1.2;c.beginPath();c.arc(x,y,5.5,0,Math.PI*2);c.fill();c.stroke();
                    c.fillStyle='#ff7a3a';c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();
                }
                // Six flowing gold channels and a ruby focus: an original mineral/organic crest.
                c.save();c.translate(900,535);palaceCrystalCrest(c,90);c.restore();
                // The Blood Garden: rain-dark loam, lush moss, low red and gold blooms, wet ivory paths.
                box(14,14,872,352,'#2a171d');
                for(let i=0;i<2200;i++){
                    const x=18+r()*862,y=18+r()*342,k=i%9;
                    c.fillStyle=k<5?'rgba(52,104,58,.32)':k<7?'rgba(30,70,40,.4)':k<8?'rgba(214,22,58,.5)':'rgba(255,186,60,.45)';
                    if(k<7)c.fillRect(x,y,1+r()*3,1+r()*3);else{c.beginPath();c.arc(x,y,1+r()*1.2,0,Math.PI*2);c.fill();}
                }
                const paths=[[[330,366],[330,285],[363,230],[417,205]],[[745,366],[745,258],[570,270],[484,212]],
                    [[886,190],[735,170],[586,184],[495,190]],[[450,14],[466,67],[420,92],[444,145]]];
                for(const a of paths){
                    c.beginPath();c.moveTo(...a[0]);c.bezierCurveTo(...a[1],...a[2],...a[3]);
                    c.strokeStyle='#3f2c33';c.lineWidth=49;c.lineCap='round';c.stroke();
                    c.strokeStyle='#bba48f';c.lineWidth=37;c.stroke();
                    // rain sheen down the middle of each path
                    c.strokeStyle='rgba(255,226,200,.22)';c.lineWidth=14;c.stroke();c.strokeStyle='rgba(255,240,222,.35)';c.lineWidth=1.2;c.stroke();
                }
                c.strokeStyle='rgba(120,90,80,.35)';c.lineWidth=1;
                for(let yy=20;yy<360;yy+=25){c.beginPath();c.moveTo(429,yy);c.lineTo(465,yy+3);c.stroke();}
                // Rain pools on the paths and in the loam, catching the warm light.
                for(const [x,y,rx,ry] of [[352,248,16,7],[612,232,20,8],[742,312,14,6],[455,60,12,5],[560,190,15,6],[200,200,18,7],[820,240,13,5],[180,350,16,5]]){
                    c.fillStyle='rgba(20,6,14,.75)';c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
                    c.strokeStyle='rgba(255,170,150,.35)';c.lineWidth=1;c.beginPath();c.ellipse(x,y,rx-2,ry-1.5,0,3.5,5.6);c.stroke();
                    c.strokeStyle='rgba(255,210,170,.18)';c.beginPath();c.ellipse(x+2,y,rx*.5,ry*.45,0,0,Math.PI*2);c.stroke();
                }
                // Fountain terrace and petals carried beyond the raised beds.
                const terr=c.createRadialGradient(440,180,10,450,190,78);terr.addColorStop(0,'#a48a88');terr.addColorStop(1,'#5e464e');
                c.fillStyle=terr;c.beginPath();c.ellipse(450,190,75,67,0,0,Math.PI*2);c.fill();
                c.strokeStyle='#ffc957';c.lineWidth=1.8;c.stroke();c.strokeStyle='rgba(255,201,87,.4)';c.lineWidth=1;c.beginPath();c.ellipse(450,190,68,60,0,0,Math.PI*2);c.stroke();
                for(let i=0;i<150;i++){c.fillStyle=i%5===0?'#ffb43a':i%4?'#c50d36':'#ff3a5e';c.beginPath();c.ellipse(60+r()*800,25+r()*330,1.2+r()*1.6,.7+r(),r()*3,0,Math.PI*2);c.fill();}
                // Garden lanterns ring the terrace.
                for(const [x,y] of PALACE_GARDEN_LANTERNS){
                    c.fillStyle='rgba(0,0,0,.4)';c.beginPath();c.ellipse(x+3,y+4,8,5,0,0,Math.PI*2);c.fill();
                    c.fillStyle='#2a1014';c.strokeStyle='#ffc957';c.lineWidth=1.2;c.beginPath();c.roundRect(x-6,y-6,12,12,3);c.fill();c.stroke();
                    c.fillStyle='#ffb35a';c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();
                }
                // Crystal chamber: inlaid channels converge toward a floating mineral focus.
                c.save();c.translate(1145,180);palaceCrystalCrest(c,109);c.restore();
                for(const x of [925,1360])for(const y of [40,332])box(x-8,y-8,16,16,'#71545f','#ffcd6a',4);
                // Bath of Embers: terracotta warmed from below, a gold ring around the pool.
                c.strokeStyle='rgba(255,170,90,.4)';c.lineWidth=1.5;c.beginPath();c.roundRect(1452,82,276,186,30);c.stroke();
                // Dressing room: deep rose silk with a gold damask and a pearl border.
                box(14,1000,572,386,'#4a1530');box(34,1020,532,346,'#5a1a38','#d4a070',5);
                c.save();c.beginPath();c.rect(36,1022,528,342);c.clip();c.strokeStyle='rgba(255,190,110,.13)';c.lineWidth=1;
                for(let yy=1040;yy<1370;yy+=40)for(let xx=50+(yy/40%2)*20;xx<570;xx+=40){
                    c.beginPath();c.moveTo(xx,yy-9);c.quadraticCurveTo(xx+9,yy,xx,yy+9);c.quadraticCurveTo(xx-9,yy,xx,yy-9);c.stroke();
                }c.restore();
                slabs(1214,1000,572,386,52,[28,18,24],'rgba(150,60,40,.08)');
                for(let i=0;i<220;i++){
                    c.strokeStyle='rgba(190,157,109,.12)';c.lineWidth=1;const x=1230+r()*540,y=1120+r()*250;
                    c.beginPath();c.moveTo(x,y);c.lineTo(x+r()*10,y+r()*6);c.stroke();
                }
                // Matching petal-shaped threshold inlays frame the deliberately unlit side galleries.
                for(const x of [600,1200])for(const y of [625,738]){
                    c.save();c.translate(x,y);c.strokeStyle='#c99a6a';c.lineWidth=1;
                    c.beginPath();c.moveTo(-13,0);c.quadraticCurveTo(0,-8,13,0);c.quadraticCurveTo(0,8,-13,0);c.stroke();c.restore();
                }
                // Wall sconces: gold brackets holding ember bowls.
                for(const [x,y] of PALACE_SCONCES){
                    c.fillStyle='rgba(0,0,0,.45)';c.beginPath();c.arc(x+2,y+3,9,0,Math.PI*2);c.fill();
                    c.fillStyle='#3a1a10';c.strokeStyle='#ffc957';c.lineWidth=1.3;c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.fill();c.stroke();
                    c.fillStyle='#ff6a2a';c.beginPath();c.arc(x,y,3.5,0,Math.PI*2);c.fill();
                }
                // Shadow pools the floor into every room's corners and walls.
                for(const [x,y,w,h] of [[600,380,600,606],[600,1000,600,386],[900,14,486,352],[1400,14,386,352],[14,1000,572,386],[1214,1000,572,386]])occlude(x,y,w,h);
                for(const [x,y,w,h] of [[14,380,572,606],[1214,380,572,606]])occlude(x,y,w,h,70,.7);
                occlude(14,14,872,352,30,.5);
                return cv;
            },

            /** After the darkness: braziers, sconces, the red moon, her red-and-black energy, gold motes, drifting sparks */
            drawPalaceGlow(ctx) {
                const mirror = ctx !== this.ctx;   // the reflection pass replays this twice: softer, and without the fine particles
                const t = _frameTime / 1000, k = mirror ? 0.5 : 1, glow = (x, y, r, rgb, a) => glowA(ctx, x, y, r, rgb, a * k);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of this.props || []) {
                    if (!p.decorType || !p.decorType.startsWith('dp_')) continue;
                    const cx = p.x + p.width / 2, cy = p.y + p.height / 2, f = 0.8 + 0.2 * Math.sin(t * 9 + cx);
                    if (p.decorType === 'dp_roses') { palaceFlowerGlow(ctx,p,t); }
                    else if (p.decorType === 'dp_brazier') { glow(cx, cy, 72, '255, 50, 25', 0.2 * f); glow(cx, cy, 38, '255, 130, 55', 0.42 * f); glow(cx, cy, 13, '255, 228, 170', 0.7 * f); }
                    else if (p.decorType === 'dp_embers') { glow(cx, cy, 170, '255, 80, 25', 0.32 + 0.06 * Math.sin(t * 1.3)); glow(cx, cy, 70, '255, 170, 80', 0.18 + 0.04 * Math.sin(t * 2.1)); }
                    else if (p.decorType === 'dp_fountain') { glow(cx, cy, 78, '255, 30, 80', 0.32 + 0.05 * Math.sin(t * 2)); glow(cx, cy, 26, '255, 200, 170', 0.35); }
                    else if (p.decorType === 'dp_altar') { glow(cx - 32, cy + 5, 20, '255, 180, 110', 0.55 * f); glow(cx + 32, cy + 5, 20, '255, 180, 110', 0.55 * f); glow(cx, cy, 64, '255, 40, 80', 0.32 + 0.05 * Math.sin(t * 1.1)); }
                    else if (p.decorType === 'dp_throne') { glow(cx, cy - 6, 90, '255, 20, 60', 0.18 + 0.04 * Math.sin(t * 0.9)); glow(cx, cy - 14, 18, '255, 120, 140', 0.3); }
                    else if (p.decorType === 'dp_pool') { glow(cx, cy, 96, '230, 20, 60', 0.26 + 0.04 * Math.sin(t * 0.7)); glow(cx - 20, cy - 10, 30, '255, 190, 120', 0.14); }
                    else if (p.decorType === 'dp_pillar') glow(cx, cy, 34, '255, 40, 70', 0.1);
                    else if (p.decorType === 'dp_vanity') glow(cx, cy, 50, '255, 170, 150', 0.16);
                    else if (p.decorType === 'dp_cage') glow(cx, cy, 30, '255, 60, 20', 0.12);
                }
                // Sconces, the runner's ember lamps and the garden lanterns
                for (const [x, y] of PALACE_SCONCES) { const f = 0.85 + 0.15 * Math.sin(t * 11 + x * 0.7 + y); glow(x, y, 50, '255, 90, 40', 0.22 * f); glow(x, y, 10, '255, 225, 160', 0.6 * f); }
                if (!mirror) for (const [x, y] of PALACE_RUNNER_LAMPS) { const f = 0.85 + 0.15 * Math.sin(t * 7 + y * 0.05); glow(x, y, 20, '255, 120, 60', 0.3 * f); glow(x, y, 5, '255, 220, 170', 0.5); }
                for (const [x, y] of PALACE_GARDEN_LANTERNS) { const f = 0.9 + 0.1 * Math.sin(t * 5 + x); glow(x, y, 46, '255, 150, 70', 0.24 * f); glow(x, y, 7, '255, 220, 170', 0.55); }
                // The carpet's warm nap, lit along its length
                for (let y = 790; y < 1380; y += 64) glow(900, y, 64, '255, 30, 55', 0.06);
                // The red moon through the oculus: a shaft falling on the throne
                const sh = ctx.createLinearGradient(0, 380, 0, 620), ma = (0.06 + 0.02 * Math.sin(t * 0.5)) * k;
                sh.addColorStop(0, `rgba(255,70,100,${ma})`); sh.addColorStop(1, 'rgba(255,70,100,0)');
                ctx.globalAlpha = 1; ctx.fillStyle = sh; ctx.beginPath(); ctx.moveTo(860, 380); ctx.lineTo(940, 380); ctx.lineTo(1010, 620); ctx.lineTo(790, 620); ctx.closePath(); ctx.fill();
                glow(900, 470, 170, '255, 75, 110', 0.09 + 0.02 * Math.sin(t * 0.5));
                if (!mirror) {
                    // Her energy: red arcs crackling out from the throne's arms, rerouted a few times a second
                    const seed = Math.floor(t * 6);
                    ctx.lineCap = 'round'; ctx.globalAlpha = 1;
                    for (let i = 0; i < 4; i++) {
                        const side = i % 2 ? 1 : -1, a0 = (side > 0 ? 0 : Math.PI) + side * (((seed * 7 + i * 13) % 11) / 11 - 0.5) * 1.1, len = 30 + ((seed + i * 5) % 7) * 5;
                        const x0 = 900 + side * 40, y0 = 418; let x = x0, y = y0;
                        for (const [lw, col] of [[3, 'rgba(200,10,40,0.3)'], [1, 'rgba(255,120,130,0.6)']]) {
                            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); x = x0; y = y0;
                            for (let s = 1; s <= 6; s++) {
                                const j = Math.sin(seed * 3.1 + i * 7 + s * 2.3) * 9;
                                x = x0 + Math.cos(a0) * len * s / 6 - Math.sin(a0) * j; y = y0 + Math.sin(a0) * len * s / 6 + Math.cos(a0) * j;
                                ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                        }
                        glow(x, y, 10, '255, 60, 90', 0.5);
                    }
                    // Gold motes drifting like jewelled bokeh through the hall and the garden
                    for (let i = 0; i < 28; i++) {
                        const garden = i % 2, ph = (t * (0.03 + (i % 7) * 0.006) + i * 0.173) % 1;
                        const x = garden ? 60 + ((i * 97) % 780) + Math.sin(t * 0.6 + i) * 18 : 640 + ((i * 131) % 520) + Math.sin(t * 0.5 + i) * 16;
                        const y = garden ? 340 - ph * 300 : 960 - ph * 560;
                        glow(x, y, 5 + (i % 3) * 2, i % 5 ? '255, 196, 100' : '255, 120, 140', 0.55 * Math.sin(ph * Math.PI));
                    }
                }
                // Sparks rising from the braziers and the embers
                for (let i = 0; i < 44; i++) {
                    const src = i % 3 === 0 ? [1590, 175] : [[733, 573], [1067, 573], [733, 833], [1067, 833], [773, 1313], [1027, 1313]][i % 6];
                    const ph = (t * (0.25 + (i % 5) * 0.05) + i * 0.137) % 1;
                    const x = src[0] + Math.sin(t * 2 + i) * 10 * ph + ((i * 37) % 30 - 15), y = src[1] - ph * 90;
                    ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = i % 2 ? '#ffc070' : '#ff5a2a';
                    ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
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
                    rr(x - 7, y - 7, w + 14, h + 14, 33, '#2a1018', C.gold, 2);                    // the gold rim
                    rr(x - 3, y - 3, w + 6, h + 6, 29, null, 'rgba(255,220,150,.45)', 1);
                    const g = ctx.createRadialGradient(cx - 18, cy - 12, 6, cx, cy, w * 0.62);
                    g.addColorStop(0, '#9a0a2e'); g.addColorStop(0.45, '#56041a'); g.addColorStop(1, '#14020a');
                    ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.fillStyle = g; ctx.fill();
                    // the inner lip falls into shadow: the pool reads as sunk below the floor
                    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 24); ctx.stroke();
                    const R = seededRandom(31);
                    for (let i = 0; i < 9; i++) {
                        const px = x + 22 + R() * (w - 44), py = y + 18 + R() * (h - 36) + Math.sin(t * 0.6 + i) * 2, a = R() * 6.28 + t * 0.05;
                        ctx.fillStyle = i % 3 ? '#e0143e' : '#ff5070'; ctx.beginPath(); ctx.ellipse(px, py, 3, 1.6, a, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.strokeStyle = 'rgba(255,150,150,0.2)'; ctx.lineWidth = 1;
                    for (let i = 0; i < 3; i++) { const k = ((t * 0.3 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(cx, cy, 10 + k * 60, 6 + k * 36, 0, 0, Math.PI * 2); ctx.stroke(); }
                    ctx.globalAlpha = 1;
                    break;
                }
                case 'dp_pillar': {
                    circ(cx + 4, cy + 5, w / 2 + 2, 'rgba(0,0,0,0.5)');
                    const g = ctx.createRadialGradient(cx - w * 0.18, cy - w * 0.18, 2, cx, cy, w / 2);
                    g.addColorStop(0, '#5a2232'); g.addColorStop(0.6, '#2a0c16'); g.addColorStop(1, '#0c0307');
                    circ(cx, cy, w / 2, g, C.gold, 1.6); circ(cx, cy, w / 2 - 6, null, 'rgba(255,200,100,.35)');
                    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circ(cx + Math.cos(a) * (w / 2 - 3), cy + Math.sin(a) * (w / 2 - 3), 1.2, '#ffd36a'); }
                    ctx.strokeStyle = 'rgba(176,18,46,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 3, t * 0.2, t * 0.2 + 4); ctx.stroke();
                    break;
                }
                case 'dp_brazier': {
                    circ(cx + 3, cy + 4, w / 2 + 1, 'rgba(0,0,0,0.5)');
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6;
                    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); ctx.lineTo(cx + Math.cos(a) * (w / 2 + 4), cy + Math.sin(a) * (w / 2 + 4)); ctx.stroke(); }
                    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w / 2);
                    g.addColorStop(0, '#ff8a3a'); g.addColorStop(0.5, '#8a1a08'); g.addColorStop(1, '#2a0a06');
                    circ(cx, cy, w / 2, g, C.gold, 1.6);
                    const f = 0.7 + 0.3 * Math.sin(t * 13 + cx);
                    circ(cx, cy, 8 * f, '#ff6a2a'); circ(cx, cy, 4 * f, '#ffe6a8');
                    break;
                }
                case 'dp_fountain': {
                    circ(cx, cy, w / 2, '#68505d', '#efc366', 2); circ(cx, cy, w / 2 - 8, '#302234');
                    circ(cx, cy, 10, '#2a1018', C.gold, 1.2);                                      // the spout
                    ctx.strokeStyle = 'rgba(255,106,129,0.7)'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); ctx.quadraticCurveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24 - 6, cx + Math.cos(a) * 32, cy + Math.sin(a) * 32); ctx.stroke(); }
                    break;
                }
                case 'dp_roses': {
                    shadow(12);rr(x-1,y-1,w+2,h+2,13,'#2a1820');rr(x,y,w,h,12,'#5a3a44','#ffc44f',1.4);
                    rr(x+4,y+4,w-8,h-8,9,'#170c10','rgba(255,190,150,.22)');
                    for(const f of palaceFlowers(p)){
                        const px=x+f.x,py=y+f.y;
                        ctx.fillStyle=f.blood?'#2f6a4c':'#2a7040';ctx.beginPath();
                        ctx.ellipse(px-2,py+2,f.r*1.6,f.r*.75,f.a,0,Math.PI*2);ctx.fill();
                        ctx.fillStyle='#1c4a2c';ctx.beginPath();ctx.ellipse(px+2,py+3,f.r*1.1,f.r*.5,f.a+1.4,0,Math.PI*2);ctx.fill();
                        ctx.strokeStyle='#7fa070';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(px-3,py+4);ctx.lineTo(px+1,py-1);ctx.stroke();
                        for(let j=0;j<6;j++){
                            const a=f.a+j*Math.PI/3;
                            ctx.fillStyle=f.gold?(j%2?'#ff9a1a':'#ffd25a'):f.blood?(j%2?'#e80c44':'#ff4468'):(j%2?'#b30a30':'#ff1f4e');
                            ctx.beginPath();ctx.ellipse(px+Math.cos(a)*f.r*.5,py+Math.sin(a)*f.r*.5,f.r*.75,f.r*.42,a,0,Math.PI*2);ctx.fill();
                        }
                        circ(px,py,f.r*.4,f.gold?'#8a2a08':f.blood?'#ffd09a':'#680b25');
                        if(!f.blood&&!f.gold){ctx.strokeStyle='#ff6a82';ctx.lineWidth=.55;ctx.beginPath();ctx.arc(px,py,f.r*.52,f.a,f.a+3.8);ctx.stroke();}
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
