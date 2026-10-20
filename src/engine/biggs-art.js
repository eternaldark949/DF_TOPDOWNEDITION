        // Crash Royale's conductive floor and perimeter dressing are one 900px bake,
        // released with the other interior art on departure. No new simulation props.
        engineMixin({
            drawBiggsInterior(ctx) {
                const ready=!document.fonts || (document.fonts.check('24px Orbitron') && document.fonts.check('30px "Great Vibes"'));
                if(!this._biggsFloor){
                    const cv=document.createElement('canvas');cv.width=cv.height=900;
                    this._paintBiggsFloor(cv.getContext('2d'));
                    if(ready)this._biggsFloor=cv;
                    else {ctx.drawImage(cv,0,0);return;}
                }
                ctx.drawImage(this._biggsFloor,0,0);
            },
            _paintBiggsFloor(c) {
                const T=BIGGS,B=BiggsArt.box;
                B(c,0,0,900,900,'#20151e',null);
                // Warm terrazzo apron around a cool, burnished steel rink.
                B(c,60,60,780,780,'#59423e','#c09c6d',25);
                c.strokeStyle='rgba(223,193,153,.2)';c.lineWidth=1;c.beginPath();
                for(let n=80;n<840;n+=20){c.moveTo(n,60);c.lineTo(n,840);c.moveTo(60,n);c.lineTo(840,n);}c.stroke();
                B(c,92,98,716,652,'#0c111a','#b69b70',35);
                B(c,103,109,694,630,'#23303b','#7c6470',27);
                c.save();c.beginPath();c.roundRect(106,112,688,624,25);c.clip();
                const g=c.createLinearGradient(110,110,790,735);
                g.addColorStop(0,'#34444d');g.addColorStop(.42,'#1e2732');g.addColorStop(.7,'#2e3440');g.addColorStop(1,'#171f29');
                c.fillStyle=g;c.fillRect(106,112,688,624);
                // Conductive panel joints, not the generic map grid.
                c.strokeStyle='rgba(154,178,180,.13)';c.lineWidth=1;c.beginPath();
                for(let y=112,row=0;y<=736;y+=52,row++){
                    c.moveTo(106,y);c.lineTo(794,y);
                    for(let x=106+(row%2)*86;x<794;x+=172){c.moveTo(x,y);c.lineTo(x,Math.min(736,y+52));}
                }c.stroke();
                const rnd=seededRandom(8246);
                // Worn tyre arcs and subtle brushed-metal scuffs, all painted once.
                c.lineWidth=1.4;c.strokeStyle='rgba(4,8,14,.055)';c.beginPath();
                for(let i=0;i<24;i++){c.beginPath();c.ellipse(130+rnd()*630,150+rnd()*540,15+rnd()*65,8+rnd()*28,rnd()*3,rnd()*3,3.2+rnd()*2);c.stroke();}
                c.strokeStyle='rgba(220,220,208,.035)';c.lineWidth=.8;c.beginPath();
                for(let i=0;i<190;i++){const x=110+rnd()*680,y=114+rnd()*618;c.moveTo(x,y);c.lineTo(x+10+rnd()*38,y-3);}c.stroke();
                // Inlaid fairground crest, kept away from the live score HUD.
                for(const [r,col,w] of [[139,'#796052',2],[131,'#4b4246',1],[116,'#6b5750',1]]){
                    c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(450,424,r,0,Math.PI*2);c.stroke();
                }
                c.globalAlpha=.65;BiggsArt.star(c,450,410,68,'#705a4b');
                BiggsArt.title(c,'CRASH',450,416,27,'#d5bc90');
                BiggsArt.title(c,'R O Y A L E',450,451,16,'#c1a684');
                BiggsArt.title(c,'B I G G S   •   M O O N   C I T Y',450,481,7,'#b3997b');c.globalAlpha=1;
                // Muted bands read as reflections from the side-wall practicals.
                for(const x of [108,780]){
                    const sheen=c.createLinearGradient(x,0,x+12,0);sheen.addColorStop(0,'rgba(231,164,129,.16)');sheen.addColorStop(1,'rgba(231,164,129,0)');
                    c.fillStyle=sheen;c.fillRect(x,145,12,550);
                }c.restore();
                // Layered rubber rail with a chrome top lip and flush bulb housings.
                B(c,85,91,730,666,null,'#13141d',9);
                B(c,95,101,710,646,null,'#d0b78d',32);
                c.fillStyle=T.gold;c.beginPath();
                for(let x=130;x<=770;x+=32)for(const y of [87,759]){c.moveTo(x+2,y);c.arc(x,y,2,0,Math.PI*2);}
                for(let y=140;y<=710;y+=32)for(const x of [81,819]){c.moveTo(x+2,y);c.arc(x,y,2,0,Math.PI*2);}c.fill();
                // A burgundy arrival carpet and tiled threshold; the exit remains completely open.
                B(c,353,767,194,133,T.wine,T.brass,3);B(c,362,775,176,122,null,'#aa7a62',2);
                for(let row=0;row<2;row++)for(let col=0;col<10;col++)B(c,350+col*20,840+row*20,20,20,(row+col)%2?'#bdab8c':'#2b2630',null);
                BiggsArt.title(c,'Biggs',450,798,30,T.cream,true);
                BiggsArt.title(c,'AMUSEMENT PARK',450,824,8,T.brass);
                // Flush brass inlays frame the two real pillar collisions.
                for(const [x,y] of [[350,350],[510,470]]){
                    B(c,x-7,y-7,54,54,'#161820','#9a7858',8);
                    for(const dx of [-3,43])for(const dy of [-3,43]){c.fillStyle=T.gold;c.beginPath();c.arc(x+dx,y+dy,1.5,0,Math.PI*2);c.fill();}
                }
                BiggsArt.title(c,'B I G G S',450,73,16,T.cream);
                BiggsArt.star(c,325,73,7,T.brass);BiggsArt.star(c,575,73,7,T.brass);
            }
        });
