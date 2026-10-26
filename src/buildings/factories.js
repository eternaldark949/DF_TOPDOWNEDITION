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
            stone: '#a04d72', stoneLo: '#6e2f4c', steel: '#1c2028', gold: '#d0ac72',
            goldHi: '#f3ddb0', glass: '#352d30', warm: '#ffd392', rose: '#d96896'
        };
        const ENNI_HERO = 2;
        const ENNI_FONT_READY = () => { try { return !document.fonts || document.fonts.check('12px Anthropology'); } catch (e) { return true; } };
        Object.assign(BuildingV2.prototype, {
            _ecH() { return Math.min(this.floors, CONFIG.BUILDINGS.MAX_FLOORS) * CONFIG.BUILDINGS.FLOOR_HEIGHT; },
            // Enni Cole leans twice as hard as the street (ENNI_HERO), so its storefronts show as tall as a real
            // store's; its hull (culling) leans with it.
            _ecK(z) { return CONFIG.BUILDINGS.LEAN ? 1 + (LandmarkKit.k(z) - 1) * ENNI_HERO : 1; },
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
                for (const dx of [200, 700]) this.attachedLights.push(new LampEntity({
                    x: this.x + dx, y: this.y + 615, lampType: 3, color: '#f4c88b', lightRadius: 135
                }));
            },
            _ecDrawBase(ctx) {
                const K = LandmarkKit;
                const sprite = K.sprite(this, 'ec_ground', this.x - 16, this.y - 12, 932, 784, 1, c => {
                    const x = this.x, y = this.y, T = ENNI_EXTERIOR;
                    for (const s of this.sections) { c.fillStyle = 'rgba(0,0,0,.43)'; c.fillRect(x+s.x+18,y+s.y+18,s.w,s.h); }
                    // The entry steps and the clipped cypresses either side of the door, as in the photo.
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
                    }
                    // The atrium's glass over the lobby and its chandelier, lanterns over the two wings
                    glass(x+300,y+40,300,490,3,2);
                    glass(x+40,y+50,220,470,3,2);glass(x+640,y+50,220,470,3,2);
                    // The curved-glass showroom on top of the entrance bay: gowns lit inside, tiny lights overhead
                    const bx=x+332,by=y+606,bw=236,bh=86,R=[0,0,40,40];
                    c.save();c.beginPath();c.roundRect(bx,by,bw,bh,R);c.clip();
                    if(!emissive){const g=c.createLinearGradient(bx,by,bx,by+bh);g.addColorStop(0,'#2b2730');g.addColorStop(1,'#4a3a33');c.fillStyle=g;c.fillRect(bx,by,bw,bh);}
                    else{c.fillStyle='rgba(255,196,120,.22)';c.fillRect(bx,by,bw,bh);}
                    for(let i=0;i<7;i++){const mx=bx+24+i*31,my=by+50+Math.sin(i/6*Math.PI)*12;
                        c.fillStyle=emissive?'rgba(255,214,150,.55)':['#e9d3a6','#1c1a1f','#b0475f','#f3ece0','#2f5a4d','#7b3fa0','#e9d3a6'][i];c.beginPath();c.arc(mx,my,7,0,Math.PI*2);c.fill();
                        if(!emissive){c.fillStyle='#efe4d6';c.beginPath();c.arc(mx,my-2,2.4,0,Math.PI*2);c.fill();}}
                    c.fillStyle=emissive?'#fff2cf':'#d9b77a';for(let i=0;i<34;i++){const px=bx+8+(i*53%220),py=by+6+(i*29%70);c.fillRect(px,py,emissive?1.6:1,emissive?1.6:1);}
                    if(!emissive){c.strokeStyle='rgba(29,32,40,.9)';c.lineWidth=2;c.beginPath();for(let i=1;i<8;i++){c.moveTo(bx+bw*i/8,by);c.lineTo(bx+bw*i/8,by+bh);}c.stroke();}
                    c.restore();
                    c.beginPath();c.roundRect(bx,by,bw,bh,R);c.lineWidth=emissive?1:3;c.strokeStyle=emissive?'rgba(237,187,123,.4)':T.steel;c.stroke();
                    if(!emissive){c.beginPath();c.roundRect(bx+3,by+3,bw-6,bh-6,[0,0,37,37]);c.lineWidth=1;c.strokeStyle='rgba(208,172,114,.7)';c.stroke();
                        // brass rules either side of the roof's wordmark
                        c.strokeStyle='rgba(208,172,114,.40)';c.lineWidth=.8;c.beginPath();c.moveTo(x+250,y+566);c.lineTo(x+349,y+566);c.moveTo(x+551,y+566);c.lineTo(x+650,y+566);c.stroke();
                    }
                });
            },
            /**
             * One face of the store, as in the photo: rose stone to the cornice (rusticated, pilasters, tall display
             * windows, script panels), black steel and glass over it, the portal on the entrance bay. Each face is
             * painted once at full detail (lit and unlit) and mapped onto its leaning quad in tiles, so the detail
             * costs a few dozen drawImages a frame however fine it is (the lean is perspective in z, so tiles in z too).
             */
            _ecFace(ctx, f, emissive=false) {
                const H=this._ecH(),L=Math.hypot(f.x2-f.x1,f.y2-f.y1),S=2;
                const key=`${f.x1|0},${f.y1|0},${f.x2|0},${f.y2|0}`,store=this._ecTex||(this._ecTex={});
                // (the script signs wait for their webfont: until it's in, the face is painted again rather than kept)
                let art=store[key];if(!art||art.fontless&&!(art.fontless=!ENNI_FONT_READY()))art=store[key]=this._ecFaceArt(f,L,H,S);
                const tex=art[emissive?'lit':'day'];
                const P=(u,z)=>this._ecP(f.x1+(f.x2-f.x1)*u,f.y1+(f.y2-f.y1)*u,z);
                const nu=Math.max(2,Math.ceil(L/70)),ZS=[0,H*.18,H*.36,H*.55,H*.72,H*.86,H];
                for(let j=0;j<ZS.length-1;j++)for(let i=0;i<nu;i++){
                    const u0=i/nu,u1=(i+1)/nu,z0=ZS[j],z1=ZS[j+1];
                    const a=P(u0,z0),b=P(u1,z0),d=P(u0,z1);
                    const sx=u0*L*S,sw=Math.min(tex.width-sx,(u1-u0)*L*S+1),sy=(H-z1)*S,sh=Math.min(tex.height-sy,(z1-z0)*S+1);
                    ctx.save();ctx.transform((b[0]-a[0])/((u1-u0)*L*S),(b[1]-a[1])/((u1-u0)*L*S),(a[0]-d[0])/((z1-z0)*S),(a[1]-d[1])/((z1-z0)*S),d[0],d[1]);
                    ctx.drawImage(tex,sx,sy,sw,sh,0,0,sw,sh);ctx.restore();
                }
            },
            /** A face's art, unlit and lit: x along the face (0..L), y down from the roof (0) to the street (H). */
            _ecFaceArt(f,L,H,S) {
                const T=ENNI_EXTERIOR,entrance=f.side==='S'&&Math.abs(f.y1-(this.y+700))<1;
                const bay=this.sections[1],bayFace=!entrance&&(f.side==='E'||f.side==='W')&&f.y1>=this.y+600-1&&f.y2>=this.y+600-1;
                const r=seededRandom(((f.x1*7+f.y1*13)|0)+911);
                const mk=()=>{const cv=document.createElement('canvas');cv.width=Math.ceil(L*S);cv.height=Math.ceil(H*S);const c=cv.getContext('2d');c.scale(S,S);return [cv,c];};
                const [dcv,d]=mk(),[lcv,l]=mk();
                const portal=entrance||bayFace,G=portal?H*.22:H*.45;                                 // the cornice's line (y): the portal rises higher
                const script=(c,str,x,y,size,col)=>{c.save();c.textAlign='center';c.textBaseline='middle';c.font=`${size}px Anthropology, "Great Vibes", "URW Chancery L", "Z003", cursive`;c.fillStyle=col;c.fillText(str,x,y);c.restore();};
                // ── over the cornice: black steel and glass (the portal's crown: the curved showroom's glass) ──
                {const g=d.createLinearGradient(0,0,0,G);g.addColorStop(0,'#15161c');g.addColorStop(1,'#20212a');d.fillStyle=g;d.fillRect(0,0,L,G);
                    const n=Math.max(1,Math.round(L/30)),pw=L/n;
                    for(let i=0;i<n;i++){const X=i*pw+2.2,W=pw-4.4,Y=4,Hh=G-7;
                        const gg=d.createLinearGradient(X,Y,X+W,Y+Hh);gg.addColorStop(0,'#2b2a33');gg.addColorStop(.5,'#3a3036');gg.addColorStop(1,'#24252d');d.fillStyle=gg;d.fillRect(X,Y,W,Hh);
                        d.fillStyle='rgba(214,160,104,.13)';d.fillRect(X,Y+Hh*.55,W,Hh*.45);                        // the warm floor inside
                        d.fillStyle='rgba(205,222,236,.10)';d.beginPath();d.moveTo(X,Y);d.lineTo(X+W*.45,Y);d.lineTo(X,Y+Hh*.7);d.fill();
                        for(let k=0;k<2;k++){const mx=X+W*(.3+k*.42),my=Y+Hh*.62;if(r()<.6){d.fillStyle='rgba(20,16,20,.7)';d.beginPath();d.ellipse(mx,my,1.6,4.2,0,0,Math.PI*2);d.fill();d.beginPath();d.arc(mx,my-5,1.1,0,Math.PI*2);d.fill();}}
                        // lit: the glass glows amber, a ceiling of tiny lights, the forms in silhouette against it
                        const lg=l.createLinearGradient(X,Y,X,Y+Hh);lg.addColorStop(0,'rgba(255,196,118,.30)');lg.addColorStop(1,'rgba(255,170,92,.55)');l.fillStyle=lg;l.fillRect(X,Y,W,Hh);
                        for(let k=0;k<5;k++){const px=X+1+r()*(W-2),py=Y+1+r()*Hh*.45;l.fillStyle='rgba(255,236,190,.95)';l.fillRect(px,py,.7,.7);l.fillStyle='rgba(255,220,160,.25)';l.beginPath();l.arc(px+.35,py+.35,1.8,0,Math.PI*2);l.fill();}
                    }
                    // the steel fins, a champagne edge on each; a transom at the floor line; the parapet
                    for(let i=0;i<=n;i++){const X=i*pw;d.fillStyle='#0f1015';d.fillRect(X-2.2,0,4.4,G);d.fillStyle='rgba(208,172,114,.55)';d.fillRect(X-2.2,0,.6,G);}
                    d.fillStyle='#0f1015';d.fillRect(0,G*.48,L,1.6);d.fillStyle='rgba(208,172,114,.35)';d.fillRect(0,G*.48,L,.4);
                    d.fillStyle='#0c0d11';d.fillRect(0,0,L,3.5);d.fillStyle=T.gold;d.fillRect(0,3.2,L,.6);
                }
                // ── the stone: rose, rusticated, lit from below ──
                {const g=d.createLinearGradient(0,G,0,H);g.addColorStop(0,'#b25a82');g.addColorStop(1,'#93456a');d.fillStyle=g;d.fillRect(0,G,L,H-G);
                    d.strokeStyle='rgba(70,22,44,.28)';d.lineWidth=.35;
                    for(let y=G+8,k=0;y<H-3;y+=4.2,k++){d.beginPath();d.moveTo(0,y);d.lineTo(L,y);d.stroke();for(let x=(k%2)*6;x<L;x+=12){d.beginPath();d.moveTo(x,y);d.lineTo(x,y+4.2);d.stroke();}}
                    d.fillStyle='rgba(255,220,235,.05)';for(let i=0;i<L*(H-G)/30;i++)d.fillRect(r()*L,G+r()*(H-G),.6,.6);
                    d.fillStyle='#5a2440';d.fillRect(0,H-3.5,L,3.5);d.fillStyle='rgba(208,172,114,.6)';d.fillRect(0,H-3.5,L,.4);   // the plinth
                }
                // the bays: pilasters, and between them tall display windows or a script panel
                const n=entrance?1:Math.max(1,Math.round(L/(portal?34:42))),bw=L/n,pier=Math.min(7,bw*.16);
                for(let i=0;i<n;i++){
                    const X0=i*bw+pier,X1=(i+1)*bw-pier,W=X1-X0,top=G+9,bot=H-4;
                    if(entrance){                                                                               // the portal's arch over the doors
                        const cx=L/2,aw=Math.min(L*.3,30),spring=G+(H-G)*.58,rad=aw;
                        script(d,'Enni Cole',cx,G+9,14,T.goldHi);script(l,'Enni Cole',cx,G+9,14,'rgba(255,226,170,1)');
                        for(const c of [d,l]){c.save();c.beginPath();c.moveTo(cx-aw,bot);c.lineTo(cx-aw,spring);c.arc(cx,spring,rad,Math.PI,0);c.lineTo(cx+aw,bot);c.closePath();
                            if(c===d){c.fillStyle='#3a2a26';c.fill();c.lineWidth=2.2;c.strokeStyle='#d7a7bb';c.stroke();c.lineWidth=.8;c.strokeStyle=T.gold;c.stroke();}
                            else{const lg=c.createLinearGradient(0,spring-rad,0,bot);lg.addColorStop(0,'rgba(255,214,140,.65)');lg.addColorStop(1,'rgba(255,186,104,.9)');c.fillStyle=lg;c.fill();}
                            c.clip();c.strokeStyle=c===d?'#1b1a20':'rgba(60,30,20,.6)';c.lineWidth=1;c.beginPath();
                            for(let k=-3;k<=3;k++){c.moveTo(cx+k*aw/3.5,spring-rad);c.lineTo(cx+k*aw/3.5,bot);}c.moveTo(cx-aw,spring);c.lineTo(cx+aw,spring);c.moveTo(cx-aw,bot-14);c.lineTo(cx+aw,bot-14);c.stroke();
                            c.restore();}
                        // the chandelier glimpsed through it; the keystone
                        for(let k=0;k<9;k++){const a=k/8*Math.PI,px=L/2+Math.cos(a)*10,py=spring+4+Math.sin(a)*3;l.fillStyle='#fff2cf';l.fillRect(px-.4,py-.4,.9,.9);d.fillStyle='#d9b77a';d.fillRect(px-.3,py-.3,.6,.6);}
                        d.fillStyle='#c97ea0';d.fillRect(L/2-2.5,spring-rad-3,5,5);
                        continue;
                    }
                    const panel=!portal&&n>=5&&(i===1||i===n-2);
                    if(panel){                                                                                  // a recessed panel with the name in script
                        d.fillStyle='#8a3d62';d.fillRect(X0+2,top+2,W-4,bot-top-6);d.strokeStyle='rgba(230,180,205,.5)';d.lineWidth=.6;d.strokeRect(X0+3.5,top+3.5,W-7,bot-top-9);
                        const cy=(top+bot)/2;script(d,'Enni',(X0+X1)/2,cy-6,11,T.goldHi);script(d,'Cole',(X0+X1)/2,cy+7,11,T.goldHi);
                        script(l,'Enni',(X0+X1)/2,cy-6,11,'rgba(255,226,170,1)');script(l,'Cole',(X0+X1)/2,cy+7,11,'rgba(255,226,170,1)');
                        continue;
                    }
                    // the window: bronze frame, a transom, forms and a lamp inside
                    d.fillStyle='#6b4733';d.fillRect(X0,top,W,bot-top);
                    const gg=d.createLinearGradient(X0,top,X1,bot);gg.addColorStop(0,'#3c3234');gg.addColorStop(1,'#4b3a30');d.fillStyle=gg;d.fillRect(X0+1.2,top+1.2,W-2.4,bot-top-2.4);
                    const tr=top+(bot-top)*.28;d.fillStyle='#2a2226';d.fillRect(X0,tr,W,1.2);d.fillRect((X0+X1)/2-.5,tr,1,bot-tr);
                    d.fillStyle='rgba(221,231,237,.16)';d.fillRect(X0+2,top+2,1.2,bot-top-4);
                    const lg=l.createLinearGradient(0,top,0,bot);lg.addColorStop(0,'rgba(255,214,140,.55)');lg.addColorStop(1,'rgba(255,184,100,.85)');l.fillStyle=lg;l.fillRect(X0+1.2,top+1.2,W-2.4,bot-top-2.4);
                    for(let k=0;k<2;k++){const mx=X0+W*(.3+k*.4),my=bot-9;for(const c of [d,l]){c.fillStyle=c===d?'rgba(25,18,22,.75)':'rgba(70,30,30,.55)';c.beginPath();c.ellipse(mx,my,2.2,6,0,0,Math.PI*2);c.fill();c.beginPath();c.arc(mx,my-7.5,1.4,0,Math.PI*2);c.fill();}}
                    l.fillStyle='#fff2cf';l.beginPath();l.arc((X0+X1)/2,top+(tr-top)*.5,1,0,Math.PI*2);l.fill();
                    // the hood over it, bronze
                    d.fillStyle='#c27097';d.fillRect(X0-1.5,top-3,W+3,2.4);d.fillStyle=T.gold;d.fillRect(X0-1.5,top-.8,W+3,.5);
                }
                // pilasters with capitals and bases; rose uplight washing each, a sconce glow
                for(let i=0;i<=n;i++){const X=Math.max(0,Math.min(L-pier*2,i*bw-pier));
                    if(entrance&&i>0&&i<n)continue;
                    d.fillStyle='#b8648b';d.fillRect(X,G+4,pier*2,H-G-7);d.fillStyle='rgba(255,235,245,.12)';d.fillRect(X+.6,G+4,1,H-G-7);d.fillStyle='rgba(60,15,35,.3)';d.fillRect(X+pier*2-1,G+4,1,H-G-7);
                    d.fillStyle='#cf86a8';d.fillRect(X-1,G+4,pier*2+2,2.6);d.fillStyle='#7a3256';d.fillRect(X-1,H-7,pier*2+2,3);
                    const ug=l.createLinearGradient(0,H,0,G+4);ug.addColorStop(0,'rgba(255,120,175,.85)');ug.addColorStop(.6,'rgba(240,90,150,.28)');ug.addColorStop(1,'rgba(240,90,150,0)');
                    l.fillStyle=ug;l.beginPath();l.moveTo(X+pier-2,H);l.lineTo(X-6,G+4);l.lineTo(X+pier*2+6,G+4);l.lineTo(X+pier+2,H);l.closePath();l.fill();
                    l.fillStyle='rgba(255,250,240,.9)';l.fillRect(X+pier-1,H-4,2,1.2);
                }
                // the cornice: a moulded band, dentils, bronze
                {const Y=G;d.fillStyle='#c97ea0';d.fillRect(0,Y,L,4.5);d.fillStyle='#e0a2bd';d.fillRect(0,Y,L,1);d.fillStyle='#7a3256';for(let x=1;x<L;x+=2.6)d.fillRect(x,Y+2.6,1.3,1.3);
                    d.fillStyle=T.gold;d.fillRect(0,Y+4.5,L,.6);d.fillStyle='rgba(40,8,24,.4)';d.fillRect(0,Y+5.1,L,2);
                    l.fillStyle='rgba(255,170,205,.35)';l.fillRect(0,Y,L,4.5);}
                return { day: dcv, lit: lcv, fontless: !ENNI_FONT_READY() };
            },
            _ecWordmark(ctx, emissive=false) {
                LandmarkKit.flat(ctx,this._ecK(this._ecH()),c=>{
                    c.textAlign='center';c.textBaseline='middle';
                    c.font='35px "Great Vibes", "URW Chancery L", "Z003", cursive';
                    c.fillStyle=emissive?'rgba(255,230,173,.88)':ENNI_EXTERIOR.goldHi;
                    c.fillText('Enni Cole',this.x+450,this.y+566);
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
                    if(!emissive){c.font='6.2px Montserrat, sans-serif';c.fillStyle='#bba889';c.fillText('F A S H I O N  ·  F O O D  ·  H O M E  ·  T E C H',cx,sy+33);}
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

        /** Enni Cole luxury department store: one block of rose stone and dark glass, the arched entrance bay
            stepping out from the middle of its front, the curved-glass showroom on top of it (as in the photo). */
        function createEnniCole(x, y, config = {}) {
            const b = new BuildingV2({
                id: 'enni_cole', x, y, label: 'Enni Cole', type: 'shopping', style: 'enni_cole', floors: 12,   // two store floors, each as tall as four flats'
                sections: [
                    { x: 0, y: 0, w: 900, h: 600 },
                    { x: 320, y: 600, w: 260, h: 100 }
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
            const hull = b._hullK;
            b._hullK = function () { return Math.max(hull.call(this), this._ecK(this._ecH() + CONFIG.CULLING.LEAN_EXTRA * CONFIG.BUILDINGS.FLOOR_HEIGHT)); };
            return b;
        }

        /** The Cozy Cafe: a brick corner house with a shingled hip roof, the hearth's chimney, a roof terrace with
            parasols and string lights, striped awnings and a signboard over the door (buildings/cozy-cafe.js). */
        function createCozyCafe(x, y, config = {}) {
            return new BuildingV2({
                id: 'cozy_cafe', x, y, label: 'Cozy Cafe', type: 'cafe', style: 'cozy_cafe', floors: 3,
                sections: [
                    { x: 0, y: 0, w: 350, h: 350 },
                ],
                roofColor: '#4a3028', roofLightColor: '#5a3a30',
                wallColor: '#6a3426', wallLightColor: '#7d4130', accentColor: '#ffaa00',
                windowColor: '#2a1b14', windowLitColor: '#ffe0a0', windowFrameColor: '#efdcb6',
                balconyColor: '#3e2723', balconies: [],
                sign: { text: 'Cozy Cafe', color: '#ffaa00', size: 28 },
                door: { target: config.doorTarget || 'cozy_cafe_interior', label: 'Enter Cafe', lightColor: null },   // (lit by _ccLights)
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
            return new NeuralSystemsBuilding({
                id: 'neural_sys',
                x: x,
                y: y,
                label: 'Neural Systems',
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
            return new TorqueAutoBuilding({                // its art: buildings/torque-auto.js
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

