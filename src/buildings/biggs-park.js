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

        class BiggsParkBuilding extends BuildingV2 {
            _setupSign() { this.attachedSign = null; }
            _generateLights() {
                // Small door lanterns and pavilion accents, instead of an orange flood over the whole roof.
                for (const [dx,dy,color,r] of [[65,255,'#e3a69b',125],[385,255,'#e3a69b',125],
                    [125,405,'#ffcf91',140],[325,405,'#ffcf91',140]])
                    this.attachedLights.push(new LampEntity({x:this.x+dx,y:this.y+dy,lampType:3,color,lightRadius:r}));
                this.topReach = 120; this.glowReach = 120;
            }
            _k() { return CONFIG.BUILDINGS.LEAN ? 1 + this._leanScale() : 1; }
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
            drawTop(c) {
                const cam=game.camera,k=this._k(),T=BIGGS;
                const P=(x,y)=>[cam.x+(x-cam.x)*k,cam.y+(y-cam.y)*k];
                c.save();
                for(const f of this._visibleFaces(cam)){
                    const a=P(f.x1,f.y1),b=P(f.x2,f.y2);
                    const g=c.createLinearGradient(f.x1,f.y1,a[0],a[1]);g.addColorStop(0,'#261921');g.addColorStop(1,'#68323a');
                    c.fillStyle=g;c.beginPath();c.moveTo(f.x1,f.y1);c.lineTo(f.x2,f.y2);c.lineTo(...b);c.lineTo(...a);c.closePath();c.fill();
                    c.strokeStyle=T.brass;c.lineWidth=1.5;c.stroke();
                    // Recessed panels with brass uprights, batched on each face.
                    const count=Math.max(1,Math.floor(Math.hypot(f.x2-f.x1,f.y2-f.y1)/48));
                    c.strokeStyle='#b08b60';c.lineWidth=2;c.beginPath();
                    for(let i=1;i<count;i++){
                        const u=i/count,x=f.x1+(f.x2-f.x1)*u,y=f.y1+(f.y2-f.y1)*u,q=P(x,y);
                        c.moveTo(x,y);c.lineTo(...q);
                    }c.stroke();
                }
                c.restore();
                this._layer(c,'biggs_roof',-8,-8,466,416,p=>this._roof(p,false),k);
            }
            _roof(p,glow) {
                const x=this.x,y=this.y,T=BIGGS,B=BiggsArt.box;
                if(!glow){
                    B(p,x,y,450,250,T.wine,T.brass,7);
                    // Radial canvas panels, shaded toward the eaves, with a raised central lantern.
                    p.save();p.beginPath();p.roundRect(x+6,y+6,438,238,4);p.clip();
                    const edges=[];
                    for(let xx=0;xx<=450;xx+=37.5)edges.push([xx,0]);
                    for(let yy=31.25;yy<=250;yy+=31.25)edges.push([450,yy]);
                    for(let xx=412.5;xx>=0;xx-=37.5)edges.push([xx,250]);
                    for(let yy=218.75;yy>=0;yy-=31.25)edges.push([0,yy]);
                    for(let i=0;i<edges.length;i++){
                        const a=edges[i],b=edges[(i+1)%edges.length];p.fillStyle=i%2?T.wine:T.cream;
                        p.beginPath();p.moveTo(x+225,y+125);p.lineTo(x+a[0],y+a[1]);p.lineTo(x+b[0],y+b[1]);p.closePath();p.fill();
                    }
                    const g=p.createRadialGradient(x+208,y+108,12,x+225,y+125,235);
                    g.addColorStop(0,'rgba(255,238,206,.24)');g.addColorStop(.45,'rgba(36,10,20,.12)');g.addColorStop(1,'rgba(20,7,18,.64)');
                    p.fillStyle=g;p.fillRect(x,y,450,250);p.restore();
                    B(p,x+51,y+250,348,149,'#3e2530',T.brass,5);
                    for(let yy=266;yy<390;yy+=13){p.fillStyle=yy%2?'#502733':'#47232e';p.fillRect(x+58,y+yy,334,5);}
                    B(p,x+172,y+78,106,94,'#311d29',T.brass,20);
                    B(p,x+181,y+85,88,70,'#314952','#d1ad75',18);
                    p.strokeStyle='rgba(223,244,234,.25)';p.beginPath();p.moveTo(x+190,y+96);p.lineTo(x+251,y+96);p.lineTo(x+263,y+117);p.stroke();
                    BiggsArt.star(p,x+225,y+120,24,T.brass);
                    B(p,x+85,y+289,280,84,'#1f1821',T.brass,13);
                    B(p,x+91,y+295,268,72,null,'#8e5b59',10);
                }
                // Matching warm incandescent perimeter and script signage, without live shadowBlur.
                p.fillStyle=glow?'#ffe4ac':'#c7a377';p.beginPath();
                for(let xx=16;xx<450;xx+=19){p.moveTo(x+xx+1.8,y+10);p.arc(x+xx,y+10,1.8,0,Math.PI*2);p.moveTo(x+xx+1.8,y+239);p.arc(x+xx,y+239,1.8,0,Math.PI*2);}
                for(let yy=29;yy<235;yy+=19)for(const xx of [10,440]){p.moveTo(x+xx+1.8,y+yy);p.arc(x+xx,y+yy,1.8,0,Math.PI*2);}p.fill();
                BiggsArt.title(p,'Biggs',x+225,y+324,46,glow?'#ffe2ad':T.cream,true);
                BiggsArt.title(p,'A M U S E M E N T   P A R K',x+225,y+354,8,glow?'#eec8ac':T.brass);
                for(const dx of [110,340])BiggsArt.star(p,x+dx,y+326,8,glow?'#f5c381':T.brass);
            }
            drawEmissive(c,dark,beamsOnly) {
                if(beamsOnly||dark<=0)return;
                c.save();c.globalAlpha*=dark*.8;
                this._layer(c,'biggs_glow',-8,-8,466,416,p=>this._roof(p,true),this._k());c.restore();
            }
            drawSign() {} // The marquee is part of the roof's cached plane.
        }
