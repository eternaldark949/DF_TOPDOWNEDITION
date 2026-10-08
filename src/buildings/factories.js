        function createSilverQueenApartments(x, y, config = {}) {
            return new BuildingV2({
                id: 'silver_queen',
                x: x,
                y: y,
                label: 'Silver Queen Apts',
                type: 'apartment',
                style: 'silver_queen',
                floors: 18,
                
                // L-shaped building - ENLARGED for imposing presence
                sections: [
                    { x: 0, y: 0, w: 700, h: 500 },      // Main block (north) - large
                    { x: 0, y: 500, w: 350, h: 380 },    // South wing (left)
                ],
                
                // Larger skylights for bigger building
                windowWidth: 14,
                windowHeight: 18,
                windowSpacingX: 32,
                windowSpacingY: 28,
                windowMarginX: 25,
                windowMarginY: 20,
                
                // Colors - from the silver_queen_exp editor design: lavender roof, indigo body, violet neon
                roofColor: '#7664ce',
                roofLightColor: '#9a8ae0',
                wallColor: '#2d1d59',
                wallLightColor: '#3a2870',
                accentColor: '#8142ff',
                windowColor: '#17005c',
                windowLitColor: '#ffc870',
                balconyColor: '#2a2535',
                
                // More balconies spread across the larger facade
                balconies: [
                    // Main block balconies
                    { section: 0, side: 'south', startX: 80, width: 80, floors: [1, 3, 5, 7, 9] },
                    { section: 0, side: 'south', startX: 200, width: 80, floors: [2, 4, 6, 8, 10] },
                    { section: 0, side: 'south', startX: 320, width: 80, floors: [1, 3, 5, 7, 9] },
                    { section: 0, side: 'south', startX: 440, width: 80, floors: [2, 4, 6, 8, 10] },
                    { section: 0, side: 'south', startX: 560, width: 80, floors: [1, 3, 5, 7, 9] },
                    // South wing balconies
                    { section: 1, side: 'south', startX: 50, width: 100, floors: [2, 4, 6, 8] },
                    { section: 1, side: 'south', startX: 180, width: 100, floors: [1, 3, 5, 7] },
                ],
                
                // Attachments
                sign: { text: 'Silver Queen', color: '#8142ff', size: 32 },
                door: {
                    target: config.doorTarget || 'apt_949',
                    label: 'Enter Apartment', 
                    lightColor: '#9900ff' 
                },
                
                ...config
            });
        }
        
        // Enni Cole: rose stone, champagne brass and warm glass. Static detail is baked once;
        // visible wall quads share the landmark camera projection and never advance simulation.
        const ENNI_EXTERIOR = {
            stone: '#71354d', stoneLo: '#422031', steel: '#1c2028', gold: '#d0ac72',
            goldHi: '#f3ddb0', glass: '#352d30', warm: '#ffd392', rose: '#d96896'
        };
        Object.assign(BuildingV2.prototype, {
            _ecH() { return Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT; },
            _ecK(z) { return CONFIG.BUILDINGS.LEAN ? LandmarkKit.k(z) : 1; },
            _ecP(x, y, z) {
                const k = this._ecK(z), cam = game.camera;
                return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
            },
            _ecVisible() {
                return CONFIG.BUILDINGS.LEAN ? this._visibleFaces(game.camera) : [];
            },
            _ecLights() {
                const t = this.attachedTransition, cx = t.x + t.w / 2, cy = t.y - 10;
                // Six small, fixed lights replace the old all-edge pink wash.
                for (const [dx, dy, color, radius] of [
                    [-85, -12, '#dd79a2', 130], [85, -12, '#dd79a2', 130],
                    [-44, 14, '#ffd69a', 135], [44, 14, '#ffd69a', 135]
                ]) this.attachedLights.push(new LampEntity({ x: cx + dx, y: cy + dy, lampType: 3, color, lightRadius: radius }));
                for (const dx of [330, 690]) this.attachedLights.push(new LampEntity({
                    x: this.x + dx, y: this.y + 284, lampType: 3, color: '#f4c88b', lightRadius: 135
                }));
            },
            _ecDrawBase(ctx) {
                const K = LandmarkKit;
                const sprite = K.sprite(this, 'ec_ground', this.x - 16, this.y - 12, 932, 784, 1, c => {
                    const x = this.x, y = this.y, T = ENNI_EXTERIOR;
                    for (const s of this.sections) { c.fillStyle = 'rgba(0,0,0,.43)'; c.fillRect(x+s.x+18,y+s.y+18,s.w,s.h); }
                    // Inset stone courtyard and a small entry apron leave the existing pedestrian paths clear.
                    c.fillStyle = '#30272e'; c.fillRect(x+252,y+283,396,414);
                    c.strokeStyle = 'rgba(211,178,135,.14)'; c.lineWidth = 1; c.beginPath();
                    for(let gx=270;gx<648;gx+=54){c.moveTo(x+gx,y+286);c.lineTo(x+gx,y+697);}
                    for(let gy=300;gy<697;gy+=54){c.moveTo(x+254,y+gy);c.lineTo(x+646,y+gy);}c.stroke();
                    const t = this.attachedTransition, cx=t.x+t.w/2, yy=t.y-10;
                    c.fillStyle='#61515a';c.beginPath();c.roundRect(cx-116,yy-5,232,54,[5,5,16,16]);c.fill();
                    c.strokeStyle='rgba(208,172,114,.55)';c.lineWidth=1;c.stroke();
                    for(const sy of [13,29,45]){c.strokeStyle='rgba(211,185,151,.28)';c.beginPath();c.moveTo(cx-112,yy+sy);c.lineTo(cx+112,yy+sy);c.stroke();}
                    for(const dx of [-128,128]){
                        const px=cx+dx,py=yy+24;
                        c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(px+4,py+5,19,15,0,0,Math.PI*2);c.fill();
                        const gold=c.createLinearGradient(px-15,py,px+15,py);gold.addColorStop(0,'#58432c');gold.addColorStop(.45,T.gold);gold.addColorStop(1,'#755539');
                        c.fillStyle=gold;c.beginPath();c.ellipse(px,py,16,12,0,0,Math.PI*2);c.fill();
                        c.strokeStyle=T.goldHi;c.lineWidth=1;c.stroke();
                        const green=c.createRadialGradient(px-5,py-5,2,px,py,18);green.addColorStop(0,'#547654');green.addColorStop(.65,'#294b36');green.addColorStop(1,'#152b23');
                        c.fillStyle=green;c.beginPath();c.ellipse(px,py-3,14,17,0,0,Math.PI*2);c.fill();
                        c.fillStyle='rgba(124,159,103,.24)';for(let j=0;j<11;j++){const a=j*2.4,rr=3+j%4*2;c.beginPath();c.arc(px+Math.cos(a)*rr,py-3+Math.sin(a)*rr,2,0,Math.PI*2);c.fill();}
                    }
                });
                ctx.drawImage(sprite.cv,sprite.x,sprite.y,sprite.w,sprite.h);
            },
            _ecRoofSprite(emissive) {
                const T=ENNI_EXTERIOR, x=this.x, y=this.y;
                return LandmarkKit.sprite(this,emissive?'ec_roof_lit':'ec_roof',x-4,y-4,908,708,1,c=>{
                    const glass=(gx,gy,w,h,rows,cols)=>{
                        c.save();c.beginPath();c.roundRect(gx,gy,w,h,22);c.clip();
                        if(!emissive){
                            const g=c.createLinearGradient(gx,gy,gx+w,gy+h);g.addColorStop(0,'#3b3439');g.addColorStop(.52,'#514034');g.addColorStop(1,'#23282d');c.fillStyle=g;c.fillRect(gx,gy,w,h);
                            // Curated displays under the glass: warm islands and precise floor lines, not bright roof floodlights.
                            c.fillStyle='rgba(195,145,91,.10)';c.fillRect(gx+8,gy+8,w-16,h-16);
                            c.strokeStyle='rgba(220,188,132,.10)';c.lineWidth=1;c.beginPath();for(let i=1;i<cols;i++){const xx=gx+w*i/cols;c.moveTo(xx,gy);c.lineTo(xx,gy+h);}for(let j=1;j<rows;j++){const yy=gy+h*j/rows;c.moveTo(gx,yy);c.lineTo(gx+w,yy);}c.stroke();
                            c.fillStyle='rgba(221,186,137,.20)';for(let i=0;i<cols;i++){c.fillRect(gx+w*(i+.18)/cols,gy+h*.23,w*.56/cols,h*.12);c.fillRect(gx+w*(i+.18)/cols,gy+h*.67,w*.56/cols,h*.10);}
                            c.fillStyle='rgba(183,193,211,.07)';c.beginPath();c.moveTo(gx,gy);c.lineTo(gx+w*.45,gy);c.lineTo(gx+w,gy+h*.82);c.lineTo(gx+w,gy+h);c.lineTo(gx+w*.77,gy+h);c.closePath();c.fill();
                        }else{
                            const g=c.createLinearGradient(gx,gy,gx,gy+h);g.addColorStop(0,'rgba(236,164,83,.08)');g.addColorStop(.5,'rgba(255,197,113,.17)');g.addColorStop(1,'rgba(255,190,98,.07)');c.fillStyle=g;c.fillRect(gx,gy,w,h);
                        }
                        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
                            const cx=gx+w*(i+.5)/cols,cy=gy+h*(j+.5)/rows;
                            if(emissive){const g=c.createRadialGradient(cx,cy,0,cx,cy,24);g.addColorStop(0,'rgba(255,210,139,.20)');g.addColorStop(1,'rgba(255,192,105,0)');c.fillStyle=g;c.fillRect(cx-24,cy-24,48,48);}
                            c.strokeStyle=emissive?'rgba(255,221,164,.75)':'rgba(181,136,83,.65)';c.lineWidth=1;c.beginPath();c.arc(cx,cy,9,0,Math.PI*2);c.stroke();
                            c.fillStyle=emissive?'#ffe9b8':'#ceaa73';for(let k=0;k<6;k++){const a=k*Math.PI/3;c.beginPath();c.arc(cx+Math.cos(a)*8,cy+Math.sin(a)*8,emissive?1.35:1.1,0,Math.PI*2);c.fill();}
                        }
                        if(!emissive){
                            c.strokeStyle='#1d2028';c.lineWidth=5;c.beginPath();for(let i=1;i<cols*2;i++){const xx=gx+w*i/(cols*2);c.moveTo(xx,gy);c.lineTo(xx,gy+h);}for(let j=1;j<rows*2;j++){const yy=gy+h*j/(rows*2);c.moveTo(gx,yy);c.lineTo(gx+w,yy);}c.stroke();
                            c.strokeStyle='rgba(221,197,153,.20)';c.lineWidth=.8;c.stroke();
                        }
                        c.restore();
                        c.beginPath();c.roundRect(gx,gy,w,h,22);c.lineWidth=emissive?1:4;c.strokeStyle=emissive?'rgba(237,187,123,.30)':T.steel;c.stroke();
                        if(!emissive){c.beginPath();c.roundRect(gx+3,gy+3,w-6,h-6,19);c.lineWidth=1;c.strokeStyle='rgba(208,172,114,.62)';c.stroke();}
                    };
                    if(!emissive){
                        for(const s of this.sections){
                            const sx=x+s.x,sy=y+s.y;
                            const g=c.createLinearGradient(sx,sy,sx+s.w,sy+s.h);g.addColorStop(0,'#382934');g.addColorStop(.45,'#2d242c');g.addColorStop(1,'#201e27');c.fillStyle=g;c.fillRect(sx,sy,s.w,s.h);
                            c.strokeStyle='rgba(143,86,107,.24)';c.lineWidth=1;c.beginPath();for(let k=28;k<s.h;k+=45){c.moveTo(sx+7,sy+k);c.lineTo(sx+s.w-7,sy+k);}c.stroke();
                        }
                        c.strokeStyle=T.stone;c.lineWidth=8;for(const f of this._leanFaces()){c.beginPath();c.moveTo(f.x1,f.y1);c.lineTo(f.x2,f.y2);c.stroke();}
                        c.strokeStyle='rgba(230,199,153,.70)';c.lineWidth=1.4;for(const f of this._leanFaces()){c.beginPath();c.moveTo(f.x1,f.y1);c.lineTo(f.x2,f.y2);c.stroke();}
                        // A rose stone entrance cap echoes the reference's grand corner bay.
                        c.fillStyle='#663046';c.beginPath();c.roundRect(x+28,y+635,194,62,[10,10,27,27]);c.fill();
                        c.strokeStyle='rgba(214,165,130,.65)';c.lineWidth=1.5;c.stroke();
                    }
                    glass(x+54,y+37,792,202,2,6);
                    glass(x+41,y+323,168,281,3,2);glass(x+691,y+323,168,321,3,2);
                    // Roof-top brass medallion in the quiet courtyard-facing stone band.
                    if(!emissive){
                        c.strokeStyle='rgba(208,172,114,.40)';c.lineWidth=.8;c.beginPath();c.moveTo(x+280,y+261);c.lineTo(x+349,y+261);c.moveTo(x+551,y+261);c.lineTo(x+620,y+261);c.stroke();
                    }
                });
            },
            /** One face of the curtain wall. Each style's shapes on a face are gathered into one path and filled
                once (in the order they layer: stone, steel, frames, glass glow, mullions, transoms, glints, piers,
                cornice, cap); shapes of one style never overlap on a face, so it draws exactly as quad by quad did. */
            _ecFace(ctx, f, emissive=false) {
                const T=ENNI_EXTERIOR,H=this._ecH(),L=Math.hypot(f.x2-f.x1,f.y2-f.y1);
                const P=(u,z)=>this._ecP(f.x1+(f.x2-f.x1)*u,f.y1+(f.y2-f.y1)*u,z);
                const quad=(path,u0,u1,z0,z1)=>{
                    const a=P(u0,z0),b=P(u1,z0),d=P(u0,z1),e=P(u1,z1);
                    path.moveTo(a[0],a[1]);path.lineTo(b[0],b[1]);path.lineTo(e[0],e[1]);path.lineTo(d[0],d[1]);path.closePath();
                    return path;
                };
                const fill=(path,style)=>{ctx.fillStyle=style;ctx.fill(path);};
                const stroke=(path,style,width)=>{ctx.strokeStyle=style;ctx.lineWidth=width;ctx.stroke(path);};
                const entrance=f.side==='S'&&Math.abs(f.y1-(this.y+700))<1&&f.x1<this.x+250;
                const n=Math.max(2,Math.round(L/77)),pad=8/L,bands=[[4,H*.48],[H*.59,H-4]];
                if(!emissive){
                    fill(quad(new Path2D(),0,1,0,H*.55),T.stoneLo);fill(quad(new Path2D(),0,1,H*.55,H),T.steel);
                    const frames=new Path2D(),inner=new Path2D(),mull=new Path2D(),tran=new Path2D(),glint=new Path2D(),pierLo=new Path2D(),pierHi=new Path2D();
                    for(let i=0;i<n;i++){
                        const u0=i/n+pad,u1=(i+1)/n-pad;
                        for(const [z0,z1] of bands){
                            quad(frames,u0,u1,z0,z1);quad(inner,u0+.018,u1-.018,z0+1,z1-1);
                            quad(mull,(u0+u1)/2-.002,(u0+u1)/2+.002,z0,z1);
                            quad(tran,u0,u1,z0+(z1-z0)*.44,z0+(z1-z0)*.44+.65);
                            quad(glint,u0+.025,u0+.039,z0+2,z1-1);
                        }
                        quad(pierLo,i/n,i/n+pad*.58,0,H*.54);quad(pierHi,i/n,i/n+pad*.35,H*.56,H);
                    }
                    fill(frames,'#6b4733');stroke(frames,'rgba(204,158,101,.62)',1.4);fill(inner,'rgba(244,179,96,.12)');
                    fill(mull,T.steel);fill(tran,'#252127');fill(glint,'rgba(221,231,237,.19)');
                    fill(pierLo,T.stone);fill(pierHi,'#24272f');
                    const cornice=quad(new Path2D(),0,1,H*.51,H*.57);fill(cornice,'#5d303e');stroke(cornice,'rgba(211,166,112,.45)',1);
                    const cap=quad(new Path2D(),0,1,H-2,H);fill(cap,'#303039');stroke(cap,'rgba(211,175,118,.55)',.9);
                }else{
                    const glow=new Path2D(),dots=new Path2D(),up=new Path2D();
                    for(let i=0;i<n;i++){
                        const u0=i/n+pad,u1=(i+1)/n-pad;
                        for(const [z0,z1] of bands){
                            quad(glow,u0+.006,u1-.006,z0+1,z1-1);
                            const a=P((u0+u1)/2,z0+(z1-z0)*.57);dots.moveTo(a[0]+1.35,a[1]);dots.arc(a[0],a[1],1.35,0,Math.PI*2);
                        }
                    }
                    fill(glow,'rgba(255,192,108,.32)');fill(dots,'rgba(255,237,180,.85)');
                    // Deliberate rose uplight on stone piers leaves the glass warm amber.
                    for(let i=0;i<=n;i++){const u=i/n;quad(up,Math.max(0,u-.012),Math.min(1,u+.012),1,H*.50);}
                    fill(up,'rgba(225,75,129,.16)');
                }
                if(entrance&&!emissive){
                    // Arched transom: use the wall's own u/z projection rather than screen-space decoration.
                    const mid=.5,wide=.19,zbase=5,zspring=H*.26,zpeak=H*.48;
                    ctx.beginPath();ctx.moveTo(...P(mid-wide,zbase));ctx.lineTo(...P(mid+wide,zbase));ctx.lineTo(...P(mid+wide,zspring));
                    for(let i=0;i<=16;i++){const a=i*Math.PI/16;ctx.lineTo(...P(mid+Math.cos(a)*wide,zspring+Math.sin(a)*(zpeak-zspring)));}ctx.closePath();
                    ctx.fillStyle='#8b5737';ctx.fill();ctx.strokeStyle=T.gold;ctx.lineWidth=2;ctx.stroke();
                    const a=P(.5,zbase),b=P(.5,zpeak);ctx.strokeStyle='#201c22';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
                }
            },
            _ecWordmark(ctx, emissive=false) {
                LandmarkKit.flat(ctx,this._ecK(this._ecH()),c=>{
                    c.textAlign='center';c.textBaseline='middle';
                    c.font='35px "Great Vibes", "URW Chancery L", "Z003", cursive';
                    c.fillStyle=emissive?'rgba(255,230,173,.88)':ENNI_EXTERIOR.goldHi;
                    c.fillText('Enni Cole',this.x+450,this.y+263);
                });
            },
            _ecCanopy(ctx, emissive=false) {
                const t=this.attachedTransition,cx=t.x+t.w/2,sy=t.y-22,T=ENNI_EXTERIOR;
                LandmarkKit.flat(ctx,this._ecK(this._ecH()*.30),c=>{
                    c.beginPath();c.roundRect(cx-99,sy-10,198,54,[8,8,27,27]);
                    if(!emissive){
                        const g=LandmarkKit.grad(this,'ec_canopy',()=>{const q=c.createLinearGradient(cx,sy-10,cx,sy+44);q.addColorStop(0,'#20242b');q.addColorStop(1,'#0f131b');return q;});
                        c.fillStyle=g;c.fill();c.strokeStyle=T.gold;c.lineWidth=1.7;c.stroke();
                        c.beginPath();c.roundRect(cx-94,sy-5,188,43,[5,5,23,23]);c.strokeStyle='rgba(221,192,143,.28)';c.lineWidth=.8;c.stroke();
                    }else{c.strokeStyle='rgba(245,205,143,.70)';c.lineWidth=1;c.stroke();}
                    c.textAlign='center';c.textBaseline='middle';c.font='38px "Great Vibes", "URW Chancery L", "Z003", cursive';
                    c.fillStyle=emissive?'rgba(255,230,173,.96)':T.goldHi;c.fillText('Enni Cole',cx,sy+12);
                    if(!emissive){c.font='6.6px Montserrat, sans-serif';c.fillStyle='#bba889';c.fillText('G R O C E R Y   ·   H O M E   ·   T E C H',cx,sy+33);}
                });
            },
            _ecDrawTop(ctx) {
                ctx.save();
                for(const f of this._ecVisible())this._ecFace(ctx,f,false);
                LandmarkKit.drawSprite(ctx,this._ecRoofSprite(false),this._ecK(this._ecH()));
                this._ecWordmark(ctx,false);
                this._ecCanopy(ctx,false);
                ctx.restore();
            },
            _ecDrawEmissive(ctx,dark) {
                const glow=Math.max(.12,Math.min(.78,dark*.95));
                ctx.save();ctx.globalAlpha*=glow;ctx.globalCompositeOperation='lighter';
                for(const f of this._ecVisible())this._ecFace(ctx,f,true);
                LandmarkKit.drawSprite(ctx,this._ecRoofSprite(true),this._ecK(this._ecH()));
                this._ecWordmark(ctx,true);
                this._ecCanopy(ctx,true);ctx.restore();
            }
        });

        /** Enni Cole luxury department store: the original U-shaped city footprint is preserved. */
        function createEnniCole(x, y, config = {}) {
            return new BuildingV2({
                id: 'enni_cole', x, y, label: 'Enni Cole', type: 'shopping', style: 'enni_cole', floors: 6,
                sections: [
                    { x: 0, y: 0, w: 900, h: 280 },
                    { x: 0, y: 280, w: 250, h: 420 },
                    { x: 650, y: 280, w: 250, h: 420 }
                ],
                roofColor: '#2d242c', roofLightColor: '#463541',
                wallColor: '#71354d', wallLightColor: '#8b4760', accentColor: '#d0ac72',
                windowColor: '#352d30', windowLitColor: '#ffd392', windowFrameColor: '#1c2028',
                balconyColor: '#1c2028', balconies: [],
                roofProps: [{ type: 'atrium', section: 0, x: 54, y: 37, w: 792, h: 202 }],
                sign: { text: 'Enni Cole', color: '#f3ddb0', size: 38 },
                door: { target: config.doorTarget || 'enni_cole_interior', label: 'Enter Store', lightColor: null },
                ...config
            });
        }

        /**
         * Factory function to create Cozy Cafe.
         * Simple square building with warm, inviting brown and amber aesthetic.
         */
        function createCozyCafe(x, y, config = {}) {
            return new BuildingV2({
                id: 'cozy_cafe',
                x: x,
                y: y,
                label: 'Cozy Cafe',
                type: 'cafe',
                floors: 3,
                
                // Simple square cafe
                sections: [
                    { x: 0, y: 0, w: 350, h: 350 },
                ],
                
                // Cozy small windows
                windowWidth: 10,
                windowHeight: 14,
                windowSpacingX: 26,
                windowSpacingY: 22,
                windowMarginX: 18,
                windowMarginY: 12,
                
                // Colors - warm coffee house tones
                roofColor: '#4a3028',           // Warm espresso roof
                roofLightColor: '#5a3a30',      // Lighter brown highlight
                wallColor: '#382525',           // Deep mahogany walls
                wallLightColor: '#463030',      // Warm brown
                accentColor: '#ffaa00',         // Amber accent (matches lamps)
                windowColor: '#1a1208',         // Warm dark glass
                windowLitColor: '#ffe0a0',      // Warm candlelight glow
                windowFrameColor: '#2a1a0a',    // Dark wood frames
                balconyColor: '#3e2723',        // Espresso railings
                
                // Small awning over entrance
                balconies: [
                    { section: 0, side: 'south', startX: 95, width: 160, floors: [1] },
                ],
                
                // Minimal roof props
                roofProps: [
                    { type: 'vent', section: 0, x: 280, y: 40, w: 35, h: 35 },
                    { type: 'vent', section: 0, x: 40, y: 280, w: 25, h: 25 },
                ],
                
                // Attachments
                sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
                door: {
                    target: config.doorTarget || 'cozy_cafe_interior',
                    label: 'Enter Cafe',
                    lightColor: '#ffaa00'
                },
                
                ...config
            });
        }

        /**
         * Double Nights Hotel: twin crescent towers round a glass atrium (buildings/double-nights.js).
         * The sections are collision/shadow bands; the building draws its own curves.
         */
        function createDoubleNightsHotel(x, y, config = {}) {
            return new BuildingV2({
                id: 'double_nights',
                x: x,
                y: y,
                label: 'Double Nights Hotel',
                type: 'hotel',
                style: 'double_nights',
                floors: 14,
                sections: doubleNightsSections(),
                roofColor: '#1a0c14', roofLightColor: '#2a1320', wallColor: '#0e070c', wallLightColor: '#2b1422',
                accentColor: '#ffcf8a', windowColor: '#140a14', windowLitColor: '#ffd696', windowFrameColor: '#1a0f0a', balconyColor: '#2a1018',
                roofProps: [{ type: 'none' }],
                sign: { text: 'Double Nights', color: '#ff1a55', size: 32 },
                door: {
                    target: config.doorTarget || 'hotel_lobby',
                    label: 'Enter Hotel',
                    lightColor: '#ffdf80'
                },
                ...config
            });
        }

        /**
         * Factory function to create Moon City Nightclub.
         * L-shaped: main dance floor hall + side VIP lounge wing.
         * Dark magenta/neon pink aesthetic.
         */
        function createMoonCityNightclub(x, y, config = {}) {
            return new BuildingV2({
                id: 'moon_city',
                style: 'moon_city',                    // buildings/moon-city.js: lacquer, neon fins, the skylight, the canopy
                x: x,
                y: y,
                label: 'Moon City Nightclub',
                type: 'club',
                floors: 4,
                
                // L-shape: wide main hall + side VIP lounge
                sections: [
                    { x: 0, y: 0, w: 600, h: 300 },       // Main dance floor hall
                    { x: 0, y: 300, w: 280, h: 200 },      // VIP lounge wing (west)
                ],
                
                // Narrow tinted windows (club aesthetic - sparse)
                windowWidth: 8,
                windowHeight: 18,
                windowSpacingX: 50,
                windowSpacingY: 36,
                windowMarginX: 30,
                windowMarginY: 20,
                
                // Colours: the house brand (the interior's) — black lacquer, violet neon, champagne gold
                roofColor: '#120a18',
                roofLightColor: '#1a1022',
                wallColor: '#140c1a',           // black lacquer, a breath of plum
                wallLightColor: '#1a1022',
                accentColor: '#b48cff',         // violet neon (the street lamps round the block glow it too)
                windowColor: '#0c0612',         // smoked glass
                windowLitColor: '#c8a8ff',
                windowFrameColor: '#0a050a',    // Near-black frames
                balconyColor: '#1a0a1a',        // Dark purple railings
                
                // VIP entrance overhang
                balconies: [
                    { section: 0, side: 'south', startX: 200, width: 200, floors: [1] },
                ],
                
                // Minimal roof props (flat club roof)
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 500, y: 30, w: 60, h: 40 },
                    { type: 'vent', section: 0, x: 40, y: 40, w: 30, h: 25 },
                    { type: 'vent', section: 1, x: 200, y: 30, w: 25, h: 25 },
                ],
                
                // Attachments
                sign: { text: 'Moon City', color: '#c8a8ff', size: 40 },
                door: {
                    target: config.doorTarget || 'moon_city_nightclub',
                    label: 'Enter Club',
                    lightColor: '#ff3a6a'
                },
                
                ...config
            });
        }

        /**
         * Generic V2 building factories for auto-fill clusters.
         * Simple rectangular footprints with themed color palettes.
         * These replace the V1 Building fallback for apartment_small, shop_small, warehouse.
         */
        function createGenericApartment(x, y, config = {}) {
            return new BuildingV2({
                id: 'apartment_small',
                x: x,
                y: y,
                label: config.label || 'Apartments',
                type: 'apartment',
                style: 'apartment',
                floors: 6,
                
                sections: [
                    { x: 0, y: 0, w: 300, h: 250 },
                ],
                
                // Standard residential windows
                windowWidth: 10,
                windowHeight: 14,
                windowSpacingX: 28,
                windowSpacingY: 24,
                windowMarginX: 16,
                windowMarginY: 14,
                
                // Colors - muted dark residential tones
                roofColor: '#242430',           // Blue-grey roof
                roofLightColor: '#2e2e3a',      // Slightly lighter
                wallColor: '#1e1e24',           // Very dark charcoal walls
                wallLightColor: '#28282e',      // Dark blue-grey
                accentColor: '#a469ff',         // Soft purple accent
                windowColor: '#0a0a10',         // Dark glass
                windowLitColor: '#ffe8a0',      // Warm apartment light
                windowFrameColor: '#0e0e14',    // Dark frames
                balconyColor: '#1a1a22',        // Grey railings
                
                balconies: [],
                roofProps: [
                    { type: 'vent', section: 0, x: 240, y: 30, w: 30, h: 25 },
                ],
                
                sign: config.sign || { text: 'APTS', color: '#a469ff', size: 18 },
                
                ...config
            });
        }

        function createGenericShop(x, y, config = {}) {
            return new BuildingV2({
                id: 'shop_small',
                x: x,
                y: y,
                label: config.label || 'Shop',
                type: 'shop',
                floors: 2,
                
                sections: [
                    { x: 0, y: 0, w: 250, h: 200 },
                ],
                
                // Wider storefront windows
                windowWidth: 16,
                windowHeight: 12,
                windowSpacingX: 32,
                windowSpacingY: 20,
                windowMarginX: 20,
                windowMarginY: 12,
                
                // Colors - warm commercial tones
                roofColor: '#32322a',           // Warm olive-grey roof
                roofLightColor: '#3c3c34',      // Slightly lighter
                wallColor: '#26261e',           // Dark warm grey walls
                wallLightColor: '#2e2e26',      // Warm charcoal
                accentColor: '#FFF1C2',         // Warm cream accent
                windowColor: '#0a0a08',         // Dark storefront glass
                windowLitColor: '#FFF1C2',      // Warm display light
                windowFrameColor: '#0e0e0c',    // Dark frames
                balconyColor: '#252520',        // Olive railings
                
                // Small awning over entrance
                balconies: [
                    { section: 0, side: 'south', startX: 60, width: 130, floors: [1] },
                ],
                roofProps: [],
                
                sign: config.sign || { text: 'SHOP', color: '#FFF1C2', size: 16 },
                
                ...config
            });
        }

        function createGenericWarehouse(x, y, config = {}) {
            return new BuildingV2({
                id: 'warehouse',
                x: x,
                y: y,
                label: config.label || 'Warehouse',
                type: 'warehouse',
                floors: 2,
                
                sections: [
                    { x: 0, y: 0, w: 500, h: 400 },
                ],
                
                // Industrial windows (few, wide)
                windowWidth: 20,
                windowHeight: 10,
                windowSpacingX: 70,
                windowSpacingY: 50,
                windowMarginX: 40,
                windowMarginY: 30,
                
                // Colors - cold industrial grey
                roofColor: '#282828',           // Industrial grey roof
                roofLightColor: '#323232',      // Slightly lighter
                wallColor: '#202020',           // Near-black walls
                wallLightColor: '#2a2a2a',      // Dark charcoal
                accentColor: '#666666',         // Dull grey accent (no neon)
                windowColor: '#0a0a0a',         // Dark glass
                windowLitColor: '#ccccaa',      // Industrial yellow-white
                windowFrameColor: '#111111',    // Black frames
                balconyColor: '#1a1a1a',        // Grey railings
                
                balconies: [],
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 30, y: 30, w: 60, h: 45 },
                    { type: 'ac_unit', section: 0, x: 410, y: 30, w: 60, h: 45 },
                    { type: 'vent', section: 0, x: 230, y: 180, w: 40, h: 30 },
                ],
                
                sign: config.sign || null,
                
                ...config
            });
        }

        /**
         * Factory function to create Neural Systems building.
         * T-shaped tech facility: wide server wing + narrow front office.
         * Cold blue/digital theme.
         */
        function createNeuralSystems(x, y, config = {}) {
            return new BuildingV2({
                id: 'neural_sys',
                x: x,
                y: y,
                label: 'Neural Sys',
                type: 'tech',
                floors: 8,
                
                // T-shape: wide server wing at back, narrow front office
                sections: [
                    { x: 0, y: 0, w: 400, h: 200 },       // Back server wing (full width)
                    { x: 75, y: 200, w: 250, h: 200 },     // Front office (centered, narrower)
                ],
                
                // Small uniform tech windows (data center vibe)
                windowWidth: 8,
                windowHeight: 10,
                windowSpacingX: 24,
                windowSpacingY: 20,
                windowMarginX: 16,
                windowMarginY: 12,
                
                // Colors - cold digital blue theme
                roofColor: '#161630',           // Navy blue roof
                roofLightColor: '#1e1e3a',      // Slightly lighter navy
                wallColor: '#141428',           // Near-black blue walls
                wallLightColor: '#1a1a30',      // Dark blue-grey
                accentColor: '#0088ff',         // Tech blue accent
                windowColor: '#040410',         // Very dark blue glass
                windowLitColor: '#0088ff',      // Blue monitor glow
                windowFrameColor: '#060612',    // Dark frames
                balconyColor: '#0a0a18',        // Dark navy railings
                
                balconies: [],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 20, y: 20, w: 55, h: 40 },
                    { type: 'ac_unit', section: 0, x: 320, y: 20, w: 55, h: 40 },
                    { type: 'vent', section: 0, x: 180, y: 80, w: 35, h: 30 },
                    { type: 'vent', section: 1, x: 100, y: 30, w: 30, h: 25 },
                ],
                
                sign: { text: 'NEURAL', color: '#0088ff', size: 22 },
                
                door: {
                    target: config.doorTarget || 'neural_sys_interior',
                    label: 'Enter Neural Systems',
                    lightColor: '#0088ff'
                },
                
                ...config
            });
        }

        /**
         * Factory function to create Dr. Yin's Clinic.
         * L-shaped medical facility: main ward + treatment wing.
         * Dark teal/cyan medical theme.
         */
        /**
         * Factory function to create Torque Auto Shop.
         * Wide, low industrial garage with amber/orange accent.
         */
        function createTorqueAutoShop(x, y, config = {}) {
            return new BuildingV2({
                id: 'torque_auto',
                x: x,
                y: y,
                label: 'Torque Auto',
                type: 'auto_shop',
                floors: 2,
                
                // Wide garage footprint
                sections: [
                    { x: 0, y: 0, w: 500, h: 350 },       // Main garage bay
                    { x: 500, y: 50, w: 200, h: 300 },     // Showroom wing (offset)
                ],
                
                // Industrial windows
                windowWidth: 18,
                windowHeight: 12,
                windowSpacingX: 40,
                windowSpacingY: 30,
                windowMarginX: 20,
                windowMarginY: 15,
                
                // Colors — dark industrial with amber accents
                roofColor: '#1a1a14',
                roofLightColor: '#222218',
                wallColor: '#1a1814',
                wallLightColor: '#22201a',
                accentColor: '#ff8800',
                windowColor: '#1a1808',
                windowLitColor: '#ffaa00',
                windowFrameColor: '#111',
                balconyColor: '#2a2520',
                
                // Overhang above garage doors
                balconies: [
                    { section: 0, side: 'south', startX: 50, width: 400, floors: [1] },
                ],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 30, y: 30, w: 60, h: 40 },
                    { type: 'vent', section: 0, x: 350, y: 250, w: 30, h: 25 },
                    { type: 'ac_unit', section: 1, x: 80, y: 100, w: 50, h: 35 },
                ],
                
                sign: { text: 'TORQUE', color: '#ff8800', size: 36 },
                door: {
                    target: config.doorTarget || 'auto_shop',
                    label: 'Enter Auto Shop',
                    lightColor: '#ff8800'
                },
                
                ...config
            });
        }

        function createDrYinsClinic(x, y, config = {}) {
            return new BuildingV2({
                id: 'dr_yins',
                x: x,
                y: y,
                label: "Dr. Yin's",
                type: 'clinic',
                floors: 5,
                
                // L-shape: main ward + treatment wing extending east
                sections: [
                    { x: 0, y: 0, w: 250, h: 400 },       // Main ward (tall, west)
                    { x: 250, y: 150, w: 250, h: 250 },    // Treatment wing (east, offset south)
                ],
                
                // Clean medical windows
                windowWidth: 12,
                windowHeight: 16,
                windowSpacingX: 30,
                windowSpacingY: 26,
                windowMarginX: 18,
                windowMarginY: 14,
                
                // Colors - dark teal/cyan medical theme
                roofColor: '#142828',           // Teal roof
                roofLightColor: '#1a3434',      // Slightly lighter teal
                wallColor: '#142222',           // Very dark teal walls
                wallLightColor: '#182c2c',      // Dark teal
                accentColor: '#00f3ff',         // Medical cyan accent
                windowColor: '#04100f',         // Dark tinted glass
                windowLitColor: '#00f3ff',      // Cyan glow (medical equipment)
                windowFrameColor: '#060e0e',    // Dark teal frames
                balconyColor: '#0a1a1a',        // Teal railings
                
                // Entrance overhang on main ward
                balconies: [
                    { section: 0, side: 'south', startX: 50, width: 150, floors: [1] },
                ],
                
                roofProps: [
                    { type: 'ac_unit', section: 0, x: 20, y: 20, w: 50, h: 35 },
                    { type: 'ac_unit', section: 1, x: 170, y: 20, w: 50, h: 35 },
                    { type: 'vent', section: 0, x: 180, y: 340, w: 30, h: 25 },
                    { type: 'water_tank', section: 1, x: 125, y: 200, r: 25 },
                ],
                
                sign: { text: 'CLINIC', color: '#00f3ff', size: 28 },
                door: {
                    target: config.doorTarget || 'medbay_sw',
                    label: 'Enter Clinic',
                    lightColor: '#00f3ff'
                },
                
                ...config
            });
        }

